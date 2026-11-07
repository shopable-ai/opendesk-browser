/**
 * Response object (保持与 Scrapy 中 Response 类相似)
 */
class Response {
  constructor({
    url,
    status = 200,
    headers = {},
    body = '',
    flags = [],
    request = null,
    certificate = null,
    ip_address = null,
    protocol = 'HTTP/1.1'
  }) {
    this.url = url;
    this.status = status;
    this.headers = headers;
    this.body = body;
    this.flags = flags;
    this._request = request;
    this.certificate = certificate;
    this.ip_address = ip_address;
    this.protocol = protocol;
  }

  // 添加 meta 属性的 getter
  get meta() {
    return this._request ? this._request.meta : {};
  }

  // 添加 request 属性的 getter
  get request() {
    return this._request;
  }

  // 提供 body 内容作为字符串的便捷方法
  get text() {
    return this.body.toString();
  }

  // 提供一个获取某个 header 的方法
  getHeader(headerName) {
    return this.headers[headerName.toLowerCase()] || null;
  }
}

module.exports = Response;