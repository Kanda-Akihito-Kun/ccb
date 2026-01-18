// ==UserScript==
// @name         Custom CDN of Bilibili (CCB) - 修改哔哩哔哩的网页视频、直播、番剧的播放源
// @namespace    CCB
// @license      MIT
// @version      1.1.0
// @description  修改哔哩哔哩的视频播放源 - 部署于 GitHub Action 版本
// @author       鼠鼠今天吃嘉然
// @run-at       document-start
// @match        https://www.bilibili.com/video/*
// @match        https://www.bilibili.com/bangumi/play/*
// @match        https://www.bilibili.com/festival/*
// @match        https://www.bilibili.com/list/*
// @match        https://live.bilibili.com/*
// @match        https://www.bilibili.com/blackboard/video-diagnostics.html*
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
    return GM_getValue(powerModeStored, false)
}

// 获取直播模式状态
const getLiveMode = () => {
    return GM_getValue(liveModeStored, false)
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

    log('播放源:', domain)

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

const MEDIA_HOST_LIKE_RE = /\.(?:bilivideo|acgvideo)\.com(?:\/|$)/
const MEDIA_URL_ORIGIN_HTTP_RE = /^https?:\/\/.*?\//
const MEDIA_URL_ORIGIN_PROTO_REL_RE = /^\/\/.*?\//
const MEDIA_HOST_PREFIX_RE = /^[\w.-]+\.(?:bilivideo|acgvideo)\.com\//
const MEDIA_HOST_EXACT_RE = /^[\w.-]+\.(?:bilivideo|acgvideo)\.com$/
const MEDIA_URL_IN_HTML_RE = /https?:\/\/[^"'\s]*?\.(?:bilivideo|acgvideo)\.com\//g
const MEDIA_HOST_IN_HTML_RE = /\b[\w.-]+\.(?:bilivideo|acgvideo)\.com\b/g

const replaceMediaUrl = (s) => {
    if (typeof s !== 'string') return s
    if (!MEDIA_HOST_LIKE_RE.test(s)) return s
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
const playInfoTransformer = playInfo => {
    const urlTransformer = i => {
        const newUrl = replaceMediaUrl(i.base_url)
        i.baseUrl = newUrl;
        i.base_url = newUrl
        
        // 只有在强力模式开启时才处理 backupUrl
        if (getPowerMode()) {
            if (i.backupUrl && Array.isArray(i.backupUrl)) {
                i.backupUrl = i.backupUrl.map(url => 
                    replaceMediaUrl(url)
                );
            }
            if (i.backup_url && Array.isArray(i.backup_url)) {
                i.backup_url = i.backup_url.map(url => 
                    replaceMediaUrl(url)
                );
            }
        }
    };

    const durlTransformer = i => {
        i.url = replaceMediaUrl(i.url)
    };

    if (playInfo.code !== (void 0) && playInfo.code !== 0) {
        warn('获取播放信息失败:', playInfo.message)
        return
    }

    let video_info
    if (playInfo.result) { // bangumi pages'
        video_info = playInfo.result.dash === (void 0) ? playInfo.result.video_info : playInfo.result
        if (!video_info?.dash) {
            if (playInfo.result.durl && playInfo.result.durls) {
                video_info = playInfo.result // documentary trail viewing, m.bilibili.com/bangumi/play/* trail or non-trail viewing
            } else {
                warn('播放信息受限:', playInfo.result.play_check?.limit_play_reason)
            }

            // durl & durls are for trial viewing, and they usually exist when limit_play_reason=PAY
            video_info?.durl?.forEach(durlTransformer)
            video_info?.durls?.forEach(durl => { durl.durl?.forEach(durlTransformer) })
            return
        }
    } else { // video pages'
        video_info = playInfo.data
    }
    try {
        // 可能是充电专属视频的接口
        if (video_info.dash) {
            // 绝大部分视频的 video_info 接口返回的数据格式长这样
            video_info.dash.video.forEach(urlTransformer)
            video_info.dash.audio.forEach(urlTransformer)
        } else if (video_info.durl) {
            video_info.durl.forEach(durlTransformer)
        } else if (video_info.video_info) {
            // 可能是限免视频的接口
            video_info.video_info.dash.video.forEach(urlTransformer)
            video_info.video_info.dash.audio.forEach(urlTransformer)
        }
    } catch (err) {
        // 我也不知道这是啥格式了
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
    const OriginalXMLHttpRequest = theWindow.XMLHttpRequest

    // handleInterceptedResponse 中会用到, IDE 的静态分析识别不出来而已, 别删
    class XMLHttpRequest extends OriginalXMLHttpRequest {
        get responseText() {
            if (this.readyState !== this.DONE) return super.responseText
            return handleInterceptedResponse(super.responseText, this.responseURL, { type: 'xhr', xhr: this })
        }
        get response() {
            if (this.readyState !== this.DONE) return super.response
            return handleInterceptedResponse(super.response, this.responseURL, { type: 'xhr', xhr: this })
        }
    }

    theWindow.XMLHttpRequest = XMLHttpRequest

    const OriginalFetch = fetch
    theWindow.fetch = (input, init) => {
        const s = typeof input === 'string' ? input : (input && input.url)
        const method = (init && init.method) || (input && input.method) || 'GET'
        const shouldIntercept = handleInterceptedResponse(null, input, { type: 'fetch', input, init })
        if (!shouldIntercept) return OriginalFetch(input, init)
        return OriginalFetch(input, init).then(response =>
            new Promise((resolve) => response.text()
                .then(text => {
                    const out = handleInterceptedResponse(text, input, { type: 'fetch', input, init, response })
                    resolve(new Response(out, {
                        status: response.status,
                        statusText: response.statusText,
                        headers: response.headers
                    }))
                })
            )
        )
    }

    return interceptNetResponse
})(unsafeWindow)

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

    // bangumi 页：给 Worker 的脚本 Blob 预置一段前置代码，重写 Worker 内的分段请求域名
    // 这是为了解决主文档首屏无法拦截、且播放器在 WebWorker 内拉取分段的情况
    if (location.href.startsWith('https://www.bilibili.com/bangumi/play/') || (getLiveMode() && isLiveRoomPage())) {
        try {
            const OriginalBlob = window.Blob
            window.Blob = function(parts, options) {
                try {
                    const type = options && options.type ? String(options.type) : ''
                    const looksJs = /javascript/i.test(type)
                        || (Array.isArray(parts) && parts.some(p => typeof p === 'string' && /importScripts|WorkerGlobalScope|bili/i.test(p)))
                    if (looksJs && isCcbEnabled()) {
                        const prelude = `(() => {\n` +
                            `  const Replacement = ${JSON.stringify(Replacement)};\n` +
                            `  const MEDIA_HOST_LIKE_RE = ${MEDIA_HOST_LIKE_RE};\n` +
                            `  const MEDIA_URL_ORIGIN_HTTP_RE = ${MEDIA_URL_ORIGIN_HTTP_RE};\n` +
                            `  const MEDIA_URL_ORIGIN_PROTO_REL_RE = ${MEDIA_URL_ORIGIN_PROTO_REL_RE};\n` +
                            `  const MEDIA_HOST_PREFIX_RE = ${MEDIA_HOST_PREFIX_RE};\n` +
                            `  const MEDIA_HOST_EXACT_RE = ${MEDIA_HOST_EXACT_RE};\n` +
                            `  const getReplacementHost = ${getReplacementHost.toString()};\n` +
                            `  const replaceMediaUrl = ${replaceMediaUrl.toString()};\n` +
                            `  try {\n` +
                            `    const Ofetch = self.fetch;\n` +
                            `    self.fetch = (input, init) => {\n` +
                            `      try {\n` +
                            `        const s = typeof input === 'string' ? input : (input && input.url);\n` +
                            `        if (typeof s === 'string') {\n` +
                            `          const r = replaceMediaUrl(s);\n` +
                            `          if (r !== s) input = typeof input === 'string' ? r : new Request(r, input);\n` +
                            `        }\n` +
                            `      } catch (_) {}\n` +
                            `      return Ofetch(input, init);\n` +
                            `    };\n` +
                            `    if (self.XMLHttpRequest) {\n` +
                            `      const OX = self.XMLHttpRequest;\n` +
                            `      class X extends OX {\n` +
                            `        open(m, u, a, usr, pwd) {\n` +
                            `          try {\n` +
                            `            if (typeof u === 'string') u = replaceMediaUrl(u);\n` +
                            `          } catch (_) {}\n` +
                            `          return super.open(m, u, a, usr, pwd);\n` +
                            `        }\n` +
                            `      }\n` +
                            `      self.XMLHttpRequest = X;\n` +
                            `    }\n` +
                            `  } catch (e) { /* ignore */ }\n` +
                            `})();\n`;
                        const injected = [prelude, ...(Array.isArray(parts) ? parts : [parts])]
                        const blob = new OriginalBlob(injected, options)
                        return blob
                    }
                } catch (e) { warn('注入 Worker 预置脚本失败:', e) }
                return new OriginalBlob(parts, options)
            }
        } catch (err) {
            warn('安装 Worker Blob Hook 失败:', err)
        }
    }

    // 同时包装 Worker(URL) 创建方式：若站点使用 URL Worker，则注入前置代码后再加载原始脚本
    if (location.href.startsWith('https://www.bilibili.com/bangumi/play/') || (getLiveMode() && isLiveRoomPage())) {
        try {
            const OriginalWorker = window.Worker
            window.Worker = function (scriptURL, options) {
                try {
                    if (!isCcbEnabled()) return new OriginalWorker(scriptURL, options)
                    const isModule = options && options.type === 'module'
                    const prelude = `(() => {\n` +
                        `  const Replacement = ${JSON.stringify(Replacement)};\n` +
                        `  const MEDIA_HOST_LIKE_RE = ${MEDIA_HOST_LIKE_RE};\n` +
                        `  const MEDIA_URL_ORIGIN_HTTP_RE = ${MEDIA_URL_ORIGIN_HTTP_RE};\n` +
                        `  const MEDIA_URL_ORIGIN_PROTO_REL_RE = ${MEDIA_URL_ORIGIN_PROTO_REL_RE};\n` +
                        `  const MEDIA_HOST_PREFIX_RE = ${MEDIA_HOST_PREFIX_RE};\n` +
                        `  const MEDIA_HOST_EXACT_RE = ${MEDIA_HOST_EXACT_RE};\n` +
                        `  const getReplacementHost = ${getReplacementHost.toString()};\n` +
                        `  const replaceMediaUrl = ${replaceMediaUrl.toString()};\n` +
                        `  try {\n` +
                        `    const Ofetch = self.fetch;\n` +
                        `    self.fetch = (input, init) => {\n` +
                        `      try { const s = typeof input === 'string' ? input : (input && input.url);\n` +
                        `        if (typeof s === 'string') { const r = replaceMediaUrl(s);\n` +
                        `          if (r !== s) input = typeof input === 'string' ? r : new Request(r, input); }\n` +
                        `      } catch (_) {}\n` +
                        `      return Ofetch(input, init);\n` +
                        `    };\n` +
                        `    if (self.XMLHttpRequest) {\n` +
                        `      const OX = self.XMLHttpRequest;\n` +
                        `      class X extends OX { open(m,u,a,usr,pwd){\n` +
                        `        try { if (typeof u === 'string') u = replaceMediaUrl(u); } catch(_){}\n` +
                        `        return super.open(m,u,a,usr,pwd); } }\n` +
                        `      self.XMLHttpRequest = X;\n` +
                        `    }\n` +
                        `  } catch (e) {}\n` +
                        `})();\n`
                    const wrapperCode = isModule
                        ? `${prelude}\nimport ${JSON.stringify(String(scriptURL))};\n`
                        : `${prelude}\nimportScripts(${JSON.stringify(String(scriptURL))});\n`
                    const blob = new Blob([wrapperCode], { type: 'application/javascript' })
                    const url = URL.createObjectURL(blob)
                    return new OriginalWorker(url, options)
                } catch (e) {
                    warn('包装 Worker 脚本失败，已回退到原始方式:', e)
                    return new OriginalWorker(scriptURL, options)
                }
            }
        } catch (e) {
            warn('安装 Worker(URL) Wrapper 失败:', e)
        }
    }

    // Hook Bilibili PlayUrl Api
    interceptNetResponse((response, url, meta) => {
        if (!isCcbEnabled()) return
        const u = typeof url === 'string' ? url : (url && url.url) || String(url)
        if (u.startsWith('https://api.bilibili.com/x/player/wbi/playurl') ||
            u.startsWith('https://api.bilibili.com/pgc/player/web/v2/playurl') ||
            u.startsWith('https://api.bilibili.com/x/player/playurl') ||
            u.startsWith('https://api.bilibili.com/x/player/online') ||
            u.startsWith('https://api.bilibili.com/x/player/wbi') ||
            u.startsWith('https://api.bilibili.com/pgc/player/web/playurl') ||
            u.startsWith('https://api.bilibili.com/pugv/player/web/playurl') // at /cheese/
        ) {
            if (response === null) return true
            const responseText = response
            const playInfo = JSON.parse(responseText)
            playInfoTransformer(playInfo)
            return JSON.stringify(playInfo)
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

    // 在番剧页安装对字符串插入 HTML 的钩子，覆盖 inner window 等非 fetch/XHR 的场景
    if (location.href.startsWith('https://www.bilibili.com/bangumi/play/')) {
        try {
            const origWrite = Document.prototype.write
            Document.prototype.write = function (...args) {
                try {
                    args = args.map(s => typeof s === 'string' ? replaceBilivideoInText(s) : s)
                } catch (_) {}
                return origWrite.apply(this, args)
            }

            const origInsertAdjacentHTML = Element.prototype.insertAdjacentHTML
            Element.prototype.insertAdjacentHTML = function (position, html) {
                try {
                    if (typeof html === 'string') html = replaceBilivideoInText(html)
                } catch (_) {}
                return origInsertAdjacentHTML.call(this, position, html)
            }

            const innerDesc = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML')
            if (innerDesc && innerDesc.set && innerDesc.get) {
                Object.defineProperty(Element.prototype, 'innerHTML', {
                    configurable: true,
                    get() { return innerDesc.get.call(this) },
                    set(v) {
                        try { if (typeof v === 'string') v = replaceBilivideoInText(v) } catch (_) {}
                        return innerDesc.set.call(this, v)
                    }
                })
            }
        } catch (e) {
            warn('安装 HTML 字符串替换 Hook 失败:', e)
        }
    }

    // 响应式 window.__playinfo__
    if (unsafeWindow.__playinfo__) {
        playInfoTransformer(unsafeWindow.__playinfo__)
    } else {
        let internalPlayInfo = unsafeWindow.__playinfo__
        Object.defineProperty(unsafeWindow, '__playinfo__', {
            get: () => internalPlayInfo,
            set: v => {
                if (isCcbEnabled()) playInfoTransformer(v);
                internalPlayInfo = v
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
