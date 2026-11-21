# 单文件 JavaScript 示例

这些文件用于「开发」中的单文件草稿入口，使用 `async function main()`，不添加 `export default`。完整本地 ESM 项目是另一种入口，不要混用格式。

## Controller

打开 [Controller 零参数示例](controller-globals-zero-arg.js)，将代码放入「自动化 JS」，选择目标网页与参数，经原权限审阅后运行。`page` / Locator 是受控环境提供的能力；不要从网页 `window` 获取，也不要自行注入 Chrome API。

[Controller API 与运行说明](../../../docs/api/controller.zh-CN.md#developer-controller-quickstart)。

## Page

打开 [Page 零参数示例](page-globals-zero-arg.js)，将代码放入「网页 JS」，在已授权的当前网页试运行。这里可使用 `document`，没有 Controller 的 `page`。Chrome 138 起可能需要在扩展详情打开「允许用户脚本」。试运行不会自动安装脚本或扩大网站权限。

[Page API 与试运行说明](../../../docs/api/page-userscript.zh-CN.md#developer-page-quickstart)。

预置变量、依赖及运行世界详见 [运行环境合同](../../../docs/api/runtime-globals-and-preinstalled-libraries.zh-CN.md)。这些示例源码和文档不是当前发布候选的 Chrome 验收证明。
