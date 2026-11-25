# Slots Fairness Verifier · 竞品截图与信息设计参考 R1

适用产品：OpenDesk Browser / projects/slots-fairness/ 。用途只限于研究**公开的公平性验证证据 UI**，不推荐参与博彩、下注或导流。本页截图来自第三方公开资料，品牌、视觉资产、算法和玩法不属于 OpenDesk；**不复制站点图标/商标/完整界面进入正式产品**。

**归档状态：截图 URL、来源页面、带说明的图像预览均已保存到本项目文档，可在 GitHub Markdown 中直接查看；因本轮执行环境对第三方图片 CDN 的原始文件下载失败，下面的 PNG/WebP 仍为外部链接，未复制二进制到仓库。不能冒充“原图已本地归档”。** 未来需要离线源文件时先确认公开仓库中的引用/再分发许可，再用获批联网环境下载并核对 SHA256、来源和许可证。禁止以其他截图假装原版图片。

## S01 · Stake 日语 Provably Fair 验证字段

![Stake Japanese verification UI — external source](https://cdn.sanity.io/images/tdrhge4k/stake-com-production/9a1d4ed3219948673a495069d51d31e5f30c8b7c-1427x1053.png)

- 原始来源页：https://stake.com/ja/blog/jp-blog-provablyfair
- 原图地址：https://cdn.sanity.io/images/tdrhge4k/stake-com-production/9a1d4ed3219948673a495069d51d31e5f30c8b7c-1427x1053.png
- 借鉴：Server Seed / Server Seed Hash / Client Seed / Nonce 的字段分组、已公开 vs 当前 commitment 的区分、多语言字段文字。
- 不借鉴：下注验证按钮的博彩业务指向、网站品牌配色、盈利/博彩导流。
- 风险：即使哈希匹配，也需独立事前记录；不能冒充已验证游戏结果。

## S02 · CryptoMines 公开验证弹窗：Seeds / Verify / History / How It Works

![CryptoMines verification modal — external source](https://docs.cryptomines.app/assets/provably-fair-verify.webp)

- 原始来源页：https://docs.cryptomines.app/game-modes/provably-fair/
- 原图地址：https://docs.cryptomines.app/assets/provably-fair-verify.webp
- 借鉴：将「输入证据」「验证结果」「历史记录」「帮助」分区，**尤其是用户后续打开侧栏时查看历史**。
- 不借鉴：变更种子、改变结果、下注目标等业务控件；它的 Dice/其他玩法也不能直接用作 Slots 算法。

## S03 · Stake 社区示例：可复查的随机数计算步骤

![Stake forum calculation breakdown — external source](https://stake-forum.s3.eu-west-2.amazonaws.com/monthly_2022_07/image.png.ceab5f9fee9e55e1b3fb0e5f512dd298.png)

- 原始来源页：https://stakecommunity.com/topic/7293-bet-verification-provably-fair/
- 原图地址：https://stake-forum.s3.eu-west-2.amazonaws.com/monthly_2022_07/image.png.ceab5f9fee9e55e1b3fb0e5f512dd298.png
- 借鉴：计算的中间步骤、显示结果与本地计算值对照、出错差异说明。
- 不借鉴：把 Dice 的 HMAC 派生公式假设为所有 Slots 通用公式；技术计算步骤放「查看证据」详情，不占 Side Panel 首页。

## S04 · BC.Game 社区公开计算结果（额外对照）

![BC Game community verification screenshot — external source](https://forum.bc.game/uploads/monthly_2022_06/image.png.12946ccb10720701fddfe97e11477a7e.png)

- 原始来源页：https://forum.bc.game/topic/9953-coin-flip-5050-or-1-in-a-million/
- 原图地址：https://forum.bc.game/uploads/monthly_2022_06/image.png.12946ccb10720701fddfe97e11477a7e.png
- 借鉴：同屏对照前置证据和最终计算结果。
- 不借鉴：任何投注产品 UI、结果赔率或操控；仍然不是 Slots 公平算法的证明。

## 设计决策与仓库复用

1. **首页采用清楚的状态+近30天历史计数**，而非默认显示全部种子长字符串；历史只显示观察到的事件与最深证据层级。
2. 「重新扫描」使用与项目 Web Markdown Clipper 同语义的 Refresh-Cw 图标；「选择网页区域」用 MousePointer 图标+文字，避免纯图标歧义。代码参考：projects/web-markdown-clipper/src/index.html / src/main.js；业务实现不能直接复制 Markdown 提取。
3. 「撤销模拟权限」属于离线实验台状态，正式工具 Side Panel 无此按钮。
4. 不把来源网站图当成 OpenDesk 的设计系统；OpenDesk 仍应使用 .agents/skills/opendesk-ui-preview/SKILL.md、src/ui/design-tokens.css 与官方 Preview Kit。
5. 竞品页面呈现「History」不等于证明 Chrome 扩展可以在侧栏关闭时持续监测；该能力由本项目 BG-01…BG-12 独立设计与真实授权测试证明。

| 文件/内容 | 当前状态 |
| --- | --- |
| 本索引（带原始图片预览及 URL） | SAVED_IN_REPO |
| 第三方原始截图 PNG/WebP 二进制 | REMOTE_REFERENCED_NOT_ARCHIVED |
| 独立截图许可/下载校验 | NOT_TESTED |
| 真实网站 DOM 兼容与算法复算 | NOT_TESTED |

引用网址可能随网站改版失效。它们仅是对照资料，不是本工具安装或实际验证的依赖。
