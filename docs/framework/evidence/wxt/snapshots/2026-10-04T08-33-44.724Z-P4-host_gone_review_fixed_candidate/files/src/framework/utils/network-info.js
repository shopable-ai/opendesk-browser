export const IP_INFO_URL = 'http://whois.pconline.com.cn/ipJson.jsp?json=true';
export function createNetworkInfo(call) {
  return Object.freeze({getIpInfo: ip => call('NETWORK_INFO_GET', ip === undefined ? {} : {ip})});
}
