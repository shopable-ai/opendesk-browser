// Freeze only literal registry data. Pure annotations let the compiler linker
// omit unrelated asset hashes, including its own manifest entry.
// Independently pinned, opt-in Page USER_SCRIPT framework runtimes. These
// resources do not modify the default built-in ABI, Controller or website grants.
export const PAGE_FRAMEWORK_RESOURCE_LIMIT=256*1024;
export const PAGE_FRAMEWORK_RUNTIMES=/* @__PURE__ */Object.freeze({
  react:/* @__PURE__ */Object.freeze({id:'react',version:'19.2.0',source:'src/libs/page-frameworks/react-19.2.0.js',
    output:'libs/page-frameworks/react-19.2.0.js',bytes:193163,
    sha256:'d1eec2e96ed42046ad543a10af7de992aee633ac06017f44f6b917e36451c758',
    licenseSource:'src/libs/page-frameworks/react-LICENSE.txt',licensePath:'licenses/page-framework-react-MIT.txt',
    global:'OpenDeskPageReact'}),
  vue:/* @__PURE__ */Object.freeze({id:'vue',version:'3.5.22',source:'src/libs/page-frameworks/vue-3.5.22.js',
    output:'libs/page-frameworks/vue-3.5.22.js',bytes:118131,
    sha256:'2af9ee5acf9bf1cb05c5a871b6d99fd2af11fe1e6f372cfd8acb8b543b95d174',
    licenseSource:'src/libs/page-frameworks/vue-LICENSE.txt',licensePath:'licenses/page-framework-vue-MIT.txt',
    global:'OpenDeskPageVue'})
});

/** Reviewed upstream runtime exports, generated from pinned package lock at build.
 * These are compilation imports, not additional browser privileges.
 * Do not change independently from vendored bytes, SHA and license provenance. */
export const PAGE_FRAMEWORK_IMPORTS=/* @__PURE__ */Object.freeze({
  react:/* @__PURE__ */Object.freeze({
    react:/* @__PURE__ */Object.freeze(["Activity","Children","Component","Fragment","Profiler","PureComponent","StrictMode","Suspense","cache","cacheSignal","cloneElement","createContext","createElement","createRef","forwardRef","isValidElement","lazy","memo","startTransition","unstable_useCacheRefresh","use","useActionState","useCallback","useContext","useDebugValue","useDeferredValue","useEffect","useEffectEvent","useId","useImperativeHandle","useInsertionEffect","useLayoutEffect","useMemo","useOptimistic","useReducer","useRef","useState","useSyncExternalStore","useTransition","version"]),
    'react-dom/client':/* @__PURE__ */Object.freeze(["createRoot","hydrateRoot","version"]),
    'react/jsx-runtime':/* @__PURE__ */Object.freeze(["Fragment","jsx","jsxs"])
  }),
  vue:/* @__PURE__ */Object.freeze({
    vue:/* @__PURE__ */Object.freeze(["BaseTransition","BaseTransitionPropsValidators","Comment","DeprecationTypes","EffectScope","ErrorCodes","ErrorTypeStrings","Fragment","KeepAlive","ReactiveEffect","Static","Suspense","Teleport","Text","TrackOpTypes","Transition","TransitionGroup","TriggerOpTypes","VueElement","assertNumber","callWithAsyncErrorHandling","callWithErrorHandling","camelize","capitalize","cloneVNode","compatUtils","compile","computed","createApp","createBlock","createCommentVNode","createElementBlock","createElementVNode","createHydrationRenderer","createPropsRestProxy","createRenderer","createSSRApp","createSlots","createStaticVNode","createTextVNode","createVNode","customRef","defineAsyncComponent","defineComponent","defineCustomElement","defineEmits","defineExpose","defineModel","defineOptions","defineProps","defineSSRCustomElement","defineSlots","devtools","effect","effectScope","getCurrentInstance","getCurrentScope","getCurrentWatcher","getTransitionRawChildren","guardReactiveProps","h","handleError","hasInjectionContext","hydrate","hydrateOnIdle","hydrateOnInteraction","hydrateOnMediaQuery","hydrateOnVisible","initCustomFormatter","initDirectivesForSSR","inject","isMemoSame","isProxy","isReactive","isReadonly","isRef","isRuntimeOnly","isShallow","isVNode","markRaw","mergeDefaults","mergeModels","mergeProps","nextTick","normalizeClass","normalizeProps","normalizeStyle","onActivated","onBeforeMount","onBeforeUnmount","onBeforeUpdate","onDeactivated","onErrorCaptured","onMounted","onRenderTracked","onRenderTriggered","onScopeDispose","onServerPrefetch","onUnmounted","onUpdated","onWatcherCleanup","openBlock","popScopeId","provide","proxyRefs","pushScopeId","queuePostFlushCb","reactive","readonly","ref","registerRuntimeCompiler","render","renderList","renderSlot","resolveComponent","resolveDirective","resolveDynamicComponent","resolveFilter","resolveTransitionHooks","setBlockTracking","setDevtoolsHook","setTransitionHooks","shallowReactive","shallowReadonly","shallowRef","ssrContextKey","ssrUtils","stop","toDisplayString","toHandlerKey","toHandlers","toRaw","toRef","toRefs","toValue","transformVNodeArgs","triggerRef","unref","useAttrs","useCssModule","useCssVars","useHost","useId","useModel","useSSRContext","useShadowRoot","useSlots","useTemplateRef","useTransitionState","vModelCheckbox","vModelDynamic","vModelRadio","vModelSelect","vModelText","vShow","version","warn","watch","watchEffect","watchPostEffect","watchSyncEffect","withAsyncContext","withCtx","withDefaults","withDirectives","withKeys","withMemo","withModifiers","withScopeId"])
  })
});

/** R24.3 opt-in, offline compiler assets. Fixed bytes are DATA-only inputs
 * for a dedicated browser preparation Worker; never include in permanent SW. */
export const PAGE_BROWSER_COMPILER=/* @__PURE__ */Object.freeze({
  id:'babel-standalone',version:'7.29.9',
  source:'src/libs/page-frameworks/babel-7.29.9.min.js',
  output:'libs/page-frameworks/babel-7.29.9.min.js',
  bytes:3141115,
  sha256:'5f8ffa174aa2465f074c85b92421662168cd356eedebaedc3d16fd9d61fadb7c',
  licenseSource:'src/libs/page-frameworks/babel-LICENSE.txt',
  licensePath:'licenses/page-browser-babel-MIT.txt',
  licenseSha256:'117da2af0d4ce0fe1c8e19b5cff9dcd806adf973d328d27b11d4448c4ff24f76',
  supplyLock:'scripts/page-browser-babel/package-lock.json'
});
export const PAGE_BROWSER_UI_HELPER=/* @__PURE__ */Object.freeze({
  id:'page-ui-helper',version:'opendesk.page-ui-helper.r243',
  source:'src/libs/page-frameworks/page-ui-helper-r243.js',
  output:'libs/page-frameworks/page-ui-helper-r243.js',
  bytes:17898,
  sha256:'4b93bc414b7f2b4d42dd2d7ac0c68d6d5a2174377358d3a819e04513df2e1a28',
  sourceGraph:/* @__PURE__ */Object.freeze(['src/scripting/user-scripts/page-ui.js',
    'src/scripting/user-scripts/page-ui-mount.js',
    'src/scripting/user-scripts/page-program-rules.js'])
});
export const PAGE_BROWSER_COMPILER_RESOURCE_LIMIT=4*1024*1024;

// Approved, immutable internal compiler resources. These are not MV3 entrypoints,
// web-accessible resources, Page user libraries, or Service Worker imports.
export const PAGE_BROWSER_PRIVATE_FILES=/* @__PURE__ */Object.freeze([
  PAGE_BROWSER_COMPILER,PAGE_BROWSER_UI_HELPER,
  /* @__PURE__ */Object.freeze({id:'static-esm-compiler-worker',source:'src/ui/static-esm-compiler-worker.js',
    output:'ui/static-esm-compiler-worker.js',bytes:738,sha256:'3a85cdb9ab33e6d5d0f594678f88b50cff897c9d8a3cb279bf9768a8c2c45050'}),
  /* @__PURE__ */Object.freeze({id:'static-esm-linker',source:'src/ui/static-esm-linker.mjs',
    output:'ui/static-esm-linker.mjs',bytes:8210,sha256:'425e7434828f8a2d35cfe16bc5c7e3dd9cc3b5e79182493d54726ca579ee2854'}),
  /* @__PURE__ */Object.freeze({id:'page-compiler-worker',
    source:'src/ui/page-component-compiler-worker.js',
    output:'ui/page-component-compiler-worker.js',
    bytes:3463,sha256:'1cbefedfb6d980afe26bbda29e629dd8f35a77edea4bfd84e16f3da94a87c732'}),
  /* @__PURE__ */Object.freeze({id:'controller-esm-linker-r4',
    source:'src/libs/page-frameworks/controller-esm-linker-r4.mjs',
    output:'libs/page-frameworks/controller-esm-linker-r4.mjs',
    bytes:16897,sha256:'890982a5e5e286a1eb7307edf878bcf52e917471998f671921b8506af01ef542'}),
  /* @__PURE__ */Object.freeze({id:'page-component-linker',
    source:'src/libs/page-frameworks/page-component-linker-r243.mjs',
    output:'libs/page-frameworks/page-component-linker-r243.mjs',
    bytes:24929,sha256:'14a01acb35e9afeeab5f06d30471001aa2ec655e20ecc0836581bacb95a494b2'}),
  /* @__PURE__ */Object.freeze({id:'page-vue-sfc-transform',
    source:'src/libs/page-frameworks/vue-sfc-transform-r243.mjs',
    output:'libs/page-frameworks/vue-sfc-transform-r243.mjs',
    bytes:3314,sha256:'cdfbef6b2f8aa69706caba576831fc10a82687b07c76b5de6e26ec416b158712'}),
  /* @__PURE__ */Object.freeze({id:'page-vue-sfc-compiler',
    source:'src/libs/page-frameworks/vue-sfc-compiler-3.5.22.mjs',
    output:'libs/page-frameworks/vue-sfc-compiler-3.5.22.mjs',
    bytes:1071582,sha256:'19be293a11bd724a1252d745c406d69275f44c77ab922df27ca4a484a5a5b2b1'})
]);

// Fixed wrapper and linker identity accompanies the Babel identity.
export const STATIC_ESM_COMPILER_PROFILE=/* @__PURE__ */Object.freeze(
  PAGE_BROWSER_PRIVATE_FILES.filter(row=>['static-esm-compiler-worker','static-esm-linker'].includes(row.id))
    .map(({id,sha256})=>/* @__PURE__ */Object.freeze({id,sha256})));
