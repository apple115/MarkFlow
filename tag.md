# MarkFlow 更新日志

## v0.1.0 (2026-04-16)

### 新增
- Chrome MV3 Sidepanel 扩展，支持拖拽网页内容到侧边栏
- Milkdown 无头编辑器，所见即所得编辑 Markdown
- 拖拽内容自动识别：纯文本、HTML、图片 URL、文件
- 图片通过 Background Service Worker 跨域抓取并转 Base64
- Copy 按钮一键复制 Markdown 到剪贴板
- Clear 按钮清空编辑器
- 环形缓冲区日志系统（100KB 上限，新日志覆盖旧的）
- 日志下载按钮，方便排查问题
- 状态指示点（绿色 = 有内容，灰色 = 空）
- GitHub Actions CI（push/PR 自动 typecheck + build）
- GitHub Actions Release（打 tag 自动 build + zip + 发布）

### 修复
- 移除 `stopPropagation()` 修复编辑器无法输入的问题
- 同步读取 DataTransfer 数据，修复 Chrome 清空拖拽数据的 bug
- 修复 `fetchImageViaBg` 返回 undefined 时的崩溃问题
- Header 去除重复的 MarkFlow 标题
- Copy 按钮去掉 disabled 条件
