# 重复字面量预算收敛：独立安全附录

**PASS，限两文件的精确字面量复用。** 审核基线为 `a405fb73f931c7cc6577fa86e312cf40905bb9a8`；本次没有调整评分、权限支持范围或原生验收结论。独立读取固定 Git 原文和当前文件，使用 Acorn 8.15.0 重新解析并比较完整 AST，不只采信主任务提供的 `normalizedASTEqual` 字段。

| 文件 | 修改前 SHA-256 | 修改后 SHA-256 | 私有常量绑定 / 引用替换 |
| --- | --- | --- | --- |
| `src/scripting/user-scripts/installed-programs.js` | `80325be415c4a505561b775124b63951fad0161e594a8bfcd335441b4c802c0b` | `c19d11a1eab47d99ab4dbd7be61f1d95ab97ca187f8663c45f015a89cfa592c7` | 7 / 125 |
| `src/platform/host/controller-methods.js` | `5c3d7fdf93036aa488f2e514d53c64505147863962f588d8a2f5400a90006a8b` | `c84df72f4921545e9b2b9c2130773dc57e6a88200081e8171827f6fadce5ac8c` | 8 / 143 |

独立确认共 **15 个 const 绑定（2 条声明语句）、268 处等值引用替换**。常量均为未导出的纯字符串，置于原顶层执行语句之前；新名称在旧 AST 中不存在。每处引用均核对为值表达式，排除局部遮蔽、写入、导出、简写属性及非计算属性键替换。只删除这些新增声明、将各引用还原为其精确字符串值并去除源码位置／Literal 引号元数据后，完整 AST 逐字相同；模板原始字符串仍参与比较。因此没有属性 mangling、消息值变更、权限条件调整、存储键／状态 tag／错误码变化或执行顺序改动。Page bootstrap 仍以原有代码字符串和 JSON 值生成，没有把模块局部常量名称带入注入源码。

Controller 修改前字节与此前已审计实现一致。Installed Page 修改前字节也与 `independent-jquery-environment-receipt-audit.md` 所绑定的 `80325be4…` 完全一致；该 jQuery 回执补丁已由 `entrypoints_review` 单独审查，本附录只确认此次常量提取没有改变它，不扩用旧原生包的 PASS。未发现该精确差异引入新的安全阻断；生产包预算、254 项检查及后续 CI 结果由主任务另行记录。

独立证明及可重跑脚本分别为 `r31-exact-literal-independent-audit.json`、`r31-exact-literal-independent-audit.mjs`。输入证明为 `r31-evidence/exact-literal-budget-equivalence.json`，旧新文件摘要与其记录均吻合。仅在 scratch 保存本附录与核验器，未修改仓库、原证明或旧审计报告。

- 独立 JSON SHA-256：`b9e2d133aac479537ec3709d09875cb88b118ae147720668a57a39f01485fba4`。
- 独立脚本 SHA-256：`a7bb6e85751b5e3de3dabb4fc38e6bfd79836712603742d1fc9ff53abc6a1bb2`。
- 输入证明 SHA-256：`dec1329b500702d8b78e886b9ace2dbf959e11e00cc7376136b09ec296d4cd70`。
