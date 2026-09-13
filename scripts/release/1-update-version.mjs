// Step 1 of 3 — change the version number, and nothing else.
//
//   npm run 1-update-version             asks: patch, minor or major
//   npm run 1-update-version -- minor    no question (patch, minor, major, or an exact X.Y.Z)
//
// Writes the number wherever an engine user reads it (npm, NuGet ×3, Unity, CMake), and in the three
// private task-runner package.json, then dates the "## Unreleased" section of CHANGELOG.md. Commits nothing, builds nothing, publishes nothing: the
// diff is read and committed by hand, then step 2 runs.

import {
  main, ask, stop, cancel, yes, closePrompt, git, uncommitted, tagCommit, today, indent,
  currentVersion, readVersions, writeVersion, changelogHas, readText, writeText, CHANGELOG,
} from './lib.mjs';

function bump(version, kind) {
  const [major, minor, patch] = version.split('.').map(Number);
  if (kind === 'patch') return `${major}.${minor}.${patch + 1}`;
  if (kind === 'minor') return `${major}.${minor + 1}.0`;
  if (kind === 'major') return `${major + 1}.0.0`;
  if (/^\d+\.\d+\.\d+$/.test(kind)) return kind;
  stop(`« ${kind} » : écris patch, minor, major, ou un numéro comme 2.1.0. Rien n'a été modifié.`);
}

main(async () => {
  const current = currentVersion();
  console.log('\nÉtape 1 sur 3 : changer le numéro de version');
  console.log(`\nVersion actuelle : ${current}`);

  const pending = uncommitted();
  if (pending) {
    stop(`Des changements ne sont pas commités :\n${indent(pending)}\n\n`
      + `Commite-les ou annule-les d'abord : le commit de version ne doit contenir que la version.`);
  }

  // What this guards against: a number already written but never released. Bumping it again skips a
  // version — 2.1.0 would never ship, and 2.2.0 would.
  if (!tagCommit(`v${current}`)) {
    console.log(`\n⚠ La ${current} n'a jamais été publiée : il n'y a pas de tag v${current}.`);
    console.log(`  Pour publier la ${current}, saute cette étape et lance 2-build-release.`);
    if (!yes(await ask('  Créer quand même une nouvelle version ? (o/N) '))) {
      cancel(`Rien n'a été modifié.`);
    }
  }

  let kind = process.argv[2];
  if (!kind) {
    console.log('');
    console.log(`  1) patch  → ${bump(current, 'patch')}   correction de bug`);
    console.log(`  2) minor  → ${bump(current, 'minor')}   nouvelle fonctionnalité`);
    console.log(`  3) major  → ${bump(current, 'major')}   rupture de compatibilité`);
    kind = { 1: 'patch', 2: 'minor', 3: 'major' }[await ask('\nTon choix (1, 2 ou 3) : ')];
    if (!kind) cancel(`Choix invalide. Rien n'a été modifié.`);
  }
  closePrompt();

  const version = bump(current, kind);
  if (tagCommit(`v${version}`)) {
    stop(`La ${version} est déjà publiée (tag v${version}). Rien n'a été modifié.`);
  }

  writeVersion(version);
  console.log(`\n✓ ${version} écrit dans :`);
  for (const file of new Set(readVersions().map((entry) => entry.file))) console.log(`    ${file}`);

  dateChangelog(version);

  console.log(`
Prochaines étapes :
  1. Relis ${CHANGELOG}, section v${version}.
  2. Commite ces fichiers, par exemple : release: v${version}
  3. Lance 2-build-release.
`);
});

// Notes are written by hand under "## Unreleased" while the work happens; this step only dates them.
// Commit subjects are the last resort, so that no release goes undocumented, and they are flagged:
// a commit subject never says "delay is in milliseconds now".
function dateChangelog(version) {
  const text = readText(CHANGELOG);
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const heading = `## v${version} (${today()})`;

  if (changelogHas(version)) {
    console.log(`\n✓ ${CHANGELOG} : la section v${version} existe déjà, laissée telle quelle.`);
    return;
  }

  const unreleased = text.search(/^## Unreleased/m);
  if (unreleased !== -1) {
    writeText(CHANGELOG, text.slice(0, unreleased) + text.slice(unreleased).replace(/^## Unreleased[^\r\n]*/, heading));
    console.log(`\n✓ ${CHANGELOG} : « ## Unreleased » devient « ${heading} ».`);
    if (sectionIsEmpty(text, unreleased)) {
      console.log('⚠ Cette section est vide : écris ce qui a changé avant de commiter.');
    }
    return;
  }

  const lastTag = git('describe', '--tags', '--abbrev=0');
  const subjects = git('log', '--no-merges', '--format=%s', ...(lastTag.ok ? [`${lastTag.out}..HEAD`] : []))
    .out.split(/\r?\n/).filter(Boolean);
  const notes = subjects.map((subject) => `- ${subject}`).join(eol) || '- (à écrire)';
  const entry = `${heading}${eol}${eol}${notes}${eol}${eol}`;
  const firstSection = text.search(/^## /m);
  writeText(CHANGELOG, firstSection === -1
    ? `${text.trimEnd()}${eol}${eol}${entry}`
    : text.slice(0, firstSection) + entry + text.slice(firstSection));
  console.log(`\n⚠ ${CHANGELOG} n'avait pas de section « ## Unreleased ».`);
  console.log(`  « ${heading} » a été ajoutée avec les messages de commit : réécris-la avant de commiter.`);
}

function sectionIsEmpty(text, start) {
  const lines = text.slice(start).split(/\r?\n/).slice(1);
  const end = lines.findIndex((line) => line.startsWith('## '));
  return lines.slice(0, end === -1 ? lines.length : end).join('').trim() === '';
}
