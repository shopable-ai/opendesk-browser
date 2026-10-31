# AI Proxy 导航与密度修复计划

Goal：取消重复 Tabs，统一代理配置、规则和添加表单的垂直节奏，最终候选接受独立设计与实现评审。

Spec：根 DESIGN.md「本轮导航与规则编辑增量」最新用户纠偏；R27 第2–3节。主代理流程、七区、四模式、三语、保存不应用、权限和 revision/generation 保护不变。

复用/owner：`projects/ai-proxy/`，`App → QuickPanel / Settings`，Shared Button、FormField、原 navigation guard。当前43263为内存同源预览服务；保留现有服务、并行正式包/配置，不创建分支、不安装/打包晋升、不启停真实代理。

## 已观察问题与原因

- 顶部两Tabs与主面板既有齿轮重复。
- `options.css` 的 `.options .listSection .sectionHeading` 覆盖侧栏规则，margin-bottom实测13px；列表另有8px top与12px bottom，非单一间距owner。
- 代理三行实测高度106/131/107px，状态徽章和整排文字按钮增加行数。
- 表单继承PC padding/margin，侧栏适配未全部归零。

## 执行与验证

- [x] 1. 更新现有 navigation 行为用例：无业务Tabs；Settings关闭回主面板；草稿保留/放弃；busy拒绝离页。先观察预期失败，再实现。
- [x] 2. App移除Tabs；Settings七区选择旁的关闭设置调用原guard；保留Quick返回焦点。
- [x] 3. 原SideIcon抽到工具内共享ProxyIcon，紧凑代理/规则两行结构，图标操作保留title/ARIA；不改业务动作。
- [x] 4. 编辑现有sidebar-settings.css，在本轮代理列表/标题/表单用父gap＋子margin清零；只隔离原PC布局的级联层，不新增补丁文件。添加主次动作和说明收口。
- [x] 5. 相关navigation/rules/drafts/quick-panel/form-submit测试，真实入口内存编译，三语键一致；浏览器操作齿轮→代理管理→添加/保存/取消→规则→编辑/取消/删除与草稿保护。
- [x] 6. 默认窗口检查实际计算间距、行高、三语；冻结来源指纹和截图。
- [x] 7. 独立UI/实现复核，每维实际≥95且无阻断才报告本轮开发范围达标。

Review focus：图标仅颜色不可辨、长地址吞掉操作、草稿取消跳页、保存期间关闭设置、返回主面板焦点丢失。以上由行为用例和同源浏览器实际操作验证；宽度/缩放矩阵OUT_OF_SCOPE，原生安装/真实代理NOT_TESTED。

基线判定：FAIL；已实际观察上述冗余和间距不一致，不复用历史评分。

收尾：首轮独立UI评审未通过（取消丢草稿、键盘证据不足），按真实RED→修复→GREEN闭环，记录不覆盖。revision-2相关60/60、浏览器8组及原生键盘操作通过；最终仅两处列表overflow修正焦点裁切，65输入核对无漂移，差异映射由两位reviewer独立确认。最终UI各维最低98、实现各维最低96，无本轮阻断；完整类型/安装/真实代理仍未测，尺寸矩阵范围外。最终证据见 `final/`，候选 `source-221a90c1-9053-43fa-a758-6c6b32e41be3`。未提交、推送、打包或安装，原服务保留。
