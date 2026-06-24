import { NextRequest, NextResponse } from 'next/server'
import { searchTracks } from '@/lib/spotify'

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get('q')
  if (!q) return NextResponse.json({ tracks: [] })
  const tracks = await searchTracks(q)
  return NextResponse.json({ tracks })
}
