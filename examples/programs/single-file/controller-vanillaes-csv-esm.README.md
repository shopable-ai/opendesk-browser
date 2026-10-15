# Controller 单文件 ESM：真实第三方 CSV 库

**历史保留说明（2026-10-15）：** 本样例用于真实 ESM 三模块图、固定版本及缓存回归验证。新的业务 CSV 默认方案已切换为 [Papa Parse 5.7.0（Page）](page-papaparse-csv.README.md) 和 [Papa Parse 固定版本 Controller ESM](controller-papaparse-esm.js)。不得以更换业务首选库为由删除本样例及离线测试夹具；已安装程序不得静默替换依赖。

**Developer Edition R4 验收样例，非 Standard 版直接 ESM**。复制 [controller-vanillaes-csv-esm.js](controller-vanillaes-csv-esm.js) 到 Side Panel「开发」→ JavaScript 编辑器，脚本 ID 选例如 `sample.real-csv-413`。

第三方库：`@vanillaes/csv@4.1.3`（MIT），来源：<https://github.com/vanillaes/csv/tree/v4.1.3>。这不是内置库，也不是模拟 Papa Parse。

```js
// @opendesk-import @vanillaes/csv https://raw.githubusercontent.com/vanillaes/csv/v4.1.3/src/index.js
import {parse} from '@vanillaes/csv';
export default async function main() {
  const [, ...rows]=parse('name,price\nBook,18\nPen,3');
  return {count:rows.length,total:rows.reduce((n,r)=>n+Number(r[1]),0)};
}
```

**当前 R4 已有操作步骤（历史实现，非目标 UX）：**在 Developer 版编辑源码，打开下方与 Page 共用的「检查依赖」区域。首次检查只发现源地址，不下载；经用户明确确认逐个获取 `index.js`、`parse.js`、`stringify.js` 后，审核完整来源、大小、SHA-256、许可证（自动无法识别时由用户核对），再确认固定。点击「运行草稿」后调用受控 Controller Worker 并返回 `count: 2`、`total: 21`。保存会将自包含已编译产物和作者源码哈希一起固定，加载版本应恢复编辑源码。相同缓存字节可跨独立程序复用，系统仍须给每个程序自动生成独立固定锁（现阶段 UI 仍要求人工确认，待修复）。

**正式产品目标（2026-10-13）**：用户在「开发」编写上述代码后**直接点击 Run**；自动解析/准备/校验三模块并运行，无需逐个审批 SHA/许可证。确有缺失 Chrome 权限时保留原生提示；第二程序使用同一库自动复用 SHA，免再次人工库审批，但不继承站点/敏感能力授权。**当前 R4 尚未实现这种零人工依赖审核的体验**。权威方案见 [通用依赖长期合同](../../../docs/framework/universal-dependency-runtime-usage-contract.zh-CN.md)。

**边界：**不授予后台特权；获取第三方源的 Chrome origin permission 与获授权网页的 Controller 权限不同。**当前 R4** 普通 Run、Save、Load 不下载新依赖；**目标**是用户主动点击 Run 时按必要 Chrome 权限自动准备，Save/Load、已固定 Revision 的重复运行和离线执行仍不应隐式联网。程序执行 world 为 `CONTROLLER`，不是网站 MAIN 或 Page USER_SCRIPT。大于浏览器准备/传输容量或不兼容模块，请使用原生本地项目编译。真实 Mac 浏览器首下载和重启复用的证据只能按相应 CI 回执标记；Node 验收不等于 Chrome PASS。

测试固定原始字节保存于 `tests/fixtures/external-esm/vanillaes-csv-4.1.3/`，包含上游 MIT LICENSE，不进入扩展运行时 ZIP；这些文件仅是**离线回归测试资产**。

原始版本 SHA-256：

| 文件 | 原始字节 | SHA-256 |
| --- | ---: | --- |
| index.js | 114 | `2bd2f3a102328c7defa541f475353ee6103aeba24143d70d734f22eeb683d734` |
| parse.js | 4528 | `9bc0f8f634de34595afb4d98bf9eb28a49e8b20572420f4d4a8d549258e0abc5` |
| stringify.js | 1913 | `87886528603713273df58183ded8b40a22dd8f0f6645e287b759a0631c81c9a9` |
| LICENSE | 1102 | `1b2f6995df338ee08ee483fa6fbbead2f455d9c08a7b8cb8ba3de0d100c7148f` |

验证：`node --test tests/environment/controller-esm-runtime-r4.test.mjs`
