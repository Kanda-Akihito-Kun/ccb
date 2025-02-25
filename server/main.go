package main

import "github.com/gin-gonic/gin"

func main() {

	fillRegionList()
	cronTask()

	r := gin.Default()

	// region api
	r.GET("/region", func(c *gin.Context) {
		c.JSON(200, gin.H{
			"data": regionList,
		})
		requestCount++
	})

	// cdn api
	r.GET("/cdn", func(c *gin.Context) {
		if cdnMap == nil || len(cdnMap) == 0 {
			updateSubDomainData()
		}
		c.JSON(200, gin.H{
			"data": cdnMap[c.Query("region")],
		})
		requestCount++
	})

	// info api
	r.GET("/info", func(c *gin.Context) {
		c.JSON(200, gin.H{
			"info":            "查看服务的相关信息",
			"lastSuccessTime": lastSuccessTime,
			"requestCount":    requestCount,
			"regionList":      regionList,
			"cdnMap":          cdnMap,
		})
	})

	r.Run()
}
