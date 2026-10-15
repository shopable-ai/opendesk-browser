# Papa Parse CSV 导出 · 可安装 Sidebar Tool

完整独立 v2 工具，展示四行数据列表和「导出 CSV」按钮。使用真正 `Papa.unparse()/Papa.parse()`，再通过现成可信 `OpenDeskSDK.browser.downloads.text` 下载，不使用运行时 npm/CDN。

构建：

```bash
node scripts/build-sidebar-tool.mjs examples/sidebar-tools/papaparse-csv-export
```

在 Side Panel「工具 → 导入」选择输出的 `artifacts/sidebar-tools/papaparse-csv-export/1.0.0/papaparse-csv-export.opendesk-tool.json`，点击「导出 CSV」，再于**可信 Side Panel** 完成单次确认及 Chrome Save As。需要 `user.export` 和 Chrome `downloads` 权限，不需要访问网页。

`files.dependencies` 中 `@opendesk-lib/papa-parse` 是**仅在本地构建期生效**的固定源码别名：由唯一公共内置 Catalog 确认 Papa 5.7.0 的字节及 SHA-256 后嵌入该工具的 v2 签名锁定资产。现有 opaque sandbox 再次校验 SHA 后加载。已安装工具不会继承 Page 的 Papa 全局，也不会向网站 MAIN 注入。

导出用 CRLF、`escapeFormulae:true`、UTF-8 BOM，保留 CSV 字符串与引号。Excel 可能自行推断长编号/日期；CSV 不保证数据类型。最多 150000 UTF-8 字节，文件名须安全。返回 `{started:true}` 不证明用户保存完成；权限撤销、取消与下载异常需要单独验证。

此示例的 Node 测试不是正式用户点击、Chrome 保存对话框或最终落盘验证。
