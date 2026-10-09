# OpenDesk Browser：网页 HTML 安全读取 R1（Controller）

> 主分支实现合同：`page.content()` 兼容保留，新增显式限量读取与同文档快照分块读取。只在已授权的 Controller 环境生效，不扩大 Page USER_SCRIPT、SDK 或网页权限。

## 结论

- `page.url()` 返回地址；`page.title()` 返回标题。
- `page.content()` 返回 `document.body.innerHTML`，**不是完整 HTML 文档的 outerHTML**；旧行为保留。超过 Control Value 64 KiB *编码后的消息*上限会抛 `E_PAGE_CONTENT_TOO_LARGE`。
- `page.content({maxChars:4000})` 在网页侧截取不多于 4000 个 UTF-16 字符再传输；这是**明确要求的片段**，不是全量。最大 8192，最小 2；不会在代理/Worker 收到超限数据后才截取。跨代理传输后需要 Unicode 代理项完整，因此长度在边界处可能少 1。
- `for await (const html of page.contentChunks({chunkChars:8192}))` 使用**同一次**网页 HTML 快照和按序传输；即使 SPA 在读取中改变 DOM，也不会拼接不同瞬间的数据。单次快照最多 8 MiB（UTF-8 字节），寿命 60 秒，最多占用当前 Controller Page Session 的一个快照，提前退出和出错执行 finally 清理；停止/重载时强制清理。
- 每块仍经过原 Controller `runId/ownerEpoch/revision/tabId/frameId/documentId` 权限验证及 64 KiB Codec；未引入第二条直通链路或额外的远程访问权限。
- **不能** `return [...chunks].join('')` 作为大型任务结果：最终返回值也有 64 KiB 限制。应在读取时搜索、解析或计算，将精简结果返回给侧栏。当前 R1 **没有**加入大文件直接下载，不把未来功能伪装成已交付能力。

## 示例

```js
async function main() {
  return {
    title: await page.title(),
    url: await page.url(),
    preview: await page.content({maxChars:4000}),
    value: params.value
  };
}
```

```js
async function main() {
  let chunks = 0;
  let chars = 0;
  let hasTargetText = false;
  for await (const html of page.contentChunks()) {
    chunks++;
    chars += html.length;
    if (html.includes('目标文本')) hasTargetText = true;
  }
  return {chunks, chars, hasTargetText};
}
```

注意：字符串在分块边界可能将搜索词分开；上例仅用于演示 API。如需跨块搜索，请保留词长减一的尾部，或直接在网页 DOM 中查询。若要获取完整文档的 `<html>` 元素而不仅是 body，请选用网页执行接口读取 `document.documentElement.outerHTML`，并同样控制返回数据大小和授权。

## 错误与恢复

| 代码 | 解释 | 处理 |
| --- | --- | --- |
| `E_PAGE_CONTENT_TOO_LARGE` | 旧版一次性读取超 64 KiB，或快照超过 8 MiB | 片段读取、页面内提取所需数据；不要盲目增大全局限制 |
| `E_VALUE_SERIALIZATION` + `Wire byte budget exceeded` | 任意接口或最终结果序列化超限 | 缩小最终返回值、按需返回字段；不等于 JavaScript 语法错误 |
| `E_PAGE_CONTENT_BUSY` | 一个 Session 已打开内容快照 | 关闭/结束先前迭代，或串行读取 |
| `E_PAGE_CONTENT_EXPIRED` | 快照关闭、超时或页面会话已失效 | 重新执行读取 |
| `E_PAGE_CONTENT_SEQUENCE` | 分块偏移不符合顺序 | 不并行、不要重放旧偏移 |

## 边界、隐私及验证

1. 不自动推送、上传或同步 HTML。网页内容可能含敏感信息；任务作者需主动选择处理方式。
2. 回执继续受网站授权、原页面 document 与任务身份绑定；撤权、停止、页面导航后不得发送后续块。
3. 不跳过最终 Result 编码限制，不把缓存存入 SW/全局或允许其他任务读取。
4. 确保英文、中文、Emoji、单双引号与富 HTML 安全编码；避免在 UTF-16 代理对中截断；长度按 JavaScript UTF-16 代码单元统计。
5. Node 测试只证明组件和协议契约；真实 Chrome MV3（撤权、导航、关闭侧栏、动态 DOM）还需本地验收证明。当前不能据此宣称完整原生浏览器验收通过。
