# OpenDesk Browser Conversation R1.5 · WEB_PARTIAL 交付账本（2026-10-21）

## 原始产品目标（继承 R1.0–R1.4）

用户始终看到并可操作原版 Bookmark Manager：底部共享可信 React Chat Dock 输入“创建 AI 工具文件夹”，复用 Workflow Provider 输出受限操作提议，经 Bookmark Service 与 Chrome SDK/Host 写入、逐步读回确认，并在原书签树即时展开/定位新节点；连续输入“把当前网页收藏进去”严格使用上一轮读回确认的 folderId。将来可复用 Dock 到适合的其他工具，但首期**不迁移**自定义 HTML/JS、React/Vue sandbox，不新增 Chat iframe、第二 Root、Provider、执行引擎或跨工具全局状态。

## R1.5 实施内容（提交到 main，未经实际运行验证）

- **P0-1：真实读回联动。** Bookmark App 的已核实 step.id 扩展祖先并定位树节点；含虚拟滚动补偿。不覆盖 AI 请求发出后用户自行更改的选择、搜索与滚动；此时在原界面展示“查看新项目 / 清除搜索并定位”。有效节点来源只允许 Service 读回结果。当前页 URL 按 HTTP(S) 标准形式归一，以免写入成功却因缺少尾部斜杠误报 UNKNOWN。
- **P0-2：撤权与迟到响应。** 原 Workflow Provider 继续负责模型推理；当前会话拥有独立 AbortController 和代际校验，HTTPS 与 Native 授权在每个业务写入前重新检查，权限移除时及时中止提议。App 在完整业务回合 finally 中 release。单独使用 `E_MODEL_GRANT_REVOKED`，不能误当成 Chrome Bookmarks Host 权限失效而清空原树。已发出写入必须以读回判断，UNKNOWN 不重放。
- **P0-3：交互兼容。** Dock 开关在业务写入期间仍可使用；共享 React 表单增加 Composition 生命周期与 keyCode 229 保护，避免中文输入法 Enter 误发。保留旧界面挂载、Sheet、滚动、Stop、键盘分隔线、浅/深色 Tokens 和用户草稿。
- **P0-4：测试源码。** `tests/environment/opendesk-conversation-r15-closeout.test.mjs` 新增真实 executor 的离线确定性测试，覆盖已核实的父子 ID、URL 归一、写前失权、部分成功后的失权、Abort 和已发出但回执未知；原 `opendesk-conversation-r14-dock.test.mjs` 回归断言对应授权新调用链；`preview/react/conversation-r13-chrome.mjs` 增加真正 React DOM + 离线 SDK 的两轮点击、过滤状态定位场景。
- **P0-5：同源预览输入修订。** `preview/react/src/main.jsx` 仅扩充受控离线意图；`preview/react/build-preview.mjs` 扩充共享 React Button 的 SHA 输入指纹，并准确区分 production App + Dock 同源和旧预览壳非同源。正式候选输出仍为**被忽略的** `preview/dev.html`；旧 `preview/index.html` 不自动替换。此 Web 环境无完整仓库/npm/Chromium，**未实际生成 dev.html**。

## 证据分级与当前结论

| 门槛 | 状态 | 本轮可核实事实 |
| --- | --- | --- |
| 最新 main 源码连接和定向提交 | PARTIAL | 已经经 GitHub 连接读取并在唯一 main 更新；提交 SHA 以 Git 历史为准 |
| P0-1 新节点定位与虚拟滚动 | PARTIAL | 已提交 React 源码与 Chromium 用例，未实际渲染测试 |
| P0-2 模型撤权/Stop/迟到响应 | PARTIAL | 已提交逐写授权、取消传播与 executor 回归测试，尚无真实 Provider/Host 回执 |
| Node R1.4/R1.5 与 Bookmark 权限回归 | NOT_TESTED | 文件已存在；本环境未执行 node/npm |
| 正式构建与来源锁/包体/CSP | NOT_TESTED | 未执行 WXT/build/package/verify，不允许调宽约束 |
| 预览生成、同源 Chromium 像素/点击、320/360/400/440/960、200% | NOT_TESTED | 新增测试脚本，尚无 Chromium 截图、报告或新 HTML 文件 |
| Chrome 真正书签写入和 Provider 实际请求 | NOT_TESTED | 没有真实浏览器 API、模型授权与本地 Native 执行回执 |
| Mac Chrome 真实安装/升级、自定义工具回归 | NOT_TESTED | 属于后续本地验收，不得宣称已通过 |
| Prompt Shortcuts 第二可信试点 | PROMPT_SHORTCUTS_NOT_IMPLEMENTED | 未核实其正式可信准入和共享 React 消费条件，无已上线 Adapter |

**旧候选历史截图、已编写测试、Mock 成功、GitHub 文件提交，都不能等同于当前 SHA 的运行 PASS。** GitHub Combined Status 查询在本轮返回空数组，且可用 GitHub Workflow Runs 接口限 PR 触发，不能由此推定 CI 成败；最新 CI URL = NOT_VERIFIED。

## 本地继续执行的实际命令

仓库根目录（`/Users/shopme/Documents/workspace/opendesk-browser`），先检查 `git status --short`、`git branch --show-current`、`git fetch origin main`，不得覆盖其他 Agent 的未提交改动；只在 `main` 验收：

```bash
node --test tests/environment/opendesk-conversation-r14-dock.test.mjs tests/environment/opendesk-conversation-r15-closeout.test.mjs
node --test tests/environment/opendesk-conversation-r10.test.mjs
npm run build
npm run check
```

React 离线预览工具目录 `examples/sidebar-tools/bookmark-manager/preview/react`：

```bash
npm ci
npm run preview:build
npm run preview:check
CHROME_BIN="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" npm run preview:chrome -- --conversation-r13
npm run preview:budget
```

编译/来源锁、包验证、Custom HTML/React/Vue 兼容、真实 Native/Provider 的命令按最新 CI 与仓库现有脚本核对后执行，不用调弱守卫换 PASS。浏览器测试必须保存实际生成的 `preview/dev.html` SHA-256、production App/Dock/CSS/Mock 输入指纹、每宽度截图和 CDP 回执，以及真实书签 getTree 前后节点 ID。只有 Chromium 通过才按照原有审批机制更新 `preview/index.html`。不得将旧正式 HTML 或随手写的静态页面称为 R1.5 交互预览。

## 待关闭的真实 P0

1. 同一 SHA 执行 Node + build + Chromium；失败先修源码，保留失败和修复前后日志。
2. 真正 Chrome Host 下测试新文件夹 → 当前网页收藏 → 读回 → 原列表定位，以及用户滚动/搜索/编辑冲突。
3. 真实 HTTPS 与 Local Codex 模型权限在请求期间撤销、Stop、切换工具/卸载、迟到响应，核查安全边界和 UNKNOWN。
4. 侧边栏浅色/深色、320/360/400/440/960 与有效 200% 缩放下的焦点、ARIA、独立滚动、编辑 Sheet 兼容。
5. Prompt Shortcuts 在独立可信准入核实之前继续保留沙箱与 `PROMPT_SHORTCUTS_NOT_IMPLEMENTED`；不可使用 Mock Adapter 假称已完成。

评分：**方案目标每维 ≥95（目标值，不代表实现分数）**；实施后的真实产品 7 项评分统一 `NOT_SCORED`，必须等对应独立运行证据而非源码推断。当前总状态：`WEB_PARTIAL`，禁止声明 `COMPLETE`。

## R1.6 PREVIEW-FIRST 增量执行（2026-10-21，不能覆盖 R1.5 历史）

**定位**：继承上面的唯一原始产品目标。本轮只做原版 Bookmark React App + 共享 TrustedConversationWorkspace 的离线交互预览；不重建 Provider，不扩大 Sandbox 权限，不把离线模拟当正式 Chrome 写入。当前对话内无法以同源码 React 构建作为内嵌可执行应用呈现：`INLINE_PREVIEW_UNAVAILABLE`，不可用截图或静态 Mock 替代。

**已核查并在 main 增量提交：**
- `examples/sidebar-tools/bookmark-manager/preview/react/src/main.jsx`：预览初次默认展开 Dock，离线 Provider 增加可 Abort 的 800ms 等待以真实操作 Stop；固定句式“模拟 Provider 失败”显式离线报错。真实 Provider、Service 和业务 Executor 不变。
- `src/ui/react/components/conversation.tsx`：删减冗余离线状态文字，减少 320/360 宽度下的截断。
- `examples/sidebar-tools/bookmark-manager/preview/react/conversation-r13-chrome.mjs`：React Chromium 脚本兼容初次已打开的 Dock。
- `.github/workflows/bookmark-manager-r302-react-preview.yml`：增加 `npm run preview:chrome -- --conversation-r13` 场景和共享 Dock CSS 变更触发。
- `examples/sidebar-tools/bookmark-manager/preview/react/build-preview.mjs`：只在生成 `dev.html` 时扩充外层控制为 320/360/400/440/960px，不覆盖已批准的旧 `preview/index.html`。

**实际证据与分级：**
- 历史相同生产 App/Dock 输入对应 GitHub Actions `39577428007` 的 `react-chromium` Job = `PASS`，候选构建文件 `dev.html` SHA-256 为 `b849068f3354c5cf6da234bbe025dc846e7789a7a135014d1245812b65d2c7a9`。原候选 manifest：`reactRuntime:true`、`reactSourceBound:true`、`sourceBound:false`（外壳旧版）、`nativeVerified:false`。不得宣传为正式发布。
- 本会话隔离 Chromium 实际操作了书签树、编辑未保存草稿、Dock 开关、键盘高度、两轮创建/收藏的真实离线 Service ID 读回、搜索过滤定位、Enter/Shift+Enter、权限撤销、UNKNOWN、模拟读取超时。旧候选五档宽度与深浅主题使用 DOM 观察；可用的 200% 验证为 CSS/布局仿真，不是 Mac Chrome 菜单缩放。
- 旧 Chromium 测试日志 143 项中有 6 项失败（包括 Source pin 漂移），且独立 standalone package budget 报 `BUDGET_BLOCKED`：`E_TOOL_BUILD: source file exceeds budget: src/main.js`。这些真实阻断不得用局部 React Chromium PASS 掩盖。
- 当前新增 R1.6 主线 `main` 候选编译与两轮 + Stop 新版截图结果，**必须等待对应 SHA 的 CI/本地 Chromium 成功才可标 PASS**；历史截图不属于本次修复的验证回执。
- 已知 UX 缺陷：外层独立预览尚不能嵌入当前对话成为源码级交互组件；写入前故障 Fixture 在聊天中仍可能被谨慎归类为 UNKNOWN；正式 Native/Provider/Chrome 实际写入未验证。

**本轮验收账本：** 原业务 React 源码复用 = `SOURCE_CONFIRMED`；历史离线操作 = `PASS_OLD_ARTIFACT`；新候选五档 Chromium/Stop/失败场景 = `AWAIT_CI`；当前聊天内同源码内嵌 = `INLINE_PREVIEW_UNAVAILABLE`；最新正式发布 `preview/index.html` = `NOT_PROMOTED`；正式 Chrome/Provider/Native = `NOT_TESTED`。七维独立评分需绑定同一候选新运行证据；不能虚报 95/100。

**后续**：优先核对最新 `main` 的 `Bookmark Manager R3.2 · Formal React Source and Chromium` 工作流（workflow 文件 `bookmark-manager-r302-react-preview.yml`）；失败先在原源码修复并重跑。保存同源码候选构建 SHA、所有 UI 截图、正常/异常键盘和 Stop 的 CDP 结果，按原审批机制决定是否更新 `preview/index.html`，不得自动提升。真实 Chrome/Native 仅后续专项验收。

### R1.6 后续发现：真实 200% 缩放缺陷（待同 SHA CI）

在隔离 Chromium 的旧同源候选上，预览 iframe 物理宽度 320px、根 DOM `zoom=2`、原书签逻辑宽度 160 CSS px、物理高度 760px 时，原 `TrustedConversationWorkspace` 用 `getBoundingClientRect().height`（缩放后的 760 视觉像素）计算 CSS Dock 高度，导致书签树 `clientHeight=0`。该 P0 可复现，原先只验证“发送框可见”的 200% 测试不能视为 PASS。另有一次错误测试把 iframe 宽度再次除以 2，属于重复缩放；正式判定只采用物理宽度不重复缩小、并验证 `offsetWidth=物理宽度/2` 的正确用例。

已提交共享 Dock `node.clientHeight` 布局单位测量与小窗口最小高度调整（提交 `edd2048d454b544703098ef409ed83d2fae0f3e0`），并将 200% 下书签树实际高度 ≥36 CSS px、聊天输入区未遮挡列为 Chromium 强制断言（提交 `869cc60586834b4f5f1cf3e116640c5c5ca49bcb`）。**未取得修复后打包和 Chromium 原始回执，状态仍为 `R16_ZOOM_FIX_SOURCE_ONLY`；不得声称 200% PASS 或 95+。** GitHub 同源 CI 任务：https://github.com/shopable-ai/opendesk-browser/actions/runs/39586658934。旧候选截图、历史 Run 和虚拟布局模拟均不能代替本次运行证据。
