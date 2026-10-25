# AI 知识问答 R1.4-WEB · 核心业务增量与 Mac 验收交接（2026-10-26）

范围：`shopable-ai/opendesk-browser` 的 `main`。固定本地 HTTP Demo；不新增第三方站点、Provider/Host/Installer、React Root、消息队列或后台服务。

## 跨对话去重和实际基线

- `R1.3` 已有知识模型、共享 AI Consumer、原可信 Host、同源管理界面、固定本地 DOM 适配器、发送同步栅栏和 52 个示例场景。
- 本轮检查期间并行 `R1.3.2-LOCAL` 已在 `fbe7c2fbbff0277d42819238eac44cc8ae8ab258` 修复“知识回读期间暂停仍然发送”的代次竞态，暂停撤销自动 AI 许可，并新增 6 个精准并发回归。该轮 Mac Node 的 **17/17** Runtime 与 **32/32** Model/Provider 为彼时提交的 fake Chrome/Provider 定向证据；不代替本轮新改动的执行证明。
- 同期安装包已经由其他 owner 改为 `0.1.4`（`tool.config.json`、唯一正式 JSON 与 `trusted-knowledge-admission.js` 身份一致）。该包的沙箱输入闭包不包含本轮 `trusted/` 文件，禁止手工编辑 JSON 冒充新版构建。

## 本轮确认的尚缺业务边界与最小改动

1. **真正派发点击之前的暂停检查**：原 `send()` 只在知识回读后检查暂停，却要继续等待 `currentPageTarget.revalidate`。该 await 内暂停时，旧逻辑仍可能触发 Chrome `executeScript`。新逻辑在重校验完成后、调用脚本前无 await 地检查会话序号与暂停代次。未发起点击则恢复原待确认状态；点击已发生后仍按 DOM 回执或 UNKNOWN 保守处理。
2. **人工生成 AI 草稿的身份绑定**：原 `attach()` 仅检查 messageId、非空答案和来源数量，没有核验 thread/document/pause epoch/ETag/原始候选来源。现在准备阶段保存会话身份，Provider 调用前复核相同消息、问题、文档和知识 ETag；交付时又核验原始候选来源子集，拒绝将迟到/错误来源的草稿附着到新客户。
3. **正式可信 UI 的结果可见性**：手动问答结果从显示 `state.result.question` 改为实际 `state.result.answer`；已确认网页发送行提供回执 messageId 与被回复客户 messageId；暂停标识明确可见。
4. **定向回归**：在 `tests/environment/ai-knowledge-chat-r13.test.mjs` 添加 3 个用例，覆盖文档重校验期间暂停、人工草稿身份/ETag/来源/人工审核、正式 JSX 结果字段。测试中的 DOM/Provider 均为 fake，不能代表真实 Chrome。

## 证据等级和本轮停止边界

- 源码/Blob 已通过 GitHub 连接逐文件核对；实际最终 main SHA 请以本记录所在 Git 提交为准。
- **本轮新改动的 Node 测试：NOT_TESTED**（当前 GitHub 连接不提供远程 Node 执行，本环境也无法拉取仓库到本机运行）。不得套用 `fbe7c2f` 的 17/17 和 32/32 为新提交 GREEN。
- **包同源 check：NOT_TESTED**；`0.1.4` 包属于并行提交，本轮可信源码改动不直接改变 JSON 包字节。不能把已知版本相同当作实际运行过 `--check-project`。
- **真实 Chrome 安装/官方身份/网页真实发送/Shared Provider：NOT_TESTED**。上轮 Mac 使用的 Chrome 工具对 `chrome://extensions/` 的访问明确阻断，禁止通过别的表面规避。
- `WEB_CORE_READY` 仅可在本轮定向测试、代码缺口修复和身份/来源/并发保护的实证齐备后授予；缺少真实 Chrome 不等于本轮必然失败，但必须分层标记。
- 模型的数字来源检查不是语义蕴含证明；例如“签收后 7 天内可申请退款”**不等于**“7 天到账”。AI 草稿一律保持 `REVIEW_REQUIRED`，最终人工必须核对实际申请/处理/到账语义。

## Mac Codex 最短后续操作

先核对 `main` 与 `AGENTS.md`、本记录及最后提交的全部目标文件 Blob SHA；不得重做已通过的 `R1.3.2-LOCAL` 旧测试范围而遗漏本轮增量。运行：

```sh
node --test tests/environment/ai-knowledge-chat-r13.test.mjs
node --test tests/environment/ai-knowledge-answers-host.test.mjs tests/environment/ai-knowledge-answers-provider-contract.test.mjs
node scripts/build-sidebar-tool.mjs examples/sidebar-tools/ai-knowledge-answers --check-project
```

新改动失败则先重现对应客户操作、只做最小源码修复，并保留 Node 原始 stdout/stderr。之后复用已经存在的 43111 HTTP Demo 与单一 `dist/development` watcher，在得到合法 Chrome 入口的前提下完成固定答案 → 真实 DOM 回执、真实 Shared Provider 草稿 → 逐条人工审核 → 客户同 ID 发送，以及暂停/文档变化/ETag/Provider 撤权/UNKNOWN 回归。没有入口就标 BLOCKED，不能用 fake 冒充 PASS。
