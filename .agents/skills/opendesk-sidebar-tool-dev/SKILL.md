---
name: opendesk-sidebar-tool-dev
description: Build, package and verify OpenDesk Browser opendesk.sidebar-tool.v1 Side Panel tools. Keep editable example projects, tracked built-in JSON, generated extension output and trusted page/Native code distinct.
---

# OpenDesk Side Panel 工具开发 Skill（AI/Codex）

## 适用条件

开发 `examples/sidebar-tools/<id>/` 的**可安装 Side Panel 工具**时使用。本 Skill 不用于 Controller/Task v1、多文件 ESM Page Program。先读根目录 [AGENTS.md](../../../AGENTS.md)、[工具 API](../../../docs/api/sidebar-tools.zh-CN.md)、[测试规范](../../../docs/framework/testing-guide.md)。已有工具就近 `AGENTS.md` 优先约束其目录；例如 [知识收件箱](../../../examples/sidebar-tools/knowledge-inbox/AGENTS.md)。

## 六步流程

1. **确认工具类型与权限边界。** 工具 JSON 格式为 `opendesk.sidebar-tool.v1`，不是扩展 `manifest.json`、Task v1，也不会仅因为安装而取得网站权限。
2. **选择正确源文件。** `tool.config.json` 加 `src/index.html`、`src/style.css`、`src/main.js` 是普通工具可维护源码；源码 `html/css/js` 由打包器嵌入 JSON。工具需要特殊网页捕获/存储/Native 时，应先审计已有可信扩展实现，不能给 opaque 沙箱直接增加危险权限。
3. **按现有合同打包。** 使用 `node scripts/build-sidebar-tool.mjs examples/sidebar-tools/<id> --out examples/sidebar-tools/<id>/<id>.opendesk-tool.json`；默认 `npm run build:sidebar-tool -- examples/sidebar-tools/<id>` 会生成 `artifacts/sidebar-tools/<id>/<version>/`。先审阅差异，再同步正式内置的 `src/sidebar-tools/<id>.opendesk-tool.json`（如该工具确实需要内置）。
4. **严格区分公私 API。** `src/ui/sidebar-tools/package.js` 与 `docs/api/sidebar-tools.zh-CN.md` 为通用工具包合同。知识收件箱内的 `page.capture`、`knowledge.store` 和 `knowledge.*` 依赖可信私有服务，并不是普通第三方工具可调用的公开操作。沙箱仅经宿主 `globalThis.OpenDeskTool.request` 调用已授权业务能力，不能直接调用 Chrome、Native、其他网页或运行远端代码。
5. **检查、构建、真实测试。** 至少 `npm run check`、受影响 `node --test`，完整扩展运行 `npm run build`、`npm run build:dev`、`npm run verify`。Chrome 加载 `dist/production/` 文件夹；工具安装、网站授权、重新注入与撤权分别验证。受控 Chrome 证据不等于线上真实用户网站。
6. **同步文档与证据。** 用户功能与限制放工具 README，维护步骤放 DEVELOPMENT，公共 API 放 `docs/api/`，AI 约束放 `AGENTS.md`，需求与计划放 `docs/product/`，候选 SHA/包哈希/原始证据放 `docs/framework/workstreams/`。报告明确未测、失败、被阻塞和通过，不伪造安装或磁盘回执。

不得覆盖并行任务源码、浏览器 Profile、dist/原始证据，不未经授权强推/重置 main，也不将构建成功当作正式发布。
