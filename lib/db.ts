import { Pool } from 'pg';

const connectionString = 'postgresql://neondb_owner:npg_cSmjYy7zxP3p@ep-misty-butterfly-adqy7h18-pooler.c-2.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require';

const pool = new Pool({
  connectionString,
});

export const query = (text: string, params?: (string | number | boolean | null)[]) => pool.query(text, params);

export const createPlayerScoreTable = async () => {
  await query(`
    CREATE TABLE IF NOT EXISTS player_score (
      player_name varchar NOT NULL,
      score int NOT NULL,
      created_at timestamp DEFAULT CURRENT_TIMESTAMP
    )
  `);
};

export const createGameTables = async () => {
  await query(`
    CREATE TABLE IF NOT EXISTS game_rooms (
      room_id varchar PRIMARY KEY,
      owner_id varchar NOT NULL,
      game_started boolean DEFAULT false,
      created_at timestamp DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await query(`
    CREATE TABLE IF NOT EXISTS players (
      player_id varchar PRIMARY KEY,
      room_id varchar REFERENCES game_rooms(room_id),
      player_name varchar NOT NULL,
      is_ready boolean DEFAULT false,
      joined_at timestamp DEFAULT CURRENT_TIMESTAMP
    )
  `);
};
