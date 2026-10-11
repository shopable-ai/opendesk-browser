# Time Review · 时间回顾 R1.2

本机网站时长回顾。只保存域名、本地日期和毫秒汇总，不保存标题、路径、查询参数、搜索词或 Token，不登录、不上传。旧版时间清单网站是详情操作区的独立外部入口，不同步本机记录。

## 安装和使用

首次使用需加载包含 Time Review 后台服务的 OpenDesk 扩展（`dist/production`）；只有旧扩展时，单独导入工具 UI 无法添加后台服务或 Chrome 权限。

1. 打开 OpenDesk Side Panel →「工具」→「发现」，找到「Time Review · 时间回顾」，点击安装，审阅 `time.review` 和 `user.export` 后确认。也可从应用市场详情页审阅安装。
2. 在「我的工具」打开详情，进入齿轮「设置」，点击「授权空闲检测」，批准 Chrome 权限提示。授权本身不开始计时。
3. 主动打开工具，点击「开始记录」。浏览普通 HTTP(S) 网页；回到工具点击刷新可看今日、七天和网站排行。关闭工具后已开启的后台继续记录。
4. 「暂停」保留统计；「恢复记录」重新开始。「停止并撤销时间授权」清除本工具授权；详情设置还可撤销 Chrome 空闲检测权限。
5. 「设置与数据」可设空闲阈值、保留天数、排除域名（包括其子域），导出 JSON/CSV 或二次确认清空。下载请求后以 Chrome 下载记录和实际文件为准。
6. 卸载工具会停止计时并清理本机统计，请先导出。重新安装默认暂停，旧实例和授权不会恢复。停用保留统计，恢复启用后需重新开始记录。

## 计时语义

只有浏览器普通窗口聚焦、系统状态 active、当前标签为可访问 HTTP(S) 网页时计时；隐身、锁屏、失焦、受限页面和排除域名不计。达到空闲阈值后停止；阈值前静止阅读仍计入。

Chrome alarms 每 30 秒持久化检查点，标签/URL/窗口/空闲/授权变化也触发结算。保存单位始终是毫秒，本地午夜拆分。SW 恢复仅接续同浏览器 session、同活动目标且不超过 45 秒的间隔；浏览器重启、休眠、长延迟、时间回拨或时区变化无法确认活动时保守排除，界面展示排除时长。跨日期与故障注入以组件证据单独标明，不由 Mock 推断真实 Chrome PASS。

## 独立工具 UI 更新

```sh
npm run build:sidebar-tool -- examples/sidebar-tools/time-review
```

生成 `artifacts/sidebar-tools/time-review/1.2.0/time-review.opendesk-tool.json`；通过现有「＋ 导入」审阅更新，升级时使用新三段版本。纯 UI 可独立更新；后台服务/Chrome 权限/可信宿主变化才需要重编扩展。官方内置资源由 `scripts/build-official-tools.mjs` 生成。包更新保留统计，撤销旧包计时授权，新包需明确重新开始。

开发与测试见 `src/time-review/`、`tests/environment/time-review-r12.test.mjs` 和 `docs/framework/workstreams/time-review-r12-01a12b0d.md`。
