import { z } from "zod";
import { router, publicProcedure, protectedProcedure, adminProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { db } from "../db";
import { users, loginLogs } from "../../drizzle/schema";
import { eq, and, desc } from "drizzle-orm";
import { sdk } from "../_core/sdk";
import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { getSessionCookieOptions } from "../_core/cookies";

// SMS验证码存储（生产环境应使用Redis）
const smsCodes = new Map<string, { code: string; expiresAt: number }>();

// 验证码有效期：5分钟
const SMS_CODE_EXPIRY = 5 * 60 * 1000;

// 生成6位验证码
function generateCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// 记录登录日志
async function logLogin(
  userId: number,
  provider: string,
  success: boolean,
  ipAddress?: string,
  userAgent?: string,
  failureReason?: string
) {
  try {
    await db.insert(loginLogs).values({
      userId,
      provider,
      ipAddress: ipAddress || "unknown",
      userAgent: userAgent || null,
      success,
      failureReason: failureReason || null,
    });
  } catch (error) {
    console.error("[Auth] Failed to log login:", error);
  }
}

/**
 * 认证路由 - 手机号登录、OAuth登录、注册
 */
export const authRouter = router({
  /**
   * 获取当前登录用户信息
   */
  me: publicProcedure.query((opts) => opts.ctx.user),

  /**
   * 退出登录
   */
  logout: publicProcedure.mutation(({ ctx }) => {
    const cookieOptions = getSessionCookieOptions(ctx.req);
    ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
    return { success: true } as const;
  }),

  /**
   * 发送手机验证码
   */
  sendSmsCode: publicProcedure
    .input(
      z.object({
        phone: z.string().regex(/^1[3-9]\d{9}$/, "请输入正确的手机号"),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { phone } = input;
      const ipAddress = ctx.req.ip || "unknown";
      const userAgent = ctx.req.headers["user-agent"] || undefined;

      // 检查频繁发送（每个IP每分钟最多5次）
      const recentCodes = Array.from(smsCodes.entries())
        .filter(([, v]) => Date.now() - v.expiresAt < 60000)
        .filter(([k]) => k.startsWith(ipAddress));

      if (recentCodes.length >= 5) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: "发送过于频繁，请稍后再试",
        });
      }

      // 生成验证码
      const code = generateCode();
      const expiresAt = Date.now() + SMS_CODE_EXPIRY;

      // 存储验证码
      smsCodes.set(phone, { code, expiresAt });

      // TODO: 集成实际短信服务（阿里云、腾讯云等）
      // 这里模拟发送成功
      console.log(`[SMS] 验证码已发送到 ${phone}: ${code}`);

      // 模拟短信发送（开发环境直接返回）
      return {
        success: true,
        message: "验证码已发送",
        // 开发环境返回验证码方便测试
        devCode: process.env.NODE_ENV === "development" ? code : undefined,
      };
    }),

  /**
   * 手机号登录/注册
   */
  phoneLogin: publicProcedure
    .input(
      z.object({
        phone: z.string().regex(/^1[3-9]\d{9}$/, "请输入正确的手机号"),
        code: z.string().length(6, "验证码为6位数字"),
        role: z.enum(["customer", "pilot"]).default("customer"),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { phone, code, role } = input;
      const ipAddress = ctx.req.ip || "unknown";
      const userAgent = ctx.req.headers["user-agent"] || undefined;

      // 验证验证码
      const stored = smsCodes.get(phone);
      if (!stored) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "请先获取验证码",
        });
      }

      if (Date.now() > stored.expiresAt) {
        smsCodes.delete(phone);
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "验证码已过期，请重新获取",
        });
      }

      if (stored.code !== code) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "验证码错误",
        });
      }

      // 验证成功，删除验证码
      smsCodes.delete(phone);

      // 查找或创建用户
      const openId = `phone_${phone}`;
      let [existingUser] = await db
        .select()
        .from(users)
        .where(eq(users.openId, openId))
        .limit(1);

      let user;
      if (existingUser) {
        // 更新最后登录时间
        await db
          .update(users)
          .set({ lastSignedIn: new Date() })
          .where(eq(users.id, existingUser.id));
        user = { ...existingUser, lastSignedIn: new Date() };
      } else {
        // 创建新用户
        const [newUser] = await db
          .insert(users)
          .values({
            openId,
            phone,
            name: `用户${phone.slice(-4)}`,
            role,
            loginMethod: "phone",
            lastSignedIn: new Date(),
          })
          .returning();
        user = newUser;
      }

      // 记录登录日志
      await logLogin(user.id, "phone", true, ipAddress, userAgent);

      // 创建会话
      const sessionToken = await sdk.createSessionToken(user.openId, {
        name: user.name || "",
        expiresInMs: ONE_YEAR_MS,
      });

      // 设置Cookie
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.cookie(COOKIE_NAME, sessionToken, {
        ...cookieOptions,
        maxAge: ONE_YEAR_MS,
      });

      return {
        success: true,
        user: {
          id: user.id,
          name: user.name,
          phone: user.phone,
          role: user.role,
          avatar: user.avatar,
        },
      };
    }),

  /**
   * OAuth登录 - 微信
   */
  wechatLogin: publicProcedure
    .input(
      z.object({
        code: z.string(),
        role: z.enum(["customer", "pilot"]).default("customer"),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { code, role } = input;
      const ipAddress = ctx.req.ip || "unknown";
      const userAgent = ctx.req.headers["user-agent"] || undefined;

      // TODO: 集成微信OAuth
      // 这里模拟微信登录
      const mockOpenId = `wechat_${code}`;
      const mockUserInfo = {
        openId: mockOpenId,
        name: `微信用户${code.slice(0, 4)}`,
        avatar: null,
      };

      // 查找或创建用户
      let [existingUser] = await db
        .select()
        .from(users)
        .where(eq(users.openId, mockUserInfo.openId))
        .limit(1);

      let user;
      if (existingUser) {
        await db
          .update(users)
          .set({ lastSignedIn: new Date() })
          .where(eq(users.id, existingUser.id));
        user = { ...existingUser, lastSignedIn: new Date() };
      } else {
        const [newUser] = await db
          .insert(users)
          .values({
            openId: mockUserInfo.openId,
            name: mockUserInfo.name,
            avatar: mockUserInfo.avatar,
            role,
            loginMethod: "wechat",
            lastSignedIn: new Date(),
          })
          .returning();
        user = newUser;
      }

      await logLogin(user.id, "wechat", true, ipAddress, userAgent);

      const sessionToken = await sdk.createSessionToken(user.openId, {
        name: user.name || "",
        expiresInMs: ONE_YEAR_MS,
      });

      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.cookie(COOKIE_NAME, sessionToken, {
        ...cookieOptions,
        maxAge: ONE_YEAR_MS,
      });

      return {
        success: true,
        user: {
          id: user.id,
          name: user.name,
          role: user.role,
          avatar: user.avatar,
        },
      };
    }),

  /**
   * OAuth登录 - 支付宝
   */
  alipayLogin: publicProcedure
    .input(
      z.object({
        code: z.string(),
        role: z.enum(["customer", "pilot"]).default("customer"),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { code, role } = input;
      const ipAddress = ctx.req.ip || "unknown";
      const userAgent = ctx.req.headers["user-agent"] || undefined;

      // TODO: 集成支付宝OAuth
      const mockOpenId = `alipay_${code}`;
      const mockUserInfo = {
        openId: mockOpenId,
        name: `支付宝用户${code.slice(0, 4)}`,
        avatar: null,
      };

      let [existingUser] = await db
        .select()
        .from(users)
        .where(eq(users.openId, mockUserInfo.openId))
        .limit(1);

      let user;
      if (existingUser) {
        await db
          .update(users)
          .set({ lastSignedIn: new Date() })
          .where(eq(users.id, existingUser.id));
        user = { ...existingUser, lastSignedIn: new Date() };
      } else {
        const [newUser] = await db
          .insert(users)
          .values({
            openId: mockUserInfo.openId,
            name: mockUserInfo.name,
            avatar: mockUserInfo.avatar,
            role,
            loginMethod: "alipay",
            lastSignedIn: new Date(),
          })
          .returning();
        user = newUser;
      }

      await logLogin(user.id, "alipay", true, ipAddress, userAgent);

      const sessionToken = await sdk.createSessionToken(user.openId, {
        name: user.name || "",
        expiresInMs: ONE_YEAR_MS,
      });

      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.cookie(COOKIE_NAME, sessionToken, {
        ...cookieOptions,
        maxAge: ONE_YEAR_MS,
      });

      return {
        success: true,
        user: {
          id: user.id,
          name: user.name,
          role: user.role,
          avatar: user.avatar,
        },
      };
    }),

  /**
   * OAuth登录 - Google
   */
  googleLogin: publicProcedure
    .input(
      z.object({
        idToken: z.string(),
        role: z.enum(["customer", "pilot"]).default("customer"),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { idToken, role } = input;
      const ipAddress = ctx.req.ip || "unknown";
      const userAgent = ctx.req.headers["user-agent"] || undefined;

      // TODO: 集成Google OAuth验证idToken
      // 实际应使用Google OAuth验证idToken并获取用户信息
      const mockUserInfo = {
        openId: `google_${idToken.slice(0, 20)}`,
        email: "user@gmail.com",
        name: "Google User",
        avatar: null,
      };

      let [existingUser] = await db
        .select()
        .from(users)
        .where(eq(users.openId, mockUserInfo.openId))
        .limit(1);

      let user;
      if (existingUser) {
        await db
          .update(users)
          .set({ lastSignedIn: new Date() })
          .where(eq(users.id, existingUser.id));
        user = { ...existingUser, lastSignedIn: new Date() };
      } else {
        const [newUser] = await db
          .insert(users)
          .values({
            openId: mockUserInfo.openId,
            email: mockUserInfo.email,
            name: mockUserInfo.name,
            avatar: mockUserInfo.avatar,
            role,
            loginMethod: "google",
            lastSignedIn: new Date(),
          })
          .returning();
        user = newUser;
      }

      await logLogin(user.id, "google", true, ipAddress, userAgent);

      const sessionToken = await sdk.createSessionToken(user.openId, {
        name: user.name || "",
        expiresInMs: ONE_YEAR_MS,
      });

      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.cookie(COOKIE_NAME, sessionToken, {
        ...cookieOptions,
        maxAge: ONE_YEAR_MS,
      });

      return {
        success: true,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          avatar: user.avatar,
        },
      };
    }),

  /**
   * 游客登录（仅获取设备ID）
   */
  guestLogin: publicProcedure.mutation(async ({ ctx }) => {
    // 游客只有设备ID，不创建真实账户
    const guestId = `guest_${Date.now()}_${Math.random().toString(36).slice(2)}`;

    return {
      success: true,
      guestId,
      message: "游客登录成功，功能受限",
    };
  }),

  /**
   * 获取登录日志（管理员）
   */
  getLoginLogs: adminProcedure
    .input(
      z.object({
        userId: z.number().optional(),
        page: z.number().default(1),
        pageSize: z.number().default(50),
      })
    )
    .query(async ({ input }) => {
      const { userId, page, pageSize } = input;

      const conditions = [];
      if (userId) {
        conditions.push(eq(loginLogs.userId, userId));
      }

      const logs = await db
        .select()
        .from(loginLogs)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(loginLogs.timestamp))
        .limit(pageSize)
        .offset((page - 1) * pageSize);

      return logs;
    }),
});
