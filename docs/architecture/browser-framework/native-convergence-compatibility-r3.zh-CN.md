# Native Host 双实现融合 R3：兼容边界、迁移策略与证据

日期：2026-10-10。状态：**代码实现与兼容性修复已进入两仓库主分支；新发行二进制跨实现 CI 和真实 Chrome 完整验收按当前运行结果单独判断。** 本文补充 [Go Provider R1](native-host-go-provider-r1.zh-CN.md)、[免手工 ID R2](native-zero-config-pairing-r2.zh-CN.md)，不替换其历史证据。

## 先给结论：这不是把两套浏览器运行引擎合并

```text
Chrome Extension（唯一浏览器执行 owner）
  Service Worker：Native 授权、持久 requestId/digest 栅栏
  Sidebar RunHost：目标 / document / revision / 原 Controller 与 Page
         ▲
         │ Native wire v1：Host 名称、frame、requestId、结果均不改
         │
  Chrome 按需启动的 Host（一次安装仅选择一个）
    ├─ 旧 Node native-host.mjs：迁移回退和历史消费者
    └─ 新 OpenDesk Go browser native-host：目标生产默认
         ▲
         │ 私有 Unix socket / 同一认证合同
         ├─ OpenDesk Go browser CLI
         └─ 旧 Node CLI + Node local-dev Provider（高级开发兼容）

  OpenDesk Desktop：GUI / OCR / Desktop automation / Flow / MCP
    ≠ Browser 扩展的 Controller / ChromePage
```

**只共用传输协议，不共用两套底层执行器。** Browser 扩展保留网页 DOM、用户脚本、运行、停止及结果的唯一权威；OpenDesk 桌面 Runtime 的 Browser/Context/Page 兼容 façade 不应被接入成第二套浏览器动作执行链。Go 的 `browser native-host` 独立模式不得启动桌面 GUI、HTTP、MCP 或 Node 子进程。

## 兼容性分层：已做什么，还差什么

| 层 / 差异 | 当前决策与文件 | 证据边界 |
| --- | --- | --- |
| Native 帧与方法 | 原 Host 名称 `com.shopable.opendesk_browser.agent`、v1、4 字节小端、61440 字节、10 个标准 RPC、8 clients / 12 inflight；`internal/browserbridge` 保持 Browser `native-agent/wire.mjs` 的对外响应结构 | Go 单元 + 实二进制模拟 Chrome；非真实 Chrome |
| 安装 owner（Node → Go） | Go `Setup/SetupAutomatic` 对旧 Node 安装默认 `E_MIGRATION_REQUIRED`，只允许可信新 Go 安装或更新 | 禁止自动拆除/重放旧任务 |
| 安装 owner（Go → Node） | Node `install.mjs` 的 `setup/cleanup` 对 `provider:opendesk` 返回 `E_PROVIDER_OWNERSHIP`；旧 Node Host 也拒绝伪装成 Go Owner | Browser `native-agent-provider-ownership.test.mjs`，隔离 HOME |
| 客户端向后兼容 | Go Host 不强制用户立即改写旧 Codex / Node CLI；旧客户端可沿用 Go v1 私有 Socket 调用原有方法，安装/清理则不可跨 Owner；所有业务 mutation 仍由 Browser SW 统一入场 | Go 实际二进制 + 旧 Node CLI `doctor/bridge.status` 对照 |
| 本地项目 Provider | Go Host 实现 `provider.register`、`providerEpoch`、`dev.request/response` 传输；旧 Node `local-dev/provider.mjs` 仍拥有 project Resolver | Go 对原 Node Provider 的 real-process 测试仅证明协议，不证明 npm/ESM 去 Node |
| 未知效果 | Go CLI 在已投递后收到错误/错配 ACK 必须 `E_EFFECT_UNKNOWN / OUTCOME_UNKNOWN`，禁止调用方换 requestId 重试 `run.start` | `internal/browserbridge/client_unix_test.go` |
| 生命周期 | Chrome Port EOF、SIGTERM/SIGINT 都应删除**自有** Socket inode；不能删除他人路径，也不能将 socket 存在视为 ready | Go `browsercli` 信号处理 + 双实现原生 IPC 驱动 |
| 发行与用户配对 | 正式 ID 必须来自真实 Chrome Web Store/签名；动态开发 ID 需用户可见的本机确认；不可 wildcard、偷偷扫描插件配置或拿 OS 深链当授权 | 当前新设备一键配对**未实现** |
| 多浏览器 Profile | 当前单安装根 / 单凭据 / 单 Socket / 单 extensionId，不得宣称 Go 能安全并行支持多个身份；隔离 CFT 的 Node 测试实例合同仍需 Go 对齐 | 并发/资源归属正式验收待做 |
| 平台差异 | Go Host 当前 macOS/Linux 模式；Windows 仍是 `E_PLATFORM`，不可误用已有 OpenDesk Windows Desktop 构建成功来代替 Native 支持 | Windows 原生 Host 未实施 |

## R4：Node.js 价值审查与 Go 原生单文件替代（2026-10-10）

用户实际需要的是**普通使用免 Node.js**，不是把仓库和浏览器扩展中的 JavaScript 全部改为 Go。按消费者而不是按扩展名决定退役：

| 现存 Node 路径 | 实际消费者/现状 | 结论 |
| --- | --- | --- |
| `native-agent/native-host.mjs`、`install.mjs` | 已有 Node Host 安装及回滚身份；旧安装器有 Go owner 防护 | Go 正式迁移并证明回滚后才退出默认宿主；目前不能删除 |
| `native-agent/cli.mjs`、`wire.mjs` | 旧 Codex、本机诊断及 Provider v1 客户端 | Go CLI 已替代主要入口；保持过渡协议/跨实现差异测试 |
| `native-agent/local-dev/{mcp,provider,resolver}.mjs` | 多文件 ESM、npm/HTTPS 锁图、source map、Codex 工具 | Node 继续保留高级开发功能，未证明完整 Go 等价前不得删除 |
| OpenDesk Go `internal/browserbridge/project_store_unix.go` 与 `project_notify_unix.go` | 严格授权的单个 `.js/.mjs` 文件 + 原项目 v1 wire | 原生替代普通单文件项目的 Node Provider；每次授权/撤销只刷新原 Provider epoch，不触发 Run |
| Browser `scripts/*.mjs`、WXT/Vite/webpack/npm、Node 测试 | 开发编译、构建产物和质量门禁 | 保留为**开发环境依赖**；用户安装 Chrome 扩展和 Go Host 不需要运行这些 Node 源文件 |
| Browser `src/**/*.js` | Chrome MV3 Service Worker、Sidebar、用户脚本 | 必须保留，它们在浏览器 JavaScript 环境运行，**不是 Node Host** |

Go 原生单文件 Provider 的权限采用：本机用户明确允许**一个真实文件 + 一个精确 HTTP(S) origin + runtimeKind** → Go 私有 0600 grant，绑定 extensionId 和 credential → 按文件 dev/ino 验证、两次快照读取 → 回给 Browser 冻结的 `sourceUtf8/sourceHash/sourceBytes/siteOrigins` → 由 Sidebar 再校验目标网站、hash 和显式 Run。它不接受授权一个父目录并遍历文件，不自动运行、下载依赖或执行 npm scripts；替换文件 inode 后需重新授权。Node 的高级 Provider 连接时优先使用 Node source epoch，断开后才回到 Go grant epoch。

**依然不等于正式零配置**：Go CLI `opendesk browser project add/list/revoke` 是受控开发/AI 使用的明确授权接口；真实普通用户文件选择 GUI、官方扩展 ID 可信预注册、开发版安全配对、Windows 支持和 Node→Go 原安装迁移未完成。不要因为普通脚本/单文件摆脱 Node，就删除 npm/ESM Resolver 或报“全部完成”。

## 防止“只是合并了代码”的五项放行规则

1. **实现隔离**：Node、Go 不能同时占用同一 Chrome manifest / Socket；不得借迁移重构 Browser Controller、Page、网站权限或数据结果。
2. **双向保护**：`provider:opendesk` / `provider:node` 按 owner 修改安装；可以跨 Provider 只读诊断，但不能跨 Provider 安装/清理。
3. **功能一致**：用同一套请求/回执比较 Node 与 Go，含 10 个方法、Result 自身 revision/sourceHash、Provider 消息、错误/outcome、超时、撤权与重启；不能仅证明 `bridge.status` 就声称所有操作一致。
4. **迁移事务**：Node→Go 先取得原 owner 的未决 Run 状态，再逐字节私有备份、停新请求、受控切换、同包真实 Chrome 验证。失败只回滚**未来连接入口**，不重放旧效果；无法确认 unknown 时不切。
5. **用户成功标准**：新正式安装 App-first 和 Extension-first 均应无手工 ID/Node/CLI；连接、项目授权、网站授权、运行是四个独立许可；真实 Chrome 返回唯一可查的 Run/Result/Stop/released。

## 反方审查与分数

六个视角必须分别审查：UX 是否零终端；Chrome MV3 是否遵守真实安装/权限；Go 生命周期与安装回退；安全 red team 的越权/重放/Socket 竞争；MCP/ESM 原 Provider 的能力不缩水；真实 Chrome QA 是否有同一二进制/扩展版本的原始证据。**任何安全关键项失败，95+ 不予通过。**

本页是可复核的差异表，**不是独立外部专家证书**。保留 R2 文档当次 **设计 86/100、完整产品 62/100** 的基线，不因为新增提交自动改写。必须在同候选真实 Chrome、免 Node 项目、安装/回退、多 Profile/多浏览器与用户端体验完成后，才重新独立评分并争取实现/验收 95+。

运行入口：Go [Native CI](https://github.com/shopable-ai/opendesk/actions/workflows/browser-native-bridge.yml)、Browser [Native CI](https://github.com/shopable-ai/opendesk-browser/actions)；正式 Mac 实施和验收请使用 [R2 单一 GOAL](../../framework/prompts/goal-native-zero-config-r2-mac-codex-20261010.zh-CN.md)。各次 PASS 与提交 SHA 必须明确绑定。
