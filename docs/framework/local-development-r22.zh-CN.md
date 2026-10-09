# OpenDesk 本地源码与 MCP 直接运行（R2.2）

日常开发：**连接允许的项目 → 修改源码 → 直接运行 → 查看结果**。

PR #37 已于 2026-10-09 合入 main，源码包含 Controller Local Dev、Page 专用预览与 Sidebar「本地项目连接」入口（P0/P1/P2）。其中 Controller/Page 的真实 CFT CI 证据须绑定当次包与 [工作记录](workstreams/local-dev-r22-c036.json)；**用户 Mac 上的实际 Codex/MCP 与 Sidebar 验收仍需独立执行**。受管 UI 自动热替换（P3）和 npm/HTTPS 本地即时解析不因 PR 合并而自动实现。

## 架构选择

| 方案 | 职责 | 选择 |
| --- | --- | --- |
| A：Codex → MCP → 现有 Native | 读取最新目录，运行真实浏览器并取得结果 | 优先实施，Controller 使用原 run.start/get/stop |
| B：Sidebar 连接同一项目 | 通过现有“开发 → 本地项目连接”选择已授权项目 | P2 源码已接线，用户本机真实使用需单独验收 |
| C：轻量热加载 | 标记变化、失效缓存、安全刷新 UI | 渐进增强，不自动重执行业务操作 |

旧流程把正式发布的不可变产物当成每次开发运行的前提。自动构建并上传 JSON 仍保留这层交接。Local Dev 把读取、验证和必要的 ESM 合并放进运行请求，在内存中产生本次执行字节，再进入原 Native → 已注册 Host → RunHost → Authority → Controller Worker。

只使用一个 LocalDevResolver 和既有 opendesk.project.v1，没有项目开发服务器、第二套 Controller 或浏览器内 IDE。Node 负责有界文件读取和转换；扩展负责权限和目标；Controller 负责自动化；Page DOM 程序必须通过 USER_SCRIPT 专用入口。

## 首次配置

开发机使用仓库要求的 Node.js（当前 >=22.12.0）。仓库依赖只需准备一次：

```sh
npm ci --ignore-scripts
```

扩展需要包含本轮代码。已有正确连接的 Native Host 不必重复 setup。首次在仓库根目录执行，替换 Chrome 展示的真实扩展 ID：

```sh
node native-agent/cli.mjs setup --extension-id "实际扩展ID"
```

Chrome for Testing 使用 `--browser cft`；独立测试 profile 同时传 `--user-data-dir /absolute/profile`。不通过改变 HOME 隔离 macOS Chrome。同一安装绑定明确的浏览器、profile 和扩展；切换前先关闭 Native 连接，再安全 cleanup。

在扩展现有设置页点击“授权并启用”，批准 Chrome Native Messaging 权限。目标网站授权独立通过 Chrome/Sidebar 原入口进行。保持同窗口 Sidebar 或真实包内工作台打开；Native 不会另建隐藏执行宿主。

配置 Codex 本地 stdio MCP：

```sh
codex mcp add opendesk-dev -- node "/Users/shopme/Documents/workspace/opendesk-browser/native-agent/local-dev/mcp.mjs" --allow-project "/Users/shopme/Documents/workspace/opendesk-browser/examples/programs/local-controller"
```

CLI 形式依据 [OpenAI 官方 MCP 文档](https://developers.openai.com/codex/mcp)。其他标准 stdio MCP 客户端可使用相同 command 和参数。本适配器明确实现 2025-11-25 兼容协议，stdout 每行一条 JSON-RPC，诊断进入 stderr。

`--allow-project` 是文件读取授权，最多重复八次，必须填写明确允许的项目目录或单个 .js/.mjs 文件。attach 不能扩大范围。不需要 HTTP 源码服务或 frozen-request.json。

## 日常多文件实例

在仓库根目录启动唯一标准测试网页：

```sh
python3 -m http.server 43111 --bind 127.0.0.1 --directory examples/tasks
```

打开 `http://127.0.0.1:43111/demo-form.html` 和同窗口 OpenDesk 工作台。该 HTTP 服务只提供测试网页，不读取、转换或同步项目源码。

告诉已配置 MCP 的 Codex：

> 阅读 .agents/skills/opendesk-program-publish/SKILL.md。连接 examples/programs/local-controller，在当前 demo-form.html 上运行并查询结果。修改 src/extract.js，将 version 改为 2，并增加网页 h1 文本，再直接通过 MCP 运行。不要执行 build:program，不生成或上传草稿 JSON。报告两次 runId、实际哈希和结果。

Codex 调用 attach → status → run → result；参数经 MCP 传递，用户不手写 JSON-RPC 文件。例子入口：

```js
import {readSummary} from './extract.js';
export default async function main({page}) {
  return readSummary(page);
}
```

第一版 extract.js 返回 `{version:1,title:await page.title()}`。第二版依赖文件：

```js
export async function readSummary(page) {
  return {
    version:2,
    title:await page.title(),
    heading:await page.locator('h1').textContent()
  };
}
```

再次 dev.run 使用代表本次有意执行的新 requestId。新结果包含真实 h1 文本；原运行源码与结果仍冻结。两次之间不 build、不上传、不覆盖草稿、不重新安装扩展。完整可编辑例子见 [local-controller](../../examples/programs/local-controller/README.md)。

## 在现有 Sidebar 使用本地目录（不上传 JSON）

确保已经完成前文 Native 安装、MCP 配置和权限授权，并保持同一窗口的 OpenDesk 工作台与目标网页打开：

1. 进入 Sidebar「开发」的「本地项目连接」折叠区，把「源码来源」从「手工草稿」切换到「本地项目」。
2. 点「刷新连接」，在列表中选择已通过 `--allow-project` 和 MCP attach 绑定的项目。若提示未连接，先检查 Native 是否启用、MCP 是否启动及 Host 身份；不能为了运行绕过授权。
3. 根据项目选择现有的「运行草稿」（Controller）或页面专用运行入口（Page）；确认运行目标和网站授权。运行前源码会按最新本地文件重新解析，旧的已入场版本不会被暗中替换。
4. Codex 修改文件并保存后，再次**有意触发**运行，比较新的 `sourceHash` 与旧结果。切回「手工草稿」不会覆盖原未保存源码。

此界面不是完整目录文件管理器，不会把本机路径开放给所有脚本；也**不能**直接把 npm/HTTPS 的未构建 import 当成 Local Dev 可执行源码。要使用 npm/HTTPS，先按 [统一使用指南](../product/program-development-dual-format-and-sidebar.zh-CN.md#标准-https-esm只在本地构建阶段锁定) 完成显式固定构建与产物导入，待统一 Resolver 集成闭环再允许无上传直连。

## 七个 MCP Tools

| Tool | 参数 | 行为 |
| --- | --- | --- |
| opendesk.dev.attach | path；单文件还需 runtimeKind、siteOrigin，可选 entryFormat | 返回 bindingId，只绑定允许路径 |
| opendesk.dev.status | 可选 bindingId、registrationId | Native 状态、项目、精确目标或 targetError |
| opendesk.dev.run | bindingId、requestId；可选 params、registrationId、deadlineMs | 当前 Controller 从最新源码运行，返回实际 runId 与 source/revision |
| opendesk.dev.result | runId | 原 Controller snapshot、持久结果、sourceHash、value/error |
| opendesk.dev.stop | runId；可选 requestId | 原 RunHost 停止；再查 result 确认收尾 |
| opendesk.dev.diagnostics | 可选 bindingId 或 runId | 本地解析错误或原运行诊断，不重新执行 |
| opendesk.dev.detach | bindingId | 解除绑定与缓存，不修改/停止已入场运行 |

attach.connected:true 只表示本地绑定。status.connected:true 只证明 Native 可达；还须检查 target/targetError、Host 列表。多个 Host 时明确选取真实 registrationId。

Controller deadlineMs 为 1000–120000，默认 30000。run.completion:PENDING 只表示入场。核对 `revision.sourceHash === source.sourceHash`，再查原 runId 的 state、retirementState、resultId、value/error。普通成功运行必须完成并释放 Worker；没有持久结果不能当成功。

source.inputHash 绑定源码图、配置、资产、框架 helper 与编译器版本；source.sourceHash 绑定最终执行字节。仅修改注释时输入图可以变化而压缩后执行字节不变，按真实哈希解释。

## Resolver 和安全边界

每次运行重新读取入口依赖图及声明资产，缓存命中时也重新验证。多文件 ESM 使用仓库固定 Webpack 配置，只读冻结内存文件系统，不执行项目配置、loader、plugin、shell 或网络解析，不落盘开发产物。无需转换的单文件 Controller 保留原执行字节。

| 范围 | 当前行为 |
| --- | --- |
| 单文件 Controller | async body/main，不强制 package.json，类型和精确 HTTP(S) origin 必填 |
| 多文件 ESM | 既有 package.json.opendesk，静态相对 import，入口 default export |
| @opendesk/ui 与 Page 资产 | Resolver 复用现有 CSS/JSON/图片合同；不等于 Page 运行已验收 |
| npm/HTTPS import | **目前仍拒绝 `E_DEV_DEPENDENCY`**；正式 `build:program` 已分别支持经 npm lock / HTTPS SHA-256 锁定的编译产物，但不代表本地开发 Resolver 可即时加载 |
| 动态代码 | 不支持 dynamic import、require、项目 loader、eval/Function 等 |
| 路径 | canonical realpath、根 inode、内部 symlink、遍历、隐藏和常见密钥文件检查 |
| 传输 | 只传执行需要的代码和资源，不传源文件树、绝对路径、source map 或整个工作区 |
| 缓存 | 内存缓存；最新图和最终验证一致才复用，源码错误不退回旧版 |
| 并发修改 | 发现读取/转换期间变化则拒绝；新一次有意运行重新读取 |
| 执行时改文件 | 现有 Worker/revision/target 冻结，仅影响下次运行 |
| 项目 ID/类型变化 | 显式 detach/attach 后才能使用，不暗中切换环境 |
| 已安装任务 | 原不可变版本和既有运行链，不需要 MCP 或开发目录 |

输入快照最多 100 文件、384 KiB；现有项目验证器和各资产类型另有更小限制。最终 Controller/Page 字节上限仍为 65536/100000；Native **完整 JSON envelope 为 60 KiB**，含转义、参数和元数据，可传源码实际更小。超限如实拒绝，不关闭检查、不加未经验证分包。

Native 继续校验明确扩展 origin、私有安装/凭据/Socket。MCP 不对网页监听 HTTP。浏览器再次检查网站授权和 windowId/tabId/frameId/documentId/url；读取期间导航不能把旧运行送到新文档。

## 错误与恢复

- 源码缺失、语法、越界、体积：拒绝本次；diagnostics 给出真实错误与可得位置。
- Native/Host 不可用：准确报错，不启动备用 CDP 引擎。
- 已发送后断线或 OUTCOME_UNKNOWN：保留原 requestId/runId，核对原结果与网页状态，不换 ID 盲目重复副作用。
- 网站撤权：拒绝新运行，历史结果遵守 Authority 的交付权限。
- 当前 MCP 进程重启不自动恢复绑定和 Session run 归属；重新 attach 项目不等于接管旧 run。
- Sidebar 重开产生新 Host 身份，不能冒充旧 registrationId。
- 运行错误保留真实生成堆栈/消息；未完成映射的源码行号不编造。

## npm / HTTPS 构建依赖与直连的区别

- 本地开发 Resolver：静态相对 ESM / 内置 Page UI；经 MCP/Sidebar 连接最新源码，不需要手工生成 JSON。
- 正式发布构建器：用项目的 `package-lock.json` 固定 npm；如引用 HTTPS ESM，首次明确执行 `npm run build:program -- <项目> --lock-remote`，提交锁和缓存；随后不加该参数离线构建。最终可导入 `program.opendesk-draft.json`。
- 在同一 Local Dev 连接中输入 npm/HTTPS import 仍报 `E_DEV_DEPENDENCY`；**不得隐式替换成网络 fetch、eval/CDP 或创建第二套 RunHost**。后续若要贯通，需复用现有构建器并完成授权目录、来源哈希、目标文档与真实 Chrome 验收。

详见 [HTTPS ESM 构建规范](../architecture/browser-framework/https-esm-imports-r1.zh-CN.md) 和 [统一开发操作](../product/program-development-dual-format-and-sidebar.zh-CN.md)。

## 正式打包与验收

只有需要不可变产物、导入或发布时执行：

```sh
npm run build:program -- examples/programs/local-controller
```

既有 program.js、artifact、草稿包和 Task v1 Candidate 输出保留，用于冻结交付。Candidate → Verification → Available → 显式 Installed 合同不变；MCP 成功或 Git commit 不等于安装、发布或最终框架验收。

组件：`node --test tests/environment/local-dev.test.mjs`。

真实 macOS Chrome：提供 CHROME_FOR_TESTING_BIN 后执行 `node tests/framework/local-dev-native-acceptance.mjs`。仅在专用测试账号/独立 profile 运行，不覆盖已有 Native 安装。通过系统原生输入批准 Chrome 对话框；CDP 仅测试观察和可信输入，项目始终通过 MCP/Native/原 Controller 执行。

保存 sourceHead、完整包身份、Chrome 版本、原生授权、两次 runId/resultId/sourceHash/documentId、持久结果与收尾。Node、编译、真实包内 tool 标签、真实 Sidebar、Page UI 和实际 Codex 客户端分别记录证据等级。
