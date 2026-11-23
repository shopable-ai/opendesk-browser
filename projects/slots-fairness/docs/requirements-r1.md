# Slots Fairness Verifier · 需求、自动匹配与证据设计 R1

- 任务：OD-SLOTS-FAIRNESS-AUTO-DETECTION-UX-R1
- 范围：OpenDesk Browser / projects/slots-fairness / main
- 文档性质：**产品与技术设计；非已实现扩展、非真实网站兼容报告**
- 交付目标：能直接打开的单文件模拟交互预览（../preview/index.html）+ 本文
- 设计基准：仓库 AGENTS.md、.agents/skills/opendesk-ui-preview/SKILL.md、src/ui/design-tokens.css、src/ui/design-system.css；只新增项目文件，不修改框架
- 产品边界：只读取用户授权且可见的公平性证据；不下注、不预测、不导流、不越权、不采集隐私

## 1. 原始目标与成功口径

用户在疑似支持 Provably Fair 的游戏网页打开侧栏，授权后扩展自动发现公开字段；没有找到时点选真实网页中的元素、确认字段映射并保存在该网站的本地规则中；下次在授权有效的条件下自动匹配，种子公开、算法明确且证据齐备时独立复算，展示**具体复算到了哪一层**与不能证明的部分。减少反复复制粘贴是优先于数据报表、云端会员的 P0。

**必须区别**：字段提取成功 ≠ 哈希匹配 ≠ 在游戏前有可信承诺 ≠ 随机结果复算一致 ≠ 可证明转轴/中奖/赔率/奖金公平。独立验证不代表赌场可信或整体“公平”。

本轮的成功口径：a) 9 种核心模拟场景有真正的切换、操作、状态反馈；b) 选区可 Hover / 点击 / 字段映射 / 保存 / 再次使用 / 修复；c) 未授权不能自动读页面；d) 未公开种子不假报结果；e) 文档和源码在仓库 main 的指定路径。**真实 Chrome 扩展、真实赌场、真实算法适配及商店发布均不在本轮交付。**

## 2. 带优先级需求树（稳定功能 ID）

- P0｜最小正确闭环
  - SF-01 网站、权限与会话
    - SF-01.1 识别 URL / origin / route / 页面类型与已知游戏类型，不能以域名等同算法
    - SF-01.2 已知适配器 → 本地规则 → 通用 DOM 扫描（按证据质量选择），冲突不静默覆盖
    - SF-01.3 首次使用通过 Chrome 认可的扩展调用（扩展图标/快捷键/菜单等）获取 activeTab 临时访问，再由用户在侧栏发起扫描；侧栏内部普通按钮**不得假定本身会重新授予 activeTab**；网站自动检测需独立可选 host 授权及用户开关
    - SF-01.4 未授予权限时保留明确的“未授权”，不自动读取；撤权、切站、禁用要取消任务
    - SF-01.5 没有发现字段与无法验证要区分呈现原因
  - SF-02 最小 DOM 智能匹配
    - SF-02.1 文本、label、aria-label、role、data-*、邻近节点/容器语义与中英关键词，严格候选白名单
    - SF-02.2 提取字段：serverSeedHash、serverSeed、clientSeed、nonce、displayedRandomResult；按游戏可另增轮次 ID
    - SF-02.3 选择器稳定性：优先站点专用 data-testid/data-field、稳定 id/aria、标签上下文与容器锚点；拒绝纯 nth-child 链
    - SF-02.4 唯一性和上下文校验：0 命中=失效；多命中=歧义；格式不符=不可信；不从页面冒名字段直接得出已验证
    - SF-02.5 SPA route 与可见 DOM 新增：只在授权且确有动态目标时启动增量监听，批处理、去重、超预算停用
    - SF-02.6 同源已授权 iframe 可按 frame 独立处理；跨源未授权、closed shadow、Canvas 没有文本时说明限制
  - SF-03 一键页面选区（首次修复关键路径）
    - SF-03.1 “选择页面区域”切入拾取模式，Hover 高亮，Escape / 取消退出并清理
    - SF-03.2 点击可见候选节点 → 文本预览、类型推断、候选 selector 与唯一性/稳健性提示
    - SF-03.3 用户可更改字段类型、重选、取消、确认；同一字段重复映射冲突时显式提醒
    - SF-03.4 只在同源授权范围内保存规则，页面 DOM 变化再次匹配前验证唯一性、格式与上下文
    - SF-03.5 匹配失败自动禁用使用该字段的验证结果，提供“重新选区”；不静默更新存储
  - SF-04 分级验证引擎
    - SF-04.1 获取事前承诺的来源/时间/轮次关联；缺少游戏前捕获证据时只声明“事后可核对哈希”
    - SF-04.2 Server Seed 已公开时计算其摘要并与承诺哈希比较（编码规则/大小写/十六进制等需准确记录）
    - SF-04.3 随机结果验证只允许有**明确且版本化**的算法规格、种子顺序、nonce 派生及映射规则的适配器
    - SF-04.4 游戏符号/轨道/返奖及奖金只有可审计游戏映射和赔率表才能单独证明；没有即“未覆盖”
    - SF-04.5 全状态：未授权 / 未发现 / 字段不足 / 等待种子公开 / 算法不支持 / 哈希一致 / 随机数一致 / 游戏结果一致 / 不一致 / 字段失效 / 能力限制
    - SF-04.6 每项结果显示输入来源、算法 ID/版本、计算值与页面值、轮次、失败层级；不使用泛化绿色“公平”
  - SF-05 规则持久化
    - SF-05.1 本地 schema v1：站点/路由范围、字段 selectors、提取方式、唯一性、适配器版本、授权及 auto 状态、最后验证记录摘要
    - SF-05.2 页面结构变更时规则失效、提醒修复；禁止跨 origin 自动复用、不允许任意远程脚本作为规则
    - SF-05.3 用户可禁用/删除本站规则，规则升级需用户确认与无损迁移
  - SF-06 安全、资源和失败关闭
    - SF-06.1 最小权限、只读、可见字段白名单，拒绝 password / token / cookie / 隐藏种子 / 任意私有接口
    - SF-06.2 不发送敏感 DOM 到服务器，不调用下注接口，不模拟下注，不跨网站扫描
    - SF-06.3 观察器仅在活动页且有授权时存在；性能预算与停止条件明确，可手动停用
    - SF-06.4 页面内容不可信，任何 label/HTML/URL/存储规则不得直接执行 JS；避免 innerHTML 注入
- P1｜增强，但不阻塞本轮
  - SF-07 多区域/同页多游戏区与轮次绑定、防混局
  - SF-08 多语言字典可编辑、冲突比较、适配器升级/迁移与修复建议
  - SF-09 历史验证与批量离线计算、原始证据 JSON 导出（敏感字段默认遮蔽）
  - SF-10 本地规则导入/导出、证据完整性检查、PC 统一管理（复用 app.html 正式入口）
  - SF-11 独立、可回放的确定性测试 fixture 和兼容矩阵
- P2｜研究候选，不进入 R1
  - SF-12 审核通过的公开适配器目录、社区规则审查、签名/来源/撤回机制
  - SF-13 可选云规则更新、多设备同步与账号
  - SF-14 增值服务、外部独立审计报告（不以“盈利概率/下注优势”营销）
- 暂不实现
  - 真实网站数据采集、下注/预测/赔率分析、交易或赌场推荐、绕权限获取未公开种子
  - 云端后端、账户、VIP、遥测、网站破解、绕过 iframe / Canvas 边界
  - 立即开发 MV3 正式包、正式 PC 应用、扩展商店发布

## 3. 方案 A/B/C 对比与推荐

| 维度 | A 关键词自动扫描 | B 人工点选+规则保存 | C 适配器+自动扫描+人工兜底 |
| --- | --- | --- | --- |
| 首次操作 | 最少，但易误判 | 每个站点需配置 | 已知站几乎零操作；未知站智能建议 |
| 适应新网站 | 中（多语言/布局歧义） | 高（可见 DOM） | 高（通用层+B 兜底） |
| 页面更新稳健性 | 中低 | 中；锚点失效需修复 | 高于单方法；版本/候选复核 |
| 开发复杂度 | 中 | 中 | 较高，但可按垂直闭环分层 |
| 性能成本 | 初次中、重复扫高 | 初次低 | 有范围与预算的按需扫描 |
| 权限与误识别 | 不加防护风险高 | 用户确认较可控 | 同等最小权限+候选证据分级 |
| 长期维护 | 字典多站不稳定 | 用户规则多 | 适配器+模板+规则升级，需要治理 |
| 设计评分（作者基于本任务约束，100分） | 74 | 83 | **96** |

**选择 C，但 MVP 第一阶段不追求多个真实站点适配器**：建立一个模拟适配器和可替换的算法登记点；先跑通“授权→自动发现→用户点选→保存→再识别→证据验证”，再针对真实、合法、获授权的目标验证。A 只提出候选，B 使正确性可控，C 负责任务编排与权限限制。

### 最小模块边界（目标，非已实现）

- Side Panel（用户可理解状态与授权入口），遵循 Single App · Multiple Surfaces；后续 PC 只负责规则管理
- DetectionCoordinator（页面/权限/适配器/规则优先级/扫描预算）
- DOMScanner（局部、只读、低置信度候选）、RuleMatcher（唯一性/格式/上下文/版本校验）
- ElementPicker（短时 Hover / click 事件与 Escape 清理）、RuleStore（本地版本化安全规则）
- EvidenceCollector（轮次+时间+来源+承诺事前性标签）、Verifier（版本化确定性算法模块）、StatusPresenter（逐层结论）

**OpenDesk 能力门槛**：现有公共 Sidebar SDK 并不因 UI 可见就自动拥有任意页面 DOM/iframe 读取权限。后续真实开发应先检查公开 Page/Program 能力是否支持本需求；缺口标记 SDK_GAP_NOT_PROVEN，经审计一方固定模块才评估可信 Content Script / MV3 scripting。R1 单文件设计预览不使用 OpenDeskTool 特权、chrome.*、实际注入或真实网站请求。

## 4. 首次扫描、按需扫描与 MutationObserver 的触发协议

| 事件/条件 | 行为 | 停止 |
| --- | --- | --- |
| 尚无 host 授权，也未点击触发 | 不扫描、不监听，侧栏只提示权限 | 维持原状 |
| 用户明确点“扫描页面”，且 Chrome 认可的 activeTab 授权仍有效或已有相应 host 授权 | 当前页面短时注入/只读扫描一次；结果/证据降级展示 | 结束本次遍历后释放；手动停止可中止 |
| 已批准 host + 开启自动检测、命中 origin/URL | 首次进入扫描一次；匹配成功且静态页面不监听 | 成功/超时/预算耗尽即停止 |
| 已授权，发现 SPA 异步区域未完成或明确变化 | 仅挂在可疑容器的 MutationObserver，批处理变化节点，短时活跃窗口 | 稳定 N 轮无变化、超过 15s 初次观察窗口、切路由/切站/后台暂停/禁用/撤权 |
| 站点选区已保存且唯一匹配 | 优先廉价 selector 命中，无需全文扫描 | 匹配成功直接结束 |
| 规则失效/歧义/冲突 | 停用该字段结论，局部候选扫描或请求人工重新选区 | 禁止无限自动修复 |
| 反复失败 | 冷却及手动触发，不用无限轮询 | 满额即停止 |

**初始性能预算（待真实设备校准）**：每次只扫可见授权区域；默认一次最多约 2,000 候选元素；空闲片段单次处理不超过约 16ms；增量 debounce 250ms、每次更新合并；一次路由扫描不超过约 3s/限定次数；动态监听短时窗口 15s；每路由失败冷却 30s。预算均为**设计建议，不是当前性能测试结论**。不要观察 document 全树后每次变化做全量 querySelectorAll；关注候选容器，过滤样式/动画/无关子树；MutationObserver 不应自动读取或上传非候选文本。页面隐藏、停用、撤权时 disconnect 并取消 pending 任务。MV3 service worker 不负责长期持有 DOM 观察器。

## 5. 匹配与用户选区安全规则

候选评分只用于 **发现**，不用于直接宣称结果：已知 data-testid/稳定 id + 正确容器 + 值格式 + 同轮次 > 唯一标签邻接 + 格式 > 仅文本关键词。候选需和 expected game/round 对齐；冲突优先显示“需要确认”。

选择器生成：优先同域、稳定 data-testid / data-field / 有语义 id / 可靠 aria；允许基于具有语义的父容器缩小范围；不接受整个 document > ... > nth-child(...) 的路径；存储 selector、提取策略（只读 textContent 或白名单属性）、字段类型、格式约束、邻近 label 指纹及样本散列，不储存敏感值。保存前验证 selector 的唯一匹配；复用时再次验证唯一、字段格式、容器语义与轮次；候选超过 1 个或上下文不匹配应显示失效并等待修复。**可见性**：禁止读取隐藏输入、密码、DOM 私有缓存或未公开 serverSeed。选择器是数据，不允许作为 JavaScript 表达式执行。

参考的最小本地结构（非最终 API）：

    {
      "schema": "slots-fairness.rules.v1",
      "origin": "https://example.invalid",
      "pagePattern": "/game/*",
      "enabled": true,
      "autoDetect": false,
      "hostPermission": "not-granted",
      "adapter": {"id": "generic", "version": "0.1"},
      "fields": {
        "clientSeed": {
          "selector": "[data-testid='client-seed']",
          "extract": "textContent",
          "expectedLabel": "Client Seed",
          "confidence": 0.94,
          "confirmedByUser": true
        }
      },
      "lastVerificationAt": null,
      "updatedAt": "local timestamp"
    }

存储逻辑与 Chrome host 权限必须分开：本地 autoDetect=true 并不等于已获得 native 权限，真正运行需双重检查；授权被撤销则当场停止。新版本不因更换站点而复用旧 origin 规则。初版所有规则仅本机。

## 6. 证据语义与独立复算

- **L0 字段识别**：知道页面显示什么，不说明公平性。
- **L1 事前承诺证据**：必须在对应回合/下注前确实捕获公开 serverSeedHash、轮次与可信时间顺序；本机仅记录时间并非防篡改第三方公证；若事前未捕获，不能倒推“网站事前已承诺”。
- **L2 哈希关系**：种子公开后按明确字节编码计算 ServerSeed 哈希（常见 SHA-256，具体以该站公开算法为准）并与已记录的哈希核对；未公开时只等待。**L2 不自动证明 L1**。
- **L3 RNG 结果**：用已审计且准确版本化的站点/游戏算法（可能 HMAC-SHA256、SHA-256、不同 byte order、nonce 扩展及拒绝采样）对同轮次数据复算，并与网页披露的随机值比对。未知站点只能报 UNSUPPORTED_ALGORITHM。
- **L4 游戏结果**：从 RNG → reels / symbol weights / paylines / multiplier / payout 的明确映射及版本独立复算；缺赔率表、RTP 或服务端分支都不能声称该层已验证。
- **FAIL**：只有格式合法、来源/轮次可信且确实运行算法之后才能报“不一致”；DOM 匹配质量不够只能报 INCOMPLETE/UNTRUSTED，避免假阳性。
- **证据记录**：字段名、定位来源、采样时刻、轮次 ID、算法 ID/版本、输入摘要、显示值、计算值、commit 时间顺序、unsupported 原因；导出 P1 需敏感字段用户审阅和遮蔽。

预览使用专门的 **SIM-256-v1 模拟算法**（SHA-256(serverSeed + ":" + clientSeed + ":" + nonce)，取首 8 个 hex 以 16 为基转换后模 100）；**不代表任何真实 Slots 平台算法，也不证明转轴/奖金**。预览的哈希校验可在支持 Web Crypto 的本地浏览器中真正计算；预览结果一律显示“模拟”。如果 Web Crypto 不可用要明确阻止结果声明。

## 7. 技术边界与合规（逐题回答）

1. 不同网站、甚至同站不同游戏可使用完全不同的 RNG、nonce 和映射；不能从关键字段名推导算法。
2. DOM 不可见：仅报告未发现、允许用户点选其他**可见且已授权**的证据或手动输入公开资料；不得读取私有 JS 变量/网络响应绕过安全限制。
3. 跨源 iframe：在 **独立获得该 frame 目标源的必要 Chrome host 权限** 且匹配规则允许时才可针对 frame 注入；top frame 权限不自动覆盖全部跨源 frame。缺权限则阻止，仅显示能力边界，不能越过同源策略。
4. Canvas / WebGL 没有对应 DOM 文本时不能靠 DOM Scanner 提取；不做截图 OCR/录屏偷读、禁止假造数据，可引导用户查看网站公开的独立历史页/公平性页。
5. 没有事前捕获的 commit，只能证明“后来给出的 seed 与后来显示/记录的哈希相符”，不能独立证实其在游戏之前已经固定。
6. 服务器种子未公开时，无法完成依赖明文 serverSeed 的事后哈希 / RNG 复算；最多保留/审计哈希承诺；不能预测种子。
7. 错匹配：要求唯一选择器、格式、上下文、同轮次与显式算法，异常自动降级，不允许以高置信分数取代密码学验证。
8. 性能：限定 origin、短时扫描、增量监听、可撤销/终止、visibility-aware，实机性能待测。
9. Chrome Web Store 当前政策明确禁止促进真钱赌博；即便工具自称审计、若被认定促进线上赌场也可能拒审/下架。官方表述：https://developer.chrome.com/docs/webstore/program-policies/regulated-goods-and-services 与 https://developer.chrome.com/docs/webstore/troubleshooting ，最终须单独核实发布决策，不能保证上架。
10. 保持验证核心为独立可复用的本地纯函数模块，未来可独立网页（用户手动提供公开证据）或离线本地应用实现；没有 host 权限的网页工具不能跨网站读取 DOM。发布渠道与法律审查是独立决策，不应成为绕过浏览器安全限制的借口。

参考：Chrome activeTab 授权触发方式：https://developer.chrome.com/docs/extensions/get-started/tutorial/scripts-activetab ；activeTab 和可选 host 权限：https://developer.chrome.com/docs/extensions/develop/security-privacy/user-privacy ；frames 与 ISOLATED：https://developer.chrome.com/docs/extensions/reference/manifest/content-scripts ；scripting：https://developer.chrome.com/docs/extensions/reference/api/scripting 。

## 8. 离线交互预览场景与验证矩阵

| ID | 场景 | 期望可观察结果 | 阶段 |
| --- | --- | --- | --- |
| S01 | 已知模拟站+适配器 | 自动匹配；验证只到哈希与模拟 RNG 层 | 离线预览 |
| S02 | 未知模拟站，关键词已发现 | 能扫字段；算法未知，不报游戏公平 | 离线预览 |
| S03 | 字段缺失 | 点击“选择页面区域”、Hover 高亮、选元素、改映射、保存、重新识别 | 离线预览 |
| S04 | SPA 动态 DOM | 更新页面元素、短时重新检测或手动扫描，不能变成无限轮询 | 离线预览 |
| S05 | 已存选择器失效 | 明确失效、禁验证、点选修复、重新保存 | 离线预览 |
| S06 | 未获得授权 | 默认自动扫描关闭、扫描需明确授权、撤权后清理 | 离线预览 |
| S07 | Server Seed 未公开 | 仅显示承诺信息，哈希/RNG 待公开 | 离线预览 |
| S08 | 公开结果与独立复算不一致 | 显示双方值、证据层级及“不一致”，不泛化所有赌局 | 离线预览 |
| S09 | iframe / Canvas 能力边界 | 提示不可读取、拒绝虚假成功 | 离线预览 |
| N01 | 重复相同标签/重复 selector | 禁保存，提示收窄作用域 | 设计负例；正式测试待实现 |
| N02 | 伪造格式/隐藏字段/密码/跨 origin | 禁采集/验证，降级原因可追踪 | 设计负例；正式测试待实现 |
| N03 | 多局 nonce/seed 被拼接 | 禁 L3/L4，先绑定同轮次 | 设计负例；正式测试待实现 |
| N04 | 撤权/切站/路由跳转/后台 | observer 解除、pending 丢弃、不重放 | 设计负例；正式测试待实现 |
| N05 | 不受信任规则中 XSS 字符串 | 只允许 CSS selector / textContent 数据，严禁执行 | 设计负例；正式测试待实现 |
| N06 | 缺 Web Crypto | 不宣称哈希或 RNG 已验证 | 预览条件负例 |

R1 文件本身不等于以上测试已通过。执行的实际测试与已知失败必须以最终报告及测试回执为准。

## 9. 六视角独立维度的设计自评（非外部专家背书）

| 自评角色 | 分数（/100） | 依据与扣分 |
| --- | ---: | --- |
| 产品经理 | 97 | 自动闭环完整、P0/P1/P2 清晰；真实站点可行性仍未验证（-3） |
| UX 专家 | 96 | 默认少复制、拾取/修复可回退、状态可理解；真实窄屏可用性待实测（-4） |
| MV3 架构师 | 95 | 主动授权/可选 host/内容脚本边界清晰；本阶段未审计真实 OpenDesk 接口（-5） |
| DOM 专家 | 95 | 唯一性、语义锚点、渐进监听/失效保护；无真实站点跨语言样本（-5） |
| 安全与合规专家 | 96 | 不抓隐私、不提升权限、发布限制前置；商店/法务正式判定未得（-4） |
| 密码学专家 | 97 | 明确 L0-L4、时间顺序/算法版本/不一致语义；真实算法复算未测（-3） |

**算术平均**：(97+96+95+95+96+97)/6 = **96.0/100**。这个分数只衡量当前设计覆盖度，由方案作者依六专业视角分别自评；**不是六位独立受邀专家的测试结论，不证明实现已经 95 分。**

反方攻击：①恶意站点可在赛后同时改 seed+hash；②相同 nonce 可存在不同 round；③页面可伪造 Canvas 结果；④一个正确 HMAC 不说明赔率/转轴映射；⑤自动扫描可能误拾取客服文字；⑥扩展被认为促进真钱赌博而无法上架。对应防线是时间关联、轮次 ID、可见证据来源、分层验证、歧义阻断、独立发行后备方案。

遗漏审计：同一页多游戏及多个 frame（P1）、语言/混合大小写、字符串/字节编码、动态路由、服务端轮次、版本迁移、撤权、异常恢复、导出隐私、历史审计均已明确分层。最大未消除风险：真实算法规格与网站对外承诺真实性。**自我否决**：任何 UI 出现“已证明游戏公平”但仅完成 L2 或模拟 L3；任何无权限扫描；任何用户未确认就改写失效选择器；任何真实下注、预测或导流；任何测试/发布虚报，均视为不合格，设计高分自动失效。

## 10. R1 完成条件与进入正式开发的门槛

- R1 仅完成需求设计和**本地模拟交互预览**；独立文档链接与单文件预览必须存在于 main、可读回。
- 预览应覆盖 S01-S09 的路径、核心按钮、元素 Hover / 点击、映射、保存、规则复用及失效修复；明确本地模拟，不访问赌场、不请求 Chrome 权限、不写用户真实存储。
- 正式开发 Gate：先审核 OpenDesk 现有公开 Page API 与 owner；确定最小权限方案；拿到获许可的公开算法规格和合法 fixture；定义预验证哈希捕获/轮次合同；建立真实 Chrome 权限与 DOM 性能测试、错误匹配负例、商店发布与法规评估。**当前一律 NOT_TESTED。**


## 11. 本轮真实执行记录（2026-11-22；不是 Chrome 安装验收）

**已执行并通过**

- GitHub：确认仓库 shopable-ai/opendesk-browser，默认且唯一写入分支 main；项目此前不存在；已读取 AGENTS.md、UI Preview Skill、共享 design-tokens 与 design-system，并新建本文及 ../preview/index.html；以 GitHub 文件 API 重新读回两个文件及 blob SHA。
- 代码静态检查：读取提交后的单文件 HTML 并用 JavaScript Function 语法解析其唯一 script：PASS；9 个场景 option 值齐全；HTML id 无重复；无外部 script、网络请求、真实 chrome.permissions / scripting、localStorage / indexedDB、innerHTML 赋值：PASS。
- 交互状态机检查：从 GitHub 对应提交的真实 HTML 提取脚本，在隔离 V8 环境以受控 DOM/MutationObserver/Web Crypto 测试替身执行（**不是 Chromium**）。首版 **21/21 PASS**；按目标把已授权未知站与缺字段站改成默认自动发现后，针对**最新 HTML**重新执行 **19/19 PASS**。覆盖 S01 已知适配器/RNG、S02 未知站自动发现+未知算法阻断、S03 缺字段自动提示→选区→映射→保存→再次扫描、S04 增量变更、S05 失效阻断→修复、S06 未授权→授权→撤销、S07 未公开种子、S08 不一致、S09 iframe/Canvas 限制。两轮断言颗粒度不同，不应累加为一个用例数。
- 算法 fixture 独立比对：用 Python hashlib 验算模拟种子哈希为 025d9953b16a88c2a5853a59dea1c200f309a9507d3d64a8b02c64eb1f16158f，模拟 RNG 哈希为 a59e86c16443192e69d289bcab70f746f5747f5b5b83b2b5e1231b256f9d5e48；首 8 个 hex 取模 100 = **25**，与预览期望一致。模拟错误结果场景故意显示 **26**。
- 本次审查在脚本中修正：Canvas/iframe 场景的状态优先级、失效规则对字段 label 的复核、模拟已知适配器的明确 selector 路径、异步计算后的页面状态版本检查、证据面板重置文案。

**没有执行 / 不宣称**

- 没有运行项目现有 sidebar-preview-kit.mjs 生成器或其 check 命令；当前 HTML 是**参照仓库 Token / od-* 控件的独立设计模拟稿**，并非官方宿主生成器的字节同源结果，须在本机项目环境再做模板和视觉比对。
- 没有实际 Chromium / Playwright / Mac 真实文件加载、鼠标 Hover、键盘 Escape、窄侧栏渲染或 Accessibility 验收；V8 DOM 替身不等于真实浏览器。以上均记 **NOT_TESTED**。
- 没有正式扩展 manifest、网站 host 权限调用、跨源 frame、Canvas、真实 Provably Fair 算法、网站兼容性/性能/安全渗透、Chrome Web Store 提交；均 **NOT_TESTED**。
- 以上评分仅表示需求设计维度的自评达到 96/100；正式功能进入开发前，需补上上述门禁证据，不能以高设计分绕过。

**R1 结论**：仓库文档与交互预览的方案阶段完成，模拟状态逻辑 21/21 通过；可进入**受控正式开发准备**，但不代表具备上架、真实站点验证或安装验收条件。

## 12. R1 交互预览入口纠偏（2026-11-23）

用户要求**当前 ChatGPT 对话内直接可点击、左右两列（Side Panel + 模拟目标页面）预览**，而不是单给 GitHub 源码链接。GitHub `blob/main/.../index.html` 是源码查看页，并非可运行 HTML 预览入口；后续回复应优先在对话内呈现互动 UI，独立 HTML 仅作可打开/可保存的备用文件。

**风格与证据边界的校准**：此前已读取 `.agents/skills/opendesk-ui-preview/SKILL.md`、`src/ui/design-tokens.css`、`src/ui/design-system.css`，但预览 `preview/index.html` 仍是人工编写的离线设计稿，尚未用 `node scripts/sidebar-preview-kit.mjs create` 生成受保护的完整宿主外壳，也未执行其 `check`。故不能标为 `SOURCE_PARITY_PASS` 或官方 UI Skill 静态门禁通过。对话内另行提供的交互适配也必须标明 `CHAT_ADAPTER_NOT_SOURCE_HTML`，不可把其测试自动算作仓库内预览源码验证。

本轮额外提供一份离线 **Chat Adapter 交互实验文件**（会话附件），采用仓库批准的 Neutral / `od-*` 语义映射与浅色宿主视觉，不更改正式 Browser 源码。它在本轮隔离 Chromium 的 `page.set_content` 点击测试中覆盖九个模拟场景，**23/23 断言通过**（已验证字段发现、人工点选并保存、规则复用、MutationObserver 模拟更新、规则失效修复、无权限阻断/撤销、未公开种子、模拟结果差异、Canvas/iframe 降级、证据展开与 360px 无水平溢出；没有页面 JS 异常）。当前测试环境无法导航到文件 URL 或本机 HTTP（ERR_BLOCKED_BY_ADMINISTRATOR），因此使用 `set_content`；该隔离文档未提供 Web Crypto，算法显示清楚的“预置静态向量”降级，并非真实 SHA-256 在 Chromium 页面计算通过。

**仍需补做**：可连接本机仓库工具或本地 Codex 时运行官方 `sidebar-preview-kit.mjs create/check`、按受保护区正确迁移业务 UI；再做来自源文件的浏览器点击与视觉校准。未完成上述步骤前不得标记“完全采用官方扩展规范”。

## 13. 交互设计审计 R2：模板来源、被裁切的自动检测开关与字段保存策略（2026-11-23）

### 13.1 复现的缺陷和修复

本次读取了先前聊天交付的完整离线文件 `slots-fairness-chat-preview.html` 与实际截图，并在隔离 Chromium 用 `page.set_content` 检查 DOM 的计算布局：左侧 `.sf-panel` 宽 338px、clientWidth 336px，但内部 `.sf-surface` 被长哈希的最小内容宽度撑成约 455.4px；自动检测 switch 的 x 坐标在约 430px，超出侧栏右边界（x=346px），被 overflow:hidden 裁掉。DOM 中 checkbox 仍为 checked=true，因此“开关消失”不是自动检测停止，而是**窄侧栏布局溢出**。同一问题使“选择页面区域”按钮被裁。

修复动作：侧栏 grid 显式 `minmax(0,1fr)`，所有子项 `min-width:0`、长哈希截断，控制器区域固定/受限宽度，开关提供“开/关”文字及焦点轮廓，保存规则按钮仅在选中后出现，另增加简短的本地存储解释。修复也已以独立、保守的 CSS 限宽差量更新仓库 `preview/index.html`。它仍是人工设计稿，不得称为经过官方模板生成。

**已验证的准确层级**：修订后的聊天离线 HTML `slots-fairness-r2-interactive-preview.html` 通过隔离 Chromium `page.set_content` 的 **49/49 断言**：1200/768/390/360/320px 每个宽度核对开关 ON/OFF 仍在 Side Panel 内、不横向溢出、按钮可见、无 JS 错误、无选区时隐藏禁用“保存”；另测已知/未知（基线沿用）、缺字段→选区→保存→复用、MutationObserver 新增、失效→修复、撤权、未公开种子、不一致、Canvas/iframe。生成宽屏与 360px 截图。仓库版 `preview/index.html` 仅已做 JavaScript 静态解析和文件写入；**未针对该仓库精确字节运行 Chromium 或 Preview Kit check**，不得转移上述测试证据。

### 13.2 现行 UI Skill 合规问题

阅读的权威来源：`.agents/skills/opendesk-ui-preview/SKILL.md`、`scripts/sidebar-preview-kit.mjs`、`scripts/templates/sidebar-preview.html`、`scripts/templates/sidebar-tool-preview-shell.html`、`src/ui/design-tokens.css`、`src/ui/design-system.css`。官方设计稿应先从 `node scripts/sidebar-preview-kit.mjs create --out artifacts/sidebar-preview-kit/slots-fairness-r2 --title 'Slots Fairness Verifier'` 生成，再只改 `#od-preview-app` 内部、脚本的 `/* DESIGN_APP_BEHAVIOR */` 之后；保留真实来源的导航/页头、外部诊断场景、锁定的 Tokens/CSS、CSP，并运行 `node scripts/sidebar-preview-kit.mjs check <生成文件>`。目前不能在连接的本机 workspace 上运行该生成器：**UI_TEMPLATE_PARITY=NOT_TESTED**。聊天适配器只可标记 CHAT_ADAPTER_NOT_SOURCE_HTML。

### 13.3 自动发现、自动保存与历史证据必须分开

| 项目 | 需要自动识别？ | 自动长期保存原始值？ | 推荐处理 |
| --- | --- | --- | --- |
| 当前 origin / 许可范围 / path pattern | P0 | 只持久化必要授权、站点匹配设置；原生授权以 Chrome 权限为准 | 使用 host grant + 本地 RuleStore，禁止将前端 toggle 当权限 |
| Server Seed Hash（公开承诺哈希） | P0 | 默认不记录每轮；只有用户明确启用“承诺证据留存”才记录哈希、轮次和本机观察时刻 | 事前采样有用，但本机时刻不是不可篡改公证 |
| Client Seed、Nonce | P0 | 默认不持久化原值 | 仅在当前轮次验证使用，刷新时重新读 |
| Server Seed 明文 | **仅公开后** | 默认不长期保存 | 未公开时显示“等待公开”，绝不尝试解密或读取私有值 |
| 轮次 ID / 历史记录关联 | **P0 条件必需** | 需要历史证据时仅存脱敏关联 ID | 避免跨轮次混用字段；无法唯一关联则禁 L3/L4 |
| 网站游戏类型、adapter ID / algorithm version | P0 | **保存非敏感规则元数据** | 未知算法只能到哈希关系，不能臆造 RNG 通过 |
| RNG cursor / bonus round / 游戏配置 | **站点算法需要时必需** | 默认只保存规格和配置版本，非完整页面历史 | Slots 可多次派生随机值；算法不可由字段名猜测 |
| 页面展示结果 / 转轴 / 奖金 | L3/L4 对照时按需提取 | 默认不持久化；只有用户授权审计历史留存才存必要去敏摘要 | 结果展示不等于规则能复算 Slots |
| CSS selector / 属性提取规则 / 语义标签 / 唯一性 / frame 作用域 | P0，规则优先 | **用户确认后自动保存在本地规则** | 安全、可修复、不使用执行型 JS/远程代码 |
| 密码、Cookie、会话令牌、未公开 Seed、私有接口 | **禁止** | **禁止** | P0 隐私与权限底线 |

主决策：**自动检测=已授权网站上的受限观察；自动保存=用户确认的字段匹配配置；证据留存=未来单独选择的审计功能。** 三者不绑定成一个开关。当前 R1 演示初始 5/5 仅是模拟充分字段，并不证明真实网站达到 L3/L4；任何算法未知、Seed 未公开或轮次错配必须明确降级。

### 13.4 同类型真实 UI 参考（只研究证据 UI，不推荐网站消费）

- 官方种子/Nonce 面板图与多语言布局：Stake 日文技术解释含截图 https://stake.com/ja/blog/jp-blog-provablyfair 。借鉴字段分组、历史 vs 当前承诺，但不用下注按钮或品牌风格。
- Seed 与 Verify 分区：Primedice 的 Fairness / Verify 双页技术截图 https://www.gamble.io/provably-fair-gaming 。借鉴“当前承诺”和“可验证历史”分离，**不照搬改变种子的游戏控制**。
- 复算结果明细：Stake 社区计算页技术截图 https://stakecommunity.com/topic/7293-bet-verification-provably-fair/ 。借鉴多层计算值、预置 vs 页面值对比和可复查差异；不保留与公平性无关的投注 UI。
- 完整 game event 明细/Slots 算法：Stake https://stake.com/provably-fair/game-events 和 https://stake.com/provably-fair/implementation ；其两种 Slots 有固定轮轴/动态带权重映射差异，额外 cursor 会影响 bonus 事件。
- Shuffle commitment/reveal、HMAC/cursor 代码：https://help.shuffle.com/en/articles/9286047-provably-fair-commitment-schemes 、 https://help.shuffle.com/en/articles/9286058-provably-fair-implementation 。参考种子未公开时只能审计承诺的边界。
- 商店发布风险：Chrome Web Store https://developer.chrome.com/docs/webstore/program-policies/regulated-goods-and-services 与 https://developer.chrome.com/docs/webstore/troubleshooting ；只读声明不确保不会被判定为促进真钱赌博，必须独立评估。

### 13.5 六视角独立维度自评和反方审计

本轮针对**修复前完整聊天交互预览**的作者分角色自评，而不是独立外部专家；该数值不能替换 R1 需求方案的另一版本评分：

| 角色 | /100 | 扣分依据 |
| --- | ---: | --- |
| 产品经理 | 85 | 自动发现闭环清楚，但未区分采集规则、轮次数据和证据留存 |
| UX/视觉专家 | 76 | 开启开关不可见、长字段溢出、禁用保存按钮常驻、英文技术项过密 |
| 浏览器扩展架构师 | 77 | 未按官方 Preview Kit 生成，DOM 与运行时权限仍是 Mock |
| DOM 自动化专家 | 74 | 同轮次/多 frame/Selector 唯一与语义复核仅模拟，缺真实站点样本 |
| 安全/合规专家 | 86 | 只读和撤权方向正确，但“自动保存”含糊，商店风险仍需裁定 |
| 密码学专家 | 73 | 固定模拟向量不等于真实算法，可能误将五字段齐全看成完整可验证 |
| **平均分** | **78.5** | **算术平均（85+76+77+74+86+73）/6** |

自我否决/反方攻击：①开关在开启状态仍不显示，属于 P0 的可达性失败；② DOM “五字段齐全”其实可能来自不同轮次，若直接继续验算可产生错误结论；③用户没有亲自看到事前 Seed Hash，事后哈希相等不证明承诺时间；④算法只知 SHA256/HMAC 不等于知道 Slots symbol/reel/paytable；⑤移动端/多语言/长哈希导致原生按钮裁切；⑥自动持久化每轮明文与用户可验证目标不成比例；⑦商店审核限制可能令扩展形态不可发。任一项未解决不得给正式交付评分≥95。

修复后候选已解决第①⑤项的**离线布局缺陷**，但模板、真实站点、隐私审计和密码学算法门槛仍未完成。不能人为把 78.5 或任意高分直接调到 95。正式验收需要相同源码字节的官方 UI 生成/静态校验和真实 Chromium/Chrome 证据。

### 13.6 非站点内嵌的独立验证器参考（更接近本产品）

除运营商 Fairness 面板外，建议以独立、只读验证器的 UX 为主要对照，不推荐或导流至赌场：

- https://provable.io/verify ：支持短链接/shortId 唯一定位历史结果，减少用户粘贴；其“Committed vs Verified”状态区分可作为本项目状态命名参考。此服务验证自家发布的记录，不能自动外推到第三方 Slots。
- https://provablyhero.com/verify ：强调种子在浏览器本地验证和算法覆盖矩阵，且区分 Verified（实际轮次匹配）/ Reference（仅按公开算法实现）；这些都是该网站自己的声明，尚未由本项目独立核验。
- https://docs.slottylabs.com/guide/provably-fair ：公开请求接口包含 roundId、gameId、paytableVariant、subNonce 等；证明本项目不能把五字段的静态列表当成覆盖所有 Slots 的通用合同。这是技术文档，不保证其生产行为真实可用。
- https://www.provablyfair.org/methodology ：将 seed commitment、RNG、结果复演、RTP/赔率与异常条件分成不同审计范围。其独立性/认证声明属于对方自述，本项目只借鉴证据层级与范围透明。

产品定位建议保持 **Browser-local audit assistant（不下注、不预测）**；对不支持 commit/reveal 的普通第三方 Slots 显示“当前无法独立复算”，不应误写“不公平”；对同一网站不同游戏分配不同 adapter/version，不因为共享 origin 就复用 RNG 或 reel 映射。


## 14. R3：侧栏关闭后仍自动识别、分层历史与最小保留（2026-11-23）

本节是用户新增的 P0 需求，修订 R1/13.3 的「不默认保留每轮数据」决策：**要在 Server Seed 公开后自动补验，必须在已授权站点暂存最少必要的公开轮次证据**。R1 旧结论保留为历史但不再优先。本节是需求设计，尚非 MV3 实装。

### 14.1 用户目标与条件

用户完成一次站点访问授权和数据留存告知后，当他浏览获准的网页时，即使侧栏没有打开，也能自动发现公开的 Provably Fair 轮次信息、等待种子公开并事后分层复算，之后打开侧栏看到最近历史及汇总。并非「安装后无条件扫描所有网站」：安装不等于 host 授权，activeTab 只支持临时已触发的访问；关闭浏览器、未打开网页、页面被冻结也不能承诺实时监测。

### 14.2 P0 需求树

- BG-01 自动运行与权限：
  - 已授权站点默认可开启自动检测，不依赖 Side Panel 开闭；用户可关闭开关；未授权站点禁止后台扫描和记录。
  - Content Script 在有明确 host 授权的匹配页面工作，document_idle 初次受限扫描，SPA 异步时短时增量观察。
  - MV3 Service Worker 只响应事件、协调存储与计算，允许休眠，不用无限定时器维持 DOM 监听。
  - 切站、撤权、页面冻结、停用时立即停止有关监听和待发消息；不突破跨源 iframe / Canvas。
- BG-02 记录与补验：
  - 首次识别并关联 origin / gameId / roundId / seedPairId / nonce / adapterVersion，避免把不同游戏/回合字段混接。
  - 区分 DISCOVERED（发现）、PENDING_REVEAL（待公开）、INCOMPLETE、UNSUPPORTED_ALGORITHM、COMMIT_MATCHED（仅 L2）、RNG_MATCHED（L3）、GAME_MATCHED（L4）、MISMATCH、INVALID_RULE。
  - 稍后在已授权页面实际观察到 reveal，利用有效缓存补验并替换原记录状态；未观察到不补造历史；未经证据校验不能通过。
  - 去重（同 origin+game+round/事件+seedPair+nonce+algorithmVersion）；多标签、刷新、重试不重复计数。
- BG-03 Side Panel 历史：
  - 打开首页先展示：近30天已观察、已完成复核、待补证、对照异常、最后一次检测时间。扫描次数不得冒充已验证次数。
  - 最近2–3条包含时间、网站、游戏/轮次、证据层级、状态与原因；展开记录有算法版本和来源；完整历史放后续子页/PC。
  - 关闭侧栏仅解除 UI 订阅，已授权网页的检测和本地记录继续；再次打开读取同一本地快照。
- BG-04 存储/隐私/性能：
  - 只采集获许可站点的公开证据。等待 reveal 的最小缓冲：origin、roundId、公开 hash、Client Seed、Nonce、已显示的随机结果、关联 seedPairId、算法版本、观察时间及算法确需的 cursor。
  - **本地默认缓存**设计预算：每站最多 200 条、最长7天，先到先淘汰；用户授权时明确展示保留政策。对不允许缓存的站点只做即时验证，不承诺关闭后补验。
  - **历史结果摘要**：每站最多500条、近30天（设计阈值，实机调整），去敏记录标识、最深证据层级、结果状态、时间、算法版本及核验依据摘要；不保留整个 DOM。
  - storage.local 或已验证的本地数据库保存；service worker / Side Panel 的内存和 localStorage 不作为唯一真相；storage.local 并非自动加密保险库。
  - 提供清理历史、关闭自动检测、撤销站点授权的独立权限/设置入口；绝不收集密码、Cookie、token、未公开 Seed、私有网络结果和下注建议。
- P1：按日期/网站/状态筛选；导出脱敏证据；更细的去重/同步冲突/存储统计/审计异常通知（不含博彩辅助）。
- P2：审核过的适配器更新、规则共享、云同步；不在 R3 实施。
- 不实现：全网站高频后台轮询、自动下注/收益赔率预测、隐藏种子提取、浏览器关闭时虚构监测、无限存档。

### 14.3 模块边界（目标架构，不是已实现）

    已授权 + 自动检测启用
           │
    页面 Content Script（不属于 Side Panel）
           │
    站点适配器/字段关联/唯一性校验
           │
    轮次去重与证据分层
           │
      ┌────┴─────┐
    待公开      Seed 已公开且算法支持
      │              │
    临时缓冲     本地纯函数复算
      └────┬─────────┘
       chrome.storage.local / 有界数据库
             │
      Side Panel 随时打开读取历史

不要创建第二套 OpenDesk Host/SW。需要在正式实现前核对公开 Page/Program、受信任第一方 Content Script 能力、安装授权契约，证据不充分记 SDK_GAP_NOT_PROVEN。Content Script 不得执行任意服务器发来的 JS。侧栏关闭不会导致 worker 常驻，Chrome 可回收 SW；接受这个边界并做事件幂等。

### 14.4 主页与图标方案

- **移除业务 UI 的「撤销模拟权限」文字按钮**。授权/撤销模拟只放预览实验台；真实站点 Chrome 权限走已存在的宿主准入/设置。
- 首页优先展示站点/自动检测状态 + 最近活动时间、4 个紧凑指标、最多 3 条最近历史、一个「查看全部」入口。技术字段移到详情，不再全部永久显示首页。
- 「扫描页面」采用统一 Refresh-Cw（同 Web Markdown Clipper）或 Scan-Search：日常可用图标按钮 + i18n title/aria-label。
- 「选择页面区域」采用 MousePointer/Crosshair：**缺字段或匹配失效时推荐图标+本地化文字**，因为仅看图标不能可靠理解「从网页中点选字段」；初次教程需点选 Hover 提示、Escape 取消和映射确认。
- 图标可以降低标签空间，但不是完全免翻译；aria-label、tooltip、空/错误状态与帮助文本仍应随语言包翻译。
- 「保存匹配规则」只在用户点选并确认后显示，不把保存变成每轮验证必须操作。

### 14.5 新增验收与反方审计

| 测试 | 成功条件 |
| --- | --- |
| BG01 | 已授权网站页面保持打开、侧栏关闭后新增公开轮次；重开侧栏能读回去重记录 |
| BG02 | 未获 host 授权站点不能创建观察器或历史 |
| BG03 | 先捕获承诺，随后观察 seed reveal 自动复核；未看到 reveal 必须仍待公开 |
| BG04 | SW 被回收和恢复时不丢提交结果，不重复计数，不无限轮询 |
| BG05 | 多标签重复轮次/同 nonce 不同游戏/页面变更不会混局 |
| BG06 | 撤权/禁用/页面切换停止监听，原缓存按披露政策清理 |
| BG07 | 数据超限被淘汰，仍不影响已存匹配规则；支持用户删除 |
| BG08 | 规则失效、算法版本变更时禁用旧验证结论 |
| BG09 | 侧栏开关开启/关闭及 320–390px 窄屏不发生裁切 |
| BG10 | 已发现≠哈希一致≠RNG 一致≠完整 Slots 公平 |
| BG11 | Canvas/跨域 frame/浏览器关闭时不伪造检测 |
| BG12 | 用户清楚理解自动检测会临时保存哪些公开数据，何时删除 |

反方攻击：误把安装等同于所有网页授权；同 nonce/不同游戏拼接错轮；赛后伪造事前哈希；SW 暂停却宣称无间断；长时间缓存侵犯用户活动隐私；副本扩展多个 Tab 造成双计数；商店认为其促进真钱赌博。若任一被证实，当前设计不可标为正式发布通过。

参考：Chrome scripting 和 persistAcrossSessions https://developer.chrome.com/docs/extensions/reference/api/scripting ；SW 限制 https://developer.chrome.com/docs/extensions/develop/migrate/known-issues ；activeTab https://developer.chrome.com/docs/extensions/mv3/user_privacy/ ；storage https://developer.chrome.com/docs/extensions/reference/api/storage ；2026 采集披露政策 https://developer.chrome.com/blog/cws-policy-updates-2026 ；商店赌博限制 https://developer.chrome.com/docs/webstore/troubleshooting 。

**证据状态**：R3 产品/架构设计完成；真实扩展后台监测、存储及侧栏关闭原生测试 NOT_TESTED；离线预览若演示侧栏关闭期间的新增记录，只能标为模拟。


### 14.8 本轮实际交付、验证层级与未完成

- 仓库 main 已差量更新 preview/index.html：侧栏移除「撤销模拟权限」按钮；扫描与网页选区增加 SVG 图标（仍保留必要中文标签）；授权范围内模拟发现的轮次在侧栏关闭期间继续存于**同一页面的模拟内存**；侧栏再打开时显示近30天历史汇总、最近记录及 reveal 状态升级；完整字段已识别时默认折叠技术详情，缺失/规则失效时展开。
- 已新增 docs/competitive-screenshots.md：含公开竞品 UI 图片的可渲染外链、逐图来源和借鉴/禁用对照。当前第三方 CDN 原图未成功下载，因此**只完成带图参考索引，并未把第三方 PNG/WebP 二进制归档到仓库**。不允许混淆两者。
- 运行证据 A：对 GitHub main 的最新 HTML 源码执行 JavaScript 语法检查、无重复 DOM id、无 grant 文本按钮和外部 script 的静态检查，PASS。隔离 V8 DOM/Crypto 测试桩对更新中的 20 项场景首次返回 19 通过，另 1 项是站点显示名包含「（已知样例）」与测试预期 hostname 不一致；随后已在仓库修正站点 ID 记录，但仍需对最终确切字节重复完整运行。
- 运行证据 B：独立的本地 CHAT_ADAPTER HTML (sandbox 文件，**不是官方仓库 HTML 字节同源**) 用 Chromium Playwright 在 1200/768/390/360/320px 以及核心流程执行 57/57 断言 PASS，包括开关、历史、关闭/重开、后台事件模拟、缺字段点选、SPA 更新及未授权阻断；保留了截图。该结果仅证明本地模拟适配版可交互，不证明原仓库精确 HTML 的 Chrome 原生验收。
- 尚未完成：官方 sidebar-preview-kit.mjs create/check、源代码一致性截图、Chrome MV3 同一候选安装与真实 Content Script/权限/持久化/暂停恢复测试、真实网站算法、商店发布审查。全部 NOT_TESTED。当前演示的自动补验**只是状态机模拟**，不能声称已实现真实后台公平性复算。
