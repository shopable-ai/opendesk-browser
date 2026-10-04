# OpenDesk Browser 采集插件迁移：前提缺失，暂停

本次是新 Goal；已执行前提检查，尚未进入插件开发。按用户原提示词“前提缺失时……暂停本 Goal，只记录具体缺口”停止。证据观察时间为 2026-10-02 06:54 PDT（逐文件观察，非原子快照）。

## 具体缺口

- **PRE01 有效 framework-handoff.json**：ENOENT; docs/framework 目录亦不存在。需要：由当前唯一公共 owner 交付有效、绑定最终设计/source/package hash 的 F3 handoff。

- **PRE02 有效 execution-gates.json**：ENOENT。需要：新执行证据独立记录 F3=true，逐项引用实际 Chrome/IDB/下载/清理/插件禁用的全部必选结果。

- **PRE03 F3 frameworkFunctionalMigrationComplete=true 实际证据**：未取得新执行证据；旧 approval=false 仅为历史状态，不作为今天未通过的唯一依据。需要：绑定最终设计 hash 和同一最终包的 F3 全功能实测与原始日志/截图/文件 hash。

- **PRE04 冻结 SDK/API/schema/grants/version**：无有效 F3 handoff 或其冻结清单；旧 contracts 1.0.0/buildHash=null 不构成 F3 冻结。需要：逐接口、schema、grants、version、source/lock/recipe/包 hash 与允许每 run browserPage 的签名、语义和支持范围。

- **PRE05 F3 独立 review 与同最终基线包 hash**：已有 production/development ZIP 属旧环境包；未取得 F3 最终包→必选测试→独立 review 绑定链。需要：最终候选包可复核 bytes/hash，独立非作者 review 与全套 F3 原始结果绑定同一 hash。

- **PRE06 公共底座唯一当前 owner**：framework handoff 不存在；旧 02B/继任 chat 指定与新任务文字不能证明当前唯一 writer 接管。需要：在有效 framework handoff 中明确当前唯一公共写入 owner 与接口缺口处理责任；插件 owner 不代行。

- **PRE07 最终设计候选同 hash Architect→Critic 终审**：Round3 Architect 有效；Critic .md/.json 均缺失，approval.critic.validFinal=false。上游 v3 有效双方报告仅批准更早的设计合同。需要：仅闭合受影响的 C01–C03/漂移争议，同 acca60ed… hash 有效最终 Critic；设计审核仍不能替代 F3。

- **PROV-DRIFT 来源 generation 与有序 32 inputs 合同一致**：按 producer 原算法当前得到 35 inputs；新增 3 项、原有 2 项变化。未排除/重排输入，旧记录保持只读。需要：来源负责方确认新 generation 与受影响 browser 闭包/合同，再由公共 owner 接收并冻结；不执行旧仓库 producer/build/sync。

- **SOURCE-PATH 明确 result-quality.js 真实来源**：用户所列 assets/js/core/result-quality.js 不存在；实际 consumer 是 assets/js/ai/result-quality.js，hash 232a7f4d… 与审计一致。需要：后续保留实际 consumer 与来源路径差异；未开始迁移，不伪造 core 路径。

## 已核验材料与来源漂移

指定 11 个 outputs、4 个接续 evidence、上游 72 个完整文件条目/48 个完整 API 条目及 160 个 observation 记录已读取；输入字节 hash 见 prerequisite-evidence.json。没有重复全库旧源码审计。

Round3 设计 manifest hash 为 `acca60edf9031aafb4ecb740f5f0f33777a3694d23499f28ce37af63b38f592f`，64/64 文件 hash/bytes 匹配（1,159,291 bytes）。这证明设计资料完整性；没有取得新 F3 功能证据。旧 approval=false、设计评分及旧 02A 环境 ZIP 均不代替当前执行门。

按 producer 逐目录排序插入 src 输入，再追加 package/lock/webpack，UTF8(JSON.stringify(inputs,null,2)+LF) 重算：当前 35 项、顺序与当前 receipt 匹配、逐项 hash 匹配；未过滤或重排以维持旧 32 项。当前 sourceHash 为 `47aee34aa4f505460a0faa716094e58eed1a3b13bb127d572b1faca6850740ad`，两端 SDK hash 为 `b0c7d9baa22860036525e1eee6802871de197576f4454e19d17469fe60552e58`。相较历史 32 项新增 BrowserValidation.js、Processing.js、Publication.js；原 ai/index.js、core/ChromeSpider.js 变化。两份 receipt 完整 hash 不同，仅 builtAt 根字段不同，producer 身份投影 hash 一致，不能误报身份不一致。没有 build、sync 或运行 bundle。

请求的 assets/js/core/result-quality.js 不存在；实际旧 consumer 在 assets/js/ai/result-quality.js，记录真实路径，不改旧来源或悄悄生成替代。

## 独立复核与未测范围

独立 Architect 使用 native default + 完整已安装角色提示，显式请求 gpt-6.1-sol/xhigh，判为 BLOCK；其原报告保留在 independent-prerequisite-review.md。报告中的旧 F3=false 只作历史事实；本次拒绝接入依据是没有更晚的有效 F3 执行/冻结/包/owner 绑定证据。本 review 不是插件最终 review，也未独立验证尚不存在的插件包。主会话实际模型未通过运行元数据证实；没有修改全局模型配置或使用角色旧模型绑定。

SCR01–15、PROV02/03、AUTH01、CTRL01–03、DLGEN01/02、LEAK01、PLG01 全部 **not-tested**。实际 Chrome 选区/配置 CAS/复杂 CSS/XPath/第六行/详情/控制/Pipeline/ItemLoader/AI/双 run/真实导出/禁用插件回归/清理均未执行。PROV 的静态 hash 核验不将 PROV02/03 改为 PASS。mock、真实 provider、模型质量分别未测。quality 与 demo 未实现，不宣称支持或一般恢复通过。

只创建本目录的缺口、原始复核与暂停 handoff；无插件代码、公共代码、旧来源写入，无依赖安装、发布、旧 Goal 恢复或其它 chat 消息。公共 owner 尚未由有效交接确认，缺口只记入 interface-requests.md，不自动联系历史 owner。全部前提补齐后须由用户显式恢复本 Goal，再重验，不自动进入优化、验收或发布。
