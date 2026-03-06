/**
 * Main Application Router
 * Handles navigation state and initialization
 */

const App = {
    viewsContainer: document.getElementById('views-container'),
    navItems: document.querySelectorAll('.nav-item'),
    modules: {}, // Will hold references to the route modules (dashboard, vehicles...)

    init() {
        // Register modules
        this.modules = {
            dashboard: window.DashboardModule,
            vehicles: window.VehiclesModule,
            fuel: window.FuelModule,
            tires: window.TiresModule,
            parts: window.PartsModule,
            maintenance: window.MaintenanceModule,
            drivers: window.DriversModule
        };

        this.setupNavigation();

        // Check local mock status and update badge
        this.updateAlerts();

        // Initial Route
        this.navigate('dashboard');
    },

    setupNavigation() {
        this.navItems.forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                const target = item.getAttribute('data-target');

                // Update active state
                this.navItems.forEach(nav => nav.classList.remove('active'));
                item.classList.add('active');

                this.navigate(target);
            });
        });

        // Backup Actions
        document.getElementById('importDataBtn').addEventListener('click', () => {
            alert('Funcionalidade de backup será implementada em breve. O sistema está salvando dados localmente.');
        });
    },

    navigate(viewName) {
        this.viewsContainer.innerHTML = '';

        const module = this.modules[viewName];
        if (module && typeof module.render === 'function') {
            module.render(this.viewsContainer);
        } else {
            this.viewsContainer.innerHTML = `<div class="loading-state">
                <i class="fa-solid fa-triangle-exclamation"></i>
                <p>Módulo '${viewName}' não encontrado ou em desenvolvimento.</p>
            </div>`;
        }
    },

    updateAlerts() {
        const badge = document.getElementById('alertBadge');
        const tasks = window.db.get('maintenance');
        const pending = tasks.filter(t => t.status === 'Pendente');

        if (pending.length > 0) {
            badge.style.display = 'flex';
            badge.innerText = pending.length;
        } else {
            badge.style.display = 'none';
        }
    }
};

// Wait for DOM to load fully before initializing
document.addEventListener('DOMContentLoaded', async () => {
    // Show a global loading state while fetching from PostgreSQL
    document.getElementById('views-container').innerHTML = `
        <div class="loading-state">
            <i class="fa-solid fa-cloud-arrow-down fa-bounce" style="font-size: 3rem; color: var(--primary-color);"></i>
            <p style="margin-top: 15px;">Conectando ao Banco de Dados...</p>
        </div>
    `;

    // Load all data from API
    await window.db.loadAllData();

    // Initialize the application routing
    App.init();
});
