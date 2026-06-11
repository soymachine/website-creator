import type { APIRoute } from 'astro';
import { fetchPageMaterial } from '../../lib/fetchPage';
import { extractComponentsFromHtml } from '../../lib/anthropic';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  let url: string | undefined;
  try {
    const body = await request.json();
    url = body?.url;
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
    const components = await extractComponentsFromHtml(parsed.toString(), material);
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
