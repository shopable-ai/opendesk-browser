/**
 * Interface for Downloader Middleware 
 */
class IDownloaderMiddleware {
  async process_request(request, spider) {
    throw new Error("process_request() must be implemented in the subclass");
  }

  async process_response(request, response, spider) {
    // Common logic for response processing (can be overridden)
    return response;
  }

  async process_exception(request, exception, spider) {
    // Common logic for exception processing (can be overridden)
    console.error(`Exception occurred while processing ${request.url}:`, exception);
  }
}

module.exports = IDownloaderMiddleware;