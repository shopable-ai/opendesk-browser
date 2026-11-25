# Controller Task 参数作者示例

这里是独立 Controller Task 的参数作者示例导航。[返回脚本库总目录](../README.md)。目标是让开发者和 AI 在一个 JS 文件中编写参数声明与业务代码，由框架生成参数表单；不为每个任务编写独立参数 UI，也不手工维护派生 JSON。当前只完成参考解析器，正式 v2 运行接入仍待实施。

## 1. 从哪个示例开始？

初次开发先打开最小双参数脚本；遇到下拉框、滑块、复选框、日期等控件时，再打开完整示例。两份 JS 是不同用途的作者参考，均不包含真实网站操作或网络副作用。

| 文件 | 职责 |
| --- | --- |
| [task-params-minimal.example.js](task-params-minimal.example.js) | 两个参数、零参数 main() 与受控词法 params；无网页、网络副作用 |
| [task-params-header.example.js](task-params-header.example.js) | 14 个字段覆盖 12 类控件；完整示例的唯一作者源 |
| [task-param-items.example.json](task-param-items.example.json) | 完整示例的派生中间结构 |
| [task-params-v2.example.json](task-params-v2.example.json) | 完整示例的派生 Schema / UI Schema，供 R9 预览及测试比对 |

参数语法、校验、编译与支持边界以[唯一参数规范](../../docs/api/task-params.zh-CN.md)为准；实际业务脚本、源码及发布规范见[上一级脚本库](../README.md)。编写独立业务脚本应在 task-packs/<task-family>/ 或已有唯一业务 owner 中进行，不复制本目录为新的框架或安装器。

## 2. 最小示例如何理解？

[打开最小双参数脚本](task-params-minimal.example.js)。它声明必填字符串 keyword，以及默认值为 20、范围为 1–100 的整数 limit；业务入口保持零参数 main()，使用执行环境提供的词法 params。

| 验收项目 | 预期行为 |
| --- | --- |
| 输入参数 | `{"keyword":"test","limit":30}` |
| 脚本预期返回 | `{"keyword":"test","limit":30}` |
| 省略 limit | 正式归一化后应补入 20 |
| 缺少 keyword / limit 越界 | 正式执行准入应拒绝，不运行脚本 |

这里列的是正式接入完成后的验收目标，不是已经取得的 Chrome 运行结果。目前可通过静态解析测试查看生成的契约；不能把两份示例直接作为已支持的 v2 安装包。

## 3. 相关技术文件导航

| 要查看的内容 | 真实文件 |
| --- | --- |
| 声明语法、12 类控件、默认值、安装与压缩边界 | [task-params.zh-CN.md](../../docs/api/task-params.zh-CN.md) |
| 文本提取与 Schema 转换 | [compile-task-param-items.mjs](../../scripts/compile-task-param-items.mjs) |
| 标准契约的机器元 Schema（形状约束，不代替语义校验） | [opendesk-task-params.v2.schema.json](../../schemas/opendesk-task-params.v2.schema.json) |
| 参数窗口交互设计（离线原型源码，不是正式 UI） | [prototypes/sidebar/my/index.html](../../prototypes/sidebar/my/index.html) |
| 文本解析、派生数据一致性 | [task-param-items.test.mjs](../../tests/environment/task-param-items.test.mjs) |
| 前导注释、重复声明、编码限制、目录迁移检查 | [task-param-header-r11.test.mjs](../../tests/environment/task-param-header-r11.test.mjs) |
| R10 契约、原型镜像及 legacy 兼容检查 | [task-params-contract-r10.test.mjs](../../tests/environment/task-params-contract-r10.test.mjs) |
| 正式发行清单与示例隔离 | [packaged-task-resources.test.mjs](../../tests/environment/packaged-task-resources.test.mjs) |
| AI 编写、调试与发布工作流 | [作者 Skill](../../.agents/skills/opendesk-script-authoring/SKILL.md) · [发布 Skill](../../.agents/skills/opendesk-program-publish/SKILL.md) |

## 4. 验证

仓库根目录执行：

```sh
node --test tests/environment/task-param-items.test.mjs tests/environment/task-param-header-r11.test.mjs tests/environment/task-params-contract-r10.test.mjs
```

如果修改完整示例的参数声明，应从同一 JS 源重新生成两份派生数据，并保持 R9 镜像一致；不要反向手改 JSON 作为第二份作者源。参数头部参考解析器已经存在，但 v2 正式构建、安装、动态表单、Authority 准入及 Chrome 真实运行尚未完成。Node 解析成功不是正式安装回执。

## 5. 发行隔离

- examples 是保留分类名，不是可安装 Task family、默认安装项或正式市场发行目录。
- 本目录不维护正式 releases/、Task ID 或固定预置资源 pin；仅能在受控测试中显式构造候选，不绕过原安装审阅。
- 修改发行发现或打包机制时，另执行 `node --test tests/environment/packaged-task-resources.test.mjs`（须具备仓库测试依赖），验证示例不能被当作正式预置资源。
- 历史浏览器测试页面、HTTP 43111 Lab 和旧任务夹具仍归 [examples/tasks/](../../examples/tasks/README.zh-CN.md)，不整体搬迁。
