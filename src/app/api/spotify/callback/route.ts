import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code')
  const roomId = req.nextUrl.searchParams.get('state') ?? ''

  if (!code) return NextResponse.redirect(new URL('/', req.url))

  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: 'Basic ' + Buffer.from(
        `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`
      ).toString('base64'),
    },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: process.env.SPOTIFY_REDIRECT_URI!,
    }),
  })

  const data = await res.json()
  if (!data.access_token) return NextResponse.redirect(new URL('/', req.url))

  // Fetch display name
  const userRes = await fetch('https://api.spotify.com/v1/me', {
    headers: { Authorization: `Bearer ${data.access_token}` },
  })
  const user = await userRes.json()

  const expiresAt = Date.now() + data.expires_in * 1000
  const redirect = NextResponse.redirect(new URL(`/host/${roomId}`, req.url))

  const cookieOpts = { httpOnly: true, path: '/' }
  redirect.cookies.set('sp_access_token', data.access_token, { ...cookieOpts, maxAge: 3600 })
  redirect.cookies.set('sp_refresh_token', data.refresh_token, { ...cookieOpts, maxAge: 60 * 60 * 24 * 30 })
  redirect.cookies.set('sp_expires_at', String(expiresAt), { ...cookieOpts, maxAge: 60 * 60 * 24 * 30 })
  redirect.cookies.set('sp_display_name', user.display_name ?? user.id ?? 'Spotify user', { ...cookieOpts, maxAge: 60 * 60 * 24 * 30 })

  return redirect
}
