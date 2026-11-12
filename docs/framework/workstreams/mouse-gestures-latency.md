# 鼠标手势响应与启动延迟优化

## 本轮目标与基线

- 用户操作：已能画出轨迹并执行动作；本轮减少松开鼠标后的等待，以及打开页面后手势首次可用的等待。
- 基线：`main` / `e0d8e5a233ec1b2f43bea2a27db5708090688971`。当前云端检出初始干净；用户 Mac 的 CodexPro 连接不可用，不能将本检出的验证称为用户 Chrome 实测。
- 产品 owner：`projects/mouse-gestures/`，现有 Sidebar Tool v2 + USER_SCRIPT Page Module，沿用 `OpenDeskAppPage`、Page Authority、受管 UI、原安装器。
- 阶段：已有功能的性能修复与受影响定向验证；没有开始正式发布或替换用户已安装的扩展。

## 源码证据与修改分工

协调 owner：本轮主代理。Git 状态与产物更新由主代理串行处理；审计代理只读，不操作浏览器、Git 索引或用户设备。

### 工具内响应路径（主代理写入）

`mouseup → finish → readPolicy → readContext → storage.get → execute` 中，`readContext` 的返回值没有被使用；`storage.get` 自身通过真实 sender、父应用安装身份和读取前后 Authority 核验。移除冗余上下文读取，保留每次动作的新鲜设置读取及失败关闭。低优先级偏好轮询不应额外抢占正在进行的策略读取。

写入范围：`projects/mouse-gestures/src/page/runtime.js`、`tests/runtime.test.mjs`、`package.json`、`tool.config.json`、原 `README.md`，验证后通过原打包器更新唯一 `mouse-gestures.opendesk-tool.json`。

### 通用启动时序（startup_framework_audit 代理写入）

已证实的公开能力缺口：现行组合包/安装/目录校验只允许 `document_idle`，工具内部无法提前自身启动。即使仅把 bootstrap 改早，后续 `userScripts.execute` 默认仍等待 idle。通用改动仅增加顶层 USER_SCRIPT 的可审阅 `document_end`，保留旧包的 idle 默认、固定源码、精确文档、原安装权限和撤权生命周期，不按工具 ID 分派。

框架写入范围：`src/scripting/user-scripts/{page-install-package,official-page-catalog,installed-programs,preview-worlds,preview}.js`、`src/ui/sidebar-tools/package.js`、`scripts/build-official-pages.mjs`，以及这些合同已有的定向行为测试。只有已审核为 `document_end` 的安装实例，才把后续固定探测、实际执行及 Sidebar 请求设为 `injectImmediately:true`。固定受管销毁控制统一尽早执行，避免页面仍在加载时无法及时停用；这不执行新的业务源码。`document_start`、allFrames 及任意 world 不在本轮新增范围。

主代理维护相关公开 API 文档和本记录。框架代理修改的测试为 `tests/environment/{page-install-package,sidebar-tool-page-module-package,page-installed-programs,app-page-programs,official-page-catalog-r124}.test.mjs`。主代理最后修复 `page-installed-managed-lifecycle.test.mjs` 一项受影响回归的等待驱动；未改变产品断言或扩展其他业务。

## 复用与验收边界

- 复用已有分段识别、轨迹 rAF、12px 意图/56px 识别阈值、右键保护、Esc、失焦、停用、撤权与迟到动作取消；450ms 菜单关联窗口不是动作等待，不改小来制造提速。
- 既有 R5 报告只作历史证据；本轮变化涉及 runtime 与启动合同，须重新验证对应行为、失败关闭及新旧启动时序；不重复无关 UI/全仓回归。
- 分开记录：源码等待链、可控桥延迟回归、构建包一致性、用户 Chrome 的真实毫秒数。没有当前机器数据不报告实测改善百分比。
- 实机待测：页面导航→模块就绪，mouseup→动作调用；页面网络导航/滚动动画完成不混入动作派发时间。冷态与热态、取消/失败分别统计。
- 未获当前任务明确提交/推送授权，不推送远端 `main`；先完成可审阅的源码、测试和交付补丁。

## 已完成与验证

2026-11-12（北京时间）本轮源码、定向回归与可导入候选准备完成，**用户 Chrome 的实际延迟及安装生效尚未验证**。本工作区仍为上述 `main` 基线上的未提交修改。交付前读取远端 `main` 为 `ee9933f5140ad93abee1e3fafb93d355a77d9d0f`；与基线比较，本轮写入文件没有远端变化，仅未触碰的旧 `projects/mouse-gestures/docs/final-acceptance-r5.zh-CN.md` 有更新。因此不覆盖其历史验收追加，也不因无关 HEAD 更新重复测试。

### 确切行为变化

1. 每次初始化、松开后的动作授权只读一次有 Authority 核验的 `storage.get`；移除未使用的上下文往返。
2. 用 `activePolicyReads` 计数覆盖所有未完成读取。慢手势读取与快显式刷新交错后，低优先级轮询也不会插入额外等待；每次新手势仍发起新鲜读取。
3. 退役实例在发桥请求之前直接返回 false，旧回包不能重新启用。
4. 已批准的自动 `document_end` bootstrap 后，原标记探测、三个独立世界探测及源码执行均尽早注入。内部 `runAtReached` 仅由已验证自动 bootstrap 设置；手动运行未证明 DOM 就绪时仍保留原时机。
5. end 模块的 Sidebar 请求和固定受管销毁不再等 idle。继续绑定当前文档、world、nonce、安装代次，保留读取/派发前后撤权检查及 UNKNOWN 不重放。
6. 原有 UI、分段、阈值与右键策略不重新设计；0.3.2 的唯一包也带入了基线 main 上尚未打入 0.3.1 的精简设置 UI。

### 测试记录

环境为本次独立 Linux 检出、Node `v24.22.1`；按原 `package-lock.json` 通过离线 `npm ci --ignore-scripts` 还原依赖，未修改依赖声明或锁。所有原始日志在 `artifacts/mouse-gestures-latency/`，同时随本轮交付归档。目录不提交原始生成物。

| 范围 | 实际命令/证据 | 结果 |
| --- | --- | --- |
| 项目 runtime 先失败后修复 | `runtime-before.tap`、`runtime-overlap-before.tap` | 先定位 4 项额外读取/等待问题；再以单项红测捕获“旧请求慢、最新请求快”的计数遗漏 |
| 项目完整定向集合 | `node --test --test-reporter=tap projects/mouse-gestures/tests/*.test.mjs`，`app-final.tap` | 88/88 PASS，包含新鲜授权、旧 ON/OFF 乱序、关闭/销毁、右键与组合保护 |
| 框架新时机红测 | `framework-red-ready.tap`、`framework-manual-red.tap` | 先证明旧校验拒绝 end，并捕获初版手动运行过早的缺陷；依赖未齐的初始日志独立保留，不当作产品失败 |
| 五个框架合同 + 原清理文件 | `framework-final.tap` | 共 258 项，257 PASS、1 FAIL；五个修改合同文件的 213 项全部通过 |
| 唯一失败的定位 | `framework-lifecycle-isolated.tap`、`framework-lifecycle-file.tap` | 单项原样运行 1/1；整清理文件 44/45。失败在进入 disable 之前，固定 100 次 setImmediate 尚未等到 UI，不能写成整批通过 |
| 修正等待驱动后的清理文件 | `node --test --test-reporter=tap --test-concurrency=1 tests/environment/page-installed-managed-lifecycle.test.mjs`，`framework-lifecycle-final.tap` | 45/45 PASS。等待 fixture main 在设置 finishMain 后发出真实就绪信号，保留 3 秒总上限、UI 数量、disable、迟到 main 拒绝等原断言；没有改产品来迎合测试 |
| 语法/差量 | runtime `node --check`、`git diff --check` | PASS |
| 组合包 | 原 `build-sidebar-tool.mjs` 的 `--out` → `--promote-from` → `--check-project`；三个 package 日志 | PASS / PROJECT_PACKAGE_MATCH；不等于已安装或 Browser 本体全量构建 |

没有把重复运行次数相加当成独立测试数量。最终相关范围为项目 88 项、框架合同 213 项、清理 45 项；保留前述失败和修复过程。

### 候选身份

| 字段 | 值 |
| --- | --- |
| 唯一包 | `projects/mouse-gestures/mouse-gestures.opendesk-tool.json` |
| Tool ID / version | `mouse-gestures` / `0.3.2`（原 0.3.1） |
| Page ID / revision | `app.mouse-gestures` / `6`（原 5） |
| UTF-8 字节数 | 56,840 |
| 文件 SHA-256 | `a0dccb7ebea18c856998b785845c92a8a955a52a43aa40b6ca991dc88109d772` |
| Page sourceHash | `4a87d02601620029eba12b76e0424dce04fcb25aa8e84ddffca271677fe9c9c3` |
| Page packageHash | `93cdb6dd169ff2759cbefe367786373659213a23d2dfabab09b51852c8a1a1e2` |
| 时机/范围 | `document_end` / 原 HTTP(S)、顶层、USER_SCRIPT |
| 能力 | 原 `page.module`、`storage.local` |
| 状态 | `PACKAGE_READY / INSTALL_NOT_TESTED / CHROME_LATENCY_NOT_TESTED` |

### 独立复核

另一个只读代理分别审查项目并发读取和框架身份/时机/撤权链路，发现的布尔读取标志遗漏与 manual end 过早注入均以先失败后通过的用例修复。复核确认没有在框架新增鼠标业务分支，没有把旧偏好快照当授权，没有因即时清理绕过 UNKNOWN 栅栏。该评审不是外部认证，不给没有原生证据的 95+ 验收分数。

## 本机下一条操作与剩余工作

1. 在用户机器当前仓库 `main` 读取真实工作区和本轮补丁，保留并行改动；若相关差量已经存在，直接跳过，不重做 UI/手势核心或历史 R1–R5。
2. 本次包含 Browser 固定代码变更：复用原 `npm run dev` / `dist/development`，核对实际已连接开发服务、加载路径/ID、已应用构建。需要提交/推送时按当前授权边界处理，不创建其他分支、worktree 或 PR。
3. 再经既有“扩展”审阅入口把鼠标手势更新至上表精确包。旧 Browser 不能靠单个 JSON 获得新启动能力；不要先卸载同 ID 工具，不改写安装授权记录。
4. 在获准普通页面用真实输入测两条链：导航/DOM 完成→手势 runtime ready，以及 mouseup→动作 API 调用。首次冷态与后续热态分别记录；轨迹越阈值→rAF 提交和动作调用→导航/滚动可见效果单独统计。
5. 验证右键两种模式、Shift 右键、四方向/组合、Esc/失焦/关闭、撤权及网页仍 loading 时停用。只有同一实际包/Browser 身份的原始结果才能登记为 Chrome PASS。

源码还存在共享 Page 启动队列和 Authority 材料重复验证等潜在开销，本轮没有实机耗时占比，不进一步重构或缓存 live authority。若更新后仍慢，先按上述阶段测量；拿到证据后只修改占时的段落。

官方时序依据：[Chrome userScripts.execute](https://developer.chrome.com/docs/extensions/reference/api/userScripts#method-execute)（默认 idle，injectImmediately 可避免再次等加载）、[content scripts run_at](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts#run_time)（end 在 DOM 完成后）。本轮记录中的收益是去掉已证实的等待点，不是未测的毫秒数或改善百分比。
