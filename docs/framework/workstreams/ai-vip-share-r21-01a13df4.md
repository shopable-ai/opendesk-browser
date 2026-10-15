# AI VIP Share R2.1 · 2026-10-15

- Owner: Codex chat `01a13df4-3e87-7081-90b5-a0ce802d6a06`; main only; SAFE_BRANCH_FINISHED / SDK_BLOCKED / PROVIDER_BLOCKED.
- Start HEAD: `8b9c1fcb`; fetched origin/main, local main contains origin/main plus two local commits. Preserve all unrelated dirty files.
- Goal: independent AI tool through approved public Managed Proxy SDK, safe old/new identities, actual CFT network acceptance, per-dimension evidence. No claim of completion or 95+ without evidence.
- Current blocker: R11 approved contract has no Managed Proxy API. Existing aiAccess RPC is private transitional first-party wiring, not public SDK. Do not add a competing Host or unapproved proxy namespace.

## Ownership and execution

- Leader: this workstream; `examples/sidebar-tools/ai-vip-share/` source/config/README; task-specific evidence and tests. Shared SDK files remain R11-owned pending an approved contract.
- Leader CI: `.github/workflows/sidebar-tools-r1.yml` only; replace deleted pre-rename test path with actual R2/R2.1 test files. Preserve existing checks and suite scope.
- Lifecycle executor: `src/ai-smart-access/{policy,service,lifecycle}.js`, `tests/environment/ai-vip-share-r2.test.mjs`, new `tests/environment/ai-vip-share-r21-lifecycle.test.mjs`. No other source files. Re-read current diff before each edit.
- Read-only sidecars: R11/Chrome evidence lookup, ai-proxy protocol and official Chrome proxy references.
- Network executor: new `tests/framework/ai-vip-share-r21-network.mjs` and task evidence `network/` only; isolated launcher/profile, dynamic ports, controlled origin/relay; raw Chrome/PAC layer only. No daily Chrome/Native, no product grant/receipt forgery.
- No ownership of unrelated Cookie Editor, scheduled-task, Workflow edits or historical public-owner.json.

## Cleanup and verification sequence

1. Lock unsafe rename/recovery behavior with regression tests. Preserve active legacy PAC on worker wake; explicit old STOP/uninstall releases only proven old ownership, never a new tool's resource. Unknown state/readback/storage outcomes fail closed.
2. Move only business bytes that can execute through approved existing framework contracts; do not move AI policy into framework or create another host. Record exact remaining per-file blockers.
3. Run affected Node tests, tool pack, check, and guarded independent snapshot builds/verify/full tests. Existing successful evidence is reused only for identical inputs.
4. Use an exclusive CFT profile/output/ports if the approved SDK path permits actual product testing. Controlled raw Chrome PAC evidence is a distinct layer, never SDK/tool installation PASS.
5. Review exact task diff, commit with Lore trailers, normal push main after fresh remote/state check. User explicitly authorized commit/push; no PR, branch, worktree, release, or Native re-pairing.

## Resources

- Daily development: active writer PID `83221`, `.wxt/development.lock` kind `development`, root this checkout; TCP `43119/43120` listening (initial command-name scan missed it; explicit lock/listener check corrects that scan). Expected output `dist/development`. Loaded daily extension identity and serve-client connection are NOT_TESTED; do not replace/reload it.
- Candidate: static production/development builds only under a task-specific independent snapshot/output after build guard review. No writes to daily dist.
- Other running CFT profiles observed for scheduled and cloud work; do not use or stop them.
- Evidence output: `docs/framework/workstreams/evidence/ai-vip-share-r21-01a13df4/` (task only).

## Initial evidence decision

- R2 identity evidence: retained as historical; old test expecting unconditional stale-PAC clear conflicts with current explicit fail-closed migration requirement. New lifecycle behavior requires affected tests, no native PASS reuse.
- SDK/provider/native/end-to-end: BLOCKED / NOT_TESTED until actual contracts and candidate evidence exist.
- Baseline regressions: executor first wrote lifecycle cases and reproduced failures against unchanged R2 source; original baseline log will be preserved separately from passing results.
- Tool pack: existing `npm run build:sidebar-tool -- examples/sidebar-tools/ai-vip-share` succeeded, ID `ai-vip-share`, version `1.0.1`, 1689 bytes, capability `ai.access`, installed=false. This is still the transitional package, not the SDK-first final product.
- Lifecycle final: 27/27 Node PASS, including first-red/then-green explicit STOP retry alarm when no legacy alarm existed; baseline and retry failure logs retained.
- Source check in bound snapshot: PASS, 706 source/test/build files. First full test run lacked dist prerequisites; preserved failure. First production build rejected the shared node_modules symlink as an out-of-repository module. Preserve this fail-closed provenance check; replace only the task snapshot symlink with a local APFS clone of existing pinned dependencies, no install or dependency change, then rebuild.

## Per-file migration disposition

| Existing module | Disposition | Actual remaining gap |
| --- | --- | --- |
| `src/ai-smart-access/policy.js` | AI domain list belongs in tool; endpoint validation/PAC compiler belongs in approved public Managed Proxy implementation | R11 has no approved proxy operation/schema/binding; keep audited current bytes until a safe consumer exists |
| `src/ai-smart-access/service.js` | Activation/provider flow belongs in tool, persistent managed resource recovery in public runtime | No approved runtime or deployed provider; cannot delete recovery while legacy PAC can remain active |
| `src/ai-smart-access/lifecycle.js` | Preserve and repair legacy ownership/cleanup; later use shared lifecycle | Active legacy protection must survive rename and unknown outcomes; source fix is independent of SDK approval |
| `src/ai-smart-access/tool-host.js` | Remove after public installed-tool Host/Authority supports proxy | Private `aiAccess.*` cannot be relabeled public SDK |
| `src/ai-smart-access/host-controls.js` | Business messages/activation UI belongs in tool; global permission/one-shot consent belongs in existing trusted controls | No approved proxy consent operation; moving mutations into opaque UI would remove the current trusted-click fence |
| `src/ai-smart-access/provider-config.js` | Provider declaration belongs in tool | Reference ai-proxy has no deployed activation/verify contract; never fill guessed URLs |

## R11 dependency request (requirements, not a published API)

The existing Registry/Schema/Host/Authority owner must approve a bounded managed-resource contract: status/consent, acquire declarative exact domains and validated fixed endpoint, durable owner identity (`toolId`, packageHash, installEpoch, real sender/document), mandatory PAC without protected DIRECT fallback, single global lease, readback, stop/revoke/uninstall, worker/browser recovery, conflict and unknown outcome handling. No raw PAC text, arbitrary Chrome settings, dynamic host code, or AI-specific privileged operation may enter the public surface. The source discovery row is not approval. Installed-tool business migration remains SDK_BLOCKED until this dependency exists.


## 本轮最终结果（2026-10-15）

R2.1 **未完成**。完成的是旧/新身份代理生命周期安全修复、回归与受控网络验证；业务仍依赖专用 Host/Service，不能称为独立 SDK 工具，也不满足 95+ 交付条件。共享 SDK 的代理能力未获批，按用户要求记录阻塞，不增设 AI 特权通道。

- 安全修复：旧活跃 PAC 不因更名/无新状态被清除；Package Hash/Install Epoch 不继承激活；清理核对精确 owner/PAC/peer；STOP 先持久化并保留重试 alarm；锁覆盖释放与删除；排队旧请求、宿主关闭和卸载后的旧恢复不能重新写入。
- 独立复核：首次指出两个高风险竞态，修复后限定静态复核无未关闭发现。首次意见与失败回归原样保留。
- 定向 Node：30/30 PASS。完整 npm test：2558 项，2554 PASS、1 FAIL、3 SKIP。唯一失败为隔离 CFT Native 权限弹窗无法安全识别；测试清理自身 profile/Native instance，未绕过授权，未影响日常配对。
- 最终独立快照：`candidate-r2`，基于 `d44181bd1ca6bb1aaf7d11d0fb5fd88b1fb00b32` 与九个明确 overlay；所有 overlay 在验证后与工作区哈希一致。check（706 文件）、build、build:dev、verify、pack 均 PASS。构建不含其他 Agent 未提交改动。
- 构建模式：静态 production / 静态 development，位于 `.runtime/ai-vip-share-r21-01a13df4/candidate-r2/dist/`，无 serve 客户端；不是日常持续开发环境。日常 watcher 已外部更新为 PID 66940，仍持有 `dist/development`；日常实际加载 ID/连接未测试且未操作。
- production packageHash：`ce2cf417c4d80dd7152bf585804d65ea1ba7a08632e87218953a29f65c36654b`；development：`90cab0f36c9a416e18ce435db9fcfb8e8f5664ee1a2d5f517fcd8d6358320b1e`。SW 615349 bytes 超过软审阅线，低于 1048576 硬门限；不改门限。
- 工具包：`ai-vip-share` 1.0.1，仍声明过渡 `ai.access`；根目录工具包与两种 dist 字节哈希一致：`7f896bb839d88bd55e24ab66526b011a76aee425ffe9e187fb57a68d8a140630`。未安装。
- ZIP：`artifacts/ai-vip-share-r21-01a13df4/opendesk-browser-production.zip`，1249750 bytes，SHA-256 `c3b5d50d552d4fde961a52b3696ad176126f559333c238a3964f7f0dde7e0977`。只打包，未获 F3 或安装验收，不作为最终交付版。
- 受控网络：CFT 155.0.8059.39，fixture Extension ID `ahkdnnchihidgcbjcgbijphkdhincdnc`，40/40 PASS；覆盖 AI 主/子域、普通/恶意近似域、路径/查询、不可用代理无回退及 STOP 清除自身控制后回到系统基线。该 ID 属于原始 PAC fixture，不是实际 OpenDesk 安装 ID。首轮错误地要求系统基线必须直连的两项观察已保留为 PARTIAL；后续按 clear/读回/基线验证，不设置全局 DIRECT。
- 未测试：正式工具的安装/升级/卸载、竞争扩展/策略、SW 与浏览器重启、撤权、Side Panel 关闭、真实服务、全部 UI 尺寸/主题/键盘/ARIA 与正式 ZIP。不把组件或 fixture 证据提升为这些 PASS。
- 删除文件：无。六个旧模块仍保留恢复职责及已记录迁移缺口；未新增依赖、权限、SDK namespace 或第二安装器。

### 八维独立验收

每维评分均为 `NOT_SCORED`（数值 null），不计算平均分；独立静态复核仅限安全修复。

| 维度 | 状态 | 主要缺口 |
| --- | --- | --- |
| 独立架构与业务解耦 | BLOCKED | 旧六模块未迁出，公共 Runtime 合同缺失 |
| SDK 复用与框架一致性 | SDK_BLOCKED | R11 proxy 无获批 operation |
| 安全与 Chrome 权限隔离 | NOT_TESTED | 缺正式工具真实权限/竞争证据 |
| 代理核心功能 | NOT_TESTED | 40/40 仅 PAC fixture，非工具 SDK 链 |
| Chrome 生命周期 | NOT_TESTED | 缺正式工具重启/恢复/撤权证据 |
| 用户体验与可访问性 | NOT_TESTED | 全部指定尺寸/主题/键盘/ARIA 未完成 |
| 安装、升级与卸载 | NOT_TESTED | 仅工具/ZIP 打包及字节一致性 |
| 测试与证据可信度 | BLOCKED | 全测一项 Native 失败，F3/ZIP 缺失 |

完整原始日志、候选绑定、构建收据、独立复核、失败保留与逐维结论见 [acceptance.json](evidence/ai-vip-share-r21-01a13df4/acceptance.json)。提交与 CI 身份另写 publication.json，避免自引用提交。测试资源已释放；保留两个候选用于审计，不改写旧收据。


### 提交与远端集成状态

- 本任务源码/证据提交：`fcba2ca0380804fa27e0b1fb56d916a5cf4a1f1b`（Lore trailers）。只暂存本任务 101 个路径，未夹带他人未提交改动。
- 正常 push 被拒绝：远端 main 已推进至 `8d91b0394e4a40ff31b945ad992064a343ea01f1`（AdBlock/Cookie Editor）。只读提交历史合并检查无冲突；正常 merge 为保护本地其他负责人的 `src/ui/tool.html` 和 `tests/framework/cookie-editor-r33-native.mjs` 而拒绝。
- 未 stash、提交、覆盖或改写这两份他人文件；未强推、创建分支/worktree/PR。仅暂停共享 Git 集成部分。正常 merge/push 拒绝原文已保存。
- 本源码未成功推送，因此 CI `NOT_DISPATCHED`，没有可归属于本提交的 CI run URL。不能引用远端其他提交的 CI 冒充本轮 PASS。详见 [publication.json](evidence/ai-vip-share-r21-01a13df4/publication.json)。
- 继续条件：R11 负责人交付获批 Managed Proxy 合同；真实 Provider 交付协议/线路；并行文件负责人完成交接后正常集成并验证实际受影响契约。当前其余安全可执行分支已完成。
