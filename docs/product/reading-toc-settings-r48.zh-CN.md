# OpenDesk Browser 阅读目录：详情与独立设置 R4.8

> 日期：2026-10-11。此文记录已经接入 `main` 的受信宿主界面和运行范围能力；不将设计预评分当作真实用户测评或整仓验收结果。

## 普通用户怎么使用

1. 在 **Side Panel → 工具** 中打开已安装的「阅读目录」。打开后正文区域默认展示当前网页章节列表，而非网站管理表单。
2. 点击详情页顶部、**卸载图标左边的齿轮**，进入「阅读目录设置」。点击顶部 **返回** 回到原来的章节列表；宿主只隐藏 iframe，不销毁重建，因此保留目录模式、当前回答及已选章节等界面状态。
3. 设置页默认作用于 **当前网站**，点击 **可用** 或 **不可用**。用户点击“可用”即为明确的站点级授权，不再出现第二个 JavaScript `confirm()`；Chrome 原生网站权限依然独立检查。停用后该网站的 TOC 读取和 DOM 监听停止。
4. 要单独控制某一 URL，点击 **只设置本页**，再选 **可用 / 不可用**。本页必须位于已授权的网站内，页面允许规则不能绕过网站授权；“不可用”后不再索引、读取或定位该页标题。可在“已排除的页面”中恢复。
5. “显示偏好与已有规则”默认折叠：可只隐藏当前网站或当前页面的网页悬浮目录，同时保留 Side Panel 读取与定位；也可撤销以前授权的网站。
6. “AI 智能设置 · Pro”目前只是后续方向提示，**没有订阅、支付或 AI 自动授权**。上述手动启停、页面例外及显示设置不依赖付费。

工具**列表**仅负责打开已安装的官方阅读目录，不再为它展开一大块网站管理面板。其他网页剪藏／知识管理工具保留各自已有的站点授权处理，未被此次改版迁移。

## 三种设置的区别

| 意图 | 操作 | 受信网页 TOC 服务 | 网页悬浮卡片 |
|---|---|---|---|
| 整站不可用 | 当前网站 → 不可用 | 不启动／撤销 | 不显示 |
| 单页不可用 | 只设置本页 → 不可用 | 在该页停止监听和目录读取 | 不显示 |
| 只隐藏卡片 | 展开显示偏好 → 隐藏 | 已获授权的 Side Panel 仍可读取 | 不显示 |

## 工程实现与权限约束

- `src/ui/tool.html` 与 `src/ui/tool-shell.css`：由扩展宿主提供固定的齿轮按钮和独立设置视图。齿轮紧挨卸载按钮左边，设置页与 `#sidebar-tool-frame` 是兄弟节点。
- `src/ui/sidebar-tools.js`：宿主负责视图切换、`chrome.storage.local` 读写、既有双重 Web Lock、安装身份校验和当前文档重验证。切换设置页保持 sandbox iframe 与 instance 不变；退出工具才销毁 iframe。
- `src/reading-toc/policy.js`：保留原网站授权 `READING_TOC_SITE_STORE` 与显示偏好 `READING_TOC_VISIBILITY_STORE`；另以 `READING_TOC_PAGE_RULES_STORE` 保存明确拒绝运行的页面列表。每条规则是 HTTP(S) 的 origin + pathname，**不存查询参数或 hash**，单工具上限 64 项。
- `src/reading-toc/page.js`：策略检查不仅位于 UI，页面内容脚本在启动观察器、接收快照和导航请求时都再次校验。撤销权限或本页不可用时断开 DOM 监听；允许恢复时重新建立一次观察器。
- `src/ui/sidebar-tools/installation.js`：验证卸载清理页面拒绝规则；新的安装不继承前一个所有者遗留的拒绝记录。

按钮密度：`✓ 可用`／`⊘ 不可用` 按普通 Side Panel 控件的约 34px 高度显示，按文字宽度排布，不再是占满整行的 45px 大按钮。未识别目标网站时使用行内提示，不自动猜测用户打开的是非 HTTP(S) 网页。

页面例外不授予任何 Chrome 权限，也不能使自定义工具绕开既有 `page.toc` 能力授权。不能把“隐藏”当作“不可用”，或者把某页可用解释成整个网站都获权。

## 相关定向测试和验收证据

- `tests/environment/sidebar-tools-host.test.mjs`：列表精简、详情齿轮、独立设置页、返回后 iframe 未重建、当前页面拒绝与恢复、旧授权网站撤销。
- `tests/environment/reading-toc-r41.test.mjs`：URL 作用域、工具身份隔离、参数不落盘。
- `tests/environment/reading-toc-lifecycle-r41.test.mjs`：拒绝页面时监听器断开并拒绝目录快照，恢复后可重新启动。
- `tests/framework/reading-toc-native-r41.test.mjs`：已更新真实 Chrome 中的按钮路径与页面拒绝/卸载验证。

GitHub Actions **[Reading TOC run 38138735372](https://github.com/shopable-ai/opendesk-browser/actions/runs/38138735372)** 对精确候选 `97a120d5edb0f87933f5c14b0fb8608fc8d10092` 报告构建、定向测试、受控真实 Chrome 测试、Side Panel 回归及 `npm test` 成功。后续其他源码改动须用对应候选重新核验，不能把先前运行报告误当成之后提交的原生验收。

**未完成的范围**：用户本人 Mac Chrome 的登录态站点实测、独立最终 F3、ZIP 安装一致性仍需按仓库原验收流程确认。此处没有提供已部署订阅或 AI 功能的声明。
