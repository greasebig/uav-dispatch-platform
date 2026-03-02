# UAV调度平台 - 功能待办清单

> 更新时间: 2026-03-02
> 状态: ✅ 全部完成

---

## 已完成功能

### ✅ P0 - 核心功能

- [x] **登录系统**
  - [x] 手机号登录（SMS验证码）
  - [x] 微信登录 (OAuth)
  - [x] 支付宝登录 (OAuth)
  - [x] Google登录 (OAuth)
  - [x] 游客登录

- [x] **管理后台完整功能**
  - [x] 用户管理（查看、搜索、禁用/启用、删除）
  - [x] 飞手资质审核（提交、审核、批准/拒绝）
  - [x] 任务管理（查看详情、强制取消）
  - [x] 统计分析（用户、飞手、订单、收入）

- [x] **飞手资质审核**
  - [x] 资质提交（无人机执照、运营证书等）
  - [x] 资质审核工作流
  - [x] 审核通知

### ✅ P1 - 重要功能

- [x] **地图功能集成**
  - [x] 地理编码（地址转坐标）
  - [x] 逆地理编码（坐标转地址）
  - [x] 距离计算
  - [x] 路径规划
  - [x] 附近地点搜索

- [x] **通知系统**
  - [x] 通知列表获取
  - [x] 未读数量统计
  - [x] 标记已读/全部已读
  - [x] 删除通知
  - [x] 管理员发送系统通知
  - [x] 通知偏好设置

- [x] **数据分析报表**
  - [x] 订单统计报表
  - [x] 任务统计报表
  - [x] 飞手绩效报表
  - [x] 客户统计报表
  - [x] 运营概况

### ✅ P2 - 优化功能

- [x] **安全增强**
  - [x] 速率限制中间件
  - [x] IP白名单中间件
  - [x] 来源验证中间件
  - [x] 账户安全检查
  - [x] 审计日志

- [ ] **性能优化** - 后续版本
- [ ] **更多支付方式** - 后续版本

---

## 系统架构

```
┌─────────────────────────────────────────────────────────┐
│                    用户端 (Mobile)                       │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐     │
│  │  登录   │  │  任务   │  │  聊天   │  │  通知   │     │
│  └─────────┘  └─────────┘  └─────────┘  └─────────┘     │
└─────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│                   后端 API (tRPC)                        │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐     │
│  │ authRouter│ │adminRouter│ │dataRouter│ │ chatRouter│   │
│  └─────────┘  └─────────┘  └─────────┘  └─────────┘     │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐     │
│  │notification│ │configRouter│ │contactRouter│ │paymentRouter│
│  └─────────┘  └─────────┘  └─────────┘  └─────────┘     │
└─────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│              管理后台 (React Frontend)                   │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐     │
│  │ 用户管理 │  │ 任务管理│  │ 资质审核│  │ 数据报表│     │
│  └─────────┘  └─────────┘  └─────────┘  └─────────┘     │
└─────────────────────────────────────────────────────────┘
```

---

## 技术栈

- **后端**: Node.js + Express + tRPC + Drizzle ORM + MySQL
- **前端**: React 19 + Tailwind CSS 4 + shadcn/ui + Recharts
- **移动端**: Flutter (Android/HarmonyOS)
- **地图**: Google Maps API (可配置高德/腾讯/百度)
- **支付**: Stripe
- **实时通信**: WebSocket

---

## 快速开始

### 后端启动
```bash
cd uav-dispatch-platform
npm install
npm run dev
```

### 前端启动
```bash
cd client
npm install
npm run dev
```

### 移动端构建
```bash
cd uav-dispatch-mobile
flutter build apk --release
```

---

## API 文档

### 认证接口
- `POST /api/trpc/auth.phoneLogin` - 手机号登录
- `POST /api/trpc/auth.sendSmsCode` - 发送验证码
- `POST /api/trpc/auth.wechatLogin` - 微信登录
- `POST /api/trpc/auth.alipayLogin` - 支付宝登录
- `POST /api/trpc/auth.googleLogin` - Google登录

### 管理接口
- `GET /api/trpc/admin.getUsers` - 获取用户列表
- `POST /api/trpc/admin.updateUserStatus` - 更新用户状态
- `GET /api/trpc/admin.getQualificationReviews` - 获取资质审核
- `POST /api/trpc/admin.reviewQualification` - 审核资质
- `GET /api/trpc/admin.getStats` - 获取统计数据

### 数据接口
- `GET /api/trpc/data.geocode` - 地理编码
- `GET /api/trpc/data.calculateDistance` - 距离计算
- `GET /api/trpc/data.getOrderReport` - 订单报表
- `GET /api/trpc/data.getPilotPerformanceReport` - 飞手绩效

### 通知接口
- `GET /api/trpc/notification.getNotifications` - 获取通知
- `POST /api/trpc/notification.markAsRead` - 标记已读
- `POST /api/trpc/notification.sendSystemNotification` - 发送系统通知
