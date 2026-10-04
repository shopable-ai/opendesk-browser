
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

const result = await executeInPage(script);
console.log('execute in crawl result:', result);