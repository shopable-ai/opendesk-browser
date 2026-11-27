# 官方渠道证据与可行性矩阵 R1

**任务：** `OD-AI-BENEFITS-R1`
**正式名称：** AI权益中心（AI Benefits）
**项目目录：** `projects/ai-benefits/`  
**核查日期：** 2026-11-27  
**范围：** ChatGPT 个人会员、Google AI Pro 个人会员、OpenAI API 预付余额、Gemini API / AI Studio 计费；另列 ChatGPT Business、Google Workspace 席位、家庭共享、礼品卡和促销。  
**证据规则：** 只把官方帮助中心、官方产品文档和官方 API 文档作为能力依据。没有公开文档不等于技术上绝对不可能，统一标记为“未找到公开依据”，不推断存在私有 API。

## 1. 先给结论

1. **ChatGPT Plus / Pro 没有查到官方的任意邮箱会员赠送机制。** 购买必须在目标 ChatGPT 账号登录后进行；已有订阅不能转移。官方现有的赠送产品是 **ChatGPT Credits**，不是 Plus / Pro 会员，而且收件人必须主动领取。
2. **Google AI Pro 的指定对象交付路径是 Google 家庭组共享。** 家庭管理员付款，合资格家庭成员使用部分 AI 权益；任意外部邮箱不能靠一个“会员兑换链接”直接领取。家庭成员必须加入家庭组并满足国家、账号和 12 个月限制。
3. **OpenAI API 余额属于 API Organization。** 组织 Owner 负责充值和账单。没有查到向另一个 Organization 转移或赠送已购余额的公开能力。ChatGPT Pro / Business 另有一项有资格限制的 API Credits 福利，但它绑定一个 API Organization，不是任意账号赠送。
4. **Gemini API 预付余额属于 Cloud Billing 账户，不属于 Google AI Pro 个人会员。** 项目通过 Cloud Billing 关联获得付费能力。跨客户共用计费账户存在 Google Cloud 条款风险，不能把“技术上能关联”当成通用代付或赠送产品。
5. **企业席位与个人会员完全不同。** ChatGPT Business 需要邀请成员并检查席位；Google Workspace 的已购 SKU 可以通过 Admin Console 或 Enterprise License Manager API 分配给组织用户。
6. **R1 不接支付后端。** 目前能可靠交付的是“打开正确官方入口 + 账号/项目核对提醒 + 本地事务防重复 + 待核验状态”。任何最终付款、赠送、领取、兑换、管理员席位确认都留在官方页面。

## 2. 商品与路径矩阵

状态标签：
- **官方已证实**：官方文档明确描述该路径。
- **未找到公开依据**：未找到官方公开赠送、代付、购买 API 或状态回调依据。
- **需合作方书面授权**：必须取得官方/授权经销商的正式合同、API 权限和生产准入后才可考虑。
- **不支持**：官方明确说明不可转移或不可共享的权益。

| 商品与路径 | 谁付款 | 权益最终归属 / 目标如何核对 | 地区、套餐与限制 | 扩展最多能做什么 | 最后确认人 / 官方依据 |
|---|---|---|---|---|---|
| ChatGPT Plus / Pro：本人购买 | 付款方法持有人在官方结账页付款 | 归属于购买时已登录的 ChatGPT 账号；必须在官方页面核对当前账号 | 套餐、价格、税费和支付渠道按账号、国家/地区变化 | 打开 `https://chatgpt.com/`；提示核对账号和已有订阅 | 目标账号用户核对账号；付款人确认结账。**官方已证实** |
| ChatGPT Plus / Pro：替另一个账号购买 | 付款人可在目标账号登录后的官方购买流程中完成付款；官方文档没有定义独立访客付款/代付 API | 订阅直接归属目标 ChatGPT 账号；必须先登录目标账号；已有订阅不能转移 | Apple / Google Play 付款账号还可能与原 ChatGPT 账号绑定，切换账号不会转移订阅 | 只能打开官方购买入口；不能登录目标账号、不能代输密码或付款 | 目标账号用户必须登录并核对；付款人完成官方结账。**购买到不同账号：官方已证实；独立第三方代付机制：未找到公开依据** |
| ChatGPT Plus / Pro：赠送会员 | — | 没有找到官方的 Plus / Pro 会员礼品或将订阅绑定到任意收件邮箱的公开机制 | 不得把 ChatGPT Credits 误称为 Plus / Pro | 不提供“赠送会员”按钮；只说明官方没有证据支持 | **未找到公开依据**；现有订阅跨账号转移明确不支持 |
| ChatGPT Credits：官方赠送 | 符合资格的 Plus / Pro 个人账号，或 Business 关联的 Personal workspace | 购买者得到一次性 claim link；收件人登录合资格个人账号后主动 Redeem，额度才进入该账号 | 逐步开放；支持地区和账单币种限制；购买者需账号状态良好；收件人需在 30 天内领取；同币种；链接一次性使用；领取后通常 12 个月到期，日本特定日期后为 180 天 | 打开 ChatGPT；不能代购、代发、读取邮件或保存 claim link | 购买者确认付款并安全发送链接；收件人确认账号并点击 Redeem。**官方已证实，但它不是会员** |
| Google AI Pro：本人购买 | 付款人通过 Google One 官方订阅流程付款 | 绑定当前购买的个人 Google Account | 个人 Google 账号、支持国家/地区、年龄及具体功能资格限制；部分功能只在特定国家开放 | 打开 `https://one.google.com/`；提示核对 Google 账号、地区和套餐 | 目标账号用户核对并确认购买。**官方已证实** |
| Google AI Pro：家庭共享给指定对象 | Google One 家庭管理员付款 | 目标账号必须加入同一个 Google 家庭组；家庭成员使用各自 Google 账号 | 管理员 18 岁以上；成员必须与管理员同国家、使用个人 Google 账号、只能加入一个家庭组，且过去 12 个月不能加入其他家庭组；最多 5 名家庭成员；只有部分 AI 权益共享，部分限额为家庭共享池 | 打开 Google One 家庭共享设置；不能代发邀请或替成员接受家庭邀请 | 家庭管理员开启共享并邀请；目标成员接受加入。已在家庭组且共享已开启时，部分权益无需再操作。**官方已证实** |
| OpenAI API：为自己的 Organization 充值 | 具有账单管理权限的 API Organization 管理者；新 API 账号使用预付模式 | 余额归属于被选中的 API Organization，不是 ChatGPT 个人账号 | 初次购买最低 5 美元，默认 10 美元；信任等级限制余额上限；购买额度通常 1 年到期，日本 2026-11-13 后购买的额度 180 天到期；不可退款，法律/合同例外除外 | 打开 `https://platform.openai.com/`；提醒核对 Organization、金额、自动充值设置 | Organization 账单管理者确认购买。**官方已证实** |
| OpenAI API：替另一个 Organization 付款/赠送余额 | 目标 Organization 的 Owner 可管理组织和账单；外部付款人若被授予 Owner 会获得广泛组织权限 | 余额仍归目标 Organization；不存在“把个人余额发给某个邮箱”的模式 | 官方成员角色为 Owner / Reader；Owner 权限远大于单纯付款；不要为充值随意授予第三方 Owner | 只打开 API Platform；不自动邀请成员、不授予 Owner、不调用充值接口 | 目标 Organization Owner 确认。**余额转移/赠送：未找到公开依据；余额只记录在该 Organization；独立外部付款人 API：未找到公开依据** |
| OpenAI API：ChatGPT 订阅附带 API Credits 福利 | 合资格 ChatGPT Pro 或 Business 订阅持有人 | 额度进入一个被链接的 API Organization；同一邮箱，且激活人必须同时拥有相应 ChatGPT 订阅/工作区和接收 API Organization | Pro 100 / 200 / 500、符合条件的 Business 付费 Standard / Premium 席位；订阅需先有效至少 7 天；Plus、Free、Enterprise、Edu 不符合该福利；一个订阅/工作区只能链接一个 API Organization | 打开 ChatGPT 或 API Platform 官方入口；提醒选择正确 Organization | Pro 订阅 Owner + API Organization Owner 确认激活。**官方已证实；不是转赠余额** |
| Gemini API / AI Studio：为自己的项目充值 | Cloud Billing 账户付款人 | Gemini API 项目链接到 Cloud Billing 账户；预付余额存放在 Cloud Billing 账户的独立 Prepay 余额中 | AI Studio 项目需升级到 Paid tier；Prepay 额度通常 1 年到期且不可退款；支持自动补款；具体金额/资格在 AI Studio 展示 | 打开 `https://aistudio.google.com/`；提示核对 Project、Billing Account、Prepay / Auto-reload | 项目管理员和计费账户管理员确认。**官方已证实** |
| Gemini API：由另一账号承担目标项目费用 | 计费账户付款人 | 项目关联到指定 Cloud Billing 账户；余额属于 Billing Account，项目使用该账户付款；不是把余额转到目标邮箱 | 需要项目侧 `Project Billing Manager` 等权限和账单侧 `Billing Account User` 等权限；更换账户会影响该项目后续费用；跨客户共享计费账户若用于减少/规避费用可能违反 Google Cloud 条款 | R1 只打开 AI Studio / Cloud Console；不调用 `updateBillingInfo`，不自动改变计费关联 | 项目 Owner 授权、计费账户管理员确认；跨不同客户的代付须先取得 Google/合作方书面合规确认。**技术路径官方已证实；通用跨客户代付：需合作方书面授权/条款确认** |
| ChatGPT Business：管理员给指定成员席位 | Workspace Owner 负责席位容量和账单；Admin 可执行常规邀请 | 邀请发给指定邮箱；目标用户接受后进入 Business workspace | 个人 Plus/Pro 不等同于 Business；发送邀请不会购买或预留席位；只有接受时才检查席位；无可用席位时 Owner 需提供或购买 | 打开 `https://chatgpt.com/`；提示不要误开自动购买/自动加入流程 | Admin/Owner 邀请；目标成员接受；无席位时 Owner 购买。**官方已证实** |
| Google Workspace Gemini：管理员分配席位 | Workspace 客户或授权经销商先购买对应产品 SKU | 指定的组织用户获得已购买 SKU；目标必须是该 Workspace 中已创建的用户 | 具体 Gemini SKU、版型、区域、合同和是否包含在 Workspace 套餐中必须逐租户核实 | 打开 `https://admin.google.com/`；R1 不调用管理员 API | 有 License Management 权限的管理员分配；若 SKU 支持，可用 Enterprise License Manager API 并读取分配结果。**API 能力官方已证实，具体 Gemini SKU 必须核实** |

## 2.1 官方页面剩余步骤与结果可验证性

以下为常见路径的粗略步骤区间，不是固定承诺；是否需要登录、支付方式验证、地区确认、额外管理员审批，会改变实际点击次数。扩展本身每条路径最多只做一次“打开官方入口”。

| 路径 | 扩展动作 | 官方页面后续步骤（估算） | 谁做最后确认 | 扩展能否独立知道结果 | 可信结果依据 / 缺口 |
|---|---|---:|---|---|---|
| ChatGPT Plus / Pro 购买 | 1 次打开 ChatGPT | 约 3–5 步：核对账号、选择套餐、检查已有订阅、结账、付款确认 | 目标账号用户核对；付款人确认 | 否 | 只能由用户在目标账号计划页核对；未找到公开订阅状态 API |
| ChatGPT Credits 赠送 | 1 次打开 ChatGPT | 购买者约 4–5 步；收件人约 3–4 步：打开 claim link、登录、选择 Personal workspace/账号、Redeem | 购买者确认付款和发送；收件人确认 Redeem | 否 | 购买收据只证明礼品购买；只有收件人余额/官方页面能证明已领取；未找到 claim 状态 API |
| Google AI Pro 购买 | 1 次打开 Google One | 约 3–5 步：核对账号、选择计划、确认付款方式、完成订阅 | 目标账号用户/付款人 | 否 | 目标 Google Account 的 One 计划页；未找到公开个人订阅状态 API |
| Google AI Pro 家庭共享 | 1 次打开 Google One | 管理员约 2–4 步；新成员另需约 1–3 步接受家庭邀请 | 家庭管理员 + 目标成员 | 否 | 家庭组成员列表和目标账号的共享权益页；未找到公开家庭权益 API |
| OpenAI API 预充值 | 1 次打开 API Platform | 约 3–6 步：选 Organization、检查账单/Auto Recharge、选金额、检查付款方式、确认购买 | API Organization Owner / 账单管理者 | 否 | 官方 Billing Overview / Credits 页面；未找到公开充值/余额 API |
| Gemini API Prepay | 1 次打开 AI Studio | 约 4–7 步：选 Project、创建/关联 Billing Account、确认 Prepay、检查 Auto-reload、选择金额/支付方式、确认 | 项目管理员 + Billing Account 管理员 | 只能部分 | Cloud Billing API 可验证项目关联；AI Studio Dashboard 显示 Prepay 余额；未找到公开 Prepay 充值订单 API |
| ChatGPT Business 邀请 | 1 次打开 ChatGPT | 管理员约 3–4 步；成员约 1–3 步接受；缺席位时 Owner 另行购买 | Admin/Owner + 被邀请成员 | 否（R1） | Workspace Members 页面显示成员/席位；未使用公开自动邀请或购买 API |
| Google Workspace Gemini 席位 | 1 次打开 Admin Console | 管理员约 2–4 步；API 可在完成 OAuth 和 SKU 选择后调用一次分配接口 | License Management 管理员 | 有条件 | Enterprise License Manager API 可读取已分配 SKU；不等于证明发票/付款完成；必须确认租户实际 SKU |

**步骤数说明：** 以上只用于估算操作成本，不把登录、2FA、支付风控、银行验证和审批算成固定点击数。产品 UI 或地区变化后必须重新核查。

## 2.2 公开 API、文档化入口与合作方准入

| 能力 | 官方公开入口 / API | 能否用于扩展内直接购买或交付 | 判定 |
|---|---|---|---|
| ChatGPT Plus / Pro 购买 | ChatGPT 官网订阅 UI | 否；没有找到公开购买、指定收件人、付款或订阅状态 API | **未找到公开依据** |
| ChatGPT Credits 赠送 / Redeem | ChatGPT 官方 Web UI | 否；没有找到公开 gift purchase / claim / redemption API | **官方 UI 已证实；API 未找到** |
| Google AI Pro 购买 / 家庭共享 | Google One 官方 UI | 否；没有找到个人订阅购买、家庭组邀请或 AI 权益读取 API | **未找到公开依据** |
| OpenAI API 预充值 | API Platform Billing UI | 否；没有找到公开 add-funds / prepaid top-up API；Organization 管理接口不等于支付接口 | **未找到公开依据** |
| Gemini API Prepay | AI Studio Billing UI；Cloud Billing API 的 `projects.updateBillingInfo` | API 可以在权限满足时改变 Project 与 Billing Account 的关联；不能通过该 API 付款或购买 Prepay credits | **关联 API 已证实；支付 API 未找到** |
| ChatGPT Business 席位 | Workspace Settings / Members 官方 UI | 可邀请成员，但未找到公开购买席位/确认支付 API；邀请不预留席位 | **官方 UI 已证实；购买 API 未找到** |
| Google Workspace 已购许可证 | Admin Console；Enterprise License Manager API `licenseAssignments.insert` / `get` | 可以分配和查询已经购买、租户可用的 SKU；不能借此购买商品或完成付款 | **管理 API 已证实；具体 Gemini SKU 待租户核验** |

### 合作方通道判断

- 没有找到 OpenAI 或 Google 面向普通消费者的、可由任意第三方扩展调用的 ChatGPT Plus / Pro 或 Google AI Pro 赠送/代付生产 API。
- Google Workspace 存在官方授权经销商和 Enterprise License Manager API 路径，但它是组织许可证管理，不是个人 AI Pro 赠送。前提至少包括：正式经销商/客户关系、客户管理员授权、正确 Workspace customer、已购买且可分配的 product SKU、必要 OAuth scope 和 License Management 权限。
- Google Cloud Billing API 只处理项目计费关联。不同法律客户之间共享 Billing Account 可能触发 Google Cloud 条款限制；未获得 Google/授权合作方书面确认前，不把它作为通用代付产品。
- 任何第三方充值服务、私有接口或未公开合作通道均标记为 **需合作方书面授权**，不得因其页面、浏览器请求或第三方 HTML 重建而推定官方允许。

## 3. 关键路径拆解

### 3.1 ChatGPT 个人会员与赠送 Credits 必须分开

- OpenAI 明确：ChatGPT 订阅不能在账号间转移；为另一个账号购买时，必须登录希望获得订阅的目标账号，再在 ChatGPT 官网查看可用套餐。
- 这证明“权益归目标账号”，但不证明存在独立的访客付款或代付 API。
- 官方 Gift Credits 是独立的预付赠送购买：购买者付款后获得一次性领取链接；收件人登录合资格个人账号后领取。
- 输入收件人邮箱并不会将 claim link 绑定到该邮箱。任何获得完整链接的人都可能先兑换。因此扩展绝不能把 claim link 保存到本地事务、同步存储或后端日志中。
- Gift Credits 不能用来购买或替代 Plus / Pro 会员；ChatGPT Business / Enterprise workspace 本身不能购买或接收该礼品，Business 关联的 Personal workspace 有单独规则。

### 3.2 Google AI Pro 家庭共享不是任意账号赠送

- 家庭管理员购买并开启 Google One 家庭共享，最多可分享给 5 名家庭成员。
- AI Pro 家庭成员可获得部分 AI 功能和 Google AI Credits；某些产品使用限额在家庭成员间共享，部分权益（例如 Google Developer Program Premium、Colab 等）只给计划管理员。Google AI Credits 用于受支持的 Google AI 产品，不等同于 Gemini API / AI Studio 的 Cloud Billing Prepay 余额。
- 成员需要使用个人 Google Account；工作、学校或其他组织账号不能加入该家庭组。
- 家庭组成员与管理员必须同国家；成员过去 12 个月内不能属于其他家庭组。
- 因此“指定邮箱”不是充分的身份条件，必须在 Google 家庭组官方页面确认实际被邀请的 Google Account。

### 3.3 OpenAI API 的两种 Credits 不可混淆

- **付费预充值余额**：由 API Organization 的账单管理者在 API Platform 购买；余额属于 Organization。
- **ChatGPT 订阅附带的 API Credits 福利**：满足特定 Pro / Business 条件后，主动链接到一个 API Organization；要求同一邮箱、双方 Owner、API 账单管理权限、订阅有效至少 7 天。Business 席位本身不会自动赋予 API Organization 或项目访问权。
- 两种都不是 ChatGPT Plus / Pro 会员赠送；也不能把已经持有的余额转给其他 Organization。
- OpenAI 官方文档将 Auto Recharge 描述为账单余额低于阈值时的自动补款；首次预充值流程默认开启该选项，必须由付款人在官方页面检查。它不是扩展发起的扣款。

### 3.4 Gemini API 的外部计费关联有合规边界

- Google Cloud Billing 账户定义谁承担关联项目的使用费用，一个 Billing Account 可关联多个项目。
- 官方 UI 权限模型包括项目侧 `Project Billing Manager` + `Project Browser` + `Service Usage Viewer`（或 Project Owner），以及账单侧 `Billing Account User` + `Billing Account Viewer`（或 Billing Account Administrator）。
- 官方 Cloud Billing API 提供 `projects.updateBillingInfo`，但它只改变项目与 Billing Account 的关联，不是购买 Gemini API Prepay credits 的支付 API。该 REST 方法的文档对调用者写明项目和 Billing Account 的 ownership privileges 要求；Cloud Console 的最小 IAM 角色说明则针对控制台关联操作。不要把控制台的角色组合直接推断为 REST API 的充分授权。
- Google 文档特别提醒：把项目改关联到另一客户的 Billing Account，或允许另一客户使用自己的 Billing Account，如果目的是减少或规避费用，可能违反 Google Cloud 条款。
- 对于不同法律客户之间的代付/共享账户，不应在没有 Google 或授权合作方书面确认前实现。R1 不做此类自动关联。
- AI Studio 将 Prepay 添加到已有 Postpay Billing Account 时，账户状态可能先被修改；若用户确认修改后中途退出、未完成预付款，可能导致同一 Billing Account 下依赖 Prepay 的其他项目暂时无法使用 Gemini API。扩展不得代点该确认。
- Google Cloud 自动补款/自动续充是 Billing Account 侧配置，不是扩展主动付款。

### 3.5 企业席位与个人会员必须分开

- ChatGPT Business 有 Standard / Premium seats 和 Owner / Admin / Member 等角色。发送邀请不购买或预留席位，邀请被接受时才检查席位。Workspace discovery / auto-join 在特定设置下可能触发自动购买席位，R1 不启用它。
- Google Workspace 许可证 API 的前置条件是客户或经销商已购买产品 SKU、用户已创建；有 License Management 权限的管理员可通过 Enterprise License Manager API 分配、查询、更新或删除许可证。具体 Gemini SKU 必须先从租户的产品 SKU 列表确认，不可编造 productId / skuId。

## 4. 礼品卡与促销：独立分类

| 类型 | 能否交付 AI 权益 | 目标身份 / 限制 | R1 处理 |
|---|---|---|---|
| ChatGPT Gift Credits | 可以赠送 Credits；不能赠送 Plus / Pro 会员 | 领取链接一次性使用、30 天内领取、同币种；邮箱不绑定链接 | 只提示官方流程；不保存或转发 claim link |
| Google Play Gift Card / Play Balance | 是支付余额，不是 Google AI Pro 会员兑换码 | 可用于哪些订阅取决于国家/地区和具体商品；Google One 仅在部分国家/地区支持 Play Balance；美国 Google Play 余额的可购买清单不包括订阅，且 Play 内容不能在账号间转移 | 不将礼品卡标记为 AI Pro 礼品；提示在官方结账页核对支付方式 |
| Google AI Pro 学生促销 | 是符合资格者自己的促销/试用权益，不是通用赠送码 | 当前官方页面列出美国合资格高等教育学生可申请 12 个月试用；需 SheerID、个人 Google Account 和符合资格的付款方式；家庭组成员需先离开共享计划；验证和领取必须使用同一 Google Account | 不代领、不绕过资格核验 |
| OpenAI API 促销 Credits | 可以给已关联的 API Organization 使用 | 适用额度、到期、资格和关联组织由官方活动决定；不等于余额转让 | 仅提醒在官方页面确认 receiving Organization 和 grant 记录 |
| Google One AI Credits | 可分享给 Google 家庭组成员用于受支持的 Google 产品 | 由家庭计划管理员购买；部分产品限额共享；不是 Gemini API AI Studio Prepay 余额 | 与 Gemini API 余额分开显示 |

Google Play Gift Card 的用途还受国家/地区和币种约束。Google One 的帮助文档仅列出部分地区支持 Play Balance 作为会员付款方式；美国 Play Balance 可购买清单不包含订阅。不能把通用 Google Play 礼品卡宣传为全球可兑换 AI Pro 的礼品。

## 5. 官方自动补款 vs 扩展主动发起付款

| 机制 | 谁触发 | 发生什么 | R1 是否控制 |
|---|---|---|---|
| OpenAI API Auto Recharge | API Organization 的付款人预先配置阈值、目标余额和月度上限；服务端在条件满足时自动扣款 | 自动购买 API credits | 否；只提醒用户核对开关和上限 |
| Gemini API AI Studio Auto-reload | Cloud Billing 账户付款人配置自动补充 Prepay | 自动加载 Gemini API 预付额度 | 否；只打开 AI Studio 官方页面 |
| 扩展主动发起扣款 | 扩展代码发起支付或调用私有结账 | 可能导致实际资金扣除 | **禁止** |
| 扩展打开官方页面 | 用户点击扩展按钮 | 只创建一个官方网页标签页 | 允许；只记录 `official_page_opened_unverified` |

## 6. ChatGPT 与 Gemini 的最短可交付路径

### ChatGPT

**目标是 Plus / Pro 会员：**

1. 用户在扩展选择目标账号标签和 Plus / Pro。
2. 扩展打开 ChatGPT 官网。
3. 目标账号用户在官网确认当前账号、现有订阅和地区套餐。
4. 付款人确认官方结账。
5. 目标账号用户在账户设置中核对会员状态。

扩展最多完成第 2 步。不能读取实际登录身份，也不能将“页面已打开”记录为已付款。

**目标是给别人一份官方礼品：**

若收件人接受 Credits 而非会员，可使用官方 ChatGPT Credits gift。购买者在官网购买并安全发送 claim link；收件人自己登录目标个人账号并 Redeem。扩展不持有 claim link，也不声称已赠送。

**组织内长期席位：** 使用 ChatGPT Business 邀请；Owner/管理员与被邀请人分别确认。

### Gemini

**目标是 Google AI Pro 个人会员：**

- 目标账号属于同国家、符合资格的家庭组：家庭管理员购买并开启家庭共享；新成员接受邀请，已在家庭组成员可直接获得部分共享权益。
- 目标账号不属于该家庭组：目标账号用户在自己的 Google Account 登录后购买；没有公开证据支持任意邮箱礼品会员或跨账号转移。

**目标是 Gemini API：**

- 最稳妥路径是目标项目使用其所属客户/组织的 Cloud Billing 账户。
- 同一组织内由有权限的管理员建立项目与计费账户关联。
- 跨不同客户的代付/共享计费必须先获得 Google Cloud 条款和合作方书面确认；R1 不提供此功能。

## 7. 官方来源索引（2026-11-27 核查）

### OpenAI

1. [Gifting credits in ChatGPT](https://help.openai.com/en/articles/20001417-gifting-credits-in-chatgpt) — 礼品购买资格、claim link、30 天领取、收件账号、币种和安全规则。
2. [Troubleshooting ChatGPT subscription access and account changes](https://help.openai.com/en/articles/20001056-troubleshooting-chatgpt-subscription-access-and-account-changes) — 订阅不可转移；为另一个账号购买需登录目标账号。
3. [Setting up and managing prepaid API billing](https://help.openai.com/en/articles/8264644-setting-up-and-managing-prepaid-api-billing) — API 预付余额、最低购买、自动补款、过期和账单权限。
4. [Managing members in an API organization](https://help.openai.com/en/articles/4936812-managing-members-in-an-api-organization) — API Organization Owner / Reader 权限及邀请流程。
5. [API credits benefit for eligible ChatGPT subscriptions](https://help.openai.com/en/articles/20001626-api-credits-benefit-for-eligible-chatgpt-subscriptions) — Pro / Business 附带 API Credits 福利、7 天资格、同邮箱、Owner 和 Organization 绑定规则。
6. [Managing members, seat types, and roles in ChatGPT Business](https://help.openai.com/en/articles/8542216-managing-members-seat-types-and-roles-in-chatgpt-business) — Business 席位、邀请和席位可用性。

### Google

7. [Use Google AI Pro benefits](https://support.google.com/googleone/answer/14534406) — Google AI Pro 权益、AI Credits 和家庭共享说明。
8. [Start or stop sharing with your family](https://support.google.com/googleone/answer/9004015) — 家庭组资格、最多 5 人、AI 权益和 AI Credits 共享限制。
9. [Get a Google AI Pro membership](https://support.google.com/googleone/answer/16476811) — 个人订阅、地区和账号资格。
10. [What you can buy with your Google Play balance](https://support.google.com/googleplay/answer/6080850) — 礼品卡余额和订阅的国家/地区限制。

11. [Change your card & fix payment issues](https://support.google.com/googleone/answer/9003634) — Google One 对 Play Balance 的地区支持说明。
12. [Learn about the in-product Cloud Billing setup](https://docs.cloud.google.com/billing/docs/in-product-billing-setup) — Gemini API Prepay、Auto-reload、余额归属、过渡风险和监控方式。
13. [Enable, disable, or change billing for a project](https://docs.cloud.google.com/billing/docs/how-to/modify-project) — 项目与 Billing Account 关联、IAM 角色及跨客户条款提醒。
14. [Cloud Billing access control and permissions](https://docs.cloud.google.com/billing/docs/how-to/billing-access) — Billing Account 权限和付款操作。
15. [projects.updateBillingInfo API](https://docs.cloud.google.com/billing/docs/reference/rest/v1/projects/updateBillingInfo) — 项目计费关联 API；不是支付/充值 API。
16. [Enterprise License Manager API Developer's Guide](https://developers.google.com/workspace/admin/licensing/v1/how-tos/using) — 已购 SKU 的分配和查询。
17. [Claim a Google One student offer](https://support.google.com/googleone/answer/17422238) — 学生资格、SheerID、个人账号、美国 12 个月试用及账号绑定限制。

### 浏览器扩展

18. [Chrome Side Panel API](https://developer.chrome.com/docs/extensions/reference/api/sidePanel) — Manifest V3 Side Panel、权限和 Chrome 114+ 要求。
19. [Chrome Storage API](https://developer.chrome.com/docs/extensions/reference/api/storage) — `storage.local` 和 `storage` 权限。
20. [Chrome permissions list](https://developer.chrome.com/docs/extensions/reference/permissions-list) — `tabs` 权限的用途；普通 tabs API 方法通常不需要读取敏感 tab 属性的权限。
21. [Develop an extension for the Microsoft Edge sidebar](https://learn.microsoft.com/en-us/microsoft-edge/extensions/developer-guide/sidebar) — Edge `chrome.sidePanel` / `sidePanel` 权限支持。

---

**研究结论：** 不存在一个公开、统一、可把 ChatGPT Plus / Google AI Pro / OpenAI API credits / Gemini API prepay 直接发给任意指定邮箱的官方购买 API。可交付的共同能力是安全的官方流程交接；唯一值得在未来单独评估的管理 API 路径是 Google Workspace 已购 SKU 分配，以及在明确同一客户/组织边界内的 Google Cloud Billing 项目关联。
