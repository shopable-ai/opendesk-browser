# 采集迁移接口请求（待公共 owner 明确接管）

接收者：有效 framework-handoff.json 指定的唯一当前公共底座 owner；目前未取得该交接，不能采用旧 02B 标识冒充当前 owner。本文件仅记录请求，没有发送消息、启动或恢复其他任务。

|请求|具体缺口|owner 交付与关闭证据|
|---|---|---|
|IF01 F3 执行交接|docs/framework/framework-handoff.json、execution-gates.json 均 ENOENT|绑定设计 hash 的新 F3=true 实际证据、全部必选 Chrome/IDB/文件/清理结果与同最终包 hash；历史 false 不改写|
|IF02 冻结公共 SDK|缺有效每 run browserPage、PagePort/grant、compiler/extractor、Storage namespace/CAS/durable、result/artifact/download、注册/UI 资源的版本/签名/schema/grants清单|公共 owner 提供实际冻结服务，不按本表猜 API 或在插件另造；真实功能重验后冻结 source/lock/recipe/产物/hash|
|IF03 唯一写入责任|有效 handoff 未指定当前唯一公共 writer|owner 身份、支持范围、接口变更与重新冻结责任；插件不写 platform/framework/compat/agents/scripting/ui/manifest/webpack|
|IF04 最终包与独立 review|旧环境 ZIP 不是 F3 最终基线；缺同包独立 review|原始 F3 全功能实测＋非作者 review 绑定同最终候选包 bytes/hash；禁用采集仍完整可用|
|IF05 注册/入口/权限/构建/资源|未取得冻结注册、工作台槽、固定提取操作及动态资源消费合同，不能开始验证 receiver 或 browser entry|owner 确认实际入口/操作/grant/资源闭包，不仅创建目录或 build；逐 load/error 实测|
|IF06 来源 generation|冻结审计 32 inputs，当前 producer 35；3 新输入、2 旧项变更|仅复核受影响 browser 动态/静态依赖闭包和契约；不要过滤新输入、重排或改旧源；接受新 generation 后重新冻结。receipt builtAt 差异与身份一致分开|
|IF07 最终设计争议|Round3 同 hash 最终 Critic 缺失|限定 C01–C03/来源漂移争议闭合，与有效 Architect 同 acca60ed… hash；此设计闭合不替代 F3|

未选择替代公共服务、另一套 authority/journal/IDB、插件特权下载监听或 storage.local controller。当前阻塞是前提交接缺失；IF02/IF05 是尚未收到合同的待确认项，不断言这些运行服务已经缺实现。

具体观察、输入 hash、旧包与未测范围见 prerequisite-evidence.json；暂停交接见 handoff.json。
