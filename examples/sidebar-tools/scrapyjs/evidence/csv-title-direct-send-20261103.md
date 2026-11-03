# CSV title 表头修改与直接发送修复

2026-11-03，北京时间。当前开发目标完成：用户两条原话可在原安装中直接修改 title 表头，原表单同步、保存重开一致；普通解释不写配置。仅代表本次核心操作，production、完整验收和评分未执行。

## 原故障与修复归属

- `CSV 中 title 的表头改为“标题”` 与 `CSV 中 title 的字段表头改为“标题”，修改配置` 被消费者的窄语法识别和引号过滤拒绝，错误回复“尚未修改配置，请直接说明要修改的内容”。`src/ai-actions.js` 现在识别 CSV 前置语序、可选“字段”、匹配的新表头引号及末尾“修改配置”；后缀不增加写入范围。解释、否定、整段引用和夹带差异仍拒绝写入；完整候选须等于本轮精确期望。
- 普通发送原先调用 Host 的逐次接收方/资料确认。已删除该确认，继续使用保存的 Provider。安装审阅与权限链保留。
- 仅借用父页面 userActivation 的初稿在独立复审中被否决：可借用无关点击且正常异步准备可能超过短时激活窗口。最终复用原 sandbox bridge 的闭包私有端口及原 prepareExport 机制，公开 `OpenDeskTool.prepareAI(factory)`；真实点击/Enter 内同步消费一次事件，允许 8 秒有界异步准备。Host 只接受本实例私有端口的 generate。
- `src/ai-request.js` / `src/AiPanel.jsx` 将原 claim/info 放入 prepareAI，准备停止返回 null；缺能力保留草稿并明确提示。安装/启用/撤权、Provider generation、请求身份、并发锁与 CAS 不变。派发后断连、超时或丢回执保留 `E_AI_UNKNOWN` 和原请求围栏，不自动重放。

公共合同只在[框架 AI 文档](../../../../docs/api/sidebar-tools-ai.zh-CN.md)维护；领域校验与原 `business.config.propose/apply` 仍在 ScrapyJS。未创建第二套 Host、Chat、Provider 或安装器。

## 真实原生操作

使用原 CFT149、原扩展安装和测试配置副本 `共享AI验证-20261103`，基线 title 显示名“书名”、maxPages 3。每次从可见 AX 完整 JSON 解析后与完整期望对象比较，未仅检查某个字符串。

| 操作 | 可见结果与完整数据核对 |
| --- | --- |
| 单击发送 `CSV 中 title 的表头改为“标题”` | 直接进入推理，未出现逐次确认；助手回复“已更新配置草稿。”；完整配置仅 `output.fieldNames.title`：“书名”→“标题” |
| 原“保存配置”按钮；打开采集规则的 CSV 表头区 | 显示“配置已保存”；`title 显示名称` 与 CSV 预览第一列均为“标题” |
| 用同一原表单将测试表头恢复“书名” | 完整 JSON 与初始基线逐字序列化相等，作为第二条指令的独立起点 |
| Enter 发送 `CSV 中 title 的字段表头改为“标题”，修改配置` | 直接进入推理，无第二次确认；回复“已更新配置草稿。”；完整配置再次仅改变 title 表头，原保存成功 |
| 单击发送 `只解释 title 的 CSV 表头，不要修改配置` | 实际回复说明第一列“标题”，不改采集规则或 JSON 字段名；完整配置等于上轮期望，仍为已保存状态 |
| 返回扩展列表，重新打开 scrapyjs，查看完整 JSON | v1.8.20，原测试配置仍被选中，保存状态正确；完整 JSON 与两轮精确期望相等 |
| 收尾再次展开 Chat | 本机 Codex 来源保留，输入为空、发送禁用、业务 JSON 可见，Dock 276；无在途请求 |

仅操作已有测试副本，未切入原 `Chat-20261102` 配置，未采集、运行任务或下载业务数据。设置、密钥、Cookie 和模型路由未改。

## 同候选身份

- `main` / HEAD `24fa6344cea4cc21425967995f50f30cbc453d73`；保留已有并行改动，无提交、推送、分支、worktree 或 PR。
- CFT `149.0.7827.55`，`/Applications/Google Chrome.app`；扩展 `ccfcjegpkdlgbclopjmadlcjedelidmf`，仍加载仓库 `dist/development`。
- 原生“本地开发服务”显示 **开发服务已连接**；运行 revision `038ca1f41febfcfdc3fd5d5d8af674eca2a18cd1b917e23fbec6b7bb651b89c5`。复用既有 watcher，未运行第二个 Browser build 或覆盖其输出。
- 唯一正式包 `scrapyjs.opendesk-tool.json` v1.8.20，1,344,008 bytes；SHA-256 `51f9d7696168eaa35c7dc3f402369971c4b5b80ea2012a6e0d16d79c0623866c`；工具 buildId `4bb9ba85177d9c00c2c03055ecbe04a1da74aaa938a5f32afcdb3fb8f046d881`。编译回执包含 38 项源码输入、3 项产物、4 项共享设计输入。
- 可信导入审阅实读 v1.8.19→v1.8.20、权限未变化、同一 tool ID 和运行 extension ID、候选 SHA 与上述一致，然后确认更新。打开后标题实读 v1.8.20，原配置库保留。

## 定向验证及限制

- `node --test examples/sidebar-tools/scrapyjs/tests/{ai-request,ai-panel,ai-app,ai-actions}.test.mjs`：100/100 PASS。覆盖两条原话、只读与夹带差异拒绝、准备停止、迟到准备和 CAS/unknown。
- `node --test tests/environment/sidebar-tool-export-bridge-host.test.mjs tests/environment/sidebar-tool-ai-bridge.test.mjs`：96/96 PASS。覆盖真实事件双消费、伪造/后台拒绝、Enter/Shift/IME、8 秒准备、关闭/克隆期取消、派发后未知结果，以及安装、撤权、代际、替换包与原导出边界。新增派发后 unknown 用例先复现 3 项失败，再修复通过。
- `node --test --test-name-pattern='closing an AI tool' tests/environment/wxt-development.test.mjs`：1/1 PASS，保留 Native 未退休时的安全刷新围栏。
- 原 Vite 编译成功；`npm run app:update -- scrapyjs` 执行候选、8/8 包门禁、同源核对及晋升，只有一个项目正式 JSON。已有 engine 的三处 PURE 注解警告不影响编译。源码语法检查与 `git diff --check` 通过。
- 原生只读复审跟进了最终 bridge/consumer，未发现新的明确缺陷。复审的 Node 证据不替代上方原生步骤，也不构成全局安全认证。

**NOT_TESTED / 延期**：production、完整安全/故障注入矩阵、真实撤权/来源切换/unknown 竞态、跨浏览器、采集及下载、长期 watcher 稳定性、历史高度收缩根因、独立评分。没有恢复旧验收目标；本轮原生结果不外推到这些范围。
