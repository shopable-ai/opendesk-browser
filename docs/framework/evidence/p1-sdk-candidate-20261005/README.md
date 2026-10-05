# P1 SDK 候选交付：精确目标授权、工具入口与真实 HTTP 回归

**结论：P1 候选实现已完成，原生验收待完成。**

本页是本次 P1.2 / P1.3 / P1.4 的聚焦交付入口，不取代历史 P1.1 证据，不是新的 checker 或权限账本。

## 版本与范围

| 项目 | 实际值 |
| --- | --- |
| 本轮起点 | `426409791a35acb6a6e5eb3f6fcc8b0600f562b5` |
| 本轮源码提交 | `01b48dcb49b31844d30c0e6fdeed1756e5046f11` |
| 已验证源码树 | `8ea3d1d352b41bb75b994f03a03d545993f5295e` |
| 唯一候选分支 | `codex/p1-2-sdk-target-origins-20261004` |
| 复用草稿 PR | [#2](https://github.com/shopable-ai/opendesk-browser/pull/2)，base=`main` |
| 本轮观察的 main | `bb2038f992b1ad79311fc8436433a655f76ff735`，未修改、未合并 |
| 起点比较 | 相对当时 main，ahead 9 / behind 9；不是合并后的 main 验证 |
| 独立 CI | [37298483285](https://github.com/shopable-ai/opendesk-browser/actions/runs/37298483285)，上述源码 SHA，completed / success |

后续仅增加本目录的交付记录，不改变上述已验证的源码、测试和构建输入。仓库没有适用于本次修改路径的 AGENTS.md；源码快照目录中的 AGENTS.md 不适用于本次路径。`public-owner.json` 及其交接属于历史公共底座迁移，未登记本候选专属写入者；本轮未修改它、接管其他会话或操作其他工作区。

## 三阶段实际状态

| 阶段 | 已实现与保留 | 本轮增量 / 对应验证 | 剩余边界 |
| --- | --- | --- | --- |
| P1.2 | 单一 authority；来源、能力、精确目标集合；授权代次；撤权、恢复与只读错误引用 | 限定失败安装清理的授权代次；原生文档 active/error 检查；目标、引用、身份和恢复组件回归 | 原生浏览器撤权事件、真实 SW 中断恢复仍未验收 |
| P1.3 | 已有工具 SDK 区域、来源 document、能力及目标输入；真实点击入口、权限申请、输入快照和 authority 回执校验 | 保留 UI 实现与全部 UI 组件测试；同一正式 installer 的确定性竞争回归 | 原生用户手势、权限弹窗拒绝、真实注入、实际 UI 竞争仍未验收 |
| P1.4 | 既有 SDK/axiosx、正式 broker/HTTP 驱动、回环 A/B/C 页面和计数服务 | 全导入测试 239/239；编译产物/控制/环境回归 237/237；源码检查、双构建及包检查通过 | 原生工具 → 页面 SDK → B 全链与所有旧业务消费者兼容未验收 |

这些状态来自源码、实际运行与 CI，不是按文件存在或历史评分推定。A/B/C 示例、目标合同、UI 和五项真实 HTTP 计数测试在起点已存在，本轮没有重写它们。

## 本轮修复了什么

### 旧安装失败误撤销新批准

第一处不一致：旧 B 安装的 Chrome 注入回调仍在等待，新 B+C 范围已经批准并安装成功；旧回调返回后失败清理按整个文档撤权，将新授权一起撤销。

`src/platform/host/broker.js` 将原正式安装函数直接提取为 `createSdkInstaller()`，正式 `installSdk` 路由仍调用它。失败清理现在携带当次 `grantIncarnation`。`sdk-methods.js/revokeSdkGrants()` 在等待持久事务前立即退休原代次，只清理对应记录，不推进整个文档或原生权限的失效代次，不影响更新的授权。原生撤权的即时失效路径保持原样。

同一 authority、原生驱动和正式 installer 的测试通过确定性 barrier 验证：旧回调返回、持久清理等待、快速重新批准。新授权可以继续；旧 context、requestId 不能复活。初次复现 3 项中 2 项失败，保留原失败输出。

### 只匹配 documentId，遗漏实际文档生命周期

第一处不一致：页面 sender 和 UI 检查了 active，但 authority 对 `getAllFrames()` 返回的真实文档只核对 ID/来源，仍可能接受非活动文档或失败导航。

`src/platform/host/sdk-methods.js/native()` 与 `grantSdk()` 现在要求实际 frame 的 `documentLifecycle === 'active'` 且没有 `errorOccurred`；经已有调用关系覆盖授权、两次固定脚本注入的异步边界、请求和只读查询。字段缺失、未知生命周期均拒绝，不解释为允许。

新增测试包含 prerender、cached、pending_deletion、字段缺失、未知值与失败导航六种反例；修复前均出现“Missing expected rejection”。三个原有测试夹具只补齐真实 frame 元数据，没有删除 import、断言或放宽产品条件。

### 文件变更

| 文件 | 本轮作用 |
| --- | --- |
| `src/platform/host/broker.js` | 正式 installer 可直接进行组件回归；失败清理绑定原授权代次 |
| `src/platform/host/sdk-methods.js` | 精确代次清理与原生 active 文档核验 |
| `tests/framework/k2-sdk-installation-race.test.mjs` | 新增 10 项确定性安装、清理及生命周期回归 |
| `tests/framework/k2-sdk-broker.test.mjs` | 原生 frame 夹具补齐 active/error 字段 |
| `tests/framework/k2-sdk-reference-authority.test.mjs` | 同上，保留全部只读引用断言 |
| `tests/framework/k3-controller-authority.test.mjs` | 同上，保留完整控制器回归 |

## 实际调用链与安全合同

```text
现有 tool.html / tool-shell.js
→ sdk-approval.js / approve：冻结来源 document、能力、目标输入
→ 真实点击调用栈内、首次 await 前 permissions.request
→ 复验来源、原生权限和输入快照
→ 现有 host client.request('installSdk')
→ broker/createSdkInstaller
→ authority/grantSdk + authorizeSdkInjection
→ 固定 relay（ISOLATED）和 SDK main（MAIN）
→ A 页面既有 OpenDeskSDK.axiosx
→ SDK_REQUEST / createSdkRequestHandler / createSdkBroker
→ authority/admitSdk + 驱动 authorize(pre)
→ 现有 Chrome HTTP 驱动 / fetch
→ 保存效果事实与回执
→ authorize(post) / settleSdkDelivery / assertDispatch
→ codec / relay / 页面结果或明确错误
```

目标合同仍由 `src/framework/sdk/target-origins.js` 统一规范化：省略与 `[]` 均只允许同源；传入的是完整额外目标集合，不自动与旧授权合并；去重、稳定排序，最多 8 个原始条目。应用授权按 HTTP(S) 精确 origin 匹配，包含协议、主机和有效端口；拒绝用户信息、业务路径、query、fragment、未知协议与通配符。回环/局域网也必须单独批准；这不是完整 DNS 重绑定防御。

原生权限与应用授权独立：拥有 B 的浏览器权限并不授权 A；B/C 即使共享原生 host pattern，应用层仍必须精确区分端口。A 的 principal/namespace 不变成 B。只有有效且来源、能力、目标集合等价的 grant 可以复用；范围变化产生新代次。

HTTP 保持 `credentials: omit`、不自动跟随重定向、敏感头限制、禁止 `withCredentials:true`、预算/timeout/codec/摘要和不重放未知效果。服务器已观察到的请求不能通过本地取消撤销；已收到 HTTP 响应、业务是否成功、结果是否允许向当前调用者交付是不同事实。

`lookupSdkInvocation` 仍为 authority 的只读查询，保留原摘要、deadline、错误和引用投影语义，不新准入、不写库、不重放。跨源 grant 在 SW 恢复后要求显式重新批准；旧请求不能借新 grant 取得结果或重新发送。

## 验证证据

执行结果见 [verification.json](verification.json)，实际输出摘录见 [execution.log](execution.log)。完整未删改本轮日志和构建回执保存在对话交付的证据压缩包；JSON 中记录 SHA-256。独立 CI 的完整日志可从上述运行链接查看。摘录不是新的测试执行器。

| 检查 | 实际结果 |
| --- | --- |
| `node --test --test-reporter=spec tests/framework/k2*.test.mjs` | 239 PASS，0 FAIL / SKIP |
| `npm run check` | PASS；91 个源码/测试/构建文件，CSP、固定入口及 MIT 检查 |
| `npm run build` | PASS；生产包检查通过，SW 259348 / 262144 bytes |
| `npm run build:dev` | PASS；开发包检查通过，SW 259473 / 524288 bytes |
| `node --test --test-reporter=spec tests/framework/k[345]*.test.mjs tests/environment/*.test.mjs` | 237 PASS，0 FAIL / SKIP |
| 本轮源码提交的独立 GitHub CI | PASS；锁定依赖安装、上述两组回归、源码检查、双构建均成功 |
| 原生用户链、Mac 验收 | NOT_TESTED |

生产 packageHash：`61ac11ca50496025f51fe42eccc2709f9b08d85de60ec53c852efa5276b657b5`。
开发 packageHash：`8c1e3706f3c470cc9afd2d3ec813d54f46798fc989289f9099657d7b643fe436`。

容器不能直连 GitHub。通过连接器取得上一提交保存的完整源码和真实锁定依赖，校验归档摘要、父版本树及当前完整 Git tree 后运行；没有替换生产模块。代码上传后比对远端 tree 与被测试 tree 完全一致，并以实际提交再次运行相关检查。租约参数被连接器拒绝后使用非强制快进更新；没有强推，更新前后 HEAD 均核对。

保留的失败：安装竞争初次 1/3 通过；生命周期初次 4/10 通过；原夹具缺少生命周期导致首轮 k2 204/239、编译组 236/237，通过补齐真实夹具字段修正。两次组合命令达到工具时间上限，未记为完整运行；独立重跑编译组均 237/237 通过。

真实 HTTP 组件测试使用正式 authority/broker/axiosx/HTTP 驱动与真实回环服务：100 个相同 requestId 并发请求 B 仅被观察一次；未批准 C 为零次；只有原生权限、没有应用授权时 B 为零次；不同 requestId 不错误合并。Chrome sender、权限回调和序列事务仍是组件替身，不等于原生扩展、IDB 或工具点击验收。页面示例的“两次请求”产生不同调用 ID，不冒充相同 ID 去重检查。

原生尝试使用自建隔离 profile、Xvfb 和受控 fixture；启动期未取得 DevToolsActivePort，并发现容器受管策略 `ExtensionInstallBlocklist=["*"]`、`URLBlocklist=["*"]`。没有执行原生用户链断言，没有修改或绕过策略；只停止自建且核对过命令行的进程，已确认退出。不能将这个环境阻塞写成产品验收失败或成功。

## 旧记录与回退

旧同源记录只按原同源合同读取；未知格式拒绝。新跨源记录使用 `targetScopeVersion:1`、`active:false` 与 `crossOriginActive:true`。已核对的旧 P1.1 reader 自身要求 `active:true`，所以它会拒绝这类新跨源记录；不是仅依赖新增 version 字段，也不保证任意更旧版本都兼容。

回退必须回到完整、一致的扩展构建，不混用新 broker 与旧 authority。操作前停止新调用，保存 B 服务观察次数及未知效果回执，关闭相关来源文档和工具窗口。在受控 A/B/C 隔离扩展上下文中，可以执行以下原生撤权，再核验权限确实移除：

```js
const affected = { origins: ['http://127.0.0.1/*'] };
const removed = await chrome.permissions.remove(affected);
const stillGranted = await chrome.permissions.contains(affected);
if (!removed || stillGranted) throw new Error('停止回退：原生权限未确认移除');
```

该示例只用于上述隔离 fixture；实际部署应使用本次批准记录对应的原生 pattern，不移除无关站点权限。原生 pattern 不区分端口，因此示例会影响该隔离扩展的全部回环端口。`permissions.remove` 完成不代表应用持久回调已完成，也不撤销服务器效果。

随后完整退出并重启隔离浏览器，再加载已核对的旧完整构建；从新的来源文档显式重新批准，禁止自动重试未知请求。浏览器会话/文档身份重建与新跨源记录的旧 reader 拒绝规则共同隔离旧调用。不清空数据库、不删除业务记录或历史证据。实际浏览器降级验收仍为 NOT_TESTED；出现不认识的记录格式应停止回退排查，而不是将缺字段解释为全允许。

## 下一项最小工作：在允许扩展安装的隔离浏览器进行原生验收

入口保持不变：

```bash
node tests/framework/fixtures/sdk-target-origins/server.mjs
```

打开服务本次打印的 A URL（包含随机 runId），加载同一候选构建，从现有工具选择 A 的精确 document，勾选 network，仅批准打印的 B origin。先核对规范化的目标和 authority 回执，再在 A 页面使用已有按钮发请求，不在页面直接调用内部 authority。

至少记录以下实际断言：A/B 正常响应与服务次数；C 拒绝且 C=0；原生权限拒绝不新增范围；等待批准时导航、编辑输入和重复点击的状态；B hold 被服务观察后撤权、快速重新批准、释放响应，旧结果不交付且 B 不自动增加；重注入和 SW 停止/恢复不自动发送未知效果。保留浏览器版本、构建身份、精确 document、grant 代次、调用与服务日志的关联。原生事件/弹窗顺序不能用组件 barrier 代替。

首次原生断言失败应保留首个不一致、源码版本和服务计数，修复后重跑相同检查。不要扩大到 P2—P5，也不要为原生验收另建分支。
