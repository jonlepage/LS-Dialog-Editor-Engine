// Concatenates all guide + api-ref markdown files into plain text files for LLMs.
// Output: docs/public/llm-full-guide.txt      (English)
//         docs/public/llm-full-guide-ja.txt   (Japanese)
//         docs/public/llm-full-guide-zh.txt   (Chinese)
//         docs/public/llm-full-guide-fr.txt   (French)
//         docs/public/llm-full-api.txt        (English only — auto-generated from code)

import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const docsDir = join(__dirname, '..', 'docs');
const outDir = join(docsDir, 'public');
mkdirSync(outDir, { recursive: true });

const BOM = '\uFEFF';
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

// ─── Guide (all locales) ─────────────────────────────────────────────────────

const guideFiles = [
  'what-is-lsde.md',
  'getting-started.md',
  'blueprints.md',
  'block-types.md',
  'choice-visibility.md',
  'handlers.md',
  'integration.md',
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
    if (!existsSync(filePath)) continue;
    const content = readFileSync(filePath, 'utf-8');
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
