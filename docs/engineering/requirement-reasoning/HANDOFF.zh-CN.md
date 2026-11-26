# R2 接续与证据

已完成设计：语义模型、递归算子、关系组、停止/范围、图投影、跨对话增量、Skill、JSON Schema、两案例对照/接续。已调查现有 workflow/Skill/评测脚本与产品文档，基准 91239889481bad3f42edb30e84e1012aa1901fc0。没有开发工作流平台、修改业务代码或改正式需求。
结构样例：video-auto-skip 53节点/68边/2组；job-auto-apply 58节点/71边/2组。本轮 JavaScript 工具执行与 validate-fixtures.mjs 相同的 graphCheck/selfTest 函数，14/14 检查符合预期（2正向、12构造负例）。可复跑 node docs/engineering/requirement-reasoning/validate-fixtures.mjs。不是本机 Node 文件运行或完整 Draft 2020-12 校验；不证明图语义、算法执行或实际模型。当前 validator 只是示例检查器，不覆盖所有边类型的所有约束、根可达性、证据候选匹配、完整批准门禁；R3 必须验证并补全。样例 OR 未决、gate REVIEW_REQUIRED、rounds=0。未验证原子级需求全量、真实模型盲测、跨域独立复现或性能成本。
六维均 NOT_SCORED：需求工程（缺独立逐项判卷）、产品（缺真实用户审查）、架构（缺跨域集成）、AI Agent（缺真实模型配对）、测试（缺独立标准校验和模型实验）、反方（缺独立对抗审查）。不虚构平均分；每维95是目标。
修正重点：树→有类型关系图及分解组；意图/批准/范围/证据分离；媒体时长优先且不强依赖作品语义；求职外发独立授权；未知副作用不重放；预算与 frontier 保留；复用原 workflow/F/S/A/评测脚本。目录 docs/engineering/requirement-reasoning/ 是本次通用研究选择，未来和工程元模型协调。

## 下一轮增量提示词

GOAL：AI-Native Requirement Reasoning Engine R3 — 实际模型对照、结构/语义验证与增量接续。
任务 OD-AI-NATIVE-REQUIREMENT-REASONING-R3，仓库 shopable-ai/opendesk-browser，唯一 main。

原始目标：用户一句初始想法即可推导必要目标/需求/功能/场景、任务与可验证验收，跨模型/项目/对话复用，防遗漏、漂移、重复、过度设计和虚假完成。R2 已设计，禁止重复 R1 调研、重写 R2 文档、产品需求或现有 OpenDesk 工作流，除非实测发现缺陷。

1. 先读本目录 README、SKILL-CONTRACT、Schema、CASES、fixtures、HANDOFF，核对当前 main 和来源变化、原 owner、原 extension-creation 第10–11节、scripts/agent-skills-r22-eval.mjs。执行轻量自测及独立标准 Draft 2020-12 validator（每个 input/output）；补充图约束及负例；只修必要缺陷。
2. 复用既有 --mode reasoning 配对评测入口（核实安全参数，已登录且用户同意计费才调用），新增连播/求职及非浏览器 holdout（库存或预约等）。固定模型设置/源码/可见上下文/预算/判卷规则，隔离参考答案、base/guided 独立会话，至少两模型或两独立运行者，保存真实输出及运行元数据、脱敏。不访问真实用户业务，不自动外发/安装/发布。无环境明确 BLOCKED。
3. 预注册原子级金标准及核心风险权重，统计完整召回、部分另计、误报/过度范围、核心安全漏项、问答次数与成本（有回执才记），独立逐项判卷而非关键词。不得把本轮回顾性51簇当独立准确率。
4. 负例：重复/悬空/错类型/无来源/无验收/OR-XOR全选/AND缺项/硬依赖或派生环/假授权/伪PASS/旧证据错候选/未解决冲突/预算截断/源漂移/增量不重跑无关节点。验证通用性，不创建平台。
5. 根据证据修订本目录唯一文档，保留原产品 ID 与流程；六维独立评审单维≥95，平均=sum/6，关键缺陷否决；未评 NOT_SCORED，报告真实命令/回执/提交、未完成/下一最小动作。不重复调研。

交付：实际模型配对回执、原子需求判卷、负例、schema/图修正、独立审查或阻塞；更新本 HANDOFF。
