# OpenDesk Browser Sidebar 产品与架构合同

本文件是 Sidebar 实现的产品与架构合同。判断实现是否正确时，先看本文件，再看具体代码和测试。

## 产品目标

普通用户在浏览网页时打开 OpenDesk Sidebar，可以编辑、保存并运行 JavaScript 自动化程序。默认目标是 Sidebar 所属浏览器窗口当前正在查看的 HTTP(S) 主文档。程序继续复用既有 Controller / Page / Sandbox / Worker / Authority / Result 框架。

标准流程：

```text
打开网页 A
→ 打开 Sidebar
→ Sidebar 显示 Current Page = A
→ 编辑或加载 JavaScript
→ 可选 Save 生成明确 revision；未保存草稿可直接运行
→ Run 冻结这一刻的页面、编辑器源码与参数
→ 在真实点击手势内请求权限
→ 再次验证冻结目标
→ 进入既有 RunHost
→ 任务只操作冻结的 Running Target
→ Sidebar 显示运行状态与持久结果
```

普通用户不需要填写 tabId、frameId、documentId、targetVersion。这些只能作为高级诊断信息。

## Sidebar 四视图与自定义小程序（2026-10-10）

**侧栏四个页签：我的 / 发现 / 开发 / 工具。** 这是四种 UI 视图，不增加 Host、执行器或授权系统。

- **我的**：仅显示已安装自动化任务及其参数、运行、停止、动态结果和历史。RunHost 所有者不因页签切换而改变。
- **工具**：保留最多 12 个 `.opendesk-tool.json` 工具的安装能力，但移除二级工具选项卡。进入“工具”始终显示安装列表，不自动创建 iframe；文件选择、预览、安装或更新都不执行工具代码。只有用户点击某项“打开”才装载当前 Side Panel 内的隔离小程序；点击“返回”回到列表；已安装列表允许直接卸载并确认，无需先运行工具。切出“工具”页立即销毁 iframe 和当前实例令牌，重新进入仍显示列表，不在后台自动恢复。更新必须对比当前/新版本、能力增减及数据保留；版本回退、权限新增和同版内容变化在确认更新前明确告知并二次确认。外部更新或卸载会撤销旧实例与排队操作。权限继续使用现有 Sandbox、Storage 与能力白名单，Task v1 完全独立。
- **发现（Sidebar）**：只查阅、搜索、筛选本机**已安装**任务。默认依据 Sidebar 所属窗口当前 HTTP(S) 网页的准确 origin 找出可能适用且已启用的任务，允许切换“全部已安装 / 已停用”。**origin 匹配只是 UI 初筛，不等于正式网站、权限或页面结构验收。** 点击某项仅将选择带回“我的”；不得自动运行、自动授权、自动安装或重放操作。
- **开发**：编辑并直接运行未保存 JavaScript 草稿，按需保存程序版本；切换页签不得销毁草稿或正在运行的 Host。
- **完整任务目录（独立扩展标签页）**：导入任务包、查看候选、核对可信验证、Available、安装/升级等在此办理；由“我的”或“发现”中的添加/导入入口打开。完整目录不得冒充 Sidebar“发现”，也不应把目录搜索、审批等大型页面挤进窄 Side Panel。
- **可信边界**：Sidebar 发现数据仅来自现有授权的本地 Task Catalog/Installed 记录；无云市场、无评分/下载量虚构信息、无第二套安装和执行授权。

此前将“发现”页签直接重定向到完整目录、或将“运行记录”另立页签的实现已被用户否定；后续 UI 修改必须维持上述边界。视觉原型和 Node 组件测试不得冒充真实 Chrome 原生验收。

## 四个必须分开的对象

1. **Sidebar Host**：一个 Side Panel 文档实例，绑定一个明确 browser window。
2. **Current Page**：该 window 当前 active 的 HTTP(S) main document，只是下一次 Run 的候选目标。
3. **Running Target**：Run admission 后冻结的 exact document。运行中切换 tab/window 不得改变它。
4. **SDK Target**：明确安装 OpenDeskSDK 的 document。SDK authorization 与 Controller Current Page 独立。

## 调用链与所有权

```text
Sidebar UI
├─ Program Revision: source / revision / contentHash
└─ CurrentPageTarget: window / tab / main document
          ↓ Run click
freeze candidate + current draft source / explicit installed revision
          ↓ trusted permission request
revalidate exact candidate
          ↓
EXISTING RunHost
          ↓
EXISTING Controller Authority
          ↓
EXISTING Sandbox / Worker
          ↓
EXISTING PageProxy / ChromePage / Native Driver
          ↓
Web Page
          ↓
Durable Result
```

Sidebar 只拥有 UI 与 CurrentPageTarget。不得新增第二套 JavaScript executor、Controller、run manager、permission database、result store 或 Page SDK authority。

## Current Page 合同

- 使用 Side Panel 文档所在的 browser window，不使用 last-focused window。
- window 的 active tab 改变时，空闲 Current Page 跟随改变。
- 只接受 HTTP(S)、non-incognito、main frame、active document。
- unsupported / loading / unresolved 页面必须显示 unavailable。
- 不得在不可运行时回退到历史有效页面。
- 不得通过 URL 查找另一个“相同网页”。
- 同 URL 的两个 tab 仍然是两个不同目标。

实现锚点：`src/ui/current-page-target.js`。

## Run admission 合同

点击 Run 时同时冻结：

- Current Page 的 windowId / tabId / frameId / documentId / URL / origin。
- 开发草稿的准确源码与后台计算的 sourceHash；已安装任务的明确 revision / contentHash。

保存与运行彼此独立，运行中编辑或保存 C 不改变启动时草稿 B 的结果身份。早期提示词中的“先保存才能运行”仅适用于旧版入口，已被 R4 草稿准入合同替代；历史文件与原始回执保留。

权限请求必须直接发生在真实 click gesture 内。权限完成后必须重新观察 Sidebar 所属 window 的 Current Page，并逐项比较冻结身份。如果 tab、document 或 URL 已变化，返回 `E_DOCUMENT_STALE`，要求用户重新点击 Run；不得改为运行新页面。

复验通过后才进入既有 `RunHost`。进入以后不再以 active tab 作为运行目标。

当前网页的借用目标还携带可选的 `expectedUrl`，由既有 Controller target observer 在准入观察和 revision pin 后的复验中确认。准备期间 pending navigation 或同文档 URL 变化均拒绝；旧手动目标未提供此字段时保持原合同。此字段不增加权限，也不建立新的 target authority。运行阶段仍由既有 exact document / origin / epoch fence 约束。

实现锚点：`src/ui/script-editor.js` 的 Run handler 与 `src/run-host.js`。

## Revision / Run / Result 合同

Program Revision、Run、Result 是三个独立对象：

- 编辑源码不会运行。
- Save 只生成新 revision，不运行。
- 开发页的 Run 执行点击时冻结的当前草稿源码（无须事先 Save）；已安装任务运行选定的已保存版本。
- 编辑区存在未保存修改时，Run 不自动 Save、不覆盖已保存版本；以源代码快照及 sourceHash 绑定结果。
- `Run r1 → Save r2` 时，正在运行的任务继续使用 r1。
- durable result 继续由既有 Controller/storage 体系负责。

## Navigation 合同

- 同 document SPA：documentId 不变但 URL 变化。空闲 Current Page 更新；Run capture 后、进入 RunHost 前发生变化则本次 Run stale。
- reload/full navigation：documentId 改变，旧 candidate 立即失效。
- 自动化主动 `page.goto` / reload：继续走既有 Controller navigation handoff，Sidebar 不实现第二套 navigation authority。

## Sidebar close

当前产品合同：Sidebar 是 Controller host UI。关闭 Side Panel 后由既有 host lifecycle 执行 stop/abort、durable terminal state、retirement 与 resource release。当前版本不把关闭 Side Panel 解释为后台运行。

## SDK 独立性

Controller 默认 Current Page 不代表自动安装 OpenDeskSDK。SDK 仍要求明确 document、capabilities 与 install/grant；两套 identity/authority 保持独立。

## 实现文件地图

| 能力 | 主要文件 |
| --- | --- |
| Side Panel manifest / action entry | `manifest.json`, `src/environment.js`, `src/sw.js` |
| Current Page candidate owner | `src/ui/current-page-target.js` |
| Save / dirty revision / Run admission UI | `src/ui/script-editor.js`, `src/ui/tool.html` |
| Sidebar host composition | `src/ui/tool-shell.js` |
| Existing RunHost | `src/run-host.js` |
| Existing Controller authority | `src/platform/host/controller-methods.js` |
| Existing exact target verification | `src/platform/target/index.js` |
| Existing sandbox / worker executor | `src/scripting/sandbox/*` |
| Current Page focused tests | `tests/environment/current-page-target.test.mjs` |
| Controller/revision/host-close regressions | `tests/framework/k3-controller-authority.test.mjs`, `tests/framework/run-host-recovery.test.mjs` |

## 十条人工验收合同

1. Sidebar 默认识别所属窗口当前网页。
2. 打开 Sidebar 不运行用户代码。
3. 编辑代码不操作网页。
4. 保存代码不操作网页。
5. 开发草稿可直接明确点击 Run，无须先保存；运行目标、源码与参数必须冻结。
6. Run 后切 tab 不改变已经运行任务的 target。
7. Run 准备期间目标变化必须失败，不得自动换页运行。
8. Sidebar 不新增第二套 JavaScript executor。
9. Controller Current Page 与 Page SDK authorization 保持独立。
10. 关闭 Sidebar 遵循明确 host-close 生命周期。

## 六个关键测试故事

- **A 普通运行**：A + Sidebar → 未保存草稿（也可先保存）→ Run → 只有 A 被修改。
- **B 同 URL 干扰页**：A/B URL 相同，A active → Run → 只能操作 A。
- **C 运行中切页**：Run A → 切 B → Current Page = B，同时 Running Target = A。
- **D 准备阶段切页**：A 点击 Run → 权限/准备期间切 B → 本次 Run 以 `E_DOCUMENT_STALE` 失败。
- **E 两个窗口**：Window 1 Sidebar 只跟 Window 1；Window 2 Sidebar 只跟 Window 2。
- **F Revision**：Run r1 → Save r2 → 当前任务仍完整执行 r1。

## 架构漂移检查

每次相关修改结束都必须回答：

- 新增了几个 state owner？预期 Sidebar 侧只新增 CurrentPageTarget 一类 candidate owner。
- 新增第二套用户 JavaScript executor 吗？必须 NO。
- 新增第二套 target authority 吗？必须 NO。
- 运行期间使用 dynamic active-tab target 吗？必须 NO。
- Controller 与 SDK authorization 合并了吗？必须 NO。
- 草稿 Run、保存版本与历史 Result 彼此独立的 R4 关系改变了吗？必须 NO。

## Sidebar Web Implementation（2026-10-08）

主界面按当前网页、脚本、当前任务、结果展示。页面标题和 URL 分开显示；高级目标、手动文档、独立 SDK、健康检查与采集模块的现状入口保留在折叠区。320/360/480px 静态布局证据只证明布局，不证明 Chrome Side Panel 可用。

Run 的 revision、参数和目标在 click 内冻结，权限请求在第一个 await 前发起。保存/加载/删除串行执行；迟到的保存不会切换另一脚本，加载期间新增编辑不会被回包覆盖。准备期间关闭 Host 不再启动 Run。

当前任务与历史查询分开投影；运行完成和停止始终以获准的 runId 收尾，不使用可编辑查询框、当前脚本 ID 或新 revision 关联结果。Result 展示其自身 revision/sourceHash，保留 falsy/undefined 与错误类型。过期的 snapshot 回包或错误不得覆盖更新的持久观察。重开恢复草稿及历史，但不会自动运行；当前草稿仍需用户明确点击 Run，且无须预先保存版本。

执行环境保持现状：Controller async-body 在隔离 Worker 中执行，支持 deadline/Stop/retirement；`page.evaluate(fn)` 由已授权的 userScripts adapter 在 USER_SCRIPT world 中操作准确文档的 DOM；已有 MAIN 路径用于页面全局环境交互。Sidebar 没有 raw executeScript 旁路，也不构成用户脚本匹配/管理产品。

Web/component PASS 与 Native PASS 分开。组件 pagehide/abort/retirement 测试不能替代真实关面板，静态渲染不能替代真实权限点击、DOM 效果或安装。下一阶段入口：`docs/framework/prompts/goal-sidebar-native-acceptance.txt`。

## 开发页源码切换与当前网页信息最小化（2026-10-09）

这一界面只解决两个问题：**代码从哪里来**、**即将在哪个网页运行**。不增加第二个代码编辑器、单独连接向导或运行引擎。

- 默认是「手工草稿」，编辑器立即可见。**只有一个 Switch** 切换到「本地项目」；不开启本地模式时，项目选择、连接诊断、刷新按钮不占用界面空间。
- 本地模式仅显示一个已授权项目选择器、必要时的「刷新」按钮和简短连接反馈。有且只有一个已授权项目且没有历史选择时可自动选中，**但绝不自动读取运行源码、申请权限或执行**。存在历史项目而该项目消失时不得悄悄切到其他项目。
- 手工源码和参数切换前后都保留；本地运行逐次解析当前已授权项目源码，并验证来源、哈希和连接身份。连接断开、刷新进行中、项目切换或授权身份变化时不得准入旧源码。未知或失败的执行效果继续走 RunHost 原有的保守停止/恢复语义。
- 连接错误优先显示中文可行动说明（启动本地服务、刷新、检查授权），技术错误码保留在诊断 title，不作为普通界面的默认文案。无已授权项目时明确提示，不宣称已可运行。
- 当前网页只占一行：**当前网页 / 来源主机名 / 可运行状态**。主机名可截断，状态不可截断；点击该行再查看页面标题、精确 URL。这里的「可运行」只表示识别了 HTTP(S) 运行候选，**不等于已经通过后续的网站权限、文档重验或执行验收**。
- 开关必须可键盘操作且焦点可见；较窄 Sidebar 上仍保持 40px 以上的开关标签点击区域。不可运行页面的原因在展开内容中展示。
- 真实产品实现：`src/ui/tool.html`、`src/ui/tool-shell.css`、`src/ui/local-project.js`、`src/ui/script-editor.js`；定向合同与回归：`tests/environment/sidebar-product-contract.test.mjs`、`tests/environment/script-editor.test.mjs`。Node / CI 通过不自动等于真实 Mac Chrome Side Panel 视觉及 Native 验收。


## R14.1 工具存储一致性和焦点闭环（2026-10-10）

- **初次载入竞态**：工具列表启动时异步读取存储；如期间已收到同一目录的 `storage.onChanged`，旧读取结果不得覆盖较新的列表。这里仅采用单一加载序号，不新增另一套目录状态 owner。
- **卸载残留隔离**：卸载会清除工具私有存储；若存储部分失败或页面意外退出导致孤儿 namespace，之后同 ID 的**全新安装**必须先清除残留数据，不能继承上一次安装的数据。对**已安装工具的更新**仍保留其数据。跨窗口写入仍沿用相同 Web Locks 保护。
- **键盘焦点**：列表更新优先恢复对应工具的“打开/卸载”控件焦点；返回列表时聚焦原工具；成功导入后聚焦安装项；卸载后聚焦相邻工具，列表为空时聚焦“导入”。任何焦点行为都不自动执行工具。
- **验收等级**：`tests/environment/sidebar-tools-host.test.mjs` 提供 Node 组件回归，不等于原生 Side Panel 验收；320/360/480px、真实 Chrome 的界面和沙箱生命周期仍按准确候选单独记录，未执行不得写 PASS。
