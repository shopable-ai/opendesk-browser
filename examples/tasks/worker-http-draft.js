// Sidebar > 开发; runtime injects axiosx independently of MAIN OpenDeskSDK.
async function main() {
  const response = await axiosx.get(
    'http://127.0.0.1:43111/request-sample.json',
    {responseType:'json', timeout:5000}
  );
  return {status:response.status, data:response.data};
}
