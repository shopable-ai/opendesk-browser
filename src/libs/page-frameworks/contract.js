// Independently pinned, opt-in Page USER_SCRIPT framework runtimes. These
// resources do not modify the default built-in ABI, Controller or website grants.
export const PAGE_FRAMEWORK_RESOURCE_LIMIT=256*1024;
export const PAGE_FRAMEWORK_RUNTIMES=Object.freeze({
  react:Object.freeze({id:'react',version:'19.2.0',source:'src/libs/page-frameworks/react-19.2.0.js',
    output:'libs/page-frameworks/react-19.2.0.js',bytes:193163,
    sha256:'d1eec2e96ed42046ad543a10af7de992aee633ac06017f44f6b917e36451c758',
    licenseSource:'src/libs/page-frameworks/react-LICENSE.txt',licensePath:'licenses/page-framework-react-MIT.txt',
    global:'OpenDeskPageReact'}),
  vue:Object.freeze({id:'vue',version:'3.5.22',source:'src/libs/page-frameworks/vue-3.5.22.js',
    output:'libs/page-frameworks/vue-3.5.22.js',bytes:118131,
    sha256:'2af9ee5acf9bf1cb05c5a871b6d99fd2af11fe1e6f372cfd8acb8b543b95d174',
    licenseSource:'src/libs/page-frameworks/vue-LICENSE.txt',licensePath:'licenses/page-framework-vue-MIT.txt',
    global:'OpenDeskPageVue'})
});

/** Reviewed upstream runtime exports, generated from pinned package lock at build.
 * These are compilation imports, not additional browser privileges.
 * Do not change independently from vendored bytes, SHA and license provenance. */
export const PAGE_FRAMEWORK_IMPORTS=Object.freeze({
  react:Object.freeze({
    react:Object.freeze(["Activity","Children","Component","Fragment","Profiler","PureComponent","StrictMode","Suspense","cache","cacheSignal","cloneElement","createContext","createElement","createRef","forwardRef","isValidElement","lazy","memo","startTransition","unstable_useCacheRefresh","use","useActionState","useCallback","useContext","useDebugValue","useDeferredValue","useEffect","useEffectEvent","useId","useImperativeHandle","useInsertionEffect","useLayoutEffect","useMemo","useOptimistic","useReducer","useRef","useState","useSyncExternalStore","useTransition","version"]),
    'react-dom/client':Object.freeze(["createRoot","hydrateRoot","version"]),
    'react/jsx-runtime':Object.freeze(["Fragment","jsx","jsxs"])
  }),
  vue:Object.freeze({
    vue:Object.freeze(["BaseTransition","BaseTransitionPropsValidators","Comment","DeprecationTypes","EffectScope","ErrorCodes","ErrorTypeStrings","Fragment","KeepAlive","ReactiveEffect","Static","Suspense","Teleport","Text","TrackOpTypes","Transition","TransitionGroup","TriggerOpTypes","VueElement","assertNumber","callWithAsyncErrorHandling","callWithErrorHandling","camelize","capitalize","cloneVNode","compatUtils","compile","computed","createApp","createBlock","createCommentVNode","createElementBlock","createElementVNode","createHydrationRenderer","createPropsRestProxy","createRenderer","createSSRApp","createSlots","createStaticVNode","createTextVNode","createVNode","customRef","defineAsyncComponent","defineComponent","defineCustomElement","defineEmits","defineExpose","defineModel","defineOptions","defineProps","defineSSRCustomElement","defineSlots","devtools","effect","effectScope","getCurrentInstance","getCurrentScope","getCurrentWatcher","getTransitionRawChildren","guardReactiveProps","h","handleError","hasInjectionContext","hydrate","hydrateOnIdle","hydrateOnInteraction","hydrateOnMediaQuery","hydrateOnVisible","initCustomFormatter","initDirectivesForSSR","inject","isMemoSame","isProxy","isReactive","isReadonly","isRef","isRuntimeOnly","isShallow","isVNode","markRaw","mergeDefaults","mergeModels","mergeProps","nextTick","normalizeClass","normalizeProps","normalizeStyle","onActivated","onBeforeMount","onBeforeUnmount","onBeforeUpdate","onDeactivated","onErrorCaptured","onMounted","onRenderTracked","onRenderTriggered","onScopeDispose","onServerPrefetch","onUnmounted","onUpdated","onWatcherCleanup","openBlock","popScopeId","provide","proxyRefs","pushScopeId","queuePostFlushCb","reactive","readonly","ref","registerRuntimeCompiler","render","renderList","renderSlot","resolveComponent","resolveDirective","resolveDynamicComponent","resolveFilter","resolveTransitionHooks","setBlockTracking","setDevtoolsHook","setTransitionHooks","shallowReactive","shallowReadonly","shallowRef","ssrContextKey","ssrUtils","stop","toDisplayString","toHandlerKey","toHandlers","toRaw","toRef","toRefs","toValue","transformVNodeArgs","triggerRef","unref","useAttrs","useCssModule","useCssVars","useHost","useId","useModel","useSSRContext","useShadowRoot","useSlots","useTemplateRef","useTransitionState","vModelCheckbox","vModelDynamic","vModelRadio","vModelSelect","vModelText","vShow","version","warn","watch","watchEffect","watchPostEffect","watchSyncEffect","withAsyncContext","withCtx","withDefaults","withDirectives","withKeys","withMemo","withModifiers","withScopeId"])
  })
});

/** R24.3 opt-in, offline compiler assets. Fixed bytes are DATA-only inputs
 * for a dedicated browser preparation Worker; never include in permanent SW. */
export const PAGE_BROWSER_COMPILER=Object.freeze({
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
export const PAGE_BROWSER_UI_HELPER=Object.freeze({
  id:'page-ui-helper',version:'opendesk.page-ui-helper.r243',
  source:'src/libs/page-frameworks/page-ui-helper-r243.js',
  output:'libs/page-frameworks/page-ui-helper-r243.js',
  bytes:17898,
  sha256:'4b93bc414b7f2b4d42dd2d7ac0c68d6d5a2174377358d3a819e04513df2e1a28',
  sourceGraph:Object.freeze(['src/scripting/user-scripts/page-ui.js',
    'src/scripting/user-scripts/page-ui-mount.js',
    'src/scripting/user-scripts/page-program-rules.js'])
});
export const PAGE_BROWSER_COMPILER_RESOURCE_LIMIT=4*1024*1024;
