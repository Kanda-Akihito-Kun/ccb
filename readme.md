# Custom CDN of Bilibili (CCB) - 修改哔哩哔哩的网页视频、直播、番剧的播放源

## 项目介绍

**支持自定义切换B站的播放源地址。**

**注意: 安装后请点击插件设置面板, 进行节点配置操作**


## 本期 beta 更新

1. 修改UI，改为油猴脚本的设置框处（见图）；

2. 视频、直播、测速，三者的链接拆开，可单独设置；

3. 添加 edge.mountaintoys.cn 的适配；

4. 修复目前已知bug；

效果速览：

<img width="720" src="https://github.com/user-attachments/assets/eae77dc7-b303-435a-8bf9-cab70ba82f0b" />
<img width="720" src="https://github.com/user-attachments/assets/9e09a0d1-4227-406a-8744-fffd872f2572" />
<img width="720" src="https://github.com/user-attachments/assets/9830c216-7342-4172-bd5d-571e0f184ff3" />


## 快速说明

1. 适用范围：网页端B站的 **[普通视频、充电视频、直播间、番剧、稍后再看、测速]**；
2. 使用方法：浏览器右上角-油猴插件设置-点击 [📺CCB] 以设置三源。也可在地区下拉框选择“手动输入辑”后指定列表中没有的节点（务必确保格式统一且正确）；

<img width="720" src="https://github.com/user-attachments/assets/f8f9f88c-6a41-4c71-b72c-d82dc78a5dd9" />

3. 开关说明：
    - 强力替换模式（建议开启）：强制切换普通视频的播放源，包括 baseUrl 和 backupUrl。
      有一定概率因为节点无资源等原因导致视频加载失败，建议使用同省同运营商的节点（如果一直失败还是关掉吧）；
    - 适用直播和番剧：开启后对直播间以及番剧生效，使用在视频页指定的播放源。
      在直播首页不会生效，进入直播间后才会生效。番剧页面比较特殊，参见本文档的“关于番剧页面”部分详细解释；

4. 番剧页面：阿姨好像给番剧播放器搞了点骚操作，需要一顿设置之后才能生效，详见“关于番剧页面”部分；

5. 可以变相实现绕过 PCDN 的效果，或者手动指定同省同运营商节点，以带来更好的观看体验；

6. 有部分海外b友反馈，香港节点看普通视频体验不错（仅限视频，直播拉不下来）；

7. **改完记得点“应用并刷新”**；


## 关于番剧页面

阿姨把番剧播放器藏在了网页的动态 iframe 里，所以想在番剧页生效需要开启插件框架的“适用所有frame功能”，如下步骤（以油猴为例）：

1. 进入设置页面；

   <img width="720" src="https://github.com/user-attachments/assets/0090b628-cd05-4f07-aabb-cb310872dc54" />

2. 开启高级模式；

   <img width="720" src="https://github.com/user-attachments/assets/4d877eea-db9f-404f-9d6c-aecc173a07d8" />

3. 回到操作台（dashboard）页面，点击进入CCB脚本，点击设置（setting），然后关闭“只适用于 top 框架”；

   <img width="720" src="https://github.com/user-attachments/assets/af283c8a-6a41-4300-850c-787b46b00954" />

4. 重启浏览器，进入番剧页面，第一次进入可能不生效，此时 **来回切换一下集数或者使用 CTRL+F5 强制刷新** 即可完全生效；

5. 可以的话，改完记得看看系统本地的下行网络连接，看看是不是真的改了，因为有可能只改了网页 DOM 展示，实际上真正的播放源没改成功；


## 关于测速

1. 不会有给节点“批量测试”或者单独测试节点的功能，因为这将对b站服务器产生额外流量请求，性质不同；

2. 目前可以单独设置测速节点，**海外用户**可以通过b站官方的测速页面进行测速，以此挑选对于自己来说最优的节点；


## 使用注意

1. 对于锁区视频无效，且无法强制切换大区（比如大陆用户选择了杭州的Akamai节点，并且开启了强力模式，那么会因为视频拉不下来而报错）；

2. 如果刷新不出来地区列表和节点列表，请考虑挂梯子，因为这部分信息要去请求在 GitHub Page 上的文档，部分地区连不上（福建、河南等）；

3. 如遇到视频老是切换失败，请考虑多切换几个热门节点，实在不行就关闭强力模式吧；

4. 如果想增加适配的页面，那么在修改 ccb.js 的时候，记得同时修改 @match 和 location.href.startsWith（指普通视频）；


## 项目结构及实现原理

1. script - 前端脚本；

2. server - 后端服务，可以直接部署在服务器上，不过不推荐；

3. data 和 .github - 定时执行 workflow，然后把包含地区和节点的 json 数据保存下来以提供脚本静态访问，可以直接节省掉服务器成本；


## 项目地址

https://github.com/Kanda-Akihito-Kun/ccb


## 插件下载地址

正式版：
https://greasyfork.org/zh-CN/scripts/527498-custom-cdn-of-bilibili-ccb-%E4%BF%AE%E6%94%B9%E5%93%94%E5%93%A9%E5%93%94%E5%93%A9%E7%9A%84%E8%A7%86%E9%A2%91%E6%92%AD%E6%94%BE%E6%BA%90?locale_override=1

beta版：
https://greasyfork.org/en/scripts/563901-custom-cdn-of-bilibili-ccb-%E4%BF%AE%E6%94%B9%E5%93%94%E5%93%A9%E5%93%94%E5%93%A9%E7%9A%84%E7%BD%91%E9%A1%B5%E8%A7%86%E9%A2%91-%E7%9B%B4%E6%92%AD-%E7%95%AA%E5%89%A7%E7%9A%84%E6%92%AD%E6%94%BE%E6%BA%90-beta


## 联系方式和其他

希望有大佬来优化这些ai写的浆糊代码，顺带修bug（

GitHub 提 issue / B站用户-鼠鼠今天吃嘉然（https://space.bilibili.com/3220012） / ~~线下真实~~
