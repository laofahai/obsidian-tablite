# Tablite

一个快速、功能丰富的 Obsidian CSV/TSV 编辑器，在库中直接编辑表格数据，体验类似 Excel。

[English](README.md)

![Tablite 截图](assets/screenshot.jpg)

## 功能

- **虚拟滚动** — 轻松处理万行级大文件
- **单元格编辑** — 双击即可编辑
- **选中与十字高亮** — 单击选中单元格，行列十字高亮（可开关）
- **列排序** — 点击表头排序
- **列筛选** — 每列独立文本过滤
- **全局搜索** — 全表搜索并高亮匹配
- **自动分隔符检测** — 逗号、分号、制表符、竖线
- **自动编码检测** — UTF-8、GBK、Windows-1252、Shift-JIS
- **表头检测** — 自动识别首行是否为表头，支持手动切换
- **列宽调整** — 拖拽列边框调整宽度
- **右键菜单** — 插入、删除行列
- **撤销重做** — 最多 50 步历史记录
- **原生主题适配** — 自动适配当前主题和明暗模式

## 安装

### 手动安装

1. 从 [最新发布](https://github.com/laofahai/obsidian-tablite/releases) 下载 `tablite-x.x.x.zip`
2. 解压到 `<vault>/.obsidian/plugins/` 目录下
3. 重启 Obsidian，在设置 → 社区插件中启用 **Tablite**

## 使用

在库中打开任意 `.csv` 或 `.tsv` 文件，Tablite 会自动以可编辑表格打开。

| 操作 | 方式 |
|---|---|
| 编辑单元格 | 双击 |
| 选中单元格 | 单击 |
| 排序 | 点击表头 |
| 重命名表头 | 双击表头 |
| 列筛选 | 在表头下方输入框输入 |
| 调整列宽 | 拖拽表头右边缘 |
| 增删行列 | 右键菜单 |
| 撤销 / 重做 | `Ctrl/Cmd+Z` / `Ctrl/Cmd+Shift+Z` |
| 搜索 | 右上角搜索框 |

## 技术栈

- [Preact](https://preactjs.com/) — 轻量 UI 框架
- [TanStack Table](https://tanstack.com/table) — 表格排序筛选
- [TanStack Virtual](https://tanstack.com/virtual) — 行虚拟化
- [PapaParse](https://www.papaparse.com/) — CSV 解析
- [jschardet](https://github.com/nicstredicern/jschardet) — 编码检测

## 开发

```bash
git clone https://github.com/laofahai/obsidian-tablite.git
cd obsidian-tablite
npm install
npm run dev    # 开发模式
npm run build  # 生产构建
```

## 许可

MIT
