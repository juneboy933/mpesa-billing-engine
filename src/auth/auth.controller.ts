import { Body, Controller, Post, Put, Req, Res } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { Public } from '../common/decorators/public.decorator';
import { AuthService } from './auth.service';
import { SignInDto } from './dto/sign-in.dto';
import { SetPasswordDto } from './dto/set-password.dto';

export const SESSION_COOKIE = 'niaflow_session';
const SESSION_MAX_AGE = 24 * 60 * 60 * 1000;
const sessionSameSite = () => process.env.NODE_ENV === 'production' ? 'none' : 'lax';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
    constructor(private readonly authService: AuthService) {}

    @Public()
    @Post('signin')
    @ApiOperation({ summary: 'Sign in with merchant phone and password' })
    @ApiResponse({ status: 201, description: 'Session created and stored in an HttpOnly cookie' })
    async signIn(@Body() dto: SignInDto, @Res({ passthrough: true }) response: Response) {
        const session = await this.authService.signIn(dto.phone, dto.password);
        response.cookie(SESSION_COOKIE, session.sessionId, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: sessionSameSite(),
            maxAge: SESSION_MAX_AGE,
            path: '/',
        });
        return { merchantId: session.merchantId, expiresIn: session.expiresIn };
    }

    @Put('password')
    @ApiOperation({ summary: 'Set a password for an authenticated merchant account' })
    async setPassword(@Req() request: Request & { merchant?: { id: string } }, @Body() dto: SetPasswordDto) {
        return this.authService.setPassword(request.merchant!.id, dto.password, dto.currentPassword);
    }

    @Public()
    @Post('logout')
    @ApiOperation({ summary: 'Invalidate the current browser session' })
    @ApiResponse({ status: 200, description: 'Session invalidated' })
    async logout(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
        const sessionId = readCookie(request.headers.cookie, SESSION_COOKIE);
        if (sessionId) {
            await this.authService.logout(sessionId);
        }
        response.clearCookie(SESSION_COOKIE, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: sessionSameSite(), path: '/' });
        return { message: 'Logged out' };
    }
}

export function readCookie(cookieHeader: string | undefined, name: string) {
    const match = cookieHeader?.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`));
    return match ? decodeURIComponent(match.slice(name.length + 1)) : undefined;
}
