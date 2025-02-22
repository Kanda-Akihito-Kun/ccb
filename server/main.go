package main

import "github.com/gin-gonic/gin"

func main() {

	r := gin.Default()
	fillRegionList()

	// region api
	r.GET("/region", func(c *gin.Context) {
		c.JSON(200, gin.H{
			"data": regionList,
		})
	})

	// cdn api
	r.GET("/cdn", func(c *gin.Context) {
		if cdnMap == nil || len(cdnMap) == 0 {
			updateSubDomainData()
		}
		c.JSON(200, gin.H{
			"data": cdnMap[c.Query("region")],
		})
	})

	r.Run()
}
