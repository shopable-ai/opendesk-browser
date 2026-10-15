# Sidebar UI R31 · 单一 Design System 收敛记录

日期：2026-10-15。负责范围：本次 R31 GitHub 直连执行会话；唯一写入分支 main。
写入文件：src/ui/{tool.html,tool-shell.css,design-system.css}、R27/R20/R28、UI Skill、AGENTS.md、五项 Node 测试、R19 静态 Chrome 验证脚本、R21 UI CI、本记录。
不修改：SDK、安装、RunHost、Service Worker、用户工具 sandbox、目标网站注入或 Chrome 权限。

## 冲突与处理

- 既有公共折叠标题默认 40px，开发页以 ID 额外覆盖 44px、Hover 和圆角；提升为同一个共享组件，删除开发页外观覆盖。
- 旧组件测试把「当前网页」同时视为一级卡片与无边框 flat；R19 旧半径断言也将其误视为无边框。统一为一级 od-disclosure。
- 开发页源码来源/网站上下文、状态/结果分别用 od-stack 的 8px 同组间隔；独立区块 16px；卡片内边距由公共组件负责。
- 内部 SHA、编译产物与本地高级诊断使用 flat，减少嵌套边框；保留所有执行 IDs 与业务按钮。

## 实际验证级别

- SOURCE_EDIT：代码、文档及测试契约已按远端 main 快照更新；应以最终 commit SHA 为候选身份。
- SOURCE_GUARD：增加结构性 CSS 所有权断言，修正旧矛盾测试，并把两项新门禁接入既有 R21 UI CI；是否通过以实际 Node/CI 运行结果为准。
- STATIC_MARKUP_CHROME：R19 测试脚本增加跨开发/云控两 Tab computed-style 与 Hover/主题差异检测；**增加测试代码不等于已经实际运行**。
- MAC_LOCAL / DEV_WATCHER / BUILDS / NATIVE_CHROME：当前执行环境不能访问 /Users/shopme/Documents/workspace/opendesk-browser、现有 npm run dev watcher、dist/development 或用户 Mac Chrome Profile。无相同候选证据均为 NOT_TESTED。

本记录不是平行设计规范。唯一运行时样式来源仍是设计 token + design-system；产品词义仍以 R4 为准。
