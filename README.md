# EduLead AI — CRM Estático con Lead Scoring Inteligente

**EduLead AI** es una Single Page Application (SPA) estática en JavaScript Vanilla diseñada para optimizar la conversión de ventas en bootcamps y academias. El sistema permite registrar prospectos (leads) y calificarlos semánticamente utilizando la API REST de **Google Gemini** para clasificarlos automáticamente en un tablero Kanban según su intención de compra.

Proyecto desarrollado para el bootcamp por **José Tomás Díaz** y **Claudio Valenzuela**. Evaluado por **Felipe Cuevas**.

---

## 🚀 Características Principales

- **Tablero Kanban Dinámico:** Organiza los prospectos en 4 columnas (*Sin calificar*, *Prioridad Baja*, *Prioridad Media*, *Prioridad Alta*) con esquemas de color optimizados para la lectura (`PRIORITY_STYLES`).
- **Lead Scoring Semántico (IA):** Analiza el contexto, presupuesto y urgencia expresados en las notas de interacción usando el modelo `gemini-1.5-flash` y devuelve una evaluación estructurada en JSON (`score` de 1 a 100, `probabilidad` y `argumento`).
- **Persistencia Local con Seeding:** Persistencia en `localStorage` que incluye datos iniciales de prueba (*mock data*) para visualización inmediata en la primera carga.
- **CRUD Completo & Re-evaluación:** Permite Crear, Leer, Editar y Eliminar leads. Si se modifican las notas de un lead ya calificado, el sistema reactiva el análisis para permitir una re-evaluación.
- **Zero Build Tools:** Construido 100% con HTML5, TailwindCSS (CDN) y módulos ES6 de JavaScript nativos. Funciona sin dependencias de Node.js, npm ni empaquetadores como Vite o Webpack.

---

## 🔒 Seguridad y Manejo de la API Key

> ⚠️ **ADVERTENCIA DE SEGURIDAD PARA LA EVALUACIÓN:**
> Esta aplicación corre 100% en el navegador del cliente (Frontend Estático). Por seguridad y para evitar la exposición de credenciales en repositorios públicos:
> 1. **NUNCA** se commitea una API Key de Gemini al código fuente o al repositorio.
> 2. La aplicación incluye una barra superior donde el evaluador debe ingresar su propia **Gemini API Key**.
> 3. La clave se guarda únicamente en el `sessionStorage` de la pestaña activa (se borra al cerrarla) y se envía directamente mediante peticiones HTTPS a la API REST de Google AI Studio.

---

## 🛠️ Arquitectura de Archivos

```text
edulead-ai/
├── index.html          # Interfaz principal SPA, formularios y estructura Kanban
├── css/
│   └── styles.css      # Ajustes de scrollbars, animación pulse y utilidades visuales
├── js/
│   ├── app.js          # Orquestador principal y delegación de eventos del DOM
│   ├── ui.js           # Plantillas HTML dinámicas, constantes de estilos e iconos SVG
│   ├── storage.js      # Capa de almacenamiento en LocalStorage (CRUD y Seeding)
│   └── gemini.js       # Servicio de integración HTTP con la REST API de Google Gemini
└── README.md           # Documentación técnica del proyecto
