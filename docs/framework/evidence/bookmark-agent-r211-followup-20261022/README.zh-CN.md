# Bookmark Agent R2.1.1 本地真实验收补证

核心收藏闭环已在新候选的真实 Mac Chrome for Testing 155.0.8059.39、正式安装扩展及 Native Codex 0.159.2 上完成。整体正式验收未通过，七维评分尚未全部达到 95。完整机器可读判定见 `acceptance.json`；前一轮证据为相邻目录 `../bookmark-agent-r211-local-20261022/`，旧候选的测试不冒充新候选复验。

## 当前完成了什么

在真实 SIDE_PANEL 中仅发送一次「把当前页面放入测试收藏夹，如果没有，就创建目录」。新候选使用两次真实模型决策，执行两个动作，产生两次真实 SDK create 和两个 Chrome onCreated；独立 getTree 确认目录 46 和网页书签 47。UI 最终显示「已核实：当前网页已在『测试收藏夹』中。」用时约 134.4 秒。Native 只读数据库审计与浏览器记录一致；模型元数据为 gpt-6.1-sol / openai，不是 Provider 侧逐请求模型证明。

随后再次单次发送同一句话，模型直接提出完成核验；一次真实决策、零动作、零 SDK 写入、零新增节点，独立树读回一致。这是直接完成的复用路径；动作级 ensure/create 幂等另有旧候选证据，不混为同一次测试。第二次点击的两行同时间戳 trace 来自残留被动观察器，独立 Native 仅匹配一个 turn，并非两次 Send。

原始五项任务中，多轮决策、NOT_FOUND 续轮、原始目标核验已有真实证据。安全生命周期及完整正式矩阵仍有缺口；不得把一个成功请求当成所有十二场景通过。

## 实际修复了什么

累计业务修复还包括已推送的 `05218b090d1f47817e308cc66bd41845ffb6986e`：按原始目标独立核验完成、执行前给有界 schema 反馈、Provider 等待期间遵守 Stop/总时限、发送时绑定网页身份与固定有效期、区分 AI 上下文取消和书签撤权，并去除重复恢复反馈。对应源码及旧候选真实证据见相邻首轮证据目录；这些既有成果没有重写或回退。

业务提交 `a36689ac0ecad72ad378144ad39812a72d31ef62` 仅修改既有 loop、既有 HTTP adapter 和对应测试：纯读取、零已确认步骤、零已发出写入的计划允许对实际 Host `E_CHROME` 重试一次；已知 HTTP 502/503 通过数值 httpStatus 进入一次续轮重试。UNKNOWN、部分执行、已发出写入、上游未确认终止、撤权和 Native 模型请求均禁止相应重试。首次 conversation.request 的 HTTP 失败不在此次重试覆盖中。

不新增 Provider、SDK、Host、Authority、React 根或后台 Agent 平台。正式工具包仍为原 0.3.10、88194 字节，源码和包一致；无需晋升一个内容未变的副本。tool-shell 从 1190116 增至 1190590 字节（+474）。

离线预览另修复了 05218b090 引入的合同不匹配：测试请求未提供授权，触发正确的生产默认拒写。提交 `6e4e930772820c029163d492a12786e1c6456284` 仅补齐绑定 signal/release 的模拟授权，并让 driver 分页读回 mock SDK；不放宽生产守卫。完整预览从 CI 15/40、本地 smoke 4/10，修复后达到本地 40/40。固定 iframe 改高后增加子帧两次绘制等待，保留同一命中断言，解决本地观测的时序失败。此证据仍是纯 fixture，不计真实 Provider。独立审核见 `ci-r13-independent-review.md`。同提交 CI [39701416861](https://github.com/shopable-ai/opendesk-browser/actions/runs/39701416861) 的 react-chromium 与独立沙箱预算 Job 已通过；trusted-source-build 在构建/包校验之后被原有 1056 KiB 门槛拒绝，日志已确认，门槛未修改。

## 测试证据

| 检查 | 结果及边界 |
|---|---|
| r21 loop 定向测试 | 57/57；包含在联合测试中，不重复相加 |
| r* 对话、Bookmarks SDK、React 生命周期、Responses/本地 HTTP 联合测试 | 326/326，无跳过；详见 followup-regression.log |
| npm run check | 1002 文件通过 |
| npm run build:sidebar-tool -- examples/sidebar-tools/bookmark-manager | 通过；原正式包 PROJECT_PACKAGE_MATCH |
| npm run build；verify-package dist/production | 通过；production hash a220e15f05820c6cffa0f776bc383c0836a822faf889d4360a4e089d4078278e |
| npm run build:dev；npm run verify | 通过；development hash fa1c9a5e4de54eb0d782c6a536d9cde36de8ed81b3a6713250d20eb0c0dd063a |
| 源码同源 Chromium 预览 | 两个 viewport 通过；明确为 MOCK_BROWSER_INTERACTION_PASS_NOT_INSTALLED |
| R2.1 CI | [39698306861](https://github.com/shopable-ai/opendesk-browser/actions/runs/39698306861) 的 agent-contract、agent-build 均 success，source a36689ac0；不代表所有关联 CI 绿灯 |

构建使用非 Git 隔离快照：main f482c7cf 加本任务三个文件。此快照不是最新整仓二进制；新旧候选、源码和产物哈希分别保留。早期联合检查用 Node 26.3.1，修正后的 production/development 构建用 Node 24.16，CI Node 22，均满足项目 >=22.12。静态开发包未当成持续开发连接证明。

一次构建命令误在根目录执行，已被输入漂移守卫拒绝，未用于安装或验收。其拒绝日志保留；根 dist/production 曾是目标，不能称根输出完全未触及。没有停止其他进程，也没有用旧包覆盖日常 dist/development；后续成功构建都在隔离快照完成。

## UX 与异常恢复

真实物理 Side Panel 360/400/440/960 像素、深浅主题共八状态通过；320 请求被该 Chrome 钳制为 360，320 截图不可冒称 320 通过。真实键盘遍历、分隔条 Home/End/方向键、关闭后焦点恢复、Space 重开、独立日志/树滚轮、底部输入及书签编辑/对话双草稿保留均有记录。AX 语义检查通过，不替代实际读屏播报。网页 zoom=2 不替代 Side Panel 自身 200% 缩放，CDP touch 不替代硬件触屏。

T9 首次退出被 busy guard 拒绝，之后真实产生了两个写入，因此原“15 秒无写入即 PASS”的 driver 判定已纠正为实际切换未测。另一次真实关闭文档并重开，原目标确已消失；从 Send 起约 425 秒及重开读回无新增语义节点，但 Native durable turn 仍 inProgress，不证明仍存活，也不证明取消终态。旧 T8 的写后丢确认、UNKNOWN 和 worker/reopen 不重放仍保留其特定断点范围。

## 专家独立评分

| 功能 | 架构 | 连续性 | 异常恢复 | 权限安全 | UX/可访问性 | 真实证据 |
|---:|---:|---:|---:|---:|---:|---:|
| 95 | 90 | 93 | 94 | 94 | 93 | 94 |

每项支持证据和扣分见 `independent-final-review.md`；未自行抬分。

## 用户现在能做什么与剩余工作

在已安装、已合法授权且 Native Provider 就绪的书签管理中，打开目标网页，单次发送原句即可请求完整收藏；本轮专用 profile 已清理，不声称已替换用户日常加载环境。

未关闭：真实 HTTPS/Responses 及真实暂态恢复；Provider/实例切换和 Native 取消/晚到结果终态；其余 T10 超时/更新/重复计划矩阵；真实 320、Side Panel 200%、硬件触屏和读屏；关联 CI 红灯的分类与收尾（R13 fixture 已本地修复，同提交 CI react-chromium 已 success，整体 workflow 仍因独立体积门槛失败）。较早独立 Native 实例因原 profile 缺失而无法官方清理，保留，不手工删除配置。本轮实例已官方清理，浏览器和隔离认证副本已删除。

R13 原始报告中 `knownActionGaps` 是脚本硬编码的历史备注，本次没有重新执行这两个宣称；实际观测计数只取 `checks`，不把备注当成本轮产品 FAIL，也不擅自抹掉历史记录。

本目录只包含选定证据，不包含认证、浏览器 profile、node_modules 或扩展包复制品。`acceptance.json` 为判定入口，`artifact-hashes.json` 为逐文件校验入口。main 并行修改均保留，证据提交不代表整体 GOAL 完成。
