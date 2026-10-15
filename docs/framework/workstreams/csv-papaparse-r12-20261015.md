# OpenDesk Browser CSV / Papa Parse R1.2 — Code-first 验收进展

日期：2026-10-15。写入分支：仅 main。进入此记录前快照：`1cc5e2e2f3d641ba0897b805845c5df04edafc05`。

## 责任边界
- 复用官方 Papa Parse 5.7.0（Catalog 内唯一固定 SHA），修复 `browser.downloads.text` 原来拒绝 `.csv` 的阻塞；MIME 选择和安全字段校验在原 Host 下载调用前进行。没有新建下载服务；用户授权、Chrome 下载权限、保存动作与单次操作权限均沿用已有 SDK/Host。
- 现有独立 v2 工具打包器仅允许固定别名 `@opendesk-lib/papa-parse` 在构建期读取唯一 Catalog，固定字节/SHA 后放入自身 package.scripts。运行环境是工具自己的 opaque sandbox，不会继承 Page 世界的 Papa、CDN或任意 npm 包。
- `examples/sidebar-tools/papaparse-csv-export/` 是可构建工具项目，四条数据，真实 `Papa.unparse/parse`，单击「导出 CSV」，然后单次可信 Side Panel 确认并请求 Chrome Save As。并有 Node 合同/负面用例。
- Time Review 既有 CSV Host 业务不强制搬入 Page，旧 `@vanillaes/csv` ESM 锁、缓存与冻结安装 Revision 维持不变。

## CI/测试可审计事实
- 首轮 CI `f31a4dd38977241d73651cc74c323524b96c904d` 的 `page-r3-package`、`axiosx HTTP` 最终被**新添的 CSV Node 测试标题撇号语法错误**阻断，该问题已由 `1cc5e2e2f3d641ba0897b805845c5df04edafc05` 修复。
- 同一首轮 Sidebar R1 原有 AI VIP Share lifecycle 用例出现 `E_TOOL_LOCK` 等多项失败；代码属于独立代理锁业务，不能归咎于 CSV，也不能忽略整个工作流失败。
- 历史 CSV 首次失败 `38693130506` / `38693130453` / `38693130520` 已有修补；R16.1 Page Papa 单项成功仍不可代替整个 Controller HTTP 断言工作的成功。
- 本轮新 Node 验证会在 Sidebar 工具 CI 的**专门第一阶段**执行，独立区分后续 AI VIP Share 测试；原 R16.1 macOS CFT 工作流扩大了触发范围以捕获新候选的 Page 回归。
- 只记录本候选实际 workflow job、日志及产物。不可用的 Mac 本地工作目录没有检查，GitHub 连接也不能代替运行用户 Mac Chrome。

## 未完成的原生 P0
- 在已安装 Sidebar Tool 真实 Chrome 内点击按钮、实际 Side Panel 审批、Save As 对话框完成、`products.csv` 磁盘内容与中断/取消/撤销，尚无真机落盘证据，标记 `NATIVE_NOT_TESTED`。
- `browser.downloads.text` 回执 `{started:true}` 只证明 Chrome 接收下载请求，不意味着 Save As 完成或文件保存。
- 只在全套 P0 Chrome 与文件校验完成且没有其他 P0 回归时授予 95+；未达标时必须如实降低评分。
