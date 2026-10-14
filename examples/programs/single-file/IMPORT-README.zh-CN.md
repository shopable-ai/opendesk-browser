# Import 场景导航（R7.7）

> **混合 Import 的完整测试分母（R7.9.4，项目源码已提交、Chrome 待验收）**：同一个**本地多文件** `main.js` 必须有 3 条真实静态 import：① 固定 HTTPS ESM、② 精确 npm ESM、③ 相对目录文件；同一次运行另调用 ④ `opendesk.libraries` 显式启用的固定预置库（Page `query-string` / Controller `axios`）及 ⑤ 默认 `_`、`dayjs`（**都不再写 import**）。它不同于下列已有**单文件** D3 演示，不能把单库历史 PASS 冒充混合五来源 PASS。完整最小源码、必要锁和验收规则见[五种依赖的唯一使用合同](../../../docs/framework/universal-dependency-runtime-usage-contract.zh-CN.md)。不要为了凑内置 import 加入 `@opendesk/ui`、按钮或 DOM 挂载。

打开标准测试页 `http://127.0.0.1:43111/demo-form.html`，在该网页打开 Side Panel。若服务未启动，仓库根目录运行 `python3 -m http.server 43111 --bind 127.0.0.1 --directory examples/tasks`；已有同内容服务时直接复用。

| 示例 | 入口、真正开始执行的按钮 | 正常结果 |
| --- | --- | --- |
| [page-d3-max-esm.js](page-d3-max-esm.js) | Developer Edition → 开发 → 普通 JavaScript；复制完整源码，点击“在当前网页试运行” | 网页底部 `Page D3 max = 5`，返回 `{world:'USER_SCRIPT',value:5,success:true}`；重复运行只有一个 output |
| [controller-d3-max-esm.js](controller-d3-max-esm.js) | Developer Edition → 开发 → Controller 草稿；复制完整源码，点击“运行草稿” | 持久结果含 `world:'CONTROLLER'`、`value:5`、`success:true`、当前网页 title；历史中可查 runId/resultId |
| [controller-mitt-pinned-esm.js](controller-mitt-pinned-esm.js) | 同一 Controller 草稿入口 | 真正订阅并 emit 一次。`mitt@3.0.1` 与当前受信映射的 `mitt` 均固定为 3.0.1；未知裸名明确拒绝 |
| [本地 D3 工具](../../sidebar-tools/import-max-probe/README.zh-CN.md) | 先离线构建正式工具 JSON，再在“工具 → 导入”安装，主动打开 | opaque iframe 中显示 `Tool D3 max = 5`；导入和安装不执行 |
| [v2 多 Classic 工具](../../sidebar-tools/import-max-probe/classic/) | 同上，使用 classic/tool.config.json 生成的 JSON | `Tool Classic mitt = 5`，顺序为 `mitt>second>main`，emit 一次 |
| [Classic 使用合同与示例](../../../docs/framework/universal-dependency-runtime-usage-contract.zh-CN.md) | 普通 Page JavaScript 的 `@require` 源码；真实点击“在当前网页试运行” | 固定 marked UMD 真正处理文本；已有 Chrome 来源权限时一键准备和执行 |

两个 D3 ESM 示例都调用同一上游 `d3-array v3.2.4/src/max.js`，SHA-256 `691945a453633d9e204846af8ea4e299821b924f82b15eaf7906aba642979b1d`。Controller 使用原隔离 Worker，Page 使用 Chrome USER_SCRIPT。Standard Edition 不带此浏览器编译器，不能在该草稿编辑方式中假装支持 ESM import；可使用已有本地预构建路径。

Page“保存 Candidate → 加载源码 → 试运行 → 验证冻结版本 → 安装自动运行”已在本轮候选测试；停用阻止后续文档执行，但不会回滚已经发生的 DOM 效果。Controller“保存版本 → 加载版本 → 运行草稿”仍是草稿运行，不能称为已安装固定 Revision 的运行。整浏览器退出后的离线重启、该 Controller 的正式任务安装、定时和 Cloud 触发尚未在本轮关闭。

维护者的 [trusted-imports](../../libs/trusted-imports/) 是受信 WXT 构建源码示例，不属于用户脚本入口；不能将用户下载的 ESM 放进 Service Worker。

定向真实测试复用原驱动，不另建 CI：

```sh
CHROME_FOR_TESTING_BIN=/absolute/path/to/Google\ Chrome\ for\ Testing \
OPENDESK_DEV_PACKAGE_DIR=/absolute/verified-candidate/dist/production-developer \
OPENDESK_DEV_EVIDENCE=/absolute/new-evidence-directory \
OPENDESK_R243_BROWSER_FULL_UI=1 \
OPENDESK_R72_DEPENDENCY_NATIVE_SMOKE=1 \
OPENDESK_R77_IMPORT_SCENARIOS=d3 \
node tests/framework/page-browser-worker-r243-cft.mjs
```

将 `d3` 改为 `classic`，复用 Page Classic A/B、Controller Classic、固定 npm/bare mitt 的真实驱动。工具构建与安装测试命令见工具 README。每次先核对测试资源、输入和已有证据，避免重跑没有变化的场景。

完整 SOURCE / NODE / BUILD / CHROME_CFT / MAC_NATIVE / SECURITY 状态、旧候选身份和当前构建限制见 [R7.7 交付记录](../../../docs/framework/workstreams/import-runtime-r77-20261014.md)。不支持任意裸 npm 包或任意传递 ESM 图；所需网站/来源授权仍必须由真实 Chrome 手势取得。

## R7.9.4 本地多文件混合 Import（源码已提交，真实 Chrome 待验收）

| 示例 | 同一次 `main()` 的三条 import | 按需与默认库 |
| --- | --- | --- |
| [Page 五机制综合示例](../mixed-import-page/README.zh-CN.md) | D3 HTTPS `max()` + npm lodash-es `escape()` + 相对 `getScores()` | `queryString.parse()`；默认 `_.words()`、`dayjs()`；读取 `document.title` |
| [Controller 五机制综合示例](../mixed-import-controller/README.zh-CN.md) | 同样的固定 HTTPS、npm、相对模块 | 真实 Axios `getUri()`；默认 `_.words()`、`dayjs()`；`page.title()` 只经原 Worker 代理 |

不是在单文件编辑器中硬塞项目目录，也不增加 `@opendesk/ui`。两个 `package-lock.json`、HTTPS 锁及缓存原始字节均随项目保存；[定向 Node/Build 测试](../../../tests/environment/mixed-import-projects.test.mjs)的 Webpack 场景需要先在**两个**项目目录 `npm ci` 并显式设置 `OPENDESK_MIXED_IMPORT_BUILD=1`。新组合的实际 Chrome 回执尚须 Mac 本地按既有 RunHost/USER_SCRIPT 验收，不将 R7.7 的单库 D3 PASS 写成此处 PASS。
