# AI VIP Share R4.2 — 兑换激活与单按钮代理 · 2026-10-15

本轮仅收敛 AI VIP Share 离线原型、设计文档和对应测试，延续 R4.1，不改生产源码、Chrome Proxy/SDK、Provider 或其它工具。

## 产品修正

- 兑换卡统一为「兑换激活」；输入「兑换码或激活码」，不再显示 1 天 / 1月 / 3月 / 1年等固定时长。真实商品决定获得的权益，只有时间类权益才展示时长。
- 兑换码未知时不能模拟授予一个月：离线原型只报告提交演示，保留原会员天数。正式版本只有服务端确认回执才能更新权益。
- 代理区域仅保留单一「启用代理 / 停用代理 / 重试停用」按钮。启用直接发起已有可信手势操作，无模式选择弹窗；停用不得影响其他代理设置，冲突提示留在原卡片。
- 「查看更多商品」仅表示商品目录入口；示例 SKU 不能构成完整商品清单或虚假定价。

## 验证结果（仅离线原型）
- Node v22.16.0：`node --test examples/sidebar-tools/ai-vip-share/preview/test-r41.mjs`，33 passed，0 failed。
- 容器 Chromium 144.0.7559.96、Playwright：30 项离线具名交互检查通过，15 场景 × 320/360/390/768/1000px 无横向溢出，0 页面 JS 错误、0 外部网络请求。
- 已验证 HTML SHA-256：`2d59061a1ac609415557bb8d6731d8f0a0e1962ddcb8530ada737c140584b601`；MD SHA-256：`8036e7afa67097e3c70feeed945f27b5b21378c0c6e2656f7d1b30d45fa2a618`；测试 SHA-256：`bea1053375082f7e09188fc33a097f78674d472b2ef9bb7ec0e3d189075bc6dd`。

## 未完成
`PRODUCTION_UI_NOT_CHANGED / NATIVE_NOT_TESTED / PROVIDER_BLOCKED`。生产部署须迁入已审核公共 SDK/可信宿主，原生 Chrome 验证其他扩展遮蔽、本宿主跨工具 owner/epoch、停止竞态、权限和重启。不能将当前原型评分或通过数当作正式上线验收。
