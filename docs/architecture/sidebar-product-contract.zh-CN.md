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

## Sidebar 三视图与本机发现（2026-10-08 用户纠偏）

**侧栏三个页签：我的任务 / 发现 / 开发。** 这是一个产品视图划分，不是三个 Host 或三套运行引擎。

- **我的任务**：展示已安装任务卡片、所选任务的参数与运行控制；“最近运行”固定在任务卡片及详情的下方，不是独立页签。运行与停止继续绑定同一个 RunHost、Controller 和 durable Result。
- **发现（Sidebar）**：只查阅、搜索、筛选本机**已安装**任务。默认依据 Sidebar 所属窗口当前 HTTP(S) 网页的准确 origin 找出可能适用且已启用的任务，允许切换“全部已安装 / 已停用”。**origin 匹配只是 UI 初筛，不等于正式网站、权限或页面结构验收。** 点击某项仅将选择带回“我的任务”；不得自动运行、自动授权、自动安装或重放操作。
- **开发**：编辑并直接运行未保存 JavaScript 草稿，按需保存程序版本；切换页签不得销毁草稿或正在运行的 Host。
- **完整任务目录（独立扩展标签页）**：导入任务包、查看候选、核对可信验证、Available、安装/升级等在此办理；由 Sidebar 顶部“任务目录 ↗”打开。完整目录不得冒充 Sidebar“发现”，也不应把目录搜索、审批等大型页面挤进窄 Side Panel。
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
- Run 只运行一个明确保存过的 revision。
- 编辑区存在未保存修改时，UI 必须明确显示“本次 Run”使用哪个已保存 revision。
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
5. Run 只执行明确保存的 revision。
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

当前任务与历史查询分开投影；运行完成和停止始终以获准的 runId 收尾，不使用可编辑查询框、当前脚本 ID 或新 revision 关联结果。Result 展示其自身 revision/sourceHash，保留 falsy/undefined 与错误类型。过期的 snapshot 回包或错误不得覆盖更新的持久观察。重开仅读取历史；未保存或加载版本不能运行。

执行环境保持现状：Controller async-body 在隔离 Worker 中执行，支持 deadline/Stop/retirement；`page.evaluate(fn)` 由已授权的 userScripts adapter 在 USER_SCRIPT world 中操作准确文档的 DOM；已有 MAIN 路径用于页面全局环境交互。Sidebar 没有 raw executeScript 旁路，也不构成用户脚本匹配/管理产品。

Web/component PASS 与 Native PASS 分开。组件 pagehide/abort/retirement 测试不能替代真实关面板，静态渲染不能替代真实权限点击、DOM 效果或安装。下一阶段入口：`docs/framework/prompts/goal-sidebar-native-acceptance.txt`。
