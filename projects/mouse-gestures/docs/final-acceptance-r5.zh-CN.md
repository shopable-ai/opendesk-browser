# 鼠标手势 R5 本地最终验收报告

任务：`OD-MOUSE-GESTURES-R5-LOCAL-CODEX-FINAL-ACCEPTANCE`。日期：2026-11-12（北京时间）。仓库 `shopable-ai/opendesk-browser`，仅在 `main` 工作。开始 HEAD：`298adfde8`；既有开发提交 `503e9019a778a505be2b1c9d1fee1e938d03e60c` 是其祖先，没有回退仓库或重做 R5。

## 1. 结论

**本机可执行的修复、回归和组合包交付完成；正式原生验收未通过。** 两种既定模式在源码与 Node 行为层已落实：默认原生菜单优先保留早发菜单并放弃当前手势；用户主动选择手势优先后，拦截合格右击的提前菜单和释放后的关联菜单。普通右击无动作，Shift 绕过、排除区域和 Option/Alt 左键仍保留。

预览的四方向、已配置/未配置组合及 Alt 左键共 7 条浏览器输入操作，实际反馈符合预期。它没有执行真实导航，也不是正式扩展安装或 OS 原生菜单证明。正式包已准备好，**尚未证明已安装并在真实网页生效**。

macOS 主机存在 Chrome 进程，但受支持的原生 UI 连接 `cua.getState()` 两次分别在 30s / 10s 超时，未获得已安装扩展、窗口、输入或菜单证据；没有猜测目标或用全局剪贴板注入替代。当前没有可调用的 Windows Chrome 环境。两平台均保持 NOT_TESTED，阻塞发布。没有将 ego 的 Chromium UA、`isTrusted`、Node 替身或构建通过当作原生 PASS。

## 2. 本轮缺陷闭环

| 项目 | 复现与根因 | 最小修复及回归 |
| --- | --- | --- |
| 手势优先普通单击的菜单晚发 | `gesture-first suppresses a plain click menu emitted after release` 失败；原代码仅为达到意图阈值的释放建立菜单记录 | 合格的手势优先普通释放也建立有界关联记录；不执行动作，不无条件拦截页面菜单 |
| 拖动期间误吞无关菜单 | `a menu during a held gesture must match its target and current position`、`Shift or an excluded menu cancels even after an eligible right press` 失败；有 session 就拦截，未重查菜单目标/位置/排除条件 | 重查真实状态、排除条件和关联目标/位置；无关菜单放行并取消当前手势 |
| 修饰键中途变化 | `release guards preserve modifier and excluded menus without consuming the match`、`modifier changes during movement or release cancel the gesture` 失败 | 统一修饰键判定用于按下、移动、释放及菜单阶段；保持原触发方式与动作映射 |
| 保存读回竞争 | `persist remains busy through final readback and focus cannot clear later revocation`、关闭面板后的延迟读回用例失败；读回结束前过早释放 busy，旧结果可改状态 | busy 覆盖最终读回；各异步状态写入核对实例及 revision；关闭后不更新新状态 |
| CAS 覆盖并发修改 | 同字段及同组合键冲突用例失败；原代码重读后无条件重放旧修改 | 同字段冲突保留最新值并提示；无冲突字段及不同组合键可合并；仍使用原 ETag/CAS |
| 未知写入提示不实 | 丢失成功回执用例失败；实际已保存并读回新值，却声称“已保留原设置” | 未知写入不自动重放；明确区分写入回执和当前读回，读回失败关闭操作；成功用原 notify 和就近状态反馈 |
| 并发轮询误拒有效手势 | `an overlapping enabled poll does not falsely deny a pending gesture authorization` 失败；共享 version 把读取被超越当作拒绝 | 旧成功读取不再写状态，等待最新授权读取；新 OFF、撤权、失败和销毁仍能阻止动作，新增三项交错回归 |
| 可访问性语义 | 四方向图标全部 aria-hidden；就近保存回执无状态播报语义 | 原图标增加方向名称；原提示区增加礼貌状态语义；不改变视觉和权限 |
| 测试断言过窄 | 原面板测试要求“原生菜单”，实际提示“保留普通右键菜单” | 按保留右键菜单的含义校验，不让有效产品适配过时措辞 |

修复前日志保存在 `artifacts/mouse-gestures/r5-final-acceptance/`：事件 24 通过/5 失败；面板 10 通过/5 失败；runtime 10 通过/1 失败。日志包含测试名、断言和源码栈。最终全套为 **83 通过、0 失败、0 跳过、0 取消**。

新增边界覆盖：四方向 11/12/55/56px，斜向，反向 12/13px，8 种组合第二段 55/56px，未配置/未完成组合不降级执行第一段，重复释放，菜单不同目标/位置/修饰键，16px 和 450ms 的精确边界。原预览外国 pointerId 隔离、Esc、停用，原方向及生命周期测试继续通过。

## 3. 验证与产物身份

从仓库根执行：

```bash
node --test projects/mouse-gestures/tests/*.test.mjs
node --check projects/mouse-gestures/src/page/gesture.js
node --check projects/mouse-gestures/src/page/runtime.js
node --check projects/mouse-gestures/src/page/main.js
node --check projects/mouse-gestures/src/main.js
node --check projects/mouse-gestures/src/page/segments.js
node scripts/build-program-project.mjs projects/mouse-gestures --mode development --out artifacts/mouse-gestures/r5-final-acceptance/page-development-final
node scripts/build-sidebar-tool.mjs projects/mouse-gestures --out artifacts/sidebar-tools/mouse-gestures/candidate.opendesk-tool.json
node scripts/build-sidebar-tool.mjs projects/mouse-gestures --promote-from artifacts/sidebar-tools/mouse-gestures/candidate.opendesk-tool.json
node scripts/build-sidebar-tool.mjs projects/mouse-gestures --check-project
```

- Node 全套 83/83，以上五个 JS 语法检查和项目 diff 空白检查通过。
- Page development 构建成功；原 Sidebar 打包器在独立临时目录调用原 Page production 编译器，组合包构建成功。没有覆盖 `dist/development` 或其他任务的 watcher/Browser 产物，没有新打包体系。
- 原打包器候选→晋升→同源检查完成，状态 `PROJECT_PACKAGE_MATCH`；包/嵌入 Page 格式、哈希、规则与身份通过现有校验器。HTML/CSS/JS 与当前源码相同。
- **这不是 Browser MV3 全量 production 构建证据**；未修改其固定源码，无需为这个动态 Page Module 重建 Browser。真实安装仍须记录宿主 Browser 的实际构建/路径/ID。
- 旧正式包是 0.2.1 / revision 2，最终晋升为 0.3.1 / revision 5。审查期间本任务产生的中间晋升未安装、未提交；按已知 SHA 核验后仅撤回自己的中间包，再从已提交旧包走原晋升链，没有同版本替换已发布包或覆盖并发文件。

唯一正式可导入包：`projects/mouse-gestures/mouse-gestures.opendesk-tool.json`。

| 字段 | 实际值 |
| --- | --- |
| Tool ID / version | `mouse-gestures` / `0.3.1` |
| Page ID / revision | `app.mouse-gestures` / `5` |
| 文件大小 | 54,791 UTF-8 字节 |
| 文件 / 规范包 SHA-256 | `014e6e0593eda7e7c20c8f686833dd08569c639fe853146accd5730132b004ea` |
| Page sourceHash | `23d20743471dfac18fd3f402769989f187260ce72feeef2eb16221e62ee3efb0` |
| Page packageHash | `964f3dc49ecb6d848b081b534f82d87edb4b242e7657287e00df0e18fb57ad7d` |
| 能力 | 原 `page.module`、`storage.local`，没有新增 Chrome 权限 |
| 规则 | HTTP(S)，顶层，document_idle，USER_SCRIPT；没有扩展匹配范围 |
| 安装状态 | `installed:false` / INSTALL_NOT_TESTED |

共享包与安装链验证命令：

```bash
node --test tests/environment/sidebar-tools.test.mjs tests/environment/sidebar-tool-page-module-package.test.mjs tests/environment/sidebar-tool-page-module-install.test.mjs
```

**41/42 通过，1 项失败，不宣称全绿。** 失败为 `R14 Sidebar tool intake requires separate review, install and explicit launch`，`tests/environment/sidebar-tools.test.mjs:205` 要求 `.sidebar-tool-view-head` 高 48px，当前 `src/ui/tool-shell.css:457` 是 53px。它是宿主页头的静态断言，未执行鼠标手势，也没有证据表明是本工具故障。保留原日志并交平台 owner 判定，不更改其他项目/框架来制造 PASS。包安全、Page 哈希、安装身份、清理未知回执和晋升相关检查均通过。

## 4. 浏览器与真实原生矩阵

| 证据层 | 结果与限制 |
| --- | --- |
| Node 模拟事件 | 83/83 PASS；不证明原生菜单 |
| ego 普通网页预览 | TaskSpace 93，UA Chrome/156；7 条操作反馈符合预期；练习区 contextmenu 在目标处理后 defaultPrevented=true；只模拟动作 |
| Headless Chromium | 本轮 NOT_TESTED，未用历史结果补证 |
| 真实 macOS Google Chrome + 已安装候选 | NOT_TESTED；原生 UI 连接超时，未获得准确安装身份和真实操作证据 |
| 真实 Windows Google Chrome + 已安装候选 | NOT_TESTED；无可调用目标环境 |

ego 的七条结果：左→模拟后退、右→模拟前进、上→模拟刷新、下→模拟到底、未配置左下→不执行、映射左下→模拟后退、Alt 左拖→模拟后退。记录及截图在 artifacts 的 `preview-browser.json`、`preview-before.png`、`preview-after.png`。这些是实际页面反馈记录，不是完整原生事件轨迹或外部认证。预览行为验证之后仅增加图标语义标签，未改变事件代码。

| 编号 | 原生场景 | 当前结果 |
| --- | --- | --- |
| C01 | 默认普通右击有原生菜单 | NOT_TESTED |
| C02 | Mac 菜单先发保留菜单并放弃手势 | NOT_TESTED |
| C03 | 手势优先右键拖动 | NOT_TESTED |
| C04 | 手势优先普通单击，无菜单、无动作 | NOT_TESTED |
| C05 | Shift + 右键 | NOT_TESTED |
| C06 | 输入框、链接、可编辑区域 | NOT_TESTED |
| C07 | Option / Alt + 左键 | NOT_TESTED |
| C08 | 四方向释放后执行一次 | NOT_TESTED |
| C09 | 已配置、未配置两段组合 | NOT_TESTED |
| C10 | Esc、失焦、隐藏、撤权、卸载及清理 | NOT_TESTED |
| C11 | 保存、页面刷新、重开正式面板及真实网页生效 | NOT_TESTED |
| C12 | Windows 菜单晚发及关联拦截 | NOT_TESTED |

C01–C11 有相应源码/Node 或预览证据，但原生列不能因此升级。安装、升级、授权/启停、旧数据保留、撤权及卸载的真实闭环仍未完成。ego TaskSpace 已 finish，仅本任务本地预览 HTTP 服务已停止；没有关闭其他浏览器、Profile、服务或任务。

## 5. 六个独立专业视角

这是 Codex 子 agent 的只读审查视角：三个评审会话分别承担六个维度，逐维度评分后汇总，未把其他维度分数输入评分，也不是六位外部真人认证。复核发现的确定缺陷已修复并重新审查；最终未发现本轮范围内未处理的关键/高优先级或其他必修源码缺陷。原生证据缺失仍是发布阻塞。

| 视角 | 最终分 / 100 | 扣分原因 | 必须完成的剩余门禁 |
| --- | ---: | --- | --- |
| 浏览器事件兼容 | 80 | Mac 原生 −12，Windows 原生 −8 | 取得真实菜单时序与输入证据 |
| 前端交互 | 88 | 真实 Chrome 输入/菜单及辅助技术表现 −12 | 正式面板与网页实测；读屏尚未测 |
| 软件架构 | 92 | 已安装候选身份、桥与生命周期闭环 −8 | 同候选实例验证 |
| 安全 | 88 | 安装/Sender/Document 绑定 −5，撤权/卸载 −5，原生输入 −2 | 原生 fail-closed 和清理证据 |
| 测试 | 84 | 原生矩阵 −12，安装闭环 −3，预览记录轨迹不完整 −1 | 原生矩阵及可追溯记录 |
| 交付 | 80 | Mac 安装/升级/运行 −12，Windows −8 | 同包安装、升级、平台实测 |

**算术平均 = (80 + 88 + 92 + 88 + 84 + 80) / 6 = 85.33 / 100。** 各项和平均分均未达到本任务 95 门槛；没有为了凑分把未测视为 PASS。扣分主要是证据缺口，不是已确认的剩余源码漏洞。

## 6. 差量与交付边界

生产源码修改仅在原业务 owner：`src/page/gesture.js`、`src/page/runtime.js`、`src/main.js`、`src/index.html`；预览只补图标语义。回归修改在原 `gesture/panel/runtime/segments.test.mjs`。正式包由原打包器生成，README 顶部更新本轮状态，本报告随源码提交。

没有修改 Browser Framework、WebFlow、AI Proxy、依赖、Manifest、权限或业务身份；未创建分支、worktree 或 PR，未推送。开始已有的其他任务改动及执行中新增的并发改动均保留，不纳入本提交。最终提交 SHA 由交付回复提供，可用本报告所属 Git 提交核查。

## 7. 只针对剩余阻塞的续接范围

下一条用户操作是：在能取得受支持原生 UI/鼠标证据的 Mac Chrome 及 Windows Chrome，通过现有「扩展」审阅链安装/升级这个精确候选，核实宿主路径、真实 ID、版本/包 SHA、Page revision、普通 HTTP(S) 站点授权，再执行 C01–C12 及安装生命周期。不能用新 Profile 中的普通网页脚本或预览替代正式安装。

不重新需求设计、不重写手势、不重复已完成预览/Node/构建；只有源码、候选输入变化或新缺陷才补对应回归/重新打包。实际缺陷才进入复现→最小修复→回归→同源核验。不要改无关 48/53px 宿主断言，除非它被证明直接阻塞本轮实际操作并取得平台 owner 范围。

验收完成仍须：同一候选的两平台原生证据齐全、设置真实生效、生命周期 fail-closed、无未处理关键/高优先级缺陷、六维及平均 ≥95、main 最终差量与包身份可追溯。平台继续不可用时保持 NOT_TESTED 和未通过，不借重复运行 Node 维持工作，也不再次开发已完成功能。

## 8. 2026-11-12 原生续验入口复查

本次复查时间为北京时间 19:37，开始及编辑前 HEAD 均为 `b3689d43042e30c48800b6abe4f3a8040c180d5a`，工作分支 `main`。用户指定的源码基线 `d147707c8d4aa8636979eddc5e39bb837be6b359` 是当前 HEAD 的祖先；复查时整个 `projects/mouse-gestures/` 与该基线无差量。并行未提交内容位于 AI Proxy、构建来源脚本及根测试，本次保留，不纳入鼠标手势证据提交。

### 候选与宿主身份

- 正式 JSON 实读为 54,791 字节，`mouse-gestures` / `0.3.1`，Page `app.mouse-gestures` / revision `5`；文件与指定基线中的正式 JSON 逐字节一致。SHA-256 仍为 `014e6e0593eda7e7c20c8f686833dd08569c639fe853146accd5730132b004ea`。
- 嵌入 Page 的实算源码 SHA-256 与声明 `sourceHash` 一致：`23d20743471dfac18fd3f402769989f187260ce72feeef2eb16221e62ee3efb0`；`packageHash` 声明仍为 `964f3dc49ecb6d848b081b534f82d87edb4b242e7657287e00df0e18fb57ad7d`。HTTP(S)、顶层、document_idle、USER_SCRIPT 及原两项能力未变。本次未重编译或重新执行包门禁，复用第 3 节未变候选的既有证据。
- 存在真实 Google Chrome 主进程 PID `44951`，可执行文件为 `/Users/shopme/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`。其子进程路径指示 Chrome `157.0.8103.38`；该路径信息不是实际输入或安装证明。
- Chrome 的 Default、Profile 1、Profile 3 的 `Secure Preferences` 均记录扩展 ID `ccfcjegpkdlgbclopjmadlcjedelidmf`，加载路径为 `/Users/shopme/Documents/workspace/opendesk-browser/dist/development`。这里只提取匹配 OpenDesk 的记录，未导出个人设置或凭据。磁盘记录缺少可用于确认当前运行的 state，**不据此认定扩展已启用、当前选中 Profile、组合包已安装或站点已授权**。
- `com.shopable.opendesk_browser.agent.json` 的 `allowed_origins` 为 `chrome-extension://ccfcjegpkdlgbclopjmadlcjedelidmf/`，与上述 ID 一致。当前 Native launcher 指向已安装的 `build-mcp-files-20261110/OpenDesk.app/Contents/MacOS/opendesk`；对该准确二进制执行只读 `browser doctor --json`，exit `1`，返回 `E_SCHEMA`，未证明实时 Native 配对成功，也未改动配对。
- 本次仅核查已有 development 磁盘产物：`development-update.json` 待应用 revision 为 `e3fd4b6bccf7fe3e57fc063e284103b0763d0b0abebc45288795150461ecb2b8`。未获得 Side Panel 的 serve 连接、已应用 revision 或 production 验收宿主证据，不能将该记录宣称为当前运行指纹；未启动、覆盖或切换构建环境。

### 阻塞实测与操作边界

| 入口 | 本次实测 | 影响 |
| --- | --- | --- |
| CUA 原生 inventory | `cua.getState()` 20 秒超时，kernel reset | 无法取得准确窗口、标签页或原生菜单观察；未继续猜测目标 |
| OpenDesk Desktop Mac96 | `tm_status` 返回 `McpServerError: MCP SSE probe returned 429 from openai.org`，`UNAVAILABLE` | 未恢复受支持桌面连接；429 是工具入口故障，不是鼠标手势产品缺陷 |
| 原生 UI 协调 | `profiles.py status` 显示 owner `01a1cf3f-38b0-7dd3-b744-361b545ef27d`；本任务 `ui-acquire` exit `1`，`native UI busy; do independent work, retry after owner releases` | 安装审阅、原生菜单和全局鼠标输入未执行；未抢占、清理或释放其他 owner 的锁 |
| Windows Chrome | 当前可调用工具及本任务既有资源中没有 Windows 目标 | 未安装同包、未观察晚发菜单；保持 NOT_TESTED |

本次读取了当前 ego-browser 指南，但没有创建新的普通网页预览或把 ego 当作 Google Chrome 原生扩展验收环境。没有打开 `chrome://extensions`、注入诊断代码、使用剪贴板/全局按键、改动现有安装和权限、接管其他测试浏览器或停止任何服务。

**续验结论：安装/升级及 C01–C12 原生结果仍全部 NOT_TESTED，正式验收未通过。** 没有新的产品缺陷证据，不修改源码、版本、正式 JSON 或无关 48/53px 断言；不重复 Node、语法、预览和构建。六维分数与平均 `85.33` 保留第 5 节的上次评审值，本次未重新评分或抬高分数。此轮只提交本报告的入口复查差量，不推送。

下一条操作仍是：取得受支持的原生连接及不与其他 owner 冲突的 UI 操作区间后，经现有「扩展」审阅链安装/升级上述精确包，读取实际宿主/安装/授权身份，再执行两平台原生矩阵。实时连接、UI 锁及 Windows 目标在恢复时重新检查，不能将本节的瞬时状态当作永久环境结论。

## 9. 2026-11-12 真实 Chrome 安装恢复与核心检查

本轮按当前阶段先恢复核心操作；两平台完整矩阵和重新评分继续延期。以下是北京时间约 22:29 的实际运行证据，更新第 8 节的瞬时安装状态，不提升为正式验收通过。当前分支 `main`，写报告前 HEAD 为 `54f0e7e9fa62c062c1c4e7f9a4c0db2b03b349ac`。

### 实际候选与环境

- 使用已有 macOS Google Chrome `/Users/shopme/Applications/Google Chrome.app`、现有“您的 Chrome”Profile。扩展详情实读 ID `ccfcjegpkdlgbclopjmadlcjedelidmf`、加载目录 `dist/development`、启用状态、所有网站访问和用户脚本开关；没有更换 Profile、安装路径、ID 或权限。
- 当前为持续开发环境。Side Panel「调试 → 本地开发服务」实际显示已连接，构建指纹 `e3fd4b6bccf7fe3e57fc063e284103b0763d0b0abebc45288795150461ecb2b8`；不是 production 验收包。
- 恢复对象是既有正式包 `mouse-gestures` / `0.3.1`、Page `app.mouse-gestures` / revision `5`。文件 SHA-256 再次实算为 `014e6e0593eda7e7c20c8f686833dd08569c639fe853146accd5730132b004ea`，没有改包或版本。
- README 已记录后续 UI 精简源码尚未进入该包。本轮证据仅对应上述固定包，不证明后续 UI 源码已经安装，也不重新宣称当前全部源码与该包同源。

### 安装与执行恢复

1. 父 Sidebar Tool 已是 `0.3.1`，但真实 Page 安装记录仍是 revision `2`、`disabled`，授权也停用，且旧受管 UI 清理为 unknown。父工具开关状态不能证明 Page 已运行。
2. 经现有「扩展 → 导入 → 核对并恢复网页模块」审阅精确同包。首次恢复因旧模块清理未确认而拒绝，没有重复使用旧批准。只读核对原文档，确认四个仍存活的旧文档没有生成或队列操作后正常刷新；其中“Webflow调用Codex Demo”的草稿“等待测试执行。”刷新后仍在。没有发送 ChatGPT 消息。
3. 重新走原审阅链后，Page 恢复为 revision `5`、`enabled:true`、`nativeState:registered`、授权 `active`，旧清理 `retired`。原生注册规则仍为 HTTP(S)、顶层、document_idle、USER_SCRIPT。
4. 独立测试页最初仍无手势；随后出现本候选 `E_OWNER` 失败回执。只读执行槽显示另一 Page `app.reading-toc` revision `10` 的 outcome-unknown 记录占用原文档 `2385ECD5696A148D37E136365C5D79A9`。Chrome 按该 UUID 的 `webNavigation.getFrame` 返回 `null`；同一标签已有另一活动文档。该 ChatGPT 标签正在生成回复，因此没有关闭或刷新它。
5. 恢复前确认 `currentRunId:null`、Page `prepared:0` / `dispatched:0`、Native ledger 仅有 `ACKNOWLEDGED:50`。通过 Chrome 自带后台管理页，仅对上述精确扩展 scope 正常 Stop Service Worker；它随即自动启动，执行既有启动恢复逻辑。没有删除注册、直接写数据库、放宽授权或重放未知操作；没有重载整个扩展、关闭浏览器或停止 watcher。
6. 正常刷新本任务的 `http://127.0.0.1:43111/demo-form.html` 后，执行槽实读仅有 `currentRunId:null`，已无 preview 占用。Page 最后执行为 `completed` / `page-installed-evaluated`，`error:null`，tab `560070907`，document `E7EEE529DEA00658B93299B42365805B`；执行和安装的 sourceHash 均为 `23d20743471dfac18fd3f402769989f187260ce72feeef2eb16221e62ee3efb0`。

### 已观察的核心行为与限制

点击和菜单由 Agent 使用真实 macOS Chrome 原生接口观察；物理右键向下拖动由用户在留下的同一 Browser Test Lab 测试页操作并反馈。设置原已为 `gesture-first`，本轮没有改偏好。用户回执与 Agent 直接观察分别记录。

| 操作 | 实际结果 |
| --- | --- |
| 手势优先，空白区域普通右击 | 原生菜单不再弹出，页面没有因单击导航或滚动 |
| 同一空白区域 Shift + 右击 | 显示 Chrome 原生菜单；随后取消菜单，未执行菜单项 |
| “当前网页标题”输入框右击 | 显示含剪切、复制、粘贴、全选的原生编辑菜单；未修改字段或剪贴板 |
| 右键向下拖动、轨迹与释放后滚到底部 | USER_REPORTED_PASS：用户针对“在页面中间空白处按住右键向下拖约 150px 后松开”的检查，明确反馈“出现轨迹，松开后滚到页面底部”。当前 CUA 原生接口 `drag` 仅支持左键，本项不是 Agent 自动拖动或直接观察证据 |
| Windows、完整生命周期及两平台矩阵 | 本阶段延期 / NOT_TESTED |

结论：固定候选的真实 Chrome 安装与 Page 执行已恢复，普通右击仲裁及两项菜单保护有实际证据；用户确认右键向下拖动显示轨迹，释放后滚到页面底部，当前核心恢复目标完成。这仅覆盖上述向下手势，不推定其他方向、组合、Windows 或完整生命周期已经通过；正式验收仍未完成，原六维评分没有重新评定。本轮未改业务源码或 Browser Framework，未重复 Node/构建/打包，未推送；其他 owner 的 UI、安装器、AI Proxy 和根测试改动均保留。自建后台诊断标签与 DevTools 已关闭，测试页保留，原生 UI 锁已释放。
