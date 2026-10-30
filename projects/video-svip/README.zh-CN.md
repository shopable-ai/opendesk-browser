# 视频会员 · Video SVIP R0.3（源码候选，Chrome 待验收）

正式展示名称：**视频会员**；品牌副名称：**SVIP**（仅品牌识别，不代表已提供超高级会员权益）。

正式产品源码：projects/video-svip/。独立 Side Panel 应用，复用 OpenDesk Host 与 Storage；官方目录采用 optional 安装。

## 原始目标
用户进入视频网站 → 识别页面 → 优先原站播放 → 遇到故障时提供明确恢复指引 → 后续在获得内容/渠道授权后接入稳定备援来源 → 管理合法会员权益/家庭席位 → 提供经授权的会员推广入口。

参考：https://github.com/88lin/video_vip 。只借鉴 SPA 识别、异步请求取消、状态展示与线路故障处理思路，不移植原项目 GPL-3.0 代码、未经授权的 VIP 解析源或原播放器劫持行为。

## 6 环节，3 期实施
1. 页面识别：P0 站点/标题/URL；P1 剧集准确识别。
2. 观看：P0 原站官方入口与影片链接分享；P1 页内播放诊断。
3. 异常恢复：P0 用户指引；P1 带独立验证的故障判断。
4. 备用线路：P2 仅接入合法授权内容，超时重试、健康度与断路器。
5. 会员：P0 本机手工登记有效期；P2 平台允许的 OAuth/API 或家庭席位邀请，不交换账号密码/Cookie。
6. 交易：P2 签约后的官方折扣、透明分销披露及商业指标，不预先开放虚假支付。

R0.3 在现有 currentPage.read、storage.local 基础上增加固定只读 `page.videoContext`，只允许经批准的官方 Video SVIP 与同一活动 Document 使用。无需改 SW/Runtime，也不修改网站播放器；不绕过 DRM/会员付费限制。

## 交互
观看/会员两个标签，优先展示活动页面影片、当前集数、状态、识别依据、原站观看、重新识别和 Stop。`preview/index.html` 加载同一份 `src/main.js` 和 `src/style.css`，模拟同 URL 换片、只有总集数、非视频页、权限错误及本机会员记录。预览数据并非真实播放证明。

## 数据和限制
只读取已授权活动网页的有限 DOM 标题、选中集数、页面版本与 URL；用户主动点击分享才复制脱敏链接；本机会员数据仅包含平台 id 与自填到期日期，使用 etag + ifMatch 防并发覆盖，不保存 Cookie、凭据、令牌、视频流 URL 或支付信息。
未经提供商许可，不销售他人会员权益、不代理共享个人账户、不使用未授权的盗播线路。

## 验收（不能虚报）
- NODE：node --test tests/environment/video-svip.test.mjs
- BUILD：npm run build:sidebar-tool -- projects/video-svip；npm run build:dev
- MAC_CHROME：真实 Chrome 安装后检查原站识别、分享、非视频页、导航、撤权及本机保存/恢复/删除。
- UI：320/360/400/440/520px、200% 缩放、明暗色与键盘。
- 播放诊断、稳定备用线路、付费与好友席位：NOT_IMPLEMENTED / NOT_TESTED。

## 命名与扩展商店搜索说明

- 扩展中心正式展示名称为「视频会员」，品牌副名称为「SVIP」。
- 正式 app id = video-svip（从旧实验 id video-pass 调整；老安装不能原地自动升级），用户搜索使用展示名及准确功能描述，不因改名而生成第二套目录或安装身份。
- 当前功能不是付费视频解锁工具，不应将「全网 SVIP 免费解锁」「去除会员限制」「百分百可用」作为搜索文案。
- 后续确实完成授权播放或会员合作服务后，才能在产品名称、页面及商店介绍中描述相应真实能力。

## R0.2 命名和演进决策（本版本）
- 唯一正式产品 ID：video-svip；用户看到的名称：视频会员；副品牌 Video SVIP。
- 源码已经重定位；禁止再创建 video-pass 的平行业务目录。
- 原参考脚本源码分析与可复用技术边界：REFERENCE-ANALYSIS.zh-CN.md。
- 差量功能顺序与验收：ROADMAP.zh-CN.md。
- 历史安装/本机数据保护：MIGRATION.zh-CN.md。
- 产品 ID 变化 **不是无损升级**：如已安装 video-pass，必须先检查和备份其 membership 记录，新产品的真正迁移当前仍为 NOT_IMPLEMENTED。
- R0.2 仅完成源码、名称与计划收敛，不声称已实现视频解析、首帧读取、授权备用源或好友共享。

## R0.3 增量与实测状态（不能把源码实现等同 Chrome 验收）

- `trusted/` 内新增固定 DOM inspect、SPA 事件 watch、官方 SHA/代际准入，Host 使用真实 DocumentId 绑定与二次读回；页面内容事件只触发重新检查。
- 五个国内平台 + YouTube + Netflix 为**待实站验证的适配配置**，本地 HTTP Fixture 单独使用 loopback 域名，不以国外站点猜测为 PASS。
- 有界 DOM 读取可输出 `recognized` / `needs-confirmation` / `unrecognized` / `unsupported` / `changing`；集数若无法确定只能是 `unknown`。
- 旧 `memberships` 数据结构、存储 key、条件写入保留；不会读取/搬移旧 `video-pass` 数据或继承旧授权。
- 本地验收步骤与证据等级请见 `R0.3-ACCEPTANCE.zh-CN.md`。在完成正式 Chromium/Real RunHost、Mac Chrome 和实站验收前，R0.3 仍是**待验收候选**。
