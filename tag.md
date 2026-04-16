# MarkFlow 更新日志

## v0.4.0 (2026-04-16)

### 新增
- 设置面板：齿轮按钮 → 下拉菜单 → 拖拽设置 Modal
- 拖拽设置：可选包含时间/来源，保存后生效
- Metadata fallback：content script 未发送时自动从活动标签页获取 URL/标题
- 视频 URL 拖拽识别，输出 `[▶ Video](url)` 格式
- 点击扩展图标开关侧边栏
- Modal 弹窗从阴影浮现动画（blur + scale + fade）
- 按钮 active 按压反馈（scale 90% + 半透明回弹）
- 下拉菜单弹性展开动画（overshoot 缓动）
- 齿轮旋转动效

### 优化
- Copy 按钮改为图标，与 Clear/Settings 统一风格
- Header/Footer 统一高度 h-8
- 下载日志移入设置菜单
- 字符计数改用 useEffect 修复始终为 0

### 修复
- 图片 fetch 返回 undefined 时的崩溃
- Metadata 管线全链路日志（content script + background + sidepanel）

## v0.3.0 (2026-04-16)

### 新增
- 点击扩展图标开关侧边栏（openPanelOnActionClick）
- 视频拖拽支持，输出 `[▶ Video](url)` 链接格式

### 修复
- 修复字符计数始终为 0 的问题（useCallback → useEffect）
- 修复图片 fetch 返回 undefined 时的崩溃
- Header 和 Footer 统一高度为 h-8
- Copy 按钮去掉 disabled 条件
- Background SW 添加日志便于排查

## v0.2.0 (2026-04-16)

### 新增
- 环形缓冲区日志系统（100KB 上限，新日志覆盖旧的）
- 日志下载按钮，方便排查问题
- GitHub Actions CI（push/PR 自动 typecheck + build）
- GitHub Actions Release（打 tag 自动 build + zip + 发布）

### 修复
- 移除 `stopPropagation()` 修复编辑器无法输入的问题
- 同步读取 DataTransfer 数据，修复 Chrome 清空拖拽数据的 bug
- 修复 `fetchImageViaBg` 返回 undefined 时的崩溃问题
- Header 去除重复的 MarkFlow 标题
- Copy 按钮去掉 disabled 条件

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
