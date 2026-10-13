# EXP-005 · Listing / SKU 检查器（R3 MVP）

**这是可运行的 Page USER_SCRIPT 项目，不是独立 Chrome 扩展，也不是自动接入任何卖家后台。** 商品数据只来自仓库标准测试页面中显式标记的 `seller-listing-v1` 表单区域；不发送网络请求、不修改 SKU/价格/库存、不保存账号或订单数据。

## 使用（本地 Mac 仓库）

1. 确认其他 Agent 没有占用构建目录、HTTP 43111 或 Chrome profile，不能停止他人的任务。扩展已从同一候选构建并安装，Chrome 已启用「允许用户脚本」并授权 `http://127.0.0.1:43111`。
2. 仓库根启动已有标准测试页（若端口由已知测试服务占用则复用，禁止抢占）：
   `python3 -m http.server 43111 --bind 127.0.0.1 --directory examples/tasks`
3. 打开 `http://127.0.0.1:43111/demo-form.html`，滚动到 `Listing / SKU` 业务测试区域；按钮可切换正常、缺失、重复和变体异常场景，也可直接编辑字段。
4. 使用已有 Side Panel **「开发 → 本地项目」**，连接 `examples/programs/listing-sku-inspector` 并点击 **运行本地项目**（需要已配对 Native Host）；无需新安装器或新扩展。如果不使用 Native，本项目也支持已存在的冻结包流程：
   `node scripts/validate-program-project.mjs examples/programs/listing-sku-inspector`
   `npm run build:program -- examples/programs/listing-sku-inspector`
   然后从「发现 → 导入」选择构建输出的 `program.opendesk-draft.json`，返回「开发」选择 Page 并**在当前网页试运行**。
5. 页面右上角出现 `Listing · SKU 检查` 面板；点击 **检查当前商品** 才会读取表单并展示错误数、提醒数和具体行字段。改字段后再次点击可重检，关闭按钮和已有 Stop 入口清理 UI。

## 结果和错误

正常数据提示 `0 项错误 · 0 项提醒`；缺失标题/主 SKU/变体 SKU、重复 SKU/规格、非正价格、非法库存会逐项定位。描述缺失、标题超过建议长度属于提醒，**不是平台规则或合规承诺**。无标记区域、多个区域、错误字段结构、非标准 URL 均会失败关闭或面板明确提示，且不会退化为全页采集。导航、撤权或更换网站需要重新授权并手动运行；结果不自动上传或保存。

## 测试边界

`node --test tests/environment/listing-sku-inspector-r3.test.mjs` 对检查规则、读取范围、真实按钮绑定和错误 UI 进行组件测试；`node scripts/validate-program-project.mjs ...` 验证项目合同。**只读 Node 测试不等于 Chrome 的 USER_SCRIPT / Host / 授权 / 导航 / Stop / 可见 UI 原生验收。** 新候选的真实 Chrome 证据必须另外记录；没有授权不得宣称任何电商平台后台集成。
