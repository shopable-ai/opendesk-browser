# AI Proxy R6 · 正式 UI 对齐与验收

正式 PC 和 Side Panel 的主要差异已落实到 React：共用三行新增／编辑表单，统一弹窗尺寸、字段节奏、按钮和密码眼睛；修复深色管理页及诊断首卡的颜色。保持真实配置选择、应用和权限流程。它接近已批准设计，但不是像素完全相同：真实控制详情使模式卡较高，认证限制说明占独立一行，正式页面不显示预览的模拟已应用状态。

最终候选为 **0.3.20**。最终浏览器身份、各场景 DOM/computed style 和每条断言见 [chrome-result.json](chrome-result.json)、[ui-audit.json](ui-audit.json)；构建及安装包哈希见 [identity.json](identity.json)。本地提交 SHA 由任务最终回复给出，避免把待创建的提交写成已完成。

## 设计基准和运行身份

- 已批准参考仍是 `preview/preview.html` 的 R3 冻结 R16/R18 版本：Git `36cd8e90622d31d8fb4739d05110ed520791e46c`，blob `c0adf8a1efd330ed79cd85768f981d44e93580bf`，SHA256 `c918b89a306c4f1c03a7cffacd2c77840ec5343e357d6f271049e99df91d9c4a`。从该 Git 对象提取只读参考，没有生成器覆盖或修改批准哈希。
- 开始时工作树已有另一份未提交 preview 修改，SHA256 `277ff8df72970906370507e9d7448da3ba583cb293536cae874c1a034080a977`。其代理弹窗基本等价，网站规则／默认路由有后续漂移；本轮保留该文件原状且不提交它。冻结参考只有浅色主题；深色按现有 OpenDesk Tokens 验证可读性，不伪称存在批准的深色参考。参考窄屏堆叠行为由用户最新“三行固定顺序”要求取代。
- PC 正式入口 `app.html?toolId=ai-proxy&view=settings&section=profiles`：原可信 `Surface.jsx` → `App.jsx` → `Settings presentation="management"`。真实 Side Panel：相同可信根 → `App` → `QuickPanel`；Header“添加代理”可进入侧栏 Settings。两者使用同一个 `ui/ProxyEditor.tsx`。
- 原正式 JSON 0.3.17 的 SHA256 为 `8d156b97dc12b671b2d0ddd7ab32049df8835c9831117a4f94145f3ba5350be3`；原 React 构建回执过期，9 项输入漂移。因此先区分已安装包、固定编译 React 与当前源码，再修复，未把旧包截图当成最新源码的结果。
- 最终使用任务自有源码快照构建完整 **production 静态候选**，不是 Git worktree，也不是 serve/HMR。真实 Chrome 155.0.8059.39，隔离 Profile，实际 `SIDE_PANEL` context，唯一可信 React root、零 iframe。加载的 Worker／tool-shell 字节核对一致；安装通过原扩展中心“导入→审阅→取消核对→再次审阅安装”，未直接写安装记录。
- 未修改日常 `dist/development`、日常 Chrome、扩展配对或其他任务的 watcher。PC 与侧栏是已有的独立 service 实例；跨视图写入后显式刷新并从真实扩展列表重新打开，确保截图具有同一份持久化数据；不扩展跨窗口订阅，也不重放未知操作。

## 差异清单与修复

| 优先级 | 页面／元素 | 原正式效果 → 参考／最终效果 | 原因与源码 owner |
|---|---|---|---|
| P0 | Side Panel 新增 | 独立整页、先地址、名称折叠 → 与 PC 相同的三行弹窗 | `QuickPanel.tsx` 独立表单已移除，复用 `ui/ProxyEditor.tsx` |
| P0 | PC 弹窗比例 | 圆角12、内距22、字段40、行距14 → 圆角16、内距28、字段42、行距19 | `sidebar-settings.css` 成为唯一共享几何 owner；删除 `management.css` 的竞争覆盖 |
| P0 | 协议／端口列 | PC 96／80 → 114／95；窄屏协议96裁切 → 104／80 | 原生 select 内部箭头占宽，已真实临时 CSS 验证后写回原变量 |
| P0 | 字段排列 | 侧栏无常显凭据、入口排列不同 → 名称／协议地址端口／用户名密码 | 同一组件与保存 handler，四个协议完整显示，凭据可空 |
| P0 | 深色管理页 | 深底仍用深色文字和固定白卡 → 原浅色值保留、深色使用语义 Tokens | `management.css` 原声明改用 `light-dark`，没有追加高优先级补丁 |
| P0 | 深色诊断首卡 | 浅底浅标题，状态文字偏暗 → 深色表面、可读标题及状态 | 独立截图评审发现；`styles/options.css` 原诊断规则固定色改为语义色 |
| P1 | 新增动作 | “保存并选择／继续新增” → 仅取消／保存，保存不选择也不应用 | `QuickPanel.tsx` 共用编辑器 SAVE_ENDPOINT 路径 |
| P1 | 密码／窄字段 | 空密码无可操作眼睛、空输入保留清除按钮空位 → 常显眼睛、按实际按钮留空间 | `ui/ProxyEntry.tsx`；密码默认隐藏 |
| P1 | 键盘焦点 | 禁用保存时 Tab 可离开原生 dialog → 首尾双向循环 | `ProxyEditor.tsx` 仅处理 Tab，保留 IME、Enter、Escape 和 Host 确认 |
| P1/P2 | 并发草稿 | 独立评审复现旧快照覆盖、待保存时再编辑可能重复新增 → 固定打开 ETag、保存时锁输入、同次新增稳定 UUID | `ProxyEditor.tsx`、两个入口传入同快照 ETag；独立复现关闭 |

PC modal 实测：参考 **560×447.4px**，原正式 **560×414.2px**，最终约 **560×457.2px**；最终主要字段高度 **42px**。高度仍比参考约多10px，来自持续可见的真实认证限制说明，未删除说明制造截图一致。完整矩形、字体、内距、列宽和颜色见 [geometry.json](geometry.json)。

## 可视证据

并排图只裁切、拼接真实截图并加标题，没有重绘产品、替换状态或模拟网络结果。原始同视口截图均在 `screenshots/`，对照不把预览工具条和正式 Host 工具条混为同一内容区。

- [PC 弹窗：参考／修复前／修复后](pc-dialog-reference-before-after.png)
- [Side Panel 弹窗：参考／修复前／修复后](side-dialog-reference-before-after.png)
- [PC 主界面：参考／正式](pc-reference-after.png)
- [360px 编辑弹窗：浅色／深色](narrow-edit-light-dark.png)
- [PC 七栏目浅深色](pc-seven-sections.png) · [侧栏七栏目浅深色](side-seven-sections.png)
- 深色诊断返修前为 `screenshots/before-diagnostic-dark.png`；最终为 `screenshots/pc-section-diagnostic-dark.png`。

## 验证结果与限制

| 状态 | 范围 | 证据 |
|---|---|---|
| PASS | 最终同候选 60 截图场景、143 断言，PC1440、侧栏430/360、浅深主题、空态、列表、新增／编辑、七栏目 | `ui-audit.json`；控制台异常0 |
| PASS | 名称初始焦点、18次Tab／12次Shift+Tab、Escape、取消／确认丢弃草稿、返回触发器焦点、密码显隐 | 同一真实 Chrome 审计 |
| PASS | HTTP／HTTPS／SOCKS4／SOCKS5 无凭据保存；Enter 连按只新增1条；配置／网站规则重载保留；没有自动应用 | 同一真实 Chrome 审计、Chrome 代理设置前后不变 |
| PASS | 凭据未接线拒绝保存且保留草稿；普通持久化无测试密码；已有 credentialRef 不允许清除、伪造或转绑 | 浏览器拒绝路径和 `settings-credentials`／`service` 定向测试 |
| PASS | 草稿、确认、保存、网站规则等7文件167项；新增键盘补丁后的编辑器／确认／可信准入4文件25项；独立复现和键盘处理诊断 | `node-regressions.log`、`admission.log`、`review.json` |
| PASS | Vite 业务构建、完整 Browser production 构建、64个审核源码 pin、原打包校验／晋升／同源核对 | `identity.json`、`promotion.log`；所有原 CSP／来源／体积硬门禁保留 |
| PASS | 安装好的 PC 不被可选远程目录阻塞 | Host 真实 controller 回归：RED后GREEN，见下文 |
| FAIL（已有基线） | 较广 Host 三文件检查50PASS／9FAIL；恢复本轮 readiness 改动的内存基线重现同9FAIL＋新增回归FAIL | `host-baseline.log`／`host-broad.log`；未修改无关断言或框架制造绿灯 |
| BLOCKED | 最终本轮 UI 路径无阻塞 | 早期磁盘不足／远程目录超时已隔离诊断并保留历史日志，不冒充最终失败 |
| NOT_TESTED / NOT RUN | 受控407认证、真实远端代理可达性、完整LSP类型诊断、全仓CI、其他Chrome版本、日常Chrome更新、远端推送／发布 | 不属于本轮实际证明；未宣称通过 |

新增业务测试针对跨入口共用表单、CAS草稿、重复保存和凭据保护；未为可逆样式添加字符串镜像测试。CSS 修复由最终截图、computed style、窄屏边界和原构建来源门禁验证。

## PC 启动的最小公共框架例外

真实完整 production PC 曾只显示 Host 的“⋯”，调试证明运行时及 controller 已连接，但 `sidebarTools.ready` 等待可选远程 Catalog／默认预安装。GitHub 超时，LAN fallback 拒绝 TCP；业务组件在尚未挂载前无法修复。`src/ui/sidebar-tools.js` 仅把这两个可选任务从就绪屏障移出，仍启动并正常投影结果；原8项本地身份、启用、撤权和站点授权读取仍等待。没有 AI Proxy 特判、第二套 Host 或权限放宽。回归测试使用真实 controller 延迟可选目录，先红后绿。

跟踪的日志只去除行末空白，原始日志仍在 artifacts/ai-proxy/r6-20261113。公共文件存在并行工作，本轮只提交上述 readiness hunk 和相应既有测试增量。9项较广检查的历史基线失败属于默认发行 fixture、通知结构及旧预览生命周期断言；不把它们归为本次产品故障，也不宣称整组通过。

## 独立评审与交付

同一模型的独立实例，标记 **单模型多视角评审**。视觉与一致性依据最终截图，源码／业务依据独立复现和测试；实际六项分数如下，证据与局限见 `review.json`。

| 视觉 | 产品 | 交互 | 认证／业务 | 工程 | 预览一致性 | 算术平均 |
|---|---|---|---|---|---|---|
| 94 | 93 | 96 | 96 | 96 | 95 | **95.0** |

剩余 dark 导航对比偏弱、规则提示偏密、窄屏长地址核对空间及页脚细微差异均为非阻断项；独立评审未发现剩余 P0/P1。

正式 JSON 由原打包器候选→验证→原子晋升，同源码一起本地提交 main。未 push、创建分支、worktree 或更新日常 Chrome。保留 R3/R5 历史记录及未提交的 preview。下一步如需用户日常使用，应由该环境 owner 通过现有安全刷新／安装审阅应用本地提交；固定编译 React 的更新不能仅靠导入工具 JSON 替代。
