import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  const { room_id, song_id, voter_id, voted_for_player_id } = await req.json()
  if (!room_id || !song_id || !voter_id || !voted_for_player_id) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('votes')
    .upsert(
      { room_id, song_id, voter_id, voted_for_player_id },
      { onConflict: 'song_id,voter_id' }
    )
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function GET(req: NextRequest) {
  const song_id = req.nextUrl.searchParams.get('song_id')
  if (!song_id) return NextResponse.json({ error: 'Missing song_id' }, { status: 400 })

  const { data, error } = await supabase
    .from('votes')
    .select('*')
    .eq('song_id', song_id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
