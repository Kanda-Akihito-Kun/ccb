# Custom CDN of Bilibili (CCB) - 修改哔哩哔哩的网页视频、直播、番剧的播放源



## 项目介绍

通过解析 bilivideo.com 的子域名列表获取 CDN 域名列表，以及修改网页的 DOM 元素，实现切换批站的播放源。 

![image](https://github.com/user-attachments/assets/ae6534e3-1c78-484f-81e7-69d8608242f1)



## 更新介绍

版本 1.0.1 更新:

1. 提供强力模式——开启该模式后，脚本会通过强制修改 backupUrl 数组，实现强制切换节点的功能；

2. 支持强力模式 开启/关闭。该模式默认关闭，点击油猴脚本的设置处即可进行开关（具体位置可以见图）；

3. 在地区框选择 "编辑"，即可在右边出现的编辑框输入自定义的视频源地址，回车键触发修改（请确保手动输入的视频源有该视频资源）；

<img width="1066" height="675" alt="3e793589-f961-45b1-8fc9-e60948b72d7a" src="https://github.com/user-attachments/assets/420748ce-8cd1-4ae7-bbe6-1a66715a8e7b" />


## 使用注意

1. 对于锁区视频无效，且无法强制切换大区（比如大陆用户即使选择了杭州的Akamai节点，也会被强制送回大陆）；

2. 对于该源不存在的视频资源，批站也会强制分配新的节点，会导致选了也是白选；

3. 如遇到切换失败，并且控制台报错显示 403，那大概率是 DNS 等网络相关的问题，挂上代理就行（不需要全局，规则模式就行，重要的是让 DNS 走代理）；

4. 通过定时服务更新部署在github page上的文档，如果刷新不出来地区和节点列表，那估计你是在白名单地区（胡建、荷兰、苏联等），请挂梯子；

5. 考虑到运营商当前的各种 QoS，如果感觉视频很卡，那大概率是你脸黑，多试试同运营商同省的节点；


## 项目结构

1. script - 前端脚本；

2. server - 后端服务，可以直接部署在服务器上；

3. data 和 .github - 定时执行 workflow，然后把 json 数据保存下来提供静态访问，该模块的主要目的是节约服务器成本；


## 二开注意

1. 如果直接部署在服务器上，并且想要实现定时更新功能，那么记得修改 cron.go 文件；

2. 如果想增加地区，一共有 3 个地方的代码要同时改，分别是 store.go、region.json、update-cdn-data.yml

3. 如果想增加适配的页面，那么在修改 ccb.js 的时候，记得同时修改 @match 和 location.href.startsWith


## 项目地址
https://github.com/Kanda-Akihito-Kun/ccb


## 插件下载地址
https://greasyfork.org/zh-CN/scripts/527498-custom-cdn-of-bilibili-ccb-%E4%BF%AE%E6%94%B9%E5%93%94%E5%93%A9%E5%93%94%E5%93%A9%E7%9A%84%E8%A7%86%E9%A2%91%E6%92%AD%E6%94%BE%E6%BA%90?locale_override=1


## 联系方式

B站用户：鼠鼠今天吃嘉然 / GitHub 提 issue
