# 只读 Controller UI fixture

仅供本轮真实 UI 验证的 **test-owned fixture**，不是产品任务、官方目录条目或发布样例。唯一身份为 `test.ui.readonly@1.0.0`；同目录 JS 是源码，JSON 用原 `createTaskPackage` / `digestUtf8` 生成。创建阶段只准备静态候选；随后 UI 验证 owner 已在本任务临时 CFT Profile 经原验证/安装链完成安装、成功 Run 与 Stop，未装入日常 Profile、未提交或发布。最终证据见下方记录。

## 合同与边界

- 沿用[Controller 编程合同](../../../../docs/api/controller.zh-CN.md)和[只读示例](../../../../examples/tasks/page-read-fixed.js)。Worker 调用 `main()`，`page` / `params` 是词法绑定；不能写 `main(params)` 遮蔽真实参数，也不能写 `main({page, params})`。
- 固定目标为 `http://127.0.0.1:43111/demo-form.html`，等待前后均用 `page.url()` 严格校验；其他路径、query、fragment 或 credentials 均拒绝。manifest 只批准精确 origin，源码进一步限制页面。
- 唯一网页内容读取为 `page.title()` 和 `page.locator('h1').textContent()`。不 click/fill/submit，不合成事件，不调用 network/storage/navigation，不置前窗口，不读正文。只声明 `page.automation`，没有 network 或 storage 权限。
- 等待使用 Worker 定时器，不操作网页。Stop 复用原 RunHost/Worker 终止机制，不自建取消链。宿主打开目标页及持久化运行回执属于原框架流程，不是 fixture 主动导航、网络或存储操作。
- `matched` 仅表示 query 是否匹配标题或 H1；`false` 是正常只读结果，不代表 Controller 执行失败。默认 `UI test` 预计不匹配演示页。

| 参数 | 类型 / 约束 | 默认 |
| --- | --- | --- |
| query（校验文本） | string，长度 1–80 | `UI test` |
| holdMs（等待毫秒数） | integer，0–20000 | `0` |
| mode（匹配模式） | enum：`contains` / `exact` | `contains` |
| caseSensitive（区分大小写） | boolean | `false` |

schema 为封闭对象，默认值由原 `validateTaskParams` 归一化；最长运行期限 `deadlineMs: 30000`。

## 复用原 UI 的验证与安装步骤

1. 复用本轮验证 owner 的既有 Browser、加载目录、开发服务和 Profile，不替换扩展或覆盖 watcher。确认其实际构建与连接状态；本 fixture 不启动这些资源。演示服务由该 owner 确认可用后，打开上述精确 URL，按原合同授予必要站点权限；不要附加观察 query。
2. 在 Side Panel「我的 → 添加任务 → 浏览任务目录」的现有导入入口选择 `ui-readonly.opendesk-task.json`。核对 ID、版本、源码 SHA、唯一 origin、`page.automation`、30 秒期限和四项参数。导入后应为**待验证**，不能直接视为 Available/Installed。
3. 用同一冻结源码在固定目标上真实运行，参数选 `query: "Browser Test Lab"`、`holdMs: 0`、`mode: "exact"`、`caseSensitive: true`。标题应为 `OpenDesk Browser · Browser Test Lab`，H1 应为 `Browser Test Lab`，`matched: true`。核对真实页面真值与持久结果的 runId/resultId/sourceHash、completed 和 retirementState=released；页面表单不应被改变。
4. 用匹配该候选的真实成功运行及原生回执完成原验证链，再设为本地可用并审阅安装。Node 检查或 mock 不能替代该验证，也不绕过安装确认。安装后在「我的」运行固定版本，无需额外通用启用。
5. 检查真实参数控件：文本框、整数输入、枚举选择及布尔开关；确认默认值。分别尝试空文本、81 字符、负等待、20001、非整数等无效值，应被原 schema 校验拒绝；不要放宽校验。切换枚举和布尔值后确认回执参数一致。
6. 以 `holdMs: 20000` 运行，在 20 秒等待窗口内点击 Stop，查询**原** runId，核对取消原因 `E_CANCELLED`、终态及 released，不应产生成功读取结果。取消回执未知时只读查询，不自动重放运行。
7. 复用持久 Profile 时通过原 UI 卸载测试任务；本轮使用任务专属临时 Profile，关闭浏览器并删除整个临时 Profile 清理安装态。仅释放本轮 owner 的资源，不碰其他任务或服务。保留真实失败和未知回执，不把它们标成 PASS。

## 同源复核 / 再生成

从仓库根运行以下单次离线打包命令（不启动产品构建、不执行 Controller）：

```sh
node --input-type=module <<'JS'
import {readFile, writeFile} from 'node:fs/promises';
import {createTaskPackage} from './src/platform/tasks/contract.js';
import {digestUtf8} from './src/platform/protocol.js';
const dir = 'tests/fixtures/tasks/ui-readonly';
const sourceUtf8 = await readFile(`${dir}/ui-readonly.js`, 'utf8');
const previous = JSON.parse(await readFile(`${dir}/ui-readonly.opendesk-task.json`, 'utf8'));
const manifest = previous.manifest;
manifest.program.sourceHash = await digestUtf8(sourceUtf8);
const next = await createTaskPackage(manifest, sourceUtf8);
await writeFile(`${dir}/ui-readonly.opendesk-task.json`, JSON.stringify(next, null, 2) + '\n');
console.log({sourceHash: manifest.program.sourceHash, manifestHash: next.manifestHash});
JS
```

此命令只适用于尚未冻结/安装的测试准备；已导入或安装后修改源码/清单，须按原不可变版本合同递增 version/revision 并重新验证，不能用相同版本替换旧身份。

当前源码 SHA-256：`496a021b49deac5a0736169d71a01fbfb56f6ad0989a03d923a761defc85c2b3`。
当前 manifestHash：`b0050ce41d8de31a4b2e30af5556f0dbb18dec707dab6faec374842688f06d26`。

## 本轮实际记录（2026-11-11）

最终候选 `63879a1c65e8c698dcc451817f1151cd9b4bcb873ec1979083a5017bd3d4da13`，Chrome 155 原生 Side Panel 360×819 CSS px、DPR 2，加载 `dist/development` 并连接既有 dev watcher。原导入→同源真实运行验证→本地可用→安装已完成，没有写入存储伪造安装态或绕过 Authority。

- 成功运行：runId `140781f3-69cb-428e-a7b3-072d75bf8ca9`，resultId `efe9fa63-e099-4885-add9-37818fb4c617`。参数为 `Browser Test Lab`、`0`、`exact`、`true`，标题/H1 与上述真值一致，`matched: true`，completed/released。
- Stop：runId `7f48e499-cc5c-4fb5-9ee5-9463cc172427`，resultId `bd5b2062-77eb-4999-a6f4-27d7bdaaf9a8`。等待 20000ms 时经原按钮停止，显示 `E_CANCELLED`，持久终态 stopped/released。此前两次驱动操作未赶上等待窗口，结果为 completed，不计为 Stop PASS。
- 实测四类控件、空文本/超上限拒绝、修正字段后错误隔离、Enter 不隐式运行、Escape 返回焦点、关闭/跨 Tab 保留草稿和同一输入节点。81 字符、负数、非整数的完整原生逐项矩阵未执行；不将步骤清单视为全部通过。
- [最终候选绑定](../../../../artifacts/five-tab-core-ui-20261111/candidate-binding.json)、[持久回执](../../../../artifacts/five-tab-core-ui-20261111/persisted-final-runs.json)、[截图与失败分类](../../../../artifacts/five-tab-core-ui-20261111/README.md)保留真实范围。production、实体 OS IME、Native 本地项目和完整宽度/缩放/主题矩阵为 `NOT_TESTED`。
