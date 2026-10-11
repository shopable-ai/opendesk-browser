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
