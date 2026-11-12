# AI Proxy 交互预览 · PC R16 优化与源码落实

## 2026-11-12：ZeroOmega 多服务器对照与代理认证能力决策（设计已审计，功能未接线）

**原始目标：** 判断是否应仿照 ZeroOmega，在同一代理情景模式中使用表格配置多台代理服务器；明确 Chrome 扩展用户名/密码认证的真实边界；避免将离线预览功能当作正式代理连接能力。采用「少量必要差量」，不重做 AI Proxy 七区和四种连接模式。

### 事实与现状（2026-11-12 main 源码核查）

1. **两个“协议”不是同一概念：** 节点的 HTTP/HTTPS/SOCKS4/SOCKS5 是“连接代理服务器的协议”；ZeroOmega 表格的 HTTP 网站 / HTTPS 网站是“请求 URL 的协议”。Chrome `chrome.proxy.ProxyRules` 能设置 `singleProxy`，或按请求协议用 `proxyForHttp`、`proxyForHttps`、`fallbackProxy` 分别指向代理服务器。不能因为已有多节点列表就声称已经支持按请求协议分流。参考：https://developer.chrome.com/docs/extensions/reference/api/proxy 。
2. 当前 `src/domain/types.ts` 已有 `endpoints[]`、`profiles[]`、`rules[]`，**多台代理的保存与列表管理已经存在**；不增加第二份节点池，不让用户在添加节点弹窗重复配置 HTTP/HTTPS 网站请求映射。
3. 现有正式 `src/Settings.tsx` 对填写账号密码的保存直接返回“代理认证尚未接入”；`src/service.ts` 的 `SET_CREDENTIAL` 返回 `E_NOT_CONNECTED`，`src/domain/managed-config.ts` 拒绝含 `credentialRef` 的已管理路由。**正式产品尚未具备认证代理连接能力**，不以 `preview/preview.html` 的模拟“已保存”替代。
4. 当前 `src/domain/managed-config.ts` 的 `profile` 只能指向单一 endpoint；`rules` 公开转换只接受最多 16 条符合约束、**全部指向同一 endpoint**、默认直连的规则。已有网站规则列表不等于允许多个不同节点同时受控路由。
5. Chrome MV3 可通过 `webRequest.onAuthRequired` 对 HTTP(S) 代理的 **407 代理认证挑战** 提供凭据，但需官方权限、真实绑定与受控测试；浏览器原生 SOCKS4/SOCKS5 不支持这种用户名/密码认证。参考：https://developer.chrome.com/docs/extensions/reference/api/webRequest 。不把 HTTP 网站的 401 登录误判为代理认证。

### UI 决策：保持简洁，按需渐进

- **默认：** 维持现有「我的代理」多节点列表以及「添加/编辑代理」三行布局：名称；代理连接协议＋服务器地址＋端口；用户名＋密码（可选字段）。不要在每个节点弹窗里放 ZeroOmega 全表格，不增第五个一级模式。
- **认证状态：** 正式版仍未接线时必须明确“认证尚未支持”，对无认证节点正常保存；不能伪造账号密码保存/启用成功。SOCKS4/5 认证字段禁用并说明原因。未来只有真实认证链通过后，才开放 HTTP/HTTPS 输入与持久化认证引用。
- **可选高级项（P2，当前只设计）：** PC「代理与配置」内可折叠「按网址请求协议使用不同代理」。开关默认关闭。开启后只显示两行「HTTP 请求 → 已保存节点」「HTTPS 请求 → 已保存节点」，其他请求采用清晰的默认/直连语义；用 `Chrome 请求协议` 文案区别代理节点的 `连接协议`。不默认增加 FTP 行，不做轮换、自动测速、任意脚本或多级规则编辑器。
- **受控状态：** 配置选择与真实应用分离；未经审批的高级功能绝不展示为可点击、可成功应用；控制权未知、权限未授予、代理冲突或回执未知时不得自动重放 APPLY，也不得假称切换成功。旧四模式、七区、历史导入/备份继续兼容。

### 分阶段实施与验收门槛

**P0 · 现在：** 保持已可用的节点列表与默认单节点，确保正式 UI 清晰暴露认证暂不可用和「多节点分流未接线」的真实边界；不得为模仿 ZeroOmega 添加空表格。以现有 `Settings.tsx` 认证错误/提示和 `managed-config.ts` 约束为源核对，任何 UI 演示单独标“模拟”。

**P1 · HTTP(S) 代理认证（独立任务）：** 经权限/可信 Host/公开 SDK owner 审阅后设计最小认证合同；`storage.session` /等价受控短期凭据存储，非秘密配置只保留不可逆引用；只应答确认为代理挑战（`isProxy`/407）的请求，按**当前已确认应用的代理 host、port、协议与 generation** 精确匹配，不向目标网站 401、其他代理、旧会话或第三方沙箱发凭据。限制失败重试、防 407 循环；取消、停止、撤权、扩展重启或来源变更时清理；禁止日志/导出/回填密码。前后端同时支持后再开放表单。

**P2 · 按请求协议的多服务器分流（需求明确时才实施）：** 在既有 Config/Service/Host 受审合同增加指定节点引用的 `HTTP/HTTPS/default` 路由；不用旁路自行执行 chrome.proxy，也不将 ZeroOmega 的整套配置模型直接复制。验证路由决策、默认回退、直连、不同端点与选中/应用差异，再决定是否上线折叠区。只有明确的特权 owner 授权和真实 Chrome 验证后才宣称正式支持。

**关键验收：** (A) 默认一台节点的现有保存/选择/应用不回归；(B) HTTP 网址与 HTTPS 网址的代理连接协议不混淆；(C) 填认证的 HTTP/HTTPS 必须是真实 407/受控服务端测试通过而非只通过预览；(D) 401 不是 407、跨节点/错端口/错误凭据/重复挑战/撤权都不泄露认证；(E) 两个请求协议走不同端点时须真实观测并回读，绝不以仅保存为成功；(F) 无关的 SOCKS 无认证、网站规则、PAC 与旧存储不受影响。

**当前状态：`DESIGN_DECIDED / P1_P2_NOT_IMPLEMENTED / CHROME_REAL_AUTH_NOT_TESTED`。** 本节不修改代理业务代码、不升级正式工具 JSON，不产生真实代理流量；不是新一套权威框架规范，也不沿用旧专家评分冒充该能力的实现验收。

## 2026-11-09：R18「我的代理」切换方式纠偏（独立交互预览，PC 不变）

**仓库已归档可点击 R18 文件**：[`preview/ai-proxy-interactive-preview-r18.html`](preview/ai-proxy-interactive-preview-r18.html)，并从 `preview/index.html` 增加入口。上一版聊天交付的独立 R17 HTML 当时没有保存到仓库；仓库 `preview.html` 仍是未按这版重新编译的 React 同源预览，不得将 R18 独立设计稿覆盖该生成文件。

**已修复的交互语义**：旧离线预览在运行中点击「我的代理」其他线路时将 `selected` 改为目标、同时直接将 `applied=false`，造成运行状态误报「已暂停」且「使用」按钮含糊。R18 使用明确的已选 `mode/selected` 与模拟已应用 `activeMode/activeProfile/applied` 分离，增加 `switchingTo` 过渡。侧栏运行中点击其他代理仅在模拟切换完成后更新已应用线路，过程中旧线路仍标记「使用中」，目标显示「切换中」并阻止重复操作；暂停后点击只预选为「待启用」，必须主动点「启用」才标记生效。重复点击当前线路无副作用，冲突/未知状态阻止切换并保持原异常，不伪装成功。

连接方式切换保留已应用线路，不再自动变成「已暂停」：目标模式明确标记为待应用，用户点击「应用更改」后才在模拟状态中标记已应用。当前网站的浏览器设置来自模拟已应用模式，预期线路来自已选模式，避免二者混淆。侧栏底部订阅/诊断收敛逻辑保持 R17 方案。

**PC 保护范围**：PC 管理模板与路由函数（`managementHeader` 至 `renderPc`）和 R17 相同，校验 SHA-256 为 `9aa1b9d9ea8dc8e2e53e29bb0d9eefb82bd410c0ec7ecb28d6fda42a001ac353`；PC 诊断正常状态文案仍使用旧分支。未改 `src/Settings.tsx`、`preview/management.css`、任何正式 Host、代理服务或包。

**验收证据和界限**：`tests/preview-standalone-switching.test.mjs` 的 Node VM 状态回归 **3/3 通过**，包含运行中切换、暂停预选、连接方式待应用、冲突保护和 PC 模板哈希。另行执行 16 项本地状态逻辑检查通过。当前测试环境的 Chromium 导航被策略阻止（`ERR_BLOCKED_BY_ADMINISTRATOR`），**没有成功进行真实浏览器点击或截图验收**；交互为完全离线模拟，`300ms` 动画不表示真实代理切换成功。本地源码文件 SHA-256 为 `a941d678863e7e7cb611f8b4e8e9514fb96a4c07aadd182306095688228693ed`，Git blob SHA 为 `d8d29a1523ad2760a3b632178552bee808a2e141`，已远端回读对账。

**下一阶段**：用户确认设计稿后，再核对并调整 React 同源 `QuickPanel` 的正式切换状态与真实授权/回执契约，用 `scripts/stage-preview.mjs` 生成 `preview.html`/manifest/context 并做浏览器端-to端验证；不能把 R18 模拟行为写成真实代理已完成或隐式改变 live runtime。


## 2026-11-08：用户确认侧边栏 R17 入口收敛，PC R16 保持不变

本轮只批准 **侧边栏交互预览** 调整，不重做 PC 设置。侧边栏正常状态移除底部长期显示的「订阅来源」「网络诊断 ↗」双按钮；首次空配置继续由原「订阅来源」入口进入 `#/subscriptions/new`；代理错误、控制冲突、状态错误或结果未知时，运行状态附近展示仅导航到 `#/diagnostic` 的次级入口。**点击诊断入口不自动 PROBE、APPLY、STOP**。

已在 `preview/management-actions.mjs` 增加针对冻结侧栏基线的精确替换，在 `preview/management-actions.css` 增加仅作用于侧栏的条件入口样式，并添加 `tests/preview-sidebar-actions.test.mjs` 防止重复底部入口回归；保留原管理图标、四种模式、代理行、当前网站、轮换计划、真实来源和导航契约。

**明确排除修改**：`src/Settings.tsx`、`preview/management.css`、PC 七个栏目、`src/QuickPanel.tsx`、冻结的 `preview/baseline/*`、`trusted/*`、Host/SDK、真实代理操作和正式安装包。仓库 PC R16 的既有行为与样式维持原样。

**验证状态**：预览编译替换器已对当前冻结基线完成语法解析、四项替换、底部入口删除及空态/诊断路由存在性检查；独立 R17 单文件侧栏演示完成 23 项浏览器交互/状态/窄屏检查，PC 模拟实现相对于前版 R15 字节未变。这些结果不等于仓库最新 React 生成预览已构建。由于本机 CodexPro 连接不可用，`preview/preview.html`、`preview.manifest.json`、`preview.context.json` 仍需使用原生成器重新构建并完成同源浏览器回归，不得手工改写内联 bundle 或伪造哈希。


## 2026-11-08：PC 管理页 R16（本轮当前状态）

**需求基准**：用户认可 R14 Side Panel，PC 以用户上传的高质量旧版完整七区 HTML 和 R15 改进稿作为设计参照。本轮授权写入当前仓库 `main`；主目标为修复按钮文字/背景颜色、调整 PC 备份名称与操作优先级、保留实际表单/草稿/路由。不是正式扩展安装或网络执行。

**R16 原始可点击 HTML 已正式归档（2026-11-08）**：

- [R16 离线完整交互参考稿](preview/ai-proxy-interactive-preview-r16.html)（仓库路径 `projects/ai-proxy/preview/ai-proxy-interactive-preview-r16.html`）。
- 完整文件 **407,330 UTF-8 字节 / 4,216 行**；Git blob SHA `7b92d13008ea483e01f00933f0735ed9a4a2a432`；SHA-256 `e9b82618e2477006d7e76b2913b72799cb360cfa51f8ccf8cbc0de7957fb9ddf`。保存时与对话交付文件逐字节一致，远端已回读校验。
- 此文件是**设计参考稿、离线模拟**，与 [React 同源生成预览](preview/preview.html) 不同；后者必须由既有 `scripts/stage-preview.mjs` 重新生成，不允许复制本文件覆盖。
- 若本轮新对话继续优化正式业务代码，应参考这个固定 R16 文件以及已认可的 R14 侧栏，且以当前 `main` 正式 `src/`、现有测试和真实交互回执为准。

**已写入源码**：

- `projects/ai-proxy/src/Settings.tsx`：只在 `presentation==='management'` 的 PC 左导航、页面标题及代理页导入入口把「导入与备份／导入设置」统一显示为既有本地化的「导入备份」；侧栏保留旧标签和原翻译键。将备份页 DOM 顺序调整为先导入、后导出，使视觉顺序与键盘焦点顺序一致，不改导入验证、覆盖确认、显式应用或导出 handler。
- `projects/ai-proxy/preview/management.css`：替换 PC 独立标签页布局与控件配色；采用唯一 `@scope (.proxy-management)`，宽屏约 214px 侧导航 + 右侧内容，响应式导航、PC 四模式均衡、编辑/删除图标 34px 命中区、主次按钮/危险操作/焦点轮廓。
- 特别修复禁用主按钮“蓝底灰字”的低对比度组合：禁用状态在 PC 内改为中性软底 + muted 文字 + 显式禁用光标，正常 primary 依旧使用现有 `--primaryFill / --primaryText`，并复用已有 dark-mode tokens。
- 保留七区（代理、规则、订阅、备份、诊断、通用设置、官方网络）；不修改 `QuickPanel.tsx`、冻结侧栏基线、`frame.jsx`、Browser Framework、Host/Authority 或任何网络、订阅和代理业务 SDK。

**已提交到 `main` 的增量（顺序）**：

- `739b1d9516b1386a1771ac158d87360c75f8f72c`：PC 专属备份标签与入口。
- `466898655ba3da1cf1a982e495d3f0615fa7ee4e`：PC 管理页 scoped 样式与按钮可读性。
- `9aa55733513589f269b8394d744e4b83e302dcbe`：备份页先导入后导出的 DOM/键盘顺序。
- `10cf00836c50f0c5635350e165c97c6a38927702`：收窄次级按钮的样式作用域，避免覆盖 PC 导航和刷新按钮；危险操作保持红色。


**当前验证等级，不混淆候选**：

- 独立离线 R16 HTML（由已认可的 R14 Side Panel 与旧完整管理 HTML 改进）在 headless Chromium 的 **25/25 定向检查通过**：R14 Side Panel 初态截图逐像素一致、七区可达、备份顺序、规则编辑/计算、订阅详情/返回、显式应用语义、390/680/900/1280px 外层无溢出，以及深浅主题的禁用/启用主按钮文字对比度。示例对比度：亮色禁用 5.16、亮色启用 6.57、暗色禁用 6.74、暗色启用 9.00。此证据属于**独立设计稿**，不等于相同 SHA 的 React 页面已加载。 追加执行了 **7 个分区 × 浅/深 2 主题共 256 个可见文本按钮/导航项的计算样式对比度检查，低于 4.5:1 的项目为 0**（仅覆盖离线 R16 渲染，不含正式 React 页或非文本 SVG 对比度）。
- **正式 React 同源预览：BUILD_PENDING / NOT_TESTED**。当前 `projects/ai-proxy/preview/preview.html` 及 `preview.manifest.json` 仍是旧生成候选，不得因源码已有新提交而称其已更新，也禁止手工修改内联 bundle 或改写 SHA 伪造同源。须从仓库根使用原有生成器 `node projects/ai-proxy/scripts/stage-preview.mjs --out projects/ai-proxy/preview/preview.html` 同时重建三件套（HTML/manifest/context），按生成结果、真实 Chromium 截图、路由与表单回执核验后才能升级为 SOURCE_PARITY_PASS。
- **正式扩展安装、真实浏览器代理、Mac Chrome、独立专家 ≥95 复评：NOT_TESTED / NOT_SCORED**。不能把 25/25 离线交互或历史 R14 专家分数直接外推为新候选完整质量 95+。

**本轮 PC 专属后续核对**：在真实生成候选上记录 primary/secondary/disabled/danger/link 的 computed `color/background-color` 与对比度（建议文字 ≥4.5:1，图标/边框状态 ≥3:1），检查鼠标与键盘路径、七个 PC 分区、无草稿丢失与无隐式 APPLY；逐页评估信息架构、视觉、反馈、可访问性、响应式、源一致性。上述六项均有当前同候选证据且最低 95/100、无阻断时才可以声称满足用户 95+ 门槛。

---

# AI Proxy 交互预览 · 2026-11-08 图标管理入口

当前阶段是**先完善预览，交付用户确认，再修改扩展业务代码**。上一轮侧栏改版未经认可，不再作为设计基线；旧 R2 Host/多文档计划只作历史参考。本轮已交付可操作预览，状态 `AWAITING_USER_REVIEW`，不代表设计已获确认。

## 2026-11-08：两个管理入口改为图标

只把「我的代理」右侧的“管理全部”和「当前网站」右侧的“管理规则”替换为对象图标，复用现有 `ProxyIcon` 的 `profile` / `rules` 与原图标按钮视觉，右上角 ↗ 表明打开独立管理页。启用、模式选择、代理行和底部操作仍保留原文字与顺序。

点击区为 34 × 34 CSS px；悬停和键盘聚焦显示原动作文字及本地化目标说明。保留原可访问名称，图形与箭头不重复朗读；提示框可悬停，Esc 隐藏提示且不主动移动焦点。Enter / 空格沿用原按钮语义和原 `profiles` / `rules` 路由。

实现仅在 `preview/ManagementAction.jsx`、`management-actions.css`、`management-actions.mjs` 及原预览生成器中；编译期精确替换两个入口，冻结基线不改。34px 命中区比原文字按钮稍高，相关区块增加少量高度，四条代理和其他控件保持原样，不宣称逐像素不变。

当前 HTML SHA-256：`0075577c7e2d22e57ebf8e5a73a6b545b73f50b0fe63c5e4e1d943f84cad66d6`。证据目录为 `artifacts/ai-proxy/icon-actions-20261108/`：`final-interactions.json` 记录两个键盘目标、关闭后原侧栏继续挂载及 APPLY/STOP/SAVE 均为 0；`escape-hover-after.json` 记录焦点位于其他控件时两个悬停提示的 Esc 关闭与焦点保留；`source-verification.json` 核对 70 个来源无漂移及 74 个受保护业务/正式包/基线文件未变。尺寸为 CSS 与截图证据，未用 OOPIF computed style 测量。常态采用 `final-normal-viewport.png`，浮层采用 `final-{en,zh-TW,zh-CN}-{profiles,rules}.png`，聚焦采用 `final-keyboard-profiles.png`，均绑定同一候选并等待实际绘制；排除 fullPage 合成图。`final-keyboard-rules.png` 未直接证明规则图标焦点环，规则键盘路径以交互记录为据。`final-locale-rendering.json` 记录英文、繁中和简中实际渲染；使用已有语言选项写内存偏好，再诊断重挂载同字节 iframe，不代表跨文档语言偏好自动同步通过。

独立设计评审最终六维最低分 **95/100**，实现评审 **97/100**，无剩余阻塞；不沿用旧分数。[评审记录](../../artifacts/ai-proxy/icon-actions-20261108/expert-review.json)。

| 设计维度 | 分数 |
| --- | ---: |
| 可理解性 | 95 |
| 视觉一致性 | 97 |
| 排版保真 | 96 |
| 可访问性 | 95 |
| 交互反馈 | 96 |
| 多语言适配 | 95 |

首轮设计 92、实现 94；两位评审均指出仅悬停时 Esc 的处理缺口，已先复现再修复并回归。最终评分只覆盖两个图标入口的这版预览，不代表完整无障碍认证或正式 Chrome/Native 通过；实现审查未运行 LSP。ego TaskSpace 23 已释放，本地预览服务保留供用户查看。

以下 11 月 7 日结果是上轮观察，完整 PC 七区和保存/草稿链本轮未重复验收。

## 基线与最小变化

- 业务 owner 为 `projects/ai-proxy/`，现有 `main`；原 `/Users/shopme/Documents/workspace/ai-proxy` 只读。不创建分支、worktree、PR，不提交/推送。
- 改版前业务侧栏来自提交 `fcfc32a10ab656133547c43e46818c9a8e63c163` 的 `src/QuickPanel.tsx`、`src/style.css` 和 `src/styles/sidepanel-r86.css`。在 `preview/baseline/` 冻结只读输入及 SHA；原路径只用于编译期解析依赖，不覆盖工作树。不是第二套正式产品实现。
- 恢复原顺序：连接方式与添加/齿轮 → 浏览器状态 → 四条快捷代理 → 当前网站 → 原底部订阅/诊断入口。保留原模式按钮、字号、密度、排序、代理条数及操作语义，不新增双业务 Tab。
- 上一轮不合适的变化为状态提前、四条减三条、模式按钮变浅/变矮、字号变大、添加入口和底部权重重排。本预览撤去这些变化，已有未提交业务文件全部保留。
- 唯一必要变化在预览导航适配层：齿轮/管理全部打开独立 PC 标签页；管理规则、订阅、网络诊断直达对应栏目。原侧栏保持挂载、选择、表单与滚动状态。
- PC 复用现有 App/Settings 表单，独立宽屏页面为左导航、右内容；代理、网站规则、订阅与客户端、导入与备份、网络诊断、通用设置、可选官方网络七区可达。PC 几何样式只归 `preview/management.css`。

## 导航与草稿

侧栏 → 管理入口 → 独立 PC 标签页 → 七区切换 → 返回侧栏/关闭管理页。来自同一侧栏的管理页在本次预览会话内复用；这只是演示，不承诺正式 Host 的打开、去重或多窗口协议。

PC 返回、关闭和分区导航继续用原草稿 guard；有未保存内容时提供继续编辑/放弃草稿。浏览器关闭/刷新有未保存内容时使用原生离开提示。配置和选择保存不等于应用，跳转、返回、关闭均不隐式 APPLY/STOP。侧栏保持挂载，因此管理期间的侧栏草稿不丢失。

两个预览文档通过有界 postMessage 共享一次性内存 Mock；核对 iframe/WindowProxy 与会话 token，只允许既有 Mock 方法，不连接真实 Chrome、代理、网络或正式存储。直接打开 PC 链接是独立内存场景；从侧栏点击进入才共享该侧栏的模拟数据。关闭所有预览或刷新主文档会结束此内存会话，不宣称刷新恢复能力。

## 本轮完成条件与证据

| 目标 | 当前结果 |
| --- | --- |
| A 侧栏保持原业务排版 | 已用上述原始快照，四条代理、原按钮/字体/底部布局可见 |
| B 独立 PC 七区与返回 | ego-browser 真实打开另一标签页；七区、相关入口定位、返回及关闭已检查 |
| C 保存/导航不应用，保护草稿 | PC 修改→关闭提示→继续编辑→保存→返回侧栏回读已通过；同候选内存回执 APPLY=0、STOP=0、SAVE=1 |
| 侧栏草稿继续操作 | 本机预览中填写草稿→打开管理→返回，原字段仍在；选择直连不应用 |

11 月 7 日候选 HTML SHA-256（历史）：`26e1b8c1f8680fa6d9432de5622d8742920e780aa749e53e272f44bd1932cb28`。当前候选见文首。

[最终离线 HTML](preview/preview.html)、[Manifest](preview/preview.manifest.json)、[Context](preview/preview.context.json)。本机[侧栏入口](http://127.0.0.1:43263/projects/ai-proxy/preview/preview.html) / [PC 独立预览入口](http://127.0.0.1:43263/projects/ai-proxy/preview/preview.html?view=settings#/profiles)。优先从侧栏内点击管理演示完整链。

本机证据目录：`artifacts/ai-proxy/management-preview-20261107/`。`interactions.json` 绑定最终 HTML；`sidebar-final.png`、`pc-final.png` 是同候选截图。预览辅助区不属于业务 UI；生成 HTML 不手工修改。生成器编译当前预览输入，不构建 Browser、不写 dist/development、不晋升正式包。

## 停止点与延期

当前停止点为可供用户确认的预览。用户确认前，禁止进一步写 `src/`、`trusted/`、正式包或 Browser 框架；保留上一轮所有未提交业务改动，不自动回滚。

真实 Host 标签页接线、正式去重、多窗口/多文档一致性、刷新恢复、权限/撤权、真实代理、安装包晋升、安装、production、全 CI、完整矩阵均延期或 `NOT_TESTED`。UI 95+ 为本轮质量目标，评审只覆盖当前预览中的两个图标入口，不能替代整个产品或原生验收。旧方案见本机证据目录的 `superseded-DESIGN.md` 及旧计划，不自动续跑。
