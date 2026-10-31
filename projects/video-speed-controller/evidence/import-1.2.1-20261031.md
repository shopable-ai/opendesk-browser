# 1.2.1 导入、运行合同与真实倍速操作

日期：2026-10-31（Asia/Shanghai）。阶段：核心开发，非 production 正式验收。

## 真实入口与结果

- Chrome 实际扩展 ID：`ccfcjegpkdlgbclopjmadlcjedelidmf`，名称 OpenDesk Browser Developer，扩展版本 `0.1.0`。扩展详情页实读加载目录为本仓库 `dist/development`（Chrome 显示 `~/文稿/workspace/opendesk-browser/dist/development`）。
- 复用原 `npm run dev` writer PID `94442` 和原输出目录。通过 WXT 自身配置恢复及安全重载采纳代码；没有终止/另起进程、手写 dist 或重装扩展。
- 在原「扩展 → 筛选和管理 → 导入扩展」选择项目唯一正式包，审阅显示 `1.2.0 → 1.2.1`、权限未变化、原有应用数据保留、`OpenDesk 官方发行 · 安装包已校验`，随后完成确认更新。
- 打开工具的原生标题为 `视频倍速 · v1.2.1`。普通刷新 W3C 测试网页后点击侧栏 `1.75×`，侧栏显示 `预设 1.75× · 已读回 1.75×`；网页自己的 Media Properties 表格 `playbackRate` 显示 `1.75`，同时页面 Toast 显示 `视频倍速 · 1.75×`。全局倍速保持关闭；没有新增网站授权。
- 网站：<https://www.w3.org/2010/05/video/mediaevents.html>。本次验证的是 HTML5 元素速率设置与独立读回，不声称已验证长时间持续播放或全部网站。

本机证据：`artifacts/video-speed-import-1.2.1/review.png`、`review-ax.txt`、`speed.png`、`speed-ax.txt`、`verified-ax.txt`。截图/AX 是本机临时证据，不是正式发行资源。

## 身份与来源

正式包与 `dist/development/official-tools/video-speed-controller/video-speed-controller.opendesk-tool.json` 逐字节一致，均为 27272 字节，SHA-256：

`e60d908c83f268de8399bcf69354ee320f1c3955370c31f5c682a2ae4e54929d`

唯一打包器 `--check-project` 返回 `PROJECT_PACKAGE_MATCH`；没有重打或改变原 1.2.1 包。

真实审阅技术详情同时显示上述候选摘要、工具格式 `opendesk.sidebar-tool.v1`、实际扩展 ID/版本及安装器与 Worker 的能力合同摘要：

`b1ea893e1feeda7ba29f27c61e4966ce8e67c2510ee45190ff8d82e1db2ab797`

调试页实读「开发服务已连接」，revision 为：

`788800fd97ca6d51ba6872e22aa19ff3c65d2f390db17bea8ef3054af23d9066`

该 revision 与当时磁盘发布标记一致；合同摘要也与当前唯一校验器派生结果一致。合同核对证明双方声明的格式、能力、预算及 SDK 版本一致，不证明整个运行 bundle 字节、所有 Host 操作或既有网页注入代码同版。官方来源和精确版本准入仍各自独立核验。

## 已证实的问题及修复

最初选择同一 1.2.1 文件时，本轮没有复现 `page.videoSpeed` 未支持错误，不能断言原报错来自哪个旧实例。实际复现的是：磁盘目录仍为 1.2.0，使合法 1.2.1 包只显示本地来源；原 writer 因 AI Proxy 的未完成编译回执而不能发布其他工具；`projects/` 未被官方资源 watcher 覆盖。

修复让官方生产者优先验证项目唯一正式包并保留原字节，指纹跟踪正式包，坏包不回退源码；没有正式包的项目继续执行原源码/编译回执检查。Watcher 补齐 `projects/`，配置恢复在原写入队列内刷新发行资源。

恢复时另实测到原进程缓存旧构建模块，新 `network-request` 入口被旧白名单拒绝，开发输出暂不可用。开发专用 WXT 本地模块现在每次配置恢复选择同一代新构建 hooks 及仓库内传递模块，原 PID 成功生成并发布完整输出。此机制不替换 runner、edition、manifest 或输出路径，也不承诺刷新 WXT 首次捕获的 Vite 基础配置。

导入在能力解析前、审阅时和提交前核对实际 Worker 合同；不一致、不可用与真正未知能力分别诊断。包内 Sender、安全重载、正式来源、精确版本、安装实例与撤权校验保持有效。

## 定向验证与边界

- 官方包生成/来源、坏包保留、`projects/` 晋升同步、合同与能力诊断：44 项通过（含模块加载器最初 1 项）。
- 模块加载/WXT 接入、edition 与开发安全刷新：43 项通过（含上述加载器 1 项及新增 WXT 接入 2 项；不重复累计）。
- 本地导入审阅、运行合同变更拒绝提交、官方更新/来源刷新和取消保留：9 项通过。
- 视频身份、目标绑定、独立读回、撤权、Toast 失败不重放：24 项通过。
- 本轮代码 diff 检查、配置语法检查和原 watcher 实际构建发布通过。未运行完整 CI、production 验收、评分或缩放/宽度矩阵。

探索性运行完整 Host 测试时还遇到与本轮无关的旧 Prompt 准入/版本断言及旧 320 KB 断言；未扩大修复，也不将该整文件报告为通过。当前交付以以上定向验证及真实 1.2.1 操作为证据。
