# Cookie Editor R3.3 · 正式 Cookies SDK 安装工具

**入口：** Side Panel → 工具 → 发现工具 → Cookie Editor。默认中文，官方目录仍为 `installationPolicy: optional`；工具包 **2.0.4 / opendesk.sidebar-tool.v2**。2026-10-14 已在同一隔离 CFT 候选通过真实发现、安装、网站授权、自动读取、新建、Value 编辑、Name 编辑、保存回读与精确删除。所有 Cookie 修改均从已安装工具 UI 发起。完整宽度/面板自身 Zoom、跨 Store/Partition 原生矩阵及最终发布验收仍未关闭；不能宣称最终 95+。

## 用户能完成什么

1. 在实际 Chrome 打开要授权的网站 → 已安装工具「设置」→ 按网站分别授权 `browser.cookies.read / values / write / observe / clear`。安装或选择网址不自动授权；第一次授权需该站点处于活动标签页。授权后普通读取可以在其他网站仍活跃时重复使用。
2. `OpenDeskSDK.browser.cookies.getAll({url})` 读取真实 Chrome Cookie 元数据，显示 Cookie 名称、Domain/Path、Secure/HttpOnly/SameSite、Session/Expiration、Store/Partition。真实值默认隐藏；独立 `values` 网站授权后才可按需显示或导出。
3. `cookies.set/remove` 实际新增、编辑、精确删除；受信 Side Panel 每次要求用户明确确认。原生回读和结果未知不自动重试。Name 可直接修改，并按先新建核验再精确删除旧名称执行（非原子）。未改动的隐藏 Value 仅在获准独立敏感值权限后临时读取保留；也可主动提供新 Value。未授权时绝不静默写空值。
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
| Cookie/SDK Node 专项测试 | 旧 111 项证据保留；受影响 UI 45/45、Cookie Driver 31/31、启停 17/17 通过 |
| 官方工具打包、Check | PASS（本地 2.0.4 候选） |
| Build、Build:dev、Verify | PASS（隔离源码快照，未替换日常扩展） |
| 完整 npm test | FAIL：本轮集中集成 2267/2292 通过、23 失败、2 跳过；旧失败证据保留 |
| Mac Chrome 安装、真实授权、核心操作/导入导出/清理/观察/撤权/启停/卸载/升级 | PASS_SCOPED：核心/Path/部分重命名使用当前隔离候选，其余未受影响项保留前一候选身份限定复用；受控 HTTP 网站、虚构 Cookie；原始截图和回执见原账本 |
| 宽度与 Zoom | 360 px 无横向溢出，值隐藏；网页 Zoom 100/125/150/200 下 Side Panel 保持自身 100%。其他面板宽度及自身 Zoom NOT_TESTED |
| 八项产品级专家评分 | NOT_SCORED |

可在真实 Mac 工作区运行：

```bash
node --test tests/environment/browser-sdk-r9-installed-cookies.test.mjs tests/environment/browser-sdk-r7-trusted-cookies.test.mjs tests/environment/browser-sdk-r8-cookies.test.mjs tests/environment/cookie-editor-ui.test.mjs
node scripts/build-sidebar-tool.mjs examples/sidebar-tools/cookie-editor
node scripts/build-official-tools.mjs --out artifacts/official-tools-release
npm run check && npm test && npm run build && npm run build:dev && npm run verify
```

测试只使用虚构 Cookie。运行命令及真实 Chrome GUI/CFT 证据必须绑定对应源码输入、工具包 SHA-256 和扩展构建 Hash；不能用 DevTools 直接调用 `chrome.cookies` 冒充用户安装路径验收。R2/R2.1 历史阻塞与组件冒烟保留在原工作流中，不替代 2.0.4 的同候选原生报告。

R3.3 新候选：授权变化后经已有 Bridge 自动检查当前网站；拒绝与读取失败显示独立状态；未完成 Host 操作期间锁定网站与模式控件；普通确认不再采用危险操作红色样式。正式产品默认不进入离线工作区。历史 1.0.0 官方发行仍是离线包，已安装用户必须在「发现工具」明确升级；不能静默同版本替换。

2026-10-14：上述核心旅程、导入导出、清理、观察、升级和生命周期已取得隔离 CFT 的限定原生证据；宽度、Side Panel 自身 Zoom、真实跨 Store/Partition、F3/ZIP 等缺口与全仓 FAIL 继续保留。当前核心、Path 隔离及部分重命名绑定身份保护修复后的候选；未受影响项保留前一候选身份限定复用。本轮原始证据和 Git/CI 状态见原工作流 `r33Local` 与 [续接提示词](../../../docs/framework/prompts/cookie-editor-r33l-core-first-handoff-20261014.zh-CN.txt)。

## R4.3 / 2.0.5 网页源码修订（2026-10-14）

三个 34px 纯图标在真实浏览器 Cookie 列表标题中直接可见；导入先预览 Store/Partition、新增与覆盖，再经可信 Host 逐条写入；导出先声明网站、范围、敏感值和格式损失，依然走可信本地下载。Cookie 编辑和新建复用一个表单并嵌入当前列表行；未保存内容需明确确认才能放弃。首次组合授权由受信任 Side Panel 提供，敏感值另行授权，不能由沙箱自授权。

本条仅记录源码变更，**2.0.5 的 Node、构建、CI、Mac Chrome 原生安装及完整缩放矩阵需另行按同一候选复核**。2.0.4 的历史原生 PASS 不自动转移。
