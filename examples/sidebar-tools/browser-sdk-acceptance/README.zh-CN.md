# Browser SDK Acceptance R10.6

这是 R10.6 真实 Chrome 驱动准备用的普通 `opendesk.sidebar-tool.v2` 工具源码。它不是新的 Chrome 扩展、不是第二套 Browser Host，也不直接调用 `chrome.*`。所有业务动作都从用户按钮触发，并只通过 `OpenDeskSDK.browser` 调用正式 Browser SDK。

## 覆盖范围

- `bookmarks.create/removeOwned`：创建并移除本工具拥有的书签 Ref。
- `storage.local.set/get/remove/clear`：验证已安装工具命名空间内的隔离持久存储；清空必须经过可信审批。
- `downloads.download/getOwned/listOwned/cancelOwned`：请求下载 `http://127.0.0.1:43111/demo-form.html`，只使用 opaque `downloadRef`；未完成时可显式取消，完成和中断分别记录。
- `scheduler.create/listOwn/cancelOwn`：为已安装固定 Task Revision 创建、列出并取消本工具自有 schedule。

所有需要真实用户意图或高风险写入的操作都应由正式 Side Panel Host 弹出可信审批；工具沙箱只显示按钮和回执，不写授权、不灌 storage、不伪造 sender。

10.6.2 增加 opaque Ref 拒绝探针。驱动可通过正式 UI 安装第二个普通工具 ID，验证跨工具数据隔离、资源拒绝，以及升级后的旧身份拒绝；这些按钮不绕过 SDK 或 Host。

## 构建

```bash
node scripts/build-sidebar-tool.mjs examples/sidebar-tools/browser-sdk-acceptance --out <evidence-dir>/browser-sdk-acceptance.opendesk-tool.json
```

## Native driver

准备阶段只生成候选身份和步骤清单，不启动浏览器：

```bash
node tests/framework/browser-sdk-r106-native.mjs --prepare
```

真实 Chrome 阶段必须由主对话在独立 CFT155/Profile 资源中执行，并显式传入环境变量：

```bash
OPENDESK_R106_NATIVE=1 \
OPENDESK_R106_EXTENSION=/absolute/path/to/candidate-extension \
OPENDESK_R106_CANDIDATE_SHA=<exact-40-character-source-commit> \
OPENDESK_R106_BUILD_RECEIPT=/absolute/path/to/build-production.json \
OPENDESK_R106_CHROME_BIN=/Users/shopme/Documents/workspace/opendesk-browser/tests/.cache/m5-browsers/155.0.8059.39/chrome-mac-arm64/Google\ Chrome\ for\ Testing.app/Contents/MacOS/Google\ Chrome\ for\ Testing \
OPENDESK_R106_EVIDENCE=/absolute/path/to/evidence \
node tests/framework/browser-sdk-r106-native.mjs --native
```

驱动核对实际包与成功构建收据，并逐一核对声明源码提交的构建输入。执行日志中的部分通过不能代替完整 55 项验收；未执行的 Native 合同继续保持 `NOT_TESTED`。
