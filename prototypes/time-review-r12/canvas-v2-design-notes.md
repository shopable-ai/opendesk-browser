# Time Review R1.2 · Canvas V2 版式与数据口径

> 2026-10-11。**纯 HTML / CSS / Canvas / JS 的离线原型**，不是已安装 Chrome MV3 工具、真实账号报表或正式验收证据。
> 设计基线：[Canvas V2](time-review-r12-canvas-v2.html)。此前 [六分类 V1](time-review-r12-six-category-review.html)、[字段对齐版](time-review-r12-source-aligned.html) 和 [最早原型](time-review-r12-preview.html) **保持原样**，不覆盖，便于回溯。

## 一、真实旧版源码来源

- [`time-review.vue` 的 `drawTimeFragment`](https://github.com/shopable-ai/todo-user/blob/main/src/modules/todo/views/time-review.vue)：`UtilFragment.times2Dic(times)` 将一天归并成按分钟的时间字典，设置 `canvas.width=1440`，`ctx.fillRect(min,0,1,height)` 为每一分钟按六类别绘制颜色；每小时长刻度、每 10 分钟短刻度。
- [`UtilFragment.ts`](https://github.com/shopable-ai/todo-user/blob/main/src/modules/todo/utils/UtilFragment.ts)：生成 0–1439 的分钟键并归并重叠时间；计算六类分钟数。历史逻辑对 0（未分类）的覆盖语义存在隐患，新架构需明确定义优先级。
- [`TodoTimeChartUtil.ts`](https://github.com/shopable-ai/todo-user/blob/main/src/modules/todo/utils/TodoTimeChartUtil.ts)：另有 **144 个十分钟碎片块**，由 DOM 元素生成；这与上面的原生 Canvas 分钟密度条是两种图。V2 主要移植 *Canvas 分钟密度* 概念，不误称后者也是 Canvas。
- [旧版 Vue 快捷报告](https://github.com/shopable-ai/todo-user/blob/main/src/modules/todo/views/time-review-popup.vue)：总记录时长、重要时间、生产率、六类占比、当前网站与类别。
- [原版六分类数据映射](legacy-six-category-data-map.md)：type 0 未分类、1 工作生产、2 阅读学习、3 聊天新闻、4 娱乐、5 生活。

## 二、V1 → V2 的布局差异

1. **首页第一张浅色主卡**：合并今日记录、工作＋学习的重要时间、生产率和“与昨日相比”，减少多卡阴影与视觉竞争；昨日数字明确为模拟数据。
2. **四象限 2×2**：类别名称、用途、副指标百分比、分钟数和低调的占比线；生活/未分类单列为两个紧凑次卡，不被计入四象限。
3. **24h Canvas 时间线**：原版一条 1440 分钟横轴在窄侧栏过密；V2 分为 00:00–12:00、12:00–24:00 两个 720 分钟行（上、下各一条），保留所有分钟槽位和 10 分钟 / 1 小时刻度，并允许鼠标、触摸、键盘查看分钟详情。
4. **当前网站、网站归类、完整报告**：保留在下半页；状态、同步和专注放页脚或设置，不再遮挡复盘信息。
5. **继承宿主设计感**：视觉参照 OpenDesk 的 `--od-ink:#1b2c49`、`--od-brand:#365eda`、`--od-line:#e1e8f1`。原型页面 CSS 自包含，因为 sandbox iframe 不自动继承宿主变量。

## 三、Canvas 数据与绘图合同

- 输入：`{domain,title,type,start,end}`，时间示例用本地 HH:mm；未来真实实现应明确用户时区和跨日切割。
- 当日状态：`bins[0..1439]` 每个分钟存 `{type,domain,title}` 或 `null`。**0 是有效未分类；null 才是“未记录”**。
- 演示逐分钟合并记录：第一条占据该分钟的活动优先。真实迁移需要明确定义浏览器/桌面/任务来源优先级和重叠去重，而非直接复制历史 `timeDic[m] || type` 逻辑。
- `total = sum(counts[0..5])`；`important = counts[1]+counts[2]`；`productivity = round(100*important/total)`；空天不除以零；同样的分类结果驱动画布、顶部数值与明细。
- 画布使用 CSS 尺寸 × 限幅 `devicePixelRatio` 作为物理像素尺寸，支持缩放重画；每行 720 分钟，按连续相同类别合并绘制矩形，额外绘制 10 分钟短刻度与小时长刻度。
- 交互：鼠标 hover、触摸/点击、键盘左右各跳 10 分钟，上/下跳 12 小时，Home/End 跳全天首尾；下方文本提示显示时刻、类别和域名。Canvas 不能成为唯一的可访问数据入口，明细页仍提供文本列表。
- 纯静态模拟，不执行真实 Chrome API、存储写入、网络调用、后台计时、分类后端提交、外部跳转；原型“应用”仅调整本页内存态。

## 四、独立 Chromium 验证记录

运行环境：容器内 Linux headless Chromium，**不是 Mac Chrome 原生扩展验收**。使用 Playwright `set_content` 加载同版 HTML：

- 初始样本计数：**5小时12分**（312 分）、重要时间 **3小时24分**（204 分）、生产率 **65%**。
- 六类：工作 126、学习 78、聊天新闻 42、娱乐 24、生活 30、未分类 12 分；正确区分“未记录”。
- 将 example.dev 从工作改为娱乐：重要时间变 **1小时53分**（113 分），生产率 **36%**，总时间维持 312 分；按分类查看明细正常。
- 画布：键盘 End / Home / 右箭头 / 下箭头能正确定位至 23:59 / 00:00 / 00:10 / 12:10，鼠标点击返回相应分钟信息。
- 今日示例 / 同步异常 / 无数据 / 换日期 / 记录开关 / 详情返回等原型功能正常；无 JavaScript pageerror。
- viewport 宽度 **200、240、320、360、390、420、600、1100 CSS px** 均无整体横向溢出。极窄宽度只是防回归，不表示真实 Chrome Side Panel 支持 200px。
- [独立可运行 HTML](time-review-r12-canvas-v2.html) 的语义和可访问性回归不能替代实际后端授权、持久化、Chrome MV3 生命周期、跨来源去重、时区/午夜、深色主题或真实 Mac 验收。

## 五、后续实施边界

- 在当前可信 MV3 后台、Side Panel 工具宿主及现有官方工具安装器上集成，不创建第二套 RPC / 安装器 / 统计服务。
- **优先确认新版可信服务怎样取得每日 `action.days` 与 `actionConfig` 数据**，并确保用户授权、Token 保护及失败回滚。离线原型接口并非自动可用。
- 保持源码历史分类 ID 与聚合语义，生产实现需补来源优先级和跨来源去重测试；若 1440 个分钟槽位无法描述夏令时切换日，应明确本地日期与真实时间戳计算规则。
- 完整历史报表可继续使用原业务页面，侧栏不拷贝全部 ECharts/多表格页面。
- 正式质量评分需等待真实工具、数据与 Mac Chrome 证据；当前 UI 设计可单独评价。
