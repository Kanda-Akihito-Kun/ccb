package main

var (
	regionPatternMap = map[string]string{
		"-sz-":   "深圳",
		"-hz-":   "杭州",
		"-hk-":   "香港",
		"-sh-":   "上海",
		"-bj-":   "北京",
		"-sccd-": "成都",
		"-xj-":   "新疆",
	}

	regionList = make([]string, len(regionPatternMap))

	// region : [url]
	cdnMap = make(map[string][]string)
)
