# Cookie Editor 系统 Chrome 手动导入续查 · 2026-10-17

- Owner：本次 Codex；main 原位；已获仅提交本任务文件与正常推送 main 授权。不建分支/worktree/PR，保留其他 Agent 差异。
- 状态：LOCAL_SINGLE_WRITE_FIX_VERIFIED_INSTALL_PENDING。范围：用户当前系统 Chrome 安装版手动 JSON 导入；不做 production、全量原生、缩放、UI 重构。
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

## 用户安装后的新证据 · 16:42 后

- 用户明确报告已直接导入本目录正式 JSON，随后看到“当前 OpenDesk Browser 尚不支持批量 Cookie 写入，请更新扩展后重新预览；原文已保留。”。这是最新真实运行证据，优先于之前只读磁盘 WAL 的旧安装记录；不能继续把当前问题归为旧版整批过期拒绝。
- 对应 `confirmLiveImport` 的精确分支是 `typeof browserSdk()?.cookies?.setMany !== 'function'`，位于 `ask` 与 `setMany` 请求之前，说明当前沙箱公开 facade 缺方法；该分支没有发出 Cookie 写请求，也不是 Store/Partition/网站授权错误。新提示存在于 2.0.20 之后，单凭提示仍不能锁定活动 iframe 的精确版本。
- 当前源码 `createBrowserSdk` 实例的 `cookies.setMany` 为 function；现有 watcher 的 `dist/development/sidebar-tools/bridge.js` 含 canonical `browser.cookies.setMany`，SHA256 `c16dbb62a4c1fc432f057ed6062a33ee62dd351ba0d8c31062d4814cf00972d6`。记录为 `sdk-runtime-difference.json`，没有向真实浏览器发请求。可证明当前运行 facade 与磁盘开发产物存在差异；旧 bridge/未刷新扩展是待原生刷新核实的解释，不假称已读到活动 iframe 字节。
- `opendesk browser doctor` 正常返回 connected=true，local.extensionId 与 response.result.extensionId 均为 `ccfcjegpkdlgbclopjmadlcjedelidmf`；现有 Native manifest allowed_origins 也精确包含该 ID。未改配对、权限或 Native 配置。`--json` 参数不受支持产生 E_SCHEMA，改用该 CLI 默认 JSON 输出后只读核对成功，不将首次命令错误记为功能失败。
- `src/development/page.js` / `worker.js` 与 `src/ui/tool-shell.js` 现有安全刷新会等待 tool dirty、RunHost/native/草稿释放；dev TCP 已连接不保证该栅栏已通过。未制造源码改动触发重载，未直接调用 runtime.reload 或绕过工具策略。SDK_GAP_NOT_PROVEN；不修改通用 SDK/Host。
- 已请求用户经 Chrome 原有入口刷新同 ID 扩展，再打开 Cookie Editor 只生成预览并报告计数/安全码；明确先不要确认写入，且不发送敏感内容或截图。该人工步骤源于自动安全审批阻塞，不是再次请求权限。真实刷新、活动 facade 与本次预检结果仍待反馈；本轮不重复真实样本写入。

## 当前阻塞的工具内修复 · 用户要求直接判断并解决

- 用户最新要求直接修复眼前问题，不再让用户判断 iframe/SDK 更新细节。继续作为同一任务执行；SDK/Host/bridge 仍只读，不绕过浏览器工具策略。
- 写入负责人仍为本 Codex，修改文件仍限工具 `src/main.js`、版本配置、README、唯一正式 JSON、UI 测试及版本断言和本记录。写前这些源码/测试文件没有并行差异；其他 Agent 的 broker、Page runtime、Adblock 与构建改动保留。复用现有 watcher、固定 dist，无第二 writer；不占用其他 CFT/Profile。
- 公开文档 `docs/api/browser-sdk.developer.generated.md` 的 `cookies.set` 与 Schema 已提供 `{saved:boolean,verified:boolean}`，现有工具新建/编辑也使用该公开接口。SDK_GAP_NOT_PROVEN：可在工具目录内解决缺批量 facade 的导入，不增加 API、权限或 raw request。
- 拟实现：有 `setMany` 时保留原分批路径；只有单条 `set` 时顺序调既有 SDK，每条必须经可信 Host 真实确认，并同时核对 saved/verified；缺两种写入方法才阻塞。提前显示逐条确认成本。任一拒绝、坏回执、未知结果、目标/授权变化立即停，不重放、不在批量失败后改走单条。不删除/重写 Store/Partition，不修改过期时间，失败保留原文。
- 通过条件：虚构多条输入在缺 setMany 的旧 facade 下、显式最终确认前零写入，之后逐条成功计数；精确范围/属性保留；异常和迟到回执停止、零重试；原批量仍优先且失败不降级；受影响测试和包晋升/同源通过。真实系统 Chrome 2.0.23 与写入仍需相应原生证据，不能由 Node 测试提升。

### 本次实现与定向结果

- 已实现上述工具内路径选择；只在发请求前按 facade 是否存在选一次，有批量方法时不变。单条路径直接调用公开 `cookies.set`，只接受真实接口回执的 `saved===true && verified===true`，没有合成 Host/native ack 或 raw request。每条仍经原 Host 单条确认和精确回读；业务层统一保留原文及未知结果停止规则。
- 新增 12 项定向用例最终全部 PASS；27 条有效虚构记录与 3 条过期记录的预览/写入计数、原顺序、Domain/Path/Store/Partition/属性/小数有效期均验证。最终确认前零调用；七种失败/坏回执停在第 2 条、保留输入且不能直接重放；授权/页面变化时忽略迟到成功；批量方法存在时优先且未知失败不改走单条；两种写方法均缺失才阻塞。
- 保留红测和夹具修复：最初有单条方法却被旧硬拒绝的用例复现失败；早期四个 Header 夹具漏设格式，后显式设 auto；完整首轮 248/249，唯一失败是 VM 参数直接送入另一 realm 的 strict plain-object normalizer。夹具改为模拟真实 structured-clone transport，未放宽生产 Schema。日志 `single-write-before*.tap`、`single-write-tool-package.tap` 与最终 `single-write-tool-package-final.tap` 均保留。
- 最终工具 UI/包对应/Sidebar Host/安装及单条 Cookie SDK、确认等待合同 **249/249 PASS**，无跳过/取消。源码检查 **PASS（808 files）**。未运行全量套件/production/CFT，不重复真实样本写入；沿用 2.0.22 的全目录 17/18 历史结果，不把它改写成本轮 PASS。
- 原打包器候选 `artifacts/sidebar-tools/cookie-editor/2.0.23/candidate.opendesk-tool.json` 经测试后 `--promote-from` / `--check-project` PASS。唯一正式包 **2.0.23，134473 bytes，SHA256 `3f566d12e56b3f2391b9e4cec918dec002a2cd7c7cf97c84c6fa7ba1ac8835b9`**；candidate/正式包/现有 watcher 的 development 副本相同，dist 官方目录版本/bytes/SHA 一致，ID/capabilities/requires 未改。无第二 writer。
- 本轮未再次读取真实样本，也没有真实 Cookie 写请求或 Cookie 截图/敏感 trace。活动 iframe 精确版本、系统 Chrome 2.0.23 升级及最终导入仍 **NOT_TESTED**；自动安全审批禁止内部扩展页及绕过，不能用工具内测试冒充原生完成。用户无需再判断技术方案，当前提供可经原有机制更新的同 ID 修复包。
- Git 集成资源：远端新增 prompt-shortcuts 的 provenance pin，本工作区另有 Adblock Owner 未提交的 `scripts/bundle-provenance.mjs` pin，两个位置不同但同文件，非本任务写入范围。不暂存/修改/stash 该并行文件；本任务先仅在 main 提交上述 7 个自有路径。再用已提交 main 两端的 `merge-tree` 核对无冲突，生成用于远端 main 的正常双亲合并提交，并做无强推的 fast-forward push；不切分支、不建 worktree、不改变该工作区文件/索引。本地 main 暂保留自有提交，待该文件 Owner 收尾后再正常快进；交付/两端引用和验证输入写入 `single-write-closeout.json`。
