-- 聊天功能数据库迁移
-- 添加对话和消息表

-- 对话表
CREATE TABLE IF NOT EXISTS `conversations` (
  `id` int NOT NULL AUTO_INCREMENT,
  `userId1` int NOT NULL COMMENT '用户1ID',
  `userId2` int NOT NULL COMMENT '用户2ID',
  `unreadCount` int DEFAULT '0' COMMENT '未读消息数',
  `createdAt` timestamp DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_user_pair` (`userId1`, `userId2`),
  KEY `idx_user1` (`userId1`),
  KEY `idx_user2` (`userId2`),
  KEY `idx_updated` (`updatedAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 消息表
CREATE TABLE IF NOT EXISTS `messages` (
  `id` int NOT NULL AUTO_INCREMENT,
  `conversationId` int NOT NULL COMMENT '对话ID',
  `senderId` int NOT NULL COMMENT '发送者ID',
  `receiverId` int NOT NULL COMMENT '接收者ID',
  `content` text NOT NULL COMMENT '消息内容',
  `filteredContent` text COMMENT '过滤后的内容',
  `isFiltered` tinyint DEFAULT '0' COMMENT '是否被过滤',
  `type` enum('text','image','location') DEFAULT 'text' COMMENT '消息类型',
  `status` enum('sending','sent','delivered','read','failed','filtered') DEFAULT 'sent' COMMENT '消息状态',
  `createdAt` timestamp DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_conversation` (`conversationId`),
  KEY `idx_sender` (`senderId`),
  KEY `idx_receiver` (`receiverId`),
  KEY `idx_created` (`createdAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 联系方式解锁表（用户付费后获取飞手联系方式）
CREATE TABLE IF NOT EXISTS `contact_unlocks` (
  `id` int NOT NULL AUTO_INCREMENT,
  `userId` int NOT NULL COMMENT '用户ID',
  `pilotId` int NOT NULL COMMENT '飞手ID',
  `taskId` int COMMENT '关联任务ID',
  `orderId` int COMMENT '支付订单ID',
  `contactType` enum('phone','wechat','both') DEFAULT 'phone' COMMENT '解锁的联系方式类型',
  `pilotPhone` varchar(20) COMMENT '飞手手机号',
  `pilotWechat` varchar(50) COMMENT '飞手微信号',
  `unlockFee` decimal(10,2) NOT NULL COMMENT '解锁费用',
  `status` enum('pending','paid','expired') DEFAULT 'pending' COMMENT '状态',
  `expiredAt` datetime COMMENT '过期时间',
  `createdAt` timestamp DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_user_pilot` (`userId`, `pilotId`),
  KEY `idx_user` (`userId`),
  KEY `idx_pilot` (`pilotId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 添加任务表的服务费字段（如果不存在）
-- ALTER TABLE `tasks` ADD COLUMN `serviceFee` decimal(10,2) DEFAULT '0.00' COMMENT '服务费' AFTER `platformFeeRate`;
