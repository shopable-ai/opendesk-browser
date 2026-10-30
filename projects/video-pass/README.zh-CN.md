# VideoPass · 视频通行证 R0.1

正式产品源码：projects/video-pass/。独立 Side Panel 应用，复用 OpenDesk Host 与 Storage；官方目录采用 optional 安装。

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

P0 使用现有 currentPage.read 与 storage.local，不修改宿主 SW、Runtime 或网站播放器；不绕过 DRM/会员付费限制。

## 交互
观看/会员两个标签，页面当前源与授权备援源明显区分。preview/index.html 加载同一份 src/main.js 和 src/style.css，在普通浏览器中可演示正常页、非视频页、权限错误及本机会员记录。预览数据并非真实播放证明。

## 数据和限制
只读取当前页的 URL/标题；用户主动点击分享才复制脱敏链接；本机会员数据仅包含平台 id 与自填到期日期，使用 etag + ifMatch 防并发覆盖，不保存 Cookie、凭据、令牌、视频流 URL 或支付信息。
未经提供商许可，不销售他人会员权益、不代理共享个人账户、不使用未授权的盗播线路。

## 验收（不能虚报）
- NODE：node --test tests/environment/video-pass.test.mjs
- BUILD：npm run build:sidebar-tool -- projects/video-pass；npm run build:dev
- MAC_CHROME：真实 Chrome 安装后检查原站识别、分享、非视频页、导航、撤权及本机保存/恢复/删除。
- UI：320/360/400/440/520px、200% 缩放、明暗色与键盘。
- 播放诊断、稳定备用线路、付费与好友席位：NOT_IMPLEMENTED / NOT_TESTED。
