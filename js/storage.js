/**
 * Storage Controller — única fuente de verdad de los leads.
 * Persiste en localStorage con esquema versionado y tolera datos corruptos.
 */

const STORAGE_KEY = 'edulead_v1_prospects';
const SCHEMA_VERSION = 1;

export class StorageError extends Error {
    constructor(code, cause) {
        super(code);
        this.name = 'StorageError';
        this.code = code;
        this.cause = cause;
    }
}

/** ¿Tenemos localStorage usable? (modo incógnito estricto / cookies bloqueadas lo deshabilitan) */
export function isStorageAvailable() {
    try {
        const probe = '__edulead_probe__';
        localStorage.setItem(probe, '1');
        localStorage.removeItem(probe);
        return true;
    } catch (error) {
        return false;
    }
}

/** Rellena campos ausentes para que un lead viejo no rompa el render. */
function normalizeLead(lead) {
    return {
        id: String(lead.id ?? Date.now()),
        nombre: lead.nombre ?? 'Sin nombre',
        curso: lead.curso ?? '',
        notas: lead.notas ?? '',
        estado: lead.estado === 'calificado' ? 'calificado' : 'no_calificado',
        score: typeof lead.score === 'number' ? lead.score : null,
        probabilidad: ['Alta', 'Media', 'Baja'].includes(lead.probabilidad) ? lead.probabilidad : null,
        argumento: lead.argumento ?? null,
        notasModificadas: Boolean(lead.notasModificadas),
        vecesAnalizado: Number(lead.vecesAnalizado) || 0,
        analizadoEn: lead.analizadoEn ?? null,
        // Primer contacto redactado con IA
        mensaje: lead.mensaje ?? null,
        mensajeAsunto: lead.mensajeAsunto ?? null,
        mensajeCanal: lead.mensajeCanal ?? null,
        mensajeTono: lead.mensajeTono ?? null,
        mensajeGancho: lead.mensajeGancho ?? null,
        mensajeEn: lead.mensajeEn ?? null,
        createdAt: Number(lead.createdAt) || Date.now()
    };
}

/** Campos del borrador de contacto, para poder limpiarlos de una sola vez. */
const CAMPOS_MENSAJE = {
    mensaje: null,
    mensajeAsunto: null,
    mensajeCanal: null,
    mensajeTono: null,
    mensajeGancho: null,
    mensajeEn: null
};

function readRaw() {
    let raw;
    try {
        raw = localStorage.getItem(STORAGE_KEY);
    } catch (error) {
        throw new StorageError('STORAGE_UNAVAILABLE', error);
    }

    if (!raw) return [];

    try {
        const parsed = JSON.parse(raw);
        // Soporta el formato antiguo (array plano) y el nuevo ({ version, leads }).
        const leads = Array.isArray(parsed) ? parsed : parsed?.leads;
        return Array.isArray(leads) ? leads.map(normalizeLead) : [];
    } catch (error) {
        console.error('localStorage corrupto, se reinicia la colección:', error);
        return [];
    }
}

function writeRaw(leads) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: SCHEMA_VERSION, leads }));
    } catch (error) {
        // QuotaExceededError en Chrome/Safari, NS_ERROR_DOM_QUOTA_REACHED en Firefox
        const isQuota = error?.name === 'QuotaExceededError'
            || error?.name === 'NS_ERROR_DOM_QUOTA_REACHED'
            || error?.code === 22;
        throw new StorageError(isQuota ? 'STORAGE_FULL' : 'STORAGE_UNAVAILABLE', error);
    }
}

function newId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Devuelve todos los leads, ordenados del más reciente al más antiguo. */
export function getLeads() {
    return readRaw().sort((a, b) => b.createdAt - a.createdAt);
}

export function getLeadById(id) {
    return readRaw().find((lead) => lead.id === String(id)) ?? null;
}

/** Crea un lead nuevo, siempre en estado no_calificado. */
export function saveLead({ nombre, curso, notas }) {
    const leads = readRaw();
    const newLead = normalizeLead({
        id: newId(),
        nombre,
        curso,
        notas,
        estado: 'no_calificado',
        createdAt: Date.now()
    });

    leads.push(newLead);
    writeRaw(leads);
    return newLead;
}

/**
 * Actualiza un lead. Si cambian las notas de un lead ya calificado,
 * marca notasModificadas para habilitar la re-calificación.
 */
export function updateLead(id, updates) {
    const leads = readRaw();
    const index = leads.findIndex((lead) => lead.id === String(id));
    if (index === -1) return null;

    const current = leads[index];
    const patch = { ...updates };

    const notasCambiaron = typeof patch.notas === 'string' && patch.notas !== current.notas;
    if (notasCambiaron && current.estado === 'calificado' && patch.notasModificadas === undefined) {
        patch.notasModificadas = true;
    }

    // Si cambian las notas, el borrador de contacto queda obsoleto: citaba las notas viejas.
    if (notasCambiaron && current.mensaje && patch.mensaje === undefined) {
        Object.assign(patch, CAMPOS_MENSAJE);
    }

    leads[index] = normalizeLead({ ...current, ...patch });
    writeRaw(leads);
    return leads[index];
}

export function deleteLead(id) {
    const leads = readRaw();
    const remaining = leads.filter((lead) => lead.id !== String(id));
    if (remaining.length === leads.length) return false;
    writeRaw(remaining);
    return true;
}

/** Datos de demo para la presentación. No sobreescribe lo que ya existe. */
export function seedDemoLeads() {
    const demo = [
        {
            nombre: 'Ana Silva',
            curso: 'Cloud Architecture',
            notas: 'Jefa de infraestructura en una fintech. Su empresa ya aprobó el presupuesto de capacitación y necesita certificar al equipo antes de cerrar el trimestre. Pidió factura y cupos para 3 personas.'
        },
        {
            nombre: 'Diego Torres',
            curso: 'Bootcamp Fullstack',
            notas: 'Trabaja de lunes a viernes hasta las 19:00 y quiere cambiarse de carrera. Le interesa el programa pero debe confirmar si alcanza a llegar a las clases en vivo. Preguntó por cuotas sin interés.'
        },
        {
            nombre: 'Camila Rojas',
            curso: 'Diseño UX/UI',
            notas: 'Estudiante de primer año. Preguntó si el curso es gratis o si hay material libre disponible. Dice que por ahora solo está mirando opciones para el próximo año.'
        }
    ];

    return demo.map((lead) => saveLead(lead));
}
