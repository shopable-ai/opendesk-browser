# OpenDesk Browser R50 —— 非弹窗工具交互与数据保护
日期：2026-10-11

## 目标与边界
用户要求未来所有 OpenDesk 工具的 JavaScript 弹窗不再打断操作。普通点击一次完成；卸载与丢弃草稿改为页面内非模态确认。保留 Chrome 自己的敏感权限对话框和浏览器安全边界。

## 代码实际接线
- `src/ui/sidebar-tools.js`：移除三种站点授权的二次 confirm；安装/更新审阅已足够，删除二次确认；新增版本/能力/来源变更显著风险描述；卸载及跨工具/选项卡的未保存草稿改为 Side Panel 内显式确认。异步执行前核验已安装包和当前实例，锁及数据清理原实现不变。
- `src/ui/tool.html`、`src/ui/tool-shell.css`：固定非模态确认区及紧凑按钮。
- `src/ui/task-workbench.js`、`src/ui/tool-shell.js`：向工具宿主传递目标 tab，保留未保存编辑时在原 tab 显示内联选择，用户确认后继续原导航。
- `src/marketplace/page.js`：来源/版本替换在已存在的发行审阅区域内明确显示，点击确认安装后不再叠加 JS confirm。
- `src/native-agent/workspace.js`、`src/native-agent/workspace.html`：知识草稿离开、待核对新文件与切换工作区/导入知识草稿改为异步页面内继续或取消；文件读写仍依赖 Native 真实来源与 session 校验。
- `src/sidebar-tools/bridge.js`：受限用户工具调用浏览器弹窗接口时采用保守返回值及行内状态，不扩展其能力。
- `beforeunload`：移除工具/本机工作区 JavaScript 离开弹窗。外部直接关闭未保存工具页面有可能丢失尚未持久化的草稿；需要工具自身 autosave，不可宣称全局保证草稿恢复。
- 保留 Chrome 原生权限请求、系统文件选择器、安装审阅、来源和精确网站授权、拒绝后不执行。

## 测试与状态
- `tests/environment/sidebar-tools-host.test.mjs`：卸载须先页面内确认；取消保留本地数据；无 JS confirm；脏编辑阻止意外离开，用户显式继续后可导航；工具沙箱浏览器弹窗保守拦截；并复用既有消息和权限回归。
- `tests/environment/workspace-integration.test.mjs`：Native 工作区在用户未保存草稿时使用页面内确认、取消保留、无 JS confirm。
- CI：`.github/workflows/sidebar-ui-r4.yml` 的独立工具与 workspace 单测先于整体 WXT 构建。
- 尚需核对对应 commit SHA 的 CI；过去构建曾因 `sw.js` 330248 bytes 大于 327680 的预算失败，本任务不得提高该固定限制以获取虚假 PASS。
- Mac 登录态站点、真实 Chrome、安装包 Native 与最终 F3/ZIP 验收未在当前容器执行，不标记 PASS。

## 进一步建议
对于第三方自定义工具，新增/编辑后应由工具自身及时保存（可使用已有 `OpenDeskTool.request('storage.set')`），浏览器直接关闭页面时不依赖模态阻止离开；今后实现 UI 组件时优先使用行内编辑、撤销和状态反馈，不建立新的全局弹窗系统。
