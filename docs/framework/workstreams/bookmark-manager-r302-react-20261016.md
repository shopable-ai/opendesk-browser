# Bookmark Manager R3.0.2 · React Candidate Ledger

2026-10-16 | branch: main | initial reference: 99180ed518d976fe0b5edfe64e656cf4a1556f7b

Scope: a React 19.2.0 + Vite 7.3.6 preview candidate under examples/sidebar-tools/bookmark-manager/preview/react. The formal tool src, Host, SDK, permissions, and installable package are unchanged.

Decision: use existing design tokens and the real bookmark model/service, backed by the existing offline Mock. The platform React component library is not yet selected; implement a provisional scoped ARIA Tree with visible-row virtualization and whole-tree search, rather than claiming React Aria/Radix is already integrated.

Source: preview/react/src/App.jsx; main.jsx; style.css. Offline builder: preview/react/build-preview.mjs. Chrome acceptance: preview/r302-chrome.mjs. CI: .github/workflows/bookmark-manager-r302-react-preview.yml. Output: one preview/index.html with sandbox allow-scripts and no allow-same-origin; diagnostics outside the tool.

At source submission: source candidate implemented; npm/Vite, Chromium, 130-folder searches, zoom 125/150, permission revocation, unknown write, lifecycle, ten separate UX scores, promotion and Mac native Chrome remain NOT_TESTED until the corresponding evidence is collected. The CI must not label pending work PASS. React source is not the formal installed UI. The GitHub Actions candidate must match the file later promoted to main, or promotion is blocked.

R3.1 awaits explicit user approval of the preview design.
## R3.0.2 historic verified baseline (2026-10-16)

The original statement above recorded the state *before* candidate acceptance. R3.0.2 was subsequently built and accepted by GitHub Actions Chromium Mock run [38879614647](https://github.com/shopable-ai/opendesk-browser/actions/runs/38879614647) (success), with offline HTML blob `30b5de97d8662dfa12e93c64645837e31d6159d2`; React 19.2.0, Vite 7.3.6, and 360/400/960 viewport interaction regressions were evidenced. This is **not** a native installed extension test; it does not verify accessibility screen readers, browser zoom, or ten independent UX grades.

## R3.0.3 incremental a11y & write-safety closure candidate (2026-10-16)

A concurrent React R3.0.3 UI update already replaced the persistent bottom inspector with a dismissible sheet and simplified explicit Cancel. The independent Chromium 144 audit of the promoted R3.0.3 HTML (same blob `371feb48daa54317d8455252c809567194e7b560`, R3.0.3 Chromium CI run [38886396049](https://github.com/shopable-ai/opendesk-browser/actions/runs/38886396049)) reproduced a missing `aria-activedescendant` on virtual-list scrolling at 360, 400 and 960 CSS px. The patch preserves this UI direction and addresses ARIA active descendants, sibling metadata, search-expanded semantics and keyboard F2 / Shift+F10, adds Cypress-free real Chromium regression assertions, and protects partially completed move/update/delete + failed readback from blind replay.

The editing contract is deliberately differentiated: explicit inline **Cancel** discards the draft immediately (per current user UX), whereas clicking **X / pressing Escape** with an actually dirty draft demands explicit discard/continue-edit; clean drafts close directly.

**Same-candidate validation pending this change:** Vite build, offline HTML regeneration and exact-promotion CI, 360/400/960 real Chromium screenshot and keyboard assertions. True 125%/150% browser zoom (DPR is not a substitute), physical Mac installed Chrome, manual assistive-technology audit, stale conflicts, full permission-revoke lifecycle, partial update failure injection and React unmount/re-mount remain `NOT_TESTED` unless separately demonstrated. No independent 95+/100 UX scores are claimed; all ten dimensions are `NOT_SCORED` pending sufficient evidence. No formal extension UI, SDK, Host or permission change is authorized. R3.1 remains `NOT_APPROVED`.

## R3.0.3 accepted same-candidate CI and independent checks

- GitHub Actions [38888601250](https://github.com/shopable-ai/opendesk-browser/actions/runs/38888601250): **PASS** for commit `bfa4c8ca68cb18cf8b7499802fddc60c5c7ca096`, Chrome `155.0.8059.84`, preview HTML Git blob `b594323ec7e5f3bbc34a561fa5b5ca70d08a8251`; re-generated React 19/Vite candidate exactly promoted to main. This supersedes the candidate-only pending CI paragraph above.
- Independent Chromium 144 browser execution of those exact HTML bytes: at 360/400/960 CSS px, keyboard Home/End and virtual offscreen `aria-activedescendant` resolved to real DOM nodes; 21–22 DOM rows for 2,159 visible source nodes; no JS exceptions.
- Independent readback safety regression at 360/400/960: dirty X guard / Escape keep draft / explicit discard, external conflict preserving draft, E_OUTCOME_UNKNOWN save disabled and new writes blocked until refresh, revoked permissions clear visible tree and restored permissions reload. All passed in sandbox-only Mock.
- Remaining quality gates: native macOS installed Chrome and true browser zoom at 125%/150% **NOT_TESTED**; manual screen-reader audit **NOT_TESTED**; ten independent 95+ UX ratings **NOT_SCORED**.
- Further incremental compact icon-only create controls preserve one existing React UI and maintain locator semantics; the final HTML for this additional change must pass its *own* same-candidate CI before it can be promoted.
