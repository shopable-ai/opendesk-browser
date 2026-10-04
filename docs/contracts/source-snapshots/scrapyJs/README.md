# scrapyjs

双项目开发、SDK 更新、联调与本地发布准备见 [开发工作流](docs/devflow.md)、[验证证据](docs/devflow-verification-2026-10-01.md)和 [后续路线](docs/devflow-roadmap.md)。专用 skill 在 [.agents/skills/scrapyjs-devflow](.agents/skills/scrapyjs-devflow/SKILL.md)；本机发现路径是指向该目录的 `~/.codex/skills/scrapyjs-devflow` symlink，不修改全局配置。

scrapyjs 是一个受 Scrapy 启发的 JavaScript 采集内核，支持 HTTP 请求链路和 Chrome 页面链路，提供 Request、Response、Spider、Rule、LinkExtractor、Pipeline、Feed Export 等基础能力。

## 当前状态

这是一个正在演进中的 Alpha 内核。

2026-10-01 技术核查发现导出并发、失败传播和重跑等问题；随后在独立副本补跑了 31 个现有测试、覆盖率、构建与包内容检查，均通过。缺陷尚未修复，真实浏览器闭环尚未验证。详细证据见[技术核查基线](docs/technical-baseline-2026-10-01.md)、[接续测试结果](docs/verification-2026-10-01.md)和[代码优化方案](docs/code-optimization-2026-10-01.md)，实施顺序见[执行待办](docs/execution-backlog.md)。

### 已有实现与配置
- HTTP 请求经统一 Scheduler 执行
- Request callback / parse fallback
- priority / dont_filter / retry / errback
- Rule / CrawlSpider / LinkExtractor 最小闭环
- 调度级下载延迟与有限并发 worker
- JSON / CSV / JSONL / HTTP sink 导出
- item schema whitelist / required / validators
- run stats 持久化
- `npm test` / `npm run test:coverage` / CI 配置（本次独立副本已通过 coverage，CI 未重跑）

### Fixture-based
- ItemLoader 解析固定 HTML fixture
- ExportManager CSV 展平与转义
- Pipeline 顺序处理
- 最小 Scrapy 集成
- Rule / Scheduler 回归行为

### Experimental
- Chrome / 扩展桥接抓取
- 复杂代理场景
- 大规模生产任务

## 环境要求

- 当前 `package.json` 声明 Node.js 18+，但锁定依赖要求更高；安装前需核对依赖的 `engines`。支持版本待统一和验证，见[技术核查基线](docs/technical-baseline-2026-10-01.md)。
- npm 9+

## 安装

```bash
npm install
```

## 最小示例

```js
const Scrapy = require('./src/core/Scrapy');
const { BaseSpider } = require('./src/core/BaseSpider');
const Request = require('./src/http/Request');
const Item = require('./src/item/Item');

class ExampleSpider extends BaseSpider {
  start_requests() {
    return [new Request('https://example.com')];
  }

  async *parse(response) {
    yield new Item({ url: response.url, text: response.text.slice(0, 20) });
  }
}

const scrapy = new Scrapy();
scrapy.spider = new ExampleSpider({ name: 'example' });
scrapy.start().then(console.log);
```

## 运行测试

```bash
npm run lint
npm test
npm run test:coverage
npm run pack:check
```

## 已验证示例

- `demo/baiduHttpSpider.js`
- `demo/csdnListSpider.js`
- `demo/csdnListHttpSpider.js`

这些示例已经调整为更接近真实执行链，不再预建海量 URL 数组。

## Fixture 与回归覆盖

当前测试覆盖以下关键模块：
- `ItemLoader.parse`
- `ExportManager`
- `Pipeline`
- `Scrapy` 最小集成
- `Rule / Scheduler`

测试使用本地 fixture，不依赖线上站点。

## 导出格式

支持以下输出目标：
- `.json`
- `.jsonl`
- `.csv`
- `http://...` / `https://...` 作为 HTTP push sink

## Alpha 扩展

当前已具备最小 Alpha 扩展能力：
- `itemSchema`：支持字段白名单、必填字段、字段校验
- `RUN_STATS_PATH` / `runStatsPath`：运行统计持久化为本地 JSON
- HTTP sink：把采集结果直接 POST 到远端接口

## 已知限制

- Chrome 抓取路径仍依赖页面桥接对象
- 上述已有实现不代表生产交付保证，所有 demo 仍需在目标环境验证
- 复杂 XPath 兼容仍有限，当前优先支持仓库已有形状
- `vitest.config.js` 已配置覆盖率门槛，本次核查因缺少 Vitest 未启动完整测试

## 产品判断与推进计划

- [文档索引](docs/README.md)：当前执行入口与历史文档的适用范围
- [价值、竞品与商业化分析](docs/project-assessment-2026-10-01.md)：评估日期 2026-10-01；市场选择、定价及验收阈值属于待验证建议
- [执行待办](docs/execution-backlog.md)：任务依赖、验收证据、P0/P1/P2 与 90 天决策门槛
- [技术核查基线](docs/technical-baseline-2026-10-01.md)：已确认缺陷、设计限制及尚未完成的验证

本轮更新仅同步分析与计划，尚未实施缺陷修复。开始开发前先核对现有实现与测试结果，避免直接照旧评分或历史 Phase 0 重做。

## 版本与发布

当前项目仍在 `1.0.0` 演进阶段。

- 版本策略：遵循 semver，后续对外发布时以破坏性变更提升 major，兼容功能提升 minor，修复提升 patch。
- 发布前提：`npm test` 通过，CI 绿色，并且 README 中列出的 verified 能力与代码实际一致。
- 变更记录：见 `CHANGELOG.md`。
