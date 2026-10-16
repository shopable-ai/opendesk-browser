# AI VIP Share R5.9.3 · v1.3.4 正式源码、CI 与安装证据审计

日期：2026-10-16。目标仓库：`shopable-ai/opendesk-browser`；仅 `main`。正式代码提交 `ba33b4ba5583e80a2c9fed3e1fe851b35165d1c8`，GitHub 直接正常快进推送成功。

## 1. 代码实施 / 安全边界

正式工具 ID `ai-vip-share`、正式源码 `examples/sidebar-tools/ai-vip-share/src/`、正式安装包 `examples/sidebar-tools/ai-vip-share/ai-vip-share.opendesk-tool.json`。
版本 `1.3.3 -> 1.3.4`，包声明能力仍为 `storage.local`、`network`、`browser.tabs`、`browser.proxy.managed`，没有扩大公共权限；仍由 `OpenDeskSDK.browser.proxy.managed` 控制代理。

- 预检成功后焦点移到正式「确认兑换」按钮，避免原输入框禁用造成键盘焦点丢失。
- 预检区域支持可信 Escape 取消；与「取消」按钮共用无服务端消费的取消路径，恢复兑换框焦点。
- 「兑换记录」原有重复标题合并成单一标题和计数；服务未配置的会员区域技术文案压缩，但不伪造账号/权益。
- 折叠说明最小点击高度增加；继续复用正式公共 Design Tokens，不修改宿主全局 token。
- 兑换恢复 journal 保持 `1.2.0/1.3.0/1.3.1/1.3.2/1.3.3/1.3.4` 兼容；不自动重提未知兑换事务。
- 旧代理 Host、Managed Proxy Owner/STOP 和商业端点配置均不在本次变更范围；保持现有拒绝/禁用逻辑。

## 2. GitHub Actions R5.9.3 真实可复核结果

专属运行：https://github.com/shopable-ai/opendesk-browser/actions/runs/38885973580

- 状态 `completed/success`，绑定正式提交 `ba33b4ba5583e80a2c9fed3e1fe851b35165d1c8`。
- 第一组会员/兑换/代理/来源测试：`41/41 PASS`；第二组相关回归：`59/59 PASS`；合计 **100/100 NODE_PASS**。
- 唯一正式打包器、`--check-project` 和候选同源核验 PASS：
  - `id=ai-vip-share`
  - `version=1.3.4`
  - `bytes=68652`
  - `SHA256=38e875dabbe22ef253eb0f50f9e11c01d0c7877c871f3cad6fce06a2b61f035a`
  - `PROJECT_PACKAGE_MATCH`，但打包器明确返回 `installed:false`，不是安装回执。
- Chromium 采用 HTTP 页面加**模拟 SDK**，针对 320/360/390/440px × 浅/深色生成两套原型和打包正式 UI 截图共 16 张，加模拟 STOP 前后 2 张；无横向溢出，禁用端点时没有实际购买/兑换/代理启用。
- `build:dev`、`build`、`verify` 步骤 SUCCESS。
- 关联产物：`ai-vip-share-r591-evidence-ba33b4ba5583e80a2c9fed3e1fe851b35165d1c8`，Actions artifact ID `12039708415`。源截图 + `chromium/report.json` 可复核其 `PACKAGED_CHROMIUM_MOCK_SDK_NOT_INSTALLED` 身份。
- 上一版截图对照：https://github.com/shopable-ai/opendesk-browser/actions/runs/38882116370 （对应提交 `6f13db5e744fb154a1f5c603ff9fa8d66a069d12`；不视为同一次真实安装）。

**明确不能升级的证据：** 本次没有 Mac 实际已安装 1.3.4 Side Panel、Chrome extension ID/loaded directory/installed package hash、sandbox 原生截图、Native 配对或代理网络副作用回读。因此 `INSTALLED_NOT_TESTED`、`REAL_PROXY_BLOCKED`、`PROVIDER_BLOCKED`。历史真实 Chrome 安装证据仅覆盖 1.3.1，不能继承成 1.3.4 PASS。

## 3. 独立验收矩阵

| 子系统 | Node/打包 Chromium | 真正已安装的 v1.3.4 Chrome |
|---|---|---|
| 会员账号/时间、额度及功能权益 | Node PASS，未配置服务正确拒绝 | PROVIDER_BLOCKED |
| 兑换预检、确认、取消、Escape、持久 journal | Node PASS，可信 Esc 与焦点修复新增回归 | PROVIDER_BLOCKED / INSTALLED_NOT_TESTED |
| 兑换未知回执、跨版恢复、账号隔离 | Node PASS | INSTALLED_NOT_TESTED |
| 商城 HTTPS 新标签页 | Node fixture 与禁用状态通过 | PROVIDER_BLOCKED |
| 代理刷新 / 唯一启停按钮 / STOP 优先 | Node 和模拟回执通过 | REAL_PROXY_BLOCKED |
| 其他扩展控制权冲突 / Chrome 原生 STOP | 仅组件与 SDK 约束 | NOT_TESTED |
| 同 ID 原位升级/权限/数据保留 | 候选与正式包身份一致 | INSTALLED_NOT_TESTED |
| 320/360/390/440px + 明暗主题 | 打包页面真实 Chromium 截图通过，SDK 模拟 | INSTALLED_NOT_TESTED |
| dev/prod 包 | GitHub Actions PASS | 本机安装 NOT_TESTED |

## 4. 专家独立质量门禁（禁止把未测项写成 95+）

| 维度 | 本轮结论 | 理由/剩余风险 |
|---|---|---|
| 视觉与原型一致性 | INSTALLED_NOT_TESTED | 仅有 18 张打包/原型/模拟 STOP 图片；真实 Host、iframe 宽度与缩放未采样 |
| 窄侧栏信息架构 | INSTALLED_NOT_TESTED | 320–440px 模拟打包页面无溢出，真实嵌套容器与 200% 缩放缺证 |
| 交互效率与可访问性 | INSTALLED_NOT_TESTED | 新焦点/Esc 回归 PASS，但未做实际 Chrome 键盘导航与读屏复验 |
| Browser SDK 与业务边界 | INSTALLED_NOT_TESTED | Node 安全合同 PASS；真实浏览器 Provider、控制权/网络副作用缺证 |
| 安装、升级与生命周期 | INSTALLED_NOT_TESTED | 官方 JSON 来源通过，升级保留数据的浏览器级验证缺证 |
| 测试、构建及可维护性 | 95/100（本次代码和专属 CI 范围） | 100/100 Node PASS、来源 SHA 一致、两种构建 PASS；尚需真实 Side Panel CI/本机 Native 证据 |

**反方结论：** 项目仍未达到“真实已安装 UI 95+ 完成”。若没有读回扩展身份、加载目录、Side Panel contextTypes、安装记录 package SHA、截图、Chrome 原生 proxy control 和同 ID 升级数据状态，就不能把绿 CI、模拟 STOP 或视觉相似解释为安装产品验收。

## 5. 仓库级独立故障，不得隐瞒或借本任务越权修复

同一 SHA 的 `Site access targeted checks` CI https://github.com/shopable-ai/opendesk-browser/actions/runs/38885973669 显示 `148/149 PASS`，失败用例 `site recovery is reachable from every workbench tab...`，位置 `tests/environment/site-access.test.mjs:126`，断言期待的宿主结构排序不成立。该错误不是 AI VIP Share 专属 CI 失败；本轮修改文件没有宿主 `src/ui/tool.html` 或该断言。需由相关工作流负责人按最新 main 独立核验，不得因 AI VIP Share GREEN 声称整个仓库 CI 全绿。

## 6. 原生产品剩余关口

有权访问 Mac 的现有开发/验收任务应先只读检查开发 watcher、实际 Chrome Profile、扩展 ID/路径、执行中的未知事务；不可强制重启、覆盖 watcher 或清空日常 Profile。能安全隔离时用独立 Chrome for Testing Profile，通过正式「扩展 → 导入 → 审阅 → 同 ID 更新 → 打开 → 返回 → 重开」产品链验证 1.3.4，读回 SHA、真正 `SIDE_PANEL` 文档、沙箱来源和实拍；对照本轮模拟截图、另行保存本机原生回执。未取得 Provider/合法代理测试配置时继续拒绝真实兑换或 START；如已有经审阅的本工具代理控制权，STOP 必须可请求并经 Chrome 回读确认。成功前不得填 `NATIVE_PASS` 或任何安装 UX 95+ 分值。
