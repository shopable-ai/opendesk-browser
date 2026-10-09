(async()=>({id:chrome.runtime.id,permissions:await chrome.permissions.getAll(),contains:await chrome.permissions.contains({origins:['http://127.0.0.1/*']})}))()
