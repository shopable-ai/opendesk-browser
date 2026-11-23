# OpenDesk / GrayDove · 统一账号、VIP 云同步与备份（R1–R3 权威设计）

> 状态：DESIGN_PROPOSAL / NOT_IMPLEMENTED。2026-11-22。仅为方案与接入契约，不代表任何账号、同步、会员后端或自动恢复功能已实现或通过验收。任务：OD-UNIFIED-ACCOUNT-CLOUD-SYNC-R1。

## 0. 决策摘要

**选择「一个公共账号与轻量云服务 + 一套可信宿主同步内核 + 每个产品一个数据适配器」，而不是各扩展自建账号，或将 Chrome 原生 storage.sync 作为唯一数据源。**

目标体验：本地无需登录即可使用；用户在首台设备明确启用某产品同步后，其他设备登录同一账号且已安装、授权该产品时，在无冲突场景自动恢复；各设备在线时增量收敛；离线编辑不会丢失；误删可从历史版本恢复。无需逐产品重复注册，仍不能隐含「登录 = 所有产品数据全部上传」。

三个不同的成功条件：
1. 同步：不同设备收敛到最新合法记录；
2. 备份：保留可回退的历史版本；
3. 新设备恢复：只恢复已安装、已授权产品的设置；**不安装扩展、不新增网站权限、不恢复网站 Cookie/登录态**。

设计约束：无微服务/CRDT/实时长连接强依赖；公共协议最小化，先用 HTTP 增量 + 本地持久化队列 + MV3 事件/alarms 补偿；大文件、支付平台、公开共享规则后置。

## 1. 仓库事实、可复用资产与证据缺口

只读调查首次见 main SHA dc81d77c92446eaf4acd4dcf619f4fd30e3e1b3b；本轮 main 后续有并行推进，具体源码/部署实际状态实施前重读。

| 分类 | 证据 | 结论 |
| --- | --- | --- |
| 已存在 | manifest.json：MV3，storage / alarms / 主机架构；根 AGENTS.md | 固定可信宿主与插件沙箱边界，不创建平行 Host |
| 已存在 | docs/api/sidebar-tools.zh-CN.md | 已有工具独立命名空间、storage.get/set 与 ETag/ifMatch、统一通知、PC 工具页 |
| 已存在 | projects/video-auto-skip/tool.config.json、src/rules.js、src/main.js | 连播助手是 Sidebar Tool v2：storage.local + page.module；规则单键 rules.v1，series.defaults / episodes，字段 intro/outro/next |
| 已存在 | projects/video-auto-skip/README.zh-CN.md | 工具私有存储单键 8 KiB、总量 32 KiB；不能把宿主额度等同于 Chrome storage.sync 的 100 KiB |
| 已存在 | projects/mouse-gestures/src/main.js | 第二消费者候选：preferences，包括 enabled、trigger、menuPolicy、showTrace、gestureMappings |
| 可复用 | Browser Framework 的存储 CAS、工具身份、宿主界面、通知、各产品存储适配 | 不复制到业务工具；在可信层编排新增公共服务 |
| 待新增 | 公共身份、服务端权益、同步服务、版本快照、受控 SDK 接入、诊断与测试 | 此次只定义合同，不假装已有接口 |
| 尚未确认 | 全仓是否另有账号/付费/后端生产组件、现行跨设备数据能力、实际远端部署、独立 Chrome 扩展清单 | 实施阶段先做定向全仓发现；不能把云控/扩展市场等同于账号系统 |

业务存储的规则身份来源已有站点/测试页适配：如 iyf:work + episodeKey、local:work:season。不同设备恢复数据可以做到，但是否能重新命中同一个视频需依靠**可重复得到的合法媒体键**；跨设备键不稳定时只报告“已恢复配置，当前视频未匹配”，不得猜测跨站作品身份。视频时长不是记录 ID。

根 AGENTS.md 要求：按真实执行世界归属；普通沙箱工具不取得 Chrome 特权和令牌；新增公开能力先证明缺口并由平台 owner 实施；源码、产品 UI 与运行测试独立归属。本轮无源码修改。

## 2. 需求树（用户价值）

- A 统一账号（P0）：注册登录、复用身份中心、退出、过期恢复、产品间身份共享；独立扩展各自建客户端会话。
- B 多设备配置（P0）：本地修改立即生效、首次合并、自动增量、离线队列、冲突保护、新设备恢复。
- C 云备份（P0 最小/P1 增强）：当前有效云副本、保留历史快照、恢复前保护副本、版本恢复与传播。
- D 多产品接入（P0）：产品独立授权和命名空间、公共 SDK、数据适配器、第二产品验收。
- E VIP（P0 预留/P1 商用）：服务端权益、到期降级、续费后的合并、配额、留存与导出；支付、订单后置。
- F 用户控制与安全（P0）：明确上传范围、退出与切换账号隔离、设备撤销、隐私与导出；后续设备管理 UI。
- G 运营（P1/P2）：存储消耗、失败/冲突监控、审计、滥用配额、工单、服务端备份恢复。

## 3. 功能树（实现职责）

1. Identity Service：用户身份、标准授权、会话续期、登出、设备撤销。
2. Entitlement Service：Free/VIP/指定产品权益，服务端最终决策。
3. Sync Engine：变更监听、持久待上传队列、增量拉取、重试、幂等、冲突。
4. Backup Service：定期/操作前的历史快照、恢复成新版本；与数据库灾备独立。
5. Client SDK：宿主可信 Bridge/Adapter、独立扩展客户端、同步摘要与诊断。
6. Product Adapter：数据枚举、敏感字段过滤、稳定记录键、校验与迁移、应用云端记录。
7. Account UI：Side Panel 状态摘要、PC 账号/同步范围/历史/设备管理。
8. Admin & Operations：限速、日志与审计、配额、异常指标。

以上为**逻辑模块**，第一版建议一个后端单体 + 关系数据库 + 一个 SDK/引擎 + 产品适配器；不是 8 个服务。

### 宿主产品与独立扩展两条接入路径

A. 同一 OpenDesk 宿主中的 Sidebar Tool：固定可信宿主登录一次；业务沙箱通过经审计的产品作用域接口取得同步状态/保存数据；服务端与宿主从真实安装身份绑定 productId，不能让工具自报 userId/productId 授权到别的工具。登录令牌不进入业务沙箱、content script 或网页。

B. 真正独立安装的 Chrome 扩展：使用同一个 OIDC/账号中心，基于授权码+PKCE 和合法 redirect URI 独立建立客户端会话；共享账号不等于共享 Token。身份站点已有会话可以减少输入，但是否弹窗取决于浏览器隔离和会话状态。需单独注册 clientId、redirect URI、允许的产品范围，不承诺无感登录。

独立工具安装、扩展安装、浏览器权限与云同步同意是四个独立事实；绝不云端推送可执行 JS 或绕过权限。

## 4. 数据分类与同步同意

| 产品与数据 | 默认建议 | 理由 |
| --- | --- | --- |
| 连播助手：作品/单集片头片尾、相对尾段、自动下一集规则 | 可同步，首次明确授权后 | 核心用户价值；保留范围、启用与显式关闭、业务结构版本 |
| 连播助手：个人站点偏好与已确认匹配键 | 可同步，需确认已实现存储字段 | 不能保存含令牌 URL、媒体流地址，不能制造未知作品身份 |
| 连播助手：观看记录、完整浏览 URL、播放进度 | 首版不同步 | 隐私高，功能收益未证实 |
| 连播助手：当前播放器、标签页、暂停/跳转状态、下一集执行回执 | 仅设备或会话 | 同步后会在其他设备引起错误行为 |
| 鼠标手势：手势动作映射、触发模式、轨迹展示偏好 | 可同步 | 便于跨设备恢复 |
| 鼠标手势：临时轨迹、正在执行的手势、当前标签页 | 仅设备 | 属于运行态 |
| 鼠标手势：enabled 全局还是本机 | 需要产品决策，默认倾向本机 | 防止其他电脑突然启停 |
| 所有产品：机器路径、窗口坐标、设备本地开关 | 仅本设备 | 不具备跨设备可移植性 |
| Cookie、密码、登录凭证、API Key、私密对话、网页正文 | 不进入普通配置同步 | 敏感数据另设专用授权/安全合同，不与云备份混用 |

首次在设备 A 开启“连播助手云同步”时进行产品级说明与授权，并存储 account+product 的启用状态。新设备登录后，**已开通的产品**在安装/权限就绪时可自动恢复；新安装的其他产品不因全局登录自动上传。可提供“对未来产品自动启用”的独立显式选项，默认关闭。

## 5. 连播助手最小接入（不改变播放器业务）

- 保留现有 rules.v1 与 intro / outro / next 合法性检查；服务端不成为播放规则裁判。
- 适配器把聚合数据标准化为 scope record：产品 ID + 现有可复现 seriesKey + 范围类型（series/episode）+ 适用 episodeKey；单条 record 整体保存 intro/outro/next，避免字段合并出重叠区间。
- 云端记录使用稳定记录 ID，不用单纯时长或猜测作品名称；保留本地原有键和兼容性证据，不强制作品/季/集 AI 识别。
- 本地被明确删除产生 tombstone；缺失或默认值不能视为删除。
- 从云端恢复前，按规则验证和原工具 CAS 写入；失败不覆盖最后一份有效规则，必要时暂停应用并提供诊断。
- 现有规则聚合单键 8 KiB 是真实 P0 容量闸门：小样本可直接适配，但若需恢复超过该额度的合法规则，先由业务 owner 实现经过验证的 RuleStore 分片或分记录存储；不能因云服务空间足够就宣称本地能无损恢复。
- 不同步播放动作或执行收据；在线收到规则更新时安全刷新适配器，不对正在播放的会话补发历史 seek。

第二个产品建议 mouse-gestures，仅复用公共 Sync Engine、身份、权益、版本、备份，不把视频特有的系列键和视频时间校验搬进公共代码。

## 6. 核心一致性策略

**本地提交优先。** 用户保存立即写本机，经原有存储条件写入后形成待上传记录；需要持久化 outbox + 已确认基线，能在崩溃后扫描对比补建漏记操作。不能将只在 SW 内存中的请求当成已排队。上传回执未知时先查询 opId/服务端版本再重试，不复制副作用。

首次登录：
- 云空、本地有：筛掉默认空值并告知上传范围，作为首次合法导入；
- 云有、本地空/默认：云端为准下载，禁止空覆盖；
- 两端有不同 record：自动保留两项；
- 两端改同一 record：如内容一样视为一致，否则保留两个候选并要求选择；
- 匿名转实名：先经过产品授权，再把访客数据作为一次首次合并输入；
- A→B：先冻结 A 的队列/响应与本地分区，清空活动视图的 A 用户数据，再从 B 分区加载；不得把 A 的内容自动上传到 B。账户切换与退出不代表静默删除本机用户数据，清理另提供受保护操作。

普通增量：
1. 原工具/宿主完成本地合法 CAS 写入；
2. Sync Engine 观察变更、标准化，并持久记录 opId、baseRevision、account/credentialEpoch、productId、deviceId、recordId、payload；
3. 向服务端按 account+product 提交，服务器验证身份、产品范围、权益、数据 schema 与当前记录版本，并唯一约束 opId；
4. baseRevision 匹配则产生递增 serverRevision 与 changeSeq；不匹配则返回 conflict/currentRecord，不以本地时间裁决；
5. 客户端按 changeSeq 游标拉增量，先业务验证，再条件合并入本地；成功才推进持久化游标；本地既有未提交修改则保留冲突副本；
6. 变更由事件唤醒与定时补偿共同驱动，指数退避/抖动重试，离线不中断本地使用。

删除：写 tombstone，保留版本和 changeSeq；服务器不得把旧设备“缺失这条记录”视为删除。旧游标失效时拉**权威全量快照**，先保留本地待上传更改，再做基于当前服务端版本的合并；过期旧客户端不可原样回推“全部旧记录”。opId 去重和 baseRevision 校验互为补充。

旧 Schema：服务端拒绝未知/过旧写协议，客户端保留本地未同步内容并显示“需要更新”，未知字段不可在不支持的客户端读写后被静默剥离。迁移须具版本与回退保护。

MV3：SW 可随时休眠；不能依赖常驻内存计时器/WebSocket。outbox、游标、账号 epoch、已同步基线持久化；扩展启动、用户打开、网络恢复事件、alarms 补偿时继续处理。浏览器完全退出时不承诺主动实时同步。

历史恢复：恢复前保留当前保护副本，用户选择某个历史快照后，由服务端以一个新操作将所选内容变成**新的最新版本**，递增 changeSeq 并传播；恢复历史不是把数据库版本号倒退。产品可见快照与服务端灾难恢复数据库备份分别管理。

## 7. 最小服务端模型与候选接口（未实现）

数据表：users；sessions（设备/客户端会话/撤销）；product_consents；entitlements；sync_records（userId,productId,recordId,revision,schemaVersion,payload,deleted）；sync_operations（user+product+device+opId 唯一）；sync_changes（递增 changeSeq）；backup_snapshots；audit_events。

候选记录：
~~~json
{
  "productId": "video-auto-skip",
  "recordId": "scope:<opaque-stable-key>",
  "schemaVersion": 1,
  "baseRevision": 12,
  "operationId": "uuid",
  "deleted": false,
  "payload": {
    "seriesKey": "iyf:<stable-work-key>",
    "scope": "episode",
    "episodeKey": "<stable-episode-key>",
    "rules": {
      "intro": {"kind": "fixed", "start": 0, "end": 90},
      "outro": {"kind": "tail", "seconds": 90},
      "next": true
    }
  }
}
~~~

以上仅示意字段与分层，非当前实现或可直接提交给生产服务的真实 API。示意中的占位键需先经过业务数据校验，禁止导出含鉴权参数的完整站点 URL。

建议 HTTP 接口（草案）：
- POST /auth/authorize、POST /auth/token、POST /auth/logout；使用标准 OIDC 能力时遵循提供商实际地址，不必自创协议；
- GET /v1/me、GET /v1/entitlements、GET/PUT /v1/product-consents/{productId}；
- POST /v1/sync/{productId}/operations：幂等写入与冲突结果；
- GET /v1/sync/{productId}/changes?cursor=...：增量、失效时要求全量；
- GET /v1/sync/{productId}/snapshot：权威快照；
- GET /v1/backups/{productId}、POST /v1/backups/{productId}/restore：历史与恢复；
- GET/DELETE /v1/sessions/{sessionId}：设备会话管理。

可信宿主拟议 API 可以归为 account.getStatus / sync.getStatus / sync.setEnabled 等动作；**必须先依照现有 SDK 缺口门禁证明并实施，不得让现有业务工具现在就调用它们。** 服务端始终从经过验证的会话取得 userId，产品作用域由合法宿主安装身份/授权映射；客户端提交 userId 不能决定访问权。

## 8. Free / VIP 初版策略（商业建议，未发布）

Free：本地规则永久可用、基本设置及本地导出；可以注册账号但不要求自动云备份。为降低首次体验门槛，可独立评估有限的免费云快照或试用期，需以实际成本决定。

VIP 候选：自动跨设备增量同步、云端历史版本恢复、设备管理的增强能力；首版不需要复杂套餐或支付实现，测试以服务端预置权益模拟。**不能让离线权益查询失败阻止播放和本地写入。**

到期：本地既有数据继续可用、可手动导出；建议暂停新云写入，允许有限时段只读取回及导出云端已有记录；服务端按明确公布的宽限与保留策略处理，不得立即无提示删除。建议讨论 30 天只读宽限、90 天云数据保留，仅为候选，须核对成本/法规/隐私后发布。续费后先取最新云端基线，再合并本地离线 outbox。被撤销设备只能失去云能力，不应自动抹除原有本地配置；清理本机敏感数据另设显式操作。

## 9. UI 状态（不做过度设计）

Side Panel：仅在账号/同步入口展示“未登录 / 未启用 / 已同步 / N 项待同步 / 同步失败 / 需登录 / 有冲突 / VIP 到期”的单行状态与必要操作；连播助手正常看片界面不叠加繁杂账号卡片。状态反馈调用已存在统一 notify。

PC：账号与设备、产品同步开关和数据范围、云备份历史、冲突选择、诊断。正式页面延续 OpenDesk app.html 与现有 Tokens/通知，不自造另一个 PC 页面。

新设备（已安装和授权产品）登录后优先自动恢复；首次设备有存量访客规则时合并并仅对真正冲突提示；普通成功使用 Toast，不反复弹确认。断网保留本地规则且状态为“待同步”；账号过期时只暂停云同步，播放不中断。

## 10. 分阶段和验收

- **R1 设计（本次）**：需求/功能树、可复用事实、数据边界、协议草案、冲突与历史设计；仅文档，不运行实现。
- **M0 垂直样板**：一账号、连播助手两设备、显式开关、规则双向同步、新设备恢复；本地持久化 outbox + 基本服务端版本/幂等、冲突、历史至少一次恢复；不支付。
- **M1 通用化**：鼠标手势二次接入、PC 管理页、完整账号切换/设备撤销、保留策略、诊断与回归。
- **M2 商业化**：VIP 计费、配额、订单、退款、优惠与运营；跨产品权益。
- **M3 增强**：独立 Chrome 扩展统一 SSO、多类型文件同步、加密备份、团队协作、跨站公共规则等按真实需求追加。

验收矩阵（本次全部 NOT_TESTED）：
| ID | 场景 | 关键判定 |
| --- | --- | --- |
| T01 | 家→公司同一规则变化 | 在线公司设备自动应用最终合法版本 |
| T02 | 新 Profile 空数据登录 | 恢复云端；无默认值回写 |
| T03 | 本地仅默认配置 | 云端历史不被空覆盖 |
| T04 | 两设备离线修改不同 record | 两项保留 |
| T05 | 两设备修改同一重要 scope record | 返回冲突，可保留两个候选并处理 |
| T06 | 删除后旧设备上线 | 不复活已删除记录 |
| T07 | 写入成功但响应丢失 | 同 opId 重试不二次应用 |
| T08 | 上传中浏览器退出/重启 | outbox 仍在并能继续 |
| T09 | 退出、A→B、撤销设备 | 无跨用户上传/迟到响应污染 |
| T10 | VIP 到期/续费、网络失败 | 本地可用；云端读写和合并遵循权益 |
| T11 | 恢复旧快照后另两台上线 | 收敛至恢复产生的新 serverRevision |
| T12 | 鼠标手势接入 | 公共身份、队列、合并、历史无需重新开发 |
| T13 | 本地规则键超过 8 KiB | 不静默截断或覆盖；受控失败或完成迁移 |
| T14 | 旧客户端读取新字段 | 拒绝不安全写回，保留升级路径 |
| T15 | 未授权新产品 / 不合法 productId | 服务端拒绝，未泄露任何其他产品数据 |

同步及时性**建议验收目标**：双方浏览器运行、有网络、存在合法事件唤醒时，从保存到另一端生效 P95 ≤120 秒；Side Panel/PC 活跃时可作为更短目标（候选 ≤30 秒）。SW 休眠只保证被事件/Alarm 唤醒后的最终同步，不承诺精准定时；关闭浏览器期间不提供活动同步，重启后应自动追赶。分别记录模拟单测、契约联调、真实 Chrome 双 Profile、真实两台电脑的证据等级。

## 11. 需要产品决策的事项（不阻塞概念设计）

1. Free 是否开放一次免费云快照或试用，还是云端能力全部 VIP；
2. VIP 到期的只读宽限、保存期限、数据删除通知和后续取回；
3. 当前宿主的账号/后端是否存在可复用部署（尚未全仓证明）；
4. 鼠标手势 enabled 是否只属于本机；其他用户级设置的默认范围；
5. 现有连播助手单键容量何时扩容；跨设备媒体键在新增站点的稳定性如何验证；
6. 是否需要第一版真正独立安装的 Chrome 扩展客户端，还是先完成同宿主多模块。

这些问题应先以小样本数据/实际设备验证收敛，而非提前建设复杂后台。

## 12. 官方依据

- Chrome Storage API： https://developer.chrome.com/docs/extensions/reference/api/storage
- MV3 Service Worker 生命周期： https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle
- Chrome Identity： https://developer.chrome.com/docs/extensions/reference/api/identity
- Chrome Storage & Cookies： https://developer.chrome.com/docs/extensions/develop/concepts/storage-and-cookies

## 13. 文档维护与落地入口

业务规则以 projects/video-auto-skip/REQUIREMENTS.zh-CN.md 与 src/rules.js 为准；公共 API 以 docs/api/sidebar-tools.zh-CN.md 为准；本文件仅定义尚未实施的共用设计与候选合同。真正决定实现后，在原权威 API/业务文档按差量落地，避免出现互相矛盾的第二套运行合同。


---

## R2 · 需求收敛与关键场景设计（2026-11-22）

> 状态：DESIGN_PROPOSAL / NOT_IMPLEMENTED / NOT_TESTED。R1 作为基线保留；R2 对优先级、账号隔离、合并粒度、同步时序和实施顺序的明确修订优先。未实现新 API、后端或跨设备功能。

### R2.1 重新建立用户价值—需求树—功能树的对应关系

核心用户价值链：**离线本地可用 → 自愿开启指定产品云同步 → 新设备登录恢复 → 在线多设备安全收敛 → 错误修改可回滚**。注册账号不代表授权上传所有数据。

| 需求 | 用户要获得的结果 | 功能树节点 | 负责模块 | 优先级 |
| --- | --- | --- | --- | --- |
| N01 | 不登录、断网仍可跳过片头片尾 | 本地模式与降级 | 现有业务工具 | P0 |
| N02 | 一个账号用于多个产品 | 登录、会话、登出和续期 | Identity / 可信宿主 | P0 |
| N03 | 知道哪些数据会上云 | 产品级 consent 与范围说明 | Consent / UI | P0 |
| N04 | 新电脑不必逐条导入 | 首次合并、空值识别、自动拉取 | Sync Engine / Adapter | P0 |
| N05 | 家里和公司修改不会丢数据 | 逻辑记录、CAS、持久 outbox、增量同步 | Sync / 后端 | P0 |
| N06 | 删除后旧设备不能复活数据 | tombstone、过期游标重建、幂等 | Sync / 后端 | P0 |
| N07 | 账号 A 与 B 不串号 | 本地分区、请求 epoch、队列和游标隔离 | 宿主 / Identity | P0 |
| N08 | 能撤销误改 | 最小历史、恢复前保护副本 | Backup / 后端 | P0 基础 |
| N09 | 第二产品不重新做同步 | 通用 Engine + 独立 Adapter | 公共平台 / 产品 | M0-B 公共 MVP 验收门槛 |
| N10 | 理解同步状态 | 侧栏摘要、冲突与失败入口 | UI / Notify | P0 |
| N11 | 查看设备、更多历史记录 | 设备管理、历史列表、诊断 | PC 账号页 | P1 |
| N12 | 会员可持续变现 | 服务端权益、到期与续费 | Entitlements | P0 安全闸门，P2 支付 |
| N13 | 独立 Chrome 扩展用同一账号 | OAuth + 独立客户端会话 | 独立扩展 Adapter | P2 |
| N14 | 不受旧单键容量困扰 | 业务 RuleStore 分记录/迁移 | 产品 owner | 容量触发，迁移前不可承诺无限恢复 |

**优先级修订**：账号切换隔离、设备撤销服务端生效、版本冲突保护、历史恢复前的保护副本，属于 P0 安全闸门，不能因为管理 UI 后置而删除。正式支付、复杂套餐和完整设备列表 UI 后置。

### R2.2 必须走通的五条完整旅程

**J1 首次从匿名变为登录：** 本地已保存规则 → 用户登录 → 明示“仅同步连播助手规则，不包含 Cookie、观看记录、网页正文” → 用户确认产品级云同步 → 保留当前本地快照 → 查询产品云记录 → 自动处理云空/本地空/不同记录 → 真冲突才提供选择 → 完成同步基线。没有单独 consent 时绝不自动上传。

**J2 新设备恢复：** 安装并审阅 GrayDove → 安装或已拥有对应工具 → 登录同一账号 → 宿主查询已启用产品 → 核对真实安装身份和允许产品范围 → 下载并校验记录 → 写入本地 → 显示“已恢复 N 条配置”。没有安装的产品不静默安装；缺少网站访问权限时可恢复数据，但不能假称视频跳过功能已经生效。新设备空值/初始默认值不应向云端上传覆盖。

**J3 两台设备离线并发修改：** A 修改范围 A、B 修改范围 B，各自在本地立即生效并持久排队；恢复网络后服务端按记录分别接受修改，双方按游标取得增量；因为业务当前仍只有一个聚合规则键，客户端写回时必须 CAS 重读并重试合并。如果同时修改同一个重要规则范围，保存两份合法候选并提示处理，不按本地时钟最后写覆盖，也不把片头与片尾字段任意混合。

**J4 删除及恢复：** 明确删除规则范围 → 服务端写 tombstone、推进 changeSeq → 其他设备接受删除 → 用户选择历史版本恢复 → 先保存当前保护快照 → 生成新的最新版本并传播到其他设备。M0 最小实现可先按单条规则范围恢复；跨整个产品的时间点原子恢复可后置。长期离线旧设备不能将删除前的记录当成新增回传。

**J5 账号切换：** A 尚有待同步修改 → 切换到 B 前冻结 A 队列、请求和游标并持久封存 A 本地分区 → 使 A credentialEpoch 失效 → 当前激活的业务视图停止呈现 A 私有规则 → 加载 B 独立分区并从云端增量合并 → 迟到 A 响应不能应用至 B。不能把 A 数据自动当作 B 的访客数据；退出不等于云端删除或本地数据加密，用户可另选清除本机 A 缓存。实施前须证明**视频网页真正读到的业务存储视图**也随账号切换隔离，仅更换账户头像或 Token 不足以通过。

### R2.3 业务适配模型与实际存储容量

当前连播助手的权威本地结构仍为 rules.v1 中的 series[seriesKey].defaults / episodes[episodeKey]，合法值为 intro / outro / next；沿用原有业务校验和来源范围。

**记录颗粒度：** 使用账户 + productId + seriesKey + scopeKind + 可选 episodeKey 构成稳定逻辑记录身份，并映射为不透明 recordId。一个 scope 的片头、片尾、连播视为同一冲突单元；不同 scope 可分别合并。视频时长、未证实的剧名、当前标签页、页面 URL 都不作为规则 ID。无作品识别时已持久保存的有效规则依然可云备份，恢复后若新设备无法识别相同媒体键，应显示“规则已恢复，当前视频未匹配”，不可假装自动跳过生效。

**本地写回边界：** 若云端传回两个独立 scope，仍需将它们 CAS 合并进原聚合键，不可直接写入两次全量 JSON。当前业务工具存储限制单键 8 KiB、总量 32 KiB，云端容量变大不代表本地可无损恢复；写回前先预检，超限保留有效原数据和可导出快照，必要时由产品 owner 实现分片或新 RuleStore。禁止静默截断、删除老规则腾容量或强制先完成作品/季/集识别。

**不允许的同步：** Cookie、密码、API Key、会话令牌、观看历史、当前播放位置、页面绑定、标签页、下一集动作收据。规则到达设备 B 后不能补发 A 设备历史播放动作。

**第二适配器：** mouse-gestures 的 preferences 和映射配置适合验证“不同结构同一引擎”。其 enabled 是否属于本机，按默认保留本机的候选规则判断，实施前与业务 owner 再确认。避免把视频时间校验放入公共 Engine。

### R2.4 最小一致性协议与隐藏的双写风险

现有宿主 storage.set(ifMatch) 只保障本地某工具键的 CAS，并不自动提供云端 CAS、原子 outbox 或跨设备事务；规则还能由网页模块写入，不能只监听侧栏 Save 按钮。首版必须由可信宿主证明有合法的存储变更观察/写回入口，不得让沙箱直接持有账号 Token。

1. **本地提交与对账：** 本地保存成功即生效；将逻辑 record 与已确认服务端基线 diff 生成持久 outbox。若工具写成功后、队列落盘前 SW 终止，重启时用真实当前规则与上次云端确认基线做差，补建最终 dirty。两处不同存储写不能假称原子事务；该补偿可恢复最终状态，不能确保每个离线中间草稿形成历史快照。
2. **操作契约：** 每项操作固定 opId、accountId、productId、recordId、baseRevision、schemaVersion、installedGeneration、credentialEpoch、payloadDigest。客户端自报账号/产品不产生权限，服务端按会话与绑定身份重新确认。
3. **服务端事务：** 检查产品 consent、服务端 entitlement、会话/设备撤销、schema、记录基线版本和操作幂等；在同一事务内写入 sync_record、去重 op receipt 和递增 changeSeq。相同 opId + 相同正文返回原回执；相同 opId + 不同正文拒绝，成功但回执丢失时不生成新 opId 盲目重放。
4. **增量拉取与应用：** 单调 changeSeq 由服务端给出；客户端必须完成合法性校验和本地 CAS 应用，再持久推进 cursor。若本地容量超限或数据无效，保留游标、原始快照与错误状态。
5. **冲突和删除：** baseRevision 不一致且内容不同则冲突，双方候选都保留；删除采用 tombstone。旧 cursor 过期后从一致的服务端快照+barrier/epoch 重建，同时隔离本地未上传 dirty；不能仅因旧设备本地记录存在就复活。清理老 tombstone 前须有强制 rebase 协议。
6. **生命周期：** SW 事件可能休眠，outbox、游标、已确认基线、账户 epoch 均须持久化。通过启动、存储变化、工具打开及 alarms 补偿恢复；同设备多唤醒避免重复并行执行。浏览器完全退出期间不承诺实时同步。
7. **Schema 演化：** 旧客户端遇到新字段不得解码后剥离字段再写回；保留只读/本地 dirty 与提示升级，不能静默迁移失败。

**同步策略选型：**

| 候选 | 优点 | 不满足的条件 | R2 结论 |
| --- | --- | --- | --- |
| Chrome 原生 storage.sync 作为唯一同步 | 开发少 | 跨浏览器账号、统一 VIP、历史恢复、同宿主沙箱配额 | 不采用为主源 |
| 自建云端整份 JSON 后写覆盖 | 第一版编码少 | 离线不同记录保留、删除防复活、同一规则冲突 | 不采用为正式 MVP |
| **记录级 CAS + 增量游标 + 最小历史** | 正确性与复杂度可控 | 要做适配器与可靠队列 | **采用** |
| CRDT / 完整事件溯源 / 常驻 WebSocket | 能处理更复杂协作 | 超出当前单用户多设备需求 | 后置 |

后端建议单体 + 支持事务与唯一约束的关系数据库，不拆微服务。仓库现有 services/analytics 是匿名统计 Cloudflare Worker/D1，services/cookie-share-relay 是 Cookie 分享 Relay/SQLite；二者不是已验证的身份和会员后端。应优先核验仓库之外已有部署的账号/关系数据库服务后再决定复用还是单独部署，不能把现有服务的名称当成登录功能已存在。

### R2.5 账号会话、独立扩展与权限边界

| 执行形态 | 登录方式 | 会话与数据权限 |
| --- | --- | --- |
| GrayDove 同宿主多个 Sidebar Tool | 宿主账号入口一次登录 | 同一可信宿主会话；按真实工具安装身份、产品级 consent 限定同步范围；业务沙箱无 Token |
| 独立安装 Chrome 扩展 | 同一个账号中心，可尝试复用网站身份会话 | **每个扩展自己的 OAuth 客户端与会话**，不能共享宿主令牌；首次授权可能仍需交互 |
| 新 Chrome Profile / 新设备 | 登录并核对已安装工具及权限 | 只恢复已允许产品的数据；不安装扩展、不授网页权限、不恢复网站登录 |

当前根 manifest.json 尚未声明 identity 权限。独立扩展认证要核验 chrome.identity.launchWebAuthFlow/getRedirectURL、稳定扩展 ID、已登记的重定向地址和授权码 + PKCE，校验 state/nonce/redirect；认证交互由明确的用户操作发起，不在首次启动时自动弹窗。持久凭证需要轮换、撤销和可信扩展层访问隔离，不能宣称 chrome.storage.local 天然加密。账号 Token 不进入 storage.sync、工具业务 JSON、普通 content script 或网页。

服务端撤销设备时后续云请求和续期必须拒绝，不能仅在设备列表显示“已撤销”；不因撤销而自动抹除本地已有规则。云数据删除是独立显式操作，不能把“暂停同步”当作删除云端数据。

### R2.6 VIP 与 UI 边界

**建议的权益策略（未公布）：** Free 提供本地保存与手动导出；可试验一次有限云恢复试用以证明付费价值；VIP 候选包含自动多设备同步、历史版本恢复。会员到期仍能本地读取与修改，服务端暂停新增云写入，可制定只读取回/导出宽限期；任何天数、价格、云容量和保留期限均待产品成本验证。续费后先拉权威云版本，再合并期间积累的本地修改，禁止整包覆盖。

Side Panel 只需单行摘要：未开启／已同步／N 项待同步／登录已过期／1 条冲突／VIP 暂停。PC 账号页分为账号与设备、已开启同步的产品与范围、备份历史与诊断；不创建另一套 PC 页面或独立通知系统。正常新设备自动恢复、仅真正冲突才交由用户选择。关闭侧栏不停止已获得授权的同步逻辑。

### R2.7 最小实施路径与验收扩充

**D（本轮，仅设计）：** N01–N14 需求树、J1–J5 用户旅程、方案取舍、边界和风险。不得记为实现或真实验收。

**M0（首个真实产品闭环）：**
1. 核验已存在宿主存储 owner、页面模块写入路径、合法变更监听/读写入口与安装身份；审计真实后端可复用性。
2. 连播助手逻辑 scope 适配器、业务校验、容量保护；不修改跨集推断算法。
3. 可信宿主登录 + 产品 consent + 账号隔离/撤销最小闸门；服务端事务与基本 entitlement gate。
4. 持久 outbox、增量拉取、首次合并、同一 record 冲突、幂等、删除标记、游标失效回退。
5. 真实两设备同步、新 Profile 恢复、离线并发修改、重启、未知回执、最小单记录历史恢复。
6. 账号切换/撤销与浏览器页面实际读取的存储视图，必须一同通过真实验证。

**M0-B（公共 MVP 收口）：** 鼠标手势作为结构不同的第二消费者真实接入，证明没有重复实现账号、outbox、冲突处理与备份；未完成此步只能称“连播助手首个样板”，不能称“跨产品公共能力已验证”。

**M1（产品化）：** PC 管理页、设备列表、历史管理、正式留存策略、诊断，以及数据量超过单键限制时的 RuleStore 迁移。

**M2（商业化）：** 正式支付、套餐、跨扩展 OAuth、自愿跨产品数据共享、大文件和团队空间。

在 R1 T01–T15 之外增加以下反例验收（全部 NOT_TESTED）：

| ID | 故障/反例 | 预期 |
| --- | --- | --- |
| T16 | 网页模块写规则时侧栏未打开 | 依然捕捉可同步的变更 |
| T17 | 业务存储成功后、outbox 之前 SW 终止 | 重启对账恢复最终 dirty，不虚报中间历史 |
| T18 | 云端不同范围变化但本地仍为单键 | CAS 合并，两条有效规则均保留 |
| T19 | A→B 后 A 的迟到响应返回 | B 规则、队列和游标不变 |
| T20 | 未安装/未授权产品被云端列为已启用 | 不私自安装，也不绕过权限访问 |
| T21 | 下载规则使单键超过 8 KiB | 拒绝覆盖，旧合法数据与快照可取回 |
| T22 | 恢复旧规则但当前媒体键识别不到 | 如实显示已恢复未匹配，不冒称生效 |
| T23 | 删除后长期离线旧设备上线 | tombstone/barrier 防止复活 |
| T24 | 相同 opId 携不同正文重试 | 服务端拒绝，不重复应用 |
| T25 | 登录失效、VIP 到期、设备撤销 | 云操作按权益拒绝，本地播放仍正常 |
| T26 | 沙箱伪造其他产品 userId/productId | 宿主与服务端均拒绝越权 |
| T27 | 老客户端读到新字段 | 不丢字段写回，保留待升级状态 |

性能仍以 R1 的在线 P95 120 秒作为**待验目标**，分别记录活动侧栏、SW 休眠、离线和浏览器关闭状态；该数字不是平台保证。模拟测试、后端事务、真实两个 Profile、真实两台电脑必须分别报告，不能以模拟回执替代双机验收。

### R2.8 五视角风险审查与未解事实

| 视角 | 关键风险 | 验收闸门 |
| --- | --- | --- |
| 产品 | 登录就上传全部工具 | 产品级同意、范围可见、默认最小化 |
| 扩展平台 | 沙箱令牌泄漏、独立扩展误共用宿主身份、SW 休眠丢队列 | 真实安装身份、可信令牌边界、持久状态 |
| 后端 | 信任客户端 userId，或把匿名统计后端当账号服务 | 服务端授权、事务、产品级 ACL |
| 一致性 | 工具存储与 outbox 双写、旧设备复活、整包覆盖 | 恢复对账、逻辑记录 CAS、tombstone/barrier |
| 测试 | 把方案/模拟成功当真实双机 | 合同、浏览器、跨设备分层报告 |

**实施前仍需证据解决的三个问题：** (1) 宿主是否有安全的跨工具存储观察及条件写回入口；(2) 能否复用现成已部署身份和 SQL 后端；(3) 连播助手在真实用户规模下何时超出原单键额度。设计不能替代这些事实。

官方资料：
- https://developer.chrome.com/docs/extensions/reference/api/storage
- https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle
- https://developer.chrome.com/docs/extensions/reference/api/identity
- https://www.rfc-editor.org/rfc/rfc10017.html


---

## R3 · 实施架构与接口合同（2026-11-22）

> 阶段：DESIGN_PROPOSAL / NOT_IMPLEMENTED / NOT_TESTED。仅收敛可开发选型和服务端/客户端合同，不提交 SDK、业务代码、数据库迁移、不部署远端资源。R1/R2 继续保存历史决策；R3 对下述选型、接线、数据表和验收前置条件优先。

### R3.1 二次仓库审计：真正的存储归属

开始只读检查时 main 为 3eb43c3dd35f5fc29a726a635e955107f2f1363a；此 SHA 不是持续锁定的 HEAD，实施前必须重新读取目标文件。

**必须同时核对的三个现有写入口**，不是只在侧栏添加监听：

1. 侧栏宿主：src/ui/sidebar-tools.js 中 storage.get / storage.set，经原有工具级锁、安装身份、ifMatch、verified write 写入 sidebarToolStorageKey(tool.id)。
2. 网页伴随模块：src/scripting/user-scripts/app-page-contract.js 的 appPageStorage，受安装 owner、包 Hash、installEpoch、Web Lock 与 ETag 保护，也使用 sidebarToolStorageKey(owner.toolId)。连播助手 src/page/main.js 正在通过 bridge.storage.get/set 读写 rules.v1。
3. Browser SDK 工具级存储：src/ui/sidebar-tools/storage-state.js 的 executeBrowserToolStorage 使用同一个工具命名空间及额度边界。不同权限和请求形式不能绕过一致性要求。

工具数据键由 src/ui/sidebar-tools/package.js 的 sidebarToolStorageKey 函数生成；配额 SIDEBAR_TOOL_DATA_LIMITS 为单项 8192 字节、总量 32768 字节、最多 32 键。安装、卸载、升级在 src/ui/sidebar-tools/installation.js 内也读取/清理现有工具数据。开发预览与正式安装存储隔离，实施时不能把调试预览误当正式用户数据。

现有 src/sw.js 已有 chrome.storage.onChanged、alarms、onStartup，但没有据本轮核验而可宣称已经实现的公共账号同步监听。src/platform/storage/index.js 中的 IndexedDB 及事务实现属于已有 Foundation 持久化职责，**不是**已经可复用的云同步数据库/登录数据仓库；不要为了新功能覆盖它既有 Schema。

直接结论：引入云同步必须由可信平台 owner 为三个写入口和安装/撤销路径设计**统一的受控存储路由/记录观察点**，或证明它们都通过同一个可观察的原生命名空间。新增监听不能假装能捕获仅在某个 UI 生命周期中发生的写入；必须在侧栏关闭时仍可捕捉网页写入，并且账户切换时所有读入口都被 fencing。

现有项目还包含 services/analytics（匿名分析 Worker/D1）和 services/cookie-share-relay（Cookie 分享 Relay/SQLite）。两者不能不经身份、授权及事务审计就当作统一账号/VIP 后端。根 manifest.json 当前未声明 identity 权限；正式 OAuth 扩展登录若需要 chrome.identity，须单独评估 manifest 变更、稳定 Extension ID 与真实回调。

### R3.2 账号与后端选型（条件式决策，而非假称已部署）

| 路线 | 适用条件 | 优点 | 风险/成本 | R3 判定 |
| --- | --- | --- | --- | --- |
| A. 复用**已经实际部署**的自有身份 + SQL API | 有可核实账号、审计、备份、生产运维能力 | 最少新系统和跨业务迁移 | 当前仓库尚无证据证明这套服务存在 | **最高优先级先验证** |
| B. Supabase Auth + PostgreSQL + 薄 API / SQL 事务函数 | 无可复用服务、希望快速构建可恢复数据 MVP | 托管用户/数据库、Postgres 事务和 RLS，易做测试环境 | 平台依赖、权限与密钥管理；其 OAuth 2.1 Server 在本次官方文档仍为 Beta，独立扩展回调需专项验证 | **默认新建候选** |
| C. Better Auth + PostgreSQL + 自有 Node API | 已有可靠 Node/SQL 部署及维护者，重视控制权 | 更易与既有 Node 后端同部署；官方 OAuth Provider 支持 OIDC、PKCE、公有客户端 | 邮件、运行、监控、密钥、故障恢复均由团队维护，Provider 版本与安全配置须核验 | **备选** |
| D. 专业托管 OIDC（如 Auth0/ZITADEL）+ 自有 SQL API | 独立扩展/多客户端 SSO 现在就必须正式商用 | 身份服务成熟、OIDC 职责清晰 | 两种平台、账单与管理流程 | 独立扩展 SSO 提前时评估 |

**暂定落地策略**：先对现有后端做短平快审计；若没有可复用身份/数据库，就以 B 作为 M0 开发和成本验证候选。M0 仅做 OpenDesk 单宿主真实登录和产品同步；如必须在首个生产版本支持多个真正独立的 Chrome 扩展，须先完成 B 的 OAuth 2.1 Beta 回调、会话与撤销专项验证，未通过则升级到成熟 OIDC 方案，不带 Beta 风险直接宣称生产 SSO 完成。

**最小运行部署**：身份服务、PostgreSQL、一个 HTTPS API/BFF（或 Edge Function 调用一条强校验的事务性 SQL RPC）。云业务写入只经服务端鉴权/API/数据库事务，不让扩展以持有公开 anon key 为理由直接绕过业务版本检查、权益/同意检查和幂等约束。是否用 Supabase Edge Functions、现有 Node 服务或其他运行时，实施时按已部署资源和成本选一个，禁止重复部署两套同步后端。生产/开发数据库、客户端 ID、密钥、日志严格隔离。

参考：Supabase OAuth 2.1 Server Getting Started（2026-11 官方文档标注 Beta）https://supabase.com/docs/guides/auth/oauth-server/getting-started ；Supabase OAuth Flows https://supabase.com/docs/guides/auth/oauth-server/oauth-flows ；Better Auth OAuth Provider https://better-auth.com/docs/plugins/oauth-provider 。

### R3.3 身份、会话、产品同意和权益的最小真相来源

A. **一个用户身份**：用户 ID 从已验证的 IdP subject/sub 得到，服务端按 issuer + sub 映射内部 accountId。浏览器传入 userId 不能控制查询归属；不以电子邮箱作为不可变主键。

B. **两个不同的授权**：
- OAuth client consent：某个可信 Chrome 客户端是否有权向 GrayDove API 申请 token；
- product sync consent：该账号明确允许哪些产品、哪些数据类别做云同步。登录本身不授予全产品内容上传权。新设备已登录且目标产品在原账户范围中启用时，只对当前实际已安装、可合法接入的产品自动恢复。

C. **VIP 与数据不混同**：服务端按 account + product + feature 查询 entitlement，云写入只凭服务端状态放行，前端缓存用于展示/离线提示，不授权写云。非 VIP 或到期时本地编辑和导出仍正常；续费先拉新基线并做合并，不能回传旧整体快照覆盖。

D. **会话与设备**：逻辑 deviceId 使用随机持久 ID，不采集强浏览器指纹；sessionId 单独绑定 issuer/sub/clientId/deviceId；刷新令牌须轮换与撤销，服务端实际验证会话与设备撤销，短期 access token 的剩余有效期/强制阻断策略须测试。设备被撤销不代表自动销毁本地规则。

E. **令牌边界**：OAuth 授权码 + PKCE（S256）、随机 state、OIDC nonce/issuer 校验、准确 redirect URI；Chrome 端在用户明确操作后用可信固定代码发起 launchWebAuthFlow。不要把 Token 放进沙箱、content script、规则 JSON、URL 查询参数或日志。短期 access token 可存可信 extension storage.session/内存；若重启后要求自动续期，需设计仅可信后台可访问的持久 refresh 凭证存储、轮换与撤销，不能把 chrome.storage.local 宣称为加密保险箱。Chrome storage.local.setAccessLevel 影响**整个 storage area**，不能不审计现有 content script 消费者就全局更改访问权限；可评估仅可信后台访问的 extension-origin IndexedDB 作为令牌存储，仍不防本机磁盘/已被攻破的扩展代码，安全等级与生命周期必须实测。

官方：Chrome Identity https://developer.chrome.com/docs/extensions/reference/api/identity ；Chrome Storage https://developer.chrome.com/docs/extensions/reference/api/storage ；OAuth 安全 BCP（RFC 9700）https://www.rfc-editor.org/rfc/rfc9700.html 。

### R3.4 服务端数据模型——最少且可事务性一致

身份供应商自己的 user/session 表由 IdP 维护，不复制密码和邮箱到业务表作为第二套身份系统。同步最小逻辑表如下，具体 SQL DDL 在后续实施任务中冻结：

| 表 | 主键/唯一约束核心 | 责任 |
| --- | --- | --- |
| app_clients | client_id 唯一；允许的 productId 集合/应用类型 | 区分宿主和真正独立扩展 |
| app_device_sessions | session_id、issuer/sub、client_id、device_id，revoked_at | 设备级云服务撤销与审计 |
| product_sync_consents | (account_id, product_id) 唯一 | scope、consent_revision、enabled、granted_at |
| product_entitlements | (account_id, product_id, feature_code) | 有效期、状态、权益来源与修订 |
| sync_clocks | (account_id, product_id) | 事务内单调 change_seq、snapshot_epoch |
| sync_records | (account_id, product_id, record_id) | payload JSON、schema_version、record_revision、tombstone |
| sync_op_receipts | (account_id, client_id, operation_id) 唯一 | 请求 digest、原回执、去重/结果恢复 |
| sync_changes | (account_id, product_id, change_seq) 唯一 | 不可变增量记录、变更版本、删除 |
| record_history | (account_id, product_id, record_id, revision) | 可恢复的合法旧版本、原因、时间 |
| audit_events | 独立 event_id | 低敏感度的授权/恢复/撤销审计，不记录 Cookie/Token 或原始网页正文 |

每次有效修改**必须在一次数据库事务中**：
1. 校验身份、设备/客户端可用、产品授权和服务端 entitlement，检查 opId 去重与 digest；
2. 锁定当前 sync_clock/record，比较 baseRevision（无记录时采用明确初始修订 0；有 tombstone 不能误当成从未存在）；
3. 版本匹配则写 record、新的 recordRevision、不可变 changeSeq 和必要历史前镜像；
4. 记录 operation receipt 后提交；冲突返回当前版本与有限候选，绝不先改 record 再返回冲突。

一个用户 + 产品的递增 seq 可以用单行 clock 锁协调；M0 数据规模小，避免分布式队列。需要设置每请求大小、每用户记录/历史上限与速率限制，实际值在测试负载、Unicode 字节数及成本确认后公布。

**增量历史与用户历史是两种东西**：sync_changes 为同步游标服务，可按明确规则压缩；record_history 为用户恢复服务，不能被同步日志压缩顺手删除。服务端数据库灾备/恢复是第三种基础设施职责，不能拿 record_history 冒充故障灾备。

### R3.5 HTTP API 草案 v1（所有路径均尚未实现）

- GET /v1/bootstrap：账号资料最小摘要、server-side entitlements、当前产品同意列表、会话元数据；**不返回其他产品的原始数据**。
- PUT /v1/product-consents/{productId}：仅当前登录账号、明确来源的产品启用/暂停及 dataScopeRevision；暂停不删除云端。
- GET /v1/sync/{productId}/snapshot：权威小规模记录全集 + snapshot_watermark + snapshot_epoch。M0 使用一致事务快照，若超单次预算则增加稳定分页/barrier，不能分页过程中混用不同版本。
- GET /v1/sync/{productId}/changes?afterSeq=...&limit=...：返回有序记录、nextSeq、hasMore、epoch；序列缺口/游标过期明确 REBASE_REQUIRED，不得悄悄返回空列表。
- POST /v1/sync/{productId}/operations：M0 每请求先只接受一个 record 操作，最小请求结构为 (protocolVersion, operationId, recordId, baseRevision, schemaVersion, deleted, payload)。响应区分 APPLIED / ALREADY_APPLIED / CONFLICT / ENTITLEMENT_REQUIRED / CONSENT_REQUIRED / SCHEMA_UNSUPPORTED / REBASE_REQUIRED；需返回服务端准确 revision 和 seq。账号由 token 确定，clientId 的 product 授权由服务端注册表确定。
- GET /v1/sync/{productId}/history?recordId=...：只列出有权访问的用户历史元信息与可恢复版本。
- POST /v1/sync/{productId}/restore：输入选定历史版本、当前 baseRevision、operationId；先保存当前版本，恢复创建**新的**最新 recordRevision/changeSeq，传播到其他设备；并发冲突返回 CONFLICT。
- POST /v1/device-sessions/{sessionId}/revoke：持有者撤销自身旧设备的云访问，须验证实际 Token/refresh 失效策略，不等于清理旧设备磁盘。
- GET /v1/health：不泄漏账户数据的只读服务健康；健康 200 不是同步验收。

建议请求示意：
~~~json
{
  "protocolVersion": 1,
  "operationId": "uuid-generated-once",
  "recordId": "opaque-scope-record",
  "baseRevision": 7,
  "schemaVersion": 1,
  "deleted": false,
  "payload": {
    "seriesKey": "iyf:verified-work",
    "scope": "episode",
    "episodeKey": "verified-episode",
    "rules": {
      "intro": {"kind":"fixed","start":0,"end":90},
      "outro": {"kind":"tail","seconds":90},
      "next": true
    }
  }
}
~~~
仅为 Schema 形状示意，媒体键是假设样本，不是合法实站媒体标识或现有实现。recordId 应由产品适配器基于合法稳定键确定生成；云端不允许任意调用方通过 productId 参数取得其它工具数据。

### R3.6 客户端所有权：分区化、存储观察与副作用边界

**优先方案：按账号分区的可信存储路由，而非在一个工具数据键里混放 A/B 两份规则。** 用固定可信 Broker 解析 activeAccountNamespace = guest 或经过验证的 issuer/sub；所有正式安装工具的允许云同步存储入口统一路由。具体本机 key 设计为内部实现细节；原 sidebarToolStorageKey(toolId) 作为旧的 guest/legacy 数据入口进行受保护迁移，不擅自批量修改现有业务数据。

必须完成以下接线安全门：
- 侧栏 storage.get/set、网页伴随 appPageStorage readContext/get/set、Browser SDK browser.storage.local、安装/卸载/升级/备份、既有临时开发预览使用同一「哪个安装、哪个账户、哪个产品、哪个代际」判断。现有旁路若无法控制，则 P0 不开放账号切换，不宣称全局隔离。
- 不重写原包运行资格、网站权限或安装器；云同步权限是额外的产品级 consent，普通工具无需因云服务未开通而失去本地运行能力。
- 请求包含并核验 accountEpoch + installEpoch/sessionGeneration；切换账号后旧请求不能使用新的 active namespace，不可将 A 迟到响应写进 B 或新安装代际。
- 第一次登录迁移旧 guest 规则时，先保留保护副本，再询问是把 guest 数据合并到当前账号，还是只恢复云端；不得在用户登录后自动把某个旧账户的本机分区当作匿名数据上传到另一账户。
- 工具本地写和同步 outbox 位于两套存储时，本机失电窗口不可假称原子化。记录级 projection + 已确认基线 + 启动/变更事件对账能恢复最终 dirty；临时草稿和中间历史不保证入云。
- 工具侧本地规则仍做播放器业务校验，云客户端不得用服务器全量结果直接覆盖整个 rules.v1；必须对局部 scope 进行 CAS 读回、合并、范围验证、额度预检。
- 在线同步获得规则后仅更新数据，不重放别的设备曾发生的 seek、下一集导航、播放暂停等外部动作。
- 对真正独立安装的扩展单独实现 OAuth 客户端与 SDK transport；同账号网站 Cookie 可能减少登录步骤，但不能让它借用 GrayDove 宿主 Token。

**持久队列最小状态**：accountSub、productId、recordId、operationId、baseRevision、payloadDigest、payload/tombstone、consentEpoch、credentialEpoch、installEpoch、retryCount、lastAttempt；加 (account, product) 粒度的 lastAckedBaseline、nextSeq、snapshotEpoch。outbox 与业务规则、Token 在权限/存储上应区分。客户端操作从 UNKNOWN 恢复时复用 opId 和 digest，先查服务端结果，不新生成不同内容重试。

### R3.7 实施任务树（各任务的输入/输出/验收）

| ID | 最小任务 | 输入 | 可验收输出 | 前置 |
| --- | --- | --- | --- | --- |
| S00 | 审计现有已部署账号/数据库及固定工具存储入口 | R3 文档 + 源码入口 | 证据表：实际可复用服务/三个业务写入口/真实 Chrome 权限/独立扩展清单 | 无 |
| S01 | 认证技术 spike | 一个已选 Identity Provider、开发与正式稳定 Extension ID | 两个测试 Profile 各自登录/过期/回调/取消；核验 manifest identity 需求和 Token 存储风险；未通过不得冻结 provider | S00 |
| S02 | 最小服务端 Schema 和事务 API | productId 注册表、R3.4/5 合同 | DB migration + 同一 opId 恢复、版本冲突、撤销、授权拒绝的服务端测试 | S01 |
| S03 | 可信本地 namespace 及账号隔离 | 三个存储入口、安装/撤销状态 | guest / A / B 不串号，旧请求 fencing，旧工具数据可逆迁移 | S00；可与 S02 合同并行 |
| S04 | 连播助手 Product Adapter | rules.v1、当前业务 validator、样本规则 | scope projection / join / tombstone / schemaVersion / 8 KiB 限额保护测试 | S00 |
| S05 | 一台设备的云备份与首次合并 | S01–S04 | 显式产品授权、云空首传、有云首拉、不丢 guest 保护副本 | S01–S04 |
| S06 | 双设备可靠同步 | S05 | outbox、changeSeq、断网、重启、删除、冲突、lost ACK；真实 Chrome 双 Profile | S05 |
| S07 | 最小历史恢复与 VIP 服务端闸门 | S02、S06 | 误删/误改恢复出新 revision；非 VIP 与到期不误上传，旧数据仍可本机使用 | S06 |
| S08 | 鼠标手势第二接入 | 同一 Engine + preferences Adapter | 不复制账号/同步/重试/恢复逻辑且两设备可同步 | S06 |
| S09 | 用户界面与验收签收 | 现有 Side Panel/PC Tokens/notify | 一行同步摘要、简单账号/同步开关、冲突选择；测试证明而非预览宣称 | S05–S08 |

**可称 M0-A 的条件**：S01–S07 连播助手真实闭环；**可称共用 M0 完成的条件**：S08 结构不同的第二消费者也通过。S09 仅需最小可用入口，复杂设备管理和账单 UI 在 M1/M2。

### R3.8 严格验收与不可提前宣布完成的负例

- 认证/权限：Chrome 真实扩展 ID 的 OAuth 登录取消、PKCE 失败、重定向伪造、过期与设备撤销；静态恶意工具 ID 不得借用正式同步的产品授权。
- 存储：侧栏关闭但网页模块仍写入、Browser SDK 另一路写入、安装/升级/卸载/不同调试 Profile；每一路均不能绕过 guest/A/B 真实数据分区。
- 初次导入：本地空/默认值不得覆盖云；本地有且云有时不同记录合并，冲突保留两侧；guest 与 A 不自动转入 B。
- 并发：不同 scope 编辑并发恢复、同 scope CAS 冲突、同 opId 不同 digest 拒绝、服务端提交后客户端回执丢失、cursor 截断或过期重建。
- 生命周期：SW 在本地写→outbox 两步之间终止、待上传时退出浏览器、重启后继续；历史旧设备删除不复活。
- 业务：不复制播放行为；相对尾段仍根据新视频可信 duration 动态计算；媒体键缺失不冒充有效规则；本地存储超限绝不静默丢失。
- 会员：离线本地照常使用，VIP 到期只控制云端权益；恢复的保护副本和正式云数据保留/取回策略一致。
- 证据：Schema/单元、事务 API、Chrome 两 Profile、真实两台电脑四类结果分别记录；本轮全部 **NOT_TESTED**。

建议在线性能目标沿用 R1：两端浏览器实际运行、网络健康时跨端生效 P95 不超过 120 秒；SW 休眠时以唤醒后恢复为主，浏览器关闭期间不保证实时。产品可见正常状态不显示游标/修订，仅在诊断中出现。

### R3.9 本轮结论与真正待决问题

1. **可以冻结**：可信宿主作为账号和同步 owner、产品独立 Adapter、记录级 CAS/增量/历史的协议方向、服务器鉴权与 product consent 分开、guest/A/B 数据隔离、三入口审计、第二产品是共用能力验收门槛。
2. **不能冻结**：生产 IdP 供应商（先审计已有服务；默认候选 Supabase Auth + Postgres，但 OAuth Server 当前 Beta）、正式存储分区具体重构位置、公开 SDK 命名、线上数据保留/付费政策、容量限值。
3. **明确后置**：正式收款套餐、全部跨浏览器客户端一键登录、大文件、同步网站登录会话、公开共享规则、CRDT/实时协作。
4. **绝对禁止宣称已完成**：本轮没有新的运行代码、已创建的线上账号服务、生产登录成功、真实两机同步或历史恢复 PASS。

新增参考入口不另建方案文件，统一从本文件继续。实施前再核验最新 main、目标文件归属及并行任务，所有跨平台公开 API 更新必须回写既有权威合同，不能在业务工具直接调用本方案中的假定 API。


### R3.10 现成同步框架的复用评估（减少重复研发）

本方案的 record-level CAS/checkpoint/冲突模型不是声称必须从零研发一个完整分布式同步数据库。以下开源/现成能力值得在 S00 的短 Spike 中做最小适配比较：

| 方案 | 可复用特性 | 与本仓库现状的差距 | R3 推荐 |
| --- | --- | --- | --- |
| RxDB Replication | push/pull、checkpoint、conflict handler、删除标记及自动恢复 | 需要把业务数据抽象成 RxDB collection 并维护存储一致性；服务端仍要实现鉴权和 push/pull 契约；默认冲突策略不适合丢掉用户重要规则 | **候选对照 Spike**，仅当能安全接入既有工具读写路径时采用 |
| Dexie Cloud | IndexedDB 本地优先 + 托管同步、账号 | 要把权威存储移到 Dexie；现有侧栏/网页伴随宿主、8 KiB 限额与身份策略需迁移；计费和数据保留另评估 | 不作为不迁移存储的直接插件 |
| PouchDB + CouchDB | 成熟的文档复制及版本冲突模型 | 需运行 CouchDB 兼容后端；当前产品使用 SQL/单键存储，不是 CouchDB 文档库；会员和产品级授权仍需自建 | 首版不采用 |
| PowerSync 等数据库同步平台 | 大数据、离线 SQLite、持续多端同步 | 同步模型和本地存储迁移较重，规则数据只有少量配置 | 大规模业务数据阶段再评估 |
| **现有受控存储 + 薄 Sync Engine + SQL CAS** | 保留当前业务 owner/权限、实现最小版本控制、同意、VIP 和幂等 | 须正确实现 outbox/游标/事务和双端故障恢复 | **M0 默认**，以 T16–T27 实际测量复杂度 |

**决策门槛**：做一次「现有连播助手单键 rules.v1 → 10 个可同步 scope → 远端可撤销的 push/pull → 恢复」小样本 Spike。若 RxDB 能在无需重建第二套业务数据源、且不扩大权限的前提下显著减少源码和测试复杂度，可修订选择；否则按现有薄引擎实施。**避免把 RxDB/Dexie/PowerSync 与现有 rules.v1 同时当作权威写入来源**。

来源：https://rxdb.info/replication.html ；https://dexie.org/cloud/ ；https://pouchdb.apache.org/guides/replication.html ；https://docs.powersync.com/ 。


## R4 · 多扩展产品注册、通用私有数据与角色边界（2026-11-23）

> 状态：DESIGN_PROPOSAL / NOT_IMPLEMENTED / NOT_TESTED。本节是 R1–R3 的增量扩展，优先定义跨产品/第三方扩展的注册、主键、权限和数据存储边界；既有 Sync Engine、Identity、Entitlement、CAS/变更序列与历史恢复继续由 R3 所有，不复制新引擎。连播助手公共规则的业务级契约见 [R12.2 领域接入修订](../../projects/video-auto-skip/CLOUD-RULES-R12.zh-CN.md#14-r122--多扩展云平台接入与用户身份安全审查2026-11-23)。

### R4.1 核心纠偏：不为每个扩展建立用户表、存储表、会员表

- **统一平台控制面**：一次注册产品/发布者、注册允许能力、版本化业务 Schema、签约/审核策略、用户/角色授权、会员权益、请求预算。Payload CMS 推荐用作平台管理员后台与目录维护/审核；它不应成为任意普通扩展可以自由读写任意 Collection 的入口。
- **通用个人数据平面**：已有 sync_records(account_id, product_id, record_id)、sync_changes、record_history、sync_op_receipts 等通用记录级协议。不同工具以 product_id 分区、JSON 业务 payload + schemaVersion 校验、CAS/幂等和容量预算共享物理表，不建 video-personal-rules、mouse-gestures-user-data 等重复用户数据表。R3 本身已有该思路，R4 明确面向用户开发工具也适用。
- **专用领域数据平面**：只有公共高索引/审核业务（如视频 Work/Episode/Edition/SiteAssetMapping/PublicRule）才建专门集合或 SQL 索引；这些是“视频领域表”，不是“每个扩展必须拥有五张表”。其他扩展无需创建这些实体；多产品是否能消费该公共目录须有显式能力注册与许可证/配额控制。
- **可选多开发者租户**：若多个发布者组织需要管理自己的产品，可采用 publisher_org_id + membership 约束与管理员 UI 过滤；Payload multi-tenant 插件是管理界面多租户的候选，不替代 API 按 account_id+product_id 的隔离，也不应把每个普通消费者当一个 Payload Tenant。参考 https://payloadcms.com/docs/plugins/multi-tenant 。

### R4.2 ID 命名、身份绑定、注册表，而非依赖展示名称

| 标识 | 由谁发放/验证 | 用途与边界 |
| --- | --- | --- |
| productId（云端权威产品 ID） | 平台 Product Registry 注册，稳定且不可擅改；可用唯一 qualified key，例如 opendesk.video-auto-skip（示例，尚未注册） | 通用同步、权益、审计、预算与 API 的唯一业务分区；不以可变 displayName 为键 |
| toolId / pageProgramId | 已安装包与可信宿主确认 | 浏览器运行时/存储边界；视频项目当前分别为 video-auto-skip 与 app.video-auto-skip；须在注册表明确绑定到一个 productId，**不能仅靠去掉 app. 字符串自动合并** |
| publisherId / orgId | 经验证的开发者账号或组织注册 | 产品的发布/维护和审核权；不能凭发布者身份读取该产品用户私人数据 |
| accountId | 由服务端验证 IdP (issuer, sub) 映射到内部不透明 UUID | 私有规则所有者；客户端不可自报 accountId/userId，不能用邮箱作不可变主键 |
| clientId + sessionId | 已注册 OAuth 客户端/可信会话 | 绑定客户端身份、会话撤销和允许的产品权限；必须由服务端验证 audience/scopes |
| deviceId（随机）+ installationEpoch | 可信客户端生成与安装器代际状态，后端按授权校验 | 去重、撤销及迟到响应 fencing；不要用指纹或完整电脑识别码 |
| schemaVersion + recordId + revision | 产品 Schema Registry / 同步协议 | 记录可迁移、去重、CAS、回滚；schema 不得由扩展在请求时任意更改 |
| capabilityCode/featureCode | 平台受审能力注册与服务端 entitlement | 例如 cloud.sync、video-rules.auto-match；不是“拥有 VIP 所有业务 API 自动放行” |

一次合法的同步/匹配请求：浏览器可信 Host 根据实际已安装工具的身份映射 productId，调用经过授予范围的服务端 API；服务端从**已经验证的**用户、客户端、会话、产品注册/许可、同意及权益记录推导有效 scope。路径中的 productId 是查找/路由参数，**不是授权凭证**；第三方工具即使修改路径或 JSON，也不能借此读取其他 productId 或其他 accountId 的数据。安装包声称的 ID/签名/开发调试身份不能单独证明发布者信任；必须分别证明服务端注册与会话受众权限。没有可靠宿主证明时，不以“本机安装了它”作为服务器可验证的全部身份。

注册产品允许自建扩展，按产品能力授予范围：
- local-only / unregistered：仍可本地使用，不能因为有显示标题就自动获得云能力；
- registered-private：经注册并获用户明确授权的扩展可用自身 productId 的通用私有同步，服务端做 schema、数据大小、调用预算检查；
- reviewed-public：如视频标记贡献/公共目录/AI 等高风险能力，需要单独审核、数据许可证及明确用户同意；
- suspended/revoked：停止新的网络写读能力，按产品/用户保留及导出政策处理个人数据；不擅自清空本地规则。

### R4.3 最小平台数据实体与是否必须保存用户信息

以下为**逻辑表/模块**，首个 Payload 项目不需要全部做成独立 Collection。优先沿用 R3 已定义的表，不重复建立 User/Entitlement/PersonalRule 真相：

| 平台数据 | 最小字段与唯一性 | 来源/位置 |
| --- | --- | --- |
| identity principal | internal accountId、issuer、sub，unique(issuer,sub)，账号禁用/删除状态 | 共用 Identity/IdP 映射；没有经过验证的账号时不上传个人记录 |
| platform_admins | staffId、角色、有效会话/可审计后台操作 | Payload Admin 专用 auth collection；不得当作所有普通用户账号表 |
| product_registry（新增） | productId 唯一、publisherId、displayName、status、allowedCapabilities、schemaPolicyRef、registeredAt | 共用管理控制面 |
| product_runtime_bindings（新增或 registry 内子结构） | (productId,runtimeKind,packageIdentity,clientId) 受唯一约束，安装/来源/发布者信任规则 | 可信 Host/Broker + 产品注册，不从客户端自报名决定 |
| publisher_memberships（后续可选） | publisherOrgId、developerAccountId、role、状态；联合主键 | 开发者门户/团队授权，非普通用户 |
| product_schema_versions（新增可选） | productId、schemaVersion、JSON schema digest、quotaPolicy、migrationPolicy | 统一验证业务 payload，不能执行开发者提交的任意 JS |
| app_device_sessions（已有） | accountId、clientId、sessionId、random deviceId、revokedAt | 按确有会话/撤销业务需要保存，不保留浏览器指纹 |
| product_sync_consents（已有） | accountId、productId、scope、consentRevision、grantedAt、enabled | 登录不代表上传全部产品 |
| product_public_query_consents（按需新增） | accountId、productId、featureCode、consentRevision、enabled | 公共查询可能暴露观看内容，不能与私人同步授权合并 |
| product_entitlements（已有） | accountId、productId、featureCode、status、validUntil、quotaPolicyRef | 服务端唯一权益真相；支付敏感信息留支付服务 |
| sync_records / sync_changes / receipts / history（已有） | accountId、productId、recordId、schemaVersion、revision、payload/tombstone、changeSeq | 通用个人数据/设备同步，不逐扩展建表 |
| quota_counters / audit_events（按需） | accountId、productId、featureCode、限额窗口、脱敏结果、保留期限 | 用户/产品/功能维度限频、异常审计，不记录播放 URL 或明文历史 |

**必须保存的个人身份最小集**：已登录且同意云功能的用户，需要内部 accountId 与 (issuer,sub) 绑定、各产品授权和权益、与该 accountId 关联的私有业务记录、必要的会话撤销信息。可匿名离线使用的用户无需因此在服务器创建个人资料。邮箱、头像、昵称等资料优先留在 IdP，业务 API 非必需不复制；设备 ID 是随机值，用户更换/清理可撤销。公开规则库只发布经过授权的时间标记和去身份化来源引用，贡献者可追责/删除的 accountId 保存在私有审核关系中，不在公共响应返回。

**不应保存**：完整播放 URL、Cookie、Token 明文、观看历史、播放进度、设备指纹、视频内容，以及无限期的用户级匹配请求日志。安全审计的限量网络元信息须有具体用途、短留存期限和访问授权；不可把低熵作品 ID 的 hash 视作匿名。账号删除、撤销 consent、卸载、产品停用/更名、设备撤销和 VIP 过期的删除/保留/导出策略分别定义，不能静默交叉删除。

### R4.3a 全站会员与产品级权限映射（避免每个扩展重复会员）

账号可能购买的是「全站 VIP」或「若干扩展功能包」，不等于每个扩展都要持有一张独立会员表或必须单独购买。共用计费/订阅源（若未来实施）保存 accountId、planId、providerSubscriptionRef、status、validUntil；服务端 Entitlement Resolver 根据**已发布套餐到 feature grant 的规则**计算 (accountId,productId,featureCode) 的有效权限和 quotaPolicy，并可物化到 R3 product_entitlements 或使用短期受控缓存。全站套餐覆盖多个产品时，不复制多个用户身份或重新收费；单独产品订阅则仅发该产品功能，第三方开发者产品默认**不自动继承全站 VIP**，需明确平台/开发者商业协议。浏览器只读取受限的 entitlement 摘要，避免每个视频/扩展重复查询；服务端每次业务调用仍检查真实权益/撤销。支付卡、账单私密字段在支付服务存储，不写在扩展私有配置 JSON。

配额计算的三个正交维度：用户 accountId、产品 productId、具体 featureCode（必要时叠加发布者 publisherId 的总体租户预算），防止单个开发者应用滥用共用后端而影响其他产品。限额是服务端原子事实，客户端缓存只是成本优化。会员套餐和定价未发布；上述为合同设计非线上系统。

### R4.4 共用 API 形状（与 R3 向后兼容，不新增任意 Collection CRUD）

现有 R3 私有同步契约保持：
- GET /v1/bootstrap（返回已授权产品与可用权益摘要，不包含其他产品原始记录；缓存刷新不按视频每集重复）
- GET /v1/sync/{productId}/snapshot
- GET /v1/sync/{productId}/changes?afterSeq=...
- POST /v1/sync/{productId}/operations
- GET /v1/sync/{productId}/history、POST /restore

业务专用查询注册在**已审核的 server capability handler**，例如：
- POST /v1/products/{productId}/video-rules/match（只有具备 video-rules.auto-match 能力的受信产品可以使用；与旧 /v1/video-rules/match 草案的关系在实施前只保留一个 canonical 路径，不双重实现）
- 产品更换不会要求任意开发者新增物理表；其个人数据继续走 /v1/sync/{productId}。
- **不能**提供一个无需 schema、权限/作用域约束的动态 /api/{collection}/find 或 /products/{arbitraryName}/query；productId 必须存在于注册表且与可信调用身份允许范围相交。

请求例（仅示意）：
~~~json
{
  "protocolVersion": 1,
  "operationId": "one-stable-uuid",
  "recordId": "episode-scope-example",
  "baseRevision": 2,
  "schemaVersion": 1,
  "deleted": false,
  "payload": {"intro":{"kind":"fixed","start":0,"end":90}}
}
~~~
路径：POST /v1/sync/opendesk.video-auto-skip/operations（示例产品 ID **尚未在生产注册**）。服务端推导 accountId，不允许 body 通过 userId、accountId、publisherId 或 isVip 伪造权限。实际 prod 名字、runtime bindings、产品 Schema 在服务端注册时冻结。

服务端判权次序：认证与会话撤销 → client/product 身份绑定与状态 → account+product 的 consent/权限 → feature entitlement → quota → schema/大小/作用域/版本 → CAS/索引 DB 查询 → 最少返回。任何拒绝不得发生越权数据读取；数据库索引必须含 accountId+productId（私有）或受控 domain+edition（公共），不能只按 recordId 或外部名称筛查。

Payload Admin 管理员可维护目录/策略、审核公共标记；普通用户与开发者都不应直接获得 Payload Collection CRUD。若 Payload Local API 被用于内部查询，必须知晓默认 overrideAccess=true 的风险；在要求用户权限的路径显式 overrideAccess:false + 可信 user，在通过服务端全部权限闸门的内部受控代码才能有审计地特权查询。参考 https://payloadcms.com/docs/local-api/access-control 、https://payloadcms.com/docs/admin/overview 、https://payloadcms.com/docs/rest-api/overview 。

### R4.5 跨产品安全与可实现验收门槛（全部 NOT_TESTED）

- 同一 account 安装 A/B 两个扩展：共享一次身份，但私有记录、同意、权益、配额、撤销分别按 productId 隔离；无同步许可的 C 安装不上传。
- 两个账号安装同一个 A 扩展：任何轮询/按 id 查找都不能读取对方记录；删除、导出、恢复必须本人 owner 校验。
- 第三方扩展自报产品 ID 与已审扩展相同、改路径 productId、伪造 publisher/installation/feature：没有服务端注册及受众绑定不可升级能力、不可跨产品读取。
- 独立工具 ID video-auto-skip 与 app.video-auto-skip 属同一产品的**显式注册绑定**时，不能生成两套会员或重复扣配额；未绑定则安全拒绝而不是猜测。
- 开发者创建注册私人扩展，按 schemaVersion 和配额同步自己的用户数据；开发者本人不可用管理 API 遍历用户私有记录；发布者停止更新不导致任意清空用户数据。
- 管理员后台安全与用户 API 隔离：普通用户 Token 不能进入 Payload Admin；管理员行为有审计，管理员角色也不应默认免审读取业务私有数据。
- 多租户：publisherId 与 accountId 是两个正交维度；Payload 管理面 tenant selector/filterOptions 不可替代服务端数据权限验证。
- 用户 A→B 切换、安装代际变化、VIP 到期、网络 ACK 丢失、schema 迁移、tombstone/恢复、容量不足均保持旧数据/隔离与幂等。
- 非 VIP/未同意/本地规则已满足/缓存命中应为 0 公共 match 请求；服务器端再以服务端当前权益与配额阻断直调；查找次数、数据库次数分开计量。
- 表和 API 架构设计通过不等于代码/真实账号/双设备验收；正式迁移、OAuth/权限、Payload/SQL、Chrome、多开发者与跨设备专项必须分证据记录。

**实施前置顺序**：先建立 Registry + ID/binding/roles/consent/feature/数据分类的合同（R4）；其次在**单一**后端做一个共享 registry + 通用 sync 存储 mock 与视频专用目录 mock；最后两种不同扩展数据（video-auto-skip 和非视频消费者）各跑一轮真实 API 隔离/额度测试。仅视频能跑通不算验证了通用平台。普通扩展云能力与高权限公共内容审核分等级上线；不将完整视频库、公共贡献或真正付费系统作为最小通用协议前置。


## R5 · Payload 原生资源 API、统一扩展数据、安装清单恢复与可选开发者后端（2026-11-23）

> 状态：DESIGN_PROPOSAL / NOT_IMPLEMENTED / NOT_TESTED。当前仓库 services/ 只有已查得 analytics 与 cookie-share-relay，未核实运行中的 Payload/账号后端；不得将本节视为已部署。此节优先于 R3/R4 中尚未实现的 /v1/sync/{productId}/... 路由候选和 R12 的 /v1/products/.../video-rules/match 候选；**旧路径未真正上线，不要为了兼容草案而部署双路由**。通用同步真相、记录 CAS、账户隔离和 VIP 原则继续沿用 R3/R4，不另建第二套引擎。

### R5.1 原始用户目标、关键架构错误与总体取舍

最终让任何正常注册的 OpenDesk/GrayDove 内部或用户自建扩展，在**没有管理员事先为其建立数据库表/专用 API**的情况下，按已批准范围保存并跨设备恢复个人数据；统一账号还可保存用户希望恢复的扩展清单，换电脑显示可恢复应用并通过原安装审阅恢复。只有高查询/公共共享/业务审核需求的扩展才需要专用领域模块。普通扩展开发者默认**不需要自己提供后端**，可选连接自有服务；不能因为用户提供了 extensionId 就获得跨产品权限。

纠错：
- 上一版把 /v1/sync/{productId}/changes 作为统一主接口：HTTP 合法但**不是 Payload 原生 Collection CRUD**。Payload 默认前缀 /api，以 kebab-case slug 自动提供 GET/POST/PATCH/DELETE /api/{collection-slug}，并可定义 Collection 内的额外 endpoint 或独立 Next Route。今后第一优先复用原生 Collection，再为 CAS/增量游标/幂等增加必要且少量的自定义 endpoint。Payload 文档：https://payloadcms.com/docs/rest-api/overview 。
- /v1/extensions/cache 这个示例把「扩展目录」和「用户私有持久设置」语义混淆；用户规则并非可以随时清空的缓存。推荐 extension-data 作为**持久**用户数据 Collection；cache/TTL/NO_MATCH 等派生数据放浏览器本机或共享缓存层，绝不当个人备份的唯一真相。
- 每个扩展对应一个 Payload Collection 会造成管理员开发前置与 schema 爆炸。**固定少量通用集合 + JSON 数据字段 + 分产品分账号严格授权**是默认；视频公共时间标记等才有受审专业索引。Payload JSON 字段有 jsonSchema/validate 可用（https://payloadcms.com/docs/fields/json），但不能相信作者可在客户端任意改写被批准的 schema。

### R5.2 最小通用 Payload 资源和职责

**M0 核心三集合**（均是统一服务中定义**一次**的 Collection，不按用户开发应用数量复制）：

| Payload Collection slug | 关键字段与唯一身份 | 谁可以调用及用途 |
| --- | --- | --- |
| extensions | extensionId（唯一不透明/命名空间 ID），publisherId，displayName，runtimeBindings/packageInfo，sourceKind，status，capabilityGrants，schemaPolicy，releaseDigest | 公共可读已审核目录的有限元信息；平台审核发布；private-draft 用户自建扩展仅本人可见 |
| user-extensions | accountId（由服务端身份映射），extensionId，desiredState（WANTED/REMOVED），pinnedReleaseRef，restorePolicy，changedRevision，sourceProof | 仅本人管理「下次希望恢复哪些扩展」；不是此设备安装真实性或权限清单 |
| extension-data | accountId，extensionId，recordKey，schemaVersion，data JSON，recordRevision，deleted/tombstone，updatedAt | 每个账号、扩展、记录隔离的**持久**配置/备份；唯一(accountId,extensionId,recordKey)，严限字节数/总记录/调用预算 |

**后续按需要的共用实体**：identity users 与 admins（不同授权面）；entitlements/consents（R3/R4 已有责任）；extension-data-operations（operationId→digest→receipt，幂等）、extension-data-changes（递增账号/产品变更游标）、extension-data-history（可恢复历史）；必要的 device-install-states 记录**本设备实际安装报告**与撤销代际。不要把安装清单、用户可恢复数据、设备运行权限混为同一张表；历史日志不能无界增长。对 M0 最小实现，可先在同一后端增加必要的事务操作表，不要求每张逻辑表都公开为 Payload Collection。

账户/扩展资源键：私有记录以 (accountId, extensionId, recordKey) 唯一；历史以 (accountId,extensionId,recordKey,revision) 标识；幂等以 (accountId,clientId,operationId) + payloadDigest 唯一。服务器由可信登录验证派生 accountId，扩展 ID 必须存在于 Registry 并受真实安装/发布者绑定和 capability 约束，不能仅凭 body 或 URL 上的 ID 读写他人数据。默认公开目录不能泄漏个人订阅或安装清单。建议在 DB 层实现复合索引/唯一约束，服务侧做事务版本检查、越权测试；Payload 的字段 unique/index 只是组成部分，不能替代跨字段索引、跨记录 CAS、数据库迁移与压测。

Payload 中的普通 users 与后台 admins 可以使用两个 auth collections，配置 admin.user='admins'（https://payloadcms.com/docs/admin/overview）；若另选独立 IdP，必须增加受信适配器/定制授权 Endpoint，不能假定外部 OIDC JWT 会自动使 Payload req.user 有效。Payload Local API 默认 overrideAccess=true；需要尊重请求用户权限时显式 overrideAccess:false + 有效 user（https://payloadcms.com/docs/local-api/access-control）。Admin 可管理系统配置，但不应因此默认浏览用户私有数据；真正保密要求另审加密/密钥边界。

### R5.3 API 统一命名与分层，不要为新用户扩展写新接口

**默认采用 Payload 的 routes.api='/api' 和原生资源名**（如下为架构目标，未实现）：

| 层 | HTTP 路径 | 读写主体与意义 |
| --- | --- | --- |
| 扩展目录 | GET /api/extensions | 只返回已发布/本人 private-draft 的有限注册元信息 |
| 用户希望恢复的扩展 | GET /api/user-extensions | 只读当前已验证用户的 WANTED/REMOVED 清单；按需分页/差量 |
| 安装意愿 | POST/PATCH /api/user-extensions | 经过用户操作记 desiredState，不执行安装，也不传权限票据 |
| 私有数据简单读写 | GET/POST/PATCH /api/extension-data | Payload 原生 CRUD；后端强制 accountId 与 extensionId 隔离，并验证 JSON schema、配额和 owner |
| 真正可靠增量同步 | POST /api/extension-data/sync、GET /api/extension-data/delta | **仅这两个为自定义端点候选**，实现 baseRevision/operationId/tombstone/changeSeq/冲突和原子读写，不能把原生 PATCH 的「更新成功」冒充同步事务 |
| 公共视频专用能力 | POST /api/video-rules/match | **仅实际业务需要时新增自定义路由**，先验证产品 capability、用户公共查询 consent、权益和限流，然后查受审核的视频领域数据 |

是否把 /api/extension-data/sync 作为 Collection 子路由由 Payload 版本/路由冲突测试确定；若与 document ID 冲突则用根级自定义 /api/extension-sync，不同时公开两个等价入口。原生 GET 的 where/filter/分页不等于用户有权决定 accountId；服务端访问策略必须自动施加 owner 约束并防 limit=unbounded。M0 可以先展示原生 CRUD 的最小 Demo，**但真实跨端多设备恢复必须额外通过事务 CAS/增量与持久队列**。

通用写入数据示例（accountId 完全不由客户端传递）：

~~~http
POST /api/extension-data
Authorization: Bearer <trusted-user-token>
Content-Type: application/json
~~~
~~~json
{
  "extensionId": "ext-video-sample",
  "recordKey": "rules.v1",
  "schemaVersion": 1,
  "data": {"series":{"series-sample":{"defaults":{"outro":{"kind":"tail","seconds":90}},"episodes":{}}}}
}
~~~

此为示意非现有已注册扩展。真实同步写入还需 baseRevision/operationId、稳定 digest、错误恢复、限额闸门，避免客户端对同一记录多个并发 PATCH 丢更新；服务端从受信产品/身份范围推导 owner，不能信任任意传入的 extensionId、isVip 或 accountId。对于真正的第三方独立 Chrome 扩展，服务端无法仅凭 manifest ID 字符串证明请求来自那个已安装扩展；必须明确客户端身份验证与用户授权范围，并说明不能对公有客户端作不可伪造设备证明的安全承诺。授权令牌留可信宿主或正式独立扩展授权客户端，不进入网页上下文。

### R5.4 用户安装清单与新电脑恢复的完整闭环

**新增能力**：与「已安装并获授权扩展的数据恢复」分开，先经独立用户同意建立账号级的**期望安装清单**（user-extensions），供新设备恢复向导使用。它不会把设备 A 当前安装状态写成设备 B 已安装，更不会把浏览器网站权限或包来源授予 B。

流程：
1. A 电脑用户明确允许同步安装清单；可信安装器枚举 Side Panel Tool、Page Program 和可验证的独立扩展身份。每项保留 extensionId、类型、源站/发行 ID、已审核包版本/摘要或安全来源引用、desiredState、updatedRevision；用户本地未发布源码/私有文件默认**只保存可恢复引用和不可恢复提示**，不偷偷上传 JS 包字节。
2. A 安装新扩展时更新 WANTED；卸载时区分「仅本机移除」与「从我的恢复列表移除」，避免一台电脑清理临时工具就同步卸载其他电脑。需要恢复清单历史与删除 tombstone，避免旧设备重新上传已经移除的条目。
3. B 新电脑登录后先下载**清单**，比较本地真实安装列表/版本/来源/权限：INSTALLED / AVAILABLE_TO_RESTORE / SOURCE_UNAVAILABLE / REQUIRES_REVIEW / UNSUPPORTED。提供清晰的批量恢复选择和进度；用户同意后逐项复用现有唯一安装器与安全审阅、包来源和 SHA 验证，不构建第二套安装器。
4. 只有真实安装完成、工具 ID/版本/包来源合法且网站权限已获准时，再按该用户该产品的 sync consent 恢复**个人数据**。缺失权限可以保存但不标记功能已生效；没有源码/私人包无法自动获取时只列出未恢复项供用户手动导入。不能恢复 Cookie、Token、旧设备的能力授权/原生网页运行实例。
5. 恢复失败、权限拒绝、旧包/撤销、包下载未知结果：独立记录 UNKNOWN/BLOCKED，先读回真实安装，不盲目重试副作用；不因为一项失败就覆盖既有本地规则或清空其他已安装扩展。

**安全真实边界**：OpenDesk 内部工具可借已有安装器做「批量引导安装+审核」；真正的独立 Chrome 扩展通常仍需 Chrome Web Store/浏览器安装流程，Chrome 管理 API 不能被当成任意 CRX 静默安装手段（https://developer.chrome.com/docs/extensions/reference/api/management）；新增/扩大 host 权限需要按原 Chrome/平台审批，不能从另一台设备复制许可（https://developer.chrome.com/docs/extensions/develop/concepts/declare-permissions）。已有账号同步文档早期规定“不安装扩展”，此处**升级为恢复清单和受控恢复安装流程**，但仍不承诺无审阅静默安装。

### R5.5 开发者是否需要提供后端？分级能力

| 级别 | 适合谁 | 开发者需要自建服务器吗 | 费用/审核/安全边界 |
| --- | --- | --- | --- |
| L0 Local Only | 未注册工具、离线小工具 | 不需要 | 原工具继续可用；数据不上云 |
| L1 Managed Data（默认推荐） | 普通用户自己开发、发布者的设置/规则/笔记 | **不需要**，只需通过受控通用数据/同步能力 | 注册 private-draft extensionId 与产品级同意、JSON 版本/配额；用户可免费试用或使用 VIP 配额 |
| L2 Managed Domain | 视频公共时间标记、特定社区内容 | 不一定需要，但需平台实现/审核复用模块 | 公共分享、审核、第三方版权、较复杂域模型与服务成本；不开放任意表/查询模板 |
| L3 Bring Your Own Backend（可选） | 复杂自有业务、AI 服务、私有数据库 | **可选自建**，如作者自己的 API / Supabase | 显示提供方/数据流向/域名/安全审查；作者承担运营成本与服务条款；不能获得平台管理凭证 |

**Supabase 的三个不同角色**：
A. 平台选择 Supabase PostgreSQL 作为 Payload 的数据库托管：可行，仍由**平台 Payload 服务**管理业务 schema/API/权限，不能让扩展拿 DB 管理密钥；不需要再建一套同用途 Supabase 数据源。Payload 官方 Postgres Adapter https://payloadcms.com/docs/database/postgres 。
B. 平台直接使用 Supabase Auth+Postgres/RLS 而不使用 Payload 数据写入路径：是**另一种整体后端选型**，不能同时把两个库都当权威状态；若确需 Payload 运营 UI，应明确由谁写、事务如何统一和身份如何映射。
C. 开发者用自己的 Supabase：默认由开发者管理自己的项目/Schema/用户授权、RLS、配额；不得在扩展包里放 service_role/secret key。前端仅可使用受限公开 key + 实际用户登录和正确 RLS（https://supabase.com/docs/guides/database/postgres/row-level-security）；OpenDesk 账号不等于自动登录每个开发者 Supabase，必须明确外部登录或经过审计的令牌联邦。浏览器沙箱访问外部域名需单独明确权限与用户知情，不允许后台默默导出私人数据。

### R5.6 请求触发、VIP、合规和多扩展公平配额

- 普通个人同步：只在明确启用产品级 sync consent 后，本地**已合法保存的业务记录**发生真实变化才排入持久 outbox；启动/联网恢复拉变更，可合并短时重复写。侧栏开关、渲染、当前视频 timeupdate、滑块尚未保存的草稿、每次打开 App 都**不**生成上传请求。
- 用户安装清单：仅安装/卸载/版本变更或本人设置“期望恢复”改变时写云；同批次去重。普通登录按需获取当前清单/差量，不按每个扩展独立请求一次。
- 视频公共匹配：先做本地安全资源身份、已有本地规则、用户同意、entitlement、cache/negative cache/预算短路；必要时服务端查一次，权限拒绝先于数据库匹配；此领域规则仍沿 [R12.1/12.2](../../projects/video-auto-skip/CLOUD-RULES-R12.zh-CN.md)，但请求入口修订为受控 /api/video-rules/match。
- 共用 Entitlement Resolver 以 accountId + extensionId + featureCode 判断是否可以同步/自动查云、允许次数、容量。全站 VIP 可映射到多个 extensionId 的功能集合；开发者产品是否参加 VIP 由官方注册政策决定，不能无审核继承。服务器强制限制用户、功能、扩展/发布者的调用与字节配额；客户端预检只降低无效请求。
- 不在用户数据表记录完整页面 URL、Cookie、Token、设备指纹或播放历史。后端业务访问日志默认只记录受控脱敏计数/结果；第三方 BYO 数据提供方的隐私政策、用途、域名和撤销入口应在产品使用前明确可见。数据可导出/删除，账号切换与同步同意撤销不得跨用户或跨产品串写。

### R5.7 失败反例、强制验收与阶段实施

**先攻击**：用户自建私有 extensionId 没有专属表 → 仍能创建自己范围的 extension-data；两个用户同一个 extensionId → 不能互读；一个用户两个不同扩展 → 不能互读；作者把 extensionId 改成知名官方 ID → 不能冒认能力；作者通过 Payload where/limit/Local API 探查私人记录 → 受控 owner 限制/服务端拒绝；用户 A 卸载一项不造成 B 自动卸载；新电脑无法找到私有包 → 必须显示需导入而非伪安装；Chrome 未批准新的 host permission → 不得声称恢复完成；同步同一 key 双设备冲突与遗失 ACK → CAS/幂等可读回；管理员/付费过期 → 权益、数据所有权分离；Supabase BYO service_role 放进 JS → 安全测试拒绝发布或给出阻断。

**可执行最小纵向样板（不是已有结果）**：
- S0：一个 Payload 本地服务，先建 extensions、user-extensions、extension-data，以及最少一个管理员 auth 和一个测试用户 auth/受信身份边界；两种不同结构工具 video-auto-skip、mouse-gestures（或等价的两个受控 fixture）**无需分别建表**仍可写读不同 JSON；私有扩展注册 private-draft 不要求管理员写新 Collection。
- S1：在 Payload 默认 /api 路径运行原生 CRUD，测本人可读/越权拒绝、字段权限/JSON Schema/大小限制；再为双设备同步增加**同一个**必要的事务/游标 Endpoint，使用 PostgreSQL 或仅将 SQLite 明确标为功能模拟而不做事务验收（Payload SQLite 事务默认禁用，https://payloadcms.com/docs/database/transactions）。
- S2：从现有安装器导出 3 个虚构扩展的云清单，在新 Profile 登录后展示 AVAILABLE_TO_RESTORE，不偷偷安装；选择一项后经本机合法安装/审批读取真实安装结果，再恢复对应私人规则。一个用户两个 Profile、两个用户两个产品与取消/失败分别测。
- S3：初步做 Free/VIP、不同用户/开发者权限、请求去重/403/429/断网/恢复的真实 HTTP 统计；兼容性在真实 Chrome/新机中单独验收，不以 Mock 数据冒充。
- S4：仅当通用闭环过关，再接视频公共查找专业模块和第三方 BYO 选项，避免本轮同时引入视频社区、Supabase 多服务和正式支付。

**设计方案预期审查指标**（本轮仅静态合同）：平台抽象、Payload 官方契合、普通作者零后端门槛、数据主权与安全、清单恢复与安装安全、双设备一致性、Supabase/BYO 扩展性、成本/VIP、QA 共九项，平均目标至少 95/100，安全/数据正确性不得低于 90；同模型模拟评分不能作为真实独立专家意见。下一阶段 Codex 只能基于 R5 做单个最小后端+两消费者+安装清单恢复的技术 spike，不能照旧 /v1/sync 路由草案重复开发。
