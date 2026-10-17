# ChatGPT Mind Map R3.9.6：本地固定资源业务验证

负责人：本对话 Codex；2026-10-17，本地 Mac，main。

目标：真实 ChatGPT 新测试会话 → 原生点击每条回复的思维导图 → 固定参考 XMind 资源经现有 Page UI 通道显示 → 原生交互 → 完整原文恢复；最终保留测试窗口。

授权：用户本轮明确授权普通本地修改、调试、独立候选构建、原生测试及安全本地提交；允许既有 XMind 参考资源用于合法本地开发测试。历史 PENDING_USER_CONFIRMATION 不阻塞本任务。不发布、不推送、不改许可批准或正式安装成功状态。

写入所有权：本记录、examples/programs/chatgpt-mindmap/ 下实际所需业务源码/测试/本地开发构建脚本及文档；专属证据 artifacts/chatgpt-mindmap-r396-local-frame-20261017/。已有未跟踪 xmind-installed-child.js 先读取再复用。框架默认只读；仅证实通用缺口后另记最小接口及写入范围。

已复用：c822fe86 的真实回复选择器、按钮原生点击及 E_FRAME_UNAVAILABLE 后同节点原文恢复；前序固定资源 loader 能力、候选 production 包。无需重跑通用 loader 或许可检索。旧 47 PASS/3 SKIP 不提升为 XMind 业务成功。

资源：日常 dist/development 的 npm run dev PID 34226 保留；不启动第二 writer。本轮先沿用 artifacts/chatgpt-mindmap-r396-mac-20261017/loader/build-snapshot/dist/production 静态 production 扩展候选（不连接 dev server），独立 CFT/Profile/mock keychain，实际启动身份另存。业务源码通过真实开发预览运行，仅表示本地开发验证，不能冒充正式 Program 安装。

通过条件：真正 XMind 可读、四分支及三级列表内容完整、折叠/展开、缩放、全屏、关闭、完整同节点原文恢复；截图、原始观察与源码/候选身份绑定。失败保留原始证据。

当前状态：正在定位业务项目固定资源声明缺口，尚未证明平台通用缺口。保留其他任务 diff 和共享索引；提交时只暂存本任务明确路径并串行核对。

本轮新增证据（2026-10-17）：
- 实际确认业务 package 未声明 pageFrames；通用开发预览还没有固定资源 bootstrap/messaging。按 runtime Skill 仅扩展既有通道，未新增 Installer/Host 或 Mind Map 宿主业务特例。
- 本地 builder 使用仓库原参考字节，并为未使用的 Snowbrush `eval(task)` 字符串计时器分支做单点显式拒绝；原参考文件未改，原 CSP/validator 不放宽。仅独立临时项目携带资源；正式 Program 保持 BUILT_UNVERIFIED/installable:false。
- business-candidate4：4225142 bytes，sourceHash=76ce407076bca492e4683d7bf25fcae4d55a95363af32871dfa24dea2504a272；资源4523e609bf4fb3378bc24c075c796ae90c694c28a2db7edd6f5fb90b9b24ed17。实际 SDK 单元6 PASS/0 SKIP（非原生显示）。
- 独立静态 production CFT 候选 eb2eb50b56ba43f99b66bdae6a122f7ca6ff8e158250792bd5e90d13209a55fd，真实 OpenDesk id=acfngehajboacgkmdhbcnkhjdabfhfon。旧专属扩展已停用；日常扩展未替换。候选仅恢复其既有审阅基线 Prompt Shortcuts 两文件，详见 isolated-reviewed-baseline.json，根仓库未回退。
- 新匿名真实会话 https://chatgpt.com/uc/6ad335f8-20c0-83ea-b027-145296742a98，实际回复757字符、四个二级标题和真实三级列表。原DOM handle保留。
- 第一原生试运行 E_SOURCE（固定资源被错误按普通128KiB拒绝）；修复通用验证后再试 E_UI_LIFECYCLE（普通JS编辑器没有携带managedUI）。保留两次失败及截图，不算导图完成。
- 新增最小 UI 接线负责人：native subagent Aquinas，仅 src/ui/script-editor.js 与其定向测试/workstream；同一 managed lifecycle，普通无资源JS保持原路径，未知副作用不重放。leader 独占 CFT/Profile、clipboard、54176候选build guard和本任务候选输出。

## 最新续接：核心功能优先，保留真实导图窗口（2026-10-17）

用户最新要求：先完成核心功能，未完成前不进入后续边缘环节；允许先开发环境测试，不要过早生产；提供新对话续接提示词。已停止新增生产候选和边缘清理工作。

本轮实质进展：同一真实 ChatGPT 新匿名会话原生运行固定资源业务源码，原生点击真实回复按钮后，**真正 Snowbrush/XMind 已绘制**，18个 topic、子文档独立 snowbrush_style=1；已原生进入导图全屏并保留窗口。当前不存在 E_FRAME_UNAVAILABLE/E_UI_LIFECYCLE 错误提示。截图 `artifacts/chatgpt-mindmap-r396-local-frame-20261017/handoff-actual-xmind-window.png`。

核心仍未完成：当前真实嵌套列表被合并为长节点，三级层级/完整性待修复；折叠展开、放大缩小、退出全屏、关闭和完整原文可见恢复未验证。原文同一 DOM、innerHTML/text仍完整但隐藏，不能算恢复 PASS。只允许把原生点击、实际绘制和进入全屏登记为本轮通过。

窗口：OpenDesk MindMap R396 CFT，PID73878，mock keychain，Profile见 chrome-launch.json。实际会话 https://chatgpt.com/uc/6ad335f8-20c0-83ea-b027-145296742a98 。窗口、Profile及launcher均未关闭/清理。当前真实OpenDesk扩展 acfngehajboacgkmdhbcnkhjdabfhfon，加载已存在的独立静态 production 调试候选，packageHash=1945c90b081d8f6d3e80eec11510a4907c277a70e72651d78f4e9f3b91d23b10；这不是生产发布/正式安装。后续优先直接改业务并重新构建本地业务候选，无需因解析问题重建扩展。

任务8个共享平台/UI源码hash与已加载候选相同。独立审查的两项边界修复未完成，已保存在 artifacts/chatgpt-mindmap-r396-local-frame-20261017/deferred-retirement/，根代码撤回仅本agent可证明归属的未完成增量；未知 worlds.frameGone 不在根源码。两项红测试及补丁均保留，不假报修复。本轮暂停新增边缘代码，当前frame定向9 PASS已复核。它们不作为当前业务绘图的全局停工条件。

UI接线新增8 PASS、既有editor100 PASS、UI77 PASS；原平台215 PASS/实际SDK6 PASS范围见交接证据，不提升为完整原生业务PASS。所有本轮源码仍未提交，无push。main上他人推进到a1e1e5c不是本轮提交。

下一步唯一优先级：用已保存真实 chatgpt-original.html 定向修 src/extract.js 语义层级和完整内容，再在保留窗口原生验证核心交互、关闭恢复原文，最后重新打开可用导图给用户查看。不要重跑loader/许可证搜集或扩展安全矩阵。

完整可复制提示词：`artifacts/chatgpt-mindmap-r396-local-frame-20261017/HANDOFF-core-first-next-chat.txt`。
准确机器状态：同目录 `handoff-core-state.json`、`handoff-source-state.json`。

## 用户最新反馈及 Git 保存（2026-10-17）

用户明确要求提交推送相关文件，并提供新对话提示词继续完善。最新实际反馈优先于此前的按钮阶段结论：回复下方看不出明显的“思维导图”大开关，打开后无法关闭。下一轮P0顺序改为：回复底部明显文字开关 → 普通/全屏明确关闭入口 → 同一原文完整可见恢复、开关复位和再次打开 → 再处理列表层级与其他核心交互。不把仅隐藏原文仍在当作关闭PASS。

本次只保存最新状态和交接，不宣称已经修复上述缺陷。核心未完不进入后续边缘环节，允许开发环境测试，不新增生产候选/验收。

本轮早先未提交的运行时、工作台、本地builder与child入口已由并行集成负责人保存为801444da0；远端更新随后合入58ed3bf2c。核对时索引已清洁，未撤销或纳入此前他人的暂存。本次Git事务仅增加本工作流、业务README与NEXT-CHAT-R3.9.6.zh-CN.txt；提交后安全推送main，非fast-forward则保留状态并重新核对，不强推。

新的正式续接提示词：examples/programs/chatgpt-mindmap/NEXT-CHAT-R3.9.6.zh-CN.txt。它覆盖旧HANDOFF中先修列表的顺序；旧原始证据和详细环境仍保留。

## 用户最新定位与切换反馈（2026-10-17，覆盖上节旧描述）

负责人仍为本轮 Mind Map 交接负责人；本次只更新本文件、业务 README 的最新状态段及 NEXT-CHAT-R3.9.6.zh-CN.txt。README 中并行新增的本地项目/手工导入说明及 docs/api/sidebar-local-projects.zh-CN.md 不属于本次提交范围，保留其工作区修改。

用户明确按钮必须添加到本条 assistant 回复的官方操作组内，和官方复制等按钮同一位置。实际元素带 data-assistant-message-actions、data-message-actions 和 role="group"，中文 aria-label="回复操作"；混淆 class 及本地化 aria-label 只作为当前页面观察，不作为定位合同。续接须用稳定 data 属性、结构及正确回复作用域，保持每条回复一个可见文字开关。

最新具体故障是“关闭后无法再次打开/切换”，取代早先仅描述“打开后无法关闭”的当前诊断。核心通过条件为原生“打开→关闭→再次打开→再次关闭”，普通及全屏流程都能重复；每次真正显示 XMind、关闭后恢复同一原文节点的完整 HTML/text/可见性，状态与 aria-pressed 一致。未执行新的原生验证，不登记修复 PASS。

已安全合入远端 reading-toc 两笔并行提交，保持 main、保留双方历史；无强推。此处交接仅修正文档与下一轮优先级，不新增生产构建或边缘验收。
