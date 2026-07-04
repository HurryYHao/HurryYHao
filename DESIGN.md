# DESIGN.md

## 气质与意象
指挥中心——暗色控制台前，多屏数据实时流淌，决策者一瞥即得全局。专业、冷静、高效，如雷达屏上规律闪烁的光点。

## 配色方案
- 主色：Teal（数据感、专业、冷静），已在 globals.css 配置
- 数据图表：chart-1~5 变量（teal 系深浅渐变）
- 状态色：recording=primary，analyzing=amber，ended=muted，error=destructive
- 背景：light mode 近白微青灰，dark mode 深蓝灰

## 字体排版
- 中文优先 PingFang SC / Microsoft YaHei，已在 font-sans 配置
- 数据数字使用 font-mono（等宽，对齐数值列）
- 标题层级清晰：h1=2xl/bold，h2=xl/semibold，h3=lg/medium

## 布局与响应式
- 左侧导航栏（Sidebar）+ 右侧内容区，最小宽度 1024px
- 卡片网格展示核心指标（2~4列自适应）
- 表格区域可横向滚动

## 设计禁忌
- 禁止蓝紫色渐变
- 禁止卡通/手绘风格图标
- 禁止大面积留白无数据
- 禁止闪烁/高频动画（数据分析场景需安静）
