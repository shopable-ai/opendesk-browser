# R2 macOS 优先续接证据

此次只补实时只读目录的编辑授权指引，更新 Mac 运行说明和本地 Codex 任务；核心 R2 已由远端 `79c0cabd` 交付。

`verification.json` 记录当前产品输入和生产包；`build-production.json` 是原构建器的完整回执，`production.log` 与 `pack.log` 为原始输出。原 R2 双构建证据保留，此次只重建生产包。

`access-note-result.json` 使用实际 workspace HTML/模块验证只读提示、断线/目录权限切换与已有 R17 状态；`workspace-ui-result.json` 复验审阅/采用零写入、保存读回与冲突；`standalone-result.json` 使用生成后的实际 bundle。均为 Node DOM 模型，无真实 Chrome、用户手势、Mac Native 或 ChatGPT 页面调用。

`*.mjs.txt` 保留驱动原文，实际执行位置为 `docs/framework/evidence/webcodex-chat-edit-r2/macos-followup/`；相对 import 按原位置解析，使用已有缓存的 linkedom，不增加项目依赖。原始日志保持字节，包括构建器输出的行尾空格。

当前 Mac 原生闭环交给仓库内本地验收任务执行。各文件 SHA-256 见 `manifest.json`。
