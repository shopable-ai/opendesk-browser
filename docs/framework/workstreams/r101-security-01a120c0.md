# R10.1 P0 安全复核与修复

- 状态：LOCAL_FIXES_VERIFIED / released；2026-10-09；executor / r101-security-01a120c0。仅本地分支交付，正式集成/原生验收未关闭。
- 基线：4adf5dc4966f82a71c2c5116f8d5a35c21eafd06；分支：agent/r101-security-01a120c0。
- 独立目录：/Users/shopme/.codex/worktrees/r101-security-01a120c0/opendesk-browser。
- 写范围：scripts/remote-esm-network.mjs、scripts/remote-esm-modules.mjs、对应 remote-esm-security/import 测试与本专属记录。
- 已读取 AGENTS.md、testing-guide.md、parallel-development.md 和 r10-https-esm-security-20261009.md。
- 复用决定：R10 原候选组件/CI/CDN PASS 保留；本轮安全实现输入将改变，AFFECTED_INPUTS，仅做受影响 Node 安全/import 定向验证。原记录不覆盖，不提升为 Native/F3/ZIP。
- 验证计划：npm ci；公网地址分类、DNS 全 A/AAAA、固定连接/TLS、重定向/时限/字节限、文件系统替换与锁竞争的必要回归；源码语法与 diff 检查。
- 资源：仅本 worktree node_modules 和独立临时测试目录；不占 Chrome/CFT/profile/固定端口/native/dist/ZIP。不访问真实内网或 Metadata。
- 原始日志目录：/Users/shopme/.codex/worktrees/r101-security-01a120c0/evidence/（本会话独占）。
- 通过条件：实际漏洞修复，新增回归和既有 remote-esm 安全/import 测试通过；记录安全限制；Lore 本地提交，无 push/merge/release。

## 实际缺口与修复

- 项目根别名：直接 prepareRemoteModules() 调用时，macOS mkdtemp(os.tmpdir()) 的 /var/folders 与 /private/var/folders 身份相同，却被原 safeDir 的字面比较拒绝。入口 canonicalize 根；内部 .opendesk/remote-cache 仍禁止 symlink。独立基线复现 12/14 PASS、2 FAIL；用户提供 /tmp/od-r101-p0-tests.log 为同一缺口的只读证据（27/29 PASS，2 FAIL）。两份失败均保留。
- TLS 默认配置：原传输未显式设置 rejectUnauthorized，可能受 NODE_TLS_REJECT_UNAUTHORIZED=0 影响。现在显式启用认证、原 hostname/SNI 与 Node checkServerIdentity，验证 secureConnect/response/end 的 encrypted/authorized 与 pinned peer；证书身份用原 hostname，不能改为解析 IP。新增无认证 TLS、错误 hostname 与 secure peer 切换回归。
- DNS/IP：原全答案公网判断与 IPv4/v6 保留前缀经 IANA 对照，未发现需要扩大公网接受范围的理由；明确 family:0/hints:0/all:true，并拒绝 scoped IPv6 答案。新增 A/AAAA 混合/错 family/超量/空集合、保留地址、合法 IPv6 pin 与合法 IPv4-mapped peer 回归。全答案指本次 OS lookup 返回的地址集合，不能宣称可观察所有权威 DNS 历史或分视图。
- 时限/响应：以单调时钟计算 DNS+请求总时限，独立有引用 timer 保证停滞 handshake/body 有界并关闭请求；拒绝提前 close、编码、空包和长度不符，保留 128 KiB/8 KiB header 限制、禁止 redirect 和 socket pool。测试均为注入传输，无真实内网/Metadata 请求。
- 文件读取：原 stat 后 readFile 可被并发增长突破上限，且 FIFO 可在 open 时阻塞。改为固定 limit+1 缓冲、NONBLOCK、常规文件/nlink 检查、读前后版本/身份校验；增长与 FIFO 用真实文件及隔离子进程验证。硬链接拒绝是安全限制，现有硬链接缓存需要用普通文件恢复。
- 目录替换：持有根、cache 组件与 writer mutex 的目录描述符，跨异步 IO 检查 dev/ino 与 canonical path；网络等待中 real-directory/symlink 替换都会拒绝，未向替换目录写入 cache。保留目录 fd 防止检查期间 inode 复用；释放前核对 mutex 身份，禁止旧 writer 删除新 writer 锁。
- 锁与缓存：比较原锁 bytes 对应内容及 inode/mtimeNs/ctimeNs，拒绝 fetch 中相同内容的 inode 替换；独占 writer 仍使用原 mkdir mutex。新增 cache 的持久字节复核；staging 使用随机 UUID、0600、独占 nofollow open、sync、版本/字节复核及提交后读回。staging 被改写时保留旧锁；清理只删除本 writer 身份一致的 staging。合并既有 pins 后再次检查 32-module 上限，不能持久化第 33 项。

## 验证与原始证据

原始日志独立保存于 /Users/shopme/.codex/worktrees/r101-security-01a120c0/evidence/。环境、输入/日志 SHA-256 与命令详见该目录 verification-manifest.json。所有结果为本地 Node/文件系统/构建组件级，不升级为真实 Native、AI、F3 或 ZIP。

| 命令/范围 | 结果 | 日志 |
| --- | --- | --- |
| npm ci | exit 0；依赖锁未改 | npm-ci.log |
| 原 security/import 基线 | 12 PASS / 2 FAIL（根 alias） | baseline-tests.log |
| 第一轮修复 security/import | 22/22 PASS | security-import-01.log |
| 增长/FIFO/锁容量回归 | 25/25 PASS | security-import-02.log |
| node --test tests/environment/remote-esm-security.test.mjs tests/environment/remote-esm-import.test.mjs tests/environment/program-project.test.mjs tests/environment/program-build.test.mjs | 41/41 PASS，0 fail/cancelled/skipped | final-targeted.log |
| npm run check | exit 0；196 个源码/测试/构建文件检查通过 | source-check.log |
| git diff --check | exit 0 | verification-manifest.json |
| npm audit --json | exit 1；既有 1 high / 1 moderate / 1 low | npm-audit.json |

## 安全限制与协调项

- **主动同 UID 对手仍是未关闭的隔离风险**：Node path-based open/rename/rmdir 缺少 portable openat/renameat/CAS，检查之间的 syscall 竞态仍可能导致越界创建或覆盖；本轮身份检查缩小窗口并拒绝已观察的替换，但不能证明无越界副作用，不能称为沙箱。caller 必须使用受信任、自己控制的项目目录及祖先；若 Native 将恶意目录作为强隔离边界，需要 Native/build/目录 capability 或 OS 隔离协同，本 scope 不修改这些入口。O_NOFOLLOW 单独不构成该保证。
- mkdir 锁对遵守协议的 writers 有效；不遵守锁的进程在最后检查与 rename 间仍可能覆盖，不能宣称跨任意进程 CAS。崩溃锁/部分 orphan blobs 继续 fail closed，需要检查后清理，未新增盲目重放或自动抢锁。
- npm audit 指出既有 serialize-javascript high、terser-webpack-plugin moderate、webpack low；本轮不改依赖/锁。webpack buildHttp 未启用（原 builder 注释/配置不变），这不能作为其余依赖告警已修复的证据；交集成/依赖负责人处理。
- fetchImpl / httpsRequest / lookup 为可信测试注入，不能作为生产安全传输或第三方恶意代码沙箱。下载后的静态 ESM 解析限制也不是 JavaScript 行为隔离；真实执行继续依赖原框架权限/生命周期。
- 真实公开 CDN/TLS 网络、Linux/Node 22、Chrome/CFT、Native/MCP、F3、ZIP：本轮 NOT_TESTED。原 R10 CI/CDN 成功保留为原候选证据，不自动适用于本次源码。未访问真实内网/Metadata，未占 native/profile/固定端口/dist。
- 本分支仅两个 scripts、两个 remote-esm tests 与本专属 workstream。未编辑 native/UI/build-program-project、main、其他 Agent 文件；不 push/merge/release。

## 参考与复用失效条件

- [IANA IPv4 特殊地址注册表](https://www.iana.org/assignments/iana-ipv4-special-registry/) 与 [IPv6 注册表](https://www.iana.org/assignments/iana-ipv6-special-registry/)用于本轮前缀核对；公网策略对 IPv6 special-purpose 保持更保守的拒绝。
- [Node TLS](https://nodejs.org/api/tls.html#tlscheckserveridentityhostname-cert)和 [Node 文件标志](https://nodejs.org/api/fs.html#file-open-constants)用于确认 hostname 认证与 nofollow/nonblock 行为。对无法抵御主动目录 syscall race 的结论来自本实现使用路径 syscall 的检查，而非把文档的 nofollow 描述解释成完整隔离保证。
- 任一相关实现/测试/依赖锁/OS 行为改变时，仅重测受影响项；本地日志不替代正式集成候选 CI/CDN/Native 验收。资源已 released；本地提交将由 executor 最终报告给出。

## 追加：已验证 DNS 集合内 TCP 连接回退

- 状态：LOCAL_FIXES_VERIFIED / released；仅 remote-esm-network.mjs、安全测试与本记录；基于 d488fbc32ec3412abd95c2dc0eed058fbb7f46da 追加本地提交，用户集成分支已 cherry-pick 原提交。
- 新证据（用户提供，未在本 worktree 重跑 live）：CDN 的 104.17.208.5/104.17.207.5 均通过同次 public DNS 检查，某模块 first .207 ECONNREFUSED；curl --resolve .208 exact SNI 返回 200、tls_verify0。未使用代理；LAN proxy 不可用。
- 通过条件：同次全 A/AAAA 验证的集合中有限、串行、每次单 IP 固定回退；禁止重 DNS；原 hostname/TLS/peer 校验完整；仅连接阶段的明确 TCP 错误回退，TLS/peer/security/status/byte 错误不回退；DNS+所有尝试共享 10 秒 deadline；resolveRemoteAddress 保持 frozen 单对象 API。
- npm ci / 依赖锁未变，复用前一轮安装；网络输入改变，仅运行必要 security/import 定向测试与源码检查。仅本 worktree/独立日志目录，无 CFT/native/profile/dist/固定端口，不重复 live 或访问内网/Metadata。
- 实现：私有 resolver 返回全校验、复制并冻结的地址快照；用 BlockList 按实际 IP 去重（含等价 IPv6 文本），保留 DNS 顺序。公开 resolveRemoteAddress 继续返回原 first frozen {address,family}，不公开 array API。
- 回退策略：最多 4 个不同公网地址，各尝试一次；仅 request error 的 syscall=connect、ECONNREFUSED/ENETUNREACH/EHOSTUNREACH，且尚未 TCP connect/secureConnect、未收到 response，才能回退。旧尝试先 abort/destroy；每次 agent:false/autoSelectFamily:false/单 family/pinned lookup，原 hostname/SNI/cert/peer 验证保持完整；没有第二次 system DNS。
- DNS+所有尝试共用从请求入口开始的单调 deadline（默认 10000ms，不可加长）；后续 timeout 使用剩余预算。TLS/peer/security/status/bytes/encoding/timeout、非 connect errno 以及 TCP 已连接后的 errno 均终止整次 fetch。4 地址都 connect 失败时 E_REMOTE_FETCH 保留最后原错误 cause；不自动更换 DNS/代理或再循环。
- 新增回归先在旧代码复现 20 PASS / 2 FAIL（first connect 与 deadline），原始 fallback-before.log 保留；修复后首轮 security/import 30/30 PASS（fallback-targeted-01.log），补足去重/上限/不可达 errno 后最终 32/32 PASS（fallback-final-targeted.log，0 fail/cancelled/skipped）。覆盖 mixed private 答案位于第 5 项仍 0 request、IPv6→IPv4 pin、TLS/HTTP/字节不回退及公开 single API。
- 最终命令：npm exec -- node --test tests/environment/remote-esm-security.test.mjs tests/environment/remote-esm-import.test.mjs；npm run check（196 files，exit 0）；git diff --check（exit 0）。本轮日志/环境/输入 SHA-256 在同独立证据目录 fallback-verification-manifest.json；原 verification-manifest.json 及全部旧日志不改。
- 限制：只对已验证快照的前 4 个不同地址尝试，不保证第 5 个及以后地址的可达性；不重试握手/中途断流/超时，不把用户的真实 CDN 证据提升为本追加提交 live PASS。真实公开 CDN/Native/F3/ZIP 本轮 NOT_TESTED；此前同 UID 文件系统隔离限制不变。未写其他分支，未 push/merge/release。
