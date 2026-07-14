import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AuditAction, User } from '@prisma/client';
import * as argon2 from 'argon2';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { AccessTokenPayload, RefreshTokenPayload } from './types/jwt-payload';

const ACCESS_TOKEN_TTL = '15m';
const REFRESH_TOKEN_TTL = '7d';
const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  async register(dto: RegisterDto) {
    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (existingUser) {
      throw new ConflictException('Email is already registered');
    }

    const passwordHash = await argon2.hash(dto.password);
    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        passwordHash,
        name: dto.name,
      },
    });

    await this.writeAuditLog(user.id, AuditAction.CREATE, 'users', user.id);
    return this.toAuthResponse(await this.issueTokenPair(user));
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });

    if (!user || !(await argon2.verify(user.passwordHash, dto.password))) {
      throw new UnauthorizedException('Invalid credentials');
    }

    await this.writeAuditLog(user.id, AuditAction.LOGIN, 'users', user.id);
    return this.toAuthResponse(await this.issueTokenPair(user));
  }

  async refresh(refreshToken: string) {
    const payload = await this.verifyRefreshToken(refreshToken);
    const storedToken = await this.prisma.refreshToken.findUnique({
      where: { id: payload.jti },
      include: { user: true },
    });

    if (
      !storedToken ||
      storedToken.revokedAt ||
      storedToken.expiresAt <= new Date() ||
      !(await argon2.verify(storedToken.tokenHash, refreshToken))
    ) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const tokenPair = await this.issueTokenPair(storedToken.user);

    await this.prisma.refreshToken.update({
      where: { id: storedToken.id },
      data: {
        revokedAt: new Date(),
        replacedByTokenId: tokenPair.refreshTokenId,
      },
    });
    await this.writeAuditLog(
      storedToken.userId,
      AuditAction.TOKEN_REFRESH,
      'refresh_tokens',
      storedToken.id,
    );

    return {
      accessToken: tokenPair.accessToken,
      refreshToken: tokenPair.refreshToken,
    };
  }

  async logout(userId: string, refreshToken: string) {
    const payload = await this.verifyRefreshToken(refreshToken);

    if (payload.sub !== userId) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    await this.prisma.refreshToken.updateMany({
      where: {
        id: payload.jti,
        userId,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });
    await this.writeAuditLog(userId, AuditAction.LOGOUT, 'users', userId);

    return { success: true };
  }

  private async issueTokenPair(user: Pick<User, 'id' | 'email'>) {
    const accessToken = await this.signAccessToken(user);
    const refreshTokenId = randomUUID();
    const refreshToken = await this.signRefreshToken(user, refreshTokenId);

    await this.prisma.refreshToken.create({
      data: {
        id: refreshTokenId,
        tokenHash: await argon2.hash(refreshToken),
        userId: user.id,
        expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
      },
    });

    return {
      accessToken,
      refreshToken,
      refreshTokenId,
      tokenType: 'Bearer',
      expiresIn: 15 * 60,
    };
  }

  private toAuthResponse(tokenPair: {
    accessToken: string;
    refreshToken: string;
    tokenType: string;
    expiresIn: number;
  }) {
    return {
      accessToken: tokenPair.accessToken,
      refreshToken: tokenPair.refreshToken,
      tokenType: tokenPair.tokenType,
      expiresIn: tokenPair.expiresIn,
    };
  }

  private signAccessToken(user: Pick<User, 'id' | 'email'>) {
    const payload: AccessTokenPayload = {
      sub: user.id,
      email: user.email,
    };

    return this.jwtService.signAsync(payload, {
      secret: this.getAccessSecret(),
      expiresIn: ACCESS_TOKEN_TTL,
    });
  }

  private signRefreshToken(user: Pick<User, 'id' | 'email'>, tokenId: string) {
    const payload: RefreshTokenPayload = {
      sub: user.id,
      email: user.email,
      jti: tokenId,
    };

    return this.jwtService.signAsync(payload, {
      secret: this.getRefreshSecret(),
      expiresIn: REFRESH_TOKEN_TTL,
    });
  }

  private async verifyRefreshToken(refreshToken: string) {
    try {
      return await this.jwtService.verifyAsync<RefreshTokenPayload>(
        refreshToken,
        {
          secret: this.getRefreshSecret(),
        },
      );
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  private getAccessSecret() {
    return this.config.getOrThrow<string>('JWT_ACCESS_SECRET');
  }

  private getRefreshSecret() {
    return this.config.getOrThrow<string>('JWT_REFRESH_SECRET');
  }

  private writeAuditLog(
    userId: string,
    action: AuditAction,
    entityType: string,
    entityId?: string,
  ) {
    return this.prisma.auditLog.create({
      data: {
        userId,
        action,
        entityType,
        entityId,
      },
    });
  }
}
