// Bounded original examples; fixture oracles come from preserved source evidence.
// Live expected data is supplied by native-sites-app.mjs from the current DOM.
import expected from './original-sites-expected.json' with {type:'json'};

const douban = {
  "url": "https://book.douban.com/tag/%E7%BC%96%E7%A8%8B?start=0&type=T",
  "waitForSelector": "ul.subject-list > li.subject-item",
  "timeoutMs": 30000,
  "maxPages": 1,
  "itemConfig": {
    "_listContainer": "ul.subject-list",
    "_listItem": "li.subject-item",
    "publication": "div.pub",
    "rating": "span.rating_nums",
    "title": "div.info h2 a::title",
    "url": "div.info h2 a::href"
  },
  "validation": {
    "version": 1,
    "rowShape": "li.subject-item"
  },
  "fieldRequirements": [
    {
      "key": "title",
      "required": true,
      "valueType": "text"
    },
    {
      "key": "url",
      "required": true,
      "valueType": "url"
    },
    {
      "key": "publication",
      "required": true,
      "valueType": "text"
    },
    {
      "key": "rating",
      "required": false,
      "valueType": "text"
    }
  ],
  "processing": {
    "version": 1,
    "rules": [
      {
        "op": "splitPublication",
        "field": "publication"
      }
    ]
  }
};
const csdn = {
  "url": "https://download.csdn.net/list/blog/100-0-0-0-5-1.html",
  "waitForSelector": "div.file-content > div.course-list",
  "timeoutMs": 30000,
  "maxPages": 1,
  "itemConfig": {
    "_listContainer": "div.file-content",
    "_listItem": "div.course-list",
    "title": "a.title.line::text",
    "url": "a.title.line::href",
    "description": "div.desc.line-2::text",
    "price_text": "span.price::text",
    "metrics_text": "span.text.ml-24::text",
    "author_display": "span.text.flex-1::text",
    "membership": "div.vip > span::text"
  },
  "validation": {
    "version": 1,
    "rowShape": "div.course-list"
  },
  "fieldRequirements": [
    {
      "key": "title",
      "required": true,
      "valueType": "text"
    },
    {
      "key": "url",
      "required": true,
      "valueType": "url"
    },
    {
      "key": "description",
      "required": false,
      "valueType": "text"
    },
    {
      "key": "price_text",
      "required": true,
      "valueType": "text"
    },
    {
      "key": "metrics_text",
      "required": true,
      "valueType": "text"
    },
    {
      "key": "author_display",
      "required": true,
      "valueType": "text"
    },
    {
      "key": "membership",
      "required": false,
      "valueType": "text"
    }
  ]
};
const fixtureBase = 'http://127.0.0.1:43111/scrapyjs-fixtures/';

export const originalSites = [
  {name:'fixtureDouban',kind:'fixture',config:{...structuredClone(douban),url:fixtureBase+'douban-books.html'},expectedData:expected.doubanBooks.data},
  {name:'fixtureCsdn',kind:'fixture',config:{...structuredClone(csdn),url:fixtureBase+'csdn.html'},expectedData:expected.csdn.data},
  {name:'liveDouban',kind:'live',config:structuredClone(douban)},
  {name:'liveCsdn',kind:'live',config:structuredClone(csdn)}
];
