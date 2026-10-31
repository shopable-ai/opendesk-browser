# 2026-10-30 · 网页提示的真实扩展证据

阶段：核心开发。运行环境为既有 `npm run dev` 持续开发，输出 `/Users/shopme/Documents/workspace/opendesk-browser/dist/development`；writer PID 94442 的锁指向本仓库，未启动第二 writer。实际侧栏来自扩展 `ccfcjegpkdlgbclopjmadlcjedelidmf`，调试页观察到「开发服务已连接」。扩展管理页的实际加载路径未另行读取，不以目录名替代该项证据。

用户纠偏：自建 HTML 不能证明功能属于扩展。因此主要证据改为普通网站 + 真实扩展侧栏 + 页面即时反馈，保留网址；离线页面只用于组件软件回归。

## 实际操作

1. 从扩展中心对官方「视频倍速」1.2.0 完成既有审阅安装，打开工具；全局倍速保持关闭。
2. `https://www.w3schools.com/html/html5_video.asp`：点击侧栏 1.25×，独立读回 1.25×，页面显示「视频倍速 · 1.25×」。本机截图：`artifacts/page-toast-preview/extension-w3schools.png`。
3. `https://www.w3.org/2010/05/video/mediaevents.html`：点击侧栏 1.5×，独立读回 1.50×，页面显示「视频倍速 · 1.5×」；网页自己的 playbackRate 表格也显示 1.5。本机截图：`artifacts/page-toast-preview/extension-w3c.png`。

截图为当次本机产物，不是提交的发行资产。未录到截图瞬间完整 development revision；不能把后续发布指纹冒充截图的精确候选身份。W3C 操作前九位置与隔离修改已由既有 watcher 发布，后续输出中 Host SHA-256 仍为 `ddaa3f2520e717d5feafd553e493377900eb3778358fdeeedc81e3f5a421d202`，对应源码映射已与当前 Toast/适配器/视频 Host 逐字核对。

## 软件验证与边界

- 定向 Node 22 项通过：Toast 生命周期/九位置/非法选项、精确目标与授权、固定 helper、独立读回和提示失败不重放写入。
- `node tests/environment/page-toast-browser.mjs`：Chrome 149.0.7827.55 独立 headless 24 项通过，包含强冲突样式、普通/容器全屏九位置、布局/焦点/输入/点击、替换计时与 pagehide。该 fixture 不算真实扩展或真实网站证明。
- 可调位置/类型/时长的 Page 教学项目为 `examples/programs/page-toast-demo/`，用原构建器编译；不新增特权接口、安装格式或专用测试网页。直接执行 24250 字节编译产物的独立 DOM 回归通过：九位置、四类型、全部时长选项、纯文本、自动消失、关闭清理及旧按钮失效。本机临时脚本为 `artifacts/programs/page-toast-demo/dom-regression.mjs`。其原生 USER_SCRIPT 演示尚未运行，共享 Chrome 出现并行 UI 切换后停止争用。
- MDN 的 srcdoc 视频示例未识别到可调视频；直接打开原始 mp4 文档时活动主文档未确认。这些不是 Toast 成功证据，本轮不扩展修复媒体选择。
- 本次没有验证所有网站、真实 Mac Chrome 全屏/九位置/四类型、S/D/R、生产包、IME、权限完整矩阵或评分；这些仍为 NOT_TESTED / NOT_SCORED。

## 后续包更新：1.2.1

用户随后要求编译 JSON 并更新版本。已将唯一配置和精确官方版本准入同步为 1.2.1，权限及沙箱执行资源保持不变，更新功能说明；同步审阅后的 admission source pin。候选经当前定向 101 项测试后晋升，`--check-project` 返回 `PROJECT_PACKAGE_MATCH`；正式 JSON 为 27272 字节，SHA-256 `e60d908c83f268de8399bcf69354ee320f1c3955370c31f5c682a2ae4e54929d`。

现有 writer 的目录刷新因并行 AI Proxy 的 `src/App.jsx` 与编译回执不一致而失败；未绕过检查、覆盖对方产物或停止服务。`dist/development` 内包/目录/发布指纹仍为 1.2.0，内置资源同步为 BLOCKED，实际 1.2.1 安装升级为 NOT_TESTED。上文两个网站证据仍属于 1.2.0，不升级为新包的原生验收。

2026-10-31 后续：上述为当时观察。框架同步阻塞已修复，原 writer 已发布 1.2.1，真实官方导入升级与 W3C 1.75×/网页独立读回/Toast 已完成；当前证据见 [1.2.1 导入与真实操作记录](import-1.2.1-20261031.md)。本页原 1.2.0 证据和未测范围不改写。
