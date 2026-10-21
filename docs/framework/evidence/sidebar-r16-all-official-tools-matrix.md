# Sidebar Navigation & Menu UX R1.8 — 十二项官方工具真实源码审查矩阵

> 2026-10-22 续接 R1.7。本文件沿用 R1.6 证据矩阵路径，避免平行权威账本。工具 ID 唯一来源 `official-tools/catalog.json`。此文仅依据读取到的 GitHub `main`、正式源码、安装声明与测试实现；**不是已安装 Mac Chrome 操作验收**。并行 Agent 持续提交，源码结果不自动适用未来更改后的版本。

## 十二项用户操作与最低必要修改

| 官方工具及源码版本 | 可追踪的实际操作、业务控制器 | R1.8 已证实结论与修复状态 | 尚需验收 |
| --- | --- | --- | --- |
| `knowledge-inbox` 1.2.9 | `src/main.js`：列表→新建→详情→编辑→返回，原控制器发布 `setNavigation`，草稿与菜单保存/导出 | 共享导航已有，未找到应重写路由的源码证据；**不无故修改** | 逐级来源返回、草稿、保存中、搜索/滚动及焦点；`NOT_TESTED` |
| `adblock` 1.2.3 | `src/App.jsx`：overview/cosmetics/exceptions/settings，规则草稿/操作按钮/删除与 `setNavigation` | 现有四页返回和可见「选择网页元素」保留；**不无故修改** | DNR、例外、规则编辑、菜单视觉与忙碌期间返回；`NOT_TESTED` |
| `markdown-workbench` 1.0.4 | `src/main.js`：单页编辑/预览/分栏/导入/复制/下载，`setNavigation({page:'home',canBack:false})` | 同级标题已让出，不人为增加业务返回；**不无故修改** | 正式安装标题、导入覆盖保护、实际下载、窄幅；`NOT_TESTED` |
| `prompt-shortcuts` 1.1.11 | `src/main.js`：index/create/edit、框架新建/返回、图片、网站规则、草稿和 ETag；`tool.config.json` 首装三条示例 | **旧表「未接入共享导航」已过时**。R1.8 `c2b9dc02` 修正常回执后的独立 ETag+完整数据读回，未知结果禁止重放，新增回归；`7edf9f21` 审查精确可信 pin。**源码 1.1.11 / 唯一正式 JSON 1.1.10，发行仍 BLOCKED** | Node/CI、candidate 晋升、正式保存重开、用户图片/规则、AI 并发草稿、升级；`NOT_TESTED` |
| `bookmark-manager` 0.3.10 | `src/react/App.jsx` React 树、查询、行内更多→查看/编辑/移动/删除、Inspector、Sheet、AI 聊天 | 局部 Sheet 关闭不可当框架 Back；已有行级 icon 与 aria-label，**不无故修改** | 旧 Chromium 400px/960px 驱动问题归因、授权/删除/焦点/AI；`NOT_TESTED` |
| `cookie-editor` 2.0.30 | `tool.config.json` 使用 `src/root.html` + `dist/tool.js/css` React 产物；`src/main.js` 浏览器/离线、掩码编辑、导入与安全清理 | 旧表「正式包使用 src/index.html」过时；切换 Tab 非层级返回，**不无故修改** | 敏感值/权限/真实回读、导出及批量清理、窄屏菜单；`NOT_TESTED` |
| `web-markdown-clipper` 1.2.8 | `src/index.html` 同屏当前内容+最近摘录；`src/notes.js` 保存列表/编辑/阅读/返回、草稿/复制/下载/删除 | 同屏未拆；原业务页状态归 Notes 控制器，官方身份安全边界继续保留；**不无故修改** | 按进入来源返回、删除、焦点、持久化与同 ID 篡改隔离；`NOT_TESTED` |
| `quick-notes` 1.1.9 | `src/main.js` 单页笔记列表、选择/新建/编辑/保存/删除、dirty guard | 不创建伪导航历史；**不无故修改** | 保存后重开、草稿离开、删除、窄幅；`NOT_TESTED` |
| `time-review` 1.6.0 | `src/index.html` 日期、七天/所选日期 Tab、分类与统计；`src/main.js` 分类编辑 | 日期/Tab 不属于框架 Back；设置是否双入口需真实视觉，**不无故修改** | 授权/撤权/导出、分钟图键盘、标题视觉；`NOT_TESTED` |
| `stay-focus` 1.0.9 | `src/index.html` React Root；`src/main.js` 站点列表更多/编辑、时段/组/启停；正式包用 `dist/tool.js/css` | 保留原权限 Host 和菜单所有者，**不无故修改** | 真规则/限额/撤权、删除确认、草稿与键盘；`NOT_TESTED` |
| `ai-vip-share` 1.4.0 | `src/index.html` 单页会员/激活/共享/Cookie/代理，内部品牌 `h1`；`src/main.js` 权益校验 | 品牌与框架标题**可能**叠加，但尚无实际截图证明；绝不为统一删业务，刷新不得重放兑换 | 兑换/会话/Cookie/代理的真实授权及标题视觉；`NOT_TESTED` |
| `reading-toc` 1.0.9 | `src/index.html` 内部 CONTENTS、模式/刷新/目录、AI；`src/main.js` 来源切换和章节跳转 | 模式与章节跳转不是返回；是否双标题须安装后比较，**不无故修改** | H1/H2、刷新、定位、权限、菜单和焦点；`NOT_TESTED` |

## 统一 Host / SDK / 安全合同

- 继续唯一 `src/sidebar-tools/bridge.js`、`src/sidebar-tools/navigation-state.js`、`src/ui/sidebar-tools.js` 和 `src/ui/react/tabs/tool-host.tsx`；仅传纯展示导航状态，不建立第二套路由、Host、iframe 控制器。
- Host 必须以 `matchesOfficialRelease` 的真实发行身份放行共享标题栏；同 ID 手动修改或第三方安装不提权。`tests/environment/sidebar-tools-host.test.mjs` 已有官方 Prompt Back/New 不重建及同 ID 篡改拒绝的测试**定义**；未运行时不标 PASS。
- 自定义 HTML/CSS/JS、React JSX、Vue SFC UI 及已安装工具、权限、原存储命名空间继续保留；不能用导航统一理由偷偷替换业务 UI 或扩大能力。
- R1.8 审查 Prompt 八个可信编译输入，其中六项保持原 pin，两个精确 Git blob 更新为 `trusted/model.js` = `65444eb5ad35847701d21b4489d895028c5fa0c3`、`trusted/page.js` = `6a1e7d4a13da530a7a8648ca67f1b8dc00c8097d`。新源码变更需重审，不能永久批准后继版本。

## 正式 React 预览同源与限制

- `scripts/preview/build-sidebar-six-react-preview.mjs` 从正式 `src/ui/react/main.tsx`、App Shell、导航、UI primitives 等读取并输出 `prototypes/sidebar/react-preview/index.html`；输出带 `UI_PREVIEW_ONLY` 与来源摘要。**本轮没有运行编译对比最新输入 SHA**，不宣称与正在并行变化的 main 当前同源 PASS。
- 网页剪藏更强的业务同源证据：`scripts/preview/clipper-stage.mjs` 同时读正式 `src/index.html`、`src/style.css`、`src/notes.js`、`src/main.js`，只替换 mock Host；业务源真实，Host 和存储仍模拟。不是安装环境。
- Prompt Shortcuts、知识收件箱、AdBlock 需按各自现有预览/正式源对比后再认定，不可把共享 React 框架的同源性扩充成十二工具业务全 PASS。
- 320/360/400/440px、Light/Dark、键盘、触屏、200% zoom 在本轮无新的运行证据，逐项均 `NOT_TESTED`。

## 独立发行与测试状态

| 级别 | R1.8 本轮可证实状态 |
| --- | --- |
| Prompt 正式源码 | `PATCHED_SOURCE`：`c2b9dc02` 新增正常 Host ACK 后独立 ETag/完整读回、异常锁，随后有并行源码更新，须读取最新再做回归 |
| Trusted 来源 | `PIN_UPDATED`：`7edf9f21` 仅重审两处审批 SHA，不等于运行通过 |
| 唯一正式 JSON | `BLOCKED`：`tool.config.json` 1.1.11 vs `prompt-shortcuts.opendesk-tool.json` 1.1.10 |
| Node 定向测试 | `NOT_RUN_THIS_TURN`：新用例已写入仓库，但无本轮 Node 结果 |
| GitHub Actions | 最新有关 run 最后读取为 `QUEUED`，无法认定绿色，旧 SHA 的结果不可升级成当前状态 |
| React 同源预览 | `SOURCE_WIRED / CURRENT_BUILD_NOT_TESTED` |
| 独立 Chromium | `NOT_TESTED_THIS_TURN`，历史问题须单独归因 |
| Mac Chrome / Native | `NOT_TESTED`，不是本轮提前开展的全量验收 |

## 下一动作与停止条件

先在最新 main 运行 Prompt 相关 Node/来源门禁，通过唯一 `scripts/build-sidebar-tool.mjs` 构建 candidate，再在**相同候选**上测试、`--promote-from`、`--check-project`，同步正式 JSON，并读取 GitHub Actions 真实 SHA 与日志。若 CI 持续排队，继续标明阻塞，不以人工更改版本冒充晋升。完成以后按十二工具中真实复现的问题做最小修复并复验。

**当前未达到转入 Mac Codex 全量验收的硬门槛**：正式 JSON 版本不一致、当前目标 CI 无 PASS、十二工具实际 Chrome 菜单尚未验证。原 R1.5/R1.6 和 R1.7 `e970d330` / `621dcda9` 的改动照常保留，不为凑齐十二项而改无缺陷的业务。
