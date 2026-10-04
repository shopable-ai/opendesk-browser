"use strict";
(() => {
  var __create = Object.create;
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __getProtoOf = Object.getPrototypeOf;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __defNormalProp = (obj2, key, value2) => key in obj2 ? __defProp(obj2, key, { enumerable: true, configurable: true, writable: true, value: value2 }) : obj2[key] = value2;
  var __require = /* @__PURE__ */ ((x) => typeof require !== "undefined" ? require : typeof Proxy !== "undefined" ? new Proxy(x, {
    get: (a, b) => (typeof require !== "undefined" ? require : a)[b]
  }) : x)(function(x) {
    if (typeof require !== "undefined")
      return require.apply(this, arguments);
    throw new Error('Dynamic require of "' + x + '" is not supported');
  });
  var __commonJS = (cb, mod) => function __require2() {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  };
  var __export = (target, all3) => {
    for (var name in all3)
      __defProp(target, name, { get: all3[name], enumerable: true });
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
  var __publicField = (obj2, key, value2) => {
    __defNormalProp(obj2, typeof key !== "symbol" ? key + "" : key, value2);
    return value2;
  };

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
      var NumberIsNaN = Number.isNaN || function NumberIsNaN2(value2) {
        return value2 !== value2;
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
        for (var i2 = 1; i2 < arguments.length; i2++)
          args.push(arguments[i2]);
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
          for (var i2 = 0; i2 < len; ++i2)
            ReflectApply(listeners[i2], this, args);
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
        var list, events, position, i2, originalListener;
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
          for (i2 = list.length - 1; i2 >= 0; i2--) {
            if (list[i2] === listener || list[i2].listener === listener) {
              originalListener = list[i2].listener;
              position = i2;
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
        var listeners, events, i2;
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
          for (i2 = 0; i2 < keys.length; ++i2) {
            key = keys[i2];
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
          for (i2 = listeners.length - 1; i2 >= 0; i2--) {
            this.removeListener(type, listeners[i2]);
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
        for (var i2 = 0; i2 < n; ++i2)
          copy[i2] = arr[i2];
        return copy;
      }
      function spliceOne(list, index) {
        for (; index + 1 < list.length; index++)
          list[index] = list[index + 1];
        list.pop();
      }
      function unwrapListeners(arr) {
        var ret = new Array(arr.length);
        for (var i2 = 0; i2 < ret.length; ++i2) {
          ret[i2] = arr[i2].listener || arr[i2];
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

  // node_modules/lodash/lodash.js
  var require_lodash = __commonJS({
    "node_modules/lodash/lodash.js"(exports, module) {
      (function() {
        var undefined2;
        var VERSION3 = "4.17.21";
        var LARGE_ARRAY_SIZE = 200;
        var CORE_ERROR_TEXT = "Unsupported core-js use. Try https://npms.io/search?q=ponyfill.", FUNC_ERROR_TEXT = "Expected a function", INVALID_TEMPL_VAR_ERROR_TEXT = "Invalid `variable` option passed into `_.template`";
        var HASH_UNDEFINED = "__lodash_hash_undefined__";
        var MAX_MEMOIZE_SIZE = 500;
        var PLACEHOLDER = "__lodash_placeholder__";
        var CLONE_DEEP_FLAG = 1, CLONE_FLAT_FLAG = 2, CLONE_SYMBOLS_FLAG = 4;
        var COMPARE_PARTIAL_FLAG = 1, COMPARE_UNORDERED_FLAG = 2;
        var WRAP_BIND_FLAG = 1, WRAP_BIND_KEY_FLAG = 2, WRAP_CURRY_BOUND_FLAG = 4, WRAP_CURRY_FLAG = 8, WRAP_CURRY_RIGHT_FLAG = 16, WRAP_PARTIAL_FLAG = 32, WRAP_PARTIAL_RIGHT_FLAG = 64, WRAP_ARY_FLAG = 128, WRAP_REARG_FLAG = 256, WRAP_FLIP_FLAG = 512;
        var DEFAULT_TRUNC_LENGTH = 30, DEFAULT_TRUNC_OMISSION = "...";
        var HOT_COUNT = 800, HOT_SPAN = 16;
        var LAZY_FILTER_FLAG = 1, LAZY_MAP_FLAG = 2, LAZY_WHILE_FLAG = 3;
        var INFINITY = 1 / 0, MAX_SAFE_INTEGER = 9007199254740991, MAX_INTEGER = 17976931348623157e292, NAN = 0 / 0;
        var MAX_ARRAY_LENGTH = 4294967295, MAX_ARRAY_INDEX = MAX_ARRAY_LENGTH - 1, HALF_MAX_ARRAY_LENGTH = MAX_ARRAY_LENGTH >>> 1;
        var wrapFlags = [
          ["ary", WRAP_ARY_FLAG],
          ["bind", WRAP_BIND_FLAG],
          ["bindKey", WRAP_BIND_KEY_FLAG],
          ["curry", WRAP_CURRY_FLAG],
          ["curryRight", WRAP_CURRY_RIGHT_FLAG],
          ["flip", WRAP_FLIP_FLAG],
          ["partial", WRAP_PARTIAL_FLAG],
          ["partialRight", WRAP_PARTIAL_RIGHT_FLAG],
          ["rearg", WRAP_REARG_FLAG]
        ];
        var argsTag = "[object Arguments]", arrayTag = "[object Array]", asyncTag = "[object AsyncFunction]", boolTag = "[object Boolean]", dateTag = "[object Date]", domExcTag = "[object DOMException]", errorTag = "[object Error]", funcTag = "[object Function]", genTag = "[object GeneratorFunction]", mapTag = "[object Map]", numberTag = "[object Number]", nullTag = "[object Null]", objectTag = "[object Object]", promiseTag = "[object Promise]", proxyTag = "[object Proxy]", regexpTag = "[object RegExp]", setTag = "[object Set]", stringTag = "[object String]", symbolTag = "[object Symbol]", undefinedTag = "[object Undefined]", weakMapTag = "[object WeakMap]", weakSetTag = "[object WeakSet]";
        var arrayBufferTag = "[object ArrayBuffer]", dataViewTag = "[object DataView]", float32Tag = "[object Float32Array]", float64Tag = "[object Float64Array]", int8Tag = "[object Int8Array]", int16Tag = "[object Int16Array]", int32Tag = "[object Int32Array]", uint8Tag = "[object Uint8Array]", uint8ClampedTag = "[object Uint8ClampedArray]", uint16Tag = "[object Uint16Array]", uint32Tag = "[object Uint32Array]";
        var reEmptyStringLeading = /\b__p \+= '';/g, reEmptyStringMiddle = /\b(__p \+=) '' \+/g, reEmptyStringTrailing = /(__e\(.*?\)|\b__t\)) \+\n'';/g;
        var reEscapedHtml = /&(?:amp|lt|gt|quot|#39);/g, reUnescapedHtml = /[&<>"']/g, reHasEscapedHtml = RegExp(reEscapedHtml.source), reHasUnescapedHtml = RegExp(reUnescapedHtml.source);
        var reEscape = /<%-([\s\S]+?)%>/g, reEvaluate = /<%([\s\S]+?)%>/g, reInterpolate = /<%=([\s\S]+?)%>/g;
        var reIsDeepProp = /\.|\[(?:[^[\]]*|(["'])(?:(?!\1)[^\\]|\\.)*?\1)\]/, reIsPlainProp = /^\w*$/, rePropName = /[^.[\]]+|\[(?:(-?\d+(?:\.\d+)?)|(["'])((?:(?!\2)[^\\]|\\.)*?)\2)\]|(?=(?:\.|\[\])(?:\.|\[\]|$))/g;
        var reRegExpChar = /[\\^$.*+?()[\]{}|]/g, reHasRegExpChar = RegExp(reRegExpChar.source);
        var reTrimStart = /^\s+/;
        var reWhitespace = /\s/;
        var reWrapComment = /\{(?:\n\/\* \[wrapped with .+\] \*\/)?\n?/, reWrapDetails = /\{\n\/\* \[wrapped with (.+)\] \*/, reSplitDetails = /,? & /;
        var reAsciiWord = /[^\x00-\x2f\x3a-\x40\x5b-\x60\x7b-\x7f]+/g;
        var reForbiddenIdentifierChars = /[()=,{}\[\]\/\s]/;
        var reEscapeChar = /\\(\\)?/g;
        var reEsTemplate = /\$\{([^\\}]*(?:\\.[^\\}]*)*)\}/g;
        var reFlags = /\w*$/;
        var reIsBadHex = /^[-+]0x[0-9a-f]+$/i;
        var reIsBinary = /^0b[01]+$/i;
        var reIsHostCtor = /^\[object .+?Constructor\]$/;
        var reIsOctal = /^0o[0-7]+$/i;
        var reIsUint = /^(?:0|[1-9]\d*)$/;
        var reLatin = /[\xc0-\xd6\xd8-\xf6\xf8-\xff\u0100-\u017f]/g;
        var reNoMatch = /($^)/;
        var reUnescapedString = /['\n\r\u2028\u2029\\]/g;
        var rsAstralRange = "\\ud800-\\udfff", rsComboMarksRange = "\\u0300-\\u036f", reComboHalfMarksRange = "\\ufe20-\\ufe2f", rsComboSymbolsRange = "\\u20d0-\\u20ff", rsComboRange = rsComboMarksRange + reComboHalfMarksRange + rsComboSymbolsRange, rsDingbatRange = "\\u2700-\\u27bf", rsLowerRange = "a-z\\xdf-\\xf6\\xf8-\\xff", rsMathOpRange = "\\xac\\xb1\\xd7\\xf7", rsNonCharRange = "\\x00-\\x2f\\x3a-\\x40\\x5b-\\x60\\x7b-\\xbf", rsPunctuationRange = "\\u2000-\\u206f", rsSpaceRange = " \\t\\x0b\\f\\xa0\\ufeff\\n\\r\\u2028\\u2029\\u1680\\u180e\\u2000\\u2001\\u2002\\u2003\\u2004\\u2005\\u2006\\u2007\\u2008\\u2009\\u200a\\u202f\\u205f\\u3000", rsUpperRange = "A-Z\\xc0-\\xd6\\xd8-\\xde", rsVarRange = "\\ufe0e\\ufe0f", rsBreakRange = rsMathOpRange + rsNonCharRange + rsPunctuationRange + rsSpaceRange;
        var rsApos = "['\u2019]", rsAstral = "[" + rsAstralRange + "]", rsBreak = "[" + rsBreakRange + "]", rsCombo = "[" + rsComboRange + "]", rsDigits = "\\d+", rsDingbat = "[" + rsDingbatRange + "]", rsLower = "[" + rsLowerRange + "]", rsMisc = "[^" + rsAstralRange + rsBreakRange + rsDigits + rsDingbatRange + rsLowerRange + rsUpperRange + "]", rsFitz = "\\ud83c[\\udffb-\\udfff]", rsModifier = "(?:" + rsCombo + "|" + rsFitz + ")", rsNonAstral = "[^" + rsAstralRange + "]", rsRegional = "(?:\\ud83c[\\udde6-\\uddff]){2}", rsSurrPair = "[\\ud800-\\udbff][\\udc00-\\udfff]", rsUpper = "[" + rsUpperRange + "]", rsZWJ = "\\u200d";
        var rsMiscLower = "(?:" + rsLower + "|" + rsMisc + ")", rsMiscUpper = "(?:" + rsUpper + "|" + rsMisc + ")", rsOptContrLower = "(?:" + rsApos + "(?:d|ll|m|re|s|t|ve))?", rsOptContrUpper = "(?:" + rsApos + "(?:D|LL|M|RE|S|T|VE))?", reOptMod = rsModifier + "?", rsOptVar = "[" + rsVarRange + "]?", rsOptJoin = "(?:" + rsZWJ + "(?:" + [rsNonAstral, rsRegional, rsSurrPair].join("|") + ")" + rsOptVar + reOptMod + ")*", rsOrdLower = "\\d*(?:1st|2nd|3rd|(?![123])\\dth)(?=\\b|[A-Z_])", rsOrdUpper = "\\d*(?:1ST|2ND|3RD|(?![123])\\dTH)(?=\\b|[a-z_])", rsSeq = rsOptVar + reOptMod + rsOptJoin, rsEmoji = "(?:" + [rsDingbat, rsRegional, rsSurrPair].join("|") + ")" + rsSeq, rsSymbol = "(?:" + [rsNonAstral + rsCombo + "?", rsCombo, rsRegional, rsSurrPair, rsAstral].join("|") + ")";
        var reApos = RegExp(rsApos, "g");
        var reComboMark = RegExp(rsCombo, "g");
        var reUnicode = RegExp(rsFitz + "(?=" + rsFitz + ")|" + rsSymbol + rsSeq, "g");
        var reUnicodeWord = RegExp([
          rsUpper + "?" + rsLower + "+" + rsOptContrLower + "(?=" + [rsBreak, rsUpper, "$"].join("|") + ")",
          rsMiscUpper + "+" + rsOptContrUpper + "(?=" + [rsBreak, rsUpper + rsMiscLower, "$"].join("|") + ")",
          rsUpper + "?" + rsMiscLower + "+" + rsOptContrLower,
          rsUpper + "+" + rsOptContrUpper,
          rsOrdUpper,
          rsOrdLower,
          rsDigits,
          rsEmoji
        ].join("|"), "g");
        var reHasUnicode = RegExp("[" + rsZWJ + rsAstralRange + rsComboRange + rsVarRange + "]");
        var reHasUnicodeWord = /[a-z][A-Z]|[A-Z]{2}[a-z]|[0-9][a-zA-Z]|[a-zA-Z][0-9]|[^a-zA-Z0-9 ]/;
        var contextProps = [
          "Array",
          "Buffer",
          "DataView",
          "Date",
          "Error",
          "Float32Array",
          "Float64Array",
          "Function",
          "Int8Array",
          "Int16Array",
          "Int32Array",
          "Map",
          "Math",
          "Object",
          "Promise",
          "RegExp",
          "Set",
          "String",
          "Symbol",
          "TypeError",
          "Uint8Array",
          "Uint8ClampedArray",
          "Uint16Array",
          "Uint32Array",
          "WeakMap",
          "_",
          "clearTimeout",
          "isFinite",
          "parseInt",
          "setTimeout"
        ];
        var templateCounter = -1;
        var typedArrayTags = {};
        typedArrayTags[float32Tag] = typedArrayTags[float64Tag] = typedArrayTags[int8Tag] = typedArrayTags[int16Tag] = typedArrayTags[int32Tag] = typedArrayTags[uint8Tag] = typedArrayTags[uint8ClampedTag] = typedArrayTags[uint16Tag] = typedArrayTags[uint32Tag] = true;
        typedArrayTags[argsTag] = typedArrayTags[arrayTag] = typedArrayTags[arrayBufferTag] = typedArrayTags[boolTag] = typedArrayTags[dataViewTag] = typedArrayTags[dateTag] = typedArrayTags[errorTag] = typedArrayTags[funcTag] = typedArrayTags[mapTag] = typedArrayTags[numberTag] = typedArrayTags[objectTag] = typedArrayTags[regexpTag] = typedArrayTags[setTag] = typedArrayTags[stringTag] = typedArrayTags[weakMapTag] = false;
        var cloneableTags = {};
        cloneableTags[argsTag] = cloneableTags[arrayTag] = cloneableTags[arrayBufferTag] = cloneableTags[dataViewTag] = cloneableTags[boolTag] = cloneableTags[dateTag] = cloneableTags[float32Tag] = cloneableTags[float64Tag] = cloneableTags[int8Tag] = cloneableTags[int16Tag] = cloneableTags[int32Tag] = cloneableTags[mapTag] = cloneableTags[numberTag] = cloneableTags[objectTag] = cloneableTags[regexpTag] = cloneableTags[setTag] = cloneableTags[stringTag] = cloneableTags[symbolTag] = cloneableTags[uint8Tag] = cloneableTags[uint8ClampedTag] = cloneableTags[uint16Tag] = cloneableTags[uint32Tag] = true;
        cloneableTags[errorTag] = cloneableTags[funcTag] = cloneableTags[weakMapTag] = false;
        var deburredLetters = {
          "\xC0": "A",
          "\xC1": "A",
          "\xC2": "A",
          "\xC3": "A",
          "\xC4": "A",
          "\xC5": "A",
          "\xE0": "a",
          "\xE1": "a",
          "\xE2": "a",
          "\xE3": "a",
          "\xE4": "a",
          "\xE5": "a",
          "\xC7": "C",
          "\xE7": "c",
          "\xD0": "D",
          "\xF0": "d",
          "\xC8": "E",
          "\xC9": "E",
          "\xCA": "E",
          "\xCB": "E",
          "\xE8": "e",
          "\xE9": "e",
          "\xEA": "e",
          "\xEB": "e",
          "\xCC": "I",
          "\xCD": "I",
          "\xCE": "I",
          "\xCF": "I",
          "\xEC": "i",
          "\xED": "i",
          "\xEE": "i",
          "\xEF": "i",
          "\xD1": "N",
          "\xF1": "n",
          "\xD2": "O",
          "\xD3": "O",
          "\xD4": "O",
          "\xD5": "O",
          "\xD6": "O",
          "\xD8": "O",
          "\xF2": "o",
          "\xF3": "o",
          "\xF4": "o",
          "\xF5": "o",
          "\xF6": "o",
          "\xF8": "o",
          "\xD9": "U",
          "\xDA": "U",
          "\xDB": "U",
          "\xDC": "U",
          "\xF9": "u",
          "\xFA": "u",
          "\xFB": "u",
          "\xFC": "u",
          "\xDD": "Y",
          "\xFD": "y",
          "\xFF": "y",
          "\xC6": "Ae",
          "\xE6": "ae",
          "\xDE": "Th",
          "\xFE": "th",
          "\xDF": "ss",
          "\u0100": "A",
          "\u0102": "A",
          "\u0104": "A",
          "\u0101": "a",
          "\u0103": "a",
          "\u0105": "a",
          "\u0106": "C",
          "\u0108": "C",
          "\u010A": "C",
          "\u010C": "C",
          "\u0107": "c",
          "\u0109": "c",
          "\u010B": "c",
          "\u010D": "c",
          "\u010E": "D",
          "\u0110": "D",
          "\u010F": "d",
          "\u0111": "d",
          "\u0112": "E",
          "\u0114": "E",
          "\u0116": "E",
          "\u0118": "E",
          "\u011A": "E",
          "\u0113": "e",
          "\u0115": "e",
          "\u0117": "e",
          "\u0119": "e",
          "\u011B": "e",
          "\u011C": "G",
          "\u011E": "G",
          "\u0120": "G",
          "\u0122": "G",
          "\u011D": "g",
          "\u011F": "g",
          "\u0121": "g",
          "\u0123": "g",
          "\u0124": "H",
          "\u0126": "H",
          "\u0125": "h",
          "\u0127": "h",
          "\u0128": "I",
          "\u012A": "I",
          "\u012C": "I",
          "\u012E": "I",
          "\u0130": "I",
          "\u0129": "i",
          "\u012B": "i",
          "\u012D": "i",
          "\u012F": "i",
          "\u0131": "i",
          "\u0134": "J",
          "\u0135": "j",
          "\u0136": "K",
          "\u0137": "k",
          "\u0138": "k",
          "\u0139": "L",
          "\u013B": "L",
          "\u013D": "L",
          "\u013F": "L",
          "\u0141": "L",
          "\u013A": "l",
          "\u013C": "l",
          "\u013E": "l",
          "\u0140": "l",
          "\u0142": "l",
          "\u0143": "N",
          "\u0145": "N",
          "\u0147": "N",
          "\u014A": "N",
          "\u0144": "n",
          "\u0146": "n",
          "\u0148": "n",
          "\u014B": "n",
          "\u014C": "O",
          "\u014E": "O",
          "\u0150": "O",
          "\u014D": "o",
          "\u014F": "o",
          "\u0151": "o",
          "\u0154": "R",
          "\u0156": "R",
          "\u0158": "R",
          "\u0155": "r",
          "\u0157": "r",
          "\u0159": "r",
          "\u015A": "S",
          "\u015C": "S",
          "\u015E": "S",
          "\u0160": "S",
          "\u015B": "s",
          "\u015D": "s",
          "\u015F": "s",
          "\u0161": "s",
          "\u0162": "T",
          "\u0164": "T",
          "\u0166": "T",
          "\u0163": "t",
          "\u0165": "t",
          "\u0167": "t",
          "\u0168": "U",
          "\u016A": "U",
          "\u016C": "U",
          "\u016E": "U",
          "\u0170": "U",
          "\u0172": "U",
          "\u0169": "u",
          "\u016B": "u",
          "\u016D": "u",
          "\u016F": "u",
          "\u0171": "u",
          "\u0173": "u",
          "\u0174": "W",
          "\u0175": "w",
          "\u0176": "Y",
          "\u0177": "y",
          "\u0178": "Y",
          "\u0179": "Z",
          "\u017B": "Z",
          "\u017D": "Z",
          "\u017A": "z",
          "\u017C": "z",
          "\u017E": "z",
          "\u0132": "IJ",
          "\u0133": "ij",
          "\u0152": "Oe",
          "\u0153": "oe",
          "\u0149": "'n",
          "\u017F": "s"
        };
        var htmlEscapes = {
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;"
        };
        var htmlUnescapes = {
          "&amp;": "&",
          "&lt;": "<",
          "&gt;": ">",
          "&quot;": '"',
          "&#39;": "'"
        };
        var stringEscapes = {
          "\\": "\\",
          "'": "'",
          "\n": "n",
          "\r": "r",
          "\u2028": "u2028",
          "\u2029": "u2029"
        };
        var freeParseFloat = parseFloat, freeParseInt = parseInt;
        var freeGlobal = typeof global == "object" && global && global.Object === Object && global;
        var freeSelf = typeof self == "object" && self && self.Object === Object && self;
        var root = freeGlobal || freeSelf || Function("return this")();
        var freeExports = typeof exports == "object" && exports && !exports.nodeType && exports;
        var freeModule = freeExports && typeof module == "object" && module && !module.nodeType && module;
        var moduleExports = freeModule && freeModule.exports === freeExports;
        var freeProcess = moduleExports && freeGlobal.process;
        var nodeUtil = function() {
          try {
            var types = freeModule && freeModule.require && freeModule.require("util").types;
            if (types) {
              return types;
            }
            return freeProcess && freeProcess.binding && freeProcess.binding("util");
          } catch (e) {
          }
        }();
        var nodeIsArrayBuffer = nodeUtil && nodeUtil.isArrayBuffer, nodeIsDate = nodeUtil && nodeUtil.isDate, nodeIsMap = nodeUtil && nodeUtil.isMap, nodeIsRegExp = nodeUtil && nodeUtil.isRegExp, nodeIsSet = nodeUtil && nodeUtil.isSet, nodeIsTypedArray = nodeUtil && nodeUtil.isTypedArray;
        function apply(func, thisArg, args) {
          switch (args.length) {
            case 0:
              return func.call(thisArg);
            case 1:
              return func.call(thisArg, args[0]);
            case 2:
              return func.call(thisArg, args[0], args[1]);
            case 3:
              return func.call(thisArg, args[0], args[1], args[2]);
          }
          return func.apply(thisArg, args);
        }
        function arrayAggregator(array, setter, iteratee, accumulator) {
          var index = -1, length2 = array == null ? 0 : array.length;
          while (++index < length2) {
            var value2 = array[index];
            setter(accumulator, value2, iteratee(value2), array);
          }
          return accumulator;
        }
        function arrayEach(array, iteratee) {
          var index = -1, length2 = array == null ? 0 : array.length;
          while (++index < length2) {
            if (iteratee(array[index], index, array) === false) {
              break;
            }
          }
          return array;
        }
        function arrayEachRight(array, iteratee) {
          var length2 = array == null ? 0 : array.length;
          while (length2--) {
            if (iteratee(array[length2], length2, array) === false) {
              break;
            }
          }
          return array;
        }
        function arrayEvery(array, predicate) {
          var index = -1, length2 = array == null ? 0 : array.length;
          while (++index < length2) {
            if (!predicate(array[index], index, array)) {
              return false;
            }
          }
          return true;
        }
        function arrayFilter(array, predicate) {
          var index = -1, length2 = array == null ? 0 : array.length, resIndex = 0, result = [];
          while (++index < length2) {
            var value2 = array[index];
            if (predicate(value2, index, array)) {
              result[resIndex++] = value2;
            }
          }
          return result;
        }
        function arrayIncludes(array, value2) {
          var length2 = array == null ? 0 : array.length;
          return !!length2 && baseIndexOf(array, value2, 0) > -1;
        }
        function arrayIncludesWith(array, value2, comparator) {
          var index = -1, length2 = array == null ? 0 : array.length;
          while (++index < length2) {
            if (comparator(value2, array[index])) {
              return true;
            }
          }
          return false;
        }
        function arrayMap(array, iteratee) {
          var index = -1, length2 = array == null ? 0 : array.length, result = Array(length2);
          while (++index < length2) {
            result[index] = iteratee(array[index], index, array);
          }
          return result;
        }
        function arrayPush(array, values) {
          var index = -1, length2 = values.length, offset = array.length;
          while (++index < length2) {
            array[offset + index] = values[index];
          }
          return array;
        }
        function arrayReduce(array, iteratee, accumulator, initAccum) {
          var index = -1, length2 = array == null ? 0 : array.length;
          if (initAccum && length2) {
            accumulator = array[++index];
          }
          while (++index < length2) {
            accumulator = iteratee(accumulator, array[index], index, array);
          }
          return accumulator;
        }
        function arrayReduceRight(array, iteratee, accumulator, initAccum) {
          var length2 = array == null ? 0 : array.length;
          if (initAccum && length2) {
            accumulator = array[--length2];
          }
          while (length2--) {
            accumulator = iteratee(accumulator, array[length2], length2, array);
          }
          return accumulator;
        }
        function arraySome(array, predicate) {
          var index = -1, length2 = array == null ? 0 : array.length;
          while (++index < length2) {
            if (predicate(array[index], index, array)) {
              return true;
            }
          }
          return false;
        }
        var asciiSize = baseProperty("length");
        function asciiToArray(string) {
          return string.split("");
        }
        function asciiWords(string) {
          return string.match(reAsciiWord) || [];
        }
        function baseFindKey(collection, predicate, eachFunc) {
          var result;
          eachFunc(collection, function(value2, key, collection2) {
            if (predicate(value2, key, collection2)) {
              result = key;
              return false;
            }
          });
          return result;
        }
        function baseFindIndex(array, predicate, fromIndex, fromRight) {
          var length2 = array.length, index = fromIndex + (fromRight ? 1 : -1);
          while (fromRight ? index-- : ++index < length2) {
            if (predicate(array[index], index, array)) {
              return index;
            }
          }
          return -1;
        }
        function baseIndexOf(array, value2, fromIndex) {
          return value2 === value2 ? strictIndexOf(array, value2, fromIndex) : baseFindIndex(array, baseIsNaN, fromIndex);
        }
        function baseIndexOfWith(array, value2, fromIndex, comparator) {
          var index = fromIndex - 1, length2 = array.length;
          while (++index < length2) {
            if (comparator(array[index], value2)) {
              return index;
            }
          }
          return -1;
        }
        function baseIsNaN(value2) {
          return value2 !== value2;
        }
        function baseMean(array, iteratee) {
          var length2 = array == null ? 0 : array.length;
          return length2 ? baseSum(array, iteratee) / length2 : NAN;
        }
        function baseProperty(key) {
          return function(object) {
            return object == null ? undefined2 : object[key];
          };
        }
        function basePropertyOf(object) {
          return function(key) {
            return object == null ? undefined2 : object[key];
          };
        }
        function baseReduce(collection, iteratee, accumulator, initAccum, eachFunc) {
          eachFunc(collection, function(value2, index, collection2) {
            accumulator = initAccum ? (initAccum = false, value2) : iteratee(accumulator, value2, index, collection2);
          });
          return accumulator;
        }
        function baseSortBy(array, comparer) {
          var length2 = array.length;
          array.sort(comparer);
          while (length2--) {
            array[length2] = array[length2].value;
          }
          return array;
        }
        function baseSum(array, iteratee) {
          var result, index = -1, length2 = array.length;
          while (++index < length2) {
            var current = iteratee(array[index]);
            if (current !== undefined2) {
              result = result === undefined2 ? current : result + current;
            }
          }
          return result;
        }
        function baseTimes(n, iteratee) {
          var index = -1, result = Array(n);
          while (++index < n) {
            result[index] = iteratee(index);
          }
          return result;
        }
        function baseToPairs(object, props) {
          return arrayMap(props, function(key) {
            return [key, object[key]];
          });
        }
        function baseTrim(string) {
          return string ? string.slice(0, trimmedEndIndex(string) + 1).replace(reTrimStart, "") : string;
        }
        function baseUnary(func) {
          return function(value2) {
            return func(value2);
          };
        }
        function baseValues(object, props) {
          return arrayMap(props, function(key) {
            return object[key];
          });
        }
        function cacheHas(cache2, key) {
          return cache2.has(key);
        }
        function charsStartIndex(strSymbols, chrSymbols) {
          var index = -1, length2 = strSymbols.length;
          while (++index < length2 && baseIndexOf(chrSymbols, strSymbols[index], 0) > -1) {
          }
          return index;
        }
        function charsEndIndex(strSymbols, chrSymbols) {
          var index = strSymbols.length;
          while (index-- && baseIndexOf(chrSymbols, strSymbols[index], 0) > -1) {
          }
          return index;
        }
        function countHolders(array, placeholder) {
          var length2 = array.length, result = 0;
          while (length2--) {
            if (array[length2] === placeholder) {
              ++result;
            }
          }
          return result;
        }
        var deburrLetter = basePropertyOf(deburredLetters);
        var escapeHtmlChar = basePropertyOf(htmlEscapes);
        function escapeStringChar(chr) {
          return "\\" + stringEscapes[chr];
        }
        function getValue(object, key) {
          return object == null ? undefined2 : object[key];
        }
        function hasUnicode(string) {
          return reHasUnicode.test(string);
        }
        function hasUnicodeWord(string) {
          return reHasUnicodeWord.test(string);
        }
        function iteratorToArray(iterator) {
          var data, result = [];
          while (!(data = iterator.next()).done) {
            result.push(data.value);
          }
          return result;
        }
        function mapToArray(map2) {
          var index = -1, result = Array(map2.size);
          map2.forEach(function(value2, key) {
            result[++index] = [key, value2];
          });
          return result;
        }
        function overArg(func, transform) {
          return function(arg) {
            return func(transform(arg));
          };
        }
        function replaceHolders(array, placeholder) {
          var index = -1, length2 = array.length, resIndex = 0, result = [];
          while (++index < length2) {
            var value2 = array[index];
            if (value2 === placeholder || value2 === PLACEHOLDER) {
              array[index] = PLACEHOLDER;
              result[resIndex++] = index;
            }
          }
          return result;
        }
        function setToArray(set) {
          var index = -1, result = Array(set.size);
          set.forEach(function(value2) {
            result[++index] = value2;
          });
          return result;
        }
        function setToPairs(set) {
          var index = -1, result = Array(set.size);
          set.forEach(function(value2) {
            result[++index] = [value2, value2];
          });
          return result;
        }
        function strictIndexOf(array, value2, fromIndex) {
          var index = fromIndex - 1, length2 = array.length;
          while (++index < length2) {
            if (array[index] === value2) {
              return index;
            }
          }
          return -1;
        }
        function strictLastIndexOf(array, value2, fromIndex) {
          var index = fromIndex + 1;
          while (index--) {
            if (array[index] === value2) {
              return index;
            }
          }
          return index;
        }
        function stringSize(string) {
          return hasUnicode(string) ? unicodeSize(string) : asciiSize(string);
        }
        function stringToArray(string) {
          return hasUnicode(string) ? unicodeToArray(string) : asciiToArray(string);
        }
        function trimmedEndIndex(string) {
          var index = string.length;
          while (index-- && reWhitespace.test(string.charAt(index))) {
          }
          return index;
        }
        var unescapeHtmlChar = basePropertyOf(htmlUnescapes);
        function unicodeSize(string) {
          var result = reUnicode.lastIndex = 0;
          while (reUnicode.test(string)) {
            ++result;
          }
          return result;
        }
        function unicodeToArray(string) {
          return string.match(reUnicode) || [];
        }
        function unicodeWords(string) {
          return string.match(reUnicodeWord) || [];
        }
        var runInContext = function runInContext2(context) {
          context = context == null ? root : _2.defaults(root.Object(), context, _2.pick(root, contextProps));
          var Array2 = context.Array, Date2 = context.Date, Error2 = context.Error, Function2 = context.Function, Math2 = context.Math, Object2 = context.Object, RegExp2 = context.RegExp, String2 = context.String, TypeError2 = context.TypeError;
          var arrayProto = Array2.prototype, funcProto = Function2.prototype, objectProto = Object2.prototype;
          var coreJsData = context["__core-js_shared__"];
          var funcToString = funcProto.toString;
          var hasOwnProperty2 = objectProto.hasOwnProperty;
          var idCounter = 0;
          var maskSrcKey = function() {
            var uid = /[^.]+$/.exec(coreJsData && coreJsData.keys && coreJsData.keys.IE_PROTO || "");
            return uid ? "Symbol(src)_1." + uid : "";
          }();
          var nativeObjectToString = objectProto.toString;
          var objectCtorString = funcToString.call(Object2);
          var oldDash = root._;
          var reIsNative = RegExp2(
            "^" + funcToString.call(hasOwnProperty2).replace(reRegExpChar, "\\$&").replace(/hasOwnProperty|(function).*?(?=\\\()| for .+?(?=\\\])/g, "$1.*?") + "$"
          );
          var Buffer2 = moduleExports ? context.Buffer : undefined2, Symbol2 = context.Symbol, Uint8Array2 = context.Uint8Array, allocUnsafe = Buffer2 ? Buffer2.allocUnsafe : undefined2, getPrototype = overArg(Object2.getPrototypeOf, Object2), objectCreate = Object2.create, propertyIsEnumerable = objectProto.propertyIsEnumerable, splice = arrayProto.splice, spreadableSymbol = Symbol2 ? Symbol2.isConcatSpreadable : undefined2, symIterator = Symbol2 ? Symbol2.iterator : undefined2, symToStringTag = Symbol2 ? Symbol2.toStringTag : undefined2;
          var defineProperty = function() {
            try {
              var func = getNative(Object2, "defineProperty");
              func({}, "", {});
              return func;
            } catch (e) {
            }
          }();
          var ctxClearTimeout = context.clearTimeout !== root.clearTimeout && context.clearTimeout, ctxNow = Date2 && Date2.now !== root.Date.now && Date2.now, ctxSetTimeout = context.setTimeout !== root.setTimeout && context.setTimeout;
          var nativeCeil = Math2.ceil, nativeFloor = Math2.floor, nativeGetSymbols = Object2.getOwnPropertySymbols, nativeIsBuffer = Buffer2 ? Buffer2.isBuffer : undefined2, nativeIsFinite = context.isFinite, nativeJoin = arrayProto.join, nativeKeys = overArg(Object2.keys, Object2), nativeMax = Math2.max, nativeMin = Math2.min, nativeNow = Date2.now, nativeParseInt = context.parseInt, nativeRandom = Math2.random, nativeReverse = arrayProto.reverse;
          var DataView2 = getNative(context, "DataView"), Map2 = getNative(context, "Map"), Promise2 = getNative(context, "Promise"), Set2 = getNative(context, "Set"), WeakMap = getNative(context, "WeakMap"), nativeCreate = getNative(Object2, "create");
          var metaMap = WeakMap && new WeakMap();
          var realNames = {};
          var dataViewCtorString = toSource(DataView2), mapCtorString = toSource(Map2), promiseCtorString = toSource(Promise2), setCtorString = toSource(Set2), weakMapCtorString = toSource(WeakMap);
          var symbolProto = Symbol2 ? Symbol2.prototype : undefined2, symbolValueOf = symbolProto ? symbolProto.valueOf : undefined2, symbolToString = symbolProto ? symbolProto.toString : undefined2;
          function lodash(value2) {
            if (isObjectLike(value2) && !isArray2(value2) && !(value2 instanceof LazyWrapper)) {
              if (value2 instanceof LodashWrapper) {
                return value2;
              }
              if (hasOwnProperty2.call(value2, "__wrapped__")) {
                return wrapperClone(value2);
              }
            }
            return new LodashWrapper(value2);
          }
          var baseCreate = function() {
            function object() {
            }
            return function(proto) {
              if (!isObject3(proto)) {
                return {};
              }
              if (objectCreate) {
                return objectCreate(proto);
              }
              object.prototype = proto;
              var result2 = new object();
              object.prototype = undefined2;
              return result2;
            };
          }();
          function baseLodash() {
          }
          function LodashWrapper(value2, chainAll) {
            this.__wrapped__ = value2;
            this.__actions__ = [];
            this.__chain__ = !!chainAll;
            this.__index__ = 0;
            this.__values__ = undefined2;
          }
          lodash.templateSettings = {
            "escape": reEscape,
            "evaluate": reEvaluate,
            "interpolate": reInterpolate,
            "variable": "",
            "imports": {
              "_": lodash
            }
          };
          lodash.prototype = baseLodash.prototype;
          lodash.prototype.constructor = lodash;
          LodashWrapper.prototype = baseCreate(baseLodash.prototype);
          LodashWrapper.prototype.constructor = LodashWrapper;
          function LazyWrapper(value2) {
            this.__wrapped__ = value2;
            this.__actions__ = [];
            this.__dir__ = 1;
            this.__filtered__ = false;
            this.__iteratees__ = [];
            this.__takeCount__ = MAX_ARRAY_LENGTH;
            this.__views__ = [];
          }
          function lazyClone() {
            var result2 = new LazyWrapper(this.__wrapped__);
            result2.__actions__ = copyArray(this.__actions__);
            result2.__dir__ = this.__dir__;
            result2.__filtered__ = this.__filtered__;
            result2.__iteratees__ = copyArray(this.__iteratees__);
            result2.__takeCount__ = this.__takeCount__;
            result2.__views__ = copyArray(this.__views__);
            return result2;
          }
          function lazyReverse() {
            if (this.__filtered__) {
              var result2 = new LazyWrapper(this);
              result2.__dir__ = -1;
              result2.__filtered__ = true;
            } else {
              result2 = this.clone();
              result2.__dir__ *= -1;
            }
            return result2;
          }
          function lazyValue() {
            var array = this.__wrapped__.value(), dir = this.__dir__, isArr = isArray2(array), isRight = dir < 0, arrLength = isArr ? array.length : 0, view = getView(0, arrLength, this.__views__), start = view.start, end = view.end, length2 = end - start, index = isRight ? end : start - 1, iteratees = this.__iteratees__, iterLength = iteratees.length, resIndex = 0, takeCount = nativeMin(length2, this.__takeCount__);
            if (!isArr || !isRight && arrLength == length2 && takeCount == length2) {
              return baseWrapperValue(array, this.__actions__);
            }
            var result2 = [];
            outer:
              while (length2-- && resIndex < takeCount) {
                index += dir;
                var iterIndex = -1, value2 = array[index];
                while (++iterIndex < iterLength) {
                  var data = iteratees[iterIndex], iteratee2 = data.iteratee, type = data.type, computed = iteratee2(value2);
                  if (type == LAZY_MAP_FLAG) {
                    value2 = computed;
                  } else if (!computed) {
                    if (type == LAZY_FILTER_FLAG) {
                      continue outer;
                    } else {
                      break outer;
                    }
                  }
                }
                result2[resIndex++] = value2;
              }
            return result2;
          }
          LazyWrapper.prototype = baseCreate(baseLodash.prototype);
          LazyWrapper.prototype.constructor = LazyWrapper;
          function Hash(entries) {
            var index = -1, length2 = entries == null ? 0 : entries.length;
            this.clear();
            while (++index < length2) {
              var entry = entries[index];
              this.set(entry[0], entry[1]);
            }
          }
          function hashClear() {
            this.__data__ = nativeCreate ? nativeCreate(null) : {};
            this.size = 0;
          }
          function hashDelete(key) {
            var result2 = this.has(key) && delete this.__data__[key];
            this.size -= result2 ? 1 : 0;
            return result2;
          }
          function hashGet(key) {
            var data = this.__data__;
            if (nativeCreate) {
              var result2 = data[key];
              return result2 === HASH_UNDEFINED ? undefined2 : result2;
            }
            return hasOwnProperty2.call(data, key) ? data[key] : undefined2;
          }
          function hashHas(key) {
            var data = this.__data__;
            return nativeCreate ? data[key] !== undefined2 : hasOwnProperty2.call(data, key);
          }
          function hashSet(key, value2) {
            var data = this.__data__;
            this.size += this.has(key) ? 0 : 1;
            data[key] = nativeCreate && value2 === undefined2 ? HASH_UNDEFINED : value2;
            return this;
          }
          Hash.prototype.clear = hashClear;
          Hash.prototype["delete"] = hashDelete;
          Hash.prototype.get = hashGet;
          Hash.prototype.has = hashHas;
          Hash.prototype.set = hashSet;
          function ListCache(entries) {
            var index = -1, length2 = entries == null ? 0 : entries.length;
            this.clear();
            while (++index < length2) {
              var entry = entries[index];
              this.set(entry[0], entry[1]);
            }
          }
          function listCacheClear() {
            this.__data__ = [];
            this.size = 0;
          }
          function listCacheDelete(key) {
            var data = this.__data__, index = assocIndexOf(data, key);
            if (index < 0) {
              return false;
            }
            var lastIndex = data.length - 1;
            if (index == lastIndex) {
              data.pop();
            } else {
              splice.call(data, index, 1);
            }
            --this.size;
            return true;
          }
          function listCacheGet(key) {
            var data = this.__data__, index = assocIndexOf(data, key);
            return index < 0 ? undefined2 : data[index][1];
          }
          function listCacheHas(key) {
            return assocIndexOf(this.__data__, key) > -1;
          }
          function listCacheSet(key, value2) {
            var data = this.__data__, index = assocIndexOf(data, key);
            if (index < 0) {
              ++this.size;
              data.push([key, value2]);
            } else {
              data[index][1] = value2;
            }
            return this;
          }
          ListCache.prototype.clear = listCacheClear;
          ListCache.prototype["delete"] = listCacheDelete;
          ListCache.prototype.get = listCacheGet;
          ListCache.prototype.has = listCacheHas;
          ListCache.prototype.set = listCacheSet;
          function MapCache(entries) {
            var index = -1, length2 = entries == null ? 0 : entries.length;
            this.clear();
            while (++index < length2) {
              var entry = entries[index];
              this.set(entry[0], entry[1]);
            }
          }
          function mapCacheClear() {
            this.size = 0;
            this.__data__ = {
              "hash": new Hash(),
              "map": new (Map2 || ListCache)(),
              "string": new Hash()
            };
          }
          function mapCacheDelete(key) {
            var result2 = getMapData(this, key)["delete"](key);
            this.size -= result2 ? 1 : 0;
            return result2;
          }
          function mapCacheGet(key) {
            return getMapData(this, key).get(key);
          }
          function mapCacheHas(key) {
            return getMapData(this, key).has(key);
          }
          function mapCacheSet(key, value2) {
            var data = getMapData(this, key), size2 = data.size;
            data.set(key, value2);
            this.size += data.size == size2 ? 0 : 1;
            return this;
          }
          MapCache.prototype.clear = mapCacheClear;
          MapCache.prototype["delete"] = mapCacheDelete;
          MapCache.prototype.get = mapCacheGet;
          MapCache.prototype.has = mapCacheHas;
          MapCache.prototype.set = mapCacheSet;
          function SetCache(values2) {
            var index = -1, length2 = values2 == null ? 0 : values2.length;
            this.__data__ = new MapCache();
            while (++index < length2) {
              this.add(values2[index]);
            }
          }
          function setCacheAdd(value2) {
            this.__data__.set(value2, HASH_UNDEFINED);
            return this;
          }
          function setCacheHas(value2) {
            return this.__data__.has(value2);
          }
          SetCache.prototype.add = SetCache.prototype.push = setCacheAdd;
          SetCache.prototype.has = setCacheHas;
          function Stack(entries) {
            var data = this.__data__ = new ListCache(entries);
            this.size = data.size;
          }
          function stackClear() {
            this.__data__ = new ListCache();
            this.size = 0;
          }
          function stackDelete(key) {
            var data = this.__data__, result2 = data["delete"](key);
            this.size = data.size;
            return result2;
          }
          function stackGet(key) {
            return this.__data__.get(key);
          }
          function stackHas(key) {
            return this.__data__.has(key);
          }
          function stackSet(key, value2) {
            var data = this.__data__;
            if (data instanceof ListCache) {
              var pairs = data.__data__;
              if (!Map2 || pairs.length < LARGE_ARRAY_SIZE - 1) {
                pairs.push([key, value2]);
                this.size = ++data.size;
                return this;
              }
              data = this.__data__ = new MapCache(pairs);
            }
            data.set(key, value2);
            this.size = data.size;
            return this;
          }
          Stack.prototype.clear = stackClear;
          Stack.prototype["delete"] = stackDelete;
          Stack.prototype.get = stackGet;
          Stack.prototype.has = stackHas;
          Stack.prototype.set = stackSet;
          function arrayLikeKeys(value2, inherited) {
            var isArr = isArray2(value2), isArg = !isArr && isArguments(value2), isBuff = !isArr && !isArg && isBuffer2(value2), isType = !isArr && !isArg && !isBuff && isTypedArray2(value2), skipIndexes = isArr || isArg || isBuff || isType, result2 = skipIndexes ? baseTimes(value2.length, String2) : [], length2 = result2.length;
            for (var key in value2) {
              if ((inherited || hasOwnProperty2.call(value2, key)) && !(skipIndexes && (key == "length" || isBuff && (key == "offset" || key == "parent") || isType && (key == "buffer" || key == "byteLength" || key == "byteOffset") || isIndex(key, length2)))) {
                result2.push(key);
              }
            }
            return result2;
          }
          function arraySample(array) {
            var length2 = array.length;
            return length2 ? array[baseRandom(0, length2 - 1)] : undefined2;
          }
          function arraySampleSize(array, n) {
            return shuffleSelf(copyArray(array), baseClamp(n, 0, array.length));
          }
          function arrayShuffle(array) {
            return shuffleSelf(copyArray(array));
          }
          function assignMergeValue(object, key, value2) {
            if (value2 !== undefined2 && !eq(object[key], value2) || value2 === undefined2 && !(key in object)) {
              baseAssignValue(object, key, value2);
            }
          }
          function assignValue(object, key, value2) {
            var objValue = object[key];
            if (!(hasOwnProperty2.call(object, key) && eq(objValue, value2)) || value2 === undefined2 && !(key in object)) {
              baseAssignValue(object, key, value2);
            }
          }
          function assocIndexOf(array, key) {
            var length2 = array.length;
            while (length2--) {
              if (eq(array[length2][0], key)) {
                return length2;
              }
            }
            return -1;
          }
          function baseAggregator(collection, setter, iteratee2, accumulator) {
            baseEach(collection, function(value2, key, collection2) {
              setter(accumulator, value2, iteratee2(value2), collection2);
            });
            return accumulator;
          }
          function baseAssign(object, source) {
            return object && copyObject(source, keys(source), object);
          }
          function baseAssignIn(object, source) {
            return object && copyObject(source, keysIn(source), object);
          }
          function baseAssignValue(object, key, value2) {
            if (key == "__proto__" && defineProperty) {
              defineProperty(object, key, {
                "configurable": true,
                "enumerable": true,
                "value": value2,
                "writable": true
              });
            } else {
              object[key] = value2;
            }
          }
          function baseAt(object, paths) {
            var index = -1, length2 = paths.length, result2 = Array2(length2), skip = object == null;
            while (++index < length2) {
              result2[index] = skip ? undefined2 : get(object, paths[index]);
            }
            return result2;
          }
          function baseClamp(number, lower, upper) {
            if (number === number) {
              if (upper !== undefined2) {
                number = number <= upper ? number : upper;
              }
              if (lower !== undefined2) {
                number = number >= lower ? number : lower;
              }
            }
            return number;
          }
          function baseClone(value2, bitmask, customizer, key, object, stack) {
            var result2, isDeep = bitmask & CLONE_DEEP_FLAG, isFlat = bitmask & CLONE_FLAT_FLAG, isFull = bitmask & CLONE_SYMBOLS_FLAG;
            if (customizer) {
              result2 = object ? customizer(value2, key, object, stack) : customizer(value2);
            }
            if (result2 !== undefined2) {
              return result2;
            }
            if (!isObject3(value2)) {
              return value2;
            }
            var isArr = isArray2(value2);
            if (isArr) {
              result2 = initCloneArray(value2);
              if (!isDeep) {
                return copyArray(value2, result2);
              }
            } else {
              var tag = getTag(value2), isFunc = tag == funcTag || tag == genTag;
              if (isBuffer2(value2)) {
                return cloneBuffer(value2, isDeep);
              }
              if (tag == objectTag || tag == argsTag || isFunc && !object) {
                result2 = isFlat || isFunc ? {} : initCloneObject(value2);
                if (!isDeep) {
                  return isFlat ? copySymbolsIn(value2, baseAssignIn(result2, value2)) : copySymbols(value2, baseAssign(result2, value2));
                }
              } else {
                if (!cloneableTags[tag]) {
                  return object ? value2 : {};
                }
                result2 = initCloneByTag(value2, tag, isDeep);
              }
            }
            stack || (stack = new Stack());
            var stacked = stack.get(value2);
            if (stacked) {
              return stacked;
            }
            stack.set(value2, result2);
            if (isSet(value2)) {
              value2.forEach(function(subValue) {
                result2.add(baseClone(subValue, bitmask, customizer, subValue, value2, stack));
              });
            } else if (isMap(value2)) {
              value2.forEach(function(subValue, key2) {
                result2.set(key2, baseClone(subValue, bitmask, customizer, key2, value2, stack));
              });
            }
            var keysFunc = isFull ? isFlat ? getAllKeysIn : getAllKeys : isFlat ? keysIn : keys;
            var props = isArr ? undefined2 : keysFunc(value2);
            arrayEach(props || value2, function(subValue, key2) {
              if (props) {
                key2 = subValue;
                subValue = value2[key2];
              }
              assignValue(result2, key2, baseClone(subValue, bitmask, customizer, key2, value2, stack));
            });
            return result2;
          }
          function baseConforms(source) {
            var props = keys(source);
            return function(object) {
              return baseConformsTo(object, source, props);
            };
          }
          function baseConformsTo(object, source, props) {
            var length2 = props.length;
            if (object == null) {
              return !length2;
            }
            object = Object2(object);
            while (length2--) {
              var key = props[length2], predicate = source[key], value2 = object[key];
              if (value2 === undefined2 && !(key in object) || !predicate(value2)) {
                return false;
              }
            }
            return true;
          }
          function baseDelay(func, wait, args) {
            if (typeof func != "function") {
              throw new TypeError2(FUNC_ERROR_TEXT);
            }
            return setTimeout2(function() {
              func.apply(undefined2, args);
            }, wait);
          }
          function baseDifference(array, values2, iteratee2, comparator) {
            var index = -1, includes2 = arrayIncludes, isCommon = true, length2 = array.length, result2 = [], valuesLength = values2.length;
            if (!length2) {
              return result2;
            }
            if (iteratee2) {
              values2 = arrayMap(values2, baseUnary(iteratee2));
            }
            if (comparator) {
              includes2 = arrayIncludesWith;
              isCommon = false;
            } else if (values2.length >= LARGE_ARRAY_SIZE) {
              includes2 = cacheHas;
              isCommon = false;
              values2 = new SetCache(values2);
            }
            outer:
              while (++index < length2) {
                var value2 = array[index], computed = iteratee2 == null ? value2 : iteratee2(value2);
                value2 = comparator || value2 !== 0 ? value2 : 0;
                if (isCommon && computed === computed) {
                  var valuesIndex = valuesLength;
                  while (valuesIndex--) {
                    if (values2[valuesIndex] === computed) {
                      continue outer;
                    }
                  }
                  result2.push(value2);
                } else if (!includes2(values2, computed, comparator)) {
                  result2.push(value2);
                }
              }
            return result2;
          }
          var baseEach = createBaseEach(baseForOwn);
          var baseEachRight = createBaseEach(baseForOwnRight, true);
          function baseEvery(collection, predicate) {
            var result2 = true;
            baseEach(collection, function(value2, index, collection2) {
              result2 = !!predicate(value2, index, collection2);
              return result2;
            });
            return result2;
          }
          function baseExtremum(array, iteratee2, comparator) {
            var index = -1, length2 = array.length;
            while (++index < length2) {
              var value2 = array[index], current = iteratee2(value2);
              if (current != null && (computed === undefined2 ? current === current && !isSymbol(current) : comparator(current, computed))) {
                var computed = current, result2 = value2;
              }
            }
            return result2;
          }
          function baseFill(array, value2, start, end) {
            var length2 = array.length;
            start = toInteger(start);
            if (start < 0) {
              start = -start > length2 ? 0 : length2 + start;
            }
            end = end === undefined2 || end > length2 ? length2 : toInteger(end);
            if (end < 0) {
              end += length2;
            }
            end = start > end ? 0 : toLength(end);
            while (start < end) {
              array[start++] = value2;
            }
            return array;
          }
          function baseFilter(collection, predicate) {
            var result2 = [];
            baseEach(collection, function(value2, index, collection2) {
              if (predicate(value2, index, collection2)) {
                result2.push(value2);
              }
            });
            return result2;
          }
          function baseFlatten(array, depth, predicate, isStrict, result2) {
            var index = -1, length2 = array.length;
            predicate || (predicate = isFlattenable);
            result2 || (result2 = []);
            while (++index < length2) {
              var value2 = array[index];
              if (depth > 0 && predicate(value2)) {
                if (depth > 1) {
                  baseFlatten(value2, depth - 1, predicate, isStrict, result2);
                } else {
                  arrayPush(result2, value2);
                }
              } else if (!isStrict) {
                result2[result2.length] = value2;
              }
            }
            return result2;
          }
          var baseFor = createBaseFor();
          var baseForRight = createBaseFor(true);
          function baseForOwn(object, iteratee2) {
            return object && baseFor(object, iteratee2, keys);
          }
          function baseForOwnRight(object, iteratee2) {
            return object && baseForRight(object, iteratee2, keys);
          }
          function baseFunctions(object, props) {
            return arrayFilter(props, function(key) {
              return isFunction2(object[key]);
            });
          }
          function baseGet(object, path) {
            path = castPath(path, object);
            var index = 0, length2 = path.length;
            while (object != null && index < length2) {
              object = object[toKey(path[index++])];
            }
            return index && index == length2 ? object : undefined2;
          }
          function baseGetAllKeys(object, keysFunc, symbolsFunc) {
            var result2 = keysFunc(object);
            return isArray2(object) ? result2 : arrayPush(result2, symbolsFunc(object));
          }
          function baseGetTag(value2) {
            if (value2 == null) {
              return value2 === undefined2 ? undefinedTag : nullTag;
            }
            return symToStringTag && symToStringTag in Object2(value2) ? getRawTag(value2) : objectToString(value2);
          }
          function baseGt(value2, other) {
            return value2 > other;
          }
          function baseHas(object, key) {
            return object != null && hasOwnProperty2.call(object, key);
          }
          function baseHasIn(object, key) {
            return object != null && key in Object2(object);
          }
          function baseInRange(number, start, end) {
            return number >= nativeMin(start, end) && number < nativeMax(start, end);
          }
          function baseIntersection(arrays, iteratee2, comparator) {
            var includes2 = comparator ? arrayIncludesWith : arrayIncludes, length2 = arrays[0].length, othLength = arrays.length, othIndex = othLength, caches = Array2(othLength), maxLength = Infinity, result2 = [];
            while (othIndex--) {
              var array = arrays[othIndex];
              if (othIndex && iteratee2) {
                array = arrayMap(array, baseUnary(iteratee2));
              }
              maxLength = nativeMin(array.length, maxLength);
              caches[othIndex] = !comparator && (iteratee2 || length2 >= 120 && array.length >= 120) ? new SetCache(othIndex && array) : undefined2;
            }
            array = arrays[0];
            var index = -1, seen = caches[0];
            outer:
              while (++index < length2 && result2.length < maxLength) {
                var value2 = array[index], computed = iteratee2 ? iteratee2(value2) : value2;
                value2 = comparator || value2 !== 0 ? value2 : 0;
                if (!(seen ? cacheHas(seen, computed) : includes2(result2, computed, comparator))) {
                  othIndex = othLength;
                  while (--othIndex) {
                    var cache2 = caches[othIndex];
                    if (!(cache2 ? cacheHas(cache2, computed) : includes2(arrays[othIndex], computed, comparator))) {
                      continue outer;
                    }
                  }
                  if (seen) {
                    seen.push(computed);
                  }
                  result2.push(value2);
                }
              }
            return result2;
          }
          function baseInverter(object, setter, iteratee2, accumulator) {
            baseForOwn(object, function(value2, key, object2) {
              setter(accumulator, iteratee2(value2), key, object2);
            });
            return accumulator;
          }
          function baseInvoke(object, path, args) {
            path = castPath(path, object);
            object = parent(object, path);
            var func = object == null ? object : object[toKey(last(path))];
            return func == null ? undefined2 : apply(func, object, args);
          }
          function baseIsArguments(value2) {
            return isObjectLike(value2) && baseGetTag(value2) == argsTag;
          }
          function baseIsArrayBuffer(value2) {
            return isObjectLike(value2) && baseGetTag(value2) == arrayBufferTag;
          }
          function baseIsDate(value2) {
            return isObjectLike(value2) && baseGetTag(value2) == dateTag;
          }
          function baseIsEqual(value2, other, bitmask, customizer, stack) {
            if (value2 === other) {
              return true;
            }
            if (value2 == null || other == null || !isObjectLike(value2) && !isObjectLike(other)) {
              return value2 !== value2 && other !== other;
            }
            return baseIsEqualDeep(value2, other, bitmask, customizer, baseIsEqual, stack);
          }
          function baseIsEqualDeep(object, other, bitmask, customizer, equalFunc, stack) {
            var objIsArr = isArray2(object), othIsArr = isArray2(other), objTag = objIsArr ? arrayTag : getTag(object), othTag = othIsArr ? arrayTag : getTag(other);
            objTag = objTag == argsTag ? objectTag : objTag;
            othTag = othTag == argsTag ? objectTag : othTag;
            var objIsObj = objTag == objectTag, othIsObj = othTag == objectTag, isSameTag = objTag == othTag;
            if (isSameTag && isBuffer2(object)) {
              if (!isBuffer2(other)) {
                return false;
              }
              objIsArr = true;
              objIsObj = false;
            }
            if (isSameTag && !objIsObj) {
              stack || (stack = new Stack());
              return objIsArr || isTypedArray2(object) ? equalArrays(object, other, bitmask, customizer, equalFunc, stack) : equalByTag(object, other, objTag, bitmask, customizer, equalFunc, stack);
            }
            if (!(bitmask & COMPARE_PARTIAL_FLAG)) {
              var objIsWrapped = objIsObj && hasOwnProperty2.call(object, "__wrapped__"), othIsWrapped = othIsObj && hasOwnProperty2.call(other, "__wrapped__");
              if (objIsWrapped || othIsWrapped) {
                var objUnwrapped = objIsWrapped ? object.value() : object, othUnwrapped = othIsWrapped ? other.value() : other;
                stack || (stack = new Stack());
                return equalFunc(objUnwrapped, othUnwrapped, bitmask, customizer, stack);
              }
            }
            if (!isSameTag) {
              return false;
            }
            stack || (stack = new Stack());
            return equalObjects(object, other, bitmask, customizer, equalFunc, stack);
          }
          function baseIsMap(value2) {
            return isObjectLike(value2) && getTag(value2) == mapTag;
          }
          function baseIsMatch(object, source, matchData, customizer) {
            var index = matchData.length, length2 = index, noCustomizer = !customizer;
            if (object == null) {
              return !length2;
            }
            object = Object2(object);
            while (index--) {
              var data = matchData[index];
              if (noCustomizer && data[2] ? data[1] !== object[data[0]] : !(data[0] in object)) {
                return false;
              }
            }
            while (++index < length2) {
              data = matchData[index];
              var key = data[0], objValue = object[key], srcValue = data[1];
              if (noCustomizer && data[2]) {
                if (objValue === undefined2 && !(key in object)) {
                  return false;
                }
              } else {
                var stack = new Stack();
                if (customizer) {
                  var result2 = customizer(objValue, srcValue, key, object, source, stack);
                }
                if (!(result2 === undefined2 ? baseIsEqual(srcValue, objValue, COMPARE_PARTIAL_FLAG | COMPARE_UNORDERED_FLAG, customizer, stack) : result2)) {
                  return false;
                }
              }
            }
            return true;
          }
          function baseIsNative(value2) {
            if (!isObject3(value2) || isMasked(value2)) {
              return false;
            }
            var pattern = isFunction2(value2) ? reIsNative : reIsHostCtor;
            return pattern.test(toSource(value2));
          }
          function baseIsRegExp(value2) {
            return isObjectLike(value2) && baseGetTag(value2) == regexpTag;
          }
          function baseIsSet(value2) {
            return isObjectLike(value2) && getTag(value2) == setTag;
          }
          function baseIsTypedArray(value2) {
            return isObjectLike(value2) && isLength(value2.length) && !!typedArrayTags[baseGetTag(value2)];
          }
          function baseIteratee(value2) {
            if (typeof value2 == "function") {
              return value2;
            }
            if (value2 == null) {
              return identity;
            }
            if (typeof value2 == "object") {
              return isArray2(value2) ? baseMatchesProperty(value2[0], value2[1]) : baseMatches(value2);
            }
            return property(value2);
          }
          function baseKeys(object) {
            if (!isPrototype(object)) {
              return nativeKeys(object);
            }
            var result2 = [];
            for (var key in Object2(object)) {
              if (hasOwnProperty2.call(object, key) && key != "constructor") {
                result2.push(key);
              }
            }
            return result2;
          }
          function baseKeysIn(object) {
            if (!isObject3(object)) {
              return nativeKeysIn(object);
            }
            var isProto = isPrototype(object), result2 = [];
            for (var key in object) {
              if (!(key == "constructor" && (isProto || !hasOwnProperty2.call(object, key)))) {
                result2.push(key);
              }
            }
            return result2;
          }
          function baseLt(value2, other) {
            return value2 < other;
          }
          function baseMap(collection, iteratee2) {
            var index = -1, result2 = isArrayLike(collection) ? Array2(collection.length) : [];
            baseEach(collection, function(value2, key, collection2) {
              result2[++index] = iteratee2(value2, key, collection2);
            });
            return result2;
          }
          function baseMatches(source) {
            var matchData = getMatchData(source);
            if (matchData.length == 1 && matchData[0][2]) {
              return matchesStrictComparable(matchData[0][0], matchData[0][1]);
            }
            return function(object) {
              return object === source || baseIsMatch(object, source, matchData);
            };
          }
          function baseMatchesProperty(path, srcValue) {
            if (isKey(path) && isStrictComparable(srcValue)) {
              return matchesStrictComparable(toKey(path), srcValue);
            }
            return function(object) {
              var objValue = get(object, path);
              return objValue === undefined2 && objValue === srcValue ? hasIn(object, path) : baseIsEqual(srcValue, objValue, COMPARE_PARTIAL_FLAG | COMPARE_UNORDERED_FLAG);
            };
          }
          function baseMerge(object, source, srcIndex, customizer, stack) {
            if (object === source) {
              return;
            }
            baseFor(source, function(srcValue, key) {
              stack || (stack = new Stack());
              if (isObject3(srcValue)) {
                baseMergeDeep(object, source, key, srcIndex, baseMerge, customizer, stack);
              } else {
                var newValue = customizer ? customizer(safeGet(object, key), srcValue, key + "", object, source, stack) : undefined2;
                if (newValue === undefined2) {
                  newValue = srcValue;
                }
                assignMergeValue(object, key, newValue);
              }
            }, keysIn);
          }
          function baseMergeDeep(object, source, key, srcIndex, mergeFunc, customizer, stack) {
            var objValue = safeGet(object, key), srcValue = safeGet(source, key), stacked = stack.get(srcValue);
            if (stacked) {
              assignMergeValue(object, key, stacked);
              return;
            }
            var newValue = customizer ? customizer(objValue, srcValue, key + "", object, source, stack) : undefined2;
            var isCommon = newValue === undefined2;
            if (isCommon) {
              var isArr = isArray2(srcValue), isBuff = !isArr && isBuffer2(srcValue), isTyped = !isArr && !isBuff && isTypedArray2(srcValue);
              newValue = srcValue;
              if (isArr || isBuff || isTyped) {
                if (isArray2(objValue)) {
                  newValue = objValue;
                } else if (isArrayLikeObject(objValue)) {
                  newValue = copyArray(objValue);
                } else if (isBuff) {
                  isCommon = false;
                  newValue = cloneBuffer(srcValue, true);
                } else if (isTyped) {
                  isCommon = false;
                  newValue = cloneTypedArray(srcValue, true);
                } else {
                  newValue = [];
                }
              } else if (isPlainObject2(srcValue) || isArguments(srcValue)) {
                newValue = objValue;
                if (isArguments(objValue)) {
                  newValue = toPlainObject(objValue);
                } else if (!isObject3(objValue) || isFunction2(objValue)) {
                  newValue = initCloneObject(srcValue);
                }
              } else {
                isCommon = false;
              }
            }
            if (isCommon) {
              stack.set(srcValue, newValue);
              mergeFunc(newValue, srcValue, srcIndex, customizer, stack);
              stack["delete"](srcValue);
            }
            assignMergeValue(object, key, newValue);
          }
          function baseNth(array, n) {
            var length2 = array.length;
            if (!length2) {
              return;
            }
            n += n < 0 ? length2 : 0;
            return isIndex(n, length2) ? array[n] : undefined2;
          }
          function baseOrderBy(collection, iteratees, orders) {
            if (iteratees.length) {
              iteratees = arrayMap(iteratees, function(iteratee2) {
                if (isArray2(iteratee2)) {
                  return function(value2) {
                    return baseGet(value2, iteratee2.length === 1 ? iteratee2[0] : iteratee2);
                  };
                }
                return iteratee2;
              });
            } else {
              iteratees = [identity];
            }
            var index = -1;
            iteratees = arrayMap(iteratees, baseUnary(getIteratee()));
            var result2 = baseMap(collection, function(value2, key, collection2) {
              var criteria = arrayMap(iteratees, function(iteratee2) {
                return iteratee2(value2);
              });
              return { "criteria": criteria, "index": ++index, "value": value2 };
            });
            return baseSortBy(result2, function(object, other) {
              return compareMultiple(object, other, orders);
            });
          }
          function basePick(object, paths) {
            return basePickBy(object, paths, function(value2, path) {
              return hasIn(object, path);
            });
          }
          function basePickBy(object, paths, predicate) {
            var index = -1, length2 = paths.length, result2 = {};
            while (++index < length2) {
              var path = paths[index], value2 = baseGet(object, path);
              if (predicate(value2, path)) {
                baseSet(result2, castPath(path, object), value2);
              }
            }
            return result2;
          }
          function basePropertyDeep(path) {
            return function(object) {
              return baseGet(object, path);
            };
          }
          function basePullAll(array, values2, iteratee2, comparator) {
            var indexOf2 = comparator ? baseIndexOfWith : baseIndexOf, index = -1, length2 = values2.length, seen = array;
            if (array === values2) {
              values2 = copyArray(values2);
            }
            if (iteratee2) {
              seen = arrayMap(array, baseUnary(iteratee2));
            }
            while (++index < length2) {
              var fromIndex = 0, value2 = values2[index], computed = iteratee2 ? iteratee2(value2) : value2;
              while ((fromIndex = indexOf2(seen, computed, fromIndex, comparator)) > -1) {
                if (seen !== array) {
                  splice.call(seen, fromIndex, 1);
                }
                splice.call(array, fromIndex, 1);
              }
            }
            return array;
          }
          function basePullAt(array, indexes) {
            var length2 = array ? indexes.length : 0, lastIndex = length2 - 1;
            while (length2--) {
              var index = indexes[length2];
              if (length2 == lastIndex || index !== previous) {
                var previous = index;
                if (isIndex(index)) {
                  splice.call(array, index, 1);
                } else {
                  baseUnset(array, index);
                }
              }
            }
            return array;
          }
          function baseRandom(lower, upper) {
            return lower + nativeFloor(nativeRandom() * (upper - lower + 1));
          }
          function baseRange(start, end, step, fromRight) {
            var index = -1, length2 = nativeMax(nativeCeil((end - start) / (step || 1)), 0), result2 = Array2(length2);
            while (length2--) {
              result2[fromRight ? length2 : ++index] = start;
              start += step;
            }
            return result2;
          }
          function baseRepeat(string, n) {
            var result2 = "";
            if (!string || n < 1 || n > MAX_SAFE_INTEGER) {
              return result2;
            }
            do {
              if (n % 2) {
                result2 += string;
              }
              n = nativeFloor(n / 2);
              if (n) {
                string += string;
              }
            } while (n);
            return result2;
          }
          function baseRest(func, start) {
            return setToString(overRest(func, start, identity), func + "");
          }
          function baseSample(collection) {
            return arraySample(values(collection));
          }
          function baseSampleSize(collection, n) {
            var array = values(collection);
            return shuffleSelf(array, baseClamp(n, 0, array.length));
          }
          function baseSet(object, path, value2, customizer) {
            if (!isObject3(object)) {
              return object;
            }
            path = castPath(path, object);
            var index = -1, length2 = path.length, lastIndex = length2 - 1, nested = object;
            while (nested != null && ++index < length2) {
              var key = toKey(path[index]), newValue = value2;
              if (key === "__proto__" || key === "constructor" || key === "prototype") {
                return object;
              }
              if (index != lastIndex) {
                var objValue = nested[key];
                newValue = customizer ? customizer(objValue, key, nested) : undefined2;
                if (newValue === undefined2) {
                  newValue = isObject3(objValue) ? objValue : isIndex(path[index + 1]) ? [] : {};
                }
              }
              assignValue(nested, key, newValue);
              nested = nested[key];
            }
            return object;
          }
          var baseSetData = !metaMap ? identity : function(func, data) {
            metaMap.set(func, data);
            return func;
          };
          var baseSetToString = !defineProperty ? identity : function(func, string) {
            return defineProperty(func, "toString", {
              "configurable": true,
              "enumerable": false,
              "value": constant(string),
              "writable": true
            });
          };
          function baseShuffle(collection) {
            return shuffleSelf(values(collection));
          }
          function baseSlice(array, start, end) {
            var index = -1, length2 = array.length;
            if (start < 0) {
              start = -start > length2 ? 0 : length2 + start;
            }
            end = end > length2 ? length2 : end;
            if (end < 0) {
              end += length2;
            }
            length2 = start > end ? 0 : end - start >>> 0;
            start >>>= 0;
            var result2 = Array2(length2);
            while (++index < length2) {
              result2[index] = array[index + start];
            }
            return result2;
          }
          function baseSome(collection, predicate) {
            var result2;
            baseEach(collection, function(value2, index, collection2) {
              result2 = predicate(value2, index, collection2);
              return !result2;
            });
            return !!result2;
          }
          function baseSortedIndex(array, value2, retHighest) {
            var low = 0, high = array == null ? low : array.length;
            if (typeof value2 == "number" && value2 === value2 && high <= HALF_MAX_ARRAY_LENGTH) {
              while (low < high) {
                var mid = low + high >>> 1, computed = array[mid];
                if (computed !== null && !isSymbol(computed) && (retHighest ? computed <= value2 : computed < value2)) {
                  low = mid + 1;
                } else {
                  high = mid;
                }
              }
              return high;
            }
            return baseSortedIndexBy(array, value2, identity, retHighest);
          }
          function baseSortedIndexBy(array, value2, iteratee2, retHighest) {
            var low = 0, high = array == null ? 0 : array.length;
            if (high === 0) {
              return 0;
            }
            value2 = iteratee2(value2);
            var valIsNaN = value2 !== value2, valIsNull = value2 === null, valIsSymbol = isSymbol(value2), valIsUndefined = value2 === undefined2;
            while (low < high) {
              var mid = nativeFloor((low + high) / 2), computed = iteratee2(array[mid]), othIsDefined = computed !== undefined2, othIsNull = computed === null, othIsReflexive = computed === computed, othIsSymbol = isSymbol(computed);
              if (valIsNaN) {
                var setLow = retHighest || othIsReflexive;
              } else if (valIsUndefined) {
                setLow = othIsReflexive && (retHighest || othIsDefined);
              } else if (valIsNull) {
                setLow = othIsReflexive && othIsDefined && (retHighest || !othIsNull);
              } else if (valIsSymbol) {
                setLow = othIsReflexive && othIsDefined && !othIsNull && (retHighest || !othIsSymbol);
              } else if (othIsNull || othIsSymbol) {
                setLow = false;
              } else {
                setLow = retHighest ? computed <= value2 : computed < value2;
              }
              if (setLow) {
                low = mid + 1;
              } else {
                high = mid;
              }
            }
            return nativeMin(high, MAX_ARRAY_INDEX);
          }
          function baseSortedUniq(array, iteratee2) {
            var index = -1, length2 = array.length, resIndex = 0, result2 = [];
            while (++index < length2) {
              var value2 = array[index], computed = iteratee2 ? iteratee2(value2) : value2;
              if (!index || !eq(computed, seen)) {
                var seen = computed;
                result2[resIndex++] = value2 === 0 ? 0 : value2;
              }
            }
            return result2;
          }
          function baseToNumber(value2) {
            if (typeof value2 == "number") {
              return value2;
            }
            if (isSymbol(value2)) {
              return NAN;
            }
            return +value2;
          }
          function baseToString(value2) {
            if (typeof value2 == "string") {
              return value2;
            }
            if (isArray2(value2)) {
              return arrayMap(value2, baseToString) + "";
            }
            if (isSymbol(value2)) {
              return symbolToString ? symbolToString.call(value2) : "";
            }
            var result2 = value2 + "";
            return result2 == "0" && 1 / value2 == -INFINITY ? "-0" : result2;
          }
          function baseUniq(array, iteratee2, comparator) {
            var index = -1, includes2 = arrayIncludes, length2 = array.length, isCommon = true, result2 = [], seen = result2;
            if (comparator) {
              isCommon = false;
              includes2 = arrayIncludesWith;
            } else if (length2 >= LARGE_ARRAY_SIZE) {
              var set2 = iteratee2 ? null : createSet(array);
              if (set2) {
                return setToArray(set2);
              }
              isCommon = false;
              includes2 = cacheHas;
              seen = new SetCache();
            } else {
              seen = iteratee2 ? [] : result2;
            }
            outer:
              while (++index < length2) {
                var value2 = array[index], computed = iteratee2 ? iteratee2(value2) : value2;
                value2 = comparator || value2 !== 0 ? value2 : 0;
                if (isCommon && computed === computed) {
                  var seenIndex = seen.length;
                  while (seenIndex--) {
                    if (seen[seenIndex] === computed) {
                      continue outer;
                    }
                  }
                  if (iteratee2) {
                    seen.push(computed);
                  }
                  result2.push(value2);
                } else if (!includes2(seen, computed, comparator)) {
                  if (seen !== result2) {
                    seen.push(computed);
                  }
                  result2.push(value2);
                }
              }
            return result2;
          }
          function baseUnset(object, path) {
            path = castPath(path, object);
            object = parent(object, path);
            return object == null || delete object[toKey(last(path))];
          }
          function baseUpdate(object, path, updater, customizer) {
            return baseSet(object, path, updater(baseGet(object, path)), customizer);
          }
          function baseWhile(array, predicate, isDrop, fromRight) {
            var length2 = array.length, index = fromRight ? length2 : -1;
            while ((fromRight ? index-- : ++index < length2) && predicate(array[index], index, array)) {
            }
            return isDrop ? baseSlice(array, fromRight ? 0 : index, fromRight ? index + 1 : length2) : baseSlice(array, fromRight ? index + 1 : 0, fromRight ? length2 : index);
          }
          function baseWrapperValue(value2, actions) {
            var result2 = value2;
            if (result2 instanceof LazyWrapper) {
              result2 = result2.value();
            }
            return arrayReduce(actions, function(result3, action2) {
              return action2.func.apply(action2.thisArg, arrayPush([result3], action2.args));
            }, result2);
          }
          function baseXor(arrays, iteratee2, comparator) {
            var length2 = arrays.length;
            if (length2 < 2) {
              return length2 ? baseUniq(arrays[0]) : [];
            }
            var index = -1, result2 = Array2(length2);
            while (++index < length2) {
              var array = arrays[index], othIndex = -1;
              while (++othIndex < length2) {
                if (othIndex != index) {
                  result2[index] = baseDifference(result2[index] || array, arrays[othIndex], iteratee2, comparator);
                }
              }
            }
            return baseUniq(baseFlatten(result2, 1), iteratee2, comparator);
          }
          function baseZipObject(props, values2, assignFunc) {
            var index = -1, length2 = props.length, valsLength = values2.length, result2 = {};
            while (++index < length2) {
              var value2 = index < valsLength ? values2[index] : undefined2;
              assignFunc(result2, props[index], value2);
            }
            return result2;
          }
          function castArrayLikeObject(value2) {
            return isArrayLikeObject(value2) ? value2 : [];
          }
          function castFunction(value2) {
            return typeof value2 == "function" ? value2 : identity;
          }
          function castPath(value2, object) {
            if (isArray2(value2)) {
              return value2;
            }
            return isKey(value2, object) ? [value2] : stringToPath(toString4(value2));
          }
          var castRest = baseRest;
          function castSlice(array, start, end) {
            var length2 = array.length;
            end = end === undefined2 ? length2 : end;
            return !start && end >= length2 ? array : baseSlice(array, start, end);
          }
          var clearTimeout = ctxClearTimeout || function(id) {
            return root.clearTimeout(id);
          };
          function cloneBuffer(buffer, isDeep) {
            if (isDeep) {
              return buffer.slice();
            }
            var length2 = buffer.length, result2 = allocUnsafe ? allocUnsafe(length2) : new buffer.constructor(length2);
            buffer.copy(result2);
            return result2;
          }
          function cloneArrayBuffer(arrayBuffer) {
            var result2 = new arrayBuffer.constructor(arrayBuffer.byteLength);
            new Uint8Array2(result2).set(new Uint8Array2(arrayBuffer));
            return result2;
          }
          function cloneDataView(dataView, isDeep) {
            var buffer = isDeep ? cloneArrayBuffer(dataView.buffer) : dataView.buffer;
            return new dataView.constructor(buffer, dataView.byteOffset, dataView.byteLength);
          }
          function cloneRegExp(regexp) {
            var result2 = new regexp.constructor(regexp.source, reFlags.exec(regexp));
            result2.lastIndex = regexp.lastIndex;
            return result2;
          }
          function cloneSymbol(symbol) {
            return symbolValueOf ? Object2(symbolValueOf.call(symbol)) : {};
          }
          function cloneTypedArray(typedArray, isDeep) {
            var buffer = isDeep ? cloneArrayBuffer(typedArray.buffer) : typedArray.buffer;
            return new typedArray.constructor(buffer, typedArray.byteOffset, typedArray.length);
          }
          function compareAscending(value2, other) {
            if (value2 !== other) {
              var valIsDefined = value2 !== undefined2, valIsNull = value2 === null, valIsReflexive = value2 === value2, valIsSymbol = isSymbol(value2);
              var othIsDefined = other !== undefined2, othIsNull = other === null, othIsReflexive = other === other, othIsSymbol = isSymbol(other);
              if (!othIsNull && !othIsSymbol && !valIsSymbol && value2 > other || valIsSymbol && othIsDefined && othIsReflexive && !othIsNull && !othIsSymbol || valIsNull && othIsDefined && othIsReflexive || !valIsDefined && othIsReflexive || !valIsReflexive) {
                return 1;
              }
              if (!valIsNull && !valIsSymbol && !othIsSymbol && value2 < other || othIsSymbol && valIsDefined && valIsReflexive && !valIsNull && !valIsSymbol || othIsNull && valIsDefined && valIsReflexive || !othIsDefined && valIsReflexive || !othIsReflexive) {
                return -1;
              }
            }
            return 0;
          }
          function compareMultiple(object, other, orders) {
            var index = -1, objCriteria = object.criteria, othCriteria = other.criteria, length2 = objCriteria.length, ordersLength = orders.length;
            while (++index < length2) {
              var result2 = compareAscending(objCriteria[index], othCriteria[index]);
              if (result2) {
                if (index >= ordersLength) {
                  return result2;
                }
                var order = orders[index];
                return result2 * (order == "desc" ? -1 : 1);
              }
            }
            return object.index - other.index;
          }
          function composeArgs(args, partials, holders, isCurried) {
            var argsIndex = -1, argsLength = args.length, holdersLength = holders.length, leftIndex = -1, leftLength = partials.length, rangeLength = nativeMax(argsLength - holdersLength, 0), result2 = Array2(leftLength + rangeLength), isUncurried = !isCurried;
            while (++leftIndex < leftLength) {
              result2[leftIndex] = partials[leftIndex];
            }
            while (++argsIndex < holdersLength) {
              if (isUncurried || argsIndex < argsLength) {
                result2[holders[argsIndex]] = args[argsIndex];
              }
            }
            while (rangeLength--) {
              result2[leftIndex++] = args[argsIndex++];
            }
            return result2;
          }
          function composeArgsRight(args, partials, holders, isCurried) {
            var argsIndex = -1, argsLength = args.length, holdersIndex = -1, holdersLength = holders.length, rightIndex = -1, rightLength = partials.length, rangeLength = nativeMax(argsLength - holdersLength, 0), result2 = Array2(rangeLength + rightLength), isUncurried = !isCurried;
            while (++argsIndex < rangeLength) {
              result2[argsIndex] = args[argsIndex];
            }
            var offset = argsIndex;
            while (++rightIndex < rightLength) {
              result2[offset + rightIndex] = partials[rightIndex];
            }
            while (++holdersIndex < holdersLength) {
              if (isUncurried || argsIndex < argsLength) {
                result2[offset + holders[holdersIndex]] = args[argsIndex++];
              }
            }
            return result2;
          }
          function copyArray(source, array) {
            var index = -1, length2 = source.length;
            array || (array = Array2(length2));
            while (++index < length2) {
              array[index] = source[index];
            }
            return array;
          }
          function copyObject(source, props, object, customizer) {
            var isNew = !object;
            object || (object = {});
            var index = -1, length2 = props.length;
            while (++index < length2) {
              var key = props[index];
              var newValue = customizer ? customizer(object[key], source[key], key, object, source) : undefined2;
              if (newValue === undefined2) {
                newValue = source[key];
              }
              if (isNew) {
                baseAssignValue(object, key, newValue);
              } else {
                assignValue(object, key, newValue);
              }
            }
            return object;
          }
          function copySymbols(source, object) {
            return copyObject(source, getSymbols(source), object);
          }
          function copySymbolsIn(source, object) {
            return copyObject(source, getSymbolsIn(source), object);
          }
          function createAggregator(setter, initializer) {
            return function(collection, iteratee2) {
              var func = isArray2(collection) ? arrayAggregator : baseAggregator, accumulator = initializer ? initializer() : {};
              return func(collection, setter, getIteratee(iteratee2, 2), accumulator);
            };
          }
          function createAssigner(assigner) {
            return baseRest(function(object, sources) {
              var index = -1, length2 = sources.length, customizer = length2 > 1 ? sources[length2 - 1] : undefined2, guard = length2 > 2 ? sources[2] : undefined2;
              customizer = assigner.length > 3 && typeof customizer == "function" ? (length2--, customizer) : undefined2;
              if (guard && isIterateeCall(sources[0], sources[1], guard)) {
                customizer = length2 < 3 ? undefined2 : customizer;
                length2 = 1;
              }
              object = Object2(object);
              while (++index < length2) {
                var source = sources[index];
                if (source) {
                  assigner(object, source, index, customizer);
                }
              }
              return object;
            });
          }
          function createBaseEach(eachFunc, fromRight) {
            return function(collection, iteratee2) {
              if (collection == null) {
                return collection;
              }
              if (!isArrayLike(collection)) {
                return eachFunc(collection, iteratee2);
              }
              var length2 = collection.length, index = fromRight ? length2 : -1, iterable = Object2(collection);
              while (fromRight ? index-- : ++index < length2) {
                if (iteratee2(iterable[index], index, iterable) === false) {
                  break;
                }
              }
              return collection;
            };
          }
          function createBaseFor(fromRight) {
            return function(object, iteratee2, keysFunc) {
              var index = -1, iterable = Object2(object), props = keysFunc(object), length2 = props.length;
              while (length2--) {
                var key = props[fromRight ? length2 : ++index];
                if (iteratee2(iterable[key], key, iterable) === false) {
                  break;
                }
              }
              return object;
            };
          }
          function createBind(func, bitmask, thisArg) {
            var isBind = bitmask & WRAP_BIND_FLAG, Ctor = createCtor(func);
            function wrapper() {
              var fn = this && this !== root && this instanceof wrapper ? Ctor : func;
              return fn.apply(isBind ? thisArg : this, arguments);
            }
            return wrapper;
          }
          function createCaseFirst(methodName) {
            return function(string) {
              string = toString4(string);
              var strSymbols = hasUnicode(string) ? stringToArray(string) : undefined2;
              var chr = strSymbols ? strSymbols[0] : string.charAt(0);
              var trailing = strSymbols ? castSlice(strSymbols, 1).join("") : string.slice(1);
              return chr[methodName]() + trailing;
            };
          }
          function createCompounder(callback) {
            return function(string) {
              return arrayReduce(words(deburr(string).replace(reApos, "")), callback, "");
            };
          }
          function createCtor(Ctor) {
            return function() {
              var args = arguments;
              switch (args.length) {
                case 0:
                  return new Ctor();
                case 1:
                  return new Ctor(args[0]);
                case 2:
                  return new Ctor(args[0], args[1]);
                case 3:
                  return new Ctor(args[0], args[1], args[2]);
                case 4:
                  return new Ctor(args[0], args[1], args[2], args[3]);
                case 5:
                  return new Ctor(args[0], args[1], args[2], args[3], args[4]);
                case 6:
                  return new Ctor(args[0], args[1], args[2], args[3], args[4], args[5]);
                case 7:
                  return new Ctor(args[0], args[1], args[2], args[3], args[4], args[5], args[6]);
              }
              var thisBinding = baseCreate(Ctor.prototype), result2 = Ctor.apply(thisBinding, args);
              return isObject3(result2) ? result2 : thisBinding;
            };
          }
          function createCurry(func, bitmask, arity) {
            var Ctor = createCtor(func);
            function wrapper() {
              var length2 = arguments.length, args = Array2(length2), index = length2, placeholder = getHolder(wrapper);
              while (index--) {
                args[index] = arguments[index];
              }
              var holders = length2 < 3 && args[0] !== placeholder && args[length2 - 1] !== placeholder ? [] : replaceHolders(args, placeholder);
              length2 -= holders.length;
              if (length2 < arity) {
                return createRecurry(
                  func,
                  bitmask,
                  createHybrid,
                  wrapper.placeholder,
                  undefined2,
                  args,
                  holders,
                  undefined2,
                  undefined2,
                  arity - length2
                );
              }
              var fn = this && this !== root && this instanceof wrapper ? Ctor : func;
              return apply(fn, this, args);
            }
            return wrapper;
          }
          function createFind(findIndexFunc) {
            return function(collection, predicate, fromIndex) {
              var iterable = Object2(collection);
              if (!isArrayLike(collection)) {
                var iteratee2 = getIteratee(predicate, 3);
                collection = keys(collection);
                predicate = function(key) {
                  return iteratee2(iterable[key], key, iterable);
                };
              }
              var index = findIndexFunc(collection, predicate, fromIndex);
              return index > -1 ? iterable[iteratee2 ? collection[index] : index] : undefined2;
            };
          }
          function createFlow(fromRight) {
            return flatRest(function(funcs) {
              var length2 = funcs.length, index = length2, prereq = LodashWrapper.prototype.thru;
              if (fromRight) {
                funcs.reverse();
              }
              while (index--) {
                var func = funcs[index];
                if (typeof func != "function") {
                  throw new TypeError2(FUNC_ERROR_TEXT);
                }
                if (prereq && !wrapper && getFuncName(func) == "wrapper") {
                  var wrapper = new LodashWrapper([], true);
                }
              }
              index = wrapper ? index : length2;
              while (++index < length2) {
                func = funcs[index];
                var funcName = getFuncName(func), data = funcName == "wrapper" ? getData(func) : undefined2;
                if (data && isLaziable(data[0]) && data[1] == (WRAP_ARY_FLAG | WRAP_CURRY_FLAG | WRAP_PARTIAL_FLAG | WRAP_REARG_FLAG) && !data[4].length && data[9] == 1) {
                  wrapper = wrapper[getFuncName(data[0])].apply(wrapper, data[3]);
                } else {
                  wrapper = func.length == 1 && isLaziable(func) ? wrapper[funcName]() : wrapper.thru(func);
                }
              }
              return function() {
                var args = arguments, value2 = args[0];
                if (wrapper && args.length == 1 && isArray2(value2)) {
                  return wrapper.plant(value2).value();
                }
                var index2 = 0, result2 = length2 ? funcs[index2].apply(this, args) : value2;
                while (++index2 < length2) {
                  result2 = funcs[index2].call(this, result2);
                }
                return result2;
              };
            });
          }
          function createHybrid(func, bitmask, thisArg, partials, holders, partialsRight, holdersRight, argPos, ary2, arity) {
            var isAry = bitmask & WRAP_ARY_FLAG, isBind = bitmask & WRAP_BIND_FLAG, isBindKey = bitmask & WRAP_BIND_KEY_FLAG, isCurried = bitmask & (WRAP_CURRY_FLAG | WRAP_CURRY_RIGHT_FLAG), isFlip = bitmask & WRAP_FLIP_FLAG, Ctor = isBindKey ? undefined2 : createCtor(func);
            function wrapper() {
              var length2 = arguments.length, args = Array2(length2), index = length2;
              while (index--) {
                args[index] = arguments[index];
              }
              if (isCurried) {
                var placeholder = getHolder(wrapper), holdersCount = countHolders(args, placeholder);
              }
              if (partials) {
                args = composeArgs(args, partials, holders, isCurried);
              }
              if (partialsRight) {
                args = composeArgsRight(args, partialsRight, holdersRight, isCurried);
              }
              length2 -= holdersCount;
              if (isCurried && length2 < arity) {
                var newHolders = replaceHolders(args, placeholder);
                return createRecurry(
                  func,
                  bitmask,
                  createHybrid,
                  wrapper.placeholder,
                  thisArg,
                  args,
                  newHolders,
                  argPos,
                  ary2,
                  arity - length2
                );
              }
              var thisBinding = isBind ? thisArg : this, fn = isBindKey ? thisBinding[func] : func;
              length2 = args.length;
              if (argPos) {
                args = reorder(args, argPos);
              } else if (isFlip && length2 > 1) {
                args.reverse();
              }
              if (isAry && ary2 < length2) {
                args.length = ary2;
              }
              if (this && this !== root && this instanceof wrapper) {
                fn = Ctor || createCtor(fn);
              }
              return fn.apply(thisBinding, args);
            }
            return wrapper;
          }
          function createInverter(setter, toIteratee) {
            return function(object, iteratee2) {
              return baseInverter(object, setter, toIteratee(iteratee2), {});
            };
          }
          function createMathOperation(operator, defaultValue) {
            return function(value2, other) {
              var result2;
              if (value2 === undefined2 && other === undefined2) {
                return defaultValue;
              }
              if (value2 !== undefined2) {
                result2 = value2;
              }
              if (other !== undefined2) {
                if (result2 === undefined2) {
                  return other;
                }
                if (typeof value2 == "string" || typeof other == "string") {
                  value2 = baseToString(value2);
                  other = baseToString(other);
                } else {
                  value2 = baseToNumber(value2);
                  other = baseToNumber(other);
                }
                result2 = operator(value2, other);
              }
              return result2;
            };
          }
          function createOver(arrayFunc) {
            return flatRest(function(iteratees) {
              iteratees = arrayMap(iteratees, baseUnary(getIteratee()));
              return baseRest(function(args) {
                var thisArg = this;
                return arrayFunc(iteratees, function(iteratee2) {
                  return apply(iteratee2, thisArg, args);
                });
              });
            });
          }
          function createPadding(length2, chars2) {
            chars2 = chars2 === undefined2 ? " " : baseToString(chars2);
            var charsLength = chars2.length;
            if (charsLength < 2) {
              return charsLength ? baseRepeat(chars2, length2) : chars2;
            }
            var result2 = baseRepeat(chars2, nativeCeil(length2 / stringSize(chars2)));
            return hasUnicode(chars2) ? castSlice(stringToArray(result2), 0, length2).join("") : result2.slice(0, length2);
          }
          function createPartial(func, bitmask, thisArg, partials) {
            var isBind = bitmask & WRAP_BIND_FLAG, Ctor = createCtor(func);
            function wrapper() {
              var argsIndex = -1, argsLength = arguments.length, leftIndex = -1, leftLength = partials.length, args = Array2(leftLength + argsLength), fn = this && this !== root && this instanceof wrapper ? Ctor : func;
              while (++leftIndex < leftLength) {
                args[leftIndex] = partials[leftIndex];
              }
              while (argsLength--) {
                args[leftIndex++] = arguments[++argsIndex];
              }
              return apply(fn, isBind ? thisArg : this, args);
            }
            return wrapper;
          }
          function createRange(fromRight) {
            return function(start, end, step) {
              if (step && typeof step != "number" && isIterateeCall(start, end, step)) {
                end = step = undefined2;
              }
              start = toFinite(start);
              if (end === undefined2) {
                end = start;
                start = 0;
              } else {
                end = toFinite(end);
              }
              step = step === undefined2 ? start < end ? 1 : -1 : toFinite(step);
              return baseRange(start, end, step, fromRight);
            };
          }
          function createRelationalOperation(operator) {
            return function(value2, other) {
              if (!(typeof value2 == "string" && typeof other == "string")) {
                value2 = toNumber(value2);
                other = toNumber(other);
              }
              return operator(value2, other);
            };
          }
          function createRecurry(func, bitmask, wrapFunc, placeholder, thisArg, partials, holders, argPos, ary2, arity) {
            var isCurry = bitmask & WRAP_CURRY_FLAG, newHolders = isCurry ? holders : undefined2, newHoldersRight = isCurry ? undefined2 : holders, newPartials = isCurry ? partials : undefined2, newPartialsRight = isCurry ? undefined2 : partials;
            bitmask |= isCurry ? WRAP_PARTIAL_FLAG : WRAP_PARTIAL_RIGHT_FLAG;
            bitmask &= ~(isCurry ? WRAP_PARTIAL_RIGHT_FLAG : WRAP_PARTIAL_FLAG);
            if (!(bitmask & WRAP_CURRY_BOUND_FLAG)) {
              bitmask &= ~(WRAP_BIND_FLAG | WRAP_BIND_KEY_FLAG);
            }
            var newData = [
              func,
              bitmask,
              thisArg,
              newPartials,
              newHolders,
              newPartialsRight,
              newHoldersRight,
              argPos,
              ary2,
              arity
            ];
            var result2 = wrapFunc.apply(undefined2, newData);
            if (isLaziable(func)) {
              setData(result2, newData);
            }
            result2.placeholder = placeholder;
            return setWrapToString(result2, func, bitmask);
          }
          function createRound(methodName) {
            var func = Math2[methodName];
            return function(number, precision) {
              number = toNumber(number);
              precision = precision == null ? 0 : nativeMin(toInteger(precision), 292);
              if (precision && nativeIsFinite(number)) {
                var pair = (toString4(number) + "e").split("e"), value2 = func(pair[0] + "e" + (+pair[1] + precision));
                pair = (toString4(value2) + "e").split("e");
                return +(pair[0] + "e" + (+pair[1] - precision));
              }
              return func(number);
            };
          }
          var createSet = !(Set2 && 1 / setToArray(new Set2([, -0]))[1] == INFINITY) ? noop2 : function(values2) {
            return new Set2(values2);
          };
          function createToPairs(keysFunc) {
            return function(object) {
              var tag = getTag(object);
              if (tag == mapTag) {
                return mapToArray(object);
              }
              if (tag == setTag) {
                return setToPairs(object);
              }
              return baseToPairs(object, keysFunc(object));
            };
          }
          function createWrap(func, bitmask, thisArg, partials, holders, argPos, ary2, arity) {
            var isBindKey = bitmask & WRAP_BIND_KEY_FLAG;
            if (!isBindKey && typeof func != "function") {
              throw new TypeError2(FUNC_ERROR_TEXT);
            }
            var length2 = partials ? partials.length : 0;
            if (!length2) {
              bitmask &= ~(WRAP_PARTIAL_FLAG | WRAP_PARTIAL_RIGHT_FLAG);
              partials = holders = undefined2;
            }
            ary2 = ary2 === undefined2 ? ary2 : nativeMax(toInteger(ary2), 0);
            arity = arity === undefined2 ? arity : toInteger(arity);
            length2 -= holders ? holders.length : 0;
            if (bitmask & WRAP_PARTIAL_RIGHT_FLAG) {
              var partialsRight = partials, holdersRight = holders;
              partials = holders = undefined2;
            }
            var data = isBindKey ? undefined2 : getData(func);
            var newData = [
              func,
              bitmask,
              thisArg,
              partials,
              holders,
              partialsRight,
              holdersRight,
              argPos,
              ary2,
              arity
            ];
            if (data) {
              mergeData(newData, data);
            }
            func = newData[0];
            bitmask = newData[1];
            thisArg = newData[2];
            partials = newData[3];
            holders = newData[4];
            arity = newData[9] = newData[9] === undefined2 ? isBindKey ? 0 : func.length : nativeMax(newData[9] - length2, 0);
            if (!arity && bitmask & (WRAP_CURRY_FLAG | WRAP_CURRY_RIGHT_FLAG)) {
              bitmask &= ~(WRAP_CURRY_FLAG | WRAP_CURRY_RIGHT_FLAG);
            }
            if (!bitmask || bitmask == WRAP_BIND_FLAG) {
              var result2 = createBind(func, bitmask, thisArg);
            } else if (bitmask == WRAP_CURRY_FLAG || bitmask == WRAP_CURRY_RIGHT_FLAG) {
              result2 = createCurry(func, bitmask, arity);
            } else if ((bitmask == WRAP_PARTIAL_FLAG || bitmask == (WRAP_BIND_FLAG | WRAP_PARTIAL_FLAG)) && !holders.length) {
              result2 = createPartial(func, bitmask, thisArg, partials);
            } else {
              result2 = createHybrid.apply(undefined2, newData);
            }
            var setter = data ? baseSetData : setData;
            return setWrapToString(setter(result2, newData), func, bitmask);
          }
          function customDefaultsAssignIn(objValue, srcValue, key, object) {
            if (objValue === undefined2 || eq(objValue, objectProto[key]) && !hasOwnProperty2.call(object, key)) {
              return srcValue;
            }
            return objValue;
          }
          function customDefaultsMerge(objValue, srcValue, key, object, source, stack) {
            if (isObject3(objValue) && isObject3(srcValue)) {
              stack.set(srcValue, objValue);
              baseMerge(objValue, srcValue, undefined2, customDefaultsMerge, stack);
              stack["delete"](srcValue);
            }
            return objValue;
          }
          function customOmitClone(value2) {
            return isPlainObject2(value2) ? undefined2 : value2;
          }
          function equalArrays(array, other, bitmask, customizer, equalFunc, stack) {
            var isPartial = bitmask & COMPARE_PARTIAL_FLAG, arrLength = array.length, othLength = other.length;
            if (arrLength != othLength && !(isPartial && othLength > arrLength)) {
              return false;
            }
            var arrStacked = stack.get(array);
            var othStacked = stack.get(other);
            if (arrStacked && othStacked) {
              return arrStacked == other && othStacked == array;
            }
            var index = -1, result2 = true, seen = bitmask & COMPARE_UNORDERED_FLAG ? new SetCache() : undefined2;
            stack.set(array, other);
            stack.set(other, array);
            while (++index < arrLength) {
              var arrValue = array[index], othValue = other[index];
              if (customizer) {
                var compared = isPartial ? customizer(othValue, arrValue, index, other, array, stack) : customizer(arrValue, othValue, index, array, other, stack);
              }
              if (compared !== undefined2) {
                if (compared) {
                  continue;
                }
                result2 = false;
                break;
              }
              if (seen) {
                if (!arraySome(other, function(othValue2, othIndex) {
                  if (!cacheHas(seen, othIndex) && (arrValue === othValue2 || equalFunc(arrValue, othValue2, bitmask, customizer, stack))) {
                    return seen.push(othIndex);
                  }
                })) {
                  result2 = false;
                  break;
                }
              } else if (!(arrValue === othValue || equalFunc(arrValue, othValue, bitmask, customizer, stack))) {
                result2 = false;
                break;
              }
            }
            stack["delete"](array);
            stack["delete"](other);
            return result2;
          }
          function equalByTag(object, other, tag, bitmask, customizer, equalFunc, stack) {
            switch (tag) {
              case dataViewTag:
                if (object.byteLength != other.byteLength || object.byteOffset != other.byteOffset) {
                  return false;
                }
                object = object.buffer;
                other = other.buffer;
              case arrayBufferTag:
                if (object.byteLength != other.byteLength || !equalFunc(new Uint8Array2(object), new Uint8Array2(other))) {
                  return false;
                }
                return true;
              case boolTag:
              case dateTag:
              case numberTag:
                return eq(+object, +other);
              case errorTag:
                return object.name == other.name && object.message == other.message;
              case regexpTag:
              case stringTag:
                return object == other + "";
              case mapTag:
                var convert = mapToArray;
              case setTag:
                var isPartial = bitmask & COMPARE_PARTIAL_FLAG;
                convert || (convert = setToArray);
                if (object.size != other.size && !isPartial) {
                  return false;
                }
                var stacked = stack.get(object);
                if (stacked) {
                  return stacked == other;
                }
                bitmask |= COMPARE_UNORDERED_FLAG;
                stack.set(object, other);
                var result2 = equalArrays(convert(object), convert(other), bitmask, customizer, equalFunc, stack);
                stack["delete"](object);
                return result2;
              case symbolTag:
                if (symbolValueOf) {
                  return symbolValueOf.call(object) == symbolValueOf.call(other);
                }
            }
            return false;
          }
          function equalObjects(object, other, bitmask, customizer, equalFunc, stack) {
            var isPartial = bitmask & COMPARE_PARTIAL_FLAG, objProps = getAllKeys(object), objLength = objProps.length, othProps = getAllKeys(other), othLength = othProps.length;
            if (objLength != othLength && !isPartial) {
              return false;
            }
            var index = objLength;
            while (index--) {
              var key = objProps[index];
              if (!(isPartial ? key in other : hasOwnProperty2.call(other, key))) {
                return false;
              }
            }
            var objStacked = stack.get(object);
            var othStacked = stack.get(other);
            if (objStacked && othStacked) {
              return objStacked == other && othStacked == object;
            }
            var result2 = true;
            stack.set(object, other);
            stack.set(other, object);
            var skipCtor = isPartial;
            while (++index < objLength) {
              key = objProps[index];
              var objValue = object[key], othValue = other[key];
              if (customizer) {
                var compared = isPartial ? customizer(othValue, objValue, key, other, object, stack) : customizer(objValue, othValue, key, object, other, stack);
              }
              if (!(compared === undefined2 ? objValue === othValue || equalFunc(objValue, othValue, bitmask, customizer, stack) : compared)) {
                result2 = false;
                break;
              }
              skipCtor || (skipCtor = key == "constructor");
            }
            if (result2 && !skipCtor) {
              var objCtor = object.constructor, othCtor = other.constructor;
              if (objCtor != othCtor && ("constructor" in object && "constructor" in other) && !(typeof objCtor == "function" && objCtor instanceof objCtor && typeof othCtor == "function" && othCtor instanceof othCtor)) {
                result2 = false;
              }
            }
            stack["delete"](object);
            stack["delete"](other);
            return result2;
          }
          function flatRest(func) {
            return setToString(overRest(func, undefined2, flatten), func + "");
          }
          function getAllKeys(object) {
            return baseGetAllKeys(object, keys, getSymbols);
          }
          function getAllKeysIn(object) {
            return baseGetAllKeys(object, keysIn, getSymbolsIn);
          }
          var getData = !metaMap ? noop2 : function(func) {
            return metaMap.get(func);
          };
          function getFuncName(func) {
            var result2 = func.name + "", array = realNames[result2], length2 = hasOwnProperty2.call(realNames, result2) ? array.length : 0;
            while (length2--) {
              var data = array[length2], otherFunc = data.func;
              if (otherFunc == null || otherFunc == func) {
                return data.name;
              }
            }
            return result2;
          }
          function getHolder(func) {
            var object = hasOwnProperty2.call(lodash, "placeholder") ? lodash : func;
            return object.placeholder;
          }
          function getIteratee() {
            var result2 = lodash.iteratee || iteratee;
            result2 = result2 === iteratee ? baseIteratee : result2;
            return arguments.length ? result2(arguments[0], arguments[1]) : result2;
          }
          function getMapData(map3, key) {
            var data = map3.__data__;
            return isKeyable(key) ? data[typeof key == "string" ? "string" : "hash"] : data.map;
          }
          function getMatchData(object) {
            var result2 = keys(object), length2 = result2.length;
            while (length2--) {
              var key = result2[length2], value2 = object[key];
              result2[length2] = [key, value2, isStrictComparable(value2)];
            }
            return result2;
          }
          function getNative(object, key) {
            var value2 = getValue(object, key);
            return baseIsNative(value2) ? value2 : undefined2;
          }
          function getRawTag(value2) {
            var isOwn = hasOwnProperty2.call(value2, symToStringTag), tag = value2[symToStringTag];
            try {
              value2[symToStringTag] = undefined2;
              var unmasked = true;
            } catch (e) {
            }
            var result2 = nativeObjectToString.call(value2);
            if (unmasked) {
              if (isOwn) {
                value2[symToStringTag] = tag;
              } else {
                delete value2[symToStringTag];
              }
            }
            return result2;
          }
          var getSymbols = !nativeGetSymbols ? stubArray : function(object) {
            if (object == null) {
              return [];
            }
            object = Object2(object);
            return arrayFilter(nativeGetSymbols(object), function(symbol) {
              return propertyIsEnumerable.call(object, symbol);
            });
          };
          var getSymbolsIn = !nativeGetSymbols ? stubArray : function(object) {
            var result2 = [];
            while (object) {
              arrayPush(result2, getSymbols(object));
              object = getPrototype(object);
            }
            return result2;
          };
          var getTag = baseGetTag;
          if (DataView2 && getTag(new DataView2(new ArrayBuffer(1))) != dataViewTag || Map2 && getTag(new Map2()) != mapTag || Promise2 && getTag(Promise2.resolve()) != promiseTag || Set2 && getTag(new Set2()) != setTag || WeakMap && getTag(new WeakMap()) != weakMapTag) {
            getTag = function(value2) {
              var result2 = baseGetTag(value2), Ctor = result2 == objectTag ? value2.constructor : undefined2, ctorString = Ctor ? toSource(Ctor) : "";
              if (ctorString) {
                switch (ctorString) {
                  case dataViewCtorString:
                    return dataViewTag;
                  case mapCtorString:
                    return mapTag;
                  case promiseCtorString:
                    return promiseTag;
                  case setCtorString:
                    return setTag;
                  case weakMapCtorString:
                    return weakMapTag;
                }
              }
              return result2;
            };
          }
          function getView(start, end, transforms) {
            var index = -1, length2 = transforms.length;
            while (++index < length2) {
              var data = transforms[index], size2 = data.size;
              switch (data.type) {
                case "drop":
                  start += size2;
                  break;
                case "dropRight":
                  end -= size2;
                  break;
                case "take":
                  end = nativeMin(end, start + size2);
                  break;
                case "takeRight":
                  start = nativeMax(start, end - size2);
                  break;
              }
            }
            return { "start": start, "end": end };
          }
          function getWrapDetails(source) {
            var match = source.match(reWrapDetails);
            return match ? match[1].split(reSplitDetails) : [];
          }
          function hasPath(object, path, hasFunc) {
            path = castPath(path, object);
            var index = -1, length2 = path.length, result2 = false;
            while (++index < length2) {
              var key = toKey(path[index]);
              if (!(result2 = object != null && hasFunc(object, key))) {
                break;
              }
              object = object[key];
            }
            if (result2 || ++index != length2) {
              return result2;
            }
            length2 = object == null ? 0 : object.length;
            return !!length2 && isLength(length2) && isIndex(key, length2) && (isArray2(object) || isArguments(object));
          }
          function initCloneArray(array) {
            var length2 = array.length, result2 = new array.constructor(length2);
            if (length2 && typeof array[0] == "string" && hasOwnProperty2.call(array, "index")) {
              result2.index = array.index;
              result2.input = array.input;
            }
            return result2;
          }
          function initCloneObject(object) {
            return typeof object.constructor == "function" && !isPrototype(object) ? baseCreate(getPrototype(object)) : {};
          }
          function initCloneByTag(object, tag, isDeep) {
            var Ctor = object.constructor;
            switch (tag) {
              case arrayBufferTag:
                return cloneArrayBuffer(object);
              case boolTag:
              case dateTag:
                return new Ctor(+object);
              case dataViewTag:
                return cloneDataView(object, isDeep);
              case float32Tag:
              case float64Tag:
              case int8Tag:
              case int16Tag:
              case int32Tag:
              case uint8Tag:
              case uint8ClampedTag:
              case uint16Tag:
              case uint32Tag:
                return cloneTypedArray(object, isDeep);
              case mapTag:
                return new Ctor();
              case numberTag:
              case stringTag:
                return new Ctor(object);
              case regexpTag:
                return cloneRegExp(object);
              case setTag:
                return new Ctor();
              case symbolTag:
                return cloneSymbol(object);
            }
          }
          function insertWrapDetails(source, details) {
            var length2 = details.length;
            if (!length2) {
              return source;
            }
            var lastIndex = length2 - 1;
            details[lastIndex] = (length2 > 1 ? "& " : "") + details[lastIndex];
            details = details.join(length2 > 2 ? ", " : " ");
            return source.replace(reWrapComment, "{\n/* [wrapped with " + details + "] */\n");
          }
          function isFlattenable(value2) {
            return isArray2(value2) || isArguments(value2) || !!(spreadableSymbol && value2 && value2[spreadableSymbol]);
          }
          function isIndex(value2, length2) {
            var type = typeof value2;
            length2 = length2 == null ? MAX_SAFE_INTEGER : length2;
            return !!length2 && (type == "number" || type != "symbol" && reIsUint.test(value2)) && (value2 > -1 && value2 % 1 == 0 && value2 < length2);
          }
          function isIterateeCall(value2, index, object) {
            if (!isObject3(object)) {
              return false;
            }
            var type = typeof index;
            if (type == "number" ? isArrayLike(object) && isIndex(index, object.length) : type == "string" && index in object) {
              return eq(object[index], value2);
            }
            return false;
          }
          function isKey(value2, object) {
            if (isArray2(value2)) {
              return false;
            }
            var type = typeof value2;
            if (type == "number" || type == "symbol" || type == "boolean" || value2 == null || isSymbol(value2)) {
              return true;
            }
            return reIsPlainProp.test(value2) || !reIsDeepProp.test(value2) || object != null && value2 in Object2(object);
          }
          function isKeyable(value2) {
            var type = typeof value2;
            return type == "string" || type == "number" || type == "symbol" || type == "boolean" ? value2 !== "__proto__" : value2 === null;
          }
          function isLaziable(func) {
            var funcName = getFuncName(func), other = lodash[funcName];
            if (typeof other != "function" || !(funcName in LazyWrapper.prototype)) {
              return false;
            }
            if (func === other) {
              return true;
            }
            var data = getData(other);
            return !!data && func === data[0];
          }
          function isMasked(func) {
            return !!maskSrcKey && maskSrcKey in func;
          }
          var isMaskable = coreJsData ? isFunction2 : stubFalse;
          function isPrototype(value2) {
            var Ctor = value2 && value2.constructor, proto = typeof Ctor == "function" && Ctor.prototype || objectProto;
            return value2 === proto;
          }
          function isStrictComparable(value2) {
            return value2 === value2 && !isObject3(value2);
          }
          function matchesStrictComparable(key, srcValue) {
            return function(object) {
              if (object == null) {
                return false;
              }
              return object[key] === srcValue && (srcValue !== undefined2 || key in Object2(object));
            };
          }
          function memoizeCapped(func) {
            var result2 = memoize(func, function(key) {
              if (cache2.size === MAX_MEMOIZE_SIZE) {
                cache2.clear();
              }
              return key;
            });
            var cache2 = result2.cache;
            return result2;
          }
          function mergeData(data, source) {
            var bitmask = data[1], srcBitmask = source[1], newBitmask = bitmask | srcBitmask, isCommon = newBitmask < (WRAP_BIND_FLAG | WRAP_BIND_KEY_FLAG | WRAP_ARY_FLAG);
            var isCombo = srcBitmask == WRAP_ARY_FLAG && bitmask == WRAP_CURRY_FLAG || srcBitmask == WRAP_ARY_FLAG && bitmask == WRAP_REARG_FLAG && data[7].length <= source[8] || srcBitmask == (WRAP_ARY_FLAG | WRAP_REARG_FLAG) && source[7].length <= source[8] && bitmask == WRAP_CURRY_FLAG;
            if (!(isCommon || isCombo)) {
              return data;
            }
            if (srcBitmask & WRAP_BIND_FLAG) {
              data[2] = source[2];
              newBitmask |= bitmask & WRAP_BIND_FLAG ? 0 : WRAP_CURRY_BOUND_FLAG;
            }
            var value2 = source[3];
            if (value2) {
              var partials = data[3];
              data[3] = partials ? composeArgs(partials, value2, source[4]) : value2;
              data[4] = partials ? replaceHolders(data[3], PLACEHOLDER) : source[4];
            }
            value2 = source[5];
            if (value2) {
              partials = data[5];
              data[5] = partials ? composeArgsRight(partials, value2, source[6]) : value2;
              data[6] = partials ? replaceHolders(data[5], PLACEHOLDER) : source[6];
            }
            value2 = source[7];
            if (value2) {
              data[7] = value2;
            }
            if (srcBitmask & WRAP_ARY_FLAG) {
              data[8] = data[8] == null ? source[8] : nativeMin(data[8], source[8]);
            }
            if (data[9] == null) {
              data[9] = source[9];
            }
            data[0] = source[0];
            data[1] = newBitmask;
            return data;
          }
          function nativeKeysIn(object) {
            var result2 = [];
            if (object != null) {
              for (var key in Object2(object)) {
                result2.push(key);
              }
            }
            return result2;
          }
          function objectToString(value2) {
            return nativeObjectToString.call(value2);
          }
          function overRest(func, start, transform2) {
            start = nativeMax(start === undefined2 ? func.length - 1 : start, 0);
            return function() {
              var args = arguments, index = -1, length2 = nativeMax(args.length - start, 0), array = Array2(length2);
              while (++index < length2) {
                array[index] = args[start + index];
              }
              index = -1;
              var otherArgs = Array2(start + 1);
              while (++index < start) {
                otherArgs[index] = args[index];
              }
              otherArgs[start] = transform2(array);
              return apply(func, this, otherArgs);
            };
          }
          function parent(object, path) {
            return path.length < 2 ? object : baseGet(object, baseSlice(path, 0, -1));
          }
          function reorder(array, indexes) {
            var arrLength = array.length, length2 = nativeMin(indexes.length, arrLength), oldArray = copyArray(array);
            while (length2--) {
              var index = indexes[length2];
              array[length2] = isIndex(index, arrLength) ? oldArray[index] : undefined2;
            }
            return array;
          }
          function safeGet(object, key) {
            if (key === "constructor" && typeof object[key] === "function") {
              return;
            }
            if (key == "__proto__") {
              return;
            }
            return object[key];
          }
          var setData = shortOut(baseSetData);
          var setTimeout2 = ctxSetTimeout || function(func, wait) {
            return root.setTimeout(func, wait);
          };
          var setToString = shortOut(baseSetToString);
          function setWrapToString(wrapper, reference, bitmask) {
            var source = reference + "";
            return setToString(wrapper, insertWrapDetails(source, updateWrapDetails(getWrapDetails(source), bitmask)));
          }
          function shortOut(func) {
            var count = 0, lastCalled = 0;
            return function() {
              var stamp = nativeNow(), remaining = HOT_SPAN - (stamp - lastCalled);
              lastCalled = stamp;
              if (remaining > 0) {
                if (++count >= HOT_COUNT) {
                  return arguments[0];
                }
              } else {
                count = 0;
              }
              return func.apply(undefined2, arguments);
            };
          }
          function shuffleSelf(array, size2) {
            var index = -1, length2 = array.length, lastIndex = length2 - 1;
            size2 = size2 === undefined2 ? length2 : size2;
            while (++index < size2) {
              var rand = baseRandom(index, lastIndex), value2 = array[rand];
              array[rand] = array[index];
              array[index] = value2;
            }
            array.length = size2;
            return array;
          }
          var stringToPath = memoizeCapped(function(string) {
            var result2 = [];
            if (string.charCodeAt(0) === 46) {
              result2.push("");
            }
            string.replace(rePropName, function(match, number, quote, subString) {
              result2.push(quote ? subString.replace(reEscapeChar, "$1") : number || match);
            });
            return result2;
          });
          function toKey(value2) {
            if (typeof value2 == "string" || isSymbol(value2)) {
              return value2;
            }
            var result2 = value2 + "";
            return result2 == "0" && 1 / value2 == -INFINITY ? "-0" : result2;
          }
          function toSource(func) {
            if (func != null) {
              try {
                return funcToString.call(func);
              } catch (e) {
              }
              try {
                return func + "";
              } catch (e) {
              }
            }
            return "";
          }
          function updateWrapDetails(details, bitmask) {
            arrayEach(wrapFlags, function(pair) {
              var value2 = "_." + pair[0];
              if (bitmask & pair[1] && !arrayIncludes(details, value2)) {
                details.push(value2);
              }
            });
            return details.sort();
          }
          function wrapperClone(wrapper) {
            if (wrapper instanceof LazyWrapper) {
              return wrapper.clone();
            }
            var result2 = new LodashWrapper(wrapper.__wrapped__, wrapper.__chain__);
            result2.__actions__ = copyArray(wrapper.__actions__);
            result2.__index__ = wrapper.__index__;
            result2.__values__ = wrapper.__values__;
            return result2;
          }
          function chunk(array, size2, guard) {
            if (guard ? isIterateeCall(array, size2, guard) : size2 === undefined2) {
              size2 = 1;
            } else {
              size2 = nativeMax(toInteger(size2), 0);
            }
            var length2 = array == null ? 0 : array.length;
            if (!length2 || size2 < 1) {
              return [];
            }
            var index = 0, resIndex = 0, result2 = Array2(nativeCeil(length2 / size2));
            while (index < length2) {
              result2[resIndex++] = baseSlice(array, index, index += size2);
            }
            return result2;
          }
          function compact(array) {
            var index = -1, length2 = array == null ? 0 : array.length, resIndex = 0, result2 = [];
            while (++index < length2) {
              var value2 = array[index];
              if (value2) {
                result2[resIndex++] = value2;
              }
            }
            return result2;
          }
          function concat() {
            var length2 = arguments.length;
            if (!length2) {
              return [];
            }
            var args = Array2(length2 - 1), array = arguments[0], index = length2;
            while (index--) {
              args[index - 1] = arguments[index];
            }
            return arrayPush(isArray2(array) ? copyArray(array) : [array], baseFlatten(args, 1));
          }
          var difference = baseRest(function(array, values2) {
            return isArrayLikeObject(array) ? baseDifference(array, baseFlatten(values2, 1, isArrayLikeObject, true)) : [];
          });
          var differenceBy = baseRest(function(array, values2) {
            var iteratee2 = last(values2);
            if (isArrayLikeObject(iteratee2)) {
              iteratee2 = undefined2;
            }
            return isArrayLikeObject(array) ? baseDifference(array, baseFlatten(values2, 1, isArrayLikeObject, true), getIteratee(iteratee2, 2)) : [];
          });
          var differenceWith = baseRest(function(array, values2) {
            var comparator = last(values2);
            if (isArrayLikeObject(comparator)) {
              comparator = undefined2;
            }
            return isArrayLikeObject(array) ? baseDifference(array, baseFlatten(values2, 1, isArrayLikeObject, true), undefined2, comparator) : [];
          });
          function drop(array, n, guard) {
            var length2 = array == null ? 0 : array.length;
            if (!length2) {
              return [];
            }
            n = guard || n === undefined2 ? 1 : toInteger(n);
            return baseSlice(array, n < 0 ? 0 : n, length2);
          }
          function dropRight(array, n, guard) {
            var length2 = array == null ? 0 : array.length;
            if (!length2) {
              return [];
            }
            n = guard || n === undefined2 ? 1 : toInteger(n);
            n = length2 - n;
            return baseSlice(array, 0, n < 0 ? 0 : n);
          }
          function dropRightWhile(array, predicate) {
            return array && array.length ? baseWhile(array, getIteratee(predicate, 3), true, true) : [];
          }
          function dropWhile(array, predicate) {
            return array && array.length ? baseWhile(array, getIteratee(predicate, 3), true) : [];
          }
          function fill(array, value2, start, end) {
            var length2 = array == null ? 0 : array.length;
            if (!length2) {
              return [];
            }
            if (start && typeof start != "number" && isIterateeCall(array, value2, start)) {
              start = 0;
              end = length2;
            }
            return baseFill(array, value2, start, end);
          }
          function findIndex(array, predicate, fromIndex) {
            var length2 = array == null ? 0 : array.length;
            if (!length2) {
              return -1;
            }
            var index = fromIndex == null ? 0 : toInteger(fromIndex);
            if (index < 0) {
              index = nativeMax(length2 + index, 0);
            }
            return baseFindIndex(array, getIteratee(predicate, 3), index);
          }
          function findLastIndex(array, predicate, fromIndex) {
            var length2 = array == null ? 0 : array.length;
            if (!length2) {
              return -1;
            }
            var index = length2 - 1;
            if (fromIndex !== undefined2) {
              index = toInteger(fromIndex);
              index = fromIndex < 0 ? nativeMax(length2 + index, 0) : nativeMin(index, length2 - 1);
            }
            return baseFindIndex(array, getIteratee(predicate, 3), index, true);
          }
          function flatten(array) {
            var length2 = array == null ? 0 : array.length;
            return length2 ? baseFlatten(array, 1) : [];
          }
          function flattenDeep(array) {
            var length2 = array == null ? 0 : array.length;
            return length2 ? baseFlatten(array, INFINITY) : [];
          }
          function flattenDepth(array, depth) {
            var length2 = array == null ? 0 : array.length;
            if (!length2) {
              return [];
            }
            depth = depth === undefined2 ? 1 : toInteger(depth);
            return baseFlatten(array, depth);
          }
          function fromPairs(pairs) {
            var index = -1, length2 = pairs == null ? 0 : pairs.length, result2 = {};
            while (++index < length2) {
              var pair = pairs[index];
              result2[pair[0]] = pair[1];
            }
            return result2;
          }
          function head(array) {
            return array && array.length ? array[0] : undefined2;
          }
          function indexOf(array, value2, fromIndex) {
            var length2 = array == null ? 0 : array.length;
            if (!length2) {
              return -1;
            }
            var index = fromIndex == null ? 0 : toInteger(fromIndex);
            if (index < 0) {
              index = nativeMax(length2 + index, 0);
            }
            return baseIndexOf(array, value2, index);
          }
          function initial(array) {
            var length2 = array == null ? 0 : array.length;
            return length2 ? baseSlice(array, 0, -1) : [];
          }
          var intersection = baseRest(function(arrays) {
            var mapped = arrayMap(arrays, castArrayLikeObject);
            return mapped.length && mapped[0] === arrays[0] ? baseIntersection(mapped) : [];
          });
          var intersectionBy = baseRest(function(arrays) {
            var iteratee2 = last(arrays), mapped = arrayMap(arrays, castArrayLikeObject);
            if (iteratee2 === last(mapped)) {
              iteratee2 = undefined2;
            } else {
              mapped.pop();
            }
            return mapped.length && mapped[0] === arrays[0] ? baseIntersection(mapped, getIteratee(iteratee2, 2)) : [];
          });
          var intersectionWith = baseRest(function(arrays) {
            var comparator = last(arrays), mapped = arrayMap(arrays, castArrayLikeObject);
            comparator = typeof comparator == "function" ? comparator : undefined2;
            if (comparator) {
              mapped.pop();
            }
            return mapped.length && mapped[0] === arrays[0] ? baseIntersection(mapped, undefined2, comparator) : [];
          });
          function join(array, separator) {
            return array == null ? "" : nativeJoin.call(array, separator);
          }
          function last(array) {
            var length2 = array == null ? 0 : array.length;
            return length2 ? array[length2 - 1] : undefined2;
          }
          function lastIndexOf(array, value2, fromIndex) {
            var length2 = array == null ? 0 : array.length;
            if (!length2) {
              return -1;
            }
            var index = length2;
            if (fromIndex !== undefined2) {
              index = toInteger(fromIndex);
              index = index < 0 ? nativeMax(length2 + index, 0) : nativeMin(index, length2 - 1);
            }
            return value2 === value2 ? strictLastIndexOf(array, value2, index) : baseFindIndex(array, baseIsNaN, index, true);
          }
          function nth(array, n) {
            return array && array.length ? baseNth(array, toInteger(n)) : undefined2;
          }
          var pull = baseRest(pullAll);
          function pullAll(array, values2) {
            return array && array.length && values2 && values2.length ? basePullAll(array, values2) : array;
          }
          function pullAllBy(array, values2, iteratee2) {
            return array && array.length && values2 && values2.length ? basePullAll(array, values2, getIteratee(iteratee2, 2)) : array;
          }
          function pullAllWith(array, values2, comparator) {
            return array && array.length && values2 && values2.length ? basePullAll(array, values2, undefined2, comparator) : array;
          }
          var pullAt = flatRest(function(array, indexes) {
            var length2 = array == null ? 0 : array.length, result2 = baseAt(array, indexes);
            basePullAt(array, arrayMap(indexes, function(index) {
              return isIndex(index, length2) ? +index : index;
            }).sort(compareAscending));
            return result2;
          });
          function remove(array, predicate) {
            var result2 = [];
            if (!(array && array.length)) {
              return result2;
            }
            var index = -1, indexes = [], length2 = array.length;
            predicate = getIteratee(predicate, 3);
            while (++index < length2) {
              var value2 = array[index];
              if (predicate(value2, index, array)) {
                result2.push(value2);
                indexes.push(index);
              }
            }
            basePullAt(array, indexes);
            return result2;
          }
          function reverse(array) {
            return array == null ? array : nativeReverse.call(array);
          }
          function slice(array, start, end) {
            var length2 = array == null ? 0 : array.length;
            if (!length2) {
              return [];
            }
            if (end && typeof end != "number" && isIterateeCall(array, start, end)) {
              start = 0;
              end = length2;
            } else {
              start = start == null ? 0 : toInteger(start);
              end = end === undefined2 ? length2 : toInteger(end);
            }
            return baseSlice(array, start, end);
          }
          function sortedIndex(array, value2) {
            return baseSortedIndex(array, value2);
          }
          function sortedIndexBy(array, value2, iteratee2) {
            return baseSortedIndexBy(array, value2, getIteratee(iteratee2, 2));
          }
          function sortedIndexOf(array, value2) {
            var length2 = array == null ? 0 : array.length;
            if (length2) {
              var index = baseSortedIndex(array, value2);
              if (index < length2 && eq(array[index], value2)) {
                return index;
              }
            }
            return -1;
          }
          function sortedLastIndex(array, value2) {
            return baseSortedIndex(array, value2, true);
          }
          function sortedLastIndexBy(array, value2, iteratee2) {
            return baseSortedIndexBy(array, value2, getIteratee(iteratee2, 2), true);
          }
          function sortedLastIndexOf(array, value2) {
            var length2 = array == null ? 0 : array.length;
            if (length2) {
              var index = baseSortedIndex(array, value2, true) - 1;
              if (eq(array[index], value2)) {
                return index;
              }
            }
            return -1;
          }
          function sortedUniq(array) {
            return array && array.length ? baseSortedUniq(array) : [];
          }
          function sortedUniqBy(array, iteratee2) {
            return array && array.length ? baseSortedUniq(array, getIteratee(iteratee2, 2)) : [];
          }
          function tail(array) {
            var length2 = array == null ? 0 : array.length;
            return length2 ? baseSlice(array, 1, length2) : [];
          }
          function take(array, n, guard) {
            if (!(array && array.length)) {
              return [];
            }
            n = guard || n === undefined2 ? 1 : toInteger(n);
            return baseSlice(array, 0, n < 0 ? 0 : n);
          }
          function takeRight(array, n, guard) {
            var length2 = array == null ? 0 : array.length;
            if (!length2) {
              return [];
            }
            n = guard || n === undefined2 ? 1 : toInteger(n);
            n = length2 - n;
            return baseSlice(array, n < 0 ? 0 : n, length2);
          }
          function takeRightWhile(array, predicate) {
            return array && array.length ? baseWhile(array, getIteratee(predicate, 3), false, true) : [];
          }
          function takeWhile(array, predicate) {
            return array && array.length ? baseWhile(array, getIteratee(predicate, 3)) : [];
          }
          var union = baseRest(function(arrays) {
            return baseUniq(baseFlatten(arrays, 1, isArrayLikeObject, true));
          });
          var unionBy = baseRest(function(arrays) {
            var iteratee2 = last(arrays);
            if (isArrayLikeObject(iteratee2)) {
              iteratee2 = undefined2;
            }
            return baseUniq(baseFlatten(arrays, 1, isArrayLikeObject, true), getIteratee(iteratee2, 2));
          });
          var unionWith = baseRest(function(arrays) {
            var comparator = last(arrays);
            comparator = typeof comparator == "function" ? comparator : undefined2;
            return baseUniq(baseFlatten(arrays, 1, isArrayLikeObject, true), undefined2, comparator);
          });
          function uniq(array) {
            return array && array.length ? baseUniq(array) : [];
          }
          function uniqBy(array, iteratee2) {
            return array && array.length ? baseUniq(array, getIteratee(iteratee2, 2)) : [];
          }
          function uniqWith(array, comparator) {
            comparator = typeof comparator == "function" ? comparator : undefined2;
            return array && array.length ? baseUniq(array, undefined2, comparator) : [];
          }
          function unzip(array) {
            if (!(array && array.length)) {
              return [];
            }
            var length2 = 0;
            array = arrayFilter(array, function(group) {
              if (isArrayLikeObject(group)) {
                length2 = nativeMax(group.length, length2);
                return true;
              }
            });
            return baseTimes(length2, function(index) {
              return arrayMap(array, baseProperty(index));
            });
          }
          function unzipWith(array, iteratee2) {
            if (!(array && array.length)) {
              return [];
            }
            var result2 = unzip(array);
            if (iteratee2 == null) {
              return result2;
            }
            return arrayMap(result2, function(group) {
              return apply(iteratee2, undefined2, group);
            });
          }
          var without = baseRest(function(array, values2) {
            return isArrayLikeObject(array) ? baseDifference(array, values2) : [];
          });
          var xor = baseRest(function(arrays) {
            return baseXor(arrayFilter(arrays, isArrayLikeObject));
          });
          var xorBy = baseRest(function(arrays) {
            var iteratee2 = last(arrays);
            if (isArrayLikeObject(iteratee2)) {
              iteratee2 = undefined2;
            }
            return baseXor(arrayFilter(arrays, isArrayLikeObject), getIteratee(iteratee2, 2));
          });
          var xorWith = baseRest(function(arrays) {
            var comparator = last(arrays);
            comparator = typeof comparator == "function" ? comparator : undefined2;
            return baseXor(arrayFilter(arrays, isArrayLikeObject), undefined2, comparator);
          });
          var zip = baseRest(unzip);
          function zipObject(props, values2) {
            return baseZipObject(props || [], values2 || [], assignValue);
          }
          function zipObjectDeep(props, values2) {
            return baseZipObject(props || [], values2 || [], baseSet);
          }
          var zipWith = baseRest(function(arrays) {
            var length2 = arrays.length, iteratee2 = length2 > 1 ? arrays[length2 - 1] : undefined2;
            iteratee2 = typeof iteratee2 == "function" ? (arrays.pop(), iteratee2) : undefined2;
            return unzipWith(arrays, iteratee2);
          });
          function chain(value2) {
            var result2 = lodash(value2);
            result2.__chain__ = true;
            return result2;
          }
          function tap(value2, interceptor) {
            interceptor(value2);
            return value2;
          }
          function thru(value2, interceptor) {
            return interceptor(value2);
          }
          var wrapperAt = flatRest(function(paths) {
            var length2 = paths.length, start = length2 ? paths[0] : 0, value2 = this.__wrapped__, interceptor = function(object) {
              return baseAt(object, paths);
            };
            if (length2 > 1 || this.__actions__.length || !(value2 instanceof LazyWrapper) || !isIndex(start)) {
              return this.thru(interceptor);
            }
            value2 = value2.slice(start, +start + (length2 ? 1 : 0));
            value2.__actions__.push({
              "func": thru,
              "args": [interceptor],
              "thisArg": undefined2
            });
            return new LodashWrapper(value2, this.__chain__).thru(function(array) {
              if (length2 && !array.length) {
                array.push(undefined2);
              }
              return array;
            });
          });
          function wrapperChain() {
            return chain(this);
          }
          function wrapperCommit() {
            return new LodashWrapper(this.value(), this.__chain__);
          }
          function wrapperNext() {
            if (this.__values__ === undefined2) {
              this.__values__ = toArray3(this.value());
            }
            var done = this.__index__ >= this.__values__.length, value2 = done ? undefined2 : this.__values__[this.__index__++];
            return { "done": done, "value": value2 };
          }
          function wrapperToIterator() {
            return this;
          }
          function wrapperPlant(value2) {
            var result2, parent2 = this;
            while (parent2 instanceof baseLodash) {
              var clone2 = wrapperClone(parent2);
              clone2.__index__ = 0;
              clone2.__values__ = undefined2;
              if (result2) {
                previous.__wrapped__ = clone2;
              } else {
                result2 = clone2;
              }
              var previous = clone2;
              parent2 = parent2.__wrapped__;
            }
            previous.__wrapped__ = value2;
            return result2;
          }
          function wrapperReverse() {
            var value2 = this.__wrapped__;
            if (value2 instanceof LazyWrapper) {
              var wrapped = value2;
              if (this.__actions__.length) {
                wrapped = new LazyWrapper(this);
              }
              wrapped = wrapped.reverse();
              wrapped.__actions__.push({
                "func": thru,
                "args": [reverse],
                "thisArg": undefined2
              });
              return new LodashWrapper(wrapped, this.__chain__);
            }
            return this.thru(reverse);
          }
          function wrapperValue() {
            return baseWrapperValue(this.__wrapped__, this.__actions__);
          }
          var countBy = createAggregator(function(result2, value2, key) {
            if (hasOwnProperty2.call(result2, key)) {
              ++result2[key];
            } else {
              baseAssignValue(result2, key, 1);
            }
          });
          function every(collection, predicate, guard) {
            var func = isArray2(collection) ? arrayEvery : baseEvery;
            if (guard && isIterateeCall(collection, predicate, guard)) {
              predicate = undefined2;
            }
            return func(collection, getIteratee(predicate, 3));
          }
          function filter2(collection, predicate) {
            var func = isArray2(collection) ? arrayFilter : baseFilter;
            return func(collection, getIteratee(predicate, 3));
          }
          var find = createFind(findIndex);
          var findLast = createFind(findLastIndex);
          function flatMap(collection, iteratee2) {
            return baseFlatten(map2(collection, iteratee2), 1);
          }
          function flatMapDeep(collection, iteratee2) {
            return baseFlatten(map2(collection, iteratee2), INFINITY);
          }
          function flatMapDepth(collection, iteratee2, depth) {
            depth = depth === undefined2 ? 1 : toInteger(depth);
            return baseFlatten(map2(collection, iteratee2), depth);
          }
          function forEach2(collection, iteratee2) {
            var func = isArray2(collection) ? arrayEach : baseEach;
            return func(collection, getIteratee(iteratee2, 3));
          }
          function forEachRight(collection, iteratee2) {
            var func = isArray2(collection) ? arrayEachRight : baseEachRight;
            return func(collection, getIteratee(iteratee2, 3));
          }
          var groupBy = createAggregator(function(result2, value2, key) {
            if (hasOwnProperty2.call(result2, key)) {
              result2[key].push(value2);
            } else {
              baseAssignValue(result2, key, [value2]);
            }
          });
          function includes(collection, value2, fromIndex, guard) {
            collection = isArrayLike(collection) ? collection : values(collection);
            fromIndex = fromIndex && !guard ? toInteger(fromIndex) : 0;
            var length2 = collection.length;
            if (fromIndex < 0) {
              fromIndex = nativeMax(length2 + fromIndex, 0);
            }
            return isString2(collection) ? fromIndex <= length2 && collection.indexOf(value2, fromIndex) > -1 : !!length2 && baseIndexOf(collection, value2, fromIndex) > -1;
          }
          var invokeMap = baseRest(function(collection, path, args) {
            var index = -1, isFunc = typeof path == "function", result2 = isArrayLike(collection) ? Array2(collection.length) : [];
            baseEach(collection, function(value2) {
              result2[++index] = isFunc ? apply(path, value2, args) : baseInvoke(value2, path, args);
            });
            return result2;
          });
          var keyBy = createAggregator(function(result2, value2, key) {
            baseAssignValue(result2, key, value2);
          });
          function map2(collection, iteratee2) {
            var func = isArray2(collection) ? arrayMap : baseMap;
            return func(collection, getIteratee(iteratee2, 3));
          }
          function orderBy(collection, iteratees, orders, guard) {
            if (collection == null) {
              return [];
            }
            if (!isArray2(iteratees)) {
              iteratees = iteratees == null ? [] : [iteratees];
            }
            orders = guard ? undefined2 : orders;
            if (!isArray2(orders)) {
              orders = orders == null ? [] : [orders];
            }
            return baseOrderBy(collection, iteratees, orders);
          }
          var partition = createAggregator(function(result2, value2, key) {
            result2[key ? 0 : 1].push(value2);
          }, function() {
            return [[], []];
          });
          function reduce(collection, iteratee2, accumulator) {
            var func = isArray2(collection) ? arrayReduce : baseReduce, initAccum = arguments.length < 3;
            return func(collection, getIteratee(iteratee2, 4), accumulator, initAccum, baseEach);
          }
          function reduceRight(collection, iteratee2, accumulator) {
            var func = isArray2(collection) ? arrayReduceRight : baseReduce, initAccum = arguments.length < 3;
            return func(collection, getIteratee(iteratee2, 4), accumulator, initAccum, baseEachRight);
          }
          function reject(collection, predicate) {
            var func = isArray2(collection) ? arrayFilter : baseFilter;
            return func(collection, negate(getIteratee(predicate, 3)));
          }
          function sample(collection) {
            var func = isArray2(collection) ? arraySample : baseSample;
            return func(collection);
          }
          function sampleSize(collection, n, guard) {
            if (guard ? isIterateeCall(collection, n, guard) : n === undefined2) {
              n = 1;
            } else {
              n = toInteger(n);
            }
            var func = isArray2(collection) ? arraySampleSize : baseSampleSize;
            return func(collection, n);
          }
          function shuffle(collection) {
            var func = isArray2(collection) ? arrayShuffle : baseShuffle;
            return func(collection);
          }
          function size(collection) {
            if (collection == null) {
              return 0;
            }
            if (isArrayLike(collection)) {
              return isString2(collection) ? stringSize(collection) : collection.length;
            }
            var tag = getTag(collection);
            if (tag == mapTag || tag == setTag) {
              return collection.size;
            }
            return baseKeys(collection).length;
          }
          function some(collection, predicate, guard) {
            var func = isArray2(collection) ? arraySome : baseSome;
            if (guard && isIterateeCall(collection, predicate, guard)) {
              predicate = undefined2;
            }
            return func(collection, getIteratee(predicate, 3));
          }
          var sortBy = baseRest(function(collection, iteratees) {
            if (collection == null) {
              return [];
            }
            var length2 = iteratees.length;
            if (length2 > 1 && isIterateeCall(collection, iteratees[0], iteratees[1])) {
              iteratees = [];
            } else if (length2 > 2 && isIterateeCall(iteratees[0], iteratees[1], iteratees[2])) {
              iteratees = [iteratees[0]];
            }
            return baseOrderBy(collection, baseFlatten(iteratees, 1), []);
          });
          var now = ctxNow || function() {
            return root.Date.now();
          };
          function after(n, func) {
            if (typeof func != "function") {
              throw new TypeError2(FUNC_ERROR_TEXT);
            }
            n = toInteger(n);
            return function() {
              if (--n < 1) {
                return func.apply(this, arguments);
              }
            };
          }
          function ary(func, n, guard) {
            n = guard ? undefined2 : n;
            n = func && n == null ? func.length : n;
            return createWrap(func, WRAP_ARY_FLAG, undefined2, undefined2, undefined2, undefined2, n);
          }
          function before(n, func) {
            var result2;
            if (typeof func != "function") {
              throw new TypeError2(FUNC_ERROR_TEXT);
            }
            n = toInteger(n);
            return function() {
              if (--n > 0) {
                result2 = func.apply(this, arguments);
              }
              if (n <= 1) {
                func = undefined2;
              }
              return result2;
            };
          }
          var bind2 = baseRest(function(func, thisArg, partials) {
            var bitmask = WRAP_BIND_FLAG;
            if (partials.length) {
              var holders = replaceHolders(partials, getHolder(bind2));
              bitmask |= WRAP_PARTIAL_FLAG;
            }
            return createWrap(func, bitmask, thisArg, partials, holders);
          });
          var bindKey = baseRest(function(object, key, partials) {
            var bitmask = WRAP_BIND_FLAG | WRAP_BIND_KEY_FLAG;
            if (partials.length) {
              var holders = replaceHolders(partials, getHolder(bindKey));
              bitmask |= WRAP_PARTIAL_FLAG;
            }
            return createWrap(key, bitmask, object, partials, holders);
          });
          function curry(func, arity, guard) {
            arity = guard ? undefined2 : arity;
            var result2 = createWrap(func, WRAP_CURRY_FLAG, undefined2, undefined2, undefined2, undefined2, undefined2, arity);
            result2.placeholder = curry.placeholder;
            return result2;
          }
          function curryRight(func, arity, guard) {
            arity = guard ? undefined2 : arity;
            var result2 = createWrap(func, WRAP_CURRY_RIGHT_FLAG, undefined2, undefined2, undefined2, undefined2, undefined2, arity);
            result2.placeholder = curryRight.placeholder;
            return result2;
          }
          function debounce(func, wait, options) {
            var lastArgs, lastThis, maxWait, result2, timerId, lastCallTime, lastInvokeTime = 0, leading = false, maxing = false, trailing = true;
            if (typeof func != "function") {
              throw new TypeError2(FUNC_ERROR_TEXT);
            }
            wait = toNumber(wait) || 0;
            if (isObject3(options)) {
              leading = !!options.leading;
              maxing = "maxWait" in options;
              maxWait = maxing ? nativeMax(toNumber(options.maxWait) || 0, wait) : maxWait;
              trailing = "trailing" in options ? !!options.trailing : trailing;
            }
            function invokeFunc(time) {
              var args = lastArgs, thisArg = lastThis;
              lastArgs = lastThis = undefined2;
              lastInvokeTime = time;
              result2 = func.apply(thisArg, args);
              return result2;
            }
            function leadingEdge(time) {
              lastInvokeTime = time;
              timerId = setTimeout2(timerExpired, wait);
              return leading ? invokeFunc(time) : result2;
            }
            function remainingWait(time) {
              var timeSinceLastCall = time - lastCallTime, timeSinceLastInvoke = time - lastInvokeTime, timeWaiting = wait - timeSinceLastCall;
              return maxing ? nativeMin(timeWaiting, maxWait - timeSinceLastInvoke) : timeWaiting;
            }
            function shouldInvoke(time) {
              var timeSinceLastCall = time - lastCallTime, timeSinceLastInvoke = time - lastInvokeTime;
              return lastCallTime === undefined2 || timeSinceLastCall >= wait || timeSinceLastCall < 0 || maxing && timeSinceLastInvoke >= maxWait;
            }
            function timerExpired() {
              var time = now();
              if (shouldInvoke(time)) {
                return trailingEdge(time);
              }
              timerId = setTimeout2(timerExpired, remainingWait(time));
            }
            function trailingEdge(time) {
              timerId = undefined2;
              if (trailing && lastArgs) {
                return invokeFunc(time);
              }
              lastArgs = lastThis = undefined2;
              return result2;
            }
            function cancel() {
              if (timerId !== undefined2) {
                clearTimeout(timerId);
              }
              lastInvokeTime = 0;
              lastArgs = lastCallTime = lastThis = timerId = undefined2;
            }
            function flush() {
              return timerId === undefined2 ? result2 : trailingEdge(now());
            }
            function debounced() {
              var time = now(), isInvoking = shouldInvoke(time);
              lastArgs = arguments;
              lastThis = this;
              lastCallTime = time;
              if (isInvoking) {
                if (timerId === undefined2) {
                  return leadingEdge(lastCallTime);
                }
                if (maxing) {
                  clearTimeout(timerId);
                  timerId = setTimeout2(timerExpired, wait);
                  return invokeFunc(lastCallTime);
                }
              }
              if (timerId === undefined2) {
                timerId = setTimeout2(timerExpired, wait);
              }
              return result2;
            }
            debounced.cancel = cancel;
            debounced.flush = flush;
            return debounced;
          }
          var defer = baseRest(function(func, args) {
            return baseDelay(func, 1, args);
          });
          var delay = baseRest(function(func, wait, args) {
            return baseDelay(func, toNumber(wait) || 0, args);
          });
          function flip(func) {
            return createWrap(func, WRAP_FLIP_FLAG);
          }
          function memoize(func, resolver) {
            if (typeof func != "function" || resolver != null && typeof resolver != "function") {
              throw new TypeError2(FUNC_ERROR_TEXT);
            }
            var memoized = function() {
              var args = arguments, key = resolver ? resolver.apply(this, args) : args[0], cache2 = memoized.cache;
              if (cache2.has(key)) {
                return cache2.get(key);
              }
              var result2 = func.apply(this, args);
              memoized.cache = cache2.set(key, result2) || cache2;
              return result2;
            };
            memoized.cache = new (memoize.Cache || MapCache)();
            return memoized;
          }
          memoize.Cache = MapCache;
          function negate(predicate) {
            if (typeof predicate != "function") {
              throw new TypeError2(FUNC_ERROR_TEXT);
            }
            return function() {
              var args = arguments;
              switch (args.length) {
                case 0:
                  return !predicate.call(this);
                case 1:
                  return !predicate.call(this, args[0]);
                case 2:
                  return !predicate.call(this, args[0], args[1]);
                case 3:
                  return !predicate.call(this, args[0], args[1], args[2]);
              }
              return !predicate.apply(this, args);
            };
          }
          function once(func) {
            return before(2, func);
          }
          var overArgs = castRest(function(func, transforms) {
            transforms = transforms.length == 1 && isArray2(transforms[0]) ? arrayMap(transforms[0], baseUnary(getIteratee())) : arrayMap(baseFlatten(transforms, 1), baseUnary(getIteratee()));
            var funcsLength = transforms.length;
            return baseRest(function(args) {
              var index = -1, length2 = nativeMin(args.length, funcsLength);
              while (++index < length2) {
                args[index] = transforms[index].call(this, args[index]);
              }
              return apply(func, this, args);
            });
          });
          var partial = baseRest(function(func, partials) {
            var holders = replaceHolders(partials, getHolder(partial));
            return createWrap(func, WRAP_PARTIAL_FLAG, undefined2, partials, holders);
          });
          var partialRight = baseRest(function(func, partials) {
            var holders = replaceHolders(partials, getHolder(partialRight));
            return createWrap(func, WRAP_PARTIAL_RIGHT_FLAG, undefined2, partials, holders);
          });
          var rearg = flatRest(function(func, indexes) {
            return createWrap(func, WRAP_REARG_FLAG, undefined2, undefined2, undefined2, indexes);
          });
          function rest(func, start) {
            if (typeof func != "function") {
              throw new TypeError2(FUNC_ERROR_TEXT);
            }
            start = start === undefined2 ? start : toInteger(start);
            return baseRest(func, start);
          }
          function spread3(func, start) {
            if (typeof func != "function") {
              throw new TypeError2(FUNC_ERROR_TEXT);
            }
            start = start == null ? 0 : nativeMax(toInteger(start), 0);
            return baseRest(function(args) {
              var array = args[start], otherArgs = castSlice(args, 0, start);
              if (array) {
                arrayPush(otherArgs, array);
              }
              return apply(func, this, otherArgs);
            });
          }
          function throttle(func, wait, options) {
            var leading = true, trailing = true;
            if (typeof func != "function") {
              throw new TypeError2(FUNC_ERROR_TEXT);
            }
            if (isObject3(options)) {
              leading = "leading" in options ? !!options.leading : leading;
              trailing = "trailing" in options ? !!options.trailing : trailing;
            }
            return debounce(func, wait, {
              "leading": leading,
              "maxWait": wait,
              "trailing": trailing
            });
          }
          function unary(func) {
            return ary(func, 1);
          }
          function wrap(value2, wrapper) {
            return partial(castFunction(wrapper), value2);
          }
          function castArray() {
            if (!arguments.length) {
              return [];
            }
            var value2 = arguments[0];
            return isArray2(value2) ? value2 : [value2];
          }
          function clone(value2) {
            return baseClone(value2, CLONE_SYMBOLS_FLAG);
          }
          function cloneWith(value2, customizer) {
            customizer = typeof customizer == "function" ? customizer : undefined2;
            return baseClone(value2, CLONE_SYMBOLS_FLAG, customizer);
          }
          function cloneDeep(value2) {
            return baseClone(value2, CLONE_DEEP_FLAG | CLONE_SYMBOLS_FLAG);
          }
          function cloneDeepWith(value2, customizer) {
            customizer = typeof customizer == "function" ? customizer : undefined2;
            return baseClone(value2, CLONE_DEEP_FLAG | CLONE_SYMBOLS_FLAG, customizer);
          }
          function conformsTo(object, source) {
            return source == null || baseConformsTo(object, source, keys(source));
          }
          function eq(value2, other) {
            return value2 === other || value2 !== value2 && other !== other;
          }
          var gt = createRelationalOperation(baseGt);
          var gte = createRelationalOperation(function(value2, other) {
            return value2 >= other;
          });
          var isArguments = baseIsArguments(function() {
            return arguments;
          }()) ? baseIsArguments : function(value2) {
            return isObjectLike(value2) && hasOwnProperty2.call(value2, "callee") && !propertyIsEnumerable.call(value2, "callee");
          };
          var isArray2 = Array2.isArray;
          var isArrayBuffer2 = nodeIsArrayBuffer ? baseUnary(nodeIsArrayBuffer) : baseIsArrayBuffer;
          function isArrayLike(value2) {
            return value2 != null && isLength(value2.length) && !isFunction2(value2);
          }
          function isArrayLikeObject(value2) {
            return isObjectLike(value2) && isArrayLike(value2);
          }
          function isBoolean2(value2) {
            return value2 === true || value2 === false || isObjectLike(value2) && baseGetTag(value2) == boolTag;
          }
          var isBuffer2 = nativeIsBuffer || stubFalse;
          var isDate2 = nodeIsDate ? baseUnary(nodeIsDate) : baseIsDate;
          function isElement(value2) {
            return isObjectLike(value2) && value2.nodeType === 1 && !isPlainObject2(value2);
          }
          function isEmpty(value2) {
            if (value2 == null) {
              return true;
            }
            if (isArrayLike(value2) && (isArray2(value2) || typeof value2 == "string" || typeof value2.splice == "function" || isBuffer2(value2) || isTypedArray2(value2) || isArguments(value2))) {
              return !value2.length;
            }
            var tag = getTag(value2);
            if (tag == mapTag || tag == setTag) {
              return !value2.size;
            }
            if (isPrototype(value2)) {
              return !baseKeys(value2).length;
            }
            for (var key in value2) {
              if (hasOwnProperty2.call(value2, key)) {
                return false;
              }
            }
            return true;
          }
          function isEqual(value2, other) {
            return baseIsEqual(value2, other);
          }
          function isEqualWith(value2, other, customizer) {
            customizer = typeof customizer == "function" ? customizer : undefined2;
            var result2 = customizer ? customizer(value2, other) : undefined2;
            return result2 === undefined2 ? baseIsEqual(value2, other, undefined2, customizer) : !!result2;
          }
          function isError(value2) {
            if (!isObjectLike(value2)) {
              return false;
            }
            var tag = baseGetTag(value2);
            return tag == errorTag || tag == domExcTag || typeof value2.message == "string" && typeof value2.name == "string" && !isPlainObject2(value2);
          }
          function isFinite2(value2) {
            return typeof value2 == "number" && nativeIsFinite(value2);
          }
          function isFunction2(value2) {
            if (!isObject3(value2)) {
              return false;
            }
            var tag = baseGetTag(value2);
            return tag == funcTag || tag == genTag || tag == asyncTag || tag == proxyTag;
          }
          function isInteger(value2) {
            return typeof value2 == "number" && value2 == toInteger(value2);
          }
          function isLength(value2) {
            return typeof value2 == "number" && value2 > -1 && value2 % 1 == 0 && value2 <= MAX_SAFE_INTEGER;
          }
          function isObject3(value2) {
            var type = typeof value2;
            return value2 != null && (type == "object" || type == "function");
          }
          function isObjectLike(value2) {
            return value2 != null && typeof value2 == "object";
          }
          var isMap = nodeIsMap ? baseUnary(nodeIsMap) : baseIsMap;
          function isMatch(object, source) {
            return object === source || baseIsMatch(object, source, getMatchData(source));
          }
          function isMatchWith(object, source, customizer) {
            customizer = typeof customizer == "function" ? customizer : undefined2;
            return baseIsMatch(object, source, getMatchData(source), customizer);
          }
          function isNaN2(value2) {
            return isNumber2(value2) && value2 != +value2;
          }
          function isNative(value2) {
            if (isMaskable(value2)) {
              throw new Error2(CORE_ERROR_TEXT);
            }
            return baseIsNative(value2);
          }
          function isNull(value2) {
            return value2 === null;
          }
          function isNil(value2) {
            return value2 == null;
          }
          function isNumber2(value2) {
            return typeof value2 == "number" || isObjectLike(value2) && baseGetTag(value2) == numberTag;
          }
          function isPlainObject2(value2) {
            if (!isObjectLike(value2) || baseGetTag(value2) != objectTag) {
              return false;
            }
            var proto = getPrototype(value2);
            if (proto === null) {
              return true;
            }
            var Ctor = hasOwnProperty2.call(proto, "constructor") && proto.constructor;
            return typeof Ctor == "function" && Ctor instanceof Ctor && funcToString.call(Ctor) == objectCtorString;
          }
          var isRegExp2 = nodeIsRegExp ? baseUnary(nodeIsRegExp) : baseIsRegExp;
          function isSafeInteger(value2) {
            return isInteger(value2) && value2 >= -MAX_SAFE_INTEGER && value2 <= MAX_SAFE_INTEGER;
          }
          var isSet = nodeIsSet ? baseUnary(nodeIsSet) : baseIsSet;
          function isString2(value2) {
            return typeof value2 == "string" || !isArray2(value2) && isObjectLike(value2) && baseGetTag(value2) == stringTag;
          }
          function isSymbol(value2) {
            return typeof value2 == "symbol" || isObjectLike(value2) && baseGetTag(value2) == symbolTag;
          }
          var isTypedArray2 = nodeIsTypedArray ? baseUnary(nodeIsTypedArray) : baseIsTypedArray;
          function isUndefined2(value2) {
            return value2 === undefined2;
          }
          function isWeakMap(value2) {
            return isObjectLike(value2) && getTag(value2) == weakMapTag;
          }
          function isWeakSet(value2) {
            return isObjectLike(value2) && baseGetTag(value2) == weakSetTag;
          }
          var lt = createRelationalOperation(baseLt);
          var lte = createRelationalOperation(function(value2, other) {
            return value2 <= other;
          });
          function toArray3(value2) {
            if (!value2) {
              return [];
            }
            if (isArrayLike(value2)) {
              return isString2(value2) ? stringToArray(value2) : copyArray(value2);
            }
            if (symIterator && value2[symIterator]) {
              return iteratorToArray(value2[symIterator]());
            }
            var tag = getTag(value2), func = tag == mapTag ? mapToArray : tag == setTag ? setToArray : values;
            return func(value2);
          }
          function toFinite(value2) {
            if (!value2) {
              return value2 === 0 ? value2 : 0;
            }
            value2 = toNumber(value2);
            if (value2 === INFINITY || value2 === -INFINITY) {
              var sign = value2 < 0 ? -1 : 1;
              return sign * MAX_INTEGER;
            }
            return value2 === value2 ? value2 : 0;
          }
          function toInteger(value2) {
            var result2 = toFinite(value2), remainder = result2 % 1;
            return result2 === result2 ? remainder ? result2 - remainder : result2 : 0;
          }
          function toLength(value2) {
            return value2 ? baseClamp(toInteger(value2), 0, MAX_ARRAY_LENGTH) : 0;
          }
          function toNumber(value2) {
            if (typeof value2 == "number") {
              return value2;
            }
            if (isSymbol(value2)) {
              return NAN;
            }
            if (isObject3(value2)) {
              var other = typeof value2.valueOf == "function" ? value2.valueOf() : value2;
              value2 = isObject3(other) ? other + "" : other;
            }
            if (typeof value2 != "string") {
              return value2 === 0 ? value2 : +value2;
            }
            value2 = baseTrim(value2);
            var isBinary2 = reIsBinary.test(value2);
            return isBinary2 || reIsOctal.test(value2) ? freeParseInt(value2.slice(2), isBinary2 ? 2 : 8) : reIsBadHex.test(value2) ? NAN : +value2;
          }
          function toPlainObject(value2) {
            return copyObject(value2, keysIn(value2));
          }
          function toSafeInteger(value2) {
            return value2 ? baseClamp(toInteger(value2), -MAX_SAFE_INTEGER, MAX_SAFE_INTEGER) : value2 === 0 ? value2 : 0;
          }
          function toString4(value2) {
            return value2 == null ? "" : baseToString(value2);
          }
          var assign = createAssigner(function(object, source) {
            if (isPrototype(source) || isArrayLike(source)) {
              copyObject(source, keys(source), object);
              return;
            }
            for (var key in source) {
              if (hasOwnProperty2.call(source, key)) {
                assignValue(object, key, source[key]);
              }
            }
          });
          var assignIn = createAssigner(function(object, source) {
            copyObject(source, keysIn(source), object);
          });
          var assignInWith = createAssigner(function(object, source, srcIndex, customizer) {
            copyObject(source, keysIn(source), object, customizer);
          });
          var assignWith = createAssigner(function(object, source, srcIndex, customizer) {
            copyObject(source, keys(source), object, customizer);
          });
          var at = flatRest(baseAt);
          function create(prototype3, properties) {
            var result2 = baseCreate(prototype3);
            return properties == null ? result2 : baseAssign(result2, properties);
          }
          var defaults2 = baseRest(function(object, sources) {
            object = Object2(object);
            var index = -1;
            var length2 = sources.length;
            var guard = length2 > 2 ? sources[2] : undefined2;
            if (guard && isIterateeCall(sources[0], sources[1], guard)) {
              length2 = 1;
            }
            while (++index < length2) {
              var source = sources[index];
              var props = keysIn(source);
              var propsIndex = -1;
              var propsLength = props.length;
              while (++propsIndex < propsLength) {
                var key = props[propsIndex];
                var value2 = object[key];
                if (value2 === undefined2 || eq(value2, objectProto[key]) && !hasOwnProperty2.call(object, key)) {
                  object[key] = source[key];
                }
              }
            }
            return object;
          });
          var defaultsDeep = baseRest(function(args) {
            args.push(undefined2, customDefaultsMerge);
            return apply(mergeWith, undefined2, args);
          });
          function findKey2(object, predicate) {
            return baseFindKey(object, getIteratee(predicate, 3), baseForOwn);
          }
          function findLastKey(object, predicate) {
            return baseFindKey(object, getIteratee(predicate, 3), baseForOwnRight);
          }
          function forIn(object, iteratee2) {
            return object == null ? object : baseFor(object, getIteratee(iteratee2, 3), keysIn);
          }
          function forInRight(object, iteratee2) {
            return object == null ? object : baseForRight(object, getIteratee(iteratee2, 3), keysIn);
          }
          function forOwn(object, iteratee2) {
            return object && baseForOwn(object, getIteratee(iteratee2, 3));
          }
          function forOwnRight(object, iteratee2) {
            return object && baseForOwnRight(object, getIteratee(iteratee2, 3));
          }
          function functions(object) {
            return object == null ? [] : baseFunctions(object, keys(object));
          }
          function functionsIn(object) {
            return object == null ? [] : baseFunctions(object, keysIn(object));
          }
          function get(object, path, defaultValue) {
            var result2 = object == null ? undefined2 : baseGet(object, path);
            return result2 === undefined2 ? defaultValue : result2;
          }
          function has(object, path) {
            return object != null && hasPath(object, path, baseHas);
          }
          function hasIn(object, path) {
            return object != null && hasPath(object, path, baseHasIn);
          }
          var invert = createInverter(function(result2, value2, key) {
            if (value2 != null && typeof value2.toString != "function") {
              value2 = nativeObjectToString.call(value2);
            }
            result2[value2] = key;
          }, constant(identity));
          var invertBy = createInverter(function(result2, value2, key) {
            if (value2 != null && typeof value2.toString != "function") {
              value2 = nativeObjectToString.call(value2);
            }
            if (hasOwnProperty2.call(result2, value2)) {
              result2[value2].push(key);
            } else {
              result2[value2] = [key];
            }
          }, getIteratee);
          var invoke = baseRest(baseInvoke);
          function keys(object) {
            return isArrayLike(object) ? arrayLikeKeys(object) : baseKeys(object);
          }
          function keysIn(object) {
            return isArrayLike(object) ? arrayLikeKeys(object, true) : baseKeysIn(object);
          }
          function mapKeys(object, iteratee2) {
            var result2 = {};
            iteratee2 = getIteratee(iteratee2, 3);
            baseForOwn(object, function(value2, key, object2) {
              baseAssignValue(result2, iteratee2(value2, key, object2), value2);
            });
            return result2;
          }
          function mapValues(object, iteratee2) {
            var result2 = {};
            iteratee2 = getIteratee(iteratee2, 3);
            baseForOwn(object, function(value2, key, object2) {
              baseAssignValue(result2, key, iteratee2(value2, key, object2));
            });
            return result2;
          }
          var merge2 = createAssigner(function(object, source, srcIndex) {
            baseMerge(object, source, srcIndex);
          });
          var mergeWith = createAssigner(function(object, source, srcIndex, customizer) {
            baseMerge(object, source, srcIndex, customizer);
          });
          var omit = flatRest(function(object, paths) {
            var result2 = {};
            if (object == null) {
              return result2;
            }
            var isDeep = false;
            paths = arrayMap(paths, function(path) {
              path = castPath(path, object);
              isDeep || (isDeep = path.length > 1);
              return path;
            });
            copyObject(object, getAllKeysIn(object), result2);
            if (isDeep) {
              result2 = baseClone(result2, CLONE_DEEP_FLAG | CLONE_FLAT_FLAG | CLONE_SYMBOLS_FLAG, customOmitClone);
            }
            var length2 = paths.length;
            while (length2--) {
              baseUnset(result2, paths[length2]);
            }
            return result2;
          });
          function omitBy(object, predicate) {
            return pickBy(object, negate(getIteratee(predicate)));
          }
          var pick3 = flatRest(function(object, paths) {
            return object == null ? {} : basePick(object, paths);
          });
          function pickBy(object, predicate) {
            if (object == null) {
              return {};
            }
            var props = arrayMap(getAllKeysIn(object), function(prop) {
              return [prop];
            });
            predicate = getIteratee(predicate);
            return basePickBy(object, props, function(value2, path) {
              return predicate(value2, path[0]);
            });
          }
          function result(object, path, defaultValue) {
            path = castPath(path, object);
            var index = -1, length2 = path.length;
            if (!length2) {
              length2 = 1;
              object = undefined2;
            }
            while (++index < length2) {
              var value2 = object == null ? undefined2 : object[toKey(path[index])];
              if (value2 === undefined2) {
                index = length2;
                value2 = defaultValue;
              }
              object = isFunction2(value2) ? value2.call(object) : value2;
            }
            return object;
          }
          function set(object, path, value2) {
            return object == null ? object : baseSet(object, path, value2);
          }
          function setWith(object, path, value2, customizer) {
            customizer = typeof customizer == "function" ? customizer : undefined2;
            return object == null ? object : baseSet(object, path, value2, customizer);
          }
          var toPairs = createToPairs(keys);
          var toPairsIn = createToPairs(keysIn);
          function transform(object, iteratee2, accumulator) {
            var isArr = isArray2(object), isArrLike = isArr || isBuffer2(object) || isTypedArray2(object);
            iteratee2 = getIteratee(iteratee2, 4);
            if (accumulator == null) {
              var Ctor = object && object.constructor;
              if (isArrLike) {
                accumulator = isArr ? new Ctor() : [];
              } else if (isObject3(object)) {
                accumulator = isFunction2(Ctor) ? baseCreate(getPrototype(object)) : {};
              } else {
                accumulator = {};
              }
            }
            (isArrLike ? arrayEach : baseForOwn)(object, function(value2, index, object2) {
              return iteratee2(accumulator, value2, index, object2);
            });
            return accumulator;
          }
          function unset(object, path) {
            return object == null ? true : baseUnset(object, path);
          }
          function update(object, path, updater) {
            return object == null ? object : baseUpdate(object, path, castFunction(updater));
          }
          function updateWith(object, path, updater, customizer) {
            customizer = typeof customizer == "function" ? customizer : undefined2;
            return object == null ? object : baseUpdate(object, path, castFunction(updater), customizer);
          }
          function values(object) {
            return object == null ? [] : baseValues(object, keys(object));
          }
          function valuesIn(object) {
            return object == null ? [] : baseValues(object, keysIn(object));
          }
          function clamp(number, lower, upper) {
            if (upper === undefined2) {
              upper = lower;
              lower = undefined2;
            }
            if (upper !== undefined2) {
              upper = toNumber(upper);
              upper = upper === upper ? upper : 0;
            }
            if (lower !== undefined2) {
              lower = toNumber(lower);
              lower = lower === lower ? lower : 0;
            }
            return baseClamp(toNumber(number), lower, upper);
          }
          function inRange(number, start, end) {
            start = toFinite(start);
            if (end === undefined2) {
              end = start;
              start = 0;
            } else {
              end = toFinite(end);
            }
            number = toNumber(number);
            return baseInRange(number, start, end);
          }
          function random(lower, upper, floating) {
            if (floating && typeof floating != "boolean" && isIterateeCall(lower, upper, floating)) {
              upper = floating = undefined2;
            }
            if (floating === undefined2) {
              if (typeof upper == "boolean") {
                floating = upper;
                upper = undefined2;
              } else if (typeof lower == "boolean") {
                floating = lower;
                lower = undefined2;
              }
            }
            if (lower === undefined2 && upper === undefined2) {
              lower = 0;
              upper = 1;
            } else {
              lower = toFinite(lower);
              if (upper === undefined2) {
                upper = lower;
                lower = 0;
              } else {
                upper = toFinite(upper);
              }
            }
            if (lower > upper) {
              var temp = lower;
              lower = upper;
              upper = temp;
            }
            if (floating || lower % 1 || upper % 1) {
              var rand = nativeRandom();
              return nativeMin(lower + rand * (upper - lower + freeParseFloat("1e-" + ((rand + "").length - 1))), upper);
            }
            return baseRandom(lower, upper);
          }
          var camelCase = createCompounder(function(result2, word, index) {
            word = word.toLowerCase();
            return result2 + (index ? capitalize(word) : word);
          });
          function capitalize(string) {
            return upperFirst(toString4(string).toLowerCase());
          }
          function deburr(string) {
            string = toString4(string);
            return string && string.replace(reLatin, deburrLetter).replace(reComboMark, "");
          }
          function endsWith2(string, target, position) {
            string = toString4(string);
            target = baseToString(target);
            var length2 = string.length;
            position = position === undefined2 ? length2 : baseClamp(toInteger(position), 0, length2);
            var end = position;
            position -= target.length;
            return position >= 0 && string.slice(position, end) == target;
          }
          function escape(string) {
            string = toString4(string);
            return string && reHasUnescapedHtml.test(string) ? string.replace(reUnescapedHtml, escapeHtmlChar) : string;
          }
          function escapeRegExp(string) {
            string = toString4(string);
            return string && reHasRegExpChar.test(string) ? string.replace(reRegExpChar, "\\$&") : string;
          }
          var kebabCase = createCompounder(function(result2, word, index) {
            return result2 + (index ? "-" : "") + word.toLowerCase();
          });
          var lowerCase = createCompounder(function(result2, word, index) {
            return result2 + (index ? " " : "") + word.toLowerCase();
          });
          var lowerFirst = createCaseFirst("toLowerCase");
          function pad(string, length2, chars2) {
            string = toString4(string);
            length2 = toInteger(length2);
            var strLength = length2 ? stringSize(string) : 0;
            if (!length2 || strLength >= length2) {
              return string;
            }
            var mid = (length2 - strLength) / 2;
            return createPadding(nativeFloor(mid), chars2) + string + createPadding(nativeCeil(mid), chars2);
          }
          function padEnd(string, length2, chars2) {
            string = toString4(string);
            length2 = toInteger(length2);
            var strLength = length2 ? stringSize(string) : 0;
            return length2 && strLength < length2 ? string + createPadding(length2 - strLength, chars2) : string;
          }
          function padStart(string, length2, chars2) {
            string = toString4(string);
            length2 = toInteger(length2);
            var strLength = length2 ? stringSize(string) : 0;
            return length2 && strLength < length2 ? createPadding(length2 - strLength, chars2) + string : string;
          }
          function parseInt2(string, radix, guard) {
            if (guard || radix == null) {
              radix = 0;
            } else if (radix) {
              radix = +radix;
            }
            return nativeParseInt(toString4(string).replace(reTrimStart, ""), radix || 0);
          }
          function repeat(string, n, guard) {
            if (guard ? isIterateeCall(string, n, guard) : n === undefined2) {
              n = 1;
            } else {
              n = toInteger(n);
            }
            return baseRepeat(toString4(string), n);
          }
          function replace() {
            var args = arguments, string = toString4(args[0]);
            return args.length < 3 ? string : string.replace(args[1], args[2]);
          }
          var snakeCase = createCompounder(function(result2, word, index) {
            return result2 + (index ? "_" : "") + word.toLowerCase();
          });
          function split(string, separator, limit) {
            if (limit && typeof limit != "number" && isIterateeCall(string, separator, limit)) {
              separator = limit = undefined2;
            }
            limit = limit === undefined2 ? MAX_ARRAY_LENGTH : limit >>> 0;
            if (!limit) {
              return [];
            }
            string = toString4(string);
            if (string && (typeof separator == "string" || separator != null && !isRegExp2(separator))) {
              separator = baseToString(separator);
              if (!separator && hasUnicode(string)) {
                return castSlice(stringToArray(string), 0, limit);
              }
            }
            return string.split(separator, limit);
          }
          var startCase = createCompounder(function(result2, word, index) {
            return result2 + (index ? " " : "") + upperFirst(word);
          });
          function startsWith(string, target, position) {
            string = toString4(string);
            position = position == null ? 0 : baseClamp(toInteger(position), 0, string.length);
            target = baseToString(target);
            return string.slice(position, position + target.length) == target;
          }
          function template(string, options, guard) {
            var settings = lodash.templateSettings;
            if (guard && isIterateeCall(string, options, guard)) {
              options = undefined2;
            }
            string = toString4(string);
            options = assignInWith({}, options, settings, customDefaultsAssignIn);
            var imports = assignInWith({}, options.imports, settings.imports, customDefaultsAssignIn), importsKeys = keys(imports), importsValues = baseValues(imports, importsKeys);
            var isEscaping, isEvaluating, index = 0, interpolate = options.interpolate || reNoMatch, source = "__p += '";
            var reDelimiters = RegExp2(
              (options.escape || reNoMatch).source + "|" + interpolate.source + "|" + (interpolate === reInterpolate ? reEsTemplate : reNoMatch).source + "|" + (options.evaluate || reNoMatch).source + "|$",
              "g"
            );
            var sourceURL = "//# sourceURL=" + (hasOwnProperty2.call(options, "sourceURL") ? (options.sourceURL + "").replace(/\s/g, " ") : "lodash.templateSources[" + ++templateCounter + "]") + "\n";
            string.replace(reDelimiters, function(match, escapeValue, interpolateValue, esTemplateValue, evaluateValue, offset) {
              interpolateValue || (interpolateValue = esTemplateValue);
              source += string.slice(index, offset).replace(reUnescapedString, escapeStringChar);
              if (escapeValue) {
                isEscaping = true;
                source += "' +\n__e(" + escapeValue + ") +\n'";
              }
              if (evaluateValue) {
                isEvaluating = true;
                source += "';\n" + evaluateValue + ";\n__p += '";
              }
              if (interpolateValue) {
                source += "' +\n((__t = (" + interpolateValue + ")) == null ? '' : __t) +\n'";
              }
              index = offset + match.length;
              return match;
            });
            source += "';\n";
            var variable = hasOwnProperty2.call(options, "variable") && options.variable;
            if (!variable) {
              source = "with (obj) {\n" + source + "\n}\n";
            } else if (reForbiddenIdentifierChars.test(variable)) {
              throw new Error2(INVALID_TEMPL_VAR_ERROR_TEXT);
            }
            source = (isEvaluating ? source.replace(reEmptyStringLeading, "") : source).replace(reEmptyStringMiddle, "$1").replace(reEmptyStringTrailing, "$1;");
            source = "function(" + (variable || "obj") + ") {\n" + (variable ? "" : "obj || (obj = {});\n") + "var __t, __p = ''" + (isEscaping ? ", __e = _.escape" : "") + (isEvaluating ? ", __j = Array.prototype.join;\nfunction print() { __p += __j.call(arguments, '') }\n" : ";\n") + source + "return __p\n}";
            var result2 = attempt(function() {
              return Function2(importsKeys, sourceURL + "return " + source).apply(undefined2, importsValues);
            });
            result2.source = source;
            if (isError(result2)) {
              throw result2;
            }
            return result2;
          }
          function toLower(value2) {
            return toString4(value2).toLowerCase();
          }
          function toUpper(value2) {
            return toString4(value2).toUpperCase();
          }
          function trim2(string, chars2, guard) {
            string = toString4(string);
            if (string && (guard || chars2 === undefined2)) {
              return baseTrim(string);
            }
            if (!string || !(chars2 = baseToString(chars2))) {
              return string;
            }
            var strSymbols = stringToArray(string), chrSymbols = stringToArray(chars2), start = charsStartIndex(strSymbols, chrSymbols), end = charsEndIndex(strSymbols, chrSymbols) + 1;
            return castSlice(strSymbols, start, end).join("");
          }
          function trimEnd(string, chars2, guard) {
            string = toString4(string);
            if (string && (guard || chars2 === undefined2)) {
              return string.slice(0, trimmedEndIndex(string) + 1);
            }
            if (!string || !(chars2 = baseToString(chars2))) {
              return string;
            }
            var strSymbols = stringToArray(string), end = charsEndIndex(strSymbols, stringToArray(chars2)) + 1;
            return castSlice(strSymbols, 0, end).join("");
          }
          function trimStart(string, chars2, guard) {
            string = toString4(string);
            if (string && (guard || chars2 === undefined2)) {
              return string.replace(reTrimStart, "");
            }
            if (!string || !(chars2 = baseToString(chars2))) {
              return string;
            }
            var strSymbols = stringToArray(string), start = charsStartIndex(strSymbols, stringToArray(chars2));
            return castSlice(strSymbols, start).join("");
          }
          function truncate(string, options) {
            var length2 = DEFAULT_TRUNC_LENGTH, omission = DEFAULT_TRUNC_OMISSION;
            if (isObject3(options)) {
              var separator = "separator" in options ? options.separator : separator;
              length2 = "length" in options ? toInteger(options.length) : length2;
              omission = "omission" in options ? baseToString(options.omission) : omission;
            }
            string = toString4(string);
            var strLength = string.length;
            if (hasUnicode(string)) {
              var strSymbols = stringToArray(string);
              strLength = strSymbols.length;
            }
            if (length2 >= strLength) {
              return string;
            }
            var end = length2 - stringSize(omission);
            if (end < 1) {
              return omission;
            }
            var result2 = strSymbols ? castSlice(strSymbols, 0, end).join("") : string.slice(0, end);
            if (separator === undefined2) {
              return result2 + omission;
            }
            if (strSymbols) {
              end += result2.length - end;
            }
            if (isRegExp2(separator)) {
              if (string.slice(end).search(separator)) {
                var match, substring = result2;
                if (!separator.global) {
                  separator = RegExp2(separator.source, toString4(reFlags.exec(separator)) + "g");
                }
                separator.lastIndex = 0;
                while (match = separator.exec(substring)) {
                  var newEnd = match.index;
                }
                result2 = result2.slice(0, newEnd === undefined2 ? end : newEnd);
              }
            } else if (string.indexOf(baseToString(separator), end) != end) {
              var index = result2.lastIndexOf(separator);
              if (index > -1) {
                result2 = result2.slice(0, index);
              }
            }
            return result2 + omission;
          }
          function unescape2(string) {
            string = toString4(string);
            return string && reHasEscapedHtml.test(string) ? string.replace(reEscapedHtml, unescapeHtmlChar) : string;
          }
          var upperCase = createCompounder(function(result2, word, index) {
            return result2 + (index ? " " : "") + word.toUpperCase();
          });
          var upperFirst = createCaseFirst("toUpperCase");
          function words(string, pattern, guard) {
            string = toString4(string);
            pattern = guard ? undefined2 : pattern;
            if (pattern === undefined2) {
              return hasUnicodeWord(string) ? unicodeWords(string) : asciiWords(string);
            }
            return string.match(pattern) || [];
          }
          var attempt = baseRest(function(func, args) {
            try {
              return apply(func, undefined2, args);
            } catch (e) {
              return isError(e) ? e : new Error2(e);
            }
          });
          var bindAll = flatRest(function(object, methodNames) {
            arrayEach(methodNames, function(key) {
              key = toKey(key);
              baseAssignValue(object, key, bind2(object[key], object));
            });
            return object;
          });
          function cond(pairs) {
            var length2 = pairs == null ? 0 : pairs.length, toIteratee = getIteratee();
            pairs = !length2 ? [] : arrayMap(pairs, function(pair) {
              if (typeof pair[1] != "function") {
                throw new TypeError2(FUNC_ERROR_TEXT);
              }
              return [toIteratee(pair[0]), pair[1]];
            });
            return baseRest(function(args) {
              var index = -1;
              while (++index < length2) {
                var pair = pairs[index];
                if (apply(pair[0], this, args)) {
                  return apply(pair[1], this, args);
                }
              }
            });
          }
          function conforms(source) {
            return baseConforms(baseClone(source, CLONE_DEEP_FLAG));
          }
          function constant(value2) {
            return function() {
              return value2;
            };
          }
          function defaultTo(value2, defaultValue) {
            return value2 == null || value2 !== value2 ? defaultValue : value2;
          }
          var flow = createFlow();
          var flowRight = createFlow(true);
          function identity(value2) {
            return value2;
          }
          function iteratee(func) {
            return baseIteratee(typeof func == "function" ? func : baseClone(func, CLONE_DEEP_FLAG));
          }
          function matches(source) {
            return baseMatches(baseClone(source, CLONE_DEEP_FLAG));
          }
          function matchesProperty(path, srcValue) {
            return baseMatchesProperty(path, baseClone(srcValue, CLONE_DEEP_FLAG));
          }
          var method = baseRest(function(path, args) {
            return function(object) {
              return baseInvoke(object, path, args);
            };
          });
          var methodOf = baseRest(function(object, args) {
            return function(path) {
              return baseInvoke(object, path, args);
            };
          });
          function mixin2(object, source, options) {
            var props = keys(source), methodNames = baseFunctions(source, props);
            if (options == null && !(isObject3(source) && (methodNames.length || !props.length))) {
              options = source;
              source = object;
              object = this;
              methodNames = baseFunctions(source, keys(source));
            }
            var chain2 = !(isObject3(options) && "chain" in options) || !!options.chain, isFunc = isFunction2(object);
            arrayEach(methodNames, function(methodName) {
              var func = source[methodName];
              object[methodName] = func;
              if (isFunc) {
                object.prototype[methodName] = function() {
                  var chainAll = this.__chain__;
                  if (chain2 || chainAll) {
                    var result2 = object(this.__wrapped__), actions = result2.__actions__ = copyArray(this.__actions__);
                    actions.push({ "func": func, "args": arguments, "thisArg": object });
                    result2.__chain__ = chainAll;
                    return result2;
                  }
                  return func.apply(object, arrayPush([this.value()], arguments));
                };
              }
            });
            return object;
          }
          function noConflict() {
            if (root._ === this) {
              root._ = oldDash;
            }
            return this;
          }
          function noop2() {
          }
          function nthArg(n) {
            n = toInteger(n);
            return baseRest(function(args) {
              return baseNth(args, n);
            });
          }
          var over = createOver(arrayMap);
          var overEvery = createOver(arrayEvery);
          var overSome = createOver(arraySome);
          function property(path) {
            return isKey(path) ? baseProperty(toKey(path)) : basePropertyDeep(path);
          }
          function propertyOf(object) {
            return function(path) {
              return object == null ? undefined2 : baseGet(object, path);
            };
          }
          var range = createRange();
          var rangeRight = createRange(true);
          function stubArray() {
            return [];
          }
          function stubFalse() {
            return false;
          }
          function stubObject() {
            return {};
          }
          function stubString() {
            return "";
          }
          function stubTrue() {
            return true;
          }
          function times(n, iteratee2) {
            n = toInteger(n);
            if (n < 1 || n > MAX_SAFE_INTEGER) {
              return [];
            }
            var index = MAX_ARRAY_LENGTH, length2 = nativeMin(n, MAX_ARRAY_LENGTH);
            iteratee2 = getIteratee(iteratee2);
            n -= MAX_ARRAY_LENGTH;
            var result2 = baseTimes(length2, iteratee2);
            while (++index < n) {
              iteratee2(index);
            }
            return result2;
          }
          function toPath(value2) {
            if (isArray2(value2)) {
              return arrayMap(value2, toKey);
            }
            return isSymbol(value2) ? [value2] : copyArray(stringToPath(toString4(value2)));
          }
          function uniqueId(prefix) {
            var id = ++idCounter;
            return toString4(prefix) + id;
          }
          var add = createMathOperation(function(augend, addend) {
            return augend + addend;
          }, 0);
          var ceil = createRound("ceil");
          var divide = createMathOperation(function(dividend, divisor) {
            return dividend / divisor;
          }, 1);
          var floor = createRound("floor");
          function max(array) {
            return array && array.length ? baseExtremum(array, identity, baseGt) : undefined2;
          }
          function maxBy(array, iteratee2) {
            return array && array.length ? baseExtremum(array, getIteratee(iteratee2, 2), baseGt) : undefined2;
          }
          function mean(array) {
            return baseMean(array, identity);
          }
          function meanBy(array, iteratee2) {
            return baseMean(array, getIteratee(iteratee2, 2));
          }
          function min(array) {
            return array && array.length ? baseExtremum(array, identity, baseLt) : undefined2;
          }
          function minBy(array, iteratee2) {
            return array && array.length ? baseExtremum(array, getIteratee(iteratee2, 2), baseLt) : undefined2;
          }
          var multiply = createMathOperation(function(multiplier, multiplicand) {
            return multiplier * multiplicand;
          }, 1);
          var round = createRound("round");
          var subtract = createMathOperation(function(minuend, subtrahend) {
            return minuend - subtrahend;
          }, 0);
          function sum(array) {
            return array && array.length ? baseSum(array, identity) : 0;
          }
          function sumBy(array, iteratee2) {
            return array && array.length ? baseSum(array, getIteratee(iteratee2, 2)) : 0;
          }
          lodash.after = after;
          lodash.ary = ary;
          lodash.assign = assign;
          lodash.assignIn = assignIn;
          lodash.assignInWith = assignInWith;
          lodash.assignWith = assignWith;
          lodash.at = at;
          lodash.before = before;
          lodash.bind = bind2;
          lodash.bindAll = bindAll;
          lodash.bindKey = bindKey;
          lodash.castArray = castArray;
          lodash.chain = chain;
          lodash.chunk = chunk;
          lodash.compact = compact;
          lodash.concat = concat;
          lodash.cond = cond;
          lodash.conforms = conforms;
          lodash.constant = constant;
          lodash.countBy = countBy;
          lodash.create = create;
          lodash.curry = curry;
          lodash.curryRight = curryRight;
          lodash.debounce = debounce;
          lodash.defaults = defaults2;
          lodash.defaultsDeep = defaultsDeep;
          lodash.defer = defer;
          lodash.delay = delay;
          lodash.difference = difference;
          lodash.differenceBy = differenceBy;
          lodash.differenceWith = differenceWith;
          lodash.drop = drop;
          lodash.dropRight = dropRight;
          lodash.dropRightWhile = dropRightWhile;
          lodash.dropWhile = dropWhile;
          lodash.fill = fill;
          lodash.filter = filter2;
          lodash.flatMap = flatMap;
          lodash.flatMapDeep = flatMapDeep;
          lodash.flatMapDepth = flatMapDepth;
          lodash.flatten = flatten;
          lodash.flattenDeep = flattenDeep;
          lodash.flattenDepth = flattenDepth;
          lodash.flip = flip;
          lodash.flow = flow;
          lodash.flowRight = flowRight;
          lodash.fromPairs = fromPairs;
          lodash.functions = functions;
          lodash.functionsIn = functionsIn;
          lodash.groupBy = groupBy;
          lodash.initial = initial;
          lodash.intersection = intersection;
          lodash.intersectionBy = intersectionBy;
          lodash.intersectionWith = intersectionWith;
          lodash.invert = invert;
          lodash.invertBy = invertBy;
          lodash.invokeMap = invokeMap;
          lodash.iteratee = iteratee;
          lodash.keyBy = keyBy;
          lodash.keys = keys;
          lodash.keysIn = keysIn;
          lodash.map = map2;
          lodash.mapKeys = mapKeys;
          lodash.mapValues = mapValues;
          lodash.matches = matches;
          lodash.matchesProperty = matchesProperty;
          lodash.memoize = memoize;
          lodash.merge = merge2;
          lodash.mergeWith = mergeWith;
          lodash.method = method;
          lodash.methodOf = methodOf;
          lodash.mixin = mixin2;
          lodash.negate = negate;
          lodash.nthArg = nthArg;
          lodash.omit = omit;
          lodash.omitBy = omitBy;
          lodash.once = once;
          lodash.orderBy = orderBy;
          lodash.over = over;
          lodash.overArgs = overArgs;
          lodash.overEvery = overEvery;
          lodash.overSome = overSome;
          lodash.partial = partial;
          lodash.partialRight = partialRight;
          lodash.partition = partition;
          lodash.pick = pick3;
          lodash.pickBy = pickBy;
          lodash.property = property;
          lodash.propertyOf = propertyOf;
          lodash.pull = pull;
          lodash.pullAll = pullAll;
          lodash.pullAllBy = pullAllBy;
          lodash.pullAllWith = pullAllWith;
          lodash.pullAt = pullAt;
          lodash.range = range;
          lodash.rangeRight = rangeRight;
          lodash.rearg = rearg;
          lodash.reject = reject;
          lodash.remove = remove;
          lodash.rest = rest;
          lodash.reverse = reverse;
          lodash.sampleSize = sampleSize;
          lodash.set = set;
          lodash.setWith = setWith;
          lodash.shuffle = shuffle;
          lodash.slice = slice;
          lodash.sortBy = sortBy;
          lodash.sortedUniq = sortedUniq;
          lodash.sortedUniqBy = sortedUniqBy;
          lodash.split = split;
          lodash.spread = spread3;
          lodash.tail = tail;
          lodash.take = take;
          lodash.takeRight = takeRight;
          lodash.takeRightWhile = takeRightWhile;
          lodash.takeWhile = takeWhile;
          lodash.tap = tap;
          lodash.throttle = throttle;
          lodash.thru = thru;
          lodash.toArray = toArray3;
          lodash.toPairs = toPairs;
          lodash.toPairsIn = toPairsIn;
          lodash.toPath = toPath;
          lodash.toPlainObject = toPlainObject;
          lodash.transform = transform;
          lodash.unary = unary;
          lodash.union = union;
          lodash.unionBy = unionBy;
          lodash.unionWith = unionWith;
          lodash.uniq = uniq;
          lodash.uniqBy = uniqBy;
          lodash.uniqWith = uniqWith;
          lodash.unset = unset;
          lodash.unzip = unzip;
          lodash.unzipWith = unzipWith;
          lodash.update = update;
          lodash.updateWith = updateWith;
          lodash.values = values;
          lodash.valuesIn = valuesIn;
          lodash.without = without;
          lodash.words = words;
          lodash.wrap = wrap;
          lodash.xor = xor;
          lodash.xorBy = xorBy;
          lodash.xorWith = xorWith;
          lodash.zip = zip;
          lodash.zipObject = zipObject;
          lodash.zipObjectDeep = zipObjectDeep;
          lodash.zipWith = zipWith;
          lodash.entries = toPairs;
          lodash.entriesIn = toPairsIn;
          lodash.extend = assignIn;
          lodash.extendWith = assignInWith;
          mixin2(lodash, lodash);
          lodash.add = add;
          lodash.attempt = attempt;
          lodash.camelCase = camelCase;
          lodash.capitalize = capitalize;
          lodash.ceil = ceil;
          lodash.clamp = clamp;
          lodash.clone = clone;
          lodash.cloneDeep = cloneDeep;
          lodash.cloneDeepWith = cloneDeepWith;
          lodash.cloneWith = cloneWith;
          lodash.conformsTo = conformsTo;
          lodash.deburr = deburr;
          lodash.defaultTo = defaultTo;
          lodash.divide = divide;
          lodash.endsWith = endsWith2;
          lodash.eq = eq;
          lodash.escape = escape;
          lodash.escapeRegExp = escapeRegExp;
          lodash.every = every;
          lodash.find = find;
          lodash.findIndex = findIndex;
          lodash.findKey = findKey2;
          lodash.findLast = findLast;
          lodash.findLastIndex = findLastIndex;
          lodash.findLastKey = findLastKey;
          lodash.floor = floor;
          lodash.forEach = forEach2;
          lodash.forEachRight = forEachRight;
          lodash.forIn = forIn;
          lodash.forInRight = forInRight;
          lodash.forOwn = forOwn;
          lodash.forOwnRight = forOwnRight;
          lodash.get = get;
          lodash.gt = gt;
          lodash.gte = gte;
          lodash.has = has;
          lodash.hasIn = hasIn;
          lodash.head = head;
          lodash.identity = identity;
          lodash.includes = includes;
          lodash.indexOf = indexOf;
          lodash.inRange = inRange;
          lodash.invoke = invoke;
          lodash.isArguments = isArguments;
          lodash.isArray = isArray2;
          lodash.isArrayBuffer = isArrayBuffer2;
          lodash.isArrayLike = isArrayLike;
          lodash.isArrayLikeObject = isArrayLikeObject;
          lodash.isBoolean = isBoolean2;
          lodash.isBuffer = isBuffer2;
          lodash.isDate = isDate2;
          lodash.isElement = isElement;
          lodash.isEmpty = isEmpty;
          lodash.isEqual = isEqual;
          lodash.isEqualWith = isEqualWith;
          lodash.isError = isError;
          lodash.isFinite = isFinite2;
          lodash.isFunction = isFunction2;
          lodash.isInteger = isInteger;
          lodash.isLength = isLength;
          lodash.isMap = isMap;
          lodash.isMatch = isMatch;
          lodash.isMatchWith = isMatchWith;
          lodash.isNaN = isNaN2;
          lodash.isNative = isNative;
          lodash.isNil = isNil;
          lodash.isNull = isNull;
          lodash.isNumber = isNumber2;
          lodash.isObject = isObject3;
          lodash.isObjectLike = isObjectLike;
          lodash.isPlainObject = isPlainObject2;
          lodash.isRegExp = isRegExp2;
          lodash.isSafeInteger = isSafeInteger;
          lodash.isSet = isSet;
          lodash.isString = isString2;
          lodash.isSymbol = isSymbol;
          lodash.isTypedArray = isTypedArray2;
          lodash.isUndefined = isUndefined2;
          lodash.isWeakMap = isWeakMap;
          lodash.isWeakSet = isWeakSet;
          lodash.join = join;
          lodash.kebabCase = kebabCase;
          lodash.last = last;
          lodash.lastIndexOf = lastIndexOf;
          lodash.lowerCase = lowerCase;
          lodash.lowerFirst = lowerFirst;
          lodash.lt = lt;
          lodash.lte = lte;
          lodash.max = max;
          lodash.maxBy = maxBy;
          lodash.mean = mean;
          lodash.meanBy = meanBy;
          lodash.min = min;
          lodash.minBy = minBy;
          lodash.stubArray = stubArray;
          lodash.stubFalse = stubFalse;
          lodash.stubObject = stubObject;
          lodash.stubString = stubString;
          lodash.stubTrue = stubTrue;
          lodash.multiply = multiply;
          lodash.nth = nth;
          lodash.noConflict = noConflict;
          lodash.noop = noop2;
          lodash.now = now;
          lodash.pad = pad;
          lodash.padEnd = padEnd;
          lodash.padStart = padStart;
          lodash.parseInt = parseInt2;
          lodash.random = random;
          lodash.reduce = reduce;
          lodash.reduceRight = reduceRight;
          lodash.repeat = repeat;
          lodash.replace = replace;
          lodash.result = result;
          lodash.round = round;
          lodash.runInContext = runInContext2;
          lodash.sample = sample;
          lodash.size = size;
          lodash.snakeCase = snakeCase;
          lodash.some = some;
          lodash.sortedIndex = sortedIndex;
          lodash.sortedIndexBy = sortedIndexBy;
          lodash.sortedIndexOf = sortedIndexOf;
          lodash.sortedLastIndex = sortedLastIndex;
          lodash.sortedLastIndexBy = sortedLastIndexBy;
          lodash.sortedLastIndexOf = sortedLastIndexOf;
          lodash.startCase = startCase;
          lodash.startsWith = startsWith;
          lodash.subtract = subtract;
          lodash.sum = sum;
          lodash.sumBy = sumBy;
          lodash.template = template;
          lodash.times = times;
          lodash.toFinite = toFinite;
          lodash.toInteger = toInteger;
          lodash.toLength = toLength;
          lodash.toLower = toLower;
          lodash.toNumber = toNumber;
          lodash.toSafeInteger = toSafeInteger;
          lodash.toString = toString4;
          lodash.toUpper = toUpper;
          lodash.trim = trim2;
          lodash.trimEnd = trimEnd;
          lodash.trimStart = trimStart;
          lodash.truncate = truncate;
          lodash.unescape = unescape2;
          lodash.uniqueId = uniqueId;
          lodash.upperCase = upperCase;
          lodash.upperFirst = upperFirst;
          lodash.each = forEach2;
          lodash.eachRight = forEachRight;
          lodash.first = head;
          mixin2(lodash, function() {
            var source = {};
            baseForOwn(lodash, function(func, methodName) {
              if (!hasOwnProperty2.call(lodash.prototype, methodName)) {
                source[methodName] = func;
              }
            });
            return source;
          }(), { "chain": false });
          lodash.VERSION = VERSION3;
          arrayEach(["bind", "bindKey", "curry", "curryRight", "partial", "partialRight"], function(methodName) {
            lodash[methodName].placeholder = lodash;
          });
          arrayEach(["drop", "take"], function(methodName, index) {
            LazyWrapper.prototype[methodName] = function(n) {
              n = n === undefined2 ? 1 : nativeMax(toInteger(n), 0);
              var result2 = this.__filtered__ && !index ? new LazyWrapper(this) : this.clone();
              if (result2.__filtered__) {
                result2.__takeCount__ = nativeMin(n, result2.__takeCount__);
              } else {
                result2.__views__.push({
                  "size": nativeMin(n, MAX_ARRAY_LENGTH),
                  "type": methodName + (result2.__dir__ < 0 ? "Right" : "")
                });
              }
              return result2;
            };
            LazyWrapper.prototype[methodName + "Right"] = function(n) {
              return this.reverse()[methodName](n).reverse();
            };
          });
          arrayEach(["filter", "map", "takeWhile"], function(methodName, index) {
            var type = index + 1, isFilter = type == LAZY_FILTER_FLAG || type == LAZY_WHILE_FLAG;
            LazyWrapper.prototype[methodName] = function(iteratee2) {
              var result2 = this.clone();
              result2.__iteratees__.push({
                "iteratee": getIteratee(iteratee2, 3),
                "type": type
              });
              result2.__filtered__ = result2.__filtered__ || isFilter;
              return result2;
            };
          });
          arrayEach(["head", "last"], function(methodName, index) {
            var takeName = "take" + (index ? "Right" : "");
            LazyWrapper.prototype[methodName] = function() {
              return this[takeName](1).value()[0];
            };
          });
          arrayEach(["initial", "tail"], function(methodName, index) {
            var dropName = "drop" + (index ? "" : "Right");
            LazyWrapper.prototype[methodName] = function() {
              return this.__filtered__ ? new LazyWrapper(this) : this[dropName](1);
            };
          });
          LazyWrapper.prototype.compact = function() {
            return this.filter(identity);
          };
          LazyWrapper.prototype.find = function(predicate) {
            return this.filter(predicate).head();
          };
          LazyWrapper.prototype.findLast = function(predicate) {
            return this.reverse().find(predicate);
          };
          LazyWrapper.prototype.invokeMap = baseRest(function(path, args) {
            if (typeof path == "function") {
              return new LazyWrapper(this);
            }
            return this.map(function(value2) {
              return baseInvoke(value2, path, args);
            });
          });
          LazyWrapper.prototype.reject = function(predicate) {
            return this.filter(negate(getIteratee(predicate)));
          };
          LazyWrapper.prototype.slice = function(start, end) {
            start = toInteger(start);
            var result2 = this;
            if (result2.__filtered__ && (start > 0 || end < 0)) {
              return new LazyWrapper(result2);
            }
            if (start < 0) {
              result2 = result2.takeRight(-start);
            } else if (start) {
              result2 = result2.drop(start);
            }
            if (end !== undefined2) {
              end = toInteger(end);
              result2 = end < 0 ? result2.dropRight(-end) : result2.take(end - start);
            }
            return result2;
          };
          LazyWrapper.prototype.takeRightWhile = function(predicate) {
            return this.reverse().takeWhile(predicate).reverse();
          };
          LazyWrapper.prototype.toArray = function() {
            return this.take(MAX_ARRAY_LENGTH);
          };
          baseForOwn(LazyWrapper.prototype, function(func, methodName) {
            var checkIteratee = /^(?:filter|find|map|reject)|While$/.test(methodName), isTaker = /^(?:head|last)$/.test(methodName), lodashFunc = lodash[isTaker ? "take" + (methodName == "last" ? "Right" : "") : methodName], retUnwrapped = isTaker || /^find/.test(methodName);
            if (!lodashFunc) {
              return;
            }
            lodash.prototype[methodName] = function() {
              var value2 = this.__wrapped__, args = isTaker ? [1] : arguments, isLazy = value2 instanceof LazyWrapper, iteratee2 = args[0], useLazy = isLazy || isArray2(value2);
              var interceptor = function(value3) {
                var result3 = lodashFunc.apply(lodash, arrayPush([value3], args));
                return isTaker && chainAll ? result3[0] : result3;
              };
              if (useLazy && checkIteratee && typeof iteratee2 == "function" && iteratee2.length != 1) {
                isLazy = useLazy = false;
              }
              var chainAll = this.__chain__, isHybrid = !!this.__actions__.length, isUnwrapped = retUnwrapped && !chainAll, onlyLazy = isLazy && !isHybrid;
              if (!retUnwrapped && useLazy) {
                value2 = onlyLazy ? value2 : new LazyWrapper(this);
                var result2 = func.apply(value2, args);
                result2.__actions__.push({ "func": thru, "args": [interceptor], "thisArg": undefined2 });
                return new LodashWrapper(result2, chainAll);
              }
              if (isUnwrapped && onlyLazy) {
                return func.apply(this, args);
              }
              result2 = this.thru(interceptor);
              return isUnwrapped ? isTaker ? result2.value()[0] : result2.value() : result2;
            };
          });
          arrayEach(["pop", "push", "shift", "sort", "splice", "unshift"], function(methodName) {
            var func = arrayProto[methodName], chainName = /^(?:push|sort|unshift)$/.test(methodName) ? "tap" : "thru", retUnwrapped = /^(?:pop|shift)$/.test(methodName);
            lodash.prototype[methodName] = function() {
              var args = arguments;
              if (retUnwrapped && !this.__chain__) {
                var value2 = this.value();
                return func.apply(isArray2(value2) ? value2 : [], args);
              }
              return this[chainName](function(value3) {
                return func.apply(isArray2(value3) ? value3 : [], args);
              });
            };
          });
          baseForOwn(LazyWrapper.prototype, function(func, methodName) {
            var lodashFunc = lodash[methodName];
            if (lodashFunc) {
              var key = lodashFunc.name + "";
              if (!hasOwnProperty2.call(realNames, key)) {
                realNames[key] = [];
              }
              realNames[key].push({ "name": methodName, "func": lodashFunc });
            }
          });
          realNames[createHybrid(undefined2, WRAP_BIND_KEY_FLAG).name] = [{
            "name": "wrapper",
            "func": undefined2
          }];
          LazyWrapper.prototype.clone = lazyClone;
          LazyWrapper.prototype.reverse = lazyReverse;
          LazyWrapper.prototype.value = lazyValue;
          lodash.prototype.at = wrapperAt;
          lodash.prototype.chain = wrapperChain;
          lodash.prototype.commit = wrapperCommit;
          lodash.prototype.next = wrapperNext;
          lodash.prototype.plant = wrapperPlant;
          lodash.prototype.reverse = wrapperReverse;
          lodash.prototype.toJSON = lodash.prototype.valueOf = lodash.prototype.value = wrapperValue;
          lodash.prototype.first = lodash.prototype.head;
          if (symIterator) {
            lodash.prototype[symIterator] = wrapperToIterator;
          }
          return lodash;
        };
        var _2 = runInContext();
        if (typeof define == "function" && typeof define.amd == "object" && define.amd) {
          root._ = _2;
          define(function() {
            return _2;
          });
        } else if (freeModule) {
          (freeModule.exports = _2)._ = _2;
          freeExports._ = _2;
        } else {
          root._ = _2;
        }
      }).call(exports);
    }
  });

  // node_modules/moment/moment.js
  var require_moment = __commonJS({
    "node_modules/moment/moment.js"(exports, module) {
      (function(global2, factory) {
        typeof exports === "object" && typeof module !== "undefined" ? module.exports = factory() : typeof define === "function" && define.amd ? define(factory) : global2.moment = factory();
      })(exports, function() {
        "use strict";
        var hookCallback;
        function hooks() {
          return hookCallback.apply(null, arguments);
        }
        function setHookCallback(callback) {
          hookCallback = callback;
        }
        function isArray2(input2) {
          return input2 instanceof Array || Object.prototype.toString.call(input2) === "[object Array]";
        }
        function isObject3(input2) {
          return input2 != null && Object.prototype.toString.call(input2) === "[object Object]";
        }
        function hasOwnProp(a, b) {
          return Object.prototype.hasOwnProperty.call(a, b);
        }
        function isObjectEmpty(obj2) {
          if (Object.getOwnPropertyNames) {
            return Object.getOwnPropertyNames(obj2).length === 0;
          } else {
            var k;
            for (k in obj2) {
              if (hasOwnProp(obj2, k)) {
                return false;
              }
            }
            return true;
          }
        }
        function isUndefined2(input2) {
          return input2 === void 0;
        }
        function isNumber2(input2) {
          return typeof input2 === "number" || Object.prototype.toString.call(input2) === "[object Number]";
        }
        function isDate2(input2) {
          return input2 instanceof Date || Object.prototype.toString.call(input2) === "[object Date]";
        }
        function map2(arr, fn) {
          var res = [], i2, arrLen = arr.length;
          for (i2 = 0; i2 < arrLen; ++i2) {
            res.push(fn(arr[i2], i2));
          }
          return res;
        }
        function extend2(a, b) {
          for (var i2 in b) {
            if (hasOwnProp(b, i2)) {
              a[i2] = b[i2];
            }
          }
          if (hasOwnProp(b, "toString")) {
            a.toString = b.toString;
          }
          if (hasOwnProp(b, "valueOf")) {
            a.valueOf = b.valueOf;
          }
          return a;
        }
        function createUTC(input2, format2, locale2, strict) {
          return createLocalOrUTC(input2, format2, locale2, strict, true).utc();
        }
        function defaultParsingFlags() {
          return {
            empty: false,
            unusedTokens: [],
            unusedInput: [],
            overflow: -2,
            charsLeftOver: 0,
            nullInput: false,
            invalidEra: null,
            invalidMonth: null,
            invalidFormat: false,
            userInvalidated: false,
            iso: false,
            parsedDateParts: [],
            era: null,
            meridiem: null,
            rfc2822: false,
            weekdayMismatch: false
          };
        }
        function getParsingFlags(m) {
          if (m._pf == null) {
            m._pf = defaultParsingFlags();
          }
          return m._pf;
        }
        var some;
        if (Array.prototype.some) {
          some = Array.prototype.some;
        } else {
          some = function(fun) {
            var t = Object(this), len = t.length >>> 0, i2;
            for (i2 = 0; i2 < len; i2++) {
              if (i2 in t && fun.call(this, t[i2], i2, t)) {
                return true;
              }
            }
            return false;
          };
        }
        function isValid(m) {
          if (m._isValid == null) {
            var flags = getParsingFlags(m), parsedParts = some.call(flags.parsedDateParts, function(i2) {
              return i2 != null;
            }), isNowValid = !isNaN(m._d.getTime()) && flags.overflow < 0 && !flags.empty && !flags.invalidEra && !flags.invalidMonth && !flags.invalidWeekday && !flags.weekdayMismatch && !flags.nullInput && !flags.invalidFormat && !flags.userInvalidated && (!flags.meridiem || flags.meridiem && parsedParts);
            if (m._strict) {
              isNowValid = isNowValid && flags.charsLeftOver === 0 && flags.unusedTokens.length === 0 && flags.bigHour === void 0;
            }
            if (Object.isFrozen == null || !Object.isFrozen(m)) {
              m._isValid = isNowValid;
            } else {
              return isNowValid;
            }
          }
          return m._isValid;
        }
        function createInvalid(flags) {
          var m = createUTC(NaN);
          if (flags != null) {
            extend2(getParsingFlags(m), flags);
          } else {
            getParsingFlags(m).userInvalidated = true;
          }
          return m;
        }
        var momentProperties = hooks.momentProperties = [], updateInProgress = false;
        function copyConfig(to2, from2) {
          var i2, prop, val, momentPropertiesLen = momentProperties.length;
          if (!isUndefined2(from2._isAMomentObject)) {
            to2._isAMomentObject = from2._isAMomentObject;
          }
          if (!isUndefined2(from2._i)) {
            to2._i = from2._i;
          }
          if (!isUndefined2(from2._f)) {
            to2._f = from2._f;
          }
          if (!isUndefined2(from2._l)) {
            to2._l = from2._l;
          }
          if (!isUndefined2(from2._strict)) {
            to2._strict = from2._strict;
          }
          if (!isUndefined2(from2._tzm)) {
            to2._tzm = from2._tzm;
          }
          if (!isUndefined2(from2._isUTC)) {
            to2._isUTC = from2._isUTC;
          }
          if (!isUndefined2(from2._offset)) {
            to2._offset = from2._offset;
          }
          if (!isUndefined2(from2._pf)) {
            to2._pf = getParsingFlags(from2);
          }
          if (!isUndefined2(from2._locale)) {
            to2._locale = from2._locale;
          }
          if (momentPropertiesLen > 0) {
            for (i2 = 0; i2 < momentPropertiesLen; i2++) {
              prop = momentProperties[i2];
              val = from2[prop];
              if (!isUndefined2(val)) {
                to2[prop] = val;
              }
            }
          }
          return to2;
        }
        function Moment(config) {
          copyConfig(this, config);
          this._d = new Date(config._d != null ? config._d.getTime() : NaN);
          if (!this.isValid()) {
            this._d = new Date(NaN);
          }
          if (updateInProgress === false) {
            updateInProgress = true;
            hooks.updateOffset(this);
            updateInProgress = false;
          }
        }
        function isMoment(obj2) {
          return obj2 instanceof Moment || obj2 != null && obj2._isAMomentObject != null;
        }
        function warn(msg) {
          if (hooks.suppressDeprecationWarnings === false && typeof console !== "undefined" && console.warn) {
            console.warn("Deprecation warning: " + msg);
          }
        }
        function deprecate(msg, fn) {
          var firstTime = true;
          return extend2(function() {
            if (hooks.deprecationHandler != null) {
              hooks.deprecationHandler(null, msg);
            }
            if (firstTime) {
              var args = [], arg, i2, key, argLen = arguments.length;
              for (i2 = 0; i2 < argLen; i2++) {
                arg = "";
                if (typeof arguments[i2] === "object") {
                  arg += "\n[" + i2 + "] ";
                  for (key in arguments[0]) {
                    if (hasOwnProp(arguments[0], key)) {
                      arg += key + ": " + arguments[0][key] + ", ";
                    }
                  }
                  arg = arg.slice(0, -2);
                } else {
                  arg = arguments[i2];
                }
                args.push(arg);
              }
              warn(
                msg + "\nArguments: " + Array.prototype.slice.call(args).join("") + "\n" + new Error().stack
              );
              firstTime = false;
            }
            return fn.apply(this, arguments);
          }, fn);
        }
        var deprecations = {};
        function deprecateSimple(name, msg) {
          if (hooks.deprecationHandler != null) {
            hooks.deprecationHandler(name, msg);
          }
          if (!deprecations[name]) {
            warn(msg);
            deprecations[name] = true;
          }
        }
        hooks.suppressDeprecationWarnings = false;
        hooks.deprecationHandler = null;
        function isFunction2(input2) {
          return typeof Function !== "undefined" && input2 instanceof Function || Object.prototype.toString.call(input2) === "[object Function]";
        }
        function set(config) {
          var prop, i2;
          for (i2 in config) {
            if (hasOwnProp(config, i2)) {
              prop = config[i2];
              if (isFunction2(prop)) {
                this[i2] = prop;
              } else {
                this["_" + i2] = prop;
              }
            }
          }
          this._config = config;
          this._dayOfMonthOrdinalParseLenient = new RegExp(
            (this._dayOfMonthOrdinalParse.source || this._ordinalParse.source) + "|" + /\d{1,2}/.source
          );
        }
        function mergeConfigs(parentConfig, childConfig) {
          var res = extend2({}, parentConfig), prop;
          for (prop in childConfig) {
            if (hasOwnProp(childConfig, prop)) {
              if (isObject3(parentConfig[prop]) && isObject3(childConfig[prop])) {
                res[prop] = {};
                extend2(res[prop], parentConfig[prop]);
                extend2(res[prop], childConfig[prop]);
              } else if (childConfig[prop] != null) {
                res[prop] = childConfig[prop];
              } else {
                delete res[prop];
              }
            }
          }
          for (prop in parentConfig) {
            if (hasOwnProp(parentConfig, prop) && !hasOwnProp(childConfig, prop) && isObject3(parentConfig[prop])) {
              res[prop] = extend2({}, res[prop]);
            }
          }
          return res;
        }
        function Locale(config) {
          if (config != null) {
            this.set(config);
          }
        }
        var keys;
        if (Object.keys) {
          keys = Object.keys;
        } else {
          keys = function(obj2) {
            var i2, res = [];
            for (i2 in obj2) {
              if (hasOwnProp(obj2, i2)) {
                res.push(i2);
              }
            }
            return res;
          };
        }
        var defaultCalendar = {
          sameDay: "[Today at] LT",
          nextDay: "[Tomorrow at] LT",
          nextWeek: "dddd [at] LT",
          lastDay: "[Yesterday at] LT",
          lastWeek: "[Last] dddd [at] LT",
          sameElse: "L"
        };
        function calendar(key, mom, now2) {
          var output = this._calendar[key] || this._calendar["sameElse"];
          return isFunction2(output) ? output.call(mom, now2) : output;
        }
        function zeroFill(number, targetLength, forceSign) {
          var absNumber = "" + Math.abs(number), zerosToFill = targetLength - absNumber.length, sign2 = number >= 0;
          return (sign2 ? forceSign ? "+" : "" : "-") + Math.pow(10, Math.max(0, zerosToFill)).toString().substr(1) + absNumber;
        }
        var formattingTokens = /(\[[^\[]*\])|(\\)?([Hh]mm(ss)?|Mo|MM?M?M?|Do|DDDo|DD?D?D?|ddd?d?|do?|w[o|w]?|W[o|W]?|Qo?|N{1,5}|YYYYYY|YYYYY|YYYY|YY|y{2,4}|yo?|gg(ggg?)?|GG(GGG?)?|e|E|a|A|hh?|HH?|kk?|mm?|ss?|S{1,9}|x|X|zz?|ZZ?|.)/g, localFormattingTokens = /(\[[^\[]*\])|(\\)?(LTS|LT|LL?L?L?|l{1,4})/g, formatFunctions = {}, formatTokenFunctions = {};
        function addFormatToken(token3, padded, ordinal2, callback) {
          var func = callback;
          if (typeof callback === "string") {
            func = function() {
              return this[callback]();
            };
          }
          if (token3) {
            formatTokenFunctions[token3] = func;
          }
          if (padded) {
            formatTokenFunctions[padded[0]] = function() {
              return zeroFill(func.apply(this, arguments), padded[1], padded[2]);
            };
          }
          if (ordinal2) {
            formatTokenFunctions[ordinal2] = function() {
              return this.localeData().ordinal(
                func.apply(this, arguments),
                token3
              );
            };
          }
        }
        function removeFormattingTokens(input2) {
          if (input2.match(/\[[\s\S]/)) {
            return input2.replace(/^\[|\]$/g, "");
          }
          return input2.replace(/\\/g, "");
        }
        function makeFormatFunction(format2) {
          var array = format2.match(formattingTokens), i2, length2;
          for (i2 = 0, length2 = array.length; i2 < length2; i2++) {
            if (formatTokenFunctions[array[i2]]) {
              array[i2] = formatTokenFunctions[array[i2]];
            } else {
              array[i2] = removeFormattingTokens(array[i2]);
            }
          }
          return function(mom) {
            var output = "", i3;
            for (i3 = 0; i3 < length2; i3++) {
              output += isFunction2(array[i3]) ? array[i3].call(mom, format2) : array[i3];
            }
            return output;
          };
        }
        function formatMoment(m, format2) {
          if (!m.isValid()) {
            return m.localeData().invalidDate();
          }
          format2 = expandFormat(format2, m.localeData());
          formatFunctions[format2] = formatFunctions[format2] || makeFormatFunction(format2);
          return formatFunctions[format2](m);
        }
        function expandFormat(format2, locale2) {
          var i2 = 5;
          function replaceLongDateFormatTokens(input2) {
            return locale2.longDateFormat(input2) || input2;
          }
          localFormattingTokens.lastIndex = 0;
          while (i2 >= 0 && localFormattingTokens.test(format2)) {
            format2 = format2.replace(
              localFormattingTokens,
              replaceLongDateFormatTokens
            );
            localFormattingTokens.lastIndex = 0;
            i2 -= 1;
          }
          return format2;
        }
        var defaultLongDateFormat = {
          LTS: "h:mm:ss A",
          LT: "h:mm A",
          L: "MM/DD/YYYY",
          LL: "MMMM D, YYYY",
          LLL: "MMMM D, YYYY h:mm A",
          LLLL: "dddd, MMMM D, YYYY h:mm A"
        };
        function longDateFormat(key) {
          var format2 = this._longDateFormat[key], formatUpper = this._longDateFormat[key.toUpperCase()];
          if (format2 || !formatUpper) {
            return format2;
          }
          this._longDateFormat[key] = formatUpper.match(formattingTokens).map(function(tok) {
            if (tok === "MMMM" || tok === "MM" || tok === "DD" || tok === "dddd") {
              return tok.slice(1);
            }
            return tok;
          }).join("");
          return this._longDateFormat[key];
        }
        var defaultInvalidDate = "Invalid date";
        function invalidDate() {
          return this._invalidDate;
        }
        var defaultOrdinal = "%d", defaultDayOfMonthOrdinalParse = /\d{1,2}/;
        function ordinal(number) {
          return this._ordinal.replace("%d", number);
        }
        var defaultRelativeTime = {
          future: "in %s",
          past: "%s ago",
          s: "a few seconds",
          ss: "%d seconds",
          m: "a minute",
          mm: "%d minutes",
          h: "an hour",
          hh: "%d hours",
          d: "a day",
          dd: "%d days",
          w: "a week",
          ww: "%d weeks",
          M: "a month",
          MM: "%d months",
          y: "a year",
          yy: "%d years"
        };
        function relativeTime(number, withoutSuffix, string, isFuture) {
          var output = this._relativeTime[string];
          return isFunction2(output) ? output(number, withoutSuffix, string, isFuture) : output.replace(/%d/i, number);
        }
        function pastFuture(diff2, output) {
          var format2 = this._relativeTime[diff2 > 0 ? "future" : "past"];
          return isFunction2(format2) ? format2(output) : format2.replace(/%s/i, output);
        }
        var aliases = {};
        function addUnitAlias(unit, shorthand) {
          var lowerCase = unit.toLowerCase();
          aliases[lowerCase] = aliases[lowerCase + "s"] = aliases[shorthand] = unit;
        }
        function normalizeUnits(units) {
          return typeof units === "string" ? aliases[units] || aliases[units.toLowerCase()] : void 0;
        }
        function normalizeObjectUnits(inputObject) {
          var normalizedInput = {}, normalizedProp, prop;
          for (prop in inputObject) {
            if (hasOwnProp(inputObject, prop)) {
              normalizedProp = normalizeUnits(prop);
              if (normalizedProp) {
                normalizedInput[normalizedProp] = inputObject[prop];
              }
            }
          }
          return normalizedInput;
        }
        var priorities = {};
        function addUnitPriority(unit, priority) {
          priorities[unit] = priority;
        }
        function getPrioritizedUnits(unitsObj) {
          var units = [], u;
          for (u in unitsObj) {
            if (hasOwnProp(unitsObj, u)) {
              units.push({ unit: u, priority: priorities[u] });
            }
          }
          units.sort(function(a, b) {
            return a.priority - b.priority;
          });
          return units;
        }
        function isLeapYear(year) {
          return year % 4 === 0 && year % 100 !== 0 || year % 400 === 0;
        }
        function absFloor(number) {
          if (number < 0) {
            return Math.ceil(number) || 0;
          } else {
            return Math.floor(number);
          }
        }
        function toInt(argumentForCoercion) {
          var coercedNumber = +argumentForCoercion, value2 = 0;
          if (coercedNumber !== 0 && isFinite(coercedNumber)) {
            value2 = absFloor(coercedNumber);
          }
          return value2;
        }
        function makeGetSet(unit, keepTime) {
          return function(value2) {
            if (value2 != null) {
              set$1(this, unit, value2);
              hooks.updateOffset(this, keepTime);
              return this;
            } else {
              return get(this, unit);
            }
          };
        }
        function get(mom, unit) {
          return mom.isValid() ? mom._d["get" + (mom._isUTC ? "UTC" : "") + unit]() : NaN;
        }
        function set$1(mom, unit, value2) {
          if (mom.isValid() && !isNaN(value2)) {
            if (unit === "FullYear" && isLeapYear(mom.year()) && mom.month() === 1 && mom.date() === 29) {
              value2 = toInt(value2);
              mom._d["set" + (mom._isUTC ? "UTC" : "") + unit](
                value2,
                mom.month(),
                daysInMonth(value2, mom.month())
              );
            } else {
              mom._d["set" + (mom._isUTC ? "UTC" : "") + unit](value2);
            }
          }
        }
        function stringGet(units) {
          units = normalizeUnits(units);
          if (isFunction2(this[units])) {
            return this[units]();
          }
          return this;
        }
        function stringSet(units, value2) {
          if (typeof units === "object") {
            units = normalizeObjectUnits(units);
            var prioritized = getPrioritizedUnits(units), i2, prioritizedLen = prioritized.length;
            for (i2 = 0; i2 < prioritizedLen; i2++) {
              this[prioritized[i2].unit](units[prioritized[i2].unit]);
            }
          } else {
            units = normalizeUnits(units);
            if (isFunction2(this[units])) {
              return this[units](value2);
            }
          }
          return this;
        }
        var match1 = /\d/, match2 = /\d\d/, match3 = /\d{3}/, match4 = /\d{4}/, match6 = /[+-]?\d{6}/, match1to2 = /\d\d?/, match3to4 = /\d\d\d\d?/, match5to6 = /\d\d\d\d\d\d?/, match1to3 = /\d{1,3}/, match1to4 = /\d{1,4}/, match1to6 = /[+-]?\d{1,6}/, matchUnsigned = /\d+/, matchSigned = /[+-]?\d+/, matchOffset = /Z|[+-]\d\d:?\d\d/gi, matchShortOffset = /Z|[+-]\d\d(?::?\d\d)?/gi, matchTimestamp = /[+-]?\d+(\.\d{1,3})?/, matchWord = /[0-9]{0,256}['a-z\u00A0-\u05FF\u0700-\uD7FF\uF900-\uFDCF\uFDF0-\uFF07\uFF10-\uFFEF]{1,256}|[\u0600-\u06FF\/]{1,256}(\s*?[\u0600-\u06FF]{1,256}){1,2}/i, regexes;
        regexes = {};
        function addRegexToken(token3, regex, strictRegex) {
          regexes[token3] = isFunction2(regex) ? regex : function(isStrict, localeData2) {
            return isStrict && strictRegex ? strictRegex : regex;
          };
        }
        function getParseRegexForToken(token3, config) {
          if (!hasOwnProp(regexes, token3)) {
            return new RegExp(unescapeFormat(token3));
          }
          return regexes[token3](config._strict, config._locale);
        }
        function unescapeFormat(s) {
          return regexEscape(
            s.replace("\\", "").replace(
              /\\(\[)|\\(\])|\[([^\]\[]*)\]|\\(.)/g,
              function(matched, p1, p2, p3, p4) {
                return p1 || p2 || p3 || p4;
              }
            )
          );
        }
        function regexEscape(s) {
          return s.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&");
        }
        var tokens = {};
        function addParseToken(token3, callback) {
          var i2, func = callback, tokenLen;
          if (typeof token3 === "string") {
            token3 = [token3];
          }
          if (isNumber2(callback)) {
            func = function(input2, array) {
              array[callback] = toInt(input2);
            };
          }
          tokenLen = token3.length;
          for (i2 = 0; i2 < tokenLen; i2++) {
            tokens[token3[i2]] = func;
          }
        }
        function addWeekParseToken(token3, callback) {
          addParseToken(token3, function(input2, array, config, token4) {
            config._w = config._w || {};
            callback(input2, config._w, config, token4);
          });
        }
        function addTimeToArrayFromToken(token3, input2, config) {
          if (input2 != null && hasOwnProp(tokens, token3)) {
            tokens[token3](input2, config._a, config, token3);
          }
        }
        var YEAR = 0, MONTH = 1, DATE = 2, HOUR = 3, MINUTE = 4, SECOND = 5, MILLISECOND = 6, WEEK = 7, WEEKDAY = 8;
        function mod(n, x) {
          return (n % x + x) % x;
        }
        var indexOf;
        if (Array.prototype.indexOf) {
          indexOf = Array.prototype.indexOf;
        } else {
          indexOf = function(o) {
            var i2;
            for (i2 = 0; i2 < this.length; ++i2) {
              if (this[i2] === o) {
                return i2;
              }
            }
            return -1;
          };
        }
        function daysInMonth(year, month) {
          if (isNaN(year) || isNaN(month)) {
            return NaN;
          }
          var modMonth = mod(month, 12);
          year += (month - modMonth) / 12;
          return modMonth === 1 ? isLeapYear(year) ? 29 : 28 : 31 - modMonth % 7 % 2;
        }
        addFormatToken("M", ["MM", 2], "Mo", function() {
          return this.month() + 1;
        });
        addFormatToken("MMM", 0, 0, function(format2) {
          return this.localeData().monthsShort(this, format2);
        });
        addFormatToken("MMMM", 0, 0, function(format2) {
          return this.localeData().months(this, format2);
        });
        addUnitAlias("month", "M");
        addUnitPriority("month", 8);
        addRegexToken("M", match1to2);
        addRegexToken("MM", match1to2, match2);
        addRegexToken("MMM", function(isStrict, locale2) {
          return locale2.monthsShortRegex(isStrict);
        });
        addRegexToken("MMMM", function(isStrict, locale2) {
          return locale2.monthsRegex(isStrict);
        });
        addParseToken(["M", "MM"], function(input2, array) {
          array[MONTH] = toInt(input2) - 1;
        });
        addParseToken(["MMM", "MMMM"], function(input2, array, config, token3) {
          var month = config._locale.monthsParse(input2, token3, config._strict);
          if (month != null) {
            array[MONTH] = month;
          } else {
            getParsingFlags(config).invalidMonth = input2;
          }
        });
        var defaultLocaleMonths = "January_February_March_April_May_June_July_August_September_October_November_December".split(
          "_"
        ), defaultLocaleMonthsShort = "Jan_Feb_Mar_Apr_May_Jun_Jul_Aug_Sep_Oct_Nov_Dec".split("_"), MONTHS_IN_FORMAT = /D[oD]?(\[[^\[\]]*\]|\s)+MMMM?/, defaultMonthsShortRegex = matchWord, defaultMonthsRegex = matchWord;
        function localeMonths(m, format2) {
          if (!m) {
            return isArray2(this._months) ? this._months : this._months["standalone"];
          }
          return isArray2(this._months) ? this._months[m.month()] : this._months[(this._months.isFormat || MONTHS_IN_FORMAT).test(format2) ? "format" : "standalone"][m.month()];
        }
        function localeMonthsShort(m, format2) {
          if (!m) {
            return isArray2(this._monthsShort) ? this._monthsShort : this._monthsShort["standalone"];
          }
          return isArray2(this._monthsShort) ? this._monthsShort[m.month()] : this._monthsShort[MONTHS_IN_FORMAT.test(format2) ? "format" : "standalone"][m.month()];
        }
        function handleStrictParse(monthName, format2, strict) {
          var i2, ii, mom, llc = monthName.toLocaleLowerCase();
          if (!this._monthsParse) {
            this._monthsParse = [];
            this._longMonthsParse = [];
            this._shortMonthsParse = [];
            for (i2 = 0; i2 < 12; ++i2) {
              mom = createUTC([2e3, i2]);
              this._shortMonthsParse[i2] = this.monthsShort(
                mom,
                ""
              ).toLocaleLowerCase();
              this._longMonthsParse[i2] = this.months(mom, "").toLocaleLowerCase();
            }
          }
          if (strict) {
            if (format2 === "MMM") {
              ii = indexOf.call(this._shortMonthsParse, llc);
              return ii !== -1 ? ii : null;
            } else {
              ii = indexOf.call(this._longMonthsParse, llc);
              return ii !== -1 ? ii : null;
            }
          } else {
            if (format2 === "MMM") {
              ii = indexOf.call(this._shortMonthsParse, llc);
              if (ii !== -1) {
                return ii;
              }
              ii = indexOf.call(this._longMonthsParse, llc);
              return ii !== -1 ? ii : null;
            } else {
              ii = indexOf.call(this._longMonthsParse, llc);
              if (ii !== -1) {
                return ii;
              }
              ii = indexOf.call(this._shortMonthsParse, llc);
              return ii !== -1 ? ii : null;
            }
          }
        }
        function localeMonthsParse(monthName, format2, strict) {
          var i2, mom, regex;
          if (this._monthsParseExact) {
            return handleStrictParse.call(this, monthName, format2, strict);
          }
          if (!this._monthsParse) {
            this._monthsParse = [];
            this._longMonthsParse = [];
            this._shortMonthsParse = [];
          }
          for (i2 = 0; i2 < 12; i2++) {
            mom = createUTC([2e3, i2]);
            if (strict && !this._longMonthsParse[i2]) {
              this._longMonthsParse[i2] = new RegExp(
                "^" + this.months(mom, "").replace(".", "") + "$",
                "i"
              );
              this._shortMonthsParse[i2] = new RegExp(
                "^" + this.monthsShort(mom, "").replace(".", "") + "$",
                "i"
              );
            }
            if (!strict && !this._monthsParse[i2]) {
              regex = "^" + this.months(mom, "") + "|^" + this.monthsShort(mom, "");
              this._monthsParse[i2] = new RegExp(regex.replace(".", ""), "i");
            }
            if (strict && format2 === "MMMM" && this._longMonthsParse[i2].test(monthName)) {
              return i2;
            } else if (strict && format2 === "MMM" && this._shortMonthsParse[i2].test(monthName)) {
              return i2;
            } else if (!strict && this._monthsParse[i2].test(monthName)) {
              return i2;
            }
          }
        }
        function setMonth(mom, value2) {
          var dayOfMonth;
          if (!mom.isValid()) {
            return mom;
          }
          if (typeof value2 === "string") {
            if (/^\d+$/.test(value2)) {
              value2 = toInt(value2);
            } else {
              value2 = mom.localeData().monthsParse(value2);
              if (!isNumber2(value2)) {
                return mom;
              }
            }
          }
          dayOfMonth = Math.min(mom.date(), daysInMonth(mom.year(), value2));
          mom._d["set" + (mom._isUTC ? "UTC" : "") + "Month"](value2, dayOfMonth);
          return mom;
        }
        function getSetMonth(value2) {
          if (value2 != null) {
            setMonth(this, value2);
            hooks.updateOffset(this, true);
            return this;
          } else {
            return get(this, "Month");
          }
        }
        function getDaysInMonth() {
          return daysInMonth(this.year(), this.month());
        }
        function monthsShortRegex(isStrict) {
          if (this._monthsParseExact) {
            if (!hasOwnProp(this, "_monthsRegex")) {
              computeMonthsParse.call(this);
            }
            if (isStrict) {
              return this._monthsShortStrictRegex;
            } else {
              return this._monthsShortRegex;
            }
          } else {
            if (!hasOwnProp(this, "_monthsShortRegex")) {
              this._monthsShortRegex = defaultMonthsShortRegex;
            }
            return this._monthsShortStrictRegex && isStrict ? this._monthsShortStrictRegex : this._monthsShortRegex;
          }
        }
        function monthsRegex(isStrict) {
          if (this._monthsParseExact) {
            if (!hasOwnProp(this, "_monthsRegex")) {
              computeMonthsParse.call(this);
            }
            if (isStrict) {
              return this._monthsStrictRegex;
            } else {
              return this._monthsRegex;
            }
          } else {
            if (!hasOwnProp(this, "_monthsRegex")) {
              this._monthsRegex = defaultMonthsRegex;
            }
            return this._monthsStrictRegex && isStrict ? this._monthsStrictRegex : this._monthsRegex;
          }
        }
        function computeMonthsParse() {
          function cmpLenRev(a, b) {
            return b.length - a.length;
          }
          var shortPieces = [], longPieces = [], mixedPieces = [], i2, mom;
          for (i2 = 0; i2 < 12; i2++) {
            mom = createUTC([2e3, i2]);
            shortPieces.push(this.monthsShort(mom, ""));
            longPieces.push(this.months(mom, ""));
            mixedPieces.push(this.months(mom, ""));
            mixedPieces.push(this.monthsShort(mom, ""));
          }
          shortPieces.sort(cmpLenRev);
          longPieces.sort(cmpLenRev);
          mixedPieces.sort(cmpLenRev);
          for (i2 = 0; i2 < 12; i2++) {
            shortPieces[i2] = regexEscape(shortPieces[i2]);
            longPieces[i2] = regexEscape(longPieces[i2]);
          }
          for (i2 = 0; i2 < 24; i2++) {
            mixedPieces[i2] = regexEscape(mixedPieces[i2]);
          }
          this._monthsRegex = new RegExp("^(" + mixedPieces.join("|") + ")", "i");
          this._monthsShortRegex = this._monthsRegex;
          this._monthsStrictRegex = new RegExp(
            "^(" + longPieces.join("|") + ")",
            "i"
          );
          this._monthsShortStrictRegex = new RegExp(
            "^(" + shortPieces.join("|") + ")",
            "i"
          );
        }
        addFormatToken("Y", 0, 0, function() {
          var y = this.year();
          return y <= 9999 ? zeroFill(y, 4) : "+" + y;
        });
        addFormatToken(0, ["YY", 2], 0, function() {
          return this.year() % 100;
        });
        addFormatToken(0, ["YYYY", 4], 0, "year");
        addFormatToken(0, ["YYYYY", 5], 0, "year");
        addFormatToken(0, ["YYYYYY", 6, true], 0, "year");
        addUnitAlias("year", "y");
        addUnitPriority("year", 1);
        addRegexToken("Y", matchSigned);
        addRegexToken("YY", match1to2, match2);
        addRegexToken("YYYY", match1to4, match4);
        addRegexToken("YYYYY", match1to6, match6);
        addRegexToken("YYYYYY", match1to6, match6);
        addParseToken(["YYYYY", "YYYYYY"], YEAR);
        addParseToken("YYYY", function(input2, array) {
          array[YEAR] = input2.length === 2 ? hooks.parseTwoDigitYear(input2) : toInt(input2);
        });
        addParseToken("YY", function(input2, array) {
          array[YEAR] = hooks.parseTwoDigitYear(input2);
        });
        addParseToken("Y", function(input2, array) {
          array[YEAR] = parseInt(input2, 10);
        });
        function daysInYear(year) {
          return isLeapYear(year) ? 366 : 365;
        }
        hooks.parseTwoDigitYear = function(input2) {
          return toInt(input2) + (toInt(input2) > 68 ? 1900 : 2e3);
        };
        var getSetYear = makeGetSet("FullYear", true);
        function getIsLeapYear() {
          return isLeapYear(this.year());
        }
        function createDate(y, m, d, h, M, s, ms) {
          var date;
          if (y < 100 && y >= 0) {
            date = new Date(y + 400, m, d, h, M, s, ms);
            if (isFinite(date.getFullYear())) {
              date.setFullYear(y);
            }
          } else {
            date = new Date(y, m, d, h, M, s, ms);
          }
          return date;
        }
        function createUTCDate(y) {
          var date, args;
          if (y < 100 && y >= 0) {
            args = Array.prototype.slice.call(arguments);
            args[0] = y + 400;
            date = new Date(Date.UTC.apply(null, args));
            if (isFinite(date.getUTCFullYear())) {
              date.setUTCFullYear(y);
            }
          } else {
            date = new Date(Date.UTC.apply(null, arguments));
          }
          return date;
        }
        function firstWeekOffset(year, dow, doy) {
          var fwd = 7 + dow - doy, fwdlw = (7 + createUTCDate(year, 0, fwd).getUTCDay() - dow) % 7;
          return -fwdlw + fwd - 1;
        }
        function dayOfYearFromWeeks(year, week, weekday, dow, doy) {
          var localWeekday = (7 + weekday - dow) % 7, weekOffset = firstWeekOffset(year, dow, doy), dayOfYear = 1 + 7 * (week - 1) + localWeekday + weekOffset, resYear, resDayOfYear;
          if (dayOfYear <= 0) {
            resYear = year - 1;
            resDayOfYear = daysInYear(resYear) + dayOfYear;
          } else if (dayOfYear > daysInYear(year)) {
            resYear = year + 1;
            resDayOfYear = dayOfYear - daysInYear(year);
          } else {
            resYear = year;
            resDayOfYear = dayOfYear;
          }
          return {
            year: resYear,
            dayOfYear: resDayOfYear
          };
        }
        function weekOfYear(mom, dow, doy) {
          var weekOffset = firstWeekOffset(mom.year(), dow, doy), week = Math.floor((mom.dayOfYear() - weekOffset - 1) / 7) + 1, resWeek, resYear;
          if (week < 1) {
            resYear = mom.year() - 1;
            resWeek = week + weeksInYear(resYear, dow, doy);
          } else if (week > weeksInYear(mom.year(), dow, doy)) {
            resWeek = week - weeksInYear(mom.year(), dow, doy);
            resYear = mom.year() + 1;
          } else {
            resYear = mom.year();
            resWeek = week;
          }
          return {
            week: resWeek,
            year: resYear
          };
        }
        function weeksInYear(year, dow, doy) {
          var weekOffset = firstWeekOffset(year, dow, doy), weekOffsetNext = firstWeekOffset(year + 1, dow, doy);
          return (daysInYear(year) - weekOffset + weekOffsetNext) / 7;
        }
        addFormatToken("w", ["ww", 2], "wo", "week");
        addFormatToken("W", ["WW", 2], "Wo", "isoWeek");
        addUnitAlias("week", "w");
        addUnitAlias("isoWeek", "W");
        addUnitPriority("week", 5);
        addUnitPriority("isoWeek", 5);
        addRegexToken("w", match1to2);
        addRegexToken("ww", match1to2, match2);
        addRegexToken("W", match1to2);
        addRegexToken("WW", match1to2, match2);
        addWeekParseToken(
          ["w", "ww", "W", "WW"],
          function(input2, week, config, token3) {
            week[token3.substr(0, 1)] = toInt(input2);
          }
        );
        function localeWeek(mom) {
          return weekOfYear(mom, this._week.dow, this._week.doy).week;
        }
        var defaultLocaleWeek = {
          dow: 0,
          doy: 6
        };
        function localeFirstDayOfWeek() {
          return this._week.dow;
        }
        function localeFirstDayOfYear() {
          return this._week.doy;
        }
        function getSetWeek(input2) {
          var week = this.localeData().week(this);
          return input2 == null ? week : this.add((input2 - week) * 7, "d");
        }
        function getSetISOWeek(input2) {
          var week = weekOfYear(this, 1, 4).week;
          return input2 == null ? week : this.add((input2 - week) * 7, "d");
        }
        addFormatToken("d", 0, "do", "day");
        addFormatToken("dd", 0, 0, function(format2) {
          return this.localeData().weekdaysMin(this, format2);
        });
        addFormatToken("ddd", 0, 0, function(format2) {
          return this.localeData().weekdaysShort(this, format2);
        });
        addFormatToken("dddd", 0, 0, function(format2) {
          return this.localeData().weekdays(this, format2);
        });
        addFormatToken("e", 0, 0, "weekday");
        addFormatToken("E", 0, 0, "isoWeekday");
        addUnitAlias("day", "d");
        addUnitAlias("weekday", "e");
        addUnitAlias("isoWeekday", "E");
        addUnitPriority("day", 11);
        addUnitPriority("weekday", 11);
        addUnitPriority("isoWeekday", 11);
        addRegexToken("d", match1to2);
        addRegexToken("e", match1to2);
        addRegexToken("E", match1to2);
        addRegexToken("dd", function(isStrict, locale2) {
          return locale2.weekdaysMinRegex(isStrict);
        });
        addRegexToken("ddd", function(isStrict, locale2) {
          return locale2.weekdaysShortRegex(isStrict);
        });
        addRegexToken("dddd", function(isStrict, locale2) {
          return locale2.weekdaysRegex(isStrict);
        });
        addWeekParseToken(["dd", "ddd", "dddd"], function(input2, week, config, token3) {
          var weekday = config._locale.weekdaysParse(input2, token3, config._strict);
          if (weekday != null) {
            week.d = weekday;
          } else {
            getParsingFlags(config).invalidWeekday = input2;
          }
        });
        addWeekParseToken(["d", "e", "E"], function(input2, week, config, token3) {
          week[token3] = toInt(input2);
        });
        function parseWeekday(input2, locale2) {
          if (typeof input2 !== "string") {
            return input2;
          }
          if (!isNaN(input2)) {
            return parseInt(input2, 10);
          }
          input2 = locale2.weekdaysParse(input2);
          if (typeof input2 === "number") {
            return input2;
          }
          return null;
        }
        function parseIsoWeekday(input2, locale2) {
          if (typeof input2 === "string") {
            return locale2.weekdaysParse(input2) % 7 || 7;
          }
          return isNaN(input2) ? null : input2;
        }
        function shiftWeekdays(ws, n) {
          return ws.slice(n, 7).concat(ws.slice(0, n));
        }
        var defaultLocaleWeekdays = "Sunday_Monday_Tuesday_Wednesday_Thursday_Friday_Saturday".split("_"), defaultLocaleWeekdaysShort = "Sun_Mon_Tue_Wed_Thu_Fri_Sat".split("_"), defaultLocaleWeekdaysMin = "Su_Mo_Tu_We_Th_Fr_Sa".split("_"), defaultWeekdaysRegex = matchWord, defaultWeekdaysShortRegex = matchWord, defaultWeekdaysMinRegex = matchWord;
        function localeWeekdays(m, format2) {
          var weekdays = isArray2(this._weekdays) ? this._weekdays : this._weekdays[m && m !== true && this._weekdays.isFormat.test(format2) ? "format" : "standalone"];
          return m === true ? shiftWeekdays(weekdays, this._week.dow) : m ? weekdays[m.day()] : weekdays;
        }
        function localeWeekdaysShort(m) {
          return m === true ? shiftWeekdays(this._weekdaysShort, this._week.dow) : m ? this._weekdaysShort[m.day()] : this._weekdaysShort;
        }
        function localeWeekdaysMin(m) {
          return m === true ? shiftWeekdays(this._weekdaysMin, this._week.dow) : m ? this._weekdaysMin[m.day()] : this._weekdaysMin;
        }
        function handleStrictParse$1(weekdayName, format2, strict) {
          var i2, ii, mom, llc = weekdayName.toLocaleLowerCase();
          if (!this._weekdaysParse) {
            this._weekdaysParse = [];
            this._shortWeekdaysParse = [];
            this._minWeekdaysParse = [];
            for (i2 = 0; i2 < 7; ++i2) {
              mom = createUTC([2e3, 1]).day(i2);
              this._minWeekdaysParse[i2] = this.weekdaysMin(
                mom,
                ""
              ).toLocaleLowerCase();
              this._shortWeekdaysParse[i2] = this.weekdaysShort(
                mom,
                ""
              ).toLocaleLowerCase();
              this._weekdaysParse[i2] = this.weekdays(mom, "").toLocaleLowerCase();
            }
          }
          if (strict) {
            if (format2 === "dddd") {
              ii = indexOf.call(this._weekdaysParse, llc);
              return ii !== -1 ? ii : null;
            } else if (format2 === "ddd") {
              ii = indexOf.call(this._shortWeekdaysParse, llc);
              return ii !== -1 ? ii : null;
            } else {
              ii = indexOf.call(this._minWeekdaysParse, llc);
              return ii !== -1 ? ii : null;
            }
          } else {
            if (format2 === "dddd") {
              ii = indexOf.call(this._weekdaysParse, llc);
              if (ii !== -1) {
                return ii;
              }
              ii = indexOf.call(this._shortWeekdaysParse, llc);
              if (ii !== -1) {
                return ii;
              }
              ii = indexOf.call(this._minWeekdaysParse, llc);
              return ii !== -1 ? ii : null;
            } else if (format2 === "ddd") {
              ii = indexOf.call(this._shortWeekdaysParse, llc);
              if (ii !== -1) {
                return ii;
              }
              ii = indexOf.call(this._weekdaysParse, llc);
              if (ii !== -1) {
                return ii;
              }
              ii = indexOf.call(this._minWeekdaysParse, llc);
              return ii !== -1 ? ii : null;
            } else {
              ii = indexOf.call(this._minWeekdaysParse, llc);
              if (ii !== -1) {
                return ii;
              }
              ii = indexOf.call(this._weekdaysParse, llc);
              if (ii !== -1) {
                return ii;
              }
              ii = indexOf.call(this._shortWeekdaysParse, llc);
              return ii !== -1 ? ii : null;
            }
          }
        }
        function localeWeekdaysParse(weekdayName, format2, strict) {
          var i2, mom, regex;
          if (this._weekdaysParseExact) {
            return handleStrictParse$1.call(this, weekdayName, format2, strict);
          }
          if (!this._weekdaysParse) {
            this._weekdaysParse = [];
            this._minWeekdaysParse = [];
            this._shortWeekdaysParse = [];
            this._fullWeekdaysParse = [];
          }
          for (i2 = 0; i2 < 7; i2++) {
            mom = createUTC([2e3, 1]).day(i2);
            if (strict && !this._fullWeekdaysParse[i2]) {
              this._fullWeekdaysParse[i2] = new RegExp(
                "^" + this.weekdays(mom, "").replace(".", "\\.?") + "$",
                "i"
              );
              this._shortWeekdaysParse[i2] = new RegExp(
                "^" + this.weekdaysShort(mom, "").replace(".", "\\.?") + "$",
                "i"
              );
              this._minWeekdaysParse[i2] = new RegExp(
                "^" + this.weekdaysMin(mom, "").replace(".", "\\.?") + "$",
                "i"
              );
            }
            if (!this._weekdaysParse[i2]) {
              regex = "^" + this.weekdays(mom, "") + "|^" + this.weekdaysShort(mom, "") + "|^" + this.weekdaysMin(mom, "");
              this._weekdaysParse[i2] = new RegExp(regex.replace(".", ""), "i");
            }
            if (strict && format2 === "dddd" && this._fullWeekdaysParse[i2].test(weekdayName)) {
              return i2;
            } else if (strict && format2 === "ddd" && this._shortWeekdaysParse[i2].test(weekdayName)) {
              return i2;
            } else if (strict && format2 === "dd" && this._minWeekdaysParse[i2].test(weekdayName)) {
              return i2;
            } else if (!strict && this._weekdaysParse[i2].test(weekdayName)) {
              return i2;
            }
          }
        }
        function getSetDayOfWeek(input2) {
          if (!this.isValid()) {
            return input2 != null ? this : NaN;
          }
          var day = this._isUTC ? this._d.getUTCDay() : this._d.getDay();
          if (input2 != null) {
            input2 = parseWeekday(input2, this.localeData());
            return this.add(input2 - day, "d");
          } else {
            return day;
          }
        }
        function getSetLocaleDayOfWeek(input2) {
          if (!this.isValid()) {
            return input2 != null ? this : NaN;
          }
          var weekday = (this.day() + 7 - this.localeData()._week.dow) % 7;
          return input2 == null ? weekday : this.add(input2 - weekday, "d");
        }
        function getSetISODayOfWeek(input2) {
          if (!this.isValid()) {
            return input2 != null ? this : NaN;
          }
          if (input2 != null) {
            var weekday = parseIsoWeekday(input2, this.localeData());
            return this.day(this.day() % 7 ? weekday : weekday - 7);
          } else {
            return this.day() || 7;
          }
        }
        function weekdaysRegex(isStrict) {
          if (this._weekdaysParseExact) {
            if (!hasOwnProp(this, "_weekdaysRegex")) {
              computeWeekdaysParse.call(this);
            }
            if (isStrict) {
              return this._weekdaysStrictRegex;
            } else {
              return this._weekdaysRegex;
            }
          } else {
            if (!hasOwnProp(this, "_weekdaysRegex")) {
              this._weekdaysRegex = defaultWeekdaysRegex;
            }
            return this._weekdaysStrictRegex && isStrict ? this._weekdaysStrictRegex : this._weekdaysRegex;
          }
        }
        function weekdaysShortRegex(isStrict) {
          if (this._weekdaysParseExact) {
            if (!hasOwnProp(this, "_weekdaysRegex")) {
              computeWeekdaysParse.call(this);
            }
            if (isStrict) {
              return this._weekdaysShortStrictRegex;
            } else {
              return this._weekdaysShortRegex;
            }
          } else {
            if (!hasOwnProp(this, "_weekdaysShortRegex")) {
              this._weekdaysShortRegex = defaultWeekdaysShortRegex;
            }
            return this._weekdaysShortStrictRegex && isStrict ? this._weekdaysShortStrictRegex : this._weekdaysShortRegex;
          }
        }
        function weekdaysMinRegex(isStrict) {
          if (this._weekdaysParseExact) {
            if (!hasOwnProp(this, "_weekdaysRegex")) {
              computeWeekdaysParse.call(this);
            }
            if (isStrict) {
              return this._weekdaysMinStrictRegex;
            } else {
              return this._weekdaysMinRegex;
            }
          } else {
            if (!hasOwnProp(this, "_weekdaysMinRegex")) {
              this._weekdaysMinRegex = defaultWeekdaysMinRegex;
            }
            return this._weekdaysMinStrictRegex && isStrict ? this._weekdaysMinStrictRegex : this._weekdaysMinRegex;
          }
        }
        function computeWeekdaysParse() {
          function cmpLenRev(a, b) {
            return b.length - a.length;
          }
          var minPieces = [], shortPieces = [], longPieces = [], mixedPieces = [], i2, mom, minp, shortp, longp;
          for (i2 = 0; i2 < 7; i2++) {
            mom = createUTC([2e3, 1]).day(i2);
            minp = regexEscape(this.weekdaysMin(mom, ""));
            shortp = regexEscape(this.weekdaysShort(mom, ""));
            longp = regexEscape(this.weekdays(mom, ""));
            minPieces.push(minp);
            shortPieces.push(shortp);
            longPieces.push(longp);
            mixedPieces.push(minp);
            mixedPieces.push(shortp);
            mixedPieces.push(longp);
          }
          minPieces.sort(cmpLenRev);
          shortPieces.sort(cmpLenRev);
          longPieces.sort(cmpLenRev);
          mixedPieces.sort(cmpLenRev);
          this._weekdaysRegex = new RegExp("^(" + mixedPieces.join("|") + ")", "i");
          this._weekdaysShortRegex = this._weekdaysRegex;
          this._weekdaysMinRegex = this._weekdaysRegex;
          this._weekdaysStrictRegex = new RegExp(
            "^(" + longPieces.join("|") + ")",
            "i"
          );
          this._weekdaysShortStrictRegex = new RegExp(
            "^(" + shortPieces.join("|") + ")",
            "i"
          );
          this._weekdaysMinStrictRegex = new RegExp(
            "^(" + minPieces.join("|") + ")",
            "i"
          );
        }
        function hFormat() {
          return this.hours() % 12 || 12;
        }
        function kFormat() {
          return this.hours() || 24;
        }
        addFormatToken("H", ["HH", 2], 0, "hour");
        addFormatToken("h", ["hh", 2], 0, hFormat);
        addFormatToken("k", ["kk", 2], 0, kFormat);
        addFormatToken("hmm", 0, 0, function() {
          return "" + hFormat.apply(this) + zeroFill(this.minutes(), 2);
        });
        addFormatToken("hmmss", 0, 0, function() {
          return "" + hFormat.apply(this) + zeroFill(this.minutes(), 2) + zeroFill(this.seconds(), 2);
        });
        addFormatToken("Hmm", 0, 0, function() {
          return "" + this.hours() + zeroFill(this.minutes(), 2);
        });
        addFormatToken("Hmmss", 0, 0, function() {
          return "" + this.hours() + zeroFill(this.minutes(), 2) + zeroFill(this.seconds(), 2);
        });
        function meridiem(token3, lowercase) {
          addFormatToken(token3, 0, 0, function() {
            return this.localeData().meridiem(
              this.hours(),
              this.minutes(),
              lowercase
            );
          });
        }
        meridiem("a", true);
        meridiem("A", false);
        addUnitAlias("hour", "h");
        addUnitPriority("hour", 13);
        function matchMeridiem(isStrict, locale2) {
          return locale2._meridiemParse;
        }
        addRegexToken("a", matchMeridiem);
        addRegexToken("A", matchMeridiem);
        addRegexToken("H", match1to2);
        addRegexToken("h", match1to2);
        addRegexToken("k", match1to2);
        addRegexToken("HH", match1to2, match2);
        addRegexToken("hh", match1to2, match2);
        addRegexToken("kk", match1to2, match2);
        addRegexToken("hmm", match3to4);
        addRegexToken("hmmss", match5to6);
        addRegexToken("Hmm", match3to4);
        addRegexToken("Hmmss", match5to6);
        addParseToken(["H", "HH"], HOUR);
        addParseToken(["k", "kk"], function(input2, array, config) {
          var kInput = toInt(input2);
          array[HOUR] = kInput === 24 ? 0 : kInput;
        });
        addParseToken(["a", "A"], function(input2, array, config) {
          config._isPm = config._locale.isPM(input2);
          config._meridiem = input2;
        });
        addParseToken(["h", "hh"], function(input2, array, config) {
          array[HOUR] = toInt(input2);
          getParsingFlags(config).bigHour = true;
        });
        addParseToken("hmm", function(input2, array, config) {
          var pos = input2.length - 2;
          array[HOUR] = toInt(input2.substr(0, pos));
          array[MINUTE] = toInt(input2.substr(pos));
          getParsingFlags(config).bigHour = true;
        });
        addParseToken("hmmss", function(input2, array, config) {
          var pos1 = input2.length - 4, pos2 = input2.length - 2;
          array[HOUR] = toInt(input2.substr(0, pos1));
          array[MINUTE] = toInt(input2.substr(pos1, 2));
          array[SECOND] = toInt(input2.substr(pos2));
          getParsingFlags(config).bigHour = true;
        });
        addParseToken("Hmm", function(input2, array, config) {
          var pos = input2.length - 2;
          array[HOUR] = toInt(input2.substr(0, pos));
          array[MINUTE] = toInt(input2.substr(pos));
        });
        addParseToken("Hmmss", function(input2, array, config) {
          var pos1 = input2.length - 4, pos2 = input2.length - 2;
          array[HOUR] = toInt(input2.substr(0, pos1));
          array[MINUTE] = toInt(input2.substr(pos1, 2));
          array[SECOND] = toInt(input2.substr(pos2));
        });
        function localeIsPM(input2) {
          return (input2 + "").toLowerCase().charAt(0) === "p";
        }
        var defaultLocaleMeridiemParse = /[ap]\.?m?\.?/i, getSetHour = makeGetSet("Hours", true);
        function localeMeridiem(hours2, minutes2, isLower) {
          if (hours2 > 11) {
            return isLower ? "pm" : "PM";
          } else {
            return isLower ? "am" : "AM";
          }
        }
        var baseConfig = {
          calendar: defaultCalendar,
          longDateFormat: defaultLongDateFormat,
          invalidDate: defaultInvalidDate,
          ordinal: defaultOrdinal,
          dayOfMonthOrdinalParse: defaultDayOfMonthOrdinalParse,
          relativeTime: defaultRelativeTime,
          months: defaultLocaleMonths,
          monthsShort: defaultLocaleMonthsShort,
          week: defaultLocaleWeek,
          weekdays: defaultLocaleWeekdays,
          weekdaysMin: defaultLocaleWeekdaysMin,
          weekdaysShort: defaultLocaleWeekdaysShort,
          meridiemParse: defaultLocaleMeridiemParse
        };
        var locales = {}, localeFamilies = {}, globalLocale;
        function commonPrefix(arr1, arr2) {
          var i2, minl = Math.min(arr1.length, arr2.length);
          for (i2 = 0; i2 < minl; i2 += 1) {
            if (arr1[i2] !== arr2[i2]) {
              return i2;
            }
          }
          return minl;
        }
        function normalizeLocale(key) {
          return key ? key.toLowerCase().replace("_", "-") : key;
        }
        function chooseLocale(names) {
          var i2 = 0, j, next, locale2, split;
          while (i2 < names.length) {
            split = normalizeLocale(names[i2]).split("-");
            j = split.length;
            next = normalizeLocale(names[i2 + 1]);
            next = next ? next.split("-") : null;
            while (j > 0) {
              locale2 = loadLocale(split.slice(0, j).join("-"));
              if (locale2) {
                return locale2;
              }
              if (next && next.length >= j && commonPrefix(split, next) >= j - 1) {
                break;
              }
              j--;
            }
            i2++;
          }
          return globalLocale;
        }
        function isLocaleNameSane(name) {
          return name.match("^[^/\\\\]*$") != null;
        }
        function loadLocale(name) {
          var oldLocale = null, aliasedRequire;
          if (locales[name] === void 0 && typeof module !== "undefined" && module && module.exports && isLocaleNameSane(name)) {
            try {
              oldLocale = globalLocale._abbr;
              aliasedRequire = __require;
              aliasedRequire("./locale/" + name);
              getSetGlobalLocale(oldLocale);
            } catch (e) {
              locales[name] = null;
            }
          }
          return locales[name];
        }
        function getSetGlobalLocale(key, values) {
          var data;
          if (key) {
            if (isUndefined2(values)) {
              data = getLocale(key);
            } else {
              data = defineLocale(key, values);
            }
            if (data) {
              globalLocale = data;
            } else {
              if (typeof console !== "undefined" && console.warn) {
                console.warn(
                  "Locale " + key + " not found. Did you forget to load it?"
                );
              }
            }
          }
          return globalLocale._abbr;
        }
        function defineLocale(name, config) {
          if (config !== null) {
            var locale2, parentConfig = baseConfig;
            config.abbr = name;
            if (locales[name] != null) {
              deprecateSimple(
                "defineLocaleOverride",
                "use moment.updateLocale(localeName, config) to change an existing locale. moment.defineLocale(localeName, config) should only be used for creating a new locale See http://momentjs.com/guides/#/warnings/define-locale/ for more info."
              );
              parentConfig = locales[name]._config;
            } else if (config.parentLocale != null) {
              if (locales[config.parentLocale] != null) {
                parentConfig = locales[config.parentLocale]._config;
              } else {
                locale2 = loadLocale(config.parentLocale);
                if (locale2 != null) {
                  parentConfig = locale2._config;
                } else {
                  if (!localeFamilies[config.parentLocale]) {
                    localeFamilies[config.parentLocale] = [];
                  }
                  localeFamilies[config.parentLocale].push({
                    name,
                    config
                  });
                  return null;
                }
              }
            }
            locales[name] = new Locale(mergeConfigs(parentConfig, config));
            if (localeFamilies[name]) {
              localeFamilies[name].forEach(function(x) {
                defineLocale(x.name, x.config);
              });
            }
            getSetGlobalLocale(name);
            return locales[name];
          } else {
            delete locales[name];
            return null;
          }
        }
        function updateLocale(name, config) {
          if (config != null) {
            var locale2, tmpLocale, parentConfig = baseConfig;
            if (locales[name] != null && locales[name].parentLocale != null) {
              locales[name].set(mergeConfigs(locales[name]._config, config));
            } else {
              tmpLocale = loadLocale(name);
              if (tmpLocale != null) {
                parentConfig = tmpLocale._config;
              }
              config = mergeConfigs(parentConfig, config);
              if (tmpLocale == null) {
                config.abbr = name;
              }
              locale2 = new Locale(config);
              locale2.parentLocale = locales[name];
              locales[name] = locale2;
            }
            getSetGlobalLocale(name);
          } else {
            if (locales[name] != null) {
              if (locales[name].parentLocale != null) {
                locales[name] = locales[name].parentLocale;
                if (name === getSetGlobalLocale()) {
                  getSetGlobalLocale(name);
                }
              } else if (locales[name] != null) {
                delete locales[name];
              }
            }
          }
          return locales[name];
        }
        function getLocale(key) {
          var locale2;
          if (key && key._locale && key._locale._abbr) {
            key = key._locale._abbr;
          }
          if (!key) {
            return globalLocale;
          }
          if (!isArray2(key)) {
            locale2 = loadLocale(key);
            if (locale2) {
              return locale2;
            }
            key = [key];
          }
          return chooseLocale(key);
        }
        function listLocales() {
          return keys(locales);
        }
        function checkOverflow(m) {
          var overflow, a = m._a;
          if (a && getParsingFlags(m).overflow === -2) {
            overflow = a[MONTH] < 0 || a[MONTH] > 11 ? MONTH : a[DATE] < 1 || a[DATE] > daysInMonth(a[YEAR], a[MONTH]) ? DATE : a[HOUR] < 0 || a[HOUR] > 24 || a[HOUR] === 24 && (a[MINUTE] !== 0 || a[SECOND] !== 0 || a[MILLISECOND] !== 0) ? HOUR : a[MINUTE] < 0 || a[MINUTE] > 59 ? MINUTE : a[SECOND] < 0 || a[SECOND] > 59 ? SECOND : a[MILLISECOND] < 0 || a[MILLISECOND] > 999 ? MILLISECOND : -1;
            if (getParsingFlags(m)._overflowDayOfYear && (overflow < YEAR || overflow > DATE)) {
              overflow = DATE;
            }
            if (getParsingFlags(m)._overflowWeeks && overflow === -1) {
              overflow = WEEK;
            }
            if (getParsingFlags(m)._overflowWeekday && overflow === -1) {
              overflow = WEEKDAY;
            }
            getParsingFlags(m).overflow = overflow;
          }
          return m;
        }
        var extendedIsoRegex = /^\s*((?:[+-]\d{6}|\d{4})-(?:\d\d-\d\d|W\d\d-\d|W\d\d|\d\d\d|\d\d))(?:(T| )(\d\d(?::\d\d(?::\d\d(?:[.,]\d+)?)?)?)([+-]\d\d(?::?\d\d)?|\s*Z)?)?$/, basicIsoRegex = /^\s*((?:[+-]\d{6}|\d{4})(?:\d\d\d\d|W\d\d\d|W\d\d|\d\d\d|\d\d|))(?:(T| )(\d\d(?:\d\d(?:\d\d(?:[.,]\d+)?)?)?)([+-]\d\d(?::?\d\d)?|\s*Z)?)?$/, tzRegex = /Z|[+-]\d\d(?::?\d\d)?/, isoDates = [
          ["YYYYYY-MM-DD", /[+-]\d{6}-\d\d-\d\d/],
          ["YYYY-MM-DD", /\d{4}-\d\d-\d\d/],
          ["GGGG-[W]WW-E", /\d{4}-W\d\d-\d/],
          ["GGGG-[W]WW", /\d{4}-W\d\d/, false],
          ["YYYY-DDD", /\d{4}-\d{3}/],
          ["YYYY-MM", /\d{4}-\d\d/, false],
          ["YYYYYYMMDD", /[+-]\d{10}/],
          ["YYYYMMDD", /\d{8}/],
          ["GGGG[W]WWE", /\d{4}W\d{3}/],
          ["GGGG[W]WW", /\d{4}W\d{2}/, false],
          ["YYYYDDD", /\d{7}/],
          ["YYYYMM", /\d{6}/, false],
          ["YYYY", /\d{4}/, false]
        ], isoTimes = [
          ["HH:mm:ss.SSSS", /\d\d:\d\d:\d\d\.\d+/],
          ["HH:mm:ss,SSSS", /\d\d:\d\d:\d\d,\d+/],
          ["HH:mm:ss", /\d\d:\d\d:\d\d/],
          ["HH:mm", /\d\d:\d\d/],
          ["HHmmss.SSSS", /\d\d\d\d\d\d\.\d+/],
          ["HHmmss,SSSS", /\d\d\d\d\d\d,\d+/],
          ["HHmmss", /\d\d\d\d\d\d/],
          ["HHmm", /\d\d\d\d/],
          ["HH", /\d\d/]
        ], aspNetJsonRegex = /^\/?Date\((-?\d+)/i, rfc2822 = /^(?:(Mon|Tue|Wed|Thu|Fri|Sat|Sun),?\s)?(\d{1,2})\s(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s(\d{2,4})\s(\d\d):(\d\d)(?::(\d\d))?\s(?:(UT|GMT|[ECMP][SD]T)|([Zz])|([+-]\d{4}))$/, obsOffsets = {
          UT: 0,
          GMT: 0,
          EDT: -4 * 60,
          EST: -5 * 60,
          CDT: -5 * 60,
          CST: -6 * 60,
          MDT: -6 * 60,
          MST: -7 * 60,
          PDT: -7 * 60,
          PST: -8 * 60
        };
        function configFromISO(config) {
          var i2, l, string = config._i, match = extendedIsoRegex.exec(string) || basicIsoRegex.exec(string), allowTime, dateFormat, timeFormat, tzFormat, isoDatesLen = isoDates.length, isoTimesLen = isoTimes.length;
          if (match) {
            getParsingFlags(config).iso = true;
            for (i2 = 0, l = isoDatesLen; i2 < l; i2++) {
              if (isoDates[i2][1].exec(match[1])) {
                dateFormat = isoDates[i2][0];
                allowTime = isoDates[i2][2] !== false;
                break;
              }
            }
            if (dateFormat == null) {
              config._isValid = false;
              return;
            }
            if (match[3]) {
              for (i2 = 0, l = isoTimesLen; i2 < l; i2++) {
                if (isoTimes[i2][1].exec(match[3])) {
                  timeFormat = (match[2] || " ") + isoTimes[i2][0];
                  break;
                }
              }
              if (timeFormat == null) {
                config._isValid = false;
                return;
              }
            }
            if (!allowTime && timeFormat != null) {
              config._isValid = false;
              return;
            }
            if (match[4]) {
              if (tzRegex.exec(match[4])) {
                tzFormat = "Z";
              } else {
                config._isValid = false;
                return;
              }
            }
            config._f = dateFormat + (timeFormat || "") + (tzFormat || "");
            configFromStringAndFormat(config);
          } else {
            config._isValid = false;
          }
        }
        function extractFromRFC2822Strings(yearStr, monthStr, dayStr, hourStr, minuteStr, secondStr) {
          var result = [
            untruncateYear(yearStr),
            defaultLocaleMonthsShort.indexOf(monthStr),
            parseInt(dayStr, 10),
            parseInt(hourStr, 10),
            parseInt(minuteStr, 10)
          ];
          if (secondStr) {
            result.push(parseInt(secondStr, 10));
          }
          return result;
        }
        function untruncateYear(yearStr) {
          var year = parseInt(yearStr, 10);
          if (year <= 49) {
            return 2e3 + year;
          } else if (year <= 999) {
            return 1900 + year;
          }
          return year;
        }
        function preprocessRFC2822(s) {
          return s.replace(/\([^()]*\)|[\n\t]/g, " ").replace(/(\s\s+)/g, " ").replace(/^\s\s*/, "").replace(/\s\s*$/, "");
        }
        function checkWeekday(weekdayStr, parsedInput, config) {
          if (weekdayStr) {
            var weekdayProvided = defaultLocaleWeekdaysShort.indexOf(weekdayStr), weekdayActual = new Date(
              parsedInput[0],
              parsedInput[1],
              parsedInput[2]
            ).getDay();
            if (weekdayProvided !== weekdayActual) {
              getParsingFlags(config).weekdayMismatch = true;
              config._isValid = false;
              return false;
            }
          }
          return true;
        }
        function calculateOffset(obsOffset, militaryOffset, numOffset) {
          if (obsOffset) {
            return obsOffsets[obsOffset];
          } else if (militaryOffset) {
            return 0;
          } else {
            var hm = parseInt(numOffset, 10), m = hm % 100, h = (hm - m) / 100;
            return h * 60 + m;
          }
        }
        function configFromRFC2822(config) {
          var match = rfc2822.exec(preprocessRFC2822(config._i)), parsedArray;
          if (match) {
            parsedArray = extractFromRFC2822Strings(
              match[4],
              match[3],
              match[2],
              match[5],
              match[6],
              match[7]
            );
            if (!checkWeekday(match[1], parsedArray, config)) {
              return;
            }
            config._a = parsedArray;
            config._tzm = calculateOffset(match[8], match[9], match[10]);
            config._d = createUTCDate.apply(null, config._a);
            config._d.setUTCMinutes(config._d.getUTCMinutes() - config._tzm);
            getParsingFlags(config).rfc2822 = true;
          } else {
            config._isValid = false;
          }
        }
        function configFromString(config) {
          var matched = aspNetJsonRegex.exec(config._i);
          if (matched !== null) {
            config._d = new Date(+matched[1]);
            return;
          }
          configFromISO(config);
          if (config._isValid === false) {
            delete config._isValid;
          } else {
            return;
          }
          configFromRFC2822(config);
          if (config._isValid === false) {
            delete config._isValid;
          } else {
            return;
          }
          if (config._strict) {
            config._isValid = false;
          } else {
            hooks.createFromInputFallback(config);
          }
        }
        hooks.createFromInputFallback = deprecate(
          "value provided is not in a recognized RFC2822 or ISO format. moment construction falls back to js Date(), which is not reliable across all browsers and versions. Non RFC2822/ISO date formats are discouraged. Please refer to http://momentjs.com/guides/#/warnings/js-date/ for more info.",
          function(config) {
            config._d = new Date(config._i + (config._useUTC ? " UTC" : ""));
          }
        );
        function defaults2(a, b, c) {
          if (a != null) {
            return a;
          }
          if (b != null) {
            return b;
          }
          return c;
        }
        function currentDateArray(config) {
          var nowValue = new Date(hooks.now());
          if (config._useUTC) {
            return [
              nowValue.getUTCFullYear(),
              nowValue.getUTCMonth(),
              nowValue.getUTCDate()
            ];
          }
          return [nowValue.getFullYear(), nowValue.getMonth(), nowValue.getDate()];
        }
        function configFromArray(config) {
          var i2, date, input2 = [], currentDate, expectedWeekday, yearToUse;
          if (config._d) {
            return;
          }
          currentDate = currentDateArray(config);
          if (config._w && config._a[DATE] == null && config._a[MONTH] == null) {
            dayOfYearFromWeekInfo(config);
          }
          if (config._dayOfYear != null) {
            yearToUse = defaults2(config._a[YEAR], currentDate[YEAR]);
            if (config._dayOfYear > daysInYear(yearToUse) || config._dayOfYear === 0) {
              getParsingFlags(config)._overflowDayOfYear = true;
            }
            date = createUTCDate(yearToUse, 0, config._dayOfYear);
            config._a[MONTH] = date.getUTCMonth();
            config._a[DATE] = date.getUTCDate();
          }
          for (i2 = 0; i2 < 3 && config._a[i2] == null; ++i2) {
            config._a[i2] = input2[i2] = currentDate[i2];
          }
          for (; i2 < 7; i2++) {
            config._a[i2] = input2[i2] = config._a[i2] == null ? i2 === 2 ? 1 : 0 : config._a[i2];
          }
          if (config._a[HOUR] === 24 && config._a[MINUTE] === 0 && config._a[SECOND] === 0 && config._a[MILLISECOND] === 0) {
            config._nextDay = true;
            config._a[HOUR] = 0;
          }
          config._d = (config._useUTC ? createUTCDate : createDate).apply(
            null,
            input2
          );
          expectedWeekday = config._useUTC ? config._d.getUTCDay() : config._d.getDay();
          if (config._tzm != null) {
            config._d.setUTCMinutes(config._d.getUTCMinutes() - config._tzm);
          }
          if (config._nextDay) {
            config._a[HOUR] = 24;
          }
          if (config._w && typeof config._w.d !== "undefined" && config._w.d !== expectedWeekday) {
            getParsingFlags(config).weekdayMismatch = true;
          }
        }
        function dayOfYearFromWeekInfo(config) {
          var w, weekYear, week, weekday, dow, doy, temp, weekdayOverflow, curWeek;
          w = config._w;
          if (w.GG != null || w.W != null || w.E != null) {
            dow = 1;
            doy = 4;
            weekYear = defaults2(
              w.GG,
              config._a[YEAR],
              weekOfYear(createLocal(), 1, 4).year
            );
            week = defaults2(w.W, 1);
            weekday = defaults2(w.E, 1);
            if (weekday < 1 || weekday > 7) {
              weekdayOverflow = true;
            }
          } else {
            dow = config._locale._week.dow;
            doy = config._locale._week.doy;
            curWeek = weekOfYear(createLocal(), dow, doy);
            weekYear = defaults2(w.gg, config._a[YEAR], curWeek.year);
            week = defaults2(w.w, curWeek.week);
            if (w.d != null) {
              weekday = w.d;
              if (weekday < 0 || weekday > 6) {
                weekdayOverflow = true;
              }
            } else if (w.e != null) {
              weekday = w.e + dow;
              if (w.e < 0 || w.e > 6) {
                weekdayOverflow = true;
              }
            } else {
              weekday = dow;
            }
          }
          if (week < 1 || week > weeksInYear(weekYear, dow, doy)) {
            getParsingFlags(config)._overflowWeeks = true;
          } else if (weekdayOverflow != null) {
            getParsingFlags(config)._overflowWeekday = true;
          } else {
            temp = dayOfYearFromWeeks(weekYear, week, weekday, dow, doy);
            config._a[YEAR] = temp.year;
            config._dayOfYear = temp.dayOfYear;
          }
        }
        hooks.ISO_8601 = function() {
        };
        hooks.RFC_2822 = function() {
        };
        function configFromStringAndFormat(config) {
          if (config._f === hooks.ISO_8601) {
            configFromISO(config);
            return;
          }
          if (config._f === hooks.RFC_2822) {
            configFromRFC2822(config);
            return;
          }
          config._a = [];
          getParsingFlags(config).empty = true;
          var string = "" + config._i, i2, parsedInput, tokens2, token3, skipped, stringLength = string.length, totalParsedInputLength = 0, era, tokenLen;
          tokens2 = expandFormat(config._f, config._locale).match(formattingTokens) || [];
          tokenLen = tokens2.length;
          for (i2 = 0; i2 < tokenLen; i2++) {
            token3 = tokens2[i2];
            parsedInput = (string.match(getParseRegexForToken(token3, config)) || [])[0];
            if (parsedInput) {
              skipped = string.substr(0, string.indexOf(parsedInput));
              if (skipped.length > 0) {
                getParsingFlags(config).unusedInput.push(skipped);
              }
              string = string.slice(
                string.indexOf(parsedInput) + parsedInput.length
              );
              totalParsedInputLength += parsedInput.length;
            }
            if (formatTokenFunctions[token3]) {
              if (parsedInput) {
                getParsingFlags(config).empty = false;
              } else {
                getParsingFlags(config).unusedTokens.push(token3);
              }
              addTimeToArrayFromToken(token3, parsedInput, config);
            } else if (config._strict && !parsedInput) {
              getParsingFlags(config).unusedTokens.push(token3);
            }
          }
          getParsingFlags(config).charsLeftOver = stringLength - totalParsedInputLength;
          if (string.length > 0) {
            getParsingFlags(config).unusedInput.push(string);
          }
          if (config._a[HOUR] <= 12 && getParsingFlags(config).bigHour === true && config._a[HOUR] > 0) {
            getParsingFlags(config).bigHour = void 0;
          }
          getParsingFlags(config).parsedDateParts = config._a.slice(0);
          getParsingFlags(config).meridiem = config._meridiem;
          config._a[HOUR] = meridiemFixWrap(
            config._locale,
            config._a[HOUR],
            config._meridiem
          );
          era = getParsingFlags(config).era;
          if (era !== null) {
            config._a[YEAR] = config._locale.erasConvertYear(era, config._a[YEAR]);
          }
          configFromArray(config);
          checkOverflow(config);
        }
        function meridiemFixWrap(locale2, hour, meridiem2) {
          var isPm;
          if (meridiem2 == null) {
            return hour;
          }
          if (locale2.meridiemHour != null) {
            return locale2.meridiemHour(hour, meridiem2);
          } else if (locale2.isPM != null) {
            isPm = locale2.isPM(meridiem2);
            if (isPm && hour < 12) {
              hour += 12;
            }
            if (!isPm && hour === 12) {
              hour = 0;
            }
            return hour;
          } else {
            return hour;
          }
        }
        function configFromStringAndArray(config) {
          var tempConfig, bestMoment, scoreToBeat, i2, currentScore, validFormatFound, bestFormatIsValid = false, configfLen = config._f.length;
          if (configfLen === 0) {
            getParsingFlags(config).invalidFormat = true;
            config._d = new Date(NaN);
            return;
          }
          for (i2 = 0; i2 < configfLen; i2++) {
            currentScore = 0;
            validFormatFound = false;
            tempConfig = copyConfig({}, config);
            if (config._useUTC != null) {
              tempConfig._useUTC = config._useUTC;
            }
            tempConfig._f = config._f[i2];
            configFromStringAndFormat(tempConfig);
            if (isValid(tempConfig)) {
              validFormatFound = true;
            }
            currentScore += getParsingFlags(tempConfig).charsLeftOver;
            currentScore += getParsingFlags(tempConfig).unusedTokens.length * 10;
            getParsingFlags(tempConfig).score = currentScore;
            if (!bestFormatIsValid) {
              if (scoreToBeat == null || currentScore < scoreToBeat || validFormatFound) {
                scoreToBeat = currentScore;
                bestMoment = tempConfig;
                if (validFormatFound) {
                  bestFormatIsValid = true;
                }
              }
            } else {
              if (currentScore < scoreToBeat) {
                scoreToBeat = currentScore;
                bestMoment = tempConfig;
              }
            }
          }
          extend2(config, bestMoment || tempConfig);
        }
        function configFromObject(config) {
          if (config._d) {
            return;
          }
          var i2 = normalizeObjectUnits(config._i), dayOrDate = i2.day === void 0 ? i2.date : i2.day;
          config._a = map2(
            [i2.year, i2.month, dayOrDate, i2.hour, i2.minute, i2.second, i2.millisecond],
            function(obj2) {
              return obj2 && parseInt(obj2, 10);
            }
          );
          configFromArray(config);
        }
        function createFromConfig(config) {
          var res = new Moment(checkOverflow(prepareConfig(config)));
          if (res._nextDay) {
            res.add(1, "d");
            res._nextDay = void 0;
          }
          return res;
        }
        function prepareConfig(config) {
          var input2 = config._i, format2 = config._f;
          config._locale = config._locale || getLocale(config._l);
          if (input2 === null || format2 === void 0 && input2 === "") {
            return createInvalid({ nullInput: true });
          }
          if (typeof input2 === "string") {
            config._i = input2 = config._locale.preparse(input2);
          }
          if (isMoment(input2)) {
            return new Moment(checkOverflow(input2));
          } else if (isDate2(input2)) {
            config._d = input2;
          } else if (isArray2(format2)) {
            configFromStringAndArray(config);
          } else if (format2) {
            configFromStringAndFormat(config);
          } else {
            configFromInput(config);
          }
          if (!isValid(config)) {
            config._d = null;
          }
          return config;
        }
        function configFromInput(config) {
          var input2 = config._i;
          if (isUndefined2(input2)) {
            config._d = new Date(hooks.now());
          } else if (isDate2(input2)) {
            config._d = new Date(input2.valueOf());
          } else if (typeof input2 === "string") {
            configFromString(config);
          } else if (isArray2(input2)) {
            config._a = map2(input2.slice(0), function(obj2) {
              return parseInt(obj2, 10);
            });
            configFromArray(config);
          } else if (isObject3(input2)) {
            configFromObject(config);
          } else if (isNumber2(input2)) {
            config._d = new Date(input2);
          } else {
            hooks.createFromInputFallback(config);
          }
        }
        function createLocalOrUTC(input2, format2, locale2, strict, isUTC) {
          var c = {};
          if (format2 === true || format2 === false) {
            strict = format2;
            format2 = void 0;
          }
          if (locale2 === true || locale2 === false) {
            strict = locale2;
            locale2 = void 0;
          }
          if (isObject3(input2) && isObjectEmpty(input2) || isArray2(input2) && input2.length === 0) {
            input2 = void 0;
          }
          c._isAMomentObject = true;
          c._useUTC = c._isUTC = isUTC;
          c._l = locale2;
          c._i = input2;
          c._f = format2;
          c._strict = strict;
          return createFromConfig(c);
        }
        function createLocal(input2, format2, locale2, strict) {
          return createLocalOrUTC(input2, format2, locale2, strict, false);
        }
        var prototypeMin = deprecate(
          "moment().min is deprecated, use moment.max instead. http://momentjs.com/guides/#/warnings/min-max/",
          function() {
            var other = createLocal.apply(null, arguments);
            if (this.isValid() && other.isValid()) {
              return other < this ? this : other;
            } else {
              return createInvalid();
            }
          }
        ), prototypeMax = deprecate(
          "moment().max is deprecated, use moment.min instead. http://momentjs.com/guides/#/warnings/min-max/",
          function() {
            var other = createLocal.apply(null, arguments);
            if (this.isValid() && other.isValid()) {
              return other > this ? this : other;
            } else {
              return createInvalid();
            }
          }
        );
        function pickBy(fn, moments) {
          var res, i2;
          if (moments.length === 1 && isArray2(moments[0])) {
            moments = moments[0];
          }
          if (!moments.length) {
            return createLocal();
          }
          res = moments[0];
          for (i2 = 1; i2 < moments.length; ++i2) {
            if (!moments[i2].isValid() || moments[i2][fn](res)) {
              res = moments[i2];
            }
          }
          return res;
        }
        function min() {
          var args = [].slice.call(arguments, 0);
          return pickBy("isBefore", args);
        }
        function max() {
          var args = [].slice.call(arguments, 0);
          return pickBy("isAfter", args);
        }
        var now = function() {
          return Date.now ? Date.now() : +new Date();
        };
        var ordering = [
          "year",
          "quarter",
          "month",
          "week",
          "day",
          "hour",
          "minute",
          "second",
          "millisecond"
        ];
        function isDurationValid(m) {
          var key, unitHasDecimal = false, i2, orderLen = ordering.length;
          for (key in m) {
            if (hasOwnProp(m, key) && !(indexOf.call(ordering, key) !== -1 && (m[key] == null || !isNaN(m[key])))) {
              return false;
            }
          }
          for (i2 = 0; i2 < orderLen; ++i2) {
            if (m[ordering[i2]]) {
              if (unitHasDecimal) {
                return false;
              }
              if (parseFloat(m[ordering[i2]]) !== toInt(m[ordering[i2]])) {
                unitHasDecimal = true;
              }
            }
          }
          return true;
        }
        function isValid$1() {
          return this._isValid;
        }
        function createInvalid$1() {
          return createDuration(NaN);
        }
        function Duration(duration2) {
          var normalizedInput = normalizeObjectUnits(duration2), years2 = normalizedInput.year || 0, quarters = normalizedInput.quarter || 0, months2 = normalizedInput.month || 0, weeks2 = normalizedInput.week || normalizedInput.isoWeek || 0, days2 = normalizedInput.day || 0, hours2 = normalizedInput.hour || 0, minutes2 = normalizedInput.minute || 0, seconds2 = normalizedInput.second || 0, milliseconds2 = normalizedInput.millisecond || 0;
          this._isValid = isDurationValid(normalizedInput);
          this._milliseconds = +milliseconds2 + seconds2 * 1e3 + minutes2 * 6e4 + hours2 * 1e3 * 60 * 60;
          this._days = +days2 + weeks2 * 7;
          this._months = +months2 + quarters * 3 + years2 * 12;
          this._data = {};
          this._locale = getLocale();
          this._bubble();
        }
        function isDuration(obj2) {
          return obj2 instanceof Duration;
        }
        function absRound(number) {
          if (number < 0) {
            return Math.round(-1 * number) * -1;
          } else {
            return Math.round(number);
          }
        }
        function compareArrays(array1, array2, dontConvert) {
          var len = Math.min(array1.length, array2.length), lengthDiff = Math.abs(array1.length - array2.length), diffs = 0, i2;
          for (i2 = 0; i2 < len; i2++) {
            if (dontConvert && array1[i2] !== array2[i2] || !dontConvert && toInt(array1[i2]) !== toInt(array2[i2])) {
              diffs++;
            }
          }
          return diffs + lengthDiff;
        }
        function offset(token3, separator) {
          addFormatToken(token3, 0, 0, function() {
            var offset2 = this.utcOffset(), sign2 = "+";
            if (offset2 < 0) {
              offset2 = -offset2;
              sign2 = "-";
            }
            return sign2 + zeroFill(~~(offset2 / 60), 2) + separator + zeroFill(~~offset2 % 60, 2);
          });
        }
        offset("Z", ":");
        offset("ZZ", "");
        addRegexToken("Z", matchShortOffset);
        addRegexToken("ZZ", matchShortOffset);
        addParseToken(["Z", "ZZ"], function(input2, array, config) {
          config._useUTC = true;
          config._tzm = offsetFromString(matchShortOffset, input2);
        });
        var chunkOffset = /([\+\-]|\d\d)/gi;
        function offsetFromString(matcher, string) {
          var matches = (string || "").match(matcher), chunk, parts2, minutes2;
          if (matches === null) {
            return null;
          }
          chunk = matches[matches.length - 1] || [];
          parts2 = (chunk + "").match(chunkOffset) || ["-", 0, 0];
          minutes2 = +(parts2[1] * 60) + toInt(parts2[2]);
          return minutes2 === 0 ? 0 : parts2[0] === "+" ? minutes2 : -minutes2;
        }
        function cloneWithOffset(input2, model) {
          var res, diff2;
          if (model._isUTC) {
            res = model.clone();
            diff2 = (isMoment(input2) || isDate2(input2) ? input2.valueOf() : createLocal(input2).valueOf()) - res.valueOf();
            res._d.setTime(res._d.valueOf() + diff2);
            hooks.updateOffset(res, false);
            return res;
          } else {
            return createLocal(input2).local();
          }
        }
        function getDateOffset(m) {
          return -Math.round(m._d.getTimezoneOffset());
        }
        hooks.updateOffset = function() {
        };
        function getSetOffset(input2, keepLocalTime, keepMinutes) {
          var offset2 = this._offset || 0, localAdjust;
          if (!this.isValid()) {
            return input2 != null ? this : NaN;
          }
          if (input2 != null) {
            if (typeof input2 === "string") {
              input2 = offsetFromString(matchShortOffset, input2);
              if (input2 === null) {
                return this;
              }
            } else if (Math.abs(input2) < 16 && !keepMinutes) {
              input2 = input2 * 60;
            }
            if (!this._isUTC && keepLocalTime) {
              localAdjust = getDateOffset(this);
            }
            this._offset = input2;
            this._isUTC = true;
            if (localAdjust != null) {
              this.add(localAdjust, "m");
            }
            if (offset2 !== input2) {
              if (!keepLocalTime || this._changeInProgress) {
                addSubtract(
                  this,
                  createDuration(input2 - offset2, "m"),
                  1,
                  false
                );
              } else if (!this._changeInProgress) {
                this._changeInProgress = true;
                hooks.updateOffset(this, true);
                this._changeInProgress = null;
              }
            }
            return this;
          } else {
            return this._isUTC ? offset2 : getDateOffset(this);
          }
        }
        function getSetZone(input2, keepLocalTime) {
          if (input2 != null) {
            if (typeof input2 !== "string") {
              input2 = -input2;
            }
            this.utcOffset(input2, keepLocalTime);
            return this;
          } else {
            return -this.utcOffset();
          }
        }
        function setOffsetToUTC(keepLocalTime) {
          return this.utcOffset(0, keepLocalTime);
        }
        function setOffsetToLocal(keepLocalTime) {
          if (this._isUTC) {
            this.utcOffset(0, keepLocalTime);
            this._isUTC = false;
            if (keepLocalTime) {
              this.subtract(getDateOffset(this), "m");
            }
          }
          return this;
        }
        function setOffsetToParsedOffset() {
          if (this._tzm != null) {
            this.utcOffset(this._tzm, false, true);
          } else if (typeof this._i === "string") {
            var tZone = offsetFromString(matchOffset, this._i);
            if (tZone != null) {
              this.utcOffset(tZone);
            } else {
              this.utcOffset(0, true);
            }
          }
          return this;
        }
        function hasAlignedHourOffset(input2) {
          if (!this.isValid()) {
            return false;
          }
          input2 = input2 ? createLocal(input2).utcOffset() : 0;
          return (this.utcOffset() - input2) % 60 === 0;
        }
        function isDaylightSavingTime() {
          return this.utcOffset() > this.clone().month(0).utcOffset() || this.utcOffset() > this.clone().month(5).utcOffset();
        }
        function isDaylightSavingTimeShifted() {
          if (!isUndefined2(this._isDSTShifted)) {
            return this._isDSTShifted;
          }
          var c = {}, other;
          copyConfig(c, this);
          c = prepareConfig(c);
          if (c._a) {
            other = c._isUTC ? createUTC(c._a) : createLocal(c._a);
            this._isDSTShifted = this.isValid() && compareArrays(c._a, other.toArray()) > 0;
          } else {
            this._isDSTShifted = false;
          }
          return this._isDSTShifted;
        }
        function isLocal() {
          return this.isValid() ? !this._isUTC : false;
        }
        function isUtcOffset() {
          return this.isValid() ? this._isUTC : false;
        }
        function isUtc() {
          return this.isValid() ? this._isUTC && this._offset === 0 : false;
        }
        var aspNetRegex = /^(-|\+)?(?:(\d*)[. ])?(\d+):(\d+)(?::(\d+)(\.\d*)?)?$/, isoRegex = /^(-|\+)?P(?:([-+]?[0-9,.]*)Y)?(?:([-+]?[0-9,.]*)M)?(?:([-+]?[0-9,.]*)W)?(?:([-+]?[0-9,.]*)D)?(?:T(?:([-+]?[0-9,.]*)H)?(?:([-+]?[0-9,.]*)M)?(?:([-+]?[0-9,.]*)S)?)?$/;
        function createDuration(input2, key) {
          var duration2 = input2, match = null, sign2, ret, diffRes;
          if (isDuration(input2)) {
            duration2 = {
              ms: input2._milliseconds,
              d: input2._days,
              M: input2._months
            };
          } else if (isNumber2(input2) || !isNaN(+input2)) {
            duration2 = {};
            if (key) {
              duration2[key] = +input2;
            } else {
              duration2.milliseconds = +input2;
            }
          } else if (match = aspNetRegex.exec(input2)) {
            sign2 = match[1] === "-" ? -1 : 1;
            duration2 = {
              y: 0,
              d: toInt(match[DATE]) * sign2,
              h: toInt(match[HOUR]) * sign2,
              m: toInt(match[MINUTE]) * sign2,
              s: toInt(match[SECOND]) * sign2,
              ms: toInt(absRound(match[MILLISECOND] * 1e3)) * sign2
            };
          } else if (match = isoRegex.exec(input2)) {
            sign2 = match[1] === "-" ? -1 : 1;
            duration2 = {
              y: parseIso(match[2], sign2),
              M: parseIso(match[3], sign2),
              w: parseIso(match[4], sign2),
              d: parseIso(match[5], sign2),
              h: parseIso(match[6], sign2),
              m: parseIso(match[7], sign2),
              s: parseIso(match[8], sign2)
            };
          } else if (duration2 == null) {
            duration2 = {};
          } else if (typeof duration2 === "object" && ("from" in duration2 || "to" in duration2)) {
            diffRes = momentsDifference(
              createLocal(duration2.from),
              createLocal(duration2.to)
            );
            duration2 = {};
            duration2.ms = diffRes.milliseconds;
            duration2.M = diffRes.months;
          }
          ret = new Duration(duration2);
          if (isDuration(input2) && hasOwnProp(input2, "_locale")) {
            ret._locale = input2._locale;
          }
          if (isDuration(input2) && hasOwnProp(input2, "_isValid")) {
            ret._isValid = input2._isValid;
          }
          return ret;
        }
        createDuration.fn = Duration.prototype;
        createDuration.invalid = createInvalid$1;
        function parseIso(inp, sign2) {
          var res = inp && parseFloat(inp.replace(",", "."));
          return (isNaN(res) ? 0 : res) * sign2;
        }
        function positiveMomentsDifference(base, other) {
          var res = {};
          res.months = other.month() - base.month() + (other.year() - base.year()) * 12;
          if (base.clone().add(res.months, "M").isAfter(other)) {
            --res.months;
          }
          res.milliseconds = +other - +base.clone().add(res.months, "M");
          return res;
        }
        function momentsDifference(base, other) {
          var res;
          if (!(base.isValid() && other.isValid())) {
            return { milliseconds: 0, months: 0 };
          }
          other = cloneWithOffset(other, base);
          if (base.isBefore(other)) {
            res = positiveMomentsDifference(base, other);
          } else {
            res = positiveMomentsDifference(other, base);
            res.milliseconds = -res.milliseconds;
            res.months = -res.months;
          }
          return res;
        }
        function createAdder(direction, name) {
          return function(val, period) {
            var dur, tmp;
            if (period !== null && !isNaN(+period)) {
              deprecateSimple(
                name,
                "moment()." + name + "(period, number) is deprecated. Please use moment()." + name + "(number, period). See http://momentjs.com/guides/#/warnings/add-inverted-param/ for more info."
              );
              tmp = val;
              val = period;
              period = tmp;
            }
            dur = createDuration(val, period);
            addSubtract(this, dur, direction);
            return this;
          };
        }
        function addSubtract(mom, duration2, isAdding, updateOffset) {
          var milliseconds2 = duration2._milliseconds, days2 = absRound(duration2._days), months2 = absRound(duration2._months);
          if (!mom.isValid()) {
            return;
          }
          updateOffset = updateOffset == null ? true : updateOffset;
          if (months2) {
            setMonth(mom, get(mom, "Month") + months2 * isAdding);
          }
          if (days2) {
            set$1(mom, "Date", get(mom, "Date") + days2 * isAdding);
          }
          if (milliseconds2) {
            mom._d.setTime(mom._d.valueOf() + milliseconds2 * isAdding);
          }
          if (updateOffset) {
            hooks.updateOffset(mom, days2 || months2);
          }
        }
        var add = createAdder(1, "add"), subtract = createAdder(-1, "subtract");
        function isString2(input2) {
          return typeof input2 === "string" || input2 instanceof String;
        }
        function isMomentInput(input2) {
          return isMoment(input2) || isDate2(input2) || isString2(input2) || isNumber2(input2) || isNumberOrStringArray(input2) || isMomentInputObject(input2) || input2 === null || input2 === void 0;
        }
        function isMomentInputObject(input2) {
          var objectTest = isObject3(input2) && !isObjectEmpty(input2), propertyTest = false, properties = [
            "years",
            "year",
            "y",
            "months",
            "month",
            "M",
            "days",
            "day",
            "d",
            "dates",
            "date",
            "D",
            "hours",
            "hour",
            "h",
            "minutes",
            "minute",
            "m",
            "seconds",
            "second",
            "s",
            "milliseconds",
            "millisecond",
            "ms"
          ], i2, property, propertyLen = properties.length;
          for (i2 = 0; i2 < propertyLen; i2 += 1) {
            property = properties[i2];
            propertyTest = propertyTest || hasOwnProp(input2, property);
          }
          return objectTest && propertyTest;
        }
        function isNumberOrStringArray(input2) {
          var arrayTest = isArray2(input2), dataTypeTest = false;
          if (arrayTest) {
            dataTypeTest = input2.filter(function(item) {
              return !isNumber2(item) && isString2(input2);
            }).length === 0;
          }
          return arrayTest && dataTypeTest;
        }
        function isCalendarSpec(input2) {
          var objectTest = isObject3(input2) && !isObjectEmpty(input2), propertyTest = false, properties = [
            "sameDay",
            "nextDay",
            "lastDay",
            "nextWeek",
            "lastWeek",
            "sameElse"
          ], i2, property;
          for (i2 = 0; i2 < properties.length; i2 += 1) {
            property = properties[i2];
            propertyTest = propertyTest || hasOwnProp(input2, property);
          }
          return objectTest && propertyTest;
        }
        function getCalendarFormat(myMoment, now2) {
          var diff2 = myMoment.diff(now2, "days", true);
          return diff2 < -6 ? "sameElse" : diff2 < -1 ? "lastWeek" : diff2 < 0 ? "lastDay" : diff2 < 1 ? "sameDay" : diff2 < 2 ? "nextDay" : diff2 < 7 ? "nextWeek" : "sameElse";
        }
        function calendar$1(time, formats) {
          if (arguments.length === 1) {
            if (!arguments[0]) {
              time = void 0;
              formats = void 0;
            } else if (isMomentInput(arguments[0])) {
              time = arguments[0];
              formats = void 0;
            } else if (isCalendarSpec(arguments[0])) {
              formats = arguments[0];
              time = void 0;
            }
          }
          var now2 = time || createLocal(), sod = cloneWithOffset(now2, this).startOf("day"), format2 = hooks.calendarFormat(this, sod) || "sameElse", output = formats && (isFunction2(formats[format2]) ? formats[format2].call(this, now2) : formats[format2]);
          return this.format(
            output || this.localeData().calendar(format2, this, createLocal(now2))
          );
        }
        function clone() {
          return new Moment(this);
        }
        function isAfter(input2, units) {
          var localInput = isMoment(input2) ? input2 : createLocal(input2);
          if (!(this.isValid() && localInput.isValid())) {
            return false;
          }
          units = normalizeUnits(units) || "millisecond";
          if (units === "millisecond") {
            return this.valueOf() > localInput.valueOf();
          } else {
            return localInput.valueOf() < this.clone().startOf(units).valueOf();
          }
        }
        function isBefore(input2, units) {
          var localInput = isMoment(input2) ? input2 : createLocal(input2);
          if (!(this.isValid() && localInput.isValid())) {
            return false;
          }
          units = normalizeUnits(units) || "millisecond";
          if (units === "millisecond") {
            return this.valueOf() < localInput.valueOf();
          } else {
            return this.clone().endOf(units).valueOf() < localInput.valueOf();
          }
        }
        function isBetween(from2, to2, units, inclusivity) {
          var localFrom = isMoment(from2) ? from2 : createLocal(from2), localTo = isMoment(to2) ? to2 : createLocal(to2);
          if (!(this.isValid() && localFrom.isValid() && localTo.isValid())) {
            return false;
          }
          inclusivity = inclusivity || "()";
          return (inclusivity[0] === "(" ? this.isAfter(localFrom, units) : !this.isBefore(localFrom, units)) && (inclusivity[1] === ")" ? this.isBefore(localTo, units) : !this.isAfter(localTo, units));
        }
        function isSame(input2, units) {
          var localInput = isMoment(input2) ? input2 : createLocal(input2), inputMs;
          if (!(this.isValid() && localInput.isValid())) {
            return false;
          }
          units = normalizeUnits(units) || "millisecond";
          if (units === "millisecond") {
            return this.valueOf() === localInput.valueOf();
          } else {
            inputMs = localInput.valueOf();
            return this.clone().startOf(units).valueOf() <= inputMs && inputMs <= this.clone().endOf(units).valueOf();
          }
        }
        function isSameOrAfter(input2, units) {
          return this.isSame(input2, units) || this.isAfter(input2, units);
        }
        function isSameOrBefore(input2, units) {
          return this.isSame(input2, units) || this.isBefore(input2, units);
        }
        function diff(input2, units, asFloat) {
          var that, zoneDelta, output;
          if (!this.isValid()) {
            return NaN;
          }
          that = cloneWithOffset(input2, this);
          if (!that.isValid()) {
            return NaN;
          }
          zoneDelta = (that.utcOffset() - this.utcOffset()) * 6e4;
          units = normalizeUnits(units);
          switch (units) {
            case "year":
              output = monthDiff(this, that) / 12;
              break;
            case "month":
              output = monthDiff(this, that);
              break;
            case "quarter":
              output = monthDiff(this, that) / 3;
              break;
            case "second":
              output = (this - that) / 1e3;
              break;
            case "minute":
              output = (this - that) / 6e4;
              break;
            case "hour":
              output = (this - that) / 36e5;
              break;
            case "day":
              output = (this - that - zoneDelta) / 864e5;
              break;
            case "week":
              output = (this - that - zoneDelta) / 6048e5;
              break;
            default:
              output = this - that;
          }
          return asFloat ? output : absFloor(output);
        }
        function monthDiff(a, b) {
          if (a.date() < b.date()) {
            return -monthDiff(b, a);
          }
          var wholeMonthDiff = (b.year() - a.year()) * 12 + (b.month() - a.month()), anchor = a.clone().add(wholeMonthDiff, "months"), anchor2, adjust;
          if (b - anchor < 0) {
            anchor2 = a.clone().add(wholeMonthDiff - 1, "months");
            adjust = (b - anchor) / (anchor - anchor2);
          } else {
            anchor2 = a.clone().add(wholeMonthDiff + 1, "months");
            adjust = (b - anchor) / (anchor2 - anchor);
          }
          return -(wholeMonthDiff + adjust) || 0;
        }
        hooks.defaultFormat = "YYYY-MM-DDTHH:mm:ssZ";
        hooks.defaultFormatUtc = "YYYY-MM-DDTHH:mm:ss[Z]";
        function toString4() {
          return this.clone().locale("en").format("ddd MMM DD YYYY HH:mm:ss [GMT]ZZ");
        }
        function toISOString(keepOffset) {
          if (!this.isValid()) {
            return null;
          }
          var utc = keepOffset !== true, m = utc ? this.clone().utc() : this;
          if (m.year() < 0 || m.year() > 9999) {
            return formatMoment(
              m,
              utc ? "YYYYYY-MM-DD[T]HH:mm:ss.SSS[Z]" : "YYYYYY-MM-DD[T]HH:mm:ss.SSSZ"
            );
          }
          if (isFunction2(Date.prototype.toISOString)) {
            if (utc) {
              return this.toDate().toISOString();
            } else {
              return new Date(this.valueOf() + this.utcOffset() * 60 * 1e3).toISOString().replace("Z", formatMoment(m, "Z"));
            }
          }
          return formatMoment(
            m,
            utc ? "YYYY-MM-DD[T]HH:mm:ss.SSS[Z]" : "YYYY-MM-DD[T]HH:mm:ss.SSSZ"
          );
        }
        function inspect() {
          if (!this.isValid()) {
            return "moment.invalid(/* " + this._i + " */)";
          }
          var func = "moment", zone = "", prefix, year, datetime, suffix;
          if (!this.isLocal()) {
            func = this.utcOffset() === 0 ? "moment.utc" : "moment.parseZone";
            zone = "Z";
          }
          prefix = "[" + func + '("]';
          year = 0 <= this.year() && this.year() <= 9999 ? "YYYY" : "YYYYYY";
          datetime = "-MM-DD[T]HH:mm:ss.SSS";
          suffix = zone + '[")]';
          return this.format(prefix + year + datetime + suffix);
        }
        function format(inputString) {
          if (!inputString) {
            inputString = this.isUtc() ? hooks.defaultFormatUtc : hooks.defaultFormat;
          }
          var output = formatMoment(this, inputString);
          return this.localeData().postformat(output);
        }
        function from(time, withoutSuffix) {
          if (this.isValid() && (isMoment(time) && time.isValid() || createLocal(time).isValid())) {
            return createDuration({ to: this, from: time }).locale(this.locale()).humanize(!withoutSuffix);
          } else {
            return this.localeData().invalidDate();
          }
        }
        function fromNow(withoutSuffix) {
          return this.from(createLocal(), withoutSuffix);
        }
        function to(time, withoutSuffix) {
          if (this.isValid() && (isMoment(time) && time.isValid() || createLocal(time).isValid())) {
            return createDuration({ from: this, to: time }).locale(this.locale()).humanize(!withoutSuffix);
          } else {
            return this.localeData().invalidDate();
          }
        }
        function toNow(withoutSuffix) {
          return this.to(createLocal(), withoutSuffix);
        }
        function locale(key) {
          var newLocaleData;
          if (key === void 0) {
            return this._locale._abbr;
          } else {
            newLocaleData = getLocale(key);
            if (newLocaleData != null) {
              this._locale = newLocaleData;
            }
            return this;
          }
        }
        var lang = deprecate(
          "moment().lang() is deprecated. Instead, use moment().localeData() to get the language configuration. Use moment().locale() to change languages.",
          function(key) {
            if (key === void 0) {
              return this.localeData();
            } else {
              return this.locale(key);
            }
          }
        );
        function localeData() {
          return this._locale;
        }
        var MS_PER_SECOND = 1e3, MS_PER_MINUTE = 60 * MS_PER_SECOND, MS_PER_HOUR = 60 * MS_PER_MINUTE, MS_PER_400_YEARS = (365 * 400 + 97) * 24 * MS_PER_HOUR;
        function mod$1(dividend, divisor) {
          return (dividend % divisor + divisor) % divisor;
        }
        function localStartOfDate(y, m, d) {
          if (y < 100 && y >= 0) {
            return new Date(y + 400, m, d) - MS_PER_400_YEARS;
          } else {
            return new Date(y, m, d).valueOf();
          }
        }
        function utcStartOfDate(y, m, d) {
          if (y < 100 && y >= 0) {
            return Date.UTC(y + 400, m, d) - MS_PER_400_YEARS;
          } else {
            return Date.UTC(y, m, d);
          }
        }
        function startOf(units) {
          var time, startOfDate;
          units = normalizeUnits(units);
          if (units === void 0 || units === "millisecond" || !this.isValid()) {
            return this;
          }
          startOfDate = this._isUTC ? utcStartOfDate : localStartOfDate;
          switch (units) {
            case "year":
              time = startOfDate(this.year(), 0, 1);
              break;
            case "quarter":
              time = startOfDate(
                this.year(),
                this.month() - this.month() % 3,
                1
              );
              break;
            case "month":
              time = startOfDate(this.year(), this.month(), 1);
              break;
            case "week":
              time = startOfDate(
                this.year(),
                this.month(),
                this.date() - this.weekday()
              );
              break;
            case "isoWeek":
              time = startOfDate(
                this.year(),
                this.month(),
                this.date() - (this.isoWeekday() - 1)
              );
              break;
            case "day":
            case "date":
              time = startOfDate(this.year(), this.month(), this.date());
              break;
            case "hour":
              time = this._d.valueOf();
              time -= mod$1(
                time + (this._isUTC ? 0 : this.utcOffset() * MS_PER_MINUTE),
                MS_PER_HOUR
              );
              break;
            case "minute":
              time = this._d.valueOf();
              time -= mod$1(time, MS_PER_MINUTE);
              break;
            case "second":
              time = this._d.valueOf();
              time -= mod$1(time, MS_PER_SECOND);
              break;
          }
          this._d.setTime(time);
          hooks.updateOffset(this, true);
          return this;
        }
        function endOf(units) {
          var time, startOfDate;
          units = normalizeUnits(units);
          if (units === void 0 || units === "millisecond" || !this.isValid()) {
            return this;
          }
          startOfDate = this._isUTC ? utcStartOfDate : localStartOfDate;
          switch (units) {
            case "year":
              time = startOfDate(this.year() + 1, 0, 1) - 1;
              break;
            case "quarter":
              time = startOfDate(
                this.year(),
                this.month() - this.month() % 3 + 3,
                1
              ) - 1;
              break;
            case "month":
              time = startOfDate(this.year(), this.month() + 1, 1) - 1;
              break;
            case "week":
              time = startOfDate(
                this.year(),
                this.month(),
                this.date() - this.weekday() + 7
              ) - 1;
              break;
            case "isoWeek":
              time = startOfDate(
                this.year(),
                this.month(),
                this.date() - (this.isoWeekday() - 1) + 7
              ) - 1;
              break;
            case "day":
            case "date":
              time = startOfDate(this.year(), this.month(), this.date() + 1) - 1;
              break;
            case "hour":
              time = this._d.valueOf();
              time += MS_PER_HOUR - mod$1(
                time + (this._isUTC ? 0 : this.utcOffset() * MS_PER_MINUTE),
                MS_PER_HOUR
              ) - 1;
              break;
            case "minute":
              time = this._d.valueOf();
              time += MS_PER_MINUTE - mod$1(time, MS_PER_MINUTE) - 1;
              break;
            case "second":
              time = this._d.valueOf();
              time += MS_PER_SECOND - mod$1(time, MS_PER_SECOND) - 1;
              break;
          }
          this._d.setTime(time);
          hooks.updateOffset(this, true);
          return this;
        }
        function valueOf() {
          return this._d.valueOf() - (this._offset || 0) * 6e4;
        }
        function unix() {
          return Math.floor(this.valueOf() / 1e3);
        }
        function toDate() {
          return new Date(this.valueOf());
        }
        function toArray3() {
          var m = this;
          return [
            m.year(),
            m.month(),
            m.date(),
            m.hour(),
            m.minute(),
            m.second(),
            m.millisecond()
          ];
        }
        function toObject() {
          var m = this;
          return {
            years: m.year(),
            months: m.month(),
            date: m.date(),
            hours: m.hours(),
            minutes: m.minutes(),
            seconds: m.seconds(),
            milliseconds: m.milliseconds()
          };
        }
        function toJSON2() {
          return this.isValid() ? this.toISOString() : null;
        }
        function isValid$2() {
          return isValid(this);
        }
        function parsingFlags() {
          return extend2({}, getParsingFlags(this));
        }
        function invalidAt() {
          return getParsingFlags(this).overflow;
        }
        function creationData() {
          return {
            input: this._i,
            format: this._f,
            locale: this._locale,
            isUTC: this._isUTC,
            strict: this._strict
          };
        }
        addFormatToken("N", 0, 0, "eraAbbr");
        addFormatToken("NN", 0, 0, "eraAbbr");
        addFormatToken("NNN", 0, 0, "eraAbbr");
        addFormatToken("NNNN", 0, 0, "eraName");
        addFormatToken("NNNNN", 0, 0, "eraNarrow");
        addFormatToken("y", ["y", 1], "yo", "eraYear");
        addFormatToken("y", ["yy", 2], 0, "eraYear");
        addFormatToken("y", ["yyy", 3], 0, "eraYear");
        addFormatToken("y", ["yyyy", 4], 0, "eraYear");
        addRegexToken("N", matchEraAbbr);
        addRegexToken("NN", matchEraAbbr);
        addRegexToken("NNN", matchEraAbbr);
        addRegexToken("NNNN", matchEraName);
        addRegexToken("NNNNN", matchEraNarrow);
        addParseToken(
          ["N", "NN", "NNN", "NNNN", "NNNNN"],
          function(input2, array, config, token3) {
            var era = config._locale.erasParse(input2, token3, config._strict);
            if (era) {
              getParsingFlags(config).era = era;
            } else {
              getParsingFlags(config).invalidEra = input2;
            }
          }
        );
        addRegexToken("y", matchUnsigned);
        addRegexToken("yy", matchUnsigned);
        addRegexToken("yyy", matchUnsigned);
        addRegexToken("yyyy", matchUnsigned);
        addRegexToken("yo", matchEraYearOrdinal);
        addParseToken(["y", "yy", "yyy", "yyyy"], YEAR);
        addParseToken(["yo"], function(input2, array, config, token3) {
          var match;
          if (config._locale._eraYearOrdinalRegex) {
            match = input2.match(config._locale._eraYearOrdinalRegex);
          }
          if (config._locale.eraYearOrdinalParse) {
            array[YEAR] = config._locale.eraYearOrdinalParse(input2, match);
          } else {
            array[YEAR] = parseInt(input2, 10);
          }
        });
        function localeEras(m, format2) {
          var i2, l, date, eras = this._eras || getLocale("en")._eras;
          for (i2 = 0, l = eras.length; i2 < l; ++i2) {
            switch (typeof eras[i2].since) {
              case "string":
                date = hooks(eras[i2].since).startOf("day");
                eras[i2].since = date.valueOf();
                break;
            }
            switch (typeof eras[i2].until) {
              case "undefined":
                eras[i2].until = Infinity;
                break;
              case "string":
                date = hooks(eras[i2].until).startOf("day").valueOf();
                eras[i2].until = date.valueOf();
                break;
            }
          }
          return eras;
        }
        function localeErasParse(eraName, format2, strict) {
          var i2, l, eras = this.eras(), name, abbr, narrow;
          eraName = eraName.toUpperCase();
          for (i2 = 0, l = eras.length; i2 < l; ++i2) {
            name = eras[i2].name.toUpperCase();
            abbr = eras[i2].abbr.toUpperCase();
            narrow = eras[i2].narrow.toUpperCase();
            if (strict) {
              switch (format2) {
                case "N":
                case "NN":
                case "NNN":
                  if (abbr === eraName) {
                    return eras[i2];
                  }
                  break;
                case "NNNN":
                  if (name === eraName) {
                    return eras[i2];
                  }
                  break;
                case "NNNNN":
                  if (narrow === eraName) {
                    return eras[i2];
                  }
                  break;
              }
            } else if ([name, abbr, narrow].indexOf(eraName) >= 0) {
              return eras[i2];
            }
          }
        }
        function localeErasConvertYear(era, year) {
          var dir = era.since <= era.until ? 1 : -1;
          if (year === void 0) {
            return hooks(era.since).year();
          } else {
            return hooks(era.since).year() + (year - era.offset) * dir;
          }
        }
        function getEraName() {
          var i2, l, val, eras = this.localeData().eras();
          for (i2 = 0, l = eras.length; i2 < l; ++i2) {
            val = this.clone().startOf("day").valueOf();
            if (eras[i2].since <= val && val <= eras[i2].until) {
              return eras[i2].name;
            }
            if (eras[i2].until <= val && val <= eras[i2].since) {
              return eras[i2].name;
            }
          }
          return "";
        }
        function getEraNarrow() {
          var i2, l, val, eras = this.localeData().eras();
          for (i2 = 0, l = eras.length; i2 < l; ++i2) {
            val = this.clone().startOf("day").valueOf();
            if (eras[i2].since <= val && val <= eras[i2].until) {
              return eras[i2].narrow;
            }
            if (eras[i2].until <= val && val <= eras[i2].since) {
              return eras[i2].narrow;
            }
          }
          return "";
        }
        function getEraAbbr() {
          var i2, l, val, eras = this.localeData().eras();
          for (i2 = 0, l = eras.length; i2 < l; ++i2) {
            val = this.clone().startOf("day").valueOf();
            if (eras[i2].since <= val && val <= eras[i2].until) {
              return eras[i2].abbr;
            }
            if (eras[i2].until <= val && val <= eras[i2].since) {
              return eras[i2].abbr;
            }
          }
          return "";
        }
        function getEraYear() {
          var i2, l, dir, val, eras = this.localeData().eras();
          for (i2 = 0, l = eras.length; i2 < l; ++i2) {
            dir = eras[i2].since <= eras[i2].until ? 1 : -1;
            val = this.clone().startOf("day").valueOf();
            if (eras[i2].since <= val && val <= eras[i2].until || eras[i2].until <= val && val <= eras[i2].since) {
              return (this.year() - hooks(eras[i2].since).year()) * dir + eras[i2].offset;
            }
          }
          return this.year();
        }
        function erasNameRegex(isStrict) {
          if (!hasOwnProp(this, "_erasNameRegex")) {
            computeErasParse.call(this);
          }
          return isStrict ? this._erasNameRegex : this._erasRegex;
        }
        function erasAbbrRegex(isStrict) {
          if (!hasOwnProp(this, "_erasAbbrRegex")) {
            computeErasParse.call(this);
          }
          return isStrict ? this._erasAbbrRegex : this._erasRegex;
        }
        function erasNarrowRegex(isStrict) {
          if (!hasOwnProp(this, "_erasNarrowRegex")) {
            computeErasParse.call(this);
          }
          return isStrict ? this._erasNarrowRegex : this._erasRegex;
        }
        function matchEraAbbr(isStrict, locale2) {
          return locale2.erasAbbrRegex(isStrict);
        }
        function matchEraName(isStrict, locale2) {
          return locale2.erasNameRegex(isStrict);
        }
        function matchEraNarrow(isStrict, locale2) {
          return locale2.erasNarrowRegex(isStrict);
        }
        function matchEraYearOrdinal(isStrict, locale2) {
          return locale2._eraYearOrdinalRegex || matchUnsigned;
        }
        function computeErasParse() {
          var abbrPieces = [], namePieces = [], narrowPieces = [], mixedPieces = [], i2, l, eras = this.eras();
          for (i2 = 0, l = eras.length; i2 < l; ++i2) {
            namePieces.push(regexEscape(eras[i2].name));
            abbrPieces.push(regexEscape(eras[i2].abbr));
            narrowPieces.push(regexEscape(eras[i2].narrow));
            mixedPieces.push(regexEscape(eras[i2].name));
            mixedPieces.push(regexEscape(eras[i2].abbr));
            mixedPieces.push(regexEscape(eras[i2].narrow));
          }
          this._erasRegex = new RegExp("^(" + mixedPieces.join("|") + ")", "i");
          this._erasNameRegex = new RegExp("^(" + namePieces.join("|") + ")", "i");
          this._erasAbbrRegex = new RegExp("^(" + abbrPieces.join("|") + ")", "i");
          this._erasNarrowRegex = new RegExp(
            "^(" + narrowPieces.join("|") + ")",
            "i"
          );
        }
        addFormatToken(0, ["gg", 2], 0, function() {
          return this.weekYear() % 100;
        });
        addFormatToken(0, ["GG", 2], 0, function() {
          return this.isoWeekYear() % 100;
        });
        function addWeekYearFormatToken(token3, getter) {
          addFormatToken(0, [token3, token3.length], 0, getter);
        }
        addWeekYearFormatToken("gggg", "weekYear");
        addWeekYearFormatToken("ggggg", "weekYear");
        addWeekYearFormatToken("GGGG", "isoWeekYear");
        addWeekYearFormatToken("GGGGG", "isoWeekYear");
        addUnitAlias("weekYear", "gg");
        addUnitAlias("isoWeekYear", "GG");
        addUnitPriority("weekYear", 1);
        addUnitPriority("isoWeekYear", 1);
        addRegexToken("G", matchSigned);
        addRegexToken("g", matchSigned);
        addRegexToken("GG", match1to2, match2);
        addRegexToken("gg", match1to2, match2);
        addRegexToken("GGGG", match1to4, match4);
        addRegexToken("gggg", match1to4, match4);
        addRegexToken("GGGGG", match1to6, match6);
        addRegexToken("ggggg", match1to6, match6);
        addWeekParseToken(
          ["gggg", "ggggg", "GGGG", "GGGGG"],
          function(input2, week, config, token3) {
            week[token3.substr(0, 2)] = toInt(input2);
          }
        );
        addWeekParseToken(["gg", "GG"], function(input2, week, config, token3) {
          week[token3] = hooks.parseTwoDigitYear(input2);
        });
        function getSetWeekYear(input2) {
          return getSetWeekYearHelper.call(
            this,
            input2,
            this.week(),
            this.weekday(),
            this.localeData()._week.dow,
            this.localeData()._week.doy
          );
        }
        function getSetISOWeekYear(input2) {
          return getSetWeekYearHelper.call(
            this,
            input2,
            this.isoWeek(),
            this.isoWeekday(),
            1,
            4
          );
        }
        function getISOWeeksInYear() {
          return weeksInYear(this.year(), 1, 4);
        }
        function getISOWeeksInISOWeekYear() {
          return weeksInYear(this.isoWeekYear(), 1, 4);
        }
        function getWeeksInYear() {
          var weekInfo = this.localeData()._week;
          return weeksInYear(this.year(), weekInfo.dow, weekInfo.doy);
        }
        function getWeeksInWeekYear() {
          var weekInfo = this.localeData()._week;
          return weeksInYear(this.weekYear(), weekInfo.dow, weekInfo.doy);
        }
        function getSetWeekYearHelper(input2, week, weekday, dow, doy) {
          var weeksTarget;
          if (input2 == null) {
            return weekOfYear(this, dow, doy).year;
          } else {
            weeksTarget = weeksInYear(input2, dow, doy);
            if (week > weeksTarget) {
              week = weeksTarget;
            }
            return setWeekAll.call(this, input2, week, weekday, dow, doy);
          }
        }
        function setWeekAll(weekYear, week, weekday, dow, doy) {
          var dayOfYearData = dayOfYearFromWeeks(weekYear, week, weekday, dow, doy), date = createUTCDate(dayOfYearData.year, 0, dayOfYearData.dayOfYear);
          this.year(date.getUTCFullYear());
          this.month(date.getUTCMonth());
          this.date(date.getUTCDate());
          return this;
        }
        addFormatToken("Q", 0, "Qo", "quarter");
        addUnitAlias("quarter", "Q");
        addUnitPriority("quarter", 7);
        addRegexToken("Q", match1);
        addParseToken("Q", function(input2, array) {
          array[MONTH] = (toInt(input2) - 1) * 3;
        });
        function getSetQuarter(input2) {
          return input2 == null ? Math.ceil((this.month() + 1) / 3) : this.month((input2 - 1) * 3 + this.month() % 3);
        }
        addFormatToken("D", ["DD", 2], "Do", "date");
        addUnitAlias("date", "D");
        addUnitPriority("date", 9);
        addRegexToken("D", match1to2);
        addRegexToken("DD", match1to2, match2);
        addRegexToken("Do", function(isStrict, locale2) {
          return isStrict ? locale2._dayOfMonthOrdinalParse || locale2._ordinalParse : locale2._dayOfMonthOrdinalParseLenient;
        });
        addParseToken(["D", "DD"], DATE);
        addParseToken("Do", function(input2, array) {
          array[DATE] = toInt(input2.match(match1to2)[0]);
        });
        var getSetDayOfMonth = makeGetSet("Date", true);
        addFormatToken("DDD", ["DDDD", 3], "DDDo", "dayOfYear");
        addUnitAlias("dayOfYear", "DDD");
        addUnitPriority("dayOfYear", 4);
        addRegexToken("DDD", match1to3);
        addRegexToken("DDDD", match3);
        addParseToken(["DDD", "DDDD"], function(input2, array, config) {
          config._dayOfYear = toInt(input2);
        });
        function getSetDayOfYear(input2) {
          var dayOfYear = Math.round(
            (this.clone().startOf("day") - this.clone().startOf("year")) / 864e5
          ) + 1;
          return input2 == null ? dayOfYear : this.add(input2 - dayOfYear, "d");
        }
        addFormatToken("m", ["mm", 2], 0, "minute");
        addUnitAlias("minute", "m");
        addUnitPriority("minute", 14);
        addRegexToken("m", match1to2);
        addRegexToken("mm", match1to2, match2);
        addParseToken(["m", "mm"], MINUTE);
        var getSetMinute = makeGetSet("Minutes", false);
        addFormatToken("s", ["ss", 2], 0, "second");
        addUnitAlias("second", "s");
        addUnitPriority("second", 15);
        addRegexToken("s", match1to2);
        addRegexToken("ss", match1to2, match2);
        addParseToken(["s", "ss"], SECOND);
        var getSetSecond = makeGetSet("Seconds", false);
        addFormatToken("S", 0, 0, function() {
          return ~~(this.millisecond() / 100);
        });
        addFormatToken(0, ["SS", 2], 0, function() {
          return ~~(this.millisecond() / 10);
        });
        addFormatToken(0, ["SSS", 3], 0, "millisecond");
        addFormatToken(0, ["SSSS", 4], 0, function() {
          return this.millisecond() * 10;
        });
        addFormatToken(0, ["SSSSS", 5], 0, function() {
          return this.millisecond() * 100;
        });
        addFormatToken(0, ["SSSSSS", 6], 0, function() {
          return this.millisecond() * 1e3;
        });
        addFormatToken(0, ["SSSSSSS", 7], 0, function() {
          return this.millisecond() * 1e4;
        });
        addFormatToken(0, ["SSSSSSSS", 8], 0, function() {
          return this.millisecond() * 1e5;
        });
        addFormatToken(0, ["SSSSSSSSS", 9], 0, function() {
          return this.millisecond() * 1e6;
        });
        addUnitAlias("millisecond", "ms");
        addUnitPriority("millisecond", 16);
        addRegexToken("S", match1to3, match1);
        addRegexToken("SS", match1to3, match2);
        addRegexToken("SSS", match1to3, match3);
        var token2, getSetMillisecond;
        for (token2 = "SSSS"; token2.length <= 9; token2 += "S") {
          addRegexToken(token2, matchUnsigned);
        }
        function parseMs(input2, array) {
          array[MILLISECOND] = toInt(("0." + input2) * 1e3);
        }
        for (token2 = "S"; token2.length <= 9; token2 += "S") {
          addParseToken(token2, parseMs);
        }
        getSetMillisecond = makeGetSet("Milliseconds", false);
        addFormatToken("z", 0, 0, "zoneAbbr");
        addFormatToken("zz", 0, 0, "zoneName");
        function getZoneAbbr() {
          return this._isUTC ? "UTC" : "";
        }
        function getZoneName() {
          return this._isUTC ? "Coordinated Universal Time" : "";
        }
        var proto = Moment.prototype;
        proto.add = add;
        proto.calendar = calendar$1;
        proto.clone = clone;
        proto.diff = diff;
        proto.endOf = endOf;
        proto.format = format;
        proto.from = from;
        proto.fromNow = fromNow;
        proto.to = to;
        proto.toNow = toNow;
        proto.get = stringGet;
        proto.invalidAt = invalidAt;
        proto.isAfter = isAfter;
        proto.isBefore = isBefore;
        proto.isBetween = isBetween;
        proto.isSame = isSame;
        proto.isSameOrAfter = isSameOrAfter;
        proto.isSameOrBefore = isSameOrBefore;
        proto.isValid = isValid$2;
        proto.lang = lang;
        proto.locale = locale;
        proto.localeData = localeData;
        proto.max = prototypeMax;
        proto.min = prototypeMin;
        proto.parsingFlags = parsingFlags;
        proto.set = stringSet;
        proto.startOf = startOf;
        proto.subtract = subtract;
        proto.toArray = toArray3;
        proto.toObject = toObject;
        proto.toDate = toDate;
        proto.toISOString = toISOString;
        proto.inspect = inspect;
        if (typeof Symbol !== "undefined" && Symbol.for != null) {
          proto[Symbol.for("nodejs.util.inspect.custom")] = function() {
            return "Moment<" + this.format() + ">";
          };
        }
        proto.toJSON = toJSON2;
        proto.toString = toString4;
        proto.unix = unix;
        proto.valueOf = valueOf;
        proto.creationData = creationData;
        proto.eraName = getEraName;
        proto.eraNarrow = getEraNarrow;
        proto.eraAbbr = getEraAbbr;
        proto.eraYear = getEraYear;
        proto.year = getSetYear;
        proto.isLeapYear = getIsLeapYear;
        proto.weekYear = getSetWeekYear;
        proto.isoWeekYear = getSetISOWeekYear;
        proto.quarter = proto.quarters = getSetQuarter;
        proto.month = getSetMonth;
        proto.daysInMonth = getDaysInMonth;
        proto.week = proto.weeks = getSetWeek;
        proto.isoWeek = proto.isoWeeks = getSetISOWeek;
        proto.weeksInYear = getWeeksInYear;
        proto.weeksInWeekYear = getWeeksInWeekYear;
        proto.isoWeeksInYear = getISOWeeksInYear;
        proto.isoWeeksInISOWeekYear = getISOWeeksInISOWeekYear;
        proto.date = getSetDayOfMonth;
        proto.day = proto.days = getSetDayOfWeek;
        proto.weekday = getSetLocaleDayOfWeek;
        proto.isoWeekday = getSetISODayOfWeek;
        proto.dayOfYear = getSetDayOfYear;
        proto.hour = proto.hours = getSetHour;
        proto.minute = proto.minutes = getSetMinute;
        proto.second = proto.seconds = getSetSecond;
        proto.millisecond = proto.milliseconds = getSetMillisecond;
        proto.utcOffset = getSetOffset;
        proto.utc = setOffsetToUTC;
        proto.local = setOffsetToLocal;
        proto.parseZone = setOffsetToParsedOffset;
        proto.hasAlignedHourOffset = hasAlignedHourOffset;
        proto.isDST = isDaylightSavingTime;
        proto.isLocal = isLocal;
        proto.isUtcOffset = isUtcOffset;
        proto.isUtc = isUtc;
        proto.isUTC = isUtc;
        proto.zoneAbbr = getZoneAbbr;
        proto.zoneName = getZoneName;
        proto.dates = deprecate(
          "dates accessor is deprecated. Use date instead.",
          getSetDayOfMonth
        );
        proto.months = deprecate(
          "months accessor is deprecated. Use month instead",
          getSetMonth
        );
        proto.years = deprecate(
          "years accessor is deprecated. Use year instead",
          getSetYear
        );
        proto.zone = deprecate(
          "moment().zone is deprecated, use moment().utcOffset instead. http://momentjs.com/guides/#/warnings/zone/",
          getSetZone
        );
        proto.isDSTShifted = deprecate(
          "isDSTShifted is deprecated. See http://momentjs.com/guides/#/warnings/dst-shifted/ for more information",
          isDaylightSavingTimeShifted
        );
        function createUnix(input2) {
          return createLocal(input2 * 1e3);
        }
        function createInZone() {
          return createLocal.apply(null, arguments).parseZone();
        }
        function preParsePostFormat(string) {
          return string;
        }
        var proto$1 = Locale.prototype;
        proto$1.calendar = calendar;
        proto$1.longDateFormat = longDateFormat;
        proto$1.invalidDate = invalidDate;
        proto$1.ordinal = ordinal;
        proto$1.preparse = preParsePostFormat;
        proto$1.postformat = preParsePostFormat;
        proto$1.relativeTime = relativeTime;
        proto$1.pastFuture = pastFuture;
        proto$1.set = set;
        proto$1.eras = localeEras;
        proto$1.erasParse = localeErasParse;
        proto$1.erasConvertYear = localeErasConvertYear;
        proto$1.erasAbbrRegex = erasAbbrRegex;
        proto$1.erasNameRegex = erasNameRegex;
        proto$1.erasNarrowRegex = erasNarrowRegex;
        proto$1.months = localeMonths;
        proto$1.monthsShort = localeMonthsShort;
        proto$1.monthsParse = localeMonthsParse;
        proto$1.monthsRegex = monthsRegex;
        proto$1.monthsShortRegex = monthsShortRegex;
        proto$1.week = localeWeek;
        proto$1.firstDayOfYear = localeFirstDayOfYear;
        proto$1.firstDayOfWeek = localeFirstDayOfWeek;
        proto$1.weekdays = localeWeekdays;
        proto$1.weekdaysMin = localeWeekdaysMin;
        proto$1.weekdaysShort = localeWeekdaysShort;
        proto$1.weekdaysParse = localeWeekdaysParse;
        proto$1.weekdaysRegex = weekdaysRegex;
        proto$1.weekdaysShortRegex = weekdaysShortRegex;
        proto$1.weekdaysMinRegex = weekdaysMinRegex;
        proto$1.isPM = localeIsPM;
        proto$1.meridiem = localeMeridiem;
        function get$1(format2, index, field, setter) {
          var locale2 = getLocale(), utc = createUTC().set(setter, index);
          return locale2[field](utc, format2);
        }
        function listMonthsImpl(format2, index, field) {
          if (isNumber2(format2)) {
            index = format2;
            format2 = void 0;
          }
          format2 = format2 || "";
          if (index != null) {
            return get$1(format2, index, field, "month");
          }
          var i2, out = [];
          for (i2 = 0; i2 < 12; i2++) {
            out[i2] = get$1(format2, i2, field, "month");
          }
          return out;
        }
        function listWeekdaysImpl(localeSorted, format2, index, field) {
          if (typeof localeSorted === "boolean") {
            if (isNumber2(format2)) {
              index = format2;
              format2 = void 0;
            }
            format2 = format2 || "";
          } else {
            format2 = localeSorted;
            index = format2;
            localeSorted = false;
            if (isNumber2(format2)) {
              index = format2;
              format2 = void 0;
            }
            format2 = format2 || "";
          }
          var locale2 = getLocale(), shift = localeSorted ? locale2._week.dow : 0, i2, out = [];
          if (index != null) {
            return get$1(format2, (index + shift) % 7, field, "day");
          }
          for (i2 = 0; i2 < 7; i2++) {
            out[i2] = get$1(format2, (i2 + shift) % 7, field, "day");
          }
          return out;
        }
        function listMonths(format2, index) {
          return listMonthsImpl(format2, index, "months");
        }
        function listMonthsShort(format2, index) {
          return listMonthsImpl(format2, index, "monthsShort");
        }
        function listWeekdays(localeSorted, format2, index) {
          return listWeekdaysImpl(localeSorted, format2, index, "weekdays");
        }
        function listWeekdaysShort(localeSorted, format2, index) {
          return listWeekdaysImpl(localeSorted, format2, index, "weekdaysShort");
        }
        function listWeekdaysMin(localeSorted, format2, index) {
          return listWeekdaysImpl(localeSorted, format2, index, "weekdaysMin");
        }
        getSetGlobalLocale("en", {
          eras: [
            {
              since: "0001-01-01",
              until: Infinity,
              offset: 1,
              name: "Anno Domini",
              narrow: "AD",
              abbr: "AD"
            },
            {
              since: "0000-12-31",
              until: -Infinity,
              offset: 1,
              name: "Before Christ",
              narrow: "BC",
              abbr: "BC"
            }
          ],
          dayOfMonthOrdinalParse: /\d{1,2}(th|st|nd|rd)/,
          ordinal: function(number) {
            var b = number % 10, output = toInt(number % 100 / 10) === 1 ? "th" : b === 1 ? "st" : b === 2 ? "nd" : b === 3 ? "rd" : "th";
            return number + output;
          }
        });
        hooks.lang = deprecate(
          "moment.lang is deprecated. Use moment.locale instead.",
          getSetGlobalLocale
        );
        hooks.langData = deprecate(
          "moment.langData is deprecated. Use moment.localeData instead.",
          getLocale
        );
        var mathAbs = Math.abs;
        function abs() {
          var data = this._data;
          this._milliseconds = mathAbs(this._milliseconds);
          this._days = mathAbs(this._days);
          this._months = mathAbs(this._months);
          data.milliseconds = mathAbs(data.milliseconds);
          data.seconds = mathAbs(data.seconds);
          data.minutes = mathAbs(data.minutes);
          data.hours = mathAbs(data.hours);
          data.months = mathAbs(data.months);
          data.years = mathAbs(data.years);
          return this;
        }
        function addSubtract$1(duration2, input2, value2, direction) {
          var other = createDuration(input2, value2);
          duration2._milliseconds += direction * other._milliseconds;
          duration2._days += direction * other._days;
          duration2._months += direction * other._months;
          return duration2._bubble();
        }
        function add$1(input2, value2) {
          return addSubtract$1(this, input2, value2, 1);
        }
        function subtract$1(input2, value2) {
          return addSubtract$1(this, input2, value2, -1);
        }
        function absCeil(number) {
          if (number < 0) {
            return Math.floor(number);
          } else {
            return Math.ceil(number);
          }
        }
        function bubble() {
          var milliseconds2 = this._milliseconds, days2 = this._days, months2 = this._months, data = this._data, seconds2, minutes2, hours2, years2, monthsFromDays;
          if (!(milliseconds2 >= 0 && days2 >= 0 && months2 >= 0 || milliseconds2 <= 0 && days2 <= 0 && months2 <= 0)) {
            milliseconds2 += absCeil(monthsToDays(months2) + days2) * 864e5;
            days2 = 0;
            months2 = 0;
          }
          data.milliseconds = milliseconds2 % 1e3;
          seconds2 = absFloor(milliseconds2 / 1e3);
          data.seconds = seconds2 % 60;
          minutes2 = absFloor(seconds2 / 60);
          data.minutes = minutes2 % 60;
          hours2 = absFloor(minutes2 / 60);
          data.hours = hours2 % 24;
          days2 += absFloor(hours2 / 24);
          monthsFromDays = absFloor(daysToMonths(days2));
          months2 += monthsFromDays;
          days2 -= absCeil(monthsToDays(monthsFromDays));
          years2 = absFloor(months2 / 12);
          months2 %= 12;
          data.days = days2;
          data.months = months2;
          data.years = years2;
          return this;
        }
        function daysToMonths(days2) {
          return days2 * 4800 / 146097;
        }
        function monthsToDays(months2) {
          return months2 * 146097 / 4800;
        }
        function as(units) {
          if (!this.isValid()) {
            return NaN;
          }
          var days2, months2, milliseconds2 = this._milliseconds;
          units = normalizeUnits(units);
          if (units === "month" || units === "quarter" || units === "year") {
            days2 = this._days + milliseconds2 / 864e5;
            months2 = this._months + daysToMonths(days2);
            switch (units) {
              case "month":
                return months2;
              case "quarter":
                return months2 / 3;
              case "year":
                return months2 / 12;
            }
          } else {
            days2 = this._days + Math.round(monthsToDays(this._months));
            switch (units) {
              case "week":
                return days2 / 7 + milliseconds2 / 6048e5;
              case "day":
                return days2 + milliseconds2 / 864e5;
              case "hour":
                return days2 * 24 + milliseconds2 / 36e5;
              case "minute":
                return days2 * 1440 + milliseconds2 / 6e4;
              case "second":
                return days2 * 86400 + milliseconds2 / 1e3;
              case "millisecond":
                return Math.floor(days2 * 864e5) + milliseconds2;
              default:
                throw new Error("Unknown unit " + units);
            }
          }
        }
        function valueOf$1() {
          if (!this.isValid()) {
            return NaN;
          }
          return this._milliseconds + this._days * 864e5 + this._months % 12 * 2592e6 + toInt(this._months / 12) * 31536e6;
        }
        function makeAs(alias) {
          return function() {
            return this.as(alias);
          };
        }
        var asMilliseconds = makeAs("ms"), asSeconds = makeAs("s"), asMinutes = makeAs("m"), asHours = makeAs("h"), asDays = makeAs("d"), asWeeks = makeAs("w"), asMonths = makeAs("M"), asQuarters = makeAs("Q"), asYears = makeAs("y");
        function clone$1() {
          return createDuration(this);
        }
        function get$2(units) {
          units = normalizeUnits(units);
          return this.isValid() ? this[units + "s"]() : NaN;
        }
        function makeGetter(name) {
          return function() {
            return this.isValid() ? this._data[name] : NaN;
          };
        }
        var milliseconds = makeGetter("milliseconds"), seconds = makeGetter("seconds"), minutes = makeGetter("minutes"), hours = makeGetter("hours"), days = makeGetter("days"), months = makeGetter("months"), years = makeGetter("years");
        function weeks() {
          return absFloor(this.days() / 7);
        }
        var round = Math.round, thresholds = {
          ss: 44,
          s: 45,
          m: 45,
          h: 22,
          d: 26,
          w: null,
          M: 11
        };
        function substituteTimeAgo(string, number, withoutSuffix, isFuture, locale2) {
          return locale2.relativeTime(number || 1, !!withoutSuffix, string, isFuture);
        }
        function relativeTime$1(posNegDuration, withoutSuffix, thresholds2, locale2) {
          var duration2 = createDuration(posNegDuration).abs(), seconds2 = round(duration2.as("s")), minutes2 = round(duration2.as("m")), hours2 = round(duration2.as("h")), days2 = round(duration2.as("d")), months2 = round(duration2.as("M")), weeks2 = round(duration2.as("w")), years2 = round(duration2.as("y")), a = seconds2 <= thresholds2.ss && ["s", seconds2] || seconds2 < thresholds2.s && ["ss", seconds2] || minutes2 <= 1 && ["m"] || minutes2 < thresholds2.m && ["mm", minutes2] || hours2 <= 1 && ["h"] || hours2 < thresholds2.h && ["hh", hours2] || days2 <= 1 && ["d"] || days2 < thresholds2.d && ["dd", days2];
          if (thresholds2.w != null) {
            a = a || weeks2 <= 1 && ["w"] || weeks2 < thresholds2.w && ["ww", weeks2];
          }
          a = a || months2 <= 1 && ["M"] || months2 < thresholds2.M && ["MM", months2] || years2 <= 1 && ["y"] || ["yy", years2];
          a[2] = withoutSuffix;
          a[3] = +posNegDuration > 0;
          a[4] = locale2;
          return substituteTimeAgo.apply(null, a);
        }
        function getSetRelativeTimeRounding(roundingFunction) {
          if (roundingFunction === void 0) {
            return round;
          }
          if (typeof roundingFunction === "function") {
            round = roundingFunction;
            return true;
          }
          return false;
        }
        function getSetRelativeTimeThreshold(threshold, limit) {
          if (thresholds[threshold] === void 0) {
            return false;
          }
          if (limit === void 0) {
            return thresholds[threshold];
          }
          thresholds[threshold] = limit;
          if (threshold === "s") {
            thresholds.ss = limit - 1;
          }
          return true;
        }
        function humanize(argWithSuffix, argThresholds) {
          if (!this.isValid()) {
            return this.localeData().invalidDate();
          }
          var withSuffix = false, th = thresholds, locale2, output;
          if (typeof argWithSuffix === "object") {
            argThresholds = argWithSuffix;
            argWithSuffix = false;
          }
          if (typeof argWithSuffix === "boolean") {
            withSuffix = argWithSuffix;
          }
          if (typeof argThresholds === "object") {
            th = Object.assign({}, thresholds, argThresholds);
            if (argThresholds.s != null && argThresholds.ss == null) {
              th.ss = argThresholds.s - 1;
            }
          }
          locale2 = this.localeData();
          output = relativeTime$1(this, !withSuffix, th, locale2);
          if (withSuffix) {
            output = locale2.pastFuture(+this, output);
          }
          return locale2.postformat(output);
        }
        var abs$1 = Math.abs;
        function sign(x) {
          return (x > 0) - (x < 0) || +x;
        }
        function toISOString$1() {
          if (!this.isValid()) {
            return this.localeData().invalidDate();
          }
          var seconds2 = abs$1(this._milliseconds) / 1e3, days2 = abs$1(this._days), months2 = abs$1(this._months), minutes2, hours2, years2, s, total = this.asSeconds(), totalSign, ymSign, daysSign, hmsSign;
          if (!total) {
            return "P0D";
          }
          minutes2 = absFloor(seconds2 / 60);
          hours2 = absFloor(minutes2 / 60);
          seconds2 %= 60;
          minutes2 %= 60;
          years2 = absFloor(months2 / 12);
          months2 %= 12;
          s = seconds2 ? seconds2.toFixed(3).replace(/\.?0+$/, "") : "";
          totalSign = total < 0 ? "-" : "";
          ymSign = sign(this._months) !== sign(total) ? "-" : "";
          daysSign = sign(this._days) !== sign(total) ? "-" : "";
          hmsSign = sign(this._milliseconds) !== sign(total) ? "-" : "";
          return totalSign + "P" + (years2 ? ymSign + years2 + "Y" : "") + (months2 ? ymSign + months2 + "M" : "") + (days2 ? daysSign + days2 + "D" : "") + (hours2 || minutes2 || seconds2 ? "T" : "") + (hours2 ? hmsSign + hours2 + "H" : "") + (minutes2 ? hmsSign + minutes2 + "M" : "") + (seconds2 ? hmsSign + s + "S" : "");
        }
        var proto$2 = Duration.prototype;
        proto$2.isValid = isValid$1;
        proto$2.abs = abs;
        proto$2.add = add$1;
        proto$2.subtract = subtract$1;
        proto$2.as = as;
        proto$2.asMilliseconds = asMilliseconds;
        proto$2.asSeconds = asSeconds;
        proto$2.asMinutes = asMinutes;
        proto$2.asHours = asHours;
        proto$2.asDays = asDays;
        proto$2.asWeeks = asWeeks;
        proto$2.asMonths = asMonths;
        proto$2.asQuarters = asQuarters;
        proto$2.asYears = asYears;
        proto$2.valueOf = valueOf$1;
        proto$2._bubble = bubble;
        proto$2.clone = clone$1;
        proto$2.get = get$2;
        proto$2.milliseconds = milliseconds;
        proto$2.seconds = seconds;
        proto$2.minutes = minutes;
        proto$2.hours = hours;
        proto$2.days = days;
        proto$2.weeks = weeks;
        proto$2.months = months;
        proto$2.years = years;
        proto$2.humanize = humanize;
        proto$2.toISOString = toISOString$1;
        proto$2.toString = toISOString$1;
        proto$2.toJSON = toISOString$1;
        proto$2.locale = locale;
        proto$2.localeData = localeData;
        proto$2.toIsoString = deprecate(
          "toIsoString() is deprecated. Please use toISOString() instead (notice the capitals)",
          toISOString$1
        );
        proto$2.lang = lang;
        addFormatToken("X", 0, 0, "unix");
        addFormatToken("x", 0, 0, "valueOf");
        addRegexToken("x", matchSigned);
        addRegexToken("X", matchTimestamp);
        addParseToken("X", function(input2, array, config) {
          config._d = new Date(parseFloat(input2) * 1e3);
        });
        addParseToken("x", function(input2, array, config) {
          config._d = new Date(toInt(input2));
        });
        hooks.version = "2.29.4";
        setHookCallback(createLocal);
        hooks.fn = proto;
        hooks.min = min;
        hooks.max = max;
        hooks.now = now;
        hooks.utc = createUTC;
        hooks.unix = createUnix;
        hooks.months = listMonths;
        hooks.isDate = isDate2;
        hooks.locale = getSetGlobalLocale;
        hooks.invalid = createInvalid;
        hooks.duration = createDuration;
        hooks.isMoment = isMoment;
        hooks.weekdays = listWeekdays;
        hooks.parseZone = createInZone;
        hooks.localeData = getLocale;
        hooks.isDuration = isDuration;
        hooks.monthsShort = listMonthsShort;
        hooks.weekdaysMin = listWeekdaysMin;
        hooks.defineLocale = defineLocale;
        hooks.updateLocale = updateLocale;
        hooks.locales = listLocales;
        hooks.weekdaysShort = listWeekdaysShort;
        hooks.normalizeUnits = normalizeUnits;
        hooks.relativeTimeRounding = getSetRelativeTimeRounding;
        hooks.relativeTimeThreshold = getSetRelativeTimeThreshold;
        hooks.calendarFormat = getCalendarFormat;
        hooks.prototype = proto;
        hooks.HTML5_FMT = {
          DATETIME_LOCAL: "YYYY-MM-DDTHH:mm",
          DATETIME_LOCAL_SECONDS: "YYYY-MM-DDTHH:mm:ss",
          DATETIME_LOCAL_MS: "YYYY-MM-DDTHH:mm:ss.SSS",
          DATE: "YYYY-MM-DD",
          TIME: "HH:mm",
          TIME_SECONDS: "HH:mm:ss",
          TIME_MS: "HH:mm:ss.SSS",
          WEEK: "GGGG-[W]WW",
          MONTH: "YYYY-MM"
        };
        return hooks;
      });
    }
  });

  // .quasar/bex/bridge.js
  var import_events = __toESM(require_events());

  // node_modules/quasar/src/utils/uid.js
  var buf;
  var bufIdx = 0;
  var hexBytes = new Array(256);
  for (let i2 = 0; i2 < 256; i2++) {
    hexBytes[i2] = (i2 + 256).toString(16).substring(1);
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
      for (let i2 = n; i2 > 0; i2--) {
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
  var sizeOf = (value2) => typeSizes[typeof value2](value2);
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
                for (let i2 = 0; i2 < chunksRequired; i2++) {
                  let take = Math.min(data.length, arrayItemCount);
                  this.wall.send([{
                    event: currentMessage.event,
                    payload: {
                      _chunkSplit: {
                        count: chunksRequired,
                        lastChunk: i2 === chunksRequired - 1
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

  // src-bex/background.ts
  var import_wrappers = __toESM(require_wrappers());

  // src-bex/chrome-local-storage-api.js
  var getObjectFromLocalStorage = async function(key) {
    return new Promise((resolve, reject) => {
      try {
        chrome.storage.local.get(key, function(value2) {
          resolve(value2[key]);
        });
      } catch (ex) {
        reject(ex);
      }
    });
  };
  var saveObjectInLocalStorage = async function(obj2) {
    return new Promise((resolve, reject) => {
      try {
        chrome.storage.local.set(obj2, function() {
          resolve();
        });
      } catch (ex) {
        reject(ex);
      }
    });
  };
  var removeObjectFromLocalStorage = async function(keys) {
    return new Promise((resolve, reject) => {
      try {
        chrome.storage.local.remove(keys, function() {
          resolve();
        });
      } catch (ex) {
        reject(ex);
      }
    });
  };

  // node_modules/axios/lib/helpers/bind.js
  function bind(fn, thisArg) {
    return function wrap() {
      return fn.apply(thisArg, arguments);
    };
  }

  // node_modules/axios/lib/utils.js
  var { toString } = Object.prototype;
  var { getPrototypeOf } = Object;
  var kindOf = ((cache2) => (thing) => {
    const str2 = toString.call(thing);
    return cache2[str2] || (cache2[str2] = str2.slice(8, -1).toLowerCase());
  })(/* @__PURE__ */ Object.create(null));
  var kindOfTest = (type) => {
    type = type.toLowerCase();
    return (thing) => kindOf(thing) === type;
  };
  var typeOfTest = (type) => (thing) => typeof thing === type;
  var { isArray } = Array;
  var isUndefined = typeOfTest("undefined");
  function isBuffer(val) {
    return val !== null && !isUndefined(val) && val.constructor !== null && !isUndefined(val.constructor) && isFunction(val.constructor.isBuffer) && val.constructor.isBuffer(val);
  }
  var isArrayBuffer = kindOfTest("ArrayBuffer");
  function isArrayBufferView(val) {
    let result;
    if (typeof ArrayBuffer !== "undefined" && ArrayBuffer.isView) {
      result = ArrayBuffer.isView(val);
    } else {
      result = val && val.buffer && isArrayBuffer(val.buffer);
    }
    return result;
  }
  var isString = typeOfTest("string");
  var isFunction = typeOfTest("function");
  var isNumber = typeOfTest("number");
  var isObject = (thing) => thing !== null && typeof thing === "object";
  var isBoolean = (thing) => thing === true || thing === false;
  var isPlainObject = (val) => {
    if (kindOf(val) !== "object") {
      return false;
    }
    const prototype3 = getPrototypeOf(val);
    return (prototype3 === null || prototype3 === Object.prototype || Object.getPrototypeOf(prototype3) === null) && !(Symbol.toStringTag in val) && !(Symbol.iterator in val);
  };
  var isDate = kindOfTest("Date");
  var isFile = kindOfTest("File");
  var isBlob = kindOfTest("Blob");
  var isFileList = kindOfTest("FileList");
  var isStream = (val) => isObject(val) && isFunction(val.pipe);
  var isFormData = (thing) => {
    let kind;
    return thing && (typeof FormData === "function" && thing instanceof FormData || isFunction(thing.append) && ((kind = kindOf(thing)) === "formdata" || kind === "object" && isFunction(thing.toString) && thing.toString() === "[object FormData]"));
  };
  var isURLSearchParams = kindOfTest("URLSearchParams");
  var trim = (str2) => str2.trim ? str2.trim() : str2.replace(/^[\s\uFEFF\xA0]+|[\s\uFEFF\xA0]+$/g, "");
  function forEach(obj2, fn, { allOwnKeys = false } = {}) {
    if (obj2 === null || typeof obj2 === "undefined") {
      return;
    }
    let i2;
    let l;
    if (typeof obj2 !== "object") {
      obj2 = [obj2];
    }
    if (isArray(obj2)) {
      for (i2 = 0, l = obj2.length; i2 < l; i2++) {
        fn.call(null, obj2[i2], i2, obj2);
      }
    } else {
      const keys = allOwnKeys ? Object.getOwnPropertyNames(obj2) : Object.keys(obj2);
      const len = keys.length;
      let key;
      for (i2 = 0; i2 < len; i2++) {
        key = keys[i2];
        fn.call(null, obj2[key], key, obj2);
      }
    }
  }
  function findKey(obj2, key) {
    key = key.toLowerCase();
    const keys = Object.keys(obj2);
    let i2 = keys.length;
    let _key;
    while (i2-- > 0) {
      _key = keys[i2];
      if (key === _key.toLowerCase()) {
        return _key;
      }
    }
    return null;
  }
  var _global = (() => {
    if (typeof globalThis !== "undefined")
      return globalThis;
    return typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : global;
  })();
  var isContextDefined = (context) => !isUndefined(context) && context !== _global;
  function merge() {
    const { caseless } = isContextDefined(this) && this || {};
    const result = {};
    const assignValue = (val, key) => {
      const targetKey = caseless && findKey(result, key) || key;
      if (isPlainObject(result[targetKey]) && isPlainObject(val)) {
        result[targetKey] = merge(result[targetKey], val);
      } else if (isPlainObject(val)) {
        result[targetKey] = merge({}, val);
      } else if (isArray(val)) {
        result[targetKey] = val.slice();
      } else {
        result[targetKey] = val;
      }
    };
    for (let i2 = 0, l = arguments.length; i2 < l; i2++) {
      arguments[i2] && forEach(arguments[i2], assignValue);
    }
    return result;
  }
  var extend = (a, b, thisArg, { allOwnKeys } = {}) => {
    forEach(b, (val, key) => {
      if (thisArg && isFunction(val)) {
        a[key] = bind(val, thisArg);
      } else {
        a[key] = val;
      }
    }, { allOwnKeys });
    return a;
  };
  var stripBOM = (content) => {
    if (content.charCodeAt(0) === 65279) {
      content = content.slice(1);
    }
    return content;
  };
  var inherits = (constructor, superConstructor, props, descriptors2) => {
    constructor.prototype = Object.create(superConstructor.prototype, descriptors2);
    constructor.prototype.constructor = constructor;
    Object.defineProperty(constructor, "super", {
      value: superConstructor.prototype
    });
    props && Object.assign(constructor.prototype, props);
  };
  var toFlatObject = (sourceObj, destObj, filter2, propFilter) => {
    let props;
    let i2;
    let prop;
    const merged = {};
    destObj = destObj || {};
    if (sourceObj == null)
      return destObj;
    do {
      props = Object.getOwnPropertyNames(sourceObj);
      i2 = props.length;
      while (i2-- > 0) {
        prop = props[i2];
        if ((!propFilter || propFilter(prop, sourceObj, destObj)) && !merged[prop]) {
          destObj[prop] = sourceObj[prop];
          merged[prop] = true;
        }
      }
      sourceObj = filter2 !== false && getPrototypeOf(sourceObj);
    } while (sourceObj && (!filter2 || filter2(sourceObj, destObj)) && sourceObj !== Object.prototype);
    return destObj;
  };
  var endsWith = (str2, searchString, position) => {
    str2 = String(str2);
    if (position === void 0 || position > str2.length) {
      position = str2.length;
    }
    position -= searchString.length;
    const lastIndex = str2.indexOf(searchString, position);
    return lastIndex !== -1 && lastIndex === position;
  };
  var toArray = (thing) => {
    if (!thing)
      return null;
    if (isArray(thing))
      return thing;
    let i2 = thing.length;
    if (!isNumber(i2))
      return null;
    const arr = new Array(i2);
    while (i2-- > 0) {
      arr[i2] = thing[i2];
    }
    return arr;
  };
  var isTypedArray = ((TypedArray) => {
    return (thing) => {
      return TypedArray && thing instanceof TypedArray;
    };
  })(typeof Uint8Array !== "undefined" && getPrototypeOf(Uint8Array));
  var forEachEntry = (obj2, fn) => {
    const generator = obj2 && obj2[Symbol.iterator];
    const iterator = generator.call(obj2);
    let result;
    while ((result = iterator.next()) && !result.done) {
      const pair = result.value;
      fn.call(obj2, pair[0], pair[1]);
    }
  };
  var matchAll = (regExp, str2) => {
    let matches;
    const arr = [];
    while ((matches = regExp.exec(str2)) !== null) {
      arr.push(matches);
    }
    return arr;
  };
  var isHTMLForm = kindOfTest("HTMLFormElement");
  var toCamelCase = (str2) => {
    return str2.toLowerCase().replace(
      /[-_\s]([a-z\d])(\w*)/g,
      function replacer(m, p1, p2) {
        return p1.toUpperCase() + p2;
      }
    );
  };
  var hasOwnProperty = (({ hasOwnProperty: hasOwnProperty2 }) => (obj2, prop) => hasOwnProperty2.call(obj2, prop))(Object.prototype);
  var isRegExp = kindOfTest("RegExp");
  var reduceDescriptors = (obj2, reducer) => {
    const descriptors2 = Object.getOwnPropertyDescriptors(obj2);
    const reducedDescriptors = {};
    forEach(descriptors2, (descriptor, name) => {
      let ret;
      if ((ret = reducer(descriptor, name, obj2)) !== false) {
        reducedDescriptors[name] = ret || descriptor;
      }
    });
    Object.defineProperties(obj2, reducedDescriptors);
  };
  var freezeMethods = (obj2) => {
    reduceDescriptors(obj2, (descriptor, name) => {
      if (isFunction(obj2) && ["arguments", "caller", "callee"].indexOf(name) !== -1) {
        return false;
      }
      const value2 = obj2[name];
      if (!isFunction(value2))
        return;
      descriptor.enumerable = false;
      if ("writable" in descriptor) {
        descriptor.writable = false;
        return;
      }
      if (!descriptor.set) {
        descriptor.set = () => {
          throw Error("Can not rewrite read-only method '" + name + "'");
        };
      }
    });
  };
  var toObjectSet = (arrayOrString, delimiter) => {
    const obj2 = {};
    const define2 = (arr) => {
      arr.forEach((value2) => {
        obj2[value2] = true;
      });
    };
    isArray(arrayOrString) ? define2(arrayOrString) : define2(String(arrayOrString).split(delimiter));
    return obj2;
  };
  var noop = () => {
  };
  var toFiniteNumber = (value2, defaultValue) => {
    value2 = +value2;
    return Number.isFinite(value2) ? value2 : defaultValue;
  };
  var ALPHA = "abcdefghijklmnopqrstuvwxyz";
  var DIGIT = "0123456789";
  var ALPHABET = {
    DIGIT,
    ALPHA,
    ALPHA_DIGIT: ALPHA + ALPHA.toUpperCase() + DIGIT
  };
  var generateString = (size = 16, alphabet2 = ALPHABET.ALPHA_DIGIT) => {
    let str2 = "";
    const { length: length2 } = alphabet2;
    while (size--) {
      str2 += alphabet2[Math.random() * length2 | 0];
    }
    return str2;
  };
  function isSpecCompliantForm(thing) {
    return !!(thing && isFunction(thing.append) && thing[Symbol.toStringTag] === "FormData" && thing[Symbol.iterator]);
  }
  var toJSONObject = (obj2) => {
    const stack = new Array(10);
    const visit = (source, i2) => {
      if (isObject(source)) {
        if (stack.indexOf(source) >= 0) {
          return;
        }
        if (!("toJSON" in source)) {
          stack[i2] = source;
          const target = isArray(source) ? [] : {};
          forEach(source, (value2, key) => {
            const reducedValue = visit(value2, i2 + 1);
            !isUndefined(reducedValue) && (target[key] = reducedValue);
          });
          stack[i2] = void 0;
          return target;
        }
      }
      return source;
    };
    return visit(obj2, 0);
  };
  var isAsyncFn = kindOfTest("AsyncFunction");
  var isThenable = (thing) => thing && (isObject(thing) || isFunction(thing)) && isFunction(thing.then) && isFunction(thing.catch);
  var utils_default = {
    isArray,
    isArrayBuffer,
    isBuffer,
    isFormData,
    isArrayBufferView,
    isString,
    isNumber,
    isBoolean,
    isObject,
    isPlainObject,
    isUndefined,
    isDate,
    isFile,
    isBlob,
    isRegExp,
    isFunction,
    isStream,
    isURLSearchParams,
    isTypedArray,
    isFileList,
    forEach,
    merge,
    extend,
    trim,
    stripBOM,
    inherits,
    toFlatObject,
    kindOf,
    kindOfTest,
    endsWith,
    toArray,
    forEachEntry,
    matchAll,
    isHTMLForm,
    hasOwnProperty,
    hasOwnProp: hasOwnProperty,
    reduceDescriptors,
    freezeMethods,
    toObjectSet,
    toCamelCase,
    noop,
    toFiniteNumber,
    findKey,
    global: _global,
    isContextDefined,
    ALPHABET,
    generateString,
    isSpecCompliantForm,
    toJSONObject,
    isAsyncFn,
    isThenable
  };

  // node_modules/axios/lib/core/AxiosError.js
  function AxiosError(message, code, config, request, response) {
    Error.call(this);
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    } else {
      this.stack = new Error().stack;
    }
    this.message = message;
    this.name = "AxiosError";
    code && (this.code = code);
    config && (this.config = config);
    request && (this.request = request);
    response && (this.response = response);
  }
  utils_default.inherits(AxiosError, Error, {
    toJSON: function toJSON() {
      return {
        message: this.message,
        name: this.name,
        description: this.description,
        number: this.number,
        fileName: this.fileName,
        lineNumber: this.lineNumber,
        columnNumber: this.columnNumber,
        stack: this.stack,
        config: utils_default.toJSONObject(this.config),
        code: this.code,
        status: this.response && this.response.status ? this.response.status : null
      };
    }
  });
  var prototype = AxiosError.prototype;
  var descriptors = {};
  [
    "ERR_BAD_OPTION_VALUE",
    "ERR_BAD_OPTION",
    "ECONNABORTED",
    "ETIMEDOUT",
    "ERR_NETWORK",
    "ERR_FR_TOO_MANY_REDIRECTS",
    "ERR_DEPRECATED",
    "ERR_BAD_RESPONSE",
    "ERR_BAD_REQUEST",
    "ERR_CANCELED",
    "ERR_NOT_SUPPORT",
    "ERR_INVALID_URL"
  ].forEach((code) => {
    descriptors[code] = { value: code };
  });
  Object.defineProperties(AxiosError, descriptors);
  Object.defineProperty(prototype, "isAxiosError", { value: true });
  AxiosError.from = (error, code, config, request, response, customProps) => {
    const axiosError = Object.create(prototype);
    utils_default.toFlatObject(error, axiosError, function filter2(obj2) {
      return obj2 !== Error.prototype;
    }, (prop) => {
      return prop !== "isAxiosError";
    });
    AxiosError.call(axiosError, error.message, code, config, request, response);
    axiosError.cause = error;
    axiosError.name = error.name;
    customProps && Object.assign(axiosError, customProps);
    return axiosError;
  };
  var AxiosError_default = AxiosError;

  // node_modules/axios/lib/helpers/null.js
  var null_default = null;

  // node_modules/axios/lib/helpers/toFormData.js
  function isVisitable(thing) {
    return utils_default.isPlainObject(thing) || utils_default.isArray(thing);
  }
  function removeBrackets(key) {
    return utils_default.endsWith(key, "[]") ? key.slice(0, -2) : key;
  }
  function renderKey(path, key, dots) {
    if (!path)
      return key;
    return path.concat(key).map(function each(token2, i2) {
      token2 = removeBrackets(token2);
      return !dots && i2 ? "[" + token2 + "]" : token2;
    }).join(dots ? "." : "");
  }
  function isFlatArray(arr) {
    return utils_default.isArray(arr) && !arr.some(isVisitable);
  }
  var predicates = utils_default.toFlatObject(utils_default, {}, null, function filter(prop) {
    return /^is[A-Z]/.test(prop);
  });
  function toFormData(obj2, formData, options) {
    if (!utils_default.isObject(obj2)) {
      throw new TypeError("target must be an object");
    }
    formData = formData || new (null_default || FormData)();
    options = utils_default.toFlatObject(options, {
      metaTokens: true,
      dots: false,
      indexes: false
    }, false, function defined(option, source) {
      return !utils_default.isUndefined(source[option]);
    });
    const metaTokens = options.metaTokens;
    const visitor = options.visitor || defaultVisitor;
    const dots = options.dots;
    const indexes = options.indexes;
    const _Blob = options.Blob || typeof Blob !== "undefined" && Blob;
    const useBlob = _Blob && utils_default.isSpecCompliantForm(formData);
    if (!utils_default.isFunction(visitor)) {
      throw new TypeError("visitor must be a function");
    }
    function convertValue(value2) {
      if (value2 === null)
        return "";
      if (utils_default.isDate(value2)) {
        return value2.toISOString();
      }
      if (!useBlob && utils_default.isBlob(value2)) {
        throw new AxiosError_default("Blob is not supported. Use a Buffer instead.");
      }
      if (utils_default.isArrayBuffer(value2) || utils_default.isTypedArray(value2)) {
        return useBlob && typeof Blob === "function" ? new Blob([value2]) : Buffer.from(value2);
      }
      return value2;
    }
    function defaultVisitor(value2, key, path) {
      let arr = value2;
      if (value2 && !path && typeof value2 === "object") {
        if (utils_default.endsWith(key, "{}")) {
          key = metaTokens ? key : key.slice(0, -2);
          value2 = JSON.stringify(value2);
        } else if (utils_default.isArray(value2) && isFlatArray(value2) || (utils_default.isFileList(value2) || utils_default.endsWith(key, "[]")) && (arr = utils_default.toArray(value2))) {
          key = removeBrackets(key);
          arr.forEach(function each(el, index) {
            !(utils_default.isUndefined(el) || el === null) && formData.append(
              indexes === true ? renderKey([key], index, dots) : indexes === null ? key : key + "[]",
              convertValue(el)
            );
          });
          return false;
        }
      }
      if (isVisitable(value2)) {
        return true;
      }
      formData.append(renderKey(path, key, dots), convertValue(value2));
      return false;
    }
    const stack = [];
    const exposedHelpers = Object.assign(predicates, {
      defaultVisitor,
      convertValue,
      isVisitable
    });
    function build(value2, path) {
      if (utils_default.isUndefined(value2))
        return;
      if (stack.indexOf(value2) !== -1) {
        throw Error("Circular reference detected in " + path.join("."));
      }
      stack.push(value2);
      utils_default.forEach(value2, function each(el, key) {
        const result = !(utils_default.isUndefined(el) || el === null) && visitor.call(
          formData,
          el,
          utils_default.isString(key) ? key.trim() : key,
          path,
          exposedHelpers
        );
        if (result === true) {
          build(el, path ? path.concat(key) : [key]);
        }
      });
      stack.pop();
    }
    if (!utils_default.isObject(obj2)) {
      throw new TypeError("data must be an object");
    }
    build(obj2);
    return formData;
  }
  var toFormData_default = toFormData;

  // node_modules/axios/lib/helpers/AxiosURLSearchParams.js
  function encode(str2) {
    const charMap = {
      "!": "%21",
      "'": "%27",
      "(": "%28",
      ")": "%29",
      "~": "%7E",
      "%20": "+",
      "%00": "\0"
    };
    return encodeURIComponent(str2).replace(/[!'()~]|%20|%00/g, function replacer(match) {
      return charMap[match];
    });
  }
  function AxiosURLSearchParams(params, options) {
    this._pairs = [];
    params && toFormData_default(params, this, options);
  }
  var prototype2 = AxiosURLSearchParams.prototype;
  prototype2.append = function append(name, value2) {
    this._pairs.push([name, value2]);
  };
  prototype2.toString = function toString2(encoder) {
    const _encode = encoder ? function(value2) {
      return encoder.call(this, value2, encode);
    } : encode;
    return this._pairs.map(function each(pair) {
      return _encode(pair[0]) + "=" + _encode(pair[1]);
    }, "").join("&");
  };
  var AxiosURLSearchParams_default = AxiosURLSearchParams;

  // node_modules/axios/lib/helpers/buildURL.js
  function encode2(val) {
    return encodeURIComponent(val).replace(/%3A/gi, ":").replace(/%24/g, "$").replace(/%2C/gi, ",").replace(/%20/g, "+").replace(/%5B/gi, "[").replace(/%5D/gi, "]");
  }
  function buildURL(url3, params, options) {
    if (!params) {
      return url3;
    }
    const _encode = options && options.encode || encode2;
    const serializeFn = options && options.serialize;
    let serializedParams;
    if (serializeFn) {
      serializedParams = serializeFn(params, options);
    } else {
      serializedParams = utils_default.isURLSearchParams(params) ? params.toString() : new AxiosURLSearchParams_default(params, options).toString(_encode);
    }
    if (serializedParams) {
      const hashmarkIndex = url3.indexOf("#");
      if (hashmarkIndex !== -1) {
        url3 = url3.slice(0, hashmarkIndex);
      }
      url3 += (url3.indexOf("?") === -1 ? "?" : "&") + serializedParams;
    }
    return url3;
  }

  // node_modules/axios/lib/core/InterceptorManager.js
  var InterceptorManager = class {
    constructor() {
      this.handlers = [];
    }
    use(fulfilled, rejected, options) {
      this.handlers.push({
        fulfilled,
        rejected,
        synchronous: options ? options.synchronous : false,
        runWhen: options ? options.runWhen : null
      });
      return this.handlers.length - 1;
    }
    eject(id) {
      if (this.handlers[id]) {
        this.handlers[id] = null;
      }
    }
    clear() {
      if (this.handlers) {
        this.handlers = [];
      }
    }
    forEach(fn) {
      utils_default.forEach(this.handlers, function forEachHandler(h) {
        if (h !== null) {
          fn(h);
        }
      });
    }
  };
  var InterceptorManager_default = InterceptorManager;

  // node_modules/axios/lib/defaults/transitional.js
  var transitional_default = {
    silentJSONParsing: true,
    forcedJSONParsing: true,
    clarifyTimeoutError: false
  };

  // node_modules/axios/lib/platform/browser/classes/URLSearchParams.js
  var URLSearchParams_default = typeof URLSearchParams !== "undefined" ? URLSearchParams : AxiosURLSearchParams_default;

  // node_modules/axios/lib/platform/browser/classes/FormData.js
  var FormData_default = typeof FormData !== "undefined" ? FormData : null;

  // node_modules/axios/lib/platform/browser/classes/Blob.js
  var Blob_default = typeof Blob !== "undefined" ? Blob : null;

  // node_modules/axios/lib/platform/browser/index.js
  var browser_default = {
    isBrowser: true,
    classes: {
      URLSearchParams: URLSearchParams_default,
      FormData: FormData_default,
      Blob: Blob_default
    },
    protocols: ["http", "https", "file", "blob", "url", "data"]
  };

  // node_modules/axios/lib/platform/common/utils.js
  var utils_exports = {};
  __export(utils_exports, {
    hasBrowserEnv: () => hasBrowserEnv,
    hasStandardBrowserEnv: () => hasStandardBrowserEnv,
    hasStandardBrowserWebWorkerEnv: () => hasStandardBrowserWebWorkerEnv
  });
  var hasBrowserEnv = typeof window !== "undefined" && typeof document !== "undefined";
  var hasStandardBrowserEnv = ((product) => {
    return hasBrowserEnv && ["ReactNative", "NativeScript", "NS"].indexOf(product) < 0;
  })(typeof navigator !== "undefined" && navigator.product);
  var hasStandardBrowserWebWorkerEnv = (() => {
    return typeof WorkerGlobalScope !== "undefined" && self instanceof WorkerGlobalScope && typeof self.importScripts === "function";
  })();

  // node_modules/axios/lib/platform/index.js
  var platform_default = {
    ...utils_exports,
    ...browser_default
  };

  // node_modules/axios/lib/helpers/toURLEncodedForm.js
  function toURLEncodedForm(data, options) {
    return toFormData_default(data, new platform_default.classes.URLSearchParams(), Object.assign({
      visitor: function(value2, key, path, helpers) {
        if (platform_default.isNode && utils_default.isBuffer(value2)) {
          this.append(key, value2.toString("base64"));
          return false;
        }
        return helpers.defaultVisitor.apply(this, arguments);
      }
    }, options));
  }

  // node_modules/axios/lib/helpers/formDataToJSON.js
  function parsePropPath(name) {
    return utils_default.matchAll(/\w+|\[(\w*)]/g, name).map((match) => {
      return match[0] === "[]" ? "" : match[1] || match[0];
    });
  }
  function arrayToObject(arr) {
    const obj2 = {};
    const keys = Object.keys(arr);
    let i2;
    const len = keys.length;
    let key;
    for (i2 = 0; i2 < len; i2++) {
      key = keys[i2];
      obj2[key] = arr[key];
    }
    return obj2;
  }
  function formDataToJSON(formData) {
    function buildPath(path, value2, target, index) {
      let name = path[index++];
      const isNumericKey = Number.isFinite(+name);
      const isLast = index >= path.length;
      name = !name && utils_default.isArray(target) ? target.length : name;
      if (isLast) {
        if (utils_default.hasOwnProp(target, name)) {
          target[name] = [target[name], value2];
        } else {
          target[name] = value2;
        }
        return !isNumericKey;
      }
      if (!target[name] || !utils_default.isObject(target[name])) {
        target[name] = [];
      }
      const result = buildPath(path, value2, target[name], index);
      if (result && utils_default.isArray(target[name])) {
        target[name] = arrayToObject(target[name]);
      }
      return !isNumericKey;
    }
    if (utils_default.isFormData(formData) && utils_default.isFunction(formData.entries)) {
      const obj2 = {};
      utils_default.forEachEntry(formData, (name, value2) => {
        buildPath(parsePropPath(name), value2, obj2, 0);
      });
      return obj2;
    }
    return null;
  }
  var formDataToJSON_default = formDataToJSON;

  // node_modules/axios/lib/defaults/index.js
  function stringifySafely(rawValue, parser, encoder) {
    if (utils_default.isString(rawValue)) {
      try {
        (parser || JSON.parse)(rawValue);
        return utils_default.trim(rawValue);
      } catch (e) {
        if (e.name !== "SyntaxError") {
          throw e;
        }
      }
    }
    return (encoder || JSON.stringify)(rawValue);
  }
  var defaults = {
    transitional: transitional_default,
    adapter: ["xhr", "http"],
    transformRequest: [function transformRequest(data, headers) {
      const contentType = headers.getContentType() || "";
      const hasJSONContentType = contentType.indexOf("application/json") > -1;
      const isObjectPayload = utils_default.isObject(data);
      if (isObjectPayload && utils_default.isHTMLForm(data)) {
        data = new FormData(data);
      }
      const isFormData2 = utils_default.isFormData(data);
      if (isFormData2) {
        if (!hasJSONContentType) {
          return data;
        }
        return hasJSONContentType ? JSON.stringify(formDataToJSON_default(data)) : data;
      }
      if (utils_default.isArrayBuffer(data) || utils_default.isBuffer(data) || utils_default.isStream(data) || utils_default.isFile(data) || utils_default.isBlob(data)) {
        return data;
      }
      if (utils_default.isArrayBufferView(data)) {
        return data.buffer;
      }
      if (utils_default.isURLSearchParams(data)) {
        headers.setContentType("application/x-www-form-urlencoded;charset=utf-8", false);
        return data.toString();
      }
      let isFileList2;
      if (isObjectPayload) {
        if (contentType.indexOf("application/x-www-form-urlencoded") > -1) {
          return toURLEncodedForm(data, this.formSerializer).toString();
        }
        if ((isFileList2 = utils_default.isFileList(data)) || contentType.indexOf("multipart/form-data") > -1) {
          const _FormData = this.env && this.env.FormData;
          return toFormData_default(
            isFileList2 ? { "files[]": data } : data,
            _FormData && new _FormData(),
            this.formSerializer
          );
        }
      }
      if (isObjectPayload || hasJSONContentType) {
        headers.setContentType("application/json", false);
        return stringifySafely(data);
      }
      return data;
    }],
    transformResponse: [function transformResponse(data) {
      const transitional2 = this.transitional || defaults.transitional;
      const forcedJSONParsing = transitional2 && transitional2.forcedJSONParsing;
      const JSONRequested = this.responseType === "json";
      if (data && utils_default.isString(data) && (forcedJSONParsing && !this.responseType || JSONRequested)) {
        const silentJSONParsing = transitional2 && transitional2.silentJSONParsing;
        const strictJSONParsing = !silentJSONParsing && JSONRequested;
        try {
          return JSON.parse(data);
        } catch (e) {
          if (strictJSONParsing) {
            if (e.name === "SyntaxError") {
              throw AxiosError_default.from(e, AxiosError_default.ERR_BAD_RESPONSE, this, null, this.response);
            }
            throw e;
          }
        }
      }
      return data;
    }],
    timeout: 0,
    xsrfCookieName: "XSRF-TOKEN",
    xsrfHeaderName: "X-XSRF-TOKEN",
    maxContentLength: -1,
    maxBodyLength: -1,
    env: {
      FormData: platform_default.classes.FormData,
      Blob: platform_default.classes.Blob
    },
    validateStatus: function validateStatus(status) {
      return status >= 200 && status < 300;
    },
    headers: {
      common: {
        "Accept": "application/json, text/plain, */*",
        "Content-Type": void 0
      }
    }
  };
  utils_default.forEach(["delete", "get", "head", "post", "put", "patch"], (method) => {
    defaults.headers[method] = {};
  });
  var defaults_default = defaults;

  // node_modules/axios/lib/helpers/parseHeaders.js
  var ignoreDuplicateOf = utils_default.toObjectSet([
    "age",
    "authorization",
    "content-length",
    "content-type",
    "etag",
    "expires",
    "from",
    "host",
    "if-modified-since",
    "if-unmodified-since",
    "last-modified",
    "location",
    "max-forwards",
    "proxy-authorization",
    "referer",
    "retry-after",
    "user-agent"
  ]);
  var parseHeaders_default = (rawHeaders) => {
    const parsed = {};
    let key;
    let val;
    let i2;
    rawHeaders && rawHeaders.split("\n").forEach(function parser(line) {
      i2 = line.indexOf(":");
      key = line.substring(0, i2).trim().toLowerCase();
      val = line.substring(i2 + 1).trim();
      if (!key || parsed[key] && ignoreDuplicateOf[key]) {
        return;
      }
      if (key === "set-cookie") {
        if (parsed[key]) {
          parsed[key].push(val);
        } else {
          parsed[key] = [val];
        }
      } else {
        parsed[key] = parsed[key] ? parsed[key] + ", " + val : val;
      }
    });
    return parsed;
  };

  // node_modules/axios/lib/core/AxiosHeaders.js
  var $internals = Symbol("internals");
  function normalizeHeader(header) {
    return header && String(header).trim().toLowerCase();
  }
  function normalizeValue(value2) {
    if (value2 === false || value2 == null) {
      return value2;
    }
    return utils_default.isArray(value2) ? value2.map(normalizeValue) : String(value2);
  }
  function parseTokens(str2) {
    const tokens = /* @__PURE__ */ Object.create(null);
    const tokensRE = /([^\s,;=]+)\s*(?:=\s*([^,;]+))?/g;
    let match;
    while (match = tokensRE.exec(str2)) {
      tokens[match[1]] = match[2];
    }
    return tokens;
  }
  var isValidHeaderName = (str2) => /^[-_a-zA-Z0-9^`|~,!#$%&'*+.]+$/.test(str2.trim());
  function matchHeaderValue(context, value2, header, filter2, isHeaderNameFilter) {
    if (utils_default.isFunction(filter2)) {
      return filter2.call(this, value2, header);
    }
    if (isHeaderNameFilter) {
      value2 = header;
    }
    if (!utils_default.isString(value2))
      return;
    if (utils_default.isString(filter2)) {
      return value2.indexOf(filter2) !== -1;
    }
    if (utils_default.isRegExp(filter2)) {
      return filter2.test(value2);
    }
  }
  function formatHeader(header) {
    return header.trim().toLowerCase().replace(/([a-z\d])(\w*)/g, (w, char, str2) => {
      return char.toUpperCase() + str2;
    });
  }
  function buildAccessors(obj2, header) {
    const accessorName = utils_default.toCamelCase(" " + header);
    ["get", "set", "has"].forEach((methodName) => {
      Object.defineProperty(obj2, methodName + accessorName, {
        value: function(arg1, arg2, arg3) {
          return this[methodName].call(this, header, arg1, arg2, arg3);
        },
        configurable: true
      });
    });
  }
  var AxiosHeaders = class {
    constructor(headers) {
      headers && this.set(headers);
    }
    set(header, valueOrRewrite, rewrite) {
      const self2 = this;
      function setHeader(_value, _header, _rewrite) {
        const lHeader = normalizeHeader(_header);
        if (!lHeader) {
          throw new Error("header name must be a non-empty string");
        }
        const key = utils_default.findKey(self2, lHeader);
        if (!key || self2[key] === void 0 || _rewrite === true || _rewrite === void 0 && self2[key] !== false) {
          self2[key || _header] = normalizeValue(_value);
        }
      }
      const setHeaders = (headers, _rewrite) => utils_default.forEach(headers, (_value, _header) => setHeader(_value, _header, _rewrite));
      if (utils_default.isPlainObject(header) || header instanceof this.constructor) {
        setHeaders(header, valueOrRewrite);
      } else if (utils_default.isString(header) && (header = header.trim()) && !isValidHeaderName(header)) {
        setHeaders(parseHeaders_default(header), valueOrRewrite);
      } else {
        header != null && setHeader(valueOrRewrite, header, rewrite);
      }
      return this;
    }
    get(header, parser) {
      header = normalizeHeader(header);
      if (header) {
        const key = utils_default.findKey(this, header);
        if (key) {
          const value2 = this[key];
          if (!parser) {
            return value2;
          }
          if (parser === true) {
            return parseTokens(value2);
          }
          if (utils_default.isFunction(parser)) {
            return parser.call(this, value2, key);
          }
          if (utils_default.isRegExp(parser)) {
            return parser.exec(value2);
          }
          throw new TypeError("parser must be boolean|regexp|function");
        }
      }
    }
    has(header, matcher) {
      header = normalizeHeader(header);
      if (header) {
        const key = utils_default.findKey(this, header);
        return !!(key && this[key] !== void 0 && (!matcher || matchHeaderValue(this, this[key], key, matcher)));
      }
      return false;
    }
    delete(header, matcher) {
      const self2 = this;
      let deleted = false;
      function deleteHeader(_header) {
        _header = normalizeHeader(_header);
        if (_header) {
          const key = utils_default.findKey(self2, _header);
          if (key && (!matcher || matchHeaderValue(self2, self2[key], key, matcher))) {
            delete self2[key];
            deleted = true;
          }
        }
      }
      if (utils_default.isArray(header)) {
        header.forEach(deleteHeader);
      } else {
        deleteHeader(header);
      }
      return deleted;
    }
    clear(matcher) {
      const keys = Object.keys(this);
      let i2 = keys.length;
      let deleted = false;
      while (i2--) {
        const key = keys[i2];
        if (!matcher || matchHeaderValue(this, this[key], key, matcher, true)) {
          delete this[key];
          deleted = true;
        }
      }
      return deleted;
    }
    normalize(format) {
      const self2 = this;
      const headers = {};
      utils_default.forEach(this, (value2, header) => {
        const key = utils_default.findKey(headers, header);
        if (key) {
          self2[key] = normalizeValue(value2);
          delete self2[header];
          return;
        }
        const normalized = format ? formatHeader(header) : String(header).trim();
        if (normalized !== header) {
          delete self2[header];
        }
        self2[normalized] = normalizeValue(value2);
        headers[normalized] = true;
      });
      return this;
    }
    concat(...targets) {
      return this.constructor.concat(this, ...targets);
    }
    toJSON(asStrings) {
      const obj2 = /* @__PURE__ */ Object.create(null);
      utils_default.forEach(this, (value2, header) => {
        value2 != null && value2 !== false && (obj2[header] = asStrings && utils_default.isArray(value2) ? value2.join(", ") : value2);
      });
      return obj2;
    }
    [Symbol.iterator]() {
      return Object.entries(this.toJSON())[Symbol.iterator]();
    }
    toString() {
      return Object.entries(this.toJSON()).map(([header, value2]) => header + ": " + value2).join("\n");
    }
    get [Symbol.toStringTag]() {
      return "AxiosHeaders";
    }
    static from(thing) {
      return thing instanceof this ? thing : new this(thing);
    }
    static concat(first, ...targets) {
      const computed = new this(first);
      targets.forEach((target) => computed.set(target));
      return computed;
    }
    static accessor(header) {
      const internals = this[$internals] = this[$internals] = {
        accessors: {}
      };
      const accessors = internals.accessors;
      const prototype3 = this.prototype;
      function defineAccessor(_header) {
        const lHeader = normalizeHeader(_header);
        if (!accessors[lHeader]) {
          buildAccessors(prototype3, _header);
          accessors[lHeader] = true;
        }
      }
      utils_default.isArray(header) ? header.forEach(defineAccessor) : defineAccessor(header);
      return this;
    }
  };
  AxiosHeaders.accessor(["Content-Type", "Content-Length", "Accept", "Accept-Encoding", "User-Agent", "Authorization"]);
  utils_default.reduceDescriptors(AxiosHeaders.prototype, ({ value: value2 }, key) => {
    let mapped = key[0].toUpperCase() + key.slice(1);
    return {
      get: () => value2,
      set(headerValue) {
        this[mapped] = headerValue;
      }
    };
  });
  utils_default.freezeMethods(AxiosHeaders);
  var AxiosHeaders_default = AxiosHeaders;

  // node_modules/axios/lib/core/transformData.js
  function transformData(fns, response) {
    const config = this || defaults_default;
    const context = response || config;
    const headers = AxiosHeaders_default.from(context.headers);
    let data = context.data;
    utils_default.forEach(fns, function transform(fn) {
      data = fn.call(config, data, headers.normalize(), response ? response.status : void 0);
    });
    headers.normalize();
    return data;
  }

  // node_modules/axios/lib/cancel/isCancel.js
  function isCancel(value2) {
    return !!(value2 && value2.__CANCEL__);
  }

  // node_modules/axios/lib/cancel/CanceledError.js
  function CanceledError(message, config, request) {
    AxiosError_default.call(this, message == null ? "canceled" : message, AxiosError_default.ERR_CANCELED, config, request);
    this.name = "CanceledError";
  }
  utils_default.inherits(CanceledError, AxiosError_default, {
    __CANCEL__: true
  });
  var CanceledError_default = CanceledError;

  // node_modules/axios/lib/core/settle.js
  function settle(resolve, reject, response) {
    const validateStatus2 = response.config.validateStatus;
    if (!response.status || !validateStatus2 || validateStatus2(response.status)) {
      resolve(response);
    } else {
      reject(new AxiosError_default(
        "Request failed with status code " + response.status,
        [AxiosError_default.ERR_BAD_REQUEST, AxiosError_default.ERR_BAD_RESPONSE][Math.floor(response.status / 100) - 4],
        response.config,
        response.request,
        response
      ));
    }
  }

  // node_modules/axios/lib/helpers/cookies.js
  var cookies_default = platform_default.hasStandardBrowserEnv ? {
    write(name, value2, expires, path, domain, secure) {
      const cookie = [name + "=" + encodeURIComponent(value2)];
      utils_default.isNumber(expires) && cookie.push("expires=" + new Date(expires).toGMTString());
      utils_default.isString(path) && cookie.push("path=" + path);
      utils_default.isString(domain) && cookie.push("domain=" + domain);
      secure === true && cookie.push("secure");
      document.cookie = cookie.join("; ");
    },
    read(name) {
      const match = document.cookie.match(new RegExp("(^|;\\s*)(" + name + ")=([^;]*)"));
      return match ? decodeURIComponent(match[3]) : null;
    },
    remove(name) {
      this.write(name, "", Date.now() - 864e5);
    }
  } : {
    write() {
    },
    read() {
      return null;
    },
    remove() {
    }
  };

  // node_modules/axios/lib/helpers/isAbsoluteURL.js
  function isAbsoluteURL(url3) {
    return /^([a-z][a-z\d+\-.]*:)?\/\//i.test(url3);
  }

  // node_modules/axios/lib/helpers/combineURLs.js
  function combineURLs(baseURL, relativeURL) {
    return relativeURL ? baseURL.replace(/\/+$/, "") + "/" + relativeURL.replace(/^\/+/, "") : baseURL;
  }

  // node_modules/axios/lib/core/buildFullPath.js
  function buildFullPath(baseURL, requestedURL) {
    if (baseURL && !isAbsoluteURL(requestedURL)) {
      return combineURLs(baseURL, requestedURL);
    }
    return requestedURL;
  }

  // node_modules/axios/lib/helpers/isURLSameOrigin.js
  var isURLSameOrigin_default = platform_default.hasStandardBrowserEnv ? function standardBrowserEnv() {
    const msie = /(msie|trident)/i.test(navigator.userAgent);
    const urlParsingNode = document.createElement("a");
    let originURL;
    function resolveURL(url3) {
      let href = url3;
      if (msie) {
        urlParsingNode.setAttribute("href", href);
        href = urlParsingNode.href;
      }
      urlParsingNode.setAttribute("href", href);
      return {
        href: urlParsingNode.href,
        protocol: urlParsingNode.protocol ? urlParsingNode.protocol.replace(/:$/, "") : "",
        host: urlParsingNode.host,
        search: urlParsingNode.search ? urlParsingNode.search.replace(/^\?/, "") : "",
        hash: urlParsingNode.hash ? urlParsingNode.hash.replace(/^#/, "") : "",
        hostname: urlParsingNode.hostname,
        port: urlParsingNode.port,
        pathname: urlParsingNode.pathname.charAt(0) === "/" ? urlParsingNode.pathname : "/" + urlParsingNode.pathname
      };
    }
    originURL = resolveURL(window.location.href);
    return function isURLSameOrigin(requestURL) {
      const parsed = utils_default.isString(requestURL) ? resolveURL(requestURL) : requestURL;
      return parsed.protocol === originURL.protocol && parsed.host === originURL.host;
    };
  }() : function nonStandardBrowserEnv() {
    return function isURLSameOrigin() {
      return true;
    };
  }();

  // node_modules/axios/lib/helpers/parseProtocol.js
  function parseProtocol(url3) {
    const match = /^([-+\w]{1,25})(:?\/\/|:)/.exec(url3);
    return match && match[1] || "";
  }

  // node_modules/axios/lib/helpers/speedometer.js
  function speedometer(samplesCount, min) {
    samplesCount = samplesCount || 10;
    const bytes = new Array(samplesCount);
    const timestamps = new Array(samplesCount);
    let head = 0;
    let tail = 0;
    let firstSampleTS;
    min = min !== void 0 ? min : 1e3;
    return function push(chunkLength) {
      const now = Date.now();
      const startedAt = timestamps[tail];
      if (!firstSampleTS) {
        firstSampleTS = now;
      }
      bytes[head] = chunkLength;
      timestamps[head] = now;
      let i2 = tail;
      let bytesCount = 0;
      while (i2 !== head) {
        bytesCount += bytes[i2++];
        i2 = i2 % samplesCount;
      }
      head = (head + 1) % samplesCount;
      if (head === tail) {
        tail = (tail + 1) % samplesCount;
      }
      if (now - firstSampleTS < min) {
        return;
      }
      const passed = startedAt && now - startedAt;
      return passed ? Math.round(bytesCount * 1e3 / passed) : void 0;
    };
  }
  var speedometer_default = speedometer;

  // node_modules/axios/lib/adapters/xhr.js
  function progressEventReducer(listener, isDownloadStream) {
    let bytesNotified = 0;
    const _speedometer = speedometer_default(50, 250);
    return (e) => {
      const loaded = e.loaded;
      const total = e.lengthComputable ? e.total : void 0;
      const progressBytes = loaded - bytesNotified;
      const rate = _speedometer(progressBytes);
      const inRange = loaded <= total;
      bytesNotified = loaded;
      const data = {
        loaded,
        total,
        progress: total ? loaded / total : void 0,
        bytes: progressBytes,
        rate: rate ? rate : void 0,
        estimated: rate && total && inRange ? (total - loaded) / rate : void 0,
        event: e
      };
      data[isDownloadStream ? "download" : "upload"] = true;
      listener(data);
    };
  }
  var isXHRAdapterSupported = typeof XMLHttpRequest !== "undefined";
  var xhr_default = isXHRAdapterSupported && function(config) {
    return new Promise(function dispatchXhrRequest(resolve, reject) {
      let requestData = config.data;
      const requestHeaders = AxiosHeaders_default.from(config.headers).normalize();
      let { responseType, withXSRFToken } = config;
      let onCanceled;
      function done() {
        if (config.cancelToken) {
          config.cancelToken.unsubscribe(onCanceled);
        }
        if (config.signal) {
          config.signal.removeEventListener("abort", onCanceled);
        }
      }
      let contentType;
      if (utils_default.isFormData(requestData)) {
        if (platform_default.hasStandardBrowserEnv || platform_default.hasStandardBrowserWebWorkerEnv) {
          requestHeaders.setContentType(false);
        } else if ((contentType = requestHeaders.getContentType()) !== false) {
          const [type, ...tokens] = contentType ? contentType.split(";").map((token2) => token2.trim()).filter(Boolean) : [];
          requestHeaders.setContentType([type || "multipart/form-data", ...tokens].join("; "));
        }
      }
      let request = new XMLHttpRequest();
      if (config.auth) {
        const username = config.auth.username || "";
        const password = config.auth.password ? unescape(encodeURIComponent(config.auth.password)) : "";
        requestHeaders.set("Authorization", "Basic " + btoa(username + ":" + password));
      }
      const fullPath = buildFullPath(config.baseURL, config.url);
      request.open(config.method.toUpperCase(), buildURL(fullPath, config.params, config.paramsSerializer), true);
      request.timeout = config.timeout;
      function onloadend() {
        if (!request) {
          return;
        }
        const responseHeaders = AxiosHeaders_default.from(
          "getAllResponseHeaders" in request && request.getAllResponseHeaders()
        );
        const responseData = !responseType || responseType === "text" || responseType === "json" ? request.responseText : request.response;
        const response = {
          data: responseData,
          status: request.status,
          statusText: request.statusText,
          headers: responseHeaders,
          config,
          request
        };
        settle(function _resolve(value2) {
          resolve(value2);
          done();
        }, function _reject(err) {
          reject(err);
          done();
        }, response);
        request = null;
      }
      if ("onloadend" in request) {
        request.onloadend = onloadend;
      } else {
        request.onreadystatechange = function handleLoad() {
          if (!request || request.readyState !== 4) {
            return;
          }
          if (request.status === 0 && !(request.responseURL && request.responseURL.indexOf("file:") === 0)) {
            return;
          }
          setTimeout(onloadend);
        };
      }
      request.onabort = function handleAbort() {
        if (!request) {
          return;
        }
        reject(new AxiosError_default("Request aborted", AxiosError_default.ECONNABORTED, config, request));
        request = null;
      };
      request.onerror = function handleError() {
        reject(new AxiosError_default("Network Error", AxiosError_default.ERR_NETWORK, config, request));
        request = null;
      };
      request.ontimeout = function handleTimeout() {
        let timeoutErrorMessage = config.timeout ? "timeout of " + config.timeout + "ms exceeded" : "timeout exceeded";
        const transitional2 = config.transitional || transitional_default;
        if (config.timeoutErrorMessage) {
          timeoutErrorMessage = config.timeoutErrorMessage;
        }
        reject(new AxiosError_default(
          timeoutErrorMessage,
          transitional2.clarifyTimeoutError ? AxiosError_default.ETIMEDOUT : AxiosError_default.ECONNABORTED,
          config,
          request
        ));
        request = null;
      };
      if (platform_default.hasStandardBrowserEnv) {
        withXSRFToken && utils_default.isFunction(withXSRFToken) && (withXSRFToken = withXSRFToken(config));
        if (withXSRFToken || withXSRFToken !== false && isURLSameOrigin_default(fullPath)) {
          const xsrfValue = config.xsrfHeaderName && config.xsrfCookieName && cookies_default.read(config.xsrfCookieName);
          if (xsrfValue) {
            requestHeaders.set(config.xsrfHeaderName, xsrfValue);
          }
        }
      }
      requestData === void 0 && requestHeaders.setContentType(null);
      if ("setRequestHeader" in request) {
        utils_default.forEach(requestHeaders.toJSON(), function setRequestHeader(val, key) {
          request.setRequestHeader(key, val);
        });
      }
      if (!utils_default.isUndefined(config.withCredentials)) {
        request.withCredentials = !!config.withCredentials;
      }
      if (responseType && responseType !== "json") {
        request.responseType = config.responseType;
      }
      if (typeof config.onDownloadProgress === "function") {
        request.addEventListener("progress", progressEventReducer(config.onDownloadProgress, true));
      }
      if (typeof config.onUploadProgress === "function" && request.upload) {
        request.upload.addEventListener("progress", progressEventReducer(config.onUploadProgress));
      }
      if (config.cancelToken || config.signal) {
        onCanceled = (cancel) => {
          if (!request) {
            return;
          }
          reject(!cancel || cancel.type ? new CanceledError_default(null, config, request) : cancel);
          request.abort();
          request = null;
        };
        config.cancelToken && config.cancelToken.subscribe(onCanceled);
        if (config.signal) {
          config.signal.aborted ? onCanceled() : config.signal.addEventListener("abort", onCanceled);
        }
      }
      const protocol4 = parseProtocol(fullPath);
      if (protocol4 && platform_default.protocols.indexOf(protocol4) === -1) {
        reject(new AxiosError_default("Unsupported protocol " + protocol4 + ":", AxiosError_default.ERR_BAD_REQUEST, config));
        return;
      }
      request.send(requestData || null);
    });
  };

  // node_modules/axios/lib/adapters/adapters.js
  var knownAdapters = {
    http: null_default,
    xhr: xhr_default
  };
  utils_default.forEach(knownAdapters, (fn, value2) => {
    if (fn) {
      try {
        Object.defineProperty(fn, "name", { value: value2 });
      } catch (e) {
      }
      Object.defineProperty(fn, "adapterName", { value: value2 });
    }
  });
  var renderReason = (reason) => `- ${reason}`;
  var isResolvedHandle = (adapter) => utils_default.isFunction(adapter) || adapter === null || adapter === false;
  var adapters_default = {
    getAdapter: (adapters) => {
      adapters = utils_default.isArray(adapters) ? adapters : [adapters];
      const { length: length2 } = adapters;
      let nameOrAdapter;
      let adapter;
      const rejectedReasons = {};
      for (let i2 = 0; i2 < length2; i2++) {
        nameOrAdapter = adapters[i2];
        let id;
        adapter = nameOrAdapter;
        if (!isResolvedHandle(nameOrAdapter)) {
          adapter = knownAdapters[(id = String(nameOrAdapter)).toLowerCase()];
          if (adapter === void 0) {
            throw new AxiosError_default(`Unknown adapter '${id}'`);
          }
        }
        if (adapter) {
          break;
        }
        rejectedReasons[id || "#" + i2] = adapter;
      }
      if (!adapter) {
        const reasons = Object.entries(rejectedReasons).map(
          ([id, state]) => `adapter ${id} ` + (state === false ? "is not supported by the environment" : "is not available in the build")
        );
        let s = length2 ? reasons.length > 1 ? "since :\n" + reasons.map(renderReason).join("\n") : " " + renderReason(reasons[0]) : "as no adapter specified";
        throw new AxiosError_default(
          `There is no suitable adapter to dispatch the request ` + s,
          "ERR_NOT_SUPPORT"
        );
      }
      return adapter;
    },
    adapters: knownAdapters
  };

  // node_modules/axios/lib/core/dispatchRequest.js
  function throwIfCancellationRequested(config) {
    if (config.cancelToken) {
      config.cancelToken.throwIfRequested();
    }
    if (config.signal && config.signal.aborted) {
      throw new CanceledError_default(null, config);
    }
  }
  function dispatchRequest(config) {
    throwIfCancellationRequested(config);
    config.headers = AxiosHeaders_default.from(config.headers);
    config.data = transformData.call(
      config,
      config.transformRequest
    );
    if (["post", "put", "patch"].indexOf(config.method) !== -1) {
      config.headers.setContentType("application/x-www-form-urlencoded", false);
    }
    const adapter = adapters_default.getAdapter(config.adapter || defaults_default.adapter);
    return adapter(config).then(function onAdapterResolution(response) {
      throwIfCancellationRequested(config);
      response.data = transformData.call(
        config,
        config.transformResponse,
        response
      );
      response.headers = AxiosHeaders_default.from(response.headers);
      return response;
    }, function onAdapterRejection(reason) {
      if (!isCancel(reason)) {
        throwIfCancellationRequested(config);
        if (reason && reason.response) {
          reason.response.data = transformData.call(
            config,
            config.transformResponse,
            reason.response
          );
          reason.response.headers = AxiosHeaders_default.from(reason.response.headers);
        }
      }
      return Promise.reject(reason);
    });
  }

  // node_modules/axios/lib/core/mergeConfig.js
  var headersToObject = (thing) => thing instanceof AxiosHeaders_default ? thing.toJSON() : thing;
  function mergeConfig(config1, config2) {
    config2 = config2 || {};
    const config = {};
    function getMergedValue(target, source, caseless) {
      if (utils_default.isPlainObject(target) && utils_default.isPlainObject(source)) {
        return utils_default.merge.call({ caseless }, target, source);
      } else if (utils_default.isPlainObject(source)) {
        return utils_default.merge({}, source);
      } else if (utils_default.isArray(source)) {
        return source.slice();
      }
      return source;
    }
    function mergeDeepProperties(a, b, caseless) {
      if (!utils_default.isUndefined(b)) {
        return getMergedValue(a, b, caseless);
      } else if (!utils_default.isUndefined(a)) {
        return getMergedValue(void 0, a, caseless);
      }
    }
    function valueFromConfig2(a, b) {
      if (!utils_default.isUndefined(b)) {
        return getMergedValue(void 0, b);
      }
    }
    function defaultToConfig2(a, b) {
      if (!utils_default.isUndefined(b)) {
        return getMergedValue(void 0, b);
      } else if (!utils_default.isUndefined(a)) {
        return getMergedValue(void 0, a);
      }
    }
    function mergeDirectKeys(a, b, prop) {
      if (prop in config2) {
        return getMergedValue(a, b);
      } else if (prop in config1) {
        return getMergedValue(void 0, a);
      }
    }
    const mergeMap = {
      url: valueFromConfig2,
      method: valueFromConfig2,
      data: valueFromConfig2,
      baseURL: defaultToConfig2,
      transformRequest: defaultToConfig2,
      transformResponse: defaultToConfig2,
      paramsSerializer: defaultToConfig2,
      timeout: defaultToConfig2,
      timeoutMessage: defaultToConfig2,
      withCredentials: defaultToConfig2,
      withXSRFToken: defaultToConfig2,
      adapter: defaultToConfig2,
      responseType: defaultToConfig2,
      xsrfCookieName: defaultToConfig2,
      xsrfHeaderName: defaultToConfig2,
      onUploadProgress: defaultToConfig2,
      onDownloadProgress: defaultToConfig2,
      decompress: defaultToConfig2,
      maxContentLength: defaultToConfig2,
      maxBodyLength: defaultToConfig2,
      beforeRedirect: defaultToConfig2,
      transport: defaultToConfig2,
      httpAgent: defaultToConfig2,
      httpsAgent: defaultToConfig2,
      cancelToken: defaultToConfig2,
      socketPath: defaultToConfig2,
      responseEncoding: defaultToConfig2,
      validateStatus: mergeDirectKeys,
      headers: (a, b) => mergeDeepProperties(headersToObject(a), headersToObject(b), true)
    };
    utils_default.forEach(Object.keys(Object.assign({}, config1, config2)), function computeConfigValue(prop) {
      const merge2 = mergeMap[prop] || mergeDeepProperties;
      const configValue = merge2(config1[prop], config2[prop], prop);
      utils_default.isUndefined(configValue) && merge2 !== mergeDirectKeys || (config[prop] = configValue);
    });
    return config;
  }

  // node_modules/axios/lib/env/data.js
  var VERSION = "1.6.2";

  // node_modules/axios/lib/helpers/validator.js
  var validators = {};
  ["object", "boolean", "number", "function", "string", "symbol"].forEach((type, i2) => {
    validators[type] = function validator(thing) {
      return typeof thing === type || "a" + (i2 < 1 ? "n " : " ") + type;
    };
  });
  var deprecatedWarnings = {};
  validators.transitional = function transitional(validator, version, message) {
    function formatMessage(opt, desc) {
      return "[Axios v" + VERSION + "] Transitional option '" + opt + "'" + desc + (message ? ". " + message : "");
    }
    return (value2, opt, opts) => {
      if (validator === false) {
        throw new AxiosError_default(
          formatMessage(opt, " has been removed" + (version ? " in " + version : "")),
          AxiosError_default.ERR_DEPRECATED
        );
      }
      if (version && !deprecatedWarnings[opt]) {
        deprecatedWarnings[opt] = true;
        console.warn(
          formatMessage(
            opt,
            " has been deprecated since v" + version + " and will be removed in the near future"
          )
        );
      }
      return validator ? validator(value2, opt, opts) : true;
    };
  };
  function assertOptions(options, schema, allowUnknown) {
    if (typeof options !== "object") {
      throw new AxiosError_default("options must be an object", AxiosError_default.ERR_BAD_OPTION_VALUE);
    }
    const keys = Object.keys(options);
    let i2 = keys.length;
    while (i2-- > 0) {
      const opt = keys[i2];
      const validator = schema[opt];
      if (validator) {
        const value2 = options[opt];
        const result = value2 === void 0 || validator(value2, opt, options);
        if (result !== true) {
          throw new AxiosError_default("option " + opt + " must be " + result, AxiosError_default.ERR_BAD_OPTION_VALUE);
        }
        continue;
      }
      if (allowUnknown !== true) {
        throw new AxiosError_default("Unknown option " + opt, AxiosError_default.ERR_BAD_OPTION);
      }
    }
  }
  var validator_default = {
    assertOptions,
    validators
  };

  // node_modules/axios/lib/core/Axios.js
  var validators2 = validator_default.validators;
  var Axios = class {
    constructor(instanceConfig) {
      this.defaults = instanceConfig;
      this.interceptors = {
        request: new InterceptorManager_default(),
        response: new InterceptorManager_default()
      };
    }
    request(configOrUrl, config) {
      if (typeof configOrUrl === "string") {
        config = config || {};
        config.url = configOrUrl;
      } else {
        config = configOrUrl || {};
      }
      config = mergeConfig(this.defaults, config);
      const { transitional: transitional2, paramsSerializer, headers } = config;
      if (transitional2 !== void 0) {
        validator_default.assertOptions(transitional2, {
          silentJSONParsing: validators2.transitional(validators2.boolean),
          forcedJSONParsing: validators2.transitional(validators2.boolean),
          clarifyTimeoutError: validators2.transitional(validators2.boolean)
        }, false);
      }
      if (paramsSerializer != null) {
        if (utils_default.isFunction(paramsSerializer)) {
          config.paramsSerializer = {
            serialize: paramsSerializer
          };
        } else {
          validator_default.assertOptions(paramsSerializer, {
            encode: validators2.function,
            serialize: validators2.function
          }, true);
        }
      }
      config.method = (config.method || this.defaults.method || "get").toLowerCase();
      let contextHeaders = headers && utils_default.merge(
        headers.common,
        headers[config.method]
      );
      headers && utils_default.forEach(
        ["delete", "get", "head", "post", "put", "patch", "common"],
        (method) => {
          delete headers[method];
        }
      );
      config.headers = AxiosHeaders_default.concat(contextHeaders, headers);
      const requestInterceptorChain = [];
      let synchronousRequestInterceptors = true;
      this.interceptors.request.forEach(function unshiftRequestInterceptors(interceptor) {
        if (typeof interceptor.runWhen === "function" && interceptor.runWhen(config) === false) {
          return;
        }
        synchronousRequestInterceptors = synchronousRequestInterceptors && interceptor.synchronous;
        requestInterceptorChain.unshift(interceptor.fulfilled, interceptor.rejected);
      });
      const responseInterceptorChain = [];
      this.interceptors.response.forEach(function pushResponseInterceptors(interceptor) {
        responseInterceptorChain.push(interceptor.fulfilled, interceptor.rejected);
      });
      let promise;
      let i2 = 0;
      let len;
      if (!synchronousRequestInterceptors) {
        const chain = [dispatchRequest.bind(this), void 0];
        chain.unshift.apply(chain, requestInterceptorChain);
        chain.push.apply(chain, responseInterceptorChain);
        len = chain.length;
        promise = Promise.resolve(config);
        while (i2 < len) {
          promise = promise.then(chain[i2++], chain[i2++]);
        }
        return promise;
      }
      len = requestInterceptorChain.length;
      let newConfig = config;
      i2 = 0;
      while (i2 < len) {
        const onFulfilled = requestInterceptorChain[i2++];
        const onRejected = requestInterceptorChain[i2++];
        try {
          newConfig = onFulfilled(newConfig);
        } catch (error) {
          onRejected.call(this, error);
          break;
        }
      }
      try {
        promise = dispatchRequest.call(this, newConfig);
      } catch (error) {
        return Promise.reject(error);
      }
      i2 = 0;
      len = responseInterceptorChain.length;
      while (i2 < len) {
        promise = promise.then(responseInterceptorChain[i2++], responseInterceptorChain[i2++]);
      }
      return promise;
    }
    getUri(config) {
      config = mergeConfig(this.defaults, config);
      const fullPath = buildFullPath(config.baseURL, config.url);
      return buildURL(fullPath, config.params, config.paramsSerializer);
    }
  };
  utils_default.forEach(["delete", "get", "head", "options"], function forEachMethodNoData(method) {
    Axios.prototype[method] = function(url3, config) {
      return this.request(mergeConfig(config || {}, {
        method,
        url: url3,
        data: (config || {}).data
      }));
    };
  });
  utils_default.forEach(["post", "put", "patch"], function forEachMethodWithData(method) {
    function generateHTTPMethod(isForm) {
      return function httpMethod(url3, data, config) {
        return this.request(mergeConfig(config || {}, {
          method,
          headers: isForm ? {
            "Content-Type": "multipart/form-data"
          } : {},
          url: url3,
          data
        }));
      };
    }
    Axios.prototype[method] = generateHTTPMethod();
    Axios.prototype[method + "Form"] = generateHTTPMethod(true);
  });
  var Axios_default = Axios;

  // node_modules/axios/lib/cancel/CancelToken.js
  var CancelToken = class {
    constructor(executor) {
      if (typeof executor !== "function") {
        throw new TypeError("executor must be a function.");
      }
      let resolvePromise;
      this.promise = new Promise(function promiseExecutor(resolve) {
        resolvePromise = resolve;
      });
      const token2 = this;
      this.promise.then((cancel) => {
        if (!token2._listeners)
          return;
        let i2 = token2._listeners.length;
        while (i2-- > 0) {
          token2._listeners[i2](cancel);
        }
        token2._listeners = null;
      });
      this.promise.then = (onfulfilled) => {
        let _resolve;
        const promise = new Promise((resolve) => {
          token2.subscribe(resolve);
          _resolve = resolve;
        }).then(onfulfilled);
        promise.cancel = function reject() {
          token2.unsubscribe(_resolve);
        };
        return promise;
      };
      executor(function cancel(message, config, request) {
        if (token2.reason) {
          return;
        }
        token2.reason = new CanceledError_default(message, config, request);
        resolvePromise(token2.reason);
      });
    }
    throwIfRequested() {
      if (this.reason) {
        throw this.reason;
      }
    }
    subscribe(listener) {
      if (this.reason) {
        listener(this.reason);
        return;
      }
      if (this._listeners) {
        this._listeners.push(listener);
      } else {
        this._listeners = [listener];
      }
    }
    unsubscribe(listener) {
      if (!this._listeners) {
        return;
      }
      const index = this._listeners.indexOf(listener);
      if (index !== -1) {
        this._listeners.splice(index, 1);
      }
    }
    static source() {
      let cancel;
      const token2 = new CancelToken(function executor(c) {
        cancel = c;
      });
      return {
        token: token2,
        cancel
      };
    }
  };
  var CancelToken_default = CancelToken;

  // node_modules/axios/lib/helpers/spread.js
  function spread(callback) {
    return function wrap(arr) {
      return callback.apply(null, arr);
    };
  }

  // node_modules/axios/lib/helpers/isAxiosError.js
  function isAxiosError(payload) {
    return utils_default.isObject(payload) && payload.isAxiosError === true;
  }

  // node_modules/axios/lib/helpers/HttpStatusCode.js
  var HttpStatusCode = {
    Continue: 100,
    SwitchingProtocols: 101,
    Processing: 102,
    EarlyHints: 103,
    Ok: 200,
    Created: 201,
    Accepted: 202,
    NonAuthoritativeInformation: 203,
    NoContent: 204,
    ResetContent: 205,
    PartialContent: 206,
    MultiStatus: 207,
    AlreadyReported: 208,
    ImUsed: 226,
    MultipleChoices: 300,
    MovedPermanently: 301,
    Found: 302,
    SeeOther: 303,
    NotModified: 304,
    UseProxy: 305,
    Unused: 306,
    TemporaryRedirect: 307,
    PermanentRedirect: 308,
    BadRequest: 400,
    Unauthorized: 401,
    PaymentRequired: 402,
    Forbidden: 403,
    NotFound: 404,
    MethodNotAllowed: 405,
    NotAcceptable: 406,
    ProxyAuthenticationRequired: 407,
    RequestTimeout: 408,
    Conflict: 409,
    Gone: 410,
    LengthRequired: 411,
    PreconditionFailed: 412,
    PayloadTooLarge: 413,
    UriTooLong: 414,
    UnsupportedMediaType: 415,
    RangeNotSatisfiable: 416,
    ExpectationFailed: 417,
    ImATeapot: 418,
    MisdirectedRequest: 421,
    UnprocessableEntity: 422,
    Locked: 423,
    FailedDependency: 424,
    TooEarly: 425,
    UpgradeRequired: 426,
    PreconditionRequired: 428,
    TooManyRequests: 429,
    RequestHeaderFieldsTooLarge: 431,
    UnavailableForLegalReasons: 451,
    InternalServerError: 500,
    NotImplemented: 501,
    BadGateway: 502,
    ServiceUnavailable: 503,
    GatewayTimeout: 504,
    HttpVersionNotSupported: 505,
    VariantAlsoNegotiates: 506,
    InsufficientStorage: 507,
    LoopDetected: 508,
    NotExtended: 510,
    NetworkAuthenticationRequired: 511
  };
  Object.entries(HttpStatusCode).forEach(([key, value2]) => {
    HttpStatusCode[value2] = key;
  });
  var HttpStatusCode_default = HttpStatusCode;

  // node_modules/axios/lib/axios.js
  function createInstance(defaultConfig) {
    const context = new Axios_default(defaultConfig);
    const instance = bind(Axios_default.prototype.request, context);
    utils_default.extend(instance, Axios_default.prototype, context, { allOwnKeys: true });
    utils_default.extend(instance, context, null, { allOwnKeys: true });
    instance.create = function create(instanceConfig) {
      return createInstance(mergeConfig(defaultConfig, instanceConfig));
    };
    return instance;
  }
  var axios = createInstance(defaults_default);
  axios.Axios = Axios_default;
  axios.CanceledError = CanceledError_default;
  axios.CancelToken = CancelToken_default;
  axios.isCancel = isCancel;
  axios.VERSION = VERSION;
  axios.toFormData = toFormData_default;
  axios.AxiosError = AxiosError_default;
  axios.Cancel = axios.CanceledError;
  axios.all = function all(promises) {
    return Promise.all(promises);
  };
  axios.spread = spread;
  axios.isAxiosError = isAxiosError;
  axios.mergeConfig = mergeConfig;
  axios.AxiosHeaders = AxiosHeaders_default;
  axios.formToJSON = (thing) => formDataToJSON_default(utils_default.isHTMLForm(thing) ? new FormData(thing) : thing);
  axios.getAdapter = adapters_default.getAdapter;
  axios.HttpStatusCode = HttpStatusCode_default;
  axios.default = axios;
  var axios_default = axios;

  // node_modules/axios/index.js
  var {
    Axios: Axios2,
    AxiosError: AxiosError2,
    CanceledError: CanceledError2,
    isCancel: isCancel2,
    CancelToken: CancelToken2,
    VERSION: VERSION2,
    all: all2,
    Cancel,
    isAxiosError: isAxiosError2,
    spread: spread2,
    toFormData: toFormData2,
    AxiosHeaders: AxiosHeaders2,
    HttpStatusCode: HttpStatusCode2,
    formToJSON,
    getAdapter,
    mergeConfig: mergeConfig2
  } = axios_default;

  // src-bex/TimeReview.ts
  var import_lodash = __toESM(require_lodash());
  var import_moment = __toESM(require_moment());

  // node_modules/query-string/base.js
  var base_exports = {};
  __export(base_exports, {
    exclude: () => exclude,
    extract: () => extract,
    parse: () => parse,
    parseUrl: () => parseUrl,
    pick: () => pick,
    stringify: () => stringify,
    stringifyUrl: () => stringifyUrl
  });

  // node_modules/decode-uri-component/index.js
  var token = "%[a-f0-9]{2}";
  var singleMatcher = new RegExp("(" + token + ")|([^%]+?)", "gi");
  var multiMatcher = new RegExp("(" + token + ")+", "gi");
  function decodeComponents(components, split) {
    try {
      return [decodeURIComponent(components.join(""))];
    } catch {
    }
    if (components.length === 1) {
      return components;
    }
    split = split || 1;
    const left = components.slice(0, split);
    const right = components.slice(split);
    return Array.prototype.concat.call([], decodeComponents(left), decodeComponents(right));
  }
  function decode(input2) {
    try {
      return decodeURIComponent(input2);
    } catch {
      let tokens = input2.match(singleMatcher) || [];
      for (let i2 = 1; i2 < tokens.length; i2++) {
        input2 = decodeComponents(tokens, i2).join("");
        tokens = input2.match(singleMatcher) || [];
      }
      return input2;
    }
  }
  function customDecodeURIComponent(input2) {
    const replaceMap = {
      "%FE%FF": "\uFFFD\uFFFD",
      "%FF%FE": "\uFFFD\uFFFD"
    };
    let match = multiMatcher.exec(input2);
    while (match) {
      try {
        replaceMap[match[0]] = decodeURIComponent(match[0]);
      } catch {
        const result = decode(match[0]);
        if (result !== match[0]) {
          replaceMap[match[0]] = result;
        }
      }
      match = multiMatcher.exec(input2);
    }
    replaceMap["%C2"] = "\uFFFD";
    const entries = Object.keys(replaceMap);
    for (const key of entries) {
      input2 = input2.replace(new RegExp(key, "g"), replaceMap[key]);
    }
    return input2;
  }
  function decodeUriComponent(encodedURI) {
    if (typeof encodedURI !== "string") {
      throw new TypeError("Expected `encodedURI` to be of type `string`, got `" + typeof encodedURI + "`");
    }
    try {
      return decodeURIComponent(encodedURI);
    } catch {
      return customDecodeURIComponent(encodedURI);
    }
  }

  // node_modules/split-on-first/index.js
  function splitOnFirst(string, separator) {
    if (!(typeof string === "string" && typeof separator === "string")) {
      throw new TypeError("Expected the arguments to be of type `string`");
    }
    if (string === "" || separator === "") {
      return [];
    }
    const separatorIndex = string.indexOf(separator);
    if (separatorIndex === -1) {
      return [];
    }
    return [
      string.slice(0, separatorIndex),
      string.slice(separatorIndex + separator.length)
    ];
  }

  // node_modules/filter-obj/index.js
  function includeKeys(object, predicate) {
    const result = {};
    if (Array.isArray(predicate)) {
      for (const key of predicate) {
        const descriptor = Object.getOwnPropertyDescriptor(object, key);
        if (descriptor == null ? void 0 : descriptor.enumerable) {
          Object.defineProperty(result, key, descriptor);
        }
      }
    } else {
      for (const key of Reflect.ownKeys(object)) {
        const descriptor = Object.getOwnPropertyDescriptor(object, key);
        if (descriptor.enumerable) {
          const value2 = object[key];
          if (predicate(key, value2, object)) {
            Object.defineProperty(result, key, descriptor);
          }
        }
      }
    }
    return result;
  }

  // node_modules/query-string/base.js
  var isNullOrUndefined = (value2) => value2 === null || value2 === void 0;
  var strictUriEncode = (string) => encodeURIComponent(string).replace(/[!'()*]/g, (x) => `%${x.charCodeAt(0).toString(16).toUpperCase()}`);
  var encodeFragmentIdentifier = Symbol("encodeFragmentIdentifier");
  function encoderForArrayFormat(options) {
    switch (options.arrayFormat) {
      case "index": {
        return (key) => (result, value2) => {
          const index = result.length;
          if (value2 === void 0 || options.skipNull && value2 === null || options.skipEmptyString && value2 === "") {
            return result;
          }
          if (value2 === null) {
            return [
              ...result,
              [encode3(key, options), "[", index, "]"].join("")
            ];
          }
          return [
            ...result,
            [encode3(key, options), "[", encode3(index, options), "]=", encode3(value2, options)].join("")
          ];
        };
      }
      case "bracket": {
        return (key) => (result, value2) => {
          if (value2 === void 0 || options.skipNull && value2 === null || options.skipEmptyString && value2 === "") {
            return result;
          }
          if (value2 === null) {
            return [
              ...result,
              [encode3(key, options), "[]"].join("")
            ];
          }
          return [
            ...result,
            [encode3(key, options), "[]=", encode3(value2, options)].join("")
          ];
        };
      }
      case "colon-list-separator": {
        return (key) => (result, value2) => {
          if (value2 === void 0 || options.skipNull && value2 === null || options.skipEmptyString && value2 === "") {
            return result;
          }
          if (value2 === null) {
            return [
              ...result,
              [encode3(key, options), ":list="].join("")
            ];
          }
          return [
            ...result,
            [encode3(key, options), ":list=", encode3(value2, options)].join("")
          ];
        };
      }
      case "comma":
      case "separator":
      case "bracket-separator": {
        const keyValueSep = options.arrayFormat === "bracket-separator" ? "[]=" : "=";
        return (key) => (result, value2) => {
          if (value2 === void 0 || options.skipNull && value2 === null || options.skipEmptyString && value2 === "") {
            return result;
          }
          value2 = value2 === null ? "" : value2;
          if (result.length === 0) {
            return [[encode3(key, options), keyValueSep, encode3(value2, options)].join("")];
          }
          return [[result, encode3(value2, options)].join(options.arrayFormatSeparator)];
        };
      }
      default: {
        return (key) => (result, value2) => {
          if (value2 === void 0 || options.skipNull && value2 === null || options.skipEmptyString && value2 === "") {
            return result;
          }
          if (value2 === null) {
            return [
              ...result,
              encode3(key, options)
            ];
          }
          return [
            ...result,
            [encode3(key, options), "=", encode3(value2, options)].join("")
          ];
        };
      }
    }
  }
  function parserForArrayFormat(options) {
    let result;
    switch (options.arrayFormat) {
      case "index": {
        return (key, value2, accumulator) => {
          result = /\[(\d*)]$/.exec(key);
          key = key.replace(/\[\d*]$/, "");
          if (!result) {
            accumulator[key] = value2;
            return;
          }
          if (accumulator[key] === void 0) {
            accumulator[key] = {};
          }
          accumulator[key][result[1]] = value2;
        };
      }
      case "bracket": {
        return (key, value2, accumulator) => {
          result = /(\[])$/.exec(key);
          key = key.replace(/\[]$/, "");
          if (!result) {
            accumulator[key] = value2;
            return;
          }
          if (accumulator[key] === void 0) {
            accumulator[key] = [value2];
            return;
          }
          accumulator[key] = [...accumulator[key], value2];
        };
      }
      case "colon-list-separator": {
        return (key, value2, accumulator) => {
          result = /(:list)$/.exec(key);
          key = key.replace(/:list$/, "");
          if (!result) {
            accumulator[key] = value2;
            return;
          }
          if (accumulator[key] === void 0) {
            accumulator[key] = [value2];
            return;
          }
          accumulator[key] = [...accumulator[key], value2];
        };
      }
      case "comma":
      case "separator": {
        return (key, value2, accumulator) => {
          const isArray2 = typeof value2 === "string" && value2.includes(options.arrayFormatSeparator);
          const isEncodedArray = typeof value2 === "string" && !isArray2 && decode2(value2, options).includes(options.arrayFormatSeparator);
          value2 = isEncodedArray ? decode2(value2, options) : value2;
          const newValue = isArray2 || isEncodedArray ? value2.split(options.arrayFormatSeparator).map((item) => decode2(item, options)) : value2 === null ? value2 : decode2(value2, options);
          accumulator[key] = newValue;
        };
      }
      case "bracket-separator": {
        return (key, value2, accumulator) => {
          const isArray2 = /(\[])$/.test(key);
          key = key.replace(/\[]$/, "");
          if (!isArray2) {
            accumulator[key] = value2 ? decode2(value2, options) : value2;
            return;
          }
          const arrayValue = value2 === null ? [] : value2.split(options.arrayFormatSeparator).map((item) => decode2(item, options));
          if (accumulator[key] === void 0) {
            accumulator[key] = arrayValue;
            return;
          }
          accumulator[key] = [...accumulator[key], ...arrayValue];
        };
      }
      default: {
        return (key, value2, accumulator) => {
          if (accumulator[key] === void 0) {
            accumulator[key] = value2;
            return;
          }
          accumulator[key] = [...[accumulator[key]].flat(), value2];
        };
      }
    }
  }
  function validateArrayFormatSeparator(value2) {
    if (typeof value2 !== "string" || value2.length !== 1) {
      throw new TypeError("arrayFormatSeparator must be single character string");
    }
  }
  function encode3(value2, options) {
    if (options.encode) {
      return options.strict ? strictUriEncode(value2) : encodeURIComponent(value2);
    }
    return value2;
  }
  function decode2(value2, options) {
    if (options.decode) {
      return decodeUriComponent(value2);
    }
    return value2;
  }
  function keysSorter(input2) {
    if (Array.isArray(input2)) {
      return input2.sort();
    }
    if (typeof input2 === "object") {
      return keysSorter(Object.keys(input2)).sort((a, b) => Number(a) - Number(b)).map((key) => input2[key]);
    }
    return input2;
  }
  function removeHash(input2) {
    const hashStart = input2.indexOf("#");
    if (hashStart !== -1) {
      input2 = input2.slice(0, hashStart);
    }
    return input2;
  }
  function getHash(url3) {
    let hash = "";
    const hashStart = url3.indexOf("#");
    if (hashStart !== -1) {
      hash = url3.slice(hashStart);
    }
    return hash;
  }
  function parseValue(value2, options) {
    if (options.parseNumbers && !Number.isNaN(Number(value2)) && (typeof value2 === "string" && value2.trim() !== "")) {
      value2 = Number(value2);
    } else if (options.parseBooleans && value2 !== null && (value2.toLowerCase() === "true" || value2.toLowerCase() === "false")) {
      value2 = value2.toLowerCase() === "true";
    }
    return value2;
  }
  function extract(input2) {
    input2 = removeHash(input2);
    const queryStart = input2.indexOf("?");
    if (queryStart === -1) {
      return "";
    }
    return input2.slice(queryStart + 1);
  }
  function parse(query, options) {
    options = {
      decode: true,
      sort: true,
      arrayFormat: "none",
      arrayFormatSeparator: ",",
      parseNumbers: false,
      parseBooleans: false,
      ...options
    };
    validateArrayFormatSeparator(options.arrayFormatSeparator);
    const formatter = parserForArrayFormat(options);
    const returnValue = /* @__PURE__ */ Object.create(null);
    if (typeof query !== "string") {
      return returnValue;
    }
    query = query.trim().replace(/^[?#&]/, "");
    if (!query) {
      return returnValue;
    }
    for (const parameter of query.split("&")) {
      if (parameter === "") {
        continue;
      }
      const parameter_ = options.decode ? parameter.replace(/\+/g, " ") : parameter;
      let [key, value2] = splitOnFirst(parameter_, "=");
      if (key === void 0) {
        key = parameter_;
      }
      value2 = value2 === void 0 ? null : ["comma", "separator", "bracket-separator"].includes(options.arrayFormat) ? value2 : decode2(value2, options);
      formatter(decode2(key, options), value2, returnValue);
    }
    for (const [key, value2] of Object.entries(returnValue)) {
      if (typeof value2 === "object" && value2 !== null) {
        for (const [key2, value22] of Object.entries(value2)) {
          value2[key2] = parseValue(value22, options);
        }
      } else {
        returnValue[key] = parseValue(value2, options);
      }
    }
    if (options.sort === false) {
      return returnValue;
    }
    return (options.sort === true ? Object.keys(returnValue).sort() : Object.keys(returnValue).sort(options.sort)).reduce((result, key) => {
      const value2 = returnValue[key];
      if (Boolean(value2) && typeof value2 === "object" && !Array.isArray(value2)) {
        result[key] = keysSorter(value2);
      } else {
        result[key] = value2;
      }
      return result;
    }, /* @__PURE__ */ Object.create(null));
  }
  function stringify(object, options) {
    if (!object) {
      return "";
    }
    options = {
      encode: true,
      strict: true,
      arrayFormat: "none",
      arrayFormatSeparator: ",",
      ...options
    };
    validateArrayFormatSeparator(options.arrayFormatSeparator);
    const shouldFilter = (key) => options.skipNull && isNullOrUndefined(object[key]) || options.skipEmptyString && object[key] === "";
    const formatter = encoderForArrayFormat(options);
    const objectCopy = {};
    for (const [key, value2] of Object.entries(object)) {
      if (!shouldFilter(key)) {
        objectCopy[key] = value2;
      }
    }
    const keys = Object.keys(objectCopy);
    if (options.sort !== false) {
      keys.sort(options.sort);
    }
    return keys.map((key) => {
      const value2 = object[key];
      if (value2 === void 0) {
        return "";
      }
      if (value2 === null) {
        return encode3(key, options);
      }
      if (Array.isArray(value2)) {
        if (value2.length === 0 && options.arrayFormat === "bracket-separator") {
          return encode3(key, options) + "[]";
        }
        return value2.reduce(formatter(key), []).join("&");
      }
      return encode3(key, options) + "=" + encode3(value2, options);
    }).filter((x) => x.length > 0).join("&");
  }
  function parseUrl(url3, options) {
    var _a, _b;
    options = {
      decode: true,
      ...options
    };
    let [url_, hash] = splitOnFirst(url3, "#");
    if (url_ === void 0) {
      url_ = url3;
    }
    return {
      url: (_b = (_a = url_ == null ? void 0 : url_.split("?")) == null ? void 0 : _a[0]) != null ? _b : "",
      query: parse(extract(url3), options),
      ...options && options.parseFragmentIdentifier && hash ? { fragmentIdentifier: decode2(hash, options) } : {}
    };
  }
  function stringifyUrl(object, options) {
    options = {
      encode: true,
      strict: true,
      [encodeFragmentIdentifier]: true,
      ...options
    };
    const url3 = removeHash(object.url).split("?")[0] || "";
    const queryFromUrl = extract(object.url);
    const query = {
      ...parse(queryFromUrl, { sort: false }),
      ...object.query
    };
    let queryString = stringify(query, options);
    if (queryString) {
      queryString = `?${queryString}`;
    }
    let hash = getHash(object.url);
    if (object.fragmentIdentifier) {
      const urlObjectForFragmentEncode = new URL(url3);
      urlObjectForFragmentEncode.hash = object.fragmentIdentifier;
      hash = options[encodeFragmentIdentifier] ? urlObjectForFragmentEncode.hash : `#${object.fragmentIdentifier}`;
    }
    return `${url3}${queryString}${hash}`;
  }
  function pick(input2, filter2, options) {
    options = {
      parseFragmentIdentifier: true,
      [encodeFragmentIdentifier]: false,
      ...options
    };
    const { url: url3, query, fragmentIdentifier } = parseUrl(input2, options);
    return stringifyUrl({
      url: url3,
      query: includeKeys(query, filter2),
      fragmentIdentifier
    }, options);
  }
  function exclude(input2, filter2, options) {
    const exclusionFilter = Array.isArray(filter2) ? (key) => !filter2.includes(key) : (key, value2) => !filter2(key, value2);
    return pick(input2, exclusionFilter, options);
  }

  // node_modules/query-string/index.js
  var query_string_default = base_exports;

  // src-bex/TimeReview.ts
  var _TimeReview = class {
    constructor(params) {
      __publicField(this, "currActionKey");
      __publicField(this, "lastActionKey");
      __publicField(this, "lastActionTime");
      __publicField(this, "waitSendItem");
      __publicField(this, "delayData");
      __publicField(this, "lastSendTime");
      __publicField(this, "timestamp");
      __publicField(this, "lastSendKey");
      __publicField(this, "indexTimestamp");
      __publicField(this, "DB_PRECISION", 6);
      __publicField(this, "hasInit", false);
      __publicField(this, "isActive", false);
      __publicField(this, "token", null);
      __publicField(this, "apikey", null);
      __publicField(this, "type");
      __publicField(this, "baseURL", "https://api.todo6.com");
      __publicField(this, "throttledCheckSend");
      __publicField(this, "validateRes");
      this.currActionKey = "";
      this.lastActionKey = "";
      this.lastActionTime = 0;
      this.waitSendItem = null;
      this.delayData = {};
      this.lastSendTime = 0;
      this.lastSendKey = "";
      this.type = params.type || this.getType();
      this.baseURL = params.baseURL;
      this.token = params.token || null;
      this.apikey = params.apikey || null;
      this.throttledCheckSend = import_lodash.default.throttle(this.doCheckSend, 2e3);
      axios_default.defaults.baseURL = this.baseURL;
      this.initData();
      this.initEvent();
      this.sendLostCacheAction();
      this.startInterval();
    }
    async initEvent() {
      // 创建一个每分钟触发一次的定时器
      chrome.alarms.create('AlarmKeepAwake', { periodInMinutes: 1 });

      // 监听定时器触发的事件
      chrome.alarms.onAlarm.addListener(function(alarm) {
        if (alarm.name === 'AlarmKeepAwake') {
          console.log('KeepAwake Alarm triggered, executing task.');
          // 在这里执行你的爬虫任务
        }
      });
    }
    async initData() {
      if (!this.token && !this.apikey) {
        this.isActive = false;
        this.hasInit = false;
        return;
      }
      if (this.hasInit)
        return;
      this.isActive = true;
      if (this.token)
        axios_default.defaults.headers["Authorization"] = this.token;
      if (this.apikey)
        axios_default.defaults.headers["X-API-Key"] = this.apikey;
      let res;
      if (typeof window !== "undefined")
        res = await axios_default.get("/app/todo/action/config", { params: { type: this.type } }).then((r) => r.data).catch((e) => {
          var _a;
          return { error: true, ...(_a = e.response) == null ? void 0 : _a.data };
        });
      else {
        let headers = { Authorization: this.token, "X-API-Key": this.apikey };
        let response = await fetch(this.baseURL + `/app/todo/action/config?type=${encodeURIComponent(this.type)}`, { headers });
        res = await response.json();
        if (!response.ok)
          res = { error: true, ...res };
      }
      if (res == null ? void 0 : res.error)
        return res;
      let { index, precision, token: tokenNew } = res.data;
      this.indexTimestamp = index, this.DB_PRECISION = precision || this.DB_PRECISION;
      this.hasInit = true;
      console.log("initData:", res, tokenNew);
    }
    setToken(token2) {
      this.token = token2;
      this.initData();
    }
    setApikey(apikey) {
      this.apikey = apikey;
      this.initData();
    }
    startInterval() {
      setInterval(() => {
        if (!this.isActive)
          return;
        this.dowichSend();
      }, 6e4);
    }
    async sendLostCacheAction() {
      let actionData;
      if (typeof window !== "undefined")
        actionData = localStorage.action;
      if (!actionData)
        return;
      let action2 = JSON.parse(actionData);
      let data = await this.httpSend(action2);
      console.log("\u53D1\u9001\u7F13\u5B58\u4E2D\u672A\u53D1\u9001\u7684\u6570\u636E res:", data);
      if (data && data.code == 1e3) {
        if (typeof window !== "undefined")
          delete localStorage.action;
      }
    }
    async addAction(action2) {
      let { path, title: title2 } = action2;
      this.currActionKey = path;
      let lastItem = this.delayData[this.currActionKey];
      if (this.currActionKey == this.lastActionKey && lastItem) {
        action2.duration = lastItem.duration + (new Date().getTime() - lastItem.timestamp);
      }
      this.delayData[this.currActionKey] = action2;
      this.lastActionKey = this.currActionKey;
      this.lastActionTime = action2.timestamp;
    }
    async dowichSend() {
      if (!this.delayData || import_lodash.default.isEmpty(this.delayData)) {
        this.doCheckSend(null, null);
        return;
      }
      let actions = import_lodash.default.sortBy(import_lodash.default.values(this.delayData), "duration");
      let senddata = actions.pop();
      let item = senddata;
      item.path = this.filterQueryURL(item.path);
      let isNew = !this.lastSendKey || this.lastSendKey != item.path;
      if (isNew)
        this.timestamp = new Date().getTime() - 60 * 1e3;
      item.duration = Math.round((new Date().getTime() - this.timestamp) / 1e3 / 60);
      let timeTemp = (0, import_moment.default)(this.timestamp).format("YYYY-MM-DD HH:mm:00");
      item.createTime = (0, import_moment.default)(timeTemp).add(this.indexTimestamp, "ms").format("YYYY-MM-DD HH:mm:ss.SSS");
      await this.doCheckSend(item, { actions, senddata });
      this.delayData = {};
      this.lastSendTime = this.lastActionTime;
      this.lastSendKey = item.path;
    }
    async doCheckSend(item, justShow) {
      var _a, _b;
      if (!item && !this.waitSendItem)
        return;
      if (typeof window !== "undefined") {
        if (item)
          window.localStorage.action = JSON.stringify(item);
        else
          delete window.localStorage.action;
      }
      if (!this.waitSendItem) {
        this.waitSendItem = item;
        return;
      }
      if (item && this.waitSendItem.createTime == (item == null ? void 0 : item.createTime)) {
        this.waitSendItem = item;
        return;
      }
      let today = (0, import_moment.default)().format("YYYY-MM-DD");
      if (!((_a = this.waitSendItem.createTime) == null ? void 0 : _a.includes(today))) {
        let createTime = this.waitSendItem.createTime;
        let endOfDay = (0, import_moment.default)(this.waitSendItem.createTime).endOf("day");
        let durationToEndOfDay = import_moment.default.duration(endOfDay.diff((0, import_moment.default)(this.waitSendItem.createTime))).asMinutes();
        let durationFromStartOfDay = this.waitSendItem.duration - durationToEndOfDay;
        this.waitSendItem.duration = durationToEndOfDay;
        await this.httpSend(this.waitSendItem);
        this.waitSendItem.createTime = today + " 00:00:00" + ((_b = this.waitSendItem.createTime) == null ? void 0 : _b.substr(19));
        this.waitSendItem.duration = (0, import_moment.default)(createTime).hours() * 60 + (0, import_moment.default)(createTime).minute();
        if (Math.abs(durationFromStartOfDay - (durationToEndOfDay + this.waitSendItem.duration)) > 2) {
          console.error("\u8DE8\u65E5\u6570\u636E\u5F02\u5E38", durationFromStartOfDay, durationToEndOfDay, this.waitSendItem.duration);
        }
        await this.httpSend(this.waitSendItem);
      } else {
        await this.httpSend(this.waitSendItem);
      }
      console.log("send res:", { sending: this.waitSendItem, waiting: item, ...justShow });
      if (!item) {
        this.lastActionKey = "";
        this.lastSendKey = "";
        this.delayData = {};
        this.timestamp = 0;
      }
      this.waitSendItem = null;
    }
    async doSendBeforeClose() {
      if (!this.isActive)
        return;
      this.throttledCheckSend(null, null);
    }
    async validate() {
      if (this.validateRes && !this.validateRes.error)
        return this.validateRes;
      let res;
      let headers = { Authorization: this.token, "X-API-Key": this.apikey, "Content-Type": "application/json" };
      if (typeof window !== "undefined") {
        res = await axios_default.get("/app/common/apikey/validate").then((r) => ({ ...r.data, status: 200 })).catch((e) => {
          var _a, _b;
          return { error: true, status: (_a = e.response) == null ? void 0 : _a.status, ...(_b = e.response) == null ? void 0 : _b.data };
        });
      } else {
        let response = await fetch(this.baseURL + "/app/common/apikey/validate", { method: "GET", headers });
        res = await response.json();
        if (!response.ok)
          res.error = true;
      }
      console.log("validate res:", res);
      this.validateRes = res;
      return res;
    }
    async httpSend(item) {
      let res;
      if (typeof window !== "undefined") {
        res = await axios_default.post("/app/todo/action/add", item).then((r) => r.data).catch((e) => {
          var _a;
          return { error: true, ...(_a = e.response) == null ? void 0 : _a.data };
        });
      } else {
        let headers = { Authorization: this.token, "X-API-Key": this.apikey, "Content-Type": "application/json" };
        let response = await fetch(this.baseURL + "/app/todo/action/add", { method: "POST", headers, body: JSON.stringify(item) });
        res = await response.json();
        if (!response.ok)
          res = { error: true, ...res };
      }
      console.log("send res:", res);
      this.validateRes = res;
      return res;
    }
    filterQueryURL(url3) {
      if (!url3.startsWith("http"))
        return url3;
      url3 = this.getSearchUrl(url3);
      if (url3.includes("bilibili.com/video/") || url3.includes("blog.csdn.net"))
        url3 = url3.replace(/\?.*/, "");
      if (url3.includes("token="))
        url3 = url3.replace(/token=.*/, "");
      url3 = url3.substr(0, 200);
      if (url3.includes("?"))
        url3 = decodeURIComponent(url3);
      return url3;
    }
    getSearchUrl(url3) {
      let item = _TimeReview.searchArr.find(({ key, value: value2 }) => url3.includes(key));
      if (item)
        url3 = item.key + `?${item.value}=${this.getSearchKey(url3, item.value)}`;
      return url3;
    }
    getSearchKey(url3, wd) {
      let query = query_string_default.parse(url3.replace(/.*\?/, ""));
      let value2 = query[wd];
      if (Array.isArray(value2)) {
        return decodeURIComponent(value2[0] || "");
      }
      return decodeURIComponent(value2 || "");
    }
    getBrowserInfo() {
      const ua = navigator.userAgent;
      let tem, M = ua.match(/(opera|chrome|safari|firefox|msie|trident(?=\/))\/?\s*(\d+)/i) || [];
      if (/trident/i.test(M[1])) {
        tem = /\brv[ :]+(\d+)/g.exec(ua) || [];
        return { name: "IE", version: tem[1] || "" };
      }
      if (M[1] === "Chrome") {
        tem = ua.match(/\b(OPR|Edge)\/(\d+)/);
        if (tem != null)
          return { name: tem[1].replace("OPR", "Opera"), version: tem[2] };
      }
      M = M[2] ? [M[1], M[2]] : [navigator.appName, navigator.appVersion, "-?"];
      if ((tem = ua.match(/version\/(\d+)/i)) != null)
        M.splice(1, 1, tem[1]);
      return {
        name: M[0],
        version: M[1]
      };
    }
    getType() {
      let browser = this.getBrowserInfo();
      let type = browser.name + browser.version;
      return type;
    }
  };
  var TimeReview = _TimeReview;
  __publicField(TimeReview, "searchArr", [
    { key: "google.com/search", value: "q" },
    { key: "baidu.com/s", value: "wd" },
    { key: "sogou.com/web", value: "query" },
    { key: "so.com/s", value: "q" },
    { key: "github.com/search", value: "q" }
  ]);
  var TimeReview_default = TimeReview;

  // src-bex/background.ts
  var import_moment2 = __toESM(require_moment());


  // node_modules/engine.io-parser/build/esm/commons.js
  var PACKET_TYPES = /* @__PURE__ */ Object.create(null);
  PACKET_TYPES["open"] = "0";
  PACKET_TYPES["close"] = "1";
  PACKET_TYPES["ping"] = "2";
  PACKET_TYPES["pong"] = "3";
  PACKET_TYPES["message"] = "4";
  PACKET_TYPES["upgrade"] = "5";
  PACKET_TYPES["noop"] = "6";
  var PACKET_TYPES_REVERSE = /* @__PURE__ */ Object.create(null);
  Object.keys(PACKET_TYPES).forEach((key) => {
    PACKET_TYPES_REVERSE[PACKET_TYPES[key]] = key;
  });
  var ERROR_PACKET = { type: "error", data: "parser error" };

  // node_modules/engine.io-parser/build/esm/encodePacket.browser.js
  var withNativeBlob = typeof Blob === "function" || typeof Blob !== "undefined" && Object.prototype.toString.call(Blob) === "[object BlobConstructor]";
  var withNativeArrayBuffer = typeof ArrayBuffer === "function";
  var isView = (obj2) => {
    return typeof ArrayBuffer.isView === "function" ? ArrayBuffer.isView(obj2) : obj2 && obj2.buffer instanceof ArrayBuffer;
  };
  var encodePacket = ({ type, data }, supportsBinary, callback) => {
    if (withNativeBlob && data instanceof Blob) {
      if (supportsBinary) {
        return callback(data);
      } else {
        return encodeBlobAsBase64(data, callback);
      }
    } else if (withNativeArrayBuffer && (data instanceof ArrayBuffer || isView(data))) {
      if (supportsBinary) {
        return callback(data);
      } else {
        return encodeBlobAsBase64(new Blob([data]), callback);
      }
    }
    return callback(PACKET_TYPES[type] + (data || ""));
  };
  var encodeBlobAsBase64 = (data, callback) => {
    const fileReader = new FileReader();
    fileReader.onload = function() {
      const content = fileReader.result.split(",")[1];
      callback("b" + (content || ""));
    };
    return fileReader.readAsDataURL(data);
  };
  function toArray2(data) {
    if (data instanceof Uint8Array) {
      return data;
    } else if (data instanceof ArrayBuffer) {
      return new Uint8Array(data);
    } else {
      return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    }
  }
  var TEXT_ENCODER;
  function encodePacketToBinary(packet, callback) {
    if (withNativeBlob && packet.data instanceof Blob) {
      return packet.data.arrayBuffer().then(toArray2).then(callback);
    } else if (withNativeArrayBuffer && (packet.data instanceof ArrayBuffer || isView(packet.data))) {
      return callback(toArray2(packet.data));
    }
    encodePacket(packet, false, (encoded) => {
      if (!TEXT_ENCODER) {
        TEXT_ENCODER = new TextEncoder();
      }
      callback(TEXT_ENCODER.encode(encoded));
    });
  }

  // node_modules/engine.io-parser/build/esm/contrib/base64-arraybuffer.js
  var chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  var lookup = typeof Uint8Array === "undefined" ? [] : new Uint8Array(256);
  for (let i2 = 0; i2 < chars.length; i2++) {
    lookup[chars.charCodeAt(i2)] = i2;
  }
  var decode3 = (base64) => {
    let bufferLength = base64.length * 0.75, len = base64.length, i2, p = 0, encoded1, encoded2, encoded3, encoded4;
    if (base64[base64.length - 1] === "=") {
      bufferLength--;
      if (base64[base64.length - 2] === "=") {
        bufferLength--;
      }
    }
    const arraybuffer = new ArrayBuffer(bufferLength), bytes = new Uint8Array(arraybuffer);
    for (i2 = 0; i2 < len; i2 += 4) {
      encoded1 = lookup[base64.charCodeAt(i2)];
      encoded2 = lookup[base64.charCodeAt(i2 + 1)];
      encoded3 = lookup[base64.charCodeAt(i2 + 2)];
      encoded4 = lookup[base64.charCodeAt(i2 + 3)];
      bytes[p++] = encoded1 << 2 | encoded2 >> 4;
      bytes[p++] = (encoded2 & 15) << 4 | encoded3 >> 2;
      bytes[p++] = (encoded3 & 3) << 6 | encoded4 & 63;
    }
    return arraybuffer;
  };

  // node_modules/engine.io-parser/build/esm/decodePacket.browser.js
  var withNativeArrayBuffer2 = typeof ArrayBuffer === "function";
  var decodePacket = (encodedPacket, binaryType) => {
    if (typeof encodedPacket !== "string") {
      return {
        type: "message",
        data: mapBinary(encodedPacket, binaryType)
      };
    }
    const type = encodedPacket.charAt(0);
    if (type === "b") {
      return {
        type: "message",
        data: decodeBase64Packet(encodedPacket.substring(1), binaryType)
      };
    }
    const packetType = PACKET_TYPES_REVERSE[type];
    if (!packetType) {
      return ERROR_PACKET;
    }
    return encodedPacket.length > 1 ? {
      type: PACKET_TYPES_REVERSE[type],
      data: encodedPacket.substring(1)
    } : {
      type: PACKET_TYPES_REVERSE[type]
    };
  };
  var decodeBase64Packet = (data, binaryType) => {
    if (withNativeArrayBuffer2) {
      const decoded = decode3(data);
      return mapBinary(decoded, binaryType);
    } else {
      return { base64: true, data };
    }
  };
  var mapBinary = (data, binaryType) => {
    switch (binaryType) {
      case "blob":
        if (data instanceof Blob) {
          return data;
        } else {
          return new Blob([data]);
        }
      case "arraybuffer":
      default:
        if (data instanceof ArrayBuffer) {
          return data;
        } else {
          return data.buffer;
        }
    }
  };

  // node_modules/engine.io-parser/build/esm/index.js
  var SEPARATOR = String.fromCharCode(30);
  var encodePayload = (packets, callback) => {
    const length2 = packets.length;
    const encodedPackets = new Array(length2);
    let count = 0;
    packets.forEach((packet, i2) => {
      encodePacket(packet, false, (encodedPacket) => {
        encodedPackets[i2] = encodedPacket;
        if (++count === length2) {
          callback(encodedPackets.join(SEPARATOR));
        }
      });
    });
  };
  var decodePayload = (encodedPayload, binaryType) => {
    const encodedPackets = encodedPayload.split(SEPARATOR);
    const packets = [];
    for (let i2 = 0; i2 < encodedPackets.length; i2++) {
      const decodedPacket = decodePacket(encodedPackets[i2], binaryType);
      packets.push(decodedPacket);
      if (decodedPacket.type === "error") {
        break;
      }
    }
    return packets;
  };
  function createPacketEncoderStream() {
    return new TransformStream({
      transform(packet, controller) {
        encodePacketToBinary(packet, (encodedPacket) => {
          const payloadLength = encodedPacket.length;
          let header;
          if (payloadLength < 126) {
            header = new Uint8Array(1);
            new DataView(header.buffer).setUint8(0, payloadLength);
          } else if (payloadLength < 65536) {
            header = new Uint8Array(3);
            const view = new DataView(header.buffer);
            view.setUint8(0, 126);
            view.setUint16(1, payloadLength);
          } else {
            header = new Uint8Array(9);
            const view = new DataView(header.buffer);
            view.setUint8(0, 127);
            view.setBigUint64(1, BigInt(payloadLength));
          }
          if (packet.data && typeof packet.data !== "string") {
            header[0] |= 128;
          }
          controller.enqueue(header);
          controller.enqueue(encodedPacket);
        });
      }
    });
  }
  var TEXT_DECODER;
  function totalLength(chunks) {
    return chunks.reduce((acc, chunk) => acc + chunk.length, 0);
  }
  function concatChunks(chunks, size) {
    if (chunks[0].length === size) {
      return chunks.shift();
    }
    const buffer = new Uint8Array(size);
    let j = 0;
    for (let i2 = 0; i2 < size; i2++) {
      buffer[i2] = chunks[0][j++];
      if (j === chunks[0].length) {
        chunks.shift();
        j = 0;
      }
    }
    if (chunks.length && j < chunks[0].length) {
      chunks[0] = chunks[0].slice(j);
    }
    return buffer;
  }
  function createPacketDecoderStream(maxPayload, binaryType) {
    if (!TEXT_DECODER) {
      TEXT_DECODER = new TextDecoder();
    }
    const chunks = [];
    let state = 0;
    let expectedLength = -1;
    let isBinary2 = false;
    return new TransformStream({
      transform(chunk, controller) {
        chunks.push(chunk);
        while (true) {
          if (state === 0) {
            if (totalLength(chunks) < 1) {
              break;
            }
            const header = concatChunks(chunks, 1);
            isBinary2 = (header[0] & 128) === 128;
            expectedLength = header[0] & 127;
            if (expectedLength < 126) {
              state = 3;
            } else if (expectedLength === 126) {
              state = 1;
            } else {
              state = 2;
            }
          } else if (state === 1) {
            if (totalLength(chunks) < 2) {
              break;
            }
            const headerArray = concatChunks(chunks, 2);
            expectedLength = new DataView(headerArray.buffer, headerArray.byteOffset, headerArray.length).getUint16(0);
            state = 3;
          } else if (state === 2) {
            if (totalLength(chunks) < 8) {
              break;
            }
            const headerArray = concatChunks(chunks, 8);
            const view = new DataView(headerArray.buffer, headerArray.byteOffset, headerArray.length);
            const n = view.getUint32(0);
            if (n > Math.pow(2, 53 - 32) - 1) {
              controller.enqueue(ERROR_PACKET);
              break;
            }
            expectedLength = n * Math.pow(2, 32) + view.getUint32(4);
            state = 3;
          } else {
            if (totalLength(chunks) < expectedLength) {
              break;
            }
            const data = concatChunks(chunks, expectedLength);
            controller.enqueue(decodePacket(isBinary2 ? data : TEXT_DECODER.decode(data), binaryType));
            state = 0;
          }
          if (expectedLength === 0 || expectedLength > maxPayload) {
            controller.enqueue(ERROR_PACKET);
            break;
          }
        }
      }
    });
  }
  var protocol = 4;

  // node_modules/@socket.io/component-emitter/index.mjs
  function Emitter(obj2) {
    if (obj2)
      return mixin(obj2);
  }
  function mixin(obj2) {
    for (var key in Emitter.prototype) {
      obj2[key] = Emitter.prototype[key];
    }
    return obj2;
  }
  Emitter.prototype.on = Emitter.prototype.addEventListener = function(event, fn) {
    this._callbacks = this._callbacks || {};
    (this._callbacks["$" + event] = this._callbacks["$" + event] || []).push(fn);
    return this;
  };
  Emitter.prototype.once = function(event, fn) {
    function on2() {
      this.off(event, on2);
      fn.apply(this, arguments);
    }
    on2.fn = fn;
    this.on(event, on2);
    return this;
  };
  Emitter.prototype.off = Emitter.prototype.removeListener = Emitter.prototype.removeAllListeners = Emitter.prototype.removeEventListener = function(event, fn) {
    this._callbacks = this._callbacks || {};
    if (0 == arguments.length) {
      this._callbacks = {};
      return this;
    }
    var callbacks = this._callbacks["$" + event];
    if (!callbacks)
      return this;
    if (1 == arguments.length) {
      delete this._callbacks["$" + event];
      return this;
    }
    var cb;
    for (var i2 = 0; i2 < callbacks.length; i2++) {
      cb = callbacks[i2];
      if (cb === fn || cb.fn === fn) {
        callbacks.splice(i2, 1);
        break;
      }
    }
    if (callbacks.length === 0) {
      delete this._callbacks["$" + event];
    }
    return this;
  };
  Emitter.prototype.emit = function(event) {
    this._callbacks = this._callbacks || {};
    var args = new Array(arguments.length - 1), callbacks = this._callbacks["$" + event];
    for (var i2 = 1; i2 < arguments.length; i2++) {
      args[i2 - 1] = arguments[i2];
    }
    if (callbacks) {
      callbacks = callbacks.slice(0);
      for (var i2 = 0, len = callbacks.length; i2 < len; ++i2) {
        callbacks[i2].apply(this, args);
      }
    }
    return this;
  };
  Emitter.prototype.emitReserved = Emitter.prototype.emit;
  Emitter.prototype.listeners = function(event) {
    this._callbacks = this._callbacks || {};
    return this._callbacks["$" + event] || [];
  };
  Emitter.prototype.hasListeners = function(event) {
    return !!this.listeners(event).length;
  };

  // node_modules/engine.io-client/build/esm/globalThis.browser.js
  var globalThisShim = (() => {
    if (typeof self !== "undefined") {
      return self;
    } else if (typeof window !== "undefined") {
      return window;
    } else {
      return Function("return this")();
    }
  })();

  // node_modules/engine.io-client/build/esm/util.js
  function pick2(obj2, ...attr) {
    return attr.reduce((acc, k) => {
      if (obj2.hasOwnProperty(k)) {
        acc[k] = obj2[k];
      }
      return acc;
    }, {});
  }
  var NATIVE_SET_TIMEOUT = globalThisShim.setTimeout;
  var NATIVE_CLEAR_TIMEOUT = globalThisShim.clearTimeout;
  function installTimerFunctions(obj2, opts) {
    if (opts.useNativeTimers) {
      obj2.setTimeoutFn = NATIVE_SET_TIMEOUT.bind(globalThisShim);
      obj2.clearTimeoutFn = NATIVE_CLEAR_TIMEOUT.bind(globalThisShim);
    } else {
      obj2.setTimeoutFn = globalThisShim.setTimeout.bind(globalThisShim);
      obj2.clearTimeoutFn = globalThisShim.clearTimeout.bind(globalThisShim);
    }
  }
  var BASE64_OVERHEAD = 1.33;
  function byteLength(obj2) {
    if (typeof obj2 === "string") {
      return utf8Length(obj2);
    }
    return Math.ceil((obj2.byteLength || obj2.size) * BASE64_OVERHEAD);
  }
  function utf8Length(str2) {
    let c = 0, length2 = 0;
    for (let i2 = 0, l = str2.length; i2 < l; i2++) {
      c = str2.charCodeAt(i2);
      if (c < 128) {
        length2 += 1;
      } else if (c < 2048) {
        length2 += 2;
      } else if (c < 55296 || c >= 57344) {
        length2 += 3;
      } else {
        i2++;
        length2 += 4;
      }
    }
    return length2;
  }

  // node_modules/engine.io-client/build/esm/contrib/parseqs.js
  function encode4(obj2) {
    let str2 = "";
    for (let i2 in obj2) {
      if (obj2.hasOwnProperty(i2)) {
        if (str2.length)
          str2 += "&";
        str2 += encodeURIComponent(i2) + "=" + encodeURIComponent(obj2[i2]);
      }
    }
    return str2;
  }
  function decode4(qs) {
    let qry = {};
    let pairs = qs.split("&");
    for (let i2 = 0, l = pairs.length; i2 < l; i2++) {
      let pair = pairs[i2].split("=");
      qry[decodeURIComponent(pair[0])] = decodeURIComponent(pair[1]);
    }
    return qry;
  }

  // node_modules/engine.io-client/build/esm/transport.js
  var TransportError = class extends Error {
    constructor(reason, description, context) {
      super(reason);
      this.description = description;
      this.context = context;
      this.type = "TransportError";
    }
  };
  var Transport = class extends Emitter {
    constructor(opts) {
      super();
      this.writable = false;
      installTimerFunctions(this, opts);
      this.opts = opts;
      this.query = opts.query;
      this.socket = opts.socket;
    }
    onError(reason, description, context) {
      super.emitReserved("error", new TransportError(reason, description, context));
      return this;
    }
    open() {
      this.readyState = "opening";
      this.doOpen();
      return this;
    }
    close() {
      if (this.readyState === "opening" || this.readyState === "open") {
        this.doClose();
        this.onClose();
      }
      return this;
    }
    send(packets) {
      if (this.readyState === "open") {
        this.write(packets);
      } else {
      }
    }
    onOpen() {
      this.readyState = "open";
      this.writable = true;
      super.emitReserved("open");
    }
    onData(data) {
      const packet = decodePacket(data, this.socket.binaryType);
      this.onPacket(packet);
    }
    onPacket(packet) {
      super.emitReserved("packet", packet);
    }
    onClose(details) {
      this.readyState = "closed";
      super.emitReserved("close", details);
    }
    pause(onPause) {
    }
    createUri(schema, query = {}) {
      return schema + "://" + this._hostname() + this._port() + this.opts.path + this._query(query);
    }
    _hostname() {
      const hostname = this.opts.hostname;
      return hostname.indexOf(":") === -1 ? hostname : "[" + hostname + "]";
    }
    _port() {
      if (this.opts.port && (this.opts.secure && Number(this.opts.port !== 443) || !this.opts.secure && Number(this.opts.port) !== 80)) {
        return ":" + this.opts.port;
      } else {
        return "";
      }
    }
    _query(query) {
      const encodedQuery = encode4(query);
      return encodedQuery.length ? "?" + encodedQuery : "";
    }
  };

  // node_modules/engine.io-client/build/esm/contrib/yeast.js
  var alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_".split("");
  var length = 64;
  var map = {};
  var seed = 0;
  var i = 0;
  var prev;
  function encode5(num) {
    let encoded = "";
    do {
      encoded = alphabet[num % length] + encoded;
      num = Math.floor(num / length);
    } while (num > 0);
    return encoded;
  }
  function yeast() {
    const now = encode5(+new Date());
    if (now !== prev)
      return seed = 0, prev = now;
    return now + "." + encode5(seed++);
  }
  for (; i < length; i++)
    map[alphabet[i]] = i;

  // node_modules/engine.io-client/build/esm/contrib/has-cors.js
  var value = false;
  try {
    value = typeof XMLHttpRequest !== "undefined" && "withCredentials" in new XMLHttpRequest();
  } catch (err) {
  }
  var hasCORS = value;

  // node_modules/engine.io-client/build/esm/transports/xmlhttprequest.browser.js
  function XHR(opts) {
    const xdomain = opts.xdomain;
    try {
      if ("undefined" !== typeof XMLHttpRequest && (!xdomain || hasCORS)) {
        return new XMLHttpRequest();
      }
    } catch (e) {
    }
    if (!xdomain) {
      try {
        return new globalThisShim[["Active"].concat("Object").join("X")]("Microsoft.XMLHTTP");
      } catch (e) {
      }
    }
  }
  function createCookieJar() {
  }

  // node_modules/engine.io-client/build/esm/transports/polling.js
  function empty() {
  }
  var hasXHR2 = function() {
    const xhr = new XHR({
      xdomain: false
    });
    return null != xhr.responseType;
  }();
  var Polling = class extends Transport {
    constructor(opts) {
      super(opts);
      this.polling = false;
      if (typeof location !== "undefined") {
        const isSSL = "https:" === location.protocol;
        let port = location.port;
        if (!port) {
          port = isSSL ? "443" : "80";
        }
        this.xd = typeof location !== "undefined" && opts.hostname !== location.hostname || port !== opts.port;
      }
      const forceBase64 = opts && opts.forceBase64;
      this.supportsBinary = hasXHR2 && !forceBase64;
      if (this.opts.withCredentials) {
        this.cookieJar = createCookieJar();
      }
    }
    get name() {
      return "polling";
    }
    doOpen() {
      this.poll();
    }
    pause(onPause) {
      this.readyState = "pausing";
      const pause = () => {
        this.readyState = "paused";
        onPause();
      };
      if (this.polling || !this.writable) {
        let total = 0;
        if (this.polling) {
          total++;
          this.once("pollComplete", function() {
            --total || pause();
          });
        }
        if (!this.writable) {
          total++;
          this.once("drain", function() {
            --total || pause();
          });
        }
      } else {
        pause();
      }
    }
    poll() {
      this.polling = true;
      this.doPoll();
      this.emitReserved("poll");
    }
    onData(data) {
      const callback = (packet) => {
        if ("opening" === this.readyState && packet.type === "open") {
          this.onOpen();
        }
        if ("close" === packet.type) {
          this.onClose({ description: "transport closed by the server" });
          return false;
        }
        this.onPacket(packet);
      };
      decodePayload(data, this.socket.binaryType).forEach(callback);
      if ("closed" !== this.readyState) {
        this.polling = false;
        this.emitReserved("pollComplete");
        if ("open" === this.readyState) {
          this.poll();
        } else {
        }
      }
    }
    doClose() {
      const close = () => {
        this.write([{ type: "close" }]);
      };
      if ("open" === this.readyState) {
        close();
      } else {
        this.once("open", close);
      }
    }
    write(packets) {
      this.writable = false;
      encodePayload(packets, (data) => {
        this.doWrite(data, () => {
          this.writable = true;
          this.emitReserved("drain");
        });
      });
    }
    uri() {
      const schema = this.opts.secure ? "https" : "http";
      const query = this.query || {};
      if (false !== this.opts.timestampRequests) {
        query[this.opts.timestampParam] = yeast();
      }
      if (!this.supportsBinary && !query.sid) {
        query.b64 = 1;
      }
      return this.createUri(schema, query);
    }
    request(opts = {}) {
      Object.assign(opts, { xd: this.xd, cookieJar: this.cookieJar }, this.opts);
      return new Request(this.uri(), opts);
    }
    doWrite(data, fn) {
      const req = this.request({
        method: "POST",
        data
      });
      req.on("success", fn);
      req.on("error", (xhrStatus, context) => {
        this.onError("xhr post error", xhrStatus, context);
      });
    }
    doPoll() {
      const req = this.request();
      req.on("data", this.onData.bind(this));
      req.on("error", (xhrStatus, context) => {
        this.onError("xhr poll error", xhrStatus, context);
      });
      this.pollXhr = req;
    }
  };
  var Request = class extends Emitter {
    constructor(uri, opts) {
      super();
      installTimerFunctions(this, opts);
      this.opts = opts;
      this.method = opts.method || "GET";
      this.uri = uri;
      this.data = void 0 !== opts.data ? opts.data : null;
      this.create();
    }
    create() {
      var _a;
      const opts = pick2(this.opts, "agent", "pfx", "key", "passphrase", "cert", "ca", "ciphers", "rejectUnauthorized", "autoUnref");
      opts.xdomain = !!this.opts.xd;
      const xhr = this.xhr = new XHR(opts);
      try {
        xhr.open(this.method, this.uri, true);
        try {
          if (this.opts.extraHeaders) {
            xhr.setDisableHeaderCheck && xhr.setDisableHeaderCheck(true);
            for (let i2 in this.opts.extraHeaders) {
              if (this.opts.extraHeaders.hasOwnProperty(i2)) {
                xhr.setRequestHeader(i2, this.opts.extraHeaders[i2]);
              }
            }
          }
        } catch (e) {
        }
        if ("POST" === this.method) {
          try {
            xhr.setRequestHeader("Content-type", "text/plain;charset=UTF-8");
          } catch (e) {
          }
        }
        try {
          xhr.setRequestHeader("Accept", "*/*");
        } catch (e) {
        }
        (_a = this.opts.cookieJar) === null || _a === void 0 ? void 0 : _a.addCookies(xhr);
        if ("withCredentials" in xhr) {
          xhr.withCredentials = this.opts.withCredentials;
        }
        if (this.opts.requestTimeout) {
          xhr.timeout = this.opts.requestTimeout;
        }
        xhr.onreadystatechange = () => {
          var _a2;
          if (xhr.readyState === 3) {
            (_a2 = this.opts.cookieJar) === null || _a2 === void 0 ? void 0 : _a2.parseCookies(xhr);
          }
          if (4 !== xhr.readyState)
            return;
          if (200 === xhr.status || 1223 === xhr.status) {
            this.onLoad();
          } else {
            this.setTimeoutFn(() => {
              this.onError(typeof xhr.status === "number" ? xhr.status : 0);
            }, 0);
          }
        };
        xhr.send(this.data);
      } catch (e) {
        this.setTimeoutFn(() => {
          this.onError(e);
        }, 0);
        return;
      }
      if (typeof document !== "undefined") {
        this.index = Request.requestsCount++;
        Request.requests[this.index] = this;
      }
    }
    onError(err) {
      this.emitReserved("error", err, this.xhr);
      this.cleanup(true);
    }
    cleanup(fromError) {
      if ("undefined" === typeof this.xhr || null === this.xhr) {
        return;
      }
      this.xhr.onreadystatechange = empty;
      if (fromError) {
        try {
          this.xhr.abort();
        } catch (e) {
        }
      }
      if (typeof document !== "undefined") {
        delete Request.requests[this.index];
      }
      this.xhr = null;
    }
    onLoad() {
      const data = this.xhr.responseText;
      if (data !== null) {
        this.emitReserved("data", data);
        this.emitReserved("success");
        this.cleanup();
      }
    }
    abort() {
      this.cleanup();
    }
  };
  Request.requestsCount = 0;
  Request.requests = {};
  if (typeof document !== "undefined") {
    if (typeof attachEvent === "function") {
      attachEvent("onunload", unloadHandler);
    } else if (typeof addEventListener === "function") {
      const terminationEvent = "onpagehide" in globalThisShim ? "pagehide" : "unload";
      addEventListener(terminationEvent, unloadHandler, false);
    }
  }
  function unloadHandler() {
    for (let i2 in Request.requests) {
      if (Request.requests.hasOwnProperty(i2)) {
        Request.requests[i2].abort();
      }
    }
  }

  // node_modules/engine.io-client/build/esm/transports/websocket-constructor.browser.js
  var nextTick = (() => {
    const isPromiseAvailable = typeof Promise === "function" && typeof Promise.resolve === "function";
    if (isPromiseAvailable) {
      return (cb) => Promise.resolve().then(cb);
    } else {
      return (cb, setTimeoutFn) => setTimeoutFn(cb, 0);
    }
  })();
  var WebSocket = globalThisShim.WebSocket || globalThisShim.MozWebSocket;
  var usingBrowserWebSocket = true;
  var defaultBinaryType = "arraybuffer";

  // node_modules/engine.io-client/build/esm/transports/websocket.js
  var isReactNative = typeof navigator !== "undefined" && typeof navigator.product === "string" && navigator.product.toLowerCase() === "reactnative";
  var WS = class extends Transport {
    constructor(opts) {
      super(opts);
      this.supportsBinary = !opts.forceBase64;
    }
    get name() {
      return "websocket";
    }
    doOpen() {
      if (!this.check()) {
        return;
      }
      const uri = this.uri();
      const protocols = this.opts.protocols;
      const opts = isReactNative ? {} : pick2(this.opts, "agent", "perMessageDeflate", "pfx", "key", "passphrase", "cert", "ca", "ciphers", "rejectUnauthorized", "localAddress", "protocolVersion", "origin", "maxPayload", "family", "checkServerIdentity");
      if (this.opts.extraHeaders) {
        opts.headers = this.opts.extraHeaders;
      }
      try {
        this.ws = usingBrowserWebSocket && !isReactNative ? protocols ? new WebSocket(uri, protocols) : new WebSocket(uri) : new WebSocket(uri, protocols, opts);
      } catch (err) {
        return this.emitReserved("error", err);
      }
      this.ws.binaryType = this.socket.binaryType;
      this.addEventListeners();
    }
    addEventListeners() {
      this.ws.onopen = () => {
        if (this.opts.autoUnref) {
          this.ws._socket.unref();
        }
        this.onOpen();
      };
      this.ws.onclose = (closeEvent) => this.onClose({
        description: "websocket connection closed",
        context: closeEvent
      });
      this.ws.onmessage = (ev) => this.onData(ev.data);
      this.ws.onerror = (e) => this.onError("websocket error", e);
    }
    write(packets) {
      this.writable = false;
      for (let i2 = 0; i2 < packets.length; i2++) {
        const packet = packets[i2];
        const lastPacket = i2 === packets.length - 1;
        encodePacket(packet, this.supportsBinary, (data) => {
          const opts = {};
          if (!usingBrowserWebSocket) {
            if (packet.options) {
              opts.compress = packet.options.compress;
            }
            if (this.opts.perMessageDeflate) {
              const len = "string" === typeof data ? Buffer.byteLength(data) : data.length;
              if (len < this.opts.perMessageDeflate.threshold) {
                opts.compress = false;
              }
            }
          }
          try {
            if (usingBrowserWebSocket) {
              this.ws.send(data);
            } else {
              this.ws.send(data, opts);
            }
          } catch (e) {
          }
          if (lastPacket) {
            nextTick(() => {
              this.writable = true;
              this.emitReserved("drain");
            }, this.setTimeoutFn);
          }
        });
      }
    }
    doClose() {
      if (typeof this.ws !== "undefined") {
        this.ws.close();
        this.ws = null;
      }
    }
    uri() {
      const schema = this.opts.secure ? "wss" : "ws";
      const query = this.query || {};
      if (this.opts.timestampRequests) {
        query[this.opts.timestampParam] = yeast();
      }
      if (!this.supportsBinary) {
        query.b64 = 1;
      }
      return this.createUri(schema, query);
    }
    check() {
      return !!WebSocket;
    }
  };

  // node_modules/engine.io-client/build/esm/transports/webtransport.js
  var WT = class extends Transport {
    get name() {
      return "webtransport";
    }
    doOpen() {
      if (typeof WebTransport !== "function") {
        return;
      }
      this.transport = new WebTransport(this.createUri("https"), this.opts.transportOptions[this.name]);
      this.transport.closed.then(() => {
        this.onClose();
      }).catch((err) => {
        this.onError("webtransport error", err);
      });
      this.transport.ready.then(() => {
        this.transport.createBidirectionalStream().then((stream) => {
          const decoderStream = createPacketDecoderStream(Number.MAX_SAFE_INTEGER, this.socket.binaryType);
          const reader = stream.readable.pipeThrough(decoderStream).getReader();
          const encoderStream = createPacketEncoderStream();
          encoderStream.readable.pipeTo(stream.writable);
          this.writer = encoderStream.writable.getWriter();
          const read = () => {
            reader.read().then(({ done, value: value2 }) => {
              if (done) {
                return;
              }
              this.onPacket(value2);
              read();
            }).catch((err) => {
            });
          };
          read();
          const packet = { type: "open" };
          if (this.query.sid) {
            packet.data = `{"sid":"${this.query.sid}"}`;
          }
          this.writer.write(packet).then(() => this.onOpen());
        });
      });
    }
    write(packets) {
      this.writable = false;
      for (let i2 = 0; i2 < packets.length; i2++) {
        const packet = packets[i2];
        const lastPacket = i2 === packets.length - 1;
        this.writer.write(packet).then(() => {
          if (lastPacket) {
            nextTick(() => {
              this.writable = true;
              this.emitReserved("drain");
            }, this.setTimeoutFn);
          }
        });
      }
    }
    doClose() {
      var _a;
      (_a = this.transport) === null || _a === void 0 ? void 0 : _a.close();
    }
  };

  // node_modules/engine.io-client/build/esm/transports/index.js
  var transports = {
    websocket: WS,
    webtransport: WT,
    polling: Polling
  };

  // node_modules/engine.io-client/build/esm/contrib/parseuri.js
  var re = /^(?:(?![^:@\/?#]+:[^:@\/]*@)(http|https|ws|wss):\/\/)?((?:(([^:@\/?#]*)(?::([^:@\/?#]*))?)?@)?((?:[a-f0-9]{0,4}:){2,7}[a-f0-9]{0,4}|[^:\/?#]*)(?::(\d*))?)(((\/(?:[^?#](?![^?#\/]*\.[^?#\/.]+(?:[?#]|$)))*\/?)?([^?#\/]*))(?:\?([^#]*))?(?:#(.*))?)/;
  var parts = [
    "source",
    "protocol",
    "authority",
    "userInfo",
    "user",
    "password",
    "host",
    "port",
    "relative",
    "path",
    "directory",
    "file",
    "query",
    "anchor"
  ];
  function parse2(str2) {
    if (str2.length > 2e3) {
      throw "URI too long";
    }
    const src = str2, b = str2.indexOf("["), e = str2.indexOf("]");
    if (b != -1 && e != -1) {
      str2 = str2.substring(0, b) + str2.substring(b, e).replace(/:/g, ";") + str2.substring(e, str2.length);
    }
    let m = re.exec(str2 || ""), uri = {}, i2 = 14;
    while (i2--) {
      uri[parts[i2]] = m[i2] || "";
    }
    if (b != -1 && e != -1) {
      uri.source = src;
      uri.host = uri.host.substring(1, uri.host.length - 1).replace(/;/g, ":");
      uri.authority = uri.authority.replace("[", "").replace("]", "").replace(/;/g, ":");
      uri.ipv6uri = true;
    }
    uri.pathNames = pathNames(uri, uri["path"]);
    uri.queryKey = queryKey(uri, uri["query"]);
    return uri;
  }
  function pathNames(obj2, path) {
    const regx = /\/{2,9}/g, names = path.replace(regx, "/").split("/");
    if (path.slice(0, 1) == "/" || path.length === 0) {
      names.splice(0, 1);
    }
    if (path.slice(-1) == "/") {
      names.splice(names.length - 1, 1);
    }
    return names;
  }
  function queryKey(uri, query) {
    const data = {};
    query.replace(/(?:^|&)([^&=]*)=?([^&]*)/g, function($0, $1, $2) {
      if ($1) {
        data[$1] = $2;
      }
    });
    return data;
  }

  // node_modules/engine.io-client/build/esm/socket.js
  var Socket = class extends Emitter {
    constructor(uri, opts = {}) {
      super();
      this.binaryType = defaultBinaryType;
      this.writeBuffer = [];
      if (uri && "object" === typeof uri) {
        opts = uri;
        uri = null;
      }
      if (uri) {
        uri = parse2(uri);
        opts.hostname = uri.host;
        opts.secure = uri.protocol === "https" || uri.protocol === "wss";
        opts.port = uri.port;
        if (uri.query)
          opts.query = uri.query;
      } else if (opts.host) {
        opts.hostname = parse2(opts.host).host;
      }
      installTimerFunctions(this, opts);
      this.secure = null != opts.secure ? opts.secure : typeof location !== "undefined" && "https:" === location.protocol;
      if (opts.hostname && !opts.port) {
        opts.port = this.secure ? "443" : "80";
      }
      this.hostname = opts.hostname || (typeof location !== "undefined" ? location.hostname : "localhost");
      this.port = opts.port || (typeof location !== "undefined" && location.port ? location.port : this.secure ? "443" : "80");
      this.transports = opts.transports || [
        "polling",
        "websocket",
        "webtransport"
      ];
      this.writeBuffer = [];
      this.prevBufferLen = 0;
      this.opts = Object.assign({
        path: "/engine.io",
        agent: false,
        withCredentials: false,
        upgrade: true,
        timestampParam: "t",
        rememberUpgrade: false,
        addTrailingSlash: true,
        rejectUnauthorized: true,
        perMessageDeflate: {
          threshold: 1024
        },
        transportOptions: {},
        closeOnBeforeunload: false
      }, opts);
      this.opts.path = this.opts.path.replace(/\/$/, "") + (this.opts.addTrailingSlash ? "/" : "");
      if (typeof this.opts.query === "string") {
        this.opts.query = decode4(this.opts.query);
      }
      this.id = null;
      this.upgrades = null;
      this.pingInterval = null;
      this.pingTimeout = null;
      this.pingTimeoutTimer = null;
      if (typeof addEventListener === "function") {
        if (this.opts.closeOnBeforeunload) {
          this.beforeunloadEventListener = () => {
            if (this.transport) {
              this.transport.removeAllListeners();
              this.transport.close();
            }
          };
          addEventListener("beforeunload", this.beforeunloadEventListener, false);
        }
        if (this.hostname !== "localhost") {
          this.offlineEventListener = () => {
            this.onClose("transport close", {
              description: "network connection lost"
            });
          };
          addEventListener("offline", this.offlineEventListener, false);
        }
      }
      this.open();
    }
    createTransport(name) {
      const query = Object.assign({}, this.opts.query);
      query.EIO = protocol;
      query.transport = name;
      if (this.id)
        query.sid = this.id;
      const opts = Object.assign({}, this.opts, {
        query,
        socket: this,
        hostname: this.hostname,
        secure: this.secure,
        port: this.port
      }, this.opts.transportOptions[name]);
      return new transports[name](opts);
    }
    open() {
      let transport;
      if (this.opts.rememberUpgrade && Socket.priorWebsocketSuccess && this.transports.indexOf("websocket") !== -1) {
        transport = "websocket";
      } else if (0 === this.transports.length) {
        this.setTimeoutFn(() => {
          this.emitReserved("error", "No transports available");
        }, 0);
        return;
      } else {
        transport = this.transports[0];
      }
      this.readyState = "opening";
      try {
        transport = this.createTransport(transport);
      } catch (e) {
        this.transports.shift();
        this.open();
        return;
      }
      transport.open();
      this.setTransport(transport);
    }
    setTransport(transport) {
      if (this.transport) {
        this.transport.removeAllListeners();
      }
      this.transport = transport;
      transport.on("drain", this.onDrain.bind(this)).on("packet", this.onPacket.bind(this)).on("error", this.onError.bind(this)).on("close", (reason) => this.onClose("transport close", reason));
    }
    probe(name) {
      let transport = this.createTransport(name);
      let failed = false;
      Socket.priorWebsocketSuccess = false;
      const onTransportOpen = () => {
        if (failed)
          return;
        transport.send([{ type: "ping", data: "probe" }]);
        transport.once("packet", (msg) => {
          if (failed)
            return;
          if ("pong" === msg.type && "probe" === msg.data) {
            this.upgrading = true;
            this.emitReserved("upgrading", transport);
            if (!transport)
              return;
            Socket.priorWebsocketSuccess = "websocket" === transport.name;
            this.transport.pause(() => {
              if (failed)
                return;
              if ("closed" === this.readyState)
                return;
              cleanup();
              this.setTransport(transport);
              transport.send([{ type: "upgrade" }]);
              this.emitReserved("upgrade", transport);
              transport = null;
              this.upgrading = false;
              this.flush();
            });
          } else {
            const err = new Error("probe error");
            err.transport = transport.name;
            this.emitReserved("upgradeError", err);
          }
        });
      };
      function freezeTransport() {
        if (failed)
          return;
        failed = true;
        cleanup();
        transport.close();
        transport = null;
      }
      const onerror = (err) => {
        const error = new Error("probe error: " + err);
        error.transport = transport.name;
        freezeTransport();
        this.emitReserved("upgradeError", error);
      };
      function onTransportClose() {
        onerror("transport closed");
      }
      function onclose() {
        onerror("socket closed");
      }
      function onupgrade(to) {
        if (transport && to.name !== transport.name) {
          freezeTransport();
        }
      }
      const cleanup = () => {
        transport.removeListener("open", onTransportOpen);
        transport.removeListener("error", onerror);
        transport.removeListener("close", onTransportClose);
        this.off("close", onclose);
        this.off("upgrading", onupgrade);
      };
      transport.once("open", onTransportOpen);
      transport.once("error", onerror);
      transport.once("close", onTransportClose);
      this.once("close", onclose);
      this.once("upgrading", onupgrade);
      if (this.upgrades.indexOf("webtransport") !== -1 && name !== "webtransport") {
        this.setTimeoutFn(() => {
          if (!failed) {
            transport.open();
          }
        }, 200);
      } else {
        transport.open();
      }
    }
    onOpen() {
      this.readyState = "open";
      Socket.priorWebsocketSuccess = "websocket" === this.transport.name;
      this.emitReserved("open");
      this.flush();
      if ("open" === this.readyState && this.opts.upgrade) {
        let i2 = 0;
        const l = this.upgrades.length;
        for (; i2 < l; i2++) {
          this.probe(this.upgrades[i2]);
        }
      }
    }
    onPacket(packet) {
      if ("opening" === this.readyState || "open" === this.readyState || "closing" === this.readyState) {
        this.emitReserved("packet", packet);
        this.emitReserved("heartbeat");
        this.resetPingTimeout();
        switch (packet.type) {
          case "open":
            this.onHandshake(JSON.parse(packet.data));
            break;
          case "ping":
            this.sendPacket("pong");
            this.emitReserved("ping");
            this.emitReserved("pong");
            break;
          case "error":
            const err = new Error("server error");
            err.code = packet.data;
            this.onError(err);
            break;
          case "message":
            this.emitReserved("data", packet.data);
            this.emitReserved("message", packet.data);
            break;
        }
      } else {
      }
    }
    onHandshake(data) {
      this.emitReserved("handshake", data);
      this.id = data.sid;
      this.transport.query.sid = data.sid;
      this.upgrades = this.filterUpgrades(data.upgrades);
      this.pingInterval = data.pingInterval;
      this.pingTimeout = data.pingTimeout;
      this.maxPayload = data.maxPayload;
      this.onOpen();
      if ("closed" === this.readyState)
        return;
      this.resetPingTimeout();
    }
    resetPingTimeout() {
      this.clearTimeoutFn(this.pingTimeoutTimer);
      this.pingTimeoutTimer = this.setTimeoutFn(() => {
        this.onClose("ping timeout");
      }, this.pingInterval + this.pingTimeout);
      if (this.opts.autoUnref) {
        this.pingTimeoutTimer.unref();
      }
    }
    onDrain() {
      this.writeBuffer.splice(0, this.prevBufferLen);
      this.prevBufferLen = 0;
      if (0 === this.writeBuffer.length) {
        this.emitReserved("drain");
      } else {
        this.flush();
      }
    }
    flush() {
      if ("closed" !== this.readyState && this.transport.writable && !this.upgrading && this.writeBuffer.length) {
        const packets = this.getWritablePackets();
        this.transport.send(packets);
        this.prevBufferLen = packets.length;
        this.emitReserved("flush");
      }
    }
    getWritablePackets() {
      const shouldCheckPayloadSize = this.maxPayload && this.transport.name === "polling" && this.writeBuffer.length > 1;
      if (!shouldCheckPayloadSize) {
        return this.writeBuffer;
      }
      let payloadSize = 1;
      for (let i2 = 0; i2 < this.writeBuffer.length; i2++) {
        const data = this.writeBuffer[i2].data;
        if (data) {
          payloadSize += byteLength(data);
        }
        if (i2 > 0 && payloadSize > this.maxPayload) {
          return this.writeBuffer.slice(0, i2);
        }
        payloadSize += 2;
      }
      return this.writeBuffer;
    }
    write(msg, options, fn) {
      this.sendPacket("message", msg, options, fn);
      return this;
    }
    send(msg, options, fn) {
      this.sendPacket("message", msg, options, fn);
      return this;
    }
    sendPacket(type, data, options, fn) {
      if ("function" === typeof data) {
        fn = data;
        data = void 0;
      }
      if ("function" === typeof options) {
        fn = options;
        options = null;
      }
      if ("closing" === this.readyState || "closed" === this.readyState) {
        return;
      }
      options = options || {};
      options.compress = false !== options.compress;
      const packet = {
        type,
        data,
        options
      };
      this.emitReserved("packetCreate", packet);
      this.writeBuffer.push(packet);
      if (fn)
        this.once("flush", fn);
      this.flush();
    }
    close() {
      const close = () => {
        this.onClose("forced close");
        this.transport.close();
      };
      const cleanupAndClose = () => {
        this.off("upgrade", cleanupAndClose);
        this.off("upgradeError", cleanupAndClose);
        close();
      };
      const waitForUpgrade = () => {
        this.once("upgrade", cleanupAndClose);
        this.once("upgradeError", cleanupAndClose);
      };
      if ("opening" === this.readyState || "open" === this.readyState) {
        this.readyState = "closing";
        if (this.writeBuffer.length) {
          this.once("drain", () => {
            if (this.upgrading) {
              waitForUpgrade();
            } else {
              close();
            }
          });
        } else if (this.upgrading) {
          waitForUpgrade();
        } else {
          close();
        }
      }
      return this;
    }
    onError(err) {
      Socket.priorWebsocketSuccess = false;
      this.emitReserved("error", err);
      this.onClose("transport error", err);
    }
    onClose(reason, description) {
      if ("opening" === this.readyState || "open" === this.readyState || "closing" === this.readyState) {
        this.clearTimeoutFn(this.pingTimeoutTimer);
        this.transport.removeAllListeners("close");
        this.transport.close();
        this.transport.removeAllListeners();
        if (typeof removeEventListener === "function") {
          removeEventListener("beforeunload", this.beforeunloadEventListener, false);
          removeEventListener("offline", this.offlineEventListener, false);
        }
        this.readyState = "closed";
        this.id = null;
        this.emitReserved("close", reason, description);
        this.writeBuffer = [];
        this.prevBufferLen = 0;
      }
    }
    filterUpgrades(upgrades) {
      const filteredUpgrades = [];
      let i2 = 0;
      const j = upgrades.length;
      for (; i2 < j; i2++) {
        if (~this.transports.indexOf(upgrades[i2]))
          filteredUpgrades.push(upgrades[i2]);
      }
      return filteredUpgrades;
    }
  };
  Socket.protocol = protocol;

  // node_modules/engine.io-client/build/esm/index.js
  var protocol2 = Socket.protocol;

  // node_modules/socket.io-client/build/esm/url.js
  function url(uri, path = "", loc) {
    let obj2 = uri;
    loc = loc || typeof location !== "undefined" && location;
    if (null == uri)
      uri = loc.protocol + "//" + loc.host;
    if (typeof uri === "string") {
      if ("/" === uri.charAt(0)) {
        if ("/" === uri.charAt(1)) {
          uri = loc.protocol + uri;
        } else {
          uri = loc.host + uri;
        }
      }
      if (!/^(https?|wss?):\/\//.test(uri)) {
        if ("undefined" !== typeof loc) {
          uri = loc.protocol + "//" + uri;
        } else {
          uri = "https://" + uri;
        }
      }
      obj2 = parse2(uri);
    }
    if (!obj2.port) {
      if (/^(http|ws)$/.test(obj2.protocol)) {
        obj2.port = "80";
      } else if (/^(http|ws)s$/.test(obj2.protocol)) {
        obj2.port = "443";
      }
    }
    obj2.path = obj2.path || "/";
    const ipv6 = obj2.host.indexOf(":") !== -1;
    const host = ipv6 ? "[" + obj2.host + "]" : obj2.host;
    obj2.id = obj2.protocol + "://" + host + ":" + obj2.port + path;
    obj2.href = obj2.protocol + "://" + host + (loc && loc.port === obj2.port ? "" : ":" + obj2.port);
    return obj2;
  }

  // node_modules/socket.io-parser/build/esm/index.js
  var esm_exports = {};
  __export(esm_exports, {
    Decoder: () => Decoder,
    Encoder: () => Encoder,
    PacketType: () => PacketType,
    protocol: () => protocol3
  });

  // node_modules/socket.io-parser/build/esm/is-binary.js
  var withNativeArrayBuffer3 = typeof ArrayBuffer === "function";
  var isView2 = (obj2) => {
    return typeof ArrayBuffer.isView === "function" ? ArrayBuffer.isView(obj2) : obj2.buffer instanceof ArrayBuffer;
  };
  var toString3 = Object.prototype.toString;
  var withNativeBlob2 = typeof Blob === "function" || typeof Blob !== "undefined" && toString3.call(Blob) === "[object BlobConstructor]";
  var withNativeFile = typeof File === "function" || typeof File !== "undefined" && toString3.call(File) === "[object FileConstructor]";
  function isBinary(obj2) {
    return withNativeArrayBuffer3 && (obj2 instanceof ArrayBuffer || isView2(obj2)) || withNativeBlob2 && obj2 instanceof Blob || withNativeFile && obj2 instanceof File;
  }
  function hasBinary(obj2, toJSON2) {
    if (!obj2 || typeof obj2 !== "object") {
      return false;
    }
    if (Array.isArray(obj2)) {
      for (let i2 = 0, l = obj2.length; i2 < l; i2++) {
        if (hasBinary(obj2[i2])) {
          return true;
        }
      }
      return false;
    }
    if (isBinary(obj2)) {
      return true;
    }
    if (obj2.toJSON && typeof obj2.toJSON === "function" && arguments.length === 1) {
      return hasBinary(obj2.toJSON(), true);
    }
    for (const key in obj2) {
      if (Object.prototype.hasOwnProperty.call(obj2, key) && hasBinary(obj2[key])) {
        return true;
      }
    }
    return false;
  }

  // node_modules/socket.io-parser/build/esm/binary.js
  function deconstructPacket(packet) {
    const buffers = [];
    const packetData = packet.data;
    const pack = packet;
    pack.data = _deconstructPacket(packetData, buffers);
    pack.attachments = buffers.length;
    return { packet: pack, buffers };
  }
  function _deconstructPacket(data, buffers) {
    if (!data)
      return data;
    if (isBinary(data)) {
      const placeholder = { _placeholder: true, num: buffers.length };
      buffers.push(data);
      return placeholder;
    } else if (Array.isArray(data)) {
      const newData = new Array(data.length);
      for (let i2 = 0; i2 < data.length; i2++) {
        newData[i2] = _deconstructPacket(data[i2], buffers);
      }
      return newData;
    } else if (typeof data === "object" && !(data instanceof Date)) {
      const newData = {};
      for (const key in data) {
        if (Object.prototype.hasOwnProperty.call(data, key)) {
          newData[key] = _deconstructPacket(data[key], buffers);
        }
      }
      return newData;
    }
    return data;
  }
  function reconstructPacket(packet, buffers) {
    packet.data = _reconstructPacket(packet.data, buffers);
    delete packet.attachments;
    return packet;
  }
  function _reconstructPacket(data, buffers) {
    if (!data)
      return data;
    if (data && data._placeholder === true) {
      const isIndexValid = typeof data.num === "number" && data.num >= 0 && data.num < buffers.length;
      if (isIndexValid) {
        return buffers[data.num];
      } else {
        throw new Error("illegal attachments");
      }
    } else if (Array.isArray(data)) {
      for (let i2 = 0; i2 < data.length; i2++) {
        data[i2] = _reconstructPacket(data[i2], buffers);
      }
    } else if (typeof data === "object") {
      for (const key in data) {
        if (Object.prototype.hasOwnProperty.call(data, key)) {
          data[key] = _reconstructPacket(data[key], buffers);
        }
      }
    }
    return data;
  }

  // node_modules/socket.io-parser/build/esm/index.js
  var RESERVED_EVENTS = [
    "connect",
    "connect_error",
    "disconnect",
    "disconnecting",
    "newListener",
    "removeListener"
  ];
  var protocol3 = 5;
  var PacketType;
  (function(PacketType2) {
    PacketType2[PacketType2["CONNECT"] = 0] = "CONNECT";
    PacketType2[PacketType2["DISCONNECT"] = 1] = "DISCONNECT";
    PacketType2[PacketType2["EVENT"] = 2] = "EVENT";
    PacketType2[PacketType2["ACK"] = 3] = "ACK";
    PacketType2[PacketType2["CONNECT_ERROR"] = 4] = "CONNECT_ERROR";
    PacketType2[PacketType2["BINARY_EVENT"] = 5] = "BINARY_EVENT";
    PacketType2[PacketType2["BINARY_ACK"] = 6] = "BINARY_ACK";
  })(PacketType || (PacketType = {}));
  var Encoder = class {
    constructor(replacer) {
      this.replacer = replacer;
    }
    encode(obj2) {
      if (obj2.type === PacketType.EVENT || obj2.type === PacketType.ACK) {
        if (hasBinary(obj2)) {
          return this.encodeAsBinary({
            type: obj2.type === PacketType.EVENT ? PacketType.BINARY_EVENT : PacketType.BINARY_ACK,
            nsp: obj2.nsp,
            data: obj2.data,
            id: obj2.id
          });
        }
      }
      return [this.encodeAsString(obj2)];
    }
    encodeAsString(obj2) {
      let str2 = "" + obj2.type;
      if (obj2.type === PacketType.BINARY_EVENT || obj2.type === PacketType.BINARY_ACK) {
        str2 += obj2.attachments + "-";
      }
      if (obj2.nsp && "/" !== obj2.nsp) {
        str2 += obj2.nsp + ",";
      }
      if (null != obj2.id) {
        str2 += obj2.id;
      }
      if (null != obj2.data) {
        str2 += JSON.stringify(obj2.data, this.replacer);
      }
      return str2;
    }
    encodeAsBinary(obj2) {
      const deconstruction = deconstructPacket(obj2);
      const pack = this.encodeAsString(deconstruction.packet);
      const buffers = deconstruction.buffers;
      buffers.unshift(pack);
      return buffers;
    }
  };
  function isObject2(value2) {
    return Object.prototype.toString.call(value2) === "[object Object]";
  }
  var Decoder = class extends Emitter {
    constructor(reviver) {
      super();
      this.reviver = reviver;
    }
    add(obj2) {
      let packet;
      if (typeof obj2 === "string") {
        if (this.reconstructor) {
          throw new Error("got plaintext data when reconstructing a packet");
        }
        packet = this.decodeString(obj2);
        const isBinaryEvent = packet.type === PacketType.BINARY_EVENT;
        if (isBinaryEvent || packet.type === PacketType.BINARY_ACK) {
          packet.type = isBinaryEvent ? PacketType.EVENT : PacketType.ACK;
          this.reconstructor = new BinaryReconstructor(packet);
          if (packet.attachments === 0) {
            super.emitReserved("decoded", packet);
          }
        } else {
          super.emitReserved("decoded", packet);
        }
      } else if (isBinary(obj2) || obj2.base64) {
        if (!this.reconstructor) {
          throw new Error("got binary data when not reconstructing a packet");
        } else {
          packet = this.reconstructor.takeBinaryData(obj2);
          if (packet) {
            this.reconstructor = null;
            super.emitReserved("decoded", packet);
          }
        }
      } else {
        throw new Error("Unknown type: " + obj2);
      }
    }
    decodeString(str2) {
      let i2 = 0;
      const p = {
        type: Number(str2.charAt(0))
      };
      if (PacketType[p.type] === void 0) {
        throw new Error("unknown packet type " + p.type);
      }
      if (p.type === PacketType.BINARY_EVENT || p.type === PacketType.BINARY_ACK) {
        const start = i2 + 1;
        while (str2.charAt(++i2) !== "-" && i2 != str2.length) {
        }
        const buf2 = str2.substring(start, i2);
        if (buf2 != Number(buf2) || str2.charAt(i2) !== "-") {
          throw new Error("Illegal attachments");
        }
        p.attachments = Number(buf2);
      }
      if ("/" === str2.charAt(i2 + 1)) {
        const start = i2 + 1;
        while (++i2) {
          const c = str2.charAt(i2);
          if ("," === c)
            break;
          if (i2 === str2.length)
            break;
        }
        p.nsp = str2.substring(start, i2);
      } else {
        p.nsp = "/";
      }
      const next = str2.charAt(i2 + 1);
      if ("" !== next && Number(next) == next) {
        const start = i2 + 1;
        while (++i2) {
          const c = str2.charAt(i2);
          if (null == c || Number(c) != c) {
            --i2;
            break;
          }
          if (i2 === str2.length)
            break;
        }
        p.id = Number(str2.substring(start, i2 + 1));
      }
      if (str2.charAt(++i2)) {
        const payload = this.tryParse(str2.substr(i2));
        if (Decoder.isPayloadValid(p.type, payload)) {
          p.data = payload;
        } else {
          throw new Error("invalid payload");
        }
      }
      return p;
    }
    tryParse(str2) {
      try {
        return JSON.parse(str2, this.reviver);
      } catch (e) {
        return false;
      }
    }
    static isPayloadValid(type, payload) {
      switch (type) {
        case PacketType.CONNECT:
          return isObject2(payload);
        case PacketType.DISCONNECT:
          return payload === void 0;
        case PacketType.CONNECT_ERROR:
          return typeof payload === "string" || isObject2(payload);
        case PacketType.EVENT:
        case PacketType.BINARY_EVENT:
          return Array.isArray(payload) && (typeof payload[0] === "number" || typeof payload[0] === "string" && RESERVED_EVENTS.indexOf(payload[0]) === -1);
        case PacketType.ACK:
        case PacketType.BINARY_ACK:
          return Array.isArray(payload);
      }
    }
    destroy() {
      if (this.reconstructor) {
        this.reconstructor.finishedReconstruction();
        this.reconstructor = null;
      }
    }
  };
  var BinaryReconstructor = class {
    constructor(packet) {
      this.packet = packet;
      this.buffers = [];
      this.reconPack = packet;
    }
    takeBinaryData(binData) {
      this.buffers.push(binData);
      if (this.buffers.length === this.reconPack.attachments) {
        const packet = reconstructPacket(this.reconPack, this.buffers);
        this.finishedReconstruction();
        return packet;
      }
      return null;
    }
    finishedReconstruction() {
      this.reconPack = null;
      this.buffers = [];
    }
  };

  // node_modules/socket.io-client/build/esm/on.js
  function on(obj2, ev, fn) {
    obj2.on(ev, fn);
    return function subDestroy() {
      obj2.off(ev, fn);
    };
  }

  // node_modules/socket.io-client/build/esm/socket.js
  var RESERVED_EVENTS2 = Object.freeze({
    connect: 1,
    connect_error: 1,
    disconnect: 1,
    disconnecting: 1,
    newListener: 1,
    removeListener: 1
  });
  var Socket2 = class extends Emitter {
    constructor(io, nsp, opts) {
      super();
      this.connected = false;
      this.recovered = false;
      this.receiveBuffer = [];
      this.sendBuffer = [];
      this._queue = [];
      this._queueSeq = 0;
      this.ids = 0;
      this.acks = {};
      this.flags = {};
      this.io = io;
      this.nsp = nsp;
      if (opts && opts.auth) {
        this.auth = opts.auth;
      }
      this._opts = Object.assign({}, opts);
      if (this.io._autoConnect)
        this.open();
    }
    get disconnected() {
      return !this.connected;
    }
    subEvents() {
      if (this.subs)
        return;
      const io = this.io;
      this.subs = [
        on(io, "open", this.onopen.bind(this)),
        on(io, "packet", this.onpacket.bind(this)),
        on(io, "error", this.onerror.bind(this)),
        on(io, "close", this.onclose.bind(this))
      ];
    }
    get active() {
      return !!this.subs;
    }
    connect() {
      if (this.connected)
        return this;
      this.subEvents();
      if (!this.io["_reconnecting"])
        this.io.open();
      if ("open" === this.io._readyState)
        this.onopen();
      return this;
    }
    open() {
      return this.connect();
    }
    send(...args) {
      args.unshift("message");
      this.emit.apply(this, args);
      return this;
    }
    emit(ev, ...args) {
      if (RESERVED_EVENTS2.hasOwnProperty(ev)) {
        throw new Error('"' + ev.toString() + '" is a reserved event name');
      }
      args.unshift(ev);
      if (this._opts.retries && !this.flags.fromQueue && !this.flags.volatile) {
        this._addToQueue(args);
        return this;
      }
      const packet = {
        type: PacketType.EVENT,
        data: args
      };
      packet.options = {};
      packet.options.compress = this.flags.compress !== false;
      if ("function" === typeof args[args.length - 1]) {
        const id = this.ids++;
        const ack = args.pop();
        this._registerAckCallback(id, ack);
        packet.id = id;
      }
      const isTransportWritable = this.io.engine && this.io.engine.transport && this.io.engine.transport.writable;
      const discardPacket = this.flags.volatile && (!isTransportWritable || !this.connected);
      if (discardPacket) {
      } else if (this.connected) {
        this.notifyOutgoingListeners(packet);
        this.packet(packet);
      } else {
        this.sendBuffer.push(packet);
      }
      this.flags = {};
      return this;
    }
    _registerAckCallback(id, ack) {
      var _a;
      const timeout = (_a = this.flags.timeout) !== null && _a !== void 0 ? _a : this._opts.ackTimeout;
      if (timeout === void 0) {
        this.acks[id] = ack;
        return;
      }
      const timer = this.io.setTimeoutFn(() => {
        delete this.acks[id];
        for (let i2 = 0; i2 < this.sendBuffer.length; i2++) {
          if (this.sendBuffer[i2].id === id) {
            this.sendBuffer.splice(i2, 1);
          }
        }
        ack.call(this, new Error("operation has timed out"));
      }, timeout);
      this.acks[id] = (...args) => {
        this.io.clearTimeoutFn(timer);
        ack.apply(this, [null, ...args]);
      };
    }
    emitWithAck(ev, ...args) {
      const withErr = this.flags.timeout !== void 0 || this._opts.ackTimeout !== void 0;
      return new Promise((resolve, reject) => {
        args.push((arg1, arg2) => {
          if (withErr) {
            return arg1 ? reject(arg1) : resolve(arg2);
          } else {
            return resolve(arg1);
          }
        });
        this.emit(ev, ...args);
      });
    }
    _addToQueue(args) {
      let ack;
      if (typeof args[args.length - 1] === "function") {
        ack = args.pop();
      }
      const packet = {
        id: this._queueSeq++,
        tryCount: 0,
        pending: false,
        args,
        flags: Object.assign({ fromQueue: true }, this.flags)
      };
      args.push((err, ...responseArgs) => {
        if (packet !== this._queue[0]) {
          return;
        }
        const hasError = err !== null;
        if (hasError) {
          if (packet.tryCount > this._opts.retries) {
            this._queue.shift();
            if (ack) {
              ack(err);
            }
          }
        } else {
          this._queue.shift();
          if (ack) {
            ack(null, ...responseArgs);
          }
        }
        packet.pending = false;
        return this._drainQueue();
      });
      this._queue.push(packet);
      this._drainQueue();
    }
    _drainQueue(force = false) {
      if (!this.connected || this._queue.length === 0) {
        return;
      }
      const packet = this._queue[0];
      if (packet.pending && !force) {
        return;
      }
      packet.pending = true;
      packet.tryCount++;
      this.flags = packet.flags;
      this.emit.apply(this, packet.args);
    }
    packet(packet) {
      packet.nsp = this.nsp;
      this.io._packet(packet);
    }
    onopen() {
      if (typeof this.auth == "function") {
        this.auth((data) => {
          this._sendConnectPacket(data);
        });
      } else {
        this._sendConnectPacket(this.auth);
      }
    }
    _sendConnectPacket(data) {
      this.packet({
        type: PacketType.CONNECT,
        data: this._pid ? Object.assign({ pid: this._pid, offset: this._lastOffset }, data) : data
      });
    }
    onerror(err) {
      if (!this.connected) {
        this.emitReserved("connect_error", err);
      }
    }
    onclose(reason, description) {
      this.connected = false;
      delete this.id;
      this.emitReserved("disconnect", reason, description);
    }
    onpacket(packet) {
      const sameNamespace = packet.nsp === this.nsp;
      if (!sameNamespace)
        return;
      switch (packet.type) {
        case PacketType.CONNECT:
          if (packet.data && packet.data.sid) {
            this.onconnect(packet.data.sid, packet.data.pid);
          } else {
            this.emitReserved("connect_error", new Error("It seems you are trying to reach a Socket.IO server in v2.x with a v3.x client, but they are not compatible (more information here: https://socket.io/docs/v3/migrating-from-2-x-to-3-0/)"));
          }
          break;
        case PacketType.EVENT:
        case PacketType.BINARY_EVENT:
          this.onevent(packet);
          break;
        case PacketType.ACK:
        case PacketType.BINARY_ACK:
          this.onack(packet);
          break;
        case PacketType.DISCONNECT:
          this.ondisconnect();
          break;
        case PacketType.CONNECT_ERROR:
          this.destroy();
          const err = new Error(packet.data.message);
          err.data = packet.data.data;
          this.emitReserved("connect_error", err);
          break;
      }
    }
    onevent(packet) {
      const args = packet.data || [];
      if (null != packet.id) {
        args.push(this.ack(packet.id));
      }
      if (this.connected) {
        this.emitEvent(args);
      } else {
        this.receiveBuffer.push(Object.freeze(args));
      }
    }
    emitEvent(args) {
      if (this._anyListeners && this._anyListeners.length) {
        const listeners = this._anyListeners.slice();
        for (const listener of listeners) {
          listener.apply(this, args);
        }
      }
      super.emit.apply(this, args);
      if (this._pid && args.length && typeof args[args.length - 1] === "string") {
        this._lastOffset = args[args.length - 1];
      }
    }
    ack(id) {
      const self2 = this;
      let sent = false;
      return function(...args) {
        if (sent)
          return;
        sent = true;
        self2.packet({
          type: PacketType.ACK,
          id,
          data: args
        });
      };
    }
    onack(packet) {
      const ack = this.acks[packet.id];
      if ("function" === typeof ack) {
        ack.apply(this, packet.data);
        delete this.acks[packet.id];
      } else {
      }
    }
    onconnect(id, pid) {
      this.id = id;
      this.recovered = pid && this._pid === pid;
      this._pid = pid;
      this.connected = true;
      this.emitBuffered();
      this.emitReserved("connect");
      this._drainQueue(true);
    }
    emitBuffered() {
      this.receiveBuffer.forEach((args) => this.emitEvent(args));
      this.receiveBuffer = [];
      this.sendBuffer.forEach((packet) => {
        this.notifyOutgoingListeners(packet);
        this.packet(packet);
      });
      this.sendBuffer = [];
    }
    ondisconnect() {
      this.destroy();
      this.onclose("io server disconnect");
    }
    destroy() {
      if (this.subs) {
        this.subs.forEach((subDestroy) => subDestroy());
        this.subs = void 0;
      }
      this.io["_destroy"](this);
    }
    disconnect() {
      if (this.connected) {
        this.packet({ type: PacketType.DISCONNECT });
      }
      this.destroy();
      if (this.connected) {
        this.onclose("io client disconnect");
      }
      return this;
    }
    close() {
      return this.disconnect();
    }
    compress(compress) {
      this.flags.compress = compress;
      return this;
    }
    get volatile() {
      this.flags.volatile = true;
      return this;
    }
    timeout(timeout) {
      this.flags.timeout = timeout;
      return this;
    }
    onAny(listener) {
      this._anyListeners = this._anyListeners || [];
      this._anyListeners.push(listener);
      return this;
    }
    prependAny(listener) {
      this._anyListeners = this._anyListeners || [];
      this._anyListeners.unshift(listener);
      return this;
    }
    offAny(listener) {
      if (!this._anyListeners) {
        return this;
      }
      if (listener) {
        const listeners = this._anyListeners;
        for (let i2 = 0; i2 < listeners.length; i2++) {
          if (listener === listeners[i2]) {
            listeners.splice(i2, 1);
            return this;
          }
        }
      } else {
        this._anyListeners = [];
      }
      return this;
    }
    listenersAny() {
      return this._anyListeners || [];
    }
    onAnyOutgoing(listener) {
      this._anyOutgoingListeners = this._anyOutgoingListeners || [];
      this._anyOutgoingListeners.push(listener);
      return this;
    }
    prependAnyOutgoing(listener) {
      this._anyOutgoingListeners = this._anyOutgoingListeners || [];
      this._anyOutgoingListeners.unshift(listener);
      return this;
    }
    offAnyOutgoing(listener) {
      if (!this._anyOutgoingListeners) {
        return this;
      }
      if (listener) {
        const listeners = this._anyOutgoingListeners;
        for (let i2 = 0; i2 < listeners.length; i2++) {
          if (listener === listeners[i2]) {
            listeners.splice(i2, 1);
            return this;
          }
        }
      } else {
        this._anyOutgoingListeners = [];
      }
      return this;
    }
    listenersAnyOutgoing() {
      return this._anyOutgoingListeners || [];
    }
    notifyOutgoingListeners(packet) {
      if (this._anyOutgoingListeners && this._anyOutgoingListeners.length) {
        const listeners = this._anyOutgoingListeners.slice();
        for (const listener of listeners) {
          listener.apply(this, packet.data);
        }
      }
    }
  };

  // node_modules/socket.io-client/build/esm/contrib/backo2.js
  function Backoff(opts) {
    opts = opts || {};
    this.ms = opts.min || 100;
    this.max = opts.max || 1e4;
    this.factor = opts.factor || 2;
    this.jitter = opts.jitter > 0 && opts.jitter <= 1 ? opts.jitter : 0;
    this.attempts = 0;
  }
  Backoff.prototype.duration = function() {
    var ms = this.ms * Math.pow(this.factor, this.attempts++);
    if (this.jitter) {
      var rand = Math.random();
      var deviation = Math.floor(rand * this.jitter * ms);
      ms = (Math.floor(rand * 10) & 1) == 0 ? ms - deviation : ms + deviation;
    }
    return Math.min(ms, this.max) | 0;
  };
  Backoff.prototype.reset = function() {
    this.attempts = 0;
  };
  Backoff.prototype.setMin = function(min) {
    this.ms = min;
  };
  Backoff.prototype.setMax = function(max) {
    this.max = max;
  };
  Backoff.prototype.setJitter = function(jitter) {
    this.jitter = jitter;
  };

  // node_modules/socket.io-client/build/esm/manager.js
  var Manager = class extends Emitter {
    constructor(uri, opts) {
      var _a;
      super();
      this.nsps = {};
      this.subs = [];
      if (uri && "object" === typeof uri) {
        opts = uri;
        uri = void 0;
      }
      opts = opts || {};
      opts.path = opts.path || "/socket.io";
      this.opts = opts;
      installTimerFunctions(this, opts);
      this.reconnection(opts.reconnection !== false);
      this.reconnectionAttempts(opts.reconnectionAttempts || Infinity);
      this.reconnectionDelay(opts.reconnectionDelay || 1e3);
      this.reconnectionDelayMax(opts.reconnectionDelayMax || 5e3);
      this.randomizationFactor((_a = opts.randomizationFactor) !== null && _a !== void 0 ? _a : 0.5);
      this.backoff = new Backoff({
        min: this.reconnectionDelay(),
        max: this.reconnectionDelayMax(),
        jitter: this.randomizationFactor()
      });
      this.timeout(null == opts.timeout ? 2e4 : opts.timeout);
      this._readyState = "closed";
      this.uri = uri;
      const _parser = opts.parser || esm_exports;
      this.encoder = new _parser.Encoder();
      this.decoder = new _parser.Decoder();
      this._autoConnect = opts.autoConnect !== false;
      if (this._autoConnect)
        this.open();
    }
    reconnection(v) {
      if (!arguments.length)
        return this._reconnection;
      this._reconnection = !!v;
      return this;
    }
    reconnectionAttempts(v) {
      if (v === void 0)
        return this._reconnectionAttempts;
      this._reconnectionAttempts = v;
      return this;
    }
    reconnectionDelay(v) {
      var _a;
      if (v === void 0)
        return this._reconnectionDelay;
      this._reconnectionDelay = v;
      (_a = this.backoff) === null || _a === void 0 ? void 0 : _a.setMin(v);
      return this;
    }
    randomizationFactor(v) {
      var _a;
      if (v === void 0)
        return this._randomizationFactor;
      this._randomizationFactor = v;
      (_a = this.backoff) === null || _a === void 0 ? void 0 : _a.setJitter(v);
      return this;
    }
    reconnectionDelayMax(v) {
      var _a;
      if (v === void 0)
        return this._reconnectionDelayMax;
      this._reconnectionDelayMax = v;
      (_a = this.backoff) === null || _a === void 0 ? void 0 : _a.setMax(v);
      return this;
    }
    timeout(v) {
      if (!arguments.length)
        return this._timeout;
      this._timeout = v;
      return this;
    }
    maybeReconnectOnOpen() {
      if (!this._reconnecting && this._reconnection && this.backoff.attempts === 0) {
        this.reconnect();
      }
    }
    open(fn) {
      if (~this._readyState.indexOf("open"))
        return this;
      this.engine = new Socket(this.uri, this.opts);
      const socket2 = this.engine;
      const self2 = this;
      this._readyState = "opening";
      this.skipReconnect = false;
      const openSubDestroy = on(socket2, "open", function() {
        self2.onopen();
        fn && fn();
      });
      const onError = (err) => {
        this.cleanup();
        this._readyState = "closed";
        this.emitReserved("error", err);
        if (fn) {
          fn(err);
        } else {
          this.maybeReconnectOnOpen();
        }
      };
      const errorSub = on(socket2, "error", onError);
      if (false !== this._timeout) {
        const timeout = this._timeout;
        const timer = this.setTimeoutFn(() => {
          openSubDestroy();
          onError(new Error("timeout"));
          socket2.close();
        }, timeout);
        if (this.opts.autoUnref) {
          timer.unref();
        }
        this.subs.push(() => {
          this.clearTimeoutFn(timer);
        });
      }
      this.subs.push(openSubDestroy);
      this.subs.push(errorSub);
      return this;
    }
    connect(fn) {
      return this.open(fn);
    }
    onopen() {
      this.cleanup();
      this._readyState = "open";
      this.emitReserved("open");
      const socket2 = this.engine;
      this.subs.push(on(socket2, "ping", this.onping.bind(this)), on(socket2, "data", this.ondata.bind(this)), on(socket2, "error", this.onerror.bind(this)), on(socket2, "close", this.onclose.bind(this)), on(this.decoder, "decoded", this.ondecoded.bind(this)));
    }
    onping() {
      this.emitReserved("ping");
    }
    ondata(data) {
      try {
        this.decoder.add(data);
      } catch (e) {
        this.onclose("parse error", e);
      }
    }
    ondecoded(packet) {
      nextTick(() => {
        this.emitReserved("packet", packet);
      }, this.setTimeoutFn);
    }
    onerror(err) {
      this.emitReserved("error", err);
    }
    socket(nsp, opts) {
      let socket2 = this.nsps[nsp];
      if (!socket2) {
        socket2 = new Socket2(this, nsp, opts);
        this.nsps[nsp] = socket2;
      } else if (this._autoConnect && !socket2.active) {
        socket2.connect();
      }
      return socket2;
    }
    _destroy(socket2) {
      const nsps = Object.keys(this.nsps);
      for (const nsp of nsps) {
        const socket3 = this.nsps[nsp];
        if (socket3.active) {
          return;
        }
      }
      this._close();
    }
    _packet(packet) {
      const encodedPackets = this.encoder.encode(packet);
      for (let i2 = 0; i2 < encodedPackets.length; i2++) {
        this.engine.write(encodedPackets[i2], packet.options);
      }
    }
    cleanup() {
      this.subs.forEach((subDestroy) => subDestroy());
      this.subs.length = 0;
      this.decoder.destroy();
    }
    _close() {
      this.skipReconnect = true;
      this._reconnecting = false;
      this.onclose("forced close");
      if (this.engine)
        this.engine.close();
    }
    disconnect() {
      return this._close();
    }
    onclose(reason, description) {
      this.cleanup();
      this.backoff.reset();
      this._readyState = "closed";
      this.emitReserved("close", reason, description);
      if (this._reconnection && !this.skipReconnect) {
        this.reconnect();
      }
    }
    reconnect() {
      if (this._reconnecting || this.skipReconnect)
        return this;
      const self2 = this;
      if (this.backoff.attempts >= this._reconnectionAttempts) {
        this.backoff.reset();
        this.emitReserved("reconnect_failed");
        this._reconnecting = false;
      } else {
        const delay = this.backoff.duration();
        this._reconnecting = true;
        const timer = this.setTimeoutFn(() => {
          if (self2.skipReconnect)
            return;
          this.emitReserved("reconnect_attempt", self2.backoff.attempts);
          if (self2.skipReconnect)
            return;
          self2.open((err) => {
            if (err) {
              self2._reconnecting = false;
              self2.reconnect();
              this.emitReserved("reconnect_error", err);
            } else {
              self2.onreconnect();
            }
          });
        }, delay);
        if (this.opts.autoUnref) {
          timer.unref();
        }
        this.subs.push(() => {
          this.clearTimeoutFn(timer);
        });
      }
    }
    onreconnect() {
      const attempt = this.backoff.attempts;
      this._reconnecting = false;
      this.backoff.reset();
      this.emitReserved("reconnect", attempt);
    }
  };

  // node_modules/socket.io-client/build/esm/index.js
  var cache = {};
  function lookup2(uri, opts) {
    if (typeof uri === "object") {
      opts = uri;
      uri = void 0;
    }
    opts = opts || {};
    const parsed = url(uri, opts.path || "/socket.io");
    const source = parsed.source;
    const id = parsed.id;
    const path = parsed.path;
    const sameNamespace = cache[id] && path in cache[id]["nsps"];
    const newConnection = opts.forceNew || opts["force new connection"] || false === opts.multiplex || sameNamespace;
    let io;
    if (newConnection) {
      io = new Manager(source, opts);
    } else {
      if (!cache[id]) {
        cache[id] = new Manager(source, opts);
      }
      io = cache[id];
    }
    if (parsed.query && !opts.query) {
      opts.query = parsed.queryKey;
    }
    return io.socket(parsed.path, opts);
  }
  Object.assign(lookup2, {
    Manager,
    Socket: Socket2,
    io: lookup2,
    connect: lookup2
  });

  // src-bex/utils/UtilInfo.ts
  var UtilInfo = class {
    static async getIpInfo(ip) {
      const url3 = ip ? `${this.API_URL}&ip=${ip}` : this.API_URL;
      const data = await axios_default.get(url3).then((r) => r.data);
      return data;
    }
  };
  __publicField(UtilInfo, "API_URL", "http://whois.pconline.com.cn/ipJson.jsp?json=true");
  var UtilInfo_default = UtilInfo;

  // src-bex/operate/Device.cst.ts
  var DeviceType = {
    BROWSER: 0,
    DESKTOP: 1,
    APP_H5: 2,
    ANDROID: 3,
    IOS: 4
  };

  // src-bex/utils/UtilDevice.ts
  var isElectron = () => {
    return window && window.process && window.process.type;
  };
  var isChromeExtension = () => {
    return window && window.chrome && window.chrome.runtime && window.chrome.runtime.id;
  };
  var UtilDevice = class {
    static getInfo() {
      if (isElectron()) {
        const os = {};
        return {
          platform: os.platform(),
          release: os.release(),
          hostname: os.hostname(),
          arch: os.arch(),
          totalMem: os.totalmem(),
          freeMem: os.freemem(),
          cpuCount: os.cpus().length
        };
      } else {
        return {
          userAgent: navigator.userAgent,
          platform: navigator.platform,
          language: navigator.language,
          online: navigator.onLine
        };
      }
    }
    static getBrowserInfo(userAgent) {
      const browsers = [
        { name: "Chrome Canary", regex: /Chrome\/(\S+).*\s+Edg\// },
        { name: "Edge", regex: /Edg\/(\S+)/ },
        { name: "Chrome", regex: /Chrome\/(\S+).*\s+Safari\// },
        { name: "Firefox", regex: /Firefox\/(\S+)/ },
        { name: "Safari", regex: /Safari\/(\S+)/ },
        { name: "IE", regex: /MSIE (\S+);/ }
      ];
      for (const browser of browsers) {
        const match = userAgent.match(browser.regex);
        if (match) {
          return `${browser.name} ${match[1]}`;
        }
      }
      return userAgent;
    }
    static getInfoStr() {
      const info = this.getInfo();
      if (isElectron()) {
        return `Electron on ${info.platform} ${info.release}`;
      } else {
        return this.getBrowserInfo(info.userAgent);
      }
    }
    static generateRandomString(length2) {
      let result = "";
      const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
      const charactersLength = characters.length;
      for (let i2 = 0; i2 < length2; i2++) {
        result += characters.charAt(Math.floor(Math.random() * charactersLength));
      }
      return result;
    }
    static async getAppId() {
      let appDeviceId = "";
      if (isChromeExtension()) {
        appDeviceId = await getObjectFromLocalStorage("appDeviceId");
        if (appDeviceId && appDeviceId.length == 16)
          return appDeviceId;
        appDeviceId = this.generateRandomString(16);
        saveObjectInLocalStorage({ "appDeviceId": appDeviceId });
      } else {
        appDeviceId = localStorage.getItem("appDeviceId") || "";
        if (appDeviceId && appDeviceId.length == 16)
          return appDeviceId;
        appDeviceId = this.generateRandomString(16);
        localStorage.setItem("appDeviceId", appDeviceId);
      }
      console.log("appDeviceId:", appDeviceId);
      return appDeviceId;
    }
    static async getAppIdInfo() {
      let info = {};
      if (isChromeExtension()) {
        info = {
          type: DeviceType.BROWSER,
          chromeId: window.chrome.runtime.id,
          appDeviceId: await this.getAppId()
        };
      }
      return info;
    }
  };
  var UtilDevice_default = UtilDevice;

  // src-bex/operate/EventOperate.cst.ts
  var EVENT_OPERATE = {
    SCRIPT_RUN: "SCRIPT_RUN",
    SCRIPT_STOP: "SCRIPT_STOP",
    SCRIPT_RUN_BY_API: "SCRIPT_RUN_BY_API",
    SCRIPT_STOP_BY_API: "SCRIPT_STOP_BY_API",
    DEVICE_USER_INFO: "OPERATE_DEVICE_USER_INFO",
    DEVICE_USER_INFO_UNBIND: "OPERATE_DEVICE_USER_INFO_UNBIND",
    DEVICE_INFO: "OPERATE_DEVICE_INFO"
  };

  // src-bex/utils/UtilScrpt.ts
  function wrapAsync(code) {
    const hasTry = code.includes('globalThis.Console && Console.error("error in wrapAsync:", e )');
    return hasTry ? code : `
        try {
            ${code}
        } catch(e) {
            console.log('script run error:', e);
            globalThis.Console && Console.open();
            globalThis.Console && Console.show();
            globalThis.Console && Console.error("error in wrapAsync:", e);
            globalThis.Console && Console.hide(10000);
            throw e;
        }
    `;
  }
  function formatJSON(input) {
    let obj;
    try {
      obj = JSON.parse(input);
      return JSON.stringify(obj);
    } catch (e) {
      console.error("Failed to convert input to JSON.");
      return input;
    }
  }

  // src-bex/controller/csdn.ts
  var csdnApp = {
    read: async (url3, deviceCode, vipcode) => {
        let apiUrl = globalThis.BASE_URL || "https://api.todo6.com";
        let api = `${apiUrl}/app/operate/csdn/read`;
        let api_key, token2;
        token2 = localStorage.token;
        vipcode = localStorage.csdn_vipcode;
        let res = await axios_default.get(api, { params: { url: url3, deviceCode, code: vipcode, token: token2, api_key, encode: "base64" } }).then((res2) => res2.data);
        return res;
    },
    save: async (url3, content, encode) => {
        let apiUrl = globalThis.BASE_URL || "https://api.todo6.com";
        let api = `${apiUrl}/app/operate/csdn/articleSave`;
        let api_key, token2;
        token2 = localStorage.token;
        let res = await axios_default.post(api, { url: url3, content, encode, token: token2, api_key }).then((res2) => res2.data);
        return res;
    },
    download: async (url3) => {
        let apiUrl = globalThis.BASE_URL || "https://api.todo6.com";
        let api = `${apiUrl}/app/operate/csdn/download`;
        let api_key, token2;
        token2 = localStorage.token;
        let res = await axios_default.get(api, { params: { url: url3, token: token2, api_key } }).then((res2) => res2.data);
        return res;
    },
    vipLogin: async (code, deviceCode) => {
        console.log("bg.js vipLogin:", code, deviceCode);
        let apiUrl = globalThis.BASE_URL || "https://api.todo6.com";
        let api = `${apiUrl}/open/operate/cardonce/use`;
        let res = await axios.get(api, { params: { code, deviceCode, type: "chrome", encode: 'base64' } }).then(res => res.data);
        return res;
    }
  };


  // src-bex/background.ts
  var timeReview;
  var intervalId;
  var countStart;
  var duration;
  var socket;
  var deviceInfo = {};
  var activeScrapyTask = null;

  var util = TraceTimeUtil;
  var url2;
  var title;
  function createRequestId(prefix = "bg") {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }
  function getRequestId(request) {
    const metaRequestId = request?.meta?.requestId;
    const topLevelRequestId = request?.requestId;
    if (
      typeof metaRequestId === "string" && metaRequestId.length > 0
      && typeof topLevelRequestId === "string" && topLevelRequestId.length > 0
      && metaRequestId !== topLevelRequestId
    ) {
      const err = new Error(`RequestId mismatch: expected ${topLevelRequestId}, received ${metaRequestId}`);
      err.errorCode = "E_REQUEST_ID_MISMATCH";
      err.requestId = metaRequestId;
      throw err;
    }
    const requestId = metaRequestId || topLevelRequestId;
    if (typeof requestId === "string" && requestId.length > 0) {
      return requestId;
    }
    return createRequestId("bg_auto");
  }
  function mapErrorCode(error, fallback = "E_INTERNAL") {
    const explicitCode = error?.errorCode || error?.code;
    if (typeof explicitCode === "string" && explicitCode.length > 0) {
      return explicitCode;
    }
    const message = String(error?.message || error || "");
    if (message.includes("missing BridgeEventName") || message.includes("No script provided")) {
      return "E_DETAIL_MISSING";
    }
    if (message.includes("Invalid BridgeEventName")) {
      return "E_MSG_INVALID";
    }
    if (message.includes("No active tab") || message.includes("Unable to resolve active tab")) {
      return "E_TAB_NOT_FOUND";
    }
    if (message.includes("TB.bridge.send is not available")) {
      return "E_BRIDGE_NOT_READY";
    }
    if (message.includes("selector is not available") || message.includes("Selector support")) {
      return "E_SELECTOR_NOT_READY";
    }
    if (message.includes("上一个爬虫任务仍在运行")) {
      return "E_TASK_ALREADY_RUNNING";
    }
    if (message.includes("脚本") || message.includes("executeScript") || message.includes("evaluate")) {
      return "E_SCRIPT_EXEC_FAIL";
    }
    return fallback;
  }
  function toSuccessResponse(result, requestId) {
    if (result?.type === "testMonkeyFramework") {
      return {
        ...result,
        requestId,
        errorCode: result?.success === false ? mapErrorCode(result?.error || result, "E_SCRIPT_EXEC_FAIL") : null
      };
    }
    return {
      success: true,
      requestId,
      errorCode: null,
      data: result
    };
  }
  function toErrorResponse(error, requestId, fallbackCode = "E_HANDLER_EXEC_FAIL") {
    return {
      success: false,
      requestId,
      errorCode: mapErrorCode(error, fallbackCode),
      error: error?.message || String(error)
    };
  }
  function isMessageEnvelopeLike(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return false;
    }
    return Object.prototype.hasOwnProperty.call(value, "type")
      || Object.prototype.hasOwnProperty.call(value, "detail")
      || Object.prototype.hasOwnProperty.call(value, "data")
      || Object.prototype.hasOwnProperty.call(value, "meta")
      || Object.prototype.hasOwnProperty.call(value, "requestId");
  }
  function normalizeDetail(request, options = {}) {
    const coercePrimitiveToScript = options.coercePrimitiveToScript !== false;
    const fromEnvelope = request?.detail ?? request?.data;
    if (typeof fromEnvelope !== "undefined") {
      if (Array.isArray(fromEnvelope)) {
        return { args: fromEnvelope };
      }
      if (fromEnvelope && typeof fromEnvelope === "object") {
        return fromEnvelope;
      }
      return coercePrimitiveToScript ? { script: String(fromEnvelope) } : {};
    }
    if (Array.isArray(request)) {
      return { args: request };
    }
    if (request && typeof request === "object" && !isMessageEnvelopeLike(request)) {
      return request;
    }
    return {};
  }
  function normalizeArgs(args) {
    if (Array.isArray(args)) {
      return args;
    }
    return args == null ? [] : [args];
  }
  async function handleChromeBridgePopup(request) {
    console.log('CHROME_BRIDGE_POPUP', 'ScrapyJs.selected_nextPageBtn' , request.data, request);
    const bridgeDetail = normalizeDetail(request, { coercePrimitiveToScript: false });
    const bridgeEventName = bridgeDetail?.BridgeEventName;
    if (!bridgeEventName || typeof bridgeEventName !== "string") {
      throw new Error("CHROME_BRIDGE_POPUP missing BridgeEventName");
    }
    let [moduleName, action] = bridgeEventName.split('.');
    if (!moduleName || !action) {
      throw new Error(`Invalid BridgeEventName: ${bridgeEventName}`);
    }
    if (!TB?.bridge || typeof TB.bridge.send !== "function") {
      throw new Error("TB.bridge.send is not available");
    }
    return await TB.bridge.send(moduleName, action, bridgeDetail); // 'ScrapyJs', 'selected_nextPageBtn'
  }
  const RUNTIME_MESSAGE_HANDLERS = {
    notifications: async (request) => await handleNotifications(request),
    chromeCustomEvt: async (request) => await handleChromeCustomEvent(request),
    CHROME_ENTENSION_TEST: async (request) => await handleChromeExtensionText(request),
    CHROME_BRIDGE_INTERFACE: async (request) => await handleChromeBridgeInterface(request),
    SCRAPYJS_RUN: async (request) => await handleScrapyJsRun(request),
    DIAGNOSE_PAGE_OBJECT: async () => await diagnosePageObject()
  };
  async function dispatchRuntimeMessage(customEvent, request, sender) {
    if (customEvent === 'mousemove') {
      if (request.type.includes('hid_')) {
        return await handleHidMouseMove(request);
      }
      return undefined;
    }
    if (customEvent === 'CHROME_PAGE_EXECUTE') {
      const pageDetail = normalizeDetail(request, { coercePrimitiveToScript: true });
      console.log("CHROME_PAGE_EXECUTE request received:", {
        source: sender?.url,
        hasDetail: Object.keys(pageDetail || {}).length > 0,
        scriptPreview: (pageDetail?.script || pageDetail?.code)?.slice?.(0, 200)
      });
      console.log("CHROME_PAGE_EXECUTE detail:", pageDetail);
      return await handleChromePageExecute(request, pageDetail);
    }
    if (customEvent === 'CHROME_BRIDGE_POPUP') {
      return await handleChromeBridgePopup(request);
    }
    const handler = RUNTIME_MESSAGE_HANDLERS[customEvent];
    if (handler) {
      return await handler(request, sender);
    }
    console.error("Unhandled CustomEvent type:", customEvent);
    return undefined;
  }
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // 移除前缀并处理所有消息
    const requestId = getRequestId(request);
    let customEvent = request.type?.replace('hid_', '');
    // console.log('request', request)
    if (!customEvent) return;

    // 为了使sendResponse能等待异步操作完成，需要返回true
    (async () => {
        try {
            const result = await dispatchRuntimeMessage(customEvent, request, sender);
            console.log('chrome.runtime.onMessage.addListener resule:' , result );
            sendResponse(toSuccessResponse(result, requestId));
        } catch (error) {
            console.error("Error processing message:", error);
            sendResponse(toErrorResponse(error, requestId));
        }
    })();

    // 返回true表示我们将异步发送响应
    return true;
  });
  // 示例：处理隐藏的鼠标移动事件
  async function handleHidMouseMove(request) {
    let url, title;
    url = request.url, title = request.title;
    if (request.type && !request.type.includes('hid_mousemove')) console.log("Handling hid mousemove event", request, url, title);

    if (!url || !title) return; //还没获取到关键数据,不用发送；很小的延迟.
    localStorage.currUrl = url, localStorage.currTitle = title;

    if ((request.active === 'true') || (request.active === true)) {
      if (!url || !title) return; //还没获取到关键数据,不用发送；很小的延迟.
      localStorage.currUrl = url, localStorage.currTitle = title;
      timeReview?.addAction({ duration: 0, timestamp: new Date().getTime(), path: url, title, action: request.type.replace('hid_', ''), app: 1 }); // 1=='chrome' util.getBrowser()
    }
  }

  // 示例：处理通知
  function handleNotifications(request) {
    let timeMsg = request.time ? `${request.time}分钟` : '';
    chrome.notifications.create('', {
      title: '网站屏蔽:',
      message: `剩余时间：${timeMsg}`,
      iconUrl: '../icons/icon48.png',
      type: 'basic'
    });
  }

  // 示例：处理自定义Chrome事件
  function handleChromeCustomEvent(request) {
    let data = request.detail;
    console.log('Handling Chrome custom event with detail:', data);
    // 这里可以基于data执行具体操作，比如更新界面、存储数据等
  }
  async function handleChromeExtensionText(request){
    console.log('test time' , new Date().getTime() )
    await sleep(2000);
    console.log('test time' , new Date().getTime() )
    return new Date().getTime();
  }

  // 示例：处理Chrome桥接接口
  async function handleChromeBridgeInterface(request) {
    let detail = normalizeDetail(request, { coercePrimitiveToScript: false });
    const requestId = getRequestId(request);
    if (!detail || typeof detail !== "object") {
      const err = new Error("CHROME_BRIDGE_INTERFACE detail missing");
      err.errorCode = "E_DETAIL_MISSING";
      throw err;
    }
    let { BridgeEventName, BridgeEventId, BridgeUrl_Inject, ...data } = detail;
    if (!BridgeEventName) {
      const err = new Error("CHROME_BRIDGE_INTERFACE missing BridgeEventName");
      err.errorCode = "E_DETAIL_MISSING";
      throw err;
    }
    let res;
    try {
      let {  eventId } = data || {};  // BridgeEventName, BridgeEventId, BridgeUrl_Inject,
      delete data.BridgeEventName, delete data.BridgeEventId, delete data.BridgeUrl_Inject, delete data.eventId;
      let api = BridgeUrl_Inject;
      let { url , token , key } = data;
      // console.log('page content CHROME_BRIDGE_INTERFACE:', BridgeEventName, data, api)
      if ( token && token.includes('${token}')) {
        data.token = token.replace( '${token}' , localStorage.token )
      }
      if ( BridgeEventName && BridgeEventName.startsWith("AXIOS_")){
        if ( url && !url.startsWith("http") ) url = BASE_URL + '/' + url;
        console.log("axios url:", {url , BASE_URL})
      }
      if (BridgeEventName == 'AXIOS_GET') {
        res = await axios.get(api, data.config).catch(e => { });  // .then(r => r.data)
      }
      else if (BridgeEventName == 'AXIOS_POST') {
        let { config, ...postData } = data;
        res = await axios.post(api, postData.data, config).catch(e => { });
      }
      else if (BridgeEventName == 'AXIOS_PUT') {
        let { config, ...putData } = data;
        res = await axios.put(api, putData.data, config).catch(e => { });
      }
      else if (BridgeEventName == 'AXIOS_DELETE') {
        res = await axios.delete(api, data.config).catch(e => { });
      }

      if ( BridgeEventName == 'APPSTORAGE_SETITEM'){
        localStorage.setItem(key, data.value)
      } else if ( BridgeEventName == 'APPSTORAGE_GETITEM' ){
        res = localStorage.getItem(key);
      } else if ( BridgeEventName == 'APPSTORAGE_REMOVEITEM' ){
        res = localStorage.removeItem(key)
      } else if ( BridgeEventName == 'APPSTORAGE_CLEAR' ){
        res = localStorage.clear();
      } else if ( BridgeEventName == 'APPLOCAL_SETITEM') {
        globalThis[key] = data.value;
      } else if ( BridgeEventName == 'APPLOCAL_GETITEM') {
        res = globalThis[key]
      } else if ( BridgeEventName == 'APPLOCAL_REMOVEITEM') {
        if (globalThis.hasOwnProperty(key)) {
          delete globalThis[key];
        }
      }

      if ( BridgeEventName == 'setWebRequestListener' ){

      }

      if ( BridgeEventName == "CREATE_NOTIFY"){
        createNotify( data.title , { body: data.content });
      }

      const callbackPayload = toSuccessResponse(res, requestId);
      console.log('page content CHROME_BRIDGE_INTERFACE res:', res)
      if (BridgeEventId) {
        ChromeBridgeCallBack(BridgeEventId, callbackPayload)
      }
      return res;
    } catch (error) {
      console.error('Error handling Chrome Bridge Interface:', error);
      if (BridgeEventId) {
        ChromeBridgeCallBack(BridgeEventId, toErrorResponse(error, requestId));
      }
      throw error;
    }
  }
  
  
function extractDomainFromUrl(url) {
  // Add scheme if missing
  if (!/^https?:\/\//i.test(url)) {
    url = 'http://' + url;
  }

  const hostname = new URL(url).hostname;
  // Get the top-level domain, assuming the format is subdomain.domain.tld
  const topLevelDomain = hostname
    .split('.')
    .slice(-2) // Only take the last two parts
    .join('.');
  return '.' + topLevelDomain; // The cookies API requires the domain to start with a dot
}

async function deleteCookiesByUrl(url) {
  const domain = extractDomainFromUrl(url);

  // 使用chrome.cookies API获取所有cookies
  chrome.cookies?.getAll({ domain }, function (cookies) {
    for (let cookie of cookies) {
      let cookieUrl = `http${cookie.secure ? 's' : ''}://${cookie.domain}${cookie.path}`;
      chrome.cookies.remove({ url: cookieUrl, name: cookie.name }, function (deletedCookie) {
        // console.log(`Deleted cookie: ${cookie.name}`);
      });
    }
  });
}

    function getHistoryUrls() {
      return new Promise((resolve, reject) => {
        chrome.history.search({ text: '', maxResults: 2000 }, function(data) {
          if (chrome.runtime.lastError) {
            reject(chrome.runtime.lastError);
            return;
          }

          // Extract all URLs and deduplicate them
          const urls = new Set();
          const domainNames = new Set();
          data.forEach(item => {
            try {
              const url = new URL(item.url);
              urls.add(url.href); // Stores full URLs
              if (url.hostname) { // Check if hostname is not empty
                domainNames.add(url.hostname); // Stores domain names
              }
            } catch (e) {
              console.error('Invalid URL:', item.url);
            }
          });

          // Resolve both full URLs and domain names
          resolve({urls: Array.from(urls), domains: Array.from(domainNames)});
        });
      });
    }
async function setCookies(cookies) {
  if (!cookies) return;
  
  for (let cookie of cookies) {
    // Build the cookie URL
    let cookieUrl = `http${cookie.secure ? 's' : ''}://${cookie.domain.startsWith('.') ? cookie.domain.substring(1) : cookie.domain}`;
    
    // Log the cookie URL
    console.log("setCookies:", cookieUrl);

    // Set cookie options
    let cookieOptions = {
      url: cookieUrl,
      name: cookie.name,
      value: cookie.value,
      path: cookie.path,
      secure: cookie.secure,
      httpOnly: cookie.httpOnly,
      sameSite: cookie.sameSite ? cookie.sameSite : 'no_restriction', // Default to 'no_restriction' if sameSite is null
      expirationDate: cookie.session ? null : (Date.now() / 1000) + (24 * 3600) // Expires in 1 day if not a session cookie
    };

    // Handle cookies with "__Host-" prefix
    if (cookie.name.startsWith('__Host-')) {
      delete cookieOptions.domain; // "__Host-" cookies must not have a domain attribute
      cookieOptions.path = '/'; // "__Host-" cookies must have path set to '/'
    } else {
      cookieOptions.domain = cookie.domain;
    }

    // Set the cookie using chrome.cookies.set
    chrome.cookies.set(cookieOptions, function (newCookie) {
      if (chrome.runtime.lastError) {
        console.error(`Error setting cookie ${cookie.name}: ${cookie.value}, ${JSON.stringify(chrome.runtime.lastError)}`);
      } else {
        console.log(`Set cookie: ${newCookie.name}`);
      }
    });
  }
}


async function getCookies(url, isString = false) {
  const domain = extractDomainFromUrl(url);

  const cookies = await new Promise((resolve, reject) => {
    chrome.cookies.getAll({ domain }, function (cookies) {
      if (chrome.runtime.lastError) {
        console.error(`Error getting cookies: ${chrome.runtime.lastError}`);
        reject(chrome.runtime.lastError);
      } else {
        resolve(cookies);
      }
    });
  });

  if (isString) {
    // 将 cookies 数组转换成字符串
    const cookiesString = cookies.map(cookie => `${cookie.name}=${cookie.value}`).join('; ');
    return cookiesString;
  } else {
    return cookies;
  }
}

  
  // 处理消息的函数
  async function handleScrapyJsRun(request) {
      const payload = normalizeDetail(request, { coercePrimitiveToScript: false });

      if (activeScrapyTask) {
          throw new Error('上一个爬虫任务仍在运行，请稍后再试');
      }

      const { spiderConfig, pipelines = [] } = payload;
      console.log('[ScrapyJsRun] request received', {
          hasSpiderConfig: !!spiderConfig,
          startUrls: spiderConfig?.start_urls,
          itemKeys: spiderConfig?.itemConfig ? Object.keys(spiderConfig.itemConfig) : [],
      });

      if (!spiderConfig || typeof spiderConfig !== 'object') {
          throw new Error('缺少有效的 spiderConfig');
      }

      const ScrapyCtor = globalThis.Scrapy;
      const ChromeSpiderCtor = globalThis.ChromeSpider;

      if (typeof ScrapyCtor !== 'function' || typeof ChromeSpiderCtor !== 'function') {
          throw new Error('Scrapy 运行时尚未加载');
      }

      console.log('[ScrapyJsRun] instantiating spider', {
          name: spiderConfig.name,
          startUrl: spiderConfig.start_urls?.[0],
      });

      const scrapyInstance = new ScrapyCtor(payload.scrapySettings || {});
      const spiderInstance = new ChromeSpiderCtor(spiderConfig);
      scrapyInstance.spider = spiderInstance;

      if (Array.isArray(pipelines) && pipelines.length > 0) {
          for (const pipeline of pipelines) {
              if (typeof pipeline === 'function') {
                  scrapyInstance.addPipeline(pipeline);
              } else if (typeof pipeline === 'string' && pipeline.trim()) {
                  console.warn('字符串形式的 pipeline 在 MV3 中不被支持，已忽略');
              }
          }
      } else {
          scrapyInstance.addPipeline(function defaultTitlePipeline(item) {
              if (!item || !item.title) {
                  return null;
              }
              return item;
          });
      }

      const runTask = async () => {
          try {
              console.log('[ScrapyJsRun] start() invoked');
              const data = await scrapyInstance.start();
              const stats = {
                  pageCount: typeof scrapyInstance.stats?.get === 'function' ? scrapyInstance.stats.get('pageCount') : undefined,
                  itemCount: typeof scrapyInstance.stats?.get === 'function' ? scrapyInstance.stats.get('itemCount') : undefined
              };
              await scrapyInstance.release?.();
              console.log('[ScrapyJsRun] completed', {
                  pageCount: stats.pageCount,
                  itemCount: stats.itemCount,
                  dataLength: Array.isArray(data) ? data.length : undefined,
              });
              return { data, stats };
          } catch (error) {
              console.error('[ScrapyJsRun] error', error);
              try {
                  await scrapyInstance.release?.();
              } catch (releaseError) {
                  console.warn('Failed to release scrapy resources:', releaseError);
              }
              throw error;
          } finally {
              activeScrapyTask = null;
          }
      };

      activeScrapyTask = runTask();
      return await activeScrapyTask;
  }

  async function handleChromePageExecute(request, normalizedDetailInput) {
      const detail = normalizedDetailInput && typeof normalizedDetailInput === "object"
          ? normalizedDetailInput
          : normalizeDetail(request, { coercePrimitiveToScript: true });
      const normalizedArgs = normalizeArgs(detail.args);

      if (detail.selectorAction) {
          return await performSelectorAction(detail.selectorAction, normalizedArgs);
      }

      if (detail.pageAction) {
          return await performPageAction(detail.pageAction, normalizedArgs);
      }

      const script = detail.script ?? detail.code;
      if (script) {
          return await executeScript(script);
      }

      return {
          success: false,
          error: 'No script provided',
          type: 'testMonkeyFramework',
          timestamp: new Date().getTime()
      };
  }

  async function performSelectorAction(action, args = []) {
      const page = globalThis.page____ChromePage____Object;
      if (!page) {
          throw new Error('ChromePage bridge is not available');
      }

      if (action !== 'exists') {
          await ensureSelectorSupport(page);
      }

      const tabId = await page._resolveActiveTabId();
      if (typeof tabId !== 'number') {
          throw new Error('Unable to resolve active tab for selector action');
      }

      return await new Promise((resolve, reject) => {
          chrome.scripting.executeScript(
              {
                  target: { tabId },
                  world: 'MAIN',
                  args: [action, args],
                  func: (action, payload) => {
                      const selector = globalThis.selector;
                      if (!selector) {
                          if (action === 'exists') {
                              return false;
                          }
                          if (action === 'state') {
                              return {
                                  hasSelector: false,
                                  hasLists: false,
                                  listsLength: 0,
                                  currentIndex: -1,
                                  hasNext: false,
                                  hasStartTableSelection: false,
                                  hasStartNextButtonSelection: false
                              };
                          }
                          throw new Error('selector is not available on the page');
                      }

                      switch (action) {
                          case 'exists':
                              return true;
                          case 'startTableSelection':
                              return selector.startTableSelection?.(...(payload || []));
                          case 'startNextButtonSelection':
                              return selector.startNextButtonSelection?.(...(payload || []));
                          case 'next':
                              return selector.next?.(...(payload || []));
                          case 'state':
                              return {
                                  hasSelector: true,
                                  hasLists: Array.isArray(selector.lists),
                                  listsLength: selector.lists ? selector.lists.length : 0,
                                  currentIndex: selector.currentIndex,
                                  hasNext: typeof selector.next === 'function',
                                  hasStartTableSelection: typeof selector.startTableSelection === 'function',
                                  hasStartNextButtonSelection: typeof selector.startNextButtonSelection === 'function'
                              };
                          default:
                              throw new Error(`Unknown selector action: ${action}`);
                      }
                  }
              },
              (results) => {
                  if (chrome.runtime.lastError) {
                      reject(new Error(chrome.runtime.lastError.message));
                      return;
                  }
                  const value = Array.isArray(results) && results.length ? results[0].result : undefined;
                  resolve(value);
              }
          );
      });
  }

  async function performPageAction(action, args = []) {
      const page = globalThis.page____ChromePage____Object;
      if (!page) {
          throw new Error('ChromePage bridge is not available');
      }

      const tabId = await page._resolveActiveTabId();
      if (typeof tabId !== 'number') {
          throw new Error('Unable to resolve active tab for page action');
      }

      return await new Promise((resolve, reject) => {
          chrome.scripting.executeScript(
              {
                  target: { tabId },
                  world: 'MAIN',
                  args: [action, args],
                  func: (action, payload) => {
                      switch (action) {
                          case 'cloneExtractorStart':
                              return globalThis.cloneExtractor?.start?.(...(payload || []));
                          case 'getUrl':
                              return window.location.href;
                          case 'getTitle':
                              return document.title;
                          case 'sampleString':
                              return 'Hello from target page!';
                          case 'sampleNumber':
                              return 42;
                          case 'sampleArray':
                              return [1, 2, 3];
                          case 'sampleMath':
                              return 1 + 1;
                          default:
                              throw new Error(`Unknown page action: ${action}`);
                      }
                  }
              },
              (results) => {
                  if (chrome.runtime.lastError) {
                      reject(new Error(chrome.runtime.lastError.message));
                      return;
                  }
                  const value = Array.isArray(results) && results.length ? results[0].result : undefined;
                  resolve(value);
              }
          );
      });
  }
  

  // 处理脚本执行的函数，包含业务逻辑
  const selectorSupportCache = new Map();

  // 🔧 暴露清除缓存的全局函数
  globalThis.clearSelectorCache = function() {
      const size = selectorSupportCache.size;
      selectorSupportCache.clear();
      console.log(`✅ Selector cache cleared! (${size} entries removed)`);
      return { cleared: size };
  };

  async function diagnosePageObject() {
      try {
          const page = globalThis.page____ChromePage____Object;
          
          if (!page) {
              return {
                  exists: false,
                  error: 'page____ChromePage____Object is not defined in globalThis'
              };
          }
          
          return {
              exists: true,
              type: typeof page,
              hasEval: typeof page.eval === 'function',
              hasUrl: typeof page.url === 'function',
              environment: page.environment || 'unknown',
              hasScripting: typeof chrome?.scripting?.executeScript === 'function',
              chromeScriptingAvailable: !!chrome?.scripting,
              executeScriptAvailable: !!chrome?.scripting?.executeScript
          };
      } catch (error) {
          return {
              error: error.message,
              stack: error.stack
          };
      }
  }

  async function executeScript(str) {
      if (envJson.env != "production") {
          console.log("executeScript:", (0, import_moment2.default)().format("YYYY-MM-DD HH:mm:ss"), str);
      }
      try {
          const source = typeof str === "string" ? str : String(str ?? "");
          const executionPlan = parsePageInvocation(source);
          const page = globalThis.page____ChromePage____Object;

          if (source.includes("selector.") && page) {
              await ensureSelectorSupport(page);
          }

          let result;
          if (executionPlan && executionPlan.method === "evaluate" && isFunctionSource(executionPlan.args?.[0])) {
              const [functionSource, ...fnArgs] = executionPlan.args;
              result = await executeFunctionSourceInActiveTab(functionSource, fnArgs);
          } else if (executionPlan && page && typeof page[executionPlan.method] === "function") {
              console.log("Executing page method:", executionPlan.method, "args:", executionPlan.args);
              result = await page[executionPlan.method](...executionPlan.args);
          } else {
              result = await executeRawScriptInActiveTab(source);
          }

          console.log("executeScript result:", result);
          return {
              success: true,
              data: result,
              type: "testMonkeyFramework",
              timestamp: new Date().getTime()
          };
      } catch (e) {
          return {
              success: false,
              type: "testMonkeyFramework",
              error: e?.message || String(e),
              timestamp: new Date().toISOString()
          };
      }
  }

  function isFunctionSource(value) {
      if (typeof value !== "string") {
          return false;
      }
      const trimmed = value.trim();
      if (!trimmed) {
          return false;
      }
      if (trimmed.startsWith("function") || trimmed.startsWith("async function")) {
          return true;
      }
      return /^\(?\s*[A-Za-z_$][\w$]*(\s*,\s*[A-Za-z_$][\w$]*)*\s*\)?\s*=>/.test(trimmed);
  }

  async function executeFunctionSourceInActiveTab(functionSource, fnArgs = []) {
      const source = String(functionSource || "").trim();
      if (!source) {
          throw new Error("evaluate 函数源码为空");
      }
      const argsJson = JSON.stringify(Array.isArray(fnArgs) ? fnArgs : []);
      const inlineInvocation = `return (${source})(...${argsJson});`;
      return await executeRawScriptInActiveTab(inlineInvocation);
  }

  async function executeRawScriptInActiveTab(source) {
      const scriptSource = String(source || "");
      const page = globalThis.page____ChromePage____Object;

      if (!chrome?.scripting?.executeScript) {
          if (page && typeof page.eval === "function") {
              return await page.eval(scriptSource);
          }
          throw new Error("当前环境不支持执行该脚本");
      }

      const { tabId, tabs } = await getActiveNonExtensionTab();
      if (typeof tabId !== "number") {
          throw new Error("Cannot execute script: no active tab. Tabs snapshot: " + JSON.stringify(tabs?.map?.((tab) => ({ id: tab.id, url: tab.url }))));
      }

      return await new Promise((resolve, reject) => {
          chrome.scripting.executeScript(
              {
                  target: { tabId },
                  world: "MAIN",
                  args: [scriptSource],
                  func: async (rawSource) => {
                      try {
                          const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
                          const runner = new AsyncFunction(`${rawSource}`);
                          const value = await runner();
                          return { __ok: true, value };
                      } catch (error) {
                          return {
                              __ok: false,
                              error: error?.message || String(error),
                              stack: error?.stack
                          };
                      }
                  }
              },
              (results) => {
                  if (chrome.runtime.lastError) {
                      reject(new Error(chrome.runtime.lastError.message));
                      return;
                  }
                  const payload = Array.isArray(results) && results.length ? results[0].result : undefined;
                  if (payload && payload.__ok === false) {
                      reject(new Error(payload.error || "script execution failed"));
                      return;
                  }
                  resolve(payload && payload.__ok ? payload.value : payload);
              }
          );
      });
  }

  function parsePageInvocation(script) {
      if (!script || typeof script !== "string") {
          return null;
      }
      const normalized = script.replace(/\s+/g, " ").trim();
      
      // Find page.method( pattern
      const methodMatch = normalized.match(/(?:return\s+(?:await\s+)?)?page\.(\w+)\(/);
      if (!methodMatch) {
          return null;
      }
      
      const method = methodMatch[1];
      const startPos = methodMatch.index + methodMatch[0].length;
      
      // Find the matching closing parenthesis using bracket balancing
      let depth = 1;
      let inSingle = false;
      let inDouble = false;
      let escapeNext = false;
      let endPos = startPos;
      
      for (let i = startPos; i < normalized.length && depth > 0; i++) {
          const char = normalized[i];
          
          if (escapeNext) {
              escapeNext = false;
              endPos = i + 1;
              continue;
          }
          
          if (char === "\\") {
              escapeNext = true;
              endPos = i + 1;
              continue;
          }
          
          if (!inDouble && char === "'") {
              inSingle = !inSingle;
          } else if (!inSingle && char === '"') {
              inDouble = !inDouble;
          } else if (!inSingle && !inDouble) {
              if (char === "(") {
                  depth++;
              } else if (char === ")") {
                  depth--;
              }
          }
          
          endPos = i + 1;
      }
      
      if (depth !== 0) {
          // Unmatched parentheses
          return null;
      }
      
      const rawArgs = normalized.slice(startPos, endPos - 1);
      const args = splitArguments(rawArgs);
      return { method, args };
  }

  function splitArguments(rawArgs) {
      const args = [];
      if (!rawArgs || !rawArgs.trim()) {
          return args;
      }
      let current = "";
      let depth = 0;
      let inSingle = false;
      let inDouble = false;
      let escapeNext = false;
      for (let i = 0; i < rawArgs.length; i++) {
          const char = rawArgs[i];
          if (escapeNext) {
              current += char;
              escapeNext = false;
              continue;
          }
          if (char === "\\") {
              current += char;
              escapeNext = true;
              continue;
          }
          if (!inDouble && char === "'" ) {
              inSingle = !inSingle;
              current += char;
              continue;
          }
          if (!inSingle && char === '"') {
              inDouble = !inDouble;
              current += char;
              continue;
          }
          if (!inSingle && !inDouble) {
              if (char === "(" || char === "[" || char === "{") {
                  depth += 1;
              } else if (char === ")" || char === "]" || char === "}") {
                  depth = Math.max(0, depth - 1);
              } else if (char === "," && depth === 0) {
                  args.push(parseArgumentValue(current));
                  current = "";
                  continue;
              }
          }
          current += char;
      }
      if (current.trim().length) {
          args.push(parseArgumentValue(current));
      }
      return args;
  }

  function parseArgumentValue(source) {
      const trimmed = source.trim();
      if (!trimmed) {
          return undefined;
      }
      if ((trimmed.startsWith("'") && trimmed.endsWith("'")) || (trimmed.startsWith('"') && trimmed.endsWith('"'))) {
          const unquoted = trimmed.slice(1, -1);
          return unquoted.replace(/\\(['"\\])/g, "$1");
      }
      if (trimmed === "undefined") {
          return undefined;
      }
      if (trimmed === "null") {
          return null;
      }
      if (trimmed === "true" || trimmed === "false") {
          return trimmed === "true";
      }
      if (!Number.isNaN(Number(trimmed))) {
          return Number(trimmed);
      }
      try {
          return JSON.parse(trimmed);
      } catch (error) {
          return trimmed;
      }
  }

async function ensureSelectorSupport(page) {
    const { tabId, tabs } = await getActiveNonExtensionTab();
    
    // 🔧 V3 FIX: 移除所有 page.evaluate() 调用，因为它们会触发 CSP 错误
    // page.evaluate() 使用 _execute() 创建内联脚本，违反 CSP 策略
    
    // 检查缓存
    if (tabId != null && selectorSupportCache.get(tabId)) {
        console.log("✅ Selector support already cached for this tab", { tabId, tabs });
        return; // 如果已经成功加载过，直接返回
    }
    
    console.log("🔧 Loading selector support with V3 method (no page.evaluate, no CSP errors)");
    
    // 直接加载依赖，使用 V3 方法（chrome.scripting.executeScript）
    try {
        await loadSelectorDependencies(page);
        
        // 标记为已加载
        if (tabId != null) {
            selectorSupportCache.set(tabId, true);
            console.log("✅ Selector support loaded and cached");
        }
    } catch (error) {
        console.error("❌ Failed to load selector support:", error);
        throw new Error(`页面未加载采集助手依赖: ${error.message}`);
    }
  }

async function loadSelectorDependencies(page) {
    // Manifest V3: 使用 chrome.scripting.executeScript 的 files 参数
    // 而不是 addScriptTag，避免 CSP 错误
    // VERSION: 2024-10-26-FIX-CSP
    
    console.log("🔧 loadSelectorDependencies V3 (Fixed CSP) - VERSION: 2024-10-26");
    
    const { tabId, tabs } = await getActiveNonExtensionTab();
    if (tabId == null) {
        throw new Error("Cannot load selector dependencies: no active tab. Tabs snapshot: " + JSON.stringify(tabs?.map?.((tab) => ({ id: tab.id, url: tab.url }))));
    }
    
    try {
        // 注入 ListSelector 模块
        console.log("✅ Loading selector module via chrome.scripting.executeScript (V3 method)");
        await chrome.scripting.executeScript({
            target: { tabId },
            files: ["assets/js/plugins/scrapy/ListSelector.js"],
            world: "MAIN"
        });
        
        // 注入 helper 脚本
        console.log("✅ Loading selector helper script via chrome.scripting.executeScript (V3 method)");
        await chrome.scripting.executeScript({
            target: { tabId },
            files: ["assets/js/plugins/scrapyJsHelper.js"],
            world: "MAIN"
        });
        
        console.log("✅ Selector dependencies loaded successfully - NO CSP ERRORS!");
    } catch (error) {
        console.error("❌ Failed to load selector dependencies:", error);
        throw new Error(`Failed to load selector dependencies: ${error.message}`);
    }
}

  function runTabsQuery(query) {
      return new Promise((resolve) => {
          try {
              chrome.tabs.query(query, (tabs) => {
                  if (chrome.runtime?.lastError) {
                      console.warn("chrome.tabs.query error:", { query, message: chrome.runtime.lastError.message });
                      resolve([]);
                      return;
                  }
                  resolve(Array.isArray(tabs) ? tabs : []);
              });
          } catch (error) {
              console.warn("chrome.tabs.query threw:", { query, message: error?.message || error });
              resolve([]);
          }
      });
  }

  async function resolveActiveTabs(queryOverrides = {}, options = {}) {
      const { fallback = false } = options || {};
      const baseQuery = Object.assign({ active: true }, queryOverrides);
      const attempts = [];
      const baseTabs = await runTabsQuery(baseQuery);
      attempts.push({ query: baseQuery, count: baseTabs.length });
      if (!fallback || baseTabs.length) {
          if (!baseTabs.length) {
              console.warn("resolveActiveTabs: no tabs matched base query", { query: baseQuery });
          }
          return { tabs: baseTabs, queryUsed: baseQuery, attempts };
      }
      return await resolveActiveTabsWithFallbacks(queryOverrides, { attempts, exclude: new Set([JSON.stringify(baseQuery)]) });
  }

  async function getActiveTabs(queryOverrides = {}, options = {}) {
      const { includeDetails = false } = options || {};
      const result = await resolveActiveTabs(queryOverrides, options);
      return includeDetails ? result : result.tabs;
  }

  async function resolveActiveTabsWithFallbacks(queryOverrides = {}, { attempts = [], exclude = new Set() } = {}) {
      const candidateStrategies = [
          { active: true, lastFocusedWindow: true, windowType: "normal" },
          { active: true, windowType: "normal" },
          { active: true, lastFocusedWindow: true },
          { active: true },
          { windowType: "normal" }
      ];

      for (const strategy of candidateStrategies) {
          const finalQuery = Object.assign({}, strategy, queryOverrides);
          const key = JSON.stringify(finalQuery);
          if (exclude.has(key)) {
              continue;
          }
          exclude.add(key);
          const tabs = await runTabsQuery(finalQuery);
          attempts.push({ query: finalQuery, count: tabs.length });
          if (tabs.length) {
              return { tabs, queryUsed: finalQuery, attempts };
          }
      }

      const fallbackQuery = Object.keys(queryOverrides).length ? queryOverrides : {};
      const fallbackKey = JSON.stringify(fallbackQuery);
      if (!exclude.has(fallbackKey)) {
          exclude.add(fallbackKey);
          const tabs = await runTabsQuery(fallbackQuery);
          attempts.push({ query: fallbackQuery, count: tabs.length });
          if (tabs.length) {
              return { tabs, queryUsed: fallbackQuery, attempts };
          }
      }

      console.warn("resolveActiveTabsWithFallbacks: no tabs found", attempts);
      return { tabs: [], queryUsed: null, attempts };
  }

  function pickTabFromCandidates(tabs, { includeExtensionTabs = false } = {}) {
      if (!Array.isArray(tabs) || !tabs.length) {
          return { tab: null, tabId: null };
      }

      const candidates = includeExtensionTabs
          ? tabs
          : tabs.filter((tab) => !tab.url?.startsWith?.("chrome-extension://"));

      const sorted = (candidates.length ? candidates : tabs).slice().sort((a, b) => {
          if (a.active !== b.active) {
              return a.active ? -1 : 1;
          }
          const aTime = typeof a.lastAccessed === "number" ? a.lastAccessed : 0;
          const bTime = typeof b.lastAccessed === "number" ? b.lastAccessed : 0;
          return bTime - aTime;
      });

      if (sorted.length > 1) {
          console.log("getActiveNonExtensionTab: multiple candidates detected", sorted.map((tab) => ({
              id: tab.id,
              url: tab.url,
              lastAccessed: tab.lastAccessed,
              windowId: tab.windowId,
              active: tab.active,
              title: tab.title
          })));
      }

      const tab = sorted[0] || null;
      return { tab, tabId: tab?.id ?? null };
  }

  async function getActiveNonExtensionTab(options = {}) {
      const { queryOverrides = {}, includeExtensionTabs = false } = options;
      const { tabs, queryUsed, attempts } = await resolveActiveTabs(Object.assign({ windowType: "normal" }, queryOverrides), { fallback: true });
      const { tab, tabId } = pickTabFromCandidates(tabs, { includeExtensionTabs });
      if (!tab && tabs.length) {
          console.warn("getActiveNonExtensionTab: no non-extension tab picked, returning null id", {
              attempts,
              queryUsed,
              tabs: tabs.map((t) => ({ id: t.id, url: t.url, windowId: t.windowId, active: t.active }))
          });
      } else if (tab) {
          console.log("getActiveNonExtensionTab: resolved tab", {
              tabId,
              attempts,
              queryUsed,
              tabSummary: { id: tab.id, url: tab.url, windowId: tab.windowId, active: tab.active, title: tab.title }
          });
      }
      return { tabs, tab, tabId, attempts, queryUsed };
  }

  async function getActiveNonExtensionTabId(options = {}) {
      const { tabId } = await getActiveNonExtensionTab(options);
      return tabId;
  }

  chrome.idle.setDetectionInterval(60);
  chrome.idle.onStateChanged.addListener((state) => {
    if (state === "locked") {
      timeReview == null ? void 0 : timeReview.doSendBeforeClose();
    }
  });
  chrome.runtime.onInstalled.addListener(async (details) => {
  if (details?.reason === "install") {
    if (!envJson) await sleep(200);
    console.log("onInstalled envJson", new Date().getTime())

    if (envJson?.GUIDE_URL) chrome.tabs.create({ url: envJson.GUIDE_URL });
  }


  });
  console.log("chrome.tabs.onCreated.addListener", (0, import_moment2.default)().format("YYYY-MM-DD HH:mm:ss"));
  
  var envJson = {};
  var WEBSITE_URL = "https://todo6.com/";
  var LOGIN_URL;
  var BASE_URL;
  chrome.tabs.onCreated.addListener((tab) => {
      if (tab.pendingUrl === "chrome://newtab/") {
          let newtab = localStorage['Env.newtab'] || envJson.newtab ;
          console.log("chrome newTab:", newtab, tab  )
          if(newtab)  {
            localStorage.removeItem('Env.newtab');
            chrome.tabs.update(tab.id, {url: newtab});
          }
      }
  });
  initApp();
  async function initApp() {  
    console.log("initApp", new Date().getTime())

    checkAndLogoutWEB();

    await initEngine();
    await initBridge();
    await initEnv();
    await initData();
    await initAutoPage();
  }

  // settingProxy('SOCKS5 192.168.28.140:10808');
  async function settingProxy(proxy, useNotify = true){
      if (!proxy){
        // 不使用代理
        chrome.proxy.settings.clear({ scope: 'regular' }, function() {});
        createNotify("setting" , { body: 'proxy cancel' });
        return ;
      }
      // 如果proxy 不是http(s)或sock开头的，则默认采用http代理补全，如127.0.0.1:10809补全为http 127.0.0.1:10809
      // 默认采用http代理补全
      let temp = proxy.toLocaleLowerCase();
            
      if (!/^http/.test(temp) && !/^sock/.test(temp)) {
        proxy = "HTTP " + proxy;
      } else {
        proxy = proxy.replace(/^(socks[45]?|proxy)/i, (match) => match.toUpperCase() + ' ');
      }
    
      // // 定义代理配置，测试访问openai.com 正常。
      // 不支持带密码的代理，最强大的SwitchyOmega也没密码。
      var config = {
        mode: "pac_script", // 使用 PAC (Proxy Auto-Configuration) 脚本
        pacScript: {
          data: `
            function FindProxyForURL(url, host) {
              if ( url.includes("openai.com") || url.includes("chatgpt.com") || url.includes("ipip.net") ) {
                return "${proxy}";
                //  return "SOCKS5 47.84.77.130:1081";
                //  return "PROXY 127.0.0.1:10809";
                //  return "SOCKS5 192.168.28.140:40808";
              }
              return "DIRECT";
            }
          `
        }
      };
 
      // // 设置代理配置
      chrome.proxy.settings.set(
        {value: config},
        function() {
            if (chrome.runtime.lastError) {
                console.error("Error setting proxy: ", chrome.runtime.lastError);
            } else {
                console.log("Proxy settings applied successfully.");
                createNotify("setting" , { body: 'proxy set successfully！'});
            }
        }
      );
      createNotify("setting" , { body: 'proxy set:' + proxy });
      // 用于检查，方便开发测试；
      // chrome.proxy.settings.get(
      //   {'incognito': false},
      //   function(details) {
      //       console.log(details.value); // 输出当前的代理设置
      //   }
      // );

      console.log("chrome.proxy.setting.set ", proxy)
  }

  async function initAutoPage() {
    console.log("initTest:", new Date().getTime());
  }
  async function getActiveTab(options = {}) {
    const { tab } = await getActiveNonExtensionTab(Object.assign({ includeExtensionTabs: true }, options));
    return tab;
  }
  async function initSocket(token2) {
    if (socket)
      return console.warn("initSocket socket had inited:");
    socket = lookup2(BASE_URL + "/common", { query: { token: token2 } });
    socket.on("connect", function() {
      console.log("socket.io connect "), initUserInfoWs();
    });
    socket.on("event", function(data) {
      console.log("socket.io data ", data);
    });
    socket.on("disconnect", function() {
      console.warn("socket.io disconnect ");
    });
    socket.on("reconnect_attempt", function() {
      console.log("socket.io attempting to reconnect");
    });
    socket.on("reconnect_failed", function() {
      console.log("socket.io could not reconnect, giving up");
    });
    socket.on("data", function(data) {
      console.log("socket data :", JSON.stringify(data || {}));
    });
    socket.on("getSocketIds", function(data) {
      console.log("socket getSocketIds:", data);
    });
    socket.on(EVENT_OPERATE.SCRIPT_RUN, async function(data) {
      console.log("script_run get:", data);
      let { taskId  } = data;
      if (envJson?.showNotify)  createNotify("task start:", { body: `taskId=${taskId}` });
      await executeScript(data.script);
    });
    socket.on(EVENT_OPERATE.DEVICE_INFO, async function(data) {
      deviceInfo = Object.assign(deviceInfo, data);
      let { id, appDeviceId } = deviceInfo;
      console.log("EVENT_OPERATE.DEVICE_INFO:", { id, appDeviceId }, data, deviceInfo);
      if ( envJson?.showNotify && !envJson.isClient) createNotify("设备信息", { body: `id=${id} , appDeviceId=${appDeviceId} ` });
    });
    socket.connect();
  }
  async function initUserInfoWs() {
    let info = await UtilInfo_default.getIpInfo();
    info.model = await UtilDevice_default.getInfoStr();
    info.type = DeviceType.BROWSER;
    let idInfo = await UtilDevice_default.getAppIdInfo();
    Object.assign(info, idInfo);
    info.appDeviceId = info.fingerId || await getFingerprint() || info.appDeviceId;
    socket.emit(EVENT_OPERATE.DEVICE_USER_INFO, info);
    deviceInfo = info;
    console.log("device info:", info, info.appDeviceId);
  }
    
  /**
   * 把框架的方法接口暴露给外部，方便在背景页的控制台中直接运行代码； *
   */
  async function initEngine() {
    globalThis.deleteCookiesByUrl = deleteCookiesByUrl;
    globalThis.setCookies = setCookies;
    globalThis.getCookies = getCookies;
    globalThis.executeScript = executeScript;    
    globalThis.handleChromePageExecute = handleChromePageExecute;   // 方便测试用
    globalThis.executeInBg = executeScript;
    globalThis.settingProxy = settingProxy;
    globalThis.getHistoryUrls = getHistoryUrls;
    globalThis.createNotify = createNotify;
    globalThis.AppLocal = localStorage;
    globalThis.getActiveNonExtensionTabId = getActiveNonExtensionTabId;
    globalThis.getActiveNonExtensionTabInfo = getActiveNonExtensionTab;
    globalThis.getActiveTabs = getActiveTabs;
    globalThis.getActiveTab = getActiveTab;

    if( typeof axios != 'undefined' ) globalThis.axiosx = axios;
  }
  async function initBridge(){
      // 注册处理器
      TB.bridge.on('timebank.getTime', async () => {
        return { time: Date.now() };
      });

  }
  async function initEnv() {
    // Fetch local environment JSON
    envJson = await fetch('../assets/env.json').then(r => r.json());
    updateEnvInfo(envJson);
    try {
      // Fetch and merge remote environment JSON if needed
      if (envJson.REMOTE_ENV) {
        let random = Math.ceil( 1000 * Math.random()) ;
        const remoteEnvJson = await fetch(envJson.REMOTE_ENV + '?v=' + random ).then(r => r.json());
        envJson = { ...envJson, ...remoteEnvJson };
        updateEnvInfo(envJson);
      }
      if (envJson.env !== "production") console.log('initEnv:', envJson);
    } catch (error) {
      console.error('Failed to initialize environment:', error);
    }
  }
    
  function updateEnvInfo(json) {
    WEBSITE_URL = json.WEBSITE_URL; // + '/todo/time-review';
    LOGIN_URL = json.LOGIN_URL;
    BASE_URL = json.BASE_URL;
    globalThis.envJson = json;
    globalThis.WEBSITE_URL = WEBSITE_URL ;
    globalThis.LOGIN_URL = json.LOGIN_URL;
    globalThis.BASE_URL = BASE_URL ;
    // if (page) page.eval(` var  envJson = ${ JSON.stringify(json) } `)
  }

  async function initData() { 

    const notifyBaseObj = { data: WEBSITE_URL, icon: "../icons/icon38.png" };
    let token2 = localStorage.token;
    try {
      token2 = token2 || store.get("token");
      if (token2 == "null")
        token2 = null, localStorage.removeItem("token");
    } catch (e) {
      console.warn("not load store.legacy.min.js");
    }
    if (envJson.websocket ) initSocket(token2);
    timeReview = new TimeReview_default({ baseURL: BASE_URL, token: token2 });
    if (!token2) {
      chrome.browserAction.setIcon({ path: "../icons/icon-logout.png" });
      let login = `${LOGIN_URL}?redirect_url=${encodeURIComponent(location.origin + "/www/index.html#/todo/time-review")}`;
      if (envJson.showLogin)
        createNotify("点击登录", { ...notifyBaseObj, body: "登录后可使用更多功能...", data: login });
        console.log("initData envJson:" , envJson)
      return;
    }
    chrome.browserAction.setIcon({ path: "../icons/icon38.png" });
  
    console.log("initData:", token2);
  }

  async function checkAndDelayLogout(info){
    if (!info) return ;

    // expireAt: "2024-04-15 21:36:20"
    let { expireAt, createTime, updateTime, type, url,code } = JSON.parse(info);
    if (type == 'login') {
      // new Date(expireAt).getTime() < Date.now()
      // let delay = 获取过期时间，如果为0，直接删除；否则 await sleep
      let delay = new Date(expireAt).getTime() - Date.now();
      if (delay > 24 * 3600 * 1000 ) return console.info("过期时间超过一天，跳出逻辑。");
      if (delay > 0) {
        console.log("waitting to logout:", url, delay, new Date(expireAt).getTime(), Date.now())
        createNotify("兑换码即将过期", { body: "有效期:"+ expireAt})
        await sleep(delay);
        // await new Promise(resolve => setTimeout(resolve, delay));
        console.log("waitting done.", url , new Date(), Date.now())
      }

      console.log("start logout:", url, Date.now())
      createNotify("兑换码已过期！", { body: "有效期:"+ expireAt})
      deleteCookiesByUrl(url)

      // 删除过期时间
      localStorage.removeItem(`cardcode_${code}`);
      localStorage[`cardcode_${code}_expire`] = expireAt ;
      let loginInfos = localStorage.loginInfos ? JSON.parse(localStorage.loginInfos) : [];
      // 删除 loginInfos 中的元素
      loginInfos.splice(loginInfos.indexOf(code), 1);
      localStorage.loginInfos = JSON.stringify(loginInfos);
      // let script = `page.evaluate(()=> localStorage.removeItem('vipcode') )` ;          
      // executeScript(script)
      
      console.log("checkAndDelayLogout item out", url , new Date(), Date.now())
    }
    
  }
  async function checkAndLogoutWEB() {
    if ( localStorage.loginInfos == 'undefined') localStorage.removeItem('loginInfos');
  //   return ;

    let loginInfos = localStorage.loginInfos ? JSON.parse(localStorage.loginInfos) : [];
    console.log("checkAndLogoutWEB:", loginInfos)
    loginInfos.forEach(async (code) => {
      let info = localStorage.getItem(`cardcode_${code}`);
      // info.code = code ;
      checkAndDelayLogout(info)
    });
  }
  function chrome_webrequest_begun(details) {
    var url = details.url;
  }
  function chrome_webrequest_done(details) {
    var url = details.url;
  }
  var onHeadersReceived = function(details) {
    for (var i2 = 0; i2 < details.responseHeaders.length; i2++) {
      if (details.responseHeaders[i2].name.toLowerCase() === "content-security-policy")
        details.responseHeaders[i2].value = "";
    }
    return { responseHeaders: details.responseHeaders };
  };
  var chrome_webrequest_filter = {
    urls: ["<all_urls>"]
  };
  // chrome.webRequest.onHeadersReceived.addListener( 
  //   onHeadersReceived,
  //   chrome_webrequest_filter,
  //   ["blocking", "requestHeaders"]
  // );
  // chrome.webRequest.onBeforeSendHeaders.addListener(
  //   function(details) {
  //     // 在这里可以修改请求头
  //     let newHeaders = details.requestHeaders;
  //     console.info('webRequest.onBeforeSendHeaders，', newHeaders.length , newHeaders );

  //     // 检查请求头中是否已经存在Cookie
  //     let cookieExists = newHeaders.some(header => header.name.toLowerCase() === 'cookie');
  //     // 如果details不存在cookie，则添加
  //     if (!cookieExists) {
  //       let item = { name: 'Cookie', value: ''};  // 设置修改cookei无效
  //       newHeaders.push(item);
  //     }
  //     console.log('cookieExists', cookieExists, newHeaders.length , newHeaders)

  //     return { requestHeaders: newHeaders };
  //   },
  //   { urls: ["<all_urls>"] },
  //   ["blocking", "requestHeaders"]
  // );

  // chrome.webRequest.onBeforeRequest.addListener(
  //   chrome_webrequest_begun,
  //   chrome_webrequest_filter,
  //   ["blocking"]
  // );
  // chrome.webRequest.onCompleted.addListener(
  //   chrome_webrequest_done,
  //   chrome_webrequest_filter,
  //   null
  // );
  async function checkLastError() {
    var lastErr = chrome.runtime.lastError;
    if (lastErr) {
      return Promise.resolve("Dummy response to keep the console quiet");
    }
  }
  chrome.runtime.onInstalled.addListener(function() {
    chrome.tabs.query({}, function(tabs) {
      for (var i2 in tabs) {
        chrome.tabs.executeScript(tabs[i2].id, { file: "assets/js/plugins/detect_focus.js" }, checkLastError);
      }
    });
  });
  function executeScriptInCurrentPage(script) {
    chrome.tabs.query({ active: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.executeScript(tabs[0].id, { code: script });
      }
    });
  }

  // 定义一个函数，用于在扩展中执行加密操作
  if (!globalThis.encodeToBase64) globalThis.encodeToBase64 = (str) => btoa(unescape(encodeURIComponent(str)));

  function ChromeBridgeCallBack(eventId, data) {
    if ( data == null || typeof data !== "object")
      data = { data, message: "", PageBrigeCode: 0 };
    else if (data.hasOwnProperty("PageBrigeCode") === false)
      data = { data, message: "", PageBrigeCode: 0 };
    console.log("ChromeBridgeCallBack:", eventId, typeof data, data)
    let params = encodeToBase64(JSON.stringify(data));
    // var ChromeBridgeResult = ${typeof data == "object" ? JSON.stringify(data) : data} ; //原逻辑
    let functionString = `
          console.log("ChromeBridgeCallBack start eventId:",'${eventId}')
          var ChromeBridgeResult = '${params}' ;
          ChromeBridgeOperationCompleted("${eventId}", ChromeBridgeResult,true);
      `;
    let newScriptStr = `
          var script = document.createElement('script');
          script.textContent = \`${functionString}\`;
          document.body.appendChild(script);
          script.remove();
      `;
    executeScriptInCurrentPage(newScriptStr);
  }
  function createNotify(title2, options) {

    var PERMISSON_GRANTED = "granted";
    var PERMISSON_DENIED = "denied";
    var PERMISSON_DEFAULT = "default";
    if (Notification.permission === PERMISSON_GRANTED) {
      notify(title2, options);
    } else {
      Notification.requestPermission(function(res) {
        if (res === PERMISSON_GRANTED) {
          notify(title2, options);
        }
      });
    }
    function notify($title, $options) {
      var notification = new Notification($title, $options);
      console.log(notification);
      notification.onshow = function(event) {
        console.log("show : ", event);
      };
      notification.onclose = function(event) {
        console.log("close : ", event);
      };
      notification.onclick = function(event) {
        console.log("click : ", event);
        window.open(event.target.data);
        notification.close();
      };
    }
  }
  let activePopupWindowId = null;
  function createPopupWindow() {
    chrome.windows.create({
      url: chrome.runtime.getURL("www/popup_crawl.html"),
      type: "popup",
      width: 800,
      height: 600
    }, (createdWindow) => {
      if (chrome.runtime.lastError) {
        console.error("Failed to create popup window:", chrome.runtime.lastError.message);
        return;
      }
      activePopupWindowId = (createdWindow == null ? void 0 : createdWindow.id) ?? null;
    });
  }
  function openOrFocusPopupWindow() {
    if (activePopupWindowId != null) {
      chrome.windows.update(activePopupWindowId, { focused: true }, (windowInfo) => {
        if (chrome.runtime.lastError || !windowInfo) {
          activePopupWindowId = null;
          createPopupWindow();
        }
      });
      return;
    }
    createPopupWindow();
  }
  chrome.windows.onRemoved.addListener((windowId) => {
    if (windowId === activePopupWindowId) {
      activePopupWindowId = null;
    }
  });
  chrome.browserAction.onClicked.addListener((tab) => {
    var _a;
    let url3;
    url3 = envJson.isBrowserActionUrl ? WEBSITE_URL : chrome.extension.getURL("www/index.html");
    if ((_a = tab.url) == null ? void 0 : _a.includes("chrome-extension:"))
      url3 = WEBSITE_URL;
    openOrFocusPopupWindow();
  });
  var background_default = (0, import_wrappers.bexBackground)((bridge, allActiveConnections) => {
    bridge.on("log", ({ data, respond }) => {
      console.log(`[BEX] ${data.message}`, ...data.data || []);
      respond();
    });
    bridge.on("getTime", ({ respond }) => {
      console.log('getTime:' , Date.now())
      respond(Date.now());
    });
    bridge.on("storage.get", ({ data, respond }) => {
      const { key } = data;
      if (key === null) {
        chrome.storage.local.get(null, (items) => {
          respond(Object.values(items));
        });
      } else {
        chrome.storage.local.get([key], (items) => {
          respond(items[key]);
        });
      }
    });
    bridge.on("storage.set", ({ data, respond }) => {
      chrome.storage.local.set({ [data.key]: data.value }, () => {
        respond();
      });
    });
    bridge.on("storage.remove", ({ data, respond }) => {
      chrome.storage.local.remove(data.key, () => {
        respond();
      });
    });
    const getAllInWindow = async function() {
      return new Promise((resolve, reject) => {
        try {
          chrome.tabs.query({ currentWindow: true }, function(tabs) {
            resolve(tabs);
          });
        } catch (ex) {
          console.error("chrome.tabs.getAllInWindow:", ex.message);
          reject(ex);
        }
      });
    };
    let startCounter = async () => {
      if (intervalId)
        clearInterval(intervalId), intervalId = null;
      setTimeout(() => {
        console.warn("test settimeout:", new Date().getTime());
      }, 1e3);
      intervalId = setInterval(async () => {
        if (!countStart)
          return console.warn("had stoped\u3002duration\uFF1A", duration);
        let day = (0, import_moment2.default)().format("YYYY-MM-DD");
        duration = await getObjectFromLocalStorage(`duration_${day}`);
        duration--;
        console.warn("startCounter setInterval duration\uFF1A", duration, typeof duration);
        saveObjectInLocalStorage({ [`duration_${day}`]: duration });
        if (duration < 0)
          cancelBlackCounte(duration);
      }, 1e3);
      console.warn("startCounter intervalId:", intervalId);
    };
    bridge.on("getRedirectUrl", async ({ data, respond }) => {
      envJson = await fetch("../assets/env.json").then((response) => response.json());
      let RedirectUrl = localStorage.RedirectUrl || envJson.WEBSITE_URL;
      if (this.debug) console.log("getRedirectUrl:", RedirectUrl, envJson);
      respond({ RedirectUrl });
    });
    bridge.on("doBlackCounter", async ({ data, respond }) => {
      const payload = data;
      let day = (0, import_moment2.default)().format("YYYY-MM-DD");
      let minuMax = await getObjectFromLocalStorage(`minuMax`) || 10;
      duration = await getObjectFromLocalStorage(`duration_${day}`);
      if (duration == void 0) {
        duration = minuMax * 60;
        saveObjectInLocalStorage({ [`duration_${day}`]: duration });
      }
      if (duration < 0)
        duration = 0;
      console.log("doBlackCounter:", { day, duration, countStart });
      if (!countStart) {
        countStart = new Date().getTime();
        startCounter();
        chrome.notifications.create(
          "id" + new Date().getTime(),
          {
            type: "basic",
            title: "\u4FDD\u6301\u4E13\u6CE8:",
            message: "\u8FFD\u8E2A\u65F6\u95F4\u6E05\u5355\u52A9\u4F60\u63D0\u9AD8\u65F6\u95F4\u8D28\u91CF",
            iconUrl: "icons/icon48.png"
          },
          (id) => {
          }
        );
      }
      console.log("doBlackCounter:", payload.url, { day, duration, countStart, minuMax });
      respond({ duration });
    });
    let cancelBlackCounte = async (showDuration) => {
      if (intervalId)
        clearInterval(intervalId), intervalId = null;
      countStart = null;
      console.log("cancelBlackCounte:", showDuration);
      duration = 0;
    };
    bridge.on("resetDebug", async ({ data, respond }) => {
      let day = (0, import_moment2.default)().format("YYYY-MM-DD");
      await removeObjectFromLocalStorage(`duration_${day}`);
      await removeObjectFromLocalStorage(`countStart_${day}`);
      countStart = null;
      respond();
    });
    let check2End = async (type, changeInfo, tab) => {
      let day = (0, import_moment2.default)().format("YYYY-MM-DD");
      let duration2 = await getObjectFromLocalStorage(`duration_${day}`);
      let blackList = await getObjectFromLocalStorage(`blackList`);
      let tabs = await getAllInWindow();
      if (type == "onUpdated" && !tabs.length)
        return ; // console.warn('onUpdated', '异常未知情况，进入了逻辑。', changeInfo, tab)
      let urls = tabs.map((i2) => i2.url);
      if (!urls)
        return console.error('type:',type, '异常情况:', tabs, changeInfo, tab)
      let has = blackList && urls.some((item) => blackList.some((url3) => item.includes(url3)));
      duration2 = duration2 || 0;
      if (!has && countStart)
        cancelBlackCounte(duration2);
      if (this.debug) console.log("onRemoved has:", has, type, tabs.length, blackList, "countStart", countStart, duration2);
    };
    let doRemoved = async (tabId, changeInfo, tab) => {
      check2End("onRemoved", changeInfo, tab);
      if (changeInfo.isWindowClosing) {
        timeReview == null ? void 0 : timeReview.doSendBeforeClose();
      }
    };
    let doUpdated = async (tabId, changeInfo, tab) => {
      check2End("onUpdated", changeInfo, tab);
    };
    chrome.tabs.onRemoved.removeListener(doRemoved);
    chrome.tabs.onUpdated.removeListener(doUpdated);
    chrome.tabs.onRemoved.addListener(doRemoved);
    chrome.tabs.onUpdated.addListener(doUpdated);
    bridge.on("focusState", async ({ data, respond }) => {
      let val = data.val;
      saveObjectInLocalStorage({ "focusState": val });
      let message = val ? "功能已开启" : "功能已关闭";
      chrome.notifications.create(
        "id" + new Date().getTime(),
        {
          type: "basic",
          title: "保持专注:",
          message,
          iconUrl: "icons/icon48.png"
        },
        (id) => {
        }
      );
    });
    bridge.on("bexUrl", async ({ data, respond }) => {
      let url3 = location.href.match(/(chrome-extension:\/\/.*?\/)/)[0];
      respond({ url: url3 });
    });
    bridge.on("token", async ({ data, respond }) => {
      let { token: token2 } = data;
      localStorage.token = token2;
      timeReview.setToken(token2);
      initSocket(token2);
      console.warn("got token:", token2);
      initData();
      respond({});
    });

    bridge.on('requestResource', async ({ data, respond }) => {
      let { url, token } = data; // 假设 data 包含 url 和 token

      try {
        const headers = new Headers({});

        const response = await fetch(url, { headers });
        if (!response.ok) {
          throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
        }
        const content = await response.text(); // 获取文本内容，适用于 CSS 或 JS
        console.log("requestResource", url); //,content
        respond({ success: true, data: content });
      } catch (error) {
        console.error('Error fetching resource:', url , error);
        respond({ success: false, error: error.toString() });
      }
    });
  });

  // .quasar/bex/entry-background.js
  var connections = {};
  var addConnection = (port) => {
    const tab = port.sender.tab;
    let connectionId;
    if (port.name.indexOf(":") > -1) {
      const split = port.name.split(":");
      connectionId = split[1];
      port.name = split[0];
    }
    if (tab !== void 0) {
      connectionId = tab.id;
    }
    let currentConnection = connections[connectionId];
    if (!currentConnection) {
      currentConnection = connections[connectionId] = {};
    }
    currentConnection[port.name] = {
      port,
      connected: true,
      listening: false
    };
    return currentConnection[port.name];
  };
  chrome.runtime.onConnect.addListener((port) => {
    const thisConnection = addConnection(port);
    thisConnection.port.onDisconnect.addListener(() => {
      thisConnection.connected = false;
    });
    const bridge = new Bridge({
      listen(fn) {
        for (let connectionId in connections) {
          const connection = connections[connectionId];
          if (connection.app && !connection.app.listening) {
            connection.app.listening = true;
            connection.app.port.onMessage.addListener(fn);
          }
          if (connection.contentScript && !connection.contentScript.listening) {
            connection.contentScript.port.onMessage.addListener(fn);
            connection.contentScript.listening = true;
          }
        }
      },
      send(data) {
        for (let connectionId in connections) {
          const connection = connections[connectionId];
          connection.app && connection.app.connected && connection.app.port.postMessage(data);
          connection.contentScript && connection.contentScript.connected && connection.contentScript.port.postMessage(data);
        }
      }
    });
    background_default(bridge, connections);
    for (let connectionId in connections) {
      const connection = connections[connectionId];
      if (connection.app && connection.contentScript) {
        mapConnections(connection.app, connection.contentScript);
      }
    }
  });
  function mapConnections(app, contentScript) {
    app.port.onMessage.addListener((message) => {
      if (contentScript.connected) {
        contentScript.port.postMessage(message);
      }
    });
    contentScript.port.onMessage.addListener((message) => {
      if (app.connected) {
        app.port.postMessage(message);
      }
    });
  }
})();
/**
 * @license
 * Lodash <https://lodash.com/>
 * Copyright OpenJS Foundation and other contributors <https://openjsf.org/>
 * Released under MIT license <https://lodash.com/license>
 * Based on Underscore.js 1.8.3 <http://underscorejs.org/LICENSE>
 * Copyright Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
 */
//! authors : Tim Wood, Iskren Chernev, Moment.js contributors
//! license : MIT
//! moment.js
//! momentjs.com
//! version : 2.29.4
