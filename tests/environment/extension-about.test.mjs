import assert from 'node:assert/strict';
import test from 'node:test';
import {describeExtensionAbout} from '../../src/ui/extension-about.js';
import {extensionAboutText} from '../../src/ui/extension-about-localization.js';
import {composeExtensionEntries} from '../../src/ui/extension-center-model.js';
import {extensionCenterText} from '../../src/ui/extension-center-localization.js';
import {createExtensionCenterDOM} from '../helpers/extension-center-react-dom.mjs';

const app={id:'about-fixture',version:'1.2.3',title:'Local application'};
const release={toolId:app.id,version:'1.3.0',packageTitle:'Catalog application',
  author:'Catalog team',homepage:'https://catalog.example/'};
const legacy={programId:'test.legacy',manifestHash:'legacy',revision:27,title:'Old Page'};
const pageRelease={programId:legacy.programId,revision:28,version:'2.0.0',title:'Page candidate',
  homepage:'https://page.example/',status:'available'};

test('a catalog refresh cannot add fields or change the version of a local installation',()=>{
  const entries=composeExtensionEntries({installed:[app],pages:[legacy],official:[release],pageReleases:[pageRelease]});
  const [installedApp,installedPage]=['app','page'].map(kind=>entries.find(row=>row.kind===kind));
  assert.equal(installedApp.update,true);
  assert.deepEqual(describeExtensionAbout(installedApp),{
    version:'1.2.3',author:undefined,links:[],versionLabel:'installedVersion'
  });
  assert.deepEqual(describeExtensionAbout(installedPage),{
    version:null,author:undefined,links:[],versionLabel:'installedVersion'
  });
  const candidates=composeExtensionEntries({official:[release],pageReleases:[pageRelease]});
  const [candidateApp,candidatePage]=['app','page'].map(kind=>describeExtensionAbout(candidates.find(row=>row.kind===kind)));
  assert.equal(candidateApp.version,'1.3.0');
  assert.equal(candidateApp.versionLabel,'installableVersion');
  assert.equal(candidateApp.author,'Catalog team');
  assert.equal(candidatePage.version,'2.0.0');
  assert.equal(describeExtensionAbout({kind:'page',installed:false,release:{...pageRelease,status:'blocked'}}).versionLabel,'releaseVersion');
});

test('detail renders author as text and only offers a distinct valid HTTPS target',t=>{
  const {doc,adapter}=createExtensionCenterDOM(t);
  const render=(record,locale='en')=>adapter.renderDetail({key:'app:'+app.id,kind:'app',title:app.title,
    installed:true,locale,actions:[],about:describeExtensionAbout({kind:'app',installed:true,record})});
  render({...app,author:'<img src=x> 作者',homepage:'https://EXAMPLE.com:443/help',supportUrl:'https://example.com/help'});
  const about=()=>doc.querySelector('.ec-extension-about');
  assert.equal(about().localName,'details');
  assert.equal(about().hasAttribute('open'),true);
  assert.equal(about().parentElement.lastElementChild,about());
  assert.match(about().textContent,/Installed version1.2.3/);
  assert.match(about().textContent,/<img src=x> 作者/);
  assert.equal(about().querySelector('img'),null);
  const [link,...duplicates]=about().querySelectorAll('a');
  assert.equal(duplicates.length,0);
  assert.equal(link.textContent,'example.com');
  assert.equal(link.getAttribute('href'),'https://example.com/help');
  assert.equal(link.getAttribute('rel'),'noopener noreferrer');
  assert.equal(link.getAttribute('target'),'_blank');
  assert.equal(link.getAttribute('referrerPolicy'),'no-referrer');
  assert.equal(link.dispatch('click',{isTrusted:false}).defaultPrevented,true);
  about().removeAttribute('open'); // Reflect a native collapse before a model refresh.
  for(const homepage of ['https://a:b@example.com','https://@example.com','https://ex	ample.com',
    'https://example.com\\path','http://example.com','javascript:void(0)','/support','//example.com','']){
    render({...app,author:' ',homepage});
    assert.equal(about().hasAttribute('open'),false,'refreshing the same entry preserves manual collapse');
    assert.equal(about().querySelector('a'),null,homepage);
    assert.equal(about().querySelectorAll('dt').length,1,homepage);
  }
  for(const locale of ['zh-CN','zh-TW','en','ja'])for(const version of [null,'0.4.29']){
    adapter.renderDetail({key:'page:'+legacy.programId,kind:'page',title:legacy.title,installed:true,locale,
      actions:[],about:describeExtensionAbout({kind:'page',installed:true,record:{installed:{...legacy,version}}}),
      pageInfo:{revision:legacy.revision}});
    const values=[...about().querySelectorAll('dd')].map(node=>node.textContent);
    assert.equal(about().hasAttribute('open'),true,'a different entry starts expanded');
    assert.deepEqual(values,[version||extensionAboutText(locale,'unknownVersion')]);
    const diagnostic=doc.querySelector('details.ec-page-diagnostics');
    assert.equal(diagnostic.hasAttribute('open'),false);
    assert.ok(diagnostic.textContent.includes(extensionCenterText(locale,'revision')+legacy.revision));
  }
});

test('installed apps with a Settings action leave About to the tool settings page',t=>{
  const {doc,adapter}=createExtensionCenterDOM(t);
  adapter.renderDetail({key:'app:'+app.id,kind:'app',title:app.title,installed:true,
    actions:[{id:'settings',label:'Settings'}],about:describeExtensionAbout({kind:'app',installed:true,record:app})});
  assert.ok(doc.querySelector('[data-ec-detail-action="settings"]'));
  assert.equal(doc.querySelector('.ec-extension-about'),null);
});
