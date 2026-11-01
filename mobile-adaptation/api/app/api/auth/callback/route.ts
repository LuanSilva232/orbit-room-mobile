import { NextResponse, type NextRequest } from 'next/server'
import {
  completeGoogleLogin,
  createMobileAuthCode,
  getOAuthRedirectTo,
  SESSION_COOKIE,
  SESSION_DAYS,
} from '@/lib/auth'

// Callback do Google: valida e abre a sessão.
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code')
  const state = req.nextUrl.searchParams.get('state')
  const loginUrl = new URL('/login', req.url)
  let mobileFlow = false

  if (state) {
    try {
      const redirectTo = await getOAuthRedirectTo(state)
      if (redirectTo) {
        const mobileRedirectTo = new URL(redirectTo, req.url)
        mobileFlow = mobileRedirectTo.pathname === '/api/auth/mobile/callback'
      }
    } catch (error) {
      console.error('Não foi possível verificar o fluxo OAuth.', error)
    }
  }

  const mobileRedirect = (error?: string, authCode?: string) => {
    const url = new URL('orbitroom://auth/callback')
    if (error) url.searchParams.set('error', error)
    if (authCode) url.searchParams.set('code', authCode)
    return NextResponse.redirect(url)
  }

  if (!code || !state) {
    if (mobileFlow) return mobileRedirect('INVALID_CALLBACK')
    loginUrl.searchParams.set('error', 'INVALID_CALLBACK')
    return NextResponse.redirect(loginUrl)
  }

  try {
    const { redirectTo, sessionToken, userId } = await completeGoogleLogin(code, state)
    const mobileRedirectTo = new URL(redirectTo, req.url)
    if (mobileRedirectTo.pathname === '/api/auth/mobile/callback') {
      const authCode = await createMobileAuthCode(
        userId,
        mobileRedirectTo.searchParams.get('challenge') ?? ''
      )
      return mobileRedirect(undefined, authCode)
    }
    const res = NextResponse.redirect(new URL(redirectTo, req.url))
    res.cookies.set(SESSION_COOKIE, sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: SESSION_DAYS * 24 * 60 * 60,
    })
    return res
  } catch (err) {
    const codeName =
      err instanceof Error && 'code' in err ? (err as { code: string }).code : 'error'
    if (mobileFlow) return mobileRedirect(codeName)
    loginUrl.searchParams.set('error', codeName)
    return NextResponse.redirect(loginUrl)
  }
}
