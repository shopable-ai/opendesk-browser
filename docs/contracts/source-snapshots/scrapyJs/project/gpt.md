# ai 开发功能描述

x 1、需要一个方法，设置表格数据、表格数组中的格式是json ，单条数据如itemConfig，不处理_开头的字段。
x 2、表格的字段数量是动态的。
x 3、提供一个测试数据，方便我直接测试，调用方法。
4、我需要一个方法，获取当前网页中的表格数据，在点击下一个个表格时切换内容。
x 5、提供一个下载方法，需要下载 txt json csv 文件。支持传入文件名和数据的参数。
x 6、json数组转换成 csv格式，需要直接下载。
- 7、默认采用当前一级域名作为文件名，
8、获取当前选中页面的网址，提取一级域名，作为文件名。
x 9、增加csv表头选项卡，可以自定义表头。一个表头一个输入框。可以用占位或者prefix label的方式。
10、增加ai功能，最好直接提供模板，让ai给出配置和代码。把关键内容复制出去，如网页的html，和预留模板需求描述。
增加pipeline功能
增加api回调功能，直接把数据发送到api post接口。
支持复制代码
代理Ip功能，购买，或app代理，
提供一个电脑桌面exe请求方式，解决header问题。
增加语言包，可以切换语言，默认是中文。如果检车到不在中国，就默认英文。
获取页面多个列表数据，使用元素宽高大小作为排序，

处理详情页面，作为一条数据处理。


支持复杂类型爬虫，如输入urls，获取拼多多达人带货链接视频，自动翻页
可以结合左面自动化脚本，完成桌面鼠标滚动翻页或者键盘按键，
app爬虫的超链接
代码转换成http请求爬虫，
使用代理运行，用自己手机运行app，


x 如果config里面的内容有变化，重新组合字符串，并更新脚本。 
x 完善修改header逻辑，如果在界面修改后，点击csv是需要采用设置的  


我开发了一个模仿scrapy 的js版本浏览器插件，代码运行在background中。需要开发一个Ui界面，方便用户使用，
js接口也实现了 puppeteer 的功能，如 page.click , page.type ， page.goto
如果使用翻页，先使用使用page.click 点击网页元素。
- x 我需要你参考这个界面，提供一个chrome extension 中的界面，类似Instant Data Scraper的界面和用法，可以弹窗一个独立界面窗口。
  - 先给出本地的html代码，预览界面效果。
  - 提供chrome extension 代码。
- x 点击浏览器图标，弹出一个独立界面窗口，
- 点击“另一个表格”按钮，运行js获取对应代码，获取数据，并显示在下面的数据预览中。
- 我希望使用scrapy的pipeline设计，修改表格的数据抬头字段，[ai]程序先给出通用的代码，用户可以自定义字段（表头）
  - 因为用户自定义表头，需要用户自定义配置，可以参考下面代码的配置。如itemConfig。可以直接显示文本框，方便用户复制和编辑数据部分。
  - 可以复制出整个代码，用户可以保存或其他地方运行。后期打算把它在扩展为nodejs版本。
- x 在底部数据预览部分改为多个tab选项卡，1数据，2、config 3、代码
- x 在data preview 中显示默认占位数据


// const Scrapy = require('./core/Scrapy');
// const Spider = require('./core/Spider');
// const ItemLoader = require('./item/ItemLoader');


const generateUrls = (startPage, endPage) => {
  const urls = [];
  // https://download.csdn.net/list/blog/1-0-0-0-1-1.html
  for (let page = startPage; page <= endPage; page++) {
    urls.push(`https://download.csdn.net/list/blog/1-0-0-0-1-${page}.html`);
  }
  return urls;
};

const itemConfig = {
  _listContainer: "div.file-content",
  title: 'a.title',
  description: 'div.desc',
  url: 'a.title::href',
  price: 'span.price',
  countInfo: 'span.text.ml-24',
  author: 'span.text.flex-1',
};

const spiderConfig = {
  name: 'csdn_course_spider',
  start_urls: generateUrls(1, 900), // Generate URLs for all 769 pages
  itemConfig: itemConfig,
  custom_settings: {
    // CLOSESPIDER_PAGECOUNT: 3, // Limit to 3 pages for testing, remove or increase for full scrape
  },
  output: 'csdn_columns.json'
};

const scrapy = new Scrapy();
const spider = new ListSpider(spiderConfig);

scrapy.spider = spider;

scrapy.addPipeline(function (item) {
  if (!item.title) return null;
  return item;
});

scrapy.start()
  .then((items) => {
    console.log('Scraping process finished.');
    console.log('Collected items:', items);
  })
  .catch((err) => {
    console.error('Error during scraping process:', err);
  });


