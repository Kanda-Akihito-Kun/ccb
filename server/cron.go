package main

import (
	"github.com/robfig/cron/v3"
)

// 定时任务, 每七天的凌晨四点更新一次子域名列表
func cronTask() {
	c := cron.New()
	c.AddFunc("0 4 */7 * *", func() {
		updateSubDomainData()
	})
	c.Start()
}
