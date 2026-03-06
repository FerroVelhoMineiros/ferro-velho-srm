/**
 * Fuel Module
 * Diário de abastecimento (custos, litros, e veículo)
 */

window.FuelModule = {
    render(container) {
        const logs = window.db.get('fuel');
        const vehicles = window.db.get('vehicles');

        // Helper map to quickly get vehicle plate
        const vehicleMap = {};
        vehicles.forEach(v => vehicleMap[v.id] = v.plate);

        let actionsHtml = `<button class="btn btn-primary" id="add-fuel-btn"><i class="fa-solid fa-plus"></i> Novo Abastecimento</button>`;

        let tableRows = logs.sort((a, b) => new Date(b.date) - new Date(a.date)).map(fi => `
            <tr>
                <td><strong>${new Date(fi.date).toLocaleDateString('pt-BR')}</strong></td>
                <td>${vehicleMap[fi.vehicleId] || 'Veículo Excluído'}</td>
                <td>${fi.type}</td>
                <td>${Number(fi.liters).toFixed(2)} L</td>
                <td>${window.UI.formatCurrency(fi.totalCost)}</td>
                <td>${Number(fi.mileage).toLocaleString('pt-BR')} km</td>
                <td>
                    <button class="action-btn delete" data-id="${fi.id}" title="Remover"><i class="fa-solid fa-trash"></i></button>
                </td>
            </tr>
        `).join('');

        if (logs.length === 0) {
            tableRows = `<tr><td colspan="7">${window.UI.emptyState('Nenhum registro de abastecimento', 'fa-gas-pump')}</td></tr>`;
        }

        const contentHtml = `
            <div class="table-container">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Data</th>
                            <th>Veículo</th>
                            <th>Combustível</th>
                            <th>Litros</th>
                            <th>Custo Total</th>
                            <th>Odômetro</th>
                            <th>Ações</th>
                        </tr>
                    </thead>
                    <tbody>${tableRows}</tbody>
                </table>
            </div>
        `;

        window.UI.renderView('Controle de Combustível', actionsHtml, container, contentHtml);
        this.attachEventListeners();
    },

    attachEventListeners() {
        document.getElementById('add-fuel-btn')?.addEventListener('click', () => this.openFormModal());

        document.querySelectorAll('.action-btn.delete').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.currentTarget.getAttribute('data-id');
                if (confirm('Remover este registro?')) {
                    window.db.delete('fuel', id);
                    window.App.navigate('fuel');
                }
            });
        });
    },

    openFormModal() {
        const vehicles = window.db.get('vehicles').filter(v => v.status !== 'Inativo');

        if (vehicles.length === 0) {
            alert('Você precisa cadastrar um veículo ativo primeiro.');
            return;
        }

        const vehicleOptions = vehicles.map(v => `<option value="${v.id}">${v.plate} - ${v.model}</option>`).join('');

        const formHtml = `
            <div class="form-group">
                <label>Veículo</label>
                <select class="form-control" name="vehicleId" required>
                    ${vehicleOptions}
                </select>
            </div>
            <div style="display: flex; gap: 16px;">
                <div class="form-group" style="flex: 1;">
                    <label>Data</label>
                    <input type="date" class="form-control" name="date" required value="${new Date().toISOString().split('T')[0]}">
                </div>
                <div class="form-group" style="flex: 1;">
                    <label>Tipo de Combustível</label>
                     <select class="form-control" name="type" required>
                        <option value="Diesel Regular">Diesel Regular</option>
                        <option value="Diesel S10">Diesel S10</option>
                        <option value="Gasolina Aditivada">Gasolina Aditivada</option>
                        <option value="Gasolina Comum">Gasolina Comum</option>
                        <option value="Etanol">Etanol</option>
                    </select>
                </div>
            </div>
            <div style="display: flex; gap: 16px;">
                <div class="form-group" style="flex: 1;">
                    <label>Litros (L)</label>
                    <input type="number" class="form-control" name="liters" step="0.01" required min="0.1">
                </div>
                <div class="form-group" style="flex: 1;">
                    <label>Valor Total (R$)</label>
                    <input type="number" class="form-control" name="totalCost" step="0.01" required min="0">
                </div>
                <div class="form-group" style="flex: 1;">
                    <label>Odômetro Atual</label>
                    <input type="number" class="form-control" name="mileage" required min="0" placeholder="Km">
                </div>
            </div>
        `;

        window.UI.showModal('Registrar Abastecimento', formHtml, (formData) => {
            // Update vehicle current mileage automatically
            const vehicle = window.db.getById('vehicles', formData.vehicleId);
            if (vehicle && Number(formData.mileage) > Number(vehicle.mileage)) {
                window.db.update('vehicles', vehicle.id, { mileage: Number(formData.mileage) });
            }

            window.db.add('fuel', formData);
            window.App.navigate('fuel');
        });
    }
};
