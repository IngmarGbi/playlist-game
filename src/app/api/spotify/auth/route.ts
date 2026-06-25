import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const roomId = req.nextUrl.searchParams.get('roomId') ?? ''

  const params = new URLSearchParams({
    client_id: process.env.NEXT_PUBLIC_SPOTIFY_CLIENT_ID!,
    response_type: 'code',
    redirect_uri: process.env.SPOTIFY_REDIRECT_URI!,
    scope: 'streaming user-read-email user-read-private user-modify-playback-state',
    state: roomId,
  })

  return NextResponse.redirect(`https://accounts.spotify.com/authorize?${params}`)
}
