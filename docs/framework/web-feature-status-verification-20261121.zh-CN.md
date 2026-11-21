# Chrome「允许用户脚本」关闭时的网页功能状态复验 · 2026-11-21

在 main 的持续开发环境验证了自由复制和鼠标手势的修复。两份候选经原安装审阅升级，并与各项目唯一正式 JSON 同源。独立 Page 的旧版误报已复现；修复通过源码和定向 Node 检查，因共享开发构建阻塞，尚未在新代码上原生复验。

使用 Chrome for Testing 155.0.8059.39 独立 Profile 验证真实 SIDE_PANEL 与 Chrome 权限。实际加载仓库 dist/development，扩展 ID 为 ccfcjegpkdlgbclopjmadlcjedelidmf。原生「调试 → 本地开发服务」首尾均显示「开发服务已连接」，应用 revision 均为 d4b949de99fad7c4c1a0ab04cd65442fdc1c8a25ddf215ed558bd926419f8a68，未显示安全重载等待原因。共享 watcher 在 tool-shell 构建阶段拒绝阅读目录的 projects/reading-toc/trusted/locales.generated.js：Trusted Reading TOC source changed; review and re-pin before fixed build。未更改 pin 或替换构建目录。已审阅的 Tool JSON 可以在这版宿主内单独升级。普通浏览器操作优先用 ego；此专项需要 Chrome 的扩展开关和原生侧栏。

| 已审阅安装的入口 | 确认的旧版缺陷 | 修复后隔离 Chrome 实测 |
| --- | --- | --- |
| 「扩展 → 导入 → 审阅 → 打开」自由复制；在同一已获准 localhost 页面切换「在当前网站启用」 | 0.1.1/r2 在开关关闭时保存成功并提示「在已授权网页上生效」；实际拖选为空，网页模块未挂载。 | 0.1.2/r3 在 OFF、站点访问仍获准时保存暂停后再开启。侧栏显示「设置已开启」及 Chrome 开启步骤，拖选为空。开启 Chrome 开关后，「网页功能设置」显示已开启；同一旧文档仍显示未确认及刷新建议，无法拖选。刷新后显示「已在当前网页生效」，实际选中「CSS 原文：蓝色山谷里有一条安静的小河。」。同一新文档保存站点暂停，侧栏确认，测试页重新禁止拖选。 |
| 「扩展 → 导入 → 审阅 → 打开」鼠标手势；在「兼容与显示」保存 Option/Alt + 左键 | 0.3.5/r9 只有设置保存回执和在获准网页上使用的说明；开关 OFF 时模块未挂载，侧栏未说明当前页仍不可用。ON 时在同站点无文字页下拖能滚到底。 | 0.3.6/r10 升级保留 Alt 偏好；OFF 时改选后保存回 Alt，侧栏分别确认保存并指向 Chrome 开关及「网页功能设置」。同站点长页从页首下拖，滚动 0 → 0，模块未挂载。ON 后新文档同动作 0 → 2601（页底），侧栏随后读回「设置已应用到当前网页」。同一文档保存总开关暂停，侧栏确认，动作 0 → 0。 |
| 「扩展 → 网页功能」下的「网页增强」筛选，打开经原审阅链安装的本地测试 Page | ON 时刷新出现 data-od-status-probe="mounted"。OFF、同一站点仍获准，新文档没有标记，详情初次仍报「自动运行条件已就绪」；执行「刷新扩展」以后只报「Chrome 注册受阻」。 | 打开已安装 Page 详情时重新读取 Authority；等待新读回时不显示旧就绪状态。明确收到 E_USER_SCRIPTS_UNAVAILABLE 时指向 Chrome 开关和原详情的刷新入口；授权暂停和停用优先显示。新构建未送达，原生修复后复验记为 NOT_TESTED。 |

两工具侧栏使用现有 page.request 刷新回执，将保存偏好与当前网页的状态分别展示。明确的站点限权或旧文档走各自提示；普通失败显示未确认；未知结果在当前面板不自动重放。网页业务、手势识别、默认触发值和 Authority 沿用原实现。版本写入编译脚本头部，因此每包晋升一个固定 Page Revision。Chrome OFF 时旧注册核验拒绝继续更新；在隔离 Profile 开启后经原审阅流程更新。与旧包对比，除脚本版本头外，Page 字节、身份、USER_SCRIPT 世界、顶层 HTTP(S) 规则及能力相同。

- 自由复制 [0.1.2/r3](../../projects/free-copy/free-copy.opendesk-tool.json) · SHA-256 921f58f836cc959c55c0d8e24bae5fd82c3f16a398be95be059137cd7bc6cffd。
- 鼠标手势 [0.3.6/r10](../../projects/mouse-gestures/mouse-gestures.opendesk-tool.json) · SHA-256 8f6cd6f7af00905ff52a359fc16f48380896a8800969de141939314d4ea1f8b4。
- 项目、安装延期、开关及 UI 的定向 Node 合计 225 通过、18 跳过；最后一次 Page UI 局部复验 71 通过、18 跳过。覆盖限权、旧文档、失败和未知回执的提示分支。语法、git diff --check 和两个 --check-project 通过。
- 补充诊断：较宽的 app-page-programs.test.mjs 有 44 项失败，主要报共享 Authority fixture 中 preview.beginInstalledAllocation is not a function，另有 cleanup 断言失败。未修改该 Authority 或 fixture。另六项 cleanup 投影断言用临时模型副本移除本轮状态分支后仍同样失败。自由复制已按原生成器更新跟踪的同源预览，并重新通过其测试。

本机原始证据在 artifacts/web-feature-status-20261121/。native.json 的证据事件：自由复制 candidate-copy-off-enabled、candidate-copy-old-document、candidate-copy-on、candidate-copy-paused；鼠标手势 candidate-gesture-off、candidate-gesture-on、candidate-gesture-on-confirmed、candidate-gesture-paused；独立 Page 的 baseline-page-on-confirmed、baseline-page-off-detail、baseline-page-off-refreshed。旧版手势 baseline-gesture-off-result 继承了刷新前的滚动位置，不用作动作证据；候选记录了动作起点和终点。Node 日志为 scoped-tests.log、page-ui-tests.log、affected-tests.log、baseline-parallel-tests.log。

Chrome 单独站点撤权、手势旧文档专项和默认右键与原生菜单未做原生复验；未知效果通过 Node 验证。没有安装或更改发行仍 blocked 的两个官方 AI Page。生产验收、全量矩阵和评分延期。上一轮阅读目录、队列和 22 项盘点见[已有记录](extension-web-loading-audit-20261121.zh-CN.md)。
