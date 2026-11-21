# GrayDove（灰鸽）品牌规范

## 1. 当前产品品牌（英文拼写已确认）

| 项目 | 规范 |
|---|---|
| 英文品牌 | **GrayDove** |
| 中文品牌 | **灰鸽** |
| 英文产品方向 | Browser Automation & Scripts |
| 中文产品定位 | 浏览器自动化与脚本工作台 |
| 首发产品 | Chrome Extension |
| Standard 对外名称 | GrayDove |
| Developer 内部发行名称 | GrayDove Developer（待最终确认是否保留该显示名称） |

2026-11-18 用户明确要求英文品牌使用美式拼写 `GrayDove`，中文保持「灰鸽」。商标与域名核验仍未完成。此前英式拼写方案作为历史记录保留；不可把同音两种拼写视为商标自动安全。

## 2. 品牌定位

GrayDove 是面向浏览器自动化、JavaScript 脚本开发和网页工具使用的工作台。

定位应体现：
- 用户可以在一个工作台中创建、运行和管理浏览器脚本与自动化任务。
- 产品面向普通用户和开发者，但商店介绍必须从实际用户价值出发。
- 不把尚未完成的云同步、AI 自动执行、在线市场、会员或跨浏览器支持写成当前能力。
- 不把“支持用户编写脚本”宣传成没有限制的任意远程代码执行。

英文方向：`Browser Automation & Scripts`

中文方向：`浏览器自动化与脚本工作台`

以上是品牌定位，不等于已经批准的 Chrome Web Store 完整描述。商店文案需通过实际功能白名单复核。

## 3. 视觉基准

Chrome 扩展图标方向（2026-11-21 更新）：

- 使用透明背景，让轮廓直接显示在浅色和深色工具栏上。原深色圆角底板版保留为品牌参考。
- 中心为向右飞行的银灰色鸽子。
- 鸽子使用简洁、现代、有速度感的几何羽翼结构。
- 主体以银灰、浅灰、深灰层次为主。
- 下侧羽翼保留蓝色点缀，外轮廓用灰蓝色描边，便于在浅色背景辨识。
- 整体简洁、克制、具有科技感，重点保证小尺寸轮廓辨识度。

避免：
- Windows 风格的灰色方格。
- 过多羽毛细节、复杂纹理和强烈立体效果。
- 16×16 尺寸下无法辨识的细线和小装饰。
- 将通知图标当成扩展品牌图标。

透明版以用户提供的原图为参考，保留向右飞行的灰鸽与蓝色羽翼，简化阴影和羽毛细节。

### 3.1 源文件与构建资源

品牌图像统一归属 [`src/assets/branding/`](../../../src/assets/branding/)，文件名与出包路径统一为 `graydove-*`。品牌规范、发布任务、商店资料与合规文档继续只在本 `docs/release/greydove/` 目录维护，不复制源图。

- `graydove-master-1024.webp`：归档原始深底品牌图，1024×1024、53,864 字节，SHA-256 为 `f8167febd91e1767633a8e6cdbd4c291c0c319d1e59b99e3409147f39febc986`。来自用户提供的 `assets/branding/greydove/GreyDove-master-1024.webp`，字节未改动。
- `graydove-icon.svg`：透明扩展图标的矢量源，用于导出 16、20、24、32、48、128 像素的 `graydove-<尺寸>.png`。
- 源图及 PNG 由 `scripts/build.mjs` 的既有 `src/` 输入扫描记录大小和 SHA-256；只有六个 PNG 经 `scripts/prepare-public.mjs` 的 `STATIC_RESOURCES` 复制为 `icons/graydove-<尺寸>.png`。
- 六个 PNG 的真实大小和 SHA-256 只在 [`scripts/build-contract.mjs`](../../../scripts/build-contract.mjs) 的 `BRAND_ICONS` 登记；准备资源时先核验源文件，包验证器的 `FIXED_ASSETS` 再核验构建输出。根 Manifest 的 `icons` 与 `action.default_icon` 引用全部六个尺寸，严格验证器只接受这些尺寸和路径。
- Standard / Developer 共用同一组图像；`icons/notification.png` 继续保持原通知用途、字节和哈希。既有权限、CSP、发行选择与资源预算不变。

如需重现导出，在 macOS 仓库根使用原系统 `sips`，逐尺寸执行以下命令；不得在正常构建中重新生成并自动接受新的哈希：

```sh
for size in 16 20 24 32 48 128; do
  sips -s format png -z "$size" "$size" \
    src/assets/branding/graydove-icon.svg \
    --out "src/assets/branding/graydove-$size.png"
done
```

此项仅完成资产与构建接入；真实 Chrome 工具栏/商店展示验收及素材商业使用权核查仍需各自证据，不能由构建通过代替。

## 4. 品牌与工程名称的边界

对外逐步统一：
- Chrome Web Store 商品名称和开发者可见的产品名称
- 扩展管理页、工具栏、Side Panel、设置页面的品牌展示
- 用户文档、产品介绍、支持页面和截图
- 公开发布资料

默认保留：
- GitHub 仓库 `shopable-ai/opendesk-browser`
- 本地项目目录
- `package.json` 的内部工程名称 `opendesk-browser`
- Native Messaging、API、Storage key、数据库 schema、消息协议和模块名
- 原扩展 ID、签名身份和用户数据
- 历史文档中为准确解释旧架构而保留的 OpenDesk 技术名称

不要使用全仓库无差别字符串替换。

## 5. Standard / Developer 发行规则

当前仓库从根 `manifest.json` 读取 Standard 品牌，并在 `scripts/browser-editions-r245.mjs` 中派生 Developer 名称。

建议：
- Standard：GrayDove，作为首发公开商品候选。
- Developer：GrayDove Developer，优先作为内部开发/验证发行。
- 是否需要第二个公开商品必须有独立用户定位、独立商品价值和政策审查，不能仅因为构建产物不同就单独上架。

short_name 当前有 <=12 字符的构建约束；`GrayDove` 长度符合该限制。最终仍以最新代码校验器为准。

## 6. 品牌可用性与知识产权（上架前阻塞项）

以下事项尚未完成：
- 目标国家/地区的商标数据库检索。
- 同类软件、浏览器扩展和科技服务的近似名称检索。
- 域名可用性和持有人核查。
- 社交媒体账号名称核查。
- 图标与字体、素材的商业使用权核查。
- Chrome Web Store 同名/近似商品核查。

在检查完成前，品牌已被项目负责人选定，但不能宣称商标已注册、名称无冲突或域名归项目所有。

## 7. 品牌修改验收

- [ ] 所有用户可见英文名称统一为 GrayDove。
- [ ] 所有用户可见中文名称统一为灰鸽。
- [ ] Standard 名称符合规范。
- [ ] Developer 名称按发行策略生成。
- [ ] 图标在 16、32、48、128 像素下清晰。
- [ ] 商店图标与产品 UI 视觉一致。
- [ ] 内部 API、Storage、Native Messaging 和扩展身份未被无意修改。
- [ ] 文案没有宣称未交付功能。
- [ ] 商标、域名和素材权利风险有记录。


## 8. R1 历史英式拼写域名预选（仅作旧方案留档）

> 本节为旧英式拼写下的候选记录，不能代替 GrayDove 当前域名的实时可注册性与商标核验。

当时计划继续采用英式拼写方案，不因为主域名当前无法取得而改名。这里记录 **40 个 .com 名称候选**，不是宣布这些域名可注册。2026-11-17 查询时，实时 RDAP 页面与注册商逐域名报价无法通过现有查询通道取得可归属的注册状态证据；因此任何未确认的状态一律为 UNKNOWN。没有网站或 DNS 不解析绝不是 AVAILABLE。

**主域名 greydove.com：** 暂按“暂不可直接注册”做商业决策，但本轮 RDAP / ICANN / 注册商实时证据不足，正式注册状态、公开出售与具体报价仍为 UNKNOWN；不发起购买询价。

### 有条件的前 12 个优先查询项

| 顺序 | 域名 | 注册状态 | 首年/续费 | 是否溢价 | 商标风险 | 0–100 语言/品牌适配预评 |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | greydovejs.com | UNKNOWN | UNKNOWN | UNKNOWN | 未完成官方商标检索 | 92（仅名称适配度，非购买评分） |
| 2 | getgreydove.com | UNKNOWN | UNKNOWN | UNKNOWN | 未完成官方商标检索 | 91（仅名称适配度，非购买评分） |
| 3 | greydovego.com | UNKNOWN | UNKNOWN | UNKNOWN | 未完成官方商标检索 | 90（仅名称适配度，非购买评分） |
| 4 | greydovehq.com | UNKNOWN | UNKNOWN | UNKNOWN | 未完成官方商标检索 | 90（仅名称适配度，非购买评分） |
| 5 | greydoveapp.com | UNKNOWN | UNKNOWN | UNKNOWN | 未完成官方商标检索 | 89（仅名称适配度，非购买评分） |
| 6 | usegreydove.com | UNKNOWN | UNKNOWN | UNKNOWN | 未完成官方商标检索 | 89（仅名称适配度，非购买评分） |
| 7 | gogreydove.com | UNKNOWN | UNKNOWN | UNKNOWN | 未完成官方商标检索 | 88（仅名称适配度，非购买评分） |
| 8 | mygreydove.com | UNKNOWN | UNKNOWN | UNKNOWN | 未完成官方商标检索 | 88（仅名称适配度，非购买评分） |
| 9 | greydoveweb.com | UNKNOWN | UNKNOWN | UNKNOWN | 未完成官方商标检索 | 87（仅名称适配度，非购买评分） |
| 10 | greydovekit.com | UNKNOWN | UNKNOWN | UNKNOWN | 未完成官方商标检索 | 87（仅名称适配度，非购买评分） |
| 11 | greydoveup.com | UNKNOWN | UNKNOWN | UNKNOWN | 未完成官方商标检索 | 86（仅名称适配度，非购买评分） |
| 12 | greydovelab.com | UNKNOWN | UNKNOWN | UNKNOWN | 未完成官方商标检索 | 85（仅名称适配度，非购买评分） |

上表是名称与记忆体验的**预评**，不是最终综合独立专家结论；注册状态、实际价格、商标硬条件未通过前，不存在可购买的 95 分合格域名。优先考虑简短、独立 .com；greydoveai / greydovepro / greydoveos 容易带来未交付能力或版本暗示，应降级。

### 第二梯队 28 个 .com 待验证项

| 域名 | 注册状态 | 价格/续费 | 溢价 |
| --- | --- | --- | --- |
| greydoveai.com | UNKNOWN | UNKNOWN | UNKNOWN |
| greydovedev.com | UNKNOWN | UNKNOWN | UNKNOWN |
| greydovetool.com | UNKNOWN | UNKNOWN | UNKNOWN |
| greydovehub.com | UNKNOWN | UNKNOWN | UNKNOWN |
| greydovecode.com | UNKNOWN | UNKNOWN | UNKNOWN |
| greydovenow.com | UNKNOWN | UNKNOWN | UNKNOWN |
| greydoveone.com | UNKNOWN | UNKNOWN | UNKNOWN |
| greydovebox.com | UNKNOWN | UNKNOWN | UNKNOWN |
| greydoveio.com | UNKNOWN | UNKNOWN | UNKNOWN |
| greydovex.com | UNKNOWN | UNKNOWN | UNKNOWN |
| greydoved.com | UNKNOWN | UNKNOWN | UNKNOWN |
| greydovel.com | UNKNOWN | UNKNOWN | UNKNOWN |
| greydovet.com | UNKNOWN | UNKNOWN | UNKNOWN |
| greydoveit.com | UNKNOWN | UNKNOWN | UNKNOWN |
| greydovepro.com | UNKNOWN | UNKNOWN | UNKNOWN |
| greydoveos.com | UNKNOWN | UNKNOWN | UNKNOWN |
| greydoveui.com | UNKNOWN | UNKNOWN | UNKNOWN |
| greydoveon.com | UNKNOWN | UNKNOWN | UNKNOWN |
| greydoveco.com | UNKNOWN | UNKNOWN | UNKNOWN |
| greydovedo.com | UNKNOWN | UNKNOWN | UNKNOWN |
| trygreydove.com | UNKNOWN | UNKNOWN | UNKNOWN |
| higreydove.com | UNKNOWN | UNKNOWN | UNKNOWN |
| greydovework.com | UNKNOWN | UNKNOWN | UNKNOWN |
| greydovesdk.com | UNKNOWN | UNKNOWN | UNKNOWN |
| greydovecli.com | UNKNOWN | UNKNOWN | UNKNOWN |
| greydoveplus.com | UNKNOWN | UNKNOWN | UNKNOWN |
| greydoves.com | UNKNOWN | UNKNOWN | UNKNOWN |
| greydovely.com | UNKNOWN | UNKNOWN | UNKNOWN |

其他主流后缀待查：greydove.dev、greydove.app、greydove.io、greydove.net（全部 UNKNOWN，优先级低于可接受的 .com）。

### 唯一推荐操作链

1. 先在 ICANN Lookup / registry RDAP 查注册状态与更新时间，并保存结果；对 .com 选择 Verisign 注册局数据与 ICANN 查询交叉核验。
2. 在一个实际注册商按候选查询购物车状态、首年价格、续费、溢价与税费，并对另外一家注册商复核；查询失败保持 UNKNOWN。
3. 在 USPTO、WIPO Global Brand Database 和目标市场官方商标系统检索当时英式拼写品牌的文字、近似拼写和软件/浏览器相关类别；同名/近似的重大风险为硬阻断，不得用加后缀域名来豁免商标权。
4. 通过以上硬门槛后，再由品牌、增长、域名投资、商标、国际化专家独立评分并加权平均；不能把“尚未查询”写成“已核验”。
5. 未获得“可购买 + 价格合理 + 商标冲突已评估”三项证据，结论是 **暂不注册、继续沿用当时的品牌方案**。不购买、不修改 DNS、不把未知域名写入任何生产配置。

参考入口：https://lookup.icann.org/en/；https://rdap.verisign.com/com/v1/；https://www.namecheap.com/domains/；https://www.uspto.gov/trademarks/search；https://www.wipo.int/en/web/global-brand-database/index 。


## 9. R2 历史方案纠偏与 R3 新定位：GrayDove / 灰哥哥（2026-11-17）

> **用户业务纠正优先于旧方案。** 旧 R2 将“灰哥哥”定位为面向普通用户的网页教程、指导品牌，此假设已被用户明确纠正，**不再作为现行产品目标**。新定位：GrayDove 面向通用、合规的浏览器脚本与自动化；灰哥哥 Huigege 倾向增长、营销、运营自动化及平台规则边界更复杂的业务。实际可能涉及“灰产”并不表示所有运营自动化违法；也不意味着应隐藏或美化非法行为。

### 9.1 术语分类：英文不是 Gray Market

| 英文 | 常用中文 | 是否适合作为对外产品定位 |
| --- | --- | --- |
| Gray-hat / Grey-hat tactics | 灰帽策略、规则边缘操作 | 可用于内部风险研究，不推荐作为公众品牌主文案 |
| Growth hacking / Growth marketing | 增长黑客、增长营销 | 描述获客增长方法；本身不意味着违法或违规 |
| Marketing automation | 营销自动化 | 适合作为明确的功能类别，但必须确实实现 |
| Growth operations / GrowthOps | 增长运营 | 推荐灰哥哥候选业务定位 |
| Outreach automation / Lead generation | 触达自动化 / 潜在客户获取 | 仅适用于有合法数据来源、适当同意和平台许可的具体流程 |
| Traffic arbitrage | 流量套利 | 仅当实际业务涉及该模式才使用，不泛指灰产 |
| Black-hat / account farming / fake engagement | 黑帽、批量养号、虚假互动 | 高风险甚至违规/违法，不做品牌卖点、产品承诺或规避规则的实施目标 |
| Gray market / Grey market | 平行进口、非官方交易市场 | **不等于中国互联网语境的“灰产”**，不建议用于产品定位 |

术语参考：Cambridge https://dictionary.cambridge.org/dictionary/english/grey-market 、 https://dictionary.cambridge.org/dictionary/english/growth-hacking ；Optimizely https://www.optimizely.com/optimization-glossary/growth-hacking 。

### 9.2 推荐产品分工

| 维度 | GrayDove（灰鸽） | 灰哥哥（Huigege，业务候选） |
| --- | --- | --- |
| 首要用户需求 | 自定义网页功能、执行审阅过的自动化任务 | 运营流程、增长分析、营销动作和跨工具工作流 |
| 定位语言 | Browser Automation & Scripts | **Growth Operations & Marketing Automation**（待用户场景证据） |
| 核心产品形态 | 现有 Chrome 扩展 Standard，首发不变 | 未来独立的运营自动化应用/服务/任务包，载体待定 |
| 用户 | 开发者、进阶浏览器用户、一般效率工具用户 | 内容运营、市场增长、业务运营团队 |
| 可复用技术 | OpenDesk Browser SDK / Host / Task Runner 等经过授权的基础能力 | 仅通过公开、安全、受控的接口复用；不能复用 GrayDove 品牌、权限和扩展身份来隐蔽执行高风险动作 |
| 当前证据状态 | 已有源码与发布准备工作，具体功能仍需发行包验收 | **仅业务方向，未建立功能白名单和真实产品验收，不宣称已上线** |

**产品定义不是“白色外壳 + 灰色隐藏能力”。** GrayDove 的公开发行包必须保持其披露的完整功能、独立单一主要用途与最小必要权限；灰哥哥即使采用不同域名/名称，也必须诚实披露其运营自动化功能、数据处理与风险。更换域名、扩展 ID 或开发者账号不能用于规避审查或平台限制。

### 9.3 必须先做的业务风险分类

| 等级 | 典型场景 | 处理原则 |
| --- | --- | --- |
| GREEN：通常可评估 | 自有网站和账号的工作流、经授权的数据导入、CRM 跟进、合规内容排期 | 按来源授权、数据隐私、平台 API 和真实场景验收 |
| AMBER：需逐平台、逐地区审核 | 自动回复、潜客触达、资料采集、跨平台任务或有高频操作的营销流程 | 先核对服务条款、API/授权、用户同意与频率限制，不能凭“人工也能做”认定可自动化 |
| RED：不得作为产品目标 | 冒用他人、虚假账号/评论/点赞、垃圾私信、验证码或风控绕过、规避限流与封禁、未授权访问或采集 | 不实现，不承诺，不通过 GrayDove 作为跳板；违法和平台违规风险不因称为“灰帽”而消失 |

平台示例：LinkedIn 明确限制未授权的第三方网页自动化及虚假互动；X 的官方自动化规则区分允许的 API 场景与禁止的网页脚本自动化、滥发消息。Chrome Web Store 禁止隐瞒功能、滥发消息及发布基本相同的重复扩展。来源：https://www.linkedin.com/help/linkedin/answer/a1341543 、https://help.x.com/en/rules-and-policies/x-automation 、https://developer.chrome.com/docs/webstore/program-policies/spam-and-abuse 、https://developer.chrome.com/docs/webstore/program-policies/policies 。

### 9.4 双产品技术边界（仅方案，不实施第二扩展）

~~~text
共同的、经审计的底层技术（OpenDesk 内部工程名及 SDK 契约保留）
├── GrayDove / 灰鸽（正式首发）
│   ├── 浏览器脚本、运行和任务管理
│   ├── 公布真实权限、保护用户数据
│   └── Chrome Web Store Standard（保持现有发行身份）
└── 灰哥哥 / Huigege（增长运营业务待验证）
    ├── 运营任务模型、审批、执行记录与撤销
    ├── 按平台规则选择官方 API 或获得明确许可的执行方式
    ├── 单独的数据源/用户同意/平台合规和业务审核
    └── 只有具备独立主要用途与经过真实验证，才评估独立产品
~~~

**不要过早拆仓库、复制 Host/脚本引擎或上线第二份换皮扩展。** 产品边界先靠任务所有权、接口、权限、审阅和数据隔离定义；共享代码不会自动消除两个品牌的关联风险。第二产品上线时需证明真实核心业务差异，并独立完成审核。既有 GrayDove 首发包不因本轮讨论而加载任何未经披露的灰哥哥业务能力。

### 9.5 域名、名称与图标

- 用户报告 `huigege.com` 可注册；域名实际注册局/注册商可用性、成交与续费、法律权利和所有者均未在此处独立核验，保持 **UNKNOWN**。未经确认不购买、不改 DNS、不绑定生产配置。
- “灰哥哥”中文更口语化，`huigege` 容易拼写记忆，适合独立运营品牌；但与 GrayDove 不是同一个名称的中英直译。“灰鸽鸽”为音义候选，不擅自更名。
- 两者可以共享“灰色鸽子”视觉元素，但只有在取得原图及商业使用权、明确产品关系后才使用；GrayDove 现有正式图标与发行阻塞仍按既有发布清单办理。
- 若灰哥哥实际包含平台违规/违法业务，单纯拆分品牌不使其合规，也不能让 GrayDove 规避相关责任和安全风险。

### 9.6 本轮执行边界

本轮仅纠正品牌产品定位文档；**不修改** GrayDove Manifest、Chrome 扩展 ID、storage key、Native Messaging、执行代码、现有 Store Listing 或 Standard/Developer 构建机制；不启动高风险业务开发、不制作营销绕审文案、不注册域名。

**后续真正需要的业务证据：** 从灰哥哥计划中的 3–5 个具体运营场景抽象出输入、输出、平台、合法授权、用户同意、平台 API/条款与失败恢复，再决定是不是要有第二个应用。灰哥哥不是“灰产操作的万能平台”。


## 10. R4 英文拼写重新开放：GrayDove（2026-11-17）

用户明确此前并未最终决定英文品牌拼写，授权直接修改。**当前发行候选临时采用 GrayDove（美式常见拼写），中文仍为灰鸽；但正式商标/域名尚未核实，因此不表述为“不可更改的既定品牌”。**

- 已知同名事实：Steam 的《Momento Isles》开发者与发行商显示为 **GrayDove**（来源：https://store.steampowered.com/app/4059460/）。这是软件/游戏领域的真实同名风险，不等于已证明商标侵权；须核查商标权、使用时间、类别和目标市场。不可在未经核查前声称名称独占。
- 对比：Gray 属美式主流写法，Grey 属英式/澳式主流写法（来源：https://www.dictionary.com/articles/gray-vs-grey）；**词典里的频率不等于品牌搜索量或商标可用性**。
- 需要独立查询：graydove.com、graydoveai.com、getgraydove.com、usegraydove.com、graydove.app、graydove.dev，并同时保留原英式拼写方案作为回退。上述域名均未通过本轮注册商/RDAP 实时确认，状态为 UNKNOWN；未取得的域名不得写入生产配置。
- 产品名称暂为 **GrayDove / 灰鸽**；Standard 由根 Manifest 提供，Developer 继续按原派生器生成 GrayDove Developer；无须改动内部仓库、API、Storage、Native Messaging、扩展 ID、签名或既有协议。路径 docs/release/greydove 是历史稳定引用，不在此次重命名中迁移。
- 所有 CWS 商店正文和用户可见标题在本候选中统一 GrayDove；如 USPTO/WIPO/CNIPA 等官方检索发现不可接受的近似冲突，应在正式上传审核前重新选名、重建 ZIP，而不是使用该候选绕过商标风险。
- 商店发版继续受真实 128px 图标、截图、隐私数据流、权限及同源 Chrome 验收门禁约束。名称修改本身不意味着已可提交审核。
