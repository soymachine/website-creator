import type { APIRoute } from 'astro';
import { fetchPageMaterial } from '../../lib/fetchPage';
import { extractComponentsFromHtml, parseProvider } from '../../lib/llm';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  let url: string | undefined;
  let focus = '';
  let provider = parseProvider(undefined);
  try {
    const body = await request.json();
    url = body?.url;
    focus = typeof body?.focus === 'string' ? body.focus.slice(0, 2000) : '';
    provider = parseProvider(body?.provider);
  } catch {
    return jsonError('Cuerpo de petición inválido.', 400);
  }

  if (!url || typeof url !== 'string') {
    return jsonError('Falta el campo "url".', 400);
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('protocol');
  } catch {
    return jsonError('URL inválida. Debe ser una URL http(s) completa.', 400);
  }

  try {
    const material = await fetchPageMaterial(parsed.toString());
    const components = await extractComponentsFromHtml(provider, parsed.toString(), material, focus);
    return new Response(JSON.stringify({ components }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error desconocido al analizar la URL.';
    return jsonError(message, 502);
  }
};

function jsonError(message: string, status: number) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
