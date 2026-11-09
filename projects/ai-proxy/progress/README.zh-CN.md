# 完成情况网页入口

本页属于 AI Proxy 的只读交付展示，不是新的应用、Host 或代理 Service。复用 `../preview/preview.html` 视觉参考与原 `examples/sidebar-tools/header-actions-demo/preview/serve.mjs` 源码夹具；不写 dist、安装记录或真实代理状态。

在仓库根运行（依赖已存在的 node_modules）：

```sh
node projects/ai-proxy/progress/serve.mjs
```

默认打开 http://127.0.0.1:43264/ 。端口占用时用 `OPENDESK_PROGRESS_PORT=43265 node projects/ai-proxy/progress/serve.mjs`，或设为 0 使用自动端口；以启动回执 URL 为准。

启动器 writer 为本任务，固定监听 loopback。启动器只启动一个原 Demo 子进程，其随机端口由 `/demo` 自动转到；`/health` 可查看 PID、Demo URL 与错误。Demo 启动失败时状态页/参考页仍可查看，Demo 链接明确返回 503。Ctrl+C 或对启动器发 SIGTERM 只关闭本启动器及其自有子进程，保留其他服务。交付时保持服务运行；退出后可用同一命令重开。

使用：

1. 从首页「打开双界面 Demo」进入原源码夹具，打开 PC 首选项，修改名称后保存读回，回侧栏重新读取。同浏览器示例数据与模拟安装记录只用于演示。
2. 「打开 AI Proxy 视觉参考」查看原 R18/R16，切换侧栏/PC 与七个栏目。所有代理/保存/诊断均是模拟，不会设置 Chrome 代理。
3. 真实运行请在已有扩展中打开 AI Proxy → 管理设置/管理全部 → PC 保存读回 → 关闭 PC → 侧栏重开读取。实际代理申请仅在有控制权的隔离环境经原权限审阅，不从普通网页申请特权。

首页提供原验收报告、CI run、唯一正式包与已存在的本机证据。原始结果/截图在忽略目录，缺失返回明确 404；已提交报告仍可用。服务器采用固定路由白名单，不暴露整个仓库，不提供写 API。

本页核心结论绑定 c1a95457b / 0.3.9 的冻结 development 候选，非实时监控；不能外推为当前 dirty 工作区、production 或日常 Chrome 已通过。最新 CI 分类见 `CI.zh-CN.md`。

## 本轮实际检查（2026-11-09）

- `node --check projects/ai-proxy/progress/serve.mjs`、本任务 diff 空白检查通过。
- 本地15条页面/资料/下载路由正确（Demo 为302，其余200），未知路径和目录穿越404，POST405；两包字节数与 SHA-256 和旧候选一致，附件下载头正确。
- ego TaskSpace57：从首页点击 Demo → 从侧栏打开 PC 首选项 → 修改名称为“状态页验看工作台” → 保存回执和读回匹配 → 原侧栏重新读取显示同名。使用实际 ToolHost/Bridge 的源码夹具，不是新的 Chrome 安装测试。
- 从首页打开原 AI Proxy 参考 → 管理全部显示 PC → 网络诊断显示“所有结果均为模拟”。没有进行代理启停、诊断或授权操作。
- 桌面1360×1000：四类状态与两处入口可见；窄屏390×844：document/body宽度均390，无水平溢出，两处入口按钮宽316px。CI锚点和最新失败文字实际可读。ego共享Profile内已有阅读目录浮层，仅通过其已有按钮收起以检查页面。
- 单独用自动端口启动第二个临时启动器，验证健康状态后SIGTERM；其自有启动器和Demo均退出，43264交付服务仍可访问。
- 读取四个 GitHub job 日志并核对冻结候选配置，分类结果见 `CI.zh-CN.md`。未修复这些CI缺口，未将1成功/10失败改写成PASS。

原始网页截图与HTTP/生命周期记录保留于 `docs/framework/evidence/single-app-surfaces-20261109/progress/`（本机忽略目录，不提交生成物）；独立页面视觉判定存于 `.omx/state/single-app-status/ralph-progress.json`。网页记录不构建Browser、不晋升包、不重跑历史398用例；production、真实代理与公网未新增验证。

交付服务端口43264，writer为本启动器；交付时保留运行。启动回执和 `/health` 给出实际PID/源Demo端口，不把历史PID当成当前状态。用户查看所需的首页留在ego，演示临时页在检查后释放。ego提示有版本更新，本轮未升级或更换浏览器。
