/**
 * Maintenance Module
 * Agendamentos e Registros de Serviços
 */

window.MaintenanceModule = {
    render(container) {
        const tasks = window.db.get('maintenance');
        const vehicles = window.db.get('vehicles');
        const vehicleMap = {};
        vehicles.forEach(v => vehicleMap[v.id] = v.plate);

        let actionsHtml = `<button class="btn btn-primary" id="add-maint-btn"><i class="fa-solid fa-plus"></i> Novo Serviço / Agendamento</button>`;

        let tableRows = tasks.map(t => {
            let statusBadge = '';
            if (t.status === 'Concluído') statusBadge = '<span class="status-badge status-active">Concluído</span>';
            if (t.status === 'Em Andamento') statusBadge = '<span class="status-badge status-maintenance">Em Andamento</span>';
            if (t.status === 'Pendente') statusBadge = '<span class="status-badge status-inactive">Agendado/Pendente</span>';

            return `
            <tr>
                <td>${vehicleMap[t.vehicleId] || 'Veículo Excluído'}</td>
                <td><strong>${t.service}</strong></td>
                <td>${t.type}</td>
                <td>${t.dueKm ? t.dueKm + ' km' : t.dueDate ? new Date(t.dueDate).toLocaleDateString('pt-BR') : 'N/A'}</td>
                <td>${window.UI.formatCurrency(t.cost || 0)}</td>
                <td>${statusBadge}</td>
                <td>
                    ${t.status !== 'Concluído' ? `<button class="action-btn edit" data-id="${t.id}" title="Finalizar e Cobrar"><i class="fa-solid fa-check-double"></i></button>` : ''}
                    <button class="action-btn delete" data-id="${t.id}" title="Remover"><i class="fa-solid fa-trash"></i></button>
                </td>
            </tr>
            `;
        }).join('');

        if (tasks.length === 0) {
            tableRows = `<tr><td colspan="7">${window.UI.emptyState('Nenhum serviço ou agendamento', 'fa-wrench')}</td></tr>`;
        }

        const contentHtml = `
            <div class="table-container">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Veículo</th>
                            <th>Serviço Especificado</th>
                            <th>Tipo</th>
                            <th>Para / Vencimento</th>
                            <th>Custo Orçado/Real</th>
                            <th>Status</th>
                            <th>Ações</th>
                        </tr>
                    </thead>
                    <tbody>${tableRows}</tbody>
                </table>
            </div>
        `;

        window.UI.renderView('Manutenções e Revisões', actionsHtml, container, contentHtml);
        this.attachEventListeners();
    },

    attachEventListeners() {
        document.getElementById('add-maint-btn')?.addEventListener('click', () => this.openFormModal());

        document.querySelectorAll('.action-btn.edit').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.currentTarget.getAttribute('data-id');
                const task = window.db.getById('maintenance', id);
                if (task) this.openCompleteModal(task);
            });
        });

        document.querySelectorAll('.action-btn.delete').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.currentTarget.getAttribute('data-id');
                if (confirm('Excluir registro de manutenção?')) {
                    window.db.delete('maintenance', id);
                    window.App.navigate('maintenance');
                    window.App.updateAlerts();
                }
            });
        });
    },

    openFormModal() {
        const vehicles = window.db.get('vehicles');
        if (vehicles.length === 0) { alert('Você precisa de veículos cadastrados.'); return; }

        const vehicleOptions = vehicles.map(v => `<option value="${v.id}">${v.plate} (Km atual: ${v.mileage})</option>`).join('');

        const formHtml = `
            <div class="form-group">
                <label>Veículo</label>
                <select class="form-control" name="vehicleId" required>
                    ${vehicleOptions}
                </select>
                <small style="color: var(--text-secondary); margin-top: 4px; display: block;" id="maint-vehicle-hint"></small>
            </div>
            <div class="form-group">
                <label>Descrição do Serviço</label>
                <input type="text" class="form-control" name="service" required placeholder="Ex: Troca de óleo da caixa e filtros">
            </div>
            <div style="display: flex; gap: 16px;">
                 <div class="form-group" style="flex: 1;">
                    <label>Tipo de Manutenção</label>
                    <select class="form-control" name="type" required>
                        <option value="Elétrica">Elétrica</option>
                        <option value="Funilaria">Funilaria</option>
                        <option value="Hidráulica">Hidráulica</option>
                        <option value="Mecânica">Mecânica</option>
                    </select>
                </div>
                 <div class="form-group" style="flex: 1;">
                    <label>Status</label>
                    <select class="form-control" name="status" required>
                        <option value="Pendente">Agendar Futuro (Pendente)</option>
                        <option value="Em Andamento">Em Andamento na Oficina</option>
                        <option value="Concluído">Já Realizado / Finalizado</option>
                    </select>
                </div>
            </div>
             <hr style="margin: 20px 0; border: 0; border-top: 1px solid var(--border-color);">
             <p style="font-weight: 500; margin-bottom: 12px; font-size: 0.9rem;">Agendamento ou Gatilho <small>(preencha data E/OU quilometragem)</small></p>
            <div style="display: flex; gap: 16px;">
                <div class="form-group" style="flex: 1;">
                    <label>Data Prevista</label>
                    <input type="date" class="form-control" name="dueDate">
                </div>
                 <div class="form-group" style="flex: 1;">
                    <label>Realizar com (Km)</label>
                    <input type="number" class="form-control" name="dueKm" placeholder="Ex: 50000">
                </div>
            </div>
             <div class="form-group">
                <label>Custo Orçado/Gasto (R$)</label>
                <input type="number" class="form-control" name="cost" step="0.01" value="0">
            </div>
        `;

        window.UI.showModal('Nova Manutenção', formHtml, (formData) => {
            const v = window.db.getById('vehicles', formData.vehicleId);
            const dataToSave = {
                ...formData,
                vehiclePlate: v ? v.plate : 'Desconhecido'
            };
            window.db.add('maintenance', dataToSave);
            window.App.updateAlerts();
            window.App.navigate('maintenance');
        });
    },

    openCompleteModal(task) {
        const formHtml = `
            <div style="margin-bottom: 20px;">
                <p style="font-size: 0.95rem;">Completando: <strong>${task.service}</strong></p>
                <p style="font-size: 0.85rem; color: var(--text-secondary);">Mude o status para concluído e ajuste o valor final se necessário.</p>
            </div>
             <div class="form-group">
                <label>Status</label>
                <select class="form-control" name="status" required>
                    <option value="Concluído" selected>Marcar como Concluído</option>
                    <option value="Em Andamento">Continuar Em Andamento</option>
                </select>
            </div>
             <div class="form-group">
                <label>Valor Final Fechado (R$)</label>
                <input type="number" class="form-control" name="cost" step="0.01" value="${task.cost || 0}">
            </div>
        `;

        window.UI.showModal('Finalizar Serviço', formHtml, (formData) => {
            window.db.update('maintenance', task.id, formData);

            // Should prompt vehicle status change to active maybe, keep it simple for now
            window.App.updateAlerts();
            window.App.navigate('maintenance');
        }, 'Finalizar');
    }
};
