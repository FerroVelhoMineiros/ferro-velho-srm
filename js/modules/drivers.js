/**
 * Drivers Module
 * Handles adding, editing, and listing drivers
 */

window.DriversModule = {
    async render(container) {
        const drivers = await window.db.get('drivers');

        let actionsHtml = `
            <button class="btn btn-primary" id="add-driver-btn">
                <i class="fa-solid fa-plus"></i> Novo Motorista
            </button>
        `;

        let tableRows = drivers.map(d => {
            let statusClass = d.status === 'Ativo' ? 'status-active' : 'status-inactive';

            return `
                <tr>
                    <td><strong>${d.name}</strong></td>
                    <td>${this.formatCNH(d.cnh)}</td>
                    <td>${d.category}</td>
                    <td>${d.phone}</td>
                    <td><span class="status-badge ${statusClass}">${d.status}</span></td>
                    <td>
                        <button class="action-btn edit" data-id="${d.id}" title="Editar"><i class="fa-solid fa-pen"></i></button>
                        <button class="action-btn delete" data-id="${d.id}" title="Remover"><i class="fa-solid fa-trash"></i></button>
                    </td>
                </tr>
            `;
        }).join('');

        if (drivers.length === 0) {
            tableRows = `<tr><td colspan="6">${window.UI.emptyState('Nenhum motorista cadastrado', 'fa-id-card')}</td></tr>`;
        }

        const contentHtml = `
            <div class="table-container">
                <table class="data-table">
                    <thead>
                        <tr>
                            <th>Nome</th>
                            <th>CNH</th>
                            <th>Categoria</th>
                            <th>Telefone</th>
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

        window.UI.renderView('Controle de Motoristas', actionsHtml, container, contentHtml);

        this.attachEventListeners();
    },

    formatCNH(cnh) {
        if (!cnh) return '-';
        return cnh.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
    },

    attachEventListeners() {
        document.getElementById('add-driver-btn')?.addEventListener('click', () => {
            this.openDriverModal();
        });

        document.querySelectorAll('.action-btn.edit').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const id = e.currentTarget.getAttribute('data-id');
                const driver = await window.db.getById('drivers', id);
                if (driver) this.openDriverModal(driver);
            });
        });

        document.querySelectorAll('.action-btn.delete').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const id = e.currentTarget.getAttribute('data-id');

                // Verify if driver is linked to any active vehicle before deleting
                const vehicles = await window.db.get('vehicles');
                const linkedToVehicle = vehicles.some(v => v.driverId === id);

                if (linkedToVehicle) {
                    alert('Este motorista está vinculado a um veículo e não pode ser excluído.');
                    return;
                }

                if (confirm('Tem certeza que deseja remover este motorista?')) {
                    await window.db.delete('drivers', id);
                    window.App.navigate('drivers');
                }
            });
        });
    },

    openDriverModal(driverToEdit = null) {
        const title = driverToEdit ? 'Editar Motorista' : 'Novo Motorista';

        const formHtml = `
            <div class="form-group">
                <label>Nome Completo</label>
                <input type="text" class="form-control" name="name" required 
                       value="${driverToEdit ? driverToEdit.name : ''}" placeholder="Ex: João da Silva">
            </div>
            
            <div style="display: flex; gap: 16px;">
                <div class="form-group" style="flex: 2;">
                    <label>CNH</label>
                    <input type="text" class="form-control" name="cnh" required maxlength="11" pattern="\\d{11}"
                           value="${driverToEdit ? driverToEdit.cnh : ''}" placeholder="Somente números">
                </div>
                <div class="form-group" style="flex: 1;">
                    <label>Categoria</label>
                    <select class="form-control" name="category" required>
                        <option value="A" ${driverToEdit && driverToEdit.category === 'A' ? 'selected' : ''}>A</option>
                        <option value="B" ${driverToEdit && driverToEdit.category === 'B' ? 'selected' : ''}>B</option>
                        <option value="C" ${driverToEdit && driverToEdit.category === 'C' ? 'selected' : ''}>C</option>
                        <option value="D" ${driverToEdit && driverToEdit.category === 'D' ? 'selected' : ''}>D</option>
                        <option value="E" ${driverToEdit && driverToEdit.category === 'E' ? 'selected' : ''}>E</option>
                        <option value="AB" ${driverToEdit && driverToEdit.category === 'AB' ? 'selected' : ''}>AB</option>
                        <option value="AC" ${driverToEdit && driverToEdit.category === 'AC' ? 'selected' : ''}>AC</option>
                        <option value="AD" ${driverToEdit && driverToEdit.category === 'AD' ? 'selected' : ''}>AD</option>
                        <option value="AE" ${driverToEdit && driverToEdit.category === 'AE' ? 'selected' : ''}>AE</option>
                    </select>
                </div>
            </div>

            <div style="display: flex; gap: 16px;">
                <div class="form-group" style="flex: 1;">
                    <label>Telefone</label>
                    <input type="text" class="form-control" name="phone" required
                           value="${driverToEdit ? driverToEdit.phone : ''}" placeholder="(11) 99999-9999">
                </div>
                <div class="form-group" style="flex: 1;">
                    <label>Status</label>
                     <select class="form-control" name="status" required>
                        <option value="Ativo" ${driverToEdit && driverToEdit.status === 'Ativo' ? 'selected' : ''}>Ativo e Operante</option>
                        <option value="Inativo" ${driverToEdit && driverToEdit.status === 'Inativo' ? 'selected' : ''}>Inativo/Desligado</option>
                    </select>
                </div>
            </div>
        `;

        window.UI.showModal(title, formHtml, async (formData) => {
            if (driverToEdit) {
                await window.db.update('drivers', driverToEdit.id, formData);
            } else {
                await window.db.add('drivers', formData);
            }
            window.App.navigate('drivers');
        });
    }
};
