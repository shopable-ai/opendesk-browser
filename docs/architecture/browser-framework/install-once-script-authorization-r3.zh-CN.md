# OpenDesk Browser R3：扩展与脚本安装时授权，运行时零弹窗

状态：**正式设计与实施合同；本文件自身不表示代码已实现或真实 Chrome 验收已完成。**

日期：2026-10-10。延续 [site-permission-onboarding.zh-CN.md](site-permission-onboarding.zh-CN.md)、[native-program-authorization-r2.zh-CN.md](native-program-authorization-r2.zh-CN.md)、[userscript-sdk-authorization-r1.zh-CN.md](userscript-sdk-authorization-r1.zh-CN.md)。若旧文档说“每次运行请求权限”，以本 R3 的安装授权 / 运行静默校验原则为准；保留既有安全栅栏、存储、SDK 文档权限隔离，不做另一个独立实现。

## 1. 产品决定

**用户只在安装扩展与安装/扩权脚本的明确动作中授予权限，日常每次运行不得调用 chrome.permissions.request。** Chrome 实际授权状态及 OpenDesk 每程序授权在执行点静默检查。检查不是用户交互，不是新授权，也不得要求反复点击“确认”。

- 扩展安装：Manifest 声明 Chrome 上限。当前 `manifest.json` 已有 `<all_urls>` 和 storage / scripting / sidePanel / downloads / tabs / webNavigation / userScripts / cookies / notifications 等核心权限；其他插件 API 在 optional_permissions。用户在 Chrome 中可限制网站访问，不能据 Manifest 声明假定此时有效。
- 脚本安装/更新：OpenDesk 显示一次「访问的网站」「宿主能力」「精确网络来源」「敏感能力」「自动执行范围」。保存已批准的**程序安装身份 + 授权范围**；Chrome 所需权限已经存在时不再调用 `permissions.request`。确实缺失时仅在安装/恢复权限的可信点击内发起一次申请。
- 日常执行：读取实际 `permissions.contains`、程序安装授权与当次精确文档/运行状态，全部满足就执行。**零 permissions.request、零授权弹窗**；可创建后台 RunAuthority 执行实例及生命周期 fence，但那是内部记录而非重新征求用户同意。
- 原生权限撤销或 Chrome 限制站点：受影响程序变成「访问受限/已暂停」。不要自动申请、自动重新执行或将失败任务当成未发生。提供一个独立的「恢复访问」按钮，用户主动点击后申请缺失范围，再由用户重新触发执行。
- 扩权：脚本提出新 site/capability/跨站 HTTP 目标/敏感能力时在安装升级确认中显示差异；拒绝扩权后原已安装版本可保持原授权与启用状态，不能以新版本/新依赖冒用旧授权。
- 普通升级：同一安装身份及已批准能力边界内，源码变更需要通过现有固定版本/依赖锁/Verification/Available 机制和用户选择的更新策略，但**不再申请已经批准的权限**；不将 `sourceHash` 改变自动等价于授权范围改变，也不因此每次重复打开 Chrome 权限弹窗。
- 临时手工草稿：用户点击「运行」即明确同意执行这一次现有范围内的脚本。无需另设每次授权对话框；若缺 Chrome 网站访问，拒绝并引导到单独「恢复访问」。未安装草稿不因此获得永久自动执行权限。
- 独立网页 SDK：仍为被选中的网页文档（并非单一脚本）的单独授权。不得为解决 Page 程序缺少网络能力，给整张网页装公开 SDK。已安装脚本的授权持久化不等于为所有后续网页自动安装独立 SDK。

## 2. 实际模型，不建第二套数据库/执行器

沿用当前 `frameworkKV` / `commandJournal`、`Installed Page Program`、`Controller / RunHost`、`Authority / Broker`、`CurrentPageTarget`、Network Service 和原有 fence/receipt。逻辑上区分三层：

1. **ChromeExtensionGrant**：由 Chrome 保存，`permissions.contains` / API 可用性为执行时权威依据。脚本不能直接继承扩展全站/Cookie/native 权限。
2. **ProgramInstallGrant**：按现有安装身份（namespace + 不可伪造的 installation identity）保存 capabilities、pageRules、HTTP exact origins（scheme、host、port）、敏感读写范围、批准时的 grant generation、active/disabled 状态和升级策略。既有固定 sourceHash、revision、dependency lock/manifestHash 须通过原 Verified/Available 安装链绑定，不能用任意自报 programId 调用其他程序授权。
3. **RunAuthority**：运行时内部实例，绑定已安装授权、实际源码哈希/版本、精确 tab/frame/document、owner、stop/revoke generation、目标和副作用阶段；此记录不触发权限 UI。Worker 重启静默恢复已确认持久安装，未知副作用不重放；关闭旧文档不等于删除程序的持久批准。

现有 Page `USER_SCRIPT` 是 Chrome 隔离执行机制，不是 `@grant none` 业务权限模型；普通 JS 无需 UserScript 注释。旧 `@grant/@connect` 只在兼容导入时转换为声明，不直接获得宿主服务；未支持的能力不可假装成功。

## 3. 当前 main 已有事实与具体改动路径（2026-10-10 核对）

| 路径 | 已有基础 | R3 要做的修改 |
|---|---|---|
| `manifest.json`、`src/platform/chrome/permission-gate.js`、`src/ui/site-access.js` | 全站/核心 API 首装声明；可选权限；Chrome 实时状态和撤权观察 | 保留；区分「网站受限」与「可选 API 缺失」；不扩张权限 |
| `src/ui/script-editor.js` | 普通 Run、本地项目 Run、Page 预览均有 `permissions.request` | 把这些“每次运行申请”改为静默权限检查和错误引导，**不在 Run 回调中申请**；用户单独恢复按钮才可请求 |
| `src/ui/page-program-library.js` | Verify、Install、重新 Enable 每次直接调用 `permissions.request` | 仅首次安装/确实缺失时由用户点击申请；现有已授权范围用 contains；普通 enable/verify 不重复请求 |
| `src/scripting/user-scripts/installed-programs.js` | 已有 Candidate / Verified / Available / Installed、原生注册、启停、运行时 contains / 固定身份和回执 | 复用现有安装身份；必要时补程序级能力批准记录和差异比较，勿另建系统；运行时仅检查、不请求 |
| `src/platform/host/broker.js`、`src/platform/host/authority.js` 与现有 Runner/Driver | 已有 authenticated host、Run/SDK 权限及撤销机制 | 扩展每程序授权匹配；运行点拒绝不匹配的 capability/目标，不能由页面 JSON 字段伪造权限 |
| `src/ui/sdk-approval.js`、`src/platform/host/sdk-methods.js` | 独立网页 SDK 精确文档 Grant | 保持单独授权链，不借此授权一般 Page 程序 |

技术实现建议：在用户进入安装界面或改变候选网站时异步预读 `permissions.contains`，展示已满足/缺失的范围。点击安装时若确实缺 Chrome 权限，必须在可信点击处理器内同步开始 `permissions.request`，不能先 await 造成 user activation 丢失；完成后再次查 contains、文档和固定版本。若本地预读状态与点击时实际状态冲突，拒绝并引导再次明确操作，不能无声扩权。日常 Run 不调用 request。

`site-access.js` 的“全网站+cookies+notifications”整体布尔值不得替代按任务/能力逐项检查；Chrome 权限有效性和程序自有授权都需要验证，权限移除事件应使运行中状态失效。对 Native Messaging、Cookie、下载和额外插件权限按实际功能要求做独立程序能力校验，避免扩展安装时全权限给任意来源脚本。

## 4. 验收合同（主分支、同一候选 SHA）

- **零重复请求**：扩展安装且所需站点已授权、脚本已安装的情况下，普通 Run、Page preview、20 次自动执行、Verify、Enable 对 `permissions.request` 的调用计数必须为 **0**。
- **唯一缺权恢复**：Chrome 权限被撤销，Run 仅给出可恢复的拒绝状态，没有新的 `permissions.request`、没有 Run 副作用；用户手动点击恢复时申请一次，拒绝后无自动重放，再次运行由用户启动。
- **脚本隔离**：脚本 A 获得一处 HTTP target/网页范围，脚本 B 不能借 A/扩展 `<all_urls>` 权限访问；Cookie、其他网站、Native 服务不被隐式继承。安装 grant 存储、principal、版本和实际 sender 不能由调用参数伪造。
- **更新**：不扩权更新无需再次 Chrome 权限申请；扩权须展示差异并由安装/升级界面确认，拒绝时旧安装不自动扩大、不损坏。
- **生命周期**：新的 tab/doc、SPA/BFCache、Worker 重启、浏览器重启、撤销、disable、Stop、并发更新、RPC 未知回执；不得发生旧 grant 复活、不同 document 串用或自动重复提交。
- **UI**：默认只显示“已安装·自动运行”“访问受限·恢复”“已停用”“升级需要新增权限”。不得把“权限校验中”渲染成每次“正在申请授权”。
- **验证证据**：先针对受影响测试复用既有 SUCCESS，再新增定向测试；`npm run check`、定向 node tests、`npm run build:dev` 以及真实 Chrome Profile 首装与连续执行验证。保留失败与 NOT_TESTED，独立专家安全反方审计；任何缺失授权仍能执行、隐式权限升级、未知副作用自动重放为验收否决项。

本 R3 是设计与下一次实施的依据；**目前没有在此文件中声称所有执行入口都已整改完毕**。完整 95+ 必须有同一代码和浏览器包的真实验收支持。
