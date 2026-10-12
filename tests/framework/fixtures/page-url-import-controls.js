// Static website fixture, loaded only by the explicit CFT test query.
// It belongs to demo-form, not to the extension or a user's dependency graph.
// All changes below follow trusted clicks on visible native website buttons.
(() => {
  if (new URL(location.href).searchParams.get('opendesk-url-import') !== '1') return;
  const parent = document.getElementById('lab-text');
  if (!parent || document.getElementById('url-import-fixture-controls')) return;
  const controls = document.createElement('fieldset');
  controls.id = 'url-import-fixture-controls';
  const legend = document.createElement('legend');
  legend.textContent = 'React URL import 图表验收数据';
  const add = document.createElement('button');
  add.id = 'url-import-add-heading';
  add.type = 'button';
  add.textContent = '增加一个 H3 章节';
  const remove = document.createElement('button');
  remove.id = 'url-import-remove-heading';
  remove.type = 'button';
  remove.textContent = '移除最后一个 H3 章节';
  remove.disabled = true;
  const status = document.createElement('output');
  status.id = 'url-import-heading-status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  const headings = document.createElement('div');
  headings.id = 'url-import-dynamic-headings';
  let serial = 0;
  const update = () => {
    remove.disabled = headings.childElementCount === 0;
    status.textContent = `新增章节：${headings.childElementCount}`;
  };
  add.addEventListener('click', event => {
    if (!event.isTrusted) return;
    const heading = document.createElement('h3');
    heading.textContent = `动态章节 ${++serial}`;
    headings.append(heading);
    update();
  });
  remove.addEventListener('click', event => {
    if (!event.isTrusted) return;
    headings.lastElementChild?.remove();
    update();
  });
  controls.append(legend, add, remove, status);
  parent.append(controls, headings);
  update();
})();
