import { createHash, randomBytes } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { minify } from 'terser';
import { buildProgramProject } from './build-program-project.mjs';
import { buildPageInstallPackage } from './build-page-install-package.mjs';
import { validatePageInstallPackage } from '../src/scripting/user-scripts/page-install-package.js';

const marker = 'data-opendesk-coexistence-test-delay';
const delayMs = 2000;
const programId = 'opendesk.ai-scroll-navigation';
const hash = value => createHash('sha256').update(value).digest('hex');

// Runs only in the generated package. The existing managed owner is enrolled,
// but no navigation controls or listeners have been installed yet.
export async function waitForCoexistenceDelay(owner, token, attribute, duration) {
  if (window !== window.top || window.location.origin !== 'https://chatgpt.com') return null;
  const root = document.documentElement;
  if (root.getAttribute(attribute) !== token) return null;
  root.removeAttribute(attribute);
  const expected = window.location.href;
  const timeOrigin = performance.timeOrigin, startedMs = performance.now();
  const elapsed = await new Promise(resolve => {
    const stop = owner.onDispose(() => resolve(false));
    owner.setTimeout(() => { stop(); resolve(true); }, duration);
  });
  if (!elapsed || !owner.active() || window.location.href !== expected || document.documentElement !== root) {
    throw new Error('Coexistence fixture document or managed owner retired');
  }
  return { timeOrigin, startedMs, endedMs: performance.now(), token };
}

function armCoexistenceDocument(token, attribute) {
  if (window !== window.top || location.origin !== 'https://chatgpt.com') return;
  const set = () => {
    if (!document.documentElement) return false;
    document.documentElement.setAttribute(attribute, token);
    return true;
  };
  if (!set()) {
    const observer = new MutationObserver(() => { if (set()) observer.disconnect(); });
    observer.observe(document, { childList: true });
  }
}

async function main() {
  const [revisionArg, projectPath, basePackagePath, ...extra] = process.argv.slice(2);
  const revision = Number(revisionArg);
  if (!/^[1-9]\d*$/.test(revisionArg ?? '') || !Number.isSafeInteger(revision) || !projectPath || !basePackagePath || extra.length) {
    throw new Error('Usage: node scripts/build-chatgpt-coexistence-slow-candidate.mjs <unused-nav-revision> <frozen-project-dir> <base-page-package>');
  }
  const repo = fileURLToPath(new URL('../', import.meta.url));
  const owner = resolve(projectPath);
  const baseBytes = await readFile(resolve(basePackagePath));
  const basePackage = await validatePageInstallPackage(JSON.parse(baseBytes));
  if (basePackage.programId !== programId || revision <= basePackage.revision) throw new Error('Use a fresh navigation revision');
  const token = randomBytes(16).toString('hex');
  const stage = await mkdtemp(join(tmpdir(), 'opendesk-coexistence-nav-'));
  try {
    await cp(join(owner, 'src'), join(stage, 'src'), { recursive: true });
    const project = JSON.parse(await readFile(join(owner, 'package.json'), 'utf8'));
    if (project.opendesk?.id !== programId || project.opendesk.entry !== 'src/main.js' || project.version !== basePackage.version) {
      throw new Error('The project must match the navigation base package identity');
    }
    const baseVersion = /^(\d+\.\d+\.\d+)(?:[-+].*)?$/.exec(project.version)?.[1];
    if (!baseVersion) throw new Error('Unexpected navigation version');
    const draftAt = async directory => {
      const { outputDirectory } = await buildProgramProject(stage, { mode: 'production', outputDirectory: join(stage, directory) });
      return JSON.parse(await readFile(join(outputDirectory, 'program.opendesk-draft.json'), 'utf8'));
    };
    await writeFile(join(stage, 'package.json'), JSON.stringify(project));
    const baseDraft = await draftAt('base');
    if (baseDraft.sourceUtf8 !== basePackage.sourceUtf8) {
      throw new Error('Frozen navigation project does not reproduce the base package source');
    }
    project.version = baseVersion + '-coexistence-test.' + revision;
    await writeFile(join(stage, 'package.json'), JSON.stringify(project));
    const entry = join(stage, 'src/main.js');
    const source = await readFile(entry, 'utf8');
    const preMount = '  try {\n    const site=siteForUrl';
    const result = "return {programId:PROGRAM_ID,status:'active',runtime:'USER_SCRIPT',site:site||'awaiting-conversation'};";
    if ([preMount, result].some(anchor => source.split(anchor).length !== 2)) throw new Error('Navigation entry changed: review experiment anchors');
    const args = [token, marker, delayMs].map(value => JSON.stringify(value)).join(', ');
    const trigger = 'document.documentElement.getAttribute(' + JSON.stringify(marker) + ') === ' + JSON.stringify(token);
    const wait = '    const coexistenceDelay = ' + trigger + ' ? await waitForCoexistenceDelay(owner, ' + args + ') : null;\n';
    const patched = source.replace(preMount, '  try {\n' + wait + '    const site=siteForUrl')
      .replace(result, result.replace("site:site||'awaiting-conversation'", "site:site||'awaiting-conversation',...(coexistenceDelay&&{coexistenceDelay})"));
    // The verified base can already be near the authoring limit. Remove
    // whitespace and comments from the test entry; keep names and behavior.
    const compact = await minify(patched + '\n' + waitForCoexistenceDelay.toString() + '\n', {
      module: true, compress: false, mangle: false, format: { comments: false },
    });
    if (!compact.code) throw new Error('Could not format the slow test entry');
    await writeFile(entry, compact.code);
    const pkg = await buildPageInstallPackage(await draftAt('build'), { revision, title: 'AI 对话滚动导航（共存测试）' });
    if (pkg.entryFormat !== basePackage.entryFormat || JSON.stringify(pkg.pageRules) !== JSON.stringify(basePackage.pageRules)) {
      throw new Error('The slow fixture must preserve the base execution format and page scope');
    }
    const root = join(repo, 'artifacts/chatgpt-extension-coexistence');
    await mkdir(root, { recursive: true });
    const out = await mkdtemp(join(root, 'slow-candidate-r' + revision + '-'));
    const packageFile = join(out, 'navigation-coexistence-test.opendesk-page.json');
    const bytes = JSON.stringify(pkg, null, 2) + '\n';
    await writeFile(packageFile, bytes);
    await writeFile(join(out, 'fixture.json'), JSON.stringify({
      testOnly: true, sourceVersion: baseVersion, entrySourceSha256: hash(source),
      base: { version: basePackage.version, revision: basePackage.revision,
        sourceSha256: basePackage.sourceHash, packageSha256: hash(baseBytes) },
      version: pkg.version, revision: pkg.revision, sourceSha256: pkg.sourceHash, packageSha256: hash(bytes),
      trigger: '(' + armCoexistenceDocument.toString() + ')(' + JSON.stringify(token) + ',' + JSON.stringify(marker) + ')',
      delayMs, token,
    }, null, 2) + '\n');
    console.log(JSON.stringify({ packageFile, fixture: join(out, 'fixture.json'), version: pkg.version, revision, installed: false }));
  } finally {
    await rm(stage, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
