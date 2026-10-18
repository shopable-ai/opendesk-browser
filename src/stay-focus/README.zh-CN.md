# Stay Focus · 仅保留旧模块路径的兼容导出

Stay Focus 的**唯一业务实现**已经归属独立可安装应用：
[`examples/sidebar-tools/stay-focus/`](../../examples/sidebar-tools/stay-focus/README.zh-CN.md)。

本目录的 `*.js` 是不带业务逻辑的 ESM 兼容转发，供旧测试或外部模块过渡。正式的 MV3 Worker、Side Panel 可信控制、Page Relay 和安装清理入口已经直接依赖应用内 `trusted/`，不得再向本目录添加 Stay Focus 业务逻辑。原有 `blocked-*.html` 和 CSS 资源也已转至应用 `trusted/`，构建后 Chrome 公共路径仍为 `stay-focus/blocked-*.html`。

请不要将 `trusted/` 加入普通用户可编辑的 `.opendesk-tool.json` 包。后端依赖 Chrome MV3 权限与固定可信构建入口，当前版本不是独立于 OpenDesk 的 Chrome 扩展，也不支持动态 JSON 安装任意高权限后端。用户可分别安装/启停/卸载 Stay Focus 工具；宿主仍必须是包含其受控运行时的版本。

变更记录见 [Stay Focus R2 提取说明](../../docs/framework/workstreams/stay-focus-extraction-r2-20261018.md)。
