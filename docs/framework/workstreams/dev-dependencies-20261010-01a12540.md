# 本机开发依赖恢复

2026-10-10；对话 `01a12540-83e9-79b3-9e6e-71ffa8d51eac`；状态 **DEV_FIXED / STOPPED**。代码写入完成、source writer released；此前依用户启动请求保留 PID 24761 的开发服务占用 43119/43120、dist/public。前轮校验失败保留，最新严格校验已通过。

用户运行 `npm run dev` 在复制 `node_modules/lodash-es/LICENSE` 时遇到 ENOENT。本机 `npm ls --depth=0` 确认 `lodash-es@4.18.1` 和 `dayjs@1.11.23` 均未安装；package.json/package-lock.json 已声明精确版本。现有安装目录尚未同步最新依赖。

范围：在 main 恢复被忽略的 node_modules，验证许可证存在、开发构建与服务启动；不修改产品源码、依赖版本或锁文件。保留当前其他会话的测试改动与工作流文件。

复用：已读 testing-guide.md、WXT 开发工作流和 R15 依赖工作流；既有 CI 构建不能代替本机缺依赖问题的验证。仅做本机依赖/启动的最小验证，不重跑原生业务、F3 或 ZIP。R5 工作流使用独立安装/包快照，不占用 Browser dev 43120。

资源：本机 node_modules；验证启动时由 development-lock 独占 `.wxt/public`、`dist/development` 和 43120。执行前未发现本仓库活动 dev/build 进程或开发锁。使用独立证据目录 `docs/framework/evidence/dev-dependencies-20261010-01a12540/`；验证结束停止本轮服务并记录 released。

计划验证：按 README 执行 `npm ci --ignore-scripts`；核对 npm ls、两个 LICENSE 及锁文件哈希；实际 `npm run dev` 达到 RUNNING，校验开发包后用 Ctrl+C 停止。启动失败日志作为用户提供的原始失败保留在聊天中。

## 本轮结果

本机候选 HEAD `e890c2c0b663e98c24ea30225a47a03ded117407`；Node v24.16.0 / npm 11.13.0。执行 `npm ci --ignore-scripts --no-audit --no-fund` 成功，1 秒安装 242 包。`npm ls --depth=0` 成功，两个精确版本完整；lodash-es LICENSE 1952 字节、dayjs LICENSE 1072 字节，开发包内复制件均与依赖文件 SHA-256 一致。

`npm run dev` 实际完成开发构建并输出 RUNNING；原 ENOENT 已消除。未修改产品源码、package.json 或 package-lock.json。恢复前后 package.json SHA-256 为 `5dc57718d4fa9308ccafcbb81eca489f56f101d5c791d018e9fd8a97092b9566`，package-lock.json 为 `43b1e41cf3a4b11d96567f5bdb9f46e1b4e015b504d2df7528c458e36d347fd8`。

额外运行 `node scripts/verify-package.mjs dist/development` 返回 1：`Expected default all-site host permission`。实际开发 manifest 的 host_permissions 为 `["<all_urls>","http://localhost/*"]`，与严格合同不一致；该失败独立保留，本轮仅关闭缺失依赖导致的启动故障，不宣称完整包校验通过。一次资源探测使用错误路径 `builtins/page.js` 得到 ENOENT；实际 WXT 输出 `runtime/builtin-libraries/page-core.js` 已核对存在。HTTP 根地址响应 404，未把它作为应用网页验收通过。

验证用 npm/tee 进程组在 SIGINT 后退出，原子清理未完成。本轮原开发 PID 12023 已不存在；通过 `acquireDevelopmentLock` 获取 OS guard 后，仅清理本轮精确 revision `2f16fa031c6864843d3de3ca79430266cd390aa7f7209c42b1b5e749f45afcf0` 的 marker，释放本轮锁。最终 43119/43120 无监听，development.lock 和 development-update.json 均已删除；用户可重新运行 npm run dev。

独立原始记录：`docs/framework/evidence/dev-dependencies-20261010-01a12540/npm-ci.log`、`dev.log`、`verify-development.log`、`validation.json`。validation.json 记录相关输入和日志哈希、依赖版本、真实 startup 观察、校验失败及释放结果。未重复业务组件、Chrome 原生、F3、ZIP 验收，不提升既有证据等级。

复用边界：相关清单/锁文件与本机安装完整性一致时可引用本轮启动证据；再次更新依赖需同步安装。严格包校验失败需要后续独立定位，不属于本轮 ENOENT 修复的 PASS。

用户追问原因及同类问题后，补充只读核对 `npm ls --all --json`；完整安装树未报告 missing、invalid 或 problems。原始树及 stderr 单独保存为本轮 `npm-tree.json` / `npm-tree.stderr.log`。不重复启动或构建。原来的 dayjs 缺失也是同类问题，现已同时修复；dev/build 都引用 preparePublic，未同步依赖时会影响两个入口。npm run dev 本身不安装依赖，Git 更新也不更新被忽略的 node_modules；不能仅凭当前状态断言用户从未安装，只能确认更新后的依赖尚未同步。

## 开发服务故障继续修复

2026-10-10 用户补充 18:11 的实际日志并明确授权直接启动修复；状态 **IMPLEMENTED / VERIFIED / RUNNING**。新事实：初次启动成功，Git 拉取时 settings.js 出现临时合并标记；config 重启后 Vite 扫描只读历史 HTML，异步 restart rejection 未接住导致 Node 退出。settings.js / script-editor.test.mjs 的冲突由 `git-pull-20261010-01a124dd` 工作流串行解决，本工作流不覆盖其文件或提交。

本轮写入范围：scripts/dev.mjs 的重启错误处理、wxt.config.mjs 的 Vite hook/manifest 隔离、scripts/wxt-development.mjs 的 live 资源发布（仅有实际缺口时）、独立开发回归测试和本工作流。只读子 Agent 检查 WXT API；没有并行写入者。共享 dist/public/43119/43120 在实际验证时由本工作流 development lock 独占；当前旧 PID 13496 已退出的锁由锁模块安全恢复，不删除其他资源。

通过条件：实际启动 RUNNING，无历史 HTML dependency scan；临时失败可恢复且不退出；开发 manifest/资源满足原严格合同，marker 原子发布；实际停启均正常，最后依用户启动请求保留正常开发服务。验证使用本轮独立新日志，前轮严格校验失败继续保留。

## 最终修复与验证

当前 main HEAD `3e524329e58b6e395f9bc24277c1728a4a80bc38`；本轮四个代码/测试文件保留未提交修复，不 stage/commit/push。拉取对话在本轮期间串行引入上游 builtin manifest 发布修复；保留其新增行为，本轮不将它覆盖或重复计为独立实现。R2 明确仅维护 script-editor.test.mjs 与其专属报告，使用独立 archive 构建；本轮不修改其文件。

- scripts/dev.mjs：安装有错误处理的串行重启控制，关闭时撤销恢复监听并等本轮队列完成。
- scripts/wxt-development.mjs：保护 WXT all 事件的异步文件重载错误，丢弃失败队列并在相关源码修改后重新启动；旧 Vite watcher 已关闭时使用可释放的标准库恢复 watcher；Babel 入口错误走本轮可停机恢复逻辑，避开 WXT 不可取消的私有 syntax wait。发布前按源 manifest 恢复并验证 CSP/host policy；SDK/builtin 清单与 marker 保持真实哈希和原子发布。
- wxt.config.mjs：将禁止 HTML 依赖发现移入 Vite 基础配置，保证 hooks 尚未重装时仍生效；向 WXT 提供 manifest 克隆，避免开发权限注入污染基准。
- tests/environment/dev-service.test.mjs：增加错误恢复、关闭 watcher、停机队列、Babel 错误、Vite 基础配置、manifest 隔离和发布完整性的组件回归。

最终定向回归 **21/21 PASS**：`targeted-regressions-final-v2.log`，覆盖新开发回归、已有 WXT 更新协调、output guard 和 builtin loader。`npm run check` **PASS**，268 个文件，见 `source-check-final.log`。本轮受影响 diff whitespace 检查通过；无遗留 Git 冲突标记。

真实开发验证：`config-restarts.json` 记录同一 PID 连续两次配置重启，无历史 HTML scan，host_permissions 始终只有 `<all_urls>`、builtin manifest 已发布。`error-recovery-final.json` 及后续 `smoke-final.json` 前两轮记录入口 metadata 和实际 settings 模块的临时 merge marker 均被接住，进程存活，修正文件后恢复同一有效 revision；失败期间 marker 保持旧值或缺失，不发布不完整包。所有临时源码探针均恢复原 SHA-256。

保留失败/限制：初轮真实入口 metadata 错误注入发现尚未保护的 WXT watcher rejection，原 `dev-fixed.log` 保留；补上保护后重测对应路径通过。额外 config 语法错误注入未触发观察器预期的失败日志，`smoke-final.json` 对该额外分支保留 **FAILED / Failure not handled: wxt.config.mjs**，探针已恢复；不将其计为真实配置解析错误恢复 PASS。关闭 watcher 后的恢复已有组件证明，实际该额外正例保持 **NOT_TESTED**。不据超时推断浏览器或配置行为。

`shutdown-while-invalid.json` 记录在入口源码仍有 Babel 语法错误时向本轮 PID 20233 发 SIGINT：进程返回 **0**，锁和 marker 均删除，随后恢复源码。没有遗留 43119/43120 监听。

停止后执行原 `node scripts/verify-package.mjs dist/development` **PASS**，未修改或放宽 verifier 合同，见 `verify-development-final.log`；packageHash `8f4edfb5b44a1cfbaf5ce32698ea771b0ab54ae0ada34970a7c0b45b2a0bb36d`，16 个 classic entries，未发现特权动态执行。前轮 host_permissions 校验失败已由发布 policy 修复，原失败日志保留。

最后重新启动 `npm run dev` 并保留运行：PID **24761**，服务 43119、OS output guard 43120，日志 `dev-running.log` 输出 RUNNING，无 scan/restart 错误。`running-final.json` 核对所有已严格校验的输出文件逐字节哈希一致；live marker revision `f08c21c0a0d208fae00a744631c4cae918efd757769fb7f3b3def004756174c7`。新源码/测试/锁文件绑定和检查时间均在该 JSON 中。

写入交接：代码写入完成，无待执行写入；后续 Agent 可串行处理自己的授权文件并保留本轮未提交修改。开发运行资源由上述用户请求的服务持续占用，不得另向共享 dist/public 构建或争用端口；独立 archive/独立产物不受影响。本轮没有操作 Chrome、profile、Native Host、正式账本、F3、ZIP 或发布，不提升其他候选证据等级。


## 用户终端启动交接 2026-10-10 18:49（当前状态）

用户再次执行 npm run dev，43120 报 EADDRINUSE。已核对占用者为本对话之前保留的开发服务 PID 24761，.wxt/development.lock 的 pid/token/root 与启动记录一致；43119/43120 均由该进程监听。这是同一开发输出的单实例保护，不是依赖安装失败。

已向核验后的 PID 24761 发送 SIGINT 正常停止。2026-10-10T10:49:59.997Z 核对：进程不存在，43119/43120 均可成功绑定，development.lock 和 development-update.json 均已移除。当前状态 STOPPED，开发输出与端口已释放，交由用户在自己的终端执行 npm run dev。未重新启动或改动启动代码，未触碰其他对话的 43111 服务。

证据 terminal-handoff.json 单独新增；此前 running-final.json 与启动、回归记录保留为历史证据。
