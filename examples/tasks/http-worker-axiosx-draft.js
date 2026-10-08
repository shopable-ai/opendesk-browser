// OpenDesk Sidebar「开发」草稿：验证 Controller Worker 自身注入的 axiosx。
// 参数：{"url":"http://127.0.0.1:43111/request-sample.json"}。
// 不依赖网页全局 SDK，也不操作网页原生 HTTP 请求。
async function main() {
  const url = String(params.url ?? 'http://127.0.0.1:43111/request-sample.json');
  const response = await axiosx.get(url, {timeout:5000, responseType:'json'});
  return {
    channel:'controller-worker-axiosx',
    status:response.status,
    data:response.data
  };
}
