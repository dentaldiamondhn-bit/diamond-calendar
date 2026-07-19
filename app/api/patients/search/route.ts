import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('q');

    if (!query || query.trim() === '') {
      return NextResponse.json([]);
    }

    const searchQuery = query.toLowerCase().trim();

    const { data, error } = await supabase
      .from('patients')
      .select('*')
      .or(`nombre_completo.ilike.%${searchQuery}%,numero_identidad.ilike.%${searchQuery}%,telefono.ilike.%${searchQuery}%`)
      .limit(10)
      .order('nombre_completo', { ascending: true });

    if (error) {
      console.error('Error searching patients:', error);
      return NextResponse.json({ error: 'Error searching patients' }, { status: 500 });
    }

    return NextResponse.json(data || []);
  } catch (error) {
    console.error('Unexpected error in patient search:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
