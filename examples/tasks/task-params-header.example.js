// ==OpenDeskParams==
// @version 1
// @param text keyword "关键词" required minLength=1 maxLength=120 default="浏览器" description="填写要匹配的文本。" placeholder="输入关键词"
// @param number limit "最多条数" required min=1 max=100 default=20
// @param slider quality "匹配阈值" min=0 max=100 step=5 default=80 unit="%" description="阈值越高，匹配要求越严格。"
// @param select format "输出格式" options=[["markdown","Markdown"],["json","JSON"],["csv","CSV"]] default="markdown"
// @param checkbox includeLinks "附上原文链接" default=true
// @param checkbox externalOnly "仅站外链接" default=false
// @param switch deduplicate "自动去重" default=true
// @param radio scope "采集范围" options=[["current","当前页"],["all","全部页"]] default="current"
// @param multi-checkbox contentTypes "内容类型" options=[["article","正文"],["link","链接"],["image","图片"]] default=["article","link"]
// @param number timeout "等待秒数" min=1 max=60 default=10
// @param textarea notes "补充说明" maxLength=500 default="" placeholder="输入补充要求"
// @param url startUrl "起始网址" description="可选，仅在本脚本需要时使用；不赋予网站访问权限。" placeholder="https://example.com"
// @param date since "更新日期" description="可选，仅整理该日期及之后的内容。"
// @param time afterTime "起始时刻" description="可选，本地钟表时间，不包含时区或定时调度语义。"
// ==/OpenDeskParams==

// Reference Controller source. The sample has no page/network effects.
// The existing runtime supplies lexical params after trusted admission.
async function main() {
  return { params };
}
