// Pure, bounded HLS parser. URLs stay inside the trusted session, never the UI.
export const HLS_MAX_SEGMENTS=2048;
export function hlsAttributes(line){
  const out={},re=/([A-Z0-9-]+)=("(?:[^"\\]|\\.)*"|[^,]*)/g;
  for(const match of line.matchAll(re)){
    const raw=match[2];
    out[match[1]]=raw.startsWith('"')&&raw.endsWith('"')?raw.slice(1,-1):raw;
  }
  return out;
}
export function parseHlsPlaylist(input){
  if(typeof input!=='string'||input.length>262144)throw Error('E_HLS_SIZE');
  const lines=input.replace(/\r/g,'').split('\n').map(x=>x.trim()).filter(Boolean);
  if(lines[0]!=='#EXTM3U'||lines.length>10000)throw Error('E_HLS_INVALID');
  const variants=[],audio=[],segments=[],unsupported=[];
  let pending=null,encryption='clear',kind='media',container='ts',duration=null,init=null,ended=false;
  for(const line of lines.slice(1)){
    if(line.startsWith('#EXT-X-STREAM-INF:')){kind='master';pending=hlsAttributes(line.slice(18));continue;}
    if(line.startsWith('#EXT-X-MEDIA:')){
      const attrs=hlsAttributes(line.slice(13));
      if(attrs.TYPE==='AUDIO'&&audio.length<16)audio.push({
        group:attrs['GROUP-ID']||'',language:attrs.LANGUAGE||'',name:attrs.NAME||'',
        external:typeof attrs.URI==='string',uri:attrs.URI||null,default:attrs.DEFAULT==='YES'
      });
      continue;
    }
    if(line.startsWith('#EXT-X-SESSION-KEY:')||line.startsWith('#EXT-X-KEY:')){
      const key=hlsAttributes(line.slice(line.indexOf(':')+1));
      if(key.METHOD&&key.METHOD!=='NONE'){
        const next=key.METHOD==='AES-128'&&!key.KEYFORMAT?'encrypted':'drm';
        if(encryption!=='drm')encryption=next;
      }
      continue;
    }
    if(line.startsWith('#EXTINF:')){
      duration=Number(line.slice(8).split(',')[0]);
      if(!Number.isFinite(duration)||duration<=0)throw Error('E_HLS_DURATION');
    }
    if(line==='#EXT-X-ENDLIST')ended=true;
    if(/^#EXT-X-(?:BYTERANGE|DISCONTINUITY|GAP|SKIP|PART|I-FRAMES-ONLY|DEFINE)(?::|$)/.test(line))
      unsupported.push(line.split(':')[0]);
    if(line.startsWith('#EXT-X-MAP:')){
      const attrs=hlsAttributes(line.slice(11));container='fmp4';
      if(!attrs.URI||attrs.BYTERANGE||init&&init!==attrs.URI)unsupported.push('#EXT-X-MAP');
      init=attrs.URI||null;
    }
    if(line.startsWith('#'))continue;
    if(pending){
      if(variants.length>=16)throw Error('E_HLS_VARIANTS');
      variants.push({uri:line,resolution:pending.RESOLUTION||null,
        bandwidth:Number(pending.BANDWIDTH)||null,audioGroup:pending.AUDIO||null,
        codecs:pending.CODECS||null});
      pending=null;continue;
    }
    if(kind==='media'){
      if(ended||duration===null)throw Error('E_HLS_INVALID');
      if(segments.length>=HLS_MAX_SEGMENTS)throw Error('E_HLS_SEGMENTS');
      segments.push({uri:line,duration,index:segments.length});duration=null;
    }
  }
  if(variants.length)kind='master';
  // The master does not prove whether each referenced media playlist is encrypted.
  if(kind==='master'&&encryption==='clear')encryption='unknown';
  const vod=lines.includes('#EXT-X-ENDLIST');
  if(pending||duration!==null)throw Error('E_HLS_INVALID');
  return {kind,encryption,container,segments:segments.length,segmentList:segments,init,
    duration:segments.reduce((sum,row)=>sum+row.duration,0),variants,audio,vod,
    unsupported:[...new Set(unsupported)],truncated:false};
}
