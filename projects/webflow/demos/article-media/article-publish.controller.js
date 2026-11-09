// Web Flow article/media Controller demo (local fixture ONLY).
// Paste into OpenDesk Browser > 开发 > Controller 草稿 and Run explicitly.
// This is NOT an installed Web Flow Task and NEVER publishes to an external site.
async function main() {
  const input = params && typeof params === 'object' ? params : {};
  const current = new URL(await page.url());
  if (!['localhost', '127.0.0.1'].includes(current.hostname) ||
      current.protocol !== 'http:' || !current.pathname.endsWith('/article-editor.html')) {
    throw Error('E_DEMO_TARGET: 只能在本项目的 localhost article-editor.html 演示页运行');
  }

  const title = input.title === undefined ? 'OpenDesk 图文发布测试' : input.title;
  const body = input.body === undefined ? '验证文章正文、图片上传与本地草稿保存。' : input.body;
  const action = input.action === undefined ? 'draft' : input.action;
  if (typeof title !== 'string' || !title.trim() || title.length > 120 ||
      typeof body !== 'string' || !body.trim() || body.length > 5000 ||
      !['draft', 'publish-demo'].includes(action)) {
    throw Error('E_DEMO_INPUT: 标题/正文/action 不合法');
  }
  if (action === 'publish-demo' && input.confirmDemoPublish !== true) {
    throw Error('E_CONFIRM_REQUIRED: 演示发布必须明确传入 confirmDemoPublish:true');
  }

  const pixel = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGBgAAAABQABpfZFQAAAAABJRU5ErkJggg==';
  const images = input.images === undefined ?
    [{name:'demo-cover.png', type:'image/png', dataUrl:pixel}] : input.images;
  if (!Array.isArray(images) || images.length < 1 || images.length > 3) {
    throw Error('E_DEMO_MEDIA: 本演示仅支持 1-3 张小图；真实多媒体须使用独立受审文件引用');
  }
  function validateAsset(asset, kind) {
    if (!asset || typeof asset !== 'object' || Array.isArray(asset) ||
        typeof asset.name !== 'string' || typeof asset.type !== 'string' ||
        typeof asset.dataUrl !== 'string' || asset.dataUrl.length > 45000 ||
        !asset.dataUrl.startsWith('data:' + asset.type + ';base64,') ||
        (kind === 'image' && !['image/png','image/jpeg','image/webp','image/gif'].includes(asset.type)) ||
        (kind === 'video' && !['video/mp4','video/webm'].includes(asset.type))) {
      throw Error('E_DEMO_MEDIA: 媒体必须为受支持的小型 Base64 Data URL，并提供真实文件名和 MIME');
    }
  }
  for (const asset of images) validateAsset(asset, 'image');
  if (input.video !== undefined && input.video !== null) validateAsset(input.video, 'video');

  await page.locator('#article-title').fill(title);
  await page.locator('#article-body').fill(body);

  // One reviewed file input per operation; each upload must be acknowledged by the page.
  for (let index = 0; index < images.length; index++) {
    const asset = images[index], selector = '#image-' + index;
    await page.locator(selector).waitFor({state:'attached'});
    await page.uploadFile(selector, asset.dataUrl, {name:asset.name, type:asset.type});
    await page.locator('#image-ready-' + index).waitFor({state:'visible'});
    const savedName = await page.locator('#image-ready-' + index).textContent();
    if (!savedName || !savedName.includes(asset.name)) throw Error('E_MEDIA_NOT_CONFIRMED: 图片未被页面确认');
  }

  if (input.video) {
    await page.uploadFile('#video-input', input.video.dataUrl,
      {name:input.video.name, type:input.video.type});
    await page.locator('#video-ready').waitFor({state:'visible'});
    const name = await page.locator('#video-ready').textContent();
    if (!name || !name.includes(input.video.name)) throw Error('E_MEDIA_NOT_CONFIRMED: 视频未被页面确认');
  }

  await page.locator('#save-draft').click();
  await page.locator('#save-state[data-state="saved"]').waitFor({state:'visible',timeout:12000});
  let state = 'draft-saved-local';
  if (action === 'publish-demo') {
    await page.locator('#demo-publish').click();
    await page.locator('#save-state[data-state="demo-published"]').waitFor({state:'visible',timeout:12000});
    state = 'published-demo-local';
  }
  return {
    scope:'LOCAL_FIXTURE_ONLY',
    status:state,
    title:await page.locator('#article-title').inputValue(),
    imageCount:images.length,
    videoSelected:Boolean(input.video),
    persistedBy:'fixture-indexeddb',
    externalPublished:false,
    confirmation:await page.locator('#save-state').textContent()
  };
}
