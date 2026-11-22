# OpenDesk / GrayDove · 统一账号、VIP 云同步与备份 R1（设计方案）

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
