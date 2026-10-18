import {createAnswerRegistry} from '../src/answer-registry.js';
import {createAnswerView} from '../src/view.js';
import {createXmindFrameRenderer} from '../src/xmind-frame.js';
import css from '../assets/ui.css';
import {createLocalOwner} from './owner.js';
import {createStandaloneFrameFactory} from './frame-factory.js';

if (window.top === window && window.location.origin === 'https://chatgpt.com') {
  let owner, retiring = Promise.resolve();
  const report = error => console.error('E_MINDMAP_STANDALONE', error);
  function start() {
    if (owner?.active()) return;
    owner = createLocalOwner(window);
    const frameFactory = createStandaloneFrameFactory({window, document, runtime: chrome.runtime});
    const registry = createAnswerRegistry({document, window, owner, css,
      createView: options => createAnswerView({...options,
        rendererFactory: input => createXmindFrameRenderer({...input, frameFactory})})});
    owner.onDispose(() => registry.destroy());
    try { registry.start(); }
    catch (error) { owner.destroy().catch(report); report(error); }
  }
  window.addEventListener('pagehide', () => { retiring = owner?.destroy() || Promise.resolve(); retiring.catch(report); });
  window.addEventListener('pageshow', event => {
    if (event.persisted) retiring.then(start, error => { report(error); start(); });
  });
  start();
}
