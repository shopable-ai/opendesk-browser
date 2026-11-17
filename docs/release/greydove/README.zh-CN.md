# GreyDove（灰鸽）发布工作流

> 本目录是 GreyDove 品牌统一与 Chrome Web Store 发布的长期工作区。它记录决策、任务、依赖、合规要求和发布证据；**规划文档不代表功能已经实现，也不代表 Chrome Web Store 已审核通过。**

## 1. 已确定的产品决策

| 项目 | 当前决定 |
|---|---|
| 英文品牌 | **GreyDove** |
| 中文品牌 | **灰鸽** |
| 产品方向 | Browser Automation & Scripts |
| 中文定位 | 浏览器自动化与脚本工作台 |
| 首发平台 | Chrome Extension / Chrome Web Store |
| 首发商业模式 | 优先免费发布；本轮不开发支付、订阅或广告 |
| 内部仓库 | `shopable-ai/opendesk-browser`，暂时保留 |
| 内部工程标识 | `opendesk-browser`、API、Storage key、协议和模块标识原则上保留 |

产品品牌和工程身份分离。除非有单独的迁移计划，不要为了对外改名而重命名仓库、包名、Native Messaging 协议、Storage 数据键或扩展身份。

## 2. 当前工作状态

**当前阶段：商店资料 R1 与最小用户可见品牌元数据调整已进入源码阶段；生产构建、真实 Chrome、图标、隐私与商店发布仍未完成。**

- [完整任务链路](TASK-PLAN.zh-CN.md)
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

## 3. 仓库审计基线

本轮只读核对的远端基线：

| 项目 | 结果 |
|---|---|
| 仓库 | `shopable-ai/opendesk-browser` |
| 默认分支 | `main` |
| 本次读取的基线 Commit | `ec8766088b4f290386cf05d5848b56f767ce6d06` |
| 基线提交时间 | 2026-11-17 07:47:30 UTC |
| Manifest | MV3，版本 `0.1.0` |
| 当前 Manifest 名称 | `GreyDove`（R1 源码调整，生产包待验证） |
| 当前 short_name | `GreyDove`（R1 源码调整，生产包待验证） |
| 最低 Chrome 版本 | `138` |
| 正式构建入口 | `npm run build` |
| 正式打包入口 | `npm run pack` |

该 SHA 是本轮审计快照，不是永久发布基线。每次实施和发布前都必须重新读取最新 `main`，记录实际使用的 commit、工作区状态和候选产物身份。

### 已确认的关键工程事实

1. `manifest.json` 是当前扩展品牌信息的主要来源；`scripts/browser-editions-r245.mjs` 从根 Manifest 读取 Standard 名称和简称，并派生 Developer 名称。
2. `wxt.config.mjs` 在构建时生成 Manifest，Action 标题也会跟随扩展名称生成。
3. `scripts/verify-package.mjs` 对 Manifest 字段、资源集合、固定资源哈希和发行包内容执行严格校验。新增品牌图标必须同步进入构建、资源清单和验证规则。
4. 当前根 Manifest 没有正式扩展品牌 `icons` 字段；`scripts/prepare-public.mjs` 生成的 `icons/notification.png` 是通知图标，不应冒充扩展品牌图标。
5. Standard 与 Developer 是两种发行版本。初始公开发布默认只评估 Standard；Developer 是否独立上架必须另行证明其用户价值和商店合规性。
6. `manifest.json` 当前声明了全站 Host 权限和多项浏览器 API 权限，详见合规审计文档。
7. `src/marketplace/channel-config.json` 的 production origin、extensionId、acquireUrl、verifiedAt 当前为 `null`。这是现有市场外部连接配置状态，不等同于 Chrome Web Store 商品是否可以上架；只有在商品页面或产品功能依赖它时才构成相应阻塞。

### 当前尚未证实的事项

- 尚未完成全仓库所有用户可见品牌引用的穷举审计。
- 尚未确认最终品牌图标源文件已进入仓库并纳入生产包。
- 尚未核实 Google 开发者账号的实际注册、付款、身份和商家声明状态。
- 尚未完成权限逐项代码调用映射、完整数据流审计和最终隐私政策。
- 尚未完成商店截图、官网、支持联系方式和正式商品资料。
- 本轮没有构建、安装、测试或上传生产候选包。

## 4. 视觉方向记录

已选定的视觉方向是深石墨灰/深蓝灰圆角方形底板、银灰色鸽子主体、简洁几何羽翼和电光蓝细节。鸽子应保持清晰轮廓和小尺寸辨识度。

当前文档记录的是设计决策，不是图标文件本身。实施时必须定位用户最终选定的原始参考图和正式导出资产；不能用通知图标、临时占位图或未经确认的新设计代替。

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
