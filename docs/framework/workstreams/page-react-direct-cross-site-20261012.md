# R24.3 React Direct · 通用跨站悬浮组件

日期：2026-10-12。仓库 `shopable-ai/opendesk-browser`，只写 `main`。此工作流只负责 `examples/programs/page-ui-react-direct` 的跨普通网页可运行性；其他 React/Vue 格式、TOC 示例归各自负责人。

## 实际修改与身份

- [源码与规则提交](https://github.com/shopable-ai/opendesk-browser/commit/700a8e9f127b1dcb418c5d90bcaa55d3dc88545c)：`src/main.js` 标准 React 组件显示页标题/host/path、计数、刷新、收起/展开；`pageRules.matches: ["*://*/*"]`，排除列表为空；使用原组件生成入口、Shadow DOM/floating host、受管 Stop。保留 ID、`USER_SCRIPT`、`allFrames: false`。
- [原构建器导入草稿同步](https://github.com/shopable-ai/opendesk-browser/commit/0ffc9b7c7f10af321425cc00bf4d576458e1c705)：从 [GitHub Actions 原 builder](https://github.com/shopable-ai/opendesk-browser/actions/runs/38210525378) 的构建输出直接写入当前 `examples/import-ready/page-ui-react-direct.opendesk-draft.json`，不是手拼 Webpack 字节。导入 JSON 26061 bytes，SHA-256 `0af5dd2833d0722523f1c23a298c21d1a5abb49bb64d709a517254b0aa0e3224`；冻结 `sourceHash=c3ad6f43aaedf2b59e14896df6414f7caaaf2392d01d02bb265030d9ac44146d`、`sourceBytes=20944`。配套更改当前草稿测试和导入说明。
- [测试字段修复](https://github.com/shopable-ai/opendesk-browser/commit/caee8920d3a6852613285a0c3aa5baaca3becf09)：`validateProgramProject` 的结果不含 `framework` 顶层属性，改从项目清单验证；保留源代码的 `entryMode`、`sourceHash` 和范围断言。
- 没有修改旧的 `src/legacy-main.js`、`src/enhancement.js` 与 `examples/import-ready/history/` 历史快照，也没有给另一个 TOC 示例叠加功能。

## 证据分级与限制

- `BUILDER_PASS`：[R24.3 导入草稿原构建/校验](https://github.com/shopable-ai/opendesk-browser/actions/runs/38210525378) success；固定 React 资源复用，没有将框架打入用户源码；产物小于 100000 bytes Page 预算。
- `NODE_PASS`：[同步后的项目合同 CI](https://github.com/shopable-ai/opendesk-browser/actions/runs/38210703095) success，验证当前 JSON 与原 builder 源码身份一致；[修复后环境 CI](https://github.com/shopable-ai/opendesk-browser/actions/runs/38210836743) 的完整 `npm test` 日志中本专项 `React direct uses the existing floating host on unrelated HTTP(S) documents` 为 `ok 662`。完整环境 suite 仍 FAIL（另有导航驱动、组件 linker 测试与并行 TOC 示例测试失败），不可用局部 PASS 代表全仓库 PASS。
- `NATIVE_PASS_LIMITED`：[真实 Mac CFT / Native / USER_SCRIPT](https://github.com/shopable-ai/opendesk-browser/actions/runs/38210525215) success，绑定源码提交 `700a8e9f127b1dcb418c5d90bcaa55d3dc88545c`，证明挂载、真实点击与受管 Stop（该源码之后未再修改）。此测试使用同一 localhost 实验网页，不等于已跨两个站点获得真实授权运行证据。
- `NOT_TESTED`：在两种不同实际 HTTP(S) origin 上，分别验证 Chrome 网站许可、Run/Stop、文档身份、悬浮定位、SPA/BFCache、权限撤回、窄屏/200% 缩放/暗色。未经这些证据不宣布最终 95+ 或全网必然可注入。正式安装和自动运行依然要求收紧匹配与明确授权。
- 其他工作流同时写 main；CI 旧候选报错须区分原因。初次 `npm test` 中本工作流误用 `checked.framework` 的断言已修复；另有 TOC 示例自身测试失败及 LocalDev managed UI 的 `preview-pending` 竞态，未经归因不把它归为本次跨站代码已关闭的缺陷，也不覆盖其他负责人文件。

## 本地 Mac 说明

本会话访问的是 GitHub 远端 `main`，不能直接写入用户本机 `/Users/shopme/Documents/workspace/opendesk-browser`。Mac 本地仓库仍需由所有者确认无未提交冲突后执行 `git pull --ff-only origin main`。保存本地源码只自动准备，运行仍需开发面板明确触发。
