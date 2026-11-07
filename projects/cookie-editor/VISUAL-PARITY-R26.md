# Cookie Editor R2.6 · 视觉与交互恢复 · 文件级差异台账

## 原始目标与基线

- 终极产品目标：保留正式 Cookie Editor React/Controller/SDK/Trusted Host 的安全和现有 Cookie 属性能力，恢复多账号、切换、URL 规则、分享配置、授权市场的紧凑侧边栏体验。
- 旧版视觉参考：个人 Library `cookie-editor-r2.2-market-rules-share-preview.html`（实际读取成功）；**旧 HTML 只是设计参考，非生产实现**。
- 初始远端 main：`e7ba2b9ac985aba025b60ce61a99754be55c98d9`（2026-10-27 检查时）；本轮中其他提交并发推进，仅通过当前文件 SHA 保护方式编辑真实 main。
- 修改途径：GitHub main 原位，未创建分支、Worktree、PR、强制推送或自行重写安装 JSON。
- 真实 Mac 本地路径 `/Users/shopme/Documents/workspace/opendesk-browser` 在本次运行环境中不可直接访问。

## P0 同状态设计台账

| R2.2 参考 | 旧正式 React 已有 | 本轮差量文件 | 状态 | 真实验收 |
| --- | --- | --- | --- | --- |
| Cookie 页面：网站信息 → 主导航 → 搜索与工具栏 | 网站栏嵌套 Cookie 页、主导航为厚重分段按钮 | `app/CookieEditorApp.jsx`, `app/components/CookieEditorView.jsx`, `src/react.css` | PARTIAL：单独站点栏/轻量下划线布局已入源码 | NOT_TESTED：同尺寸截图 |
| Cookie 新建、属性、Session 和 Expiration | Domain、Path、Store ID、Partition、Unix 秒转换等已存在 | 不修改 `app/domain/cookie-expiration.js` 与 `CookieInlineEditor.jsx` | DONE_VERIFIED（保留已有源码） | NOT_TESTED：本轮回归 |
| 账号列表、虚构 3 账号、当前账号摘要 | 正式已有账号 CRUD/切换/菜单，预览默认为锁定零账号 | `CookieAccounts.jsx`, `preview/react/src/App.jsx`, `preview/react/src/mock-sdk.js` | PARTIAL：默认虚构多账号、最近一次可信切换标记 | NOT_TESTED：Chromium |
| 账号切换自动刷新 | 正式已有经回读验证后刷新开关 | 原有安全链路未变 | DONE_VERIFIED（源码存在） | NOT_TESTED：真实 Chrome |
| URL 自动切换独立子页面 | 正式已有 canonical `#od-account=` / 审核白名单 | 原有账户域/Host 未变 | DONE_VERIFIED（源码存在） | NOT_TESTED：Chromium / 真实 Chrome |
| 指定用户 / 匿名邀请、24h/7d、1/3、过期/撤销/重复/故障 | 正式缺页，菜单分享入口禁用 | 新建 `app/components/CookieAccountExperiences.jsx`，`CookieAccounts.jsx`, `src/react.css` | PARTIAL：真实 React 展示组件 + 虚构演示 | NOT_TESTED：Chromium；正式服务器 MISSING |
| 市场三类虚构资源、搜索、筛选、详情、申请 | 正式仅「尚未上线」占位 | `CookieAccountExperiences.jsx`, `CookieEditorApp.jsx`, `src/react.css` | PARTIAL：同源 React 场景 + 生产 disabled | NOT_TESTED：Chromium；正式服务器 MISSING |
| 错误/未知/首次授权/锁定 | 既有 Controller 错误场景，缺账号明确故障场景 | `preview/react/src/mock-sdk.js`, `preview/react/src/App.jsx` | PARTIAL：mock 接入失败/结果未知 | NOT_TESTED：Chromium |
| 320/360/380/400/440px，浅色深色，实验台隔离 | 预览实验台已收起、仅视口控制 | `preview/react/src/App.jsx`, `src/style.css`, `chromium.mjs` | PARTIAL：新增宽度切换与验收脚本 | NOT_TESTED：像素截图/200% |
| React 同源单文件 HTML | 旧 `index.html` 实体已有，但已不反映本轮源码 | `vite.config.mjs`、`preview/react/build-preview.mjs`、测试 | MISSING：**必须执行真正 Vite 构建并提交生成物** | NOT_TESTED：来源校验 |
| 生产安装 JSON | 源码配置 `2.0.40`、安装包 `2.0.39`（本轮启动时） | 本轮未直接覆写包 | MISSING：待现有 R5.38 CI 通过再自动原位推广 | NOT_TESTED：可安装候选一致性 |

## 安全与归属

- **生产操作链不变**：Cookie 值读取、持久化、写入授权、Vault 加密、Cookie 切换由既有 Controller → Adapter → Trusted Host 执行。本轮未改动这组逻辑，也不声称原权限缺陷已解决。
- **分享 / 市场没有接入真实后台**：生产 UI 的邀请生成、申请已禁用，所有假邀请只在现有 React 预览的受控虚构场景中可点；示例 URL 用 `example.invalid`，不包含 Cookie、密码、Session Token 或任何可复用凭据。
- **网站当前身份不能由 Cookie 快照断言**：当前账号的高亮只表示最近一次返回 verified 的 Cookie 切换收据，不代表网页已完成登录验证；没有此证据显示「尚未验证」。
- 预览 `src/App.jsx` 只注入虚构 SDK；没有第二套 React App / Controller / Host / 独立业务预览 UI。
- `vite.config.mjs` 已补充新 JSX 到正式发行的 source fingerprint，防止包构建遗漏来源。
- UI 样式仅用 OpenDesk Shared UI 语义 Token，保留 `/* @opendesk-shared-design */` 门禁，按钮继续使用 `od-button/od-icon-button`。

## 已提交的本轮源码差量（真实 main）

- `86f0c88`: CookieEditorView 单独网站栏条件渲染
- `ad5b0a2`: App 层统一站点上下文、导航、验证后的账号态
- `98cf071`: 紧凑主导航与 Surface 布局
- `9aea785`: 账号摘要和已验证切换高亮
- `d6f1380`: 新增分享和市场 React 展示组件
- `033bf57`: 正式 App 接入市场 React 组件
- `eef6fcd`: 账号菜单接入分享配置，移除旧市场占位出口
- `40bf585`: 展示组件布局与 Shared UI Tokens
- `1783b68`: 3 账号 mock 与切换失败/未知场景
- `7e62814`: 默认多账号预览及宽度控件
- `b6940b0`: 预览宽度容器布局
- `2e7e5be`, `32a3125`: Chromium 验收脚本扩充
- `1c977a6`: 虚构数据和同源契约 Node 测试
- `b9abf29`: 正式来源指纹清单
- `585187a`, `bcdca94`: R2.6 单文件预览标题与断言一致

## 继续执行时只做这些差量（不得重复开发）

1. 在真实 main 工作区检查最新 HEAD、未提交文件与其它 Agent 施工范围；有并发冲突仅暂停重叠路径。
2. 运行 **已有**候选 CI 或本地现有构建链：正式 React、Shared UI、Preview Adapter 的 Node 测试、`npm run check`、`npm run build`，先消除真实失败，再执行 Chromium。检查扩展源码候选与生产安装 JSON 版本/字节来源。
3. 运行 `preview/react/chromium.mjs` 并收集账号/分享/市场截图（320/360/380/400/440），补齐深色与真实 200% 缩放。对照 R2.2 相同状态/宽度的截图手工审查视觉，发现差异继续差量修复。
4. **通过后才由现有 R5.38 CI 受保护流程或本地正规构建流程重新生成并提交** `preview/react/index.html`、`cookie-editor.opendesk-tool.json`。切勿手改压缩代码、绕过发布校验或删除 Host 权限检查。
5. 本机 Mac Chrome 用隔离测试 Profile 验证安装/升级、Cookie CRUD / Expiration / Host 权限、账号切换/刷新和 URL 白名单，并记录 NOT_TESTED 的剩余项。
6. 八维角色独立审查，每项分数为有效证据支持的 0–100 分；未测项目填 NOT_TESTED 而非高分；只有八项各 ≥95 且平均≥95 才宣称通过。

## 本文件的证据边界

本轮通过 GitHub Connector **读回/修改/提交了源文件**。未直接访问用户 Mac 本地文件，也未在本运行环境启动 Node/Vite/Chromium。因此**不能**断言像素级 R2.2 对齐、正式包一致、Mac Chrome E2E 或综合得分 ≥95。构建与 CI 结果必须绑定随后实际成功运行的提交 SHA。
