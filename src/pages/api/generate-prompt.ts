import type { APIRoute } from 'astro';
import { generateMasterPrompt, parseProvider } from '../../lib/llm';
import { getComponentHtml, getComponentMeta, savePromptRecord } from '../../lib/library';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  let body: any;
  try {
    body = await request.json();
  } catch {
    return jsonError('Cuerpo de petición inválido.', 400);
  }

  const slugs: unknown = body?.slugs;
  const context: string = typeof body?.context === 'string' ? body.context : '';
  const provider = parseProvider(body?.provider);

  if (!Array.isArray(slugs) || slugs.length === 0) {
    return jsonError('Selecciona al menos un componente.', 400);
  }

  const components: { name: string; description: string; libraries: string[]; html: string }[] = [];
  for (const slug of slugs) {
    if (typeof slug !== 'string') continue;
    const meta = await getComponentMeta(slug);
    const html = await getComponentHtml(slug);
    if (!meta || html === null) continue;
    components.push({ name: meta.name, description: meta.description, libraries: meta.libraries, html });
  }

  if (components.length === 0) {
    return jsonError('No se encontraron los componentes seleccionados.', 404);
  }

  let textStream: AsyncIterable<string>;
  try {
    textStream = await generateMasterPrompt({ provider, components, context });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error al generar el prompt.';
    return jsonError(message, 502);
  }

  const validSlugs = components.map((_, i) => slugs[i]).filter((s): s is string => typeof s === 'string');

  const encoder = new TextEncoder();
  let fullText = '';

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const chunk of textStream) {
          fullText += chunk;
          controller.enqueue(encoder.encode(chunk));
        }
        await savePromptRecord({ componentSlugs: validSlugs, context, content: fullText });
      } catch (err) {
        controller.error(err);
        return;
      }
      controller.close();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
};

function jsonError(message: string, status: number) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
