# Sidebar R26：工具间距统一与网页笔记布局修复

日期：2026-10-12。目标：`shopable-ai/opendesk-browser`，只修改 `main`。

## 现状与根因

- 宿主 `#workspace-content` 左右留白 11px（≤340px 为 9px）与已预装沙箱工具 `.notes-app{padding:12px}` 叠加，导致网页笔记正文和工具详情标题没有对齐。
- **网页笔记原 CSS 已使用 `body{margin:0}`**，不能把其问题归因于浏览器 body 的默认 margin。
- 其 UI 局部使用 2/5/6/7/10px 等细碎间距，缺乏统一规格；网页工具的空态还暴露过多安装架构细节。
- 保留浏览器 sandbox、工具数据、SDK、权限及安装策略，不创建第二套正式设计系统。

## 变更

- `src/ui/design-tokens.css`：补充单一宿主横向 gutter。
- `src/ui/tool-shell.css`：工具页签面板自身扩为完整可视宽度并内部保留宿主 gutter；详情 iframe 向两侧抵消该 gutter，既避免双层内容缩进，也避免 panel.scrollWidth 横向溢出；统一网页工具卡片等间距。
- `examples/sidebar-tools/quick-notes/src/style.css`：映射 4/8/12/16px、8/12px 圆角和 34px 按钮；优化笔记输入、附注、操作区、折叠区域及窄屏。工具版本改为 1.1.6，需用户显式确认更新。
- `src/ui/installed-page-tools.js`：简短空态，源码 SHA 折叠到「技术信息」；不会改动 Page Installed 权威数据。
- `src/ui/sidebar-tools.js`：关闭工具返回列表时清除与当前工具相关的过期提示。
- `docs/architecture/sidebar-design-system-r20.zh-CN.md`：补充唯一正式规范；`tests/environment/sidebar-tool-spacing-contract.test.mjs`：新增静态合同回归。

## 验收和风险声明

- 已编写静态合同测试；并将其加入 `.github/workflows/sidebar-r21-ui-quality.yml` 的现有 CI。需在完整本地仓库执行：`node --test tests/environment/sidebar-tool-spacing-contract.test.mjs tests/environment/sidebar-quick-notes.test.mjs tests/environment/sidebar-r21-design-system.test.mjs tests/environment/sidebar-tools.test.mjs`。
- CI 首版候选 `0b43b39` 的 R21 组件测试失败：`tests/environment/sidebar-tools.test.mjs` 对列表 gap 写死了 `8px`，与本轮 `var(--space-2)` 语义等价但文字不匹配；已将断言更新到现行 token。R19 静态 Chrome `tools-open 300px` 出现 `panelOverflow:true`，故把整个工具页签先扩为完整画布并加回 gutter，再给 iframe 负向抵消 gutter；重跑需要核对当前 commit 的真实结果。
- 同一候选的官方应用市场 native 流水线另有旧 fixture 清单与目录不匹配：测试预期五个工具，但发行目录已有新增 `time-review` 共六个。这是其他工作流的 catalog/native fixture 对齐问题，不能将其认定为本次布局验证 PASS，也不在此修改另一个工作流的业务合同。
- 源码候选需按 `docs/framework/testing-guide.md` 做增量影响核对，运行 `npm run check`、必要的生产/开发构建及 `npm run verify`；不能把历史候选 PASS 直接移植到新候选。
- Mac Chrome：320/360/420/520px，125%/200% 缩放，长标题/长 URL，Side Panel 工具列表→网页笔记→返回以及技术信息折叠、安装更新。**无当前源码绑定的原生证据；状态 `NOT_TESTED`。**
- 本轮未接触任何本地 Mac Chrome profile、固定端口、dist/ZIP、历史回执或全局 owner 账本。

## CI 实际回执（源码候选 `8e44f6eb2bfbb51482b903c290133618582ed270`）

以下链接对应固定候选，不把后续文档更新推定为再次完成 native 验收。

- [R21 integrated UI quality](https://github.com/shopable-ai/opendesk-browser/actions/runs/38210110516)：**PASS**。新间距合同测试和现有 Side Panel/Tools/Workflow 组件测试通过；源码检查、生产/开发构建与 verify、严格 CSS/package 回归通过。
- [R19 real-markup static Chrome audit](https://github.com/shopable-ai/opendesk-browser/actions/runs/38210110499)：**STATIC_MARKUP_CHROME PASS**。300/360/420/520px 的 Tools 列表和工具详情 `documentOverflow:false`、`contentOverflow:false`、`panelOverflow:false`，34px 图标控件及原有圆角检查通过。**这是静态模拟页面，不代表实际已安装 Chrome 扩展。**
- [Sidebar user tools package](https://github.com/shopable-ai/opendesk-browser/actions/runs/38210110488)：**PASS**，工具构建/包约束通过。
- [官方工具目录 R4.5 Native](https://github.com/shopable-ai/opendesk-browser/actions/runs/38210110438)：**FAIL（独立遗留差异）**，`tests/framework/app-market-r3-native.test.mjs:108` 仍预期旧的五个官方工具，当前 catalog 已加入 `time-review`（六个）。失败发生在 Chrome 生命周期测试开始前的 catalog 断言；另有工作流负责目录/原生合同，不能在本轮用修改布局脚本的方式掩盖该失败。
- 真实用户 Mac Chrome Side Panel 交互、125%/200% 缩放、版本更新与本地长期数据：`NOT_TESTED`。用户侧需加载本轮构建实际包，再验证上述流程。无法将这一缺项算作 UI 全面 95+。

## R26.2 源码布局与窄屏回归补充（2026-10-12）

- 历史 R26 已将 iframe 和宿主 gutter 归一化；针对本轮实际复核发现的有效内容宽度 160 CSS px 问题，网页笔记此前的 `.page-attach` 会被保存/删除按钮挤窄并折成多行。R26.2 在 `max-width:220px` 下将附页复选框安排为独立一行，两个操作图标另占一行、右对齐，普通 Side Panel 宽度不改变。
- 独立大标签页原编辑器缺少最大宽度，补充 `min-width:800px` 的 760px 内容限制。工具 CSS 改动引起的发行身份变化：版本 `quick-notes 1.1.6 → 1.1.7`，沿用 `quick-notes` 原有 ID、权限及 storage local 数据模型；升级须用户主动确认。官方 `official-tools/catalog.json` 本来将 `quick-notes` 设为 `preinstalled`，本次仅修正文档对「默认未安装」的不准确描述，没有修改预装策略。
- 新增 `scripts/tests/sidebar-quick-notes-layout-visual.mjs` 并接入 `.github/workflows/sidebar-r19-layout-visual.yml`：使用实际 Quick Notes HTML/CSS/Logo 在真实 Chrome 渲染，不加载扩展也不运行工具 JS；12 宽度 × 4 状态检查布局与控件边界，保留截图/metrics。有效 160/180/210px 仅覆盖缩放等效布局宽度；不将其算作真实 Chrome 200% zoom 证明。
- 同步修改 `tests/environment/sidebar-tool-spacing-contract.test.mjs` 与工具 README。不得把 Node/CSS/静态 Chrome PASS 冒充实际 Side Panel 安装、版本更新和数据读写验收；这些应另外标识。首轮候选与 CI 结果在跑完对应 Actions 后填写真实身份，不预先标 PASS。

