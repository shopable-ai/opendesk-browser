# Sidebar 自定义工具 R1 · Mac 验收账本

当前结论：**本机工程检查 CI_PASS；所列真实浏览器场景 NATIVE_PASS；整体验收 NATIVE_NOT_VERIFIED，尚未达到最终合格。** 源码冻结身份为 `f462df264afd5b1b8d32101fb36af1d63c98c8cd`，已验证生产包为 `f1699d79eebf058eb0dc97115724bf97b187d3cb24be1984a0fc2432aa941342`。随后提交的本账本和证据不改变该产品输入。

用户明确授权直接在 main 同步、修复和提交。已 fetch 核对远端 main `44b7c4b63e4613b68f4e1d9c62797b6ec495a89f`，它是本机源码候选的祖先；没有建立分支/worktree、重置、清理他人文件或执行本轮 push/release。其他对话的 WXT 构建收据与未跟踪文件保留，`dist/development` 没有覆盖。旧 owner 和失败回执没有改写。

证据入口：`../evidence/sidebar-tools-r1-mac-01a11fa4/continuation-unlocked-20261009/`；当前收拢文件为 `f462-closeout.json`，原始文件及 SHA256 见上层 `evidence-index.json`。历史候选继续保留在本页下方，历史失败不再作为当前工程结论。

## 工程与 CI

| 检查 | 当前结果 | 原始证据（continuation 下） |
| --- | --- | --- |
| npm ci --ignore-scripts、check、build、build:dev、verify、build:sidebar-tool | **CI_PASS**；纯 Git archive 快照包含精确 f462 驱动修改，排除并行未提交输入；无新增依赖 | native-instance-build-results.json、各 native-instance-*.log |
| npm test（最终源码） | **CI_PASS：467 tests /467 pass /0 fail /0 skip** | native-instance-final-engineering.json、native-instance-test-final.log |
| 真实 Chrome Native 权限、Worker更新、Host/CLI握手、撤权及实例合同 | **定向5/5 PASS**；使用受支持的独占 Native instance，原有默认安装没有移动/覆盖/删除 | native-instance-targeted-result-after.json、native-instance-targeted-test-after.log、native-instance-after-native-permission-ax.txt |
| 实际交付 dist/production | **CI_PASS**；文件字节与已验证包完全一致；之前9ad生产包独立备份 | native-instance-package-identities.json、native-instance-production-delivery.json |
| quick-notes 工具 JSON | **CI_PASS**；3963 bytes，HTML/CSS/经典JavaScript/data PNG齐全，工作区副本与打包产物逐字节相等 | f462-quick-notes.opendesk-tool.json、f462-native-derived-verdict.json、native-instance-tool-build.log |
| 最新远端44b的全部9个触发workflow | **CI_PASS**；不覆盖尚未push的本地f462测试驱动修改 | github-ci-44b-raw.json、github-ci-44b-observation.json |
| 远端 Native Agent 组件、macos-15、macos-15-intel | **CI_PASS**；两个真实Chrome Options/握手diagnostic步骤成功；不是完整Side Panel E2E | github-ci-44b-native-jobs.json |

## 已修复的失败

| 实际问题 | 源码修复与约束 | 验证 |
| --- | --- | --- |
| Chrome真实存储属性重排误判安装包变更，中文保存被拒绝 | 校验后的包按语义比较；异步授权后仍重新检查实际安装包、当前实例和能力 | 组件回归、最新真实中文Save通过 |
| 写入/卸载竞态、旧iframe与跨窗口实例授权 | tool→catalog锁持有到存储提交；撤销旧界面；第二次load关闭实例；宿主frame-src与UI/计算沙箱分别校验 | 组件回归；枚举真实消息攻击、20次销毁恢复通过；真实延迟I/O时序仍列缺口 |
| 真正200%时极窄标题竖排 | ≤280px宿主工具标题/导入区纵向布局 | b18真实DPR4、host180/tool142及滚动Save证据保留 |
| macOS项目根 `/var`→`/private/var` 别名误判缓存逃逸 | public入口规范化root；保留子目录symlink/O_NOFOLLOW/contentHash等防线 | 根别名回归 FAILED→8/8PASS，完整467/467PASS |
| Native真实测试拒绝已有默认安装 | 使用受支持的独占实例；setup/doctor/handshake/cleanup保持同一实例环境；保护断言保留 | 默认安装未改动，定向5/5及完整467/467PASS |
| Native测试删除profile时Chrome仍未退出；中文权限窗口未识别 | 等待自有child关闭后清理；加入中文标题短语，仍核对自有PID、Native正文及唯一启用允许按钮并重验 | 原始3/5、两个失败保留；修复后5/5及完整467/467PASS |
| CI原生Chrome复制破坏.app厂商布局 | 恢复原厂商app文件/字节布局后使用独占测试包 | 当前远端两个Mac diagnostic成功，旧失败日志保留 |

本轮源码、测试及CI修改共 **17个文件**，五个源码提交和精确路径见 `f462-source-changes.json`。新增的最后一份路径是 `tests/framework/native-chrome-consent.mjs`；证据与文档提交另计。只读独立复核未发现两份f462驱动修改的新增阻断；setup中途失败/退出超时仍可能留下自有实例或profile，标题采用短语contains，不能声称完整字符串相等或所有异常路径零残留。复核不是最终F3。

## 当前真实 Mac Chrome

受控 **Chrome for Testing 155.0.8059.39**，revision `3ff7ac5a9224be9156d7f8703a06e22890aafd34`。最新包加载自本仓库 `dist/production`，实际 `chrome.runtime.getContexts` 为 `SIDE_PANEL`。本轮实际输入来自原生文件选择/确认及Chrome Input，保留isTrusted和唯一Save命中；输入未采用DOM值赋值或synthetic事件，没有伪造native ack、个人profile/TCC/keychain更改或放宽安全检查。安全探针另在实际文档中主动创建sibling攻击iframe及CSP测试元素；这些属于攻击/隔离观察，不作为真实用户输入证据。

| 最新f462包的真实验收 | 结果 | 关键原始证据 |
| --- | --- | --- |
| 文件选择不安装/执行，明确安装仍未打开，主动选工具才创建iframe | **NATIVE_PASS，限定该流程** | native-final-f462/selected-no-install.json、installed-unopened.json、saved-native-note.json |
| 界面/CSS/本地PNG、当前业务页title/URL、中文原生Save | **NATIVE_PASS** | saved-native-note.json、对应input/click回执及顶层Side Panel PNG |
| 特权Chrome API不可用、eval CSP、错误instance/toolID、真实sibling frame、旧实例、未知能力及非法key | **NATIVE_PASS，枚举攻击范围** | native-final-f462/security.json |
| 20次销毁重开，恢复完整中文，离开工具后零iframe | **NATIVE_PASS**；稳定message listener与有界GC计数；不声明零堆泄漏 | native-final-f462/cycles-20.json |
| 另一真实浏览器窗口绑定、业务网页导航、真实业务tab断网及本地Save | **NATIVE_PASS**；不扩大为整个OS断网 | native-final-f462/windows-navigation-offline.json |
| 原三个一级页签，完整草稿Save、一次完成、一次停止、结果/历史与worker退休 | **NATIVE_PASS，限定草稿流程**；精确runId/resultId、自身revision/sourceHash、released | native-final-f462/draft-final-released-runs.json、f462-native-derived-verdict.json |
| 原计算沙箱运行期间的严格CSP | **NATIVE_PASS**；style/img实际enforce，未因UI沙箱降低边界 | native-final-f462/computation-csp.json |
| 整浏览器退出、同profile真实重启、重开Side Panel恢复中文 | **NATIVE_PASS**；旧PID退出0且不再存活，profile设备/inode保持 | native-persistence-f462/launcher-tools-r1-restart-verified.json、restored-after-restart.json |
| 真实卸载确认、工具目录与namespace删除 | **状态证据NATIVE_PASS**；模态后唯一点击计数探针exit1仍为FAILED；不声称该探针通过 | native-persistence-f462/uninstalled-after-restart.json；f462-observer-failures.json |
| 本轮独占浏览器/profile/43111释放 | **PASS / released** | 两个cleanup.json、native-f462-resources-released.json |

`f462-native-derived-verdict.json`严格从上述原始观察推导，没有生成新的native回执。重启新配置用于持久化验证，与第一份草稿运行配置区分；本轮不声称新配置已有其他工具笔记或原任务记录。

b18包 `444d43da287b649b12f05e778e0e2db38c837220d7fd55dab5a698ea40d4a565` 的400/600 CSS px、实际200%、更新v1.0.1、React＋Tailwind/Vue经典JS与静态CSS运行，以及混装目录卸载隔离证据仍保留原身份。九份直接R1输入与f462逐字节相等，见 `f462-bounded-source-reuse.json`；整包sw.js/tool-shell.js有其他框架集成变化，**不将这些旧package证据升级为最新整包PASS**。官方JSX/TSX/.vue/Tailwind源码直接编译导入仍为 **NOT_SUPPORTED**。

驱动/观察失败见 `f462-observer-failures.json`：原生popover/路径输入、错误选择器、探针执行先后、单次重启限制、刚建页面时入口探针、模态后点击计数及iframe截图限制均列出；没有删除失败断言或改成skip。部分首次stderr仅在本对话工具记录中，没有虚构独立日志文件。

## 尚未完成与评分

```text
Sidebar 自定义工具 R1
  源码修复与本机工程检查 [已提交；467/467、构建/打包/verify CI_PASS]
  真实侧栏安装、保存、安全探针、20次生命周期、草稿运行/停止 [所列f462 NATIVE_PASS]
  真实整浏览器重启恢复与卸载 [状态证据通过；卸载点击探针失败单独保留]
  400/600、200%、更新及React/Vue运行 [b18精确候选证据，直接输入复用]
  实际320 CSS px宿主 [NATIVE_NOT_VERIFIED；Chrome155最小360]
  延迟onChanged与已进入Chrome I/O写入/卸载 [只有组件CI_PASS，缺真实时序证据]
  已安装Task v1跳转不执行 [原候选证据保留，未在f462独立重验]
  JSX/TSX/.vue/Tailwind源码直接编译 [NOT_SUPPORTED；预编译运行不能提升]
  独立最终F3与同包ZIP安装 [本工作流未关闭原合同]
```

保守工程评分：**功能94、安全94、视觉94、生命周期94、开发体验92**，均未宣称达到95目标。分数不是产品完成百分比。当前枚举安全场景未发现绕过，但不能以它们覆盖缺失时序或宣称关键安全最终验收关闭。三个既有开发依赖audit告警保留，没有强制升级依赖。

## 历史9ad及更早收拢记录（不代表当前候选）


用户明确授权本轮在 main 实施、同步和提交，不建立新分支。其他对话的六个已修改文件、未跟踪文件、历史身份与原始证据均保留；源工程只读，没有新增依赖、push 或发布。

当前结论：**NATIVE_NOT_VERIFIED，尚未最终合格**。最新完整本机测试绑定纯源码 `9ad3e494aa1eb1ec6e1eefefbe3ffa336621f158`：**428 tests / 427 pass / 1 fail / 0 skip**。唯一失败是 `native-agent-chrome-real.test.mjs:171` 的现有 Native 安装保护断言，要求专属空安装环境；没有移动、覆盖或删除 `~/.opendesk-browser/native-agent-r1`。此前锁屏和审批超时是历史失败，已不再作为当前原因。

收拢时 main 已安全同步到 `90bb129fa790fb7351e7f33d896e411c2fa76c82`；该次合并只新增三份远端文档，产品与验证输入与 9ad 相同。本轮 CSS 修复 `3467d462` 与根路径修复 `b18f4f32` 已在 main。只读复核没有发现两处修复的阻断问题；这不是最终 F3。

实际本地 `dist/production` 已交付纯 9ad 的 **`ab0086daba9ac453802cfdc39484570f1ff999d9f8f61d3865d1e57a5bb811ef`**，最新真实 Chrome 直接加载该目录且回执哈希相同。旧 9e19 包已备份；共享 `dist/development` 属于其他工作流，未覆盖。独立快照开发包 hash 为 `6f10eb622d07e9fb6d64108617510cbaab78ea747f6a4fca07e06802d05408ff`。

原始证据根为 `../evidence/sidebar-tools-r1-mac-01a11fa4/`，本次继续工作在 `continuation-unlocked-20261009/`（以下简称 continuation）。每个不同 source/package 身份保持独立。下面当前结果优先；后文“历史候选证据”保存旧状态，不是当前结论。`evidence-index.json` 保存逐文件字节数与 SHA256；他人暂存内容保全补丁只留本地，未提交。

## 最新工程与 CI

| 检查 | 当前结果 | 证据（continuation 下） |
| --- | --- | --- |
| npm ci --ignore-scripts / npm run check | CI_PASS | integrated-9ad-npm-ci.log、integrated-9ad-check.log |
| npm test | **FAILED：428 / 427 / 1 / 0** | integrated-9ad-test.log、integrated-9ad-engineering-results.json |
| npm run build / build:dev / verify | CI_PASS；纯 Git archive 快照排除并行未提交输入 | integrated-9ad-build.log、build-dev.log、verify.log、package-identities.json |
| npm run build:sidebar-tool -- examples/sidebar-tools/quick-notes | CI_PASS；3907 bytes，HTML/CSS/经典 JS/data PNG 齐全，打包本身不安装 | integrated-9ad-tool-build.log、integrated-9ad-tool-artifact-check.json、integrated-9ad-quick-notes.opendesk-tool.json |
| 远端最新 ef016762 的六个触发 workflow | **CI_PASS**；不等于本地未 push 的 main 检查 | github-ci-ef-raw.json、github-ci-ef-observation.json |
| ef016762 Native Agent：组件、macos-15、macos-15-intel | CI_PASS；两个真实 Chrome Options/握手 diagnostic 步骤成功，明确不是完整 Side Panel E2E | github-ci-ef-native-jobs.json；[Native run](https://github.com/shopable-ai/opendesk-browser/actions/runs/37942172060) |
| 较早远端 17fea175 八个 workflow | CI_PASS；旧失败 run 仍保留 | github-ci-latest-remote-main.json、github-ci-latest-native-jobs.json |

远端相对本地仍缺三个本轮修改文件：`scripts/remote-esm-modules.mjs`、`src/ui/tool-shell.css`、`tests/environment/remote-esm-security.test.mjs`。没有把远端绿灯升级成本地这些提交已经远程测试。较早 742 的 357/357 全绿只对应其源码与环境；本轮不以旧 PASS 抵消当前保护断言。

## 新发现及修复

| 缺陷 | 修改 | 验证 |
| --- | --- | --- |
| Chrome 默认 200% 真正应用到工具时，host180/tool142 CSS px，工具区标题被横排挤成竖排 | `src/ui/tool-shell.css:258` 在 ≤280px 时纵向排列标题和导入控件；超过280px不增加影响 | 真实 Chrome 设置200%，DPR4；修复后标题横排、根无横向溢出；实际滚动到保存按钮并原生点击。actual-200-fixed、actual-200-visible-saved 原始截图/观察保留 |
| macOS `/var`→`/private/var` 项目根别名被当成缓存逃逸 | `scripts/remote-esm-modules.mjs` 入口规范化 root；新增根别名回归 | remote-root-regression-before FAILED → after 8/8 PASS；子目录禁止 symlink、O_NOFOLLOW、内容 hash 和锁文件检查保留 |

本轮全部源码/测试/CI修改共 **16个文件**，精确清单与四个提交见 `continuation/own-code-changes.json`：

```text
.github/workflows/native-agent-r1.yml
scripts/remote-esm-modules.mjs
scripts/verify-package.mjs
src/native-agent/service-worker.js
src/native-agent/settings.js
src/ui/sidebar-tools.js
src/ui/tool-shell.css
src/ui/tool.html
tests/environment/native-agent-bridge.test.mjs
tests/environment/native-agent-chrome-real.test.mjs
tests/environment/remote-esm-security.test.mjs
tests/environment/sidebar-tools-host.test.mjs
tests/environment/sidebar-tools.test.mjs
tests/framework/sidebar-tool-framework-build.mjs
tests/framework/sidebar-tools-native-probes.mjs
tests/framework/sidebar-tools-native-session.mjs
```

## 最新真实 Mac Chrome

受控 **Chrome for Testing 155.0.8059.39**，revision `3ff7ac5a9224be9156d7f8703a06e22890aafd34`。没有操作个人 Chrome profile、修改 TCC/keychain、DOM 赋值、synthetic 输入、伪造 native ack 或降低 CSP。驱动 Chrome Input 的完整值、isTrusted 与唯一实际命中按钮均有原始回执。

| 验收 | 结果与身份 | 关键证据（continuation 下） |
| --- | --- | --- |
| 原我的任务／发现／开发三个入口，完整草稿 Save、Run、Stop、结果和历史 | **9ad NATIVE_PASS，限定所列流程**：成功/停止各一个真实 run；result 自身 revision/sourceHash、准确 resultId，retirementState=released；导入 Task v1 仍为待验证候选，未绕过安装门 | native-integrated-9ad/task-and-save-derived-verdict.json、draft-completed-runs.json、draft-stopped-runs.json、task-import-pending-review.json |
| 文件选择不安装/执行、明确安装后仍未打开、主动打开才展示 | **9ad NATIVE_PASS** | native-integrated-9ad/selected.json、installed-unopened.json、saved.json |
| HTML/CSS、本地 PNG、当前页面 title/URL、中文真实输入保存 | **9ad NATIVE_PASS**；图片 complete/naturalWidth=1 | native-integrated-9ad/saved.json、input-*.json、click-*.json |
| sandbox API 不可用、eval CSP、错误实例/工具 ID、实际 sibling frame、旧实例、未知能力/非法 key 拒绝 | **9ad NATIVE_PASS，限定枚举攻击**；不扩大为所有安全时序场景 | native-integrated-9ad/security.json |
| 连续销毁重开20次、原文恢复、退出后零工具 iframe | **9ad NATIVE_PASS**；GC后 documents1、nodes1163→1161、listeners80→79；不是零堆泄漏声明 | native-integrated-9ad/cycles-20.json、cycles-restored.json |
| 另一个真实浏览器窗口、业务网页导航、业务 tab 断网仍本地保存 | **9ad NATIVE_PASS**；只模拟该真实业务 tab 断网，未宣称整个 OS 断网 | native-integrated-9ad/windows-navigation-offline.json |
| 卸载工具目录/namespace，原成功/停止结果仍保持 | **9ad NATIVE_PASS** | native-integrated-9ad/uninstalled.json、task-records-after-uninstall.json |
| 本工作流 Chrome 退出、profile 删除和端口释放 | **NATIVE_PASS / released**；仅所属资源 | native-integrated-9ad/cleanup.json、canonical-server-stop.json |
| 真正400/600 CSS px面板；中文保存及中文错误 | **b18 NATIVE_PASS**，包444d43… | native-final-b18-width400/layout-400.json、width400-error.json、native-final-b18-widths/layout-600.json |
| 真正 Chrome 默认200%，工具自身DPR4、host180/tool142；标题修复后及滚动保存可用 | **b18 NATIVE_PASS，限定观察与真实操作** | native-final-b18/actual-200-fixed.json、actual-200-visible-saved.json及对应PNG |
| 同 profile 整浏览器退出/重启恢复完整中文 | **b18 NATIVE_PASS**；9ad重启控制因stdin关闭未执行，不声称9ad重验 | native-final-b18/restarted-restored.json、launcher-tools-r1-restart-verified.json；native-integrated-9ad/session-control-error.json |
| React＋Tailwind、Vue 本地编译经典 JS/静态 CSS，原生计数0→1 | **b18 NATIVE_PASS**；Tailwind蓝色rgb(37,99,235)，特权API不可用；Vue另有明确派生限制 | native-final-b18-width400/react-framework.json、vue-framework-derived-verdict.json；既有 tool-fixtures/compiler-report.json |
| 更新v1.0.1恢复笔记，卸载只移除该工具，React/Vue安装目录不变 | **b18 NATIVE_PASS**；不能扩大为同profile其他工具笔记数据再次测试 | native-final-b18-width400/update-selected.json、updated-before-uninstall.json、uninstalled.json |
| 新 UI 沙箱未削弱原计算 CSP | 静态包校验 CI_PASS；原实际 enforce证据按相同sandbox字节复用。9ad在run退休后无frame的探测为 NATIVE_NOT_VERIFIED | native-source-input-reuse.json、integrated-9ad-package-identities.json；历史 native-final3/computation-csp.json |

b18 包是 `444d43da287b649b12f05e778e0e2db38c837220d7fd55dab5a698ea40d4a565`。与9ad直接R1源码/沙箱/HTML/CSS相同，但 Native transport、sw.js、ui/tool-shell.js bundle不同；`native-source-input-reuse.json`逐项确认边界。**不同packageHash证据不会提升为新整包PASS**。既有安装任务跳转不自动执行、双工具笔记隔离、缩减能力和排队卸载证据仍保持原候选身份，详见历史表。

观察器失败完整说明见 `observer-failure-summary.json`：iframe screenshot不支持、未打开details、原生resize仍600、200→100重置未生效、Vue同名观察覆盖了新PASS文件、9ad样本文本不匹配及stdin关闭等均如实保留。更正只基于真实状态/输入；没有改失败断言或把未执行动作标成成功。

## 仍未完成及质量判断

```text
Sidebar 自定义工具 R1
  宿主存储、实例授权、导航与打包边界 [已修复；组件及所列原生证据]
  最新工程检查 [除npm test外通过；428项中427通过]
  最新真实Chrome安装、保存、20次切换与原草稿Run/Stop [所列NATIVE_PASS]
  400/600与200%、重启、更新和框架 [b18精确候选NATIVE_PASS；直接输入复用边界记录]
  空Native安装环境 [等待现有安装资源归属；保护断言未绕过]
  真实320宿主 [NATIVE_NOT_VERIFIED；Chrome155最小360]
  延迟onChanged、已进入Chrome I/O的写入卸载 [只有组件CI_PASS；待真实时序验证]
  最新9ad重启与已安装Task v1跳转 [本次未独立原生重验；旧包证据保留]
  官方JSX/TSX/Vue/Tailwind源码编译入口 [NOT_SUPPORTED；预编译成功不能提升]
  全框架正式F3与同包ZIP [未由本轮关闭；原合同保留]
```

当前工程判断分：**功能94、安全94、视觉94、生命周期94、开发体验92**。目标均95；评分不是产品完成百分比，也不是测试数量换算。保留三个既有开发依赖audit告警，未强制更新。没有关键安全最终通过、完整同身份原始证据和必要安装验收，就不宣称最终合格。

## 历史候选证据（以下记录已被上述当前状态更新）

以下各节原文保留，均限定其当时的源码、package、CI、环境和失败原因。旧355/354、锁屏、尚未远端验证、未达到工具200%等描述是历史状态；当前工程结果和实际200%修复以上表为准。

## 修复及根因

| 文件 | 真实缺陷或边界 | 修复与回归证据 |
| --- | --- | --- |
| `src/ui/sidebar-tools.js` | 异步请求排队后仍可能使用旧窗口；写入完成与卸载删除未建立屏障；不同面板字段更新可能互相覆盖 | tool Web Lock 持有到实际存储提交；锁内重新核对实例、工具目录和包内容；安装/卸载按 tool→catalog 顺序锁定。`host-before.log` 记录旧源码失败，host 8 项回归通过；真实双面板不同字段保存、排队请求与卸载已通过，已进入 Chrome I/O 的写入竞态仍未原生验证 |
| `src/ui/sidebar-tools.js` | Chrome storage 返回属性顺序变化，整包 JSON.stringify 比较误判合法工具已更新/卸载，真实中文保存失败 | 按验证后 schema 内容比较；键顺序变化不撤权，JS/能力变化仍撤权。`property-order-before.log` FAILED，`property-order-after.log` PASS；真实保存和重启恢复见 native-final3 |
| `src/ui/sidebar-tools.js`、`src/ui/tool.html`、`scripts/verify-package.mjs` | 工具导航后可能重发实例授权；宿主缺少子 frame 导航边界 | 二次 load 关闭旧实例，不重发 token；宿主增加并精确校验 `frame-src 'self'`。真实 HTTP 导航 enforce、服务端零请求，以及 about:blank 导航关闭有原生证据 |
| `src/native-agent/service-worker.js`、`src/native-agent/settings.js` | nativeMessaging 已批准但旧 Worker 的 Native API 绑定未刷新，错误说明不清楚 | 返回 requiresReload，给出结束任务后手动重载扩展的中文说明；不自动重载、不变更权限/RunHost/ledger。桥接 22 项与真实 Host/CLI、Worker 更替、撤权通过 |
| `tests/environment/native-agent-chrome-real.test.mjs` | 原生驱动异步读取遗漏 awaitPromise，把 Promise 对象误当授权结果；测试 profile 的 Host 安装位置不一致 | 等待实际 ok/enabled、真实 permission；使用独占 profile Host；精确停旧 Worker 并确认新 target/API；保留旧失败。历史工作树完整测试记录 permission/Host/CLI/revocation PASS；最新纯 main 的审批因环境条件失败，不提升为当前 PASS |
| `tests/environment/sidebar-tools.test.mjs` | 工具包路径边界缺少回归覆盖 | 补充 traversal、symlink、资源预算和重复资源失败用例，不放宽 packer |
| 三个 `tests/framework/sidebar-tool*.mjs` 驱动 | 需要可追溯的经典 JS 框架编译、受控 Chrome 生命周期及真实输入观察 | 编译仅用既有本地依赖；Input 实际命中且 isTrusted、完整值相等；CSP eval 显式禁止 DevTools 绕过；时间戳回执保留本次事件。旧累计点击记录仍保留，派生说明见 closeout-observer-correction.json |
| `.github/workflows/native-agent-r1.yml` | setup-chrome 的 macOS 安装路径丢失 `.app` 外层，renderer 无法初始化 Mach rendezvous/sandbox，两个架构 CI 都在 about:blank 诊断失败 | 复制完整原有 bundle 为真正 `.app`，cmp 校验 Info.plist 和可执行文件字节相同；同机扁平路径 FAIL、恢复路径 PASS，最终 workflow shell 实际通过；没有关闭 sandbox、改变权限合同或跳过测试 |

## 工程检查

| 操作 | 已执行结果 | 原始文件（证据根目录下） |
| --- | --- | --- |
| `npm ci --ignore-scripts` | CI_PASS；lock/dependency 清单没有本轮修改 | npm-ci.log |
| `npm run check` | CI_PASS，177 个 source/test/build 文件及固定入口、严格 CSP、MIT 检查 | check-closeout2.log |
| `npm test` | **最新纯提交执行 FAILED：355 tests / 354 pass / 1 fail / 0 skip**，Native 权限审批超时 | pure-main-7e80fa8f/test.log、test-result.json；专项重试 2 / 1 / 1 / 0，Mac 锁屏；历史工作树 test-final7 为 342 / 342 / 0 / 0，不能替代本行 |
| `npm run build` | CI_PASS，构建过程无 source drift | build-production-final5.log、build-final5/build-production.json |
| `npm run build:dev` | 本轮早期实际执行 CI_PASS；随后 development 交给 Page UI 工作流，未争用重建 | build-dev-final3.log、build-dev-final3/build-development.json |
| `npm run verify` | CI_PASS；production/development 均通过实际包检查，但候选身份分别记录 | verify-final5.log |
| `npm run build:sidebar-tool -- examples/sidebar-tools/quick-notes` | CI_PASS；JSON 含 HTML、CSS、经典 JavaScript、data PNG 本地资源 | quick-notes-final.log、tool-fixtures/quick-notes-v1.0.0.opendesk-tool.json |
| 纯 main `check` / `build` / `build:dev` / `verify` / `build:sidebar-tool` | CI_PASS；独立 git archive 快照、既有 node_modules 只读复用、无他人未提交输入，构建过程 source drift 为空 | pure-main-7e80fa8f/ 下对应日志及构建 receipt；production 实際交付后再次 verify 通过 |
| GitHub CI | **FAILED**：源码提交 8 个 workflow 成功、Native Agent workflow 失败；修复提交尚未远程执行 | github-ci-observation.json、github-native-ci-log-{0,1}.json；[失败 run](https://github.com/shopable-ai/opendesk-browser/actions/runs/37923619450) |

Native CI 的两个 macOS runner 均在 renderer 初始化失败，尚未进入权限审批；这与本机锁屏导致的权限失败是不同原因。本机对照只改变 `.app` 外层路径，原始可执行文件与 Info.plist 保持逐字节一致。`ci-flat-bundle-before.log` / `ci-restored-bundle-after.log` 保存 FAIL→PASS，`ci-bundle-workflow-exact.log` 保存最终 shell 实际通过。vendor CFT 自身严格 codesign verification 返回 1，诊断原文保留，**不声称完整 sealed signature 验证通过**；最终 workflow 用 cmp/hash 保证既有 vendor 字节未被改写，没有新增签名豁免。

`npm-audit.json` 保留 3 个既有开发依赖告警（high serialize-javascript、moderate terser-webpack-plugin、low webpack）。没有运行强制 audit fix 或新增依赖，也没有把这些告警写成已修复。

## 原生验收

真实 Mac Chrome for Testing **155.0.8059.39**，revision `3ff7ac5a9224be9156d7f8703a06e22890aafd34`。仅操作本工作流独占 profile；CFT 原始可执行文件与 UI 专属副本 SHA 相同，仅副本使用独立 bundle ID 防止多个 CFT 的 UI 错绑。没有关闭 sandbox 或降低 CSP。启动、整浏览器退出、同 profile 新进程、profile 删除均有 launcher 原始记录。最早 native/cleanup.json 的 FAIL 保留，虽已删除 profile、residual 为空，仍不改写为 PASS。

| 验收项 | 状态及实际范围 | 证据 |
| --- | --- | --- |
| 我的任务／发现／开发；原草稿保存、运行、停止、结果、历史 | NATIVE_PASS（所列 case）；纯 main 包确认完整输入与唯一真实 Save、成功/停止各 1 个真实 run、结果自身 revision/sourceHash 及 released | native-isolated-proposal/task-and-save-verdict.json；历史 Task v1 流程见 native-final3/task-records-after-uninstall.json |
| 选择 JSON 不自动安装/执行；确认后新增选项卡，主动打开才运行界面 | NATIVE_PASS | native-final3/selected.json、installed.json；native-main-final5/selected.json、final-tool.json |
| HTML/CSS、本地图片、当前普通网页 title/URL | NATIVE_PASS；图片真实加载 naturalWidth=1，按示例自身白色 PNG 解释 | native-final3/installed.json；native-main-final5/final-tool.json |
| 中文保存、关闭重开恢复 | NATIVE_PASS；纯 main 包又做真实输入/保存及 20 次销毁重建恢复 | native-isolated-proposal/cycles-20.json、last-input.json；历史 native-main-final5/final-tool.json |
| 整浏览器退出并用同 profile 重启恢复 | NATIVE_PASS，绑定 native-final3 精确包和记录；不能提升为之后整包全部通过 | native-final3/launcher-tools-r1-restart-verified.json、restart-persistence.json、restarted-restored.json |
| 工具更新、缩减能力、恢复本地数据 | NATIVE_PASS（显式安装更新及新实例）；旧实例在延迟事件/在途竞态中的真实覆盖未完成 | native-final3/update-selected.json、updated.json、capability-revocation.json |
| 返回任务列表、跳转已安装任务且不自动启动 | NATIVE_PASS；已安装 readonly Task v1 的真实完成/停止保留，跳转前后实际 runId 集合未增加 | native-final3/before-task-open.json、after-task-open.json、task-completed.json |
| 卸载只删除对应目录/数据，不影响其他工具和任务记录 | NATIVE_PASS（所列快照）；纯 main 新增真实排队 SDK 写入后 UI 卸载、双 frame 退出、目录/数据保持删除；已提交到 Chrome I/O 的竞态未验证 | native-isolated-proposal/queued-uninstall-verdict.json、task-and-save-verdict.json；其他工具已安装数据保持见历史 native-final3/uninstall-isolation.json |
| sandbox 无 runtime/tabs/storage 特权 API，动态 eval 被实际 CSP 拒绝 | NATIVE_PASS | native-final3/security.json、native-main-final5/security.json |
| 跨 iframe、错误实例/工具 ID、旧实例重放、未知能力、非法存储 key | NATIVE_PASS（所列具体消息攻击）；合法桥接入口真实返回正确中文错误 | native-main-final5/security.json |
| 伪造 payload namespace/toolId 不能越权 | NATIVE_PASS：历史实际其他工具数据读取拒绝；纯 main 带伪造 toolId/namespace 的 SDK 写入只进入 caller 自身 namespace，不建立另一 namespace | native-final3/namespace-isolation.json；native-isolated-proposal/namespace-write-isolation.json（该 profile 另一 namespace 本来不存在，不声称其已安装数据在本次写攻击中被重验） |
| 网页导航、另一个真实浏览器窗口、业务页断网、本地保存与恢复在线 | NATIVE_PASS（业务 tab 网络断开，非整个 OS 断网）；旧侧栏仍绑定自身窗口 | native-final3/windows-navigation-offline.json |
| 工具 iframe 的 HTTP 导航及再次 load | NATIVE_PASS；真实 enforce、HTTP 服务端零请求，二次导航关闭 | native-final3/navigation-security.json、navigation-security-cleanup-fixed.json |
| UI sandbox 没有削弱计算 sandbox 的内联样式、data 图片、blob script 限制 | NATIVE_PASS；对应计算 sandbox 字节在之后候选仍一致；静态校验全部指令 | native-final3/computation-csp.json、candidate-closeout.json |
| 连续关闭/打开 20 次及事件/DOM 计数 | NATIVE_PASS；pure 9e19 包 GC 后 documents 1、nodes 1082→1080、listeners 76→75，关闭后工具 iframe 0；旧 final5 为 1122→1120、77→76。均不宣称零堆泄漏 | native-isolated-proposal/cycles-20.json；历史 native-main-final5/cycles-20.json |
| 400、600 CSS px 真正嵌入 Side Panel | NATIVE_PASS，限定旧工作树 final5 候选；实测宿主 400/600、工具 354/554，根无横向溢出，中文真实保存。pure 9e19 的整包 400/600 未重验 | native-main-final5/layout-400.json；native-main-final5-width600/layout-600.json |
| 320 CSS px 真正 Side Panel | NATIVE_NOT_VERIFIED；CFT 当前原生侧栏夹到最小 360。360 时工具视口 318 可用，但不能代替 320 的宿主验收 | native-final3/width-check.json、layout-360.json；官方源码约束见下文 |
| 浏览器 200% 缩放 | 网页 200% 已真实执行且侧栏可用；**工具自身 200%：NATIVE_NOT_VERIFIED**，host/tool DPR 仍为 2、网页 DPR 为 4 | native-final3/zoom200.json、zoom-metrics.json |
| React＋Tailwind、Vue 预编译经典 JS/静态 CSS 的安装和运行 | NATIVE_PASS（native-final3 精确候选）；真实计数 0→1，Tailwind 蓝背景 rgb(37,99,235)，API 隔离 | native-final3/react-framework.json、vue-framework.json；tool-fixtures/ 中保留确切产物及许可证 |
| 官方 JSX/TSX/Vue SFC/Tailwind 源码直接编译导入 | **NOT_SUPPORTED**；本轮是验收用本地预编译，不是已接入官方编译器，也不表示所有框架特性支持 | tool-fixtures/compiler-report.json、sidebar-tool-framework-build.mjs |
| Native Messaging 的真实 permission、Worker 更替、Host/CLI、撤权 | 历史工作树 NATIVE_PASS；**最新纯 main NATIVE_NOT_VERIFIED / 执行 FAILED**，审批超时后重试因 Mac 锁屏不能操作弹窗 | test-final7.log 的真实历史记录；pure-main-7e80fa8f/test.log、native-retry.log |
| 两个真实 Side Panel 并发不同字段写入 | NATIVE_PASS，10 对真实 opaque iframe SDK 并发请求、20 个字段全保存；两 host、两 Chrome window 确认；不是同 key 冲突，也不是 20 次 Native UI 输入 | native-isolated-proposal/two-panels-storage.json、two-panels-window-observation.json |
| 旧实例延迟 onChanged 撤权、已经进入 Chrome I/O 的写入卸载 | CI_PASS 组件回归；**NATIVE_NOT_VERIFIED**，不能用前面的排队请求提升 | sidebar-tools-host.test.mjs；read-only-review-queued-uninstall.json |

纯 main 的排队卸载 case 用真实 Web Lock 暂停队列，工具调用公开 `OpenDeskTool.request("storage.set")`，实际宿主记录 iframe WindowProxy 来源；不 mock Chrome storage 或宿主 handler。用户原生点击和确认卸载后 caller iframe 即刻为 0，释放锁后两 host 的 iframe 均为 0、目录及 namespace 保持删除。驱动 arm 后若在显式 release 前失败，需释放测试锁或关闭所属 panel/window；本轮实际成功 release，最终整个专属浏览器退出且 profile 删除，cleanup.json 为 PASS，不遗留测试锁。

两次双面板观察器失败也保留：Chrome runtime context 的 windowId 返回 -1，不能据此判断两个真实窗口相同；OOPIF 不在所读 Page.getFrameTree 的 childFrames 中，后续按实际 parentId/parentFrameId、host document 和 chrome.windows.getCurrent 的不同 windowId 核实。任务派生结果只统计带 runId 的 2 个真实 run，不把可变 shared host-slot 当作第三个任务或要求其在后续运行中保持不变。这些是观察方法更正，不是重写旧失败回执。

Chrome 当前最小宽度及边框换算取自该 revision 的 [side_panel_entry.h](https://github.com/chromium/chromium/blob/3ff7ac5a9224be9156d7f8703a06e22890aafd34/chrome/browser/ui/side_panel/side_panel_entry.h#L36) 和 [side_panel.cc](https://github.com/chromium/chromium/blob/3ff7ac5a9224be9156d7f8703a06e22890aafd34/chrome/browser/ui/views/side_panel/side_panel.cc#L353)。400/600 测试在本工作流 Chrome 完全退出后设置专属 profile 的原生宽度偏好，再真实重启并测量；不是改产品 DOM/CSS 来伪造尺寸，也不报告原生拖动手柄已通过。

## 候选身份及可复用边界

native-final3 整包为 `ce3b971e92917b7e479ba8baa692af494c7ac2ba88f83fbc7de8bf3b02c24a69`；final4 为 `63c5dd8020b8211ccfde52e988a7fcc82aed06ad2ba9572dced6b3a2cb3a8d4e`；工作树 final5 为 `6dbe36ee657994dd8906b76f69893d2e7f767c5a08f6f7da2659a5e7cfc82df1`。各 build/session 原始文件包含逐路径字节 SHA，不能因元数据更新将旧整包验收提升。

final5 新增重验宿主 UI、400/600、中文存储、攻击消息、20 次重建、原草稿运行/停止及 Native Agent。与 final3 相同的独立 sandbox/bridge 和计算 sandbox可按对应字节复用。旧候选上的更新、卸载、整浏览器重启和完整 Task v1 流程仍按旧身份列示。final5 含其他对话两份未提交控制器输入，**不代表纯提交 main 的整包验收**。

纯源码提交 `7e80fa8f702e10e1bcda432b7b6aec4c02f12c68` 的 production 包为 **`9e190a738a1e06a179213a04dab035d83b00f4f72b043c227b2d9151ef9b3f94`**。隔离 proposal 与该 git archive 构建逐文件完全一致，因此 `native-isolated-proposal` 虽使用历史目录名，实际浏览器加载包字节与纯 main 一致。该包已交付本地 dist/production；旧 final5 完整备份保留在专属临时目录，其他对话的 dist/development 未触碰。后续 CI-only 提交没有改变任何 product inputs。纯 development 包为 `657c6771f10a7774f7abfe75742c530789ffa34f4085151e6dcc6e045c394f9a`，构建在独立目录，不冒充共享 development 产物。

同步收尾时，远端 main 新增测试页 axiosx 提交 `ea9670df`，本地另有 Page UI 验收文档提交 `d27ba52a`。本轮用合并提交 `62590ced93e0b42fe8776b8f980ce6457309ba7b` 保留两侧历史，未 reset/rebase，也未更改他人未提交和未跟踪文件；合并的测试页面定向验证 **17/17 PASS**。从源码候选到该合并提交，src/scripts/manifest/package/lock/wxt 等 product inputs 仍无差异，故无需为文档和测试页提交重复构建或提升旧整包结果。355 项完整测试仍明确绑定 7e80fa8f，不推算合并后的总测试数。

与 final5 的变更为 sw.js、ui/tool-shell.js；其余 24 个文件的精确相等列表见 pure-main-closeout.json。当前 pure 包新原生证据包括安装门禁、中文存储、消息攻击、20 轮关闭重开、真实 360 侧栏、双面板并发与排队卸载、真实任务完整保存/完成/停止。400/600 截图及整浏览器重启、框架预编译运行仍绑定各自旧包，只能按相同具体输入复用，不能升级为整个 pure 包完整验收。

canonical URL 始终为 `http://127.0.0.1:43111/demo-form.html`。已有服务器 PID10400 属于 sidebar-demo-r3-01a11fba 工作树，本轮只读复用；实际 HTTP 字节 SHA `e34875d26855e4d869ae6a8a5b36ffc702cd70efe135f6846eff8fbbf6c05a3c` 与本轮读取时仓库 fixture `e542180c021506002454a326aee74df3d33639a4f2481dc9ef131cbc55442765` 不同，保留 canonical-served.html 和 identity。上述 title/URL/只读任务不依赖两份 fixture 的新增差异，不将服务页声称为当前仓库文件字节一致。

## 质量及余项

本轮证据限定评分：功能 94、安全 94、视觉 90、生命周期 94、开发体验 92；目标均为 95。评分是工程判断，不是产品进度百分比或测试数量换算。所列关键消息/CSP 攻击未发现残留失败，但未知原生竞态、视觉缺口和候选身份差异仍限制最终结论。

```text
Sidebar 自定义工具 R1
  工具包与安装更新卸载：实施已修复；所列原生功能已证实；整包身份收敛见候选记录
  实例与存储边界：组件回归通过；消息攻击、双面板不同字段并发、排队卸载原生通过；已提交Chrome I/O及延迟撤权未验证
  生命周期：当前候选20轮通过；旧精确候选整浏览器重启通过；不声称零堆泄漏
  原任务与 Native Agent：pure包草稿完成/停止通过；Task v1旧候选通过；pure包Native权限需Mac解锁后专项复验
  视觉：pure包360通过；旧final5候选400/600通过；pure整包400/600、320宿主与工具自身200%未验证
  框架开发：预编译React/Tailwind及Vue通过；官方源码编译入口未接入
  主线交付：源码与CI修复已串行提交；pure生产包已交付；GitHub旧CI失败，修复后CI/独立最终F3/ZIP新候选未验收
```

原603＋19、独立B05、1000 mixed/10 reconnect/2轮禁插件、六项 baseline、独立最终F3、ZIP安装一致性等总体迁移合同仍保留，本轮有限 Sidebar 验收不替代它们，也不更改分母或冻结 owner/receipt。

截图：证据根目录 `screenshots/sidebar-400-final.png`、`screenshots/sidebar-600-final.png`；另保留 native-final3 React/Vue、更新、重启及 200% 页面截图。实际本轮源提交与证据提交 SHA 在最终 Git 记录和最终答复列出；本文件不伪造自包含 commit SHA。
