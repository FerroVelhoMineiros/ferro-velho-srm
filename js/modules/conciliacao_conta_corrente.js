/**
 * Conta Corrente Gerdau Module
 * Controle de adiantamentos, abatimentos de NF e complementos
 */

window.ContaCorrenteModule = {

    async render(container) {
        const actionsHtml = `
            <div style="display: flex; gap: 10px; align-items: center;">
                <button class="btn btn-secondary btn-sm" onclick="window.ContaCorrenteModule.abrirModalConferencia()" style="background:rgba(245,158,11,0.1); color:#f59e0b; border:1px solid rgba(245,158,11,0.2);">
                    <i class="fa-solid fa-scale-balanced"></i> Conferir c/ Gerdau
                </button>
                <button class="btn btn-primary btn-sm" onclick="window.ContaCorrenteModule.abrirModalLancamento()">
                    <i class="fa-solid fa-plus"></i> Novo Lançamento
                </button>
            </div>
        `;

        window.UI.renderView('Conta Corrente Gerdau',
            actionsHtml,
            container,
            '<div class="loading-state" id="cc-loader"><i class="fa-solid fa-spinner fa-spin"></i> Carregando extrato...</div>'
        );

        this.container = container;
        this._notasCache = null; // cache das NFs importadas
        await this.loadAndRender();
    },

    async loadAndRender() {
        try {
            const baseUrl = window.location.origin.includes('localhost') ? 'http://localhost:3000' : '';
            const [resCC, resConfig] = await Promise.all([
                fetch(`${baseUrl}/api/conciliacao/conta-corrente`),
                fetch(`${baseUrl}/api/conciliacao/configuracao`)
            ]);

            if (!resCC.ok || !resConfig.ok) throw new Error('Falha na comunicação com o banco');

            const lancamentos = await resCC.json();
            const configMap = await resConfig.json();
            const precoKg = configMap['GLOBAL'] || 0.50;

            this.buildView(lancamentos, precoKg);
        } catch (e) {
            console.error(e);
            this.container.querySelector('.page-content').innerHTML = `
                <div class="loading-state" style="color:#ef4444">
                    <i class="fa-solid fa-triangle-exclamation"></i>
                    <p>Erro ao carregar extrato: ${e.message}</p>
                </div>`;
        }
    },

    buildView(lancamentos, precoKg) {
        // --- KPIs ---
        let totalAdiantado = 0;
        let totalAbatido = 0;
        let totalComplementos = 0;
        let saldoInicial = 0;

        lancamentos.forEach(l => {
            const v = Number(l.valor);
            if (l.tipo === 'adiantamento') totalAdiantado += v;
            else if (l.tipo === 'abatimento_nf') totalAbatido += v;
            else if (l.tipo === 'complemento' || l.tipo === 'abatimento_impureza' || l.tipo === 'abatimento_resultado') totalComplementos += v;
            else if (l.tipo === 'saldo_inicial') saldoInicial += v;
        });

        const saldo = saldoInicial + totalAdiantado - totalAbatido - totalComplementos;
        const toneladasDevidas = precoKg > 0 ? (saldo / (precoKg * 1000)) : 0;

        const fmtMoney = v => 'R$ ' + Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        const fmtTon = v => Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' t';

        // --- Extrato com saldo acumulado ---
        let saldoAcum = saldoInicial; // começa do saldo inicial
        const rowsHtml = lancamentos.length === 0
            ? `<tr><td colspan="7" style="text-align:center; padding:2rem; color: var(--text-secondary);">Nenhum lançamento. Clique em "Novo Lançamento" para começar.</td></tr>`
            : lancamentos.map(l => {
                const v = Number(l.valor);
                let delta = 0;
                let sinal = '';
                let cor = '';
                if (l.tipo === 'adiantamento') { delta = v; sinal = '+'; cor = '#10b981'; }
                else if (l.tipo === 'saldo_inicial') { delta = v; sinal = v >= 0 ? '+' : ''; cor = '#3b82f6'; }
                else { delta = -v; sinal = '-'; cor = '#ef4444'; }
                saldoAcum += delta;

                const saldoColor = saldoAcum >= 0 ? '#10b981' : '#ef4444';
                const dataFmt = l.data_lancamento ? new Date(l.data_lancamento).toLocaleDateString('pt-BR') : '-';
                const tipoLabel = l.tipo === 'adiantamento' ? 'Adiantamento'
                    : l.tipo === 'abatimento_nf' ? 'Abatimento NF'
                        : l.tipo === 'abatimento_impureza' ? 'Abat. Impureza'
                            : l.tipo === 'abatimento_resultado' ? 'Abat. Resultado'
                                : l.tipo === 'complemento' ? 'Complemento / Ajuste'
                                    : l.tipo === 'saldo_inicial' ? 'Saldo Inicial'
                                        : 'Conferência';
                const tipoColor = l.tipo === 'adiantamento' ? '#10b981'
                    : l.tipo === 'saldo_inicial' ? '#3b82f6'
                        : (l.tipo === 'abatimento_impureza' || l.tipo === 'abatimento_resultado' || l.tipo === 'complemento') ? '#f59e0b'
                            : '#6b7280';

                const divergencia = l.tipo === 'conferencia'
                    ? (Math.abs(Number(l.valor_gerdau) - saldoAcum) > 0.01
                        ? `<span style="color:#ef4444; font-size:0.75rem;" title="Saldo Gerdau: R$ ${Number(l.valor_gerdau).toFixed(2)} | Dif: R$ ${(Number(l.valor_gerdau) - saldoAcum).toFixed(2)}">❌ Diferença</span>`
                        : `<span style="color:#10b981; font-size:0.75rem;"><i class="fa-solid fa-check-double"></i> Ok</span>`)
                    : (l.valor_gerdau && Math.abs(Number(l.valor_gerdau) - v) > 0.01
                        ? `<span style="color:#f59e0b; font-size:0.75rem;" title="Gerdau diz: R$ ${Number(l.valor_gerdau).toFixed(2)}">⚠️ ${fmtMoney(l.valor_gerdau)}</span>`
                        : `<span style="color:#10b981; font-size:0.75rem;"><i class="fa-solid fa-check"></i></span>`);

                return `
                    <tr style="border-bottom: 1px solid var(--border-color);">
                        <td style="padding: 12px 16px; color: var(--text-secondary); font-size:0.85rem;">${dataFmt}</td>
                        <td style="padding: 12px 16px;">
                            <span style="background: ${tipoColor}22; color: ${tipoColor}; padding: 2px 8px; border-radius: 4px; font-size: 0.78rem; font-weight: 600;">${tipoLabel}</span>
                        </td>
                        <td style="padding: 12px 16px; color: var(--text-secondary); font-size:0.85rem;">${l.descricao || '-'}</td>
                        <td style="padding: 12px 16px; color: var(--text-secondary); font-size:0.85rem;">${l.numero_nota || '-'}</td>
                        <td style="padding: 12px 16px; font-weight: 600; color: ${cor};">${sinal} ${fmtMoney(v)}</td>
                        <td style="padding: 12px 16px; font-weight: 700; color: ${saldoColor};">${fmtMoney(saldoAcum)}</td>
                        <td style="padding: 12px 16px; text-align: center;">
                            ${divergencia}
                            ${l.manual ? `<button onclick="window.ContaCorrenteModule.excluir(${l.id})" style="background:none; border:none; color:#ef4444; cursor:pointer; margin-left:8px;" title="Excluir"><i class="fa-solid fa-trash"></i></button>` : `<span style="color:var(--text-secondary); font-size:0.7rem; margin-left:8px;" title="Automático via Importação"><i class="fa-solid fa-lock"></i></span>`}
                        </td>
                    </tr>`;
            }).join('');

        const html = `
            <!-- KPIs -->
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1.5rem; margin-bottom: 2rem;">
                <div class="metric-card" style="background: var(--bg-card); padding: 1.5rem; border-radius: 12px; border: 1px solid var(--border-color);">
                    <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:1rem;">
                        <h3 style="color:var(--text-secondary); font-size:0.85rem; margin:0;">Total Adiantado</h3>
                        <div style="background:rgba(59,130,246,0.1); padding:8px; border-radius:8px; color:#3b82f6;"><i class="fa-solid fa-money-bill-transfer"></i></div>
                    </div>
                    <div style="font-size:1.8rem; font-weight:700; color:#3b82f6;">${fmtMoney(totalAdiantado)}</div>
                </div>

                <div class="metric-card" style="background: var(--bg-card); padding: 1.5rem; border-radius: 12px; border: 1px solid var(--border-color);">
                    <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:1rem;">
                        <h3 style="color:var(--text-secondary); font-size:0.85rem; margin:0;">Abatido (NFs)</h3>
                        <div style="background:rgba(107,114,128,0.1); padding:8px; border-radius:8px; color:#6b7280;"><i class="fa-solid fa-file-invoice"></i></div>
                    </div>
                    <div style="font-size:1.8rem; font-weight:700; color:#6b7280;">${fmtMoney(totalAbatido)}</div>
                </div>

                <div class="metric-card" style="background: var(--bg-card); padding: 1.5rem; border-radius: 12px; border: 1px solid var(--border-color);">
                    <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:1rem;">
                        <h3 style="color:var(--text-secondary); font-size:0.85rem; margin:0;">Complementos</h3>
                        <div style="background:rgba(245,158,11,0.1); padding:8px; border-radius:8px; color:#f59e0b;"><i class="fa-solid fa-arrows-rotate"></i></div>
                    </div>
                    <div style="font-size:1.8rem; font-weight:700; color:#f59e0b;">${fmtMoney(totalComplementos)}</div>
                </div>

                <div class="metric-card" style="background: var(--bg-card); padding: 1.5rem; border-radius: 12px; border: 1px solid rgba(239,68,68,0.3);">
                    <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:1rem;">
                        <h3 style="color:var(--text-secondary); font-size:0.85rem; margin:0;">Saldo Devedor</h3>
                        <div style="background:rgba(239,68,68,0.1); padding:8px; border-radius:8px; color:#ef4444;"><i class="fa-solid fa-scale-unbalanced-flip"></i></div>
                    </div>
                    <div style="font-size:1.8rem; font-weight:700; color:${saldo >= 0 ? '#ef4444' : '#10b981'};">${fmtMoney(saldo)}</div>
                    <div style="margin-top:8px; font-size:0.8rem; color:var(--text-secondary);">≈ ${fmtTon(toneladasDevidas)} a enviar (R$ ${(precoKg).toFixed(2)}/kg)</div>
                </div>
            </div>

            <!-- Extrato -->
            <div style="background: var(--bg-card); border-radius: 12px; border: 1px solid var(--border-color); overflow: hidden;">
                <div style="padding: 1rem 1.5rem; border-bottom: 1px solid var(--border-color);">
                    <h3 style="margin:0; font-size:1rem; color: var(--text-primary);"><i class="fa-solid fa-list" style="color:#3b82f6;"></i> Extrato Cronológico</h3>
                </div>
                <div style="overflow-x:auto;">
                    <table style="width:100%; border-collapse:collapse;">
                        <thead>
                            <tr style="background: rgba(255,255,255,0.03);">
                                <th style="padding:10px 16px; text-align:left; color:var(--text-secondary); font-size:0.78rem; font-weight:600;">DATA</th>
                                <th style="padding:10px 16px; text-align:left; color:var(--text-secondary); font-size:0.78rem; font-weight:600;">TIPO</th>
                                <th style="padding:10px 16px; text-align:left; color:var(--text-secondary); font-size:0.78rem; font-weight:600;">DESCRIÇÃO</th>
                                <th style="padding:10px 16px; text-align:left; color:var(--text-secondary); font-size:0.78rem; font-weight:600;">NF REF.</th>
                                <th style="padding:10px 16px; text-align:left; color:var(--text-secondary); font-size:0.78rem; font-weight:600;">VALOR</th>
                                <th style="padding:10px 16px; text-align:left; color:var(--text-secondary); font-size:0.78rem; font-weight:600;">SALDO ACUM.</th>
                                <th style="padding:10px 16px; text-align:center; color:var(--text-secondary); font-size:0.78rem; font-weight:600;">GERDAU / AÇÃO</th>
                            </tr>
                        </thead>
                        <tbody>${rowsHtml}</tbody>
                    </table>
                </div>
            </div>

            <!-- Modal Novo Lançamento -->
            <div id="modal-lancamento" style="display:none; position:fixed; inset:0; background:rgba(0,0,0,0.6); z-index:1000; align-items:center; justify-content:center;">
                <div style="background:var(--bg-card); border-radius:16px; padding:2rem; width:480px; max-width:95vw; border:1px solid var(--border-color);">
                    <h3 style="margin:0 0 1.5rem 0; color:var(--text-primary);">Novo Lançamento</h3>
                    <div style="display:flex; flex-direction:column; gap:1rem;">
                        <div>
                            <label style="color:var(--text-secondary); font-size:0.85rem;">Tipo *</label>
                            <select id="cc-tipo" class="form-control" onchange="window.ContaCorrenteModule.onTipoChange(this.value)" style="width:100%; padding:8px; border-radius:4px; border:1px solid var(--border-color); background:rgba(0,0,0,0.2); color:white;">
                                <option value="adiantamento">Adiantamento Recebido (+)</option>
                                <option value="complemento">Complemento / Ajuste (-)</option>
                                <option value="abatimento_impureza">Abatimento Impureza (-)</option>
                                <option value="abatimento_resultado">Abatimento Resultado (-)</option>
                                <option value="saldo_inicial">Saldo Inicial (Devedor/Credor)</option>
                            </select>
                        </div>

                        <div>
                            <label style="color:var(--text-secondary); font-size:0.85rem;">Data *</label>
                            <input type="date" id="cc-data" class="form-control" style="margin-top:4px; width:100%; background:rgba(15,23,42,0.8); color:white; border:1px solid rgba(255,255,255,0.1); border-radius:8px; padding:8px 12px;" value="${new Date().toISOString().split('T')[0]}">
                        </div>

                        <div>
                            <label style="color:var(--text-secondary); font-size:0.85rem;">Valor (R$) *</label>
                            <input type="number" id="cc-valor" step="0.01" class="form-control" placeholder="0.00" style="margin-top:4px; width:100%; background:rgba(15,23,42,0.8); color:white; border:1px solid rgba(255,255,255,0.1); border-radius:8px; padding:8px 12px;">
                        </div>

                        <div>
                            <label style="color:var(--text-secondary); font-size:0.85rem;">Descrição opcional</label>
                            <input type="text" id="cc-descricao" class="form-control" placeholder="Ex.: Complemento de preço ref NF 123" style="margin-top:4px; width:100%; background:rgba(15,23,42,0.8); color:white; border:1px solid rgba(255,255,255,0.1); border-radius:8px; padding:8px 12px;">
                        </div>
                    </div>
                    <div style="display:flex; gap:1rem; margin-top:1.5rem; justify-content:flex-end;">
                        <button class="btn btn-secondary" onclick="window.ContaCorrenteModule.fecharModal()">Cancelar</button>
                        <button class="btn btn-primary" onclick="window.ContaCorrenteModule.salvarLancamento()"><i class="fa-solid fa-save"></i> Salvar</button>
                    </div>
                </div>
            </div>

            <!-- Modal Conferência Gerdau -->
            <div id="modal-conferencia" style="display:none; position:fixed; inset:0; background:rgba(0,0,0,0.6); z-index:1000; align-items:center; justify-content:center;">
                <div style="background:var(--bg-card); border-radius:16px; padding:2rem; width:440px; max-width:95vw; border:1px solid #f59e0b44; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.4);">
                    <div style="display:flex; align-items:center; gap:12px; margin-bottom:1.5rem;">
                        <div style="background:rgba(245,158,11,0.1); padding:10px; border-radius:10px; color:#f59e0b;"><i class="fa-solid fa-scale-balanced fa-lg"></i></div>
                        <h3 style="margin:0; color:var(--text-primary);">Conferência com Gerdau</h3>
                    </div>
                    <p style="color:var(--text-secondary); font-size:0.85rem; margin-bottom:1.5rem;">Informe o saldo total que a Gerdau reportou em seu extrato oficial para comparar com o seu saldo calculado nesta data.</p>
                    
                    <div style="display:flex; flex-direction:column; gap:1.2rem;">
                        <div>
                            <label style="color:var(--text-secondary); font-size:0.85rem;">Data da Conferência *</label>
                            <input type="date" id="conf-data" class="form-control" style="margin-top:4px; width:100%; background:rgba(15,23,42,0.8); color:white; border:1px solid rgba(255,255,255,0.1); border-radius:8px; padding:8px 12px;" value="${new Date().toISOString().split('T')[0]}">
                        </div>
                        <div>
                            <label style="color:var(--text-secondary); font-size:0.85rem;">Saldo Oficial Gerdau (R$) *</label>
                            <input type="number" id="conf-saldo" step="0.01" class="form-control" placeholder="0.00" style="margin-top:4px; width:100%; background:rgba(15,23,42,0.8); color:white; border:1px solid rgba(255,255,255,0.1); border-radius:8px; padding:8px 12px;">
                        </div>
                        <div>
                            <label style="color:var(--text-secondary); font-size:0.85rem;">Descrição opcional</label>
                            <input type="text" id="conf-descricao" class="form-control" placeholder="Ex.: Conferência fechamento maio" style="margin-top:4px; width:100%; background:rgba(15,23,42,0.8); color:white; border:1px solid rgba(255,255,255,0.1); border-radius:8px; padding:8px 12px;">
                        </div>
                    </div>
                    
                    <div style="display:flex; gap:1rem; margin-top:2rem; justify-content:flex-end;">
                        <button class="btn btn-secondary" onclick="window.ContaCorrenteModule.fecharModalConferencia()">Cancelar</button>
                        <button class="btn btn-primary" onclick="window.ContaCorrenteModule.salvarConferencia()" style="background:#f59e0b; border-color:#d97706;"><i class="fa-solid fa-check"></i> Salvar Conferência</button>
                    </div>
                </div>
            </div>
        `;

        this.container.querySelector('.page-content').innerHTML = html;
    },

    abrirModalLancamento() {
        const modal = document.getElementById('modal-lancamento');
        if (modal) { modal.style.display = 'flex'; }
    },

    fecharModal() {
        const modal = document.getElementById('modal-lancamento');
        if (modal) { modal.style.display = 'none'; }
    },

    async salvarLancamento() {
        const tipo = document.getElementById('cc-tipo')?.value;
        const data = document.getElementById('cc-data')?.value;
        const valor = parseFloat(document.getElementById('cc-valor')?.value);
        const descricao = document.getElementById('cc-descricao')?.value;

        const isSaldoInicial = tipo === 'saldo_inicial';
        if (!tipo || !data || isNaN(valor) || (!isSaldoInicial && valor <= 0)) {
            alert('Preencha os campos obrigatórios: Tipo, Data e Valor (deve ser maior que zero, exceto para Saldo Inicial).');
            return;
        }

        try {
            const baseUrl = window.location.origin.includes('localhost') ? 'http://localhost:3000' : '';
            const res = await fetch(`${baseUrl}/api/conciliacao/conta-corrente`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tipo, data_lancamento: data, valor, descricao, valor_gerdau: null })
            });
            if (!res.ok) throw new Error('Falha ao salvar lançamento');
            this.fecharModal();
            await this.loadAndRender();
        } catch (e) {
            alert('Erro: ' + e.message);
        }
    },

    abrirModalConferencia() {
        const modal = document.getElementById('modal-conferencia');
        if (modal) modal.style.display = 'flex';
    },

    fecharModalConferencia() {
        const modal = document.getElementById('modal-conferencia');
        if (modal) modal.style.display = 'none';
    },

    async salvarConferencia() {
        const data = document.getElementById('conf-data')?.value;
        const saldoGerdau = parseFloat(document.getElementById('conf-saldo')?.value);
        const descricao = document.getElementById('conf-descricao')?.value || 'Conferência de Saldo Gerdau';

        if (!data || isNaN(saldoGerdau)) {
            alert('Preencha a data e o saldo oficial da Gerdau.');
            return;
        }

        try {
            const baseUrl = window.location.origin.includes('localhost') ? 'http://localhost:3000' : '';
            const res = await fetch(`${baseUrl}/api/conciliacao/conta-corrente`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    tipo: 'conferencia',
                    data_lancamento: data,
                    valor: 0,
                    descricao,
                    valor_gerdau: saldoGerdau
                })
            });
            if (!res.ok) throw new Error('Falha ao salvar conferência');
            this.fecharModalConferencia();
            await this.loadAndRender();
        } catch (e) {
            alert('Erro: ' + e.message);
        }
    },

    async excluir(id) {
        if (!confirm('Excluir este lançamento?')) return;
        try {
            const baseUrl = window.location.origin.includes('localhost') ? 'http://localhost:3000' : '';
            const res = await fetch(`${baseUrl}/api/conciliacao/conta-corrente/${id}`, { method: 'DELETE' });
            if (!res.ok) throw new Error('Falha ao excluir');
            await this.loadAndRender();
        } catch (e) {
            alert('Erro: ' + e.message);
        }
    },

    async onTipoChange(tipo) {
        const valorInput = document.getElementById('cc-valor');

        // Saldo inicial pode ser negativo (devedor ou credor)
        if (tipo === 'saldo_inicial') {
            if (valorInput) { valorInput.min = ''; valorInput.placeholder = 'Positivo = devedor, Negativo = credor'; }
        } else {
            if (valorInput) { valorInput.min = '0'; valorInput.placeholder = '0.00'; }
        }
    }
};
