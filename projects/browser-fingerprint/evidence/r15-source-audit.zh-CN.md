# R1.5 源码核查与残留阻断 · 2026-10-27

写入责任：仅 examples/sidebar-tools/browser-fingerprint/。不修改 Host/SW/Manifest/安装器/Catalog，也不触碰其他 Sidebar Tools 的业务文件。

已核对的公开合同：
- src/framework/sdk/browser-contract.js blob 341d2bad3bfa8f4cc007e7eef064617ec18f3ac0：browser.page.getContext 属 currentPage.read，未登记 browser.environment.*。
- src/framework/sdk/browser-schemas.js blob f4f919b7ad7ff1013d4342b3fdfafec5b1dd745c：page.getContext 仅页面 URL/标题/可能的 tabRef 与 documentRef。
- src/ui/sidebar-tools.js：getContext 在可信 Host 前 revalidate；storage.get(withEtag)/storage.set(ifMatch) 有单工具锁和 8 KiB 单项限制。
- docs/api/sidebar-tools.zh-CN.md blob 7189fd8c31ebcfd35e20b76ef24769a1e2329cce：标准 Sandbox API 和报告导出限制。

主要缺口：公开且有界的目标页面 JS 环境只读采集能力。需要产品/安全按精确 HTTP(S) documentId、可审字段清单、撤权/导航旧回执和来源证据审批，不允许 iframe navigator 冒充网页。完整 A 检测 BLOCKED；现阶段页面上下文证据属于 PARTIAL。

原始 R1.4 个人文件库有命中，但原始字节物化被拒绝，预期 SHA256 60d2f83068bc34b4bda322ad036eeb065022a7a982009cbad3e901db59828389 本轮 NOT_VERIFIED；因此当前正式 UI 不宣称像素一致。R1.3/R1.4 继承历史离线 T01–T22 22 PASS，不等于本轮源码或原生 PASS。

Mac 工作区、依赖安装、Node 测试、React 构建、预览点击、真实安装及 Mac Chrome 均 NOT_TESTED；生成源码 Git 树不是通过的测试，也不是正式发布。
