# OpenDesk Browser · 更新提醒统一合同 R1（设计方案）

状态：**方案与交互预览已提交；正式 Framework/SDK、后台事件、真实站点消息尚未实施。**  
日期：2026-11-09  
示范消费者：`projects/prompt-shortcuts/`（Prompt Shortcuts）  
可点击演示：`projects/prompt-shortcuts/preview/index.html`，增强脚本 `preview/update-notification-demo.js`。  
权威现有合同：`AGENTS.md`、`docs/api/official-tools-catalog.zh-CN.md`、`docs/architecture/extension-project-layout.zh-CN.md`、`.agents/skills/opendesk-extension-runtime/SKILL.md`、`.agents/skills/opendesk-extension-ui/SKILL.md`。本文件不取代这些合同。

## 1. 用户目标与边界

- 用户操作：浏览器/已安装工具出现新版本后，用户能在真实应用内看见轻量消息、阅读真正可信的更新说明；需要人工审阅的包能沿原入口审阅并更新，不跳转到一个无关营销页。
- **三种不同对象**：Chrome 扩展本体（Chrome 管理更新）、OpenDesk Sidebar Tool（工具包经过现有审阅安装器）、独立 Page Program / Controller Task（各自安装授权合同）；三者不得混用安装状态或更新按钮。
- **二类事件**：`available`（可信版本候选，尚未安装）与 `applied`（通过安装事件/回执证明已更新）。另有 `pending_browser_apply`、`review_required`、`attention`、`unknown` 等状态。
- **双重拆分**：检测/核验/安装是“可信运行时”职责，通知展示、偏好、已读/稍后是“UI/用户体验”职责；消息点击不能直接改变安装授权。
- 本轮预览中的 v1.1.21、v1.2.0、Browser v1.9.4 等均为模拟数据，**不是已发现真实发行版本**。

## 2. 用户交互（推荐默认值）

### 2.1 默认三个入口

1. **站点 Toast**：仅在已授权、已支持且允许页面消息的目标网站显示一次不打断工作的非模态轻提示。建议靠近可视边缘，不遮挡原网站输入框、提交按钮、付款和安全提示；关闭即消失。文案为“提示词快捷按钮有新版本 · 查看更新 / 稍后”，**不说“已更新”**，除非确实收到 applied 证据。
2. **OpenDesk Side Panel 更新条**：仅有未读/待处理事件时，在可信宿主公共 UI 底部提供单行小条，形如 `NEW 提示词快捷按钮有更新    查看`；不固定向每个 Tool 的沙箱 UI 注入同款私有控件。不增加一级 Tab，不覆盖既有新建、导入、AI/更多操作或设置。
3. **详情 / 历史**：侧栏内打开唯一详情视图，包含名字、旧版→新版、发布日期（若可信源提供）、具体变化、权限差异、安装所需确认、来源与失败原因。保留回退/关闭焦点；所有历史记录在同一“扩展”管理入口，而非单个工具各造一套中心。

### 2.2 用户偏好

- 默认：`toast+inbox`（网页一次轻提醒 + 侧栏入口）。
- 可选：`inbox-only`（只在扩展界面提示）或 `silent`（仅更新记录中可查）。
- 站点提醒范围默认已安装、可使用、具备网站权限和真实支持的域；允许“仅侧栏”统一关闭。可按工具覆盖，但首先验证第二真实消费者，再考虑暴露公共 SDK。
- `稍后提醒`：本次 Toast 消失，更新条仍保留；将来在安全时机可再提醒，但不反复每标签弹出。
- `忽略此版本`：仅对某具体工具候选版本关闭提醒/自动提示，仍可在更新记录手动查看，并不安装也不撤销旧版；下一更高版本恢复提醒。
- Chrome 本体不提供“跳过 Chrome 自动安装”假按钮；只能忽略/延迟**消息通知**。MV3 扩展更新通常由浏览器管理，不能让用户以为网页按钮掌控更新下载。
- 不以关闭消息当作“已读安装确认”；不以已读/忽略状态修改任意工具的 enabled 状态。

### 2.3 多应用同时更新

只允许同一 Profile 的一个轻通知入口；同一时间有多项更新时显示“3 项扩展有更新”，详情里按 Browser / Sidebar Tool / Page Program 独立列出；每项单独核验及审阅，不提供绕过权限确认的批量安装。

## 3. 事件来源、证据与状态判定

| 对象 | 可信事件 / 数据 | 可宣称状态 | 禁止推断 |
| --- | --- | --- | --- |
| Chrome 扩展本体 | `chrome.runtime.onInstalled` 的 `reason=update` 与 `previousVersion`、当前 manifest；`onUpdateAvailable` 作为待应用信号 | 已更新 / 待应用 | 不根据网页版本号或下载消息声称完成；不为提醒强制 `runtime.reload` |
| Sidebar Tool 官方发行 | 固定可信发行清单、安装记录、版本比较与包完整性核验 | 有待审阅新版 / 安装审阅中 / 已完成 | 不能仅以官方 Catalog 里存在新版本就说已装；不能用版本号免除 hash、来源、能力审阅 |
| 本地或第三方 Tool | 与其原受信任安装来源合同匹配的版本候选；否则“来源未知” | 可审阅候选 / 无可靠候选 | 不可信 GitHub、网页 DOM、iframe 自称最新版可驱动安装 |
| Page Program / Controller Task | 原有各类身份、来源、冻结包与授权状态 | 仅依据其原安装合同显示 | 不自动把 Sidebar Tool 更新语义推广到任务或脚本 |
| 恢复或回执未知 | 安装/写入/读回对账证据 | 待核对 / 未知 | 不假装成功，不换 ID 重放，不把消息关闭触发重试 |

**绝不引入“必须匹配最新官方 Catalog 版本才能继续运行”的门禁。** 已审阅旧版、合法本地包、缺失官方目录时仍应依原合同正常运行。可用性与“是否有推荐更新”是两个不同判断。

推荐内部只读通知事件（字段示意，**尚非已实现公开 API**）：

```json
{
  "schema": "opendesk.updateNotice.v1",
  "entity": { "kind": "sidebar-tool", "id": "prompt-shortcuts" },
  "event": "available",
  "fromVersion": "1.1.20",
  "toVersion": "1.1.21",
  "candidateFingerprint": "trusted-release-fingerprint",
  "requiresReview": true,
  "changes": ["示例：改善输入框适配"],
  "capabilityDelta": [],
  "source": "verified-official-catalog"
}
```

通知去重键使用 Profile + 实体类型 + 稳定 ID + 候选版本 + 源/包指纹 + 事件阶段；同 ID 不同来源不合并为已批准升级。生命周期状态变更 `available → applied` 时覆盖旧消息，不同时显示“待安装”和“已安装”。

## 4. 技术职责与最小复用

**不要先造第二套 Installer、Store、Registry、Background SW、外部更新服务或 iframe 特权桥。**

- `UpdateNoticeCoordinator`（**拟议内部服务**）：从已经可信的安装/发行/Chrome 更新事件汇总只读状态；用原 Storage/生命周期持久化事件去重与通知偏好；MV3 Worker 休眠/重启后能重读状态，不依赖内存定时器或页面常驻。
- `UpdateNoticeSlot`（**拟议可信宿主 UI**）：在现有 React/Side Panel 根树消费只读通知信息，渲染统一 NEW 条、聚合视图与详情。尽量复用既有 design tokens、按钮、布局与导航，不让 Tool iframe 自己实现可信安装入口。
- `PageUpdateToast`（**拟议已授权网页增强层**）：仅与可信宿主通信并读一个低敏的“消息展示许可/摘要”，使用 Shadow DOM/隔离 CSS，限制在已支持/授权网站；不注入用户选择器数据、私密提示词、授权凭证或未审核的远端 HTML。绝不作为 Chrome 其它网站跨域通知的全局脚本。
- `ReviewUpdate`：在可信用户点击后跳转/调用**已有的** `src/ui/sidebar-tools/installation.js` 审阅、版本、包完整性、权限、旧数据/未知状态处理流程。任何新版申请的新增能力、来源替换、需要的原生权限都维持显式审批。
- 不得因为弹窗影响正在运行的 Controller / User Script / Web Flow / Native 请求；Chrome 本体更新由原安全重载围栏决定，提示只读展示，不要求强制刷新会话。

只有在**至少两个真实消费者**验证同一具体需求、现有宿主 props/slots 不够时，才考虑导出可选公共 SDK。开发版的源码热加载不是用户正式发行更新，不应弹“发布了新版本”。

## 5. 打扰控制、可访问性与隐私

- 只在网页可见、页面就绪、用户不处于 IME 组合、重要输入、全屏或高风险操作时显示；可退化为侧栏静态 NEW。对密码、支付、银行、授权弹窗和 Chrome 受限页不插入通知。
- 同一版本首次有效时机最多一个 Toast；跨标签去重，用户关闭/已读/忽略结果同步到所有可见入口。离线或目录不可达不反复提示“已更新”。
- 普通通知 `role=status`，不抢焦点、无自动打开新标签；详情打开时显式焦点管理，Esc/关闭恢复焦点。键盘、触屏、深色、200% 缩放与 320/360/400/440px 宽度须按实际候选测试。
- 网站内容不成为执行指令：所有来自网页的字符串文本转义显示，禁止插入不可信 HTML 或外部代码；“更新内容”文案也不能请求权限或调用安装器。
- 只保存版本、已读/稍后/忽略与偏好，不采集提示词正文、站点个人资料、历史会话数据；无需远端遥测。

## 6. 分期与最短验收闭环

**R1-Preview（已做）**：将独立更新通知演示脚本插入 `projects/prompt-shortcuts/preview/index.html`；展示“可更新、已更新、待应用、需新增权限、聚合、无更新”状态、点击详情、稍后、忽略及三档提醒偏好。仅为交互模拟；所有版本演示数据不代表发行存在。

**R2-Trusted Read-only（待实施）**：核对真正已安装版本与官方候选；显示 Side Panel NEW、详情与历史；Chrome 安装事件落到宿主；验证关闭重开、多个窗口、旧版可用性。无新增权限。

**R3-Reviewed Update（待实施）**：详情“审阅并更新”只进入原可信 Installer。确认前旧版和数据仍可用；成功需真实安装/读回回执；拒绝、来源变化、能力变化、写回未知、旧候选过期都有明确状态；禁止静默升级或重放。

**R4-Page Toast / Preferences（待实施）**：先 Prompt Shortcuts 和另一个实际获准 Page/Tool 消费者，验证站点授权、跨 Tab 去重与无干扰，再抽象通用 Slot；增加用户偏好与聚合通知。

定向测试至少覆盖：同版本无提醒；新版可审阅但尚未安装；确认成功/取消/权限扩大/来源替换/回执未知；Browser `onInstalled` 已更新与 `onUpdateAvailable` 待应用；工具停用/卸载；多标签去重；离线、弹窗关闭重开、服务 Worker 休眠；敏感网页/无权限不注入；草稿/IME/未完成任务不打扰；原有 Prompt Shortcuts 提示词保存/插入与页面规则无退化。

**验收口径**：可点击预览和静态语法检查不等于真实 Chrome/正式包/本机工具更新验收。实施完毕按绑定同一候选的定向 Node、Chromium 与真实 Chrome 证据分别声明 PASS/FAIL/NOT_TESTED；不能提前宣称 95 分以上产品验收。
