# AI 知识问答 · R2.1 UI 与 R1.3 本地模拟聊天测试

独立 Sidebar Tool v2，ID `ai-knowledge-answers`，版本 `0.1.4`。复用原 Tool Host、存储、Shared AI Provider 和唯一 React root。R1.3 已在可信环境接入**仅固定本地 HTTP 测试页**的 DOM 观察、定时消息处理、草稿发送与独立 DOM 回执；这些新操作尚未完成真实 Mac Chrome 验收。其他第三方网站仍不在本轮范围。

## R1.3：从哪里开始测试（原生尚未验收）

本地客服模拟网页源码：`examples/tasks/ai-knowledge-chat-demo.{html,js,css}`。
只在确定端口空闲或服务是当前仓库版本时复用：

```sh
lsof -nP -iTCP:43111 -sTCP:LISTEN
python3 -m http.server 43111 --bind 127.0.0.1 --directory examples/tasks
```

在 Chrome 打开 `http://127.0.0.1:43111/ai-knowledge-chat-demo.html`；若 43111 已被占用，先核对既有服务，不杀进程或重启别的 Agent 的服务。可信适配器固定精确端口与路径，临时换端口不会自动变更适配器授权范围。

先通过官方安装器取得已验证来源的 `ai-knowledge-answers` 安装身份，导入 `fixtures/sample-knowledge.json`（14 条虚构演示政策，非商家事实），在可信侧栏点击**批准并监听本地测试页**，然后在测试网页发送「几天内可以退款」。默认需手动确认发送固定答案；只有开始前单独批准的固定答案才允许自动发送。非精确问题如「退款需要几天」必须经过真实 Shared Provider 和人工审核才可发送；定时消息仅在页面制造客户 DOM，不直接调用模型。

`fixtures/sample-knowledge.csv` 与 JSON 同值；`fixtures/answer-test-cases.json` 包含 52 个场景，37 个检索期可静态检验，15 个真实端到端阶段不得当作 PASS。默认 Side Panel 保持打开；暂停/停止可分别从网页和侧栏操作。来源、撤权、发送结果未知与会话切换的逐项验收步骤见 [R1.3 真实 DOM 测试记录](../../../docs/framework/workstreams/ai-knowledge-answers-r13-20261026.md)。连续点击同一发送确认的最小栅栏修复及证据见 [R1.3 并发回归](../../../docs/framework/workstreams/ai-knowledge-answers-r13-send-fence-20261026.md)。

**已复核的是业务源码和隔离 V8 逻辑，不是完整本机 Chrome/Native Provider/真实网站回执。** 修改的可信宿主代码仍须通过原日常 watcher 编译，并在当前开发 Chrome 中真实验证；不要只导入旧 0.1.2 JSON 就推断最新可信代码已经运行。

## 当前范围

- 原 HTML/CSS/JS 知识管理界面保持沙箱：固定问答、同义问题、限定范围、轻量检索、编辑、启停、删除、JSON/CSV。
- 复用 `storage.get({withEtag:true})` / `storage.set({ifMatch})` 与写后读回；结果未知时停写。单键上限仍为 8192 字节。
- 官方来源核验通过的安装实例，在原沙箱上方显示静态编译的可信 AI 控件。准备知识后审阅接收方及实际外发字段，再由真实 Send 点击同步进入原 Provider 授权路径。iframe 不持有 API Key、Native client 或 Provider lease。
- 模型只接收候选的 `id/question/answer/scope`，aliases 留在本机。发送及交付均核对安装身份，交付时回读 ETag。换 Provider、取消、Native 断线、相关权限撤销和知识更新会丢弃旧结果。
- AI 必须引用本轮真实知识 ID；新增数字事实被拒绝。语义仍需人工证明，所有 AI 答案为 `REVIEW_REQUIRED / needsHuman=true`。

R1.2 历史记录为 58 项定向 Node 测试通过，包含实际编辑器脚本在内存存储下的新建、保存读回、重开、同义回答与未知写入保护；这属于组件证据。已保留并行提交的未知写入恢复和本地测试接线，并验证普通手动问答不会自动读取网站，问题修改后迟到回答失效。0.1.2 修复 R2 UI 的打包失败和过时 AI 提示。旧记录中的真实 Local Codex backend 有来源实答不代表当前包已获原生验收。**完整 Chrome 安装、保存后关闭重开、可信 Send 及原生错误恢复仍为 NOT_TESTED**。详见[现有工作记录](../../../docs/framework/workstreams/ai-knowledge-answers-r1-20261025.md)，本轮结果见文末 R2.1-LOCAL。

## 安装与首条待验证操作

唯一正式文件是本目录 `ai-knowledge-answers.opendesk-tool.json`，不是 `tool.config.json`。已由原打包器晋升，仍是待真实 Chrome 验收的可安装候选。

Browser 须包含本轮静态可信接线。日常开发复用 `dist/development` 已有 watcher；只导入 JSON 不会升级 Browser 的可信代码。

1. 在「扩展」官方可发现列表选择「AI 知识问答」，核对 `0.1.4`、来源、能力与摘要，使用原确认安装/更新流程。安装后打开即可，无通用二次启用步骤。保留原知识数据，不先卸载；可信 Browser 准入版本也须与新包一致。旧开发输出未必包含本轮发行，不能凭源码版本推断 Chrome 已安装。
2. 仅从本地文件导入时，原安装器不会制造官方 provenance；知识管理继续可用，可信 AI 保持关闭。使用可信 AI 须通过同一安装器审阅准确官方发行，不能手写来源记录或借用其他工具身份。
3. 新建明确标为测试数据的知识“退款期限是多少 → 7 天内可退款”，添加别名“多久可以退款”，保存；关闭重开并核对数据。
4. 输入别名验证固定回答；输入“退款需要多少天？”准备候选，核对知识 ID、接收方与外发内容后发送。区分退款申请期限与处理/到账时长，不把测试数据当作企业政策。
5. 核对来源与人工审阅标记，再验证取消、换 Provider、断线、撤权和知识更新后旧答案失效。

本轮读取现有 Mac Chrome 扩展工作区再次被浏览器自动审批拒绝：URL 策略仅允许 HTTP/HTTPS，不允许 `chrome-extension:`。已停止该入口，没有改用其他表面、CDP 或 Profile 绕过。以上原生步骤仍待执行。

## CSV 与验证

CSV 表头 `id,question,aliases,answer,scope,enabled`，aliases 是 JSON 数组。公式前缀添加单引号，CSV 对此类值不是无损往返；备份优先 JSON。原下载能力仅支持 `.json/.md/.txt`，CSV 当前复制到剪贴板。

在仓库根执行：

```sh
node --test tests/environment/ai-knowledge-answers-r1.test.mjs tests/environment/ai-knowledge-answers-ui-r2.test.mjs tests/environment/ai-knowledge-answers-provider-contract.test.mjs tests/environment/ai-knowledge-answers-admission.test.mjs tests/environment/ai-knowledge-answers-host.test.mjs
npm run build:sidebar-tool -- examples/sidebar-tools/ai-knowledge-answers --out artifacts/sidebar-tools/ai-knowledge-answers/candidate.opendesk-tool.json
# 定向测试及包校验通过后才晋升：
node scripts/build-sidebar-tool.mjs examples/sidebar-tools/ai-knowledge-answers --promote-from artifacts/sidebar-tools/ai-knowledge-answers/candidate.opendesk-tool.json
node scripts/build-sidebar-tool.mjs examples/sidebar-tools/ai-knowledge-answers --check-project
```

Provider 契约及 Host 集成测试使用明确标注的 fake transport，只证明接线与保护；真实推理证据单独记录。晋升不代表已安装、线上上架或 production 验收。


## R2：问答首页／知识列表／独立编辑 UI

已在原 `src/index.html`、`src/style.css`、`src/main.js` 将原纵向堆叠改为互斥视图：问答（默认）、知识列表（搜索、筛选、行级进入编辑）和新建/编辑（返回、单一保存、删除确认）。导入导出是列表内更多操作。保留原 `model.js`、固定 ID、`storage.get({withEtag:true})` / `storage.set({ifMatch})`、写后读回与未知写入禁止重放。

可视化原型 `preview/index.html` **通过同源 HTTP** 加载 `../src/index.html`、`style.css`、`model.js`、`main.js`；唯一模拟的是 Host Storage 与文件导出，不得作为真实 Provider 或 Mac Chrome 验收证据。附带 `fixtures/sample-knowledge.json`（演示规则，不代表真实企业政策）。运行：

```sh
python3 -m http.server 43112 --bind 127.0.0.1 --directory examples/sidebar-tools/ai-knowledge-answers
# http://127.0.0.1:43112/preview/
node --test tests/environment/ai-knowledge-answers-ui-r2.test.mjs
```

若发现该端口被其他 Agent 占用，则复用原端口或选当前会话未占用的端口，不得终止他人的服务。R2 UI 对正式 Chrome 安装及独立 Provider 请求均维持 `NOT_TESTED`。

## R2.1 · 核心 UI 交互与同源预览（2026-10-26）

正式 HTML/CSS/JS 已设计为问答先行，知识加载条数及来源状态持续可见；长问题最多两行，删除入口在编辑页折叠危险区；取消、删除、导入预览进入侧栏可见的 Tab/Escape 确认层；Ctrl/⌘+Enter 快捷查询。

`preview/index.html` 通过 HTTP 继续加载正式 `src/index.html`、`src/style.css`、`src/model.js` 和 `src/main.js`，支持空库/14 条与 Host 保存冲突、回执丢失、读取失败测试。预览的可信 AI 审阅只模拟状态，**不调用 Provider**，不表示原生 Chrome 验收。原知识数据结构、ETag 写后读回、权限及工具 ID 不变；R2.1 初版 deae91c51 为 0.1.3，本轮最小 UI 修复晋升为 0.1.4。旧版测试不能冒充新版验证。

### R2.1-LOCAL 本轮实测（2026-10-26）

HTTP 正式源码预览中，已完成「输入退款期限是多少 → 查询固定答案与 qa_demo_refund 来源 → 知识列表 → 编辑 → 保存读回 → 返回列表 → 再次查询修改后的回答」。全部测试内容均为演示数据，不代表真实商家政策。

本轮仅修复已复现的 UI：保存及主动核对后的焦点恢复、未保存方向键导航的确认层焦点、异步导入取消及格式错误后的焦点、导出成功/失败后的焦点、问题/条件改变后旧结果失效、必填字段定位及 ARIA 错误关联、当前知识面板及行级启停/条件的可访问描述。冲突或回执未知时，文本保留为可选择复制的只读字段，保存及启停仍禁止；确认层背景使用 inert。保留原 ETag、写后读回和未知写入禁重放机制。除可信准入版本常量同步外，未改 Host、Provider、模型或存储实现。

预览在独立 iframe 中直接加载正式源码；仅从唯一正式包复用打包器生成的公共共享设计前缀，不执行包内 JS、不加载完整宿主 CSS。实际样式合成与正式包 CSS 逐字节相同。宽度按钮控制 iframe viewport，因此 320px 媒体查询及固定确认层也在该宽度内生效；这仍不是正式 opaque-origin Sandbox/CSP 验收。

| 证据层 | 本轮结果 |
| --- | --- |
| Node | 指定五份测试 88/88 PASS，含新增 26 条 UI 行为回归；内存 transport 不证明真实持久化或 Provider |
| Chromium 149.0.7827.55 HTTP 预览 | 22 组 PASS：核心链、搜索/停用后重查、歧义来源、空库、CRUD、未保存/取消/键盘、JSON/CSV 导入、实际 JSON 下载及 CSV 剪贴板、冲突/回执丢失后的实际键盘复制、失败与主动核对 |
| 指定四宽 | viewport 与 document/app scrollWidth 均为 320/360/400/440；长问题 180 字、答案 1200 字、条件 60 字无横溢；保存按钮 hit-test 可点；确认层宽 288/328/368/390px |
| 单一正式包 | 0.1.4，57,349 UTF-8 bytes；候选测试 → 同一打包器 promote-from → check-project PASS；SHA-256 745660cab46fe0009d500a4a948b62fa0553cd2fb762803c95d37835c4044649 |
| 现有 Mac Chrome 安装 | BLOCKED：浏览器 URL 策略直接拒绝读取现有 chrome-extension 工作区，仅允许 HTTP/HTTPS；安装版本、关闭重开、真实可信 AI 工作区分离均 NOT_TESTED。未绕过策略、新建 Profile 或重建/替换日常扩展 |

原始本地证据位于忽略目录 `artifacts/sidebar-tools/ai-knowledge-answers/`：`r21-ui-evidence.json`、浏览器原始结果 `r21-browser-result.json`、可复跑的 `r21-ui-browser-check.js`、`r21-node-final.tap`、`r21-source-proof.txt` 及四宽截图。现有其他 Agent 的改动与 watcher 保留。预览刷新会重置内存种子，不可当作关闭重开后的持久化证明。

四个独立子 Agent 分别从 UX、前端架构、无障碍、测试视角只读复评最新 diff 及父任务实际执行证据；测试视角另执行了定向组件回归。下表为 **Node＋源码／HTTP 预览层建议分**，不是 Mac Chrome 或完整 WCAG 认证。

| 维度 | 限定范围分数 /100 | 主要证据 |
| --- | ---: | --- |
| 布局统一 | 97 | 正式公共样式前缀与源码合成逐字节一致，四宽截图 |
| 信息可读性 | 96 | 固定答案、来源、候选、冲突与无依据分态；旧结果失效 |
| 操作效率 | 95 | 查询→编辑保存→返回及再次查询，取消后焦点恢复 |
| 响应式 | 98 | 320/360/400/440 viewport，长文本、保存 hit-test、确认层 |
| 无障碍 | 96 | Tab/Shift+Tab/Escape/方向键、inert、字段错误关联、真实键盘复制 |
| 架构隔离 | 96 | 继续使用 SDK root/request；预览仅模拟 transport，无新增权限或业务副本 |
| 代码可维护性 | 95 | 原 state/show/guard/commit 保留，禁止修改与禁止聚焦分开，无新增抽象层 |
| 测试证据 | 96 | 22 组 Chromium 结果、Node 行为回归、下载及剪贴板内容检查 |
| 异常恢复 | 96 | 冲突/未知写入停写、可复制输入、主动回读；坏 JSON 和导出失败恢复 |

**最终综合平均：未计算。** 原生安装、保存后关闭重开、真实可信工作区与沙箱隔离缺少本轮证据，维持 BLOCKED / NOT_TESTED / NOT_SCORED；不能用预览评分补齐或宣称“全部 ≥95 的完整验收通过”。剩余可选覆盖包括写后读回不一致及连续恢复失败，并非已复现 UI 缺陷，不扩大本轮工程。
