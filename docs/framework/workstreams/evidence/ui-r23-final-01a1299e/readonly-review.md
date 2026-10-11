# 本轮最小修复只读审查

审查者：Ramanujan / 01a1299f-cda3-7970-928c-dbc748eafea9。独立子任务，无写入、测试或构建。

**未发现这两文件 diff 存在授权边界放宽或需要修改的问题。**

- [service.js:20](/Users/shopme/Documents/workspace/opendesk-browser/src/knowledge/service.js:20)：查询限定 `TAB`、完整 URL 和 tabId；返回后再次精确核对 documentId、frameId、非隐身状态，并要求唯一匹配。缺失 documentId、无匹配或 API 异常均继续拒绝。
- [service.js:10](/Users/shopme/Documents/workspace/opendesk-browser/src/knowledge/service.js:10)：原有同扩展工具宿主身份、顶层 frame、生命周期检查仍保留；安装身份与 packageHash 核验未被移除。
- [service.js:69](/Users/shopme/Documents/workspace/opendesk-browser/src/knowledge/service.js:69)：网页 capture 路径仍使用严格的 webNavigation、权限与导航检查，本次修改仅影响扩展工具 TAB。
- [knowledge-inbox-r1.test.mjs:118](/Users/shopme/Documents/workspace/opendesk-browser/tests/environment/knowledge-inbox-r1.test.mjs:118)：新增用例覆盖 null frame 正向场景，以及文档、tabId、frameId、隐身、URL、contextType 失配和缺失 context/documentId 的拒绝路径。

本次结论来自只读静态审查；未运行测试、未写文件、未构建。
