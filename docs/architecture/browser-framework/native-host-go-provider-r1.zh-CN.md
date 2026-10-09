# OpenDesk 原生 Native Host：Go Provider R1 接入与验收

日期：2026-10-10。状态：**Go 候选已实施，Linux/macOS Go 组件与 macOS 实际可执行程序模拟 Chrome 互通均通过；真实 Chrome 许可/页面任务与 Node→Go 迁移仍未验收**。

当次证据：[OpenDesk Native Bridge Actions #37980235403](https://github.com/shopable-ai/opendesk/actions/runs/37980235403)，Go 源码 `41311e8bab78c71645958abd090f6e71a697cac2`，Browser 驱动 `c4633bf19e4a66523d37a607d6ed611e98dc267b`。测试使用真实 macOS OpenDesk 二进制、Socket、CLI，但 **Chrome Frame 由测试程序模拟**，不能扩大解释为用户权限或页面执行验收。

## 当前变化与原有主线

OpenDesk 仓库新增 `opendesk browser` 命令，将 Chrome Native Messaging、用户私有 Socket 和 CLI 统一到 **OpenDesk 同一原生可执行程序**，目标是让普通用户不再为本机 Chrome 宿主额外安装 Node。这个 Go 运行模式不包含 Node 进程、HTTP 代理服务或第二个 DOM 执行器。

扩展代码仍由原 `src/native-agent/{protocol,service-worker,host-adapter,local-project-service}.js` 控制权限、连接、requestId ledger、目标与文档、Script Revision、RunHost、Controller、Worker、持久结果和 Stop。**本次没有变更插件 JS 实际执行规则，也没有把 OpenDesk 桌面 OCR/鼠标流程用于网页自动化**。

```
Chrome Extension (原 SW / Sidebar RunHost / Controller)
   │ chrome.runtime.connectNative('com.shopable.opendesk_browser.agent')
   ▼
Chrome 直接启动 OpenDesk native-host 模式（Go，严格 stdio）
   │ 本用户 0700 安装根 / 0600 Unix Socket / 0600 credential
   ▼
opendesk browser CLI / 受授权本地 Agent
```

既有 `docs/architecture/browser-framework/opendesk-native-takeover-r1.zh-CN.md` 是设计方案及旧候选基线；本页是 **R1 代码入口及当前独立验收目标**，不能回填旧历史表格称已验收成功。

## 新安装的使用方法

1. 安装一个有稳定绝对路径的 OpenDesk 发行二进制（构建工具仍可使用 Go/Node；**最终用户 Host 运行不需要 Node**）。
2. 在 `chrome://extensions` 复制已安装的 OpenDesk Browser **真实 extensionId**。
3. 运行：

```sh
opendesk browser setup --extension-id <实际32字符扩展ID>
opendesk browser doctor
```

4. 在浏览器插件 **Native Agent 设置**真实点击「授权并启用」，打开 Sidebar 工作台，再运行 `opendesk browser doctor`，区分 `installed` 与 `connected`。网站权限需要在扩展内单独授权，不能由安装器代批准。
5. 日常不需要开 `opendesk browser native-host` 命令，也不需要启动 Node server：Chrome 自动按 manifest 启动并关闭对应 OpenDesk Host 进程。

用于隔离验收的 Chrome for Testing：

```sh
opendesk browser setup --browser cft --extension-id <实际ID> --user-data-dir /absolute/existing/profile
```

这套安装是用户级 Chrome manifest 的显式注册，**不能靠单纯启动 OpenDesk 就绕过 Chrome 的宿主注册要求**。

## 两个仓库的职责与开发依赖

| 领域 | 归属 | R1 |
| --- | --- | --- |
| 浏览器权限、目标、DOM 自动化、Controller Result | opendesk-browser | 原实现原合同，不改 |
| Native frame、安装、Unix IPC、CLI | opendesk 原生 Go `internal/browserbridge` 和 `internal/browsercli` | Go 候选实现 |
| 本地项目 provider.read-only / providerEpoch | 原 Browser 消费者；Go Host 兼容桥 | 传输层兼容，待实际 E2E |
| 本地项目 npm/HTTPS/ESM Resolver 与现有 Codex MCP | Browser `native-agent/local-dev/*.mjs` | **目前仍使用 Node 开发工具，尚未去 Node** |
| 插件 WXT/Vite/打包 | Browser 构建工程 | 仍有 Node 开发依赖，不影响用户 Host 运行 |
| OpenDesk 桌面 JS、OCR、Flow/Scheduler/Recorder | OpenDesk Runtime | 与该 Native Host 模式隔离，不新建执行栈 |

迁移期保留 Node 实现和全部历史证据，确保已存在用户不遭到静默替换。**`opendesk browser setup/update` 遇到 Node 旧安装应 fail closed**，不得在有未决运行或 UNKNOWN 效果时自动清空状态、切换路径或回放请求。正式迁移需要 Node→Go 协议差异验证、原安装逐字节备份、明确资源交接及实际回滚试验。

## 必须验收的合同

- Node/Go 同输入：小端 4 字节长度帧、UTF-8/61440 字节、分片/连包、错误大小、握手/credential 错误、8 clients/12 inflight、超时、EOF 和只删除自己的 socket。
- Chrome Native：manifest/allowed_origins、真实用户手势原生权限、真实网站许可、单个准确 Sidebar Host、目标 document/stale、禁用 Native 后普通运行仍可用。
- 客户端：不重新封装返回数据，不改变 `requestId`、`resultId`、源码 `sourceHash`，`OUTCOME_UNKNOWN` 必须只读恢复，不得偷偷重放动作。
- 开发者 provider：`provider.register/registered/changed` 和 `dev.request/response` 的 epoch、单 provider 冲突和断开事件。
- 快照、身份与回滚：同一提交/同一发行可执行文件、Node旧安装完整备份、新 Native 控制权和回滚用原始证据。
- macOS、Linux 需要各自 package/host 验证；Windows 本阶段只有显式不支持，不报告完成。

组件级桥接新增可选驱动：`tests/environment/opendesk-native-provider.test.mjs`，用 `OPENDESK_BROWSER_BINARY=<已构建的opendesk绝对路径> node --test tests/environment/opendesk-native-provider.test.mjs` 运行。它通过真实二进制和 Socket、**模拟** Chrome Frame 验证，**不能冒充 Chrome 真实授权或网页动作**。

## 放行标准

`GO_NATIVE_SOURCE`、`GO_NATIVE_COMPONENT`、`GO_NATIVE_REAL_CHROME`、`MIGRATION_VERIFIED`、`DEFAULT_PROVIDER` 分开记录。代码提交只意味着 `GO_NATIVE_SOURCE=IMPLEMENTED`；其余未核对项必须保留 `NOT_TESTED`，正式默认 provider 在验收前仍是 Node。OpenDesk 和 Browser 的既有原始 evidence 不被覆盖或改写。
