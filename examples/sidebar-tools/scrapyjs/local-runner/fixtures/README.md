# 可人工核对的三页 Fixture

在空闲的测试端口启动（不要替换 43111 的标准 Browser Test Lab）：

```sh
python3 -m http.server 43233 --bind 127.0.0.1 --directory examples/sidebar-tools/scrapyjs/local-runner/fixtures
```

启动 local-runner 时显式添加 `--fixture-origin http://127.0.0.1:43233`，该精确测试 origin 才允许 loopback 目标。生产目标没有此例外。

在 ScrapyJS 原 AI 入口中填写目标 `http://127.0.0.1:43233/page-1.html`，需求：“读取 #books 的直接 li，id 取当前项 data-id、title 取 h2 文本、price 取 .price 文本，下一页 a.next，保留空价格，采集至末页；生成 CSS 声明式方案。”可手填必要 HTML 样本；仍需原可信 AI 发送审阅，不保证模型无需结构资料就能猜出选择器。

独立黄金：1 页 A/B；2 页 A/B/C/D；3 页 A/B/C/D/E/F。标题依次为“浏览器工具、本地任务、声明式采集、持久结果、精确分页、停止与恢复”。价格依次 `19.50,25.00,30.00,0.00,42.25,""`。数据均为人为测试样本，不来自网站。

此目录只提供输入。未执行同候选 AI/Chrome 操作时，这条人工流程记 NOT_TESTED；自动集成证据使用测试内另一份独立生成的 Fixture，不能混称这六条已在真实 Chrome 通过。

验收关闭侧栏后仍在运行及中途 Stop 时，可在该端口空闲后改用下面的有界 Fixture 服务；它保留前三页黄金，并在后续页生成明确测试数据。50 页、每页延迟 1 秒，便于观察活跃任务；不要同时启动两个 43233 writer。

```sh
python3 examples/sidebar-tools/scrapyjs/local-runner/fixtures/serve.py --port 43233 --pages 50 --delay 1
```

此动态长 Fixture 的完整 Mac Chrome 链尚未验证；仅前三页仍分别为 2/4/6 条独立黄金。后续每页一条，id=`page-N`、标题=`长任务第 N 页`、价格=`N.00`。
