#!/usr/bin/env node
"use strict";

// Offline artifact checks only. Parsing a script is not a Chrome load/CSP test.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const os = require("node:os");
const { execFileSync } = require("node:child_process");
const { createHash } = require("node:crypto");

const ROOT = path.resolve(__dirname, "..");
const ALLOWLIST = ["manifest.json", "background.js", "background-sw.js", "my-content-script.js", "dom.js", "icons", "assets", "www", "sdk-compatibility.json"];
const EXCLUDED = new Set([".git", "docs", "test", "tests", "demo", "scripts", ".DS_Store", ".sdk-backups"]);
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");

function safePath(root, relative) {
  const base = path.resolve(root);
  assert.equal(fs.realpathSync(base), base, "repository root or its parents must not be symlinks");
  const resolved = path.resolve(base, relative);
  assert.ok(resolved.startsWith(base + path.sep), `resource escapes repository: ${relative}`);
  let current = base;
  for (const part of path.relative(base, resolved).split(path.sep)) {
    current = path.join(current, part);
    assert.ok(!fs.lstatSync(current).isSymbolicLink(), `symlink forbidden: ${current}`);
  }
  return resolved;
}

function releaseFiles(root) {
  const files = [];
  function walk(relative) {
    const resolved = safePath(root, relative);
    if (relative.split(path.sep).some((part) => EXCLUDED.has(part))) return;
    const stat = fs.lstatSync(resolved);
    if (stat.isDirectory()) {
      fs.readdirSync(resolved).sort().forEach((name) => walk(path.join(relative, name)));
    } else {
      assert.ok(stat.isFile(), `special file forbidden: ${relative}`);
      assert.ok(!relative.includes("\n") && !relative.includes("\r"), `newline in release filename: ${relative}`);
      files.push(relative.split(path.sep).join("/"));
    }
  }
  ALLOWLIST.forEach(walk);
  return files.sort();
}

function inspectExtension(root = ROOT, options = {}) {
  const read = (name) => fs.readFileSync(safePath(root, name), "utf8");
  const errors = [];
  let files;
  try { files = releaseFiles(root); } catch (error) { errors.push(error.message); }
  const classicScripts = new Set();
  const manifest = JSON.parse(read("manifest.json"));
  const workerName = manifest.background?.service_worker;
  assert.equal(manifest.manifest_version, 3, "the checked entrypoint must be MV3");
  assert.equal(typeof workerName, "string", "missing service worker entrypoint");
  const worker = read(workerName);
  classicScripts.add(workerName);
  const importsMatch = worker.match(/const BACKGROUND_SCRIPTS\s*=\s*(\[[\s\S]*?\]);/);
  assert.ok(importsMatch, "BACKGROUND_SCRIPTS must be inspectable; update this check if its format changes");
  const workerImports = JSON.parse(importsMatch[1]);
  assert.ok(worker.includes("importScripts(...scriptUrls)"), "worker must consume the inspected import list");

  const refs = new Map();
  function own(name, owner) {
    try {
    assert.equal(typeof name, "string", `invalid resource owned by ${owner}`);
    assert.ok(!/^(?:[a-z]+:|\/\/)/i.test(name), `external resource: ${name}`);
    const resolved = safePath(root, name);
    assert.ok(fs.statSync(resolved).isFile(), `missing resource: ${name}`);
    const canonical = path.relative(root, resolved).split(path.sep).join("/");
    const owners = refs.get(canonical) || [];
    if (!owners.includes(owner)) owners.push(owner);
    refs.set(canonical, owners);
    return true;
    } catch (error) { errors.push(`${owner}: ${name}: ${error.message}`); return false; }
  }
  own("manifest.json", "extension");
  own(workerName, "manifest.background");
  workerImports.forEach((name) => { own(name, "worker.importScripts"); classicScripts.add(name); });
  for (const [index, content] of (manifest.content_scripts || []).entries()) {
    [...(content.js || []), ...(content.css || [])].forEach((name) => own(name, `manifest.content_scripts[${index}]`));
    (content.js || []).forEach((name) => classicScripts.add(name));
  }
  Object.values(manifest.icons || {}).forEach((name) => own(name, "manifest.icons"));
  for (const name of Object.values(manifest.action?.default_icon || {})) own(name, "manifest.action.default_icon");
  if (manifest.options_page) own(manifest.options_page, "manifest.options_page");
  if (manifest.action?.default_popup) own(manifest.action.default_popup, "manifest.action.default_popup");

  const popupName = "www/popup_crawl.html";
  own(popupName, "crawler popup");
  const htmlEntrypoints = [popupName, manifest.action?.default_popup];
  if (options.inspectOptionsDependencies !== false) htmlEntrypoints.push(manifest.options_page);
  for (const htmlName of new Set(htmlEntrypoints.filter(Boolean))) {
    const html = read(htmlName).replace(/<!--[\s\S]*?-->/g, "");
    for (const match of html.matchAll(/<(script|link|img)\b([^>]*?)\b(?:src|href)=["']([^"']+)["']([^>]*)>/gi)) {
      const target = match[3].split(/[?#]/)[0];
      assert.ok(target && !/^(?:[a-z]+:|\/\/)/i.test(target), `external or empty HTML resource: ${htmlName} ${match[3]}`);
      const name = path.posix.normalize(target.startsWith("/") ? target.slice(1) : path.posix.join(path.posix.dirname(htmlName), target));
      own(name, htmlName);
      if (match[1].toLowerCase() === "script" && !/\btype\s*=\s*["']module["']/i.test(match[2] + match[4])) classicScripts.add(name);
    }
  }

  const coreName = "assets/js/plugins/scrapyJs.js";
  const pageName = "assets/js/plugins/ChromePage.js";
  const coreIndex = workerImports.indexOf(coreName);
  const pageIndex = workerImports.indexOf(pageName);
  const backgroundIndex = workerImports.indexOf("background.js");
  assert.ok(pageIndex >= 0 && coreIndex > pageIndex && backgroundIndex > coreIndex,
    "worker must load ChromePage, current SDK, then background handlers");
  assert.deepEqual(refs.get(coreName), ["worker.importScripts"], "core loading ownership changed; inspect the new path");
  assert.ok(read("background.js").includes(popupName), "crawler popup must have a background launch reference");

  const receiptName = "assets/js/plugins/scrapyJs.source.json";
  const hasReceipt = own(receiptName, "SDK provenance receipt");
  own("sdk-compatibility.json", "SDK compatibility policy");
  let receipt;
  if (hasReceipt) try {
  receipt = JSON.parse(read(receiptName));
  const compatibility = JSON.parse(read("sdk-compatibility.json"));
  assert.equal(receipt.schemaVersion, 1, "unsupported SDK receipt schema");
  assert.equal(receipt.packageName, "scrapyjs", "wrong SDK package identity");
  assert.ok(receipt.inputs && typeof receipt.inputs === "object" && !Array.isArray(receipt.inputs) && Object.keys(receipt.inputs).length,
    "receipt must contain hashed source inputs");
  for (const [name, digest] of Object.entries(receipt.inputs)) {
    assert.ok(!path.isAbsolute(name) && !name.split(/[\\/]/).includes(".."), `invalid receipt source path: ${name}`);
    assert.match(digest, /^[a-f0-9]{64}$/, `invalid receipt source hash: ${name}`);
  }
  assert.equal(receipt.sourceHash, hash(Buffer.from(JSON.stringify(receipt.inputs, null, 2) + "\n")), "SDK receipt sourceHash differs from input hash map");
  assert.equal(receipt.sdkHash, hash(fs.readFileSync(safePath(root, coreName))), "installed SDK bytes differ from source receipt");
  assert.equal(compatibility.schemaVersion, 1, "unsupported SDK compatibility schema");
  assert.equal(receipt.protocolVersion, compatibility.protocolVersion, "SDK receipt/policy protocol mismatch");
  assert.ok(compatibility.coreVersions?.includes(receipt.packageVersion), "SDK package version is not approved by compatibility policy");
  } catch (error) { errors.push(`SDK receipt: ${error.message}`); }

  const resources = [...refs.entries()].map(([name, owners]) => {
    const bytes = fs.readFileSync(safePath(root, name));
    if (classicScripts.has(name)) try { new vm.Script(bytes.toString("utf8"), { filename: name }); }
    catch (error) { errors.push(`script syntax ${name}: ${error.message}`); }
    if (files && !files.includes(name)) errors.push(`referenced resource excluded from release allowlist: ${name}`);
    return { path: name, owners, sha256: hash(bytes) };
  });
  if (errors.length) {
    const error = new Error(errors.join("\n"));
    error.details = errors;
    throw error;
  }
  return {
    scope: "offline file existence, syntax and loading ownership; no browser execution",
    manifestVersion: manifest.manifest_version,
    worker: workerName,
    workerImports,
    resources,
    releaseFiles: files,
    sourceReceipt: { path: receiptName, sdkHash: receipt.sdkHash, sourceHash: receipt.sourceHash, packageVersion: receipt.packageVersion },
    gaps: [
      "Chrome API availability, CSP, permissions and actual injection were not exercised.",
      "Receipt hashes prove internal byte consistency, not a signed source origin or comparison with a separate source checkout.",
      "HTML entrypoints are inspected; dynamic imports, CSS url() and web-accessible glob expansion are not inspected.",
      "Module scripts are checked for existence, but only directly loaded classic scripts receive syntax checks.",
      ...(options.inspectOptionsDependencies === false ? ["Options page dependency traversal is excluded in this scoped check; the default checker and packer inspect it."] : [])
    ]
  };
}

function packExtension(output, root = ROOT) {
  assert.ok(path.isAbsolute(output) && path.extname(output).toLowerCase() === ".zip", "--pack requires an absolute .zip output path");
  const destination = path.resolve(output);
  assert.ok(!destination.startsWith(path.resolve(root) + path.sep), "pack output must be outside the repository");
  assert.ok(!fs.existsSync(destination), "pack output already exists; choose a new path");
  const parent = path.dirname(destination);
  assert.equal(fs.realpathSync(parent), parent, "output directory or its parents must not be symlinks");
  const report = inspectExtension(root);
  const stage = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "scrapyjs-extension-pack-"));
  const archive = path.join(stage, "candidate.zip");
  try {
    // Stage the verified bytes; reject source changes during the snapshot.
    const digests = new Map();
    for (const name of report.releaseFiles) {
      const bytes = fs.readFileSync(safePath(root, name));
      const digest = hash(bytes);
      const inspected = report.resources.find((item) => item.path === name);
      if (inspected) assert.equal(digest, inspected.sha256, `source changed after inspection: ${name}`);
      digests.set(name, digest);
      const target = path.join(stage, "extension", name);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, bytes, { flag: "wx" });
    }
    assert.deepEqual(releaseFiles(root), report.releaseFiles, "release file inventory changed while staging");
    for (const [name, digest] of digests) assert.equal(hash(fs.readFileSync(safePath(root, name))), digest, `source changed while staging: ${name}`);
    inspectExtension(path.join(stage, "extension"));
    execFileSync("zip", ["-q", "-X", archive, "-@"], {
      cwd: path.join(stage, "extension"), input: report.releaseFiles.join("\n") + "\n", timeout: 120000
    });
    execFileSync("unzip", ["-tqq", archive], { timeout: 120000 });
    const names = execFileSync("unzip", ["-Z1", archive], { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 }).trim().split("\n").sort();
    assert.deepEqual(names, report.releaseFiles, "archive entries differ from release allowlist");
    fs.copyFileSync(archive, destination, fs.constants.COPYFILE_EXCL);
    return { ...report, archive: { path: destination, files: names.length, sha256: hash(fs.readFileSync(destination)), status: "candidate-created-and-integrity-checked" } };
  } finally { fs.rmSync(stage, { recursive: true, force: true }); }
}

if (require.main === module) {
  try {
    const args = process.argv.slice(2);
    const packIndex = args.indexOf("--pack");
    const output = packIndex >= 0 ? args[packIndex + 1] : null;
    const remaining = args.filter((_arg, index) => index !== packIndex && index !== packIndex + 1);
    // With no --pack, do not accidentally drop the first CLI argument.
    const unknown = packIndex >= 0 ? remaining : args;
    assert.ok(unknown.every((arg) => arg === "--json") && (packIndex < 0 || output), "Usage: node scripts/extension-check.cjs [--json] [--pack /absolute/temp/output.zip]");
    const result = output ? packExtension(output) : inspectExtension();
    if (args.includes("--json")) console.log(JSON.stringify(result, null, 2));
    else {
      console.log(`PASS offline extension artifacts: ${result.resources.length} resources`);
      console.log(`${result.worker} -> ChromePage.js -> scrapyJs.js -> background.js`);
      console.log(result.scope);
      console.log(`SDK receipt verified: ${result.sourceReceipt.sdkHash}`);
      console.log(`Release allowlist: ${result.releaseFiles.length} files; symlinks forbidden`);
      if (result.archive) console.log(`CANDIDATE ${result.archive.path} sha256=${result.archive.sha256}`);
      result.gaps.forEach((gap) => console.log(`GAP ${gap}`));
    }
  } catch (error) {
    if (process.argv.includes("--json")) console.log(JSON.stringify({ status: "FAIL", exitCode: 1, errors: error.details || [error.message] }, null, 2));
    else console.error(`FAIL offline extension artifacts:\n${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = { inspectExtension, packExtension, releaseFiles };
