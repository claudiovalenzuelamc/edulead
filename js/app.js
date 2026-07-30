/**
 * Main App — orquestador. Conecta los eventos de la UI con Storage y el servicio de Gemini.
 */

import {
    getLeads, getLeadById, saveLead, updateLead, deleteLead,
    seedDemoLeads, isStorageAvailable, StorageError
} from './storage.js';
import { createCardHTML, renderEmptyState, showToast, ICONS } from './ui.js';
import { analyzeLeadWithGemini, getStoredApiKey, setStoredApiKey } from './gemini.js';

/* ------------------------------ DOM ------------------------------ */

const form = document.getElementById('lead-form');
const inputId = document.getElementById('lead-id');
const inputName = document.getElementById('lead-name');
const inputCourse = document.getElementById('lead-course');
const inputNotes = document.getElementById('lead-notes');
const formTitle = document.getElementById('form-title');
const submitLabel = document.getElementById('submit-label');
const cancelEditBtn = document.getElementById('cancel-edit-btn');
const seedBtn = document.getElementById('seed-btn');

const apiKeyInput = document.getElementById('api-key-input');
const saveKeyBtn = document.getElementById('save-key-btn');
const apiKeyStatus = document.getElementById('api-key-status');

const board = document.getElementById('board');

const columns = {
    unscored: document.getElementById('col-unscored'),
    Baja: document.getElementById('col-low'),
    Media: document.getElementById('col-medium'),
    Alta: document.getElementById('col-high')
};

const counters = {
    unscored: document.getElementById('count-unscored'),
    Baja: document.getElementById('count-low'),
    Media: document.getElementById('count-medium'),
    Alta: document.getElementById('count-high')
};

const EMPTY_TEXTS = {
    unscored: 'Sin prospectos por calificar.',
    Baja: 'Nada aquí todavía.',
    Media: 'Nada aquí todavía.',
    Alta: 'Nada aquí todavía.'
};

const ERROR_MESSAGES = {
    API_KEY_MISSING: 'Ingresa tu API Key de Gemini arriba a la derecha.',
    API_KEY_INVALID: 'API Key inválida, expirada o sin permisos. Genera otra en Google AI Studio.',
    NOTES_TOO_SHORT: 'Las notas deben tener al menos 10 caracteres para poder analizar.',
    RATE_LIMIT_EXCEEDED: 'Cuota superada (429). Se reintentó varias veces; espera un minuto y vuelve a intentar.',
    MODEL_NOT_FOUND: 'El modelo de Gemini no está disponible para esta API Key.',
    JSON_PARSE_ERROR: 'La IA devolvió una respuesta que no es JSON válido. Intenta de nuevo.',
    INVALID_SCHEMA: 'La IA respondió con un formato inesperado. Intenta de nuevo.',
    EMPTY_RESPONSE: 'La IA no devolvió contenido. Intenta de nuevo.',
    RESPONSE_TRUNCATED: 'La respuesta se cortó por longitud. Acorta las notas.',
    CONTENT_BLOCKED: 'El contenido fue bloqueado por los filtros de seguridad de Gemini.',
    BAD_REQUEST: 'La petición a Gemini fue rechazada. Revisa la consola para el detalle.',
    SERVER_ERROR: 'Los modelos de Gemini están sobrecargados (503). Ya se reintentó con backoff y con modelos alternativos: espera un minuto y vuelve a intentar.',
    TIMEOUT: 'La petición tardó demasiado (30s) y se canceló.',
    NETWORK_ERROR: 'Sin conexión con la API de Gemini. Revisa tu internet.',
    STORAGE_FULL: 'El almacenamiento del navegador está lleno. Borra algunos leads.',
    STORAGE_UNAVAILABLE: 'Este navegador tiene el almacenamiento bloqueado. Desactiva el modo restringido.'
};

/** IDs de leads que están siendo analizados ahora mismo. */
const analyzing = new Set();

/* ------------------------------ Errores ------------------------------ */

function reportError(error, fallback = 'Ocurrió un error inesperado.') {
    console.error(error);
    showToast(ERROR_MESSAGES[error?.code] || ERROR_MESSAGES[error?.message] || fallback, 'error');
}

/* ------------------------------ API Key ------------------------------ */

function refreshApiKeyStatus() {
    const hasKey = Boolean(getStoredApiKey());
    apiKeyStatus.textContent = hasKey ? 'Clave activa' : 'Sin clave';
    apiKeyStatus.className = `text-xs whitespace-nowrap ${hasKey ? 'text-gold-500 font-semibold' : 'text-ink-faint'}`;
}

function persistApiKey() {
    const key = apiKeyInput.value.trim();
    if (!key) {
        showToast('Ingresa una API Key válida.', 'warning');
        return;
    }
    if (!setStoredApiKey(key)) {
        showToast('No se pudo guardar la clave: el navegador bloquea sessionStorage.', 'error');
        return;
    }
    refreshApiKeyStatus();
    showToast('API Key guardada solo para esta sesión del navegador.', 'success');
}

saveKeyBtn.addEventListener('click', persistApiKey);
apiKeyInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
        event.preventDefault();
        persistApiKey();
    }
});

function resolveApiKey() {
    return getStoredApiKey() || apiKeyInput.value.trim();
}

/* ------------------------------ Render ------------------------------ */

function renderBoard() {
    const buckets = { unscored: [], Baja: [], Media: [], Alta: [] };

    for (const lead of getLeads()) {
        if (lead.estado === 'calificado' && buckets[lead.probabilidad]) {
            buckets[lead.probabilidad].push(lead);
        } else {
            buckets.unscored.push(lead);
        }
    }

    for (const [key, column] of Object.entries(columns)) {
        const leads = buckets[key];
        column.innerHTML = leads.length
            ? leads.map(createCardHTML).join('')
            : renderEmptyState(EMPTY_TEXTS[key]);
        counters[key].textContent = String(leads.length);
    }

    // Repinta el spinner de los leads que quedaron analizándose durante el re-render.
    for (const id of analyzing) {
        setCardLoading(id, true);
    }
}

function analyzeButtonFor(id) {
    const card = board.querySelector(`[data-id="${CSS.escape(id)}"]`);
    return card?.querySelector('[data-action="analyze"]') ?? null;
}

function setCardLoading(id, isLoading, label = 'Analizando...') {
    const button = analyzeButtonFor(id);
    if (!button) return;

    button.disabled = isLoading;
    if (isLoading) {
        button.innerHTML = `${ICONS.spinner}<span>${label}</span>`;
    }
}

/** Feedback mientras el servicio reintenta por sobrecarga (503) o cuota (429). */
function setCardRetrying(id, { attempt, switchingTo }) {
    const label = switchingTo
        ? 'Probando modelo alternativo...'
        : `Sobrecargado, reintentando (${attempt + 1})...`;
    setCardLoading(id, true, label);
}

/* ------------------------------ Formulario ------------------------------ */

function enterEditMode(lead) {
    inputId.value = lead.id;
    inputName.value = lead.nombre;
    inputCourse.value = lead.curso;
    inputNotes.value = lead.notas;
    formTitle.textContent = `Editando: ${lead.nombre}`;
    submitLabel.textContent = 'Guardar cambios';
    cancelEditBtn.classList.remove('hidden');
    inputName.focus();
}

function exitEditMode() {
    form.reset();
    inputId.value = '';
    formTitle.textContent = 'Nuevo Prospecto';
    submitLabel.textContent = 'Guardar Lead';
    cancelEditBtn.classList.add('hidden');
}

cancelEditBtn.addEventListener('click', exitEditMode);

form.addEventListener('submit', (event) => {
    event.preventDefault();

    const data = {
        nombre: inputName.value.trim(),
        curso: inputCourse.value.trim(),
        notas: inputNotes.value.trim()
    };

    if (!data.nombre || !data.curso || !data.notas) {
        showToast('Completa nombre, curso y notas.', 'warning');
        return;
    }

    try {
        if (inputId.value) {
            updateLead(inputId.value, data);
            showToast('Prospecto actualizado.', 'success');
        } else {
            saveLead(data);
            showToast('Prospecto registrado.', 'success');
        }
        exitEditMode();
        renderBoard();
    } catch (error) {
        reportError(error, 'No se pudo guardar el prospecto.');
    }
});

seedBtn.addEventListener('click', () => {
    try {
        seedDemoLeads();
        renderBoard();
        showToast('Se cargaron 3 leads de ejemplo.', 'success');
    } catch (error) {
        reportError(error, 'No se pudieron cargar los ejemplos.');
    }
});

/* ------------------------------ Acciones de las tarjetas ------------------------------ */
/* Delegación de eventos: un solo listener para todo el tablero, sobrevive a los re-renders. */

board.addEventListener('click', async (event) => {
    const button = event.target.closest('button[data-action]');
    if (!button || !board.contains(button)) return;

    const card = button.closest('[data-id]');
    if (!card) return;

    const id = card.dataset.id;
    const action = button.dataset.action;
    const lead = getLeadById(id);

    if (!lead) {
        showToast('Ese prospecto ya no existe.', 'warning');
        renderBoard();
        return;
    }

    if (action === 'delete') {
        if (!window.confirm(`¿Eliminar a ${lead.nombre}? Esta acción no se puede deshacer.`)) return;
        try {
            deleteLead(id);
            if (inputId.value === id) exitEditMode();
            renderBoard();
            showToast('Prospecto eliminado.', 'info');
        } catch (error) {
            reportError(error, 'No se pudo eliminar el prospecto.');
        }
        return;
    }

    if (action === 'edit') {
        enterEditMode(lead);
        return;
    }

    if (action === 'analyze') {
        if (analyzing.has(id)) return;

        const apiKey = resolveApiKey();
        if (!apiKey) {
            showToast(ERROR_MESSAGES.API_KEY_MISSING, 'error');
            apiKeyInput.focus();
            return;
        }

        analyzing.add(id);
        setCardLoading(id, true);

        try {
            const result = await analyzeLeadWithGemini(lead.curso, lead.notas, apiKey, {
                onProgress: (info) => setCardRetrying(id, info)
            });

            updateLead(id, {
                score: result.score,
                probabilidad: result.probabilidad,
                argumento: result.argumento,
                estado: 'calificado',
                notasModificadas: false,
                vecesAnalizado: (lead.vecesAnalizado || 0) + 1,
                analizadoEn: new Date().toISOString()
            });

            showToast(`${lead.nombre}: prioridad ${result.probabilidad} (${result.score}/100)`, 'success');
        } catch (error) {
            reportError(error, 'No se pudo completar el análisis.');
        } finally {
            analyzing.delete(id);
            renderBoard();
        }
    }
});

/* ------------------------------ Arranque ------------------------------ */

function init() {
    if (!isStorageAvailable()) {
        showToast(ERROR_MESSAGES.STORAGE_UNAVAILABLE, 'error');
    }

    const storedKey = getStoredApiKey();
    if (storedKey) apiKeyInput.value = storedKey;
    refreshApiKeyStatus();

    try {
        renderBoard();
    } catch (error) {
        reportError(error, 'No se pudo cargar el tablero.');
    }
}

// Los módulos ES6 son diferidos: el DOM ya está listo cuando esto corre.
init();

export { renderBoard, ERROR_MESSAGES, StorageError };
