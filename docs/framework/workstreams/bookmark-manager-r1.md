# Bookmark Manager R1.2 · 首批可信源码交付与待验收事项

日期：2026-10-14；目标分支：`main`。本记录只说明书签管理独立范围，不覆盖其他 Agent 的工作流或总验收账本。

## 已写入 main

- `prototypes/sidebar/bookmark-manager-preview.html`：用户反馈后的 R1.2；单一文件树（文件夹与书签混排）+ 搜索 + 一行三个主要操作，左右仅为设计评审模拟画布，UI 不修改 Chrome 书签。
- `src/bookmark-manager/{model,service,trusted-ui}.js`：固定、经审计源码的第一方书签树 / Chrome Bookmarks 操作 / 真实用户授权 / 视图和表单；用户导入/AI 动态包仍走原 opaque iframe，不因此获 Chrome 特权。
- `src/ui/{bookmark-manager.css,tool.html,sidebar-tools.js}`：独立工具入口和宿主最小接线，不新建 Runner、安装器、Browser SDK 或权限存储；`bookmarks` 已是 manifest optional permission，不扩大范围。
- `tests/environment/bookmark-manager-r1.test.mjs`：管理树/权限/CRUD/受管理根目录/过期状态/非空目录删除子树更新等单元场景。
- `src/bookmark-manager/README.zh-CN.md`：使用说明、各职责和定向验收命令。
- `docs/product/bookmark-manager-feature-universe-r12.zh-CN.md`：P0→P3 产品宇宙，AI 整理、知识图谱、阅读回顾、社区/服务市场与商业模式；Chrome 扩展私有浏览画像定向广告标 `NO-GO`。
- R28 跨 Tab 布局规范、两份工具 Skill 及 R1.1 历史说明已同步 R1.2 的“同一文件树免拆区”例外。

## 当前验证分级

- `PROTOTYPE_CHROMIUM_PASS`：受控 Chromium 的交互原型测试，覆盖单行按钮和 320/360/420px、折叠/展开、目录增改移动删除/确认、创建书签、搜索、危险 URL 拒绝、无 JS 异常。截图与临时本地 QA 在本轮对话工作空间中；不表示扩展原生成功。
- `NODE_LOCAL_PASS`：本轮单独构建的书签树/Chrome Mock 服务定向测试 7/7 通过，包括新增子节点后的删除拒绝。**需在正式仓库候选中重新执行提交后的测试**，不能以本地副本代替当前 main 的 CI 原始记录。
- `SOURCE_WIRED`：官方 GitHub `main` 已存在 Tool Tab 按钮、真正第一方源码和作用域 CSS，初始授权/拒绝/撤权由可信 UI 和 Chrome optional permission gate 处理。
- `REPO_NODE / BUILD / PACKAGE / REAL_CHROME / MAC_PROFILE / 200%_ZOOM`：**NOT_TESTED / PENDING**，等待真正项目 checkout、CI / Mac Codex 中的定向验证。未在当前会话调用本机 `npm run build` 或加载你的 Mac Profile，不能声称质量 95+ 正式产品验收。
- GitHub Actions 会因 main 提交异步排队；任何尚未完成/不属于同候选的动作不能当成通过证据。

## 立即验收清单（核心先于扩展宇宙）

1. 取得最新 `main` 及并行工作区状态，核对本任务文件/构建资源的写入所有权，不覆盖其他 Agent 的修改。
2. `node --test tests/environment/bookmark-manager-r1.test.mjs tests/environment/sidebar-tools-host.test.mjs tests/environment/sidebar-tools.test.mjs`；随后 `npm run check`、真实构建和包验证。优先修构建失败或不可信权限判定。
3. Mac Chrome 扩展 `dist/development` 的正确 ID 路径加载；在「工具 → 书签管理」点击授权，真正创建并编辑一个临时书签和子文件夹，返回重开核对数据；同 Chrome 多窗口修改、撤销 `bookmarks` 权限、系统/受管节点、非空目录下新增子书签后尝试删除；失败必须保留原始行为。
4. 真实 320/360/420px、浅深主题、键盘 Tab / Esc 与浏览器 **200% 真缩放**，确认三个操作入口、树节点管理与表单可见。
5. 普通动态工具仍无法获得完整书签树；导入/卸载、Time Review、其他既有工具不能被误识别为书签内置功能。
6. 同候选 Node、构建、真实 Chrome 原始日志/截图和身份绑定后才能将相应阶段标 PASS、评 95+。

## 非本次交付

AI 整理、访问频率追踪、历史权限、定时清理、自动链接检测、社区、在线同步、商业市场、个性化广告全部未在 P0 开发，也未申请 `history` 权限。需求实验与政策风险见功能宇宙文档。
