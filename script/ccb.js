// ==UserScript==
// @name         Custom CDN of Bilibili (CCB) - 修改哔哩哔哩的网页视频、直播、番剧的播放源
// @description  Custom CDN of Bilibili (CCB)
// @namespace    CCB
// @license      MIT
// @version      2.1.0
// @author       鼠鼠今天吃嘉然
// @run-at       document-start
// @match        https://www.bilibili.com/video/*
// @match        https://www.bilibili.com/bangumi/play/*
// @match        https://www.bilibili.com/cheese/play/*
// @match        https://www.bilibili.com/festival/*
// @match        https://www.bilibili.com/list/*
// @match        https://live.bilibili.com/*
// @match        https://www.bilibili.com/blackboard/*
// @match        https://player.bilibili.com/*
// @connect      kanda-akihito-kun.github.io
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        unsafeWindow
// ==/UserScript==

;(() => {
    const api = 'https://kanda-akihito-kun.github.io/ccb/api'
    const defaultCdnNode = '使用默认源'
    const manualRegionName = '手动输入'
    const mainHost = 'www.bilibili.com'
    const liveHost = 'live.bilibili.com'

    const oldCdnNodeStored = 'CCB'
    const oldRegionStored = 'region'
    const mainCdnNodeStored = 'CCB_main'
    const mainRegionStored = 'region_main'
    const diagnosticsCdnNodeStored = 'CCB_diagnostics'
    const diagnosticsRegionStored = 'region_diagnostics'
    const liveCdnNodeStored = 'CCB_live'
    const liveRegionStored = 'region_live'
    const powerModeStored = 'powerMode'
    const liveModeStored = 'liveMode'
    // 两份缓存分开存,避免多标签页同时写同一个键时互相覆盖
    const regionCacheStored = 'CCB_datacache_region'
    const cdnCacheStored = 'CCB_datacache_cdn'
    // 多标签页共用同一份统计,靠 frameId 分键和 60 秒新鲜度窗口限制串扰
    const statsStored = 'CCB_stats'

    const logger = ((...args) => {
        console.warn('[CCB]', ...args)
    })

    const UNSET = '__CCB_UNSET__'
    const normalizeRegion = (v) => {
        if (!v) return manualRegionName
        if (v === '编辑') return manualRegionName
        return v
    }
    const migrateStoredValues = () => {
        const oldNode = GM_getValue(oldCdnNodeStored, UNSET)
        const oldRegion = GM_getValue(oldRegionStored, UNSET)
        if (oldNode !== UNSET) {
            if (GM_getValue(mainCdnNodeStored, UNSET) === UNSET) GM_setValue(mainCdnNodeStored, oldNode)
            if (GM_getValue(diagnosticsCdnNodeStored, UNSET) === UNSET) GM_setValue(diagnosticsCdnNodeStored, oldNode)
            if (GM_getValue(liveCdnNodeStored, UNSET) === UNSET) GM_setValue(liveCdnNodeStored, oldNode)
        }
        if (oldRegion !== UNSET) {
            const normalized = normalizeRegion(oldRegion)
            if (GM_getValue(mainRegionStored, UNSET) === UNSET) GM_setValue(mainRegionStored, normalized)
            if (GM_getValue(diagnosticsRegionStored, UNSET) === UNSET) GM_setValue(diagnosticsRegionStored, normalized)
            if (GM_getValue(liveRegionStored, UNSET) === UNSET) GM_setValue(liveRegionStored, normalized)
        }
    }
    migrateStoredValues()

    const isLiveContext = () => location.host === liveHost
    const isDiagnosticsContext = () => location.host === mainHost && (location.pathname || '').startsWith('/blackboard/video-diagnostics.html')
    const getContextKey = () => {
        if (isLiveContext()) return 'live'
        if (isDiagnosticsContext()) return 'diagnostics'
        return 'main'
    }

    let ccbConfigCache = null
    let workerPreludeCache = null
    let workerPreludeContextKey = null

    const invalidateCcbCaches = () => {
        ccbConfigCache = null
        workerPreludeCache = null
        workerPreludeContextKey = null
    }
    // 别的标签页改设置不会通知本文档,切回本页或前进后退时丢弃缓存,下次取值重新读存储
    try {
        document.addEventListener('visibilitychange', invalidateCcbCaches)
        window.addEventListener('pageshow', invalidateCcbCaches)
    } catch (_) {}

    const getTargetCdnNode = (ctx) => {
        if (ctx === void 0) return getCcbConfig().node
        const stored = ctx === 'live' ? liveCdnNodeStored : (ctx === 'diagnostics' ? diagnosticsCdnNodeStored : mainCdnNodeStored)
        const value = GM_getValue(stored, UNSET)
        return value === UNSET ? GM_getValue(oldCdnNodeStored, defaultCdnNode) : value
    }
    const getRegion = (ctx) => {
        if (ctx === void 0) return getCcbConfig().region
        const stored = ctx === 'live' ? liveRegionStored : (ctx === 'diagnostics' ? diagnosticsRegionStored : mainRegionStored)
        const value = GM_getValue(stored, UNSET)
        return normalizeRegion(value === UNSET ? GM_getValue(oldRegionStored, manualRegionName) : value)
    }
    const setTargetCdnNode = (ctx, value) => {
        const result = GM_setValue(
            ctx === 'live' ? liveCdnNodeStored : (ctx === 'diagnostics' ? diagnosticsCdnNodeStored : mainCdnNodeStored),
            value,
        )
        invalidateCcbCaches()
        return result
    }
    const setRegion = (ctx, value) => {
        const result = GM_setValue(
            ctx === 'live' ? liveRegionStored : (ctx === 'diagnostics' ? diagnosticsRegionStored : mainRegionStored),
            value,
        )
        invalidateCcbCaches()
        return result
    }
    const getPowerMode = () => getCcbConfig().powerMode
    const getLiveMode = () => getCcbConfig().liveMode

    function getCcbConfig() {
        const contextKey = getContextKey()
        if (ccbConfigCache && ccbConfigCache.contextKey === contextKey) return ccbConfigCache

        const storedNode = getTargetCdnNode(contextKey)
        // 存储被写坏时退回默认源，避免后续字符串操作抛错
        const node = typeof storedNode === 'string' ? storedNode : defaultCdnNode
        const region = getRegion(contextKey)
        const powerMode = GM_getValue(powerModeStored, true)
        const liveMode = GM_getValue(liveModeStored, false)
        let replacement = node
        if (replacement.indexOf('://') === -1) replacement = 'https://' + replacement
        if (!replacement.endsWith('/')) replacement = replacement + '/'
        const replacementNoSlash = replacement.endsWith('/') ? replacement.slice(0, -1) : replacement
        let replacementHost
        try {
            replacementHost = new URL(replacement).host
        } catch (_) {
            replacementHost = ''
        }
        ccbConfigCache = { contextKey, node, region, powerMode, liveMode, replacement, replacementNoSlash, replacementHost }
        return ccbConfigCache
    }

    const isCcbEnabled = () => getCcbConfig().node !== defaultCdnNode
    const hasMediaDomain = (s) => typeof s === 'string' && (
        s.indexOf('bilivideo.') !== -1
        || s.indexOf('acgvideo.') !== -1
        || s.indexOf('edge.mountaintoys.cn') !== -1
        || s.indexOf('akamaized.net') !== -1
    )

    const isLiveRoomPage = () => {
        if (location.host !== liveHost) return false
        const p = location.pathname || '/'
        return /^\/\d+\/?$/.test(p) || /^\/blanc\/\d+\/?$/.test(p)
    }

    const shouldApplyReplacement = () => {
        const config = getCcbConfig()
        if (config.node === defaultCdnNode) return false
        if (location.host === liveHost) {
            if (!isLiveRoomPage()) return false
            if (!config.liveMode) return false
        }
        return true
    }

    const shouldInstallWorkerHooks = () => {
        if (!shouldApplyReplacement()) return false
        const host = location.host
        const pathname = location.pathname || '/'
        if (host === mainHost) {
            return pathname.startsWith('/bangumi/play/')
                || pathname.startsWith('/video/')
                || pathname.startsWith('/cheese/play/')
        }
        if (host === liveHost) return isLiveRoomPage()
        return false
    }

    const getReplacement = () => getCcbConfig().replacement

    const getReplacementNoSlash = () => getCcbConfig().replacementNoSlash

    const getReplacementHost = () => getCcbConfig().replacementHost

    const statsFreshMs = 60000
    const statsFlushMs = 2000
    const isTopFrame = window.top === window
    const ccbFrameId = Math.random().toString(36).slice(2)
    // 只统计页面框架内的改写,Worker 运行时内部的改写没有回传通道,不计入
    const ccbRewriteStats = { host: null, count: 0 }
    let statsFlushTimer = null

    // malformed 表示存储里是坏值,调用方负责把重置后的空对象写回
    const readStatsStore = () => {
        let store
        try {
            store = GM_getValue(statsStored, {})
            if (typeof store === 'string') store = JSON.parse(store)
        } catch (_) {
            return { store: {}, malformed: true }
        }
        if (!store || typeof store !== 'object' || Array.isArray(store)) return { store: {}, malformed: true }
        return { store, malformed: false }
    }

    // 删掉坏值、过期以及时间戳来自未来的条目,返回是否改动过 store
    const pruneStatsStore = (store, now) => {
        let pruned = false
        for (const key in store) {
            if (!Object.prototype.hasOwnProperty.call(store, key)) continue
            const entry = store[key]
            const ts = entry && typeof entry === 'object' ? entry.ts : NaN
            if (!Number.isFinite(ts) || now - ts > statsFreshMs || now - ts < 0) {
                delete store[key]
                pruned = true
            }
        }
        return pruned
    }

    const flushRewriteStats = () => {
        statsFlushTimer = null
        try {
            const now = Date.now()
            const { store } = readStatsStore()
            // 每次回写都顺手清理,否则关掉的框架会一直留在存储里
            pruneStatsStore(store, now)
            store[ccbFrameId] = { host: ccbRewriteStats.host, count: ccbRewriteStats.count, ts: now }
            GM_setValue(statsStored, store)
        } catch (_) {}
    }

    // 改写路径上只累加内存计数,写存储由一次性定时器合并
    const countRewrite = (before, after) => {
        if (after === before) return after
        ccbRewriteStats.count++
        ccbRewriteStats.host = getReplacementHost() || ccbRewriteStats.host
        if (!isTopFrame && !statsFlushTimer) statsFlushTimer = setTimeout(flushRewriteStats, statsFlushMs)
        return after
    }

    const readAggregateStats = () => {
        const now = Date.now()
        const { store, malformed } = readStatsStore()
        const pruned = pruneStatsStore(store, now) || malformed
        let count = ccbRewriteStats.count
        let freshestTs = 0
        let freshestHost = ''
        for (const key in store) {
            if (!Object.prototype.hasOwnProperty.call(store, key)) continue
            const entry = store[key]
            if (Number.isFinite(entry.count)) count += entry.count
            if (entry.ts >= freshestTs && typeof entry.host === 'string' && entry.host) {
                freshestTs = entry.ts
                freshestHost = entry.host
            }
        }
        if (pruned) {
            try { GM_setValue(statsStored, store) } catch (_) {}
        }
        return { count, host: ccbRewriteStats.host || freshestHost }
    }

    const IGNORE_HOST_RE = /^(?:bvc|data|pbp|api|api\w+)\./
    const HOST_EXTRACT_RE = /^(?:https?:)?\/\/([\w.-]+)|^([\w.-]+)(?:\/|$)/i
    function isIgnoredHost(s) {
        const m = HOST_EXTRACT_RE.exec(s)
        const host = m && (m[1] || m[2])
        return !!host && IGNORE_HOST_RE.test(host.toLowerCase())
    }

    const replaceMediaUrlCore = (s) => {
        let out = s
        if (s.startsWith('http://') || s.startsWith('https://')) out = s.replace(/^https?:\/\/.*?\//, getReplacement())
        else if (s.startsWith('//')) out = s.replace(/^\/\/.*?\//, getReplacement().replace(/^https?:/, ''))
        else if (/^[^/]+\//.test(s)) out = s.replace(/^[^/]+\//, `${getReplacementHost()}/`)
        return countRewrite(s, out)
    }

    const replaceMediaUrlUnchecked = (s) => {
        if (isIgnoredHost(s)) return s
        return replaceMediaUrlCore(s)
    }

    const replaceMediaUrl = (s) => {
        if (typeof s !== 'string') return s
        if (!shouldApplyReplacement()) return s
        if (!hasMediaDomain(s)) return s

        if (isIgnoredHost(s)) return s
        return replaceMediaUrlCore(s)
    }

    const replaceMediaHostValueCore = (s) => {
        let out = s
        if (s.startsWith('http://') || s.startsWith('https://')) out = getReplacementNoSlash()
        else if (s.startsWith('//')) out = getReplacementNoSlash().replace(/^https?:/, '')
        else if (/^[^/]+$/.test(s)) out = getReplacementHost()
        return countRewrite(s, out)
    }

    const replaceMediaHostValueUnchecked = (s) => {
        if (isIgnoredHost(s)) return s
        return replaceMediaHostValueCore(s)
    }

    const replaceMediaHostValue = (s) => {
        if (typeof s !== 'string') return s
        if (!shouldApplyReplacement()) return s
        if (!hasMediaDomain(s)) return s

        if (isIgnoredHost(s)) return s
        return replaceMediaHostValueCore(s)
    }

    const deepReplacePlayInfo = (obj) => {
        if (!obj || typeof obj !== 'object') return
        if (Array.isArray(obj)) {
            for (let i = 0; i < obj.length; i++) {
                const item = obj[i]
                if (typeof item === 'string') {
                    const out = hasMediaDomain(item) ? replaceMediaUrlUnchecked(item) : item
                    if (out !== item) obj[i] = out
                } else {
                    deepReplacePlayInfo(item)
                }
            }
            return
        }
        for (const k in obj) {
            if (!Object.prototype.hasOwnProperty.call(obj, k)) continue
            const v = obj[k]
            if (typeof v === 'string') {
                if (k === 'host') {
                    if (hasMediaDomain(v)) obj[k] = replaceMediaHostValueUnchecked(v)
                } else {
                    if (hasMediaDomain(v)) obj[k] = replaceMediaUrlUnchecked(v)
                }
            } else if (Array.isArray(v) && k === 'backup_url') {
                if (!getPowerMode()) continue
                for (let i = 0; i < v.length; i++) {
                    const s = v[i]
                    if (typeof s === 'string') {
                        if (hasMediaDomain(s)) v[i] = replaceMediaUrlUnchecked(s)
                    }
                    else deepReplacePlayInfo(s)
                }
            } else if (typeof v === 'object') {
                deepReplacePlayInfo(v)
            }
        }
    }

    const transformPlayUrlResponse = (playInfo) => {
        if (!shouldApplyReplacement()) return
        if (!playInfo || typeof playInfo !== 'object') return
        if (playInfo.code !== (void 0) && playInfo.code !== 0) return
        deepReplacePlayInfo(playInfo)
    }

    const transformLiveNeptune = (obj) => {
        if (!obj || typeof obj !== 'object') return
        if (!getReplacementHost()) return

        const playurl =
            (obj && obj.roomInitRes && obj.roomInitRes.data && obj.roomInitRes.data.playurl_info && obj.roomInitRes.data.playurl_info.playurl) ||
            (obj && obj.data && obj.data.playurl_info && obj.data.playurl_info.playurl) ||
            (obj && obj.result && obj.result.playurl_info && obj.result.playurl_info.playurl) ||
            (obj && obj.playurl_info && obj.playurl_info.playurl)
        if (!playurl || typeof playurl !== 'object') return

        const streams = playurl.stream
        if (!Array.isArray(streams)) return
        for (let si = 0; si < streams.length; si++) {
            const s = streams[si]
            const formats = s && s.format
            if (!Array.isArray(formats)) continue
            for (let fi = 0; fi < formats.length; fi++) {
                const f = formats[fi]
                const codecs = f && f.codec
                if (!Array.isArray(codecs)) continue
                for (let ci = 0; ci < codecs.length; ci++) {
                    const c = codecs[ci]
                    const infos = c && c.url_info
                    if (!Array.isArray(infos)) continue
                    for (let ii = 0; ii < infos.length; ii++) {
                        const info = infos[ii]
                        if (info && typeof info.host === 'string') info.host = replaceMediaHostValue(info.host)
                    }
                }
            }
        }
    }

    const replaceBilivideoInText = (text) => {
        if (!shouldApplyReplacement()) return text
        if (typeof text !== 'string') return text
        if (text.indexOf('bilivideo.') === -1
            && text.indexOf('acgvideo.') === -1
            && text.indexOf('edge.mountaintoys.cn') === -1
            && text.indexOf('akamaized.net') === -1
        ) return text
        const out = text.replace(/https?:\/\/[^"'\s]*?\.(?:(?:bilivideo|acgvideo)\.(?:com|cn)|edge\.mountaintoys\.cn|akamaized\.net)\//g, getReplacement())
        const host = getReplacementHost()
        if (!host) return out
        return out.replace(/\b[\w.-]+\.(?:(?:bilivideo|acgvideo)\.(?:com|cn)|edge\.mountaintoys\.cn|akamaized\.net)\b/g, host)
    }

    const installCcbWorkerRuntime = (cfg) => {
        const forceReplace = !!(cfg && cfg.forceReplace)
        const shouldApply = () => forceReplace
        const Replacement = (cfg && typeof cfg.replacement === 'string') ? cfg.replacement : ''
        const replacementHost = (cfg && typeof cfg.replacementHost === 'string') ? cfg.replacementHost : ''
        const getHost = () => replacementHost
        const IGNORE_HOST_RE = /^(?:bvc|data|pbp|api|api\w+)\./
        const HOST_EXTRACT_RE = /^(?:https?:)?\/\/([\w.-]+)|^([\w.-]+)(?:\/|$)/i
        function isIgnoredHost(s) {
            const m = HOST_EXTRACT_RE.exec(s)
            const host = m && (m[1] || m[2])
            return !!host && IGNORE_HOST_RE.test(host.toLowerCase())
        }
        const hasMedia = (s) => typeof s === 'string' && (
            s.indexOf('bilivideo.') !== -1
            || s.indexOf('acgvideo.') !== -1
            || s.indexOf('edge.mountaintoys.cn') !== -1
            || s.indexOf('akamaized.net') !== -1
        )

        const replaceUrl = (s) => {
            if (typeof s !== 'string') return s
            if (!shouldApply()) return s
            if (!hasMedia(s)) return s
            if (isIgnoredHost(s)) return s
            if (s.startsWith('http://') || s.startsWith('https://')) return s.replace(/^https?:\/\/.*?\//, Replacement)
            if (s.startsWith('//')) return s.replace(/^\/\/.*?\//, Replacement.replace(/^https?:/, ''))
            if (/^[^/]+\//.test(s)) return s.replace(/^[^/]+\//, `${getHost()}/`)
            return s
        }

        const Ofetch = self.fetch
        if (Ofetch) {
            self.fetch = (input, init) => {
                try {
                    const s = typeof input === 'string' ? input : (input && input.url)
                    if (typeof s === 'string') {
                        const r = replaceUrl(s)
                        if (r !== s) {
                            if (typeof input === 'string') input = r
                            else {
                                const Req = self.Request || Request
                                if (Req) input = new Req(r, input)
                            }
                        }
                    }
                } catch (_) {}
                return Ofetch(input, init)
            }
        }

        if (self.XMLHttpRequest) {
            const OX = self.XMLHttpRequest
            class X extends OX {
                open(...args) {
                    try {
                        if (typeof args[1] === 'string') args[1] = replaceUrl(args[1])
                    } catch (_) {}
                    return super.open(...args)
                }
            }
            self.XMLHttpRequest = X
        }
    }

    const buildWorkerPrelude = () => {
        const contextKey = getContextKey()
        if (workerPreludeCache && workerPreludeContextKey === contextKey) return workerPreludeCache

        const cfg = {
            forceReplace: shouldApplyReplacement(),
            replacement: getReplacement(),
            replacementHost: getReplacementHost(),
        }
        const runtime = `(${installCcbWorkerRuntime.toString()})(${JSON.stringify(cfg)});`
        workerPreludeContextKey = contextKey
        workerPreludeCache = `(() => {\n` +
            `  if (self.__CCB_WORKER_PRELUDE__) return;\n` +
            `  self.__CCB_WORKER_PRELUDE__ = true;\n` +
            `  try { ${runtime} } catch (_) {}\n` +
            `})();\n`
        return workerPreludeCache
    }

    const xhrMemoUnset = {}

    const interceptNetResponse = (theWindow => {
        const interceptors = []
        const register = (handler) => interceptors.push(handler)

        const handle = (response, url, meta) => interceptors.reduce((modified, h) => {
            const ret = h(modified, url, meta)
            return ret ? ret : modified
        }, response)

        const hookWindow = (w) => {
            try {
                if (!w || !w.XMLHttpRequest || !w.fetch) return false
                const hooked = w.__CCB_NET_HOOKED__
                if (hooked && hooked.xhr === w.XMLHttpRequest && hooked.fetch === w.fetch) return true

                const OX = w.XMLHttpRequest
                class XHR extends OX {
                    open(...args) {
                        this._ccbIntercept = false
                        this._ccbResponseMemo = xhrMemoUnset
                        this._ccbResponseTextMemo = xhrMemoUnset
                        try {
                            if (typeof args[1] === 'string') args[1] = replaceMediaUrl(args[1])
                            this._ccbIntercept = !!handle(null, args[1], { type: 'xhr', xhr: this })
                        } catch (_) {}
                        return super.open(...args)
                    }
                    get responseText() {
                        if (!this._ccbIntercept || this.readyState !== this.DONE) return super.responseText
                        if (this._ccbResponseTextMemo !== xhrMemoUnset) return this._ccbResponseTextMemo
                        const value = handle(super.responseText, this.responseURL, { type: 'xhr', xhr: this })
                        this._ccbResponseTextMemo = value
                        return value
                    }
                    get response() {
                        if (!this._ccbIntercept || this.readyState !== this.DONE) return super.response
                        // responseType 为 '' 或 'text' 时 response 就是 responseText,复用同一份缓存避免重复处理
                        const rt = this.responseType
                        if (rt === '' || rt === 'text') return this.responseText
                        if (this._ccbResponseMemo !== xhrMemoUnset) return this._ccbResponseMemo
                        const value = handle(super.response, this.responseURL, { type: 'xhr', xhr: this })
                        this._ccbResponseMemo = value
                        return value
                    }
                }
                w.XMLHttpRequest = XHR

                const Ofetch = w.fetch
                w.fetch = (input, init) => {
                    const s0 = typeof input === 'string' ? input : (input && input.url)
                    if (typeof s0 === 'string') {
                        const r = replaceMediaUrl(s0)
                        if (r !== s0) {
                            if (typeof input === 'string') input = r
                            else input = new (w.Request || Request)(r, input)
                        }
                    }

                    const s = typeof input === 'string' ? input : (input && input.url)
                    const shouldIntercept = handle(null, s, { type: 'fetch', input, init })
                    if (!shouldIntercept) return Ofetch(input, init)
                    return Ofetch(input, init).then(resp => {
                        // 老引擎没有 Response.body 属性,不能把"属性缺失"当成"空响应体"
                        if (('body' in resp && !resp.body) || resp.status === 204 || resp.status === 205 || resp.status === 304) return resp
                        return resp.text().then(text => {
                            let out = text
                            try {
                                out = handle(text, s, { type: 'fetch', input, init, response: resp })
                            } catch (e) {
                                logger('处理响应失败:', e)
                            }
                            // 重建响应会让原来的 content-length 失真,url/redirected 也会丢失,尽量补回
                            let headers = resp.headers
                            try { headers = new (w.Headers || Headers)(resp.headers); headers.delete('content-length') } catch (_) {}
                            const next = new (w.Response || Response)(out, { status: resp.status, statusText: resp.statusText, headers })
                            try {
                                Object.defineProperty(next, 'url', { value: resp.url, configurable: true })
                                Object.defineProperty(next, 'redirected', { value: resp.redirected, configurable: true })
                            } catch (_) {}
                            return next
                        })
                    })
                }

                try {
                    const bHooked = w.__CCB_BLOB_HOOKED__
                    if (w.Blob && (!bHooked || bHooked !== w.Blob)) {
                        const OBlob = w.Blob
                        w.Blob = function (parts, options) {
                            if (!shouldInstallWorkerHooks()) return new OBlob(parts, options)
                            const type = options && options.type ? String(options.type) : ''
                            const looksJs = /javascript/i.test(type)
                                || (Array.isArray(parts) && parts.some(p => typeof p === 'string' && /importScripts|WorkerGlobalScope|bili/i.test(p)))
                            if (looksJs) {
                                const injected = [buildWorkerPrelude(), ...(Array.isArray(parts) ? parts : [parts])]
                                return new OBlob(injected, options)
                            }

                            return new OBlob(parts, options)
                        }
                        w.__CCB_BLOB_HOOKED__ = w.Blob
                    }
                } catch (_) {}

                try {
                    const wHooked = w.__CCB_WORKER_WRAPPED__
                    if (w.Worker && (!wHooked || wHooked !== w.Worker)) {
                        const OWorker = w.Worker
                        w.Worker = function (scriptURL, options) {
                            try {
                                if (!shouldInstallWorkerHooks()) return new OWorker(scriptURL, options)
                                const raw = (typeof scriptURL === 'string') ? scriptURL : String(scriptURL)
                                if (raw.startsWith('blob:') || raw.startsWith('data:')) return new OWorker(scriptURL, options)
                                const isModule = options && options.type === 'module'
                                const wrapperCode = isModule
                                    ? `${buildWorkerPrelude()}\nimport ${JSON.stringify(raw)};\n`
                                    : `${buildWorkerPrelude()}\nimportScripts(${JSON.stringify(raw)});\n`
                                const blob = new w.Blob([wrapperCode], { type: 'application/javascript' })
                                const url = w.URL.createObjectURL(blob)
                                return new OWorker(url, options)
                            } catch (_) {
                                return new OWorker(scriptURL, options)
                            }
                        }
                        w.__CCB_WORKER_WRAPPED__ = w.Worker
                    }
                } catch (_) {}

                w.__CCB_NET_HOOKED__ = { xhr: w.XMLHttpRequest, fetch: w.fetch }
                return true
            } catch (_) {
                return false
            }
        }

        hookWindow(theWindow)
        register._hookWindow = hookWindow
        return register
    })(unsafeWindow)

    const PLAYURL_PATH_RE = /(?:\/x\/player\/wbi\/playurl|\/x\/player\/playurl|\/pgc\/player\/web\/playurl|\/pgc\/player\/web\/v2\/playurl|\/pgc\/player\/api\/playurl|\/pugv\/player\/web\/playurl|\/ogv\/player\/playview)/

    interceptNetResponse((response, url) => {
        if (!isCcbEnabled()) return
        const u = typeof url === 'string' ? url : (url && url.url) || String(url)
        if (!PLAYURL_PATH_RE.test(u)) return
        if (response === null) return true

        try {
            if (typeof response === 'string') {
                const obj = JSON.parse(response)
                transformPlayUrlResponse(obj)
                return JSON.stringify(obj)
            }
            if (response && typeof response === 'object') {
                transformPlayUrlResponse(response)
                return response
            }
        } catch (e) {
            logger('处理 playurl 失败:', e)
        }
    })

    interceptNetResponse((response, url) => {
        if (!isCcbEnabled()) return
        const config = getCcbConfig()
        if (!config.liveMode) return
        const raw = typeof url === 'string' ? url : (url && url.url) || ''
        let u
        try { u = new URL(raw || String(url), location.href) } catch (_) { return }
        const p = u.pathname || ''
        if (!(/\/xlive\/web-room\/v\d+\/index\/getRoomPlayInfo\/?$/.test(p) || /\/room\/v1\/Room\/playUrl\/?$/.test(p))) return
        if (response === null) return true
        if (!isLiveRoomPage()) return
        try {
            const obj = typeof response === 'string' ? JSON.parse(response) : response
            transformLiveNeptune(obj)
            return (typeof response === 'string') ? JSON.stringify(obj) : obj
        } catch (e) {
            logger('处理直播 playurl 失败:', e)
        }
    })

    interceptNetResponse((response, url) => {
        if (!isCcbEnabled()) return
        const config = getCcbConfig()
        if (!config.liveMode) return
        const u = typeof url === 'string' ? url : (url && url.url) || String(url)
        if (!u.includes('/xlive/play-gateway/master/url')) return
        if (response === null) return true
        return replaceBilivideoInText(response)
    })

    const installLiveBootstrapHooks = () => {
        if (!getLiveMode() || !isLiveRoomPage() || !isCcbEnabled()) return
        const seen = new WeakSet()
        const tryRewrite = (obj) => {
            if (!obj || typeof obj !== 'object') return
            if (seen.has(obj)) return
            seen.add(obj)
            transformLiveNeptune(obj)
        }
        try {
            const propName = '__NEPTUNE_IS_MY_WAIFU__'
            let internal = unsafeWindow[propName]
            if (internal && typeof internal === 'object') tryRewrite(internal)
            Object.defineProperty(unsafeWindow, propName, {
                configurable: true,
                get: () => internal,
                set: (v) => {
                    internal = v
                    if (v && typeof v === 'object') tryRewrite(v)
                }
            })
        } catch (e) {
            logger('直播首播 Hook 安装失败:', String(e))
        }
    }

    installLiveBootstrapHooks()

    const watchGlobal = (name, handler) => {
        try {
            if (unsafeWindow[name] && typeof unsafeWindow[name] === 'object') handler(unsafeWindow[name])
            let internal = unsafeWindow[name]
            Object.defineProperty(unsafeWindow, name, {
                configurable: true,
                get: () => internal,
                set: (v) => {
                    internal = v
                    if (v && typeof v === 'object') handler(v)
                }
            })
        } catch (_) {}
    }

    watchGlobal('__playinfo__', (obj) => {
        if (!isCcbEnabled()) return
        try { transformPlayUrlResponse(obj) } catch (_) {}
    })
    watchGlobal('__INITIAL_STATE__', (obj) => {
        if (!isCcbEnabled()) return
        try { transformPlayUrlResponse(obj) } catch (_) {}
    })

    const createButton = (text, primary, second) => {
        const btn = document.createElement('button')
        btn.textContent = text
        btn.style.cssText = [
            'border:0',
            'border-radius:8px',
            'padding:8px 10px',
            'cursor:pointer',
            'color:#fff',
            `background:${primary ? '#2b74ff' : (second ? '#1bc543ff' : '#444')}`,
        ].join(';')
        return btn
    }

    let regionList = [manualRegionName]
    let cdnDataCache = null

    // CDN 数据必须是 { 地区: 节点数组 },任一地区值不是数组就整体作废
    const isCdnData = (data) => !!data
        && typeof data === 'object'
        && !Array.isArray(data)
        && Object.values(data).every(Array.isArray)

    const readStoredEntry = (key, isData) => {
        let entry
        try {
            entry = GM_getValue(key, null)
            if (typeof entry === 'string') entry = JSON.parse(entry)
        } catch (_) {
            return null
        }
        const ok = entry
            && typeof entry === 'object'
            && !Array.isArray(entry)
            && Number.isFinite(entry.fetchedAt)
            && isData(entry.data)
        return ok ? entry : null
    }

    const getStoredDataCache = () => ({
        region: readStoredEntry(regionCacheStored, data => Array.isArray(data) && data.every(v => typeof v === 'string')),
        cdn: readStoredEntry(cdnCacheStored, isCdnData),
    })

    const getRegionOptions = (regions) => [manualRegionName, ...regions.filter(v => v && v !== manualRegionName && v !== '编辑')]

    const loadDataCache = () => {
        const dataCache = getStoredDataCache()
        regionList = dataCache.region ? getRegionOptions(dataCache.region.data) : [manualRegionName]
        cdnDataCache = dataCache.cdn ? dataCache.cdn.data : null
        return dataCache
    }

    const storeRegionData = (data) => {
        GM_setValue(regionCacheStored, { data, fetchedAt: Date.now() })
    }

    const storeCdnData = (data) => {
        GM_setValue(cdnCacheStored, { data, fetchedAt: Date.now() })
    }

    const requestText = (url) => new Promise((resolve, reject) => {
        const fetchFallback = () => fetch(url).then(r => r.text()).then(resolve, reject)
        try {
            if (typeof GM_xmlhttpRequest === 'function') {
                GM_xmlhttpRequest({
                    method: 'GET',
                    url,
                    onload: (res) => {
                        const ok = res && typeof res.status === 'number' ? (res.status >= 200 && res.status < 300) : true
                        if (!ok) fetchFallback()
                        else resolve(res.responseText || '')
                    },
                    onerror: fetchFallback,
                    ontimeout: fetchFallback,
                })
                return
            }
        } catch (_) {}
        fetchFallback()
    })

    const requestJson = async (url) => JSON.parse(await requestText(url))

    const appendOption = (parent, value) => {
        const opt = document.createElement('option')
        opt.value = value
        opt.textContent = value
        parent.appendChild(opt)
    }

    // 优先恢复已保存的选择,其次沿用当前选中项,都不在列表里时显式回落,不依赖浏览器的隐式首项
    const applySelectValue = (selectEl, values, preferred, current, fallback) => {
        if (!values.length) return
        if (values.includes(preferred)) selectEl.value = preferred
        else if (values.includes(current)) selectEl.value = current
        else selectEl.value = values.includes(fallback) ? fallback : values[0]
    }

    const renderRegionOptions = (selectEl, regions, preferred) => {
        const current = selectEl.value
        selectEl.textContent = ''
        for (const v of regions) appendOption(selectEl, v)
        applySelectValue(selectEl, regions, preferred, current)
    }

    const CDN_NODE_RE = /^cn-([a-z0-9]+)-([a-z0-9]+)-/
    // 只有这三个是运营商缩写,其余 token 原样展示
    const ispLabelMap = { cm: '移动', ct: '电信', cu: '联通' }

    // 仅用于下拉框展示分组,不改变节点列表本身
    const groupCdnNodes = (list) => {
        const groups = []
        const byLabel = new Map()
        const ungrouped = []
        for (const node of list) {
            const m = typeof node === 'string' ? CDN_NODE_RE.exec(node) : null
            if (!m) {
                ungrouped.push(node)
                continue
            }
            const label = `${m[1]} · ${ispLabelMap[m[2]] || m[2]}`
            let group = byLabel.get(label)
            if (!group) {
                group = { label, nodes: [] }
                byLabel.set(label, group)
                groups.push(group)
            }
            group.nodes.push(node)
        }
        // 未分组项含列表首项(使用默认源)时置顶,否则置尾
        if (ungrouped.length) {
            const bucket = { label: null, nodes: ungrouped }
            if (ungrouped[0] === list[0]) groups.unshift(bucket)
            else groups.push(bucket)
        }
        return groups
    }

    const renderNodeOptions = (selectEl, nodes, preferred) => {
        const current = selectEl.value
        selectEl.textContent = ''
        for (const group of groupCdnNodes(nodes)) {
            if (!group.label) {
                for (const v of group.nodes) appendOption(selectEl, v)
                continue
            }
            const optgroup = document.createElement('optgroup')
            optgroup.label = group.label
            for (const v of group.nodes) appendOption(optgroup, v)
            selectEl.appendChild(optgroup)
        }
        applySelectValue(selectEl, nodes, preferred, current, defaultCdnNode)
    }

    // onSuccess 放在 try 外,避免重绘异常被当成请求失败吞掉
    const getRegionList = async (onSuccess) => {
        let ok = false
        try {
            const data = await requestJson(`${api}/region.json`)
            if (!Array.isArray(data)) return
            const regions = data.filter(v => typeof v === 'string')
            regionList = getRegionOptions(regions)
            storeRegionData(regions)
            ok = true
        } catch (_) {}
        if (ok && onSuccess) onSuccess()
    }

    const getCdnData = async (onSuccess) => {
        let ok = false
        try {
            const data = await requestJson(`${api}/cdn.json`)
            if (!isCdnData(data)) throw new TypeError('无效 CDN 数据')
            cdnDataCache = data
            storeCdnData(data)
            ok = true
        } catch (_) {
            if (!cdnDataCache) cdnDataCache = {}
        }
        if (ok && onSuccess) onSuccess()
    }

    const getCdnListByRegion = (region) => {
        if (region === manualRegionName || region === '编辑') return [defaultCdnNode]
        const data = cdnDataCache || {}
        const regionData = Array.isArray(data[region]) ? data[region].filter(v => typeof v === 'string') : []
        return [defaultCdnNode, ...regionData]
    }

    // 首次打开需要等待网络,期间再次触发菜单会重复插入面板,用标记挡住并发调用
    let panelOpening = false
    // 请求可能一直不回调,等待设上限,超时后先渲染,迟到的响应仍由后台重绘补上
    const panelDataWaitMs = 8000

    const openPanel = async () => {
        const existing = document.querySelector('#ccb-settings-panel')
        if (existing) {
            existing.remove()
            return
        }
        if (panelOpening) return
        panelOpening = true

        let root = null
        const panelControls = []
        try {
            const dataCache = loadDataCache()
            const isPanelOpen = () => root && root.isConnected
            const rerenderRegions = () => {
                if (!isPanelOpen()) return
                for (const controls of panelControls) controls.renderRegions()
            }
            const rerenderNodes = () => {
                if (!isPanelOpen()) return
                for (const controls of panelControls) controls.renderNodes()
            }
            const regionRequest = getRegionList(rerenderRegions)
            const cdnRequest = getCdnData(rerenderNodes)
            // 只等待本地没有存档的资源,已有存档的先渲染再后台刷新
            const pending = []
            if (!dataCache.region) pending.push(regionRequest)
            if (!dataCache.cdn) pending.push(cdnRequest)
            if (pending.length) await Promise.race([
                Promise.all(pending),
                new Promise(resolve => setTimeout(resolve, panelDataWaitMs)),
            ])
        } finally {
            panelOpening = false
        }

        root = document.createElement('div')
        root.id = 'ccb-settings-panel'
        root.style.cssText = [
            'position:fixed',
            'z-index:2147483647',
            'right:18px',
            'top:18px',
            'width:360px',
            'max-width:calc(100vw - 36px)',
            'max-height:calc(100vh - 36px)',
            'overflow:auto',
            'background:rgba(20,20,20,.96)',
            'border:1px solid #333',
            'border-radius:10px',
            'box-shadow:0 8px 24px rgba(0,0,0,.35)',
            'color:#fff',
            'font-size:12px',
            'font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,"PingFang SC","Microsoft YaHei",sans-serif',
        ].join(';')

        const header = document.createElement('div')
        header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 12px;border-bottom:1px solid #2f2f2f'
        const title = document.createElement('div')
        title.textContent = 'CCB 设置'
        title.style.cssText = 'font-weight:700;font-size:13px'
        const closeBtn = createButton('关闭', false, false)
        closeBtn.addEventListener('click', () => { try { root.remove() } catch (_) {} })
        header.appendChild(title)
        header.appendChild(closeBtn)
        root.appendChild(header)

        const body = document.createElement('div')
        body.style.cssText = 'padding:12px'
        root.appendChild(body)

        const mkRow = (labelText) => {
            const row = document.createElement('div')
            row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:10px;margin:10px 0'
            const label = document.createElement('div')
            label.textContent = labelText
            label.style.cssText = 'color:#bbb'
            row.appendChild(label)
            return { row, label }
        }

        const mkSectionTitle = (text) => {
            const t = document.createElement('div')
            t.textContent = text
            t.style.cssText = 'font-weight:700;font-size:12px;margin:2px 0 8px;color:#e5e5e5'
            return t
        }

        const mkSectionBox = () => {
            const box = document.createElement('div')
            box.style.cssText = 'border:1px solid #2f2f2f;border-radius:10px;padding:10px;margin:10px 0;background:rgba(0,0,0,.12)'
            return box
        }

        const mkSelect = (options, value, renderOptions) => {
            const sel = document.createElement('select')
            sel.style.cssText = 'flex:1;background:#111;color:#fff;border:1px solid #333;border-radius:8px;padding:8px'
            renderOptions(sel, options, value)
            return sel
        }

        const mkInput = (value) => {
            const inp = document.createElement('input')
            inp.type = 'text'
            inp.placeholder = '输入节点域名或URL'
            inp.style.cssText = 'flex:1;background:#111;color:#fff;border:1px solid #333;border-radius:8px;padding:8px;outline:none'
            inp.value = value || ''
            return inp
        }

        const mountRegionAndNode = (ctx, hostBox) => {
            const region = getRegion(ctx)
            let nodeValue = getTargetCdnNode(ctx)
            let nodeSelect = null
            let nodeInput = null

            const { row: regionRow } = mkRow('地区')
            const regionSelect = mkSelect(regionList, region, renderRegionOptions)
            regionRow.appendChild(regionSelect)
            hostBox.appendChild(regionRow)

            const { row: nodeRow } = mkRow('节点')
            hostBox.appendChild(nodeRow)

            const clearRowControl = () => {
                if (nodeSelect) nodeValue = nodeSelect.value
                while (nodeRow.childNodes.length > 1) nodeRow.removeChild(nodeRow.lastChild)
                nodeSelect = null
                nodeInput = null
            }

            // 已保存的节点不在列表里时补进选项,保证显示与存储一致(不写入存储)
            const withStoredNode = (list, stored) => (stored && typeof stored === 'string' && !list.includes(stored))
                ? [...list, stored]
                : list

            // persist 仅在用户操作时为 true,后台刷新重绘不写入存储
            const renderNodeControl = (regionValue, persist) => {
                const stored = getTargetCdnNode(ctx)
                if (regionValue === manualRegionName) {
                    if (nodeInput) return
                    clearRowControl()
                    const inp = mkInput(stored === defaultCdnNode ? '' : stored)
                    nodeInput = inp
                    nodeRow.appendChild(inp)
                    inp.addEventListener('input', () => {
                        const v = inp.value.trim()
                        nodeValue = v ? v : defaultCdnNode
                        setTargetCdnNode(ctx, nodeValue)
                    })
                    return
                }

                const list = getCdnListByRegion(regionValue)
                // 用户切换地区时按列表回落并写入,其余场景只如实展示已保存的节点
                const options = persist ? list : withStoredNode(list, stored)
                if (nodeSelect) {
                    renderNodeOptions(nodeSelect, options, stored)
                    nodeValue = nodeSelect.value
                    if (persist) setTargetCdnNode(ctx, nodeValue)
                    return
                }
                clearRowControl()
                const sel = mkSelect(options, options.includes(stored) ? stored : defaultCdnNode, renderNodeOptions)
                nodeSelect = sel
                nodeValue = sel.value
                nodeRow.appendChild(sel)
                sel.addEventListener('change', () => {
                    nodeValue = sel.value
                    setTargetCdnNode(ctx, nodeValue)
                })
                if (persist) setTargetCdnNode(ctx, nodeValue)
            }

            renderNodeControl(regionSelect.value, false)
            regionSelect.addEventListener('change', () => {
                const next = regionSelect.value
                setRegion(ctx, next)
                renderNodeControl(next, true)
            })
            panelControls.push({
                renderRegions: () => {
                    renderRegionOptions(regionSelect, regionList, getRegion(ctx))
                    renderNodeControl(regionSelect.value, false)
                },
                renderNodes: () => { renderNodeControl(regionSelect.value, false) },
            })
        }

        const stats = readAggregateStats()
        const statsLine = document.createElement('div')
        statsLine.style.cssText = 'color:#9c9;margin:0 0 8px'
        statsLine.textContent = stats.host
            ? `已改写 ${stats.count} 个媒体请求 → ${stats.host}`
            : `已改写 ${stats.count} 个媒体请求`
        body.appendChild(statsLine)

        const mainBox = mkSectionBox()
        mainBox.appendChild(mkSectionTitle('视频 | 课堂 | 番剧(需特殊设置)'))
        body.appendChild(mainBox)
        mountRegionAndNode('main', mainBox)

        const liveBox = mkSectionBox()
        liveBox.appendChild(mkSectionTitle('直播'))
        body.appendChild(liveBox)
        mountRegionAndNode('live', liveBox)

        const diagnosticsBox = mkSectionBox()
        diagnosticsBox.appendChild(mkSectionTitle('测速'))
        body.appendChild(diagnosticsBox)
        mountRegionAndNode('diagnostics', diagnosticsBox)

        const actions = document.createElement('div')
        actions.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;margin-top:12px'
        const powerBtn = createButton(getPowerMode() ? '强力替换模式：ON' : '强力替换模式：OFF', true, false)
        powerBtn.addEventListener('click', () => {
            const next = !getPowerMode()
            GM_setValue(powerModeStored, next)
            invalidateCcbCaches()
            powerBtn.textContent = next ? '强力替换模式：ON' : '强力替换模式：OFF'
        })
        const liveBtn = createButton(getLiveMode() ? '适用直播和番剧：ON' : '适用直播和番剧：OFF', true, false)
        liveBtn.addEventListener('click', () => {
            const next = !getLiveMode()
            GM_setValue(liveModeStored, next)
            invalidateCcbCaches()
            liveBtn.textContent = next ? '适用直播和番剧：ON' : '适用直播和番剧：OFF'
        })
        const applyBtn = createButton('应用并刷新', false, true)
        applyBtn.addEventListener('click', () => { location.reload() })
        actions.appendChild(powerBtn)
        actions.appendChild(liveBtn)
        actions.appendChild(applyBtn)
        body.appendChild(actions)

        document.documentElement.appendChild(root)
    }

    if (window.top === window) {
        const stripNodeSuffix = (s) => String(s).replace(/(?:\.bilivideo\.(?:com|cn)|\.edge\.mountaintoys\.cn)$/i, '')
        const mainNodeName = stripNodeSuffix(getTargetCdnNode('main'))
        const diagnosticsNodeName = stripNodeSuffix(getTargetCdnNode('diagnostics'))
        const liveNodeName = stripNodeSuffix(getTargetCdnNode('live'))
        GM_registerMenuCommand(`📺CCB (${mainNodeName} | ${liveNodeName} | ${diagnosticsNodeName})`, () => { openPanel() })
        GM_registerMenuCommand('阅读文档 | 建议反馈 | 版本回退', () => { window.open('https://github.com/Kanda-Akihito-Kun/ccb') })
    }

    logger('CCB 加载完成', { host: location.host, path: location.pathname })
})()
