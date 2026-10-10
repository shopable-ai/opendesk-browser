# R16 最终证据索引

本目录保存同一次实施的原始成功、失败和中间候选，不删除失败、不混淆组件、真实 CLI 和真实 Chrome。

## 最终入口

- `final-evidence.json`：最终源码/测试/产物哈希、命令退出码、候选绑定、保留失败和未验收项。
- `independent-review.json` / `independent-review.md`：未参与代码实现的独立 reviewer 原件；总体 NOT_ACCEPTED，原生 NOT_TESTED。
- `final-acceptance-components.log`：33 个测试文件，完整 TAP，475 tests / 475 pass / 0 fail / 0 cancelled / 0 skipped；112806字节、SHA256 `6a46aa3ea14c3820adc366f4cc6761e7db6c3e688b9ec60b2b125a7353ad8bf5`。
- `final-acceptance-source-check.log`：259 文件语法与构建合同检查。
- `final-main92-build-production.log`、`final-main92-build-development.log`、`final-main92-verify-packages.log`：同候选实际构建和校验。
- `builds-final/build-production.json` / `builds-final/build-development.json`：每包184个输入、完整模块来源和30/45个产物文件的哈希。
- 所有命令对应的 `*.command.json` 保存实际命令、工作目录、时间、时长和退出码。工具界面可能截断长输出，原始日志文件保留完整内容。
- `real-model-workflow-compile.json`：真实合成模型输出经原编译器生成相同JS/hash，并在明确mock Page API上执行两次。这不是Chrome/RunHost/保存验收。

Go实际交付commit：`005a2f33a640c76565775a398b243f1d66a6caf1`。其对应证据目录是另一个仓库的 `docs/integrations/browser/evidence/r16-20261010/remote-control-final/`；本目录最终索引重新核对生产8文件与测试3文件、真实提议及原编译器输入。

`publication-upstream-integration.json` 记录发布前 main789→main992 的纯文档/原生测试等待改动；184构建输入与33组件输入逐项不变，冻结 review 原件未改。

## 过程证据的限定

- `builds/`：a8f1c08集成阶段的旧production/development包。
- `builds-integrated/`：be0884e集成、停止/压缩修复前的development包；同阶段production超限失败。
- `builds-before-event-scope/` 与早期 `final-components` / `final-build-*`：统一Stop/压缩修复后的324例中间候选，尚未加入最后事件身份校验，不代替最终包。
- `builds-4e397463/`、`review-4e397463/` 与 `final-candidate-*`：main92 之前的329例候选、两包和独立审阅原件；`review-4e397463/archive-map.json` 对应其采集时旧目录名，不改写历史 review。
- `integration-main92.json`：main92 的三个重叠文件合并记录。`final-main92-components.log` 保留首轮429 PASS / 2 FAIL。`integration-main789.json` 记录后续上游文档/CI/测试的保留，采用其等价夹具修复并增加无grant正例；没有修改生产授权校验或构建输入。
- `final-main92-candidate-components.log` 实际只有381条结果、缺完整尾部；尽管命令exit0且工具曾显示433汇总，不能用作完整PASS证据。最终另名顺序运行、完整捕获原始stdout、fsync及原子落盘，使用上列475例日志。
- `schema-compression/`：静态Schema编码的独立暂存测量、准确往返及错误边界测试。只涉及现有数据表示；正式包以上述最终build为准。
- `stop-cleanup/`、`stop-event-scope/`：停止竞态最初红灯、历次候选和最终增量的原始日志及补丁/哈希。暂存组件用模块覆盖加载，不冒充实际Chrome。
- `integrated-components.log` 缺少完整终结汇总，只有235条可见通过；对应exit0不能补足该证据。**不使用曾显示的298通过计数。**
- `integrated-build-production.log` 保留335273 >327680字节的真实失败。最终修复没有提高门禁，main92生产SW为326336字节，开发SW为326502字节。
- `build-production.log` 保留依赖位于仓库外触发provenance拒绝。修复是把本轮安装的锁定依赖放回仓库内，没有放宽检查。
- `package-initial.log` 保留旧测试14入口与已批准15入口不一致的失败；之后使用完整显式15项清单。
- `integrated-build-development.log` 是脚本名误写导致的失败；`integrated-build-dev.log` 是本轮旧build锁拒绝；`own-stale-build-lock.json` 记录经原OS锁和stale-owner检查取得并正常释放的清理，不修改锁策略。
- `node-native-socket.log`：2 PASS / 7 EPERM，实际Go/Node Native互通未测。Go原24项测试登记债务是既有基线失败，也不隐藏。

原始 WXT/TAP 输出及 patch 上下文按字节保留，包含工具产生的尾部空格。整体 staged whitespace 检查因此有提示；23个源码、测试和说明文件的限定检查通过。详见最终 manifest 的 `whitespaceValidation`，没有修改仓库 whitespace 策略。

## 未验收

没有本轮真实macOS App安装、Chrome Sidebar可信点击、Native权限、实际模型发起Browser观察并返回、真实Controller持久Run/Save/Reload、关闭AI后两次真实执行或独立F3/ZIP安装验收。本目录任何组件或Linux CLI结果都不提升为这些项目的PASS。执行入口见 `../../prompts/goal-r16-local-macos-acceptance.zh-CN.md`，完整实施报告见 `../../workstreams/r16-local-codex-20261010.md`。

另登记 main92 上游 Page 兼容边缘：旧冻结有 header / 无 @match / 无 @noframes / 显式 allFrames:true 的 Page，在新 main-frame 默认下会安全拒绝重验；R16 不创建此类 Page manifest，也不为兼容而放宽权限校验。
