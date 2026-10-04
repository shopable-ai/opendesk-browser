K2 产品模块原生 IDB 验证

模式：migration；freshOnly=false。实际 origin：http://localhost:50228；浏览器：Chrome/154.0.8037.92。

实际 storage、journal、regression 及 frozen v1 JS 的 source/HTTP payload hash 均记录。唯一库名 opendesk-browser；migration 模式沿用原始 80 条明确 typed key/JSON value 输入。

断言：存在失败，见原始报告；本次实际 v2 场景=false。升级 abort/blocked 的原生事件和数据保持、成功升级及旧 JS/当前只读诊断分别记账，不修改旧准备证据。

这是 HTTP native IDB 的真实产品方法验证；seeded host/run 不是可信 sender。不是扩展入口/F2/F3 验收，不关闭 17/R3–R8 或合同 case。尚未测项见 contract-boundary.json。

清理：context=true、server=true、仅本次 profileRemoved=true；执行期间源及 F1 冻结件 hash 无漂移。

复跑：node tests/framework/native-idb-migration-preparation.mjs；新库场景追加 --fresh-only。

[IndexedDB 规范](https://w3c.github.io/IndexedDB/#key-construct)。
