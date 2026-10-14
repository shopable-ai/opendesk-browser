---
name: opendesk-trusted-sidebar-feature
description: Build or decouple audited first-party features embedded in OpenDesk Browser's trusted Side Panel or extension host (for example Stay Focus, Time Review, Cookie Editor). Keep business code outside generic tool infrastructure and never elevate user/AI-installed tool code.
---

# OpenDesk Browser · 第一方可信 Side Panel 功能与最小解耦

## 什么时候使用

用户要求创建、改造或解耦随 **OpenDesk 扩展静态编译发布**的第一方功能（如 Stay Focus、Time Review、Cookie Editor）时使用。特别针对「具体工具业务散落到通用 Sidebar 宿主、安装器、桥、CSS」的耦合核查与最小修复。

**不是安装版工具开发 Skill**：任何用户/AI/市场导入的 `opendesk.sidebar-tool.v1` HTML/CSS/JS，即使工具 ID 与官方相同，也必须走 [`opendesk-sidebar-tool-dev`](../opendesk-sidebar-tool-dev/SKILL.md) 的 opaque-origin iframe 及原 Host 协议。Controller/Page 脚本走 [`opendesk-script-authoring`](../opendesk-script-authoring/SKILL.md)，冻结/发布走 [`opendesk-program-publish`](../opendesk-program-publish/SKILL.md)。

本 Skill 是工程规则，不创建新的工具安装器、授权系统、后台服务、Worker、Browser SDK 或第二套 UI 运行时。

## 先以当前源码确立可信界限

先读 `AGENTS.md`、`docs/framework/testing-guide.md`、`docs/architecture/browser-framework/custom-tool-ui-and-local-development.zh-CN.md`、`docs/api/sidebar-tool-development.zh-CN.md`、`docs/architecture/ui-layout-conventions-r27.zh-CN.md`。再核查实际 `main` 与并行改动，不用旧 GOAL 的状态替代现实。

实际共享边界：`src/ui/tool.html`、`src/ui/tool-shell.js`、`src/ui/sidebar-tools.js`、`src/ui/sidebar-tools/{installation,lifecycle,package}.js`、`src/sidebar-tools/official-catalog.js`、`src/entrypoints/sidebar-tool-host.js`，以及各功能自己的 `src/<feature>/` 和 `examples/sidebar-tools/<id>/`。先画出 **代码来源 → 宿主调用 → 权限判定 → 后台生命周期 → 安装/撤权 → UI** 的真实依赖，再决定最小改动。不得仅凭文件名判断谁拥有业务。

### 唯一安全分流

| 代码来源 | 可以去哪里 | 强制原则 |
| --- | --- | --- |
| 扩展源码中静态导入、编译时确定、经审计的第一方组件 | **在满足严格准入后**挂载可信 Side Panel | 只能执行随当前扩展打包的固定代码，仍审查已安装版本/包摘要/来源、启停与撤权代际 |
| 动态工具包、AI 生成、用户改包、离线同 ID 导入 | 原 `sidebar-tools/sandbox.html` opaque-origin iframe | `OpenDeskTool.request` 经现有 Host 授权；绝不在特权页解释/注入包中 JS |
| 网页 UI、Page `USER_SCRIPT` 或 Controller Worker | 各自当前世界与 Authority | 不能从 Sidebar 显示工具就自动获得站点读取、Chrome API 或 Native 特权 |

扩展级 `chrome.*` 权限**不是每工具的权限**。`toolId`、`capabilities`、签名文字、Shadow DOM、ESM 闭包都不是可信代码来源证明；一旦把任意 JS 放到扩展特权页，简单 SDK 检查不能阻止其直接调用扩展 API。不得以优化 UI 为由打开这条通路。

## 最小职责划分（优先修已有文件）

| 层 | 正确职责 | 反例 |
| --- | --- | --- |
| `src/<feature>/policy.js`、`model.js` | 该功能私有数据合同、状态机、站点范围和校验 | 把 Stay Focus 域名分类规则放入通用工具包校验器 |
| `src/<feature>/service.js` 与按需的 `rule-ownership.js` | 后台持久工作、DNR/idle/状态、撤销和重启对账 | Side Panel 关闭导致服务停止；iframe 定时器代替后台 |
| `src/<feature>/host-controls.js` / 可信 UI adapter | 用户可见状态与真实 Chrome 权限点击、危险确认 | 不可信 iframe 的合成事件直接授权/删除 |
| `examples/sidebar-tools/<id>/src/` | 需要保留沙箱可安装包时的一份工具 UI 源 | 长期复制两个互相漂移的官方 UI 实现 |
| `src/ui/sidebar-tools*.js` 和 `src/ui/sidebar-tools/` | 通用安装、展示、挂载、生命周期、审查和消息分发 | 新业务判断大段复制进通用 Host，或因一个工具改动破坏其他工具 |
| `src/ui/design-tokens.css` / `design-system.css` | 共享可信 Side Panel token 和语义组件 | 每个功能重新定义全局 reset、动态 Tailwind、跨 iframe 注入 CSS |

**最小解耦顺序**：定位具体耦合及调用方 → 测试复现 → 把纯业务策略/数据放回 `src/<feature>/` → 通用 Host 只留已证明必要的通用接线/受限适配 → 原入口与安装/撤权身份不变 → 做受影响回归。不存在代码缺陷时不为了“分层好看”重构所有工具；禁止增加一个通用巨型 Registry 代替旧巨型文件。

## 两个必须区分的具体案例

**Stay Focus**：先核查 `src/stay-focus/{policy,model,service,catalog,rule-host,rule-ownership,page-notice,host-controls}.js` 和 `examples/sidebar-tools/stay-focus/`。DNR 拦截规则归属、每日额度、站点识别、10/5/1 分钟页面提醒、撤权与后台状态应有专用职责。工具 UI 只展示/发起受限操作，不缓存规则真相、不复制第二套调度器；变更通用安装器的卸载清理必须有跨工具负向回归。

**Time Review**：`src/time-review/trusted-native-ui.js` 静态引用 `examples/sidebar-tools/time-review/src/` 的可维护 UI 源，并由 `trusted-admission.js` 核实来源与安装身份；不是从已安装 JSON 读取任意 JS 在可信页执行。不得假定 R1.6 历史通过即意味着当前所有 Chrome 生命周期或其他官方工具也支持可信直挂。服务仍由后台独立完成，撤权、包版本改变和卸载都应销毁相关 UI 会话但不伪造历史数据。

对 Cookie Editor、订阅管理、计划、其他工具按同样边界核查，但**不得把所有模块强行迁为可信直挂**。单个试点的结果不能推导其余工具均已迁移。

## UI、测试及交付

Side Panel 优先复用 `od-page/od-stack/od-surface/od-button/od-field`，真实 token 在 `src/ui/design-tokens.css`；密度遵守 4/8/12/16px、单层 gutter、窄屏及 200% 缩放。动态 iframe 的 CSS 独立映射尺寸，不能向特权 Host 借 JS/CSS 作为安全边界。中文长文案、暗色、键盘/焦点、停止与卸载后的 DOM/事件清理都要验收。

变更了 Stay Focus 时定向覆盖：

```sh
node --test tests/environment/stay-focus-r1.test.mjs tests/environment/stay-focus-service-r1.test.mjs tests/environment/sidebar-tools-host.test.mjs
```

变更 Time Review 可信直挂时定向覆盖：

```sh
node --test tests/environment/time-review-r16-trusted-native.test.mjs tests/environment/time-review-r15-site-grants.test.mjs tests/environment/sidebar-tools.test.mjs
```

涉及通用 Host/安装器还要覆盖不同工具的安装、更新/卸载、启停、改包与假 ID、跨来源撤权、后台/Sidebar 重启；按影响执行 `npm run check`、实际构建/包校验及 `tests/framework/stay-focus-r1-native.test.mjs` / `time-review-r13-native.test.mjs` 等真实 Chrome 驱动。先核对测试指南、现有证据与资源归属，不争抢 Profile；测试文件存在或 Node mock PASS 不等于新候选 Chrome PASS。

交付时说明：哪些具体耦合被修复、共享 Host 增减了什么、第一方静态代码和动态工具如何区别、原安装/权限/存储合同是否保持、哪项负向测试在真实 Chrome 通过。质量目标 `≥95/100`：安全来源/权限 25、正确业务边界 20、架构复用 15、功能/生命周期 15、跨工具负向回归 15、UI 可访问性 5、文档与证据 5。未做同候选实测一律标 `NOT_TESTED`，不凭文档自报 95+。
