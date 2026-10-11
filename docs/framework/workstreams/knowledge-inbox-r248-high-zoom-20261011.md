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

## 同一候选的 GitHub CI 和图像验收（2026-10-11）

- 源码提交：[1b6f627261ed736524dc8db0825bc8c20f27b345](https://github.com/shopable-ai/opendesk-browser/commit/1b6f627261ed736524dc8db0825bc8c20f27b345)。
- [Knowledge CI 38152578619](https://github.com/shopable-ai/opendesk-browser/actions/runs/38152578619)，job `114508888724`：`Source and affected components` **SUCCESS**，146 tests / 146 PASS / 0 FAIL；`Build current production and development extension` **SUCCESS**，生产、开发包和 verify 通过；`Real Chrome and controlled ChatGPT-shaped DOM fixture` **SUCCESS**，Chrome for Testing `155.0.8059.39`（Linux headed/Xvfb）1/1 PASS。
- CFT `result.json` 绑定精确候选 SHA `1b6f627261ed736524dc8db0825bc8c20f27b345`，通过官方包审核安装、独立网站授权、真实受控 DOM 保存及去重、编辑、原文保留、手动新建/删除、取消确认、键盘记录导航、SPA 和撤权保留记录。不是线上用户 ChatGPT 数据验收。
- [原始附件 11707720649](https://github.com/shopable-ai/opendesk-browser/actions/runs/38152578619/artifacts/11707720649) 含 `visual-metrics.json` 与 60 张 screenshot。增加 `edit-effective-narrow` 和 `manual-create-effective-narrow` 的 180/200px、亮暗主题共 8 张截图，全部记录 `scrollWidth === clientWidth`，60 次样本最大水平溢出 0px。原始 `180px` 真实 CFT 截图复核：知识编辑器「恢复原文」和「分类、标签与备注」均保持单行。
- **限制**：外层宿主在 180px 极窄视口会换行显示「工作流」Tab 和头部工具图标，这是整个 Side Panel 的全局高缩放布局问题，不在本轮知识工具 CSS 中强行改动。该模拟证明工具内部无横向溢出，不等同于用户 Mac 实际 200% Chrome Zoom/VoiceOver 验收。
- **全仓环境仍未全绿**：同一 CI 的 `Environment regression on Linux` = FAILURE，1,316 tests：**1,300 PASS / 9 FAIL / 7 SKIP**。九项名称分别是 AxiosHeaders Browser wrapper、生产/开发 Axios 包、生产/开发 Cheerio slim、Go Project bindings、旧工具导航断言、R21 工具图标断言、R20/R23 配色设计断言。均非本轮知识工具的窄屏、创建、编辑、删除测试，归各自任务负责人修复，不改分母或绕过断言。

### 审慎评分

- 正常 360px 的知识编辑信息架构、正文优先、操作可见性与配色：**专家审查暂估 95–96/100**（已有真实 Linux CFT 图片和组件证据）。
- 180/200px 等效窄 CSS 视口：工具内部响应式约 **95/100**，外层 Side Panel 头部在 180px 存在换行，跨模块全局缩放体验仍不足以宣布独立 95+。
- 数据保存安全有已验证的撤权、冲突、版本保护，但 **JSON 备份只有导出没有恢复 UI**；正式长期数据迁移/恢复分项不满足 95+，不借本轮设计加分。
- macOS Chrome 真正 200% 浏览器缩放、系统缩放和 VoiceOver：**NOT_TESTED**；全仓 F3/ZIP：**NOT_ACCEPTED**。

总结：R24.8 专项实施、构建和 CFT **PASS**，全仓仍有独立门禁待修复；后续不要反复修改已稳定的知识编辑器来掩盖其他模块问题。
