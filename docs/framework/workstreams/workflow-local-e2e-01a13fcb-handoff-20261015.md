# OpenDesk Workflow 本地真实 E2E 续接（2026-10-15，禁止从头重跑）

默认中文。直接接着处理现有未完成工作，不再写另一份 GOAL。用户明确授权正常控制电脑，并已授权网站权限弹窗由 Agent 直接操作，不必再询问。

## 先读现有状态和证据

Browser 仓库：`/Users/shopme/Documents/workspace/opendesk-browser`。读取最新 AGENTS.md、`docs/framework/testing-guide.md`、正式 Workflow 合同第13节、原账本 `docs/framework/workstreams/conversation-direct-r1-20261013.md`。

本轮工作流：`docs/framework/workstreams/workflow-local-e2e-01a13fcb-20261015.md`。
证据目录：`docs/framework/workstreams/evidence/workflow-local-e2e-01a13fcb/`。优先读：
- `handoff-checkpoint.json`：最新 HEAD、相关源码 SHA、完整 Git 状态、未提交文件和未完成项。
- `real-chrome-success.json`：真实 CFT 操作所得成功证据，属于原会话原生 AX/截图的人工转录，非原始 RPC 导出。
- `negative-ui-evidence.json`、`ai-off-before.json`、`ai-off-after.json`。
- `targeted-node-tests.tap`（30/30 PASS）、`schema-tests.tap`（目前3个文件因 E_CONTRACT/schema drift FAIL）。
- `build-blocker.json` 是恢复正则前的失败快照，不能当最新状态。

只允许已有 main；不建分支/worktree/PR，不强推/reset/clean。不覆盖其他 Agent 的脏文件或暂存区。正常 commit/push 已获原任务授权，但本会话尚未提交或推送。Go `/Users/shopme/Documents/workspace/opendesk` 当前 master，有他人改动，保持只读。提交遵守 Lore trailers。

## 已完成的真实流程：复用，不无故重跑

唯一正式测试页 `http://127.0.0.1:43111/demo-form.html`，已复用服务 PID48261。通过该页“05 动态搜索”导航使搜索框在视口中可见；初始离屏 fill 曾30秒超时，未自动重放。不要把 prepare 改成会滚动的操作；正式 Page API 明确将自动滚动列为待完成能力。

workflowId：`wf-76cc8e59-2104-405e-8e7d-91f2add7e84f`。
冻结版本：r1。Controller 567 UTF-8 字节，sourceHash：
`698ed06ad8270ea300f4b0b6b03bb78aabf5fbe13be6eb8e47fe0132d78e7487`。
`fill-controller-expected.js` 是经原 compiler 重现、与真实保存界面所示 SHA 完全一致的字节，不冒充 Controller DB 原始导出。真实打开保存版本时产品已核对持久源码字节与 SHA。

1. 一次 Send“在当前网页的搜索关键词输入框里填入 ai自动化第一选择。”已直接执行，真实输入值精确匹配，产品同次 inputValue() matched:true，搜索次数0。
   runId=`b17b3fd9-3847-4f1a-b4ec-4c2715d7bc0c`；resultId=`bed2feb6-af6d-4c80-a4fc-5ecba90f6eb2`。
2. 发送“在搜索框填入 OpenDesk，然后点击搜索按钮。”只点击一次；真实页面显示“搜索完成”“结果：OpenDesk”，搜索次数1；原固定只读观察路径核对业务效果。
   runId=`b1c028e2-adcf-422c-8c66-8ac4ec6670e0`；resultId=`cbaf19ae-bbcf-452d-941d-e24a069303c2`。
3. 续聊“查看搜索结果。”仅1个 extract，读出“结果：OpenDesk”，提交次数保持1，无 fill/click。产品保守标记 EXECUTION_RECEIPT_VERIFIED，不再发起搜索。
   runId=`695c8aea-9060-4dcb-b306-e4cc966c4652`；resultId=`2423b053-5a61-4404-a275-bba40c9977f5`。
4. r1 在搜索前已保存。重新打开 r1 后关闭 Native AI 规划会话，把规划来源改为没有 API key 的 OpenAI Responses 云端；Native RunHost 保持连接。两次分别重置 fixture 为“旧的预填内容”，通过正常 Run 执行同一保存版本：
   Run1 runId=`99e2c57c-9832-404b-be54-6781124c0164`；resultId=`e63812c7-bbe9-42bc-a939-7adc77b471c9`。
   Run2 runId=`9e130998-618e-4fa0-888f-27ee8b5f273a`；resultId=`2d38fbf5-fc96-42c5-89ff-858a092de29f`。
   两次真实输入均为“ai自动化第一选择”；revision=1、sourceHash/resultSourceHash 完全相同；Document=`7E19EF473325B3C40CA0AE0B69C29324`；workerRetired=true、retirement=released。独立 runId/resultId。
   Native Codex thread count 前后均9，max(created_at)均1792074783。证据是产品无密钥配置+保存版执行路径+Native 会话未增加；未采集 Cloud 网络包，不能编造网络抓包证据。

上述是真实产品执行事实，不是最终 HEAD 全量验收：运行中共享 watcher 收到其他 Agent 修改，没有逐个 Run 捕获包指纹。曾从真实调试页确认 dev client 连接 build `40ef91d096742b1ec8d804b97d87991e99263ab034986b652edbc3cf2b2a299d`，之后 dist 已发布过 `f19ff445b41d...`。不能把这些证据提升为本次待提交修复/最终 production 候选的 Chrome PASS。

## 已完成的负路径

- Stop：run `e362c117-7f84-45c1-b8c2-434aa3039d62` → stopped/E_CANCELLED，页面初始值、搜索0，无重放。
- 执行中刷新：run `e0fcc202-ccee-4eca-b817-4eb18d7654ca` → stopped/E_DOCUMENT_REPLACED，初始值、搜索0，无重放。
- Chrome 扩展菜单撤销 fixture 网站访问，按 Chrome 提示刷新，再 Run 并点击“拒绝” → E_PERMISSION/未运行，无页面变化。
- 初始模型被账户拒绝时 UI 为 E_OUTCOME_UNKNOWN，未产生 proposal/动作、未自动重放；后来只修改隔离 Codex home 的 model/effort 后真实模型调用成功。
- Native 断线、Worker 不释放、晚到 AI/RunHost、真实保存字节/SHA 破坏：尚未真实验证，保持 NOT_TESTED。

## 当前真实环境：复用，不重新安装

模式：持续开发。扩展固定加载 `/Users/shopme/Documents/workspace/opendesk-browser/dist/development`，ID `ccfcjegpkdlgbclopjmadlcjedelidmf`。现有唯一 npm run dev 是本会话启动的 watcher，Node PID8026、guard43120、serve43119；日志 `.runtime/workflow-local-e2e-01a13fcb-dev.log`。不得再启动 dev/build 覆盖该输出，也别停其他 Agent 的服务。

专属 CFT 应用完整路径：`/Users/shopme/Documents/workspace/opendesk-browser/.runtime/workflow-local-e2e-01a13fcb/Google Chrome for Testing.app`，主 PID12922；profile `/var/folders/b3/0l3tmv5j3hs83hp8l34z89p00000gp/T/codex-cft-m7d4gv0_`；元数据 `.runtime/workflow-local-e2e-01a13fcb/chrome-launch.json`。
先用 `/usr/bin/python3 /Users/shopme/.codex/skills/chrome-testing-keychain/scripts/check_instance.py .runtime/workflow-local-e2e-01a13fcb/chrome-launch.json` 验证实例。使用 cua_repl native App 绑定上述完整应用路径操作。扩展 tab 的程序化 getTab 被工具策略阻止过，不绕过，不用 CDP/Playwright/DOM 赋值/synthetic events。

当前 CFT **仍显示127.0.0.1网站访问“允许/拒绝”原生弹窗**；用户最新明确“授权，你可以直接控制电脑，完成。”，直接在 Chrome 正常点允许，不要重复问。该请求来自保存版 Run，批准后可能立即开始等待/执行；首先观察终态，不盲点 Run。

Native instance=`wf-e2e-01a13fcb`，Go setup/doctor 已配对正确 ID；Native 主进程先前 PID14793。日常 ID/路径/Native manifest 未换。保持必需 Native 通道。

CFT 启动环境使用 audited CLI0.159.2：`/Users/shopme/.local/opt/opendesk-codex-0.159.2/node_modules/.bin`。CODEX_HOME=`/Users/shopme/Documents/workspace/opendesk-browser/.runtime/conversation-r13-01a13a4b/native-codex-home`；仅该隔离 home 已从账户不支持的 gpt-5.5/high 改为 gpt-6.1-sol/low；备份 `.runtime/workflow-local-e2e-01a13fcb/native-codex-config-before.toml`。不改全局凭据/模型、不放宽版本门。
Node：`/Users/shopme/.nvm/versions/node/v24.16.0/bin/node`。代理 `http://127.0.0.1:7897`。

## 正在修复：务必承接现有未提交 diff

1. `src/ui/workflow/workflow-view.js` **+1行**：新执行清空 workflow-output 时同时清空 workflow-technical，避免权限预检失败却展示上一轮 runId。真实复现于撤权拒绝后旧 e0fcc202 身份残留。现有30项定向测试通过；**修复尚未构建入 Chrome，不能声称重测通过**。
2. `src/framework/sdk/browser-schemas.js` **+2/-485行**：并行已提交 `5d630f7a0f6dacd9ff0b96b54d5349e368e41d23` 在两个正则里误插了两份旧文件后缀，导致字符串未结束，阻塞唯一 watcher。已经只恢复两个 `^[a-z0-9.-]+$` 字面量、移除误插重复内容，Node --check 通过；不回滚此恢复、不覆盖其他 SDK 工作。
   **尚缺下一步**：该原提交的三条 managed proxy Schema 只留在误插副本里，需放回唯一 `ops` 表（这些对应 Registry 已存在，不是新 API）：
   ```js
   'browser.proxy.managed.getStatus':[empty,managedProxyStatus],
   'browser.proxy.managed.requestEnable':[obj({config:managedProxyConfig},['config']),managedProxyStatus],
   'browser.proxy.managed.requestDisable':[empty,managedProxyStatus],
   ```
   目前 schema targeted tests 因 Browser operation schema drift/E_CONTRACT 失败。补回后重跑受影响测试，不重建 SDK/Host/Controller/Provider。
3. watcher 还曾报 `工具能力声明超出当前支持范围`，来自 `src/ui/sidebar-tools/package.js:39` / official tools build，具体哪个工具尚未定位。不能放宽包能力合同、不能擅改 AdBlock Trusted SHA pin。先看最新日志确认当前 blocker，不把历史错误当新事实。

当前无本任务 commit/push。其他 Agent 仍在 main 持续提交和修改，最新 checkpoint HEAD 仅是观察时点。写入前读 diff，Git index/HEAD 操作串行、精确 add 路径；本轮 workstream/evidence 被 ignore，确需提交时用明确路径 git add -f，绝不 add .。
只读子 Agent 的诊断可能在 `.runtime/workflow-local-e2e-01a13fcb/sdk-build-diagnostic.txt`，先核对它是否已生成；不要继续派生长期计划。

## 下一步只完成这些

1. 先承接 schema 三条映射、定向测试，排除现有 watcher 的具体阻塞，确认实际新构建指纹和 dev 连接。
2. Chrome 重验“先有回执→下一轮拒绝网站授权→旧技术身份不残留”，再恢复 fixture 权限。按相关输入差异决定受影响重测，不因聊天/HEAD变化无故重跑已完成 A/B/C 和 AI-Off×2。
3. 完成尚缺的必要负路径；无法安全真实复现的明确 NOT_TESTED，不能用 Node 冒充 Chrome。别改第二套执行框架。
4. 核对源码/产物身份，正常提交并推送授权 main 的精确本任务改动与证据；报告 Node/CI/Chrome 的真实等级。production/ZIP/F3 没做就不要宣称。
5. 最终简洁中文矩阵：扩展真实加载、一次Send填写、搜索结果、续聊不重搜、保存r1、AI-Off Run1/2、Stop/撤权/unknown、真实构建安装。附文件/commit SHA、未完成真实任务与唯一下一步。无证据不评分95+。
