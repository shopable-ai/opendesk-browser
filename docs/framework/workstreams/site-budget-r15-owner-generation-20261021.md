# Site budget R1.5 · per-owner foreground invalidation (2026-10-21)

- Owner: this R1.5 background-runtime implementation task. Source write scope: `src/platform/chrome/browser-managed-site-budget.js`; directed test: `tests/environment/managed-site-budget-r14.test.mjs`; no SDK/Host/Installer/Stay Focus/AdBlock changes.
- Concrete defect: the pre-existing Worker stored a single `settledGeneration` for all site-budget owners. During a multi-owner activity invalidation the first owner updated this shared marker; a later owner could charge elapsed time across the same focus/idle transition. An event that arrived during a native readback could also be accidentally acknowledged by the earlier sample.
- Minimal repair: snapshot the invalidation generation before awaits, store its successful acknowledgement per tool ID, drop it when a source owner is replaced or cleaned, and add both adversarial cases to the existing R1.4 test suite.
- Validation state at authoring: SOURCE_CHANGED; Node/CI/production build/Chromium/Mac/B0 are NOT_TESTED until independently run against this exact commit. No mock or static review is promoted to native proof.
- Preserve original A + C boundaries, original per-tool Installer lock, fixed Worker, install hash/epoch, native DNR/Alarm readback, priority ownership and existing apps. Do not regenerate the package until required tests and build are green.
