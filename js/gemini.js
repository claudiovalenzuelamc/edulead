const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent';

const SYSTEM_PROMPT = `Actúas como un analista de ventas senior de un bootcamp tecnológico. Tu objetivo es leer el perfil y las notas de un prospecto (lead) y determinar su intención de compra.

RÚBRICA DE EVALUACIÓN:
- Sube el score (+): Tiene presupuesto claro, indica urgencia por empezar (fechas), menciona un rol o necesidad que encaja perfecto con los cursos.
- Baja el score (-): Objeciones fuertes de precio, respuestas evasivas o vagas, estudiante buscando material gratuito, curiosidad sin intención de inscripción a corto plazo.

RESTRICCIÓN ABSOLUTA:
Devuelve ÚNICA Y EXCLUSIVAMENTE un objeto JSON válido, sin formato markdown, sin bloques de código, y sin texto adicional.

FORMATO DE SALIDA REQUERIDO:
{
  "score": <número entero del 1 al 100>,
  "probabilidad": <"Alta" (score 75-100), "Media" (score 40-74) o "Baja" (score 1-39)>,
  "argumento": <string de máximo 20 palabras justificando la decisión>
}`;

/**
 * Guarda o recupera la API Key de sessionStorage (persistente durante la sesión del navegador).
 */
export function getStoredApiKey() {
    return sessionStorage.getItem('edulead_gemini_key') || '';
}

export function setStoredApiKey(key) {
    sessionStorage.setItem('edulead_gemini_key', key.trim());
}

/**
 * Realiza la llamada a la API de Gemini para clasificar un lead.
 * @param {string} curso - Nombre del curso de interés
 * @param {string} notas - Texto con la interacción/notas
 * @param {string} apiKey - Clave API de Gemini
 * @returns {Promise<{score: number, probabilidad: string, argumento: string}>}
 */
export async function analyzeLeadWithGemini(curso, notas, apiKey) {
    if (!apiKey) {
        throw new Error('API_KEY_MISSING');
    }

    if (!notas || notas.trim().length < 10) {
        throw new Error('NOTES_TOO_SHORT');
    }

    const payload = {
        systemInstruction: {
            parts: [{ text: SYSTEM_PROMPT }]
        },
        contents: [
            {
                parts: [
                    {
                        text: `PROSPECTO A EVALUAR:\nCurso de interés: ${curso}\nNotas: ${notas}`
                    }
                ]
            }
        ],
        generationConfig: {
            response_mime_type: "application/json",
            temperature: 0.2
        }
    };

    const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        if (response.status === 400 || response.status === 403) {
            throw new Error('API_KEY_INVALID');
        } else if (response.status === 429) {
            throw new Error('RATE_LIMIT_EXCEEDED');
        } else {
            throw new Error(`HTTP_ERROR_${response.status}`);
        }
    }

    const data = await response.json();

    try {
        const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!rawText) {
            throw new Error('EMPTY_RESPONSE');
        }
        
        const parsedJSON = JSON.parse(rawText);

        // Validar esquema esperado
        if (
            typeof parsedJSON.score !== 'number' ||
            !['Alta', 'Media', 'Baja'].includes(parsedJSON.probabilidad) ||
            typeof parsedJSON.argumento !== 'string'
        ) {
            throw new Error('INVALID_SCHEMA');
        }

        return parsedJSON;
    } catch (parseError) {
        console.error('Error procesando respuesta del LLM:', parseError);
        throw new Error('JSON_PARSE_ERROR');
    }
}
