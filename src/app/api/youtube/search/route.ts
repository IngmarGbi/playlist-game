import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')
  if (!q) return NextResponse.json({ tracks: [] })

  const key = process.env.YOUTUBE_API_KEY
  if (!key) return NextResponse.json({ error: 'YouTube API key not configured' }, { status: 500 })

  const res = await fetch(
    `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&videoCategoryId=10&maxResults=8&q=${encodeURIComponent(q)}&key=${key}`
  )
  const data = await res.json()
  if (!res.ok) return NextResponse.json({ error: data }, { status: 500 })

  const tracks = (data.items ?? []).map((item: {
    id: { videoId: string }
    snippet: { title: string; channelTitle: string; thumbnails: { medium?: { url: string }; default?: { url: string } } }
  }) => ({
    id: item.id.videoId,
    name: item.snippet.title,
    artists: [{ name: item.snippet.channelTitle }],
    album: { images: [{ url: item.snippet.thumbnails.medium?.url ?? item.snippet.thumbnails.default?.url ?? '' }] },
    uri: `youtube:${item.id.videoId}`,
    duration_ms: 0,
    provider: 'youtube',
  }))

  return NextResponse.json({ tracks })
}
