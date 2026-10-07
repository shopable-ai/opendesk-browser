export function createStorageFacades(call) {
  const AppStorage = Object.freeze({
    setItem: (key, value) => call('APPSTORAGE_SETITEM', {key, value}),
    getItem: key => call('APPSTORAGE_GETITEM', {key}),
    removeItem: key => call('APPSTORAGE_REMOVEITEM', {key}),
    clear: () => call('APPSTORAGE_CLEAR', {})
  });
  const AppLocal = Object.freeze({
    setItem: (key, value) => call('APPLOCAL_SETITEM', {key, value}),
    getItem: key => call('APPLOCAL_GETITEM', {key}),
    removeItem: key => call('APPLOCAL_REMOVEITEM', {key})
  });
  const storage = Object.freeze({get: key => call('CHROME_LOCAL_GET', {key}), set: values => call('CHROME_LOCAL_SET', {values}),
    remove: keys => call('CHROME_LOCAL_REMOVE', {keys}), clear: () => call('CHROME_LOCAL_CLEAR', {})});
  return Object.freeze({AppStorage, AppLocal, storage,
    getObjectFromLocalStorage: key => call('CHROME_LOCAL_GET', {key}),
    saveObjectInLocalStorage: values => call('CHROME_LOCAL_SET', {values}),
    removeObjectFromLocalStorage: keys => call('CHROME_LOCAL_REMOVE', {keys})});
}
