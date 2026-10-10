# R2 Mac 配对与项目 GUI：01a124da

2026-10-10。本轮 Browser main、OpenDesk master；无分支、无 worktree、无发布。

## 资源与交接

初始 Browser e180c77f，当前集成基线 5afb1a07；Go 初始 a9899757，R5 交接安装器提交 512e9495。用户授权跨对话协调。保留用户 PNG、Node 默认安装/套接字、dev Node 43120、个人 Chrome 和全部旧 receipt。

R5 对话独占 CFT、Profile、CDP 60189、命名实例 r5-mac 和安装 App。本轮不启动/停止这些资源，不改共享 dist。production 构建在文件系统源码快照完成；构建器测试锁使用 port0，复制已有 node_modules，无新增依赖。最终原生验收统一 http://127.0.0.1:43111/demo-form.html；63825 临时页面仅保留历史专用证据。

## 实施

- 开发版配对按钮：真实点击生成随机 nonce 和两分钟期限，系统链接只携带不可信身份申请；不请求 Native 权限，不注册项目，不运行。原生 App 单独决定是否接受。
- 普通连接按钮保留现有真实 permissions.request 与用户授权；连接诊断保留 Host 注册与实际认证连接的区别。
- Sidebar 无项目状态指向 OpenDesk 原生授权菜单；项目刷新、Controller / Page、Stop、Result 均复用现有执行链。
- Go：自动准备、开发申请独立确认、nonce 防重放、安装事务恢复、JS 单文件 picker/类型/Origin 授权和撤权；详见 OpenDesk 同名 integration 记录。

## 已验证

本轮原始日志在 docs/framework/evidence/native-r2-mac-01a124da/；错误与 FAIL 保留，不覆写旧 receipt。

- browser-final-targeted.log：79/79 PASS（组件）。
- browser-final-check-retry.log：242 文件语法、CSP、MIT、build contract PASS。
- browser-build-pairing-fixed-retry.log：production 包 PASS，26 assets，packageHash b1bfd61283fbb0180b8e327ad3fcfa6412a5085d7da0e6a0825f72b3dd847547。构建快照只含本轮源差异，脚本锁 port0 是测试驱动差异。
- go-provider.log：真实 Go Host 可执行文件与模拟 Chrome 的组件 provider 回归 PASS，不能称真实 Native PASS。
- Go bridge/CLI/AppShell/cmd 定向 PASS 与完整 Mac App 构建记录见 OpenDesk .runtime/tests/browser-r2-01a124da/。

## 待关闭

官方稳定 Extension ID / 正式签名发行尚不可取得；不上传草稿，不猜 ID，不扩大 allowed_origins。Go 原生 GUI 当前支持 JS 单文件，多文件/npm 仍为 MCP。R5 正在从相同提交重建 App/扩展，执行标准页面真实 Run/Page/Stop/持久结果/源码变化/撤权/重连/释放和安装安全矩阵。独立反方按 R2 权重另行记录；没有新候选原始证据的项保持 NOT_TESTED，不能判 95+。
