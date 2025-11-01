package main

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"sort"
	"strings"
	"time"
)

func fillRegionList() {
	for _, v := range regionPatternMap {
		regionList = append(regionList, v.Name)
	}
}

func matchSubDomainToRegion(response Response) {
	for _, subDomain := range response.Data.Result {
		for _, v := range regionPatternMap {
			if strings.Contains(subDomain, v.Abbr) {
				cdnMap[v.Name] = append(cdnMap[v.Name], subDomain)
			}
		}
	}
}

type Response struct {
	Status bool   `json:"status"`
	Code   int    `json:"code"`
	Msg    string `json:"msg"`
	Data   struct {
		Domain   string   `json:"domain"`
		Page     int      `json:"page"`
		PageSize int      `json:"pageSize"`
		Result   []string `json:"result"`
	} `json:"data"`
}

/*
更新 bilivideo.com 的子域名记录,
但是由于接口的限流策略导致请求多了可能会炸, 所以别搞太猛
*/
func updateSubDomainData() {
	cdnMap = make(map[string][]string)

	// 这个接口一次请求不全, 要分页获取
	for i := range 20 {
		url := fmt.Sprintf("https://chaziyu.com/ipchaxun.do?domain=bilivideo.com&page=%d", i)

		client := &http.Client{
			Timeout: 10 * time.Second,
		}

		req, err := http.NewRequest("GET", url, nil)
		if err != nil {
			log.Printf("创建请求失败 [%d]: %v", i, err)
			return
		}

		// 添加请求头
		req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36")
		req.Header.Set("Accept", "application/json")
		req.Header.Set("Referer", "https://chaziyu.com")

		resp, err := client.Do(req)
		defer resp.Body.Close()

		body, err := io.ReadAll(resp.Body)
		if err != nil {
			log.Printf("读取响应失败 [%d]: %v", i, err)
			return
		}

		var response Response
		if err := json.Unmarshal(body, &response); err != nil {
			log.Printf("解析JSON失败 [%d]: %v", i, err)
			return
		}

		matchSubDomainToRegion(response)
	}

	// 手动添加
	cdnMap["海外"] = kaigaiCdnList
	cdnMap["福建"] = append(fuzhouCdnList, cdnMap["福建"]...)

	// 节点内部排序
	for region := range cdnMap {
		sort.Strings(cdnMap[region])
	}

	lastSuccessTime = time.Now()
	requestCount = 0
}
