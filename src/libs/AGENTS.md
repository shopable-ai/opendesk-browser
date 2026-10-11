# src/libs 需求保持规则

继承根 AGENTS.md 的 main、安全、并行资源与真实证据规则。先读取 `docs/architecture/browser-framework/public-preinstalled-libraries.contract.zh-CN.md` R1.1 和本目录 README；用户的最新明确决定优先于历史方案，不得将需求文档写成永远不可调整的规则。

## 2026-10-11 最新日期决策

**公共日期库统一为 Day.js，不预装 Moment，不新增 packages/moment.js，不提供 moment=dayjs 假别名。** 在已有 packages/dayjs.js 接入经审核的 duration/utc/timezone/customParseFormat，同步用户可见 API/版本/构建/测试。旧 moment 脚本明确迁移，不批量改历史快照；原合同强制双库要求已被取代。此日期特例不得扩展成删除其他真实公共库需求。

## 继续保留的公共目标

为用户程序预装真实 Axios、CryptoJS、js-cookie、query-string、store.js、FileSaver、Cheerio、FingerprintJS、Socket.IO Client、React、ReactDOM、Vue，提供 Tailwind 公共样式；保留已有 Lodash/Day.js/jQuery/my-utils 兼容。用户程序就是消费者，不以没有内部业务 import 为由删除需求，不以 axiosx/fetch/WebCrypto/Chrome Storage 冒充对应上游库已经开放。

不迁移 TimeReview/旧采集/旧远程命令业务，不静默采集上报指纹，不加 Monaco/ECharts/Docsify。许可或环境未确认是发布阻断，不是假 PASS，也不是悄悄删除需求的理由。

## 最小目录与可信边界

packages 存放真实上游库入口；adapters 仅在确有环境差异时转换协议。首批明确需要的是 axios-transport.js；不预建 store-backend/file-save/socket-lifecycle 等空文件。适配器接收窄客户端接口，不直接 import 特权 network.js/Broker/chrome.*，不建立新网络/权限/存储框架。授权在现有 Broker，检查最终 URL、方法和运行身份；Axios adapter 或 baseURL 不是安全边界。

vendor 只保留必须原字节发布的 JS 和许可证，复用唯一 catalog/runtime-contract 的来源、版本、SHA 和加载规则。npm 路线不再复制 vendor 副本。jQuery 保留原字节路径，my-utils 暂保既存 ABI；不新建第二登记表或擅自删除兼容资源。

预装与默认运行分开。React/ReactDOM 必须同实例单物理构建组；UI/DOM 库不进 SW，不自动注入网站 MAIN，不开 CDN/eval/CSP 权限。Tailwind 为受管静态 CSS，不能承诺未生成的任意 class。

计划、源码、构建、Chrome 证据分别记录。新增公共库、日期插件、adapter 尚未因文档更新而实现，不得伪报 ACTIVE 或 PASS，不用 95+ 设计评分代替运行验收。
