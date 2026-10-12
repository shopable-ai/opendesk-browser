// Real upstream Axios is explicitly preinstalled by package.json#opendesk.libraries.
// Controller page and axios are zero-argument user capabilities, not website globals.
export default async function main() {
  const url=await page.url();
  const origin=new URL(url).origin;
  const client=axios.create({baseURL:origin,timeout:8000});
  const response=await client.get('/demo-form.html',{responseType:'text'});
  return {
    url,
    title:await page.title(),
    status:response.status,
    isDemoPage:/<html/i.test(response.data),
    methods:_.words('Axios Controller')
  };
}
