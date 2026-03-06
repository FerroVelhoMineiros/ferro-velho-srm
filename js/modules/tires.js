/**
 * Tires Module
 * Controle de Pneus na frota
 */

window.TiresModule = {
    async render(container) {
        const tires = await window.db.get('tires');
        const vehicles = await window.db.get('vehicles');
        const vehicleMap = {};
        vehicles.forEach(v => vehicleMap[v.id] = v.plate);

        let actionsHtml = `<button class="btn btn-primary" id="add-tire-btn"><i class="fa-solid fa-plus"></i> Instalar Pneu</button>`;

        let tableRows = tires.map(t => {
            let statusBadge = t.vehicleId ? '<span class="status-badge status-maintenance">Em Uso</span>' :
                '<span class="status-badge status-active">Estoque</span>';

            return `
            <tr>
                <td><strong>${t.serialCode}</strong></td>
                <td>${t.brand}</td>
                <td>${t.size}</td>
                <td>${vehicleMap[t.vehicleId] || 'Estoque'} - ${t.position}</td>
                <td>${t.observations || '-'}</td>
                <td>${statusBadge}</td>
                <td>
                    <button class="action-btn delete" data-id="${t.id}" title="Descartar"><i class="fa-solid fa-trash"></i></button>
                </td>
            </tr>
            `;
        }).join('');

        if (tires.length === 0) {
            tableRows = `<tr><td colspan="7">${window.UI.emptyState('Nenhum pneu registrado', 'fa-ring')}</td></tr>`;
        }

        const contentHtml = `
            <div class="table-container">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Nº Série</th>
                            <th>Marca</th>
                            <th>Medida</th>
                            <th>Alocação (Veículo - Eixo)</th>
                            <th>Observações</th>
                            <th>Status</th>
                            <th>Ações</th>
                        </tr>
                    </thead>
                    <tbody>${tableRows}</tbody>
                </table>
            </div>
        `;

        window.UI.renderView('Gestão de Pneus', actionsHtml, container, contentHtml);
        this.attachEventListeners();
    },

    attachEventListeners() {
        document.getElementById('add-tire-btn')?.addEventListener('click', () => this.openFormModal());

        document.querySelectorAll('.action-btn.delete').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const id = e.currentTarget.getAttribute('data-id');
                if (confirm('Tem certeza que deseja remover este pneu do sistema?')) {
                    await window.db.delete('tires', id);
                    window.App.navigate('tires');
                }
            });
        });
    },

    async openFormModal() {
        const vehicles = await window.db.get('vehicles');
        const vehicleOptions = `<option value="">Manter em Estoque</option>` + vehicles.map(v => `<option value="${v.id}">${v.plate}</option>`).join('');

        const formHtml = `
            <div style="display: flex; gap: 16px;">
                <div class="form-group" style="flex: 1;">
                    <label>Número de Série/Fogo</label>
                    <input type="text" class="form-control" name="serialCode" required placeholder="Ex: S-987654">
                </div>
                <div class="form-group" style="flex: 1;">
                    <label>Marca e Modelo</label>
                    <input type="text" class="form-control" name="brand" required placeholder="Ex: Michelin XTE2">
                </div>
            </div>
            <div style="display: flex; gap: 16px;">
                <div class="form-group" style="flex: 1;">
                    <label>Medida</label>
                    <input type="text" class="form-control" name="size" required placeholder="Ex: 275/80 R22.5">
                </div>
            </div>
            <div class="form-group">
                <label>Observações</label>
                <textarea class="form-control" name="observations" rows="2" placeholder="Ex: Pneu recapado, avaria lateral..."></textarea>
            </div>
            <hr style="margin: 20px 0; border: 0; border-top: 1px solid var(--border-color);">
            <div style="display: flex; gap: 16px;">
                 <div class="form-group" style="flex: 1;">
                    <label>Alocação no Veículo</label>
                    <select class="form-control" name="vehicleId">
                        ${vehicleOptions}
                    </select>
                </div>
                <div class="form-group" style="flex: 1;">
                    <label>Posição / Eixo</label>
                    <select class="form-control" name="position">
                        <option value="Estoque">Estoque (Não aplicado)</option>
                        <option value="Dianteiro Direito">Dianteiro Direito</option>
                        <option value="Dianteiro Esquerdo">Dianteiro Esquerdo</option>
                        <option value="Traseiro Direito (Ext)">Traseiro Direito (Ext)</option>
                        <option value="Traseiro Direito (Int)">Traseiro Direito (Int)</option>
                        <option value="Traseiro Esquerdo (Ext)">Traseiro Esquerdo (Ext)</option>
                        <option value="Traseiro Esquerdo (Int)">Traseiro Esquerdo (Int)</option>
                        <option value="Quarto Eixo Direito">Quarto Eixo Direito</option>
                        <option value="Quarto Eixo Esquerdo">Quarto Eixo Esquerdo</option>
                        <option value="Estepe">Estepe</option>
                    </select>
                </div>
            </div>
        `;

        window.UI.showModal('Instalar Pneu', formHtml, async (formData) => {
            await window.db.add('tires', formData);
            window.App.navigate('tires');
        });
    }
};
