/**
 * Maintenance Module
 * Agendamentos e Registros de Serviços
 */

window.MaintenanceModule = {
    async render(container) {
        const tasks = await window.db.get('maintenance');
        const vehicles = await window.db.get('vehicles');
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
            btn.addEventListener('click', async (e) => {
                const id = e.currentTarget.getAttribute('data-id');
                const task = await window.db.getById('maintenance', id);
                if (task) this.openCompleteModal(task);
            });
        });

        document.querySelectorAll('.action-btn.delete').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const id = e.currentTarget.getAttribute('data-id');
                if (confirm('Excluir registro de manutenção?')) {
                    await window.db.delete('maintenance', id);
                    window.App.navigate('maintenance');
                    window.App.updateAlerts();
                }
            });
        });
    },

    async openFormModal() {
        const vehicles = await window.db.get('vehicles');
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

        window.UI.showModal('Nova Manutenção', formHtml, async (formData) => {
            const v = await window.db.getById('vehicles', formData.vehicleId);
            const dataToSave = {
                ...formData,
                vehiclePlate: v ? v.plate : 'Desconhecido'
            };
            await window.db.add('maintenance', dataToSave);
            window.App.updateAlerts();
            window.App.navigate('maintenance');
        });
    },

    async openCompleteModal(task) {
        const partsList = await window.db.get('parts');
        
        // Filter out parts with 0 stock
        const validParts = partsList.filter(p => Number(p.quantity) > 0);
        const partsOptions = validParts.map(p => 
            `<option value="${p.id}" data-price="${p.price}" data-max="${p.quantity}">[${p.code}] ${p.name} (Estoque: ${p.quantity} - R$ ${p.price})</option>`
        ).join('');

        const formHtml = `
            <div style="margin-bottom: 20px;">
                <p style="font-size: 0.95rem;">Completando: <strong>${task.service}</strong></p>
                <p style="font-size: 0.85rem; color: var(--text-secondary);">Mude o status para concluído e informe as peças utilizadas.</p>
            </div>
             <div class="form-group">
                <label>Status</label>
                <select class="form-control" name="status" required>
                    <option value="Concluído" selected>Marcar como Concluído</option>
                    <option value="Em Andamento">Continuar Em Andamento</option>
                </select>
            </div>
            
            <hr style="margin: 20px 0; border: 0; border-top: 1px solid var(--border-color);">
            <p style="font-weight: 500; margin-bottom: 12px; font-size: 0.9rem;">Peças Usadas do Estoque</p>
            
            <div id="parts-container">
                <div class="part-row" style="display: flex; gap: 8px; margin-bottom: 8px;">
                    <select class="form-control part-select" style="flex: 2;">
                        <option value="">-- Nenhuma peça --</option>
                        ${partsOptions}
                    </select>
                    <input type="number" class="form-control part-qty" placeholder="Qtd" min="1" value="1" style="flex: 1;">
                </div>
            </div>
            <button type="button" id="add-part-row-btn" class="btn" style="padding: 4px 8px; font-size: 0.8rem; margin-bottom: 16px;"><i class="fa-solid fa-plus"></i> Adicionar outra peça</button>

             <div class="form-group">
                <label>Valor Mão de Obra / Serviço Extra (R$)</label>
                <input type="number" class="form-control" id="calc-service-cost" step="0.01" value="${task.cost || 0}">
            </div>
            
             <div class="form-group" style="background: var(--bg-hover); padding: 12px; border-radius: 6px; border: 1px solid var(--border-color);">
                <label>Valor Final Total (Peças + Serviço)</label>
                <input type="number" class="form-control" name="cost" id="calc-total-cost" step="0.01" value="${task.cost || 0}" style="font-weight: bold; color: var(--primary-color);">
            </div>
        `;

        // Render modal but hijack normal UI.showModal since we need DOM manipulation after insertion
        window.UI.showModal('Finalizar Serviço', formHtml, async (formData) => {
            const container = document.getElementById('parts-container');
            const rows = container.querySelectorAll('.part-row');
            
            let usedPartsData = [];
            
            // Collect parts and deduct stock
            for (let row of rows) {
                const select = row.querySelector('.part-select');
                const qtyInput = row.querySelector('.part-qty');
                const partId = select.value;
                const qty = Number(qtyInput.value) || 0;
                
                if (partId && qty > 0) {
                    const originalPart = await window.db.getById('parts', partId);
                    if (originalPart) {
                        const newStock = Math.max(0, Number(originalPart.quantity) - qty);
                        await window.db.update('parts', partId, { quantity: newStock });
                        
                        usedPartsData.push({
                            id: partId,
                            name: originalPart.name,
                            code: originalPart.code,
                            qtyUsed: qty,
                            unitPrice: originalPart.price
                        });
                    }
                }
            }
            
            // Append used parts history to the task description or a new field
            if (usedPartsData.length > 0) {
                let partsLog = usedPartsData.map(p => `${p.qtyUsed}x ${p.name}`).join(', ');
                formData.service = `${task.service} (Peças: ${partsLog})`;
            }

            await window.db.update('maintenance', task.id, formData);

            window.App.updateAlerts();
            window.App.navigate('maintenance');
        }, 'Finalizar');
        
        // Wait for modal to be in DOM
        setTimeout(() => {
            const addBtn = document.getElementById('add-part-row-btn');
            const container = document.getElementById('parts-container');
            const serviceCostInput = document.getElementById('calc-service-cost');
            const totalCostInput = document.getElementById('calc-total-cost');
            
            const calculateTotal = () => {
                let partsTotal = 0;
                container.querySelectorAll('.part-row').forEach(row => {
                    const select = row.querySelector('.part-select');
                    const qty = Number(row.querySelector('.part-qty').value) || 0;
                    if (select.value && select.selectedOptions[0]) {
                        const price = Number(select.selectedOptions[0].getAttribute('data-price')) || 0;
                        partsTotal += (price * qty);
                    }
                });
                const serviceTotal = Number(serviceCostInput.value) || 0;
                totalCostInput.value = (partsTotal + serviceTotal).toFixed(2);
            };

            addBtn?.addEventListener('click', () => {
                const newRow = document.createElement('div');
                newRow.className = 'part-row';
                newRow.style.cssText = 'display: flex; gap: 8px; margin-bottom: 8px;';
                newRow.innerHTML = `
                    <select class="form-control part-select" style="flex: 2;">
                        <option value="">-- Nenhuma peça --</option>
                        ${partsOptions}
                    </select>
                    <input type="number" class="form-control part-qty" placeholder="Qtd" min="1" value="1" style="flex: 1;">
                    <button type="button" class="btn remove-part-btn" style="background: var(--danger-color); color: white; border: none; padding: 0 10px; border-radius: 4px;"><i class="fa-solid fa-xmark"></i></button>
                `;
                container.appendChild(newRow);
                
                newRow.querySelector('.remove-part-btn').addEventListener('click', () => {
                    newRow.remove();
                    calculateTotal();
                });
                
                newRow.querySelector('.part-select').addEventListener('change', calculateTotal);
                newRow.querySelector('.part-qty').addEventListener('input', calculateTotal);
            });
            
            // Attach calculation to first row 
            container.querySelector('.part-select')?.addEventListener('change', calculateTotal);
            container.querySelector('.part-qty')?.addEventListener('input', calculateTotal);
            serviceCostInput?.addEventListener('input', calculateTotal);
            
        }, 300);
    }
};
