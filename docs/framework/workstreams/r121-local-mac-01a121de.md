# R12.1 本机目录开发验收

用户选择日常 Google Chrome。已接通实际扩展 `ccfcjegpkdlgbclopjmadlcjedelidmf`，加载路径仍为现有 `dist/development`；没有覆盖共享工作区、扩展数据或草稿。旧失效 CFT Native 安装先备份到私有 `~/.opendesk-browser/backups/r121-pre-daily-chrome`，再按正式 CLI cleanup/setup 切换到 Chrome。Chrome 正式界面批准 Native Messaging 和 USER_SCRIPT，首次授权后的扩展重载完成。凭据不进入证据或 Git。

标准页面 `http://127.0.0.1:43111/demo-form.html` 使用正式静态服务，原占用已退出后由本任务启动，PID18166。日常 Chrome 实际 `doctor`/MCP handshake connected；Controller 返回标题与 version1，Page 原生按钮点击后计数1；Sidebar 可连接唯一 provider、运行本地项目，107字符草稿往返切换完全一致，关闭重开仍保留项目选择并能再次运行。细节见独立证据目录 `docs/framework/evidence/r121-local-mac-01a121de/`。这部分没有在并行 main writer 活跃时改写示例文件。

默认 Codex MCP 的两个正式示例授权保持原样，入口仍是现有 local-ai-loop-r1 工作区的 `native-agent/local-dev/mcp.mjs`，其源码与 main 对应实现一致，该工作区不能归档。其他既有 MCP 客户端拥有唯一 Sidebar provider，本对话的 provider 状态如实返回 `E_DEV_PROVIDER_CONFLICT`；直接 MCP run/result 成功，Sidebar 使用已注册 provider，不启动第二个默认服务，不终止其他对话进程。

## 已取得的真实证据

- 主干9ebd9536、生产包 `feaf5ca1bbc01c07057fd9c7495322fbcf50ff031f4637536c00fbcdb9293456`：复用 native-12 原始25项 Mac Codex/Page/Sidebar证据；本轮新增 restart-09，同一 profile 完整 Chrome 退出重启、原 MCP/provider 重连、文档/Host 更新、源码1→2→3、结果自身 sourceHash 和不可变旧结果均有原始回执。原始/new Host 读取旧结果被拒绝，不把该查询推断为“防重放测试通过”。
- WXT 随后合入 main c44ccaa9，Native、RunHost、Sidebar等产品输入改变；旧25项没有提升为新包正式 PASS。
- 新生产包 `93117206bfd14bfbf4344ad0e34e303114f1f81f03818860efc914f95ede1586` 已构建，94项受影响组件测试、225文件源码检查通过。实际 Codex0.144.5 已完成101→102→`R1_RUNTIME_DIAGNOSTIC`定位→修复103，四轮持久结果和原始工具事件已保存；没有构建项目、生成JSON交接或上传草稿。
- 最新完整 campaign 暂停在真实 Sidebar 项目菜单。CUA报告 Mac 锁屏且不能自动解锁；仅暂停本任务 runner41452，保留独立 profile 与 Native/MCP，不绕过锁屏。用户解锁后继续定向验证；这不是完整 campaign PASS。

## 本轮改动

仅修改现有两份验收驱动。launcher 可显式选择既有 k5 restart adapter，保持原始 launcher/profile/进程身份，EOF结束 adapter 生命周期，并核验所有 Chrome generation 清理回执，错误强制 FAIL_CLEANUP。Native验收新增 restart slice；原始 stdio MCP与provider必须存活，明确新Host、新文档、主动读取最新源码，旧结果查询只接受精确 `E_HOST_NOT_READY`。external-select路径保留真实菜单输入与实际值检查，跳过会错绑同名Chrome的AppleScript。NetLog只覆盖重启第二代，第一代明确 NOT_TESTED；adapter源码指纹进入 verificationInputs。

不新增运行内核、数据库、依赖、源码服务或产品UI，不放宽权限、CSP、消息大小、安全身份或未知结果规则。

## 当前限制与续接

需用户在本机解锁。暂停 runner 的PID/工作目录校验和恢复条件在 `latest-full-02/lock-pause.json`。恢复后原生菜单选择 project/page-project，不赋值DOM或伪造事件；超时则保留失败，只补尚受影响的场景。完成当前包完整验收和重启后才合入PR。

仍未关闭：新Host访问原Host旧结果、重启第一代网络观察、完整物理Native60KiB与EOF/入场撤权/导航矩阵、Page正式安装/自动运行/停用/重启、最终框架F3与ZIP。它们不由组件、旧候选或本轮有限原生结果提升为PASS。R10.1 npm/HTTPS能力不在本轮开发。

失败原始材料保持本地，包括旧AppleScript错绑/观察错误、清理失败、receipt不匹配，以及本轮PATH误选旧Python导致缺少tomllib；后者已使用现有Python3.14.6修正。全桌面失败截图不发布，独立文件索引记录其SHA。没有release/publish。
