# 设备 #1288 的托管、状态与首项实施单

业务人员打开本人设备，应能认出实际执行任务的浏览器、它获准做的事、当前接单的依据，以及谁有权处理缺项。下文中的接口增量属于设计。11 月 19 日 14:25 的实际 scope 和原请求见[业务设计 §1](cloud-control-business-design-20261119.zh-CN.md)。

## 一台设备在系统里的身份

| 对象 | owner 与识别依据 | 在设备详情中如何解释 |
|---|---|---|
| 物理设备 | 资产所有者管理主机或手机。当前业务目录没有硬件序列号的可信映射 | “这台 Mac”由持有人对照实机，未知就显示未登记。不能以 IP、昵称或设备号匹配硬件 |
| 业务设备 | mac24dev 的 operate_device，服务端会话限定 userId 与 deviceId | test / 569 名下 #1288。旧昵称是备注。只有本人设备可选 |
| Chrome Profile | 持有人管理 Profile 内的扩展安装、登录会话、Chrome 网站权限与本地 Run/Result | 同机可有多个 Profile。详情可提供已核对的浏览器展示名及 Executor 尾号。Profile 路径、登录态不传给业务网站，未知时引导在原 Chrome 核对 |
| Executor | Browser 配对到 Provider 后的 providerId + executorId | 已核对 #1288 指向 Executor 尾号 f686。新机器、不同安装或 Profile 要重新确认实际身份 |
| Pairing | Provider 与原 Chrome 共享 pairingId + pairingGeneration | 可断线仍配对。旧代次不能领新单。现有 Client scope 未公开该代次，详细核验在可信云控面板/维护端 |
| Cloud Grant | 浏览器所有者在可信面板签发 grantId，固定本机 installationId/generation、TaskPin、网站与逐 Task 的 resultAllowed | 列出该 Client 实际获委托的固定版本和站点。Chrome 实际安装和权限如未实读，标「在浏览器核对」 |
| 外部 Client | Provider 受限 clientId，固定 Executor/Pairing/Grant、任务与 allowResult | BFF 代用户调用，凭据留服务端。业务端只见本人有权的投影；管理其他 Client 回到可信面板 |

后端 bindingId 将 userId/deviceId 与明确的 Provider、Executor、Client 和 Grant 关联。它是带版本的业务映射。任务包身份为 taskId/version/manifestHash/sourceHash，本机安装身份另由 Installer 管理。配对、绑定、安装和授予远程调用各自需要自己的事实来源。[身份与权限合同](cloud-control-r5.2-interface-security-contract.zh-CN.md) · [绑定校验](../../../examples/cloud-control/mac24dev-demo/update-binding.py) · [Provider scope](../../../scripts/cloud-control/provider.mjs)

## 状态如何判断

| 维度 | 成立条件 / 展示 | 未知、失效与恢复 |
|---|---|---|
| 已关联 | 本人设备与服务端私有 binding 对应，当前 scope 中 Provider/Executor/Client/Grant 及 pin 符合配置 | 缺 binding 显示「尚未关联执行端」，Chrome 配对状态未知。配置不可读与已知未绑定分别展示 |
| 在线 | 本次查询有当前 WSS 或有效的同配对与 Grant 的 Pull 会话，列 transport 与观察时间 | NOT_CONNECTED 显示连接不足，保留已知绑定。先检查原 Chrome |
| 已授权 | 本 Client 的固定授权范围通过。单列 Chrome 端实际安装、当前启用、精确站点权限的核验来源 | scope 受限或 E_AUTH 只说明当前调用不获准。只有明确撤销回执才能标「已撤权」 |
| 可接单 | scope/安装/精确站点、连接、托管、对账与空闲执行槽都有当前有权来源，才可肯定「可执行」。客户端 READY 单列为「委托范围与连接就绪」 | 普通 BFF 缺本机槽或网站权限事实时，显式显示「本机准入待确认」。保留既有提交前实时校验；新提交还需新意图、有效参数、已保存原键 |
| 占用 | 本机活动 Run/唯一槽，或 Provider 在同一 Executor 上明确持有未结算 Assignment | 显示来源及占用原因，两者可不同。缺 ACK、全局排队数或历史 released 不能推出槽空或忙 |
| 暂停 | 本机 Stop 生效；远端 suspend 分 pending / ACK | 明确原 Grant 的停止或有来源的暂停。单凭 NOT_AUTHORIZED 不能细分暂停、授权撤销或不可用 |
| 已撤权 / 已解绑 | 具体 Client 撤销、安装停用、站点许可撤回、配对撤销分别归其原 owner 和回执 | 本地拦截立即生效，远端未确认显示待确认；普通 Client 可能已无读取权。旧 Job 仍归旧绑定 |
| 未知 | 读超时、过期、代次冲突、来源矛盾或无权读；提供观察时间和原因 | 清除当前可用标志，允许只读刷新。绑定、页面选中设备或账号变化后丢弃迟到读数；恢复的旧键始终只查询 |

账号目录、Provider scope、Chrome 可信状态是三个观察面；业务详情仅展示该账号可获的面。11 月 19 日 #1288 的实例是「已绑定 · WSS 就绪 · 表单 v1.0.2 · 约定站点 43111 · 外部回传正文关闭 · 本机槽及实授网站权限待核」。本次原请求的 released 单列在请求详情。[业务目录与前端](../../../examples/cloud-control/mac24dev-demo/app.js) · [可信面板](../../../src/ui/react/tabs/cloud.tsx)

## 谁能管理，何时算完成

| 动作 | 唯一执行者 / 入口 | 验证与保留项 |
|---|---|---|
| 登记本人业务设备 | 业务设备管理员按 mac24dev 现有业务设备归属流程登记；普通用户在本人目录核对 | 登记只生成业务设备记录，不签发配对或远程执行许可 |
| 配对与首绑 | Chrome 持有人在可信「云控」配对。业务绑定维护者用已有 bind-provider 入口，将本人设备与准确 Executor/Client/Grant 建立 binding | 一次性配对材料只在原私有渠道使用。写后读回，同设备不能隐式覆盖 |
| 安装、批准任务和站点 | 浏览器持有人在任务目录验证与安装，在 Chrome 原权限入口批准精确 Origin，再审阅远程 Grant 和逐任务正文范围 | 固定两个摘要、installationId/generation 和获批站点；升级、换安装或撤回站点后重新核对 |
| 委托或撤销一个 Client | 持有人在可信 Side Panel，或 Provider 本机管理员在原维护入口 | 一次展示密钥，固定任务白名单和正文选项。只撤指定 Client，检查旧身份被拒绝 |
| 暂停与恢复 | Chrome 持有人在原「云控」停止；恢复按当前安装重新审阅批准。维护者用新有效范围核对后端映射 | 记录本地 fence 与远端 ACK，复核新 Grant/Client。恢复不重放旧请求 |
| 解除配对、解除业务绑定 | 持有人由原云控入口解除配对；业务绑定维护者负责本账号绑定的退役。通用业务解绑 UI 待实现 | 两种动作分别确认。业务解绑要按旧 bindingId 条件写，拦新调用并保留历史；撤销旧 Client 另取回执。离线解绑保留待确认信息 |
| 换机、换 Profile、转移 | 新持有人以新 Profile 完成安装、配对、批准；维护者核准原设备归属和旧 bindingId 后走显式替换 | 先冻结旧绑定的新意图，未结算的按原键查询。原子切换前再次核对新委托；旧授权退役单独确认。旧任务绝不投给新机；异账号转移还需业务资产 owner 单独批准 |

普通业务操作者可用自己的 Client 范围请求任务、查自己的请求和申请取消。页面管理入口按原因提供原 Chrome「云控」的具体菜单路径或联系维护者；业务页面不能代替 Chrome 可信点击。本机 43121 仅作该演示的维护者观察入口，不作为远端用户的管理代理。[绑定脚本](../../../examples/cloud-control/mac24dev-demo/bind-provider.mjs) · [托管 SDK 实现](../../../src/cloud-control/service.js)

## 实施单：从业务设备详情认出获准的 Chrome

**职责和前置。** 交付 owner 为 mac24dev 设备接入负责人。需与正在修改 Demo 的 owner 协调同文件增量。实际入口是登录业务页后「刷新设备 → 本人设备列表 #1288 行 → 查看托管详情」，原请求保持已锁定。原 BFF 的 `POST /app/operate/cloudcontrol/catalog {}` 已校验本人账号。Provider 的 `/v1/client-scope` 已有 includeTaskSchemas 与 includeAvailability。现有目录顶层为 task、devices、providerId；设备行只有 id、nickname、readiness、message。

| 位置 | 最小改动（拟议） | 数据来源/退化行为 |
|---|---|---|
| mac24dev 后端 `src/modules/operate/service/cloudcontrol.s.ts` 的 catalog() 与 `controller/app/cloudcontrol.ts` | 沿当前 catalog 返回的本人设备，增加可选的只读 detail 字段。依次提供 bindingState、checkedAt、executorLabel（经确认的别名或 Executor 尾号）、tasks（获委托的任务名、版本、精确站点）、transport、clientResultAccess、readinessReason。保持原提交合同 | 复用现有本人归属、私有 binding 及同一次 scope 校验。昵称单列，当前只有一个表单任务。未绑定、配置未知、范围不符须分别处理。跨账号不给存在性信息。未取得逐 Task 的 resultAllowed 时不对外宣称已开正文 |
| Demo 原 index.html / app.js | 在本人目录每条设备行增加「查看托管详情」只读按钮，以独立查看 ID 取已返回的 detail；不依赖被禁用的请求目标选择器，不修改已发送请求的 deviceId、name、requestKey 或 sent，同时显示绑定及浏览器标识、任务与站点、接单/本机未知事实、读取时间和对应管理路径。切换账号/设备时先清旧详情 | 老 BFF 无 detail 时显示「关联详情未提供」，按原目录状态显示既有功能；错误和慢响应不复活已失效的 READY。已发送原键的表单仍只可查 |
| Browser 云控 Tab、Provider、43121 管理页 | 复用原「云控 → 连接设置与解除配对 / 允许远程调用的任务 / 运行环境与历史统计」和已有 Client scope | 首项不需要开放 Admin、暴露本地 Profile、传回 Run 正文或增加新的调度接口。若要实时跨端精确显示本机空槽，另立有限状态接口及权限设计 |

**交付与验收。**

1. 实测登录 test 恢复原键（sent=true），执行目标选择器应禁用。刷新目录后点击 #1288 行的独立详情入口；即使尚未选择新请求目标，也可查看。正常投影能对照原只读目录显示 Executor f686、固定任务 1.0.2、精确 43111 Origin、WSS、正文限制和观察时间。实际状态若在测试前变化，以新来源为准。存在明确的下一管理路径，且进入详情无需提交请求。
2. 后端目录定向用例覆盖非本人设备、无 binding、配置失败、scope 错位、暂停和断线；所有凭据、完整设备私有配置和网页结果均不出响应。断开时旧 READY 消失；仅缺 binding 时不提示重新配对。
3. 在现有 mac24dev-demo-ui 用例补充旧服务无详情、切设备与迟到响应、新草稿与原键恢复的显示。对原 #1288 重复打开/刷新前后核对本次调用只有 catalog/scope，新增 Job、Run 和绑定写入均为零；不要求原设备做暂停/解绑试验。
4. 交给 Browser 托管负责人一份脱敏截图、对应目录投影及时间、原绑定核对结论、负例和未读本机字段。下一步在专用测试绑定验管理动作的可信点击及实际回执。有新派发、他人设备可见、虚假空闲或无法说明哪个 Chrome 被绑定，退回本切片。

[演示入口源码](../../../examples/cloud-control/mac24dev-demo/index.html) · [当前页面逻辑](../../../examples/cloud-control/mac24dev-demo/app.js) · [现有组件用例](../../../tests/cloud-control/mac24dev-demo-ui.test.mjs) · [原 mac24dev 接入合同](cloud-control-mac24dev-design-20261030.zh-CN.md)
