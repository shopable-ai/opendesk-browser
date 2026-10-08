# 多文件 Demo 本地构建与原生验收记录 · 2026-10-09

状态：本地构建、导入组件与资源安全修复已验证；真实 Sidebar 操作因 Mac 锁定未完成。没有 Page/Controller 原生执行 PASS、CODEX_E2E、最终 F3 或 ZIP 安装结论。通过 PR 集成已验证的局部修复，不关闭原生验收。

## 基线、工作区与占用

- 原工作区：`/Users/shopme/Documents/workspace/opendesk-browser`，启动时 main 为 `fa8e3fba80ca6f86a2f8160c08d19c6f925ce670`，有 60 项未提交变更。完整备份位于 `/Users/shopme/.codex/backups/sidebar-multifile-native-r1-20261008T175946Z`，含文件副本、SHA 清单和 Git binary patch；未覆盖这些变更。
- 本任务唯一写入 worktree：`/Users/shopme/.codex/worktrees/sidebar-multifile-native-r1/opendesk-browser`；唯一分支：`agent/sidebar-multifile-native-r1-20261009`。没有为各次测试创建额外分支。
- 初始远端 main：`bd47d40c9cf88af6942fe35c7468a92c3042c2d1`；执行中同步到 `5769730beb9fddc6fc788a2702409ec06076feac`，保留新增 Page 资源与 Sidebar Tools 功能。
- PR 集成前再次同步 main `bd7c8d1b41197673ad0d5ab0abe53231393a368d`；重放后的产品提交为 `5988ced5959003d88327658558c9fc08b86f92d8`。双构建全部 sourceInputs 和 10 个受影响测试文件均无差异，按 `current-main/rebase-reuse.json` 复用证据。
- 输入冻结时的产品修复候选：`6b3aee1cb4fa1bab1b12d11da24a64ab6c02e58b`。后续证据/文档提交仅改变记录，构建身份按原始 receipt 的 sourceInputs 核对。
- 自有 CFT fresh profile、43111 HTTP 服务均已释放；最后清理为 PID 不存活、profile 已移除、无残留。未停止其他会话的服务、浏览器或修改其 profile。
- 证据目录：[sidebar-multifile-native-r1-20261009](../evidence/sidebar-multifile-native-r1-20261009/)。历史失败和旧候选输出保留，未重写旧 receipt。

## 修复与失败原因

| 真实缺陷 | 修复 | 修复前证据 / 修复后证明 |
| --- | --- | --- |
| 源模块 UTF-8 BOM 被解码丢弃，快照文本与原始字节 SHA 不一致，导入报 `E_PROGRAM_HASH` | 保留源码 BOM，与冻结字节同一身份 | `draft-regression-before.log`；最终 roundtrip PASS |
| Page 项目允许 prerelease，导入 UI 拒绝；UI 还接受不合法的前导零版本 | 与项目/Schema 使用相同版本规则，Controller 稳定版本合同保留 | 同上；prerelease 接受、前导零拒绝 |
| 紧凑 JSON 未超预算，实际格式化文件却超过 512000 字节 | 按实际写出的格式化 JSON 加末尾换行计量 | 同上；超限 envelope 在构建阶段拒绝 |
| CSS 转义函数和 `image-set()` 字符串绕过运行时网络引用过滤 | 拒绝 CSS 转义和未支持的字符串 URL 函数，只重写已声明相对图片 | `current-main/review-regressions-confirmed.log`；资源安全回归 PASS |
| CSS 注释处理误删合法 `content` 字符串，并可能改写字符串里的 `url(...)` | 保护完整字符串；检测和替换使用同一文本及真实函数位置 | `current-main/css-literal-before.log`；字面内容保留回归 PASS |
| 坏 CSS 字符串的 LF/CR/FF 让后面的真实 URL 被掩码隐藏 | 按 CSS 字符串终止规则识别，未闭合字符串明确拒绝 | `current-main/css-malformed-before.log`；三种换行拒绝 PASS |
| 带 BOM 的 package.json 校验接受，但固定 Webpack 解析失败 | 校验阶段明确 `E_PROJECT_META / metadata / package.json` 拒绝；不扩展编译器 | `current-main/review-regressions-confirmed.log` 与 Webpack 失败；两个入口精确诊断 PASS |

新增 JSON 文件导入组件测试确认：校验成功后只转交同窗口 Sidebar 草稿；篡改源码哈希会在转交前拒绝；不授权、不执行，并清空选择器以允许重新选择。测试等待真实异步 handler 完成，修正了先用两个 timer tick 观察 crypto 完成的测试竞态。组件模拟不提升为真实 Chrome 证据。

## 本地验证结果

| 项目 | 真实结果 | 身份 / 原始证据 |
| --- | --- | --- |
| `npm ci --ignore-scripts` | PASS | 初始基线，`npm-ci.log` |
| 初始三个 roundtrip 回归 | FAIL：0/3 通过 | `draft-regression-before.log`，用于证明缺陷 |
| 初始 Demo / 项目与构建测试 | PASS | `demo-tests.log`、`project-build-tests.log`；不是当前原生验收 |
| 同步 main 后定向测试 | PASS：81/81 | `current-main/targeted-tests.log` |
| JSON 导入与 roundtrip 回归 | PASS：32/32 | `current-main/import-regression.log`，与其他集合有重叠，不能相加 |
| 最终受影响测试 | PASS：89/89 | `ci/local-regressions-after-ci-fix.log`；覆盖构建、源码、Page UI、目录导入、编辑器与资源拒绝 |
| 源码静态检查 | PASS | `current-main/final-check-tokenized.log`；产品/文档 `git diff --check` PASS（排除按原始字节保留的证据日志空白） |
| Page / Controller / 资源 Demo 校验与构建 | PASS；三份真实 JS SHA 都等于 artifact.sourceHash；draft 校验 PASS | `current-main/final-programs.json`、`final-programs.log` |
| CSS 远程、导入、转义、字符串图片 URL、未声明/越界图片 | PASS：明确拒绝 | `program-assets.test.mjs` 与最终定向日志 |
| 非法 JSON / UTF-8、CSS 单项及资源总量超限、PNG 签名伪造 | PASS：明确拒绝 | 同上；单项超限可先由 `E_PROJECT_LIMIT` 拒绝，总量为 `E_PROJECT_ASSET_LIMIT` |
| Controller 声明 Page 资源 | PASS：`E_PROJECT_ASSET_ENV` | 同上 |
| production / development 构建与包校验 | PASS：两个构建和两份包校验，sourceInputs 与最终代码一致 | `current-main/local-candidate-builds/`、`local-candidate-verify.log` 与 `final-local-identity.json` |
| 完整环境测试 | FAIL：293 项中 292 PASS，1 FAIL，0 SKIP | `current-main/environment-tests.log`；执行于 `c5fe462`，后续仅做受影响回归，未冒充最终全量 PASS |
| Native CLI 失败诊断 | FAIL：握手超时，Options 保持关闭 / Host 未连接 | `current-main/native-cli-diagnostic.log`；按钮 enabled、点击命中正确，未证明根因。此路径未变化，不重复同一失败 |

开发过程中还保留了测试观察器/驱动错误：新增测试最初误用 helper、超限错误码预期不符、验证驱动 import 相对路径错误，文件导入测试的异步观察竞态，以及 verify 包含两个模式而过早开始导致 development manifest 暂不存在。最终按两份构建完成后再校验通过。对应失败日志保存；修正后才重跑，没有将这些失败冒充产品 PASS。

## 三份最终程序身份

| 程序 | SHA-256 | JS / draft 文件字节 |
| --- | --- | --- |
| Page Demo | `4d8693b967e4e5e8b2cc1b67ca52e4dc0cde21fa08a145ade0da8364af0c859b` | 1582 / 3955 |
| Controller Demo | `d7210dd03e38dd9ded917e816289e2adf9b55e0c409a4f72c644091c8f0684c8` | 1194 / 3134 |
| Page 资源 Demo | `a88d116a40d75fc1b11803db7c73f53d38ea3c0705f3e7cdd7949d7334fc2619` | 1607 / 2665 |

Controller 的 Task JSON 仍为 Candidate；以上均为 `BUILT_UNVERIFIED`，未自动安装。JS 源快照可校验，不代表资源源码已进入 UI 文件列表。

## 原资源负向合同与当前 main 的差异

追溯 caseId：`resources-negative-R1`。原提示词要求资源 Demo 返回 `E_PROJECT_ASSET_BUILD`；初始 `bd47d40c` 确实非零拒绝，原始 `build-sidebar-assets-contract.log` 保留。执行期间 main 的 `2530b90d` 实现 Page 资源，`5769730b` 更新对应测试。当前 Page Demo 因此构建成功；不能继续把旧拒绝当当前通过条件，也不能回滚其他会话已集成的实现。原提示词保留，差异在这里显式记录。

当前边界：最多 32 项；CSS / JSON / 图片单项为 24 / 16 / 32 KiB；合计 60 KiB；Page 最终 JS 不超过 100000 字节。图片为有界 data URL，CSS/JSON 文本冻结在同一 JS；Controller 拒绝资源。不新增 CDN、运行时网络 fetch 或通用资源加载权限。

CSS 安全依据：[CSS 转义与字符串规则](https://www.w3.org/TR/css-syntax-3/)、[image-set 字符串 URL](https://drafts.csswg.org/css-images-4/#image-set-notation)。Node 负向验证证明构建拒绝；未据此宣称实际网页没有发出网络请求。

## 真实 Chrome 逐项结果

| 操作 / 通过条件 | 状态 | 失败原因或剩余工作 |
| --- | --- | --- |
| 受控 CFT 155、真实主进程参数、新 profile 与包身份 | PASS：仅启动身份 | 原始 launcher/check_instance receipt；不等于程序执行 |
| 唯一标准网页 `http://127.0.0.1:43111/demo-form.html` | PASS：实际响应字节 | SHA `815af5458d617b4688a504cfc265f81427ccfd847a718210c4cc9eeeeb510383` 与当前文件一致 |
| Chrome 原生入口打开 Sidebar 和完整任务目录 | OBSERVED | 在较早 fixed-bd47 包真实观察到；不是最新包的完整验收 |
| 选择 Page `program.opendesk-draft.json` | NOT_COMPLETED | 系统文件选择器中 Mac 锁定，自动解锁失败；无成功导入回执 |
| 多文件只读列表、切换与固定执行字节展示 | NOT_TESTED | 需解锁后完成实际 JSON 导入与逐文件观察 |
| Page DOM 标记、重复执行无重复节点、非目标拒绝及 document/执行回执 | NOT_TESTED | 无真实运行回执 |
| Controller 表单、参数、每次只提交一次及持久 runId/resultId | NOT_TESTED | 无真实执行和持久结果 |
| 旧 `.js` Page / Controller 兼容入口 | NOT_TESTED | 需分别完成原生导入执行 |
| Stop / 撤权 / 导航 / 关闭 / 重启 | NOT_TESTED | 不通过改 DOM 或伪造事件替代 |
| CSS 生效 / JSON 使用 / PNG 显示与运行期安全边界 | NOT_TESTED | 目前仅本地打包与拒绝测试 |
| 整个目录直接导入并编译 | NOT_IMPLEMENTED | 现产品只有文件导入 |
| Native Agent / Codex Chrome CLI 同候选闭环 | CODEX_E2E=NOT_TESTED | 独立 R6.2 工作流负责，且本地握手失败未解决 |
| 最终 F3 / ZIP 安装一致性 | NOT_TESTED | 本轮未执行，不继承其他候选结论 |

原生阻断来自 CUA 明确错误“Mac locked and automatic unlock failed”；后续自有实例绑定还返回 `cgWindowNotFound`。已请求用户手动解锁；未收到解锁回复。不得用 elapsed time 当作解锁或授权。为避免锁屏期间占用共享资源，本任务浏览器和 HTTP 服务已经清理。

借用既有观察器时还发现 launcher label 文件名不匹配，观察器未执行；错误保留。自有驱动 label 已对齐既有 `program-r3` 观察器，尚未重新运行，不能升级为原生 receipt。自有重启驱动的退出时序调整也未实测。

## 当前任务树与质量门槛

```text
多文件 Demo 本地验收
  工作区保护：已实施，完整备份证据；无剩余本地保护动作
  构建与导入一致性：已修复，Node/构建证据通过；无本地回归缺口
  CSS/JSON/PNG 安全边界：已修复，负向与预算证据通过；真实资源效果待测
  原生 Sidebar JSON 与源码展示：已有入口观察；锁屏阻断，待完成
  Page/Controller 执行和生命周期：无原生回执；待测
  Git 集成：仅集成已验证局部改动；原生验收保持开放
```

整体质量门槛 `≥95/100` 尚未满足：Sidebar、Chrome 和 Codex 闭环关键项未测试，不给满分或伪造评分。后续解锁后复用同一 worktree/分支，先核对最新 main 与 package/sourceInputs，再续原生操作；只有受影响输入变化时才重建，不重跑无关完整验收。

## PR #29 的远端检查与集成边界

PR：<https://github.com/shopable-ai/opendesk-browser/pull/29>。首个 head `03159aab02bbf2fc9898b344653de3349b5df8f5` 的 R3 与 bridge-components 各有两个新增 JSON 导入测试失败：它们仍用 timer tick 等待异步 crypto。之前等待 handler 的修改落在旧 JS 用例；现已对这两个精确用例改为 `await fire(change)`。本地 29 项目录测试及 89 项受影响测试通过；后续 CI 按更新的 PR head 核对，旧失败保留。

macOS arm/intel Native CI 另有真实失败：无插件的裸 Chrome/CDP 基线即超时，stderr 报 MachPortRendezvous 权限拒绝。最新 main `bd7c8d1b` 的两个原生 job 也在同一无插件基线失败；其 Native 测试、启动器和 workflow 未被本 PR 修改。基线 logs 为 `ci/job-113482212315.log`、`ci/job-113482212251.log`；PR 首轮 logs 为 `ci/job-113492784120.log`、`ci/job-113492784092.log`。不能将这个既有环境失败隐藏或通过跳过测试、关闭 sandbox 伪造通过。

本 PR 只集成具有 Node/构建/独立静态复核证明的局部修复。原生 Mac/Chrome/Codex 验收仍开放，CI 组件通过也不提升为原生 PASS。
