/**
 * Main Application Router for Conciliação Module
 */

const AppConciliacao = {
    viewsContainer: document.getElementById('views-container'),
    navItems: document.querySelectorAll('.nav-item'),
    modules: {},

    async init() {
        // Show loading
        this.viewsContainer.innerHTML = `
            <div class="loading-state">
                <i class="fa-solid fa-cloud-arrow-down fa-bounce" style="font-size: 3rem; color: #3b82f6;"></i>
                <p style="margin-top: 15px;">Conectando ao PostgreSQL (Render)...</p>
            </div>
        `;

        // TODO: In the future, fetch data from /api/conciliacao endpoints here

        // Register modules
        this.modules = {
            dashboard_conciliacao: window.DashboardConciliacaoModule,
            notas_fiscais: window.NotasFiscaisModule,
            importacao: window.ImportacaoModule,
            conciliacao_notas: window.ConciliacaoNotasModule,
            relatorios: { render: this.renderWIP }
        };

        this.setupNavigation();

        // Initial Route
        this.navigate('dashboard_conciliacao');
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
    },

    navigate(viewName) {
        this.viewsContainer.innerHTML = '';

        const module = this.modules[viewName];
        if (module && typeof module.render === 'function') {
            module.render(this.viewsContainer, viewName);
        } else {
            this.viewsContainer.innerHTML = `<div class="loading-state">
                <i class="fa-solid fa-triangle-exclamation"></i>
                <p>Módulo '${viewName}' não encontrado.</p>
            </div>`;
        }
    },

    // Placeholder view renderer
    renderWIP(container, viewName) {
        const title = viewName.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
        window.UI.renderView(
            title,
            '<button class="btn btn-primary" onclick="alert(\'Em desenvolvimento!\')"><i class="fa-solid fa-plus"></i> Novo Registro</button>',
            container,
            window.UI.emptyState('Telas do módulo de conciliação estão sendo construídas.', 'fa-person-digging')
        );
    }
};

document.addEventListener('DOMContentLoaded', () => {
    AppConciliacao.init();
});
