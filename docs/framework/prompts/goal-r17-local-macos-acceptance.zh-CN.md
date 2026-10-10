# GOAL：R17.1 在用户 Mac 完成默认临时读写、双 CLI、双目录和 WebCodex 联合验收

本提示词是 R17 安装、目录权限和生命周期的入口。**本轮整体完成还必须执行 [WebCodex 同一对话完整验收任务](goal-webcodex-chat-edit-r2-local-acceptance.zh-CN.md)**，其中包含随机标记 P0、同一既有官方 ChatGPT 对话的两轮读取/修改/保存与独立磁盘证明。目录列表、组件 PASS、复制上下文或内存 Demo 不能替代这些项目。

本次固定源码提交、生产包 hash 与原始日志见 [交付索引](../workstreams/evidence/webcodex-request-loop-20261010/delivery.json)。先核对本机 checkout 包含索引中的 Browser 与 Go 源码提交；后续 main 有并行修改时保留它们，只补受影响验证，不回退到旧提交覆盖其他任务。

## 1. 环境与工作区

- Browser：<https://github.com/shopable-ai/opendesk-browser>，仅 `main`。
- OpenDesk Go：<https://github.com/shopable-ai/opendesk>，核对实际主分支，当前 `master`。
- 不创建分支/worktree，不强推、不破坏性 reset/clean，不接管其他会话的未提交文件、进程、Socket、Chrome Profile 或构建产物。先读两仓库 `AGENTS.md`，核对真实路径、分支、HEAD、远端与逐文件差异，安全同步。
- 核对 `uname`/`sw_vers`。Linux 网页执行器不是用户 Mac。没有 Mac 时完成能够交付的源码工作，所有真机项目继续 `NOT_TESTED`。
- 读取 Browser 的 R17 使用指南/工作记录、R2 架构/工作记录、testing-guide 以及 Go 的 R17 与 WebCodex 文件说明。复用现有 CLI、Provider、Resolver、Session、Workspace、Sidebar 和 Go 文件服务。

## 2. 先确认安装与加载身份，再决定是否更新

执行完整任务中的安装预检：真实 `opendesk` executable 与 App 主二进制、Native manifest、npm 全局 bin/包入口、Go 登记路径及 SHA-256、Chrome Profile、扩展 ID、实际加载目录、manifest/version、生产包 hash。只输出必要非秘密字段；不要复制安装凭据、Socket token 或整个 install.json 到日志、网页或模型。

健康安装直接复用。只更新受影响组件：

1. Node：实际打包 `@shopable/opendesk-dev@0.1.0-r17.1`，选中**唯一确切 tarball** 安装，再执行 `opendesk-dev --register-go`。禁止旧新多个 `*.tgz` 通配安装，禁止 `npm publish`。
2. Go：按仓库现有 Mac Native/App 安装文档构建到本任务独立 `DIST_DIR`，保留现有签名与配对身份，更新实际 App/CLI，再从该 App 的二进制执行 `browser update`。安装工具遇到其他会话的 Socket owner 时先核对归属，不能删除 Socket、任意杀进程或跳过绑定安全检查。
3. Browser：核对 dist owner 后构建/验证，重新加载**目标 Profile 的准确扩展**，重新打开 Workspace 并核对 Native 连接。仓库 HEAD 不能证明 Chrome 已加载该代码。
4. 真正协商 `localDevMultiVersion:1`、`localFilesVersion:1`、`localDevAccessVersion:1`；文件状态须 `devLeaseEpoch:1`。旧 Node 登记应报 `E_DEV_COMPONENT_UPDATE_REQUIRED`；旧 Native/扩展不兼容应报 `E_NATIVE_UPDATE_REQUIRED`，不能静默沿用旧只读并声称新默认读写成功。

## 3. 新默认与只读矩阵

所有日常入口必须一致：

```sh
cd "/绝对路径/专用目录 A"
opendesk browser
# 另一次独立测试：
opendesk browser dev
opendesk browser dev "/绝对路径/专用目录 A"
opendesk-dev
opendesk-dev "/绝对路径/专用目录 A"
# 明确只读，选项在目录之前：
opendesk browser dev --read-only "/绝对路径/专用只读目录"
opendesk-dev --read-only "/绝对路径/专用只读目录"
```

每次停止自身 owner 后再独立核对下一入口；并行测试另按 A/B 步骤。新目录只执行上述命令即可临时读写，**默认读写验收不得先执行 workspace add**。根目录精确为参数目录或 cwd，不扩大到 Git 根、父目录或用户主目录。

| 场景 | 必须出现的真实行为 |
| --- | --- |
| 无长期授权的新目录 | 本 CLI 生命周期临时 RW，Native read/write/create 可执行；退出后临时授权释放 |
| 显式 `--read-only` 的新目录 | 真实 RO；从可信 Workspace 实际请求 write/create 获得 Go 拒绝，不能只看禁用按钮 |
| 已有长期 RO + 默认 CLI | 保留 RO，显示 `persistent-read-only`；不永久升级、不新增覆盖权限 |
| 已有长期 RW + 默认 CLI | 复用长期身份/权限；CLI 退出后长期授权仍在 |
| 长期 RW 或在线 RW + `--read-only` | `E_DEV_ACCESS_CONFLICT`，不能报告只读成功却仍能写 |
| 同目录已在线 | 复用原身份、有效权限和公开 epoch；重复命令不获得 owner lease、不抢 Provider、不改变模式 |
| 新客户端显式 access / 旧客户端省略 | 新客户端传 RW/RO；旧客户端新目录继续 RO，不能改成隐式 RW |

## 4. 同名目录、权限代次和退出

创建路径不同、basename 相同、当前用户拥有的 A/B，包含 Markdown/HTML 文本。分别在两个终端保持 owner CLI 在线，记录路径/inode、sourceId/workspaceId、公开 leaseEpoch、有效 access/reason；秘密不进入模型。

- Workspace 选 A，随后从受支持入口打开网页开发侧栏，必须仍定位 A 的已核验不透明 ID；读写 A 不影响 B。普通文本目录可以在 Workspace 出现，程序侧栏继续沿用原合法程序清单规则。
- 各目录真实读取正文和 SHA；采用草稿前后、保存前独立读取证明未写盘；显式保存后扩展再次 Native 读取并与终端正文/SHA 相符。B 保持原内容。
- 同目录重复启动不夺 owner；重复命令退出不令原来源下线。停止/异常结束 A 仅释放 A 的临时接入；B 继续真实读写，其他长期授权保留。仅清理本任务拥有的进程与目录。
- A 离线、列表暂空再出现 B 时保留 A 名称和未保存草稿，不自动改选 B；不使用缓存恢复权限。保存或读取遇到过期会话应真实拒绝。
- CLI 停止重开仍可复用 sourceId/workspaceId，但必须有新 epoch；旧读取、提案、写请求与已成功回执重放均不能写。无 CLI 时的新客户端发送空 epoch，不能跨过后来新接入保存。
- 明确永久权限变化要单向淘汰旧代次：RW→RO→RW，以及临时 RW→添加长期 RO→撤销长期授权；**两个变更都发生在两次 Native 请求之间**也不得恢复旧提案/旧写回执。A 失效不影响 B。需停止旧 owner、重启 CLI、重新绑定并读取后才能使用新代次。
- 临时权限不写入永久工作区列表；现有 store 的 `devLeaseFences` 只是有界的公开身份/失效元数据，不能据此重建目录授权。旧 Go 严格拒绝不认识的字段，禁止手工删该字段规避兼容诊断。
- 外部编辑后用旧 SHA 保存应冲突并保留磁盘内容；未知效果不得自动重放。普通乐观检查与原子发布不是对不协作外部编辑器的跨进程强事务。
- 保留原路径、符号链接、支持格式、文本 32 KiB 与 Native 60 KiB 限制；不为了 Demo 放宽约束。读文件、采用草稿和保存文件不自动运行项目或网页脚本。

## 5. 有限验证、P0 与最终报告

本机先用本次已有定向命令验证受影响代码，命令见完整任务与 Go R17 使用指南。真实 Socket 测试需在 Mac 重跑：本轮 Linux 执行器曾明确因 `socket: operation not permitted` 失败，该失败不等于通过也不应删门槛。无关全框架、Windows 与旧正式 F3 不在本轮重复执行。

安装就绪后，**优先执行完整任务的 P0**，再做剩余 UI 调整。模型初始只收到身份、相对路径和请求格式，不能预先看到随机标记或正文。读取来自 Native，结果自动回填同一既有对话输入框，用户在网页发送，模型随后报告正确标记。失败分别定位请求生成、回答识别、Native 读取、回填、发送或对话身份；手工粘贴只记诊断降级。

随后同一官方 ChatGPT 对话完成两轮独立请求和真实文件基准的修改，验证导航、刷新、标签页关闭、生成中回答、已有草稿、旧回答/旧提案、切换目录、撤权、断线和迟到结果。

每项分别记录 PASS / FAIL / NOT_TESTED。最终按完整任务要求的八项顺序报告可用能力、实际提交/推送、安装加载身份、P0、两轮路径/前后 SHA/Native 回执/独立读回、异常矩阵、自动化与用户步骤、未完成项。自动识别、Native 执行、回填、网页发送、手工导入分开记录，不能合称自动调用通过。
