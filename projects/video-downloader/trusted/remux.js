// Pure, fixed browser code: H.264/ADTS AAC -> MP4. No network, Native or encoder.
import {Transmuxer} from './vendor/mux-transmuxer.js';
const error=code=>Object.assign(new Error(code),{code});
const fail=()=>{throw error('E_MEDIA_CODEC_UNSUPPORTED');};
const join=parts=>{const b=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let at=0;for(const p of parts){b.set(p,at);at+=p.length;}return b;};
const u32=(b,p)=>new DataView(b.buffer,b.byteOffset,b.byteLength).getUint32(p);
const put=(b,p,n)=>{if(!Number.isSafeInteger(n)||n<0||n>0xffffffff)fail();new DataView(b.buffer,b.byteOffset,b.byteLength).setUint32(p,n);};
const text=(b,p)=>String.fromCharCode(...b.subarray(p,p+4));
function boxes(b,start=0,end=b.length){
 const out=[];for(let p=start;p<end;){if(p+8>end)fail();const n=u32(b,p);if(n<8||p+n>end)fail();out.push({type:text(b,p+4),p,n});p+=n;}return out;
}
const children=(b,row)=>boxes(b,row.p+8,row.p+row.n);
const child=(b,row,type)=>{const found=children(b,row).filter(x=>x.type===type);if(found.length!==1)fail();return found[0];};
function box(type,body){const b=new Uint8Array(body.length+8);put(b,0,b.length);b.set([...type].map(c=>c.charCodeAt(0)),4);b.set(body,8);return b;}
const pause=()=>new Promise(resolve=>setTimeout(resolve,0));

// Reject codecs the library would otherwise silently omit. This deliberately
// accepts one H.264 video and at most one ADTS audio PID, plus timed ID3.
function transportTracks(bytes,state){
 for(let p=0;p<bytes.length;p+=188){
  if(bytes[p]!==0x47||p+188>bytes.length||bytes[p+1]&0x80||bytes[p+3]&0xc0)fail();
  if(!(bytes[p+3]&0x10)||!(bytes[p+1]&0x40))continue;
  const pid=((bytes[p+1]&31)<<8)|bytes[p+2];let q=p+4;
  if(bytes[p+3]&0x20)q+=bytes[q]+1;
  if(q>=p+188)fail();
  if(pid!==0&&pid!==state.pmt)continue;
  q+=1+bytes[q];if(q+12>p+188)fail();
  const end=q+3+((bytes[q+1]&15)*256+bytes[q+2])-4;
  if(end>p+188||end<q+12)fail(); // multi-packet PSI is outside this slice
  if(pid===0){
   if(bytes[q]!==0)fail();
   const programs=[];for(let i=q+8;i+4<=end;i+=4)if(bytes[i]||bytes[i+1])programs.push(((bytes[i+2]&31)<<8)|bytes[i+3]);
   if(programs.length!==1)fail();state.pmt=programs[0];continue;
  }
  if(bytes[q]!==2||!(bytes[q+5]&1))fail();
  const tracks=[];let i=q+12+((bytes[q+10]&15)*256+bytes[q+11]);
  while(i<end){if(i+5>end)fail();const type=bytes[i],trackPid=((bytes[i+1]&31)<<8)|bytes[i+2];
   if(![0x1b,0x0f,0x15].includes(type))fail();if(type!==0x15)tracks.push({type,pid:trackPid});
   i+=5+((bytes[i+3]&15)*256+bytes[i+4]);}
  if(i!==end||tracks.filter(t=>t.type===0x1b).length!==1||tracks.filter(t=>t.type===0x0f).length>1)fail();
  const signature=JSON.stringify(tracks);
  if(state.signature&&state.signature!==signature)fail();state.signature=signature;state.tracks=tracks;
 }
}
function fragmentEnds(data){
 const ends=new Map();
 for(const moof of boxes(data).filter(b=>b.type==='moof')){
  for(const traf of children(data,moof).filter(b=>b.type==='traf')){
   const tfhd=child(data,traf,'tfhd'),tfdt=child(data,traf,'tfdt'),trun=child(data,traf,'trun');
   const id=u32(data,tfhd.p+12),version=data[tfdt.p+8];
   let time=version===1?u32(data,tfdt.p+12)*4294967296+u32(data,tfdt.p+16):u32(data,tfdt.p+12);
   const flags=u32(data,trun.p+8)&0xffffff,count=u32(data,trun.p+12);
   if(!(flags&0x100)||!count||count>200000)fail();
   let at=trun.p+16+(flags&1?4:0)+(flags&4?4:0);
   for(let i=0;i<count;i++){
    if(at+4>trun.p+trun.n)fail();time+=u32(data,at);at+=4;
    for(const flag of [0x200,0x400,0x800])if(flags&flag)at+=4;
   }
   if(at!==trun.p+trun.n)fail();ends.set(id,Math.max(ends.get(id)||0,time));
  }
 }
 return ends;
}
// mux.js targets MSE and emits one moof/mdat per track. A downloaded movie
// is canonicalized to one fragment with simultaneous tracks and explicit
// moof-relative addressing. Preserve every sample payload.
function combineFragmentTracks(data){
 const top=boxes(data),tracks=[],payloads=[];let header=null;
 if(top.length%2||top.length>4)fail();
 for(let i=0;i<top.length;i+=2){
  const moof=top[i],mdat=top[i+1];if(moof.type!=='moof'||mdat.type!=='mdat')fail();
  header??=data.slice(child(data,moof,'mfhd').p,child(data,moof,'mfhd').p+16);
  const trafs=children(data,moof).filter(b=>b.type==='traf');if(trafs.length!==1)fail();
  const traf=trafs[0],copy=data.slice(traf.p,traf.p+traf.n),tfhd=child(copy,{p:0,n:copy.length},'tfhd');
  const trun=child(copy,{p:0,n:copy.length},'trun');
  if(!(u32(copy,trun.p+8)&1))fail();
  // Each trun offset below is relative to this shared moof, including the
  // second track. Never depend on implicit base offsets from a previous traf.
  put(copy,tfhd.p+8,u32(copy,tfhd.p+8)|0x020000);
  tracks.push({bytes:copy,trun});payloads.push(data.subarray(mdat.p+8,mdat.p+mdat.n));
 }
 const moofSize=8+header.length+tracks.reduce((n,t)=>n+t.bytes.length,0);let offset=moofSize+8;
 for(let i=0;i<tracks.length;i++){put(tracks[i].bytes,tracks[i].trun.p+16,offset);offset+=payloads[i].length;}
 return join([box('moof',join([header,...tracks.map(t=>t.bytes)])),box('mdat',join(payloads))]);
}
// ISO BMFF sample times use the decoded/output AAC rate. Keep the source
// timeline unchanged by scaling every audio tick, including fragment runs.
// Use the same timebase in mdhd, sample entry, tfdt and every trun duration.
function scaleAudioFragments(data,ids){
 for(const moof of boxes(data).filter(b=>b.type==='moof'))for(const traf of children(data,moof).filter(b=>b.type==='traf')){
  const tfhd=child(data,traf,'tfhd');if(!ids.has(u32(data,tfhd.p+12)))continue;
  const tfdt=child(data,traf,'tfdt');
  if(data[tfdt.p+8]===1){const time=(u32(data,tfdt.p+12)*4294967296+u32(data,tfdt.p+16))*2;
   put(data,tfdt.p+12,Math.floor(time/4294967296));put(data,tfdt.p+16,time%4294967296);
  }else put(data,tfdt.p+12,u32(data,tfdt.p+12)*2);
  const flags=u32(data,tfhd.p+8)&0xffffff;let offset=tfhd.p+16+(flags&1?8:0)+(flags&2?4:0);
  if(flags&8)put(data,offset,u32(data,offset)*2);
  const trun=child(data,traf,'trun'),runFlags=u32(data,trun.p+8)&0xffffff,count=u32(data,trun.p+12);
  let at=trun.p+16+(runFlags&1?4:0)+(runFlags&4?4:0);
  for(let i=0;i<count;i++){
   put(data,at,u32(data,at)*2);at+=4;
   for(const flag of [0x200,0x400,0x800])if(runFlags&flag){if(flag===0x800)put(data,at,u32(data,at)*2);at+=4;}
  }
 }
}
function finalizeInit(init,data,audioType,trackCount){
 const top=boxes(init),moov=top.find(b=>b.type==='moov');if(!moov)fail();
 const mvhd=child(init,moov,'mvhd'),movieScale=u32(init,mvhd.p+20),ends=fragmentEnds(data);
 const tracks=children(init,moov).filter(b=>b.type==='trak');
 if(tracks.length!==trackCount||ends.size!==trackCount)fail();
 const durations=new Map(),outputAudioIds=new Set();let seconds=0;
 for(const track of tracks){
  const tkhd=child(init,track,'tkhd'),mdhd=child(init,child(init,track,'mdia'),'mdhd');
  const id=u32(init,tkhd.p+20),scale=u32(init,mdhd.p+20),end=ends.get(id);
  if(!scale||!end)fail();seconds=Math.max(seconds,end/scale);
  const hdlr=child(init,child(init,track,'mdia'),'hdlr'),audio=text(init,hdlr.p+16)==='soun';
  const multiplier=audio&&[5,29].includes(audioType)?2:1;
  if(audio&&scale*multiplier>65535)fail();
  if(multiplier===2)outputAudioIds.add(id);
  durations.set(id,{end:end*multiplier,scale:scale*multiplier});
 }
 if(!seconds||seconds>1801)fail();
 scaleAudioFragments(data,outputAudioIds);
 function rewrite(row,trackId=null){
  let body=init.slice(row.p+8,row.p+row.n);
  if(row.type==='trak')trackId=u32(init,child(init,row,'tkhd').p+20);
  const prefix=row.type==='stsd'?8:row.type==='mp4a'?28:row.type==='avc1'?78:0;
  if(['moov','trak','mdia','minf','stbl','stsd','mp4a','avc1','mvex'].includes(row.type)){
   const nested=boxes(init,row.p+8+prefix,row.p+row.n);
   body=join([body.subarray(0,prefix),...nested.map(r=>rewrite(r,trackId))]);
   if(row.type==='mp4a')put(body,24,durations.get(trackId).scale*65536);
   if(row.type==='mvex'){const duration=new Uint8Array(8);put(duration,4,Math.round(seconds*movieScale));body=join([box('mehd',duration),body]);}
  }// The init sample tables are empty: their durations MUST be zero.
  // The full movie length belongs in mvex/mehd; non-zero init durations
  // are added to fragment time by QuickTime and cause a doubled timeline.
  else if(row.type==='mvhd')put(body,16,0);
  else if(row.type==='mdhd'){put(body,12,durations.get(trackId).scale);put(body,16,0);}
  else if(row.type==='tkhd')put(body,20,0);
  else if(row.type==='esds'){
   // mux.js emits a two-byte AAC-LC AudioSpecificConfig. ADTS contains the
   // core rate; explicit HE-AAC in the source CODECS carries SBR/PS identity.
   if(body.length!==31||body[24]!==5||body[25]!==2)fail();
   const aot=body[26]>>>3,index=((body[26]&7)<<1)|(body[27]>>>7),channels=(body[27]>>>3)&15;
   if(aot!==2||!channels||channels>2||index>12)fail();
   if(audioType===5||audioType===29){
    if(index<3)fail();const extension=index-3;
    const config=new Uint8Array([(audioType<<3)|(index>>>1),((index&1)<<7)|(channels<<3)|(extension>>>1),((extension&1)<<7)|8,0]);
    body=join([body.subarray(0,26),config,body.subarray(28)]);body[5]+=2;body[10]+=2;body[25]=4;
   }else if(!audioType&&index>=6)throw error('E_MEDIA_AUDIO_CONFIG');
  }
  return box(row.type,body);
 }
 return join(top.map(r=>rewrite(r)));
}

export async function remuxTsToMp4(parts,{signal,codecs=null,assertAuthorized=async()=>{},onProgress=()=>{}}={}){
 const guard=()=>{if(signal?.aborted)throw error('E_MEDIA_STOPPED');};
 const declared=typeof codecs==='string'?codecs.split(',').map(c=>c.trim()).filter(Boolean):[];
 if(declared.some(c=>!/^avc[13]\.[\da-f]{6}$/i.test(c)&&!/^mp4a\.40\.(?:2|5|29)$/.test(c)))fail();
 const audioType=Number(declared.find(c=>c.startsWith('mp4a.40.'))?.split('.').at(-1))||null;
 const total=parts.reduce((sum,p)=>sum+p.length,0);if(!total||total>134217728)throw error('E_MEDIA_TOTAL_SIZE');
 const state={},mux=new Transmuxer({keepOriginalTimestamps:false,remux:true}),events=[];
 mux.on('data',value=>events.push(value));
 try{
  guard();onProgress({processedBytes:0,totalBytes:total});await pause();guard();await assertAuthorized();guard();
  let processed=0;
  for(const part of parts){
   // Packet-aligned slices keep each synchronous parse bounded and allow Stop,
   // navigation and installed-identity invalidation to run on the Host thread.
   for(let offset=0;offset<part.length;offset+=188*2048){
    guard();const slice=part.subarray(offset,Math.min(part.length,offset+188*2048));transportTracks(slice,state);mux.push(slice);
    processed+=slice.length;onProgress({processedBytes:processed,totalBytes:total});await pause();guard();
   }
  }
  if(!state.tracks||audioType&&!state.tracks.some(t=>t.type===0x0f))fail();
  await assertAuthorized();guard();mux.flush();await pause();guard();await assertAuthorized();guard();
  if(events.length!==1)fail();const event=events[0];
  const data=combineFragmentTracks(event.data);
  const init=finalizeInit(event.initSegment,data,audioType,state.tracks.length);
  const bytes=join([init,data]);if(bytes.length>134217728)throw error('E_MEDIA_TOTAL_SIZE');
  guard();return bytes;
 }catch(e){if(signal?.aborted)throw error('E_MEDIA_STOPPED');throw e?.code?e:error('E_MEDIA_REMUX');}
 finally{mux.dispose();events.length=0;}
}
