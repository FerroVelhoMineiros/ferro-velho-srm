/**
 * Conciliacao Notas Module
 * Core Module: Shows differences between Sent vs Received weights
 */

window.ConciliacaoNotasModule = {
    async render(container) {
        let actionsHtml = `
            <button class="btn btn-primary" onclick="window.AppConciliacao.navigate('importacao')">
                <i class="fa-solid fa-upload"></i> Novas Planilhas
            </button>
            <button class="btn btn-secondary btn-sm" id="btn-export-reports">
                <i class="fa-solid fa-download"></i> Relatório Excel
            </button>
        `;

        window.UI.renderView('Análise e Conciliação Final', actionsHtml, container,
            '<div class="loading-state" id="concil-loader"><i class="fa-solid fa-spinner fa-spin"></i> Processando Cruzamento de Dados (Sygecom x Gerdau)...</div>'
        );

        this.container = container;
        await this.loadAndRenderData();
    },

    async loadAndRenderData() {
        try {
            const baseUrl = window.location.origin.includes('localhost') ? 'http://localhost:3000' : '';
            const res = await fetch(`${baseUrl}/api/conciliacao/analise/notas`);

            if (!res.ok) throw new Error('Falha na comunicação com o PostgreSQL');

            const data = await res.json();
            this.buildTable(data);
        } catch (e) {
            console.error(e);
            this.container.querySelector('.page-content').innerHTML = `
                <div class="loading-state" style="color: #ef4444">
                    <i class="fa-solid fa-triangle-exclamation"></i>
                    <p>Falha ao rodar o algoritmo de conciliação. Banco offline.</p>
                </div>
            `;
        }
    },

    buildTable(notas) {
        if (notas.length === 0) {
            this.container.querySelector('.page-content').innerHTML = window.UI.emptyState('O banco de dados está vazio. Importe as planilhas do Sygecom e MIGO Gerdau na aba "Importação de Dados".', 'fa-folder-open');
            return;
        }

        // Summary Badges
        const totalAlertas = notas.filter(n => n.status_conciliacao === 'Divergência').length;
        const totalPendentes = notas.filter(n => n.status_conciliacao === 'Pendente Gerdau').length;
        const totalOk = notas.filter(n => n.status_conciliacao === 'Conciliada').length;

        const summaryHtml = `
            <div style="display: flex; gap: 1rem; margin-bottom: 2rem;">
                <div style="background: rgba(255,255,255,0.05); padding: 1rem; border-radius: 8px; flex: 1; border-left: 3px solid #10b981;">
                    <h4 style="margin: 0 0 5px 0; font-size: 0.85rem; color: var(--text-muted);">NOTAS CONCILIADAS (OK)</h4>
                    <span style="font-size: 1.5rem; font-weight: bold; color: #10b981;">${totalOk}</span>
                </div>
                <div style="background: rgba(255,255,255,0.05); padding: 1rem; border-radius: 8px; flex: 1; border-left: 3px solid #ef4444;">
                    <h4 style="margin: 0 0 5px 0; font-size: 0.85rem; color: var(--text-muted);">DIVERGÊNCIAS (PERDA)</h4>
                    <span style="font-size: 1.5rem; font-weight: bold; color: #ef4444;">${totalAlertas}</span>
                </div>
                <div style="background: rgba(255,255,255,0.05); padding: 1rem; border-radius: 8px; flex: 1; border-left: 3px solid #f59e0b;">
                    <h4 style="margin: 0 0 5px 0; font-size: 0.85rem; color: var(--text-muted);">TRÂNSITO / AGUARD. GERDAU</h4>
                    <span style="font-size: 1.5rem; font-weight: bold; color: #f59e0b;">${totalPendentes}</span>
                </div>
            </div>
        `;

        let tableRows = notas.map(n => {
            let statusBadge = '';
            if (n.status_conciliacao === 'Conciliada') {
                statusBadge = '<span class="status-badge status-active">Conciliada</span>';
            } else if (n.status_conciliacao === 'Pendente Gerdau') {
                statusBadge = '<span class="status-badge status-maintenance" style="background: rgba(245, 158, 11, 0.2); color: #f59e0b;">Aguardando Gerdau</span>';
            } else if (n.status_conciliacao === 'Falta no Sygecom') {
                statusBadge = '<span class="status-badge status-maintenance">Falta no Sygecom</span>';
            } else if (n.status_conciliacao === 'Baixa Manual') {
                statusBadge = '<span class="status-badge" style="background: rgba(59, 130, 246, 0.1); color: #3b82f6;"><i class="fa-solid fa-check-double"></i> Paga Integral</span>';
            } else if (n.status_conciliacao === 'Divergência') {
                statusBadge = '<span class="status-badge status-maintenance" style="background: rgba(239, 68, 68, 0.2); color: #ef4444;">Divergência</span>';
            } else {
                statusBadge = `<span class="status-badge" style="background: rgba(255,255,255,0.1)">${n.status_conciliacao}</span>`;
            }

            const dataFormatada = new Date(n.data_emissao).toLocaleDateString('pt-BR');

            // Formatador helper
            const kgs = (val) => Number(val).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' kg';
            const money = (val) => 'R$ ' + Number(val).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

            /* CÁLCULO FINANCEIRO
               A Gerdau paga o BRUTO (Soma a NFe que mandou SEM imposto + ICMS).
               Verificação solicitada pelo usuário: Comparar ICMS de 12% com a nova coluna Imposto Gerdau.
            */
            const valorSygecomCru = Number(n.valor_sygecom_sem_imposto) || 0;
            const impostoEstimadoSyg = n.status_conciliacao === 'Baixa Manual' ? 0 : (valorSygecomCru * 0.12);
            const valorGerdauDepositado = Number(n.valor_gerdau_com_imposto) || 0;
            const impostoGerdauDevolvido = Number(n.imposto_gerdau_icms) || 0;
            const difIcms = impostoGerdauDevolvido - impostoEstimadoSyg;

            let statusIcmsHtml = '<span style="color: var(--text-muted)">-</span>';
            if (n.status_conciliacao !== 'Pendente Gerdau' && n.status_conciliacao !== 'Falta no Sygecom' && n.status_conciliacao !== 'Baixa Manual') {
                if (difIcms > 10) {
                    statusIcmsHtml = `<span style="color: #10b981; font-weight: bold;">+${money(Math.abs(difIcms))}</span>`;
                } else if (difIcms < -10) {
                    statusIcmsHtml = `<span style="color: #ef4444; font-weight: bold;">-${money(Math.abs(difIcms))}</span>`;
                } else {
                    statusIcmsHtml = `<span style="color: #10b981"><i class="fa-solid fa-check"></i> Bateu</span>`;
                }
            }

            const diffCaixa = (valorSygecomCru + impostoEstimadoSyg) - (valorGerdauDepositado + impostoGerdauDevolvido);

            let divFinanceiraHtml = '<span style="color: var(--text-muted)">-</span>';
            if (n.status_conciliacao !== 'Pendente Gerdau' && n.status_conciliacao !== 'Falta no Sygecom' && n.status_conciliacao !== 'Baixa Manual') {
                // Se o que eu enviei (com impostos) for MAIOR do que a Gerdau pagou (Bruto + Imposto Gerdau)
                if (diffCaixa > 10) {
                    divFinanceiraHtml = `<span style="color: #ef4444; font-weight: bold;" title="Valor Sygecom (+12% Imp): ${money(valorSygecomCru + impostoEstimadoSyg)} | Preço Ger. + ICMS: ${money(valorGerdauDepositado + impostoGerdauDevolvido)}">-${money(diffCaixa)}</span>`;
                } else if (diffCaixa < -10) {
                    divFinanceiraHtml = `<span style="color: #10b981; font-weight: bold;" title="Valor Sygecom (+12% Imp): ${money(valorSygecomCru + impostoEstimadoSyg)} | Preço Ger. + ICMS: ${money(valorGerdauDepositado + impostoGerdauDevolvido)}">+${money(Math.abs(diffCaixa))}</span>`;
                } else {
                    divFinanceiraHtml = `<span style="color: #10b981"><i class="fa-solid fa-check"></i> OK</span>`;
                }
            }

            return `
                <tr ${n.status_conciliacao === 'Divergência' ? 'style="background: rgba(239, 68, 68, 0.05);"' : ''}>
                    <td><strong>${n.numero_nota}</strong><br><small style="color:var(--text-muted)">${dataFormatada}</small></td>
                    <!-- PESOS -->
                    <td style="color: #3b82f6; border-left: 1px solid rgba(255,255,255,0.05);">${kgs(n.peso_enviado)}</td>
                    <td style="color: #10b981;">${kgs(n.peso_recebido)}</td>
                    <td style="${Number(n.impurezas) > 0 ? 'color: #f59e0b; font-weight: bold;' : 'color: var(--text-muted)'}">${kgs(n.impurezas)}</td>
                    <td style="${Number(n.diferenca_peso) > 0 ? 'color: #ef4444; font-weight: bold;' : 'color: var(--text-muted)'}">${kgs(n.diferenca_peso)}</td>
                    
                    <!-- COMPARAÇÃO DE ICMS -->
                    <td style="border-left: 1px solid rgba(255,255,255,0.05); font-size: 0.9em;">Retido: ${money(impostoEstimadoSyg)}<br><span style="color: #3b82f6">Ger: ${money(impostoGerdauDevolvido)}</span></td>
                    <td style="text-align: center; background: rgba(0,0,0,0.1); border-right: 1px solid rgba(255,255,255,0.05);">${statusIcmsHtml}</td>

                    <!-- FINANCEIRO TOTAL -->
                    <td>${money(valorSygecomCru)}</td>
                    <td style="color: #10b981; font-weight: bold;">${money(valorGerdauDepositado)}</td>
                    <td style="background: rgba(0,0,0,0.2); text-align: center;">${divFinanceiraHtml}</td>
                    
                    <td>${statusBadge}</td>
                    <td>
                        <button class="action-btn" title="Lançar Impureza" onclick="window.ConciliacaoNotasModule.openImpurezaModal('${n.numero_nota}', ${n.impurezas}, ${n.valor_desconto_impureza || 0})">
                           <i class="fa-solid fa-filter"></i>
                        </button>
                        ${n.status_conciliacao === 'Pendente Gerdau' ? `
                        <button class="action-btn" title="Baixa Manual Integral (Gerdau já Pagou)" style="color: #3b82f6;" onclick="window.ConciliacaoNotasModule.baixarManual('${n.numero_nota}')">
                           <i class="fa-solid fa-check-double"></i>
                        </button>
                        ` : ''}
                        ${n.status_conciliacao === 'Baixa Manual' ? `
                        <button class="action-btn" title="Reverter Baixa Manual" style="color: #ef4444;" onclick="window.ConciliacaoNotasModule.reverterBaixaManual('${n.numero_nota}')">
                           <i class="fa-solid fa-rotate-left"></i>
                        </button>
                        ` : ''}
                    </td>
                </tr>
            `;
        }).join('');

        const contentHtml = `
            ${summaryHtml}
            <div class="table-container">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th rowspan="2" style="vertical-align: middle;">Nº NF</th>
                            <th colspan="4" style="text-align: center; border-left: 1px solid rgba(255,255,255,0.05); border-bottom: 1px solid rgba(255,255,255,0.05); color: #94a3b8;">Pesagem Físíca (KG)</th>
                            <th colspan="2" style="text-align: center; border-left: 1px solid rgba(255,255,255,0.05); border-bottom: 1px solid rgba(255,255,255,0.05); color: #3b82f6;">Validação de ICMS</th>
                            <th colspan="3" style="text-align: center; border-bottom: 1px solid rgba(255,255,255,0.05); color: #f59e0b;">Faturamento Original Base (R$)</th>
                            <th rowspan="2" style="vertical-align: middle;">Status</th>
                            <th rowspan="2" style="vertical-align: middle;">Ações</th>
                        </tr>
                        <tr>
                            <th style="border-left: 1px solid rgba(255,255,255,0.05); font-size: 0.8rem;">Enviado Syg.</th>
                            <th style="font-size: 0.8rem;">Recebido Ger.</th>
                            <th style="font-size: 0.8rem; color: #f59e0b;">Impureza Indv.</th>
                            <th style="font-size: 0.8rem; border-right: 1px solid rgba(255,255,255,0.05);">Diferença Real</th>
                            
                            <th style="font-size: 0.8rem;">12% Syg vs Imp. Ger</th>
                            <th style="background: rgba(0,0,0,0.1); font-size: 0.8rem; border-right: 1px solid rgba(255,255,255,0.05);">Divergência ICMS</th>

                            <th style="font-size: 0.8rem;">Bruto (Syg)</th>
                            <th style="font-size: 0.8rem;">Valor Nota (Ger)</th>
                            <th style="background: rgba(0,0,0,0.2); font-size: 0.8rem;">Prejuízo Final R$</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${tableRows}
                    </tbody>
                </table>
            </div>
        `;

        this.container.querySelector('.page-content').innerHTML = contentHtml;
    },

    openImpurezaModal(numero_nota, atualKg) {
        // Modal Injetada
        const modalHtml = `
            <div class="modal-overlay active" id="modal-impureza" style="display: flex; opacity: 1; visibility: visible;">
                <div class="modal" style="padding: 20px; text-align: left;">
                    <div class="modal-header">
                        <h2>Lançar Impureza - NF: ${numero_nota}</h2>
                        <button class="close-modal" aria-label="Fechar" onclick="document.getElementById('modal-impureza').remove()" style="float: right;">&times;</button>
                    </div>
                    <form id="form-impureza" style="margin-top: 15px;">
                        <div class="form-group" style="margin-bottom: 15px;">
                            <label style="display: block; margin-bottom: 5px;">Desconto Total Recebido (KG)</label>
                            <input type="number" id="imp-kg" class="form-control" step="0.01" value="${atualKg}" required style="width: 100%; padding: 8px;">
                            <small style="color: var(--text-muted); display: block; margin-top: 5px;">Digite 0 para remover uma impureza lançada anteriormente.</small>
                        </div>
                        <div class="form-group" style="margin-bottom: 20px;">
                            <label style="display: block; margin-bottom: 5px;">Observação / Laudo Técnico</label>
                            <input type="text" id="imp-obs" class="form-control" placeholder="Ex: Terra e Areia na carga" value="" style="width: 100%; padding: 8px;">
                        </div>
                        <div class="modal-actions" style="display: flex; justify-content: flex-end; gap: 10px;">
                            <button type="button" class="btn btn-secondary" onclick="document.getElementById('modal-impureza').remove()">Cancelar</button>
                            <button type="submit" class="btn btn-primary">Gravar Impureza</button>
                        </div>
                    </form>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML('beforeend', modalHtml);

        document.getElementById('form-impureza').addEventListener('submit', async (e) => {
            e.preventDefault();
            const kg = document.getElementById('imp-kg').value;
            const obs = document.getElementById('imp-obs').value;

            const btnSub = e.target.querySelector('button[type="submit"]');
            btnSub.disabled = true;
            btnSub.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Lançando...';

            try {
                const baseUrl = window.location.origin.includes('localhost') ? 'http://localhost:3000' : '';
                const res = await fetch(`${baseUrl}/api/conciliacao/impureza`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ numero_nota, kg_desconto: kg, observacao: obs })
                });

                if (!res.ok) throw new Error('Falha ao Lançar Impureza na Base de Dados');

                document.getElementById('modal-impureza').remove();

                // Recarrega a tabela base após alteração 
                await this.loadAndRenderData();

            } catch (err) {
                alert(err.message);
                btnSub.disabled = false;
                btnSub.innerHTML = 'Tentar Novamente';
            }
        });
    },

    async baixarManual(numero_nota) {
        if (!confirm(`Confirma a BAIXA MANUAL INTEGRAL da Nota Fiscal ${numero_nota}? O sistema considerará que a Gerdau pagou todo o peso e valor enviado, sem divergências.`)) return;

        try {
            const baseUrl = window.location.origin.includes('localhost') ? 'http://localhost:3000' : '';
            const res = await fetch(`${baseUrl}/api/conciliacao/baixa-manual`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ numero_nota })
            });

            if (!res.ok) throw new Error('Erro ao processar baixa manual.');

            // Sucesso - Recarrega a Tabela Base Oficial
            await this.loadAndRenderData();
        } catch (err) {
            console.error(err);
            alert(err.message);
        }
    },

    async reverterBaixaManual(numero_nota) {
        if (!confirm(`Deseja REVERTER a Baixa Manual da Nota Fiscal ${numero_nota}? A nota voltará para análise de divergência.`)) return;

        try {
            const baseUrl = window.location.origin.includes('localhost') ? 'http://localhost:3000' : '';
            const res = await fetch(`${baseUrl}/api/conciliacao/reverter-baixa-manual`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ numero_nota })
            });

            if (!res.ok) throw new Error('Erro ao reverter baixa manual.');

            // Sucesso - Recarrega a Tabela Base Oficial
            await this.loadAndRenderData();
        } catch (err) {
            console.error(err);
            alert(err.message);
        }
    }
};
