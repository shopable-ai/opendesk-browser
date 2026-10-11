# Time Review · 时间回顾 R1.3 (Canvas V3)

正式界面基准：prototypes/time-review-r12/time-review-r12-canvas-v3-single-track.html。正式 Side Panel 工具只采用单条 24h Canvas、紧凑四象限/生活/未分类和卡片视觉，不采用原型的浏览器外壳、样例时间、模拟同步或账号设置。

## 安装、更新与使用

Time Review 仍是 opendesk.sidebar-tool.v1，ID 始终是 time-review，能力为 time.review + user.export。R1.3 新增了可信后台接口，所以**需要含 R1.3 后台的 OpenDesk Browser 扩展**；只把新 UI 导入旧扩展无法正常读取分钟详情。

1. Side Panel → 工具 → 发现工具（或应用市场）→ Time Review → 安装/更新，审阅权限。不能新建相同 ID 的平行工具。
2. 在工具详情设置中，由用户本人授权 Chrome 空闲检测；单独授权不会开始计时。
3. 打开 Time Review，主动点击「开始记录」。只有聚焦、非空闲、非隐身的普通 HTTP(S) 已授权网站才计时；关闭侧栏不停止已开启的可信后台。
4. 可在「设置、分钟明细与数据管理」阅读收集范围后主动点击「开启」分钟明细。**只保存以后真正结算的分钟**，不会根据旧日汇总反推历史。关闭即删除已有分钟明细，不影响毫秒日汇总。
5. 在当前网站卡片或所选日期的网站列表修改分类；会重新计算保留期内的分类时长、重要时间、生产率和已存在的分钟色带，绝不重新计时。
6. 日期箭头查看历史日，「所选日期/近七天」切换排行；设置可调整空闲阈值、排除域名、汇总保留期，导出 JSON/CSV，暂停、撤权或清空。卸载会清理本工具本机数据，请先备份。

## 六分类与真实口径

| 类别 | 名称 | 颜色 | 象限 |
| --- | --- | --- | --- |
| 0 | 未分类 | #788494 | 独立 |
| 1 | 工作/生产 | #1976d2 | 重要且紧急 |
| 2 | 阅读学习 | #3b8ad9 | 重要不紧急 |
| 3 | 聊天/新闻 | #b64f4f | 紧急不重要 |
| 4 | 娱乐 | #ec5d5d | 不重要不紧急 |
| 5 | 生活 | #c8992d | 独立 |

默认未分类，分类仅由用户主动设置域名，不猜测网站用途。重要时间 = 1 + 2；生产率 = 重要毫秒数 / 当日全部记录毫秒数，**只在全部时长均已分类时显示百分比**；否则显示「—」并标明已分类覆盖率。分类是保留期内同一域名的当前属性；旧记录日毫秒不改变。七天分类与导出共用同一映射。

## 单行时间线与数据真实性

- Canvas 色带铺满内容宽度：00:00–24:00，1440 个本地分钟位置。鼠标、触摸、方向键、Home/End 可查看分钟；设备像素比和 ResizeObserver 重绘不改变坐标，狭窄布局减少中间刻度。
- 源数据仅来自原 trusted time.review 结算：30 秒 checkpoint，最长 45 秒确认间隔；失焦、空闲、长睡眠、跨浏览器 Session、撤权均保守排除，毫秒统计独立保留。
- 同一分钟多站点时以**实际毫秒时长最多的分类**表示主色，详情提示多个网站并显示实际毫秒合计。灰色未分类是已经发生的活动，浅底/无数据不是未分类。
- 没有历史分钟数据时，只能显示诚实的空状态；同一天已有汇总但部分才开启分钟采样时显示「部分明细」，其他空白不代表未访问。
- 23/25 小时夏令时日期、历史时区偏移不匹配或同日本地时区发生变化时，无法用普通 1440 槽展示准确分钟，保留日汇总并显示原因。
- 明细只存本机日期、域名、分钟序号、毫秒、时区偏移及授权标志。最多保存 90 天、每天 2000 条域名分钟条目；超限保留日汇总并标记部分。**不保存**标题、URL 路径/查询参数、Cookie、搜索词、正文或 Token，不上传。

## 存储、兼容与导出

沿用 opendesk.time-review.v1 的版本 1 日汇总，添加可选 categories / minuteConsent / minuteDays 字段；旧记录无明细、默认不开启新增采样。固定服务新操作 time.classify、time.day、time.minuteConsent 都经过原工具安装身份/包哈希、sender/documentId、Authority 与撤权代际校验。不新增安装器、RPC、时间采集器或动态 JS。

JSON 导出继续包含原汇总与设置，另包含分类和已保存的分钟数据。CSV 在原有日期/域名/毫秒/秒数据基础上增加 category 列。下载请求成功不等于实际文件落盘，请检查 Chrome 下载记录。清空操作删除汇总、域名分类、分钟数据，保留偏好设置。更新包会使旧包的计时授权失效，新包需重新明确开始。

## 构建与验收（必须在实际仓库执行）

- node --test tests/environment/time-review-r12.test.mjs tests/environment/time-review-r13.test.mjs
- npm run build:sidebar-tool -- examples/sidebar-tools/time-review
- npm run check
- npm run build
- npm run build:dev
- npm run verify

包输出目标：artifacts/sidebar-tools/time-review/1.3.0/time-review.opendesk-tool.json。必须额外在真实 Mac Chrome 和 320/360/400/600px、200% 缩放完成同包 UI、权限、分类、下载落盘、恢复、撤权、卸载验收。旧候选/原型图不能替代。具体证据与状态见 docs/framework/workstreams/time-review-r13.md。
