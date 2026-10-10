import {Buffer} from 'node:buffer';
import {deflateRawSync,constants} from 'node:zlib';

// Schema is reviewed JSON data, not executable user code.  The SW bundle has
// a hard 320 KiB production gate.  Factor repeated objects as before and,
// when smaller, pack the fixed UTF-8 JSON with a deterministic 16-bit LZW
// dictionary.  The decoded object retains every key, value and ordering.
// No runtime eval, dynamic import, network resource or new trust boundary.
function factorObjects(schema) {
  const counts = new Map(), names = new Map(), declarations = [];
  function count(value) {
    if (!value || typeof value !== 'object') return;
    const key = JSON.stringify(value); counts.set(key, (counts.get(key) || 0) + 1);
    Object.values(value).forEach(count);
  }
  count(schema);
  function render(value) {
    if (!value || typeof value !== 'object') return JSON.stringify(value);
    const key = JSON.stringify(value), shared = key.length >= 40 && counts.get(key) > 1;
    if (shared && names.has(key)) return names.get(key);
    const body = Array.isArray(value) ? `[${value.map(render).join(',')}]` :
      `{${Object.entries(value).map(([name, item]) => `${JSON.stringify(name)}:${render(item)}`).join(',')}}`;
    if (!shared) return body;
    const name = `schemaPart${names.size}`; names.set(key, name);
    declarations.push(`const ${name}=${body};`); return name;
  }
  const body = render(schema);
  return `${declarations.join('\n')}\nexport default ${body};\n`;
}

function packUtf8(input) {
  const dictionary = new Map();
  for (let i = 0; i < 256; i++) dictionary.set(String.fromCharCode(i), i);
  let next = 256, word = '';
  const codes = [];
  for (const byte of input) {
    const char = String.fromCharCode(byte), joined = word + char;
    if (dictionary.has(joined)) { word = joined; continue; }
    codes.push(dictionary.get(word));
    if (next < 65535) dictionary.set(joined, next++);
    word = char;
  }
  if (word) codes.push(dictionary.get(word));
  // Fixed-width bit packing (9-16 bits) omits unused high bits of the LZW
  // code space.  The byte budget must not depend on wasteful 16-bit padding.
  const width = Math.max(9, Math.ceil(Math.log2(next)));
  const result = Buffer.alloc(Math.ceil(codes.length * width / 8));
  let bitOffset = 0;
  for (const code of codes) for (let bit = width - 1; bit >= 0; bit--) {
    if (code & (1 << bit)) result[bitOffset >> 3] |= 1 << (7 - (bitOffset & 7));
    bitOffset++;
  }
  return {encoded: result.toString('base64'), width, count: codes.length};
}

function packModule(value) {
  const {encoded, width, count} = packUtf8(Buffer.from(JSON.stringify(value), 'utf8'));
  return `// Constant reviewed schema; only synchronous data decompression.
const packed=${JSON.stringify(encoded)},width=${width},count=${count};
function unpackSchema(source) {
  const bytes=atob(source), dictionary=Array.from({length:256},(_,i)=>String.fromCharCode(i));
  let bitOffset=0, next=256;
  const read=()=>{
    if(bitOffset+width>bytes.length*8) throw new Error('Invalid packaged schema');
    let code=0;
    for(let bit=0;bit<width;bit++) {
      code=(code<<1)|((bytes.charCodeAt(bitOffset>>3)>>(7-(bitOffset&7)))&1);
      bitOffset++;
    }
    return code;
  };
  let previous=dictionary[read()];
  if(previous===undefined) throw new Error('Invalid packaged schema');
  const pieces=[previous];
  for(let index=1;index<count;index++) {
    const code=read();
    const entry=dictionary[code]??(code===next?previous+previous[0]:undefined);
    if(entry===undefined) throw new Error('Invalid packaged schema');
    pieces.push(entry);
    if(next<65535) dictionary[next++]=previous+entry[0];
    previous=entry;
  }
  const raw=Uint8Array.from(pieces.join(''),c=>c.charCodeAt(0));
  return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));
}
export default unpackSchema(packed);
`;
}

function packUtf8Adaptive(input) {
  const dictionary = new Map();
  for (let i = 0; i < 256; i++) dictionary.set(String.fromCharCode(i), i);
  let next = 256, word = '';
  const codes = [];
  for (const byte of input) {
    const char = String.fromCharCode(byte), joined = word + char;
    if (dictionary.has(joined)) { word = joined; continue; }
    codes.push(dictionary.get(word));
    if (next < 65535) dictionary.set(joined, next++);
    word = char;
  }
  if (word) codes.push(dictionary.get(word));
  // LZW inserts exactly one dictionary entry per emitted code, except the last.
  // Match that schedule in the reader. Early codes need 9-13 bits rather than
  // padding all codes to the final width; the dictionary caps at 16 bits.
  const codeWidth = index => Math.min(16, Math.max(9, Math.ceil(Math.log2(257 + index))));
  const totalBits = codes.reduce((bits,_,index) => bits + codeWidth(index), 0);
  const result = Buffer.alloc(Math.ceil(totalBits / 8));
  let bitOffset = 0;
  for (const [index,code] of codes.entries()) {
    const width = codeWidth(index);
    if (code >= 2 ** width) throw new Error('Invalid LZW code width');
    for (let bit = width - 1; bit >= 0; bit--) {
      if (code & (1 << bit)) result[bitOffset >> 3] |= 1 << (7 - (bitOffset & 7));
      bitOffset++;
    }
  }
  return {encoded: result.toString('base64'), count: codes.length};
}

function packModuleAdaptive(value) {
  const {encoded, count} = packUtf8Adaptive(Buffer.from(JSON.stringify(value), 'utf8'));
  return `// Constant reviewed schema; only synchronous data decompression.
const packed=${JSON.stringify(encoded)},count=${count};
function unpackSchema(source) {
  const bytes=atob(source), dictionary=Array.from({length:256},(_,i)=>String.fromCharCode(i));
  let bitOffset=0, next=256;
  const read=index=>{
    const width=Math.min(16,Math.max(9,Math.ceil(Math.log2(257+index))));
    if(bitOffset+width>bytes.length*8) throw new Error('Invalid packaged schema');
    let code=0;
    for(let bit=0;bit<width;bit++) {
      code=(code<<1)|((bytes.charCodeAt(bitOffset>>3)>>(7-(bitOffset&7)))&1);
      bitOffset++;
    }
    return code;
  };
  let previous=dictionary[read(0)];
  if(previous===undefined) throw new Error('Invalid packaged schema');
  const pieces=[previous];
  for(let index=1;index<count;index++) {
    const code=read(index);
    const entry=dictionary[code]??(code===next?previous+previous[0]:undefined);
    if(entry===undefined) throw new Error('Invalid packaged schema');
    pieces.push(entry);
    if(next<65535) dictionary[next++]=previous+entry[0];
    previous=entry;
  }
  const raw=Uint8Array.from(pieces.join(''),c=>c.charCodeAt(0));
  return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));
}
export default unpackSchema(packed);
`;
}

function packUtf8Backrefs(input) {
  // Literal run: 0..127, followed by tag+1 bytes. Back-reference: 128..255,
  // followed by a big-endian 16-bit distance; copy (tag&127)+3 bytes.
  // A fixed candidate limit makes encoding deterministic and bounds build work.
  const positions=new Map(),output=[],literals=[];
  const hash=index=>(input[index]<<16)|(input[index+1]<<8)|input[index+2];
  function remember(index) {
    if(index+2>=input.length)return;
    const key=hash(index);let previous=positions.get(key);
    if(!previous)positions.set(key,previous=[]);
    previous.push(index);if(previous.length>64)previous.shift();
  }
  function flush() {
    if(literals.length){output.push(literals.length-1,...literals);literals.length=0;}
  }
  for(let index=0;index<input.length;){
    let length=0,distance=0;
    const previous=index+2<input.length?positions.get(hash(index)):null;
    if(previous)for(let n=previous.length-1;n>=0;n--){
      const offset=previous[n],back=index-offset;if(back>65535)break;
      let count=0;
      while(count<130&&index+count<input.length&&input[offset+count]===input[index+count])count++;
      if(count>length){length=count;distance=back;}
      if(length===130)break;
    }
    if(length>=4){
      flush();output.push(128|(length-3),distance>>8,distance&255);
      for(let n=0;n<length;n++)remember(index+n);
      index+=length;
    }else{
      literals.push(input[index]);remember(index++);
      if(literals.length===128)flush();
    }
  }
  flush();return Buffer.from(output).toString('base64');
}

function packModuleBackrefs(value) {
  const input=Buffer.from(JSON.stringify(value),'utf8'),encoded=packUtf8Backrefs(input);
  return `// Constant reviewed schema; bounded synchronous data decompression.
const packed=${JSON.stringify(encoded)},size=${input.length};
function unpackSchema(source) {
  const bytes=atob(source),out=new Uint8Array(size);
  let index=0,offset=0;
  const invalid=()=>{throw new Error('Invalid packaged schema');};
  while(index<bytes.length){
    const tag=bytes.charCodeAt(index++),length=tag<128?tag+1:(tag&127)+3;
    if(offset+length>size)invalid();
    if(tag<128){
      if(index+length>bytes.length)invalid();
      for(let n=0;n<length;n++)out[offset++]=bytes.charCodeAt(index++);
    }else{
      if(index+2>bytes.length)invalid();
      const distance=(bytes.charCodeAt(index++)<<8)|bytes.charCodeAt(index++);
      if(!distance||distance>offset)invalid();
      for(let n=0;n<length;n++){out[offset]=out[offset-distance];offset++;}
    }
  }
  if(offset!==size)invalid();
  return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(out));
}
export default unpackSchema(packed);
`;
}

// Runtime candidate: a bounded decoder for static, build-generated RFC 1951
// stored or fixed-Huffman blocks. Dynamic Huffman blocks are rejected.
function unpackFixedSchema(source,rawByteLength) {
  const input=atob(source), output=new Uint8Array(rawByteLength);
  let position=0, written=0;
  const invalid=()=>{throw new Error('Invalid packaged schema');};
  const read=count=>{
    if(position+count>input.length*8) invalid();
    let value=0;
    for(let index=0;index<count;index++,position++)
      value|=((input.charCodeAt(position>>3)>>(position&7))&1)<<index;
    return value;
  };
  const reverse=count=>{
    let value=0;
    for(let index=0;index<count;index++) value=(value<<1)|read(1);
    return value;
  };
  const symbol=()=>{
    let code=reverse(7);
    if(code<24) return code+256;
    code=(code<<1)|read(1);
    if(code>=48&&code<192) return code-48;
    if(code>=192&&code<200) return code+88;
    code=(code<<1)|read(1);
    if(code>=400&&code<512) return code-256;
    return invalid();
  };
  let final=0;
  do {
    final=read(1);
    const type=read(2);
    if(type===0){
      position=(position+7)&~7;
      const length=read(16);
      if((length^read(16))!==65535||written+length>output.length) invalid();
      for(let index=0;index<length;index++) output[written++]=read(8);
    }else if(type===1){
      for(;;){
        const code=symbol();
        if(code===256) break;
        if(code<256){
          if(written>=output.length) invalid();
          output[written++]=code;
        }else{
          if(code>285) invalid();
          const index=code-257, extra=index===28?0:Math.max(0,(index>>2)-1);
          const length=(index<8?index+3:index===28?258:((4+(index&3))<<extra)+3)+read(extra);
          const distanceCode=reverse(5);
          if(distanceCode>29) invalid();
          const distanceExtra=distanceCode<4?0:(distanceCode>>1)-1;
          const distance=(distanceCode<4?distanceCode+1:((2+(distanceCode&1))<<distanceExtra)+1)+read(distanceExtra);
          if(distance>written||written+length>output.length) invalid();
          for(let index=0;index<length;index++,written++) output[written]=output[written-distance];
        }
      }
    }else invalid();
  }while(!final);
  if(written!==output.length||Math.ceil(position/8)!==input.length) invalid();
  return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(output));
}

function packModuleFixed(value) {
  const raw=Buffer.from(JSON.stringify(value),'utf8');
  const packed=deflateRawSync(raw,{level:9,strategy:constants.Z_FIXED}).toString('base64');
  return `// Fixed reviewed schema; bounded synchronous data decompression only.\n${unpackFixedSchema.toString()}\nexport default unpackFixedSchema(${JSON.stringify(packed)},${raw.length});\n`;
}


export function compactSchemaSource(source,{adaptive=false,fixedDeflate=false}={}) {
  const marker = 'export default ';
  const start = source.indexOf(marker);
  if (start < 0) throw new Error('Expected generated schema default export');
  const schema = JSON.parse(source.slice(start + marker.length).trim().replace(/;$/, ''));
  const shared = factorObjects(schema), packed = fixedDeflate ? packModuleFixed(schema) : adaptive ? packModuleAdaptive(schema) : packModule(schema);
  // The explicit SW codec is chosen by measured minified bytes. Backrefs are
  // shorter as source but larger after Terser; keep upstream adaptive behavior
  // for all callers that have not selected fixedDeflate.
  const candidates=[shared,packed,...(adaptive&&!fixedDeflate?[packModuleBackrefs(schema)]:[])];
  return candidates.reduce((smallest,candidate)=>candidate.length<smallest.length?candidate:smallest);
}
