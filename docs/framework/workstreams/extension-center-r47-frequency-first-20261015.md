# Extension Center R4.7 · 高频优先与 0–1 主操作（2026-10-15）

> 本文件记录 R4.7 **当前候选**的源码、实施边界与验收账本；必须按最新 main 和真实 CI 更新结论，不覆盖 R4.1/R4.2 历史验证。无同 SHA 的 Mac Chrome 原生回执不可标记 95+。

## 实施任务与边界

- 仓库：`shopable-ai/opendesk-browser`；仅 `main` 正常提交；初始只读基线 `1e223bdd080143bb60c06b83dd29768f33d452f3`。
- 写入所有权：`src/ui/extension-center.js` / `extension-center-model.js` / `extension-center.css`、`src/ui/sidebar-tools.js` 现有启停交互的最小复用、R4/R4.2/R4.7 测试、Extension Center 现有 CI、`docs/product/sidebar-ui-spec.zh-CN.md`、此记录和唯一 R4.7 HTML 原型。**不改** SDK、Worker、SW、安装器、Page Authority、公共 Token、`src/ui/tool.html`、原有 Preview Generator。
- 延续既有 R4.2 原生证据与静态基线；但历史“停用→设置主按钮”“Page→管理按钮”“候选→安装按钮”已由 R4.7 用户目标覆盖。App 主操作不因更新转变为安装新版。
- 页面：五 Tab `扩展` → 统一列表 → 详情 → 返回；行主区域保持完整两行布局，`⋮` 为可见且可键盘访问的**行级管理**；顶栏 `⋯` 只负责全局筛选/导入/刷新。
- 原生 CFT / Mac Chrome、用户共享工作目录、watcher、端口、dist、ZIP 未占用、未访问。现有 preview 是独立的可点击**视觉适配原型**，复用同仓库 3 个 CSS 文件，不是生产包或真实 Chrome 证据。

## 功能叶子、真实场景、实现与可执行证明

| ID | 使用场景 / 成功条件 / 失败行为 | 源码 | 当前证据 |
| --- | --- | --- | --- |
| F1.1/1.2 | 已启用且可信的应用显示 1 个“打开”；停用、Page、候选、状态未知显示 0；异常不冒充能力 | `extension-center-model.js:resolveExtensionPrimaryAction`, `extension-center.js:draw` | 模型测试/源码回归待 CI |
| F1.3/1.5 | 点击主区域/主按钮都走 `openRow`，保留可信 `openTool`；无按钮时只进入详情、不安装代码 | `extension-center.js:openRow` | 源码回归待 CI，原生未测 |
| F1.4 | 未安装候选只有在已有**真实安全预览能力**时才出现预览入口 | 现存可信预览仅为工具开发预览，**无已核实候选通用安全预览入口**；故不展示按钮 | NOT_SUPPORTED / 不虚构 |
| F2.1/2.5 | 已安装项通过一直可见 `⋮` 打开固定定位菜单；上下/Home/End/Escape/Tab/外部点击/滚动不会困住焦点或裁剪 | `extension-center.js:showRowMenu/closeRowMenu`, `extension-center.css` | 静态断言待 CI；真实键盘/视口未测 |
| F2.2 | 从行菜单启停应用，签发动作前检查受信用户事件；取消未保存草稿不改状态；成功持久化且撤销旧实例；失败不报成功 | `sidebar-tools.js:toggleEnabled`, `sidebar-tools/installation.js:setInstalledSidebarToolEnabled` | 重用原可信生命周期，候选集成测试/原生未测 |
| F2.3 | Page 启停走现有 Chrome 网站权限手势 + Installed Page Authority，manifestHash 和 generation 过期须拒绝 | `extension-center.js:togglePage`, `installed-page-tools.js` | 原有权限回归 + 新源码断言待 CI |
| F2.4 | App 设置、网站授权与可确认卸载进入既有可信设置；新版走可信固定包审阅；Page 编辑走原开发页面 | `extension-center.js:showRowMenu`, `sidebar-tools.js:openSettings` | 路由源码核对；真实卸载未测 |
| F3.1–3.4 | 不强制生成“管理/设置/安装”主按钮，不重复开关，保留分类文字、Hover/Focusing 和清晰状态 | `extension-center.js:draw/rowDescription`, `extension-center.css` | 静态 CSS/模型验证待 CI |
| F4.1–4.4 | 应用旧实例 epoch 安全撤销、Page 授权代际、草稿确认、异步忙状态与并发更新结果显式可辨 | 既有安装器、Page Authority + R4.7 展示调用 | 旧主干能力保留；新入口完整原生未测 |
| F5.1–5.4 | 浅色交互原型可查看按钮/菜单/停用/权限/未知/空/候选，使用正式 CSS；不调用原生 Host | `prototypes/sidebar/extension-center-r47-frequency-first-preview.html` | 代码存在；浏览器可视交互 NOT_TESTED；CHAT_ADAPTER_NOT_SOURCE_HTML |
| F6.1–6.5 | Node/CI 受影响回归、复核提交身份、反方审计、逐维评分、Chrome 证据、任务百分比 | `.github/workflows/extension-center-r4.yml` + 本记录 | 待 CI 与 Mac/Chrome |

### 反方验证矩阵（不得以平均分抵消 P0 FAIL）

| 反例 | 风险 | 防护/实际实现 | 证据 |
| --- | --- | --- | --- |
| 停用后没有“打开”，难以恢复 | 恢复入口被埋 | 常显 `⋮ → 启用应用`，成功不自动启动 | 静态已设计；原生 NOT_TESTED |
| 整行与按钮行为不同 | 误安装或误运行 | 两者同一 `openRow`，无主动作只 `openDetail` | 源码待 CI |
| Page 只有自动运行能力却显示“管理”主按钮 | 高频入口虚假 | 无核实 Page UI 不显示主按钮；菜单内可启停 | 模型待 CI |
| 未安装直接点击出现预览/安装 | 绕过固定包审核 | 无已验证 candidate preview 一律只看详情；安装进入 `openOfficialReview` | 源码待 CI |
| 最后一行菜单超出列表或 Side Panel | 用户无法点到操作 | 菜单脱离 clipped `ul`，按视口 fixed 定位并随滚动关闭 | 真实像素 NOT_TESTED |
| 旧草稿与启停竞争 | 数据损坏或丢失 | 有草稿时原 `canLeave(apply)`，操作前重新核对包/会话/启停；不同应用不丢当前草稿 | 新入口原生 NOT_TESTED |
| 读记录失败被视为正常启用 | 不受控启动 | 显式 `stateKnown=false`，应用不出现“打开”；Page 不显示启停 | 模型待 CI |
| 停用伪造本地 enabled | 已停用仍运行 | 委托原 package lock/epoch/Authority；UI 不直接写数据 | 源码待 CI |

## 评分与进度门禁

**评分分级：** UX 设计预评审、源码接线、CI 单元、打包、真实 Chrome 需分别记载。没有实际测试不能给 95 分或 PASS。逐维目标：高频使用效率、主操作语义准确性、组件去重、信息架构、视觉交互、可访问性、真实生命周期、安全权限、异常恢复、预览与正式一致性、实际 Chrome 均 ≥95；当前**正式得分尚未评定**（NOT_TESTED / SOURCE_PENDING_CI）。

**完成率方法**：按 P0 功能叶子逐个绑定 `使用场景 → 成功/失败 → 源码 → 测试证据`；已连线不等于验收完成；无法认证真实 95+ 时正式验收完成率仍是 PARTIAL，必须分别报告“源码实施覆盖”和“正式产品验收”，不得用测试数量或任意等权任务树计算假精度。

**下一轮 P0**：在稳定提交候选上检查 CI 测试与 build/verify；实际 Mac Chrome 验证菜单边界、键盘、应用及 Page 真实启停、异常恢复、权限提示、安装审阅、原生用户草稿；正式 HTML 原型视觉与正式运行 UI 作同来源对比；对有真实入口的 Page 用户 UI/候选安全预览逐项调查，不创建伪能力注册表。

状态：`SOURCE_PREPARED / CI_PENDING / NATIVE_CHROME_NOT_TESTED / PRODUCT_95_NOT_CLAIMED`；提交 SHA 与 CI 运行链接待提交后补记。
