// Import/require all modules
const {BaseSpider, ISpider} = require('./core/BaseSpider');
const CrawlSpider = require('./core/CrawlSpider');
const Spider = require('./core/Spider');

const ChromeSpider = require('./core/ChromeSpider');
const ListSpider = require('./core/ListSpider');

const Scheduler = require('./core/Scheduler');
const Rule = require('./core/Rule');
const Scrapy = require('./core/Scrapy');
const Pipeline = require('./core/Pipeline');

const ChromeDownloaderMiddleware = require('./middleware/ChromeDownloaderMiddleware');
const DownloaderMiddleware = require('./middleware/DownloaderMiddleware');
const DownloaderMiddlewareManager = require('./middleware/DownloaderMiddlewareManager');

const { ProxyProviderConfig, IProxyProvider, StaticProxyProvider, DynamicProxyProvider, ProxyManager } = require('./middleware/ProxyMiddleware');

const ExportManager = require('./exporter/ExportManager');
const FeedExport = require('./exporter/FeedExport');

// const PaginationSpider = require('./extends/PaginationSpider');

const Request = require('./http/Request');
const Response = require('./http/Response');

const Item = require('./item/Item');
const ItemLoader = require('./item/ItemLoader');

const LinkExtractor = require('./link/LinkExtractor');

// Expose each class directly to the window object
if (typeof window !== 'undefined') {
  globalThis.ISpider = ISpider;
  globalThis.BaseSpider = BaseSpider;
  globalThis.CrawlSpider = CrawlSpider;
  globalThis.Spider = Spider;
  globalThis.ChromeSpider = ChromeSpider;
  globalThis.ListSpider = ListSpider;
  
  globalThis.Scheduler = Scheduler;

  globalThis.Rule = Rule;
  globalThis.Scrapy = Scrapy;
  globalThis.Pipeline = Pipeline;

  globalThis.ChromeDownloaderMiddleware = ChromeDownloaderMiddleware;
  globalThis.DownloaderMiddleware = DownloaderMiddleware;
  globalThis.DownloaderMiddlewareManager = DownloaderMiddlewareManager;

  //  ProxyProviderConfig, IProxyProvider, StaticProxyProvider, DynamicProxyProvider, ProxyManager
  globalThis.ProxyProviderConfig = ProxyProviderConfig;
  globalThis.IProxyProvider = IProxyProvider;
  globalThis.StaticProxyProvider = StaticProxyProvider;
  globalThis.DynamicProxyProvider = DynamicProxyProvider;
  globalThis.ProxyManager = ProxyManager;

  globalThis.ExportManager = ExportManager;
  globalThis.FeedExport = FeedExport;

  // globalThis.PaginationSpider = PaginationSpider;

  globalThis.Request = Request;
  globalThis.Response = Response;

  globalThis.Item = Item;
  globalThis.ItemLoader = ItemLoader;

  globalThis.LinkExtractor = LinkExtractor;

  console.log('init scrapyJs:', {ChromeSpider : !!ChromeSpider , Spider: !!Spider, BaseSpider: !!BaseSpider, CrawlSpider: !!CrawlSpider});
  
}
Object.setPrototypeOf(ListSpider.prototype, Spider.prototype);
Object.setPrototypeOf(Spider.prototype, CrawlSpider.prototype);
Object.setPrototypeOf(CrawlSpider.prototype, BaseSpider.prototype);
Object.setPrototypeOf(BaseSpider.prototype, ISpider.prototype);

// You can still export for Node.js if needed
module.exports = {
  ISpider,
  BaseSpider,
  CrawlSpider,  
  Spider,
  ChromeSpider,
  ListSpider,  

  Scheduler,
  Rule,
  Scrapy,
  Pipeline,
  ChromeDownloaderMiddleware,
  DownloaderMiddleware,
  DownloaderMiddlewareManager,

  ProxyProviderConfig, IProxyProvider, StaticProxyProvider, DynamicProxyProvider, ProxyManager,

  ExportManager,
  FeedExport,
  // PaginationSpider,
  Request,
  Response,
  Item,
  ItemLoader,
  LinkExtractor,
};
