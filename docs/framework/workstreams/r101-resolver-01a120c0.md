# R10.1 resolver：可信依赖的本地直接运行

状态：COMPONENT_COMPLETE / released（2026-10-09）。分支 `agent/r101-resolver-01a120c0`；基线 `4adf5dc4966f82a71c2c5116f8d5a35c21eafd06`。

工作区：`/Users/shopme/.codex/worktrees/r101-resolver-01a120c0/opendesk-browser`。仅占用本 worktree、自己的 Node 测试和内部临时目录；不占用 Native、CFT、固定端口、dist、ZIP 或最终候选。网络锁安全与 Mac tmp alias 由独立 Agent 负责，本分支不修改其文件。

已核对 AGENTS、testing-guide、并行协议、OpenDesk skill、local-development-r22 及 local-dev-r22-c036 原记录。已有 P0/P1/P2 原候选 Chrome 证据保留原级别；本轮 resolver/builder 输入将改变，定向组件需要重测。正式 Chrome/Sidebar、AI、F3、ZIP：NOT_TESTED / OWNED_ELSEWHERE，不重复执行。

实际缺口：resolver 自建 webpack 并以 E_DEV_DEPENDENCY 拒绝已锁 npm/HTTPS。拟修改 resolver、必要 snapshot、唯一现有 builder 的内存接口、local-dev 定向测试、本工作流和 local-dev 指引。通过条件：精确锁定且安装的 npm、显式 HTTPS 锁缓存能从最新源码编译到原 RunHost/Page 接线；保持目录授权、并发验证、sourceFreeze、大小、无 loader、离线锁、原 source map；正式 builder 与本地 sourceHash 一致；项目无交接 JSON/构建文件。

计划验证：npm ci --ignore-scripts；local-dev、program-build/project 及受影响检查。结果与限制完成后追加；不 push/merge/release。


## 实施与最终验证

完成时间：2026-10-09T13:37:50.835548+00:00

按用户明确授权 cherry-pick security `d488fbc3`，本分支对应父提交 `6dc7bc74`；security 已由用户独立集成，本次只交付随后 resolver 提交，不重复 cherry-pick security。未修改 remote-esm-network/modules、安全测试、Mac alias 或原生资源。

- 移除 resolver 的第二套 webpack，导出现有 `buildProgramProjectInMemory`。正式/内存调用共用唯一编译、包装、大小检查、错误与 Page/Controller 合同；仅正式构建写发布产物。
- HTTPS 在 Webpack external hook 前改解析身份，原文不改；稳定虚拟模块名不含随机 temp 路径，原 URL 与 sourcesContent 保留。普通程序固定生产哈希检查仍通过。
- npm 按实际消费闭包冻结，包括嵌套依赖、包名/版本与精确 HTTPS/SHA-512 锁；不复制整个 node_modules。源码/资产预算保持 384 KiB/100 文件，锁与依赖分别有独立有界预算。拒绝 loader、缺锁、错误身份、symbolic/hardlink、超限、缓存篡改与并发变更。
- 所有快照返回前复验，cache hit 也读取实际依赖并核对锁。42→43、旧执行字节保持 42、MCP 原 RunHost 回程/sourceFreeze 已测试。未生成项目 program.js、草稿 JSON、构建目录或交接文件；内部 temp 清理。
- Terser 保留现有产物选项，仅禁用 worker 并行，允许 Node 26 权限模型中同进程禁网编译。普通单文件 Page async main 现有行为已经正确；增加 document.title 验证，无需改 Page/Session 消费器。

最终命令与结果（macOS，Node v26.3.1）：

1. `npm ci --ignore-scripts`：成功，240 个既有锁包；另对既有 `examples/programs/page-npm-lodash` 执行 `npm ci --ignore-scripts`，成功。无新增依赖，无 lock 修改。npm 输出既有审计风险（根项目 3 项、示例 1 项），未越范围升级。
2. `node --test tests/environment/local-dev.test.mjs tests/environment/program-build.test.mjs tests/environment/program-project.test.mjs tests/environment/local-dev-managed-ui.test.mjs tests/environment/remote-esm-import.test.mjs tests/environment/remote-esm-security.test.mjs tests/integration/npm-project-closure.test.mjs`：90/90 PASS（含独立 security 的受影响回归，仅组件级）。
3. `node --permission --allow-fs-read='*' --allow-fs-write='*' --test --test-isolation=none tests/environment/local-dev.test.mjs`：33/33 PASS。没有 --allow-net/worker/child-process，不断开用户网络；锁定 npm+HTTPS fixture 在同一禁网进程通过。
4. 相同权限的独立实际 npm probe：net.connect 异步回执 ERR_ACCESS_DENIED；真实 npm lodash-es 的 resolver 与生产内存 builder sourceHash 相同，20 个快照输入。具体哈希与字节见原始日志。
5. `npm run check`：196 个 source/test/build 文件及固定合同检查通过；`git diff --check` 通过。项目无单独 typecheck/lint 脚本，以现有 source check 为准；未做扩展 dist 构建（不占原生/发布资源）。

最终原始证据：[test/check/offline/probe 日志](r101-resolver-01a120c0-tests.log)。以下绑定为本轮 product/verification 输入，文档或无关提交变化无需重测；这些文件、锁、编译器或相关合同变化需按影响重新验证。

| 输入 | SHA-256 |
| --- | --- |
| `native-agent/local-dev/resolver.mjs` | `a612d70acd7a6d88a8bd4869c91274a367c5200f5d6e2a75c5bd87e89b5ea173` |
| `native-agent/local-dev/snapshot.mjs` | `327671d538b77611f0ee86b6c976f0bdb8d51099db20d2a4f30f031cbde9979a` |
| `scripts/build-program-project.mjs` | `8f934cea40e226c63ca4e1ca9d48ff2af069afe0fa0e89ac5af4739deaee644c` |
| `tests/environment/local-dev.test.mjs` | `b781001d68877b2d48b3b541638ec519f9213a65f80c67e67056565887507f7b` |
| `r101-resolver-01a120c0-tests.log` | `b8610ac01be373be31addb36cbb3f6717988ee7a74a7ffce409f484be8768fb1` |


## 保留的失败与限制

早期编译正向测试暴露残留的 E_DEV_DEPENDENCY、cache reader 的遗漏参数和 Webpack external hook 的 dependency.request 身份；修复后重测。禁网首次探针同步断言错误，随后确认异步 ERR_ACCESS_DENIED；原 Node 测试隔离需要 child-process，改为 test-isolation=none；默认 Terser worker 被权限拒绝，统一 builder 改同进程后通过。原失败日志均保留在 `/tmp/r101-resolver-01a120c0-first.log`、`-new.log` 至 `-new4.log`、`-shared.log`、`-offline.log`、`-offline-final.log`、`-offline-probe.log`、`-offline-probe-final.log`；其中失败期间的禁网测试等待用例被主动终止，没有记成 PASS。最终证据单独保存，不覆盖原失败。

实际 Native/CFT、Sidebar、live CDN 首次锁定、AI 制作、Installed、独立最终 F3、ZIP：本工作流 NOT_TESTED / OWNED_ELSEWHERE。用户另行维护 named Native 和真实驱动验收；本分支不借其聊天结果提升组件证据。npm 静态锁/安装身份与快照 hash 不替代 npm tarball 安装校验、许可证或安全审计。单文件 @require 仍需既有独立锁合同，不从 dev.run 隐式联网；大小超限与原 Native 60 KiB envelope 继续拒绝。后续集成者应在同一最终候选执行真实冻结验收。未 push/merge/release。
