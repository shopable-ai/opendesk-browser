# 独立验收机制 follow-up

机制修补复核通过（APPROVE_MECHANISM_REPAIRS_ONLY）。原11项发现全部在限定范围内关闭，65/65项独立机制探针通过。**这不是F3评审；所有未测native场景仍为pending。** 原 REQUEST CHANGES 报告未修改。

| 原发现／严重度 | 当前位置 | 复现与判定 |
| --- | --- | --- |
| AMR-01 / HIGH | [checker:134](/Users/shopme/Documents/workspace/opendesk-browser/tests/framework/verify-product-acceptance.mjs:134) | 追加坏concurrency/crash/download/termination观测（快照重签）均被对应谓词拒绝。 |
| AMR-02 / HIGH | [checker:115](/Users/shopme/Documents/workspace/opendesk-browser/tests/framework/verify-product-acceptance.mjs:115) | 复用session/round或raw hash/pointer被拒；原始JSON pointer的identity/time不符也被拒。 |
| AMR-03 / HIGH | [checker:84](/Users/shopme/Documents/workspace/opendesk-browser/tests/framework/verify-product-acceptance.mjs:84) | 缺/错合同SHA和source path不符被拒；固定catalog与实际source SHA吻合，恰19项。 |
| AMR-04 / HIGH | [checker:170](/Users/shopme/Documents/workspace/opendesk-browser/tests/framework/verify-product-acceptance.mjs:170) | 13类输入变更使旧批准失效；两份snapshot、critic绑定architect hash及reviewedInputs输出已验证。 |
| AMR-05 / HIGH | [checker:166](/Users/shopme/Documents/workspace/opendesk-browser/tests/framework/verify-product-acceptance.mjs:166) | 数组identity、作者规范化别名和同一reviewer别名被拒。 |
| AMR-06 / HIGH | [checker:161](/Users/shopme/Documents/workspace/opendesk-browser/tests/framework/verify-product-acceptance.mjs:161) | 第三条阻断critic、重复role均被拒，不能选首条APPROVE遮蔽。 |
| AMR-07 / HIGH | [checker:259](/Users/shopme/Documents/workspace/opendesk-browser/tests/framework/verify-product-acceptance.mjs:259) | 双SHA或payload/disk自洽仍不能冒充原artifact；描述/run/bytes不符被拒。 |
| AMR-08 / HIGH | [checker:213](/Users/shopme/Documents/workspace/opendesk-browser/tests/framework/verify-product-acceptance.mjs:213) | stable hash-only被拒；实际文件错误hash/路径及null引用也被拒。 |
| AMR-09 / MEDIUM | [checker:36](/Users/shopme/Documents/workspace/opendesk-browser/tests/framework/verify-product-acceptance.mjs:36) | 原/增项重ID被拒，accepted计数归零。 |
| AMR-10 / MEDIUM | [checker:56](/Users/shopme/Documents/workspace/opendesk-browser/tests/framework/verify-product-acceptance.mjs:56) | null refs/obs/env/reviews/disk及新env.id/version类型guard均结构化拒绝，无TypeError。 |
| AMR-11 / MEDIUM | [checker:306](/Users/shopme/Documents/workspace/opendesk-browser/tests/framework/verify-product-acceptance.mjs:306) | 实际解析review内嵌缺失/错误hash证据被拒；reviewedInputs实际字段也核对。 |

探针只提取测试fixture并注入导出的reviewInputSnapshot，没有执行已有测试套件。除旧快照攻击外，变更后重签当前snapshot，确保对应规则本身拒绝。47项为validateAcceptance合成探针，12项执行当前CLI内部原文IO分支（内存readFile、真实SHA），5项strictref及1项catalog/source探针实际读磁盘。完整候选检查、生产包/ZIP、浏览器和构建均未运行。用户转述的24/24定向结果未独立重跑。详尽结果和可复现probeSource保存在[JSON](/Users/shopme/Documents/workspace/opendesk-browser/docs/framework/evidence/continuation-20261003-current/acceptance-mechanism-followup.json)。

[supplemental-sdk-cases.json](/Users/shopme/Documents/workspace/opendesk-browser/docs/framework/evidence/continuation-20261003-current/supplemental-sdk-cases.json) 固定SHA为`5a5c7fc207cf4ef3fac2861a41203dbd86034fe05f87e24fe1e8b3debd36fa61`；ID恰为现有SDK001–019，全部required/F3，继承来源文件实际SHA匹配。catalog冻结预期，**尚未批准native效果**；它与原603规格须进入同一最终production候选的独立architect→critic语义评审，不重开stage0。

自动检查证明结构、引用、字节hash和评审输入一致性。JSON自填pass/native/controllerRuns/targetDestroyed等标签不能证明实际事件或审阅者身份。controller-free SDK、unknown不重放、≤3s物理终止、borrowed页清理、下载artifact真实来源、双环境轮次与原603＋19行为均pending，由同包独立语义审查确认；这与[操作文件:135](/Users/shopme/Documents/workspace/opendesk-browser/docs/framework/product-acceptance-workflow-20261003.md:135)一致。本轮没有追加机制修补要求。

本轮checker SHA：`e8aeaa949f982e8a72289b3f5bb990db6447417f2335e7ea8d0835b656760efc`。原报告JSON/MD保留SHA分别为`e5c12226071dbb4cd6d1c0c86db51d1f4e8d689f5849053d4d871a599a07aa2e`、`56cb88a04a48bcc866c367601920b627a343274e38a51bbd25d56cf1ac7861c2`。

复现命令（只执行本报告内探针）：

```sh
node --input-type=module -e 'import {readFile} from "node:fs/promises"; const r=JSON.parse(await readFile("/Users/shopme/Documents/workspace/opendesk-browser/docs/framework/evidence/continuation-20261003-current/acceptance-mechanism-followup.json","utf8")); await import("data:text/javascript;base64,"+Buffer.from(r.probeSource).toString("base64"));'
```


最终收束：`status=finalized`；已关闭 **AMR-01、02、03、04、05、06、07、08、09、10、11**（机制层）。残留ID：无；实际新缺陷：无。仅使用已有执行结果和代码阅读，没有新增探针或委派。

当前实际重新读取的checker SHA为`e8aeaa949f982e8a72289b3f5bb990db6447417f2335e7ea8d0835b656760efc`，与既有探针快照一致，包含第56行env.id/Chrome版本类型guard。

**not-tested**：完整候选CLI联合闭环、实际磁盘round-log/review端到端解析、真实artifact/下载来源链、生产ZIP闭包及检查结束并发改写重读；已有内存IO分支/实际strictref探针的通过不外推这些分支。所有native效果和F3仍pending。catalog仅继承19项预期，须由同包最终独立语义评审确认，不代表原生批准。
