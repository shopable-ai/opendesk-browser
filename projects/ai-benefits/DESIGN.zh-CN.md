# AI权益中心 · MVP 技术与交互设计 R1

**任务：** `OD-AI-BENEFITS-R1`  
**项目：** `projects/ai-benefits/`  
**项目标识（slug）：** `ai-benefits`  
**Chrome / Edge 实际扩展 ID：** 由浏览器按扩展签名密钥生成；R1 不预设固定 ID。  

**产品目标：** 用户先选定目标账号标签和商品，再从 Chrome / Edge Side Panel 一键打开正确的官方购买、赠送、家庭共享、API 计费或管理员席位入口。扩展减少寻找入口和重复核对成本，但不代替官方身份验证、最终付款或权益领取。

**核心原则：** “一键发起”只表示一次明确的官方流程交接，不代表一键扣款、赠送、领取、兑换或开通。

## 1. 产品边界

### 做什么

- 让用户先选本地目标账号标签和商品/路径。
- 根据商品选择唯一、经过核查的官方入口。
- 在动作发生前展示：谁付款、权益归属、目标身份核对方式、谁必须确认。
- 打开官方网页，不自动输入、提交或确认交易。
- 记录扩展自己能证明的事件：本地准备、官方页打开、打开结果未知、用户自述取消/完成、用户手动核对后关闭待确认记录。
- 浏览器重启后恢复待确认状态，防止重复发起。

### 不做什么

- 不读 ChatGPT / Google 当前登录邮箱或页面 DOM。
- 不读取、索取、保存 Session、Cookie、密码、验证码、银行卡、API Key、OAuth token、礼品 claim link。
- 不调用未公开接口、第三方私有充值接口或猜测的 checkout URL。
- 不代点付款、发送礼品、接受邀请、Redeem、绑定 Billing Account、修改自动补款或分配企业席位。
- 不把关闭标签、返回扩展、页面跳转、用户口头报告或支付前页面展示当作成功证据。
- R1 不接后端，不做统一订单系统，不做资金托管。

## 2. 账号标签与真实身份

| 概念 | 含义 | 是否可验证 |
|---|---|---|
| 本地账号标签 | 用户在扩展里写的“我的 ChatGPT”“家庭成员 A”“OpenAI Org 主账号”等别名 | 否，只是本地备注 |
| 官方当前身份 | ChatGPT 当前账号、Google Account、API Organization、Cloud Project、Workspace 用户 | 扩展不读取；必须在官方页面核对 |
| 权益归属对象 | 最终持有会员、credits、API Organization 余额、项目计费能力或企业许可证的对象 | 由官方系统决定；R1 不直接核验 |

扩展不保存真实邮箱。若官方流程需要邮箱、Organization ID、Project ID 或 SKU，用户只在官方页面中输入/选择。扩展中的标签不能被描述为“身份已验证”。

## 3. 最短交互流程

三步横向流程：

1. **选择账号与商品**：选本地目标标签、商品、官方路径。
2. **核对或交给官方**：显示风险和主按钮，按钮文案明确说明会发生什么；打开官方页面后由用户核对实际身份。
3. **查看结果**：显示“官方页面已打开 / 结果待确认 / 用户自述取消 / 用户自述完成但未核验”等状态；没有可信官方信号时绝不显示“已付款 / 已赠送 / 已开通”。

### 主按钮文案

| 商品与路径 | 主按钮 |
|---|---|
| ChatGPT Plus / Pro 购买 | `打开 ChatGPT 官方购买入口（不会付款）` |
| ChatGPT Credits 赠送 | `打开 ChatGPT 官方赠送入口（不会购买或发送）` |
| Google AI Pro 购买 | `打开 Google One 官方购买入口（不会付款）` |
| Google AI Pro 家庭共享 | `打开 Google One 家庭共享（不会发邀请）` |
| OpenAI API 充值 | `打开 OpenAI API 账单入口（不会充值）` |
| Gemini API 充值 | `打开 Google AI Studio 账单入口（不会充值或绑定）` |
| ChatGPT Business 邀请 | `打开 ChatGPT Business 成员管理（不会邀请）` |
| Google Workspace 席位 | `打开 Google Admin Console（不会分配席位）` |

### 风险提示

- **当前官方账号：无法读取。** 付款前请在官方页面检查头像、邮箱、Workspace、Organization、Project 和 Billing Account。
- ChatGPT 会员购买必须在目标账号登录后进行；已有会员不能跨账号转移。
- ChatGPT Credits 的 claim link 是一次性 bearer link；邮箱不会绑定链接；扩展不得存储链接。
- Google AI Pro 家庭共享不是任意账号赠送；目标必须符合家庭组资格。
- Gemini API Prepay 可能改变 Cloud Billing 账户状态；中途取消可能影响同一 Billing Account 下其他项目。R1 绝不自动确认。
- OpenAI API 初始预充值默认开启 Auto Recharge；扩展只提示核对，不更改。

## 4. MVP 架构

```text
┌─────────────────────────────────────────────────────┐
│ Chrome / Edge MV3 Side Panel                         │
│                                                     │
│  Account Alias + Product + Action                   │
│                 │                                   │
│                 ▼                                   │
│  Channel Adapter (per product)                      │
│                 │                                   │
│                 ▼                                   │
│  Exact HTTPS Host Allowlist                          │
│                 │                                   │
│                 ▼                                   │
│  chrome.tabs.create({ official URL })                │
│                                                     │
│  chrome.storage.local                               │
│   - aliases / selection                              │
│   - handoff ID / timestamps / status                 │
│   - no identity secrets / no payment data            │
└─────────────────────────────────────────────────────┘
                         │
                         ▼
            Official OpenAI / Google UI
             (human final confirmation)
```

### 为什么 R1 不引入后端

目前没有官方公开 API 能统一购买个人会员、赠送 ChatGPT Credits、为 OpenAI API Organization 充值或为 Gemini API AI Studio 预付费。后端不能凭空创造这些权限，也不能可靠地读取官方订单结果。加入后端只会增加账号、令牌、支付和订单数据的信任面。

未来只有在取得明确官方 API 或书面合作授权，并具备 OAuth 授权、精确权限范围、可验证回调/订单状态、撤销与审计机制时，才单独评估后端。Google Workspace 已购 SKU 分配 API 和 Google Cloud Billing 项目关联 API 是不同的管理 API，不是通用支付 API。

## 5. 最小浏览器权限

Manifest V3 权限：

- `sidePanel`：显示 Side Panel。
- `storage`：本地保存别名和事务状态。

不申请：

- `host_permissions`（任何站点）。
- `tabs`（不读取敏感 tab 属性；只使用 `chrome.tabs.create` 打开固定 URL）。
- `activeTab`、`scripting`、`cookies`、`webRequest`、`webNavigation`、`identity`、`history`、`downloads`。

官方入口在适配器中硬编码；点击时再次校验 HTTPS、精确 hostname、无用户名密码和非标准端口。禁止用户输入任意 URL。官方站点后续跳转由浏览器/官方站点处理，扩展不读取页面；用户必须查看地址栏。

## 6. 数据保存与信任边界

`chrome.storage.local` 仅保存：

- 用户自定义账号标签（默认“本人账号”“目标账号 A”）；
- 选中的商品和动作；
- 随机 handoff ID、创建时间、动作 ID、固定官方入口 URL；
- 状态与用户明确自述的结果类型。

不保存：真实邮箱、账号 ID、Organization/Project ID、Session、Cookie、密码、验证码、API Key、银行卡、订单号、支付回执、gift claim link、完整邀请 URL。

本地状态是扩展自己的操作记录，不是官方订单记录。`storage.local` 不同步到云端；用户卸载扩展时数据清除。用户应避免把真实邮箱写入别名。

## 7. 事务状态机

| 状态 | 语义 | 能否再次发起 |
|---|---|---|
| `DRAFT` | 只选择了商品，未打开官方页 | 可以 |
| `OPENING` | 已先写入本地记录，正在创建官方标签页 | 不可以 |
| `OFFICIAL_PAGE_OPENED_UNVERIFIED` | 浏览器确认标签页已创建；只证明打开了页面 | 不可以 |
| `HANDOFF_UNKNOWN` | 标签页创建失败或浏览器中断，无法判断是否已打开 | 不可以 |
| `USER_REPORTED_CANCELLED_UNVERIFIED` | 用户自述已取消/退出；官方交易结果未知 | 不可以 |
| `USER_REPORTED_COMPLETION_UNVERIFIED` | 用户自述已完成；没有官方信号验证 | 不可以 |
| `USER_REVIEWED_UNVERIFIED` | 用户声称已在官方页面独立核对并关闭本地待确认；扩展仍未验证交易 | 可以 |

**没有 `PAID`、`GIFT_SENT`、`REDEEMED`、`ACTIVATED` 或 `SUCCESS` 状态。**

### 重复点击与恢复

- 点击前检查当前待确认事务；存在未解决事务时禁用主按钮。
- 先写入 `OPENING`，再创建标签页；成功后写入 `OFFICIAL_PAGE_OPENED_UNVERIFIED`。
- 若浏览器重启时发现状态仍为 `OPENING`，恢复为 `HANDOFF_UNKNOWN`，不自动重试。
- `chrome.tabs.create` 成功只证明标签页创建，不证明网站已登录、付款、发送礼品或开通权益。
- 用户只有在官网独立核对后，才可手动关闭本地待确认记录；此操作不改变官网订单，也不构成扩展验证。

## 8. 未来可验证信号（不在 R1）

| 产品 | 可能的官方验证依据 | 仍缺少什么 |
|---|---|---|
| ChatGPT Plus / Pro | 用户在目标账号官方账户页看到当前 plan；可能有官方收据 | 面向扩展的公开订阅状态 API / OAuth 授权 / 订单回调 |
| ChatGPT Credits gift | 购买者收据只证明购买；收件人余额/claim 状态在官方账号内 | 官方 gift claim 状态 API；收件身份与链接安全方案 |
| Google AI Pro | 目标 Google Account 的 One/AI plan 页面 | 公开订阅/家庭权益读取 API |
| OpenAI API prepaid | API Organization Billing Overview / Credit grants 页面 | 公开余额/交易状态 API 及可授权范围 |
| Gemini API | Cloud Billing API 可读项目 billing association；AI Studio Dashboard 显示 Prepay 余额 | 公开预付余额/充值订单 API；跨客户计费合规确认 |
| Google Workspace SKU | Enterprise License Manager API 可读具体用户 SKU 分配 | 确认目标 Gemini SKU、OAuth 管理员授权、租户范围与审计 |

## 9. 验收标准

| ID | 验收 | 通过条件 |
|---|---|---|
| A01 | 账号标签与实际身份 | UI 明示标签不等于官方身份；不读取页面邮箱；提示人工核对 |
| A02 | 错账号场景 | 不能将标签误报为身份验证；模拟原型显示不匹配并阻止继续 |
| A03 | 官方域名白名单 | 只允许精确 HTTPS hostname；拦截 HTTP、lookalike、userinfo、非标准端口 |
| A04 | 重复点击 | 当前事务未解决时不创建第二个官方标签页 |
| A05 | 取消 | 取消只记录用户自述；不能显示交易成功或已退款 |
| A06 | 重启恢复 | `OPENING` 恢复为 `HANDOFF_UNKNOWN`；不自动重试 |
| A07 | 结果未知 | 页面打开、关闭、返回 Side Panel 均不产生成功状态 |
| A08 | 模拟/正式隔离 | `prototype.html` 标记模拟；扩展只打开官方固定入口，不包含模拟支付或订单接口 |
| A09 | 隐私权限 | manifest 只有 `sidePanel`、`storage`；无 host permissions / cookies / content scripts |
| A10 | 官方确认边界 | 所有主按钮文案明确写出“不会付款/发送/充值/分配” |

## 10. R1 交付状态

- 官方证据矩阵：已形成，见 `RESEARCH.zh-CN.md`。
- MVP 架构与状态机：已定义。
- 单文件原型：`prototype.html`，纯模拟，不联网、不付款。
- 可加载 MV3 项目：`extension/`，官方流程交接模式。
- 自动付款、礼品发送、领取、订阅状态 API、API 余额 API、跨客户 Cloud Billing 代付：明确不在 R1 范围。
