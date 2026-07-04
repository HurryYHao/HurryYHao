import { NextRequest, NextResponse } from 'next/server';
import { login, getCaptcha, manualLogin, getTokenStatus } from '@/lib/server/auth';

/**
 * GET - 查询Token状态 或 获取验证码
 * ?action=status  → Token状态
 * ?action=captcha → 获取验证码图片
 */
export async function GET(request: NextRequest) {
  try {
    const action = request.nextUrl.searchParams.get('action');

    if (action === 'status') {
      const status = await getTokenStatus();
      return NextResponse.json({ success: true, data: status });
    }

    if (action === 'captcha') {
      const captcha = await getCaptcha();
      return NextResponse.json({
        success: true,
        data: {
          captchaImage: captcha.captchaImage,
          captchaKey: captcha.captchaKey,
        },
      });
    }

    return NextResponse.json({ success: false, error: '缺少 action 参数（status/captcha）' }, { status: 400 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : '未知错误';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

/**
 * POST - 登录
 * { force: true }       → 自动验证码登录
 * { captchaKey, captchaCode } → 手动验证码登录
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // 手动登录
    if (body.captchaKey && body.captchaCode) {
      const result = await manualLogin(body.captchaKey, String(body.captchaCode));
      return NextResponse.json({ success: true, token: result.token, expiresAt: result.expiresAt });
    }

    // 自动登录
    const result = await login(body.force === true);
    return NextResponse.json({ success: true, token: result.token, expiresAt: result.expiresAt });
  } catch (error) {
    const msg = error instanceof Error ? error.message : '未知错误';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
