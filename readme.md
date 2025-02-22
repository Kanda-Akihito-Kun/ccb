# Custom CDN of Bilibili (CCB) - 修改B站视频的CDN



## 项目介绍

通过解析 bilivideo.com 的子域名列表获取 CDN 域名列表，以及修改网页的 DOM 元素，实现切换批站的播放源。

效果预览：
<img src="https://greasyfork.org/rails/active_storage/blobs/redirect/eyJfcmFpbHMiOnsiZGF0YSI6MTY4MjIxLCJwdXIiOiJibG9iX2lkIn19--88ee3af8149609db8dacfe42cc914f50bddbf0d2/demo.png?locale=zh-CN&locale_override=1" alt="demo" title="demo">


## 使用注意

1. 对于锁区视频无效，且无法强制切换大区（比如大陆用户即使选择了杭州的Akamai节点，也会被强制送回大陆）；

2. 对于该源不存在的视频资源，批站也会强制分配新的节点，会导致选了也是白选；

3. 如遇到切换失败，并且控制台报错显示 403，那大概率是 DNS 等网络相关的问题，挂上代理就行（不需要全局，规则模式就行，重要的是让 DNS 走代理）；

4. 接口服务部署在稻妻，如果刷新不出来地区和节点列表，那估计你是在白名单地区（福建、新疆等），请挂梯子；


## 插件下载地址
https://greasyfork.org/zh-CN/scripts/527498-custom-cdn-of-bilibili-ccb-%E4%BF%AE%E6%94%B9%E5%93%94%E5%93%A9%E5%93%94%E5%93%A9%E7%9A%84%E8%A7%86%E9%A2%91%E6%92%AD%E6%94%BE%E6%BA%90?locale_override=1


## 项目地址
https://github.com/Kanda-Akihito-Kun/ccb


## 叠甲

代码是我用那些切换 MCDN 的脚本改的，配合上 ai 帮我调样式，所以很乱。
仅供学习娱乐。


## 联系方式

B站用户：鼠鼠今天吃嘉然