# 快速入门：从源码到浏览器结果

[返回总入口](README.md)。从已有开发环境开始；尚未配置时先看本文[首次配置](#首次配置)。命令在选定的仓库根目录执行，绝对路径换成该目录的实际路径。

## 跑通多文件 Controller

1. 确认同一个 MCP 进程保持运行，`--allow-project` 包含 `examples/programs/local-controller`，扩展与 Native Host 都包含当前能力。
2. 演示服务尚未启动时，先用 `lsof -nP -iTCP:43111 -sTCP:LISTEN` 检查端口归属。空闲时运行：

   ```sh
   python3 -m http.server 43111 --bind 127.0.0.1 --directory examples/tasks
   ```

   打开 `http://127.0.0.1:43111/demo-form.html` 和同窗口 OpenDesk Sidebar。标题及 h1 是 `OpenDesk Browser Test Lab`。已有服务须核实是此页面，不终止他人服务；若用其他端口，同步修改 Controller `siteOrigins` / 单文件 `siteOrigin` 并重新授权。Python 只提供 HTML，真实网站不用它。
3. 由 MCP 客户端调用下面的工具。它们是工具名称/参数，不是网页控制台全局方法：

   ```json
   {"name":"opendesk.dev.status","arguments":{}}
   ```

   从 `projects` 取得此项目真实 `bindingId`。允许目录在 MCP 启动时自动绑定；也可显式调用：

   ```json
   {"name":"opendesk.dev.attach","arguments":{"path":"/Users/shopme/Documents/workspace/opendesk-browser/examples/programs/local-controller"}}
   ```

   目录只传 path，类型与网站范围来自 package。attach 的 connected 只表示绑定；检查 status 的 Native、Host、target/targetError。多个 Host 时，在 status/run 中传实际 `registrationId`。
4. 替换下面的 bindingId，明确运行：

   ```json
   {"name":"opendesk.dev.run","arguments":{"bindingId":"从 status 取得的 bindingId","requestId":"tutorial-controller-1","params":{}}}
   ```

   预期取得 `runId`、`revision`、`source`。`completion:"PENDING"` 只是入场。保存 runId 后查询：

   ```json
   {"name":"opendesk.dev.result","arguments":{"runId":"刚返回的 runId"}}
   ```

   在返回的 `run` 和匹配的 `results` 中核对完成、持久 resultId 与 `retirementState:"released"`。当前示例的顶层 JSON `value` 是 `{version:1,title:"OpenDesk Browser Test Lab"}`；持久记录保存 `outcome.valueWire`，详见[Controller 结果合同](controller.zh-CN.md#读取持久结果)。
5. 把 [src/extract.js](../../examples/programs/local-controller/src/extract.js) 的 `version:1` 改为 `version:2` 并保存。再次明确 run，使用新的 `requestId`（例如 `tutorial-controller-2`）。新结果应为 version 2；重新查询旧 runId，旧值仍是 version 1，旧 resultId 和源码版本不变。两次之间无需构建扩展或生成项目 JSON。

可直接给已配置 MCP 的 Codex 以下指令：

> 使用已授权 local-controller，在当前 demo-form.html 运行并查到持久结果。将 extract.js 的 version 改为 2，保存后明确再次运行。报告两次 runId、resultId、sourceHash 和释放状态，并重新查询旧结果。未知效果不要自动重放。

## 换入口

| 需求 | 操作 | 预期 |
| --- | --- | --- |
| 单个 JS | 授权 [title.js](../../examples/programs/local-controller/title.js) 本身，按[单文件 attach](local-projects.zh-CN.md#单文件)指定类型和 origin | 标题、URL、输入 value；无需 package |
| Sidebar 本地目录 | 「开发」开启「本地项目」→「刷新」→选择 local-controller → 参数 `{}` →「运行草稿」 | 读取目录最新源码，仍是 Controller 结果 |
| 网页 UI | 授权 local-page-ui、允许用户脚本，按[Page 教程](page-userscript.zh-CN.md)运行 | Shadow DOM 按钮、计数器、PNG；previewId |
| npm / HTTPS | 按[依赖教程](dependencies-and-errors.zh-CN.md)准备项目锁、安装目录或缓存，再 attach 目录 | 内存构建；run 不下载或生成锁 |

运行中 Controller 用原 runId Stop，再查询收尾；已完成短程序无需停止。受管 Page 用原 previewId Stop，或原 Sidebar 的「停止受管 UI」，只清理登记资源。丢 run 回执时，在同一 MCP 会话以原 requestId 作为 admissionRequestId 只读查询；断连/导航时先看[恢复规则](dependencies-and-errors.zh-CN.md#断连和未知结果)。

## 首次配置

只在缺少环境时执行一次，已有正确配置则跳过。本轮文档工作没有执行安装。

1. `node --version` 确认 Node >=22.12.0。仓库工具依赖缺少时执行 `npm ci --ignore-scripts`。使用匹配开发扩展；源码构建/加载、Native 浏览器和 profile 参数见[原配置指南](../framework/local-development-r22.zh-CN.md#首次配置)。
2. 从 Chrome 读取真实扩展 ID。首次 Native 配置用 `node native-agent/cli.mjs setup --extension-id "实际扩展ID"`，诊断用 `node native-agent/cli.mjs doctor`。旧 Host 是复制安装快照，源码更新不会自动更新它；确需 update 时先收尾旧运行、停用 Native，再按原浏览器/profile 更新。
3. 检查已有 MCP 配置，避免重复 provider；缺少时配置一次：

   ```sh
   codex mcp add opendesk-dev -- node "/Users/shopme/Documents/workspace/opendesk-browser/native-agent/local-dev/mcp.mjs" --allow-project "/Users/shopme/Documents/workspace/opendesk-browser/examples/programs/local-controller" --allow-project "/Users/shopme/Documents/workspace/opendesk-browser/examples/programs/local-page-ui"
   ```

   `--allow-project` 最多八个确切目录或 JS 文件。目录授权不自动允许其中某个文件作为独立绑定。云端客户端不能直接读 Mac `/Users/...`。
4. 在扩展设置批准 Native，独立批准目标网站，保持同窗口 Sidebar/工作台。Page 在 Chrome 扩展详情开启「允许用户脚本」。预期 status 的 Native 和目标均可用；doctor/attach 成功不等于可以运行。

首次失败先查 Native 版本、允许路径、权限和真实 Host/文档。完整参数见[七个工具](mcp-local-development.zh-CN.md)。
