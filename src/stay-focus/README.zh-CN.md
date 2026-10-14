# Stay Focus 的预编译业务与受控接入

本目录属于现有 Side Panel「工具」中的 Stay Focus 产品。这里的代码由扩展固定构建入口编译，不来自可安装动态工具包；不构成另一套 Runtime、Host、安装器或授权系统。

正式工具界面源在 [`examples/sidebar-tools/stay-focus`](../../examples/sidebar-tools/stay-focus/README.zh-CN.md)。该路径由官方目录精确登记，三文件 UI 被序列化进 v1 包，在既有 opaque-origin iframe 中执行。它只通过 `OpenDeskTool.request` 请求平台操作，不能执行此目录的 Chrome 适配代码。官方身份、相同 toolId 或 capability 字符串均不能把动态代码提权。

| 文件 | 归属与职责 |
| --- | --- |
| `catalog.js` | 固定网站分类、默认共享组与额度；业务数据，不是工具发现目录。 |
| `model.js` | 策略校验、网站匹配、共享额度、时段/白名单/专注决策、保守前台结算、摘要与提醒阈值。无 Chrome 执行权限。 |
| `policy.js` | 产品协议、能力、私有存储/Alarm/session/规则范围、包摘要与域名/日期规则。ID、键和已安装 Revision 不随整理变化。 |
| `service.js` | 既有 SW 中的受控业务服务：独立验证真实宿主 document/context、安装包/hash/epoch、启停和 Chrome 权限；观察活动、持久化、Alarm、DNR、页面提醒和事件撤销。 |
| `rule-host.js` | 把业务限制原因转换为固定主框架 DNR 规则，处理父/子域名例外。 |
| `rule-ownership.js` | 仅操作 730000–730199，自有规则写入及实际读回对账；不吞掉失败，不碰别的工具规则。 |
| `tool-host.js` | 已有第一方 sidecar 的请求适配：Focus 专用审批文案、禁止 sandbox 发起授权/清空、包/hash/epoch 校验、发送与返回状态。平台传入原 iframe 会话和活动实例校验。 |
| `host-controls.js` | 可信详情中的原生权限、启用/停用/清空控件；真实 click 内直接请求 Chrome 权限。既有 UI 与 DOM ID 保留。 |
| `lifecycle.js` | 既有安装事务的静态产品适配：停用清理自有规则；确认卸载后清理私有状态。平台仍拥有锁、先停用、epoch、registry、删除读回、恢复日志及重装保护。 |
| `page-notice.js` | 经固定 page-relay 入口加载的页面提醒渲染/清理；只接受可信扩展消息，不暴露策略修改或动态授权。 |
| `blocked.js`、`blocked.css`、`blocked-{quota,schedule,session,always}.html` | 固定扩展拦截说明页及交互资源；由现有 WXT/资源闭包/WAR 审计构建，不是网站远程代码。 |

固定接线位于 `src/sw.js`、`src/entrypoints/stay-focus-controls.js`、`src/entrypoints/page-relay.js`、`src/entrypoints/blocked.js`。通用宿主 URL 校验位于 `src/sidebar-tools/sender.js`；它不是能力授权，不能替代服务中的 live document/安装身份检查。

开发/打包继续走现有工具和扩展构建流程。只改动态 UI 时打工具包；改本目录可信实现时构建和验证完整扩展。行为回归和真实 Chrome 的证据等级不同；本轮整理不会关闭完整额度耗尽、活跃 DNR 撤权或跨工具隔离的原生验收缺口。详细调用证据与回归见 [业务边界整理工作流](../../docs/framework/workstreams/stay-focus-boundary-r1-20261014.md)。
