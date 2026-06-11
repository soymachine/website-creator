const MAX_HTML_CHARS = 60000;
const MAX_ASSET_CHARS = 20000;
const MAX_ASSETS = 4;
const FETCH_TIMEOUT_MS = 15000;

async function fetchWithTimeout(url: string): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (compatible; ComponentStudio/1.0; +local-dev-tool)',
      },
    });
  } finally {
    clearTimeout(timeout);
  }
}

function resolveUrl(maybeRelative: string, base: string): string | null {
  try {
    return new URL(maybeRelative, base).toString();
  } catch {
    return null;
  }
}

/**
 * Fetches a page and assembles a bounded text blob with the HTML plus a
 * handful of linked stylesheets/scripts, for feeding to the LLM.
 */
export async function fetchPageMaterial(sourceUrl: string): Promise<string> {
  const res = await fetchWithTimeout(sourceUrl);
  if (!res.ok) {
    throw new Error(`No se pudo acceder a la URL (HTTP ${res.status})`);
  }
  const html = await res.text();

  const parts: string[] = [];
  parts.push(`--- HTML (${sourceUrl}) ---\n${html.slice(0, MAX_HTML_CHARS)}`);

  const assetUrls: string[] = [];

  const linkRe = /<link[^>]+rel=["']stylesheet["'][^>]*href=["']([^"']+)["'][^>]*>/gi;
  let match: RegExpExecArray | null;
  while ((match = linkRe.exec(html)) && assetUrls.length < MAX_ASSETS) {
    const resolved = resolveUrl(match[1], sourceUrl);
    if (resolved) assetUrls.push(resolved);
  }

  const scriptRe = /<script[^>]+src=["']([^"']+)["'][^>]*>/gi;
  while ((match = scriptRe.exec(html)) && assetUrls.length < MAX_ASSETS) {
    const resolved = resolveUrl(match[1], sourceUrl);
    if (resolved) assetUrls.push(resolved);
  }

  for (const assetUrl of assetUrls) {
    try {
      const assetRes = await fetchWithTimeout(assetUrl);
      if (!assetRes.ok) continue;
      const text = await assetRes.text();
      parts.push(`--- ASSET (${assetUrl}) ---\n${text.slice(0, MAX_ASSET_CHARS)}`);
    } catch {
      // Ignore assets we can't fetch; the HTML alone is usually enough signal.
    }
  }

  return parts.join('\n\n');
}
