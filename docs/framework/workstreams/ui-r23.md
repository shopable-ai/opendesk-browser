# R23 · UI Design System / 渐进架构收敛执行记录

- 日期：2026-10-11
- 读取的远端 main 基线：`d56c84273f7fcab8b837269ef5472fafd1fd19e5`
- 环境：GitHub Connector 远端仓库（非用户 Mac 本地工作树），无 macOS Chrome/Native Host；容器网络无法 Git checkout，也无现成 WXT dist。
- 归属：`src/ui/design-tokens.css`、`src/ui/design-system.css`、`src/ui/tool.html`、`src/native-agent/settings.html` 与其新 CSS、Workspace Tailwind Tokens 引用、显式静态资源及定向测试。没有触碰共享 Profile、端口、生成 dist、Native 连接状态或旧测试证据。
- 关联架构说明：[browser-ui-r23.zh-CN.md](../../architecture/browser-ui-r23.zh-CN.md)

## 发现与通过条件

| 实际缺口 | 根因位置 | 本次变更 | 必须验证 |
| --- | --- | --- | --- |
| Side Panel 的 Tokens 与页面级 overflow/reset 耦合 | `src/ui/design-system.css` | 提取纯 :root Tokens，保留 Side Panel 页面基样式 | 五页签/独立打开不回退；Tokens 无页面全局选择器 |
| Native Options 独立色值、内嵌样式、窄视口按钮可能拥挤 | `src/native-agent/settings.html` | 引用纯 Tokens 与本地 `settings.css`，可滚动、操作按钮自适应、明显焦点 | 设置授权手势不变；窄视口/200% 可滚动；资源被白名单允许 |
| Workspace 再定义 R20 色值，修改可能漂移 | `src/native-agent/workspace.tailwind.css` | Tailwind CLI 构建期内联同一 Tokens | 产物含变量，不残留 @import，CSS 校验/开发监听通过 |
| 新共享资源未被固定打包链认识 | `scripts/prepare-public.mjs` / `verify-package.mjs` | 显式复制、白名单、CSS 安全扫描与漏资源负例 | production / development build、verify、变异测试 |
| React 是否必要无实际负载证据 | 现有原生 DOM + 严格 IIFE 合同 | 暂不安装新运行时或组件库 | 保持 SW/JS 入口数量、权限/CSP、包体预算不变 |

## 证据与未完成项（提交时记录）

| 层级 | 状态 | 说明 |
| --- | --- | --- |
| GitHub 源码核查 | READ_PASS | 已读取 `AGENTS.md`、package/WXT、三类 UI、静态资产合同、R20/R21/R22 记录与现有测试 |
| 源码编辑 | SOURCE_CHANGED | 仅 R23 范围；提交后必须核对 SHA 和 CI 结果 |
| GitHub Actions 编译/构建与源检查 | CI_PASS（R23 精确生产输入） | [R21/R23 质量 CI · b5cd1d5](https://github.com/shopable-ai/opendesk-browser/actions/runs/38115931017)：源语法检查 355 个文件；生产、开发 WXT 产物和双包 verify 全部通过 |
| R23 Node/样式与严格包变异 | CI_PASS | [同一 CI](https://github.com/shopable-ai/opendesk-browser/actions/runs/38115931017)：受影响模块 89/89；新旧 CSS 生成/资源缺失/不安全导入等 13/13 |
| Side Panel 五页签 Chrome 静态布局 | STATIC_MARKUP_CHROME_PASS | [R19/R21 实际 Chrome 静态布局 CI · f71e566](https://github.com/shopable-ai/opendesk-browser/actions/runs/38115844258)：96/96 视口 × 状态场景；输入自 f71e566 到 b5cd1d5 的产品 HTML/CSS 未改变；非真实扩展 RunHost/权限 E2E |
| Mac Chrome 实际 Side Panel、真实 200% 缩放 | NOT_TESTED | 需独立 Profile、当前安装包身份、可信控件操作与缩放截图 |
| Native Options 权限与 Workspace 实际保存读回 | NOT_TESTED | 需用户 Mac 独立 Chrome、可信授权、已配对 Host 与实际目录；不能用原生握手替代 |
| macOS CI 原生 Host 诊断 | PARTIAL_PASS | [Native Agent R1 · b5cd1d5](https://github.com/shopable-ai/opendesk-browser/actions/runs/38115930958)：macos-15、macos-15-intel 两套 Native Host IPC 作业 success；没有证明 R23 Workspace 编辑保存 E2E |
| 全量环境 Node 回归 | FAIL（并行工作流缺口） | 同一 Native Agent R1 bridge-components 的 npm test：967 pass、1 fail、7 skip；`tests/environment/knowledge-inbox-r1.test.mjs:199` 期待 `false` 实得 `undefined`，知识收件箱 Workspace 导入场景；本轮未修改该模块，不能据此关闭整体验收 |
| 95+ 专项验收评分 | NOT_SCORED | 缺 R23 候选的真实插件截图、焦点/读屏、保存与内存测量；六专项不能宣称 95+ |

## 最小验证命令（运行在可安全使用的本机 main 工作树）

```bash
git status --short --branch
git fetch origin main
git pull --ff-only origin main     # 仅在本机未提交修改/并行任务允许时
npm ci
node --test tests/environment/ui-r23-design-boundaries.test.mjs tests/environment/sidebar-r21-design-system.test.mjs
npm run check
npm run build
npm run build:dev
node --test tests/environment/workspace-style.test.mjs tests/environment/package.test.mjs
npm run verify
```

再用 **新的、独立 Chrome 测试 Profile** 加载 `dist/production`，记录 Git SHA / 扩展 ID / 插件路径。分别打开五个 Tab、独立工具页、`native-agent/settings.html`、`native-agent/workspace.html`，进行 320/360/400/480/600px、浏览器 100% 与真实 200% 缩放下的滚动、长字串、键盘焦点、空/错/加载/禁用检查，并在受控目录进行保存读回及撤权/冲突保护。真实业务和 Native PASS 必须保存本轮候选的证据；遇到旧候选结果，只引用历史记录，不升格。

提交前后记录生产包两类 CSS 实测字节数、服务工作线程 JS、完整包大小；未测的指标不填写收益结论。

## R23 证据绑定、字节预算与 React 结论（2026-10-11 追加）

- 源码变更：`77ea8c0233b3ca21f67068f99499ee0b8663fe3e`（Tokens/Settings/Workspace/安全合同）；`f71e56616816c995febb0ceb4c91efceb4663ad7`（真实静态 Chrome 夹具加载第三张 CSS、CI）；`189b68f2cf252b692da63f79578b65652f23c059`（R19 旧间距断言改读新 Tokens）；`b5cd1d55132a3dda023876ba1f89308a3b57f574`（受影响 CI 路径触发）。未更改 nativeMessaging 权限、Worker、控制协议、工具沙箱或 package.json；未引入 React。
- 初次 `f71e566` 的 Side Panel R21/Tools R1/Sidebar R1 P0 CI 分别因**同一旧 R19 精确 CSS 变量位置断言**失败；保留失败历史。修复后 [R21/R23 专项 CI](https://github.com/shopable-ai/opendesk-browser/actions/runs/38115931017)、[Sidebar R1 P0](https://github.com/shopable-ai/opendesk-browser/actions/runs/38115930922)、[Page userscript dependencies](https://github.com/shopable-ai/opendesk-browser/actions/runs/38115930919) 成功。Native 环境全量失败另列，未隐藏。
- WXT 固定资源门禁参考 [真实 Production+Development 包容量 CI（f71e566）](https://github.com/shopable-ai/opendesk-browser/actions/runs/38115844221)，与 R23 成功 CI 的生产包一致：`packageHash=8a9b3b060fe25a9920ac1a42ee567d02361dbb21904d6b02790c178692e808a9`，开发包 `packageHash=2a3458e7945a7e8109b7b25273c71af3f3390c25d42189ff9e5221b5d98a00c5`。这是 CI 构建身份，不是假称本机 dist。
- 实测 production **原始字节**（非 gzip）：`native-agent/workspace.css` 28,838 B；`native-agent/settings.css` 2,166 B；`ui/design-tokens.css` 812 B；`ui/design-system.css` 3,306 B；`ui/tool-shell.css` 48,924 B；`ui/tool-shell.js` 316,549 B；`sw.js` 320,278 B（预算 327,680 B、余量 7,402 B，仍处于 CI CRITICAL 等级）。同一 R23 构建已通过门禁；尚未测 Side Panel 首屏/切换毫秒及重复打开内存。
- Workspace 新编译 CSS 对 R22 记录的 28,625 B 基线增加约 213 B；共享原生 Sidebar CSS 从历史 3,757 B 的 design-system + 48,924 B 的 tool-shell，变为 812 + 3,306 + 48,924 B，**增加 361 B**，不是性能收益。Native Options 多 2,166 B 的外部 CSS，替代旧内嵌规则并复用现有纯 Tokens。新增 React/React DOM 开销为 **0 B**。
- React 决策：**NOT_ADOPTED**。现有原生 UI 与已有的 `od-*` 共享语义类足以处理本轮识别的问题；没有经过包体、DOM 渲染所有权、可信手势与生命周期的明确收益证明。没有创建假试点页面。
- 并行变更：提交后其他工作流对知识收件箱的 CI 文档/证据另行推进。R23 不修改他们的业务文件；本记录不声明其失败已由 R23 修复。

## 六专项独立验收口径（分数均未达到可评条件，不以平均值掩盖缺口）

| 专项 | 已有受限证据 | 实测等级 / 扣分和待测项 |
| --- | --- | --- |
| 视觉一致性 | 96 个静态 Chrome 布局状态/视口，Tokens 统一 | `NOT_SCORED`：正式 Side Panel + Options + Workspace 真实 100/200% 截图/对比未测 |
| 交互与无障碍 | 89 个相关 Node 合同；图标命名等既有断言 | `NOT_SCORED`：真实 Tab/Shift+Tab、屏幕阅读器、焦点恢复、浏览器 200% 未测 |
| 组件架构与维护性 | 唯一 Tokens、原生复用类、边界测试 89/89 | `NOT_SCORED`：仍需 UI review；本轮未声称所有重复 DOM/订阅问题已修复 |
| 性能与产物体积 | 产物真实字节、固定入口预算 PASS；React +0 B | `NOT_SCORED`：SW 仅余 7,402 B；首屏/内存/事件泄漏与实际用户负载未测 |
| MV3 安全与生命周期 | CSP/白名单/样式恶意资源拒绝 13/13；macOS Host IPC 双作业成功 | `NOT_SCORED`：真实扩展生命周期、授权可信手势与 Native 撤权未测 |
| 功能回归与证据完整性 | Side Panel CI 89/89、静态 96/96、双构建 PASS | `NOT_SCORED`：完整环境 Node 回归知识收件箱 1 FAIL；真实工具安装/RunHost/Native Save E2E 未测 |

**完成边界**：R23 共享 Tokens、三个受信任页面样式、显式打包合同及 CI 静态/组件门禁已交付到远端 main；本机真实 Chrome/Native 及六项 ≥95 分验收**未关闭**。本机补测必须按当前实际 main SHA 和构建 packageHash 重新绑定。不能把上述 CI PASS 或旧候选的真实测试提升为最新 Main 的整体 F3/ZIP 通过。


## 本机 R23 Final 补测（2026-10-11，01a1299e）

状态：**PARTIAL_ACCEPTANCE / NOT_FULL_PASS**。本轮在 main 进行，未创建分支/worktree/PR。完整逐候选原始记录、截图、评分口径和已知失败见 [本机补测工作流](ui-r23-final-01a1299e.md) 及 `evidence/ui-r23-final-01a1299e/`，历史表保持原候选身份。

- 最新本机输入 `b9eb7540108ac565ec2172a428daa002ff686056` 加本轮知识宿主最小修复；独立构建目录 `.runtime/ui-r23-final-01a1299e/candidate-fixed/dist/production`，实际CFT扩展ID `ocnmfegmbacpipedfmmepecallahjfni`。生产packageHash `14af113c272d0c189de40351331941dfe669eeb0f21a0bf88a18c758db6b7b00`；开发 `6aff0f03d2519d5cc273d6b28ef1cd5c7901362f3461a698088f5b5a4191aeaa`。根dist未覆盖，未将它冒充本轮包。
- npm ci、check358、双构建、verify通过；R23/样式/包/知识定向36/36。真实扩展布局80/80覆盖五页签、独立工具、Settings和Workspace的五宽与Chrome100/200%；宽度由CDP viewport控制。知识独立页原“工具宿主文档已变化”为真实缺陷：扩展TAB没有webNavigation frame，改按唯一live TAB context精确核验。修复后实际独立工具五宽/两zoom刷新10/10、SidePanel刷新PASS；只knowledge-host.js变化，其他界面证据按未变输入复用。
- 历史知识 `:199` 对应场景原owner后续原始证据和本轮专项均PASS；没有修复其可能的Linux异步等待时序风险，原CI失败不删除，Linux本轮NOT_TESTED。
- 沿用以上六专项：视觉一致性 **95**、交互与无障碍 **92**、组件架构与维护性 **96**；性能与产物体积、MV3安全与生命周期、功能回归与证据完整性 **NOT_SCORED**。缺首屏/内存、Native授权/保存读回/冲突/撤权、完整环境回归，不能宣称六项95+或整体PASS。
- 生产SW320407 B（预算327680，余7273）；tool-shell.js320285 B；Workspace CSS28958 B、Settings CSS2166 B；整包1307663 B。预算未改。根npm ci曾误执行，操作失误及无法证明并行进程无影响的限制已记录；根dist97文件最终哈希未变。远端新增文档提交879d0c03使main重新分叉，ff-only条件不成立；未强行集成或发布。


最终闭合：修复提交 `698409af1308bc9c49431d43889976df1138c3a8`；`candidate-binding.json` 逐项验证构建sourceInputs与此提交一致。并行集成后本轮 `git pull --ff-only origin main` 成功（Already up to date），五个R23指定提交均包含；此前ff-only分叉阻断已消除。保留Native/性能/完整回归及根dist加载的NOT_TESTED边界。三个本轮CFT Profile已关闭，其他资源保持运行。


## 2026-10-11 真实 Native 续验及当前 main 冻结（01a1299e）

本段补充并取代历史本轮记录关于“本轮 Native 未测试”的当前结论，保留历史原文和失败。完整续验报告：`evidence/ui-r23-final-01a1299e/native-turn2/final-report.md`。当前 main 候选 e83738816d108506e13f28bd3d4e3be48ac30e4e，258构建输入完全一致；生产packageHash4f0de41aca0a1e7c80406e4bab0619d464898b7f5addaf933d813048aef28d06，真实扩展fahogihogbphclgicdghfelfikllgapk，加载candidate-main-current/dist/production。38/38定向组件、80/80布局复用与当前R24独立刷新10/10通过。真实Native文件打开/草稿/显式写盘/读回/冲突/断联/重连/撤权通过；保存和拒写都保留原始Native Port包与磁盘SHA。焦点与撤权控件缺陷分别由整合者提交b4094708、388b2535并完成本轮真实复测。

六专项：视觉95、交互/可访问性95、架构/可维护性96，性能、MV3完整生命周期、整体功能/证据完整性均NOT_SCORED。整体仍PARTIAL_ACCEPTANCE：根dist实际只读加载efhcmggbgamacpfhhmooelgdkepdcghh但属于OLD_DIST，原CSS失败保留；原Linux :199失败的同环境复核、性能和完整生命周期仍缺证。禁止以本段宣称整体PASS或最终F3。根40/57构建文件和原R22授权未改，自有Chrome/Profile与测试授权已清理。
