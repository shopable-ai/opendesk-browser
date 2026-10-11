# Time Review R1.2 · 旧版六分类与复盘数据核查

> 2026-10-11。本文依据 **shopable-ai/todo-user** 的实际 Vue 前端与工具函数，不只依据 `src-bex/TimeReview.ts` 追踪上报逻辑。新原型为离线演示，尚非当前 OpenDesk Browser 可安装工具。

## 1. 文件与页面的职责

- [原版主报告 time-review.vue](https://github.com/shopable-ai/todo-user/blob/main/src/modules/todo/views/time-review.vue)：切换日期、总时间、重要时间、生产率、昨天比较、六类占比、按小时堆叠图、饼图、分钟时间碎片、活动时间线与按网站/软件分组列表。
- [原版快捷报告 time-review-popup.vue](https://github.com/shopable-ai/todo-user/blob/main/src/modules/todo/views/time-review-popup.vue)：时间质量摘要、六类进度条、当前网站、网站今日时长与当前分类，含修改分类入口。
- [原版分类管理 time-review-config.vue](https://github.com/shopable-ai/todo-user/blob/main/src/modules/todo/views/time-review-config.vue)：按日期筛选，域名/程序级别分类，通过 `actionConfig.add({path,type})` 保存。
- [旧版分钟合并 UtilFragment.ts](https://github.com/shopable-ai/todo-user/blob/main/src/modules/todo/utils/UtilFragment.ts)：`times2Dic` 展开到 0–1439 分钟，`times2type` 统计六类；这和直接把所有 duration 相加不同。
- [简体中文文案 zh-CN.ts](https://github.com/shopable-ai/todo-user/blob/main/src/modules/todo/locale/zh-CN.ts)：解释生产、学习、聊天、娱乐、生活及四象限含义。
- [历史后台 TimeReview.ts](../../docs/contracts/source-snapshots/todo-src-bex/src-bex/TimeReview.ts)：活动记录上传，不是整套报告读取与分类 UI。

## 2. 类别合同（保留原编号）

| `type` | 前端可见类别 | 四象限/独立含义 | 原版颜色倾向 |
| --- | --- | --- | --- |
| `0` | 未分类 | 待归类，既不能算工作也不能自动算低效 | 灰 |
| `1` | 工作/生产 | 重要且紧急（旧版用途映射） | 深蓝 |
| `2` | 阅读学习 | 重要不紧急 | 浅蓝 |
| `3` | 聊天/新闻 | 紧急不重要 | 暗红 |
| `4` | 娱乐 | 不重要不紧急 | 红 |
| `5` | 生活 | 四象限之外的独立生活类 | 金黄 |

这是 **6 个互斥的旧版类别编号**，不是用户能够同时给一条记录打六种标签。四象限是产品采用的用途解释，不应宣称所有工作都紧急、所有聊天都不重要。生活和未分类不能被藏进其他四个类别。

## 3. 原版数据合同与正确口径

- 源码中的日报查询：`service.app.todo.action.days({day,getType:1,page:1,size:9999})`。返回使用了 `list`、`dict`（主报告还析出 `type`），其中 `dict[domain]` 可为网站/程序类别提供映射。
- 分类持久化：`service.app.todo.actionConfig.add({path,type})`，页面按网站/程序聚合后操作，不是仅修改单条事件标签。
- `已记录时长` 优先取 **分钟展开、重叠归并后** 的计数；不能直接把跨来源、跨窗口事件时长相加，避免一天超过 24 小时。
- `重要时间 = type1 + type2`；`生产率 = round(100 × (type1 + type2) / 总已记录分钟)`。未分类不计入重要时间；旧版另行显示“未分类可能还有生产时间”的提示，但不能把这部分当成已确认的生产率。
- `当前网站时长` 可按域名从同一天活动归并；`当前分类` 可从分类 `dict` 查找。历史代码提到时间清单、桌面端与移动端活动，故 **仅浏览器端数据 != 旧版跨来源“全部时间”**。
- `createTime` 是活动记录时间，不能当成“最近成功同步时间”。状态 UI 需独立可信回执。

## 4. 不应原样复制的历史细节

- `time-review-config.vue` 的分类筛选选项未包含生活类 5（但底部单选包含 5）；迁移不能因此漏掉生活。
- 旧版 `timeDic[m] = timeDic[m] || i.type || 0` 在类型 0 的情况下可能发生覆盖；需明确跨来源去重优先级，而不是复用该隐含逻辑。
- 主报告 `transBarData` 对聊天/娱乐的负值字段和标签映射容易混淆；新版必须以一致的类别 ID 为依据派生展示。
- 旧前端包含 Quasar/ECharts 大图、表格、按小时曲线和任务融合。适合保留在完整报告，不应全部复制进 360–400px 宽的 Side Panel。
- 旧版后台大范围内容脚本、URL 查询过滤及 `setInterval` 不等于现代 MV3 安全/生命周期合同。

## 5. 新版信息层级（设计规则）

1. 日期与今日总时长：最先看到今天的时间归属。
2. 重要时间 + 生产率 + 昨日对比：首屏最重要的决策信号。
3. 四象限 2×2 卡片 + 生活/未分类两个独立卡片：显示类别名称、分钟和份额；点击钻取。
4. 紧凑时间线：大图留给完整报告，当前网站显示可修改分类入口。
5. 分类明细页：按网站展示汇总，不用额外堆砌筛选按钮。
6. 状态与同步放底部，Token、专注控制放设置页。设置不与报告混杂。

## 6. 原型、测试与交付边界

- [六分类交互原型](time-review-r12-six-category-review.html)：**当前建议的 UI 设计基线**。独立 HTML，事件和分类数据全部模拟；编辑 `example.dev` 的类别会重算今日重要时间、生产率、占比及明细。
- [第一版原型](time-review-r12-preview.html)、[后台字段对齐第二版](time-review-r12-source-aligned.html) 均保留，不覆盖历史方案。
- 已用独立 Chromium 检查 320/360/390/400/600/1100px 水平溢出、4+2 类别、5小时12分/3小时24分/65% 的演示一致性、类别过滤、改分类、同步异常、无数据、跨日导航、专注开关，结果通过。**没有真实扩展、线上 API、账号、业务导航的实测证据。**
- UI 概念方案可以预评 95 分以上；实现评分必须等当前 OpenDesk Browser 的工具安装、可信 MV3 后台、实际日报读取、分类写入、数据去重、隐私处理与真实 Chrome 验收完成。

## 7. 下一阶段的验收树

- [ ] 核对当前 OpenDesk Browser 是否已有 Time Review 的可信后台服务与安装入口；不新造第二个工具安装器/权限系统。
  - [ ] 受信宿主：读取日报 `list/dict`、按既定六类统计、认证/错误处理。
  - [ ] 修改分类：用户手势、域名规范化、确认服务器返回并刷新摘要；失败不乐观伪造成功。
  - [ ] 今日/昨日/指定日及空数据，任务融合来源与浏览器单端来源标识准确。
- [ ] 时间去重与跨日、休眠、时区、重复记录、身份切换、网络断线、服务端失败的测试。
- [ ] Side Panel 在窄宽、深色、缩放和键盘操作下与现有 Design Tokens 一致。
- [ ] Mac Chrome 真正运行并核对原报告，所有分数和完成度按证据独立评定。
