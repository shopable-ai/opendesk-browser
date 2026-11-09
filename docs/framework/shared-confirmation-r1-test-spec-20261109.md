# 统一确认与反馈关键测试条件

日期：2026-11-09。对应[目标方案](shared-confirmation-r1-20261109.md)。状态：现行规格；本轮源码、Node 与离线 Chromium 结果见[实施记录](shared-confirmation-r1-20261109.md#9-实施与定向验证记录)。规格本身不代表通过，真实安装与权限单独标记，不恢复延期验收。

## 1. 测试边界与证据

- P0 先证明 Web Flow 草稿退出、旧 HTML 普通确认、React 普通确认及受影响的来源/授权/生命周期保护；不先执行全仓测试。
- 公共协议/Host/组件测试归根；业务 CRUD、dirty、导航与回执测试归真实项目。保留原 owner、数据、版本和来源身份，开始前重查并行修改。
- DOM 可证明状态、事件与调用次数；实际几何、遮挡、iframe 焦点与 Chrome 权限须真实浏览器证据。源码字符串命中、测试数量和预览截图均不能替代实际操作。
- 日常网页及可视化默认 ego，专项扩展 Side Panel/Native/权限测试先核对其支持；能力不足时说明具体缺口，继续原专项环境合同，不能用普通网页模拟宣称专项通过。
- 框架日常迭代复用已连接的 dist/development watcher；工具用原本地项目调试/编译入口。固定源码、工具快照、正式 JSON、已安装版本、运行 revision 分别记录。
- PASS=有效用户行为与保护得到对应证据；FAIL=有效合同失败；环境/驱动问题先分类；无法执行的相关项保持 NOT_TESTED/BLOCKED。核心开发完成不等于正式发布验收。

## 2. P0 关键条件

| ID / 目标 | 前提与用户动作 | 必须观察到的结果 | 最小层级与 owner |
| --- | --- | --- | --- |
| T01 / G1,G4 | Web Flow 有真实未提交草稿，点击返回扩展列表、切另一工具、切主 Tab；每个分支分别取消、放弃与快速重复点击 | 每意图只有原 owner 发起一个统一浮层，重复点击不替换原目的地；原正文边界/宽高/滚动没有因插入确认区改变，无旧 sticky 确认残留；取消字符和实例保持；明确放弃才到原目的地且一次，不再触发业务第二 guard | Host 行为＋同候选真实 Side Panel / 平台 |
| T02 / G4,G5 | Web Flow 操作纯搜索/筛选、未提交任务参数、已保存偏好；另模拟保存中和真实保存 unknown | 纯浏览不误报 dirty；真实业务草稿仍保护；成功读回才清 dirty；busy/unknown 不显示可执行的丢弃导航，不能关弹窗绕过原任务；无实际复现不为统一规则改业务逻辑 | Web Flow 现有 UI/模型＋Host / 业务 |
| T03 / G1,G2 | 沙箱 HTML 工具删除便签；可信 React 入口普通删除或内部离开草稿；点保留、Escape、确认与重复导航 | 沙箱 Bridge 与可信 environment adapter 进入同一展示原语；内部 guard 不再另弹宿主确认；普通确认返回选择；保留/Escape 写入次数0，确认后原对象/版本核验且写入一次；组件/root/技术栈不被替换 | Quick Notes/AI Proxy 定向测试＋真实试点 / 各业务 |
| T04 / G1,G3 | 已安装工具明确执行原本需要可信审阅的敏感操作；另有已批准范围与缺新增 Chrome 权限两支 | 同一意图最多一次应用级审阅，不先普通 confirm 再可信 confirm；合法授权复用；缺 Chrome 权限仍走原生许可；拒绝不执行。计数将应用审阅与 Chrome 自己的提示分别记录 | 原 Host/权限集成，受影响手势支需真实 Chrome / 平台 |
| T05 / G1,G5 | 真实 Enter/Space 打开模态后继续按住；Tab/Shift+Tab、Escape、IME composition、点遮罩；取消与确认删除后恢复 | dialog/alertdialog 有正确名称和说明；初始焦点在保留/取消；焦点不进背景/ iframe；遮罩不执行不关闭；打开同次按键、重复按键及IME不误确认/穿透提交；确认内Escape不冒泡关闭编辑器；取消恢复当前iframe触发点/选区/滚动，确认删除后到下一合理对象或安全入口 | React 事件＋真实 iframe 键盘 / 平台 |
| T06 / G1,G5 | 侧栏及工具标签页打开短/长确认；AI Proxy 已编辑表单，以真实关闭按钮/原生Escape发起，分别取消/放弃/busy/unavailable/reject/过期；让出模态后延迟close并重开；已有审阅时再请求 | 无溢出、遮挡、正文重排或跨文档锁定，长文内滚动且主题正确；让出模态保留实例/dirty，取消及失败恢复原字段/选区/焦点，核验后才退出一次；迟到close不清稿/不关新opening generation；销毁不重开；无双焦点陷阱。普通确认与可信审阅双向竞争busy，原请求保持 | 真实浏览器 Escape/cancel/close 事件顺序＋AI Proxy editor / 平台与业务；仅正常代表窗口 |
| T07 / G2,G3 | 合法 options；额外 html/url/action/callback/toolId/权限字段；空白、超长、控制/双向字符；内容含标签；提供 signal | 仅白名单通过，非法 reject 且无UI/副作用；标签当文本；message允许换行且不截断风险；AbortSignal只在本地消费，协议不含函数/DOM/Signal；notify原合同不变 | schema＋Bridge 协议 / 平台 |
| T08 / G2,G3,G5 | 真实点击/合法键盘/dialog-cancel；宿主页头内部返回的原导航消息；对照自行/重放CustomEvent、effect/延迟调用、过时导航revision、合成点击/计时器/伪造消息/错误实例、预览；确认后请求受保护RPC | 合法入口可展示；导航关联仅在原派发栈消费一次，不授予Browser激活，过时/伪造/迟到来源拒绝；预览不借正式安装权；普通选择不生成权限/approvalRef/Event；敏感RPC仍经原授权，不把确认回执或导航关联当激活证明 | 原导航消息/手势端口两端＋消息负例＋Authority计数 / 平台 |
| T09 / G2,G5 | 快速连点、重复requestId、普通/可信第二请求；预先aborted、发送后abort、取消消息先到、确认回包迟到/先到、取消与超时竞争；Bridge期限对照 | 单宿主最多一条pending；第二请求busy不覆盖原请求/目的地，全部调用方均有终态；预先abort零发送；发送后取消绑定原请求并清宿主UI，迟到请求不重开；Bridge首个已接收终态只结算一次，abort先到不执行，confirm已交付后abort不撤销业务；120秒后关闭、保留草稿并说明未执行；无提前超时遗留活弹窗，不整体放宽RPC期限 | 受控时钟/并发协议＋DOM / 平台 |
| T10 / G2,G5 | 弹窗打开期间切换/关闭工具、切宿主文档、停用/卸载/撤权、更新代际；迟到点击/响应；Bridge dispose | 原请求退役，Promise以取消或既有关闭错误一次结束；无确认成功、无旧回调/写入；新实例不继承弹窗；inert、滚动锁和监听清理，焦点不回已销毁iframe | 生命周期集成 / 平台 |
| T11 / G3,G5 | 业务确认期间另一窗口更新/删除同对象；保存回执清dirty；框架导航目的地已失效或保存开始 | 业务比较原ID/revision/ETag并拒绝过时写入；不覆盖新数据；框架关闭失效确认并保留现场，不擅自执行旧导航；取消后无“已保存/已删除”假提示 | 业务条件写＋Host 导航 / 业务与平台 |
| T12 / G3,G5 | 原可信确认按钮立即、延迟、激活已被消费三支；用户拒绝浏览器权限；有副作用请求后未知 | 需要原生手势的调用由新的可信确认click经原入口发起，读准备不推迟到该click前的异步链；依据真实许可回执继续；失败不执行受保护操作；未知只查询原请求，不重发/换ID/重开窗口绕过 | 原权限/手势定向测试＋必要真实 Chrome / 平台 |
| T13 / G2,G5 | 原HTML/Vue源码/包不改及最小Vue调用fixture；实际旧初始化快照缺确认声明、新Bridge＋静默丢弃未知操作的旧Host、只读预览无端口；对照支持声明后缺手势/busy/超时/撤权/取消；合法旧版/本地包、Catalog不可用、动态同名包 | 原工具打开/交互/SDK可用；旧/预览在发送前本地unavailable，消息计数0且无待决UI，再原安全回退；不能仅mock Host返回新错误。支持声明后失败不另弹第二框，rejection全消费；无window.confirm/默认同意/强制React/重装或发行匹配门槛；同名不提权 | 原初始化/端口真实路径fixture＋安装/Host合同 / 平台 |
| T14 / G1,G3 | 真实保存成功、字段错误、导出失败、结果未知；显示notify时弹窗已开；切换工具后旧通知到达 | 普通消息不需点确定且不抢焦点，成功状态温和播报，不重复打断当前确认；字段错误就近、unknown及长错误在业务区保留可读；Toast不盖按钮、不绕过原限频/身份；旧实例不继续发；无回执不提示完成 | 原ui-notice/ToolToast＋可访问性＋业务回执 / 平台与业务 |
| T15 / G4,G7 | 逐个canLeave返回/切换/停用入口；沙箱页头返回→原导航消息→内部脏稿guard→取消/放弃；等待中busy/换实例/快照变化；对照旧boolean adapter | 不将Promise/cancel对象当true；内部导航合法展示但不伪造isTrusted，框架/业务不双重确认；批准回调与await后执行二选一，取消零导航/写入，确认仅原目的地一次；旧boolean仅confirm为true | Host导航通道＋真实沙箱页头行为＋业务adapter / 平台与业务 |
| T16 / G2,G7 | AI Proxy 连续请求两次确认，分别取消/确认；确认期间卸载、重开、cleanup；第二请求 busy | 每请求恰好一次终态，无 resolver 被覆盖、悬挂 Promise 或泄漏监听；pending/busy 按原 owner 正确收尾，新实例无旧状态 | environment-confirm＋Workspace 生命周期 / AI Proxy |
| T17 / G3,G7 | await 和 then 两类消费者；确认 reject、写入同步抛错/异步 reject、false/cancel；事件 handler 的 void 与返回链 | 后续写入被 return/await 或自行完整消费；无 unhandledrejection；取消不执行，实际失败可见；不以空 catch 吞成成功/同意，也不把正常 then 语法当缺陷 | 业务事件/协议行为 / 各业务 |
| T18 / G5,G7 | 写入失败/unknown 后执行 finally；旧请求收尾时新实例或新操作已开始；finally 自身抛错 | finally 不返回值覆盖原结果、不清新实例 busy/draft、不提示成功；unknown 保留原围栏，不自动重放；清理错误有 owner 消费 | 业务状态/生命周期 / 各业务 |
| T19 / G3,G4,G7 | Quick Notes 等待期间换笔记、修改草稿、重复删除；Web Flow 持久准备失败/取消/旧回执；保存成功和读回冲突 | 原 ID/revision/ETag 核验后才条件写，旧确认不删除新对象；准备失败不 start；原实时手势路径保留；回执不明不清 dirty、不重发；取消恢复控件 | Quick Notes/Web Flow 定向行为 / 各业务 |
| T20 / G2,G3,G7 | AI Proxy 既有 busy 包含确认等待，编辑器临时让出/恢复；确认与实际写入分别出错 | 防重入且确认自身按钮仍可用；既有 busy 不为弹框强行清除，dirty 保持到真实提交；展示等待结束不等于保存/代理已应用 | environment＋编辑器/Host / 业务与平台 |

## 3. 对照现有测试与必要缺口

现有相关入口，实施按当前改动选用，不是本轮执行命令清单：

- `tests/environment/sidebar-tools-host.test.mjs`：pending action、草稿退出、真实来源、旧实例、操作次数与既有 ui.notify；迁移展示不能削弱原授权与不重放断言。
- `tests/environment/sidebar-tools-view.test.mjs`：已有视图状态；`sidebar-tool-layout-browser.test.mjs`：真实布局与草稿退出。焦点和尺寸不用源码字符串替代。
- `tests/environment/sidebar-tool-ui-notice.test.mjs`：保留 notify 输入/限频合同；新确认输入和终态若无覆盖，再新增最小公共行为测试。
- `tests/environment/no-modal-ui-r50.test.mjs`：继续禁止浏览器同步alert/confirm/prompt、既有不必要beforeunload及沙箱allow-modals；只修订“必须inline”的过时展示要求。共享异步模态UI不等于同步原生API。
- `tests/environment/permission-gate.test.mjs` 及本次受影响的 Cookie/Browser intent 定向测试：证明真实点击、能力、精确目标、撤权和未知保护。未触及的权限实现不跑整组。
- Web Flow 优先 `projects/webflow/tests/webflow-ui.test.mjs`、`sidebar-bridge.test.mjs`；AI Proxy 优先 `projects/ai-proxy/tests/environment-confirm.test.mjs`、`navigation.test.mjs`；Quick Notes 在真实项目既有测试中验证删除/覆盖与安全回退。开始前核对文件仍存在且确有行为覆盖。

新增测试只填补当前缺口：跨iframe焦点恢复、共享确认输入/来源、终态竞态、双重确认，以及 T15–T20 的 guard/adapter、resolver、异常链、finally、原目标与 busy 行为。业务断言留业务目录；不按产品名或版本复制通用协议测试，不扩大成变异/压力/全量对抗测试。

## 4. 执行节奏与退出条件

1. 实施 S0 先走一条当前真实核心操作，记录具体失败/未验证点；没有复现的业务故障不制造源码修改。
2. 由本次缺陷/改动选择最小schema、Host、业务及相关保护测试；运行前说明其证明哪个当前行为/缺口，不因脚本存在就执行。
3. 复用原 watcher 或本地项目编译生成相关候选；真实用户流程证明布局、焦点及手势，不把预览、源码或JSON检查报为安装生效。
4. P0阶段：G1–G5、G7 对应条件已具适当证据、无未决阻断才能称核心完成。缺真实权限/安装条件时准确声明已完成的开发切片和NOT_TESTED，不能称全部P0通过。
5. P1全量迁移、复杂面板公共外壳、正式包晋升/安装及production按当前后续阶段单独推进，不因P0通过自动开启。

每项只记录必要信息：测试ID、动作/命令、输入/候选身份、运行surface/版本、PASS/FAIL/BLOCKED/NOT_TESTED、实际结果与证据位置。确认正文/便签/凭据不落公共日志，截图按必要范围脱敏。
