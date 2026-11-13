# 统一确认、反馈与异步调用合同

日期：2026-11-09。适用：可信工作台和 Sidebar Tool 的确认与反馈；不新增 Page/Controller 权限或网站注入能力。用户已要求按此方向在后续对话实施框架能力并修复代表扩展。

**状态分开记录**：本文是现行设计与开发规范，不证明能力已经上线。R1.1 原 `ui.notify` 纯文本显示参数已实现；R1.2 的受限通知句柄、消息优先级及生命周期应以最新 CI 证明源码状态，真实 Side Panel / PC Chrome 仍需单独验收。异步 `ui.confirm` 复用原 Bridge/Host/React adapter。公开签名、字段及错误语义只在[Sidebar Tool API](../../api/sidebar-tools.zh-CN.md#非阻断消息opendesktooluinotifyr12-生命周期与可安装实验室)维护；本合同只负责跨工具职责，不建立第二套 SDK/Authority。

目标与顺序见[实施目标](../../framework/shared-confirmation-r1-20261109.md)，行为验收见[关键测试条件](../../framework/shared-confirmation-r1-test-spec-20261109.md)。DESIGN 的对应作用域遵守本文；历史 R50/R51 的同步原生弹窗禁令保留，“所有确认必须行内”已由本合同替代。旧实现仍待迁移，不能把规范变化当作运行通过。

## 1. 先选择交互

| 场景 | 应用方式 | 结果要求 |
| --- | --- | --- |
| 安装/更新/卸载、保存/复制成功、短操作回执 | 已有共享非阻断 notify；紧邻操作且一直可见时可用就近 status | 真实业务回执后提示；不抢焦点，温和播报；不能只追加到滚动正文底部 |
| 字段错误、长错误、结果未知 | 字段或业务区持久状态与原查询入口 | 保留草稿和可读原因；Toast 不能成为唯一恢复入口 |
| 丢弃草稿、普通删除/覆盖 | 当前宿主内统一简短确认浮层 | 正文不重排；明确对象、后果与动作；默认保留/取消 |
| 敏感数据、新权限、安装/来源替换 | 原可信审阅内容和 Authority；可复用展示原语 | 同一意图不先加普通确认；真实 Chrome 提示另计且不绕过 |
| 长表单、配置编辑、复杂差异 | 现有业务页面/Sheet/编辑器 | 业务拥有状态与内容，不强制改成双按钮弹窗 |
| 菜单、Tooltip、非阻塞详情 | 合适的原有交互 | 不因统一确认而全部模态化 |

普通状态不使用“确定”阻断；必要决策的异步模态浮层不等于阻塞 JavaScript 线程的 `window.confirm`。继续禁止自有 UI 调用浏览器同步 `alert/confirm/prompt`，不新增沙箱 `allow-modals`，不对第三方网站改写这些全局函数。

### 1.0 操作回执的可见性（2026-11-10）

- **瞬时反馈不能只写入正文末尾或折叠区**。安装成功等操作结束后，用户无须滚动寻找结果，也无须再点击“确定”。文案优先“已安装「名称」”，必要下一步放简短 caption；不在每条成功消息中重复整段权限政策。安装后的停用状态仍如实保留，不能提示所有旧安装均已恢复。
- **共享展示属于整个可信工作台**。`src/ui/react/components/notifications.tsx` 从原 `sidebar-tools-view.js` 快照展示，沿唯一 React Root Portal 到当前文档，脱离 Tab 的隐藏、滚动和裁切容器；五 Tab 共用一处展示，独立 App 页面由原 ToolHost 使用同一组件，不能同时渲染两份。复用原有限堆叠、优先级、去重、关闭及悬停/键盘暂停；模态审阅遮挡通知时暂停倒计时，关闭后继续剩余阅读时间，不能让迟到回执在遮挡期间过期。不新增 Store、Provider 或 Bridge。
- **宿主与工具的权限保持分开**。可信控制器通过原 `view.showToast` 接入；普通工具仍通过公开 `tool.ui.notify`，不获取工作台内部对象、DOM 或跨工具通知权。可信工作台完成/取消回执默认使用 `bottom-center`，避免遮住顶部导航；这是视口固定浮层，不是正文底部插入。工具显式位置和原公开默认保持原语义。
- **错误可双通道，恢复信息必须持久**。新的宿主错误可同时给短通知吸引注意，原业务区仍保存原因/恢复入口；关闭 Toast 不清错误，其他操作成功也不能清除无关错误。字段错误、忙态、长期进度、未保存草稿、撤权与结果未知不整体迁成短消息。`role=alert/status` 只是可访问性语义，不等于阻断。
- **没有通知能力的旧工具回退须看得见**。使用紧邻当前操作的普通状态；不能恢复同步原生弹框，也不能仅因 `notify()` 返回 true 就清除草稿或宣称持久化成功。限频和未知展示回执不是重试业务写入的理由。

检查现有入口时先沿真实用户操作追踪结果来源与展示位置，记录“已证实误用 / 可改善但未证实不可见 / 应保留的持久状态”，不把每个 alert/status 容器当作缺陷。代表性发现、本轮迁移及未测范围见[本轮目标与核查](../../framework/feedback-visibility-r1-20261110.md)。

#### 共享通知的信息密度（2026-11-13）

五 Tab、独立工具宿主与普通 `ui.notify` 均由原共享组件控制排版，不按扩展 ID、名称或业务关键词区分。短通知直接展示；长 message/caption 默认各展示至多两行，按真实宽度和字体检测溢出后才提供内建“展开详情 / 收起详情”。完整纯文本保留，展开正文可聚焦并局部滚动；单条和通知堆叠都有高度上限，其他通知和关闭入口可滚动到达，不能用隐藏溢出永久裁掉内容。

展开仅改变当前组件展示，不执行工具动作、不授权、不产生新的通知、句柄或持久历史。原超时、分组、优先级、所属实例与撤权规则保持：普通通知沿原悬停/焦点暂停，可信短成功回执仍可按原规则五秒到期；模态遮挡期间暂停并保留展开状态。关闭、被动清理及容量淘汰按原焦点来源恢复，已移到其他界面的焦点不被夺回。业务仍须提供简洁结果与持久错误/未知恢复信息，框架不从长文本推断成功或代替业务保存记录。

### 1.1 普通工具通知 R1.2：生命周期与 Quasar 的差异

延续唯一 `ui.notify`，不引入 Quasar，也不增加第二套 Toast Host。旧 `ui.notify(options|string): boolean` 保持不变；R1.2 仅增加可选的 `ui.notify.open`，当前 Bridge 生成单调句柄，Host 用原来源/实例/安装/撤权检查绑定更新与关闭，使用严格 requestId/更新序号及有限期回执。所有可展示内容仍使用原 `type`、`caption`、`position`、`timeout`、`group` 纯文本白名单，详见 [唯一公开签名](../../api/sidebar-tools.zh-CN.md#非阻断消息opendesktooluinotifyr12-生命周期与可安装实验室)。

- 源码归属：原 `src/sidebar-tools/ui-notice.js` 白名单校验、原 `bridge.js` 传输、原 `src/ui/sidebar-tools.js` 同源/安装代际检查和限频、原 `sidebar-tools-view.js` 状态、原 React Root 内的 `components/notifications.tsx` 共享展示。`app-shell.tsx` 和独立页面 `tabs/tool-host.tsx` 按宿主选择唯一挂载。无另一个更新协调器、Registry 或 Provider。
- 不携带 JS 回调、原始 HTML、任意行动按钮、链接、用户图标、CSS、更新候选或系统通知权限；`ui.confirm`、真实安装和授权仍各自走原合同。
- 单条长任务支持 Loading → 业务真实结果驱动的成功／错误 → 自动到期或原句柄手动关闭，永远不由通知框架猜测业务成功。原宿主每实例每分钟三次创建不变，更新每句柄限 12 次，句柄最多存活 30 分钟；旧实例迟到、卸载、隐藏及撤权清理旧提示。
- 堆叠最多三条，默认去重计数；第四条到来时按 error > warning > success > info，且相同级别持久消息优先保留，丢弃低优先级新消息而不创建无界等待队列。React 悬浮／键盘焦点暂停计时，内容更新重置对应版本倒计时，不因其他 React 重渲染重新计时。
- Host 接收回执不是 Chrome 像素渲染证据；只有装到真实浏览器在 Side Panel 与 PC 页面目视验证后才可标视觉 PASS。
- 最多 3 条可见，同内容同类型同位置默认分组；请求仍受每实例 60 秒 3 次限频。聚焦/悬浮期间暂停自动关闭、未读用户状态及业务错误仍保留在源工具正文。
- 端到端示例仍只使用 `examples/sidebar-tools/ui-notify-demo/`，包含长任务与限频演示；唯一正式可安装 JSON 通过原 `build-sidebar-tool.mjs` 的候选、测试、promote/check 顺序核对。Node、Host 和 Chrome 原生证据分别记录，不重复开发旧 Prompt Shortcuts UI。
- 当前实施分级：`SOURCE_IMPLEMENTED`；本轮独立 CI 和真实浏览器测试各凭实际结果评估，不能因为新增源码便标记 `CHROME_PASS`。

### 1.2 Web Flow 的任务状态通知消费者（2026-11-11，P0）

这是现有 R1.2 通知的一个业务消费者，不是第二套公共通知、安装/更新提醒或新的调度权：Web Flow 手动沙箱仅通过公开 ui.notify.open/update/dismiss 展示同一个原始 Run 的状态；已有可信「当前任务」组件在唯一 React Root 通过原 Host Toast Store 更新状态。两种调用都必须取自原 Authority/Run/Result 的只读核验，不能因 Toast 提示、更新或失败启动、重试、停止、批准或交付任何任务。原 SDK 签名/返回值仅在 [公开接口文档](../../api/sidebar-tools.zh-CN.md#非阻断消息opendesktooluinotifyr12-生命周期与可安装实验室)维护。

原执行结果 completed 只是脚本终态，业务成功与原对话交付必须分别核验；UNKNOWN、撤权、旧 Host/实例销毁不能升级成功或自动重放。Toast 按原 owner/实例受限且可关闭，恢复定位依赖业务原持久记录，**句柄不能持久化为任务身份**。当前 P0 只覆盖已打开的 Side Panel/PC 工具宿主；关闭宿主、跨窗口恢复属于后续 P1；授权网页右下角 Toast 和 Chrome 系统通知属于 P2，均不得通过普通沙箱请求越权实现。

## 2. 业务与框架的所有权

- **业务 owner**：决定确认必要性、具体对象/后果/文案、draft revision、执行与持久回执；确认后复核原 ID/ETag/实例，按原服务做条件写。业务文案/数据策略不写进通用 Host。
- **框架 owner**：在唯一 `src/ui/react/`、原 Tokens/React Aria、Bridge/Host 内提供展示、来源标识、焦点与取消、请求隔离和终态清理；不增第二 React Root、Host、Registry 或权限链。
- **导航 owner**：工具内部路由由业务 guard 发起；离开工具/跨主 Tab 由框架 guard 发起。Web Flow 主要准确上报 `setState({dirty,busy})`，框架负责离开确认，工具不重复弹窗。重复点击不覆盖原目的地；原 owner 在核验后仅消费一次。
- **可信执行 owner**：普通确认只返回选择，不返回权限、Event、userActivation、approvalRef 或执行成功。敏感 RPC 仍由原 Authority 判断；必须同步发起的 Chrome 权限请求，保留新的真实可信按钮处理器和原同步入口。
- **技术栈**：HTML/JS、Vue、React 都以纯数据调用公开能力；不传 DOM、HTML、JS 或执行回调。可信第一方 environment adapter 可接同一展示服务，不能据此将用户动态包挂入可信根。旧工具不要求迁移 React、升级或重新安装。

## 3. 模态、焦点与编辑器

1. 当前 ownerDocument 最多一个待决确认/可信审阅；第二个不同请求明确 busy，不取消或覆盖第一个，不无限排队、不跨文档持久化。传输 requestId 去重与业务意图去重分别实现。
2. Portal 留在该宿主主题和文档内，正文不被 sticky 确认区撑开。dialog/alertdialog 有名称和说明；危险确认初始焦点在安全选项；背景 inert、Tab 循环、Escape 取消、P0 点击遮罩不关闭。
3. 同一次打开按键、按键重复、IME composition 不触发确认或底层提交；确认层 Escape 不继续关闭底层编辑器。取消恢复 iframe 内可用触发点、选区与滚动；删除完成后聚焦下一合理对象。
4. 编辑器需要关闭确认时，业务 adapter 暂时让出原模态/焦点锁，保留组件、字段和 draft revision；不能触发原 onClose 的清稿/卸载。取消、busy 或明确不可用时恢复；确认核验后才退出。框架不扫描或操纵沙箱业务 DOM。
   原生 Escape 的 dialog-cancel 是合法退出入口；让出模态产生的迟到 close 必须绑定编辑器 opening generation/暂停状态，不清稿，也不关闭后续重开的实例。reject/过期同样恢复仍有效的原编辑器；卸载/失效只清旧实例，不恢复已销毁界面。
5. 已有安装/权限审阅不被暂停或替换。单次普通确认失败不改授权，也不取消已发出的外部任务。

## 4. Promise、then 与异步调用

`async/await` 和 `.then()` 均可；按正确的控制流判断，不做全仓语法替换。新增接口返回结果对象，现有业务 boolean/callback adapter 必须显式转换。

| 必须检查的链路 | 规范与最小验证 |
| --- | --- |
| 同步 guard 改异步 | `if (confirm())`、`!canLeave()` 不能直接接 Promise；全部调用点统一采用 await 或保留原同步 guard＋批准回调，选一种执行模型。取消零导航，确认只导航一次 |
| 结果对象与布尔适配 | 显式判断 `answer.action === 'confirm'`；`Boolean(answer)` 会把取消对象也当同意。旧 boolean adapter 只在 confirm 时返回 true |
| Promise 链完整性 | `.then` 返回/等待后续异步写入，让同一错误链接住失败；需要 fire-and-forget 时最终任务自行捕获拒绝。`void promise` 本身不处理异常；事件系统不等待 async handler |
| resolver 与卸载 | 每请求恰好一个终态；新确认不得覆盖未结算 resolver。取消、busy、销毁、abort、超时均结算并移除计时器/监听；不要使用 `new Promise(async executor)` 隐藏拒绝 |
| catch 与 finally | 取消、输入错误、busy、失效、不可用、结果未知分类处理；不能统一 catch 成“用户取消”后另弹框或继续执行。finally 只清理本请求，不返回值覆盖结果、不清新实例状态、不把结束当成功 |
| 重入、busy 与 dirty | 发起前防连点；业务可沿用原 busy 围栏，不能因“正在等待确认”导致自己的确认按钮永久禁用。待决确认、实际写入、unknown 的语义分清，不为展示清除原 busy/dirty |
| await 后目标变化 | 等待后重查原对象、修订、安装代际/实例、busy/unknown；读请求用代次丢弃旧响应，写入仍用原条件写/锁。旧回包不改新草稿 |
| 激活与异步准备 | 有同步手势合同的调用在首个 await 前发起；普通确认 resolve 不携带权限。宿主内部返回沿原导航消息的私有关联允许一次展示，由业务 guard 在原派发栈消费；自行派发/重放的 CustomEvent 不可用。不要笼统认定所有 await 都丢激活，也不能把导航关联、then 或合成 click 当成 Browser 权限入口 |
| 成功和未知 | 真实持久回执/必要读回后才清 dirty/提示完成；传输超时不能重发风险写入、换 ID 或换窗口绕过 unknown。查询/停止原请求与撤回已发生副作用是不同操作 |

局部适配示意（原业务服务与错误展示沿用项目实际入口）：

```js
// 同步调用发生在真实用户事件中；纯普通数据确认，不用于权限批准。
const deciding = tool.ui.confirm(options);
return deciding.then(answer => {
  if (answer.action !== 'confirm') return;
  assertOriginalTargetStillCurrent();
  return writeOriginalTargetConditionally();
}).catch(showOperationError);
```

如 showOperationError 会抛错，最外层 owner 仍须消费该拒绝。取消返回正常 cancel 选择；程序/协议错误才 reject；不将正常取消当作待重试失败。

## 5. 生命周期、兼容与回退

- 请求绑定原 sender、iframe、instance、toolId、宿主文档与安装代际；离开、停用/撤权、卸载、更新换代后退役。dirty 清除或保存开始使原离开确认失效时，关闭过时决策并保留现场，不自动跳转旧目的地。
- Signal 在 Bridge 本地消费；最小取消消息按原实例/requestId 清 Host UI。取消与确认回包竞争由首个已接收终态胜出；迟到请求不重开，迟到回包不写入，确认已交付后的 abort 不撤销已开始业务。
- 方法存在只证明 Bridge 导出。原初始化/加载快照没有确认协议/通道支持声明，或明确只读预览未提供通道时，Bridge 发送前本地返回 unavailable，零请求/零待决 UI，再使用已有安全本地确认；不能期待旧 Host 对未知操作返回新错误。busy、缺手势、取消、超时、撤权或结果不明不再弹第二个框。旧 Host 回退不调用 window.confirm、不默认同意。
- 复用现有合法安装身份，不增加官方 Catalog 版本/SHA/发行来源匹配运行门槛。只读预览不能借同 ID 安装取得正式身份；是否支持新 UI 按目标 Host 的明确合同处理。
- 保留原可信授权期限、未知副作用保护和普通 RPC 预算；UI 等待与回包清理单独安排。清理 inert、滚动锁、监听、计时器与待决 Promise；不记录确认正文或凭据到公共日志。

## 6. 实施与验证边界

先复现 Web Flow 草稿→返回/切换的最短链；再修框架公共展示/协议，以及 Quick Notes HTML、AI Proxy React 的代表业务调用。原 Vue 工具保持源码/包不变验证，新增调用用最小既有 fixture。其余消费者按 owner 分类迁移，不把调用位置数当缺陷数。

公共 schema/Bridge/Host/焦点生命周期测试归框架；CRUD、dirty、编辑器及回执测试归业务。关键新增测试包括 Promise 真值、旧 boolean adapter、未处理拒绝、resolver 覆盖/卸载、finally 与晚回包、同步手势和未知不重放。只跑当前改动相关检查，真实 iframe/Side Panel/Chrome 权限另取证；源码、构建、正式 JSON、已安装与运行版本分别报告。

文档/Skill 修改只核对内容、引用、元数据和规则一致性；不启动浏览器、产品构建或测试。代码实施复用既有 `npm run dev` / `dist/development` 与项目编译/快照 watcher；不覆盖并行资源，不自动扩为 production、全 CI、压力矩阵或评分。
