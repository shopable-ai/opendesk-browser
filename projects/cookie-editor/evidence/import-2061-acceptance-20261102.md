# Cookie Editor 2.0.61 增量验收 · 2026-11-02

结论：**RELEASE_READY = BLOCKED**。本轮修复验收驱动，未改已通过的正式 React 导入实现。正式包保留 2.0.60，未晋升、未推送、未改日常 Chrome 或 Native 配对。

## 目标与接手状态

目标是接手 main 的 Bottom Sheet／一次确认导入修复，复用已有交互证据，补本地安全与真实 Chrome 验收，满足门禁后才晋升 2.0.61。

实际唯一 owner 仍是 `examples/sidebar-tools/cookie-editor/`，尚未迁到 `projects/`。起始本地及远端 main 为 `8b0d595c3b67da5719103ba12848cf62923b4c98`；用户给出的五个修复提交均已包含。接手已有原生 dialog、顶层挂载、单次确认、暂存文件、拖放、Controller 内部预检和隐藏文件选择点击修复；没有重新开发这些功能。其他工具及平台并行未提交改动完整保留。

## 分层结果

| 层级 | 状态 | 证据与边界 |
| --- | --- | --- |
| SOURCE_WIRED | PASS | 正式 App / CookieImport / Controller 接线已存在；本轮未改业务源码 |
| NODE_PASS | PASS（本轮相关范围） | 指定 Bottom Sheet 单项 1/1；导入 Controller／Intent／跨站／Domain 85/85；preview＋R106＋R5.24 52/52；审计入口追加修复后 R3.7 定向 4/4 |
| CHROMIUM_PASS | PASS（复用） | 原 10 项真实 React＋Mock SDK 导入交互，非真实 Host 写入 |
| BUILD_PASS | PASS | 原构建器生成正式 React 2.0.61，buildId `afe5efd6584688491dd817a9e94fbe12de49058090ab37920fda80ffaa336e2a` |
| PACKAGE_PASS | BLOCKED（晋升） | 规范候选生成及结构校验通过；正式包未晋升，未将候选结构检查充当正式包同源通过 |
| NATIVE_PASS | BLOCKED | 原安装器拒绝不匹配当前官方发行的候选；2.0.61 未安装，未执行真实 Cookie 写入／回读 |
| RELEASE_READY | BLOCKED | 4 项 SDK 发布检查仍失败，且缺当前正式候选原生证据 |

无源码/行为变化的历史 10 项测试不重跑。原证据：[import run 41348591321](https://github.com/shopable-ai/opendesk-browser/actions/runs/41348591321/job/124973651617)，源码 SHA `88370837d06ce1910ff3e29a7e437518f94524f6`，最终 `status=PASS, tests=10`。该 SHA 到接手 HEAD 的 Cookie Editor owner 目录无差异；本轮仅修改预览驱动/测试，正式 App、Controller、样式与 Mock 输入不变。复用范围包括 Bottom Sheet、短视口、搜索筛选滚动、脏编辑、单次确认、覆盖选项、文件选择/非法域、拖放暂存、未知结果防重放、减少动画。背景分页与其他未单独记录的原生细节不据此升级为 NATIVE_PASS。

## 发现与修复

| 问题 | 分类、根因 | 最小修复与结果 |
| --- | --- | --- |
| A/B wrapper 及后续视觉审计拒绝当前 HTML | 测试来源选择错误：LOCKED 合同 pin 为批准 blob `60201dc02813769bd4facf4f06ea87ce697d0620`，工作原型后来变成 `e45a81aea482158a5f2cd1bd80a2f20d88cb3a49` | wrapper 与审计复用 Git 中唯一批准 blob，并分别保留哈希核对；wrapper 再拒绝漂移输入。未改 HTML、pin 或合同；对象缺失失败关闭。R49/R56 checkout 增加全历史，避免浅克隆缺对象。独立复核发现审计遗漏后，先复现自检失败再修复 |
| 匿名邀请、导入图标断言过期 | 当前正式控件为「匿名链接」，当前 HTML 导入按钮已为可访问 dialog trigger | 核对真实单选绑定、正式/模拟分流、button/dialog/action 关联与 SVG 方向；保留无真实权限/网络断言 |
| 两项 R106 授权断言过期 | 仍要求完整授权排除 Values，且把合法的默认单站 scope 当作非法 | 按现行一次完整授权合同验证 Values/valueConsent；增强默认元数据不泄值、撤权重启不恢复、旧凭据不升级、单站不扩权及普通工具隔离 |
| 2.0.61 安装失败 | 环境/来源阻断，非 Bottom Sheet 缺陷：当前静态 Browser 内置官方发行仍为 2.0.60 | 原安装器返回 `E_PUBLISHER_CONFLICT`，保留旧包和数据；未放宽来源验证，未强行安装 |
| SDK 4 项失败 | 公共 Registry/Schema/批准矩阵/账本不一致 | 已复现并保留，归 Browser SDK 平台维护范围；具体并行对话负责人未确认，不擅自批准新接口 |

批准 blob 内容来自 `8412d9d0d183aac2a43feaee75c059f3543851ef`；pin 来源为 `4760286205155246e20cd08b01874ff8f1798220`，均为 main 祖先。R106 依据现行 `context-menus.js`、R5.24 合同测试及历史 `1f8a3a824`；没有修改生产授权实现。

## 本轮必要验证

以下均已执行，日志在仓库 `artifacts/cookie-import-2061-20261102/`。选择这些检查是为了确认本地交接完整、当前导入安全、修复后的来源/授权驱动，以及是否允许发布；未运行根目录全测或 WXT 构建。

```sh
node --test --test-name-pattern="formal Cookie import is a native bottom sheet" examples/sidebar-tools/cookie-editor/preview/react/preview.test.mjs
# PASS 1/1
node --test tests/environment/cookie-editor-react-controller.test.mjs tests/environment/cookie-editor-import-intent.test.mjs tests/environment/cookie-editor-cross-site-import.test.mjs tests/environment/cookie-editor-react-domain.test.mjs
# PASS 85/85；import-safety-node.log
node --test examples/sidebar-tools/cookie-editor/preview/react/preview.test.mjs tests/environment/browser-sdk-r106-cookie-contract-gaps.test.mjs tests/environment/cookie-editor-r524-grant.test.mjs
# PASS 52/52，无跳过；validation/final-targeted.log
node --test --test-name-pattern="R3.7" examples/sidebar-tools/cookie-editor/preview/react/preview.test.mjs
# 追加审计入口修复后 PASS 4/4；validation/audit-baseline.log；未重跑无关授权/业务测试
node --test tests/environment/browser-sdk-contract-compat.test.mjs tests/environment/browser-sdk-coverage.test.mjs tests/environment/browser-sdk-interface-matrix.test.mjs
# FAIL：17 PASS / 4 FAIL；sdk-gates.log
npm run build --prefix examples/sidebar-tools/cookie-editor
node scripts/build-sidebar-tool.mjs examples/sidebar-tools/cookie-editor --out artifacts/sidebar-tools/cookie-editor/candidate.opendesk-tool.json
# 构建及规范候选校验 PASS；未运行 --promote-from
```

原失败先复现，再修复；R106 修复前日志为 `r106-before.log`。修改过的 JS 文件语法与限定 diff 检查通过；Ruby 标准 YAML 解析及两个 workflow 的 `fetch-depth=0` 检查通过。独立只读审查复核来源与授权保护，发现的后续审计入口遗漏已修复，第二轮未发现新增安全/正确性问题；这不是完整发布审批。无新依赖。未执行 R49/R56 完整 Chromium 发布链；本地驱动修复不等于 GitHub CI 已变绿。

## 真实 Chrome 结果

使用独立 CFT **155.0.8059.39**、新建 Profile `artifacts/cookie-import-2061-20261102/profile-jY0OC4`，加载原路径 `dist/development`，实际扩展 ID `ccfcjegpkdlgbclopjmadlcjedelidmf`。这是**静态开发输出，serve 未连接**，不能当 production 候选。

通过真实点击打开侧栏，`chrome.runtime.getContexts()` 核验 `SIDE_PANEL`、`tabId=-1`、documentId `AB766FF43CFB7BF432528414D0365AC6`。打开正式安装旧版，标题为 2.0.60；测试页面为已有 `http://127.0.0.1:43111/demo-form.html`。关闭首次授权，没有允许 Cookie 管理。

通过「扩展 → 导入扩展」原文件选择与审阅链选择规范 2.0.61 候选，界面显示 `2.0.60 → 2.0.61`、权限未变化、保留应用数据；真实点击确认更新后得到 `E_PUBLISHER_CONFLICT`。再次打开，安装标题仍为 **2.0.60**。没有卸载、修改 provenance、授权存储或安装身份来绕过保护。

原生 JSON/Header/Netscape 导入、覆盖/不覆盖、成功列表刷新、拒绝后的真实写入计数、关闭/焦点、部分/失败/未知写入均为 **NOT_TESTED**（被安装阻断），不得以 Node/Mock PASS 替代。未写入任何 Cookie；Chrome 测试站点 Cookie 数为 0，无需删除测试 Cookie；日常 Profile 与真实 Cookie 未访问。专属 CFT 已正常关闭，Profile 与证据保留，没有仍占用的本轮浏览器进程。

原始脱敏记录：[native-evidence.json](../../../../artifacts/cookie-import-2061-20261102/native-evidence.json)；[实际来源拒绝截图](../../../../artifacts/cookie-import-2061-20261102/native-publisher-conflict.png)。截图是安装失败证据，不是 2.0.61 导入抽屉截图。

## CI 与发布

- [R56 当前失败 run 41422858642](https://github.com/shopable-ai/opendesk-browser/actions/runs/41422858642/job/125202343084)：三项预览驱动失败本地已修复；其后 Chromium/晋升没有当前新回执。
- [R49 run 41348591313](https://github.com/shopable-ai/opendesk-browser/actions/runs/41348591313/job/124973651543)：历史 SHA `88370837…` 的来源失败；本地 wrapper 和后续审计均改为批准来源，含实际执行审计自检的定向验证通过；完整 A/B 构建和远端重跑 **NOT_TESTED**。
- [R32 当前失败 run 41422858600](https://github.com/shopable-ai/opendesk-browser/actions/runs/41422858600/job/125202342868)：两项授权断言本地已修复；仍有以下四项 **FAIL**，没有豁免：
  1. `browser-sdk-contract-compat`：`browser.siteBudget.getStatus` 输出 Schema 类型未满足 object/array 合同。
  2. `browser-sdk-coverage`：账本 75 与 Registry 81 不一致。
  3. 同文件的可读矩阵缺 `page.readEnvironment`、三项 fingerprint、两项 siteBudget。
  4. `browser-sdk-interface-matrix`：三项 fingerprint、两项 siteBudget 未在批准运行时清单对齐。

候选 **2.0.61 / 349620 bytes / SHA-256 `81b903add94749ba913a94d012ad30e42389e333f24c87a5f375fbdbddd7e5ab`**。正式包仍 **2.0.60 / 339836 bytes / SHA-256 `0f7965d16e21f1715c4a85ddf3c23b74e33ca04a5ae64c4ba87adc626cf1147b`**，原字节未改。未晋升、未运行正式同源检查来伪造 PASS，未发布，不能建议用户安全更新到 2.0.61。

本轮提交范围只有两个 workflow、`build-a-b.mjs`、`visual-contract-check.mjs`、`preview.test.mjs`、`browser-sdk-r106-cookie-contract-gaps.test.mjs` 和本报告，作为同一本地 main 提交单元；提交身份以本报告所在提交核对，最终响应给出实际 SHA。因发布门禁未满足，**不推送**，所以没有本轮 GitHub commit 链接。既有 CI 链接如上；本地核对索引为 [ci-summary.json](../../../../artifacts/cookie-import-2061-20261102/ci-summary.json)，不是下载的原始远端日志。

## 六项评分

| 评分项（满分 100） | 当前正式验收分 |
| --- | --- |
| UI 视觉一致性 | NOT_SCORED |
| UX 操作效率 | NOT_SCORED |
| React 架构合理性 | NOT_SCORED |
| 可访问性 | NOT_SCORED |
| 可信导入安全性 | NOT_SCORED |
| 回归测试覆盖 | NOT_SCORED |

当前安装与源码候选不一致，没有 2.0.61 原生写入/回读证据；不能将旧截图、Mock 或静态审查伪装成完整候选六项独立专家评分。算术平均分 **未定义**，95/100 目标未获证实。

宽度/缩放专项、HTML 重设计、其他扩展修改及全仓重构均 **OUT_OF_SCOPE**。

## 下一轮仅处理剩余阻断的提示词

继续 `/Users/shopme/Documents/workspace/opendesk-browser` 的 main，先读本报告并只读核对并行修改、正式版本和资源。Cookie Editor owner 尚在 `examples/sidebar-tools/cookie-editor/`，已完成 2.0.61 React Bottom Sheet 与单次确认，不重写。复用 41348591321 的 10 项 Mock Chromium PASS 和本报告未变输入的 Node 结果，禁止全仓机械重测。

优先由 Browser SDK 平台 owner 处理 `sdk-gates.log` 的四项真实 Registry/Schema/批准矩阵/账本不一致，按唯一 SDK 执行手册核对已批准接口，不改数字、放宽类型或自动批准新能力制造 PASS。本轮来源/授权测试修复与本报告为同一提交单元，尚未推送；开始时核对 main 实际提交状态与 diff，不重复修复。

门禁解除后只跑受影响检查，完成 R49/R56 尚未取得的当前候选发布证据；再按唯一打包器晋升并核对同源。使用已有官方 Catalog 生成机制准备**隔离**且正式来源匹配的 Browser 候选，不能手改 JSON、哈希或 provenance 来绕过 `E_PUBLISHER_CONFLICT`，不能覆盖日常 dist/watcher 或修改 Native 配对。

随后新建专属 Chrome Profile，经原安装器审阅安装同源版本，验证虚构 JSON、Cookie Header、Netscape 的一次确认真实 Host 写入及 Chrome 精确回读、覆盖/跳过、拒绝/取消/Escape/遮罩/草稿焦点、部分/失败/未知不重试；只清理本轮 Cookie。以同一候选身份分别给 PACKAGE/NATIVE/RELEASE 结论，再据实评分。未完成不得宣称 RELEASE_READY。
