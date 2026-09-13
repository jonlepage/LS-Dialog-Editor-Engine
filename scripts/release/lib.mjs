// Shared by the three release steps: 1-update-version, 2-build-release, 3-publish.
//
// Each step does ONE thing, says what it is about to do, and stops. They replaced
// lsde-ts/scripts/publish.sh (2026-09-12), which bumped, published and committed from a single click:
// stopped halfway through the 2.1.0 release, it left eight modified files nobody had asked for, and
// clicked again it would have released 2.2.0 instead. MIGRATION-V2.md holds the decision.
//
// The messages are in French, for the person who releases the engine.

import { spawnSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
import { createInterface } from 'readline';
import { join, dirname, relative } from 'path';
import { fileURLToPath } from 'url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

// ─── Where the version lives ─────────────────────────────────────────────────

// Every number an engine USER reads: npm, the three NuGet packages, the Unity Package Manager, CMake.
// GDScript has no manifest of its own.
export const NPM_MANIFEST = 'lsde-ts/package.json';
export const NPM_LOCK = 'lsde-ts/package-lock.json';
export const CSPROJS = [
  'lsde-csharp/Runtime/LsdeDialogEngine.csproj',
  'lsde-csharp/Runtime/Newtonsoft/LsdeDialogEngine.Newtonsoft.csproj',
  'lsde-csharp/src~/LsdeDialogEngine.SystemTextJson/LsdeDialogEngine.SystemTextJson.csproj',
];
export const UPM_MANIFEST = 'lsde-csharp/package.json';
export const CMAKE = 'lsde-cpp/CMakeLists.txt';
// The private task runners. Never published, but npm prints their version in front of every script
// it runs: "ls-dialog-editor-engine@2.0.0 3-publish" over the 2.1.0 release, "0.1.0" over the C++
// build — both read like a mistake.
export const TASK_RUNNERS = ['package.json', 'lsde-cpp/package.json', 'lsde-gdscript/package.json'];
export const CHANGELOG = 'CHANGELOG.md';

const CSPROJ_VERSION = /(<Version>)([^<]*)(<\/Version>)/g;
const CMAKE_VERSION = /(project\(lsde-dialog-engine VERSION )([0-9.]+)/g;
const JSON_VERSION = /("version"\s*:\s*")([^"]*)(")/;

export const readText = (file) => readFileSync(join(ROOT, file), 'utf-8');
export const writeText = (file, text) => writeFileSync(join(ROOT, file), text);

export function currentVersion() {
  return JSON.parse(readText(NPM_MANIFEST)).version;
}

/** Every version number of the repo, with the file it was read from. */
export function readVersions() {
  const lock = JSON.parse(readText(NPM_LOCK));
  return [
    { file: NPM_MANIFEST, version: currentVersion() },
    { file: NPM_LOCK, version: lock.version },
    { file: NPM_LOCK, where: 'packages[""]', version: lock.packages?.['']?.version },
    ...CSPROJS.map((file) => ({ file, version: single(readText(file), CSPROJ_VERSION) })),
    { file: UPM_MANIFEST, version: JSON.parse(readText(UPM_MANIFEST)).version },
    { file: CMAKE, version: single(readText(CMAKE), CMAKE_VERSION) },
    ...TASK_RUNNERS.map((file) => ({ file, version: JSON.parse(readText(file)).version })),
  ];
}

// The one version a pattern finds, or why there is not exactly one. A replacement that matched
// nothing is silent, and that is how a number gets left behind.
function single(text, pattern) {
  const found = [...text.matchAll(pattern)];
  if (found.length === 1) return found[0][2];
  return found.length === 0 ? '(introuvable)' : `(${found.length} fois)`;
}

/** Writes `version` everywhere readVersions() looks, then reads it back. */
export function writeVersion(version) {
  // npm updates the manifest AND its lock; a text replacement would have to guess at the lock.
  const npm = exec('npm', ['version', version, '--no-git-tag-version', '--allow-same-version'], {
    cwd: join(ROOT, 'lsde-ts'),
    capture: true,
  });
  if (!npm.ok) stop(`npm version a échoué :\n${npm.err}`);

  const keepAround = (_all, open, _old, close) => open + version + close;
  for (const file of CSPROJS) {
    writeText(file, readText(file).replace(CSPROJ_VERSION, keepAround));
  }
  for (const file of [UPM_MANIFEST, ...TASK_RUNNERS]) {
    writeText(file, readText(file).replace(JSON_VERSION, keepAround));
  }
  writeText(CMAKE, readText(CMAKE).replace(CMAKE_VERSION, (_all, head) => head + version));

  const behind = readVersions().filter((entry) => entry.version !== version);
  if (behind.length) {
    stop(`Ces fichiers n'ont pas pris la ${version} :\n${describeVersions(behind)}`);
  }
}

export function describeVersions(entries) {
  return entries.map(({ file, where, version }) => `    ${file}${where ? ` ${where}` : ''} : ${version}`).join('\n');
}

/** True when CHANGELOG.md has a `## vX.Y.Z` heading. */
export function changelogHas(version) {
  const escaped = version.replace(/\./g, '\\.');
  return new RegExp(`^## v${escaped}(\\s|$)`, 'm').test(readText(CHANGELOG));
}

/** Where step 2 puts the packages and step 3 takes them from. Ignored by git. */
export const releaseDir = (version) => join(ROOT, 'release', `v${version}`);

/** A path the way the terminal shows it: from the repo root, forward slashes. */
export const rel = (path) => relative(ROOT, path).replace(/\\/g, '/');

export const indent = (text) => text.split(/\r?\n/).map((line) => `    ${line}`).join('\n');

/** Today, local time, the way CHANGELOG.md writes it: 2026-09-12. */
export function today() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

// ─── Commands ────────────────────────────────────────────────────────────────

/**
 * Runs a command; `capture` returns its output instead of showing it.
 *
 * npm is a .cmd on Windows, and Node starts those only through a shell. git and dotnet are real
 * executables and run without one, so `git log --format=%s` never meets cmd.exe.
 */
export function exec(command, args, { cwd = ROOT, capture = false } = {}) {
  const options = { cwd, encoding: 'utf-8', stdio: capture ? ['inherit', 'pipe', 'pipe'] : 'inherit' };
  const result = command === 'npm' && process.platform === 'win32'
    ? spawnSync([command, ...args.map(quote)].join(' '), { ...options, shell: true })
    : spawnSync(command, args, options);
  return {
    ok: result.status === 0,
    out: (result.stdout ?? '').trimEnd(),
    err: `${result.stderr ?? ''}${result.error ? result.error.message : ''}`.trim(),
  };
}

const quote = (arg) => (/[\s"&|<>^%!]/.test(arg) ? `"${arg}"` : arg);

/**
 * Shows a command, runs it in the open, and ends the step if it fails. `shown` is what gets printed —
 * it keeps a secret off the screen — and `hint` says what to do after a failure.
 */
export function run(command, args, { cwd = ROOT, shown = [command, ...args].join(' '), hint = '' } = {}) {
  const from = rel(cwd);
  console.log(`\n  ${from ? `${from}> ` : ''}${shown}`);
  if (!exec(command, args, { cwd }).ok) stop(`Échec de : ${shown}${hint ? `\n  ${hint}` : ''}`);
}

export const git = (...args) => exec('git', args, { capture: true });

/** `git status --porcelain`: empty when everything is committed. */
export const uncommitted = () => git('status', '--porcelain').out;

export const head = () => git('rev-parse', 'HEAD').out;

/** The commit a tag points at, or '' when there is no such tag. */
export function tagCommit(tag) {
  const found = git('rev-list', '-n', '1', `refs/tags/${tag}`);
  return found.ok ? found.out : '';
}

// ─── Flow ────────────────────────────────────────────────────────────────────

class Stop extends Error {
  constructor(message, failed) {
    super(message);
    this.failed = failed;
  }
}

/** Ends the step on a problem: its message, exit code 1, nothing after it runs. */
export function stop(message) {
  throw new Stop(message, true);
}

/** Ends the step on purpose — the answer was no. Exit code 0. */
export function cancel(message) {
  throw new Stop(message, false);
}

export const yes = (answer) => /^(o|oui|y|yes)$/i.test(answer);

// Lines are queued as they arrive: when answers are piped in, they come in one chunk, and a question
// asked a moment later would otherwise find its line already gone.
let prompt = null;
let inputEnded = false;
let waiting = null;
const answers = [];

function openPrompt() {
  prompt = createInterface({ input: process.stdin, output: process.stdout });
  prompt.on('line', (line) => {
    if (!waiting) return void answers.push(line.trim());
    const resolve = waiting;
    waiting = null;
    resolve(line.trim());
  });
  prompt.on('close', () => {
    prompt = null;
    inputEnded = true;
    waiting?.('');
    waiting = null;
  });
}

/** Asks one question in the terminal. An input that has ended answers ''. */
export function ask(question) {
  if (!prompt && !inputEnded) openPrompt();
  if (prompt) {
    prompt.setPrompt(question);
    prompt.prompt();
  } else {
    process.stdout.write(question);
  }
  if (answers.length) return Promise.resolve(answers.shift());
  if (inputEnded) return Promise.resolve('');
  return new Promise((resolve) => {
    waiting = resolve;
  });
}

/**
 * Lets go of the terminal. Called before any command that may ask something itself — npm publish can
 * want a one-time code — so that no keystroke lands in the wrong program.
 */
export function closePrompt() {
  if (!prompt) return;
  prompt.removeAllListeners('close');
  prompt.close();
  prompt = null;
}

/** Runs a step. A stop or a cancel prints its message; anything else is a bug and shows its stack. */
export async function main(step) {
  try {
    await step();
  } catch (error) {
    if (!(error instanceof Stop)) throw error;
    console.log(`\n${error.failed ? '✗ ' : ''}${error.message}\n`);
    process.exitCode = error.failed ? 1 : 0;
  } finally {
    closePrompt();
  }
}
