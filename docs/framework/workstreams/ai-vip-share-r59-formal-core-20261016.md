# AI VIP Share R5.9 正式侧栏核心功能

负责人：Codex（本对话），2026-10-16 / Asia/Shanghai。状态：正式源码/包与开发侧栏定向验证完成；商业/Native 条件及远端集成仍有明确缺口。

## 范围、资源与证据边界

- 仅 main，起始 `68e6b8978338d408fb08637c8b86cc936541aa91`；远端已领先，其他任务未提交文件保持原样。只串行暂存本任务路径，不 stash、不建分支/worktree/PR。
- 独占写入：工具 `src/main.js`、`src/index.html`、`tool.config.json`、`README.zh-CN.md`、经唯一打包器晋升的 `ai-vip-share.opendesk-tool.json`；`tests/environment/ai-vip-share-r59-proxy-ui.test.mjs`、已有 r5-ui/r51-member 测试的版本断言、本记录；必要真实 DOM 驱动 `tests/framework/ai-vip-share-r59-installed.mjs`。公共 SDK/Host/Driver 只读，除非发现必要实际缺陷再追加精确路径。
- 上轮 preview 三个未提交文件保留，不作为本轮修改或正式产品证据。R5.8 原始记录保留。
- 日常开发为 `dist/development`，已有 npm dev PID 55545 / writer PID 55566，43119/43120 已占用；不重启、不另起 dev/build、不写其输出。日常 Chrome 观察到 ID `ccfcjegpkdlgbclopjmadlcjedelidmf`、六 Tab；dev 实际连接和加载目录尚待读回，六 Tab 本身不证明连接。
- 日常真实扩展列表未显示 AI VIP Share；不能把 preview 当安装版本。后续使用独立受控 CFT/Profile，绑定实际加载路径、ID、安装包和源码 SHA。无真实 Provider、合法代理端点、Native 配对，不伪造成功或 native ack。

## 首个可复现缺口与通过条件

正式 `src/main.js` 的代理 UI 共用 `working` 锁；START 未返回时 STOP 被禁用且事件直接返回，错误详情又会被 paint 覆盖。正式 HTML 同时展示两个启停按钮，区块顺序为会员→代理→兑换→商品。

先锁定回归：START 在途允许 STOP、晚到 START/旧状态不能覆盖 STOP、STOP 未确认/未知控制权不能显示停用成功、到期/Provider 离线不拦已有所有权的 STOP、失败提示持续可见。然后最小修复正式源码，并将区块调整为会员→兑换→商品→代理，保留 ID/真实 SDK 与所有权边界。

通过条件：受影响 Node/包门禁、源码/候选同源核验通过；真实安装侧栏 DOM/控件和 SDK 未配置/拒绝路径复验。商业兑换、生产代理联网、安装 ticket 续接与 Native 分开列 BLOCKED/NOT_TESTED，组件替身不提升证据等级。

## 本轮完成

- 正式 `src/main.js` 拆开 START/STOP/状态读取的在途标志，STOP 不受 START 或状态读取锁定。操作代际和读取序号拒绝旧回执；START 晚到后只重新核对状态，不重放启用。START 尚未结束或 STOP/释放身份未确认时保留待确认及停用入口；错误码与恢复提示不再被普通 paint 吞掉。
- 会员快照刷新会同步更新代理启用条件；停用不依赖会员到期、Provider 在线或合法启用端点。公共 Host/Driver 的权限、真实 sender、安装包所有权、串行代理写锁和审阅 profile 均保持现有实现，本轮未修改公共框架。
- 正式区块调整为会员→兑换→商品→代理，保留既有 ID/事件。启停只显示当前一个主按钮。
- 恢复记录先经严格六字段 schema 校验，再按字段比较 CAS 读回，避免存储规范化的 key 顺序变化误伤。事务持久化后再次校验账号/previewId/服务端时限，过期不发送消费 POST，保留恢复锁；暂时读存储失败可主动重试，空记录恢复后清除过期错误提示。
- 版本升为 1.3.1；仅迁移已识别 1.2.0/1.3.0/1.3.1 的同工具最小恢复记录，未开放未知版本或安装身份继承。README 当前说明与旧架构历史分开。

## 定向验证与原始证据

本地 Node v24.16.0。没有运行 preview、截图/缩放矩阵、评分或无关全量回归。

| 验证 | 结果与范围 | 本机原始日志 |
| --- | --- | --- |
| R5 UI / 包身份 | 6/6 PASS | `artifacts/ai-vip-share-r59/formal-core-tests.log` |
| R5.1/R5.2 会员/兑换 | 22/22 PASS，包括取消不消费、重复确认/超时/旧回执/未知事务保护、字段重排、写入期间过期、存储重试、HTTPS 商品 SDK 单次在途 | `artifacts/ai-vip-share-r59/formal-core-followup-tests.log` |
| 正式代理 UI | 6/6 PASS，START 在途 STOP、晚到应答/状态隔离、过期权益与无 Provider 停用、未知释放、错误提示 | 同上 |
| 唯一打包器/来源安全 | 6/6 PASS | `formal-core-tests.log` 与 `package-tests-realpath.log` |
| 语法/静态 | main.js、两项新增/扩展测试的 `node --check`；本轮路径 `git diff --check` PASS | 本对话命令输出 |
| 独立只读审阅 | 未发现高置信缺陷；未将 VM 迟到应答提升为真实原生副作用交错验证 | 本对话 Hume 审阅结果 |

以上合计 40 个不同定向用例。首轮包测试因 macOS `/var` 与 `/private/var` 临时路径别名失败，保留 `node-core.log`；将 TMPDIR 设为真实路径后同测试通过，没有修改产品或放宽断言。当前正式测试脚本对旧 HEAD 的只读副本运行得到 0/6，见 `proxy-baseline-red.log`；基线也揭示会员快照未同步代理按钮这一阻断，不把组件替身说成真实 Provider。

## 同候选真实开发侧栏

- 模式：**持续开发**，实际加载 `/Users/shopme/Documents/workspace/opendesk-browser/dist/development`，真实扩展 ID `ccfcjegpkdlgbclopjmadlcjedelidmf`（Secure Preferences 的 unpacked location 4）。原 watcher PID 55545 / 55566 保持运行；没有第二个 build/dev writer。
- 实际 DOM：开发服务已连接；revision `82413bf6e480227c5801a0330501217e59118ca9dbf5fc54423869f8319cccd2`。真实 `SIDE_PANEL` URL 带 hostInstanceId `088aabe7-ad9b-456f-9566-10283cace183`，不是普通扩展页标签或 preview。
- 使用 CFT 156.0.8078.4（Chromium revision `f842f52ef39fd97b449eb27cff414bf05a98ddce`）。最初共享 CFT 应用身份导致原生选窗歧义，且新 profile 开发者模式关闭会停用 unpacked 扩展；保留环境问题记录。最终用同一原浏览器可执行文件的本地副本、专属 bundle identity `dev.opendesk.ai-vip-share.r59`、启动器独立临时 profile，原生开启 Chrome 开发者模式后验收。没有改变日常扩展加载目录或 ID。专属实例 PID 88793，经 check_instance 确认为 managed；收尾关闭且启动器清理其 profile。
- 原生输入走产品「扩展→导入→选文件→确认安装→主动打开」。安装前 DOM 明确展示 1.3.1 与四项能力；安装不会自动运行。安装记录经官方序列化与候选逐字节同源，HTML/CSS/JS 均一致。
- 实际工具为既有 manifest sandbox，`window.origin === 'null'`，无 `chrome.runtime`。会员/账号/权益明确未配置；兑换输入/提交与商品按钮禁用，恢复存储空记录读取成功，没有伪造会员或回执。
- 原生点击代理「刷新状态」经过真实公共 Managed Proxy SDK；显示已停止，读回 Chrome `permission=true`、`levelOfControl=controllable_by_this_extension`、系统代理模式，本工具无 Managed Proxy 所有权记录。只有启用主按钮可见且因 Provider/端点未配置被禁用。返回列表再打开，状态与安全禁用保持，未误报存储故障。
- 观察期没有捕获 Console error、Runtime exception 或业务外部 HTTP(S) 请求。原始 DOM、安装包/上下文、Chrome 状态与事件在 `artifacts/ai-vip-share-r59/observations.json`；源 SHA 与断言汇总在 `formal-installed-report.json`。
- 日常 Chrome 同 ID 的加载路径与 Native manifest `allowed_origins` 已读回一致；本机现有 `opendesk` CLI 的 doctor 调用不匹配当前 Go schema，未证明 `local.extensionId` doctor PASS，也没有重写 Native 配置。

## 唯一正式包

经 `--out` 构建、上述门禁通过后，使用同一打包器 `--promote-from` 原子晋升，`--check-project` 返回 `PROJECT_PACKAGE_MATCH`。本目录仅一个正式 `ai-vip-share.opendesk-tool.json`，v2 / 1.3.1 / 56902 bytes。

包 SHA-256：`2b7a74b4c2596a910cd4dd892d3f7aac5e4af21ea45bd8dac1730a885c46892e`，等于真实安装的 canonical package hash。`src/main.js` SHA-256：`6ed83422ef33c51c01c5fd0e7cd76558a12abb4921a7631972932979cd96d5df`；其余输入哈希见上述报告。晋升工具返回的 `installed:false` 仅表示打包器本身未安装；实际安装证据来自独立产品操作，不能混为一份回执。

## 仍阻塞与未测

- `PROVIDER_BLOCKED`：四项会员/兑换 HTTPS 端点及账号认证合同未配置，商品目录为空；不能真实验证领取/取消/跨重启回执恢复或商品外链。VM 定向测试不是商业服务 PASS。
- `PROXY_PROFILE_BLOCKED`：正式端点为空，公共 Driver 没有可用于本候选的合法审阅 profile；真实启用、START 在途 STOP、原生迟到副作用、其他所有者冲突与生产联网均 `NOT_TESTED`。
- `INSTALL_CONTINUATION_BLOCKED`：专属激活 ticket、真实安装核验/回跳及服务端合同尚未接入；本轮没有实现或宣称已完成安装意图续接，没有复用不相关兑换 journal 冒充该能力。
- Native 集成与 production 静态包/F3/ZIP 安装均 `NOT_TESTED`。仅有正式源码、同源工具包及当前 development 安装侧栏的上述证据，不表示全部产品正式关闭。

## Git 集成状态

重新 fetch 成功，远端为 `0f60e5765`；本地 main 在提交本任务前落后 108。远端没有修改本轮正式工具源码/测试路径。`git merge --ff-only origin/main` 被安全拒绝，原因是会覆盖其他任务的七个未提交文件：`.github/workflows/prompt-shortcuts-r14.yml`、`docs/framework/workstreams/prompt-shortcuts-r12-ui-handoff.zh-CN.md`、`examples/sidebar-tools/prompt-shortcuts/trusted/page.js`、`scripts/bundle-provenance.mjs`、`src/ui/local-project.js`、`tests/environment/local-project-status-ui.test.mjs`、`tests/environment/prompt-shortcuts-r14-page.test.mjs`。

保留这些文件与上轮 preview 改动。仅暂存/提交本轮正式工具源码、文档、三项定向测试和同源正式包；不 stash、不撤销别人暂存、不另开分支/worktree/PR、不 force push。远端安全推送的集成前置仍被以上文件阻塞，实际提交与 push 返回以本对话最终结果为准。
