# 操作反馈可见性：本轮目标与核查

日期：2026-11-10。阶段：核心修复及定向验证。交互规则仍以[唯一确认与反馈合同](../architecture/browser-framework/confirmation-and-feedback.zh-CN.md)为准，本文记录本轮任务、发现与证据，不新增规范权威。

## 目标与优先级

1. P0：拖动/选择扩展安装包并完成审阅后，在真实成功回执后显示当前视口内的非阻断 Toast；不再只在扩展页底部插入普通成功消息。正常安装后直接可用，不追加启用步骤。
2. P1：检查五 Tab、设置与代表扩展的反馈入口，修复证实的同类误用；区分瞬时消息与需要持久保留的错误、任务状态、未知结果及权限审阅。
3. P2：复用原通知 Store、唯一 React Root 与 Host/Bridge，补齐宿主公共展示和真实消费者接入，不新建通知系统或权限链。
4. P3：更新唯一合同及相关开发指导，增加能够证明用户行为的定向回归，记录审计范围与剩余 owner。

## 关键条件

- 短成功消息不抢焦点、不重排正文，不依赖滚动到页面底部；不要求用户点击“确定”。
- 展示复用原通知的有限堆叠、去重、手动关闭、超时及悬停/键盘暂停；长文本可换行。
- 成功只能来自业务真实回执及原本要求的读回；取消、失败、部分成功和结果未知不能报成功，也不能自动重放写入。
- 字段错误、草稿、长期进度、未知结果及恢复入口持久保留；Toast 不能成为唯一错误记录。`role=alert/status` 本身不构成缺陷。
- 普通消息、必要确认、敏感审阅分别选择合适交互；真实安装审阅与 Chrome 权限手势不因通知改动而改变。
- 工具消息仍绑定原来源/实例/安装代际和限频；退役、离开和迟到回包不能污染新实例。
- 只改本轮 owner 文件；保护现有 main、并行工具源码/JSON、服务与 `dist/development`。不新建分支/worktree，不默认进入 production、全 CI 或评分。

## 已修复入口及公共归属

根因有两层：`src/ui/sidebar-tools.js` 的安装成功只经 `notice` 写入正文末尾 `sidebar-tool-status`；原 Toast 又挂在扩展 Tab 的 ToolHost 内，其他 Tab 的控制器不能可靠地复用可见展示。

- 扩展控制器：应用安装/更新、Page 安装/更新、联合安装、卸载/清理和停用/恢复成功改用短 Toast。普通安装显示“已安装「名称」／可直接打开使用”；原停用安装仍如实说明停用。安装审阅、身份、权限与必要读回保持原路径。新错误附短 Toast，原持久错误仍保留，关闭通知或其他操作成功均不清除它。
- 任务控制器：`src/ui/task-workbench.js` 的安装、启停和卸载真实回执通过 `tool-shell.js` 注入的 notify 接入同一 Store；无 adapter 的旧消费者保留原状态回退。安装目录的下一步说明仍持久保留。销毁后的迟到回执不再通知。
- 共享视口：从原 ToolHost 提取 `src/ui/react/components/notifications.tsx`，工作台由 `app-shell.tsx` 挂一处，独立 app 页面由 ToolHost 挂同一组件。原 Root、Store、Bridge、工具来源/实例及生命周期约束不变；没有新依赖。可信工作台回执默认固定在视口 `bottom-center`，不撑正文、不遮顶部导航；工具公开默认及显式位置不变。
- 审查补充：模态审阅按原 CSS 暂时隐藏通知时，暂停计时并在关闭后续计。既有消息保留剩余时间，遮挡期间到达的回执获得完整可见时间。

## 同类核查与剩余范围

本轮有界读取五 Tab 的相关控制器/React 页面，以及设置、Quick Notes、AI Proxy、Vue 示例和 notify 示例；检查短成功、`role=alert/status` 与同步原生弹框。下表是源码事实与迁移判断，不能解读为每个扩展都已运行验收。

| 入口 / owner | 分类及本轮处理 | 下一步或保留理由 |
| --- | --- | --- |
| `src/ui/sidebar-tools.js` / 扩展中心 | 已证实正文底部成功回执；已迁移 | 原错误/未知与恢复记录保留；真实扩展安装待验证 |
| `src/ui/task-workbench.js` / 我的与任务目录 | 已证实短成功只写状态；已接共享通知 | 目录下一步说明保留；不改变 Run/计划触发 |
| `src/ui/react/tabs/locale-manager.tsx` / 语言设置 | 保存、导入和重新核对成功仍用末尾 notice；后续迁移候选 | 需按语言切换/导入实际入口确认可见性并定向迁移；busy、冲突、读失败和 unknown 保留 |
| `projects/quick-notes/src/main.js`、`src/index.html` / Quick Notes | success/error 共用底部 `note-status`；后续迁移候选 | 业务 owner 拆分成功 notify 与冲突/容量/草稿/unknown 持久状态，按原包流程交付 |
| `projects/ai-proxy/src/Settings.tsx` / AI Proxy 设置 | 复制链接、导入备份成功的行内提示可改善；未证实不可见 | 保留地址校验、控制状态、已保存未应用和订阅报告；不覆盖并行 source-lock |
| `src/ui/script-editor.js` / 开发 | 复制结果文字紧邻按钮；未证实缺陷 | 保留无法自动复制后的手动复制入口 |
| `src/ui/cloud-hosting.js`、`react/tabs/cloud-settings.tsx` / 云控 | 凭据复制成功行内提示可改善；未证实不可见 | 一次性密钥披露/安全说明继续持久保留 |
| `examples/sidebar-tools/vue-starter/src/App.vue` / Vue 示例 | 保存结果共用 status；后续示例改进候选 | 不强制原 Vue/HTML 工具迁移 React；失败原因仍须可读 |
| Workflow 配置恢复、CSV 导出等 | 应保留的业务状态 | 配置缺失必须有恢复入口；下载请求被 Chrome 接受不等于文件已保存 |

生产源码的有界字面量搜索未发现明显 `window/globalThis.alert/confirm/prompt` 调用；这不是别名、计算属性或所有第三方工具的穷尽证明。不会根据容器叫 alert/status 就删除状态，也不批量修改并行开发的 Web Flow、Reading TOC 或其他正式包。

## 验证与完成边界

开发完成条件：当前扩展安装及任务管理消费者完成修复；公共展示只有一处；真实回执、取消/失败/unknown、模态暂停、来源/实例与销毁等定向验证通过；审计和规范落盘。其他独立工具的逐项迁移、真实 Side Panel 安装和 production 验收列为后续范围，不据此宣称仓库所有反馈已经治理完毕。

- **Host 行为**：27 项定向检查通过，覆盖安装/卸载/启停、联合安装读回及未知/失败、通知关闭后持久错误保留、通知 source/instance/安装身份与句柄额度。
- **Store**：7 项原通知检查通过，覆盖限量、分组、优先级、owner 清理与生命周期。
- **React 与任务**：真实 TSX 依赖图编译并挂载，5 项定向检查通过，覆盖五 Tab 唯一视口、原倒计时/焦点/关闭、订阅及模态暂停；任务管理 20 项定向检查通过，含真实回执前不成功、失败未知、旧 adapter 回退与销毁后不通知。独立只读代码审查提出的模态计时 P2 已修复并复核，无剩余已证实 P0–P2。
- **基线缺口**：完整 view 文件原有 SSR 断言仍要求旧 `sidebar-tool-action-review` 行内 DOM，但当前 HEAD 已用 Confirmation Portal；用 HEAD 源码和 HEAD 测试独立复查同样失败。task-workbench 全文件另有两项原有 idle Run dock 断言失败，HEAD 同样失败。本轮不为旧断言修改产品，不声称完整文件/全 CI 全绿。
- **ego 源码夹具视觉**：用实际 AppShell、Host、安装解析/审阅流程及内存 API/存储，在独立本地夹具点击确认安装。320/360 × 720 下 Toast 在当前视口、正文外，顶部导航可见；关闭通知有效，“我的”Tab 仍只有一个通知视口。截图位于本机 `artifacts/feedback-visibility/install-toast-final-{320,360}.png` 与 `my-tab-toast-320.png`。它证明实际源码组件的视觉行为，不是真实扩展安装或 Chrome 权限证据。首次顶部位置遮导航后已改底部，视觉迭代记录在 `.omx/state/feedback-visibility/ralph-progress.json`。
- **运行环境**：初始未检测到本仓库 dev watcher；日常目标仍是 `dist/development`，未构建覆盖或重载并行环境。ego 已有 OpenDesk 扩展，但全页 `sidepanel.html` 展示任务目录，不能冒充原生 Side Panel。TaskSpace 63 已释放，本轮临时夹具服务已停止。当前真实已加载路径/连接/新源码生效、原生拖动安装、production 和正式视觉验收均为 `NOT_TESTED`。

规范只在原[确认与反馈合同](../architecture/browser-framework/confirmation-and-feedback.zh-CN.md)、[公开 notify API](../api/sidebar-tools.zh-CN.md)、根 AGENTS 和 extension-ui Skill 补充；本文仅记录执行范围与证据。
