# Sidebar「开发」高级诊断一致性修复 R1

日期：2026-10-16；工作分支仅 main；开始时 main: `f637dd269a0569ba54214e51eaaa827f74043ef0`。

## 范围与写入所有权

本任务主要修改 `src/ui/tool.html`、`src/ui/tool-shell.css`、`tests/environment/developer-layout.test.mjs`；同时因相关 R21 检查被已存在的 Workflow 断言阻塞，定向更新 `tests/environment/sidebar-component-contract.test.mjs` 及 `tests/environment/sidebar-ui-preview.test.mjs` 两处过期断言，并保留本记录；不修改 `src/ui/tool-shell.js`、`src/ui/script-editor.js`、Browser SDK Authority、Chrome permissions、Host/Native、底部 Run/Stop。与其他会话不共享 Chrome profile、`dist/development`、CI fixture/端口，不主动重启 watcher。

## 问题与修复

- 原 `Advanced / Diagnostics` 脱离 `.developer-editor`、位于最末端，顺序与参数/结果不一致；修复为紧随手动 `参数 JSON（可选）` 后且在 `运行结果` 前，并由现有 `od-disclosure` 接管一级卡片。
- 原诊断内部 SDK/健康检查重复嵌套专属卡片背景边框且直出所有表单；改为各自独立、默认收起的 `od-disclosure--flat`，共享源的 token/聚焦/hover，保留原所有授权和健康检查 ID、行为与回执。
- 历史未注册采集模块占位隐藏，仍保留 `#scraping-panel` DOM/模块状态以免破坏依赖；移除固定棕色边框。
- 表单标签使用 `od-field-label`，响应 JSON 使用 `od-result`，清除空 SDK/健康结果的空白区域；原生 SDK fieldset 调整为无额外边框的列表，使用 CSS token；本地连接诊断、编译技术信息语义去重。
- 源码级防退化检查扩展到顺序、折叠结构、ID 唯一性、授权和健康入口完整性、无冗余边框。没有新增依赖、权限或运行时逻辑。

## 验收级别

- SOURCE_WIRED：修改完成后需核对实际提交内容。
- NODE_CONTRACT：等待本提交对应 GitHub Actions 的 `Sidebar R21 integrated UI quality` 结果。
- STATIC_CHROMIUM：等待本提交对应 `Sidebar R19 - real markup static layout audit` 结果，需检查其准确候选 SHA 与截图。
- REAL_MAC_CHROME、SDK 授权/撤销原生端到端、生产包安装：NOT_TESTED；Node PASS 不可提升为真实安装 PASS。
- 已有 RunHost、权限及 Native 历史证据只在原绑定候选范围有效，本次不会通过布局改动重写历史凭证。

## CI 受影响验证补充

- 初版候选 `b3ee5d7902cfeda6f287aef2803fb7ea287b2026`：R19 静态 Chromium 源码布局成功（Actions run 38873689674）；R21 首阶段 Node 63/64，唯一失败在旧 `sidebar-component-contract.test.mjs` 的 Workflow observation consent 文本断言（Actions run 38873689530）。
- Workflow 源码 `src/ui/workflow/workflow-view.js` 与本任务父提交逐字节相同，旧断言要求 `observation:selected==='local_codex'`，真实源码已将用户明确发送表达为 `observation:true`，但另行要求 `permission=row.siteGranted?Promise.resolve(true):api.permissions.request` 及本机 Local Codex 有效摘要审批。
- **修复仅更新测试契约并增强安全拦截断言**；不修改 Workflow JS、模型 Provider、网页审批或任何其他 Runtime。后续以本提交的 R21 Node / 构建结果为准，静态 Chromium 可复用不变的 HTML/CSS R19 证据。

- 第二轮候选 `795e41f7906f4507ab46347850168673855f7231`：R21 首个 Node 组中的旧 Workflow 授权断言已通过；后续 Node 组发现 `sidebar-ui-preview.test.mjs` 仍要求旧 `#tool-diagnostics{margin:0}` 专属 CSS。按 R31 公共所有权原则，更新断言改查 `design-system.css` 的 `.od-disclosure{margin:0}`，并明确拒绝重新新增单独 margin 规则。无样式/运行时更改，R19 静态 Chrome 源码输入不变。

## 最终 CI 结论（同一 UI 源码输入）

- **R19 Chrome 静态布局**：SUCCESS，Run [38873689674](https://github.com/shopable-ai/opendesk-browser/actions/runs/38873689674)，精确提交 `b3ee5d7902cfeda6f287aef2803fb7ea287b2026`；验证了同一正式 HTML/CSS 的桌面、窄屏、布局组件、键盘状态（证据级别 STATIC_MARKUP_CHROME）。
- **R21 组件与双包构建**：SUCCESS，Run [38874812832](https://github.com/shopable-ai/opendesk-browser/actions/runs/38874812832)，精确提交 `9b77e1ad73e2e92ae363d72776dc401be2a53efc`；组件回归、`npm run check`、生产和开发构建、`npm run verify`、构建 CSS 安全回归全部成功（NODE / PACKAGE）。
- 在两次通过记录之间，产品 HTML/CSS/JS 均无变更；后续两次提交仅修正与历史代码合同不一致的旧测试和本工作记录。按输入范围，可将 R19 静态 UI 证据复用于 R21 已验证源，但**不把静态证据升级为已安装 Chrome 原生验收**。
- **仍未完成**：真实用户 Mac Chrome 的已安装 Side Panel 中操作高级诊断、SDK 授权/撤销及 125%/200% 缩放、深色模式、Native 生命周期；这些项目保持 NOT_TESTED。正式产品综合 ≥95/100 仍需相关级别验收，不以本轮局部 CI 成功替代。
