# R16.6 Page 多库按需加载：工作流状态

日期：2026-10-12。分支仅 main，不创建 PR/Worktree/分支；不占用 Mac Chrome Profile、测试端口、dist 或 ZIP。

## 已提交实现

- `src/scripting/user-scripts/execution-source.js`：源码前导最多六条固定 ID、稳定去重、React/Vue 冲突拒绝、按声明顺序执行、编译组合 512 KiB 上限；旧 scalar API 兼容。
- `src/libs/loader.js`：批量可选资源用同一次版本 manifest 逐资源哈希验证，未声明的资源不读取。
- `preview.js` / `installed-programs.js` / `page-program-package.js`：真实 Page 预览、安装执行与回执链传递数组身份；升级时逐项对比，旧单库不会授权新增库。
- `tests/environment/page-multi-libraries-r166.test.mjs` 和既有 `public-libraries-on-demand-r162.test.mjs`：Node/VM 定向测试，不能冒充 Mac Chrome。
- `examples/programs/single-file/page-axios-query-string.js`：真实双库单文件页面请求示例，需在用户 Mac Chrome 执行。

## 验收与遗留

本记录只表示源码改变；同 SHA 的 CI 工程及真实 Chrome 回执应分别附加。建议运行：

```sh
node --test tests/environment/page-multi-libraries-r166.test.mjs tests/environment/public-libraries-on-demand-r162.test.mjs tests/environment/axios-public-r159.test.mjs
npm run libs:check && npm run check && npm test
npm run build && npm run build:dev && npm run libs:doctor -- --strict
npm run verify && npm run build:size && npm run pack && npm run pack:dev
```

未覆盖：Controller 真实 Axios Broker 接线和取消；Socket.IO 上游固定版本及真实联机；Tailwind 用户预编译样式隔离；React+Axios 用户可见受管 UI 实机 Demo；最新 main 原生浏览器/ZIP 安装。上述均为 `SOURCE_PENDING` 或 `NATIVE_UNVERIFIED`，不是“只剩最终验收”。不修改旧证据、不预先自评95分。

## 2026-10-12：CI 反馈与准入修复

上一候选 `9ec2df6b83eccb00b063229a69daadc3fe8cfe1d` 的 R15 总体资格 [CI](https://github.com/shopable-ai/opendesk-browser/actions/runs/38251106383) 出现 1619 PASS / 1 FAIL / 7 SKIP：多库 React 示例在 `dependency-metadata.js` 的历史三项硬编码白名单被阻断。新增从唯一 `runtime-contract.js` 导出衍生 alias 表，解析器和编译器共同引用，禁止继续维护不同步的第二份库 ID；定向测试遍历所有可选 alias。此段描述的是源码修复而非新候选的 CI PASS。
