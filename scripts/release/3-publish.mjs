// Step 3 of 3 — publish what step 2 built. Every check runs BEFORE anything is sent.
//
//   npm run 3-publish
//   npm run 3-publish -- --dry-run     the checks and the plan, then stops without sending anything
//
// Sends release/vX.Y.Z/ to npm and to NuGet, then tags vX.Y.Z and pushes the branch and the tag. The
// tag comes after both registries accepted the packages, so no tag claims a release that failed.
//
// Safe to run again after a failure: what npm already has is skipped, NuGet skips its duplicates, and
// a tag already on this commit is kept.
//
// Credentials: npm reads ~/.npmrc (`npm login`); NuGet reads NUGET_API_KEY, or ~/.lsde-nuget-key.

import { existsSync, readFileSync, readdirSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import {
  main, ask, stop, cancel, yes, closePrompt, run, exec, git, uncommitted, head, tagCommit, rel,
  releaseDir, currentVersion, readText, ROOT, NPM_MANIFEST, CSPROJS,
} from './lib.mjs';

const NUGET_SOURCE = 'https://api.nuget.org/v3/index.json';
const RETRY = 'Corrige la cause, puis relance 3-publish : ce qui est déjà envoyé sera sauté.';

function nugetKey() {
  if (process.env.NUGET_API_KEY) return process.env.NUGET_API_KEY.trim();
  const file = join(homedir(), '.lsde-nuget-key');
  return existsSync(file) ? readFileSync(file, 'utf-8').trim() : '';
}

main(async () => {
  const version = currentVersion();
  const tag = `v${version}`;
  const out = releaseDir(version);
  const npmName = JSON.parse(readText(NPM_MANIFEST)).name;
  const tarball = `${npmName.replace('@', '').replace('/', '-')}-${version}.tgz`;
  const nugetIds = CSPROJS.map((file) => readText(file).match(/<PackageId>([^<]*)<\/PackageId>/)[1]);
  const nupkgs = nugetIds.map((id) => `${id}.${version}.nupkg`);
  const branch = git('rev-parse', '--abbrev-ref', 'HEAD').out;

  console.log(`\nÉtape 3 sur 3 : publier la ${version}`);
  console.log(`\nVérifications, avant d'envoyer quoi que ce soit :`);

  let problems = 0;
  const check = (ok, good, bad) => {
    console.log(ok ? `  ✓ ${good}` : `  ✗ ${bad}`);
    if (!ok) problems++;
  };

  const infoFile = join(out, 'build-info.json');
  const info = existsSync(infoFile) ? JSON.parse(readFileSync(infoFile, 'utf-8')) : null;
  const built = existsSync(out) ? readdirSync(out) : [];
  check(info, `build trouvé dans ${rel(out)}/`, `aucun build de la ${version} → lance 2-build-release`);
  check([tarball, ...nupkgs].every((file) => built.includes(file)),
    `${tarball} et les 3 paquets NuGet sont là`,
    `il manque des paquets dans ${rel(out)}/ → relance 2-build-release`);
  check(!uncommitted(), 'tout est commité', 'des changements ne sont pas commités → commite, puis relance 2-build-release');
  check(info && !info.dirty && info.commit === head(),
    'le build vient du dernier commit',
    'le build ne vient pas du dernier commit → relance 2-build-release');

  const fetched = git('fetch', '--quiet', 'origin');
  const behind = git('rev-list', '--count', 'HEAD..@{u}');
  check(fetched.ok && behind.ok && behind.out === '0',
    `${branch} est à jour avec GitHub`,
    `${branch} n'est pas à jour avec GitHub, ou GitHub ne répond pas → fais un pull, puis relance 2-build-release`);

  const tagged = tagCommit(tag);
  check(!tagged || tagged === head(),
    tagged ? `le tag ${tag} est déjà sur ce commit` : `le tag ${tag} n'existe pas encore`,
    `le tag ${tag} est sur un autre commit : la ${version} est déjà publiée`);

  const npmUser = exec('npm', ['whoami'], { capture: true });
  check(npmUser.ok, `connecté à npm (${npmUser.out.trim()})`, 'pas connecté à npm → tape npm login dans un terminal, puis relance 3-publish');

  const key = nugetKey();
  check(key, 'clé NuGet trouvée', 'clé NuGet introuvable → mets-la dans le fichier ~/.lsde-nuget-key');

  if (problems) stop(`Rien n'a été envoyé. Corrige les points ✗, puis relance 3-publish.`);

  console.log(`
Ce qui va être envoyé :
    npm     ${npmName}@${version}
    NuGet   ${nugetIds.join(', ')} ${version}
    GitHub  la branche ${branch} et le tag ${tag}
`);
  if (process.argv.includes('--dry-run')) cancel(`--dry-run : rien n'a été envoyé.`);
  if (!yes(await ask(`Publier la ${version} ? (o/N) `))) cancel(`Rien n'a été envoyé.`);
  closePrompt();

  console.log('\n── 1/4 · npm ──');
  const onNpm = exec('npm', ['view', `${npmName}@${version}`, 'version'], { capture: true });
  if (onNpm.ok && onNpm.out.trim() === version) {
    console.log(`  ${npmName}@${version} est déjà sur npm : on passe.`);
  } else if (onNpm.err.includes('E404')) {
    console.log(`  npm peut te demander de t'authentifier (un code, ou le navigateur).`);
    run('npm', ['publish', join(out, tarball), '--access', 'public'], {
      cwd: join(ROOT, 'lsde-ts'),
      shown: `npm publish ${tarball} --access public`,
      hint: RETRY,
    });
  } else {
    stop(`Impossible de savoir si npm a déjà la ${version} :\n${onNpm.err}\n  ${RETRY}`);
  }

  console.log('\n── 2/4 · NuGet ──');
  for (const file of nupkgs) {
    run('dotnet', ['nuget', 'push', join(out, file), '--api-key', key, '--source', NUGET_SOURCE, '--skip-duplicate'], {
      shown: `dotnet nuget push ${file} --api-key *** --skip-duplicate`,
      hint: RETRY,
    });
  }

  console.log(`\n── 3/4 · tag ${tag} ──`);
  if (tagCommit(tag)) console.log(`  ${tag} est déjà sur ce commit : on le garde.`);
  else run('git', ['tag', tag], { hint: RETRY });

  console.log('\n── 4/4 · GitHub ──');
  run('git', ['push', 'origin', branch], { hint: RETRY });
  run('git', ['push', 'origin', tag], { hint: RETRY });

  console.log(`
✓ La ${version} est publiée.
    npm     https://www.npmjs.com/package/${npmName}
    NuGet   https://www.nuget.org/packages/${nugetIds[0]}  (quelques minutes avant d'apparaître)
    GitHub  tag ${tag} ; la doc en ligne se reconstruit toute seule
`);
});
