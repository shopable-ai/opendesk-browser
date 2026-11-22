# 连播助手 · 离线交互预览验收


> **R11 时间清空／End 开发候选（2026-11-22）**：当前 [index.html](index.html) 已增加四个时间输入的 `×` 清空操作，并直接显示片尾 `End` 绑定当前视频结尾的时间。默认锚点不显示无意义清空按钮。片头结束、片尾开始清除后转为「待设置」，片头开始清空恢复 00:00，片尾结束清空恢复 End；编辑不自动播放或保存。回归详见 [R11 需求与验收矩阵](../REQUIREMENTS.zh-CN.md#9-r11--时间端点清空与动态-end2026-11-220210-开发候选)。旧版候选 97–99 的历史评分**不能复用给 R11 新候选**；此变更仍需在 320/360/400px、键盘、触控和真实浏览器中获得同版本截图与操作证据，并由独立 UI/UX 和实现评审核实六维均严格高于95分，否则评分为 `NOT_SCORED`。


目标：在官方浅色 Side Panel 外壳里，把首次设置、调整片头片尾和保存本集例外做成能直接操作的窄侧栏。预览是设计稿；规则存在本页内存。项目归属为 `video-auto-skip`，当前无可安装工具。正式侧栏及 Page companion、播放器与真实网站测试均不在本轮范围。

复用 [预览 Skill](../../../.agents/skills/opendesk-ui-preview/SKILL.md)、[扩展开发 Skill](../../../.agents/skills/opendesk-sidebar-tool-dev/SKILL.md)及其 [公共组件配方](../../../docs/api/sidebar-preview-kit.zh-CN.md)。保留原模拟模型和播放 Demo 的归属。优先原生输入、滑块、复选控件与公共 HTML 原语；仅当核心交互有已证实且无法用现有原语解决的缺口时，才考虑共享 React UI。

| 条件 | 当前候选必须证明 |
| --- | --- |
| K01 · 来源与外壳 | 现有 Preview Kit 生成并通过其检查，记录 HTML、来源与宿主 SHA；五个正式标签、单一返回、标题、模拟卸载在官方位置。取消及 Escape 恢复焦点；确认仅清理本页模拟数据。主题切换只影响应用。 |
| K02 · 视觉与适配 | 320、360、400 CSS px 均看完整外壳；无横向滚动、遮挡、文字截断或重复工具标题。首屏辨明作品/集、三项规则和保存范围；每次只展开一个编辑器，主操作唯一，保存反馈就近可见。保存同候选截图。 |
| K03 · 时间编辑（硬门槛） | 在片头及片尾的「指定开始和结束」中，两枚具名手柄在同一时间轨道上同时可见，选中区间由两端共同界定。320、360、400 CSS px 留同候选截图，另在精确 320 px 外壳实测：分别从两枚手柄真实按住拖动，另一端保持不变；尝试交叉时停在一秒间隔，两柄仍可分别抓取。Tab 依序聚焦两柄，方向键与分:秒输入共同更新同一草稿、端点和值域内的填充；数字输入可越过局部窗口。常用片头只可调结束，常用片尾只可调开始。编辑本身不触发播放、跳过或切集。 |
| K04 · 保存与继承 | 首次无规则、三项不默认开启；保存作品默认后取消随后改动仍保留原值；本集显式关闭片头时仍继承片尾和下一集；可恢复作品设置。脏草稿切范围/返回先保护，拒绝放弃不丢数据，确认后不把草稿带到新上下文。 |
| K05 · 片尾与边界 | 45:00 保存最后 90 秒，换到 48:00 时显示 46:30–48:00；指定片尾 42:00–43:30 明确保留后续；错误格式、交叉、越界、可能跳过全片和未知时长有具体提示，不能提交危险草稿。恢复已知时长后按原配置重算。 |
| K06 · 状态、焦点、隔离 | 字段错误与输入关联，显示在时间字段旁；虚线柄的视觉提示和无障碍值分别说明空值未填与无效值不能采用，建议位置不覆盖输入。取消、状态恢复及键盘路径可观察；成功回执靠近操作，失败原因持久可见。预览辅助只在工具外，CSP 保持原样，预览不访问真实网络、SDK、Chrome、站点或持久化。 |
| K07 · 独立评审 | 对同一 HTML SHA、三档截图与操作记录，由独立 UI/UX 评审和实现/规范评审分别给出六维分数与依据。 |

六维采用 [Preview Kit 评审表](../../../docs/api/sidebar-preview-kit.zh-CN.md)：来源与复用、信息与视觉层级、交互与可访问性、兼容与边界、预览交付、可维护性与验证。两位评审的每个维度都须严格 **>95/100** 且无阻断项，K01–K06 均有同候选证据，才能称离线预览达标。证据不齐记 `NOT_TESTED` 或 `NOT_SCORED`；旧评分、自评、平均值和测试计数不能替代本轮结果。

## 候选与证据

用 `node projects/video-auto-skip/preview/build.mjs <新候选目录>` 生成同目录的 `index.html`、`components.html` 和 `manifest.json`。可直接打开候选 HTML；复验时只用绑定 `127.0.0.1` 的静态服务。给 `verify-ego.js` 前置 `const previewRun = {space, page, path, base, verificationSource};`：指定任务专属 Ego TaskSpace、标签、候选绝对路径、带尾斜线的本地 URL、回放脚本绝对路径，然后交给 `ego-browser nodejs`。脚本记录候选的 HTTP、浏览器资源与磁盘字节、浏览器版本、回放脚本和逐图 SHA。每轮用全新证据目录。

320、360、400 px 视口的主证据使用未改动的官方外壳，分别记录实际外框与视口宽度；额外测量精确外框 320、360 px，以及单独标识的 400 px 外框夹具。320×480 从已聚焦的时间滑块开始，用 Tab 抵达「收起时间编辑」，再用 Enter 收起及保存，回执仍在视口内。保存区不固定于视口。模拟设置不替代独立播放 Demo。

保存回归另覆盖：整季规则按每集实际生效的配置校验；已有本集例外时，换集不改变同一整季草稿能否保存；独立的自动下一集仍能保存；恢复继承若会使本集越界，须拦截并保留已存例外。没有已知继承集时，关闭规则不能夹带未验证的时间；即使继承集时长未知，也须拒绝可以确定重叠的两段固定时间。

## 当前入口：仓库精简版

[离线入口](index.html)基于 `main` 的原版（`13936b528`），去掉了侧栏下方的模拟播放器和演示场景，保留原双滑块。SHA-256 为 `68e0331039e537f8eddcf0b09bd90e04814cab62d39b816a5d106ca59c7f0263`。用 ego(lite) 从原 `file://` 路径确认底部区域不存在；分别拖动片头双滑块，保存 `00:54–03:45` 后侧栏显示回执，再用方向键调整并取消，确认回到已保存区间。以下候选和评分仅作历史记录。

## 历史候选：draft-4

先前部署的 [draft-4 入口](../../../artifacts/sidebar-preview-kit/video-auto-skip-20261122-dual-track/draft-4/index.html) SHA-256 为 `720c649120814b31f5cdb6dc67cb79678fbbd2b75163c85828c3dc1fe6154ec6`；[组件参考页](components.html) SHA-256 为 `655fe2cdd28bb9ab11dfd5fc57867807422edaa968e7959129b21b05a242848c`。见当时的[更新记录](../../../artifacts/sidebar-preview-kit/video-auto-skip-20261122-dual-track/draft-4/promotion.json)和[原路径复验](../../../artifacts/sidebar-preview-kit/video-auto-skip-20261122-dual-track/draft-4/original-file-entry.json)：在 320 px 外壳分别拖动两柄、保存 `01:10–02:00` 并看到回执；组件页往返正常，刷新清除模拟设置。

同候选保留[来源清单](../../../artifacts/sidebar-preview-kit/video-auto-skip-20261122-dual-track/draft-4/manifest.json)、[K01–K06 实操记录与截图指纹](../../../artifacts/sidebar-preview-kit/video-auto-skip-20261122-dual-track/draft-4/interactions.json)及[两份独立评审](../../../artifacts/sidebar-preview-kit/video-auto-skip-20261122-dual-track/draft-4/reviews.json)。双柄截图：[320 px 外壳](../../../artifacts/sidebar-preview-kit/video-auto-skip-20261122-dual-track/draft-4/dual-track-host-exact-320.png)、[360 px 外壳](../../../artifacts/sidebar-preview-kit/video-auto-skip-20261122-dual-track/draft-4/dual-track-host-exact-360.png)、[400 px 视口](../../../artifacts/sidebar-preview-kit/video-auto-skip-20261122-dual-track/draft-4/dual-track-400.png)。

| 维度 | UI/UX | 实现／规范 |
| --- | ---: | ---: |
| 来源与复用 | 98 | 99 |
| 信息与视觉层级 | 97 | 97 |
| 交互与可访问性 | 97 | 97 |
| 兼容与边界 | 98 | 98 |
| 预览交付 | 99 | 99 |
| 可维护性与验证 | 98 | 97 |

两位评审六项均严格高于 95，无阻断项。物理触屏、屏幕阅读器实际朗读、其他浏览器未测；真实站点、播放器、安装和发布不在本轮范围。[第八轮评审](../../../artifacts/sidebar-preview-kit/video-auto-skip-20261122/round-8/reviews.json)仅作为历史保留。
