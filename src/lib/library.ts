import { mkdir, readFile, writeFile, readdir, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import type { ComponentMeta, PromptRecord } from '../types';

const ROOT = process.cwd();
const LIBRARY_DIR = path.join(ROOT, 'library');
const COMPONENTS_DIR = path.join(LIBRARY_DIR, 'components');
const PROMPTS_DIR = path.join(LIBRARY_DIR, 'prompts');
const INDEX_FILE = path.join(LIBRARY_DIR, 'index.json');

async function ensureDirs() {
  await mkdir(COMPONENTS_DIR, { recursive: true });
  await mkdir(PROMPTS_DIR, { recursive: true });
}

export async function listComponents(): Promise<ComponentMeta[]> {
  await ensureDirs();
  if (!existsSync(INDEX_FILE)) return [];
  const raw = await readFile(INDEX_FILE, 'utf-8');
  try {
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

async function writeIndex(items: ComponentMeta[]) {
  await ensureDirs();
  await writeFile(INDEX_FILE, JSON.stringify(items, null, 2), 'utf-8');
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

export async function saveComponent(input: {
  name: string;
  description: string;
  tags: string[];
  libraries: string[];
  sourceUrl: string;
  html: string;
}): Promise<ComponentMeta> {
  await ensureDirs();
  const items = await listComponents();

  let baseSlug = slugify(input.name) || 'component';
  let slug = baseSlug;
  let counter = 2;
  const existingSlugs = new Set(items.map((c) => c.slug));
  while (existingSlugs.has(slug)) {
    slug = `${baseSlug}-${counter}`;
    counter++;
  }

  await writeFile(path.join(COMPONENTS_DIR, `${slug}.html`), input.html, 'utf-8');

  const meta: ComponentMeta = {
    slug,
    name: input.name,
    description: input.description,
    tags: input.tags,
    libraries: input.libraries,
    sourceUrl: input.sourceUrl,
    createdAt: new Date().toISOString(),
  };

  items.push(meta);
  await writeIndex(items);
  return meta;
}

export async function getComponentHtml(slug: string): Promise<string | null> {
  const file = path.join(COMPONENTS_DIR, `${slug}.html`);
  if (!existsSync(file)) return null;
  return readFile(file, 'utf-8');
}

export async function getComponentMeta(slug: string): Promise<ComponentMeta | null> {
  const items = await listComponents();
  return items.find((c) => c.slug === slug) ?? null;
}

export async function deleteComponent(slug: string): Promise<boolean> {
  const items = await listComponents();
  const idx = items.findIndex((c) => c.slug === slug);
  if (idx === -1) return false;

  items.splice(idx, 1);
  await writeIndex(items);

  const file = path.join(COMPONENTS_DIR, `${slug}.html`);
  if (existsSync(file)) await unlink(file);
  return true;
}

export async function savePromptRecord(input: {
  componentSlugs: string[];
  context: string;
  content: string;
}): Promise<PromptRecord> {
  await ensureDirs();
  const createdAt = new Date().toISOString();
  const filename = `${createdAt.replace(/[:.]/g, '-')}.md`;

  const fileContent = [
    `# Prompt generado — ${createdAt}`,
    '',
    `**Componentes:** ${input.componentSlugs.join(', ')}`,
    '',
    `**Contexto:**`,
    '',
    input.context || '_(sin contexto adicional)_',
    '',
    '---',
    '',
    input.content,
    '',
  ].join('\n');

  await writeFile(path.join(PROMPTS_DIR, filename), fileContent, 'utf-8');

  return {
    filename,
    createdAt,
    componentSlugs: input.componentSlugs,
    context: input.context,
    content: input.content,
  };
}

export async function listPromptRecords(): Promise<PromptRecord[]> {
  await ensureDirs();
  const files = (await readdir(PROMPTS_DIR)).filter((f: string) => f.endsWith('.md'));
  const records: PromptRecord[] = [];

  for (const filename of files.sort().reverse()) {
    const raw = await readFile(path.join(PROMPTS_DIR, filename), 'utf-8');
    const componentMatch = raw.match(/\*\*Componentes:\*\* (.+)/);
    const dateMatch = raw.match(/^# Prompt generado — (.+)$/m);
    const bodyMatch = raw.split('\n---\n\n')[1] ?? raw;

    records.push({
      filename,
      createdAt: dateMatch ? dateMatch[1] : filename.replace('.md', ''),
      componentSlugs: componentMatch ? componentMatch[1].split(',').map((s: string) => s.trim()) : [],
      context: '',
      content: bodyMatch.trim(),
    });
  }

  return records;
}
