import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  let accessToken = req.cookies.get('sp_access_token')?.value
  const refreshToken = req.cookies.get('sp_refresh_token')?.value
  const expiresAt = Number(req.cookies.get('sp_expires_at')?.value ?? 0)

  if (!refreshToken) return NextResponse.json({ devices: [], error: 'not_connected' })

  // Refresh if expired
  if (!accessToken || Date.now() >= expiresAt - 60_000) {
    const res = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization: 'Basic ' + Buffer.from(
          `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`
        ).toString('base64'),
      },
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }),
    })
    const data = await res.json()
    if (!data.access_token) return NextResponse.json({ devices: [], error: 'refresh_failed' })
    accessToken = data.access_token
  }

  const res = await fetch('https://api.spotify.com/v1/me/player/devices', {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    return NextResponse.json({ devices: [], error: err })
  }

  const data = await res.json()
  return NextResponse.json({ devices: data.devices ?? [] })
}
