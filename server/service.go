package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"sort"
	"strings"
	"time"
)

func fillRegionList() {
	seen := make(map[string]bool)
	for _, v := range regionPatternMap {
		if seen[v.Name] {
			continue
		}
		regionList = append(regionList, v.Name)
		seen[v.Name] = true
	}
}

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

type DnsDetectResponse struct {
	Status int    `json:"status"`
	Error  string `json:"error"`
	Data   struct {
		Subdomains []string `json:"subdomains"`
	} `json:"data"`
}

func fetchChaziyuSubDomains() ([]string, error) {
	var subDomains []string

	// 这个接口一次请求不全, 要分页获取
	for i := 0; i < 20; i++ {
		url := fmt.Sprintf("https://chaziyu.com/ipchaxun.do?domain=bilivideo.com&page=%d", i)

		client := &http.Client{
			Timeout: 10 * time.Second,
		}

		req, err := http.NewRequest("GET", url, nil)
		if err != nil {
			log.Printf("创建 chaziyu 请求失败 [%d]: %v", i, err)
			continue
		}

		req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36")
		req.Header.Set("Accept", "application/json")
		req.Header.Set("Referer", "https://chaziyu.com")

		resp, err := client.Do(req)
		if err != nil {
			log.Printf("chaziyu 请求失败 [%d]: %v", i, err)
			continue
		}
		if resp.StatusCode < 200 || resp.StatusCode >= 300 {
			log.Printf("chaziyu 响应状态异常 [%d]: %s", i, resp.Status)
			resp.Body.Close()
			continue
		}

		body, err := io.ReadAll(resp.Body)
		resp.Body.Close()
		if err != nil {
			log.Printf("读取 chaziyu 响应失败 [%d]: %v", i, err)
			continue
		}

		var response Response
		if err := json.Unmarshal(body, &response); err != nil {
			log.Printf("解析 chaziyu JSON 失败 [%d]: %v", i, err)
			continue
		}
		if !response.Status && response.Code != 0 {
			log.Printf("chaziyu 接口返回异常 [%d]: code=%d msg=%s", i, response.Code, response.Msg)
			continue
		}

		subDomains = append(subDomains, response.Data.Result...)
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

/*
更新 bilivideo.com 的子域名记录。
外部接口不稳定，成功时只增量合并新节点，失败时保留现有节点。
*/
func updateSubDomainData() {
	if cdnMap == nil {
		cdnMap = make(map[string][]string)
	}

	subDomains, err := fetchSubDomains()
	if err != nil {
		log.Printf("所有子域接口均更新失败，保留现有节点: %v", err)
		return
	}

	added := matchSubDomainsToRegion(subDomains)
	added += addCdnNodes("海外", kaigaiCdnList)
	added += addCdnNodes("福建", fuzhouCdnList)

	// 节点内部排序
	for region := range cdnMap {
		sort.Strings(cdnMap[region])
	}

	lastSuccessTime = time.Now()
	requestCount = 0
	log.Printf("更新子域完成，发现 %d 个子域，新增 %d 个节点", len(subDomains), added)
}
