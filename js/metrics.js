/**
 * Métricas del embudo — funciones puras sobre la lista de leads.
 * Sin DOM y sin localStorage, para poder probarlas de forma aislada.
 *
 * Equivale al módulo "Insights and reports" que ofrecen Pipedrive, HubSpot y Zoho:
 * el vendedor no solo ve tarjetas, ve el estado de su cartera.
 */

const PRIORIDADES = ['Alta', 'Media', 'Baja'];

function esCalificado(lead) {
    return lead.estado === 'calificado' && PRIORIDADES.includes(lead.probabilidad);
}

/** Un lead necesita re-análisis si nunca se calificó o si le cambiaron las notas después. */
export function necesitaAnalisis(lead) {
    return lead.estado === 'no_calificado' || Boolean(lead.notasModificadas);
}

/** Está listo para contactar cuando ya tiene score pero todavía no tiene mensaje redactado. */
export function esperaContacto(lead) {
    return esCalificado(lead) && !lead.mensaje;
}

/**
 * @param {Array<object>} leads
 * @returns {{
 *   total:number, calificados:number, sinCalificar:number, cobertura:number,
 *   scorePromedio:number|null, porPrioridad:{Alta:number,Media:number,Baja:number},
 *   pendientesContacto:number, contactados:number, siguientes:Array<object>
 * }}
 */
export function computeMetrics(leads) {
    const lista = Array.isArray(leads) ? leads : [];
    const calificados = lista.filter(esCalificado);

    const porPrioridad = { Alta: 0, Media: 0, Baja: 0 };
    let sumaScores = 0;

    for (const lead of calificados) {
        porPrioridad[lead.probabilidad] += 1;
        sumaScores += Number(lead.score) || 0;
    }

    const pendientes = lista.filter(esperaContacto);

    // A quién contactar ahora: primero los de score más alto, y a igualdad de score el más antiguo,
    // porque un lead que lleva días esperando se enfría.
    const siguientes = [...pendientes]
        .sort((a, b) => (b.score - a.score) || (a.createdAt - b.createdAt))
        .slice(0, 3);

    return {
        total: lista.length,
        calificados: calificados.length,
        sinCalificar: lista.length - calificados.length,
        cobertura: lista.length ? Math.round((calificados.length / lista.length) * 100) : 0,
        scorePromedio: calificados.length ? Math.round(sumaScores / calificados.length) : null,
        porPrioridad,
        pendientesContacto: pendientes.length,
        contactados: lista.filter((lead) => Boolean(lead.mensaje)).length,
        siguientes
    };
}

/**
 * Segmentos de la barra de distribución, ya en porcentaje.
 * Devuelve solo los segmentos con leads, para no renderizar tramos de ancho cero.
 */
export function distributionSegments(metrics) {
    const base = metrics.calificados;
    if (!base) return [];

    return PRIORIDADES
        .map((prioridad) => ({
            prioridad,
            cantidad: metrics.porPrioridad[prioridad],
            porcentaje: Math.round((metrics.porPrioridad[prioridad] / base) * 100)
        }))
        .filter((segmento) => segmento.cantidad > 0);
}
