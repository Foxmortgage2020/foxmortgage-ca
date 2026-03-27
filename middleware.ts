import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  // Portal auth middleware — currently passthrough
  // TODO: Replace with Clerk auth when keys are configured
  return NextResponse.next()
}

export const config = {
  matcher: ['/portal/:path*'],
}
