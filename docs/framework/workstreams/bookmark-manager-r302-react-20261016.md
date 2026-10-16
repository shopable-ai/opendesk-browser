# Bookmark Manager R3.0.2 · React Candidate Ledger

2026-10-16 | branch: main | initial reference: 99180ed518d976fe0b5edfe64e656cf4a1556f7b

Scope: a React 19.2.0 + Vite 7.3.6 preview candidate under examples/sidebar-tools/bookmark-manager/preview/react. The formal tool src, Host, SDK, permissions, and installable package are unchanged.

Decision: use existing design tokens and the real bookmark model/service, backed by the existing offline Mock. The platform React component library is not yet selected; implement a provisional scoped ARIA Tree with visible-row virtualization and whole-tree search, rather than claiming React Aria/Radix is already integrated.

Source: preview/react/src/App.jsx; main.jsx; style.css. Offline builder: preview/react/build-preview.mjs. Chrome acceptance: preview/r302-chrome.mjs. CI: .github/workflows/bookmark-manager-r302-react-preview.yml. Output: one preview/index.html with sandbox allow-scripts and no allow-same-origin; diagnostics outside the tool.

At source submission: source candidate implemented; npm/Vite, Chromium, 130-folder searches, zoom 125/150, permission revocation, unknown write, lifecycle, ten separate UX scores, promotion and Mac native Chrome remain NOT_TESTED until the corresponding evidence is collected. The CI must not label pending work PASS. React source is not the formal installed UI. The GitHub Actions candidate must match the file later promoted to main, or promotion is blocked.

R3.1 awaits explicit user approval of the preview design.