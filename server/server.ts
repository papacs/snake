import { createServer } from 'http';
import { Server } from 'socket.io';
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

const httpServer = createServer();
const io = new Server(httpServer, {
  cors: {
    origin: "*", // Allow all origins, will be configured in production
    methods: ["GET", "POST"]
  }
});

type Position = {
  x: number;
  y: number;
};

type Player = {
  id: string;
  name: string;
  isReady: boolean;
  snake: Position[];
  direction: 'UP' | 'DOWN' | 'LEFT' | 'RIGHT';
  color: string;
  isAlive: boolean;
  score: number;
};

type Room = {
  id: string;
  players: Map<string, Player>;
  foods: Position[];
  gameStarted: boolean;
  gameLoop: NodeJS.Timeout | null;
  ownerId: string;
  gridSize: number;
  usedColors: Set<number>; // Track which color indices are in use
};

const rooms = new Map<string, Room>();
const GAME_SPEED = 300;

const colors = ["bg-green-500", "bg-blue-500", "bg-yellow-500", "bg-purple-500"];

function generateFood(currentFoods: Position[], allSnakes: Position[][], gridSize: number): Position {
  let newFood: Position;
  const flatSnakes = allSnakes.flat();
  do {
    newFood = {
      x: Math.floor(Math.random() * gridSize),
      y: Math.floor(Math.random() * gridSize),
    };
  } while (
    currentFoods.some(f => f.x === newFood.x && f.y === newFood.y) ||
    flatSnakes.some(s => s.x === newFood.x && s.y === newFood.y)
  );
  return newFood;
}

function generateRandomPosition(gridSize: number, existingPositions: Position[], minDistance: number = 3): Position {
  let newPosition: Position;
  let attempts = 0;
  const maxAttempts = 100; // 防止无限循环
  
  do {
    newPosition = {
      x: Math.floor(Math.random() * gridSize),
      y: Math.floor(Math.random() * gridSize),
    };
    attempts++;
    
    // 检查是否与现有位置太近
    const tooClose = existingPositions.some(pos => {
      const dx = Math.abs(pos.x - newPosition.x);
      const dy = Math.abs(pos.y - newPosition.y);
      return dx < minDistance && dy < minDistance;
    });
    
    // 如果尝试次数过多或者位置合适，就返回
    if (attempts >= maxAttempts || !tooClose) {
      break;
    }
  } while (true);
  
  return newPosition;
}

// 获取唯一的颜色索引
function getUniqueColorIndex(usedColors: Set<number>): number {
  // 尝试找到未使用的颜色索引
  for (let i = 0; i < colors.length; i++) {
    if (!usedColors.has(i)) {
      return i;
    }
  }
  
  // 如果所有颜色都被使用，随机选择一个（虽然不应该发生，因为有4个颜色和最多4个玩家）
  return Math.floor(Math.random() * colors.length);
}

// 从颜色字符串获取颜色索引
function getColorIndexFromColor(color: string): number {
  return colors.indexOf(color);
}

function startGameLoop(roomId: string) {
    const room = rooms.get(roomId);
    if (!room || room.gameLoop) return;

  room.gameLoop = setInterval(() => {
    const room = rooms.get(roomId);
    if (!room) return;

    let currentPlayers = Array.from(room.players.values());
    let currentFoods = [...room.foods];
    const nextHeads: { [playerId: string]: Position } = {};

    // 1. Calculate next head position
    currentPlayers.forEach(player => {
      if (!player.isAlive) return;
      const head = { ...player.snake[0] };
      switch (player.direction) {
        case "UP": head.y -= 1; break;
        case "DOWN": head.y += 1; break;
        case "LEFT": head.x -= 1; break;
        case "RIGHT": head.x += 1; break;
      }
      nextHeads[player.id] = head;
    });

    const playersToKill = new Set<string>();
    const lengthToAdd: { [playerId: string]: number } = {};

    // 2. Detect collisions
    currentPlayers.forEach(player => {
        if (!player.isAlive) return;
        const head = nextHeads[player.id];

        if (head.x < 0 || head.x >= room.gridSize || head.y < 0 || head.y >= room.gridSize) playersToKill.add(player.id);
        if (player.snake.some(segment => segment.x === head.x && segment.y === head.y)) playersToKill.add(player.id);

        currentPlayers.forEach(otherPlayer => {
            if (!otherPlayer.isAlive) return;
            if (otherPlayer.snake.some(segment => segment.x === head.x && segment.y === head.y)) playersToKill.add(player.id);
            if (player.id !== otherPlayer.id && head.x === nextHeads[otherPlayer.id]?.x && head.y === nextHeads[otherPlayer.id]?.y) {
                if (player.snake.length > otherPlayer.snake.length) {
                    playersToKill.add(otherPlayer.id);
                    lengthToAdd[player.id] = (lengthToAdd[player.id] || 0) + otherPlayer.snake.length;
                } else if (player.snake.length < otherPlayer.snake.length) {
                    playersToKill.add(player.id);
                    lengthToAdd[otherPlayer.id] = (lengthToAdd[otherPlayer.id] || 0) + player.snake.length;
                } else {
                    playersToKill.add(player.id);
                    playersToKill.add(otherPlayer.id);
                }
            }
        });
    });

    // 3. Update players state
    playersToKill.forEach(playerId => {
        const player = room.players.get(playerId);
        if (player) {
            player.isAlive = false;
            currentFoods.push(...player.snake);
        }
    });

    // 4. Update snake positions and handle food
    let ateFood = false;
    currentPlayers.forEach(player => {
        if (!player.isAlive) return;
        const head = nextHeads[player.id];
        let newSnake = [head, ...player.snake];
        let foodIndex = currentFoods.findIndex(f => f.x === head.x && f.y === head.y);

        if (foodIndex !== -1) {
            currentFoods.splice(foodIndex, 1);
            ateFood = true;
            player.score += 10;
        } else {
            newSnake.pop();
        }

        if (lengthToAdd[player.id]) {
            const tail = newSnake[newSnake.length - 1];
            for (let i = 0; i < lengthToAdd[player.id]; i++) newSnake.push({ ...tail });
        }
        player.snake = newSnake;
    });

    if (ateFood) {
        const allSnakes = Array.from(room.players.values()).map(p => p.snake);
        currentFoods.push(generateFood(currentFoods, allSnakes, room.gridSize));
    }
    room.foods = currentFoods;

    // 5. Check for game over
    const alivePlayers = Array.from(room.players.values()).filter(p => p.isAlive);
    if (alivePlayers.length === 0 && room.players.size > 0) {
        if (room.gameLoop) clearInterval(room.gameLoop);
        room.gameLoop = null;
        room.gameStarted = false; // Allow reset
        
        // Find the last player to die or the one with the highest score to declare a winner
        let winner = null;
        if (room.players.size === 1) {
            winner = Array.from(room.players.values())[0];
        } else if (room.players.size > 1) {
            winner = Array.from(room.players.values()).sort((a, b) => b.score - a.score)[0];
        }
        io.to(roomId).emit('gameOver', winner);
    }


    io.to(roomId).emit('gameState', {
      players: Array.from(room.players.values()),
      foods: room.foods,
      gridSize: room.gridSize,
    });
  }, GAME_SPEED);
}

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  socket.on('createRoom', ({ playerName, gridSize }) => {
    const roomId = generateUniqueRoomId(); // 6位数字房间号
    const playerId = socket.id;
    const newPlayer: Player = {
      id: playerId,
      name: playerName,
      isReady: false,
      snake: [],
      direction: 'RIGHT',
      color: colors[0],
      isAlive: false,
      score: 0,
    };
    const room: Room = {
      id: roomId,
      players: new Map([[playerId, newPlayer]]),
      foods: [],
      gameStarted: false,
      gameLoop: null,
      ownerId: playerId,
      gridSize: gridSize || 17,
      usedColors: new Set([0]), // First player uses color index 0
    };
    rooms.set(roomId, room);
    socket.join(roomId);
    socket.emit('roomCreated', { roomId, playerId, isOwner: true });
    io.to(roomId).emit('updatePlayers', Array.from(room.players.values()));
  });

  socket.on('joinRoom', ({ roomId, playerName }) => {
    const room = rooms.get(roomId);
    if (room && room.players.size < 4) {
      const playerId = socket.id;
      const colorIndex = getUniqueColorIndex(room.usedColors);
      const newPlayer: Player = {
        id: playerId,
        name: playerName,
        isReady: false,
        snake: [],
        direction: 'RIGHT',
        color: colors[colorIndex],
        isAlive: false,
        score: 0,
      };
      room.players.set(playerId, newPlayer);
      room.usedColors.add(colorIndex);
      socket.join(roomId);
      socket.emit('joinedRoom', { roomId, playerId, isOwner: false });
      io.to(roomId).emit('updatePlayers', Array.from(room.players.values()));
    } else {
      socket.emit('error', 'Room not found or is full');
    }
  });

  socket.on('playerReady', ({ roomId }) => {
    const room = rooms.get(roomId);
    if (room) {
      const player = room.players.get(socket.id);
      if (player) {
        player.isReady = !player.isReady;
        io.to(roomId).emit('updatePlayers', Array.from(room.players.values()));
      }
    }
  });

  socket.on('startGame', ({ roomId }) => {
    const room = rooms.get(roomId);
    if (room && room.ownerId === socket.id && Array.from(room.players.values()).every(p => p.isReady)) {
      room.gameStarted = true;
      // Initialize game state with random positions that don't overlap
      const existingPositions: Position[] = [];
      room.players.forEach(player => {
        const randomPosition = generateRandomPosition(room.gridSize, existingPositions, 3);
        player.snake = [randomPosition];
        player.direction = 'RIGHT';
        player.isAlive = true;
        player.isReady = false; // Reset for next game
        player.score = 0;
        existingPositions.push(randomPosition);
      });
      const allSnakes = Array.from(room.players.values()).map(p => p.snake);
      room.foods = [generateFood([], allSnakes, room.gridSize)];
      
      io.to(roomId).emit('gameStarted', { 
        players: Array.from(room.players.values()),
        foods: room.foods,
        gridSize: room.gridSize 
      });
      startGameLoop(roomId);
    }
  });

  socket.on('changeDirection', ({ roomId, direction }) => {
    const room = rooms.get(roomId);
    const player = room?.players.get(socket.id);
    if (player && player.isAlive) {
        const currentDirection = player.direction;
        if (direction === 'UP' && currentDirection !== 'DOWN') player.direction = direction;
        if (direction === 'DOWN' && currentDirection !== 'UP') player.direction = direction;
        if (direction === 'LEFT' && currentDirection !== 'RIGHT') player.direction = direction;
        if (direction === 'RIGHT' && currentDirection !== 'LEFT') player.direction = direction;
    }
  });
  
  socket.on('resetGame', ({ roomId }) => {
    const room = rooms.get(roomId);
    if (room && room.ownerId === socket.id) {
        if (room.gameLoop) {
            clearInterval(room.gameLoop);
            room.gameLoop = null;
        }
        room.gameStarted = false;
        room.players.forEach(p => {
            p.isReady = false;
            p.isAlive = false;
            p.snake = [];
        });
        io.to(roomId).emit('gameReset');
        io.to(roomId).emit('updatePlayers', Array.from(room.players.values()));
    }
  });

  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
    rooms.forEach((room, roomId) => {
      if (room && room.players.has(socket.id)) {
        const disconnectedPlayer = room.players.get(socket.id);
        if (disconnectedPlayer) {
          // Release the color used by the disconnected player
          const colorIndex = getColorIndexFromColor(disconnectedPlayer.color);
          if (colorIndex !== -1) {
            room.usedColors.delete(colorIndex);
          }
        }
        room.players.delete(socket.id);
        if (room.players.size === 0) {
          if (room.gameLoop) clearInterval(room.gameLoop);
          rooms.delete(roomId);
        } else {
          if (room.ownerId === socket.id) {
            room.ownerId = Array.from(room.players.keys())[0];
          }
          io.to(roomId).emit('updatePlayers', Array.from(room.players.values()));
        }
      }
    });
  });
});

const port = process.env.PORT || 3001;
httpServer.listen(port, () => {
  console.log(`Socket.IO server running on http://localhost:${port}`);
});
