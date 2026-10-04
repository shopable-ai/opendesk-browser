(async () => {
  await new Promise(resolve => setTimeout(resolve, 75));
  document.body.dataset.fileSource = 'executed';
  return {kind: 'file', page: document.body.dataset.page, href: location.href};
})()
