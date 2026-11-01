import { NextResponse } from 'next/server'
import { revokeSessionToken } from '@/lib/auth'

export async function POST(req: Request) {
  const authorization = req.headers.get('authorization')
  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim()
  if (!token) {
    return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 })
  }

  try {
    await revokeSessionToken(token)
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Não foi possível encerrar a sessão mobile.', error)
    return NextResponse.json({ error: 'LOGOUT_FAILED' }, { status: 500 })
  }
}
