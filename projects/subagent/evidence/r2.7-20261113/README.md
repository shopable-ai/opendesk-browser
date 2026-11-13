# Subagent R2.7：真实安装阻断证据

同一任务：`OD-SUBAGENT-CHAT-A2B2A-R2-TRUSTED-CLOSURE`。目标仍是已有 ChatGPT A 的 Mini Chat 经原审批、固定已安装 WebFlow Task 在独立 B 单次发送，原 Durable 全文回 A。**本轮没有完成 A→B→A；BUSINESS BLOCKED。**

## 候选与运行环境

- 工作仓库 `main@3a81bb4b5ddf53027a1766395b758e13d4f66552`；保留其他 owner 的未提交改动，无本轮提交、分支、worktree 或 PR。远端 CI 最后核对 `adc0808e5c9d3ed2f0c5a255d32230225020b747`，不混称本地候选。
- ego(lite) TaskSpace 138；真实 OpenDesk Browser Developer，扩展 ID `ccfcjegpkdlgbclopjmadlcjedelidmf`、版本 `0.1.0`。原调试 UI 显示持续开发服务已连接，revision `99c6621f8491216b312a84fd2e799f921106e799601d9c74cd37164d639f2071`，与当时磁盘指纹一致；复用既有 watcher。非 production 验收，也未另行覆盖 dist。
- 日常预期加载路径为本仓库 `dist/development`；真实加载绝对路径及 Go doctor / Native allowed_origins 配对未由本轮独立读回，不以相同指纹或本机连接在线替代这些检查。
- 正式本机连接设置 UI 显示已连接。CodexPro connector 仍 Connection failed，OpenDesk Desktop/Code connector 仍 SSE 429；不能将这些 connector 故障概括为浏览器 UI 完全不可用。
- 原构建器生成 `artifacts/subagent-r27/page-build/`。构建 draft 的 `BUILT_UNVERIFIED / installable:false` 是原生命周期状态，未修改该标记。
- 原 `build-page-install-package.mjs` 生成正式格式候选 `artifacts/subagent-r27/subagent.opendesk-page.json`，`opendesk.subagent`、0.2.0、r1、USER_SCRIPT、顶层 `https://chatgpt.com/*`。
- sourceHash `ecfadece5c0568979e08288af59640a7e83089322ee53598f65456f1c010fe22`，与历史相同；packageHash `a6d3412da19a14265c4a597d7490772c0a4e49ece3cb7ea3faf23d00d35b3537`。产物在本机 ignored artifacts，未冒充已安装或已发布。

## 原安装器真实操作与回执

从原侧栏「扩展」导入上述文件，原生文件选择器中读回路径、单独确认打开；审阅显示 Subagent v0.2.0 · r1、批准站点自动运行、无侧栏/Native 权限。用户明确回复「确认安装这一固定版本」后，仅点击一次原「确认安装」。使用原 ui-acquire/ui-release 协调桌面输入，未强抢并行 owner。

安装器先显示「正在安装并核对注册状态…」，随后返回：

> 审阅时基线：未安装；当前读回版本：未找到此 programId 的安装记录；不能确认目标已安装。本次请求仍未确认。
>
> E_BUILTIN_RESOURCE：E_BUILTIN_RESOURCE … 请核对扩展中的安装状态；未自动重试安装。

按钮变为禁用的「需要核对」。**没有重试、强制 installable、直接写安装记录或绕过 Authority。** 安装批准未当作具体任务 `send:true` 批准。

原生工具返回的目标区域摘录见 [安装观察转录](install-observation.txt)；它不是 Authority 导出回执，不证明所有原生注册表均无部分效果。

最小只读诊断：`E_BUILTIN_RESOURCE` 来自原固定资源读取保护；Page 安装在候选导入/环境核验阶段调用原 loader。扩展设置页面内读取以下六个资源均为 200、无重定向、URL 相同且非空：`libs/manifest.json`、bootstrap、lodash、dayjs、my-utils、page-core。该证据仅证明扩展 document 的资源读取，不证明失败时 Service Worker 的读取、响应或完整性检查。**具体失败资源及根因未定位，未认定为脚本或 Controller 缺陷；未无依据修改平台加载器。** 首次诊断曾发现 p1 已变成 newtab，随后重新绑定实际设置 URL；newtab 的 fetch 失败不计作产品资源故障。

## 固定 Task 与业务状态

| 项目 | 本轮证据 |
| --- | --- |
| taskId / version | `chatgpt.conversation.create` / `0.2.0` |
| scriptId / revision | `task:chatgpt.conversation.create:0.2.0` / `1`（包声明；无本轮 Run） |
| manifestHash | `0402cbea8284f87bd3cc63c73b453530be1338cd511c30671957a919678ab146` |
| contentHash | `90d077ff17fdcf89ac0a13adf4a671edc324030165c7eefa95a4acdc531bd51c` |
| 包/源码 | 原 verifyTaskPackage 通过，独立脚本 SHA 匹配，包内源码逐字节相同 |
| 本机原任务目录 | 0.2.0 显示已安装，hash 精确匹配；「运行时已更新，待重新验证」 |
| installationId / generation / enabled / 网站授权代次 | 未取得完整可信运行记录；不能判定可执行 |
| 任务审批 | 未发起；无「保存并核对」或「确认执行一次」原生任务回执 |
| A / logical requestId / Controller requestId / runId / resultId / B | 均无本轮业务证据，B 未创建，未发送消息 |

未切换 0.2.1/0.3，未修改固定 0.2.0、WebFlow tool.config、原 Mini Chat、客户端、Controller、Runner 或 Durable 数据库。并行 0.2.1 和 storage/Page 改动保留原 owner。

## 独立验证与 CI

- `node --test projects/subagent/tests/*.test.mjs`：48/48 PASS，日志 `artifacts/subagent-r27/node/subagent.tap`。
- `node --test --test-name-pattern='^page request' tests/environment/my-react-workbench.test.mjs`：6/6 PASS，日志 `/tmp/subagent-r27-workbench.tap`。新增一项使用真实 0.2.0 schema 的 `send.default=false`，验证冻结 Page 请求的 `{prompt,send:true}` 在两阶段后原样传给 Host，展示草稿改为 false 也不能覆盖。其余身份与站点仍为受控 fixture，不声称真实 ChatGPT 安装或发送通过。初次测试错误地把目标换为 ChatGPT、保留 example.com 的 fixture 授权而被拒绝；修正 fixture 后通过，产品校验未改。
- 相关测试文件 `node --check`、`git diff --check` 通过。本轮只新增回归覆盖，没有已证实业务代码缺陷修复。
- [远端 Page userscript CI](https://github.com/shopable-ai/opendesk-browser/actions/runs/43414625537/job/131849280877)：`adc0808…`，358 pass / 15 fail，build/package 验证 skipped。`tx.all is not a function` 是旧 fixture 缺 all，真实存储提供 all；本机并行 dirty 已修，未由本任务接管。其余失败不作为扩大改造依据。
- [远端 App CI](https://github.com/shopable-ai/opendesk-browser/actions/runs/43414625590)：discover 为 selected=[] / native=[]，不能证明 Subagent 原生通过。
- [历史 R10](https://github.com/shopable-ai/opendesk-browser/actions/runs/43263417411)：固定 0.2.0 合同、production build/package verify 有通过记录；整体 job 存在其他项目失败，不能写作当前完整 CI 或 Chrome PASS。

## 状态与下一步

| 维度 | 状态 | 界限 |
| --- | --- | --- |
| SOURCE | PASS（定向） | 既有链路与固定 pin 核对，未重复实现 |
| NODE | PASS（定向） | 48/48 + 6/6；不代表全仓测试 |
| BUILD | PASS（Page）；Browser 本轮 NOT_TESTED | 原项目构建完成，未重建/覆盖现有 Browser watcher |
| PACKAGE | PASS（Page 格式校验） | 原正式打包器成功；未证明安装 |
| INSTALL | BLOCKED | 用户已批准，原安装器 E_BUILTIN_RESOURCE，注册未确认 |
| CHROME_NATIVE | BLOCKED | 有真实扩展安装失败证据，无真实 A/B 业务链 |
| BUSINESS | BLOCKED | AC01–AC10 全部 NOT_TESTED，P1 阻断 |

下一条操作仍是原安装链：通过合法且能绑定当前 Service Worker 的诊断取得具体失败资源/响应与原注册状态，只修已证明的资源阻断；确认无未知注册效果后才能恢复安装。之后核对固定 Task 的安装代数、enabled 与授权，再从已有 A 真实点击并在原工作台取得具体发送审批。UNKNOWN 只查原记录，不补发或新建 B2。未恢复旧多模型、项目对话或其他延期目标。

## 五角色独立审查

五名原生子 agent 分别只读审查，模型/provider 继承父任务；未运行浏览器或写产品代码。评分依据其收到的本轮事实与各自源码范围，不是 BUSINESS PASS。

| 角色 | agent | 分数 | 主要扣分与反方否决点 |
| --- | --- | ---: | --- |
| 产品 | Socrates | 25 | 安装、真实 A 请求、B 单发和全文回 A 尚未交付；安装批准不可替代发送审批 |
| 架构 | Fermat | 40 | 复用方向成立，但 Page/Task/SW/Controller 组合未实证；不能把运行时待验证升格 PASS |
| 脚本协议 | Maxwell | 85 | pin/hash/send 静态一致，但安装、真实 Run、全文投影缺证；不能以一处 click 证明实际单发 |
| 安全 | Goodall | 45 | 安装/来源/代数/单发/UNKNOWN 的当前候选原生证据缺失；任何换 requestId、B2 或补发均否决 |
| 测试 | Arendt | 68 | 定向回归有价值但身份仍是 fixture；真实链及输入绑定证据不足；不能将 mock projection/空 CI 选集称原生通过 |

算术平均：`(25 + 40 + 85 + 45 + 68) / 5 = 52.6/100`。未达到 95。测试审查先于安装转录入库；原始 Authority 回执依然未取得。
