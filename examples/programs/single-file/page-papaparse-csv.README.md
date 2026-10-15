# Papa Parse 5.7.0：OpenDesk CSV 首选

正式 CSV 首选为 **Papa Parse**，保留原生 `Papa.parse()` / `Papa.unparse()`，不再推荐用 `@vanillaes/csv` 编写新的业务 CSV。历史 `controller-vanillaes-csv-esm.js` 继续保留为 ESM 三模块锁验证样例，不删除测试夹具、不修改已有固定 Revision。

## Page USER_SCRIPT：安装包内置，声明时按需加载

在 Side Panel「开发」的 Page / 网页试运行中复制 [page-papaparse-csv.js](page-papaparse-csv.js) 源码（使用 `async function main()`）。它只需要一行：

```javascript
// @opendesk-lib papa-parse
```

运行时由现有 Catalog/manifest/固定 SHA 载入官方 `papaparse.min.js`，用户无需 npm/CDN。不会注入目标网页 MAIN，也没有额外 Chrome API 权限。实际输出应包含 `count:4`、首行对象及正确转义的 CSV 文本。`escapeFormulae:true` 防御常见公式注入，导入不可信 CSV 时仍须验证字段、大小及类型。

### 保存 CSV 文件

在有有效用户手势的 Page 环境中，显式声明两个现有可选资源，然后沿用原生 FileSaver：

```javascript
// @opendesk-lib papa-parse
// @opendesk-lib file-saver
async function main() {
  const csv = Papa.unparse([{name:'Book',price:18}], {
    columns:['name','price'], newline:'\r\n', escapeFormulae:true
  });
  FileSaver.saveAs(new Blob(['\uFEFF',csv],{type:'text/csv;charset=utf-8'}), 'products.csv');
  return {requested:true}; // 仅表示发起调用，不是落盘成功回执
}
```

**限制：**FileSaver 在 Page USER_SCRIPT 中不需要 `chrome.downloads`，但实际保存依赖浏览器用户手势/环境，异步准备资源后用户激活可能失效。已安装 Sidebar Tool 是独立 sandbox，不会继承 `Papa` 或 `FileSaver` 的 Page 全局；工具可以在自身固定 npm 构建中 `import Papa from 'papaparse'`，本地生成 CSV 后继续使用现有受信下载 Host/SDK。

## Controller Developer：标准固定版本 npm ESM

[controller-papaparse-esm.js](controller-papaparse-esm.js) 采用 `import Papa from 'papaparse@5.7.0'`。这是独立 Controller ESM 导入方式，使用现有依赖锁和权限机制，**不是** Page `@opendesk-lib`；实际来源解析与 Chrome 执行仍需同候选验收，不能以 Page 预装成功冒充 Controller 完成。

## 验收边界

源文件、固定哈希及 Node 回归、正式构建、真实 Chrome、生命周期、下载落盘应分别出具证据，不以文档样例视作 Chrome PASS。上游来源：https://github.com/mholt/PapaParse/tree/5.7.0，许可证 MIT。
