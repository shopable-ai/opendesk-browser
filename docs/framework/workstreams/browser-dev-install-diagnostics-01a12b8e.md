# 本地开发安装身份、只读诊断与更新回退

负责人：`01a12b8e`；2026-10-11；直接在 main 本地工作，未经授权不提交、推送或发布。

状态：IN_PROGRESS。

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
