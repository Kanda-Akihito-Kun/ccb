package main

var (
	regionPatternMap = map[string]string{
		"-sz-":      "深圳",
		"-hz-":      "杭州",
		"-hk-":      "香港",
		"-sh-":      "上海",
		"-bj-":      "北京",
		"-sccd-":    "成都",
		"-fjqz-":    "泉州",
		"-hbwh-":    "武汉",
		"-jsnj-":    "南京",
		"-hljheb-":  "哈尔滨",
		"-nmghhht-": "呼和浩特",
	}

	regionList = make([]string, 0, len(regionPatternMap))

	// region : [url]
	cdnMap = make(map[string][]string)
)
