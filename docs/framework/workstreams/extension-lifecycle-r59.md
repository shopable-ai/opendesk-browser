# Extension lifecycle R5.9 · scoped workstream

- Writer: R5.9 implementation; starting HEAD: `52e1d98b1c3cddc61dfa1624282e18d67e2a706b`
- Paths: `src/ui/local-project-install-ui.js`, `src/ui/sidebar-tools.js`, `tests/environment/local-project-install-ui-r251.test.mjs`, `tests/environment/extension-center-page-import.test.mjs`
- New record: `docs/framework/workstreams/extension-lifecycle-r59.md`; no Installer, Authority, Registry, or Schema modifications
- Boundary: before managed UI retirement/Candidate submission, installation effects are impossible; afterwards failures require original Authority readback
- Product behavior: disabled Page installation keeps its native-disabled state and is not represented as automatically running
- Existing contract: `docs/architecture/browser-framework/extension-installation-and-publishing-ownership.zh-CN.md`
- Focused regression inputs: `node --test tests/environment/local-project-install-ui-r251.test.mjs tests/environment/extension-center-page-import.test.mjs`
- Native Chrome, Mac UI and online publishing are not proven by these component regressions
- No claims on shared dist, watcher or Chrome profile
