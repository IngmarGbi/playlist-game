import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'

export async function GET(_req: NextRequest) {
  const cookieStore = await cookies()
  const accessToken = cookieStore.get('sp_access_token')?.value
  if (!accessToken) return NextResponse.json({ devices: [] })

  const res = await fetch('https://api.spotify.com/v1/me/player/devices', {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  const data = await res.json()
  return NextResponse.json({ devices: data.devices ?? [] })
}
