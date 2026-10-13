# Time Review · 时间回顾 R1.5（Canvas V3 / 站点独立授权）

正式界面基准：prototypes/time-review-r12/time-review-r12-canvas-v3-single-track.html。正式 Side Panel 工具只采用单条 24h Canvas、紧凑四象限/生活/未分类和卡片视觉，不采用原型的浏览器外壳、样例时间、模拟同步或账号设置。

## 安装、更新与使用

Time Review 仍是 opendesk.sidebar-tool.v1，ID 始终是 time-review，能力为 time.review + user.export。R1.3 新增了可信后台接口，所以**需要含 R1.3 后台的 OpenDesk Browser 扩展**；只把新 UI 导入旧扩展无法正常读取分钟详情。

1. Side Panel → 工具 → 发现工具（或应用市场）→ Time Review → 安装/更新，审阅权限。不能新建相同 ID 的平行工具。
2. 在工具详情的受信任设置区，**先单独授权 Time Review 可统计的指定 HTTP(S) 网站**（明确看到 Origin 后二次确认）；需要统计所有普通网站时，另外点击「授权全部普通网站…」并明确确认。OpenDesk 主扩展即使有 `<all_urls>`，也不会自动产生本工具的授权。单独授权不会开始计时。
3. 用户本人授权 Chrome 空闲检测；此权限与 Time Review 的网站范围独立检查，两者不能互相替代。
4. 在已安装的工具**详情设置**中主动点击「开始／恢复记录」；沙箱界面的「开始记录」只会带你前往该受信任入口，不会绕过用户授权。只有聚焦、非空闲、非隐身的普通 HTTP(S) 已授权网站才计时；关闭侧栏不停止已开启的可信后台。
5. 在工具内「设置、分钟明细与数据管理」选择开启时，只会打开扩展受信任的工具详情设置区，必须在那里由用户本人点击「开启分钟明细」才会真正生效。**只保存以后真正结算的分钟**，不会根据旧日汇总反推历史。关闭必须经过受信任的工具详情设置区页面内确认，届时删除已有分钟明细，不影响毫秒日汇总。
6. 在当前网站卡片或所选日期的网站列表修改分类；会重新计算保留期内的分类时长、重要时间、生产率和已存在的分钟色带，绝不重新计时。
7. 日期箭头查看历史日，「所选日期/近七天」切换排行；设置可调整空闲阈值、排除域名、汇总保留期，导出 JSON/CSV，暂停与撤权；清空全部记录需在受信任设置区完成一次页面内二次确认。卸载会清理本工具本机数据，请先备份。

## 六分类与真实口径

| 类别 | 名称 | 颜色 | 象限 |
| --- | --- | --- | --- |
| 0 | 未分类 | #788494 | 独立 |
| 1 | 重要且紧急 | #1976d2 | 重要且紧急 |
| 2 | 重要不紧急 | #3b8ad9 | 重要不紧急 |
| 3 | 紧急不重要 | #b64f4f | 紧急不重要 |
| 4 | 不重要不紧急 | #ec5d5d | 不重要不紧急 |
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

JSON 导出继续包含原汇总与设置，另包含分类和已保存的分钟数据。CSV 保持原有 date,website,milliseconds,seconds 四列顺序，只在末尾追加 category 列。JSON 实际文件名为 `time-review.json`，CSV 为 `time-review.csv`；同名重复下载由 Chrome 生成如 `time-review (1).json` / `time-review (1).csv`，不直接覆盖既有文件。工具只提示「已请求下载」，下载完成或中断仍以 Chrome 下载记录和实际文件为准。清空操作删除汇总、域名分类、分钟数据，保留偏好设置。更新包会使旧包的计时授权失效，新包需重新明确开始。

## 构建与验收（必须在实际仓库执行）

- node --test tests/environment/time-review-r12.test.mjs tests/environment/time-review-r13.test.mjs
- npm run build:sidebar-tool -- examples/sidebar-tools/time-review
- npm run check
- npm run build
- npm run build:dev
- npm run verify

包输出目标：`artifacts/sidebar-tools/time-review/<当前 tool.config.json 版本>/time-review.opendesk-tool.json`（2026-10-12 为 `1.3.1`，不要硬编码旧版）。必须额外在真实 Mac Chrome 和 320/360/400/600px、200% 缩放完成同包 UI、权限、分类、下载落盘、恢复、撤权、卸载验收。旧候选/原型图不能替代。具体证据与状态见 docs/framework/workstreams/time-review-r13.md。

Mac Chrome 155 对 Time Review 1.3.1 的真实内容导出、同名文件防覆盖、暂停状态下完整 Chrome 重启的证据为 [Actions 38222319502](https://github.com/shopable-ai/opendesk-browser/actions/runs/38222319502)，绑定源码 SHA `f4719da31a876fc4f82b6b0658176fd2693c4a26`。分类编辑、工具启停/卸载和 200% 真正缩放以各自独立的后续验证为准，不能引用该任务替代尚未执行的验收。

## R1.4 · 旧版蒸馏与可选云同步边界

旧 `src-bex` 的全站鼠标/键盘监听、最长网页分钟归属和原始 POST 不会重新注入本工具。迁移矩阵与隐私缺陷详见 [LEGACY-DISTILLATION.zh-CN.md](LEGACY-DISTILLATION.zh-CN.md)。R1.4 的同步队列和 HTTPS 幂等协议当前仅为本地准备模块及隔离测试，**未连接生产服务器，也不会上传任何本机历史记录**；尚无可展示的云同步登录/开启按钮。日汇总、六分类、Canvas V3、导出仍以已验收的 R1.3.1 本地产品为准。

专项测试：`node --test tests/environment/time-review-r14-sync-outbox.test.mjs`。工作流状态见 [time-review-r14.md](../../../docs/framework/workstreams/time-review-r14.md)；只有服务端确认幂等契约、可信连接/权限以及实际 Chrome/HTTPS 验收后才可开放可选云同步。

## R1.5 站点授权与 Host 能力合同（2026-10-13）

- 新增的 Time Review 专属站点授权写在既有 `chrome.storage.local['opendesk.time-review.v1'].siteGrants`：`{allSites:false, origins:[]}`。未出现字段的旧 v1 数据默认**拒绝采集**；不凭主扩展全局权限或既有旧计时授权补发全部网站授权。原有日汇总、六分类与分钟数据照常读取、导出。
- 指定网站以**精确 HTTP(S) Origin** 授权（含协议与非默认端口、最多 64 个），不自动涵盖其他协议、子域名或端口。全部普通网站需额外二次确认。Chrome 网站权限、idle、前台普通窗口、工具已安装/启用、固定包摘要与撤权代际同时有效，才能建立新检查点。
- 在「工具详情 → 设置」可逐项撤销已授权网站，或点击「撤销全部网站授权」。最后一个授权被撤销后计时自动暂停，旧合法时间汇总保留。网页已切换时原授权确认失效，防止误授权不同网站。
- Time Review 前端的「开始记录」与「分钟明细」不会直接执行敏感授权，只引导到受信任宿主。Host API 标记 `time.review/1.5.0`：1.5 工具前端发现旧 Host 时禁用开始按钮、提示升级主扩展，避免新 UI 误用不兼容后台。更新 Time Review 包导致旧 `authorizedHash` 失配；原站点范围不自动扩大，用户需再次明确开始。停用、权限移除及卸载应立即失去业务授权。
- 此工具仅统计**浏览器前台非空闲、合法授权且被 Chrome 原生事件观察到的网页曝光时间**，不是能证明眼睛正在关注页面的“真实注意力”。静态阅读和长视频的空白/断点按最多 45 秒检查点限制保守处理，不推造观看时间。不启用旧键鼠全站注入。
- 暂停保留汇总；卸载会依正式工具安装器的清理机制删除本工具独立的本机数据，先导出备份。重新安装不继承之前的网站授权。
- 可选云同步仍仅有独立的本机准备队列和 HTTPS 适配器；没有经验证的生产账号、幂等服务器 ACK 和原生对账，**默认本地、不登录、不上传**，故不显示虚假的同步开关。

专项回归：`node --test tests/environment/time-review-r12.test.mjs tests/environment/time-review-r13-service.test.mjs tests/environment/time-review-r13-consent.test.mjs tests/environment/time-review-r15-site-grants.test.mjs`。当前候选的 Node、构建、真实 Mac Chrome 结论以及 Git SHA 应以 [R1.5 工作流](../../../docs/framework/workstreams/time-review-r15.md) 中绑定的结果为准；历史 R1.3/R1.4 通过不自动迁移为新包 PASS。
