# Mouse Gestures · 双阈值、原生右键兼容与安装后默认开启（0.2.1）

> 当前为已提交到 main 的 SOURCE_WIRED 候选。真实 Chrome 原生鼠标菜单时序、安装/升级、网站权限、撤权与同一包身份尚未验收：NATIVE_CHROME_NOT_TESTED / INSTALL_NOT_TESTED。不能将页面模拟或隔离逻辑测试记成正式发布 PASS。

## 当前产品行为

- **安装后默认开启**：用户审阅并完成 Chrome 网站权限后，首次无 preferences 记录时 enabled=true，Side Panel 滑块同步显示开启，不增加第二次“启用”步骤。用户明确保存 enabled:false 则一直保持关闭；读取失败、值损坏、权限失败及撤权一律 fail-closed，不将“默认开启”当作授权。
- 默认触发方式为 **右键拖动**；四方向手势：← 后退、→ 前进、↑ 刷新、↓ 到文档底部。只处理顶层已授权普通 HTTP(S) 网页，不扩容标签、Native 或后台权限。
- **双阈值**：0–11px 视为普通单击/抖动；从 12px 起作为拖动意图，可显示灰色虚线；净位移达到 56px 且正交最大偏移不超过 28px 才识别方向。明显斜线和折返超过 12px 不执行。Esc、失焦、页面隐藏、停用及销毁取消。
- **原生菜单保护**：contextmenu 如果在移动前到达（常见于 Mac），保留原生菜单并放弃该次手势，不假设网页脚本能事后关闭菜单。移动达到意图阈值而菜单尚未出现时，拦截后续与该次右键会话关联的菜单事件；释放后拦截需匹配按键、元素、位置（16px 内）和最多 450ms 的窗口，不拦截键盘菜单及其他目标。
- **替代方式**：在 Side Panel 的折叠「操作偏好」中，可将触发方式改为 Option/Alt + 左键拖动，作为 Mac 原生菜单提前触发时的保守替代。该方式不能保证所有网页不劫持组合键；仍需真实验收。也可关闭「显示轨迹与动作提示」，不影响方向识别。
- 轨迹绘制复用受管 Page UI Shadow DOM 的 SVG，pointer-events:none，仅在意图阈值后显示。灰色候选轨迹、蓝色已识别动作及橙色无效反馈均不拦截网页点击；松开、取消或撤权清空路径与监听器。requestAnimationFrame 可用时合并绘图，点数上限 80。
- 偏好沿用父工具私有 storage.local 与 ETag/CAS，跨 Side Panel 和 Page 使用既有 OpenDeskAppPage / Page Authority；不增加权限、第二套安装器或直接改 Browser Host。Page 在执行前重新读设置与身份；1200ms 同步不是跨标签实时广播。
- preview/index.html 是独立单文件、无权限的 Side Panel 模拟和左键拖动练习区。练习不会导航、读写真实设置或证明原生右键菜单可用。

## 定向验证及待办

    node --test projects/mouse-gestures/tests/*.test.mjs
    node --check projects/mouse-gestures/src/page/gesture.js
    node --check projects/mouse-gestures/src/page/runtime.js
    node --check projects/mouse-gestures/src/page/main.js
    node --check projects/mouse-gestures/src/main.js
    node scripts/build-sidebar-tool.mjs --help

已执行：当前 GitHub main 源码在隔离 V8 中通过 18 项直接行为/语法检查；三份仓库原有及新增测试源码经 Node API 适配后在隔离 V8 执行 **29/29 PASS**；本地对同一状态机设计的 10 项 Node 针对性用例 PASS。**这些不等于仓库 Node 全套测试、打包、正式 Chrome 扩展安装或生产验收已通过。** 后续须按上述命令在仓库工作区执行回归，打包同一个候选 0.2.1，然后在真实 macOS/Windows Chrome 验证普通右键、双阈值、四方向、Mac menu-first、Windows menu-after、Alt-left、滑块首次默认 ON、显式 OFF 持久化、刷新、撤权、卸载、升级及轨迹清理。若系统先打开原生菜单，默认策略是放弃当前手势，不牺牲普通右键。

pageRules 仍为 http://*/* 与 https://*/*，不代表已自动获得网站访问。Chrome 内部页、浏览器 PDF、不获准的 iframe 不支持。

---

## 历史试点记录（0.1.0）


> 2026-11-11：SOURCE_CREATED / Node 9/9 PASS / standalone headless DOM smoke PASS；正式 OpenDesk 安装、用户 Chrome/权限撤销、production `NOT_TESTED`；组合包 `NOT_BUILT`，不可冒称已正式交付。

## 目标与范围

长期产品参考 CrxMouse / Gesturefy / Grand Gesture，覆盖右键轨迹、导航、标签页操作、自定义映射、网站例外、超级拖拽、滚轮/摇杆手势及 PC/Side Panel 管理。本轮**只验证普通网页右键向左移动至少 56px，松开后 `window.history.back()`**，没有完整设置 UI。

试点仅匹配 `https://example.com/*` 顶层文档、`document_idle`、`USER_SCRIPT`，需经原安装器授权、Chrome 网站访问和用户脚本许可；没有后退历史时不会导航。以后扩大网页范围必须单独审阅权限差异。Chrome 内部页/PDF/子框架不是本轮支持范围。

## 架构复用

`Sidebar Tool v2 + pageModule` 组合式应用，唯一项目 `projects/mouse-gestures/`；Sidebar 沙箱源码为 `src/index.html` / `src/style.css` / `src/main.js`，仅提供说明；Page 模块由 `package.json` 声明的 `app.mouse-gestures` 执行 `src/page/main.js` → `gesture.js`。复用现有 `@opendesk/ui` 的 `createPageUI` / `ui.on` / `ui.onDispose`，不改通用 Host/SDK/Installer，不申请浏览器标签页权限。已安装 Page 的停用、撤权、卸载、升级清理由现有 Authority 请求受管 UI 销毁，未知清理必须保留原安全栅栏，不能自动重试或冒充成功。参照 [`reading-toc`](../reading-toc/README.md) 和 [`pageModule` 合同](../../docs/api/sidebar-tool-page-module.zh-CN.md)。

## 行为与限制

只接受 `isTrusted`、右键、净左移 ≥56px、相对按下点最大竖向偏移 ≤28px；命中后一次后退。普通右击、短滑、修饰键、选中文字、输入框/可编辑元素/链接/画布/视频排除；Escape、窗口失焦、隐藏、受管销毁取消。轨迹 SVG 使用 Shadow DOM、`pointer-events:none`，监听器和轨迹均登记到 UI 生命周期。

**真实风险**：本次 headless Chromium 观察到 `contextmenu` 在右键 `mousedown` 之后、首次 `mousemove` 之前触发。纯 USER_SCRIPT 若提前阻止该事件就会破坏普通原生右键菜单；若不阻止，则真实 OS 菜单可能遮挡手势。当前只证明 JS 手势识别，不声称“菜单正常 + 各 OS 真实右拖可靠”已同时通过。必须用真实 Chrome 原生验收后决定产品取舍。

## 定向测试

```bash
node --test projects/mouse-gestures/tests/gesture.test.mjs
node --check projects/mouse-gestures/src/page/gesture.js
node --check projects/mouse-gestures/src/page/main.js
node --check projects/mouse-gestures/src/main.js
```

本轮隔离运行 Node v22.16.0，9/9 PASS：左滑后退一次、右键菜单不误阻止、短滑不后退、ESC/失焦取消、编辑/选区/非可信输入排除、斜向/无历史/松开按钮保护、再次正常右击、销毁释放监听器与 SVG、页面隐藏取消。standalone headless Chromium + Playwright（模拟 Page UI 和可观察导航回调）结果：正常右击 0、短滑 0、左滑 1、ESC 后仍 1、输入框右拖仍 1、销毁后仍 1。它不是宿主安装、真实原生菜单显示或权限撤销的证据。

## 标签页控制（延期，不能暗中提权）

公开 `OpenDeskSDK.browser.tabs.*Owned` 只操作本工具 Owned TabRef，不能凭网页手势关闭/切换/恢复用户任意已有标签。Page `history.back()` 本轮不需要 SDK 增量。Chrome 原生 `tabs` API 属扩展页/Service Worker，`sessions.restore` 要独立 `sessions` 权限；这不等于 USER_SCRIPT 已获得调用权限。后续最小方案必须由平台 owner 独立证明 SDK Gap，限定当前真实 Sender/tabId/documentId、窗口与安装授权代数，并从可信来源证实用户手势，单独审阅恢复权限与破坏性动作，保守处理撤权和 UNKNOWN；不接受脚本自报 `isTrusted` 或任意 tabId。当前结论：`SDK_GAP_NOT_PROVEN`；普通 Page 直接控制他人标签 `BLOCKED`。

## 下一轮：正式交互预览与配置管理

只在既有代码上增量：先完成真实 Chrome 的右键菜单时序取舍；再在 `preview/` 制作可点击单文件 PC+Side Panel 预览，复用现有布局与 Tokens，配置最小字段为 `enabled` / `gestureThreshold` / `siteExclusions` / `gestureMappings` / `showTrace`；最终用应用私有 `storage.local` 与 ETag/CAS 保证保存→刷新→读取不覆盖并行设置。定向验证配置停用/站点撤权资源清理；预览、Node、Headless、已安装 Chrome/production 的证据严格分层。未验证前不发布正式包、不增加标签能力。

参考：[`AGENTS.md`](../../AGENTS.md)、[Extension Creation Workflow](../../.agents/workflows/extension-creation.md)、[Page 生命周期](../../docs/api/page-userscript.zh-CN.md)、[Browser SDK](../../docs/api/browser-sdk.zh-CN.md)、[Chrome Tabs](https://developer.chrome.com/docs/extensions/reference/api/tabs)、[Chrome Sessions](https://developer.chrome.com/docs/extensions/reference/api/sessions)。
