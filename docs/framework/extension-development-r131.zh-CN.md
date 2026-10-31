# 扩展源码开发：持续编译与自动刷新（R13.1）

> **维护者/管理员专用。** 本页中的 WXT、`npm run dev`、`dist/development`、Chrome 扩展 ID 和生产包验收，都是 OpenDesk Browser 插件本体的开发操作。**普通用户在「扩展」里创建、修改、更新应用，不需要执行这些命令**；请用 [扩展应用普通用户指南](../product/extension-app-user-workflow.zh-CN.md)，由 Codex 通过原 Sidebar App 构建器准备包，再由原安装界面确认更新。涉及 `trusted/` 固定入口改动时仍需管理员处理 Browser 本体。

这页用于修改 OpenDesk 扩展自身的 `src/` 源码。Sidebar 编写用户脚本、Native/MCP 读取本地项目，请继续使用[程序开发指南](../product/program-development-dual-format-and-sidebar.zh-CN.md)。源码更新不会替你运行用户脚本。

## 先确认当前运行方式（2026-10-14）

| 运行方式 | 一级 Tab | 自动更新 | 用途 |
| --- | --- | --- | --- |
| `npm run dev`，Chrome 加载本仓库 `dist/development`，开发客户端连接成功 | 五个产品 Tab +「调试」 | 监听源码、增量编译；按变更类别热加载或安全刷新/重载 | 日常开发和缺陷修复 |
| `npm run build:dev` 的静态 development 包 | 五个产品 Tab +「调试」 | 没有持续开发客户端；保存源码不会自动更新已加载包 | 静态开发包检查 |
| `npm run build` 的 production 包 | 我的、扩展、工作流、开发、云控 | 没有开发服务或热更新 | 冻结候选及正式产品验收 |

这三种方式以 `src/entrypoints/tool-shell.js` 的 `MODE`（调试 Tab）与 `COMMAND==='serve'`（开发连接）分别控制。**看见「调试」只证明 development UI 被启用，不能证明热更新已连接。** Chrome「开发者模式」只是允许加载未打包扩展；产品「开发」Tab 是用户脚本工作台，都不等同于扩展源码的持续开发。

Standard/Developer edition 是另一个打包维度；当前 `npm run dev` 默认 Developer edition，静态构建默认 Standard。实际名称、edition、权限和包身份分别核对，开发版的行为不能直接当作 Standard production 的验收结果。

先在持续开发环境修复并做定向验证，收敛后再冻结 production 候选，在验收专属 CFT/Profile 检查正式五 Tab 和真实流程。验收发现缺陷，回到持续开发环境修改，再对新候选补受影响验证。不要把反复全量构建、复制 production 目录及重新安装作为日常修改循环；也不要用开发截图代替正式包证据。

开始工作及切换模式时，记录实际加载路径、扩展 ID、构建模式/edition、开发连接状态和指纹。已有 watcher 存活时复用它，不再启动第二个写入者；只有完成对应资源协调后才能停服务或构建共享目录。独立冻结快照仍遵循现有并行开发协议。

开发配置恢复时，WXT 本地模块 `modules/development-build.js` 重新读取同一代构建 hooks 及其仓库内传递依赖，避免 Node 原生 ESM 缓存继续使用旧入口白名单或旧发行生产者。增量源码编译复用这代 hooks，下次配置恢复才切换；生产静态构建不启用。该机制只刷新 hooks，不承诺 WXT 已重读其首次捕获的 Vite 基础配置，也不改变 runner、edition、输出目录或安全刷新条件。

## 第一次启动

持续开发要求 Node.js >=22.15.0（推荐当前 Node 24），Chrome >=138。开发配置的传递模块刷新使用 Node 原生 `module.registerHooks`；生产静态构建不启用该刷新器。

```sh
cd /Users/shopme/Documents/workspace/opendesk-browser
npm ci --ignore-scripts
npm run dev
```

等待终端显示 `RUNNING`。服务已准备静态资源、生成 WXT 入口并完成首次构建；它会一直运行，直到 Ctrl+C。

自行打开 Chrome，访问 `chrome://extensions`，开启开发者模式，点击「加载已解压的扩展程序」，选择这个**具体文件夹**：

```text
/Users/shopme/Documents/workspace/opendesk-browser/dist/development
```

打开任意可使用扩展的 HTTP(S) 网页，点击工具栏的 OpenDesk 入口打开 Sidebar。在「调试」页展开「本地开发服务」，可查看连接状态和构建指纹；开发诊断不显示在正常页签顶部。

如果此前已从同一个目录加载过 `build:dev` 的静态包，在首次切换到持续开发时，点击扩展卡片的「重新加载」一次，再打开 Sidebar。以后保留同一加载目录，不需重复安装或打包 ZIP。

若已安装工具打开后显示“该文件可能已被移至别处、修改或删除”，先检查加载目录里的 `manifest.json`、`sidepanel.html` 和 `sidebar-tools/sandbox.html`。WXT 全量构建失败可能只留下部分 JS，工具 JSON 本身仍然有效；修复日志中的构建错误，再恢复同一个 `npm run dev`，无需卸载工具。当前可信工作台 `ui/tool-shell.js` 在两种模式下的硬预算为 3 MiB（2 MiB 提醒线）；Sidebar Tool Host `ui/sidebar-tool-host.js` 在两种模式下统一为 1 MiB，替代原 516 KiB 小幅例外。这些是项目工程预算，不是 Chrome 体积限制；普通生成入口仍为 512 KiB，SW 生产为 1 MiB、开发为 1.5 MiB。构建和包验证共用 `scripts/build-contract.mjs` 的门禁，CSP、来源锁定及其他入口限制继续生效。

日常源码开发始终使用上述 `dist/development`。`~/.opendesk-browser/extensions/local-dev-<会话标识>` 是历史会话手工复制的静态安装包，`npm run dev` 不会更新它。隔离验收包只加载到验收专属 CFT/Profile，不替换日常 Chrome 的开发扩展；不要为日常修复再复制到一个新目录。

切回已有 `dist/development` 扩展时，核对其真实 ID 与 `opendesk browser doctor` 的 `local.extensionId`，以及 Native manifest 的 `allowed_origins`。加载目录变化可能产生另一个 ID，启用扩展和 Go 配对必须一致。跨 ID 的 `setup/update` 会返回 `E_EXTENSION_ID_CONFLICT`；先备份并收尾旧连接，再由所属 Go 的 `cleanup` 和 `setup --extension-id <正常开发扩展的真实ID>` 重新配对，最后在该扩展设置页连接并用 doctor 验证。`cleanup` 会撤销旧目录/项目授权，有授权时先记录并妥善处理，不能为改目录直接删 Native 安装文件。旧静态副本停用、需要保留的证据及数据备份后，可移除该副本。

`npm run dev` 默认不启动浏览器。需要独立 Chrome for Testing 时，按现有 `npm run dev:chrome` 帮助启动；它是另一个浏览器启动流程，不是持续编译服务。

## 每天开发

```sh
cd /Users/shopme/Documents/workspace/opendesk-browser
npm run dev
```

保留这个终端。修改源码并保存，WXT/Vite 根据已记录的模块依赖图增量编译相关入口；静态 HTML/CSS 从源码同步到 WXT public 后进入同一监听队列。输出始终在 `dist/development`。

| 修改内容 | 自动行为 | 用户需要做什么 |
| --- | --- | --- |
| `src/ui/tool-shell.css` | 替换样式表链接，同一文档热加载 CSS | 无需刷新 |
| `src/ui/sidepanel.html`、Sidebar JS | 保存草稿后刷新工具文档，建立新宿主身份 | 未释放的任务结束后自动应用 |
| 共享 JS 模块 | WXT 重建实际依赖它的入口，再按入口种类更新 | 根据下述生命周期处理 |
| Background、Native transport、运行宿主或其他扩展资源 | 所有宿主确认安全后重载扩展 | Chrome 会关闭扩展页/Sidebar，重新打开 Sidebar |
| 页面注入 JS、SDK、relay、packaged page-session | 更新文件；保留现有业务文档和安装实例 | 需要新文档时自己刷新业务网页，再明确运行/授权；已经注入的实例不会自动替换 |
| 构建配置、依赖或开发启动脚本 | 配置可触发 WXT 重启；启动脚本需要重启 Node 进程 | Ctrl+C 后重新 `npm run dev` |

这里的 CSS 热加载、工具页面刷新和扩展重载是三种不同机制。经典 IIFE 入口使用增量构建与安全刷新；不会承诺所有模块都能保持内存状态热替换。

正在执行的 Controller、未退出的 USER_SCRIPT 预览、Native 请求、未释放资源或未知效果会延后刷新。历史 Controller operation/navigation 的 `effect_unknown` 只有在精确关联失败、停止或中断的 Run，Worker 已退役、资源已 released，且匹配同 runId/retirementId、releaseCount=1 的正式退役回执后，才不再阻挡开发刷新；未知审计仍保留且不能重放。缺失或冲突的回执、SDK/Native 未知结果继续阻挡。先按原有 Stop/恢复流程处理；未知效果不要盲目重放。开发更新不会自动运行草稿、点击网页、提交表单、下载文件或重放任务。

可信工具页在异步草稿保存前后还要核对共享 AI Provider 的整轮请求状态：两次 Native 事件轮询之间仍在推理，不能因单个 RPC 已返回而确认刷新；仍在对账的旧 Provider 代际也必须等待。消费者关闭后，未确认退休的原 Native lease 继续阻挡当前 Host 刷新，不能因移除 UI 而清除；取得原回合可信终态并收尾后才释放。该检查只覆盖当前 Host 保有的请求关联，不会替已销毁 Host 找回历史终态。原 AI 请求返回 unknown 时继续按原身份查询，不通过新请求、清锁、重载或无关联 IDLE 解除。

工具页刷新前保存手工草稿到 `storage.session`，扩展重载前另存开发专用 `storage.local` 备份；只有编辑器仍为初始状态时才恢复，用户已经输入的新代码不会被覆盖。正式静态包不启用开发连接和备份。

## 确认自动更新

打开 Sidebar，在 `src/ui/tool-shell.css` 末尾临时加入并保存：

```css
.workbench-nav { outline: 3px solid #ff00aa !important; }
```

导航应出现品红色描边。删除这行并保存，描边消失；CSS 热加载不显示成功提示。整个过程不用 `build:dev` 或手动刷新扩展。终端的编译成功只证明产物完成；以 Chrome 中的实际变化为准。

手工运行草稿的标准测试页面：

```sh
python3 -m http.server 43111 --bind 127.0.0.1 --directory examples/tasks
```

打开 `http://127.0.0.1:43111/demo-form.html`。此 HTTP 服务仅提供测试网页。

## React 应用与共享 UI 的简单检查

日常开发只选受影响的一条最短操作链，不遍历全部 SDK：在真实 Side Panel 的本地应用中读取/保存一条隔离测试记录；修改应用 JSX 的可见文字后恢复；涉及共享 UI 时，再对实际使用的一个共享组件做一次可见变更及恢复。应用项目的 Vite/stage watcher 与 Browser 的 `npm run dev` 各自复用已有实例。

`@opendesk/ui` 的沙箱组件通过固定 `src/entrypoints/sidebar-shared-ui.js` 从唯一 `src/ui/react/components/ui/` 提供，复用同一组件源码不等于共享特权。应用 JSX 快照替换、共享 UI 资源更新、可信 React 工作台更新和 iframe 内 SDK 调用应分别记录。共享 UI/可信 React 改动按依赖入口触发安全刷新或扩展重载；重载后重新打开界面属于现有机制，不冒称原地 React Fast Refresh。

没有新失败、代码变化或证据失效时复用已有结果；全量 SDK、正式包验收及评分只在明确要求时执行。应用级操作见 [Quick Notes React](../../examples/sidebar-tools/quick-notes-react/README.md)。

## 停止、恢复与排错

在开发终端按 Ctrl+C。输出目录保留；监听队列和写入释放后终端显示 `Stopped`。再运行 `npm run dev` 恢复服务。停止服务不会重放任务。

- 端口 `43119` 是本机开发服务，`43120` 是互斥输出守卫。看到端口占用错误时，核对已有服务的 PID，停止自己的旧服务；不要另选输出目录或盲目杀掉其他人的 Chrome。
- 不能同时运行第二个 `dev`、`build` 或 `build:dev`：它们共享 `.wxt/public` 与开发输出，命令会保守拒绝重叠写入。异常退出后 OS 自动释放守卫；旧 PID 元数据经存活检查后可恢复。损坏的元数据会明确报错，不自动覆盖未知所有者。
- Sidebar 显示等待任务/资源时，查看原有运行状态及持久回执。任务完成或正式释放后会再检查；未知结果必须先恢复处理。
- 「调试」页的「本地开发服务」未确认连接：确认扩展加载的是上述文件夹、服务已到 `RUNNING`，首次从静态包切换时重新加载扩展一次。开发连接断线会解除临时界面冻结并按退避重连，业务请求不会重放。
- 语法错误或缺失静态资源：根据终端文件名修正并保存。不要把旧界面当作新构建已经应用。
- 注入脚本变化看不到：已有文档保留旧生命周期。自己刷新目标网页，并重新明确运行或授权。

交付静态包前先停止开发服务：

```sh
npm run check
npm run build:dev
npm run build
npm test
npm run verify
```

先构建再测试，包溯源测试会核对两个目录的实际输出哈希。macOS 的完整 `npm test` 还包含独立的真实 Native Messaging 安装/授权测试，需要其受控 Chrome 环境；该测试不等同于源码热更新验收。

静态构建继续使用原有固定 classic 文件、资源清单、CSP 和字节预算。持续开发输出包含开发专用更新清单，不能代替正式验收候选或发布包；本次不需要 ZIP。


## 官方可选工具资源（R4.5）

`official-tools/catalog.json` 登记可信项目，正式与开发构建从其实际 `projects/<id>/` 或 `examples/sidebar-tools/<id>/` 生成发行资源。有唯一正式 `<id>.opendesk-tool.json`（或明确的 `packageFile`）时，验证并逐字节发布该包，输入指纹只跟踪正式包；未晋升的源码编辑和未完成编译不阻塞其他工具发行。没有正式包的项目才按原源码/编译回执合同打包；已存在但无效的正式包必须报错，不能回退源码。`npm run dev` 监听这两个项目根并沿用原发布队列，失败不发布新就绪标记；资源写入 `.wxt/public/official-tools/...` 和最终 `dist/{production,development}/official-tools/...`。生成不安装、不执行工具，也不改变网站许可；旧安装更新仍须审核。详见 [官方 Catalog API](../api/official-tools-catalog.zh-CN.md)。

官方目录的数据修改及工具增删只刷新其自有资源清单，沿原子写入队列发布，不触发 WXT 重启或清空 `dist/development`。所有工具共用的 `sidebar-tools/sandbox.html` 保持可用；纯目录/JSON 更新也不重载现有工具页。源码、构建配置或可信运行时代码的更新仍按上文安全刷新合同处理。本规则修复了目录变化可能造成共享沙箱短暂缺失的开发环境问题，不代表已经复现并确认每一次 Chrome 文件丢失报错。

Sidebar 导入在解析能力前、审阅时和确认提交前核对安装器与实际 Worker 的能力合同。不一致或 Worker 不支持核对时保留旧安装并停止本次操作；真正未知的能力仍由唯一包校验器拒绝。技术详情显示实际扩展 ID、版本及双方合同摘要。合同一致只证明所声明的包能力/格式/预算一致，不证明所有 Host 功能、已注入网页代码或整个 bundle 同版，也不能代替正式来源、权限和撤权检查。


### 本地应用调试入口简化（2026-10-29）

「开发 → 本地项目 → 在侧栏调试」直接进入开发会话，不增加隔离存储的第二次批准、独立停止按钮或“已批准”提示。隔离数据、来源/窗口/实例核验和停止后的失效仍在原 Host 内处理；退出统一用「停止调试」。详见[工具开发说明](../api/sidebar-tool-development.zh-CN.md#直接调试与开发数据隔离2026-10-29)。
