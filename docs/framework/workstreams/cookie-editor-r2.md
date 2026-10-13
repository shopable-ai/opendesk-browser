# Cookie Editor R2 · 真实产品边界与源码进度

日期：2026-10-13；目标：`shopable-ai/opendesk-browser` / `main`。

## 源码事实

- 核查公开 `src/framework/sdk/browser.js`、`browser-contract.js`：**无 `browser.cookies.*`**（无正式工具 Host 读取、写入与 values 授权）。
- 核查 `src/ui/sidebar-tools/package.js`：当前允许 Capability 白名单中**无 `browser.cookies.*`**；普通工具声明该能力会安装失败。
- 因此 R2 不能安全宣称已提供真实读写。这是 **SDK R9 BLOCKED**，不新建 Cookie Host、RPC、权限库，不向 Cookie Editor 特许 BUILTIN_TRUSTED。
- 原有可选官方安装入口存在；本轮不修改 `official-tools/catalog.json` 的 `optional` 策略。

## 本轮拥有的源码变更

- `src/index.html`：真实/离线双模式导航；明确网站 URL 选择与当前页；权限信息折叠；真实元数据专属列表与阻塞态。
- `src/style.css`：长网站名/URL 省略、窄屏选择器折行、Side Panel 紧凑密度、独立模式状态与焦点。
- `src/main.js`：独立内存所有权、站点选择与 Epoch 失效、只读公开 SDK 适配入口 `cookies.getAll`、授权状态先检查、返回值无条件脱敏。离线格式逻辑保留；**不调用任何真实 Cookie 写/删**。
- `tool.config.json`：提升版本至 1.1.0，仍只声明当前安装器接受的旧权限，功能描述准确标记未接通。
- `README.zh-CN.md`：用户可用的离线功能、真实阻塞、R9 集成合同及测试说明。
- `tests/environment/cookie-editor-ui.test.mjs`：补接口隔离、URL sanitization、敏感值脱敏、真实写入禁用负向断言。

## 状态与证据（不得混级）

| 项 | 状态 | 依据 |
| --- | --- | --- |
| 已有离线功能与 UI 双模式 | SOURCE_WIRED | 远端 GitHub 源码及静态 JS 语法核对 |
| 公开 SDK 消费者 `getAll` | BLOCKED | 无正式 SDK、Host、Capability；该适配入口默认禁用 |
| 元数据默认脱敏 | SOURCE_WIRED | 客户端 `redactMetadata` 丢弃值；仍依赖 R9 Host 强制权限 |
| 真实写/删、Cookie 值、clearSite/observe | BLOCKED | 只能由 R9 正式接口与授权生效后接通 |
| Node 测试 | NOT_TESTED | 无用户 Mac 工作目录及依赖环境访问 |
| 官方工具打包、Build、Verify | NOT_TESTED | 未运行仓库构建命令；不伪造包 SHA |
| Native Mac Chrome/CFT | NOT_TESTED | 无真实扩展安装、授权与截图回执 |
| 完整产品 95+ | NOT_SCORED | 关键 SDK 阻塞与原生验收缺失 |

### R9 必须交付的阻塞合同

1. Public `browser.cookies.getAll/get/set/remove` 参数与结果、Host only site Store/Partition 和精确 Cookie ID。
2. 可用的普通 Sidebar Tool Capability 白名单与审阅、Origin grant、Chrome Permission、撤权、工具安装身份/epoch、升级包 hash。
3. 独立 values capability 强制 Host 默认脱敏，敏感值不会泄漏给只读工具。
4. `clearSite` 精确范围预览+单次确认及失败/剩余数回执；observe 有界脱敏事件。
5. 接入后在真实 Mac Chrome 测试多个 Path、Store、Partition、HttpOnly、前缀、撤权和副作用未知场景。

**并行约束：** 本轮仅写 Cookie Editor 自有文件、专项测试和 R2 工作流。没有访问用户 Mac `git status`，不能判断本机是否有其他 Agent 未提交修改；禁止覆盖本地工作。GitHub 远端仅在目标 Blob 未变时条件提交，不修改 SDK R9 工作流及核心代码。
