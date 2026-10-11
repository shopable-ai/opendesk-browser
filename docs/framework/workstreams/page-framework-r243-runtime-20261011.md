# R24.3 内置框架公开 API 扩展与来源凭证

日期：2026-10-11。源码提交候选：bcbc0b1741d381e14c02dabd0408345fdeeb9ffe。维护者重新构建运行时的 GitHub Actions： https://github.com/shopable-ai/opendesk-browser/actions/runs/38150606276 。

- React 19.2.0 / ReactDOM：193163 字节，SHA-256 `d1eec2e96ed42046ad543a10af7de992aee633ac06017f44f6b917e36451c758`，来自锁定的 `examples/programs/page-ui-react`；公开 React ESM 导出 40 项，ReactDOM client 3 项，JSX runtime 3 项。
- Vue 3.5.22：118131 字节，SHA-256 `2af9ee5acf9bf1cb05c5a871b6d99fd2af11fe1e6f372cfd8acb8b543b95d174`，来自锁定的 `examples/programs/page-ui-vue`；Vue runtime client/编译 helper 导出 169 项。
- 按原 `scripts/build-page-framework-runtimes.mjs` 与固定版本离线构建；`react/jsx-runtime` 由扩展固定代码提供，Vue 模板编译器不进入 Page 或 Service Worker。
- 旧运行时 SHA、旧草稿和旧 Chrome 回执是历史身份，不能继续当作新的 bundle 证据。必须先 `npm run check`、`npm run build`、测试与真实 Chrome 再判定完成。
- 原 React/Vue MIT 许可证来源保持，未改变 Controller、权限、RPC 或全站授权。

本记录为确定的新源哈希而非真实网页验收。
