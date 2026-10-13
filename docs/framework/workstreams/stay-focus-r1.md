# Stay Focus R1.0 · 独立工具交付账本

**日期：**2026-10-13。目标 `shopable-ai/opendesk-browser` `main`。与 Time Review R1.5 并行存在代码冲突风险：集成时以仓库 HEAD/提交 SHA 的原子校验为准，禁止覆盖并行 Agent 的 Mac 工作目录。

## 用户闭环与责任边界

用户从 Side Panel「工具」安装 *stay-focus* → 添加 YouTube 每日 15 分钟 → 在可信外层设置批准 DNR/idle 原生权限并开启 → 仅聚焦且 active 时计时 → 到额度时 Chrome 动态主框架规则出现并限制已有标签页 → 次日按当地日重置 → 可暂停、撤权或卸载并清理全部本工具规则。

产品区分：Time Review 是独立的网站使用回顾；Stay Focus 是独立的限制决策与执行，协议、业务存储、授权、卸载完全不同。

## 任务树（实施不等于原生验收）

- [x] 旧项目 `blackList/minuMax/duration_/focusState/check2End` 的功能调用链只读蒸馏，参见示例目录的 `LEGACY-DISTILLATION.zh-CN.md`
- [x] 新增独立工具 `tool.config.json`、沙箱 UI、官方网站目录可选安装条目
- [x] 新增 Host 范围的操作协议与安装 hash / revocation epoch 校验、非模态用户审批
- [x] 新增 DNR 自有规则 ID 730000–730199、精确域名/子域名、固定 extensionPath 与规则读回对账
- [x] 新增前台检查点、共享分钟组、工作时段、限时专注与白名单模型，存储不依赖 Time Review
- [x] 增加权限申请、时间规则、禁用/卸载清理与被限制页面资源的源码接线
- [x] 新增模型和 DNR 组件单元测试源码
- [ ] 由 Node 真正执行组件测试，保留完整退出码/日志与输入 SHA
- [ ] 独立工具打包 + 真实 `npm run check && npm run build && npm run build:dev && npm run verify`，保留 ZIP/体积/SHA-256
- [ ] Mac Chrome 真实打开被拦截页面、DNR 日志、Worker/Chrome 重启、授权撤销和卸载无幽灵规则
- [ ] Side Panel 320/360/400/600px、缩放、焦点/键盘与设计系统视觉验收
- [ ] 八维 95+ 专家签收与正式产品级 PASS（不得由作者自评替代证据）

## 运行限制与验收口径

只有同一 session/本地日/时区 offset 下跨度 ≤45s 的有效检查点才能计费，不做每秒精确保证。DNR 动态规则持久化，但每次启动、活动变化、授权撤销、安装/启停变更都要校验本工具拥有的规则片段。读回不一致或 Chrome 拒绝规则应返回错误，不得反馈成功。

Node mock 组件测试只能标为 **COMPONENT**，不能证明真实 Chrome 导航被拒绝。真实原生测试需区分 Chrome DNR 对普通主框架的实际重定向与 SPA/Service Worker 等边界。

## 八维专家验收

| 维度 | 本轮结论 | 阻断理由 |
|---|---|---|
| 功能完整性 | 待原生验收 | UI、服务接线不能取代安装流程证据 |
| 时间额度正确性 | 待测试 | 缺真实 idle/多标签/日界/DST 的原生证据 |
| 网站拦截准确性 | 待测试 | 缺 Chrome getDynamicRules + HTTP 实际导航 |
| 隐私和权限安全 | 待审查 | 须验证页面 sender、可选原生权限和撤权时序 |
| UI/UX | 待测试 | 需要真实 Side Panel 截图和焦点测试 |
| 长期性能 | 待测试 | SW 重启与 30s Alarm 长期运行待测 |
| 独立工具可维护性 | 待审查 | 单独包、官方目录、卸载清理需回归 |
| 测试证据可信度 | **未达到 95** | 未运行原生 Chrome 的不能称为产品级 PASS |

**未经实际执行的项目不登记数值 95 分；不得使用平均分掩盖缺陷。**
