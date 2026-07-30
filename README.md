# EduLead AI — CRM Estático con Lead Scoring y Priorización Inteligente

Prototipo de CRM 100% frontend que registra prospectos (leads) de venta de cursos y usa la
API de Google Gemini para asignarles un puntaje semántico (1–100) y clasificar su prioridad
de contacto en un tablero Kanban.

**Autores:** José Tomás Díaz y Claudio Valenzuela · **Evaluador:** Felipe Cuevas

## Stack

HTML5 + TailwindCSS (Play CDN) + JavaScript ES6 modules. Sin backend, sin build, sin dependencias que instalar.
Los datos viven en `localStorage`; la API Key vive en `sessionStorage` y nunca se commitea.

## Estructura

```
index.html        UI: formulario de ingreso y tablero Kanban de 4 columnas
js/storage.js     Storage Controller: CRUD sobre localStorage con esquema versionado
js/ui.js          Vista: iconos, estilos por prioridad, toasts y plantilla de tarjeta
js/gemini.js      Gemini API Service: system prompt, llamada HTTP y validación del JSON
js/app.js         Main App: orquesta eventos de la UI con storage y el servicio de IA
```

## Cómo correrlo

La app usa módulos ES6, así que **no funciona abriendo `index.html` con doble clic** (`file://`).
Necesita servirse por HTTP:

```bash
npx serve .
# o
python3 -m http.server 8000
```

Luego abre `http://localhost:8000`. En producción se sirve desde GitHub Pages.

## Cómo probarlo (para el evaluador)

1. Consigue una API Key gratuita en <https://aistudio.google.com/apikey>.
2. Pégala en el campo del encabezado y presiona **Guardar**. Queda solo en tu navegador,
   en `sessionStorage`, y se borra al cerrar la pestaña.
3. Presiona **Cargar 3 leads de ejemplo** para poblar el tablero.
4. En cualquier tarjeta, presiona **Analizar con IA**. Gemini lee las notas y devuelve
   `score`, `probabilidad` y `argumento`; la tarjeta cambia de color y salta a la columna
   de prioridad correspondiente.
5. Edita las notas de un lead ya calificado: aparece el aviso *Notas modificadas* y el botón
   **Re-analizar**, para comprobar que el score reacciona al contexto nuevo.

## Modelo de datos

```json
{
  "id": "uuid",
  "nombre": "Ana Silva",
  "curso": "Cloud Architecture",
  "notas": "Presupuesto aprobado por su empresa...",
  "estado": "no_calificado | calificado",
  "score": null,
  "probabilidad": null,
  "argumento": null,
  "notasModificadas": false,
  "vecesAnalizado": 0,
  "analizadoEn": null,
  "createdAt": 1750000000000
}
```

Se persiste en `localStorage` bajo la clave `edulead_v1_prospects` con el formato
`{ "version": 1, "leads": [...] }`. El lector tolera el formato antiguo (array plano) y
datos corruptos sin romper la app.

## Contrato con Gemini

Se llama a `POST /v1beta/models/{modelo}:generateContent` con `responseMimeType: application/json`
y un `responseSchema` que fuerza exactamente estos campos:

```json
{ "score": 93, "probabilidad": "Alta", "argumento": "máximo 20 palabras" }
```

Detalles de implementación:

- **Modelo:** `gemini-3.5-flash`, con reintento automático en `gemini-flash-latest` si el
  catálogo cambia. `gemini-1.5-flash` está dado de baja y devuelve 404.
- **Autenticación:** la clave va en el header `x-goog-api-key`, no en la query string.
- **Coherencia:** la prioridad se deriva del `score` (≥75 Alta, ≥40 Media, resto Baja) para
  que el badge nunca contradiga la columna, aunque el modelo responda algo distinto.
- **Timeout:** 30 s vía `AbortController`.

## Errores manejados

| Situación | Mensaje al usuario |
| --- | --- |
| Falta API Key | Ingresa tu API Key de Gemini arriba a la derecha. |
| Key inválida (401/403) | API Key inválida, expirada o sin permisos. |
| Cuota superada (429) | Cuota superada (429). Espera un minuto y vuelve a intentar. |
| Modelo inexistente (404) | El modelo de Gemini no está disponible para esta API Key. |
| Respuesta no-JSON | La IA devolvió una respuesta que no es JSON válido. |
| Esquema inesperado | La IA respondió con un formato inesperado. |
| Contenido bloqueado | El contenido fue bloqueado por los filtros de seguridad. |
| Sin conexión / timeout | Sin conexión con la API de Gemini / la petición se canceló. |
| Notas muy cortas | Las notas deben tener al menos 10 caracteres. |
| `localStorage` lleno o bloqueado | Almacenamiento lleno / bloqueado por el navegador. |

## Seguridad

Este es un frontend público: **no existe forma segura de guardar una API Key aquí**.
Por eso cada persona que prueba la app aporta la suya, se guarda solo en `sessionStorage`
y nunca se escribe en el repositorio. Todo el texto que ingresa el usuario se escapa antes
de renderizarse, para evitar inyección de HTML en el tablero.

## Roadmap post-bootcamp

1. **Full-stack:** migrar de `localStorage` a Firebase o PostgreSQL con backend en Node.js/Python
   y autenticación, moviendo la API Key al servidor.
2. **Omnicanalidad:** ingestar interacciones automáticamente desde WhatsApp, Gmail o Meta.
3. **Modelos predictivos reales:** entrenar regresión logística o Random Forest con histórico
   de ventas y dejar a Gemini solo el análisis de sentimiento del texto.
