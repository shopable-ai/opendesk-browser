# R3.1 最终候选独立验收与包字节绑定附录

结论：**四个已执行的原生 Chrome 场景通过，同源开发包与生产包的实际编译字节绑定通过。** 本附录只读检查原始证据、GitHub CI 元数据与日志、固定 Git 对象和下载的真实 ZIP；没有修改仓库、原始 artifact 或重新启动 Chrome。

被验收的源码提交是 `6d1ab8ff33fe306cb0127b688cb70a002b4a7141`。它已包含并行任务的 Native 文件工作区 `1f312b7228e531612cfb1c7507f65de38b9b98bb`；本附录不使用旧 `bd76b2d` 的包指纹代表当前产品。

## 原始证据身份

| 证据 | 原始 CI | job / artifact | 结果 |
| --- | --- | --- | --- |
| 安装授权与真实 Chrome | [38044176147](https://github.com/shopable-ai/opendesk-browser/actions/runs/38044176147) | [job 114190246604](https://github.com/shopable-ai/opendesk-browser/actions/runs/38044176147/job/114190246604) / [artifact 11667456213](https://github.com/shopable-ai/opendesk-browser/actions/runs/38044176147/artifacts/11667456213) | PASS，43 个原始文件 |
| 开发 / 生产真实安装 ZIP | [38044176139](https://github.com/shopable-ai/opendesk-browser/actions/runs/38044176139) | [job 114190246513](https://github.com/shopable-ai/opendesk-browser/actions/runs/38044176139/job/114190246513) / [artifact 11667236313](https://github.com/shopable-ai/opendesk-browser/actions/runs/38044176139/artifacts/11667236313) | PASS，6 个原始文件，含两个内层安装 ZIP |
| 完整 environment 组件 | [38044176170](https://github.com/shopable-ai/opendesk-browser/actions/runs/38044176170) | [job 114190246945](https://github.com/shopable-ai/opendesk-browser/actions/runs/38044176170/job/114190246945) | 721 项：714 pass、0 fail、0 cancelled、7 skipped |

独立读取 GitHub 后确认以上均为 main 上的同一 SHA、attempt 1，job 与 run 均 success。同 SHA 查询到的 7 条工作流均 success，其中 1 条是分支清理，不能计为产品验证。

- 原生证据外层 ZIP SHA-256：`c109ac3da2746c9fa5938605719480644682869d3bf2085bc47dcc5aeddd0ad1`。
- 双包证据外层 ZIP SHA-256：`3f7d51408d83da04edc43999c2b1a6ee9237921968d4bab9e75de652bee5e491`。

两个外层 ZIP 的 SHA 与 GitHub artifact digest 相同。原生 ZIP 的全部 43 个成员 CRC 和解压字节均一致；双包 ZIP 的 6 个原件、两个内层 ZIP 的全部成员 CRC、长度、文件名及 SHA 均通过独立检查。额外保存的 CI 日志与双包解压目录不计入原生 43 个原件。

## 真实 Chrome 已证明的行为

使用真实有界面的 Chrome for Testing 155.0.8059.39、独立 profile、原生 CDP Input 事件，通过现有 Side Panel 完成普通 JavaScript 的保存、Verify、Install 和 B 的停用。安装点击前实际界面披露默认 `*://*/*` 站点范围及独立程序授权边界；源码保持普通 JavaScript，未添加 GM 权限或依赖网页 SDK。

- **22 个不同文档、22 个不同回执**：先 20 次独立文档自动运行，Worker 重启后第 21 次，整个浏览器重启后第 22 次。4 个原生场景全部 PASS。
- **`chrome.permissions.request` 为 0 次**：原始事件流、权限观察文件、最终 acceptance 一致；51 个检查点均为 0。共 4 个 observer，即 3 个 Worker observer 和 1 个 Side Panel observer；跨文档、跨 Worker 和浏览器代次保留退休记录，没有在重启时清空累计计数。源代码核验确认 wrapper 保留原函数调用与结果，只做观察。
- A / B 的 `installationId` 与 native registration ID 独立；A 持续 active，B 持续 disabled 且没有执行回执。程序权限为 `page.dom`，网络目标集合为空；全部保存快照的安装身份、固定 sourceHash / manifestHash、规则和授权代次与基线一致。
- **Worker 确实重启**：原始 stopped → target absent → running 事件存在；重启前后 native execution-context `uniqueId` 和 observer 身份不同。三段 Worker 生命周期共 3 个不同 native context，不能把 4 个 observer 误写为 4 个 Worker context。Chrome 可以复用 target ID，本证据没有把复用 ID 当成同一个执行上下文。
- **浏览器确实重启**：PID `1988 → 2247`，原 profile device / inode 为 `16777228 / 3525888`，两次参数相同。旧 21 条已投影回执全部字段不变，授权不变；旧 session `561b5c9f-65ac-4d3e-82fe-287d0e9e370e`，新 session `2d585145-daf2-4c5b-a41b-9579d52462d3`。仅第 22 条新文档回执使用新 session，未重放旧文档。
- **清理通过**：两个自有 Chrome 主进程 exit 0；原 profile 一次删除成功，残留与错误均为空，launcher exit 0。此次真实 Chrome 没有出现 ENOTEMPTY 重试；“有界重试拒绝错误身份、保留失败证据”等情况由 16 项 fault-injection selftest 证明，应分开表述。

同一原生 CI 的受影响定向组件为 **235 / 235 通过**，无 skip、cancel 或 todo；`npm run check` 检查 265 个源码 / 测试 / 构建文件，`npm run build:dev` 通过。完整 environment 的 7 个 skip 仍明确保留，不能写成 721 / 721 pass。

## 固定源码与实际安装包

4 个 driver / 生命周期输入哈希和 **191 个构建输入**逐字节匹配 Git 提交 `6d1ab8ff33fe306cb0127b688cb70a002b4a7141`。Mac 原生验收中的完整开发包报告与 Linux 构建的实际开发 ZIP 指纹完全相同；开发 / 生产构建的 sourceInputs 相同且无构建期间漂移。

| 项目 | Development | Production |
| --- | --- | --- |
| 实际编译文件数 | 47 | 32 |
| 安装 ZIP 字节数 | 1,410,932 | 495,837 |
| `sw.js` 字节数 | 326,502 | 326,336 |
| packageHash | `9e8c25d3da3e2ae643007f8a234b3522ff65214e1025908169e1e149428bc79a` | `ef73b016a93ac49ba90ee153c0eb6162fe8b9eeacf6d73b7bc11f1689b511a5f` |
| 安装 ZIP SHA-256 | `4dd51bc3671ee78538daba803ae83c372c056b40e56feeeae1d08ca2a8026b22` | `502b5988055af58f5cf01e8e9827faa42948ef8b786459403f820b3aab4bbbeb` |

这里的哈希来自重新读取内层 ZIP 的实际文件内容；并非仅重算报告声明的列表。每个文件的真实 bytes / SHA 与完整 build report 一致，再重算 packageHash，并与 pack receipt 及原生运行报告比较。实际文件按报告的原始稳定顺序串行化，哈希配方没有变更。

原生 driver 本身 SHA-256：`c51efa7d719c9773a10df2a00ee03b40941c979d436e823f66389b541422fe52`。测量运行结束后的包字节不变断言仍在固定源码中并通过。

## 并行 Native 文件工作区对授权的共享影响

只读比较 `bd76b2d → 1f312b72`：Manifest、Chrome 权限 gate、Host Authority / Broker、installed user scripts、站点访问 / 脚本编辑 / 程序管理运行路径、RunHost 与主 SW 均无差异。再比较 `1f312b72 → 6d1ab8ff` 的 `src`、Manifest、依赖锁、构建脚本与配置，也没有产品 / 构建输入差异。

新增文件适配器复用既有 Native Port。`file-workspace-service.js` 仅静默调用 `permissions.contains(nativeMessaging)`；请求在异步权限检查前固定内容，并在发送和接收时核验 session、port、generation。断连或写入结果未知时不自动重试。`service-worker.js` 的新路由只允许精确打包工作区 URL、当前扩展 ID、documentId 与顶层 frame；普通网页、USER_SCRIPT、其他程序和网页 SDK 不能凭借自身授权进入这条路由。

旧设置页的主动 Native enable 授权动作仍独立存在。新工作区没有新增脚本权限数据库、执行器或 Manifest 权限；本次 R3.1 修改保留了其他任务的文件工作区功能。本段仅核对它对 R3.1 共享授权边界和包身份的影响，不声称重新完成了整个 Native / Go 文件系统安全验收。

## 仍然保留的边界与失败证据

本套真实 Chrome **未覆盖**原生站点撤销 / 授权泡泡 / 主动恢复、实际同范围升级 / 扩权确认、对抗性跨程序调用 / 注入旧回执竞态，以及 Controller / 本地项目的原生 20 次循环。observer 附加前的启动调用不在计数窗口内。22 次实际导航位于一个合成 loopback 来源；默认全域规则被展示并持久化，不等同于多站点实测。组件中的撤销、恢复、升级、跨程序及竞态验证应与这些原生缺口分别陈述。

`a88919c`、`13e02a6`、`789fa3a`、`bd76b2d` 与 `7fa53d1` 的失败证据保持原样；其中部分在执行器 / UI 就绪观察或 profile 清理阶段失败，不能改判为 PASS。旧 `992f117` 原生 PASS 仍可作为其固定版本的历史证据，最终当前产品包绑定采用本次 `6d1ab8ff` 的原件。

没有由测试数量推断新的“整体完成度”或无条件 95+ 分数；本附录确认的是明确执行的四个原生场景、组件结果和同源实际包字节关系。
