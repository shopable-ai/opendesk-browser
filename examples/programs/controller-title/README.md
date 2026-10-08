# 多文件 Controller 示例

运行 `node scripts/build-program-project.mjs examples/programs/controller-title`，生成 `program.js` 和 `program.opendesk-task.json`。`.js` 可通过「发现 → 导入」的独立完整目录转交同窗口 Sidebar「开发」再点击旧版 **「运行草稿」**；JSON 可通过同一完整任务目录导入为 **Candidate（待验证）**；构建不会让任务自动变为 Available 或 Installed。依赖由开发者在可信环境使用 npm ci --ignore-scripts 安装，构建不执行第三方安装钩子。
