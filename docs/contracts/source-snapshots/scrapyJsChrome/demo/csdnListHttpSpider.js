// const Scrapy = require('./core/Scrapy');
// const Spider = require('./core/Spider');
// const ItemLoader = require('./item/ItemLoader');


const generateUrls = (startPage, endPage) => {
  const urls = [];
  // https://download.csdn.net/list/blog/1-0-0-0-1-1.html
  for (let page = startPage; page <= endPage; page++) {
    // urls.push(`https://download.csdn.net/list/blog/1-0-0-0-1-${page}.html`);  //超级会员免费看
    urls.push(`https://download.csdn.net/list/blog/100-0-0-0-1-${page}.html`);  //所有专栏
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
  svip: 'div.vip',         // 超级会员免费看（新增）
  headImg: 'img.headImg::src',         // 作者头像URL（新增）
};

const spiderConfig = {
  name: 'csdn_course_spider',
  start_urls: generateUrls(1, 2180), // Generate URLs for all 769 pages
  itemConfig: itemConfig,
  delay: 2000,
  custom_settings: {
    // CLOSESPIDER_PAGECOUNT: 3, // Limit to 3 pages for testing, remove or increase for full scrape
  },
  output: 'csdn_columns.json'
};

const scrapy = new Scrapy();
const spider = new ListSpider(spiderConfig);

scrapy.spider = spider;

scrapy.addPipeline(function (item) {
  // if (!item.title) return null;
  item.author = item.author?.replace('| ', '');
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