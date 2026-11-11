# Mouse Gestures · 四方向 MVP（待真实 Chrome 验收）

> OD-MOUSE-GESTURES-4DIR-LOCAL-CHROME-R3（历史标识 OD-MOUSE-GESTURES-4DIR-REAL）· 0.2.1 可安装候选：四方向 Page 手势、Side Panel 开关、应用私有存储及普通 HTTP(S) 网站匹配已接线。真实 Chrome 安装、原生右键菜单与宿主权限撤销仍须实测，不能标记为正式验收。

2026-11-11 R3 实际结果：当前预览 DOM 为四项、两列，开关两态都完整显示；未复现“只显示一项”，没有重写 UI。复现并修复了松开右键后等待授权期间 Escape 无法取消迟到动作的问题，新增先失败后通过的回归，业务 Node 测试 27/27 通过。预览证据不代表已安装 Side Panel；Chrome 四方向、原生菜单、持久化及撤权仍为 `NOT_TESTED`。

唯一可导入包：[`mouse-gestures.opendesk-tool.json`](mouse-gestures.opendesk-tool.json)，版本 0.2.1，包含侧栏和同源 Page Module；由原打包器校验、晋升，尚未证明已在 Chrome 安装生效。

- 正式 Side Panel 位于 `src/index.html` / `src/style.css` / `src/main.js`；仅保留「开启鼠标手势」开关、两列四项默认手势和「松开右键执行 · Esc 取消」。初次没有保存的设置默认关闭。
- Page 在 `src/page/gesture.js` 实现 ← 后退、→ 前进、↑ 刷新、↓ 滚至文档底部。56px 激活，横纵主轴 + 28px 垂直偏移限制，斜向/选区/编辑控件排除和单次执行保护。
- `src/page/runtime.js` 使用现有 `OpenDeskAppPage`、受管 UI、`storage.local` 与 Page Authority。设置读回失败时 fail-closed；在执行手势前重新读取最新设置并核验身份，避免关闭开关后仍执行。周期性同步仅用于旧页面 UI 及时取消轨迹；不能冒充跨所有标签页即时推送。
- `pageRules.matches` 为 `http://*/*` / `https://*/*`，与官方现有 Page Module 格式一致。匹配不等于安装、Chrome User Scripts 或网站权限已批准；仍须原 Installer/Authority 审阅。Chrome 内部页、浏览器 PDF、不获准的 iframe 不支持。
- 单文件 `preview/index.html` 只模拟界面，不调用 Chrome API，也不写正式设置。旧的左滑试点证据仅适用于历史代码，不支持新版本生产通过声明。

定向开发验证：

```bash
node --test projects/mouse-gestures/tests/*.test.mjs
node --check projects/mouse-gestures/src/page/gesture.js
node --check projects/mouse-gestures/src/page/runtime.js
node --check projects/mouse-gestures/src/page/main.js
node --check projects/mouse-gestures/src/main.js
node scripts/build-sidebar-tool.mjs --help
```

正式验收必须在独立已安装 Chrome + 用户批准的普通网页上验证四方向真实右拖、普通右键菜单、开关即时停用、刷新重启、卸载撤权清理和同一候选包身份。Mac 上原生菜单可能先于鼠标移动出现；Node/无头回归不能替代这一测试。

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

## 历史计划：当时的下一轮（0.1.0，非当前待办）

以下保留当时计划，不要求重做已经完成的预览、四方向或存储，也不覆盖顶部 R3 可安装候选与真实 Chrome 待验收状态。

只在既有代码上增量：先完成真实 Chrome 的右键菜单时序取舍；再在 `preview/` 制作可点击单文件 PC+Side Panel 预览，复用现有布局与 Tokens，配置最小字段为 `enabled` / `gestureThreshold` / `siteExclusions` / `gestureMappings` / `showTrace`；最终用应用私有 `storage.local` 与 ETag/CAS 保证保存→刷新→读取不覆盖并行设置。定向验证配置停用/站点撤权资源清理；预览、Node、Headless、已安装 Chrome/production 的证据严格分层。未验证前不发布正式包、不增加标签能力。

参考：[`AGENTS.md`](../../AGENTS.md)、[Extension Creation Workflow](../../.agents/workflows/extension-creation.md)、[Page 生命周期](../../docs/api/page-userscript.zh-CN.md)、[Browser SDK](../../docs/api/browser-sdk.zh-CN.md)、[Chrome Tabs](https://developer.chrome.com/docs/extensions/reference/api/tabs)、[Chrome Sessions](https://developer.chrome.com/docs/extensions/reference/api/sessions)。
