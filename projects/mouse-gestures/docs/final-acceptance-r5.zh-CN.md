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
