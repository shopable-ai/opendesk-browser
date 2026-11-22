# AI Job Auto Apply · 需求与验收（R1 / 命名 R2）

原始实现任务：OD-JOB-ASSISTANT-OPEN-SOURCE-MVP-R1；本次改名任务：OD-JOB-AUTO-APPLY-NAMING-R2。身份：OpenDesk Browser main / projects/job-auto-apply/。

## R2 名称、搜索意图与交付真实性

产品英文名 `AI Job Auto Apply`；中文名“AI 自动求职”；唯一工具 ID `job-auto-apply`；页面模块 ID `app.job-auto-apply`；项目目录 `projects/job-auto-apply/`。原 R1 名称 `job-assistant` 作为 Git 历史，不保留第二个实体或安装包。

选择依据：`Job Auto Apply` 对应用途和搜索意图更直接；`AI` 表示计划中的智能匹配能力；`AutoJob` 更短但语义稍泛。名称选择是产品判断，不是实测 SEO 排名或用户行为研究。内部搜索的别名仅在真实检索机制支持后接入；此阶段不为 SEO 直接改宿主。

当前版本仍为 **SOURCE_WIRED、NOT_INSTALLED、NOT_CHROME_TESTED**。所有功能介绍必须区分现在可做的只读扫描和人工草稿，与后续规划的真实自动投递/AI/多平台。不要制造虚假投递回执、把规则评分说成 AI 或宣称已完成自动发送。

## 原始目标与边界

用户希望参考开源 BOSS 直聘自动求职浏览器扩展，在当前 OpenDesk 项目开发类似应用。目标不是提高无差别群发数量，而是减少找岗位、筛岗位、准备沟通的重复劳动，提高匹配质量并确保可审核。不得把点击过按钮等同于投递成功。

## 功能树与真实状态

| 优先级 | 节点 | 用户动作 | 可验证结果 | R1 |
| --- | --- | --- | --- | --- |
| P0 | F1 网站发现 | 在 BOSS 搜索列表点“扫描当前页面” | 网页模块返回真实 DOM 卡片与诊断；无数据不伪造 | SOURCE_WIRED |
| P0 | F2 匹配和解释 | 设置意向岗位、城市、排除词、薪资与技能 | 显示确定性评分、排除理由；缺失字段标明人工核对 | SOURCE_WIRED |
| P0 | F3 待审核队列 | 明确点击“加入待审核” | 本地持久化、稳定 jobId 去重、读写 CAS | SOURCE_WIRED |
| P0 | F4 沟通草稿 | 点击岗位“准备沟通草稿” | 按模板生成、允许编辑、用户点击复制；不发送 | SOURCE_WIRED |
| P0 | F5 失败和撤权 | 非 BOSS/未授权/变更页面/回执异常 | 状态明确，扫描清空旧快照，不自动重放副作用 | SOURCE_WIRED |
| P1 | F6 真正沟通 | 用户审核过目标、消息和范围后明确执行 | DOM/网站真实回执、未知不重放、Stop | NOT_IMPLEMENTED |
| P1 | F7 工作流 | 多岗位分页、任务暂停/恢复、同公司/HR 限制 | 确认 jobId+company+HR 身份、上限及快照恢复 | NOT_IMPLEMENTED |
| P1 | F8 AI | 本地简历解析和语义评分、事实约束话术 | 输出匹配依据，不能虚构经历或学历 | NOT_IMPLEMENTED |
| P2 | F9 多平台 | 智联、前程无忧、LinkedIn、Indeed | 各站独立 adapter/权限，不能把 BOSS DOM 当通用选择器 | NOT_IMPLEMENTED |
| P2 | F10 求职 CRM | 沟通状态、面试安排、提醒、漏斗统计 | 以真实回复或用户标记为来源，不自动编造状态 | NOT_IMPLEMENTED |

## 技术与安全决策

- Type：Combined Application。Sidebar Tool (opaque origin) + 应用内 page.module (USER_SCRIPT)；两者仅用批准的 page.request 跨界，不新建第二套 Host/Worker。
- 当前安装匹配路径：https://www.zhipin.com/web/geek/job*；网页内额外要求 /web/geek/job 前缀；不访问简历、聊天和账号设置。
- 页面模块只读当前 DOM；不使用 fetch/XHR 劫持、隐藏接口、验证码绕过、Cookie 或密码采集；不模拟发送或随机隐藏自动化行为。
- 规则匹配当前是确定性启发式；薪资解析仅支持 K 的显式区间，不作单位混合推断。未知薪资/缺少稳定 ID 不应当被视为已验证。
- 本地只存偏好与最多 24 条待审职位摘要，不存账户凭证、聊天记录或完整简历。单键 8 KiB、总 32 KiB；CAS 冲突/未知写入必须停下核对。
- 职位 URL/页面文字是第三方不可信输入，展示使用 textContent，严禁作为 HTML 或自动访问目标。任何后续 AI 输出不得直接获得发送权限。
- 后续真发送必须有用户确认目标岗位/公司/实际消息；验证发送者和会话身份、幂等 jobId+message、平台真实回执；不明确则 STOP/UNKNOWN，不能盲重试。应遵守平台条款与当地法律。

## R1 的最小验收矩阵

1. 网页：授权的 BOSS 职位搜索页有三张卡片时读到三条；非匹配页返回明确错误；0 条返回诊断而非假数据。
2. 身份：具有稳定 jobId 的岗位可加入待审；没有稳定 ID 只能看不能加入；重复 jobId 不产生重复队列。
3. 规则：白名单岗位符合、外包等排除词拒绝、岗位/城市不匹配拒绝、薪资上限低于期望拒绝、无薪资时提示人工核对。
4. 隐私：权限仅 BOSS；UI 不接触网页 DOM、Page 不接触存储凭据；不触发消息发送、简历操作或跨站网络。
5. 生命周期：页面变化旧快照失效；存储冲突/回执未知不重发写入；未安装/未授权/撤销权限提示失败。
6. 交互：窄侧栏的职位发现→待审→规则→草稿→复制完整走通；刷新重新读回待审队列；可读性和键盘焦点无阻塞。

证据规则：静态源码存在记 SOURCE_WIRED；候选构建、Node、真实 Chrome/网站、正式包安装分开记。当前真实页面与本地构建：NOT_TESTED。下一步优先真实 DOM 取证和标准候选构建，不提前上生产。
