import { getLeads, saveLead, updateLead, deleteLead } from './storage.js';
import { createCardHTML, showToast, ICONS } from './ui.js';
import { analyzeLeadWithGemini, getStoredApiKey, setStoredApiKey } from './gemini.js';

// Referencias del DOM
const form = document.getElementById('lead-form');
const inputId = document.getElementById('lead-id');
const inputName = document.getElementById('lead-name');
const inputCourse = document.getElementById('lead-course');
const inputNotes = document.getElementById('lead-notes');

const apiKeyInput = document.getElementById('api-key-input');
const saveKeyBtn = document.getElementById('save-key-btn');

const columns = {
    'unscored': document.getElementById('col-unscored'),
    'Baja': document.getElementById('col-low'),
    'Media': document.getElementById('col-medium'),
    'Alta': document.getElementById('col-high')
};

// Inicialización de la API Key desde sessionStorage
function initApiKey() {
    const key = getStoredApiKey();
    if (key) {
        apiKeyInput.value = key;
    }
}

saveKeyBtn.addEventListener('click', () => {
    const key = apiKeyInput.value.trim();
    if (!key) {
        showToast('Ingresa una API Key válida', 'warning');
        return;
    }
    setStoredApiKey(key);
    showToast('API Key guardada para esta sesión', 'success');
});

// Renderizado principal del tablero
function renderBoard() {
    Object.values(columns).forEach(col => col.innerHTML = '');
    
    const leads = getLeads();
    
    leads.forEach(lead => {
        const cardHTML = createCardHTML(lead);
        if (lead.estado === 'no_calificado') {
            columns['unscored'].insertAdjacentHTML('beforeend', cardHTML);
        } else {
            columns[lead.probabilidad]?.insertAdjacentHTML('beforeend', cardHTML);
        }
    });

    attachCardEvents();
}

// Eventos sobre las tarjetas (Eliminar, Editar, Analizar)
function attachCardEvents() {
    // Eliminar
    document.querySelectorAll('.btn-delete').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const card = e.target.closest('.group');
            const id = card.dataset.id;
            
            if (window.confirm('¿Estás seguro de eliminar este prospecto?')) {
                deleteLead(id);
                renderBoard();
                showToast('Prospecto eliminado', 'info');
            }
        });
    });

    // Editar
    document.querySelectorAll('.btn-edit').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const card = e.target.closest('.group');
            const id = card.dataset.id;
            const lead = getLeads().find(l => l.id === id);
            
            if (lead) {
                inputId.value = lead.id;
                inputName.value = lead.nombre;
                inputCourse.value = lead.curso;
                inputNotes.value = lead.notas;
                inputName.focus();
            }
        });
    });

    // Analizar con IA / Re-analizar
    document.querySelectorAll('.btn-analyze').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            const analyzeBtn = e.currentTarget;
            const card = analyzeBtn.closest('.group');
            const id = card.dataset.id;
            const lead = getLeads().find(l => l.id === id);

            if (!lead) return;

            const apiKey = getStoredApiKey() || apiKeyInput.value.trim();
            if (!apiKey) {
                showToast('Falta tu API Key de Gemini. Ingrésala arriba.', 'error');
                apiKeyInput.focus();
                return;
            }

            // UI: Estado de Carga (Spinner)
            const originalText = analyzeBtn.innerHTML;
            analyzeBtn.disabled = true;
            analyzeBtn.innerHTML = `${ICONS.spinner} Analizando...`;

            try {
                const result = await analyzeLeadWithGemini(lead.curso, lead.notas, apiKey);

                // Actualizar estado en LocalStorage
                updateLead(id, {
                    score: result.score,
                    probabilidad: result.probabilidad,
                    argumento: result.argumento,
                    estado: 'calificado',
                    notasModificadas: false,
                    vecesAnalizado: (lead.vecesAnalizado || 0) + 1,
                    analizadoEn: new Date().toISOString()
                });

                showToast(`Lead calificado: Priority ${result.probabilidad} (${result.score}/100)`, 'success');
                renderBoard();

            } catch (error) {
                console.error('Error durante el análisis:', error);
                
                // Mapeo de errores según la tabla de casos borde
                const errorMessages = {
                    'API_KEY_MISSING': 'Ingresa tu API Key de Gemini.',
                    'API_KEY_INVALID': 'API Key inválida o expirada.',
                    'NOTES_TOO_SHORT': 'Las notas deben tener al menos 10 caracteres.',
                    'RATE_LIMIT_EXCEEDED': 'Cuota superada (429). Espera un minuto.',
                    'JSON_PARSE_ERROR': 'La IA devolvió una respuesta no válida.',
                    'INVALID_SCHEMA': 'Formato de respuesta incompatible.'
                };

                const msg = errorMessages[error.message] || 'Error de conexión con Gemini API.';
                showToast(msg, 'error');

                // Restaurar botón
                analyzeBtn.disabled = false;
                analyzeBtn.innerHTML = originalText;
            }
        });
    });
}

// Guardar / Actualizar Formulario
form.addEventListener('submit', (e) => {
    e.preventDefault();
    
    const id = inputId.value;
    const data = {
        nombre: inputName.value.trim(),
        curso: inputCourse.value.trim(),
        notas: inputNotes.value.trim()
    };

    if (id) {
        updateLead(id, data);
        showToast('Prospecto actualizado', 'success');
    } else {
        saveLead(data);
        showToast('Prospecto registrado', 'success');
    }

    form.reset();
    inputId.value = '';
    renderBoard();
});

// Arrancar la app
document.addEventListener('DOMContentLoaded', () => {
    initApiKey();
    renderBoard();
});
