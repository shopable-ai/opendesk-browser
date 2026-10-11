# 阅读目录 R4.6：自适应高度与 Side Panel 显示设置

日期：2026-10-11。目标仅是解决网页目录在 Chrome Side Panel 打开后过矮、以及阅读目录显示/隐藏设置入口不统一的问题。不重建 Catalog、安装器、TOC 索引或 Page USER_SCRIPT 运行时。

## 原因与修改

- `src/reading-toc/view.js` 在视口宽度 ≤1100px / ≤720px 时将目录滚动区域上限硬编码为 160px / 125px，打开 Side Panel 后页面宽度变小即可触发。移除固定上限，沿用 68dvh 与可视高度空间计算，继续保留 ChatGPT 输入框交叠时的 `--toc-scroll-limit` 防遮挡。
- `src/ui/sidebar-tools.js` 保留经真实 Chrome 证实可用的圆形网站授权按钮 `◎`（点击仍需确认）和网站撤权入口，将阅读目录的原 `⋯` 管理图标改为齿轮。齿轮紧靠工具卸载按钮左侧，设置面板属可信 Side Panel。网页内仍不注入齿轮。
- `src/reading-toc/policy.js` 增加独立显示偏好 `opendesk.sidebar-tools.toc-visibility.v1`，分工具 ID 和具体 HTTP(S) origin/page path 隔离。单页面规则只保留 origin + pathname，不存 query/hash；有上限与输入验证。
- `src/reading-toc/page.js` 读入显示偏好，在已授权情况下单独控制网页浮动组件是否挂载；不影响章节索引、`toc.snapshot` 或 `toc.navigate`。通过 `storage.onChanged` 及现有 SPA 重建路径跨标签更新。
- `src/ui/sidebar-tools/installation.js` 复用带恢复标记的卸载数据清理机制，连同工具其他偏好删除显示记录，不能留下重装意外继承的隐藏规则。
- 不改变官方工具包 1.0.2 源文件、能力、安装审核或版本；宿主源码改动无需重发用户工具 JS。

## 受影响的最小验证

- 新 `tests/environment/reading-toc-visibility-r46.test.mjs`：网站/路径隔离、查询隐私、显示设置与 `page.toc` 权限独立、畸形输入和数量上限。
- 扩展 `tests/environment/reading-toc-placement-r42.test.mjs`：窄屏和中等宽屏不再出现固定 160px/125px 高度上限；原拖动/归位与输入框避让不变。
- 扩展 `tests/framework/reading-toc-native-r41.test.mjs`：受控真实 Chrome 装载本次生产扩展，在 900px / 420px 宽度测量长目录、在真实 Side Panel 切换页面和网站显示，再用 `toc.snapshot` 验证隐藏没有撤销授权；保留原安装、拖动、撤权、卸载、导入和 Side Panel 证据。
- `.github/workflows/reading-toc-r41.yml` 在 main 改动触发定向单元、构建、源码校验、真实 CFT 与原有全套自动化；仅以完成的原始 job 结论为 PASS。

## 当前验收状态

本工作流在提交前只做远程源代码与测试合同核对，未获得新候选的真实浏览器回执。原 R4.4 受控 CFT PASS 只属于提交 `07b39e043f13208e743eec67a523f1ccf28f60a1`，并不自动证明 R4.6 的变更。用户 Mac 实体 Chrome、真实登录 ChatGPT/知乎、生产 Chrome Profile、最终 F3/ZIP 均标为 `NOT_TESTED`，不得因本工作流的单元或 CI 结果改写状态。

改动范围仅涉及阅读目录显示层、独立用户偏好、受信 Side Panel UI、卸载清理和对应验收测试。不得占用其他 Agent 的 Chrome Profile、端口或 dist。
