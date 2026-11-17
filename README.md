# weekly-report
GitHub 周报自动生成服务，拉取仓库提交记录，调用大模型生成 Markdown 周报报告，输出静态页面。

## ✨ 功能特性
- 读取 GitHub 仓库 Commits 提交数据
- AI 自动汇总、提炼本周工作内容
- 生成 Markdown 报告，导出 HTML 静态页面
- PostgreSQL 持久化存储仓库、提交记录、周报摘要
- 可配置 OpenRouter / 硅基流动等大模型接口

## 📋 环境要求
- Node.js >= 20
- PostgreSQL 15+
- npm / yarn

## 📦 安装
```bash
# 拉取代码
git clone https://github.com/XiaCaoSteel/weekly-report.git
cd weekly-report

# 安装依赖
npm install

## Usage

```bash
# Default: all three formats
node src/index.js

#github Specific formats
node src/index.js --format html        # Browser only
node src/index.js -f html,md           # HTML + Markdown
node src/index.js -f doc               # Word only
node src/index.js --format all         # All formats
node src/index.js run-report           #执行成功后，`reports`目录内会有两个文件：
#静态展示
https://xiacaosteel.github.io/weekly-report-pages/reports/github_weekly_report_20261106.md（html）


#skill Specific formats

node src/skills-index.js             # 默认全部3种格式（md html doc）
node src/skills-index.js format html    # 只生成 html
node src/skills-index.js --format md    # 只生成 md
node src/skills-index.js format doc     # 只生成 doc
#静态展示
https://xiacaosteel.github.io/weekly-report-pages/reports/claw_skill_weekly_report_20261105.html
