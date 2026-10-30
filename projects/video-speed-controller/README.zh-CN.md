# 视频倍速 · Video Speed Controller (R1.0 MVP)

正式业务唯一源码：projects/video-speed-controller/。这是 OpenDesk Browser 的 Side Panel 应用，不创建独立 Chrome 插件或网页悬浮面板。

## 产品操作

当前网页播放 HTML5 视频 → 在扩展中心安装「视频倍速」并打开 → 点击 0.75～4× 预设或 ±0.25× → Chrome 在当前选中的网页文档中设置视频播放倍速 → 由第二次脚本注入独立读取 playbackRate。可随时点击 1× 恢复正常；刷新按钮重新读取实际倍速，不后台持续修改。

## 技术边界

- 仅 UI 在普通 Sidebar Tool 沙箱中运行；它调用 videoSpeed.status / videoSpeed.set，不接收页面 DOM、tabId 或任意可执行脚本。
- 固定的 trusted/host.js 作为第一方可信执行代码，走既有 Side Panel Host 的安装 ID、capability、启停、撤权代际、当前窗口/活动标签页/documentId 核验。通过已声明的 Chrome scripting/webNavigation 对最多 16 个 HTTP(S) 文档逐一探测，优先正在播放的 video。
- 按 documentId 精确执行 Chrome ISOLATED world 固定函数，不经过网页 MAIN world eval，不暴露通用 executeScript SDK。
- 每次只修改一个被选中的 video，不改变所有视频或跨标签页；无定时器、无网站流量采集、无远程后端、无附加权限或自动持久化。
- 不能承诺对使用非 HTML5 播放器、封闭 Shadow DOM、被 Chrome 禁止注入的 iframe、DRM 特殊流程、频繁重写 playbackRate 的播放器全部有效。优酷、爱奇艺、腾讯视频等真实站点兼容需要 Mac Chrome 逐站验证，不将未执行验收记为通过。

## 最小测试

在最新 main:

1. node --test tests/environment/video-speed-controller.test.mjs
2. npm run build:sidebar-tool -- projects/video-speed-controller
3. npm run build:dev；加载 dist/development 到真实 Chrome 后，在包含原生 video 的测试网页安装候选并验证设置、读回、1×、切换标签、撤权、iframe 场景。
4. 官方目录中本产品策略为 optional，不会首次安装就自动运行网页脚本；Chrome 网站访问受浏览器权限控制。

## 后续可选（不是 MVP）

按网站保存倍速、快捷键、自动恢复、播放器优酷/爱奇艺等特殊适配、开放 Shadow DOM、更多范围控制。先以真实站点复现证据排序，不提前开发复杂 UI。
