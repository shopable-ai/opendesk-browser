# GrayDove（灰鸽）发布工作流

> 本目录是 GrayDove 品牌统一与 Chrome Web Store 发布的长期工作区。它记录决策、任务、依赖、合规要求和发布证据；**规划文档不代表功能已经实现，也不代表 Chrome Web Store 已审核通过。**

## 1. 当前产品品牌（英文拼写已确认，商标与域名待核验）

| 项目 | 当前决定 |
|---|---|
| 英文品牌 | **GrayDove** |
| 中文品牌 | **灰鸽** |
| 产品方向 | Browser Automation & Scripts |
| 中文定位 | 浏览器自动化与脚本工作台 |
| 首发平台 | Chrome Extension / Chrome Web Store |
| 首发商业模式 | 优先免费发布；本轮不开发支付、订阅或广告 |
| 内部仓库 | `shopable-ai/opendesk-browser`，暂时保留 |
| 内部工程标识 | `opendesk-browser`、API、Storage key、协议和模块标识原则上保留 |

2026-11-18 用户明确要求品牌拼写统一为美式 GrayDove；本目录 greydove 是历史发布文档路径，仍然保留，不代表对外产品名称。正式上架前需要核对 GrayDove 的同名软件及相关商标。

产品品牌和工程身份分离。除非有单独的迁移计划，不要为了对外改名而重命名仓库、包名、Native Messaging 协议、Storage 数据键或扩展身份。

## 2. 当前工作状态

**当前阶段：2026-11-18 已生成新的 GrayDove 0.1.0 Standard production ZIP，通过源码、品牌、16 项定向检查、严格包验证及 ZIP 逐文件核验；真实 Chrome、隐私、账号和商店发布仍未完成。**

**合并前的历史候选：Standard「GreyDove（灰鸽）」0.1.0 生产候选 ZIP 已生成并通过严格包验证；Developer 内部 production 也通过，34 项定向测试通过。真实 Chrome、商店截图、最终品牌复核、隐私披露和账号资料尚未完成，不是可直接提交审核的发行版。**

最新候选为 main `cdff7e777d45c7b3d0867042f0483a2c72c0b629` 加 37 个明确发布覆盖路径的独立源码副本；32 个未完成的并行路径未纳入。没有回退原工作区、覆盖日常开发输出，也没有提交、推送或上传。新的 [GrayDove 商店候选包](../../../artifacts/graydove/0.1.0-20261118/GrayDove-0.1.0-chrome-web-store.zip) 及图标、文案、回执已集中交付，候选身份与完整哈希见 [发布记录 §6](RELEASE-RECORD.md)。

2026-11-17 用户已确认支持邮箱 `thinkido666@gmail.com` 及中文商店文案；2026-11-18 明确英文名称统一为 GrayDove，中文保持灰鸽，见 [STORE-LISTING.md](STORE-LISTING.md)。发布者显示名称、官网、隐私政策 URL、账号资格和分发地区仍待定。

当前名称以根 Manifest、品牌规范及本轮 ZIP 内的 GrayDove 为准；以上旧拼写候选及其测试、ZIP 哈希只作为历史记录。

- [完整任务链路](TASK-PLAN.zh-CN.md)
- [2026-11-17 T0 发布现状审计报告](CURRENT-STATE-AUDIT.md)
- [品牌规范](BRAND-SPEC.md)
- [Chrome Web Store 商店资料草案](STORE-LISTING.md)
- [权限、隐私与合规审计](COMPLIANCE-AND-PRIVACY.zh-CN.md)
- [生产发布检查清单](RELEASE-CHECKLIST.zh-CN.md)
- [未来商业化规划](COMMERCIALIZATION-ROADMAP.zh-CN.md)
- [发布记录](RELEASE-RECORD.md)

状态只能由真实工作和对应证据更新：

- `NOT_STARTED`：尚未开始
- `IN_PROGRESS`：进行中
- `BLOCKED`：有明确阻塞
- `COMPLETED`：实施完成，但尚未独立验证
- `VERIFIED`：已按验收标准独立验证

不要用主观评分、代码修改数量或文档写完来代替验收。

## 3. 仓库审计基线（历史快照）

2026-11-17 17:37（北京时间）抓取远端并检查本地工作树的快照：

| 项目 | 结果 |
|---|---|
| 仓库 | `shopable-ai/opendesk-browser` |
| 默认分支 | `main` |
| 已抓取 origin/main | `5926662a802ea76babadf6b8d6837c872eb21448` |
| 本地 main HEAD | `0faddb6bb7293705bc6b4c257d8cea4936aab619` |
| 本地 HEAD 提交时间 | 2026-11-17 17:27:31 +08:00 |
| 本地/远端关系 | 领先 2 个提交、落后 0；未推送或整合提交 |
| 工作区 | 非干净；存在其他 Agent 的 wxt/editor 等修改，已保留；本轮仅更新三个允许文档 |
| Manifest | MV3，版本 `0.1.0` |
| 当前 Manifest 名称 | `GrayDove`（R1 源码调整，生产包待验证） |
| 当前 short_name | `GrayDove`（R1 源码调整，生产包待验证） |
| 最低 Chrome 版本 | `138` |
| 正式构建入口 | `npm run build` |
| 正式打包入口 | `npm run pack` |

这些 SHA 是审计快照，不是永久发布基线。旧 `ec8766088b4f290386cf05d5848b56f767ce6d06` 已归为历史。每次实施和发布前都必须重新读取最新 `main`，记录实际使用的 commit、工作区状态和候选产物身份。

### 已确认的关键工程事实

1. `manifest.json` 是当前扩展品牌信息的主要来源；`scripts/browser-editions-r245.mjs` 从根 Manifest 读取 Standard 名称和简称，并派生 Developer 名称。
2. `wxt.config.mjs` 在构建时生成 Manifest，Action 标题也会跟随扩展名称生成。
3. `scripts/verify-package.mjs` 对 Manifest 字段、资源集合、固定资源哈希和发行包内容执行严格校验。新增品牌图标必须同步进入构建、资源清单和验证规则。
4. 当前根 Manifest 没有正式扩展品牌 `icons` 字段；`scripts/prepare-public.mjs` 生成的 `icons/notification.png` 是通知图标，不应冒充扩展品牌图标。
5. Standard 与 Developer 是两种发行版本。初始公开发布默认只评估 Standard；Developer 是否独立上架必须另行证明其用户价值和商店合规性。
6. `manifest.json` 当前声明了全站 Host 权限和多项浏览器 API 权限，详见合规审计文档。
7. `src/marketplace/channel-config.json` 的 production origin、extensionId、acquireUrl、verifiedAt 当前为 `null`。这是现有市场外部连接配置状态，不等同于 Chrome Web Store 商品是否可以上架；只有在商品页面或产品功能依赖它时才构成相应阻塞。
8. 日常 `npm run dev` 默认 Developer，固定输出 `dist/development`；当前服务及磁盘产物存在，不能据此证明 Chrome 已应用 revision。旧 `dist/production` 为 Standard、0.1.0，Manifest 修改时间为 2026-11-13，未绑定当前 HEAD。详见报告第2节。
9. 报告第4节列出 94 个用户可见必改/待确认文件的审阅工作集，并区分内部身份、历史与测试；不是 94 个无条件必改文件。第6节分别列出十类功能源码、历史组件/构建/Chrome 证据和有限首发白名单。
10. 当前统计接收端点默认为空、同意默认为关闭，但源码有 Cloudflare/D1/PostHog 链；AI、云控、Cookie、代理也有实际数据路径。不能宣传“完全离线”“零上传”或“无数据处理”。
11. 最新抓取远端提交的六项 Actions 中五项失败，一项分支清理成功；不是全绿发布基线。本轮没有重新运行 CI 或修复无关失败，详情见报告第3节。

### 当前尚未证实的事项

- 已完成全仓文本检索和主要发行入口分类；未逐条语义审阅全部历史引用或进行全图片 OCR，T3 仍需最终包可见品牌复核。
- 后续已取得用户母版并原字节迁入 `src/assets/branding/graydove-master-1024.webp`，六个 PNG 已登记真实大小/哈希及 Manifest。详情见品牌规范 §3.1；真实 Chrome 小尺寸视觉验收及权利记录仍待核实。
- 尚未核实 Google 开发者账号的实际注册、付款、身份和商家声明状态。
- 已建立 16 项 required、9 项 optional 权限调用/缺口映射；必要性、完整数据流及真实服务部署/删除机制、最终隐私政策仍留 T5。
- 商店截图、官网、隐私政策网址、发布者名称及最终商品资料核对仍待完成；支持邮箱和中文文案已由用户提供。
- T0 仅做文档审计；后续已完成资源定向测试及隔离编译诊断。完整构建、ZIP 和 Chrome 以 [发布记录](RELEASE-RECORD.md) 的后续候选记录为准，旧 PASS 不晋升。

## 4. 视觉方向记录

已选定的视觉方向是深石墨灰/深蓝灰圆角方形底板、银灰色鸽子主体、简洁几何羽翼和电光蓝细节。鸽子应保持清晰轮廓和小尺寸辨识度。

当前唯一母版和六个正式 PNG 均在 `src/assets/branding/`，来源与哈希见 [品牌规范](BRAND-SPEC.md)。母版不进入扩展 ZIP，通知图标继续用于通知，不再创建另一套品牌源文件或文档目录。

## 5. 工作边界

### 本轮发布范围

- 品牌和视觉资源统一
- Manifest / WXT / UI 品牌信息
- 中英文商店资料
- 权限、隐私和商店合规审计
- 生产构建、真实 Chrome 验收、商店提交准备

### 明确不在首发品牌改造范围

- 不重写 Browser Framework 或自动化执行架构
- 不因品牌改名修改内部协议、存储结构或扩展身份
- 不顺便开发会员、支付、广告、订阅或市场分成
- 不把规划中的 AI、云同步、云执行或市场能力写成已交付功能
- 不未经单独授权提交商店审核或正式发布

### 凭证和个人资料

Google 账号、开发者后台截图中的个人地址、电话号码、支付信息、银行卡、API token、商户密钥和用户数据不得写入 Git。只记录状态、责任人和安全存储位置的非敏感引用。

## 6. 后续 AI / Codex 接续规则

每次继续本工作时：

1. 先读本文件和 [TASK-PLAN.zh-CN.md](TASK-PLAN.zh-CN.md)。
2. 重新核对最新远端 `main`、当前工作区和相关文件，不把历史 SHA 当作当前 HEAD。
3. 先查任务依赖和已有实现，再修改；优先复用现有构建、打包和验证机制。
4. 修改前列出具体目标、文件范围、依赖、风险和验收标准。
5. 保留其他开发者/Agent 的改动；遵循仓库根目录 `AGENTS.md` 的主分支、并行写入和 Git 操作约束。
6. 只更新有本轮证据支持的任务状态；记录测试命令、结果、候选 commit 和产物 SHA-256。
7. 区分源码完成、构建通过、真实 Chrome 验收、商店审核通过和正式发布。

## 7. 官方参考资料

- [Chrome Web Store Program Policies](https://developer.chrome.com/docs/webstore/program-policies)
- [Publish in the Chrome Web Store](https://developer.chrome.com/docs/webstore/publish)
- [Listing Requirements](https://developer.chrome.com/docs/webstore/program-policies/listing-requirements)
- [Use of Permissions / Privacy / Limited Use](https://developer.chrome.com/docs/webstore/program-policies/limited-use)
- [Accepting Payment From Users](https://developer.chrome.com/docs/webstore/program-policies/accepting-payment)
- [Ads](https://developer.chrome.com/docs/webstore/program-policies/ads)
- [Affiliate Ads](https://developer.chrome.com/docs/webstore/program-policies/affiliate-ads)

每次正式提交前重新核对官方最新版本；本目录中的政策摘要是规划依据，不替代法律意见或 Google 的最终审核决定。
