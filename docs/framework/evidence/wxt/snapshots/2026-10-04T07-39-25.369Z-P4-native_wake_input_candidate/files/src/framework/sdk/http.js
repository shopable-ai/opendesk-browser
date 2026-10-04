export function createHttp(call) {
  return Object.freeze({
    get: (url, config) => call('AXIOS_GET', {url, config}),
    post: (url, data, config) => call('AXIOS_POST', {url, data, config}),
    put: (url, data, config) => call('AXIOS_PUT', {url, data, config}),
    delete: (url, config) => call('AXIOS_DELETE', {url, config})
  });
}
