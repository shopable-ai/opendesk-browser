import axios from 'axios';

class UtilInfo {
	private static API_URL = 'http://whois.pconline.com.cn/ipJson.jsp?json=true';

	/**
	 * 获取指定 IP 的信息。如果未提供 IP，则查询调用者的 IP。
	 * @param ip - 要查询的 IP 地址。可选。
	 */
	static async getIpInfo(ip?: string): Promise<any> {
		const url = ip ? `${this.API_URL}&ip=${ip}` : this.API_URL;
		const data = await axios.get(url).then(r => r.data);
		return data;
	}
}

export default UtilInfo;
