import {Buffer} from 'node:buffer';
export const WIRE_VERSION = 1;
export const MAX_BYTES = 60 * 1024;
export const MAX_INFLIGHT = 12;
export const HOST_NAME = 'com.shopable.opendesk_browser.agent';
export class WireError extends Error {
  constructor(code,message = code) {super(message);this.code=code;}
}
export const object = x => x !== null && typeof x === 'object' && !Array.isArray(x);
export function encode(value) {
  const buffer = Buffer.from(JSON.stringify(value),'utf8');
  if (buffer.length > MAX_BYTES) throw new WireError('E_LIMIT','Native IPC message exceeds 60 KiB');
  return buffer;
}
export function frame(value) {
  const body=encode(value),header=Buffer.alloc(4);
  header.writeUInt32LE(body.length);return Buffer.concat([header,body]);
}
export class NativeDecoder {
  constructor() {this.buffer=Buffer.alloc(0);}
  push(chunk) {
    this.buffer=Buffer.concat([this.buffer,chunk]);
    const output=[];
    while (this.buffer.length >= 4) {
      const bytes=this.buffer.readUInt32LE(0);
      if (bytes > MAX_BYTES) throw new WireError('E_LIMIT');
      if (this.buffer.length < 4+bytes) break;
      try {output.push(JSON.parse(this.buffer.subarray(4,4+bytes).toString('utf8')));}
      catch {throw new WireError('E_SCHEMA','Malformed framed JSON');}
      this.buffer=this.buffer.subarray(4+bytes);
    }
    return output;
  }
}
export class LineDecoder {
  constructor(){this.buffer=Buffer.alloc(0);}
  push(chunk) {
    this.buffer=Buffer.concat([this.buffer,chunk]);
    const output=[];let newline;
    while ((newline=this.buffer.indexOf(10))!==-1) {
      if (newline > MAX_BYTES) throw new WireError('E_LIMIT');
      try {output.push(JSON.parse(this.buffer.subarray(0,newline).toString('utf8')));}
      catch {throw new WireError('E_SCHEMA','Malformed line JSON');}
      this.buffer=this.buffer.subarray(newline+1);
    }
    if (this.buffer.length > MAX_BYTES) throw new WireError('E_LIMIT');
    return output;
  }
}
export function writeLine(socket,value) {
  const buffer=Buffer.concat([encode(value),Buffer.from('\n')]);
  if (socket.destroyed || socket.writableLength+buffer.length > MAX_BYTES*2)
    throw new WireError('E_BACKPRESSURE');
  socket.write(buffer);
}
export function requestShape(request) {
  if (!object(request) || request.v !== 1 || request.kind !== 'request' ||
      typeof request.requestId !== 'string' || !/^[a-zA-Z0-9._:-]{1,100}$/.test(request.requestId) ||
      !['bridge.status','target.current','script.save','run.start','run.get','run.stop','page.preview','page.get'].includes(request.method) ||
      !object(request.params)) throw new WireError('E_SCHEMA','Unsupported Native Agent API');
  encode(request);return request;
}
