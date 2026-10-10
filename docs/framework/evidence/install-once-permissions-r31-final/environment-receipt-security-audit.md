# R3.1 可选 jQuery 环境回执补丁：独立定向审查

审查者：`/root/entrypoints_review`。日期：2026-10-10 UTC。

**结论：本次旧 jQuery 回执复用缺口在源码与定向组件证据层面关闭。未发现补丁使用户错误获得跨程序撤销能力、绕过安装身份或重新申请 Chrome 权限的路径。** 此结论仅适用于下述固定输入，不是新包原生 PASS、总体质量重新评分或最终 F3。

## 固定输入与原始证据

生产补丁提交：`c650a3c1c4ea9afc3ba7aa3c29d2e13ffd4e7734`。审查时 main：`a405fb73f931c7cc6577fa86e312cf40905bb9a8`。下列五个工作区文件与补丁提交中的相应 Git blob 逐字节一致；审查时工作区无未提交差异。对比基线是引入可选 jQuery 后的 `4d2fb2a4`。后续构建预算等并行提交不属于这次权限审查。

| 文件（仓库内相对路径） | 字节 | SHA-256 |
|---|---:|---|
| `src/scripting/user-scripts/execution-source.js` | 6343 | `94a46dd648826b803b5961de97e642e85872c3b570494cedbd937ee9e4ba6ea3` |
| `src/scripting/user-scripts/preview.js` | 18702 | `b5a7fb28698fa3110e4aeca8ed872ccf41368524d11caac2c6d519f89e4737b2` |
| `src/scripting/user-scripts/installed-programs.js` | 32433 | `80325be415c4a505561b775124b63951fad0161e594a8bfcd335441b4c802c0b` |
| `tests/environment/builtin-jquery.test.mjs` | 3519 | `ab77316b5cd0cd9d958bf8dd6c01576bf384212362ac3ee4c34dbaedb80663fb` |
| `tests/environment/page-installed-programs.test.mjs` | 38749 | `12a1868ec1bcff3ad5df038b8d64262f250dd88bc748e39c7d85adbf0f2b9645` |

独立读取完整原始日志：`/workspace/scratch/eceef8694f0a/r31-evidence/environment-receipt-targeted-final.log`，4532 字节，SHA-256 `6781193baa5b9d62d35a832eb2d4ef9888010d25ea276054eb15e8ce748a1b71`。日志明确为 **38 tests、38 pass、0 fail、0 cancelled、0 skipped**，包含新增的三条安装/回执回归及既有 jQuery 编译、普通自动运行、撤权、跨程序身份和预览回归。审查者未重新执行这些测试；日志与源码分别固定，不将无内嵌源码清单的文本日志解释为新的包或原生身份回执。

## 已核实的关闭机制

1. **证明来自可信编译结果。** `execution-source.js:48–52,91` 先核对扩展内 jQuery 固定字节的 SHA-256，再仅对声明 jQuery 的源码添加 `packagedJquerySha256`。`preview.js:196,261` 从编译结果形成外层回执字段，用户返回值只进入 `resultText`。普通脚本省略字段，不写入会导致 canonical/digest 失败的 `undefined`。
2. **旧证明不能批准新环境。** `installed-programs.js:26–31,71–79` 在原有候选身份、sourceHash、receiptHash 校验之后，要求声明 jQuery 的固定源码具有匹配的库哈希。`verifyPageCandidate():114–118` 对新验证结果也做同一检查；旧版本验证仍走现有 proofFor，不覆盖旧回执或自动执行原文档。Install、Available、Enable、reconcile、boot 及派发前/结果交付前检查最终均复用该证明验证。
3. **暂停持久且绑定当前安装。** `installed-programs.js:229–236,414–430` 沿用原 `frameworkKV` 安装行、串行 mutation 队列和事务，只有当前 nativeId/token/授权状态仍相符时才更新；轮换 token、递增 generation 并置为 suspended。Worker 重启和原 Chrome 权限仍有效均不能使这条旧授权自动复活。
4. **E_PAGE_ENVIRONMENT 不从用户错误代码透传。** 本次检索全部生产源码后，此错误仅由内部 `verifiedEnvironment()` 的固定候选/回执比较产生。`pageConsumerSource()` 将用户异常转换为字符串失败结果；`preview.js:246–251,262–265` 使用扩展自己创建的 `E_PAGE_SCRIPT_EXECUTION` 或 `E_EFFECT_UNKNOWN`，不会把用户的 `error.code` 当成内部环境错误。用户返回 `{packagedJquerySha256: ...}` 也不能改写外层证明。暂停分支没有新增跨 namespace 或仅按 programId 的查找，也不会用旧 token 改动新安装。
5. **兼容与权限边界保持。** 未声明 jQuery 的旧证明没有新字段要求；原普通脚本 20 次自动运行及组件级重启恢复测试继续通过。旧 jQuery 版本要求载入并保存新 revision，明确 Verify/Install 后恢复；同范围新版本复用原 installationId、approvedAt 及 Chrome 权限，保留旧固定回执。未新增权限请求、授权库、数据库 schema、SDK 通道或执行世界。Manifest、Page scope/contract、world 隔离及独立 SDK 对应路径在此补丁中未修改。

## 回归证据的实质内容

- `page-installed-programs.test.mjs:126–174` 分别构造缺失及错误库哈希的旧回执，并重新计算 receiptHash，确保拒绝来自环境不匹配。Verify、Available、Install、Enable 均拒绝；通过启动 reconcile 和直接 boot 两条路径验证持久暂停。断言用户执行次数、新 execution 行、权限请求均为 0，token/generation 改变，重启后不复活。
- 同一测试创建相同源码的新 revision 并明确验证、安装，断言原 installationId/approvedAt 复用、原回执内容不变、旧 token 仍拒绝，安装不会重放旧文档。
- `page-installed-programs.test.mjs:176–184` 验证新 Verify 收到缺失/错误环境证明时不能持久化 verification 或安装行。
- `page-installed-programs.test.mjs:186–202` 走真实 loader、固定 vendor 字节哈希检查、compiler 和 preview 外层结果路径，证明 UI 注入环境字段得到 E_SCHEMA，用户返回伪造字段不能覆盖可信外层哈希。
- 此最后一项仅在 native execute 组件替身中替换 vendor 的 DOM 初始化；实际编译输入仍包含经生产校验的完整 jQuery 字节。它证明组件接线及来源边界，不证明真实 Chrome 中 jQuery DOM 初始化/功能或原生新版本自动运行。

## 证据等级与交付边界

本审查状态为 **SOURCE_REVIEW_AND_TARGETED_COMPONENT_PASS**。没有重新运行 Chrome、构建或全量测试，没有写入仓库或修改原始日志。新候选 check/build/CI 由集成者另行记录，不能用本报告替代其原始证据。历史固定 `6d1ab8f` 的 96 分与原生 22 文档，以及 `eeb3af02` 等后续固定候选的原生证据，均保留原绑定，未转移到本补丁或合并后的新包。

未发现需要阻止这次定向补丁合入的源码问题。普通程序私有 HTTP/Cookie/Native 桥及既有真实 Chrome 验收缺口不在本报告中增加能力声明或宣布关闭。

签署：`/root/entrypoints_review`，独立只读定向审查。
