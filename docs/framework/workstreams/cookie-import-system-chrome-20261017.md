# Cookie Editor 系统 Chrome 手动导入续查 · 2026-10-17

- Owner：本次 Codex；main 原位；已获仅提交本任务文件与正常推送 main 授权。不建分支/worktree/PR，保留其他 Agent 差异。
- 状态：LOCAL_FIX_VERIFIED_SYSTEM_UPGRADE_PENDING。范围：用户当前系统 Chrome 安装版手动 JSON 导入；不做 production、全量原生、缩放、UI 重构。
- 写入范围：`examples/sidebar-tools/cookie-editor/src/main.js`、`tool.config.json`、`README.zh-CN.md`、唯一正式 JSON；`tests/environment/cookie-editor-ui.test.mjs`、`cookie-editor-r43-parity.test.mjs`（仅版本断言）；本记录。通用 SDK/Host/权限默认只读。独立只读 explore 子 Agent 检查预检异常链，不接触真实样本或浏览器；已完成并关闭。
- 已读 testing-guide、cookie-import-real/native-driver/sdk-batch/limits 四份 20261017 记录，既有 248/248 与 31/31 依原输入限定复用；61 条虚构导入单项 PASS 与随后清理失败保留，不提升为完整原生 PASS。
- 持续开发：固定 `dist/development`；唯一既有 npm dev / node PID34253，43119/43120 listener。未启动第二 writer。系统 Chrome PID77828；独立其他任务 CFT PID53072、56004 不接管、不关闭。
- 系统 Chrome Default 的 Secure Preferences 只读核对：unpacked ID `ccfcjegpkdlgbclopjmadlcjedelidmf`，path 为本仓库 `dist/development`。开发输出 revision 初查 `9c335122d2992bcd3609c5e29fcda5517e48860fd82ecf4dd0fd5ab66602165b`；实际系统 Chrome client 连接与当前 iframe 文档仍未验证。
- 直接只读解析本机扩展存储 WAL 最新 installed registry（sequence4849；不复制 profile 或输出用户数据）：Cookie Editor **2.0.19**，JS SHA256 `506b6510428c77c3e9dc88e93fe69967a4788437d700ae68928bd873e4c4ae37`，含用户完整旧报错。正式源码及 dist 包为 **2.0.21 / 306de34970ee51b6368dd481b8885a39632076172b561ac0d69c1d3ffd43fcc1**。已证明安装包落后；WAL 身份不等于当前 iframe 字节证明。
- 自动审批拒绝浏览器工具打开 chrome-extension 管理页（协议仅允许 HTTP/HTTPS），并明确禁止改用原生 UI、CDP 或其他通道取得同一结果。用户随后明确授权直接控制、重启/刷新浏览器及扩展并测试；授权已充分，但不解除工具策略阻塞。继续本地修复和包门禁，不直接改存储、不卸载、不清数据；实际安装升级保留 NOT_TESTED，不再重复请求用户授权。
- 隐私：真实 Cookie 仅原路径本地内存，禁止名称、值、完整输入、截图和敏感 trace；无重复真实样本导入。当前先定位旧版拒绝条件及新版安全诊断缺口。
- 通过条件：明确旧版拒绝步骤；新版错误标明本地安全阶段与白名单原始码，恶意错误正文不透传；输入保留且同框修改可重试；定向回归、包构建/晋升/同源校验通过；用户系统 Chrome 实际更新/iframe 及真实导入证据独立记录。

## 本次根因与修复

- 系统安装 JS 与 Git `7293a838b` 的 2.0.19 源码 SHA 完全一致。使用该精确解析器读取用户原路径样本，仅本地内存执行、无浏览器写入，首先复现 `EXPIRED_RECORD_REJECTS_WHOLE_INPUT`；其后还有 `rows.length>10` 限制。旧 catch 把本地解析、数量、Store/Partition/网站授权等全部隐藏为用户完整旧文案。样本不是无效 JSON；不能据该文案推断缺网站权限。
- 当前解析器对相同原文为 30 条 / 25 ready / 5 expired / 0 invalid；过期按执行时间计算，未修改有效期。`parser-diagnosis.json` 中 `allHaveStore` 实为“全为字符串”检查；后续 `sample-structure-current.json` 明确区分字段存在、字符串与 null，不把 null 当作缺字段或擅自删除它。
- 2.0.22 工具源码补固定本地阶段：当前存储区查询、当前分区查询、Store/Partition 回执校验、记录身份校验、已有 Cookie 查询、预览生成。扩展精确安全码白名单，未知/伪造码继续 E_COOKIE_IMPORT；不透传 Host message、Cookie 名称/值、输入、URL 或 receipt。空 Store、缺 Partition 与错误分页回执获得具体安全码。保留原输入、格式、同框修正重试和未决/撤权/身份保护；不增加自动重试、权限、SDK/Host 或依赖。
- 新增 18 项依赖故障注入回归：Store/Partition 异常与坏回执、网站失权、scope/limit/Chrome/document/安装变更、未知码、坏读响应/分页与重复 cursor；逐项核对安全阶段/码、敏感正文屏蔽、原文/格式保留、确认隐藏、按钮解锁、零写入与显式同框修改后成功预览。

## 定向验证与交付包

- 新回归在修前失败（保留 `preflight-before.tap`），修后 **18/18 PASS**（`preflight-after.tap`）。工具 UI、既有样式/包对应、安装/Host 受影响组合 **199/199 PASS**（`tool-package-focused.tap`）。未重跑不变的 SDK 248 或原生 driver 31 全套；不重复导入真实样本。
- `npm run check` **PASS**：804 个源码/测试/构建 JS 语法、构建合同、固定 SDK 入口、CSP 与 MIT 检查。定向 diff 检查 PASS；本项目无单独 TypeScript/lint 脚本，不伪造结果。
- 官方目录测试 **17/18 PASS，1 FAIL**：第一项循环遇到 **reading-toc** 正式包与其当前源码不一致，原日志 `official-catalog.tap` 保留；不改其他工具以刷绿。随后使用原 `createOfficialToolResources` 只读构建并针对 Cookie 校验 **PASS**：正式包=当前源码规范字节=官方生产器资源=现有 watcher 的 dist 副本，Catalog 的 version/bytes/SHA 一致；ID/capabilities/SDK requires 未变。见 `cookie-release-check.json`。
- 唯一正式 JSON **2.0.22 / 133806 bytes / SHA256 `206fa098dd549f4de379fdca89689c2c4bc0e8bf864b8b8dc6d298cf361bd352`**；候选→199项门禁→原打包器 `--promote-from`→`--check-project` 已完成。旧 2.0.21 保留于 Git 历史，不制造第二正式包。
- 临时证据仅 `artifacts/cookie-import-system-chrome-20261017/`，输入/证据哈希为 `verification-inputs.json`；不提交 raw profile、真实样本或敏感 trace。此工作流登记事实与对应未测边界。

## 系统 Chrome 与仍待执行

- `lsof` 确认系统 Chrome 网络进程 PID77845（PPID77828）与现有 dev PID34253 的 43119 TCP 连接 ESTABLISHED；这证明系统浏览器连到该服务，不能代替当前 iframe 内“开发服务已连接”状态及 active revision 证据。更新后磁盘 revision 为 `5a28d26f31cb70928b262c4361a0c2280be7e5593df7f9bb5700b316a65b6273`，仅作读取时追溯，其他源码更新可继续推进。
- 用户已再次明确授权 Agent 直接控制浏览器并完成测试；不再把授权作为阻塞。浏览器自动审批禁止内部扩展页且禁止绕过，实际升级仍受工具策略阻塞。没有直接改安装记录、卸载或清数据。实际当前 iframe 字节、2.0.22 系统 Chrome 安装成功、真实样本预检/写入均 **NOT_TESTED**。
- 本轮不启动 CFT，不与其他任务争用 profile/native input；61 条旧单项 PASS / 后续清理失败、旧样本限定 PASS 均按原身份保留，不升级成本候选完整原生 PASS。
- Git 收尾仅上述 7 个路径；提交前核对完整索引和相关文件漂移，正常推送 main，禁止强推。远端 main 已推进，保留本地已有独有提交，先核对相关路径无重叠再正常合并已有提交；不把其他 Agent 未提交文件纳入本任务提交。最终提交/推送身份写入忽略目录下的 `closeout.json`，避免改写本记录自指提交。
