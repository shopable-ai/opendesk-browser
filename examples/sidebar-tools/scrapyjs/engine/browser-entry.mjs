// Browser SDK modules, exported lexically for the original Controller Worker.
import Scrapy from '../vendor/scrapyjs/src/core/Scrapy.js';
import ChromeSpider from '../vendor/scrapyjs/src/core/ChromeSpider.js';
import ChromeDownloaderMiddleware from '../vendor/scrapyjs/src/middleware/ChromeDownloaderMiddleware.js';
import Spider from '../vendor/scrapyjs/src/core/Spider.js';
import Request from '../vendor/scrapyjs/src/http/Request.js';
import Item from '../vendor/scrapyjs/src/item/Item.js';
import ItemLoader from '../vendor/scrapyjs/src/item/ItemLoader.js';
import extraction from '../vendor/scrapyjs/src/item/item-loader-extraction.js';
const normalizeConfig=extraction.normalizeConfig;
export {normalizeConfig,Scrapy,ChromeSpider,ChromeDownloaderMiddleware,Spider,Request,Item,ItemLoader};
