# Web Markdown Clipper R1.8.2-WEB · 验收与发布关口

## 基线及范围

- 唯一仓库/分支：`shopable-ai/opendesk-browser` / `main`。
- 源码核查基线：`31da04d38722ad3512b9ac9926bc9e19192efb5b`，核查起点版本 `1.2.0`，此后并行上游已经发布 `1.2.1` 富选区。
- 本轮 `tool.config.json` 候选版本：`1.2.2`。最新提交 SHA 和 CI 结果以 GitHub 回执为准。
- 保留 Host、存储结构、工具 ID 与所有已具备的功能；产品尚未上线，不执行旧安装数据迁移。

## 修复点

1. 重复点击当前模式直接返回；切换其他模式仅更改显示，不自动请求 Host。
2. 当前网页会话至多四种模式结果；选区与引用共享一次真实选区提取，文章不会进入选区，链接只由可信标题及来源生成。
3. 未提取的目标模式显示空状态且禁止导出；同页有效模式允许直接恢复。
4. `currentPage.info`、可信 Host 来源与页面变化事件协同约束缓存；拒绝旧网页内容、跨网页来源和迟到请求。
5. `composeMarkdown` 从原始正文一次性组合 `footer` / `yaml` / `none`，预览、源码、保存、复制和下载共用输出。
6. `notes.js` 在用户发起保存时冻结请求正文、标题和来源，回执之前禁止重复保存及改变模式；便签编辑草稿独立保存，不被网页导航清空。

## 已执行的检查与待执行的验收

| 检查 | 状态 | 证据 / 约束 |
| --- | --- | --- |
| GitHub 源码核查 | PASS | 核对 `clip.*`、`currentPage.info`、正式源码和现有测试 |
| 内嵌 JS 模拟交互 | PASS | 对真实 `main.js` 运行 11 项独立模拟，均通过；不是 Node 或 Chrome 实机 |
| UI 模拟执行仓库测试 | PASS（V8 模拟） | 保留并行富选区/嵌套列表用例后，实际 UI 测试函数在受限 V8 模拟宿主中执行 25/25 通过；**不是** Node/Chromium PASS |
| 保存草稿保护模拟 | PASS（V8 模拟） | 新增冻结保存负载、防重复保存、未保存便签留存场景，实际测试函数在模拟宿主中执行 1/1 通过；正式 Node 未执行 |
| 正式 Node 测试 | NOT_TESTED | GitHub 连接不提供仓库 Node 执行环境；已新增测试 |
| 正式 `npm run build` | NOT_TESTED | 需真实构建回执 |
| App CI / Chromium | NOT_TESTED | 推送 main 后应读取该提交对应的 App CI 工作流回执 |
| Mac Chrome 与原生右键 | NOT_TESTED | 必须实际安装、授权、导航并检查右键及保存回读 |
| `1.2.2` 正式包晋升 | BLOCKED | `1.2.1` 仍是当前正式包；等待 App CI 候选与 `app-release` 晋升，禁止手工编辑 `.opendesk-tool.json` |
| 旧数据兼容 | NOT_APPLICABLE | 本工具尚未上线 |

## 真实验收命令

```bash
node --test examples/sidebar-tools/web-markdown-clipper/tests/*.test.mjs
npm run build
node scripts/app-ci.mjs build web-markdown-clipper
node scripts/build-sidebar-tool.mjs examples/sidebar-tools/web-markdown-clipper --check-project
```

正式发布需验证最新 main SHA、App CI 对应的候选 SHA-256、Linux/Chromium 及按 profile 要求的 macOS Chrome 实测、`app-release` 晋升结果和 1.2.1 正式包完全一致。任何未实际执行的检查不得标记 PASS。

## 并行更新处理

本轮最初核查后，main 上游并行新增富右键选区 `selectionMarkdown`、嵌套列表 Markdown 预览，以及 1.2.1 正式包。此轮从最新 main 重新合入这些特性、保留上游测试并将模式安全修复独立升级为 1.2.2 源码候选。1.2.1 旧正式包不代表 R1.8.2 已发布。

## 最新提交及 CI 触发记录

- R1.8.2 源码主提交：`65f641247ce059a96c54a3ac7127917453eec658`。
- 自动触发 [OpenDesk App CI](https://github.com/shopable-ai/opendesk-browser/actions/runs/39564666041) 与 [Markdown tools R22](https://github.com/shopable-ai/opendesk-browser/actions/runs/39564665881)，最后读取时为 `queued`，**不能宣称已通过**。
- HTML 预览位于 `preview/index.html`、`preview/stage.html`，已做源码/脚本/嵌入一致性校验，未在真实 Chrome 图形界面打开，标记 `NOT_TESTED`。
