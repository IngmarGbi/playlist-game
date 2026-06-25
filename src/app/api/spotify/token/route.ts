import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const accessToken = req.cookies.get('sp_access_token')?.value
  const refreshToken = req.cookies.get('sp_refresh_token')?.value
  const expiresAt = Number(req.cookies.get('sp_expires_at')?.value ?? 0)
  const displayName = req.cookies.get('sp_display_name')?.value ?? null

  if (!refreshToken) return NextResponse.json({ connected: false })

  // Token still valid
  if (accessToken && Date.now() < expiresAt - 60_000) {
    return NextResponse.json({ connected: true, access_token: accessToken, display_name: displayName })
  }

  // Refresh
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: 'Basic ' + Buffer.from(
        `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`
      ).toString('base64'),
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  })

  const data = await res.json()
  if (!data.access_token) return NextResponse.json({ connected: false })

  const newExpiresAt = Date.now() + data.expires_in * 1000
  const response = NextResponse.json({ connected: true, access_token: data.access_token, display_name: displayName })
  const cookieOpts = { httpOnly: true, path: '/', maxAge: 3600 }
  response.cookies.set('sp_access_token', data.access_token, cookieOpts)
  response.cookies.set('sp_expires_at', String(newExpiresAt), cookieOpts)
  if (data.refresh_token) {
    response.cookies.set('sp_refresh_token', data.refresh_token, { httpOnly: true, path: '/', maxAge: 60 * 60 * 24 * 30 })
  }
  return response
}
