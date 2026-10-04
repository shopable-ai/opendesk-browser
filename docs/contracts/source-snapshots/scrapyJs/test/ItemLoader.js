// const cheerio = require('cheerio');

  var itemConfig = {
    title: '//h3[contains(@class, "c-title")]/a', 
    url: '//h3[contains(@class, "c-title")]/a/@href', 
    xpathTest:{
        title: '//h3[contains(@class, "c-title")]/a',
        url: '//h3[contains(@class, "c-title")]/a/@href',
    }
  };

  var htmlString = await page.content();
  var listItems = await ItemLoader.parse(htmlString, listItemConfig);
  
  console.log('listItems:', listItems);

  
  // Example usage with XPath
  var itemConfig = {
    title: 'h3.c-title a',
    description: 'span.content-right_2s-H4',
    url: 'h3.c-title a::href',
    image: 'div.image-wrapper_39wYE img::src',
    sourceLink: 'div.source_1Vdff a::href',
    titleHtml: 'h3.c-title a::outerHTML',
  };

  var itemConfig = {
    title: 'h3.c-title a',
    description: 'span.content-right_2s-H4',
    url: 'h3.c-title a::href',
    image: 'div.image-wrapper_39wYE img::src',
    sourceLink: 'div.source_1Vdff a::href'
  };
  
// 测试页面 https://book.douban.com/subject/36971580/
var book_meta_config = {
    "douban_id": '//meta[@property="og:url"]/@content',  // Extract the douban_id from the URL.
    "cover": '//img[@rel="v:photo"]/@src',  // Extract cover image URL.
    "slug": '//meta[@property="og:url"]/@content',  // Extract and process into a slug later.
    "name": '//title/text()',  // Extract the name/title from the page title.
    "alt_name": '//text()[preceding-sibling::span[text()="原作名:"]][following-sibling::br]',  // Extract the alternative name.
    "sub_name": '//text()[preceding-sibling::span[text()="副标题:"]][following-sibling::br]',  // Extract subtitle.
    "authors": '//a[parent::span[child::span[text()=" 作者"]]]/text()',  // Extract authors.
    "summary": '//div[@id="link-report"]//div[@class="intro"]/p/text()',  // Extract book summary.
    "author_intro": '//div[@class="indent "]//div[@class="intro"]/p/text()',  // Extract author's introduction.
    "translators": '//a[parent::span[child::span[text()=" 译者"]]]/text()',  // Extract translators.
    "series": '//a[preceding-sibling::span[text()="丛书:"]][following-sibling::br]/text()',  // Extract series.
    "publisher": '//text()[preceding-sibling::span[text()="出版社:"]][following-sibling::br]',  // Extract publisher.
    "publish_date": '//text()[preceding-sibling::span[text()="出版年:"]][following-sibling::br]',  // Extract publish date.
    "pages": '//text()[preceding-sibling::span[text()="页数:"]][following-sibling::br]',  // Extract number of pages.
    "price": '//text()[preceding-sibling::span[text()="定价:"]][following-sibling::br]',  // Extract price.
    "binding": '//text()[preceding-sibling::span[text()="装帧:"]][following-sibling::br]',  // Extract binding type.
    "isbn": '//text()[preceding-sibling::span[text()="ISBN:"]][following-sibling::br]',  // Extract ISBN.
    "douban_score": '//strong[@property="v:average"]/text()',  // Extract Douban score.
    "douban_votes": '//span[@property="v:votes"]/text()',  // Extract the number of votes.
    "tags": '//a[@class="  tag"]/text()'  // Extract tags.
}

var htmlString = await page.content();
var bookInfo = await ItemLoader.parse(htmlString, book_meta_config);

console.log('listItems:', bookInfo);


// Test code for listPageConfig and detailPageConfig
(async () => {
  // Test configuration for list page
  const listPageConfig = [
    {
      title: 'h3.c-title a',
      link: 'h3.c-title a::href',
      description: 'span.content-right_2s-H4',
      sourceLink: 'div.source_1Vdff a::href',
      imageSrc: 'div.image-wrapper_39wYE img::src',
      titleHtml: 'h3.c-title a::innerHTML'
    }
  ];

  // Test configuration for detail page
  const detailPageConfig = {
    title: 'h1.page-title',
    content: 'div.article-content',
    author: 'div.author-info span.name',
    date: 'div.publish-date',
    imageSrc: 'div.main-image img::src',
    tags: 'div.tag-container span.tag',
    categories: 'div.category-list a',
    company: {
      title: '.page-company-title',
      desc: '.company-desc'
    }
  };

  // Example HTML string for Cheerio testing
  const htmlString = `<div>
    <h3 class="c-title"><a href="/article/123">Article Title</a></h3>
    <span class="content-right_2s-H4">This is the description</span>
    <div class="source_1Vdff"><a href="/source/123">Source Link</a></div>
    <div class="image-wrapper_39wYE"><img src="/images/pic.jpg" /></div>
  </div>`;

  // Load and parse data from list page
  const listItems = await ItemLoader.parse(htmlString, listPageConfig);
  console.log('List Page Parsed Data:', listItems);

  // Load and parse data from detail page
  const detailHtmlString = `<div>
    <h1 class="page-title">Detail Page Title</h1>
    <div class="article-content">This is the content of the article</div>
    <div class="author-info"><span class="name">Author Name</span></div>
    <div class="publish-date">2024-10-02</div>
    <div class="main-image"><img src="/images/detail-pic.jpg" /></div>
    <div class="tag-container"><span class="tag">Tag1</span><span class="tag">Tag2</span></div>
    <div class="category-list"><a href="/category/tech">Tech</a></div>
    <div class="page-company-title">Company Title</div>
    <div class="company-desc">Company Description</div>
  </div>`;

  const detailItem = await ItemLoader.parse(detailHtmlString, detailPageConfig);
  console.log('Detail Page Parsed Data:', detailItem);
})();

var listPageConfig = 
    {
      title: 'h3.c-title a',
      description: 'span.content-right_2s-H4',
      link: 'h3.c-title a::href',
      sourceLink: 'div.source_1Vdff a::href',
      imageSrc: 'div.image-wrapper_39wYE img::src'
    }
  ;
var htmlString = await page.content();
var listItems = await ItemLoader.parse(htmlString, listPageConfig);
console.log('listItems:' , listItems );