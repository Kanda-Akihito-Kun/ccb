// ==UserScript==
// @name         Custom CDN of Bilibili (CCB) - 修改哔哩哔哩的网页视频、直播、番剧的播放源
// @namespace    CCB
// @license      MIT
// @version      1.1.8
// @description  修改哔哩哔哩的视频播放源 - 部署于 GitHub Action 版本
// @author       鼠鼠今天吃嘉然
// @run-at       document-start
// @match        https://www.bilibili.com/video/*
// @match        https://www.bilibili.com/bangumi/play/*
// @match        https://www.bilibili.com/festival/*
// @match        https://www.bilibili.com/list/*
// @match        https://live.bilibili.com/*
// @match        https://www.bilibili.com/blackboard/video-diagnostics.html*
// @match        https://www.bilibili.com/blackboard/*
// @match        https://player.bilibili.com/*
// @match        https://i.hdslb.com/bfs/seed/jinkela/short/colis/iframe.html*
// @connect      https://kanda-akihito-kun.github.io/ccb/api/
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        unsafeWindow
// ==/UserScript==

// ==========================
// 基础配置 / 日志 / 存储键
// ==========================
const api = 'https://kanda-akihito-kun.github.io/ccb/api'

// 日志输出函数
const PluginName = 'CCB'
const Logger = (() => {
    const prefix = `【${PluginName}】`
    const fmt = (level, args) => [`${prefix}【${level}】`, ...args]
    return {
        info: (...args) => console.log(...fmt('信息', args)),
        warn: (...args) => console.warn(...fmt('警告', args)),
        error: (...args) => console.error(...fmt('错误', args)),
    }
})()

const log = Logger.info
const warn = Logger.warn
const error = Logger.error

const defaultCdnNode = '使用默认源'
var cdnNodeStored = 'CCB'
var regionStored = 'region'
var powerModeStored = 'powerMode'
var liveModeStored = 'liveMode'

// 获取当前节点名称
const getCurCdnNode = () => {
    return GM_getValue(cdnNodeStored, cdnList[0])
}

// 获取强力模式状态
const getPowerMode = () => {
    return GM_getValue(powerModeStored, true)
}

// 获取直播模式状态
const getLiveMode = () => {
    return GM_getValue(liveModeStored, true)
}

// 初始默认 CDN 列表
const initCdnList = [
    'upos-sz-mirroraliov.bilivideo.com',
    'upos-sz-mirroralib.bilivideo.com',
    'upos-sz-estgcos.bilivideo.com',
]

// CDN 列表
var cdnList = [
    defaultCdnNode,
    ...initCdnList
]

// 要是选择了 defaultCdnNode 就不要生效改节点
const isCcbEnabled = () => {
    return getCurCdnNode() !== defaultCdnNode
}

// ==========================
// URL 替换（生成目标 Replacement）
// ==========================
// 替换播放源
const Replacement = (() => {
    const toURL = ((url) => {
        if (url.indexOf('://') === -1) url = 'https://' + url
        return url.endsWith('/') ? url : `${url}/`
    })

    let domain = getCurCdnNode()
    if (domain !== defaultCdnNode) log('已启用播放源:', domain)

    return toURL(domain)
})()

const ReplacementNoSlash = Replacement && Replacement.endsWith('/') ? Replacement.slice(0, -1) : Replacement

const getReplacementHost = () => {
    try {
        return new URL(Replacement).host
    } catch (_) {
        return ''
    }
}

try {
    unsafeWindow.__CCB_INJECTED__ = true
} catch (_) {}

const MEDIA_HOST_LIKE_RE = /\.(?:bilivideo|acgvideo)\.com(?:\/|$)/
const IGNORE_HOST_RE = /^(?:bvc|data|pbp|api|api\w+)\./

const MEDIA_URL_ORIGIN_HTTP_RE = /^https?:\/\/.*?\//
const MEDIA_URL_ORIGIN_PROTO_REL_RE = /^\/\/.*?\//
const MEDIA_HOST_PREFIX_RE = /^[\w.-]+\.(?:bilivideo|acgvideo)\.com\//
const MEDIA_HOST_EXACT_RE = /^[\w.-]+\.(?:bilivideo|acgvideo)\.com$/
const MEDIA_URL_IN_HTML_RE = /https?:\/\/[^"'\s]*?\.(?:bilivideo|acgvideo)\.com\//g
const MEDIA_HOST_IN_HTML_RE = /\b[\w.-]+\.(?:bilivideo|acgvideo)\.com\b/g

const buildWorkerPrelude = () => {
    return `(() => {\n` +
        `  if (self.__CCB_WORKER_PRELUDE__) return;\n` +
        `  self.__CCB_WORKER_PRELUDE__ = true;\n` +
        `  const Replacement = ${JSON.stringify(Replacement)};\n` +
        `  const ReplacementNoSlash = (typeof Replacement === 'string' && Replacement.endsWith('/')) ? Replacement.slice(0, -1) : Replacement;\n` +
        `  const MEDIA_HOST_LIKE_RE = ${MEDIA_HOST_LIKE_RE};\n` +
        `  const IGNORE_HOST_RE = ${IGNORE_HOST_RE};\n` +
        `  const MEDIA_URL_ORIGIN_HTTP_RE = ${MEDIA_URL_ORIGIN_HTTP_RE};\n` +
        `  const MEDIA_URL_ORIGIN_PROTO_REL_RE = ${MEDIA_URL_ORIGIN_PROTO_REL_RE};\n` +
        `  const MEDIA_HOST_PREFIX_RE = ${MEDIA_HOST_PREFIX_RE};\n` +
        `  const MEDIA_HOST_EXACT_RE = ${MEDIA_HOST_EXACT_RE};\n` +
        `  const getReplacementHost = ${getReplacementHost.toString()};\n` +
        `  const replaceMediaUrl = ${replaceMediaUrl.toString()};\n` +
        `  const replaceMediaHostValue = ${replaceMediaHostValue.toString()};\n` +
        `  const deepReplace = (obj) => {\n` +
        `    if (!obj || typeof obj !== 'object') return;\n` +
        `    if (Array.isArray(obj)) {\n` +
        `      for (let i = 0; i < obj.length; i++) {\n` +
        `        const item = obj[i];\n` +
        `        if (typeof item === 'string') {\n` +
        `          let out = item;\n` +
        `          if (MEDIA_HOST_EXACT_RE.test(item)) out = replaceMediaHostValue(item);\n` +
        `          else if (MEDIA_HOST_LIKE_RE.test(item)) out = replaceMediaUrl(item);\n` +
        `          if (out !== item) obj[i] = out;\n` +
        `        } else {\n` +
        `          deepReplace(item);\n` +
        `        }\n` +
        `      }\n` +
        `      return;\n` +
        `    }\n` +
        `    for (const k in obj) {\n` +
        `      if (!Object.prototype.hasOwnProperty.call(obj, k)) continue;\n` +
        `      const v = obj[k];\n` +
        `      if (typeof v === 'string') {\n` +
        `        let out = v;\n` +
        `        if (k === 'host' || MEDIA_HOST_EXACT_RE.test(v)) out = replaceMediaHostValue(v);\n` +
        `        else if (k === 'base_url' || k === 'url' || MEDIA_HOST_LIKE_RE.test(v)) out = replaceMediaUrl(v);\n` +
        `        if (out !== v) obj[k] = out;\n` +
        `      } else if (Array.isArray(v) && k === 'backup_url') {\n` +
        `        for (let i = 0; i < v.length; i++) {\n` +
        `          const s = v[i];\n` +
        `          if (typeof s === 'string') {\n` +
        `            let out = s;\n` +
        `            if (MEDIA_HOST_EXACT_RE.test(s)) out = replaceMediaHostValue(s);\n` +
        `            else if (MEDIA_HOST_LIKE_RE.test(s)) out = replaceMediaUrl(s);\n` +
        `            if (out !== s) v[i] = out;\n` +
        `          } else {\n` +
        `            deepReplace(s);\n` +
        `          }\n` +
        `        }\n` +
        `      } else if (typeof v === 'object') {\n` +
        `        deepReplace(v);\n` +
        `      }\n` +
        `    }\n` +
        `  };\n` +
        `  try {\n` +
        `    try {\n` +
        `      const Oparse = JSON.parse;\n` +
        `      if (Oparse && !Oparse.__ccbWrapped) {\n` +
        `        const wrapped = function (text, reviver) {\n` +
        `          const isStr = typeof text === 'string';\n` +
        `          let looksPlay = false;\n` +
        `          if (isStr) {\n` +
        `            const hasMediaHost = text.indexOf('bilivideo.com') !== -1 || text.indexOf('acgvideo.com') !== -1;\n` +
        `            const hasPlayKeys = text.indexOf('\"base_url\"') !== -1 || text.indexOf('\"backup_url\"') !== -1 || text.indexOf('\"dash\"') !== -1 || text.indexOf('\"durl\"') !== -1;\n` +
        `            looksPlay = hasMediaHost && hasPlayKeys;\n` +
        `          }\n` +
        `          const obj = Oparse.call(this, text, reviver);\n` +
        `          if (looksPlay && obj && typeof obj === 'object') {\n` +
        `            try { deepReplace(obj); } catch (_) {}\n` +
        `          }\n` +
        `          return obj;\n` +
        `        };\n` +
        `        wrapped.__ccbWrapped = true;\n` +
        `        JSON.parse = wrapped;\n` +
        `      }\n` +
        `    } catch (_) {}\n` +
        `    const Ofetch = self.fetch;\n` +
        `    if (Ofetch) {\n` +
        `      self.fetch = (input, init) => {\n` +
        `        try {\n` +
        `          const s = typeof input === 'string' ? input : (input && input.url);\n` +
        `          if (typeof s === 'string') {\n` +
        `            const r = replaceMediaUrl(s);\n` +
        `            if (r !== s) input = typeof input === 'string' ? r : new Request(r, input);\n` +
        `          }\n` +
        `        } catch (_) {}\n` +
        `        return Ofetch(input, init);\n` +
        `      };\n` +
        `    }\n` +
        `    if (self.XMLHttpRequest) {\n` +
        `      const OX = self.XMLHttpRequest;\n` +
        `      class X extends OX { open(m,u,a,usr,pwd){\n` +
        `        try { if (typeof u === 'string') u = replaceMediaUrl(u); } catch(_){}\n` +
        `        return super.open(m,u,a,usr,pwd); } }\n` +
        `      self.XMLHttpRequest = X;\n` +
        `    }\n` +
        `  } catch (_) {}\n` +
        `})();\n`
}

const replaceMediaUrl = (s) => {
    if (typeof s !== 'string') return s
    if (!MEDIA_HOST_LIKE_RE.test(s)) return s

    // 检查是否是需要忽略的子域
    const ignoreRe = (typeof IGNORE_HOST_RE !== 'undefined' && IGNORE_HOST_RE) ? IGNORE_HOST_RE : null
    try {
        const u = new URL(s.startsWith('//') ? `https:${s}` : s)
        if (ignoreRe && ignoreRe.test(u.hostname)) return s
    } catch (_) {
        // 尝试从字符串中提取 hostname
        const m = s.match(/^https?:\/\/([\w.-]+)/) || s.match(/^\/\/([\w.-]+)/)
        if (m && ignoreRe && ignoreRe.test(m[1])) return s
    }

    if (s.startsWith('https://') || s.startsWith('http://')) return s.replace(MEDIA_URL_ORIGIN_HTTP_RE, Replacement)
    if (s.startsWith('//')) return s.replace(MEDIA_URL_ORIGIN_PROTO_REL_RE, Replacement.replace(/^https?:/, ''))
    if (MEDIA_HOST_PREFIX_RE.test(s)) return s.replace(/^[^/]+\//, `${getReplacementHost()}/`)
    return s
}

const replaceMediaHostValue = (s) => {
    if (typeof s !== 'string') return s
    if (!MEDIA_HOST_LIKE_RE.test(s)) return s
    const host = getReplacementHost()
    if (s.startsWith('https://') || s.startsWith('http://')) return ReplacementNoSlash
    if (s.startsWith('//')) return ReplacementNoSlash.replace(/^https?:/, '')
    if (MEDIA_HOST_EXACT_RE.test(s)) return host
    return s
}

// ==========================
// 远端数据（地区 / CDN 列表）
// ==========================
// 地区列表
var regionList = ['编辑']

const getRegionList = async () => {
    try {
        const response = await fetch(`${api}/region.json`);
        const data = await response.json();
        // 直接使用 JSON 数据
        regionList = ["编辑", ...data];
    } catch (error) {
        warn('获取地区列表失败:', error)
    }
}

const getCdnListByRegion = async (region) => {
    try {
        if (region === '编辑') {
            cdnList = [defaultCdnNode, ...initCdnList];
            return;
        }

        const response = await fetch(`${api}/cdn.json`);
        const data = await response.json();

        // 从完整的 CDN 数据中获取指定地区的数据
        const regionData = data[region] || [];
        cdnList = [defaultCdnNode, ...regionData];

        // 更新 CDN 选择器
        const cdnSelect = document.querySelector('#ccb-cdn-select') || document.querySelector('.bpx-player-ctrl-setting-checkbox select:last-child');
        if (cdnSelect) {
            cdnSelect.innerHTML = cdnList.map(cdn =>
                `<option value="${cdn}"${cdn === GM_getValue(cdnNodeStored, cdnList[0]) ? ' selected' : ''}>${cdn}</option>`
            ).join('');
        }
    } catch (error) {
        warn('获取 CDN 列表失败:', error)
    }
}

// ==========================
// 播放信息改写（视频 / 番剧）
// ==========================
const playInfoTransformer = (playInfo) => {
    if (!playInfo || typeof playInfo !== 'object') return

    // 定义递归遍历替换函数，解决层级深、字段名不确定的问题（如番剧的 segment_base/backup_url）
    // 之前硬编码字段名容易漏掉，比如用户反馈的番剧页结构
    const deepReplace = (obj) => {
        if (!obj || typeof obj !== 'object') return
        if (Array.isArray(obj)) {
            for (let i = 0; i < obj.length; i++) {
                const item = obj[i]
                if (typeof item === 'string') {
                    let out = item
                    if (MEDIA_HOST_EXACT_RE.test(item)) out = replaceMediaHostValue(item)
                    else if (MEDIA_HOST_LIKE_RE.test(item)) out = replaceMediaUrl(item)
                    if (out !== item) obj[i] = out
                } else {
                    deepReplace(item)
                }
            }
            return
        }
        for (const k in obj) {
            if (Object.prototype.hasOwnProperty.call(obj, k)) {
                const v = obj[k]
                if (typeof v === 'string') {
                    let out = v
                    if (k === 'host' || MEDIA_HOST_EXACT_RE.test(v)) out = replaceMediaHostValue(v)
                    else if (k === 'base_url' || k === 'url' || MEDIA_HOST_LIKE_RE.test(v)) out = replaceMediaUrl(v)
                    if (out !== v) obj[k] = out
                } else if (Array.isArray(v) && k === 'backup_url') {
                    for (let i = 0; i < v.length; i++) {
                        const s = v[i]
                        if (typeof s === 'string') {
                            let out = s
                            if (MEDIA_HOST_EXACT_RE.test(s)) out = replaceMediaHostValue(s)
                            else if (MEDIA_HOST_LIKE_RE.test(s)) out = replaceMediaUrl(s)
                            if (out !== s) v[i] = out
                        } else {
                            deepReplace(s)
                        }
                    }
                } else if (typeof v === 'object') {
                    deepReplace(v)
                }
            }
        }
    }

    if (playInfo.code !== (void 0) && playInfo.code !== 0) {
        warn('获取播放信息失败:', playInfo.message)
        return
    }

    // 直接对整个 playInfo 进行深度递归替换
    // 这样无论 B 站接口怎么变（video_info/dash/durl/segment_base...），只要有 URL 就会被替换
    try {
        deepReplace(playInfo)
    } catch (err) {
        error('改写播放信息异常:', err)
    }
}

// ==========================
// 播放信息改写（直播）
// ==========================
const livePlayInfoTransformer = (playInfo) => {
    if (!playInfo || typeof playInfo !== 'object') return
    if (playInfo.code !== (void 0) && playInfo.code !== 0) {
        warn('获取直播播放信息失败:', playInfo.message)
        return
    }

    if (!getReplacementHost()) {
        warn('直播播放信息改写跳过：播放源格式异常', { Replacement })
        return
    }

    let replaced = 0
    let sampleBefore
    let sampleAfter
    const walk = (node) => {
        if (!node) return
        if (Array.isArray(node)) {
            node.forEach(walk)
            return
        }
        if (typeof node !== 'object') return

        for (const [k, v] of Object.entries(node)) {
            if (typeof v === 'string') {
                const out = (k === 'host') ? replaceMediaHostValue(v) : replaceMediaUrl(v)
                if (out !== v) {
                    replaced++
                    if (sampleBefore === undefined) {
                        sampleBefore = v
                        sampleAfter = out
                    }
                }
                node[k] = out
            } else {
                walk(v)
            }
        }
    }

    walk(playInfo.data || playInfo.result || playInfo)
}

// ==========================
// 页面类型判断（直播间）
// ==========================
const isLiveRoomPage = () => {
    try {
        if (location.host !== 'live.bilibili.com') return false
        const p = location.pathname || '/'
        const ok = /^\/\d+\/?$/.test(p) || /^\/blanc\/\d+\/?$/.test(p)
        return ok
    } catch (e) {
        return false
    }
}

// ==========================
// HTML 字符串兜底替换（番剧页 / M3U8）
// ==========================
// 将番剧页 HTML 或 M3U8 文本中的 bilivideo 节点域名替换为当前选择的 CDN
const replaceBilivideoInText = (text) => {
    if (!isCcbEnabled()) return text
    try {
        if (typeof text !== 'string') return text
        let out = text.replace(MEDIA_URL_IN_HTML_RE, Replacement)
        const host = getReplacementHost()
        if (host) out = out.replace(MEDIA_HOST_IN_HTML_RE, host)
        return out
    } catch (e) {
        warn('替换文本(HTML/M3U8)失败:', e)
        return text
    }
}

// ==========================
// 网络拦截层（XHR / fetch）
// ==========================
// Network Request Interceptor
const interceptNetResponse = (theWindow => {
    const interceptors = []
    const interceptNetResponse = (handler) => interceptors.push(handler)

    // when response === null && url is String, it's checking if the url is handleable
    const handleInterceptedResponse = (response, url, meta) => interceptors.reduce((modified, handler) => {
        const ret = handler(modified, url, meta)
        return ret ? ret : modified
    }, response)

    const hookNetInWindow = (w) => {
        try {
            if (!w || !w.XMLHttpRequest || !w.fetch) return false
            const hooked = w.__CCB_NET_HOOKED__
            if (hooked && hooked.xhr === w.XMLHttpRequest && hooked.fetch === w.fetch) return true
            w.__CCB_INJECTED__ = true

            const OriginalXMLHttpRequest = w.XMLHttpRequest
            class XMLHttpRequest extends OriginalXMLHttpRequest {
                open(method, url, async, user, password) {
                    try {
                        if (isCcbEnabled() && typeof url === 'string') {
                            url = replaceMediaUrl(url)
                        }
                    } catch (_) {}
                    return super.open(method, url, async, user, password)
                }
                get responseText() {
                    if (this.readyState !== this.DONE) return super.responseText
                    return handleInterceptedResponse(super.responseText, this.responseURL, { type: 'xhr', xhr: this })
                }
                get response() {
                    if (this.readyState !== this.DONE) return super.response
                    return handleInterceptedResponse(super.response, this.responseURL, { type: 'xhr', xhr: this })
                }
            }
            w.XMLHttpRequest = XMLHttpRequest

            const OriginalFetch = w.fetch
            w.fetch = (input, init) => {
                try {
                    if (isCcbEnabled()) {
                        const s0 = typeof input === 'string' ? input : (input && input.url)
                        if (typeof s0 === 'string') {
                            const r = replaceMediaUrl(s0)
                            if (r !== s0) {
                                if (typeof input === 'string') input = r
                                else {
                                    const Req = w.Request || Request
                                    input = new Req(r, input)
                                }
                            }
                        }
                    }
                } catch (_) {}

                const s = typeof input === 'string' ? input : (input && input.url)
                let resolvedUrl = s
                try { resolvedUrl = new URL(s, w.location && w.location.href ? w.location.href : location.href).href } catch (_) {}

                const shouldIntercept = handleInterceptedResponse(null, resolvedUrl, { type: 'fetch', input, init })
                if (!shouldIntercept) return OriginalFetch(input, init)
                return OriginalFetch(input, init).then(response =>
                    new Promise((resolve) => response.text()
                        .then(text => {
                            const out = handleInterceptedResponse(text, resolvedUrl, { type: 'fetch', input, init, response })
                            const Resp = w.Response || Response
                            resolve(new Resp(out, {
                                status: response.status,
                                statusText: response.statusText,
                                headers: response.headers
                            }))
                        })
                    )
                )
            }

            try {
                const bHooked = w.__CCB_BLOB_HOOKED__
                if (w.Blob && (!bHooked || bHooked !== w.Blob)) {
                    const OriginalBlob = w.Blob
                    w.Blob = function (parts, options) {
                        try {
                            const type = options && options.type ? String(options.type) : ''
                            const looksJs = /javascript/i.test(type)
                                || (Array.isArray(parts) && parts.some(p => typeof p === 'string' && /importScripts|WorkerGlobalScope|bili/i.test(p)))
                            if (looksJs && isCcbEnabled()) {
                                const prelude = buildWorkerPrelude()
                                const injected = [prelude, ...(Array.isArray(parts) ? parts : [parts])]
                                return new OriginalBlob(injected, options)
                            }
                        } catch (_) {}
                        return new OriginalBlob(parts, options)
                    }
                    w.__CCB_BLOB_HOOKED__ = w.Blob
                }
            } catch (_) {}

            try {
                const wHooked = w.__CCB_WORKER_WRAPPED__
                if (w.Worker && (!wHooked || wHooked !== w.Worker)) {
                    const OriginalWorker = w.Worker
                    w.Worker = function (scriptURL, options) {
                        try {
                            if (!isCcbEnabled()) return new OriginalWorker(scriptURL, options)
                            const rawUrl = (typeof scriptURL === 'string') ? scriptURL : String(scriptURL)
                            if (rawUrl.startsWith('blob:') || rawUrl.startsWith('data:')) {
                                return new OriginalWorker(scriptURL, options)
                            }
                            const isModule = options && options.type === 'module'
                            const prelude = buildWorkerPrelude()
                            const wrapperCode = isModule
                                ? `${prelude}\nimport ${JSON.stringify(rawUrl)};\n`
                                : `${prelude}\nimportScripts(${JSON.stringify(rawUrl)});\n`
                            const blob = new w.Blob([wrapperCode], { type: 'application/javascript' })
                            const url = w.URL.createObjectURL(blob)
                            return new OriginalWorker(url, options)
                        } catch (_) {
                            return new OriginalWorker(scriptURL, options)
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

    hookNetInWindow(theWindow)

    interceptNetResponse._hookWindow = hookNetInWindow
    return interceptNetResponse
})(unsafeWindow)

try {
    if (window.top === window && location.host === 'www.bilibili.com') {
        const hooked = new WeakSet()
        const check = () => {
            const frames = Array.from(document.querySelectorAll('iframe'))
            if (!frames.length) return

            for (const f of frames) {
                try {
                    const w = f.contentWindow
                    if (!w) continue
                    if (w.__CCB_INJECTED__) continue
                    if (interceptNetResponse && interceptNetResponse._hookWindow && interceptNetResponse._hookWindow(w)) {
                        if (!hooked.has(w)) {
                            hooked.add(w)
                        }
                    }
                } catch (_) {
                }
            }
        }
        const timer = setInterval(check, 500)
        setTimeout(() => clearInterval(timer), 9000)
    }
} catch (_) {}

try {
    const reInit = () => {
        try {
            if (interceptNetResponse && interceptNetResponse._hookWindow) interceptNetResponse._hookWindow(unsafeWindow)
        } catch (_) {}
        try {
            if (isCcbEnabled()) {
                if (unsafeWindow.__playinfo__) playInfoTransformer(unsafeWindow.__playinfo__)
                if (unsafeWindow.__INITIAL_STATE__) playInfoTransformer(unsafeWindow.__INITIAL_STATE__)
            }
        } catch (_) {}
    }

    const bustCrossOriginPlayerIframe = () => {
        try {
            if (window.top !== window) return
            if (location.host !== 'www.bilibili.com') return
            if (!isCcbEnabled()) return
            window.__CCB_BUSTED_IFRAMES__ = window.__CCB_BUSTED_IFRAMES__ || new WeakMap()
            const busted = window.__CCB_BUSTED_IFRAMES__
            const frames = Array.from(document.querySelectorAll('iframe[src]'))
            for (const f of frames) {
                if (!f || typeof f.getAttribute !== 'function') continue
                const src = f.getAttribute('src') || ''
                if (!src) continue
                if (!/^(?:https?:)?\/\/(?:[\w-]+\.)*hdslb\.com\/bfs\/seed\/jinkela\/short\/colis\/iframe\.html/i.test(src)) continue
                try {
                    const u = new URL(src, location.href)
                    if (u.searchParams.get('__ccbcb') === '1') {
                        if (busted) busted.set(f, u.toString())
                        continue
                    }
                    if (busted) {
                        const last = busted.get(f)
                        if (typeof last === 'string' && last === u.toString()) continue
                    }
                    u.searchParams.set('__ccbcb', '1')
                    u.searchParams.set('__ccbts', String(Date.now()))
                    f.setAttribute('src', u.toString())
                    if (busted) busted.set(f, u.toString())
                } catch (_) {}
            }
        } catch (_) {}
    }

    window.addEventListener('pageshow', (e) => {
        try {
            if (e && e.persisted) {
                bustCrossOriginPlayerIframe()
                reInit()
            }
        } catch (_) {}
    }, true)

    try {
        if (document && 'prerendering' in document && document.prerendering) {
            document.addEventListener('prerenderingchange', () => {
                try {
                    if (!document.prerendering) {
                        bustCrossOriginPlayerIframe()
                        reInit()
                    }
                } catch (_) {}
            }, true)
        }
    } catch (_) {}

    try {
        if (window.top === window && location.host === 'www.bilibili.com') {
            const fireNav = () => {
                try {
                    bustCrossOriginPlayerIframe()
                    reInit()
                } catch (_) {}
            }

            const startObserver = () => {
                try {
                    if (window.__CCB_IFRAME_MO__) return true
                    const root = document && document.documentElement
                    if (!root) return false
                    const mo = new MutationObserver(() => {
                        bustCrossOriginPlayerIframe()
                    })
                    mo.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] })
                    window.__CCB_IFRAME_MO__ = mo
                    setTimeout(() => { try { mo.disconnect() } catch (_) {} }, 60000)
                    return true
                } catch (_) {
                    return false
                }
            }

            const ensureInit = () => {
                try { startObserver() } catch (_) {}
                try { fireNav() } catch (_) {}
            }

            ensureInit()
            setTimeout(ensureInit, 0)
            setTimeout(ensureInit, 1200)
            try {
                if (!window.__CCB_READY_BOUND__) {
                    window.__CCB_READY_BOUND__ = true
                    document.addEventListener('DOMContentLoaded', ensureInit, true)
                    window.addEventListener('load', ensureInit, true)
                }
            } catch (_) {}
            const wrapHistory = (name) => {
                const original = history && history[name]
                if (!original || original.__ccbWrapped) return
                const wrapped = function () {
                    const ret = original.apply(this, arguments)
                    try { setTimeout(fireNav, 0) } catch (_) {}
                    return ret
                }
                wrapped.__ccbWrapped = true
                history[name] = wrapped
            }
            wrapHistory('pushState')
            wrapHistory('replaceState')
            window.addEventListener('popstate', () => { fireNav() }, true)
            window.addEventListener('hashchange', () => { fireNav() }, true)
            document.addEventListener('visibilitychange', () => {
                try {
                    if (!document.hidden) fireNav()
                } catch (_) {}
            }, true)

            const rehookUntil = Date.now() + 45000
            const rehookTimer = setInterval(() => {
                try {
                    if (Date.now() > rehookUntil) return clearInterval(rehookTimer)
                    fireNav()
                } catch (_) {}
            }, 1200)
        }
    } catch (_) {}
} catch (_) {}

// ==========================
// DOM 工具（等待元素 / HTML 转节点）
// ==========================
const waitForElm = (selectors) => new Promise(resolve => {
    const findElement = () => {
        const selArray = Array.isArray(selectors) ? selectors : [selectors];
        for (const s of selArray) {
            const ele = document.querySelector(s);
            if (ele) return ele;
        }
        return null;
    };

    let ele = findElement();
    if (ele) return resolve(ele);

    const observer = new MutationObserver(mutations => {
        let ele = findElement();
        if (ele) {
            observer.disconnect();
            resolve(ele);
        }
    });

    observer.observe(document.documentElement, {
        childList: true,
        subtree: true
    });
})

// Parse HTML string to DOM Element
function fromHTML(html) {
    if (!html) throw Error('html cannot be null or undefined', html)
    const template = document.createElement('template')
    template.innerHTML = html
    const result = template.content.children
    return result.length === 1 ? result[0] : result
}

// ==========================
// 初始化入口（菜单 / Hook / UI）
// ==========================
(function () {
    'use strict';

    // 注册油猴脚本菜单命令
    const updateMenuCommand = () => {
        const currentPower = getPowerMode()
        const powerIcon = currentPower ? '⚡' : '🚫'
        const powerText = currentPower ? '开启' : '关闭'
        const powerMenuText = `${powerIcon} 强力模式 (当前${powerText}，点击此处进行切换)`

        GM_registerMenuCommand(powerMenuText, () => {
            const newMode = !getPowerMode()
            GM_setValue(powerModeStored, newMode)

            const newStatusText = newMode ? '开启' : '关闭'
            const newStatusIcon = newMode ? '⚡' : '🚫'

            log(`强力模式已${newStatusText} ${newStatusIcon}`)

            const description = newMode
                ? '强力模式已开启。\n当前会强行指定节点，即使遇到视频加载失败也不自动切换。\n如遇视频加载失败或严重卡顿，请关闭该模式。'
                : '强力模式已关闭。\n当前只会修改主要CDN节点，保持备用节点不变。\n如需强制指定节点，请确保节点有效后再进行开启。'

            alert(`ℹ ${newStatusText}强力模式\n\n${description}\n\n页面将自动刷新以使设置生效...`)
            location.reload()
        })

        const currentLive = getLiveMode()
        const liveIcon = currentLive ? '📺' : '🚫'
        const liveText = currentLive ? '开启' : '关闭'
        const liveMenuText = `${liveIcon} 适用直播间 (当前${liveText}，点击此处进行切换)`

        GM_registerMenuCommand(liveMenuText, () => {
            const newMode = !getLiveMode()
            GM_setValue(liveModeStored, newMode)

            const newStatusText = newMode ? '开启' : '关闭'
            const newStatusIcon = newMode ? '📺' : '🚫'

            log(`适用直播间已${newStatusText} ${newStatusIcon}`)

            const description = newMode
                ? '已开启适用直播间。\n当前会在直播间页面对播放源地址进行同样的CDN改写。\n关闭后直播间将保持默认源，不再改写。'
                : '已关闭适用直播间。\n当前仅对视频播放页生效，直播间页面不再改写。'

            alert(`ℹ ${newStatusText}适用直播间\n\n${description}\n\n页面将自动刷新以使设置生效...`)
            location.reload()
        })
    }
    
    // 初始化菜单命令
    updateMenuCommand()

    const liveBootstrapSeen = new WeakSet()
    const installLiveBootstrapHooks = () => {
        if (!getLiveMode() || !isLiveRoomPage() || !isCcbEnabled()) return

        const tryRewrite = (obj, source) => {
            if (!obj || typeof obj !== 'object') return
            if (liveBootstrapSeen.has(obj)) return
            liveBootstrapSeen.add(obj)
            livePlayInfoTransformer(obj)
        }

        const propNames = ['__NEPTUNE_IS_MY_WAIFU__']
        for (const name of propNames) {
            try {
                const desc = Object.getOwnPropertyDescriptor(unsafeWindow, name)
                if (desc && desc.configurable === false) {
                    if (unsafeWindow[name] && typeof unsafeWindow[name] === 'object') {
                        tryRewrite(unsafeWindow[name], `window.${name} (non-configurable initial)`)
                    }
                    continue
                }

                let internal = unsafeWindow[name]
                if (internal && typeof internal === 'object') {
                    tryRewrite(internal, `window.${name} (initial)`)
                }
                Object.defineProperty(unsafeWindow, name, {
                    configurable: true,
                    get: () => internal,
                    set: (v) => {
                        internal = v
                        if (v && typeof v === 'object') tryRewrite(v, `window.${name} (set)`)
                    }
                })
            } catch (e) {
                warn('直播首播 Hook 安装失败:', { name, err: String(e) })
            }
        }

        if (!JSON.parse._ccbLiveWrapped) {
            const Oparse = JSON.parse
            const wrapped = function (text, reviver) {
                const isStr = typeof text === 'string'
                let looksLive = false
                if (isStr) {
                    const hasMediaHost = text.includes('bilivideo.com') || text.includes('acgvideo.com')
                    const hasLiveKeys = text.includes('"url_info"') || text.includes('"base_url"') || text.includes('live-bvc')
                    const hasRoomApiKey = text.includes('getRoomPlayInfo') || text.includes('playUrl')
                    looksLive = hasMediaHost && (hasLiveKeys || hasRoomApiKey)
                }

                const obj = Oparse.call(this, text, reviver)
                if (looksLive && obj && typeof obj === 'object') {
                    tryRewrite(obj, 'JSON.parse')
                }
                return obj
            }
            wrapped._ccbLiveWrapped = true
            JSON.parse = wrapped
        }
    }

    installLiveBootstrapHooks()

    // Hook Bilibili PlayUrl Api
    interceptNetResponse((response, url, meta) => {
        if (!isCcbEnabled()) return
        const u = typeof url === 'string' ? url : (url && url.url) || String(url)
        
        // 使用更宽松的匹配规则，避免相对路径或参数导致匹配失败
        const isTarget = [
            '/x/player/wbi/playurl',
            '/x/player/playurl',
            // '/x/player/online', // 移除心跳/在线人数接口，避免无关拦截
            '/pgc/player/web/playurl',
            '/pgc/player/web/v2/playurl',
            '/pgc/player/api/playurl',
            '/pugv/player/web/playurl',
            '/ogv/player/playview'
        ].some(path => u.includes(path))

        if (isTarget) {
            if (response === null) return true

            try {
                if (typeof response === 'string') {
                    const playInfo = JSON.parse(response)
                    playInfoTransformer(playInfo)
                    return JSON.stringify(playInfo)
                }
                if (response && typeof response === 'object') {
                    playInfoTransformer(response)
                    return response
                }
            } catch (e) {
                error('处理播放信息接口失败:', e)
            }
        }
    });

    interceptNetResponse((response, url, meta) => {
        if (!isCcbEnabled()) return
        if (!getLiveMode()) return
        const raw = typeof url === 'string' ? url : (url && url.url) || ''
        let u
        try {
            u = new URL(raw || String(url), location.href)
        } catch (_) {
            return
        }
        const p = u.pathname || ''
        if (/\/xlive\/web-room\/v\d+\/index\/getRoomPlayInfo\/?$/.test(p) ||
            /\/room\/v1\/Room\/playUrl\/?$/.test(p)
        ) {
            if (response === null) return true
            if (!isLiveRoomPage()) {
                return
            }
            const playInfo = JSON.parse(response)
            livePlayInfoTransformer(playInfo)
            return JSON.stringify(playInfo)
        }
    })

    // 拦截直播 M3U8 Master Playlist (画质切换)
    interceptNetResponse((response, url, meta) => {
        if (!isCcbEnabled()) return
        if (!getLiveMode()) return
        const u = typeof url === 'string' ? url : (url && url.url) || String(url)
        if (u.includes('/xlive/play-gateway/master/url')) {
            if (response === null) return true
            return replaceBilivideoInText(response)
        }
    })

    // 响应式 window.__playinfo__
    if (unsafeWindow.__playinfo__) {
        playInfoTransformer(unsafeWindow.__playinfo__)
    } else {
        let internalPlayInfo = unsafeWindow.__playinfo__
        Object.defineProperty(unsafeWindow, '__playinfo__', {
            configurable: true,
            get: () => internalPlayInfo,
            set: v => {
                if (isCcbEnabled()) playInfoTransformer(v);
                internalPlayInfo = v
            }
        })
    }

    // 响应式 window.__INITIAL_STATE__ (番剧页面通常使用此变量)
    if (unsafeWindow.__INITIAL_STATE__) {
        playInfoTransformer(unsafeWindow.__INITIAL_STATE__)
    } else {
        let internalState = unsafeWindow.__INITIAL_STATE__
        Object.defineProperty(unsafeWindow, '__INITIAL_STATE__', {
            configurable: true,
            get: () => internalState,
            set: v => {
                if (isCcbEnabled()) {
                    // __INITIAL_STATE__ 可能很大，但 playInfoTransformer 现在支持 deepReplace，应该能处理
                    playInfoTransformer(v);
                }
                internalState = v
            }
        })
    }

    // 添加组件
    if (location.href.startsWith('https://www.bilibili.com/video/')
        || location.href.startsWith('https://www.bilibili.com/bangumi/play/')
        || location.href.startsWith('https://www.bilibili.com/festival/')
        || location.href.startsWith('https://www.bilibili.com/list/')
    ) {
        // 不知道为什么, 批站会在部分限免视频的播放器前面套娃一层
        waitForElm([
            '#bilibili-player > div > div > div.bpx-player-primary-area > div.bpx-player-video-area > div.bpx-player-control-wrap > div.bpx-player-control-entity > div.bpx-player-control-bottom > div.bpx-player-control-bottom-left',
            '#bilibili-player > div > div > div > div.bpx-player-primary-area > div.bpx-player-video-area > div.bpx-player-control-wrap > div.bpx-player-control-entity > div.bpx-player-control-bottom > div.bpx-player-control-bottom-left'
        ])
            .then(async settingsBar => {
                // 先获取地区列表
                await getRegionList();
                // 根据之前保存的地区信息加载 CDN 列表
                await getCdnListByRegion(GM_getValue(regionStored, regionList[0]))

                // 地区
                const regionSelector = fromHTML(`
                    <div class="bpx-player-ctrl-setting-checkbox" style="margin-left: 10px; display: flex;">
                        <select id="ccb-region-select" class="bui-select" style="background: #2b2b2b; color: white; border: 1px solid #444; padding: 2px 5px; border-radius: 4px; width: 60px; height: 22px; font-size: 12px;">
                            ${regionList.map(region => `<option value="${region}"${region === GM_getValue(regionStored, regionList[0]) ? ' selected' : ''}>${region}</option>`).join('')}
                        </select>
                    </div>
                `)

                // 监听地区选择框, 一旦改变就保存最新信息并获取该地区的 CDN 列表
                const regionNode = regionSelector.querySelector('select')

                // CDN 选择下拉列表
                const cdnSelector = fromHTML(`
                    <div class="bpx-player-ctrl-setting-checkbox" style="margin-left: 10px; display: flex;">
                        <select id="ccb-cdn-select" class="bui-select" style="background: #2b2b2b; color: white; border: 1px solid #444; padding: 2px 5px; border-radius: 4px; width: 150px; height: 22px; font-size: 12px;">
                            ${cdnList.map(cdn => `<option value="${cdn}"${cdn === GM_getValue(cdnNodeStored, cdnList[0]) ? ' selected' : ''}>${cdn}</option>`).join('')}
                        </select>
                    </div>
                `)

                // 监听 CDN 选择框, 一旦改变就保存最新信息并刷新页面
                const selectNode = cdnSelector.querySelector('select')
                selectNode.addEventListener('change', (e) => {
                    const selectedCDN = e.target.value
                    GM_setValue(cdnNodeStored, selectedCDN)
                    // 刷新网页
                    location.reload()
                })
                
                // 创建自定义CDN输入框
                const currentCdn = GM_getValue(cdnNodeStored, '')
                const customCdnInput = fromHTML(`
                    <div class="bpx-player-ctrl-setting-checkbox" style="margin-left: 10px; display: none;">
                        <input id="ccb-custom-cdn-input" type="text" placeholder="${currentCdn}" style="background: #2b2b2b; color: white; border: 1px solid #444; padding: 2px 5px; border-radius: 4px; width: 150px; height: 22px; font-size: 12px; box-sizing: border-box;">
                    </div>
                `)
                
                const customInput = customCdnInput.querySelector('input')
                
                // 检查当前地区是否为编辑模式，决定显示CDN选择器还是输入框
                  const toggleCdnDisplay = (region) => {
                      if (region === '编辑') {
                         // 更新输入框的placeholder为当前选择的CDN
                         customInput.placeholder = GM_getValue(cdnNodeStored, '')
                         cdnSelector.style.display = 'none'
                         customCdnInput.style.display = 'flex'
                     } else {
                         cdnSelector.style.display = 'flex'
                         customCdnInput.style.display = 'none'
                     }
                 }
                
                // 监听自定义CDN输入框的回车事件
                customInput.addEventListener('keypress', (e) => {
                    if (e.key === 'Enter') {
                        const customCDN = e.target.value.trim()
                        if (customCDN) {
                            GM_setValue(cdnNodeStored, customCDN)
                            // 刷新网页
                            location.reload()
                        }
                    }
                })
                
                // 更新地区选择器的事件处理
                regionNode.addEventListener('change', async (e) => {
                    const selectedRegion = e.target.value
                    GM_setValue(regionStored, selectedRegion)
                    
                    // 切换显示模式
                    toggleCdnDisplay(selectedRegion)
                    
                    if (selectedRegion !== '编辑') {
                        // 请求该地区的 CDN 列表
                        await getCdnListByRegion(selectedRegion)
                    }
                })
                
                // 初始化显示状态
                 const currentRegion = GM_getValue(regionStored, regionList[0])
                 toggleCdnDisplay(currentRegion)

                settingsBar.appendChild(regionNode)
                settingsBar.appendChild(cdnSelector)
                settingsBar.appendChild(customCdnInput)
            });
    }

    const existingLiveControls = document.querySelector('#ccb-live-controls')
    if (existingLiveControls) existingLiveControls.remove()
})();
