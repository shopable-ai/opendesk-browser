# Cookie Editor R5.22 · Codex Mac 原生验收（仅在 GitHub CI 就绪后）

> 执行位置：`/Users/shopme/Documents/workspace/opendesk-browser`；仓库 `shopable-ai/opendesk-browser`；唯一分支 `main`。
>
> 本文件不是 PASS 回执；不得在没有真实测试记录时将验收结果标记为通过。

## 任务指令

1. 读取 `origin/main` 最新 HEAD 与工作区状态。若本机有未提交内容，先停止并报告；不得覆盖用户工作区、创建分支、Worktree、PR 或强推。
2. 先运行耗时短的 Gate 1：`node --check src/ui/sidebar-tools.js`、`node --test tests/environment/cookie-editor-import-intent.test.mjs tests/environment/cookie-editor-react-domain.test.mjs tests/environment/cookie-editor-react-controller.test.mjs tests/environment/cookie-editor-react-source.test.mjs`。按仓库锁文件使用现有依赖，只有在条件满足时再执行 `npm run build --prefix examples/sidebar-tools/cookie-editor` 和候选打包测试。明确报告失败命令、退出码、日志摘要；构建未 PASS 不要打开 Chrome。
3. Gate 2：核查 `src/ui/sidebar-tools.js` 的 `cookieEditor.import.begin` → 官方发行包身份、来源摘要、安装代际、网站授权 → 一次性 Host `browser.intent.confirm` → `browser.cookies.setMany`。确定用户真实鼠标点击文件/粘贴导入时 `navigator.userActivation.isActive` 在可信父侧边栏可观测，若不能，停止并修复为**浏览器可信点击通道**，不得让 iframe/Tool JavaScript 自行声称授权。其他普通 Tool 的 `setMany`、删除、清理继续需要现有可信审批。
4. Gate 3：测试固定真实 React 入口及交互，宽度 360 / 400 / 520 px，浅色/深色、200% 缩放、Escape、焦点恢复。文件选择后直接导入；粘贴后按一次按钮导入；导出使用顶层弹窗而非插入列表底部；成功只短 Toast；失败保留内容；部分/未知结果不可自动重试。
5. Gate 4：**只有 Gate 1～3 全 PASS 才启动 Mac 正式 Chrome 扩展安装/同 ID 升级**。使用隔离 Chrome Profile 与临时测试网站、明确一次性测试 Cookie（例如 `opendesk_r522_disposable_001`～`100`），绝不能修改用户真实站点登录会话。先安装已发布旧版，再用规范的 `cookie-editor.opendesk-tool.json` 新版本测试覆盖升级。页面授权一次；逐一导入 25、50、100 条，检查零逐批确认，Chrome API 逐条读取 name/value/domain/path/hostOnly/storeId/partitionKey/sameSite/secure/过期时间；撤权后拒绝、切换网站拒绝、失败停写且不重放。记录起止时间、Chrome 版本、扩展版本、SHA、屏幕与最小脱敏日志。
6. 执行前核查正式 `tool.config.json` 与发行 JSON 是否都已真正指向编译后的 React UI、同一版本；若仍为 `2.0.23` 旧 JS，**必须标记正式发布 NOT_READY，不可把候选 React 测试当作正式安装版 PASS**。先把 CI 阻断/正式构建、预览同源、候选 SHA 解决，再依据仓库现有正式 release gate 提升版本。
7. 中止边界：初始化或依赖出现阻断，不超过 15 分钟内报告首个真实阻断，不进入一小时循环；允许在本地直接修复真实代码后重新执行最小失败测试。不能虚报未执行测试。所有修改只提交 `main`，附精确 SHA 与失败/通过的独立清单。

## 反方验收

- React UX：文件选择是否只要一个真实动作，导出是否不挤压列表，未知结果是否持续可见？
- SDK/Host：一个无授权 Tool、一个克隆同 ID 的工具、一个过期 session 是否仍能逃过写入确认？如果能，立即判失败。
- 数据一致性：重复原生 Cookie 身份、过期项、Store/Partition 不匹配、SameSite/Domain 异常是否被正确判别并提供可恢复的简短提示？
- Release QA：候选代码与正式编译包是否同源，旧 ID 升级是否逐项可证，真实 Chrome 原生回读是否等于宣称导入数量？

输出十维独立的基于证据评分，任何未测项为 `NOT_TESTED`，绝不填 95 充数。交付最终的明确「完成 / 未完成 / 阻断」结论。
