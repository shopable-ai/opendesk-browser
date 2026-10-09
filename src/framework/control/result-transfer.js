import {PageError, requireValue, encodeValue, decodeValue, VALUE_LIMITS} from './value.js';

// Separate bounded terminal-result transport. Ordinary Page/Locator RPCs still
// use the unchanged 64 KiB Control Value budget. Final values get a slightly
// larger budget only across the owned Worker -> opaque Sandbox -> Host port.
export const RESULT_TRANSFER_LIMITS = Object.freeze({maxBytes: 192 * 1024, chunkBytes: 16 * 1024});

export function encodeResultFrames(value) {
  let wire;
  try {wire = encodeValue(value, {maxBytes: RESULT_TRANSFER_LIMITS.maxBytes});}
  catch(error) {
    if (error?.code === 'E_VALUE_SERIALIZATION' && error.message === 'Wire byte budget exceeded')
      throw new PageError('E_RESULT_TOO_LARGE',
        'Script result exceeds the 192 KiB serialized-value budget; return required fields instead of an entire large document');
    throw error;
  }
  const bytes = new TextEncoder().encode(JSON.stringify(wire));
  requireValue(bytes.length <= RESULT_TRANSFER_LIMITS.maxBytes, 'E_RESULT_TOO_LARGE');
  if (bytes.length <= VALUE_LIMITS.bytes) return [{kind:'result',value:wire}];
  const frames = [{kind:'result-begin',byteLength:bytes.length}];
  for(let offset=0;offset<bytes.length;offset+=RESULT_TRANSFER_LIMITS.chunkBytes)
    frames.push({kind:'result-part',offset,bytes:bytes.slice(offset,offset+RESULT_TRANSFER_LIMITS.chunkBytes)});
  frames.push({kind:'result-end'});
  return frames;
}

export function createResultAssembler() {
  let current = null;
  function reset() {
    if(current?.bytes) current.bytes.fill(0);
    current = null;
  }
  function accept(frame) {
    if(frame?.kind === 'result') {
      requireValue(!current,'E_RESULT_FORMAT','Unexpected inline result during streamed result');
      decodeValue(frame.value);
      return {wire:frame.value};
    }
    if(frame?.kind === 'result-begin') {
      requireValue(!current && Number.isSafeInteger(frame.byteLength) &&
        frame.byteLength > VALUE_LIMITS.bytes && frame.byteLength <= RESULT_TRANSFER_LIMITS.maxBytes,
        'E_RESULT_FORMAT','Invalid streamed result length');
      current = {bytes:new Uint8Array(frame.byteLength),nextOffset:0};
      return null;
    }
    if(frame?.kind === 'result-part') {
      requireValue(current && frame.bytes instanceof Uint8Array && frame.bytes.byteLength > 0 &&
        frame.bytes.byteLength <= RESULT_TRANSFER_LIMITS.chunkBytes &&
        frame.offset === current.nextOffset &&
        current.nextOffset + frame.bytes.byteLength <= current.bytes.byteLength,
      'E_RESULT_FORMAT','Invalid streamed result chunk');
      current.bytes.set(frame.bytes,current.nextOffset);
      current.nextOffset += frame.bytes.byteLength;
      return null;
    }
    if(frame?.kind === 'result-end') {
      requireValue(current && current.nextOffset === current.bytes.byteLength,
        'E_RESULT_FORMAT','Incomplete streamed result');
      try {
        const parsed = JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(current.bytes));
        decodeValue(parsed,{maxBytes:RESULT_TRANSFER_LIMITS.maxBytes});
        return {wire:parsed};
      } catch(error) {
        throw new PageError('E_RESULT_FORMAT','Streamed result failed validation',error);
      } finally {reset();}
    }
    throw new PageError('E_RESULT_FORMAT','Unknown result transfer frame');
  }
  return Object.freeze({accept,reset});
}
