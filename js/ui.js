/**
 * UI Helper Functions
 * Renders HTML templates and manages modal states
 */

const UI = {
    // Render the base template for any view
    renderView(title, actionsHtml, rootElement, contentHtml) {
        rootElement.innerHTML = `
            <div class="page-header">
                <h1 class="page-title">${title}</h1>
                <div class="page-actions">
                    ${actionsHtml}
                </div>
            </div>
            <div class="page-content">
                ${contentHtml}
            </div>
        `;
    },

    // Create a dynamic modal
    showModal(title, bodyHtml, onSaveCallback, saveBtnText = "Salvar") {
        let modalOverlay = document.getElementById('dynamic-modal');

        // Remove if exists
        if (modalOverlay) {
            modalOverlay.remove();
        }

        modalOverlay = document.createElement('div');
        modalOverlay.id = 'dynamic-modal';
        modalOverlay.className = 'modal-overlay';

        modalOverlay.innerHTML = `
            <div class="modal">
                <div class="modal-header">
                    <h3>${title}</h3>
                    <button class="close-modal"><i class="fa-solid fa-xmark"></i></button>
                </div>
                <div class="modal-body">
                    <form id="dynamic-form">
                        ${bodyHtml}
                    </form>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary close-modal-btn">Cancelar</button>
                    <button type="button" id="save-modal-btn" class="btn btn-primary">${saveBtnText}</button>
                </div>
            </div>
        `;

        document.body.appendChild(modalOverlay);

        // Setup Event Listeners
        const closeBtns = modalOverlay.querySelectorAll('.close-modal, .close-modal-btn');
        const saveBtn = modalOverlay.querySelector('#save-modal-btn');

        closeBtns.forEach(btn => btn.addEventListener('click', () => {
            modalOverlay.classList.remove('active');
            setTimeout(() => modalOverlay.remove(), 300);
        }));

        const saveAction = () => {
            const form = document.getElementById('dynamic-form');
            if (form.checkValidity()) {
                const formData = new FormData(form);
                const data = Object.fromEntries(formData.entries());

                // Immediately close modal and remove from DOM
                // so that the callback (which re-renders the view) works cleanly
                modalOverlay.classList.remove('active');
                modalOverlay.remove();

                onSaveCallback(data);
            } else {
                form.reportValidity();
            }
        };

        let isSubmitting = false;

        saveBtn.addEventListener('click', (e) => {
            if (isSubmitting) return;
            isSubmitting = true;
            saveAction();
            setTimeout(() => isSubmitting = false, 500);
        });

        const formElement = modalOverlay.querySelector('#dynamic-form');
        formElement.addEventListener('submit', (e) => {
            e.preventDefault();
            if (isSubmitting) return;
            isSubmitting = true;
            saveAction();
            setTimeout(() => isSubmitting = false, 500);
        });

        // Small delay to allow CSS animation
        setTimeout(() => modalOverlay.classList.add('active'), 10);
    },

    // Format currency
    formatCurrency(value) {
        return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
    },

    // Create an empty state when table has no data
    emptyState(message, iconClass = 'fa-inbox') {
        return `
            <div style="text-align: center; padding: 40px; color: var(--text-secondary);">
                <i class="fa-solid ${iconClass}" style="font-size: 3rem; margin-bottom: 16px; opacity: 0.5;"></i>
                <p>${message}</p>
            </div>
        `;
    }
};

window.UI = UI;
