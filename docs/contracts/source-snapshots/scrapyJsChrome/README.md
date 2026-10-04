# 使用说明

双项目开发、SDK 同步、联调与验证统一维护在核心仓库的 [开发工作流](../scrapyJs/docs/devflow.md) 与 [当前验证报告](../scrapyJs/docs/devflow-verification-2026-10-01.md)。不要手改 `assets/js/plugins/scrapyJs.js`；使用核心 `scripts/sdk-sync.cjs`。

借鉴 Instant Data Scraper

## todo

- 增加保存脚本接口，保存自己常用脚本。
- 考虑增加脚本市场，其他人也可以使用。
- 优化页面布局，
- 第一次的默认状态，是直接显示，还是怎样？一开始是未选中状态，
- 多语言版本，适合各国多国家用户使用。 60m
- 点击翻页按钮，什么时候完成翻页和爬虫？

- 显示当前爬取后的数据数量，
- +在运行爬虫后，缓存的配置内容需要细化到每个网站。
+增加一个pipline接口回调功能，
- 提供简单的ai提示词，方便生成对应代码。可以一个超链接，打开文章
- 预览表格缺少水平和垂直滚动条，无法查看下面的内容，

- 自动识别页面中的写一页按钮，通过特殊字符或翻页特征。
- 考虑对接增加ai功能，自动生成精准选择器。
- 立刻更新表格中的数据和选择器
- 新增一个推荐字段名称，如 title，desc，logo。 当前官方的已经足够使用，
- 表格预览中的图片，可以直接显示一个小图片，而不是链接。
- 在预览数据表格上面增加x按钮，方便删除不需要字段，
- 服务器hook选项卡页面，直接填写hook地址，方便用户使用。demo说明，
- 增加一个过滤超链接中的参数功能，默认选中pipeline过滤超链接，
- 过滤图片后的特殊符号，避免下载保存图片出现后缀问题，获下载失败。如pengpengjy.jpg!1

- 修改后，不要立刻更新预览表，使用延迟更新，
- 采集详情页内容，整合数据。

- 分析是否可以替代市场上旧的其他软件

- 在点击爬取运行后，保存网址也列表选择器。方便下次使用。增加一个用户保存按钮。
- 处理反扒部分数据处理，如boss直聘中的薪水数字显示乱码。

- 处理反扒的随机字符处理。如淘宝，百度class中命令是 words-text5ps7d 等
- 增加常用大网站的配置，如百度，淘宝，谷歌....

- 淘宝网站中没有正常运行：1、手动复制代码。 2、修复注入失败。

## 核心逻辑

点击开启运行 ， 把输入框中的代码，传入 
        const url = await executeInBackground(script);

background 调用popup.js  TB.bridge.send('ScrapyJs', 'selected_nextPageBtn', { data: 'testtest' })
在网页中调用 popup.js ， callChromeBridgeInterface("ScrapyJs.selected_nextPageBtn", { data: 'testtest' }, "CHROME_BRIDGE_POPUP");
注意在custom_event.js 中可能需要添加对应新的事件。如果存在则跳过。

## 功能描述
> gpt生成对应代码

### 检测界面列表
- 爬虫框架-浏览器插件版本，借鉴 Instant Data Scraper 
- 检测界面列表数据，自动识别检测各种类型的列表数据。可以是table，div,li获其他。 在detectLists中
    - 通过列表常用特征识别。如class id ul 等
    - 通过列表中是否有翻页按钮，来识别列表。
    - 列表子元素数量，>=3 
    - 列表必须可视。
    - 列表子元素大部分宽高相同。
    - 列表中的子元素class等特征相似度极高。
    - 列表的class id等特征，可能会包含通用命令方式。如包含list字符。可能出现包含list字符的class只是列表的子元素，他的父容器在是真实的列表。比如这个他的兄弟节点都包含list，
    - 在通用逻辑检测失败后，可以通过特征计算，来识别列表。
    - 可以参考Instant Data Scraper逻辑。
    - 子元素一般都是充值，获水平显示。或换行
    - 过滤隐藏元素，不计算。
    - 优先采用包含翻页按钮部分。翻页的class通常包含特征命名方式，可以包含常用的（国内国外）ui框架的命名变量，如 el-pagination ，或单词的常用命名方式
    - 需要排除部分内容：如导航栏，侧边栏，底部栏，广告栏等。
    - 可以方法传递参数，处理网页中特定性的class选择器。在点击下一个表格运行next，可能在中途使用过程中，程序获手动修改列表选择器，next 获 detectlist 中传入参数
    - 避免同时获取里列表和详情内容，特别是包含了 detail 详情特征。
- 如果存在多个列表，则优先获取界面中显示范围最大的列表。通过范围大小进行降序排列。
- 爬虫框架尽量是通用性逻辑，而不是我给出参考网站的特定html解析处理逻辑。
- 在获取列表后，需要生成对应的选择器。在 getTableData中返回数据和选择器。结果如下
- 可以切换下一个列表，在执行next()时，列表会有选中高亮状态。
- 通过点击元素，冒泡判断父元素是否是列表，如果是则选中。

- 返回表格数据 getTableData
    - 嵌套数据
        - 不是相同的子元素，则直接展开放到顶层。
        - 如果是相同的，只有文本。则直接放到数组text中。
    - 同一个a，只返回一个。特别容易出现多个a，但是里面的text和href 都是相同的。
    - 如果出现多个img，如果src相同，则只返回一个。不要采用 img[src???]的方式。

"data": [
        {
            ".title": {
                "selector": ".title",
                "tag": "a",
                "text": "SwiftUI与机器学习",
                "href": "https://download.csdn.net/blog/column/10019371"
            },
        }
]

## 测试数据


const testData = [
    {
        title: "Python数据分析实战教程",
        description: "本教程详细介绍了Python数据分析的核心概念和实践应用",
        url: "https://example.com/python-course",
        price: "99.00",
        countInfo: "1250",
        author: "张明",
        _internalId: "001"
    },
    {
        title: "深度学习入门指南",
        description: "从零开始学习深度学习，包含详细的理论讲解和代码实践",
        url: "https://example.com/deep-learning",
        price: "199.00",
        countInfo: "856",
        author: "李华",
        _internalId: "002"
    }
];

handler.setTableData(testData);

## 测试代码

    async function getUrl() {        
        const script = `                    
            async function timeTest() {   
                let url = await page.url();
                return url;
            }
            timeTest();
        `;
        const url = await executeInBackground(script);
        return url;
    }
    // 提取出一级域名，调用getUrl()函数
    async function extractDomain() {
        const url = await getUrl();
        const domain = new URL(url).hostname;
        return domain;
    }

## 反扒特殊特征
- boss 直聘中的薪水不是数字文本，是采用了特殊处理。

## 从执行的控制台复制出来


const script = `
    async function timeTest() {            
        
const itemConfig = {
  _listContainer: "div.file-content",
  title: 'a.title',
  description: 'div.desc',
  url: 'a.title::href',
  price: 'span.price',
  countInfo: 'span.text.ml-24',
  author: 'span.text.flex-1',
};
let url = await page.url();
// Single starting URL instead of multiple URLs
const start_urls = [url];

// Define next page selector for pagination
const nextPageSelector = "button.btn-next";

const selector = itemConfig._listContainer;

const spiderConfig = {
  name: 'csdn_course_spider',
  start_urls: start_urls,
  delay: 500,
  itemConfig: itemConfig,
  puppeteerConfig: {
    listItemSelector: selector,
    nextPageSelector: nextPageSelector,
    // Add configuration for handling pagination
    waitForSelector: nextPageSelector,
    maxPages: 769 // Optional: limit the number of pages to scrape
  },
  custom_settings: {
    CLOSESPIDER_PAGECOUNT: 1,
  },
//   output: 'csdn_columns.json'
};

const spider = new ChromeSpider(spiderConfig);
scrapy.spider = spider;

// Add pipeline to filter out items without titles
scrapy.addPipeline(function (item) {
  if (!item.title) return null;
  return item;
});


let items = await scrapy.start();
    return items;
    }
    timeTest();
`;

const result = await executeInBackground(script);
console.log('execute in crawl result:', result);

    const handler = new TableDataHandler();
    handler.setTableData(result);


    
