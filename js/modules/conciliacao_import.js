/**
 * Importation Module
 * Handles file uploads for Sygecom (Excel/CSV) and Gerdau (Excel/CSV)
 */

window.ImportacaoModule = {
    render(container) {
        let actionsHtml = `
            <a href="https://example.com/planilha-modelo-sygecom.xlsx" class="btn btn-secondary btn-sm" download>
                <i class="fa-solid fa-download"></i> Modelo Sygecom
            </a>
            <a href="https://example.com/planilha-modelo-gerdau.xlsx" class="btn btn-secondary btn-sm" download>
                <i class="fa-solid fa-download"></i> Modelo Gerdau
            </a>
        `;

        const contentHtml = `
            <div class="import-container" style="display: flex; gap: 2rem; flex-wrap: wrap;">
                
                <!-- Sygecom Import -->
                <div class="module-card container-active" style="flex: 1; min-width: 300px; cursor: default; animation: none; transform: none; display: block; border-left: 4px solid #f59e0b;">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                        <div>
                            <h2 style="margin: 0 0 10px 0; color: #f59e0b;"><i class="fa-solid fa-computer"></i> ERP Sygecom</h2>
                            <p style="color: var(--text-muted); font-size: 0.9rem;">Importe as Notas Fiscais emitidas.</p>
                        </div>
                    </div>
                    
                    <form id="form-import-sygecom" style="margin-top: 1.5rem;">
                        <div class="drop-zone" id="drop-sygecom" style="border: 2px dashed rgba(255,255,255,0.1); border-radius: 8px; padding: 2rem; text-align: center; margin-bottom: 1rem; cursor: pointer; transition: all 0.2s;">
                            <i class="fa-solid fa-file-excel" style="font-size: 2.5rem; color: rgba(255,255,255,0.3); margin-bottom: 1rem;"></i>
                            <p id="label-sygecom" style="margin: 0;">Clique para escolher ou arraste a planilha aqui (.xlsx, .csv)</p>
                            <input type="file" id="file-sygecom" accept=".xlsx, .xls, .csv" style="display: none;">
                        </div>
                        <button type="submit" class="btn btn-primary" style="width: 100%; background: #f59e0b;" id="btn-sygecom" disabled>
                            <i class="fa-solid fa-cloud-arrow-up"></i> Processar Arquivo Sygecom
                        </button>
                        <div id="status-sygecom" style="margin-top: 10px; font-size: 0.9rem; text-align: center;"></div>
                    </form>
                </div>

                <!-- Gerdau Import -->
                <div class="module-card container-active" style="flex: 1; min-width: 300px; cursor: default; animation: none; transform: none; display: block; border-left: 4px solid #3b82f6;">
                    <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                        <div>
                            <h2 style="margin: 0 0 10px 0; color: #3b82f6;"><i class="fa-solid fa-industry"></i> Portal Gerdau</h2>
                            <p style="color: var(--text-muted); font-size: 0.9rem;">Importe as descargas validadas pelo recebimento.</p>
                        </div>
                    </div>
                    
                    <form id="form-import-gerdau" style="margin-top: 1.5rem;">
                        <div class="drop-zone" id="drop-gerdau" style="border: 2px dashed rgba(255,255,255,0.1); border-radius: 8px; padding: 2rem; text-align: center; margin-bottom: 1rem; cursor: pointer; transition: all 0.2s;">
                            <i class="fa-solid fa-file-excel" style="font-size: 2.5rem; color: rgba(255,255,255,0.3); margin-bottom: 1rem;"></i>
                            <p id="label-gerdau" style="margin: 0;">Clique para escolher ou arraste a planilha aqui (.xlsx, .csv)</p>
                            <input type="file" id="file-gerdau" accept=".xlsx, .xls, .csv" style="display: none;">
                        </div>
                        <button type="submit" class="btn btn-primary" style="width: 100%;" id="btn-gerdau" disabled>
                            <i class="fa-solid fa-cloud-arrow-up"></i> Processar Arquivo Gerdau
                        </button>
                        <div id="status-gerdau" style="margin-top: 10px; font-size: 0.9rem; text-align: center;"></div>
                    </form>
                </div>

            </div>
            
            <div style="margin-top: 2rem; background: rgba(16, 185, 129, 0.1); border: 1px solid rgba(16,185,129,0.3); padding: 1rem; border-radius: 8px;">
                <h4 style="margin: 0 0 8px 0; color: #10b981;"><i class="fa-solid fa-circle-info"></i> Como funciona a Inteligência?</h4>
                <p style="margin: 0; font-size: 0.9rem; color: var(--text-muted); line-height: 1.5;">O sistema faz a "Conciliação" tentando encontrar o mesmo <strong>Número da Nota Fiscal</strong> nas duas pontas (Sygecom e Gerdau). Não importa a ordem em que você envie os arquivos. Se um caminhão descarregou 3 tipos de materiais diferentes (3 itens na Gerdau) mas saiu como apenas 1 nota fiscal global do Sygecom, o algoritmo somará os pesos automaticamente para encontrar fraudes ou descontos.</p>
            </div>
        `;

        window.UI.renderView('Importação de Dados Externos', actionsHtml, container, contentHtml);

        this.attachEventListeners();
    },

    attachEventListeners() {
        this.setupUploader('sygecom');
        this.setupUploader('gerdau');
    },

    setupUploader(type) {
        const dropZone = document.getElementById(`drop-${type}`);
        const fileInput = document.getElementById(`file-${type}`);
        const label = document.getElementById(`label-${type}`);
        const btn = document.getElementById(`btn-${type}`);
        const form = document.getElementById(`form-import-${type}`);
        const statusDiv = document.getElementById(`status-${type}`);

        // Click to browse
        dropZone.addEventListener('click', () => fileInput.click());

        // File selection
        fileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                label.innerText = `Arquivo selecionado: ${e.target.files[0].name}`;
                dropZone.style.borderColor = 'var(--primary-color)';
                btn.disabled = false;
            }
        });

        // Drag and drop cosmetics
        dropZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            dropZone.style.background = 'rgba(255,255,255,0.05)';
        });
        dropZone.addEventListener('dragleave', () => {
            dropZone.style.background = 'transparent';
        });
        dropZone.addEventListener('drop', (e) => {
            e.preventDefault();
            dropZone.style.background = 'transparent';
            if (e.dataTransfer.files.length > 0) {
                fileInput.files = e.dataTransfer.files;
                label.innerText = `Arquivo selecionado: ${e.dataTransfer.files[0].name}`;
                dropZone.style.borderColor = 'var(--primary-color)';
                btn.disabled = false;
            }
        });

        // Submission to NodeJS API
        form.addEventListener('submit', async (e) => {
            e.preventDefault();

            if (!fileInput.files || fileInput.files.length === 0) return;

            const file = fileInput.files[0];
            const formData = new FormData();
            formData.append('file', file);

            // UI Update
            const originalBtnHtml = btn.innerHTML;
            btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Processando Linhas...`;
            btn.disabled = true;
            statusDiv.innerHTML = `<span style="color: var(--text-muted)">Enviando para o servidor...</span>`;

            try {
                // Determine port just in case
                const baseUrl = window.location.origin.includes('5000') || window.location.origin.includes('localhost')
                    ? 'http://localhost:3000'
                    : '';

                const response = await fetch(`${baseUrl}/api/conciliacao/import/${type}`, {
                    method: 'POST',
                    body: formData
                });

                const data = await response.json();

                if (response.ok) {
                    statusDiv.innerHTML = `<span style="color: #10b981"><i class="fa-solid fa-check-circle"></i> Sucesso! ${data.linhas_processadas} registros inseridos no Banco de Dados.</span>`;
                    fileInput.value = ''; // clear
                    label.innerText = 'Clique para escolher ou arraste a planilha aqui (.xlsx, .csv)';
                    dropZone.style.borderColor = 'rgba(255,255,255,0.1)';
                } else {
                    statusDiv.innerHTML = `<span style="color: #ef4444"><i class="fa-solid fa-triangle-exclamation"></i> Erro: ${data.error}</span>`;
                    btn.disabled = false;
                }
            } catch (err) {
                console.error("Fetch error", err);
                statusDiv.innerHTML = `<span style="color: #ef4444"><i class="fa-solid fa-triangle-exclamation"></i> Erro de Conexão com Servidor Backend. Verifique se ele está rodando.</span>`;
                btn.disabled = false;
            } finally {
                btn.innerHTML = originalBtnHtml;
            }
        });
    }
};
