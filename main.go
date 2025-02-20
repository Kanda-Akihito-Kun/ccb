package main

import "github.com/gin-gonic/gin"

var cdnMap = make(map[string][]string)

func queryCdnListBySubdomain() {
	// todo 后面会改成自动解析子域名, 现在先手动填写几个, 具体的可以自己去查: https://site.ip138.com/bilivideo.com/domain.htm

	cdnMap["上海"] = []string{
		"cn-sh-ct-01-35.bilivideo.com",
		"upos-sh-mirrorcosov.bilivideo.com",
		"cn-sh-ct-01-06.bilivideo.com",
	}

	cdnMap["深圳"] = []string{
		"upos-sz-mirroraliov.bilivideo.com",
		"upos-sz-mirroralib.bilivideo.com",
		"upos-sz-estgcos.bilivideo.com",
	}

	cdnMap["杭州"] = []string{
		"upos-hz-mirrorakam.akamaized.net",
	}

	cdnMap["香港"] = []string{
		"cn-hk-eq-01-10.bilivideo.com",
	}

	cdnMap["新疆"] = []string{
		"cn-xj-cm-02-04.bilivideo.com",
		"cn-xj-ct-01-01.bilivideo.com",
	}

	cdnMap["成都"] = []string{
		"cn-sccd-cu-01-09.bilivideo.com",
		"cn-sccd-cmcc-v-01.bilivideo.com",
		"cn-sccd-ct-01-22.bilivideo.com",
		"cn-sccd-cu-01-05.bilivideo.com",
		"cn-sccd-ct-01-21.bilivideo.com",
	}
}

func main() {

	r := gin.Default()

	// region api
	regionList := [...]string{"上海", "深圳", "杭州", "成都", "香港", "新疆"}
	r.GET("/region", func(c *gin.Context) {
		c.JSON(200, gin.H{
			"data": regionList,
		})
	})

	// cdn api
	r.GET("/cdn", func(c *gin.Context) {
		if cdnMap == nil || len(cdnMap) == 0 {
			queryCdnListBySubdomain()
		}
		c.JSON(200, gin.H{
			"data": cdnMap[c.Query("region")],
		})
	})

	r.Run()
}
