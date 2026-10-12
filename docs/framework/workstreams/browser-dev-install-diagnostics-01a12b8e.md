# 本地开发安装身份、只读诊断与更新回退

负责人：`01a12b8e`；2026-10-11；直接在 main 本地工作，未经授权不提交、推送或发布。

状态：COMPLETE（2026-10-12，仅本任务安装诊断与更新流程；不关闭整体迁移/F3/ZIP）。

目标与缺口：R17.1 固定版本字符串、只有入口 SHA 的登记和没有完整内容身份的 npm 包，不能区分同版本旧安装；现有 Go doctor 未覆盖 npm 包内容及 Node 选择差异。补充实际包版本、内容指纹/构建来源、只读分层诊断和可复现更新/回退。

实施范围：`native-agent/local-dev/dev-cli.mjs` 及安装身份/诊断模块、`scripts/pack-opendesk-dev.mjs`、npm 包 metadata、定向测试、中文快速开始与错误说明。保留 Go binding 格式、Provider/保存/Run/替换/Stop 合同；来源 Go 工程只读，不改接口。

计划：

    安装与构建身份：生成完整 bin/runtime/package.json 内容清单，实际安装重算并比对；版本不代替内容。
    只读诊断：Node 执行与 Go 选择、CLI 注册/不同全局入口、Host/manifest/扩展配对和认证能力；不接入目录或运行项目。
    更新与回退：独立输出、私有备份、显式安装注册、连接和扩展内容核验，保留可还原身份。
    验证：源码检查、定向回归、私有打包构建与安装验证；按相关输入复用既有浏览器证据。

资源：只使用本任务临时目录及专属证据目录；不占用共享 dist/.wxt、43111、日常 Native/Chrome 安装、其他 CFT/数据库；诊断只进行认证握手，不发送业务请求。已有工作区 staged/unstaged 修改属于其他对话，保持。

复用入口：已读 `AGENTS.md`、`testing-guide.md` 与 `browser-dev-go-migration-01a12b39.md`；原始 `/Users/shopme/.codex/tmp/opendesk-browser-dev-20261011-01a12b39` 只读核对。旧 receipt 不改写，组件/本地安装不升级为 F3/ZIP/整体迁移。

通过条件：用户可定位故障层并据文档可验证更新与回退；同版本内容差异可见，打包和安装指纹一致，定向测试/源码检查/隔离构建通过。实际结果和复用限制在完成时追加。


## 实施结果

    构建与安装身份：已实施；实际 package version、real install/entry 路径、完整内容指纹、metadata SHA；同版本内容变化可见。
      复用 SHA-256 + 排序 {path,bytes,sha256} 清单；覆盖 bin/runtime/package.json、npm-shrinkwrap 和 bundled 运行依赖。
      npm 生成的 .bin/.package-lock.json 不计入内容；Git/dirty/根 lock 来源保存在 build-info，不回显任意 provenance 字段。
      --register-go 保留 Go v1 格式、入口 SHA、权限与 localDevAccessVersion；增加版本/内容指纹，拒绝不一致的候选。
    只读分层诊断：已实施；当前/预计 Go Node、PATH/npm CLI、登记、Host owner/manifest/launcher、真实扩展 ID、认证连接与 multi/files/access 能力。
      --doctor [--json] [--expect-package /candidate] 只读文件、一次 auth 后关闭自有连接；不运行候选 Node、不附加项目/注册 Provider/打开浏览器/迁移。
      旧 Node owner、旧构建/登记、同版本旧内容、依赖缺失/版本漂移、未连接、扩展未连接、能力不兼容分别报告原因与修复。
      只检查默认 Node/import 条件入口，不加载依赖。所有报告不含实际 credential/config 原文；扩展 capability 只取三个版本字段。
    可复现安装：已实施；独立新 --out，拒绝覆盖既有目录、dangling/父路径 symlink；打包支持已有 JSX/Vue .cjs 适配器。
      使用现有根 lock 的 CLI runtime/optional/peer 可达闭包，允许已有 source-map 传递依赖，不借用无关 Vite 等开发依赖。
      esbuild 0.28.2 早已在根 lock/Resolver 中使用；经用户“专家合理判断，采用优秀解决方案”答复，只补 CLI 声明，不引入新库或改根 lock。
      实际 npm 全局安装曾忽略单独 shrinkwrap，六个传递版本漂移且被诊断拦截；最终 bundle 现有锁定依赖并按 npm 实际 packlist 生成指纹。
      生成 os/cpu 限定本机构建平台，消除当前可选二进制跨平台歧义；换平台需重新打包。
    更新与回退文档：已完成；中文安装指南及四个快速开始/错误入口已同步。
      备份 SHA、精确 tarball/prefix/Node、重新登记、连接、扩展目录指纹/Reload、精确旧 CLI/登记/Native owner/manifest 恢复均有操作步骤。
      Go 是目录直连主路径；旧 Node/MCP 兼容路径单独说明。源码构建、本机安装、原生验收与正式发布分别记录。

## 验证与身份

原始文件见本任务 [evidence 目录](evidence/browser-dev-install-diagnostics-01a12b8e/)，SHA 索引 `evidence-index.json`；各轮失败保留，不覆盖旧 receipt。

- 最终源码候选：`source-final4-binding.json`，inputFingerprint `6f8024f04585f2b50c825e648ba0fb8b307128a4e1fa30ab9161631cbe7f8f58`。私有冻结副本沿用上一轮并行代码，仅覆盖本任务 owned files；HEAD 仅追溯，逐文件清单是身份依据。后续仅补文档，记录于 `final-task-source-bindings.json`。
- 源码检查：`source-check-final4.log`，452 source/test/build 文件及固定 SDK/CSP/MIT 检查通过；`native-source-check-final4.log` 另核对三个变更 Native CLI 模块语法。
- 受影响测试：`affected-final4-serial.tap` 53/53 PASS，无 skip。版本、指纹、锁、同版本差异、NVM/Homebrew、Go Node 不执行、登记/权限/manifest/能力/连接、真实独立 Socket auth-only、输出保密与包边界均有针对性覆盖。
- 原运行合同：`managed-ui-final3-serial.tap` 17/17 PASS，其代码/合同与 final4 未变，直接复用；与受影响测试合计 70 项。并发轮 `targeted-final3.tap` 曾 68 PASS/1 FAIL（preview-pending 未在有限轮询内变为 evaluated）；停止构建负载后串行通过，保留失败，不改原合同或测试。
- 最终 tarball：`pack-final4.json`，版本 `0.1.0-r17.1`，4541 文件；contentFingerprint `1f6dbdfd1758e8533e5576abe4bb453ed76290c58af836165870db105880105d`，archive SHA-256 `f78e02e0d07c9b36de543c89b60ab8cec14b2ff078a61ae74c85890121ae5b9a`。
- 复现：`pack-reproducibility-final4.json`，同一源码/lock/平台两次新目录打包，版本、内容指纹、archive SHA-256、npm integrity、文件数/字节全部一致。
- 独立安装与回退：`install-final4.log` offline、ignore-scripts 安装到专属 prefix；`install-rollback-smoke-final4.json` PASS。打包/安装内容与 metadata SHA 相同，68 个本平台已安装锁定依赖版本一致；真实私有登记；只发生 4 次 auth 连接。
  - standalone controller、React JSX、Vue SFC 均用已安装 Resolver 编译准备；第二次均命中同一 artifact 缓存，没有项目运行请求。
  - 保持包版本和 bin SHA 不变、改变 runtime 字节后，准确报告同版本候选差异及登记内容变化；tar 备份恢复包/bin/登记后旧指纹与 metadata SHA 精确复原。
  - 这是隔离安装/协议 fixture，不是伪造 Native PASS。Socket fixture 使用短专属 /tmp 目录，测试后清理。
- 隔离扩展构建：`build-production-final3.json` status passed、sourceDrift=[]，packageHash `0f0d08055e368b541d6e9608010a5fbb4206b60e7c444c824a466b2d8d12d59d`。仅私有 dist/.wxt、随机 output guard 端口。`extension-build-reuse-final4.json` 核对所有物理消费模块未变（虚拟 wrapper 输入亦未变）；唯一 broad source-input 差异是 CLI pack 脚本，复用原绑定 receipt，不伪称新整体候选已验收。
- 实际日常安装只读诊断：`actual-source-doctor-final4.json`，现有 Go Native authenticated/browserReady、三个 capability=1；识别源码入口以及现有全局 CLI 的旧登记/构建记录。真实 credential 未出现在报告。日常 npm/Go/Chrome 安装未更新或重启。
- 文档：五个中文入口的相对链接检查通过，`git diff --check` 通过。独立 readonly 审查 Singer、Zeno 均无剩余实质阻断；审查不冒充动态验收。

## 复用证据与保留失败

`native-lifecycle-reuse.json` 绑定原 `browser-dev-go-migration-01a12b39` 原始文件 SHA；protocol、host-adapter、managed-preview 和原 managed UI 测试四项输入 SHA 仍一致。仅复用原本地 Page preview 的“保存只准备、明确 Run、替换清理、Stop 清理”证据；不提升为当前全部 main、durable runId/resultId、F3 或 ZIP。

保留每轮 source/pack/install/build 原始输出：早期副本缺 official-tools/新增 Vue loader、.cjs/依赖闭包缺口、缓存未命中、symlink dependency root 导致 provenance 拒绝、npm shrinkwrap 被全局安装忽略，以及过长 macOS Socket 临时路径。只有修复代码/补齐副本/恢复现有依赖/改变隔离环境后重试。最终 bundle 与短 Socket 方案解决相应失败。4 GiB 未完成且没有成功绑定的 source-v1 副本已删除；原来源、全部有效绑定、旧 receipts 与失败输出保留。

## 剩余边界与资源释放

- 上游 Go 只读；目前只强制入口 SHA/权限和 access version，尚未强制核对完整 CLI runtime/bundle 指纹。缺口：Go 可消费登记的 contentFingerprint 并提供完整包身份遥测；此任务未越界改接口。
- Go 当前不转发 `dev --doctor` 或 `--version --json`；详细诊断用 npm CLI 的绝对入口。预计 Go Node 选择来自上游策略，不代表运行中实际 Node 遥测；另一候选 Node 未执行，版本保持 unknown。
- Auth 回应没有扩展实际加载路径/packageHash；必须按文档独立比对扩展包，收尾后真实 Reload/重连。磁盘检查也不能证明旧进程已经重新加载模块。
- 平台二进制及完整 bundled 指纹限定本机构建；不声称跨平台 tarball。当前未做新浏览器验收，无界面/运行合同变更，不占用 CFT。全量框架、独立最终 F3、ZIP/正式发布仍由各自工作流完成。
- 专属 guard/Socket 均关闭，失败 fixture 清理，未占用共享 dist/.wxt、固定端口/profile/数据库或日常安装。仅保留任务产物、私有 prefix 和备份便于复核；`resource-cleanup.json` 记录。
- 本任务未执行 commit/push/publish；其他对话推进 main/提交的事实不作为本任务授权或验收。保留其改动，未改全局 owner/历史 receipt。
