# Knowledge Inbox R24.8 — 高缩放等效窄视口易读性回归

日期：2026-10-11。目标仓库 `shopable-ai/opendesk-browser`，`main`。实施范围仅限官方知识收件箱包与其已有验证驱动，不引入第二套编辑器、权限或数据存储。

## 来源和实际现象

- 从通过候选 `565554a97ec44054f141c54b3574e6278546afec` 提取的正式 CFT 官方工具包 HTML/CSS/JS 进行独立 Chromium 静态模拟（不获取任何用户数据）。
- 标准 Side Panel 360 CSS px 的正式 CFT 已验收，R24.7 首屏保存按钮可见，主要原生功能覆盖。
- 进一步使用 Chromium 在等效 `180/200/240/360` CSS px 布局下复核：**没有横向滚动**，但 180px 时「恢复原文」按钮高度达 41px（文字拆行），折叠「分类、标签与备注」标题高 37px（拆行），整体摘要面板高 55px，占用正文后纵向空间。
- 这些宽度是浏览器缩放造成的可用内容宽度的**近似压力测试**，不是用户 Mac 上真的调整到 200% 浏览器缩放，也不是 Linux 原生 MV3 可直接继承的证据。

## 修复

- 官方知识收件箱资源版本从已存在的 v1.2.5 提升到 `1.2.6`。沿用官方工具构建、发布 Catalog 与工具能力身份校验；不改 `src/knowledge/` 和对外请求接口。
- 仅在 `@media(max-width:239px)`：
  - 隐藏冗余的 Markdown 格式提示；
  - 保持「正文」标题和「恢复原文」单行，不更改按钮文字/可访问名称或危险操作的二次确认；
  - 折叠元信息标题保持单行，隐藏窄视口容不下的分类/标签数量摘要；点开依然可以编辑所有分类、标签和备注；
  - 压缩保存与取消间隙，保持可识别、可操作，不压缩标准 360px 场景布局。
- 不增加新弹窗、无远程资源、无站点权限变化、不迁移本地保存格式、无数据改写。

## 证据与独立边界

- `180px` 离线 Chromium 复测：恢复按钮由 `41px` 降至 `27px`；分类标题由 `37px` 降至 `19px`；摘要面板由 `55px` 降至 `42px`；保存动作向上移动约 `27px`，`document.scrollWidth === clientWidth`。
- `200px` 离线 Chromium 复测：同样单行，恢复按钮 `27px`、元信息标题 `19px`、面板 `42px`，无水平溢出。
- `240/360px`：保持原有呈现，不修改正常侧栏的主要交互。
- 原始测试图片可在此轮对话的独立复测产物中查看；这些**不是 Mac Native / 线上 ChatGPT 正式证据**。不把截图文件写入源码目录，不向最终用户发布字体或本地测试工具。

## 代码和回归

- `examples/sidebar-tools/knowledge-inbox/src/style.css`
- `examples/sidebar-tools/knowledge-inbox/tool.config.json`
- `tests/environment/knowledge-inbox-r24-ui.test.mjs`
- `tests/framework/knowledge-inbox-native-r1.test.mjs`：在原有受控 MV3 CFT 中增加 `180/200` CSS viewport 的截图和横向溢出/单行样式检查；视口模拟**不能冒称原生 Chrome 浏览器缩放**。

### 新候选的待验收项

- [ ] `npm run check` + `node --check` + 受影响 5 组 Node 组件测试。
- [ ] `npm run build && npm run build:dev && npm run verify`，Catalog 包版本和哈希必须来自正式生成器。
- [ ] 真实 MV3 CFT：先走工具审核安装、网站授权、实际保存与编辑，再做窄视口检查；若因工具宿主最小宽度使 180px 仅为外层仿真，明确记录不能宣称 200% zoom PASS。
- [ ] 用户真实 Mac Chrome 200% 浏览器缩放、系统缩放和 VoiceOver/键盘路径仍需独立人工/本地 Codex 验收。
- [ ] 整仓环境红项由既定所有者继续处理；不把知识收件箱专项 PASS 提升为全仓 F3/ZIP 成功。

**质量评分**：信息层级及正常 360px 编辑器可暂估达 95 左右；实际高缩放、用户 Mac 和整仓发行未全部验收时，不宣称所有独立维度评分超过 95。
