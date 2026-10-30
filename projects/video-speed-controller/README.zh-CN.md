# 视频倍速 · Video Speed Controller (UI R1.2 / 包版本 1.1.0)

正式业务唯一源码：projects/video-speed-controller/。这是 OpenDesk Browser 的 Side Panel 应用，不创建独立 Chrome 插件或网页悬浮面板。

## 产品操作

当前网页播放 HTML5 视频 → 在扩展中心安装「视频倍速」并打开 → 点击 0.75～4× 预设或 ±0.25× → Chrome 在当前选中的网页文档中设置视频播放倍速 → 由第二次脚本注入独立读取 playbackRate。可随时点击唯一的 1× 预设恢复正常；刷新按钮重新读取实际倍速。

快捷键默认开启（可在当前应用中单击滑块关闭，偏好存入该应用的 `storage.local` 命名空间）：S 降低 0.25×、D 提高 0.25×、R 恢复 1×。侧边栏内可直接按键；网页中的单键快捷键仅在**官方 1.1.0 工具已安装且正在打开**、当前顶层 HTML 文档获得注入权限时生效。网页中的监听器只发送一个带会话令牌的按键信号，不直接修改任何视频：Side Panel Host 每次重新核对官方包、安装代际、启停和活动 Document，再读取 → 设置 → 独立读回，并将真实结果反馈给倍速数字区。不会在后台自动重放失败请求。

键盘事件会跳过输入框、可编辑区域、输入法合成及修饰键组合；不会截获或阻止视频网站自己的快捷键。因此若网站也使用 S/D/R，可能出现冲突，可用滑块关闭本应用快捷键。某些 iframe 内的键盘事件不会传到顶层文档，仍可通过侧边栏数字直接调整。

## 技术边界

- 仅 UI 在普通 Sidebar Tool 沙箱中运行；它调用 videoSpeed.status / videoSpeed.set，不接收页面 DOM、tabId 或任意可执行脚本。
- 固定的 trusted/host.js 作为第一方可信执行代码，走既有 Side Panel Host 的安装 ID、capability、启停、撤权代际、当前窗口/活动标签页/documentId 核验。通过已声明的 Chrome scripting/webNavigation 对最多 16 个 HTTP(S) 文档逐一探测，优先正在播放的 video。
- 按 documentId 精确执行 Chrome ISOLATED world 固定函数，不经过网页 MAIN world eval，不暴露通用 executeScript SDK。
- 每次只修改一个被选中的 video，不改变所有视频或跨标签页；无采集、无远程后端、无新网站权限。只持久化本产品的快捷键布尔偏好，默认 true。
- 页内隔离脚本监听 S/D/R 后只通知可信 Side Panel；Host 使用一次性不可预测令牌匹配顶层 documentId，关闭应用、导航或撤权后令牌立即失效。停用时尝试移除页内监听；网页已导航或已撤权时即使残留事件监听也不能获得修改权限。
- 显示区区分“上次实际读回”和“正在提交的目标速度”；设置确认必须由 Host 独立读回，播放器覆盖时展示目标/实际差异，不伪称成功。
- 不能承诺对使用非 HTML5 播放器、封闭 Shadow DOM、被 Chrome 禁止注入的 iframe、DRM 特殊流程、频繁重写 playbackRate 的播放器全部有效。优酷、爱奇艺、腾讯视频等真实站点兼容需要 Mac Chrome 逐站验证，不将未执行验收记为通过。

## 最小测试

在最新 main:

1. node --test tests/environment/video-speed-controller.test.mjs
   本轮竞态回归：`node --test projects/video-speed-controller/tests/shortcut-preference.test.mjs`；共享 Host 接收器：`node --test --test-name-pattern='video shortcut' tests/environment/sidebar-tools-host.test.mjs`。
2. npm run build:sidebar-tool -- projects/video-speed-controller
3. npm run build:dev；加载 dist/development 到真实 Chrome 后，在包含原生 video 的测试网页安装候选并验证设置、读回、1×、切换标签、撤权、iframe 场景。
4. 官方目录中本产品策略为 optional，不会首次安装就自动运行网页脚本；Chrome 网站访问受浏览器权限控制。

## 后续可选（不是 MVP）

按网站保存倍速、自定义快捷键、自动恢复、播放器优酷/爱奇艺等特殊适配、开放 Shadow DOM、更多范围控制。先以真实站点复现证据排序，不提前开发复杂 UI。

## UI 独立预览

`preview/index.html` 是可直接打开的离线交互 HTML：可模拟 10 种状态、倍速按钮、默认开启的 S/D/R、浅色/深色和 320/360/400/440/520 CSS px。此文件**不是**安装资源，也不会操作 Chrome 或网页；正式入口仍为 `src/index.html` + `src/style.css` + `src/main.js`。

## 验收分层

- SOURCE_REVIEW：已把 UI、偏好读写与可信快捷键链路提交到 main。
- NODE / CI：以实际 GitHub Actions 结果为准，未取得结果不得写 PASS。
- MAC_CHROME / REAL_SITE：NOT_TESTED；本地 Codex 使用真实 Mac Chrome 分别验证 B站、优酷及普通 HTML5 视频、撤权/iframe/键盘冲突、200% 缩放。不得将模拟状态视为站点通过。

R1.3 的差量修复、25 项定向 Node 结果、修复后包 SHA 和原生连接阻塞见 [Mac 验收记录](evidence/mac-chrome-r1.3.md)。该记录不是全面验收 PASS。
