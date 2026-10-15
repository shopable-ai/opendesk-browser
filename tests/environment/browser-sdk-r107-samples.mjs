export const REF = 'r'.repeat(32);
export const SESSION = '01234567-89ab-4def-8123-456789abcdef';
export const ORIGIN = 'https://example.org';
export const TARGET_URL = ORIGIN + '/sdk-probe';
export const SAMPLE_ARGS = Object.freeze({
  'browser.i18n.detectLanguage': {text:'Hello world'},
  'browser.capabilities.getStatus': {operation: 'browser.tabs.create'},
  'browser.contextMenu.register': {actionIds: ['sdk-probe']},
  'browser.clipboard.writeText': {text: 'sdk probe'},
  'browser.downloads.text': {text: 'sdk probe', filename: 'sdk-probe.txt'},
  'browser.downloads.download': {url: TARGET_URL, filename: 'sdk-probe.txt'},
  'browser.downloads.getOwned': {downloadRef: REF},
  'browser.downloads.listOwned': {limit: 10},
  'browser.downloads.cancelOwned': {downloadRef: REF},
  'browser.bookmarks.createOwned': {url: TARGET_URL, title: 'SDK probe'},
  'browser.bookmarks.get': {id:'2'},
  'browser.bookmarks.search': {query:'SDK probe'},
  'browser.bookmarks.create': {url:TARGET_URL,title:'SDK probe'},
  'browser.bookmarks.update': {id:'2',changes:{title:'Renamed'},expected:{
    id:'2',parentId:'1',index:0,title:'SDK probe',
    url:TARGET_URL,unmodifiable:null,folderType:null}},
  'browser.bookmarks.move': {id:'2',destination:{parentId:'1'},expected:{
    id:'2',parentId:'1',index:0,title:'SDK probe',
    url:TARGET_URL,unmodifiable:null,folderType:null}},
  'browser.bookmarks.remove': {id:'2',expected:{
    id:'2',parentId:'1',index:0,title:'SDK probe',
    url:TARGET_URL,unmodifiable:null,folderType:null}},
  'browser.bookmarks.prepareRemoveTree': {id:'2',snapshotRef:REF,descendantCount:1,expected:{
    id:'2',parentId:'1',index:0,title:'SDK probe',
    url:null,unmodifiable:null,folderType:null}},
  'browser.bookmarks.removeTree': {id:'2',ticket:REF},
  'browser.bookmarks.observe.start': {maxEvents:20,durationMs:30000},
  'browser.bookmarks.observe.read': {sessionRef:REF,cursor:'0',limit:50},
  'browser.bookmarks.observe.stop': {sessionRef:REF},
  'browser.bookmarks.removeOwned': {bookmarkRef: REF},
  'browser.scheduler.create': {
    taskId: 'sdk-probe', revision: '1',
    schedule: {kind: 'interval', expression: '1m'}
  },
  'browser.scheduler.cancelOwn': {scheduleRef: REF},
  'browser.storage.local.get': {keys: ['sdkProbe']},
  'browser.storage.local.set': {items: {sdkProbe: {value: 1}}},
  'browser.storage.local.remove': {keys: ['sdkProbe']},
  'browser.storage.local.clear': {confirm: true},
  'browser.tabs.create': {url: TARGET_URL},
  'browser.tabs.activateOwned': {tabRef: REF},
  'browser.tabs.getOwned': {tabRef: REF},
  'browser.tabs.pinOwned': {tabRef: REF, pinned: true},
  'browser.tabs.reloadOwned': {tabRef: REF},
  'browser.tabs.navigateOwned': {tabRef: REF, url: TARGET_URL},
  'browser.tabs.removeOwned': {tabRef: REF},
  'browser.network.request': {method: 'GET', url: TARGET_URL},
  'browser.network.observe.start': {tabRef: REF, origins: [ORIGIN]},
  'browser.network.observe.getStatus': {observationId: REF},
  'browser.network.observe.stop': {observationId: REF},
  'browser.network.observe.export': {observationId: REF, format: 'json'},
  'browser.events.read': {sessionRef: REF},
  'browser.events.close': {sessionRef: REF},
  'browser.screenshot.captureVisible': {tabRef: REF},
  'browser.operations.getStatus': {operationId: REF},
  'browser.operations.cancel': {operationId: REF},
  'browser.cookies.get': {url: TARGET_URL, name: 'sid'},
  'browser.cookies.getAll': {url: TARGET_URL},
  'browser.cookies.set': {url: TARGET_URL, name: 'sid', value: 'fixture'},
  'browser.cookies.remove': {
    url: TARGET_URL, name: 'sid', domain: 'example.org', path: '/'
  },
  'browser.cookies.clearSite': {url: TARGET_URL, preview: true},
  'browser.cookies.getCurrentStore': {url: TARGET_URL},
  'browser.cookies.getPartitionKey': {url: TARGET_URL},
  'browser.cookies.observe.start': {url: TARGET_URL},
  'browser.cookies.observe.getStatus': {url: TARGET_URL, sessionRef: SESSION},
  'browser.cookies.observe.read': {url: TARGET_URL, sessionRef: SESSION},
  'browser.cookies.observe.stop': {url: TARGET_URL, sessionRef: SESSION}
});
