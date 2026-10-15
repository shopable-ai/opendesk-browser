# ChatGPT Mind Map R1 · scoped handoff (2026-10-15)

## Ownership and exact scope

Authoring owner: this independent program task. Paths: `examples/programs/chatgpt-mindmap/**`, `tests/environment/chatgpt-mindmap-r1.test.mjs`, `tests/fixtures/chatgpt-mindmap.html`, this workstream only. No edit to browser host `src/`, no second framework or manifest, no modifications to `shopable-station`. No `dist/development`, local Mac Chrome/profile/port or global writer resource touched.

## Source confirmation

GitHub connector read `shopable-ai/opendesk-browser` default `main` and the program builder, validator, Page UI and lifecycle code; read reference `shopable-ai/shopable-station` Mindbank mind-tree, read-only viewer and XMind adapter. The browser repository was not mounted in this runner, and Git network/DNS access failed. **No remote push/commit/branch mutation.** Local deliverable is an overlay to apply only to `main` after checking the working tree and concurrent owners.

## Contracts and evidence

- Local source ownership/complete overlay: PREPARED
- Node syntax: PASS (each changed ESM `.js`)
- Node semantic/layout tests: PASS (6/6; attached test source)
- Browser DOM fixture: NOT_TESTED; local Chromium headless timed out even for `data:text/html,<h1>ok</h1>`, so no test oracle. Keep fixture for actual Chrome.
- `validate-program-project` and `build:program`: NOT_TESTED; full main dependencies/build scripts unavailable locally
- Candidate → Verification → Available → Installed: NOT_TESTED
- Logged-in ChatGPT current toolbar / 5+ replies: NOT_TESTED
- Disable/Uninstall immediate cleanup on already open page: BLOCKED by generic installed UI retirement contract until proven otherwise; normal Page UI Stop/pagehide registered cleanup is source wired
- CFT/Mac native install, site grants, final 95+ scoring: NOT_TESTED

## Handoff

1. Apply overlay to actual main **without overwriting unrelated work**; keep normal `npm run dev` writer.
2. Run project validator, builder and Node tests; record true SHA-256 of `program.js` and artifact manifest and build byte size.
3. On separate Chrome profile, run fixture tests and visually validate real logged-in ChatGPT answer/action DOM. Adjust adapter based on observed structure only.
4. Freeze candidate, grant site permission, verify install/disable/revoke with same identity and save native evidence. Escalate generic installed retirement capability only if stop gap reproduced.
