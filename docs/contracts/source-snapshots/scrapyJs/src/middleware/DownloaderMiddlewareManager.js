const IDownloaderMiddleware = require('./IDownloaderMiddleware');
const DownloaderMiddleware = require('./DownloaderMiddleware');

/**
 * Downloader Middleware for handling network requests with axios
 */
/**
 * Downloader Middleware for handling network requests with axios
 */
class DownloaderMiddlewareManager extends IDownloaderMiddleware {
  constructor(middlewares = []) {
    super(); // Ensure the super constructor is called before using `this`

    // Initialize with user-provided middlewares or use the default one
    this.middlewares = middlewares.length > 0 ? middlewares : [new DownloaderMiddleware()];
  }

// Add a middleware to the array
  addMiddleware(middleware) {
    if (middleware instanceof IDownloaderMiddleware) {
      this.middlewares.push(middleware);
    } else {
      throw new Error("Middleware must be an instance of IDownloaderMiddleware.");
    }
  }

  // Remove a specific middleware from the array
  removeMiddleware(middleware) {
    this.middlewares = this.middlewares.filter(mw => mw !== middleware);
  }

  // Clear all middlewares
  clearMiddlewares() {
    this.middlewares = [];
  }

  // Process request through the chain of middlewares
  async process_request(request, spider) {
    let response;
    for (const middleware of this.middlewares) {
      response = await middleware.process_request(request, spider);
      if (response) break;
    }
    return response;
  }

// Process response through the chain of middlewares
  async process_response(request, response, spider) {
    for (const middleware of this.middlewares) {
      response = await middleware.process_response(request, response, spider);
    }
    return response;
  }

// Handle exceptions through the chain of middlewares
  async process_exception(request, exception, spider) {
    for (const middleware of this.middlewares) {
      await middleware.process_exception(request, exception, spider);
    }
  }

  async close() {
    for (const middleware of this.middlewares) {
      if (typeof middleware.close === 'function') {
        await middleware.close();
      }
    }
  }
}
module.exports = DownloaderMiddlewareManager;