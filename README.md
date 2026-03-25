# 📘 web2epub

[![Node.js](https://img.shields.io/badge/node-%3E%3D20.11-brightgreen)]()
[![License](https://img.shields.io/badge/license-MIT-blue)]()
[![Status](https://img.shields.io/badge/status-MVP-orange)]()

本地运行的网页转 EPUB CLI，专注于**阅读体验 + 体积控制**。

A local CLI tool that converts web pages into EPUB with a focus on **clean reading experience and strict size control**.

---

## ✨ Features / 功能

- 📄 单篇网页转 EPUB / Single webpage → EPUB  
- 📚 多篇网页合并为一本电子书 / Merge multiple webpages into one EPUB  
- 🧠 自动正文提取（Readability） / Readability-based extraction  
- 🧹 去除广告、导航、评论等噪声 / Remove ads and noise  
- 🖼️ 图片统一转 JPEG + 强制压缩 / Force JPEG + compression  
- 📦 自动控制体积 ≤ 5MB / Keep EPUB under ~5MB  
- 📑 自动生成分层目录（TOC） / Hierarchical TOC  
- 🔧 支持站点规则扩展 / Site profiles  

---

## ⚙️ Installation / 安装

```bash
npm run setup
```
or
```bash
sh ./setup.sh
```
Windows
```
setup.cmd
```
---

## 🚀 Quick Start / 快速开始

### 单篇网页 / Single page
```bash
node ./src/cli.js "https://example.com/article" --title "文章标题" --author "作者"
```
### 多篇合并 / Merge multiple pages
```bash
node ./src/cli.js "https://example.com/1" "https://example.com/2" --mode merge --title "我的合集"
```
### 从清单导入 / From URL list
```bash
node ./src/cli.js --input ./examples/urls.txt --mode merge --title "批量合集"
```
### 指定封面和输出 / Cover & output
```bash
node ./src/cli.js "https://example.com/article" --cover ./cover.jpg --output ./output/demo.epub
```
### 调试模式 / Debug mode
```bash
node ./src/cli.js "https://example.com/article" --save-intermediate --debug
```
### 全局命令 / Global command
```bash
npm link
web2epub "https://example.com/article"
```
---

## 🧾 CLI Options / 参数说明
	•	input：URL 或 .txt/.list 文件 / URL or list file
	•	--mode single|merge：单篇或合集 / single or merged mode
	•	--title：电子书标题 / book title
	•	--author：作者 / author
	•	--language：语言元数据（默认自动识别） / language metadata (auto-detected)
	•	--description：简介 / description
	•	--cover：封面路径 / cover image path
	•	--output：输出路径 / output path
	•	--timeout：请求超时（ms） / request timeout
	•	--retry：重试次数 / retry count
	•	--no-preserve-links：移除链接 / remove links
	•	--clean-level：light|balanced|aggressive 清洗强度 / cleaning level
	•	--site-profile：站点规则 / site profile
	•	--user-agent：自定义 UA / custom UA
	•	--save-intermediate：保存中间文件 / save intermediate files
	•	--debug：调试日志 / debug logs

---

## 📑 TOC Rules / 目录规则

### 单篇模式 / Single mode

	•	书名来自 --title 或网页标题 Book title from --title or page title
	•	一级目录为文章 chapter Top-level TOC = article chapter
	•	子目录从 XHTML 提取 h1/h2/h3 Sub-TOC extracted from h1/h2/h3
	•	h1/h2 → 二级，h3 挂载 h1/h2 → level 2, h3 nested under nearest parent

### 合并模式 / Merge mode

	•	书名来自 --title Book title from --title
	•	每篇文章为一级 Each article = top-level entry
	•	提取 h2/h3 作为子目录 h2/h3 used as sub-sections

### 通用规则 / General rules

	•	目录来自清洗后的 XHTML TOC generated from cleaned XHTML
	•	重复 h1 不重复展示 Duplicate titles removed
	•	无标题 → 退化为单层 Fallback to single-level if no headings
	•	过滤无效标题 Empty/invalid titles skipped
	•	自动生成 anchor Anchors generated automatically

---

## 🖼️ Image Compression / 图片压缩

- 强制 JPEG Force JPEG
- 默认 width=1000 quality=60 Default width=1000 quality=60
- 循环压缩直到 ≤5MB Compress repeatedly until ≤5MB
- 不删除图片 Do not delete images

---

## 📦 Project Structure / 项目结构
	•	src/cli.js：CLI 入口 / CLI entry
	•	src/input.js：输入解析 / input parsing
	•	src/loader.js：网页抓取 / fetching
	•	src/extractor.js：正文提取 / extraction
	•	src/cleaner.js：HTML 清洗 / cleaning
	•	src/images.js：图片处理 / image processing
	•	src/epub.js：EPUB 构建 / EPUB builder
	•	src/profiles/：站点规则 / site profiles
	•	scripts/smoke.js：测试脚本 / smoke test

---

## ⚙️ Requirements / 环境要求
	•	Node.js 20.11+
	•	npm 10+

依赖锁定在 package.json 和 package-lock.json，克隆或上传到 GitHub 后，macOS 和 Windows 可使用相同命令安装。
Dependencies are locked via package.json and package-lock.json, ensuring consistent installation across macOS and Windows.

---

## 🧠 Design Philosophy

Text-first  
Size-controlled  
Reader-friendly  

---

## 📄 License

MIT
