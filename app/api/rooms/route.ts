import { NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';

// 生成6位随机数字的房间号
function generateRoomId(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// 生成唯一的6位数字房间号
function generateUniqueRoomId(): string {
  let roomId: string;
  do {
    roomId = generateRoomId();
  } while (rooms.has(roomId)); // 确保房间号唯一
  return roomId;
}

type Player = {
  playerId: string;
  playerName: string;
  isReady: boolean;
};

type Room = {
  roomId: string;
  ownerId: string;
  players: Player[];
  gameStarted: boolean;
};

// Use in-memory storage instead of a database
const rooms = new Map<string, Room>();

export async function POST(request: Request) {
  try {
    const { action, playerName, roomId, playerId } = await request.json();

    switch (action) {
      case 'create': {
        const newRoomId = generateUniqueRoomId(); // 6位数字房间号
        const newPlayerId = uuidv4();
        const owner: Player = { playerId: newPlayerId, playerName, isReady: false };
        
        const newRoom: Room = {
          roomId: newRoomId,
          ownerId: newPlayerId,
          players: [owner],
          gameStarted: false,
        };
        
        rooms.set(newRoomId, newRoom);

        return NextResponse.json({ 
          success: true, 
          roomId: newRoomId,
          playerId: newPlayerId,
          isOwner: true
        });
      }
      case 'join': {
        const room = rooms.get(roomId);
        if (!room) {
          return NextResponse.json(
            { success: false, message: 'Room not found' },
            { status: 404 }
          );
        }

        if (room.players.length >= 4) {
          return NextResponse.json({ success: false, message: 'Room is full' }, { status: 403 });
        }

        const joiningPlayerId = uuidv4();
        const newPlayer: Player = { playerId: joiningPlayerId, playerName, isReady: false };
        room.players.push(newPlayer);

        return NextResponse.json({ 
          success: true, 
          roomId,
          playerId: joiningPlayerId,
          isOwner: false
        });
      }
      case 'ready': {
        const room = rooms.get(roomId);
        const player = room?.players.find(p => p.playerId === playerId);

        if (player) {
          player.isReady = !player.isReady; // Toggle ready state
        }
        
        const allReady = room?.players.every(p => p.isReady) ?? false;
        return NextResponse.json({ success: true, allReady });
      }
      case 'start': {
        const room = rooms.get(roomId);
        if (!room) {
            return NextResponse.json({ success: false, message: 'Room not found' }, { status: 404 });
        }
        if (room.ownerId !== playerId) {
            return NextResponse.json({ success: false, message: 'Only room owner can start game' }, { status: 403 });
        }
        
        room.gameStarted = true;
        return NextResponse.json({ success: true });
      }
      case 'reset': {
        const room = rooms.get(roomId);
        if (room) {
          room.gameStarted = false;
          // Reset player ready state as well
          room.players.forEach(p => p.isReady = false);
        }
        return NextResponse.json({ success: true });
      }
      default:
        return NextResponse.json(
          { success: false, message: 'Invalid action' },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error('Room operation failed:', error);
    return NextResponse.json(
      { success: false, message: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const roomId = searchParams.get('roomId');

    if (!roomId) {
        return NextResponse.json({ success: false, message: 'Room ID is required' }, { status: 400 });
    }

    const room = rooms.get(roomId);

    if (!room) {
        return NextResponse.json({ success: false, message: 'Room not found' }, { status: 404 });
    }
    
    // Remap to snake_case to match client expectations if needed, or just keep it camelCase
    const playersData = room.players.map(p => ({
        player_id: p.playerId,
        player_name: p.playerName,
        is_ready: p.isReady,
    }));

    return NextResponse.json({ 
        success: true, 
        players: playersData,
        gameStarted: room.gameStarted,
    });
  } catch (error) {
    console.error('Failed to get room state:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to get room state' },
      { status: 500 }
    );
  }
}
