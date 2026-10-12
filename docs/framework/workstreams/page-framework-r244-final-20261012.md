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

## R24.4 打包失败的真实证据、修复与增强复测

1. 本轮首次独立安装 CI [38230210790](https://github.com/shopable-ai/opendesk-browser/actions/runs/38230210790) 在 macOS、Ubuntu 均出现 **FAIL**：`scripts/pack-opendesk-dev.mjs` 在复制真实编译器依赖图时拒绝 `scripts/page-vue-sfc-loader.cjs`，错误码 `E_PACKAGE_INPUT`。这不是 React/Vue USER_SCRIPT 运行失败，而是 npm 打包未形成完整安装包。未将失败伪装为 PASS。
2. 纠正提交 [`e082d180`](https://github.com/shopable-ai/opendesk-browser/commit/e082d18037d0710d690efd02eeb3d2f0e3d086e3)：扩展受信源码扩展名白名单，复制并解析 `.cjs`，递归纳入静态相对依赖，保留根目录校验和符号链接拒绝。新 [R17 包回归 CI 38230644004](https://github.com/shopable-ai/opendesk-browser/actions/runs/38230644004) 复核打包/全局安装；以最终实际 conclusion 为准。
3. 同一原 `tests/framework/r17-package-smoke.mjs` 从 React/Vue 两个默认项目扩大至 React JSX、Vue SFC、React Direct、Vue Direct **四目录真实 tarball 安装来源**，逐一检查当前源码编译、实际 JS 大小、缓存复用与源码修改后的输入身份更新。无强行改动测试隔离环境、无伪造浏览器回执。

## 四目录冻结产物的独立哈希复核

从 `9e1b2221c062fb81fd668762c059cdde297679ef` 的四份 `examples/import-ready/page-ui-*.opendesk-draft.json` 读取 `sourceUtf8`，逐字节 UTF-8 编码并重新计算 SHA-256，四项均与冻结产物 `build.sourceHash`、`build.byteLength` 一致：

| 项目 | JS 字节数 | 完整 SHA-256 |
| --- | ---: | --- |
| page-ui-react | 18592 | `97ff050d29977932156b130a01f2149799a2c821a65a25778c2f269591e3c557` |
| page-ui-vue | 18873 | `747838ef6225583e6128f906ec2491f0ce141b7f8f50f3d01e2bcf7877f8f0c0` |
| page-ui-react-direct | 20944 | `c3ad6f43aaedf2b59e14896df6414f7caaaf2392d01d02bb265030d9ac44146d` |
| page-ui-vue-direct | 18608 | `f83a08b3e2d9952cf5729276b01388b1fca8a5334ea683b5df00ad4e372618f5` |

只把这四项标为 **PASS_EXISTING_ARTIFACT_SHA256**，不将冻结产物重新分类成新 CLI 构建测试、Run/Stop 或最终 Chrome 验收。

## R24.4 Mac 实际全局 tarball 四目录编译证据（2026-10-12）

- [本轮独立安装与日志 run 38231722128](https://github.com/shopable-ai/opendesk-browser/actions/runs/38231722128) 的 `macos-latest` Job `114752556619` 为 **PASS**，来源 commit `8fe99dc853961b434c238bc68c1d25c3a8062b08`。它从真实 `npm pack` 安装全局 `@shopable/opendesk-dev@0.1.0-r17.1` 到 Git checkout 之外，使用安装包内 Resolver 针对四项目真实编译、命中缓存、保存后重新构建。用 `Buffer.byteLength` 和 SHA-256 重新复核，全部等于上表 18592 / 18873 / 20944 / 18608 B 及完整 `sourceHash`，无虚拟/Node Mock 假产物。
- 四份独立 `originalInputHash` 在源码注释保存后均变化为新 `modifiedInputHash`；`cacheHit:true` 与 `editedRebuilt:true` 为四项实际断言结果，CI stdout 保留各自哈希。
- 同一作业 95/95 CLI/Workspace 组件测试、5/5 Native access 兼容测试及 WXT 生产构建通过；`ui/tool-shell.js=429029 B`，硬上限 `524288 B`，尚有 `95259 B` 空间，但超出既有软审查阈值，不作为体积维度 95+ 的充分证据。
- 此次运行 Ubuntu job 的状态以该 run 的最新实时结果为准；macOS 实际全局 CLI 编译 **不是** 同一 SHA 的真实浏览器 Native `opendesk browser dev .` 四目录 Run/Stop，更不能代替浏览器无需 Native 的 20× 独立 Run/Stop。
