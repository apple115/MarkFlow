# MarkFlow 更新日志

## v0.7.0 (2026-04-23)

### 新增
- 跨设备同步：基于 Yjs CRDT + WebRTC P2P + Cloudflare Worker 的实时同步
- Room Key 系统：安装自动生成，可分享给其他设备绑定
- 加密快照：PBKDF2 + AES-GCM 端到端加密，Worker 只处理密文
- KV 持久化：每 30s 自动上传快照，关闭时 flush，启动时自动恢复
- WebRTC 信令：Worker 仅做 ICE candidate 转发，数据走 P2P 直连
- 同步设置面板：展示 Room Key、绑定设备、自定义后端地址、连接状态
- 本地优先：离线编辑不受影响，恢复网络后自动合并

### 后端
- Cloudflare Worker (Hono)：signaling + KV snapshot API
- 免费额度：个人使用完全免费

## v0.6.0 (2026-04-22)

### 新增
- 清空确认弹窗：下拉式确认，点击垃圾桶 toggle 开关，编辑器背景变灰 + 模糊
- Lightbox 缩放平移：滚轮缩放、拖拽平移、鼠标跟随缩放中心
- DropdownMenu 共享组件：设置菜单和清空弹窗统一圆角、阴影、动画速度和缓动曲线

### 优化
- 清空按钮不再直接执行，增加确认步骤防止误操作
- 清空弹窗去除取消按钮，再次点击垃圾桶即可关闭

## v0.5.0 (2026-04-19)

### 新增
- 区域截图：网页上框选任意区域，自动裁剪插入编辑器
- 截图下拉菜单：Full page / Select region 两种模式
- 编辑器图片点击放大（lightbox）
- 复制双格式：同时输出 HTML + Markdown，Notes 粘贴正常显示图片
- 拖拽映射动效：脉冲扩散 + 文档类型预览（TEXT / IMAGE / LINK / FILE）
- 截图自动压缩：宽度限制 1200px、JPEG 压缩、Base64 < 100KB
- 图片 Base64 > 100KB 自动降级为 Markdown 链接
- 列表序号转义（`1. ` → `1\. `），避免被解析为有序列表
- content script 区域选择遮罩（支持 Escape 取消）

### 优化
- Copy 按钮改为双格式输出（text/html + text/plain）
- HTML 输出图片限制 width=600，粘贴到 Notes 不再巨大
- 拖拽图片 fetch 失败时降级为链接格式
- 压缩阈值从 500KB 降到 100KB

### 修复
- 截图 Tab 定位：sidepanel 中 `tabs.query` 不再返回自身
- content script 异步消息响应（sendResponse + return true）
- 区域截图 DPR 缩放坐标偏移

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
