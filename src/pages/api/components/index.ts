import type { APIRoute } from 'astro';
import { listComponents, saveComponent } from '../../../lib/library';

export const prerender = false;

export const GET: APIRoute = async () => {
  const components = await listComponents();
  return new Response(JSON.stringify({ components }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};

export const POST: APIRoute = async ({ request }) => {
  let body: any;
  try {
    body = await request.json();
  } catch {
    return jsonError('Cuerpo de petición inválido.', 400);
  }

  const { name, description, tags, libraries, sourceUrl, html } = body ?? {};

  if (!name || typeof name !== 'string') return jsonError('Falta "name".', 400);
  if (!html || typeof html !== 'string') return jsonError('Falta "html".', 400);

  const meta = await saveComponent({
    name,
    description: typeof description === 'string' ? description : '',
    tags: Array.isArray(tags) ? tags.filter((t) => typeof t === 'string') : [],
    libraries: Array.isArray(libraries) ? libraries.filter((l) => typeof l === 'string') : [],
    sourceUrl: typeof sourceUrl === 'string' ? sourceUrl : '',
    html,
  });

  return new Response(JSON.stringify({ component: meta }), {
    status: 201,
    headers: { 'Content-Type': 'application/json' },
  });
};

function jsonError(message: string, status: number) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
