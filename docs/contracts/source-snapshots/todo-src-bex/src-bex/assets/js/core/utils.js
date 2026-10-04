if (!globalThis.sleep) globalThis.sleep = (milliseconds) => new Promise(resolve => setTimeout(resolve, milliseconds));


async function getFingerprint() {
    // 初始化 FingerprintJS API
    const fp = await FingerprintJS.load();

    // 获取访客标识符
    const result = await fp.get();

    // 这个值是访客的唯一指纹
    const visitorId = result.visitorId;
    // console.log("visitorId",visitorId);

    // 你可以使用 visitorId 做进一步的处理，例如发送到服务器或用于跟踪用户
    return visitorId ;
}
