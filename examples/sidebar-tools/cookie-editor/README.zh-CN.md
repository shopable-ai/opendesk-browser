# Cookie Editor R3 · 正式 Cookies SDK 安装工具

**入口：** Side Panel → 工具 → 发现工具 → Cookie Editor。官方目录仍为 `installationPolicy: optional`；工具包 **2.0.0 / opendesk.sidebar-tool.v2**，不是另建 Chrome 扩展。正式 SDK、Host 和真实 UI 的源码已有接线，但**当前候选尚无 Node/Build/Chrome Native 通过证据，不能宣称 95+ 正式交付**。

## 用户能完成什么（SOURCE_WIRED，未原生验收）

1. 在实际 Chrome 打开要授权的网站 → 已安装工具「设置」→ 按网站分别授权 `browser.cookies.read / values / write / observe / clear`。安装或选择网址不自动授权；第一次授权需该站点处于活动标签页。授权后普通读取可以在其他网站仍活跃时重复使用。
2. `OpenDeskSDK.browser.cookies.getAll({url})` 读取真实 Chrome Cookie 元数据，显示 Cookie 名称、Domain/Path、Secure/HttpOnly/SameSite、Session/Expiration、Store/Partition。真实值默认隐藏；独立 `values` 网站授权后才可按需显示或导出。
3. `cookies.set/remove` 实际新增、编辑、精确删除；受信 Side Panel 每次要求用户明确确认。原生回读和结果未知不自动重试。编辑只有脱敏元数据的旧 Cookie 时必须主动输入新值，避免误将隐藏旧值写成空字符串。
4. `clearSite` 只清理选定主机的 Host-only Cookie、批准的 Store/Partition、最多 50 条。先生成含 **60 秒、一次性 `previewRef`** 的预览；清理前核对精确 Cookie 身份集合，数量相同而内容改变也拒绝。实际删除仍需可信点击；Worker 重启、撤权会使旧预览不可用。
5. `observe.start/getStatus/read/stop` 手动启动最长 15 秒的有界脱敏变化观察，携带 cursor/gap。事件不传 Cookie 值。
6. 「离线工作区」仍支持 JSON、Cookie Header、Netscape 读取/编辑/导出，绝不冒充真实 Chrome；真实导入每批至多 10 条，预览并逐条经 Chrome SDK 与用户确认。真实含值导出需要主动触发本地保存和额外敏感值授权。

## 唯一架构及授权边界

```text
已安装的普通 Sidebar Tool (不可信 sandbox)
  → OpenDeskSDK.browser.cookies.*
  → 原 Sidebar Tool Bridge
  → Side Panel 真实安装身份/包摘要/Install Epoch/用户逐站授权
  → 原 Browser Dispatcher / Host
  → 原 createTrustedCookieHost / createCookieService
  → Chrome Native Cookies API
```

任何声明 Cookie Capability 的普通已安装工具都使用同一受信工具设置入口，不因 Cookie Editor 官方来源获得 BUILTIN_TRUSTED 特权。Host 校验真实 Sender、Chrome Cookies + Host Permission、明确 Origin、Store、Partition、Capability、版本/包摘要/Epoch；Page SDK、开发预览和跨工具不得继承授权。敏感值只在当前用户请求中临时显示，不自动写入工具 Storage、草稿、遥测或云端。

**旧内置可信 Cookie 管理 UI 尚保留。** `browser.cookies.approve/execute` 只供历史可信 UI 内部防重放使用，不是工具 SDK；正式 Cookie Editor 在真实 Chrome 通过正反向与生命周期验收后再迁移和去除重复产品入口，避免现有原生 Cookie 功能倒退。

## 验收（真实结果与缺口）

| 项目 | 当前等级 |
| --- | --- |
| 11 项公开 SDK、Schema、Host 与 Tool Capability | SOURCE_WIRED |
| 真实读/值/写/删/清理/观察的 UI 调用 | SOURCE_WIRED |
| V8 JavaScript 语法检查 | PASS（仅语法，不是功能或 Chrome） |
| Node 专项测试、官方工具打包、Check、Build、Build:dev、Verify | NOT_TESTED（已补测试源码，当前执行环境未运行） |
| Mac Chrome 安装、真实授权、原生操作/撤权/升级及截图 | NOT_TESTED |
| 八项产品级专家评分 | NOT_SCORED |

可在真实 Mac 工作区运行：

```bash
node --test tests/environment/browser-sdk-r9-installed-cookies.test.mjs tests/environment/browser-sdk-r7-trusted-cookies.test.mjs tests/environment/browser-sdk-r8-cookies.test.mjs tests/environment/cookie-editor-ui.test.mjs
node scripts/build-sidebar-tool.mjs examples/sidebar-tools/cookie-editor
node scripts/build-official-tools.mjs --out artifacts/official-tools-release
npm run check && npm test && npm run build && npm run build:dev && npm run verify
```

测试只使用虚构 Cookie。运行命令及真实 Chrome GUI/CFT 证据必须绑定同一 Git SHA、工具包 SHA-256 和扩展构建 Hash；不能用 DevTools 直接调用 `chrome.cookies` 冒充用户安装路径验收。R2/R2.1 历史阻塞与组件冒烟保留在原工作流中；不升级为 R3 Native PASS。
