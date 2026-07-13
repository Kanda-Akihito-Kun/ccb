package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"sort"
	"strings"
	"time"

	"github.com/chromedp/chromedp"
)

type Region struct {
	Abbr string
	Name string
}

type ChaziyuResponse struct {
	Status bool   `json:"status"`
	Code   int    `json:"code"`
	Msg    string `json:"msg"`
	Data   struct {
		Result []string `json:"result"`
	} `json:"data"`
}

type DnsDetectResponse struct {
	Status int    `json:"status"`
	Error  string `json:"error"`
	Data   struct {
		Subdomains []string `json:"subdomains"`
	} `json:"data"`
}

var (
	regionPatternMap = []Region{
		{Abbr: "-bj", Name: "北京"},
		{Abbr: "-sh-", Name: "上海"},
		{Abbr: "-gd", Name: "广东"},
		{Abbr: "-sz-", Name: "深圳"},
		{Abbr: "-fj", Name: "福建"},
		{Abbr: "-hbsjz-", Name: "河北"},
		{Abbr: "-hblf-", Name: "河北"},
		{Abbr: "-hlj", Name: "黑省"},
		{Abbr: "-hnzz-", Name: "河南"},
		{Abbr: "-hbwh-", Name: "湖北"},
		{Abbr: "-hbyc-", Name: "湖北"},
		{Abbr: "-hncs-", Name: "湖南"},
		{Abbr: "-jsnj-", Name: "江苏"},
		{Abbr: "-jssz-", Name: "江苏"},
		{Abbr: "-jx", Name: "江西"},
		{Abbr: "-ln", Name: "辽宁"},
		{Abbr: "-nmg", Name: "内蒙"},
		{Abbr: "-sd", Name: "山东"},
		{Abbr: "-sxty-", Name: "山西"},
		{Abbr: "-sxxa-", Name: "陕西"},
		{Abbr: "-sc", Name: "四川"},
		{Abbr: "-cq", Name: "重庆"},
		{Abbr: "-tj-", Name: "天津"},
		{Abbr: "-xj-", Name: "新疆"},
		{Abbr: "-zj", Name: "浙江"},
		{Abbr: "-gotcha", Name: "外建"},
		{Abbr: "-hk-", Name: "香港"},
		{Abbr: "-kaigai-", Name: "海外"},
	}

	kaigaiCdnList = []string{
		"upos-hz-mirrorakam.akamaized.net",
		"upos-sz-mirroraliov.bilivideo.com",
		"upos-sz-mirrorcosov.bilivideo.com",
		"upos-sz-mirror08h.bilivideo.com",
	}

	fuzhouCdnList = []string{
		"cn-fjfz-fx-01-01.bilivideo.com",
		"cn-fjfz-fx-01-02.bilivideo.com",
		"cn-fjfz-fx-01-03.bilivideo.com",
		"cn-fjfz-fx-01-04.bilivideo.com",
		"cn-fjfz-fx-01-05.bilivideo.com",
		"cn-fjfz-fx-01-06.bilivideo.com",
	}

	cdnMap = make(map[string][]string)
)

func normalizeSubdomain(subDomain string) string {
	subDomain = strings.TrimSpace(subDomain)
	if subDomain == "" || strings.Contains(subDomain, ".") {
		return subDomain
	}
	return subDomain + ".bilivideo.com"
}

func isUnsafeCdnNode(subDomain string) bool {
	subDomain = strings.ToLower(subDomain)
	return strings.Contains(subDomain, "origin") || strings.Contains(subDomain, "all")
}

func addCdnNode(region string, subDomain string) bool {
	if subDomain == "" {
		return false
	}
	if isUnsafeCdnNode(subDomain) {
		return false
	}
	for _, existing := range cdnMap[region] {
		if existing == subDomain {
			return false
		}
	}
	cdnMap[region] = append(cdnMap[region], subDomain)
	return true
}

func addCdnNodes(region string, subDomains []string) int {
	added := 0
	for _, subDomain := range subDomains {
		if addCdnNode(region, subDomain) {
			added++
		}
	}
	return added
}

func removeUnsafeCdnNodes() int {
	removed := 0
	for region, nodes := range cdnMap {
		kept := nodes[:0]
		for _, node := range nodes {
			if isUnsafeCdnNode(node) {
				removed++
				continue
			}
			kept = append(kept, node)
		}
		cdnMap[region] = kept
	}
	return removed
}

func matchSubDomainsToRegion(subDomains []string) int {
	added := 0
	for _, rawSubDomain := range subDomains {
		subDomain := normalizeSubdomain(rawSubDomain)
		for _, v := range regionPatternMap {
			if strings.Contains(subDomain, v.Abbr) {
				if addCdnNode(v.Name, subDomain) {
					added++
				}
				break
			}
		}
	}
	return added
}

func fetchChaziyuSubDomains() ([]string, error) {
	var subDomains []string

	opts := append(chromedp.DefaultExecAllocatorOptions[:],
		chromedp.Flag("headless", true),
		chromedp.Flag("disable-gpu", true),
		chromedp.Flag("no-sandbox", true),
		chromedp.Flag("disable-dev-shm-usage", true),
		chromedp.UserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36"),
	)

	allocCtx, cancel := chromedp.NewExecAllocator(context.Background(), opts...)
	defer cancel()

	ctx, cancel := chromedp.NewContext(allocCtx)
	defer cancel()

	ctx, cancel = context.WithTimeout(ctx, 120*time.Second)
	defer cancel()

	for i := 0; i < 20; i++ {
		if i > 0 {
			time.Sleep(2 * time.Second)
		}

		url := fmt.Sprintf("https://chaziyu.com/ipchaxun.do?domain=bilivideo.com&page=%d", i)
		var rawJSON string

		err := chromedp.Run(ctx,
			chromedp.Navigate(url),
			chromedp.WaitVisible("body", chromedp.ByQuery),
			chromedp.Sleep(3*time.Second),
			chromedp.Evaluate(`document.body.innerText`, &rawJSON),
		)
		if err != nil {
			log.Printf("chaziyu 浏览器请求失败 [%d]: %v", i, err)
			continue
		}

		rawJSON = strings.TrimSpace(rawJSON)
		if rawJSON == "" {
			log.Printf("chaziyu 页面内容为空 [%d]", i)
			continue
		}

		var response ChaziyuResponse
		if err := json.Unmarshal([]byte(rawJSON), &response); err != nil {
			log.Printf("解析 chaziyu JSON 失败 [%d]: %v", i, err)
			continue
		}
		if !response.Status && response.Code != 0 {
			log.Printf("chaziyu 接口返回异常 [%d]: code=%d msg=%s", i, response.Code, response.Msg)
			continue
		}

		subDomains = append(subDomains, response.Data.Result...)
		log.Printf("chaziyu 第 %d 页获取 %d 个子域", i, len(response.Data.Result))
	}

	if len(subDomains) < 50 {
		return nil, fmt.Errorf("chaziyu 子域数量过少: %d", len(subDomains))
	}
	return subDomains, nil
}

func fetchSrcLabSubDomains() ([]string, error) {
	url := "https://srclab.cn/api/server/dnsDetect/?domain=bilivideo.com"
	client := &http.Client{Timeout: 15 * time.Second}
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36")
	req.Header.Set("Accept", "application/json, text/plain, */*")
	req.Header.Set("Accept-Language", "zh-CN,zh;q=0.9,en;q=0.8")

	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("srclab 响应状态异常: %s", resp.Status)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}

	var response DnsDetectResponse
	if err := json.Unmarshal(body, &response); err != nil {
		return nil, err
	}
	if response.Status != 1 {
		if response.Error != "" {
			return nil, errors.New(response.Error)
		}
		return nil, fmt.Errorf("srclab 状态异常: %d", response.Status)
	}
	if len(response.Data.Subdomains) < 50 {
		return nil, fmt.Errorf("srclab 子域数量过少: %d", len(response.Data.Subdomains))
	}

	return response.Data.Subdomains, nil
}

func fetchSubDomains() ([]string, error) {
	if subDomains, err := fetchChaziyuSubDomains(); err == nil {
		return subDomains, nil
	} else {
		log.Printf("chaziyu 更新失败，尝试 srclab: %v", err)
	}

	if subDomains, err := fetchSrcLabSubDomains(); err == nil {
		return subDomains, nil
	} else {
		return nil, err
	}
}

func readExistingCdnData() error {
	body, err := os.ReadFile("data/cdn.json")
	if err != nil {
		return err
	}
	if len(strings.TrimSpace(string(body))) == 0 {
		return nil
	}
	return json.Unmarshal(body, &cdnMap)
}

func writeJson(path string, data interface{}) {
	body, err := json.MarshalIndent(data, "", "  ")
	if err != nil {
		log.Fatalf("序列化 %s 失败: %v", path, err)
	}
	body = append(body, '\n')
	if err := os.WriteFile(path, body, 0644); err != nil {
		log.Fatalf("保存 %s 失败: %v", path, err)
	}
}

func main() {
	if err := readExistingCdnData(); err != nil {
		log.Printf("读取现有 data/cdn.json 失败，将仅在接口成功时生成新数据: %v", err)
	}
	if removed := removeUnsafeCdnNodes(); removed > 0 {
		log.Printf("已移除 %d 个包含 origin/all 的危险节点", removed)
	}

	fetchSucceeded := false
	subDomains, err := fetchSubDomains()
	if err != nil {
		log.Printf("所有子域接口均更新失败，保留现有节点: %v", err)
	} else {
		fetchSucceeded = true
		added := matchSubDomainsToRegion(subDomains)
		added += addCdnNodes("海外", kaigaiCdnList)
		added += addCdnNodes("福建", fuzhouCdnList)
		log.Printf("成功更新 CDN 数据，发现 %d 个子域，新增 %d 个节点", len(subDomains), added)
	}

	if len(cdnMap) == 0 && !fetchSucceeded {
		log.Fatal("没有可保留的现有节点，且两个外部接口都失败")
	}

	for region := range cdnMap {
		sort.Strings(cdnMap[region])
	}

	var regionList []string
	seenRegions := make(map[string]bool)
	for _, v := range regionPatternMap {
		if seenRegions[v.Name] {
			continue
		}
		regionList = append(regionList, v.Name)
		seenRegions[v.Name] = true
	}

	os.MkdirAll("data", 0755)
	writeJson("data/cdn.json", cdnMap)
	writeJson("data/region.json", regionList)

	if fetchSucceeded {
		info := map[string]interface{}{
			"lastSuccessTime": time.Now().Format(time.RFC3339),
		}
		writeJson("data/info.json", info)
	}
}
