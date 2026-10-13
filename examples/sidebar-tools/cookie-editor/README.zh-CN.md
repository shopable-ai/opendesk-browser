# Cookie Editor R2 · 正式 SDK 接入前的独立工具界面

**产品身份：** Side Panel → 工具 → 发现工具 → Cookie Editor。官方目录中仍是 `optional`，使用已有安装器、停用/启用和卸载机制，不是另一款 Chrome 扩展。

> **本版本 1.1.0：真实 Cookie 操作仍为 BLOCKED。** 截至审计时的仓库 `main`，`OpenDeskSDK.browser` 尚无 `cookies` 命名空间，安装包 Capability 白名单也不接受 `browser.cookies.*`。因此 **不会读取、查看真实敏感值、创建、修改、删除或清除 Chrome Cookie**。代码不会调用私有 `browser.cookies.approve/execute` 或直接访问 `chrome.cookies`。

## 用户能做什么

1. 安装后默认打开「浏览器 Cookie」模式，看到当前 HTTP(S) 站点，或输入指定地址并点击「选择」。当前网站 **不被自动授权**；手动指定地址不要求匹配活动标签页。
2. 页面显示正式 SDK 就绪/不可用状态。只有未来正式 SDK 暴露 `browser.cookies.getAll` 且能力状态 `callableNow=true` 时，点击「读取 Cookie」才会尝试公开 SDK 的按 URL 读取。返回数据只渲染元数据，任何 `value` 都被主动丢弃；**尚不代表公开 R9 合同已验收**。
3. 切换到「离线工作区」，可新增、编辑、删除本地 Cookie、载入虚构示例、搜索、单条/清空确认、JSON / Cookie Header / Netscape 导入和复制/下载导出；关闭工具会失去内存工作区。它绝不操作真实 Chrome Cookie。
4. 选择其他网站时清除旧网站临时编辑内容与已渲染的浏览器元数据；网页变化时取消本次读取上下文，显式区分离线与真实结果。

**安全注意：** Cookie 值可能是登录凭据。离线值和导入文件有 `data-sensitive` 标识，不进入宿主草稿恢复。主动复制或导出仍会产生明文，请避免输入或分享生产登录凭据。

## 当前接口分工与明确阻塞

| 功能 | 本工具现状 | 需要 Browser SDK R9 提供 |
| --- | --- | --- |
| 站点选择、模式切换、离线编辑与导入导出 | 源码已接线，Node/Chrome 仍需执行 | 无 |
| 真实 Cookie 元数据 | 仅有受控适配入口；未接通 | 公开的 `cookies.getAll`、URL/Domain/Store/Partition 合同，工具元数据读取授权 |
| Cookie 值 | 永远默认脱敏，无明文展示入口 | 独立 values 授权及可信 Host 脱敏语义 |
| 新建、编辑、删除 | 目前仅离线工作区可用 | 公开 `cookies.set/remove`、精确 Cookie 身份、原生回执及未知效果语义 |
| 批量清理 | 目前仅离线清空 | 公开 `clearSite` 精确 Host/Store/Partition 预览与确认（≤50 条） |
| 观察变化 | 未接通 | 公开 `observe.start/getStatus/read/stop` 与脱敏事件 |
| 安装与权限 | 继承普通工具安装/启停/卸载，保持旧包白名单 | `browser.cookies.read/values/write/observe/clear` 登记、逐站授权和撤权、包摘要/安装代际绑定 |

**禁止做的事：** 不因 `optional` 或官方来源授予特殊权限；不自行增加第二个 Cookie Service/Host/权限数据库；不因 SDK 缺失退回私有调用；不以工具中的示例行模拟已读取的 Chrome Cookie。

### 正式 SDK 集成检查单

R9 完成后，先更新 Capability 包声明（当前只声明 `currentPage.read`、`user.export`），核对真实方法签名、授权状态/网站与 Store/Partition 范围、值脱敏/删除身份、观察与清理回执。**不可仅因 `getAll` 名称存在就宣称 R2 完成。** 所有副作用成功后重新读取，结果未知时提示核对而不自动重试。更新后执行全套负向权限和 Mac Chrome for Testing 验收。

## 本地测试（必须在真实开发目录执行）

```sh
node scripts/build-sidebar-tool.mjs examples/sidebar-tools/cookie-editor
node --test tests/environment/cookie-editor-ui.test.mjs tests/environment/official-tools-catalog-r45.test.mjs
node scripts/build-official-tools.mjs --out artifacts/official-tools-release
npm run check
npm test
npm run build
npm run build:dev
npm run verify
```

本次通过 GitHub 远端仓库读取和条件式写入，**没有访问用户 Mac 工作区**。上面的 Node/Build/Verify/Chrome 命令均不能标记为已运行；证据等级单独见 `docs/framework/workstreams/cookie-editor-r2.{md,json}`。绝不把静态源码检查当作真实 Chrome 验收。
