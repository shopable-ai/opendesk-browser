# 资源合同样例：CSS / JSON / PNG（Page 资源构建回归）

此样例包含真实磁盘 `assets/panel.css`、`assets/config.json`、4×4 `assets/mark.png`，用于确认现有 `opendesk.project.v1` 资源声明与构建器贯通；不是 UI 可视化 Demo。真正 UI 演示使用 [page-ui-basic](../page-ui-basic/README.md)。

```sh
node scripts/validate-program-project.mjs examples/programs/sidebar-assets-contract
npm run build:program -- examples/programs/sidebar-assets-contract
```

当前构建将 CSS、JSON 和 PNG 在严格大小、类型、哈希和 CSS 路径验证后内嵌为固定 `program.js` 产物；`artifact.json` 记录资源哈希。它是 Page 用户脚本手动预览可用的冻结字节，**不是自动安装、后台运行或任意 @resource/GM 兼容**。若有非法 URL、文件类型或超限数据，校验／构建必须 fail closed。旧的 `E_PROJECT_ASSET_BUILD` 预期仅适用于资源打包尚未实现的历史版本，现已被成功资源构建及负面校验测试替代。
