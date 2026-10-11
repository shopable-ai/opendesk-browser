# Read-only review — authority-review.md

Reviewer: Ramanujan (`01a1299f-cda3-7970-928c-dbc748eafea9`). This is a static source review; no browser or test PASS is inferred from it.

**接受本次修复；未发现旧异步结果误删不同授权身份新缓存的风险。**

- [workspace.js:73](/Users/shopme/Documents/workspace/opendesk-browser/src/native-agent/workspace.js:73) 删除前重新读取该 ID 的当前授权，比较 workspaceId、sourceId、leaseEpoch、sessionId、access；身份已变化或页面已关闭就跳过。比较与两个 `delete` 之间没有 `await`，不会被异步缓存更新插入。
- [workspace.js:143](/Users/shopme/Documents/workspace/opendesk-browser/src/native-agent/workspace.js:143) 刷新在 `busy` 时排队，[operation:140](/Users/shopme/Documents/workspace/opendesk-browser/src/native-agent/workspace.js:140) 于操作结束后才执行，正常 Save 路径不会并行安装新缓存。
- 删除仅影响指定 ID 的授权缓存；保留草稿、不安装返回的新 grant、不重放操作。结束时重新计算控件状态，使 Save/Save As 保守禁用。

保护按**授权身份**判断；同身份重新缓存仍属于可失效对象，并非按更新时间区分。新增回归仍待测试，本结论仅为静态审查；未运行测试或修改文件。
