**独立评分：40/100，当前本机体验验收未通过。**仅只读核查指定证据及直接源码，未运行测试、操作浏览器或参考其他专家评分。

源码方向正确：[初始化入口](/Users/shopme/Documents/workspace/opendesk-browser/projects/webflow/trusted/chatgpt-bridge-page.js:201)默认`showLegacyPanel=false`，旧面板仅显式开启才挂载，可信控制链仍保留。指定`node-tests.tap`记录5文件91/91通过，仅证明组件检查。

扣分：

- **−35：本机产物未落实退役。**直接读取开发包 sourcemap，仍含1138行旧实现，第268行无条件`append(root)`，缺少新项目桥接源码。结合你已目视核对的真实ChatGPT截图，旧浮层确实仍出现，并报`E_BRIDGE: Extension context invalidated`；该证据只覆盖当时瞬间。
- **−15：页面生命周期未验收。**Profile03停在挑战页，零旧节点不能证明正式聊天体验；首次、历史、新建、刷新、重开均未完成有效验证。
- **−10：正常任务闭环未证实。**零发送、零任务，执行、结果回传与继续对话仍未验证。

未解项：源码owner冲突、开发产物陈旧、无当前serve连接证明。死亡锁PID不代表输出或原生UI可接管；Profile03已正常关闭释放。CI93及生产构建仅属于历史2bcaf，不能抵作当前磁盘或Chrome通过。当前只能认定“源码默认隐藏成立，用户实际体验尚未完成退役”。
