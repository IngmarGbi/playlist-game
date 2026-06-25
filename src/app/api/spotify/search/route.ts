import { NextRequest, NextResponse } from 'next/server'
import { getSpotifyToken } from '@/lib/spotify'

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')
  if (!q) return NextResponse.json({ tracks: [] })
  const token = await getSpotifyToken()
  const res = await fetch(
    `https://api.spotify.com/v1/search?q=${encodeURIComponent(q)}&type=track&limit=8`,
    { headers: { Authorization: `Bearer ${token}` } }
  )
  const data = await res.json()
  if (!res.ok) return NextResponse.json({ error: data, token_preview: token?.slice(0, 20) }, { status: 500 })
  return NextResponse.json({ tracks: data.tracks?.items ?? [] })
}
