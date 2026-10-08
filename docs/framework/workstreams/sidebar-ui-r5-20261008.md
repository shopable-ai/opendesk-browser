# Sidebar UI R5 · 个人工作台降噪实施账本

日期：2026-10-08
分支：`agent/sidebar-ui-r5-20261008`
PR：`https://github.com/shopable-ai/opendesk-browser/pull/9`
基准：`main@66f11874fa27f6de438155124a3f772129386f8b`（实施启动时核验）
共享资源：未占用用户 Mac/CFT profile 或现有 dist/ZIP，未修改旧 `public-owner.json`。

## 已完成的正式变更

- `src/ui/tool.html`：删除常驻顶栏目录、重复标题/说明/计数和空闲发现底栏；保留现有重要 DOM ID；“导入”成为发现行内次级入口；历史/结果条件显示；开发编辑器优先。
- `src/ui/task-workbench.js`：默认紧凑列表，其他站点/停用才展示差异状态，按真实运行历史显示结果；原 `RunHost` 的 Stop owner 与版本/网站检查未改。
- `src/ui/script-editor.js`：只有当前面板确实启动的草稿持久结果到达时才自动展开结果；冷启动历史仍折叠。
- `src/ui/tool-shell.css`：整理旧重复选择器，保留完整目录的独立表格/读者区域。未运行时不占用 Stop 按钮空间。
- `examples/ui/sidebar-r5-compact-preview.html`：单文件演示，源于仓库实际 R3/R4，交互运行/失败/停止/安装均为模拟。
- `docs/product/sidebar-ui-spec.zh-CN.md`：R5 原地替代 R4 权威 SPEC，保留 R3/R4 历史证据。
- `tests/environment/*`：更新旧 R4 静态合同并添加结果条件展示、无空闲底栏、自动展开草稿结果、R5 HTML 语法检查。

## 可核验的功能与证据

| 项目 | 结果 | 证据等级 |
| --- | --- | --- |
| 现有浏览器侧栏 Node 定向测试 | 第一次 34/38 通过，4 项 R4 旧断言已按新行为修复；第二次 38/38 通过 | COMPONENT_TESTED |
| 源码/生产/开发构建与双包校验 | Actions `37774223217` SUCCESS | BUILD_VERIFIED |
| 最新额外结果/预览断言 | Actions `37775004200` SUCCESS；39/39 定向测试通过（0 失败） | COMPONENT_TESTED |
| R3/R4/R5 HTML 语义 | 原型属于 UI_SIMULATION；不能当真实扩展证据 | PROTOTYPE |
| R4/R5 HTML 的 Chrome 等宽截图 | Actions `37775599740` SUCCESS：R4/R5 360×700 搜索位置、底栏与布局已截图；R5 同时检测 300/420/520px，无横向溢出 | STATIC_PREVIEW_CHROME |
| 300/360/420/520px 原生侧栏、缩放、键盘和真实权限/Stop | 尚未取得真实截图、浏览器回执；不得按 PASS 处理 | NATIVE_NOT_TESTED |
| PR #7 一次性授权兼容 | 与 R5 共享 `src/ui/tool.html` 和 `src/ui/tool-shell.css`；未来必须做差异整合 | INTEGRATION_PENDING |
| main 合入 | 等待可核验原生验收、并行冲突处置，不擅自绕过保护 | NOT_MERGED |

CI 记录：
- UI 定向测试：`https://github.com/shopable-ai/opendesk-browser/actions/runs/37774223221`（38/38）
- R3 source/production/dev package：`https://github.com/shopable-ai/opendesk-browser/actions/runs/37774223217`（success）
- R5 追加源码/预览回归后 UI 测试：`https://github.com/shopable-ai/opendesk-browser/actions/runs/37775004200`（39/39）
- R5 最新生产/开发构建：`https://github.com/shopable-ai/opendesk-browser/actions/runs/37775004197`（success）

## R4 与 R5 名义布局高度（来源：CSS 规则，**非截图测量**）

| 区域 | R4 行为 | R5 行为 |
| --- | --- | --- |
| 品牌栏 | 31px 品牌标志加 11px 上下 padding，附持续目录按钮/小标题 | 47px 栏、27px 标志，仅品牌 |
| 导航栏 | 三级标签各带 11px 垂直 padding | 40px 栏，一次展示三级标签 |
| 发现搜索前 | 介绍性标题、长说明、内容区 15px padding | 内容区约 10px padding 后紧接搜索 |
| 任务列表 | 较大圆角卡、内显示目的/网站范围/启用状态 | 紧凑 62px 最低条高，仅名称+用途+异常状态 |
| 发现底部 | 独立固定说明和两个导航按钮 | 空闲时不显示；运行期间仅所有者 Stop |
| 编辑器 | 多级状态说明、先表单再内容；深/浅背景覆盖 | 当前网页摘要后直接代码；初始 260px，结果按需 |

以上是设计名义尺寸，不代表浏览器实际排版。现在已经有**静态 HTML 原型的真实 Chrome 360×700 截图证据**，但这不等于正式扩展的 Side Panel：

| Chrome 浏览器原型实测 | R4 360×700 | R5 360×700 |
| --- | ---: | ---: |
| 品牌栏高度 | 58px | 47px |
| 导航栏高度 | 45px | 41px |
| 搜索框起始 Y 坐标 | 202px | 98px |
| 空闲发现底栏高度 | 88px | 0px |
| 当前筛选演示任务 / 可见项 | 1 / 1 | 4 / 4 |
| 是否发生横向溢出 | 否 | 否 |

注意：R4 和 R5 的原型**使用不同数量的本机演示数据**（R4 当前页 1 项；R5 当前页 4 项），故不可据此断言正式扩展安装的数据也相同。R5 的 300、360、420、520×700 均无横向溢出，4 个模拟匹配项均可在内容区看到。

静态截图证据（GitHub Actions 产物含 R4/R5 PNG 和 `metrics.json`）：
- 工作流：`https://github.com/shopable-ai/opendesk-browser/actions/runs/37775599740`
- 产物名：`sidebar-r5-static-html-visual-evidence`（Artifact ID `11549742654`）
- **证据等级：STATIC_PREVIEW_CHROME；原生扩展仍为 NATIVE_NOT_TESTED。**

必须在真实 Side Panel 重做同样分辨率和交互验收，不能把静态截图充当原生截图。

## 关闭条件

1. 最新 PR head UI/构建 CI 通过；
2. 真正的 Chrome Side Panel 300/360/420/520px 和 360×700、125%/200% 视觉/焦点验收，R4/R5 360px 等宽截图；目标 ≥4 行、无横向溢出；
3. 用户真实可信点击 Run/Stop、已安装/停用/跨页 Stop、草稿直接运行、持久结果、导入/安装无回归；
4. 与 PR #7 及最新 main 共享 UI 文件冲突逐条解决；
5. 授权集成者安全合并 PR，删除短期工作分支。未经这些条件，不虚报每维 95 分或 FINAL_ACCEPTED。

归档按当前 R5 主题维持单独 PR 和本文件；与其他 Agent 的成果不可互相冒领。
