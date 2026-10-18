# OpenDesk Browser React UI R34.4 — 扩展中心与开发页定向修复记录

日期：2026-10-18。工作范围：正式扩展安装测试、Developer 只读核验与文件工作区提示、完整目录打开 Chrome Side Panel、扩展中心持续回归。本轮只对 GitHub 最新 `main` 使用文件 Blob SHA 安全写入，不操作用户 Mac 本地 Git 工作区；不创建分支、Worktree 或 PR，不修改独立 Cookie Editor / Stay Focus / Scheduler 业务。

## 用户需要完成的操作

1. 在「扩展」导入、审阅并安装普通 Sidebar Tool 和 Page Program JSON，正确显示失败/回执，完成同 ID 原位升级、停用与卸载。
2. 在「开发」选择已有源码，明确点击 Run / Stop，区分只读核验与真实执行；文件工作区没有程序入口时应告知用户如何配置，不允许误安装。
3. 从完整目录一键打开真实 Side Panel，不依赖异步变化中的网页目标标识。
4. 复用已经实现的 React Root、Scheduler、Task Registry、Workflow 与安全 Host，不重建业务模块。

## 本轮修改和根因

| 提交 | 文件 / 变更 | 根因及处理 |
| --- | --- | --- |
| `b23de31940cd4fc88473dc617ada5e2b9273a877` | `tests/environment/sidebar-tools-host.test.mjs` | 测试夹具缺少正式 Page Program 导入回执 DOM；补齐三个节点，不放松正式 `resetReview()` |
| `5876e3f205a6d85f33a413c01071c333969ba30c` | `tests/environment/script-editor-ui.test.mjs` | 旧断言把只读安装来源核验误认为自动执行；保留目标捕获、身份、哈希、权限与禁止重放断言 |
| `7146e8a863470491dc003baceada6342332c8a6c`、`a6ced4f4c3537fae0a3ac7249c1b7761a3cba796` | `src/ui/local-project-install-ui.js` | 文件工作区不可执行，但旧保存入口没有可操作阻塞说明；使用现有 `selectionKind()` 判断，告知配置 `package.json` 与源码 Provider，确认安装禁用 |
| `12e2d61d2e5cb7d0e778b8ef99c1ab56179225f7`、`f956bfdfcddd522cd5e1e4027636032b4bddda38` | `tests/environment/script-editor-ui.test.mjs` | 回归验证“查看保存阻塞原因”不能变成执行与安装授权 |
| `9842277266087b6784f98afbb39fd251f892130d` | `src/ui/tool-shell.js` | 完整目录打开侧栏应优先使用当前 Chrome 标签页自身 `windowId`，同步调用 `chrome.sidePanel.open` 保留原始可信点击 |
| `840878e8c35d5eb5938671e41ccb7c00a4ed7a7b` | `.github/workflows/extension-center-r4.yml` | 将 Page JSON 导入与原 Sidebar Tool Host 合同纳入同一扩展中心回归，避免原流程未执行 |
| `9d79a8832c2f86c114d81c6042bd0751ae2be258` | `prototypes/sidebar/extension-center-r47-frequency-first-preview.html` | 历史单页参考中的 Cookie Editor 当前版标签落后于独立安装包 `2.0.23`；只更新历史演示文字和样例，保留隔离的旧版升级案例 |

## 已得到的可复核证据

- 计划详情 R3：macOS Chrome 原生 CI [39132327223](https://github.com/shopable-ai/opendesk-browser/actions/runs/39132327223) **PASS**，这是并行 Scheduler 负责人完成的工作；本轮不写 Scheduler 文件。
- Developer Node：`f956bfdf...` 的 Extension Center CI [39133135402](https://github.com/shopable-ai/opendesk-browser/actions/runs/39133135402) 中 `Validate Developer Script Editor` **239 PASS / 0 FAIL**；该次整个工作流仍因历史参考版本错误 FAIL，不能表述为 Extension Center 整体通过。
- React 六 Tab：`98422772...` 的 [39132998728](https://github.com/shopable-ai/opendesk-browser/actions/runs/39132998728) 两个 Job 均 **PASS**，包括生成同源 HTML、Chromium 六面板、实际指针 UI 交互、Node、正式包/开发包构建及校验。
- 正式可读的同源 HTML 已由并行 main 合并写入 `prototypes/sidebar/react-preview/index.html`；当前文件头的 `od-source-input-sha256` 是 `b7c2fe36c93865662e65fef1f3c407c991ad86f5f5d798fde929f3c14145b385`。生成器 `scripts/preview/build-sidebar-six-react-preview.mjs`，需每次候选运行 `--check`，不手工维护第二套 React 页面。

## 当前仍需独立关闭

- `Extension Center R4` 最新候选 [39133489592](https://github.com/shopable-ai/opendesk-browser/actions/runs/39133489592)：记录时 **QUEUED**，新版测试合同和 Page JSON 导入是否端到端 PASS 尚不可宣称。此前较早候选的失效测试结果不可复用为当前 PASS。
- Developer macOS Chrome R24.3 [39133489839](https://github.com/shopable-ai/opendesk-browser/actions/runs/39133489839)：记录时 **QUEUED**。旧版 CFT [39126984666](https://github.com/shopable-ai/opendesk-browser/actions/runs/39126984666) 在侧栏打开确认超时；本轮 windowId 最小修复需要新原生回执。
- 真实用户 Mac Chrome 安装、升级、关闭重开、权限撤销、React JSX / Vue SFC Run/Stop 均仍 **MAC_NATIVE_NOT_TESTED**；CI 只是对应的 CI Mac 环境。
- R19/R21 disclosure 对比度旧失败尚未针对当前提交重新复现，保持 **NOT_TESTED**，不据过期合同调整整个设计系统。

本轮不触碰 Cookies/Mind Map/Stay Focus/Prompt Shortcuts/广告拦截业务源码；在其他对话同时推进的文件，保留其正式提交与原生证据。后续只对当前失败测试做最小修复，不重新开发 React 侧边栏。
