# AI VIP Share R5.7 · Preview-first UX 工作记录

- 日期：2026-10-16
- 目标仓库：`shopable-ai/opendesk-browser`
- 远端基准：`f9f5c91b3d21504c8600943743118f425c43b457`（起始只读核查的 `main`）
- 授权写入：`examples/sidebar-tools/ai-vip-share/preview/index.html`、`preview/test-ui.mjs`、`preview/README.zh-CN.md` 与**本文件**。
- 不修改：历史 `preview/ai-vip-share-r4-preview.html`、`preview/test-r41.mjs`、正式工具 `src/`、SDK/Chrome/Host、正式安装包。
- 文件归属：本轮仅上述路径。GitHub 远端精确文件读写；执行环境未挂载用户 Mac 工作区，无法读取其未提交本地 diff，不能声称本地 Git 工作区无并行写入。
- 生命周期：`PREVIEW_IMPLEMENTED / EVIDENCE_PARTIAL`；独立范围释放，不占用用户本地 watcher、Profile 或 dist。

## Phase 0 发现

1. R5.6 `index.html` 含 5 段内联 JS。旧会员/兑换监听与新兑换监听重叠，新代码使用捕获阶段 `stopImmediatePropagation()` 跳过旧处理；存在重复回执/渲染时序问题。
2. 安装模拟通过修改实验场景的下拉值暗示工具添加完成，没有显式区分示例安装状态与真实 Chrome 安装。
3. 会员时间、额度和功能语义部分由最后加载的脚本覆盖前一个脚本；场景切换分散监听，无法统一取消前一场景中的异步操作。
4. 商品入口在头部和正文重复；顶部购物按钮弱化会员主卡聚焦。
5. 原纯字符串匹配测试不能充分证明 DOM 事件绑定、延迟回执和用户交互状态正确。

## 已实施内容

- 持续复用 R4.2 历史视觉，头部继续使用原 SVG 品牌图案，移除重复顶部商品按钮，保留正文的单个示例外部 HTTPS 链接。
- `index.html` 由 5 脚本改为两份领域模型和唯一 UI 控制器；删除重复代理 / 兑换 UI 监听，去除捕获阶段临时绕过；添加键盘可提交的兑换表单、显示/隐藏、清空、明确预检/确认/取消。
- 离线兑换只能在 `DEMO-ACCESS-2026` 预检通过后产生一次性标注回执，预检对象采用 `WeakSet` 的单次凭据，仅固定 fixture；重复码、未知码、已用、过期、账号不符、访客、服务不可用、超时、确认结果未知均明确区分。
- 异步预检、确认和代理有 revision / generation；场景切换取消旧预检，已发起但回执未到的提交**保守进入未知**且锁定原始码；状态未知不自动加会员时间、不重复提交。
- 专属链接区分浏览器未安装、工具未安装、已安装。查看指引不会完成安装，必须经**外部实验台按钮**模拟进度；安装完成后不会自动兑换。
- 保留 R4.1 代理状态模型并统一渲染与调度。启用中允许 STOP，停止优先于晚到的 START；恢复失败可重试；会员到期或 Provider 离线不妨碍停止；其他工具控制源不被本工具清除。
- 预览实验台始终位于模拟工具 `main.shell` 之外，正式源码无实验台状态机迁移。
- `test-ui.mjs` 更新为基于 Node 内置 `vm` 的轻量 DOM 事件替身测试，不引入运行时包，不启动第二套浏览器 dev 服务。

## 本轮验收矩阵

| 领域 | 行为测试 | 结果 / 边界 |
| --- | --- | --- |
| 会员 | 默认、时间/额度/功能、访客/到期/服务异常 | `SIMULATED_DOM_PASS`，未接 Provider |
| 兑换 | 格式、未知、已用、过期、错账号、访客绑定、预检、取消、确认、重复确认 | `SIMULATED_DOM_PASS`，纯演示 |
| 兑换安全 | 预检编辑取消旧请求、服务超时、结果未知、场景切换未知锁 | `SIMULATED_DOM_PASS`，未有真实持久幂等记录 |
| 链接安装 | 未安装宿主、未安装工具、均已安装、恢复待消费意图 | `SIMULATED_DOM_PASS`，未执行 Chrome 安装 |
| 商品入口 | 单个外部 HTTPS 新标签页、无内购弹窗 | 结构检查 `PASS`，未以浏览器手动点击 |
| 代理 | 单按钮、启用中 STOP、STOP 失败重试、控制源冲突、到期/离线 STOP、旧请求代次隔离 | `SIMULATED_DOM_PASS`，未操作真实代理 |
| 代码 | 3 脚本语法与唯一 DOM 控制器 / ID / handler | 静态编译及内存 DOM 事件模拟 `PASS` |
| Node `node --test` | `test-r41.mjs` + `test-ui.mjs` | `NODE_NOT_RUN`：无法挂载 Mac 仓库 |
| 视觉 / 键盘真实浏览器 | 390/360/320px、深浅色、Chrome Tab/Enter、溢出/对比度 | `VISUAL_NOT_TESTED` |
| 真实 Browser SDK / Provider / Native | SDK、真实 Chrome 代理、商业兑换与安装 | `NATIVE_NOT_TESTED / PROVIDER_NOT_CONFIGURED` |

新 `test-ui.mjs` 的 **22 项测试**已经由内存 DOM 驱动逐项模拟运行，`22/22 PASS`。这不冒充实际 Node CLI 结果。

## 专家评分（证据不足时不强行达到 95）

| 维度 | 权重 | 本轮保守评分 | 扣分依据 |
| --- | ---: | ---: | --- |
| 视觉设计与一致性 | 20 | 17 | 保留 R4.2 视觉，但尚无 Chrome 截图/实际布局核验 |
| 操作路径与信息架构 | 25 | 23 | 主要路径完整；尚缺真实观察首屏密度 |
| 交互功能与状态完整性 | 20 | 19 | 22 个离线状态/行为断言通过，未测真实浏览器事件 |
| 异常、安全表达与恢复 | 15 | 14 | 预检和未知状态闭环，尚缺可信 Provider 恢复 |
| 可访问性、响应与稳定性 | 10 | 7 | 键盘表单/焦点语义已有，但 320/360/390 和深色未视觉实测 |
| 测试与维护性 | 10 | 7 | 单控制器和 VM 测试已有，未真实执行 Node CLI / Chromium |
| **合计** | **100** | **87** | **尚未达到 95 分门槛，不得冻结** |

## 正式源码最小迁移清单（**不属于本轮写入**）

1. 将当前预览头部、会员、兑换、商品外链、代理卡结构迁入 `src/index.html`；符合 `od-*` Design System 并移除一切演示实验台。
2. 用会员 Provider 的账号、SKU、权益/时间和兑换记录替换所有 fixture；真实确认/未知恢复由后端幂等事务与查询驱动，`Unknown` 绝不视为成功。
3. 使用可信安装管理器校验宿主/工具身份、权限、来源与短效 ticket；安装和兑换均用户明确授权。
4. 调用 `OpenDeskSDK.browser.proxy.managed.getStatus()`、`requestEnable(...)`、`requestDisable()`，保持用户 STOP 意图和服务端/Chrome 回读的独立安全闭环，不能复制离线代理模拟。
5. 更换已批准正式商城 URL，落实受限外链与 CSP；核对正式 JSON 安装包之后再做真实 Chrome/手动验收。

**收尾状态：** R5.7 离线候选已实现，最终 Node 与 Chrome 证据缺失，95+ 不能如实授予。正式扩展仍 `NOT_MIGRATED`，原生代理仍 `NATIVE_NOT_TESTED`。应先由可访问用户本机工作目录和真实 Chrome 的执行环境完成剩余验证，再考虑冻结 UI。
