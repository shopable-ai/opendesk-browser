# OpenDesk Browser R1.2.5-WEB · 四产品最后业务增量与发行门禁实读

日期：2026-10-26。唯一写入分支：`main`。本会话 owner：R1.2.5-WEB，只接管本文件及已释放的 `official-pages/sources.json` 中 Send Queue **阻塞原因文字**。没有取得 Send Queue、Prompt 正式包、共享可信来源锁、Mind Map 许可或 Mac 浏览器资源的 owner 交接。

## 原始最高目标与关键任务（不可漂移）

在 OpenDesk Browser「扩展」中心让四项产品分别可发现、独立安装、使用、停用、升级和卸载：
1. Sidebar Tool `prompt-shortcuts`：保存、编辑、管理、导入导出提示词，点击只填写草稿、**不自动发送**。
2. Page Program `opendesk.ai-scroll-navigation`：独立的五项导航，网站仍仅限获准的 ChatGPT、DeepSeek、Gemini。
3. Page Program `opendesk.ai-reply-mindmap`：真实 XMind 查看、定位、恢复原文、导出及 Viewer Theme；ChatGPT-only；许可未批准不发行。
4. Page Program `opendesk.ai-send-queue`：ChatGPT-only，多消息 memory-only FIFO、暂停恢复、精确用户消息/回复确认、草稿保护、unknown-effect **不自动重发**。

共享回复 DOM 工具区不是第五产品。新 ID 不继承旧安装、Authority、队列消息或自动发送许可。复用原 SDK、Page 构建器、官方来源和 Extension Center，不创建 Host、安装器或平行框架。只做有证据的最后增量，不重做 R1.2.2、R1.2.3、R1.2.4。

## W0：实读状态与跨对话去重

只读起始远端 HEAD：`00b42463c1ac0a44e9267978238e245d3d77175a`（晚于历史 `8998da5c`）。阅读 `AGENTS.md`、并行协议、R1.2.2/R1.2.3/R1.2.4 工作流、产品项目文件、官方目录及相关真实 CI。远端 GitHub **不能证明**用户 Mac `/Users/shopme/Documents/workspace/opendesk-browser` 的 dirty、watcher、owner 实时占用或 Chrome 安装状态。

| 文件范围 / 最新 Blob | 真实状态 | Owner / 写入结论 |
| --- | --- | --- |
| `examples/sidebar-tools/prompt-shortcuts/tool.config.json` `19799ede` | ID 不变，源码 1.1.19；Prompt CRUD、只插入不发送及去导航化继承既有实现 | Prompt owner；**只读** |
| `examples/sidebar-tools/prompt-shortcuts/prompt-shortcuts.opendesk-tool.json` `1b034f05` | 唯一正式包 1.1.18，尚未从 1.1.19 同源晋升 | Prompt 包 owner；**只读** |
| `scripts/bundle-provenance.mjs` `d33e847c` | Prompt `trusted/model.js` pin 已与当前 Blob `73049611` 相同；共用 Scroll `conversation.js` pin **仍为** `cca839ec...`，实读文件已是 `ea1dcb31...` | 共享固定构建来源 owner；**只读，不擅改锁** |
| `examples/programs/chatgpt-jump-top/package.json` `49195991` | 新 ID、0.4.0；三站五项导航已由先前 owner 实现 | Scroll owner 已交付；**跳过重做** |
| `examples/programs/chatgpt-jump-top/ai-scroll-navigation.opendesk-page.json` `3d120ce0` | 新 ID 0.4.0/r1 已提交；sourceHash `7e7f8377...`，packageHash `7500942d...`，CI 重建同字节证据可复用 | 已释放；**不重建无变化的输入** |
| `examples/programs/chatgpt-mindmap/package.json` `074837c0` | 新 ID 0.2.7；Viewer Theme、共存保护已有身份增量及测试 | Mind Map owner；**只读** |
| `examples/programs/chatgpt-mindmap/assets/` | 仅 `ui.css`；没有经准入的 `xmind-runtime.js`，也没有新 ID 正式 Page JSON | `BLOCKED_LICENSE`，不能拿预览资源假冒 |
| `examples/programs/chatgpt-send-queue/package.json` `723a6eb5` | 0.1.2，旧 ID `opendesk.chatgpt-send-queue` | R4/R5.1 Send Queue owner 最近仍提交；**OWNED_ELSEWHERE** |
| `examples/programs/chatgpt-send-queue/src/main.js` `fe49b004` | 生命周期函数及 `programId` 仍为旧 ID；FIFO/未知发送保护未因本轮修改 | **OWNED_ELSEWHERE** |
| `examples/programs/chatgpt-send-queue/opendesk.chatgpt-send-queue.opendesk-page.json` `ee065e0a` | 旧身份 0.1.2/r4 正式包保留；新 `ai-send-queue.opendesk-page.json` 不存在 | **OWNED_ELSEWHERE** |
| `official-pages/sources.json` `50f9bd4b` → `73e77a41` | 三 Page ID/网站/版本/发行状态不变，只修复 Send Queue 对用户显示的过时阻塞原因 | R1.2.4 **RELEASED**；本轮安全最小写入完成 |

Owner 历史记录不等于实时锁；也不能因 R5.1 最新提交就宣称 owner 已释放。并行不同文件仍可推进，重叠文件只提供补丁合同。

## 本轮实际源码/发行合同增量

提交 `9159c1116a3907852c144b9fc0071a0d08dc742c`：

- 唯一改动 `official-pages/sources.json` 的 Send Queue `blockedReason`，移除过时的“R4.8 业务 owner”描述，改为准确告知新身份缺失、必须由业务 owner 交接并独立打包、旧 Authority 不可迁移。
- `programId`、`version`、`revision`、`packageFile`、`sites`、`installationPolicy`、`publication=blocked` 和其他两项 Page **均没有更改**。
- GitHub Contents API 使用旧 Blob SHA 进行 CAS 写入；写后重读 JSON 和新 Blob。**没有**增加安装权限，没有产生可安装 Queue 包，也没有改 FIFO engine、网页适配、皇冠资源、三条默认显示或任何来源哈希。

## P0：Send Queue owner 的精确迁移合同（本轮未执行）

**前提**：Send Queue owner 明确释放具体文件和正式包产出槽；重新读取最新 HEAD/Blob，包含 R5.1 以后对皇冠及预览的增量，不能覆盖。随后在原业务目录：

1. `package.json`：`opendesk.id` 从 `opendesk.chatgpt-send-queue` 改为 `opendesk.ai-send-queue`；npm 可读名称相应调整，保留 0.1.2 和 ChatGPT-only USER_SCRIPT。
2. `src/main.js`：`const ID` 从旧改新。生命周期 `createPageUI({id:ID+'.lifecycle', ...})`、skipped 和 active 返回的 `programId` 随同一常量变化；逐项只读查找其他与旧 ID 安全绑定的字段。
3. 仅补必要身份/Authority/卸载/存储边界测试；**不**改 `engine.js` FIFO、DOM reply gate、草稿/IME/附件、`site.js`、`view.js`、皇冠 CSS/WebP 或三条默认展示。
4. 保留旧包字节，使用既有 `build-program-project.mjs`、`build-page-install-package.mjs` 对新身份新文件 `ai-send-queue.opendesk-page.json` 生成 revision 1；核对真实 sourceHash/packageHash、精确网站和正式字节；Node/CI PASS 后仍需独立 Chrome 安装与权限审阅。
5. 旧 Page 安装不升级为新 ID、不搬旧 Queue memory-only 内容、不继承旧 Authority；unknown-click 的消息无条件**不得**自动重播。

**禁止**在取得交接前用外部会话直接修改 Send Queue 业务文件或覆盖正式包。

## P1：Prompt 1.1.19 正式发行合同（未执行）

`tool.config.json`=1.1.19、正式包=1.1.18。可信 `model.js` 的现行 Blob `730496110c2ebc316eb74e1c29ac66dc74d60561` 已等于 `bundle-provenance.mjs` 对该路径锁定值，不重做它的 pin。

另有精确来源差异：`examples/programs/chatgpt-jump-top/src/conversation.js` 现 Blob `ea1dcb3114175c2b79e134df1794a1fdd93460c9`，构建来源锁仍为 `cca839ec6625da106376fb739f4462c44f39fa5b`。本轮对两个 Git Blob 做行级 LCS 对比，共八处差异：新增旧 Page 活体生命周期保护、新 DOM own 标记、按钮/点击 owner 检查和 MutationObserver peer 变化处理；未发现增加站点、权限或发送动作。这是**静态差异资料而不是审计批准或构建 PASS**；必须由固定构建 owner 重读完整源码、审阅精确锁及运行相关门禁，不能无审阅直接替换 SHA。

Prompt 包 owner 在可信来源、源码及 CI 门禁确认后，按原 `scripts/build-sidebar-tool.mjs` 输出临时候选、运行受影响测试，用同一 builder 的 `--promote-from` 晋升、`--check-project` 写后验证；失败继续保留旧包，不能直接编辑 135KB 的正式 JSON。新用户默认预装由 R1.2.4 已交付，真实 Mac 用户数据/图片/站点设置须在同 ID 更新时读回。

## P2/P3：Mind Map 与 Scroll 的准入

Mind Map：`tests/xmind-license-review-r396.json` 实读 `status=BLOCKED`、`redistributionApproved=false`，实际资源只有本地预览用的历史四个固定来源；`scripts/audit-runtime-license.mjs --require-approved` 设计上仍明确拒绝未批准再发行。没有许可方/合规审批与生产资源准入，不构建新 Page 包，也不使用空资源或旧包绕过。

Scroll：R1.2.4 的 0.4.0/r1 新身份正式包不重建；历史 CI 收据 [40224870077](https://github.com/shopable-ai/opendesk-browser/actions/runs/40224870077) 同源再生成字节一致，但**不证明**最新 Mac 已安装。官方目录继续 `blocked`，等待真实安装、三站批准、禁用撤权、重启、卸载、升级和新旧 ID 实例管理读回。

## 最新相关 CI 分类（不能继承旧失败）

以核查起点 `00b42463` 的 Actions 为准：
- [40227594664](https://github.com/shopable-ai/opendesk-browser/actions/runs/40227594664) App CI 为 success，但发现/验证的项目是 Knowledge Answers；**不能转作四产品 PASS**。
- [40227594652](https://github.com/shopable-ai/opendesk-browser/actions/runs/40227594652) r3-package step 失败；297 PASS / 8 FAIL，主要涉及 Page/Sidebar UI 文案、当前页 Draft、Task Dock 等旧断言/其他 owner 功能；本轮未触碰对应文件，`UNRELATED_FAILURE / OWNED_ELSEWHERE`。
- [40227594699](https://github.com/shopable-ai/opendesk-browser/actions/runs/40227594699) Sidebar 工程 job 19 PASS / 1 FAIL，失败项 `browser.siteBudget.getStatus`，非四产品源码的直接回归证据。
- [40227594721](https://github.com/shopable-ai/opendesk-browser/actions/runs/40227594721) 市场 job 中出现 `E_TOOL_STAGE: required project file missing: dist/tool.css` 及历史 `git show 4a67583db` 不可读，属独立 fixture/历史对象问题；不得据此改 Prompt 包或 XMind 资源。
- 本轮只运行 GitHub 远端源码/Blob/Actions 日志的**实读与静态 JSON 检查**；没有在用户 Mac 或本会话完整 Node 仓库运行任何测试；相关新提交 CI 必须按实际 job 结果再次归因，不能假设 PASS。

## 退出门槛、资源与唯一下一操作

四产品业务框架和历史源码已复用，但 **R1.3-LOCAL 退出门槛未满足**。原因：Queue 新 ID 源码和新正式包尚缺、Prompt 正式包未对齐、Mind Map 再分发审批仍阻塞。Scroll 的原生测试本身是本地阶段事项，不应倒灌到网页业务重做。

本会话没有打开 Mac 本地工作区、Chrome/Profile、watcher/dist 发行槽、Git 索引或其他会话浏览器；GitHub `main` 的写入只有上述 blockedReason 和本独立记录。没有改分支、Worktree、PR、强推或覆盖他人代码。写入范围现 **RELEASED**；源码 owner 文件仍为 **OWNED_ELSEWHERE**。

**唯一优先下一操作**：由 Send Queue 当前业务 owner 明确接收本节 P0 精确身份迁移合同，在 R5.1 及后续最新业务基础上交付新 ID 源码、独立正式 Page 包与定向 Node/CI 证据；Prompt 发行 owner 可按 P1 并行修复已证实的 provenance 及正式包差异。XMind 由资源许可权责方处理，不将审批问题交给 Mac Codex 用代码绕过。

正式产品八维评分全部 `NOT_SCORED`：没有新四 ID 完整 Node/CI、原生安装及许可通过的同一候选证据；有效项 0/8，平均分不计算。静态实施质量和真实产品通过率必须分开。

## 本轮提交的后续真实 CI 收据（非 Mac 原生验收）

官方四产品定向工作流 [40275412022](https://github.com/shopable-ai/opendesk-browser/actions/runs/40275412022) 精确绑定本轮 blockedReason 提交 `9159c1116a3907852c144b9fc0071a0d08dc742c`：

- `contract` job `121417011091` 为 success：`npm run pretest`、`node --test tests/environment/official-page-catalog-r124.test.mjs tests/environment/extension-center-official-pages-r124.test.mjs ...` 输出 **17 tests / 17 pass / 0 fail**；`node scripts/build-official-pages.mjs --out ...` 通过，blocked 目录没有开放安装。
- `scroll-candidate` job `121417135615` 为 success：同一新 ID `0.4.0/r1`，sourceHash `7e7f8377447e176cf9fa3bed1848f9e6979af7143e10279ad1fc15bcbec5a9bd`，packageHash `7500942dc0c2115f80a14342ccabc1031f23b47e5ead7b71547f4842844a3d4a`；日志 `SCROLL_SOURCE_REBUILD_AND_FORMAL_PACKAGE_EQUAL 45511`。
- 此回执仅证明**本次发行文案修复未破坏官方发现及 Scroll 同源正式包**，不证明 Queue 新身份、Prompt 1.1.19 晋升、XMind 许可或真实 Chrome 安装。其他流水线失败仍须按 owner/输入归因，不转借通过。

后续另一个 Send Queue owner 提交 `596b4e53d8016e52543453f5e4883abb9a1d0161` 修改皇冠图片、CSS、预览及两项皇冠测试；新身份文件 `package.json` 仍为旧 ID，说明迁移 owner gate 继续生效。R1.2.5 仍未触碰此目录。
