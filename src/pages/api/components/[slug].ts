import type { APIRoute } from 'astro';
import { deleteComponent } from '../../../lib/library';

export const prerender = false;

export const DELETE: APIRoute = async ({ params }) => {
  const slug = params.slug;
  if (!slug) {
    return new Response(JSON.stringify({ error: 'Falta "slug".' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const deleted = await deleteComponent(slug);
  if (!deleted) {
    return new Response(JSON.stringify({ error: 'Componente no encontrado.' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
