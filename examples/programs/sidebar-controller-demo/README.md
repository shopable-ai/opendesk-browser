# 多文件 Controller Demo（现代 Page API）

`src/main.js` 静态引用 `params.js` 与 `search.js`；在唯一标准测试页 `examples/tasks/demo-form.html` 的「05 动态搜索」区域执行填表、点击与等待。

```sh
node scripts/validate-program-project.mjs examples/programs/sidebar-controller-demo
npm run build:program -- examples/programs/sidebar-controller-demo
python3 -m http.server 43111 --bind 127.0.0.1 --directory examples/tasks
```

打开 `http://127.0.0.1:43111/demo-form.html`，优先在「发现 → 导入」完整任务目录选择构建输出的 `program.opendesk-draft.json`，在 Sidebar「开发」查看只读源码列表并运行固定编译字节；也可回退使用 `program.js` 的粘贴或 .js 文件导入；参数填 `{"keyword":"OpenDesk"}`，点击底栏 **运行草稿**。应出现 `#results` 的「结果：OpenDesk」以及 `#search-count` 每次只增加 1；检查真实 `runId`、持久结果和冻结网页目标。

`program.opendesk-task.json` 是待验证 **Task v1 Candidate**，不是已安装任务。正式安装只能通过同源码与真实 runId 的核验，遵循原 Verification→Available→用户确认安装流程。

运行前在真实网页点「05 动态搜索」，必要时向下滚动，确认搜索输入框和按钮位于视口内。目标绑定与原生输入不会绕过不可见控件；若元素仍在视口外，执行可能超时并释放 Worker，此时提交计数应保持不变。

代码只用 OpenDesk 的 `page.getByLabel().fill()`、`getByRole().click()`、`getByText().waitFor()`、`locator().textContent()`；没有 `chromium.launch()`，不需要 Codex/Native Host 才能手动测试。


普通用户使用同一 Demo 时需采用另一条**正式任务**路径：将同一构建的 `program.opendesk-task.json` 导入完整任务目录；使用匹配源码、版本和目标网站的真实草稿运行 `runId` 验证候选，再设为 Available 并明确安装。随后在 Sidebar「我的任务」直接填写自动生成的「搜索关键词」，无需继续编辑源码。可展开「运行记录 → 技术信息」核对真实 `runId/resultId`；发生超时或状态未知时先看页面是否已经执行过搜索，避免再次点击造成重复。

## ESM 源修改与证据边界

现有 `main.js → params.js/search.js` 已满足多文件 Controller 示例要求，不创建重复目录。Node 只校验和 Webpack 构建；`page` Locator 使用现有授权 Controller Worker，不是 Node Playwright 或直接 DOM 全局。修改 `src/params.js` 中的默认关键字后重新**明确运行**，检查新 `sourceHash`、`runId`/`resultId` 以及标准测试页 `#search-count` 只增加一次。导航、撤权、超时或 ACK 未知时按原身份只读查询，不能盲目重放搜索。错误应正常传播。

定向 Node 测试：`node --test tests/environment/sidebar-project-demo.test.mjs tests/environment/program-build.test.mjs`。Chrome 请按上面的 demo-form 实际操作并记录原始回执。当前候选真实 Chrome L4 `NOT_TESTED`；Node 编译和 vm 返回值不可代替验收。
