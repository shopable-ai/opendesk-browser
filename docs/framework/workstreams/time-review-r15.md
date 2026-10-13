# Time Review R1.5 · 独立网站授权、可信 Host 合同与计时闭环

- 日期：2026-10-13。目标：`shopable-ai/opendesk-browser` 的唯一 `main`。
- 旧基线：`52dda3de00e9e8665339e261027cff9937c2639e`，[Mac 原生成功候选](https://github.com/shopable-ai/opendesk-browser/actions/runs/38348617459)；只复用旧身份，**不提升新包**。
- 审核时 GitHub main 持续有其他 Agent 在写 Global First / Scheduled Tasks，且不能进入用户个人 Mac 工作目录检查 `git status`。每个文件必须按原 Blob 核对并在当前 main HEAD 下条件式提交；无法证明安全时不得改写。用户本机工作区：`NOT_TESTED`。
- 执行范围：Time Review 自有政策、计时模型、Host 控制、Side Panel 工具桥、两个组件夹具、原生 Time Review 脚本、工具包、文档；保持其他 Agent 工作流不变。

## 功能树、用户场景与真实源码

```
Time Review · 已安装工具 (tool ID: time-review)
├── 官方目录 / 安装 / 升级 / 启停 / 卸载 [复用原有安装器]
│   ├── examples/sidebar-tools/time-review/tool.config.json (1.5.0)
│   ├── src/ui/sidebar-tools/installation.js 负责正式安装、撤权代际与卸载清理
│   └── src/ui/sidebar-tools.js 负责安装包身份和受信任工具详情
├── 单独网站采集同意 [R1.5 实施；新候选待验收]
│   ├── src/time-review/policy.js —— 严格 Origin、最多 64 项、显式全部、默认拒绝
│   ├── src/time-review/model.js —— v1 内可选 siteGrants，不丢老数据
│   ├── src/time-review/host-controls.js —— 真点击、当前网站确认、全部二次确认、逐项撤销
│   └── src/time-review/service.js —— 每个 checkpoint 同时查站点范围+Chrome权限
├── 活动统计 / 六分类 / 单行 Canvas V3 / 导出 [继承历史，回归待验]
│   ├── examples/sidebar-tools/time-review/src/{main.js,index.html,style.css}
│   ├── src/time-review/{model.js,service.js}
│   └── tests/environment/time-review-r12.test.mjs 等专项回归
├── 可信后台长期运行 [R1.5 新包待原生验收]
│   ├── src/sw.js → src/entrypoints/time-review-host.js
│   └── tabs/windows/idle/alarms/storage；关闭 UI 与 Service Worker 休眠后依旧有效
├── 可选云同步 [BLOCKED]
│   ├── src/time-review/sync-outbox.js —— 本机准备与重试数据模型
│   └── src/time-review/sync-transport.js —— 幂等 HTTPS PUT/ACK 适配，无生产激活
└── 独立 Stay Focus [OUT OF SCOPE：不做拦截、限制、重定向]
```

## R1.5 冻结行为与迁移

1. 主 Manifest 的 `<all_urls>` 和 `chrome.permissions.contains` 不能代表 Time Review 获得网站采集同意。原工具未安装或停用/卸载、安装代际/包摘要错配、单站点不在显式清单、idle 未授权/空闲、Chrome 失焦/隐身、Chrome 站点权限失效，都不能新建有效检查点。
2. 既有 `opendesk.time-review.v1` 保留原日汇总、分类、分钟明细、导出。新 `siteGrants` 默认 `{allSites:false,origins:[]}`；不迁移旧的扩展级网站权限为单工具同意。旧 checkpoint 无新 Origin 绑定不得计入新候选。
3. 可信 Side Panel 工具详情必须真实点击，沙箱只能请求打开设置；即使工具 JS 自行发送 `time.siteGrant` 也会被桥拒绝。指定站点仅精确 Origin，网页变更后确认作废；全部普通网页二次确认；单独撤权立即使该站点无法启动新计时检查点，所有站点撤权暂停。
4. `TIME_REVIEW_HOST_API = time.review/1.5.0` 为独立工具使用 Host 的简单协议声明，不引入第二套 SDK / Host。新工具前端检测到旧 Host 拒绝提供“开始”入口；更新包的摘要改变，原运行授权失效，必须由用户再明确开始。站点范围不会偷偷增加。
5. 记录口径是浏览器前台、原生 idle 为 active、特定 tab 当前显示且被观察到的“可验证网页前台活动时间”，不是目光注意/音视频实际观看时长。超过 45s 断档、时区/DST/会话不确定性不能自动计入。
6. 网站黑名单、每日娱乐时长限制、强制拦截、重定向属独立 Stay Focus，不放入 Time Review。

## 验收及证据等级

| 范围 | 可验证方式 | 本轮写入前 |
| --- | --- | --- |
| 工具 ID、固定可信 Host、原 v1 数据 | 主分支源码核查 | SOURCE_READ |
| 旧 R1.3 正向 Mac 原生 | 历史 Actions 38348617459 / 52dda3d | HISTORICAL_PASS_ONLY |
| R1.5 独立站点授权/撤权/更新/卸载 | 新 tests/environment/time-review-r15-site-grants.test.mjs 与真实 Mac Chrome | NOT_TESTED |
| R1.5 构建、包 SHA、SW 体积、包校验 | npm run build:sidebar-tool、check、build、build:dev、verify；工作流带 SHA | NOT_TESTED |
| 静态阅读/输入、长视频、后台音频、跨日/DST/Chrome 崩溃 | 同候选真实 Chrome 专项场景 | NOT_TESTED |
| 服务器身份/幂等 ACK/响应丢失后对账 | 正式生产服务的真 HTTPS 回执 | BLOCKED |
| 用户自己 Mac 本地工作区状态和 Chrome Profile | Mac 本机访问才可判定 | NOT_TESTED |

建议依影响范围定向执行的回归命令：
```bash
node --test tests/environment/time-review-r12.test.mjs tests/environment/time-review-r13.test.mjs tests/environment/time-review-r13-service.test.mjs tests/environment/time-review-r13-consent.test.mjs tests/environment/time-review-host-controls-r51.test.mjs tests/environment/time-review-r14-sync-outbox.test.mjs tests/environment/time-review-r15-site-grants.test.mjs
npm run build:sidebar-tool -- examples/sidebar-tools/time-review
npm run check
npm run build
npm run build:dev
npm run verify
```

原生 Mac 工具安装、真实 Side Panel、网站范围单独批准、真实活动、停用/撤权、SW/Chrome 重启、升级/卸载和窄视口需绑定**新源码 SHA、工具包 SHA、SW 哈希、原始 Case 证据**后标记 PASS。不能仅凭旧候选或自动构建过关而声称 R1.5 八维度都达到 95/100；缺证据的维度一律 `NOT_SCORED`。

## 云同步阻塞与解除条件

旧 `https://api.todo6.com` 仅历史接口文档存在；未见可证明生产原子 upsert、稳定幂等 record revision、有效账号连接/作用域及实际数据对账的凭据和 ACK。故本版本仍 **LOCAL_ONLY / NO_UPLOAD / BLOCKED**。不能从 `sync-outbox` 和 `sync-transport` 源文件存在推断云同步上线。完成用户登录、额外上传授权、账号切换隔离、撤销/删除与服务端对账后再单独启用。

## R1.5 后续修复：原生 CI 卡在工具宿主体积硬上限

- 候选 `95d4d29f6af2a2abc50bbe85e06ab1fdcc259fed` 的 [macOS CI 38357310430](https://github.com/shopable-ai/opendesk-browser/actions/runs/38357310430) 结论 **FAIL**（保留失败记录）；Node 74/74 PASS，正式工具包构建 PASS，但生产 WXT `ui/tool-shell.js` 为 **527585 B > 524288 B**，所以 Chrome 原生阶段 **NOT_TESTED**，不能当成 Chrome 行为回归失败或通过。
- 修复设计：不调整 512 KiB 硬门槛、不允许动态 import 绕过自包含 WXT IIFE。把 Time Review 可信操作按钮和确认面板的**静态标记**直接移入现有 `src/ui/tool.html` 的工具设置区；`src/time-review/host-controls.js` 仅负责真实点击、Chrome 空闲权限、Origin 审阅、受限 Host 调用和安全渲染。原工具 UI 沙箱仍不可调用网站授权。
- UI 权责：通用“TOC/Clip/Capture 网站授权”只对真的声明这类能力的工具可见；Time Review 与 Stay Focus 使用各自的独立授权控制，禁止显示“此工具不需要网站授权”的误导性状态。
- 回归：更新 R5.1 / R1.3 / R1.5 组件夹具，直接校验所有静态受信任控件 ID；带真实事件 `isTrusted` 的接口测试保持拒绝伪造权限、跨 Origin 审阅状态失效、取消确认不会改变范围。之后按新 SHA 重跑 Node、工具包构建和 WXT 检查；即使构建通过也不升级旧浏览器 PASS。

## CI 定向回归发现：旧通用工具测试夹具未包含预编译控件

- d888903 的 [Sidebar user tools CI 38360670244](https://github.com/shopable-ai/opendesk-browser/actions/runs/38360670244) **FAIL：117 PASS、70 FAIL**，失败均出现在共享假宿主初始化，提示 `Time Review trusted controls are missing`，未进入实际业务行为测试。已归因：`tests/environment/sidebar-tools-host.test.mjs` 仍假设工具设置动态生成，没有实例化 `tool.html` 的静态授权 ID。
- 修复必须同时保留生产安全：`host-controls.js` 允许与 Time Review 无关的轻量宿主夹具没有该控件，但当实际选择已授权的 Time Review 时，缺静态控件仍抛出并**拒绝受信任权限动作**；共享测试夹具显式加入静态 ID，新增负向测试确保不能以“安全降级”隐藏缺失。
- 修复后按新 SHA 做隔离回归；Mac 原生和包大小不能因以上原因提前标记 PASS。

## 生命周期收窄及原生证据补验（候选待实际 CI）

- 发现安装列表变化时 `service.js` 先前对**全部** `SIDEBAR_TOOL_STORE` 改动一律触发 `invalidate({revoke:true})`，即使仅新增其他工具，也可能不合理地停止 Time Review；本轮收敛为当前 `time-review` 安装记录变化、该工具启停/代际变化或注册表损坏时才强制撤权，其他工具安装正常进行。
- 新增环境回归：一边正常计时，一边安装 `other-tool`，需继续保存真实网站时间；随后修改 `time-review` 固定包身份，则检查点立刻退休。此场景不允许仅凭其他工具的 R1/R2 生命周期结果替代。
- 原生 macOS 测试新增单独网站撤权链路：Chrome `idle` 权限保留的情况下，可信点击撤销 Time Review 网站范围；检查运行暂停和历史保留、没有网站同意时尝试开始被拒绝、再次逐站授权后明确重启。所有动作都应由真实 Side Panel 点击，不准直接预置 business storage。
- 最新实际提交/同 SHA 结果、工具包与 SW SHA 必须在 CI 后写入；本段只描述已改的测试合同，并非声称浏览器 PASS。
