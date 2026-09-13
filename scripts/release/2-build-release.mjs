// Step 2 of 3 — test and build what will be published. Sends nothing anywhere.
//
//   npm run 2-build-release
//   npm run 2-build-release -- --allow-dirty    a trial build before committing; step 3 refuses it
//
// Refuses uncommitted changes: what gets published has to be a commit, so step 1 is committed first.
// Runs the suites of the four runtimes, then packs the npm package and the three NuGet packages into
// release/vX.Y.Z/, next to a build-info.json naming the commit they were built from.
//
// C++, GDScript and Unity have no package to build: their users take the sources at the tag that
// step 3 creates.

import { rmSync, mkdirSync, readdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import {
  main, stop, run, uncommitted, head, tagCommit, indent, rel, releaseDir, currentVersion,
  readVersions, describeVersions, changelogHas, ROOT, NPM_MANIFEST, CSPROJS, CHANGELOG,
} from './lib.mjs';

main(async () => {
  const version = currentVersion();
  const trial = process.argv.includes('--allow-dirty');
  console.log(`\nÉtape 2 sur 3 : tester et fabriquer la ${version}`);

  const mismatched = readVersions().filter((entry) => entry.version !== version);
  if (mismatched.length) {
    stop(`${NPM_MANIFEST} dit ${version}, mais :\n${describeVersions(mismatched)}\n\nRelance l'étape 1.`);
  }
  if (!changelogHas(version)) {
    stop(`${CHANGELOG} n'a pas de section « ## v${version} ». Relance l'étape 1.`);
  }
  const commit = head();
  const tagged = tagCommit(`v${version}`);
  if (tagged && tagged !== commit) {
    stop(`La ${version} est déjà publiée (le tag v${version} est sur un autre commit). Lance l'étape 1.`);
  }
  const pending = uncommitted();
  if (pending && !trial) {
    stop(`Des changements ne sont pas commités :\n${indent(pending)}\n\n`
      + `Commite d'abord : on publie un commit, pas des fichiers en cours.`);
  }
  if (pending) console.log(`\n⚠ --allow-dirty : build d'essai, l'étape 3 refusera de le publier.`);

  const out = releaseDir(version);
  const inDir = (dir) => ({ cwd: join(ROOT, dir) });
  const steps = [
    ['TypeScript : vérification des types', () => run('npm', ['run', 'lint'], inDir('lsde-ts'))],
    ['TypeScript : tests', () => run('npm', ['test'], inDir('lsde-ts'))],
    ['C# : tests', () => run('dotnet', ['test', '--nologo'], inDir('lsde-csharp'))],
    ['C++ : compilation et tests', () => {
      run('npm', ['run', 'rebuild'], inDir('lsde-cpp'));
      run('npm', ['test'], inDir('lsde-cpp'));
    }],
    ['GDScript : tests', () => run('npm', ['test'], inDir('lsde-gdscript'))],
    ['Paquet npm', () => {
      run('npm', ['run', 'build'], inDir('lsde-ts'));
      run('npm', ['pack', '--pack-destination', out], { ...inDir('lsde-ts'), shown: `npm pack --pack-destination ${rel(out)}` });
    }],
    ['Paquets NuGet', () => {
      for (const csproj of CSPROJS) {
        run('dotnet', ['pack', join(ROOT, csproj), '-c', 'Release', '-o', out, '--nologo'], {
          shown: `dotnet pack ${csproj} -c Release -o ${rel(out)}`,
        });
      }
    }],
  ];

  // Emptied first: a build that fails its tests must not leave an older, publishable one behind.
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  steps.forEach(([title, action], index) => {
    console.log(`\n── ${index + 1}/${steps.length} · ${title} ──`);
    action();
  });

  const files = readdirSync(out).sort();
  const info = { version, commit, dirty: Boolean(pending), builtAt: new Date().toISOString(), files };
  writeFileSync(join(out, 'build-info.json'), `${JSON.stringify(info, null, 2)}\n`);

  console.log(`\n✓ La ${version} est testée et fabriquée, dans ${rel(out)}/ :`);
  for (const file of files) console.log(`    ${file}`);
  console.log('\nProchaine étape : lance 3-publish.\n');
});
