# Import Runtime R7.9.4 · Mixed ESM 实施与待验收

日期：2026-10-14。仓库 `shopable-ai/opendesk-browser`，唯一写入分支 `main`。

## 目标与写入归属

在 Page USER_SCRIPT 和 Controller Worker **分别同一次 main()** 使用三条真实 ESM import（HTTPS D3 / npm lodash-es / 相对文件），同时调用世界按需预置库和默认库。本轮不建第二套 Compiler、Resolver、Registry、Loader、RunHost、Authority、Controller、UI 或 Bridge。

本任务独立写入：`examples/programs/mixed-import-page/**`、`examples/programs/mixed-import-controller/**`、`tests/environment/mixed-import-projects.test.mjs`、本工作流记录和使用文档中的最小导航补充。共同源代码 `src/libs/{runtime-contract,catalog,core,loader}.js` 以及 `scripts/{build-program-project,validate-program-project,lock-program-remote}.mjs` 只读复用；与 R7.7/R7.8 其它任务平行，不能升级旧包结果。

## 已提交来源与复用

- HTTPS `https://raw.githubusercontent.com/d3/d3-array/v3.2.4/src/max.js` 原始 D3 `502` 字节，SHA-256 `691945a453633d9e204846af8ea4e299821b924f82b15eaf7906aba642979b1d`。锁从 `examples/programs/page-ui-toc-react-direct/opendesk.remote-lock.json` 提取已登记条目；内容原样复制该项目的固定缓存，不伪造哈希、没有重新下载。
- npm `lodash-es@4.17.21`：真实 `npm` lockfile 中该包的完整 HTTPS tarball 与 SHA-512 完整性条目来自 `examples/programs/page-npm-lodash/package-lock.json`，仅重命名两个新项目的根包。各项目 `npm ci`、Webpack 真正解析、完整性验收**尚未在本网页执行**。根仓库 `lodash-es@4.18.1` 不允许代替。
- 相对模块 `src/lib/scores.js` 实际返回 `[2,5,3]`；按需 Page `query-string`、Controller `axios` 与默认 `_`/`dayjs` 不新增 Catalog，归属和权限隔离保持不变。
- Page title 来源为 USER_SCRIPT `document.title`；Controller title 来源为受控词法 `page.title()`；Controller 真实 Axios `getUri()` 不产生 HTTP 请求。

## 本轮实际证据等级

| 验证层 | 状态 | 必须由什么升级 |
| --- | --- | --- |
| SOURCE_WRITE | GITHUB_COMMITTED | 校验两个新项目源码、锁、缓存与新测试的具体提交 SHA |
| NODE_VALIDATION | NOT_TESTED | 真实本地 `node --test tests/environment/mixed-import-projects.test.mjs` 与输出 |
| BUNDLE_EXECUTION | NOT_TESTED | 两个项目分别 `npm ci`，再 `OPENDESK_MIXED_IMPORT_BUILD=1` 的真实混合 Webpack/VM 返回及负向 |
| CHROME_PAGE | NOT_TESTED | 同包 Page USER_SCRIPT 真实 JSON + receiptNonce/documentId/sourceHash |
| CHROME_CONTROLLER | NOT_TESTED | 同包 Controller Worker 持久 JSON + runId/resultId/sourceHash |
| NATIVE_MAC / OFFLINE_RESTART / PERMISSION_REVOCATION | NOT_TESTED | 原 Chrome CFT/Profile、固定 SHA、来源/能力撤权、离线重启和 Worker 回收原始证据 |
| STANDARD / DEVELOPER / PACKAGE_VERIFY / CI | NEEDS_CURRENT_REVIEW | 当前输入候选构建、真实日志和 packageHash |
| 产品专家 95+ | NOT_SCORED | 完成新组合真实 Chrome 和全部相关 P0 安全门槛后独立评分 |

**原 R7.7/R7.8 单独的 D3/native PASS 不能证明新两项目的混合执行；源码写入和 Node L2 也不能替代 Chrome。** 网页 GitHub 连接器无法读取用户 Mac 的工作区差异、日常扩展 Profile、真实安装与本地持久 Result；本轮不凭空提供 runId、packageHash 或假回执。

下一唯一动作：Mac `/Users/shopme/Documents/workspace/opendesk-browser` 核对当前 main 与保留并行改动，分别 `npm ci --ignore-scripts`、运行本轮新综合测试和定向构建，再使用已有受控 Chrome 测试/开发入口对两个真实项目分别完成同一次 main() 的最终回执、离线/撤权负向、产物校验；实际失败先修再提交。最终确保测试 PASS 而非 SKIP，绑定准确源码/构建/扩展身份。
