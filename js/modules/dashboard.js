/**
 * Dashboard Module
 * Renders main overview metrics and quick alerts
 */

window.DashboardModule = {
    render(container) {
        const metrics = window.db.getDashboardMetrics();

        const contentHtml = `
            <div class="metrics-grid">
                <div class="metric-card">
                    <div class="metric-icon blue"><i class="fa-solid fa-car"></i></div>
                    <div class="metric-info">
                        <h3>Total de Veículos</h3>
                        <div class="value">${metrics.totalVehicles}</div>
                    </div>
                </div>
                <div class="metric-card">
                    <div class="metric-icon green"><i class="fa-solid fa-check-circle"></i></div>
                    <div class="metric-info">
                        <h3>Veículos Ativos</h3>
                        <div class="value">${metrics.activeVehicles}</div>
                    </div>
                </div>
                <div class="metric-card">
                    <div class="metric-icon orange"><i class="fa-solid fa-wrench"></i></div>
                    <div class="metric-info">
                        <h3>Em Manutenção</h3>
                        <div class="value">${metrics.maintenanceVehicles}</div>
                    </div>
                </div>
                <div class="metric-card">
                    <div class="metric-icon red"><i class="fa-solid fa-gas-pump"></i></div>
                    <div class="metric-info">
                        <h3>Custo Combustível</h3>
                        <div class="value">${window.UI.formatCurrency(metrics.totalFuelCost)}</div>
                    </div>
                </div>
                <div class="metric-card">
                    <div class="metric-icon orange"><i class="fa-solid fa-screwdriver-wrench"></i></div>
                    <div class="metric-info">
                        <h3>Custo Manutenção</h3>
                        <div class="value">${window.UI.formatCurrency(metrics.totalMaintenanceCost || 0)}</div>
                    </div>
                </div>
            </div>

            <div class="table-container" style="margin-top: 24px;">
                <div style="padding: 20px; border-bottom: 1px solid var(--border-color);">
                    <h3 style="font-size: 1.1rem; font-weight: 600;">Alertas de Manutenção</h3>
                </div>
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Veículo</th>
                            <th>Serviço</th>
                            <th>Data/Km Prevista</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody id="alerts-table-body">
                        <!-- Populated by JS -->
                    </tbody>
                </table>
            </div>
        `;

        window.UI.renderView(
            'Dashboard - Visão Geral',
            `<button class="btn btn-secondary" onclick="window.App.navigate('dashboard')"><i class="fa-solid fa-rotate-right"></i> Atualizar</button>`,
            container,
            contentHtml
        );

        this.renderAlerts();
    },

    renderAlerts() {
        const tasks = window.db.get('maintenance');
        const pending = tasks.filter(t => t.status === 'Pendente').slice(0, 5); // top 5
        const tbody = document.getElementById('alerts-table-body');

        if (pending.length === 0) {
            tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: var(--text-secondary); padding: 30px;">Tudo em dia! Nenhuma manutenção pendente.</td></tr>`;
            return;
        }

        tbody.innerHTML = pending.map(task => `
            <tr>
                <td>${task.vehiclePlate || 'N/A'}</td>
                <td><strong>${task.service}</strong></td>
                <td>${task.dueDate || task.dueKm + ' km'}</td>
                <td><span class="status-badge status-inactive">Pendente</span></td>
            </tr>
        `).join('');
    }
};
