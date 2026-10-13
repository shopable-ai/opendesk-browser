# Side Panel 开发热更新状态展示修复（2026-10-13）

- **负责人/范围**：当前 Side Panel 开发状态缺陷；仅写入 `src/development/page.js`、`tests/environment/wxt-development.test.mjs` 与本工作记录。
- **只读依赖**：`src/development/worker.js`、`src/ui/tool.html`、`src/ui/tool-shell.js`；不更改热更新消息/授权/任务执行协议。
- **资源边界**：不占用用户的 Chrome/CFT profile、固定测试端口、日常 `dist/development` 或共享构建目录。
- **根因**：开发页此前将 `#opendesk-development-status` 无条件 prepend 到 `body`，且收到 CSS 推送时写入「样式已自动更新。」，从而在正常 Side Panel 中暴露开发诊断信息。
- **实施**：存在调试页时将状态放进其默认折叠的「本地开发服务」区域；无调试页时保持非可视的回退状态。CSS 热更新仍给原 CSS 链接加指纹，移除非必要的成功提示；构建指纹、任务繁忙拦截、准备握手与资源释放逻辑保持原状。
- **回归**：在 `tests/environment/wxt-development.test.mjs` 中覆盖调试区归属、无调试页隐藏、CSS query 指纹、任务非冻结和状态不被覆盖。
- **证据级别**：本记录只记录源码变更，实际 Node 及 Chrome 验收需以同一提交上的独立运行结果为准；未运行不可写 PASS。
