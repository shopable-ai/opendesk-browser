# OpenDesk Browser ESM R2.1 — 负向审计、CI 归因与待交接缺陷

日期：2026-10-11。证据等级：**远端源代码审计、GitHub Actions 原始日志、隔离 Node 边界重现**。本记录不是本机 Native/Chrome/Goja 全链路验收，不代表全部目标达标。

## 仓库、候选与并行保护

- Browser `main`：首次基线 `750529aae120c6366a27c456b9276497036e75d6`；后续观测已更新到 `3f8aea11c93ce54737700f03cd9db8d542d0362d`。
- OpenDesk `master`：`f87d240f7efd2a3cedb9eaf0f8f7cc44660ab14c`。
- 已读取两个 `AGENTS.md`、Browser testing-guide/parallel-development，ESM/Resolver/Provider/Session/Wire、远程锁定和测试源码。
- ESM R2、Sidebar、Native 正并行修改主干，不能覆盖它们的核心文件。本环境无用户 Mac 工作区挂载、外部 Git clone DNS 不可用，因此本次不能核验本机 `git status`、在 Mac 启动真实 Chrome/Go Host 或运行仓库集成测试。保留真实 `NOT_TESTED`。

## 缺陷/风险矩阵

| ID | 分类 | 严重性 | 复现与源码证据 | 当前处理 |
|---|---|---|---|---|
| R21-01 | KNOWN_LIMITATION + POTENTIAL_RISK | P0 预检体验 | `native-agent/wire.mjs` 完整 JSON 最大 61,440 bytes；`native-agent/local-dev/resolver.mjs` 和 `scripts/build-program-project.mjs` 的 Controller 源码允许 65,536 bytes。按 Provider 结果字段构造代表性 JSON，61,400 ASCII 字节源码变成 61,880 字节消息；35,000 个换行源码变成 70,480 字节消息。现有 docs/API 已提醒消息限制更小。 | 协同 ESM R2/Native owner 加真实 `dev.response` / `run.start` 编码预检、阶段+实际字节+上限诊断、拒绝后 `NOT_DISPATCHED` 断言。**未实测真实 Provider，不能声称错误执行已发生。**不调大阈值。 |
| R21-02 | CONFIRMED_BUG | P1 | `src/ui/page-dependencies.js` 用行首正则检测静态 ESM；合法模块 `const ref=import.meta.url; export {ref};` 未拒绝，独立 Node 同正则复现。提交 `c20b990c` 上 source-check 失败，而 `750529aa` 仅修改测试字符串在 `export` 前加换行，**未修改产品正则**，CI 因此转绿。 | OWNED_ELSEWHERE：Sidebar/ESM R2。应恢复原单行失败用例并改产品实现，兼顾 classic 注释/字符串，不可用改变断言隐藏问题。尚未观察到成功执行副作用或授权绕过。 |
| R21-03 | POTENTIAL_RISK | P1 | Go `pkg/scriptloader/module.go` 的 bootstrap 只在 `typeof ...main === 'function'` 时调用；无导出或非函数可静默完成。独立 JS 同分支可复现，`module_test.go` 尚无该负向运行断言。 | Go owner 核对具名 `main` 必需的正式合同，补 Goja 运行负向测试后修复；本轮**没有实际 Goja FAIL 证据**，不标 CONFIRMED_BUG。 |
| R21-04 | NOT_TESTED | P1 | `remote-esm-review.test.mjs` 已测试新增传递 URL 独立同意/拒绝，尚缺本轮 A 域→B 域→C 域、多级协议相对 URL 和 URL 中疑似 token 的完整锁与 UI 证据。 | 在独立测试中补实际缺口；不把缺证据误标安全漏洞。 |
| R21-05 | ALREADY_FIXED（按较新源码） | P1 | 审计过程中 ESM R2 并发更新 `remote-esm-modules.mjs` 的动态代码 AST 检测；较新源码识别 `NewExpression`、`Function`、`globalThis.eval`，现有测试覆盖。 | 避免拿较早的文件快照判定最新源码失败；由原 owner 验证。 |
| R21-06 | KNOWN_LIMITATION + POTENTIAL_RISK | P1 | URL 含查询参数时完整 URL 被保留为锁 key，保证确定性但如含秘密且提交锁会有信息暴露风险；32 个历史锁条目可能占满容量。 | 优先只读体检/作者提醒，不擅自篡改 URL、删除缓存或历史锁。 |

## 原始 CI 第一失败

1. [Native Agent run 38108025107](https://github.com/shopable-ai/opendesk-browser/actions/runs/38108025107) job `114377571335`：完整 Node 回归 **921 tests，913 passed，1 failed，7 skipped**。首个失败 `tests/environment/page-program-package.test.mjs:75`，`expected E_DEPENDENCY_HASH`。该 run 的 macOS ARM/Intel Native IPC jobs 成功，不能抵消 Node 回归失败。
2. [Page Dependencies run 38108025128](https://github.com/shopable-ai/opendesk-browser/actions/runs/38108025128) job `114377571415`：同一 `E_DEPENDENCY_HASH` 断言；其后 build/verify 跳过。属于同一原因，不是独立 ESM/Native 缺陷。
3. [R3.1 权限 run 38107917788](https://github.com/shopable-ai/opendesk-browser/actions/runs/38107917788) job `114377248927`：同一断言导致目标组件失败，真实 Chrome 安装/20 次运行步骤**未执行**，不得标记 PASS。
4. [ESM source-check run 38109263433](https://github.com/shopable-ai/opendesk-browser/actions/runs/38109263433)：`const ref=import.meta.url; export {ref};` 单行检测失败；[后一提交 run 38109278063](https://github.com/shopable-ai/opendesk-browser/actions/runs/38109278063) 成功，但这只因测试字符串增加换行（见提交 [750529aa](https://github.com/shopable-ai/opendesk-browser/commit/750529aae120c6366a27c456b9276497036e75d6)），不等于产品缺陷关闭。
5. 对固定 `750529aa`，[Page workflow 38109278058](https://github.com/shopable-ai/opendesk-browser/actions/runs/38109278058) 和 [Native workflow 38109277998](https://github.com/shopable-ai/opendesk-browser/actions/runs/38109277998) **已成功**。该状态不得继承到后续新 SHA 或真实 Mac 安装。
6. Go `f87d240f` 的 [Windows Core 38061397509](https://github.com/shopable-ai/opendesk/actions/runs/38061397509) 首个真实编译失败：`internal/browsercli/command.go:150 host.Close undefined`，另有 test-architecture 登记数量 `320/296`；[API docs workflow 38061397505](https://github.com/shopable-ai/opendesk/actions/runs/38061397505) 中 Runtime contract 报 `BrowserDOM.* contract-only entry lacks risk reason`。均与本轮 ESM 入口非同因，**OWNED_ELSEWHERE**，勿改断言掩盖。

## 复现输入、观察与等级

- 代表性 Provider JSON 使用 `Buffer.byteLength(JSON.stringify(envelope),'utf8')` 计算。输入源码 61,400 ASCII 字节 → JSON 61,880 字节（>61,440）；35,000 个 LF → JSON 70,480 字节（>61,440）。这是**独立合同/边界复现**，并非实际 Socket 的端到端发送。
- 与 `src/ui/page-dependencies.js` 完全相同的 `/^[\\t ]*(?:import(?:[\\t ]+|['"{*]|\\.)|export(?:[\\t ]+|[\\{*]))/m` 对 `const ref=import.meta.url; export {ref};` 返回 false；`node --input-type=module -e 'const ref=import.meta.url; export {ref};'` 正常解析。这是可复现检测漏报。
- Go 缺少 main 的分支由隔离 Node 执行确认无抛错，但尚未用仓库实际 esbuild→Goja→EventLoop 验证。
- 已有 `local-dev.test.mjs` 含同长度源码更改、缓存失效、ACK 丢失后的只读恢复、Hash 比较；`remote-esm-security.test.mjs` 含 DNS、TLS、并发锁、symlink、FIFO、字节限制等大量负向案例。保留这些有效证据，不重做完全相同的昂贵原生测试。
- **NOT_TESTED**：本机完整 npm/build/verify、Goja、真实 Mac Controller/Page/Chrome、F3、ZIP。各项质量分数 **NOT_SCORED**，无证据不宣布 95/100。

## 本轮新增回归与历史 CI 根因复核（2026-10-11）

- 新增独立 `tests/environment/esm-r21-wire-boundary.test.mjs`，提交 [`ab0b0424`](https://github.com/shopable-ai/opendesk-browser/commit/ab0b0424ba54924856ad38d1ecbc7a99e245de60)，覆盖源码长度仍合法但整个 `run.start` / `dev.response` JSON 超限、换行转义引发的实际 JSON 膨胀、合法较小请求与错误回退消息容量。三项测试通过，**只是容量拒绝与错误信封合同测试，不是 Native Socket/Chrome 端到端**。
- [Native Agent run 38109871001](https://github.com/shopable-ai/opendesk-browser/actions/runs/38109871001) 对提交 `ab0b0424` 已 **SUCCESS**；job `114383021445` 的 *Complete environment Node regression* 亦 **SUCCESS**，原始日志列出新增三个测试均 `ok`（编号 143–145），总计 928 passed、0 failed；macOS ARM/Intel IPC jobs 亦成功。该证据仅适用于固定候选，不提升为实际用户 Mac Chrome 安装/F3。
- 旧 `E_DEPENDENCY_HASH` CI 失败已进一步归因：`tests/environment/page-program-package.test.mjs` 旧版模拟 `runtime.getURL()` 无论实参是什么均返回 jQuery 文件 URL，因而 `getURL('')` **不是**扩展根 URL，`loadPackagedJquery()` 在计算哈希以前先触发 `E_RESOURCE_IDENTITY`；断言却期待 `E_DEPENDENCY_HASH`。这是 R15 jQuery 资源路径迁移后的**过时测试模拟**，不是已证实的运行时哈希绕过。提交 [`c8ca2d8`](https://github.com/shopable-ai/opendesk-browser/commit/c8ca2d8855c846877cc47e7490ba5a90e05e5cdb) 已将模拟改为 `getURL(path) => 'chrome-extension://abc/' + path`，使哈希不一致能够进入真正的校验路径；固定提交后相关 Browser CI 已绿色。**ALREADY_FIXED / 测试修复，不在本工作流重复修改**。
- 历史三个失败 workflow 分别绑定到 Browser `d4589d2540443ab819829b99f155bba61a9f4e85`（Native/Page）和 `eddbc17309ef8a053973f3a457029e78d2fe330e`（权限 CI）。不能说它们是当前 `ab0b0424` 的失败，也不能用今天绿色回写旧失败日志。

## 后续三个最高价值动作与交接

1. **Native 容量合同**：由 Native/ESM R2 owner 基于真实 Provider/Session 生成完整请求/响应 JSON，建立转义、元数据、参数和 60 KiB 邻界测试；失败必须可读、明确未派发，保持 unknown-effect 不重放。
2. **Sidebar ESM 单行检测**：由当前 `src/ui/page-dependencies.js` owner 修复，恢复 `c20b990c` 中原始失败输入，测试先红后绿；避免误拦普通 classic JS。
3. **Go .mjs main 入口**：确认正式入口语义，加入 Goja 的不存在/非函数/异步拒绝用例，再最小修复；与 Windows 编译失败、API catalog 失败分别归因。

本工作流修改独立工作流记录并新增独立 Native JSON 边界回归测试，未修改 R2/Sidebar/Native/Go 产品代码；没有新分支、worktree、PR、破坏性清理、跳过断言或伪造的浏览器验收。
