# Reading TOC R1.8.6 · Mac Chrome 最终验收

状态：WAITING_PRODUCTION_GATE，最终验收未完成，不评分。负责人：Codex 当前会话 `01a14abf-4147-72d1-b8c5-393c1432d673`。

用户后续明确优先核心功能与真实扩展界面，本轮转入持续开发恢复：现有 PID 94726 watcher 因本机缺少锁文件已声明的 `react-aria-components@1.22.1` 在共享 UI 编译中断，`dist/development/manifest.json` 与工具资源缺失。只用 npm 原安装器恢复现有锁定依赖，不新增依赖、不修改 manifest/lock、不停止他人 watcher；恢复开发界面后优先真实 TOC 浮层和标题点击。production 的独立门禁结果继续保留，不把开发结果宣称正式验收。

## 写入与资源

- 本任务拥有本记录、`artifacts/reading-toc-r186-mac/`、`.runtime/reading-toc-r186-mac/`；只在证实 Reading TOC 缺陷后登记必要源码/测试文件。
- 已证实的定向测试修复范围：`tests/environment/reading-toc-lifecycle-r41.test.mjs`（等待真实异步包摘要验证完成）、`tests/environment/official-tools-catalog-r45.test.mjs`（区分只读权限检查与默认安装入口）。写入前两文件均无并行 diff；不修改运行时权限和安全门禁。
- 另拥有 `docs/framework/workstreams/evidence/reading-toc-r186-mac-20261018/` 的本次精简原始日志与验收清单。
- 共享消息、存储、安装身份和公共 API 不变；不写其他任务的 Adblock、Page 生命周期、Mind Map、WXT 文件。
- 独立 production 源码快照、输出守卫、测试 Profile 和调试端口；不停止 PID 94726 的日常开发 watcher，不写日常 `dist/development`，不修改其他 Profile、扩展 ID 或 Native 配对。
- 不创建分支、worktree、PR，不推送远端。提交仅包含本任务明确路径，Git 索引/HEAD 写入前重新核对。

## 初始事实

- 本地 `main` 初始 HEAD：`a779ba4f203f76175ae37a3bf1e33a6b48c2817a`。
- 已获取最新远端 `main`：`b055166c35ef8ad683ca411b382869e4c94bd7ad`。本地落后 108 提交；唯一与未提交文件重叠的快进输入为 `wxt.config.mjs`，保留并行修改，暂停共享工作区快进。
- 后续使用该远端 main 的只读归档快照验证最新源码，不将旧 HEAD 的验证冒充新候选。
- 初始旧 HEAD 定向 Node：101/101 PASS；正式 JSON 与源码一致：`reading-toc@1.0.8`，28,481 B，SHA-256 `df3ab8fb74c4b32ae5932333c521f326d72a71256ebfeda412b3d6155f990c42`。这些是基线，最新 main 需重新验证。
- README 有历史“1.0.7 稳定包 / 1.0.8 未晋升”记录，不能代替实际正式包身份。

## 验收口径

分别记录 Node、正式包同源、生产构建、真实 Mac Chrome、真实 ChatGPT、旧版原位升级。模拟 DOM、新安装、旧候选和 CI 浏览器不替代真实站点与用户升级证据；未执行项为 NOT_TESTED，不评分 95+。

本轮明确包含 360、420、1280px 截图；其余尺寸、缩放和非本任务全量对抗不扩展。

## 本轮结果（2026-10-18，Asia/Shanghai）

并行集成者随后将共享 `main` 更新至 `6792f6544b9934b3fa3ba9cb4bffe6df3674ba30`，WXT 冲突已由其处理，现仍保留其未提交改动。本任务未替换或提交这些文件。相对冻结的 `b055166c…` 仅有 Workflow UI 两文件变化；Reading TOC、Adblock 可信输入和摘要门禁没有变化。最终定向测试在该共享 main 加本任务两处测试修复上执行。

| 项目 | 状态 | 证据 / 限制 |
| --- | --- | --- |
| Reading TOC、包/来源、默认安装与权限定向 Node | PASS | 117/117；[完整日志](evidence/reading-toc-r186-mac-20261018/final-node.log) |
| 两处修改的语法与 diff 检查 | PASS | `node --check` 两文件、`git diff --check` |
| 正式 1.0.8 与源码一致性 | PASS | 28,481 B；SHA-256 `df3ab8fb74c4b32ae5932333c521f326d72a71256ebfeda412b3d6155f990c42`；[原始输出](evidence/reading-toc-r186-mac-20261018/package-check.log) |
| 最新 main 的独立 production 构建 | FAIL | Adblock 已改动可信源码未匹配审核 pin：`examples/sidebar-tools/adblock/trusted/policy.js`；[原始日志](evidence/reading-toc-r186-mac-20261018/production-build.log)。未关闭安全门禁，未加载失败输出 |
| 已有共享 `dist/production` 可复用性 | FAIL | 缺少 `framework/browser-edition.json`，不能作为正式候选；[原始日志](evidence/reading-toc-r186-mac-20261018/existing-production-verify.log) |
| 独立真实 Mac Chrome 站点预检 | PASS | headed Chrome for Testing `155.0.8059.39`，真实 `https://chatgpt.com/uc/6ad3a8f0-76d4-83ea-ad98-61bf601b7811`，无登录会话复制、无 DOM 造假 |
| 三条 AI 回答 / 八个标题的测试内容 | PASS（预检） | 原生 AX 读到 3+3+2 个 H2，其中两处“重复标题”；这不代表 TOC 索引或导航通过 |
| 正式扩展及 Reading TOC 安装身份 / 安装即用 | NOT_TESTED | 缺少通过 production 门禁的同候选扩展，尚未安装；真实扩展 ID 未产生 |
| 网页完整目录八标题 / 两分隔线 / 浮层真实可见 | NOT_TESTED | 不将站点正文或预览冒充扩展浮层 |
| 鼠标点击第二、第三回答 / 重复标题独立导航 | NOT_TESTED | 同上 |
| Side Panel、活动回答跟随、流式增删、重新生成、SPA | NOT_TESTED | 同上 |
| 主动停用、恢复、撤销 Chrome 网站权限、卸载 | NOT_TESTED | Node 权限回归不替代真实 Chrome 生命周期 |
| 1.0.7 → 1.0.8 原位升级 / 设置保留 / 失败回退 | NOT_TESTED | 已提取历史 `d43fd7083` 的真实 1.0.7，SHA-256 `3d5ac0b4ca7bace06c4d4c013e5366b6e21ccc71c6ce92558a191ccd1f7a4573`；尚未安装，不以新装冒充升级 |
| 360 / 420 / 1280px 完整浮层与 Side Panel 截图 | NOT_TESTED | 尚无正式候选，未生成伪验收图 |

最新 Reading TOC [CI 39049653580](https://github.com/shopable-ai/opendesk-browser/actions/runs/39049653580) 对应冻结 `b055166c…`，结果 FAILURE：定向回归、严格生产/开发构建及现有 Side Panel 回归步骤失败。本地测试修复尚无远端 CI（本任务未获推送授权，未推送）。

## 两处最小修复

1. 生命周期测试不再把两轮 `setImmediate` 当作 WebCrypto 完成屏障，等待可观测的 observer 就绪，仍保留立即撤权、无第二次 enable、无新增网站授权等断言。没有修改生产权限或运行时。
2. 旧 catalog 断言禁止任何 `runtime.onMessage`，与现有固定的只读 Chrome access listener 冲突；改为要求唯一 listener、精确协议、真实 sender 进入原权限检查，并继续禁止通过消息注册、恢复或修复安装。

## 真实站点证据与续接资源

- [真实 Mac Chrome 三条回答截图（仅预检，没有 TOC 浮层）](../../../artifacts/reading-toc-r186-mac/screenshots/chatgpt-three-answers-preflight.png)。
- [完整原生 AX 日志](../../../artifacts/reading-toc-r186-mac/logs/chatgpt-preflight-ax.txt)，[浏览器版本](../../../artifacts/reading-toc-r186-mac/chrome-version.json)，[启动报告](../../../artifacts/reading-toc-r186-mac/chrome-launch.json)。
- 启动失败后仅对本任务采用 `chrome-testing-keychain` 隔离启动器，未读取凭据或更改系统钥匙串。保留测试进程 PID 4983、loopback 调试端口 43787 和启动器会话，方便同一真实对话续测；Profile 路径由启动报告记录。该实例目前没有加载 OpenDesk。
- 独立源码快照与构建输出位于 `.runtime/reading-toc-r186-mac/source/`。因安全构建失败，输出不可安装、不可打包交付。
- 下一执行条件：由 Adblock owner 完成其真实可信源码摘要审核并修复生产门禁后，冻结最新 main 候选，先 build/verify，再加载正式扩展到本任务独立 Profile，逐项执行上表 NOT_TESTED。不得为继续本任务改写 Adblock pin 或放宽门禁。

## 核心界面恢复（用户优先级更新）

- 现有 watcher PID 94726，路径 `dist/development`；保留唯一 writer，不停止或启动第二服务。恢复 lock 已声明但本机缺失的 react-aria-components，未改 package/lock 字节。
- 恢复后复现公共构建缺陷：react-aria SSRProvider 导入 useContext，但 `opendesk-shared-ui-react` 仅导出四个符号，整个扩展 manifest 缺失。属于现有固定 React runtime 的通用构建桥缺口，工具自身无法修复。
- 最小范围接续 `wxt.config.mjs`、`tests/environment/sidebar-shared-ui-r16.test.mjs` 的既有未提交补丁；此前 owner 记录 COMPLETE，文件在本次读取期间稳定。保留其零 imports/CSP/版本门禁设计，仅补齐固定 runtime 已有 React 导出，并用同一 runtime 验证，不改 SDK/权限/工具业务。当前会话为这两个路径的本次落盘负责人，提交时保留完整既有补丁来源。

- 真实 ChatGPT 新版 guest `/uc/` 已复现：回答位于 `ol[data-conversation-transcript] > li[data-message-role="assistant"]`，内容为 `[data-assistant-markdown-root]`，旧 `.markdown` 与 `data-message-author-role` 均不存在。此次功能修复范围增加 `src/reading-toc/model.js` 和 `tests/environment/reading-toc-chatgpt-content-r182.test.mjs`，当前无他人 diff。仅增加这个已观察到的内容边界，保留旧布局与 fail-closed。
