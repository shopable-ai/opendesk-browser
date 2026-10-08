# 资源合同样例：CSS / JSON / PNG（故意不能打包）

这是用户所需「整个项目文件夹包括图片」的**真实磁盘源文件样例**，不是已安装 Page 程序。含 `assets/panel.css`、`assets/config.json` 和 4×4 PNG `assets/mark.png`，供未来文件夹导入器/资源打包器使用。

```sh
node scripts/validate-program-project.mjs examples/programs/sidebar-assets-contract
# 应输出 AUTHORING_VALID_NOT_PACKAGED + 三项真实资源的 SHA-256
npm run build:program -- examples/programs/sidebar-assets-contract
# 当前 main 的预期结果：E_PROJECT_ASSET_BUILD；退出码非零
```

当前 `opendesk.assets` 只允许相对路径、类型、字节大小与哈希校验；**没有 CSS 注入、JSON 读取 API、图片 URL 或资源安装对账**。这份 Demo 用来验证“拒绝未经支持的资源打包”这个安全门槛。

后续接通资源构建时，必须将原来的拒绝测试升级为真正的资源哈希、受控加载、真实 Chrome DOM/图片显示、版本冻结、撤权/重启与篡改拒绝测试；**不能只删除失败断言就声称实现**。
