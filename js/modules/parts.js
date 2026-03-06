/**
 * Parts Module
 * Controle de Estoque de Peças e Filtros
 */

window.PartsModule = {
    render(container) {
        const parts = window.db.get('parts');

        let actionsHtml = `<button class="btn btn-primary" id="add-part-btn"><i class="fa-solid fa-plus"></i> Nova Peça</button>`;

        let tableRows = parts.map(p => {
            const lowStock = Number(p.quantity) <= Number(p.minQuantity);
            return `
            <tr style="${lowStock ? 'background-color: rgba(239, 68, 68, 0.05);' : ''}">
                <td><strong>${p.code}</strong></td>
                <td>${p.name}</td>
                <td>${p.category}</td>
                <td>
                    <span style="${lowStock ? 'color: var(--danger-color); font-weight: bold;' : ''}">
                        ${p.quantity} un
                    </span>
                    <small style="color: var(--text-secondary)"> (Mín: ${p.minQuantity})</small>
                </td>
                <td>${window.UI.formatCurrency(p.price)}</td>
                <td>
                    <button class="action-btn edit" data-id="${p.id}" title="Adicionar/Remover Estoque"><i class="fa-solid fa-boxes-packing"></i></button>
                    <button class="action-btn delete" data-id="${p.id}" title="Remover"><i class="fa-solid fa-trash"></i></button>
                </td>
            </tr>
            `;
        }).join('');

        if (parts.length === 0) {
            tableRows = `<tr><td colspan="6">${window.UI.emptyState('Estoque vazio', 'fa-boxes-stacked')}</td></tr>`;
        }

        const contentHtml = `
            <div class="metrics-grid" style="grid-template-columns: repeat(3, 1fr);">
                <div class="metric-card" style="padding: 16px;">
                    <div>
                        <h3 style="color: var(--text-secondary); font-size: 0.85rem; margin-bottom: 4px;">Itens Cadastrados</h3>
                        <div style="font-size: 1.5rem; font-weight: 700;">${parts.length}</div>
                    </div>
                </div>
                <div class="metric-card" style="padding: 16px;">
                    <div>
                        <h3 style="color: var(--text-secondary); font-size: 0.85rem; margin-bottom: 4px;">Itens em Estoque Baixo</h3>
                        <div style="font-size: 1.5rem; font-weight: 700; color: var(--danger-color);">
                            ${parts.filter(p => Number(p.quantity) <= Number(p.minQuantity)).length}
                        </div>
                    </div>
                </div>
                 <div class="metric-card" style="padding: 16px;">
                    <div>
                        <h3 style="color: var(--text-secondary); font-size: 0.85rem; margin-bottom: 4px;">Valor Total em Estoque</h3>
                        <div style="font-size: 1.5rem; font-weight: 700;">
                            ${window.UI.formatCurrency(parts.reduce((sum, p) => sum + (Number(p.quantity) * Number(p.price)), 0))}
                        </div>
                    </div>
                </div>
            </div>

            <div class="table-container">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Código SKU</th>
                            <th>Descrição</th>
                            <th>Categoria</th>
                            <th>Estoque Atual</th>
                            <th>Preço Unit.</th>
                            <th>Ações</th>
                        </tr>
                    </thead>
                    <tbody>${tableRows}</tbody>
                </table>
            </div>
        `;

        window.UI.renderView('Estoque de Peças', actionsHtml, container, contentHtml);
        this.attachEventListeners();
    },

    attachEventListeners() {
        document.getElementById('add-part-btn')?.addEventListener('click', () => this.openFormModal());

        document.querySelectorAll('.action-btn.edit').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.currentTarget.getAttribute('data-id');
                const part = window.db.getById('parts', id);
                if (part) this.openStockUpdateModal(part);
            });
        });

        document.querySelectorAll('.action-btn.delete').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.currentTarget.getAttribute('data-id');
                if (confirm('Remover esta peça do cadastro?')) {
                    window.db.delete('parts', id);
                    window.App.navigate('parts');
                }
            });
        });
    },

    openFormModal() {
        const formHtml = `
            <div class="form-group">
                <label>Código Interno / SKU</label>
                <input type="text" class="form-control" name="code" required placeholder="Ex: FLT-123">
            </div>
            <div class="form-group">
                <label>Descrição do Item</label>
                <input type="text" class="form-control" name="name" required placeholder="Ex: Filtro de Óleo Diesel">
            </div>
            <div style="display: flex; gap: 16px;">
                 <div class="form-group" style="flex: 1;">
                    <label>Categoria</label>
                    <select class="form-control" name="category" required>
                        <option value="Filtros">Filtros</option>
                        <option value="Óleos/Fluidos">Óleos/Fluidos</option>
                        <option value="Freios">Freios</option>
                        <option value="Suspensão">Suspensão</option>
                        <option value="Elétrica">Elétrica</option>
                        <option value="Geral">Geral</option>
                    </select>
                </div>
                <div class="form-group" style="flex: 1;">
                    <label>Preço Unitário (R$)</label>
                    <input type="number" class="form-control" name="price" step="0.01" required min="0">
                </div>
            </div>
            <div style="display: flex; gap: 16px;">
                <div class="form-group" style="flex: 1;">
                    <label>Qtd. Inicial</label>
                    <input type="number" class="form-control" name="quantity" required min="0" value="0">
                </div>
                 <div class="form-group" style="flex: 1;">
                    <label>Estoque Mínimo (Alerta)</label>
                    <input type="number" class="form-control" name="minQuantity" required min="0" value="2">
                </div>
            </div>
        `;

        window.UI.showModal('Cadastrar Peça', formHtml, (formData) => {
            window.db.add('parts', formData);
            window.App.navigate('parts');
        });
    },

    openStockUpdateModal(part) {
        const formHtml = `
            <div style="text-align: center; margin-bottom: 20px;">
                <h3>${part.name}</h3>
                <p style="color: var(--text-secondary); margin-top: 4px;">Estoque Atual: <strong>${part.quantity} un</strong></p>
            </div>
            <hr style="margin: 20px 0; border: 0; border-top: 1px solid var(--border-color);">
            <div class="form-group">
                <label>Novo Valor Total em Estoque</label>
                <input type="number" class="form-control" name="quantity" required min="0" value="${part.quantity}">
            </div>
        `;

        window.UI.showModal('Ajuste de Estoque', formHtml, (formData) => {
            window.db.update('parts', part.id, { quantity: formData.quantity });
            window.App.navigate('parts');
        }, 'Atualizar');
    }
};
