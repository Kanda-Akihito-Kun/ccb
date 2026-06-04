package main

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"math/rand"
	"net/http"
	"os"
	"sort"
	"strings"
	"time"
)

type Region struct {
	Abbr string
	Name string
}

type DnsDetectResponse struct {
	Status int `json:"status"`
	Data   struct {
		Domain      string   `json:"domain"`
		Tags        []string `json:"tags"`
		Subdomains  []string `json:"subdomains"`
		More        bool     `json:"more"`
		UpdatedTime string   `json:"updated_time"`
	} `json:"data"`
}

var (
	regionPatternMap = []Region{
		{Abbr: "bj", Name: "北京"},
		{Abbr: "sh", Name: "上海"},
		{Abbr: "gdgz", Name: "广州"},
		{Abbr: "gddg", Name: "东莞"},
		{Abbr: "sz", Name: "深圳"},
		{Abbr: "zjhz", Name: "杭州"},
		{Abbr: "sccd", Name: "成都"},
		{Abbr: "jsnj", Name: "南京"},
		{Abbr: "tj", Name: "天津"},
		{Abbr: "hbwh", Name: "武汉"},
		{Abbr: "hbsjz", Name: "河北"},
		{Abbr: "hncs", Name: "长沙"},
		{Abbr: "fj", Name: "福建"},
		{Abbr: "hnzz", Name: "郑州"},
		{Abbr: "sxxa", Name: "西安"},
		{Abbr: "lnsy", Name: "沈阳"},
		{Abbr: "hljheb", Name: "哈市"},
		{Abbr: "nmghhht", Name: "呼市"},
		{Abbr: "xj", Name: "新疆"},
		{Abbr: "gotcha", Name: "外建"},
		{Abbr: "hk", Name: "香港"},
		{Abbr: "kaigai", Name: "海外"},
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

	cdnMap = make(map[string][]string)
)

// 浏览器配置池
var browsers = []struct {
	userAgent string
	secChUa   string
	platform  string
}{
	{
		userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
		secChUa:   `"Chromium";v="134", "Google Chrome";v="134", "Not-A.Brand";v="99"`,
		platform:  "Windows",
	},
	{
		userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
		secChUa:   `"Chromium";v="134", "Google Chrome";v="134", "Not-A.Brand";v="99"`,
		platform:  "macOS",
	},
	{
		userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:136.0) Gecko/20100101 Firefox/136.0",
		secChUa:   `"Not A(Brand";v="99", "Firefox";v="136"`,
		platform:  "Windows",
	},
	{
		userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:136.0) Gecko/20100101 Firefox/136.0",
		secChUa:   `"Not A(Brand";v="99", "Firefox";v="136"`,
		platform:  "macOS",
	},
	{
		userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36 Edg/134.0.0.0",
		secChUa:   `"Chromium";v="134", "Microsoft Edge";v="134", "Not-A.Brand";v="99"`,
		platform:  "Windows",
	},
	{
		userAgent: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36",
		secChUa:   `"Chromium";v="134", "Google Chrome";v="134", "Not-A.Brand";v="99"`,
		platform:  "Linux",
	},
}

// 初始化随机种子
func init() {
	rand.Seed(time.Now().UnixNano())
}

// 为请求设置随机浏览器头部
func setRandomBrowserHeaders(req *http.Request) {
	browser := browsers[rand.Intn(len(browsers))]
	req.Header.Set("User-Agent", browser.userAgent)
	req.Header.Set("Sec-Ch-Ua", browser.secChUa)
	req.Header.Set("Sec-Ch-Ua-Mobile", "?0")
	req.Header.Set("Sec-Ch-Ua-Platform", fmt.Sprintf(`"%s"`, browser.platform))
	req.Header.Set("Accept", "application/json, text/plain, */*")
	req.Header.Set("Accept-Language", "zh-CN,zh;q=0.9,en;q=0.8")
	req.Header.Set("Dnt", "1")
	req.Header.Set("Upgrade-Insecure-Requests", "1")
	req.Header.Set("Sec-Fetch-Site", "none")
	req.Header.Set("Sec-Fetch-Mode", "navigate")
	req.Header.Set("Sec-Fetch-User", "?1")
	req.Header.Set("Sec-Fetch-Dest", "document")
	// 不设置 Accept-Encoding，避免压缩
}

// 补全子域名后缀：如果不包含 '.'，则添加 .bilivideo.com
func normalizeSubdomain(sub string) string {
	if strings.Contains(sub, ".") {
		return sub
	}
	return sub + ".bilivideo.com"
}

func matchSubDomainToRegion(subDomains []string) {
	for _, rawSub := range subDomains {
		fullSub := normalizeSubdomain(rawSub)
		for _, v := range regionPatternMap {
			if strings.Contains(fullSub, v.Abbr) {
				cdnMap[v.Name] = append(cdnMap[v.Name], fullSub)
				break
			}
		}
	}
}

func main() {
	url := "https://srclab.cn/api/server/dnsDetect/?domain=bilivideo.com"
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		log.Fatalf("创建请求失败: %v", err)
	}

	// 随机设置浏览器头部
	setRandomBrowserHeaders(req)

	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		log.Fatalf("请求失败: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		log.Fatalf("响应状态异常: %s", resp.Status)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		log.Fatalf("读取响应失败: %v", err)
	}

	// 调试输出（可选，生产环境可关闭）
	// log.Printf("原始响应(前200字符): %s", string(body)[:min(200, len(body))])

	var dnsResp DnsDetectResponse
	if err := json.Unmarshal(body, &dnsResp); err != nil {
		log.Fatalf("解析JSON失败: %v", err)
	}
	if dnsResp.Status != 1 {
		log.Fatalf("接口返回状态异常: status=%d", dnsResp.Status)
	}

	subDomains := dnsResp.Data.Subdomains
	if len(subDomains) == 0 {
		log.Fatal("未获取到任何子域名")
	}

	matchSubDomainToRegion(subDomains)

	cdnMap["海外"] = kaigaiCdnList
	cdnMap["福建"] = append(fuzhouCdnList, cdnMap["福建"]...)

	if len(subDomains) < 50 {
		log.Fatalf("抓取到的子域数量过少(%d)，疑似接口变更或限制，停止覆盖", len(subDomains))
	}

	for region := range cdnMap {
		sort.Strings(cdnMap[region])
	}

	var regionList []string
	for _, v := range regionPatternMap {
		regionList = append(regionList, v.Name)
	}

	os.MkdirAll("data", 0755)

	cdnData, err := json.MarshalIndent(cdnMap, "", "  ")
	if err != nil {
		log.Fatal("序列化CDN数据失败:", err)
	}
	if err := os.WriteFile("data/cdn.json", cdnData, 0644); err != nil {
		log.Fatal("保存CDN数据失败:", err)
	}

	regionData, err := json.MarshalIndent(regionList, "", "  ")
	if err != nil {
		log.Fatal("序列化地区列表失败:", err)
	}
	if err := os.WriteFile("data/region.json", regionData, 0644); err != nil {
		log.Fatal("保存地区列表失败:", err)
	}

	info := map[string]interface{}{
		"lastSuccessTime": time.Now().Format(time.RFC3339),
	}
	infoData, err := json.MarshalIndent(info, "", "  ")
	if err != nil {
		log.Fatal("序列化信息失败:", err)
	}
	if err := os.WriteFile("data/info.json", infoData, 0644); err != nil {
		log.Fatal("保存信息失败:", err)
	}

	log.Printf("成功更新 CDN 数据，共处理 %d 个子域名", len(subDomains))
}
