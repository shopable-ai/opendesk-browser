// Official media download: opaque candidate/rendition IDs, never arbitrary URL access.
export const MEDIA_ID='video-downloader';
export const MEDIA_VERSION='0.2.0';
export const MEDIA_CAPABILITY='page.mediaDownload';
export const MEDIA_OPERATIONS=Object.freeze(['media.detect','media.start','media.status','media.stop']);
export function classifyMedia(url,mime='',pageOrigin=''){
  if(typeof url!=='string'||url.length>4096||typeof mime!=='string'||mime.length>128)return null;
  let u;try{u=new URL(url);}catch{return null;}
  if(!['http:','https:'].includes(u.protocol)||u.username||u.password)return null;
  const type=mime.split(';')[0].trim().toLowerCase(),path=u.pathname.toLowerCase();
  const format=/\.mp4$/.test(path)||type==='video/mp4'?'mp4':
    /\.webm$/.test(path)||type==='video/webm'?'webm':
    /\.m3u8$/.test(path)||['application/vnd.apple.mpegurl','application/x-mpegurl'].includes(type)?'hls':
    /\.mpd$/.test(path)||type==='application/dash+xml'?'dash':null;
  if(!format)return null;
  return {url:u.href,format,allowed:u.origin===pageOrigin,
    reason:u.origin!==pageOrigin?'cross-origin':format==='dash'?'dash-not-supported':null};
}
