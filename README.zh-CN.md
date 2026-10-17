# Sports Tracker Widget 体育赛事桌面小组件

[English](README.md)

一个简洁的 macOS 桌面小组件（基于 [Übersicht](https://tracesof.net/uebersicht/)），追踪你关注的
F1 车手、NHL 球队和羽毛球选手。

- **F1**：下一个 session 倒计时、整个比赛周末的赛程、带 S1/S2/S3 分段的赛道图，
  每位车手的上一站正赛成绩、车手积分榜排名，以及本周末各 session 的成绩。
- **NHL**：下一场比赛（Apple Sports 风格的对阵，含双方战绩和近 10 场状态）、上一场比分、
  分区排名和季后赛形势（外卡排位、与季后赛线的分差）。
- **羽毛球**：世界排名及每周 ▲▼ 变化、上一场比分、下一场比赛或下一站报名赛事，
  以及签表路线：逐轮显示可能遇到的对手，点击"等N队"可展开全部可能对手及其世界排名。
- 最近 24 小时内开始的比赛会高亮；近期没有比赛的运动自动收起成一行；小组件可以拖动到任意位置。

数据层和显示层分离：`fetch.py` 输出一份通用的 `data.json`，任何客户端都可以读取
（现在是 Übersicht 小组件，以后是 iOS 的 Scriptable 小组件）。

## 环境要求

- macOS，Python 3.9 及以上（系统自带的 `python3` 即可）
- [Übersicht](https://tracesof.net/uebersicht/)

## 安装

```bash
git clone git@github.com:Caranthir-Xu/sports-tracker-widget.git
cd sports-tracker-widget
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python fetch.py          # 试运行，生成 ./data.json
./launchd/install.sh               # 部署并设置每 30 分钟自动运行
```

然后打开 Übersicht → 偏好设置 → **Widgets Folder**，选择本仓库的 `widget/` 文件夹。

macOS 的隐私保护不允许 launchd 定时任务读取"文稿"（Documents）文件夹，所以 `install.sh`
会把数据层复制到 `~/Library/Application Support/sports-tracker/` 运行。修改 `fetch.py`、
`providers/` 或 `config.yaml` 后需要重新运行一次 `install.sh`。卸载：`./launchd/install.sh remove`。

## iPhone 小组件（Scriptable）

`ios/` 里是 iPhone 版，基于 [Scriptable](https://scriptable.app)。数据在手机上直接抓取
（数据层的 JavaScript 版本，输出同样格式的 `data.json`），不依赖 Mac。
尺寸：小号（最近一场）、中号（单项运动）、大号（三项概览）和锁屏小组件；点击小组件会打开可交互的详情页。

1. 安装 Scriptable，打开一次，并在 iCloud 云盘设置中打开 Scriptable。
2. 在 Mac 上运行 `./ios/install.sh`，会把 `Sports Data.js` 和 `Sports Tracker.js` 复制到
   Scriptable 的 iCloud 文件夹；也可以手动把这两个文件放进 Scriptable。
3. 添加 Scriptable 小组件，脚本选 **Sports Tracker**；参数可填 `f1`、`nhl` 或 `badminton`
   （留空则自动显示最近要开始的比赛）。

修改关注对象：编辑 `Sports Tracker.js` 顶部的 `CONFIG`。

## 配置

在 `config.yaml` 里设置关注对象、时区和额外的输出位置（例如在 iCloud 云盘保存一份 `data.json`）。
每个运动在 `providers/` 里有一个 provider，接口统一为
`fetch_subject(subject) -> {ranking, next, last, profile}`。
某个数据源失败时，对应项目会保留上一次成功的数据并标记为过期，不影响其他项目。

羽毛球选手的中文译名在 `providers/badminton_names_zh.yaml` 中，可自行补充或修改。

## 数据来源

全部免费，无需 API key。大部分是非官方接口，可能随时变化。

| 运动 | 来源 |
|---|---|
| F1 | [OpenF1](https://openf1.org)（赛程、成绩）、[Jolpica](https://github.com/jolpica/jolpica-f1)（积分榜）、MultiViewer（赛道轮廓） |
| NHL | `api-web.nhle.com`（NHL 非官方接口） |
| 羽毛球 | BWF 官网内部接口（有 Cloudflare 防护，通过 `curl_cffi` 请求） |

`data.json` 的格式、各接口细节和注意事项见 [CLAUDE.md](CLAUDE.md)。

仅供个人使用，与 Formula 1、NHL、BWF 无关。
