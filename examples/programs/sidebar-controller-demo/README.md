# 多文件 Controller Demo（现代 Page API）

`src/main.js` 静态引用 `params.js` 与 `search.js`；在唯一标准测试页 `examples/tasks/demo-form.html` 的「05 动态搜索」区域执行填表、点击与等待。

```sh
node scripts/validate-program-project.mjs examples/programs/sidebar-controller-demo
npm run build:program -- examples/programs/sidebar-controller-demo
python3 -m http.server 43111 --bind 127.0.0.1 --directory examples/tasks
```

打开 `http://127.0.0.1:43111/demo-form.html`，优先在「发现 → 导入」完整任务目录选择构建输出的 `program.opendesk-draft.json`，在 Sidebar「开发」查看只读源码列表并运行固定编译字节；也可回退使用 `program.js` 的粘贴或 .js 文件导入；参数填 `{"keyword":"OpenDesk"}`，点击底栏 **运行草稿**。应出现 `#results` 的「结果：OpenDesk」以及 `#search-count` 每次只增加 1；检查真实 `runId`、持久结果和冻结网页目标。

`program.opendesk-task.json` 是待验证 **Task v1 Candidate**，不是已安装任务。正式安装只能通过同源码与真实 runId 的核验，遵循原 Verification→Available→用户确认安装流程。

代码只用 OpenDesk 的 `page.getByLabel().fill()`、`getByRole().click()`、`getByText().waitFor()`、`locator().textContent()`；没有 `chromium.launch()`，不需要 Codex/Native Host 才能手动测试。
