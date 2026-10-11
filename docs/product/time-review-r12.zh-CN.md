# Time Review R1.2

可选官方 Side Panel 工具，使用既有官方目录和安装器。今日、七天、网站排行、暂停恢复、域名排除、空闲阈值、保留期限、本机 JSON/CSV 导出及确认清空均由已安装工具操作。详情设置单独申请 Chrome 空闲检测权限；安装和授权本身不启动追踪。

后台是独立的 MV3 固定模块 `time-review/time-review-host.js`，以 Chrome alarms 和真实 tabs/windows/idle/permissions 事件结算，仅存域名、日期和毫秒。不存在页面活动遥测、账号、旧登录、远程配置、HTTP 上传或旧 `hid_*` 消息入口。工具关闭后已开启的后台继续；停用、撤权、包身份变化和卸载保守停止。

旧源码复用活动汇总、暂停和跨日拆分意图。旧版 minute-dominant 抽样、axios 全局配置、缓存网络补发、未销毁定时器和跨日错误未迁入。旧 `https://todo6.com/` 入口经本轮 HTTPS 200 与页面标题确认，只在工具详情操作区独立打开。没有推断或加入未经证实的线上 `/todo/time-review` 地址。

休眠、长延迟、时区变化和跨浏览器 session 的不确定间隔排除并显示；此版本不是无损全天活动监控。每 30 秒持久化、45 秒上限；真实 Browser API 和时钟证据与组件故障注入分别登记。

操作步骤与独立 UI 包更新见 [工具说明](../../examples/sidebar-tools/time-review/README.zh-CN.md)。真实安装、原生输入、下载落盘及恢复的当前状态，以 [本轮工作流](../framework/workstreams/time-review-r12-01a12b0d.md) 与绑定 packageHash 的原始证据为准。


## R5.1 受信任详情页内操作，无 JavaScript 确认弹窗（2026-10-11）

- 工具内“开始记录”“清空记录”只引导到详情设置，不直接执行持续追踪或删除数据。不能把工具沙箱生成的消息当作用户真实点击。
- 扩展受信任设置区提供“开始／恢复记录”（明确点击后直接执行，无网页模态框）和“清空时间统计…”（打开页面内可取消确认，不弹 `confirm()`）。
- 扩展后台仍检查 Time Review 安装身份、`time.review` 能力、工具启停、精确安装代际、唯一宿主文档、Chrome `idle` 授权和真实网站访问权限；缺失则拒绝。
- `chrome.permissions.request({permissions:['idle']})` 仍仅在用户明确点击“授权空闲检测”时调用；Chrome 原生权限对话框无法替代或自动跳过。
- 清空动作的 `{confirm:true}` 只能由受信任宿主的“确认清空全部记录”按钮产生，且发生写入前仍由后台再次核验。
