# Time Review R1.2 · 源码对齐交互原型

> 更新时间：2026-10-11。**本目录是静态 HTML 原型，不是实际安装的 Side Panel 工具。**
> 原型不调用后端、不采集网页、不保存 Token、不修改浏览器设置；示例状态和数值均为演示。


> **当前推荐：[Canvas V2 六分类与 24 小时分钟碎片](time-review-r12-canvas-v2.html)**。保留 [六分类 V1](time-review-r12-six-category-review.html) 及之前版本，不覆盖历史 HTML。[Canvas 技术与独立 Chromium 测试说明](canvas-v2-design-notes.md)；[旧版业务数据口径](legacy-six-category-data-map.md)。

## 文件与预览

- [Canvas V2（推荐）](time-review-r12-canvas-v2.html)：保留 1440 分钟 Canvas 时间密度绘图，窄侧栏拆为两个 12 小时行；顶部卡片与四象限+生活/未分类更紧凑，支持指向和键盘定位、分类改动重算。详见 [说明与验收记录](canvas-v2-design-notes.md)。
- [六分类 V1 历史原型](time-review-r12-six-category-review.html)：上一版设计基线，补回旧版四象限、生活与未分类、生产率、时间线、网站分类修改及钻取明细；真正数据接口仍待迁移。
- [R1.2 原始原型](time-review-r12-preview.html)：保留此前的第一版界面，便于对比和回退。
- [R1.2 源码字段对齐历史原型](time-review-r12-source-aligned.html)：早期设计。以原版确有的字段为依据，拆分记录、同步、专注三种状态；设置放到工具详情；无汇总 API 时默认展示 `—`。
- 四个 HTML 均为独立文档，下载后可在浏览器离线打开；所有交互仅修改原型中的显示状态。

## 核心数据与界面映射

| 历史来源 | 已核实的数据、逻辑 | 新版交互设计 | 实装条件 |
| --- | --- | --- | --- |
| `TimeReview.ts` / `ActionItem` | `path`、`title`、`action`、`timestamp`、`duration`、`createTime`、`app`；可选 `userId`、`ext` | 浏览记录状态、辅助信息；不将原始事件列表常驻首屏 | 可信 MV3 后台归并事件并建立只读状态接口 |
| `detect_focus.js` | `focus`、`click`、`keydown`、`mousemove`；历史 250ms 节流 | 用户看到活动记录状态，不看每次鼠标事件 | 决定最小化采集与闲置处理，不能逐行复制旧注入脚本 |
| `TimeReview.initData` | `token` 优先于 `apikey`，`GET /app/todo/action/config` 返回时序索引与精度 | 账号状态与连接入口 | 账号凭据仅由可信宿主管理，不经过沙箱 |
| `TimeReview.httpSend` / `validate` | `POST /app/todo/action/add`、`GET /app/common/apikey/validate` | 单独显示同步状态、错误、最近**确认**时间 | 获取可信上传回执；原型日期是演示值 |
| `localStorage.action` | 历史单条待发缓存与启动补送 | 同步失败时显示“需要核对”，不虚报待同步条数 | 持久队列、幂等/去重、重启恢复、错误审计 |
| `background.ts`、`my-content-script.ts` | `blackList`、`focusState`、`minuMax`、`duration_YYYY-MM-DD`；站点限时与通知 | “专注管理”独立入口及开关 | 可信后台适配 MV3，独立权限、时钟与恢复 |
| 旧版页面地址片段 | `#/todo/time-review`、`/todo/focus` | 仅显示“报告”“专注规则”两个候选业务入口 | 确认当前发行网站、具体路由和权限后再实现真实跳转 |

`createTime` 是历史代码按本地事件时间与服务器下发索引构造的上传记录时间，**不是服务端回执时间**。

## 当前未证实、不得宣称已交付

- 旧版 **`TimeReview.ts` 后台采集类本身**未提供时间统计读取 API；但已经在原项目 Vue 前端确认 `action.days({day,getType:1,page:1,size:9999})` 和 `actionConfig.add({path,type})`。这**不是** OpenDesk Browser 当前已经接入的合同。旧版原型的时间数字仍仅用于演示，新推荐方案请看 Canvas V2。
- 单条 `localStorage.action` 不能证明待发条数、幂等上传或最近成功时间。
- `focusState` 控制的是历史**专注规则**，不等于浏览记录总开关；新版“记录浏览活动”属于有待实现的独立产品能力。
- 历史 URL 过滤可能保留敏感查询参数或搜索词，现代版本应按隐私最小化设计；旧版大范围网页注入不能视作新扩展的授权依据。
- 历史 `setInterval`、MV2 事件/请求监视方式不能直接视为适配 MV3 Service Worker。
- 没有证据证明原型本身已接入扩展、后端或用户浏览数据。**不能因为界面按钮可点击就将功能标为已实现。**

## 源码证据

- [历史 TimeReview.ts](../../docs/contracts/source-snapshots/todo-src-bex/src-bex/TimeReview.ts)
- [历史 background.ts](../../docs/contracts/source-snapshots/todo-src-bex/src-bex/background.ts)
- [历史 detect_focus.js](../../docs/contracts/source-snapshots/todo-src-bex/src-bex/assets/js/detect_focus.js)
- [历史 my-content-script.ts](../../docs/contracts/source-snapshots/todo-src-bex/src-bex/my-content-script.ts)
- [Side Panel 工具开发合同](../../docs/api/sidebar-tool-development.zh-CN.md)
- [官方工具目录](../../official-tools/catalog.json)（截至本次核查，未登记 Time Review）

## 后续实施与验收

- [ ] 对齐当前可信 Side Panel 工具安装器、Catalog、权限和已有 UI 样式，而非新增第二套安装系统。
- [ ] 实施可信 MV3 后台活动追踪服务，记录、账号连接、同步和专注互相独立；保证关闭 Side Panel 不影响受信后台的正确性。
- [ ] 实现可靠上传队列、跨日/时区、锁屏、空闲、重启、离线与重复上报测试；保护敏感 URL。
- [ ] 明确产品是否提供报告读取接口；有才显示真实统计数值，没则继续跳转原始报告。
- [ ] 核实外部业务 URL 后开放跳转；未经验证的配置路由不应出现在产品操作区。
- [ ] 验收 360 / 400 / 600px 和缩放；完成真实 Mac Chrome、MV3 重启/暂停、撤权与失败恢复。
- [ ] UI 方案评分与正式交付评分分开记录；原型通过浏览器脚本演示不能替代扩展验收。

## 原型检查记录

对**优化版独立 HTML**执行过 headless Chromium DOM 交互检查：四种演示状态中的同步失败、记录开关、设置返回、独立专注开关、模拟统计切换和工具列表返回，并检查 360、400、600、1100px 的页面水平溢出。该检查不涉及扩展装载和后端网络请求。