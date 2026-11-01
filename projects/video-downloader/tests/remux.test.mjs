import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {remuxTsToMp4} from '../trusted/remux.js';
const sample=()=>readFile(new URL('./fixtures/h264-he-aac.ts',import.meta.url));
function boxes(b,start=0,end=b.length){
 const out=[];for(let p=start;p<end;){const n=b.readUInt32BE(p);assert.ok(n>=8&&p+n<=end);out.push({type:b.toString('ascii',p+4,p+8),p,n});p+=n;}return out;
}
const child=(b,row,type)=>boxes(b,row.p+8,row.p+row.n).find(x=>x.type===type);
test('H.264/HE-AAC becomes genuine MP4 with both tracks, explicit SBR config and finite duration',async()=>{
 const bytes=await remuxTsToMp4([await sample()],{codecs:'avc1.42c00d,mp4a.40.5'});
 const b=Buffer.from(bytes),top=boxes(b);assert.deepEqual(top.map(x=>x.type),['ftyp','moov','moof','mdat']);
 const moov=top[1],mvhd=child(b,moov,'mvhd');const scale=b.readUInt32BE(mvhd.p+20),mehd=child(b,child(b,moov,'mvex'),'mehd'),duration=b.readUInt32BE(mehd.p+12)/scale;
 assert.equal(b.readUInt32BE(mvhd.p+24),0,'empty init sample tables must not add a second movie duration');
 assert.ok(duration>=1&&duration<1.2,String(duration));
 const tracks=boxes(b,moov.p+8,moov.p+moov.n).filter(x=>x.type==='trak');assert.equal(tracks.length,2);
 const esds=b.indexOf('esds');assert.ok(esds>0);assert.equal(b[esds+8],3);assert.equal(b[esds+9],27);
 assert.deepEqual([...b.subarray(esds+30,esds+34)],[0x2b,0x92,0x08,0x00]);
 for(const track of tracks){const mdia=child(b,track,'mdia'),handler=child(b,mdia,'hdlr');if(b.toString('ascii',handler.p+16,handler.p+20)==='soun')assert.equal(b.readUInt32BE(child(b,mdia,'mdhd').p+20),44100,'HE-AAC MP4 uses output sample-rate ticks for system-player compatibility');const mdhd=child(b,child(b,track,'mdia'),'mdhd');assert.equal(b.readUInt32BE(mdhd.p+24),0,'media duration is described by fragment samples');}
});
test('unsupported codecs and unsupported PMT streams reject instead of discarding audio or renaming TS',async()=>{
 await assert.rejects(remuxTsToMp4([await sample()],{codecs:'hvc1.1.6.L93,mp4a.40.5'}),{code:'E_MEDIA_CODEC_UNSUPPORTED'});
 const b=await sample();let modified=false;
 for(let p=0;p<b.length;p+=188){let q=p+4;if(b[p+3]&0x20)q+=b[q]+1;if(!(b[p+1]&0x40)||q>=p+188)continue;q+=1+b[q];if(b[q]!==2)continue;const end=q+3+((b[q+1]&15)*256+b[q+2])-4;let r=q+12+((b[q+10]&15)*256+b[q+11]);for(;r<end;r+=5+((b[r+3]&15)*256+b[r+4]))if(b[r]===15){b[r]=0x81;modified=true;}}
 assert.ok(modified);await assert.rejects(remuxTsToMp4([b],{codecs:'avc1.42c00d,mp4a.40.5'}),{code:'E_MEDIA_CODEC_UNSUPPORTED'});
});
test('Stop during MP4 packaging yields control and returns no file; source authority is rechecked',async()=>{
 const signal=new AbortController(),phases=[];
 await assert.rejects(remuxTsToMp4([await sample()],{codecs:'avc1.42c00d,mp4a.40.5',signal:signal.signal,
 onProgress:p=>{phases.push(p);setTimeout(()=>signal.abort(),0);}}),{code:'E_MEDIA_STOPPED'});assert.ok(phases.length);
 let checks=0;await assert.rejects(remuxTsToMp4([await sample()],{codecs:'avc1.42c00d,mp4a.40.5',assertAuthorized:async()=>{if(++checks===2)throw Object.assign(Error(),{code:'E_MEDIA_PERMISSION'});}}),{code:'E_MEDIA_PERMISSION'});
});
