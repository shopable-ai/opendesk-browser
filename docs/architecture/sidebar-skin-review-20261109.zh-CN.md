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

最终冻结截图与 index 的 SHA 经独立审查核对，关闭此前候选绑定不清的扣分。算术平均为 **610÷7=87.14**。结论为 **REQUEST CHANGES**，不满足每项及平均均≥95的正式目标。当前没有观察到本轮间距修复新增的阻断故障，但不能宣称整个产品无已知缺陷。

后续正式验收须先由对应 owner 收拢并行源码和高度通知 fixture，再在与源码一致的开发加载环境验证全高度、system 主题、普通页和多个扩展，最后按实际发布阶段补正式包证据。历史警告配色、命中区及现有根合同失败分别归其业务/公共组件 owner；本记录不将这些工作静默纳入一次间距修复。
