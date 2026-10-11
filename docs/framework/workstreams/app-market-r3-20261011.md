# R3 App Market 独立实现工作流

日期：2026-10-11。本会话使用 GitHub Connector 检查和修改 main；无法访问用户 Mac 本机仓库、未占用 Chrome Profile/Native 主机/既有工作流产物。基线 R2 提交 5b5cf5f；并行 axiosx 改动到 7ad558d，已按最新 UI 保留其修改。

源码范围：正式市场独立页、五个固定官方包、完整性绑定、共用 Side Panel 安装服务、个人/官方套装与纯数据迁移、批量恢复、静态站、构建白名单与组件测试。

证据分层：
- 源码静态集成：已编写，尚需最终提交 SHA 与后续检查。
- Node 测试 tests/environment/app-market-r3.test.mjs：NOT_TESTED，本会话无完整 Node 工作树。
- npm run check、npm test、npm run build、npm run build:dev、npm run verify、npm run pack：NOT_TESTED，本会话未运行，不等同 PASS。
- 正式 Chrome Side Panel → 应用市场 → 安装 → 打开/卸载：NOT_TESTED。
- 恶意意图、同 ID 冲突、坏包、批量部分失败及未知结果重启：NOT_TESTED_IN_CHROME。
- Mac Native/F3/ZIP：NOT_TESTED；公网生产域名与跨来源安装桥：NOT_DEPLOYED。
- 媒体：STRUCTURAL_PLACEHOLDER（不是实际截图/视频）。

下一步本地执行：安全同步 main，核对并行资源，npm ci 后先运行新增 Node 用例、源校验、构建/verify/pack，使用受控 Chrome 加载真正生产 dist 并固定 commit SHA、扩展 ID、Chrome 版本、packageHash、安装/撤权与失败截图。不要提升历史其他包的验收级别，也不要覆写已有 receipt。


## 已补充真实 Chrome 与构建证据

2026-10-11。前文 NOT_TESTED 表是最初源码提交时刻的历史状态；新增本节记录后续真实执行的结果，不篡改历史。

- 验收源提交：f1f294e9038d8627aac49b8d049f2cb14b58ca5e。
- GitHub Actions：https://github.com/shopable-ai/opendesk-browser/actions/runs/38122082239 ，market-production-native 完整成功。
- 定向 Node 测试：8 passed、0 failed。覆盖发行版本一致、必须用户明确审阅、重装不重复、来源冲突、手工替换撤销原市场身份、12 个工具容量、写入后丢回执恢复和非法迁移字段拒绝。
- 同一候选：npm run check、npm run build、npm run build:dev、npm run verify、npm run pack、npm run build:market-site 及公网静态路由文件检查全部通过。
- 真实 Linux Chrome for Testing：Chrome/155.0.8059.39；临时独立 Profile；扩展 ID jhajepcnohiplmafaiokjlcagcfjgaap（仅为 CI 测试 ID，不是正式 Web Store ID）。
- 生产 packageHash：9a77b978f223e061e404cf6a94cad1537acd4604ec8722c0c29206b464cfb34a。
- 真 Side Panel → 工具 → 应用市场 → 固定详情 → 审阅 → 确认安装 → 本机实际安装 registry → 我的应用 → 主动打开工具页面；五款实际安装版本均核验成功：reading-toc 1.0.2、web-markdown-clipper 1.0.0、quick-notes 1.1.1、markdown-workbench 1.0.0、knowledge-inbox 1.0.0。
- 安装前存储为空，审阅不执行安装，未自动运行 iframe，TOC 无自动网站授权；五款工具的独立打开浏览器 target 均经 Chrome CDP 验证。
- 原始结果 JSON 和截图：https://github.com/shopable-ai/opendesk-browser/actions/runs/38122082239/artifacts/11695404150 ，包含 artifacts/app-market-r3/native-result.json 和 market-my-apps.png。
- 历史构建/测试修复：市场知识收件箱显示标题与正式包不匹配、设计 CSS 严格测试与第 19 入口未同步、两个已合法加入的 TOC 测试页面与原 fixture 精确名单不一致、公网生成器拒绝根路由、Chrome 测试中的旧展示标题。保留原 CI 失败证据，以 38122082239 新候选的本专项全绿状态为准。

尚未覆盖：五款工具全部业务动作（网页正文读取与剪藏、笔记保存恢复、ChatGPT 页面采集等）；套装批量中断重启、取消剩余、部分成功失败的真实 Chrome 情况；公网生产域名与 HTTPS 外部安装意图；真正的截图和短演示媒体；跨设备个人套装托管及非敏感偏好迁移；Mac 本机人工验收。以上状态保持 NOT_TESTED 或 NOT_CONFIGURED，不得把本专项 Linux Chrome 结果误写成 Mac 全量验收。

设计评分与产品实际质量必须分开；即便组件构建与上述 Chrome 5/5 已通过，也不声称所有 UX/安全维度达到 95/100。
