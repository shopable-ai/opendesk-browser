# ScrapyJS 的 AI Chat 任务边界

本文件只补充本项目反复漂移的差异规则；仓库根 AGENTS.md 和最新用户明确要求优先。

- 修改 Chat 前先读 [当前方案与任务清单](docs/SHARED-AI-CHAT-CONTRACT.zh-CN.md)，核对本轮任务编号、下一条用户操作和当前失败/未验证点。旧 AI/代理/云架构第 0 节不是当前产品要求。
- 唯一业务 owner 保持本目录。正式 `src/main.jsx` 与离线 `preview/entry.jsx` / `preview/dev.jsx` 有意不同：后两者使用 AI 占位，不能拿它验收完整 Chat 或改成正式入口。
- 保留框架 `SharedConversationDock` / `SharedConversationFrame` / 每实例 session。设置与来源属于可信 Host 唯一入口，不在工具内复制设置表单、Provider 存储或书签私有 consumer；不写 CSS 覆盖公共聊天布局。
- Chat 保持消息、输入、发送/停止、开合与必要错误恢复。明确修改经工具校验后同步原业务草稿；普通解释不写入。不从旧方案或旧测试恢复技术审阅、撤销区、重复保存/采集/导出工具栏或自动运行。
- 配置修改经原 `business.config.propose/apply` 与模型身份检查；AI 内容不授予权限。安装身份、修订、Provider generation、取消、unknown 和迟到回包保护不放宽。
- 布局或设置故障先复现并找第一个错误边界，再由对应 owner 修复；不默认重画整个聊天框、不复制公共组件、不另建尺寸管理器。公共修复按原平台 Skill 与定向验证处理。
- 运行、构建、包和预览的真实命令由项目 README 维护；本轮只验证改动所需行为。方案评分、离线截图、安装态与真实 AI 分开记录。
