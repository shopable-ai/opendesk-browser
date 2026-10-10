# R3.1 独立质量审计与原始证据核验

状态：**正式签署，已支持范围质量 96/100。**

审核者：`entrypoints_review`。日期：2026-10-10。审核方式：只读审查共享 main 源码、差异、原始 CI 状态、完整原生 artifact 与逐文档快照；仅在仓库外撰写本报告。未修改产品、测试、原始结果或 Git，未启动浏览器。本报告独立读取原件，不以主执行者或其他审计者的总结替代核验。

## 1. 结论与适用范围

对本轮已经支持的 **Installed Page `page.dom`、Installed Task `page.automation`，以及普通 Controller／本地项目／Page Preview 的运行权限检查路径**，安装授权复用和缺权静默拒绝已形成可审查的实现与回归证据。真实 Chrome 已证明两个程序具有独立安装身份，启用的 A 在 20 个连续新文档中自动执行且权限申请为 0；Worker 重启后的第 21 文档、完整浏览器同 profile 重启后的第 22 文档继续复用原授权，旧回执保持不变，停用的 B 始终没有自动执行回执。

按先前确定的四维权重，最终为 **25 + 35 + 20 + 16 = 96/100**。这个数值评价上述已支持范围的功能、边界、回归和原生证据质量；**不代表全部程序权限能力完成 96%，也不代表完整框架 F3 或 ZIP 安装验收通过**。程序私有特权 HTTP／Cookie／宿主存储／Native Messaging 桥仍未实现，原生撤权恢复、扩权确认及对抗性异常排列仍未测，详见第 6 节。

未发现审查范围内仍开放的 P1／P2 实现问题。此前“恢复入口只在高级区域，缺权用户难以发现”的 P2 已通过五个主页签前的条件恢复行消除：仅真实网站权限缺失时显示，复用同一 `siteAccess.grant(event)`，忙碌时禁止点击，恢复不自动续跑。该结论来自源码及对应 UI 契约回归；本轮原生场景未实际撤权，不能把该修复写成原生恢复交互已验收。

## 2. 固定评分规则

| 维度 | 满分 | 本次得分 | 依据与边界 |
| --- | ---: | ---: | --- |
| 功能与恢复体验 | 25 | 25 | 普通运行静默检查，安装／升级复用，持久安装授权，明确恢复与扩权差异，恢复不重放；共享主视图恢复行已修复可发现性问题。 |
| 安全设计与组件边界 | 35 | 35 | 安装身份及代次、当前授权／实际目标、撤销派发与结果交付检查、卸载重装 ABA、跨程序隔离、固定源码与依赖、USER_SCRIPT、未知效果和停止保护；程序不能继承未获授的宿主能力。此栏评价源码与组件证据，不等同完整原生安全认证。 |
| 回归与交付门槛 | 20 | 20 | 当前授权定向、完整 environment gate、check、双构建、verify、双 ZIP 字节核对均通过；保留原预算，记录真实输入／包／CI 身份，未以 cleanup 或测试数量充当功能完成度。 |
| 真实 Chrome 证据 | 20 | 16 | 安装后 20 个自动执行文档零 request 7 分；独立安装及 B 停用 3 分；真实 Worker 重启恢复 3 分；完整浏览器同 profile 重启恢复 3 分。余下四类原生证明不足，扣 4 分。 |
| 合计 | 100 | **96** | 按固定维度评分，不按通过测试数或 CI 条数计算。 |

原生栏未授予的 4 分分别对应：真实撤销／拒绝／恢复循环；真实同范围升级／扩权确认；Controller／本地项目原生 20 次循环；恶意跨程序、旧回执和故意注入竞态的原生对抗性证明。它们是明确的证据缺口，不能由同类组件 PASS 或清理 PASS 补分。

历史草稿的 13e02a6 阶段评分为 93/100；当时完整浏览器恢复整轮未通过，3 分未授予。本次取得新的、独立固定的完整浏览器 PASS 后才增加这 3 分，不回改旧候选原始 FAIL。

## 3. 最终候选及原生原件身份

| 项目 | 已核验值 |
| --- | --- |
| native sourceCommit | `992f11732657171d9691d99a6b114106c0b7782f` |
| 原始 CI | [run 38042717294](https://github.com/shopable-ai/opendesk-browser/actions/runs/38042717294) |
| 原生 job | [114186007520](https://github.com/shopable-ai/opendesk-browser/actions/runs/38042717294/job/114186007520) |
| 原始 artifact | [11665844192](https://github.com/shopable-ai/opendesk-browser/actions/runs/38042717294/artifacts/11665844192) |
| artifact ZIP SHA-256 | `e3eba2fee811ffd8aadc0b7cd9e5c55146270e7e9df6ce81360614fc3d24b47d` |
| artifact 字节数／原件数 | 182402 bytes／40 个文件 |
| Chrome | macOS Chrome for Testing `155.0.8059.39` |
| 真实开发包 packageHash | `f7791357fce94f7d96870eb4a6c74d805de35433642cc00baf5fcd52429e6aa4` |
| 生产包 packageHash | `3d97f5294b66456b32c35002636f98fbff040a4620c37653bf014fb94989520c` |
| 复核时 main HEAD | `dce8f750c14ff2ead14cb5df561ce3b29842771c`；相对原生候选新增两份并行文档，179 个构建输入逐字节相同。主执行者当时还有本轮文档／证据归档差异，未冒充已被 CI 测试的新提交。 |

独立重算下载 ZIP 摘要，与原始 GitHub API 的 digest、size、head_sha 一致；逐个读取 40 个归档成员，与解压原件逐字节一致。核对 `acceptance.package === build-development.report`，按既定 JSON 清单配方重算 45 个开发文件的 packageHash，同时核对最终 Native Agent job 中生产与开发两份独立构建报告的清单指纹。

构建回执的 **179 个 sourceInputs** 均与 Git 的固定 992f117 内容的长度／SHA-256 相符；构建中漂移为空，当前 main 工作目录中的这些输入也相同。另核对四个 driver／生命周期文件与固定 Git 内容和当前文件：

| 输入 | SHA-256 |
| --- | --- |
| `tests/framework/install-once-permissions-native.mjs` | `fcdc010a81b2919a4e509432e900f69118d0ac5a355bf2bddfb0ee8ef180f9b8` |
| `tests/framework/cft-isolated-launcher.py` | `f7cdb497aa2ea988dcd746241f81ef67b0697bfbbc02c81dc1a4ee211553083b` |
| `tests/framework/k5-sdk-native-restart.py` | `67f53c04e14a0558ebf5bae98ce7e48362c20c102c52c5a1b35e3636d548c499` |
| `tests/framework/sidebar-native-session.mjs` | `ff56e4c6753c7df6e702fce9bd52e9ed0dac52e09803a51405e2ca51da2c64df` |

这里对编译包独立重算的是**原始清单指纹**。native artifact 包含证据与构建回执，没有包含 45 个编译产物；本审核没有声称重新读取 CI 机器的全部编译字节或另行安装 ZIP。driver 中对实际运行包前后字节的检查仍然存在，CI 的构建／ZIP 验证另有日志。

### 逐项原生交叉核验

1. **正式安装及来源。** 读取所有 `native-input`、`installed-fixture` 事件与两份安装记录。57 个产品输入事件均 `isTrusted=true`，两次 Install 点击前已检查 UI 展示 `*://*/*` 与程序不继承扩展／其他程序／网页 SDK 能力的文案。独立重构 fixture 的两段普通 JS 字节并核对 sourceHash。A/B 的 installationId、nativeId 均不同，保存／验证源码保持原样，安装没有重放已有文档。
2. **20 次自动执行。** 逐个读取 `document-01.json` 至 `document-20.json`，每个文件的 number、receipt、实际顶层 frame/documentId／URL、固定 sourceHash／manifestHash／installationId／grantGeneration 相符，状态为 completed。第 n 个快照恰含 n 个 A 的完成回执，前序回执的全部留存字段保持相同，每次仅新增一个不同文档的回执。B 始终 disabled，实际 Chrome 注册集合仅含 A。不是循环读取同一份持久结果充作 20 次执行。
3. **Worker 重启。** 直接读取 `workerLifecycle`、`workerContexts` 及 `events.jsonl`：09:50:20.644 stopped，09:50:20.729 实际目标缺席，09:50:20.765 running。Chrome 复用了 targetId，但 execution context uniqueId 从 `8670625294535051810.-1397235139866599773` 变为 `4047726614516257832.6465250610628457333`，观察器身份也变化。安装和批准保持不变，旧 20 条回执未被修改，第 21 文档 `D7EBAD33C9A783F0D0908494B4AF174B` 成功；浏览器 session 仍为原值。
4. **完整浏览器重启。** `launcher.lifecycle.jsonl` 明确记录 PID 4393 先以 0 退出，再启动 PID 4666；profile 路径、device=16777228、inode=3531772、可执行文件和启动参数相同。`after-browser-restart.json` 与最终恢复快照一致，当前 `chrome.userScripts.getScripts()` 只注册 A，B 仍未注册；21 个旧回执逐字段相同。session 从 `a23a83e8-ee83-42ca-8b46-c51e5339fa05` 变为 `3622a1ac-7462-4475-b363-872f64e47dc4`，第 22 文档 `9D065E742E297C2882031BD0ED5C89C0` 以新 session 成功。22 个 documentId 和 22 个 receiptId 各自唯一，所有快照中的安装授权、权限和固定版本保持相同。
5. **请求观测。** 单独核对 `permission-observations.json`、acceptance 和即时事件，4 个观察上下文、51 个检查点的累计计数全部为 0；每个文档导航前后均有检查点，请求数组与观察错误数组为空。驱动只透传原 `permissions.request` 的参数／结果，并断言包装仍有效、身份相同、没有丢失事件；不伪造权限批准或直接写安装记录。启动至观察器附加前仍为 NOT_OBSERVED。
6. **资源清理。** 原始 cleanup 与 acceptance.cleanup 相同。两个 Chrome 子进程均 exited／returncode=0，launcher code=0，profile removed，residual 和 errors 均为空。清理是原生证据可靠性条件，不增计为第五个功能用例。

## 4. 回归、构建、CI 与复用边界

原始 API 映射读取自 `ci-final-workflows.json`，按三个不同 sourceCommit 分组保留。最终 992f117 实际触发 **7 条 workflow 全部 success：6 条产品 workflow，1 条 cleanup**。不能称为“7 条产品回归”，也不能把过去失败的原生运行隐藏掉。

| 验证 | 原始结果 | 原始链接／复用范围 |
| --- | --- | --- |
| 最终授权定向组件 | 233 tests／233 pass／0 fail／0 skip | [R3.1 原生 lane](https://github.com/shopable-ai/opendesk-browser/actions/runs/38042717294)，artifact 中 `components.log`。包含普通 Controller 与 Page Preview 各 20 次、Task 20 次、Installed Page 20 文档及撤销／恢复／升级／隔离／竞态组件；本地项目另有定向覆盖，不称作本地 20 次原生循环。 |
| 最终完整 environment | 627 tests／620 pass／0 fail／7 skip | [Native Agent job 114186007722](https://github.com/shopable-ai/opendesk-browser/actions/runs/38042717333/job/114186007722)。逐行读取最终 TAP 汇总，未将 skip 计作 pass。 |
| `npm run check` | PASS，检查 250 个源码／测试／构建文件 | 原生 artifact 的 `check.log` 与最终 [包 CI](https://github.com/shopable-ai/opendesk-browser/actions/runs/38042717315) 一致。 |
| production／development／verify／pack | PASS，双包 SHA 指纹相符 | [包 CI 38042717315](https://github.com/shopable-ai/opendesk-browser/actions/runs/38042717315) 及 [双构建 CI 38042717333](https://github.com/shopable-ai/opendesk-browser/actions/runs/38042717333)。生产 SW=327199 bytes，仍小于原 327680 bytes 上限；未调大预算。 |
| Site access | success | [38042717310](https://github.com/shopable-ai/opendesk-browser/actions/runs/38042717310)，992f117。 |
| Sidebar P0 | success | [38042717338](https://github.com/shopable-ai/opendesk-browser/actions/runs/38042717338)，992f117。 |
| R7 axiosx／fixture | success | [38042717291](https://github.com/shopable-ai/opendesk-browser/actions/runs/38042717291)，992f117；不因此授予普通脚本特权 HTTP。 |
| Native Page 来源与授权边界 | success | [38042604290](https://github.com/shopable-ai/opendesk-browser/actions/runs/38042604290)，789fa3a。已核 789→992 的 179 个产品构建输入完全一致，仅 driver 就绪等待变化；该组件证明可复用。 |
| SDK 授权／撤销 | success，限未变边界 | [38041934496](https://github.com/shopable-ai/opendesk-browser/actions/runs/38041934496)，13e02a6。后续默认规则未改 SDK／Broker／SDK UI 与这些边界测试；当前整包构建使用最终 CI，不借用旧包 hash。 |

233 项定向和 627 项完整 environment 存在重叠，**不相加**。早期本地 262 项与早期 230 项也保留各自身份，不归入最终 233 或充当新增覆盖。完整 environment 所属 workflow 的名称不代表这 627 项都是真实 Native Agent E2E。

最终包 CI 的原始输出明确记录 `ZIP_EXACT_DIST_BYTES=PASS`：production 30 files，ZIP SHA-256 `53cc5ab1906d674f2c0634e7fac43751002b1ceac1727594376500b76a63c260`；development 45 files，ZIP SHA-256 `9a01bf7c4034575e585db4e8d4bede9eb5d434a78c79eea22977326c3c9d6baa`。这是打包字节验证，不是 Chrome 从 ZIP 安装验收。

此前 a88919c 的错误 targetId 假设、13e02a6 的持久 registered 早于实际注册完成、789fa3a 的 Worker API 尚未就绪及该轮 cleanup 失败，均保留原 FAIL。最终 driver 等待真实 API 和当前注册，不删除原身份、持久回执、观察器或新文档断言。通过最终运行后才关闭相应证据缺口。

## 5. 实现、授权隔离与文档复核

本审核此前逐轮审查的产品实现，在最终 sourceInputs 中保持相同。关键判断如下：

- `permission-gate.js` 将静默 `contains` 与安装／恢复点击的 consent 分开。预读只计算缺少的条目，权限事件使缓存失效；有权时不调用 request，缺权的普通 Run 不触发新申请。
- `site-access.js` 使用 Chrome 实际状态，已有网站权时不因无关 Cookie／通知能力重复请求；主恢复行与原高级面板使用同一控制器和可信事件，没有新增权限库或自动重试执行。
- `script-editor.js`、`task-workbench.js` 和 `page-program-library.js` 保留原入口。Verify 是用户主动测试固定源码，运行时不借 Verify 申请权限。Install／Restore 核对选中候选、安装身份和版本／代次；停止、关闭、选择变化、迟到结果、禁用或卸载重装不能启用旧安装。
- `installed-programs.js`、Task 服务、既有 Authority／Broker 在原记录中绑定 installationId、generation、scope、状态及固定源码版本。运行创建的 RunAuthority 属于内部执行身份，不能表现为新增用户授权；不同程序不能借用另一程序的记录、旧 bootstrap、操作或回执。
- 已审查的撤销、导航、停用、旧回执、未知副作用保护和隔离仍在；未扩大 Manifest，没有 debugger 权限，没有以网页 SDK 安装替换脚本授权。
- 新合并 `92ddeeb` 的普通 JS／无 @match 默认 `*://*/*` 由安装 UI 明示。旧显式规则和已安装窄范围保持冻结，窄→广的升级仍需程序扩权确认；拥有全站 Chrome host 权限不等于任意程序自动拥有全站程序授权。相关宽范围拒绝／升级／撤销契约已有组件与独立安全审计，原生仅在一个 loopback origin 运行，不能声称跨域／HTTPS／所有端口／多 frame 全部已测。

只读复核最终四份功能文档与工作流文档，现已准确区分：R3/R2 实施前历史基线、普通 JS 新默认范围、五个主页签的共享恢复入口、独立 SDK 与程序权限、已支持能力与未实现桥、最终／历史证据身份、原生场景与组件证明。工作流保留所有失败原件和既有测试等级，没有把本轮通过写成完整 F3／ZIP 通过。未发现需在封存前再改的具体文档阻断。

## 6. 仍未交付的能力及原生验收缺口

1. **程序私有特权桥未实现。** Installed Page v1 为顶层、document_idle、USER_SCRIPT 的 `page.dom`；Installed Task v1 为 `page.automation` 和固定 siteOrigins。两者宿主 networkOrigins 为空。程序私有跨站 HTTP、浏览器 Cookie、宿主存储、Native Messaging 不在本轮已授能力中，必须安全拒绝借用 Controller／SDK／其他程序的权限。这不表示 DOM JS 被禁止访问已授权网页本身能访问的数据或网络。
2. **原生撤权与恢复尚缺。** 本轮没有实际操作 Chrome 网站撤销、拒绝提示和主动恢复的完整循环，也没有覆盖 User Scripts 关闭／恢复及晚到权限事件的全部排列。组件证明可复用，不能改为原生 PASS。
3. **原生升级与扩权尚缺。** 同范围升级不再申请 Chrome 权限、扩权差异确认已有组件合同；当前真实 Chrome 四案例没有执行升级或扩权。
4. **Controller／本地原生 20 循环尚缺。** 普通 Controller、Task、Page Preview 的组件 20 次零 request，与 Installed Page 的原生 20 文档必须分开表达。本地项目定向测试不等于本地 20 次原生执行。
5. **对抗性及运行中故障尚缺。** 原生 A/B 的独立身份及 B 停用证明真实隔离的一部分，没有故意发起跨程序 RPC、注入旧回执或多标签竞态。重启发生在已完成回执之后，未覆盖运行中强杀且副作用未知的所有状态。Page 停用不回滚既有效果，也不承诺立即清除任意监听器／计时器。
6. **已知 Native Task 兼容缺口。** Native `run.start` 直接传已安装 `task:` saved source 尚未传入安装快照，当前安全拒绝；未通过自动选择“最新安装”补身份。不据本轮结果宣称该入口已经完成 Installed Task Native E2E。
7. **观察与等级边界。** 观察器附加前启动窗口为 NOT_OBSERVED；本轮只访问一个合成来源；独立网页 SDK／工作流保留其原授权合同；完整框架 F3 和最终 ZIP 安装继续按各自合同验收。

这些条目保留在结论中。它们不应被包装成已交付能力，也不能由 96/100 的局部质量评分隐去。

## 7. 独立核验所读原件摘要与签署

原件读取目录为 `/workspace/scratch/eceef8694f0a/r31-evidence/ci-992f117/`，CI 映射位于其父目录。仓库封存的 `native-992f117.zip` 应与第 3 节 artifact SHA 完全相同。以下是本审核直接计算的关键原件 SHA-256：

| 原件 | SHA-256 |
| --- | --- |
| `acceptance.json` | `8cd417ff2e50b6a52145ac33d8cc31400ea1750ab7ad722b485f79f1b1b55a9a` |
| `permission-observations.json` | `2c06e5e7842c8e8b1c52e2609f6d29628137d3e206cac7bbec6134f6cd354d72` |
| `events.jsonl` | `fe8da3b4285a1486e9813504e1c7ccf6ce655edef41d77d3418407d2482374e4` |
| `build-development.json` | `c3fe4622c1cfd6c99602c92ca040c64eadd4628dea9a777622404392ad22e4b1` |
| `launcher.cleanup.json` | `b4ac2338547b3e209750c62bdf31b8da17c97f25118f2f42cb6454e59aca9d8a` |
| `native-agent-job.log` | `449b8ef79e049c3ab82eb2c34061e93f8a8218303b4e7b684964718fe84b87e0` |
| `package-job.log` | `5f69650b5561c58358d5e0b5f3b44450f3dbaae26b75e4ac899c74a2f5394997` |
| `ci-final-workflows.json` | `37711d05488396ac9ba1d32a506e141a36c5567fc3447e8554d69235b75d4864` |

**签署：`entrypoints_review`，2026-10-10。** 固定提交 992f117 的四类原生功能、对应原始 CI／组件／构建记录及上述源码边界已独立核验。按固定 rubric 正式授予已支持范围 96/100；四类原生缺口扣分与未实现能力声明同时有效。本签署是独立审核责任记录，不宣称密码学身份签名。未来仅文档／原件封存提交可复用本结论；权限、执行链、Manifest、来源或驱动／fixture 输入改变时，应重新核对受影响证据。
