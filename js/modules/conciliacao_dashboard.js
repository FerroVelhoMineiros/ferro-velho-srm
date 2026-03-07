/**
 * Dashboard Conciliação Module
 * Exibe gráficos e KPIs resumidos a partir dos dados do Backend
 */

window.DashboardConciliacaoModule = {
    async render(container) {
        const actionsHtml = `
            <div style="display: flex; gap: 10px; align-items: center;">
                <select id="mes-filtro" class="form-control" style="background: rgba(15, 23, 42, 0.8); color: white; border: 1px solid rgba(255,255,255,0.1); border-radius: 6px; padding: 6px 12px;" onchange="window.DashboardConciliacaoModule.onMonthChange(this.value)">
                    <option value="">Carregando meses...</option>
                </select>
                <button class="btn btn-secondary btn-sm" onclick="AppConciliacao.navigate('importacao')">
                    <i class="fa-solid fa-cloud-arrow-up"></i> Receber Cargas
                </button>
            </div>
        `;

        window.UI.renderView('Painel de Performance Gerdau',
            actionsHtml,
            container,
            '<div class="loading-state" id="dash-loader"><i class="fa-solid fa-spinner fa-spin"></i> Compilando Big Data...</div>'
        );

        this.container = container;
        await this.loadAndRenderDashboard('');
    },

    async onMonthChange(mesYYYYMM) {
        this.container.querySelector('.page-content').innerHTML = '<div class="loading-state" id="dash-loader"><i class="fa-solid fa-spinner fa-spin"></i> Atualizando Relatórios...</div>';
        await this.loadAndRenderDashboard(mesYYYYMM);
    },

    async loadAndRenderDashboard(mesFiltro = '') {
        try {
            const baseUrl = window.location.origin.includes('localhost') ? 'http://localhost:3000' : '';

            const url = mesFiltro ? `${baseUrl}/api/conciliacao/analise/notas?mes=${mesFiltro}` : `${baseUrl}/api/conciliacao/analise/notas`;

            // Promise.all para otimizar chamadas
            const [resNotas, resAllConfig, resCC] = await Promise.all([
                fetch(url),
                fetch(`${baseUrl}/api/conciliacao/configuracao`), // Sem mes= traz o mapa mes -> valor
                fetch(`${baseUrl}/api/conciliacao/conta-corrente`)
            ]);

            if (!resNotas.ok || !resAllConfig.ok) throw new Error('Falha na comunicação com o PostgreSQL');

            const notas = await resNotas.json();
            const configMap = await resAllConfig.json();
            const lancamentos = resCC.ok ? await resCC.json() : [];

            // Calcula saldo da conta corrente para o card do dashboard
            let saldoCC = 0;
            lancamentos.forEach(l => {
                const v = Number(l.valor);
                // Adiciona o que aumenta a dívida
                if (l.tipo === 'adiantamento' || l.tipo === 'saldo_inicial') {
                    saldoCC += v;
                }
                // Subtrai o que abate a dívida (ignorando conferencia)
                else if (l.tipo !== 'conferencia') {
                    saldoCC -= v;
                }
            });

            // Buscar as datas unicas que existem no banco (fazemos uma requisição rápida para pegar todos os meses se for a primeira vez)
            if (mesFiltro === '') {
                this.populateMonthDropdown(notas);
            }

            if (notas.length === 0 && mesFiltro === '') {
                this.container.querySelector('.page-content').innerHTML = window.UI.emptyState('O banco de dados está vazio. Importe as planilhas do Sygecom e MIGO Gerdau na aba "Importação de Dados".', 'fa-folder-open');
                return;
            }

            if (notas.length === 0 && mesFiltro !== '') {
                this.container.querySelector('.page-content').innerHTML = window.UI.emptyState('Nenhuma movimentação de carga encontrada neste mês selecionado.', 'fa-calendar-xmark');
                return;
            }

            this.buildDashboard(notas, configMap, mesFiltro, saldoCC, lancamentos);

            // Depois que o HTML for injetado, renderiza o ChartJS
            setTimeout(() => {
                if (window.Chart) {
                    this.renderChart(notas);
                } else {
                    console.error("Chart.js não foi carregado na página.");
                }
            }, 100);

        } catch (e) {
            console.error('Erro no Dashboard:', e);
            this.container.querySelector('.page-content').innerHTML = `
                <div class="loading-state" style="color: #ef4444">
                    <i class="fa-solid fa-triangle-exclamation"></i>
                    <p>Falha ao buscar dados analíticos. Banco offline ou erro de API.</p>
                    <small>${e.message}</small>
                </div>
            `;
        }
    },

    populateMonthDropdown(allNotas) {
        const select = document.getElementById('mes-filtro');
        if (!select) return;

        if (allNotas.length === 0) {
            select.innerHTML = '<option value="">Todos os Meses (Sem dados)</option>';
            return;
        }

        const mesesSet = new Set();
        allNotas.forEach(n => {
            if (n.data_emissao) {
                try {
                    const dataObj = new Date(n.data_emissao);
                    if (!isNaN(dataObj.getTime())) {
                        const isodatestr = dataObj.toISOString().substring(0, 7);
                        mesesSet.add(isodatestr);
                    }
                } catch (err) {
                    console.warn('Data inválida ignorada no filtro:', n.data_emissao);
                }
            }
        });

        const mesesArray = Array.from(mesesSet).sort((a, b) => b.localeCompare(a));

        let options = '<option value="">Todos os Meses (Acessos Globais)</option>';
        mesesArray.forEach(m => {
            const [ano, mes] = m.split('-');
            const dateStr = new Date(ano, mes - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
            const displayStr = dateStr.charAt(0).toUpperCase() + dateStr.slice(1);
            options += `<option value="${m}">${displayStr}</option>`;
        });

        select.innerHTML = options;
    },

    buildDashboard(notas, configMap, mesFiltro, saldoCC = 0, lancamentosCC = []) {
        // --- CÁLCULOS DOS KPIS ---
        let totalEnviadoKg = 0;
        let totalRecebidoKg = 0;
        let totalPerdaKg = 0;
        let totalImpurezaKg = 0;
        let totalImpurezaValor = 0;

        let valorSygecomTotalComImposto = 0;
        let valorGerdauTotalPago = 0;
        let valorTotalPrejuizoCaixa = 0; // Resultado vs Gerdau (Diferença)
        let valorNfsAberto = 0; // Notas com status 'Pendente Gerdau'

        let alertasGerdauPendentes = 0;
        let alertasDivergencia = 0;

        const globalPriceFallback = configMap['GLOBAL'] || 0.50;

        // Soma os abatimentos já registrados na Conta Corrente
        let totalAbatidoImpurezas = 0;
        let totalAbatidoResultado = 0;

        lancamentosCC.forEach(l => {
            const v = Number(l.valor);
            if (l.tipo === 'abatimento_impureza') totalAbatidoImpurezas += v;
            if (l.tipo === 'abatimento_resultado') totalAbatidoResultado += v;
        });

        notas.forEach(n => {
            const pesoEnviado = Number(n.peso_enviado || 0);
            totalEnviadoKg += pesoEnviado;
            const pesoRecebido = Number(n.peso_recebido || 0);
            totalRecebidoKg += pesoRecebido;

            const impKg = Number(n.impurezas || 0);
            totalImpurezaKg += impKg;

            // Busca preço de compra da sucata do mês específico da nota
            let precoMes = globalPriceFallback;
            if (n.data_emissao) {
                const mesNota = new Date(n.data_emissao).toISOString().substring(0, 7);
                if (configMap[mesNota]) {
                    precoMes = configMap[mesNota];
                }
            }

            // Valor das impurezas descontadas (Soma bruta)
            totalImpurezaValor += (impKg * precoMes);

            const valorGerPago = Number(n.valor_gerdau_com_imposto) || 0;
            valorGerdauTotalPago += valorGerPago;

            // === FÓRMULA DO RESULTADO DE CAIXA (SÓ CONTA SE AINDA NÃO FOI COMPENSADA) ===
            if (n.status_conciliacao !== 'Pendente Gerdau' && n.status_conciliacao !== 'Falta no Sygecom') {
                // NOTAS DE 1 KG: Ignorar no cálculo do resultado (são ajustes técnicos já resolvidos)
                if (pesoRecebido === 1) return;

                const icmsMult = n.status_conciliacao === 'Baixa Manual' ? 1 : 1.12;
                const valorEsperado = pesoRecebido * precoMes * icmsMult;
                const resultado = valorEsperado - valorGerPago;
                valorTotalPrejuizoCaixa += resultado;
            }

            // Contagem de alertas
            if (n.status_conciliacao === 'Divergência') {
                alertasDivergencia++;
                const desc = Number(n.diferenca_peso || 0);
                if (desc > 0) totalPerdaKg += desc;
            } else if (n.status_conciliacao === 'Pendente Gerdau') {
                alertasGerdauPendentes++;
                // Estima o valor dessa nota em aberto
                valorNfsAberto += (pesoEnviado * precoMes * 1.12);
            }

            // Acumula valor Sygecom apenas para referência
            const valorSygBruto = Number(n.valor_sygecom_sem_imposto) || 0;
            const icmsMult = n.status_conciliacao === 'Baixa Manual' ? 1 : 1.12;
            valorSygecomTotalComImposto += valorSygBruto * icmsMult;
        });

        // Proteção contra divisão por zero
        const percentualPerdaVisaoGeral = totalEnviadoKg > 0 ? ((totalPerdaKg / totalEnviadoKg) * 100).toFixed(2) : 0;

        // Preço exibido no card: lido direto do configMap (o que o usuário definiu)
        // Mês filtrado: usa o preço específico ou cai no GLOBAL
        // Visão global: usa o GLOBAL (ou a média simples se tiver múltiplos)
        let precoMedioExibicao;
        if (mesFiltro) {
            precoMedioExibicao = configMap[mesFiltro] !== undefined
                ? configMap[mesFiltro]
                : (configMap['GLOBAL'] || globalPriceFallback);
        } else {
            // Média ponderada real: soma(peso * preco_do_mes) / peso_total_enviado
            precoMedioExibicao = totalEnviadoKg > 0
                ? (valorTotalPrejuizoCaixa + valorGerdauTotalPago) / (totalEnviadoKg * 1.12)
                : (configMap['GLOBAL'] || globalPriceFallback);
        }

        // Resultado: positivo = lucro (Gerdau deve devolver), negativo = prejuízo
        const isLucro = valorTotalPrejuizoCaixa >= 0;

        // Helpers de Formatação
        const fmtKg = (val) => val.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + ' kg';
        const fmtMoney = (val) => 'R$ ' + val.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

        const dashboardHtml = `
            <!-- Seção de KPIs Principais -->
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 1.5rem; margin-bottom: 2rem;">
                
                <!-- VOLUME ENVIADO -->
                <div class="metric-card" style="display: flex; flex-direction: column; align-items: stretch; gap: 0; background-color: var(--bg-card); padding: 1.5rem; border-radius: 12px; border: 1px solid var(--border-color); box-shadow: var(--shadow-sm);">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1rem;">
                        <h3 style="color: var(--text-secondary); font-size: 0.9rem; margin: 0; font-weight: 500;">Vol. Enviado Sygecom</h3>
                        <div style="background: rgba(59, 130, 246, 0.1); padding: 8px; border-radius: 8px; color: #3b82f6;"><i class="fa-solid fa-truck-fast"></i></div>
                    </div>
                    <div style="font-size: 2rem; font-weight: 700; color: var(--text-primary);">${fmtKg(totalEnviadoKg)}</div>
                    <div style="margin-top: 10px; font-size: 0.85rem; color: #10b981;"><i class="fa-solid fa-arrow-up"></i> Total Pátio</div>
                </div>

                <!-- VOLUME RECEBIDO -->
                <div class="metric-card" style="display: flex; flex-direction: column; align-items: stretch; gap: 0; background-color: var(--bg-card); padding: 1.5rem; border-radius: 12px; border: 1px solid var(--border-color); box-shadow: var(--shadow-sm);">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1rem;">
                        <h3 style="color: var(--text-secondary); font-size: 0.9rem; margin: 0; font-weight: 500;">Vol. Recebido Gerdau</h3>
                        <div style="background: rgba(16, 185, 129, 0.1); padding: 8px; border-radius: 8px; color: #10b981;"><i class="fa-solid fa-industry"></i></div>
                    </div>
                    <div style="font-size: 2rem; font-weight: 700; color: var(--text-primary);">${fmtKg(totalRecebidoKg)}</div>
                    <div style="margin-top: 10px; font-size: 0.85rem; color: #10b981;"><i class="fa-solid fa-check"></i> Baixado e Liquidado</div>
                </div>
                
                <!-- PERDA POR DIVERGENCIA BALANCA (PESO) -->
                <div class="metric-card" style="display: flex; flex-direction: column; align-items: stretch; gap: 0; background-color: var(--bg-card); padding: 1.5rem; border-radius: 12px; border: 1px solid var(--border-color); box-shadow: var(--shadow-sm);">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1rem;">
                        <h3 style="color: var(--text-secondary); font-size: 0.9rem; margin: 0; font-weight: 500;">Perda por Divergência (KG)</h3>
                        <div style="background: rgba(239, 68, 68, 0.1); padding: 8px; border-radius: 8px; color: #ef4444;"><i class="fa-solid fa-scale-unbalanced"></i></div>
                    </div>
                    <div style="font-size: 2rem; font-weight: 700; color: #ef4444;">${fmtKg(totalPerdaKg)}</div>
                    <div style="margin-top: 10px; font-size: 0.85rem; color: #ef4444;">${percentualPerdaVisaoGeral}% do material enviado</div>
                </div>

                <!-- RESULTADO CAIXA (Lucro/Prejuízo Real vs Gerdau) -->
                <div class="metric-card" style="display: flex; flex-direction: column; align-items: stretch; gap: 0; background-color: var(--bg-card); padding: 1.5rem; border-radius: 12px; border: 1px solid var(--border-color); box-shadow: var(--shadow-sm);">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1rem;">
                        <h3 style="color: var(--text-secondary); font-size: 0.9rem; margin: 0; font-weight: 500;">Resultado vs Gerdau</h3>
                        <div style="background: ${isLucro ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)'}; padding: 8px; border-radius: 8px; color: ${isLucro ? '#10b981' : '#ef4444'};"><i class="fa-solid ${isLucro ? 'fa-circle-check' : 'fa-hand-holding-dollar'}"></i></div>
                    </div>
                    <div style="font-size: 2rem; font-weight: 700; color: ${isLucro ? '#10b981' : '#ef4444'};">${fmtMoney(Math.abs(valorTotalPrejuizoCaixa - totalAbatidoResultado))}</div>
                    <div style="margin-top: 10px; font-size: 0.85rem; color: var(--text-secondary); display:flex; justify-content:space-between; align-items:center;">
                        <span>${isLucro ? '✔️ Pendente a receber' : '⚠️ Pendente — Devolver'}</span>
                        ${(Math.abs(valorTotalPrejuizoCaixa - totalAbatidoResultado) > 0.01) ? `<button class="btn btn-sm" style="background:#10b981; border:none; color:white; padding:2px 8px; border-radius:4px; cursor:pointer;" onclick="window.DashboardConciliacaoModule.abrirModalBaixa('resultado', ${valorTotalPrejuizoCaixa - totalAbatidoResultado})"><i class="fa-solid fa-check"></i> Baixar</button>` : ''}
                    </div>
                </div>
                
                <!-- CONTROLE DE SUCATA / PREÇO DE COMPRA -->
                <div class="metric-card" style="display: flex; flex-direction: column; align-items: stretch; gap: 0; background-color: var(--bg-card); padding: 1.5rem; border-radius: 12px; border: 1px solid var(--border-color); box-shadow: var(--shadow-sm);">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1rem;">
                        <h3 style="color: var(--text-secondary); font-size: 0.9rem; margin: 0; font-weight: 500;">Controle de Impurezas</h3>
                        <div style="background: rgba(168, 85, 247, 0.1); padding: 8px; border-radius: 8px; color: #a855f7;"><i class="fa-solid fa-filter"></i></div>
                    </div>
                    <div style="font-size: 2rem; font-weight: 700; color: #a855f7;">${fmtKg(totalImpurezaKg)}</div>
                    <div style="margin-top: 10px; font-size: 0.85rem; color: var(--text-secondary); display: flex; flex-direction:column; gap:8px;">
                        <div style="display:flex; justify-content:space-between; align-items:center;">
                            <span>${fmtMoney(totalImpurezaValor - totalAbatidoImpurezas)} <span style="font-size: 0.75rem; opacity: 0.7;">pendente</span></span>
                            ${(totalImpurezaValor - totalAbatidoImpurezas > 0.01) ? `<button class="btn btn-sm" style="background:#a855f7; border:none; color:white; padding:2px 8px; border-radius:4px; cursor:pointer;" onclick="window.DashboardConciliacaoModule.abrirModalBaixa('impureza', ${totalImpurezaValor - totalAbatidoImpurezas})"><i class="fa-solid fa-check"></i> Baixar</button>` : '<span style="color:#10b981; font-weight:600;">Baixado!</span>'}
                        </div>
                        <div style="display:flex; justify-content:space-between; align-items:center; opacity:0.6; font-size:0.75rem;">
                             <span>Ref: R$ ${precoMedioExibicao.toFixed(2)}/kg</span>
                             <button style="background:none; border:none; color:inherit; cursor:pointer; padding:0;" onclick="window.DashboardConciliacaoModule.changeImpurezaConfig(${precoMedioExibicao}, '${mesFiltro || 'GLOBAL'}')"><i class="fa-solid fa-pen"></i></button>
                        </div>
                    </div>
                </div>

                <!-- SALDO CONTA CORRENTE GERDAU -->
                ${(() => {
                const precoParaTon = (configMap[mesFiltro] || configMap['GLOBAL'] || 0.50);
                const toneladasDevidas = precoParaTon > 0 ? saldoCC / (precoParaTon * 1000) : 0;
                const saldoColor = saldoCC > 0 ? '#ef4444' : '#10b981';
                const saldoIcon = saldoCC > 0 ? 'fa-triangle-exclamation' : 'fa-circle-check';
                const fmtM = v => 'R$ ' + Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                return `
                <div class="metric-card" style="display: flex; flex-direction: column; align-items: stretch; gap: 0; background-color: var(--bg-card); padding: 1.5rem; border-radius: 12px; border: 1px solid ${saldoCC > 0 ? 'rgba(239,68,68,0.3)' : 'var(--border-color)'}; box-shadow: var(--shadow-sm); cursor:pointer;" onclick="AppConciliacao.navigate('conta_corrente')" title="Abrir Conta Corrente">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1rem;">
                        <h3 style="color: var(--text-secondary); font-size: 0.9rem; margin: 0; font-weight: 500;">Saldo Conta Corrente</h3>
                        <div style="background: ${saldoCC > 0 ? 'rgba(239,68,68,0.1)' : 'rgba(16,185,129,0.1)'}; padding: 8px; border-radius: 8px; color: ${saldoColor};"><i class="fa-solid ${saldoIcon}"></i></div>
                    </div>
                    <div style="font-size: 2rem; font-weight: 700; color: ${saldoColor};">${fmtM(saldoCC)}</div>
                    <div style="margin-top: 10px; font-size: 0.85rem; color: var(--text-secondary);">${saldoCC > 0 ? `≈ ${Math.abs(toneladasDevidas).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} t a enviar` : 'Saldo quitado / Crédito ✅'} <i class="fa-solid fa-arrow-right" style="font-size:0.7rem; opacity:0.5;"></i></div>
                </div>`;
            })()}

                <!-- SALDO EFETIVO GERAL (CONSOLIDADO) -->
                ${(() => {
                // Saldo Efetivo = Saldo_CC - Resultado_Gerdau - NFs_Aberto - Impurezas
                // Tudo o que é crédito (para abater a dívida do adiantamento) entra subtraindo do Saldo CC (que é sua dívida bruta)
                const saldoEfetivo = saldoCC - valorTotalPrejuizoCaixa - valorNfsAberto - totalImpurezaValor;
                const efColor = saldoEfetivo > 0 ? '#ef4444' : '#10b981';
                const efIcon = saldoEfetivo > 0 ? 'fa-building-columns' : 'fa-piggy-bank';
                const fmtM = v => 'R$ ' + Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                return `
                <div class="metric-card" 
                     style="display: flex; flex-direction: column; align-items: stretch; gap: 0; background-color: var(--bg-card); padding: 1.5rem; border-radius: 12px; border: 1px solid ${efColor}; border-width: 2px; box-shadow: var(--shadow-sm);"
                     title="Cálculo do Saldo Efetivo:
(+) Saldo CC: ${fmtM(saldoCC)}
(-) Resultado (Diferença): ${fmtM(valorTotalPrejuizoCaixa)}
(-) NFs em Aberto (Est.): ${fmtM(valorNfsAberto)}
(-) Impurezas: ${fmtM(totalImpurezaValor)}
----------------------------
(=) Saldo Efetivo: ${fmtM(saldoEfetivo)}">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1rem;">
                        <h3 style="color: var(--text-secondary); font-size: 0.9rem; margin: 0; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px;">Saldo Efetivo Geral</h3>
                        <div style="background: ${saldoEfetivo > 0 ? 'rgba(239,68,68,0.1)' : 'rgba(16,185,129,0.1)'}; padding: 8px; border-radius: 8px; color: ${efColor};"><i class="fa-solid ${efIcon}"></i></div>
                    </div>
                    <div style="font-size: 2.2rem; font-weight: 800; color: ${efColor};">${fmtM(saldoEfetivo)}</div>
                    <div style="margin-top: 10px; font-size: 0.85rem; color: var(--text-secondary); font-style: italic;">${saldoEfetivo > 0 ? 'Débito Efetivo' : 'Crédito Efetivo Livre'}</div>
                </div>`;
            })()}

            </div>

            <!-- Seção de Alertas e Gráficos -->
            <div style="display: grid; grid-template-columns: 2fr 1fr; gap: 1.5rem;">
                
                <!-- Gráfico Chart JS -->
                <div style="background-color: var(--bg-card); border: 1px solid var(--border-color); box-shadow: var(--shadow-sm); padding: 1.5rem; border-radius: 12px;">
                    <h3 style="margin: 0 0 1rem 0; font-size: 1.1rem; color: var(--text-primary); border-bottom: 1px solid var(--border-color); padding-bottom: 10px;"><i class="fa-solid fa-chart-column" style="color:#3b82f6"></i> Radar de Recebimento por Fornecedor (Top 5)</h3>
                    <div style="position: relative; height: 300px; width: 100%;">
                        <canvas id="concilChart"></canvas>
                    </div>
                </div>

                <!-- Painel de Alertas de Ação -->
                <div style="background-color: var(--bg-card); border: 1px solid var(--border-color); box-shadow: var(--shadow-sm); padding: 1.5rem; border-radius: 12px;">
                    <h3 style="margin: 0 0 1rem 0; font-size: 1.1rem; color: var(--text-primary); border-bottom: 1px solid var(--border-color); padding-bottom: 10px;"><i class="fa-solid fa-bell" style="color:#f59e0b"></i> Radar de Atenção</h3>
                    <div style="margin-bottom: 15px; font-size: 0.9rem; color: var(--text-secondary);">Analisando o lote atual...</div>
                    
                    ${alertasGerdauPendentes > 0 ? `
                    <div style="padding: 1rem; background: rgba(245, 158, 11, 0.1); border-left: 3px solid #f59e0b; border-radius: 4px; margin-bottom: 1rem;">
                        <div style="font-weight: bold; color: #f59e0b; margin-bottom: 5px;">${alertasGerdauPendentes} Cargas não chegaram</div>
                        <div style="font-size: 0.85rem; color: var(--text-secondary);">Elas constam no Sygecom, mas o portal Gerdau ainda não acusou recebimento da nota.</div>
                    </div>` : ''}

                    ${alertasDivergencia > 0 ? `
                    <div style="padding: 1rem; background: rgba(239, 68, 68, 0.1); border-left: 3px solid #ef4444; border-radius: 4px; margin-bottom: 1rem;">
                        <div style="font-weight: bold; color: #ef4444; margin-bottom: 5px;">${alertasDivergencia} Romaneios em Divergência</div>
                        <div style="font-size: 0.85rem; color: var(--text-secondary);">O peso que desceu na Gerdau é menor do que a soma da Nfe no Sygecom.</div>
                    </div>` : ''}

                    ${alertasGerdauPendentes === 0 && alertasDivergencia === 0 ? `
                    <div style="padding: 2rem; text-align: center; color: var(--text-muted);">
                        <i class="fa-solid fa-face-smile-beam" style="font-size: 2rem; color: #10b981; margin-bottom: 10px;"></i>
                        <p>Nenhuma divergência grave detectada entre Sygecom e MIGO.</p>
                    </div>` : ''}

                    <div style="margin-top: 1.5rem; text-align: center;">
                        <button class="btn btn-primary" style="width: 100%;" onclick="AppConciliacao.navigate('conciliacao_notas')">Ver Conciliação Detalhada</button>
                    </div>
                </div>

            </div>

            <!-- Modal para Baixa Manual de Créditos -->
            <div id="modal-baixa-credito" style="display:none; position:fixed; inset:0; background:rgba(0,0,0,0.6); z-index:2000; align-items:center; justify-content:center;">
                <div style="background:var(--bg-card); border-radius:16px; padding:2rem; width:400px; max-width:95vw; border:1px solid var(--border-color); box-shadow: 0 10px 30px rgba(0,0,0,0.5);">
                    <h3 id="baixa-titulo" style="margin:0 0 1rem 0; color:var(--text-primary);">Baixar Crédito</h3>
                    <p style="color:var(--text-secondary); font-size:0.85rem; margin-bottom:1.5rem;">Confirme o valor do acerto informado pela Gerdau para baixar deste saldo pendente.</p>
                    
                    <div style="display:flex; flex-direction:column; gap:1.2rem;">
                        <div>
                            <label style="color:var(--text-secondary); font-size:0.85rem;">Data da Baixa *</label>
                            <input type="date" id="baixa-data" class="form-control" style="margin-top:4px; width:100%; background:rgba(15,23,42,0.8); color:white; border:1px solid rgba(255,255,255,0.1); border-radius:8px; padding:8px 12px;" value="${new Date().toISOString().split('T')[0]}">
                        </div>
                        <div>
                            <label style="color:var(--text-secondary); font-size:0.85rem;">Valor a Liquidar (R$) *</label>
                            <input type="number" id="baixa-valor" step="0.01" class="form-control" style="margin-top:4px; width:100%; background:rgba(15,23,42,0.8); color:white; border:1px solid rgba(255,255,255,0.1); border-radius:8px; padding:8px 12px;">
                        </div>
                        <div>
                            <label style="color:var(--text-secondary); font-size:0.85rem;">Descrição</label>
                            <input type="text" id="baixa-desc" class="form-control" style="margin-top:4px; width:100%; background:rgba(15,23,42,0.8); color:white; border:1px solid rgba(255,255,255,0.1); border-radius:8px; padding:8px 12px;">
                        </div>
                        <input type="hidden" id="baixa-tipo-alvo">
                    </div>
                    
                    <div style="display:flex; gap:1rem; margin-top:2rem; justify-content:flex-end;">
                        <button class="btn btn-secondary" onclick="window.DashboardConciliacaoModule.fecharModalBaixa()">Cancelar</button>
                        <button class="btn btn-primary" id="btn-confirmar-baixa" onclick="window.DashboardConciliacaoModule.confirmarBaixa()">Confirmar Baixa</button>
                    </div>
                </div>
            </div>
        `;

        this.container.querySelector('.page-content').innerHTML = dashboardHtml;
    },

    renderChart(notas) {
        const ctx = document.getElementById('concilChart');
        if (!ctx) return;

        // Agrupar os dados por FORNECEDOR (pega os 5 piores em perdas)
        const fornecedoresMap = {};
        notas.forEach(n => {
            if (!fornecedoresMap[n.fornecedor]) {
                fornecedoresMap[n.fornecedor] = { enviado: 0, recebido: 0, nome: n.fornecedor };
            }
            fornecedoresMap[n.fornecedor].enviado += Number(n.peso_enviado || 0);
            fornecedoresMap[n.fornecedor].recebido += Number(n.peso_recebido || 0);
        });

        // Transforma o objeto em Array e calcula a diferença pra Rankear
        let fornecedoresArr = Object.values(fornecedoresMap).map(f => {
            f.perda = f.enviado - f.recebido;
            return f;
        });

        // Ordena pelos que tem maior Perda (Impurezas/Quebra) e pega top 5
        fornecedoresArr.sort((a, b) => b.perda - a.perda);
        fornecedoresArr = fornecedoresArr.slice(0, 5);

        const labels = fornecedoresArr.map(f => f.nome);
        const dataEnviado = fornecedoresArr.map(f => f.enviado);
        const dataRecebido = fornecedoresArr.map(f => f.recebido);

        new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Kgs Sygecom (Declarado)',
                        data: dataEnviado,
                        backgroundColor: 'rgba(59, 130, 246, 0.7)',
                        borderColor: '#3b82f6',
                        borderWidth: 1,
                        borderRadius: 4
                    },
                    {
                        label: 'Kgs MIGO Gerdau (Real)',
                        data: dataRecebido,
                        backgroundColor: 'rgba(16, 185, 129, 0.7)',
                        borderColor: '#10b981',
                        borderWidth: 1,
                        borderRadius: 4
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                color: '#94a3b8',
                plugins: {
                    legend: {
                        position: 'top',
                        labels: { color: '#cbd5e1' }
                    },
                    tooltip: {
                        mode: 'index',
                        intersect: false,
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: { color: 'rgba(255,255,255,0.05)' },
                        ticks: { color: '#94a3b8' }
                    },
                    x: {
                        grid: { display: false },
                        ticks: { color: '#94a3b8', maxRotation: 45, minRotation: 0 }
                    }
                }
            }
        });
    },

    // --- Métodos de Baixa de Crédito para Conta Corrente ---

    abrirModalBaixa(tipo, valorSugerido) {
        const modal = document.getElementById('modal-baixa-credito');
        const titulo = document.getElementById('baixa-titulo');
        const inputVal = document.getElementById('baixa-valor');
        const inputDesc = document.getElementById('baixa-desc');
        const inputTipo = document.getElementById('baixa-tipo-alvo');

        if (!modal) return;

        titulo.innerText = tipo === 'impureza' ? 'Baixar Crédito de Impurezas' : 'Baixar Crédito de Resultado';
        inputVal.value = Math.abs(valorSugerido).toFixed(2);
        inputTipo.value = tipo === 'impureza' ? 'abatimento_impureza' : 'abatimento_resultado';
        inputDesc.value = tipo === 'impureza' ? 'Baixa de impurezas acumuladas' : 'Baixa de acerto de diferença de preço';

        modal.style.display = 'flex';
    },

    fecharModalBaixa() {
        const modal = document.getElementById('modal-baixa-credito');
        if (modal) modal.style.display = 'none';
    },

    async confirmarBaixa() {
        const tipo = document.getElementById('baixa-tipo-alvo')?.value;
        const data = document.getElementById('baixa-data')?.value;
        const valor = parseFloat(document.getElementById('baixa-valor')?.value);
        const descricao = document.getElementById('baixa-desc')?.value;

        if (!data || isNaN(valor) || valor <= 0) {
            alert('Informe uma data e um valor válido.');
            return;
        }

        try {
            const baseUrl = window.location.origin.includes('localhost') ? 'http://localhost:3000' : '';
            const res = await fetch(`${baseUrl}/api/conciliacao/conta-corrente`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    tipo,
                    data_lancamento: data,
                    valor,
                    descricao,
                    valor_gerdau: null
                })
            });

            if (!res.ok) throw new Error('Falha ao registrar baixa na Conta Corrente');

            this.fecharModalBaixa();
            // Assuming `this.container` is available or passed correctly to loadAndRenderDashboard
            // If `this.container` is not the correct argument, it should be adjusted based on actual usage.
            // For now, assuming it's meant to trigger a full dashboard reload.
            await this.loadAndRenderDashboard(document.getElementById('mes-filtro')?.value || ''); // Recarrega o dashboard
            alert('Baixa realizada com sucesso! O valor foi lançado em sua Conta Corrente.');
        } catch (e) {
            alert('Erro: ' + e.message);
        }
    },

    async changeImpurezaConfig(currentValue, mesContexto) {
        const newValueFormatado = currentValue ? currentValue.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0,00';
        const labelMes = mesContexto === 'GLOBAL' ? 'PREÇO PADRÃO (Global)' : `MÊS: ${mesContexto}`;

        const result = prompt(`Preço de Compra da Sucata do Mês\n${labelMes}\n\nValor Atual: R$ ${newValueFormatado}/kg\nDigite o novo valor (use ponto para centavos. Ex: 0.50)`, currentValue.toFixed(2));

        if (result === null) return; // Cancelou

        const numericValue = parseFloat(result.replace(',', '.'));
        if (isNaN(numericValue) || numericValue < 0) {
            alert('Valor inválido. Insira um número válido maior ou igual a zero.');
            return;
        }

        try {
            const baseUrl = window.location.origin.includes('localhost') ? 'http://localhost:3000' : '';
            const res = await fetch(`${baseUrl}/api/conciliacao/configuracao`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ preco_kg_impureza: numericValue, mes: mesContexto })
            });

            if (!res.ok) throw new Error('Falha ao atualizar a configuração');

            // Recarrega os dados para mostrar o dashboard atualizado
            const filterMes = document.getElementById('mes-filtro')?.value || '';
            await this.loadAndRenderDashboard(filterMes);
        } catch (err) {
            console.error(err);
            alert('Erro ao salvar configuração: ' + err.message);
        }
    }
};
