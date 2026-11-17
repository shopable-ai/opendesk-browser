# GreyDove（灰鸽）品牌规范

## 1. 已确认的品牌决策

| 项目 | 规范 |
|---|---|
| 英文品牌 | **GreyDove** |
| 中文品牌 | **灰鸽** |
| 英文产品方向 | Browser Automation & Scripts |
| 中文产品定位 | 浏览器自动化与脚本工作台 |
| 首发产品 | Chrome Extension |
| Standard 对外名称 | GreyDove |
| Developer 内部发行名称 | GreyDove Developer（待最终确认是否保留该显示名称） |

品牌大小写固定为 `GreyDove`。中文固定为「灰鸽」。不要使用 Grey Dove、GrayDove、Grey Pigeon 等变体。

## 2. 品牌定位

GreyDove 是面向浏览器自动化、JavaScript 脚本开发和网页工具使用的工作台。

定位应体现：
- 用户可以在一个工作台中创建、运行和管理浏览器脚本与自动化任务。
- 产品面向普通用户和开发者，但商店介绍必须从实际用户价值出发。
- 不把尚未完成的云同步、AI 自动执行、在线市场、会员或跨浏览器支持写成当前能力。
- 不把“支持用户编写脚本”宣传成没有限制的任意远程代码执行。

英文方向：`Browser Automation & Scripts`

中文方向：`浏览器自动化与脚本工作台`

以上是品牌定位，不等于已经批准的 Chrome Web Store 完整描述。商店文案需通过实际功能白名单复核。

## 3. 视觉基准

用户已选定的主图标方向：

- 深石墨灰、深蓝灰色的圆角方形背景。
- 中心为向右飞行的银灰色鸽子。
- 鸽子使用简洁、现代、有速度感的几何羽翼结构。
- 主体以银灰、浅灰、深灰层次为主。
- 鸽子尾翼下方保留电光蓝色装饰。
- 整体简洁、克制、具有科技感，重点保证小尺寸轮廓辨识度。

避免：
- Windows 风格的灰色方格。
- 过多羽毛细节、复杂纹理和强烈立体效果。
- 16×16 尺寸下无法辨识的细线和小装饰。
- 将通知图标当成扩展品牌图标。

本文件只记录已选方向。正式实施必须核对原始参考图和源文件；若无法取得原图，不得假称已使用它，也不得擅自用另一张图替换。

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
- Standard：GreyDove，作为首发公开商品候选。
- Developer：GreyDove Developer，优先作为内部开发/验证发行。
- 是否需要第二个公开商品必须有独立用户定位、独立商品价值和政策审查，不能仅因为构建产物不同就单独上架。

short_name 当前有 <=12 字符的构建约束；`GreyDove` 长度符合该限制。最终仍以最新代码校验器为准。

## 6. 品牌可用性与知识产权

以下事项尚未完成：
- 目标国家/地区的商标数据库检索。
- 同类软件、浏览器扩展和科技服务的近似名称检索。
- 域名可用性和持有人核查。
- 社交媒体账号名称核查。
- 图标与字体、素材的商业使用权核查。
- Chrome Web Store 同名/近似商品核查。

在检查完成前，品牌已被项目负责人选定，但不能宣称商标已注册、名称无冲突或域名归项目所有。

## 7. 品牌修改验收

- [ ] 所有用户可见英文名称统一为 GreyDove。
- [ ] 所有用户可见中文名称统一为灰鸽。
- [ ] Standard 名称符合规范。
- [ ] Developer 名称按发行策略生成。
- [ ] 图标在 16、32、48、128 像素下清晰。
- [ ] 商店图标与产品 UI 视觉一致。
- [ ] 内部 API、Storage、Native Messaging 和扩展身份未被无意修改。
- [ ] 文案没有宣称未交付功能。
- [ ] 商标、域名和素材权利风险有记录。


## 8. R1 域名预选与未解决证据（2026-11-17）

品牌继续使用 GreyDove，不因为主域名当前无法取得而改名。这里记录 **40 个 .com 名称候选**，不是宣布这些域名可注册。2026-11-17 查询时，实时 RDAP 页面与注册商逐域名报价无法通过现有查询通道取得可归属的注册状态证据；因此任何未确认的状态一律为 UNKNOWN。没有网站或 DNS 不解析绝不是 AVAILABLE。

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
3. 在 USPTO、WIPO Global Brand Database 和目标市场官方商标系统检索 GreyDove 的文字、近似拼写和软件/浏览器相关类别；同名/近似的重大风险为硬阻断，不得用加后缀域名来豁免商标权。
4. 通过以上硬门槛后，再由品牌、增长、域名投资、商标、国际化专家独立评分并加权平均；不能把“尚未查询”写成“已核验”。
5. 未获得“可购买 + 价格合理 + 商标冲突已评估”三项证据，结论是 **暂不注册、继续使用 GreyDove 品牌**。不购买、不修改 DNS、不把未知域名写入任何生产配置。

参考入口：https://lookup.icann.org/en/；https://rdap.verisign.com/com/v1/；https://www.namecheap.com/domains/；https://www.uspto.gov/trademarks/search；https://www.wipo.int/en/web/global-brand-database/index 。
