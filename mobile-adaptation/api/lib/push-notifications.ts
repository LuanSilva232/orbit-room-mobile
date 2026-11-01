import 'server-only'

import { ensureDb, getSql } from '@/db'
import { ValidationError } from '@/lib/errors'

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send'

export type PushPlatform = 'android' | 'ios'

export type PushNotification = {
  title: string
  body: string
  data: {
    route: '/messages' | '/rooms' | '/social'
    type: 'direct-message' | 'conversation-request' | 'room-invite' | 'friend-request'
    conversationId?: string
    roomId?: string
  }
}

function isExpoPushToken(token: string): boolean {
  return token.length <= 256 && /^Expo(nent)?PushToken\[[A-Za-z0-9._-]+\]$/.test(token)
}

export async function registerMobilePushToken(
  userId: string,
  token: string,
  platform: PushPlatform
): Promise<void> {
  if (!isExpoPushToken(token)) throw new ValidationError('Token de notificações inválido.')
  await ensureDb()
  const now = Date.now()
  await getSql()`
    INSERT INTO mobile_push_tokens (token, user_id, platform, created_at, updated_at)
    VALUES (${token}, ${userId}, ${platform}, ${now}, ${now})
    ON CONFLICT (token)
    DO UPDATE SET user_id = EXCLUDED.user_id,
                  platform = EXCLUDED.platform,
                  updated_at = EXCLUDED.updated_at
  `
}

export async function removeMobilePushToken(userId: string, token: string): Promise<void> {
  if (!isExpoPushToken(token)) throw new ValidationError('Token de notificações inválido.')
  await ensureDb()
  await getSql()`
    DELETE FROM mobile_push_tokens WHERE token = ${token} AND user_id = ${userId}
  `
}

export async function sendPushToUser(
  userId: string,
  notification: PushNotification
): Promise<void> {
  try {
    await ensureDb()
    const rows = await getSql()<{ token: string }[]>`
      SELECT token FROM mobile_push_tokens WHERE user_id = ${userId}
    `
    if (rows.length === 0) return

    const accessToken = process.env.EXPO_ACCESS_TOKEN
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'Accept-Encoding': 'gzip, deflate',
      'Content-Type': 'application/json',
    }
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`

    for (let offset = 0; offset < rows.length; offset += 100) {
      const batch = rows.slice(offset, offset + 100)
      try {
        const response = await fetch(EXPO_PUSH_URL, {
          method: 'POST',
          headers,
          body: JSON.stringify(
            batch.map(({ token }) => ({
              to: token,
              title: notification.title,
              body: notification.body,
              data: notification.data,
              channelId: 'orbit-room',
              priority: 'high',
            }))
          ),
          signal: AbortSignal.timeout(10_000),
        })
        if (!response.ok) {
          console.error(`Expo Push API respondeu com HTTP ${response.status}.`)
          continue
        }

        const payload: unknown = await response.json()
        if (
          typeof payload !== 'object' ||
          payload === null ||
          !('data' in payload) ||
          !Array.isArray(payload.data)
        ) {
          console.error('Expo Push API retornou uma resposta inválida.')
          continue
        }

        const invalidTokens: string[] = []
        for (const [index, ticket] of payload.data.entries()) {
          if (
            typeof ticket !== 'object' ||
            ticket === null ||
            !('status' in ticket) ||
            ticket.status !== 'error'
          ) {
            continue
          }
          const details =
            'details' in ticket && typeof ticket.details === 'object' && ticket.details !== null
              ? ticket.details
              : null
          const errorCode =
            details && 'error' in details && typeof details.error === 'string'
              ? details.error
              : 'UNKNOWN'
          if (errorCode === 'DeviceNotRegistered' && batch[index]) {
            invalidTokens.push(batch[index].token)
          } else {
            const message = 'message' in ticket ? ticket.message : undefined
            console.error('Expo Push API não aceitou uma notificação:', message ?? errorCode)
          }
        }

        if (invalidTokens.length > 0) {
          await getSql()`
            DELETE FROM mobile_push_tokens WHERE token = ANY(${invalidTokens})
          `
        }
      } catch (error) {
        console.error('Não foi possível enviar notificações pelo Expo Push API.', error)
      }
    }
  } catch (error) {
    console.error('Não foi possível preparar notificações push para o usuário.', error)
  }
}
