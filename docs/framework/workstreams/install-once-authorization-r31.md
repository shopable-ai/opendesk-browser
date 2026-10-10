# 安装一次授权与运行静默校验 R3.1

状态：源码、组件和本地构建已通过；真实 Chrome CI 进行中。工作流：`r31-eceef8694f0a`。开始日期：2026-10-10。

## 工作与资源

- 基线：`d98232ee97edcb32547a485ad0cdf13848086630`，仅在 `main` 修改与提交。
- 本工作区：`/workspace/scratch/eceef8694f0a/opendesk-browser`。单一写入者；独立审计仅只读。不使用其他会话的工作目录、profile、端口、dist 或未提交文件。
- 验证资源：本工作区 `dist/development`，本工作流独立日志目录；真实 Chrome 资源在启动前补充。没有占用共享浏览器资源。
- 变更范围：Chrome 权限静默检查、Sidebar 普通/本地/Page/Task 运行与安装管理、既有安装记录的授权状态和撤销代次、相关 Authority 执行点及回归。

## 已核查与复用

- R3 是正式设计，尚无运行零弹窗的实现验收。R2 仅支持 DOM Page 安装，程序私有 HTTP/Cookie/Native 桥仍未接入。
- R2 的固定源码、依赖锁、Candidate/Verified/Available、安装原生注册、未知效果保护继续沿用。
- R13.1 / Local Dev R2.2 原生证据保留其原候选等级；本轮改变授权入口和撤销机制，不能直接继承为新包的权限验收 PASS。
- 不重复未变的 Locator 全量测试，不改 Manifest，不改无关 Native Agent、工作流或独立 SDK 实现。

## 已完成的实现

1. 三个 Script Editor Run/Preview 入口、Page Verify/Enable、Task Run、工具页测试网页创建只静默检查。Page/Task Install 在可信点击内仅申请预读出的缺失条目。
2. Page 停启、撤销、恢复与升级轮换 bootstrap token 及授权代次；`onRemoved` 在任何持久事务前同步阻断派发。没有权限事件但实际 contains/API 已拒绝的访问也持久暂停。原生权限重新出现不自动恢复程序。
3. 在原安装记录内保存程序身份与已支持范围，不新增存储或执行器。Task 的安装身份加代次覆盖 Run/Install/Toggle/Uninstall，拒绝卸载重装后旧请求；运行中操作、旧回复与迟到结果仍核对安装。
4. 独立反方复测曾发现 Page 停启令牌复活、Task 共享存储越权、结果交付窗口、旧面板代次、同版本卸载重装身份复用和 User Scripts 开关无事件恢复；均修复并加入组件回归。旧 Task 首跑迁移后静默刷新目录，后续明确 Run 不会卡在过期身份。

## 当前能力与诚实边界

- Installed Page v1：顶层、`document_idle`、`USER_SCRIPT` 隔离 DOM，能力 `page.dom`，networkOrigins 为空。
- Installed Task v1：能力 `page.automation`、固定 siteOrigins，networkOrigins 为空；不继承手工 Controller 的 HTTP/Cookie/宿主存储服务。
- 程序私有 Cookie、跨站 HTTP、Native Messaging、宿主存储授权桥未实现；旧 GM 声明不能自动授予这些能力。
- 不改工作流中原有 Run/AI endpoint request；独立网页 SDK 文档授权保持独立。不能宣称整个产品的所有路径均零 request。
- Native `run.start` 直传已安装 `task:` saved source 尚未携带安装快照，安全拒绝；本轮不扩展 Native 协议，也不偷偷采用最新安装身份。普通 Native draft/saved Controller 不受此约束变化影响。
- Page 停用不回滚已发生效果，也不能强制清除旧文档任意计时器/监听器。原文档刷新后清除；未知效果继续保留，不自动重放。

## 组件验证

回归覆盖各普通运行入口连续 20 次零 request、自动 Page 20 个文档、撤权/主动恢复/同范围升级、不同程序、旧记录、Worker/浏览器实例重建、导航/停启/卸载重装/迟到交付和授权竞态。组件中的 Chrome API/DOM 为测试替身；不作为原生弹窗或浏览器操作证据。

定向命令包含 permission-gate、site-access、script-editor、task-workbench、task-package-flow、page-installed-programs、page-program-library、page-script-preview、page-program-package、user-script-dependency-flow、native-page-program 和 k3-controller-authority。原始日志及 main 集成后结果在后续验收提交补充。

2026-10-10 本地集成记录：实现提交 `050fff1`；以正常 merge 保留 origin/main 到 `a8f1c08` 的 R15/SDK 等并行变更，集成提交 `0094cf93713e55133bfb72a885c271d72c0048fb`。冲突仅在 Page 组件 fixture，同时保留 R15 固定 builtin 装载与 R3.1 重启/多程序测试。集成后 **230/230 受影响组件通过、check 通过、build:dev 通过**。开发包 packageHash 为 `7652a34d70af194f88150377db6c9f90f428a4ca57119461622da3cefae8a832`。

原始记录：[证据与输入哈希](../evidence/install-once-permissions-r31-local/manifest.json)、[定向 TAP](../evidence/install-once-permissions-r31-local/affected-integrated.log)、[源码检查](../evidence/install-once-permissions-r31-local/check-integrated.log)、[构建日志](../evidence/install-once-permissions-r31-local/build-integrated.log)、[独立构建回执](../evidence/install-once-permissions-r31-local/build-development.json)。本轮构建生成的共享 WXT 回执已另存于工作流证据目录，保留原主分支历史文件。

独立安全审计结论：源码/组件边界通过，已实际复现的高优先级否决项均关闭。审核者只读，通过完整 Authority→固定 Task 包验证→安装→运行链复测；该结论不是 Chrome 原生或总体 95+ 的替代品。安装身份、代次和恢复路径的回归已固化在上述测试文件中。

## 待完成验证

合入并行 main 新输入后的定向组件、`npm run check`、`npm run build:dev`，以及当前包的真实 Chrome 定向验收。原生验证使用本工作流独立 macOS CI、官方 CFT 155.0.8059.39 完整 .app、独占 0700 profile、系统分配 loopback HTTP/CDP 端口、原函数透传 request 计数。通过正式 Side Panel 保存/核对/安装，20 个新文档自动运行，再真实重启 Worker 和同 profile 浏览器；观察器不写授权/安装记录、不伪造 API 回执。

专用入口：`tests/framework/install-once-permissions-native.mjs`；CI：`.github/workflows/install-once-r31-native.yml`。原 launcher 保留默认行为，仅为本工作流增加显式 `--same-profile-restart`，复用已存在的进程/目录归属 Lifecycle 校验。

Chrome 站点撤销/恢复原生弹窗、同范围升级及扩权原生 UI、Controller/本地项目 20 次原生循环、本地 Native provider E2E、真实跨程序恶意 RPC 渗透、完整框架 F3/ZIP 仍分别保留 NOT_TESTED，除非后续原始记录实际闭合。startup 在观察器附加之前的 request 调用标为 NOT_OBSERVED；20 次运行与显式重启后的新文档动作前均先安装观察器。保留 FAIL/BLOCKED/NOT_TESTED，不以组件数替代总体完成度或 95+。
