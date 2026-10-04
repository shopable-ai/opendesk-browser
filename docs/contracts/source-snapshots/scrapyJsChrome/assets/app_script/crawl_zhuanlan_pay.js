// 付费专栏链接爬取
async function saveArticle(url, content,prefix, cookie, fetchContent = true, proxy = null) {
  let api = `${BaseUrl}/app/operate/csdn/articleSave`;
  let token = localStorage.token;
  if (fetchContent && !content) {
      content = await fetchArticleContent(url, cookie, proxy);
  }
  let ispay = prefix.includes('pay'); 
  let res = await axios.post(api, { url, content, prefix, cookie, token, ispay, ignore: true }).then((res2) => res2.data);
  console.log("resData", JSON.stringify(res));
  return res;
}

// 新函数：获取文章内容
async function fetchArticleContent(url, cookie, proxy = null) {
    try {
        const html = await axios.get(url).then(r => r.data);
        
        const $ = cheerio.load(html);
        let contentEle = $('.blog-column-content-paper') || $('#content_views');
        if (!contentEle.length) contentEle = $('#content_views');
        
        const [, title] = html.match(/<title>(.*?)<\/title>/) || [];
        
        let content;
        if (contentEle.length) {
            content = contentEle.html();
            content = `<!-- ${url}  ${title} --> \n` + content;
        } else {
            content = html;
        }

        // 检查是否在浏览器环境中运行
        if (typeof window === 'undefined' && content) {
            // Node.js 环境，使用 iconv 进行编码
            const iconv = require('iconv-lite');
            content = iconv.encode(content, 'utf8').toString();
        }
        
        return content;
    } catch (error) {
        console.error(`Error fetching content for ${url}:`, error.message);
        return null;
    }
}

async function saveZhuanlan(data) {
  let api = `${BaseUrl}/app/operate/csdnzhuanlan/add`;
  let res = await axios.post(api, { ...data }).then((res2) => res2.data);
  console.log("resData", JSON.stringify(res));
  return res;
}


async function getZhuanlanId(url) {
  if ( !url.includes('blog.csdn.net') && !url.includes('download.csdn.net') ) return null;
  if (url.includes('column')) {
    let [, columnId] = url.match(/column\/(\d+)/) || [];
    return columnId;
  }
  // https://blog.csdn.net/baimafujinji/category_7313378.html
  // 匹配 category_(\d+).html
  // axios.get 后，用正则匹配获取
  let html = await axios.get(url).then(r => r.data);
  let [, columnId] = html.match(/category_(\d+).html/) || [];
  return columnId;
}

async function getColumns(cookie){
    let nowTime = Date.now();

    //全部数据
    if (!cookie) return console.error("Cookie is required");

    const cookieHeader = Array.isArray(cookie) ? cookie.map(c => `${c.name}=${c.value}`).join('; ') : cookie;

    const url = "https://bizapi.csdn.net/mall/mp/mallorder/order/list?order_status_type=0&page=1&type=0";
    const res = await axios.get(url, {params: {  fromUsername: "csdn_sysnotify",  time: String(nowTime),  limit: "1000",},
        headers: {
          Cookie: cookieHeader,
          "Sec-Ch-Ua": '"Microsoft Edge";v="117", "Not;A=Brand";v="8", "Chromium";v="117"',
          "Sec-Ch-Ua-Mobile": "?0",            "Sec-Ch-Ua-Platform": '"Windows"',
        },          withCredentials: true,
      }).then((response) => response.data);
    console.log('getColumns:',  res );
    // message: "X-Ca-Key is not exist"
    return res;
}

async function getDownloadLogs(cookie, type = 'zhuanlan') {
  let reslist = [];
  let list = [];
  // 获取当前时间的时间戳（毫秒）
  let nowTime = Date.now();

  //全部数据
  if (!cookie) return console.error("Cookie is required");

  const cookieHeader = Array.isArray(cookie) ? cookie.map(c => `${c.name}=${c.value}`).join('; ') : cookie;

  // https://bizapi.csdn.net/mall/mp/mallorder/order/list?order_status_type=0&page=1&type=0
  const historyUrl = "https://msg.csdn.net/v1/im/query/history";

  let getUrlDown = (textTip) => {
    // 提取textTip中的链接
    var linkRegex = /(https?:\/\/[^\s]+)/g;
    var matches = linkRegex.exec(textTip);

    if (matches && matches.length > 0) {
      var link = matches[0];
      return link;
    }
    return "";
  };
  let getTitleDown = (textTip) => {
    var titleRegex = /\【(.*?)\】/;
    var match = titleRegex.exec(textTip);

    if (match && match.length > 1) {
      var title = match[1]; // 匹配到的内容即为标题
      return title;
    }
    return "";
  };
  let getTitleZhuanlan = (textTip) => {
    let [, title] = textTip.match(/《(.*?)》/) || [];
    return title;
  }
  let getUrlZhuanlan = (textTip) => {
    let { description } = JSON.parse(textTip);
    let [, url] = description.match(/<a href="(.*?)"/) || [];
    return url;
  }
  let getUrl = (textTip) => {
    let type = textTip.includes("专栏购买成功") ? "zhuanlan" : "download";
    return type == 'download' ? getUrlDown(textTip) : getUrlZhuanlan(textTip);
  }
  let getTitle = (textTip) => {
    let type = textTip.includes("专栏购买成功") ? "zhuanlan" : "download";
    return type == 'download' ? getTitleDown(textTip) : getTitleZhuanlan(textTip);
  }

  try {
    const res = await axios.get(historyUrl, {params: {  fromUsername: "csdn_sysnotify",  time: String(nowTime),  limit: "1000",},
        headers: {
          Cookie: cookieHeader,
          "Sec-Ch-Ua": '"Microsoft Edge";v="117", "Not;A=Brand";v="8", "Chromium";v="117"',
          "Sec-Ch-Ua-Mobile": "?0",            "Sec-Ch-Ua-Platform": '"Windows"',
        },          withCredentials: true,
      })
      .then((response) => response.data);
      // {"picUrl":"https://img-home.csdnimg.cn/images/20230911052040.png?utm_medium=notify.im.blog_order.20240710.a","flag":"graphic","description":"专栏购买成功\n已成功购买<a href=\"https://blog.csdn.net/qq_34059233/category_12290680.html?utm_medium=notify.im.blog_order.20240710.a&username=2301_82156679\" target=\"_blank\">《 C#串口通信从入门到精通 》</a>，感谢您对博主的支持。","title":"购买成功通知","url":"https://blog.csdn.net/qq_34059233/category_12290680.html?utm_medium=notify.im.blog_order.20240710.a&username=2301_82156679"}
      // {"textTip":"你已经成功下载了资源【蓝牙串口通信】，资源质量如何？是否对你有用？不妨来说两句吧！评论满10字可得下载积分~快去评论吧：https://download.csdn.net/download/qq_41121080/11954958?utm_medium=notify.im.downloadSource.20240709.a&username=2301_82156679   （如遇到使用问题请及时私信“上传者”）","textType":0}
    reslist = res.data.filter((item) =>
      item.messageBody.includes("你已经成功下载了资源") || item.messageBody.includes("专栏购买成功")
    );
    list = reslist.map((item) => ({
      title: getTitle(item.messageBody),
      url: getUrl(item.messageBody),
      type: item.messageBody.includes("你已经成功下载了资源") ? "download" : "zhuanlan",
      time: item.createTime,
      timeStr: new Date(item.createTime).toLocaleString(),
    }));
    console.log('getDownloadLogs' , list , 'res.data:', res.data)
    // 通过type 过滤对应数据
    if (type) {
      list = list.filter(item => item.type === type);
    }

    list = list.reverse();
    return list;
  } catch (error) {
    console.error(
      "Error fetching user info:",
      error.response ? error.response.data : error
    );
    return null;
  }
}

async function getUserInfo(cookie) {
  if (!cookie) console.error('Cookie is required');
  const cookieHeader = Array.isArray(cookie) ? cookie.map(c => `${c.name}=${c.value}`).join('; ') : cookie;
  const userInfoUrl = "https://bizapi.csdn.net/community-personal/v1/get-personal-info";

  try {
    const res = await axios.get(userInfoUrl, {
      headers: {
        'Cookie': cookieHeader,
        accept: "application/json, text/plain, */*",
        "x-ca-key": "203796071",
        "x-ca-nonce": "dfd7ffb7-c0ca-42f3-838c-d5e07c62b18d",
        "x-ca-signature": "U2K9uoInl//6cm3quOpuTWAu7xSufJsr4UpkNBOU7k0=",
        "x-ca-signature-headers": "x-ca-key,x-ca-nonce",
      }
    }).then((response) => response.data);
    // console.log("getUserInfo res:", res);
    const userInfo = res?.data?.basic;
    return userInfo;
  } catch (error) {
    console.error('Error fetching user info:', error.response ? error.response.data : error);
    return null;
  }
}



async function getColumnInfo(url) {
  try {
    const response = await axios.get(url);
    const $ = cheerio.load(response.data);
    const html = response.data; 
    // 直接从 title 标签获取标题
    const title = $('title').text().trim();
    
    // 获取专栏顶部信息区域
    const directoryTop = $('.blog-column-directory-top');
    if (!directoryTop.length) return {};
    
    const directoryText = directoryTop.text();
    
    // 从整个HTML内容中判断是否超级会员免费看
    let isVipFree = html.includes('超级会员免费看');
    
    // 从HTML中提取价格，匹配 "price": "99.00" 格式
    let price = null;
    const priceMatch = html.match(/"price":\s*"(\d+\.?\d*)"/);
    if (priceMatch && priceMatch[1]) {
      price = priceMatch[1];
    }
    
    // 判断是否已订阅
    const subscribed = directoryText.includes('已订阅');
    // 如果已订阅，将isVipFree设为默认值，// 从html的隐藏数据中获取数据，也不行，必须手动设置。
    if (subscribed)  isVipFree =  ColumnDefaultType ||  null;  
    
    // 获取文章数量
    // const countSelector = 'div.blog-column-content-paper > div.blog-column-content-paper-num > div:nth-child(2) > span:nth-child(1)';
    // const count = parseInt($(countSelector).text()) || 0;
    // 从HTML中提取文章数量
    let count = 0;
    const countMatch = response.data.match(/"articleCount":\s*(\d+)/);
    if (countMatch && countMatch[1]) {
      count = parseInt(countMatch[1]);
    }

    return {
      isVipFree,
      title,
      price,
      subscribed,
      count,
      desc: '获取非订阅状态的信息',
      info: directoryText
    };
  } catch (error) {
    console.error('解析专栏信息失败:', error);
    return {};
  }
}

/**
 * 有2种链接，专栏和文章。
 * 专栏的方式保存更好，包含标题。 https://download.csdn.net/blog/column/ 
 * .blog-column-content-paper  是专栏，
 * #content_views 是博客 
 */
async function crawlZhuanlan(url, cookie) {
  let columnId, columnUrl;
  columnId = await getZhuanlanId(url);
  if (!columnId) {
    console.error("未找到专栏id", url)
    return {};
  }
  cookie = cookie || await getCookies('csdn.net');
  columnUrl = `https://download.csdn.net/blog/column/${columnId}`;
  if ( url != columnUrl){
    await page.goto(columnUrl);
    await page.waitFor('.blog-column-directory-top')
  }
//   // 判断是否超级会员免费看 https://download.csdn.net/blog/column/7313378
//   let columnPageInfo = await page.evaluate(async () => {
//     // .blog-column-directory-top 里面是否包含 超级会员免费看 的文字
//     const element = document.querySelector('.blog-column-directory-top');
//     if (!element) return {} ;
//     let isVipFree = element ? element.innerText.includes("超级会员免费看") : false;
// //     document.querySelector('.lesson-price').innerText
// // '限时特价 ¥ 69.90'
//     // document.querySelector('.lesson-price') 如果已经订阅，则不显示
//     let [ , price] = element.innerText.match(/¥ (\d+\.\d+)/) || [];
//     let subcribed = element.innerText.includes("已订阅");
//     let count = document.querySelector("#app > div > div.main.pb-32 > div > div > div > div.blog-column-content > div.blog-column-content-paper > div.blog-column-content-paper-num > div:nth-child(2) > span:nth-child(1)").innerHTML;
//     if (count) count = parseInt(count);

//     console.log({ isVipFree , price, count })
//     return { isVipFree , price, subcribed, count ,length };
//   })
  const columnPageInfo = await getColumnInfo(columnUrl);
  let { isVipFree , price, subcribed, count } = columnPageInfo;

  // 专栏滚动到底部；
  // await pageScrollToBottom();
  
  // 通过count判断等待时间，40条一秒。
  let waitTime = 5000 + (count/ 40 * 2000) ;
  // await sleep( waitTime )
  console.log('get zhuanlan info:' , columnPageInfo , count ,length )

  let title = await page.title();
  let pay = isVipFree == false ? true : false ;

  // 通过ui获取专栏文章列表
  // const infos = await getArticales(columnUrl || url);
  // 通过协议获取专栏文章列表
  const infos = await getArticleSubLinks(columnUrl || url);

  const urls = infos.map( info => info.url);
  let dic = {} ;
  let contents = [];
  let prefix = pay ?'pay_':'';

  console.log('链接信息',urls);
  createNotify('爬取开始',{body:'文章数量:' + urls.length });
  console.log( '爬取开始' ,  '文章数量:' + urls.length , urls )
  let countDiff = urls.length - count ;
  let isSame = (countDiff == 0 || countDiff == 1 ) ;
  if (!isSame) setTimeout( createNotify('文章数量异常',{body:'文章数量:' + urls.length + '\n专栏作品:' + count }) , 3000  )
  await processUrls(urls, 1, prefix, cookie )
  // for (let i = 0; i < urls.length; i++) {
  //   let url = urls[i];
  //   console.log("当前链接", `${i}/${ urls.length }` , url);
  //   let content;
  //   let res = await saveArticle(url, content, prefix, cookie);
  //   if ( res.code != 1000) createNotify('爬取错误',{body: '错误信息:' + res.message });
  //   // await sleep(200);
  // }
  
  // 判断contents内容，是否有重复的，
  // let uniqueContents = new Set(contents);
  // let isDiff = uniqueContents.size < contents.length ;
  // if (isDiff) {
  //   createNotify('爬取失败',{body:'专栏内容可能有重复，请检查'});
  // }

  url = columnUrl;
  let crawled = urls?.length || 0 ;
  return {pay, isVipFree, price, subcribed, title,url ,columnId, prefix, infos, count, crawled, dic};
}

async function pageScrollToBottom(){
  return await page.evaluate(async () => {
    // Sleep function that returns a promise that resolves after the given time
    function sleep(ms) {
      return new Promise(resolve => setTimeout(resolve, ms));
    }

    async function scrollToBottom(element) {
      let atBottom = false;

      do {
        // Calculate if the element is at the bottom
        atBottom = element.scrollHeight - element.scrollTop <= element.clientHeight;

        // If not at the bottom, scroll to the bottom
        if (!atBottom) {
          element.scrollTop = element.scrollHeight;
          await sleep(2000); // Wait for 1 second
        }
      } while (!atBottom);
    }

    // Get the element and call the function
    const articlesEle = document.querySelector("#app > div > div.main.pb-32 div.blog-column-directory");
    scrollToBottom(articlesEle);

    var files = document.querySelectorAll(".blog-column-directory-content li");
    var length = files.length ;
    return length;
  })
}

async function processUrls(urls, concurrency = 1, prefix, cookie) {
  const chunks = [];
  for (let i = 0; i < urls.length; i += concurrency) {
    chunks.push(urls.slice(i, i + concurrency));
  }

  let processedCount = 0;
  const totalUrls = urls.length;

  for (const chunk of chunks) {
    const promises = chunk.map(async (url, index) => {
      console.log("当前链接", `${processedCount + index + 1}/${totalUrls}`, url);
      let content;
      try {
        const res = await saveArticle(url, content, prefix, cookie);
        if (res.code !== 1000)  createNotify('爬取错误', { body: '错误信息:' + res.message });
      } catch (error) {
        console.error(`Error processing URL ${url}:`, error);
        createNotify('爬取错误', { body: '错误信息:' + error.message });
      }
    });

    await Promise.all(promises);
    processedCount += chunk.length;
  }
}

// 获取专栏id，打开专栏， 获取列表，爬取列表，
async function getArticlesByApi(url, id, page = 1, size = 100) {
    const apiUrl = "https://blog.csdn.net/phoenix/web/v1/column/article-list";
    let allArticles = [];
    
    while (true) {
        try {
            const response = await fetch(`${apiUrl}?columnId=${id}&page=${page}&size=${size}`);
            const responseData = await response.json();
            const { data } = responseData;
            
            if (!data || !data.list || data.list.length === 0) break;
            
            allArticles = [...allArticles, ...data.list];  // .map(article => article.url)
            
            if (data.list.length < size) break;
            page++;
        } catch (error) {
            console.error(`Error fetching articles for column ${id}, page ${page}:`, error.message);
            break;
        }
    }
    // 只需要 title , url
    return allArticles.map(article => ({ title: article.title, url: article.url })) ;
}

function getZhuanlanId(url) {    
    let match = url.match(/column\/(\d+)/);
    if (match) return match[1]

    // 尝试匹配 category_数字 格式
    match = url.match(/category_(\d+)/);
    if (match) return match[1]
}

async function getArticleSubLinks(url) {
    const id = getZhuanlanId(url);
    return id ? await getArticlesByApi(url, id) : [];
}

async function getArticales(url) {
  let currUrl = await page.url();
  if ( currUrl != url) {
    await page.goto(url);
    await page.waitFor(1000);    
  }
  await page.waitFor(".blog-column-directory-content li");
  const infoList = await page.evaluate(() => {
    // 获取所有class为'file'的li元素
    // var files = document.querySelectorAll(".column_article_list li"); // 这是博客中的内容，
    var files = document.querySelectorAll(".blog-column-directory-content li");    
    const infos = Array.from(files).map(file => ({ url:file.querySelector("a").href, title: file.querySelector("a").innerText.trim() }));
    console.log(infos);
    return infos;
  });
  return infoList;
}


async function doCrawls(urls){
  var url = await page.url();
  urls = urls || [];
  // urls 头部添加url
  // let isZhuanlan = await getZhuanlanId(url);
  // if(isZhuanlan) urls.unshift(url);
  for (let i = 0; i < urls.length; i++) {
    await crawlItem(urls[i]);
  }
}
async function crawlItem(url, cookie){
  url = url || await page.url();
  cookie = cookie || await getCookies('csdn.net');
  var columnInfo = await crawlZhuanlan(url,cookie);
  var {pay, isVipFree, price, title,url , columnId,infos, count, crawled, dic} = columnInfo;
  console.log('crawlItem' , dic , columnInfo);
  // 上面 crawlZhuanlan已经保存了
  // for (let url in dic) {
  //   await saveArticle(url, dic[url], prefix);
  // }
  
  var user = await this.getUserInfo(cookie);
  var username = user?.nickname;
  var end = !title?.includes('持续更新')
  
  await saveZhuanlan( {title,url,price, columnId, status:true, username,end, detail:infos, count, crawled, ispay: pay } );
  
  createNotify('专栏爬取完成',{body:`专栏名称:${title}，文章数量:${infos.length}`});
}

/** 保存指定url 或当前专栏 **/
async function crawlColumnCurrent(url){  
  url = url || await page.url();
  let columnId = await getZhuanlanId(url);
  if (columnId) links.push(url);
  if (!columnId){
    // category_10216006.html
    let html = await axios.get(url).then(r => r.data);
    let [, columnIdPage] = html.match(/category_(\d+).html/) || [];
    columnId = columnIdPage;
    url = `https://download.csdn.net/blog/column/${columnId}`
    await page.goto(url)
    console.log('网页调整到专栏首页:' , url )
  }
  crawlItem(url);
}

// var BaseUrl = 'http://apidev.todo6.com';
// var BaseUrl = 'http://192.168.28.254:8001';
// var BaseUrl = 'https://api.todo6.com';
// var BaseUrl = 'http://192.168.28.254:8101';
// var BaseUrl = 'http://119.101.148.243:20344';
// var BaseUrl = 'http://121.62.25.59:32529';
var BaseUrl = 'http://27.25.149.173:32529';
var BaseUrl = 'https://apic.todo6.com';
var ColumnDefaultType = false ; // true :是超级免费看专栏，false: 付费专栏 方便获取超级会员免费看的专栏数据

/*
var cookie = await getCookies('csdn.net')
var zhuanlans = await getDownloadLogs(cookie);
var links = zhuanlans.map(i=>i.url.split('?')[0]);
console.log('所有专栏', zhuanlans, links);
if (!links?.length) {  
  var url = await page.url();
  let columnId = await getZhuanlanId(url);
  if (columnId) links.push(url);
}
if (!links?.length) console.error('没有获取到专栏')
// await doCrawls(links);
crawlItem(url);   // 之爬取当前专栏，通常解决某个专栏过程中可能出现问题。
*/

// crawlColumnCurrent();