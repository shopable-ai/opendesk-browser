# AI 对话四产品 R1.2.2-WEB · 实际源码收敛与 owner 交接（2026-10-26）

## 一、不可漂移的产品目标与代码边界

主仓库 `shopable-ai/opendesk-browser`，只向 `main` 提交。本轮将 Prompt Shortcuts 从网页滚动导航彻底解耦为四项独立产品：Sidebar Tool `prompt-shortcuts`（AI 提示词快捷按钮）、Page Program `opendesk.ai-scroll-navigation`（AI 对话滚动导航）、`opendesk.ai-reply-mindmap`（AI 回复思维导图）、`opendesk.ai-send-queue`（AI 消息发送队列）。**共享回复操作区只是 DOM 协议，不是第五个扩展**；通用名称不等于新的站点授权。

起点远端 `main=5a6be8ecc2cdc51dfd61b207307ce14b5332f8be`；写入期间其他 owner 继续正常提交，所有本轮写入按所读 Blob SHA 作内容更新。仅能确认 GitHub 远端，**不能确认用户 Mac 本地 dirty 文件、索引、运行进程或隐形并行 owner**。不新建 branch、Worktree、PR，不覆盖旧证据或冻结包。

## 二、本轮已落地：文件及 Blob 收据

| 路径 | 原 Blob → 更新 Blob | 提交 | 结果 |
|---|---|---|---|
| `examples/sidebar-tools/prompt-shortcuts/trusted/model.js` | `9b29be376a28be9aa2958913ea7dc758459bb171` → `730496110c2ebc316eb74e1c29ac66dc74d60561` | `dffeec493ea1b065658a768ffbaeb4b342465a0f` | 去旧导航 defaults/API；兼容读取旧字段，下一次正常持久化删除；现有 library schema 与提示词数据保留 |
| `examples/sidebar-tools/prompt-shortcuts/preview/index.html` | `c7cdd177de652282508aeb45fbc5611eef1f9aec` → `593e1257587180605a0bdb12935f38b795adab51` | `817ac0c109d901f067bd76a80004bb6b2e042e94` | 去导航栏、长回复双按钮、恢复设置、导航滚动模拟与所有相关监听；提示词列表、网站配置、草稿及图片保留 |
| `src/ui/sidebar-tools.js` | `50a7b602c0c8b344ca601541271d95ce1f62f730` → `484d4a99e217de7b025b6b8323a94645358ea43c` | `25b24059bdbc702ebab435a415b61c5d3de84c3e` | 移除 Host 中 Prompt 导航状态、恢复回调及旧接口调用；原 Host 网页按钮的授权、并发锁、写后读回不变 |
| `src/ui/react/tabs/tool-host.tsx` | `9f6488de7c49065920961d7086d025097d48b3b3` → `5d9fd48830e64ee1ae148dda01b74186f37afe60` | `2651085fafa1900d28d4a1fb9f0734d78fdfdff5` | 删除旧导航高级设置组，不删除快捷按钮和选区右键开关 |
| `src/ui/extension-center-model.js` | `891265696cdb5d1e32fd9827ebd28987c8a22bf7` → `f8440fff5caeb7599faed302c92e710069a8ebb4` | `802e239a05fb60707133033a8892bb30c70bcef9` | 仅按准确安装 ID 增加 AI/中文/英文/旧版搜索别名；不改 installed record、title、Authority、package schema、筛选可见性 |
| `tests/environment/prompt-shortcuts-r14-scroll-navigation.test.mjs` | `8c580f7a7e1eb7527185cacbc1d88034b7132b14` → `52f138cf2fc6ecf3f99d25c6c4ade724fc793517` | `3a8190a01f9529315a2806ff224b91fff1345d5c` | 更新历史设置兼容测试，保留 Scroll 容器及网站适配源测试 |
| `tests/environment/prompt-shortcuts-r16-persistence.test.mjs` | `65add84532bf36afb7cf6121d0f90c05cdf88f87` → `ab3aa029915f4bae1268b65bb69239282cbd834a` | `dbdcc8569c06b2f55d7d1a43feabb07e66d4948b` | 以旧设置读回／模拟保存失败／无导航 DOM 测试替换过时的旧开关实验 |
| `tests/environment/tool-host-management-groups.test.mjs` | `bfbd909db0866aa6e64ecd02905ca2e3626bb435` → `30bfe62fb9659b3839b650b9b0f724a8505e0ffb` | `efd88d59d1a75c257e2130987636ae73e36f8a8e` | 删除对已退役导航 React 组的测试要求 |
| `tests/environment/extension-center-r4.test.mjs` | `839f5a2086dc4777217b0a825030f6487bccb0e2` → `581fb414df8ff3b12b0efabd8ebcb26964fda7ba` | `c452220fdb1f7c9ff9e663a0b9a72149eefd4b1e` | 测试四产品词条、旧 ID 独立搜索及「未安装不得冒充已安装」 |
| `examples/sidebar-tools/prompt-shortcuts/README.zh-CN.md` | `9fa5af7540f531b9233e98bfbfaecd980f5fbb38` → `093387f980dfa882a854a8fedefc77468f37f435` | `a0934c4cdc36184bd0f52ecdf1224c25b220c635` | 改本版当前职责说明；旧历史记录不篡改 |

全部上述更新 Blob 已在更晚 `main` 上重新读取核对；与旧 R1.2.1 Scroll owner 不重复修改其业务算法。

## 三、W0–W6 逐项状态、证据范围

| 节点 | 状态 | 业务事实 |
|---|---|---|
| W0 最新 main/owner | `SOURCE_VERIFIED`（仅远端） | 已读 AGENTS、并行协议、测试指南及最新相关工作流；Mac dirty/当前隐形 owner 不可证 |
| W1 Prompt 去导航 | `SOURCE_IMPLEMENTED`、局部 `SOURCE_VERIFIED` | Host、React、model、主交互预览已收敛；旧数据不主动覆盖。现有正式 Prompt JSON 仍是 1.1.18，而配置源码为 1.1.19 |
| W2 Scroll 新包 | `PACKAGE_BUILD_REQUIRED` | `chatgpt-jump-top/` 源码 `opendesk.ai-scroll-navigation` 版本 0.4.0；旧包文件 `chatgpt-jump-top.opendesk-page.json` 仍为旧 ID / 0.2.0 / revision 2 / ChatGPT-only，未触碰 |
| W3 共享回复操作区 | `ALREADY_DONE`（现有源码）+ `NOT_TESTED`（安装顺序） | 保留 `data-opendesk-chatgpt-answer-tools` 与旧 `data-opendesk-chatgpt-jump-top`、新 `data-opendesk-ai-scroll-navigation` 的兼容；没有新回归证据，不动 Mind Map XMind 或建立第五个扩展 |
| W4 Mind Map ID | `MIGRATION_REQUIRED` / `OWNED_ELSEWHERE` | 源项目仍 `opendesk.chatgpt-mindmap` / 0.2.7，新 `opendesk.ai-reply-mindmap` 未交付；Viewer Theme、数据命名空间与安装身份须由独立 owner 核对迁移 |
| W4 Send Queue ID | `MIGRATION_REQUIRED` / `OWNED_ELSEWHERE` | 源项目仍 `opendesk.chatgpt-send-queue` / 0.1.2；Send Queue 活跃 owner 管理其 engine/site/view/package；本轮完全只读 |
| W5 扩展中心搜索 | `SOURCE_IMPLEMENTED`、局部 `SOURCE_VERIFIED` | 精确 ID 别名可用于搜索；旧安装仍返回原旧 ID，不变更权限与站点 |
| W6 验证 | `NOT_TESTED`（Node、编译、真实 Chrome） | 当前源码的 V8 快速解析、Prompt 旧库读/归一化/写回、小型扩展中心别名和预览恢复探针通过。它们不是正式 `node --test` 或真实浏览器 PASS |

## 四、安装合同：同 ID 升级与不同 ID 迁移分开

- `prompt-shortcuts` 不改身份。源码 `tool.config.json` 1.1.19、旧正式 JSON 1.1.18 必须走**既有** Sidebar Tool builder 与官方来源审阅；不得把 trusted Host 代码变化冒充旧 Sidebar JSON 已升级。
- Scroll 从 `opendesk.chatgpt-jump-top` 到 `opendesk.ai-scroll-navigation` 是**全新安装身份**，不是同 ID 原位更新；以原 `scripts/validate-program-project.mjs`、`build:program` 和 `scripts/build-page-install-package.mjs` 构建新文件，例如 `ai-scroll-navigation.opendesk-page.json`。**不得手工拼接生成 JS 或哈希**。原 builder 参数为 `--input <实际 draft JSON> --out <新包路径> --revision <经审阅的新 ID 版本> --title "AI 对话滚动导航"`。生成后必须核对 manifest/program/sourceHash/packageHash 与审批的三个固定站点范围；不能只因为 title 变更就转移 Authority。
- 旧、新 Scroll 同时注册时只依赖现有源码级 DOM 仲裁减少重复交互风险；它不会替用户卸载旧安装。由安装 owner 核验旧 ID、用户设置、旧脚本实际停止、刷新页面、新 ID 安装及再次授权。
- Mind Map `opendesk.chatgpt-mindmap` → `opendesk.ai-reply-mindmap`、Send Queue `opendesk.chatgpt-send-queue` → `opendesk.ai-send-queue` 分别由其**独立 Page owner**实现最小身份 patch，包含项目元数据、入口及必要存储兼容、正式包/修订、定向测试。不得改 XMind 或 Queue 发送状态机。旧 Viewer Theme 不能静默消失；进行跨 ID 用户数据迁移必须有显式复核/备份与恢复，不得继承旧授权。Send Queue 必须防止旧排队内容在新身份被隐式重发。
- 扩展中心关键词只映射准确 `row.id`；安装来源、安装记录、可见性、站点域名和启停语义未改，旧 ID 仍显示为旧安装。

## 五、在各独立 owner 可用时的最短下一步

1. **Prompt 安装来源 owner**：接收上述四处修改后的当前 SHA，先跑 `node --test tests/environment/prompt-shortcuts-r14-scroll-navigation.test.mjs tests/environment/prompt-shortcuts-r16-persistence.test.mjs tests/environment/prompt-shortcuts-r14-management.test.mjs tests/environment/tool-host-management-groups.test.mjs`；修复真实失败，再通过既有 Sidebar Tool builder 更新正式包与官方来源收据，不改旧用户数据。
2. **Scroll Package owner**：在真实 Mac main 工作区确认项目版本 0.4.0、无其他 dirty overlap；跑 `node scripts/validate-program-project.mjs examples/programs/chatgpt-jump-top`、`node --test tests/environment/chatgpt-jump-top.test.mjs`；仅使用真实 `npm run build:program -- examples/programs/chatgpt-jump-top` 及已验证项目 draft 生成**新文件名** Page 安装包。登记全部生成哈希和三站审阅结果。
3. **Mind Map owner**：取得文件 owner 协调后，仅补新 ID 源码/包和 Viewer Theme 可验证读取策略，测试 XMind 与 Scroll 新旧标记共存；未审阅的站点保持关闭。
4. **Send Queue owner**：在其 0.1.2 最新基线上只做新 ID 身份/包的最小迁移，保留 engine、发送安全栅栏、IME/附件/草稿所有权、unknown effect 无自动重发，分别核对旧数据与旧安装。
5. **Extension Center owner**：在本轮精确别名基础上运行 `node --test tests/environment/extension-center-r4.test.mjs`，真实安装时核对「提示词／回顶／XMind／Queue」分别搜出准确独立安装项；无包时不得假造可用记录。
6. 任何所有权冲突只阻塞对应文件；不要在新对话再次执行已完成源码。本轮 workstream 只记录远端交付；真实 Mac 安装、升级、撤权、浏览器回归和四产品完整评分必须另行依据当时源码及正式产物验证。

**阶段门禁：业务源码尚未全完成（Mind Map / Send Queue 新 ID 未交付；Scroll 新正式包未构建），不能宣布进入 R1.3 Mac 正式验收。** 源码变更不是安装变更，V8 探针不是 Node/Chrome PASS；八维专家评分缺乏独立完整验收证据，全部保留 `NOT_SCORED`，综合分不编造。
