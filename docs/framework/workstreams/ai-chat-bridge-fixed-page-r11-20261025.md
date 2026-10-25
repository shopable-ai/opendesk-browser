# AI Chat Bridge R1.1 — 固定网页读取 Task Candidate
日期：2026-10-25；owner：本 AI Chat Bridge 对话；唯一可写分支 main。
业务纠偏：首个 Demo 不开发百度搜索/爬虫，改为读取固定 https://httpbingo.org/html 的 URL、标题、H1 与最多 800 字正文。
本轮写入：examples/tasks/page-read-fixed.js、examples/tasks/page.read.fixed.v1.opendesk-task.json、src/native-agent/chatgpt-task-request.js、tests/environment/chatgpt-fixed-page-r11.test.mjs、本记录。共享 Host、Provider、Send Queue、Workflow 均只读。
保留旧版 baidu.search.top3 的 sourceHash、安装身份和协议解析；新的 page.read.fixed@1.0.0 使用同一个 opendesk.task.request.v1，args 必须为空，不允许模型指定 URL、selector 或 JS。
新 Task sourceHash：c2684b24d3e6ef9b0319703661d8d7b53014df60533608bcd697361cc70a99f4。manifestHash：14261d871732d67c97a8fa4e398ec8d2852e025d0ff4ff02e08546ac530de505。
本机证据：在与仓库文件内容等价的隔离 Node 副本通过 6 项模拟/Hash/协议定向检查；GitHub 远端提交不代表用户 Mac 源码测试、真实网站运行或 Task 安装验收。
状态：SOURCE_CANDIDATE。Task 导入、Verification、Available、Installed 均 NOT_TESTED；ChatGPT assistant DOM 触发、受信授权、独立 RunHost、Durable Result 和向原官网对话真实发送仍 MISSING。未生成最终本机验收交接；下一轮只能增量打通缺失链路，不再重建百度、Send Queue 或 Host。
冲突与资源：无法访问 Mac 本地 git status / npm watcher / Chrome Profile，亦无本机共享资源占用证据；只在远端 GitHub main 写入本轮文件，不改其他 Agent 工作范围。
