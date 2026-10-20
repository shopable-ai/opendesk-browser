# Web Markdown Clipper R1.7.5-LOCAL · Mac 实际验收

2026-10-21。**本地 production 候选的核心使用闭环通过，未发现 Clipper P0；纯已提交 main 的正式发布及所有维度 95+ 尚未宣称完成。**

1. **可以通过 Chrome 原生右键保存。** 在受控 Mac Chrome 中用真实鼠标选中指定中文，经原生菜单打开已安装 1.1.4，一次保存后在「我的摘录」打开，正文与 HTTPS 来源一致。
2. **正常完整退出后仍存在。** 同候选、同扩展 ID、同 Profile 的旧进程确认结束后，新进程逐字读回三条记录，删除的测试记录没有恢复；单独关闭侧栏再开也通过。
3. **旧版原位升级保留了数据和正文授权。** 实际验证链为可信历史 1.1.0 → 1.1.3 → 1.1.4；没有卸载重装。右键授权仍绑定旧版本，必须显式重新启用。直接单跳 1.1.0 → 1.1.4 未执行。
4. **搜索、编辑、复制、Markdown 下载与 JSON 备份通过。** 以实际 UI、pbpaste、磁盘文件解析和逐字段比对为准；普通复制、下载、鲜读备份单击完成。
5. **发现并修复颜色问题，保留原产品。** 1.1.4 仅给搜索 input 的 placeholder 使用既有 --sub，深色对比度由 3.2873 提高到 6.8815；浅色 4.8152。保留 HTML/CSS/JS、布局和全部业务。

## 候选、安装和环境身份

- 源码基线 main：**8f0be00492c5e3b4380b5c5bb0b3f46630d095b3**。本报告之后的文档提交不改变运行产物；最终 main / 推送 SHA 以交付答复和 Git 为准。
- 唯一正式工具包：`examples/sidebar-tools/web-markdown-clipper/web-markdown-clipper.opendesk-tool.json`，**1.1.4，41671 字节**。
- SHA-256：**ff33e3767e62918708b1c971a027b7a4398f4b654d7dc15e4f6eb05d82517fab**。
- Browser production packageHash：**c8a2c3d6d4d7808fd96e9015d384ff57d5965d2422ee340151d297e699dc95bd**。
- Mac Google Chrome for Testing **149.0.7827.55**，独立 `production-1056-profile`，扩展 ID **famffhhaondajiodmbimghoojodbbjbi**；没有使用或修改个人 Profile。
- 模式是 **production 静态验收包**，没有 dev serve 连接。冻结输出 `source-release-114/dist/production`；为保持 unpacked ID，实际加载保留在本任务原路径 `source-release-1056/dist/production`。原候选已另存；在自己的浏览器退出后更新。两目录 **106 个文件路径与 SHA 全部一致**，并核对当前安装 HTML/CSS/JS/version 与正式 JSON 相同。
- **明确的发布限制：**隔离快照以该 main 提交为基础，加一项另一个 Agent 尚未提交的 Prompt CSS 修复。文件 `examples/sidebar-tools/prompt-shortcuts/src/style.css`，SHA `6af327902ed3f8fe93b0569f4b689419a6d753eaba6fb74b76ed81fc71eab054`；见 `release-114-snapshot-inputs.json`。未暂存、修改或据为本任务提交。因此本次是有明确输入的本地 production 候选证明，**不是纯已提交 main 的正式 Browser 发布证明**。
- 标准 demo-form 由 HTTPS `https://localhost:43180/demo-form.html` 提供，仅替换样本为指定中文，真实处理自签名证书页面。公开 HTTPS 网站 **NOT_TESTED**。
- 原生右键证据来自 macOS CGEvent 鼠标拖选和 Accessibility Chrome 菜单；没有伪造 DOM contextmenu，没有直接写 Storage 构造结果。普通 UI 可用 Chrome Input，Storage 只读用于比较。
- 根 `dist/development`、个人 Profile、其他 Agent 的 15 个文件均保留。收尾正常关闭本任务 Chrome，确认 PID 89096 不存在，仅停止自己的 HTTPS fixture PID 83711；Profile 和证据保留。见 `final-owned-environment-cleanup.json`。

本地原始证据根目录（下表文件名均相对这里）：

`/Users/shopme/Documents/workspace/opendesk-browser/artifacts/web-markdown-clipper-r1.7.5-local-20261020-01a15a04`

命令日志在 `command-logs/`。Profile、证书私钥、依赖和整个快照不提交、不应整目录公开上传。

## 实际操作与安全保护

| 用户操作 / 保护 | 结果 | 证据和准确范围 |
|---|---|---|
| 指定中文 → 原生菜单 → 自动打开预填 | PASS | `production-114-native-selection.json`、`production-114-native-menu.txt`、`production-114-native-prefill.json`；菜单「OD · 保存选中内容到我的摘录」 |
| 一次保存 → 我的摘录 → 全文及来源 | PASS | `production-114-save-ui.json`、`production-114-exact-note-open.json`；全文为「这是一条用于 OpenDesk Browser 真实验收的中文摘录。」 |
| 保存后没有意外重复数据 | PASS（本次正常保存） / NODE PASS | 保存前两条，保存后三条，目标原文仅一条；`production-114-after-save-storage.json`。额外重复原生剪藏未可靠完成，不冒称完整重复操作压力流程通过；去重和 single-flight 有定向测试 |
| 关闭侧栏，再从 Chrome 打开 | PASS | `production-114-sidebar-reopen-receipt.json`、`production-114-sidebar-reopened-ui.json`；真实 AX 中侧栏关闭，再开读回三条全文 |
| 完全退出 Chrome，同 Profile 启动 | PASS | `production-114-final-restart-receipt.json`：正常 Browser.close 后旧 PID **88699** 消失，新 PID **89096**；重启前后整个保存快照一致，三条记录完整 |
| 搜索、打开、编辑、保存、复制 | PASS | `production-keyboard-search-input.json`、`production-keyboard-open.json`、`production-keyboard-edit-input.json`、`production-keyboard-save.json`、`production-keyboard-copy.json`；原生 Unicode/Tab/Return 操作。该阶段为 1.1.3，JS 与最终 1.1.4 逐字节相同，编辑内容最终重启仍在 |
| 系统剪贴板 | PASS | `production-114-pbpaste.txt`，66 UTF-8 字节，指定中文逐字一致 |
| Markdown 下载与 JSON 备份 | PASS | `production-114-final-file-readback.json`；实际下载 complete，Markdown 含中文与来源，JSON 三条与重启存储逐字段一致；没有只看成功提示 |
| 删除后重新打开/重启 | PASS | `production-before-delete-storage.json` 与最终 restart/UI；测试便签 ID `clip-mvh1wuqq-4dxtzlxvu5` 不存在，没有恢复 |
| Ticket 再次领取 | PASS（拒绝结果） / NODE PASS | `production-114-ticket-second-consume.json`、补录 `production-114-ticket-replay-context.json` 均 E_LAUNCH_EXPIRED；SDK 测试证明一次消费。缺少有效期内同一 Ticket/实例的完整原生追踪，不扩大结论 |
| 未授权站点不能读取正文 | PASS | `production-114-unauthorized-origin-context.json`：实际活动 tabId、document.URL 均为 `https://127.0.0.1:43180/demo-form.html`，真实点击「提取当前文章」被拒绝，source 空、length 0、error true；安装授权仅有 localhost |
| Origin/documentId、安装身份、撤权保护 | NODE PASS / 原生竞态 NOT_TESTED | 未变的 R11/R13/Bridge 安全门禁；不把 Node 模拟提升为真实导航/撤权竞态通过 |
| 正文 2048 UTF-8 字节、存储值 8192 字节 | NODE PASS | 界限内保存、超限拒绝且保留旧值；8192 为整个 clips 值，包含元数据 |
| 并发 CAS、配额不足、回执丢失、结果未知 | NODE PASS / Chrome 故障注入 NOT_TESTED | `notes.test.mjs`：冲突重读，旧编辑/删除不覆盖新值；已写但回执丢失读回确认；结果未知阻止继续写入，显式重新读取恢复；无故障自动重放 |
| 浅/深色与 360/400/440px | PASS（已拍列表视图） | `production-theme-360.json`、`400.json`、`440.json` 及对应截图；真实媒体查询确认，scroll===width、clipped=[] |
| 真实 200% 下 320 CSS px | PASS（已拍列表视图） | `production-114-320-200-readback.json`、`production-theme-320-200.json`；width 320、dpr 4、scroll 320。原生侧栏最小宽度约360 points，此项物理宽度640 points，不称320物理宽度 |
| 键盘、具名控件、ARIA live | PASS（上述已操作路径） | 原生键盘搜索/编辑/保存/复制；status 为 polite。完整备份纯键盘、OS 屏幕阅读器、所有失败/加载/禁用视觉状态 NOT_TESTED |

指定中文是本次实际选区及新记录，旧版编辑和新版编辑记录分别保留后缀「生产环境旧版编辑，升级后必须保留。」与「生产环境键盘编辑后仍完整。」。

## 可信历史包与原位升级

历史源码及其原打包器来自 **d7ac64f00010dadf3a0bf974e34cd6a3b526d1e1**，重建 1.1.0 历史包 SHA-256：
`15434da7d8d82a0d946a4553c7850c7e0d64518c4010b80e7d747f80b5d99fde`。
这是可信历史源码的重建包，不称为现存原发行二进制。

在真实文件导入与安装审阅 UI 安装 1.1.0，真实授权、剪藏、保存并编辑，再以同一安装器原位更新：

| 步骤 | 状态 | 证据 |
|---|---|---|
| 1.1.0 保存及编辑 | PASS | `production-110-install-review.json`、`production-110-native-prefill.json`、`production-110-edited-storage.json` |
| 取消升级、无效包拒绝后保留旧数据 | PASS（提交前） | `production-110-to113-cancel-review.json`、`production-110-invalid-upgrade-ui.json`；after-cancel / after-invalid 整个快照均与旧编辑相等 |
| 1.1.0 → 1.1.3 → 1.1.4，同工具 ID | PASS | `production-110-to113-review.json`、`production-113-to114-review.json`、`production-114-upgrade-comparison.json` |
| 旧编辑、正文站点授权保留 | PASS | 旧记录各字段与最终重启一致，clip-sites 相等 |
| 右键授权不自动扩给新版 | PASS | 旧 grant 记录仍在但绑定旧 version/hash；最终显式重新启用后才绑定 1.1.4 与正式 SHA；原生菜单继续可用 |
| 直接单跳 1.1.0 → 1.1.4 | NOT_TESTED | 不用两段实际链冒称单跳 |
| 升级提交中途进程中断、断电或回滚 | NOT_TESTED | 真实取消/无效包拒绝不能证明事务提交中途恢复 |

1.1.3 → 1.1.4 的 HTML/JS/capabilities 不变，仅 CSS +64 字节；没有添加数据迁移，没有覆盖旧发行版本。

## 剪贴板与磁盘实物

| 实际文件 | 字节 | SHA-256 |
|---|---:|---|
| `/Users/shopme/Downloads/localhost (3).md` | 128 | `2cfd70cf12ee7e6e9c48e47d7b612d68ccd3919c7e4bfb19a39b0da523b87264` |
| `/Users/shopme/Downloads/web-clipper-notes (3).json` | 1216 | `329209ef6e9571b9317611131935d9e88a443cff52aad09deebc5a6f18a37ec6` |
| 证据根 `production-114-pbpaste.txt` | 66 | `e499d815c6ca8f3ea9be4ccd16143216f39712277ed34bfb751eff5ebfdcf3a9` |

JSON 为 `opendesk.clipper-notes.backup.v1`，三条内容、顺序及字段均与最终存储一致。两份重启前后快照 SHA 同为 `adf003a88eca94881bd6d8ed0dbc062c5f5caee4e2006a4b24d9e4ed6120c1e7`。

## 实际故障、最小修复与复验

- **普通导出重复确认、鲜读备份离开同步手势。** 既有 cd7d532 修复同步导出；本轮 **606a0785e** 为鲜读备份增加现有 Bridge 的本地 `downloads.prepareText(factory)`：在真实点击中预留单次机会，鲜读后仍经唯一 SDK/Host、8 秒期限、实例/连接和撤权检查。失败不自动回放，未改成陈旧缓存。安全复核还将最后期限检查放到发送初始化之后、私有 portPost 之前。117 项组合门禁及最终真实单击落盘通过。
- **生产 SW 引入不应包含的 Prompt 业务，来源扫描失败。** **33b2f6b1a** 将业务站点判定留在原可信 Page 适配器，Host 用真实 tab/frame/document 定向探测并在队列里重核授权、导航和 consent；只更新修改源的固定 blob pin，未放宽来源白名单。77 项及真实 Page 联动通过；最终 production 来源验证通过。
- **共享工具宿主超过原工程预算。** 1,074,242 字节超过原 1024 KiB。按既有容量合同和独立审查，**973b89e8a** 将 production 有界预算调整到 **1056 KiB（1,081,344）**，development 1088 KiB 不变；它是工程预算，不是 Chrome 限制。保留全部功能、CSP、来源、权限、字节上限+1拒绝断言；22/22 门禁，独立 CLEAR，最终构建退出0。余量仅7102字节，后续增长需重新评估。
- **真实深色搜索占位文字对比度不足。** **8f0be0049** 发布 1.1.4，仅沿用 --sub 并固定 opacity:1，深色 3.2873→6.8815，浅色4.8152。原设计不变，浅深截图复验通过。更早1.1.2的深色错误红字2.717→8.842修复继续保留；不把历史截图冒称最终全状态实测。
- **验收驱动仍使用已移除的旧 UI，包负向夹具成为空替换。** 同提交只更新真实 React 工具列表/详情/导入选择器及现有安装审阅驱动；保留权限与内容断言。负向测试先断言替换目标唯一且确实变更，生产扫描器不变。最终9项包测试和 R22 Chrome 集成通过。
- **观察器错误没有伪装成产品缺陷。** 曾选错/选空中文、中间更换 unpacked 路径导致扩展 ID 不同、媒体 override 关闭后误判深色、200% 发给网页、剪贴板读取早于异步完成、关侧栏立即要求 CDP target 消失。均保留原证据，修正观察方法后只采用身份一致的有效结果。最后额外重复原生拖选仍未稳定，不保存错误选区，也不算 PASS。
- **记录错误已纠正。** 954 文件检查属于较早阶段，不是最终 build 嵌套；最终快照单独 check 为949文件、exit0。旧命令账本中的 provenance 路径拼错，原安全日志只证明9项包测试；已另行执行正确 `bundle-package-provenance.test.mjs` 的 production 用例，1/1、exit0。旧记录不删除。
- 另一个工具已有 Prompt tooltip 59px/64px 断言差异属于共享基线；没有为绿灯修改无关 UI 或删除断言。

## 构建与测试的实际退出码

`command-logs/results.json` 保留实际命令、cwd、退出码和历次失败。工具测试/plan/inspect/包晋升在仓库根目录；会写整个扩展输出的构建在冻结隔离快照 **source-release-114** 执行，守卫端口43179，没有覆盖日常输出。该 cwd 差异不能省略。

| 命令 / 验证 | 最终结果 | 日志 |
|---|---|---|
| `node scripts/build-sidebar-tool.mjs examples/sidebar-tools/web-markdown-clipper --check-project` | exit0，同源 | `clipper-114-check-project.log` |
| `shasum -a 256 examples/sidebar-tools/web-markdown-clipper/web-markdown-clipper.opendesk-tool.json` | exit0，正式 SHA 如上 | `clipper-114-sha.log` |
| `node --test …/tests/notes.test.mjs …/tests/ui.test.mjs tests/environment/sidebar-tools.test.mjs` | exit0，39/39（前两文件33项） | `clipper-114-gate.log` |
| `node --test tests/environment/browser-sdk-context-menu-r11.test.mjs tests/environment/browser-sdk-r13.test.mjs tests/environment/markdown-tools-r22.test.mjs` | exit0，46/46，保护源码未变 | `clipper-113-required-sdk-tests.log` |
| 工具 + SDK + Bridge 组合安全门禁 | exit0，117/117，源码未变 | `prepared-backup-security-fixed-gate.log` |
| analytics/source、真实 Page 适配器联动 | exit0，77/77 及1/1 | `final-analytics-source-gate-corrected.log`、`final-analytics-page-integration.log` |
| `APP_CI_SELECTED=web-markdown-clipper node scripts/app-ci.mjs plan` | exit0 | `clipper-114-required-plan.log` |
| `node scripts/app-ci.mjs inspect web-markdown-clipper` | exit0 | `clipper-114-required-inspect.log` |
| `node scripts/app-ci.mjs build web-markdown-clipper`（实际内含 `npm run build`） | exit0，最终production及candidate receipt生成 | `release-114-app-build.log` |
| `node scripts/app-ci.mjs node web-markdown-clipper` | exit0，113/113，CANDIDATE_SOURCE_IDENTICAL | `release-114-app-node.log` |
| `node scripts/app-ci.mjs browser web-markdown-clipper` | exit0，1/1，真实 Chrome | `release-114-app-browser.log` |
| `node scripts/app-ci.mjs native web-markdown-clipper` | exit0，1/1，真实 Chrome | `release-114-app-native.log` |
| `node --test --test-skip-pattern='^(explicit package modes\|development retains)' tests/environment/package.test.mjs` 对应生产包检查 | exit0，9/9；两个开发用例未执行，不计PASS | `release-114-production-security.log` |
| `OPENDESK_BUILD_EVIDENCE_DIR=…/release-114-build-evidence node --test --test-name-pattern='^production ' tests/environment/bundle-package-provenance.test.mjs` | exit0，1/1，最终产物来源绑定 | `release-114-production-provenance.log` |
| `npm run check`（最终隔离快照单独执行） | exit0，949文件 | `release-114-source-check.log` |

Browser / Native 两入口配置的是同一个 R22 Chrome 集成场景，不称作两种独立原生右键覆盖。R22 中部分选区用 DOM Range，真实 OS 右键另由上述 headed Chrome CGEvent/AX 证据证明。它们的 publicWebsite / clipboardSystem / downloadSave NOT_TESTED 保持原义，系统文件与剪贴板以独立实际读回补证。

正式工具包采用原打包器 **临时候选 →39项门禁 → --promote-from 原子晋升 → --check-project**；没有手改 JSON，没有覆盖1.1.1或旧版。正式 Browser ZIP/商店发布没有执行。

## GitHub CI 与正式发布边界

源码提交 **8f0be00492c5e3b4380b5c5bb0b3f46630d095b3** 已正常推送到 main。查询使用 GitHub Actions REST 的 head_sha 过滤，未用空 combined status 或仅 PR 的查询代替结果。原始记录在 `remote-ci-source-114.json`、`remote-ci-source-114-targeted-jobs.json` 及相应日志。

| 远程检查 | 实际观察 | 归属与处理 |
|---|---|---|
| [OpenDesk App CI](https://github.com/shopable-ai/opendesk-browser/actions/runs/39484469664) | discover exit1，后续 app/native 跳过 | 全项目发现遇到 `ai-vip-share` 的 `browser.cookies.write`，但缺少明确 app.ci.json；安全门禁正确拒绝。Clipper 的显式 plan / inspect 本地退出0。未跳过或放宽 Cookie 门禁 |
| [Markdown tools R22](https://github.com/shopable-ai/opendesk-browser/actions/runs/39484469197) | Verify tool packages and content authorization 步骤 exit1，10项中5通过/5失败；生产构建与原生步骤跳过 | `E_TOOL_STAGE: required project file missing: dist/tool.css`。源码 fixture 在读取单工具前会对整个官方目录执行 fingerprint，包含需预编译的其他 React 工具；干净 runner 未准备这些产物。这不是 Clipper 的 src/style.css 丢失；本地已准备产物的46项及最终113项通过，不外推远端成功 |
| [Package budgets and library boundaries](https://github.com/shopable-ai/opendesk-browser/actions/runs/39484469457) | 取证时 queued | 未判 PASS，后续结果看实际运行页 |

R22 的 `if: always()` 全仓库回归在上述失败后仍继续，故取证时运行总状态可能仍为 in_progress；不能把跳过的构建/原生步骤算通过，也不将无关全仓库断言都归因于 Clipper。日志片段 `remote-ci-source-114-markdown-excerpt.log` 与完整 discover 日志 `remote-ci-source-114-discover.log` 保留实际失败。

**正式发布剩余阻断：**无 overlay 的 main 产物未验证；共享 CI 的官方工具预编译前置和其他工具的 Cookie profile 未关闭。未修改这些工具的业务、未借此停用保护。文档收尾提交之后的最新 SHA 另行核对，不以旧源码 CI 冒称新 SHA 已通过。

## 本轮提交与文件归属

| 提交 | 修改文件与原因 |
|---|---|
| `606a0785ecd1593aa4659a82064eb1709e2d9e17` | Clipper `src/notes.js`、`tests/notes.test.mjs`、`tool.config.json`、`README.md`、唯一正式 JSON；`src/sidebar-tools/bridge.js`、`src/framework/sdk/browser.js`、两份 R13/Bridge 定向测试、`docs/api/browser-sdk.zh-CN.md`，解决实际鲜读备份手势缺口 |
| `33b2f6b1af524f396994ade30d5d53e455010367` | `src/analytics/collector.js`、`contract.js`、`host.js`，Prompt `trusted/page.js`，`scripts/bundle-provenance.mjs`，analytics-page-scope / analytics-r11-product / prompt-shortcuts-r14-page / prompt-shortcuts-r14 四份测试；修复真实来源边界失败 |
| `973b89e8ada4c5beef0ded46424cf3d87a5386a2` | `scripts/build-contract.mjs`、`check-source.mjs`、`verify-package.mjs`，`fixed-entries-audit.test.mjs`、`sw-budget-policy.test.mjs`，R23与R131两份文档；落实独立审核的有限工程容量 |
| `8f0be00492c5e3b4380b5c5bb0b3f46630d095b3` | Clipper `src/style.css`、版本/README/唯一JSON；`tests/environment/package.test.mjs`、`tests/framework/markdown-tools-native-r22.test.mjs`；真实颜色修复及现有失效验收驱动修正 |
| `c035e9c287332e4672258c8b6d5b5e3e25661753` 及本报告收尾提交 | 仅验收文档；不改变已验证产物 |

只有 main 写入，没有创建分支/worktree/PR，没有强推/reset/clean。其他 Agent 15 个文件与保护基线 SHA 均一致，未暂存、提交或覆盖。证据基线 `protected-parallel-before-113-commit.json`。

## 五位独立专家

各专家只读核对真实材料、源码与实物，不把本轮目标分数当证据。完整原始报告在证据根 `expert-final-114-*.md`。已测范围评分与未测边界分开，未测维度不评分。

| 维度 / 独立专家 | 已验证范围评分 | 依据和保留风险 |
|---|---:|---|
| 产品 UX / Pasteur | 95 | 实际浅深色、窄屏、单击操作、中文与焦点；保存关闭编辑器后的焦点衔接仍可改善；完整备份纯键盘及全部异常状态视觉 NOT_TESTED |
| Chrome SDK与原生右键 / Nash | 96 | 真实菜单保存、正式候选、具体未授权 Origin 拒绝与定向安全保护；有效期内同 Ticket 完整原生追踪、导航/撤权竞态及公网 NOT_TESTED |
| 存储可靠性 / McClintock | 96 | 正常重启三条逐字段一致、旧编辑保留、删除持续、pbpaste/文件哈希；真实磁盘/配额/中途进程故障 NOT_TESTED |
| 权限安全与旧版升级 / Averroes | 96 | 同 ID 两段原位升级、正文授权保留、右键按版本重新启用、提交前取消和拒绝；直接单跳及事务中断 NOT_TESTED |
| 构建测试与发布 / Godel | 94 | 最终产物106文件与门禁有依据；纯已提交main产物、最终远程CI未验证；预算余量小。两项证据记录已按意见补正并实际补测，专家追加核实后维持94分 |

**已验证核心链没有 Clipper P0。** 本地核心使用验收可以交付；全维度95+、无overlay的纯main正式Browser发布，以及未测的实际原生负向/事务中断场景均不作通过结论。发布剩余项必须按实际证据关闭，不能用评分代替。
