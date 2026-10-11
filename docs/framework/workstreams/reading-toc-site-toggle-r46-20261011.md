# 阅读目录与同类工具：网站开关一键生效（R4.6）

日期：2026-10-11。范围：已安装工具的 Side Panel 列表操作；不改变工具安装流程、沙箱接口、Chrome host permissions、Native 授权或网页索引实现。独立变更，不覆盖 R4.4 的真实 Chrome 证据。

## 源码核查

- 旧入口 `src/ui/sidebar-tools.js` 在三个明确的站点操作按钮之后还调用 `window.confirm()`：阅读目录（标题/目录）、网页剪藏（正文/选区）和知识收件箱（仅 ChatGPT 的保存按钮）。浏览器阻塞弹框使用户重复批准；它不是必需的 Chrome 原生扩展权限提示。
- 按钮本身就明确执行「启用/停用当前网站」，仍显示精确 Origin 的无障碍标签和读写能力说明。撤销不删除既有本机数据。
- 不移除卸载数据、放弃未保存修改、具有新增能力的更新、来源变化之明确确认；不绕过 `chrome.permissions.request` 或 `currentPageTarget.revalidate`。

## 修改与保护

- 三类开关一次点击生效；提示改为已有的非阻塞 `role=status`，不再弹出 JavaScript confirm。
- 保留正式已安装固定版本/声明能力校验、同一浏览器窗口精确 URL/文档重验证、HTTP(S) Origin 许可、存储锁、撤权和重复授权检查；知识保存仅限既有 ChatGPT 白名单，实际保存仍须用户操作。
- 增加 `aria-pressed`，扩充站点和行为标签，列表重绘保留在刚操作的站点开关上；同一工具未决开关防重点击，不把并发点击翻转为错误授权。
- 专项 Node 组件测试验证本地 `http://127.0.0.1:43111`、剪藏、ChatGPT 保存开关，开关状态/焦点、双击、无 `confirm`、网站切换后的安全拒绝。
- 真实 Chrome TOC 测试改为断言首次授权和撤销后再授权均 **零** JavaScript 对话框；仍要求真实网页浮窗启用、撤权和持久状态回读。

## 必须进行的验证

```sh
node --test tests/environment/sidebar-tools-host.test.mjs tests/environment/reading-toc-r41.test.mjs
npm run check
npm run build
npm run build:dev
npm run verify
# 仅限独立 Chrome for Testing Profile；不能占用用户个人 Profile
xvfb-run -a node --test tests/framework/reading-toc-native-r41.test.mjs
```

GitHub 分支提交不代表用户 Mac Chrome、正式主分支或 F3/ZIP 通过。原 R4.4 证据仍只绑定原 SHA；新修改的真实 Chrome 状态在原生运行前为 `NOT_TESTED`。主分支由获授权的集成负责人按并行开发规则合入。
