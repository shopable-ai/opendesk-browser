# R24.4 JSX/SFC 双入口验证与安全交付记录

日期：2026-10-12。状态：**部分实施 / 最终放行未满足**，不可把文档标题中的 Final 当成验收结论。

## 候选与互不干扰规则

- 初始只读核查基线：`f86026018f939d6d430acb7fe1bfe11ed8de6f52`。提交时复核的最新主线：`f0776aa93b007dd8f84e4790ce2d4c07742c6ef9`。本次只修改 CLI 独立依赖合同、原有 npm tarball Smoke 以及两份使用文档；`src/ui/script-editor.js` 和 `tests/framework/page-browser-worker-r243-cft.mjs` 在本次读代码期间被并行提交，**保持只读，不覆盖**。
- 不使用非 main 分支、worktree 或 PR。GitHub 原子提交使用预期 HEAD 和非强制快进；不连接用户 Mac 本地工作目录、不抢 43111、Chrome profile、Native 或共享 dist。

## 复用的实际原生证据

- [R24.3 React 20 × Vue 20 独立本地 Native/MCP Run/Stop](https://github.com/shopable-ai/opendesk-browser/actions/runs/38155034890)：历史候选限定 PASS（不对应本次 CLI 新安装包）。
- [R24.3 macOS 无 Native 浏览器 Side Panel 直接编辑 → Worker JSX/SFC → USER_SCRIPT → 点击响应 → Stop](https://github.com/shopable-ai/opendesk-browser/actions/runs/38225425847)：候选 `9cdb3bf98fe410b88c456801855e2635f6b1a7b0`，原生回执 React `previewId=55fa4b70-0d37-497d-9f2a-fa1750ab7316` / `sourceHash=a48fe4ddd903c078337b3a0b0e0241aa5e777b3c1a7faf1e49eff58dac2b8926`，Vue `previewId=10c188da-05d3-4a1a-a947-9453636058f3` / `sourceHash=d7071713db0fed4d16fee1b7ab2f6ec3ff4f1254b71a8de06ded4bca30c27f59`，`documentId=C867496B16C628E4EB292B41BA970DBE`，真实鼠标点击，DOM clean，Native false。原始 CI 输出的 20447 / 21025 是 JS `.length` **字符计数**，不能冒充 UTF-8 产物字节数。
- 新主线上的完整 UI Chrome 候选、浏览器直接模式 React/Vue 各 20 次、故障重试、SPA/BFCache、撤权、CSS scoped 全矩阵、窄屏、200%/明暗主题及最终 F3/ZIP 不因为上述历史成功自动 PASS。

## 本轮独立 CLI 的必要修复

- `native-agent/local-dev/resolver.mjs` 静态导入 `esbuild`；`scripts/page-jsx-loader.cjs` 的 `require('esbuild')` 与 `scripts/build-program-project.mjs` 的 `require('source-map')` 都属于打包后需按 npm 依赖解析的实际运行输入。
- `packages/opendesk-dev/package.json` 增加固定 `esbuild@0.28.2` 和 `source-map@0.6.1`，与仓库 lock 中的相同版本对应，避免仅靠根目录提升的偶然成功。
- `tests/framework/r17-package-smoke.mjs` 在**真实 `npm pack` → 外部全局安装**原有 Controller 测试之后加入 React `App.jsx`、Vue `App.vue` 自动编译、可执行预算、缓存命中和保存后 `inputHash` 更新；仍不借此称浏览器原生 PASS。
- 验证路径：`.github/workflows/r17-directory-cli.yml` 在 `main` 的包改动后触发 macOS+Ubuntu 安装测试。最终状态以本次提交实际 CI 为准，**CI 未结束前 NOT_TESTED**。

## 放行未满足项

- 当前运行环境没有用户的 `/Users/shopme/Documents/workspace/opendesk-browser`、Mac 本地 Native 和共享 Profile；不能把 GitHub 读写与独立构建等同于本地真实验收。
- 受管重复运行/未知 Stop、完整目标 window/frame/URL/document 边界以及完整无 Native 20×Run/Stop 在并行维护的 Side Panel 源文件内；等待该职责拥有者交接，无权覆盖其当前修改。
- 官方组件语法兼容、安全、体积、缓存、UI、生命周期、Native 和 95+ 的全部独立质量评分必须由最终候选的对应证据关闭；未测时标记 NOT_TESTED，不编造分数。
