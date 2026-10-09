# 扩展源码开发：持续编译与自动刷新（R13.1）

这页用于修改 OpenDesk 扩展自身的 `src/` 源码。Sidebar 编写用户脚本、Native/MCP 读取本地项目，请继续使用[程序开发指南](../product/program-development-dual-format-and-sidebar.zh-CN.md)。源码更新不会替你运行用户脚本。

## 第一次启动

要求 Node.js >=22.12.0，Chrome >=138。

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

打开任意可使用扩展的 HTTP(S) 网页，点击工具栏的 OpenDesk 入口打开 Sidebar。顶部出现「开发服务已连接；保存源码后自动更新。」表示工具页已获得后台确认。

如果此前已从同一个目录加载过 `build:dev` 的静态包，在首次切换到持续开发时，点击扩展卡片的「重新加载」一次，再打开 Sidebar。以后保留同一加载目录，不需重复安装或打包 ZIP。

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
| `src/ui/tool.html`、Sidebar JS | 保存草稿后刷新工具文档，建立新宿主身份 | 未释放的任务结束后自动应用 |
| 共享 JS 模块 | WXT 重建实际依赖它的入口，再按入口种类更新 | 根据下述生命周期处理 |
| Background、Native transport、运行宿主或其他扩展资源 | 所有宿主确认安全后重载扩展 | Chrome 会关闭扩展页/Sidebar，重新打开 Sidebar |
| 页面注入 JS、SDK、relay、packaged page-session | 更新文件；保留现有业务文档和安装实例 | 需要新文档时自己刷新业务网页，再明确运行/授权；已经注入的实例不会自动替换 |
| 构建配置、依赖或开发启动脚本 | 配置可触发 WXT 重启；启动脚本需要重启 Node 进程 | Ctrl+C 后重新 `npm run dev` |

这里的 CSS 热加载、工具页面刷新和扩展重载是三种不同机制。经典 IIFE 入口使用增量构建与安全刷新；不会承诺所有模块都能保持内存状态热替换。

正在执行的 Controller、未退出的 USER_SCRIPT 预览、Native 请求、未释放资源或未知效果会延后刷新。先按原有 Stop/恢复流程处理；未知效果不要盲目重放。开发更新不会自动运行草稿、点击网页、提交表单、下载文件或重放任务。

工具页刷新前保存手工草稿到 `storage.session`，扩展重载前另存开发专用 `storage.local` 备份；只有编辑器仍为初始状态时才恢复，用户已经输入的新代码不会被覆盖。正式静态包不启用开发连接和备份。

## 确认自动更新

打开 Sidebar，在 `src/ui/tool-shell.css` 末尾临时加入并保存：

```css
.workbench-nav { outline: 3px solid #ff00aa !important; }
```

导航应出现品红色描边，顶部显示「样式已自动更新」。删除这行并保存，描边消失。整个过程不用 `build:dev` 或手动刷新扩展。终端的编译成功只证明产物完成；以 Chrome 中的实际变化为准。

手工运行草稿的标准测试页面：

```sh
python3 -m http.server 43111 --bind 127.0.0.1 --directory examples/tasks
```

打开 `http://127.0.0.1:43111/demo-form.html`。此 HTTP 服务仅提供测试网页。

## 停止、恢复与排错

在开发终端按 Ctrl+C。输出目录保留；监听队列和写入释放后终端显示 `Stopped`。再运行 `npm run dev` 恢复服务。停止服务不会重放任务。

- 端口 `43119` 是本机开发服务，`43120` 是互斥输出守卫。看到端口占用错误时，核对已有服务的 PID，停止自己的旧服务；不要另选输出目录或盲目杀掉其他人的 Chrome。
- 不能同时运行第二个 `dev`、`build` 或 `build:dev`：它们共享 `.wxt/public` 与开发输出，命令会保守拒绝重叠写入。异常退出后 OS 自动释放守卫；旧 PID 元数据经存活检查后可恢复。损坏的元数据会明确报错，不自动覆盖未知所有者。
- Sidebar 显示等待任务/资源时，查看原有运行状态及持久回执。任务完成或正式释放后会再检查；未知结果必须先恢复处理。
- 顶部未确认连接：确认扩展加载的是上述文件夹、服务已到 `RUNNING`，首次从静态包切换时重新加载扩展一次。开发连接断线会解除临时界面冻结并按退避重连，业务请求不会重放。
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
