import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import {once} from 'node:events';
import {openProxyTunnel} from './proxy-line-probe.mjs';

// Local deterministic handshake unit tests. They are NOT remote HTTPS or Chrome proof.
async function serverFor(handler){
  const server=net.createServer(handler);
  server.listen(0,'127.0.0.1');
  await once(server,'listening');
  return {server,port:server.address().port};
}
const closeServer=server=>new Promise(resolve=>server.close(resolve));
test('7897 probe encodes real SOCKS5 greeting and CONNECT domain/port',async()=>{
  let stage=0;
  const {server,port}=await serverFor(socket=>socket.on('data',buffer=>{
    if(stage++===0){
      assert.deepEqual([...buffer],[5,1,0]);
      socket.write(Buffer.from([5,0]));
    }else{
      assert.equal(buffer[0],5);assert.equal(buffer[1],1);assert.equal(buffer[3],3);
      const name=buffer.subarray(5,5+buffer[4]).toString('ascii');
      assert.equal(name,'example.com');
      assert.equal(buffer.readUInt16BE(5+buffer[4]),443);
      socket.write(Buffer.from([5,0,0,1,127,0,0,1,0,0]));
    }
  }));
  try{
    const tunnel=await openProxyTunnel({kind:'socks5',proxyPort:port});
    tunnel.destroy();assert.equal(stage,2);
  }finally{await closeServer(server);}
});
test('7897 probe emits correct HTTP CONNECT and confirms status 200',async()=>{
  const seen=[];
  const {server,port}=await serverFor(socket=>socket.on('data',buffer=>{
    seen.push(buffer.toString('utf8'));
    socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
  }));
  try{
    const tunnel=await openProxyTunnel({kind:'http',proxyPort:port});
    tunnel.destroy();assert.match(seen.join(''),/^CONNECT example\.com:443 HTTP\/1\.1/);
  }finally{await closeServer(server);}
});
test('local proxy probe refuses arbitrary target fields, non-loopback and unknown protocols',async()=>{
  await assert.rejects(openProxyTunnel({proxyHost:'proxy.example.com'}),{code:'E_PROXY_INPUT'});
  await assert.rejects(openProxyTunnel({kind:'https'}),{code:'E_PROXY_INPUT'});
  await assert.rejects(openProxyTunnel({target:'bad\r\nHost:evil'}),{code:'E_PROXY_INPUT'});
});
