/**
 * Gemini API Service — arma los prompts, llama a generateContent y valida las respuestas.
 * La API Key la aporta el usuario/evaluador y vive solo en sessionStorage.
 *
 * Expone dos capacidades:
 *   analyzeLeadWithGemini    -> lead scoring semántico
 *   draftOutreachWithGemini  -> redacción del primer mensaje de contacto
 */

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

/**
 * Cadena de modelos. Se prueba en orden:
 * 1. gemini-3.5-flash        estable y de mejor calidad. gemini-1.5-flash está dado de baja.
 * 2. gemini-3.1-flash-lite   más liviano: suele seguir disponible cuando el flagship devuelve 503.
 * 3. gemini-flash-latest     alias, por si el catálogo cambia y los anteriores dan 404.
 */
const MODELS = ['gemini-3.5-flash', 'gemini-3.1-flash-lite', 'gemini-flash-latest'];

/**
 * Reintentos. Google recomienda backoff exponencial con jitter ante 429 y 5xx.
 * Es mutable para poder ajustarlo (o anularlo en tests).
 */
export const retryConfig = { attemptsPerModel: 3, baseDelayMs: 800 };

/** Errores transitorios: vale la pena reintentar. El resto se propaga de inmediato. */
const RETRYABLE_CODES = new Set(['RATE_LIMIT_EXCEEDED', 'SERVER_ERROR', 'TIMEOUT', 'NETWORK_ERROR']);

const REQUEST_TIMEOUT_MS = 30000;
const MIN_NOTES_LENGTH = 10;
const API_KEY_STORAGE = 'edulead_gemini_key';

export const CANALES = ['WhatsApp', 'Email'];
export const TONOS = ['Cercano', 'Formal', 'Directo'];

export class GeminiError extends Error {
    constructor(code, detail) {
        super(code);
        this.name = 'GeminiError';
        this.code = code;
        this.detail = detail ?? null;
    }
}

/* ------------------------------ Prompts ------------------------------ */

const SCORING_PROMPT = `Actúas como un analista de ventas senior de un bootcamp tecnológico. Tu objetivo es leer el perfil y las notas de un prospecto (lead) y determinar su intención de compra.

RÚBRICA DE EVALUACIÓN
Sube el score (+):
- Menciona presupuesto disponible, aprobado o financiamiento de su empresa.
- Indica urgencia con fechas concretas ("este mes", "antes de que cierre el trimestre").
- Su rol o necesidad profesional encaja directamente con el curso.
- Pide precios, formas de pago, factura, cupos o fechas de inicio.
- Ya tomó una acción concreta (agendó reunión, envió datos, pidió contrato).

Baja el score (-):
- Objeciones fuertes de precio o pide descuentos sin comprometerse.
- Respuestas vagas, evasivas o sin plazo definido.
- Busca material gratuito, becas totales o solo información general.
- Curiosidad sin intención de inscribirse en el corto plazo ("para el próximo año").
- No hay claridad sobre quién decide ni sobre quién paga.

ESCALA
- 75 a 100 => probabilidad "Alta"
- 40 a 74  => probabilidad "Media"
- 1 a 39   => probabilidad "Baja"

RESTRICCIÓN ABSOLUTA
Devuelve ÚNICA Y EXCLUSIVAMENTE un objeto JSON válido, sin markdown, sin bloques de código y sin texto adicional.
El campo "argumento" debe tener máximo 20 palabras, en español, citando la señal concreta que justifica el score.

EJEMPLOS

Entrada: Curso: Cloud Architecture. Notas: Jefa de infraestructura, su empresa ya aprobó el presupuesto, necesita certificar al equipo este mes, pidió factura.
Salida: {"score": 93, "probabilidad": "Alta", "argumento": "Presupuesto aprobado, urgencia definida y pide factura: decisión de compra prácticamente tomada."}

Entrada: Curso: Diseño UX/UI. Notas: Estudiante de primer año, pregunta si hay material gratuito, dice que está mirando opciones para el próximo año.
Salida: {"score": 18, "probabilidad": "Baja", "argumento": "Busca material gratuito y proyecta la decisión al próximo año: sin intención inmediata."}`;

const OUTREACH_PROMPT = `Actúas como un ejecutivo comercial senior de un bootcamp tecnológico en Chile. Escribes el PRIMER mensaje de contacto a un prospecto, a partir de las notas que registró el vendedor.

REGLAS DE REDACCIÓN
- Español de Chile, natural y profesional. Nada de traducciones literales del inglés.
- Trata al prospecto de "tú" si el tono es Cercano o Directo, y de "usted" si es Formal.
- Referencia UNA señal concreta de las notas (su rol, su urgencia, su duda, su presupuesto). Eso demuestra que leíste su caso.
- Nunca inventes datos que no estén en las notas: ni precios, ni fechas de inicio, ni becas, ni nombres de profesores.
- Cierra con UNA sola pregunta o llamado a la acción claro.
- Prohibido el relleno comercial: "espero que estés muy bien", "somos líderes en", "no dudes en contactarme".
- No uses emojis salvo que el canal sea WhatsApp y el tono sea Cercano, y en ese caso como máximo uno.

FORMATO POR CANAL
- WhatsApp: máximo 55 palabras, sin asunto, en uno o dos párrafos cortos. El campo "asunto" va vacío.
- Email: máximo 110 palabras, con saludo y despedida. El "asunto" debe tener máximo 8 palabras, ser específico y no parecer spam.

AJUSTE POR PRIORIDAD
- Prioridad Alta: propone un paso concreto e inmediato, como coordinar una llamada esta semana.
- Prioridad Media: resuelve primero la duda o la objeción que aparece en las notas.
- Prioridad Baja: mensaje breve y de bajo compromiso, sin presionar el cierre.

RESTRICCIÓN ABSOLUTA
Devuelve ÚNICA Y EXCLUSIVAMENTE un objeto JSON válido, sin markdown, sin bloques de código y sin texto adicional.
El campo "gancho" explica en máximo 15 palabras qué señal de las notas usaste y por qué.`;

const SCORING_SCHEMA = {
    type: 'OBJECT',
    properties: {
        score: { type: 'INTEGER' },
        probabilidad: { type: 'STRING', enum: ['Alta', 'Media', 'Baja'] },
        argumento: { type: 'STRING' }
    },
    required: ['score', 'probabilidad', 'argumento'],
    propertyOrdering: ['score', 'probabilidad', 'argumento']
};

const OUTREACH_SCHEMA = {
    type: 'OBJECT',
    properties: {
        asunto: { type: 'STRING' },
        mensaje: { type: 'STRING' },
        gancho: { type: 'STRING' }
    },
    required: ['asunto', 'mensaje', 'gancho'],
    propertyOrdering: ['asunto', 'mensaje', 'gancho']
};

/* ------------------------------ API Key ------------------------------ */

export function getStoredApiKey() {
    try {
        return sessionStorage.getItem(API_KEY_STORAGE) || '';
    } catch (error) {
        return '';
    }
}

export function setStoredApiKey(key) {
    try {
        sessionStorage.setItem(API_KEY_STORAGE, String(key).trim());
        return true;
    } catch (error) {
        return false;
    }
}

export function clearStoredApiKey() {
    try {
        sessionStorage.removeItem(API_KEY_STORAGE);
    } catch (error) {
        /* noop */
    }
}

/* ------------------------------ Helpers ------------------------------ */

/** La prioridad se deriva del score para que el badge nunca contradiga la columna. */
export function probabilidadFromScore(score) {
    if (score >= 75) return 'Alta';
    if (score >= 40) return 'Media';
    return 'Baja';
}

/** Quita cercos de markdown por si el modelo los agrega igual. */
function stripCodeFences(text) {
    return text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Backoff exponencial con jitter: 800ms, 1600ms, 3200ms... +/- aleatorio. */
function backoffDelay(attempt) {
    const exponential = retryConfig.baseDelayMs * 2 ** (attempt - 1);
    return exponential + Math.random() * retryConfig.baseDelayMs * 0.5;
}

function buildPayload(systemPrompt, userText, schema) {
    return {
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: 'user', parts: [{ text: userText }] }],
        generationConfig: {
            responseMimeType: 'application/json',
            responseSchema: schema
        }
    };
}

function mapHttpError(status, body) {
    const apiMessage = body?.error?.message || '';

    if (status === 400 && /api key|API_KEY/i.test(apiMessage)) return new GeminiError('API_KEY_INVALID', apiMessage);
    if (status === 400) return new GeminiError('BAD_REQUEST', apiMessage);
    if (status === 401 || status === 403) return new GeminiError('API_KEY_INVALID', apiMessage);
    if (status === 404) return new GeminiError('MODEL_NOT_FOUND', apiMessage);
    if (status === 429) return new GeminiError('RATE_LIMIT_EXCEEDED', apiMessage);
    if (status >= 500) return new GeminiError('SERVER_ERROR', `${status} ${apiMessage}`.trim());
    return new GeminiError('HTTP_ERROR', `${status} ${apiMessage}`.trim());
}

/** Un intento contra un modelo: pide, parsea y devuelve el JSON crudo del modelo. */
async function requestOnce(model, payload, apiKey) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    let response;
    try {
        response = await fetch(`${API_BASE}/${model}:generateContent`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                // La clave va en el header, no en la URL: evita filtrarla en logs e historial.
                'x-goog-api-key': apiKey
            },
            body: JSON.stringify(payload),
            signal: controller.signal
        });
    } catch (error) {
        if (error?.name === 'AbortError') throw new GeminiError('TIMEOUT');
        throw new GeminiError('NETWORK_ERROR', error?.message);
    } finally {
        clearTimeout(timeoutId);
    }

    if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw mapHttpError(response.status, body);
    }

    const data = await response.json().catch(() => null);
    if (!data) throw new GeminiError('JSON_PARSE_ERROR');

    const blockReason = data.promptFeedback?.blockReason;
    if (blockReason) throw new GeminiError('CONTENT_BLOCKED', blockReason);

    const candidate = data.candidates?.[0];
    if (candidate?.finishReason === 'MAX_TOKENS') throw new GeminiError('RESPONSE_TRUNCATED');
    if (candidate?.finishReason === 'SAFETY') throw new GeminiError('CONTENT_BLOCKED', 'SAFETY');

    const rawText = candidate?.content?.parts?.map((part) => part.text).filter(Boolean).join('') || '';
    if (!rawText.trim()) throw new GeminiError('EMPTY_RESPONSE');

    try {
        return JSON.parse(stripCodeFences(rawText));
    } catch (error) {
        // El parseo es lo único que este try debe capturar.
        throw new GeminiError('JSON_PARSE_ERROR', rawText.slice(0, 200));
    }
}

/**
 * Recorre la cadena de modelos reintentando los errores transitorios.
 * @returns {Promise<{data: object, modelo: string}>}
 */
async function callGemini(payload, apiKey, onProgress) {
    let lastError = null;

    for (let modelIndex = 0; modelIndex < MODELS.length; modelIndex++) {
        const model = MODELS[modelIndex];

        for (let attempt = 1; attempt <= retryConfig.attemptsPerModel; attempt++) {
            try {
                return { data: await requestOnce(model, payload, apiKey), modelo: model };
            } catch (error) {
                lastError = error;

                // El modelo no existe: no tiene sentido reintentarlo, se pasa al siguiente.
                if (error.code === 'MODEL_NOT_FOUND') break;

                // Errores del cliente (key inválida, JSON malo, contenido bloqueado): fallan de inmediato.
                if (!RETRYABLE_CODES.has(error.code)) throw error;

                if (attempt < retryConfig.attemptsPerModel) {
                    const waitMs = backoffDelay(attempt);
                    onProgress?.({ model, attempt, code: error.code, waitMs });
                    await sleep(waitMs);
                }
            }
        }

        const nextModel = MODELS[modelIndex + 1];
        if (nextModel) {
            onProgress?.({ model, attempt: retryConfig.attemptsPerModel, code: lastError?.code, switchingTo: nextModel });
        }
    }

    throw lastError ?? new GeminiError('MODEL_NOT_FOUND');
}

function requireApiKey(apiKey) {
    if (!apiKey || !String(apiKey).trim()) throw new GeminiError('API_KEY_MISSING');
    return String(apiKey).trim();
}

function requireNotes(notas) {
    if (!notas || notas.trim().length < MIN_NOTES_LENGTH) throw new GeminiError('NOTES_TOO_SHORT');
    return notas.trim();
}

/* ------------------------------ Lead scoring ------------------------------ */

/**
 * Califica un lead con Gemini.
 * @returns {Promise<{score:number, probabilidad:'Alta'|'Media'|'Baja', argumento:string, modelo:string}>}
 * @throws {GeminiError}
 */
export async function analyzeLeadWithGemini(curso, notas, apiKey, options = {}) {
    const key = requireApiKey(apiKey);
    const texto = requireNotes(notas);

    const payload = buildPayload(
        SCORING_PROMPT,
        `PROSPECTO A EVALUAR\nCurso de interés: ${curso || 'no especificado'}\nNotas: ${texto}`,
        SCORING_SCHEMA
    );

    const { data, modelo } = await callGemini(payload, key, options.onProgress);

    const rawScore = Number(data.score);
    if (!Number.isFinite(rawScore) || typeof data.argumento !== 'string' || !data.argumento.trim()) {
        throw new GeminiError('INVALID_SCHEMA', JSON.stringify(data).slice(0, 200));
    }

    const score = Math.min(100, Math.max(1, Math.round(rawScore)));

    return {
        score,
        probabilidad: probabilidadFromScore(score),
        argumento: data.argumento.trim(),
        modelo
    };
}

/* ------------------------------ Primer contacto ------------------------------ */

/**
 * Redacta el primer mensaje de contacto para un lead ya calificado.
 * Equivale al "AI email writer" de Pipedrive o al asistente de redacción de HubSpot,
 * pero apoyado en el score y en las notas que ya viven en el CRM.
 *
 * @param {{nombre:string, curso:string, notas:string, score:number, probabilidad:string, argumento:string}} lead
 * @param {{canal:'WhatsApp'|'Email', tono:'Cercano'|'Formal'|'Directo'}} opciones
 * @param {string} apiKey
 * @returns {Promise<{asunto:string, mensaje:string, gancho:string, canal:string, tono:string, modelo:string}>}
 * @throws {GeminiError}
 */
export async function draftOutreachWithGemini(lead, opciones, apiKey, options = {}) {
    const key = requireApiKey(apiKey);
    const texto = requireNotes(lead?.notas);

    const canal = CANALES.includes(opciones?.canal) ? opciones.canal : 'WhatsApp';
    const tono = TONOS.includes(opciones?.tono) ? opciones.tono : 'Cercano';

    const contexto = [
        `Canal: ${canal}`,
        `Tono: ${tono}`,
        `Nombre del prospecto: ${lead.nombre || 'sin nombre'}`,
        `Curso de interés: ${lead.curso || 'no especificado'}`,
        `Prioridad asignada: ${lead.probabilidad || 'sin calificar'}`,
        `Score: ${Number.isFinite(lead.score) ? lead.score : 'sin score'}`,
        lead.argumento ? `Razón del score: ${lead.argumento}` : null,
        `Notas de la interacción: ${texto}`
    ].filter(Boolean).join('\n');

    const payload = buildPayload(OUTREACH_PROMPT, `PROSPECTO\n${contexto}`, OUTREACH_SCHEMA);
    const { data, modelo } = await callGemini(payload, key, options.onProgress);

    if (typeof data.mensaje !== 'string' || !data.mensaje.trim()) {
        throw new GeminiError('INVALID_SCHEMA', JSON.stringify(data).slice(0, 200));
    }

    return {
        asunto: canal === 'Email' ? String(data.asunto || '').trim() : '',
        mensaje: data.mensaje.trim(),
        gancho: String(data.gancho || '').trim(),
        canal,
        tono,
        modelo
    };
}
