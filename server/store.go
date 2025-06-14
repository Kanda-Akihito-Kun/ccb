package main

import "time"

type Region struct {
	Abbr string
	Name string
}

var (
	// 如果要自行添加地区, 就在这里加
	regionPatternMap = []Region{
		{Abbr: "-bj", Name: "北京"},
		{Abbr: "-sh-", Name: "上海"},
		{Abbr: "-gdgz-", Name: "广州"},
		{Abbr: "-sz-", Name: "深圳"},
		{Abbr: "-zjhz-", Name: "杭州"},
		{Abbr: "-sccd-", Name: "成都"},
		{Abbr: "-jsnj-", Name: "南京"},
		{Abbr: "-tj-", Name: "天津"},
		{Abbr: "-hbwh-", Name: "武汉"},
		{Abbr: "-fjqz-", Name: "泉州"},
		{Abbr: "-hnzz-", Name: "郑州"},
		{Abbr: "-sxxa-", Name: "西安"},
		{Abbr: "-lnsy-", Name: "沈阳"},
		{Abbr: "-hljheb-", Name: "哈市"},
		{Abbr: "-nmghhht-", Name: "呼市"},
		{Abbr: "-xj-", Name: "新疆"},
		{Abbr: "-gotcha", Name: "外建"},
		{Abbr: "-hk-", Name: "香港"},
		{Abbr: "-kaigai-", Name: "海外"},
	}

	kaigaiCdnList = []string{
		"upos-hz-mirrorakam.akamaized.net",
		"upos-sz-mirroraliov.bilivideo.com",
	}

	regionList = make([]string, 0, len(regionPatternMap))

	// region : [url]
	cdnMap = make(map[string][]string)

	lastSuccessTime = time.Now()

	requestCount = 0
)
