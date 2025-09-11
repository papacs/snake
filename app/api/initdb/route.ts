import { createPlayerScoreTable, createGameTables } from '@/lib/db';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    await createPlayerScoreTable();
    await createGameTables();
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Database initialization failed:', error);
    return NextResponse.json(
      { success: false, error: 'Database initialization failed' },
      { status: 500 }
    );
  }
}
