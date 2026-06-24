import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  const { room_id, name } = await req.json()
  if (!room_id || !name) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })

  const { data, error } = await supabase
    .from('players')
    .insert({ room_id, name: name.trim() })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function GET(req: NextRequest) {
  const room_id = req.nextUrl.searchParams.get('room_id')
  if (!room_id) return NextResponse.json({ error: 'Missing room_id' }, { status: 400 })

  const { data, error } = await supabase
    .from('players')
    .select('*')
    .eq('room_id', room_id)
    .order('created_at')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
