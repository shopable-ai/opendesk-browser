# OD-UNIFIED-ACCOUNT-CLOUD-SYNC-R1 · 设计阶段记录

- 负责人：本轮 ChatGPT 设计工作；仅针对本轮独立文件和非重叠 README 链接负责。
- 日期：2026-11-22。
- 目标：需求树、功能树、公共身份/权益/同步/备份设计与连播助手接入边界；不运行代码、部署服务、发布产品或承诺云端已实现。
- 用户授权：方案与文档可逆更新；仅写 OpenDesk Browser main，不创建分支或 PR。
- 读取过的证据：根 AGENTS.md；manifest.json；docs/api/sidebar-tools.zh-CN.md；projects/video-auto-skip/{README.zh-CN.md,REQUIREMENTS.zh-CN.md,tool.config.json,src/rules.js,src/main.js,src/page/{local-player,iyf-player,main}.js}；projects/mouse-gestures/src/main.js；官方 Chrome Storage/Identity/MV3 生命周期文档。
- 写入范围：docs/architecture/unified-account-cloud-sync-r1.zh-CN.md；projects/video-auto-skip/README.zh-CN.md 的一条设计文档导航；本记录。
- 共享契约：只提出候选 schema 与 API，不把尚不存在的云同步能力表述为已发布 OpenDeskTool 接口；不更改现行存储或权限。
- 边界：同期其他任务的源码、市场、云控、AI Proxy、构建、测试、发行与现有未提交改动均保持不变。
- 结论与验证等级：DESIGN_PROPOSAL；真实后端、登录、跨机器、浏览器生命周期与会员支付均 NOT_TESTED。
- 协作注意：main 在只读审查期间发生 HEAD 前进；创建/更新目标时基于实时 GitHub 内容 SHA 防止覆盖，发现目标已由他人修改则停止重写该路径。

## R2 设计续接（2026-11-22）

- 继续原架构决策，在唯一公共方案 docs/architecture/unified-account-cloud-sync-r1.zh-CN.md 追加 R2 章节，不另外建立重复的 R2 方案文件；变更属于 DESIGN_PROPOSAL。
- 业务细化：N01–N14 需求→功能→owner 映射、J1–J5 用户旅程、账号 A/B 本地分区、旧设备 tombstone、持久 outbox 双写恢复和已存在 rules.v1 单键容量闸门。
- 仓库额外核验：services/analytics/README.md 为匿名指标 Worker；services/cookie-share-relay/README.zh-CN.md 为 Cookie 分享服务；均非现成账号/VIP 后端。根 manifest.json 当前无 identity 权限；独立扩展 OAuth 接入需要另行设计真实扩展 ID 与权限。
- 变更范围：仅公共方案本文、此工作流记录；未修改业务源码、工具包、后端或测试。
- 后续实施闸门：先核实宿主跨工具合法存储观察与写回、真实已部署后端、跨设备媒体键稳定性及存储额度。**M0a 连播助手第一消费者验证不等于公共 MVP 已完成，第二消费者接入是 M0b 共用能力验收闭环。**
- 测试：R2 T16–T27 与 R1 T01–T15 仍全部 NOT_TESTED。


## R3 技术设计推进（2026-11-22）

- 继续用户确认的设计阶段：R1–R3 继续共用 docs/architecture/unified-account-cloud-sync-r1.zh-CN.md 这一权威文件，不建立第二套方案、不修改业务实现代码或发行资产。
- 本次只读核验 main 初始 HEAD：3eb43c3dd35f5fc29a726a635e955107f2f1363a；并行 main 在写入期间可能前进。
- 关键证据：工具侧 src/ui/sidebar-tools.js、网页伴随模块 src/scripting/user-scripts/app-page-contract.js、Browser SDK src/ui/sidebar-tools/storage-state.js 都可触达同一工具私有键；仅观察 Sidebar Save 按钮绝不充分。src/sw.js 有生命周期事件但不代表已有云同步。services/analytics 与 services/cookie-share-relay 不是现成身份/会员系统。
- 选型优先验证已部署后端；若没有，Supabase Auth + PostgreSQL + 最小 API 是首轮候选，但其 OAuth 2.1 Server 当前官方文档标为 Beta，正式独立扩展 OAuth 不得跳过专项验证。Better Auth+Postgres 为有 Node 运维能力的备选。
- R3 交付：可实施 SQL 逻辑表、API 草案、账号/产品同意/权益三级安全域、可信客户端本地分区、持久 outbox、S00–S09 开发任务树及负例验收。
- 本轮写入只为 docs/architecture/unified-account-cloud-sync-r1.zh-CN.md、当前进度记录；所有实现、供应商申请/购买、部署、域名、OAuth 客户端创建、测试仍 NOT_IMPLEMENTED/NOT_TESTED。
- 进入实现之前先取证 S00：三个存储入口归属和真实设备/Extension ID、已部署后端、8 KiB 单键/32 KiB 总配额增长风险。通过 S01 认证 spike 再冻结供应商与生产 API。
- 公共 MVP 合格要有连播助手首个消费者和 mouse-gestures 第二个独立 Adapter 的真实验收；无 S08 仅可称单消费者样板，不宣称跨产品公用平台完成。
