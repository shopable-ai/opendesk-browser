# OpenDesk Browser · 工作流 R16：用户自带 AI 模型、隐私责任与权限体验

日期：2026-10-13。核心产品要求：**普通使用无需重复勾选；首次有意义地告知与授权，网页读取另行确认，许可可撤回。** 本合同不是免责条款或法律意见，也不替代实际发布的隐私政策、服务合同及法域审查。

## 一、现有真实数据路径

| 模式 | 实际调用 | 责任边界 |
|---|---|---|
| 本机 Codex | Side Panel → OpenDesk Native Agent → 用户已连接的 Codex / 所选模型。模型推理可能联网，相关会话内容可能被 Codex 客户端保留 | Codex 服务运营者承担相应服务端责任。OpenDesk 对其扩展内的数据收集、转发范围、Chrome 权限、Native 桥和安全实现负有相应义务。不能声称本机 Codex 等于完全离线。 |
| 自定义 HTTPS | Side Panel 使用用户填写的 HTTPS endpoint 与 API Key 直接发出 Chat Completions 请求；不是 OpenDesk 官方 AI 中转服务 | 用户选择外部服务，服务方对自己的运营与处理负责；OpenDesk 仍对其扩展发出的请求、权限、披露、最小化、密钥处理、安全措施及实际部署责任负责。 |
| 手动工作流 | 不调用 AI | 本地编辑与运行仍通过原有 Workflow / RunHost / Chrome Authority。 |
| OpenDesk 官方 AI | 目前尚未开放（下拉项 disabled） | 未来若开放，需要另外披露官方服务的运营主体、接收方、跨境数据路径、处理目的及适用法律基础；不可继承现有用户自带模型授权。 |

**重要：是否通过 HTTP、谁输入 API Key、谁支付模型费，并不能单独界定法律责任。** 要看实际由谁决定处理目的和手段、谁收到个人数据、适用法律与合同。本产品不得宣传“用户自带 AI，所以 OpenDesk 官方完全无责任”。

## 二、已经实施的交互与防护

1. **首次发送：**输入框附近显示当前模型接收方、真实工作流网站 origin、将发送的需求/步骤/参数结构。发送按钮为可见 **「同意并生成」**；只有真实用户点击才开始。没有预先勾选的同意框。
2. **以后使用：**同一接收方 / 模型通过普通发送按钮继续，授权有 180 天期限，可在 AI 设置中撤回。切换 HTTPS endpoint origin + path、模型，或者变更用户自带模型 / 官方模式，不复用前一接收方的授权。存储的记录只有模型/路径标识与时间，不包含网站访问记录、需求、API Key、URL 查询参数或网页正文。
3. **模型输入最小化：**用户输入的任务描述、当前站点 origin、现有步骤与参数结构；删除参数默认值、旧步骤的直接填写值及导航 URL 的查询参数与 fragment。需求文本和选择器仍可能包含个人信息，界面应提示用户不要提供秘密。已有可执行工作流和冻结版本不因此被修改。 对 AI 提议中 ID 与目标元素均未变化的填写/导航步骤，在本地恢复原有值；AI 从未收到这些隐藏值。若模型冒用隐藏值占位符且无法精确对应既有步骤，则拒绝该提议，绝不把占位符当作真实填写内容。
4. **网页结构与文字摘要：**Codex 可以提出 `browser.observe` 请求，但不因「生成」就直接拥有网页数据。必须通过用户单独的实际允许动作、Chrome 精确站点权限、当前窗口/tab/document/url/origin 一致性核验及现有 RunHost 的真实执行才能读取，拒绝/撤权/页面变化均须 fail closed。自定义 HTTPS 适配器没有这个网页读取工具。
5. **网页操作：**读取授权不是填写、点击、提交、安装、定时或云控授权。AI 计划仍要经过用户审核并采用；原有 RunHost/Task Authority 和动作安全边界不可因 UI 减少复选框而删除。
6. 不允许隐藏 OpenDesk 后端代理上传、额外遥测上传、模型回复直接执行 JavaScript、存储 API Key、未经授权重试可能已发生副作用的操作。不能依靠单个 UI 复选框来代替真实 Chrome 或接收服务的安全验证。

## 三、不同地区怎样设计？

采用统一简单交互，并以**实际运营实体、用户与处理主体所在地区、模型接收方、数据内容、法律依据和跨境路径**为依据补充分地区要求，不按 IP 简单切换“免责语”。GDPR、PIPL、日本 APPI、美国及州法可能规定不同的告知、同意、撤回、跨境和合同义务；需要单独同意的特定情形不得用默认选中绕过。上线时由产品运营者与专业法律顾问确认实际处理角色、隐私政策、商店 listing、服务商条款与适用法律。单次产品按钮不等于对世界所有法域的合规保证。

权威参考（截至 2026-10-13 核对）：
- Chrome 扩展 Permission API：https://developer.chrome.com/docs/extensions/reference/api/permissions
- Chrome Web Store Program Policies：https://developer.chrome.com/docs/webstore/program-policies/policies
- Chrome Web Store 2026 政策更新：https://developer.chrome.com/blog/cws-policy-updates-2026
- EDPB 数据控制者/处理者指南：https://www.edpb.europa.eu/sme/learn-the-basics/data-controller-or-data-processor_en

## 四、测试与 95 分目标

本轮定向测试：
- `tests/environment/workflow-ai-data-sharing.test.mjs`
- `tests/environment/workflow-ui-states.test.mjs`
- `tests/environment/workflow-r15.test.mjs`
- `tests/environment/workflow-local-codex.test.mjs`

必须逐项核查首次同意/后续复用/变更接收方/撤销/180 天过期、HTTPS 密钥不进请求正文、Codex 网页观察否决与文档变化、HTML 320–520px 与 200% 缩放、真实 Mac Chrome 及生产包。**没有相同候选的实测证据不得自行评分为 95+ 或宣称生产/法律验收完成。** 实际 GitHub CI 组件证据不等同于真实 Native Chrome 证据。
