/**
 * Caminhões Module
 * CRUD base de veículos da empresa ou de terceiros fixos.
 */
window.CaminhoesModule = {
    async render(container) {
        window.UI.renderView('Gerenciamento de Frota',
            '<button class="btn btn-primary" onclick="window.CaminhoesModule.openModal()"><i class="fa-solid fa-truck"></i> Novo Caminhão</button>',
            container,
            '<div class="loading-state"><i class="fa-solid fa-spinner fa-spin"></i> Carregando Frota...</div>'
        );

        this.container = container;
        await this.loadCaminhoes();
    },

    async loadCaminhoes() {
        try {
            const baseUrl = window.location.origin.includes('localhost') ? 'http://localhost:3000' : '';
            const res = await fetch(`${baseUrl}/api/conciliacao/caminhoes`);

            if (!res.ok) throw new Error('Erro ao buscar caminhões');
            const data = await res.json();

            this.renderTable(data);
        } catch (e) {
            console.error(e);
            this.container.querySelector('.page-content').innerHTML = window.UI.emptyState('Falha ao conectar com o servidor.', 'fa-plug-circle-xmark');
        }
    },

    renderTable(caminhoes) {
        if (caminhoes.length === 0) {
            this.container.querySelector('.page-content').innerHTML = window.UI.emptyState('Nenhum caminhão cadastrado.', 'fa-truck-fast');
            return;
        }

        let tbody = '';
        caminhoes.forEach(c => {
            const safeObjStr = JSON.stringify(c).replace(/'/g, "&#39;").replace(/"/g, '&quot;');

            tbody += `
                <tr>
                    <td><strong style="font-size: 1.1rem; letter-spacing: 2px;">${c.placa}</strong></td>
                    <td>${c.proprietario || 'Próprio'}</td>
                    <td>${Number(c.capacidade_kg).toLocaleString('pt-BR')} kg</td>
                    <td>
                        <span style="display: inline-block; padding: 4px 10px; border-radius: 20px; font-size: 0.8rem; background: ${c.status === 'Ativo' ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)'}; color: ${c.status === 'Ativo' ? '#10b981' : '#ef4444'}">
                            <i class="fa-solid ${c.status === 'Ativo' ? 'fa-check' : 'fa-xmark'}"></i> ${c.status}
                        </span>
                    </td>
                    <td class="actions-cell">
                        <button class="btn btn-icon" title="Editar" onclick="window.CaminhoesModule.openModal('${safeObjStr}')"><i class="fa-solid fa-pen"></i></button>
                        <button class="btn btn-icon" title="Excluir" style="color: #ef4444" onclick="window.CaminhoesModule.deleteCaminhao('${c.placa}')"><i class="fa-solid fa-trash"></i></button>
                    </td>
                </tr>
            `;
        });

        const tableHtml = `
            <div class="table-container">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Placa</th>
                            <th>Proprietário/Motorista Fixo</th>
                            <th>Capacidade Máxima</th>
                            <th>Status Operacional</th>
                            <th class="actions-cell">Ações</th>
                        </tr>
                    </thead>
                    <tbody>${tbody}</tbody>
                </table>
            </div>

            <!-- Modal Caminhão -->
            <div id="cam-modal" class="modal" style="display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.8); z-index: 1000; align-items: center; justify-content: center;">
                <div class="modal-content" style="background: var(--bg-color); border: 1px solid var(--border-color); border-radius: 12px; padding: 2rem; width: 100%; max-width: 400px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem;">
                        <h2 id="cam-modal-title" style="margin: 0;">Novo Caminhão</h2>
                        <button class="btn btn-icon" type="button" onclick="window.CaminhoesModule.closeModal()"><i class="fa-solid fa-xmark"></i></button>
                    </div>
                    
                    <form id="cam-form" onsubmit="window.CaminhoesModule.saveCaminhao(event)">
                        <input type="hidden" id="cam-is-edit" value="false">
                        <input type="hidden" id="cam-placa-original" value="">
                        
                        <div class="form-group" style="margin-bottom: 1rem;">
                            <label>Placa do Veículo *</label>
                            <input type="text" id="cam-placa" class="form-control" required placeholder="ABC-1234" style="text-transform: uppercase; font-size: 1.2rem; letter-spacing: 2px;">
                        </div>

                        <div class="form-group" style="margin-bottom: 1rem;">
                            <label>Proprietário ou Nome do Motorista Fixo</label>
                            <input type="text" id="cam-proprietario" class="form-control" placeholder="Ferro Velho SRM ou João da Silva">
                        </div>

                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1.5rem;">
                            <div class="form-group">
                                <label>Capacidade (KG)</label>
                                <input type="number" id="cam-cap" class="form-control" placeholder="Ex: 35000">
                            </div>
                            <div class="form-group">
                                <label>Status</label>
                                <select id="cam-status" class="form-control">
                                    <option value="Ativo">Ativo na Frota</option>
                                    <option value="Inativo">Inativo / Oficina</option>
                                </select>
                            </div>
                        </div>

                        <div style="display: flex; gap: 1rem; justify-content: flex-end;">
                            <button type="button" class="btn btn-secondary" onclick="window.CaminhoesModule.closeModal()">Cancelar</button>
                            <button type="submit" class="btn btn-primary"><i class="fa-solid fa-save"></i> Salvar</button>
                        </div>
                    </form>
                </div>
            </div>
        `;

        this.container.querySelector('.page-content').innerHTML = tableHtml;
    },

    openModal(objStr = null) {
        const modal = document.getElementById('cam-modal');
        const isEditObj = document.getElementById('cam-is-edit');
        const originalInput = document.getElementById('cam-placa-original');

        document.getElementById('cam-form').reset();
        modal.style.display = 'flex';

        if (objStr) {
            const c = JSON.parse(objStr);
            document.getElementById('cam-modal-title').innerText = 'Editar Caminhão';
            isEditObj.value = 'true';
            originalInput.value = c.placa;

            document.getElementById('cam-placa').value = c.placa;
            document.getElementById('cam-proprietario').value = c.proprietario || '';
            document.getElementById('cam-cap').value = c.capacidade_kg || '';
            document.getElementById('cam-status').value = c.status || 'Ativo';
        } else {
            document.getElementById('cam-modal-title').innerText = 'Novo Caminhão';
            isEditObj.value = 'false';
            originalInput.value = '';
        }
    },

    closeModal() {
        document.getElementById('cam-modal').style.display = 'none';
    },

    async saveCaminhao(event) {
        event.preventDefault();

        const isEdit = document.getElementById('cam-is-edit').value === 'true';
        const originalPlaca = document.getElementById('cam-placa-original').value;
        const novaPlaca = document.getElementById('cam-placa').value;

        const payload = {
            placa: novaPlaca,
            proprietario: document.getElementById('cam-proprietario').value,
            capacidade_kg: document.getElementById('cam-cap').value || 0,
            status: document.getElementById('cam-status').value
        };

        const baseUrl = window.location.origin.includes('localhost') ? 'http://localhost:3000' : '';
        const url = isEdit ? `${baseUrl}/api/conciliacao/caminhoes/${originalPlaca}` : `${baseUrl}/api/conciliacao/caminhoes`;
        const method = isEdit ? 'PUT' : 'POST';

        try {
            const res = await fetch(url, {
                method: method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const data = await res.json();

            if (!res.ok) throw new Error(data.error || 'Falha ao salvar caminhão.');

            this.closeModal();
            this.container.querySelector('.page-content').innerHTML = '<div class="loading-state"><i class="fa-solid fa-spinner fa-spin"></i> Atualizando...</div>';
            await this.loadCaminhoes();

        } catch (e) {
            alert('Erro: ' + e.message);
        }
    },

    async deleteCaminhao(placa) {
        if (!confirm(`Deseja DELETAR o caminhão placa ${placa}? Essa ação não tem volta.`)) return;

        const baseUrl = window.location.origin.includes('localhost') ? 'http://localhost:3000' : '';
        try {
            const res = await fetch(`${baseUrl}/api/conciliacao/caminhoes/${placa}`, { method: 'DELETE' });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || 'Falha ao deletar (Pode estar associado a viagens)');
            }

            this.container.querySelector('.page-content').innerHTML = '<div class="loading-state"><i class="fa-solid fa-spinner fa-spin"></i> Atualizando...</div>';
            await this.loadCaminhoes();
        } catch (e) {
            alert('Aviso: ' + e.message);
        }
    }
};
