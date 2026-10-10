# OpenDesk Browser 独立网页 SDK axiosx 自动安装 R1｜主分支实施与证据

日期：2026-10-10。分支：`main`。本记录只覆盖独立网页 SDK 的自动加载、最小 HTTP 授权与握手恢复；不替代整个 OpenDesk Browser 的 F3、ZIP 安装或 95+ 最终验收。

## 交付结论

- 扩展安装并获得 Chrome 站点访问后，`manifest.json` 的两个固定本地脚本分别在 HTTP(S) 文档的 `ISOLATED` 与 `MAIN` 世界自动运行。无需到「高级/诊断 → 独立网页 SDK」为每个文档手动批准并安装，即可在页面使用 `OpenDeskSDK` / `axiosx`。
- 仅注入 API 外观，不会在打开网页时发送 HTTP。第一次显式调用 `ready()` / `axiosx` 时，后台依据真实 sender、tab/frame/document、Chrome 当前原生权限、Authority 与原有 Broker 建立最小 `network` 范围。
- 普通站点默认只允许精确同源 HTTP；`http://127.0.0.1:43111/demo-form.html`（含 43112 对应入口，顶层 frame）额外默认允许 `https://httpbingo.org` 和 `https://api.ipify.org` 两个已审查的测试 Origin。对任意其他跨站目标、存储、通知、Cookie、GM_* 或 Native 等高权限不自动授权。网络驱动继续 `credentials:omit`、`redirect:manual`。
- 当前文档主动撤权后不会悄悄重新授权；Worker 重启仅能按固定默认范围恢复，不恢复手工扩展过的权限；旧请求 ID / 未知副作用不可被自动重放。
- 第一次 SDK Hello 若因临时 Worker/生命周期竞态失败，下一次用户显式调用可重新握手，不自动重复已经派发的 HTTP 请求。
- 固定网页 SDK 自动注入与 Controller Worker 的既有 `axiosx` 是不同执行上下文；Controller 不依赖网站 MAIN SDK。

## 关键提交

- [自动注入、自动最小网络授权](https://github.com/shopable-ai/opendesk-browser/commit/bdc316b61d9a0e9f2b39bb63562d76883fa9fc04)
- [恢复原 SDK Authority / HTTP 回归并新增自动授权测试](https://github.com/shopable-ai/opendesk-browser/commit/cd66e1044a44ed19779dcb4701d0ef41badfe969)
- [真实 Chrome 自动安装测试和专项 CI](https://github.com/shopable-ai/opendesk-browser/commit/8ecb56fe0d86403bf0d49ff6dd10f8000a937875)
- [将 CI 从不支持命令行扩展安装的 Google Chrome 正式版切换到 Chrome for Testing](https://github.com/shopable-ai/opendesk-browser/commit/6ea79bae5e8e518021adb37cb91115bc59270fcf)
- [失败 Hello 后续显式重试，不重复 HTTP 副作用](https://github.com/shopable-ai/opendesk-browser/commit/be0884e258a51fc65f3d973ffa358b61377de19b)
- [真实 CFT 浏览器下，第 06 组通过原生键盘输入提交 HTTP](https://github.com/shopable-ai/opendesk-browser/commit/63442c72f8cf227d89d15dfe83370c2f131e2a10)

## 源码身份和原始验证

最终实测测试候选 `63442c72f8cf227d89d15dfe83370c2f131e2a10`；SDK 运行时最近一次修改位于 `be0884e258a51fc65f3d973ffa358b61377de19b`。这两者之间追加的是独立验证驱动/文档/CI 设置，SDK 网络与 Authority 代码没有变化。

| 验证 | GitHub Actions | 实际结论 |
| --- | --- | --- |
| 真实 unpacked 扩展 + CFT Chrome 155.0.8059.39 | [Native Browser Test Lab + SDK](https://github.com/shopable-ai/opendesk-browser/actions/runs/38041547381) | PASS：网页无需人工安装即有 SDK；直接 `axiosx.get` 200；原生键盘操作第 06 组 URL 与「发送 GET」，页面显示 `200 OK`、响应 JSON；辅助服务共观察两次真实请求；未允许的跨站 Origin 返回 `E_PERMISSION` |
| SDK 精确 document、权限与撤销回归 | [SDK Authority](https://github.com/shopable-ai/opendesk-browser/actions/runs/38040596002) | PASS |
| axiosx HTTP / 旧接口回归 | [R7 HTTP](https://github.com/shopable-ai/opendesk-browser/actions/runs/38040596070) | PASS |

测试日志含 `NATIVE_SDK_AUTO_PASS {"browser":"Chrome/155.0.8059.39","autoInstalled":true,"sdkHttp":200,"denied":"E_PERMISSION","observed":2,"realUiGet":true}`。它证明真实 Chrome 中，用户可以通过**真实键盘输入和 Enter 激活**第 06 组 HTTP 控件（没有调用 DOM `.click()`、没有 fake SDK/伪造 HTTP）。依然不是外网 `httpbingo.org` 真实连通性证明，也未测试用户自己 Mac 的 Chrome 扩展安装。CI 先前以 Chrome 154 正式品牌版使用 `--load-extension` 启动，扩展实际未安装；这属于测试环境错误，并非被证明的 SDK 失败。自 Chrome 137 起品牌版 Chrome 已移除该命令行功能，应使用 Chrome for Testing 或 Chromium。

## 与其他并行任务的边界

`main` 同时整合 R15 预装核心库：`lodash-es@4.18.1` 白名单（8 个方法）及 `dayjs@1.11.23` 已有独立 Controller / USER_SCRIPT 适配和构建/组件 CI。jQuery 是已打包的可选 Page 资源；旧版 Moment、Cheerio、CryptoJS、Socket.IO、Vue 等历史快照不能因文件存在就宣称默认库已经完成。R15 正式 Chrome 双运行时与最终 F3 需要对应工作流单独验收；这里不认领其代码文件。

在同一 `be0884e` 候选下，Page userscript dependencies、Site access、Sidebar R1、Native Agent 工作流仍有失败；其中 Page/Sidebar 的失败定位在并行的 install-once R3.1 script-editor/contract 测试上。这些红灯不会被本 SDK 的局部 PASS 抵消，相关文件由原工作流负责人收敛，避免并行 Agent 互相覆盖。

## 剩余验收边界

1. 用户本机 `127.0.0.1:43111/demo-form.html` 的普通 Chrome 安装场景、demo 06 **鼠标点按**以及外部 `httpbingo.org` 连通性：`NOT_TESTED`。CI 已用 CFT 的真实键盘 Enter 激活了 demo 06「发送 GET」并取得 HTTP 200 回执，不应重复称整个 UI 尚未验收。
2. 浏览器各类导航（iframe、SPA、BFCache）、真实 Worker 中断后恢复、关闭/重启和长期稳定运行：本次仅有 Authority 组件测试，原生专项仍需完整证据。
3. 单份 SDK 自动安装的独立质量门以现有 CFT/native/Authority/HTTP 回执为准；全仓库专家 95+、F3 与 ZIP 安装验收仍为 `NOT_ACCEPTED`，不能虚报。

## 使用说明

框架开发者一次性构建发布扩展；普通用户不安装 npm、Axios、额外插件或手动 SDK。旧网页在更新扩展后需要正常刷新才能使用新的固定 content scripts；未授权站点、浏览器限制访问、原有 `OpenDeskSDK` / `axiosx` 全局冲突均明确拒绝，不能静默回退页面 Fetch。
