import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';

/**
 * Header-secret guard for operator-only endpoints. There is no admin role
 * on the User model (this is a single-tenant portfolio project), so the
 * simplest honest option is a shared secret set via env — never falls back
 * to "open" if the secret is unset, since that would silently expose the
 * DLQ to anyone.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const provided = request.headers['x-admin-secret'];
    const expected = this.configService.get<string>('ADMIN_SECRET');

    if (!expected) {
      throw new UnauthorizedException(
        'Admin endpoints are disabled: ADMIN_SECRET is not configured',
      );
    }

    if (provided !== expected) {
      throw new UnauthorizedException('Invalid admin secret');
    }

    return true;
  }
}
