/**
 * Vehicles Module
 * Handles all logic for adding, editing, and listing fleet vehicles
 */

window.VehiclesModule = {
    async render(container) {
        const vehicles = await window.db.get('vehicles');

        let actionsHtml = `
            <button class="btn btn-primary" id="add-vehicle-btn">
                <i class="fa-solid fa-plus"></i> Novo Veículo
            </button>
        `;

        let tableRows = vehicles.map(v => {
            let statusClass = 'status-inactive';
            if (v.status === 'Ativo') statusClass = 'status-active';
            if (v.status === 'Em Manutenção') statusClass = 'status-maintenance';

            let driverName = 'Não atribuído';
            if (v.driverId) {
                // Not ideal for N+1 queries, but works for the current scale.
                // Ideally this would be resolved backend side. 
                // We'll leave it sync rendering for the list to avoid complex Promise.all logic in HTML string generation, 
                // but since the drivers are also fetching async we should just fetch it first.
            }

            let docStatus = 'Sem Doc.';
            let docStatusClass = 'status-inactive';

            if (v.docExpirationYear) {
                const currentYear = new Date().getFullYear();
                if (Number(v.docExpirationYear) >= currentYear) {
                    docStatus = `Válido (${v.docExpirationYear})`;
                    docStatusClass = 'status-active';
                } else {
                    docStatus = `Vencido (${v.docExpirationYear})`;
                    docStatusClass = 'status-maintenance';
                }
            }

            return `
                <tr>
                    <td><strong>${v.plate}</strong></td>
                    <td>${v.model}</td>
                    <td>${driverName}</td>
                    <td>${v.year}</td>
                    <td>${v.type}${v.equipment ? ' / ' + v.equipment : ''}</td>
                    <td>${Number(v.mileage).toLocaleString('pt-BR')} km</td>
                    <td><span class="status-badge ${docStatusClass}">${docStatus}</span></td>
                    <td><span class="status-badge ${statusClass}">${v.status}</span></td>
                    <td>
                        ${v.docAttached ? `<button class="action-btn view-doc" data-id="${v.id}" title="Ver Documento"><i class="fa-solid fa-file-pdf"></i></button>` : ''}
                        <button class="action-btn edit" data-id="${v.id}" title="Editar"><i class="fa-solid fa-pen"></i></button>
                        <button class="action-btn delete" data-id="${v.id}" title="Remover"><i class="fa-solid fa-trash"></i></button>
                    </td>
                </tr>
            `;
        }).join('');

        if (vehicles.length === 0) {
            tableRows = `<tr><td colspan="7">${window.UI.emptyState('Nenhum veículo cadastrado na frota', 'fa-car')}</td></tr>`;
        }

        const contentHtml = `
            <div class="table-container">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Placa</th>
                            <th>Modelo</th>
                            <th>Motorista</th>
                            <th>Ano</th>
                            <th>Tipo</th>
                            <th>Quilometragem</th>
                            <th>Documento</th>
                            <th>Status</th>
                            <th>Ações</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${tableRows}
                    </tbody>
                </table>
            </div>
        `;

        window.UI.renderView('Controle de Veículos', actionsHtml, container, contentHtml);

        this.attachEventListeners();
    },

    attachEventListeners() {
        document.getElementById('add-vehicle-btn')?.addEventListener('click', () => {
            this.openVehicleModal();
        });

        document.querySelectorAll('.action-btn.edit').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const id = e.currentTarget.getAttribute('data-id');
                const vehicle = await window.db.getById('vehicles', id);
                if (vehicle) this.openVehicleModal(vehicle);
            });
        });

        document.querySelectorAll('.action-btn.delete').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const id = e.currentTarget.getAttribute('data-id');
                if (confirm('Tem certeza que deseja remover este veículo? Esta ação não pode ser desfeita.')) {
                    await window.db.delete('vehicles', id);
                    window.App.navigate('vehicles'); // re-render view
                    window.App.updateAlerts(); // update badges dashboard
                }
            });
        });

        document.querySelectorAll('.action-btn.view-doc').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const id = e.currentTarget.getAttribute('data-id');
                const vehicle = await window.db.getById('vehicles', id);
                if (vehicle && vehicle.docAttached) {
                    // Open Base64 PDF in new window
                    // To circumvent some browser restrictions with data URLs, we create an iframe/blob
                    try {
                        const pdfWindow = window.open("");
                        pdfWindow.document.write(`
                            <iframe width='100%' height='100%' src='${vehicle.docAttached}'></iframe>
                            <style>body{margin:0; overflow:hidden;} iframe{border:none;}</style>
                        `);
                    } catch (e) {
                        alert('Não foi possível abrir o documento no navegador. Tente desativar seu bloqueador de pop-ups.');
                    }
                }
            });
        });
    },

    async openVehicleModal(vehicleToEdit = null) {
        const title = vehicleToEdit ? 'Editar Veículo' : 'Novo Veículo';
        const drivers = await window.db.get('drivers');

        const formHtml = `
            <div class="form-group">
                <label>Placa</label>
                <input type="text" class="form-control" name="plate" required 
                       value="${vehicleToEdit ? vehicleToEdit.plate : ''}" placeholder="ABC-1234">
            </div>
            <div class="form-group">
                <label>Modelo do Veículo</label>
                <input type="text" class="form-control" name="model" required
                       value="${vehicleToEdit ? vehicleToEdit.model : ''}" placeholder="Ex: Mercedes-Benz Sprinter">
            </div>
            <div class="form-group">
                <label>Motorista Vinculado</label>
                <select class="form-control" name="driverId">
                    <option value="">Sem motorista (Livre)</option>
                    ${drivers.filter(d => d.status === 'Ativo' || (vehicleToEdit && d.id === vehicleToEdit.driverId)).map(d => `
                        <option value="${d.id}" ${vehicleToEdit && vehicleToEdit.driverId === d.id ? 'selected' : ''}>
                            ${d.name} (${d.category})
                        </option>
                    `).join('')}
                </select>
            </div>
            <div style="display: flex; gap: 16px;">
                <div class="form-group" style="flex: 1;">
                    <label>Ano</label>
                    <input type="number" class="form-control" name="year" required min="1990" max="2030"
                           value="${vehicleToEdit ? vehicleToEdit.year : new Date().getFullYear()}">
                </div>
                <div class="form-group" style="flex: 1;">
                    <label>Quilometragem Inicial</label>
                     <input type="number" class="form-control" name="mileage" required min="0"
                           value="${vehicleToEdit ? vehicleToEdit.mileage : 0}">
                </div>
            </div>
            <div style="display: flex; gap: 16px;">
                <div class="form-group" style="flex: 1;">
                    <label>Tipo</label>
                    <select class="form-control" name="type" required>
                        <option value="4° Eixo" ${vehicleToEdit && vehicleToEdit.type === '4° Eixo' ? 'selected' : ''}>4° Eixo</option>
                        <option value="Truck" ${vehicleToEdit && vehicleToEdit.type === 'Truck' ? 'selected' : ''}>Truck</option>
                        <option value="Toco" ${vehicleToEdit && vehicleToEdit.type === 'Toco' ? 'selected' : ''}>Toco</option>
                        <option value="Cavalo Toco" ${vehicleToEdit && vehicleToEdit.type === 'Cavalo Toco' ? 'selected' : ''}>Cavalo Toco</option>
                        <option value="Cavalo Trucado" ${vehicleToEdit && vehicleToEdit.type === 'Cavalo Trucado' ? 'selected' : ''}>Cavalo Trucado</option>
                        <option value="Carro" ${vehicleToEdit && vehicleToEdit.type === 'Carro' ? 'selected' : ''}>Carro</option>
                        <option value="Escavadeira" ${vehicleToEdit && vehicleToEdit.type === 'Escavadeira' ? 'selected' : ''}>Escavadeira</option>
                    </select>
                </div>
                <div class="form-group" style="flex: 1;">
                    <label>Equipamento</label>
                    <select class="form-control" name="equipment">
                        <option value="">Nenhum</option>
                        <option value="GARRA" ${vehicleToEdit && vehicleToEdit.equipment === 'GARRA' ? 'selected' : ''}>GARRA</option>
                        <option value="JULIETA" ${vehicleToEdit && vehicleToEdit.equipment === 'JULIETA' ? 'selected' : ''}>JULIETA</option>
                        <option value="CARRETA" ${vehicleToEdit && vehicleToEdit.equipment === 'CARRETA' ? 'selected' : ''}>CARRETA</option>
                        <option value="CAVALO" ${vehicleToEdit && vehicleToEdit.equipment === 'CAVALO' ? 'selected' : ''}>CAVALO</option>
                        <option value="ROLLON ROLLOF" ${vehicleToEdit && vehicleToEdit.equipment === 'ROLLON ROLLOF' ? 'selected' : ''}>ROLLON ROLLOF</option>
                        <option value="MUNK" ${vehicleToEdit && vehicleToEdit.equipment === 'MUNK' ? 'selected' : ''}>MUNK</option>
                        <option value="POLIGUINDASTE" ${vehicleToEdit && vehicleToEdit.equipment === 'POLIGUINDASTE' ? 'selected' : ''}>POLIGUINDASTE</option>
                        <option value="CARROCERIA" ${vehicleToEdit && vehicleToEdit.equipment === 'CARROCERIA' ? 'selected' : ''}>CARROCERIA</option>
                    </select>
                </div>
            </div>
            
            <div style="display: flex; gap: 16px;">
                <div class="form-group" style="flex: 1;">
                    <label>Status</label>
                     <select class="form-control" name="status" required>
                        <option value="Ativo" ${vehicleToEdit && vehicleToEdit.status === 'Ativo' ? 'selected' : ''}>Ativo e Operante</option>
                        <option value="Em Manutenção" ${vehicleToEdit && vehicleToEdit.status === 'Em Manutenção' ? 'selected' : ''}>Em Manutenção</option>
                        <option value="Inativo" ${vehicleToEdit && vehicleToEdit.status === 'Inativo' ? 'selected' : ''}>Inativo/Vendido</option>
                    </select>
                </div>
            </div>
            
            <hr style="margin: 20px 0; border: 0; border-top: 1px solid var(--border-color);">
            <h4 style="margin-bottom: 12px;">Documentação</h4>
            
            <div style="display: flex; gap: 16px; align-items: flex-end;">
                <div class="form-group" style="flex: 1;">
                    <label>Ano de Vencimento do Doc.</label>
                    <input type="number" class="form-control" name="docExpirationYear" min="2020" max="2100"
                           value="${vehicleToEdit && vehicleToEdit.docExpirationYear ? vehicleToEdit.docExpirationYear : new Date().getFullYear()}" placeholder="Ex: 2025">
                </div>
                <div class="form-group" style="flex: 2;">
                    <label>Anexar Documento (PDF - Máx 1.5MB)</label>
                    <input type="file" class="form-control" id="docPdfUpload" accept="application/pdf" style="padding: 6px;">
                    ${vehicleToEdit && vehicleToEdit.docAttached ?
                `<small style="color: var(--primary-color); display: block; margin-top: 4px;"><i class="fa-solid fa-file-pdf"></i> Um documento já está salvo. Envie outro para substituir.</small>`
                : ''}
                </div>
            </div>
        `;

        window.UI.showModal(title, formHtml, async (formData) => {
            // Check if there's a file
            const fileInput = document.getElementById('docPdfUpload');

            if (fileInput && fileInput.files.length > 0) {
                const file = fileInput.files[0];

                // Validate size (1.5MB = 1.5 * 1024 * 1024 bytes)
                if (file.size > 1572864) {
                    alert('Erro: O arquivo PDF é muito grande. O limite máximo é de 1.5MB.');
                    return;
                }

                try {
                    // Convert file to Base64
                    const base64 = await new Promise((resolve, reject) => {
                        const reader = new FileReader();
                        reader.readAsDataURL(file);
                        reader.onload = () => resolve(reader.result);
                        reader.onerror = error => reject(error);
                    });

                    formData.docAttached = base64;
                } catch (e) {
                    console.error("Error reading PDF:", e);
                    alert("Ocorreu um erro ao processar o arquivo PDF.");
                    return;
                }
            } else if (vehicleToEdit && vehicleToEdit.docAttached) {
                // Keep the existing document if no new one was provided
                formData.docAttached = vehicleToEdit.docAttached;
            }

            if (vehicleToEdit) {
                await window.db.update('vehicles', vehicleToEdit.id, formData);
            } else {
                await window.db.add('vehicles', formData);
            }
            window.App.navigate('vehicles'); // re-render
        });
    }
};
