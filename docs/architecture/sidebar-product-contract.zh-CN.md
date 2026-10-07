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
→ Save 生成明确 revision
→ Run 冻结这一刻的页面与 revision
→ 在真实点击手势内请求权限
→ 再次验证冻结目标
→ 进入既有 RunHost
→ 任务只操作冻结的 Running Target
→ Sidebar 显示运行状态与持久结果
```

普通用户不需要填写 tabId、frameId、documentId、targetVersion。这些只能作为高级诊断信息。

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
freeze candidate + saved revision
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
- 明确保存的 script revision / contentHash。

权限请求必须直接发生在真实 click gesture 内。权限完成后必须重新观察 Sidebar 所属 window 的 Current Page，并逐项比较冻结身份。如果 tab、document 或 URL 已变化，返回 `E_DOCUMENT_STALE`，要求用户重新点击 Run；不得改为运行新页面。

复验通过后才进入既有 `RunHost`。进入以后不再以 active tab 作为运行目标。

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

- **A 普通运行**：A + Sidebar → Save → Run → 只有 A 被修改。
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
- Save / Run / Result 的关系改变了吗？必须 NO。
