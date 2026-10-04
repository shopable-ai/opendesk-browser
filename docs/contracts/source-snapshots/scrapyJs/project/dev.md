

# PowerShell 下载文件的命令
Invoke-WebRequest -Uri "https://unpkg.com/vue@3.3.4/dist/vue.global.min.js" -OutFile "libs/vue.global.min.js"
Invoke-WebRequest -Uri "https://cdn.quasar.dev/quasar/2.12.7/quasar.min.css" -OutFile "libs/quasar.min.css"
Invoke-WebRequest -Uri "https://cdn.quasar.dev/quasar/2.12.7/quasar.umd.min.js" -OutFile "libs/quasar.umd.min.js"
