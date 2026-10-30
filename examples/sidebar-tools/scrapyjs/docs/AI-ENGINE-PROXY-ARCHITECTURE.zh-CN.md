# ScrapyJS：AI 爬虫、代理与云运行技术架构（设计草案）

> 记录日期：2026-10-30｜状态：DESIGN_ONLY / NOT_IMPLEMENTED
>
> 目的：在不重建 OpenDesk Runtime、不改现有权限模型的前提下，将 ScrapyJS 接入可选 AI、代理与云端爬虫服务。下面的接口、数据结构、组件名称除明确指出已有者外均为**建议合同**，并非现存 API。

## 1. 已有基础与不可跨越的边界

- 正式产品位置：examples/sidebar-tools/scrapyjs/；React App 使用 app-model 和 adapters/app-sdk.js 委托固定 Controller Task scrapyjs.capture。
- 当前 Task 0.4.0 在 package.json 中的站点范围仅 127.0.0.1:43111、book.douban.com、download.csdn.net；运行上限 90000ms。外部网址不能因为输入 URL 或 AI 草稿就得到授权。
- OpenDesk Host 已有 src/platform/chrome/browser-managed-proxy.js 及代理 profile 相关代码；它管理 Chrome 浏览器级代理与审阅/恢复，**不是** ScrapyJS 任务独立代理池、按请求轮换或商业代理 API。
- 旧来源代码存在 ProxyMiddleware，不代表正式 ScrapyJS Task 的代理链路已测试通过。
- AI 生成仅生成受校验的采集配置，不能擅自获取 Cookie、突破 Origin、自动执行、扩大采集范围或隐式将用户数据发给远端。

## 2. 推荐结构：扩展负责控制，采集引擎按需外置

用户 → ScrapyJS React / AI 对话入口 → 规则草稿/差异/Schema/权限审阅 → 1–3 页试采 → 用户确认保存版本
　　　　　　　　　　　　　　　　　　　　　↓
　　　　　　　　　　　　　　可信执行路由（建议新增，需审阅）
　　　　　　　　　　　　　　├─ Local：原有 ScrapyJS 固定 Task / RunHost
　　　　　　　　　　　　　　├─ Remote Provider：Apify、Firecrawl 等 API Adapter
　　　　　　　　　　　　　　└─ Isolated Worker：未来 Scrapling / Crawl4AI 容器
　　　　　　　　　　　　　　　　　　　　　↓
　　　　　　　　　　　　　　标准化结果/证据/成本/日志 → 本地导出或受审云存储

不要在 MV3 扩展中直接嵌入 Python 爬虫框架；浏览器中的 JS SDK、Task 权限边界、云端 Python Worker 是不同的运行环境。

引擎角色：
- **ScrapyJS**：已授权当前页、交互型网站、用户可视审阅，默认本地运行；
- **Scrapling**：Python Worker 的 HTTP/浏览器采集、自适应规则与批量任务候选；不是既有 Controller Task 的直接替代；
- **Crawl4AI**：面向 Markdown、结构化内容、知识库/RAG 的云端采集候选；
- **Apify / Firecrawl**：可选外部付费执行/抽取提供商，先做一类最小 Adapter，再评估多平台路由；
- **可选 AI Provider**：负责将自然语言转成受限配置/修复建议，不直接拥有执行或权限审批权。

外部 Provider 的数据条款、地域、成本、可用 API、速率限制、日志与隐私处理需在接入时重新核实，不把竞品宣传视为产品已具备能力。

## 3. 任务合同（提议，不替换现有合同）

未来的 Recipe 应保留：
- recipeId、version、ownerId、schemaVersion、description、immutableHash；
- engineKind（local-scrapyjs / remote-provider / isolated-worker），engineConfig（不含明文密钥）；
- targetOrigins / permissionManifest、inputSchema、outputSchema、selectors、pagination、detailRules；
- limits（maxPages、deadlineMs、maxRecords、budget）、proxyProfileRef（可选）；
- validation（最近一次真实样本证据、版本、字段完整率、来源）；
- visibility（private / reviewed-public）、license / support policy（如需收费）。

Run 单独记录 runId、recipeVersion、snapshotHash、用户确认范围、执行环境、请求幂等键、startedAt、endedAt、status、pageCount、recordCount、costLedger、artifacts 与证据引用。Run 状态至少明确 created、awaiting_approval、running、stop_requested、completed、failed、stopped、unknown；“Stop 请求已受理”与“原实例已释放”分开读回。

采集结果必须包含原始数据集及至少一份标准化记录/错误信息；JSON/CSV 导出不截断实际记录。字段缺失、null、空字符串保留语义，不用 AI 自动填虚构值。

## 4. AI 的正确职责与限制

1. 用户输入“采集什么”，指定 URL/页面及需要字段；
2. 明示 AI Provider 和实际准备发送的资料范围，支持只发送结构摘要/用户提供的 HTML 样本；
3. AI 输出受约束 JSON 草稿，经原 validateConfig、来源/Origin、Schema、成本上限检查；
4. 显示与当前保存版本的新增/修改/删除，允许编辑和回滚；
5. 用户单独同意在最多 1–3 页的已授权范围内试采；
6. 真实读回检查字段完整率、重复率、分页终止和目标一致性；失败时允许 AI 给出**待再次确认**的修复草稿；
7. 保存不可变版本；后续普通复跑直接执行稳定规则，不强制每次重新消耗 AI Token；
8. “长期运行”必须再次审批运行预算、代理使用、数据去向和停止策略。

禁止对目标网站的验证码、付费限制或访问控制采取未经授权的绕过方案；遵守适用法律、网站条款、访问范围和速率限制。

## 5. 代理分层设计

| 模式 | 适合任务 | 技术边界与注意 |
| --- | --- | --- |
| Browser Direct（默认） | 本地当前页采集 | 沿用用户当前网络环境，不改变代理设置 |
| Browser Managed Proxy | 用户明确要修改当前 Chrome 网络代理 | 复用既有 Host 审阅与恢复；影响范围是浏览器级，不能宣称只影响一个 Task；避免同时任务相互冲突 |
| Worker Proxy Profile | 需要任务级隔离的云执行 | 在独立 Worker / 浏览器上下文配置代理；密钥仅由服务端 Secret Store 引用 |
| Managed Proxy Provider | 后期有商业合作的供应商代理服务 | 真实健康检查、区域/额度、服务条款、合规转售和成本账单 |

必须验证：启用/撤销状态、连接测试、凭据不出现在日志、代理失效时不经用户同意回退直连（fail closed）、Stop/崩溃恢复、并发任务互不污染。用 IP 地理位置选项不能冒称改变真实设备、身份或所有浏览器指纹。

## 5.1 可选用户贡献节点（补充设计，NOT_IMPLEMENTED）

用户自有 Android 手机可探索 Wi-Fi 局域网控制与蜂窝网络采集出口的双网络模式；跨互联网优先采用**主动领取受限 Job 的任务节点**，而非让手机公网入站或开放任意 HTTP/SOCKS 代理。社区共享出口属后期独立合规项目，默认关闭。详细决策、技术事实、MVP 及测试矩阵见 [自有设备与社区协作节点](COMMUNITY-NODES-MOBILE-EGRESS.zh-CN.md)。

## 6. 可选 HTTP 后端的最小接口（仅建议）

从本机 127.0.0.1 服务或一个受审托管 API 开始，仅提供必要能力：
- POST /v1/recipes/validate：静态检查与允许的权限/引擎；
- POST /v1/runs/preview：验证 1–3 页，带硬限制和 idempotencyKey；
- POST /v1/runs：经第二次明确确认后提交长任务；
- GET /v1/runs/{runId}：读取原任务状态、统计、结果引用及成本；
- POST /v1/runs/{runId}/stop：幂等请求停止，后续查询确认释放；
- GET /v1/artifacts/{artifactId}：授权后读结果。

先建立 Mock 与真实服务的边界，再使用真实 1–3 页证明可运行；不能以 HTTP 200 或“已提交任务”代替真实采集和结果读回。禁止服务在任务未知时因重连重复提交具有副作用的操作。

### 最小持久化

- PostgreSQL 或现有可信后端：users、recipes、recipe_versions、runs、entitlements、cost_events；
- 对象存储：真实结果、可选页面快照及审计证据，私有桶与短期签名访问；
- 队列/Worker：只有长期任务或高并发需求明确时才引入；
- Secret Store：AI Key、云平台 Key、代理凭据；不在 recipe JSON、客户端源代码、GitHub 或日志里保存明文；
- 默认仍保存在本地：用户 Cookie、登录凭证、当前浏览器会话、尚未批准上传的完整页面和个人数据。

这些均是未来服务设计，不是要求本轮创建数据库、云服务器或后台常驻服务。

## 7. 执行资源、成本与质量

- 每次预览使用有限页数、超时、记录数和 API/代理预算；云任务需显式额度与强制终止。
- 所有执行模式至少归一化记录：runId、recipeHash、origin、provider、requestCount、pages、records、duration、cost、stopState、errorCategory。
- 质量指标：字段正确性/完整率、记录重复率、空结果解释、分页终止、数据来源可证、错误恢复、成本偏差。
- 数据协议应防止恶意内容、SSRF（远端 URL allowlist、禁止内网/元数据地址）、任意命令执行、租户越权、无限抓取和输出注入。
- 云端长期任务不受本地 90 秒 Task 合同直接约束，但必须实现自己独立的超时/预算/权限；不能悄悄放宽本地 Host。

## 8. 反方审计 / 方案取舍

| 候选 | 优点 | 问题 | 当前结论 |
| --- | --- | --- | --- |
| 只增强扩展 | 复用最好、维护简单 | 缺长期云运行与任务级隔离 | 先交付本地基础 |
| 立即自建 Scrapling/Crawl4AI 集群 | 灵活，控制强 | 服务与运维成本高、维护面广 | 后续按需求验证 |
| 完全依赖 Apify | 交付快，Actor 市场成熟 | 平台锁定、成本与数据边界 | 作为可选 Provider |
| **ScrapyJS + 受审 Provider Adapter** | 保留用户入口、按需外置、可逐步扩展 | 需要稳定 Recipe 与执行结果合同 | **推荐** |

实施顺序：现有 AI/权限主链闭环 → 一个 1–3 页试采 Adapter → 长任务与持久化 → 多服务商/代理 → 商业市场。每步先验证当前 main，再做差量；本文件所有新增项均为 NOT_TESTED。

关联：[产品路线图](PRODUCT-ROADMAP.zh-CN.md)｜[商业模式与竞品](COMMERCIALIZATION-COMPETITORS.zh-CN.md)。
