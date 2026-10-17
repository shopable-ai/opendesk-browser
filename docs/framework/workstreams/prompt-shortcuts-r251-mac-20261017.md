# Prompt Shortcuts R2.5.1 · Mac 最小验收

负责人：Codex 对话 `01a148a9-83f3-7170-97cc-4d1d895da464`。仅 main，未创建分支、worktree 或 PR。

## 写入与资源

- 本轮首先只写本记录及 `artifacts/prompt-shortcuts-r24-mac/r251-20261017/` 原始证据。
- 工具业务、Host、正式包和相关测试目前有其他任务未提交改动；不覆盖、不提交它们。发现本轮实际缺陷后才声明最小修复文件。
- 独立源码快照、production 输出、CFT 应用和全新 Profile 均归本轮使用。不使用现有日常 Chrome/CFT Profile，不停止现有服务、不覆盖共享 dist。
- 范围：真实安装扩展的 320/380/400px、三个设置、ChatGPT 草稿插入/Undo/IME、数据持久化；安全旧版本 Profile 不存在时升级 NOT_TESTED。

## P0 原始发现

- 起点 main 与 origin/main 同步：`26254353e`。
- 工作区 `--check-project` 失败：源码与正式包不同源。既有未提交改动涉及 prompt `src/main.js`、正式 JSON、r14-management 测试及旧 handoff，含范围外 Gemini 修改。本轮保留，不把它们当成正式 R2.5 输入。
- 已提交 main 的 tool.config 版本为 1.1.3；将单独核对该提交内正式 JSON 与源码。
- 共享 production 收据中的 sidebar-tools.js、tool.html、tool-shell.css 与 main 不匹配；且共享 dist 正被其他任务更新，因此不复用，不在共享输出构建。
- 系统已有 CFT 默认 Profile，不属于本轮隔离 Profile，不在其中修改工具或网页数据。
- 用户给定 Node/共享/Formal Chromium/DOM Fixture 与 CI 38957872043 的已有 PASS 保留；不重跑无变化测试，不提升为本轮真实 Mac PASS。

## 状态

开发环境最小验收已记录；整体仍有明确未验证项，不宣称完整 Mac E2E PASS。2026-10-17 用户明确改为“只考虑开发环境，暂时不用考虑生产”。生产构建失败仅保留历史事实，不修改其来源 pin；接续验收使用现有持续开发服务，结果见末尾开发环境结论。

## 真实环境与候选身份

- Mac Chrome for Testing `156.0.8078.4` arm64；独立应用 `OpenDesk Prompt R251 CFT`，独立临时 Profile，无日常 Chrome 数据。
- 真实 Chrome 扩展 ID：`miehaaodmfmoegnpioikalkiihhdbjep`；扩展版本 `0.1.0`，production 五 Tab。原生扩展详情确认加载路径为本轮 `snapshot/dist/production`。
- 通过原生导入、审阅、确认安装正式工具 `prompt-shortcuts@1.1.3`。包 SHA256：`445653867550086bca12a5f6328dc1edd4d106b5c91c7dcc5e8aae3843a096d6`，75444 bytes。未以同版本不同字节覆盖。
- 已实测候选源提交：`26254353ea81517ac037fd5b48fb455816862bdd`。其 production 构建及来源验证通过，原始产物保存在证据目录 `production-26254353/`。
- 后续安全快进到最新 `8530dcefc93fb259474ebeb75ddc2f3dac15ba4b`。该提交正式 JSON 与提交内源码 `--check-project` 仍为 `PROJECT_PACKAGE_MATCH`，但可信网页源码有变更，不能把旧候选原生结果升级为新候选 PASS。

## 已测结果（绑定 26254353 候选）

| 项目 | 结果与原始证据文件 |
| --- | --- |
| 正式安装身份 | `chrome-extension-details.ax.txt`、`current-data-fingerprint-before-valid.ax.txt`：Chrome 真实加载路径、唯一工具 ID、版本均确认 |
| 批准 UI | `sidepanel-observed-360.png`、`layout-initial.ax.txt`：实际 iframe 360 CSS px，scrollWidth=360，六按钮均 40×40、gap=6、flex-end、同一行，title/aria-label 均有；单可见标题、Plus、正文主列表、每条单 More |
| 键盘 | `more-keyboard.ax.txt`、`more-escape.ax.txt`：Enter 展开，Tab 到操作按钮，Escape 收起并恢复 More 焦点 |
| 网页按钮开关 | `settings-web-off*.ax.txt`、`settings-web-restored.ax.txt`：关后已打开 ChatGPT 按钮立即消失，真实 `library.settings.webButtons=false`；开后恢复一组三按钮 |
| 设置持久化 | `settings-reopen.ax.txt`、`tool-off-page-refresh.ax.txt`、`tool-restart-settings.ax.txt`：设置重开、网页刷新、工具重启后状态正确 |
| 工具停用 | `settings-tool-off*.ax.txt`：网页按钮撤除，两个依赖开关 disabled，三个提示词保留；恢复启用后回到一组 |
| 原生右键 | `context-menu-native-toggle.ax.txt`、`context-menu-storage.ax.txt`、`context-menu-native-open.ax.txt`：原生点击后可信存储按 origin/版本/包 hash 记录授权，真实 Chrome 菜单出现“添加为提示词快捷按钮”；随后通过真实开关关闭 |
| 真实 ChatGPT 插入 | 用户最新允许无需登录。`live-draft-before.ax.txt`、`live-insert.ax.txt`：原有两行草稿保留，完整追加中文/英文/Emoji/多行提示词，未发送消息 |
| 原生 Undo | `live-undo.ax.txt`：一次 Cmd+Z 精确恢复原有两行草稿 |
| 当前数据持久化 | `current-data-fingerprint-before-valid.ax.txt` 与 `current-data-fingerprint-after-restart.ax.txt`：三个提示词、设置及 library SHA256 均相同：`6160beb32f25cb9ed1629904ca6edf0be9f4a5026275c5c339ed49e1183b36cb`；未删除/重建真实存储 |

## 明确缺口与失败

- **最新 production 构建 FAIL**：`build-latest.log` 与 `build-latest/build-production-failed-*.json`。`f145b3e54` 删除可信网页 rail 的 fold 控件，`trusted/page.js` 当前 blob 为 `255e72f350464a87039c36a3754a58df3e3e31a8`，而 `scripts/bundle-provenance.mjs:63` 仍固定 `1cf947812b5f946ab93496fe23dca6024d158c5e`。构建按合同拒绝来源漂移，未绕过校验。
- 独立前端安全评审支持仅同步这一行已审阅 blob；对应 `tests/environment/prompt-shortcuts-r14.test.mjs:123` 也需同步。`proposed-provenance-pin.patch` 已准备，未应用。脚本超出用户允许文件清单；用户答复改为仅开发环境，因此撤回本轮 production 修复分支，未获得也不再请求该扩域。该脚本另有 AdBlock 未提交改动，保留原样。
- **320/380/400px NOT_TESTED**：原生 CUA 分隔线拖动、尺寸手柄动作未使实际 360px 发生变化。未用模拟 viewport、CSS 改写或重标截图冒充这三个宽度。
- **原生 IME 组合态 NOT_TESTED**：真实输入法快捷键与原生按键未建立中文候选/组合态；普通 Unicode 插入不替代 IME 验收。
- **1.1.2→1.1.3 正常升级 NOT_TESTED**：本轮无安全旧版本 Profile，不删除或重建任何用户数据来制造升级。旧自定义 sites 迁移也未实测；本轮全新 Profile 无 sites 记录。
- ETag 并发/保存结果未知的静态保护继续复用专项 CI `38957872043` 及原有定向测试证据；本轮未人为制造原生存储失败或未知回执，不能登记为新增原生 PASS。
- Claude/Gemini 真实网站适配保持待验证；用户允许无法进入的网站跳过，不扩大适配开发。

## 三方向独立评审

- 产品与操作体验：Plato（`01a148c3-09dc-7090-a3d0-63d0d72d0440`）。已测操作成立，未发现支持 P0/P1 的功能缺陷；缺宽度/IME/升级证据，`NOT_SCORED`。
- UI/UX 与视觉：Dalton（`01a148cd-2485-7ec0-9c00-5bc0b5eff249`）。真实看图及 AX 确认 360px 核心布局与键盘；宿主齿轮与预览滑杆等轻微差异不足以重设计；缺三宽证据，`NOT_SCORED`。
- 前端、无障碍与数据安全：Confucius（`01a148c3-3c23-7ec0-8ee7-95c629fca124`）。确认最新构建根因及 fail-closed 生效，删除 fold 未扩大权限/插入/IME/存储合同；历史 production 范围未修 pin 前交付 `BLOCK`（后续用户将 production 移出本轮），`NOT_SCORED`。
- 三位均只读、未操作 Chrome、未运行重复测试或修改文件。未因目标分数捏造 95/100。

## 本轮验证范围

- 按请求运行实际工作区 P0 命令；保留工作区正式包与其他任务源码不一致的失败事实。
- 固定提交导出的普通源码快照运行 `--check-project`：1.1.3 正式包同源 PASS。
- 仅构建 production；不执行全仓 `npm test`、另一 edition 或无关 E2E。前期快照依赖路径/缺失来源根的失败诊断保留，纠正快照后 26254353 构建成功。
- 新 main 可信网页输入变更后才补一次受影响 production 构建；实际失败如上。无代码修复获批/落盘前，不重复 Node 或 Formal Chromium。
- 原始证据目录：`artifacts/prompt-shortcuts-r24-mac/r251-20261017/`（本机临时源码/依赖/构建/Profile 不提交）。修复待授权，尚未提交或推送本轮记录。

## 用户范围更新：开发环境

- 复用 PID 34253 的既有 `npm run dev`，`127.0.0.1:43119`；其负责人为 cookie-import-real-20261017，未停止或覆盖 watcher。
- 固定输出 `dist/development`，Developer edition；revision `a49453beef576c639339d789c3778549366566250db4eb4a6838df4f15152a2f`。
- 只读核对开发 sourcemap：page-relay 内 trusted model/policy/page、sidebar-tool-host 内 trusted model/policy 和 src/ui/sidebar-tools.js 均与当前源码逐字节一致。
- 将使用本轮隔离 CFT 的全新开发测试 Profile；原 production Profile 的 3 条测试提示词已有完整 AX / 哈希证据，未触及用户存储。
- production 最终五 Tab / 静态包验收本轮 OUT_OF_SCOPE，不能用开发证据宣称正式生产通过。

## 开发环境最终证据与边界

- 安全快进 main 至 `06697b37aeb8e19c3571a7ae7d753326df7a0ce4`。8530dcefc 之后仅预览/其他工具变更，正式 Prompt 工具、相关 Host 和本轮产物输入无漂移。未修改业务源码、可信源码、正式包或测试。
- `development-identity.json` 绑定真实 dev ID `ccfcjegpkdlgbclopjmadlcjedelidmf`、固定路径、watcher、完整 revision、相关源码 SHA256 与真实 bundle SHA256。结束核对：6 项 sourcemap 源码一致；相关输入和四个 bundle 均无漂移。现有 watcher 完整保留，未新增构建。
- 正式 iframe 安装的是已提交 main 内同源的 `prompt-shortcuts@1.1.3`（SHA256 `445653867550086bca12a5f6328dc1edd4d106b5c91c7dcc5e8aae3843a096d6`），不是并行任务尚未晋升的工作区修改。可信 Host / Page 采用当前 development 输出。未以同版本不同字节覆盖安装。

| 开发环境检查 | 真实结果 / 原始证据 |
| --- | --- |
| 开发连接 / 安装身份 | `dev-extension-details.ax.txt`、`dev-connection.ax.txt`：真实加载 dist/development，服务已连接；独立 Profile，仅正常导入一个 prompt-shortcuts |
| 真实布局 | `dev-sidepanel-observed-360.png`、`dev-layout-valid.ax.txt`：实际 360 CSS px，无横溢；六个按钮均40×40，同一行，gap6px、右对齐，title/aria-label 均有。仅视觉标题单一，AX 内仍有工具语义标题 |
| 开发版本键盘 | `dev-more-enter.ax.txt`、`dev-more-tab.ax.txt`、`dev-more-escape.ax.txt`：Enter展开并聚焦编辑，Tab到停用，Escape收起并恢复More焦点 |
| 网页开关与停用 | `dev-switch-web-off.ax.txt`、`dev-tool-off.ax.txt`、`dev-off-refresh.ax.txt`：关后网页按钮0；停用后两个依赖禁用；网页刷新后仍停用。再开恢复一组三按钮 |
| 原生右键开关 | `dev-native-menu-toggle.ax.txt`：实际 native click 将第三个Switch打开，Host显示已为当前网站启用。未用 synthetic click 申请权限。旧候选另有真实Chrome右键菜单入口截图/AX。最后经native click关闭，工具显示“已停用当前网站右键菜单” |
| 设置重开与数据持久化 | `dev-settings-reopen.ax.txt`：重开后3开关on/on/on；`dev-fingerprint-before.ax.txt`、`dev-fingerprint-after.ax.txt`：均3条、webButtons=true、完整library SHA256 `26c47ab2fc320f9414a727227165eb548123a272d26b5c69a449145be6134c36`。未操作既有用户数据 |
| 真实ChatGPT插入 / Undo | `dev-live-draft-before.ax.txt`、`dev-live-insert.ax.txt`、`dev-live-undo.ax.txt`：未登录真实站点，内置自动识别，中文/英文/Emoji/多行完整追加，已有草稿（含“收到”前缀）保留，Cmd+Z恢复原草稿，未发送任何消息 |
| 导航 / 刷新唯一性 | `dev-live-root-recovered.ax.txt`、`dev-live-root-refresh.ax.txt`、`dev-live-spa-settled.ax.txt`：真实页面完成加载后均3按钮，点击新聊天后稳定状态仍3按钮。加载中暂时0按钮未登记FAIL/PASS |
| ETag / 未知保存结果 | 保留给定CI及当前源码独立只读核查：Host旧ETag拒绝，写后回读；客户端回读不一致不盲重写。本轮无并发/丢回执故障注入，不能称真实异常路径PASS |

测试驱动自身的失败也保留：原生 drag 未改变360px；IME快捷键只产生普通ni，没有真实组合态证据。个别 Console 只读查询因自动按键漏标点出现 SyntaxError/上下文选错出现 TypeError，未执行写入，不算产品控制台异常；后续有效结果使用独立文件 `*-valid.ax.txt`。根页重试一次自动输入 `https//chatgpt.com/`，属于 URL 冒号遗漏，修正后真实网站恢复，未将其归因于产品或网站故障。

### 未验证项

- 320/380/400px 真实 Side Panel：`NOT_TESTED`，只有360px；不改DOM/CSS、不开emulation伪造宽度，不将旧Fixture结果提升为真实Mac结果。
- 真实中文IME组合中点击：`NOT_TESTED`，不合成composition事件。
- 安全旧版本1.1.2 Profile、真实1.1.2→1.1.3正常升级和旧自定义sites迁移：`NOT_TESTED`。当前版本新建测试数据的正常持久化已通过；不制造用户旧存储或删除/重建用户资料。
- 生产五Tab / 最新production冻结候选：按最新用户指示 `OUT_OF_SCOPE`；历史来源pin失败保留但不再阻塞dev范围。
- Claude/Gemini真实适配仍 `NOT_TESTED`，未扩大测试或修改。

### 独立最终评审

原始回复摘要见 `independent-reviews.json`。产品Halley、UI Dalton、安全Confucius均只读独立检查开发证据。未发现已测开发范围新增P0/P1；三个方向均 `NOT_SCORED`，不授予95/100。后补键盘及正常网页加载证据未用来擅自提高评分。

### 最小回归与最终状态

未修改源码，不重复85/85 Prompt Node、6/6共享、Formal Chromium或DOM Fixture，不运行npm test或额外构建。复用用户给定CI `38957872043`；上述原生操作是本次新增验证。初始工作区 `--check-project` 失败仍保留（其他任务未提交源码/JSON）；已提交版本快照同源检查通过。开发输出经sourcemap与哈希核对，本轮未绕过来源验证或修改生产pin。

- `FORMAL_EXTENSION_PASS`：仅指真实开发宿主中正常安装运行正式1.1.3工具身份及已测核心流程；不表示production验收通过。
- `MAC_E2E_NOT_TESTED`：指定三宽、真实IME尚缺，整体未完整验收。
- `CHATGPT_LIVE_NOT_TESTED`：插入/Undo/新聊天/刷新核心路径实测通过；真实IME仍缺，不能授予整项PASS。
- `UPGRADE_DATA_NOT_TESTED`：当前测试数据持久化PASS，旧数据/正常升级未执行。

本轮只提交本记录和精选原始证据，不混入并行源码。提交SHA由最终答复及Git提交记录给出；推送完成后以远端包含该提交为准。
