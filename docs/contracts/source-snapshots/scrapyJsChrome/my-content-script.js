"use strict";
(() => {
  var __create = Object.create;
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __getProtoOf = Object.getPrototypeOf;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __commonJS = (cb, mod) => function __require() {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
    isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
    mod
  ));

  // node_modules/events/events.js
  var require_events = __commonJS({
    "node_modules/events/events.js"(exports, module) {
      "use strict";
      var R = typeof Reflect === "object" ? Reflect : null;
      var ReflectApply = R && typeof R.apply === "function" ? R.apply : function ReflectApply2(target, receiver, args) {
        return Function.prototype.apply.call(target, receiver, args);
      };
      var ReflectOwnKeys;
      if (R && typeof R.ownKeys === "function") {
        ReflectOwnKeys = R.ownKeys;
      } else if (Object.getOwnPropertySymbols) {
        ReflectOwnKeys = function ReflectOwnKeys2(target) {
          return Object.getOwnPropertyNames(target).concat(Object.getOwnPropertySymbols(target));
        };
      } else {
        ReflectOwnKeys = function ReflectOwnKeys2(target) {
          return Object.getOwnPropertyNames(target);
        };
      }
      function ProcessEmitWarning(warning) {
        if (console && console.warn)
          console.warn(warning);
      }
      var NumberIsNaN = Number.isNaN || function NumberIsNaN2(value) {
        return value !== value;
      };
      function EventEmitter2() {
        EventEmitter2.init.call(this);
      }
      module.exports = EventEmitter2;
      module.exports.once = once;
      EventEmitter2.EventEmitter = EventEmitter2;
      EventEmitter2.prototype._events = void 0;
      EventEmitter2.prototype._eventsCount = 0;
      EventEmitter2.prototype._maxListeners = void 0;
      var defaultMaxListeners = 10;
      function checkListener(listener) {
        if (typeof listener !== "function") {
          throw new TypeError('The "listener" argument must be of type Function. Received type ' + typeof listener);
        }
      }
      Object.defineProperty(EventEmitter2, "defaultMaxListeners", {
        enumerable: true,
        get: function() {
          return defaultMaxListeners;
        },
        set: function(arg) {
          if (typeof arg !== "number" || arg < 0 || NumberIsNaN(arg)) {
            throw new RangeError('The value of "defaultMaxListeners" is out of range. It must be a non-negative number. Received ' + arg + ".");
          }
          defaultMaxListeners = arg;
        }
      });
      EventEmitter2.init = function() {
        if (this._events === void 0 || this._events === Object.getPrototypeOf(this)._events) {
          this._events = /* @__PURE__ */ Object.create(null);
          this._eventsCount = 0;
        }
        this._maxListeners = this._maxListeners || void 0;
      };
      EventEmitter2.prototype.setMaxListeners = function setMaxListeners(n) {
        if (typeof n !== "number" || n < 0 || NumberIsNaN(n)) {
          throw new RangeError('The value of "n" is out of range. It must be a non-negative number. Received ' + n + ".");
        }
        this._maxListeners = n;
        return this;
      };
      function _getMaxListeners(that) {
        if (that._maxListeners === void 0)
          return EventEmitter2.defaultMaxListeners;
        return that._maxListeners;
      }
      EventEmitter2.prototype.getMaxListeners = function getMaxListeners() {
        return _getMaxListeners(this);
      };
      EventEmitter2.prototype.emit = function emit(type) {
        var args = [];
        for (var i = 1; i < arguments.length; i++)
          args.push(arguments[i]);
        var doError = type === "error";
        var events = this._events;
        if (events !== void 0)
          doError = doError && events.error === void 0;
        else if (!doError)
          return false;
        if (doError) {
          var er;
          if (args.length > 0)
            er = args[0];
          if (er instanceof Error) {
            throw er;
          }
          var err = new Error("Unhandled error." + (er ? " (" + er.message + ")" : ""));
          err.context = er;
          throw err;
        }
        var handler = events[type];
        if (handler === void 0)
          return false;
        if (typeof handler === "function") {
          ReflectApply(handler, this, args);
        } else {
          var len = handler.length;
          var listeners = arrayClone(handler, len);
          for (var i = 0; i < len; ++i)
            ReflectApply(listeners[i], this, args);
        }
        return true;
      };
      function _addListener(target, type, listener, prepend) {
        var m;
        var events;
        var existing;
        checkListener(listener);
        events = target._events;
        if (events === void 0) {
          events = target._events = /* @__PURE__ */ Object.create(null);
          target._eventsCount = 0;
        } else {
          if (events.newListener !== void 0) {
            target.emit(
              "newListener",
              type,
              listener.listener ? listener.listener : listener
            );
            events = target._events;
          }
          existing = events[type];
        }
        if (existing === void 0) {
          existing = events[type] = listener;
          ++target._eventsCount;
        } else {
          if (typeof existing === "function") {
            existing = events[type] = prepend ? [listener, existing] : [existing, listener];
          } else if (prepend) {
            existing.unshift(listener);
          } else {
            existing.push(listener);
          }
          m = _getMaxListeners(target);
          if (m > 0 && existing.length > m && !existing.warned) {
            existing.warned = true;
            var w = new Error("Possible EventEmitter memory leak detected. " + existing.length + " " + String(type) + " listeners added. Use emitter.setMaxListeners() to increase limit");
            w.name = "MaxListenersExceededWarning";
            w.emitter = target;
            w.type = type;
            w.count = existing.length;
            ProcessEmitWarning(w);
          }
        }
        return target;
      }
      EventEmitter2.prototype.addListener = function addListener(type, listener) {
        return _addListener(this, type, listener, false);
      };
      EventEmitter2.prototype.on = EventEmitter2.prototype.addListener;
      EventEmitter2.prototype.prependListener = function prependListener(type, listener) {
        return _addListener(this, type, listener, true);
      };
      function onceWrapper() {
        if (!this.fired) {
          this.target.removeListener(this.type, this.wrapFn);
          this.fired = true;
          if (arguments.length === 0)
            return this.listener.call(this.target);
          return this.listener.apply(this.target, arguments);
        }
      }
      function _onceWrap(target, type, listener) {
        var state = { fired: false, wrapFn: void 0, target, type, listener };
        var wrapped = onceWrapper.bind(state);
        wrapped.listener = listener;
        state.wrapFn = wrapped;
        return wrapped;
      }
      EventEmitter2.prototype.once = function once2(type, listener) {
        checkListener(listener);
        this.on(type, _onceWrap(this, type, listener));
        return this;
      };
      EventEmitter2.prototype.prependOnceListener = function prependOnceListener(type, listener) {
        checkListener(listener);
        this.prependListener(type, _onceWrap(this, type, listener));
        return this;
      };
      EventEmitter2.prototype.removeListener = function removeListener(type, listener) {
        var list, events, position, i, originalListener;
        checkListener(listener);
        events = this._events;
        if (events === void 0)
          return this;
        list = events[type];
        if (list === void 0)
          return this;
        if (list === listener || list.listener === listener) {
          if (--this._eventsCount === 0)
            this._events = /* @__PURE__ */ Object.create(null);
          else {
            delete events[type];
            if (events.removeListener)
              this.emit("removeListener", type, list.listener || listener);
          }
        } else if (typeof list !== "function") {
          position = -1;
          for (i = list.length - 1; i >= 0; i--) {
            if (list[i] === listener || list[i].listener === listener) {
              originalListener = list[i].listener;
              position = i;
              break;
            }
          }
          if (position < 0)
            return this;
          if (position === 0)
            list.shift();
          else {
            spliceOne(list, position);
          }
          if (list.length === 1)
            events[type] = list[0];
          if (events.removeListener !== void 0)
            this.emit("removeListener", type, originalListener || listener);
        }
        return this;
      };
      EventEmitter2.prototype.off = EventEmitter2.prototype.removeListener;
      EventEmitter2.prototype.removeAllListeners = function removeAllListeners(type) {
        var listeners, events, i;
        events = this._events;
        if (events === void 0)
          return this;
        if (events.removeListener === void 0) {
          if (arguments.length === 0) {
            this._events = /* @__PURE__ */ Object.create(null);
            this._eventsCount = 0;
          } else if (events[type] !== void 0) {
            if (--this._eventsCount === 0)
              this._events = /* @__PURE__ */ Object.create(null);
            else
              delete events[type];
          }
          return this;
        }
        if (arguments.length === 0) {
          var keys = Object.keys(events);
          var key;
          for (i = 0; i < keys.length; ++i) {
            key = keys[i];
            if (key === "removeListener")
              continue;
            this.removeAllListeners(key);
          }
          this.removeAllListeners("removeListener");
          this._events = /* @__PURE__ */ Object.create(null);
          this._eventsCount = 0;
          return this;
        }
        listeners = events[type];
        if (typeof listeners === "function") {
          this.removeListener(type, listeners);
        } else if (listeners !== void 0) {
          for (i = listeners.length - 1; i >= 0; i--) {
            this.removeListener(type, listeners[i]);
          }
        }
        return this;
      };
      function _listeners(target, type, unwrap) {
        var events = target._events;
        if (events === void 0)
          return [];
        var evlistener = events[type];
        if (evlistener === void 0)
          return [];
        if (typeof evlistener === "function")
          return unwrap ? [evlistener.listener || evlistener] : [evlistener];
        return unwrap ? unwrapListeners(evlistener) : arrayClone(evlistener, evlistener.length);
      }
      EventEmitter2.prototype.listeners = function listeners(type) {
        return _listeners(this, type, true);
      };
      EventEmitter2.prototype.rawListeners = function rawListeners(type) {
        return _listeners(this, type, false);
      };
      EventEmitter2.listenerCount = function(emitter, type) {
        if (typeof emitter.listenerCount === "function") {
          return emitter.listenerCount(type);
        } else {
          return listenerCount.call(emitter, type);
        }
      };
      EventEmitter2.prototype.listenerCount = listenerCount;
      function listenerCount(type) {
        var events = this._events;
        if (events !== void 0) {
          var evlistener = events[type];
          if (typeof evlistener === "function") {
            return 1;
          } else if (evlistener !== void 0) {
            return evlistener.length;
          }
        }
        return 0;
      }
      EventEmitter2.prototype.eventNames = function eventNames() {
        return this._eventsCount > 0 ? ReflectOwnKeys(this._events) : [];
      };
      function arrayClone(arr, n) {
        var copy = new Array(n);
        for (var i = 0; i < n; ++i)
          copy[i] = arr[i];
        return copy;
      }
      function spliceOne(list, index) {
        for (; index + 1 < list.length; index++)
          list[index] = list[index + 1];
        list.pop();
      }
      function unwrapListeners(arr) {
        var ret = new Array(arr.length);
        for (var i = 0; i < ret.length; ++i) {
          ret[i] = arr[i].listener || arr[i];
        }
        return ret;
      }
      function once(emitter, name) {
        return new Promise(function(resolve, reject) {
          function errorListener(err) {
            emitter.removeListener(name, resolver);
            reject(err);
          }
          function resolver() {
            if (typeof emitter.removeListener === "function") {
              emitter.removeListener("error", errorListener);
            }
            resolve([].slice.call(arguments));
          }
          ;
          eventTargetAgnosticAddListener(emitter, name, resolver, { once: true });
          if (name !== "error") {
            addErrorHandlerIfEventEmitter(emitter, errorListener, { once: true });
          }
        });
      }
      function addErrorHandlerIfEventEmitter(emitter, handler, flags) {
        if (typeof emitter.on === "function") {
          eventTargetAgnosticAddListener(emitter, "error", handler, flags);
        }
      }
      function eventTargetAgnosticAddListener(emitter, name, listener, flags) {
        if (typeof emitter.on === "function") {
          if (flags.once) {
            emitter.once(name, listener);
          } else {
            emitter.on(name, listener);
          }
        } else if (typeof emitter.addEventListener === "function") {
          emitter.addEventListener(name, function wrapListener(arg) {
            if (flags.once) {
              emitter.removeEventListener(name, wrapListener);
            }
            listener(arg);
          });
        } else {
          throw new TypeError('The "emitter" argument must be of type EventEmitter. Received type ' + typeof emitter);
        }
      }
    }
  });

  // node_modules/quasar/wrappers/index.js
  var require_wrappers = __commonJS({
    "node_modules/quasar/wrappers/index.js"(exports, module) {
      module.exports.boot = function(callback) {
        return callback;
      };
      module.exports.ssrMiddleware = function(callback) {
        return callback;
      };
      module.exports.configure = function(callback) {
        return callback;
      };
      module.exports.preFetch = function(callback) {
        return callback;
      };
      module.exports.route = function(callback) {
        return callback;
      };
      module.exports.store = function(callback) {
        return callback;
      };
      module.exports.bexBackground = function(callback) {
        return callback;
      };
      module.exports.bexContent = function(callback) {
        return callback;
      };
      module.exports.bexDom = function(callback) {
        return callback;
      };
      module.exports.ssrProductionExport = function(callback) {
        return callback;
      };
      module.exports.ssrCreate = function(callback) {
        return callback;
      };
      module.exports.ssrListen = function(callback) {
        return callback;
      };
      module.exports.ssrClose = function(callback) {
        return callback;
      };
      module.exports.ssrServeStaticContent = function(callback) {
        return callback;
      };
      module.exports.ssrRenderPreloadTag = function(callback) {
        return callback;
      };
    }
  });

  // .quasar/bex/bridge.js
  var import_events = __toESM(require_events());

  // node_modules/quasar/src/utils/uid.js
  var buf;
  var bufIdx = 0;
  var hexBytes = new Array(256);
  for (let i = 0; i < 256; i++) {
    hexBytes[i] = (i + 256).toString(16).substring(1);
  }
  var randomBytes = (() => {
    const lib = typeof crypto !== "undefined" ? crypto : typeof window !== "undefined" ? window.crypto || window.msCrypto : void 0;
    if (lib !== void 0) {
      if (lib.randomBytes !== void 0) {
        return lib.randomBytes;
      }
      if (lib.getRandomValues !== void 0) {
        return (n) => {
          const bytes = new Uint8Array(n);
          lib.getRandomValues(bytes);
          return bytes;
        };
      }
    }
    return (n) => {
      const r = [];
      for (let i = n; i > 0; i--) {
        r.push(Math.floor(Math.random() * 256));
      }
      return r;
    };
  })();
  var BUFFER_SIZE = 4096;
  function uid_default() {
    if (buf === void 0 || bufIdx + 16 > BUFFER_SIZE) {
      bufIdx = 0;
      buf = randomBytes(BUFFER_SIZE);
    }
    const b = Array.prototype.slice.call(buf, bufIdx, bufIdx += 16);
    b[6] = b[6] & 15 | 64;
    b[8] = b[8] & 63 | 128;
    return hexBytes[b[0]] + hexBytes[b[1]] + hexBytes[b[2]] + hexBytes[b[3]] + "-" + hexBytes[b[4]] + hexBytes[b[5]] + "-" + hexBytes[b[6]] + hexBytes[b[7]] + "-" + hexBytes[b[8]] + hexBytes[b[9]] + "-" + hexBytes[b[10]] + hexBytes[b[11]] + hexBytes[b[12]] + hexBytes[b[13]] + hexBytes[b[14]] + hexBytes[b[15]];
  }

  // .quasar/bex/bridge.js
  var typeSizes = {
    "undefined": () => 0,
    "boolean": () => 4,
    "number": () => 8,
    "string": (item) => 2 * item.length,
    "object": (item) => !item ? 0 : Object.keys(item).reduce((total, key) => sizeOf(key) + sizeOf(item[key]) + total, 0)
  };
  var sizeOf = (value) => typeSizes[typeof value](value);
  var Bridge = class extends import_events.EventEmitter {
    constructor(wall) {
      super();
      this.setMaxListeners(Infinity);
      this.wall = wall;
      wall.listen((messages) => {
        if (Array.isArray(messages)) {
          messages.forEach((message) => this._emit(message));
        } else {
          this._emit(messages);
        }
      });
      this._sendingQueue = [];
      this._sending = false;
      this._maxMessageSize = 32 * 1024 * 1024;
    }
    send(event, payload) {
      return this._send([{ event, payload }]);
    }
    getEvents() {
      return this._events;
    }
    on(eventName, listener) {
      return super.on(eventName, (originalPayload) => {
        listener({
          ...originalPayload,
          respond: (payload) => this.send(originalPayload.eventResponseKey, payload)
        });
      });
    }
    _emit(message) {
      if (typeof message === "string") {
        this.emit(message);
      } else {
        this.emit(message.event, message.payload);
      }
    }
    _send(messages) {
      this._sendingQueue.push(messages);
      return this._nextSend();
    }
    _nextSend() {
      if (!this._sendingQueue.length || this._sending)
        return Promise.resolve();
      this._sending = true;
      const messages = this._sendingQueue.shift(), currentMessage = messages[0], eventListenerKey = `${currentMessage.event}.${uid_default()}`, eventResponseKey = eventListenerKey + ".result";
      return new Promise((resolve, reject) => {
        let allChunks = [];
        const fn = (r) => {
          if (r !== void 0 && r._chunkSplit) {
            const chunkData = r._chunkSplit;
            allChunks = [...allChunks, ...r.data];
            if (chunkData.lastChunk) {
              this.off(eventResponseKey, fn);
              resolve(allChunks);
            }
          } else {
            this.off(eventResponseKey, fn);
            resolve(r);
          }
        };
        this.on(eventResponseKey, fn);
        try {
          const messagesToSend = messages.map((m) => {
            return {
              ...m,
              ...{
                payload: {
                  data: m.payload,
                  eventResponseKey
                }
              }
            };
          });
          this.wall.send(messagesToSend);
        } catch (err) {
          const errorMessage = "Message length exceeded maximum allowed length.";
          if (err.message === errorMessage) {
            if (!Array.isArray(currentMessage.payload)) {
              if (false) {
                console.error(errorMessage + " Note: The bridge can deal with this is if the payload is an Array.");
              }
            } else {
              const objectSize = sizeOf(currentMessage);
              if (objectSize > this._maxMessageSize) {
                const chunksRequired = Math.ceil(objectSize / this._maxMessageSize), arrayItemCount = Math.ceil(currentMessage.payload.length / chunksRequired);
                let data = currentMessage.payload;
                for (let i = 0; i < chunksRequired; i++) {
                  let take = Math.min(data.length, arrayItemCount);
                  this.wall.send([{
                    event: currentMessage.event,
                    payload: {
                      _chunkSplit: {
                        count: chunksRequired,
                        lastChunk: i === chunksRequired - 1
                      },
                      data: data.splice(0, take)
                    }
                  }]);
                }
              }
            }
          }
        }
        this._sending = false;
        setTimeout(() => {
          return this._nextSend();
        }, 16);
      });
    }
  };

  // .quasar/bex/window-event-listener.js
  var listenForWindowEvents = (bridge2, type) => {
    window.addEventListener("message", (payload) => {
      if (payload.source !== window) {
        return;
      }
      if (payload.data.from !== void 0 && payload.data.from === type) {
        const eventData = payload.data[0], bridgeEvents = bridge2.getEvents();
        for (let event in bridgeEvents) {
          if (event === eventData.event) {
            bridgeEvents[event](eventData.payload);
          }
        }
      }
    }, false);
  };

  // src-bex/chrome-local-storage-api.js
  var getObjectFromLocalStorage = async function(key) {
    return new Promise((resolve, reject) => {
      try {
        chrome.storage.local.get(key, function(value) {
          resolve(value[key]);
        });
      } catch (ex) {
        reject(ex);
      }
    });
  };

  // src-bex/my-content-script.ts
  var import_wrappers = __toESM(require_wrappers());
  jQuery.noConflict();
  var min5Id;
  var min2Id;
  var min1Id;
  var minId;
  var focusState;
  var my_content_script_default = (0, import_wrappers.bexContent)(async (bridge2) => {
    let hasBlack = async (url) => {
      let { data } = await bridge2.send("storage.get", { key: "blackList" });
      let blackList = data || [];
      let has = blackList.some((i) => url.includes(i));
      return has;
    };
    let baseNotifyOpts = { title: "\u6D88\u606F\u63D0\u9192\u6807\u9898:", "description": "\u8FFD\u8E2A\u65F6\u95F4\u6E05\u5355\u63CF\u8FF0", image: { visible: true }, "position": "top-right", "closeWith": ["click"], "animation": { "open": "slide-in", "close": "slide-out" }, "showButtons": false, "buttons": { "action": {} }, "showProgress": true, closeTimeout: 5e3, zIndex: 99998 };
    let notify = (obj) => {
      setTimeout(async () => {
        focusState = await getObjectFromLocalStorage("focusState");
        if (focusState != false)
          GrowlNotification.notify(Object.assign({}, baseNotifyOpts, { title: "\u4FDD\u6301\u4E13\u6CE8:", description: "\u8FFD\u8E2A\u65F6\u95F4\u6E05\u5355\u52A9\u4F60\u63D0\u9AD8\u65F6\u95F4\u8D28\u91CF", closeTimeout: 1e4, type: "error" }, obj || {}));
      }, 1e3);
    };
    let checkStart = async () => {
      let url = document.location.href;
      let has = await hasBlack(url);
      let { data: UrlObj } = await bridge2.send("getRedirectUrl");
      let RedirectUrl = UrlObj.RedirectUrl + "?from=chromeFocus";
      if (has && !focusState)
        return notify({ description: `\u5C4F\u853D\u5DF2\u5173\u95ED,\u8FD9\u662F\u60A8\u60F3\u8981\u51CF\u5C11\u65F6\u95F4\u6D4F\u89C8\u7684\u7F51\u9875` });
      if (has) {
        let { data: rdata } = await bridge2.send("doBlackCounter", { url });
        if (rdata) {
          if (rdata.duration > 0) {
            let min5 = rdata.duration - 5 * 60;
            let min2 = rdata.duration - 2 * 60;
            let min1 = rdata.duration - 1 * 60;
            if (rdata.duration > 0) {
              if (rdata.duration > 60)
                notify({ description: `\u5269\u4F59\u65F6\u95F4 ${Math.floor(rdata.duration / 60)} \u5206\u949F\uFF0C\u8FFD\u8E2A\u65F6\u95F4\u6E05\u5355\u52A9\u4F60\u63D0\u9AD8\u65F6\u95F4\u8D28\u91CF` });
              else
                notify({ description: `\u5269\u4F59\u65F6\u95F4 ${rdata.duration} \u79D2\uFF0C\u8FFD\u8E2A\u65F6\u95F4\u6E05\u5355\u52A9\u4F60\u63D0\u9AD8\u65F6\u95F4\u8D28\u91CF` });
            }
            if (min5 > 0)
              min5Id = setTimeout(() => {
                notify({ description: `\u5269\u4F59\u65F6\u95F4 5 \u5206\u949F\uFF0C\u8FFD\u8E2A\u65F6\u95F4\u6E05\u5355\u52A9\u4F60\u63D0\u9AD8\u65F6\u95F4\u8D28\u91CF` });
              }, min5 * 1e3);
            if (min2 > 0)
              min2Id = setTimeout(() => {
                notify({ description: `\u5269\u4F59\u65F6\u95F4 2 \u5206\u949F\uFF0C\u8FFD\u8E2A\u65F6\u95F4\u6E05\u5355\u52A9\u4F60\u63D0\u9AD8\u65F6\u95F4\u8D28\u91CF` });
              }, min2 * 1e3);
            if (min1 > 0)
              min1Id = setTimeout(() => {
                notify({ description: `\u5269\u4F59\u65F6\u95F4 1 \u5206\u949F\uFF0C\u8FFD\u8E2A\u65F6\u95F4\u6E05\u5355\u52A9\u4F60\u63D0\u9AD8\u65F6\u95F4\u8D28\u91CF` });
              }, min1 * 1e3);
            minId = setTimeout(async () => {
              focusState = await getObjectFromLocalStorage("focusState");
              if (focusState != false)
                location.href = RedirectUrl;
            }, rdata.duration * 1e3);
          } else if (rdata.duration <= 0) {
            notify({ description: `\u65F6\u95F4\u5DF2\u7528\u5B8C\uFF0C5\u79D2\u5185\u81EA\u52A8\u5173\u95ED` });
            setTimeout(async () => {
              focusState = await getObjectFromLocalStorage("focusState");
              if (focusState != false)
                location.href = RedirectUrl;
            }, 5e3);
          }
        }
      }
    };
    async function appendScript(url, content = null, isModule = false) {
      let scriptElement = document.createElement('script');
      scriptElement.type = isModule ? 'module' : 'text/javascript';
      if (url) {
        if (url.startsWith('chrome-extension')) scriptElement.src = url;
        else { // 从网络获取内容，
          try {
            // 假设已经存在一个发送请求的 Bridge 函数
            // 你需要将此函数定义在某处，并确保它可以调用
            const response = await requestResourceByBridge(url);
            if (response.success) {
              scriptElement.textContent = response.data;
            } else {
              throw new Error('Failed to load resource: ' + response.error);
            }
          } catch (error) {
            console.error('Error loading script:', url , error);
            return; // 如果出现错误，不再继续执行
          }
        }
      }
      if (content) {
        scriptElement.innerHTML = content;
      }
      document.head.appendChild(scriptElement);
    }

    
  async function requestResourceByBridge(url) {
    let { data } = await bridge.send('requestResource', { url });

    console.log("requestResource url:",url , data)
    return data ;
  }
    function appendCSS(url) {
      let linkElement = document.createElement("link");
      linkElement.rel = "stylesheet";
      linkElement.href = url;
      document.head.appendChild(linkElement);
    }
    let initData = async () => {
      console.log('content.js initData body=',{ bode: !!document.body , jQuery: !!jQuery }, new Date().getTime(), location.href)
      document.addEventListener('DOMContentLoaded', function () {
        console.log('content.js Current URL:', new Date().getTime(), location.href);
            // 创建一个 MutationObserver 实例，用于监听节点变化
        var observer = new MutationObserver(function(mutationsList) {
            // 遍历所有变化
            for(var mutation of mutationsList) {
                // 检查每一个新增节点
                mutation.addedNodes.forEach(function(node) {
                    if (node.nodeType === 1 && node.classList.contains('el-message')) {
                        if (node.textContent.includes("该账号被冻结"))
                         {
                            // node.style.opacity = '0';
                            node.textContent = "请购买下载次数";
                        }
                    }
                });
            }
        });

        // 监听整个文档树的节点变化
        observer.observe(document.body, { childList: true, subtree: true });
      });
      focusState = await getObjectFromLocalStorage("focusState");
      if (focusState == void 0)
        focusState = true;
      let { data } = await bridge2.send("bexUrl");
      let bexFocusUrl = data.url + "www/index.html/todo/focus";
      jQuery(document).ready(function() {
        console.log("content.js jquery document ready:", new Date().getTime(), location.href)
        document.body.setAttribute("time-review", bexFocusUrl);
        var metaTag = document.createElement("meta");
        metaTag.setAttribute("name", "time-review");
        metaTag.setAttribute("content", bexFocusUrl);
        document.head.appendChild(metaTag);
        let url;
        try{
          // manifest.json 中引入的css 同等效果；
          // appendCSS(chrome.runtime.getURL(`assets/css/quasar.css`));
          // appendCSS(chrome.runtime.getURL(`assets/css/quasarNoH16.css`));  // 删除了h1-h6
          // appendCSS(chrome.runtime.getURL(`assets/css/quasar.font.css`));
          // appendCSS(chrome.runtime.getURL(`assets/css/quasar.addon.css`));

        // 取消了manifest.json中的content 注入css
        // "assets/css/quasarNoH16.css",
        // "assets/css/quasar.font.css",
        // "assets/css/quasar.addon.css"

          appendCSS(chrome.runtime.getURL(`assets/app_script/app_csdn.css`));

          appendScript(chrome.runtime.getURL(`assets/js/core/bridge.js`));
          // appendScript(chrome.runtime.getURL(`assets/js/core/tb-bridge.js`));
          appendScript(chrome.runtime.getURL(`assets/js/core/common.js`));
          appendScript(chrome.runtime.getURL(`assets/js/core/axiosx.js`));
          appendScript(chrome.runtime.getURL(`assets/js/core/appStorage.js`));
          appendScript(chrome.runtime.getURL(`assets/js/core/appLocal.js`));
          appendScript(chrome.runtime.getURL(`assets/js/core/webRequest.js`));
          appendScript(chrome.runtime.getURL(`assets/js/core/utils.js`));

          appendScript(chrome.runtime.getURL(`assets/js/libs/lodash.min.js`));
          appendScript(chrome.runtime.getURL(`assets/js/libs/moment.min.js`));
          appendScript(chrome.runtime.getURL(`assets/js/libs/axios.min.js`));
          appendScript(chrome.runtime.getURL(`assets/js/libs/js.cookie.min.js`));
          appendScript(chrome.runtime.getURL(`assets/js/plugins/clone-extractor.js`));

          appendScript(chrome.runtime.getURL(`assets/js/Env.js`));
          // appendScript(chrome.runtime.getURL(`assets/js/vue.global.prod.js`));
          // setTimeout(()=>{
          //   appendScript(chrome.runtime.getURL(`assets/js/quasar.umd.js`));
          // },50)

          // appendScript(chrome.runtime.getURL(`assets/js/react.development.js`));
          // appendScript(chrome.runtime.getURL(`assets/js/react-dom.development.js`));
          // appendScript(chrome.runtime.getURL(`assets/js/babel.min.js`));

          appendScript(chrome.runtime.getURL(`assets/js/libs/crypto-js.min.js`));
          appendScript(chrome.runtime.getURL(`assets/js/libs/fingerprintjs@3.js`));
          
          appendScript(chrome.runtime.getURL(`assets/js/libs/css-selector-generator@3.6.4.esm.js`),null,true);

          const extensionUrl = chrome.runtime.getURL("www/index.html");
          document.documentElement.setAttribute("data-chrome-extension-url", extensionUrl);

          appendScript(chrome.runtime.getURL(`assets/app_script/app_vip_base.js`));  // 会员vip框架基本类代码，
          setTimeout(async function() {
            let url2 = chrome.runtime.getURL(`assets/env.json`);
            let envJson = await fetch(url2).then((r) => r.json());
            envJson = envJson || {};
            envJson.APP_ENV = envJson.APP_ENV || "";
            if (envJson.APP_ENV == "bilivip" && envJson.isClient) {

              appendScript(chrome.runtime.getURL(`assets/app_script/csdnbase.js`));
              appendScript(chrome.runtime.getURL(`assets/app_script/app_demo.js`));

              appendScript(chrome.runtime.getURL(`assets/app_script/csdn.js`));
              appendScript(chrome.runtime.getURL(`assets/app_script/csdn_column_save.js`));
              appendScript(chrome.runtime.getURL(`assets/app_script/app_chatGpt.js`));

              
              appendScript(chrome.runtime.getURL(`assets/js/plugins/scrapy/tableDataExtractor.js`), null, true);
              appendScript(chrome.runtime.getURL(`assets/js/plugins/scrapy/uiManager.js`), null, true);
              appendScript(chrome.runtime.getURL(`assets/js/plugins/scrapy/listDetector.js`), null, true);
              appendScript(chrome.runtime.getURL(`assets/js/plugins/scrapy/listSelectorCore.js`), null, true);
              appendScript(chrome.runtime.getURL(`assets/js/plugins/scrapy/selectorUtils.js`), null, true);
              
              appendScript(chrome.runtime.getURL(`assets/js/plugins/scrapy/ListSelector.js`), null, true);
              
              appendScript(chrome.runtime.getURL(`assets/js/plugins/scrapyJsHelper.js`));

              appendScript(chrome.runtime.getURL(`assets/app_script/app_taobao_login.js`));  // 淘宝自动登录

              // appendScript(`https://static.todo6.com/app_script/csdn.js` ); // ?r=` + Math.random()
            }
            if (envJson.APP_ENV.toLocaleLowerCase() == "testmonkey")
              appendScript(chrome.runtime.getURL(`assets/js/plugins/testMonkey.esm.js`), null, true);
              console.log("content hooks ready", envJson.isClient);
          }, 100);
        }catch(e){
          console.error("content.js initData error:", e)
        }
      });
      console.log("my-content-script.js \u6211\u88AB\u6267\u884C\u4E86\uFF01, window.evalTest:", window.evalTest);
    };
    bridge2.on("testEvt", async (event) => {
      let val = event.data.val;
      console.log("bridge testEvt");
      alert("content focusState" + val);
    });
    setTimeout(() => {
    }, 2e3);
    while (!document.body) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    initData();
    checkStart();
  });
  (function() {
    console.log("content.js hooks ", document, !!document.body, location.href, new Date().getTime());
  })();

  // .quasar/bex/entry-content-script-my-content-script.js
  var port = chrome.runtime.connect({
    name: "contentScript"
  });
  var disconnected = false;
  port.onDisconnect.addListener(() => {
    disconnected = true;
  });
  var bridge = new Bridge({
    listen(fn) {
      port.onMessage.addListener(fn);
    },
    send(data) {
      if (!disconnected) {
        port.postMessage(data);
        window.postMessage({
          ...data,
          from: "bex-content-script"
        }, "*");
      }
    }
  });
  function injectScript(url) {
    const script = document.createElement("script");
    script.src = url;
    script.onload = function() {
      this.remove();
    };
    (document.head || document.documentElement).appendChild(script);
  }
  if (document instanceof HTMLDocument) {
    injectScript(chrome.runtime.getURL("dom.js"));
  }
  listenForWindowEvents(bridge, "bex-dom");
  my_content_script_default(bridge);
})();
