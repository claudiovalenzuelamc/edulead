/**
 * Gemini API Service — arma el prompt, llama a generateContent y valida la respuesta.
 * La API Key la aporta el usuario/evaluador y vive solo en sessionStorage.
 */

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

// gemini-1.5-flash ya fue dado de baja. Modelo estable + alias de respaldo por si cambia el catálogo.
const MODELS = ['gemini-3.5-flash', 'gemini-flash-latest'];

const REQUEST_TIMEOUT_MS = 30000;
const MIN_NOTES_LENGTH = 10;
const API_KEY_STORAGE = 'edulead_gemini_key';

export class GeminiError extends Error {
    constructor(code, detail) {
        super(code);
        this.name = 'GeminiError';
        this.code = code;
        this.detail = detail ?? null;
    }
}

const SYSTEM_PROMPT = `Actúas como un analista de ventas senior de un bootcamp tecnológico. Tu objetivo es leer el perfil y las notas de un prospecto (lead) y determinar su intención de compra.

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

const RESPONSE_SCHEMA = {
    type: 'OBJECT',
    properties: {
        score: { type: 'INTEGER' },
        probabilidad: { type: 'STRING', enum: ['Alta', 'Media', 'Baja'] },
        argumento: { type: 'STRING' }
    },
    required: ['score', 'probabilidad', 'argumento'],
    propertyOrdering: ['score', 'probabilidad', 'argumento']
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

function buildPayload(curso, notas) {
    return {
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{
            role: 'user',
            parts: [{ text: `PROSPECTO A EVALUAR\nCurso de interés: ${curso || 'no especificado'}\nNotas: ${notas}` }]
        }],
        generationConfig: {
            responseMimeType: 'application/json',
            responseSchema: RESPONSE_SCHEMA
        }
    };
}

async function postToModel(model, payload, apiKey) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
        return await fetch(`${API_BASE}/${model}:generateContent`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                // La clave va en el header, no en la URL: evita filtrarla en logs e historial.
                'x-goog-api-key': apiKey
            },
            body: JSON.stringify(payload),
            signal: controller.signal
        });
    } finally {
        clearTimeout(timeoutId);
    }
}

function mapHttpError(status, body) {
    const apiMessage = body?.error?.message || '';

    if (status === 400 && /api key|API_KEY/i.test(apiMessage)) return new GeminiError('API_KEY_INVALID', apiMessage);
    if (status === 400) return new GeminiError('BAD_REQUEST', apiMessage);
    if (status === 401 || status === 403) return new GeminiError('API_KEY_INVALID', apiMessage);
    if (status === 404) return new GeminiError('MODEL_NOT_FOUND', apiMessage);
    if (status === 429) return new GeminiError('RATE_LIMIT_EXCEEDED', apiMessage);
    if (status >= 500) return new GeminiError('SERVER_ERROR', apiMessage);
    return new GeminiError('HTTP_ERROR', `${status} ${apiMessage}`.trim());
}

/* ------------------------------ API pública ------------------------------ */

/**
 * Califica un lead con Gemini.
 * @param {string} curso
 * @param {string} notas
 * @param {string} apiKey
 * @returns {Promise<{score:number, probabilidad:'Alta'|'Media'|'Baja', argumento:string, modelo:string}>}
 * @throws {GeminiError}
 */
export async function analyzeLeadWithGemini(curso, notas, apiKey) {
    if (!apiKey || !String(apiKey).trim()) throw new GeminiError('API_KEY_MISSING');
    if (!notas || notas.trim().length < MIN_NOTES_LENGTH) throw new GeminiError('NOTES_TOO_SHORT');

    const payload = buildPayload(curso, notas.trim());
    let lastError = null;

    for (const model of MODELS) {
        let response;
        try {
            response = await postToModel(model, payload, String(apiKey).trim());
        } catch (error) {
            if (error?.name === 'AbortError') throw new GeminiError('TIMEOUT');
            throw new GeminiError('NETWORK_ERROR', error?.message);
        }

        if (!response.ok) {
            const body = await response.json().catch(() => null);
            lastError = mapHttpError(response.status, body);
            // Solo vale reintentar con otro modelo si el modelo no existe.
            if (lastError.code === 'MODEL_NOT_FOUND') continue;
            throw lastError;
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

        let parsed;
        try {
            parsed = JSON.parse(stripCodeFences(rawText));
        } catch (error) {
            // El parseo es lo único que este try debe capturar.
            throw new GeminiError('JSON_PARSE_ERROR', rawText.slice(0, 200));
        }

        const rawScore = Number(parsed.score);
        if (!Number.isFinite(rawScore) || typeof parsed.argumento !== 'string' || !parsed.argumento.trim()) {
            throw new GeminiError('INVALID_SCHEMA', JSON.stringify(parsed).slice(0, 200));
        }

        const score = Math.min(100, Math.max(1, Math.round(rawScore)));

        return {
            score,
            probabilidad: probabilidadFromScore(score),
            argumento: parsed.argumento.trim(),
            modelo: model
        };
    }

    throw lastError ?? new GeminiError('MODEL_NOT_FOUND');
}
