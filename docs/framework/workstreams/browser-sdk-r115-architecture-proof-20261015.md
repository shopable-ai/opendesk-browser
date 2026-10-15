# Browser SDK R11.5 — 最小架构验证交接（2026-10-15）

状态：**PARTIAL，不得标记 ARCHITECTURE_PROVEN，也不得据此批量开放剩余 91 项**。本文件仅记录已执行源码、原始证据和唯一下一项工作；正式审批矩阵和运行时 Registry 均未改变。

## 已实际接线

- 首次提交 [2c178a7](https://github.com/shopable-ai/opendesk-browser/commit/2c178a792f453e325ac329ecbc64b3cb872ccb44)，反馈修复 [dcd0c52](https://github.com/shopable-ai/opendesk-browser/commit/dcd0c526310fd29ff804303e620c24f3988b546b)。
- `scripts/generate-browser-bindings.mjs` 仍从唯一的批准矩阵与 Chromium 精确签名派生 DIRECT 编译描述；新增 `deriveBrowserDeveloperSurface` / `syncBrowserDeveloperSurface`，复用**同一个** Binding Catalog 和运行时 Registry 投影。`scripts/browser-sdk-developer.mjs` 仅为构建期 TypeScript/Markdown 渲染器，不是 Registry、Host 或可安装 SDK。
- `node scripts/generate-browser-bindings.mjs --developer` 按已批准合同生成 `docs/api/browser-sdk.developer.generated.d.ts`、`docs/api/browser-sdk.developer.generated.md`；`--check-developer` 核验字节级漂移。**上述两种生成结果目前是按需生成，尚未作为独立源文件提交；CLI 和真正生成/校验的 CI 测试已经提交。**
- 编译期 `argumentAliases` 允许 **仅限批准 DIRECT、只读、Promise、同一 Native API、标量同类型** 的参数名差异；Chrome 目标不是工具输入。无正式映射/权限变更，改名案例只在合成夹具。
- 正式 DIRECT 样本：`browser.runtime.getPlatformInfo` / `browser.i18n.getAcceptLanguages` / `browser.i18n.detectLanguage`。正式 EXISTING_SERVICE 样本：`browser.storage.local.keys`，通过现有 `createApprovedBrowserBindings` + 自动 SDK Facade + 原 Host 同一授权模型。其 Legacy Schema/Registry **仍手工维护**，不能宣称已自动生成。
- 固定合同当前：72 approved / 70 public / 2 Host-only；原 91 项候选不变，未新增 Chrome permission、可调用项、Manifest 授权、原生驱动或第二 Host。

## 证据及阻塞

- [R5 CI 38716637889](https://github.com/shopable-ai/opendesk-browser/actions/runs/38716637889) 的 `sdk-host-contracts` 作业 **SUCCESS**；38/38 R11 + R11.5 子集 PASS，新增 4 项分别验证正式 DIRECT/服务类型文档、Existing Service 的授权前后拒绝/执行、只在测试内的参数转换，以及真实生成并再次检查 .d.ts/.md/漂移拒绝。其余 SDK/Bookmarks 定向子集 22/22、4/4、1/1、298/298 PASS；矩阵和覆盖检查 PASS。全程 Chrome 原生 **NOT_TESTED**。
- [R5 同一 CI](https://github.com/shopable-ai/opendesk-browser/actions/runs/38716637889) 的 `sdk-product-bundles` **FAIL**，根因是旁路 AdBlock 固定可信源码 `examples/sidebar-tools/adblock/trusted/host-controls.js` 与固定哈希不符；不得放宽安全构建门禁。
- [R13 同 SHA CI 38716637800](https://github.com/shopable-ai/opendesk-browser/actions/runs/38716637800) 的浏览器总合同样例 211/212 PASS，失败为旧 `R4.8 authored catalog includes default Cookie Editor and optional AI VIP Share UI` 断言；prod/dev 构建因同一 AdBlock 来源校验失败，Verify 因产物缺失失败。以上不是 SDK R11.5 类型生成测试失败，亦不记为构建通过。

## 前后工程工作量（仅计已证明的变化）

| 工作项 | 原机制 | R11.5 实际状态 |
| --- | --- | --- |
| 同名普通只读 DIRECT | R11.3 已有单一矩阵 → Runtime/Facade/Host，零逐方法 Wrapper/Host 分支 | 保留此收益；新增映射只需在原批准合同中表达差异，不开放新权限 |
| EXISTING_SERVICE | 审核一次 Driver/Host，Registry 和 Schema 仍手写 | 现有 Service 无新增 Host 分支；新增开发者 Type/Doc 自动生成，**手写 Registry/Schema 未消除** |
| API 文档及 TypeScript | 无同源可校验的完整正式输出 | 编译一次生成两种开发产物，独立回归能检查字节级漂移 |
| 包体积 | 不允许打包上游 Chromium 全量 Schema | 渲染器仅被 `scripts/` 引用；全包增量数值尚未因构建阻塞得到实测，不宣称零增加 |

**下一条唯一 SDK 架构任务：** 在现有已批准 `browser.storage.local.keys` 上做一次真正的 EXISTING_SERVICE 自动 Registry/Schema 派生替换，仍由既有可信 Host 绑定原 `executeBrowserToolStorage`；仅移除该方法在 `browser-contract.js` 与 `browser-schemas.js` 的重复手写定义，保留其严格参数与输出合同，源码及 CI 正反向对照无差异后才推广其他服务。此之前保持 PARTIAL、禁止候选接口批量扩充。独立 AdBlock pin 与 Cookie Editor 产品断言由各自 owner 处理，SDK 不得绕过。
