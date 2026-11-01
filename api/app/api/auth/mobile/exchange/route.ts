import { NextResponse } from 'next/server'
import { exchangeMobileAuthCode } from '@/lib/auth'

export async function POST(req: Request) {
  let code: unknown
  let verifier: unknown
  try {
    const body = (await req.json()) as { code?: unknown; verifier?: unknown }
    code = body.code
    verifier = body.verifier
  } catch {
    return NextResponse.json({ error: 'INVALID_INPUT' }, { status: 400 })
  }

  if (typeof code !== 'string' || typeof verifier !== 'string') {
    return NextResponse.json({ error: 'INVALID_MOBILE_CODE' }, { status: 400 })
  }

  try {
    const token = await exchangeMobileAuthCode(code, verifier)
    return NextResponse.json({ token })
  } catch (error) {
    console.error('Não foi possível trocar o código de login mobile.', error)
    const codeName =
      error instanceof Error && 'code' in error
        ? String((error as { code: string }).code)
        : 'MOBILE_LOGIN_FAILED'
    return NextResponse.json({ error: codeName }, { status: 401 })
  }
}
