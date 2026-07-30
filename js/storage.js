const STORAGE_KEY = 'edulead_v1_prospects';

/**
 * Obtiene todos los leads, asegurando que devuelva un array válido.
 */
export function getLeads() {
    try {
        const data = localStorage.getItem(STORAGE_KEY);
        return data ? JSON.parse(data) : [];
    } catch (error) {
        console.error('Error parseando datos de LocalStorage:', error);
        return [];
    }
}

/**
 * Crea un nuevo lead con valores por defecto.
 */
export function saveLead(leadData) {
    const leads = getLeads();
    const newLead = {
        id: Date.now().toString(),
        nombre: leadData.nombre,
        curso: leadData.curso,
        notas: leadData.notas,
        estado: 'no_calificado', // 'no_calificado' | 'calificado'
        score: null,
        probabilidad: null, // 'Alta' | 'Media' | 'Baja'
        argumento: null,
        notasModificadas: false, // Flag para re-calificación
        vecesAnalizado: 0,
        analizadoEn: null,
        createdAt: Date.now()
    };
    
    leads.push(newLead);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(leads));
    return newLead;
}

/**
 * Actualiza un lead existente (Ej: edición manual o actualización del LLM).
 */
export function updateLead(id, updates) {
    const leads = getLeads();
    const index = leads.findIndex(l => l.id === id);
    
    if (index !== -1) {
        // Si se actualizan las notas de un lead ya calificado, activamos el flag
        if (updates.notas && leads[index].estado === 'calificado' && updates.notas !== leads[index].notas) {
            updates.notasModificadas = true;
        }

        leads[index] = { ...leads[index], ...updates };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(leads));
        return leads[index];
    }
    return null;
}

/**
 * Elimina un lead definitivamente.
 */
export function deleteLead(id) {
    const leads = getLeads();
    const filteredLeads = leads.filter(l => l.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filteredLeads));
}
