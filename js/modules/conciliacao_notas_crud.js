/**
 * Módulo de Gerenciamento Individual de Notas Fiscais (CRUD)
 */
window.NotasFiscaisModule = {
    async render(container) {
        window.UI.renderView('Gerenciamento de Notas Fiscais',
            '<button class="btn btn-primary" onclick="window.NotasFiscaisModule.openModal()"><i class="fa-solid fa-plus"></i> Nova Nota Manual</button>',
            container,
            '<div class="loading-state"><i class="fa-solid fa-spinner fa-spin"></i> Carregando Notas Fiscais...</div>'
        );

        this.container = container;
        await this.loadNotas();
    },

    async loadNotas() {
        try {
            const baseUrl = window.location.origin.includes('localhost') ? 'http://localhost:3000' : '';
            const res = await fetch(`${baseUrl}/api/conciliacao/notas`);

            if (!res.ok) throw new Error('Erro ao buscar notas');
            const notas = await res.json();

            this.renderTable(notas);
        } catch (e) {
            console.error(e);
            this.container.querySelector('.page-content').innerHTML = window.UI.emptyState('Falha ao carregar as Notas Fiscais do Banco de Dados.', 'fa-triangle-exclamation');
        }
    },

    renderTable(notas) {
        if (notas.length === 0) {
            this.container.querySelector('.page-content').innerHTML = window.UI.emptyState('Nenhuma Nota Fiscal encontrada.', 'fa-file-invoice');
            return;
        }

        const fmtDate = (isoString) => isoString ? new Date(isoString).toLocaleDateString('pt-BR') : '';
        const fmtMoney = (val) => Number(val).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

        let tbody = '';
        notas.forEach(nota => {
            const safeNotaStr = JSON.stringify(nota).replace(/'/g, "&#39;").replace(/"/g, '&quot;');

            tbody += `
                <tr>
                    <td><strong>${nota.numero_nota || '-'}</strong></td>
                    <td>${fmtDate(nota.data_emissao)}</td>
                    <td>${nota.fornecedor || '-'}</td>
                    <td><span class="status-badge status-conciliada">${nota.origem_material || '-'}</span></td>
                    <td style="text-align: right; font-weight: bold;">${fmtMoney(nota.valor_total || 0)}</td>
                    <td class="actions-cell">
                        <button class="btn btn-icon" title="Editar" onclick="window.NotasFiscaisModule.openModal('${safeNotaStr}')"><i class="fa-solid fa-pen"></i></button>
                        <button class="btn btn-icon" title="Excluir" style="color: #ef4444" onclick="window.NotasFiscaisModule.deleteNota('${nota.numero_nota}')"><i class="fa-solid fa-trash"></i></button>
                    </td>
                </tr>
            `;
        });

        const tableHtml = `
            <div class="table-container">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Nº Nota</th>
                            <th>Data Emissão</th>
                            <th>Fornecedor</th>
                            <th>Origem (Patio/Sucateiro)</th>
                            <th style="text-align: right;">Faturamento (R$)</th>
                            <th class="actions-cell">Ações</th>
                        </tr>
                    </thead>
                    <tbody>${tbody}</tbody>
                </table>
            </div>
            
            <!-- Modal Container (Hidden by default) -->
            <div id="nota-modal" class="modal" style="display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.8); z-index: 1000; align-items: center; justify-content: center;">
                <div class="modal-content" style="background: var(--bg-color); border: 1px solid var(--border-color); border-radius: 12px; padding: 2rem; width: 100%; max-width: 500px; max-height: 90vh; overflow-y: auto;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem;">
                        <h2 id="modal-title" style="margin: 0;">Nova Nota Fiscal</h2>
                        <button class="btn btn-icon" onclick="window.NotasFiscaisModule.closeModal()"><i class="fa-solid fa-xmark"></i></button>
                    </div>
                    
                    <form id="nota-form" onsubmit="window.NotasFiscaisModule.saveNota(event)">
                        <input type="hidden" id="nota-is-edit" value="false">
                        
                        <div class="form-group" style="margin-bottom: 1rem;">
                            <label>Número da Nota</label>
                            <input type="text" id="nota-numero" class="form-control" required placeholder="Ex: 15486">
                            <small style="color: #f59e0b; display: none;" id="nota-numero-warning">O número não pode ser alterado em modo de edição.</small>
                        </div>
                        
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1rem;">
                            <div class="form-group">
                                <label>Data de Emissão</label>
                                <input type="date" id="nota-data" class="form-control" required>
                            </div>
                            <div class="form-group">
                                <label>Origem (Tipo)</label>
                                <select id="nota-origem" class="form-control" required>
                                    <option value="Fornecedor">Fornecedor / Sucateiro</option>
                                    <option value="Patio">Pátio G.A (Próprio)</option>
                                    <option value="Terceiro">Terceiro Avulso</option>
                                    <option value="Indefinida">Indefinida</option>
                                </select>
                            </div>
                        </div>

                        <div class="form-group" style="margin-bottom: 1rem;">
                            <label>Nome do Fornecedor / Empresa</label>
                            <input type="text" id="nota-fornecedor" class="form-control" required placeholder="Ex: Sucatas Maia LTDA">
                        </div>

                        <div class="form-group" style="margin-bottom: 1.5rem;">
                            <label>Valor Total da Nota (R$)</label>
                            <input type="number" step="0.01" id="nota-valor" class="form-control" required placeholder="0.00">
                        </div>
                        
                        <div style="display: flex; gap: 1rem; justify-content: flex-end;">
                            <button type="button" class="btn btn-secondary" onclick="window.NotasFiscaisModule.closeModal()">Cancelar</button>
                            <button type="submit" class="btn btn-primary"><i class="fa-solid fa-save"></i> Salvar Registro</button>
                        </div>
                    </form>
                </div>
            </div>
        `;

        this.container.querySelector('.page-content').innerHTML = tableHtml;
    },

    openModal(notaSpyStr = null) {
        const modal = document.getElementById('nota-modal');
        const isEditObj = document.getElementById('nota-is-edit');
        const numInput = document.getElementById('nota-numero');
        const warning = document.getElementById('nota-numero-warning');

        document.getElementById('nota-form').reset();
        modal.style.display = 'flex';

        if (notaSpyStr) {
            // Modo Edição
            const nota = JSON.parse(notaSpyStr);
            document.getElementById('modal-title').innerText = 'Editar Nota Fiscal';
            isEditObj.value = 'true';

            numInput.value = nota.numero_nota;
            numInput.readOnly = true;
            numInput.style.opacity = '0.7';
            warning.style.display = 'block';

            if (nota.data_emissao) {
                document.getElementById('nota-data').value = nota.data_emissao.split('T')[0];
            }
            document.getElementById('nota-fornecedor').value = nota.fornecedor;
            document.getElementById('nota-origem').value = nota.origem_material;
            document.getElementById('nota-valor').value = nota.valor_total;
        } else {
            // Modo Criação
            document.getElementById('modal-title').innerText = 'Nova Nota Fiscal';
            isEditObj.value = 'false';
            numInput.readOnly = false;
            numInput.style.opacity = '1';
            warning.style.display = 'none';
            document.getElementById('nota-data').value = new Date().toISOString().split('T')[0];
        }
    },

    closeModal() {
        document.getElementById('nota-modal').style.display = 'none';
    },

    async saveNota(event) {
        event.preventDefault();

        const isEdit = document.getElementById('nota-is-edit').value === 'true';
        const numero_nota = document.getElementById('nota-numero').value;

        const payload = {
            numero_nota: numero_nota,
            data_emissao: document.getElementById('nota-data').value,
            fornecedor: document.getElementById('nota-fornecedor').value,
            origem_material: document.getElementById('nota-origem').value,
            valor_total: document.getElementById('nota-valor').value
        };

        const baseUrl = window.location.origin.includes('localhost') ? 'http://localhost:3000' : '';
        const url = isEdit ? `${baseUrl}/api/conciliacao/notas/${numero_nota}` : `${baseUrl}/api/conciliacao/notas`;
        const method = isEdit ? 'PUT' : 'POST';

        try {
            const res = await fetch(url, {
                method: method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!res.ok) throw new Error('Falha ao salvar a Nota Fiscal.');

            this.closeModal();
            this.container.querySelector('.page-content').innerHTML = '<div class="loading-state"><i class="fa-solid fa-spinner fa-spin"></i> Atualizando Tabela...</div>';
            await this.loadNotas();

        } catch (e) {
            alert('Erro ao Salvar: ' + e.message);
        }
    },

    async deleteNota(id) {
        if (!confirm(`Tem certeza que deseja DELETAR a Nota Fiscal Nº ${id}?\n\nISSO EXCLUIRÁ TODOS OS ITENS DE SYGECOM E GERDAU VINCULADOS A ELA DEFINITIVAMENTE.`)) {
            return;
        }

        const baseUrl = window.location.origin.includes('localhost') ? 'http://localhost:3000' : '';
        try {
            const res = await fetch(`${baseUrl}/api/conciliacao/notas/${id}`, { method: 'DELETE' });
            if (!res.ok) throw new Error('Falha ao deletar');

            this.container.querySelector('.page-content').innerHTML = '<div class="loading-state"><i class="fa-solid fa-spinner fa-spin"></i> Atualizando Tabela...</div>';
            await this.loadNotas();
        } catch (e) {
            alert('Erro ao excluir: ' + e.message);
        }
    }
};
