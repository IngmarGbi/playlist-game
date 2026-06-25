import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  const { room_id, player_id, spotify_track_id, title, artist, cover_url } = await req.json()
  if (!room_id || !player_id || !spotify_track_id) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  // Check player hasn't exceeded songs_per_player limit
  const [{ data: room }, { count: playerSongCount }, { count: totalCount }] = await Promise.all([
    supabase.from('rooms').select('songs_per_player').eq('id', room_id).single(),
    supabase.from('songs').select('*', { count: 'exact', head: true }).eq('room_id', room_id).eq('player_id', player_id),
    supabase.from('songs').select('*', { count: 'exact', head: true }).eq('room_id', room_id),
  ])

  const limit = room?.songs_per_player ?? 1
  if ((playerSongCount ?? 0) >= limit) {
    return NextResponse.json({ error: 'Song limit reached' }, { status: 409 })
  }

  // Get next position
  const count = totalCount

  const { data, error } = await supabase
    .from('songs')
    .insert({ room_id, player_id, spotify_track_id, title, artist, cover_url, position: count ?? 0 })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function GET(req: NextRequest) {
  const room_id = req.nextUrl.searchParams.get('room_id')
  if (!room_id) return NextResponse.json({ error: 'Missing room_id' }, { status: 400 })

  const { data, error } = await supabase
    .from('songs')
    .select('*')
    .eq('room_id', room_id)
    .order('position')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
