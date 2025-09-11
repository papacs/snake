import { query } from '@/lib/db';
import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { player_name, score } = await request.json();
    
    await query(
      'INSERT INTO player_score (player_name, score) VALUES ($1, $2)',
      [player_name, score]
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error saving score:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to save score' },
      { status: 500 }
    );
  }
}
