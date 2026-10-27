# Browser Environment P0-R1.2 · 隔离 Mac Chrome 夹具

此目录是独立的 MV3 技术验证扩展，不是正式 OpenDesk Browser、Sidebar Tool 或第二套产品 Host。正式 Manifest 不增加权限，正式 React/SDK/Authority 只读。实际测试结果见 [REPORT.md](REPORT.md)。

2026-10-27 未找到上一轮原始补丁；用户随后明确让代理按专家判断完善，因此在原约定目录恢复新候选。新候选的字节和原始实现不同，旧 Node 7/7、Linux HTTP 结果只保留为历史描述，不继承为本候选 PASS。

## 执行位置与权限

- `panel.html/js`：固定可信扩展 Side Panel，按钮通过 `runtime.sendMessage` 触发。
- `worker.js`：此隔离测试扩展唯一 MV3 Worker；验证同扩展精确 panel URL，只允许固定的观测/绑定/启动/停止/安全关闭操作。
- CDP 仅控制绑定的本地 Target tab；仅固定 UA、时区及桌面 metrics，不能接收任意 CDP 方法、源码或目标。
- `scripting.executeScript` 在实际本地网页 MAIN 世界只读观测 JS，并请求本地 HTTP echo；不 monkey-patch `navigator` 或 `Intl`。
- `server.mjs`：仅绑定 `127.0.0.1:43128`，回显允许的请求头；可将侧栏操作证据写入显式 `--evidence` 目录。
- `debugger` 是此测试扩展的必需权限；不修改正式扩展权限。它会引起 Chrome 原生调试提示。只加载在无真实账号的全新隔离 Profile。

## 最短复现

在仓库根检查输入与端口，再执行：

```sh
node --check tests/fixtures/browser-environment-p0/worker.js
node --check tests/fixtures/browser-environment-p0/panel.js
node --test tests/fixtures/browser-environment-p0/test.mjs
node tests/fixtures/browser-environment-p0/server.mjs --evidence /absolute/task/evidence/native --extension-id YOUR_ISOLATED_EXTENSION_ID
```

端口被占用时先识别 owner，不终止其他服务。先在隔离 Chrome 扩展详情读取真实 ID，再替换命令里的 `YOUR_ISOLATED_EXTENSION_ID`。测试只需原生 Chrome/CFT 和 Node，不构建正式产品、不写 `dist/development`。创建全新专用 `--user-data-dir`，以新窗口启动官方 Google Chrome for Testing；可用 `--load-extension` 指向本目录。官方品牌 Stable Chrome 137 起不支持该命令行加载方式，需要在隔离 Profile 的 `chrome://extensions` 原生“加载已解压的扩展程序”选择本目录。不要复制或替换日常扩展。

1. 新窗口打开两页：`http://127.0.0.1:43128/browser-env-p0/?role=target` 与 `http://127.0.0.1:43128/browser-env-p0/?role=control`。
2. 通过工具栏的扩展图标（可先在扩展菜单固定图标）打开真正的 Chrome Side Panel；不得把 `panel.html` 作为普通 tab 替代。
3. 核对 Target/Control 为不同 tab、同 window，点击“绑定 Target / Control”。
4. 点击“只读观测”：保存 `before.json`，截图实际网页和侧栏。
5. 点击“启动 / 刷新验证”：保存 `after.json`，检查三条 CDP 回执、目标 JS 与 HTTP UA、时区及 Control 分别读回；保存原生调试提示截图。
6. 点击“停止 / 刷新恢复”：保存 `stop.json`。只有全部所采集 JS 字段与 HTTP 头、包括 Control，实际读回匹配 BEFORE，才为 `RESTORED_OBSERVED`；不是以 detach 成功判定。CFT 138 调试提示条可能使文档暂留一像素高度偏差；本次已拥有会话的 Stop 只在其他字段全部恢复时最多等待十秒、再补一次刷新并严格重读。仍不一致就保持未确认。

证据 POST 会覆盖 `before/after/stop.json` 的最新视图，但 **每一次动作都追加到 `actions.jsonl`**，失败和重复动作不会丢失。测试员应把核心一次链另存到 `core/` 后再执行异常项，绑定候选 SHA-256、扩展 ID、Chrome 版本、Profile、Target/Control tab/window/document ID。截图需用原生桌面截图，不能用 HTML 预览或 Mock。

证据写入只接受指定扩展 Origin 与本轮随机凭据；凭据由原生扩展 POST 会话请求取得（Chrome 对扩展 GET 可能省略 Origin）。这不是防本机恶意进程篡改的安全存储。完整观测会先保存到 `storage.session` 的独立 pending 键；服务不可用时界面保留原结果，重开侧栏或点“刷新测试标签列表”会按原 actionId 重试，不重新执行 CDP。服务器按 actionId 去重。不要通过重载或卸载扩展清掉尚未取回的 session 证据。

## 生命周期与安全恢复

核心链成功后，定向验证重复启动/停止、标签关闭、移至新窗口、localhost 导航、DevTools 竞争、原生取消调试与 Worker 中断。不同条件及失败保留在 `actions.jsonl`，不混入核心一次链。

Worker 从活动会话持久状态恢复时只标 `RECOVERY_REQUIRED`，不假定拥有存活的 debugger，不自动重放和 detach。界面“关闭测试目标（安全恢复）”只允许关闭仍位于原窗口且 URL 仍为本地测试页的已绑定 Target；关闭整份专用隔离浏览器也可安全销毁该 Profile 中的测试会话。未知归属调试器不强制断开。

导航或移窗使绑定失效，夹具只清理其内存明确拥有的 attachment。未读回恢复时禁止重新绑定清除基线；回到原本地 URL 后可 Stop 只读核对，或关闭原本地目标后再建立新目标。Control 关闭不能消除原目标的恢复义务。不要把带覆盖的测试标签导航到真实网站。恢复失败或未能读回时保留 `RESTORE_UNVERIFIED`；不能把关闭标签的清理写为已在原网页读回恢复。

**2026-10-27 取消恢复增量：** CFT 138 原生“取消”后，当前文档的 `navigator.language/languages` 仍可残留英文，而 UA、HTTP 头和时区已经恢复。只读观测仍保留 `RESTORE_UNVERIFIED`，不自动刷新、不重连。若本 Worker 在内存拥有会话时刚收到 `canceled_by_user`，用户随后显式点击“停止 / 刷新恢复”可刷新原本地 Target **一次**，再严格核对全部已采集字段；此刷新不调用 attach、CDP 或 detach，重复 Stop 不重复刷新。URL/窗口/Control 校验失败即拒绝；刷新后仍有残留继续锁定。这个一次性意图不写入 storage，Worker 中断后仍为 `RECOVERY_REQUIRED`，使用上述安全关闭出口。事件不构成 debugger ownership 证明，迟到跨代事件仍无原生证据。增量原始结果见 REPORT 末尾。

`onDetach` 只携带 tabId，排队事件会检查会话代次，但旧会话事件在新 attach 后才送达的边界尚无原生证明。遇此事件保守地失去 ownership、阻止重启并要求恢复；正式接入前必须继续收口，不承诺无缝续接或自动重连。

## 技术边界

UA、UA-CH、platform、language、viewport、DPR 逐项报告实际结果。P0 不证明系统字体、硬件、TLS、GPU、底层 OS 或所有指纹可修改。代理是正式框架中浏览器级受管资源，不能当作 Tab 私有设置。本夹具不操作代理、Cookie、账号、地理位置或生产网络。
