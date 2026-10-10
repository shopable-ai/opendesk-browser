# Sidebar 自定义工具：网页笔记（手工验收示例）

本目录内的 **`quick-notes.opendesk-tool.json` 是已打包的测试文件**，可以直接在 OpenDesk Browser 的 Side Panel「工具」页导入，**无需先执行构建工具命令**。它包含 HTML/CSS/经典 JavaScript 与内嵌本地图片，属于用于手动测试的非特权工具。

## 先在 Chrome 加载当前源码生成的扩展

在仓库根目录运行：

```sh
npm ci --ignore-scripts
npm run build:dev
```

到 Chrome 的 `chrome://extensions` 开启开发者模式，加载 `dist/development`（已加载旧开发版本时请确认实际路径并刷新扩展）；在普通网页中打开 OpenDesk Browser Side Panel。

如需一个确定的测试网页，可另开终端从项目根目录运行：

```sh
python3 -m http.server 43111 --bind 127.0.0.1 --directory examples/tasks
```

在 Chrome 访问 `http://127.0.0.1:43111/demo-form.html`。如果端口已由其他任务占用，先核实其服务内容，不要终止他人的测试进程。

## 人工验收

1. **空列表**：打开「工具」页，观察「自定义工具」标题、右侧「＋ 导入」和空状态。标题到内容的间距应与「我的」等页保持相近，不应留出双重空白。
2. **导入**：点击「＋ 导入」，选择本目录 `quick-notes.opendesk-tool.json`。应显示「网页笔记」、版本 `1.0.0`、用途和三个申请能力；此时列表未添加工具，也没有运行中的 iframe。
3. **安装**：主动点击「确认安装」。安装完成后应显示「网页笔记」列表项及「打开」，**不自动启动**工具。
4. **打开**：点击「打开」。在工具界面查看当前网页的标题和 URL；受限制的页面可能显示不可用提示，这不是工具安装失败。
5. **保存**：输入 `侧栏中文笔记测试`，点击「保存笔记」，检查成功提示。点击「← 返回」并重新「打开」，确认内容仍在。
6. **切换**：切换到「我的」「发现」或「开发」，再回到「工具」，工具界面应该被销毁（不继续后台运行），数据应在再次主动打开时恢复。
7. **撤销 / 错误**：取消导入时不安装；尝试选择不符合规范的 JSON，应显示错误且不能安装。此项测试不需要执行任何不可信代码。
8. **卸载**：在列表中点击「卸载」并确认，再次导入同一包后检查笔记数据已清除。

建议分别在常见 Side Panel 宽度（约 360px、400px、600px）和浏览器 200% 缩放下查看标题、文件选择器、导入预览及按钮是否重叠或溢出。正常状态下不应出现横向滚动；工具的 iframe 内容可纵向滚动。

## 修改示例后重新打包

`tool.config.json` 指向 `src/index.html`、`src/style.css`、`src/main.js`。更改任一源文件后，在仓库根目录执行：

```sh
npm run build:sidebar-tool -- examples/sidebar-tools/quick-notes
```

根据终端打印的输出路径选择新生成的 `.opendesk-tool.json` 文件。它与 Task v1 的 `.opendesk-task.json` 是两种不同的格式，不可混用。

> 上述为真实 Chrome 的人工验收操作指南，不代表本次文字/组件检查已获得 Native PASS。工具宿主隔离及权限边界请参阅 `docs/product/sidebar-custom-tools-r1.zh-CN.md`。
