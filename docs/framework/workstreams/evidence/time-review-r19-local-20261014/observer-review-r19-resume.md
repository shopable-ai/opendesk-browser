# R1.9 续接观察器独立审查与修正

审查者：native subagent architect Poincare（01a13744-ea89-7441-ad4b-4ba42a237839）。只读，无 Chrome/Git 写入。原审查 BLOCK；不将其视为产品 FAIL 或原生 PASS。

- target ID 变化不能证明 SW stopped/recovered 或失焦顺序：改为同 page session、registrationId、versionId 的真实状态事件；顺序不证明就 BLOCKED。
- 单个 127.0.0.1 上限漏掉历史丢失/其他桶补时：检查实际 checkpoint host、全部 day/host 不减少、其他 host 不增、当前 host 增量 0..limit。
- 同 URL 不同 worker 的状态不能拼接；空 sourceURL 错误不能忽略：保留 observer 未过滤事件，worker 身份匹配，并排除 crash、registration 删除、换版本。
- 刷新后 storage 存在异步落盘：复用 until 等待持久增量。

升级真实 chooser→本地明确旧版本→正式 catalog 的链路、原35+3 required、75秒不能替代休眠证据门槛成立。尚待新候选真实 full 原生结果。

字段依据：[官方 CDP PDL](https://raw.githubusercontent.com/ChromeDevTools/devtools-protocol/master/pdl/domains/ServiceWorker.pdl)：ServiceWorkerVersion 的 registrationId/versionId/scriptURL/runningStatus；ServiceWorkerErrorMessage 的 registrationId/versionId/sourceURL。原始运行证据保留全部 observer events/errors/crashes。
