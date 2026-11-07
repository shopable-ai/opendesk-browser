# Browser Fingerprint R1.9 · SDK 能力审计与业务准入

> **历史记录说明（2026-10-29 后续更新）**：以下为本轮开始时的只读审计，保留当时的 BLOCKED 结论及原始来源。随后用户明确授权直接完成，并把阶段收缩为核心检测与 UI；已实施此处提出的最小只读 SDK，真实 Mac CFT 核心链已 PASS。当前状态以 [核心开发结果](r19-core-development.zh-CN.md) 为准。保存、历史、对比、导出及完整正式验收延期；下列历史评分不作为当前核心评分。

日期：2026-10-29（Asia/Shanghai）。结论：**BLOCKED_SDK_NOT_APPROVED；不具备 READY_FOR_LOCAL_CODEX 条件。**

## 产品目标与当前断点

唯一业务目录为 `examples/sidebar-tools/browser-fingerprint/`。最终交付是可独立安装的 A 只读应用：真实目标网页环境检测 → 字段及来源验证 → 保存快照 → 历史管理 → A/B 差异比较 → JSON 报告。B 修改/伪装、C 代理/IP/Profile/多账号均不在范围内。

下一条尚未完成的用户操作是“检测当前网页并取得六项真实环境字段”。正式 SDK 无该能力，当前只能返回页面标题、地址和文档引用；本轮在这个直接阻断处完成能力诊断，没有用离线预览或 Side Panel 的 navigator 代替真实操作。

P0 审计完成，但 SDK 正式批准与实现尚未完成。按本轮用户明确条件，P1 业务接线、P2 新业务自动化和 P3 正式验收均不得提前视为完成；本轮仅修改说明和本报告。

## main 与继承证据

- 开始本地分支 `main`，HEAD `7419a4b28ba300c219b04b7be1f6b09828eb8dca`；并行 owner 随后推进到本次身份核对时的 `90957ba5973468d218a12f6c8b7511488e5a99be`，这是观察值，不是冻结候选。
- 实际执行 `git ls-remote origin refs/heads/main` 与 `git fetch origin main`，取回远端 `1d1cdcd174eb8aeb087efb44e34efa3132d47e7e`。不再沿用旧 `b41a1606` 作为最新远端。
- 身份核对时本地相对 origin/main 为 21 个独有提交、远端 4 个独有提交。共享工作区另有 Cookie Editor、scrapyjs 和 provenance 等并行改动。本轮不合并这些跨任务差异、不切分支、不创建 worktree、不提交/推送他人文件，不能声称整个本地树已同步远端。
- 下表的工作树、当时 HEAD、origin/main 三者 blob 完全一致，足以复用本次 SDK 缺口结论；`src/ui/sidebar-tools.js` 整文件存在其他任务差异，已单独核对其 getContext 路径，未发现环境采集分支。

| 文件（仓库相对路径） | 实读 Git blob |
| --- | --- |
| docs/api/browser-sdk-interface-matrix.json | 15ccedd92fc33d550fe79ff9559425f98c0c9df3 |
| src/framework/sdk/browser-contract.js | 341d2bad3bfa8f4cc007e7eef064617ec18f3ac0 |
| src/framework/sdk/browser-schemas.js | f4f919b7ad7ff1013d4342b3fdfafec5b1dd745c |
| src/framework/sdk/browser.js | fd950e15e01427a48127336eb6fec24b9566707c |
| src/framework/sdk/browser-direct.generated.js | 16c3ecafdf24f6539d83392a4b4157c994f7642f |
| src/framework/sdk/browser-services.generated.js | a05758747435b798b6e3170ad6112976ccdbf005 |
| src/platform/chrome/context-menus.js | 8c4a5537bfcceb9b5f23279d2a512f3a13494893 |
| src/platform/chrome/current-page-refs.js | 11559f94f2c20f6d2b0c38f000040ef54bec005d |
| manifest.json | 3d7fef384af73a31361a24d37c783e684bdd3b12 |
| examples/sidebar-tools/browser-fingerprint/src/adapter.js | 8fbfed5cf38f22ff9627bd9948b01368c4e00c02 |
| examples/sidebar-tools/browser-fingerprint/src/model.js | 7de431a6e233376b6be5ca4e928c7047eaf0d1f3 |
| examples/sidebar-tools/browser-fingerprint/src/history.js | e866566156181b9f85016f456a85a2189689325d |
| examples/sidebar-tools/browser-fingerprint/src/App.jsx | 0238a0a9c7d9666070e394f9d961c6987331a90d |

业务 src、tests、package.json、tool.config.json、Vite 配置及 preview 对 `c5190198` 的定向 diff 为空。本轮复用原 React、单 Root、模型、历史 CAS、快照、比较、报告、构建器和预览，不创建第二份实现。

[R1.8 最终证据](r18-build-preview-and-sdk-status.zh-CN.md)记录指定提交 `c5190198bd3c3b6df5aabcc304449bcf5fa913d1` 的 [CI 40561525645](https://github.com/shopable-ai/opendesk-browser/actions/runs/40561525645)：Node 55/55（本应用 13 条）、正式 React 构建、同源 HTML、Linux CFT 模拟 Host 交互 PASS。本轮核对仓库中的最终回执及源码同一性，没有重新查询 CI、下载 artifact 或复跑这些测试。旧 PASS 不等于当前整仓构建、真实采集或 Mac 原生 PASS。

## P0：正式能力审计及直接诊断

权威入口：[SDK 执行手册](../../../../docs/api/browser-sdk-execution-manual.zh-CN.md)、[批准接口矩阵](../../../../docs/api/browser-sdk-interface-matrix.json)、[公开 Browser SDK](../../../../docs/api/browser-sdk.zh-CN.md)、[Sidebar Tool 合同](../../../../docs/api/sidebar-tools.zh-CN.md)。运行时以原 Registry / Schema / Host 为准。

1. `browser-contract.js` 的 `BROWSER_OPERATIONS` 含 77 项；`browser.page` 仅 `browser.page.getContext` 和 `browser.page.getSelection`。生成的 DIRECT / TRUSTED_SERVICE 表也未带入环境采集方法。
2. `browser-schemas.js` 的 getContext 输出是严格对象：`status/title/url/message/tabRef/documentRef`，`additionalProperties:false`；六个环境字段都不在该输出里。
3. `browser.js` 从该唯一 Registry 生成公开 Facade，不存在隐藏的正式环境方法。
4. `src/ui/sidebar-tools.js` 的 getContext 读取 currentPageTarget、revalidate 并交给可信 Host；`context-menus.js` 经安装摘要/代际、真实 Host sender 与 owner 校验签发引用。`current-page-refs.js` 验证 active tab、window、顶层 documentId 和 HTTP(S) URL，不采集页面 JS 环境。
5. 批准矩阵的 approvedOperations 也只有上述两个 page 方法，没有 `readEnvironment/getEnvironment` 或六字段采集操作。Chrome 原生目录发现、Manifest 已有权限或其他 Controller 能力都不是普通 Sidebar Tool 的正式授权。

为判断“检测当前网页”是否能继续，本轮执行一次无 RPC、无网页、无权限修改的 Node ESM 能力诊断，直接 import 现有 Registry / Schema / Facade，结果如下。它证明 SDK 缺口与保守拒绝，不是原生用户操作 PASS：

```json
{
  "registryOperationCount": 77,
  "pageOperations": ["browser.page.getContext", "browser.page.getSelection"],
  "environmentRegistry": null,
  "environmentSchema": null,
  "environmentFacadeType": "undefined",
  "missingOperationStatus": {
    "operation": "browser.page.readEnvironment",
    "implementation": "UNSUPPORTED",
    "exposure": "not-exposed",
    "callableNow": false,
    "reasonCode": "E_SERVICE_UNSUPPORTED"
  },
  "normalizeAttemptError": "E_SERVICE_UNSUPPORTED"
}
```

`UNSUPPORTED` 是当前未注册名称的运行时结果，不代表 Chrome 永久无法实现。这里已证明公开 SDK 缺口，不再是 `SDK_GAP_NOT_PROVEN`；其审批与接线状态仍为 BLOCKED。

已发现并只读核对 [独立 Mac 环境实验](../../../../tests/fixtures/browser-environment-p0/README.md)及其 [报告](../../../../tests/fixtures/browser-environment-p0/REPORT.md)。该 fixture 明确不是正式 OpenDesk/Sidebar Tool，包含 debugger、MAIN 注入、HTTP echo 和高熵探测，并将正式 Authority 集成留待后续。本应用不继承其原生 PASS，不直接复制其 collector，不把该实验当作 SDK 批准，更不恢复 B/C 开发。

## 最小公共 API 与安全审批提案（未批准、未实现）

沿用 [R1.6 原提案](r16-incremental-and-sdk-gap.zh-CN.md)，只收紧必要合同，不创立第二套架构或授权入口。下列名称、capability、限额与错误映射均是待平台产品/安全 owner 审定的候选，当前工具不得调用或声明为已支持。

候选统一入口：`OpenDeskSDK.browser.page.readEnvironment({tabRef, documentRef})`。两项引用均必填，来自当前工具实例的 getContext；固定读取六字段，不接受 URL、原生 tabId、脚本/函数、选择器、执行世界或任意字段名。建议独立 capability `browser.page.environment.read`，不从仅承诺标题/地址的 `currentPage.read` 静默扩权。

| 字段 | 目标顶层网页读取位置 | 建议值范围 |
| --- | --- | --- |
| userAgent | navigator.userAgent | 字符串，UTF-8 最多 1024 字节 |
| languages | navigator.languages | 最多 16 项，每项最多 64 字节 |
| timeZone | Intl.DateTimeFormat().resolvedOptions().timeZone | 字符串，最多 128 字节 |
| viewport | window.innerWidth / innerHeight | 对象 width/height；有限非负数，不以 0 判断缺失 |
| screen | window.screen.width / height | 对象 width/height；有限非负数；不额外读取屏幕定位等字段 |
| devicePixelRatio | window.devicePixelRatio | 有限正数，保留小数，不误用现有 integer schema |

输出固定包含六个字段记录及 `capturedAt`、原 `tabRef/documentRef`、origin 和收集器合同版本。字段记录使用严格 tagged union：`available` 才能有经过类型/长度校验的 value；`unavailable/unauthorized/unknown` 均为 null 并附有界 reasonCode，不能降级成空字符串、0、模拟值或默认真实值。SDK 本身未开放时，旧模型的 `not_exposed` 继续保留。

来源必须由可信固定 Host 补记，不能信任网页或工具自报：`kind=target-page-js`、`world=MAIN`、`frame=top` 及上述固定读取路径。真实 MAIN 值只能称“该网页世界在采集时可见的值”；网页可修改自身 navigator/Intl 或 getter，不能据此声称硬件、OS 或不可伪造身份。若只能取得 ISOLATED 值，必须明确标记该世界并保持 MAIN 业务未完成，不混用两种证据。

建议响应预算最多 8 KiB（含 JSON），Host 等待最多 3000 ms；超限拒绝，不静默截断成 available。固定 collector 不主动写 DOM、不发网络请求、不调用 UA-CH 高熵、Cookie、定位、IP、debugger、proxy 或任意动态代码。MAIN 中网站 getter 本身可能执行网站逻辑，Host 超时只能停止等待与丢弃迟到结果，不能承诺已中断网页 JS。

必须复用的安全链与审批事项：

1. **原安装与站点授权**：核对真实 extension sender、工具版本/packageHash/installEpoch、Host/iframe 实例、能力和精确 origin。安装时审阅新的环境数据能力；现有合法站点批准直接复用，缺失时仅由原可信 UI 的真实手势申请。getStatus 不弹窗，不要求每次到站重新确认；Chrome 网站访问仍独立检查。当前工具旧安装不能自动获得新能力。
2. **同一顶层文档**：复用 current-page-refs，将 opaque 引用解析为真实 tab/window/documentId。采集前、原生返回时及交付前再次核对 active tab、documentId、URL/origin、安装与站点 grant。固定执行必须锁定该 documentId，核对 Chrome 返回的 frame/document 身份，不能仅 target tabId 再相信响应内自报 ID。
3. **固定世界和受限实现**：如采用现有 scripting 原语，只能由已审的静态 Host/Driver 执行固定六字段 collector；沙箱得不到 chrome.scripting 或通用 evaluate。正式 Manifest 已有 scripting/proxy 也不等于本应用可用；本轮不改 Manifest，不新增 debugger/proxy，也不临时借 Controller/fixture 绕过审批。
4. **失效与异常**：导航（含同 URL 换文档）、Tab 切换/移窗/关闭、BFCache 退役、停用/卸载/升级、站点或 Chrome 撤权、Worker/Host 重启和超时，都必须使 pending 回执失效；无自动重放。绑定错误返回请求级拒绝，不把来自另一页的部分值标成 available。字段单项 getter 抛错/格式无效返回 unavailable/unknown；整次无合法授权直接拒绝，不交付旧值。错误沿现有 E_OWNER / E_TOOL_CHANGED / E_TOOL_DISABLED / E_SITE_GRANT_REQUIRED / E_CHROME_PERMISSION_REQUIRED / E_DOCUMENT_STALE / E_LIMIT 映射，超时码由原合同统一审定，不创造工具私有授权分支。
5. **持久化保护**：历史写入继续由原 storage Authority 检查安装与撤权，App 保存前使用绑定文档及授权的鲜读数，拒绝失效回执；写入开始前撤权必须拒绝。写入已完成后导航，只能保留属于原页面且在授权有效时取得的快照，不能重标为新页；已提交但回执未知时先读回，不自动重试。完整 URL/查询、原生 ID、opaque refs、授权 token 不写入快照/报告；可持久化有界 origin、采集时间、字段来源和不可用于授权的证据摘要。证据摘要不能当实时授权凭据。

公开能力必须由平台 owner 在唯一 [执行手册](../../../../docs/api/browser-sdk-execution-manual.zh-CN.md)与 [矩阵](../../../../docs/api/browser-sdk-interface-matrix.json)记录批准后实施：更新原 Registry/Schema、原 Facade 生成链和 `src/ui/sidebar-tools.js` / `src/platform/chrome/context-menus.js` 的原授权分发；复用 current-page-refs 和已有固定执行原语。若需要新增有界纯 collector，仍归原 chrome Driver 层，不建第二 Host/Authority。相关 capability admission、安装审阅和 generated declarations 仅按真实差异同步。这里是供审阅的最小变更范围，不是对这些平台文件的实施授权。

这个缺口不能在工具内部解决：opaque-origin iframe 无目标网页 JS 或原生权限，现有 getContext schema 不返回六字段。跨工具价值是 QA、网页兼容诊断和环境差异报告的相同只读白名单原语；不应把 browser-fingerprint ID 或本应用存储策略硬编码进公共 Host。

## 获批后的必要增量与完成标准

按同一正式源文件最小接线，不重做 UI：

- `src/adapter.js`：getContext → 绑定六字段采集 → 交付前复核；不读 Side Panel navigator/screen，不调用尚未批准方法。
- `src/model.js`：严格验证值、状态、来源、世界及同文档回执；当前模型会拒绝任何非空环境值，不能只改 adapter 或放宽为任意 JSON。PREVIEW 不能升级为 LIVE。
- `src/history.js`：保留 `fingerprint.a.history.v1` 原数据和 CAS/读回/容量/UNKNOWN 语义。新增可保存环境字段需要明确版本策略；只读识别旧 v1，不能为接受新值静默改写旧 schema 或清空旧历史。迁移方案获审后才可写新版本。
- `src/App.jsx`：现有单击检测/保存/复制/导出继续使用同一校验结果；目标或授权变化即弃用当前读数，操作回执不因切 Tab 丢失。
- 原 tests 内增量验证：六字段读取与来源、跨 Tab/document、站点拒绝、导航迟到回包、撤权/卸载拒写、跨会话读回、A/B 与 JSON 一致性；继承 R1.8 有效用例，不追加宽度/缩放或 B/C 矩阵。

新业务和受影响保护定向自动化通过后，构建同一正式 React 产物并生成同源预览，再保留真实目标网页→验证字段→保存→跨会话读回→比较/报告的证据。P3 六项准入全部满足后，才输出本地 Codex Mac Chrome 正式验收提示词；现在不提前生成或启动这份验收任务。

## 验证结果与质量计分

| 检查 | 结果 | 证明范围 |
| --- | --- | --- |
| 远端 main 查询、关键 SDK/blob 比较、R1.8 业务源码同一性 | PASS（本轮只读） | 相关源码事实，不证明整仓同步或原生运行 |
| Registry / Schema / Facade 与未登记调用拒绝 | PASS（本轮直接诊断） | 当前缺少公开采集能力，E_SERVICE_UNSUPPORTED 保留 |
| R1.8 Node 55/55、正式构建、同源 HTML、模拟 Host Chromium | PASS（历史继承） | c5190198 指定候选；未复跑，不提升为真实采集 |
| R1.9 SDK 批准、真实六字段与业务接线 | BLOCKED | 接口未批准/未注册；P1 不提前实施 |
| R1.9 新业务自动化及完整目标快照链 | BLOCKED | 无正式实现可测 |
| 当前整仓构建、Mac 安装、真实站点授权、OS 复制/落盘 | NOT_TESTED | 本轮无相应运行证据 |
| 本轮已执行检查中的断言失败 | 无 | 不代表 BLOCKED/NOT_TESTED 项通过 |

质量采用明确的**已验证证据完成度**计分，每维独立 0–100，未验证小项计 0；不是独立专家的产品质量认证，也不是以提案代替实现。维度内等分，综合只取六维算术平均：

| 维度 | 计分依据 | 分数 / 100 |
| --- | --- | --- |
| 原实现复用与范围控制 | 同目录、关键源码同一、保留 R1.8、未引入 B/C，4/4 | 100 |
| 正式采集 SDK 就绪 | 批准、Registry/Schema、Host/授权接线、真实可调用证据，0/4 | 0 |
| 目标网页采集真实性 | 六个字段在正式应用中的真实来源证据，0/6 | 0 |
| 六字段业务闭环 | 合法读数、来源验证、快照、跨会话历史、比较、报告的同链证据，0/6 | 0 |
| R1.9 增量自动化 | 本轮要求的八类新缺口覆盖，0/8；旧 55/55 单独保留 | 0 |
| 本地正式准入证据 | P3 的 SDK、接线、新旧核心自动化、正式 React 构建、同源预览、真实快照链；继承同源业务构建/预览 2/6 | 33.33 |

综合：`(100 + 0 + 0 + 0 + 0 + 100×2/6) / 6 = 22.22 / 100`。旧构建/预览只有继承分，不是当前整仓重新验证；任一硬门禁未满足就不能 READY，分数也不能绕过门禁。95 是目标，当前未达。

本轮没有业务代码、权限、Manifest、Host、工具版本、Catalog 或正式 JSON 变化；没有重跑产品测试、构建、安装或浏览器。文档定向核对中，11 个相对链接、差异/新文件空白检查和评分算术均 PASS。核心剩余工作依次是 SDK 正式批准与受限实现 → 真实数据接线及历史版本策略 → 对应自动化与真实链证据 → 再判断本地正式验收准入。
