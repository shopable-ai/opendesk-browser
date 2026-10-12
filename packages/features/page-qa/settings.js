// This is the sole persistent Page QA feature: a non-sensitive local UI preference.
export async function loadOnlyWarnings() {
  const value=await chrome.storage.local.get({onlyWarnings:false});
  return value?.onlyWarnings===true;
}
export async function saveOnlyWarnings(value) {
  await chrome.storage.local.set({onlyWarnings:value===true});
}
