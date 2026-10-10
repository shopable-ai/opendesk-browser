# R3.1 独立质量审计附录：最终候选 6d1ab8f

状态：**正式签署；固定新候选的已支持 R3.1 范围质量为 96/100。**

审核者：`entrypoints_review`。日期：2026-10-10。本附录追加新的源码／包／原生证据绑定，**不修改或改判 992f117 原审计，也不覆盖期间失败的原始结果**。审核只读仓库、Git 和完整原件；未运行产品或 Chrome，未修改测试结果。本附录撰写于仓库外。

## 1. 本次签署的范围及评分

固定候选为 **`6d1ab8ff33fe306cb0127b688cb70a002b4a7141`**。它已包含后续合入的 Workflow 本机 Codex、Native 文件工作区、共享 Host／Worker 构建变化，以及真实控件布局、完整禁用状态和自有 profile 清理的测试修正。旧 992f117 包的 PASS 没有自动迁移到这些变化；本次使用新候选自己的编译包、191 个输入、原生完整记录与 CI 日志重新核对。

沿用已公开的固定 rubric，结果仍为 **功能与恢复体验 25/25、安全源码与组件边界 35/35、回归与交付 20/20、真实 Chrome 16/20，合计 96/100**。没有因为包更大、测试更多或多一轮通过而增加分数。

该评分只适用于 Installed Page `page.dom`、Installed Task `page.automation`，以及本轮普通 Controller／本地项目／Page Preview 的权限检查实现。它不是 R16 Workflow／Native 文件工作区业务的独立验收，不代表程序私有 Native／HTTP／Cookie 桥已经实现，也不是整体能力完成率、完整 F3 或 ZIP 安装验收评分。原生栏的 4 分缺口和全部未实现能力声明继续有效。

## 2. 并行合入的共享路径影响

直接比较 992f117、bd76b2d1、1f312b7 和最终候选，确认下列 R3.1 核心文件未被这些并行实现改写：`permission-gate.js`、`site-access.js`、`script-editor.js`、`page-program-library.js`、`task-workbench.js`、`installed-programs.js`、Task 服务、Authority、Broker、`controller-methods.js`、原始 Schema 数据与 Manifest。没有新 debugger 权限，也没有修改程序授权范围或安装身份规则。

| 共享变化 | 对 R3.1 的审查结论 |
| --- | --- |
| Host client 新增 Workflow AI 分流 | 沿用原 Host 注册与 Port，`host-bound` 同时交给两个反向协议客户端；AI 接收器仅处理 `native-agent.ai.*`，不吞普通 Controller 事件／响应，不改 Run 参数、安装身份或代次。 |
| Workflow HTML／CSS | 变化限于工作流区域。五个主页签、共享恢复行、普通脚本安装／运行控件及 `tool-shell.js` 不变；Workflow 自己的明确连接授权不能称为普通 Run 的权限申请。 |
| SW Schema 压缩器 | Schema 数据不变，运行时改用固定 DEFLATE 解码。因此此前不能借用旧包的原生 PASS。本次新包的实际启动、安装、Worker 重启、完整浏览器重启和新文档执行均已经通过，补上该共享运行时输入的 R3.1 证据。 |
| Native 文件工作区 | 新 `files.*` 入口限定为本扩展精确 `native-agent/workspace.html` URL、真实 documentId、顶层 frame；不加入 Page／Task 能力集，不读取或继承程序安装授权。文件派发检查已有 nativeMessaging；Manifest 和原工作台 CSP 不变，新增的是独立工作区的资源与 frame CSP。 |

这属于共享入口与 R3.1 授权不扩权的定向审查，没有对 R16 规划业务、文件编辑器或本机文件安全作扩大签署。原生结果证明这些共享合入后的**被测 R3.1 运行链**可工作，不能取代其他模块自己的审核。

## 3. 新候选的原始证据身份

| 项目 | 独立核验值 |
| --- | --- |
| sourceCommit | `6d1ab8ff33fe306cb0127b688cb70a002b4a7141` |
| 原生 CI／job | [38044176147／114190246604](https://github.com/shopable-ai/opendesk-browser/actions/runs/38044176147/job/114190246604) |
| 原生 artifact | [11667456213](https://github.com/shopable-ai/opendesk-browser/actions/runs/38044176147/artifacts/11667456213) |
| 原生 artifact ZIP | 186394 bytes，43 个原件；SHA-256 `c109ac3da2746c9fa5938605719480644682869d3bf2085bc47dcc5aeddd0ad1` |
| 双包 CI／artifact | [38044176139](https://github.com/shopable-ai/opendesk-browser/actions/runs/38044176139)／[11667236313](https://github.com/shopable-ai/opendesk-browser/actions/runs/38044176139/artifacts/11667236313) |
| 双包 artifact ZIP | 1949796 bytes；SHA-256 `3f7d51408d83da04edc43999c2b1a6ee9237921968d4bab9e75de652bee5e491` |
| production packageHash | `ef73b016a93ac49ba90ee153c0eb6162fe8b9eeacf6d73b7bc11f1689b511a5f` |
| development／真实运行 packageHash | `9e8c25d3da3e2ae643007f8a234b3522ff65214e1025908169e1e149428bc79a` |

本审核直接读取原生 ZIP 的 43 个成员，校验 CRC、逐成员原件字节和 ZIP 摘要。直接读取双包中的两个扩展 ZIP，逐个核对生产 **32 个**与开发 **47 个**真实编译文件的路径集合、字节数和 SHA-256，再按既定清单配方重算 packageHash；不是只比较两份汇总的 hash 文本。

两个构建报告共有的 **191 个 sourceInputs** 均与固定 Git 提交 6d1ab8f 的文件长度和 SHA-256 一致，构建中漂移为空。原生 `acceptance.package`、原生 lane 的开发构建报告、双包 lane 的开发构建报告三者完全相同。四个原生驱动／生命周期输入也与固定 Git 字节相符：

| 输入 | SHA-256 |
| --- | --- |
| `install-once-permissions-native.mjs` | `c51efa7d719c9773a10df2a00ee03b40941c979d436e823f66389b541422fe52` |
| `cft-isolated-launcher.py` | `f7cdb497aa2ea988dcd746241f81ef67b0697bfbbc02c81dc1a4ee211553083b` |
| `k5-sdk-native-restart.py` | `25f28cfc8dae6963f5d4075aa2dc41fdf5fadbf10f8a0b393dee635a9ec44a54` |
| `sidebar-native-session.mjs` | `ff56e4c6753c7df6e702fce9bd52e9ed0dac52e09803a51405e2ca51da2c64df` |

复核时工作区 HEAD 为 `82828fbaaf6ecd7ed35078acb2b1fd34de13eb4e`，其与 6d1ab8f 的文件树比较为空，191 个构建输入及上述四个输入再次核对无差异。本签署仍保留原生 sourceCommit 的精确身份，不把后续文档／原件归档提交冒充重新运行过的原生候选。

## 4. 原始原生数据的独立交叉核验

本次直接逐份读取 installation baseline、22 个文档快照、浏览器恢复快照、禁用快照、权限观测、即时事件与 launcher／cleanup 原件，核验如下事实。

| 验收 | 原始结果与交叉检查 |
| --- | --- |
| 正式安装和独立身份 | 4 个场景中的安装场景 PASS；57 个产品输入事件均真实可信。A installationId=`8eee6830-82f9-4e3f-909a-e6278a98a135`，B=`9ced03c1-d30a-4c18-a946-47bc000af4e3`；两个 nativeId 也不同。普通 JS 的固定源码、规则与程序能力保持原样，B 明确停用。 |
| 禁用完成 | 事件先观察到 B 仍 active／registered／nativePresent=true，随后观察到 enabled=false、authorization.status=disabled、nativeState=disabled、nativePresent=false。最终 `disable-b-latest.json` 与 installation baseline 完全相同；没有把持久拒绝已写入、原生注销尚未完成的中间态当作操作完成。 |
| 20 个自动执行文档 | 每个文档的 actualFrame、documentId、URL、installationId、grantGeneration、sourceHash、manifestHash 与原记录相符，状态 completed。第 n 个快照恰含 n 个 A 的完成回执，每次只增加一个新文档，前序回执逐字段保持不变；B 回执始终为 0。 |
| Worker 重启 | 原生 10:16:35.844 stopped、10:16:35.931 target absent、10:16:35.959 running；context uniqueId 从 `576257597964987861.4996029442460344759` 变为 `7295125661136862904.-1398081463495164461`，observerId 也变化。旧 20 回执不变，第 21 文档 `4CB80FBA3E5424336AB892061A3E05F6` 在原浏览器 session 成功。 |
| 完整浏览器重启 | PID 1988 以 0 退出后启动 PID 2247；profile device=16777228、inode=3525888、路径、可执行文件和参数相同。session 从 `561b5c9f-65ac-4d3e-82fe-287d0e9e370e` 变为 `2d585145-daf2-4c5b-a41b-9579d52462d3`；当前 Chrome 实际只注册 A，B 仍未注册。旧 21 回执不变，第 22 文档 `AAE9E5C82ED9A2E30A64E6B283E5980C` 成功。 |
| 权限与授权复用 | 22 个 documentId、22 个 receiptId 均唯一。所有快照中的两份安装授权、approvedAt、generation、scope、版本、Chrome 权限和实际注册集合与 baseline 相同；后一浏览器新回执使用新 session。 |
| 请求观测 | 4 个观察上下文、51 个检查点；每个文档前后都有检查点。即时事件、原生报告与权限观测文件相符，请求总数 0、观察错误 0，没有清空旧代累计记录。 |
| 清理 | 两个 Chrome 子进程均 exit 0，launcher exit 0；原 profile 一次删除成功，profileMode=0700，residual／errors 为空。cleanup 不增计为第五个功能场景。 |

原生最终状态为 **4 类场景全部 PASS、共 22 个真实新文档**。它仍只在一个合成 loopback origin 执行；`*://*/*` 被显示、持久化和注册，并不等于已经跨所有网站／HTTPS／端口运行。观察器附加前的启动窗口继续是 NOT_OBSERVED。

### 新等待与清理修正没有降低授权断言

控件点击现在只读等待实际元素未 disabled、矩形和中心坐标为正、computed visibility 为 visible，并保存观测；满足后仍只发送一组原生 mousePressed／mouseReleased。安装源码、身份、执行结果、权限计数和 trusted input 断言没有删除。新等待修复的是首次布局尚未完成时的测试抢跑，不会申请权限或自动执行程序。

禁用等待要求真实 Chrome 注册已经移除，同时保留较早的持久拒绝。新增组件故意延迟 unregister，证明旧 token 和当前 disabled token 均被拒绝，来源读取／实际执行／回执均为 0；不因旧 bootstrap 暂时仍在 Chrome 注册集中而泄露源码或启动用户脚本。

profile 清理仅对 ENOTEMPTY 作有限重试，每次重核自有子进程退出及相同 profile 身份／模式；其他错误仍失败并留存证据。最终本次无需重试即成功，16 个 cleanup 故障测试是无浏览器的独立验证，不能计为额外原生业务场景。

## 5. 当前原始回归及包结果

| 验证 | 真实结果 | 原始来源 |
| --- | --- | --- |
| R3.1 授权定向组件 | 235 tests／235 pass／0 fail／0 cancel／0 skip | 最终原生 artifact 的 `components.log`，原生 CI 38044176147。 |
| 自有 profile cleanup 故障测试 | 16 pass，`browserStarted=false` | 最终原生 artifact 的 `profile-cleanup.log`。 |
| 完整 environment | 721 total／714 pass／0 fail／0 cancel／7 skip | [job 114190246945](https://github.com/shopable-ai/opendesk-browser/actions/runs/38044176170/job/114190246945)，`native-agent-job.log` 的最后一组 TAP 汇总。 |
| check | PASS，265 份源码／测试／构建文件 | 原生 artifact `check.log` 与对应 CI。 |
| 双构建与 verify／pack | PASS；生产 SW=326336 bytes，开发 SW=326502 bytes | [双包 CI 38044176139](https://github.com/shopable-ai/opendesk-browser/actions/runs/38044176139) 及两份构建／打包回执；生产仍受原 327680 bytes 上限。 |
| 两个 ZIP 实际字节 | production 32 files、development 47 files 均逐文件匹配构建报告 | 本审核直接读取 ZIP 字节，并与 CI 的 `ZIP_EXACT_DIST_BYTES=PASS` 输出相符；没有进行 ZIP 在 Chrome 中安装。 |

生产 ZIP SHA-256：`502b5988055af58f5cf01e8e9827faa42948ef8b786459403f820b3aab4bbbeb`。

开发 ZIP SHA-256：`4dd51bc3671ee78538daba803ae83c372c056b40e56feeeae1d08ca2a8026b22`。

235、721 与早期 233／627／262 等集合有重叠，分别报告，不相加计算完成度。Native Agent workflow 名称不把全部 Node 测试变成原生 E2E；7 个 skip 不计 pass。其他未变模块按原输入和原测试等级复用，本附录不重签 R16 或文件工作区业务。

## 6. 保留的期间失败

- **bd76b2d1 原生 FAIL**：直接读取原件，tests=[]、documents=0，错误为 B 已持久 disabled 但实际 Chrome 注册仍存在。原始断言准确指出观察到了注销中间态；后续加强完成状态等待，并补延迟 unregister 的拒绝测试。该轮没有功能用例通过，不能回改成 PASS。
- **7fa53d1 原生 FAIL**：[run 38043920288](https://github.com/shopable-ai/opendesk-browser/actions/runs/38043920288)。ZIP SHA-256 `3f15daec7f2ed691d61f5efc7143d99fc190ed9ec1ad1f96ea41d25074b65a96`。错误为 `Visible enabled native control`，发生在首次 tab-develop 点击前；tests=[]、documents=0、trustedInputs=0。其 request=0 不是正常运行零申请的证据。该轮 cleanup 单独 PASS，仅一个 Chrome 子进程退出、profile 删除成功。
- **7fa53d1 environment 非成功**：原始最后汇总为 720 total／712 pass／0 fail／1 cancelled／7 skip。不能因 fail=0 宣称全环境通过。6d1ab8f 的 721／714／0 fail／0 cancel／7 skip 是新的独立成功记录；取消案例的后续测试收敛不改写原始取消。
- 992f117 之前各候选的 PASS／FAIL 继续按原审计与原 ZIP 保存；本次不修改历史结果。

## 7. 评分缺口继续开放

程序私有特权 HTTP／浏览器 Cookie／宿主存储／Native Messaging 桥仍未实现。新 Native 文件工作区属于自己的受信任界面，不为 Installed Page／Task 补上这种程序桥，也不能由“已有 Native 功能”推断普通脚本获准使用文件能力。

原生仍未验证：Chrome 网站撤销／拒绝／主动恢复完整循环、User Scripts 关闭恢复的异常排列、同范围升级和扩权确认、Controller／本地项目各 20 次原生运行、恶意跨程序 RPC／旧回执／多标签竞态，以及运行中强杀且副作用未知的全部排列。组件拒绝证明不升级为这些原生场景 PASS。

Native `run.start` 直接传已安装 `task:` saved source 的安装快照兼容缺口、Page 停用不回滚既有效果／不立即清除任意定时器、观察器启动前窗口、单 origin 覆盖和完整 F3／ZIP 安装的边界，均延续 992f117 审计。质量评分保持 96，不为上述未完成能力补分。

## 8. 原件摘要及签署

直接读取目录：`/workspace/scratch/eceef8694f0a/r31-evidence/ci-6d1ab8f/`。关键 SHA-256：

| 原件 | SHA-256 |
| --- | --- |
| `acceptance.json` | `b5f6a7de6f8da50784cf42c0224c7746e8b27811eb846d62f1f9ea1cb2bead70` |
| `permission-observations.json` | `50b8b24acf4b04458f5a24bfbd4be526ff3ad4cf8602f2b80283fce303a1e55e` |
| `build-development.json` | `8aa39b8cf562b700afe64bfb096e04bbd6003d3ed572ac1d5edd12da00d9b485` |
| `native-job.log` | `bb331c46826516113292a673d4d1d6b790faa4b8ca97ee678986e96201fa17d0` |
| `native-agent-job.log` | `7708d79ff8c513db56f9d2dfb150012b230143f21371457d7194437ef1f7a6a3` |
| `package-job.log` | `6c803c171477664f30de8783f82c9ce1b5d196d03479f56c8f16ad2b58123228` |
| `profile-cleanup.log` | `f39b1dad93f361468c7172d1dd2a0291ff7aa8090bc73fa1a1d6a08eb5b293ca` |

**签署：`entrypoints_review`，2026-10-10。** 依据固定新候选 6d1ab8f 的完整原生原件、真实编译 ZIP、Git 输入、当前 CI 日志和定向共享路径审查，正式签署上述已支持 R3.1 范围 **96/100**。不是将 992f117 的分数直接复制到新包；新增共享输入的被测 R3.1 证据已闭合。无须为仅后续文档／原件封存而重复原生轮次；产品或验证输入再变时，须按实际影响重新核对绑定。本签署是审核责任记录，不宣称密码学身份签名。
