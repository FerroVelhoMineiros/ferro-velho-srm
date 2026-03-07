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
            const [resNotas, resAllConfig] = await Promise.all([
                fetch(url),
                fetch(`${baseUrl}/api/conciliacao/configuracao`) // Sem mes= traz o mapa mes -> valor
            ]);

            if (!resNotas.ok || !resAllConfig.ok) throw new Error('Falha na comunicação com o PostgreSQL');

            const notas = await resNotas.json();
            const configMap = await resAllConfig.json();

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

            this.buildDashboard(notas, configMap, mesFiltro);

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

    buildDashboard(notas, configMap, mesFiltro) {
        // --- CÁLCULOS DOS KPIS ---
        let totalEnviadoKg = 0;
        let totalRecebidoKg = 0;
        let totalPerdaKg = 0;
        let totalImpurezaKg = 0;
        let totalImpurezaValor = 0;

        let valorSygecomTotalComImposto = 0;
        let valorGerdauTotalPago = 0;
        let valorTotalPrejuizoCaixa = 0; // Se a diferença Gerdau vs Sygecom ficar negativa.

        let alertasGerdauPendentes = 0;
        let alertasDivergencia = 0;

        const globalPriceFallback = configMap['GLOBAL'] || 0.50;

        notas.forEach(n => {
            totalEnviadoKg += Number(n.peso_enviado || 0);
            totalRecebidoKg += Number(n.peso_recebido || 0);

            const impKg = Number(n.impurezas || 0);
            totalImpurezaKg += impKg;

            // Busca preço do mês específico da nota
            let precoMes = globalPriceFallback;
            if (n.data_emissao) {
                const mesNota = new Date(n.data_emissao).toISOString().substring(0, 7);
                if (configMap[mesNota]) {
                    precoMes = configMap[mesNota];
                }
            }
            totalImpurezaValor += (impKg * precoMes);

            // Lógica do Faturamento com Impostos (Simulação de 12% de ICMS em cima do NFe bruto, exceto nas pagas integrais com imposto já embutido)
            const valorSygBruto = Number(n.valor_sygecom_sem_imposto) || 0;
            const valorSygImposto = n.status_conciliacao === 'Baixa Manual' ? valorSygBruto : (valorSygBruto + (valorSygBruto * 0.12));
            const valorGerPago = Number(n.valor_gerdau_com_imposto) || 0;

            valorSygecomTotalComImposto += valorSygImposto;
            valorGerdauTotalPago += valorGerPago;

            if (n.status_conciliacao === 'Divergência') {
                alertasDivergencia++;
                // Calcula a perda
                const desc = Number(n.diferenca_peso || 0);
                if (desc > 0) {
                    totalPerdaKg += desc;
                }
            } else if (n.status_conciliacao === 'Pendente Gerdau') {
                alertasGerdauPendentes++;
            }

            // Soma o prejuizo real
            if (n.status_conciliacao !== 'Pendente Gerdau' && n.status_conciliacao !== 'Falta no Sygecom') {
                const diffCaixa = valorSygImposto - valorGerPago;
                if (diffCaixa > 10) { // Tolerância de $10
                    valorTotalPrejuizoCaixa += diffCaixa;
                }
            }
        });

        // Proteção contra divisão por zero
        const percentualPerdaVisaoGeral = totalEnviadoKg > 0 ? ((totalPerdaKg / totalEnviadoKg) * 100).toFixed(2) : 0;

        // Média Aritmética / Ponderada Global
        const precoMedioExibicao = totalImpurezaKg > 0 ? (totalImpurezaValor / totalImpurezaKg) : globalPriceFallback;

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

                <!-- PREJUIZO CAIXA (SOMA NF COM IMPOSTO VS GERDAU PAGOU) -->
                <div class="metric-card" style="display: flex; flex-direction: column; align-items: stretch; gap: 0; background-color: var(--bg-card); padding: 1.5rem; border-radius: 12px; border: 1px solid var(--border-color); box-shadow: var(--shadow-sm);">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1rem;">
                        <h3 style="color: var(--text-secondary); font-size: 0.9rem; margin: 0; font-weight: 500;">Prejuízo R$ (Caixa Real)</h3>
                        <div style="background: rgba(245, 158, 11, 0.1); padding: 8px; border-radius: 8px; color: #f59e0b;"><i class="fa-solid fa-hand-holding-dollar"></i></div>
                    </div>
                    <div style="font-size: 2rem; font-weight: 700; color: #ef4444;">${fmtMoney(valorTotalPrejuizoCaixa)}</div>
                    <div style="margin-top: 10px; font-size: 0.85rem; color: var(--text-secondary);">Syg(+Imp) - Gerdau</div>
                </div>
                
                <!-- VOLUME IMPUREZAS GERAIS -->
                <div class="metric-card" style="display: flex; flex-direction: column; align-items: stretch; gap: 0; background-color: var(--bg-card); padding: 1.5rem; border-radius: 12px; border: 1px solid var(--border-color); box-shadow: var(--shadow-sm);">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1rem;">
                        <h3 style="color: var(--text-secondary); font-size: 0.9rem; margin: 0; font-weight: 500;">Controle de Impurezas</h3>
                        <div style="background: rgba(168, 85, 247, 0.1); padding: 8px; border-radius: 8px; color: #a855f7;"><i class="fa-solid fa-filter"></i></div>
                    </div>
                    <div style="font-size: 2rem; font-weight: 700; color: #a855f7;">${fmtKg(totalImpurezaKg)}</div>
                    <div style="margin-top: 10px; font-size: 0.85rem; color: var(--text-secondary); display: flex; justify-content: space-between; align-items: center;">
                        <span>${fmtMoney(totalImpurezaValor)} <span style="font-size: 0.75rem; opacity: 0.7;">(R$ ${precoMedioExibicao.toFixed(2)}/kg ${mesFiltro ? '' : 'médio'})</span></span>
                        <button class="btn btn-sm" style="background: rgba(255,255,255,0.1); border: none; padding: 2px 8px; font-size: 0.75rem; color: #a855f7; cursor: pointer;" onclick="window.DashboardConciliacaoModule.changeImpurezaConfig(${precoMedioExibicao}, '${mesFiltro || 'GLOBAL'}')"><i class="fa-solid fa-pen"></i> Editar</button>
                    </div>
                </div>

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

    async changeImpurezaConfig(currentValue, mesContexto) {
        const newValueFormatado = currentValue ? currentValue.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0,00';
        const labelMes = mesContexto === 'GLOBAL' ? 'PREÇO PADRÃO (Global)' : `MÊS: ${mesContexto}`;

        const result = prompt(`Definir preço pago por KG de impureza\n${labelMes}\n\nValor Atual: R$ ${newValueFormatado}\nUse ponto para centavos. Ex: 0.50`, currentValue.toFixed(2));

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
