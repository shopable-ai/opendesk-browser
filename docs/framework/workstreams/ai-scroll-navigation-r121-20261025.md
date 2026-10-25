# AI 对话滚动导航 R1.2.1 · 源码身份与共存收尾（2026-10-25）

## 任务与责任边界

- 来源：用户 R1.2.1 GOAL；业务 owner 本轮只接管 `examples/programs/chatgpt-jump-top/` 的 Scroll 源码和定向测试、此工作流记录。
- 起点：GitHub `main` `e080939b430112b66d94f4d6aca7e0bcbc4bddda`。这是**远端快照**；当前会话不能读取用户 Mac `/Users/shopme/Documents/workspace/opendesk-browser` 的 `git status`、staged diff、并行进程或原生 Chrome。提交前逐文件使用 GitHub 最新 blob SHA 防覆盖；远端核对不冒充本地 owner 释放。
- 目标：产品显示名「AI 对话滚动导航」；`PROGRAM_ID=opendesk.ai-scroll-navigation`；三个明确审阅的站点；五个现有导航键保持默认；旧与新源码、Mind Map 共享回复操作区不相互卸载。
- 其他 owner 保持只读：Prompt Shortcuts 的保存/插入与 React ToolHost，Mind Map 的 XMind 与当前 program 身份，Send Queue 队列引擎与身份，Extension Center；不动公共 SDK、Host、Authority。
- 实际写入仅 Scroll 目录的 `src/main.js`、`src/conversation.js`、`src/floating-navigation.js`、`package.json`、`tests/conversation.test.mjs`、`README.zh-CN.md`，以及 `tests/environment/chatgpt-jump-top.test.mjs` 和本工作流。README 已先查 blob 并作必要身份说明。
- 已有 Scroll `site-adapters.js`、长内容绑定、两个悬浮物理控件、Observer 生命周期和旧包均复用，禁止重写。旧正式 `chatgpt-jump-top.opendesk-page.json` 仍是 ChatGPT-only 的 `0.2.0`，**不修改/不作为新包安装**。

## 安装迁移合同与限制

- Installed Page Authority 按精确 `programId`、安装 ID、授权世代、manifestHash 管理。未证实跨 ID 的安全原位迁移 API；不可迁移旧授权，不自动停用/卸载旧 ID，也不改动 Page Authority。
- 新身份只能经原有 Page 候选验证、导入及用户确认站点范围安装。先显式审阅并停用或卸载旧 `opendesk.chatgpt-jump-top`，刷新已打开网页，之后审阅新包。若旧安装仍保留，两者可能并存，本轮用 DOM 上旧活跃导航优先和新导航保守退出阻止同时产生有效滚动操作；仅 DOM 检测**不能证明系统层已移除旧注册**。
- 真实安装、升级、权限新增、卸载/撤权与多站 Chrome 行为均为 `NOT_TESTED`；迁移发布状态为 `MIGRATION_REQUIRED`，不能把局部的 `SOURCE_VERIFIED` 冒充 `INSTALL_PASS` 或已取得用户许可。
- 最终状态需记录新旧 ID、旧包、新包 candidate sourceHash、当前 git SHA/Blob SHA 和失败信息。另一个 owner 处理 Prompt/UI 残留时，本轮不得通过旧文档覆盖其新源码。

## 源码验证预期

- Scroll 旧标记保留供 Mind Map 过渡识别，新标记标识本导航真实 DOM owner；同时检测旧导航活体，抑制新脚本重复按钮与点击。
- 长回复只在验证后的对应原生操作栏注入；整段对话共用顶部/悬浮回顶物理按钮，底部独立；前后保持选择/草稿和横向滚动。
- Node 定向测试：`node --test tests/environment/chatgpt-jump-top.test.mjs`；校验：`node scripts/validate-program-project.mjs examples/programs/chatgpt-jump-top`。本会话没有本地仓库/Node 运行入口，不能将源码阅读记成这些命令通过。

## 本轮实际增量结果、文件 owner 与已知缺口

本轮从 GitHub 连接读取并通过精确 blob SHA 更新 `main`；无法核验用户 Mac 本地未提交文件与实时 owner，所以**不替代本地接收方的冲突前检查**。

| 路径 | 本轮 owner／范围 | 起始 blob → 写入后 blob | 本轮状态 |
| --- | --- | --- | --- |
| `examples/programs/chatgpt-jump-top/src/main.js` | Scroll／独立身份 | `8c1db239f7652f74aa854d02161f166b9168f641` → `02240d3cc064b577da7965f5f241586071b1464a` | `SOURCE_IMPLEMENTED` |
| `examples/programs/chatgpt-jump-top/package.json` | Scroll／0.4.0 元数据 | `5319a787bce059b2104b39953049b0fe04bab015` → `49195991abc1f71d862e644dea3a3088cb101271` | `SOURCE_IMPLEMENTED` |
| `examples/programs/chatgpt-jump-top/src/conversation.js` | Scroll／双标记、旧实例优先、同 key 活体唯一 | `cca839ec6625da106376fb739f4462c44f39fa5b` → `ea1dcb3114175c2b79e134df1794a1fdd93460c9` | `SOURCE_VERIFIED`（仅模拟 DOM） |
| `examples/programs/chatgpt-jump-top/src/floating-navigation.js` | Scroll／跨 bundle 统一浮动宿主 | `051b390e899f56180db0aa5a9251a87daede8cee` → `58e5021fdf74b8b7b2e8ee442520c12de6c50789` | `SOURCE_VERIFIED`（仅模拟 DOM） |
| `examples/programs/chatgpt-jump-top/tests/conversation.test.mjs` | Scroll／新旧同页回归 | `c0a53926b9980957573451c17ab1838f1e0fb4cc` → `0fc53205e6db2687d5a55fdd142bc88b827f31e6` | 已提交 |
| `tests/environment/chatgpt-jump-top.test.mjs` | Scroll 专用环境断言 | `9daf230868f248b11739d243b9b7cfe6d6446fbb` → `a28c657202952bccce8b9194346cbe3bca609d80` | 已提交 |
| `examples/programs/chatgpt-jump-top/README.zh-CN.md` | Scroll／身份、安全迁移交接 | `78ef37b660e9092a6d4edfb27e0c637789dd2f3f` → `891adb153a89f68e8a2966c94e65192bc6efc225` | 已提交 |
| `examples/programs/chatgpt-jump-top/chatgpt-jump-top.opendesk-page.json` | 旧已安装包保留 | `f7040aad2e257cfa47973ecfde326e122e5b333d` → **未改变** | `MIGRATION_REQUIRED`：不是新正式包 |
| `examples/sidebar-tools/prompt-shortcuts/trusted/page.js` | 其他 Prompt owner／只读 | `96290d6c96b957bf530c37f67bb74ddbc4b8d6fb` → **未改变** | 导航运行时已不在此文件 |
| `src/ui/sidebar-tools.js`、`src/ui/react/tabs/tool-host.tsx` | Prompt 管理／React owner，只读 | 起始分别 `76c17bb6a1884378b1a500399350f23af71d4acd`、`9f6488de7c49065920961d7086d025097d48b3b3` | 仍存旧导航设置，需要对应 owner 删除 |
| `examples/sidebar-tools/prompt-shortcuts/trusted/model.js`、`preview/index.html` | Prompt owner，只读 | 起始分别 `9b29be376a28be9aa2958913ea7dc758459bb171`、`c7cdd177de652282508aeb45fbc5611eef1f9aec` | 旧配置兼容和模拟导航仍需收敛 |
| `examples/programs/chatgpt-mindmap/src/answer-registry.js` | Mind Map owner，只读 | `cfdf9723d82ea20f38008d048dd16c75c1f4e01e` → **未改变** | 通过新 Scroll **保留旧 DOM 标记**兼容；正式安装顺序未实测；ID 未迁移 |
| `examples/programs/chatgpt-send-queue/**` | Send Queue 活跃 owner，只读 | 不在本轮文件级写入范围 | ID 未迁移，保持其发送引擎及原生证据 |
| `src/ui/extension-center-model.js` | Extension Center owner，只读 | `891265696cdb5d1e32fd9827ebd28987c8a22bf7` → **未改变** | 已安装 Page 只按 title／ID／版本／站点字符串匹配，未索引 npm description，「长回复／回顶」别名仍缺 |

### 已执行的限定验证

- 本轮 Scroll 四个 JS 源文件与两份定向测试经 V8 语法解析检查；不是仓库官方 Node checker。
- 取正式 `conversation.js` 与原 `conversation.test.mjs`，用 V8 + 自定义同步 `node:test`／assert Shim 和既有模拟 DOM fixture 运行 66 项，**66/66、0 失败**；结果绑定以上 source/test blobs。此法不替代真实 Node test runner。
- 另用两份彼此隔离的 `floating-navigation.js` 代码实例，在自行实现的最小 V8 DOM 中核对六步：首装出现一枚 dock、第二实例不重复、旧 Page 动态出现立即拒绝旧点击、旧身份胜出时新 dock 退出、旧消失后新实例恢复、Dispose 清理，**六步符合预期**。此为轻量模拟而非真实 Chrome。
- `node --test`、官方 Program validator、源码产物构建及哈希、真实站点、安装升级、停用撤权、Prompt 回归、Mind Map 真机共存：全部 `NOT_TESTED`。

### 尚未达到本轮全部业务源码完成门槛

新 Program 源码的身份及共存逻辑已收敛，但 **Prompt 设置 UI／预览尚有明确旧导航残留；Mind Map、Send Queue 的通用 ID 迁移需各自 owner 协同；Extension Center 搜索别名未完成；新 Page 安装包尚未通过原有候选构建／哈希核验／用户授权审阅**。不得宣称 R1.2.1 全项源码完成，也不得提前签发本地 R1.3 正式验收 GOAL。
