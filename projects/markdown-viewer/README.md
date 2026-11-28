# Markdown Viewer · Markdown 实时阅读器 R1

任务：OD-MARKDOWN-VIEWER-LIVE-RENDER-R1

目标：用户直接打开本地 .md / .markdown，AI 或编辑器保存后原地址自动更新 HTML；不修改文件、不运行本地服务、不上传文档。此项目为 OpenDesk 内置可信内容入口，不是独立编辑器或独立扩展。

## 使用

1. 按仓库根目录现有构建流程生成并加载 OpenDesk MV3 扩展。
2. Chrome 打开 chrome://extensions；Edge 打开 edge://extensions；进入本扩展详情并开启「允许访问文件网址」。
3. 直接打开 file:///.../example.md。阅读器提供目录、原文、更新开关、状态、宽度、主题和代码复制。
4. 在外部编辑器保存，前台每秒检测；内容相同不重绘，失败保留旧文并重试。后台暂停，切回立即读取。权限被关闭时可在扩展选项页检查并按提示恢复。

## 可交互预览

下载 preview/index.html 并直接在浏览器打开，无需服务器。底部测试区模拟保存、删除/恢复及权限变化；正文、目录、主题和更新逻辑使用与正式阅读器同一源代码。预览不读取任何本地文件，不能代替浏览器验收。

修改源文件后在仓库根目录执行：

    node projects/markdown-viewer/preview/build.mjs

## 测试

    node --test projects/markdown-viewer/tests/core.test.mjs
    node --test projects/markdown-viewer/tests/render.test.mjs

后者依赖根仓库现有 jsdom。完整构建按根 package.json 与 AGENTS.md；真实浏览器可执行：

    python3 projects/markdown-viewer/tests/browser-smoke.py /absolute/path/to/unpacked-extension

该脚本需要 Python Playwright 和本机可用的 Chromium；可附加 Chrome/Edge 可执行文件路径。人工开启文件访问权限，不使用绕过安全策略的启动参数。脚本只修改临时文件。T11 剪贴板、T16 拒绝/授权、T22 大文件性能与 T23 禁用仍需人工补测。

## 当前交付状态

- 正式源码、构建接入、权限提示、MIT 许可、同源预览和验收脚本已纳入版本。
- Node 22 定向核心测试 5/5 通过；隔离 JS 另完成 21 项断言及 3 项成熟解析/分词检查。
- 当前执行容器的真实 Chromium 对 file:// 导航返回 ERR_BLOCKED_BY_ADMINISTRATOR，无法验证扩展注入或本地文件读取。未运行全仓构建、jsdom 测试或完整浏览器脚本；不将上述测试记作浏览器 PASS。
- 用户原始文件不在当前执行环境内；真实文件验收未完成。
- 目标、研究、边界及验收清单见 REQUIREMENTS.zh-CN.md。
