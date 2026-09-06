const { createApp } = Vue;


// =========================================================
// APPLICATION
// =========================================================

createApp({

    data() {

        const currentYear = new Date().getFullYear();

        return {

            // =================================================
            // SERVER
            // =================================================

            apiBase: "http://127.0.0.1:8000",

            online: false,

            connectionTimer: null,


            // =================================================
            // LOGIN
            // =================================================

            user: null,

            loginForm: {
                employee_id: "",
                password: ""
            },

            loginError: "",
            loggingIn: false,


            // =================================================
            // NAVIGATION
            // =================================================

            page: "crew",


            // =================================================
            // DASHBOARD DATE OPTIONS
            // =================================================

            yearOptions: Array.from(
                { length: 8 },
                (_, index) => currentYear - 3 + index
            ),

            monthOptions: [
                { value: 1, label: "January" },
                { value: 2, label: "February" },
                { value: 3, label: "March" },
                { value: 4, label: "April" },
                { value: 5, label: "May" },
                { value: 6, label: "June" },
                { value: 7, label: "July" },
                { value: 8, label: "August" },
                { value: 9, label: "September" },
                { value: 10, label: "October" },
                { value: 11, label: "November" },
                { value: 12, label: "December" }
            ],

            dayOptions: Array.from(
                { length: 31 },
                (_, index) => index + 1
            ),


            // =================================================
            // FLIGHTS
            // =================================================

            flights: [],

            selectedFlight: null,

            flightForm: {

                flight_number: "",
                flight_date: "",
                aircraft: "",
                passengers: null,
                origin: "",
                destination: ""

            },

            flightError: "",
            creatingFlight: false,


            // =================================================
            // PRODUCTS
            // =================================================

            products: [],


            // =================================================
            // INVENTORY
            // =================================================

            inventory: [],


            // =================================================
            // CART
            // =================================================

            cart: {},


            // =================================================
            // CURRENCY
            // =================================================

            currencies: [],

            selectedCurrency: "USD",

            exchangeRate: 1,

            exchangeLoading: false,

            exchangeError: "",


            // =================================================
            // OFFLINE SALES
            // =================================================

            pendingSales: [],

            syncMessage: "",

            syncing: false,

            lastSyncTime: null,


            // =================================================
            // DASHBOARD
            // =================================================

            dashboard: {

                rpp: 0,

                target_rpp: 2,

                gap: 0,

                achievement: 0,

                revenue: 0,

                passengers: 0,

                flights: [],

                products: []

            },


            // =================================================
            // DASHBOARD FILTER
            // =================================================

            dashboardFilter: {

                year: currentYear,

                month: null,

                day: null

            },


            // =================================================
            // CHART
            // =================================================

            chartVisible: false,

            chartType: "line",

            chartInstance: null

        };

    },


    // =========================================================
    // COMPUTED
    // =========================================================

    computed: {


        // =====================================================
        // CART TOTAL
        // =====================================================

        cartTotal() {

            let total = 0;

            for (const product of this.products) {

                const quantity =
                    Number(
                        this.cart[product.id] || 0
                    );

                const price =
                    Number(
                        product.selling_price || 0
                    );

                total += quantity * price;
            }

            return total;
        },


        // =====================================================
        // FORMATTED USD TOTAL
        // =====================================================

        formattedUsdTotal() {

            return Number(
                this.cartTotal
            ).toFixed(2);
        },


        // =====================================================
        // CUSTOMER PAYMENT
        // =====================================================

        customerAmount() {

            return (
                Number(this.cartTotal || 0) *
                Number(this.exchangeRate || 1)
            );
        },


        // =====================================================
        // FORMATTED CUSTOMER AMOUNT
        // =====================================================

        formattedCustomerAmount() {

            return Number(
                this.customerAmount
            ).toFixed(2);
        },


        // =====================================================
        // CURRENCY SYMBOL
        // =====================================================

        currencySymbol() {

            const symbols = {

                USD: "$",

                NPR: "रू",

                GBP: "£",

                EUR: "€",

                AED: "د.إ",

                QAR: "﷼",

                MYR: "RM",

                THB: "฿",

                INR: "₹"

            };

            return (
                symbols[this.selectedCurrency] ||
                this.selectedCurrency
            );
        },


        // =====================================================
        // CONNECTION TEXT
        // =====================================================

        connectionText() {

            if (this.online) {

                return "Connected";

            }

            return "Offline";
        },


        // =====================================================
        // PENDING COUNT
        // =====================================================

        pendingCount() {

            return this.pendingSales.length;
        },


        // =====================================================
        // SYNC STATUS TEXT
        // =====================================================

        syncStatusText() {

            if (this.syncing) {

                return "Synchronizing...";
            }

            if (!this.online) {

                return "Waiting for connection";
            }

            if (this.pendingSales.length === 0) {

                return "All transactions synchronized";
            }

            return `${this.pendingSales.length} transaction(s) pending`;
        },


        // =====================================================
        // MONTH LABEL
        // =====================================================

        selectedMonthLabel() {

            if (!this.dashboardFilter.month) {

                return "All Months";
            }

            const month =
                this.monthOptions.find(
                    item =>
                        item.value ===
                        Number(this.dashboardFilter.month)
                );

            return month
                ? month.label
                : "All Months";
        }

    },


    // =========================================================
    // METHODS
    // =========================================================

    methods: {


        // =====================================================
        // API REQUEST
        // =====================================================

        async request(
            endpoint,
            options = {}
        ) {

            const response =
                await fetch(
                    this.apiBase + endpoint,
                    {
                        ...options,

                        headers: {

                            "Content-Type":
                                "application/json",

                            ...(options.headers || {})

                        }
                    }
                );


            if (!response.ok) {

                let message =
                    "Request failed.";


                try {

                    const data =
                        await response.json();

                    message =
                        data.detail ||
                        message;

                } catch (error) {

                    // Ignore JSON parsing error.

                }


                throw new Error(message);
            }


            return response.json();
        },


        // =====================================================
        // CHECK CONNECTION
        // =====================================================

        async checkConnection() {

            try {

                await this.request(
                    "/health"
                );

                const wasOffline =
                    !this.online;

                this.online = true;


                // ---------------------------------------------
                // Automatically synchronize when connection
                // comes back.
                // ---------------------------------------------

                if (
                    wasOffline &&
                    this.pendingSales.length > 0 &&
                    !this.syncing
                ) {

                    await this.syncSales();
                }


            } catch (error) {

                this.online = false;
            }
        },


        // =====================================================
        // LOGIN
        // =====================================================

        async login() {

            this.loginError = "";


            if (
                !this.loginForm.employee_id ||
                !this.loginForm.password
            ) {

                this.loginError =
                    "Please enter Employee ID and password.";

                return;
            }


            this.loggingIn = true;


            try {

                const user =
                    await this.request(
                        "/login",
                        {

                            method: "POST",

                            body:
                                JSON.stringify(
                                    this.loginForm
                                )

                        }
                    );


                this.user = user;


                // ------------------------------------------------
                // IMPORTANT:
                // We intentionally DO NOT save the user in
                // localStorage.
                //
                // This prevents Live Server from automatically
                // logging in after page refresh.
                // ------------------------------------------------


                this.loginForm.password = "";

                this.online = true;


                await this.loadInitialData();


            } catch (error) {

                this.loginError =
                    error.message ||
                    "Unable to login.";

            } finally {

                this.loggingIn = false;
            }
        },


        // =====================================================
        // LOGOUT
        // =====================================================

        logout() {

            this.user = null;

            this.loginForm = {

                employee_id: "",

                password: ""

            };


            this.page = "crew";

            this.cart = {};

            this.flights = [];

            this.products = [];

            this.inventory = [];

            this.dashboard = {

                rpp: 0,

                target_rpp: 2,

                gap: 0,

                achievement: 0,

                revenue: 0,

                passengers: 0,

                flights: [],

                products: []

            };
        },


        // =====================================================
        // INITIAL DATA
        // =====================================================

        async loadInitialData() {

            await Promise.all([

                this.loadFlights(),

                this.loadProducts(),

                this.loadCurrencies()

            ]);


            if (
                this.flights.length > 0 &&
                !this.selectedFlight
            ) {

                this.selectedFlight =
                    this.flights[0].id;
            }


            await this.loadInventory();

            this.refreshPendingSales();

            await this.refreshDashboard();

            await this.updateExchangeRate();
        },


        // =====================================================
        // FLIGHTS
        // =====================================================

        async loadFlights() {

            try {

                this.flights =
                    await this.request(
                        "/flights"
                    );

                this.online = true;

            } catch (error) {

                this.online = false;

                console.error(
                    "Flights:",
                    error
                );
            }
        },


        // =====================================================
        // CREATE FLIGHT
        // =====================================================

        async createFlight() {

            this.flightError = "";


            const form =
                this.flightForm;


            if (
                !form.flight_number ||
                !form.flight_date ||
                !form.aircraft ||
                !form.passengers ||
                !form.origin ||
                !form.destination
            ) {

                this.flightError =
                    "Please complete all flight details.";

                return;
            }


            if (
                String(form.origin).trim().length !== 3 ||
                String(form.destination).trim().length !== 3
            ) {

                this.flightError =
                    "Origin and destination must be 3-letter airport codes.";

                return;
            }


            this.creatingFlight = true;


            try {

                const flight =
                    await this.request(
                        "/flights",
                        {

                            method: "POST",

                            body:
                                JSON.stringify({

                                    flight_number:
                                        form.flight_number
                                            .trim()
                                            .toUpperCase(),

                                    flight_date:
                                        form.flight_date,

                                    aircraft:
                                        form.aircraft
                                            .trim()
                                            .toUpperCase(),

                                    passengers:
                                        Number(
                                            form.passengers
                                        ),

                                    origin:
                                        form.origin
                                            .trim()
                                            .toUpperCase(),

                                    destination:
                                        form.destination
                                            .trim()
                                            .toUpperCase()

                                })

                        }
                    );


                this.flights.unshift(
                    flight
                );


                this.selectedFlight =
                    flight.id;


                this.flightForm = {

                    flight_number: "",

                    flight_date: "",

                    aircraft: "",

                    passengers: null,

                    origin: "",

                    destination: ""

                };


                await this.loadInventory();


                this.cart = {};


                alert(
                    "Flight created successfully."
                );


            } catch (error) {

                this.flightError =
                    error.message ||
                    "Unable to create flight.";

            } finally {

                this.creatingFlight = false;
            }
        },


        // =====================================================
        // PRODUCTS
        // =====================================================

        async loadProducts() {

            try {

                this.products =
                    await this.request(
                        "/products"
                    );

            } catch (error) {

                console.error(
                    "Products:",
                    error
                );
            }
        },


        // =====================================================
        // INVENTORY
        // =====================================================

        async loadInventory() {

            if (!this.selectedFlight) {

                this.inventory = [];

                return;
            }


            try {

                this.inventory =
                    await this.request(
                        `/inventory/${this.selectedFlight}`
                    );

            } catch (error) {

                this.inventory = [];

                console.error(
                    "Inventory:",
                    error
                );
            }
        },


        // =====================================================
        // AVAILABLE QUANTITY
        // =====================================================

        getAvailableQuantity(
            productId
        ) {

            const item =
                this.inventory.find(
                    row =>
                        Number(row.product_id) ===
                        Number(productId)
                );


            if (!item) {

                return 0;
            }


            return Math.max(

                0,

                Number(
                    item.remaining_quantity || 0
                )

            );
        },


        // =====================================================
        // INCREASE CART
        // =====================================================

        increase(product) {

            if (!this.selectedFlight) {

                alert(
                    "Please select or create a flight first."
                );

                return;
            }


            const available =
                this.getAvailableQuantity(
                    product.id
                );


            const current =
                Number(
                    this.cart[product.id] || 0
                );


            if (
                current >= available
            ) {

                return;
            }


            this.cart[product.id] =
                current + 1;
        },


        // =====================================================
        // DECREASE CART
        // =====================================================

        decrease(product) {

            const current =
                Number(
                    this.cart[product.id] || 0
                );


            if (current <= 1) {

                delete this.cart[
                    product.id
                ];

                return;
            }


            this.cart[product.id] =
                current - 1;
        },


        // =====================================================
        // CURRENCIES
        // =====================================================

        async loadCurrencies() {

            try {

                this.currencies =
                    await this.request(
                        "/currencies"
                    );

            } catch (error) {

                this.currencies = [

                    {

                        code: "USD",

                        name: "US Dollar",

                        rate: 1

                    }

                ];
            }
        },


        // =====================================================
        // UPDATE EXCHANGE RATE
        // =====================================================

        async updateExchangeRate() {

            this.exchangeLoading = true;

            this.exchangeError = "";


            try {

                const data =
                    await this.request(
                        `/exchange-rate/${this.selectedCurrency}`
                    );


                this.exchangeRate =
                    Number(data.rate);


            } catch (error) {

                this.exchangeRate = 1;

                this.exchangeError =
                    "Unable to load exchange rate.";

            } finally {

                this.exchangeLoading = false;
            }
        },


        // =====================================================
        // RECORD SALE
        // =====================================================

        async recordSale() {

            if (!this.selectedFlight) {

                alert(
                    "Please select a flight."
                );

                return;
            }


            if (
                Number(this.cartTotal) <= 0
            ) {

                alert(
                    "Please select at least one product."
                );

                return;
            }


            if (!this.user) {

                alert(
                    "Please login before recording a sale."
                );

                return;
            }


            const now =
                new Date();


            const timestamp =
                now.toISOString();


            const sales = [];


            for (
                const product of this.products
            ) {

                const quantity =
                    Number(
                        this.cart[product.id] || 0
                    );


                if (quantity <= 0) {

                    continue;
                }


                const sale = {

                    transaction_id:

                        "TXN-" +
                        Date.now() +
                        "-" +
                        product.id +
                        "-" +
                        Math.floor(
                            Math.random() * 10000
                        ),


                    flight_id:

                        Number(
                            this.selectedFlight
                        ),


                    product_id:

                        Number(
                            product.id
                        ),


                    crew_id:

                        this.user.employee_id,


                    quantity:

                        quantity,


                    unit_price:

                        Number(
                            product.selling_price
                        ),


                    total_amount:

                        Number(
                            quantity *
                            product.selling_price
                        ),


                    payment_method:

                        this.selectedCurrency,


                    transaction_time:

                        timestamp

                };


                sales.push(
                    sale
                );
            }


            // =================================================
            // ONLINE SALE
            // =================================================

            if (this.online) {

                try {

                    for (
                        const sale of sales
                    ) {

                        await this.request(
                            "/sales",
                            {

                                method: "POST",

                                body:
                                    JSON.stringify(
                                        sale
                                    )

                            }
                        );
                    }


                    alert(
                        "Sale recorded successfully."
                    );


                    this.cart = {};


                    await this.loadInventory();

                    await this.refreshDashboard();


                    return;


                } catch (error) {

                    console.warn(
                        "Online sale failed. Saving locally.",
                        error
                    );


                    this.online = false;
                }
            }


            // =================================================
            // OFFLINE SALE
            // =================================================

            const existing =
                this.getStoredPendingSales();


            existing.push(
                ...sales
            );


            localStorage.setItem(

                "obs_pending_sales",

                JSON.stringify(
                    existing
                )

            );


            this.pendingSales =
                existing;


            this.cart = {};


            this.syncMessage =
                "Sale saved locally. It will synchronize automatically when the connection returns.";


            alert(
                "Connection unavailable. Sale saved and will sync automatically."
            );
        },


        // =====================================================
        // GET PENDING SALES
        // =====================================================

        getStoredPendingSales() {

            try {

                return JSON.parse(

                    localStorage.getItem(
                        "obs_pending_sales"
                    ) || "[]"

                );

            } catch (error) {

                return [];
            }
        },


        // =====================================================
        // REFRESH PENDING SALES
        // =====================================================

        refreshPendingSales() {

            this.pendingSales =
                this.getStoredPendingSales();
        },


        // =====================================================
        // AUTOMATIC SYNCHRONIZATION
        // =====================================================

        async syncSales() {

            // -------------------------------------------------
            // Don't sync without connection.
            // -------------------------------------------------

            if (!this.online) {

                return;
            }


            // -------------------------------------------------
            // Don't run two synchronization processes together.
            // -------------------------------------------------

            if (this.syncing) {

                return;
            }


            // -------------------------------------------------
            // Nothing to synchronize.
            // -------------------------------------------------

            if (
                this.pendingSales.length === 0
            ) {

                this.syncMessage =
                    "All transactions synchronized.";

                return;
            }


            this.syncing = true;


            this.syncMessage =
                "Synchronizing pending transactions...";


            const remaining = [];

            let successful = 0;


            try {

                for (
                    const sale of this.pendingSales
                ) {

                    try {

                        await this.request(
                            "/sales",
                            {

                                method: "POST",

                                body:
                                    JSON.stringify(
                                        sale
                                    )

                            }
                        );


                        successful++;


                    } catch (error) {

                        console.error(
                            "Synchronization error:",
                            error
                        );


                        remaining.push(
                            sale
                        );
                    }
                }


                // ------------------------------------------------
                // Save only failed transactions.
                // ------------------------------------------------

                this.pendingSales =
                    remaining;


                localStorage.setItem(

                    "obs_pending_sales",

                    JSON.stringify(
                        remaining
                    )

                );


                this.lastSyncTime =
                    new Date();


                if (
                    remaining.length === 0
                ) {

                    this.syncMessage =
                        `${successful} transaction(s) synchronized successfully.`;

                } else {

                    this.syncMessage =
                        `${successful} synchronized. ${remaining.length} still pending.`;
                }


                await this.loadInventory();

                await this.refreshDashboard();


            } finally {

                this.syncing = false;
            }
        },


        // =====================================================
        // START AUTOMATIC CONNECTION MONITOR
        // =====================================================

        startConnectionMonitor() {

            // -------------------------------------------------
            // Prevent duplicate timers.
            // -------------------------------------------------

            if (this.connectionTimer) {

                clearInterval(
                    this.connectionTimer
                );
            }


            // -------------------------------------------------
            // Check every 5 seconds.
            // -------------------------------------------------

            this.connectionTimer =
                setInterval(
                    async () => {

                        await this.checkConnection();

                    },
                    5000
                );
        },


        // =====================================================
        // DASHBOARD
        // =====================================================

        async refreshDashboard() {

            try {

                const filter =
                    this.dashboardFilter;


                const params =
                    new URLSearchParams();


                // ------------------------------------------------
                // YEAR
                // ------------------------------------------------

                if (
                    filter.year !== null &&
                    filter.year !== undefined &&
                    filter.year !== ""
                ) {

                    params.set(
                        "year",
                        filter.year
                    );
                }


                // ------------------------------------------------
                // MONTH
                // ------------------------------------------------

                if (
                    filter.month !== null &&
                    filter.month !== undefined &&
                    filter.month !== ""
                ) {

                    params.set(
                        "month",
                        filter.month
                    );
                }


                // ------------------------------------------------
                // DAY
                // ------------------------------------------------

                if (
                    filter.day !== null &&
                    filter.day !== undefined &&
                    filter.day !== ""
                ) {

                    params.set(
                        "day",
                        filter.day
                    );
                }


                const query =
                    params.toString();


                const endpoint =
                    query
                        ? `/dashboard?${query}`
                        : "/dashboard";


                const data =
                    await this.request(
                        endpoint
                    );


                this.dashboard =
                    data;


                this.online = true;


                if (
                    this.chartVisible
                ) {

                    this.$nextTick(
                        () =>
                            this.renderChart()
                    );
                }


            } catch (error) {

                console.error(
                    "Dashboard:",
                    error
                );
            }
        },


        // =====================================================
        // APPLY DASHBOARD FILTER
        // =====================================================

        async applyDashboardFilter() {

            await this.refreshDashboard();
        },


        // =====================================================
        // CLEAR MONTH
        // =====================================================

        async clearMonth() {

            this.dashboardFilter.month =
                null;

            this.dashboardFilter.day =
                null;

            await this.refreshDashboard();
        },


        // =====================================================
        // CLEAR DAY
        // =====================================================

        async clearDay() {

            this.dashboardFilter.day =
                null;

            await this.refreshDashboard();
        },


        // =====================================================
        // TODAY
        // =====================================================

        async setDashboardToday() {

            const today =
                new Date();


            this.dashboardFilter.year =
                today.getFullYear();


            this.dashboardFilter.month =
                today.getMonth() + 1;


            this.dashboardFilter.day =
                today.getDate();


            await this.refreshDashboard();
        },


        // =====================================================
        // CHART
        // =====================================================

        toggleChart() {

            this.chartVisible =
                !this.chartVisible;


            if (
                this.chartVisible
            ) {

                this.$nextTick(
                    () =>
                        this.renderChart()
                );
            }
        },


        // =====================================================
        // RENDER CHART
        // =====================================================

        renderChart() {

            const canvas =
                document.getElementById(
                    "flightPerformanceChart"
                );


            if (!canvas) {

                return;
            }


            if (
                this.chartInstance
            ) {

                this.chartInstance.destroy();

                this.chartInstance =
                    null;
            }


            const flights =
                this.dashboard.flights || [];


            const labels =
                flights.map(
                    flight =>
                        flight.flight_number
                );


            let data;

            let label;


            if (
                this.chartType === "line"
            ) {

                data =
                    flights.map(
                        flight =>
                            Number(
                                flight.rpp || 0
                            )
                    );


                label =
                    "RPP (USD)";


            } else {

                data =
                    flights.map(
                        flight =>
                            Number(
                                flight.revenue || 0
                            )
                    );


                label =
                    "Revenue (USD)";
            }


            this.chartInstance =
                new Chart(

                    canvas,

                    {

                        type:
                            this.chartType,


                        data: {

                            labels:
                                labels,


                            datasets: [

                                {

                                    label:
                                        label,

                                    data:
                                        data,

                                    borderWidth:
                                        2,

                                    tension:
                                        0.3

                                }

                            ]

                        },


                        options: {

                            responsive:
                                true,

                            maintainAspectRatio:
                                false,


                            plugins: {

                                legend: {

                                    display:
                                        true

                                }

                            },


                            scales: {

                                y: {

                                    beginAtZero:
                                        true

                                }

                            }

                        }

                    }

                );
        },


        // =====================================================
        // FORMAT DATE
        // =====================================================

        formatDate(date) {

            if (!date) {

                return "";
            }


            try {

                return new Date(
                    date
                ).toLocaleString();

            } catch (error) {

                return date;
            }
        },


        // =====================================================
        // LAST SYNC TEXT
        // =====================================================

        getLastSyncText() {

            if (!this.lastSyncTime) {

                return "Not synchronized yet";
            }


            return (
                "Last sync: " +
                this.lastSyncTime.toLocaleTimeString()
            );
        }

    },


    // =========================================================
    // WATCHERS
    // =========================================================

    watch: {


        // =====================================================
        // SELECTED FLIGHT
        // =====================================================

        selectedFlight: {

            async handler() {

                this.cart = {};

                await this.loadInventory();
            }
        },


        // =====================================================
        // SELECTED CURRENCY
        // =====================================================

        selectedCurrency: {

            async handler() {

                await this.updateExchangeRate();
            }
        },


        // =====================================================
        // YEAR
        // =====================================================

        "dashboardFilter.year": {

            async handler() {

                // Reset month/day when year changes.

                this.dashboardFilter.month =
                    null;

                this.dashboardFilter.day =
                    null;

                await this.refreshDashboard();
            }
        },


        // =====================================================
        // MONTH
        // =====================================================

        "dashboardFilter.month": {

            async handler() {

                // If month is cleared,
                // clear day as well.

                if (
                    this.dashboardFilter.month === null ||
                    this.dashboardFilter.month === ""
                ) {

                    this.dashboardFilter.day =
                        null;
                }


                await this.refreshDashboard();
            }
        },


        // =====================================================
        // DAY
        // =====================================================

        "dashboardFilter.day": {

            async handler() {

                await this.refreshDashboard();
            }
        },


        // =====================================================
        // CHART TYPE
        // =====================================================

        chartType() {

            if (
                this.chartVisible
            ) {

                this.$nextTick(
                    () =>
                        this.renderChart()
                );
            }
        }

    },


    // =========================================================
    // MOUNTED
    // =========================================================

    async mounted() {

        // =====================================================
        // IMPORTANT LOGIN BEHAVIOR
        // =====================================================

        // We DO NOT restore a user from localStorage.
        //
        // This means:
        //
        // Refresh page -> Login screen
        //
        // Live Server -> Login screen
        //
        // Browser restart -> Login screen
        //
        // This prevents automatic login.
        // =====================================================

        this.user = null;


        // =====================================================
        // LOAD LOCAL PENDING SALES
        // =====================================================

        this.refreshPendingSales();


        // =====================================================
        // CHECK BACKEND
        // =====================================================

        await this.checkConnection();


        // =====================================================
        // START AUTOMATIC CONNECTION MONITOR
        // =====================================================

        this.startConnectionMonitor();


        // =====================================================
        // IF ALREADY LOGGED IN DURING THIS PAGE SESSION
        // =====================================================

        if (this.user) {

            await this.loadInitialData();
        }

    },


    // =========================================================
    // BEFORE UNMOUNT
    // =========================================================

    beforeUnmount() {

        if (
            this.connectionTimer
        ) {

            clearInterval(
                this.connectionTimer
            );

            this.connectionTimer =
                null;
        }


        if (
            this.chartInstance
        ) {

            this.chartInstance.destroy();

            this.chartInstance =
                null;
        }
    }

}).mount("#app");