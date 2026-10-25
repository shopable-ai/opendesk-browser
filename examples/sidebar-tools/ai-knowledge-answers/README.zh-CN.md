# AI 知识问答 · R1.1

独立 Sidebar Tool v2，ID `ai-knowledge-answers`，版本 `0.1.1`。复用原 Tool Host、存储、Shared AI Provider 和唯一 React root。网站读取、草稿填入及自动发送留到下一阶段。

## 当前范围

- 原 HTML/CSS/JS 知识管理界面保持沙箱：固定问答、同义问题、限定范围、轻量检索、编辑、启停、删除、JSON/CSV。
- 复用 `storage.get({withEtag:true})` / `storage.set({ifMatch})` 与写后读回；结果未知时停写。单键上限仍为 8192 字节。
- 官方来源核验通过的安装实例，在原沙箱上方显示静态编译的可信 AI 控件。准备知识后审阅接收方及实际外发字段，再由真实 Send 点击同步进入原 Provider 授权路径。iframe 不持有 API Key、Native client 或 Provider lease。
- 模型只接收候选的 `id/question/answer/scope`，aliases 留在本机。发送及交付均核对安装身份，交付时回读 ETag。换 Provider、取消、Native 断线、相关权限撤销和知识更新会丢弃旧结果。
- AI 必须引用本轮真实知识 ID；新增数字事实被拒绝。语义仍需人工证明，所有 AI 答案为 `REVIEW_REQUIRED / needsHuman=true`。

定向 Node 与包验证已完成；真实 Local Codex backend 已返回有来源实答，并通过领域校验。**完整 Chrome 安装、保存后关闭重开、可信 Send 及原生错误恢复仍为 NOT_TESTED**，backend 成功不证明完整 UI 链。详见[现有工作记录](../../../docs/framework/workstreams/ai-knowledge-answers-r1-20261025.md)。

## 安装与首条待验证操作

唯一正式文件是本目录 `ai-knowledge-answers.opendesk-tool.json`，不是 `tool.config.json`。已由原打包器晋升，仍是待真实 Chrome 验收的可安装候选。

Browser 须包含本轮静态可信接线。日常开发复用 `dist/development` 已有 watcher；只导入 JSON 不会升级 Browser 的可信代码。

1. 在「扩展」官方可发现列表选择「AI 知识问答」，核对 `0.1.1`、来源、能力与摘要，使用原确认安装/更新流程。安装后打开即可，无通用二次启用步骤。
2. 仅从本地文件导入时，原安装器不会制造官方 provenance；知识管理继续可用，可信 AI 保持关闭。使用可信 AI 须通过同一安装器审阅准确官方发行，不能手写来源记录或借用其他工具身份。
3. 新建明确标为测试数据的知识“退款期限是多少 → 7 天内可退款”，添加别名“多久可以退款”，保存；关闭重开并核对数据。
4. 输入别名验证固定回答；输入“退款需要多少天？”准备候选，核对知识 ID、接收方与外发内容后发送。区分退款申请期限与处理/到账时长，不把测试数据当作企业政策。
5. 核对来源与人工审阅标记，再验证取消、换 Provider、断线、撤权和知识更新后旧答案失效。

本轮浏览器工具访问 `chrome-extension:` 被 URL 策略拒绝，未绕过策略。这些是待执行步骤，不是 PASS 记录。

## CSV 与验证

CSV 表头 `id,question,aliases,answer,scope,enabled`，aliases 是 JSON 数组。公式前缀添加单引号，CSV 对此类值不是无损往返；备份优先 JSON。原下载能力仅支持 `.json/.md/.txt`，CSV 当前复制到剪贴板。

在仓库根执行：

```sh
node --test tests/environment/ai-knowledge-answers-r1.test.mjs tests/environment/ai-knowledge-answers-provider-contract.test.mjs tests/environment/ai-knowledge-answers-admission.test.mjs tests/environment/ai-knowledge-answers-host.test.mjs
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
