from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import sqlite3

from database import (
    get_connection,
    initialize_database
)


# =========================================================
# APPLICATION
# =========================================================

app = FastAPI(
    title="Himalaya Airlines OBS Revenue Management System",
    version="1.0"
)


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Initialize SQLite database
initialize_database()


# =========================================================
# CONSTANTS
# =========================================================

TARGET_RPP = 2.00


# Demo exchange rates.
# 1 USD = currency amount.

EXCHANGE_RATES = {
    "USD": 1.0000,
    "NPR": 135.0000,
    "GBP": 0.7900,
    "EUR": 0.9200,
    "AED": 3.6700,
    "QAR": 3.6400,
    "MYR": 4.2200,
    "THB": 32.5000,
    "INR": 83.5000,
}


CURRENCY_NAMES = {
    "USD": "US Dollar",
    "NPR": "Nepalese Rupee",
    "GBP": "British Pound",
    "EUR": "Euro",
    "AED": "UAE Dirham",
    "QAR": "Qatari Riyal",
    "MYR": "Malaysian Ringgit",
    "THB": "Thai Baht",
    "INR": "Indian Rupee",
}


# =========================================================
# MODELS
# =========================================================

class LoginRequest(BaseModel):
    employee_id: str
    password: str


class FlightCreate(BaseModel):
    flight_number: str
    flight_date: str
    aircraft: str
    origin: str
    destination: str
    passengers: int = Field(gt=0)


class SaleItem(BaseModel):
    transaction_id: str
    flight_id: int
    product_id: int
    crew_id: str
    quantity: int = Field(gt=0)
    unit_price: float = Field(ge=0)
    total_amount: float = Field(ge=0)
    payment_method: str
    transaction_time: str


# =========================================================
# HEALTH
# =========================================================

@app.get("/")
def root():

    return {
        "system": "Himalaya Airlines OBS Revenue Management System",
        "status": "running",
        "version": "1.0"
    }


@app.get("/health")
def health():

    return {
        "status": "online"
    }


# =========================================================
# LOGIN
# =========================================================

@app.post("/login")
def login(data: LoginRequest):

    connection = get_connection()

    try:

        user = connection.execute("""
            SELECT
                id,
                employee_id,
                name,
                role
            FROM users
            WHERE employee_id = ?
            AND password = ?
        """, (
            data.employee_id.strip(),
            data.password
        )).fetchone()

        if user is None:

            raise HTTPException(
                status_code=401,
                detail="Invalid Employee ID or password."
            )

        return dict(user)

    finally:

        connection.close()


# =========================================================
# PRODUCTS
# =========================================================

@app.get("/products")
def get_products():

    connection = get_connection()

    try:

        rows = connection.execute("""
            SELECT
                id,
                product_code,
                product_name,
                category,
                selling_price,
                cost
            FROM products
            ORDER BY id
        """).fetchall()

        return [dict(row) for row in rows]

    finally:

        connection.close()


# =========================================================
# FLIGHTS
# =========================================================

@app.get("/flights")
def get_flights():

    connection = get_connection()

    try:

        rows = connection.execute("""
            SELECT
                id,
                flight_number,
                flight_date,
                aircraft,
                origin,
                destination,
                passengers
            FROM flights
            ORDER BY flight_date DESC, id DESC
        """).fetchall()

        return [dict(row) for row in rows]

    finally:

        connection.close()


@app.post("/flights")
def create_flight(data: FlightCreate):

    flight_number = data.flight_number.strip().upper()
    flight_date = data.flight_date.strip()
    aircraft = data.aircraft.strip().upper()
    origin = data.origin.strip().upper()
    destination = data.destination.strip().upper()

    # -----------------------------------------------------
    # Basic validation
    # -----------------------------------------------------

    if not flight_number:

        raise HTTPException(
            status_code=400,
            detail="Flight number is required."
        )

    if not flight_date:

        raise HTTPException(
            status_code=400,
            detail="Flight date is required."
        )

    if not aircraft:

        raise HTTPException(
            status_code=400,
            detail="Aircraft is required."
        )

    if len(origin) != 3 or len(destination) != 3:

        raise HTTPException(
            status_code=400,
            detail="Origin and destination must be 3-letter airport codes."
        )

    connection = get_connection()

    try:

        cursor = connection.cursor()

        # -------------------------------------------------
        # Create flight
        # -------------------------------------------------

        cursor.execute("""
            INSERT INTO flights
            (
                flight_number,
                flight_date,
                aircraft,
                origin,
                destination,
                passengers
            )
            VALUES (?, ?, ?, ?, ?, ?)
        """, (
            flight_number,
            flight_date,
            aircraft,
            origin,
            destination,
            data.passengers
        ))

        flight_id = cursor.lastrowid

        # -------------------------------------------------
        # Default inventory
        # -------------------------------------------------

        default_inventory = {
            1: 100,
            2: 50,
            3: 30,
            4: 40,
            5: 35
        }

        products = cursor.execute("""
            SELECT id
            FROM products
            ORDER BY id
        """).fetchall()

        for product in products:

            product_id = product["id"]

            loaded = default_inventory.get(
                product_id,
                50
            )

            cursor.execute("""
                INSERT INTO inventory
                (
                    flight_id,
                    product_id,
                    loaded_quantity
                )
                VALUES (?, ?, ?)
            """, (
                flight_id,
                product_id,
                loaded
            ))

        connection.commit()

        # -------------------------------------------------
        # Return created flight
        # -------------------------------------------------

        flight = cursor.execute("""
            SELECT
                id,
                flight_number,
                flight_date,
                aircraft,
                origin,
                destination,
                passengers
            FROM flights
            WHERE id = ?
        """, (
            flight_id,
        )).fetchone()

        return dict(flight)

    except sqlite3.IntegrityError:

        connection.rollback()

        raise HTTPException(
            status_code=409,
            detail="This flight already exists for the selected date."
        )

    finally:

        connection.close()


# =========================================================
# INVENTORY
# =========================================================

@app.get("/inventory/{flight_id}")
def get_inventory(flight_id: int):

    connection = get_connection()

    try:

        rows = connection.execute("""
            SELECT

                i.id,
                i.flight_id,
                i.product_id,

                p.product_code,
                p.product_name,
                p.category,

                i.loaded_quantity,
                i.sold_quantity,
                i.returned_quantity,
                i.wasted_quantity,

                (
                    i.loaded_quantity
                    - i.sold_quantity
                    - i.returned_quantity
                    - i.wasted_quantity
                ) AS remaining_quantity

            FROM inventory i

            JOIN products p
                ON p.id = i.product_id

            WHERE i.flight_id = ?

            ORDER BY p.id
        """, (
            flight_id,
        )).fetchall()

        return [dict(row) for row in rows]

    finally:

        connection.close()


# =========================================================
# SALES
# =========================================================

@app.post("/sales")
def record_sale(data: SaleItem):

    connection = get_connection()

    try:

        cursor = connection.cursor()

        # -------------------------------------------------
        # Check flight
        # -------------------------------------------------

        flight = cursor.execute("""
            SELECT *
            FROM flights
            WHERE id = ?
        """, (
            data.flight_id,
        )).fetchone()

        if flight is None:

            raise HTTPException(
                status_code=404,
                detail="Flight not found."
            )

        # -------------------------------------------------
        # Check product
        # -------------------------------------------------

        product = cursor.execute("""
            SELECT *
            FROM products
            WHERE id = ?
        """, (
            data.product_id,
        )).fetchone()

        if product is None:

            raise HTTPException(
                status_code=404,
                detail="Product not found."
            )

        # -------------------------------------------------
        # Check inventory
        # -------------------------------------------------

        inventory = cursor.execute("""
            SELECT *
            FROM inventory
            WHERE flight_id = ?
            AND product_id = ?
        """, (
            data.flight_id,
            data.product_id
        )).fetchone()

        if inventory is None:

            raise HTTPException(
                status_code=404,
                detail="Inventory record not found."
            )

        # -------------------------------------------------
        # Calculate remaining stock
        # -------------------------------------------------

        remaining = (
            inventory["loaded_quantity"]
            - inventory["sold_quantity"]
            - inventory["returned_quantity"]
            - inventory["wasted_quantity"]
        )

        # -------------------------------------------------
        # Prevent overselling
        # -------------------------------------------------

        if data.quantity > remaining:

            raise HTTPException(
                status_code=400,
                detail=(
                    f"Insufficient stock. "
                    f"Only {remaining} unit(s) available."
                )
            )

        # -------------------------------------------------
        # Prevent duplicate transaction
        #
        # IMPORTANT:
        # The comma after data.transaction_id is required.
        # Without it Python treats the string as a sequence,
        # which caused the SQLite "23 bindings" error.
        # -------------------------------------------------

        existing = cursor.execute("""
            SELECT id
            FROM sales
            WHERE transaction_id = ?
        """, (
            data.transaction_id,
        )).fetchone()

        if existing:

            return {
                "status": "already_recorded",
                "transaction_id": data.transaction_id
            }

        # -------------------------------------------------
        # Record sale
        # -------------------------------------------------

        cursor.execute("""
            INSERT INTO sales
            (
                transaction_id,
                flight_id,
                product_id,
                crew_id,
                quantity,
                unit_price,
                total_amount,
                payment_method,
                transaction_time
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            data.transaction_id,
            data.flight_id,
            data.product_id,
            data.crew_id,
            data.quantity,
            data.unit_price,
            data.total_amount,
            data.payment_method,
            data.transaction_time
        ))

        # -------------------------------------------------
        # Update inventory
        # -------------------------------------------------

        cursor.execute("""
            UPDATE inventory

            SET sold_quantity =
                sold_quantity + ?

            WHERE flight_id = ?
            AND product_id = ?
        """, (
            data.quantity,
            data.flight_id,
            data.product_id
        ))

        # -------------------------------------------------
        # Commit transaction
        # -------------------------------------------------

        connection.commit()

        return {
            "status": "success",
            "transaction_id": data.transaction_id
        }

    except HTTPException:

        connection.rollback()
        raise

    except sqlite3.IntegrityError as error:

        connection.rollback()

        raise HTTPException(
            status_code=400,
            detail=str(error)
        )

    except sqlite3.Error as error:

        connection.rollback()

        raise HTTPException(
            status_code=500,
            detail=f"Database error: {error}"
        )

    finally:

        connection.close()


# =========================================================
# RECENT SALES
# =========================================================

@app.get("/sales")
def get_sales():

    connection = get_connection()

    try:

        rows = connection.execute("""
            SELECT

                s.id,
                s.transaction_id,

                s.flight_id,
                f.flight_number,

                s.product_id,
                p.product_name,

                s.crew_id,
                s.quantity,
                s.unit_price,
                s.total_amount,

                s.payment_method,
                s.transaction_time

            FROM sales s

            JOIN flights f
                ON f.id = s.flight_id

            JOIN products p
                ON p.id = s.product_id

            ORDER BY s.id DESC

            LIMIT 100
        """).fetchall()

        return [dict(row) for row in rows]

    finally:

        connection.close()


# =========================================================
# CURRENCIES
# =========================================================

@app.get("/currencies")
def get_currencies():

    result = []

    for code, rate in EXCHANGE_RATES.items():

        result.append({
            "code": code,
            "name": CURRENCY_NAMES[code],
            "rate": rate
        })

    return result


@app.get("/exchange-rate/{currency}")
def get_exchange_rate(currency: str):

    currency = currency.upper()

    if currency not in EXCHANGE_RATES:

        raise HTTPException(
            status_code=404,
            detail="Currency not supported."
        )

    return {
        "currency": currency,
        "rate": EXCHANGE_RATES[currency],
        "source": "Demo fixed rate"
    }


# =========================================================
# DASHBOARD
# =========================================================

@app.get("/dashboard")
def dashboard(
    year: int | None = None,
    month: int | None = None,
    day: int | None = None
):

    connection = get_connection()

    try:

        # =================================================
        # DATE FILTER
        # =================================================

        conditions = []
        params = []

        if year is not None:

            conditions.append(
                "substr(f.flight_date, 1, 4) = ?"
            )

            params.append(str(year))

        if month is not None:

            conditions.append(
                "substr(f.flight_date, 6, 2) = ?"
            )

            params.append(
                f"{month:02d}"
            )

        if day is not None:

            conditions.append(
                "substr(f.flight_date, 9, 2) = ?"
            )

            params.append(
                f"{day:02d}"
            )

        where_clause = ""

        if conditions:

            where_clause = (
                "WHERE "
                + " AND ".join(conditions)
            )

        # =================================================
        # FLIGHT PERFORMANCE
        # =================================================

        flight_rows = connection.execute(f"""
            SELECT

                f.id,
                f.flight_number,
                f.flight_date,
                f.origin,
                f.destination,
                f.passengers,

                COALESCE(
                    SUM(s.total_amount),
                    0
                ) AS revenue

            FROM flights f

            LEFT JOIN sales s
                ON s.flight_id = f.id

            {where_clause}

            GROUP BY
                f.id,
                f.flight_number,
                f.flight_date,
                f.origin,
                f.destination,
                f.passengers

            ORDER BY
                f.flight_date DESC,
                f.id DESC

        """, params).fetchall()

        flights = []

        total_revenue = 0.0
        total_passengers = 0

        for row in flight_rows:

            revenue = float(
                row["revenue"] or 0
            )

            passengers = int(
                row["passengers"] or 0
            )

            rpp = (
                revenue / passengers
                if passengers > 0
                else 0
            )

            total_revenue += revenue
            total_passengers += passengers

            flights.append({
                "id": row["id"],
                "flight_number": row["flight_number"],
                "flight_date": row["flight_date"],
                "origin": row["origin"],
                "destination": row["destination"],
                "passengers": passengers,
                "revenue": revenue,
                "rpp": rpp
            })

        # =================================================
        # OVERALL RPP
        # =================================================

        current_rpp = (
            total_revenue / total_passengers
            if total_passengers > 0
            else 0
        )

        gap = current_rpp - TARGET_RPP

        achievement = (
            (current_rpp / TARGET_RPP) * 100
            if TARGET_RPP > 0
            else 0
        )

        # =================================================
        # PRODUCT PERFORMANCE
        # =================================================

        product_conditions = []
        product_params = []

        if year is not None:

            product_conditions.append(
                "substr(f.flight_date, 1, 4) = ?"
            )

            product_params.append(
                str(year)
            )

        if month is not None:

            product_conditions.append(
                "substr(f.flight_date, 6, 2) = ?"
            )

            product_params.append(
                f"{month:02d}"
            )

        if day is not None:

            product_conditions.append(
                "substr(f.flight_date, 9, 2) = ?"
            )

            product_params.append(
                f"{day:02d}"
            )

        product_where = ""

        if product_conditions:

            product_where = (
                "WHERE "
                + " AND ".join(product_conditions)
            )

        product_rows = connection.execute(f"""
            SELECT

                p.product_name,

                COALESCE(
                    SUM(s.quantity),
                    0
                ) AS quantity_sold,

                COALESCE(
                    SUM(s.total_amount),
                    0
                ) AS revenue

            FROM products p

            LEFT JOIN sales s
                ON s.product_id = p.id

            LEFT JOIN flights f
                ON f.id = s.flight_id

            {product_where}

            GROUP BY
                p.id,
                p.product_name

            ORDER BY
                revenue DESC

        """, product_params).fetchall()

        products = []

        for row in product_rows:

            products.append({
                "product_name": row["product_name"],
                "quantity_sold": int(
                    row["quantity_sold"] or 0
                ),
                "revenue": float(
                    row["revenue"] or 0
                )
            })

        # =================================================
        # RETURN DASHBOARD
        # =================================================

        return {
            "target_rpp": TARGET_RPP,
            "rpp": current_rpp,
            "gap": gap,
            "achievement": achievement,
            "revenue": total_revenue,
            "passengers": total_passengers,
            "flights": flights,
            "products": products
        }

    finally:

        connection.close()