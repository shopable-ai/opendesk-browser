# R10.1 本地构建与真实 Mac 验收

基线：`4adf5dc4966f82a71c2c5116f8d5a35c21eafd06`，PR #37/#38 已合并。本工作区与分支独立；主工作区的未提交修改保留。

实施与通过条件：

    HTTPS 安全：独立 security 分支复核并修复目录并发替换与 Mac /var alias；保留基线失败。
    本地项目：独立 resolver 分支复用唯一构建器，支持已有 npm/HTTPS 锁；不得生成开发交接 JSON。
    Native 资源：本分支为同一 Native Host 实现提供命名实例，配置/Socket 在独立用户私有目录，manifest 仅在独立 CFT profile；原安装不改写。实例标识不是凭据，Chrome 端从已安装路径确定凭据。
    真实验收：使用本分支 dist、独立 CFT155 app/profile、临时 loopback 端口和 demo-form.html；保留 run/result/document/sourceHash 与网络日志。Node、组件、CI、Mac Native、Sidebar、最终 F3/ZIP 分别报告。

本分支拟修改 `native-agent/install.mjs`、`native-agent/native-host.mjs`、命名安装路径模块、相应定向测试和 R10.1 真实验收驱动。受控实例 `r101-c0`，不占用默认 Native socket；dist/ZIP 仅在本工作区。浏览器权限均通过实际 Chrome 控件与本 PID 的系统原生输入。

基线测试：`npm ci` 完成；`npm run check` 和 P0 四文件定向测试的原始日志保存在 `/tmp/od-r101-*.log`，测试 27 PASS / 2 FAIL，Mac 临时目录 alias 导致安全校验拒绝。后续把原件归档至本分支证据目录，不覆盖旧 receipt。

当前状态：实施中，未宣称 95+ 或最终框架关闭。
