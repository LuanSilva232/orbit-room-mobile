import { NextResponse, type NextRequest } from 'next/server';

const ALLOWED_METHODS = new Set([
  'DELETE',
  'GET',
  'HEAD',
  'OPTIONS',
  'PATCH',
  'POST',
  'PUT',
]);
const ALLOWED_HEADERS = new Set([
  'accept',
  'authorization',
  'content-type',
  'x-requested-with',
]);

function getAllowedOrigins(): Set<string> {
  return new Set(
    (process.env.ORBIT_ROOM_MOBILE_ORIGINS ?? '')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean)
  );
}

function setCorsHeaders(response: NextResponse, origin: string): NextResponse {
  response.headers.set('Access-Control-Allow-Origin', origin);
  response.headers.set('Access-Control-Allow-Credentials', 'true');
  response.headers.set(
    'Access-Control-Allow-Methods',
    [...ALLOWED_METHODS].join(', ')
  );
  response.headers.set(
    'Access-Control-Allow-Headers',
    [...ALLOWED_HEADERS].join(', ')
  );
  response.headers.set('Access-Control-Max-Age', '600');

  const vary = response.headers.get('Vary');
  if (!vary?.split(',').some((value) => value.trim().toLowerCase() === 'origin')) {
    response.headers.set('Vary', vary ? `${vary}, Origin` : 'Origin');
  }

  return response;
}

export function proxy(request: NextRequest) {
  const origin = request.headers.get('origin');
  if (!origin || !getAllowedOrigins().has(origin)) {
    return NextResponse.next();
  }

  if (request.method === 'OPTIONS') {
    const requestedMethod = request.headers
      .get('access-control-request-method')
      ?.toUpperCase();
    const requestedHeaders =
      request.headers
        .get('access-control-request-headers')
        ?.split(',')
        .map((header) => header.trim().toLowerCase())
        .filter(Boolean) ?? [];

    if (
      !requestedMethod ||
      !ALLOWED_METHODS.has(requestedMethod) ||
      requestedHeaders.some((header) => !ALLOWED_HEADERS.has(header))
    ) {
      return new NextResponse(null, { status: 403 });
    }

    return setCorsHeaders(new NextResponse(null, { status: 204 }), origin);
  }

  return setCorsHeaders(NextResponse.next(), origin);
}

export const config = {
  matcher: '/api/:path*',
};
