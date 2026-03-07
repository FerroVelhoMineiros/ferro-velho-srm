/**
 * Viagens (Fretes) Module
 * CRUD de viagens e controle de fretes ligados a um Caminhão válido.
 */
window.ViagensModule = {
    async render(container) {
        window.UI.renderView('Controle de Viagens (Frete)',
            '<button class="btn btn-primary" onclick="window.ViagensModule.openModal()"><i class="fa-solid fa-route"></i> Registrar Viagem</button>',
            container,
            '<div class="loading-state"><i class="fa-solid fa-spinner fa-spin"></i> Carregando Logística...</div>'
        );

        this.container = container;

        // Carrega as viagens e os caminhões (para o select do formulário) em paralelo
        await Promise.all([
            this.loadViagens(),
            this.loadCaminhoesDrop()
        ]);
    },

    caminhoesAtivos: [],

    async loadCaminhoesDrop() {
        try {
            const baseUrl = window.location.origin.includes('localhost') ? 'http://localhost:3000' : '';
            const res = await fetch(`${baseUrl}/api/conciliacao/caminhoes`);
            if (res.ok) {
                const dados = await res.json();
                this.caminhoesAtivos = dados.filter(c => c.status === 'Ativo');
            }
        } catch (e) { console.error("Falha ao carregar frota para o select"); }
    },

    async loadViagens() {
        try {
            const baseUrl = window.location.origin.includes('localhost') ? 'http://localhost:3000' : '';
            const res = await fetch(`${baseUrl}/api/conciliacao/viagens`);

            if (!res.ok) throw new Error('Erro ao buscar viagens');
            const data = await res.json();

            this.renderTable(data);
        } catch (e) {
            console.error(e);
            this.container.querySelector('.page-content').innerHTML = window.UI.emptyState('Falha ao conectar com o servidor.', 'fa-plug-circle-xmark');
        }
    },

    renderTable(viagens) {
        if (viagens.length === 0) {
            this.container.querySelector('.page-content').innerHTML = window.UI.emptyState('Nenhuma viagem logada no sistema.', 'fa-road');
            return;
        }

        const fmtDate = (iso) => iso ? new Date(iso).toLocaleDateString('pt-BR') : '';
        const fmtMoney = (val) => Number(val).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

        let tbody = '';
        viagens.forEach(v => {
            const safeObjStr = JSON.stringify(v).replace(/'/g, "&#39;").replace(/"/g, '&quot;');

            let statusColor = '#94a3b8'; // default
            if (v.status_pagamento === 'Pago') statusColor = '#10b981';
            if (v.status_pagamento === 'Faturado') statusColor = '#3b82f6';
            if (v.status_pagamento === 'Pendente') statusColor = '#f59e0b';

            tbody += `
                <tr>
                    <td><strong>${v.placa}</strong> <br> <small style="color:var(--text-muted)">${v.proprietario || '?'}</small></td>
                    <td>${fmtDate(v.data_viagem)}</td>
                    <td>${v.destino || '-'}</td>
                    <td style="font-weight: bold;">${fmtMoney(v.valor_frete || 0)}</td>
                    <td><span style="color: ${statusColor}; font-weight: bold;"><i class="fa-solid fa-circle" style="font-size: 8px; vertical-align: middle;"></i> ${v.status_pagamento || '-'}</span></td>
                    <td class="actions-cell">
                        <button class="btn btn-icon" title="Editar" onclick="window.ViagensModule.openModal('${safeObjStr}')"><i class="fa-solid fa-pen"></i></button>
                        <button class="btn btn-icon" title="Excluir" style="color: #ef4444" onclick="window.ViagensModule.deleteViagem('${v.id}')"><i class="fa-solid fa-trash"></i></button>
                    </td>
                </tr>
            `;
        });

        // Monta as Options de Caminhoes
        let camOptions = '<option value="">Selecione o Veículo</option>';
        this.caminhoesAtivos.forEach(c => {
            camOptions += `<option value="${c.placa}">${c.placa} (${c.proprietario || 'Próprio'})</option>`;
        });

        const tableHtml = `
            <div class="table-container">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Veículo (Motorista)</th>
                            <th>Data</th>
                            <th>Destino Principal</th>
                            <th>Valor do Frete / Custo</th>
                            <th>Pagamento Freteiro</th>
                            <th class="actions-cell">Ações</th>
                        </tr>
                    </thead>
                    <tbody>${tbody}</tbody>
                </table>
            </div>

            <!-- Modal Viagem -->
            <div id="viagem-modal" class="modal" style="display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.8); z-index: 1000; align-items: center; justify-content: center;">
                <div class="modal-content" style="background: var(--bg-color); border: 1px solid var(--border-color); border-radius: 12px; padding: 2rem; width: 100%; max-width: 550px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem;">
                        <h2 id="viagem-modal-title" style="margin: 0;">Registrar Viagem</h2>
                        <button class="btn btn-icon" type="button" onclick="window.ViagensModule.closeModal()"><i class="fa-solid fa-xmark"></i></button>
                    </div>
                    
                    <form id="viagem-form" onsubmit="window.ViagensModule.saveViagem(event)">
                        <input type="hidden" id="viagem-id" value="">
                        
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1rem;">
                            <div class="form-group">
                                <label>Caminhão da Frota *</label>
                                <select id="viagem-placa" class="form-control" required>
                                    ${camOptions}
                                </select>
                            </div>
                            <div class="form-group">
                                <label>Data da Saída *</label>
                                <input type="date" id="viagem-data" class="form-control" required>
                            </div>
                        </div>

                        <div class="form-group" style="margin-bottom: 1rem;">
                            <label>Siderúrgica / Destino Final *</label>
                            <input type="text" id="viagem-destino" class="form-control" required placeholder="Ex: Gerdau Ouro Branco">
                        </div>

                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1rem;">
                            <div class="form-group">
                                <label>Valor do Frete (R$) *</label>
                                <input type="number" step="0.01" id="viagem-valor" class="form-control" placeholder="0.00" required>
                            </div>
                            <div class="form-group">
                                <label>Pagamento do Freteiro</label>
                                <select id="viagem-status" class="form-control">
                                    <option value="Pendente">A Pagar (Pendente)</option>
                                    <option value="Faturado">Faturado / Programado</option>
                                    <option value="Pago">Liquidado (Pago)</option>
                                </select>
                            </div>
                        </div>

                        <div class="form-group" style="margin-bottom: 1.5rem;">
                            <label>Observações Adicionais</label>
                            <textarea id="viagem-obs" class="form-control" rows="2" placeholder="Notas sobre o abastecimento, pedagios, etc..."></textarea>
                        </div>

                        <div style="display: flex; gap: 1rem; justify-content: flex-end;">
                            <button type="button" class="btn btn-secondary" onclick="window.ViagensModule.closeModal()">Cancelar</button>
                            <button type="submit" class="btn btn-primary"><i class="fa-solid fa-save"></i> Salvar Viagem</button>
                        </div>
                    </form>
                </div>
            </div>
        `;

        this.container.querySelector('.page-content').innerHTML = tableHtml;
    },

    openModal(objStr = null) {
        const modal = document.getElementById('viagem-modal');
        const idInput = document.getElementById('viagem-id');

        document.getElementById('viagem-form').reset();
        modal.style.display = 'flex';

        if (objStr) {
            const v = JSON.parse(objStr);
            document.getElementById('viagem-modal-title').innerText = 'Editar Registro de Viagem';
            idInput.value = v.id;

            // Adiciona a placa no dropdown forçadamente se ela não estiver entre os 'Ativos' mas for a dona da viagem histórica
            const selectPlaca = document.getElementById('viagem-placa');
            let hasOption = Array.from(selectPlaca.options).some(opt => opt.value === v.placa);
            if (!hasOption) {
                selectPlaca.innerHTML += `<option value="${v.placa}">${v.placa} (Histórico)</option>`;
            }

            document.getElementById('viagem-placa').value = v.placa;
            if (v.data_viagem) document.getElementById('viagem-data').value = v.data_viagem.split('T')[0];
            document.getElementById('viagem-destino').value = v.destino || '';
            document.getElementById('viagem-valor').value = v.valor_frete || '';
            document.getElementById('viagem-status').value = v.status_pagamento || 'Pendente';
            document.getElementById('viagem-obs').value = v.observacoes || '';
        } else {
            document.getElementById('viagem-modal-title').innerText = 'Nova Viagem de Sucata';
            idInput.value = '';
            document.getElementById('viagem-data').value = new Date().toISOString().split('T')[0];
        }
    },

    closeModal() {
        document.getElementById('viagem-modal').style.display = 'none';
    },

    async saveViagem(event) {
        event.preventDefault();

        const idViagem = document.getElementById('viagem-id').value;
        const isEdit = idViagem !== '';

        const payload = {
            placa: document.getElementById('viagem-placa').value,
            data_viagem: document.getElementById('viagem-data').value,
            destino: document.getElementById('viagem-destino').value,
            valor_frete: document.getElementById('viagem-valor').value || 0,
            status_pagamento: document.getElementById('viagem-status').value,
            observacoes: document.getElementById('viagem-obs').value
        };

        const baseUrl = window.location.origin.includes('localhost') ? 'http://localhost:3000' : '';
        const url = isEdit ? `${baseUrl}/api/conciliacao/viagens/${idViagem}` : `${baseUrl}/api/conciliacao/viagens`;
        const method = isEdit ? 'PUT' : 'POST';

        try {
            const res = await fetch(url, {
                method: method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Falha ao salvar Viagem');

            this.closeModal();
            this.container.querySelector('.page-content').innerHTML = '<div class="loading-state"><i class="fa-solid fa-spinner fa-spin"></i> Computando Logística...</div>';
            await this.loadViagens();

        } catch (e) {
            alert('Erro: ' + e.message);
        }
    },

    async deleteViagem(id) {
        if (!confirm(`Deseja DELETAR este registro de viagem?`)) return;

        const baseUrl = window.location.origin.includes('localhost') ? 'http://localhost:3000' : '';
        try {
            const res = await fetch(`${baseUrl}/api/conciliacao/viagens/${id}`, { method: 'DELETE' });

            if (!res.ok) throw new Error('Falha ao excluir registro logsitico');

            this.container.querySelector('.page-content').innerHTML = '<div class="loading-state"><i class="fa-solid fa-spinner fa-spin"></i> Atualizando...</div>';
            await this.loadViagens();
        } catch (e) {
            alert('Aviso: ' + e.message);
        }
    }
};
