# 知识收件箱 R24：产品级 UI/UX 迭代与验收

日期：2026-10-11。仓库：shopable-ai/opendesk-browser。工作范围：知识收件箱官方可安装工具及其最小必要测试/开发文档；不重建宿主框架，不改变知识数据模型。

## 起点与影响识别

审计起点 main：96812e6ed942fd256eb9f44d071093dc204ff554。通过 GitHub 同时核对历史中文截图候选 dece01194df2cb5a5a6779d95697c9f3a80f53f8 与本轮起点：工具的 src/index.html、src/style.css、src/main.js、内置 JSON 的 blob SHA 完全相同；宿主侧 sidebar-tools.js 已变化。因此，dece011 的 360px 中文浅/深历史截图可以作为**工具自身老样式参考**，但不是本轮对最新完整宿主重新采集的改造前原生证据。

缺口：旧详情在标题、分类、标签、备注之后才呈现只读 textarea 正文；四个导出按钮和编辑复选框同级竞争注意力。分类之外无标签筛选、排序；品牌页头、常驻描述、备份入口占用了窄屏面积。Markdown 缺少标题/列表/代码可读排版。

## R24 改造范围

- 正式工具入口默认阅读，标题、来源日期、分类/标签及高频「复制 Markdown」优先；编辑单独进入；下载、工作区、来源、删除折叠至「更多」。
- 列表增加搜索清除、标签过滤和最近修改/最近保存/标题排序；复用原 knowledge.list 搜索和既有 tags/createdAt/updatedAt，不新增持久化字段。
- Markdown 使用 DOM 文本节点渲染标题、段落、引用、代码、列表和简单表格；绝不直接执行原始 HTML，不自动创建远程图片请求；超长正文降级为完整纯文本。
- 编辑保存只对真正修改启用；原始回答与个人草稿仍按现有 revision 合同独立持久化。恢复原文必须单独确认；编辑状态通知按序写入宿主，保留取消和删除确认。
- 隔离 iframe 内明确映射 R20/R21 的字体/间距/焦点/颜色语义，不新增框架；改进 360px 窄侧栏和明暗模式。
- 工具发布版本由 1.0.0 增至 1.1.0，保留知识工具 ID 及能力声明，重新同步规范生成包和官方内置包。
- R1 Chrome 用例由旧复选框断言改为真实读/编辑模式与不可信 Markdown 的负向断言，加入多视口明暗截图/溢出采样；增加 R24 静态合同测试。
- docs/api/sidebar-tool-development.zh-CN.md 增加所有 Side Panel 可安装工具共用的 UI 方法，不批量重写其他工具。

## 安全与兼容性约束

仍沿用现有 page.capture、knowledge.store、user.export 以及受信任 knowledge 服务；未调用其他 Chrome/Native 功能或外部网络请求。无存储格式升级，无新增依赖，不改变旧记录数据。原始回答一旦捕获就不能通过编辑工具覆写。工作区仅是待载入草稿，Native 落盘仍需用户显式授权/确认和读回校验。

## 测试与证据登记

- PRECHECK：远端 main 起点、历史源码 blob、AGENTS、R20/R21 开发规范、模型/service、原生测试均已审阅。
- STATIC：待提交的 JavaScript 已经 V8 语法解析；禁止 innerHTML 赋值、自动图片元素、fetch/chrome 直接访问；待在仓库 CI 执行新增静态测试。
- COMPONENTS/CHECK/BUILD/VERIFY：**NOT_TESTED**（提交时 CI 尚未出结果时不得写通过）。
- REAL_CHROME_CONTROLLED_FIXTURE：**NOT_TESTED**，需核查同候选 CI 的真实 Chrome 安装/页面点击/iframe/保存、删除、撤权及 UI 截图。
- 最新主干改造前的 Chrome 同视口重拍、真实线上 ChatGPT、用户 Mac Native 文件落盘、系统剪贴板落地、独立 Tab 人工体验、浏览器 200% 缩放：**NOT_TESTED**。
- 视觉、布局、操作效率、功能、响应式、无障碍、数据安全、性能八维评分：**NOT_VERIFIED**，不能未看截图即给出 95+。

截图采样测试文件（跑通后）：artifacts/knowledge-inbox-r1/list-WIDTH-THEME.png、reader-WIDTH-THEME.png、edit-dirty-WIDTH-THEME.png、confirm-WIDTH-THEME.png、saved-outline-WIDTH-THEME.png、visual-metrics.json。WIDTH 是 CDP 模拟的 CSS 视口宽度，不能把 600/1000 的模拟宽度误报为原生 Side Panel 可直接拉伸到该宽度或独立标签页已验收。

## 开发与本地验收入口

1. 在干净 main 上核对状态、HEAD 和并行占用，不覆盖其他 Agent 的 dist/Profile。
2. npm ci --ignore-scripts --no-audit --no-fund（已有锁定依赖可复用），然后 node --check examples/sidebar-tools/knowledge-inbox/src/main.js。
3. node scripts/build-sidebar-tool.mjs examples/sidebar-tools/knowledge-inbox --out examples/sidebar-tools/knowledge-inbox/knowledge-inbox.opendesk-tool.json，并核对与 src/sidebar-tools/knowledge-inbox.opendesk-tool.json 完全一致。
4. node --test tests/environment/knowledge-inbox-r24-ui.test.mjs tests/environment/knowledge-inbox-r1.test.mjs tests/environment/sidebar-tools-host.test.mjs；npm run check、npm run build、npm run build:dev、npm run verify。
5. 在独占受控 CFT 环境执行：CHROME_BIN=Chrome-for-Testing-path OPENDESK_NATIVE_HEADED=1 xvfb-run -a node --test tests/framework/knowledge-inbox-native-r1.test.mjs（Linux）；Mac 上不使用 xvfb-run，保持单独 Profile，不借用其他任务浏览器。
6. 人工在 Side Panel 工具列表审阅/安装、对 chatgpt.com 单独授权、保存回答、搜索过滤、阅读/编辑、复制/下载/工作区、撤权/删除，并测试宿主关闭时的脏数据保护。不要误把「打开工作区」写成磁盘成功。

## 后续独立任务（非 R24 P0）

备份恢复、多记录合并、离线图片包、Markdown 追加、外部博客/Notion/企业知识库连接器：需要自己的持久化迁移/权限/负向测试与真实目的地回执；本轮不先行加入 UI。

本工作流将在拿到实际 CI 候选 SHA、构建日志、截图及异常修复后补充真实结果；保留 R1 证据原貌。
