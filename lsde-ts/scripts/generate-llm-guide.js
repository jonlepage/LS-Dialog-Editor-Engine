// Concatenates all guide + api-ref markdown files into plain text files for LLMs.
// Output: docs/public/llm-full-guide.txt + docs/public/llm-full-api.txt

import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const docsDir = join(__dirname, '..', 'docs');
const outDir = join(docsDir, 'public');
mkdirSync(outDir, { recursive: true });

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

// ─── Guide ───────────────────────────────────────────────────────────────────

const guideFiles = [
  'what-is-lsde.md',
  'getting-started.md',
  'blueprints.md',
  'block-types.md',
  'choice-visibility.md',
  'handlers.md',
  'integration.md',
];

let guide = `LSDE Dialog Engine — Full Guide (plain text, auto-generated)
${'='.repeat(60)}
Concatenates all guide sections for LLM consumption.
Source: lsde-ts/docs/guide/*.md
${'='.repeat(60)}\n\n`;

for (const file of guideFiles) {
  const content = readFileSync(join(docsDir, 'guide', file), 'utf-8');
  guide += cleanMarkdown(content).trim() + separator;
}

writeFileSync(join(outDir, 'llm-full-guide.txt'), guide.trim() + '\n');
console.log(`Generated: llm-full-guide.txt (${Math.round(guide.length / 1024)}KB)`);

// ─── API Reference ───────────────────────────────────────────────────────────

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

writeFileSync(join(outDir, 'llm-full-api.txt'), api.trim() + '\n');
console.log(`Generated: llm-full-api.txt (${Math.round(api.length / 1024)}KB)`);
