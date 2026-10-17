# ChatGPT Mind Map R3.9.6：透明包装三级列表修复

- 日期：2026-10-17；负责人：本次 bounded executor。
- 分支：`main`；与主 agent 共享工作目录，不操作 Git 索引、分支、worktree、PR 或浏览器。
- 类型：Page USER_SCRIPT 业务修复；使用 `opendesk-script-authoring`，无 SDK 缺口、权限或安装合同变更。
- 独占写入：`examples/programs/chatgpt-mindmap/src/extract.js`、`examples/programs/chatgpt-mindmap/tests/extract-wrapped-lists.test.mjs`、`examples/programs/chatgpt-mindmap/tests/fixtures/extract-wrapped-lists.html` 及本记录。
- 主 agent 负责候选 6 原生证据归档和关闭代码审阅；此 executor 不写其文件。
- 依赖/资源：现有 `linkedom`、Node test runner；读取真实候选 6 baseline，不占用浏览器、端口、dist 或构建输出。

## 问题与通过条件

`list()` 只识别 LI 直属 UL/OL/PRE/TABLE。真实回复的 DIV 包装把后代列表标题混入父节点，并漏掉后代结构。先以真实 HTML 裁出的最小三级结构写失败回归，再将 LI 文本与本层嵌套结构分开收集，透明包装按 DOM 顺序穿透，遇结构停止下钻，由原处理器递归，避免重复。

回归须验证三级归属与顺序、混合 UL/OL、长文 notes、隐藏/skip 内容、中文/English/数字/链接可见文本，以及原 MAX_NODES/MAX_DEPTH/notes 限额。

## 验证状态

- 真实回归来源：`artifacts/chatgpt-mindmap-r396-local-frame-20261017/toggle-c6-baseline.json` 的 `html`；原 HTML SHA-256：`b4fe01ee3f4080f772193ac901d24e025f82d669b54891b773b21555bb025f44`。
- fixture 保留首个三级列表的前两个顶层 LI 及全部后代，删除注释和展示属性；保留真实 DIV/P/SPAN/UL/LI 拓扑及中文原文。样本独立存于仓库业务 `tests/fixtures/`，测试运行不读取 artifacts。
- 修复前执行新测试：6 项中 5 FAIL、1 PASS；真实样本只输出两个扁平长节点，三级归属、混合结构、隐藏内容、后代及深度均复现问题。
- 实现仅修改 `list()`：一次收集当前 LI 文本与本层结构，遇 UL/OL/PRE/TABLE 停止下钻；隐藏和 SKIP 子树排除；结构按原 DOM 顺序交原处理器，不重复遍历后代。
- `node --test examples/programs/chatgpt-mindmap/tests/extract.test.mjs examples/programs/chatgpt-mindmap/tests/extract-wrapped-lists.test.mjs`：14/14 PASS，其中新增 6 项。
- 在上述命令追加 `examples/programs/chatgpt-mindmap/tests/xmind-adapter.test.mjs`：17 PASS、0 FAIL、3 SKIP；3 项真实 SDK 测试因缺少 `XMIND_REFERENCE_DIR` 为 `NOT_TESTED`。
- `node --test examples/programs/chatgpt-mindmap/tests/xmind-answer-registry-lifecycle.test.mjs`：9/9 PASS。
- 两个 JS 文件 `node --check` PASS；`git diff --check` 及 extract 文件定向 diff 检查 PASS。
- 上限验证：MAX_NODES 含根节点共 160（输出 159）；MAX_DEPTH 为 8；标题 72 字符、单节点 notes 1200 UTF-16 单元、总 notes 22000 单元，emoji 代理对不截断；全部 PASS。
- 用户告知 CI 汇总入口 `tests/environment/chatgpt-mindmap-r1.test.mjs` 由主 agent 单独添加新测试 import；本 executor 未写该入口。
- 本记录路径由 `.gitignore:71` 的 `/docs/framework/workstreams/**` 忽略；保留本机记录，不操作索引或修改忽略规则。

## 交接边界

本任务完成业务源码与定向 Node 验证，不新增依赖，不构建、不运行浏览器、不改安装包或其他文件、不提交。候选 6 原生 8 阶段和 23 项组件 PASS 为主 agent 已报告证据；本次 extract 新源码的 Chrome 结果为 `NOT_TESTED`，不继承旧候选 PASS。隐藏判断沿用现有 `hidden` / `aria-hidden` / SKIP 合同，不引入浏览器计算样式读取。PRE/TABLE 继续使用原 notes/table 处理逻辑。
