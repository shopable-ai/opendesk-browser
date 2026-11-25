# Chrome 网上应用店素材档案

实拍原图按项目保存在此。`review/` 用于构图审阅，`diagnostics/` 用于复现与取证。正式发布图应在确认商品归属、同一发行候选和画面合格后单独登记。目前没有获准上传的图，也没有已录制的视频。

## GrayDove 浏览器插件

两个语言目录均为 **01 扩展列表 → 02 开发工作台**。四张实拍来自 [GrayDove 2.0.3 Standard 商店候选 ZIP](../../../artifacts/graydove/2.0.3-20261125/GrayDove-2.0.3-chrome-web-store.zip)（SHA-256：`25b077a2f9aa5f80566320938559b534b70453b2db20c255527d2954873a9875`）。从 Chrome for Testing 155.0.8059.39 的原生窗口取景，裁掉工具栏，输出 1280×800。四张均使用真实 ChatGPT 游客会话及原创示例，不含私人对话。旧项目笔记构图已退出候选。

| 界面语言 | 01 · 扩展列表 | 02 · 开发工作台 |
| --- | --- | --- |
| English | [Extensions](graydove/review/en/01-extensions.png)：真实英文三项清单；一键填入后续请求，未发送 | [Develop](graydove/review/en/02-develop.png)：运行只读 Controller 脚本，返回同三项英文清单 |
| 简体中文 | [扩展](graydove/review/zh-CN/01-extensions.png)：真实中文三项清单；一键填入内置提示词，未发送 | [开发](graydove/review/zh-CN/02-develop.png)：运行只读 Controller 脚本，返回同三项中文清单 |

两组首图右侧均显示六个扩展条目；本轮直接验证了提示词快捷按钮，列表不代表逐项验证。英文组实际切换了 GrayDove 与 ChatGPT 的界面语言；部分扩展名称、描述及开发工作台标签仍显示中文。四图保留 Chrome 测试版提示条，供上架前审阅，不能据此认定商店商品已有两个语言入口。

## 独立扩展

| 项目 | 原图 | 画面证据与限制 |
| --- | --- | --- |
| AI Reply Mind Map | [ChatGPT 导出菜单](ai-reply-mindmap/review/02-chatgpt-export-menu.png) | 当前唯一候选，展示真实导出菜单；建议补拍能直接展示导图结果的首图。使用菜单图前核对正式版支持的格式和 XMind 发行许可。 |
| Prompt Shortcuts | [ChatGPT 填入草稿](prompt-shortcuts/review/01-chatgpt-shortcut-inserted.png) | 游客页实测点击填入内置模板；未发送。与队列同框需在已建立的真实 ChatGPT 对话另拍。 |
| AI Scroll Navigation | [Gemini 跳到下一轮](ai-scroll-navigation/diagnostics/gemini-next-turn.png) | 点击后计数 1/4 → 2/4，第二个提问移到顶部；ChatGPT 落点待拍，正式候选待核。 |
| AI Send Queue | [Gemini 一条暂停记录](ai-send-queue/diagnostics/gemini-one-paused.png) | 真实暂停状态；不能据此证明两条同框、成功续发或稳定布局。 |
| Video Auto Skip | 未拍 | 待选可用于商店宣传且由同一发行候选实证的播放页。 |

目前共 6 张审阅图（GrayDove 4 张、独立扩展 2 张）和 2 张内部参考图，均为 **1280×800、RGB PNG、无 Alpha**。Gemini 下一张只补一个联合镜头：一次真实跳转后的轮次及落点，与同一会话内的真实队列状态同框。2.0.3 已在真实 Gemini 页面显示队列入口，本次环境未显示轮次导航，尚无联合镜头；两张旧图继续只作参考。入口、商品范围与视频方案见[拍摄方案](../extension-store-media-plan.zh-CN.md)。
