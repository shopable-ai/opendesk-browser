console.log('init tb-bridge.js')
globalThis.TB = globalThis.TB || {};

function createRequestId(prefix = "tb") {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function buildRequestMeta(source, requestId) {
    return {
        protocolVersion: "1.0",
        requestId,
        source,
        timestamp: Date.now()
    };
}

function createProtocolError(message, errorCode, requestId) {
    const err = new Error(message || "Unknown runtime error");
    if (errorCode) {
        err.errorCode = errorCode;
    }
    if (requestId) {
        err.requestId = requestId;
    }
    return err;
}

function sendRuntimeMessageWithProtocol(message, options = {}) {
    const timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : 30000;
    return new Promise((resolve, reject) => {
        let done = false;
        const finish = (cb, value) => {
            if (done) {
                return;
            }
            done = true;
            if (timer) {
                clearTimeout(timer);
            }
            cb(value);
        };

        const timer = timeoutMs > 0 ? setTimeout(() => {
            finish(
                reject,
                createProtocolError(
                    `Runtime message timeout after ${timeoutMs}ms`,
                    "E_TIMEOUT",
                    message?.requestId
                )
            );
        }, timeoutMs) : null;

        try {
            chrome.runtime.sendMessage(message, (response) => {
                if (chrome.runtime.lastError) {
                    finish(
                        reject,
                        createProtocolError(
                            chrome.runtime.lastError.message,
                            "E_RUNTIME_LAST_ERROR",
                            message?.requestId
                        )
                    );
                    return;
                }
                if (!response) {
                    finish(
                        reject,
                        createProtocolError(
                            "No response from background",
                            "E_NO_RESPONSE",
                            message?.requestId
                        )
                    );
                    return;
                }
                if (response?.requestId && message?.requestId && response.requestId !== message.requestId) {
                    finish(
                        reject,
                        createProtocolError(
                            `RequestId mismatch: expected ${message.requestId}, received ${response.requestId}`,
                            "E_REQUEST_ID_MISMATCH",
                            message?.requestId
                        )
                    );
                    return;
                }
                finish(resolve, response);
            });
        } catch (error) {
            finish(reject, error);
        }
    });
}

function unwrapRuntimeResponse(payload) {
    if (!payload) {
        return { success: false, error: "Empty response payload", errorCode: "E_EMPTY_RESPONSE" };
    }

    if (payload.type === "testMonkeyFramework") {
        return payload.success
            ? { success: true, value: payload.data, requestId: payload.requestId, errorCode: payload.errorCode ?? null }
            : {
                success: false,
                error: payload.error || "Script execution failed",
                requestId: payload.requestId,
                errorCode: payload.errorCode ?? "E_SCRIPT_EXEC_FAIL"
            };
    }

    if (payload.success && payload.data?.type === "testMonkeyFramework") {
        const inner = payload.data;
        return inner.success
            ? {
                success: true,
                value: inner.data,
                requestId: payload.requestId ?? inner.requestId,
                errorCode: inner.errorCode ?? payload.errorCode ?? null
            }
            : {
                success: false,
                error: inner.error || "Script execution failed",
                requestId: payload.requestId ?? inner.requestId,
                errorCode: inner.errorCode ?? payload.errorCode ?? "E_SCRIPT_EXEC_FAIL"
            };
    }

    if (payload.success === false) {
        return {
            success: false,
            error: payload.error || payload.message || "Script execution failed",
            requestId: payload.requestId,
            errorCode: payload.errorCode ?? "E_HANDLER_EXEC_FAIL"
        };
    }

    const hasEnvelope =
        Object.prototype.hasOwnProperty.call(payload, "success") ||
        Object.prototype.hasOwnProperty.call(payload, "data") ||
        Object.prototype.hasOwnProperty.call(payload, "result");
    if (hasEnvelope) {
        return {
            success: true,
            value: payload.data ?? payload.result,
            requestId: payload.requestId,
            errorCode: payload.errorCode ?? null
        };
    }

    return { success: true, value: payload, requestId: payload.requestId, errorCode: payload.errorCode ?? null };
}

globalThis.TB.bridge = (function() {
    class Bridge {
        constructor() {
            // console.log('init tb-bridge.js constructor')
            this.handlers = new Map();
            this.initMessageListener();
        }

        initMessageListener() {
            chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
                // 只处理带有特定命名空间的消息
                if (!request.namespace || request.namespace !== 'TB') {
                    return false;
                }

                const requestId = request?.requestId || request?.meta?.requestId || createRequestId("tb_msg");
                const { module, action, data } = request;
                const handler = this.handlers.get(`${module}.${action}`);
                
                if (!handler) {
                    console.warn(`TB: No handler for ${module}.${action}`);
                    sendResponse({
                        success: false,
                        requestId,
                        errorCode: "E_HANDLER_NOT_FOUND",
                        error: 'Handler not found'
                    });
                    return false;
                }

                (async () => {
                    try {
                        const result = await handler(data, sender);
                        sendResponse({
                            success: true,
                            requestId,
                            errorCode: null,
                            data: result
                        });
                    } catch (error) {
                        console.error(`TB: Error in ${module}.${action}:`, error);
                        sendResponse({
                            success: false,
                            requestId,
                            errorCode: "E_HANDLER_EXEC_FAIL",
                            error: error?.message || String(error)
                        });
                    }
                })();

                return true;
            });
        }

        on(event, handler) {
            this.handlers.set(event, handler);
            return this;
        }

        send(module, action, data = {}) {
            const requestId = createRequestId("tb_send");
            return sendRuntimeMessageWithProtocol(
                {
                    namespace: 'TB',
                    module,
                    action,
                    requestId,
                    meta: buildRequestMeta("tb-bridge", requestId),
                    data
                },
                { timeoutMs: 30000 }
            ).then((response) => {
                const { success, value, error, errorCode, requestId: responseRequestId } = unwrapRuntimeResponse(response);
                if (!success) {
                    throw createProtocolError(error || "Unknown error", errorCode, responseRequestId || requestId);
                }
                return value;
            });
        }
    }

    return new Bridge();
})();

// const script = `
//     async function timeTest() {            
//         let url = await page.url();
//         let title = await page.title();
//         let data = {title,url}
//         const start = Date.now();
//         await new Promise(resolve => setTimeout(resolve, 1000));
//         const diff = Date.now() - start;
//         return {
//             timeDifference: diff,
//             page: data,
//             complexData: [
//                 { id: 1, name: 'Test 1', value: 100 },
//                 { id: 2, name: 'Test 2', value: 200 },
//                 { id: 3, name: 'Test 3', value: 300 }
//             ]
//         };
//     }
//     timeTest();
// `;

// const result = await executeInPage(script);
// console.log('Time difference:', result );


async function executeInPage(command) {
    const requestId = createRequestId("tb_exec");
    const rawDetail = typeof command === 'string' || command instanceof String
        ? { script: String(command) }
        : (command && typeof command === 'object'
            ? command
            : { script: String(command) });
    const detail = { ...rawDetail };
    if (Object.prototype.hasOwnProperty.call(detail, 'args') && !Array.isArray(detail.args)) {
        detail.args = detail.args == null ? [] : [detail.args];
    }

    console.log('Sending message to execute script:', detail);
    const response = await sendRuntimeMessageWithProtocol({
            type: 'CHROME_PAGE_EXECUTE',
            requestId,
            meta: buildRequestMeta("tb-bridge", requestId),
            detail
        }, { timeoutMs: 30000 });

    const { success, value, error, errorCode, requestId: responseRequestId } = unwrapRuntimeResponse(response);
    if (!success) {
        console.error('Script execution failed:', error);
        throw createProtocolError(error || "Script execution failed", errorCode, responseRequestId || requestId);
    }
    return value;
}
