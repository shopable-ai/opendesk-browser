# 全局倍速 1.2.0 · 开发核心证据

日期：2026-10-30。当前阶段为全局核心开发与最小验证；production、真实站点矩阵及独立评分延期。本记录不继承 1.1.2 的原生 PASS。

## 用户操作与当前状态

- 源码已实现：明确开启全局模式，同一 Profile 共享目标；当前可见授权网页的主视频在刷新、新元素/来源、播放事件后沿用；关闭侧栏后由固定后台处理。
- 源码已实现：停止自动应用，尝试恢复仍可访问、由工具控制且未被另行改速的视频至 1×；独立读回，部分失败/未知结果有单独提示。后台视频不批量自动改速。
- 176 项定向 Node 检查 PASS；唯一正式 JSON 与源码逐字节匹配；已有持续开发输出已包含同版本包及固定后台。
- **MAC_CHROME_GLOBAL / INSTALL_UPGRADE_1.2.0：NOT_TESTED。** 本轮未完成真实 Chrome 中的升级、开启、关侧栏后播放、刷新及停止恢复链。

## 发现、复用与边界

唯一业务 owner 为 `projects/video-speed-controller/`。原 `trusted/host.js` 是需要活动 Host 会话的一次读/设/独立读回，无法单独覆盖侧栏关闭后的生命周期。复用原 `page.videoSpeed`、精确官方包准入、安装 epoch、同工具锁、ISOLATED 函数和 documentId，不新建 Host、安装器或 Authority。

新增固定 `trusted/service.js` 与只发无参数信号的 `trusted/page.js`；平台仅在原 SW、page-relay 静态注册，并在原 Host 转送受限全局请求。可信模块分别 byte-pin 到原 SW/relay/Host 的明确目标，修改字节或换入口会拒绝构建。无新依赖、Chrome 权限、远程脚本或沙箱任意注入接口。

全局状态保存于 `opendesk.video-speed.global.v1`，绑定官方包 SHA256 与安装 epoch；偏好损坏、包不匹配、工具停用/卸载及撤权拒绝写入。当前事件重新核对 Sender、可见活动 Tab、精确 Document 和 Chrome 网站访问。全局开启/目标更新作 revision CAS，停止无条件关闭；后续当前视频设置再核对同 revision。快捷键同步失效时不发布旧实际值。

自动写入按元素＋来源＋revision 至多一次，记录先于 setter；不监听 ratechange，不自动重放失败/未知写入。新事件忙碌时保留最新信号，完成后重新核验；它不是保留旧 mutation 的执行队列。停止仅恢复仍符合控制记录的视频，不强制覆盖网站/用户后续改速；失败记录保留，OFF 不自动重试。

## 本轮最小验证

这些检查由全局持久化、生命周期、跨窗口停止与新增固定入口触发，验证当前操作及受影响的身份、权限、来源和未知效果保护。

```sh
node --test projects/video-speed-controller/tests/*.test.mjs tests/environment/video-speed-controller.test.mjs tests/environment/video-speed-bundle-boundary.test.mjs
# 155 PASS / 0 FAIL / 0 SKIP
node --test --test-name-pattern='video (shortcut|global)' tests/environment/sidebar-tools-host.test.mjs
# 21 PASS / 0 FAIL / 0 SKIP
```

覆盖 UI 的共享目标/实际值分离、无视频保存、跨窗口投影、迟到响应；页面仅发信号、隐藏/BFCache；持久化重启、新节点/来源/iframe、播放器覆盖与异常 setter；权限/身份/epoch/来源拒绝、STOP 与 CAS/忙碌事件竞态、旧自身通知迟到、停止恢复及未知回执不重放。服务测试调用真实固定函数与真实包准入，Chrome API/DOM 由测试替身提供，不能当成原生证据。

另对十个受影响 JS 模块执行 `node --check`，并执行相关文件 `git diff --check`，均 PASS。未运行根全套测试或新的全量构建。

## 唯一正式包

按既有打包器先构建临时候选，定向测试通过后 `--promote-from` 原子晋升，再 `--check-project`：

- 文件：`projects/video-speed-controller/video-speed-controller.opendesk-tool.json`
- 版本：`1.2.0`，27,239 bytes
- SHA256：`5f5ff08bae23c1396668b67517c9372af1dde82af0b8ada6bdade5c33b0733c6`
- 权限仍为 `page.videoSpeed`、`storage.local`；官方目录策略仍为 optional。
- 结果：`PROJECT_PACKAGE_PROMOTED`、`PROJECT_PACKAGE_MATCH`。本机候选在忽略的 `artifacts/sidebar-tools/video-speed-controller/`，不增加第二个正式包。

## 持续开发产物

复用原 watcher PID 52984 / fixture PID 52989，未启动第二个 writer、未停止旧服务。模式为**持续开发**，输出路径 `/Users/shopme/Documents/workspace/opendesk-browser/dist/development`。Vite `http://127.0.0.1:43119/@vite/client` 返回 HTTP 200；这只证明服务可用，不证明某个 Chrome 文档已连接。

项目路径不在现有官方资源 watcher 范围内，晋升后目录仍是 1.1.2；仅触发原 `official-tools/catalog.json` 的文件事件，未改其内容，原 writer 已发布 1.2.0。开发目录包字节、目录 SHA 与 revision 记录一致。

观察到的发布 revision：`bd25c5dedbb5ccb1ed231944ec94a55b7aa4b7affb009e9ea94d1e5c01f1b571`。以下文件均与该发布记录匹配；共享 dev 后续可变化，开始原生操作前重查。

| 产物 | bytes | SHA256 |
| --- | ---: | --- |
| `sw.js` | 985729 | `d6729a5c0089a0566ad4a503930ff7e67c77c9f7e28ac974d5da8db8092893ce` |
| `agents/page-relay.js` | 211698 | `44033b06ba1b5011aa2b9c88b0b24f0fff6a1cfe5b663dfc7adb89e834376d98` |
| `ui/sidebar-tool-host.js` | 596586 | `f211e8842b8e665516b6228df9b558ed0ff23088aaf6928da9a6ed9360707194` |

这些是含并行未提交源码的本机开发产物，非本提交的可复现 production 包，也不是“真实 Chrome 已加载”的证明。

## 原生入口阻塞与下一条操作

本轮按独立 Profile 流程取得 `test-chatgpt-03` 与 UI 租约，启动任务自有 Chrome；CDP 只发现空白页，原生自动化仍选中另一 owner 的既有窗口，无法证明绑定到本任务实例，记 `BLOCKED_WINDOW_BINDING`。未向旧 Profile 窗口操作升级、重载或安装，也未改其 ID/Native 配对。已正常停止本任务自有浏览器并释放 UI/Profile 租约；原 watcher、fixture 和旧 owner 浏览器保留。

下一条未完成操作：绑定任务自有窗口，核对真实扩展 ID、实际加载路径、serve 连接与最新 revision；从已有官方入口审阅升级 1.2.0，再走“开启 2× → 关闭侧栏 → 刷新/新视频 → 停止并恢复 1×”，并检查两个窗口的共享目标与实际读回。当前加载 ID、安装版本及原生行为未知，不从目录名、仓库 HEAD 或旧截图推断。

未进行真实网站、production、IME、宽度/缩放专项、95+ 评分或推送。测试后安全提交只包含本任务文件及共享文件的本任务 hunks，保留其他 owner 的源码、测试、文档和服务。
