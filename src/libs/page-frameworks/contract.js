// Independently pinned, opt-in Page USER_SCRIPT framework runtimes. These
// resources do not modify the default built-in ABI, Controller or website grants.
export const PAGE_FRAMEWORK_RESOURCE_LIMIT=256*1024;
export const PAGE_FRAMEWORK_RUNTIMES=Object.freeze({
  react:Object.freeze({id:'react',version:'19.2.0',source:'src/libs/page-frameworks/react-19.2.0.js',
    output:'libs/page-frameworks/react-19.2.0.js',bytes:192234,
    sha256:'4922d0516810e22b35fe9204fefa98ae7efc9207a23eefe9e5459f7e11499c3f',
    licenseSource:'src/libs/page-frameworks/react-LICENSE.txt',licensePath:'licenses/page-framework-react-MIT.txt',
    global:'OpenDeskPageReact'}),
  vue:Object.freeze({id:'vue',version:'3.5.22',source:'src/libs/page-frameworks/vue-3.5.22.js',
    output:'libs/page-frameworks/vue-3.5.22.js',bytes:61558,
    sha256:'3c22d3940608bfe8d77ab3efb1159bc624fe30b076c3e276e6c367dec2ec7aba',
    licenseSource:'src/libs/page-frameworks/vue-LICENSE.txt',licensePath:'licenses/page-framework-vue-MIT.txt',
    global:'OpenDeskPageVue'})
});

/** Exact named exports present in the pinned R24.2 runtime byte set.
 * Never add exports here without rebuilding/reviewing the framework bundle. */
export const PAGE_FRAMEWORK_IMPORTS=Object.freeze({
  react:Object.freeze({
    react:Object.freeze(['version','createElement','Fragment','useState','useEffect','useMemo','useRef']),
    'react-dom/client':Object.freeze(['createRoot'])
  }),
  vue:Object.freeze({
    vue:Object.freeze(['version','createApp','h','ref','reactive','computed','watch','onMounted','onUnmounted'])
  })
});
