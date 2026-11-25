# Controller Task 参数作者示例

这里是独立 Controller Task 的统一作者入口。首次开发先阅读最小脚本；需要控件与约束参考时再打开完整示例。不需要为每个任务维护独立参数 UI，也不应手写派生 JSON。

| 文件 | 职责 |
| --- | --- |
| [task-params-minimal.example.js](task-params-minimal.example.js) | 两个参数、零参数 main() 与受控词法 params；无网页、网络副作用 |
| [task-params-header.example.js](task-params-header.example.js) | 14 个字段覆盖 12 类控件；完整示例的唯一作者源 |
| [task-param-items.example.json](task-param-items.example.json) | 完整示例的派生中间结构 |
| [task-params-v2.example.json](task-params-v2.example.json) | 完整示例的派生 Schema / UI Schema，供 R9 预览及测试比对 |

参数语法、校验、编译与支持边界以[唯一参数规范](../../docs/api/task-params.zh-CN.md)为准；实际业务脚本、源码及发布规范见[上一级脚本库](../README.md)。编写独立业务脚本应在 task-packs/<task-family>/ 或已有唯一业务 owner 中进行，不复制本目录为新的框架或安装器。

## 验证

仓库根目录执行：

```sh
node --test tests/environment/task-param-items.test.mjs tests/environment/task-param-header-r11.test.mjs tests/environment/task-params-contract-r10.test.mjs
```

从同一完整 JS 声明生成两份派生数据，并保持 R9 镜像一致。参数头部参考解析器已经存在，但 v2 正式构建、安装、动态表单、Authority 准入及 Chrome 真实运行尚未完成。Node 解析成功不是正式安装回执。

## 发行隔离

- examples 是保留分类名，不是可安装 Task family、默认安装项或正式市场发行目录。
- 本目录不维护正式 releases/、Task ID 或固定预置资源 pin；仅能在受控测试中显式构造候选，不绕过原安装审阅。
- 历史浏览器测试页面、HTTP 43111 Lab 和旧任务夹具仍归 [examples/tasks/](../../examples/tasks/README.zh-CN.md)，不整体搬迁。
