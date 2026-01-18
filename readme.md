# Custom CDN of Bilibili (CCB) - 修改哔哩哔哩的网页端视频和直播的播放源



## 项目介绍

**支持自定义切换B站的播放源地址。**

效果展示：

<img width="720" src="https://github.com/user-attachments/assets/ee047135-7431-4490-9dc8-a9c970fd1e0d" />
<img width="720" src="https://github.com/user-attachments/assets/df6ffa9e-a269-4bd8-987f-c5376c6ccea8" />
<img width="720" src="https://github.com/user-attachments/assets/ccdcff3f-248e-4fac-af9d-b80f574896d1" />


## 快速说明

1. 适用范围：网页端B站的 **[普通视频、充电视频、直播间、番剧、稍后再看、测速]**；
2. 使用方法：普通视频播放页的左下角进行切换。也可在地区下拉框选择“编辑”后手动输入地址（务必确保正确）；

<img width="720" src="https://github.com/user-attachments/assets/bf130b0f-d66e-44e1-a6a0-525cffc73baa" />


3. 开关说明：
   - 强力模式（建议开启）：强制切换到指定播放源。
     有一定概率因为节点无资源等原因导致视频加载失败，建议使用同省同运营商的节点（如果一直失败还是关掉吧）；
   - 适用直播间（需同时开启强力模式才能生效）：开启后对直播间生效（直播首页不生效，进入直播间后才会生效），使用在视频页指定的播放源；

  <img width="720" src="https://github.com/user-attachments/assets/6e8c1797-c07b-40fd-81a7-56777e4a386c" />

4. 番剧页面：阿姨把番剧播放器藏起来了，需要设置之后才能生效，详见“关于番剧页面”部分；

5. 可以变相实现绕过 PCDN 的效果，或者手动指定同省同运营商节点，以带来更好的观看体验；


## 关于番剧页面

阿姨把番剧播放器藏在了网页的动态 iframe 里，所以想在番剧页生效需要开启插件框架的“适用所有frame功能”，如下步骤（以油猴为例）：

1. 进入设置页面；

   <img width="720" src="https://github.com/user-attachments/assets/0090b628-cd05-4f07-aabb-cb310872dc54" />

2. 开启高级模式；

   <img width="720" src="https://github.com/user-attachments/assets/4d877eea-db9f-404f-9d6c-aecc173a07d8" />

3. 回到操作台（dashboard）页面，点击进入CCB脚本，点击设置（setting），然后关闭“只适用于 top 框架”；

   <img width="720" src="https://github.com/user-attachments/assets/af283c8a-6a41-4300-850c-787b46b00954" />

4. 重启浏览器，进入番剧页面，第一次进入可能不生效，此时 **来回切换一下集数或者使用 CTRL+F5 强制刷新** 即可完全生效；


## 使用注意

1. 对于锁区视频无效，且无法强制切换大区（比如大陆用户选择了杭州的Akamai节点，并且开启了强力模式，那么会因为视频拉不下来而报错）；

2. 如果刷新不出来地区列表和节点列表，请考虑挂梯子，因为这部分信息要去请求在 GitHub Page 上的文档，部分地区连不上（福建、河南等）；

3. 如遇到视频老是切换失败，请考虑多切换几个热门节点，实在不行就关闭强力模式吧；

4. 如果想增加适配的页面，那么在修改 ccb.js 的时候，记得同时修改 @match 和 location.href.startsWith（指普通视频）；


## 更新日志（v1.1.8, 2025-01-19-Monday）

1. 适配直播间、测速、付费番剧页面；

2. 默认开启“强力模式”和“适配直播间”；


## 后续计划

1. 考虑支持节点批量有效性测试，但是害怕产生类似于 DDoS 的效果而被阿姨制裁；

2. 解决在部分设备上，浏览器必须强制刷新（CTRL+F5）才能在番剧视频上生效的问题；

3. 适配B站的课堂；


## 项目结构及实现原理

1. script - 前端脚本；

2. server - 后端服务，可以直接部署在服务器上，不过不推荐；

3. data 和 .github - 定时执行 workflow，然后把包含地区和节点的 json 数据保存下来以提供脚本静态访问，可以直接节省掉服务器成本；


## 项目地址

https://github.com/Kanda-Akihito-Kun/ccb


## 插件下载地址

https://greasyfork.org/zh-CN/scripts/527498-custom-cdn-of-bilibili-ccb-%E4%BF%AE%E6%94%B9%E5%93%94%E5%93%A9%E5%93%94%E5%93%A9%E7%9A%84%E8%A7%86%E9%A2%91%E6%92%AD%E6%94%BE%E6%BA%90?locale_override=1


## 联系方式

GitHub 提 issue / B站用户-鼠鼠今天吃嘉然（https://space.bilibili.com/3220012） / ~~线下真实~~

