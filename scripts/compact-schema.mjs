import {Buffer} from 'node:buffer';

// Schema is reviewed JSON data, not executable user code.  The SW bundle has
// a hard production SW byte gate. Factor repeated objects as before and,
// when smaller, pack the fixed UTF-8 JSON with a deterministic LZW
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

function packModule(value) {
  const {encoded, count} = packUtf8(Buffer.from(JSON.stringify(value), 'utf8'));
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

export function compactSchemaSource(source) {
  const marker = 'export default ';
  const start = source.indexOf(marker);
  if (start < 0) throw new Error('Expected generated schema default export');
  const schema = JSON.parse(source.slice(start + marker.length).trim().replace(/;$/, ''));
  const shared = factorObjects(schema), packed = packModule(schema);
  return packed.length < shared.length ? packed : shared;
}
