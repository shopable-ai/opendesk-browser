# OpenDesk Task Package v1：本地表单演示

这个目录提供 **真实源码、清单 SHA-256 和 HTML 演示页**。JSON 导入后的初始状态必须是 **待验证**，不是自动审核通过或直接安装。

## 在本地 Chrome 验证

1. 在本仓库执行 `npm ci` 和 `npm run build:dev`，在 `chrome://extensions` 打开开发者模式，并加载 `dist/development`（解压扩展）。建议使用独立测试浏览器配置。
2. 在项目根目录执行 `python3 -m http.server 43111 --bind 127.0.0.1 --directory examples/tasks`，用普通 HTTP 标签页打开 `http://127.0.0.1:43111/demo-form.html`。
3. 打开 OpenDesk Browser Sidebar 的「发现」，导入 `examples/tasks/form-fill.v1.opendesk-task.json`。候选应显示 `sample.form-fill@1.0.0`、本地来源、准确网站、权限和 **待验证**。
4. 在「开发」编辑器中粘贴任务包的 `sourceUtf8`（也可将代码保存为 `.js` 再用「发现」导入草稿），把参数设置为 `{"name":"Alice"}`。运行草稿，批准当前网站，确认 DOM 输入/提交与网页 `#done` 已出现，查看已持久化完成结果，并记录本次 `runId`。无需先保存草稿。
5. 回到「发现」，选中该候选，填入刚才的 `runId`（也可留空使用开发界面的最近运行 ID），点击「核对运行证据」；只有后台确认 **相同源码哈希、相同网站、已释放执行资源、已持久结果和原生页面操作回执** 才能验证成功。
6. 点击「设为本地可用」→「安装确定版本」。在「我的任务」填写姓名，点击「运行任务」，检查浏览器页面、运行状态和持久结果。
7. 停用任务后再尝试运行，必须被禁止；重新启用可运行。卸载后底层已保存 Task Script 也不得绕过安装直接运行。
8. 关闭并重新打开 Side Panel，确认已安装任务与历史仍存在。再完全退出和重启 Chrome，核实任务可再次使用。必要时先让上一次运行完成资源退休。

## 状态含义与边界

- 本地验证是由现有 Controller 持久运行结果支持的**本机事实**，不等于第三方安全审计、代码签名或云市场审核。
- 此示例只申请一个明确的 HTTP origin 和 `page.automation` 任务权限；浏览器站点权限仍必须独立批准。导入文件绝不能直接声明自己是 Verified / Available。
- 无需 Codex、MCP、Native Messaging 或外部运行服务；以上 `python3` 仅用于启动演示页面。
- 在没有实际 Chrome 原生运行回执的环境里，请标记 `NATIVE_NOT_VERIFIED`，不要把 Node 组件测试当作真正的网页验收。
