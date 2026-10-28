// Local equivalents of scrapyJsChrome/examples/github-repositories/task.json
// and scrapyJs/examples/list-detail/common.cjs. No remote or Node downloader.
const url='http://127.0.0.1:43111/scrapyjs-fixtures/list-1.html';
export const fields={url,waitForSelector:'[data-listview-component="items-list"] > li',timeoutMs:10000,
  itemConfig:{_listContainer:'[data-listview-component="items-list"]',_listItem:'li',
    name:'[data-listview-item-title-container] h3 a, [data-listview-item-title-container] h4 a',
    url:'[data-listview-item-title-container] h3 a, [data-listview-item-title-container] h4 a::href',
    language:'[class*="PrimaryLanguageName"]',stars:'a[href$="/stargazers"]',description:'.repos-list-description'},
  validation:{version:1,rowShape:'li'},fieldRequirements:[
    {key:'name',required:true,valueType:'text'},{key:'url',required:true,valueType:'url'},
    {key:'language',required:false,valueType:'text'},{key:'stars',required:false,valueType:'text'},
    {key:'description',required:false,valueType:'text'}]};
export const pagination={...fields,nextPageSelector:'a[data-component="Pagination.NextPage"][rel="next"]',maxPages:5,dedupeKey:'url'};
export const listDetail={url,waitForSelector:'.catalog > article',timeoutMs:10000,
  itemConfig:{_listContainer:'.catalog',_listItem:'article',id:'.id::text',title:'.title::text',detailUrl:'a.title::href'},
  nextPageSelector:'a.next',maxPages:5,dedupeKey:'id',
  detail:{urlField:'detailUrl',identityField:'id',waitForSelector:'.detail > article',
    itemConfig:{_listContainer:'.detail',_listItem:'article',id:'.id::text',author:'.author::text',price:'.price::text'},numberFields:['price']}};
