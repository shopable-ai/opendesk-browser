# AI权益中心（AI Benefits）R1 · Chrome / Edge 扩展

- **项目目录：** `projects/ai-benefits/`
- **项目标识（slug）：** `ai-benefits`
- **Chrome / Edge 实际扩展 ID：** 由浏览器按扩展签名密钥生成；R1 不预设固定 ID。
- **内部包名：** `ai-benefits-mv3`
- **任务 ID：** `OD-AI-BENEFITS-R1`

Chrome / Edge Manifest V3 side-panel extension for safely handing users into official ChatGPT, Google AI Pro, OpenAI API, Gemini API, and organization-admin flows.

> **This is a safe handoff tool, not a payment robot.** It opens only hard-coded official entry points. It never submits payment, sends an invitation, redeems a gift, changes billing, or claims that an entitlement was activated.

## Deliverables

- `RESEARCH.zh-CN.md` — official evidence and feasibility matrix (checked 2026-11-27).
- `DESIGN.zh-CN.md` — MVP architecture, trust boundaries, interaction and state model.
- `prototype.html` — one-file simulation with synthetic accounts and four required scenarios.
- `extension/` — unpacked Manifest V3 extension.

## Load in Chrome

1. Unzip this project to a local folder.
2. Open `chrome://extensions`.
3. Enable **Developer mode**.
4. Select **Load unpacked**.
5. Choose the `extension/` directory (the directory containing `manifest.json`).
6. Pin the extension if desired, then click its toolbar icon to open the side panel.

Chrome Side Panel API requires Chrome 114 or later.

## Load in Microsoft Edge

1. Open `edge://extensions`.
2. Enable **Developer mode**.
3. Select **Load unpacked**.
4. Choose the same `extension/` directory.
5. Open the extension from the toolbar / Edge sidebar.

Edge documents support for the `chrome.sidePanel` API. Use a current Chromium-based Edge release.

## Run tests

Requires Node.js 20+ (no npm install or network access required):

```bash
cd extension
npm test
```

The tests cover exact HTTPS host allowlisting, lookalike-domain rejection, duplicate handoff blocking, interrupted-state recovery, and the rule that user reports never become verified success.

## What the extension stores

Only local account labels (aliases), selected product/action, a random handoff ID, timestamps, official entry URL, and a conservative handoff status in `chrome.storage.local`.

Do **not** enter email addresses, passwords, session tokens, cookies, payment details, verification codes, gift claim links, API keys, or order references. The extension does not ask for them.

## What it does not do

- No backend, OAuth, payment processor, order API, webhook, or checkout automation.
- No content scripts, host permissions, cookies, `scripting`, `webRequest`, `identity`, or page DOM inspection.
- No private endpoints, Session fields, account-password capture, or payment-card handling.
- No automated click on the final payment / send / redeem / seat-assignment confirmation.
- No success state based on tab opening, page closing, returning to the side panel, or user self-report.

The extension uses a local account label, not a verified provider identity. Always verify the actual account / organization / project shown by the official page before continuing.

## Product status

R1 is an official-flow handoff MVP. It is safe to load and test, but it is not a production payment integration and does not establish that any purchase, gift, credit grant, or seat assignment occurred.
