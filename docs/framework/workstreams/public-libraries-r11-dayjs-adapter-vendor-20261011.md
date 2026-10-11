# 公共预装类库 R1.1：Day.js、Axios 适配和 vendor 收敛

日期：2026-10-11。范围：设计修订、真实源码只读核对、main 文档提交。不是新增公共库实现或运行验收。
工作流状态：DOCUMENTATION_COMPLETED；本工作流未取得或占用用户本机工作树、Chrome Profile、端口、dist、ZIP 或构建资源。

## 用户决定与实际执行

用户本轮允许用轻便的 Day.js 统一日期需求，并要求审查 adapters/axios-transport.js、vendor、给出质量评价并将成熟方案写入仓库。没有把已确认的 Cheerio/FingerprintJS/Socket.IO/React/Vue/Tailwind 等公共需求重新排除。

读操作经 GitHub 连接，基线 main 为 53b09e45036c39a3dda8f638a992677cddae0135。读取根与 src/libs/AGENTS.md、正式合同、README、testing-guide，以及 dayjs.js、network.js、SDK registry、libs.mjs。写入采用 main 的 Contents API 和每个文件的原 blob SHA 检查，无分支、PR、Worktree、强推或 reset。远端并行变更被保留，本轮不声称核对过用户本机 git status/未提交改动。

实际修改：

| 文件 | 本轮 commit SHA | 写入后 blob SHA |
| --- | --- | --- |
| docs/architecture/browser-framework/public-preinstalled-libraries.contract.zh-CN.md | 27e9627d0d6835e95a07536156acd2d61f4e9b15 | bd9ff3cd824adcf2d71ca4e3ab5494a98ced591a |
| src/libs/README.md | 1b85474164e36c4db544bee64ddc132b9848e42f | 32c5c471a79af8eaf5ab87d0bc6a251f00faba7b |
| src/libs/AGENTS.md | 0f0264bc626afe38e921ac797a386aa4459c1b2e | adc0500436c66a9dd250e46c31026704dcc7d923 |

这三份已在 0f0264bc626afe38e921ac797a386aa4459c1b2e 回读确认。上表之外新增本工作流文件作为证据边界和续接入口。没有新增 packages/adapters 的 JS、npm 依赖或固定资源。

## 四项实质修订

1. 日期公共 API 统一 dayjs；不预装 Moment，不伪造同名兼容。已有包装器仅 isDayjs，duration/utc/timezone/customParseFormat 仍需代码实施、API登记、ABI和实际测试。
2. 保留一个明确需要的 axios-transport.js 接入计划；只转换真实 Axios 与现有客户端的协议，不直接 import 特权模块。其他 adapter 不预建空壳，优先复用现有后端/生命周期。
3. vendor 保留原样 jQuery 和既存 my-utils；npm 库走 packages，原字节、来源、版本、许可证与 SHA 在同一 catalog 管理。禁止双份来源或第二 vendor 注册表。
4. React/ReactDOM 的源码入口共用一个物理 react-ui.js 构建组；补充实际默认组合体积、API一致性、取消/错误回执和许可的发布阻断。

## 源码发现，不是运行测试结果

- src/platform/chrome/network.js（blob 43fd67144e28fc09ff660ae08ea74861b8a8d0c1）：GET/POST/PUT/DELETE，UTF-8 text/JSON，有宿主超时/大小预算；credentials omit、redirect manual；非2xx抛 E_HTTP 并带 response。
- src/framework/sdk/registry.js（blob d2c49690a5c53c087b3905f3d7f6972a3a1c579f）：窄 config allowlist，禁止 Authorization/Cookie/Origin 等 header；timeout 必须正整数，withCredentials 只能 false。
- 因此 Axios 接线必须处理 params/body转换一次、validateStatus与E_HTTP回执、跨IPC字段、取消传播及timeout=0映射。不支持的选项明确拒绝；认证/权限失败不能变成HTTP成功。不能仅把 axiosx 改名。
- src/libs/packages/dayjs.js（blob a6e3b463d66269f4f9d40534dfdcc144a0a213f0）：只有核心和isDayjs，文档中的新插件目前不是可执行承诺。
- scripts/libs.mjs（blob 47f33e91dee5bc906fbe86df052728c9d55d9797）：已有vendor清单、代码/许可证hash及bootstrap校验。应扩展现有检查，不重造管理器。

官方依据已写入正式合同：Day.js duration/timezone/strict parsing，Moment维护状态，Axios adapter/config，Chrome跨站请求，npm lock/integrity。本次未选择或宣称所有新增包的最新安全版本。

## 设计评分：自评，不是外部独立审计或产品质量分

上轮设计按本次复审约88/100，主要缺口为默认双日期库、预设adapter过多、Axios协议差异和vendor来源边界不够明确。修订后设计稿自评96/100：

| 设计维度 | 满分 | 自评分 | 判断 |
| --- | ---: | ---: | --- |
| 用户需求与范围保持 | 20 | 20 | 日期最新特例明确，其余公共库目标未丢失 |
| API/目录职责清晰 | 20 | 19 | 单日期、薄adapter、原样vendor与物理库组清楚；最终版本支持矩阵待实现验证 |
| 现有框架复用与克制 | 15 | 15 | 无第二Broker/加载器/管理器，不预建空占位 |
| 安全和供应链设计 | 20 | 19 | 可信边界与失败关闭明确；新包许可/原生约束仍为发布门槛 |
| 用户开发体验 | 15 | 14 | 零npm、普通JS公共API；更多真实可运行例子待实施 |
| 验证方案与证据边界 | 10 | 9 | 覆盖日期/网络/vendor/UI失败路径；没有实物指标时不报通过 |
| 合计 | 100 | 96 | 设计稿评分，不代表实现或Chrome达到96分 |

95分不是客观保证。真实工程实现分本轮不出具；未完成的安全、许可、功能或原生验收项不能被设计分抵消。

## 验证结果及并行保留

已执行：按固定SHA读取源码、官方资料核实、三文档回读、GitHub compare_commits和条目一致性复核。日期默认组/目录/Agent规则均去掉强制Moment；新增库目标保留；未把计划文件标已实现。没有声称运行自动化测试数量。

基线到0f0264bc的比较为7个提交、10个变化文件，包含并行任务的sidebar-tools安装/存储及测试变更；不是全部由本工作流修改。我们只写上表三个文档，未覆盖并行源码或测试产物。

| 验证层 | 本轮状态 |
| --- | --- |
| 设计和源码静态复核 | 完成，证据与关键差异见上 |
| 文档写入/原blob保护/回读 | 已完成 |
| 新库、日期插件、Axios adapter实现 | NOT_IMPLEMENTED |
| npm ci / libs检查 / build / verify / npm test / pack | NOT_TESTED（仅文档变更，不重跑产品验收） |
| 新候选SW大小、组合资源体积、ZIP SHA | NOT_MEASURED |
| Mac Chrome / USER_SCRIPT / Controller /工具运行 | NATIVE_UNVERIFIED |
| 外部独立审计 / 最终F3 | NOT_PERFORMED |

依据 testing-guide，本次文档修订不要求重跑未变化产品；也不继承旧PASS为新增库证据。

## 直接续接实施，不再重做范围讨论

下一步按正式合同先完善已有Day.js包装器与固定插件、catalog/core/identity一致性，再实现真实Axios公共入口和窄transport接线；遇到非2xx错误丢字段或单请求取消缺口，修复现有协议并添加失败复现，禁止客户端假成功。之后继续其余已确认公共库和两种UI环境。每批绑定自己的源码/测试/构建/Chrome证据，保留生产SW 327680 bytes硬限与既有CSP。不得把本轮文档提交当成类库已经发布。
