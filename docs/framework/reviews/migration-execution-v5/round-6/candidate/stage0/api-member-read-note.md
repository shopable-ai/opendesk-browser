# 阶段0：48 API成员作者读取与草稿交付记录

作者助理交付，仅写本记录和 api-member-draft.json。没有修改产品、主ledger、门禁、计划或旧source，没有运行原型、server、build或浏览器。作者不兼任评审者；本稿没有独立批准、评分或功能通过结论。

完整读取 executor.md、goal-migration-v5.txt、continue-in-new-chat.md；ledger完整JSON解析并逐项读取全48 apiItems的全部原字段。旧ChromePage.ts有限完整读取1–1153行；当前client 1–48及PagePort 1–222完整读取。冻结compatibility-and-file-map、type-click-compatibility、compatibility-delta完整读取。只补读真实入口、broker及必要target/agent片段，没有展开全库或72来源语义审计。

48个原项均无稳定ID，按 API:完整symbol 派生；原symbol、name、kind、sourceLine及原oldSignature（含null）逐字保留。null属性另补源码声明签名。每项保存原file hash、当前file hash、当前成员原始字节span hash；旧ledger未提供历史逐成员hash，明确为null且不推造。

旧ChromePage.ts原hash与当前hash均为 8ad986b65648b3a7bb0bb8287ec6fecc9a51fa05f840a76069e438f7563750d6，本次有限检查无该文件漂移。主ledger读取时hash=11ac2101772f9ebeab69262dc71607003bfdca7ab585ad9b89d0eae239313fd1；其他主代理随后修改主文档应保留本读点并重新计算其最终候选manifest，本作者不回滚/覆盖他人。

草稿JSON SHA-256：f458f791503afc2e450229bade2aab35099fea1b7b519e4f121a3ba3a0fec095。这是作者方案文件hash，不是产品包hash。历史designManifest/API/source-map hash仅为来源，不能继承批准。

48/48成员有明确新职责、真实拟接入入口链、T/F/依赖、旧行为与精确case。共192个具体case（每项正常/异常/限制/身份生命周期），当前全部not-tested、runtimePass=false、actualResult=null、产品包hash=null。拒绝case通过也不计受限功能实现；48/48表示作者映射覆盖，实际API通过为0/48。本稿不声称SDK/服务/资源分母已覆盖。

ctx固定在准入→committed UTF8 revision/hash pin→精确target绑定之后创建；会话ChromePage(options)无ctx拒绝，四debug样本保留。host $/$$ detached快照与Worker snapshot(s)序列化替代分账。函数evaluate await与string true/忽略全部args分支分开；业务PageBrigeCode保留为值。

本稿已作具体决定：eval所有无mode请求拒绝，expression/statement分别返回值/undefined；用户evaluate默认USER_SCRIPT、eval MAIN；type追加Typed及InputEvent修正、click小写clicked与旧synthetic选项；Cookie逐URL/当前store、target-only/非分区及字符串语法；viewport截图与fullPage/native拒绝；上传字节/返回/filename/MIME、1MiB/48KiB/5跳授权；Keyboard普通字符仅synthetic事件不改值；press Backspace按主候选修为删除焦点value最后Unicode码点、不持modifier状态。关键选择没有推迟到实施。

上述细化中，冻结合同已经确定的规则与作者新增收口在 sharedDecisions.authority / uncertainties.U-AUTHOR-CHOICES 分开；作者新增收口尚需主代理并入同一候选后独立评审，不冒称已冻结或已批准。typed新错误名是拟定合同，不声称当前产品已有这些代码。

当前已观察真实产品链：chrome.action→sw→tool.html→tool-shell.createEnvironmentHost，仍只环境健康检查。createRunHost.start要求template并compileTemplate；SW未装配foundation broker；PagePort仍验证template/plan及采集分页/row条件。拟建门面/context/proxy/evaluator/registry/codec/script-editor本读点未存在；已映射不要求它们存在。每项productEntryChain明确planned-not-wired及现有缺口，不能把路径存在或原型成功算产品接入。

当前实际不确定项：T10 Worker/userScripts资格、最低/稳定Chrome与真实撤权恢复及清理仍未测；全部拟链尚未真实接入；captureVisibleTab没有document原子指向，竞态能力需实证；作者新增兼容收口尚未当前候选批准。server model、effort、runtime均unknown，无服务端解析证据。

|证据ID|实际读取路径|SHA-256|读取范围|
|---|---|---|---|
|EV01|/Users/shopme/.codex/prompts/executor.md|d74f32aac5824828c36abffa896d2bd2f3a54ee90f04971b8a724fb58bbf51a4|[1, 108]|
|EV02|/Users/shopme/Documents/workspace/opendesk-browser/docs/framework/prompts/goal-migration-v5.txt|f0c9de8f4a5c1b3fe49d11aaedd124d31984b0261ffa40db4716e8dc2f3b949d|[1, 412]|
|EV03|/Users/shopme/Documents/workspace/opendesk-browser/docs/framework/continue-in-new-chat.md|08b973f6be397fefb6dc4610ac27af9d41cdca9bc8dd26254ba99718ca53c055|[1, 366]|
|EV04|/Users/shopme/Documents/workspace/opendesk-browser/docs/framework/source-compatibility-ledger.json|11ac2101772f9ebeab69262dc71607003bfdca7ab585ad9b89d0eae239313fd1|whole JSON parsed; all 48 apiItems fields semantically read; fileRows only ChromePage selected|
|EV05|/Users/shopme/Documents/workspace/todo-user-vue/src-bex/ChromePage.ts|8ad986b65648b3a7bb0bb8287ec6fecc9a51fa05f840a76069e438f7563750d6|[1, 1153]|
|EV06|/Users/shopme/Documents/Codex/2026-10-02/opendesk-design-audit-continuation-01a0fc85/evidence/upstream-v3/compatibility-and-file-map.md|a73d2aecb41faa0c16b9e8a58271ee0dff8319117d10354dd2ca9c13fdce49b0|[1, 91]|
|EV07|/Users/shopme/Documents/Codex/2026-10-02/opendesk-design-audit-continuation-01a0fc85/evidence/upstream-v3/type-click-compatibility.md|602f9b63b685673bd6e18a54344bfdba2bed2bd4b8eb2613ae904d9b94708fb3|[1, 10]|
|EV08|/Users/shopme/Documents/Codex/2026-10-02/opendesk-design-audit-continuation-01a0fc85/outputs/compatibility-delta.md|777fb115b7852b0c9b9102683e0fdc6a81271e48b367457d6e67005198c00b34|[1, 15]|
|EV09|/Users/shopme/Documents/Codex/2026-10-02/opendesk-design-audit-continuation-01a0fc85/outputs/file-tasks.md|30a4e00a78d511169f38aa7017959984be6a88afdb04f474f65298874e1b7258|[1, 25]|
|EV10|/Users/shopme/Documents/workspace/opendesk-browser/src/platform/host/client.js|1e235f735cede75a6d5f7cce0cfcfc9dc7131fad4ac88307899b1d6603372a59|[1, 48]|
|EV11|/Users/shopme/Documents/workspace/opendesk-browser/src/platform/page-port/index.js|ca33704b03d7aec838d5fe92f592961c590d6f9d70410d22805d737907f5c691|[1, 222]|
|EV12|/Users/shopme/Documents/workspace/opendesk-browser/src/platform/host/broker.js|4755a3b608f7b0af0146514a9ee5d2cc793c25a0d9abbdbb123fce2059992c5a|[1, 134]|
|EV13|/Users/shopme/Documents/workspace/opendesk-browser/src/run-host.js|eff17d2253d8ac287e0c82557ecf705c4f88c333d66e0dcf0a16634e277b3294|[1, 67]|
|EV14|/Users/shopme/Documents/workspace/opendesk-browser/src/ui/tool-shell.js|c79258ab1f1749a2e13b95883f617026b72ddd81962ca1f5a43c10c538b7ab61|[1, 39]|
|EV15|/Users/shopme/Documents/workspace/opendesk-browser/src/sw.js|db7067ecd80cc99f822d1e99a90edbac00db41d83bad7e5335dcea7c962908f7|[1, 32]|
|EV16|/Users/shopme/Documents/workspace/opendesk-browser/src/platform/target/index.js|e1896d62230571e01347dcd548be51c236d7f44fcf140ff5c9c514c036f5055d|[[1, 43], [246, 291], [343, 359]]|
|EV17|/Users/shopme/Documents/workspace/opendesk-browser/src/agents/page-agent.js|d26f1b3531b783ea907f859850c8defe3b4118491fb2ee9c12cd14ecb9d1c966|[[100, 122], [145, 166]]|

|稳定ID / symbol|旧行号|决定|具体case|
|---|---|---|---|
|API:ChromePage.keyboard|26–28|保留并修正|CMP11-API01-OK, CMP11-API01-ERR, CMP11-API01-LIMIT, AUTH-API01-FENCE|
|API:ChromePage.environment|27–28|修正并限制|CMP11-API02-OK, CMP11-API02-ERR, CMP11-API02-LIMIT, AUTH-API02-FENCE|
|API:ChromePage.debug|28–28|保留并修正|CMP11-API03-OK, CMP11-API03-ERR, CMP11-API03-LIMIT, AUTH-API03-FENCE|
|API:ChromePage.constructor|31–43|保留并修正|CMP11-API04-OK, CMP11-API04-ERR, CMP11-API04-LIMIT, AUTH-API04-FENCE|
|API:ChromePage.handleMessage|85–92|修正并限制|CMP10-API05-OK, CMP10-API05-ERR, CMP10-API05-LIMIT, AUTH-API05-FENCE|
|API:ChromePage.operationCompleted|99–140|修正并限制|CMP10-API06-OK, CMP10-API06-ERR, CMP10-API06-LIMIT, AUTH-API06-FENCE|
|API:ChromePage.title|143–145|保留并修正|CMP01-API07-OK, CMP01-API07-ERR, CMP01-API07-LIMIT, AUTH-API07-FENCE|
|API:ChromePage.content|147–149|保留并修正|CMP01-API08-OK, CMP01-API08-ERR, CMP01-API08-LIMIT, AUTH-API08-FENCE|
|API:ChromePage.url|151–153|保留并修正|CMP01-API09-OK, CMP01-API09-ERR, CMP01-API09-LIMIT, AUTH-API09-FENCE|
|API:ChromePage.reload|162–168|保留并修正|NAV01-API10-OK, NAV01-API10-ERR, NAV01-API10-LIMIT, AUTH-API10-FENCE|
|API:ChromePage.goto|190–226|保留并修正|NAV01-API11-OK, NAV01-API11-ERR, NAV01-API11-LIMIT, AUTH-API11-FENCE|
|API:ChromePage.$|234–250|保留并限制|CMP02-API12-OK, CMP02-API12-ERR, CMP02-API12-LIMIT, AUTH-API12-FENCE|
|API:ChromePage.$$|257–277|保留并限制|CMP02-API13-OK, CMP02-API13-ERR, CMP02-API13-LIMIT, AUTH-API13-FENCE|
|API:ChromePage.$eval|280–311|保留并限制|CMP03-API14-OK, CMP03-API14-ERR, CMP03-API14-LIMIT, AUTH-API14-FENCE|
|API:ChromePage.$$eval|313–340|保留并限制|CMP03-API15-OK, CMP03-API15-ERR, CMP03-API15-LIMIT, AUTH-API15-FENCE|
|API:ChromePage.addScriptTag|358–420|保留并限制|RESOURCE01-API16-OK, RESOURCE01-API16-ERR, RESOURCE01-API16-LIMIT, AUTH-API16-FENCE|
|API:ChromePage.addStyleTag|424–465|保留并限制|RESOURCE01-API17-OK, RESOURCE01-API17-ERR, RESOURCE01-API17-LIMIT, AUTH-API17-FENCE|
|API:ChromePage.cookies|470–514|修正并限制|CMP04-API18-OK, CMP04-API18-ERR, CMP04-API18-LIMIT, AUTH-API18-FENCE|
|API:ChromePage.setCookie|532–568|修正并限制|CMP04-API19-OK, CMP04-API19-ERR, CMP04-API19-LIMIT, AUTH-API19-FENCE|
|API:ChromePage.deleteCookie|576–601|修正并限制|CMP04-API20-OK, CMP04-API20-ERR, CMP04-API20-LIMIT, AUTH-API20-FENCE|
|API:ChromePage.click|614–660|保留并修正|CMP09-API21-OK, CMP09-API21-ERR, CMP09-API21-LIMIT, AUTH-API21-FENCE|
|API:ChromePage.type|662–714|保留并修正|CMP09-API22-OK, CMP09-API22-ERR, CMP09-API22-LIMIT, AUTH-API22-FENCE|
|API:ChromePage.waitFor|717–727|保留并修正|CMP01-API23-OK, CMP01-API23-ERR, CMP01-API23-LIMIT, AUTH-API23-FENCE|
|API:ChromePage.waitForTimeout|729–731|保留并修正|CMP01-API24-OK, CMP01-API24-ERR, CMP01-API24-LIMIT, AUTH-API24-FENCE|
|API:ChromePage.waitForSelector|734–767|保留并修正|CMP01-API25-OK, CMP01-API25-ERR, CMP01-API25-LIMIT, AUTH-API25-FENCE|
|API:ChromePage.waitForFunction|778–804|修正并限制|CMP03-API26-OK, CMP03-API26-ERR, CMP03-API26-LIMIT, AUTH-API26-FENCE|
|API:ChromePage.screenshot|819–830|保留并限制|CMP04-API27-OK, CMP04-API27-ERR, CMP04-API27-LIMIT, AUTH-API27-FENCE|
|API:ChromePage.screenshotInWebview|832–835|明确不支持|CMP04-API28-OK, CMP04-API28-ERR, CMP04-API28-LIMIT, AUTH-API28-FENCE|
|API:ChromePage.screenshotInChrome|837–856|保留并限制|CMP04-API29-OK, CMP04-API29-ERR, CMP04-API29-LIMIT, AUTH-API29-FENCE|
|API:ChromePage.uploadFile|858–873|保留并限制|CMP04-API30-OK, CMP04-API30-ERR, CMP04-API30-LIMIT, AUTH-API30-FENCE|
|API:ChromePage._uploadFromBlob|875–890|保留并限制|CMP04-API31-OK, CMP04-API31-ERR, CMP04-API31-LIMIT, AUTH-API31-FENCE|
|API:ChromePage._uploadFromDataUrl|892–913|保留并限制|CMP04-API32-OK, CMP04-API32-ERR, CMP04-API32-LIMIT, AUTH-API32-FENCE|
|API:ChromePage._uploadFromUrl|915–919|修正并限制|CMP04-API33-OK, CMP04-API33-ERR, CMP04-API33-LIMIT, AUTH-API33-FENCE|
|API:ChromePage.eval|930–986|修正并限制|CMP03-API34-OK, CMP03-API34-ERR, CMP03-API34-LIMIT, AUTH-API34-FENCE|
|API:ChromePage.evaluate|989–1028|保留并修正并限制|CMP10-API35-OK, CMP10-API35-ERR, CMP10-API35-LIMIT, AUTH-API35-FENCE|
|API:ChromePage._execute|1032–1067|修正并限制|CMP01-API36-OK, CMP01-API36-ERR, CMP01-API36-LIMIT, AUTH-API36-FENCE|
|API:ChromeElement.page|1074–1080|保留并修正|CMP01-API37-OK, CMP01-API37-ERR, CMP01-API37-LIMIT, AUTH-API37-FENCE|
|API:ChromeElement.selector|1075–1080|保留并修正|CMP01-API38-OK, CMP01-API38-ERR, CMP01-API38-LIMIT, AUTH-API38-FENCE|
|API:ChromeElement.constructor|1077–1080|保留并修正|CMP01-API39-OK, CMP01-API39-ERR, CMP01-API39-LIMIT, AUTH-API39-FENCE|
|API:ChromeElement.click|1082–1084|保留并修正|CMP09-API40-OK, CMP09-API40-ERR, CMP09-API40-LIMIT, AUTH-API40-FENCE|
|API:ChromeElement.type|1086–1088|保留并修正|CMP09-API41-OK, CMP09-API41-ERR, CMP09-API41-LIMIT, AUTH-API41-FENCE|
|API:ChromeElement.uploadFile|1089–1091|保留并限制|CMP04-API42-OK, CMP04-API42-ERR, CMP04-API42-LIMIT, AUTH-API42-FENCE|
|API:Keyboard.page|1096–1099|保留并修正|CMP01-API43-OK, CMP01-API43-ERR, CMP01-API43-LIMIT, AUTH-API43-FENCE|
|API:Keyboard.constructor|1098–1099|保留并修正|CMP01-API44-OK, CMP01-API44-ERR, CMP01-API44-LIMIT, AUTH-API44-FENCE|
|API:Keyboard.type|1102–1106|保留并限制|CMP01-API45-OK, CMP01-API45-ERR, CMP01-API45-LIMIT, AUTH-API45-FENCE|
|API:Keyboard.press|1108–1119|保留并修正并限制|CMP01-API46-OK, CMP01-API46-ERR, CMP01-API46-LIMIT, AUTH-API46-FENCE|
|API:Keyboard.down|1121–1126|保留并限制|CMP01-API47-OK, CMP01-API47-ERR, CMP01-API47-LIMIT, AUTH-API47-FENCE|
|API:Keyboard.up|1128–1133|保留并限制|CMP01-API48-OK, CMP01-API48-ERR, CMP01-API48-LIMIT, AUTH-API48-FENCE|

完成条件是本次两份作者草稿的结构/追溯完整。下一步由主代理整合主ledger/主候选；本作者未修改审批/门禁，不启动F1/F2/F3、不自评通过。

已按主writer建议提供 apiItems(48)，逐项id/newModules/oldBehavior/behaviorDecision/testCases(id,input,expected,required)/completionCondition/source.line/source.hash；保留全部原api字段名（新路径与状态修正，原mandatoryTest/contract只作历史引用，具体testCases才是验收规格）。completionCondition是逐项条件数组。

完整读取当前 execution-plan.md（69行）与 compatibility-delta-v5.md（27行），只作文件整合对照，不扩大代码审计。eval歧义码统一 E_LEGACY_AMBIGUOUS_EXECUTION；Backspace按该差异:14明确修为焦点可写value去尾Unicode码点，原不改值行为仍保留在oldBehavior；不把普通Keyboard.type变成输入值插入、不承诺选择区或native编辑。当前候选审批仍pending。

EV18 /Users/shopme/Documents/workspace/opendesk-browser/docs/framework/execution-plan.md SHA-256=e8d6648b68704aed58877c5ff98269ef3e0f6384cb9ccf895d0678e2465febc6，完整读取1–69；本作者未修改。

EV19 /Users/shopme/Documents/workspace/opendesk-browser/docs/framework/compatibility-delta-v5.md SHA-256=c06e127fc78a2b89b903b350148ed202aac350c1afe1a16a96d19120c9ee757b，完整读取1–27；本作者未修改。

最终仅对两份产物做结构校验：48个唯一API:完整symbol、192个唯一required case、逐项保留全部原api字段名与source.line/hash、运行状态全部not-tested/false。逐项pending字段明确真实竞态/后端资格/作者细化审批由main-author处理，decisionAlreadySpecified=true；没有未来文件缺失型计划阻断。本任务到此交付，不扩大目标工程审计。
