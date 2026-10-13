# Scheduled Tasks R2.6 · 生产 UX 收敛与验收边界

日期：2026-10-13。唯一可写分支：`main`。

## 产品范围与已实施变更

从最新 `main` 的 R2.5 表单、唯一原型及既有 Controller Task/Authority/RunHost/Alarms 开始增量修改；没有新增调度器、权限系统、数据库、全局 CSS token、正式 HTML 原型或兼容 Host。

| 用户入口 | 生产改动 | 实际代码 |
| --- | --- | --- |
| 我的 → 定时计划 | Back 位于标题左侧，顶部计划数量/可执行状态及近期执行，计划卡突出下次时间；长中文换行 | `src/ui/tool.html`、`src/ui/tool-shell.css`、`src/ui/scheduled-task-workbench.js` |
| 列表操作 | 暂停/恢复、编辑成为一级操作；删除移至可展开「更多操作」和二次确认；历史默认折叠、每次 20 条分页 | `scheduled-task-workbench.js` |
| 创建、编辑 | 分组、字段间距、时间字段 ARIA 错误、首个无效字段聚焦、两阶段保存 | `tool.html`、`tool-shell.css`、`scheduled-task-workbench.js` |
| 时区 | 新建用设备 IANA，编辑沿用保存值；搜索只筛选原生 select 候选，不直接改写时区；无搜索结果仍保留原值；确认时显式列出固定时区 | `scheduled-task-workbench.js` |
| 可见运行页 | 重复标题降权；优先真实 RunId/正在执行，等待类历史显示为「未运行」，UNKNOWN 等不误报成功 | `scheduled-task-workbench.js`、`tool-shell.css` |
| 唯一原型 | 继续维护 `examples/ui/scheduled-tasks-r2.5-preview.html`，同步 IANA 搜索、长任务名称和新建规则默认值；仍是无真实宿主的模拟交互 | 上述唯一 HTML |

不变约束：`saveSchedule` 仍由两阶段确认发起，`resolveInstalledTask` 验证 Manifest/Source Hash、Installation ID、Task Generation；编辑仍提供 Schedule Generation 乐观并发控制；Stop 仍由原当前 RunId 绑定原 `host.stop`；UNKNOWN 仍不可自动重放。

## 本轮提交

- `130dd44d` — 生产 HTML Header、计划汇总、时区搜索和错误关联。
- `01693a8a` — IANA 查询、固定时区保存确认及状态解释。
- `f4f794db` — 优先当前任务/下一次执行、删除层级和历史解释。
- `925b97ef` — R27/R20 局部样式与窄屏间距。
- `0827f221`、`83bf7271` — 唯一 R2.5 原型同步与行为一致性。
- `a7be3c7e`、`1cf1d890` — IANA 搜索、DST gap/fold、跨地区及安全合同单测。
- `eff2af9e`、`11c3ec1c` — WXT Chrome 原生尺寸、时区过滤、焦点与草稿回归测试驱动。
- `5bc0d76f`、`c5999c44` — 原有 zoom 工作流上增加定向单测、双构建和源码变动触发。
- `9327a450` — 定时计划列表与 RunHost 状态静态回归。
- `f38801dd`、`c4a46a80`、`1b55b10b` — 表单离开前原位提示，SubView Back 修正，避免不经确认丢弃草稿。
- `8456dded`、`ead3b324` — 实际 Chrome 指针操作与相应静态测试覆盖草稿退出和任务管理往返。

上述 SHA 是独立连续提交，GitHub 通过 `main` contents API 提交成功；并行更新可能使最新 `main` HEAD 晚于这些提交，不得拿旧 SHA 冒充新 HEAD。

## 实际证据及尚未验收的事项

- **SOURCE IMPLEMENTED**：GitHub `main` 实际文件已按上面路径修改，未创建 PR/分支。
- **STATIC CHECKED（有限）**：在 GitHub 读取最新版对应文件，独立执行 26 项源码字符串/正则合同核对，全数匹配；生产 JS 与原型内联脚本通过 V8 语法解析，生产 HTML ID 无重复。这不是 Node 测试通过，不是 DOM 计算结果或真实视觉验收。
- **CI QUEUED / NOT_TESTED**：包含草稿安全修改的最新代码候选 `ead3b32484de89997092f6067bd4e41c8a3b9b08` 的 [原生定时 UI 工作流 38378375235](https://github.com/shopable-ai/opendesk-browser/actions/runs/38378375235) 在本轮核对时仍处于 queued；较早候选 `1cf1d890` 的 [运行 38377624368](https://github.com/shopable-ai/opendesk-browser/actions/runs/38377624368) 同样仍在队列。Linux 的 `npm run check`、`npm run build`、`npm run build:dev`、`npm run verify` 及 R25/R1/R27 定向测试结果都必须以最终候选日志为准。
- 现有 native zoom 测试使用实际 Chrome 已安装 WXT 包，`tabs.setZoom` 测 125/150/200%；**新增宽度 220/300/320/360/420/520px 仅是 Chrome TAB 内 CDP CSS viewport 模拟**，会在日志中记录 `getBoundingClientRect`、scrollWidth、点击区与草稿；它不能证明物理 Side Panel 宽度。
- 该工作流理应上传 `artifacts/r23-native-zoom-{linux|macos}/` 及 `native-zoom-report.json`、`runner-real-zoom-{125|150|200}.png`、`runner-css-viewport-{220|300|320|360|420|520}.png`、`runner-timezone-filter-320.png`。**这些是预期产物路径，并非已下载或已核实存在**；等待成功日志和包哈希核对才能引用为 PASS。
- **NOT_TESTED**：用户本机 `/Users/shopme/Documents/workspace/opendesk-browser` 工作区、macOS Chrome Profile、真实 Side Panel 的物理 220/300/320/360/420/520px、Chrome 100/125/150/200% 全状态组合、全量权限撤销场景、真实用户点击完成保存的端到端闭环。
- **NOT_SCORED**：10 项 95+ 专家评分需要真实 Chrome 当前候选截图、计算布局及交互证据，静态检查不能代替。

## 不可提升的证据等级

历史 R1/R2/R2.3 Chrome 成功属于**当时的输入 SHA / 安装包**。原型模拟、Node 组件、CI 预定输出、真实 Chrome TAB 内 CDP CSS 模拟、macOS CFT、用户实际 Mac Side Panel 六者不等价。失败必须保留原始日志，不能宣称完全 Final PASS。

推荐核验次序：候选 SHA → WXT 生产/开发构建哈希 → 测试日志 → Chrome 版本/Profile/PID → DOM/截图 SHA → 320/360/420px 表单视觉与 125–200% 缩放 → 独立用户 Mac Profile 回归。禁止强推、清理未提交数据或改写原 Run/Result。

## R2.6 continued: immutable edit identity and timezone/status corrections

2026-10-13 本轮在真实 `main` 继续完成以下可感知缺陷修复；属于生产源码，非新增模拟 UI：

1. **默认时间与固定时区统一**：`566560cf` 改为在 `getScheduleDeviceTimeZone()` 选定的同一 IANA 时区内用唯一 `formatWallScheduleTime()` 生成新建计划的预填执行时间。设备区检测回退 UTC 时不再错误使用宿主本地 `Date.getHours()`。`1678f2da` 更新对应合同测试。
2. **已阻断/无未来触发计划不再冒充即将运行**：`566560cf` 的计划列表和可见运行页仅将非暂停、非 `needsAttention` 且具有有限 `nextDueAt` 的计划视作已安排下一次执行；一次性已结束计划显示「暂无后续」。`7ea9008a` 同步原静态断言。
3. **编辑期间固定安装身份可理解且不可偷偷替换**：`8666f4f1` 将编辑计划的 Controller Task 下拉锁定，原安装不可用时显示带版本的禁用原始选项和操作建议。原版的 `taskId/version/manifestHash/sourceHash/installationId/taskGeneration` 仍在确认和 Authority 层重新核验，乐观并发 `expectedGeneration` 不变。
4. **跳转新建脚本的草稿保留**：`3f600128` 区分从编辑表单还是任务管理前往「开发」。从编辑表单回归后保留原表单与不可替换的固定身份；从管理页安装返回时进入初始化的新计划，不继承陈旧的旧表单。`d1dec738` 同步唯一 R2.5 HTML，`0e20a239` 同步 disabled 视觉。
5. **测试**：`6516ac5f` 将停用/卸载原固定任务及新脚本返回身份保护写入原 `scheduled-task-ui-r1.test.mjs`，没有新建重叠测试体系。

### 本轮实际执行等级

- **隔离 V8 实际函数检查：8/8 PASS**。直接加载当前 `schedule-time.js` 与 `scheduled-task-workbench.js` 函数执行，覆盖纽约 2026 年夏令时缺失小时/重复小时、东京/上海跨日、固定伦敦时区中文筛选、零结果筛选保留、非法系统时区回退 UTC、新建 UTC wall-time 的权威 formatter。属于运行源函数，不是实际 Chrome。
- **仓库原 R2.5/R2.6 时区测试源码断言：7/7 PASS**，将原 `scheduled-task-timezone-r25.test.mjs` 的实际测试函数在受限 V8 内以受控同步源码/异步 in-memory `readFile` 执行；非 `node --test`。
- **仓库原 R1/R2/R2.6 UI 测试源码断言：15/16 PASS，1/16 NOT_EXECUTED**。同一 V8 在内存中加载实际仓库源文件运行所有 UI 静态检查；需要真实导入 `canonicalToolHostUrl/toolDocumentIdentity/isToolSender` 的地址身份专项未执行。**绝不把这些受限断言提升为 Node 测试/真实浏览器 PASS**。
- **CI QUEUED / NOT_TESTED**：`6516ac5f1e5aa04ba7f19063acb14be7fac05742` 的 [原生 zoom 工作流 38381854877](https://github.com/shopable-ai/opendesk-browser/actions/runs/38381854877) 和 [组件/包工作流 38381854798](https://github.com/shopable-ai/opendesk-browser/actions/runs/38381854798) 在查询时仍排队。未取得完整 `npm run check/build/build:dev/verify` 实际成功回执或新的 Mac/Linux Chrome 原生截图哈希。
- **用户 macOS Chrome Profile/实体 Side Panel：NOT_TESTED**，这次 GitHub 连接器不具备用户本机工作目录/Chrome Profile/未提交状态视图。所有真正视觉评分（十项独立 95/100）保持 **NOT_SCORED**，不得伪造。

**本轮检查的固定源文件 blob**：`scheduled-task-workbench.js=ccc5375de1a495fa8160b4a778e5802fe1c8d181`、唯一 R2.5 原型 `=e001facfbe74511676e83a45cf5085e7e2c4f860`、UI 断言 `=2127c2de63276545149ca8a8028f997bf2365f61`。上述是源 blob 身份，不是 production package hash。R2.6 仍未达到最终 Native 95+ 关闭门槛。

## R2.6 second continuation: truthful settling and expanded native UI matrix

- `88af486f` 修复了独立运行页对 **SETTLING、WAITING_HOST 与迟到的终态 RunId** 的用户文案：SETTLING 仅表示「正在结算，尚未确认成功」；终态历史不能重新显示为正在执行；当前真实可见运行页不会因为历史 WAITING_HOST 而错误宣称此刻没有宿主。
- `96d9f2fe` 直接更新唯一 R2.5 HTML 模拟场景：已结束的单次计划显示「暂无后续」，数量汇总只计入确有下一次时间且未阻断的计划；模拟运行页优先显示结算等待，不冒充已完成。`11be121e` 为这两类源行为增加原 R1 环境测试文件的定向静态约束。
- `ecd9a25c` 扩展现有真实 WXT Chrome TAB 原生驱动到 **真实 tabs.setZoom 100/125/150/200%**、**CDP CSS viewport 220/300/320/360/420/520/594/760/980px**，并增加 **Chrome prefers-color-scheme 深色/浅色** 两份截图。viewport 模拟、真实标签页缩放、用户物理 Side Panel 仍须分开记载。
- `d5cdfb14` 将真实 UI 的远距离点击改成 CDP 轮滚 + CDP 鼠标操作，禁止从 DevTools 调用 DOM `click()`、`focus()`、`scrollIntoView()` 伪造操作。`1f7c9bfc` 增加真实 WXT 新建计划无任务时字段错误、焦点与禁止越过两阶段保存确认的原生专项。**这两项仅 TEST_CODE_IMPLEMENTED，尚无成功 native 回执。**
- 对应最新候选 `1f7c9bfccb8a2d61b29cc86e9a9f823e7019e385` 的 [GitHub Actions 38383018336](https://github.com/shopable-ai/opendesk-browser/actions/runs/38383018336) 查询结果为 **queued**。CFT 跨平台输出包、包 SHA256、日志与图片 SHA 尚不能列为 PASS。
- 最新 R1/R2/R2.6 UI 环境测试源文件在受限 V8 中经 `readFile` 内存适配执行 **16/17 PASS，1 项真实模块 URL/可信发送者断言 NOT_EXECUTED**；新生产 JS 与唯一 R2.5 HTML 内联脚本语法检查通过。此结果仍非真实 `node --test` 或浏览器视觉验收。

**当前需要严格保留**：用户 Mac `git status` / Chrome Profile / Side Panel 物理宽度 **NOT_TESTED**；同候选 Linux/macOS Chrome 原生构建及截图 **QUEUED**；十维专家 95+ 独立评分 **NOT_SCORED**。
