# AI Proxy · 真实 OpenDesk 扩展代码

**当前交付（2026-10-31）：`0.3.0` 正式 JSON 已编译、晋升并在日常 Chrome 实际安装。** 已验证添加/保存代理配置、当前网站识别、规则保存、草稿保护、关闭重开回读及管理/返回路径；配置保存与实际代理应用始终分开。交付范围、安装证据与尚未完成的功能见[第 14 节](#14-030-安装交付与实际完成情况2026-10-31)。第 12–13 节保留上次开发记录，F1–F10 与长期 K1–K13 不删减；安装通过不表示全部迁移功能完成。

它管理**浏览器网络代理**，不是 AI 模型 API 代理。唯一业务 owner 是本目录，基于现有 React 源码继续开发，没有另建 Chrome 扩展或特权后台。

| 真实源码 | 职责 |
| --- | --- |
| [src/main.jsx](src/main.jsx)、[src/root.html](src/root.html) | 正式沙箱挂载入口，只接公开 OpenDeskTool / OpenDeskSDK；不读取 Preview 全局开关 |
| [src/environment.ts](src/environment.ts) | 当前 full-config v2 存储、ETag、额度、写后回读，以及有限公共代理参数适配 |
| [src/service.ts](src/service.ts)、[src/domain/config.ts](src/domain/config.ts) | 配置校验/引用、串行操作、待应用选择、已确认路由、unknown 与生命周期保护 |
| [src/App.jsx](src/App.jsx)、[src/QuickPanel.tsx](src/QuickPanel.tsx)、[src/Settings.tsx](src/Settings.tsx) | 主界面、四模式入口、设置七区、三语和草稿保护 |
| [tool.config.json](tool.config.json)、[vite.config.mjs](vite.config.mjs) | 同 ID v2 能力声明、现有 Vite 编译、外置共享 React/UI 与同源回执 |
| [tests/](tests/)、[evidence/extension-core-20261031.json](evidence/extension-core-20261031.json) | 真实消费者的定向测试与分层运行证据；不把 SDK fixture 当作真实代理 |

运行现有工程（在仓库依赖已准备好的环境，不新增依赖）：

```sh
cd /Users/shopme/Documents/workspace/opendesk-browser/projects/ai-proxy
# 当前已有 npm run watch，勿重复；没有该项目 writer 时才启动
npm run watch
# 另一个终端：已有 stage watcher 时不重复
node ../../scripts/watch-sidebar-tool.mjs .
# 临时连接本项目；已有连接时不重复
opendesk browser dev .
```

随后在日常 OpenDesk「开发 → 本地项目 → ai-proxy → 独立本地项目 → 在侧栏调试」。保存只写本浏览器 session 的隔离开发数据，停止调试后重开可以回读；浏览器 session 结束后的保留由宿主合同决定，不能当作正式 local 持久化证明。已安装工具的同一源码使用原受管 `storage.local`。本地调试没有借用正式安装身份取得浏览器独占代理权限。

真实代理公开接线只表达：**默认直连，同一无认证 HTTPS/SOCKS5 公共节点，1–16 条含子域的域名规则**。启停仍经原 SDK、安装身份、可信手势、精确路由审阅与权限链。不支持的四模式语义、认证、任意 PAC、多节点、精确域及本地客户端保留配置/入口并明确拒绝应用，不静默降级。

`dist/tool.js`、`dist/tool.css`、`dist/build-ready.json` 是真实编译输出；原生调试使用 stage watcher 的不可变快照。**项目唯一正式 `ai-proxy.opendesk-tool.json` 已在本次交付晋升至 `0.3.0`，与当前源码同源，并由原有本地导入链实际安装。** `preview/` 是单独的内存模拟入口，`trusted/` 和 Browser 专用 portal 仍是历史候选，不是本轮运行或授权捷径；本轮实际运行的是安装包沙箱。

以下第 1–11 节保留历史来源、产品需求与 UI 证据；其中“当前阶段”“只做原型”和历史 PID/SHA 不覆盖上文及第 12 节。

## 1. 当前来源与下一条用户操作

- 原正式代码：`/Users/shopme/Documents/workspace/ai-proxy/apps/browser-extension/`，WXT + React + TypeScript，原 package version `0.1.0`。
- 原项目 HEAD：`d8e68fec75bf0bbfb39fddccd756a2103cff3787`；工作树有多项修改及未跟踪源码/测试。迁移依据是核对时的实际文件，不能用 HEAD checkout 覆盖这些变化。
- 文件级来源指纹、核对时的 dirty 状态和原型来源见 [migration-source.json](migration-source.json)。它是只读来源清单，不含凭据、Profile、存储或运行产物，也不是已复制业务源码的证明。实施开始时重新比较；发生变化先判断具体文件归属。
- 当前项目在 `main`；只写本项目。根目录已有并行修改，尤其 `src/ui/sidebar-tools.js`、preview 工具链及其他产品，不由本任务覆盖。原 ai-proxy 工作树保持只读；不停止已有 watcher，不创建分支/worktree/PR。
- 最终产品操作链：**OpenDesk → 扩展 → AI Proxy → 添加代理 → 保存 → 明确应用 → 访问受控测试站点 → 停止管理**。本阶段先完成下述原型与本地开发入口，不抢先执行最终链；保存草稿不启动代理，实际代理变更保留可信手势及必要权限审阅。
- 当前可操作：[同源 Preview](http://127.0.0.1:43263/ai-proxy-preview)。[四态对照辅助页](http://127.0.0.1:43263/projects/ai-proxy/preview/compare.html)在现有 CFT155 中已生成完整证据；日常 Chrome 在线 iframe 加载仍有未分类异常，不将该辅助入口记为日常 Chrome PASS。真实「开发 → 本地项目 → ai-proxy → 在侧栏调试」已运行本轮候选；仅隔离开发数据保存 `native-ui.example.com:8443`，未应用代理。本次临时 CLI 与调试已清理；需要继续本地调试时在本目录运行 `opendesk browser dev .`。实际代理状态仍是失败/unknown，完整真实代理核心链 `NOT_TESTED`。

## 2. 类型、所有权与复用决定

| 项目 | 决定 |
| --- | --- |
| 类型 | 侧栏管理 UI + 持续代理服务的组合式产品；不是 Page USER_SCRIPT 或 Controller Task |
| UI 世界 | 本阶段为同源 Preview 与已有本地项目调试路径；此前可信挂载为未完成候选，不作为当前默认开发路径。沙箱不因同 ID 或目录而获得可信身份 |
| 后台责任 | 关闭 UI 后仍有效的代理设置及其撤销由现有受管服务承担；旧认证/任意 PAC 等不足之处单独取证，不能默认获得动态特权后台 |
| 业务 owner | `projects/ai-proxy/`；业务模型、配置、订阅、诊断、三语、测试、专用 fixture、preview 均归此项目 |
| 主 Skill | 当前本地项目与 UI 开发按 `opendesk-sidebar-tool-dev`、`opendesk-ui-preview`；通用能力缺口须另行证明并归平台 owner，不由历史可信接线倒推开发路线 |
| 框架修改 | 由 leader 按已证实缺口与 owner 处理；SDK 已覆盖的直接复用，未证实的额外能力记 `SDK_GAP_NOT_PROVEN` |
| 包与安装 | UI 使用原 Sidebar Tool 格式与唯一打包器；正式交付时仅一个 `ai-proxy.opendesk-tool.json`。JSON 不包含可替换的高权限后台，也不赋予可信身份 |
| 验证 | 项目内业务测试 + 受影响公共权限/生命周期测试；Mock、包字节、真实 Chrome 分别记录。安装仍经现有可信审阅 |

公开复用入口：

- [扩展创建与发现工作流](../../.agents/workflows/extension-creation.md#二-b发现与复用)、[目录与测试归属](../../docs/architecture/extension-project-layout.zh-CN.md)。
- [Sidebar 开发合同](../../docs/api/sidebar-tool-development.zh-CN.md)、[公开 Browser SDK 生成参考](../../docs/api/browser-sdk.developer.generated.md)、[批准 Schema](../../docs/api/browser-sdk-interface-matrix.json)。
- React 编译/独立沙箱结构可参考 [quick-notes-react 配置](../quick-notes-react/tool.config.json) 与 [README](../quick-notes-react/README.md)，不复制其 ID、构建产物或业务。沿用现有 React 构建依赖；当前不引入新依赖。
- 现有代理消费者 [ai-vip-share 配置](../../examples/sidebar-tools/ai-vip-share/tool.config.json) 只作为最小接线证据，不复制它的账号或业务，不将特定本机 HTTP 例外推广成公共能力。

### 已核对的能力差异

| 旧能力 | 现有公共能力与迁移要求 |
| --- | --- |
| 获取代理控制状态、明确启停 | `browser.proxy.managed.getStatus/requestEnable/requestDisable` 已公开；浏览器级独占，capability 为 `browser.proxy.managed`；启停需要可信用户手势。公开不等于当前 Chrome 已验收 |
| HTTP / HTTPS / SOCKS4 / SOCKS5，自定义 PAC、四模式 | 当前 `requestEnable` 仅接受 `{config:{endpoint:{scheme:'https'|'socks5',host,port},domains}}`，域名 1–16 个。不能覆盖全部旧协议、全局 direct/system、任意 PAC、多个规则目标；不虚构参数、不静默降级 |
| HTTP/HTTPS 代理认证 | 没有公开认证字段；`webRequest.onAuthRequired` 的发现记录不是批准接口。凭据必须留在可信 session，仅对已确认路由的精确代理挑战提供；不能送入普通网页或存入 UI 持久数据 |
| 当前网站、诊断与订阅读取 | 优先公开当前页能力、`browser.network.request` 及本地文件/文本；受限 Origin、手势、CSP、权限和响应大小分别核对。扩展 fetch 成功不证明标签页走代理 |
| 使用统计与关 UI 后运行 | owned Tab 的有限请求观察不能当作全浏览器统计。App Service 当前不可任意后台联网；scheduler 不是任意 alarms/后台代码执行器。依实际业务证明差异 |
| 官方账号/OAuth/支付 | 旧 `identity` 与 Provider 的接口不等于新工具获权。保留配置缺失/离线/未登录/无权益状态；接入前核实合法公开边界，不创建虚假套餐或交易 |

需要公共修复时，先给出：缺哪项公开能力及文档、最小调用/拒绝结果、工具内不能解决的原因、跨工具价值、最小 API/源码/测试范围、权限/生命周期/兼容及安全影响。不得为了本工具在通用 Host 塞入代理私有算法；也不得把旧 Background 原封不动作为动态 JS 安装。

## 3. 迁移目标与顺序

| 目标 | 要交付的结果 | 完成条件 |
| --- | --- | --- |
| G0 来源与 preview 保全 | 当前 dirty 文件指纹、功能清单及历史单 HTML | 来源可复核，旧仓库和并行修改保留；历史来源准备记录 |
| G1 最短核心链 | 添加/校验/保存代理、待应用与实际路由分离、明确应用、受控站点请求、停止管理 | 原型与本地调试入口稳定后推进真实部分；回读控制权及流量证据须一致，目前 `NOT_TESTED` |
| G2 原代理功能迁移 | 四模式、端点/配置、站点规则/优先级/默认目标、PAC、本地客户端、认证与重启恢复 | 下表功能有明确实现去向与对应验证，未解决的核心能力不能以隐藏 UI 代替 |
| G3 辅助功能与数据 | 订阅列表/详情/解析、备份导入导出、诊断、可选统计、三语；官方账号边界及采集入口保留真实状态 | 不把未实现的旧规划补写为已交付；缺 Provider/外部网络证据分别标注，不伪造结果 |
| G4 OpenDesk preview | 保留历史原型，并在实际 UI 存在后增加正式源码同源的 OpenDesk 壳预览 | 只替换 SDK 边界为内存 Mock，可操作核心链与错误/撤权/草稿返回；标明模拟及来源 SHA |
| G5 交付与持续开发 | README 中有效的项目编译/watch、定向测试、原打包/晋升命令与唯一正式包 | 包与源码同源、无测试/Mock/凭据混入；安装/运行事实独立报告 |

当前先完成侧栏 UI 对照与原型，再走本地项目开发；G1 的真实代理部分随其依赖后续推进。G0 仅为历史来源准备，不构成产品完成；PC 自适应、正式发布、全面验收及评分延期。

### 功能保留清单

| ID | 保留的用户功能 | 旧实现位置（相对原 browser-extension） | 阶段与边界 |
| --- | --- | --- | --- |
| F1 | 四模式 system/direct/profile/rules；代理/本机端口添加、选择、保存与明确应用 | `entrypoints/sidepanel/App.tsx`、`domain/{config,proxy-entry,types}.ts`、`runtime/service.ts` | G1–G2；不能用 SDK 子集冒充四模式完成 |
| F2 | HTTP/HTTPS/SOCKS4/SOCKS5、站点子域/优先级/默认目标、PAC 生成/编辑/确认 | `domain/{pac,pac-starters,config}.ts`、`runtime/chrome-proxy.ts`、`entrypoints/options/App.tsx` | G2；Chrome 浏览器代理不提供 SS/VMess 等原生隧道协议 |
| F3 | 代理认证、实际应用快照、控制冲突、STOP、待释放恢复、启动恢复 | `runtime/{service,chrome-proxy,auth}.ts`、`storage/config-store.ts` | G1–G2；撤权/unknown 不自动重放；关闭 UI 不自动 STOP |
| F4 | 配置备份导入导出，旧 schemaVersion 2 数据保持 | `domain/config.ts`、`storage/config-store.ts`、`ui/backupImport.ts` | G2–G3；不同扩展 ID 的 storage 不自动共享，采用用户显式导出/导入；不读取旧 Profile |
| F5 | 第三方订阅列表/详情、文本/文件解析、节点分类与单步保存、本地客户端 | `subscription/`、`ui/{SourcesPage,SubscriptionReader}.tsx` | G3；保留不支持协议/未同步等真实提示；下载与自动同步按当前源码及权限单独确认 |
| F6 | 站点收藏/排序、Top5/10、HTTP 诊断、取消与结果有效期 | `diagnostics/`、`ui/DiagnosticsPage.tsx` | G3；诊断区分 HTTP、CORS、登录和模型能力，不以模拟可达代替真实可达 |
| F7 | 用户主动选择的使用统计、忽略站点、清空与隐私 | `usage/`、`ui/UsageControls.tsx` | G3；默认不擅自开始采集，不持久保存完整 URL、查询、Token 或无痕访问 |
| F8 | 官方账号/权益及安全公开链接 | `official/`、`runtime/official-service.ts`、`config/` | G3；真实 OAuth/支付需合法配置及单独操作，不因本迁移执行登录/购买 |
| F9 | 采集/轮换的现有入口和配置 | `collector/rotation-plan.ts`、`ui/RotationPlan.tsx` | G3；旧代码有计划校验/存储和公开链接，不证明已实现任务隔离爬虫；保存不得启动采集或自动改全局代理 |
| F10 | 简中/English/繁中、设置往返、错误、焦点、草稿保护 | `i18n/`、`ui/optionsRoute.ts`、两入口 React UI | G1–G4；适配 OpenDesk 导航/Tokens；不再保留第二套浏览器 Side Panel/WXT 宿主 |

## 4. 关键测试条件

以下为**完成迁移所需条件，不是通过记录**；leader 按最终候选补充实际结果。每次只执行与当前改动/具体失败关联的最小子集。业务测试及 fixture 归本项目；公共 SDK/Host/权限/安装撤权测试保留原框架 owner。旧 Vitest/TS 测试按行为迁移或复用现有工具链，不按版本复制测试，不为运行旧 suite 引入新 runner。

| 条件 | 用户行为与必须成立的断言 | 最小验证与旧用例参考 |
| --- | --- | --- |
| K1 入口/保存/取消 | 打开工具不自动改代理；添加有效代理可保存；非法端口/地址不提交；取消不修改数据；保存和选择草稿不改变实际路由，明确应用后才变更 | 项目模型/UI；旧 `proxy-entry.test.ts`、`config.test.ts`、`sidepanel-entry.test.tsx`、`direct-activation.spec.ts` |
| K2 真实核心链 | 受控目标的真实标签页请求到达获准代理/测试网关，Chrome 回读与 UI active route 一致；更改待应用 B 时 A 继续有效；STOP 后仅释放本产品自己的代理偏好并回读 | 先模型与 Host 适配；必要时独立测试 Profile + 受控 HTTP/SOCKS fixture；旧 `proxy-native.spec.ts`、`r72-gateway.spec.ts`。扩展出口 IP 探测不是转发证据 |
| K3 模式与规则 | 四模式符合原语义；精确域/子域、优先级、默认目标、多个端点、PAC mandatory 与脚本审阅正确；缺失/禁用端点明确拒绝；无意外 DIRECT 回退 | 纯配置/PAC 测试，再验证受影响真实路由；旧 `proxy.test.ts`、`pac-starters.test.ts`、`r861-site-rule-explicit-apply.spec.ts` |
| K4 授权与控制冲突 | 缺权限/取消审阅不应用；他工具、其他扩展或策略持有控制时不强占；伪造 ID、旧包、旧 epoch、非当前 iframe、合成授权请求被拒绝；AI Proxy 不能 STOP 其他工具拥有的代理 | 现有 SDK/Host 的授权和 ownership 负例 + 本项目交互；旧 `service.test.ts`、`proxy-lifecycle.spec.ts`；不测试性修改日常代理 |
| K5 认证与隐私 | 凭据只在可信 session；仅服务于已确认 active route 的精确代理 host/port/scheme，普通站点 401、任意 PAC 代理、撤权/换端点后请求不能拿到凭据；尝试次数有界 | 认证/存储与竞态测试；旧 `auth.test.ts`。导出、日志、preview、包、截图无真实密码/Token |
| K6 生命周期与 unknown | 关闭/重开工具不中断已明确应用的路由；SW 恢复依合法安装/授权对账；STOP、停用/卸载后旧配置不复活；清理失败和副作用 unknown 可见且不自动重放；重启后需会话凭据时明确要求重新输入 | 服务状态机 + 受影响 Chrome 生命周期；旧 `proxy-restart.spec.ts`、`proxy-lifecycle.spec.ts`；不清除其他工具/扩展状态 |
| K7 数据与导入 | 原 schemaVersion 2 的非秘密端点/配置/规则可显式迁入；坏 JSON/非法引用原子拒绝；导入不应用、不启用统计；导出无密码和订阅 Token；现有旧扩展数据完整 | 模型/导入 UI；旧 `backup-import.test.ts`、`options-backup-rules.spec.ts`；跨 ID 不直接读 Profile |
| K8 订阅与联网 | 列表→详情→编辑/删除/返回正确；只保存非秘密元数据；识别支持与不支持节点；解析/下载/保存不触发 APPLY；自动同步不可假报；Origin、重定向、私网/本机例外与取消按原安全合同 | 项目解析/下载/详情行为；旧 `subscription-{parser,security,download}.test.ts`、`subscription-ui.spec.ts`；第三方 WAN 未测单独标注 |
| K9 诊断/统计 | 取消诊断后无迟到结果污染；HTTP 成功与模型可用分开；统计需用户选择，停用/撤权后停止采集，忽略/清空有效，无痕及完整敏感 URL 不记录 | 旧 `diagnostics-engine.test.ts`、`usage-{collector,state}.test.ts`、`usage-privacy.spec.ts`；Mock 与真实网站证据分开 |
| K10 官方与轮换边界 | 无配置/离线/未登录/无权益时显示真实状态；OAuth callback/state/过期校验保留；不自动支付、登录、运行采集或轮换全局代理；生产不混入演示链接和套餐 | 旧 `official-{provider,runtime}.test.ts`、`rotation-plan.test.ts`、`build-release-boundary.test.ts`；真实账号/支付为单独授权的外部操作 |
| K11 UI 与执行世界 | 关键操作、设置往返、键盘/焦点、未保存保护、三语和已支持主题可用；遵守唯一 OpenDesk 标题/导航和 Tokens；沙箱代码不能访问 `chrome.*`；旧 HTML/Vue/其他工具不受新增接线影响 | 只测当前交互与受影响安全边界，复用既有组件/DOM 测试；默认不跑宽度/缩放专项或全仓回归 |
| K12 preview | 历史副本与来源 SHA 相同；新 preview 使用正式 UI 字节与原共享壳，SDK 边界为模拟；核心动作、取消/返回、空态、失败、拒绝/撤权可操作；无真实网络/代理/Native/正式存储写入 | 历史静态核对不替代当前 0.2.0 预览交互证据，结果由 leader 补充。不能把 `build-preview --tool ai-proxy` 当作已支持命令 |
| K13 包/身份/交付 | 原打包器生成忽略目录候选→相关检查→同源晋升→`--check-project`；仅一个正式 JSON，ID/版本/来源一致；测试、Mock、preview、凭据不混入执行内容；固定特权代码不来自动态包 | 有实际源码/交付需求后执行；`projects/` 不假定已被 `app:update` 支持，采用原实际路径参数入口。真实安装审阅与包检查分开 |

迁移完成不能仅靠 Node/Mock PASS。至少为用户当前核心链提供同候选的实际 Chrome 结果，记录扩展真实 ID/路径、运行模式、源码/包 SHA、核心操作与受控网关证据；未做的安装、WAN、OAuth、支付、重启和正式验收仍分别为 `NOT_TESTED`。代理核心缺口未解决时不得宣称“原扩展已完整迁移”。

## 5. 当前预览与历史来源

- 原单文件：`/Users/shopme/Documents/workspace/ai-proxy/prototypes/browser-extension/ai-proxy-extension-preview.html`。
- 本项目保留：[preview/legacy-ai-proxy.html](preview/legacy-ai-proxy.html)。保留原始字节，其 SHA-256 为 `dadd797a809daca0254013c36f8ffb09f7ef5dcb4638b0d7d604d9337df2f027`，385,487 bytes。
- 这是旧独立扩展的交互模拟，包含 Side Panel 与 Options 场景；不是 OpenDesk 壳，也不证明它与旧工作树全部最新 React 页面一致。原 CSP 禁止网络连接；公开跳转链接仍属于历史交互，不作为本阶段真实访问授权。
- 当前 0.2.0 预览入口：[preview/index.html](preview/index.html)，应用入口为 `src/App.jsx`，复用 `src/QuickPanel.tsx` 与 `src/Settings.tsx` 的界面结构。诊断与统计为模拟，无真实网络、浏览器代理变更或浏览行为采集；不能替代真实可信挂载证据。legacy 副本继续保留。
- 当前同源预览命令（仓库根目录）：`node projects/ai-proxy/scripts/stage-preview.mjs --serve`，地址 `http://127.0.0.1:43263/ai-proxy-preview`。先核对是否已有该服务，不能重复启动。省略 `--serve` 生成 `.opendesk-preview/` 内离线快照；该入口直接编译 UI 源码，不以 Browser 构建、官方安装或正式 JSON 为前置。不依赖预先生成的 `dist/`。原版实际 React/CSS 对照先运行 `node projects/ai-proxy/scripts/reference-preview.mjs`，再打开 [preview/compare.html](preview/compare.html)。原仓库不写入、不安装依赖、不运行其构建。
- 现有公共 preview 生成器按已验证工具白名单工作，不能仅新增本目录就假报支持。若当前入口不足，先用项目自有 preview（可参考其他项目实际入口），必要的公共适配另按 owner 协调；不覆盖正在并行修改的 preview 脚本。

## 6. 当前完成条件与明确延期

当前完成条件：原版与迁移版的侧栏主界面、添加代理和设置往返已逐屏对照并修复明显偏差；同源 Preview 可交互；接着通过已有「开发 → 本地项目 → 在侧栏调试」运行同一 UI，记录实际入口与最小验证。真实代理及平台能力缺口分开记录，不能挤占原型阶段。0.2.0 源码/预览不等于安装或真实代理通过；现有正式包不可未经同源核实即交付。F1–F10、K1–K13 未完成项继续保留。

实施时仅因需要当前产物证据才编译。Browser 本体复用已有 `npm run dev`、`dist/development`，涉及真实运行时重新核对加载 ID、路径、serve 客户端连接与指纹；运行模式与连接事实由 leader 记录，本次文档修订不启动或切换环境。不得复用旧项目的 `.output/chrome-mv3*` 作为当前 OpenDesk 安装目录。

延期：PC 自适应、原仓库全量验收/评分、95+、production 发布、跨浏览器矩阵、宽度×缩放、长时间压力/变异测试、手机/桌面客户端及服务端部署、自动爬虫、真实购买，以及无关工具/通用 UI 重构。不删除旧证据，不继承旧分数；仅当前核心链确需的依赖和安全保护随实施验证。

## 7. 来源、改造与当前能力

历史 G0 仅完成来源准备。原始文件指纹与 dirty 记录见 [migration-source.json](migration-source.json)，UI 复用及改造状态见 [evidence/ui-reuse-source.json](evidence/ui-reuse-source.json)。来源 SHA 只标识迁移前字节，不证明当前目标文件未修改，也不是运行通过证据。

2026-10-31 已将原四份样式（`style.css`、`options.css`、`sidepanel-r86.css`、`rotation-entry.css`）保留在 `src/styles/`，仅将根选择器限定到 `.proxy-app`。`src/style.css` 做 Tokens 颜色、宿主容器、内部确认框及原布局恢复：限制共享 Button 的 flex/gap 默认值，清除共享 textarea 的额外 margin；原 52px 模式按钮、列表密度、添加字段顺序、设置单行导航和底部入口保留。OpenDesk 工具栏替代原品牌页头；设置返回键占原品牌位置。Shared Button 的表单按钮显式声明 submit，App 在既有禁原生表单导航的沙箱内做本地提交事件适配，保留字段校验与 IME Enter 保护，不增加 allow-forms 或联网权限。

| 范围 | 当前边界与状态 |
| --- | --- |
| 源码 / 预览 | 当前 0.2.0；保留原页面与配置需求，不能宣称所有真实能力完成 |
| 真实代理接线范围 | 仅规则模式，默认 DIRECT；1–16 条包含子域的域名规则，共用同一个 HTTPS/SOCKS5 公网 DNS 节点。真实挂载与路由 `NOT_TESTED` |
| 尚未接入 | 全局代理、本地客户端、认证、任意 PAC、订阅下载、真实网络探测、统计采集及采集/轮换执行；保留需求与真实未接入提示 |
| 诊断 / 统计 | 预览模拟；没有真实 HTTP 成功或浏览采集证据，模拟结果不证明连通性、模型能力或流量统计 |
| 安装包 | 旧 0.1.1 正式包已过期，不可交付；0.2.0 新包身份、晋升及安装结果由 leader 补充 |
| 可信挂载 | 未完成的历史候选，本阶段停止推进；不将源码接线等同于真实 Chrome PASS |
| 延期 | PC 自适应及第 6 节范围；F1–F10、K1–K13 不删减，未完成项继续跟踪 |

## 8. 最终证据归属

当前结果见 [UI 原型与开发入口证据](evidence/ui-prototype-20261031.json)。39 个相关 Node 用例与 8 项纯内存浏览器行为检查通过；四态几何、七区真实内容/控件及滚动检查通过。截图脚本仍只输出 `EVIDENCE_GENERATED_VISUAL_NOT_REVIEWED`，视觉结论来自另一次实际看图复核，不能由生成成功自动推导。独立复核发现的备份区 20px 间距、对照壳路由错配与不可见临时标记均已修正并重取证。原生截图和 AX 回执证明当前 UI、隔离保存及同一宿主的更新/恢复；不证明真实代理。

`evidence/verification.json`、旧阶段截图及 [被撤销结论的原记录](evidence/ui-prototype-20261031-superseded.json)保留历史身份。`trusted/source-lock.json` 与正式 JSON 未因本轮开发晋升或重新批准，不交付为当前 UI 包。

## 9. 当前本地开发入口与实测结果（2026-10-31）

复用项目编译 watcher（PID 56445）和原 stage watcher（PID 51896）；Browser writer（PID 63479）保持原样。本轮未创建第二个 Browser writer、覆盖 `dist/development` 或修改平台/可信 portal。Preview 服务保留在 43263。PID 是本轮观察，继续工作时重查，不按数字盲目停止。

实际日常 Chrome 扩展 ID `ccfcjegpkdlgbclopjmadlcjedelidmf`，本轮从扩展详情核对加载路径为仓库 `dist/development`。运行模式为持续开发；实际「调试 → 本地开发服务」显示「开发服务已连接」，观察到 revision `b4e1cef46a1f901e60d613137db8da993cb2267e91c9b0c571978c35382064e2`。最新 `opendesk browser doctor` 返回 `nativeConnected=true`，Native manifest 的 `allowed_origins` 与该 ID 一致。旧 PID 94442、旧 revision、旧 ERR_FILE_NOT_FOUND/E_NATIVE_NOT_READY 仅是历史，不能覆盖本轮实际成功操作，也不能作为未来服务仍在的保证。

原目录连接命令为 `opendesk browser dev .`（在本目录执行；已有连接时不重复）。本轮 source 为 `source-405c778e3b76b8d2d18b971d`，workspace 为 `workspace-77a73569-fd83-039c-ba2b-30e2e0864f50`。通过「开发 → 本地项目 → 独立本地项目 → 在侧栏调试」运行 v0.2.0 的隔离沙箱 UI，添加并保存 `native-ui.example.com:8443`，看到“还未应用到 Chrome”，随后设置返回及七区实际内容均正常呈现。没有点击应用、停止管理、重试或探测；代理状态失败/无法确认保持真实。

同一 `hostInstanceId=1ef62db8-52a2-4cfe-a58c-797717e42488` 中，沙箱入口 `src/main.jsx` 的临时顶部标记通过现有 watcher 出现在侧栏，恢复后消失，已保存配置保留。源码逐字节恢复 SHA `09fa1358fb26b5b3c38534c480924c0ba0a55cf96f8ba11493eee4440e39f65a`。首个 fixed 标记未能在截图中辨认，已明确否定该图的视觉证明并改用可见顶部标记。草稿 dirty 时新快照等待；来源变化后的旧草稿保存被 `E_PREVIEW_GRANT` 拒绝，字段保留，继续编辑不丢失；只有明确放弃测试草稿后才更新，没有自动重放。共享 App/QuickPanel 仍被已有可信 Browser portal 引用，早期组件改动曾伴随 Browser 重载；本轮入口更新证明不等于所有组件都原地 HMR。

最终恢复的不可变 stage SHA 为 `91fdcffbe86866647c41e87d30f9644cb1a095882262e33480bc43f54f5e54ed`，状态 `STAGED_NOT_INSTALLED`。JS 与 `dist/tool.js` 相同，CSS 与原公共 `compileSharedToolCss(dist/tool.css)` 的结果相同（CSS SHA `29f8421927841b8699b397dd6f43f86e215d5b135d1e32284913e7fdcd351a26`）。编译回执核对全部 53 个输入及四份原样式；浏览器 Preview 的 62 个输入、离线快照的 63 个输入均与当前文件一致。离线 HTML SHA `30215d7106c9df761cb7bfd058fcaa0415c206554716f7cbfe3d0c9bcb91abc5`，位置记录在 evidence 中。原项目 45 个文件指纹重新核对未变。

本轮只清理自己的临时调试与 `opendesk browser dev` CLI（正常 exit 0），释放该命令的目录授权；上述 watcher/Preview/其他会话服务保留。源码和证据留在 `main`，未提交、未建分支/worktree/PR，未晋升正式 JSON。

定向复验（仅相关改动或新失败触发，不因命令存在重复执行）：

```sh
node --test projects/ai-proxy/tests/use-proxy-errors.test.mjs projects/ai-proxy/tests/environment-confirm.test.mjs projects/ai-proxy/tests/drafts.test.mjs projects/ai-proxy/tests/navigation.test.mjs projects/ai-proxy/tests/form-submit.test.mjs projects/ai-proxy/tests/settings-credentials.test.mjs
# 已启动同源 Preview 和生成原版对照后；复用可用 Playwright/Chromium，不新增项目依赖
PLAYWRIGHT_MODULE=/absolute/path/to/playwright CHROME_BIN=/absolute/path/to/chromium node projects/ai-proxy/scripts/preview-browser.mjs
```

浏览器证据默认输出到忽略的 `artifacts/ai-proxy/ui-correction-20261031/`；本轮最终结果在其 `final/`。该脚本仅操作纯内存 Preview，不能作为 Native/代理路由验收。

收尾发现的限制：日常 Chrome 的在线对照容器 iframe 停留在 about:blank（新标签亦然），服务端端点均 HTTP 200，原因未分类；一次显式初始 src 诊断未解决，已撤回。独立 [同源 Preview](http://127.0.0.1:43263/ai-proxy-preview) 在日常 Chrome 已确认实际呈现，保留为交互入口；公平四态/七区完整对照以现有 CFT155 的截图和独立复核为证，不把日常容器异常写成 PASS。本轮未扩大为浏览器版本矩阵或修改平台/CSP。

## 10. 本轮 UI 阶段条件（2026-10-31；独立于长期 K1–K13）

旧证据结论保全：[被否定的原记录](evidence/ui-prototype-20261031-superseded.json)。其 PASS/COMPLETE 仅为历史错误判断，不再证明视觉通过。当前有效结果只看 evidence/ui-prototype-20261031.json 的 currentUiReview。

| 当前条件 | 完成要求 | 本轮结果 |
| --- | --- | --- |
| UI-K1 | 原工作树实际 React/CSS；同数据、语言、路由、状态、默认缩放。完整应用内容等高比较，宿主另列，不裁切/缩放/平移隐藏差异；旧明显差异截图判不通过，截图仅记生成成功。 | 通过；完整等高视口，正确路由 CSS，旧错误结论撤销。 |
| UI-K2 | 空态/已配置逐屏比较结构、字体、间距、控件、四模式、列表、网站、说明、底部与滚动；明显差异有修复或具体说明。 | 通过；品牌页头由宿主替代，主内容上移 48.484px，Tokens 与模拟文案差异有明确记录。 |
| UI-K3 | 添加页布局/字段/高级设置/保存返回；有效、非法、取消、Enter与IME保护；只保存隔离配置。 | 当前范围通过；非法/取消/保存/Enter/合成 composition 保护验证。原生 OS IME `NOT_TESTED`。 |
| UI-K4 | 七区真实内容、首屏密度、分组、内部滚动、往返、草稿继续/放弃及焦点恢复。 | 当前范围通过；七区真实内容/控件/滚动和草稿焦点验证；原生已打开七区，非全量原生视觉验收。 |
| UI-K5 | Preview仅模拟SDK边界；应用源/样式/构建快照对应；真实本地项目关键页面/操作一致，记录入口、SHA与截图。 | 当前 UI 通过；源码/公共 CSS/快照对应，真实侧栏操作与截图。真实代理未测。 |
| UI-K6 | 复用编译/stage watcher；同会话新UI与临时标记恢复、数据保留；四份CSS回执及草稿替换保护不退化。 | 当前范围通过；同宿主可见入口标记及恢复、配置保留、来源失效拒写和草稿替换保护。 |
| UI-K7 | sandbox/CSP/form-action/来源身份/权限撤权不放宽；无真实代理操作/联网探测/正式数据导入；unknown如实保留。 | 受影响范围通过；无安全放宽、真实代理操作、联网探测或正式数据写入，unknown 保留。 |

本轮上述条件已在当前 UI 范围内完成，独立复核与原生回执见 currentUiReview。真实代理集成和长期 K1–K13 仍未完成；不自动进入正式包、production、全量验收或评分。后续出现新差异时重开对应条件，不能以行为 PASS 覆盖视觉失败。

## 11. 管理设置侧栏优化（2026-10-31）

本节记录本次用户明确要求的 Preview 优化及独立评分，范围独立于第 12 节并行 owner 的真实扩展核心开发；不改变其优先级、服务实现或真实代理验证边界。

本轮设计输入是当前同源 Preview 与用户对旧 PC 设置质量的明确反馈。唯一 owner 仍为本项目，UI 为 React + Shared Button + Tokens；复用现有 43263 服务与内存 SDK，无新依赖、框架修改或安装包发布。

设计决定：设置工具栏固定提供返回、原生七栏目选择与刷新/复制；单层内容使用 12px gutter。代理配置先显示添加与已保存代理，低频入口折叠到“其他添加方式”，路由选择与明确应用保留在其后。取消和危险确认沿用现有 dialog；原 navigation guard 继续保护未保存表单。七区表单/列表统一单列与紧凑分组，重要正文不小于12px，标题16–18px。简中、English、繁中同语义。

取舍：横向七 Tab 会隐藏后半入口；全量两排按钮会持续占据编辑空间。因此采用系统原生 select 显示当前栏目并提供全部七项，保留键盘可访问性。没有把设置业务搬到宿主，没有变更保存、权限、数据或代理语义。

执行计划（solo 实施，独立 designer/reviewer）：

- [x] 记录七区默认预览基线，补一条真实浏览器导航/草稿行为回归；不增加样式字符串断言。
- [x] 调整 Settings / OptionsShell、项目内侧栏适配 CSS 与新增三语文案；保留各业务处理器和已有 ID。
- [x] 用现有预览服务验证七区、添加/编辑/取消、草稿切换、删除确认/焦点、键盘和语言；运行受影响 navigation/draft/form/credentials 检查。此检查证明本轮重排没有改变提交和授权边界。
- [x] 看图后记录 visual verdict，再由独立专家检查同候选截图、行为证据与源码；低于目标则定向修复并重新取证。记录当前输入 SHA；真实 Native/代理/正式包仍 NOT_TESTED。

固定量表（实现前冻结）：布局与密度、信息层级与可发现性、视觉与可读性、操作/草稿/反馈、键盘与焦点、组件复用与边界，每维100分。每维五项各20分：布局为单gutter/无横溢/列表可达/表单自然流/无嵌套壳；层级为七区完整/当前栏目/添加优先/低频渐进/返回明确；视觉为字号/间距/色彩token/控件一致/长文换行；操作为保存不应用/非法拒绝/取消不写/草稿防丢/删除确认；键盘为栏目选择/字段操作/可见焦点/Escape/返回焦点；边界为同源输入/Shared UI/仅内存/无外网及权限变化/证据分级。每维≥95且无阻断项才称该预览评审达标，缺证据写 NOT_TESTED，不用平均分补齐。独立 reviewer 自主评分，不预设通过。

最终结果：同源 Settings Preview 达标；[打开管理设置预览](http://127.0.0.1:43263/ai-proxy-preview?view=settings)。独立评审绑定 `artifacts/ai-proxy/settings-refinement/review-8/report.json` 与63个输入 SHA，完整记录见 [本轮评分与证据](evidence/settings-preview-review-20261031.json)。

| 固定维度 | 独立 UX | 独立代码评审 |
| --- | ---: | ---: |
| 布局与密度 | 98 | 100 |
| 信息层级与可发现性 | 97 | 100 |
| 视觉与可读性 | 98 | 100 |
| 操作／草稿／反馈 | 99 | 100 |
| 键盘与焦点 | 100 | 100 |
| 组件复用与边界 | 100 | 100 |

23组真实浏览器预览操作及40项定向 Node 通过；代码 reviewer 独立重跑40项。修复了规则/PAC替换、代理隐式关闭、无效/迟到文件读取、模板确认、删除回执及主机快捷确认的草稿丢失路径。保存仍不应用，认证仍明确拒写。两位评审均无剩余阻断；认证展开较长、泛化确认文案和原生文件控件跟随浏览器语言属于轻微保留意见。本轮不代表真实代理、安装、正式包或 production 验收，完整类型/LSP诊断未执行。

## 12. 真实扩展开发目标与关键测试条件（2026-10-31）

本轮已创建 Codex goal：沿 `main.jsx → environment.ts → service.ts` 完善真实 Sidebar 扩展的配置保存、回读、规则/选择和有限公开 SDK 接线。当前完成范围是实际配置操作与应用侧状态机；完整代理迁移仍有下表未验证项。第 11 节 UI 评分与长期 K1–K13 不作为本轮前置条件。所有业务修改在 `main` 的本目录，原工作树只读，共享框架与其他产品不改。

| 条件 | 本轮要求 | 实际结果及边界 |
| --- | --- | --- |
| T1 真实入口与同源 | 从原本地项目入口打开实际源码；不以 HTML 原型或隐式 Preview 全局替代 | **SOURCE_WIRED / NATIVE_CONFIG_PASS**。真实沙箱打开、添加、保存、重开；独立 preview 才能显式注入内存适配器。Chrome 实际扩展 ID 为 `ccfcjegpkdlgbclopjmadlcjedelidmf`，加载 `dist/development`，与 Native manifest 配对；未重载扩展。当前 Browser serve 连接未再次确认，不把加载路径当作 serve 证明。 |
| T2 配置与草稿 | 校验、保存、取消、规则/选择重开保留；保存不应用；ETag、额度、迟到、unknown 不误报或重放 | **NODE_PASS / NATIVE_SESSION_PASS**。真实添加 `core-config.example.com:8443`、保存规则 `core-target.example.com + 子域 → core-config`，关闭调试重开仍保留规则与所选代理，明确显示未应用。修复写后回读的 JSON 字段重排误报冲突；真正内容变化仍拒绝，不重写。8 KiB 额度、坏端口/引用、缺失读值、取消/异步草稿保护有定向覆盖。正式安装数据及浏览器重启持久化 **NOT_TESTED**。 |
| T3 合法 SDK 与真实状态 | 使用唯一公开参数；明确手势应用；权限/控制权/错误码真实，拒绝不冒充应用 | **SOURCE_WIRED / NODE_PASS**：移除内部 `sourceId` 对公开参数的污染，仅发送 HTTPS/SOCKS5 节点与 1–16 条含子域规则。四模式完整语义、认证、PAC、多目标等不能表达时明确拒绝，不降级。真实只读 `getStatus` 返回 **E_TOOL**，权限未确认、控制权 unknown、未应用；本地开发不借正式安装身份。E_TOOL 底层原因未独立分类，**SDK_GAP_NOT_PROVEN**，不是已证实平台缺陷或已证实权限拒绝。 |
| T4 真实流量 | 仅独占隔离 Profile、合法安装审阅及受控网关可测标签页路由、默认直连和 STOP | **NOT_TESTED**。本轮没有专属测试环境/网关；未对日常 Chrome 执行 Enable/Disable、代理探测、流量测试或抢占控制权。Node SDK fixture 不证明实际路由。 |
| T5 生命周期与所有权 | dispose、草稿确认、迟到、撤权/来源变化不续写；STOP 只能释放已确认自有控制 | **NODE_PASS**，43 项服务测试含关闭期间 load/save/status/apply/stop 的成功/失败竞态、unknown 不重放及自有 canStop。真实旧来源失效时拒绝继续，未保存内容挡住快照替换，应用内放弃草稿后才更新。真实安装撤权/卸载与 SW 恢复 **NOT_TESTED**。 |
| T6 UI、三语与秘密 | 保留四模式入口、七区、原业务数据/草稿；错误只显示安全代码和本地化说明 | **受影响范围 NODE_PASS**：真实 Status 三语、权限 true/false/null 分离、原始错误细节隐藏；导航、表单、凭据拒绝及草稿测试通过。设置区继续由现有 UI owner 并行迭代，本任务不恢复评分或重设计。原生 OS IME、全七区最终视觉、订阅联网/OAuth/支付/统计采集 **NOT_TESTED**；未调用这些外部功能。 |
| T7 编译与交付 | 复用 watcher，校验来源/JS/CSS/不可变候选；不冒充正式包 | **BUILD_RECEIPT_PASS / STAGED_NOT_INSTALLED**，准确 buildId/SHA/源码指纹见[本轮证据](evidence/extension-core-20261031.json)。原生配置验证的 `409c3f591de5…` 与稍后 UI 更新生成的快照分别记录，不把旧原生证据套到新包。唯一正式 JSON 未晋升，未安装、发布或提交。 |

当前操作：按本文件开头命令连接，然后「开发 → 本地项目 → 独立本地项目 → 在侧栏调试」；添加/保存/规则/选择可用，保存不会自动应用。临时 CLI 连接已正常退出，本任务的侧栏调试已停止；原 Vite、stage 和 43263 Preview 服务保留。开发 session 数据不是正式安装数据。

修复集中在真实边界和服务：存储严格读值/ETag/额度/写后语义回读，公开参数精确映射，关闭后异步保护，自有 STOP，unknown 与实际权限/控制权分离，安全三语错误和只读状态重试。没有引入依赖、第二套 Host/Registry、特权后台或替代安装器；历史 `adapter.js` 精简键不与当前 full-config 键自动合并。

最后一轮定向检查 **94/94 PASS**，证明上述受影响行为；没有运行根全量测试或重新覆盖任何 watcher 输出：

```sh
node --test projects/ai-proxy/tests/environment-runtime.test.mjs projects/ai-proxy/tests/service.test.mjs projects/ai-proxy/tests/status-runtime.test.mjs projects/ai-proxy/tests/environment-confirm.test.mjs projects/ai-proxy/tests/drafts.test.mjs projects/ai-proxy/tests/use-proxy-errors.test.mjs projects/ai-proxy/tests/navigation.test.mjs projects/ai-proxy/tests/form-submit.test.mjs projects/ai-proxy/tests/settings-credentials.test.mjs
```

项目未提供 `node_modules/.bin/tsc`，未安装新编译器或声称全项目类型检查通过；现有 Vite/esbuild 编译与实际边界测试提供本轮语法/构建证据。后续真实代理操作先取得独占隔离 Profile、合法安装权限与受控 HTTPS/SOCKS5 网关，再取证一次明确应用→目标标签页请求→明确 STOP；不把日常开发入口的 E_TOOL 自动升级为平台改造授权。认证/PAC/完整四模式、正式 JSON/安装发布、production、完整 CI、独立 ≥95 及宽度/缩放矩阵继续延期。

## 13. 当前网站、规则编辑与返回路径（2026-10-31 最新任务）

用户明确要求继续修改实际扩展，并对本轮 UI 与实现分别独立评分；本节覆盖第 12 节关于这部分评分延期的描述。唯一 owner 仍为本项目，复用 React、Shared Button、Tokens 和现有编译/stage/Preview watcher，没有修改 Browser Framework 或原 AI Proxy 工作树。

当前网站改用公开 `currentPage.info`，只在内存保留 HTTP(S) 主机名；标题、路径和查询参数不进入规则。真实网页、内存示例和不可读取状态明确区分。浏览器已确认设置与待应用选择分别显示，不将路由配置当作该网站流量或可达性证明。

规则快捷入口打开独立表单：带入当前网站或完整命中规则，保留规则 ID、目标、启用状态、子域范围和优先级；重复规则拒绝覆盖。返回保护未保存输入，显式取消仅清理本表单，返回恢复滚动和入口焦点。设置内按钮命名为「← 代理面板」，外层预览按钮命名为「← 扩展列表」；两层目的地与重开行为均保留，未用隐藏按钮规避问题。

独立代码评审发现并修正了两项额外缺陷：快捷编辑优先级 500 曾被降到 100；旧路由有效时，新配置曾没有明确应用入口。现在 `runtime.pendingChanges` 按路由语义独立比较已确认配置，保存不应用，旧路由与待应用状态同时保留。停止已确认但配置收尾失败时，只重试存储收尾，不重放 Disable；损坏的非数组配置拒绝写回。

同候选证据与逐维评分在 [本轮评审记录](evidence/ui-paths-review-20261031.json)。原生快照 `a5b62aa0e3b064273d40089612e621fa9cc667ab28462c5524db43726942bdff`，buildId `2a788384-022b-432c-a0c5-11da2611029b`，55 项源码、2 项构建产物哈希无漂移。真实侧栏已验证普通网页识别、表单带入、草稿返回/取消、管理全部及焦点恢复；隔离规则 `ui-paths.example.net → DIRECT` 不含子域，最终候选编辑回读与保存明确显示尚未改变 Chrome。该规则留在开发隔离数据中，原有两条代理配置与规则保留。

本轮相关基线 **122/122 PASS**，最后两处文案修改后的受影响 Status/QuickPanel 真实组件检查另 **6/6 PASS**，覆盖优先级、路由差异、存储、生命周期、当前页、规则身份、草稿、导航、真实组件反馈及提交行为；三语 994 个键一致。内存 Preview 验证运行中编辑保存后出现「待应用／应用选择」，切到待应用直连不会冒充已切换。真实只读代理状态仍为 `E_TOOL / unknown`，底层原因未分类；真实 Enable/Disable、流量、完整类型诊断、原生 OS IME、正式安装、production 与尺寸矩阵均未因此宣称通过。

最终两条反馈文案按真实状态修正：规则保存后提示返回面板按当前状态「启用或应用选择」；真实 `E_TOOL / unknown` 不再归咎配置，明确可重试读取、可编辑保存且不会切换线路。同候选原始 AX、截图及返回焦点结果见评审记录；完整类型诊断仍 NOT_TESTED，不以语法构建替代。

本轮临时 Native CLI 已 Ctrl+C 正常退出（exit0），侧栏调试已停止且无未保存草稿。原 43263 Preview 保留；发现已退出的项目 Vite/stage watcher 后恢复其原链路并保留运行，没有覆盖 Browser 的 `dist/development` 或停止其他会话服务。

最终独立开发评审：UI 六维及实现六维**各项 ≥95**，无剩余阻断；不是平均分或第 11 节旧评分。两位评审绑定本节同候选 SHA，分别只读复核；代码 reviewer 还独立重跑最后 6 项受影响测试。

| UI 维度 | Cicero | 实现维度 | Curie |
| --- | ---: | --- | ---: |
| 布局与密度 | 98 | 正确性 | 96 |
| 信息层级与可发现性 | 98 | 可靠性 | 96 |
| 视觉与可读性 | 96 | 安全 | 96 |
| 操作／草稿／反馈 | 98 | 可维护性 | 95 |
| 键盘与焦点 | 97 | 用户反馈 | 96 |
| 组件复用与边界 | 98 | 证据充分性 | 95 |

实现评审结论保留 **COMMENT**：完整类型诊断未执行，不签正式 APPROVE；本轮开发范围六维达标不等于发布或真实代理验收。维护性保留项是两处规则保存校验与线路签名手工字段投影，目前无已证实功能缺陷，不为分数另起重构。后续更改规则/路由合同时同步入口与相关回归。当前可操作入口：[同源内存 Preview](http://127.0.0.1:43263/ai-proxy-preview)；实际 Chrome 本地项目按开发页原入口重开，正式安装未执行。

## 14. 0.3.0 安装交付与实际完成情况（2026-10-31）

用户本次明确要求核对旧对话完成情况、更新版本、编译 JSON 放回目录并安装测试；因此本节覆盖上述“正式包/安装延期”和旧包不可交付状态。旧对话 `01a18e57-16a0-77f3-b766-9380a00fbfed` 的最终答复已实读：当前网站、规则、管理与返回优化已完成，正式包/安装与真实流量未完成；历史开发评分没有作为本次安装证据。

唯一正式文件为 [ai-proxy.opendesk-tool.json](ai-proxy.opendesk-tool.json)，版本 **0.3.0**，**908680 字节**，SHA-256：

`1b0450872b6bce1878b047f7410296360e93907f67fae93a2aaeb42d1b8cac81`

本次只更新 `tool.config.json` / `package.json` 的版本，保留既有业务实现。按现有 Vite 生成 IIFE/CSS 后，使用唯一打包器生成临时候选；139 项项目内配置/规则/草稿/导航/生命周期/错误反馈检查及 6 项包身份、来源路径、晋升与版本保护检查通过后，以 `--promote-from` 晋升。`--check-project` 返回 `PROJECT_PACKAGE_MATCH`。构建回执为 `c26cdaf3-02fb-4d78-bccd-c19827ce00a9`，绑定 55 项源码；没有重建 Browser 本体、创建新分支/worktree 或修改原 AI Proxy 仓库。

真实 Chrome 从「扩展 → 筛选和管理 → 导入扩展」选择上述文件，核对版本、三项能力及同一 SHA 后点击确认安装。原生标题为 `AI Proxy · v0.3.0`，运行在已有 Sidebar Tool 沙箱。Chrome 实际扩展 ID 为 `ccfcjegpkdlgbclopjmadlcjedelidmf`，加载目录为本仓库 `dist/development`；调试页在安装前显示开发服务已连接，revision 为 `f1f15cda72f98fd203954d510e179134687ea2304e2131016090305cf8384269`。这是开发环境的本地包安装验证，不是 production 或官方市场发布。

| 真实用户操作 | 本次结果 |
| --- | --- |
| 导入、确认安装、从已安装列表打开 | PASS；版本与规范包摘要匹配 |
| 添加 HTTPS 配置并「保存并选择」 | PASS；回执明确“还未应用到 Chrome” |
| 读取当前普通网页 | PASS；`example.com`，仅用主机名进入规则 |
| 规则编辑带入、改草稿、返回并取消离开 | PASS；修改后的草稿保留 |
| 保存 `example.com + 子域 → DIRECT` | PASS；优先级 100，保存不切换线路 |
| 管理全部、七区入口、内外返回 | PASS；七区只核对入口，不冒充每区完整实测 |
| 关闭工具并重开、再进入规则页 | PASS；正式安装数据中的代理、选择与规则均读回 |
| 安装身份下只读代理状态 | PASS；权限已获准，`controllable_by_this_extension`，尚未接管；Chrome 模式仍显示未知 |

旧本地调试 `E_TOOL` 本次在正式安装身份下未复现；不能据此推断所有环境原因已修复。一次编辑后的外层退出显示了未保存提示，明确放弃本次测试草稿后已保存数据仍在；新开干净会话的内外返回无需提示，尚不据混合会话推断源码缺陷。

测试未点击「启用/应用选择/停止管理」，没有改动日常 Chrome 代理或新增 Chrome 权限。占位配置 `install-check.example.net:8443` 及上述 DIRECT 规则是本次测试数据，未填凭据、未作为真实网关使用；清理时同一侧栏被另一项“网页笔记”更新审阅占用，保留该审阅，没有取消或代为批准。测试数据暂保留，不能将占位配置作为可用线路启用。

**完成范围：版本、同源安装包、真实安装与配置核心操作已完成；完整代理迁移未完成。** 当前公共 SDK 只支持有限 HTTPS/SOCKS5 单节点域名路由。认证、任意 PAC、完整四模式实际应用、订阅联网等仍未完整接入；真实启停/目标流量、production、完整类型诊断、全 CI、OS IME 与尺寸/缩放矩阵未测试。安装包不包含可动态替换的可信后台，不通过版本变化放宽历史 trusted 准入。

结构化证据：[install-0.3.0-20261031.json](evidence/install-0.3.0-20261031.json)。原始安装审阅/保存/草稿/重开 AX 记录在忽略目录 `artifacts/ai-proxy/install-0.3.0-20261031/`；它们仅是本机原始证据，不作为另一份发行包提交。

宿主依赖边界：本次包为约 909 KB，使用当前工作树及已加载宿主的 2 MiB 包预算。任务开始时的 `HEAD` 仍为 320 KB 包/220000 字符 JS；对应公共容量、安装器合同、官方目录和历史 trusted 接线存在并行未提交改动，本轮保留原 owner，不将其夹入项目提交。本次“源码同源/实际安装通过”仅对应上述运行环境，不证明仅检出本项目提交的旧宿主就可导入或构建全部发行资源；公开发布前须由平台 owner 完成这些依赖的提交与对应验证。
