# OpenDesk 网页剪藏区域点选 R4 · 构建阻断差量修复及发布证据

- 任务 ID：`OD-WEB-MARKDOWN-CLIPPER-REGION-PICK-R4-LOCAL-RELEASE-ACCEPTANCE`
- 截止本记录：2026-11-12；**PARTIAL / RELEASE_BLOCKED / REAL_CHROME_NOT_TESTED**。
- 原始目标：在 ChatGPT/Claude/Gemini 的一条长回答上悬停高亮、单击一次提取该条当前已加载 DOM，自动得到 Markdown 并回填；复用复制、下载、我的摘录保存/关闭重开/搜索/全文读回。同 ID 原位升级，保留旧摘录及文章/选区/引用/链接四模式。
- 本记录只收集 R4 新增证据，不重复实现 R2/R3。R2/R3 历史证据见 `region-picker-r2-acceptance.zh-CN.md` 与 `region-picker-r3-acceptance.zh-CN.md`。

## 一、本轮 GitHub 实际修复

| 提交 SHA | 修改 | 源码审阅依据 | 当前验证 |
| --- | --- | --- | --- |
| `143fb1055b5281eea4fb0f778feb7cd62cc75598` | `scripts/bundle-provenance.mjs` + `tests/environment/bundle-provenance.test.mjs` | CI 失败 `agents/chatgpt-fixed-bridge.js` 引入已固定哈希的纯 WebFlow 协议解析器；只增加该固定 Content 目标的准入，原 SHA `50a7ec4...` 与其他世界拒绝条件不变 | 远端文件已读回；当轮 App CI 在随后构建步骤继续失败，不能称全构建 PASS |
| `c13070f68b49cc1b438d7a408dee785404051d71` | `tests/environment/four-tools-ux-r1.test.mjs` | 修正 `examples/...` 过期路径；为 Clipper 现有区域 Mock 补充无副作用的最小 DOM 夹具，替代原先 `document.createElement is not a function` | GitHub Preview CI 的四工具契约 **10/10 PASS**；其他预览/Headless Chrome 步骤失败 |
| `cfc6e232ac074be656a5af8bacacc30e6f351fd3` | `scripts/bundle-provenance.mjs` + `tests/environment/bundle-provenance.test.mjs` | 旧固定 `policy.js` 只允许文章/选区/链接；现代码新增 `clip.region`/取消。Page 新增一键点选/授权复核/清理；`region-picker.js` 为 DOM-only。按实读 Git Blob 分别锁定 `policy.js=9cb4b8af...`、`page.js=46bb1a7b...`、`region-picker.js=c2a7b9b1...`，只将区域 DOM 源准入既有 Page Relay | 远端代码和回归断言读回成功；完整 CI 构建结果仍待取得 |

三个修复均通过 GitHub `main` 上的提交和源码读回确认；未修改网页剪藏 `src` 业务代码、工具 ID、权限或存储。上述哈希缩写是 **Git Blob SHA-1**，不是可发布包 SHA256。

## 二、真实故障与 CI 回执

1. **R3 App CI**：`43063288849` / Job `130813313830`；构建在 `chatgpt-fixed-bridge` 报 `Historical/user/vendor code cannot enter a privileged fixed bundle: projects/webflow/src/task-intent-contract.js`，退出码 **1**。新提交 `143fb105` 已修改精确准入及正反测试。
2. **R4 修复后 App CI**：`43217950090` / Clipper Job `131182365436`；构建向后推进，在 `marketplace` 报 `Trusted Web Clipper source changed ... projects/web-markdown-clipper/trusted/policy.js`，退出码 **1**。新提交 `cfc6e232` 已在审阅后补齐三份 Clipper 固定来源锁及回归，但**当时尚无该提交的绿灯结果**。
3. **R4 Preview CI**：`43218322123` / Job `131183150836`，`tests/environment/four-tools-ux-r1.test.mjs` **10/10、0 failed**；同一 Job 的 Headless Chrome 后续失败：`Import replace confirm was not displayed`（涉及四工具交付测试，不可当作 Clipper 真实 Chrome 失败）。Job 最终退出码 **1**。
4. **独立预览新鲜度阻断**：同运行的 Job `131183150246` 报 `E_UI_PREVIEW_LOCK: stale preview input src/ui/design-tokens.css`，退出码 **1**；需由共享 React 预览源码/锁 owner 生成并审阅，不得仅替换哈希制造 PASS。
5. **跨工具来源差异**：`43217950312` / Job `131181881891`，公共来源测试报 `Trusted AI Proxy source changed; review and re-pin: projects/ai-proxy/src/Settings.tsx`，并存在其他旧示例路径断言失败。**未将其错误归因到 Clipper，也未为本任务改 AI Proxy 来源锁。**
6. 修复 `cfc6e232` 触发的 App CI Run `43219105290` 在本记录读取时仍为 **QUEUED / 部分任务未完成**；未把排队视为通过。

GitHub Actions 具体证据：
- https://github.com/shopable-ai/opendesk-browser/actions/runs/43063288849
- https://github.com/shopable-ai/opendesk-browser/actions/runs/43217950090
- https://github.com/shopable-ai/opendesk-browser/actions/runs/43218322123
- https://github.com/shopable-ai/opendesk-browser/actions/runs/43217950312
- https://github.com/shopable-ai/opendesk-browser/actions/runs/43219105290

## 三、门禁、发行和 Chrome 状态（不要混淆证据等级）

| 任务 | 截止状态 | 证据/限制 |
| --- | --- | --- |
| T01 本机工作区 | **BLOCKED** | CodexPro `UNAVAILABLE / Connection failed`；OpenDesk Mac96 `HTTP 429`；无法读取本机 HEAD/未提交修改。隔离环境 GitHub DNS 解析失败，不能冒充本机。 |
| T02 代码与 Host/Node/App CI | **PARTIAL** | 根因日志和三项最小修复已实际完成；Node 原生指令未在本机运行，GitHub 新提交 App CI 尚未取得 PASS。 |
| T03 React 同源预览 | **PARTIAL** | 现有四工具 SDK Mock 合同 10/10 PASS；源码锁失败，宽度/暗色/区域交互矩阵和真实安装尚无证据。 |
| T04 ChatGPT、Claude、Gemini | **NOT_TESTED** | 无网页真实点选、旧回执、撤权、流式及容量边界的 Host/Chrome 回执。 |
| T05 新版本与晋升 | **BLOCKED / NOT_DONE** | `tool.config.json` 与唯一正式包均为 `web-markdown-clipper@1.2.10`；未升版本、未创建验收候选、未执行 `--promote-from`、`--check-project`。**候选包 SHA256：N/A；正式新包 SHA256：N/A。** |
| T06 Chrome 同 ID 升级与存取闭环 | **BLOCKED / NOT_TESTED** | 未验证旧摘录保留、保存→关闭重开→搜索→全文读回哈希一致。不可用模拟 Mock/Headless Chromium 替代。 |

## 四、三项反方攻击与角色化静态评分

- 多轮混入：`region-picker.test.mjs` 已有目标容器隔离断言；**ChatGPT/Claude/Gemini 真实长对话仍 NOT_TESTED**。
- 取消/导航/撤权竞态：源码存在 session.cancel、授权 epoch 和页面销毁清理；**真实 Host 迟到回执/实际导航仍 NOT_TESTED**。
- Markdown 与字节容量：生产逻辑沿用转换器与存储限制；**150KB 提取、160KB 保存、复杂代码/表格/公式的真实字节验收仍 NOT_TESTED**。

以下为 5 个角色**分别**依据本轮有限实证给出的阶段性保守评估，不冒称外部独立专家或正式 Chrome 通过：UX **68**（真站、键盘/窄屏未验证）、架构 **78**（构建依赖与来源链已修但 Host 未验）、Markdown **63**（格式和边界缺读回）、安全 **76**（精确 SHA/目标围栏已加强但相关 CI 未全绿）、QA **43**（Mock 合同 10/10，其他构建及用户 Chrome 未通过）。

算术平均：`(68+78+63+76+43)/5 = 65.6 / 100`；**低于 95，不可关闭 R4**。所有未测项必须继续扣分。

## 五、下一次最小续接点（不是新任务/R5）

在允许执行的现有 Mac `main` 工作区读取最新 HEAD 和未提交差异，保护并行修改后，仅核对本轮已修的构建来源是否通过，按新 CI 日志修确有证据的剩余阻断。然后运行 Clipper/Host/预览真实测试并记录退出码；共享 AI Proxy pins 与 UI Preview lock 需原 owner 审阅。全部门禁通过后，才按原打包器合同提升高于 1.2.10 的版本、产生候选、验证 SHA256、晋升并逐字节检查；在真实用户 Chrome 同 ID 原位升级，实测单条长回答→Markdown→复制/下载→保存→关闭重开→搜索/全文读回，并核对原有摘录。取得截图、正文 SHA256、安装回执、版本与 5 角色平均分 ≥95 后才可写 **YES / R4 CLOSED**。

## 五、R4 续接实证：修复 Native Settings Workspace 来源边界（2026-11-12）

- 本轮继续任务 `OD-WEB-MARKDOWN-CLIPPER-REGION-PICK-R4-LOCAL-RELEASE-ACCEPTANCE`，执行基线 GitHub `main=f590505b84e13b0ac2d7789db7c4bedfb62d21aa`；本轮实际源码提交 `3e1a68431a71e2c449c9cbf29da2d9c405fe1f2f`。该提交通过带预期 HEAD 的非强制前进引用更新写入唯一 `main`，并从远端读回两份修改文件。
- 新取得失败日志：App CI `43219105290` / Clipper Job `131186337612` 在提交 `cfc6e232` 上实际执行 `node scripts/app-ci.mjs build web-markdown-clipper`，`npm run build` 子进程因 `[opendesk-fixed-settings] Historical/user/vendor code cannot enter a privileged fixed bundle: projects/webflow/src/task-intent-contract.js` 失败，退出码 `1`。证明前轮修复并未完成全工程构建。
- 静态依赖追溯：固定 `src/entrypoints/settings.js` 引入 Native Workspace，沿 `src/ui/react/workspace/main.tsx` → `src/native-agent/workspace.js` → `workspace-chat-edit-ui.js` → `workspace-chatgpt.js` → `chatgpt-task-request.js` 间接引入 WebFlow 纯结构校验器；同一 Workspace 读取器引入 `projects/webflow/trusted/chatgpt-conversation-route.js`（只拒绝冲突路由，不产生 Task 授权）。两份内容已有精确 Git Blob SHA-1 锁：`50a7ec4bd3d8707ba53724efdc378cd98c2404d6` 与 `8e28adedd8cc2b49ff34897c0857d33cf2478c87`。
- 修复范围**仅两文件**：`scripts/bundle-provenance.mjs` 为上述**两份**固定字节源码在**唯一新增输出** `native-agent/settings.js` 精确准入；`tests/environment/bundle-provenance.test.mjs` 更新 WebFlow 解析器正反目标列表，并添加 deny-only route 的允许/禁止目标检查。未添加通配允许、未改变哈希、安全扫描、权限、安装器、Clipper ID、存储或业务 UI。
- GitHub 新提交触发 CI：`43226868275` 的 `audit` Job `131212185601` **FAIL，退出码 1**；实际错误主要为共享 `projects/ai-proxy/src/Settings.tsx` 可信哈希过期、Bookmark 旧目录测试路径及 Reading TOC 等其他来源差异；本次新增的两个 `describeBundle` 测试也被前置的 AI Proxy 来源校验阻断，**不能标为 PASS**。另一工作流 `43226868689` / Job `131212186890` 同样 **FAIL**，原因含上述跨工具问题；未擅自将其归因于 Clipper 或放宽安全检查。
- 新 App CI `43226868089`（基于本轮提交）当时 `discover` 和 `ci-contract` 已成功，但 `app-validate (web-markdown-clipper)` Job `131212628757` 仍为 **QUEUED / NOT_TESTED**，后续必须读回真实结果，不能把队列等于成功。
- 本机 CodexPro `UNAVAILABLE / Connection failed`；OpenDesk Desktop 与本机文件接口均 `UNAVAILABLE / MCP SSE probe 429`。没有用户工作区 `git status`、真正本机 Node、用户 Chrome 同 ID 原位升级或长回答保存读回证据。
- 正式工具配置及正式包依旧 `web-markdown-clipper@1.2.10`；旧正式包 HTML 尚只有四种模式。新候选构建、`--promote-from`、`--check-project`、正式新包 SHA256、Chrome 回执与 Markdown 正文哈希均为 **N/A**；**RELEASE_BLOCKED / REAL_CHROME_NOT_TESTED**。
- 评分保守沿用 R4 静态阶段：UX 68、架构 78、Markdown 63、安全 76、QA 43，算术平均 `65.6/100`，不是新的独立外部专家评级。多轮隔离、取消/导航竞态、150KB/160KB 字节边界依然缺真实 Chrome 验收。
- 下一有效续接：先读 `43226868089` 的 Clipper Job 实际结果；仅根据当前 SHA 的实测故障做差量修复，并让共享来源锁对应 App owner 审阅。完全门禁可证后才提升版本、构建候选/核验/晋升，并在用户真实 Chrome 验证原位升级、旧摘录保留、长回答 Markdown 保存及关闭重开读回。**禁止本轮提前关闭 R4**。

### R4 续接 CI 完成结果（Run 43226868089）

- 真实 App CI 的 `app-validate (web-markdown-clipper)` Job `131212628757` **completed/failure**；`Compile App and build a source-identical, unpromoted candidate` 步骤 **failure**，底层 `npm run build` 退出码 `1`；后续 Node/Browser 步骤 skipped。
- 在该提交 `3e1a68431a71e2c449c9cbf29da2d9c405fe1f2f` 的构建日志里，WXT **第 34/44 个 settings 目标已越过**，未再触发先前 WebFlow parser/route 来源拒绝；**第 40/44 个 tool-shell** 报 `Trusted extension settings source changed; review and re-pin before fixed build: projects/ai-scroll-navigation/trusted/ai-configuration.js`，导致本轮首次可见构建失败。
- 核查当前远端：`scripts/bundle-provenance.mjs` 对上述 AI Scroll 来源使用 reviewed Git Blob SHA-1 `ecec6df2621355503c26d0e24eaae4f84db99699`，而该源 Git Blob SHA-1 实际为 `c97137a3a871fb6c19fd3594fc627fafd67d03f8`；这是**独立 App 的来源锁差异**。需其所属代码 owner 审阅改动、负向校验及相关门禁后再处理，不得在 Clipper R4 中自动替换哈希或放宽全局权限。
- 因全构建仍未通过，不能将 settings 阶段通过上升为 Clipper App CI PASS；没有候选包、晋升、真实 Chrome、正文哈希或旧摘录保留的新证据。发布状态保持 **PARTIAL / RELEASE_BLOCKED / REAL_CHROME_NOT_TESTED**，专家阶段均分仍是 `65.6/100`，未达到验收线。

## R4 差量续接：2026-11-12 三次修复与共同构建

**任务仍为** `OD-WEB-MARKDOWN-CLIPPER-REGION-PICK-R4-LOCAL-RELEASE-ACCEPTANCE`。本轮只是续接 R4 并补记实证，不重新开发 R2/R3 的第五种区域模式，也不创建 R5/R6。原始最终目标不变：在 ChatGPT/Claude/Gemini 的长回答上单击一次，只抓取当前已加载的**该条** DOM，自动生成 Markdown 回填侧栏，完成复制/下载/「我的摘录」保存、重开搜索全文；同 ID 原位升级不丢旧摘录，保留四种既有模式。

### 本轮实际已提交，全部在唯一 main

| Git 提交 | 差量改动和源码审阅 | 实测与证据限制 |
| --- | --- | --- |
| `ab7e20007790c32d890f51eeeeb31f6407a4ad83` | 两文件：`scripts/bundle-provenance.mjs`、`tests/environment/bundle-provenance.test.mjs`。审阅 AI Scroll 的 `ai-configuration.js`、`react-controls.tsx`、`host-localization.js`：仅显式轮次翻页/计数与文案；3 份精确 Git Blob 来源锁更新，原有唯一 tool-shell 准入目标不放宽；增加负向目标、字节篡改、symlink 测试。 | AI Scroll 专项生产 CI [43233025465](https://github.com/shopable-ai/opendesk-browser/actions/runs/43233025465) **SUCCESS**；来源测试单项 PASS。 |
| `feeb7f0e6922707d8a137065137c162bf224e108` | 两文件：`projects/ai-proxy/trusted/source-lock.json`、`tests/environment/bundle-provenance.test.mjs`。通过 Git tree 比对 63 份锁，精确审阅其中 8 份失配（设置、诊断、en/zh-CN/zh-TW、3 CSS），分别属于 UI、禁用生产模拟诊断、文案和布局，未新增远程 CSS/权限；仅更新这 8 个 Blob；增加字节变化与 symlink 负向测试。 | 新 8 源锁测试 PASS；共享来源 CI [43235522642](https://github.com/shopable-ai/opendesk-browser/actions/runs/43235522642) 全程 **FAIL，52 项 40 PASS /12 FAIL**，余项有 Bookmark、Reading TOC、Time Review 与旧归属断言，不可称全绿。 |
| `54f0e7e9fa62c062c1c4e7f9a4c0db2b03b349ac` | 五文件：`examples/shared/markdown/convert.js`、`scripts/bundle-provenance.mjs`、`tests/environment/bundle-provenance.test.mjs`、`tests/environment/markdown-tools-r22.test.mjs`、`projects/web-markdown-clipper/tests/notes.test.mjs`。修复真实 UTF-8 边界缺陷：原先检查正文 150,000 字节**之后**追加换行，可能返回 150,001；现先构成最终 Markdown 再按精确 150,000 字节检查，越界直接报错不截断。审阅并更新单份转换器 Blob 锁 `58516382e28fc03b89b58371f9b905d89e05ae27` → `53687ae72643aa751c1ad0d5becf2401ada09bd0`。新增中文多字节 149,999+换行准确通过、150,001 拒绝、160,000 保存读回测试。 | Markdown CI [43235522980](https://github.com/shopable-ai/opendesk-browser/actions/runs/43235522980) 新 150KB 单测 **ok 8 PASS**；独立 Subagent 现场 [upstream-clipper-tests.tap](../../subagent/evidence/trusted-closure-r2-20261112/node/upstream-clipper-tests.tap) 包含本条与原来源测试 2/2 PASS。160KB 新保存测试尚无单独可归属的完成回执。Markdown 整体验证仍 FAIL，原因含正式 1.2.10 与新源码字节不等、其他 Markdown Workbench 旧版本断言。 |

这三次源码修复均通过 GitHub 带预期 HEAD 的非强制 main 引用更新提交并读回；没有改 Clipper 的工具 ID、Chrome 权限、历史数据、正式安装包或原有四模式。

### 构建阻断真实推进：逐次 CI，不用旧错误猜新 HEAD

1. `ab7e200` 的 Clipper App CI [43233026069](https://github.com/shopable-ai/opendesk-browser/actions/runs/43233026069) / Job `131233411338`：WXT 40/44 前 AI Scroll 来源失配已消失，改为 AI Proxy `zh-CN.json` 来源失配，构建 **exit 1**；由后续 `feeb7f0` 审阅修复。
2. `feeb7f0` 的 Clipper App CI [43234997494](https://github.com/shopable-ai/opendesk-browser/actions/runs/43234997494) / Job `131240175396`：8 份 AI Proxy 新来源锁已越过；WXT 40/44 出现真正新阻断：`ui/tool-shell.js=3,148,216` 字节，原预算 `3,145,728`，**超 2,488 字节，exit 1**。
3. `54f0e7e` 的 Clipper App CI [43235522167](https://github.com/shopable-ai/opendesk-browser/actions/runs/43235522167) / Job `131242636511`：再次 **exit 1**，相同 `3,148,216 > 3,145,728`；build 失败，后续 Node/Chromium **skipped**（不算 PASS）。
4. **发现并保留并发真实成果**：另一执行者将 main 从 `54f0e7e` 非强制推进到 `cacb9c1d4f13e5ccc2c37007f644db86eb621e0b`，主要为 Subagent + 共享构建。它新增`scripts/pinned-public-suffix-raw.mjs` 与 `wxt.config.mjs` 的**精确锁、仅 tool-shell 生效**的 Public Suffix List 原始文案压缩；保留 10,336 条规则和许可，原数据、消费者及容量预算均未改变。[专属审阅记录](../../subagent/evidence/trusted-closure-r2-20261112/webflow-audit/pinned-public-suffix-review.json) 及 [生产构建回执](../../subagent/evidence/trusted-closure-r2-20261112/build/browser-production.json) 实际记录 `status=passed`、`sourceDriftDuringBuild=[]`、工具壳**2,954,732 / 3,145,728 字节**，余量 **190,996**。这是**并发本地源锁构建的实证**，不是最新 GitHub Clipper App CI 全门禁成功。防止跨任务重复进行同一压缩。
5. 并发提交 `cacb9c1` 的新 [App CI 43237030716](https://github.com/shopable-ai/opendesk-browser/actions/runs/43237030716)：本账本核对时 `discover QUEUED（当前尚未创建 Clipper job）`，不能在没有本次组合的实际 Clipper job 时把上一个失败自动改成成功。固定入口优化独立 [43237030172](https://github.com/shopable-ai/opendesk-browser/actions/runs/43237030172) 的定向优化 30/30 PASS，但工作流整体因**另一个 Subagent Task 存储作用域**断言失败（227/228）而 FAIL，归其负责人，不能删断言。

### 发布、用户实机与反方攻击：仍未关闭

- 到本账本的源码复核，`projects/web-markdown-clipper/tool.config.json` 版本仍是 **1.2.10**，原正式包也仍是仅四模式；未提升合法新版本、未执行新版本 `--out` 合法候选的全部验证、`--promote-from`、`--check-project`。**正式新版 SHA256=N/A；新候选 SHA256=N/A；用户升级回执=N/A。** CI 失败任务上传的证据 ZIP 不是正式候选。
- CodexPro 本机连接 **UNAVAILABLE / Connection failed**；OpenDesk Desktop Mac96 **HTTP 429**，本轮只重查一次、未反复连接。未读取本机未提交差异，也未取得用户 Chrome 实机、安装旧摘录、正文哈希与截图。**ChatGPT、Claude、Gemini 的真实长回答单击/复制/下载/保存/重开/搜索/全文/原位升级全部 NOT_TESTED**。Headless Chromium、DOM Mock、Linux CI 不能代替。
- 反方一，多轮 A/B 回答误选：既有 DOM 模拟/分区源码，三站真实 **NOT_TESTED**。反方二，取消/Esc/导航/撤权/旧回执竞态：既有 session/epoch 源码与模拟，真实 Host **NOT_TESTED**。反方三，复杂 Markdown 与容量：新 150,000 UTF-8 精确边界 Node 单测 **PASS**；160,000 保存回读新测试已提交，单独回执 **NOT_TESTED**；代码块/表格/公式和正文 SHA256 真站读回 **NOT_TESTED**。
- 五角色**分别根据当前实证独立保守评分**，非冒称外部专家：UX **68/100**（真站/窄屏未测）；浏览器架构 **80/100**（精准接线/来源审阅但 App 完整 CI 未验）；Markdown **72/100**（150KB 精确边界 PASS，全文实机/保存未测）；安全 **81/100**（来源锁+负向测试 PASS，其余共享门禁有 FAIL）；QA/发布 **49/100**（补齐确切 CI 证据但 App 的 build/node/browser/native、候选发布及原位升级未通过）。**算术平均 (68+80+72+81+49)/5=70.0/100**，低于 95。
- 唯一剩余差量：检查 `cacb9c1` 同源新 App CI 是否真正通过工具壳预算与 Clipper 专属 build/node/browser，补足来源/预览其余实际必要门禁与 UTF-8 保存测试；若有真实成功复用不重复执行。全部通过才 bump **>1.2.10**、可信 --out 候选 SHA256、--promote-from 晋升和 --check-project；最后用户本机真实 Chrome **同 ID 原位升级** 保留旧摘录，在 ChatGPT/Claude/Gemini 完成一次单条长回答剪藏→复制/下载→保存→关闭重开→搜索→全文哈希一致并留截图，五角色均分 >=95。此前只能 **PARTIAL / RELEASE_BLOCKED / REAL_CHROME_NOT_TESTED**，不能宣布 R4 CLOSED。

