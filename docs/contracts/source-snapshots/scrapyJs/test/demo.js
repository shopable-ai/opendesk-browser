
/**
 * Example implementation of a Spider (类似 Scrapy 中 Spider 的子类)
 */
class MySpider extends BaseSpider {
    constructor(config) {
      super(config);
    }
  
    async parse(response) {
      // Extract and process data from response
      const data = { title: "Example Title" };
      const item = new Item(data);
      
      this.pipeline.process_item(item, this);
  
      // Optionally add more requests here
    }
  }
  
  /**
   * Running the Scrapy framework (类似 Scrapy 中 CrawlerProcess 的用法)
   */
  (async () => {
    // 初始化 Scrapy
    const setting = {
      name: 'my_default_spider',
      start_urls: ['https://example.com'],
      headers: { 'User-Agent': 'MySpider/1.0' },
      pipeline: new Pipeline(),
      middlewares: [],
    };
    
    // 初始化 Spider 实例
    const mySpiderInstance = new MySpider(setting);
    
    // 初始化 Scrapy 实例
    const scrapy = new Scrapy(setting);
    
    // 设置 Spider
    scrapy.spider = mySpiderInstance;
    
    // 添加 Pipeline
    scrapy.addPipeline(function customProcessing(item) {
      item.processed = true;
      return item;
    });
    
    // 也可以添加代码字符串形式的 Pipeline
    scrapy.addPipeline(`
      function anotherProcessing(item) {
        item.processedByString = true;
        return item;
      }
    `);
    
    // 启动爬虫
    scrapy.start();
    
    // 清空 Pipeline
    // scrapy.clearPipeline();
    
    // 删除特定 Pipeline
    // scrapy.removePipeline(customProcessing);
    
  
    // Example usage: pause, resume, stop
    // scrapy.pause();
    // scrapy.resume();
    // scrapy.stop();
  })();
  

  class MySpider extends BaseSpider {
    constructor(config) {
      super(config);
    }
  
    // The generator function to handle responses
    async *parse(response) {
      // Process the response and yield items or new requests
      const data = {}; // Extract data from response
      yield new Item(data); // Yield an item
  
      // If there are more URLs to follow, yield new requests
      const nextUrl = 'https://example.com/next-page';
      yield new Request(nextUrl, this.parse.bind(this)); // Yield a new Request
    }
  }

  