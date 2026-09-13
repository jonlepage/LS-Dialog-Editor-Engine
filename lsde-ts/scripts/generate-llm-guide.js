// Concatenates all guide + api-ref markdown files into plain text files for LLMs.
// Output: docs/public/llm-full-guide.txt      (English)
//         docs/public/llm-full-guide-ja.txt   (Japanese)
//         docs/public/llm-full-guide-zh.txt   (Chinese)
//         docs/public/llm-full-guide-fr.txt   (French)
//         docs/public/llm-full-api.txt        (English only — auto-generated from code)

import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const docsDir = join(__dirname, '..', 'docs');
const outDir = join(docsDir, 'public');
mkdirSync(outDir, { recursive: true });

// The byte-order mark, written as a code so it stays visible here.
const BOM = String.fromCharCode(0xfeff);
const separator = '\n\n' + '='.repeat(80) + '\n\n';

function cleanMarkdown(content) {
  return content
    .replace(/^---[\s\S]*?---\n*/, '')           // frontmatter
    .replace(/^::: code-group\s*$/gm, '')         // code-group open
    .replace(/^::: tip.*$/gm, '> TIP:')           // tips
    .replace(/^::: warning.*$/gm, '> WARNING:')   // warnings
    .replace(/^::: info.*$/gm, '> INFO:')         // info
    .replace(/^::: danger.*$/gm, '> DANGER:')     // danger
    .replace(/^:::\s*$/gm, '');                    // closing :::
}

// ─── Includes ────────────────────────────────────────────────────────────────

/**
 * Expand VitePress `<!--@include: path-->` directives, relative to the file that holds them.
 *
 * The guide pages keep their code samples in `_shared/*.md` and pull them in this way. The directive
 * belongs to VitePress, so a plain concatenation copied it through verbatim: every sample of the guide
 * was missing from the text an AI integrator reads, replaced by twenty-three comments it could not
 * follow.
 *
 * Line ranges and regions (`file.md{3,10}`, `file.md#region`) are VitePress features these docs do not
 * use. They are refused rather than guessed at: including the wrong span would be worse than failing.
 */
const INCLUDE = /<!--\s*@include:\s*(.+?)\s*-->/g;

function expandIncludes(content, fromDir, trail = []) {
  return content.replace(INCLUDE, (_directive, target) => {
    if (/[{#]/.test(target)) {
      throw new Error(`Unsupported @include form "${target}" — only a plain path is expanded.`);
    }
    const path = resolve(fromDir, target);
    if (!existsSync(path)) {
      throw new Error(`@include target not found: ${path}`);
    }
    if (trail.includes(path)) {
      throw new Error(`@include cycle: ${[...trail, path].join(' -> ')}`);
    }
    return expandIncludes(readFileSync(path, 'utf-8'), dirname(path), [...trail, path]).trim();
  });
}

// ─── Guide (all locales) ─────────────────────────────────────────────────────

// Every page of the guide sidebar, in its order (docs/.vitepress/config.ts), so the text reads like
// the site. Lifecycle, async tracks, router, parsing and character distribution used to be left out:
// how a scene ends, what a join or a router does, was invisible to an AI integrator.
const guideFiles = [
  'what-is-lsde.md',
  'getting-started.md',
  'blueprints.md',
  'block-types.md',
  'router.md',
  'character-distribution.md',
  'handlers.md',
  'integration.md',
  'parsing.md',
  'lifecycle.md',
  'choice-visibility.md',
  'async-tracks.md',
];

const locales = [
  { prefix: '',    suffix: '',    label: 'English' },
  { prefix: 'ja',  suffix: '-ja', label: 'Japanese' },
  { prefix: 'zh',  suffix: '-zh', label: 'Chinese' },
  { prefix: 'fr',  suffix: '-fr', label: 'French' },
];

for (const locale of locales) {
  const guideDir = locale.prefix
    ? join(docsDir, locale.prefix, 'guide')
    : join(docsDir, 'guide');

  if (!existsSync(guideDir)) {
    console.log(`Skipped: llm-full-guide${locale.suffix}.txt (${guideDir} not found)`);
    continue;
  }

  let guide = `LSDE Dialog Engine — Full Guide [${locale.label}] (plain text, auto-generated)
${'='.repeat(60)}
Concatenates all guide sections for LLM consumption.
Source: lsde-ts/docs/${locale.prefix ? locale.prefix + '/' : ''}guide/*.md
${'='.repeat(60)}\n\n`;

  for (const file of guideFiles) {
    const filePath = join(guideDir, file);
    if (!existsSync(filePath)) {
      console.log(`Missing: ${filePath} — left out of llm-full-guide${locale.suffix}.txt`);
      continue;
    }
    const content = expandIncludes(readFileSync(filePath, 'utf-8'), guideDir);
    guide += cleanMarkdown(content).trim() + separator;
  }

  const outFile = `llm-full-guide${locale.suffix}.txt`;
  writeFileSync(join(outDir, outFile), BOM + guide.trim() + '\n');
  console.log(`Generated: ${outFile} (${Math.round(guide.length / 1024)}KB)`);
}

// ─── API Reference (English only) ───────────────────────────────────────────

const apiDir = join(docsDir, 'api-ref');
const apiSubdirs = ['classes', 'interfaces', 'type-aliases'];

let api = `LSDE Dialog Engine — Full API Reference (plain text, auto-generated)
${'='.repeat(60)}
Concatenates all TypeDoc-generated API documentation for LLM consumption.
Source: lsde-ts/docs/api-ref/**/*.md
${'='.repeat(60)}\n\n`;

// Index page first
const indexContent = readFileSync(join(apiDir, 'index.md'), 'utf-8');
api += cleanMarkdown(indexContent).trim() + separator;

// Then each subdirectory
for (const subdir of apiSubdirs) {
  const dir = join(apiDir, subdir);
  const files = readdirSync(dir).filter(f => f.endsWith('.md')).sort();
  for (const file of files) {
    const content = readFileSync(join(dir, file), 'utf-8');
    api += cleanMarkdown(content).trim() + separator;
  }
}

writeFileSync(join(outDir, 'llm-full-api.txt'), BOM + api.trim() + '\n');
console.log(`Generated: llm-full-api.txt (${Math.round(api.length / 1024)}KB)`);
