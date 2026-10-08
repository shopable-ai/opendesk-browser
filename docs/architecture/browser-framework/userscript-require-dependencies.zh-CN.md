# R3 用户脚本依赖管理设计：`@require` 优先，编辑器勾选项退场

> 2026-10-08 专家评审候选。保留已提交的原 Controller / RunHost / Authority、Task v1 和页脚本初版固定 jQuery 代码；不得把本文误当作全功能已上线、原生 Chrome 验收 PASS。

## 一、用户体验与兼容层

**默认使用油猴类标准 UserScript metadata**：

```javascript
// ==UserScript==
// @name        我的页面助手
// @match       https://example.com/*
// @require     https://cdn.jsdelivr.net/npm/jquery@3.7.1/dist/jquery.min.js#sha256=fc9a93dd241f6b045cbff0481cf4e1901becd0e12fb45166a8f17f95823f0b1a
// @run-at      document-idle
// ==/UserScript==

async function main() {
  return $('h1').first().text();
}
```

`@require` 是用户脚本管理器加载前置依赖的语法，并非原生 JS `import`。上面的 URL 用于表达原始来源，真正执行只取已经审核并匹配**精确 SHA-256**的内容（内置字节可以按相同 digest 命中）；不假定不同 CDN 的内容必定与固定上游包一致。入口自动识别依赖、不需要勾选 jQuery。原来 checkbox 仅作为当前兼容过渡开关，待正在开发的独立 Sidebar UI PR 合并后删除，不覆盖他人的 UI 文件。

**两类代码分开**：
- Page User Script 可以直接使用 DOM、jQuery 等库，依赖加载在 `USER_SCRIPT`，并且与网页 MAIN world 和其他 Candidate world 隔离。
- Controller 的 `async function main()` 是 Worker 自动化脚本，依赖不能被偷偷注入该 Worker；仍通过 `page`、`axiosx`、`AppStorage` 等已有受信能力。
- `import x from "https://..."` 是 ESM 模块语法，不是 `@require` 的替代；若今后支持，需在单独的“模块开发模式”完成构建 / 静态 import map / 资源锁，而不是把远程 import 放进普通用户脚本执行。

## 二、冻结与授权流程

1. 编辑器即时解析开头 `// ==UserScript==` 规范块；`@require` 可多条，按顺序展示来源、版本、授权域名及 SRI 状态。
2. 粘贴无哈希 HTTPS URL 时先展示“需要锁定”；用户明确操作之后，受信资源管理器下载一次、验证内容和许可信息，生成 `sha256`，审核完成后写入不可变资源锁；无锁版本**不能发布为 Available**。不能在用户打开网页时自动从 CDN 获取最新版再运行。
3. 资源资产键用 `sha256`，保存源 URL、字节数、SHA256、许可、审查状态与 JavaScript UTF-8 代码。一次 Candidate 锁定 Program Revision + manifestHash + dependencyLock（来源、hash、order、world、assetId）；升级库必须产生新 Candidate、重新验证。
4. 预览可以使用经审查的原生 `chrome.userScripts.execute` 并验证当前 window/tab/frame/document 和站点授权；正式安装才由原有可信 Authority 检查 Available/Installed/Enabled 后执行 `chrome.userScripts.register`。
5. 仅从已经审核和缓存的资源注入 `USER_SCRIPT`，代码数组顺序：lib1 → lib2 → ... → `async main()`。第三方 JS **不能**在 SW、Controller Worker、Side Panel 的高权限环境执行。默认拒绝 MAIN；`@grant`、`@resource`、`GM_*` 必须另外审核，不能从文本元数据自动授予权限。
6. 页面刷新自动注册、停用注销及浏览器重启对账只消费缓存锁定资产。依赖丢失、哈希不符、授权撤销或 API 开关关闭，一律失败关闭而不兜底运行未锁定依赖。
7. 用户手动“检查更新”可以重新抓取远程 URL；新字节生成新依赖版本、独立验收和显式升级，不暗改已安装的稳定版本。

## 三、技术限制

- 第一个开发切片只解析 UserScript 头部、`@require`、`@match` 并实行 strict `https:`、SHA-256 锁、最多 8 个依赖、头部 8KiB；Parser 不能把网页 URL 当下载许可，UI/受信 Broker 要逐个授权下载来源。
- 停用用户脚本不能撤回它已经产生的 DOM 变化和事件监听，必须说明“后续新文档禁止再次运行”，需要额外清理合同才能声称已停止当前页面效果。
- Chrome Web Store MV3 的远程代码豁免仅覆盖明确允许它的 User Scripts API 范围；绝不能因 `@require` 存在就在 SW 中 `eval` 或在普通扩展页面中动态执行远端 JS。
- 用户导入本地文件应将文件**内容**转为经哈希锁定的 Asset，而非依赖只在本机生效的 `file://` 路径。外部网络失败时仍可运行已经本地缓存的版本。
- 本轮 Node 测试不证明 Chrome 原生、网址自动匹配、jQuery MAIN 引用不变或最终框架验收；这些应在正式同候选 ZIP / CFT 下验收。

## 四、实施序列与退出准则

| 阶段 | 实施 | 完成条件 |
|---|---|---|
| P0 | 独立 metadata parser + 针对危险语法的封闭校验 + UI 依赖摘要（不覆盖并行 UI） | 头部解析、顺序、SHA、无锁状态、恶意 URL 拒绝均通过 |
| P1 | Trusted dependency resolver + 基于 SHA 的缓存与来源授权 + 移除原 jQuery checkbox | 多个库按序在真实 USER_SCRIPT 生效、无 HTTP 运行时依赖、断网仍可用 |
| P2 | 修订 Task/Page Program Asset & dependencyLock，Available 安装及 unregister、重启对账 | 不匹配零执行、启停阻止新文档、两个版本互不污染、失败关闭 |
| P3 | 审核 ESM import 作为可选开发模式，不与 `@require` 混淆 | 每条 import 都在构建时可追溯并有哈希，不运行 CDN 动态模块 |

## 五、反方审核评分目标

- 用户可用性和与油猴兼容 20/20；依赖可复现与生命周期 20/20；权限和隔离 19/20；扩展性 19/20；可测性与审计 19/20。**静态方案自评 97/100**，不是经真实 Chrome 验收的产品评分。未完成上述 P1/P2 原生退出条件前，禁止将产品评为 95+ 完成。
