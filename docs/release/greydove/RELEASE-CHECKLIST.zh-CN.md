# GreyDove 生产构建与 Chrome Web Store 发布检查清单

> 只用于已完成品牌改造和合规审计的候选版本。勾选项必须有证据；本清单本身不代表任何测试已通过。

## 1. 发布候选身份

每次发布先记录：

- 发布版本：
- 发布类型：Standard / Developer
- 目标商店商品 ID（如已有）：
- 远端分支：
- Git commit SHA：
- 工作区是否干净：
- Manifest version：
- package-lock.json 身份：
- 构建时间：
- Node 版本：
- Chrome 版本：
- 构建回执路径：
- ZIP 文件路径：
- ZIP SHA-256：
- packageHash：
- 发布负责人：

不要把不同 commit、不同 ZIP 或不同 Chrome 安装的证据混合为一个通过结论。

## 2. 发布前冻结

- [ ] 从最新远端 `main` 开始，核对本地工作区和并行改动。
- [ ] 确认本次只包含 GreyDove 发布范围内的变更。
- [ ] 确认品牌规范和商店文案已批准。
- [ ] 确认图标源文件和导出文件已固定。
- [ ] 确认 Manifest version 已按 Chrome 版本格式更新。
- [ ] 确认依赖锁文件和第三方许可证。
- [ ] 确认没有测试密钥、调试凭证、开发专用域名或本地路径泄漏。
- [ ] 确认没有把 Developer 构建误当 Standard 发布包。

## 3. 当前仓库构建入口

以当前仓库脚本为准，执行前重新核对 README 和 package.json。

### Standard 发行

```bash
npm ci --ignore-scripts
npm run check
npm run build
npm test
npm run verify
npm run pack
```

已知脚本行为：
- `npm run build`：生产 Standard 构建，默认输出 `dist/production`。
- `npm run pack`：验证并打包 Standard 生产目录。
- `npm run verify`：当前脚本验证 `dist/production` 和 `dist/development`。
- `npm test`：包含 pretest 构建步骤，需留意实际测试范围和运行环境要求。

Standard ZIP 的当前命名规则来自 `scripts/pack.mjs`：`artifacts/opendesk-browser-production.zip`。实际文件名必须以本轮运行输出为准。

### Developer 发行（默认不作为首发商店包）

```bash
npm run build:developer
npm run verify:developer
npm run pack:developer
```

Developer 构建由现有脚本设置 Developer edition；它不是 Standard 包的同义词。除非发布计划另有批准，不要上传 Developer ZIP 作为首发商品。

## 4. 包内容检查

- [ ] Manifest V3 正确。
- [ ] name、short_name、description 与品牌规范一致。
- [ ] icons 字段和实际图标资源齐全。
- [ ] 16/32/48/128 等扩展图标资源存在且正确。
- [ ] 通知图标和品牌图标用途分离。
- [ ] Side Panel、Service Worker、Options 页面路径正确。
- [ ] CSP 和资源闭包验证通过。
- [ ] 不存在未批准的远程可执行代码或动态加载。
- [ ] 所有必需资源都在 ZIP 中。
- [ ] ZIP 不包含 source map、开发调试文件、密钥或临时文件。
- [ ] 固定资源哈希和 packageHash 与本次候选一致。

## 5. 自动化与真实 Chrome 验收

### 自动化验证

- [ ] `npm run check` 通过。
- [ ] 相关定向测试通过。
- [ ] `npm test` 结果已记录，失败项未被忽略。
- [ ] `npm run verify` 通过。
- [ ] `npm run pack` 成功。
- [ ] 产物 SHA-256 已记录。

### 真实 Chrome

使用独立、干净的测试 Profile 安装最终 ZIP：

- [ ] 安装成功。
- [ ] Chrome 扩展管理页显示 GreyDove。
- [ ] 工具栏图标清晰。
- [ ] Side Panel 和设置页面正常。
- [ ] 最低声明 Chrome 版本 138 已验证，或明确记录无法验证。
- [ ] 当前稳定版 Chrome 已验证。
- [ ] 首次权限提示与商店披露一致。
- [ ] 权限拒绝、撤销和恢复路径正确。
- [ ] 核心脚本和自动化任务可运行。
- [ ] 运行结果、错误提示和停止流程正确。
- [ ] 卸载/重新安装及已有用户升级路径已评估。
- [ ] 浏览器控制台无未解释的严重错误。

Node 测试、构建成功或 ZIP 校验通过，都不能替代真实 Chrome 安装验收。

## 6. Chrome Web Store 后台

- [ ] 上传正确的 Standard ZIP。
- [ ] 商品名称和描述准确。
- [ ] 图标、截图和宣传素材真实。
- [ ] 支持网站和支持邮箱可用。
- [ ] 隐私政策 URL 可公开访问。
- [ ] Privacy 字段与真实数据流一致。
- [ ] 单一主要用途明确。
- [ ] 每项敏感权限都有合理说明。
- [ ] Trader / Non-Trader 和地区要求已确认。
- [ ] Distribution 国家/地区和可见范围正确。
- [ ] 付费、广告或联盟计划如不存在，不做不实声明；如存在，完成相应披露。
- [ ] 发布负责人确认后才点击 Submit for Review。

## 7. 审核和正式发布

- [ ] 保存提交时间和后台状态。
- [ ] 开启重要审核通知。
- [ ] 保存 Google 审核意见和通知。
- [ ] 若被拒绝，记录具体政策条款、修复 commit 和新 ZIP。
- [ ] 审核通过后决定立即发布或延迟发布。
- [ ] 正式发布后从公开商店页面安装验证。
- [ ] 记录商品 URL、商品 ID、版本和发布时间。
- [ ] 记录首发用户反馈与重大问题。

## 8. 回滚与事故响应

- 保留上一已发布版本的源 commit、ZIP 和 SHA-256。
- 保留审核往来和发布记录。
- 发现严重问题时先评估暂停发布、提交修复版本或联系 Google 支持。
- 不覆盖历史发布记录。
- 不把旧 ZIP 重新标记成新版本。
- 不通过修改扩展 ID、删除用户数据或强制重置来掩盖升级问题。

## 9. 账号与密钥安全

本仓库只记录非敏感发布状态。Google 登录凭证、商店密钥、支付服务商密钥、个人身份资料和用户数据必须保存在受控密码管理器或密钥系统，不得提交到 Git。
