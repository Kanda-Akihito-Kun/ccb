// ==UserScript==
// @name         Custom CDN of Bilibili (CCB) - 修改哔哩哔哩的视频播放源
// @namespace    CCB
// @license      MIT
// @version      0.0.1
// @description  修改哔哩哔哩的视频播放源
// @author       鼠鼠今天吃嘉然
// @run-at       document-start
// @match        https://www.bilibili.com/video/*
// @match        https://www.bilibili.com/bangumi/play/*
// @match        https://www.bilibili.com/festival/*
// @connect      cherrynmsl.sbs
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        unsafeWindow
// ==/UserScript==

const api = 'http://cherrynmsl.sbs:8080'

// 日志输出函数
const PluginName = 'CCB'
const log = console.log.bind(console, `[${PluginName}]:`)

const defaultCdnNode = '使用默认源'
var cdnNodeStored = 'CCB'
var regionStored = 'region'

// 获取当前节点名称
const getCurCdnNode = () => {
    return GM_getValue(cdnNodeStored, cdnList[0])
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

// 判断 CCB 是否启用
const isCcbEnabled = () => {
    return getCurCdnNode() !== defaultCdnNode
}

// 替换播放源
const Replacement = (() => {
    const toURL = ((url) => {
        if (url.indexOf('://') === -1) {
            url = 'https://' + url
            return url.endsWith('/') ? url : `${url}/`
        }
    })

    let domain = getCurCdnNode()

    log(`播放源已修改为: ${domain}`)

    return toURL(domain)
})()

// 地区列表
var regionList = ['-']
const getRegionList = async () => {
    try {
        const response = await new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url: `${api}/region`,
                headers: {
                    'Content-Type': 'application/json'
                },
                onload: (response) => resolve(response),
                onerror: (error) => reject(error)
            });
        });

        const data = JSON.parse(response.responseText);

        // 确保返回数据中包含该地区的数据
        if (data.data && Array.isArray(data.data)) {
            // 保留默认节点，并添加新的 CDN 列表
            regionList = ["-", ...data.data];
            log(`已更新地区列表: ${data.data}`);
        } else {
            log(`未找到地区数据`);
        }
    } catch (error) {
        log('获取地区列表失败:', error);
    }
}

const getCdnListByRegion = async (region) => {
    try {
        if (region === '-') {
            cdnList = [defaultCdnNode, ...initCdnList];
        }

        const response = await new Promise((resolve, reject) => {
            GM_xmlhttpRequest({
                method: 'GET',
                url: `${api}/cdn?region=${region}`,
                headers: {
                    'Content-Type': 'application/json',
                    'Accept-Charset': 'utf-8'
                },
                onload: (response) => resolve(response),
                onerror: (error) => reject(error)
            });
        });

        const data = JSON.parse(response.responseText);
        // 确保返回数据中包含该地区的数据
        if (data.data && Array.isArray(data.data)) {
            // 保留默认节点，并添加新的 CDN 列表
            cdnList = [defaultCdnNode, ...data.data];

            // 更新 CDN 选择器的选项
            const cdnSelect = document.querySelector('.bpx-player-ctrl-setting-checkbox select:last-child');
            if (cdnSelect) {
                cdnSelect.innerHTML = cdnList.map(cdn =>
                    `<option value="${cdn}"${cdn === GM_getValue(cdnNodeStored, cdnList[0]) ? ' selected' : ''}>${cdn}</option>`
                ).join('');
            }
            log(`已更新 ${region} 地区的 CDN 列表`);
        } else {
            log(`未找到 ${region} 地区的 CDN 数据`);
        }
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
        i.baseUrl = newUrl; i.base_url = newUrl
    };
    const durlTransformer = i => { i.url = i.url.replace(/https:\/\/.*?\//, Replacement) };

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
        video_info.dash.video.forEach(urlTransformer)
        video_info.dash.audio.forEach(urlTransformer)
    } catch (err) {
        if (video_info.durl) { // 充电专属视频
            log('accept_description:', video_info.accept_description?.join(', '))
            video_info.durl.forEach(durlTransformer)
        } else {
            log('ERR:', err)
        }
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

const waitForElm = (selector) => new Promise(resolve => {
    let ele = document.querySelector(selector)
    if (ele) return resolve(ele)

    const observer = new MutationObserver(mutations => {
        let ele = document.querySelector(selector)
        if (ele) {
            observer.disconnect()
            resolve(ele)
        }
    })

    observer.observe(document.documentElement, {
        childList: true,
        subtree: true
    })

    log('waitForElm, MutationObserver started.')
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

    // Hook Bilibili PlayUrl Api
    interceptNetResponse((response, url) => {
        if (!isCcbEnabled()) return
        if (url.startsWith('https://api.bilibili.com/x/player/wbi/playurl') ||
            url.startsWith('https://api.bilibili.com/pgc/player/web/v2/playurl') ||
            url.startsWith('https://api.bilibili.com/x/player/playurl') ||
            url.startsWith('https://api.bilibili.com/pgc/player/web/playurl') ||
            url.startsWith('https://api.bilibili.com/pugv/player/web/playurl') // at /cheese/
        ) {
            if (response === null) return true // the url is handleable

            log('(Intercepted) playurl api response.')
            const responseText = response
            const playInfo = JSON.parse(responseText)
            playInfoTransformer(playInfo)
            return JSON.stringify(playInfo)
        }
    });

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
    if (location.href.startsWith('https://www.bilibili.com/video/') || location.href.startsWith('https://www.bilibili.com/bangumi/play/') || location.href.startsWith('https://www.bilibili.com/festival/')) {
        waitForElm('#bilibili-player > div > div > div.bpx-player-primary-area > div.bpx-player-video-area > div.bpx-player-control-wrap > div.bpx-player-control-entity > div.bpx-player-control-bottom > div.bpx-player-control-bottom-left')
            .then(async settingsBar => {

                // 先获取地区列表
                await getRegionList();
                // 根据之前保存的地区信息加载 CDN 列表
                await getCdnListByRegion(GM_getValue(regionStored, regionList[0]))

                const regionSelector = fromHTML(`
                    <div class="bpx-player-ctrl-setting-checkbox" style="margin-left: 10px; display: flex;">
                        <select class="bui-select" style="background: #2b2b2b; color: white; border: 1px solid #444; padding: 2px 5px; border-radius: 4px; width: 60px; height: 22px; font-size: 12px;">
                            ${regionList.map(region => `<option value="${region}"${region === GM_getValue(regionStored, regionList[0]) ? ' selected' : ''}>${region}</option>`).join('')}
                        </select>
                    </div>
                `)

                // 监听地区选择框, 一旦改变就保存最新信息并获取该地区的 CDN 列表
                const regionNode = regionSelector.querySelector('select')
                regionNode.addEventListener('change', async (e) => {
                    const selectedRegion = e.target.value
                    GM_setValue(regionStored, selectedRegion)
                    // 请求该地区的 CDN 列表
                    await getCdnListByRegion(selectedRegion)
                })

                // 添加 CDN 选择下拉列表
                const cdnSelector = fromHTML(`
                    <div class="bpx-player-ctrl-setting-checkbox" style="margin-left: 10px; display: flex;">
                        <select class="bui-select" style="background: #2b2b2b; color: white; border: 1px solid #444; padding: 2px 5px; border-radius: 4px; width: 150px; height: 22px; font-size: 12px;">
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

                settingsBar.appendChild(regionNode)
                settingsBar.appendChild(cdnSelector)
                log('CDN selector added')
            });
    }
})();