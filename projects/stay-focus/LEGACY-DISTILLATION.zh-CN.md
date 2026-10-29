# 旧版 Stay Focus 功能蒸馏（只读）

原始仓库：`shopable-ai/todo-user`，旧 `src-bex` 实现。没有原样复制旧源码。

| 旧符号 | 旧调用与问题 | Stay Focus R1 对应 |
|---|---|---|
| `blackList`, `hasBlack` | `my-content-script.ts:27–32` 从存储读取清单，对完整 URL 用 `url.includes(i)` 命中，存在同名查询/恶意后缀误匹配 | `policy.focusHost/hostnameMatches` + `rule-host.focusRuleForSite` 的 hostname/DNR 主框架条件 |
| `doBlackCounter` | `my-content-script.ts:43–73` 请求后台剩余时长并在页面开多个提醒/跳转定时器 | `service.reconcileLocked` 只计算可信前台检查点；超限写入 Chrome 原生 DNR |
| `startCounter`, `duration_${day}` | `background.ts:865–878` 每秒 `setInterval` 修改持久秒数，可能与 idle、休眠和多标签冲突 | `model.settleFocus` 每次只有一个 pool 检查点，上限 45 秒和 Chrome alarms |
| `minuMax` | `background.ts:888–895` 单一默认 10 分钟、覆盖全站 | 每网站分钟额度与共享额度组 |
| `focusState` | `my-content-script.ts:37,64` 和 `background.ts:957` 全局开关与内容脚本通信 | 工具独立安装、启停、宿主本机权限、epoch，未授权默认不运行 |
| `getRedirectUrl` | `background.ts:880–885` 可配置外部跳转网址 | 无跨站跳转，仅内置 `blocked-*.html` |
| `check2End` | `background.ts:930–942` 从窗口中含任意匹配 URL 判断是否继续秒级扣时 | Chrome 聚焦 window + 唯一 active tab + idle/locked + checkpoint 验证 |
| 弹出提醒 | 内容脚本在任意站点执行通知与多组 timeout | 固定可信扩展说明页，无全站脚本注入 |

## 竞品功能参考（不复制源代码）

- [StayFocusd](https://www.stayfocusd.com/)：每日娱乐额度与网站限制，优先蒸馏“用完就限制”的清晰体验。
- [LeechBlock NG](https://github.com/proginosko/LeechBlockNG-chrome)：网站分组与工作时间窗口参考；须遵循其独立许可证，不移植源码。
- [BlockSite](https://blocksite.co/)：拦截说明及设置的 UX 参考，不需要其服务器功能。

Chrome MV3 官方约束参考：[declarativeNetRequest](https://developer.chrome.com/docs/extensions/reference/api/declarativeNetRequest)、
[permissions](https://developer.chrome.com/docs/extensions/reference/api/permissions)、
[alarms](https://developer.chrome.com/docs/extensions/reference/api/alarms)。

与 Time Review 只复用底层 Chrome API 与既有授权宿主模式；不能使用其本地统计记录或共享隐式授权。
