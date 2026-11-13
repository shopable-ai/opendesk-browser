# PC 七页当前候选结果

本轮完成源码与内存预览的七页视觉对照及必要交互；不是原生安装或发布验收。唯一参考 `preview/preview.html` 未修改，SHA256 为 `277ff8df72970906370507e9d7448da3ba583cb293536cae874c1a034080a977`。

最终候选 HTML SHA256 为 `e63734281037aab0cbf15b390b5ce4f693f9e165fe9d6b832b6c97e54ba40939`，位于本机 `.opendesk-preview/source-98024ff9-11b2-43ef-9b77-6d5c57551e26/preview.html`。冻结以 `e305e0a4a9d8e47b2637ec21ad9144dfc87ff212` 为基线，95 项输入实读无漂移、67 项可信锁匹配；完整输入清单见 [candidate-manifest.json](final/candidate-manifest.json)。预览为真实组件加内存 SDK 边界，不使用真实存储、Chrome 代理或网络请求。

两位独立视觉评审均查看七页的 viewport/lower 对照，共28张。诊断截图最初保留了驱动悬停与旧合成帧；移开指针并等待绘制后，替换两张候选诊断图及一张参考诊断图，两位分别补查变化并核对哈希。未改产品 hover 或选择逻辑。人工四维评分不是像素相似率，完整评分见 [round6-review.json](round6-review.json)。

| 页面 | Darwin | Noether | 两位评审最低单项 |
| --- | ---: | ---: | ---: |
| 代理配置 | 96.75 | 96.75 | 96 |
| 网站规则 | 96.50 | 96.75 | 96 |
| 订阅管理 | 96.25 | 96.75 | 95 |
| 导入备份 | 96.75 | 96.25 | 95 |
| 网络诊断 | 96.50 | 96.75 | 96 |
| 通用设置 | 96.00 | 96.50 | 95 |
| 官方网络 | 96.75 | 97.75 | 96 |
| 整体 | 96.50 | 96.79 | 95 |

每位评审的每页布局、控件、文案／交互提示、视觉一致性均不低于95。残留小幅纵向位置、控件边框和色调差异保留记录，不宣称逐像素一致。真实保存／应用分离、能力未接入及未验证状态没有被替换为参考中的模拟成功。

本轮修复默认路由的可访问名称、返回按钮真实目的地和收藏旧回调跨环境写入；收藏新增 effect 重启与环境替换回归。Wegener 独立实现复审安全与交互均96，局部结论 COMMENT、无必须修复的残留产品问题，见 [implementation-review.json](final/implementation-review.json)。

验证范围与结果：

- 114 项相关 Node 检查通过，另有2项 CSS 来源闭包检查通过。业务 JS 最后一次修改后执行；最后仅管理 CSS 修订，经解析、可信锁校验和浏览器验证，没有重复全量测试。
- 同候选17步语义键盘交互通过：收藏、保存选择、取消添加、本地规则计算、来源详情／本地客户端、备份解析、草稿确认、中英切换与偏好重开、官方说明及五个诊断页签。最终回执为 `save=1 / reviews=0 / apply=0 / stop=0`，见 [final-interactions.json](final/final-interactions.json)。
- 等待绘制后的偏好截图确认蓝色开启开关及简体中文在重开后保留，属于内存会话证据。
- 语法／CSS解析、三语键集合、可信源码锁、参考与正式包未变化均已核对。项目无独立 tsconfig/typecheck 脚本，本轮没有语义类型诊断。

完整 pointer 路径仍 **NOT_TESTED**。驱动曾未触发导航，精确 CDP 点击 Profiles 到达预期，但随后 General 坐标及一次键盘重试未达预期，原因未定性；这些尝试不提升为通过，也不足以证明产品缺陷。已通过的17步键盘结果独立保留。见 [驱动及证据限制](final/preference-and-pointer-notes.json)。

当前候选 native、真实存储/CAS与权限、真实 APPLY/STOP、代理流量、认证／任意 PAC／在线订阅、production、全 CI、压力测试及正式 JSON 晋升／安装均 **NOT_TESTED／延期**。旧原生 revision 的导航证据不覆盖此候选。唯一正式 JSON 仍0.3.22且 SHA256 为 `bef2aa2106c2d8b53b8f6d732d0675068486bdb023f8489720383feca5869b3e`；安装版本上次观察为0.3.17。

最终仅保留本轮必要对照、交互快照、日志与哈希索引于 [final/](final/)。`browser-capture.mjs` 与 `browser-interactions.mjs` 记录当时 TaskSpace22／端口43263的执行，重现时先按 ego-browser Skill 分配本任务空间、替换本机资源绑定。新冻结使用原 `stage-preview.mjs --current-sources --view settings`，不得覆盖唯一参考 HTML，不将内存证据当作安装证据。保留其他项目改动、现有服务与 watcher，不推送。
