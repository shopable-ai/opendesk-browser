# Time Review R1.4 · 旧版 `src-bex` 实际业务蒸馏及权限边界

> 2026-10-13；代码基准：旧 `shopable-ai/todo-user@0dc7b07959f762e5be8f2f3847a71dc8c4b16aa5`，新 `shopable-ai/opendesk-browser@7a4da3e6e2cb88bbfba7015f7ee5b21fab50e2a3`（最初源码审查基准；实际合入以 main 提交为准）。本文件描述已纳入 R1.4 主分支集成的旧版调用链与迁移原则；新的 Chrome 原生验收须按本次提交另行核对。

## 一、旧版完整业务链：监听注册不等于有效计时

1. `src-bex/manifest.json` 规定 `*://*/*`、`all_frames:true`、`match_about_blank:true`，在大量网页上注入 `my-content-script.js`、`assets/js/detect_focus.js` 与依赖。该全局注入方式不迁移。
2. `detect_focus.js` 的 `TimeReviewDetector.events` **注册** `focus`、`click`、`keydown`、`mousemove`，在每 250ms 节流后用 `chrome.runtime.sendMessage` 上报事件名、`document.title`、完整 `location.href`、`detail`。
3. `background.ts` 的 `chrome.runtime.onMessage` 将 `hid_` 去前缀；业务 `switch` 中只有 `case 'mousemove'` 进入 `handleHidMouseMove(request)`。其他三个事件**虽已注册并发送，并未走入此处 Time Review 的 addAction**。
4. `handleHidMouseMove` 使用 `request.url/title/active`，写 `localStorage.currUrl/currTitle`，再 `timeReview.addAction({path:url,title,action:'mousemove',app:1,timestamp,duration:0})`。它并未要求发送者来自获准 tab/document/origin。
5. `background.ts` 的 `initApp → initEnv → initData` 取得配置与已有 `localStorage.token`，`new TimeReview({baseURL:BASE_URL,token})`。若无凭据可能保持不上报；旧 UI 将登录与计时混在一起。
6. `TimeReview` 构造后执行 `initData` (`GET /app/todo/action/config`)、`sendLostCacheAction`、`startInterval`。`addAction` 将动作放入按 URL 键控的 `delayData`。
7. 每 60s `dowichSend` 只选择按 `duration` 排序的**最长** URL；其余动作抛弃，再使用按分钟四舍五入及 `indexTimestamp` 构造 `createTime`。`doCheckSend` 提前把待发 JSON 放 `localStorage.action`，处理跨日与前一条合并，最后 `httpSend` 调 `POST /app/todo/action/add`。
8. `chrome.idle.onStateChanged` 只在 `locked` 时试图 `doSendBeforeClose`，不是统一计时可信状态机。页面退出/浏览器退出的异步发送和 Worker 休眠无法保证完成。
9. `my-content-script.ts` 主要包含网站黑名单、限制时间、提醒和重定向；不应误标记为 Time Review 的核心键鼠计时。`TraceTimeCore.js` 仅有空壳对象；`TraceTimeUtil.js` 包含过时的浏览器识别、定时器、XHR 和 URL 清洗工具，不能作为受信任时间状态机。

## 二、逐项迁移矩阵（以真实消费者为准）

| 旧代码 / 功能 | 触发及旧数据 | 新版已有对应 / 迁移决定 | 验收依据与现状 |
| --- | --- | --- | --- |
| `detect_focus.js:messager` | focus/click/keydown/mousemove；全 URL、标题、detail | **不迁移**全站注入；只有确证 Chrome 原生模型缺口才研究获准域名的受控心跳 | 旧监听/业务消费者已核对；新内容脚本 NOT_IMPLEMENTED（有意） |
| `background.ts:handleHidMouseMove` | 只处理 `hid_mousemove`；localStorage 与 `addAction` | 已由 `src/time-review/service.js:observe` 的 tab/window/idle/host grant 判定**替代** | R1.3 历史真实 Mac Chrome 成功 run 38254766089 |
| `TimeReview.addAction` | URL 作为 key、动作时间、累计时长 | 已由 `model.js:settleReview` 的 checkpoint、毫秒日汇总代替 | R1.3 54 项组件及真实网页活动记录 |
| `dowichSend` | 60s 汇总、只保留最长网页、分钟取整 | **废弃算法**；现以 30s alarm 与最多 45s 安全间隔归属每个已验证域名 | R1.3 两主机切换与自然 idle 已有历史证据 |
| `doCheckSend` / 跨日 | 字符串 `createTime` 拆分、`duration` 重算 | `settleReview` 按本地日界拆分、毫秒存储；DST 分钟面板保守 unavailable | Model 组件 PASS；尚需新候选 DST 真实测试 |
| `sendLostCacheAction` | 单一 `localStorage.action` 退出重发 | **废弃**；新宿主持久写确认 + 会话 UUID + 不补造已失效时间；新增同步 outbox 独立建模 | R1.3 Worker/Chrome 重启历史 PASS；R1.4 队列组件 12/12 PASS（隔离执行） |
| `doSendBeforeClose` | 锁屏/结束回调尝试发送 | 不复用；退出时不得依赖异步最后上传 | 设计决策，无新增事件监听 |
| `initData` | GET config → index/precision，Authorization | **仅保留**服务器能力协商需求；旧 index 精度数据库技巧不迁移 | 旧 API 实时兼容性 BLOCKED |
| `validate` | GET apikey/validate，Token 或 X-API-Key | 待可信账号/身份 Host 复用；凭据永不传工具 iframe | 旧 API 实时兼容性 BLOCKED |
| `setToken` / `setApikey` | 改实例变量并重新初始化；Axios 全局默认污染 | 不迁移 setter；应由可信 Host 的账号连接生命周期管理 | 尚无已验证生产凭据契约 |
| `httpSend` | POST 原始动作，包括 `path/title` | **不兼容强推**；未来采用仅 day/hostname/duration/category 的幂等 PUT/upsert | R1.4 隔离 HTTP 请求契约 12/12；生产 BLOCKED |
| 数据库 `indexTimestamp` | 给分钟 `createTime` 拼可区分毫秒 | 用稳定内容哈希 recordId + revision + 单账号/设备作用域，服务端原子 upsert | R1.4 单元测试 PASS；未验证真实服务端 |
| `TraceTimeUtil.js` | XHR、interval、随机 ID、URL 净化 | 功能已由 Chrome API、新模型及加密 SHA-256 所替代；不复用旧文件 | 旧文件实读核查 |
| `my-content-script.ts` | 专注提醒、黑名单/重定向 | Time Review 本轮不迁入 Focus Blocker 产品逻辑 | 旧文件实读核查 |
| Side Panel 关闭后后台运行 | 旧 background 与 UI 脱钩 | 新 `src/sw.js → importScripts('time-review/time-review-host.js')` 及 alarm、storage 持久态已建立 | R1.3 原生 Side Panel 及 SW 真重启通过；新包 NOT_TESTED |
| 关闭、停用、升级、卸载 | 旧版内存单例/弱退出 | 新 Authority epoch 与安装存储清理；旧未实现迁移不再新建独立调度 | R1.3 历史工具生命周期原生 PASS |

## 三、新版可信时间判定与准确性口径

- 只有用户已安装、启用、信任并在可信设置点击**开始记录**，同时 `idle` 已授权、普通 Chrome 窗口聚焦、tab 有效、HTTP(S) hostname 获得站点授权，才允许建立活动 checkpoint。
- `tabs.onActivated/onUpdated/onRemoved`、`windows.onFocusChanged`、`idle.onStateChanged`、`permissions.onRemoved`、`alarms.onAlarm` 触发重新观察。暂停、撤权与安装 epoch 改变均中止未来累加。
- `storage.local['opendesk.time-review.v1']` 保持同一权威状态。`storage.session` 保留 Chrome 浏览器会话 ID，不跨浏览器重启虚构计时。`navigator.locks` 串行同一工具存储写入。
- 30 秒检查点与最大 45 秒可验证时间窗口会保守**低估**读网页/被动视频的真实观看时间。系统 idle=active 不证明一直在注视 Chrome 内容；用户在后台 App 活动时焦点过滤必须有效。不要宣称支持眼动级真实注意力。
- 无点击的阅读在 Chrome idle 阈值之前可以计；长时间观看视频和听音频会因系统 idle/失焦被保守停止。当前**没有足够证据**证明新增网页事件监听比现有模型更准确，故本轮不注入脚本。
- DST 23/25 小时天：新 Canvas 分钟结构选择不可表示而不是虚构 1440 等长分钟；日汇总仍需额外边界测试，不能把历史原生 PASS 直接用于未经验证的 DST 候选。

## 四、同步设计：**默认本机、零登录、零上传**

### 本轮可交付的离线同步基础（R1.4 准备补丁）

`src/time-review/sync-outbox.js`：只在 **可信 Host 未来明确关联账号并单独取得云同步同意后**允许 `beginReviewSync`。它在授权瞬间记录**当天原有计时基线**，不得补传早于授权的日数据；从可信日汇总中派生后续的 `{date,host,ms,category}` **累积 upsert 状态**，不是假的浏览访问动作。设备/账号范围 `scope`、稳定 hash ID、单条 revision/ackedRevision、可恢复队列、上限 1000 条、指数退避与 12 次失败封顶均有明确语义。不会传完整 URL、标题、搜索词、原始动作或 Token。

`src/time-review/sync-transport.js`：受控 HTTPS `PUT /v1/time-review/daily/:id` 契约；必须有来自可信 Host 的精确 origin allowlist、已授权的 Chrome host permission、临时凭据和确认过的服务端 schema。服务器只回 HTTP 2xx 不代表成功，必须验证 `protocol/scope/id/revision/accepted` 完整回执；响应丢失按**同一个记录 ID、同一个 revision** 重新 PUT，服务端必须按 `(authenticated account,scope,id)` 原子幂等 upsert，不得累计加法。401/403 停用连接，429/5xx 带退避。请求禁重定向、跨站 Cookie、Referer 和缓存。

**当前不能激活任何生产上传**：旧服务器 `api.todo6.com` 的三个 API 实际线上响应、合法身份验证方式、是否支持新幂等协议、Chrome 精确 host permission 及服务端保存/对账均未核实。隔离模块可测试，不等于已经可对线上服务同步。上线前须通过 Host 正式账号连接与点击授权；不能通过仅编辑工具 JSON/UI 来开启网络。

### 真正上线所需的事务边界

1. 同一个本机权威记录 `opendesk.time-review.v1` 一次持久写完成**计时 + 队列修订**。否则两把 storage key 不能用 `chrome.storage.local` 保证跨键事务。
2. 发送器仅由可信 Host 的恢复调度唤醒；同一账号范围和 origin 由 Authority 重新检查。关闭 Side Panel 后依然由扩展 Host 唤醒，不允许 iframe 变成调度器。
3. 在网络请求前确定并持久化 pending revision；网络请求后只在服务端明确 ACK，且本地锁和账号仍匹配时，记录已确认 revision。回执不明不得标成功，不可使用非幂等 `POST /app/todo/action/add` 无脑重试。
4. 退出连接/切换账号要清楚显示未发队列的丢弃范围；本地清空与远端擦除不是一回事。**服务器侧数据删除要单独获得确认**，不能假定退出登录或卸载浏览器自动删除远端记录。
5. 多设备可能重复活跃：记录 ID 目前按设备实例隔离，服务端需要明确区分每设备合计与账号跨设备合并，不能把同网站重叠活动简单相加并宣称是唯一使用时间。未经完整多设备实测状态为 BLOCKED。

## 五、插件/Host/框架边界与构建要求

| 所属执行世界 | 可以做 | 禁止做 |
| --- | --- | --- |
| 不可信 Time Review 工具 iframe | 六分类、Canvas、历史、状态展示和普通操作请求 | 获取 Token、`chrome.tabs`、任意 HTTP 上传、常驻计时、改写 Authority |
| 受信任工具详情设置 | `isTrusted` 用户点击、`idle`/可选 sync origin 授权、账号连接/撤权 | 静默开始同步或网页消息直接改设置 |
| 受信任 Time Review Host | 浏览器观察、唯一结算、持久队列、同步发送、身份确认及生命周期恢复 | 让旧脚本/iframe 获得自己的强权限执行器 |
| 服务端（未来） | 认证、原子 revision upsert、持久 ACK、设备/账号去重、删除与对账 | 在客户端成功前反复加法累计分钟时长 |

- 修改 `examples/sidebar-tools/time-review/src/*` 且不改协议/权限的 UI，可独立重新打包工具，遵守已安装 packageHash/epoch 升级语义。
- 修改 `src/time-review/**`、`src/sw.js`、`src/ui/sidebar-tools.js` 或新 `host_permissions` **必须重新构建并安装整个 OpenDesk Browser 扩展**；工具包更新**不会**自动替换可信 Host。
- 不增加另一套 SDK、Scheduler、Storage/Permission Store 或第二个 Time Review 后台。不要复制 `src-bex/background.ts`，也不要恢复其全站注入、全局 Axios defaults、Socket、eval、CSP 修改或过量 host permissions。

## 六、验证及阻塞（不冒充新候选）

- 旧真实 Mac Chrome：原候选 `e1e82ea7501c41713e6215883adac1f7836ab367`，Actions 38254766089：`SUCCESS`，仅原来源候选。针对后续 SHA 的受影响源图变更必须重新验收。
- R1.4 **隔离 JS 模块**：`node --test tests/environment/time-review-r14-sync-outbox.test.mjs`，12/12 通过：基线防回填、记录 ID 稳定、修订准确、丢失 ACK、延迟退避、账号隔离、上限、敏感字段与 HTTPS 原点验证。
- R1.4 CI / 本机 Chrome / 生产 HTTP / 服务端保存与多设备：`NOT_TESTED` / `BLOCKED`；不能宣称 `95/100` 产品正式通过。
- 并行写入：本轮阅读期间 `main` 从 `7a4da3e6` 到 `de52893a`（3 个 SDK 相关提交），经用户明确授权按单次原子提交写入 main，校验分支 HEAD，避免覆盖并行 Agent 变更；原生验收另列。

**通用抽象原则**：用“沙箱 UI + 单一可信 Host + 可验证的本地状态机 + 按能力授权的持久队列 + 经过确认的外部服务契约”复用业务能力。旧系统的需求与数据准确性思路可传承；旧宽权限/不可信网页消息/伪造历史事件/无幂等发包模式必须永久禁止。
