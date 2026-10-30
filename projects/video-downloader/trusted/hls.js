// Bounded, pure HLS metadata parser. No segment fetching, decryption or remux.
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
  if(lines[0]!=='#EXTM3U'||lines.length>5000)throw Error('E_HLS_INVALID');
  const variants=[],audio=[],segments=[];
  let pending=null,encryption='clear',kind='media',container='ts';
  for(const line of lines.slice(1)){
    if(line.startsWith('#EXT-X-STREAM-INF:')){kind='master';pending=hlsAttributes(line.slice(18));continue;}
    if(line.startsWith('#EXT-X-MEDIA:')){
      const attrs=hlsAttributes(line.slice(13));
      if(attrs.TYPE==='AUDIO'&&audio.length<16)audio.push({
        group:attrs['GROUP-ID']||'',language:attrs.LANGUAGE||'',name:attrs.NAME||'',
        external:typeof attrs.URI==='string'
      });
      continue;
    }
    if(line.startsWith('#EXT-X-SESSION-KEY:')||line.startsWith('#EXT-X-KEY:')){
      const key=hlsAttributes(line.slice(line.indexOf(':')+1));
      if(key.METHOD&&key.METHOD!=='NONE'){
        encryption=key.METHOD==='AES-128'&&!key.KEYFORMAT?'encrypted':'drm';
      }
      continue;
    }
    if(line.startsWith('#EXT-X-MAP:'))container='fmp4';
    if(line.startsWith('#'))continue;
    if(pending){
      if(variants.length<16)variants.push({uri:line,resolution:pending.RESOLUTION||null,
        bandwidth:Number(pending.BANDWIDTH)||null,audioGroup:pending.AUDIO||null});
      pending=null;continue;
    }
    if(kind==='media'&&segments.length<200)segments.push(line);
  }
  if(variants.length)kind='master';
  // The master does not prove whether each referenced media playlist is encrypted.
  if(kind==='master'&&encryption==='clear')encryption='unknown';
  const vod=lines.includes('#EXT-X-ENDLIST');
  return {kind,encryption,container,segments:segments.length,variants,audio, vod,
    truncated:segments.length===200||variants.length===16};
}
