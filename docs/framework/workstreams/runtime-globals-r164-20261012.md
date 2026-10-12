# R16.4 零参数用户脚本与公共预装库跨世界合同：实施记录

日期：2026-10-12。仓库 `shopable-ai/opendesk-browser`、工作分支仅 `main`。

## 源码调查

- Controller Worker：`src/scripting/sandbox/worker-runtime.js` 的受审 AsyncBody 有 `page,params,axiosx,AppStorage,AppLocal,storage` 词法绑定，`controllerProgramBody()` 调 `main()`。
- `src/libs/core.js` 在 Controller 与 Page USER_SCRIPT 运行前安装 `_` / `dayjs` / `OpenDeskLibs`。这三者不代表网站 MAIN 或整个 Chrome Extension 全局。
- 多文件 ESM 编译器 `scripts/build-program-project.mjs` 会调用项目 default export，并为旧 `main({page,params})` 提供兼容对象。旧 `examples/programs/local-controller/src/main.js`、`controller-title/src/main.js`、`sidebar-controller-demo/src/main.js` 仍采用此签名，容易被误判成强制入口。本轮保留这些历史有 Golden/Chrome 证据的源文件，不改它们的源码哈希，而新增明确可运行零参数 ESM Demo 与编译测试。
- Page USER_SCRIPT 不拥有 Controller `page/params/axiosx`；Background / Sidebar trusted host / extension pages 通过各自入口静态 import，已安装工具 iframe 通过 `OpenDeskTool`，不能共享 JS 全局。
- 构建期 npm 依赖固定资源存在，不意味着运行时全部载入 SW。当前实际库目录、版本、可选选取和世界仍由实时 Catalog 主导，不能从旧 R15 清单或设计目标推断产品 95+ 已交付。

## 本轮交付目标和状态标注

新增权威 `docs/api/runtime-globals-and-preinstalled-libraries.zh-CN.md`；新示例 `examples/programs/controller-globals-zero-arg/`、`page-globals-zero-arg/`；Node 编译与预置真实库验证 `tests/environment/runtime-globals-zero-arg.test.mjs`；更新根/类库 AGENTS、src/libs README、Controller/Page/Local Projects/API 导航及历史项目开发文档。新增下一轮网页研发 GOAL `docs/framework/prompts/goal-r164-runtime-globals-worlds-acceptance-20261012.zh-CN.md`。

提交前以 GitHub 最新 `main` 校验原文件 Blob SHA，并安全合入；不生成分支/Worktree/PR、不强推。**本记录创建时未声称 Node/Chrome 已通过**。只有 GitHub CI 回执与具体 SHA 一致才能升级工程状态；真实 Mac Chrome 另列 `NATIVE_UNVERIFIED`，最终 F3/ZIP 未自动关闭。

## 明确不做

不删除历史 `main({page})` 兼容，不将 Node Worker 词法 page 强行注入 `globalThis.page`，不在 Page USER_SCRIPT 调用 Controller page，不重建第二套 vendor Catalog/Loader、不要求普通用户 npm/CDN、不开新权限、不为文档修订修改 SW 预算、不把未验收 Socket.IO/Tailwind/Controller Axios 宣称完成。
