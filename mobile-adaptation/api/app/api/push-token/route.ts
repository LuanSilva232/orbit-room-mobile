import { NextResponse } from 'next/server'

import { handleApiError } from '@/lib/api-error-response'
import { UnauthorizedError, ValidationError } from '@/lib/errors'
import { getCurrentUser } from '@/lib/auth'
import {
  registerMobilePushToken,
  removeMobilePushToken,
} from '@/lib/push-notifications'

export const runtime = 'nodejs'

async function requireUser() {
  const user = await getCurrentUser()
  if (!user) throw new UnauthorizedError('Faça login para gerenciar as notificações.')
  return user
}

function readInput(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ValidationError('Corpo da solicitação inválido.')
  }
  return value as Record<string, unknown>
}

export async function POST(request: Request) {
  try {
    const user = await requireUser()
    const body = readInput(await request.json())
    const token = typeof body.token === 'string' ? body.token.trim() : ''
    const platform = body.platform
    if (!token) throw new ValidationError('Token de notificações obrigatório.')
    if (platform !== 'android' && platform !== 'ios') {
      throw new ValidationError('Plataforma inválida.')
    }
    await registerMobilePushToken(user.id, token, platform)
    return NextResponse.json({ success: true, data: { registered: true } })
  } catch (error) {
    return handleApiError(error)
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await requireUser()
    const body = readInput(await request.json())
    const token = typeof body.token === 'string' ? body.token.trim() : ''
    if (!token) throw new ValidationError('Token de notificações obrigatório.')
    await removeMobilePushToken(user.id, token)
    return NextResponse.json({ success: true, data: { removed: true } })
  } catch (error) {
    return handleApiError(error)
  }
}
