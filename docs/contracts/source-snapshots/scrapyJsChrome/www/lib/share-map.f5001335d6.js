!
function(e) {
    var t = {};
    function n(r) {
        if (t[r]) return t[r].exports;
        var o = t[r] = {
            i: r,
            l: !1,
            exports: {}
        };
        return e[r].call(o.exports, o, o.exports, n),
        o.l = !0,
        o.exports
    }
    n.m = e,
    n.c = t,
    n.d = function(e, t, r) {
        n.o(e, t) || Object.defineProperty(e, t, {
            enumerable: !0,
            get: r
        })
    },
    n.r = function(e) {
        "undefined" != typeof Symbol && Symbol.toStringTag && Object.defineProperty(e, Symbol.toStringTag, {
            value: "Module"
        }),
        Object.defineProperty(e, "__esModule", {
            value: !0
        })
    },
    n.t = function(e, t) {
        if (1 & t && (e = n(e)), 8 & t) return e;
        if (4 & t && "object" == typeof e && e && e.__esModule) return e;
        var r = Object.create(null);
        if (n.r(r), Object.defineProperty(r, "default", {
            enumerable: !0,
            value: e
        }), 2 & t && "string" != typeof e) for (var o in e) n.d(r, o,
        function(t) {
            return e[t]
        }.bind(null, o));
        return r
    },
    n.n = function(e) {
        var t = e && e.__esModule ?
        function() {
            return e.
        default
        }:
        function() {
            return e
        };
        return n.d(t, "a", t),
        t
    },
    n.o = function(e, t) {
        return Object.prototype.hasOwnProperty.call(e, t)
    },
    n.p = "https://assets.xmind.net/www/",
    n(n.s = 175)
} ({
    175 : function(e, t, n) {
        "use strict";
        var r, o = n(73),
        i = n(34),
        a = "3TzT" ; // location.pathname.match(/^\/(m|embed)\/(([0-9A-Za-z])+)/)[2];
        function s() {
            new i.DotAnimation(".dot-animate", 3, ".");
            var e = /(micromessenger|webbrowser)/.test(navigator.userAgent.toLocaleLowerCase()),
            t = $(".share-map__loading").removeClass("invisible");
            if (e) {
                t.find("video").addClass("d-none");
                var n = t.find("img");
                n.attr("src", n.attr("data-src")),
                n.removeClass("d-none")
            }
        }
        $((r = regeneratorRuntime.mark((function e() {
            return regeneratorRuntime.wrap((function(e) {
                for (;;) switch (e.prev = e.next) {
                case 0:
                    s(),
                    new o.ShareMapCore({},
                    {
                        hash: a
                    });
                case 2:
                case "end":
                    return e.stop()
                }
            }), e, this)
        })),
        function() {
            var e = r.apply(this, arguments);
            return new Promise((function(t, n) {
                return function r(o, i) {
                    try {
                        var a = e[o](i),
                        s = a.value
                    } catch(e) {
                        return void n(e)
                    }
                    if (!a.done) return Promise.resolve(s).then((function(e) {
                        r("next", e)
                    }), (function(e) {
                        r("throw", e)
                    }));
                    t(s)
                } ("next")
            }))
        }))
    },
    18 : function(e, t) {
        var n;
        n = function() {
            return this
        } ();
        try {
            n = n || new Function("return this")()
        } catch(e) {
            "object" == typeof window && (n = window)
        }
        e.exports = n
    },
    20 : function(e, t, n) { (function(t) {
            e.exports = function e(t, n, r) {
                function o(a, s) {
                    if (!n[a]) {
                        if (!t[a]) {
                            if (i) return i(a, !0);
                            var c = new Error("Cannot find module '" + a + "'");
                            throw c.code = "MODULE_NOT_FOUND",
                            c
                        }
                        var u = n[a] = {
                            exports: {}
                        };
                        t[a][0].call(u.exports, (function(e) {
                            return o(t[a][1][e] || e)
                        }), u, u.exports, e, t, n, r)
                    }
                    return n[a].exports
                }
                for (var i = !1,
                a = 0; a < r.length; a++) o(r[a]);
                return o
            } ({
                1 : [function(e, n, r) { (function(e) {
                        "use strict";
                        var t, r, o = e.MutationObserver || e.WebKitMutationObserver;
                        if (o) {
                            var i = 0,
                            a = new o(l),
                            s = e.document.createTextNode("");
                            a.observe(s, {
                                characterData: !0
                            }),
                            t = function() {
                                s.data = i = ++i % 2
                            }
                        } else if (e.setImmediate || void 0 === e.MessageChannel) t = "document" in e && "onreadystatechange" in e.document.createElement("script") ?
                        function() {
                            var t = e.document.createElement("script");
                            t.onreadystatechange = function() {
                                l(),
                                t.onreadystatechange = null,
                                t.parentNode.removeChild(t),
                                t = null
                            },
                            e.document.documentElement.appendChild(t)
                        }: function() {
                            setTimeout(l, 0)
                        };
                        else {
                            var c = new e.MessageChannel;
                            c.port1.onmessage = l,
                            t = function() {
                                c.port2.postMessage(0)
                            }
                        }
                        var u = [];
                        function l() {
                            var e, t;
                            r = !0;
                            for (var n = u.length; n;) {
                                for (t = u, u = [], e = -1; ++e < n;) t[e]();
                                n = u.length
                            }
                            r = !1
                        }
                        n.exports = function(e) {
                            1 !== u.push(e) || r || t()
                        }
                    }).call(this, void 0 !== t ? t: "undefined" != typeof self ? self: "undefined" != typeof window ? window: {})
                },
                {}],
                2 : [function(e, t, n) {
                    "use strict";
                    var r = e(1);
                    function o() {}
                    var i = {},
                    a = ["REJECTED"],
                    s = ["FULFILLED"],
                    c = ["PENDING"];
                    function u(e) {
                        if ("function" != typeof e) throw new TypeError("resolver must be a function");
                        this.state = c,
                        this.queue = [],
                        this.outcome = void 0,
                        e !== o && h(this, e)
                    }
                    function l(e, t, n) {
                        this.promise = e,
                        "function" == typeof t && (this.onFulfilled = t, this.callFulfilled = this.otherCallFulfilled),
                        "function" == typeof n && (this.onRejected = n, this.callRejected = this.otherCallRejected)
                    }
                    function f(e, t, n) {
                        r((function() {
                            var r;
                            try {
                                r = t(n)
                            } catch(t) {
                                return i.reject(e, t)
                            }
                            r === e ? i.reject(e, new TypeError("Cannot resolve promise with itself")) : i.resolve(e, r)
                        }))
                    }
                    function d(e) {
                        var t = e && e.then;
                        if (e && ("object" == typeof e || "function" == typeof e) && "function" == typeof t) return function() {
                            t.apply(e, arguments)
                        }
                    }
                    function h(e, t) {
                        var n = !1;
                        function r(t) {
                            n || (n = !0, i.reject(e, t))
                        }
                        function o(t) {
                            n || (n = !0, i.resolve(e, t))
                        }
                        var a = v((function() {
                            t(o, r)
                        }));
                        "error" === a.status && r(a.value)
                    }
                    function v(e, t) {
                        var n = {};
                        try {
                            n.value = e(t),
                            n.status = "success"
                        } catch(e) {
                            n.status = "error",
                            n.value = e
                        }
                        return n
                    }
                    t.exports = u,
                    u.prototype.
                    catch = function(e) {
                        return this.then(null, e)
                    },
                    u.prototype.then = function(e, t) {
                        if ("function" != typeof e && this.state === s || "function" != typeof t && this.state === a) return this;
                        var n = new this.constructor(o);
                        this.state !== c ? f(n, this.state === s ? e: t, this.outcome) : this.queue.push(new l(n, e, t));
                        return n
                    },
                    l.prototype.callFulfilled = function(e) {
                        i.resolve(this.promise, e)
                    },
                    l.prototype.otherCallFulfilled = function(e) {
                        f(this.promise, this.onFulfilled, e)
                    },
                    l.prototype.callRejected = function(e) {
                        i.reject(this.promise, e)
                    },
                    l.prototype.otherCallRejected = function(e) {
                        f(this.promise, this.onRejected, e)
                    },
                    i.resolve = function(e, t) {
                        var n = v(d, t);
                        if ("error" === n.status) return i.reject(e, n.value);
                        var r = n.value;
                        if (r) h(e, r);
                        else {
                            e.state = s,
                            e.outcome = t;
                            for (var o = -1,
                            a = e.queue.length; ++o < a;) e.queue[o].callFulfilled(t)
                        }
                        return e
                    },
                    i.reject = function(e, t) {
                        e.state = a,
                        e.outcome = t;
                        for (var n = -1,
                        r = e.queue.length; ++n < r;) e.queue[n].callRejected(t);
                        return e
                    },
                    u.resolve = function(e) {
                        return e instanceof this ? e: i.resolve(new this(o), e)
                    },
                    u.reject = function(e) {
                        var t = new this(o);
                        return i.reject(t, e)
                    },
                    u.all = function(e) {
                        var t = this;
                        if ("[object Array]" !== Object.prototype.toString.call(e)) return this.reject(new TypeError("must be an array"));
                        var n = e.length,
                        r = !1;
                        if (!n) return this.resolve([]);
                        for (var a = new Array(n), s = 0, c = -1, u = new this(o); ++c < n;) l(e[c], c);
                        return u;
                        function l(e, o) {
                            t.resolve(e).then((function(e) {
                                a[o] = e,
                                ++s !== n || r || (r = !0, i.resolve(u, a))
                            }), (function(e) {
                                r || (r = !0, i.reject(u, e))
                            }))
                        }
                    },
                    u.race = function(e) {
                        if ("[object Array]" !== Object.prototype.toString.call(e)) return this.reject(new TypeError("must be an array"));
                        var t = e.length,
                        n = !1;
                        if (!t) return this.resolve([]);
                        for (var r, a = -1,
                        s = new this(o); ++a < t;) r = e[a],
                        this.resolve(r).then((function(e) {
                            n || (n = !0, i.resolve(s, e))
                        }), (function(e) {
                            n || (n = !0, i.reject(s, e))
                        }));
                        return s
                    }
                },
                {
                    1 : 1
                }],
                3 : [function(e, n, r) { (function(t) {
                        "use strict";
                        "function" != typeof t.Promise && (t.Promise = e(2))
                    }).call(this, void 0 !== t ? t: "undefined" != typeof self ? self: "undefined" != typeof window ? window: {})
                },
                {
                    2 : 2
                }],
                4 : [function(e, t, n) {
                    "use strict";
                    var r = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ?
                    function(e) {
                        return typeof e
                    }: function(e) {
                        return e && "function" == typeof Symbol && e.constructor === Symbol && e !== Symbol.prototype ? "symbol": typeof e
                    },
                    o = function() {
                        try {
                            if ("undefined" != typeof indexedDB) return indexedDB;
                            if ("undefined" != typeof webkitIndexedDB) return webkitIndexedDB;
                            if ("undefined" != typeof mozIndexedDB) return mozIndexedDB;
                            if ("undefined" != typeof OIndexedDB) return OIndexedDB;
                            if ("undefined" != typeof msIndexedDB) return msIndexedDB
                        } catch(e) {
                            return
                        }
                    } ();
                    function i(e, t) {
                        e = e || [],
                        t = t || {};
                        try {
                            return new Blob(e, t)
                        } catch(o) {
                            if ("TypeError" !== o.name) throw o;
                            for (var n = new("undefined" != typeof BlobBuilder ? BlobBuilder: "undefined" != typeof MSBlobBuilder ? MSBlobBuilder: "undefined" != typeof MozBlobBuilder ? MozBlobBuilder: WebKitBlobBuilder), r = 0; r < e.length; r += 1) n.append(e[r]);
                            return n.getBlob(t.type)
                        }
                    }
                    "undefined" == typeof Promise && e(3);
                    var a = Promise;
                    function s(e, t) {
                        t && e.then((function(e) {
                            t(null, e)
                        }), (function(e) {
                            t(e)
                        }))
                    }
                    function c(e, t, n) {
                        "function" == typeof t && e.then(t),
                        "function" == typeof n && e.
                        catch(n)
                    }
                    function u(e) {
                        return "string" != typeof e && (console.warn(e + " used as a key, but it is not a string."), e = String(e)),
                        e
                    }
                    function l() {
                        if (arguments.length && "function" == typeof arguments[arguments.length - 1]) return arguments[arguments.length - 1]
                    }
                    var f = "local-forage-detect-blob-support",
                    d = void 0,
                    h = {},
                    v = Object.prototype.toString,
                    m = "readonly",
                    p = "readwrite";
                    function y(e) {
                        return "boolean" == typeof d ? a.resolve(d) : function(e) {
                            return new a((function(t) {
                                var n = e.transaction(f, p),
                                r = i([""]);
                                n.objectStore(f).put(r, "key"),
                                n.onabort = function(e) {
                                    e.preventDefault(),
                                    e.stopPropagation(),
                                    t(!1)
                                },
                                n.oncomplete = function() {
                                    var e = navigator.userAgent.match(/Chrome\/(\d+)/),
                                    n = navigator.userAgent.match(/Edge\//);
                                    t(n || !e || parseInt(e[1], 10) >= 43)
                                }
                            })).
                            catch((function() {
                                return ! 1
                            }))
                        } (e).then((function(e) {
                            return d = e
                        }))
                    }
                    function b(e) {
                        var t = h[e.name],
                        n = {};
                        n.promise = new a((function(e, t) {
                            n.resolve = e,
                            n.reject = t
                        })),
                        t.deferredOperations.push(n),
                        t.dbReady ? t.dbReady = t.dbReady.then((function() {
                            return n.promise
                        })) : t.dbReady = n.promise
                    }
                    function g(e) {
                        var t = h[e.name].deferredOperations.pop();
                        if (t) return t.resolve(),
                        t.promise
                    }
                    function w(e, t) {
                        var n = h[e.name].deferredOperations.pop();
                        if (n) return n.reject(t),
                        n.promise
                    }
                    function _(e, t) {
                        return new a((function(n, r) {
                            if (h[e.name] = h[e.name] || {
                                forages: [],
                                db: null,
                                dbReady: null,
                                deferredOperations: []
                            },
                            e.db) {
                                if (!t) return n(e.db);
                                b(e),
                                e.db.close()
                            }
                            var i = [e.name];
                            t && i.push(e.version);
                            var a = o.open.apply(o, i);
                            t && (a.onupgradeneeded = function(t) {
                                var n = a.result;
                                try {
                                    n.createObjectStore(e.storeName),
                                    t.oldVersion <= 1 && n.createObjectStore(f)
                                } catch(n) {
                                    if ("ConstraintError" !== n.name) throw n;
                                    console.warn('The database "' + e.name + '" has been upgraded from version ' + t.oldVersion + " to version " + t.newVersion + ', but the storage "' + e.storeName + '" already exists.')
                                }
                            }),
                            a.onerror = function(e) {
                                e.preventDefault(),
                                r(a.error)
                            },
                            a.onsuccess = function() {
                                n(a.result),
                                g(e)
                            }
                        }))
                    }
                    function S(e) {
                        return _(e, !1)
                    }
                    function k(e) {
                        return _(e, !0)
                    }
                    function I(e, t) {
                        if (!e.db) return ! 0;
                        var n = !e.db.objectStoreNames.contains(e.storeName),
                        r = e.version < e.db.version,
                        o = e.version > e.db.version;
                        if (r && (e.version !== t && console.warn('The database "' + e.name + "\" can't be downgraded from version " + e.db.version + " to version " + e.version + "."), e.version = e.db.version), o || n) {
                            if (n) {
                                var i = e.db.version + 1;
                                i > e.version && (e.version = i)
                            }
                            return ! 0
                        }
                        return ! 1
                    }
                    function E(e) {
                        return i([function(e) {
                            for (var t = e.length,
                            n = new ArrayBuffer(t), r = new Uint8Array(n), o = 0; o < t; o++) r[o] = e.charCodeAt(o);
                            return n
                        } (atob(e.data))], {
                            type: e.type
                        })
                    }
                    function x(e) {
                        return e && e.__local_forage_encoded_blob
                    }
                    function C(e) {
                        var t = this,
                        n = t._initReady().then((function() {
                            var e = h[t._dbInfo.name];
                            if (e && e.dbReady) return e.dbReady
                        }));
                        return c(n, e, e),
                        n
                    }
                    function O(e, t, n, r) {
                        void 0 === r && (r = 1);
                        try {
                            var o = e.db.transaction(e.storeName, t);
                            n(null, o)
                        } catch(o) {
                            if (r > 0 && (!e.db || "InvalidStateError" === o.name || "NotFoundError" === o.name)) return a.resolve().then((function() {
                                if (!e.db || "NotFoundError" === o.name && !e.db.objectStoreNames.contains(e.storeName) && e.version <= e.db.version) return e.db && (e.version = e.db.version + 1),
                                k(e)
                            })).then((function() {
                                return function(e) {
                                    b(e);
                                    for (var t = h[e.name], n = t.forages, r = 0; r < n.length; r++) {
                                        var o = n[r];
                                        o._dbInfo.db && (o._dbInfo.db.close(), o._dbInfo.db = null)
                                    }
                                    return e.db = null,
                                    S(e).then((function(t) {
                                        return e.db = t,
                                        I(e) ? k(e) : t
                                    })).then((function(r) {
                                        e.db = t.db = r;
                                        for (var o = 0; o < n.length; o++) n[o]._dbInfo.db = r
                                    })).
                                    catch((function(t) {
                                        throw w(e, t),
                                        t
                                    }))
                                } (e).then((function() {
                                    O(e, t, n, r - 1)
                                }))
                            })).
                            catch(n);
                            n(o)
                        }
                    }
                    var j = {
                        _driver: "asyncStorage",
                        _initStorage: function(e) {
                            var t = this,
                            n = {
                                db: null
                            };
                            if (e) for (var r in e) n[r] = e[r];
                            var o = h[n.name];
                            o || (o = {
                                forages: [],
                                db: null,
                                dbReady: null,
                                deferredOperations: []
                            },
                            h[n.name] = o),
                            o.forages.push(t),
                            t._initReady || (t._initReady = t.ready, t.ready = C);
                            var i = [];
                            function s() {
                                return a.resolve()
                            }
                            for (var c = 0; c < o.forages.length; c++) {
                                var u = o.forages[c];
                                u !== t && i.push(u._initReady().
                                catch(s))
                            }
                            var l = o.forages.slice(0);
                            return a.all(i).then((function() {
                                return n.db = o.db,
                                S(n)
                            })).then((function(e) {
                                return n.db = e,
                                I(n, t._defaultConfig.version) ? k(n) : e
                            })).then((function(e) {
                                n.db = o.db = e,
                                t._dbInfo = n;
                                for (var r = 0; r < l.length; r++) {
                                    var i = l[r];
                                    i !== t && (i._dbInfo.db = n.db, i._dbInfo.version = n.version)
                                }
                            }))
                        },
                        _support: function() {
                            try {
                                if (!o || !o.open) return ! 1;
                                var e = "undefined" != typeof openDatabase && /(Safari|iPhone|iPad|iPod)/.test(navigator.userAgent) && !/Chrome/.test(navigator.userAgent) && !/BlackBerry/.test(navigator.platform),
                                t = "function" == typeof fetch && -1 !== fetch.toString().indexOf("[native code");
                                return (!e || t) && "undefined" != typeof indexedDB && "undefined" != typeof IDBKeyRange
                            } catch(e) {
                                return ! 1
                            }
                        } (),
                        iterate: function(e, t) {
                            var n = this,
                            r = new a((function(t, r) {
                                n.ready().then((function() {
                                    O(n._dbInfo, m, (function(o, i) {
                                        if (o) return r(o);
                                        try {
                                            var a = i.objectStore(n._dbInfo.storeName).openCursor(),
                                            s = 1;
                                            a.onsuccess = function() {
                                                var n = a.result;
                                                if (n) {
                                                    var r = n.value;
                                                    x(r) && (r = E(r));
                                                    var o = e(r, n.key, s++);
                                                    void 0 !== o ? t(o) : n.
                                                    continue ()
                                                } else t()
                                            },
                                            a.onerror = function() {
                                                r(a.error)
                                            }
                                        } catch(e) {
                                            r(e)
                                        }
                                    }))
                                })).
                                catch(r)
                            }));
                            return s(r, t),
                            r
                        },
                        getItem: function(e, t) {
                            var n = this;
                            e = u(e);
                            var r = new a((function(t, r) {
                                n.ready().then((function() {
                                    O(n._dbInfo, m, (function(o, i) {
                                        if (o) return r(o);
                                        try {
                                            var a = i.objectStore(n._dbInfo.storeName).get(e);
                                            a.onsuccess = function() {
                                                var e = a.result;
                                                void 0 === e && (e = null),
                                                x(e) && (e = E(e)),
                                                t(e)
                                            },
                                            a.onerror = function() {
                                                r(a.error)
                                            }
                                        } catch(e) {
                                            r(e)
                                        }
                                    }))
                                })).
                                catch(r)
                            }));
                            return s(r, t),
                            r
                        },
                        setItem: function(e, t, n) {
                            var r = this;
                            e = u(e);
                            var o = new a((function(n, o) {
                                var i;
                                r.ready().then((function() {
                                    return i = r._dbInfo,
                                    "[object Blob]" === v.call(t) ? y(i.db).then((function(e) {
                                        return e ? t: (n = t, new a((function(e, t) {
                                            var r = new FileReader;
                                            r.onerror = t,
                                            r.onloadend = function(t) {
                                                var r = btoa(t.target.result || "");
                                                e({
                                                    __local_forage_encoded_blob: !0,
                                                    data: r,
                                                    type: n.type
                                                })
                                            },
                                            r.readAsBinaryString(n)
                                        })));
                                        var n
                                    })) : t
                                })).then((function(t) {
                                    O(r._dbInfo, p, (function(i, a) {
                                        if (i) return o(i);
                                        try {
                                            var s = a.objectStore(r._dbInfo.storeName);
                                            null === t && (t = void 0);
                                            var c = s.put(t, e);
                                            a.oncomplete = function() {
                                                void 0 === t && (t = null),
                                                n(t)
                                            },
                                            a.onabort = a.onerror = function() {
                                                var e = c.error ? c.error: c.transaction.error;
                                                o(e)
                                            }
                                        } catch(e) {
                                            o(e)
                                        }
                                    }))
                                })).
                                catch(o)
                            }));
                            return s(o, n),
                            o
                        },
                        removeItem: function(e, t) {
                            var n = this;
                            e = u(e);
                            var r = new a((function(t, r) {
                                n.ready().then((function() {
                                    O(n._dbInfo, p, (function(o, i) {
                                        if (o) return r(o);
                                        try {
                                            var a = i.objectStore(n._dbInfo.storeName).delete(e);
                                            i.oncomplete = function() {
                                                t()
                                            },
                                            i.onerror = function() {
                                                r(a.error)
                                            },
                                            i.onabort = function() {
                                                var e = a.error ? a.error: a.transaction.error;
                                                r(e)
                                            }
                                        } catch(e) {
                                            r(e)
                                        }
                                    }))
                                })).
                                catch(r)
                            }));
                            return s(r, t),
                            r
                        },
                        clear: function(e) {
                            var t = this,
                            n = new a((function(e, n) {
                                t.ready().then((function() {
                                    O(t._dbInfo, p, (function(r, o) {
                                        if (r) return n(r);
                                        try {
                                            var i = o.objectStore(t._dbInfo.storeName).clear();
                                            o.oncomplete = function() {
                                                e()
                                            },
                                            o.onabort = o.onerror = function() {
                                                var e = i.error ? i.error: i.transaction.error;
                                                n(e)
                                            }
                                        } catch(e) {
                                            n(e)
                                        }
                                    }))
                                })).
                                catch(n)
                            }));
                            return s(n, e),
                            n
                        },
                        length: function(e) {
                            var t = this,
                            n = new a((function(e, n) {
                                t.ready().then((function() {
                                    O(t._dbInfo, m, (function(r, o) {
                                        if (r) return n(r);
                                        try {
                                            var i = o.objectStore(t._dbInfo.storeName).count();
                                            i.onsuccess = function() {
                                                e(i.result)
                                            },
                                            i.onerror = function() {
                                                n(i.error)
                                            }
                                        } catch(e) {
                                            n(e)
                                        }
                                    }))
                                })).
                                catch(n)
                            }));
                            return s(n, e),
                            n
                        },
                        key: function(e, t) {
                            var n = this,
                            r = new a((function(t, r) {
                                e < 0 ? t(null) : n.ready().then((function() {
                                    O(n._dbInfo, m, (function(o, i) {
                                        if (o) return r(o);
                                        try {
                                            var a = i.objectStore(n._dbInfo.storeName),
                                            s = !1,
                                            c = a.openKeyCursor();
                                            c.onsuccess = function() {
                                                var n = c.result;
                                                n ? 0 === e ? t(n.key) : s ? t(n.key) : (s = !0, n.advance(e)) : t(null)
                                            },
                                            c.onerror = function() {
                                                r(c.error)
                                            }
                                        } catch(e) {
                                            r(e)
                                        }
                                    }))
                                })).
                                catch(r)
                            }));
                            return s(r, t),
                            r
                        },
                        keys: function(e) {
                            var t = this,
                            n = new a((function(e, n) {
                                t.ready().then((function() {
                                    O(t._dbInfo, m, (function(r, o) {
                                        if (r) return n(r);
                                        try {
                                            var i = o.objectStore(t._dbInfo.storeName).openKeyCursor(),
                                            a = [];
                                            i.onsuccess = function() {
                                                var t = i.result;
                                                t ? (a.push(t.key), t.
                                                continue ()) : e(a)
                                            },
                                            i.onerror = function() {
                                                n(i.error)
                                            }
                                        } catch(e) {
                                            n(e)
                                        }
                                    }))
                                })).
                                catch(n)
                            }));
                            return s(n, e),
                            n
                        },
                        dropInstance: function(e, t) {
                            t = l.apply(this, arguments);
                            var n, r = this.config();
                            if ((e = "function" != typeof e && e || {}).name || (e.name = e.name || r.name, e.storeName = e.storeName || r.storeName), e.name) {
                                var i = e.name === r.name && this._dbInfo.db,
                                c = i ? a.resolve(this._dbInfo.db) : S(e).then((function(t) {
                                    var n = h[e.name],
                                    r = n.forages;
                                    n.db = t;
                                    for (var o = 0; o < r.length; o++) r[o]._dbInfo.db = t;
                                    return t
                                }));
                                n = e.storeName ? c.then((function(t) {
                                    if (t.objectStoreNames.contains(e.storeName)) {
                                        var n = t.version + 1;
                                        b(e);
                                        var r = h[e.name],
                                        i = r.forages;
                                        t.close();
                                        for (var s = 0; s < i.length; s++) {
                                            var c = i[s];
                                            c._dbInfo.db = null,
                                            c._dbInfo.version = n
                                        }
                                        return new a((function(t, r) {
                                            var i = o.open(e.name, n);
                                            i.onerror = function(e) {
                                                i.result.close(),
                                                r(e)
                                            },
                                            i.onupgradeneeded = function() {
                                                i.result.deleteObjectStore(e.storeName)
                                            },
                                            i.onsuccess = function() {
                                                var e = i.result;
                                                e.close(),
                                                t(e)
                                            }
                                        })).then((function(e) {
                                            r.db = e;
                                            for (var t = 0; t < i.length; t++) {
                                                var n = i[t];
                                                n._dbInfo.db = e,
                                                g(n._dbInfo)
                                            }
                                        })).
                                        catch((function(t) {
                                            throw (w(e, t) || a.resolve()).
                                            catch((function() {})),
                                            t
                                        }))
                                    }
                                })) : c.then((function(t) {
                                    b(e);
                                    var n = h[e.name],
                                    r = n.forages;
                                    t.close();
                                    for (var i = 0; i < r.length; i++) {
                                        r[i]._dbInfo.db = null
                                    }
                                    return new a((function(t, n) {
                                        var r = o.deleteDatabase(e.name);
                                        r.onerror = r.onblocked = function(e) {
                                            var t = r.result;
                                            t && t.close(),
                                            n(e)
                                        },
                                        r.onsuccess = function() {
                                            var e = r.result;
                                            e && e.close(),
                                            t(e)
                                        }
                                    })).then((function(e) {
                                        n.db = e;
                                        for (var t = 0; t < r.length; t++) {
                                            g(r[t]._dbInfo)
                                        }
                                    })).
                                    catch((function(t) {
                                        throw (w(e, t) || a.resolve()).
                                        catch((function() {})),
                                        t
                                    }))
                                }))
                            } else n = a.reject("Invalid arguments");
                            return s(n, t),
                            n
                        }
                    },
                    R = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/",
                    A = /^~~local_forage_type~([^~]+)~/,
                    N = "__lfsc__:",
                    D = N.length,
                    T = "arbf",
                    M = "blob",
                    z = "si08",
                    B = "ui08",
                    P = "uic8",
                    F = "si16",
                    L = "si32",
                    U = "ur16",
                    $ = "ui32",
                    q = "fl32",
                    W = "fl64",
                    V = D + T.length,
                    X = Object.prototype.toString;
                    function G(e) {
                        var t, n, r, o, i, a = .75 * e.length,
                        s = e.length,
                        c = 0;
                        "=" === e[e.length - 1] && (a--, "=" === e[e.length - 2] && a--);
                        var u = new ArrayBuffer(a),
                        l = new Uint8Array(u);
                        for (t = 0; t < s; t += 4) n = R.indexOf(e[t]),
                        r = R.indexOf(e[t + 1]),
                        o = R.indexOf(e[t + 2]),
                        i = R.indexOf(e[t + 3]),
                        l[c++] = n << 2 | r >> 4,
                        l[c++] = (15 & r) << 4 | o >> 2,
                        l[c++] = (3 & o) << 6 | 63 & i;
                        return u
                    }
                    function H(e) {
                        var t, n = new Uint8Array(e),
                        r = "";
                        for (t = 0; t < n.length; t += 3) r += R[n[t] >> 2],
                        r += R[(3 & n[t]) << 4 | n[t + 1] >> 4],
                        r += R[(15 & n[t + 1]) << 2 | n[t + 2] >> 6],
                        r += R[63 & n[t + 2]];
                        return n.length % 3 == 2 ? r = r.substring(0, r.length - 1) + "=": n.length % 3 == 1 && (r = r.substring(0, r.length - 2) + "=="),
                        r
                    }
                    var K = {
                        serialize: function(e, t) {
                            var n = "";
                            if (e && (n = X.call(e)), e && ("[object ArrayBuffer]" === n || e.buffer && "[object ArrayBuffer]" === X.call(e.buffer))) {
                                var r, o = N;
                                e instanceof ArrayBuffer ? (r = e, o += T) : (r = e.buffer, "[object Int8Array]" === n ? o += z: "[object Uint8Array]" === n ? o += B: "[object Uint8ClampedArray]" === n ? o += P: "[object Int16Array]" === n ? o += F: "[object Uint16Array]" === n ? o += U: "[object Int32Array]" === n ? o += L: "[object Uint32Array]" === n ? o += $: "[object Float32Array]" === n ? o += q: "[object Float64Array]" === n ? o += W: t(new Error("Failed to get type for BinaryArray"))),
                                t(o + H(r))
                            } else if ("[object Blob]" === n) {
                                var i = new FileReader;
                                i.onload = function() {
                                    var n = "~~local_forage_type~" + e.type + "~" + H(this.result);
                                    t(N + M + n)
                                },
                                i.readAsArrayBuffer(e)
                            } else try {
                                t(JSON.stringify(e))
                            } catch(n) {
                                console.error("Couldn't convert value into a JSON string: ", e),
                                t(null, n)
                            }
                        },
                        deserialize: function(e) {
                            if (e.substring(0, D) !== N) return JSON.parse(e);
                            var t, n = e.substring(V),
                            r = e.substring(D, V);
                            if (r === M && A.test(n)) {
                                var o = n.match(A);
                                t = o[1],
                                n = n.substring(o[0].length)
                            }
                            var a = G(n);
                            switch (r) {
                            case T:
                                return a;
                            case M:
                                return i([a], {
                                    type: t
                                });
                            case z:
                                return new Int8Array(a);
                            case B:
                                return new Uint8Array(a);
                            case P:
                                return new Uint8ClampedArray(a);
                            case F:
                                return new Int16Array(a);
                            case U:
                                return new Uint16Array(a);
                            case L:
                                return new Int32Array(a);
                            case $:
                                return new Uint32Array(a);
                            case q:
                                return new Float32Array(a);
                            case W:
                                return new Float64Array(a);
                            default:
                                throw new Error("Unkown type: " + r)
                            }
                        },
                        stringToBuffer: G,
                        bufferToString: H
                    };
                    function Y(e, t, n, r) {
                        e.executeSql("CREATE TABLE IF NOT EXISTS " + t.storeName + " (id INTEGER PRIMARY KEY, key unique, value)", [], n, r)
                    }
                    function Q(e, t, n, r, o, i) {
                        e.executeSql(n, r, o, (function(e, a) {
                            a.code === a.SYNTAX_ERR ? e.executeSql("SELECT name FROM sqlite_master WHERE type='table' AND name = ?", [t.storeName], (function(e, s) {
                                s.rows.length ? i(e, a) : Y(e, t, (function() {
                                    e.executeSql(n, r, o, i)
                                }), i)
                            }), i) : i(e, a)
                        }), i)
                    }
                    var Z = {
                        _driver: "webSQLStorage",
                        _initStorage: function(e) {
                            var t = this,
                            n = {
                                db: null
                            };
                            if (e) for (var r in e) n[r] = "string" != typeof e[r] ? e[r].toString() : e[r];
                            var o = new a((function(e, r) {
                                try {
                                    n.db = openDatabase(n.name, String(n.version), n.description, n.size)
                                } catch(e) {
                                    return r(e)
                                }
                                n.db.transaction((function(o) {
                                    Y(o, n, (function() {
                                        t._dbInfo = n,
                                        e()
                                    }), (function(e, t) {
                                        r(t)
                                    }))
                                }), r)
                            }));
                            return n.serializer = K,
                            o
                        },
                        _support: "function" == typeof openDatabase,
                        iterate: function(e, t) {
                            var n = this,
                            r = new a((function(t, r) {
                                n.ready().then((function() {
                                    var o = n._dbInfo;
                                    o.db.transaction((function(n) {
                                        Q(n, o, "SELECT * FROM " + o.storeName, [], (function(n, r) {
                                            for (var i = r.rows,
                                            a = i.length,
                                            s = 0; s < a; s++) {
                                                var c = i.item(s),
                                                u = c.value;
                                                if (u && (u = o.serializer.deserialize(u)), void 0 !== (u = e(u, c.key, s + 1))) return void t(u)
                                            }
                                            t()
                                        }), (function(e, t) {
                                            r(t)
                                        }))
                                    }))
                                })).
                                catch(r)
                            }));
                            return s(r, t),
                            r
                        },
                        getItem: function(e, t) {
                            var n = this;
                            e = u(e);
                            var r = new a((function(t, r) {
                                n.ready().then((function() {
                                    var o = n._dbInfo;
                                    o.db.transaction((function(n) {
                                        Q(n, o, "SELECT * FROM " + o.storeName + " WHERE key = ? LIMIT 1", [e], (function(e, n) {
                                            var r = n.rows.length ? n.rows.item(0).value: null;
                                            r && (r = o.serializer.deserialize(r)),
                                            t(r)
                                        }), (function(e, t) {
                                            r(t)
                                        }))
                                    }))
                                })).
                                catch(r)
                            }));
                            return s(r, t),
                            r
                        },
                        setItem: function(e, t, n) {
                            return function e(t, n, r, o) {
                                var i = this;
                                t = u(t);
                                var c = new a((function(a, s) {
                                    i.ready().then((function() {
                                        void 0 === n && (n = null);
                                        var c = n,
                                        u = i._dbInfo;
                                        u.serializer.serialize(n, (function(n, l) {
                                            l ? s(l) : u.db.transaction((function(e) {
                                                Q(e, u, "INSERT OR REPLACE INTO " + u.storeName + " (key, value) VALUES (?, ?)", [t, n], (function() {
                                                    a(c)
                                                }), (function(e, t) {
                                                    s(t)
                                                }))
                                            }), (function(n) {
                                                if (n.code === n.QUOTA_ERR) {
                                                    if (o > 0) return void a(e.apply(i, [t, c, r, o - 1]));
                                                    s(n)
                                                }
                                            }))
                                        }))
                                    })).
                                    catch(s)
                                }));
                                return s(c, r),
                                c
                            }.apply(this, [e, t, n, 1])
                        },
                        removeItem: function(e, t) {
                            var n = this;
                            e = u(e);
                            var r = new a((function(t, r) {
                                n.ready().then((function() {
                                    var o = n._dbInfo;
                                    o.db.transaction((function(n) {
                                        Q(n, o, "DELETE FROM " + o.storeName + " WHERE key = ?", [e], (function() {
                                            t()
                                        }), (function(e, t) {
                                            r(t)
                                        }))
                                    }))
                                })).
                                catch(r)
                            }));
                            return s(r, t),
                            r
                        },
                        clear: function(e) {
                            var t = this,
                            n = new a((function(e, n) {
                                t.ready().then((function() {
                                    var r = t._dbInfo;
                                    r.db.transaction((function(t) {
                                        Q(t, r, "DELETE FROM " + r.storeName, [], (function() {
                                            e()
                                        }), (function(e, t) {
                                            n(t)
                                        }))
                                    }))
                                })).
                                catch(n)
                            }));
                            return s(n, e),
                            n
                        },
                        length: function(e) {
                            var t = this,
                            n = new a((function(e, n) {
                                t.ready().then((function() {
                                    var r = t._dbInfo;
                                    r.db.transaction((function(t) {
                                        Q(t, r, "SELECT COUNT(key) as c FROM " + r.storeName, [], (function(t, n) {
                                            var r = n.rows.item(0).c;
                                            e(r)
                                        }), (function(e, t) {
                                            n(t)
                                        }))
                                    }))
                                })).
                                catch(n)
                            }));
                            return s(n, e),
                            n
                        },
                        key: function(e, t) {
                            var n = this,
                            r = new a((function(t, r) {
                                n.ready().then((function() {
                                    var o = n._dbInfo;
                                    o.db.transaction((function(n) {
                                        Q(n, o, "SELECT key FROM " + o.storeName + " WHERE id = ? LIMIT 1", [e + 1], (function(e, n) {
                                            var r = n.rows.length ? n.rows.item(0).key: null;
                                            t(r)
                                        }), (function(e, t) {
                                            r(t)
                                        }))
                                    }))
                                })).
                                catch(r)
                            }));
                            return s(r, t),
                            r
                        },
                        keys: function(e) {
                            var t = this,
                            n = new a((function(e, n) {
                                t.ready().then((function() {
                                    var r = t._dbInfo;
                                    r.db.transaction((function(t) {
                                        Q(t, r, "SELECT key FROM " + r.storeName, [], (function(t, n) {
                                            for (var r = [], o = 0; o < n.rows.length; o++) r.push(n.rows.item(o).key);
                                            e(r)
                                        }), (function(e, t) {
                                            n(t)
                                        }))
                                    }))
                                })).
                                catch(n)
                            }));
                            return s(n, e),
                            n
                        },
                        dropInstance: function(e, t) {
                            t = l.apply(this, arguments);
                            var n = this.config(); (e = "function" != typeof e && e || {}).name || (e.name = e.name || n.name, e.storeName = e.storeName || n.storeName);
                            var r, o = this;
                            return s(r = e.name ? new a((function(t) {
                                var r;
                                r = e.name === n.name ? o._dbInfo.db: openDatabase(e.name, "", "", 0),
                                e.storeName ? t({
                                    db: r,
                                    storeNames: [e.storeName]
                                }) : t(function(e) {
                                    return new a((function(t, n) {
                                        e.transaction((function(r) {
                                            r.executeSql("SELECT name FROM sqlite_master WHERE type='table' AND name <> '__WebKitDatabaseInfoTable__'", [], (function(n, r) {
                                                for (var o = [], i = 0; i < r.rows.length; i++) o.push(r.rows.item(i).name);
                                                t({
                                                    db: e,
                                                    storeNames: o
                                                })
                                            }), (function(e, t) {
                                                n(t)
                                            }))
                                        }), (function(e) {
                                            n(e)
                                        }))
                                    }))
                                } (r))
                            })).then((function(e) {
                                return new a((function(t, n) {
                                    e.db.transaction((function(r) {
                                        function o(e) {
                                            return new a((function(t, n) {
                                                r.executeSql("DROP TABLE IF EXISTS " + e, [], (function() {
                                                    t()
                                                }), (function(e, t) {
                                                    n(t)
                                                }))
                                            }))
                                        }
                                        for (var i = [], s = 0, c = e.storeNames.length; s < c; s++) i.push(o(e.storeNames[s]));
                                        a.all(i).then((function() {
                                            t()
                                        })).
                                        catch((function(e) {
                                            n(e)
                                        }))
                                    }), (function(e) {
                                        n(e)
                                    }))
                                }))
                            })) : a.reject("Invalid arguments"), t),
                            r
                        }
                    };
                    function J(e, t) {
                        var n = e.name + "/";
                        return e.storeName !== t.storeName && (n += e.storeName + "/"),
                        n
                    }
                    var ee = {
                        _driver: "localStorageWrapper",
                        _initStorage: function(e) {
                            var t = {};
                            if (e) for (var n in e) t[n] = e[n];
                            return t.keyPrefix = J(e, this._defaultConfig),
                            !
                            function() {
                                try {
                                    return localStorage.setItem("_localforage_support_test", !0),
                                    localStorage.removeItem("_localforage_support_test"),
                                    !1
                                } catch(e) {
                                    return ! 0
                                }
                            } () || localStorage.length > 0 ? (this._dbInfo = t, t.serializer = K, a.resolve()) : a.reject()
                        },
                        _support: function() {
                            try {
                                return "undefined" != typeof localStorage && "setItem" in localStorage && !!localStorage.setItem
                            } catch(e) {
                                return ! 1
                            }
                        } (),
                        iterate: function(e, t) {
                            var n = this,
                            r = n.ready().then((function() {
                                for (var t = n._dbInfo,
                                r = t.keyPrefix,
                                o = r.length,
                                i = localStorage.length,
                                a = 1,
                                s = 0; s < i; s++) {
                                    var c = localStorage.key(s);
                                    if (0 === c.indexOf(r)) {
                                        var u = localStorage.getItem(c);
                                        if (u && (u = t.serializer.deserialize(u)), void 0 !== (u = e(u, c.substring(o), a++))) return u
                                    }
                                }
                            }));
                            return s(r, t),
                            r
                        },
                        getItem: function(e, t) {
                            var n = this;
                            e = u(e);
                            var r = n.ready().then((function() {
                                var t = n._dbInfo,
                                r = localStorage.getItem(t.keyPrefix + e);
                                return r && (r = t.serializer.deserialize(r)),
                                r
                            }));
                            return s(r, t),
                            r
                        },
                        setItem: function(e, t, n) {
                            var r = this;
                            e = u(e);
                            var o = r.ready().then((function() {
                                void 0 === t && (t = null);
                                var n = t;
                                return new a((function(o, i) {
                                    var a = r._dbInfo;
                                    a.serializer.serialize(t, (function(t, r) {
                                        if (r) i(r);
                                        else try {
                                            localStorage.setItem(a.keyPrefix + e, t),
                                            o(n)
                                        } catch(e) {
                                            "QuotaExceededError" !== e.name && "NS_ERROR_DOM_QUOTA_REACHED" !== e.name || i(e),
                                            i(e)
                                        }
                                    }))
                                }))
                            }));
                            return s(o, n),
                            o
                        },
                        removeItem: function(e, t) {
                            var n = this;
                            e = u(e);
                            var r = n.ready().then((function() {
                                var t = n._dbInfo;
                                localStorage.removeItem(t.keyPrefix + e)
                            }));
                            return s(r, t),
                            r
                        },
                        clear: function(e) {
                            var t = this,
                            n = t.ready().then((function() {
                                for (var e = t._dbInfo.keyPrefix,
                                n = localStorage.length - 1; n >= 0; n--) {
                                    var r = localStorage.key(n);
                                    0 === r.indexOf(e) && localStorage.removeItem(r)
                                }
                            }));
                            return s(n, e),
                            n
                        },
                        length: function(e) {
                            var t = this.keys().then((function(e) {
                                return e.length
                            }));
                            return s(t, e),
                            t
                        },
                        key: function(e, t) {
                            var n = this,
                            r = n.ready().then((function() {
                                var t, r = n._dbInfo;
                                try {
                                    t = localStorage.key(e)
                                } catch(e) {
                                    t = null
                                }
                                return t && (t = t.substring(r.keyPrefix.length)),
                                t
                            }));
                            return s(r, t),
                            r
                        },
                        keys: function(e) {
                            var t = this,
                            n = t.ready().then((function() {
                                for (var e = t._dbInfo,
                                n = localStorage.length,
                                r = [], o = 0; o < n; o++) {
                                    var i = localStorage.key(o);
                                    0 === i.indexOf(e.keyPrefix) && r.push(i.substring(e.keyPrefix.length))
                                }
                                return r
                            }));
                            return s(n, e),
                            n
                        },
                        dropInstance: function(e, t) {
                            if (t = l.apply(this, arguments), !(e = "function" != typeof e && e || {}).name) {
                                var n = this.config();
                                e.name = e.name || n.name,
                                e.storeName = e.storeName || n.storeName
                            }
                            var r, o = this;
                            return s(r = e.name ? new a((function(t) {
                                e.storeName ? t(J(e, o._defaultConfig)) : t(e.name + "/")
                            })).then((function(e) {
                                for (var t = localStorage.length - 1; t >= 0; t--) {
                                    var n = localStorage.key(t);
                                    0 === n.indexOf(e) && localStorage.removeItem(n)
                                }
                            })) : a.reject("Invalid arguments"), t),
                            r
                        }
                    },
                    te = function(e, t) {
                        for (var n = e.length,
                        r = 0; r < n;) {
                            if ((o = e[r]) === (i = t) || "number" == typeof o && "number" == typeof i && isNaN(o) && isNaN(i)) return ! 0;
                            r++
                        }
                        var o, i;
                        return ! 1
                    },
                    ne = Array.isArray ||
                    function(e) {
                        return "[object Array]" === Object.prototype.toString.call(e)
                    },
                    re = {},
                    oe = {},
                    ie = {
                        INDEXEDDB: j,
                        WEBSQL: Z,
                        LOCALSTORAGE: ee
                    },
                    ae = [ie.INDEXEDDB._driver, ie.WEBSQL._driver, ie.LOCALSTORAGE._driver],
                    se = ["dropInstance"],
                    ce = ["clear", "getItem", "iterate", "key", "keys", "length", "removeItem", "setItem"].concat(se),
                    ue = {
                        description: "",
                        driver: ae.slice(),
                        name: "localforage",
                        size: 4980736,
                        storeName: "keyvaluepairs",
                        version: 1
                    };
                    function le(e, t) {
                        e[t] = function() {
                            var n = arguments;
                            return e.ready().then((function() {
                                return e[t].apply(e, n)
                            }))
                        }
                    }
                    function fe() {
                        for (var e = 1; e < arguments.length; e++) {
                            var t = arguments[e];
                            if (t) for (var n in t) t.hasOwnProperty(n) && (ne(t[n]) ? arguments[0][n] = t[n].slice() : arguments[0][n] = t[n])
                        }
                        return arguments[0]
                    }
                    var de = new(function() {
                        function e(t) {
                            for (var n in
                            function(e, t) {
                                if (! (e instanceof t)) throw new TypeError("Cannot call a class as a function")
                            } (this, e), ie) if (ie.hasOwnProperty(n)) {
                                var r = ie[n],
                                o = r._driver;
                                this[n] = o,
                                re[o] || this.defineDriver(r)
                            }
                            this._defaultConfig = fe({},
                            ue),
                            this._config = fe({},
                            this._defaultConfig, t),
                            this._driverSet = null,
                            this._initDriver = null,
                            this._ready = !1,
                            this._dbInfo = null,
                            this._wrapLibraryMethodsWithReady(),
                            this.setDriver(this._config.driver).
                            catch((function() {}))
                        }
                        return e.prototype.config = function(e) {
                            if ("object" === (void 0 === e ? "undefined": r(e))) {
                                if (this._ready) return new Error("Can't call config() after localforage has been used.");
                                for (var t in e) {
                                    if ("storeName" === t && (e[t] = e[t].replace(/\W/g, "_")), "version" === t && "number" != typeof e[t]) return new Error("Database version must be a number.");
                                    this._config[t] = e[t]
                                }
                                return ! ("driver" in e && e.driver) || this.setDriver(this._config.driver)
                            }
                            return "string" == typeof e ? this._config[e] : this._config
                        },
                        e.prototype.defineDriver = function(e, t, n) {
                            var r = new a((function(t, n) {
                                try {
                                    var r = e._driver,
                                    o = new Error("Custom driver not compliant; see https://mozilla.github.io/localForage/#definedriver");
                                    if (!e._driver) return void n(o);
                                    for (var i = ce.concat("_initStorage"), c = 0, u = i.length; c < u; c++) {
                                        var l = i[c];
                                        if ((!te(se, l) || e[l]) && "function" != typeof e[l]) return void n(o)
                                    } !
                                    function() {
                                        for (var t = function(e) {
                                            return function() {
                                                var t = new Error("Method " + e + " is not implemented by the current driver"),
                                                n = a.reject(t);
                                                return s(n, arguments[arguments.length - 1]),
                                                n
                                            }
                                        },
                                        n = 0, r = se.length; n < r; n++) {
                                            var o = se[n];
                                            e[o] || (e[o] = t(o))
                                        }
                                    } ();
                                    var f = function(n) {
                                        re[r] && console.info("Redefining LocalForage driver: " + r),
                                        re[r] = e,
                                        oe[r] = n,
                                        t()
                                    };
                                    "_support" in e ? e._support && "function" == typeof e._support ? e._support().then(f, n) : f( !! e._support) : f(!0)
                                } catch(e) {
                                    n(e)
                                }
                            }));
                            return c(r, t, n),
                            r
                        },
                        e.prototype.driver = function() {
                            return this._driver || null
                        },
                        e.prototype.getDriver = function(e, t, n) {
                            var r = re[e] ? a.resolve(re[e]) : a.reject(new Error("Driver not found."));
                            return c(r, t, n),
                            r
                        },
                        e.prototype.getSerializer = function(e) {
                            var t = a.resolve(K);
                            return c(t, e),
                            t
                        },
                        e.prototype.ready = function(e) {
                            var t = this,
                            n = t._driverSet.then((function() {
                                return null === t._ready && (t._ready = t._initDriver()),
                                t._ready
                            }));
                            return c(n, e, e),
                            n
                        },
                        e.prototype.setDriver = function(e, t, n) {
                            var r = this;
                            ne(e) || (e = [e]);
                            var o = this._getSupportedDrivers(e);
                            function i() {
                                r._config.driver = r.driver()
                            }
                            function s(e) {
                                return r._extend(e),
                                i(),
                                r._ready = r._initStorage(r._config),
                                r._ready
                            }
                            var u = null !== this._driverSet ? this._driverSet.
                            catch((function() {
                                return a.resolve()
                            })) : a.resolve();
                            return this._driverSet = u.then((function() {
                                var e = o[0];
                                return r._dbInfo = null,
                                r._ready = null,
                                r.getDriver(e).then((function(e) {
                                    r._driver = e._driver,
                                    i(),
                                    r._wrapLibraryMethodsWithReady(),
                                    r._initDriver = function(e) {
                                        return function() {
                                            var t = 0;
                                            return function n() {
                                                for (; t < e.length;) {
                                                    var o = e[t];
                                                    return t++,
                                                    r._dbInfo = null,
                                                    r._ready = null,
                                                    r.getDriver(o).then(s).
                                                    catch(n)
                                                }
                                                i();
                                                var c = new Error("No available storage method found.");
                                                return r._driverSet = a.reject(c),
                                                r._driverSet
                                            } ()
                                        }
                                    } (o)
                                }))
                            })).
                            catch((function() {
                                i();
                                var e = new Error("No available storage method found.");
                                return r._driverSet = a.reject(e),
                                r._driverSet
                            })),
                            c(this._driverSet, t, n),
                            this._driverSet
                        },
                        e.prototype.supports = function(e) {
                            return !! oe[e]
                        },
                        e.prototype._extend = function(e) {
                            fe(this, e)
                        },
                        e.prototype._getSupportedDrivers = function(e) {
                            for (var t = [], n = 0, r = e.length; n < r; n++) {
                                var o = e[n];
                                this.supports(o) && t.push(o)
                            }
                            return t
                        },
                        e.prototype._wrapLibraryMethodsWithReady = function() {
                            for (var e = 0,
                            t = ce.length; e < t; e++) le(this, ce[e])
                        },
                        e.prototype.createInstance = function(t) {
                            return new e(t)
                        },
                        e
                    } ());
                    t.exports = de
                },
                {
                    3 : 3
                }]
            },
            {},
            [4])(4)
        }).call(this, n(18))
    },
    34 : function(e, t, n) {
        "use strict";
        Object.defineProperty(t, "__esModule", {
            value: !0
        });
        var r, o, i = function() {
            function e(e, t) {
                for (var n = 0; n < t.length; n++) {
                    var r = t[n];
                    r.enumerable = r.enumerable || !1,
                    r.configurable = !0,
                    "value" in r && (r.writable = !0),
                    Object.defineProperty(e, r.key, r)
                }
            }
            return function(t, n, r) {
                return n && e(t.prototype, n),
                r && e(t, r),
                t
            }
        } ();
        function a(e, t) {
            if (! (e instanceof t)) throw new TypeError("Cannot call a class as a function")
        }
        t.reformatDate = function(e) {
            var t = new Date((e || "").replace(/-/g, "/").replace(/[TZ]/g, " ")),
            n = ((new Date).getTime() - t.getTime()) / 1e3,
            r = Math.floor(n / 86400);
            if (! (isNaN(r) || r < 0 || r >= 31)) return 0 === r && ((n < 60 ? "just now": n < 120 && "1 minute ago") || n < 3600 && Math.floor(n / 60) + " minutes ago" || n < 7200 && "1 hour ago" || n < 86400 && Math.floor(n / 3600) + " hours ago") || 1 === r && "Yesterday" || r < 7 && r + " days ago" || e
        },
        t.reformatAmount = function(e) {
            var t = Number(e);
            return t > 1e3 ? (t / 1e3).toFixed(1) + "k": t
        },
        t.execForElement = function(e, t) { (e = $(e)).text(t(e.text()))
        },
        t.DotAnimation = function e(t, n) {
            var r = arguments.length > 2 && void 0 !== arguments[2] ? arguments[2] : ".";
            a(this, e),
            this.el = $(t),
            this.count = n,
            this.char = r,
            this._chars = "",
            this.id = setInterval(function() {
                this._chars.length < this.count ? this._chars += this.char: this._chars = "",
                this.el.text(this._chars)
            }.bind(this), 500)
        },
        t.downloadMap = (r = regeneratorRuntime.mark((function e(t, n) {
            var r, o;
            return regeneratorRuntime.wrap((function(e) {
                for (;;) switch (e.prev = e.next) {
                case 0:
                    return e.next = 2,
                    api.getShareMapDownloadUrl(t);
                case 2:
                    r = e.sent,
                    (o = document.createElement("a")).setAttribute("download", n),
                    o.href = r.downloadUrl,
                    document.body.appendChild(o),
                    o.click(),
                    document.body.removeChild(o);
                case 9:
                case "end":
                    return e.stop()
                }
            }), e, this)
        })), o = function() {
            var e = r.apply(this, arguments);
            return new Promise((function(t, n) {
                return function r(o, i) {
                    try {
                        var a = e[o](i),
                        s = a.value
                    } catch(e) {
                        return void n(e)
                    }
                    if (!a.done) return Promise.resolve(s).then((function(e) {
                        r("next", e)
                    }), (function(e) {
                        r("throw", e)
                    }));
                    t(s)
                } ("next")
            }))
        },
        function(e, t) {
            return o.apply(this, arguments)
        }),
        t.WatchFunction = function() {
            function e(t, n) {
                var r = arguments.length > 2 && void 0 !== arguments[2] ? arguments[2] : 250;
                a(this, e),
                this.old = void 0,
                this.form = t,
                "function" == typeof this.form && (this.old = this.form()),
                this.callback = n,
                this.checker = setInterval(this.check.bind(this), r)
            }
            return i(e, [{
                key: "check",
                value: function() {
                    var e = this.form;
                    "function" == typeof e && (e = this.form()),
                    e !== this.old && (this.old = e, this.callback(e))
                }
            }]),
            e
        } ()
    },
    36 : function(e, t, n) {
        "use strict";
        Object.defineProperty(t, "__esModule", {
            value: !0
        });
        var r = function() {
            function e(e, t) {
                for (var n = 0; n < t.length; n++) {
                    var r = t[n];
                    r.enumerable = r.enumerable || !1,
                    r.configurable = !0,
                    "value" in r && (r.writable = !0),
                    Object.defineProperty(e, r.key, r)
                }
            }
            return function(t, n, r) {
                return n && e(t.prototype, n),
                r && e(t, r),
                t
            }
        } (),
        o = function(e, t) {
            if (Array.isArray(e)) return e;
            if (Symbol.iterator in Object(e)) return function(e, t) {
                var n = [],
                r = !0,
                o = !1,
                i = void 0;
                try {
                    for (var a, s = e[Symbol.iterator](); ! (r = (a = s.next()).done) && (n.push(a.value), !t || n.length !== t); r = !0);
                } catch(e) {
                    o = !0,
                    i = e
                } finally {
                    try { ! r && s.
                        return && s.
                        return ()
                    } finally {
                        if (o) throw i
                    }
                }
                return n
            } (e, t);
            throw new TypeError("Invalid attempt to destructure non-iterable instance")
        };
        function i(e, t, n) {
            var r = o(e.getContext("2d").getImageData(t, n, 1, 1).data, 4);
            return "rgba(" + r[0] + "," + r[1] + "," + r[2] + "," + r[3] + ")"
        }
        t.ImageColorPicker = function() {
            function e() { !
                function(e, t) {
                    if (! (e instanceof t)) throw new TypeError("Cannot call a class as a function")
                } (this, e),
                this.canvas = document.createElement("canvas")
            }
            return r(e, [{
                key: "pickBackground",
                value: function(e) {
                    this.canvas.width = e.width,
                    this.canvas.height = e.height;
                    var t = void 0,
                    n = void 0;
                    e.hasAttribute("crossorigin") || e.setAttribute("crossorigin", "anonymous");
                    try {
                        return this.canvas.getContext("2d").drawImage(e, 0, 0, e.width, e.height),
                        t = i(this.canvas, 1, 1),
                        n = i(this.canvas, 1, parseInt(e.width)),
                        function(e) {
                            var t = "",
                            n = {},
                            r = !0,
                            o = !1,
                            i = void 0;
                            try {
                                for (var a, s = e[Symbol.iterator](); ! (r = (a = s.next()).done); r = !0) {
                                    var c = a.value;
                                    n[c] ? n[c]++:n[c] = 0
                                }
                            } catch(e) {
                                o = !0,
                                i = e
                            } finally {
                                try { ! r && s.
                                    return && s.
                                    return ()
                                } finally {
                                    if (o) throw i
                                }
                            }
                            var u = !0,
                            l = !1,
                            f = void 0;
                            try {
                                for (var d, h = Object.keys(n)[Symbol.iterator](); ! (u = (d = h.next()).done); u = !0) {
                                    var v = d.value;
                                    n[v] >= 0 && (t = v)
                                }
                            } catch(e) {
                                l = !0,
                                f = e
                            } finally {
                                try { ! u && h.
                                    return && h.
                                    return ()
                                } finally {
                                    if (l) throw f
                                }
                            }
                            return t
                        } ([i(this.canvas, 1, parseInt(e.height)), t, i(this.canvas, parseInt(e.width), parseInt(e.height)), n])
                    } catch(t) {
                        console.log(t, e)
                    }
                }
            }], [{
                key: "listenImage",
                value: function(e, t) {
                    $(e).on("load", (function() {
                        t(this)
                    })).each((function(e, n) {
                        n.complete && t(this)
                    }))
                }
            }]),
            e
        } ()
    },
    73 : function(e, t, n) {
        "use strict";
        Object.defineProperty(t, "__esModule", {
            value: !0
        }),
        t.ShareMapCoreForGoogle = t.ShareMapCore = void 0;
        var r, o, i = function() {
            function e(e, t) {
                for (var n = 0; n < t.length; n++) {
                    var r = t[n];
                    r.enumerable = r.enumerable || !1,
                    r.configurable = !0,
                    "value" in r && (r.writable = !0),
                    Object.defineProperty(e, r.key, r)
                }
            }
            return function(t, n, r) {
                return n && e(t.prototype, n),
                r && e(t, r),
                t
            }
        } (),
        a = "function" == typeof Symbol && "symbol" == typeof Symbol.iterator ?
        function(e) {
            return typeof e
        }: function(e) {
            return e && "function" == typeof Symbol && e.constructor === Symbol && e !== Symbol.prototype ? "symbol": typeof e
        },
        s = (r = m(regeneratorRuntime.mark((function e() {
            var t, n = this;
            return regeneratorRuntime.wrap((function(e) {
                for (;;) switch (e.prev = e.next) {
                case 0:
                    return e.next = 2,
                    api.getShareMapContentUrl(this.options.hash);
                case 2:
                    return t = e.sent,
                    e.prev = 3,
                    e.next = 6,
                    (0, d.openXMindFile)(t.downloadUrl, document.querySelector("#content"), this.options.hash);
                case 6:
                    this.instance = e.sent,
                    e.next = 13;
                    break;
                case 9:
                    e.prev = 9,
                    e.t0 = e.
                    catch(3),
                    utils.toast.show("This file is encrypted.", 5e3),
                    console.log(e.t0);
                case 13:
                    this.zoomer = new u.ZoomSlider({
                        appendTo: ".share-map__zoom-control",
                        vertical: "horizontal" !== this.options.zoomSliderDirection,
                        initVal: 100,
                        max: 200,
                        min: 50,
                        callback: function(e, t) {
                            var n = e.value;
                            e.percentage,
                            t.text(Math.ceil(n) + "%"),
                            window._we_.zoom(n)
                        }
                    }),
                    new f.WatchFunction(this.instance.getZoomPencentage.bind(this), (function(e) {
                        n.zoomer && n.zoomer.updateByValue(e, !1)
                    }));
                case 15:
                case "end":
                    return e.stop()
                }
            }), e, this, [[3, 9]])
        }))),
        function() {
            return r.apply(this, arguments)
        }),
        c = (o = m(regeneratorRuntime.mark((function e() {
            var t = this;
            return regeneratorRuntime.wrap((function(e) {
                for (;;) switch (e.prev = e.next) {
                case 0:
                    return e.prev = 0,
                    e.next = 3,
                    (0, d.openXMindFile)(this.options.downloadUrl, document.querySelector("#content"), this.options.hash, this.options.accessToken);
                case 3:
                    this.instance = e.sent,
                    e.next = 11;
                    break;
                case 6:
                    return e.prev = 6,
                    e.t0 = e.
                    catch(0),
                    utils.toast.show("This file is encrypted.", 5e3),
                    this.els.loading.hide(),
                    e.abrupt("return");
                case 11:
                    this.zoomer = new u.ZoomSlider({
                        appendTo: ".share-map__zoom-control",
                        vertical: "horizontal" !== this.options.zoomSliderDirection,
                        initVal: 100,
                        max: 200,
                        min: 50,
                        callback: function(e, t) {
                            var n = e.value;
                            e.percentage,
                            t.text(Math.ceil(n) + "%"),
                            window._we_.zoom(n)
                        }
                    }),
                    new f.WatchFunction(this.instance.getZoomPencentage.bind(this), (function(e) {
                        t.zoomer && t.zoomer.updateByValue(e, !1)
                    }));
                case 13:
                case "end":
                    return e.stop()
                }
            }), e, this, [[0, 6]])
        }))),
        function() {
            return o.apply(this, arguments)
        }),
        u = n(74),
        l = n(36),
        f = n(34),
        d = n(76),
        h = n(75);
        function v(e, t) {
            if (! (e instanceof t)) throw new TypeError("Cannot call a class as a function")
        }
        function m(e) {
            return function() {
                var t = e.apply(this, arguments);
                return new Promise((function(e, n) {
                    return function r(o, i) {
                        try {
                            var a = t[o](i),
                            s = a.value
                        } catch(e) {
                            return void n(e)
                        }
                        if (!a.done) return Promise.resolve(s).then((function(e) {
                            r("next", e)
                        }), (function(e) {
                            r("throw", e)
                        }));
                        e(s)
                    } ("next")
                }))
            }
        }
        var p = {
            self: ".share-map",
            content: "#content",
            download: ".share-map__downloads, .share-map__btn-downloads",
            share: ".share-map__share-control",
            embedShare: {
                control: "#embed-share",
                textarea: ".share-map__embed textarea",
                self: ".share-map__embed",
                mask: ".share-map__menu-mask",
                close: ".share-map__embed-head span",
                copy: ".share-map__embed-copy"
            },
            menu: {
                self: ".share-map__menu",
                control: ".share-map__menu-control",
                mask: ".share-map__menu-mask"
            },
            outline: {
                wrapper: ".share-map__outline-wrapper",
                control: ".share-map__menu-outline-switcher",
                mask: ".share-map__outline-mask"
            },
            fb: "#facebook-share",
            tw: "#twitter-share",
            lk: "#linkedin-share",
            loading: ".share-map__loading",
            zoom: ".share-map__zoom-control"
        };
        function y(e) {
            var t = arguments.length > 1 && void 0 !== arguments[1] ? arguments[1] : "",
            n = !0,
            r = !1,
            o = void 0;
            try {
                for (var i, s = Object.keys(e)[Symbol.iterator](); ! (n = (i = s.next()).done); n = !0) {
                    var c = i.value;
                    "string" == typeof e[c] ? e[c] = $((t ? t + " ": "") + e[c]) : e[c] && "object" === a(e[c]) && y(e[c], t)
                }
            } catch(e) {
                r = !0,
                o = e
            } finally {
                try { ! n && s.
                    return && s.
                    return ()
                } finally {
                    if (r) throw o
                }
            }
        }
        function b(e) {
            var t = this;
            this.els.download.on("click", (function() {
                return (0, f.downloadMap)(t.options.hash)
            }));
            var n = encodeURI(window.location.href),
            r = encodeURIComponent($("title").text()),
            o = "width=600, height=400";
            this.els.fb.on("click", (function() {
                return window.open("https://www.facebook.com/sharer/sharer.php?u=" + n, "Share to Facebook", o)
            })),
            this.els.tw.on("click", (function() {
                return window.open("http://twitter.com/share?text=" + r + "&url=" + n + "&hashtags=XMind", "Share to Twitter", o)
            })),
            this.els.lk.on("click", (function() {
                return window.open("https://www.linkedin.com/shareArticle?mini=true&url=" + n + "&title=" + r, "Share to Linkedin", o)
            })),
            this.els.embedShare.control.on("click", (function() {
                return t.els.embedShare.self.show()
            })),
            this.els.embedShare.textarea.val("<iframe src='https://www.xmind.net/embed/" + this.options.hash + "/' width='750' height='540' frameborder='0' scrolling='no' allowfullscreen=\"true\"></iframe>"),
            this.els.embedShare.textarea.on("keydown", (function(e) {
                return e.preventDefault()
            })),
            this.els.embedShare.textarea.on("click", (function(e) {
                return e.preventDefault() & t.els.embedShare.textarea.select()
            })),
            this.els.embedShare.close.on("click", (function(e) {
                return t.els.embedShare.self.hide()
            })),
            this.els.embedShare.copy.on("click", (function() {
                t.els.embedShare.textarea.select(),
                document.execCommand("Copy"),
                utils.toast.show("Code Copied.")
            })),
            this.els.outline.mask.on("touchstart", (function() {
                return t.els.self.removeClass("menu-active outline-sm-active")
            })).on("click", (function() {
                return t.els.self.removeClass("menu-active outline-sm-active")
            })),
            this.els.menu.mask.on("touchstart", (function() {
                return t.els.self.removeClass("outline-sm-active menu-active")
            })).on("click", (function() {
                return t.els.self.removeClass("outline-sm-active menu-active")
            })),
            this.els.menu.control.on("click", (function() {
                return t.els.self.toggleClass("menu-active")
            })),
            this.els.outline.control.on("click", (function(e) {
                return t.els.self.toggleClass("outline-sm-active") & e.stopPropagation()
            })),
            new h.ElementGesture(this.els.content).on("zoom", (function(e) {
                var n = e.current,
                r = e.start;
                e.last,
                e.direction,
                e.startEvent,
                e.moveEvent,
                t.zoomer && t.zoomer.update(t.zoomer.percentage + .03 * (n - r))
            })),
            new h.ElementGesture(this.els.menu.self).on("swipe", (function(e) {
                var n = e.verticalDirection,
                r = e.verticalMoved;
                "up" === n && Math.abs(r) > 150 && (t.els.self.addClass("outline-sm-active"), t.isEmbed && t.els.self.addClass("menu-active"))
            })),
            new h.ElementGesture(this.els.outline.wrapper).on("swipe", (function(e) {
                var n = e.verticalDirection,
                r = e.verticalMoved;
                "down" === n && Math.abs(r) > 150 && 0 === $(".share-map__outline-wrapper").scrollTop() && (t.els.self.removeClass("outline-sm-active"), t.isEmbed && t.els.self.removeClass("menu-active"))
            }))
        }
        function g() {
            "iOS" === utils.getOS() && document.addEventListener("gesturestart", (function(e) {
                e.preventDefault()
            }))
        }
        function w() {
            var e = arguments.length > 0 && void 0 !== arguments[0] ? arguments[0] : "",
            t = new l.ImageColorPicker;
            l.ImageColorPicker.listenImage($(e + " .share-map__more-cell img:not(.corrected)"), (function(e) {
                var n = $(e);
                n.addClass("corrected"),
                n.parent().css({
                    "background-color": t.pickBackground(n[0])
                })
            }))
        }
        function _(e, t) {
            switch (e) {
            case "menu":
                this.els.self[t]("menu-active");
                break;
            case "outline":
                this.els.self[t]("outline-sm-active");
                break;
            default:
                this.els.self[t]("menu-active")
            }
        }
        t.ShareMapCore = function() {
            function e() {
                var t = this,
                n = arguments.length > 0 && void 0 !== arguments[0] ? arguments[0] : {},
                r = arguments.length > 1 && void 0 !== arguments[1] ? arguments[1] : {};
                v(this, e),
                this.options = r,
                this.els = Object.assign({},
                p, n),
                (0, f.execForElement)(".share-map__publish-data", f.reformatDate),
                (0, f.execForElement)(".share-map__views span.text", f.reformatAmount),
                (0, f.execForElement)(".share-map__downloads span.text", f.reformatAmount),
                g(),
                w(this.els.self),
                y.call(this, this.els, this.options.prefix),
                this.isEmbed = this.els.self.hasClass("embed"),
                b.call(this),
                s.call(this).then((function() {
                    return t.els.loading.hide()
                }))
            }
            return i(e, [{
                key: "open",
                value: function() {
                    var e = arguments.length > 0 && void 0 !== arguments[0] ? arguments[0] : "menu";
                    _.call(this, e, "addClass")
                }
            },
            {
                key: "close",
                value: function() {
                    var e = arguments.length > 0 && void 0 !== arguments[0] ? arguments[0] : "menu";
                    _.call(this, e, "removeClass")
                }
            },
            {
                key: "toggle",
                value: function() {
                    var e = arguments.length > 0 && void 0 !== arguments[0] ? arguments[0] : "menu";
                    _.call(this, e, "toggleClass")
                }
            }]),
            e
        } (),
        t.ShareMapCoreForGoogle = function() {
            function e() {
                var t = this,
                n = arguments.length > 0 && void 0 !== arguments[0] ? arguments[0] : {},
                r = arguments.length > 1 && void 0 !== arguments[1] ? arguments[1] : {};
                v(this, e),
                this.options = r,
                this.els = Object.assign({},
                p, n),
                (0, f.execForElement)(".share-map__publish-data", f.reformatDate),
                (0, f.execForElement)(".share-map__views span.text", f.reformatAmount),
                (0, f.execForElement)(".share-map__downloads span.text", f.reformatAmount),
                g(),
                w(this.els.self),
                y.call(this, this.els, this.options.prefix),
                this.isEmbed = this.els.self.hasClass("embed"),
                b.call(this),
                c.call(this).then((function() {
                    return t.els.loading.hide()
                }))
            }
            return i(e, [{
                key: "open",
                value: function() {
                    var e = arguments.length > 0 && void 0 !== arguments[0] ? arguments[0] : "menu";
                    _.call(this, e, "addClass")
                }
            },
            {
                key: "close",
                value: function() {
                    var e = arguments.length > 0 && void 0 !== arguments[0] ? arguments[0] : "menu";
                    _.call(this, e, "removeClass")
                }
            },
            {
                key: "toggle",
                value: function() {
                    var e = arguments.length > 0 && void 0 !== arguments[0] ? arguments[0] : "menu";
                    _.call(this, e, "toggleClass")
                }
            }]),
            e
        } ()
    },
    74 : function(e, t, n) {
        "use strict";
        Object.defineProperty(t, "__esModule", {
            value: !0
        });
        var r = function() {
            function e(e, t) {
                for (var n = 0; n < t.length; n++) {
                    var r = t[n];
                    r.enumerable = r.enumerable || !1,
                    r.configurable = !0,
                    "value" in r && (r.writable = !0),
                    Object.defineProperty(e, r.key, r)
                }
            }
            return function(t, n, r) {
                return n && e(t.prototype, n),
                r && e(t, r),
                t
            }
        } ();
        function o(e, t, n) {
            return e > n ? e = n: e < t && (e = t),
            e
        }
        var i = '\n<div class="zoom-slider">\n    <div class="zoom-head">\n        <span class="icon-plus"></span>\n    </div>\n    <div class="zoom-body">\n        <div class="zoom-body-indicate"></div>\n        <div class="zoom-slider">\n            <div class="zoom-progress-tips"></div>\n        </div>\n    </div>\n    <div class="zoom-footer">\n        <span class="icon-minus"></span>\n    </div>\n</div>\n';
        t.ZoomSlider = function() {
            function e() {
                var t = arguments.length > 0 && void 0 !== arguments[0] ? arguments[0] : {},
                n = t.vertical,
                r = void 0 !== n && n,
                o = t.initVal,
                a = void 0 === o ? 0 : o,
                s = t.max,
                c = void 0 === s ? 100 : s,
                u = t.min,
                l = void 0 === u ? 0 : u,
                f = t.callback,
                d = t.appendTo,
                h = void 0 === d ? "body": d; !
                function(e, t) {
                    if (! (e instanceof t)) throw new TypeError("Cannot call a class as a function")
                } (this, e),
                this.entity = $(i),
                this.middle = this.entity.find(".zoom-body"),
                this.bottom = this.entity.find(".zoom-footer"),
                this.slider = this.entity.find(".zoom-body > .zoom-slider"),
                this.tip = this.entity.find(".zoom-progress-tips"),
                $(h).append(this.entity),
                this.percentage = 0,
                this.px = 0,
                this.isVertical = r,
                this.max = c,
                this.min = l,
                this.isVertical ? this.sliderLength = this.middle.height() - this.slider.height() : (this.entity.addClass("horizontal"), this.sliderLength = this.middle.width() - this.slider.width()),
                this.percentageFactor = 1 / this.sliderLength * 100,
                this.key = {
                    screenOffset: this.isVertical ? "screenY": "screenX",
                    originalOffset: this.isVertical ? "bottom": "left",
                    offset: this.isVertical ? "offsetY": "offsetX"
                },
                this.callback = f,
                function() {
                    var e = this;
                    this.middle.on("click", (function(t) {
                        return e.updateByPx(e.sliderLength - t[[e.key.offset]])
                    }));
                    var t = this;
                    this.slider.on("touchstart", (function(n) {
                        n.preventDefault();
                        var r = n.touches[0][t.key.screenOffset],
                        o = parseInt(e.slider.css(e.key.originalOffset));
                        function i(e) {
                            e.preventDefault();
                            var n = r - e.touches[0][t.key.screenOffset];
                            t.isVertical ? t.updateByPx(o + n) : t.updateByPx(o - n)
                        }
                        e.entity.addClass("moving"),
                        $(window).on("touchmove", i),
                        $(window).on("touchend", (function e() {
                            $(window).off("touchmove", i),
                            $(window).off("touchstart", e),
                            t.entity.removeClass("moving")
                        }))
                    })),
                    this.slider.on("mousedown", (function(n) {
                        var r = n[t.key.screenOffset],
                        o = parseInt(e.slider.css(e.key.originalOffset));
                        function i(e) {
                            var n = r - e[t.key.screenOffset];
                            t.isVertical ? t.updateByPx(o + n) : t.updateByPx(o - n)
                        }
                        $(window).on("mousemove", i),
                        $(window).on("mouseup", (function e() {
                            $(window).off("mousemove", i),
                            $(window).off("mouseup", e),
                            t.entity.removeClass("moving"),
                            setTimeout((function() {
                                return t.middle.on("click", (function(e) {
                                    return t.updateByPx(t.sliderLength - e[t.key.offset])
                                }), 0)
                            }))
                        })),
                        e.middle.off("click"),
                        e.entity.addClass("moving")
                    }))
                }.call(this),
                this.updateByValue(a, !0)
            }
            return r(e, [{
                key: "update",
                value: function(e) {
                    var t, n, r = !(arguments.length > 1 && void 0 !== arguments[1]) || arguments[1];
                    e = o(e, 0, 100),
                    this.percentage = e,
                    this.updateByPx((t = e, n = this.percentageFactor, (t = o(t = parseFloat(t), 0, 100)) / n), r)
                }
            },
            {
                key: "updateByValue",
                value: function(e) {
                    var t = !(arguments.length > 1 && void 0 !== arguments[1]) || arguments[1];
                    this.update(100 * (1 - (this.max - e) / (this.max - this.min)), t)
                }
            },
            {
                key: "updateByPx",
                value: function(e) {
                    var t = !(arguments.length > 1 && void 0 !== arguments[1]) || arguments[1];
                    if (e = o(e, 0, this.sliderLength), this.slider.css(function(e, t, n) {
                        return t in e ? Object.defineProperty(e, t, {
                            value: n,
                            enumerable: !0,
                            configurable: !0,
                            writable: !0
                        }) : e[t] = n,
                        e
                    } ({},
                    this.key.originalOffset, e + "px")), t && this.callback) {
                        var n = function(e, t) {
                            return t * parseInt(e)
                        } (e, this.percentageFactor),
                        r = (this.max - this.min) * n / 100 + this.min;
                        this.callback({
                            value: r,
                            percentage: n
                        },
                        this.tip)
                    }
                }
            }]),
            e
        } ()
    },
    75 : function(e, t, n) {
        "use strict";
        Object.defineProperty(t, "__esModule", {
            value: !0
        });
        var r = function() {
            function e(e, t) {
                for (var n = 0; n < t.length; n++) {
                    var r = t[n];
                    r.enumerable = r.enumerable || !1,
                    r.configurable = !0,
                    "value" in r && (r.writable = !0),
                    Object.defineProperty(e, r.key, r)
                }
            }
            return function(t, n, r) {
                return n && e(t.prototype, n),
                r && e(t, r),
                t
            }
        } (),
        o = function(e, t) {
            var n = e.screenY,
            r = e.screenX,
            o = t.screenY,
            i = t.screenX;
            return Math.sqrt((n - o) * (n - o) + (r - i) * (r - i))
        },
        i = {
            zoom: {
                last: 0,
                direction: void 0
            },
            swipe: {
                last: 0,
                direction: void 0
            }
        },
        a = {
            zoom: function(e, t, n) {
                if (t && !(e.touches.length < 2)) {
                    var r = o(e.touches[0], e.touches[1]),
                    i = o(t.touches[0], t.touches[1]),
                    a = this._store.zoom.last.current,
                    s = {
                        direction: a - i > 0 ? "zoom-out": "zoom-in",
                        start: r,
                        current: i,
                        last: a,
                        startEvent: e,
                        moveEvent: t
                    };
                    delete s.last,
                    this._store.zoom.last = s,
                    this.callbacks.zoom.forEach((function(e) {
                        return e(s)
                    }))
                }
            },
            swipe: function(e, t, n) {
                if (! (e.touches.length > 1)) {
                    if (t && !n) return this._store.swipe.lastTouch = t;
                    if (this._store.swipe.lastTouch) {
                        n = this._store.swipe.lastTouch;
                        var r = o(e.touches[0], n.touches[0]),
                        i = e.touches[0].screenX - n.touches[0].screenX,
                        a = i > 0 ? "left": "right",
                        s = e.touches[0].screenY - n.touches[0].screenY,
                        c = {
                            distance: r,
                            horizonMoved: i,
                            verticalDirection: s > 0 ? "up": "down",
                            verticalMoved: s,
                            horizonDirection: a
                        };
                        this.callbacks.swipe.forEach((function(e) {
                            return e(c)
                        })),
                        this._store.swipe.lastTouch = void 0
                    }
                }
            }
        };
        t.ElementGesture = function() {
            function e(t) {
                var n = this; !
                function(e, t) {
                    if (! (e instanceof t)) throw new TypeError("Cannot call a class as a function")
                } (this, e),
                this.callbacks = {},
                Object.keys(a).forEach((function(e) {
                    return n.callbacks[e] = []
                })),
                this._store = Object.assign({},
                i),
                this.setElement(t)
            }
            return r(e, [{
                key: "on",
                value: function(e, t) {
                    return a.hasOwnProperty(e) && this.callbacks[e].push(t),
                    this
                }
            },
            {
                key: "off",
                value: function(e, t) {
                    var n = this;
                    if (Object.keys(a).includes(e)) if (e) if (t) {
                        var r = this.callbacks[e].indexOf(t);~r && this.callbacks[e].splice(r, 1)
                    } else this.callbacks[e] = [];
                    else this.callbacks = {},
                    Object.keys(a).forEach((function(e) {
                        return n.callbacks[e] = {}
                    }))
                }
            },
            {
                key: "setElement",
                value: function(e) {
                    this._element && this._element.off("touchstart"),
                    this._element = e;
                    var t = this;
                    $(e).on("touchstart", (function(e) {
                        function n(n) {
                            Object.values(a).forEach((function(r) {
                                return r.call(t, e, n, null)
                            }))
                        }
                        $(window).on("touchmove", n),
                        $(window).on("touchend", (function r(o) {
                            $(window).off("touchmove", n),
                            $(window).off("touchstart", r),
                            $(window).off("touchend", r),
                            Object.values(a).forEach((function(n) {
                                return n.call(t, e, null, o)
                            }))
                        }))
                    }))
                }
            }]),
            e
        } ()
    },
    76 : function(e, t, n) {
        "use strict";
        function r(e, t, n, r) {
            return new(n || (n = Promise))((function(o, i) {
                function a(e) {
                    try {
                        c(r.next(e))
                    } catch(e) {
                        i(e)
                    }
                }
                function s(e) {
                    try {
                        c(r.
                        throw (e))
                    } catch(e) {
                        i(e)
                    }
                }
                function c(e) {
                    e.done ? o(e.value) : new n((function(t) {
                        t(e.value)
                    })).then(a, s)
                }
                c((r = r.apply(e, t || [])).next())
            }))
        }
        n.r(t);
        var o = n(20),
        i = n.n(o);
        class a {
            constructor() {
                this.storage = void 0,
                this.fallbackCahced = {},
                this.waitUntilDbReady(),
                this.autoClean()
            }
            waitUntilDbReady() {
                return r(this, void 0, void 0, (function * () {
                    try {
                        yield i.a.ready()
                    } catch(e) {
                        return
                    }
                    this.storage = i.a.createInstance({
                        name: "Share-" + a.SHARE_STORAGE_VERSION,
                        driver: [i.a.INDEXEDDB, i.a.WEBSQL, i.a.LOCALSTORAGE]
                    })
                }))
            }
            setItem(e, t) {
                return r(this, void 0, void 0, (function * () {
                    yield this.waitUntilDbReady();
                    const n = () =>this.fallbackCahced[e] = t;
                    if (this.storage) try {
                        this.storage.setItem(e, t)
                    } catch(e) {
                        return n(),
                        void console.error("Error", e)
                    } else n()
                }))
            }
            getItem(e) {
                return r(this, void 0, void 0, (function * () {
                    return yield this.waitUntilDbReady(),
                    this.fallbackCahced[e] || this.storage && (yield this.storage.getItem(e))
                }))
            }
            removeItem(e) {
                return r(this, void 0, void 0, (function * () {
                    delete this.fallbackCahced[e],
                    yield this.waitUntilDbReady(),
                    this.storage && (yield this.storage.removeItem(e))
                }))
            }
            getRealItemKey(e) {
                return r(this, void 0, void 0, (function * () {
                    yield this.waitUntilDbReady();
                    let t = [];
                    return (this.storage ? yield this.storage.keys() : Object.keys(this.fallbackCahced)).find(t =>t.startsWith(e + "#"))
                }))
            }
            autoClean() {
                return r(this, void 0, void 0, (function * () {
                    if (yield this.waitUntilDbReady(), !this.storage) return;
                    const e = (yield this.storage.keys()).sort((e, t) =>e.split("#")[1] > t.split("#")[1] ? 1 : -1).slice(0, -1 * a.MAX_CACHE_AMOUNT);
                    for (const t of e) yield this.storage.removeItem(t)
                }))
            }
            getSharedMap(e) {
                return r(this, void 0, void 0, (function * () {
                    const t = yield this.getRealItemKey(e);
                    if (t) return yield this.getItem(t)
                }))
            }
            setSharedMap(e, t) {
                return r(this, void 0, void 0, (function * () {
                    const n = yield this.getRealItemKey(e);
                    n && (yield this.removeItem(n)),
                    yield this.setItem(e + "#" + Date.now(), t)
                }))
            }
            removeSharedMap(e) {
                return r(this, void 0, void 0, (function * () {
                    const t = yield this.getRealItemKey(e);
                    t && (yield this.removeItem(t))
                }))
            }
        }
        a.SHARE_STORAGE_VERSION = "1.0",
        a.MAX_CACHE_AMOUNT = 3,
        n.d(t, "openXMindFile", (function() {
            return l
        }));
        const s = new a,
        c = function(e, t) {
            return new Promise(n =>{
                if (document.querySelector("script#" + t)) return;
                const r = document.createElement("script");
                r.setAttribute("id", t),
                r.src = e,
                r.onload = n,
                document.body.appendChild(r)
            })
        },
        u = function(e, t, n = {}) {
            return r(this, void 0, void 0, (function * () {
                const r = yield window._SB_.createWorkbookEditor(t, e, Object.assign({
                    languageCode: "en-US",
                    resourceUrlPrefix: "https://assets.xmind.net/www/assets/",
                    password: ""
                },
                n));
                return window._we_ = r,
                setTimeout(() =>{
                    r.switchSheetTo(0)
                }),
                r
            }))
        };
        function l(e, t, n, o) {
            return r(this, void 0, void 0, (function * () {
                const[r] = yield Promise.all([s.getSharedMap(n).then(t =>t ||
                function(e, t) {
                    return new Promise(n =>{
                        const r = new XMLHttpRequest;
                        r.addEventListener("load", e =>{
                            n(r.response)
                        }),
                        r.addEventListener("error", e =>{
                            console.error(e),
                            n()
                        }),
                        r.addEventListener("abort", e =>{
                            console.error(e),
                            n()
                        }),
                        r.open("GET", e),
                        r.setRequestHeader("Cache-Control", "no-cache"),
                        t && r.setRequestHeader("Authorization", "Bearer " + t),
                        r.responseType = "arraybuffer",
                        r.send()
                    })
                } (e, o)), c(window.manifests.snowbrush, "snowbrush")]);
                if (r) return yield s.setSharedMap(n, r),
                yield u(t, r)
            }))
        }
    }
});