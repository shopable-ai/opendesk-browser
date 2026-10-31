# 视频倍速 · Video Speed Controller（全局核心 / 包版本 1.2.3）

正式业务唯一源码：projects/video-speed-controller/。这是 OpenDesk Browser 的 Side Panel 应用，不创建独立 Chrome 插件或网页悬浮面板。

## 1.2.3 全局界面精简（2026-10-31）

源码与 `preview/index.html` 已删除全局目标行、网站范围及默认开启说明，正常状态仅保留「全局倍速」与开关；异常/未知恢复反馈仍保留。全局控件与预览交互 28 项通过，并以独立离线 Chrome 验证预设和开关。

唯一正式文件为 [video-speed-controller.opendesk-tool.json](video-speed-controller.opendesk-tool.json)，版本 1.2.3，26030 字节，SHA-256 `86b19e3ffd345112f19e7088e14f7bb694812a5f5ffcbb91d5d259a37ec54bfc`。使用原打包器构建、校验后晋升，并以 `--check-project` 核对同源；官方版本准入及对应固定源码 pin 同步更新，权限不变，新增 4 项准入/编译边界检查通过。对正式包的 HTML/JS 实读确认三处文案已删除。

原生更新为 BLOCKED：现有 watcher 曾成功同步同字节的 1.2.3 内置包，Chrome 调试页实读开发服务已连接、revision `6acb989849dd3319b345fd9807f5872591857c76f709620eb00c6153d3aa500e`，并通过原入口选择了本正式文件。确认更新前，其他并行源码修改触发开发服务重启；`src/platform/host/controller-methods.js` 新增的 `../chrome/native-http-transport.js` 导入目标尚不存在，日志报 `Could not resolve` / `Failed to build sw`。随后 development 的 sidepanel.html 及内置包暂缺，Chrome 侧栏显示 `ERR_FILE_NOT_FOUND`。未点击确认更新，最后可确认的已安装版本仍为 1.2.2；不把打包/同步视为已安装。未修改该并行任务文件、重启服务或复制其他产物绕过失败；下方 1.2.2 结果仅为历史证据。

## 1.2.2 历史全局默认与交互简化（2026-10-31）

首次使用全局倍速默认开启，初始目标 1×；已有明确关闭的偏好继续保留，安装身份/包摘要变化和损坏状态仍安全停用。移除与全局开关重复的「停止」按钮，关闭自动应用继续使用全局开关；目标行简化为「全局目标 · 1.00×」，与上方当前视频实际读回分开。同步原有离线交互预览。

当时正式包为 26911 字节，SHA-256 `059cdd2530796c17a92ff6f51698635fa266da121cd303435c8977a9f3f1bebc`，现已由 1.2.3 替代。使用原打包器构建候选，通过定向检查后晋升并核对同源；权限未变化，可信代码不进入 JSON。默认/显式关闭持久化、开关恢复与跨窗口竞态、原快捷键/焦点/独立读回、固定编译来源门禁共 154 项通过。

本轮真实入口为日常 Chrome 扩展 `ccfcjegpkdlgbclopjmadlcjedelidmf`，详情页实读加载目录仍为本仓库 `dist/development`。旧开发服务已退出，确认无存活 writer 后恢复原 `npm run dev`；Chrome 实读开发服务已连接，revision `f4b751c692bf83facd8ec7635d12a2cdd92ae2ec7f7fc4bc8d02a9f5ce7f4697`。原导入审阅显示 `1.2.1 → 1.2.2`、官方包已校验、权限未变化及数据保留，并完成确认更新。在 W3C HTML5 视频页开启全局开关，点击 1.25× 后侧栏实际读回与网页自己的 `playbackRate` 均为 1.25；再恢复 1×，返回列表并重新打开，开关仍开启、全局目标及实际值均为 1.00×，独立「停止」按钮已移除。项目正式包与 development 内置包逐字节相同。首次无偏好的默认开启及显式关闭重启保护为 Node 证据，未清除用户偏好制造原生首次安装结果；production、完整生命周期矩阵与评分未执行。

## 1.2.1 历史包更新（2026-10-30）

当时正式包为 27272 字节，SHA-256 `e60d908c83f268de8399bcf69354ee320f1c3955370c31f5c682a2ae4e54929d`，现已由上述 1.2.2 替代。1.2.1 后续实际导入与倍速读回见[原生记录](evidence/import-1.2.1-20261031.md)。

当次内置资源同步为 BLOCKED：既有 dev writer 的统一官方目录生成报告 `E_TOOL_BUILD: compiled UI source changed since the successful build: src/App.jsx`，对应并行 AI Proxy 的未完成编译输入。未重建或覆盖其输出、未停止服务；读回 `dist/development` 的本工具包、目录及发布指纹仍为 1.2.0。正式包 1.2.1 已就绪不等于扩展内置资源或已安装副本已升级。

## 产品操作

当前网页播放 HTML5 视频 → 在扩展中心审阅安装/升级「视频倍速」并打开 → 点击 0.75～4× 预设或 ±0.25× → 固定可信 Host 设置当前选中的视频，并由第二次脚本注入独立读回。唯一的 1× 预设恢复当前视频正常速度，卡片右上角刷新重新读取实际值。

「全局倍速」首次使用默认开启，预设同时保存本 Chrome Profile 的共享目标；在已允许访问的网站，切换页面、刷新、SPA 替换/新增视频、再次播放及关闭侧栏后继续沿用。无视频时也能保存目标，上方数字仍仅显示当前视频实际读回。偏好跨窗口同步，MV3 唤醒时从持久状态重新核验。只处理当前可见标签页中优先主/播放中的一个视频，不批量改动后台视频；受 Chrome 访问限制的文档不写入。iframe 播放事件通过已有 all-frame ISOLATED 入口请求后台重新选取。

关闭「全局倍速」开关会关闭自动应用，并尝试将仍可访问且由本工具控制、未被网站/用户另行改速的视频恢复 1×；不会把其他播放器的选择强制清零。恢复通过独立脚本读回，部分文档不可访问/结果未知时明确提示，不能声称所有页面已恢复。后续新视频不再自动调速。工具停用、卸载、安装代际变化或网站撤权后拒绝后续写入；恢复原权限不等于恢复旧安装的全局授权。

快捷键默认开启（可在当前应用中单击滑块关闭，偏好存入该应用的 `storage.local` 命名空间）：S 降低 0.25×、D 提高 0.25×、R 恢复 1×。侧边栏内可直接按键；网页中的单键快捷键仅在**当前官方 1.2.3 工具已安装且正在打开**、当前顶层 HTML 文档获得注入权限时生效。网页中的监听器只发送一个带会话令牌的按键信号，不直接修改任何视频：Side Panel Host 每次重新核对官方包、安装代际、启停和活动 Document，再读取 → 设置 → 独立读回，并将真实结果反馈给倍速数字区。不会在后台自动重放失败请求。

**网页即时反馈（2026-10-30）**：S/D/R 完成独立读回及必要的全局同步后，目标页面顶部显示实际倍速，例如「视频倍速 · 1.25×」或「已恢复 1×」，约 2 秒后消失；到达上下限/已经 1× 也有反馈。播放器覆盖时明确显示目标未生效与实际值，无视频或结果未确认显示短暂警告。侧栏中的手动设置也在独立读回后提示；后台自动沿用全局目标不逐次弹出。复用框架公共 Page toast 的 `position` 接口：`top-left / top / top-right / left / center / right / bottom-left / bottom / bottom-right`，省略时默认 `top`。视频消费者固定显式使用 `top`（顶部居中），保留当前行为；用户无需每次设置提示位置。快速操作更新同一条、全屏使用顶层提示、保留输入焦点。提示失败不重放调速，导航或撤权后拒绝向新文档发布旧结果。

网页反馈由随 Browser 固定编译的可信 Host 与公共 Page UI 提供。当前 1.2.3 安装包已同步版本，工具 ID、沙箱执行资源及权限保持原样；精确官方版本准入也同步到 1.2.3。固定代码仍需由原持续开发安全刷新部署，单独重装 JSON 不能更新该行为。2026-10-30 已在真实 Mac Chrome 从扩展侧栏操作 W3Schools 和 W3C 视频页，分别独立读回 1.25×、1.50× 并出现顶部提示；[当次记录](evidence/page-toast-20261030.md) 仅证明这两条手动预设链，不沿用旧快捷键或全屏验收结论。

本轮定向验证：框架 toast/固定 helper、视频反馈/独立读回、共享 Host 快捷键/撤权和原全局服务检查通过；提示传输失败不重放调速，停止/跨窗口 revision 变化不会发布过期提示。强冲突 CSS、普通/容器全屏九位置与原网页交互为独立 headless 软件回归；真实扩展证据来自上述两个网站操作，独立 HTML 预览不作为扩展运行证明。既有 watcher 的 Host 源码映射、helper 字节与 development 发布指纹另行核对。

键盘事件会跳过输入框、可编辑区域、输入法合成及修饰键组合；不会截获或阻止视频网站自己的快捷键。因此若网站也使用 S/D/R，可能出现冲突，可用滑块关闭本应用快捷键。某些 iframe 内的键盘事件不会传到顶层文档，仍可通过侧边栏数字直接调整。

## 技术边界

- 仅 UI 在普通 Sidebar Tool 沙箱中运行；它调用 videoSpeed.status / videoSpeed.set，不接收页面 DOM、tabId 或任意可执行脚本。
- 固定的 trusted/host.js 作为第一方可信执行代码，走既有 Side Panel Host 的安装 ID、capability、启停、撤权代际、当前窗口/活动标签页/documentId 核验。通过已声明的 Chrome scripting/webNavigation 对最多 16 个 HTTP(S) 文档逐一探测，优先正在播放的 video。
- 按 documentId 精确执行 Chrome ISOLATED world 固定函数，不经过网页 MAIN world eval，不暴露通用 executeScript SDK。
- 每次以文档内的弱引用令牌绑定被选中的同一个 video，设置和独立读回期间的重排不改选；节点被移除或替换则拒绝。令牌限量、15 秒过期且只允许一次设置/读回。单页手动操作不改变所有视频。全局状态由本项目固定可信后台维护，绑定官方包摘要与安装 epoch；快捷键布尔偏好仍保存在原工具命名空间，默认 true。无采集、无远程后端、无新 Chrome 网站权限。
- 页内隔离脚本监听 S/D/R 后只通知可信 Side Panel；Host 使用一次性不可预测令牌匹配顶层 documentId，关闭应用、导航或撤权后令牌立即失效。停用时尝试移除页内监听；网页已导航或已撤权时即使残留事件监听也不能获得修改权限。
- 全局生命周期业务唯一源码为 `trusted/service.js`、`trusted/page.js`，仅静态接入已有 SW 和 page-relay；页面脚本只发无参数事件，不拥有写权限。每次后台操作沿用 `trusted/admission.js` 的精确官方包、provenance、启停与 epoch 核验，精确 documentId 注入，使用与安装/撤权相同的工具锁。
- 自动设置按「元素＋媒体来源＋偏好 revision」最多一次；播放器覆盖、异常 setter 或丢失回执不触发同 revision 自动重写，不监听 ratechange 争抢。新来源/新节点/新的明确目标才可再次应用。无任意脚本、目标 tabId 或 DOM 数据出现在沙箱接口。
- 开启/改目标携带已观察的 revision，在既有工具锁内比较后保存；停止无条件关闭。后续当前视频设置也核对同 revision，迟到开启、预设或快捷键不能复活另一窗口的停止，失效的实际读回不再作为当前结果发布。
- 显示区区分“上次实际读回”和“正在提交的目标速度”；设置确认必须由 Host 独立读回，播放器覆盖时展示目标/实际差异，不伪称成功。
- 不能承诺对使用非 HTML5 播放器、封闭 Shadow DOM、被 Chrome 禁止注入的 iframe、DRM 特殊流程、频繁重写 playbackRate 的播放器全部有效。优酷、爱奇艺、腾讯视频等真实站点兼容需要 Mac Chrome 逐站验证，不将未执行验收记为通过。

## 最小测试

在最新 main:

1. 执行本项目 `node --test projects/video-speed-controller/tests/*.test.mjs`（全局 UI、页面信号与后台生命周期）以及根 tests/environment/video-speed-controller.test.mjs、video-speed-bundle-boundary.test.mjs。共享 Host 只运行 sidebar-tools-host.test.mjs 中名称匹配 `video (shortcut|global)` 的案例。
2. 使用现有 scripts/build-sidebar-tool.mjs 将候选构建到 artifacts/sidebar-tools/video-speed-controller/candidate.opendesk-tool.json；测试通过后用同一脚本的 --promote-from 晋升，并以 --check-project 核对唯一正式包。
3. 日常复用 npm run dev 和 dist/development；核对调试页实际连接与 revision，再通过既有官方升级入口审阅同一候选。不要以静态 build:dev 替代持续开发连接。
4. 官方目录中本产品策略为 optional，不会首次安装就自动运行网页脚本；Chrome 网站访问受浏览器权限控制。

## 后续可选（不是 MVP）

按网站分别保存倍速、自定义快捷键、播放器优酷/爱奇艺等特殊适配、开放 Shadow DOM、更多范围控制。先以真实站点复现证据排序，不提前开发复杂 UI。

## UI 独立预览

`preview/index.html` 是可直接打开的离线交互 HTML：可模拟 10 种状态、倍速按钮、默认开启的 S/D/R、浅色/深色和 320/360/400/440/520 CSS px。此文件**不是**安装资源，也不会操作 Chrome 或网页；正式入口仍为 `src/index.html` + `src/style.css` + `src/main.js`。

## 验收分层

- SOURCE_REVIEW：唯一业务源码及固定可信适配器；提交身份以本文件 Git 历史为准。
- NODE：1.2.1 包更新的版本/来源/固定编译边界及调速反馈定向检查 101 项通过；1.2.0 全局核心结果见下方历史证据；旧 61 项是 1.1.2 历史结果。GitHub Actions CI 未取得本次结果，不推定 PASS。
- MAC_CHROME：历史 1.1.2 开发环境核心操作 PASS（实际升级、单击 1×→2×→1×、两个 set 回执、独立播放计时、S/D/R、双窗口 OFF、双视频/跨源 iframe/覆盖反馈）。完整权限、站点、IME 和指定尺寸验收未完成。
- REAL_SITE：本次顶部提示的 W3Schools / W3C 手动预设链通过；其余网站与场景仍为 NOT_TESTED。production / 九维评分：NOT_TESTED / NOT_SCORED；不得将 Fixture 或预览当作 B站、优酷、正式版或 95 分证明。

R1.3 的当前原生证据、61 项定向检查、同候选身份和历史连接阻塞见 [Mac 验收记录](evidence/mac-chrome-r1.3.md)。该记录不是全面验收 PASS。

## 1.2.0 全局能力与复用决定

已证实旧 `videoSpeed.set` 仅有当前 Host 会话与一次设置，无法承载侧栏关闭后的生命周期。因此仅增加本项目固定后台和页面事件适配，原 SW/page-relay/Host 留静态接线；不新增第三方后台执行 API、安装器、Authority 或 Chrome 权限。全局偏好属于 `opendesk.video-speed.global.v1`，绑定版本摘要/安装代际；损坏或身份不符均不启用。共享界面、旧包/源 pin 和自动测试分别取证，JSON 升级不代表固定后台已部署。

当前阶段：先交付全局核心；真实站点、production、IME/尺寸矩阵与独立评分延期。1.2.0 原生安装及运行状态必须查 [全局核心记录](evidence/global-1.2.0.md)，不能继承 1.1.2 的原生 PASS。
