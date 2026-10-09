# 2026-10-10 锁屏期间的限定 Chrome 验证

`renderer-control.log` 和 `renderer-control-result.json` 记录现有用例 `real macOS Chrome: bare renderer/CDP control without extensions` 的新一次真实执行：**1/1 NATIVE_PASS**，Chrome for Testing `155.0.8059.39`。

命令通过 `--test-name-pattern=bare renderer/CDP control` 选择已有用例。该用例本身使用 `--headless=new`、新建私有 profile、禁用扩展，直接检验真实 Chrome renderer 和 CDP，不需要或模拟桌面输入。它不会证明 Sidebar、Native Agent、权限确认或扩展安全验收通过。

当前 main 为 `95d98314a46b28c293ae71727e235b81e82d70de`。实际运行的隔离快照包含相同的测试文件 bytes，SHA256 为 `7bc6f77d364884ab83940f26fb2280b75db15da363a6d3c27a82ce8119f92d7f`；此前 547 项组件测试的相关代码未改变。当前分别有 547 项组件测试和 1 项裸 Chrome 原生控制用例通过，**仍不声称最新版完整 npm test PASS**。Native Agent 用例和最新版 Sidebar 原生收尾仍未验证。

本轮 CUA `listApps()` 再次报告 Mac 锁屏且自动解锁失败。已存在的人工解锁请求仍待响应；没有启动交互式测试浏览器或绕过锁屏输入。上一轮清理的浏览器/profile 保持释放，43111 借用服务未操作。
