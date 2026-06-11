# Component Studio

Herramienta local para construir una biblioteca de componentes visuales
extraídos de webs reales (estilo Awwwards: GSAP, Framer Motion, Three.js...) y
generar, a partir de ellos, prompts maestros para que un LLM desarrolle un
website completo.

Es una **herramienta 100% local**: solo se ejecuta con `npm run dev`, no se
despliega.

## Setup

1. Instala dependencias:

   ```sh
   npm install
   ```

2. Copia `.env.example` a `.env` y añade tu clave de la API de Anthropic:

   ```sh
   cp .env.example .env
   ```

   ```env
   ANTHROPIC_API_KEY=sk-ant-...
   ```

3. Arranca el servidor de desarrollo:

   ```sh
   npm run dev
   ```

   Abre `http://localhost:4321`.

## Flujo de uso

1. **Extraer** (`/extract`): pega la URL de una web visualmente impactante.
   El servidor hace fetch del HTML (y algunos assets enlazados) y se lo envía
   a Claude, que identifica entre 1 y 4 componentes visuales/interactivos
   distintivos y genera, para cada uno, una recreación autocontenida en un
   único archivo HTML (CSS y JS embebidos, sin build step).

2. **Seleccionar y guardar**: cada componente encontrado se previsualiza en un
   `<iframe>` sandboxed. Marca los que quieras conservar y pulsa
   "Guardar seleccionados". Se escriben en:
   - `library/components/<slug>.html` — el snippet autocontenido.
   - `library/index.json` — metadata (nombre, descripción, tags, librerías,
     URL de origen).

3. **Dashboard** (`/`): galería de todos los componentes guardados, con
   preview en vivo, filtros por tag/librería y búsqueda por texto. Cada
   componente tiene una vista aislada en `/component/<slug>`.

4. **Generar prompt**: selecciona uno o varios componentes desde el
   dashboard, añade contexto adicional (tipo de web, contenido, tono) y pulsa
   "Generar". Claude redacta (en streaming) un prompt maestro en Markdown que
   describe cómo integrar esos componentes en un sitio cohesivo. El resultado
   se guarda en `library/prompts/<timestamp>.md` y queda accesible en
   `/prompts`.

## Estructura

```text
src/
├── lib/
│   ├── anthropic.ts   # Llamadas a la API de Claude (extracción + generación)
│   ├── fetchPage.ts   # Fetch acotado de HTML/CSS/JS de una URL
│   └── library.ts     # Lectura/escritura de library/ en el filesystem
├── components/
│   └── ComponentCard.astro
├── layouts/
│   └── Layout.astro
└── pages/
    ├── index.astro          # Dashboard
    ├── extract.astro        # Extracción desde URL
    ├── prompts.astro         # Historial de prompts
    ├── component/[slug].astro
    └── api/
        ├── extract.ts
        ├── generate-prompt.ts
        └── components/
            ├── index.ts
            └── [slug].ts

library/
├── index.json         # Metadata de componentes guardados
├── components/*.html  # Snippets autocontenidos
└── prompts/*.md        # Historial de prompts generados
```
