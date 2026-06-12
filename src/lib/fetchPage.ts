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

const TECH_SIGNALS: { label: string; pattern: RegExp }[] = [
  { label: 'Three.js / WebGL', pattern: /three(\.module)?\.(min\.)?js|THREE\.|WebGLRenderer|@react-three|r3f/i },
  { label: 'WebGL crudo (sin librería)', pattern: /getContext\(\s*['"]webgl2?['"]/i },
  { label: 'Elemento <canvas>', pattern: /<canvas[\s>]/i },
  { label: 'GSAP', pattern: /gsap(\.min)?\.js|GSAP|ScrollTrigger|ScrollSmoother/i },
  { label: 'Lenis (smooth scroll)', pattern: /lenis/i },
  { label: 'Framer Motion', pattern: /framer-motion/i },
  { label: 'Pixi.js', pattern: /pixi(\.min)?\.js|PIXI\./i },
  { label: 'Lottie', pattern: /lottie/i },
  { label: 'Shaders (GLSL inline)', pattern: /void main\s*\(\s*\)\s*\{[\s\S]*gl_(Position|FragColor)/i },
  { label: 'Matter.js / física', pattern: /matter(\.min)?\.js|Matter\./i },
  { label: 'Splitting / SplitText (animación de texto)', pattern: /splittext|splitting\.js/i },
];

function detectTechSignals(blob: string): string[] {
  const found = new Set<string>();
  for (const { label, pattern } of TECH_SIGNALS) {
    if (pattern.test(blob)) found.add(label);
  }
  return [...found];
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

  // Surface library/asset filenames even if we don't fetch their full content —
  // these are often the strongest signal of WebGL/Three.js usage on heavily
  // bundled sites where the inline HTML reveals very little.
  const allScriptSrcs: string[] = [];
  const allScriptRe = /<script[^>]+src=["']([^"']+)["'][^>]*>/gi;
  while ((match = allScriptRe.exec(html))) {
    allScriptSrcs.push(match[1]);
  }

  let techBlob = html + '\n' + allScriptSrcs.join('\n');

  for (const assetUrl of assetUrls) {
    try {
      const assetRes = await fetchWithTimeout(assetUrl);
      if (!assetRes.ok) continue;
      const text = await assetRes.text();
      parts.push(`--- ASSET (${assetUrl}) ---\n${text.slice(0, MAX_ASSET_CHARS)}`);
      techBlob += '\n' + text.slice(0, MAX_ASSET_CHARS);
    } catch {
      // Ignore assets we can't fetch; the HTML alone is usually enough signal.
    }
  }

  const signals = detectTechSignals(techBlob);
  const canvasCount = (html.match(/<canvas[\s>]/gi) ?? []).length;

  const signalsBlock =
    signals.length > 0
      ? `--- SEÑALES TÉCNICAS DETECTADAS ---\n` +
        signals.map((s) => `- ${s}`).join('\n') +
        (canvasCount > 0 ? `\n- Elementos <canvas> encontrados: ${canvasCount}` : '') +
        `\n\nIMPORTANTE: estas señales indican tecnologías usadas en la página aunque el HTML/JS visible esté minificado o sea ilegible. NO ignores estas señales: si detectas Three.js, WebGL, Pixi.js o shaders, DEBES incluir al menos un componente que recree esa pieza (escena 3D, fondo con shaders, partículas, etc.) usando la librería correspondiente vía CDN, aunque sea una reinterpretación simplificada del efecto.`
      : '';

  if (signalsBlock) parts.unshift(signalsBlock);

  return parts.join('\n\n');
}
