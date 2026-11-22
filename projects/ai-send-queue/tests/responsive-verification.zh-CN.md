# 2026-11-22 · 自适应队列验证

ai-send-queue 是 Sidebar Tool，页面通过现有固定模块 app.ai-send-queue 运行。用户在 ChatGPT 页面管理队列；侧栏检测网页状态并提供提示。原安装、文档绑定、站点权限、撤权和发送检查继续生效。

| 证据 | 结果 |
| --- | --- |
| ego(lite) 本地业务源码 | 输入区 700 → 380 → 320 → 700px。拥挤的 320px 工具栏原生发送按钮保持 34px，皇冠移到队列上方，重复检查未搬动节点，回宽后恢复行内。点击皇冠可加入原草稿；暂停和恢复后队列状态正确，测试没有发消息。 |
| 长草稿与等待 | 1000、8192、60 字符样本在 700/380px 和三种滚动位置保持原文。700/380/320px 的等待原因可见，不改变草稿或队列。 |
| ego(lite) 本地发送顺序 | 在 390px 通过皇冠入队两条带中文的测试消息；首条被本地页面接收后，将视口拓至 800px。模拟回复未完成时第二条仍在队列；确认完成后只发送一次，正文和顺序正确。无网络发送。 |
| ego(lite) 编译侧栏、模拟 Host | 680 → 320 → 680px；「重新检查」显示输入框暂不可用，诊断可展开；恢复时显示就绪并清掉旧诊断。其他站点显示「请打开 ChatGPT」，不访问网页模块。 |
| 真实 ego Profile | 已安装记录 0.1.34/r33，网页程序登记为 ready/fixed。先前专用 ChatGPT 对话中观察到四轮已完成问答；在 1280 → 800 → 390 → 1280px 观察到一套队列 UI，皇冠可见。该对话同时在另一活动标签打开；测试只读取布局和滚动位置，没有更改草稿、队列或发送。产品按钮返回已打开侧栏，浏览器报告一个未绑定窗口的侧栏上下文；未核对实体侧栏里的队列状态。另用独立工具页打开已安装的队列工具，实读「未找到当前网页」「重新检查」和用法；只证明未绑定网页时的真实工具界面。 |
| 编译与 Tool 包 | 正式 JSON 0.1.36/r35 → 0.1.37/r36；候选与先前 ego 验证的快照包逐字节相同。包 SHA-256：`4970d71603648bde9d0e850ecf17010a21c226824e94e0f6230ce11f7275b282`。原打包器已晋升并回查同源，网页权限和匹配范围未变。 |
| 隔离编译固定网页桥 | 原 WXT/Vite 构建器和仓库的构建 hook 在临时目录生成 0.1.37 的 chatgpt-fixed-bridge.js。来源校验覆盖 41 个模块，独立 IIFE、脚本 CSP 检查和开发字节上限均通过；224840 字节，SHA-256：0f90638c1375ef96ceb4cb0345f69deba862dbd47c7a30e1d66a301d28fce25b。没有写入日常构建目录，也未安装此产物。 |
| 日常开发与运行 | ego 曾读回已应用 revision 96f250d6f5c9… 的旧产物。共享 watcher 后续输出 ddb7de3e3988…，清单与磁盘文件哈希一致，但固定桥仍为 0.1.36。现有进程保留旧 pin 依赖；在临时目录用同版本配置加载器复现了同进程重读配置仍返回旧依赖。需要维护方重启原 watcher；本轮未重启。0.1.37 实际安装、固定桥生效和真实发送为 NOT_TESTED。 |

从仓库根目录编译项目侧栏并启动本地服务，使用自己的 ego TaskSpace ID 替换下例的 16。侧栏脚本需要仓库已有的 dist/development React runtime；页面 fixture 使用本地业务源码。

~~~sh
npm --prefix projects/ai-send-queue run build
python3 -m http.server 62824 --bind 127.0.0.1 --directory .
sed 's/taskSpace(EGO_TEST_SPACE)/taskSpace(16)/' projects/ai-send-queue/tests/responsive-ego.js | ego-browser nodejs
sed 's/taskSpace(EGO_TEST_SPACE)/taskSpace(16)/' projects/ai-send-queue/tests/fifo-ego.js | ego-browser nodejs
sed 's/taskSpace(EGO_TEST_SPACE)/taskSpace(16)/' projects/ai-send-queue/tests/sidebar-status-ego.js | ego-browser nodejs
~~~
