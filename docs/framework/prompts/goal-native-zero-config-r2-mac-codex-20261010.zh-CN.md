# GOAL：OpenDesk × OpenDesk Browser R2 —— Mac 本地自动连接、无 ID 入口、Go 项目 Provider、反方审计与专家 95+ 验收

你是同一个串行实施责任主体，分别从 Chrome MV3/Native Messaging、macOS 原生应用、Go 安装器/IPC、应用安全、Node/MCP/ESM、真实 Chrome/CFT、产品 UX 与独立质量审计角度工作。默认中文。**任务是直接实施、修复、核验和保存证据，不是再次只写方案。**

仓库：
- Browser：https://github.com/shopable-ai/opendesk-browser，分支 `main`，已知本机目录可能是 `/Users/shopme/Documents/workspace/opendesk-browser`。
- OpenDesk：https://github.com/shopable-ai/opendesk，分支 `master`，目录按 Mac 实际已存在工作区识别，不能猜测。
- 唯一规范：Browser `docs/architecture/browser-framework/native-zero-config-pairing-r2.zh-CN.md`，Go `docs/integrations/browser/native-zero-config-pairing-r2.zh-CN.md`，两仓库各自 `AGENTS.md`；历史研发记录只作事实来源，不覆盖最新安全契约。

## 一、保护本机现场并取真实基线

先 `git status -sb`、`git log -1`、远端 main/master、正在使用的 Codex/Chrome/profile/Native socket/端口与未决 Run；仅在可安全保留工作时 fast-forward，不强推、不重置、不 `git clean`，不创建分支或 worktree。不要将其他对话未提交修改覆盖。若单个步骤被现有任务占用，记录明确 blocker，完成其他独立实施和静态验证。

核对这轮已合入的文件和行为：
- Go `internal/browserbridge/install_unix.go`、`internal/browsercli/command.go`、`internal/browserbridge/unsupported.go`、`internal/browsercli/command_test.go`：`SetupAutomatic` 对已有合法 Go 安装可无参数复用 ID/browser/profile；未有经过验证的正式发布 ID 的新安装必须 `E_OFFICIAL_ID_UNAVAILABLE`，不得静默兜底假 ID。保持 Node 旧安装 fail closed。
- Browser `src/ui/local-project.js`、`src/ui/tool.html`、`src/native-agent/settings.js`、`src/native-agent/service-worker.js`：本地项目 Switch 默认关、连接按钮打开扩展 Options、只读 Native 重检测、不触发业务运行。
- 当前 Chrome 正式发行 ID 是否已由商店/签名确定；**如果仍未确定，不要把 CFT 的动态 ID、公开 manifest key 或随机 ID 写成官方 ID，也不要谎称普通用户第一次安装无参数成功**。

## 二、先做到正确的用户产品链路

正式用户目标：先安装/启动 OpenDesk → 安装 OpenDesk Browser → 点击「连接本机 OpenDesk」 → 在 Chrome 一次真实的 Native 权限确认 → Native/Host 连接 → 用户明确授权本地项目目录 → 项目运行与结果查看。普通用户不应打开终端或手工输入 Extension ID。没有官方 ID 之前，尽量完成代码支撑和受控开发版用户确认路径，精确报告该发布门槛。

Chrome 的 Native Messaging 由扩展发起 `connectNative`，manifest `allowed_origins` 必须是经确认的精确 `chrome-extension://ID/`；不可 wildcard、不可未经用户同意添加任意 ID，不开能执行浏览器脚本的 localhost HTTP/WebSocket 旁路。

在 Go 发行安装入口/首次可信启动中，仅当发行 ID 确有独立验证时调用自动预注册；不重复启动 Node Host、常驻 daemon 或第二套 Controller。对 unpacked/CFT，实行可检查身份和渠道的原生显式配对，申请来源/OS 深链都是不可信输入，原生真实确认后才写入精确 manifest。若无法安全完成，标记未实施，保留明确的 AI 开发者高级 fallback，而非弱化校验。

## 三、Go 普通本地项目 Provider

将普通用户的项目读取、授权、枚举和运行时解析直接归属 OpenDesk Go（优先单文件 Controller + Page 后多文件静态 ESM）。按已有 `provider.register/registered`、`projects.list`、`project.resolve`、providerEpoch、sourceBytes、sourceHash、bindingId 与 Browser `local-project-service` 的合同协作。只有用户明确授权的 exact path 可读；禁止遍历 `.git`、`.env`、私钥、未知目录与越权符号链接，严禁执行项目 npm scripts、require/eval、任意 Shell。当前 Go 有 esbuild 库，只能在验证与 Browser 原 Resolver 同一语义后启用，不能暗中改 Program Schema。

**区分“Native Host 已连接”与“项目 Provider 已就绪”**；Node MCP 保留给高级 npm/HTTPS 开发工作，不能在未实现 Go Provider 时宣称普通项目完全去 Node。自动发现和文件保存不能自动运行网页任务。

## 四、必须跑的原生验收（先做增量，再做联合）

按前述两个文档先运行受影响单元/构建测试，不修改 Node/Go/浏览器安全规则来凑 PASS。参考：
```sh
# Go 仓库：真实源码及 Go CLI
go test -count=1 ./internal/browserbridge ./internal/browsercli
go test ./cmd/opendesk

# Browser 仓库：原 Switch、权限和项目连接
node --test tests/environment/script-editor.test.mjs tests/environment/sidebar-product-contract.test.mjs tests/environment/native-agent-bridge.test.mjs tests/environment/opendesk-native-provider.test.mjs
npm run check
```
其中 `opendesk-native-provider.test.mjs` 需用 `OPENDESK_BROWSER_BINARY` 指向**实际新构建 Go 可执行文件**运行；它的模拟 Chrome frame 不等于真实 Chrome。运行前确认测试是否读环境变量，不要让它误用 Node Host。

受控 Mac Chrome/CFT 真实 E2E 需要：
- 用户真实点击 Chrome 的 Native 权限；官方身份未固定时由 AI 从受控 CFT 中读取**实际**扩展 ID，再通过高级命令显式注册测试 Profile，仅用于该测试，不外推正式渠道。
- App-first / Extension-first；已授权后 Native 重连；GUI 不在前台时由 Chrome 启动 Go Host；Node 旧安装冲突；撤权/恢复；真实两项目绑定及拒绝未授权路径。
- Controller title/url/param 的实际 runId、resultId、revision、sourceHash、终态 `retirementState:"released"`；Page preview 的 previewId 和类型专属清理；旧运行不被新源码改写。
- Chrome 双 Profile/并发 Host、断线重连、源文件变更、升级回滚、Socket 冲突、未知效果只读恢复；发现单实例 `agent.sock` 设计不足时明确保护和修复，不编造可并发。
- 真实 UI 的连接/离线/项目尚未授权/Native 可用/运行中状态、窄 Side Panel、读屏/键盘、项目 Switch 关闭恢复草稿；截取真实 Chrome 页面证据，而不是仅截图 HTML 原型。
- Go 分发二进制的绝对路径、签名/渠道信息、无 Node Host、Host stdout 严格 Native frame 与调用链不能重启业务逻辑。
- 安装异常、临时文件冲突、symlink、非本用户 owned manifest 与权限、旧 Node 文件完整备份/回滚验证。

所有真实测试明确是否真实操控 Chrome；禁止合成用户权限、假造 Native ACK、伪造 F3 Pass；不对未知业务效果换 requestId 重试。

## 五、交付与 95+ 评分规则

把每条实现结果写入 Browser 对应 `docs/framework/workstreams/` 专属记录与 Go `docs/integrations/browser/` 实施记录；跨仓库给出各自的 git SHA、代码/测试文件、GitHub CI、原生证据、未测与真实阻塞。至少按 Browser R2 主文档的 20/15/20/15/15/10/5 加权评分，**安全关键门槛有 FAIL 即不得判 95+**。分别报告设计分数、实现分数和真实 Mac 交付分数，不为了达标假报。

直接修改既有 `main` / `master`，不建新分支，不覆盖他人工作；通过定向验证后提交、推送（无冲突/保护限制时），不得发布签名正式软件或正式 ZIP，除非本次明确授权。最后给普通用户一套无需手工扩展 ID 的实际使用步骤；如果当前没有已签发的官方扩展 ID，说明为何只能做到“开发版受控配对”并继续实现其他可独立完成项。不要仅重新提供下一轮提示词。
