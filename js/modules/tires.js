/**
 * Tires Module
 * Controle de Pneus na frota
 */

window.TiresModule = {
    render(container) {
        const tires = window.db.get('tires');
        const vehicles = window.db.get('vehicles');
        const vehicleMap = {};
        vehicles.forEach(v => vehicleMap[v.id] = v.plate);

        let actionsHtml = `<button class="btn btn-primary" id="add-tire-btn"><i class="fa-solid fa-plus"></i> Cadastrar Pneu</button>`;

        let tableRows = tires.map(t => {
            const usage = ((t.currentKm / t.lifeSpanKm) * 100).toFixed(0);
            let statusBadge = usage > 85 ? '<span class="status-badge status-inactive">Troca Urgente</span>' :
                usage > 60 ? '<span class="status-badge status-maintenance">Em Uso</span>' :
                    '<span class="status-badge status-active">Bom Estado</span>';

            return `
            <tr>
                <td><strong>${t.serialCode}</strong></td>
                <td>${t.brand}</td>
                <td>${t.size}</td>
                <td>${vehicleMap[t.vehicleId] || 'Estoque'} - ${t.position}</td>
                <td>
                    <div style="background: var(--bg-main); border-radius: 4px; height: 8px; width: 100%; margin-bottom: 4px; overflow: hidden;">
                        <div style="background: ${usage > 85 ? 'var(--danger-color)' : usage > 60 ? 'var(--warning-color)' : 'var(--success-color)'}; width: ${usage}%; height: 100%;"></div>
                    </div>
                    <small style="color: var(--text-secondary)">${t.currentKm} / ${t.lifeSpanKm} km (${usage}%)</small>
                </td>
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
                            <th>Desgaste (Vida Útil)</th>
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
            btn.addEventListener('click', (e) => {
                const id = e.currentTarget.getAttribute('data-id');
                if (confirm('Tem certeza que deseja remover este pneu do sistema?')) {
                    window.db.delete('tires', id);
                    window.App.navigate('tires');
                }
            });
        });
    },

    openFormModal() {
        const vehicles = window.db.get('vehicles');
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
                <div class="form-group" style="flex: 1;">
                    <label>Vida Útil Estimada (Km)</label>
                    <input type="number" class="form-control" name="lifeSpanKm" required value="100000">
                </div>
            </div>
            <div class="form-group">
                <label>Km Rodados Anteriormente (Opcional)</label>
                <input type="number" class="form-control" name="currentKm" value="0">
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

        window.UI.showModal('Cadastrar Novo Pneu', formHtml, (formData) => {
            window.db.add('tires', formData);
            window.App.navigate('tires');
        });
    }
};
