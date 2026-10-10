# R16.1 当前主干修复：axiosx 授权、内置库、版本诊断与开发更新

更新时间 2026-10-10。本文件记录源码实现边界与**待实际执行的本机验证**；不是用户 Mac 的验收结果。直接修改 main，不创建工作树，不接管其他任务进程。

## 直接修复的根因与安全边界

- **旧版页面**：源码 `examples/tasks/demo-form.html` 已具有 MAIN SDK 自动安装提示，但本机 `43111` 服务的实际目录、启动时间与 HTML SHA 尚未读取。2026-10-09 曾有 43111 历史快照服务记录；这不是 2026-10-10 的本机根因证据。新增 `node scripts/diagnose-local-runtime.mjs` 只读列出实际端口、监听 PID、cwd、页面 HTTP/源码 SHA、开发构建 hash、HEAD 和 WXT marker。看到 `http43111MatchesSource:false`，先确定监听进程的工作目录，**不要直接杀掉其他任务**；可将当前实例启动在空闲的 43112，再使用相应 URL 验证。
- **Controller `E_PERMISSION`**：旧 `controller-methods.js` 无条件将 axiosx 请求限制到 Controller 当前页面的 origin，哪怕已安装 axiosx 且 Chrome 有其他站点权限。新代码只在可信 Controller Run 操作时明确输入最多 8 个精确 HTTP(S) Origin，固定于 durable `runId`、`revision.sourceHash` 和目标 `documentId` 对应的 run 状态；网络 `pre/post` 授权、Chrome 原生 host 权限与目标重验仍保留。源站同源继续默认可用；不扩张网页自动化导航或 APPLOCAL 权限。安装 Task 不能借普通草稿扩权；浏览器权限撤销事件会 fence 正在运行的跨源权限。这个选项不是 Page USER_SCRIPT 网络授权。
- **开发版 Page 核心资源缺失**：`npm run dev` 的 WXT `build:done` 现在与 `build:dev` 一样发布内置 Page 资源清单，保留严格 SHA/ABI 核对。
- **源码变化却 Chrome 仍旧版**：固定 MAIN/ISOLATED、Controller Worker、内置库资源现在全部触发开发输出 revision 与 RunHost 空闲等待后的安全扩展重载，原有任务不会自动重复执行。已经打开的业务网站仍应**明确刷新网页**才能换掉旧 Content/MAIN 注入；`examples/tasks/demo-form.html` 是独立静态 HTTP 服务，WXT 不会热更新网页 HTML。

## 普通用户的三个执行世界

| 执行世界 | 默认能力 | axiosx 网络权限 |
| --- | --- | --- |
| 受允许网站 MAIN | `window.OpenDeskSDK`、`window.axiosx` | 默认同源；本地示例页原有固定 httpbingo/ipify Origin，点击发送后发真实 HTTP；其他站点单独批准 |
| Sidebar Controller opaque Worker | `axiosx`、`_`、`dayjs`、`OpenDeskLibs` | 默认同源。额外跨站 HTTP 在「开发 → axiosx 跨站请求 Origin」填 `https://httpbingo.org`，然后点击运行；必须已经具有 Chrome 站点访问权限，无每次运行弹窗 |
| Page USER_SCRIPT | `_`、`dayjs`、`OpenDeskLibs`，可选专用 jQuery 资源 | **未实现独立 Page axiosx Broker**：不可借 MAIN SDK 权限宣称可用 |

Lodash 白名单只有 `get/has/words/trim/uniq/chunk/escape/truncate` 共八项；Day.js 是固定核心；jQuery 3.7.1 必须显式声明可选 Page 库。Moment、Cheerio、CryptoJS、Socket.IO、FingerprintJS、Vue/React、DOMPurify 没有经过本轮确认的框架默认注入，不能向用户承诺。

## 精确热更新矩阵

| 更改对象 | WXT serve 再编译 | 运行态如何取得新字节 |
| --- | --- | --- |
| Sidebar HTML/JS | 是 | 空闲任务/草稿保存后刷新工具页；更新被阻塞时有状态提示 |
| Sidebar CSS | 是 | CSS URL 版本切换，尽量不重载任务 |
| Options / Native 设置页面 | 是 | 安全扩展重载后重新打开设置页 |
| Content Scripts ISOLATED | 是 | 安全重载扩展；旧业务标签页需主动刷新 |
| MAIN SDK | 是 | 安全重载扩展；旧业务标签页需主动刷新 |
| Controller Worker | 是 | 安全重载扩展；仅**下一次新运行**创建新 Worker，不重播正在运行的任务 |
| Service Worker | 是 | 确认 RunHost 空闲与原生效果回执后安全重载 |
| Manifest / 权限 | 是 | Chrome 必须应用扩展重载；新权限只按浏览器与应用双重授权 |
| lodash/Day.js/Page 固定资源 | 是 | 构建校验 manifest；安全扩展重载；仅新隔离执行世界生效 |
| `examples/tasks/demo-form.html` | **否**（独立 HTTP） | 静态服务返回新文件 + 业务标签页主动刷新；无需重启扩展，除非 SDK 自身也变更 |

`npm run dev` 是持续的构建任务；不要同时在同一 `dist/development` 执行 `npm run build:dev`。`npm run dev:chrome` 在已有固定 CFT 缓存/独立开发 profile 时可加载此输出，或在 `chrome://extensions` 里以 **Load unpacked** 选择**实际仓库的** `dist/development`（不是 `.output`、`dist/production`、历史项目目录）。必须确认扩展 ID、unpacked 路径。首次授予站点访问权限后刷新旧网页。不需要到「高级诊断 → 逐页批准并安装 SDK」。清除页面缓存不能替代确认扩展加载目录。

## 本地复现与回归命令（由拥有 Mac 的 Codex 在无并行冲突下执行）

```bash
cd /Users/shopme/Documents/workspace/opendesk-browser
git status --short --branch
git rev-parse HEAD
node scripts/diagnose-local-runtime.mjs
# 确认对应监听端口后，另一个终端运行：npm run dev
# 已有同名进程不覆盖。不要同时执行另一个 build:dev。
npm run check
node --test tests/environment/controller-network-scope.test.mjs tests/environment/script-editor.test.mjs tests/environment/wxt-development.test.mjs tests/environment/builtin-libraries.test.mjs
# 停止本仓库的 dev 后，再独立执行以下构建以免覆盖同一 dist：
npm run build:dev
npm run build
npm run verify
```

独立公网 HTTPS 验收：先在网页本地 HTTP Lab 的第 06 组确认 UI `OpenDeskSDK`，默认 GET `https://httpbingo.org/get?source=opendesk`（不能用 api.example.com），点击发送，读取浏览器网络、实际 200 JSON 与 SDK 回执；再通过 Sidebar Controller 明确填目标 Origin，执行脚本并记下 `runId/resultId/sourceHash/documentId`。额外测 429、500、超时及同源受控 HTTP，保留直接网络 vs SDK 区别。Page 内置库在 USER_SCRIPT 世界单独验证，不能因为 MAIN 200 就记它 PASS。

当前本机 43111、真实已加载 Chrome 字节、Controller/Page 原生执行及公网 HTTPS 均为 `NOT_TESTED`。Github Actions 对比必须采用每条运行的原始候选 commit SHA；不以历史 CI、构建成功或模拟测试冒充当前 Mac 通过。
