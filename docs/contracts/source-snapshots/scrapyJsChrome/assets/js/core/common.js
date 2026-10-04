
function createNotify(title,content){
    let desc = '';
    if (typeof content === 'string') desc =  content ;
    else if (typeof content === 'object') desc = content.body ;

    // console.log(title,desc);
    return callChromeBridgeInterface('CREATE_NOTIFY', { title, content: desc });
}

function createBridgeProtocolError(message, requestId, errorCode) {
    const error = new Error(message || 'Bridge request failed');
    if (requestId) {
        error.requestId = requestId;
    }
    if (errorCode) {
        error.errorCode = errorCode;
    }
    return error;
}

/**
 * 
 * @example  await callChromeBridgeInterface('AXIOS_POST', { BridgeUrl_Inject: url, data, config });
 */
function createBridgeRequestId(prefix = 'bridge') {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function buildBridgeRequestMeta(source, requestId, meta) {
    return {
        protocolVersion: '1.0',
        requestId,
        source,
        timestamp: Date.now(),
        ...(meta && typeof meta === 'object' ? meta : {}),
        requestId
    };
}

function buildBridgeEventDetail(functionName, params, eventName) {
    const input = params && typeof params === 'object' ? { ...params } : {};
    const bridgeEventId = typeof input.BridgeEventId === 'string' && input.BridgeEventId.length > 0
        ? input.BridgeEventId
        : generateEventId();
    const requestId = typeof input.requestId === 'string' && input.requestId.length > 0
        ? input.requestId
        : createBridgeRequestId(eventName === 'CHROME_BRIDGE_POPUP' ? 'bridge_popup' : 'bridge_interface');
    const timeoutMs = Number.isFinite(input.timeoutMs) ? input.timeoutMs : 30000;
    const meta = buildBridgeRequestMeta('page-bridge', requestId, input.meta);
    delete input.BridgeEventName;
    delete input.BridgeEventId;
    delete input.requestId;
    delete input.meta;
    delete input.timeoutMs;

    return {
        bridgeEventId,
        requestId,
        timeoutMs,
        detail: {
            ...input,
            BridgeEventName: functionName,
            BridgeEventId: bridgeEventId,
            requestId,
            meta
        }
    };
}

async function callChromeBridgeInterface(functionName, params, eventName) {
    params = params || {};
    eventName = eventName || 'CHROME_BRIDGE_INTERFACE';
    const { bridgeEventId, requestId, timeoutMs, detail } = buildBridgeEventDetail(functionName, params, eventName);
    let promise = new Promise((resolve, reject) => {
        let done = false;
        const finish = (cb, value) => {
            if (done) {
                return;
            }
            done = true;
            if (timer) {
                clearTimeout(timer);
            }
            globalThis.ChromeBridgeEvents.delete(bridgeEventId);
            cb(value);
        };
        const timer = timeoutMs > 0 ? setTimeout(() => {
            finish(
                reject,
                createBridgeProtocolError(`Bridge callback timeout after ${timeoutMs}ms`, requestId, 'E_BRIDGE_TIMEOUT')
            );
        }, timeoutMs) : null;
        globalThis.ChromeBridgeEvents.set(bridgeEventId, {
            requestId,
            resolve: (value) => finish(resolve, value),
            reject: (error) => finish(reject, error)
        });
        console.log('callChromeBridgeInterface', functionName, params, eventName, requestId);
        window.dispatchEvent(new CustomEvent(eventName, {
            detail
        }));
    });
    return promise;
}

async function cookieDelete(){
    let url = location.href;
    let script = `			
        deleteCookiesByUrl("${ url }");
        page.reload();
    `
    executeInBg(script)
}