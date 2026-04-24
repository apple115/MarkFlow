# MarkFlow

Chrome 侧边栏扩展，从网页拖拽内容到 Markdown 编辑器，自动格式化为结构化笔记。

拖拽文字、图片、链接到侧边栏，即时转为 Markdown。支持全页/区域截图、图片放大、双格式复制（HTML + Markdown）。基于 Yjs + WebRTC P2P 实现跨设备同步，端到端加密，数据不经过第三方。

**本地优先，拖拽即用，无感同步。**

## 功能

- 拖拽网页内容自动转为 Markdown（文字 / 图片 / 链接）
- 全页截图 & 区域截图，自动压缩插入
- 图片点击放大，滚轮缩放 + 拖拽平移
- 双格式复制，粘贴到 Notes 等应用保留格式
- 跨设备实时同步（Yjs CRDT + WebRTC P2P）
- AES-GCM 端到端加密，Cloudflare Worker 免费托管
- 自动 Metadata：时间、来源网站
