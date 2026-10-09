# Locked npm Page ESM demo

Two local source modules and a genuine `lodash-es@4.17.21` registry package, pinned in this project's separate `package-lock.json`. This is **Page USER_SCRIPT**, not Background / Controller code.

From the OpenDesk repository root:

```sh
npm ci --ignore-scripts
npm ci --prefix examples/programs/page-npm-lodash --ignore-scripts
node scripts/validate-program-project.mjs examples/programs/page-npm-lodash
npm run build:program -- examples/programs/page-npm-lodash
```

Read `artifact.json`: `npmDependencies` records the exact locked version, HTTPS source and integrity; `npmBundledModules` contains Webpack's actual npm module graph; `sourceHash` identifies final `program.js`. These records are complementary, not proof of installation.

Import `program.opendesk-draft.json` into the existing Sidebar draft workflow; approve target and try the Page script on `http://127.0.0.1:43111/demo-form.html` (start the existing local fixture server) or `https://example.com/`. It reads the first h1 and returns `{text,safeHtml}`. No runtime CDN, Background permission or additional browser UI is involved. The test in `tests/integration/npm-project-closure.test.mjs` validates Node USER_SCRIPT execution; **real Chrome remains a separate acceptance step**.
