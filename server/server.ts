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

// 食物类型定义
const FOOD_TYPES = {
    NORMAL: { id: 1, color: '#ff0000', score: 10, length: 1, lifetime: 15000, name: "普通食物", description: "增加体型并获得基础积分" },
    FREEZE: { id: 2, color: '#00aaff', score: 20, effect: 'freeze', duration: 3000, lifetime: 8000, name: "冰冻果实", description: "束缚目标 3 秒，需提早规划" },
    SPEED: { id: 3, color: '#ff5500', score: 30, effect: 'speed', duration: 5000, speedMultiplier: 2, lifetime: 8000, name: "加速辣椒", description: "5 秒超速疾行，冲刺或逃生利器" },
    SHRINK: { id: 4, color: '#aa00ff', score: 20, effect: 'shrink', value: 3, lifetime: 8000, name: "缩小蘑菇", description: "立刻瘦身 3 节，穿缝躲避更灵活" },
    RAINBOW: { id: 5, color: 'rainbow', score: 50, effect: 'random', lifetime: 7000, name: "彩虹糖果", description: "随机触发惊喜或惊吓，挑战手气" },
    TELEPORT: { id: 6, color: 'linear-gradient(45deg, #00ffaa, #00aaff)', score: 20, effect: 'teleport', lifetime: 7000, name: "传送门", description: "瞬移至安全随机点，摆脱险境" },
    REVIVE: { id: 7, color: '#ffd700', score: 60, effect: 'revive', lifetime: 12000, name: "复活甲", description: "死亡后原地复活并获得短暂无敌" },
    GHOST: { id: 8, color: '#00ff00', score: 40, effect: 'ghost', duration: 6000, lifetime: 8000, name: "穿墙能力", description: "6 秒穿墙无阻，穿梭追击无惧障碍" },
    INVINCIBLE: { id: 9, color: '#ffffff', score: 50, effect: 'invincible', duration: 5000, lifetime: 8000, name: "无敌状态", description: "5 秒碰撞免疫，尽情冲撞得分" },
    MAGNET: { id: 10, color: '#ff00ff', score: 30, effect: 'magnet', duration: 8000, lifetime: 8000, name: "磁铁", description: "8 秒吸附周围食物，靠近即可收入囊中" }
} as const;

type Position = {
  x: number;
  y: number;
};

type Effect = {
    type: 'freeze' | 'speed' | 'ghost' | 'invincible' | 'magnet' | 'shrink' | 'grow' | 'teleport' | 'revive';
    duration: number;
    // 可选的额外信息
    [key: string]: any; 
};

type Food = Position & {
    type: typeof FOOD_TYPES[keyof typeof FOOD_TYPES];
    spawnTime: number;
};

type Player = {
  id: string;
  name: string;
  isReady: boolean;
  snake: Position[];
  direction: 'UP' | 'DOWN' | 'LEFT' | 'RIGHT';
  nextDirection: 'UP' | 'DOWN' | 'LEFT' | 'RIGHT'; // 用于更平滑的转向
  color: string;
  isAlive: boolean;
  score: number;
  effects: Effect[];
  speed: number; // 基础速度 (ticks per move)
  reviveCharges: number;
};

type Room = {
  id: string;
  players: Map<string, Player>;
  foods: Food[];
  gameStarted: boolean;
  gameLoop: NodeJS.Timeout | null;
  ownerId: string;
  gridSize: number;
  usedColors: Set<number>; // Track which color indices are in use
};

const rooms = new Map<string, Room>();
const GAME_SPEED = 250; // 稍微加快基础游戏速度
const REVIVE_IMMUNITY_DURATION = 3000;
const REVIVE_GHOST_DURATION = 3000;
const MAX_ROOM_PLAYERS = 4;

const colors = ["bg-green-500", "bg-blue-500", "bg-yellow-500", "bg-purple-500"];

function getRoomSummaries() {
    return Array.from(rooms.values()).map(room => ({
        roomId: room.id,
        playerCount: room.players.size,
        capacity: MAX_ROOM_PLAYERS,
        isJoinable: room.players.size < MAX_ROOM_PLAYERS && !room.gameStarted,
    }));
}

function broadcastRoomList() {
    io.emit('roomList', getRoomSummaries());
}

function generateFood(currentFoods: Food[], allSnakes: Position[][], gridSize: number): Food {
    let newFoodPos: Position = { x: 0, y: 0 }; // Initialize to avoid TS error
    const flatSnakes = allSnakes.flat();
    let attempts = 0;

    // 确保食物不会生成在蛇或现有食物上
    while (attempts < 100) {
        newFoodPos = {
            x: Math.floor(Math.random() * gridSize),
            y: Math.floor(Math.random() * gridSize),
        };
        const overlapping = currentFoods.some(f => f.x === newFoodPos.x && f.y === newFoodPos.y) ||
                            flatSnakes.some(s => s.x === newFoodPos.x && s.y === newFoodPos.y);
        if (!overlapping) break;
        attempts++;
    }

    // 随机选择食物类型，增加普通食物的概率
    const foodTypes = Object.values(FOOD_TYPES);
    let foodType;
    if (Math.random() < 0.4) {
        foodType = FOOD_TYPES.NORMAL; // 40% 概率为普通食物
    } else {
        // 排除普通食物后的其他类型
        const specialFoodTypes = foodTypes.filter(t => t.id !== 1);
        foodType = specialFoodTypes[Math.floor(Math.random() * specialFoodTypes.length)];
    }

    return {
        ...newFoodPos,
        type: foodType,
        spawnTime: Date.now(),
    };
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

function applyFoodEffect(
    player: Player,
    foodType: typeof FOOD_TYPES[keyof typeof FOOD_TYPES],
    room: Room,
    options?: { emitEvent?: boolean; awardScore?: boolean }
): string[] {
    const { emitEvent = true, awardScore = true } = options ?? {};
    const triggeredEffects: string[] = [];

    if (awardScore) {
        player.score += foodType.score;
    }

    if (emitEvent) {
        io.to(room.id).emit('foodConsumed', { playerId: player.id, foodTypeId: foodType.id });
    }

    // Type guard to ensure we are dealing with a special food
    if (!('effect' in foodType)) { // This handles NORMAL food
        player.snake.push({ ...player.snake[player.snake.length - 1] });
        return triggeredEffects;
    }

    switch (foodType.effect) {
        case 'freeze':
            player.effects.push({ type: 'freeze', duration: foodType.duration });
            triggeredEffects.push('freeze');
            break;
        case 'speed':
            player.speed = foodType.speedMultiplier;
            player.effects.push({ type: 'speed', duration: foodType.duration, speedMultiplier: foodType.speedMultiplier });
            triggeredEffects.push('speed');
            break;
        case 'shrink':
            const shrinkAmount = Math.min(foodType.value, player.snake.length - 2);
            if (shrinkAmount > 0) {
                player.snake.splice(-shrinkAmount);
            }
            triggeredEffects.push('shrink');
            break;
        case 'teleport':
            const newPos = generateRandomPosition(room.gridSize, room.players.size > 1 ? Array.from(room.players.values()).flatMap(p => p.snake) : player.snake, 3);
            player.snake = [newPos, {x: newPos.x - 1, y: newPos.y}];
            triggeredEffects.push('teleport');
            break;
        case 'ghost':
            player.effects.push({ type: 'ghost', duration: foodType.duration });
            triggeredEffects.push('ghost');
            break;
        case 'invincible':
            player.effects.push({ type: 'invincible', duration: foodType.duration });
            triggeredEffects.push('invincible');
            break;
        case 'magnet':
            player.effects.push({ type: 'magnet', duration: foodType.duration });
            triggeredEffects.push('magnet');
            break;
        case 'revive':
            player.reviveCharges += 1;
            triggeredEffects.push('revive');
            break;
        case 'random':
            const randomEffects = Object.values(FOOD_TYPES).filter(f => 'effect' in f && f.effect !== 'random');
            const randomFood = randomEffects[Math.floor(Math.random() * randomEffects.length)];
            if (randomFood) {
                const nested = applyFoodEffect(player, randomFood, room, { emitEvent: false, awardScore: false });
                triggeredEffects.push(...nested);
            }
            break;
    }

    if (emitEvent && triggeredEffects.length > 0) {
        io.to(room.id).emit('effectTriggered', { playerId: player.id, effects: triggeredEffects });
    }

    return triggeredEffects;
}


function startGameLoop(roomId: string) {
    const room = rooms.get(roomId);
    if (!room || room.gameLoop) return;

    room.gameLoop = setInterval(() => {
        const room = rooms.get(roomId);
        if (!room) return;

        const now = Date.now();
        const players = Array.from(room.players.values());
        const playersAteViaMagnet = new Set<string>();

        // 1. Update food lifetime and remove expired food
        const initialFoodCount = room.foods.length;
        room.foods = room.foods.filter(food => now - food.spawnTime < food.type.lifetime);
        const expiredCount = initialFoodCount - room.foods.length;
        if (expiredCount > 0) {
            for (let i = 0; i < expiredCount; i++) {
                const allSnakes = players.map(p => p.snake);
                room.foods.push(generateFood(room.foods, allSnakes, room.gridSize));
            }
        }

        // 2. Update player effects
        players.forEach(player => {
            player.effects = player.effects.filter(effect => {
                effect.duration -= GAME_SPEED;
                if (effect.duration <= 0) {
                    if (effect.type === 'speed') player.speed = 1; // Reset speed
                    return false;
                }
                return true;
            });
        });

        // 3. Handle Magnet Effect
        const foodsConsumedByMagnet: Array<{ index: number; food: Food; playerId: string }> = [];
        const consumedFoodIndices = new Set<number>();
        players.forEach(player => {
            if (!player.isAlive || !player.effects.some(e => e.type === 'magnet')) return;

            const head = player.snake[0];
            const magnetRadius = 5;

            for (let i = room.foods.length - 1; i >= 0; i--) {
                const food = room.foods[i];
                const dx = head.x - food.x;
                const dy = head.y - food.y;
                const distance = Math.sqrt(dx * dx + dy * dy);

                if (distance >= magnetRadius) continue;

                if (distance > 0.1) {
                    const step = Math.min(0.5, distance);
                    const normX = dx / (distance || 1);
                    const normY = dy / (distance || 1);
                    food.x += normX * step;
                    food.y += normY * step;
                }

                const remainingDx = head.x - food.x;
                const remainingDy = head.y - food.y;
                const remainingDistance = Math.sqrt(remainingDx * remainingDx + remainingDy * remainingDy);

                if (remainingDistance <= 0.4) {
                    if (!consumedFoodIndices.has(i)) {
                        consumedFoodIndices.add(i);
                        foodsConsumedByMagnet.push({ index: i, food, playerId: player.id });
                    }
                }
            }
        });

        if (foodsConsumedByMagnet.length) {
            foodsConsumedByMagnet
                .sort((a, b) => b.index - a.index)
                .forEach(({ index, food, playerId }) => {
                    const eater = room.players.get(playerId);
                    if (!eater) return;

                    room.foods.splice(index, 1);
                    playersAteViaMagnet.add(playerId);
                    applyFoodEffect(eater, food.type, room);

                    const allSnakes = Array.from(room.players.values()).map(p => p.snake);
                    room.foods.push(generateFood(room.foods, allSnakes, room.gridSize));
                });
        }

        const nextPositions: { [id: string]: { head: Position, newSnake: Position[] } } = {};
        const playersToKill = new Map<string, { killerId?: string }>();

        const markPlayerForDeath = (playerId: string, killerId?: string) => {
            const existing = playersToKill.get(playerId);
            if (existing?.killerId) return;
            playersToKill.set(playerId, {
                killerId: existing?.killerId ?? killerId,
            });
        };

        // 4. Calculate next positions for all players
        players.forEach(player => {
            if (!player.isAlive) return;

            // Apply direction change
            player.direction = player.nextDirection;

            // Handle Freeze effect
            if (player.effects.some(e => e.type === 'freeze')) {
                nextPositions[player.id] = { head: player.snake[0], newSnake: player.snake };
                return;
            }

            const head = { ...player.snake[0] };
            switch (player.direction) {
                case "UP": head.y -= 1; break;
                case "DOWN": head.y += 1; break;
                case "LEFT": head.x -= 1; break;
                case "RIGHT": head.x += 1; break;
            }
            
            // Handle Ghost effect (wall collision)
            if (player.effects.some(e => e.type === 'ghost')) {
                if (head.x < 0) head.x = room.gridSize - 1;
                if (head.x >= room.gridSize) head.x = 0;
                if (head.y < 0) head.y = room.gridSize - 1;
                if (head.y >= room.gridSize) head.y = 0;
            }

            nextPositions[player.id] = { head, newSnake: [head, ...player.snake] };
        });

        // 5. Collision Detection
        players.forEach(player => {
            if (!player.isAlive) return;
            const { head } = nextPositions[player.id];
            const isInvincible = player.effects.some(e => e.type === 'invincible');
            const hasGhost = player.effects.some(e => e.type === 'ghost');
            if (isInvincible) return;

            // Wall collision (for non-ghost players)
            if (!hasGhost) {
                if (head.x < 0 || head.x >= room.gridSize || head.y < 0 || head.y >= room.gridSize) {
                    markPlayerForDeath(player.id);
                }
            }

            // Self and other snake collision
            for (const otherPlayer of players) {
                if (!otherPlayer.isAlive) continue;
                const targetSnake = (player.id === otherPlayer.id) ? otherPlayer.snake.slice(1) : otherPlayer.snake;
                if (targetSnake.some(segment => segment.x === head.x && segment.y === head.y)) {
                    const killerId = player.id === otherPlayer.id ? undefined : otherPlayer.id;
                    markPlayerForDeath(player.id, killerId);
                    break;
                }
            }
            
            // Head-on collision
            for (const otherPlayer of players) {
                if (player.id === otherPlayer.id || !otherPlayer.isAlive) continue;
                const otherHead = nextPositions[otherPlayer.id]?.head;
                if (head.x === otherHead?.x && head.y === otherHead?.y) {
                    if (player.snake.length > otherPlayer.snake.length) {
                        markPlayerForDeath(otherPlayer.id, player.id);
                    } else if (player.snake.length < otherPlayer.snake.length) {
                        markPlayerForDeath(player.id, otherPlayer.id);
                    } else {
                        markPlayerForDeath(player.id);
                        markPlayerForDeath(otherPlayer.id);
                    }
                }
            }
        });

        // 6. Update player states (kill players)
        playersToKill.forEach(({ killerId }, playerId) => {
            const player = room.players.get(playerId);
            if (!player) return;

        const killer = killerId ? room.players.get(killerId) : undefined;

        io.to(roomId).emit('playerDied', { playerId, killerId });

        if (player.reviveCharges > 0) {
            player.reviveCharges -= 1;
            player.isAlive = true;
            const nextPosition = nextPositions[player.id];
            const minimalSnake = (() => {
                if (nextPosition) {
                    const trimmed = nextPosition.newSnake.slice(0, 2);
                    if (trimmed.length === 1) {
                        trimmed.push({ ...trimmed[0] });
                    }
                    nextPosition.newSnake = trimmed;
                    nextPosition.head = trimmed[0];
                    return trimmed;
                }
                if (player.snake.length >= 2) {
                    return player.snake.slice(0, 2);
                }
                if (player.snake.length === 1) {
                    return [player.snake[0], { ...player.snake[0] }];
                }
                const fallback = { x: 0, y: 0 };
                return [fallback, { ...fallback }];
            })();
            player.snake = minimalSnake;
            player.effects.push({ type: 'invincible', duration: REVIVE_IMMUNITY_DURATION });
            player.effects.push({ type: 'ghost', duration: REVIVE_GHOST_DURATION });
            if (killer) {
                killer.reviveCharges += 1;
            }
            io.to(roomId).emit('effectTriggered', { playerId: player.id, effects: ['revive'] });
            return;
        }

            player.isAlive = false;
            const bodyFood: Food[] = player.snake.map(segment => ({
                ...segment, type: FOOD_TYPES.NORMAL, spawnTime: Date.now()
            }));
            room.foods.push(...bodyFood);

            if (killer) {
                killer.reviveCharges += 1;
            }
        });

        // 7. Update snake positions and handle food eating
        players.forEach(player => {
            if (!player.isAlive) return;
            
            const { head, newSnake } = nextPositions[player.id];
            const foodIndex = room.foods.findIndex(f => Math.round(f.x) === head.x && Math.round(f.y) === head.y);
            const ateByMagnet = playersAteViaMagnet.has(player.id);

            if (foodIndex !== -1) {
                const eatenFood = room.foods.splice(foodIndex, 1)[0];
                applyFoodEffect(player, eatenFood.type, room);
                // Generate new food
                const allSnakes = players.map(p => p.snake);
                room.foods.push(generateFood(room.foods, allSnakes, room.gridSize));
            } else if (ateByMagnet) {
                // Already handled via magnet consumption
            } else if (!player.effects.some(e => e.type === 'freeze')) {
                // Only pop the tail if the snake is not frozen and didn't eat
                newSnake.pop();
            }
            player.snake = newSnake;
        });

        // 8. Check for game over: The game ends when no players are alive.
        const alivePlayers = players.filter(p => p.isAlive);
        if (alivePlayers.length === 0 && players.length > 0) {
            if (room.gameLoop) clearInterval(room.gameLoop);
            room.gameLoop = null;
            room.gameStarted = false;
            
            // The winner is the player with the highest score.
            const winner = players.sort((a, b) => b.score - a.score)[0];
            io.to(roomId).emit('gameOver', winner);
            broadcastRoomList();
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
  socket.emit('roomList', getRoomSummaries());

  socket.on('createRoom', ({ playerName, gridSize }) => {
    const roomId = generateUniqueRoomId(); // 6位数字房间号
    const playerId = socket.id;
    const newPlayer: Player = {
      id: playerId,
      name: playerName,
      isReady: false,
      snake: [],
      direction: 'RIGHT',
      nextDirection: 'RIGHT',
      color: colors[0],
      isAlive: false,
      score: 0,
      effects: [],
      speed: 1,
      reviveCharges: 0,
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
    broadcastRoomList();
  });

  socket.on('joinRoom', ({ roomId, playerName }) => {
    const room = rooms.get(roomId);
    if (room && room.players.size < MAX_ROOM_PLAYERS) {
      const playerId = socket.id;
      const colorIndex = getUniqueColorIndex(room.usedColors);
      const newPlayer: Player = {
        id: playerId,
        name: playerName,
        isReady: false,
        snake: [],
      direction: 'RIGHT',
      nextDirection: 'RIGHT',
      color: colors[colorIndex],
      isAlive: false,
      score: 0,
      effects: [],
      speed: 1,
      reviveCharges: 0,
      };
      room.players.set(playerId, newPlayer);
      room.usedColors.add(colorIndex);
      socket.join(roomId);
      socket.emit('joinedRoom', { roomId, playerId, isOwner: false });
      io.to(roomId).emit('updatePlayers', Array.from(room.players.values()));
      broadcastRoomList();
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
        player.snake = [randomPosition, { x: randomPosition.x - 1, y: randomPosition.y }];
        player.direction = 'RIGHT';
        player.nextDirection = 'RIGHT';
        player.isAlive = true;
        player.isReady = false; // Reset for next game
        player.score = 0;
        player.effects = [];
        player.speed = 1;
        player.reviveCharges = 0;
        existingPositions.push(randomPosition);
      });
      const allSnakes = Array.from(room.players.values()).map(p => p.snake);
      room.foods = [generateFood([], allSnakes, room.gridSize)];
      
      io.to(roomId).emit('gameStarted', { 
        players: Array.from(room.players.values()),
        foods: room.foods,
        gridSize: room.gridSize 
      });
      broadcastRoomList();
      startGameLoop(roomId);
    }
  });

  socket.on('leaveRoom', ({ roomId }) => {
    const room = rooms.get(roomId);
    if (!room) {
      socket.emit('error', 'Room not found');
      return;
    }

    const player = room.players.get(socket.id);
    if (!player) {
      socket.emit('error', 'You are not in this room');
      return;
    }

    const colorIndex = getColorIndexFromColor(player.color);
    if (colorIndex !== -1) {
      room.usedColors.delete(colorIndex);
    }

    room.players.delete(socket.id);
    socket.leave(roomId);

    if (room.players.size === 0) {
      if (room.gameLoop) {
        clearInterval(room.gameLoop);
        room.gameLoop = null;
      }
      rooms.delete(roomId);
    } else {
      if (room.ownerId === socket.id) {
        room.ownerId = Array.from(room.players.keys())[0];
      }
      io.to(roomId).emit('updatePlayers', Array.from(room.players.values()));
    }

    socket.emit('leftRoom');
    broadcastRoomList();
  });

  socket.on('requestRoomList', () => {
    socket.emit('roomList', getRoomSummaries());
  });

  socket.on('changeDirection', ({ roomId, direction }) => {
    const room = rooms.get(roomId);
    const player = room?.players.get(socket.id);
    if (player && player.isAlive) {
        const currentDirection = player.direction;
        // 避免180度直接转向
        if (direction === 'UP' && currentDirection !== 'DOWN') player.nextDirection = direction;
        if (direction === 'DOWN' && currentDirection !== 'UP') player.nextDirection = direction;
        if (direction === 'LEFT' && currentDirection !== 'RIGHT') player.nextDirection = direction;
        if (direction === 'RIGHT' && currentDirection !== 'LEFT') player.nextDirection = direction;
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
            p.reviveCharges = 0;
        });
        io.to(roomId).emit('gameReset');
        io.to(roomId).emit('updatePlayers', Array.from(room.players.values()));
        broadcastRoomList();
    }
  });

  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
    let roomsChanged = false;
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
        roomsChanged = true;
      }
    });
    if (roomsChanged) {
      broadcastRoomList();
    }
  });
});

const port = process.env.PORT || 3001;
httpServer.listen(port, () => {
  console.log(`Socket.IO server running on http://localhost:${port}`);
});
