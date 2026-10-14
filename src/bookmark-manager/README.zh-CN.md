# 书签管理 · 第一方可信 Side Panel 功能

本功能位于既有侧边栏「工具」选项卡的内置书签管理入口，不创建新一级 Tab、沙箱安装器或网页采集后台。UI 经本扩展源码编译，普通用户不需要项目源码；用户/AI/市场导入的动态工具不会因此拥有完整 Chrome 书签权限。

## 第一版用户操作

首次打开显示单一「书签管理」标题及必要的 Chrome `bookmarks` 授权按钮。授权后显示**文件夹与书签混合的一棵文件树**，上方统一搜索和一行「☆ 收藏当前页 / ＋书签 / ＋文件夹」。文件夹可展开、折叠、创建子文件夹、重命名、移动、删除；书签可查看、创建、编辑、移动、打开和删除。删除文件夹会再次确认并核对其真实子树，避免其他窗口刚新增的书签被一起删除。

书签数据直接来自当前 Chrome Profile 的 `chrome.bookmarks`，不会被自动上传或另存成 OpenDesk 书签镜像。Chrome 系统根目录和受管理节点只读。创建/编辑网址只接受普通 HTTP(S)；已存在的其他方案书签保持可见，修改标题时不主动改写其 URL。权限被拒绝或撤销时失败关闭，不伪装成空树。

## 核心文件

- `model.js`：Chrome 树、根目录/管理节点判断、父子约束、URL 校验和节点快照。
- `service.js`：唯一 Chrome bookmarks 适配；读写前核对权限、并发节点变化及删除子树清单；订阅/解绑官方书签事件。
- `trusted-ui.js`：可信扩展 UI、首次授权/状态/交互。仅使用现有宿主，不运行已安装工具代码。
- `../ui/bookmark-manager.css`：只作用于工具自身的紧凑排版。
- `../ui/tool.html` 与 `../ui/sidebar-tools.js`：入口及原有工具 Tab 的最小接线。
- `../../prototypes/sidebar/bookmark-manager-preview.html`：与主功能区一棵树的交互原型，不接真实书签。
- `../../tests/environment/bookmark-manager-r1.test.mjs`：树模型、权限、CRUD、撤权、过期写入、非空目录删除的定向 Node 测试。

## 开发验收（不可混同）

在仓库最新 main 验证：

```sh
node --test tests/environment/bookmark-manager-r1.test.mjs
node --test tests/environment/sidebar-tools-host.test.mjs tests/environment/sidebar-tools.test.mjs
npm run check
npm run build
node scripts/verify-package.mjs dist/production
```

再在用户 Mac 的**正确扩展 ID 和 `dist/development` 路径**中做真实 Chrome：首次授权/拒绝/撤权；原书签栏、其他及移动端目录；Chrome 管理节点；创建/移动/修改/多窗口编辑/外部同步变化/非空目录删除；长中文、320/360/420px、暗色、200% 缩放；保证动态沙箱工具无法读取 Chrome 书签树。切忌凭 Node Mock 或静态原型声称 Native PASS。

## 本模块的产品资料与维护边界

**模块专属信息以这里为入口，不再散落维护第二份书签管理产品文档：**

- **本 README（当前文件）**：用户流程、P0 行为与安全边界、源码职责、运行/验证方法。界面原则是「单一书签树 + 一行三操作 + 单个页面标题」；不把文件夹和书签拆成两个独立区块。
- **[ROADMAP.zh-CN.md](ROADMAP.zh-CN.md)**：独立负责 P0–P3 产品机会宇宙，包括重复/失效检测、访问与阅读回顾、AI 目录迁移建议、知识树、定期复习、社区、咨询/服务市场、收费与隐私/平台政策限制。仅是候选规划，不等于已实现。
- **[交互 HTML 原型](../../prototypes/sidebar/bookmark-manager-preview.html)**：只读设计展示，使用模拟数据；现有预览画廊继续保留原路径，避免在代码目录复制第二份 HTML。
- **[工程验收工作账本](../../docs/framework/workstreams/bookmark-manager-r1.md)**：管理当前候选 SHA、真实测试输出、PASS/FAIL/NOT_TESTED 与交付缺口，不在 README 中重复记录易过期的分数。
- **[第一方可信工具 Skill](../../.agents/skills/opendesk-trusted-sidebar-feature/SKILL.md)** 和 [Side Panel R28 通用布局规范](../../docs/architecture/sidebar-multi-section-tab-contract-r28.zh-CN.md)：仅保存跨工具通用约束；书签专用功能、商业探索与 UI 细节仍由本模块维护。

### 规划与 P0 的边界

智能清理、自动阅读/访问统计、按周复习、AI 知识树、主动推荐、社交与服务交易都**尚未交付**。不得因为这些设想扩大 P0 的 `history` / 网络权限、自动上传个人收藏，或把规划项伪装成已实现功能。涉及广告的路线必须遵守 Chrome Web Store 政策：不得将扩展获得的私有浏览/收藏数据及其派生画像用于个性化广告。


