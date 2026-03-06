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
            switch (n.status_conciliacao) {
                case 'Conciliada': statusBadge = '<span class="status-badge status-active">Conciliada</span>'; break;
                case 'Divergência': statusBadge = '<span class="status-badge status-maintenance" style="background: rgba(239, 68, 68, 0.2); color: #ef4444;">Divergência Grave</span>'; break;
                case 'Pendente Gerdau': statusBadge = '<span class="status-badge status-maintenance" style="background: rgba(245, 158, 11, 0.2); color: #f59e0b;">Aguardando Gerdau</span>'; break;
                default: statusBadge = `<span class="status-badge" style="background: rgba(255,255,255,0.1)">${n.status_conciliacao}</span>`;
            }

            const dataFormatada = new Date(n.data_emissao).toLocaleDateString('pt-BR');

            // Formatador helper
            const kgs = (val) => Number(val).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' kg';

            return `
                <tr ${n.status_conciliacao === 'Divergência' ? 'style="background: rgba(239, 68, 68, 0.05);"' : ''}>
                    <td><strong>${n.numero_nota}</strong><br><small style="color:var(--text-muted)">${dataFormatada}</small></td>
                    <td>${n.fornecedor}</td>
                    <td style="color: #3b82f6;">${kgs(n.peso_enviado)}</td>
                    <td style="color: #10b981;">${kgs(n.peso_recebido)}</td>
                    <td style="color: #f59e0b;">${kgs(n.impurezas)}</td>
                    <td style="${Number(n.diferenca_peso) > 0 ? 'color: #ef4444; font-weight: bold;' : 'color: var(--text-muted)'}">${kgs(n.diferenca_peso)}</td>
                    <td>${statusBadge}</td>
                    <td>
                        <button class="action-btn" title="Lançar Impureza" onclick="alert('Funcionalidade de Lançamento Manual em breve.')"><i class="fa-solid fa-filter"></i></button>
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
                            <th>Nº Nota Fiscal</th>
                            <th>Fornecedor</th>
                            <th>A. Saída (Sygecom)</th>
                            <th>B. Recebido (Gerdau)</th>
                            <th>C. Impureza Lançada</th>
                            <th>Diferença Real (A - B - C)</th>
                            <th>Status Analytics</th>
                            <th>Ações</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${tableRows}
                    </tbody>
                </table>
            </div>
        `;

        this.container.querySelector('.page-content').innerHTML = contentHtml;
    }
};
