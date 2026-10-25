# AI 知识问答 · R1 轻量检索原型及 MVP 增量

ID：ai-knowledge-answers。源码归属：examples/sidebar-tools/ai-knowledge-answers/。独立 Sidebar Tool v2，基于原有 OpenDesk Tool Host，不创建第二套运行时。

## 已写入源码

- L1 固定问答与同义问题；精确适用条件；编辑、启停、删除。
- L2 中文二元字、普通单词分词及轻量 BM25 检索；返回可核实的知识 ID。
- JSON / CSV 读入和导入预览、按 ID 合并或替换；JSON 请求下载、CSV 复制剪贴板。
- 安全存储：唯一 library 键，原 storage.get({withEtag:true})、storage.set({ifMatch})、写后再次读取核验。失败或结果未知时停写，防止自动重放。
- 10–20 条小型知识可先运行；存储上限是单个键 8192 字节，实际最长条数取决于内容。
- 对非精确问题明确标记 RETRIEVED_ONLY、needsHuman=true。未知事实不生成答案。

## 明确尚未完成

- 真实 Shared AI Provider 消费者接入和外部模型请求。model.answerWithAI 是纯领域校验接口，并未赋予 sandbox 调用 Provider 的权限。模拟 generator 的源码测试不能证明真实 AI 连接。
- Mac Chrome 的安装、保存、重开、原生权限、AI 推理和网站自动发送。
- 正式 JSON 包构建、验证、晋升和 Catalog 发布。

原因：当前通用 Sidebar Tool 的公开权限只有 storage.local、user.export 等；ai.access 是 AI VIP Share 专用代理控制权限，不是 AI 生成。Knowledge Inbox 的 knowledge.store 也不能借给本工具。共享 Provider 需要经第一方可信 Host / Trusted Consumer 单独批准，绑定真实用户手势、安装身份、权限撤销和原存储 ETag。须先验证既有 createBusinessConversation 和 Provider lease，不能添加沙箱专用秘密接口。

## CSV 格式与边界

CSV 表头顺序：id,question,aliases,answer,scope,enabled。aliases 字段是 JSON 数组；换行和双引号遵守 quoted CSV。为防止表格公式注入，CSV 导出给以 =、+、-、@ 等开头的内容添加单引号，因此 CSV 对此类值可能不是无损往返；无损备份优先 JSON。原 user.export 的 file.download 只支持 .json/.md/.txt，因此 CSV 目前只能复制剪贴板。

## 继续验证

在本机仓库最新 main 上运行（不要在独立 branch 或 worktree）：

    node --test tests/environment/ai-knowledge-answers-r1.test.mjs
    npm run build:sidebar-tool -- examples/sidebar-tools/ai-knowledge-answers

先核对真实打包器 CLI 输出、目录、Node 测试结果和包身份，再决定是否晋升正式安装包，禁止用 preview/mock 代替 Mac Chrome。真实 Chrome 必须实际使用空资料 → 新增 → 保存 → 关闭重开 → 重复 ID 导入拒绝覆盖 → 删除确认 → 并发冲突 → 未知回答转人工。AI 与网页阶段独立验收，不得由此阶段通过推导为成功。

正式包尚未创建；此项目不改变已安装工具的身份/数据，也不接管 Knowledge Inbox。
