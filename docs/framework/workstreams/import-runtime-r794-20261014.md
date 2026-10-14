# Import Runtime R7.9.4 · Mixed ESM 实施与待验收

日期：2026-10-14。仓库 `shopable-ai/opendesk-browser`，唯一写入分支 `main`。

## 目标与写入归属

在 Page USER_SCRIPT 和 Controller Worker **分别同一次 main()** 使用三条真实 ESM import（HTTPS D3 / npm lodash-es / 相对文件），同时调用世界按需预置库和默认库。本轮不建第二套 Compiler、Resolver、Registry、Loader、RunHost、Authority、Controller、UI 或 Bridge。

本任务独立写入：`examples/programs/mixed-import-page/**`、`examples/programs/mixed-import-controller/**`、`tests/environment/mixed-import-projects.test.mjs`、本工作流记录和使用文档中的最小导航补充。共同源代码 `src/libs/{runtime-contract,catalog,core,loader}.js` 以及 `scripts/{build-program-project,validate-program-project,lock-program-remote}.mjs` 只读复用；与 R7.7/R7.8 其它任务平行，不能升级旧包结果。

## 已提交来源与复用

- HTTPS `https://raw.githubusercontent.com/d3/d3-array/v3.2.4/src/max.js` 原始 D3 `502` 字节，SHA-256 `691945a453633d9e204846af8ea4e299821b924f82b15eaf7906aba642979b1d`。锁从 `examples/programs/page-ui-toc-react-direct/opendesk.remote-lock.json` 提取已登记条目；内容原样复制该项目的固定缓存，不伪造哈希、没有重新下载。
- npm `lodash-es@4.17.21`：真实 `npm` lockfile 中该包的完整 HTTPS tarball 与 SHA-512 完整性条目来自 `examples/programs/page-npm-lodash/package-lock.json`，仅重命名两个新项目的根包。两个项目的 `npm ci`、Webpack 真正解析及 npm SRI 校验已经由 GitHub Actions Linux 实际执行并通过（`38559965087`，Node22）；**用户 Mac 本地环境仍未测试**。根仓库 `lodash-es@4.18.1` 不允许代替。
- 相对模块 `src/lib/scores.js` 实际返回 `[2,5,3]`；按需 Page `query-string`、Controller `axios` 与默认 `_`/`dayjs` 不新增 Catalog，归属和权限隔离保持不变。
- Page title 来源为 USER_SCRIPT `document.title`；Controller title 来源为受控词法 `page.title()`；Controller 真实 Axios `getUri()` 不产生 HTTP 请求。

## 本轮实际证据等级

| 验证层 | 状态 | 必须由什么升级 |
| --- | --- | --- |
| SOURCE_WRITE | GITHUB_COMMITTED | 校验两个新项目源码、锁、缓存与新测试的具体提交 SHA |
| NODE_VALIDATION | CI_NODE_PASS / MAC_LOCAL_NOT_TESTED | Linux Node22 真实 14/14、0 跳过；用户 Mac 本地另验 |
| BUNDLE_EXECUTION | CI_BUILD_PASS | 同一 GitHub CI 运行两个项目精确 `npm ci`、混合 Webpack/VM 和失效注入；证据 `38559965087` |
| CHROME_PAGE | NOT_TESTED | 同包 Page USER_SCRIPT 真实 JSON + receiptNonce/documentId/sourceHash |
| CHROME_CONTROLLER | NOT_TESTED | 同包 Controller Worker 持久 JSON + runId/resultId/sourceHash |
| NATIVE_MAC / OFFLINE_RESTART / PERMISSION_REVOCATION | NOT_TESTED | 原 Chrome CFT/Profile、固定 SHA、来源/能力撤权、离线重启和 Worker 回收原始证据 |
| STANDARD / DEVELOPER / PACKAGE_VERIFY / CI | SOURCE_CI_PASS / CHROME_PACKAGE_NOT_TESTED | 原多文件 Source CI 同作业成功；Chrome 同候选包和正式双版本仍单列 |
| 产品专家 95+ | NOT_SCORED | 完成新组合真实 Chrome 和全部相关 P0 安全门槛后独立评分 |

**原 R7.7/R7.8 单独的 D3/native PASS 不能证明新两项目的混合执行；源码写入和 Node L2 也不能替代 Chrome。** 网页 GitHub 连接器无法读取用户 Mac 的工作区差异、日常扩展 Profile、真实安装与本地持久 Result；本轮不凭空提供 runId、packageHash 或假回执。

下一唯一动作：先核对正在排队的 GitHub macOS 原生 Chrome 测试 `38560636360`（原有 `local-dev-r22` driver 已接入两个新项目），按真实结果修复；然后在用户 Mac 原工作区核对 main/并行状态，复用原 Chrome/Profile 完成同候选安装/离线/撤权/包身份最后验收，不能将 GitHub-hosted macOS PASS 冒充用户日常 Profile PASS。

## 当前实际 GitHub 提交与 Source 校验

- 综合 Page/Controller 项目首次源码提交：`701344988b247831e6337a309a08ecc7c89a5631`（12 个真实项目文件）。
- Node/Build 及安全负向综合测试已写入：`2ee88c5a6243694ea732746a1d0875d8396a510f`（`tests/environment/mixed-import-projects.test.mjs`）。仅表示测试源码已提交，不表示这些测试已经运行。
- 两个 README 和本工作流提交：`495968d8b77e83699050955edd823b8b9bfb299d`；现有使用文档导航随后已更新。
- Mac Codex 最终测试修复提示词：[`goal-import-runtime-r794-mac-codex-acceptance-20261014.zh-CN.md`](../prompts/goal-import-runtime-r794-mac-codex-acceptance-20261014.zh-CN.md)。
- GitHub 连接器实际回读两个项目及原始 D3/npm 锁后进行 11 项/项目，共 22 项**源码级**检查：`SOURCE_CONNECTOR_PASS`。原始对照：[source-connector-verification.json](evidence/import-r794-20261014/source-connector-verification.json)。它未对 D3 执行本地重新哈希、未运行 npm/Node/Chrome，不能提升至 L2/Native PASS。

截至 CI `38559965087`：`SOURCE_CONNECTOR_PASS / CI_NODE_PASS_14_14_NO_SKIP / CI_WEBPACK_PASS / CHROME_PAGE_NOT_TESTED / CHROME_CONTROLLER_NOT_TESTED / USER_MAC_NATIVE_NOT_TESTED / PACKAGE_HASH_UNAVAILABLE`。GitHub-hosted macOS Chrome 作业 `38560636360` 尚待原始结果；历史包 PASS 不替代本任务。

## R7.9.4 本轮真实 Node CI 的首次失败与闭环

- 首次将本任务接入**既有** `.github/workflows/program-project-source.yml`，强制对 Page 和 Controller **分别执行 `npm ci`**，再以 `OPENDESK_MIXED_IMPORT_BUILD=1` 调用原 Webpack / VM；不另建 CI 或复制 npm Runtime。
- [首个真实失败原始 CI](https://github.com/shopable-ai/opendesk-browser/actions/runs/38559581293)：**13/14 PASS，1 FAIL，0 SKIP**。原示例 `_.words('OpenDesk Browser')` 在真实 Lodash 中因 `OpenDesk` 驼峰断词返回 3；用户明确要求输出 2。没有更改断言或伪造返回，而将两个示例的输入修成自然的 `_.words('Browser tools')`，真实上游现在返回 2。
- [修复后的真实 CI](https://github.com/shopable-ai/opendesk-browser/actions/runs/38559965087)：新综合 **14/14 PASS，0 FAIL，0 SKIP**；npm 源精确安装、固定 D3 缓存、两个混合 Bundle 真正运行，以及缺 npm lock/版本、相对源、按需世界、坏 SHA、缺导出、变更中构建等 fail-closed fixture 通过；同一 CI 既有项目回归、源码检查和原离线示例全部通过。机器级原始日志见该 Actions job 及步骤 `Real pinned mixed-import Page and Controller builds (no SKIP)`。
- 为补齐 Chrome：将两个项目加入既有 `tests/framework/esm-r22-examples.mjs`，复用相同 macOS Native/MCP/CFT launcher；`.github/workflows/local-dev-r22.yml` 在 isolated runner 中安装两个独立 npm lock 后执行原真实 Chrome 流程，不新建浏览器执行器。 [对应候选 CI](https://github.com/shopable-ai/opendesk-browser/actions/runs/38560636360) 初始状态为 `QUEUED / NATIVE_NOT_TESTED`。结果须按真实 job 回执更新，不能提前宣布 Chrome PASS。
