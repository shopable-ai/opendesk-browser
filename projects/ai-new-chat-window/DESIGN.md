# R1 交互与技术决策 · DESIGN_CANDIDATE

## 一、产品与范围
对外名称建议 AI New Chat / AI 新建对话，内部目录及 ID 保留；不建新 Sidebar 工具，不引入项目管理平台。默认直接新标签页（通常前台，原任务在后台继续），正常用户使用无需设置面板。已有其他站点不删除；独立窗口次要能力可在未来审查，不在本轮新增快捷键约定。

## 二、交互选择
| 方案 | 设计自评 | 选择 |
|---|---:|---|
| A 每个项目独立 hover 按钮 | 96 | P0 |
| B 仅官方菜单入口 | 84 | 空间不足时的条件降级，需证明不篡改原菜单 |
| C 项目与普通入口共享图标、语义分别识别 | 97 | 推荐与 A 组合 |
| D 覆盖官方新聊天行为/新增独立管理 UI | 63 | 拒绝 |

项目行：项目名称/折叠控件 → 官方 pencil/+ → 新增 open-in-new 图标 → 官方三点。图标 16–18px、交互命中区约 26–28px，与原生高度保持一致，间距 2–4px，继承主题色；默认隐藏，hover/键盘 focus 显示，无常驻边框、无品牌标签、无布局动画。与官方控件必须为 sibling，不能嵌进 anchor/button；aria-label/tooltip 用明确的项目/普通语义。原生 action 不拦截。点击新增图标时同步核对 DOM 所属及意图，再阻止新增控件事件冒泡，不阻断其他事件。可用空间不足以无回归共存时不覆盖/挤压原生按钮；优先真实 UI 已留 action slot，必要时经验证进入次级菜单（未证实 API/DOM，不能承诺可插）。触屏、键盘及窄屏至少有可发现的可访问入口。长名称正常省略，tooltip 保留完整标题，真实宽度与无扩展基线对照；预览固定预留槽只证明布局模型不跳，不证明真实网站不缩短名称。

原型 preview/index.html 是自包含 HTML，模拟 A/B、多项目、同名项目、独立草稿、首次主动发送才入历史、官方当前页导航、主题/语言、折叠、重绘、停用、失效/阻止/未知结果。模拟 ID/URL 不代表真实 ChatGPT 路由；不访问站点、不发消息。模拟异常不会产生真实 tab；unknown 只演示栅栏，真实恢复以核验为准。

## 三、最小技术链（待验证）
用户手势 → provider 匹配 → 当前行身份重验 → 已验证新对话目标 → opening 去重 → 仅打开 B → 目标 composer 核验 → 用户自己发送 → 原生归属核验。

| 技术 | 自评 | 边界 |
|---|---:|---|
| T-A 原生独立链接 target=_blank rel=noopener noreferrer | 96（路由条件成立时） | 支持浏览器标准新页；无 tabId/成功证明，默认浏览器策略决定 tab/window，避免 nested interactive。 |
| T-B 同步 window.open(url,_blank,noopener,noreferrer) | 93 | 与现有 requestNewChat 最接近；不能把 noopener null 判成拦截，不能确认 tab/window。 |
| T-C 可信后台 chrome.tabs.create | 94（能力本身） | 可得 tabId、在指定窗口创建 tab；Page USER_SCRIPT 无直接权限。只有证实 Page 不满足产品硬约束且通过 Authority/第一方审阅后才使用；既有 trusted driver 非直接授权。 |
| T-D 新 B 内官方动作（仅直接 URL 不成立时） | 88（有条件） | 必须绑定可信的 B tabId/documentId/目标项目及单次 intent；经现有受控链验证后只在 B 内执行唯一官方新对话操作；超时、身份冲突、登录跳转都停止；不使用源 A、私有 API、全局 pending/localStorage 标记或广播猜 tab。 |

优先 T-A / T-B 小型技术 spike，选择一种实际满足核心目标的 opener；严格 tab 与结果回执不达标则不能将 P0 判过，转 T-C 独立审核，不新增裸露桥接。真实 B 仅打开项目首页而不能立即输入，视为不满足；只允许 T-D 在可证实的 B 目标内补齐。若无法安全确认身份/路由/能力，阻断该场景、保留原按钮并如实说明。禁止自动重试或普通 chat 降级。

## 四、现有模块职责与合同
- main.js：复用 createPageUI、顶层/站点资格、原 Page Authority；onDispose 清理子 host、observer、timer 和所有绑定；不要因 owner.host 隐藏而让 toast 不可见。
- destinations.js：分离 provider/ordinary/project，产出临时最小 target（kind, provider, stableProjectId?, verifiedUrl, evidenceKind）；项目 ID 与可变 URL/slug 分开，仅接受实测规则。当前 regex/固定普通路径均需实际核对。禁止同名推断、跨域、URL credentials、未审查 query/hash；禁止把当前对话路径当新建目标。
- buttons.js：保留独立 Shadow DOM，真实 nav row 去重/重绑定、同 row 多 identity 拒绝；属性变化观察限必要属性与 nav 范围，短批次合并；避免全 transcript 扫描和持续高频轮询，SPA remount、BFCache/撤权走现有生命周期。locale 用 document.lang/现有公开机制，小字典 en/zh-CN，不假定可调用框架内部 i18n。若确需新模块，只在本项目按真实职责拆分。
- 发起请求：在可信用户手势内再次解析当前 DOM；每个源 document+kind+provider+stableProjectId 短窗去重（预览 600ms，正式根据真实手势测试确定）。不阻止用户有意连续创建不同任务。状态 NOT_ELIGIBLE / REQUESTED / OPENED（可信 tab 回执时才可用）/ READY（经证据确认 composer）/ FAILED（明确失败）/ OUTCOME_UNKNOWN。未知状态禁止自动重放；原页只能提示/让用户核对，不能擅自关闭标签。仅用户新手势且完成核对后解锁。开页成功与项目归属是两种证据。
- 反馈：Page ui.toast({message,variant,duration})，未知/持续错误 duration:0，避免覆盖其他错误；正常明确成功可低干扰或无 toast。原仓库 Sidebar ui.notify 只用于对应上下文，不跨世界调用。禁止 console-only、alert、confirm、伪造 success。
- 安全：现有固定四 origin 不扩张；首站 ChatGPT，既有站点保留。无后台采集、网络上报、Cookie、凭据、读取对话正文/草稿作为业务前置；无自动发送、删除、迁移旧 chat。无新增权限或第三方依赖。Tab 激活不能保证网站自己持续生成，真实 T04 独立记录自然完成/限流等外因。

## 五、实施路线（R2，不在本轮改业务）
G0 本地真实 Chrome 只读确认当前项目条目与 native action；使用独立 QA 项目/无业务草稿标签记录真实路由。先确认 ordinary 与项目空 composer，验证两个项目及同名、重命名（仅 QA 项目），确定 stable identity、直接链接、项目首页与旧 chat 的区别。
G1 验证最小路径：T-A/T-B → A 不变、B 独立且空白 composer；只有用户授权的合成首条消息验证项目归属，刷新后仍可确认。A 流式和草稿分开测试；不得干扰正在工作的真实标签。
G2 在同一 owner 完善 destinations.js/buttons.js/main.js（仅必要改动）、复用现有 fixture/测试。未知结果、授权及可达性负例先测；必要时仅提出并审查 T-C/T-D 真实缺口，不扩平台。
G3 node --test projects/ai-new-chat-window/tests/*.test.mjs；按原本地开发入口显式 Run、Stop，真实 Chrome 测试 ACCEPTANCE.md；如进入冻结交付再使用 node scripts/validate-program-project.mjs projects/ai-new-chat-window 与 npm run build:program -- projects/ai-new-chat-window。沿原 Page Authority 安装/更新，确认版本、sourceHash、grant 与真实页面，非本轮自动发行。
G4 定向回归其他已有站点、实测布局；补真实证据与独立评审后才允许 P0 放行，差量提交 main，避免覆盖其他 Agent。

## 六、下一阶段任务（可直接复制）
GOAL OD-AI-NEW-CHAT-R2：基于当前 main 的 projects/ai-new-chat-window，读取 README.zh-CN.md、REQUIREMENTS.zh-CN.md、RESEARCH.md、DESIGN.md、ACCEPTANCE.md、preview/index.html 及现有 src/tests。不要重做 R1、不要新建 ai-new-chat，不改 ID、不发布、不扩大权限。原始目标：在 ChatGPT 项目条目 hover/focus 点击独立图标，默认新标签页 B 可直接输入同项目新对话，A 的 URL/草稿/生成不受扩展主动影响；普通新聊天独立且不串项目。先在真实已登录 Chrome 使用授权 QA 标签/项目观察 native action、项目稳定 ID、slug/同名、真实目标 URL，验证直达 composer 与用户手动合成首条发送后项目归属，不能只假设 /project；若无可靠链接，证明 Page 限制再评估可信 B-only 官方动作，拒绝私有 API、盲目重试、任何源 A 副作用。随后最小修改已有模块与测试、原 Page 生命周期和 ui.toast，按 G0–G4 及 ACCEPTANCE 矩阵执行定向验证、真实 Chrome A/B/授权/停止/归属；未知与未测明确。仅在有证据时冻结安装候选，不自动上架。保留其他站点、现有工作区及 main 并行改动。提交范围内差量，报告可操作结果、真实 SHA、失败/未测、分项及算术平均评分；目标 ≥95 但关键阻断或证据缺失不得评分伪造。 
