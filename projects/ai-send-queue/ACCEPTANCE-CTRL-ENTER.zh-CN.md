# Ctrl + Enter 验收（2026-11-09）

**结论：正式 Page 源码已实现并完成最小修复；r16 离线候选同源校验通过；本轮真实 ChatGPT 快捷键与安装验收尚未取得证据。** 独立评分平均 **82.2/100**，未达 95。公开发行继续 blocked。

| 层级 | 结果 | 证据与限制 |
| --- | --- | --- |
| SOURCE_IMPLEMENTED | 已完成 | 正式 `src/page/main.js` 复用 `actions.enqueue()`，不是预览实现 |
| NODE_TEST_PASS | 定向通过，全测未全通过 | 入口 26/26、View 22/22、main＋Site＋Engine 组合 9/9；全测 246/247 |
| BUILD_PASS | 通过 | 项目 Vite 和 Page production 编译成功；未构建 Browser 本体 |
| PACKAGE_VERIFIED | 仅离线候选通过 | `0.1.15/r16` 源码、资源、规则及两项包摘要已校验 |
| NATIVE_PASS | NATIVE_NOT_TESTED | 未安装或运行 r16，未在真实 ChatGPT 完成本轮键盘矩阵 |
| 正式晋升／安装 | NOT_PROMOTED / NOT_TESTED | 正式 r15、sources 与 Host pin 未替换 |
| 公开发行 | RELEASE_BLOCKED | 官方资源准备链仍输出 blocked，没有解除其他发布阻断 |

## 本轮修复

起始 HEAD 为 `3c0f53686b047eb94af6c83f38709ff0b17380ff`，快捷键已经存在。只读 fetch 后安全快进到 `a1b39dee16e7f96419bc554263dcd0ee7cefaa90`，远端五个新提交仅涉及 Reading TOC。没有重新实现快捷键，没有创建分支、worktree 或 PR；唯一业务 owner 保持本项目。

独立审查发现两个真实缺陷，新增回归先失败，再修共享入口：

1. **非可信事件可入队。** 键盘监听新增 `isTrusted` 检查；人工事件不会清空草稿或入队，普通 Enter 的受限回退也遵守该保护。
2. **发送残留正文可被再次入队。** 在 preparing、await-native-ready、await-confirm、unknown、await-stop 等未结束 flight 下，快捷键和皇冠共同保留草稿并提示，不再清空或入队。确认入站后，即使回复仍在生成，也允许添加新草稿，包括有意输入相同正文。

没有修改 Engine、Site、权限、身份、安装器、匹配范围或执行世界，没有新增队列。固定时钟补测 compositionend 后 99/100ms、编辑器替换／composedPath、退休及旧实例栅栏。新增组合回归使用真实 main、Site、Engine，覆盖同步重入、残留正文、迟到确认与三条 FIFO；DOM、UI、时间为 Node 替身，不能替代原生验收。

两个预览失败属于陈旧断言：代码已移到 `preview/boot.js`，按钮当前为「加入示例消息」。本轮只更新归属测试，并调用现有 Preview Model 验证展开和草稿保护，没有修改预览 UI。

## 实际检查

| 命令／检查 | 结果 |
| --- | --- |
| `node --test projects/ai-send-queue/tests/main-recovery.test.mjs` | 修复后 26/26 PASS |
| `node --test projects/ai-send-queue/tests/view.test.mjs` | 修正断言后 22/22 PASS |
| `node --test projects/ai-send-queue/tests/shortcut-integration.test.mjs` | 9/9 PASS |
| `node --test projects/ai-send-queue/tests/*.test.mjs` | 246 PASS / 1 FAIL / 0 SKIP，共 247 项 |
| `node scripts/validate-program-project.mjs projects/ai-send-queue` | AUTHORING_VALID_NOT_PACKAGED，源码／资产／规则通过 |
| `npm run --prefix projects/ai-send-queue build` | Vite PASS，仅侧栏构建证据 |
| `npm run build:program -- projects/ai-send-queue` | Page production PASS；原始 BUILT_UNVERIFIED 不等于已安装 |
| 既有 Page 包生成器／validator、源码输入与资源摘要比对 | r16 候选 PACKAGE_VERIFIED |
| 原正式 r15／exact pin／官方资源准备器 | 独立只读 PASS，发行仍 blocked |
| 本轮 JS 语法及 `git diff --check` | PASS |

唯一全测失败在 `tests/admission.test.mjs:42`：**Sidebar Tool** 正式 JSON 与当前侧栏编译输出不逐字节相同。初测即存在，README 历史也记录过；Vite 重建后仍存在。该断言在 Page 校验前失败，所以另用既有 Page validator 和官方资源准备器核对原正式 r15。未删除断言、放宽准入或重打侧栏包来制造通过。

原始日志与机器汇总保存在本地忽略目录 [`artifacts/ctrl-enter-20261109/`](artifacts/ctrl-enter-20261109/)。`project-all.tap` 保留真实失败输出。

## 用户行为证据

下列均有 Node 回归；本轮同候选真实 Chrome 结果全部为 **NATIVE_NOT_TESTED**。

| 行为 | Node 证据 |
| --- | --- |
| 空队列入队、原生 Send 可用时只入队 | main-recovery：capture、preventDefault、stopImmediatePropagation、首次入队 |
| 已有队列、回复生成、FIFO、只发送一次 | shortcut-integration：三条 FIFO、确认后 busy、有意同文；Engine 确认与回复门 |
| 普通 Enter、Shift + Enter、Alt／Meta | main-recovery：原生行为与受限回退 |
| IME、compositionend、编辑器节点替换 | main-recovery：99/100ms、composedPath；Site：组合输入及当前编辑器复核 |
| 长按、空草稿、附件、队列满／文本超限 | main-recovery：repeat／空草稿／附件／预检；Engine：full／oversized；Site 保护 |
| 清空失败与恢复 | main-recovery：不确定清空／保留副本；Site：替换、部分清空、input 异常 |
| 切换会话、其他输入框、停用／旧实例 | main-recovery、identity、Site／Engine 路由与 owner 复核 |
| unknown、迟到确认、不自动重放 | shortcut-integration：clicked／prepared unknown；Engine 原有安全回归 |

Node 直接调用监听器并显式设置可信事件字段，只证明分支；没有把人工 JavaScript `KeyboardEvent` 当作真实键盘验收。真实 contenteditable、React 输入接收、网站捕获顺序、中文候选、长按和刷新／停用仍缺当前候选原生证据。

## 候选身份

项目版本保持 `0.1.15`，使用原生成器独立指定 revision 16。SemVer 与 revision 不要求尾号相等；没有篡改 draft 元数据或只修改旧包 revision。

- programId：`opendesk.ai-send-queue`；version / revision：`0.1.15` / `16`
- sourceHash：`4e18b915898bc6715d6dd97378dc59f58444d66cd0a0af1c53f9bc3441672f9c`
- packageHash：`54aa2b79a6fa9181eea30ada32cb430aa2fcd052c69906d1fce4218519b01718`
- 安装 JSON SHA-256：`9cb70ebe630506874575c7e36005d88274cdf896bbe95a61cba6eaad180d8b53`
- 范围不变：仅 `https://chatgpt.com/*`、顶层 USER_SCRIPT、document_idle，无外部依赖。

编译目录：[`../../artifacts/programs/opendesk.ai-send-queue/0.1.15/r31-production/4e18b915898bc671-70ccc65024aa/`](../../artifacts/programs/opendesk.ai-send-queue/0.1.15/r31-production/4e18b915898bc671-70ccc65024aa/)。候选名为 `candidate-r16.opendesk-page.json`，同目录 `ctrl-enter-package-verification.json` 记录完整输入及校验结果。

已证明 `program.js === draft.sourceUtf8 === package.sourceUtf8`，当前六个源码模块与两个资源摘要等于构建回执；编译字节包含 Ctrl、可信事件和 flight 保护。根目录正式 Page JSON 仍为 r15，**没有更新为快捷键候选，不能将其当作本次源码对应包**。

## Chrome 与旧状态

ego TaskSpace 47 用于只读检查；系统 Chrome 使用 `/Users/shopme/Applications/Google Chrome.app` 的本任务新窗口。系统 Chrome 实读加载目录为本仓库 `dist/development`，ID 为 `ccfcjegpkdlgbclopjmadlcjedelidmf`，扩展启用且用户脚本允许。只按静态开发包观察，serve 在线状态未证明；未重载或切换扩展，未改 Native 配对。Go doctor 与 production 身份未重新核验。

实际五 Tab UI 已打开。在返回扩展列表及尝试查看 Send Queue 管理入口时，CUA 多次返回「用户已切换界面，请重新查询」保护，故结束该 UI 分支，没有安装、发送或绕过保护。这是验证受阻，不是产品故障或自动审批拒绝。

README 上次观察的旧实例、unknown-result 和未确认 managedCleanup，没有被本轮新证据解除。未刷新旧页、删除队列、重放未知发送或重建清理凭据。ego 新 ChatGPT 页带入用户已有草稿，未改动或发送；TaskSpace 已 finish，保留 p2 供用户继续，其余本任务 ego 页已释放。系统 Chrome 控制变化后未再操作。本机 Ego Lite 提示可更新，未升级。

因此缺 r16 安装回执、授权代数、注册／执行 sourceHash 及真实操作结果；历史 r15 FIFO 不继承为本次 PASS。revision 16 是否已被运行存储中的其他源码占用未查询。必要安装与旧实例前置未完成，所以本轮止于离线候选，不晋升正式包。

**续跑核对（2026-11-09 04:31，Asia/Shanghai）：** 工作区本项目改动与候选输入未变化；重新比对六个源码模块和两个资源 SHA，均匹配已验证候选，未重复测试或构建。系统 Chrome 当前用户窗口可见一条真实待发队列消息；未修改该页、草稿或队列，也未操作其 DevTools。此为新增现场证据，不能将该用户窗口当作空闲测试环境。现有公开生命周期合同明确升级会尝试清理旧受管实例（`docs/api/page-userscript.zh-CN.md:97`），安装器也保留 `E_PAGE_CLEANUP_PENDING` 栅栏；未绕过或解除。已询问可独占、已登录且无待发队列的测试 Profile／窗口信息，等待环境定位后继续。原生目标保持 active，没有标记完成。

**第三轮阻塞审计（2026-11-09 04:33，Asia/Shanghai）：** 再次只读核对同一 Chrome 窗口，待发队列及逐条操作仍在；没有收到可独占测试 Profile 的信息。上一轮属于取得新现场证据的进展；本轮确认同一环境阻塞持续，无已确认存活的后台验收进程可等待。源码和离线候选工作已完成，余下安装、真实键盘、同候选评分及正式晋升依赖安全测试环境，不能靠重跑 Node 或重建补足。原生 Goal 已由工具返回 **blocked**，未标 complete；保留完整原目标和所有未验证项。收到安全环境信息后再恢复，不升级、刷新或清理当前用户队列。

## 独立评分与收尾

前四项由独立只读 code-reviewer 重审，第五项由独立构建／安装审查者读回候选回执。分数是当前证据成熟度估分，不替代原生验收。

| 维度 | 分数 | 证据与扣分 |
| --- | ---: | --- |
| 输入交互与快捷键兼容性 | 86 | 捕获、修饰键、重复及节点替换回归；缺真实网站顺序与长按 |
| FIFO 与重复发送防护 | 89 | 组合覆盖迟到确认及 FIFO，两个 HIGH 已关闭；缺 r16 实际入站 |
| 草稿、IME 和异常状态保护 | 83 | 清空恢复、flight 保留及组合输入回归；缺真实中文 IME、附件、编辑器异常 |
| 源码质量、可维护性及回归测试 | 93 | 共享入口最小修复，组合回归落盘；原生闭环未全，项目有历史产物失败 |
| 构建、安装身份和真实运行一致性 | 60 | 构建／来源 40/40，安装 10/30，运行 10/30；缺两类原生回执各扣 20 |
| **算术平均** | **82.2** | `(86+89+83+93+60)/5`，未达到 95 |

未发现阻止生成候选的剩余源码缺陷。后续顺序：解除实际 UI 占用冲突 → 经原 Authority 核对旧实例清理前置、不可变候选身份和审阅安装 → 安全新对话用真实键盘完成用户矩阵 → 条件通过后再考虑正式包及既有来源记录同步。历史未知队列的不可逆处置不因此获授权。Sidebar Tool 产物不一致单独保留；网络恢复、production 和公开发行缺口未解除。

Git：`main`；构建时基线为 `a1b39dee16e7f96419bc554263dcd0ee7cefaa90`，收尾最后观察 HEAD 为 `b3ce015479165425d12d7751117412bb9bc3aebb`。期间其他任务提交仅涉及 Reading TOC 和 Web Flow 文档，未改变本项目，不触发重建。本轮未提交、未推送；只改本项目 7 文件：main、main-recovery、shortcut-integration、view、crown-selected-defaults、README、本报告。框架、Web Flow、AI Proxy、AI Scroll Navigation 等并行改动保留，未混入提交。未覆盖共享 Browser 输出或终止其他服务。
