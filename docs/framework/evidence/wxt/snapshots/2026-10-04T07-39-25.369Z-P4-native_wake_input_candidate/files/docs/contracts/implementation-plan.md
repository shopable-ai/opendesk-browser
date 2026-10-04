# 阶段01实施交接计划（v5任务顺序，合同1.0.0）

唯一产品为当前目录。执行顺序 **01→02A→02B→03→04**，⑤CodeGraph与来源复用审计并行，但必须由01审阅后才能ready。01只交付方案/合同/输入与静态验证，无生产源码或manifest。每阶段核前序真实handoff、版本/hash、失败/pending，再独立创建自身Goal；环境通过、公共底座通过与完整产品通过分别记录。

02A：独占package/lock/build/pack/manifest、工具窗口壳、固定模块槽、静态注入与目标健康探针，tests/environment、docs/environment。交付 **docs/environment/handoff.json**，必须有真实构建、CSP/资源/普通Chrome加载证据；empty业务槽明确MODULE_NOT_INSTALLED。没有RunHost loop/journal/IDB/下载/授权真实实现，不能报告可靠底座或产品完成。框架采用原生MV3、既有锁定webpack/Terser，保留JS，不强迁UI或引入WXT。

02B：在02A真实环境上接管根公共配置/manifest/build、src/run-host.js、src/sw.js、src/platform/**、固定page agent公共能力、contracts、storage/迁移/命令/目标/下载/授权、foundation tests/docs。只按①认可⑤映射迁入或薄适配公共浏览器能力，不能按同名复制或旧TS覆盖bundle。交付 **docs/migration/migration-ledger.json** 和 **docs/foundation/handoff.json**；明确每个来源hash、keep/adapt/drop与fixture、实际已实现公共能力。RunHost独立loop、SW短命令、单IDB、stop/gap/围栏退役、stage/seal、Artifact/attempt/receipt和Entitlement是02B真实验收范围。

03：只写src/features/scraping/**、tests/scraping/**、docs/scraping/**和领域fixture；核02B真实handoff及合同版本/hash/能力。选区UI、TemplateCompiler、Scrapy Rule/Request/Item可用部分、受限分页/pipeline、formatter与模板产品归03。固定槽接入一个扩展，不新建owner/ChromePage/broker/DB/UI应用；公共文件需求登记integration-request给02B职责。交付 **docs/scraping/handoff.json**，必须包含普通Chrome全旅程与具体pending。

04：核02B+03真实交接，独立验收最终单扩展。tests/acceptance、docs/acceptance记录M01–M11实际证据；归因后串行修复对应责任文件，不并发改公共根。交付 **docs/acceptance/report.json**。M12商业证据独立pending，不能由技术通过宣布可收费上线。

公共合同先由01定版，01交接后02B是唯一公共合同作者。任何变化需记录integration-request/决策理由，更新实际版本/hash、静态fixture/影响测试及handoff，不另建冲突接口。02A模块槽仅工程占位，02B接管公共桥，03最终接管领域index；责任交接顺序清楚。

02B实现顺序：核02A/⑤ → 唯一IDB与失败迁移保护 → host/sender/target/slot → journal/stop/未知退役 → stage/seal/reader pin/配额 → Artifact/attempt/晚到/重导 → Entitlement与保留/删除 → 单元/真实IDB/普通Chrome底座测试。03顺序：核02B → 认可UI/选区迁入 → 统一compiler/完整迁移输入 → 命名模板列表/immutable revision → 专用tab runner/分页 → formatter/逐卷回执UI → 两次run/10页×100行/真实授权站点旅程。

来源更新只读对比固定基线与source-deltas/⑤使用代，记录实际hash和影响测试；不清理、不覆盖三来源，不全库同步SDK，不push/发布。原18:29的442文件审计不能证明后来的源码未变。所有未运行的生产测试继续planned/not-run，旧评分/mock/CFT探针不作产品证据。

⑥独立准备开发浏览器、受控站点和加载/下载探针；真实02A/02B/03构建交接后，由各owner向登记⑥发送附buildHash/路径的里程碑测试消息。⑥只写自己work/outputs；产品修复归对应owner，04使用独立profile或串行锁、共享可审查证据但独立最终验收。CFT工具环境测试不代替B120/B-STABLE普通Chrome门禁。01已直接读取父对话真人消息01a0f8f5-3190-7dc1-bd57-fde08d550136核此授权。
