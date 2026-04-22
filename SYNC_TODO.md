# MarkFlow 同步功能实施计划

> 创建时间：2026-04-22
> 最后更新：2026-04-23

## 后端配置

- [x] Worker 部署到 Cloudflare（`wrangler deploy`）
- [x] 将默认 server URL 替换为实际部署地址
- [x] 支持用户自定义后端地址（设置中可填写自己的 Worker URL）

## 前端集成

- [x] 在右上角"设置"下拉菜单中添加"同步设置"入口
- [x] 点击后展示同步面板（复用现有 Modal 样式），包含：
  - Room Key 展示 + 复制按钮
  - 绑定设备输入框（填入其他设备的 key）
  - 后端地址配置（默认 + 自定义）
  - 同步状态指示
- [x] 所有设置项集成在设置 Modal 中，不做页面跳转

## Yjs 集成

- [x] 安装 yjs + y-prosemirror + @milkdown/utils
- [x] 创建 Yjs doc 并通过 $prose + ySyncPlugin 绑定到 Milkdown
- [x] 实现 WebSocket signaling 客户端（连接 Worker 的 /signaling 端点）
- [x] 实现 WebRTC P2P 数据通道（通过 Worker 信令交换 ICE candidates）
- [x] 定时快照上传（每 30s 加密后 PUT 到 KV）
- [x] 启动时从 KV 恢复快照

## 加密与安全

- [x] 验证 PBKDF2 + AES-GCM 加解密在扩展环境中正常工作
- [x] 快照上传前加密、下载后解密的完整流程测试

## 测试

- [x] 单设备：生成 key → 加密快照 → 上传 → 下载 → 解密验证
- [ ] 双设备：两台设备绑定同一 key → P2P 同步验证
- [ ] 断线重连：离线编辑 → 恢复连接 → 自动合并
