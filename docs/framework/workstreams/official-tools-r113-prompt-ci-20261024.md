# Official Tools R1.13 — Prompt Shortcuts Chromium rail CI (2026-10-24)

- Owner: official tools R1.13 CORE; write scope is `scripts/tests/prompt-shortcuts-r41-visual-chrome.mjs` and this workstream record only.
- Integration: existing `main`, no branch/worktree/PR/force push. Use atomic fast-forward with expected HEAD and re-read target on conflict; unrelated Agent files remain unchanged.
- Chrome resources: none acquired. GitHub workflow's own isolated runners provide subsequent verification. Mac CFT/Native and installation lifecycle are NOT_TESTED by this source change.
- Current reviewed inputs: `trusted/page.js` blob `197b0a54ac8685631f046ad465b79714b235bdfb`, Reading TOC `trusted/view.js` blob `5528e01bc46fa8c6bb38390898dec3a608c055b7`; both already match `scripts/bundle-provenance.mjs` on the checked main.
- Original failure: [Prompt Shortcuts Actions 40002510399](https://github.com/shopable-ai/opendesk-browser/actions/runs/40002510399), Chromium original rail job 120581967871: 32/32 scenes failed, with old five-button / management expectations even though `b3f06ec0` intentionally removed the redundant `管理` page button. The R111 script was already corrected by `10c5788`; this R41 script remained stale.
- Smallest correction: preserve all actual Chrome DOM measurements, CSS geometry, tooltip, hover, touch, keyboard, image sizing, and 32-scene coverage; update three outdated button-count checks from 5 to 4 and explicitly reject the unwanted management button. This does not change formal extension bytes or weaken privileged source authorization.
- Verification: syntax/static replacement checked before commit; current-SHA Chromium CI and authentic Native evidence must be checked separately. No PASS claimed from source-only inspection.
