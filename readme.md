# Custom CDN of Bilibili (CCB) - 修改B站视频的CDN



## 项目介绍

通过修改网页的 DOM 元素，实现切换批站的播放源。

效果预览：
<img src="https://greasyfork.org/rails/active_storage/blobs/redirect/eyJfcmFpbHMiOnsiZGF0YSI6MTY4MjIxLCJwdXIiOiJibG9iX2lkIn19--88ee3af8149609db8dacfe42cc914f50bddbf0d2/demo.png?locale=zh-CN&locale_override=1" alt="demo" title="demo">


## 使用注意

对于锁区视频无效，且无法强制切换大区（比如大陆用户即使选择了杭州的Akamai节点，也会被强制送回大陆）；

对于该源不存在的视频资源，批站也会强制分配新的节点，会导致选了也是白选。


## 叠甲

代码是我用那些切换 MCDN 的脚本改的，配合上 ai 帮我调样式，所以很乱。
仅供学习娱乐。


## 联系方式

B站用户：鼠鼠今天吃嘉然