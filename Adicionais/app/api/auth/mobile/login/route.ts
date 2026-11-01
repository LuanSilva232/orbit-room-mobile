import { NextResponse } from 'next/server'
import { beginGoogleLogin } from '@/lib/auth'

export async function GET(req: Request) {
  try {
    const challenge = new URL(req.url).searchParams.get('challenge') ?? ''
    if (!/^[a-f0-9]{64}$/.test(challenge)) {
      return NextResponse.json({ error: 'INVALID_MOBILE_CHALLENGE' }, { status: 400 })
    }
    const redirectTo = `/api/auth/mobile/callback?challenge=${encodeURIComponent(challenge)}`
    const { url } = await beginGoogleLogin(redirectTo)
    return NextResponse.redirect(url)
  } catch (error) {
    console.error('Não foi possível iniciar o login mobile.', error)
    const callback = new URL('orbitroom://auth/callback')
    callback.searchParams.set(
      'error',
      error instanceof Error && 'code' in error
        ? String((error as { code: string }).code)
        : 'LOGIN_START_FAILED'
    )
    return NextResponse.redirect(callback)
  }
}
