# AI Proxy 交互预览 · 2026-11-08 图标管理入口

当前阶段是**先完善预览，交付用户确认，再修改扩展业务代码**。上一轮侧栏改版未经认可，不再作为设计基线；旧 R2 Host/多文档计划只作历史参考。本轮已交付可操作预览，状态 `AWAITING_USER_REVIEW`，不代表设计已获确认。

## 2026-11-08：两个管理入口改为图标

只把「我的代理」右侧的“管理全部”和「当前网站」右侧的“管理规则”替换为对象图标，复用现有 `ProxyIcon` 的 `profile` / `rules` 与原图标按钮视觉，右上角 ↗ 表明打开独立管理页。启用、模式选择、代理行和底部操作仍保留原文字与顺序。

点击区为 34 × 34 CSS px；悬停和键盘聚焦显示原动作文字及本地化目标说明。保留原可访问名称，图形与箭头不重复朗读；提示框可悬停，Esc 隐藏提示且不主动移动焦点。Enter / 空格沿用原按钮语义和原 `profiles` / `rules` 路由。

实现仅在 `preview/ManagementAction.jsx`、`management-actions.css`、`management-actions.mjs` 及原预览生成器中；编译期精确替换两个入口，冻结基线不改。34px 命中区比原文字按钮稍高，相关区块增加少量高度，四条代理和其他控件保持原样，不宣称逐像素不变。

当前 HTML SHA-256：`0075577c7e2d22e57ebf8e5a73a6b545b73f50b0fe63c5e4e1d943f84cad66d6`。证据目录为 `artifacts/ai-proxy/icon-actions-20261108/`：`final-interactions.json` 记录两个键盘目标、关闭后原侧栏继续挂载及 APPLY/STOP/SAVE 均为 0；`escape-hover-after.json` 记录焦点位于其他控件时两个悬停提示的 Esc 关闭与焦点保留；`source-verification.json` 核对 70 个来源无漂移及 74 个受保护业务/正式包/基线文件未变。尺寸为 CSS 与截图证据，未用 OOPIF computed style 测量。常态采用 `final-normal-viewport.png`，浮层采用 `final-{en,zh-TW,zh-CN}-{profiles,rules}.png`，聚焦采用 `final-keyboard-profiles.png`，均绑定同一候选并等待实际绘制；排除 fullPage 合成图。`final-keyboard-rules.png` 未直接证明规则图标焦点环，规则键盘路径以交互记录为据。`final-locale-rendering.json` 记录英文、繁中和简中实际渲染；使用已有语言选项写内存偏好，再诊断重挂载同字节 iframe，不代表跨文档语言偏好自动同步通过。

独立设计评审最终六维最低分 **95/100**，实现评审 **97/100**，无剩余阻塞；不沿用旧分数。[评审记录](../../artifacts/ai-proxy/icon-actions-20261108/expert-review.json)。

| 设计维度 | 分数 |
| --- | ---: |
| 可理解性 | 95 |
| 视觉一致性 | 97 |
| 排版保真 | 96 |
| 可访问性 | 95 |
| 交互反馈 | 96 |
| 多语言适配 | 95 |

首轮设计 92、实现 94；两位评审均指出仅悬停时 Esc 的处理缺口，已先复现再修复并回归。最终评分只覆盖两个图标入口的这版预览，不代表完整无障碍认证或正式 Chrome/Native 通过；实现审查未运行 LSP。ego TaskSpace 23 已释放，本地预览服务保留供用户查看。

以下 11 月 7 日结果是上轮观察，完整 PC 七区和保存/草稿链本轮未重复验收。

## 基线与最小变化

- 业务 owner 为 `projects/ai-proxy/`，现有 `main`；原 `/Users/shopme/Documents/workspace/ai-proxy` 只读。不创建分支、worktree、PR，不提交/推送。
- 改版前业务侧栏来自提交 `fcfc32a10ab656133547c43e46818c9a8e63c163` 的 `src/QuickPanel.tsx`、`src/style.css` 和 `src/styles/sidepanel-r86.css`。在 `preview/baseline/` 冻结只读输入及 SHA；原路径只用于编译期解析依赖，不覆盖工作树。不是第二套正式产品实现。
- 恢复原顺序：连接方式与添加/齿轮 → 浏览器状态 → 四条快捷代理 → 当前网站 → 原底部订阅/诊断入口。保留原模式按钮、字号、密度、排序、代理条数及操作语义，不新增双业务 Tab。
- 上一轮不合适的变化为状态提前、四条减三条、模式按钮变浅/变矮、字号变大、添加入口和底部权重重排。本预览撤去这些变化，已有未提交业务文件全部保留。
- 唯一必要变化在预览导航适配层：齿轮/管理全部打开独立 PC 标签页；管理规则、订阅、网络诊断直达对应栏目。原侧栏保持挂载、选择、表单与滚动状态。
- PC 复用现有 App/Settings 表单，独立宽屏页面为左导航、右内容；代理、网站规则、订阅与客户端、导入与备份、网络诊断、通用设置、可选官方网络七区可达。PC 几何样式只归 `preview/management.css`。

## 导航与草稿

侧栏 → 管理入口 → 独立 PC 标签页 → 七区切换 → 返回侧栏/关闭管理页。来自同一侧栏的管理页在本次预览会话内复用；这只是演示，不承诺正式 Host 的打开、去重或多窗口协议。

PC 返回、关闭和分区导航继续用原草稿 guard；有未保存内容时提供继续编辑/放弃草稿。浏览器关闭/刷新有未保存内容时使用原生离开提示。配置和选择保存不等于应用，跳转、返回、关闭均不隐式 APPLY/STOP。侧栏保持挂载，因此管理期间的侧栏草稿不丢失。

两个预览文档通过有界 postMessage 共享一次性内存 Mock；核对 iframe/WindowProxy 与会话 token，只允许既有 Mock 方法，不连接真实 Chrome、代理、网络或正式存储。直接打开 PC 链接是独立内存场景；从侧栏点击进入才共享该侧栏的模拟数据。关闭所有预览或刷新主文档会结束此内存会话，不宣称刷新恢复能力。

## 本轮完成条件与证据

| 目标 | 当前结果 |
| --- | --- |
| A 侧栏保持原业务排版 | 已用上述原始快照，四条代理、原按钮/字体/底部布局可见 |
| B 独立 PC 七区与返回 | ego-browser 真实打开另一标签页；七区、相关入口定位、返回及关闭已检查 |
| C 保存/导航不应用，保护草稿 | PC 修改→关闭提示→继续编辑→保存→返回侧栏回读已通过；同候选内存回执 APPLY=0、STOP=0、SAVE=1 |
| 侧栏草稿继续操作 | 本机预览中填写草稿→打开管理→返回，原字段仍在；选择直连不应用 |

11 月 7 日候选 HTML SHA-256（历史）：`26e1b8c1f8680fa6d9432de5622d8742920e780aa749e53e272f44bd1932cb28`。当前候选见文首。

[最终离线 HTML](preview/preview.html)、[Manifest](preview/preview.manifest.json)、[Context](preview/preview.context.json)。本机[侧栏入口](http://127.0.0.1:43263/projects/ai-proxy/preview/preview.html) / [PC 独立预览入口](http://127.0.0.1:43263/projects/ai-proxy/preview/preview.html?view=settings#/profiles)。优先从侧栏内点击管理演示完整链。

本机证据目录：`artifacts/ai-proxy/management-preview-20261107/`。`interactions.json` 绑定最终 HTML；`sidebar-final.png`、`pc-final.png` 是同候选截图。预览辅助区不属于业务 UI；生成 HTML 不手工修改。生成器编译当前预览输入，不构建 Browser、不写 dist/development、不晋升正式包。

## 停止点与延期

当前停止点为可供用户确认的预览。用户确认前，禁止进一步写 `src/`、`trusted/`、正式包或 Browser 框架；保留上一轮所有未提交业务改动，不自动回滚。

真实 Host 标签页接线、正式去重、多窗口/多文档一致性、刷新恢复、权限/撤权、真实代理、安装包晋升、安装、production、全 CI、完整矩阵均延期或 `NOT_TESTED`。UI 95+ 为本轮质量目标，评审只覆盖当前预览中的两个图标入口，不能替代整个产品或原生验收。旧方案见本机证据目录的 `superseded-DESIGN.md` 及旧计划，不自动续跑。
