import { NextResponse } from 'next/server'
import { getSql } from '@/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    await getSql()`SELECT 1`
    return NextResponse.json(
      { success: true, data: { message: 'ok' } },
      { headers: { 'Cache-Control': 'no-store' } }
    )
  } catch (error) {
    console.error('A verificação de saúde da API falhou.', error)
    return NextResponse.json(
      { success: false, error: 'API_DATABASE_UNAVAILABLE' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } }
    )
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204 })
}
