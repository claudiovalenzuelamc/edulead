/**
 * UI/View — iconos, estilos por prioridad, toasts y plantilla de tarjeta.
 * No toca localStorage ni la API: solo produce HTML y feedback visual.
 */

export const ICONS = {
    plus: `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path></svg>`,
    sparkles: `<svg class="w-4 h-4 text-amber-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z"></path></svg>`,
    trash: `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>`,
    pencil: `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"></path></svg>`,
    spinner: `<svg class="animate-spin w-4 h-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>`
};

export const PRIORITY_STYLES = {
    'Sin calificar': { col: 'bg-slate-100', card: 'border-slate-400', badge: 'bg-slate-200 text-slate-700' },
    Baja: { col: 'bg-rose-50', card: 'border-rose-400', badge: 'bg-rose-100 text-rose-800' },
    Media: { col: 'bg-amber-50', card: 'border-amber-400', badge: 'bg-amber-100 text-amber-800' },
    Alta: { col: 'bg-emerald-50', card: 'border-emerald-500', badge: 'bg-emerald-100 text-emerald-800' }
};

/** Escapa texto del usuario: sin esto, un "<" en las notas rompe el tablero. */
export function escapeHTML(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * Notificación flotante.
 * @param {string} message
 * @param {'success'|'error'|'warning'|'info'} type
 */
export function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const bgColors = {
        success: 'bg-emerald-600 text-white',
        error: 'bg-rose-600 text-white',
        warning: 'bg-amber-500 text-white',
        info: 'bg-slate-800 text-white'
    };

    const toast = document.createElement('div');
    toast.className = `px-4 py-3 rounded-lg shadow-lg text-sm font-medium transition-all duration-300 transform translate-y-2 opacity-0 flex items-center gap-2 max-w-sm ${bgColors[type] || bgColors.info}`;
    toast.setAttribute('role', type === 'error' ? 'alert' : 'status');
    toast.textContent = message;
    container.appendChild(toast);

    requestAnimationFrame(() => toast.classList.remove('translate-y-2', 'opacity-0'));

    setTimeout(() => {
        toast.classList.add('opacity-0', 'translate-y-2');
        setTimeout(() => toast.remove(), 300);
    }, 4000);
}

export function renderEmptyState(text) {
    return `<p class="text-xs text-gray-400 text-center py-6">${escapeHTML(text)}</p>`;
}

/** HTML de una tarjeta de lead. */
export function createCardHTML(lead) {
    const calificado = lead.estado === 'calificado' && lead.probabilidad;
    const category = calificado ? lead.probabilidad : 'Sin calificar';
    const styles = PRIORITY_STYLES[category] || PRIORITY_STYLES['Sin calificar'];
    const needsAnalysis = lead.estado === 'no_calificado' || lead.notasModificadas;

    const scoreBlock = calificado
        ? `<span class="inline-block ${styles.badge} text-xs px-2 py-1 rounded font-bold mb-2">Score: ${lead.score} / 100</span>
           <p class="text-gray-600 italic bg-gray-50 p-2 rounded border border-gray-100 text-xs mb-3">"${escapeHTML(lead.argumento)}"</p>`
        : `<p class="text-sm text-gray-600 line-clamp-3 mb-3">${escapeHTML(lead.notas)}</p>
           <span class="inline-block bg-slate-200 text-slate-700 text-xs px-2 py-1 rounded font-medium mb-3">Score: --</span>`;

    const warningBlock = lead.notasModificadas
        ? `<span class="block text-xs text-amber-600 font-medium mb-2">Notas modificadas desde el último análisis</span>`
        : '';

    const analyzeBlock = needsAnalysis
        ? `<button type="button" data-action="analyze" class="w-full bg-slate-800 text-white text-sm py-1.5 rounded flex items-center justify-center gap-1 hover:bg-slate-700 disabled:opacity-60 disabled:cursor-not-allowed transition">
               ${ICONS.sparkles}<span>${lead.notasModificadas ? 'Re-analizar' : 'Analizar con IA'}</span>
           </button>`
        : '';

    const metaBlock = calificado && lead.vecesAnalizado > 1
        ? `<p class="text-xs text-gray-400 mt-2">Analizado ${lead.vecesAnalizado} veces</p>`
        : '';

    return `
        <article class="bg-white shadow-sm rounded-lg p-4 border-l-4 ${styles.card} group transition-all duration-200" data-id="${escapeHTML(lead.id)}">
            <div class="flex justify-between items-start mb-2 gap-2">
                <h3 class="font-bold text-gray-900 break-words">${escapeHTML(lead.nombre)}</h3>
                <div class="flex opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity gap-1 shrink-0">
                    <button type="button" data-action="edit" class="text-gray-400 hover:text-indigo-600 p-1" title="Editar" aria-label="Editar">${ICONS.pencil}</button>
                    <button type="button" data-action="delete" class="text-gray-400 hover:text-rose-600 p-1" title="Borrar" aria-label="Borrar">${ICONS.trash}</button>
                </div>
            </div>
            <p class="text-xs text-gray-500 mb-2 font-medium">${escapeHTML(lead.curso)}</p>
            ${scoreBlock}
            ${warningBlock}
            ${analyzeBlock}
            ${metaBlock}
        </article>
    `;
}
