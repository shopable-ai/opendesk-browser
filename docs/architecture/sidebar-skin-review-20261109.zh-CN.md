# OpenDesk 浅蓝灰皮肤本地复核记录

2026-11-09。复核对象是已合入 main 的 `8e26ea9ae578aa35fba1bbbf6251e87af388da4a`。浅色框架的色彩、48px 工具页头及连续状态区在源码组件 Chromium 环境中得到验证，本轮修复了页头间距偏离既有合同的问题。**正式验收尚未通过：不能宣布七个维度分别达到 95，最终候选的原生 Chrome、跨扩展主题和 production 验证仍不完整。**

## 修复与所有权

原提交删除重复页头规则后，`.sidebar-tool-view-head` 的有效 gap 从 2px 变为 `var(--space-1)`，即 4px，与 R20 已有紧凑合同不一致。本轮只将该 gap 恢复为 2px，保留 48px 高度、语义 Token、负 margin 与 gutter 的配对、桌面 30px 和粗指针 44px 命中区。

`tests/environment/sidebar-tools.test.mjs` 的 R14 安装入口测试仍要求旧的 34px 页头与 8px 下边距，本轮更新为当前 48px 连续表面和语义底线。没有增加文案或样式快照测试。

本任务提交范围为 `src/ui/tool-shell.css` 的上述单行、该测试单行及本记录。没有修改 Token 定义、`design-system.css`、`AutoSettings.tsx`、Web Flow 业务源码或正式安装包、SDK、权限、身份、epoch、撤权、UNKNOWN 防重放及 Router。工作区中这些文件存在的其他差异属于并行工作；同一 `tool-shell.css` 中的 Header actions 和高度链改造也不归本任务提交。

原生成器已重新生成三个受控预览文件并执行同源检查。其最新内容包含并行 Web Flow/Host 源码，须随对应 owner 的源码提交；本任务没有将这些混合修改代为提交或覆盖为旧版本。`preview/index.html` 仍只作设计参考，没有手工改写生成 HTML，也没有新增主题系统。

## 用户操作及运行证据

本机原始证据目录为 `artifacts/app-ci/webflow/skin-review-20261109/`，属于忽略的本地产物，不随本提交上传。正式复核截图集中在 `final/`，`final/evidence-index.json` 给出文件 SHA 和排除项。

冻结候选为 `1aacf89aef54368e2117e953d14846efd43e962be5a9f1a994d13450a20aaab5`；生成 HTML SHA256 为 `9c8a06f655dbf74666cd3540781efe1ed1ee5c499d191b6c00e37a43692f9077`。`source-parity-latest.json` 记录检查时 113 项输入与工作区一致。随后并行源码继续变化，因此冻结快照不能证明后来的整个工作区或最终 Git 提交与它逐字节一致。候选包含当时未提交的并行修改，候选 SHA 不是 Git 提交 SHA。

| 用户行为或保护 | 实际结果与范围 |
| --- | --- |
| 完整五 Tab、Host 页头、可信状态行、业务内容 | 同一冻结候选在 ego Chromium 中截图；不是只截 iframe |
| 320、360、400px 侧栏 | body/document 宽度等于视口；页头全宽、高 48px、gap 2px；状态区与 iframe 均 x=0、同宽，未见水平溢出 |
| 360px 垂直衔接 | 导航高 41px；页头 y=51，高 48；状态行 y=99，高 61；iframe y=160，未重叠 |
| 概览、脚本、记录 | 冻结候选切换成功，分别保存完整框架截图；没有运行 Task |
| 显式深色 | Host 使用暗色 paper，应用通过偏好保存并读回深色；完整截图为 `final/dark-360.png` |
| Enter、Escape、焦点 | Enter 打开运行与授权；Escape 关闭 overlay，`aria-expanded=false`，焦点返回 `webflow-runtime-open` |
| 粗指针 | `pointer:coarse=true`；五个可见 Host 按钮均为 44×44，视口与滚动宽度均为 360 |
| 长标题 | 前一冻结候选实测可见宽 176、内容宽 936，ellipsis/hidden 有效，卸载按钮右边界 349<360；未挤出视口 |

冻结完整壳浏览器 UA 为 Chrome/156（ego）。指定 `webflow-compact-browser.mjs` 使用本机官方 CFT Chrome/149.0.7827.55，通过 320/360/400px 的应用内布局、菜单、搜索、筛选、记录及键盘检查，保存 21 张截图；其 `compact/receipt.json` 单独绑定当时三个应用源码 SHA。该次 CFT 证据不覆盖 Host，不与后来的完整壳候选混记为同一次验收。

预览模拟 SDK/storage/权限/任务边界，禁止真实网络和 Task 执行。当前 fixture 缺少新高度合同的 Host 通知，应用内容下方出现白区；这限制了全高度和嵌套滚动结论，不能直接归因为原提交的产品故障。根文档媒体仿真没有建立跨 OOPIF 的跟随系统证据，早期 `host-dark-system-360.png` 不计为通过。早期 `host-measurements.json` 的 nav 空值及 panelHidden 取错子元素也不作结论，已由正确 overlay 测量和 `final/measurements.json` 替代。

### 真实 Mac Chrome

通过原生扩展详情页核实启用 ID 为 `ccfcjegpkdlgbclopjmadlcjedelidmf`，加载目录为本仓库 `dist/development`。没有发现本仓库 WXT/dev watcher；运行面为**静态开发包，serve 未连接**。`development-update.json` 的 revision 为 `fc74f1aeb3ae99de5bdc9047ed1672570cf537f68ee295d0e67b5a1d7df9c70a`，三个公共 CSS 指纹与当前源码均不同，屏幕仍显示旧 Host 皮肤。

实际完成：Web Flow v0.3.18 → 运行与授权 → 任务授权 → Escape 返回原按钮；工具设置子页 → 返回 Web Flow；返回扩展列表 → AI Proxy v0.3.1 → 对照公共返回/标题/设置/卸载入口 → 返回 Web Flow 概览。未点击运行、启用代理、撤权、卸载、安装或请求新权限；最终自动运行仍为 on。`mac/native-smoke.txt`、`extension-path.txt`、`ai-proxy-compare.txt`、`restored-after-compare.txt` 及截图保留这些局部观察。

没有覆盖日常输出、启动第二个 watcher、重载共享扩展或停止其他任务服务。上述安全操作通过仅证明旧安装包局部流程；最终候选原生样式、普通页面的运行时视觉、production 与正式包安装升级仍为 **NOT_TESTED**。

## 定向自动化与失败归因

| 检查 | 真实结果 | 本地证据 |
| --- | --- | --- |
| 用户列出的六个宿主 Node 文件 | 初次 20/31；最终 21/31，10 项失败 | `node-host-before.log`、`node-host-final.log` |
| 用户列出的三个 Web Flow Node 文件 | 最终 59/59 | `node-webflow-final.log` |
| R14 安装入口旧断言更新 | 1/1 | `node-intake.log` |
| Header secondary contract | 3/3；解析断言修复归并行 owner | `node-header.log` |
| 原预览生成器、同源检查 | 冻结时 113 输入一致 | `preview-build.log`、`source-parity-latest.json` |
| 指定 CFT compact 脚本 | 3 种宽度通过，21 张截图，零 Task 派发 | `compact/receipt.json`、`compact.log` |
| 完整壳 Chromium | 上表所列布局、显式深色、Enter/Escape、粗指针通过 | `final/measurements.json` 与七张截图 |

只读审查使用 `git archive` 临时快照对照父提交 `8520cb1bda25225e3d3a755c34df8a0bebfa87f9`，没有创建分支或 worktree。最终剩余 10 项失败均能在父提交复现；父提交批量运行还遇到 Vite/esbuild EINVAL，因此不把其整组总数直接与当前总数比较。原始日志保存在 `node-host-parent-baseline.log`。

这些既有失败涉及 Workflow SSR 按钮定位、Developer disclosure 结构、已迁移的统一列表/Quick Notes 路径、R21 旧选择器及不能解析颜色别名的断言、Clipper 已存在的正式包漂移。其中 R31 业务 CSS 对公共 disclosure 外观的覆盖是真实既有合同冲突；Clipper 漂移被新 Token 扩大，但并非本轮首次产生。没有删断言、放宽安全校验或替无关扩展重打包来制造全绿。

## 反方审查与评分

新浅色次级文字在白底约 5.23:1、页面底色约 4.83:1、muted 面约 4.87:1；导航正常/选中态约 5.08/5.42:1，均超过普通文字 AA 4.5:1。暗色 Host 背景读取语义 paper，未发现白色 Header 强制覆盖。负 margin 在所测宽度只补偿一次 gutter，没有观察到跨 iframe 样式泄漏或重复可信 Header。

独立只读审查子 agent 保留三类历史问题：system 暗色警告按钮使用浅色警告底而文字变为浅蓝，计算对比约 **1.84:1**；应用内部部分紧凑行操作及共享 Switch 的有效粗指针命中区没有完整证据；重要恢复说明和操作仍有 11px 字号。它们不由原提交引入，按本轮“既有且无因果关系的缺陷单列”要求记录，没有扩大修改其他 owner。

以下是七个维度的**有效条件评分**，评价已审查的源码和证据，不是七项正式 PASS，也不是外部人工专家认证。未执行的原生/系统主题/辅助技术验证保持 NOT_TESTED；其缺证影响相应维度，未虚构运行分数。

| 维度 | 条件分 /100 | 主要扣分依据 |
| --- | ---: | --- |
| 色彩与视觉品质 | 86 | 历史 system 警告按钮对比不足；完整 system 运行证据缺失 |
| 信息层级与布局密度 | 89 | 重要说明/操作 11px；全高度布局证明受 fixture 限制 |
| 共享组件一致性 | 94 | 并行 Header actions 缺最终候选原生证据 |
| 无障碍与键盘交互 | 88 | 应用内部及 Switch 命中区缺口；辅助技术证据不足 |
| 多扩展兼容与主题隔离 | 88 | 已有旧包双消费者对照，仍缺最终候选独立主题运行证据 |
| CSS 维护性与架构约束 | 83 | 既有追加覆盖、平行颜色定义、inline 布局耦合 |
| 真实运行、测试及证据完整性 | 82 | 最终候选原生/production 未证实；完整系统主题等运行证据不足 |

首轮冻结截图与 index 的 SHA 经独立审查核对，关闭此前候选绑定不清的扣分。该轮算术平均为 **610÷7=87.14**。结论为 **REQUEST CHANGES**，不满足每项及平均均≥95的正式目标。当前没有观察到本轮间距修复新增的阻断故障，但不能宣称整个产品无已知缺陷。

后续正式验收须先由对应 owner 收拢并行源码和高度通知 fixture，再在与源码一致的开发加载环境验证全高度、system 主题、普通页和多个扩展，最后按实际发布阶段补正式包证据。历史警告配色、命中区及现有根合同失败分别归其业务/公共组件 owner；本记录不将这些工作静默纳入一次间距修复。

## 后续补证：真实 Host / Bridge / 沙箱高度与系统主题

本节补充此前受 fixture 限制的结论，不将不同候选混成一份成绩。并行 owner 提供了 `tests/helpers/sidebar-tool-layout-server.mjs`；本任务只复用其真实 Host、Bridge、固定 React runtime 和 opaque-origin sandbox，没有修改这些实现。外部服务、安装数据及任务状态均为模拟，任务执行和权限写入被拒绝。

使用同一本机 CFT 149，在独立临时 Profile 中完成八张完整壳截图，资源已关闭。新候选 SHA256 为 `383fc9594c1ce041c08c28471be40b9c061b079a4bfda8042215be9229669ccf`，共 305 项输入（301 个文件及四个生成包摘要）；采证结束时 301 个文件指纹全部一致。证据在 `current-host-cft/receipt.json`、`evidence-index.json`，探针源码为其上级 `current-host-cft.mjs`。它们属于本地忽略产物。

| 补测操作 | 真实测量 |
| --- | --- |
| 320/360/400px 打开 Web Flow | 唯一 Host Header，全宽 48px；根文档无水平溢出 |
| 概览、脚本、记录 | 通过实际 CDP 鼠标事件切换，均保留完整五 Tab、Header、可信状态行及内容 |
| 画布高度 | 360/400px 下 iframe 与 `#webflow-app` 均高 580px，底部到 y=740；320px 下高 582px，不再出现旧 fixture 的底部白区 |
| 跟随系统暗色 | 根页面与 OOPIF 分别设置媒体仿真，两者 `matchMedia` 均为 true；应用真实 `data-theme=system`，背景 `rgb(18,28,44)`；Host Header 使用暗色语义 paper |
| 帮助末尾 | 实际点击 Host 帮助按钮；业务区 clientHeight=536、scrollHeight=1112、scrollTop=576，iframe 文档 scrollTop=0，末尾可达且无第二个文档滚动区 |
| 副作用与错误 | 无阻止的特权调用、无 Task start/stop、无运行时异常 |

首次诊断探针误取不带主题属性的外层 `.wf-app`，导致主题断言失败。该测量错误已修正为 `.wf-app[data-theme]`，不是产品缺陷；旧 `failure.json` 不计为通过，成功 receipt 与截图由 index 单独绑定。

另外复用原生成器的 `createWebflowPreview` 和原校验器，输出到本任务独立的 `current-source-preview/`，没有覆盖并行 owner 的三个受控预览文件。113 项输入同源通过，候选为 `35886598234c591bf1c3f5cb0fc65808ae114e9bb2d9bf77ebfe568247ed2ac5`，HTML SHA256 为 `8f9d24a625b6584d929791944633fdc7e0e5b58cd335c4e0fc9889c418529da3`；此预览候选与上述真实 Bridge 夹具候选分别记录。

补证关闭了旧 fixture 的全高度及系统主题缺证，但没有关闭最终候选的 Mac Chrome、普通页、多扩展主题与 production 缺口。再次只读核对 `dist/development`，revision 仍为 `fc74f1aeb3ae99de5bdc9047ed1672570cf537f68ee295d0e67b5a1d7df9c70a`，三个公共 CSS 仍不匹配源码，且没有本仓库 dev/watcher 进程。未重载共享 Chrome 或覆盖其输出。新候选仍包含并行未提交实现，不能冒称为 GitHub main 的完整运行证据。

高度链与 Header 接线的相关输入发生变化后，重新运行用户指定的六个宿主和三个 Web Flow Node 文件：宿主仍为 21/31，失败的十个名称与首轮完全相同；Web Flow 仍为 59/59。日志保存在新候选目录 `node-host.log`、`node-webflow.log`。没有扩大为根完整测试，也没有为这些既有失败修改无关消费者。

独立 code-reviewer 复算候选摘要、manifest 与四个包摘要，核对上述三张关键截图和测量，确认新证据有效。复核时只有 `projects/ai-proxy/src/App.jsx` 出现后续源码漂移，因此冻结证据有效，但不认证后来整个工作区。该评审也指出探针边界：系统实际颜色由保存的 computed style 和截图补足，自动断言只检查媒体与主题；业务 Tab 缺逐次 selected 断言，截图支持实际切换；帮助页通过设置 scrollTop 到底，没有补测滚轮与键盘滚动。这些限制没有写成完整交互 PASS。

新评分只恢复已被证据关闭的扣分，旧问题及未执行项保留：

| 维度 | 更新条件分 /100 | 仍保留的扣分依据 |
| --- | ---: | --- |
| 色彩与视觉品质 | 90 | system 普通态已证实；历史警告对比约 1.84:1，异常态未覆盖 |
| 信息层级与布局密度 | 93 | 画布填满且帮助末尾可达；11px 重要说明/操作仍在 |
| 共享组件一致性 | 94 | 当前 Header 有证据；缺最终候选原生及跨消费者对照 |
| 无障碍与键盘交互 | 88 | 本次未补 coarse、滚轮/键盘滚动或辅助技术覆盖 |
| 多扩展兼容与主题隔离 | 89 | Web Flow system 已证实；本次未打开第二消费者验证独立主题 |
| CSS 维护性与架构约束 | 83 | 新运行证据不改变既有追加覆盖、平行颜色定义及布局耦合 |
| 真实运行、测试及证据完整性 | 88 | 真实 Host/Bridge 证据增强；最终原生、production 仍未测 |

更新算术平均为 **625÷7=89.29**，独立复评仍为 **REQUEST CHANGES**。这是有效条件评分，不是正式七项 PASS；未执行项仍为 NOT_TESTED。保留用户“历史且无因果关系的缺陷只报告”的原范围；若将历史配色和命中区问题纳入本轮，需要明确这一范围调整，不能通过改评分规则绕过。

## 后续补证：第二消费者与局部主题隔离

复用同一 Host/Bridge 离线夹具，在独立 CFT 临时 Profile 打开现有 `minimal-html-starter`（真实 ID `runtime-globals-demo`），未修改该工具任何源码。新候选为 `2cdff4679f8a672faec9587ec1d72268c687881a8b268db7decfa7c3d63f9f85`；305 项输入含 301 个文件及四个包摘要，采证结束时 301 个文件全部同源。新五张完整壳截图、计算样式、调用记录及脚本 SHA 在 `consumer-theme-cft/evidence-index.json` 与 `receipt.json`，脚本为上级 `consumer-theme-cft.mjs`。没有覆盖前两轮截图。

实际验证：

- Web Flow 的 `system` 模式在暗色媒体中使用 `rgb(18,28,44)`，新增断言同时检查实际颜色、媒体与主题，Host Header 使用 `rgb(21,28,40)`。
- 在原应用偏好中保存浅色并读回，返回概览后 Host 保持暗色，Web Flow 内容为 `rgb(244,246,250)`；选择器通过标准 change 事件操作，不记作键盘下拉菜单通过。
- 打开未改的 HTML 工具，通过实际鼠标点击及既有 `currentPage.read` SDK 读取夹具的模拟标题；Header 保持唯一 48px，暗色 Host 下工具自身仍为白底、深色文字。再切 Host 到浅色，工具自身颜色不变。
- 关闭 HTML 后重开 Web Flow，应用自己的浅色偏好仍保留，Host 可继续为暗色。所测两消费者均为真实 opaque-origin iframe，无根或沙箱水平溢出、无特权写入或 Task 执行、无运行时异常。

这证明上述两个消费者的局部主题独立及公共 Header 行为，不外推为所有工具、Vue/React 或全部粗指针/辅助技术通过。浏览器、夹具与临时 Profile 均已释放。本轮没有产品源码变化，不重复前一轮仍有效的定向 Node 结果。

### 当前原生运行面冲突

再次只读检查日常 Mac Chrome，侧栏已由另一任务进入 AI 消息发送队列 `r15 → r17` 的安装审阅，界面正显示“确认更新”。本任务没有取消审阅、确认安装、请求权限或重载扩展，也没有启动开发服务覆盖共享运行面。冲突记录为 `consumer-theme-cft/native-resource-conflict.json`。这比仅凭旧静态 CSS 不一致更明确地说明：当前无法占用此侧栏执行候选重载和连续验收，必须保留该任务的审阅与授权状态。

同时检测到 PID 39802 的独立 development 构建，实际 cwd 为 `/private/tmp/opendesk-surfaces-20261109-native`；它不是本仓库日常 watcher。本任务没有停止、重启或复用该任务的 Profile/构建输出，未将其进行中状态当作本候选通过证据。

独立 code-reviewer 复算新候选、冻结 manifest、四个包摘要、receipt、脚本及五张 PNG 的 SHA，确认一致。复核时 301 个源文件仍一致；HTML 工具配置和源码与 `8e26ea9` 一致，标题确实经实际点击和 SDK 返回。评审接受在“Web Flow＋普通 HTML、离线真实 Host/Bridge/opaque sandbox”范围内关闭第二消费者及局部主题隔离缺口，未发现新增因果回归。

条件分只调整受本次证据影响的两维：多扩展兼容与主题隔离由 89 升至 94，真实运行、测试及证据完整性由 88 升至 90。其余维度沿用上表：**90 / 93 / 94 / 88 / 94 / 83 / 90**，最新平均 **632÷7=90.29**，仍不满足七维分别≥95。原生、production 与未执行的键盘/辅助技术项仍为 NOT_TESTED；偏好保留只证明同一夹具会话中的关闭重开，没有扩称浏览器重启后持久性。

当前实际阻塞为：最终候选没有源码一致且可安全占用的 Mac Chrome 加载面；共享侧栏正在另一任务的安装审阅中，不能绕过。原生候选不可用已在连续三轮目标工作中观察到，本轮收拢两消费者补证后，剩余验收需要原运行面释放或协调。历史且无因果关系的配色/命中区问题仍遵守原范围，扩围问题已提出、尚未收到答复；未借自动续跑擅自扩大修复。

## 最新补证：日常 Chrome 已加载新宿主皮肤

用户明确答复“你直接继续就行”后，本轮恢复日常开发入口，没有重新设计皮肤或另建预览。原生 Chrome 扩展详情、既有 Profile 配置和 Native manifest 均核实同一 ID `ccfcjegpkdlgbclopjmadlcjedelidmf`，仍加载 `/Users/shopme/Documents/workspace/opendesk-browser/dist/development`；Native doctor 显示已安装但未连接。本轮未修改配对配置、安装身份或权限。

启动前没有本仓库 watcher 或占用 43119/43120 的 writer。本轮启动唯一 `npm run dev`，沿现有开发更新保护应用输出；没有点击扩展重新加载、重装 Page Program、重放未知操作或刷新业务网页。只读检查 RunHost slot 空闲；15 条旧 journal 的资源退役回执满足原保护，未知副作用记录仍保留。AI Send Queue r17 的 managed cleanup 仍为 `unknown`（150 条），未清理、重试或记为成功。这里的资源退役不等于确认未知业务效果。

首次 watcher PID 80881 完成输出后遇到 Node 默认约 4GB 堆上限，以 134 退出。本轮只恢复自己的 writer，使用 `NODE_OPTIONS=--max-old-space-size=8192 npm run dev`，PID 85127；恢复后输出完整并显示 `RUNNING`，43119/43120 正常监听。没有停止其他任务服务。首次曾观察到日常 Chrome 与 dev 端口建立连接；末次网络快照只见 CFT/ego 连接，不能用它们替代日常 Chrome 的当前 WXT 连接证明。writer 留给持续开发和已协调的 Host 高度修复 owner 使用，不宣称长期内存稳定性已通过。

### 源码、输出、加载与安装分别记录

| 层次 | 本轮实际证据 |
| --- | --- |
| 皮肤源码 | 原皮肤提交 `8e26ea9`、间距修复 `47b7bf6` 仍在 main 历史；本轮没有新增产品源码修复 |
| 公共 CSS 输出 | `design-tokens.css`、`design-system.css` 的源码、磁盘产物及 manifest SHA 完全一致；`tool-shell.css` 经原 `trustedToolShellStyle()` 与产物逐字节一致，其中追加固定书签 CSS，不能把整文件 SHA 不同误判为源码漂移 |
| 原生日常宿主 | 调试页实读“开发服务已连接”，revision 为 `2bbde69c8ae00839156a75f4c1148e69655023da072eb9ccb0b170e82ab7bac7`；真实 Side Panel 的 computed style 和操作记录如下 |
| 后续磁盘输出 | 并行阅读目录改动使磁盘 revision 变为 `e4f3bac9501ab24c6284c4658facc32d304c3ac4c5b87436cc514a1dacf5098a`，三个公共 CSS 摘要未变；未重新证实该较新整包已被日常 Chrome 加载 |
| 已安装消费者 | 日常 Chrome 为 Web Flow v0.3.18、AI Proxy v0.3.9；其他 owner 在 ego 更新 Web Flow v0.3.21，不等于日常 Chrome 也完成升级 |

`tool-shell.css` 的源码 SHA 为 `e6aeb8b7f851ff2abf1cf23817c6e6a030e9e7a26f9f194010b90a9325aa1ec0`，原打包器输出 SHA 为 `4712eab198bc4b09942d637af70950802d88b58b00b9a44d4350f1578b0eb538`。Native DevTools 内的异步 fetch/digest 探针没有取得成功回执，因此不把它记为运行中字节摘要证明。磁盘同源、原生 revision 和 computed style 是分别成立的证据，不能合成为“最终 Git 提交全文件已原生验证”。

### 真实用户操作与布局

本轮使用原生 Mac Chrome 157.0.8103.38 的自建窗口，真实 Side Panel 宿主实例 `70786591-00a8-4baa-aa7f-1cfd0b2d5d1c`，没有以普通标签页或离线 fixture 代替。

| 操作或测量 | 实际结果 |
| --- | --- |
| 完整工作台 AX | 五个产品 Tab 和 development 专属“调试”均存在；Web Flow 唯一 Host Header、可信自动运行行与 opaque sandbox 同时存在 |
| 360px 实际几何 | 视口 360×825、DPR 2；Header `(0,51,360,48)`、gap 2px、背景 `rgb(255,255,255)`；iframe `(0,160,360,665)`，底部到 825；根与 body scrollWidth 均为 360 |
| Header 控件 | 返回、帮助、应用设置、工具设置、卸载各 30×30；最右按钮 right=349<360；没有测到 DOM 水平溢出 |
| 运行与授权 | 查看当前任务及任务授权；Escape 关闭并返回原按钮焦点；未 Run、Stop、撤权或改变自动运行 on 状态 |
| 两类设置 | 工具设置为 `Web Flow / 设置`，返回路径正确；应用设置没有重复可信 Header，主题浅色/深色保存并显示“偏好已保存并读回”，最后恢复“跟随系统” |
| 第二消费者 | AI Proxy v0.3.9 的返回、标题、更多操作、工具设置及卸载入口存在；工具设置显示 `AI Proxy / 设置`，返回成功；未启用代理或改变其线路/授权 |
| 普通页面 | “我的”任务列表、参数与最近结果正常显示；未编辑参数或执行任务 |

原生截图的右边缘被采集范围裁切，不能当作全窗五 Tab、所有按钮均清晰可见的视觉证明。上述完整 360px 几何来自原生 DevTools 的 DOM 读回和 AX；截图仅证明可见区域，裁切本身也不等于产品 DOM 溢出。没有以裁切截图提升全窗验收结论。

独立复核还确认 `ai-proxy-native.png` 与 `ordinary-my-native.png` 完全同 SHA，均没有显示侧栏内容，故排除这两张 PNG 的视觉证明；第二消费者和普通页面只接受各自 AX 中的真实页面状态及操作记录。

已安装 v0.3.18 在偏好保存后仍把界面标为 dirty，导致帮助/应用设置被禁用，尝试返回列表触发“放弃未保存内容并继续”。本轮选择取消，保留原内容，没有通过控制台重置 dirty、丢弃草稿或重载绕过保护。该现象未证明由皮肤 CSS 引起；当前 Web Flow 源码已有相应状态对账实现，其安装与复验归 Web Flow owner，本轮不代替它升级正式包。故原生帮助滚轮/键盘滚动没有补齐，不能沿用离线 scrollTop 证据冒称通过。

本轮证据在 `artifacts/app-ci/webflow/skin-review-20261109/native-dev-01a1bf2d/`，`receipt.json` 记录当前磁盘指纹、原生观察指纹、CSS 同源、截图/AX SHA 和排除项。原生 320/400px、完整 system 媒体主题、粗指针、辅助技术、滚轮/键盘滚动、日常 Web Flow v0.3.21 升级及 production 继续为 **NOT_TESTED**。多任务原生焦点争用时保留其他任务窗口和安装审阅；本任务的旧消费者草稿保护也继续保留。

本轮仅补证和记录，没有新增源码变更、相关新安全失败或失效的 Node 证据，因此没有重复前述定向 Node 测试，也没有启动第二个静态构建、production 或全组回归。并行 owner 已明确接管现有 Host 高度修复的提交及正常/矮侧栏复验；本任务没有代为暂存其 `tool-shell.css`、`tool-host.tsx`、`sidebar-tools.js`、`bridge.js`、`sandbox.html` 等差异。

独立 code-reviewer 实际查看五张 PNG，核对 20 项附件摘要和原生 DOM 记录，未发现新增可归因于皮肤改动的回归。仅恢复本轮真实补齐的局部原生布局与运行证据分数：

| 维度 | 最新条件分 /100 | 剩余主要缺口 |
| --- | ---: | --- |
| 色彩与视觉品质 | 90 | 完整原生 system 和历史警告对比 |
| 信息层级与布局密度 | 94 | 11px 重要说明及完整矮侧栏视觉 |
| 共享组件一致性 | 94 | 完整原生视觉与运行字节绑定 |
| 无障碍与键盘交互 | 88 | coarse、Switch、滚轮/键盘滚动、辅助技术 |
| 多扩展兼容与主题隔离 | 94 | 当前候选完整跨消费者视觉 |
| CSS 维护性与架构约束 | 83 | 既有追加覆盖、平行颜色及布局耦合 |
| 真实运行、测试及证据完整性 | 92 | 当前源码安装、完整原生、持续连接及 production |

最新算术平均为 **635÷7=90.71**。本轮只读审查结论为 **COMMENT（未见新增因果回归）**，不代表整个产品正式通过；七维分别及平均均≥95的正式目标仍未达成。本轮提交仅包含本记录的新增证据和限制，不包含其他 owner 的源码或正式安装包。
