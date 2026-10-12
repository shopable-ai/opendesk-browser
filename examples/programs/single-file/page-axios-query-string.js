// @opendesk-lib axios
// @opendesk-lib query-string
// 单文件 USER_SCRIPT。在本仓库 demo-form.html 页面运行。
async function main() {
  const params=queryString.parse('tag=opendesk&from=page');
  const reply=await axios.get(location.origin+'/demo-form.html',{params,responseType:'text'});
  return {status:reply.status,receivedHtml:/<html/i.test(reply.data),params};
}
