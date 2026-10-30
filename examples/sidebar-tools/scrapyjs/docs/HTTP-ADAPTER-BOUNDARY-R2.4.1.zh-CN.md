# ScrapyJS R2.4.1 · HTTP Adapter 边界及后续准入

> 本文保留 R2.4.1 历史 CI 失败与边界。当前源码、包一致性、本机 Chrome 及评分见 [R2.4.2 本机验收](LOCAL-ACCEPTANCE-R2.4.2.zh-CN.md)。旧运行 `41042514274` 仍为 FAIL；当前 main 已由其他对话晋升 App 1.6.4，本轮不重复发包。公网 HTTP 仍 BLOCKED。

## 原始需求（不要漂移）
ScrapyJS 是 OpenDesk Browser 的独立扩展产品。用户在当前已授权网页采集 DOM；对受审目标进行最多 1–3 页静态 HTML/JSON 试采、配置安全 Header、真实提取字段、查看和导出结果。电脑 HTTP 是可选底层能力；不将产品迁入 Desktop 自动化框架，不建设第二套 UI / 存储 / HTTP Runtime。

## A / B / C 结论
- **A Browser 优先，但生产静态 GET 目前 BLOCKED**：`browser.network.request` 经 Host 提供 GET、有限 Header、`credentials:omit`、`redirect:manual`、Abort/超时和流式读体。然而浏览器 UI 每次请求需可信点击确认，Side Panel 网络正文上限 8,192 字节、IPC 结果信封上限 12,000 字节；当前 Host 不能证明 DNS 每条结果和实际连接 peer IP 的公网安全。R2.2 的 browser-tab 合同不允许以当前导航声称 Header 可控。
- **B Desktop 可选且尚未联通**：Desktop `master` 已有 `examples/scrapyjs-desktop/` 可信本机 `http.download()` 示例，不是已经通过验证的 Browser→Desktop 交接；也没有对外公开 DNS/peer IP 的可信证明。原样保留，不作为安装前提。
- **C 新本机服务不建设**：没有充分证据证明需要重复开发 Node/Go HTTP Runtime。

## 本轮交付（source-only，不能冒充可用产品）
- `adapters/static-http-trial.mjs`：使用原 Browser `contracts/execution-v1.mjs` 校验完整 Recipe/Plan/Profile/Node，复算 Recipe SHA，强制 1–3 页、公开 HTTPS、单 Origin、GET 宿主合同、零重定向、超时/字节/行限制。将可信 Host 下载的 HTML 解析成真实 CSS 字段，合并记录、SHA256，要求可信存储独立读回的记录哈希与正式 RunReceipt 精确一致；Stop 发 AbortSignal，但不伪造宿主已退休。
- `legacyStaticFields`：仅旧 itemConfig CSS 字段/文本/属性子集；嵌套/XPath 等旧规则保留在 DOM 旧模式，新静态模式遇到不支持的规则明确拒绝。正式 `run()` 另外拒绝没有进入 v1 Recipe SHA 的 `listContainer/listItem`（`E_UNSIGNED_SELECTOR`）；现有列表解析功能只能用于独立解析预检，不能伪称已获完整 v1 签名。
- `extractStaticJson`：对真实 JSON 安全属性路径提取值，不编造字段。**v1 的 extraction kind 仅 dom/static-html，字段仅 CSS；JSON 映射无法写成合法 v1 Recipe。因此 JSON 仅是可复用独立解析函数，不生成虚假的正式 RunReceipt，需先做向后兼容合同扩展。**
- `tests/static-http-trial.test.mjs`：使用测试 Host（非 Chrome 或 Desktop Native）验证字段、SHA、拒绝越权/4页/重定向/未签名选择器/重复启动、超时/响应超限、Stop、真正读回数据一致性。与现有测试互补，不创建第二套业务 Schema。
- 旧 `src/App.jsx` / `src/app-model.js` / `controller/main.js` / `tool.config.json` / `contracts/` 未改；当前 UI 不显示假的“已可运行 HTTP”能力。

## 必须补齐的可信执行缺口（R2.4.2）
1. 可信 Host `admit()`：从已安装包和存储独立读出合法的身份、Recipe SHA、Origin、用户真实权限及节点已实测能力；客户端的 `approved:true`、`approvalRef`、`NodeCapabilities` 只是声明，不能直接授权。
2. 可信 Host `get()`：DNS A/AAAA/CNAME 全链 + 最终连接 peer IP 检查，包括 IPv4-mapped IPv6、重绑定、metadata/私网。每次重定向拒绝或独立检查，强制流式字节、Deadline、Stop，不上传浏览器 Cookie。
3. `persistAndReadback()`：Host 按受审身份写结果，然后重新读取实际记录，返回记录与 v1 RunReceipt，检查 SHA256、预算、运行身份、取消/退休。
4. 现有 Browser 网络操作每次要求可信点击；要实现 1–3 页一次审阅，需评审现有受审 Task/Host 批量执行授权路径，禁止移除现有点击以“改进 UX”。
5. Browser Tool 的网络正文 8,192 字节 / IPC 信封 12,000 字节 ≠ 通用网络服务 256 KiB；不要全局放宽 SDK。必须在可信 Host 内做字段提取和限制后投影，或以受审结果存储独立读取。
6. 正式 JSON 映射需要单一合同的兼容升级，不复写 `execution-v1.schema.json` 人工版本，也不拿 CSS 当 JSONPath。
7. 上述安全能力落实、通过源码/测试/真实 Mac Chrome 后，才将执行位置以最少的选项添加进现有 React；Desktop 仍然仅按需出现。

## 测试证据约束
代码存在只算 SOURCE_COMPLETE；模拟 Host 不算 NODE/CHROMIUM/REAL_BROWSER 之外的任何网络证明。未运行时记 NOT_TESTED，生产公网静态 HTTP 标记 BLOCKED；不以 Cookie/Header 用户配置值声称服务器已观察到相同值。

Browser 仓库根目录建议运行：
```sh
node --test examples/sidebar-tools/scrapyjs/tests/execution-v1.test.mjs
node --test examples/sidebar-tools/scrapyjs/tests/static-http-trial.test.mjs
node --test examples/sidebar-tools/scrapyjs/tests/app-model.test.mjs
node --test examples/sidebar-tools/scrapyjs/tests/extraction-contract.test.mjs
```

## GitHub Actions 真实 Node 证据（不是网络真机验收）
- Browser commit `119f082812b2133d5643f7793f4859f77ec266c7` 对应 workflow run `41042514274`：ScrapyJS App CI Node 测试 **190 项、通过 189 项、失败 1 项**；本轮新增 `static-http-trial.test.mjs` 13 项全部通过。链接：https://github.com/shopable-ai/opendesk-browser/actions/runs/41042514274
- 唯一失败：原有 `examples/sidebar-tools/scrapyjs/tests/package.test.mjs` 的 `E_TOOL_BUILD: project installable package differs from current source`，因此 ScrapyJS 整体 App CI **FAIL**、后续 Chromium 和 Mac 原生验收尚未获得证据。不要写成整套 NODE_PASS。
- **已确认该发行包失败在本轮之前存在**：更早的 Browser commit `82f69d6488d1b3c374de5d63528791fd4901168b`，workflow `41041483759` 的同一个 scrapyjs package 测试已失败（177 项、通过 176、失败 1，错误相同）。基线链接：https://github.com/shopable-ai/opendesk-browser/actions/runs/41041483759
- 不因新静态模块尚未接线就擅自重发旧 App 包、改变安装身份、降低版本检查或覆盖正式包。旧发行包差异由 R2.4.2 本机验明原因，按正式候选构建、测试、版本递增与推广流程处理。
- 分层状态：`SOURCE_COMPLETE`（新增纯业务内核），`NODE_COMPONENT_PASS`（本轮新增 13/13），`APP_CI_FAIL_PREEXISTING_PACKAGE`，`CHROMIUM_PASS=NOT_TESTED`（HTTP），`REAL_BROWSER_PASS=NOT_TESTED`，`REAL_DESKTOP_HTTP_PASS=NOT_TESTED`，`MAC_DESKTOP_PASS=NOT_TESTED`，`PUBLIC_HTTP_PRODUCTION=BLOCKED`。
