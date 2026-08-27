// ==UserScript==
// @name         Custom CDN of Bilibili (CCB) - 智能测速版
// @description  CCB GitHub 动态节点、持续能力测速与按视频智能选线
// @namespace    CCB
// @license      MIT
// @version      2.5.0-auto.1
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
// @connect      raw.githubusercontent.com
// @connect      bilivideo.com
// @connect      bilivideo.cn
// @connect      acgvideo.com
// @connect      acgvideo.cn
// @connect      akamaized.net
// @connect      edge.mountaintoys.cn
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @grant        unsafeWindow
// ==/UserScript==

;(() => {
    const nodeCatalogSources = Object.freeze([
        Object.freeze({ id: 'github-raw', label: 'GitHub main/data', base: 'https://raw.githubusercontent.com/Kanda-Akihito-Kun/ccb/main/data' }),
        Object.freeze({ id: 'github-pages', label: 'GitHub Pages 兜底', base: 'https://kanda-akihito-kun.github.io/ccb/api' }),
    ])
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
    const autoModeStored = 'CCB_auto_mode'
    const autoHealthStored = 'CCB_auto_health_v3'
    const autoLastGoodStored = 'CCB_auto_last_good_v3'
    const fullBenchmarkStored = 'CCB_full_benchmark_v2'
    const autoModeOff = 'off'
    const autoModeAdaptive7 = '7'
    // 两份缓存分开存,避免多标签页同时写同一个键时互相覆盖
    const regionCacheStored = 'CCB_datacache_region'
    const cdnCacheStored = 'CCB_datacache_cdn'
    // 多标签页共用同一份统计,靠 frameId 分键和 60 秒新鲜度窗口限制串扰
    const statsStored = 'CCB_stats'

    // 这些只是在用户尚未运行全节点测速时使用的兼容回退；完成测速后由本机完整排名取代。
    // prior 是保守先验，不把一次跑分误当成长期保证。
    const autoProfiles = Object.freeze({
        'upos-sz-mirrorcosov.bilivideo.com': Object.freeze({ family: 'mirror-cosov', prior: 0.93, benchmarkMbps: 55.22, benchmarkTtfbMs: 125 }),
        'cn-bj-se-01-06.bilivideo.com': Object.freeze({ family: 'bj-se', prior: 0.95, benchmarkMbps: 6.95, benchmarkTtfbMs: 922 }),
        'upos-sz-mirrorzos.bilivideo.com': Object.freeze({ family: 'mirror-zos', prior: 0.90, benchmarkMbps: 6.90, benchmarkTtfbMs: 900 }),
        'ec-jssz-ct-01-02.bilivideo.com': Object.freeze({ family: 'jssz-ct', prior: 0.88, benchmarkMbps: 6.80, benchmarkTtfbMs: 950 }),
        'cn-hk-eq-01-14.bilivideo.com': Object.freeze({ family: 'hk-eq', prior: 0.76, benchmarkMbps: 6.85, benchmarkTtfbMs: 950 }),
        'cn-zjjh-ct-04-34.bilivideo.com': Object.freeze({ family: 'zjjh-ct', prior: 0.82, benchmarkMbps: 6.70, benchmarkTtfbMs: 980 }),
        'cn-gdgz-gd-01-01.bilivideo.com': Object.freeze({ family: 'gdgz-gd', prior: 0.82, benchmarkMbps: 2.00, benchmarkTtfbMs: 1050 }),
        'cn-gddg-ct-01-21.bilivideo.com': Object.freeze({ family: 'gddg-ct', prior: 0.82, benchmarkMbps: 2.00, benchmarkTtfbMs: 1050 }),
        'cn-sdjn-fx-01-02.bilivideo.com': Object.freeze({ family: 'sdjn-fx', prior: 0.82, benchmarkMbps: 2.00, benchmarkTtfbMs: 1100 }),
        'cn-hbwh-cm-01-16.bilivideo.com': Object.freeze({ family: 'hbwh-cm', prior: 0.80, benchmarkMbps: 2.00, benchmarkTtfbMs: 1100 }),
    })
    const autoCoreNodes = Object.freeze([
        'upos-sz-mirrorcosov.bilivideo.com',
        'cn-bj-se-01-06.bilivideo.com',
        'upos-sz-mirrorzos.bilivideo.com',
        'ec-jssz-ct-01-02.bilivideo.com',
    ])
    const autoRotatingNodes = Object.freeze([
        'cn-hk-eq-01-14.bilivideo.com',
        'cn-zjjh-ct-04-34.bilivideo.com',
        'cn-gdgz-gd-01-01.bilivideo.com',
        'cn-gddg-ct-01-21.bilivideo.com',
        'cn-sdjn-fx-01-02.bilivideo.com',
        'cn-hbwh-cm-01-16.bilivideo.com',
    ])
    const autoResultTtlMs = 30 * 60 * 1000
    const autoLastGoodTtlMs = 6 * 60 * 60 * 1000
    const autoHealthTtlMs = 30 * 24 * 60 * 60 * 1000
    const autoCooldownMs = 10 * 60 * 1000
    const autoReachabilityTimeoutMs = 1800
    const autoScreenTimeoutMs = 3600
    const autoScreenBytes = 256 * 1024
    const autoScreenFinalistCount = 4
    const autoSustainedTimeoutMs = 8000
    const autoSustainedBytes = 1024 * 1024
    const autoSustainedFinalistCount = 3
    const autoSwitchGain = 1.25
    const autoBitrateHeadroom = 1.50
    const autoFallbackRequiredMbps = 3
    const fullBenchmarkVersion = 2
    const fullBenchmarkReachRounds = 2
    const fullBenchmarkSpeedRounds = 1
    const fullBenchmarkSpeedBytes = 64 * 1024
    const fullBenchmarkDeepCount = 20
    const fullBenchmarkDeepRounds = 2
    const fullBenchmarkDeepBytes = 1024 * 1024
    const fullBenchmarkReachConcurrency = 18
    const fullBenchmarkSpeedConcurrency = 8
    const fullBenchmarkDeepConcurrency = 1
    const fullBenchmarkReachTimeoutMs = 2200
    const fullBenchmarkSpeedTimeoutMs = 3600
    const fullBenchmarkDeepTimeoutMs = 9000
    const nodeCatalogRefreshMs = 6 * 60 * 60 * 1000
    const catalogRequestTimeoutMs = 8000

    const autoResultsByMediaKey = new Map()
    const autoInflightByMediaKey = new Map()
    const autoFailuresByMediaKey = new Map()
    const autoStatusListeners = new Set()
    let autoLatestResult = null
    let autoGeneration = 0
    let autoStatus = { state: 'idle', message: '等待当前视频地址' }
    const benchmarkStatusListeners = new Set()
    const catalogStatusListeners = new Set()
    let benchmarkStatus = { state: 'idle', phase: '', completed: 0, total: 0, message: '尚未开始全节点测速' }
    let catalogStatus = { state: 'idle', message: '等待同步 GitHub 节点目录' }
    let benchmarkRun = null
    let autoProbeRun = null
    let catalogRefreshPromise = null
    let latestBenchmarkSourceUrl = ''
    let nodeCatalogMeta = { source: '', sourceLabel: '', fetchedAt: 0, upstreamUpdatedAt: 0, fingerprint: '', nodeCount: 0 }
    let fullBenchmarkCache = null
    let fullBenchmarkLoaded = false
    let fullBenchmarkIndex = null
    const ccbWorkerPorts = new Set()
    const ccbInjectedWorkerBlobs = new WeakSet()
    const ccbInjectedWorkerUrls = new Set()

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
    const normalizeAutoMode = (value) => {
        const mode = String(value || autoModeOff)
        // 2.2.0 的 10/20 档自动迁移到新的 7 节点自适应档，旧设置不会失效。
        return mode === autoModeAdaptive7 || mode === '10' || mode === '20' ? autoModeAdaptive7 : autoModeOff
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
    const getAutoMode = () => getCcbConfig().autoMode

    function getCcbConfig() {
        const contextKey = getContextKey()
        if (ccbConfigCache && ccbConfigCache.contextKey === contextKey) return ccbConfigCache

        const storedNode = getTargetCdnNode(contextKey)
        // 存储被写坏时退回默认源，避免后续字符串操作抛错
        const node = typeof storedNode === 'string' ? storedNode : defaultCdnNode
        const region = getRegion(contextKey)
        const powerMode = GM_getValue(powerModeStored, true)
        const liveMode = GM_getValue(liveModeStored, false)
        const autoMode = contextKey === 'main'
            ? normalizeAutoMode(GM_getValue(autoModeStored, autoModeOff))
            : autoModeOff
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
        ccbConfigCache = { contextKey, node, region, powerMode, liveMode, autoMode, replacement, replacementNoSlash, replacementHost }
        return ccbConfigCache
    }

    const isAutoModeEnabled = () => getContextKey() === 'main' && getAutoMode() !== autoModeOff
    const isAutoResultFresh = (result) => !!result
        && typeof result.node === 'string'
        && result.node
        && Number.isFinite(result.selectedAt)
        && Date.now() - result.selectedAt >= 0
        && Date.now() - result.selectedAt < autoResultTtlMs
    const autoResultCoversBitrate = (result, requiredMbps) => {
        if (!isAutoResultFresh(result) || result.provisional) return false
        const required = Math.max(1, Number(requiredMbps) || autoFallbackRequiredMbps)
        const testedFor = Math.max(0, Number(result.requiredMbps) || 0)
        // 同一码率即使没有合格节点也复用结果，避免每次播放事件都重新测速。
        if (testedFor > 0 && Math.abs(testedFor - required) / required <= 0.02) return true
        const sustained = Math.max(0, Number(result.sustainedMbps) || Number(result.mbps) || 0)
        return !!result.verifiedSustained
            && sustained >= required * autoBitrateHeadroom
            && Number(result.stability) >= 0.45
    }
    const getAutoMediaKey = (raw) => {
        if (typeof raw !== 'string' || !raw) return ''
        try {
            const pathname = new URL(raw, location.href).pathname || ''
            if (!pathname || pathname === '/') return ''
            const slash = pathname.lastIndexOf('/')
            const directory = slash >= 0 ? pathname.slice(0, slash + 1) : ''
            return directory && directory !== '/' ? directory : pathname
        } catch (_) {
            return ''
        }
    }
    const getAutoResultForUrl = (raw) => {
        const key = getAutoMediaKey(raw)
        if (!key) return null
        const result = autoResultsByMediaKey.get(key)
        if (isAutoResultFresh(result)) return result
        if (result) autoResultsByMediaKey.delete(key)
        return null
    }
    const getAutoSelectedNode = (raw) => {
        if (!isAutoModeEnabled()) return ''
        if (typeof raw === 'string' && raw && raw.includes('/')) {
            const key = getAutoMediaKey(raw)
            if (key) {
                const exact = getAutoResultForUrl(raw)
                return exact ? exact.node : ''
            }
        }
        return isAutoResultFresh(autoLatestResult) ? autoLatestResult.node : ''
    }
    const getEffectiveNode = (raw) => getAutoSelectedNode(raw) || getCcbConfig().node
    const getReplacementParts = (raw) => {
        const node = getEffectiveNode(raw)
        const config = getCcbConfig()
        if (node === config.node) return config
        let replacement = node
        if (replacement.indexOf('://') === -1) replacement = 'https://' + replacement
        if (!replacement.endsWith('/')) replacement += '/'
        const replacementNoSlash = replacement.endsWith('/') ? replacement.slice(0, -1) : replacement
        let replacementHost = ''
        try { replacementHost = new URL(replacement).host } catch (_) {}
        return { node, replacement, replacementNoSlash, replacementHost }
    }
    const isCcbEnabled = () => isAutoModeEnabled() || getCcbConfig().node !== defaultCdnNode
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

    const shouldApplyReplacement = (raw) => {
        const config = getCcbConfig()
        if (getEffectiveNode(raw) === defaultCdnNode) return false
        if (location.host === liveHost) {
            if (!isLiveRoomPage()) return false
            if (!config.liveMode) return false
        }
        return true
    }

    const shouldInstallWorkerHooks = () => {
        if (!isCcbEnabled()) return false
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

    const getReplacement = (raw) => getReplacementParts(raw).replacement

    const getReplacementNoSlash = (raw) => getReplacementParts(raw).replacementNoSlash

    const getReplacementHost = (raw) => getReplacementParts(raw).replacementHost

    const statsFreshMs = 60000
    const statsFlushMs = 2000
    const isTopFrame = window.top === window
    const ccbFrameId = Math.random().toString(36).slice(2)
    // 页面框架和 Worker 都回传到各自 frame 的统计桶，面板再汇总最近 60 秒的数据。
    const ccbRewriteStats = { host: null, count: 0, at: 0 }
    const ccbWorkerRuntimeChannelName = `CCB_WORKER_RUNTIME_${ccbFrameId}`
    let ccbWorkerRuntimeChannel = null
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

    const getHostFromRewrittenValue = (value) => {
        if (typeof value !== 'string') return ''
        const match = /^(?:https?:)?\/\/([\w.-]+)|^([\w.-]+)(?:\/|$)/i.exec(value)
        return String(match && (match[1] || match[2]) || '').toLowerCase()
    }

    const recordRewriteStats = (host, count) => {
        const added = Math.max(0, Number(count) || 0)
        ccbRewriteStats.count += added
        if (host) ccbRewriteStats.host = host
        if (added) ccbRewriteStats.at = Date.now()
        if (!isTopFrame && !statsFlushTimer) statsFlushTimer = setTimeout(flushRewriteStats, statsFlushMs)
    }

    // 改写路径上只累加内存计数，写存储由一次性定时器合并。
    const countRewrite = (before, after) => {
        if (after === before) return after
        recordRewriteStats(getHostFromRewrittenValue(after), 1)
        return after
    }

    try {
        if (typeof BroadcastChannel === 'function') {
            ccbWorkerRuntimeChannel = new BroadcastChannel(ccbWorkerRuntimeChannelName)
            ccbWorkerRuntimeChannel.addEventListener('message', (event) => {
                const data = event && event.data
                if (!data || data.type !== 'ccb-worker-rewrite') return
                recordRewriteStats(getHostFromRewrittenValue(data.host), data.count)
            })
        }
    } catch (_) {}

    const readAggregateStats = () => {
        const now = Date.now()
        const { store, malformed } = readStatsStore()
        const pruned = pruneStatsStore(store, now) || malformed
        let count = ccbRewriteStats.count
        let freshestTs = ccbRewriteStats.at || 0
        let freshestHost = ccbRewriteStats.host || ''
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
        return { count, host: freshestHost, at: freshestTs }
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
        const replacement = getReplacement(s)
        const replacementHost = getReplacementHost(s)
        if (s.startsWith('http://') || s.startsWith('https://')) out = s.replace(/^https?:\/\/.*?\//, replacement)
        else if (s.startsWith('//')) out = s.replace(/^\/\/.*?\//, replacement.replace(/^https?:/, ''))
        else if (/^[^/]+\//.test(s)) out = s.replace(/^[^/]+\//, `${replacementHost}/`)
        return countRewrite(s, out)
    }

    const replaceMediaUrlUnchecked = (s) => {
        if (isIgnoredHost(s)) return s
        return replaceMediaUrlCore(s)
    }

    const replaceMediaUrl = (s) => {
        if (typeof s !== 'string') return s
        if (!shouldApplyReplacement(s)) return s
        if (!hasMediaDomain(s)) return s

        if (isIgnoredHost(s)) return s
        return replaceMediaUrlCore(s)
    }

    const replaceMediaUrlWithCandidate = (s, candidate) => {
        if (typeof s !== 'string' || !candidate || candidate.isOriginal || !candidate.node) return s
        const replacement = `https://${candidate.node}/`
        let out = s
        if (s.startsWith('http://') || s.startsWith('https://')) out = s.replace(/^https?:\/\/.*?\//, replacement)
        else if (s.startsWith('//')) out = s.replace(/^\/\/.*?\//, replacement.replace(/^https?:/, ''))
        else if (/^[^/]+\//.test(s)) out = s.replace(/^[^/]+\//, `${candidate.node}/`)
        return countRewrite(s, out)
    }

    const replaceMediaHostValueCore = (s) => {
        let out = s
        if (s.startsWith('http://') || s.startsWith('https://')) out = getReplacementNoSlash(s)
        else if (s.startsWith('//')) out = getReplacementNoSlash(s).replace(/^https?:/, '')
        else if (/^[^/]+$/.test(s)) out = getReplacementHost(s)
        return countRewrite(s, out)
    }

    const replaceMediaHostValueUnchecked = (s) => {
        if (isIgnoredHost(s)) return s
        return replaceMediaHostValueCore(s)
    }

    const replaceMediaHostValue = (s) => {
        if (typeof s !== 'string') return s
        if (!shouldApplyReplacement(s)) return s
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
            } else if (Array.isArray(v) && (k === 'backup_url' || k === 'backupUrl')) {
                let autoResult = null
                if (isAutoModeEnabled()) {
                    for (const item of v) {
                        if (typeof item !== 'string') continue
                        autoResult = getAutoResultForUrl(item)
                        if (autoResult) break
                    }
                    if (!autoResult && isAutoResultFresh(autoLatestResult)) autoResult = autoLatestResult
                }
                const autoBackups = autoResult && Array.isArray(autoResult.backups) ? autoResult.backups : []
                if (!autoBackups.length && !getPowerMode()) continue
                for (let i = 0; i < v.length; i++) {
                    const s = v[i]
                    if (typeof s === 'string') {
                        if (!hasMediaDomain(s)) continue
                        v[i] = autoBackups.length
                            ? replaceMediaUrlWithCandidate(s, autoBackups[i % autoBackups.length])
                            : replaceMediaUrlUnchecked(s)
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

    const PLAYURL_PATH_RE = /(?:\/x\/player\/wbi\/playurl|\/x\/player\/playurl|\/pgc\/player\/web\/playurl|\/pgc\/player\/web\/v2\/playurl|\/pgc\/player\/api\/playurl|\/pugv\/player\/web\/playurl|\/ogv\/player\/playview)/
    const autoFailureRetryMs = 60 * 1000
    const clockNow = () => (typeof performance !== 'undefined' && typeof performance.now === 'function')
        ? performance.now()
        : Date.now()

    const emitAutoStatus = (state, message, detail) => {
        autoStatus = { state, message, detail: detail || null, at: Date.now() }
        for (const listener of [...autoStatusListeners]) {
            try { listener(autoStatus) } catch (_) { autoStatusListeners.delete(listener) }
        }
    }

    const cancelAutoProbeRun = () => {
        const controller = autoProbeRun
        if (!controller || controller.cancelled) return
        controller.cancelled = true
        for (const request of [...controller.requests]) {
            try { request.abort() } catch (_) {}
        }
        controller.requests.clear()
        if (autoProbeRun === controller) autoProbeRun = null
    }

    const clearAutoSelections = (message) => {
        cancelAutoProbeRun()
        autoGeneration++
        autoResultsByMediaKey.clear()
        autoInflightByMediaKey.clear()
        autoFailuresByMediaKey.clear()
        autoLatestResult = null
        invalidateCcbCaches()
        emitAutoStatus('idle', message || '等待当前视频地址')
    }

    const extractAutoMediaUrls = (root) => {
        const urls = []
        const urlSet = new Set()
        const seen = new WeakSet()
        const add = (value) => {
            if (typeof value !== 'string' || !hasMediaDomain(value)) return
            if (!(value.startsWith('http://') || value.startsWith('https://') || value.startsWith('//'))) return
            try {
                const parsed = new URL(value, location.href)
                if (!parsed.pathname || parsed.pathname === '/') return
            } catch (_) {
                return
            }
            if (!urlSet.has(value)) {
                urlSet.add(value)
                urls.push(value)
            }
        }
        const visit = (value, depth) => {
            if (urls.length >= 64 || depth > 12 || value === null || value === void 0) return
            if (typeof value === 'string') {
                add(value)
                return
            }
            if (typeof value !== 'object') return
            if (seen.has(value)) return
            seen.add(value)
            if (Array.isArray(value)) {
                for (const item of value) visit(item, depth + 1)
                return
            }
            // 先看标准播放 URL 字段，避免庞大的 INITIAL_STATE 把无关字符串排到前面。
            for (const key of ['baseUrl', 'base_url', 'url']) {
                if (Object.prototype.hasOwnProperty.call(value, key)) visit(value[key], depth + 1)
            }
            for (const key in value) {
                if (!Object.prototype.hasOwnProperty.call(value, key)) continue
                if (key === 'baseUrl' || key === 'base_url' || key === 'url') continue
                visit(value[key], depth + 1)
            }
        }
        visit(root, 0)
        return urls
    }

    const estimateAutoRequiredMbps = (root, sourceUrl) => {
        let targetPath = ''
        try { targetPath = new URL(sourceUrl, location.href).pathname } catch (_) {}
        if (!targetPath || !root || typeof root !== 'object') return autoFallbackRequiredMbps
        const seen = new WeakSet()
        let peakBandwidth = 0
        const visit = (value, depth) => {
            if (!value || typeof value !== 'object' || depth > 12 || seen.has(value)) return
            seen.add(value)
            if (Array.isArray(value)) {
                for (const item of value) visit(item, depth + 1)
                return
            }
            const mediaUrl = value.baseUrl || value.base_url || value.url
            let mediaPath = ''
            try { mediaPath = typeof mediaUrl === 'string' ? new URL(mediaUrl, location.href).pathname : '' } catch (_) {}
            if (mediaPath && mediaPath === targetPath) {
                const bandwidth = Number(value.bandwidth || value.band_width || value.bandWidth)
                if (Number.isFinite(bandwidth) && bandwidth >= 64 * 1000 && bandwidth <= 200 * 1000 * 1000) {
                    peakBandwidth = Math.max(peakBandwidth, bandwidth)
                }
            }
            for (const key in value) {
                if (!Object.prototype.hasOwnProperty.call(value, key)) continue
                visit(value[key], depth + 1)
            }
        }
        visit(root, 0)
        if (!peakBandwidth) return autoFallbackRequiredMbps
        // 播放地址通常先命中视频流；额外预留约 0.35 Mbps 给音频与协议开销。
        return Math.max(1, Math.min(80, peakBandwidth / 1000 / 1000 + 0.35))
    }

    const autoNodeDomains = Object.freeze([
        'bilivideo.com', 'bilivideo.cn', 'acgvideo.com', 'acgvideo.cn', 'akamaized.net', 'edge.mountaintoys.cn',
    ])
    const normalizeAutoNode = (value) => {
        if (typeof value !== 'string' || !value || value === defaultCdnNode) return ''
        try {
            const parsed = new URL(value.includes('://') ? value : `https://${value}`)
            const host = parsed.hostname.toLowerCase()
            return autoNodeDomains.some(domain => host === domain || host.endsWith(`.${domain}`)) ? host : ''
        } catch (_) {
            return ''
        }
    }

    const getAutoNodeFamily = (node) => {
        const normalized = normalizeAutoNode(node)
        if (!normalized) return ''
        const profile = autoProfiles[normalized]
        if (profile && profile.family) return profile.family
        const name = normalized.split('.')[0]
        const mirror = /^upos-[^-]+-mirror(.+)$/i.exec(name)
        if (mirror) return `mirror-${mirror[1].toLowerCase()}`
        const parts = name.split('-')
        if (parts.length >= 3 && /^(?:cn|ec|hw|tx|ali)$/i.test(parts[0])) {
            return `${parts[1]}-${parts[2]}`.toLowerCase()
        }
        return `node:${normalized}`
    }

    const emitBenchmarkStatus = (next) => {
        benchmarkStatus = { ...benchmarkStatus, ...next, at: Date.now() }
        for (const listener of [...benchmarkStatusListeners]) {
            try { listener(benchmarkStatus) } catch (_) { benchmarkStatusListeners.delete(listener) }
        }
    }

    const emitCatalogStatus = (next) => {
        catalogStatus = { ...catalogStatus, ...next, at: Date.now() }
        for (const listener of [...catalogStatusListeners]) {
            try { listener(catalogStatus) } catch (_) { catalogStatusListeners.delete(listener) }
        }
    }

    const getCdnNodesFromData = (data) => {
        const nodes = []
        const seen = new Set()
        for (const list of Object.values(data || {})) {
            if (!Array.isArray(list)) continue
            for (const raw of list) {
                const node = normalizeAutoNode(raw)
                if (!node || seen.has(node)) continue
                seen.add(node)
                nodes.push(node)
            }
        }
        return nodes
    }

    const fingerprintNodeList = (nodes) => {
        const sorted = [...new Set((nodes || []).map(normalizeAutoNode).filter(Boolean))].sort()
        let hash = 2166136261
        for (const node of sorted) {
            for (let index = 0; index < node.length; index++) {
                hash ^= node.charCodeAt(index)
                hash = Math.imul(hash, 16777619)
            }
            hash ^= 10
            hash = Math.imul(hash, 16777619)
        }
        return `${sorted.length}:${(hash >>> 0).toString(16).padStart(8, '0')}`
    }

    const getBenchmarkCatalogFingerprint = (benchmark) => {
        if (!benchmark) return ''
        if (typeof benchmark.catalogFingerprint === 'string' && benchmark.catalogFingerprint) return benchmark.catalogFingerprint
        return fingerprintNodeList((benchmark.ranking || []).map(entry => entry.node))
    }

    const isBenchmarkCatalogStale = (benchmark) => !!benchmark
        && !!nodeCatalogMeta.fingerprint
        && getBenchmarkCatalogFingerprint(benchmark) !== nodeCatalogMeta.fingerprint

    const readFullBenchmark = () => {
        if (fullBenchmarkLoaded) return fullBenchmarkCache
        fullBenchmarkLoaded = true
        fullBenchmarkCache = null
        fullBenchmarkIndex = new Map()
        try {
            let value = GM_getValue(fullBenchmarkStored, null)
            if (typeof value === 'string') value = JSON.parse(value)
            if (!value || typeof value !== 'object' || value.version !== fullBenchmarkVersion
                || !Number.isFinite(value.completedAt) || !Array.isArray(value.ranking)
            ) return null
            const seen = new Set()
            const ranking = []
            for (const raw of value.ranking) {
                const node = normalizeAutoNode(raw && raw.node)
                if (!node || seen.has(node)) continue
                const sustainedP20Mbps = Math.max(0, Number(raw && raw.sustainedP20Mbps) || Number(raw && raw.p25Mbps) || 0)
                const medianSustainedMbps = Math.max(0, Number(raw && raw.medianSustainedMbps) || Number(raw && raw.medianMbps) || 0)
                const entry = {
                    ...raw,
                    node,
                    family: (raw && typeof raw.family === 'string' && raw.family) || getAutoNodeFamily(node),
                    connectionRate: Math.max(0, Math.min(1, Number(raw && raw.connectionRate) || 0)),
                    speedSuccessRate: Math.max(0, Math.min(1, Number(raw && raw.speedSuccessRate) || 0)),
                    sustainedP20Mbps,
                    medianSustainedMbps,
                    p25Mbps: sustainedP20Mbps,
                    medianMbps: medianSustainedMbps,
                    stability: Math.max(0, Math.min(1, Number(raw && raw.stability) || 0)),
                    sustainedVerified: !!(raw && raw.sustainedVerified),
                    medianTtfbMs: Math.max(0, Number(raw && raw.medianTtfbMs) || 0),
                    score: Math.max(0, Number(raw && raw.score) || 0),
                    rank: ranking.length + 1,
                }
                seen.add(node)
                ranking.push(entry)
                fullBenchmarkIndex.set(node, entry)
            }
            if (!ranking.length) return null
            fullBenchmarkCache = {
                ...value,
                ranking,
                nodeCount: Number(value.nodeCount) || ranking.length,
                sustainedVerifiedCount: ranking.filter(entry => entry.sustainedVerified).length,
            }
            return fullBenchmarkCache
        } catch (_) {
            return null
        }
    }

    const saveFullBenchmark = (value) => {
        GM_setValue(fullBenchmarkStored, value)
        fullBenchmarkLoaded = false
        fullBenchmarkCache = null
        fullBenchmarkIndex = null
        return readFullBenchmark()
    }

    const getFullBenchmarkEntry = (node) => {
        readFullBenchmark()
        return fullBenchmarkIndex && fullBenchmarkIndex.get(normalizeAutoNode(node)) || null
    }

    const makeAutoCandidate = (node, extra) => {
        const normalized = normalizeAutoNode(node)
        if (!normalized) return null
        const profile = autoProfiles[normalized] || {}
        const options = extra || {}
        const benchmark = getFullBenchmarkEntry(normalized) || {}
        const observedPrior = Number.isFinite(benchmark.connectionRate)
            ? Math.max(0.10, Math.min(0.99, benchmark.connectionRate * 0.8 + benchmark.speedSuccessRate * 0.2))
            : NaN
        return {
            node: normalized,
            family: options.family || benchmark.family || profile.family || getAutoNodeFamily(normalized),
            prior: Number.isFinite(options.prior)
                ? options.prior
                : (Number.isFinite(observedPrior) ? observedPrior : (Number.isFinite(profile.prior) ? profile.prior : 0.75)),
            benchmarkMbps: Number.isFinite(options.benchmarkMbps)
                ? options.benchmarkMbps
                : (Number(benchmark.p25Mbps) > 0 ? Number(benchmark.p25Mbps) : (Number(profile.benchmarkMbps) || 0)),
            benchmarkTtfbMs: Number.isFinite(options.benchmarkTtfbMs)
                ? options.benchmarkTtfbMs
                : (Number(benchmark.medianTtfbMs) > 0 ? Number(benchmark.medianTtfbMs) : (Number(profile.benchmarkTtfbMs) || 1000)),
            benchmarkRank: Number.isFinite(benchmark.rank) ? benchmark.rank : Infinity,
            isOriginal: !!options.isOriginal,
        }
    }

    const getOriginalCandidate = (sourceUrl) => {
        try {
            const parsed = new URL(sourceUrl, location.href)
            return makeAutoCandidate(parsed.host, {
                family: 'bili-original',
                prior: 0.90,
                isOriginal: true,
            })
        } catch (_) {
            return null
        }
    }

    const readStoredObject = (key) => {
        try {
            let value = GM_getValue(key, {})
            if (typeof value === 'string') value = JSON.parse(value)
            return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
        } catch (_) {
            return {}
        }
    }

    const readAutoHealth = () => {
        const now = Date.now()
        const store = readStoredObject(autoHealthStored)
        for (const node in store) {
            if (!Object.prototype.hasOwnProperty.call(store, node)) continue
            const entry = store[node]
            const updatedAt = entry && Number(entry.updatedAt)
            if (!entry || typeof entry !== 'object' || !Number.isFinite(updatedAt)
                || now - updatedAt < 0 || now - updatedAt > autoHealthTtlMs
            ) delete store[node]
        }
        return store
    }

    const writeAutoHealth = (store) => {
        try {
            const entries = Object.entries(store).sort((a, b) => Number(b[1].updatedAt) - Number(a[1].updatedAt))
            GM_setValue(autoHealthStored, Object.fromEntries(entries.slice(0, 40)))
        } catch (_) {}
    }

    const getNodeHealth = (node, health) => {
        const entry = health && health[node]
        return entry && typeof entry === 'object' ? entry : {}
    }

    const isNodeCooling = (node, health) => {
        const cooldownUntil = Number(getNodeHealth(node, health).cooldownUntil)
        return Number.isFinite(cooldownUntil) && cooldownUntil > Date.now()
    }

    const getCandidateReliability = (candidate, health) => {
        const prior = Math.max(0.05, Math.min(0.99, Number(candidate && candidate.prior) || 0.75))
        const entry = getNodeHealth(candidate && candidate.node, health)
        const successes = Math.max(0, Number(entry.successes) || 0)
        const failures = Math.max(0, Number(entry.failures) || 0)
        const trials = successes + failures
        if (!trials) return prior
        const observed = (successes + 2) / (trials + 4)
        const observedWeight = Math.min(0.65, trials / 12)
        return prior * (1 - observedWeight) + observed * observedWeight
    }

    const readLastGoodCandidate = (health) => {
        const value = readStoredObject(autoLastGoodStored)
        const selectedAt = Number(value.selectedAt)
        const node = normalizeAutoNode(value.node)
        if (!node || !Number.isFinite(selectedAt) || Date.now() - selectedAt < 0
            || Date.now() - selectedAt > autoLastGoodTtlMs || isNodeCooling(node, health)
        ) return null
        return makeAutoCandidate(node)
    }

    const saveLastGoodCandidate = (candidate) => {
        if (!candidate || candidate.isOriginal || !candidate.node) return
        try { GM_setValue(autoLastGoodStored, { node: candidate.node, selectedAt: Date.now() }) } catch (_) {}
    }

    const stableAutoHash = (value) => {
        let hash = 2166136261
        const text = String(value || '')
        for (let i = 0; i < text.length; i++) {
            hash ^= text.charCodeAt(i)
            hash = Math.imul(hash, 16777619)
        }
        return hash >>> 0
    }

    const pickRotatingCandidates = (mediaKey, health, count) => {
        const preferred = autoRotatingNodes.filter(node => !isNodeCooling(node, health))
        const source = preferred.length >= count ? preferred : [...preferred, ...autoRotatingNodes.filter(node => !preferred.includes(node))]
        if (!source.length) return []
        const selected = []
        const families = new Set()
        const start = stableAutoHash(mediaKey) % source.length
        for (let offset = 0; offset < source.length && selected.length < count; offset++) {
            const node = source[(start + offset) % source.length]
            const candidate = makeAutoCandidate(node)
            if (!candidate || selected.some(item => item.node === candidate.node)) continue
            if (families.has(candidate.family)) continue
            selected.push(candidate)
            families.add(candidate.family)
        }
        return selected
    }

    const pickBenchmarkCandidates = (mediaKey, health, count) => {
        const benchmark = readFullBenchmark()
        if (!benchmark) return []
        const ranked = benchmark.ranking
            .filter(entry => entry.sustainedVerified)
            .slice(0, Math.max(fullBenchmarkDeepCount, count))
            .map(entry => makeAutoCandidate(entry.node))
            .filter(Boolean)
        const available = ranked.filter(candidate => !isNodeCooling(candidate.node, health))
        const source = available.length >= count ? available : ranked
        const selected = []
        const families = new Set()
        const add = (candidate, requireNewFamily) => {
            if (!candidate || selected.some(item => item.node === candidate.node)) return false
            if (requireNewFamily && families.has(candidate.family)) return false
            selected.push(candidate)
            families.add(candidate.family)
            return true
        }

        for (const candidate of source) {
            if (selected.length >= Math.min(4, count)) break
            add(candidate, true)
        }
        const start = source.length ? stableAutoHash(mediaKey) % source.length : 0
        for (let offset = 0; offset < source.length && selected.length < count; offset++) {
            add(source[(start + offset) % source.length], true)
        }
        for (const candidate of source) {
            if (selected.length >= count) break
            add(candidate, false)
        }
        return selected
    }

    const chooseFastStartCandidate = (sourceUrl, health) => {
        const lastGood = readLastGoodCandidate(health)
        if (lastGood) return { candidate: lastGood, reason: '上次优选' }
        const manual = makeAutoCandidate(getCcbConfig().node)
        if (manual && !isNodeCooling(manual.node, health)) return { candidate: manual, reason: '手动备用' }
        return { candidate: getOriginalCandidate(sourceUrl), reason: 'B站原始源' }
    }

    const buildAutoCandidatePool = (sourceUrl, mediaKey, seed, health) => {
        const pool = []
        const push = (candidate) => {
            if (!candidate || pool.some(item => item.node === candidate.node)) return
            pool.push(candidate)
        }
        push(getOriginalCandidate(sourceUrl))
        const measured = pickBenchmarkCandidates(mediaKey, health, 6)
        for (const candidate of measured) push(candidate)
        for (const node of autoCoreNodes) push(makeAutoCandidate(node))
        for (const candidate of pickRotatingCandidates(mediaKey, health, 6)) push(candidate)

        const selected = pool.slice(0, 7)
        if (seed && !selected.some(item => item.node === seed.node)) {
            if (selected.length >= 7) selected.pop()
            selected.push(seed)
        }
        return selected
    }

    const formatAutoNode = (candidate) => {
        if (!candidate) return '未知'
        if (candidate.isOriginal) return 'B站原始源'
        return String(candidate.node || '').replace(/\.bilivideo\.(?:com|cn)$/i, '')
    }

    const buildAutoProbeUrl = (sourceUrl, candidate) => {
        const parsed = new URL(sourceUrl, location.href)
        if (!candidate.isOriginal) {
            parsed.protocol = 'https:'
            parsed.host = candidate.node
        }
        return parsed.href
    }

    const getProbeResponseBytes = (response) => {
        if (!response) return 0
        if (response.response && Number.isFinite(response.response.byteLength)) return response.response.byteLength
        if (typeof response.responseText === 'string') return response.responseText.length
        return 0
    }

    const getProbeErrorText = (response, fallback) => {
        const parts = [fallback]
        if (response) {
            parts.push(response.error)
            parts.push(response.statusText)
        }
        return parts.filter(Boolean).map(value => {
            if (value && typeof value === 'object' && value.message) return String(value.message)
            return String(value)
        }).join(' | ').slice(0, 240)
    }

    const classifyProbeFailure = (errorText, status, isHtml, bytes) => {
        if (/@connect|not a part of (?:the )?@?connect|permission|not allowed|access denied/i.test(errorText)) return 'permission'
        if (/timeout/i.test(errorText)) return 'timeout'
        if (status && status !== 200 && status !== 206) return 'http'
        if (isHtml) return 'html'
        if ((status === 200 || status === 206) && bytes <= 0) return 'empty'
        if (/abort/i.test(errorText)) return 'aborted'
        return 'network'
    }

    const samplePercentile = (values, percentile) => {
        const sorted = (values || []).filter(Number.isFinite).sort((a, b) => a - b)
        if (!sorted.length) return 0
        const index = Math.max(0, Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * percentile)))
        return sorted[index]
    }

    const calculateProbeSustainedMetrics = (samples, usedBytes, elapsedMs, burstMbps) => {
        const points = []
        for (const sample of samples || []) {
            const at = Number(sample && sample.at)
            const loaded = Math.min(usedBytes, Math.max(0, Number(sample && sample.loaded) || 0))
            if (!Number.isFinite(at)) continue
            const previous = points[points.length - 1]
            if (previous && loaded <= previous.loaded) continue
            points.push({ at, loaded })
        }
        if (!points.length || points[0].loaded > 0) points.unshift({ at: 0, loaded: 0 })
        const last = points[points.length - 1]
        if (!last || last.loaded < usedBytes) points.push({ at: Math.max(elapsedMs, last && last.at || 0), loaded: usedBytes })

        const warmupBytes = Math.min(256 * 1024, Math.max(16 * 1024, Math.floor(usedBytes * 0.25)))
        let warmupIndex = points.findIndex(point => point.loaded >= warmupBytes)
        if (warmupIndex < 0) warmupIndex = 0
        if (warmupIndex >= points.length - 1) warmupIndex = Math.max(0, points.length - 2)
        const warmup = points[warmupIndex]
        const end = points[points.length - 1]
        const tailBytes = Math.max(0, end.loaded - warmup.loaded)
        const tailMs = Math.max(1, end.at - warmup.at)
        const tailMbps = tailBytes > 0 ? tailBytes * 8 / tailMs / 1000 : burstMbps

        const windowRates = []
        let anchor = warmup
        for (let index = warmupIndex + 1; index < points.length; index++) {
            const point = points[index]
            const deltaBytes = point.loaded - anchor.loaded
            const deltaMs = point.at - anchor.at
            const isLast = index === points.length - 1
            if (!isLast && deltaBytes < 64 * 1024 && deltaMs < 180) continue
            if (deltaBytes > 0 && deltaMs >= 8) windowRates.push(deltaBytes * 8 / deltaMs / 1000)
            anchor = point
        }
        if (!windowRates.length && tailMbps > 0) windowRates.push(tailMbps)
        const lowWindowMbps = samplePercentile(windowRates, 0.20) || tailMbps || burstMbps
        const medianWindowMbps = samplePercentile(windowRates, 0.50) || tailMbps || burstMbps
        const sustainedMbps = Math.max(0, Math.min(
            lowWindowMbps || burstMbps,
            tailMbps || burstMbps,
            burstMbps || Infinity,
        ))
        const stability = medianWindowMbps > 0
            ? Math.max(0, Math.min(1, lowWindowMbps / medianWindowMbps))
            : 0
        return {
            sustainedMbps: Number.isFinite(sustainedMbps) ? sustainedMbps : 0,
            lowWindowMbps,
            medianWindowMbps,
            tailMbps,
            stability,
            windowSamples: windowRates.length,
        }
    }

    // Range 请求到达目标字节数就主动中止；即便某个 CDN 无视 Range，也不会误下载整段视频。
    const probeAutoNode = (candidate, sourceUrl, byteLimit, timeoutMs, controller) => new Promise((resolve) => {
        const startedAt = clockNow()
        let request = null
        let settled = false
        let status = 0
        let loaded = 0
        let firstByteAt = 0
        let responseHeaders = ''
        const progressSamples = [{ at: 0, loaded: 0 }]
        const recordProgress = (nextLoaded, atValue) => {
            const capped = Math.min(byteLimit, Math.max(0, Number(nextLoaded) || 0))
            const last = progressSamples[progressSamples.length - 1]
            if (!last || capped <= last.loaded || progressSamples.length >= 128) return
            const at = Number.isFinite(atValue) ? atValue : Math.max(0, clockNow() - startedAt)
            if (capped < byteLimit && capped - last.loaded < 32 * 1024 && at - last.at < 30) return
            progressSamples.push({ at, loaded: capped })
        }

        const finish = (transportOk, reason, response) => {
            if (settled) return
            settled = true
            if (controller && controller.requests && request) controller.requests.delete(request)
            const endedAt = clockNow()
            loaded = Math.max(loaded, getProbeResponseBytes(response))
            const usedBytes = Math.min(byteLimit, loaded)
            const elapsedMs = Math.max(1, endedAt - startedAt)
            recordProgress(usedBytes, elapsedMs)
            const ttfbMs = Math.max(1, (firstByteAt || endedAt) - startedAt)
            const finalStatus = Number(response && response.status) || status
            const headers = String((response && response.responseHeaders) || responseHeaders || '')
            const isHtml = /(?:^|\r?\n)content-type:\s*text\/html/i.test(headers)
            const acceptedStatus = finalStatus === 200 || finalStatus === 206
            const ok = !!transportOk && acceptedStatus && usedBytes > 0 && !isHtml
            const errorText = getProbeErrorText(response, reason)
            const burstMbps = usedBytes > 1 ? usedBytes * 8 / elapsedMs / 1000 : 0
            const sustained = calculateProbeSustainedMetrics(progressSamples, usedBytes, elapsedMs, burstMbps)
            const result = {
                ...candidate,
                ok,
                status: finalStatus,
                bytes: usedBytes,
                transferredBytes: loaded,
                elapsedMs,
                ttfbMs,
                mbps: burstMbps,
                burstMbps,
                ...sustained,
                failureType: ok ? '' : classifyProbeFailure(errorText, finalStatus, isHtml, usedBytes),
            }
            if (request && loaded >= byteLimit) {
                try { request.abort() } catch (_) {}
            }
            resolve(result)
        }

        try {
            if (controller && controller.cancelled) {
                finish(false, 'aborted')
                return
            }
            if (typeof GM_xmlhttpRequest !== 'function') {
                finish(false, 'GM_xmlhttpRequest unavailable')
                return
            }
            request = GM_xmlhttpRequest({
                method: 'GET',
                url: buildAutoProbeUrl(sourceUrl, candidate),
                headers: {
                    Range: `bytes=0-${byteLimit - 1}`,
                    'Cache-Control': 'no-cache',
                    Referer: 'https://www.bilibili.com/',
                },
                responseType: 'arraybuffer',
                timeout: timeoutMs,
                onreadystatechange: (res) => {
                    if (Number(res && res.status)) status = Number(res.status)
                    if (res && res.responseHeaders) responseHeaders = res.responseHeaders
                },
                onprogress: (res) => {
                    if (Number(res && res.status)) status = Number(res.status)
                    if (res && res.responseHeaders) responseHeaders = res.responseHeaders
                    const nextLoaded = Number(res && res.loaded) || 0
                    if (nextLoaded > 0 && !firstByteAt) firstByteAt = clockNow()
                    loaded = Math.max(loaded, nextLoaded)
                    recordProgress(loaded)
                    if (loaded >= byteLimit && (status === 200 || status === 206)) finish(true, '', res)
                },
                onload: (res) => {
                    if (!firstByteAt && getProbeResponseBytes(res) > 0) firstByteAt = clockNow()
                    finish(true, '', res)
                },
                ontimeout: (res) => finish(false, 'timeout', res),
                onerror: (res) => finish(false, 'network error', res),
                onabort: (res) => finish(false, 'aborted', res),
            })
            if (controller && controller.requests && request && !settled) controller.requests.add(request)
        } catch (error) {
            finish(false, String(error && error.message || error))
        }
    })

    const updateAutoHealth = (firstRound, secondRound) => {
        const store = readAutoHealth()
        const now = Date.now()
        const touch = (result, phase) => {
            if (!result || !result.node || result.failureType === 'permission' || result.failureType === 'aborted') return
            const entry = store[result.node] && typeof store[result.node] === 'object' ? store[result.node] : {}
            entry.successes = Math.max(0, Number(entry.successes) || 0)
            entry.failures = Math.max(0, Number(entry.failures) || 0)
            entry.failStreak = Math.max(0, Number(entry.failStreak) || 0)
            if (result.ok) {
                if (phase === 'reach') entry.successes++
                entry.failStreak = 0
                if (Number.isFinite(result.ttfbMs)) {
                    entry.ewmaTtfbMs = Number.isFinite(entry.ewmaTtfbMs)
                        ? entry.ewmaTtfbMs * 0.7 + result.ttfbMs * 0.3
                        : result.ttfbMs
                }
                if (phase === 'speed' && result.sustainedMbps > 0) {
                    entry.ewmaSustainedMbps = Number.isFinite(entry.ewmaSustainedMbps)
                        ? entry.ewmaSustainedMbps * 0.65 + result.sustainedMbps * 0.35
                        : result.sustainedMbps
                    entry.ewmaStability = Number.isFinite(entry.ewmaStability)
                        ? entry.ewmaStability * 0.65 + result.stability * 0.35
                        : result.stability
                }
                entry.cooldownUntil = 0
            } else {
                entry.failures++
                entry.failStreak++
                if (entry.failStreak >= 2) entry.cooldownUntil = now + autoCooldownMs
            }
            entry.updatedAt = now
            store[result.node] = entry
        }
        for (const result of firstRound || []) touch(result, 'reach')
        for (const result of secondRound || []) touch(result, 'speed')
        writeAutoHealth(store)
        return store
    }

    const normalizedAutoSpeed = (mbps) => Math.min(1, Math.log2(1 + Math.max(0, Number(mbps) || 0)) / Math.log2(81))
    const normalizedAutoTtfb = (ttfbMs) => 1 - Math.min(1, Math.max(0, Number(ttfbMs) || 1500) / 1500)
    const getSustainedMbps = (result) => Math.max(0, Number(result && result.sustainedMbps) || Number(result && result.mbps) || 0)

    const getExpectedCandidateSpeed = (candidate, health) => {
        const learned = Number(getNodeHealth(candidate.node, health).ewmaSustainedMbps)
        return Number.isFinite(learned) && learned > 0 ? learned : candidate.benchmarkMbps
    }

    const scoreReachableCandidate = (result, health) => (
        getCandidateReliability(result, health) * 0.55
        + normalizedAutoTtfb(result.ttfbMs) * 0.25
        + normalizedAutoSpeed(getExpectedCandidateSpeed(result, health)) * 0.20
    )

    const scoreSpeedCandidate = (result, health) => (
        normalizedAutoSpeed(getSustainedMbps(result)) * 0.50
        + Math.max(0, Math.min(1, Number(result.stability) || 0)) * 0.25
        + getCandidateReliability(result, health) * 0.20
        + normalizedAutoTtfb(result.ttfbMs) * 0.05
    )

    const summarizeProbeFailures = (results) => {
        const counts = { permission: 0, timeout: 0, network: 0, http: 0, html: 0, empty: 0, aborted: 0 }
        for (const result of results || []) {
            if (!result || result.ok) continue
            const type = Object.prototype.hasOwnProperty.call(counts, result.failureType) ? result.failureType : 'network'
            counts[type]++
        }
        return counts
    }

    const formatFailureCounts = (counts) => {
        const labels = [
            ['timeout', '超时'],
            ['network', '网络'],
            ['http', 'HTTP'],
            ['html', '内容异常'],
            ['empty', '空响应'],
            ['permission', '权限'],
        ]
        const parts = labels.filter(([key]) => counts[key] > 0).map(([key, label]) => `${label} ${counts[key]}`)
        return parts.length ? `；${parts.join('，')}` : ''
    }

    const rememberAutoResult = (result, mediaKeys) => {
        if (!result) return
        for (const key of mediaKeys) autoResultsByMediaKey.set(key, result)
        autoLatestResult = result
        invalidateCcbCaches()
        broadcastCcbWorkerConfig()
    }

    const selectProvisionalBackups = (seed, pool) => {
        const candidates = pool.filter(item => item.node !== seed.node)
        candidates.sort((a, b) => (
            Number(b.isOriginal) - Number(a.isOriginal)
            || Number(autoCoreNodes.includes(b.node)) - Number(autoCoreNodes.includes(a.node))
            || a.benchmarkRank - b.benchmarkRank
        ))
        const backups = []
        const families = new Set([seed.family])
        for (const candidate of candidates) {
            if (backups.length >= 2) break
            if (families.has(candidate.family)) continue
            backups.push(candidate)
            families.add(candidate.family)
        }
        for (const candidate of candidates) {
            if (backups.length >= 2) break
            if (!backups.some(item => item.node === candidate.node)) backups.push(candidate)
        }
        return backups
    }

    const makeProvisionalResult = (sourceUrl, mediaKeys, requiredMbps) => {
        const health = readAutoHealth()
        const seedChoice = chooseFastStartCandidate(sourceUrl, health)
        const seed = seedChoice.candidate || getOriginalCandidate(sourceUrl)
        if (!seed) return null
        const pool = buildAutoCandidatePool(sourceUrl, mediaKeys[0], seed, health)
        const result = {
            node: seed.node,
            primary: seed,
            backups: selectProvisionalBackups(seed, pool),
            selectedAt: Date.now(),
            mbps: 0,
            ttfbMs: 0,
            tested: 0,
            reachable: 0,
            requiredMbps,
            provisional: true,
            seedReason: seedChoice.reason,
        }
        rememberAutoResult(result, mediaKeys)
        const benchmark = readFullBenchmark()
        const poolSource = benchmark && benchmark.sustainedVerifiedCount
            ? '本机持续能力排名'
            : '内置安全候选（尚无可用持续排名）'
        emitAutoStatus('probing', `快速启动：${formatAutoNode(seed)}（${seedChoice.reason}）；从${poolSource}复核 7 个节点`, result)
        return { result, pool, health }
    }

    const pickAutoFinalists = (reachable, seed, health) => {
        const ranked = [...reachable].sort((a, b) => (
            scoreReachableCandidate(b, health) - scoreReachableCandidate(a, health)
            || a.ttfbMs - b.ttfbMs
        ))
        const finalists = []
        const add = (candidate) => {
            if (!candidate || finalists.some(item => item.node === candidate.node) || finalists.length >= autoScreenFinalistCount) return
            finalists.push(candidate)
        }
        add(reachable.find(item => seed && item.node === seed.node))
        add(reachable.find(item => item.isOriginal))
        for (const candidate of ranked) add(candidate)
        return { finalists, ranked }
    }

    const pickAutoSustainedFinalists = (rankedScreen) => {
        const finalists = []
        const add = (candidate) => {
            if (!candidate || finalists.some(item => item.node === candidate.node)
                || finalists.length >= autoSustainedFinalistCount
            ) return
            finalists.push(candidate)
        }
        add(rankedScreen.find(item => item.isOriginal))
        for (const candidate of rankedScreen) add(candidate)
        return finalists
    }

    const runAutoProbeSeries = async (candidates, sourceUrl, bytes, timeoutMs, onProgress, controller) => {
        const results = []
        for (let index = 0; index < candidates.length; index++) {
            if (controller && controller.cancelled) break
            if (onProgress) onProgress(index, candidates.length, candidates[index])
            results.push(await probeAutoNode(candidates[index], sourceUrl, bytes, timeoutMs, controller))
        }
        return results
    }

    const pickAutoBackups = (primary, rankedSpeed, rankedReachable) => {
        const source = [...rankedSpeed, ...rankedReachable]
        const backups = []
        const nodes = new Set([primary.node])
        const families = new Set([primary.family])
        const add = (candidate, requireNewFamily) => {
            if (!candidate || nodes.has(candidate.node) || (requireNewFamily && families.has(candidate.family))) return
            backups.push(candidate)
            nodes.add(candidate.node)
            families.add(candidate.family)
        }
        for (const candidate of source) {
            if (backups.length >= 2) break
            add(candidate, true)
        }
        for (const candidate of source) {
            if (backups.length >= 2) break
            add(candidate, false)
        }
        return backups.slice(0, 2)
    }

    const runAutoSelection = async (sourceUrl, mediaKeys, generation, provisional, pool, initialHealth, requiredMbps, controller) => {
        const seed = provisional.primary
        const isCurrent = () => generation === autoGeneration
            && isAutoModeEnabled()
            && !(controller && controller.cancelled)
        emitAutoStatus('probing', `快速启动：${formatAutoNode(seed)}；第一轮并行验证 ${pool.length} 个节点`, provisional)
        const firstRound = await Promise.all(pool.map(candidate => (
            probeAutoNode(candidate, sourceUrl, 1, autoReachabilityTimeoutMs, controller)
        )))
        if (!isCurrent()) return null

        const failureCounts = summarizeProbeFailures(firstRound)
        const reachable = firstRound.filter(result => result.ok)
        if (!reachable.length) {
            updateAutoHealth(firstRound, [])
            for (const key of mediaKeys) autoFailuresByMediaKey.set(key, Date.now())
            const result = {
                ...provisional,
                selectedAt: Date.now(),
                tested: pool.length,
                reachable: 0,
                provisional: false,
                failureCounts,
            }
            rememberAutoResult(result, mediaKeys)
            const allPermission = failureCounts.permission === firstRound.length
            const message = allPermission
                ? '测速权限被拒绝：请重新安装 2.5.0，并允许媒体 CDN 域名'
                : `当前视频无可用测速候选${formatFailureCounts(failureCounts)}；保持快速启动源`
            emitAutoStatus(allPermission ? 'permission' : 'fallback', message, result)
            return result
        }

        const firstSummary = `第一轮：可用 ${reachable.length}/${pool.length}${formatFailureCounts(failureCounts)}`
        const { finalists, ranked: rankedReachable } = pickAutoFinalists(reachable, seed, initialHealth)
        emitAutoStatus('probing', `${firstSummary}；短筛 ${finalists.length} 个节点 × 256 KiB`, {
            tested: pool.length,
            reachable: reachable.length,
            failureCounts,
        })

        // 日常测速串行执行，避免四个探针互相抢带宽，也避免瞬间挤占播放器下载。
        const screenRound = await runAutoProbeSeries(
            finalists,
            sourceUrl,
            autoScreenBytes,
            autoScreenTimeoutMs,
            (index, total, candidate) => emitAutoStatus(
                'probing',
                `短筛 ${index + 1}/${total}：${formatAutoNode(candidate)} × 256 KiB`,
                { tested: pool.length, reachable: reachable.length, requiredMbps },
            ),
            controller,
        )
        if (!isCurrent()) return null

        const rankedScreen = screenRound.filter(result => result.ok).sort((a, b) => (
            scoreSpeedCandidate(b, initialHealth) - scoreSpeedCandidate(a, initialHealth)
            || getSustainedMbps(b) - getSustainedMbps(a)
            || a.ttfbMs - b.ttfbMs
        ))
        const sustainedFinalists = pickAutoSustainedFinalists(rankedScreen)
        const sustainedRound = await runAutoProbeSeries(
            sustainedFinalists,
            sourceUrl,
            autoSustainedBytes,
            autoSustainedTimeoutMs,
            (index, total, candidate) => {
                emitAutoStatus('probing', `持续复测 ${index + 1}/${total}：${formatAutoNode(candidate)} × 1 MiB`, {
                    tested: pool.length,
                    reachable: reachable.length,
                    requiredMbps,
                })
            },
            controller,
        )
        if (!isCurrent()) return null

        const health = updateAutoHealth(firstRound, sustainedRound)
        const rankedSustained = sustainedRound.filter(result => result.ok).sort((a, b) => (
            scoreSpeedCandidate(b, health) - scoreSpeedCandidate(a, health)
            || getSustainedMbps(b) - getSustainedMbps(a)
            || b.stability - a.stability
            || a.ttfbMs - b.ttfbMs
        ))
        const minimumSustainedMbps = Math.max(1, requiredMbps * autoBitrateHeadroom)
        const qualified = rankedSustained.filter(result => (
            getSustainedMbps(result) >= minimumSustainedMbps && result.stability >= 0.45
        ))
        const originalSustained = rankedSustained.find(item => item.isOriginal)
        const originalReachable = rankedReachable.find(item => item.isOriginal)
        let primary = qualified[0] || originalSustained || rankedSustained[0]
            || originalReachable || rankedReachable.find(item => item.node === seed.node) || rankedReachable[0]
        let heldByHysteresis = false
        const seedSustained = rankedSustained.find(item => item.node === seed.node)
        const seedQualified = seedSustained && qualified.some(item => item.node === seed.node)
        if (seedQualified && primary.node !== seed.node
            && getSustainedMbps(primary) < getSustainedMbps(seedSustained) * autoSwitchGain
        ) {
            primary = seedSustained
            heldByHysteresis = true
        }
        const backups = pickAutoBackups(primary, rankedSustained, [...rankedScreen, ...rankedReachable])
        const verifiedSustained = rankedSustained.some(item => item.node === primary.node)
        const meetsHeadroom = verifiedSustained && getSustainedMbps(primary) >= minimumSustainedMbps
            && primary.stability >= 0.45
        const result = {
            node: primary.node,
            primary,
            backups,
            selectedAt: Date.now(),
            mbps: getSustainedMbps(primary),
            burstMbps: Number(primary.burstMbps) || Number(primary.mbps) || 0,
            sustainedMbps: getSustainedMbps(primary),
            stability: Number(primary.stability) || 0,
            requiredMbps,
            minimumSustainedMbps,
            ttfbMs: primary.ttfbMs,
            tested: pool.length,
            reachable: reachable.length,
            verifiedTwice: verifiedSustained,
            verifiedSustained,
            meetsHeadroom,
            provisional: false,
            heldByHysteresis,
            failureCounts,
        }
        rememberAutoResult(result, mediaKeys)
        if (verifiedSustained && meetsHeadroom && primary.stability >= 0.55) saveLastGoodCandidate(primary)

        const changed = primary.node !== seed.node
        const action = !qualified.length && primary.isOriginal
            ? '候选持续余量不足，回到'
            : (heldByHysteresis ? '持续差异不足 25%，保持' : (changed ? '切换到' : '保持'))
        const speedText = verifiedSustained
            ? `持续低位 ${getSustainedMbps(primary).toFixed(2)} Mbps｜门槛 ${minimumSustainedMbps.toFixed(2)} Mbps｜稳定 ${Math.round(primary.stability * 100)}%`
            : '仅通过连通验证'
        const backupText = backups.length ? backups.map(formatAutoNode).join('、') : 'B站原备份'
        emitAutoStatus('ready', `${action} ${formatAutoNode(primary)}｜${speedText}｜备用：${backupText}`, result)
        logger('自动选线完成', {
            primary: primary.node,
            backups: backups.map(item => item.node),
            sustainedMbps: result.sustainedMbps,
            burstMbps: result.burstMbps,
            stability: result.stability,
            requiredMbps: result.requiredMbps,
            ttfbMs: result.ttfbMs,
            reachable: result.reachable,
        })
        return result
    }

    const prepareAutoSelectionFromPlayInfo = (playInfo) => {
        if (!playInfo || typeof playInfo !== 'object') return Promise.resolve(null)
        const mediaUrls = extractAutoMediaUrls(playInfo)
        if (!mediaUrls.length) return Promise.resolve(null)
        latestBenchmarkSourceUrl = mediaUrls[0]
        if (!isAutoModeEnabled()) return Promise.resolve(null)
        const mediaKeys = [...new Set(mediaUrls.map(getAutoMediaKey).filter(Boolean))]
        if (!mediaKeys.length) return Promise.resolve(null)
        const requiredMbps = estimateAutoRequiredMbps(playInfo, mediaUrls[0])

        for (const key of mediaKeys) {
            const inflight = autoInflightByMediaKey.get(key)
            if (inflight) {
                return inflight.then(result => {
                    if (autoResultCoversBitrate(result, requiredMbps)) {
                        rememberAutoResult(result, mediaKeys)
                        return result
                    }
                    return prepareAutoSelectionFromPlayInfo(playInfo)
                })
            }
            const cached = autoResultsByMediaKey.get(key)
            if (autoResultCoversBitrate(cached, requiredMbps)) {
                rememberAutoResult(cached, mediaKeys)
                const cacheText = cached.meetsHeadroom === false ? '复用本码率复核结果（无节点达到门槛）' : '复用本视频测速结果'
                emitAutoStatus('ready', `${formatAutoNode(cached.primary)}｜${cacheText}`, cached)
                return Promise.resolve(cached)
            }
            const failedAt = autoFailuresByMediaKey.get(key)
            if (Number.isFinite(failedAt) && Date.now() - failedAt < autoFailureRetryMs) {
                return Promise.resolve(isAutoResultFresh(cached) ? cached : null)
            }
        }

        const seeded = makeProvisionalResult(mediaUrls[0], mediaKeys, requiredMbps)
        if (!seeded) return Promise.resolve(null)
        const generation = autoGeneration
        cancelAutoProbeRun()
        const controller = { cancelled: false, requests: new Set(), mediaKey: mediaKeys[0] }
        autoProbeRun = controller
        const pending = runAutoSelection(
            mediaUrls[0],
            mediaKeys,
            generation,
            seeded.result,
            seeded.pool,
            seeded.health,
            requiredMbps,
            controller,
        ).catch((error) => {
            if (generation === autoGeneration) {
                for (const key of mediaKeys) autoFailuresByMediaKey.set(key, Date.now())
                const result = { ...seeded.result, selectedAt: Date.now(), provisional: false }
                rememberAutoResult(result, mediaKeys)
                emitAutoStatus('fallback', '后台测速异常；保持快速启动源', result)
                logger('自动测速失败:', String(error && error.message || error))
                return result
            }
            return null
        }).finally(() => {
            controller.requests.clear()
            if (autoProbeRun === controller) autoProbeRun = null
            for (const key of mediaKeys) {
                if (autoInflightByMediaKey.get(key) === pending) autoInflightByMediaKey.delete(key)
            }
        })
        for (const key of mediaKeys) autoInflightByMediaKey.set(key, pending)
        return pending
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
        let forceReplace = false
        let Replacement = ''
        let replacementHost = ''
        let runtimeChannel = null
        let runtimeChannelName = ''
        let runtimePendingCount = 0
        let runtimeLastHost = ''
        let runtimeFlushTimer = null
        const flushRuntimeStats = () => {
            runtimeFlushTimer = null
            if (!runtimeChannel || !runtimePendingCount) return
            try {
                runtimeChannel.postMessage({ type: 'ccb-worker-rewrite', host: runtimeLastHost, count: runtimePendingCount })
            } catch (_) {}
            runtimePendingCount = 0
        }
        const setRuntimeChannel = (name) => {
            const nextName = typeof name === 'string' ? name : ''
            if (nextName === runtimeChannelName) return
            try { if (runtimeChannel) runtimeChannel.close() } catch (_) {}
            runtimeChannel = null
            runtimeChannelName = nextName
            try {
                if (nextName && typeof BroadcastChannel === 'function') runtimeChannel = new BroadcastChannel(nextName)
            } catch (_) {}
        }
        const applyConfig = (next) => {
            forceReplace = !!(next && next.forceReplace)
            Replacement = (next && typeof next.replacement === 'string') ? next.replacement : ''
            replacementHost = (next && typeof next.replacementHost === 'string') ? next.replacementHost : ''
            setRuntimeChannel(next && next.runtimeChannelName)
        }
        applyConfig(cfg)
        try {
            self.addEventListener('message', (event) => {
                const data = event && event.data
                if (data && data.__CCB_AUTO_CONFIG__) applyConfig(data.__CCB_AUTO_CONFIG__)
            })
        } catch (_) {}
        const shouldApply = () => forceReplace
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

        const noteRewrite = (value) => {
            const match = /^(?:https?:)?\/\/([\w.-]+)|^([\w.-]+)(?:\/|$)/i.exec(value)
            runtimeLastHost = String(match && (match[1] || match[2]) || runtimeLastHost)
            runtimePendingCount++
            if (!runtimeFlushTimer) runtimeFlushTimer = setTimeout(flushRuntimeStats, 250)
        }

        const replaceUrl = (s) => {
            if (typeof s !== 'string') return s
            if (!shouldApply()) return s
            if (!hasMedia(s)) return s
            if (isIgnoredHost(s)) return s
            let out = s
            if (s.startsWith('http://') || s.startsWith('https://')) out = s.replace(/^https?:\/\/.*?\//, Replacement)
            else if (s.startsWith('//')) out = s.replace(/^\/\/.*?\//, Replacement.replace(/^https?:/, ''))
            else if (/^[^/]+\//.test(s)) out = s.replace(/^[^/]+\//, `${getHost()}/`)
            if (out !== s) noteRewrite(out)
            return out
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
            runtimeChannelName: ccbWorkerRuntimeChannelName,
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

    const sendCcbWorkerConfig = (worker) => {
        if (!worker || typeof worker.postMessage !== 'function') return
        try {
            worker.postMessage({
                __CCB_AUTO_CONFIG__: {
                    forceReplace: shouldApplyReplacement(),
                    replacement: getReplacement(),
                    replacementHost: getReplacementHost(),
                    runtimeChannelName: ccbWorkerRuntimeChannelName,
                },
            })
        } catch (_) {
            ccbWorkerPorts.delete(worker)
        }
    }

    function broadcastCcbWorkerConfig() {
        for (const worker of [...ccbWorkerPorts]) sendCcbWorkerConfig(worker)
    }

    const trackCcbWorker = (worker) => {
        if (!worker) return worker
        ccbWorkerPorts.add(worker)
        sendCcbWorkerConfig(worker)
        try {
            const terminate = worker.terminate
            if (typeof terminate === 'function') {
                worker.terminate = function (...args) {
                    ccbWorkerPorts.delete(worker)
                    return terminate.apply(this, args)
                }
            }
        } catch (_) {}
        return worker
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
                                const blob = new OBlob(injected, options)
                                ccbInjectedWorkerBlobs.add(blob)
                                return blob
                            }

                            return new OBlob(parts, options)
                        }
                        w.__CCB_BLOB_HOOKED__ = w.Blob
                    }
                } catch (_) {}

                try {
                    const urlHooked = w.__CCB_URL_HOOKED__
                    if (w.URL && w.URL.createObjectURL && (!urlHooked || urlHooked !== w.URL.createObjectURL)) {
                        const OCreateObjectURL = w.URL.createObjectURL
                        const ORevokeObjectURL = w.URL.revokeObjectURL
                        w.URL.createObjectURL = function (object) {
                            const url = OCreateObjectURL.call(this, object)
                            if (ccbInjectedWorkerBlobs.has(object)) ccbInjectedWorkerUrls.add(String(url))
                            return url
                        }
                        if (typeof ORevokeObjectURL === 'function') {
                            w.URL.revokeObjectURL = function (url) {
                                ccbInjectedWorkerUrls.delete(String(url))
                                return ORevokeObjectURL.call(this, url)
                            }
                        }
                        w.__CCB_URL_HOOKED__ = w.URL.createObjectURL
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
                                if (raw.startsWith('blob:') || raw.startsWith('data:')) {
                                    const worker = new OWorker(scriptURL, options)
                                    return ccbInjectedWorkerUrls.has(raw) ? trackCcbWorker(worker) : worker
                                }
                                const isModule = options && options.type === 'module'
                                const wrapperCode = isModule
                                    ? `${buildWorkerPrelude()}\nimport ${JSON.stringify(raw)};\n`
                                    : `${buildWorkerPrelude()}\nimportScripts(${JSON.stringify(raw)});\n`
                                const blob = new w.Blob([wrapperCode], { type: 'application/javascript' })
                                const url = w.URL.createObjectURL(blob)
                                return trackCcbWorker(new OWorker(url, options))
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

    interceptNetResponse((response, url) => {
        if (!isCcbEnabled()) return
        const u = typeof url === 'string' ? url : (url && url.url) || String(url)
        if (!PLAYURL_PATH_RE.test(u)) return
        if (response === null) return true

        try {
            if (typeof response === 'string') {
                const obj = JSON.parse(response)
                prepareAutoSelectionFromPlayInfo(obj)
                transformPlayUrlResponse(obj)
                return JSON.stringify(obj)
            }
            if (response && typeof response === 'object') {
                prepareAutoSelectionFromPlayInfo(response)
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
        prepareAutoSelectionFromPlayInfo(obj)
        if (!isCcbEnabled()) return
        try { transformPlayUrlResponse(obj) } catch (_) {}
    })
    watchGlobal('__INITIAL_STATE__', (obj) => {
        prepareAutoSelectionFromPlayInfo(obj)
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
        if (dataCache.cdn) {
            const nodes = getCdnNodesFromData(dataCache.cdn.data)
            const lastSourceLabel = typeof dataCache.cdn.sourceLabel === 'string' ? dataCache.cdn.sourceLabel : ''
            nodeCatalogMeta = {
                source: 'local-cache',
                sourceLabel: lastSourceLabel ? `本地缓存 · ${lastSourceLabel}` : '本地缓存',
                lastSource: typeof dataCache.cdn.source === 'string' ? dataCache.cdn.source : '',
                fetchedAt: dataCache.cdn.fetchedAt,
                upstreamUpdatedAt: Number(dataCache.cdn.upstreamUpdatedAt) || 0,
                fingerprint: (typeof dataCache.cdn.fingerprint === 'string' && dataCache.cdn.fingerprint)
                    || fingerprintNodeList(nodes),
                nodeCount: nodes.length,
            }
        }
        return dataCache
    }

    const storeCatalogData = (regions, cdn, meta) => {
        const storedMeta = {
            fetchedAt: meta.fetchedAt,
            source: meta.source,
            sourceLabel: meta.sourceLabel,
            upstreamUpdatedAt: meta.upstreamUpdatedAt,
            fingerprint: meta.fingerprint,
            nodeCount: meta.nodeCount,
        }
        GM_setValue(regionCacheStored, { data: regions, ...storedMeta })
        GM_setValue(cdnCacheStored, { data: cdn, ...storedMeta })
    }

    const requestText = (url) => new Promise((resolve, reject) => {
        let fallbackStarted = false
        const fetchFallback = () => {
            if (fallbackStarted) return
            fallbackStarted = true
            fetch(url, { cache: 'no-store' }).then(response => {
                if (!response.ok) throw new Error(`HTTP ${response.status}`)
                return response.text()
            }).then(resolve, reject)
        }
        try {
            if (typeof GM_xmlhttpRequest === 'function') {
                GM_xmlhttpRequest({
                    method: 'GET',
                    url,
                    headers: {
                        'Cache-Control': 'no-cache',
                        Pragma: 'no-cache',
                    },
                    timeout: catalogRequestTimeoutMs,
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

    const parseCatalogUpdatedAt = (info) => {
        const parsed = Date.parse(info && info.lastSuccessTime)
        return Number.isFinite(parsed) ? parsed : 0
    }

    const fetchCatalogSource = async (source) => {
        const cacheBust = `ccb=${Date.now()}-${Math.random().toString(36).slice(2)}`
        const [cdn, regions, info] = await Promise.all([
            requestJson(`${source.base}/cdn.json?${cacheBust}`),
            requestJson(`${source.base}/region.json?${cacheBust}`),
            requestJson(`${source.base}/info.json?${cacheBust}`).catch(() => null),
        ])
        if (!isCdnData(cdn)) throw new TypeError('无效 CDN 数据')
        if (!Array.isArray(regions) || !regions.every(value => typeof value === 'string')) {
            throw new TypeError('无效地区数据')
        }
        const nodes = getCdnNodesFromData(cdn)
        if (!nodes.length) throw new TypeError('节点目录为空')
        return {
            cdn,
            regions: regions.filter(Boolean),
            meta: {
                source: source.id,
                sourceLabel: source.label,
                fetchedAt: Date.now(),
                upstreamUpdatedAt: parseCatalogUpdatedAt(info),
                fingerprint: fingerprintNodeList(nodes),
                nodeCount: nodes.length,
            },
        }
    }

    const refreshNodeCatalog = ({ force = false } = {}) => {
        if (catalogRefreshPromise) return catalogRefreshPromise
        if (!cdnDataCache) loadDataCache()

        const age = Date.now() - nodeCatalogMeta.fetchedAt
        const lastRemoteSource = nodeCatalogMeta.source === 'github-raw' || nodeCatalogMeta.source === 'github-pages'
            ? nodeCatalogMeta.source
            : nodeCatalogMeta.lastSource
        const cacheFresh = Number.isFinite(age) && age >= 0 && age < nodeCatalogRefreshMs
        if (!force && cacheFresh && (lastRemoteSource === 'github-raw' || lastRemoteSource === 'github-pages')) {
            emitCatalogStatus({
                state: 'ready',
                message: `节点目录缓存仍有效（${nodeCatalogMeta.nodeCount} 个）`,
                meta: nodeCatalogMeta,
                cached: true,
                changed: false,
            })
            return Promise.resolve({ cdn: cdnDataCache, regions: regionList.slice(1), meta: nodeCatalogMeta, cached: true })
        }

        catalogRefreshPromise = (async () => {
            emitCatalogStatus({ state: 'loading', message: '正在从 GitHub main/data 同步节点目录…' })
            const errors = []
            const cachedMeta = { ...nodeCatalogMeta }
            const cachedRemoteSource = cachedMeta.source === 'local-cache' ? cachedMeta.lastSource : cachedMeta.source
            for (const source of nodeCatalogSources) {
                try {
                    const catalog = await fetchCatalogSource(source)
                    if (source.id === 'github-pages') {
                        const cachedUpstreamAt = Number(cachedMeta.upstreamUpdatedAt) || 0
                        const fallbackUpstreamAt = Number(catalog.meta.upstreamUpdatedAt) || 0
                        const staleAgainstCache = cachedUpstreamAt > 0 && fallbackUpstreamAt < cachedUpstreamAt
                        const staleAgainstRaw = cachedRemoteSource === 'github-raw'
                            && Number(cachedMeta.fetchedAt) > 0
                            && fallbackUpstreamAt <= cachedMeta.fetchedAt
                        if (staleAgainstCache || staleAgainstRaw) {
                            throw new Error('Pages 目录比本地缓存的 Raw 快照更旧')
                        }
                    }
                    const previousFingerprint = nodeCatalogMeta.fingerprint
                    cdnDataCache = catalog.cdn
                    regionList = getRegionOptions(catalog.regions)
                    nodeCatalogMeta = catalog.meta
                    storeCatalogData(catalog.regions, catalog.cdn, catalog.meta)
                    const changed = !!previousFingerprint && previousFingerprint !== catalog.meta.fingerprint
                    emitCatalogStatus({
                        state: 'ready',
                        message: `已从 ${source.label} 同步 ${catalog.meta.nodeCount} 个节点`,
                        meta: catalog.meta,
                        cached: false,
                        changed,
                    })
                    return { ...catalog, changed }
                } catch (error) {
                    errors.push(`${source.id}: ${error && error.message || error}`)
                }
            }

            const cachedNodes = getCdnNodesFromData(cdnDataCache)
            if (cachedNodes.length) {
                const previousLabel = String(nodeCatalogMeta.sourceLabel || '未知来源').replace(/^本地缓存 · /, '')
                const lastSource = nodeCatalogMeta.source === 'local-cache'
                    ? nodeCatalogMeta.lastSource
                    : nodeCatalogMeta.source
                nodeCatalogMeta = {
                    ...nodeCatalogMeta,
                    source: 'local-cache',
                    sourceLabel: `本地缓存 · ${previousLabel}`,
                    lastSource,
                    fingerprint: nodeCatalogMeta.fingerprint || fingerprintNodeList(cachedNodes),
                    nodeCount: cachedNodes.length,
                }
                emitCatalogStatus({
                    state: 'fallback',
                    message: `GitHub 节点目录同步失败，继续使用本地缓存（${cachedNodes.length} 个）`,
                    meta: nodeCatalogMeta,
                    errors,
                    changed: false,
                })
                return { cdn: cdnDataCache, regions: regionList.slice(1), meta: nodeCatalogMeta, cached: true, fallback: true }
            }

            cdnDataCache = {}
            regionList = [manualRegionName]
            nodeCatalogMeta = { source: '', sourceLabel: '', fetchedAt: 0, upstreamUpdatedAt: 0, fingerprint: '', nodeCount: 0 }
            emitCatalogStatus({
                state: 'error',
                message: 'GitHub 与 Pages 节点目录均不可用，且没有本地缓存',
                errors,
                changed: false,
            })
            return { cdn: cdnDataCache, regions: [], meta: nodeCatalogMeta, error: true }
        })().finally(() => {
            catalogRefreshPromise = null
        })
        return catalogRefreshPromise
    }

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

    const getCdnListByRegion = (region) => {
        if (region === manualRegionName || region === '编辑') return [defaultCdnNode]
        const data = cdnDataCache || {}
        const regionData = Array.isArray(data[region]) ? data[region].filter(v => typeof v === 'string') : []
        return [defaultCdnNode, ...regionData]
    }

    const getAllCdnNodes = () => getCdnNodesFromData(cdnDataCache)

    const findCurrentBenchmarkSource = () => {
        if (latestBenchmarkSourceUrl) return latestBenchmarkSourceUrl
        const roots = []
        try { roots.push(unsafeWindow.__playinfo__) } catch (_) {}
        try { roots.push(unsafeWindow.__INITIAL_STATE__) } catch (_) {}
        for (const root of roots) {
            const urls = extractAutoMediaUrls(root)
            if (!urls.length) continue
            latestBenchmarkSourceUrl = urls[0]
            return latestBenchmarkSourceUrl
        }
        try {
            const entries = typeof performance.getEntriesByType === 'function'
                ? performance.getEntriesByType('resource')
                : []
            for (let index = entries.length - 1; index >= 0; index--) {
                const value = entries[index] && entries[index].name
                if (typeof value !== 'string' || !hasMediaDomain(value)) continue
                const mediaKey = getAutoMediaKey(value)
                if (!mediaKey) continue
                latestBenchmarkSourceUrl = value
                return latestBenchmarkSourceUrl
            }
        } catch (_) {}
        return ''
    }

    const rankBenchmarkRecords = (records) => {
        const ranking = records.map(record => {
            const reachOk = record.reach.filter(result => result.ok)
            const baseSpeedOk = record.speed.filter(result => result.ok)
            const deepSpeedOk = record.deep.filter(result => result.ok)
            const sustainedSource = deepSpeedOk.length ? deepSpeedOk : baseSpeedOk
            const sustainedSpeeds = sustainedSource.map(getSustainedMbps).filter(value => value > 0)
            const burstSpeeds = sustainedSource.map(result => Number(result.burstMbps) || Number(result.mbps) || 0).filter(value => value > 0)
            const stabilitySamples = sustainedSource.map(result => Number(result.stability)).filter(Number.isFinite)
            const ttfbs = reachOk.map(result => result.ttfbMs).filter(value => value > 0)
            const connectionRate = reachOk.length / Math.max(1, record.reach.length)
            const baseSpeedRate = baseSpeedOk.length / Math.max(1, record.speed.length)
            const deepSpeedRate = record.deep.length ? deepSpeedOk.length / record.deep.length : baseSpeedRate
            // 全量排名要求两轮持续复测全部成功；一次偶然爆发不配叫“已验证”。
            const sustainedVerified = record.deep.length >= fullBenchmarkDeepRounds
                && deepSpeedOk.length === record.deep.length
            const speedSuccessRate = sustainedVerified
                ? baseSpeedRate * 0.35 + deepSpeedRate * 0.65
                : baseSpeedRate
            const sustainedP20Mbps = samplePercentile(sustainedSpeeds, 0.20)
            const medianSustainedMbps = samplePercentile(sustainedSpeeds, 0.50)
            const burstMedianMbps = samplePercentile(burstSpeeds, 0.50)
            const stability = samplePercentile(stabilitySamples, 0.25)
            const medianTtfbMs = samplePercentile(ttfbs, 0.5)
            const score = 100 * (
                connectionRate * 0.25
                + speedSuccessRate * 0.15
                + normalizedAutoSpeed(sustainedP20Mbps) * 0.30
                + normalizedAutoSpeed(medianSustainedMbps) * 0.10
                + stability * 0.15
                + normalizedAutoTtfb(medianTtfbMs || 1500) * 0.05
            )
            return {
                node: record.candidate.node,
                family: record.candidate.family,
                connectionRate,
                speedSuccessRate,
                sustainedP20Mbps,
                medianSustainedMbps,
                burstMedianMbps,
                p25Mbps: sustainedP20Mbps,
                medianMbps: medianSustainedMbps,
                stability,
                sustainedVerified,
                medianTtfbMs,
                score,
                samples: {
                    reachOk: reachOk.length,
                    reachTotal: record.reach.length,
                    speedOk: baseSpeedOk.length,
                    speedTotal: record.speed.length,
                    deepOk: deepSpeedOk.length,
                    deepTotal: record.deep.length,
                },
            }
        })
        ranking.sort((a, b) => (
            Number(b.sustainedVerified) - Number(a.sustainedVerified)
            || b.score - a.score
            || b.sustainedP20Mbps - a.sustainedP20Mbps
            || b.stability - a.stability
            || b.connectionRate - a.connectionRate
            || b.speedSuccessRate - a.speedSuccessRate
            || a.medianTtfbMs - b.medianTtfbMs
        ))
        ranking.forEach((entry, index) => { entry.rank = index + 1 })
        return ranking
    }

    const runBenchmarkPool = async (items, concurrency, handler, controller, onDone) => {
        let cursor = 0
        const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
            while (!controller.cancelled) {
                const index = cursor++
                if (index >= items.length) return
                await handler(items[index], index)
                onDone()
            }
        })
        await Promise.all(workers)
    }

    const runBenchmarkStage = async (records, field, rounds, bytes, timeoutMs, concurrency, label, controller) => {
        if (controller.cancelled) throw Object.assign(new Error('测速已取消'), { benchmarkCancelled: true })
        let completed = 0
        const total = records.length * rounds
        const update = () => {
            if (controller.cancelled) return
            completed++
            emitBenchmarkStatus({
                state: 'running',
                phase: label,
                completed,
                total,
                message: `${label}：${completed}/${total}`,
            })
        }
        emitBenchmarkStatus({ state: 'running', phase: label, completed: 0, total, message: `${label}：0/${total}` })
        for (let round = 0; round < rounds && !controller.cancelled; round++) {
            await runBenchmarkPool(records, concurrency, async (record) => {
                const result = await probeAutoNode(record.candidate, controller.sourceUrl, bytes, timeoutMs, controller)
                record[field].push(result)
                controller.transferredBytes += Number(result.transferredBytes) || Number(result.bytes) || 0
            }, controller, update)
        }
        if (controller.cancelled) throw Object.assign(new Error('测速已取消'), { benchmarkCancelled: true })
    }

    const cancelFullBenchmark = () => {
        const controller = benchmarkRun
        if (!controller || controller.cancelled) return false
        controller.cancelled = true
        for (const request of [...controller.requests]) {
            try { request.abort() } catch (_) {}
        }
        emitBenchmarkStatus({ state: 'cancelled', message: '已取消；原有测速排名保持不变' })
        return true
    }

    const startFullBenchmark = () => {
        if (benchmarkRun && benchmarkRun.promise) return benchmarkRun.promise
        const controller = {
            cancelled: false,
            requests: new Set(),
            sourceUrl: '',
            transferredBytes: 0,
            startedAt: Date.now(),
            promise: null,
        }
        benchmarkRun = controller
        controller.promise = (async () => {
            try {
                controller.sourceUrl = findCurrentBenchmarkSource()
                if (!controller.sourceUrl) {
                    emitBenchmarkStatus({ state: 'error', message: '请先打开并播放一个视频，再开始全节点测速' })
                    return null
                }
                emitBenchmarkStatus({ state: 'loading', phase: '读取节点', completed: 0, total: 0, message: '正在获取 CCB 最新节点列表…' })
                if (!cdnDataCache) loadDataCache()
                await refreshNodeCatalog({ force: true })
                const nodes = getAllCdnNodes()
                if (!nodes.length) {
                    emitBenchmarkStatus({ state: 'error', message: '无法读取 CCB 节点列表；请检查网络后重试' })
                    return null
                }
                const records = nodes.map(node => ({ candidate: makeAutoCandidate(node), reach: [], speed: [], deep: [] }))
                    .filter(record => record.candidate)
                await runBenchmarkStage(
                    records, 'reach', fullBenchmarkReachRounds, 1, fullBenchmarkReachTimeoutMs,
                    fullBenchmarkReachConcurrency, '全节点连通率 1/3', controller,
                )
                const reachable = records.filter(record => record.reach.some(result => result.ok))
                if (!reachable.length) {
                    const counts = summarizeProbeFailures(records.flatMap(record => record.reach))
                    emitBenchmarkStatus({
                        state: counts.permission ? 'permission' : 'error',
                        message: `全部 ${records.length} 个节点均未通过连通测试${formatFailureCounts(counts)}；原排名未改动`,
                    })
                    return null
                }
                await runBenchmarkStage(
                    reachable, 'speed', fullBenchmarkSpeedRounds, fullBenchmarkSpeedBytes, fullBenchmarkSpeedTimeoutMs,
                    fullBenchmarkSpeedConcurrency, '全节点短筛速度 2/3', controller,
                )
                const preliminary = rankBenchmarkRecords(records)
                const deepNodes = new Set(preliminary.filter(entry => entry.p25Mbps > 0).slice(0, fullBenchmarkDeepCount).map(entry => entry.node))
                for (const node of autoCoreNodes) {
                    const entry = preliminary.find(candidate => candidate.node === node && candidate.p25Mbps > 0)
                    if (entry) deepNodes.add(entry.node)
                }
                const deepRecords = records.filter(record => deepNodes.has(record.candidate.node))
                if (deepRecords.length) {
                    await runBenchmarkStage(
                        deepRecords, 'deep', fullBenchmarkDeepRounds, fullBenchmarkDeepBytes, fullBenchmarkDeepTimeoutMs,
                        fullBenchmarkDeepConcurrency, `前 ${deepRecords.length} 名持续能力复测 3/3`, controller,
                    )
                }
                const ranking = rankBenchmarkRecords(records)
                const completedAt = Date.now()
                const result = saveFullBenchmark({
                    version: fullBenchmarkVersion,
                    completedAt,
                    durationMs: completedAt - controller.startedAt,
                    nodeCount: records.length,
                    reachableCount: reachable.length,
                    transferredBytes: controller.transferredBytes,
                    catalogFingerprint: nodeCatalogMeta.fingerprint || fingerprintNodeList(records.map(record => record.candidate.node)),
                    catalogSource: nodeCatalogMeta.source,
                    catalogSourceLabel: nodeCatalogMeta.sourceLabel,
                    catalogUpstreamUpdatedAt: nodeCatalogMeta.upstreamUpdatedAt,
                    method: {
                        reachRounds: fullBenchmarkReachRounds,
                        speedRounds: fullBenchmarkSpeedRounds,
                        speedBytes: fullBenchmarkSpeedBytes,
                        deepCount: deepRecords.length,
                        deepRounds: fullBenchmarkDeepRounds,
                        deepBytes: fullBenchmarkDeepBytes,
                        deepConcurrency: fullBenchmarkDeepConcurrency,
                    },
                    sustainedVerifiedCount: ranking.filter(entry => entry.sustainedVerified).length,
                    ranking,
                })
                const winner = result && result.ranking.find(entry => entry.sustainedVerified)
                if (winner) saveLastGoodCandidate(makeAutoCandidate(winner.node))
                GM_setValue(autoModeStored, autoModeAdaptive7)
                clearAutoSelections('全节点测速完成；等待当前视频快速复核')
                broadcastCcbWorkerConfig()
                emitBenchmarkStatus({
                    state: 'complete',
                    phase: '完成',
                    completed: records.length,
                    total: records.length,
                    result,
                    message: winner
                        ? `完成：${records.length} 个节点，${reachable.length} 个可用；首选 ${formatAutoNode(winner)}，持续低位 ${winner.sustainedP20Mbps.toFixed(2)} Mbps`
                        : `完成：${records.length} 个节点，但没有节点连续通过两轮持续复测；日常选线将使用安全候选并按视频复核`,
                })
                try {
                    const current = unsafeWindow.__playinfo__
                    if (current && typeof current === 'object') prepareAutoSelectionFromPlayInfo(current)
                } catch (_) {}
                return result
            } catch (error) {
                if (error && error.benchmarkCancelled) return null
                emitBenchmarkStatus({ state: 'error', message: `测速失败：${String(error && error.message || error)}` })
                logger('全节点测速失败:', error)
                return null
            } finally {
                controller.requests.clear()
                if (benchmarkRun === controller) benchmarkRun = null
            }
        })()
        return controller.promise
    }

    // 首次打开期间再次触发菜单会重复插入面板，用标记挡住并发调用。
    let panelOpening = false

    const openPanel = async () => {
        const existing = document.querySelector('#ccb-settings-panel')
        if (existing) {
            try { if (typeof existing.__ccbCleanup === 'function') existing.__ccbCleanup() } catch (_) {}
            existing.remove()
            return
        }
        if (panelOpening) return
        panelOpening = true

        let root = null
        const panelControls = []
        const cleanupFns = []
        try {
            if (!cdnDataCache) loadDataCache()

            root = document.createElement('div')
            root.id = 'ccb-settings-panel'
            root.style.cssText = [
                'position:fixed',
                'z-index:2147483647',
                'right:18px',
                'top:18px',
                'width:480px',
                'max-width:calc(100vw - 24px)',
                'max-height:calc(100vh - 24px)',
                'color-scheme:dark',
                'font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif',
            ].join(';')

            const style = document.createElement('style')
            style.textContent = [
                '#ccb-settings-panel,#ccb-settings-panel *{box-sizing:border-box}',
                '#ccb-settings-panel button,#ccb-settings-panel input,#ccb-settings-panel select{font:inherit}',
                '.ccb-shell{position:relative;overflow:hidden;max-height:calc(100vh - 24px);color:#eef4ff;background:radial-gradient(circle at 95% -10%,rgba(93,105,255,.28),transparent 36%),radial-gradient(circle at -10% 35%,rgba(0,207,185,.12),transparent 34%),linear-gradient(160deg,rgba(16,21,38,.985),rgba(8,12,24,.985));border:1px solid rgba(151,166,222,.22);border-radius:22px;box-shadow:0 28px 80px rgba(0,0,0,.5),inset 0 1px 0 rgba(255,255,255,.06);backdrop-filter:blur(24px)}',
                '.ccb-header{display:flex;align-items:center;gap:12px;padding:16px 18px 13px;border-bottom:1px solid rgba(151,166,222,.13)}',
                '.ccb-logo{display:grid;place-items:center;width:36px;height:36px;border-radius:12px;color:white;font-size:17px;font-weight:900;background:linear-gradient(135deg,#6d78ff,#26d8c4);box-shadow:0 8px 24px rgba(79,102,255,.32)}',
                '.ccb-brand{min-width:0;flex:1}.ccb-title{font-size:15px;font-weight:760;letter-spacing:.2px}.ccb-subtitle{margin-top:2px;color:#8490ad;font-size:10.5px}',
                '.ccb-version{padding:4px 7px;border:1px solid rgba(126,145,255,.25);border-radius:999px;color:#aeb9ff;background:rgba(94,107,255,.09);font-size:9px;font-weight:750}',
                '.ccb-icon-btn{display:grid;place-items:center;width:30px;height:30px;padding:0;border:1px solid rgba(151,166,222,.16);border-radius:10px;color:#a8b3cc;background:rgba(255,255,255,.035);cursor:pointer;transition:.18s}.ccb-icon-btn:hover{color:#fff;background:rgba(255,255,255,.09);transform:translateY(-1px)}',
                '.ccb-body{max-height:calc(100vh - 92px);overflow:auto;padding:14px 14px 18px;scrollbar-width:thin;scrollbar-color:#3e4867 transparent}',
                '.ccb-card{margin-bottom:11px;padding:13px;border:1px solid rgba(151,166,222,.14);border-radius:16px;background:linear-gradient(145deg,rgba(255,255,255,.055),rgba(255,255,255,.022));box-shadow:inset 0 1px 0 rgba(255,255,255,.025)}',
                '.ccb-route-card{background:linear-gradient(145deg,rgba(99,112,255,.14),rgba(36,213,190,.045))}',
                '.ccb-eyebrow{display:flex;align-items:center;gap:7px;color:#8995b1;font-size:10px;font-weight:720;letter-spacing:.7px;text-transform:uppercase}',
                '.ccb-dot{width:7px;height:7px;border-radius:50%;background:#32ddad;box-shadow:0 0 0 4px rgba(50,221,173,.11),0 0 16px rgba(50,221,173,.7)}',
                '.ccb-route-line{display:flex;align-items:flex-start;gap:10px;margin-top:9px}.ccb-route-node{min-width:0;flex:1;color:#fff;font-size:15px;font-weight:760;line-height:1.35;word-break:break-all}.ccb-route-badge{flex:none;padding:4px 7px;border-radius:999px;color:#c7ceff;background:rgba(104,117,255,.14);font-size:9px;font-weight:700}',
                '.ccb-muted{color:#8490ad;font-size:10.5px;line-height:1.55}.ccb-note{margin-top:9px;padding-top:9px;border-top:1px solid rgba(151,166,222,.11);color:#707c98;font-size:9.5px;line-height:1.55}',
                '.ccb-runtime{display:grid;grid-template-columns:1fr auto;align-items:center;gap:10px;margin-top:10px;padding:9px 10px;border-radius:11px;background:rgba(4,9,20,.4)}.ccb-runtime-host{overflow:hidden;color:#c9d3e9;font-size:10.5px;text-overflow:ellipsis;white-space:nowrap}.ccb-runtime-meta{color:#68748f;font-size:9px;white-space:nowrap}',
                '.ccb-card-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:10px}.ccb-card-title{font-size:12.5px;font-weight:760}.ccb-card-desc{margin-top:3px;color:#7c88a5;font-size:9.5px;line-height:1.45}',
                '.ccb-status-pill{flex:none;padding:4px 7px;border-radius:999px;color:#93a0bd;background:rgba(255,255,255,.055);font-size:8.5px;font-weight:760}.ccb-status-pill.ready{color:#55e1b7;background:rgba(41,213,164,.11)}.ccb-status-pill.running{color:#9db3ff;background:rgba(87,113,255,.13)}.ccb-status-pill.error{color:#ffb47b;background:rgba(255,151,79,.12)}',
                '.ccb-progress{height:6px;margin:10px 0 7px;overflow:hidden;border-radius:999px;background:rgba(255,255,255,.07)}.ccb-progress-bar{height:100%;width:0;border-radius:inherit;background:linear-gradient(90deg,#6978ff,#2bd5bd);box-shadow:0 0 18px rgba(70,203,217,.35);transition:width .2s}',
                '.ccb-benchmark-message{min-height:17px;color:#a8b3cc;font-size:10px;line-height:1.55}',
                '.ccb-metrics{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin:10px 0}.ccb-metric{padding:8px;border-radius:11px;background:rgba(2,7,17,.36)}.ccb-metric-value{color:#edf4ff;font-size:12px;font-weight:760}.ccb-metric-label{margin-top:2px;color:#64708b;font-size:8.5px}',
                '.ccb-top-list{display:grid;gap:6px;margin:9px 0}.ccb-top-item{display:grid;grid-template-columns:20px minmax(0,1fr) auto;align-items:center;gap:7px;padding:7px 8px;border-radius:10px;background:rgba(5,10,23,.32)}.ccb-rank{color:#8d9aff;font-size:9px;font-weight:800}.ccb-top-node{overflow:hidden;color:#cdd6ea;font-size:9.5px;text-overflow:ellipsis;white-space:nowrap}.ccb-top-speed{color:#54deb8;font-size:9.5px;font-weight:720}',
                '.ccb-actions{display:flex;gap:7px;flex-wrap:wrap;margin-top:10px}.ccb-btn{min-height:32px;padding:7px 10px;border:1px solid rgba(151,166,222,.17);border-radius:10px;color:#bdc8df;background:rgba(255,255,255,.055);cursor:pointer;transition:.18s}.ccb-btn:hover{color:#fff;background:rgba(255,255,255,.10);transform:translateY(-1px)}.ccb-btn:disabled{opacity:.48;cursor:default;transform:none}.ccb-btn.primary{border-color:transparent;color:white;background:linear-gradient(135deg,#6574ff,#5263e9);box-shadow:0 8px 22px rgba(73,91,228,.25)}.ccb-btn.danger{color:#ffc0a4;background:rgba(255,115,73,.09)}.ccb-btn.wide{flex:1}',
                '.ccb-segment{display:grid;grid-template-columns:1fr 1fr;padding:3px;border-radius:12px;background:rgba(2,7,17,.4)}.ccb-segment button{padding:7px;border:0;border-radius:9px;color:#74809b;background:transparent;cursor:pointer}.ccb-segment button.active{color:#fff;background:linear-gradient(135deg,rgba(102,117,255,.9),rgba(77,94,222,.9));box-shadow:0 5px 15px rgba(57,70,172,.25)}',
                '.ccb-auto-status{margin-top:9px;color:#96a8d7;font-size:9.5px;line-height:1.55;word-break:break-all}.ccb-auto-status.warn{color:#f2aa72}',
                '.ccb-ranking{margin-top:10px;padding-top:10px;border-top:1px solid rgba(151,166,222,.12)}.ccb-table-wrap{max-height:330px;overflow:auto;border:1px solid rgba(151,166,222,.11);border-radius:11px;background:rgba(2,6,15,.38)}.ccb-table{width:100%;border-collapse:collapse;font-size:8.5px}.ccb-table th{position:sticky;top:0;z-index:1;padding:7px 6px;color:#8996b2;background:#11182b;text-align:right;white-space:nowrap}.ccb-table th:nth-child(2),.ccb-table td:nth-child(2){text-align:left}.ccb-table td{padding:6px;color:#aeb9ce;border-top:1px solid rgba(151,166,222,.07);text-align:right;white-space:nowrap}.ccb-table td:nth-child(2){max-width:190px;overflow:hidden;text-overflow:ellipsis}.ccb-table tr:first-child td{color:#dce5f6}',
                '.ccb-details{margin-top:2px;border:1px solid rgba(151,166,222,.13);border-radius:15px;background:rgba(255,255,255,.025)}.ccb-details>summary{padding:12px 13px;color:#9da9c1;font-size:10.5px;font-weight:700;cursor:pointer;list-style:none}.ccb-details>summary::-webkit-details-marker{display:none}.ccb-details>summary:after{content:"›";float:right;color:#697590;transform:rotate(90deg)}.ccb-details[open]>summary:after{transform:rotate(-90deg)}.ccb-details-content{padding:0 11px 11px}',
                '.ccb-subsection{margin-top:8px;padding:10px;border-radius:12px;background:rgba(2,7,17,.32)}.ccb-subsection-title{margin-bottom:7px;color:#c3cce0;font-size:10px;font-weight:740}.ccb-row{display:flex;align-items:center;gap:8px;margin:7px 0}.ccb-row-label{width:55px;flex:none;color:#75819b;font-size:9px}.ccb-select,.ccb-input{min-width:0;flex:1;padding:7px 8px;border:1px solid rgba(151,166,222,.15);border-radius:9px;outline:none;color:#d7e0f1;background:#0c1221;font-size:9px}.ccb-select:focus,.ccb-input:focus{border-color:#6878ef;box-shadow:0 0 0 3px rgba(104,120,239,.1)}',
                '.ccb-toggle-grid{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-top:9px}.ccb-toggle.active{color:#58dfba;border-color:rgba(61,211,169,.22);background:rgba(42,191,151,.08)}',
                '.ccb-footer{display:flex;gap:8px;margin-top:11px}.ccb-footer .ccb-btn{min-height:36px}',
                '@media(max-width:540px){#ccb-settings-panel{right:8px!important;top:8px!important;max-width:calc(100vw - 16px)!important}.ccb-shell{max-height:calc(100vh - 16px)}.ccb-body{max-height:calc(100vh - 82px)}.ccb-metrics{grid-template-columns:1fr 1fr}.ccb-toggle-grid{grid-template-columns:1fr}.ccb-table td:nth-child(2){max-width:130px}}',
            ].join('\n')
            root.appendChild(style)

            const el = (tag, className, textValue) => {
                const node = document.createElement(tag)
                if (className) node.className = className
                if (textValue !== void 0) node.textContent = textValue
                return node
            }
            const makeButton = (textValue, kind) => {
                const button = el('button', 'ccb-btn' + (kind ? ' ' + kind : ''), textValue)
                button.type = 'button'
                return button
            }
            const formatClock = (timestamp) => {
                if (!Number.isFinite(timestamp) || timestamp <= 0) return '尚无记录'
                try { return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) } catch (_) {}
                return ''
            }
            const formatDuration = (milliseconds) => {
                const seconds = Math.max(0, Math.round((Number(milliseconds) || 0) / 1000))
                if (seconds < 60) return seconds + ' 秒'
                return Math.floor(seconds / 60) + ' 分 ' + (seconds % 60) + ' 秒'
            }
            const formatBytes = (bytes) => {
                const mb = Math.max(0, Number(bytes) || 0) / 1024 / 1024
                return mb < 0.1 ? '< 0.1 MB' : mb.toFixed(1) + ' MB'
            }

            const shell = el('div', 'ccb-shell')
            root.appendChild(shell)
            const header = el('div', 'ccb-header')
            const logo = el('div', 'ccb-logo', 'C')
            const brand = el('div', 'ccb-brand')
            brand.appendChild(el('div', 'ccb-title', 'CCB 智能网络'))
            brand.appendChild(el('div', 'ccb-subtitle', '持续能力排名 · 当前视频码率门槛'))
            const version = el('div', 'ccb-version', 'v2.5')
            const closeBtn = el('button', 'ccb-icon-btn', '×')
            closeBtn.type = 'button'
            closeBtn.title = '关闭'
            header.appendChild(logo)
            header.appendChild(brand)
            header.appendChild(version)
            header.appendChild(closeBtn)
            shell.appendChild(header)

            const body = el('div', 'ccb-body')
            shell.appendChild(body)

            const routeCard = el('section', 'ccb-card ccb-route-card')
            const routeEyebrow = el('div', 'ccb-eyebrow')
            routeEyebrow.appendChild(el('span', 'ccb-dot'))
            routeEyebrow.appendChild(el('span', '', '当前选线目标'))
            const routeLine = el('div', 'ccb-route-line')
            const routeNode = el('div', 'ccb-route-node')
            const routeBadge = el('div', 'ccb-route-badge')
            routeLine.appendChild(routeNode)
            routeLine.appendChild(routeBadge)
            const routeMeta = el('div', 'ccb-muted')
            const runtime = el('div', 'ccb-runtime')
            const runtimeHost = el('div', 'ccb-runtime-host')
            const runtimeMeta = el('div', 'ccb-runtime-meta')
            runtime.appendChild(runtimeHost)
            runtime.appendChild(runtimeMeta)
            const routeNote = el('div', 'ccb-note', '“当前选线目标”是插件准备使用的节点；“最近实际改写”来自页面与 Worker 请求。B站统计面板显示播放器内部或缓存地址，切换后可能滞后。')
            routeCard.appendChild(routeEyebrow)
            routeCard.appendChild(routeLine)
            routeCard.appendChild(routeMeta)
            routeCard.appendChild(runtime)
            routeCard.appendChild(routeNote)
            body.appendChild(routeCard)

            const benchmarkCard = el('section', 'ccb-card')
            const benchmarkHead = el('div', 'ccb-card-head')
            const benchmarkHeading = el('div')
            benchmarkHeading.appendChild(el('div', 'ccb-card-title', '全节点持续能力测速'))
            const benchmarkDescription = el('div', 'ccb-card-desc')
            benchmarkHeading.appendChild(benchmarkDescription)
            const benchmarkPill = el('div', 'ccb-status-pill')
            benchmarkHead.appendChild(benchmarkHeading)
            benchmarkHead.appendChild(benchmarkPill)
            const benchmarkMessage = el('div', 'ccb-benchmark-message')
            const progress = el('div', 'ccb-progress')
            const progressBar = el('div', 'ccb-progress-bar')
            progress.appendChild(progressBar)
            const metrics = el('div', 'ccb-metrics')
            const topList = el('div', 'ccb-top-list')
            const benchmarkActions = el('div', 'ccb-actions')
            const startBtn = makeButton('开始持续能力测速', 'primary wide')
            const cancelBtn = makeButton('取消测速', 'danger')
            const rankingBtn = makeButton('查看完整排名')
            const copyBtn = makeButton('复制前 20')
            benchmarkActions.appendChild(startBtn)
            benchmarkActions.appendChild(cancelBtn)
            benchmarkActions.appendChild(rankingBtn)
            benchmarkActions.appendChild(copyBtn)
            const rankingBox = el('div', 'ccb-ranking')
            const rankingToolbar = el('div', 'ccb-card-head')
            const rankingTitle = el('div', 'ccb-card-title', '持续能力排名')
            const closeRankingBtn = makeButton('收起')
            rankingToolbar.appendChild(rankingTitle)
            rankingToolbar.appendChild(closeRankingBtn)
            const tableWrap = el('div', 'ccb-table-wrap')
            rankingBox.appendChild(rankingToolbar)
            rankingBox.appendChild(tableWrap)
            benchmarkCard.appendChild(benchmarkHead)
            benchmarkCard.appendChild(benchmarkMessage)
            benchmarkCard.appendChild(progress)
            benchmarkCard.appendChild(metrics)
            benchmarkCard.appendChild(topList)
            benchmarkCard.appendChild(benchmarkActions)
            benchmarkCard.appendChild(rankingBox)
            body.appendChild(benchmarkCard)

            const autoCard = el('section', 'ccb-card')
            const autoHead = el('div', 'ccb-card-head')
            const autoHeading = el('div')
            autoHeading.appendChild(el('div', 'ccb-card-title', '日常智能选线'))
            const autoDescription = el('div', 'ccb-card-desc', '7 个连通候选 → 4 个短筛 → 3 个 1 MiB 串行持续复测；单个视频最多约 4 MiB，不会逐分片测速。')
            autoHeading.appendChild(autoDescription)
            const autoSourcePill = el('div', 'ccb-status-pill')
            autoHead.appendChild(autoHeading)
            autoHead.appendChild(autoSourcePill)
            const segment = el('div', 'ccb-segment')
            const autoOffBtn = el('button', '', '手动节点')
            const autoOnBtn = el('button', '', '持续智能选线')
            autoOffBtn.type = 'button'
            autoOnBtn.type = 'button'
            segment.appendChild(autoOffBtn)
            segment.appendChild(autoOnBtn)
            const autoStatusLine = el('div', 'ccb-auto-status')
            autoStatusLine.id = 'ccb-auto-status'
            autoCard.appendChild(autoHead)
            autoCard.appendChild(segment)
            autoCard.appendChild(autoStatusLine)
            body.appendChild(autoCard)

            const details = el('details', 'ccb-details')
            const detailsSummary = el('summary', '', '高级设置 · 手动源 / 直播 / 诊断页')
            const detailsContent = el('div', 'ccb-details-content')
            details.appendChild(detailsSummary)
            details.appendChild(detailsContent)
            body.appendChild(details)

            const mkRow = (labelText) => {
                const row = el('div', 'ccb-row')
                const label = el('div', 'ccb-row-label', labelText)
                row.appendChild(label)
                return { row, label }
            }
            const mkSelect = (options, value, renderOptions) => {
                const select = el('select', 'ccb-select')
                renderOptions(select, options, value)
                return select
            }
            const mkInput = (value) => {
                const input = el('input', 'ccb-input')
                input.type = 'text'
                input.placeholder = '输入节点域名或 URL'
                input.value = value || ''
                return input
            }
            const withStoredNode = (list, stored) => (
                stored && typeof stored === 'string' && !list.includes(stored) ? [...list, stored] : list
            )
            const mountRegionAndNode = (context, hostBox) => {
                const initialRegion = getRegion(context)
                let nodeValue = getTargetCdnNode(context)
                let nodeSelect = null
                let nodeInput = null

                const regionRow = mkRow('地区').row
                const regionSelect = mkSelect(regionList, initialRegion, renderRegionOptions)
                regionRow.appendChild(regionSelect)
                hostBox.appendChild(regionRow)

                const nodeRow = mkRow('节点').row
                hostBox.appendChild(nodeRow)

                const clearNodeControl = () => {
                    if (nodeSelect) nodeValue = nodeSelect.value
                    while (nodeRow.childNodes.length > 1) nodeRow.removeChild(nodeRow.lastChild)
                    nodeSelect = null
                    nodeInput = null
                }
                const renderNodeControl = (regionValue, persist) => {
                    const stored = getTargetCdnNode(context)
                    if (regionValue === manualRegionName) {
                        if (nodeInput) return
                        clearNodeControl()
                        nodeInput = mkInput(stored === defaultCdnNode ? '' : stored)
                        nodeRow.appendChild(nodeInput)
                        nodeInput.addEventListener('input', () => {
                            const value = nodeInput.value.trim()
                            nodeValue = value || defaultCdnNode
                            setTargetCdnNode(context, nodeValue)
                            renderRoute()
                        })
                        return
                    }
                    const list = getCdnListByRegion(regionValue)
                    const options = persist ? list : withStoredNode(list, stored)
                    if (nodeSelect) {
                        renderNodeOptions(nodeSelect, options, stored)
                        nodeValue = nodeSelect.value
                        if (persist) setTargetCdnNode(context, nodeValue)
                        return
                    }
                    clearNodeControl()
                    nodeSelect = mkSelect(options, options.includes(stored) ? stored : defaultCdnNode, renderNodeOptions)
                    nodeValue = nodeSelect.value
                    nodeRow.appendChild(nodeSelect)
                    nodeSelect.addEventListener('change', () => {
                        nodeValue = nodeSelect.value
                        setTargetCdnNode(context, nodeValue)
                        renderRoute()
                    })
                    if (persist) setTargetCdnNode(context, nodeValue)
                }
                renderNodeControl(regionSelect.value, false)
                regionSelect.addEventListener('change', () => {
                    setRegion(context, regionSelect.value)
                    renderNodeControl(regionSelect.value, true)
                    renderRoute()
                })
                panelControls.push({
                    renderRegions: () => {
                        renderRegionOptions(regionSelect, regionList, getRegion(context))
                        renderNodeControl(regionSelect.value, false)
                    },
                    renderNodes: () => { renderNodeControl(regionSelect.value, false) },
                })
            }

            const makeSubsection = (titleText) => {
                const box = el('section', 'ccb-subsection')
                box.appendChild(el('div', 'ccb-subsection-title', titleText))
                detailsContent.appendChild(box)
                return box
            }
            const mainBox = makeSubsection('视频 / 课堂 / 番剧手动备用源')
            mountRegionAndNode('main', mainBox)
            const liveBox = makeSubsection('直播源')
            mountRegionAndNode('live', liveBox)
            const diagnosticsBox = makeSubsection('B站诊断页测速源')
            mountRegionAndNode('diagnostics', diagnosticsBox)

            const toggleGrid = el('div', 'ccb-toggle-grid')
            const powerBtn = makeButton('')
            powerBtn.classList.add('ccb-toggle')
            const liveBtn = makeButton('')
            liveBtn.classList.add('ccb-toggle')
            toggleGrid.appendChild(powerBtn)
            toggleGrid.appendChild(liveBtn)
            detailsContent.appendChild(toggleGrid)

            const footer = el('div', 'ccb-footer')
            const applyBtn = makeButton('应用设置并刷新页面', 'primary wide')
            footer.appendChild(applyBtn)
            detailsContent.appendChild(footer)

            let rankingOpen = false
            const rerenderRegions = () => {
                if (!root || !root.isConnected) return
                for (const controls of panelControls) controls.renderRegions()
            }
            const rerenderNodes = () => {
                if (!root || !root.isConnected) return
                for (const controls of panelControls) controls.renderNodes()
            }
            const renderRanking = (benchmark) => {
                tableWrap.textContent = ''
                if (!benchmark || !benchmark.ranking.length) return
                const table = el('table', 'ccb-table')
                const head = document.createElement('thead')
                const headRow = document.createElement('tr')
                for (const label of ['#', '节点', '验证', '连接', '持续低位', '持续中位', '稳定', 'TTFB', '分数']) {
                    headRow.appendChild(el('th', '', label))
                }
                head.appendChild(headRow)
                table.appendChild(head)
                const tableBody = document.createElement('tbody')
                for (const entry of benchmark.ranking) {
                    const row = document.createElement('tr')
                    const values = [
                        String(entry.rank),
                        entry.node,
                        entry.sustainedVerified ? '2/2' : (entry.samples && entry.samples.deepTotal ? `${entry.samples.deepOk}/${entry.samples.deepTotal}` : '短筛'),
                        Math.round(entry.connectionRate * 100) + '%',
                        entry.sustainedP20Mbps.toFixed(2),
                        entry.medianSustainedMbps.toFixed(2),
                        Math.round(entry.stability * 100) + '%',
                        Math.round(entry.medianTtfbMs) + 'ms',
                        entry.score.toFixed(1),
                    ]
                    for (const value of values) row.appendChild(el('td', '', value))
                    tableBody.appendChild(row)
                }
                table.appendChild(tableBody)
                tableWrap.appendChild(table)
            }
            const renderBenchmark = () => {
                const stored = readFullBenchmark()
                const status = benchmarkStatus
                const running = status.state === 'running' || status.state === 'loading'
                const stale = isBenchmarkCatalogStale(stored)
                const nodeCount = getAllCdnNodes().length
                const deepEstimateCount = Math.min(nodeCount, fullBenchmarkDeepCount + autoCoreNodes.length)
                const estimatedMb = nodeCount
                    ? (nodeCount * fullBenchmarkSpeedRounds * fullBenchmarkSpeedBytes
                        + deepEstimateCount * fullBenchmarkDeepRounds * fullBenchmarkDeepBytes) / 1024 / 1024
                    : 75
                const sourceText = nodeCatalogMeta.sourceLabel
                    || (catalogStatus.state === 'loading' ? '正在同步 GitHub' : '尚未同步 GitHub')
                const upstreamText = nodeCatalogMeta.upstreamUpdatedAt
                    ? ' · 上游更新 ' + new Date(nodeCatalogMeta.upstreamUpdatedAt).toLocaleDateString()
                    : ''
                benchmarkDescription.textContent = nodeCount
                    ? nodeCount + ' 个节点 · ' + sourceText + upstreamText + ' · 约 3–8 分钟 · 最坏约 ' + estimatedMb.toFixed(0) + ' MB · 可取消'
                    : '动态读取 GitHub CCB 全部节点 · 约 3–8 分钟 · 最坏约 75 MB · 可取消'
                benchmarkPill.className = 'ccb-status-pill'
                const verifiedCount = stored ? Number(stored.sustainedVerifiedCount) || 0 : 0
                if (running) {
                    benchmarkPill.textContent = '测速中'
                    benchmarkPill.classList.add('running')
                } else if (stale) {
                    benchmarkPill.textContent = '节点已更新'
                    benchmarkPill.classList.add('error')
                } else if (stored) {
                    benchmarkPill.textContent = '已有排名'
                    benchmarkPill.classList.add('ready')
                } else if (status.state === 'error' || status.state === 'permission') {
                    benchmarkPill.textContent = '需处理'
                    benchmarkPill.classList.add('error')
                } else {
                    benchmarkPill.textContent = '首次设置'
                }
                if (running) {
                    benchmarkMessage.textContent = status.message
                } else if (stale) {
                    benchmarkMessage.textContent = 'GitHub 节点清单已变化；旧排名仍可用，但新节点尚未测速。请重新测速。'
                } else if (catalogStatus.state === 'fallback') {
                    benchmarkMessage.textContent = catalogStatus.message + (stored ? '；现有排名继续可用。' : '')
                } else if (status.state === 'error' || status.state === 'permission' || status.state === 'cancelled') {
                    benchmarkMessage.textContent = status.message
                } else if (stored) {
                    benchmarkMessage.textContent = verifiedCount
                        ? '上次完成：' + new Date(stored.completedAt).toLocaleString() + '；' + verifiedCount + ' 个节点通过两轮持续复测。'
                        : '上次完成：' + new Date(stored.completedAt).toLocaleString() + '；没有节点通过两轮持续复测，请重测。'
                } else {
                    benchmarkMessage.textContent = '2.5 使用新的持续能力排名；先播放并暂停任意视频，再运行一次。旧版短测排名不会沿用。'
                }
                const ratio = running && status.total > 0 ? Math.min(1, status.completed / status.total) : (stored ? 1 : 0)
                progress.hidden = !running
                progressBar.style.width = Math.round(ratio * 100) + '%'
                metrics.textContent = ''
                if (stored) {
                    const metricValues = [
                        [String(stored.nodeCount), '测试节点'],
                        [String(stored.reachableCount), '可连接'],
                        [formatBytes(stored.transferredBytes), '实际流量'],
                        [formatDuration(stored.durationMs), '总耗时'],
                    ]
                    for (const pair of metricValues) {
                        const metric = el('div', 'ccb-metric')
                        metric.appendChild(el('div', 'ccb-metric-value', pair[0]))
                        metric.appendChild(el('div', 'ccb-metric-label', pair[1]))
                        metrics.appendChild(metric)
                    }
                }
                topList.textContent = ''
                if (stored) {
                    for (const entry of stored.ranking.filter(item => item.sustainedVerified).slice(0, 3)) {
                        const item = el('div', 'ccb-top-item')
                        item.appendChild(el('div', 'ccb-rank', '#' + entry.rank))
                        item.appendChild(el('div', 'ccb-top-node', entry.node))
                        item.appendChild(el('div', 'ccb-top-speed', entry.sustainedP20Mbps.toFixed(2) + ' Mbps 持续低位'))
                        topList.appendChild(item)
                    }
                }
                startBtn.disabled = running
                startBtn.textContent = running
                    ? '测速进行中…'
                    : (stale ? '用最新 GitHub 节点重新测速' : (stored ? '重新测试持续能力' : '开始持续能力测速'))
                cancelBtn.hidden = !running
                rankingBtn.hidden = !stored || running
                copyBtn.hidden = !stored || running
                rankingBox.hidden = !rankingOpen || !stored
                if (rankingOpen && stored) renderRanking(stored)
                renderAutoMode()
                renderRoute()
            }
            const renderAutoMode = () => {
                const enabled = getAutoMode() !== autoModeOff
                autoOffBtn.classList.toggle('active', !enabled)
                autoOnBtn.classList.toggle('active', enabled)
                const stored = readFullBenchmark()
                const stale = isBenchmarkCatalogStale(stored)
                const usable = stored && Number(stored.sustainedVerifiedCount) > 0
                autoSourcePill.textContent = stale ? '旧排名 · 待更新' : (usable ? '本机持续排名' : '内置回退')
                autoSourcePill.className = 'ccb-status-pill ' + (stale ? 'error' : (usable ? 'ready' : ''))
                if (!enabled) {
                    autoStatusLine.textContent = '自动选线已关闭；使用高级设置中的手动节点。'
                    autoStatusLine.className = 'ccb-auto-status'
                    return
                }
                autoStatusLine.textContent = autoStatus.message
                autoStatusLine.className = 'ccb-auto-status' + (
                    autoStatus.state === 'fallback' || autoStatus.state === 'permission' ? ' warn' : ''
                )
            }
            const renderRoute = () => {
                const enabled = getAutoMode() !== autoModeOff
                const result = enabled && autoLatestResult
                const primary = result && result.primary
                const manual = getTargetCdnNode('main')
                routeNode.textContent = primary
                    ? (primary.node || 'B站原始源')
                    : (enabled ? '等待当前视频地址' : manual)
                routeBadge.textContent = enabled ? '持续智能选线' : '手动模式'
                routeMeta.textContent = result
                    ? '选定于 ' + formatClock(result.selectedAt) + ' · ' + (result.provisional ? '快速启动，后台复核中' : '当前视频已复核')
                    : (enabled ? '播放视频后自动选择；不会逐分片测速' : '刷新页面后应用这个手动节点')
                const stats = readAggregateStats()
                runtimeHost.textContent = stats.host ? '最近实际改写 → ' + stats.host : '尚未捕获媒体改写请求'
                runtimeHost.title = stats.host || ''
                runtimeMeta.textContent = stats.count + ' 次 · ' + formatClock(stats.at)
            }
            const renderToggles = () => {
                const power = getPowerMode()
                const live = getLiveMode()
                powerBtn.textContent = '强力替换 ' + (power ? 'ON' : 'OFF')
                liveBtn.textContent = '直播与番剧 ' + (live ? 'ON' : 'OFF')
                powerBtn.classList.toggle('active', power)
                liveBtn.classList.toggle('active', live)
            }
            const setAutoMode = (mode) => {
                const next = normalizeAutoMode(mode)
                GM_setValue(autoModeStored, next)
                clearAutoSelections(next === autoModeOff ? '自动选线已关闭' : '等待当前视频地址')
                broadcastCcbWorkerConfig()
                renderAutoMode()
                renderRoute()
                if (next !== autoModeOff) {
                    try {
                        const current = unsafeWindow.__playinfo__
                        if (current && typeof current === 'object') prepareAutoSelectionFromPlayInfo(current)
                    } catch (_) {}
                }
            }

            startBtn.addEventListener('click', () => { startFullBenchmark() })
            cancelBtn.addEventListener('click', cancelFullBenchmark)
            rankingBtn.addEventListener('click', () => {
                rankingOpen = !rankingOpen
                rankingBtn.textContent = rankingOpen ? '收起完整排名' : '查看完整排名'
                renderBenchmark()
            })
            closeRankingBtn.addEventListener('click', () => {
                rankingOpen = false
                rankingBtn.textContent = '查看完整排名'
                renderBenchmark()
            })
            copyBtn.addEventListener('click', () => {
                const stored = readFullBenchmark()
                if (!stored) return
                const lines = ['排名\t节点\t持续验证\t连接率\t持续低位Mbps\t持续中位Mbps\t稳定率\tTTFBms\t分数']
                for (const entry of stored.ranking.slice(0, 20)) {
                    lines.push([
                        entry.rank,
                        entry.node,
                        entry.sustainedVerified ? '2/2' : (entry.samples && entry.samples.deepTotal ? `${entry.samples.deepOk}/${entry.samples.deepTotal}` : '短筛'),
                        Math.round(entry.connectionRate * 100) + '%',
                        entry.sustainedP20Mbps.toFixed(2),
                        entry.medianSustainedMbps.toFixed(2),
                        Math.round(entry.stability * 100) + '%',
                        Math.round(entry.medianTtfbMs),
                        entry.score.toFixed(1),
                    ].join('\t'))
                }
                const write = navigator.clipboard && navigator.clipboard.writeText
                    ? navigator.clipboard.writeText(lines.join('\n'))
                    : Promise.reject(new Error('clipboard unavailable'))
                write.then(() => {
                    copyBtn.textContent = '已复制'
                    setTimeout(() => { copyBtn.textContent = '复制前 20' }, 1200)
                }).catch(() => { copyBtn.textContent = '复制失败' })
            })
            autoOffBtn.addEventListener('click', () => setAutoMode(autoModeOff))
            autoOnBtn.addEventListener('click', () => setAutoMode(autoModeAdaptive7))
            powerBtn.addEventListener('click', () => {
                GM_setValue(powerModeStored, !getPowerMode())
                invalidateCcbCaches()
                renderToggles()
            })
            liveBtn.addEventListener('click', () => {
                GM_setValue(liveModeStored, !getLiveMode())
                invalidateCcbCaches()
                renderToggles()
            })
            applyBtn.addEventListener('click', () => { location.reload() })

            const benchmarkListener = () => {
                if (!root || !root.isConnected) return
                renderBenchmark()
            }
            const autoListener = () => {
                if (!root || !root.isConnected) return
                renderAutoMode()
                renderRoute()
            }
            const catalogListener = () => {
                if (!root || !root.isConnected) return
                rerenderRegions()
                rerenderNodes()
                renderBenchmark()
            }
            benchmarkStatusListeners.add(benchmarkListener)
            autoStatusListeners.add(autoListener)
            catalogStatusListeners.add(catalogListener)
            cleanupFns.push(() => benchmarkStatusListeners.delete(benchmarkListener))
            cleanupFns.push(() => autoStatusListeners.delete(autoListener))
            cleanupFns.push(() => catalogStatusListeners.delete(catalogListener))

            const runtimeTimer = setInterval(() => {
                if (!root || !root.isConnected) {
                    clearInterval(runtimeTimer)
                    return
                }
                renderRoute()
            }, 1000)
            cleanupFns.push(() => clearInterval(runtimeTimer))
            root.__ccbCleanup = () => {
                for (const cleanup of cleanupFns.splice(0)) {
                    try { cleanup() } catch (_) {}
                }
            }
            closeBtn.addEventListener('click', () => {
                root.__ccbCleanup()
                root.remove()
            })

            document.documentElement.appendChild(root)
            renderToggles()
            renderAutoMode()
            renderRoute()
            renderBenchmark()

            refreshNodeCatalog({ force: true }).catch(error => {
                logger('节点目录同步失败:', error)
            })
        } catch (error) {
            try { if (root) root.remove() } catch (_) {}
            logger('设置面板打开失败:', error)
        } finally {
            panelOpening = false
        }
    }

    if (window.top === window) {
        loadDataCache()
        refreshNodeCatalog({ force: false }).catch(error => {
            logger('启动时节点目录同步失败:', error)
        })
        const stripNodeSuffix = (s) => String(s).replace(/(?:\.bilivideo\.(?:com|cn)|\.edge\.mountaintoys\.cn)$/i, '')
        const mainNodeName = stripNodeSuffix(getTargetCdnNode('main'))
        const diagnosticsNodeName = stripNodeSuffix(getTargetCdnNode('diagnostics'))
        const liveNodeName = stripNodeSuffix(getTargetCdnNode('live'))
        const mainModeName = getAutoMode() === autoModeOff ? mainNodeName : `智能${getAutoMode()}`
        GM_registerMenuCommand(`📶 CCB 智能网络 (${mainModeName} | ${liveNodeName} | ${diagnosticsNodeName})`, () => { openPanel() })
        GM_registerMenuCommand('阅读文档 | 建议反馈 | 版本回退', () => { window.open('https://github.com/Kanda-Akihito-Kun/ccb') })
    }

    logger('CCB 加载完成', { host: location.host, path: location.pathname })
})()
