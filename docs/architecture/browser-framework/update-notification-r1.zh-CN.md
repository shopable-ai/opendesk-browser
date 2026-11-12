# OpenDesk Browser · 更新提醒统一合同 R1.1（含跨标签提醒与按钮状态机）

状态：**更新通知中心代码已选择性写入 main；定向 CI、正式生产构建与真实 Chrome 安装验收按最新提交核验，当前不可视为正式发行。**  
日期：2026-11-09  
示范消费者：`projects/prompt-shortcuts/`（Prompt Shortcuts）  
可点击演示：`projects/prompt-shortcuts/preview/index.html`，增强脚本 `preview/update-notification-demo.js`。  
权威现有合同：`AGENTS.md`、`docs/api/official-tools-catalog.zh-CN.md`、`docs/architecture/extension-project-layout.zh-CN.md`、`.agents/skills/opendesk-extension-runtime/SKILL.md`、`.agents/skills/opendesk-extension-ui/SKILL.md`。本文件不取代这些合同。

## 1. 用户目标与边界

- 用户操作：浏览器/已安装工具出现新版本后，用户能在真实应用内看见轻量消息、阅读真正可信的更新说明；需要人工审阅的包能沿原入口审阅并更新，不跳转到一个无关营销页。
- **三种不同对象**：Chrome 扩展本体（Chrome 管理更新）、OpenDesk Sidebar Tool（工具包经过现有审阅安装器）、独立 Page Program / Controller Task（各自安装授权合同）；三者不得混用安装状态或更新按钮。
- **二类事件**：`available`（可信版本候选，尚未安装）与 `applied`（通过安装事件/回执证明已更新）。另有 `pending_browser_apply`、`review_required`、`attention`、`unknown` 等状态。
- **双重拆分**：检测/核验/安装是“可信运行时”职责，通知展示、偏好、已读/稍后是“UI/用户体验”职责；消息点击不能直接改变安装授权。
- 本轮预览中的 v1.1.21、v1.2.0、Browser v1.9.4 等均为模拟数据，**不是已发现真实发行版本**。

## 2. 用户交互（推荐默认值）

### 2.1 默认三个入口

1. **站点 Toast**：仅在已授权、已支持且允许页面消息的目标网站显示一次不打断工作的非模态轻提示。建议靠近可视边缘，不遮挡原网站输入框、提交按钮、付款和安全提示；关闭即消失。文案为“提示词快捷按钮有新版本 · 查看更新 / 稍后”，**不说“已更新”**，除非确实收到 applied 证据。
2. **OpenDesk Side Panel 更新条**：仅有未读/待处理事件时，在可信宿主公共 UI 底部提供单行小条，形如 `NEW 提示词快捷按钮有更新    查看`；不固定向每个 Tool 的沙箱 UI 注入同款私有控件。不增加一级 Tab，不覆盖既有新建、导入、AI/更多操作或设置。
3. **详情 / 历史**：侧栏内打开唯一详情视图，包含名字、旧版→新版、发布日期（若可信源提供）、具体变化、权限差异、安装所需确认、来源与失败原因。保留回退/关闭焦点；所有历史记录在同一“扩展”管理入口，而非单个工具各造一套中心。

### 2.2 方案对比与明确取舍

本节的评分是**设计评审推演**，不是当前产品验收分数；各项独立满分 100，综合分取算术平均，不累加。用户看见的是**一种统一通知**，但按入口实际包含几种候选方案：

| 方案 | UX 低打扰 | 更新发现率 | 安全可控 | 跨标签可管理 | 框架可复用 | 平均 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| A. 所有网站直接弹 Toast | 89 | 87 | 92 | 93 | 89 | 90.0 |
| B. 只在侧栏显示 NEW / 更新中心 | 92 | 78 | 96 | 94 | 94 | 90.8 |
| C. 升级后弹新标签 / 模态更新日志 | 68 | 87 | 58 | 67 | 72 | 70.4 |
| **D. 受控 Toast + 持久 NEW / 更新中心** | **96** | **95** | **96** | **96** | **97** | **96.0** |

**选择 D。** A 的问题是用户打开 10 个网页可能弹 10 次；B 太容易看不到重要的新版本；C 打断正在进行的对话、输入与任务。D 用一次很轻的 Toast 告知，其他时候只展示可信宿主的更新入口，不新增一级导航。

Toast 是非模态、小体积、可主动关闭的网页 UI，不是强迫确认的 Dialog。**绝不每更新一个工具就启动独立浏览器窗口。**

### 2.3 最小的通知交互规则（用户能理解的语义）

默认策略：\`toast+inbox\`；也可选 \`inbox-only\` 和 \`silent\`（静默仍可手动打开“扩展 → 更新记录”）。允许对已明确验证的工具按需覆盖显示偏好；全局静默优先于工具局部打开。提醒**不等于安装**，安装、来源与权限按既有合同处理。

| 用户动作 | 立即发生什么 | 其他页面 / 下一次打开 | 更新中心是否保留 |
| --- | --- | --- | --- |
| 不做任何操作 | Toast 在约 **12 秒**后收起；悬浮、键盘焦点或辅助交互期间暂停计时 | 该版本默认不在其他标签页继续重复弹；**没有点击稍后不自动生成第二次提醒** | 是，未读 NEW |
| 点击右上 \`×\` / \`关闭\` | 立即关闭当前 Toast，同一候选版本不再自动弹 | 其他页面同步收起；下一版本可以新提醒 | 是，仍标未读 / 待更新 |
| 点击 \`稍后\`（第一次） | 立即关闭；记录 \`snoozeUntil=现在+24小时\` | 24 小时内打开任意数量的网页都不弹；**24 小时后首次满足安全条件时，仅可再弹一次** | 是 |
| 第二次 Toast 再选 \`稍后\` | 界面改用 \`不再弹出\` 表达达到上限；不再产生第三次 Toast | 此候选进入仅入口提醒，不再自动弹 | 是 |
| 点击 \`查看更新\` | 关闭 Toast、进入可信 Side Panel 详情（无权时只给出合法入口）；标记已查看 | 其他页面不再弹当前版本 | 是，NEW 变为 \`待更新\`，详情/审阅入口仍在 |
| 点击 \`审阅并更新\` | **只打开已有可信安装器审阅页**，需要用户进一步确认；提示不能自动安装 | 安装器取消/权限拒绝/失败不重弹 Toast；保留待处理或错误状态 | 是 |
| 安装器已确认且真实回执验证成功 | \`available\` 失效、记录 \`applied\`；工具本身不再显示“待更新” | 不因自己刚刚手动安装而再弹一个“已更新” Toast | 进入更新历史 |
| 点击 \`忽略本版本\` | 关闭该版本的 Toast 与主动 NEW 提醒（不卸载/不禁用旧版本） | 相同版本不再弹；**更高可信版本**可重新提醒 | 历史 / 已忽略列表可找回 |
| 点击其他提示词按钮、网页普通按钮、切换网站 Tab | **不视为同意、拒绝、稍后或安装**；按钮按原业务执行 | 仅当前 Toast 的自然显示计时/页面可见性变化；跨页全局次数不增加 | 是 |
| 关闭浏览器、重启、切换 Chrome 标签页 | 当前 Toast 可能消失；如果展示已确认，次数持久保留 | 不重置已提示次数或“稍后”截止时间；更换 Chrome Profile 分开计数 | 是 |
| 关闭“网页通知”设置 | 当前网页 Toast 立即隐藏，后续不再主动弹 | 只改变展示渠道，不影响任何 Chrome/Tool 自动或手动更新 | 是 |

**推荐用“稍后”而不是“跳过安装”：**稍后只意味着延后再次提醒；关闭 × 不代表已阅读；忽略本版本只作用于当前可信发行身份，手动查看始终可用。

有可点击操作的 Toast 尽量不在指针悬浮、键盘焦点、屏幕阅读器正在操作时自动关闭；在短暂显示结束后，详情仍保留在可信更新中心。页面内 Toast 的 \`role=status\` 不要抢焦点，快捷键 Esc 仅关闭当前有焦点的通知。

### 2.4 多网页 / 多标签 / 多窗口提醒频控（最终建议）

**计数范围 = 同一 Chrome Profile 中、同一个可信候选发行的所有标签页、窗口和 Side Panel，共享一份状态。**不要在每个网站的 \`localStorage\` 保存各自的提醒次数。正常与隐身窗口需遵循 Chrome 数据隔离 / 用户设置，默认不对隐身网页弹更新提示。

- **每个可信候选版本：默认 1 次主动网页 Toast；用户明确点 \`稍后\` 才允许第 2 次；硬上限 2 次。**普通切页、刷新、新建标签、浏览器重启都不重置该上限。
- **每个 Profile 同一时刻最多 1 个 Toast。**有 3 项新版时合并为 \`3 项扩展有更新\` 一条 Toast；Side Panel 逐项审阅，不能合并权限确认。
- **全局建议 24 小时内最多 1 条新打开的更新 Toast。**如果有其他新版本排队，更新中心先显示；下一个合适时机最多展示聚合摘要。用户点击更新中心手动查看不受此限。
- 第一次 \`稍后\` 后记录 \(snoozeUntil=点击时刻+24小时\)，在此之前打开 10、20 或 100 个网页都不会出现第二条。超过截止时间不会后台自行抢焦点，只有**下一个可见且安全的已授权页面**才可能展示第 2 次。
- **看过更新详情就不再主动弹该候选**，但应用“待更新”状态保留，直到真实确认成功或用户明确忽略。恢复按钮 \`重新提醒\` 只由可信设置中明确操作，不由网页内容触发。
- 页面 A 已展示时，页面 B/C/D 不能争用重复 Toast；A 切后台后可隐藏，B 不“接力重弹”。如果 A 在真正渲染前崩溃、未确认已展示，租约到期可让另一安全页面显示一次；不能误计为已展示。
- 同一工具先 \`available\` 后 \`applied\`：只产生一个当前状态，不同时挂“待更新”和“已更新”；手动安装完成后只更新历史。不同扩展更新可合并摘要，**不同源/权限/包仍逐项处理**。
- 工具被停用/卸载、站点授权被撤销、无可靠官方候选、安装结果 UNKNOWN 时，页面 Toast 不再主动展示该工具的“可立即安装”消息；可信管理页显示对应的准确状态与恢复指引。

**实例（示意）：**

| 时刻 | 用户操作 | 页面 A | 页面 B | 全局显示次数 |
| --- | --- | --- | --- | ---: |
| 周一 10:00 | 打开 ChatGPT，首个可安全展示的页面获得通知 | 显示 Toast | 无 | 1 |
| 周一 10:01 | 同时打开 DeepSeek、Gemini | 若仍显示则仅 A 显示 | 不重复弹 | 1 |
| 周一 10:02 | 在 A 点击 \`稍后\` | 收起 | 同步收起 | 1 |
| 周一 18:00 | 再开多个网页 | 不弹，Side Panel 仍有 NEW | 不弹 | 1 |
| 周二 10:03 | 新开受支持网站且未超全局频控 | 可在唯一页面重弹 | 不重复弹 | 2 |
| 周二 10:04 | 用户点 \`不再弹出\` | 收起 | 不再弹 | 2 |
| 周三 14:00 | 发现更高的可信新版本 | 依**新版本身份**重新计算 | 同一个 Profile 最多一处 | 新版本从 0 起 |

以上为**推荐配置、尚未接入真实 Chrome**，不是声称 Chrome 已具备此功能。默认频率后续可配置，但须限在用户可见的可信偏好页，不允许网页 JavaScript 自己改写。

### 2.5 后台一致性：避免多标签竞争、错误次数及重放

\`NoticeState\`（拟议内部数据结构，**非已存在 SDK**）最少保存：

\`\`\`json
{
  "schema": "opendesk.updateNoticeState.v1",
  "releaseKey": "<type + id + verified version + source identity + package fingerprint + event stage>",
  "status": "unseen",
  "impressionCount": 0,
  "nextEligibleAt": null,
  "seenAt": null,
  "viewedAt": null,
  "dismissedAt": null,
  "ignored": false,
  "activeClaim": null
}
\`\`\`

状态并非直接存原始网页数据。关键转换：

\`\`\`text
UNSEEN
  ├─ [可信校验 + 用户可见/空闲 + 全局额度 + 唯一租约] → CLAIMED
  │      ├─ [确实展示并确认] → SHOWN(count=1)
  │      └─ [页面失联/未成功展示] → 租约超时 → UNSEEN
  ├─ [点击“查看”] → VIEWED（只保留 Inbox）
SHOWN
  ├─ [× / 12 秒自然消失] → DISMISSED（当前版本不再主动弹）
  ├─ [稍后且次数=1] → SNOOZED(until=+24h)
  ├─ [查看详情] → VIEWED
  └─ [忽略本版本] → IGNORED
SNOOZED
  └─ [24h 后 + 可见安全页面 + 同 Profile 全局频控] → CLAIMED → SHOWN(count=2)
SHOWN(count=2) └─ [任何退出 / 稍后 / 超时] → DISMISSED（不再第三次弹）
UNSEEN / DISMISSED / VIEWED / IGNORED
  └─ [经过原安装器且确实成功] → APPLIED（原候选失效；历史可见）
所有状态 └─ [撤销/卸载/发行失效/来源冲突] → SUPPRESSED 或 ATTENTION
\`\`\`

- **唯一权威写入者必须是当前已授权的可信宿主/后台协调器**；页面只请求可显示的摘要，不准凭任意网站事件改变版本计数或安装状态。
- 多标签先向单一可信入口请求 \`claim\`；需要存储锁、短期租约、对应 \`releaseKey\`、\`tabId/documentId\` 绑定，**收到真实 visible ACK 后才增加计数**；租约超时释放且必须再次核验候选仍有效。
- \`chrome.storage.local\` 可保存最小的偏好/计数与状态，而不是靠 Service Worker 全局变量；**简单先读再写不能保证多窗口原子性**。复用现有 Web Lock/事务或单 Owner 串行入口，选实际源码可用能力，不能只靠模拟代码宣称没有重复提示。
- 使用后台原有消息协议与主动推送/拉取更新 UI，受信任 \`storage.onChanged\` 等同步可用时利用；MV3 Worker 可休眠，提醒恢复依据**持久化时间与下一次可见资格检查**，不为 24h 规则长驻进程或每分钟轮询。
- 有时钟跳变、存储写入未知、两页面几乎同时请求、同版本不同内容包、更新应用在 Toast 显示过程中等情况，采用“**不多弹/不自动安装**”的安全降级；未知写入只读对账，不发新 requestId 重试原安装事务。
- \`ReleaseKey\` 包含可信发行与事件阶段，不得因同版本的未经审阅 SHA 替换制造“新版本”；已忽略的更高可信版本可独立重启次数，旧版本静默仍保持。
- 浏览器 \`runtime.onInstalled\` 只在 \`reason === 'update'\` 且核验本体状态时用于“已更新”说明，不因本机 \`npm run dev\` 热加载声称发布了新版；\`onUpdateAvailable\` 只是待应用，不为显示 Toast 强制 \`runtime.reload()\`。

### 2.6 何时不要弹出

默认只有：用户开启网页提醒 + 扩展本身可用 + 当前是已授权/支持的安全页面 + 可见窗口 + 没有输入法组合、重要编辑/提交、全屏、支付、安全授权或持续任务阻塞 + 全局预算允许，才可短暂展示。

- 网页提示文字不含提示词正文、个人会话、Cookie、原始 URL 参数、远端可执行 HTML；更新说明取可信来源并按纯文本显示。
- 用户正在打字、输入法 IME、拖拽、提交、网页调用活动时**只推迟展示**，不抢焦点。若 12 秒内没有安全时机，保持更新中心提醒，不反复强行尝试。
- 无网站权限、授权被撤销、关闭网页快捷按钮、敏感 Origin、隐身模式默认禁止网页 Toast；这些状态不影响用户在可信侧栏手动查看。
- Toast 的关闭不运行任务、不刷新网页、不取消输入、不触发安装、不覆盖既有 Prompt Shortcuts “仅插入草稿不发送”规则。

### 2.7 可验收场景（对应真实用户操作）

1. 同一个发布版本，打开 ChatGPT / DeepSeek / Gemini 三标签：**只一个 Toast**；刷新、关闭/重开浏览器后不再弹。
2. 点击 \`×\`：所有标签同步消失，侧栏 NEW 仍在；新标签不再弹同版本。
3. 点击 \`稍后\`：推进模拟时间 23h59m，任何标签都不弹；24h 后唯一安全页面弹第二次；第三次永远不弹。
4. 点击 \`查看更新\`：保留侧栏“待更新”，关闭详情后不再弹；继续使用原 Prompt 插入按钮不受影响。
5. 进入安装审阅但取消：无真实安装结果，不标“已更新”，不再二次主动打断；新版可从更新记录继续审阅。
6. 审阅权限新增：旧工具与数据保留，必须真实用户确认；权限拒绝不造成静默授权。
7. 多个新版本同时：只展示一条聚合 Toast；详情分身份逐条处理，来源不明的不显示可安装状态。
8. 两个窗口几乎同时请求：只有一个成功 claim；page crash 前无 visible ACK 可恢复资格；ACK 后计数单次。
9. 后台 Worker 休眠、重启、浏览器重启：偏好、\`snoozeUntil\`、次数仍能对账；无重复更新窗口。
10. 工具停用/网站撤权/安装事务 UNKNOWN/目录离线：不显示虚假的“已更新”或“点一下安装成功”。
11. 同一候选已忽略后更高可信版本发布：只新版本重新开始计数；旧版保持静默。
12. 单个提示词按钮/其他网页按钮可照常使用；Toast 不读取、发送或修改草稿。


### 2.8 \`ui.notify\` 与更新提醒的实现边界（2026-11-09）

仓库此前已经有可信 React \`ToolToast\` 与内部 \`view.showToast(message)\`，**但没有向 Sidebar Tool 公开 \`ui.notify\`**；\`browser.notifications.create\` 在公开 SDK 文档中明确为 \`NOT_EXPOSED\`，且含系统通知含义，不宜用来实现普通工具内提示。

本轮最小代码实现 **\`OpenDeskTool.ui.notify({message})\`**，复用现有 Side Panel \`ToolToast\`。详见 \`docs/api/sidebar-tools.zh-CN.md\`、\`src/sidebar-tools/ui-notice.js\`、\`src/sidebar-tools/bridge.js\`、\`src/ui/sidebar-tools.js\`。它只允许 1–160 字符纯文本和每实例每分钟 3 次，宿主验证同一个活动安装实例 / 启停 / 包版本 / 撤权代次 / 可见性，不能注入网页、打开窗口、请求权限或运行安装器。**工具自报的“更新已完成”文字不能变成可信更新事件。**

必须继续实施的独立基础能力：

- \`UpdateNoticeCoordinator\`：接收**可信** Browser 本体 \`runtime.onInstalled\` / \`onUpdateAvailable\` 和已经核验的官方工具候选 / 安装回执，产生只读版本事件。
- \`UpdateNoticeStateStore\`：在同 Profile 的原可信数据所有权下保持 releaseKey、\`impressionCount\`、\`snoozeUntil\`、\`viewed/ignored\`，使用原可用串行/锁机制，跨多标签先 claim 后 visible ACK，避免刷新/重启重复通知。
- \`UpdateNoticeSlot\`：在可信 Side Panel / PC 框架共享 UI 中显示 NEW、详情/历史、稍后/忽略；升级动作**必须调用原 \`installReviewedSidebarTool\`**，不得复用 \`ui.notify\` 当作已安装回执。
- \`PageUpdateToast\`：仅由可信宿主在**已授权且支持**的目标网站选择安全时机显示，不能由普通动态工具控制；默认一次，明确首次“稍后”后 24 小时可第二次，最多两次。

**验收分级**：\`OpenDeskTool.ui.notify\` 为已写入源码（SOURCE_IMPLEMENTED），对应测试源码已加入，Node/真实 Chrome/production 结果分别记录；本轮并未把持久化框架更新中心接入真实 Chrome，不能声明全系统更新提醒已完成。

## 3. 事件来源、证据与状态判定

| 对象 | 可信事件 / 数据 | 可宣称状态 | 禁止推断 |
| --- | --- | --- | --- |
| Chrome 扩展本体 | `chrome.runtime.onInstalled` 的 `reason=update` 与 `previousVersion`、当前 manifest；`onUpdateAvailable` 作为待应用信号 | 已更新 / 待应用 | 不根据网页版本号或下载消息声称完成；不为提醒强制 `runtime.reload` |
| Sidebar Tool 官方发行 | 固定可信发行清单、安装记录、版本比较与包完整性核验 | 有待审阅新版 / 安装审阅中 / 已完成 | 不能仅以官方 Catalog 里存在新版本就说已装；不能用版本号免除 hash、来源、能力审阅 |
| 本地或第三方 Tool | 与其原受信任安装来源合同匹配的版本候选；否则“来源未知” | 可审阅候选 / 无可靠候选 | 不可信 GitHub、网页 DOM、iframe 自称最新版可驱动安装 |
| Page Program / Controller Task | 原有各类身份、来源、冻结包与授权状态 | 仅依据其原安装合同显示 | 不自动把 Sidebar Tool 更新语义推广到任务或脚本 |
| 恢复或回执未知 | 安装/写入/读回对账证据 | 待核对 / 未知 | 不假装成功，不换 ID 重放，不把消息关闭触发重试 |

**绝不引入“必须匹配最新官方 Catalog 版本才能继续运行”的门禁。** 已审阅旧版、合法本地包、缺失官方目录时仍应依原合同正常运行。可用性与“是否有推荐更新”是两个不同判断。

推荐内部只读通知事件（字段示意，**尚非已实现公开 API**）：

```json
{
  "schema": "opendesk.updateNotice.v1",
  "entity": { "kind": "sidebar-tool", "id": "prompt-shortcuts" },
  "event": "available",
  "fromVersion": "1.1.20",
  "toVersion": "1.1.21",
  "candidateFingerprint": "trusted-release-fingerprint",
  "requiresReview": true,
  "changes": ["示例：改善输入框适配"],
  "capabilityDelta": [],
  "source": "verified-official-catalog"
}
```

通知去重键使用 Profile + 实体类型 + 稳定 ID + 候选版本 + 源/包指纹 + 事件阶段；同 ID 不同来源不合并为已批准升级。生命周期状态变更 `available → applied` 时覆盖旧消息，不同时显示“待安装”和“已安装”。

## 4. 技术职责与最小复用

**不要先造第二套 Installer、Store、Registry、Background SW、外部更新服务或 iframe 特权桥。**

- `UpdateNoticeCoordinator`（**拟议内部服务**）：从已经可信的安装/发行/Chrome 更新事件汇总只读状态；用原 Storage/生命周期持久化事件去重与通知偏好；MV3 Worker 休眠/重启后能重读状态，不依赖内存定时器或页面常驻。
- `UpdateNoticeSlot`（**拟议可信宿主 UI**）：在现有 React/Side Panel 根树消费只读通知信息，渲染统一 NEW 条、聚合视图与详情。尽量复用既有 design tokens、按钮、布局与导航，不让 Tool iframe 自己实现可信安装入口。
- `PageUpdateToast`（**拟议已授权网页增强层**）：仅与可信宿主通信并读一个低敏的“消息展示许可/摘要”，使用 Shadow DOM/隔离 CSS，限制在已支持/授权网站；不注入用户选择器数据、私密提示词、授权凭证或未审核的远端 HTML。绝不作为 Chrome 其它网站跨域通知的全局脚本。
- `ReviewUpdate`：在可信用户点击后跳转/调用**已有的** `src/ui/sidebar-tools/installation.js` 审阅、版本、包完整性、权限、旧数据/未知状态处理流程。任何新版申请的新增能力、来源替换、需要的原生权限都维持显式审批。
- 不得因为弹窗影响正在运行的 Controller / User Script / Web Flow / Native 请求；Chrome 本体更新由原安全重载围栏决定，提示只读展示，不要求强制刷新会话。

只有在**至少两个真实消费者**验证同一具体需求、现有宿主 props/slots 不够时，才考虑导出可选公共 SDK。开发版的源码热加载不是用户正式发行更新，不应弹“发布了新版本”。

## 5. 打扰控制、可访问性与隐私

- 只在网页可见、页面就绪、用户不处于 IME 组合、重要输入、全屏或高风险操作时显示；可退化为侧栏静态 NEW。对密码、支付、银行、授权弹窗和 Chrome 受限页不插入通知。
- 每个可信版本默认仅首次一个 Toast；仅在用户明确点击首次“稍后”时按 §2.4 允许一次延迟提醒，**最多两次**；跨标签去重、跨进程持久化，关闭/已读/忽略同步到所有可见入口。离线或目录不可达不反复提示“已更新”。
- 普通通知 `role=status`，不抢焦点、无自动打开新标签；详情打开时显式焦点管理，Esc/关闭恢复焦点。键盘、触屏、深色、200% 缩放与 320/360/400/440px 宽度须按实际候选测试。
- 网站内容不成为执行指令：所有来自网页的字符串文本转义显示，禁止插入不可信 HTML 或外部代码；“更新内容”文案也不能请求权限或调用安装器。
- 只保存版本、已读/稍后/忽略与偏好，不采集提示词正文、站点个人资料、历史会话数据；无需远端遥测。

## 6. 分期与最短验收闭环

**R1-Preview（已做；跨标签频控为本轮设计目标，未证明真实后台）**：将独立更新通知演示脚本插入 `projects/prompt-shortcuts/preview/index.html`；展示“可更新、已更新、待应用、需新增权限、聚合、无更新”状态、点击详情、稍后、忽略及三档提醒偏好。仅为交互模拟；所有版本演示数据不代表发行存在。

**R2-Trusted Read-only（待实施）**：核对真正已安装版本与官方候选；显示 Side Panel NEW、详情与历史；Chrome 安装事件落到宿主；验证关闭重开、多个窗口、旧版可用性。无新增权限。

**R3-Reviewed Update（待实施）**：详情“审阅并更新”只进入原可信 Installer。确认前旧版和数据仍可用；成功需真实安装/读回回执；拒绝、来源变化、能力变化、写回未知、旧候选过期都有明确状态；禁止静默升级或重放。

**R4-Page Toast / Preferences（待实施）**：先 Prompt Shortcuts 和另一个实际获准 Page/Tool 消费者，验证站点授权、跨 Tab 去重与无干扰，再抽象通用 Slot；增加用户偏好与聚合通知。

定向测试至少覆盖：同版本无提醒；新版可审阅但尚未安装；确认成功/取消/权限扩大/来源替换/回执未知；Browser `onInstalled` 已更新与 `onUpdateAvailable` 待应用；工具停用/卸载；多标签去重；离线、弹窗关闭重开、服务 Worker 休眠；敏感网页/无权限不注入；草稿/IME/未完成任务不打扰；原有 Prompt Shortcuts 提示词保存/插入与页面规则无退化。

**验收口径**：可点击预览和静态语法检查不等于真实 Chrome/正式包/本机工具更新验收。实施完毕按绑定同一候选的定向 Node、Chromium 与真实 Chrome 证据分别声明 PASS/FAIL/NOT_TESTED；不能提前宣称 95 分以上产品验收。

## 7. R1.2 源码增量与真实验收边界（2026-11-10）

本节为现有文档的增量，非第二套设计或安装器。源代码必须经本机 Node 和真实安装 Chrome 验证后才能宣称生产完成。

### 7.1 实现路径

- `src/platform/chrome/update-notice-state.js`：原 Chrome Profile 的统一持久状态、发行 SHA 与版本身份、短租约、可见 ACK 计数、两次上限、24h 稍后、关闭/查看/忽略、全局与工具偏好。
- `src/platform/chrome/update-notice-service.js`：由 **原 `src/sw.js`** 初始化，使用原 Catalog、Tool Registry、Source/Operation Ledger、Chrome storage 和已使用的 Verified Write / Web Lock。UNKNOWN 不自动重试安装。
- `src/platform/chrome/update-notice-page.js`：Worker 固定函数的 ISOLATED DOM-only Toast。初期支持 ChatGPT、DeepSeek、Gemini 的确定 Origin，必须同时核验 Chrome 主机权限、真实 documentId、已安装启用工具及工具站点授权，普通页面与 iframe 不获可信通知或安装权限。
- `src/ui/react/components/update-notice.tsx` 及 CSS：现有 React Shell 统一入口，Side Panel 与 app.html 共用记录、偏好和更新详情，不加一级 Tab。
- `src/ui/tool-shell.js`：点审阅前重新比对内置发行 id/version/sha256/source，然后委托 **已有** `sidebarTools.openOfficialReview`，继续由原安装器确认来源、能力、权限与回执。点击详情绝不是安装。

### 7.2 状态/失败/当前范围

- `available` / `review_required` 是待审阅，`pending_browser_apply` 属 Chrome 本体待应用；只有原安装事务成功且安装、来源摘要读回一致，或 Chrome 实际 `onInstalled(reason=update)`，才可进入 `applied`。其他为 `unknown`，不宣传安装完成。
- 每可信候选首次只允许一个网页 Toast，用户显式「稍后」才在 24h 后允许第二次；跨标签 Worker 串行 claim，页面 DOM 可见后才 ACK 计数。刷新、Worker 休眠、浏览器重启不重置计数。
- 仅使用已有受信任官方 Tool Catalog 作为候选源；未为任意第三方包、Controller Task 或 Page Program 虚构新版本，也不额外新增后台、Registry、安装权限。
- 任何忽略仅隐藏本版本提醒，不停用或卸载；用户在更新历史仍可手动进入原审阅。工具自身 `ui.notify` 仍限工具内纯文本，不可伪造发行。

### 7.3 待执行验收

- 源码回归：`node --test tests/environment/sidebar-tool-ui-notice.test.mjs tests/environment/update-notice-state.test.mjs` 及现有 Host 相关定向用例。
- 原仓库构建：`npm run check`、`npm run build`；跨标签、安装/拒权/撤权、浏览器重启、权限变更、IME/焦点的真实 Chrome 证据另行独立记录。
- 本轮本地 CodexPro 工作区连接 `UNAVAILABLE`；没有真实执行项目一律写 `NOT_TESTED`。六维真实产品评分 `NOT_SCORED`；本节不能用于宣称最终产品已经通过。


## 8. 2026-11-11 主分支差量整合说明

PR #78 中未进入 `main` 的更新候选状态、Web Toast、原 MV3 Worker 连接、React Side Panel/PC 页面入口及定向测试已进行选择性整合；`src/ui/react/extension-center-ownership.js` 原已在 `main` 且与分支 Git Blob 相同，不做重复替换。持续复用原官方目录/Installer/`ui.notify` 合同，不放宽 AI Proxy 可信来源锁、签名、SHA、权限或浏览器 CSP。当前完成的是源码整合而非真实 Chrome 安装验收；CI 实际结果必须绑定相应 main HEAD。


2026-11-11 当前 GitHub Actions 结果（commit `610f1d31`，run [42863092448](https://github.com/shopable-ai/opendesk-browser/actions/runs/42863092448)）：更新通知相关 Node 21/21 PASS，原 Host 定向 1/1 PASS，`npm run check` PASS；`npm run build` FAIL，原因是独立并行 WebFlow 任务 JSON 被 `opendesk-fixed-sw` 来源门禁拦截（`projects/webflow/tasks/chatgpt.conversation.create.v1.opendesk-task.json`），未放宽门禁。真实 Mac/已安装 Chrome NOT_TESTED。主分支代码合入 ≠ 正式发行已验收。


## R2 框架级入口修订（2026-11-11，最终以最新 main/CI 回执为准）
//
本次改造仅调整可信框架 UI 与 Chrome Action 投影，不新增发行、安装或权限状态源。
工具栏 Chrome Action：0 隐藏，1–9 实际数，10+ 显示 9+；点击继续执行原 sw.js 点击行为。
Side Panel：现有「扩展」Tab 内联相同数字；扩展列表工具栏提供「更新中心」入口，取代右下角 fixed 文字。
PC app.html：在原 ToolHost 上方提供同一个更新中心，不使用第二个状态管理器。
actionableCount：可信清单中 status=available/review_required、未忽略、按 toolId 去重的扩展工具数；已查看仍计入。
unreadCount：其中未查看的数量；只用于提示未读，不表示待安装总数。newCount 保留旧兼容字段。
badgeCount：actionableCount 中提醒偏好不为 silent 的工具数，仍按 toolId 去重。
browserPendingCount：Chrome 本体 pending_browser_apply；单独列在「浏览器」，永远不纳入工具安装角标。
偏好：silent 不弹 Toast 且不显示数字，但更新中心仍可手动访问；inbox-only 有数字而不弹 Toast；
toast+inbox 两者均有；全局静默优先于每工具偏好。
核验：Service Worker 在每次可信 state 写回、核验成功/失败、启动时串行同步 chrome.action；
未核验、失败或写回结果未知，隐藏数字。历史可读，但审阅安装入口禁用。
更新中心只调用已有的「标记已读」「稍后」「忽略」和原安装器审阅回调；
用户查看详情不是安装成功；新增权限仍由原 Installer 授权。
验收边界：Node、npm run check、生产构建和实际 Chrome/Native 验收分别报告，不互相代替。
**注意：本节取代上方 R1 的固定底部通知条入口建议；旧 R1 文字为历史设计背景。**

## R2.1 2026-11-12：更新中心子页与工具关联网页提醒

**性质：确定后续实现范围、证据与防重复开发约束；不是宣布下列业务已实现或 Chrome 验收通过。** 既有 R1 文档的底部永久更新条设计已被 R2 的角标与更新中心替代；临时网页 Toast 不等于原永久更新文字。

### 已实施

- 既有代码提交 c9e020c、React 回归 850c6be；Chrome Action Badge、Side Panel 角标、Worker 更新状态、React 更新入口及原可信审阅器已存在。
- 2026-11-12 提交 d23e37c800eef2952bb1c05db382adb1fe154fe2：仅将更新按钮原循环箭头替换为下载箭头与托盘 SVG，GitHub 源码读回已核实；未改行为，也未取得真实 Chrome 的构建/外观验收证据。
- 原 OpenDeskTool.ui.notify / ui.notify.open/update/dismiss 为已安装 Sidebar Tool 在自己的 Side Panel 或 PC Host 显示纯文本通知的既有 R1.2 API。页面临时更新 Toast 由原可信 Worker 注入，与此 API 不是同一职责。不可将普通工具 Toast 当成可信发行事件、安装成功回执或网页注入权限。
- 旧 Prompt Shortcuts preview/update-notification-demo.js 的底部演示条只属于 Mock；现有 src/platform/chrome/update-notice-page.js 是可关闭的临时网页通知，不能因清除旧永久文字而删除。

### UI 交互选型（仍待代码实现）

- **Side Panel：现有「扩展」Tab 内二级子页面**，点击「更新中心」后进入完整内容区，「← 返回扩展」返回原列表。保留一级导航和原 ToolHost/草稿、未决操作与焦点返回合同，不创建新一级 Tab 或第二 React Root。
- 更新中心正文：待更新、历史、OpenDesk 本体、提醒设置。显示名称、版本、可信来源、逐版本更新说明（没有则明说未提供）、新增能力/权限与状态。来源不可验证/离线时不能报告「已是最新版」。
- **PC app.html：复用同一 UpdateCenterPage 内容和控制器**；按既有宽屏布局决定是否呈现在工作区或右侧抽屉，但绝不新建并列更新源和安装器。下拉浮层不适合长列表和 280–420px 的 Side Panel；原权限审阅弹窗仍由原 Installer 独占。
- 「更新中心」入口是导航，「检查更新」才是执行检查的次级操作。0 项或静默时入口仍可打开历史/设置。安装按钮只进入原可信安装器；查看/标记已读不能扣减待处理数。HTML Mock 用于体验测试，不充当真实安装或网页通知证据。
- 当前 src/ui/react/components/update-notice.tsx 的 UpdateNoticeSlot 仍以 position:absolute 的非模态浮层实现，**二级子页面尚未实施**。

### 网页更新提醒的 P0 真实缺口（待修复）

当前 src/platform/chrome/update-notice-service.js 的 siteAllowed(origin) 只检查 ChatGPT、DeepSeek、Gemini 等白名单、Chrome Host 权限，以及 reading-toc 或 prompt-shortcuts 中任一个已被允许；而 checkToast() 通过 claimUpdateToast() 从**全部**待处理 Sidebar Tool 发行中选择候选，没有把每个候选 toolId 与当前网站实际运行/获准的同一个工具身份绑定。

因此，现有源码存在**相关网站上展示无关工具更新**的风险。来源白名单并不等于工具与页面相关；尚未取得此问题在 Chrome 发生的实机证明，不能将风险说成实机已复现。

必须满足的补丁验收：
1. 全局 badgeCount 仍显示所有有效待处理工具；网页 PageToastCandidates = 可信待处理候选 ∩ 与当前页面真正相关、已安装、已启用、已获准并在当前 document 运行的 toolId。不能因为阅读目录获准就显示另一个工具的更新。
2. 只有 Side Panel/PC 界面的工具仅在更新中心与角标提示；无网站权限、工具停用/卸载、实例不活跃、来源未知、隐身或敏感页面禁止网页 Toast。
3. claim / ACK / view / snooze / ignore / Worker 恢复与撤权隐藏均需重新绑定 releaseKey、toolId、tabId、documentId、可信授权和活跃实例。原网页、Tool DOM 或工具自身的 ui.notify 不能声明「官方发行」或伪造安装完成。
4. 仍复用既有跨标签 Web Lock、30 秒租约、同候选默认一次/显式稍后 24 小时最多第二次、Profile 同时最多一个 Toast 和全局频控；同一网页多个真实相关工具可聚合提示，但逐个独立安装审阅。
5. 优先补无关工具、权限撤销、跨页面导航、运行停止、同页多个相关工具以及多标签的负向测试；测试通过前不得宣称相关网页通知已合格。

### 工具生命周期：检查与提示分开

业务阶段：已安装 → 已启用 → 当前站点授权/活跃工具实例 → 读取可信更新快照 → 同一 toolId 的可信候选 → 用户提醒偏好/安全页面/频控 → 原 Worker claim → 真正渲染与可见 ACK → 查看/忽略/稍后 → 原可信安装审阅 → 真实安装与来源回执。

安装、工具启动、网页首次激活、Worker 恢复和用户打开更新中心是「核对快照」的契机；不要每次工具运行或标签切换都向服务器发 HTTP。过期时只能由原 Worker 按统一节流合并刷新；检查不必展示，展示不等于许可，点击安装也不等于确认完成。工具是否有更新不能改变旧版的合法运行状态。

页面切换、工具禁用/停用/卸载、站点撤权或用户切换静默时，应立刻重新判断并移除不再适合的 Toast；输入、IME、全屏、支付、敏感表单和正在执行重要操作时不抢焦点，退化为侧栏静态更新。

### 发行来源与远程更新仍未闭环

目前 loadOfficialCatalog() 主要读取**随 OpenDesk Browser 扩展打包**的官方发行目录；已有市场网站、有限的网页安装审阅交接和本机安装测试不等于旧 Browser 能及时发现服务器新发布的所有工具版本。Stay Focus 特例远程签名公钥仍为未配置，不构成通用在线市场更新源。

下一阶段先审计现有 build-official-tools、build-market-site、official-catalog、市场来源锁与安装器，尽量由原市场/CDN 提供签名的不可变发行 metadata（publisher、toolId、version、包 sha256、字节长度、能力增量、兼容性、可选真实变更日志、发布/撤回状态）。可信 Worker 验签、防回滚、来源校验后只产生可审阅候选；原 Installer 才能校验包、确认权限、安装并核对回执。不建立第二套 Registry/Installer/权限系统，不让网页传递任意下载 URL 执行。正式来源/密钥/部署未就绪时标为 BLOCKED，不能将 Mock 或本机 HTTP 演示充当上线。

### 唯一剩余执行顺序与验收

T01 已完成：只替换循环箭头（d23e37c）。
T02 P0：补无关工具不得网页误弹的回归用例，并最小修复候选与当前活跃工具身份匹配。
T03：先将已有交互预览改为「扩展 → 更新中心」二级页面，确认后增量接入现有 React 根，不重写 Toolbox/Installer。
T04：补空态、离线态、实际变更说明、OpenDesk 本体命名和生命周期节流与撤权隐藏。
T05：独立可信在线发行发现与原安装器闭环；生产来源前提缺失则 BLOCKED。
T06：Node 定向、npm run check、npm run build、Chrome for Testing、真实 Chrome 的截图与行为分层验收。六视角独立百分制，各项≥90 且算术平均≥95 才达到目标；没有真实 Chrome 证据不能评分代替验收。

跨对话严禁重复编写 Badge、UpdateNoticeStore、原通用 ToolToast、OpenDeskTool.ui.notify、网页 Toast、官方 Catalog、安装器或另设新通知数据库。只处理明确剩余问题并保留 main 的并行开发变更。

## R3 2026-11-12：扩展列表原位更新最小方案（取代 R2.1 二级更新中心提议）

**产品决策已确认，状态：UI/功能设计；正式扩展代码与 Chrome 实机验收仍待实施。**
原始目标：用户打开现有「扩展」列表，就能直接看到并审阅可信新版。更新入口尽可能少，不引入第二套扩展管理系统。
本节是 R3 唯一有效的新增 UI 决议；上方 R1/R2/R2.1 的“独立更新按钮、系统内置更新中心行、二级中心页、完整更新区、批量审阅队列”均只作为历史讨论保留，**不再作为本轮待实施项目**。

### 1. 唯一默认布局

- 「扩展」Tab 和 Chrome Action 保留现有更新数字角标；不新增一级 Tab。
- **移除「扩展」列表工具栏右上角独立下载/更新按钮**；不新增“更新中心”列表项，不显示“系统内置”字样，不插入“待审阅更新（3）”标题、固定大卡片或大横幅。
- 已安装且符合可信可审阅条件的工具按展示优先级排到现有默认已安装列表前部，行内仍使用原图标、标题、说明、类型及管理菜单。
- 该行右侧保留可见文字按钮：正常可信候选显示「更新」，需要新增权限时显示「审阅」；两者都只代表**进入原安装器的安全审阅**，绝不是一击安装。屏幕阅读器完整提示“审阅 XX 的更新”。
- 未有更新的工具与原布局一致；0 项无分组/空更新区域，静默偏好不隐藏可信候选本身。默认列表的展示排序不能写回安装 Registry；主动搜索、类型/范围筛选维持原筛选语义及结果顺序；一旦运行/焦点/用户工作流有待决事务不强制重排或切换当前页面。
- 280/320/360/420px 及 200% 缩放：更新行操作常显、预留宽度，不依赖 hover；长标题/版本信息可截断或换行，不能遮挡菜单/按钮，触控目标与键盘焦点可用。

### 2. 低频历史与提醒设置：原「⋯」菜单

- 已存在的已读/稍后/忽略/历史与全局/逐工具提醒偏好不可删除；从「扩展」页面现有工具栏「⋯」增加一个「更新记录与提醒设置…」入口，使用既有 React 更新状态控制器及记录面板，**不创建新安装中心、状态数据库或独立 React Root**。
- 任何时间（包含 0 项、静默、离线）都可手动进入查看历史和设置。关闭后返回先前入口、恢复焦点；网页 Toast 点击“查看更新”应打开现有「扩展」页并优先定位对应工具，不能跳到已被移除的孤立更新按钮。
- OpenDesk Chrome 扩展本体只报告 Chrome 可信事件和其管理责任，不作为内部 Sidebar Tool 更新按钮候选。
- 「忽略本版本」仅影响该版本的提醒/排序；若要恢复需在现有状态 owner 内设计显式操作和身份核验，不凭 UI 清零模拟安装结果。
- 没有真实逐版本发行说明就写“发行方未提供本次变更说明”，不能拿商品简介或测试文案充当正式 Changelog。

### 3. 单项更新触发合同与状态边界

1. 原 Worker 校验 installed identity + 官方可信候选 (toolId/version/sha256/source) + 来源记录 + enable 状态 + 未决事务及 capability delta，只有 status=available 或 review_required、非 ignored、无未知结果的候选允许显示可执行按钮。
2. **不得仅使用 `composeExtensionEntries().update` 版本比较布尔值作为安全操作授权**；该字段可用于显示弱提示，但可点击更新必须依赖最新核验结果的只读投影，并绑定原列表的安装身份与版本。
3. 点击「更新」/「审阅」→ 复核同一发行身份 → 原 `sidebarTools.openOfficialReview` / 原 Installer → 用户单项确认新增权限及影响 → 原安装锁、生命周期、数据保留与安装日志执行 → 安装及来源真实读回 → 确认成功后才移除该更新按钮。
4. 取消审阅维持旧版本；失败展示错误且保留可恢复入口；来源替换、同版本不同摘要、降级、离线、未核验、禁用/撤权、安装中、回执未知均不得提供可绕过原合同的快捷更新。旧版工具仍可合法使用，不以是否匹配最新 Catalog 作为普通运行前提。
5. 并发触发、重复点击、Worker 重启与未知 ACK 通过原 installer journal/Web Lock/verified write 协调；已读不减少 actionableCount；全局角标仍遵从提醒偏好，不将网页站点相关性错误用于全局计数。

### 4. 这轮明确不做的功能

- 暂停「更新中心系统内置应用」、更新二级子页面、独立更新卡片、更新分组标题和第二个顶部按钮。
- 暂停「更新所有」和「批量审阅」；当前 `src/marketplace/batch.js` 是固定套装批次协调，不是任意 Tool 的升级器。若后续多个用户真实需要批量能力，再由安装安全审计决定是否启用。
- 暂停新 Registry、新 Installer、新权限系统、独立后台数据库和重复的 HTML 预览。保留 R5.1 扩展中心原型并增量加入 R3 可信列表按钮的模拟。
- 远程可信发行发现、签名根配置、撤回/防回滚仍是**独立 BLOCKED 依赖**；随包 Catalog 不是旧版本 Browser 的实时在线最新版证据。不得将测试预览或版本示例作为正式发行。
- 网页 Toast 的 P0 身份相关性缺口仍未解决：全局 Badge 覆盖所有可信待更新项目；网页 Toast 严格限定当前文档相关、已授权、已启用、活跃的同一 toolId，不得提示无关工具；如无法证明关联，关闭网页 Toast 而不影响列表更新。

### 5. 实施与验收顺序（防跨会话重做）

- **D01 设计/预览**：修改既有 `prototypes/sidebar/extension-center-r47-frequency-first-preview.html`，演示 0/1/3/10 项、单项「更新」与新增权限「审阅」、历史设置入口、无重复 icon/系统行/分组标题；预览只模拟，不写安装记录。
- **D02 正式 React 接线**：`src/ui/react/tabs/tools.tsx` 与 `src/ui/react/app-shell.tsx` 复用原列表/更新控制器，将 Worker 可信可审阅投影映射到已安装行，按钮始终可见；在既有「⋯」提供历史/设置入口；撤销旧 `UpdateNoticeSlot` 独立 toolbar trigger，保留原历史功能与网页 Toast 打开路径。
- **D03 原可信 Installer 回调**：保持 `src/ui/tool-shell.js` 原正式身份核验与审阅调用，只处理因入口变化产生的导航/焦点/结果接线；无用户权限确认不得安装，不因简单文案虚构成功。
- **D04 P0 安全**：修复网页无关工具提示，补撤权、页面切换、禁用、停止、隐身、未知状态负向测试，确保 per-tab claim 使用真正相关同一工具。
- **D05 验收**：Node 定向用例 + `npm run check` + 生产构建 + 280/320/360/420px 与 200% 的 Chrome 实际截图 + 安装/取消/新增权限/来源冲突/未知回执；CI 构建出现其他并行 WebFlow provenance 阻断时不得放宽来源门禁，也不能称更新功能发布通过。

**验收标记**：本节为设计与执行合同，不表示正式 React 入口已经删除、远程发行发现已完成、Node/构建/真实 Chrome 已通过。六视角独立设计评分可用于方案比较，但最终产品分数须由真实验收证据支撑。
