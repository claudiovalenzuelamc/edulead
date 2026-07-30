# EduLead AI — CRM Estático con Lead Scoring y Priorización Inteligente

Prototipo de CRM 100% frontend que registra prospectos (leads) de venta de cursos y usa la
API de Google Gemini para asignarles un puntaje semántico (1–100) y clasificar su prioridad
de contacto en un tablero Kanban.

**Autores:** José Tomás Díaz y Claudio Valenzuela · **Evaluador:** Felipe Cuevas

## Stack

HTML5 + TailwindCSS (Play CDN) + JavaScript ES6 modules. Sin backend, sin build, sin dependencias que instalar.
Los datos viven en `localStorage`; la API Key vive en `sessionStorage` y nunca se commitea.

## Identidad visual

Interfaz oscura construida sobre la paleta corporativa. Los tokens se declaran una sola vez en
`tailwind.config`, dentro de `index.html`, y nada en el código usa colores sueltos de Tailwind.

| Token | Hex | Uso |
| --- | --- | --- |
| `night` | `#020202` | Fondo de página |
| `surface` | `#0C0C0C` | Tarjetas, columnas y barra superior |
| `raised` | `#141414` | Inputs, hover y bloques citados |
| `line` | `#232323` | Bordes y separadores |
| `coral-500` | `#ED5543` | Color de acción: botón primario, prioridad alta, errores |
| `gold-500` | `#FBC80C` | Atención: prioridad media, advertencias, clave activa |
| `grape-500` | `#2F0558` | Morado corporativo: prioridad baja, confirmaciones |
| `ink` | `#FDFDFD` | Texto principal |

Criterios aplicados:

- **Mapeo semántico del Kanban.** Alta = coral (lead caliente, contactar ya), Media = amarillo,
  Baja = morado, Sin calificar = neutro. Es el mismo código de color de la marca, donde el coral
  marca lo que requiere acción inmediata y el amarillo lo que solo requiere atención.
- **El morado nunca va como texto sobre negro.** `#2F0558` tiene contraste 1.20:1 contra `#0C0C0C`,
  así que se usa solo como relleno con texto blanco encima (16:1). Para texto y bordes se usa el
  tono derivado `grape-300` (`#A17BC7`, 5.75:1).
- **Sobre coral y amarillo el texto va en negro,** no en blanco: `#020202` sobre coral da 5.91:1
  mientras que el blanco da 3.45:1, y sobre amarillo la diferencia es 13.21:1 contra 1.54:1.
- **Todas las escalas se derivaron del hue del color corporativo** y se verificaron contra WCAG AA.
- El fondo se llama `night` y no `base` porque `text-base` ya existe en Tailwind como tamaño de
  fuente, y declarar un color `base` haría que esa clase aplicara color y tamaño a la vez.

## Estructura

```
index.html        UI: panel de métricas, formulario, tablero Kanban y asistente de contacto
js/storage.js     Storage Controller: CRUD sobre localStorage con esquema versionado
js/metrics.js     Métricas del embudo: funciones puras sobre la lista de leads
js/ui.js          Vista: iconos, estilos por prioridad, toasts, tarjetas y panel
js/gemini.js      Gemini API Service: los dos prompts, llamada HTTP y validación del JSON
js/app.js         Main App: orquesta eventos de la UI con storage, métricas y el servicio de IA
```

## Funcionalidades

### Lead scoring semántico

El núcleo del MVP: Gemini lee las notas de la interacción y devuelve un score de 1 a 100,
una prioridad y el argumento que la justifica. La tarjeta cambia de color y salta a la
columna correspondiente.

### Asistente de primer contacto

Equivalente al *AI email writer* de Pipedrive y al asistente de redacción de HubSpot, pero
apoyado en el score y en las notas que ya viven en el CRM. Sobre un lead ya calificado,
"Redactar contacto" abre un compositor donde se elige canal (WhatsApp o Email) y tono
(Cercano, Formal o Directo); Gemini escribe el mensaje citando una señal concreta de las
notas y explica qué gancho usó.

El prompt está restringido para que el mensaje sea usable de verdad: prohibido inventar
precios, fechas o becas que no estén en las notas; máximo 55 palabras en WhatsApp y 110 en
email; una sola pregunta de cierre; y el enfoque cambia según la prioridad, proponiendo una
llamada inmediata en Alta y bajando la presión en Baja.

El borrador es editable, se copia al portapapeles y queda guardado en el lead. Si después
se editan las notas, el mensaje se descarta: citaba un contexto que ya no es cierto.

### Panel de métricas del embudo

Equivalente a *Insights and reports*. Sobre el tablero se muestran cuatro indicadores
—prospectos, cobertura de IA, score promedio y cuántos esperan contacto—, la distribución
de la cartera por prioridad, y un acceso directo a los tres leads que conviene contactar
ahora: los de mayor score que todavía no tienen mensaje redactado, desempatados por
antigüedad, porque un lead que lleva días esperando se enfría. El cálculo vive en
`js/metrics.js` como funciones puras, sin DOM.

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
6. Sobre un lead calificado, presiona **Redactar contacto**, elige canal y tono, y genera el
   mensaje. Cámbiale el tono y vuelve a generar para ver cómo se ajusta.
7. Mira el panel superior: la cobertura de IA y la fila **Contactar ahora** se actualizan a
   medida que calificas y redactas.

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
  "mensaje": null,
  "mensajeAsunto": null,
  "mensajeCanal": null,
  "mensajeTono": null,
  "mensajeGancho": null,
  "mensajeEn": null,
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

- **Cadena de modelos:** `gemini-3.5-flash` → `gemini-3.1-flash-lite` → `gemini-flash-latest`.
  El primero da mejor calidad; el segundo es más liviano y suele seguir disponible cuando el
  flagship devuelve 503; el tercero es un alias de respaldo si el catálogo cambia.
  `gemini-1.5-flash` está dado de baja y devuelve 404.
- **Reintentos:** ante errores transitorios (429, 5xx, timeout, red) se reintenta hasta 3 veces
  por modelo con backoff exponencial y jitter (~0,8 s, 1,6 s), y si el modelo sigue caído se pasa
  al siguiente de la cadena. Los errores de cliente (400, 403, JSON inválido) fallan de inmediato,
  sin reintentar. Se ajusta en `retryConfig`, dentro de `js/gemini.js`.
- **Autenticación:** la clave va en el header `x-goog-api-key`, no en la query string.
- **Coherencia:** la prioridad se deriva del `score` (≥75 Alta, ≥40 Media, resto Baja) para
  que el badge nunca contradiga la columna, aunque el modelo responda algo distinto.
- **Timeout:** 30 s vía `AbortController`.

## Errores manejados

| Situación | Mensaje al usuario |
| --- | --- |
| Falta API Key | Ingresa tu API Key de Gemini arriba a la derecha. |
| Key inválida (401/403) | API Key inválida, expirada o sin permisos. |
| Cuota superada (429) | Se reintenta con backoff; si persiste, avisa de esperar un minuto. |
| Modelo sobrecargado (503) | Se reintenta y se cambia de modelo; si persiste, avisa de sobrecarga. |
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
