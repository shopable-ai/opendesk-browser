# 开发扩展加载目录与 Native 配对修复

日期：2026-10-12（Asia/Shanghai）。状态：COMPLETE（仅本机加载目录与 Native 配对修复）。负责人：本对话 `01a12e65`。

用户要求解释并修复 Chrome 的加载来源 `~/.opendesk-browser/extensions/local-dev-01a12b39`。

已确认：该目录是 2026-10-11 `browser-dev-go-migration-01a12b39.md` 记录的日常安装副本，来自当次隔离验收包；它不是 `npm run dev` 的输出目录。当前 Chrome 原生 Sidebar 显示实际扩展 ID `ccfcjegpkdlgbclopjmadlcjedelidmf`，对应本仓 `dist/development`，旧副本 ID `mknncoaonlkeljgcbdncdkenloofpfle` 已停用。Go doctor 及 Native manifest 仍配对旧 ID，connected=false；Sidebar 显示 E_DEV_DISCONNECTED。

初始修复范围：备份本机现有 Go 安装配置与 Native manifest，通过既有 Go 命令修正扩展配对，再在真实 Chrome 设置页核对连接与 doctor；补充固定目录说明。不直接改 Chrome Preferences，不改其他工作流的产品文件、CLI 包或测试。用户随后明确要求删除历史副本、使用正常目录；按此更新范围，备份后移除旧目录并由真实 Chrome UI 卸载旧扩展，保留历史验收材料。

资源：只操作用户要求修复的日常 Chrome/默认 Go Native 安装。不操作当前其他工作流的 CFT、profile、43111、生产 dist、ZIP 或正式验收。共享开发服务 43119/43120 当前未监听；本轮暂不重建。备份存放本次私有目录，含凭据的文件不打印、不提交。

复用：已读 testing-guide.md、browser-dev-go-migration-01a12b39.md、browser-dev-install-diagnostics-01a12b8e.md、dev-cheerio-dependencies-20261012.md；后者已验证当前本机开发包，源码未改，不重复构建/组件/业务/F3/ZIP 测试。

通过条件：当前固定开发目录和真实启用扩展一致；默认 Native manifest/Go 安装配对此 ID；真实 Chrome 连接后 doctor 显示已连接。只有连接与安装修复，不宣称业务执行或正式验收 PASS。

## 来源与原因

本机会话索引确认历史聊天名为「排查 Native Host 迁移错误」，完整 ID `01a12b39-6ec3-7221-bf8e-edf633c676ca`。其工作流记录和原始 `daily-package-binding.json` 说明，当次 Go 迁移/React 验证后将隔离构建复制到日常 Chrome，产生新扩展 ID。该静态副本脱离本仓持续开发输出；随后正常目录扩展被启用，但 Go 仍指向旧 ID，造成两个安装身份和连接失配。不是 `npm run dev` 自动生成这个目录。

## 修复与验证

- 私有备份：`/Users/shopme/.opendesk-browser/extension-source-repair-20261012-PKCNhN`。完整旧 Native 安装、manifest、66 文件扩展包和旧扩展的两个实际存储目录均保留；凭据与扩展数据不打印、不提交。
- 既有 `update --extension-id` 返回 `E_EXTENSION_ID_CONFLICT`，没有放宽保护或改写配置。核对无活动 Socket、官方 `workspace list`/`project list` 均为空后，使用原安装 executable 的 `browser cleanup` 与 `browser setup --extension-id ccfcjegpkdlgbclopjmadlcjedelidmf --browser chrome`，两步返回 0。没有旧授权被静默重授予。
- 真实 Chrome 设置页显示正确 ID、本机 Agent 已启用且 Native Host 已连接；设置页打开后既有启用状态完成连接，本轮未运行任何用户项目。
- 旧目录移出原加载位置，备份逐文件 SHA 与 packageHash 保持 `439a983b23672643ac45471dcbc09032dc682b6463b2d65f2879e396766c75bc`，与原工作流一致。通过旧 ID 的真实 Chrome 详情页执行卸载，最终 Preferences 只读核对旧 ID 不存在；正常 ID 仍启用且加载本仓 `dist/development`。未改写 Preferences。
- 卸载后真实 Go doctor：`connected:true`、`nativeConnected:true`、`enabled:true`；local 与响应的 extensionId 均为正常 ID，manifest 只允许该 ID。原始当前输出与安装/路径核对保存在本工作流 `evidence/extension-loading-source-20261012/validation.json`。
- `AGENTS.md` 与开发指南新增固定开发目录、专属验收 Profile、实际 ID/manifest/doctor 一致性以及正式 owner 迁移规则。只改约束与文档，无产品实现变更；不重复已验证构建/业务测试。限定 diff/链接检查记录于验证文件。

本轮未启动/停止开发服务、其他 CFT 或其他工作流资源；未提交、推送或发布。最终结论只包括旧副本移除、正常目录启用和真实 Native 连接，不升级为业务、F3 或 ZIP 验收。
