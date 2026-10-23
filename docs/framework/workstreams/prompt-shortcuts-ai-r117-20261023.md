# Prompt Shortcuts AI R1.17 — 取消冗余正文外发确认

- 状态：SOURCE_IMPLEMENTED；Node/GitHub Actions 与 Mac Chrome 以真实运行证据为准，未验证项不得宣称 PASS。
- Owner：本轮在线实施；日期：2026-10-23；唯一写入分支：main；任务起始 HEAD：`36457c6bc7993c00f641d2258361ad3ae23557e6`。
- 原始目标：已配置 Provider 的用户点击可信 Send，精确修改提示词，零次二次正文外发授权。
- 文件归属：`src/ui/conversation/prompt-controller.js`、`src/ui/conversation/prompt-host.js`、`src/ui/conversation/prompt-actions.js`、`tests/environment/opendesk-conversation-r13-prompt-business.test.mjs`、`docs/architecture/browser-framework/site-permission-onboarding.zh-CN.md` 与本文件；本轮不占用其他 Agent 文件。
- 共享架构：保留 `requestBrowserClick`、Provider Runtime、正式安装版本、iframe 消息与存储 schema；仅删除 Prompt AI 的 `reviewShare` 路径。
- 安全保护：真实 Send、Provider 授权、唯一目标、ETag 在正文外发前检查、官方安装身份/代际、草稿租约、Web Locks、ifMatch、Host 独立读回和未知写入恢复。
- 测试入口：`node --test tests/environment/opendesk-conversation-r13-prompt-business.test.mjs`；GitHub Actions `.github/workflows/official-tools-ai-r13.yml` 在 main push 上触发。模拟 Provider 与 iframe 的 Node 测试不得冒充真实 Native 或浏览器验收。
- 当前环境无法访问用户 Mac 本地路径/Chrome 扩展 Profile，真实 local_codex、安装/重启、真实网络流量均为 NOT_TESTED，需本地 Codex 按提交 SHA 后续验证。
- 资源与并行：未启动本地 watcher、构建、Chrome Profile 或新 worktree；以远端 main HEAD 为前提进行非强制条件提交，遇并发变动必须重新应用增量补丁。
