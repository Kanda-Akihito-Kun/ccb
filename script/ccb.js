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

// 获取当前节点名称
const getCurCdnNode = () => {
    return GM_getValue(cdnNodeStored, cdnList[0])
}

// 获取强力模式状态
const getPowerMode = () => {
    return GM_getValue(powerModeStored, false)
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
        const cdnSelect = document.querySelector('.bpx-player-ctrl-setting-checkbox select:last-child');
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
        const currentMode = getPowerMode()
        const statusIcon = currentMode ? '⚡' : '❎'
        const statusText = currentMode ? '开启' : '关闭'
        const menuText = `${statusIcon} 强力模式 (当前${statusText}，点击此处进行切换)`
        
        GM_registerMenuCommand(menuText, () => {
            const newMode = !getPowerMode()
            GM_setValue(powerModeStored, newMode)
            
            const newStatusText = newMode ? '开启' : '关闭'
            const newStatusIcon = newMode ? '⚡' : '❎'
            
            // 添加日志输出
            log(`强力模式已${newStatusText} ${newStatusIcon}`)
            
            const description = newMode 
                ? '强力模式已开启。\n当前会强行指定节点，即使遇到视频加载失败也不自动切换。\n如遇视频加载失败或严重卡顿，请关闭该模式。' 
                : '强力模式已关闭。\n当前只会修改主要CDN节点，保持备用节点不变。\n如需强制指定节点，请确保节点有效后再进行开启。'
            
            alert(`ℹ ${newStatusText}强力模式\n\n${description}\n\n页面将自动刷新以使设置生效...`)
            
            location.reload()
        })
    }
    
    // 初始化菜单命令
    updateMenuCommand()

    // Hook Bilibili PlayUrl Api
    interceptNetResponse((response, url) => {
        if (!isCcbEnabled()) return
        if (url.startsWith('https://api.bilibili.com/x/player/wbi/playurl') ||
            url.startsWith('https://api.bilibili.com/pgc/player/web/v2/playurl') ||
            url.startsWith('https://api.bilibili.com/x/player/playurl') ||
            url.startsWith('https://api.bilibili.com/x/player/online') ||
            url.startsWith('https://api.bilibili.com/x/player/wbi') ||
            url.startsWith('https://api.bilibili.com/pgc/player/web/playurl') ||
            url.startsWith('https://api.bilibili.com/pugv/player/web/playurl') // at /cheese/
        ) {
            if (response === null) return true

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
                        <select class="bui-select" style="background: #2b2b2b; color: white; border: 1px solid #444; padding: 2px 5px; border-radius: 4px; width: 60px; height: 22px; font-size: 12px;">
                            ${regionList.map(region => `<option value="${region}"${region === GM_getValue(regionStored, regionList[0]) ? ' selected' : ''}>${region}</option>`).join('')}
                        </select>
                    </div>
                `)

                // 监听地区选择框, 一旦改变就保存最新信息并获取该地区的 CDN 列表
                const regionNode = regionSelector.querySelector('select')

                // CDN 选择下拉列表
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
                
                // 创建自定义CDN输入框
                const currentCdn = GM_getValue(cdnNodeStored, '')
                const customCdnInput = fromHTML(`
                    <div class="bpx-player-ctrl-setting-checkbox" style="margin-left: 10px; display: none;">
                        <input type="text" placeholder="${currentCdn}" style="background: #2b2b2b; color: white; border: 1px solid #444; padding: 2px 5px; border-radius: 4px; width: 150px; height: 22px; font-size: 12px; box-sizing: border-box;">
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
})();