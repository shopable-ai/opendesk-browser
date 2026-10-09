// OpenDesk Sidebar「开发」草稿：验证 Controller Worker 自身注入的 axiosx。
// 默认请求免登录的公开 HTTPS 测试接口，无需启动本地 API；params.url 可覆盖。
// 不依赖网页全局 SDK，也不操作网页原生 HTTP 请求。
async function main() {
  const url = String(params.url ?? 'https://httpbingo.org/get?source=opendesk');
  const response = await axiosx.get(url, {timeout:5000, responseType:'json'});
  return {
    channel:'controller-worker-axiosx',
    status:response.status,
    data:response.data
  };
}
