// Fixed finite RPC surface for backend feasibility. No eval/new Function.
self.postMessage({kind: 'worker-ready'});
self.onmessage = ({data, ports}) => {
  if (data.kind !== 'bind' || ports.length !== 1) return;
  const port = ports[0];
  const token = data.token;
  port.onmessage = async ({data: request}) => {
    if (request.token !== token) return;
    if (request.method === 'ping') port.postMessage({id: request.id, token, value: 'pong'});
    if (request.method === 'network') {
      try {
        await fetch(request.url);
        port.postMessage({id: request.id, token, value: {blocked: false}});
      } catch (error) {
        port.postMessage({id: request.id, token, value: {blocked: true, name: error.name, message: error.message}});
      }
    }
    if (request.method === 'loop') {
      port.postMessage({id: request.id, token, value: 'loop-entered'});
      while (true) {}
    }
  };
  port.start();
  port.postMessage({kind: 'port-ready', token});
};
