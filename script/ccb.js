// ==UserScript==
// @name         Custom CDN of Bilibili (CCB) - 修改哔哩哔哩的视频播放源
// @namespace    CCB
// @license      MIT
// @version      1.0.0
// @description  修改哔哩哔哩的视频播放源 - 部署于 GitHub Action 版本
// @author       鼠鼠今天吃嘉然
// @run-at       document-start
// @match        https://www.bilibili.com/video/*
// @match        https://www.bilibili.com/bangumi/play/*
// @match        https://www.bilibili.com/festival/*
// @match        https://www.bilibili.com/list/*
// @match        https://live.bilibili.com/*
// @connect      https://kanda-akihito-kun.github.io/ccb/api/
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        unsafeWindow
// ==/UserScript==

const api = 'https://kanda-akihito-kun.github.io/ccb/api'

// 日志输出函数
const PluginName = 'CCB'
const log = console.log.bind(console, `[${PluginName}]:`)

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

const getLiveMode = () => {
    return GM_getValue(liveModeStored, false)
}

// CDN 列表
const initCdnList = [
    'upos-sz-mirroraliov.bilivideo.com',
    'upos-sz-mirroralib.bilivideo.com',
    'upos-sz-estgcos.bilivideo.com',
]
var cdnList = [
    defaultCdnNode,
    ...initCdnList
]

// 要是选择了 defaultCdnNode 就不要改节点
const isCcbEnabled = () => {
    return getCurCdnNode() !== defaultCdnNode
}

// 替换播放源
const Replacement = (() => {
    const toURL = ((url) => {
        if (url.indexOf('://') === -1) url = 'https://' + url
        return url.endsWith('/') ? url : `${url}/`
    })

    let domain = getCurCdnNode()

    log(`播放源已修改为: ${domain}`)

    return toURL(domain)
})()

const ReplacementNoSlash = Replacement && Replacement.endsWith('/') ? Replacement.slice(0, -1) : Replacement

// 地区列表
var regionList = ['编辑']

const getRegionList = async () => {
    try {
        const response = await fetch(`${api}/region.json`);
        const data = await response.json();
        // 直接使用 JSON 数据
        regionList = ["编辑", ...data];
        log(`已更新地区列表: ${data}`);
    } catch (error) {
        log('获取地区列表失败:', error);
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
        log(`已更新 ${region} 地区的 CDN 列表`);
    } catch (error) {
        log('获取 CDN 列表失败:', error);
    }
}

const playInfoTransformer = playInfo => {
    const urlTransformer = i => {
        const newUrl = i.base_url.replace(
            /https:\/\/.*?\//,
            Replacement
        )
        i.baseUrl = newUrl;
        i.base_url = newUrl
        
        // 只有在强力模式开启时才处理 backupUrl
        if (getPowerMode()) {
            if (i.backupUrl && Array.isArray(i.backupUrl)) {
                i.backupUrl = i.backupUrl.map(url => 
                    url.replace(/https:\/\/.*?\//, Replacement)
                );
            }
            if (i.backup_url && Array.isArray(i.backup_url)) {
                i.backup_url = i.backup_url.map(url => 
                    url.replace(/https:\/\/.*?\//, Replacement)
                );
            }
        }
    };

    const durlTransformer = i => {
        i.url = i.url.replace(
            /https:\/\/.*?\//,
            Replacement
        )
    };

    if (playInfo.code !== (void 0) && playInfo.code !== 0) {
        log('Failed to get playInfo, message:', playInfo.message)
        return
    }

    let video_info
    if (playInfo.result) { // bangumi pages'
        video_info = playInfo.result.dash === (void 0) ? playInfo.result.video_info : playInfo.result
        if (!video_info?.dash) {
            if (playInfo.result.durl && playInfo.result.durls) {
                video_info = playInfo.result // documentary trail viewing, m.bilibili.com/bangumi/play/* trail or non-trail viewing
            } else {
                log('Failed to get video_info, limit_play_reason:', playInfo.result.play_check?.limit_play_reason)
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
        log('ERR:', err)
    }
}

const livePlayInfoTransformer = (playInfo) => {
    if (!playInfo || typeof playInfo !== 'object') return
    if (playInfo.code !== (void 0) && playInfo.code !== 0) {
        log('Failed to get live playInfo, message:', playInfo.message)
        return
    }

    let targetHost = ''
    let targetHostNoProto = ''
    try {
        const u = new URL(Replacement)
        targetHost = u.host
        targetHostNoProto = `//${u.host}`
    } catch (e) {
        log('Live playInfo rewrite skipped (bad Replacement):', { Replacement, err: String(e) })
        return
    }

    const canRewriteMediaUrl = (s) => typeof s === 'string' && (
        /\.bilivideo\.com(?:\/|$)/.test(s) || /\.acgvideo\.com(?:\/|$)/.test(s)
    )

    const replaceMediaUrl = (s) => {
        if (!canRewriteMediaUrl(s)) return s
        if (s.startsWith('https://') || s.startsWith('http://')) {
            return s.replace(/https?:\/\/.*?\//, Replacement)
        }
        if (s.startsWith('//')) {
            return s.replace(/^\/\/.*?\//, Replacement.replace(/^https?:/, ''))
        }
        if (/^[\w.-]+\.(?:bilivideo|acgvideo)\.com\//.test(s)) {
            return s.replace(/^[^/]+\//, `${targetHost}/`)
        }
        return s
    }

    const replaceMediaHost = (s) => {
        if (!canRewriteMediaUrl(s)) return s
        if (s.startsWith('https://') || s.startsWith('http://')) return ReplacementNoSlash
        if (s.startsWith('//')) return ReplacementNoSlash.replace(/^https?:/, '')
        if (/^[\w.-]+\.(?:bilivideo|acgvideo)\.com$/.test(s)) return targetHost
        return s
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
                const out = (k === 'host') ? replaceMediaHost(v) : replaceMediaUrl(v)
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
    log('Live playInfo rewritten:', { replaced, sampleBefore, sampleAfter, targetHost, href: location.href })
}

const isLiveRoomPage = () => {
    try {
        if (location.host !== 'live.bilibili.com') return false
        const p = location.pathname || '/'
        const ok = /^\/\d+\/?$/.test(p) || /^\/blanc\/\d+\/?$/.test(p)
        if (getLiveMode() && location.href.startsWith('https://live.bilibili.com/')) {
            const now = Date.now()
            if (!isLiveRoomPage._last || isLiveRoomPage._last.ok !== ok || isLiveRoomPage._last.p !== p || now - isLiveRoomPage._last.t > 5000) {
                isLiveRoomPage._last = { ok, p, t: now }
                log('Live room check:', { ok, pathname: p, href: location.href })
            }
        }
        return ok
    } catch (e) {
        if (getLiveMode()) {
            log('Live room check failed:', { href: (() => { try { return location.href } catch (_) { return '' } })(), err: String(e) })
        }
        return false
    }
}

// 将番剧页 HTML 中的 bilivideo 节点域名替换为当前选择的 CDN
const replaceBilivideoInHtml = (html) => {
    if (!isCcbEnabled()) return html
    try {
        if (typeof html !== 'string') return html
        // 只替换 bilivideo 域名前缀，不动其余参数与路径（带协议的 URL）
        let out = html.replace(/https:\/\/[^"'\s]*?\.bilivideo\.com\//g, Replacement)
        // 同时替换纯文本域名（如统计信息中的 Video Host）为目标 CDN 主机名
        try {
            const host = new URL(Replacement).host
            out = out.replace(/\b[\w.-]+\.bilivideo\.com\b/g, host)
        } catch (_) {}
        log('在html拦截后的地址: ', out)
        return out
    } catch (e) {
        log('替换番剧 HTML 失败:', e)
        return html
    }
}

// Network Request Interceptor
const interceptNetResponse = (theWindow => {
    const interceptors = []
    const interceptNetResponse = (handler) => interceptors.push(handler)

    // when response === null && url is String, it's checking if the url is handleable
    const handleInterceptedResponse = (response, url) => interceptors.reduce((modified, handler) => {
        const ret = handler(modified, url)
        return ret ? ret : modified
    }, response)
    const OriginalXMLHttpRequest = theWindow.XMLHttpRequest

    class XMLHttpRequest extends OriginalXMLHttpRequest {
        get responseText() {
            if (this.readyState !== this.DONE) return super.responseText
            return handleInterceptedResponse(super.responseText, this.responseURL)
        }
        get response() {
            if (this.readyState !== this.DONE) return super.response
            return handleInterceptedResponse(super.response, this.responseURL)
        }
    }

    theWindow.XMLHttpRequest = XMLHttpRequest

    const OriginalFetch = fetch
    theWindow.fetch = (input, init) => (!handleInterceptedResponse(null, input) ? OriginalFetch(input, init) :
            OriginalFetch(input, init).then(response =>
                new Promise((resolve) => response.text()
                    .then(text => resolve(new Response(handleInterceptedResponse(text, input), {
                        status: response.status,
                        statusText: response.statusText,
                        headers: response.headers
                    })))
                )
            )
    );

    return interceptNetResponse
})(unsafeWindow)

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

    log('waitForElm, MutationObserver started for selectors:', selectors);
})

// Parse HTML string to DOM Element
function fromHTML(html) {
    if (!html) throw Error('html cannot be null or undefined', html)
    const template = document.createElement('template')
    template.innerHTML = html
    const result = template.content.children
    return result.length === 1 ? result[0] : result
}

(function () {
    'use strict';

    // 注册油猴脚本菜单命令
    const updateMenuCommand = () => {
        const currentPower = getPowerMode()
        const powerIcon = currentPower ? '⚡' : '❎'
        const powerText = currentPower ? '开启' : '关闭'
        const powerMenuText = `${powerIcon} 强力模式 (当前${powerText}，点击此处进行切换)`

        GM_registerMenuCommand(powerMenuText, () => {
            const newMode = !getPowerMode()
            GM_setValue(powerModeStored, newMode)

            const newStatusText = newMode ? '开启' : '关闭'
            const newStatusIcon = newMode ? '⚡' : '❎'

            log(`强力模式已${newStatusText} ${newStatusIcon}`)

            const description = newMode
                ? '强力模式已开启。\n当前会强行指定节点，即使遇到视频加载失败也不自动切换。\n如遇视频加载失败或严重卡顿，请关闭该模式。'
                : '强力模式已关闭。\n当前只会修改主要CDN节点，保持备用节点不变。\n如需强制指定节点，请确保节点有效后再进行开启。'

            alert(`ℹ ${newStatusText}强力模式\n\n${description}\n\n页面将自动刷新以使设置生效...`)
            location.reload()
        })

        const currentLive = getLiveMode()
        const liveIcon = currentLive ? '✅' : '❎'
        const liveText = currentLive ? '开启' : '关闭'
        const liveMenuText = `${liveIcon} 适用直播间 (当前${liveText}，点击此处进行切换)`

        GM_registerMenuCommand(liveMenuText, () => {
            const newMode = !getLiveMode()
            GM_setValue(liveModeStored, newMode)

            const newStatusText = newMode ? '开启' : '关闭'
            const newStatusIcon = newMode ? '✅' : '❎'

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
                            `  try {\n` +
                            `    const Ofetch = self.fetch;\n` +
                            `    self.fetch = (input, init) => {\n` +
                            `      try {\n` +
                            `        const s = typeof input === 'string' ? input : (input && input.url);\n` +
                            `        if (typeof s === 'string' && /(?:https?:)?\\/\\/[^/]+\\.(?:bilivideo|acgvideo)\\.com\\//.test(s)) {\n` +
                            `          const r = s.replace(/(?:https?:)?\\/\\/.*?\\//, Replacement);\n` +
                            `          input = typeof input === 'string' ? r : new Request(r, input);\n` +
                            `        }\n` +
                            `      } catch (_) {}\n` +
                            `      return Ofetch(input, init);\n` +
                            `    };\n` +
                            `    if (self.XMLHttpRequest) {\n` +
                            `      const OX = self.XMLHttpRequest;\n` +
                            `      class X extends OX {\n` +
                            `        open(m, u, a, usr, pwd) {\n` +
                            `          try {\n` +
                            `            if (typeof u === 'string' && /(?:https?:)?\\/\\/[^/]+\\.(?:bilivideo|acgvideo)\\.com\\//.test(u)) {\n` +
                            `              u = u.replace(/(?:https?:)?\\/\\/.*?\\//, Replacement);\n` +
                            `            }\n` +
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
                        log('Worker Blob prelude injected')
                        return blob
                    }
                } catch (e) { log('Blob prelude inject failed:', e) }
                return new OriginalBlob(parts, options)
            }
        } catch (err) {
            log('Install Worker Blob hook failed:', err)
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
                        `  try {\n` +
                        `    const Ofetch = self.fetch;\n` +
                        `    self.fetch = (input, init) => {\n` +
                        `      try { const s = typeof input === 'string' ? input : (input && input.url);\n` +
                        `        if (typeof s === 'string' && /(?:https?:)?\\/\\/[^/]+\\.(?:bilivideo|acgvideo)\\.com\\//.test(s)) {\n` +
                        `          const r = s.replace(/(?:https?:)?\\/\\/.*?\\//, Replacement);\n` +
                        `          input = typeof input === 'string' ? r : new Request(r, input); }\n` +
                        `      } catch (_) {}\n` +
                        `      return Ofetch(input, init);\n` +
                        `    };\n` +
                        `    if (self.XMLHttpRequest) {\n` +
                        `      const OX = self.XMLHttpRequest;\n` +
                        `      class X extends OX { open(m,u,a,usr,pwd){\n` +
                        `        try { if (typeof u === 'string' && /(?:https?:)?\\/\\/[^/]+\\.(?:bilivideo|acgvideo)\\.com\\//.test(u)) u = u.replace(/(?:https?:)?\\/\\/.*?\\//, Replacement); } catch(_){}\n` +
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
                    log('Worker URL wrapped:', { original: String(scriptURL), type: isModule ? 'module' : 'classic' })
                    return new OriginalWorker(url, options)
                } catch (e) {
                    log('Worker wrap failed, fallback:', e)
                    return new OriginalWorker(scriptURL, options)
                }
            }
        } catch (e) {
            log('Install Worker(URL) wrapper failed:', e)
        }
    }

    // Hook Bilibili PlayUrl Api
    interceptNetResponse((response, url) => {
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

            log('(Intercepted) playurl api response.')
            const responseText = response
            const playInfo = JSON.parse(responseText)
            playInfoTransformer(playInfo)
            return JSON.stringify(playInfo)
        }
    });

    interceptNetResponse((response, url) => {
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
        if (/\/xlive\/web-room\/v\d+\/index\/getRoomPlayInfo$/.test(p) ||
            /\/room\/v1\/Room\/playUrl$/.test(p)
        ) {
            if (!isLiveRoomPage()) return
            if (response === null) {
                const now = Date.now()
                if (!interceptNetResponse._lastLiveReq || now - interceptNetResponse._lastLiveReq.t > 4000 || interceptNetResponse._lastLiveReq.p !== p) {
                    interceptNetResponse._lastLiveReq = { t: now, p }
                    log('Live playurl request matched:', { url: u.href })
                }
                return true
            }
            log('(Intercepted) live playurl api response:', { url: u.href })
            const responseText = response
            const playInfo = JSON.parse(responseText)
            livePlayInfoTransformer(playInfo)
            return JSON.stringify(playInfo)
        }
    })

    // 在番剧页安装对字符串插入 HTML 的钩子，覆盖 inner window 等非 fetch/XHR 的场景
    if (location.href.startsWith('https://www.bilibili.com/bangumi/play/')) {
        try {
            const origWrite = Document.prototype.write
            Document.prototype.write = function (...args) {
                try {
                    args = args.map(s => typeof s === 'string' ? replaceBilivideoInHtml(s) : s)
                } catch (_) {}
                return origWrite.apply(this, args)
            }

            const origInsertAdjacentHTML = Element.prototype.insertAdjacentHTML
            Element.prototype.insertAdjacentHTML = function (position, html) {
                try {
                    if (typeof html === 'string') html = replaceBilivideoInHtml(html)
                } catch (_) {}
                return origInsertAdjacentHTML.call(this, position, html)
            }

            const innerDesc = Object.getOwnPropertyDescriptor(Element.prototype, 'innerHTML')
            if (innerDesc && innerDesc.set && innerDesc.get) {
                Object.defineProperty(Element.prototype, 'innerHTML', {
                    configurable: true,
                    get() { return innerDesc.get.call(this) },
                    set(v) {
                        try { if (typeof v === 'string') v = replaceBilivideoInHtml(v) } catch (_) {}
                        return innerDesc.set.call(this, v)
                    }
                })
            }
            log('已安装 HTML 字符串替换钩子（bangumi）')
        } catch (e) {
            log('安装 HTML 替换钩子失败:', e)
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
                log('CDN selector added')
            });
    }

    const existingLiveControls = document.querySelector('#ccb-live-controls')
    if (existingLiveControls) existingLiveControls.remove()
})();
