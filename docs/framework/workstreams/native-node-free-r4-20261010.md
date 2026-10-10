# OpenDesk Browser × OpenDesk R4：运行时去 Node、原生文件 Provider 与双实现兼容验收

日期：2026-10-10。工作流：Native Host convergence / Node-free ordinary runtime。**本页是本轮实际仓库源码与 GitHub CI 的交接台账，不是正式 Chrome 或用户 Mac F3 验收。**

## 一、产品架构决定

- Chrome MV3 / Side Panel 保留唯一的 Browser execution owner：网站权限、文档身份、RunHost、Controller、Page、Script revision、resultId、recovery、Stop 和 retirement 均不迁到桌面，也不新建第二个 Go DOM 执行器。
- OpenDesk 原生 Go 可执行程序 `opendesk browser native-host` 接管生产目标的 Native Messaging stdio、Host、Unix Socket 和 Go CLI。普通用户浏览器脚本本身不依赖 Node；普通受授权 **单文件本地项目**现也有 Go 原生 Provider。
- 旧 Node Native Host / 安装器仅保留迁移、回退和测试身份；已对 Go 的 `provider:opendesk` 进行双向安装 owner 保护，Node CLI、doctor 和原本 Node local-dev Provider 的 v1 连接可与 Go Host 互通。
- `native-agent/local-dev/mcp.mjs` + Resolver 仍是多文件 ESM、npm/HTTPS、Webpack/source map、高级 Codex 工具的唯一成熟消费者链；保留到 Go 同合同实现通过。WXT/Vite/npm 和 Browser JS 是开发/平台依赖，**不能作为“移除 Native Node”的同义删除项**。

## 二、本轮实际文件与提交

| 仓库 | 提交/文件 | 本轮变化 |
| --- | --- | --- |
| Go `master` | `0e97c69aaac09370e69f2eb25b258b7a838f28f0` | 新增 `internal/browserbridge/project_store_unix.go`、CLI 项目授权/查询/撤权、Go Host 内建项目 Provider、Windows 不支持的显式 stub、文件源/源归属测试 |
| Go `master` | `8e3acb370344356e90aa35e2d367af762944d0fe` | 增加认证后的 `project.changed`、source epoch 轮换、在线撤权、不启动 Browser 任务及 Mac 实际二进制差异测试 |
| Go `master` | `49943cc1d6bf8dc152a9ac36f54951aea6bbcf2e` | 同步 Native Host/零 ID 配对文档：Go 单文件边界、剩余 Node 高级消费者、正式发行身份与 GUI 缺口 |
| Browser `main` | `76451cfa79401520933c450c04b39151e78aa269` | Node installer/host 双向 Go owner 保护，仍容许旧 read-only/高级 Dev IPC |
| Browser `main` | `8c43a2ecb5f63cbc36707de545e03a75dd7432a5` | 跨进程 macOS 实际 Go 二进制 + Node CLI/doctor/Provider + Go 单文件 revoke/regrant 测试驱动 |
| Browser `main` | `c687ef1c8843a62a0203ad6a8dbde2843b91dace`、`d011d8c0cb01415fab1d92333f853e67a4a9989e`、`267c9227d176f20e62c9f63b1119a883db9d1b4e` | Sidebar 文案、正式本地项目文档、R2/R3 安全状态、旧 UI 测试断言收敛 |

Browser 可能有其他并行任务继续推进 `main`，不能把此表中的提交当作每个时刻最新 HEAD。没有创建分支或 Worktree，也没有更改、覆盖或删除用户安装中的旧 Node Host。

## 三、真实已取得的证据

- Go [Actions #38034848488](https://github.com/shopable-ai/opendesk/actions/runs/38034848488) 与 [#38034969061](https://github.com/shopable-ai/opendesk/actions/runs/38034969061)：Ubuntu/macOS 原生组件以及 macOS 发行程序 + 模拟 Chrome Frame / 私有 Unix Socket 回归通过。
- Go [Actions #38035362786](https://github.com/shopable-ai/opendesk/actions/runs/38035362786)：Go file grant、`projects.list/project.resolve`、revocation/regrant、Provider epoch、原 Node CLI/doctor/Provider 与 Go Host 互通的受控真实二进制模拟 Chrome 测试全部通过。
- Browser [Actions #38034945838](https://github.com/shopable-ai/opendesk-browser/actions/runs/38034945838)：已有 Node Native Bridge/component/package 和 macOS-15/macOS-15-intel 原生隔离测试通过。
- Browser 更晚 [Actions #38035717026](https://github.com/shopable-ai/opendesk-browser/actions/runs/38035717026)：与 Native 相关的 `script-editor` 新文案用例已通过，但共享全量 bridge-components job 因**另一并行 AI Workflow 默认布局断言**失败；不可将其写成此 SHA 的整体 Native CI PASS，也不要为本 Native 工作流删掉别处的断言。
- 所有“Chrome”模拟均为测试程序向真实 Host 喂帧，不是用户真实 `chrome.runtime.connectNative` 与 Chrome 网站授权。**GO_NATIVE_REAL_CHROME=NOT_VERIFIED，MIGRATION_VERIFIED=NOT_TESTED，正式 USER_ZERO_CONFIG=NOT_IMPLEMENTED。**

## 四、安全边界与剩余硬缺口

1. 文件授权仅允许一个所有者拥有的 `.js/.mjs` 真文件、指定 HTTP(S) origin、Controller/Page 类型；最多 8 文件、48 KiB 上限。Go registry 0600、绑定 Host 凭据与 extensionId；文件 inode 更换需重授权；双重快照、sourceHash/bytes 校验；不会扫描目录、执行 npm 或自动发起 Run。
2. Go Provider 可被 Node 高级 Provider 暂时替代；其断开后 Go 原有 grant 恢复；授权/撤销经认证的私有 Socket 更新 Provider epoch，旧 epoch 的源码投递必须丢弃。Browser 对源、网站、文件授权及运行操作仍有独立校验。
3. **尚未完成**官方固定 Web Store 扩展 ID / 签名比对、OpenDesk 正式安装器首次预注册、开发版 GUI 一次性安全配对；未发布环境 `setup` 不应凭空猜 ID。
4. **尚未完成**普通用户 OpenDesk 原生“选择 JS 文件并授权”的 GUI、多文件 ESM/npm/HTTPS Go Resolver、跨 profile 的 Go 多 Native 实例仲裁及 Windows Native Host。
5. **尚未完成**旧 Node 安装逐字节备份、待处理 `OUTCOME_UNKNOWN` ledger 清点、进程停止与可恢复切换；不能仅因 socket 不存在就调用 cleanup 覆盖或删掉旧 Host。
6. **尚未完成**当前 Go/Browser 同一发行输入上的受控真实 Mac Chrome：真实 Native 权限手势、站点授权、Go provider 单文件 Run、真实 runId/resultId/sourceHash/released、Stop、浏览器重启、撤权与迁移回滚。

## 五、退役门槛与 95+ 标准

不得直接删除 `native-agent/local-dev` 或全部 Node build scripts。先以消费者为单位完成：发布身份 → 新安装与显式迁移 → 真实 Chrome → Go 项目文件 UI → 多文件/npm 等价验证 → 搜索调用方/测试/文档 → 最后逐项退役默认 Node Host。若某 Node 组件有仍在使用的真实调用方，退役必须被禁止。

沿用 R2 的 20/15/20/15/15/10/5 评分权重。本轮改进了 Go 原生单文件及生命周期，但**不能因 Go/macOS 模拟测试成功就宣称专家 95+**：生产首次免 ID、真实 Chrome 和旧安装迁移任一关键门槛没有 PASS，都应标为 `NOT_ACCEPTED`。设计评估和实际交付验收分别记录；若需要本地验收，接续现有 [Mac 实施 GOAL](../prompts/goal-native-zero-config-r2-mac-codex-20261010.zh-CN.md)，但**跳过已完成的 Go 单文件核心实现**，聚焦真实 Chrome/GUI/发行 ID/回滚与并发资源。
