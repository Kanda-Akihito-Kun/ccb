package main

import "time"

type Region struct {
	Abbr string
	Name string
}

var (
	// 如果要自行添加地区, 就在这里加, 写入 region 的时候要去重合并
	regionPatternMap = []Region{
		{Abbr: "-bj", Name: "北京"},
		{Abbr: "-sh-", Name: "上海"},
		{Abbr: "-gd", Name: "广东"},
		{Abbr: "-sz-", Name: "深圳"},
		{Abbr: "-zj", Name: "浙江"},
		{Abbr: "-sc", Name: "四川"},
		{Abbr: "-js", Name: "江苏"},
		{Abbr: "-tj-", Name: "天津"},
		{Abbr: "-hbwh-", Name: "湖北"},
		{Abbr: "-hbsjz-", Name: "河北"},
		{Abbr: "-hblf-", Name: "河北"},
		{Abbr: "-hncs-", Name: "湖南"},
		{Abbr: "-fj", Name: "福建"},
		{Abbr: "-hnzz-", Name: "河南"},
		{Abbr: "-jx", Name: "江西"},
		{Abbr: "-sd", Name: "山东"},
		{Abbr: "-sxty-", Name: "山西"},
		{Abbr: "-sxxa-", Name: "陕西"},
		{Abbr: "-ln", Name: "辽宁"},
		{Abbr: "-hlj", Name: "黑省"},
		{Abbr: "-nmg", Name: "内蒙"},
		{Abbr: "-xj-", Name: "新疆"},
		{Abbr: "-gotcha", Name: "外建"},
		{Abbr: "-hk-", Name: "香港"},
		{Abbr: "-kaigai-", Name: "海外"},
	}

	kaigaiCdnList = []string{
		"upos-hz-mirrorakam.akamaized.net",
		"upos-sz-mirroraliov.bilivideo.com",
		"upos-sz-mirrorcosov.bilivideo.com",
	}

	fuzhouCdnList = []string{
		"cn-fjfz-fx-01-01.bilivideo.com",
		"cn-fjfz-fx-01-02.bilivideo.com",
		"cn-fjfz-fx-01-03.bilivideo.com",
		"cn-fjfz-fx-01-04.bilivideo.com",
		"cn-fjfz-fx-01-05.bilivideo.com",
		"cn-fjfz-fx-01-06.bilivideo.com",
	}

	regionList = make([]string, 0, len(regionPatternMap))

	// region : [url]
	cdnMap = make(map[string][]string)

	lastSuccessTime = time.Now()

	requestCount = 0
)
