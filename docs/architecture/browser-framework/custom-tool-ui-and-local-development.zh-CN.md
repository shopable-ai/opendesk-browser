# OpenDesk Browser：可选工具 UI 与本地开发接入框架

日期：2026-10-10。本文区分已实施和待实现，不是 macOS Chrome/Native 验收报告。

## 独立选择、共享业务能力

功能与数据为主体，UI 可选；经典 HTML/CSS/JS 与预构建 Vue/React 可复用同一安装包机制；Side Panel 和扩展标签页只是不同的容器。AI/工作流通过经授权的功能接口访问业务数据，不依赖知识库管理 UI 开启。客服自动监听属于 Task/RunHost，不能依赖工具 iframe 计时器。真实写入必须有权限、版本检查、日志及审核，不信任外部聊天内容产生的授权指令。

## 已实施：同一安装版 UI 可在侧栏与标签页打开

`src/ui/sidebar-tools.js` 继续作为唯一的安装版工具宿主。侧栏已安装工具列表和打开后标题栏提供 ↗，仅导航到固定扩展页 `ui/tool.html?toolId=<id>`。标签页复用 `createSidebarTools`：先读取已安装包及网站权限，随后创建 **`sidebar-tools/sandbox.html` opaque-origin iframe**，通过现有 postMessage 协议调用被批准的接口。工具 HTML/JS 不进入特权宿主 DOM。侧栏与全页面各有实例令牌，工具数据使用已有命名空间及 Chrome 锁；卸载/更新撤销过期实例。

新增 `src/ui/sidebar-tools/navigation.js` 限制路由为固定页面和严格工具 ID。URL 不传任意路径、脚本、密钥或授权令牌。无须新增 WXT 入口、MV3 Manifest 权限、第二个工具 schema 或宿主。旧 `opendesk.sidebar-tool.v1` 包和 Task/RunHost/R17 均保留。

## 已有开发入口：手动打包并导入

```bash
node /path/to/opendesk-browser/scripts/build-sidebar-tool.mjs /path/to/my-tool
```

`tool.config.json` 必须给出 HTML/CSS/经典 JS；生成 `.opendesk-tool.json` 后由用户审阅能力、安装并主动打开。简单 UI 不需要框架编译。Vue/React 需先经独立 Vite 项目构建成本地单 IIFE、CSS/HTML；动态分块、远端 CDN、服务端渲染默认不支持。现有预算为 HTML 64,000 字符、CSS 120,000、JS 220,000、总包 320,000 字节；不要把 gzip 大小当作原始包大小。浏览器工具 UI 编辑不要求重新编译浏览器扩展本身。

R17 `opendesk browser` 已能接入本地目录到 Workspace，但**不意味着 UI 包自动构建、同步或预览**。本阶段没有擅自执行 npm scripts、扩权或创建新 CLI。

## 待实现：自动同步、可选完整应用与 AI 数据操作

1. 已授权目录识别工具清单，用户明确启用开发预览并审批构建命令。原生 UI 直接打包，Vue/React 监听成功构建事件，不能使用 `vite build --watch && pack` 期待每轮构建。
2. 在现有 Native Provider / Workspace 授权上定义 `sourceId + toolId + buildId + SHA-256` 完整产物快照与分块校验。绑定真实目录/版本，不混读不同时间磁盘内容，不把 `sourceId` 当权限。
3. 开发预览与正式安装隔离：默认只读/Mock，不允许刷新 UI 就取得发送消息、写真实数据或运行 Task 的授权；更新时旧 token 失效。构建失败和断线必须准确显示旧预览状态。
4. Vue/React 各一个锁定版本的可构建模板与真实 Chrome 用例；确认 IIFE/CSS 文件大小。正式版本需人工核对权限后从完整快照安装，断开开发进程仍可运行纯本地 UI。
5. 受控业务 API 处理知识版本、审计、AI/UI 并发写入；UI 全部关闭时仍能经授权调用。不能以管理 UI/客户指令当作授权凭证。

## 验收与安全边界

本次增加 `tests/environment/tool-ui-tab.test.mjs` 和宿主测试。受影响的真实检查：

```bash
node --test tests/environment/tool-ui-tab.test.mjs tests/environment/sidebar-tools*.test.mjs
npm run check
npm run build
npm run verify
```

Mac Chrome 需核对已加载构建的扩展 ID/版本/路径，在 Side Panel 和标签页实际打开同一工具，检查独立会话、TOC 授权、卸载撤销、两个实例并发、窄屏、无代码自动执行以及原 Task/RunHost/Workspace 回归。**本次远端 GitHub 接入没有提供本机 Chrome/Go 真实验收，不宣称 95 分 PASS。**

参考：`docs/product/sidebar-custom-tools-r1.zh-CN.md`、`docs/framework/local-directory-cli-r17.zh-CN.md`。
