# R17 本地目录直连 · 执行与证据记录

2026-10-10。工作范围：Browser `main` + OpenDesk `master`，保持原 Native Host、文件工作区和 RunHost 链。不要以原 R2.2 或静态 Mock 结果替代本轮 R17 已加载包证据。

## 已落地代码

- Node 独立入口：`native-agent/local-dev/dev-cli.mjs`、`packages/opendesk-dev/{package.json,bin/opendesk-dev.mjs}`、`scripts/pack-opendesk-dev.mjs`；真实 npm bin 和 tarball 不修改私有 Browser 根包。
- Go 薄入口：`internal/browsercli/{command.go,dev_unix.go,dev_unsupported.go}`；未知命令与帮助无副作用，受信全局 npm CLI 入口以本机安装收据固定。
- Native 复用：`internal/browserbridge/{dev_workspace_unix.go,host_dev_multi_unix.go,host_unix.go,files_service_unix.go}`；临时只读目录、来源租约、聚合 epoch、旧 MCP/Go 单文件共存。
- Browser 复用：`src/native-agent/{file-workspace-service.js,service-worker.js,workspace.js,source-label.js}`、`src/ui/local-project.js`；历史展示名称、目录选择、正式/demo 隔离、离线草稿与刷新。
- 不触碰 R16 受限工作流规划器，不新增 Shell 执行器、项目 HTTP 服务、目录型项目数据库或自动 `npm run`。

## 观察结果（按候选 SHA 保存，不随 HEAD 自动提升）

| 级别 | 已知候选与证据 | 状态 |
| --- | --- | --- |
| R17 npm 发行包/Node Resolver/扩展构建 | [Browser Actions #38052480998](https://github.com/shopable-ai/opendesk-browser/actions/runs/38052480998) 在 Ubuntu/macOS 从真实 tarball 安装；[后续更新 #38052989152](https://github.com/shopable-ai/opendesk-browser/actions/runs/38052989152) 包含 Node 版本回归 | `PASS`，仅对应列出的 SHA 和 CI 运行环境 |
| Go Native 原有定向 | [OpenDesk Actions #38049564241](https://github.com/shopable-ai/opendesk/actions/runs/38049564241) | `PASS`，不是新 CLI 全链路 |
| R17 Go 真实 Socket 多来源/退出/伪造 ACK | [OpenDesk Actions #38053134286](https://github.com/shopable-ai/opendesk/actions/runs/38053134286)；该 CI 的 `host_dev_multi_unix_test.go` 用真实 Socket + 模拟 Chrome | `PASS`，不等于用户 Chrome UI |
| 最终两个远端主分支 + 本机安装包身份完全一致 | 需检查最新 HEAD、两侧 CI、包 hash 和本机 Go/Chrome 加载身份 | `NOT_TESTED` |
| 实际 macOS Chrome 打开目录 A/B、真实 Sidebar/磁盘写入/浏览器运行链 | 当前没有本机 Chrome Profile/GUI 操作凭证，也没有两个目录的真实 UI 录屏或保存回执 | `NOT_TESTED` |

历史失败（必须保留，不假报 PASS）：初次浏览器 R17 用缩写身份测试错判了 `sourceLabel`，已改为完整 sourceId 并重新运行；Go 双来源测试起初按固定消息顺序等待独立协程的 `files.state`、`dev.state` 而超时，已改为无序地同时核验。另有旧 Sidebar 固定断线文案断言，已保留原「本地项目服务未连接」短语而增加状态解释。是否全部进入当前最终候选的完整 PASS 需核对最新 CI。

## 本机验收判定

机器需同时确认：OpenDesk 主程序及内置 Native Host 的实际二进制版本、真实扩展 ID/当前 Chrome Profile/实际加载 WXT dist、npm 全局 bin 与包源码、`doctor`、Node 版本。新旧候选不能混装后把结果归因到错误 SHA。

用两个带空格和中文且 basename 相同的独立目录执行 CLI。目录 A/B 同时保持运行；重启/重复启动不抢占；从 A 退出 B 保持文件来源；无 package 仅文件工作区；Go 长期授权不被删除；撤销写权限与外部编辑冲突仍拒绝；已声明程序修改后**明确** Run 取得新 sourceHash/结果，原结果保留。所有本地失败、包/Host 不兼容、关闭 Chrome、来源退出和迟到回包均需附真实证据。

完整本地 Codex 执行任务见 [R17 macOS 联合验收提示词](../prompts/goal-r17-local-macos-acceptance.zh-CN.md)。环境不允许 Mac GUI 时，本轮代码与 CI 仍可交付，但真实 Chrome/macOS 项永远保留 `NOT_TESTED`，不能为拿 95 分更改测试预期或绕过权限。
