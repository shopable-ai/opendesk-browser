<!-- webflow-todo:v1 -->
# ChatGPT 两任务计算接力 Demo

## 目标
用两个不同的普通 ChatGPT 对话完成独立可验算的计算；T02 只能使用 T01 已验收、真实保存并读回的成果正文。真实浏览器运行必须保存两条会话 URL、消息身份、成果版本与回执。

## T01 计算求和

### 输入
numbers: [17, 28, 35]

### 任务
按给定数组计算总和与数量；运行时的随机交接 marker 和冻结 inputVersion 由可信执行者单独提供，不在本文件写死。

### 产出
artifacts/T01.json：只含 sum、count、marker、inputVersion 的 JSON 对象。

### 验收
auto:sum-count-marker:v1

## T02 使用上游成果翻倍

### 输入
artifact: T01
multiplier: 2

### 任务
只使用 T01 已保存且经独立读回的完整成果内容，以及倍数；禁止重新使用 T01 原始数字。把相同 marker 与 inputVersion 原样保留。

### 产出
artifacts/T02.json：只含 doubled、marker、inputVersion 的 JSON 对象。

### 验收
auto:doubled-marker:v1
