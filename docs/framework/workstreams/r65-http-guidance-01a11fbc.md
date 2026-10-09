# R6.5 HTTP Guidance Assertion

Status: released locally; targeted component contract PASS.

## Scope

- Worktree: `/Users/shopme/.codex/worktrees/r65-http-guidance-01a11fbc/opendesk-browser`
- Branch: `agent/r65-http-guidance-01a11fbc`
- Base: `fdcec121c15a2e2519f10229a0092eb720c564ce`
- Requested fix: only `tests/environment/basic-browser-page.test.mjs` line 78 assertion for the DevTools Network guidance text.
- Browser/shared dist/native resources: not used.

## Change

`tests/environment/basic-browser-page.test.mjs` now asserts the actual manual HTTP guidance contract:

- the HTTP section still points users to DevTools Network;
- the same guidance still mentions Headers;
- the test no longer requires the stale literal phrase `Chrome DevTools`.

The assertion was not removed or weakened to a generic text presence check.

## Verification

2026-10-09 CST, local isolated worktree.

- `node --test tests/environment/basic-browser-page.test.mjs` -> PASS, 15/15.
- Raw log: `docs/framework/workstreams/evidence/r65-http-guidance-01a11fbc/node-test-basic-browser-page-raw.log`
- Raw log SHA-256: `02afa5dc7e14ecf340de4f2d943b069960c3a0843dcceae762b67d0680fd89db`

## Read-only Native Evidence Check

No native/headless tests were rerun for this workstream. Existing raw evidence is sufficient to preserve the known distinction:

- `docs/framework/evidence/sidebar-ci-quality-01a11f71/job-113696544163.log` contains `REAL_CHROME_UNEXTENDED_RENDERER=FAIL` with `CDP Runtime.evaluate timeout` and `MachPortRendezvous Permission denied (1100)`, while later reporting `REAL_CHROME_EXTENSION_LOADED=PASS`. SHA-256: `761386f22b2e42042cf596d1791141bd97defe197c3dcefc72201625b80b125e`.
- `docs/framework/evidence/sidebar-multifile-native-r1-20261009/current-main/environment-tests.log` contains `REAL_CHROME_UNEXTENDED_RENDERER=PASS browser=cft version=Chrome/155.0.8059.39` and `REAL_CHROME_EXTENSION_LOADED=PASS`. SHA-256: `b53300f7669b27e26a80b27f6724f68cc52f03739a7bce878b368afc53767461`.
- `docs/framework/evidence/sidebar-multifile-native-r1-20261009/current-main/native-cli-diagnostic.log` also contains Chrome 155 CDP baseline PASS evidence. SHA-256: `fc48960af01aa823bab86b8ae3a26ab94a664e82270034deba12bc57b0bd79c4`.

This branch does not claim a new native PASS, F3 PASS, ZIP acceptance, or installed-extension acceptance.
