import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  // Reuse the token route (handles refresh) by calling it internally
  const tokenRes = await fetch(`${req.nextUrl.origin}/api/spotify/token`, {
    headers: { cookie: req.headers.get('cookie') ?? '' },
  })
  const tokenData = await tokenRes.json()

  if (!tokenData.connected || !tokenData.access_token) {
    return NextResponse.json({ devices: [], error: 'not_connected' })
  }

  const res = await fetch('https://api.spotify.com/v1/me/player/devices', {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  })

  if (!res.ok) {
    const err = await res.json()
    return NextResponse.json({ devices: [], error: err })
  }

  const data = await res.json()
  return NextResponse.json({ devices: data.devices ?? [] })
}
