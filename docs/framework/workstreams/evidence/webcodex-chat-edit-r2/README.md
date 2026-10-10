# WebCodex R2 证据索引

当前可接受的组件与构建候选见 [verification.json](verification.json)。最终构建是 `release-builds/`，最终组件日志是 `targeted-release.log`，正式包打包回执是 `pack-production-release.json`。这里的 release 仅区分本轮最终构建阶段，不代表软件已发布或真实安装验收通过。

早期、integrated、final 等阶段保留其原始结果，不替换为最新 PASS。旧锁拒绝日志和仅清理本轮已退出进程残留锁的核查记录一并保留。

`*.mjs.txt` 是实际 DOM 驱动的原文快照，原执行位置为 `docs/framework/evidence/webcodex-chat-edit-r2/`，工作目录为本轮仓库根目录；相对 import 依照原位置解析。驱动使用既有缓存中的 linkedom 0.18.13、Option/select.value 兼容补充和内存后端，无新增项目依赖。这些是组件证据，没有真实 Chrome 渲染、Native 或网站调用。

每份原始记录的 SHA-256 在 [manifest.json](manifest.json)。独立复核结论见 [independent-review.md](independent-review.md)。

构建日志按原字节保留，包含构建器表格输出的行尾空格；没有为满足文本排版检查而改写原始日志。产品源码的格式检查独立执行。
