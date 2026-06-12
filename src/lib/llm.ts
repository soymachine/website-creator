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

const EXTRACT_SYSTEM_PROMPT = `Eres un experto en frontend, animaciones web (GSAP, Framer Motion, Three.js, WebGL, scroll-driven animations) y diseño de webs premiadas en Awwwards.

Recibirás el HTML (y posiblemente fragmentos de CSS/JS referenciados, además de una lista de "señales técnicas detectadas") de una página web. Tu tarea es identificar los componentes visuales e interactivos más distintivos de esa página: heroes animados, menús con transiciones, cursores personalizados, reveals al hacer scroll, escenas 3D/WebGL, fondos con shaders o partículas, carruseles, marquees infinitos, efectos de parallax, etc.

Para CADA componente que identifiques, debes generar una RECREACIÓN AUTOCONTENIDA: un único documento HTML completo (con <!DOCTYPE html>, <head> y <body>) que incluya todo el CSS (en <style>) y JS (en <script>) necesario, y que demuestre visualmente el comportamiento del componente al abrirse en un navegador, sin ningún paso de build.

Reglas importantes:
- NO copies literalmente el código fuente de la web (probablemente esté minificado, ofuscado o sea inviable). En su lugar, REINTERPRETA el efecto visual de forma fiel y funcional, recreándolo con HTML/CSS/JS limpio y legible.
- Si el componente usa una librería (GSAP, Three.js, anime.js, Pixi.js, etc.), puedes cargarla mediante <script src="https://cdn..."> mediante un CDN público (cdnjs o unpkg).
- Cada snippet debe ser visualmente atractivo y centrado en demostrar SOLO ese componente (puedes incluir un fondo oscuro neutro y algo de contenido de ejemplo).
- Identifica entre 1 y 4 componentes, priorizando los más distintivos e interesantes visualmente.
- Para "tags" usa palabras clave en minúsculas relevantes (ej: "hero", "scroll-reveal", "cursor", "marquee", "carousel", "navigation", "parallax", "3d", "text-animation", "webgl", "shader").
- Para "libraries" indica las librerías usadas en tu recreación (ej: "GSAP", "Three.js", "Pixi.js", "CSS", "anime.js"). Usa "CSS" si es solo CSS/JS vanilla.

## Componentes 3D / WebGL / shaders

Si en el material recibido detectas señales de Three.js, WebGL crudo, Pixi.js, shaders GLSL o elementos <canvas>, NO los descartes ni los sustituyas por un componente más simple. Trátalos como prioritarios:
- Recrea la escena con Three.js cargado vía CDN (ej. unpkg.com/three@0.160.0/build/three.min.js), montando un <canvas> a pantalla completa.
- Usa primitivas razonables (geometrías, partículas, gradientes animados, distorsión con shaders simples en ShaderMaterial) que evoquen el mismo "mood" visual aunque no repliquen el shader exacto original.
- Incluye un bucle de animación (requestAnimationFrame) para que la escena se vea viva nada más cargar, sin depender de interacción del usuario.
- Maneja el evento resize de window para que el canvas/renderer se ajuste al iframe.

## Componentes con interactividad basada en el ratón (cursores, magnetismo, parallax, tilt 3D, etc.)

Estos componentes se van a previsualizar dentro de un <iframe> en miniatura, donde es fácil que nadie mueva el ratón sobre ellos. Por eso, CADA componente cuyo efecto dependa de mousemove, hover u otra interacción del puntero DEBE cumplir ambas cosas:
1. Seguir respondiendo a eventos reales del ratón/touch del usuario (no los elimines).
2. Incluir además un "modo demo" automático: al cargar, simula con requestAnimationFrame un puntero virtual que se mueve en un patrón (p.ej. un círculo o figura en forma de ocho) durante unos segundos, alimentando la misma lógica que usarías con mousemove, para que el efecto sea visible sin que nadie tenga que mover el ratón. Si el usuario interactúa de verdad con el ratón, el modo demo debe pausarse y ceder el control a la interacción real (puedes reanudarlo tras unos segundos de inactividad).

Esto aplica también a cualquier otro efecto que normalmente requiera interacción (hover en botones, scroll, drag): siempre que sea razonable, añade una animación o ciclo automático que demuestre el comportamiento nada más abrir el snippet.`;

const EXTRACT_JSON_INSTRUCTIONS = `Responde EXCLUSIVAMENTE con un objeto JSON válido (sin markdown ni texto adicional) con esta estructura exacta:
{
  "components": [
    {
      "name": "Nombre corto y descriptivo",
      "description": "Descripción de 1-3 frases del comportamiento visual",
      "tags": ["tag1", "tag2"],
      "libraries": ["GSAP"],
      "html": "<!DOCTYPE html>... documento HTML completo y autocontenido ..."
    }
  ]
}`;

const EXTRACT_TOOL: Anthropic.Tool = {
  name: 'report_components',
  description: 'Reporta los componentes visuales identificados y sus recreaciones autocontenidas en HTML.',
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
              description: 'Etiquetas en minúsculas para filtrar este componente',
            },
            libraries: {
              type: 'array',
              items: { type: 'string' },
              description: 'Librerías usadas en la recreación',
            },
            html: {
              type: 'string',
              description:
                'Documento HTML completo y autocontenido que recrea el componente. Si depende de WebGL/Three.js o de la posición del ratón, debe incluir un bucle de animación/demo automático visible sin interacción.',
            },
          },
          required: ['name', 'description', 'tags', 'libraries', 'html'],
        },
      },
    },
    required: ['components'],
  },
};

function sanitizeComponents(input: unknown): ExtractedComponent[] {
  if (!input || typeof input !== 'object') return [];
  const components = (input as { components?: unknown }).components;
  if (!Array.isArray(components)) return [];

  return components
    .filter(
      (c): c is ExtractedComponent =>
        !!c &&
        typeof c === 'object' &&
        typeof (c as any).name === 'string' &&
        typeof (c as any).html === 'string'
    )
    .map((c) => ({
      name: c.name,
      description: typeof c.description === 'string' ? c.description : '',
      tags: Array.isArray(c.tags) ? c.tags.filter((t: unknown) => typeof t === 'string') : [],
      libraries: Array.isArray(c.libraries)
        ? c.libraries.filter((l: unknown) => typeof l === 'string')
        : [],
      html: c.html,
    }));
}

export async function extractComponentsFromHtml(
  provider: ProviderId,
  sourceUrl: string,
  pageMaterial: string
): Promise<ExtractedComponent[]> {
  const userContent = `URL de origen: ${sourceUrl}\n\nMaterial extraído de la página (HTML/CSS/JS, puede estar truncado):\n\n${pageMaterial}`;

  if (provider === 'anthropic') {
    const { client, model } = getAnthropicClient();
    const response = await client.messages.create({
      model,
      max_tokens: 16000,
      system: EXTRACT_SYSTEM_PROMPT,
      tools: [EXTRACT_TOOL],
      tool_choice: { type: 'tool', name: 'report_components' },
      messages: [{ role: 'user', content: userContent }],
    });

    const toolUse = response.content.find(
      (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
    );
    if (!toolUse) throw new Error('El modelo no devolvió componentes estructurados.');
    return sanitizeComponents(toolUse.input);
  }

  const { client, model, maxOutputTokens } = getOpenAICompatClient(provider);
  const response = await client.chat.completions.create({
    model,
    max_tokens: maxOutputTokens,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: `${EXTRACT_SYSTEM_PROMPT}\n\n${EXTRACT_JSON_INSTRUCTIONS}` },
      { role: 'user', content: userContent },
    ],
  });

  const raw = response.choices[0]?.message?.content;
  if (!raw) throw new Error('El modelo no devolvió respuesta.');

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('El modelo devolvió un JSON inválido. Inténtalo de nuevo.');
  }
  return sanitizeComponents(parsed);
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
