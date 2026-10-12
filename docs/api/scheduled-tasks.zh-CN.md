# OpenDesk Browser：使用定时计划

> 2026-10-12。R1 源码实施；真实 Mac Chrome 安装验收仍需以独立证据为准。本说明描述应有的正式插件操作，不代表所有原生情形已经通过验收。

## 先准备任务

定时计划的执行来源只能是**已安装、已启用、完成本机页面效果验证的 Controller Task v1**，不是未保存的 JS 草稿，也不是 Page USER_SCRIPT 或纯展示类工具。

1. 打开 Chrome 中的目标网页，例如先启动 `python3 -m http.server 43111 --bind 127.0.0.1 --directory examples/tasks`，访问 `http://127.0.0.1:43111/demo-form.html`。
2. 在 Side Panel「开发」编辑或导入 Controller JS，用户函数推荐 `async function main()` 或项目 ESM `export default async function main()`，可直接使用受控 `page`、`params`。
3. 在真实页面明确运行，取得原 Run/Result 和可靠 Native 页面效果回执；按已有流程创建候选、验证、设为本地可用、批准网站权限，并安装固定版本。仅保存文件或运行结果显示成功不等于完成安装授权。
4. 打开 Side Panel「我的」，确认已安装任务可查看版本与网站范围。

## 创建第一个定时计划

1. 在「我的」的「自动化任务」右侧点击时钟图标「定时计划」。
2. 选择「＋ 新建计划」，填入计划名称。
3. 在「执行任务」下拉框选择已安装的可信任务。右侧两枚并排纯图标分别是「新建脚本」和「管理任务」，不在下拉框内出现管理选项。
4. 输入精确的 HTTP(S) 目标 URL，必须属于该任务批准的网站来源；任务参数按 JSON 对象填写，例如 `{}`。
5. 选择「执行一次」「每天」「每周」或「每隔一段时间」，使用 IANA 时区（例如 `Asia/Tokyo`）并查看下次预计时间。
6. 高级选项可以允许本次打开目标网页；默认没有目标页面时等待。错过触发默认为跳过，也可选择仅补最近一小时内的最后一次。默认执行前等待最多五分钟。
7. 点击「保存计划」。卡片将显示下次触发、暂停/恢复、编辑、删除和历史运行状态。

## 关闭 Side Panel 后继续执行

打开「定时计划」中的「打开运行页 ↗」，Chrome 会打开一张**可见的 OpenDesk 扩展标签页**，它与 Side Panel 使用同一个受信任的 RunHost 和唯一全局执行槽。只要至少一个合格运行宿主仍在，Chrome 正在运行，且任务授权、目标及版本仍有效，到期实例才可以被正式 Controller 准入。

关闭唯一运行宿主时，页面 DOM 任务不能由 MV3 Service Worker 独自执行；计划会记录等待或错过。重新打开可见运行页后，按选定错过策略处理。关闭整个浏览器、电脑休眠和扩展被停止期间，Chrome Alarms 不保证按时运行或唤醒电脑。

## 任务管理与权限

在「执行任务」下拉框右侧点击清单图标进入任务管理，可以搜索、按启用状态筛选、查看版本及授权网站、设置定时、复制到开发、启停和卸载。卸载使用页面内确认，不调用原生 JavaScript `confirm`。

已停用、卸载、变更固定版本或撤销网站权限的任务，不会被直接再次排程执行；原计划和已有历史仍可供排查。编辑安装源码应复制到开发并重新验证安装，不能静默替换正在执行的固定版本。

## 如何辨别真实执行成功

- **闹钟响了、持久 FireId 创建：** 只说明计划已到期。
- **获得 RunId：** 只说明在原 `runs/@slot` 获得过正式准入。
- **真实成功：** 需要原 `Run/Result` 一致的 `runId/resultId`、`state=completed`、可靠页面 Native 回执，以及 `retirementState=released`，并实际观察到网页动作。
- **等待/未知：** 无宿主、目标不存在、执行槽占用、权限撤销或 Worker 中断，都可能造成等待、失败或 `UNKNOWN`。未知副作用不做自动重试。

R1 源码实现与未测项：[`scheduled-tasks-r1-20261012.md`](../framework/workstreams/scheduled-tasks-r1-20261012.md)。交互基准：[`scheduled-tasks-r1-preview.html`](../../examples/ui/scheduled-tasks-r1-preview.html)。
