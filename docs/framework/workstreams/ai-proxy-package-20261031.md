# AI Proxy 同源封包与独立安装测试

- 日期：2026-10-31，Asia/Shanghai。
- owner：Codex chat `01a19123-a2eb-7bb3-8b87-ccd744e5d48e`。
- 状态：核心封包与升级验证完成；原生 Goal 在本次 main 提交读回后收尾。
- 工作目录：`/Users/shopme/Documents/workspace/opendesk-browser`，仅现有 `main`；起始 HEAD `3c76ae9a4c2d42616ca5d46581204511c16f3650`。
- 用户目标：最新源码 → 更新版本 → 项目唯一正式 JSON → 实际安装/升级 → 核心操作与如实报告；不恢复延期验收。

## 文件与资源归属

本任务负责项目 `package.json`、`tool.config.json`、`vite.config.mjs`、`dist/` 编译回执、临时候选、唯一 `ai-proxy.opendesk-tool.json` 和新包安装证据；README/AGENTS 仅增量同步真实交付状态。业务导航/排版及原有设计证据仍由设计 owner `01a190dc-2f18-7d22-a576-c20e42be8953` 负责，不能夹带或覆盖其未提交改动。

Cookie owner `01a190d5-1384-7c30-89ae-89d6a403bad6` 已明确释放桌面锁和 AI Proxy 写入等待；设计 owner 也已完成，确认可恢复源码操作。registry 的 native_ui_owner 已读回为空。Browser dev PID11682保留；原Preview PID93753在收尾检查时已退出，原因未知，使用原 `node projects/ai-proxy/scripts/stage-preview.mjs --serve` 恢复同一43263入口。不写 `dist/development`。

用户已授权独立浏览器测试。当前任务创建专用 CFT 155.0.8059.39 **headless** 实例，Profile 为 `artifacts/ai-proxy/install-0.3.2-20261031-isolated/profile`，扩展从原 `dist/development` 只读加载，ID `ccfcjegpkdlgbclopjmadlcjedelidmf`。准确端点、进程、SIDE_PANEL context 和 target 绑定记录在同目录新证据。无共享键鼠/桌面输入；不导入登录 Cookie、不接管其他 Profile、不启停代理。headless 的真实安装/Chromium 证据不冒充可见 macOS 原生验收。

本任务整合已完成设计源码，仅为容量删除四份项目CSS中的未用选择器，晋升项目唯一正式JSON，并增量同步README/AGENTS与证据。Browser src/、公共清单、其他项目及原服务未修改；不推送。

## 关键测试条件与证据要求

| 条件 | 最小通过标准 | 证据与当前状态 |
| --- | --- | --- |
| 冻结与 CSS | 真实 Vite 成功；合成 CSS ≤120000 字符；原权限/来源/CSP/身份保护不变 | PASS；116697/120000，原安全合同保留 |
| 同源与版本 | metadata/候选/正式包同版本且高于0.3.1；原打包器晋升后 `PROJECT_PACKAGE_MATCH` | PASS；0.3.2，916536字节，SHA `fb0151b4ef7e135951b54416917617ac6a7a89fbb8f4bd9d376cb7b21ac3a547` |
| 实际安装 | 原「扩展→导入→审阅→确认」链成功，ID/版本/规范SHA一致 | PASS；独立CFT155 headless真实SIDE_PANEL，安装规范字节完全相同；可见macOS原生NOT_TESTED |
| 升级保留 | 同实例先装0.3.1保存测试配置/规则，再升新包，原ID与数据保留 | PASS；配置、规则、selection逐字段保留 |
| 保存与重开 | 配置/规则保存、选择及关闭重开回读一致；Chrome代理基线不改变 | PASS；配置端口8443→9443，规则优先级100→73，原ID保留 |
| 草稿与返回 | 底部取消/X/Escape/设置关闭的保留与放弃正确；返回焦点/滚动不退化 | PASS；各入口保留／确认放弃，规则焦点返回原编辑项，scrollTop0→0；无尺寸专项 |
| 忙碌与迟到结果 | busy不离页；revision/generation变化拒绝迟到关闭/写入 | COMPONENT_TESTED；同源码定向检查通过，未冒称浏览器延迟注入 |
| 安全与失败恢复 | 失败/来源漂移不覆盖旧正式包；不扩权、不重放未知副作用 | 必须持续满足；不放松校验制造PASS |
| 交付保存 | 唯一JSON与匹配且归属明确的源码安全提交main；README/AGENTS/结构化证据分清层级 | 当前提交保存；不夹带其他项目、旧历史记录重写及ip111独立记录 |

任一身份/同源/版本不符、升级丢数据、无确认丢草稿、busy/撤权保护放松或跨owner副作用均否决完成。测试名称或数量不是用户操作成功证明。

## 当前复用与最小后续动作

### CSS 超限的定向清理计划

最新原 Vite 编译成功，compiled CSS 111335 字符；原共享设计注入后 124067 字符，超出原 120000 上限 4067。原正式包保持未覆盖。只读比较 chrome138 target 和既有 esbuild minifier均不足以解决，不修改这两项设置。

清理仅删除经当前 src 静态／动态消费核对证明未用的历史选择器，保留同一规则中的活跃 selector arm、层级、scope、顺序、颜色和实际用户布局。先运行已有导航／配置／规则／草稿／表单回归锁定行为，再按无消费者的类族删除；不创建字符串断言。最后实际编译、候选、包门禁及真实安装核心操作证明输出和交互。当前设计 owner 的业务变更作为交付源码整合，保留其原证据，不把本人标为设计作者。

独立 CFT 0.3.1 已经原导入确认安装，规范 SHA 与正式包一致；通过 UI 保存一条 HTTP 占位配置和一条含子域的 endpoint 规则，Chrome 代理设置读回与基线完全一致。数据保留在本任务隔离 Profile，未启用网络路由。

- 复用0.3.1的历史安装与旧数据持久化记录，仅作升级基线，不提升为0.3.2 PASS。
- 只读子代理已核对 `.proxy-back` 两条规则无当前UI消费者，源码可删218字符；另有未用 `.ruleRouteFields` 与 `.sourceIntro` 类族候选。未删除、未推算编译节省量；待业务owner与共享写入资源就绪后最小处理。
- 已完成真实编译→候选→68项行为／包门禁→晋升→同源核对→新包升级与操作验证；另6项useProxy错误检查通过。未修改Vite或metadata版本，沿用已有0.3.2候选metadata。
- 真实代理流量缺受控可用公共节点，保持NOT_TESTED；不在日常Chrome或系统代理上试验。完整四模式、认证、PAC、多节点、订阅联网不宣称完成。
- production、全CI、完整语义类型诊断、屏幕阅读器和95评分不自动恢复；宽度/缩放矩阵OUT_OF_SCOPE。
- 完整步骤、源码回执、构建指纹、限制与截图见 `projects/ai-proxy/evidence/install-0.3.2-20261031.json`；独立浏览器已正常关闭，Profile仅在忽略artifacts中保留。Browser开发连接已读回，现有服务保留。
