# R3.1 93b1fa4a 最终独立安全审计

审查者：`/root/authorization_audit`。2026-10-10 UTC。

**固定版本在已声明的 R3.1 支持范围内通过，独立审计评分 95/100；未发现未关闭的具体 P1/P2。** 本次按新候选的源码、组件、原生原件及实际安装包重新评分，未搬用 eeb 或 6d 的分数。该分数不代表所有能力完成、不代表 F3，也不代表全部 CI 成功。

固定代码为 `93b1fa4aae020785b3af50d629312dc755ff502e`；tree 为 `1fedd74d59ba4aef62b72455f3ded56cd0e1e189`。只读审查，没有启动测试、构建或 Chrome，没有修改仓库或旧报告。

## 1. 源码与安全边界

与 eeb 独立审计相比，相关全部 `src`、Manifest、entrypoints、WXT/build/verify 入口仅有五个源码文件变化，均已具体归属：环境 compiler/preview 与 `c650a3c1` 逐字节一致；registration 仅将可选 jQuery 固定字节转交现有 compiler；Controller 与 Page installed 两份文件完全等于独立常量复用证明的 after SHA。后者精确包含 15 个私有字符串常量绑定、2 条声明和 268 处等值替换，原条件、消息、权限判断与执行语义不变。完整逐文件 SHA 在 `r31-93b1fa4a-input-binding.json`。

Page 与已安装 Task 的安装身份、generation、当前状态、权限范围及目标文档持续校验仍生效；旧 token、旧代次、停用后迟到结果、卸载重装 ABA 和未知副作用不能凭恢复 Chrome 权限复活。不同程序不能继承对方的安装授权；已安装 Task 不能借普通 Controller 的显式附加 Origin 获得跨站服务能力。已独立动态复核的 Controller 撤权补丁仍绑定本版：附加 Origin 的 onRemoved 同步栅栏、无事件但 contains=false 的持久失效、active/finish/replay/snapshot 全范围静默检查和结果保留语义均未改变。历史结果不会仅因导航或 Worker 内存 epoch 改变而误失效，撤权后的旧 run 不能因 regrant 重放。

c650 修复要求可选 jQuery 的验证回执携带可信 compiler 产生的固定库哈希，用户返回值不能伪造外层证明，旧环境证明不能批准新环境；普通脚本旧证明仍保持兼容。新增差异没有新权限数据库、执行器、Manifest 扩权或 SDK 文档授权替代路径。上述结论有固定源码、原独立复现修补与当前组件回归共同支持，不把未执行的原生异常用例宣布为 PASS。

## 2. 本版原始验收

我直接重读 22 份 document 快照、安装基线、重启后的状态、permission-observations 与 acceptance，并重算两个外层 ZIP 的 SHA。另读取 verification_review 的独立实际包附录；194 个构建输入、4 个 driver 输入及 47 + 32 个实际编译文件的全量绑定由该审查者逐项验证，本报告不虚称再次做了全部文件重算。

- **22 个独立文档、22 个独立回执，51 个检查点的 permissions.request 全部为 0。** 前 20 次是已安装普通脚本自动执行；Worker 和完整浏览器重启后各新增一次。各次只增加当次回执，旧回执及记录中的授权、scope、sourceHash、manifestHash 保持不变。
- A/B 安装 ID 与 Chrome registration ID 独立，A active，B disabled 且实际注册缺席；B 执行回执为 0。Worker 的 stopped → target absent → running 与新 native context 链完整，共 3 个 Worker context、4 个 observer。
- Chrome PID **2244 → 2542**，同 profile device/inode **16777229 / 3525679**；新 session 建立后旧 21 条回执逐字段不变，仅第 22 条属于新 session。两个自有 Chrome 进程和 launcher 均 exit 0；profile 删除、cleanup PASS，errors/residual 为空。
- R3.1 定向 **251/251 PASS**、check **271 文件**、build:dev PASS；完整 environment 为 **734 total / 727 pass / 7 skipped / 0 fail / 0 cancelled**。Controller 另有 **57/57 组件及 12/12 真实 Chrome 场景 PASS**，包括显式 Origin 的真实 GET/POST、未声明 Origin 拒绝和 HTTP 错误原因保留。
- 实际开发包 47 文件、生产包 32 文件，均匹配本版固定源码。生产 `sw.js` 为 **327,027 B**，原预算仍为 327,680 B，余量 653 B。开发 packageHash 为 `598bd11c2729c243f9fff7d48c60c8806f3d5012894ff142295d9ffaddfc97e0`；生产为 `0ef0f12c6f9eb91fe841778aa989520833f9228f9d6a5b78669e8b72bb960d4b`。

原始 CI：[R3.1 Chrome](https://github.com/shopable-ai/opendesk-browser/actions/runs/38047731739)、[Controller](https://github.com/shopable-ai/opendesk-browser/actions/runs/38047731648)、[双安装包](https://github.com/shopable-ai/opendesk-browser/actions/runs/38047731610)、[全 environment 所在 NativeAgent lane](https://github.com/shopable-ai/opendesk-browser/actions/runs/38047731605)。NativePage lane 的 136 项是另一组定向测试，不是完整 environment。

## 3. 必须保留的两个整体失败

同一固定提交的 13 条 workflow 中为 **10 条产品 success + 1 条 cleanup success + 2 条产品 failure**。cleanup 不计产品能力通过。

1. [R16.1 SDK run 38047731712](https://github.com/shopable-ai/opendesk-browser/actions/runs/38047731712)：原始日志出现 NATIVE_SDK_AUTO_PASS 和 NATIVE_SDK_PUBLIC_HTTPS_PASS 后，after-hook 清理 `/tmp/opendesk-sdk-auto-…/Default` 报 ENOTEMPTY；测试与 workflow **整体仍为 FAIL**。业务标记不能抹去清理失败。
2. [R16.1 Page builtins run 38047731672](https://github.com/shopable-ai/opendesk-browser/actions/runs/38047731672)：可信 Allow User Scripts 开关未生效，专门业务用例尚未执行；**专门 Page builtin 原生 workflow 失败**；jQuery 升级原生仍未测。R3.1 普通脚本 22 文档不能替代这个证据。

两份原始失败日志与 workflow 映射均已读取并在机器回执记录 SHA，未修饰、删除或归类为成功。

## 4. 本次评分与适用范围

| 维度 | 得分 | 本版依据与扣分 |
|---|---:|---|
| 已支持的安装与运行功能 | 25/25 | 当前源码/组件与当前普通脚本原生运行链共同支持授权复用、持久安装和明确恢复 |
| 源码与组件安全边界 | 35/35 | 已复现的高优先级问题均关闭，固定输入吻合，未发现本轮新增具体 P1/P2 |
| 回归与交付可核验性 | 19/20 | 当前定向、完整环境、Controller、真实双包可绑定；相邻两个 R16 整体失败，交付扣 1 分 |
| 真实 Chrome 证据 | 16/20 | 20 次自动执行、独立身份、双重启得到实证；下列四类异常/交互原生验收各保留 1 分 |
| **合计** | **95/100** | **限定本版 R3.1 支持范围，不是测试数量换算出的完成度** |

仍缺四类原生验收：站点撤权、授权泡泡及主动恢复；同范围版本升级与扩权确认（包含旧 jQuery 环境恢复）；对抗性跨程序调用、旧回执与注入竞态；Controller/本地项目各 20 次原生循环。observer 附加前启动窗口未观察，普通脚本 22 个文档仍来自单一合成 loopback 来源。本版专门 Page builtin 原生 workflow 失败；jQuery 升级原生仍未测，不能宣称真实依赖升级已经完成。

旧 jQuery 环境恢复应明确执行载入 → 试运行 → 保存新 revision → Verify → Install；Verify 本身也执行固定源码一次，加载并保存不足以形成新证明，不能静默重放旧副作用。普通 Page/已安装 Task 的 OpenDesk 特权跨站 HTTP、Cookie、Native 桥尚未实现为可用能力，未在本评分中冒充 PASS；普通 JavaScript 自身网页 API 的行为与特权桥是不同边界。独立网页 SDK 仍保持文档级授权，不因本报告扩大范围。

本版原始回执核验为 `r31-93b1fa4a-final-readback.json`，评分机器结果为 `r31-93b1fa4a-final-audit.json`，完整安装包验证附录为 `r31-evidence/ci-93b1fa4a-independent-integration-appendix.md` 及同名 JSON。所有较早版本报告保持原样。
