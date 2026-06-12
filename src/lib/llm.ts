import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import type { ExtractedComponent } from '../types';

export type ProviderId = 'anthropic' | 'deepseek' | 'kimi';

export const PROVIDERS: { id: ProviderId; label: string }[] = [
  { id: 'anthropic', label: 'Claude (Anthropic)' },
  { id: 'deepseek', label: 'DeepSeek' },
  { id: 'kimi', label: 'Kimi (Moonshot)' },
];

function env(name: string): string | undefined {
  // Astro carga .env en import.meta.env (no en process.env) durante el dev
  // server, así que comprobamos ambos.
  return (import.meta.env as Record<string, string | undefined>)[name] || process.env[name];
}

interface OpenAICompatConfig {
  keyVar: string;
  baseURL: string;
  defaultModel: string;
  modelVar: string;
  maxOutputTokens: number;
}

const OPENAI_COMPAT: Record<Exclude<ProviderId, 'anthropic'>, OpenAICompatConfig> = {
  deepseek: {
    keyVar: 'DEEPSEEK_API_KEY',
    baseURL: 'https://api.deepseek.com/v1',
    defaultModel: 'deepseek-chat',
    modelVar: 'DEEPSEEK_MODEL',
    // deepseek-chat caps completions at 8K output tokens.
    maxOutputTokens: 8000,
  },
  kimi: {
    keyVar: 'KIMI_API_KEY',
    baseURL: 'https://api.moonshot.ai/v1',
    defaultModel: 'kimi-k2-0905-preview',
    modelVar: 'KIMI_MODEL',
    maxOutputTokens: 16000,
  },
};

export function parseProvider(value: unknown): ProviderId {
  if (value === 'deepseek' || value === 'kimi' || value === 'anthropic') return value;
  return 'anthropic';
}

function getAnthropicClient(): { client: Anthropic; model: string } {
  const apiKey = env('ANTHROPIC_API_KEY');
  if (!apiKey) {
    throw new Error('Falta ANTHROPIC_API_KEY. Configúrala en tu archivo .env (ver .env.example).');
  }
  return {
    client: new Anthropic({ apiKey }),
    model: env('ANTHROPIC_MODEL') || 'claude-sonnet-4-6',
  };
}

function getOpenAICompatClient(provider: Exclude<ProviderId, 'anthropic'>): {
  client: OpenAI;
  model: string;
  maxOutputTokens: number;
} {
  const config = OPENAI_COMPAT[provider];
  const apiKey = env(config.keyVar);
  if (!apiKey) {
    throw new Error(`Falta ${config.keyVar}. Configúrala en tu archivo .env (ver .env.example).`);
  }
  return {
    client: new OpenAI({ apiKey, baseURL: config.baseURL }),
    model: env(config.modelVar) || config.defaultModel,
    maxOutputTokens: config.maxOutputTokens,
  };
}

/**
 * Llamada genérica con salida estructurada: tool use en Anthropic, JSON mode
 * en proveedores OpenAI-compatible.
 */
async function callStructured(input: {
  provider: ProviderId;
  system: string;
  user: string;
  tool: Anthropic.Tool;
  jsonInstructions: string;
  anthropicMaxTokens: number;
}): Promise<unknown> {
  if (input.provider === 'anthropic') {
    const { client, model } = getAnthropicClient();
    const response = await client.messages.create({
      model,
      max_tokens: input.anthropicMaxTokens,
      system: input.system,
      tools: [input.tool],
      tool_choice: { type: 'tool', name: input.tool.name },
      messages: [{ role: 'user', content: input.user }],
    });
    const toolUse = response.content.find(
      (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
    );
    if (!toolUse) throw new Error('El modelo no devolvió una respuesta estructurada.');
    return toolUse.input;
  }

  const { client, model, maxOutputTokens } = getOpenAICompatClient(input.provider);
  const response = await client.chat.completions.create({
    model,
    max_tokens: maxOutputTokens,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: `${input.system}\n\n${input.jsonInstructions}` },
      { role: 'user', content: input.user },
    ],
  });
  const raw = response.choices[0]?.message?.content;
  if (!raw) throw new Error('El modelo no devolvió respuesta.');
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error('El modelo devolvió un JSON inválido. Inténtalo de nuevo.');
  }
}

// ---------------------------------------------------------------------------
// FASE 1 — Estudio a fondo de la página: el modelo actúa como ingeniero
// inverso y produce un plan detallado de componentes, sin generar HTML aún.
// ---------------------------------------------------------------------------

interface ComponentPlan {
  name: string;
  description: string;
  tags: string[];
  libraries: string[];
  technicalNotes: string;
}

const ANALYZE_SYSTEM_PROMPT = `Eres un ingeniero inverso experto en webs creativas premiadas en Awwwards: animaciones GSAP/ScrollTrigger, escenas Three.js/WebGL, shaders GLSL, smooth scroll (Lenis), cursores custom, transiciones de página, tipografía cinética.

Recibirás el material extraído de una página web (HTML, fragmentos de CSS/JS, lista de señales técnicas detectadas) y opcionalmente una indicación del usuario sobre qué le interesa de esa web. Tu trabajo en esta fase NO es generar código: es ESTUDIAR el material a fondo y producir un informe de los componentes visuales/interactivos más impactantes de la página.

Cómo estudiar el material (hazlo metódicamente, sección a sección):
1. Recorre TODO el HTML de arriba a abajo, incluyendo las secciones del final del documento: muchas de las piezas más espectaculares (galerías horizontales, escenas 3D, footers animados) viven en secciones que solo se ven tras hacer scroll. La posición en el DOM no indica importancia.
2. Busca evidencia indirecta de efectos que el HTML estático no muestra: elementos <canvas> y sus contenedores, atributos data-* (data-scroll, data-speed, data-cursor, data-webgl...), clases reveladoras (webgl, gl, three, shader, particle, distortion, split, marquee, pin, parallax...), strings GLSL (gl_FragColor, uniform, varying), nombres de archivos de bundles, comentarios.
3. Cruza esas pistas con las señales técnicas detectadas: si hay Three.js/WebGL/Pixi/shaders en las señales, DEBE haber al menos un componente del informe dedicado a esa pieza. Es un fallo grave omitir la parte 3D/WebGL de una web que la tiene: suele ser justo su componente más distintivo.
4. Deduce el comportamiento probable de cada efecto a partir de la evidencia: qué se anima, con qué se dispara (scroll, ratón, carga, hover), qué librería lo implementa, qué aspecto tiene (colores, materiales, densidad de partículas, tipo de distorsión).
5. Si el usuario ha indicado un interés concreto, dale prioridad absoluta: dedica los componentes del informe a lo que pide, estudiando con más detalle las partes del material relacionadas.

Para cada componente del informe escribe "technicalNotes" MUY detalladas (8-15 frases): son la especificación que otro desarrollador usará para recrearlo sin ver la web. Incluye: estructura DOM necesaria, librerías concretas con versión/CDN sugerido, paleta de colores y tipografía aproximadas, parámetros de animación (duraciones, easings, triggers de scroll), y para WebGL/shaders: tipo de geometría, comportamiento del material/shader (ondas, ruido, distorsión en hover, partículas que reaccionan al ratón...), movimiento de cámara y luces.

Identifica entre 2 y 5 componentes, ordenados de más a menos impactante. Prioriza siempre: (1) lo que pida el usuario, (2) escenas 3D/WebGL/shaders, (3) interacciones complejas de scroll o ratón, (4) lo demás. No incluyas componentes triviales (un botón con hover simple, un menú estático) salvo que el usuario los pida.`;

const ANALYZE_TOOL: Anthropic.Tool = {
  name: 'report_analysis',
  description: 'Reporta el plan detallado de componentes identificados tras estudiar la página.',
  input_schema: {
    type: 'object',
    properties: {
      components: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Nombre corto y descriptivo del componente' },
            description: {
              type: 'string',
              description: 'Descripción de 1-3 frases del comportamiento visual del componente',
            },
            tags: {
              type: 'array',
              items: { type: 'string' },
              description:
                'Etiquetas en minúsculas (ej: "hero", "scroll-reveal", "cursor", "webgl", "shader", "3d", "parallax", "text-animation")',
            },
            libraries: {
              type: 'array',
              items: { type: 'string' },
              description: 'Librerías para la recreación (ej: "Three.js", "GSAP", "CSS")',
            },
            technicalNotes: {
              type: 'string',
              description:
                'Especificación técnica muy detallada (8-15 frases) para recrear el componente: DOM, librerías+CDN, colores, tipografía, parámetros de animación, y detalles de shader/geometría/cámara si aplica.',
            },
          },
          required: ['name', 'description', 'tags', 'libraries', 'technicalNotes'],
        },
      },
    },
    required: ['components'],
  },
};

const ANALYZE_JSON_INSTRUCTIONS = `Responde EXCLUSIVAMENTE con un objeto JSON válido (sin markdown ni texto adicional):
{
  "components": [
    {
      "name": "...",
      "description": "...",
      "tags": ["..."],
      "libraries": ["..."],
      "technicalNotes": "Especificación técnica muy detallada (8-15 frases)..."
    }
  ]
}`;

function sanitizePlans(input: unknown): ComponentPlan[] {
  if (!input || typeof input !== 'object') return [];
  const components = (input as { components?: unknown }).components;
  if (!Array.isArray(components)) return [];
  return components
    .filter(
      (c): c is ComponentPlan =>
        !!c && typeof c === 'object' && typeof (c as any).name === 'string'
    )
    .map((c) => ({
      name: c.name,
      description: typeof c.description === 'string' ? c.description : '',
      tags: Array.isArray(c.tags) ? c.tags.filter((t: unknown) => typeof t === 'string') : [],
      libraries: Array.isArray(c.libraries)
        ? c.libraries.filter((l: unknown) => typeof l === 'string')
        : [],
      technicalNotes: typeof c.technicalNotes === 'string' ? c.technicalNotes : '',
    }));
}

// ---------------------------------------------------------------------------
// FASE 2 — Generación dedicada: una llamada por componente, con todo el
// presupuesto de salida para un único snippet de alta calidad.
// ---------------------------------------------------------------------------

const BUILD_SYSTEM_PROMPT = `Eres un desarrollador creativo de élite (nivel Awwwards) especializado en demos autocontenidas: GSAP, Three.js, shaders GLSL, animación de texto, scroll-driven animations.

Recibirás la especificación técnica de UN componente visual/interactivo observado en una web real. Tu trabajo: construir una RECREACIÓN AUTOCONTENIDA de máxima calidad — un único documento HTML completo (<!DOCTYPE html>, <head>, <body>) con todo el CSS en <style> y todo el JS en <script>, que funcione abierto directamente en un navegador sin build step.

Exigencias de calidad:
- El resultado debe ser visualmente IMPACTANTE, no un placeholder. Cuida la composición, paleta, tipografía (puedes cargar Google Fonts), spacing y detalles (grain, vignettes, blur, glow) igual que lo haría la web original.
- Sigue las notas técnicas de la especificación con fidelidad: librerías indicadas (cárgalas vía CDN público: cdnjs, unpkg o jsdelivr), parámetros de animación, colores.
- Código limpio y comentado en los puntos clave (configuración del shader, parámetros del timeline...), para que sirva como referencia reutilizable.

Si el componente es 3D/WebGL/shaders:
- Usa Three.js vía CDN (unpkg.com/three@0.160.0/build/three.min.js) u otra librería indicada en la especificación.
- Implementa shaders GLSL reales en ShaderMaterial cuando la especificación hable de distorsión, ruido, ondas u efectos de material: no lo simules con CSS.
- Bucle requestAnimationFrame siempre activo: la escena debe verse viva desde el primer segundo, sin interacción.
- Gestiona el resize de window para adaptarte al contenedor.

Si el efecto depende del ratón (cursor custom, magnetismo, parallax con mousemove, tilt, distorsión en hover):
- Mantén los listeners reales de ratón/touch.
- Añade ADEMÁS un modo demo automático: un puntero virtual animado con requestAnimationFrame (trayectoria suave, p.ej. curvas de Lissajous) que alimenta la misma lógica del mousemove desde la carga, se pausa cuando el usuario mueve el ratón de verdad, y se reanuda tras unos segundos de inactividad. El efecto debe ser plenamente visible en un iframe en miniatura sin que nadie toque nada.

Si el efecto depende del scroll (ScrollTrigger, reveals, pin, parallax):
- Incluye suficiente contenido para que haya recorrido de scroll y configura un auto-scroll suave de demostración (ida y vuelta en bucle) que se pause si el usuario hace scroll manual.

El snippet debe centrarse en demostrar SOLO este componente, con contenido de ejemplo coherente con la estética original.`;

const BUILD_TOOL: Anthropic.Tool = {
  name: 'report_component_html',
  description: 'Devuelve el documento HTML autocontenido que recrea el componente.',
  input_schema: {
    type: 'object',
    properties: {
      html: {
        type: 'string',
        description: 'Documento HTML completo y autocontenido.',
      },
    },
    required: ['html'],
  },
};

const BUILD_JSON_INSTRUCTIONS = `Responde EXCLUSIVAMENTE con un objeto JSON válido (sin markdown ni texto adicional):
{ "html": "<!DOCTYPE html>... documento completo ..." }`;

async function buildComponentHtml(
  provider: ProviderId,
  plan: ComponentPlan,
  sourceUrl: string,
  focus: string
): Promise<string | null> {
  const user = [
    `URL de la web original: ${sourceUrl}`,
    focus ? `Interés del usuario: ${focus}` : '',
    '',
    `## Componente a recrear: ${plan.name}`,
    '',
    `Descripción: ${plan.description}`,
    '',
    `Librerías previstas: ${plan.libraries.join(', ') || 'CSS/JS vanilla'}`,
    '',
    `Especificación técnica:`,
    plan.technicalNotes,
  ].join('\n');

  const result = await callStructured({
    provider,
    system: BUILD_SYSTEM_PROMPT,
    user,
    tool: BUILD_TOOL,
    jsonInstructions: BUILD_JSON_INSTRUCTIONS,
    anthropicMaxTokens: 16000,
  });

  const html = (result as { html?: unknown })?.html;
  return typeof html === 'string' && html.trim().length > 0 ? html : null;
}

// ---------------------------------------------------------------------------
// Pipeline completo de extracción
// ---------------------------------------------------------------------------

export async function extractComponentsFromHtml(
  provider: ProviderId,
  sourceUrl: string,
  pageMaterial: string,
  focus = ''
): Promise<ExtractedComponent[]> {
  // Fase 1: estudio a fondo → plan de componentes.
  const analysisUser = [
    `URL de origen: ${sourceUrl}`,
    focus
      ? `\nINTERÉS DEL USUARIO (prioridad absoluta al elegir y detallar componentes): ${focus}`
      : '',
    '',
    'Material extraído de la página (HTML/CSS/JS, puede estar truncado):',
    '',
    pageMaterial,
  ].join('\n');

  const analysis = await callStructured({
    provider,
    system: ANALYZE_SYSTEM_PROMPT,
    user: analysisUser,
    tool: ANALYZE_TOOL,
    jsonInstructions: ANALYZE_JSON_INSTRUCTIONS,
    anthropicMaxTokens: 8000,
  });

  const plans = sanitizePlans(analysis).slice(0, 5);
  if (plans.length === 0) return [];

  // Fase 2: generación dedicada por componente, en paralelo. Cada llamada
  // dispone del presupuesto completo de tokens de salida para un solo snippet.
  const results = await Promise.allSettled(
    plans.map((plan) => buildComponentHtml(provider, plan, sourceUrl, focus))
  );

  const components: ExtractedComponent[] = [];
  results.forEach((result, i) => {
    if (result.status === 'fulfilled' && result.value) {
      const plan = plans[i];
      components.push({
        name: plan.name,
        description: plan.description,
        tags: plan.tags,
        libraries: plan.libraries,
        html: result.value,
      });
    }
  });

  if (components.length === 0) {
    const firstError = results.find(
      (r): r is PromiseRejectedResult => r.status === 'rejected'
    );
    throw new Error(
      firstError?.reason instanceof Error
        ? `La generación de componentes falló: ${firstError.reason.message}`
        : 'La generación de componentes no produjo resultados. Inténtalo de nuevo.'
    );
  }

  return components;
}

const PROMPT_GENERATION_SYSTEM = `Eres un experto en redactar prompts de ingeniería para LLMs que desarrollan websites a partir de componentes visuales.

Recibirás uno o más snippets HTML autocontenidos (cada uno representa un componente visual/interactivo: hero, navegación, carrusel, etc.) junto con contexto adicional sobre el proyecto.

Tu tarea: redactar un PROMPT MAESTRO, detallado y bien estructurado en Markdown, que otro LLM podrá usar directamente para desarrollar un sitio web completo que integre todos esos componentes de forma cohesiva.

El prompt maestro debe incluir:
1. Una descripción general del proyecto (basada en el contexto proporcionado).
2. Para cada componente: su propósito, comportamiento visual/interactivo detallado, y las librerías necesarias (con CDNs si aplica).
3. Cómo combinar e integrar los componentes en una página/sitio cohesivo (estructura, orden, transiciones entre secciones).
4. Recomendaciones de stack técnico y buenas prácticas (responsive, accesibilidad, performance de animaciones).
5. Cualquier detalle de estilo (paleta, tipografía, tono) que se pueda inferir del contexto o de los propios snippets.

Escribe el prompt en español, listo para copiar y pegar. No incluyas explicaciones meta sobre lo que vas a hacer, ve directo al contenido del prompt.`;

export async function generateMasterPrompt(input: {
  provider: ProviderId;
  components: { name: string; description: string; libraries: string[]; html: string }[];
  context: string;
}): Promise<AsyncIterable<string>> {
  const componentsBlock = input.components
    .map(
      (c, i) =>
        `### Componente ${i + 1}: ${c.name}\n\n**Descripción:** ${c.description}\n\n**Librerías:** ${c.libraries.join(', ') || 'CSS'}\n\n**HTML:**\n\`\`\`html\n${c.html}\n\`\`\``
    )
    .join('\n\n');

  const userMessage = `Contexto del proyecto:\n${input.context || '(sin contexto adicional, infiere lo razonable a partir de los componentes)'}\n\nComponentes seleccionados:\n\n${componentsBlock}`;

  if (input.provider === 'anthropic') {
    const { client, model } = getAnthropicClient();
    const stream = client.messages.stream({
      model,
      max_tokens: 8000,
      system: PROMPT_GENERATION_SYSTEM,
      messages: [{ role: 'user', content: userMessage }],
    });

    async function* textIterator(): AsyncIterable<string> {
      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          yield event.delta.text;
        }
      }
    }
    return textIterator();
  }

  const { client, model, maxOutputTokens } = getOpenAICompatClient(input.provider);
  const stream = await client.chat.completions.create({
    model,
    max_tokens: maxOutputTokens,
    stream: true,
    messages: [
      { role: 'system', content: PROMPT_GENERATION_SYSTEM },
      { role: 'user', content: userMessage },
    ],
  });

  async function* openAITextIterator(): AsyncIterable<string> {
    for await (const chunk of stream) {
      const text = chunk.choices[0]?.delta?.content;
      if (text) yield text;
    }
  }
  return openAITextIterator();
}
