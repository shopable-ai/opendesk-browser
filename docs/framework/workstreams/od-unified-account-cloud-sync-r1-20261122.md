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
