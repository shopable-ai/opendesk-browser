K2 原生 IDB 输入及失败恢复准备

实际 origin：http://localhost:64238；浏览器：Chrome/154.0.8037.92。

实际加载产品 storage/index.js、idb.js、repository.js 及 protocol/schema，源 hash 与 HTTP payload 记录见 report.json/http.json。唯一库名 opendesk-browser，v1 十 store；80 条明确 key/value 输入包含 string、number、Date、ArrayBuffer/view 字节及复合 array。

准备断言：通过。当前 v2 升级支持仍为 false；真实 onupgradeneeded/abort 与 v1 只读恢复单独记录，不能计作 v2 迁移成功。

这是 HTTP origin 原生 primitive/test-input preparation，不是扩展入口、SDK sender 或 F2/F3 验收；不关闭合同 case。已保存故障前后 typed backup/hash、事件及只读写拒绝。尚未测项见 contract-boundary.json。

清理：context=true、server=true、仅本次 profileRemoved=true。产品源码和 F1 保护源/hash 均保持不变。

复跑：node tests/framework/native-idb-migration-preparation.mjs

键类型与升级 abort 的语义参考 [IndexedDB 规范](https://w3c.github.io/IndexedDB/#key-construct)；本结论以保存的实际 native 事件与数据为证。
