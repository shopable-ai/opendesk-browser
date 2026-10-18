# Stay Focus R4 运行需求文档保存记录

- 日期：2026-10-18；状态：COMPLETE（仅文档写入，不代表 R4 产品实施或验收）。
- 任务：把 Stay Focus 作为多运行环境的独立扩展应用的关键产品需求与架构边界正式归档，避免新对话重新推导或把 SDK 等同于后台运行环境。
- 写入范围：examples/sidebar-tools/stay-focus/REQUIREMENTS.zh-CN.md（新建）；examples/sidebar-tools/stay-focus/README.zh-CN.md（仅添加文档入口）；本工作流文件。未修改产品源码、包、SDK、Service Worker、安装器、React UI。
- 分支/来源：远端 GitHub main；写入前读取 main HEAD、AGENTS.md、parallel-development.md、R2 README、真实 tool.config.json 与服务 / SDK 的源码。未获得用户 Mac 本地 git status / watcher / CFT profile，本轮不声称本机环境状态。
- 并行资源：不占用浏览器 Profile、端口、共享 dist/ZIP、工具正式包或本机 Git 索引；仅通过经 SHA 核对的远端 Git 更新；若 HEAD 漂移则拒绝强推或覆盖。
- 记录结论：公共 SDK 不能直接代替应用后台运行环境；R4 优先有限声明式 Managed Background 能力，保留隔离事件驱动 JS / 第一方预编译 / 独立 MV3 三种清晰边界；普通 JSON 仍无法动态执行任意特权后台代码。
- 验证：只读源码及文档链接/内容核对；没有运行产品测试、构建、Chrome 原生安装/额度耗尽/撤权/独立升级，统一为 NOT_TESTED。
- 下一轮：实现并验收真实后台能力、迁移运行链、应用包只升级证明。不要重做 R2 目录迁移与全工具审计。
- 释放：无持续占用的文件、Git 事务或测试资源。
- 首次写入基线 HEAD：9842277266087b6784f98afbb39fd251f892130d。
