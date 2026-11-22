import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { Public } from './decorators/public.decorator';
import { GoogleExchangeDto } from './dto/google-exchange.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { GoogleAuthService } from './google/google-auth.service';
import {
  clearedRefreshCookie,
  pickRefreshToken,
  refreshCookie,
} from './refresh-cookie';
import { AuthenticatedRequest } from './types/authenticated-request';

// The refresh token goes out only as an httpOnly cookie (see
// refresh-cookie.ts); response bodies carry the access token alone.
const SESSION_EXAMPLE = {
  accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  tokenType: 'Bearer',
  expiresIn: 900,
};
const COOKIE_NOTE =
  'The refresh token is set as the httpOnly flowstate_rt cookie (Path=/api/auth), never returned in the body.';

/** Render terminates TLS in front of the app, so trust its forwarded proto. */
function isHttps(request: Request) {
  return request.secure || request.headers['x-forwarded-proto'] === 'https';
}

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly googleAuth: GoogleAuthService,
  ) {}

  // Public because the browser navigates here directly (no Authorization
  // header on a top-level navigation) - the nonce, not a session, is what
  // ties the flow to its initiator.
  @Public()
  @Get('google/start')
  @ApiOperation({
    summary: 'Begin Google sign-in',
    description:
      'Browser navigation, not an XHR. Redirects to Google with PKCE. Responds 503 if Google sign-in is not configured.',
  })
  @ApiQuery({
    name: 'nonce',
    description:
      'Random value the dashboard keeps in sessionStorage (min 16 chars)',
  })
  @ApiQuery({
    name: 'returnTo',
    required: false,
    description: 'Dashboard path to land on after sign-in',
  })
  @ApiResponse({ status: 302, description: 'Redirect to Google' })
  @ApiResponse({ status: 503, description: 'Google sign-in not configured' })
  async googleStart(
    @Query('returnTo') returnTo: unknown,
    @Query('nonce') nonce: unknown,
    @Res() res: Response,
  ) {
    res.redirect(
      HttpStatus.FOUND,
      await this.googleAuth.buildAuthorizationUrl(returnTo, nonce),
    );
  }

  @Public()
  @Get('google/callback')
  @ApiOperation({
    summary: 'Google OAuth redirect target',
    description:
      'Called by Google, not by clients. Always redirects to the dashboard: /auth/callback?code=… on success, /login?error=… on failure.',
  })
  @ApiResponse({ status: 302, description: 'Redirect to the dashboard' })
  async googleCallback(
    @Query() query: Record<string, unknown>,
    @Res() res: Response,
  ) {
    res.redirect(HttpStatus.FOUND, await this.googleAuth.handleCallback(query));
  }

  @Public()
  @Post('google/exchange')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Exchange a sign-in handoff code for a session',
    description: `Single-use: the code is deleted on first exchange, and the nonce must match the one passed to /auth/google/start. ${COOKIE_NOTE}`,
  })
  @ApiResponse({
    status: 200,
    description: 'Signed in',
    schema: { example: SESSION_EXAMPLE },
  })
  @ApiResponse({
    status: 401,
    description: 'Code invalid, expired, already used, or nonce mismatch',
  })
  async googleExchange(
    @Body() dto: GoogleExchangeDto,
    @Req() request: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { refreshToken, ...session } = await this.googleAuth.exchangeHandoff(
      dto.code,
      dto.nonce,
    );
    res.setHeader('Set-Cookie', refreshCookie(refreshToken, isHttps(request)));
    return session;
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Refresh access token',
    description: `Issues a new access token from the refresh-token cookie (or, for a session started before the cookie, a refreshToken in the body), rotating the refresh token. ${COOKIE_NOTE}`,
  })
  @ApiResponse({
    status: 200,
    description: 'Tokens refreshed successfully',
    schema: {
      example: { accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' },
    },
  })
  @ApiResponse({ status: 401, description: 'Invalid or expired refresh token' })
  async refresh(
    @Body() dto: RefreshTokenDto,
    @Req() request: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const presented = pickRefreshToken(
      request.headers.cookie,
      dto.refreshToken,
    );
    if (!presented) throw new UnauthorizedException('Invalid refresh token');
    try {
      const { refreshToken, ...session } =
        await this.authService.refresh(presented);
      res.setHeader(
        'Set-Cookie',
        refreshCookie(refreshToken, isHttps(request)),
      );
      return session;
    } catch (error) {
      // A rejected token is useless - drop the cookie with the 401. Anything
      // else (database down) leaves it: the session may still be good.
      if (error instanceof UnauthorizedException) {
        res.setHeader('Set-Cookie', clearedRefreshCookie(isHttps(request)));
      }
      throw error;
    }
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Log out',
    description:
      'Revokes the refresh token (cookie, or body for a pre-cookie session) and clears the cookie. Requires a valid Bearer access token in the Authorization header.',
  })
  @ApiResponse({
    status: 200,
    description: 'Logout successful',
    schema: { example: { success: true } },
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - missing or invalid access token',
  })
  async logout(
    @Req() request: AuthenticatedRequest,
    @Body() dto: RefreshTokenDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    res.setHeader('Set-Cookie', clearedRefreshCookie(isHttps(request)));
    const presented = pickRefreshToken(
      request.headers.cookie,
      dto.refreshToken,
    );
    // No token, or one already spent or expired: nothing left to revoke,
    // and the browser is signed out either way.
    if (!presented) return { success: true };
    try {
      return await this.authService.logout(request.user.sub, presented);
    } catch (error) {
      if (error instanceof UnauthorizedException) return { success: true };
      throw error;
    }
  }
}
