// Video SVIP R0.3: fixed read-only capability, never a caller-provided script or selector.
export const VIDEO_SVIP_ID='video-svip';
export const VIDEO_SVIP_VERSION='0.3.0';
export const VIDEO_SVIP_CAPABILITY='page.videoContext';
export const VIDEO_SVIP_OPERATIONS=Object.freeze(['videoSVIP.inspect','videoSVIP.watch','videoSVIP.stop']);
export const VIDEO_SVIP_WATCH_PORT='opendesk.video-svip.watch.v1';
// First-party site adapters are deliberately independent of the sandbox UI.
// Production selectors are provisional until tested on live websites.
export const VIDEO_SVIP_SITES=Object.freeze([
 {id:'tencent',name:'腾讯视频',hosts:['v.qq.com','m.v.qq.com'],paths:['/x/cover/','/x/page/','/x/m/','/play/'],
  titles:['[data-video-title]','h1.video-title','h1'],episodes:['[data-current-episode]','[aria-current="page"]','[aria-selected="true"]','.episode-list .active']},
 {id:'iqiyi',name:'爱奇艺',hosts:['iqiyi.com','iq.com'],paths:['/v_','/v/','/a_','/w_'],
  titles:['[data-video-title]','h1[data-testid="video-title"]','h1'],episodes:['[data-current-episode]','[aria-current="page"]','[aria-selected="true"]','.episode-list .active']},
 {id:'youku',name:'优酷',hosts:['youku.com'],paths:['/v_show/','/video/'],
  titles:['[data-video-title]','h1.video-title','h1'],episodes:['[data-current-episode]','[aria-current="page"]','[aria-selected="true"]','.episode-list .active']},
 {id:'mango',name:'芒果 TV',hosts:['mgtv.com'],paths:['/b/','/l/','/h/'],
  titles:['[data-video-title]','h1.video-title','h1'],episodes:['[data-current-episode]','[aria-current="page"]','[aria-selected="true"]','.episode-list .active']},
 {id:'bilibili',name:'哔哩哔哩',hosts:['bilibili.com'],paths:['/video/','/bangumi/play/'],
  titles:['[data-video-title]','h1.video-title','h1','[class*="video-title"]'],episodes:['[data-current-episode]','[aria-current="page"]','[aria-selected="true"]','.ep-item.active']},
 {id:'youtube',name:'YouTube',hosts:['youtube.com','youtu.be'],paths:['/watch','/shorts/','/live/'],
  titles:['h1.ytd-watch-metadata','h1.ytd-video-primary-info-renderer','h1'],episodes:['[data-current-episode]','[aria-current="page"]','[aria-selected="true"]']},
 {id:'netflix',name:'Netflix',hosts:['netflix.com'],paths:['/watch/'],
  titles:['[data-video-title]','[data-uia="video-title"]','h1'],episodes:['[data-current-episode]','[aria-current="page"]','[aria-selected="true"]']},
 // Explicit loopback test origin; never represents real platform verification.
 {id:'fixture',name:'受控测试页',hosts:['localhost','127.0.0.1'],paths:['/__opendesk_video_svip_fixture__/'],
  titles:['[data-opendesk-video-title]','h1'],episodes:['[data-opendesk-active-episode]','[aria-current="page"]']}
]);
export function videoSVIPSiteFor(input){
 let u;
 try{u=new URL(input);}catch{return null;}
 if(!['http:','https:'].includes(u.protocol)||u.username||u.password)return null;
 const host=u.hostname.toLowerCase();
 return VIDEO_SVIP_SITES.find(site=>
   site.hosts.some(domain=>site.id==='fixture'?host===domain:host===domain||host.endsWith('.'+domain))&&
   site.paths.some(prefix=>u.pathname.startsWith(prefix)))||null;
}
