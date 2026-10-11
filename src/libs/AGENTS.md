# src/libs 需求保持规则

继承根 AGENTS.md 的主分支、安全、并行资源与真实证据规则。公共类库工作先读取 `docs/architecture/browser-framework/public-preinstalled-libraries.contract.zh-CN.md` 和本目录 README。

用户明确目标是框架为用户程序预装真实 Axios、Moment、CryptoJS、js-cookie、query-string、store.js、FileSaver、Cheerio、FingerprintJS、Socket.IO Client、React、ReactDOM、Vue，并提供 Tailwind 公共样式；不是只为框架内部已有 import 补依赖。

不得将 axiosx/fetch/WebCrypto/Chrome Storage 等同于对应上游库，不得以没有内部业务消费者为由删除公共预装需求。Lodash/Day.js/jQuery/my-utils 只是当前基础，不代表完整目标已完成。用户程序就是公共 API 消费者；新增 API 必须有可运行用户脚本和对应世界测试。

不迁移 TimeReview/旧采集/旧远程命令业务，不自动采集或上报指纹，不加 Monaco/ECharts/Docsify；这些排除不得被用于删除用户已要求的通用库。

复用唯一 catalog、固定资源构建、已有 Runner/Broker；预装与默认加载分开，UI/DOM 库不进 SW，不开 CDN/eval/CSP 权限。计划、源码、构建、Chrome 证据分别记录。合同列出的新增包装文件尚未实现，不得伪报 ACTIVE 或 PASS。
