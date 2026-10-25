# AI 对话滚动导航 R1.2.1 · 源码身份与共存收尾（2026-10-25）

## 任务与责任边界

- 来源：用户 R1.2.1 GOAL；业务 owner 本轮只接管 `examples/programs/chatgpt-jump-top/` 的 Scroll 源码和定向测试、此工作流记录。
- 起点：GitHub `main` `e080939b430112b66d94f4d6aca7e0bcbc4bddda`。这是**远端快照**；当前会话不能读取用户 Mac `/Users/shopme/Documents/workspace/opendesk-browser` 的 `git status`、staged diff、并行进程或原生 Chrome。提交前逐文件使用 GitHub 最新 blob SHA 防覆盖；远端核对不冒充本地 owner 释放。
- 目标：产品显示名「AI 对话滚动导航」；`PROGRAM_ID=opendesk.ai-scroll-navigation`；三个明确审阅的站点；五个现有导航键保持默认；旧与新源码、Mind Map 共享回复操作区不相互卸载。
- 其他 owner 保持只读：Prompt Shortcuts 的保存/插入与 React ToolHost，Mind Map 的 XMind 与当前 program 身份，Send Queue 队列引擎与身份，Extension Center；不动公共 SDK、Host、Authority。
- 只写 `src/main.js`、`src/conversation.js`、`src/floating-navigation.js`、`package.json`、对应 `tests/conversation.test.mjs` 与 `tests/environment/chatgpt-jump-top.test.mjs` 及本工作流。需要处理 README 时先查 blob。
- 已有 Scroll `site-adapters.js`、长内容绑定、两个悬浮物理控件、Observer 生命周期和旧包均复用，禁止重写。旧正式 `chatgpt-jump-top.opendesk-page.json` 仍是 ChatGPT-only 的 `0.2.0`，**不修改/不作为新包安装**。

## 安装迁移合同与限制

- Installed Page Authority 按精确 `programId`、安装 ID、授权世代、manifestHash 管理。未证实跨 ID 的安全原位迁移 API；不可迁移旧授权，不自动停用/卸载旧 ID，也不改动 Page Authority。
- 新身份只能经原有 Page 候选验证、导入及用户确认站点范围安装。先显式审阅并停用或卸载旧 `opendesk.chatgpt-jump-top`，刷新已打开网页，之后审阅新包。若旧安装仍保留，两者可能并存，本轮用 DOM 上旧活跃导航优先和新导航保守退出阻止同时产生有效滚动操作；仅 DOM 检测**不能证明系统层已移除旧注册**。
- 真实安装、升级、权限新增、卸载/撤权与多站 Chrome 行为均为 `NOT_TESTED`；迁移发布状态为 `MIGRATION_REQUIRED`，不得宣称 `SOURCE_VERIFIED`、`INSTALL_PASS` 或已取得用户许可。
- 最终状态需记录新旧 ID、旧包、新包 candidate sourceHash、当前 git SHA/Blob SHA 和失败信息。另一个 owner 处理 Prompt/UI 残留时，本轮不得通过旧文档覆盖其新源码。

## 源码验证预期

- Scroll 旧标记保留供 Mind Map 过渡识别，新标记标识本导航真实 DOM owner；同时检测旧导航活体，抑制新脚本重复按钮与点击。
- 长回复只在验证后的对应原生操作栏注入；整段对话共用顶部/悬浮回顶物理按钮，底部独立；前后保持选择/草稿和横向滚动。
- Node 定向测试：`node --test tests/environment/chatgpt-jump-top.test.mjs`；校验：`node scripts/validate-program-project.mjs examples/programs/chatgpt-jump-top`。本会话没有本地仓库/Node 运行入口，不能将源码阅读记成这些命令通过。
