# Sidebar Navigation & Menu UX R1.6 — 十二项官方工具源码审查矩阵

基准：依据 `official-tools/catalog.json` 确认的 12 个官方 Tool ID；2026-10-22 GitHub `main`；继承 R1.5 现有 Bridge / Host / React Root，不引入新路由和权限。下表基于正式源码、安装声明和已知 CI 日志，**不是 Chrome 真机交互验收**。真实尺寸、触屏、草稿恢复及权限读回在未运行前全部标为 `NOT_TESTED`，不能以静态审查给出 95 分。

| 官方 ID（源码版本） | 页面/入口结构与源码证据 | 真实源码审查结论；必要最小改动 | 状态/数据风险与测试门槛 |
| --- | --- | --- | --- |
| `knowledge-inbox` 1.2.8 | `src/index.html`：列表、新建、详情、编辑、卡片更多；`src/main.js`：发布共享页状态和业务返回；`src/style.css`：仅在获准时隐藏重复返回/标题 | R1.5 已有共享导航，静态未见重复框架返回；应实测未保存草稿返回、取消/搜索/滚动恢复和管理菜单 | 编辑草稿/ETag/保存中；`SOURCE_REVIEWED`、交互 `NOT_TESTED` |
| `adblock` 1.2.3 | `src/App.jsx`：overview/cosmetics/exceptions/settings 四页、共享标题、规则草稿/忙碌守卫 | R1.5 内部返回按可信 Host 隐藏；保留关键文字动作“选择网页元素”；须实测产品设置齿轮、规则选择及写入中返回 | DNR/选择器草稿与未知写入；`SOURCE_REVIEWED`、交互 `NOT_TESTED` |
| `markdown-workbench` 1.0.3 | `src/index.html`：编辑、预览、分栏单页、导入/复制/下载/清空 | 不应人为建立子路由；R1.5 标题修复需通过真正安装后的视觉复核 | 编辑内容未下载离开风险；`SOURCE_REVIEWED`、交互 `NOT_TESTED` |
| `prompt-shortcuts` 1.1.8 | `src/index.html`：列表/新建编辑/网站配置/备份；`src/main.js`：`back()`、草稿确认，但**未调用 `setNavigation`** | **NEED_FIX：框架返回不了解表单层级**，不应直接关闭工具。需由正式业务控制器发布页面层级，修复后严格执行版本递增、唯一 packager、candidate/定向测试/promote-from/check-project | 文字/图片草稿、站点选择器、ETag；`SOURCE_CONFIRMED_ISSUE`、修复 `PENDING_PACKAGE_PIPELINE` |
| `bookmark-manager` 0.3.10 | `src/react/App.jsx` 正式 React 树/详情/Sheet，`src/index.html` 为另一独立入口；工具可走可信原生试点 | 不把 Sheet 关闭等同业务返回；底部动作与行级动作的重叠需真实可视验收。已有 Chromium 400px 实际读到 960px 的视口测试失败，应先定位 CDP/尺寸根因 | 书签授权/删除确认/文件夹与编辑草稿；`SOURCE_REVIEWED`、`CHROMIUM_NEED_FIX` |
| `cookie-editor` 2.0.30 | `src/index.html`：浏览器/离线工具切换、站点选择、编辑、导入导出与清理 | Tab 切换不是历史返回；当前工具栏操作较多，精简仅在真实截图证实冗余后实施，不触碰值/授权语义 | Cookie 密值、写入读回、敏感导出；`SOURCE_REVIEWED`、交互 `NOT_TESTED` |
| `web-markdown-clipper` 1.2.6 | `src/index.html`：网页提取和最近摘录同屏；列表/详情/编辑页；R1.4 兼容旧 page 状态 | R1.6 **已修复**旧共享导航的仅凭 ID 放行问题，限定正式官方校验后才使用；保留同屏结构及原业务历史 | Markdown/未保存摘录/草稿与来源；`SOURCE_FIXED`、Node/安装回归 `NOT_TESTED` |
| `quick-notes` 1.1.9 | `src/index.html`：单页笔记列表和编辑，新增/删除/保存已有图标语义与 aria-label | 单页不应制造返回栈；暂无独立源码证实的重复同级返回，需检查写作离开保护与 320px | 本地笔记存储与草稿；`SOURCE_REVIEWED`、交互 `NOT_TESTED` |
| `time-review` 1.6.0 | `src/index.html`：日期、统计范围 Tab、分类编辑和详情内设置；框架另有可信权限设置 | 日期/Tab 不纳入逐级返回；统计偏好与可信权限入口并存，需视觉确认是否有无意义重复 | 记录授权/撤销/分钟数据/导出；`SOURCE_REVIEWED`、交互 `NOT_TESTED` |
| `stay-focus` 1.0.9 | `src/index.html` 为正式 React Root，编译资源在 `dist/`；Host 持有可信站点/规则设置 | 不拆分已有可信控制器；启动/停止和编辑层级需真实安装检查，静态不足以证明无重复菜单 | 站点权限/限额/定时规则；`SOURCE_REVIEWED`、交互 `NOT_TESTED` |
| `ai-vip-share` 1.4.0 | `src/index.html`：会员、激活、共享会话、Cookie 和代理长单页；内部品牌 `h1` | 已确认内部品牌大标题与框架标题可能视觉叠加，需产品证据决定保留品牌身份还是压缩；**不可因刷新重放兑换** | Cookie/代理状态/结果未知/兑换幂等；`SOURCE_REVIEWED`、交互 `NOT_TESTED` |
| `reading-toc` 1.0.9 | `src/index.html`：目录模式按钮、刷新、章节列表和 AI 目录 | 展开/目录模式/章节跳转不是逐级返回；内部 CONTENTS 行是否重复须真实比较框架标题 | 网页定位、来源切换、设置和权限；`SOURCE_REVIEWED`、交互 `NOT_TESTED` |

## R1.6 已落实的跨工具改动

- Bridge/Host 按 `matchesOfficialRelease` 结果承认所有正式共享导航，包括网页剪藏旧页协议；同 ID 自定义工具无特殊提升。
- 通用框架设置统一标题为“工具设置”；返回回到当前工具，而不是意外退出；没有业务子页时返回标签统一为“返回扩展列表”。
- 共享 primary 操作文案按当前工具区分：摘录继续用“新建便签/编辑摘录/保存摘录”，其他获准的工具用通用“新建/编辑/保存”，避免叫错业务对象。
- 添加强调同 ID 冒充和框架设置保留 iframe 的定向回归。所有实际测试仍按 GitHub CI / Chromium / Mac Chrome 的分层结果报告。

## 阻塞与下一步

1. **首要业务 P0**：提示词快捷按钮业务控制器接入共享页状态和未保存的业务返回；必须有本地真实 packager 晋升流水线，不能只提交源码。
2. **CI P0**：定位书签管理真实 Chromium 的 iframe 视口回归；先确认是否测试驱动或正式 CSS 问题，再最小修复。
3. **交互验收**：知识收件箱、AdBlock、网页剪藏优先复用已有 fixture；其余 9 个按页面深度逐个验证 320/360/400/440、200% zoom、键盘/触屏和浅深色；没有证据不判 PASS。
4. **发行门槛**：所有修改 Sidebar Tool 的 `tool.config.json` 版本、`dist/build-ready.json`（适用时）、候选包、唯一 `--promote-from`、`--check-project` 必须同源。此审查文档和 Host 改动不重建已安装包。

## 2026-10-22 额外 CI 前置修复

`.github/workflows/sidebar-tools-r1.yml` 已在运行官方目录打包依赖的 Node 测试前，调用**仓库既有** AdBlock、Stay Focus、Cookie Editor React 编译器，避免把 `dist/tool.css` / `dist/build-ready.json` 未生成误判为导航回归；同一测试步骤明确执行 `sidebar-tool-hierarchical-back-r12.test.mjs`。本次仅提交工作流和证据矩阵，不触碰发行包。必须以新 SHA 对应的 GitHub Actions 结果为准，旧的红色日志不自动视为修复成功。
