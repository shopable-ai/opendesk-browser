# 2026-11-22 · 自适应队列验证

ai-send-queue 是 Sidebar Tool，页面通过现有固定模块 app.ai-send-queue 运行。用户在 ChatGPT 页面管理队列；侧栏检测网页状态并提供提示。原安装、文档绑定、站点权限、撤权和发送检查继续生效。

| 证据 | 结果 |
| --- | --- |
| ego(lite) 本地业务源码 | 输入区 700 → 380 → 320 → 700px。拥挤的 320px 工具栏原生发送按钮保持 34px，皇冠移到队列上方，重复检查未搬动节点，回宽后恢复行内。点击皇冠可加入原草稿；暂停和恢复后队列状态正确，测试没有发消息。 |
| 长草稿与等待 | 1000、8192、60 字符样本在 700/380px 和三种滚动位置保持原文。700/380/320px 的等待原因可见，不改变草稿或队列。 |
| ego(lite) 编译侧栏、模拟 Host | 680 → 320 → 680px；「重新检查」显示输入框暂不可用，诊断可展开；恢复时显示就绪并清掉旧诊断。其他站点显示「请打开 ChatGPT」，不访问网页模块。 |
| 真实 ego Profile | 侧栏工具记录为 0.1.34/r33。ChatGPT 首页有页面生命周期及皇冠，1024/390px 视口下皇冠可见；页面模块版本未验证，没有实际发送消息。 |
| 编译与 Tool 包 | 原构建配置及打包器从隔离快照生成 0.1.37/r36，位于 artifacts/sidebar-tools/ai-send-queue/adaptive-r36/candidate.opendesk-tool.json。项目内 0.1.36/r35 包在并行维护，本次未覆盖。新候选未安装，固定模块无新版本实际运行证据。 |

从仓库根目录启动本地服务，使用自己的 ego TaskSpace ID 替换下例的 15。侧栏脚本需要候选目录的 project/dist 与仓库已有的 dist/development React runtime。本测试直接加载候选侧栏构建；原设计预览的皇冠 CSS 来源校验未通过，未用于此次结果。

~~~sh
python3 -m http.server 62824 --bind 127.0.0.1 --directory .
sed 's/taskSpace(EGO_TEST_SPACE)/taskSpace(15)/' projects/ai-send-queue/tests/responsive-ego.js | ego-browser nodejs
sed 's/taskSpace(EGO_TEST_SPACE)/taskSpace(15)/' projects/ai-send-queue/tests/sidebar-status-ego.js | ego-browser nodejs
~~~
