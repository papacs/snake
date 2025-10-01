import { createServer } from 'http';
import { Server } from 'socket.io';

// 鐢熸垚6浣嶉殢鏈烘暟瀛楃殑鎴块棿鍙?
function generateRoomId(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// 鐢熸垚鍞竴鐨?浣嶆暟瀛楁埧闂村彿
function generateUniqueRoomId(): string {
  let roomId: string;
  do {
    roomId = generateRoomId();
  } while (rooms.has(roomId)); // 纭繚鎴块棿鍙峰敮涓€
  return roomId;
}

const httpServer = createServer();
const io = new Server(httpServer, {
  cors: {
    origin: "*", // Allow all origins, will be configured in production
    methods: ["GET", "POST"]
  }
});

// 椋熺墿绫诲瀷瀹氫箟
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
    [key: string]: unknown;
};

type Food = Position & {
    id: string;
    type: typeof FOOD_TYPES[keyof typeof FOOD_TYPES];
    spawnTime: number;
    customLifetime?: number;
    isCorpse?: boolean;
    corpseColor?: string;
};

type Player = {
  id: string;
  name: string;
  isReady: boolean;
  snake: Position[];
  direction: 'UP' | 'DOWN' | 'LEFT' | 'RIGHT';
  nextDirection: 'UP' | 'DOWN' | 'LEFT' | 'RIGHT'; // 鐢ㄤ簬鏇村钩婊戠殑杞悜
  color: string;
  isAlive: boolean;
  score: number;
  effects: Effect[];
  speed: number; // 鍩虹閫熷害 (ticks per move)
  reviveCharges: number;
  dashAvailableAt: number;
  lastDashDirection?: Player['direction'];
  lastDashInputAt: number;
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
  stateVersion: number;
  snapshot: RoomSnapshot;
};

type PlayerSnapshot = {
  id: string;
  snake: Position[];
  direction: Player['direction'];
  isAlive: boolean;
  score: number;
  effects: Effect[];
  reviveCharges: number;
  color: string;
};

type RoomSnapshot = {
  players: Map<string, PlayerSnapshot>;
  foods: Map<string, Food>;
};

type PlayerMovementDelta = {
  head: Position;
  removedTail: number;
};

type PlayerDelta = {
  id: string;
  movement?: PlayerMovementDelta;
  fullSnake?: Position[];
  direction?: Player['direction'];
  isAlive?: boolean;
  score?: number;
  effects?: Effect[];
  reviveCharges?: number;
  color?: string;
};

type FoodUpdate = Pick<Food, 'id' | 'x' | 'y' | 'spawnTime' | 'customLifetime' | 'isCorpse' | 'corpseColor'>;

type StateDelta = {
  tick: number;
  players?: PlayerDelta[];
  removedPlayers?: string[];
  foods?: {
    added?: Food[];
    updated?: FoodUpdate[];
    removed?: string[];
  };
};

const DEFAULT_GRID_SIZE = 34;
const DASH_SPEED_MULTIPLIER = 2;
const DASH_DURATION_MS = 2000;
const DASH_COOLDOWN_MS = 3000;
const DASH_INPUT_WINDOW_MS = 250;

const rooms = new Map<string, Room>();

let foodIdCounter = 0;
function createFoodId(): string {
    foodIdCounter += 1;
    return `food-${foodIdCounter.toString(36)}`;
}

function clonePosition(position: Position): Position {
    return { x: position.x, y: position.y };
}

function cloneSnake(snake: Position[]): Position[] {
    return snake.map(clonePosition);
}

function cloneEffects(effects: Effect[]): Effect[] {
    return effects.map(effect => ({ ...effect }));
}

function createPlayerSnapshot(player: Player): PlayerSnapshot {
    return {
        id: player.id,
        snake: cloneSnake(player.snake),
        direction: player.direction,
        isAlive: player.isAlive,
        score: player.score,
        effects: cloneEffects(player.effects),
        reviveCharges: player.reviveCharges,
        color: player.color,
    };
}

function cloneFood(food: Food): Food {
    return {
        id: food.id,
        x: food.x,
        y: food.y,
        type: food.type,
        spawnTime: food.spawnTime,
        customLifetime: food.customLifetime,
        isCorpse: food.isCorpse,
        corpseColor: food.corpseColor,
    };
}

function effectsEqual(a: Effect[], b: Effect[]): boolean {
    if (a.length !== b.length) return false;
    return a.every((effect, index) => {
        const other = b[index];
        if (!other) return false;
        const keys = new Set([...Object.keys(effect), ...Object.keys(other)]);
        for (const key of keys) {
            if ((effect as Record<string, unknown>)[key] !== (other as Record<string, unknown>)[key]) {
                return false;
            }
        }
        return true;
    });
}

function snakesEqual(a: Position[], b: Position[]): boolean {
    if (a.length !== b.length) return false;
    return a.every((segment, index) => {
        const other = b[index];
        return other && segment.x === other.x && segment.y === other.y;
    });
}

function deriveMovement(previous: Position[] | undefined, current: Position[]): PlayerMovementDelta | undefined {
    if (!previous || previous.length === 0 || current.length === 0) {
        return undefined;
    }

    const currentBodyMatchesPrevious = current.slice(1).every((segment, index) => {
        const prevSegment = previous[index];
        return prevSegment && segment.x === prevSegment.x && segment.y === prevSegment.y;
    });

    if (!currentBodyMatchesPrevious) {
        return undefined;
    }

    const head = clonePosition(current[0]);

    if (previous[0].x === head.x && previous[0].y === head.y && snakesEqual(previous, current)) {
        return undefined;
    }

    const desiredLength = current.length;
    const removedTailCandidate = previous.length + 1 - desiredLength;
    const removedTail = removedTailCandidate > 0 ? removedTailCandidate : 0;

    return { head, removedTail };
}

function buildPlayerDelta(previous: PlayerSnapshot | undefined, current: Player): PlayerDelta | null {
    const delta: PlayerDelta = { id: current.id };
    let changed = false;

    if (!previous) {
        delta.fullSnake = cloneSnake(current.snake);
        delta.direction = current.direction;
        delta.isAlive = current.isAlive;
        delta.score = current.score;
        delta.effects = cloneEffects(current.effects);
        delta.reviveCharges = current.reviveCharges;
        delta.color = current.color;
        return delta;
    }

    if (current.direction !== previous.direction) {
        delta.direction = current.direction;
        changed = true;
    }

    if (current.isAlive !== previous.isAlive) {
        delta.isAlive = current.isAlive;
        changed = true;
    }

    if (current.score !== previous.score) {
        delta.score = current.score;
        changed = true;
    }

    if (current.reviveCharges !== previous.reviveCharges) {
        delta.reviveCharges = current.reviveCharges;
        changed = true;
    }

    if (current.color !== previous.color) {
        delta.color = current.color;
        changed = true;
    }

    if (!effectsEqual(previous.effects, current.effects)) {
        delta.effects = cloneEffects(current.effects);
        changed = true;
    }

    const movement = deriveMovement(previous.snake, current.snake);
    if (movement) {
        delta.movement = movement;
        changed = true;
    } else if (!snakesEqual(previous.snake, current.snake)) {
        delta.fullSnake = cloneSnake(current.snake);
        changed = true;
    }

    return changed ? delta : null;
}

function foodChanged(previous: Food, current: Food): boolean {
    return previous.x !== current.x ||
        previous.y !== current.y ||
        previous.spawnTime !== current.spawnTime ||
        previous.customLifetime !== current.customLifetime ||
        previous.isCorpse !== current.isCorpse ||
        previous.corpseColor !== current.corpseColor;
}

function computeStateDelta(room: Room): StateDelta | null {
    const playerDeltas: PlayerDelta[] = [];
    const removedPlayers: string[] = [];

    room.players.forEach(player => {
        const previous = room.snapshot.players.get(player.id);
        const delta = buildPlayerDelta(previous, player);
        if (delta) {
            playerDeltas.push(delta);
        }
    });

    room.snapshot.players.forEach((_, playerId) => {
        if (!room.players.has(playerId)) {
            removedPlayers.push(playerId);
        }
    });

    // Update player snapshots for the next tick.
    room.snapshot.players.clear();
    room.players.forEach(player => {
        room.snapshot.players.set(player.id, createPlayerSnapshot(player));
    });

    const addedFoods: Food[] = [];
    const updatedFoods: FoodUpdate[] = [];
    const removedFoods: string[] = [];

    room.foods.forEach(food => {
        const previous = room.snapshot.foods.get(food.id);
        if (!previous) {
            addedFoods.push(cloneFood(food));
        } else if (foodChanged(previous, food)) {
            updatedFoods.push({
                id: food.id,
                x: food.x,
                y: food.y,
                spawnTime: food.spawnTime,
                customLifetime: food.customLifetime,
                isCorpse: food.isCorpse,
                corpseColor: food.corpseColor,
            });
        }
    });

    room.snapshot.foods.forEach((_, foodId) => {
        if (!room.foods.some(food => food.id === foodId)) {
            removedFoods.push(foodId);
        }
    });

    // Refresh food snapshots.
    room.snapshot.foods.clear();
    room.foods.forEach(food => {
        room.snapshot.foods.set(food.id, cloneFood(food));
    });

    const hasPlayerChanges = playerDeltas.length > 0 || removedPlayers.length > 0;
    const hasFoodChanges = addedFoods.length > 0 || updatedFoods.length > 0 || removedFoods.length > 0;

    if (!hasPlayerChanges && !hasFoodChanges) {
        return null;
    }

    room.stateVersion += 1;

    const delta: StateDelta = { tick: room.stateVersion };
    if (hasPlayerChanges) {
        delta.players = playerDeltas;
        if (removedPlayers.length > 0) {
            delta.removedPlayers = removedPlayers;
        }
    }

    if (hasFoodChanges) {
        delta.foods = {};
        if (addedFoods.length > 0) {
            delta.foods.added = addedFoods;
        }
        if (updatedFoods.length > 0) {
            delta.foods.updated = updatedFoods;
        }
        if (removedFoods.length > 0) {
            delta.foods.removed = removedFoods;
        }
    }

    return delta;
}
const GAME_SPEED = 250; // 绋嶅井鍔犲揩鍩虹娓告垙閫熷害
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

    // 纭繚椋熺墿涓嶄細鐢熸垚鍦ㄨ泧鎴栫幇鏈夐鐗╀笂
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

    // 闅忔満閫夋嫨椋熺墿绫诲瀷锛屽鍔犳櫘閫氶鐗╃殑姒傜巼
    const foodTypes = Object.values(FOOD_TYPES);
    let foodType;
    if (Math.random() < 0.4) {
        foodType = FOOD_TYPES.NORMAL; // 40% 姒傜巼涓烘櫘閫氶鐗?
    } else {
        // 鎺掗櫎鏅€氶鐗╁悗鐨勫叾浠栫被鍨?
        const specialFoodTypes = foodTypes.filter(t => t.id !== 1);
        foodType = specialFoodTypes[Math.floor(Math.random() * specialFoodTypes.length)];
    }

    return {
        id: createFoodId(),
        ...newFoodPos,
        type: foodType,
        spawnTime: Date.now(),
    };
}

function generateRandomPosition(gridSize: number, existingPositions: Position[], minDistance: number = 3): Position {
  let newPosition: Position;
  let attempts = 0;
  const maxAttempts = 100; // 闃叉鏃犻檺寰幆
  
  do {
    newPosition = {
      x: Math.floor(Math.random() * gridSize),
      y: Math.floor(Math.random() * gridSize),
    };
    attempts++;
    
    // 妫€鏌ユ槸鍚︿笌鐜版湁浣嶇疆澶繎
    const tooClose = existingPositions.some(pos => {
      const dx = Math.abs(pos.x - newPosition.x);
      const dy = Math.abs(pos.y - newPosition.y);
      return dx < minDistance && dy < minDistance;
    });
    
    // 濡傛灉灏濊瘯娆℃暟杩囧鎴栬€呬綅缃悎閫傦紝灏辫繑鍥?
    if (attempts >= maxAttempts || !tooClose) {
      break;
    }
  } while (true);
  
  return newPosition;
}

// 鑾峰彇鍞竴鐨勯鑹茬储寮?
function getUniqueColorIndex(usedColors: Set<number>): number {
  // 灏濊瘯鎵惧埌鏈娇鐢ㄧ殑棰滆壊绱㈠紩
  for (let i = 0; i < colors.length; i++) {
    if (!usedColors.has(i)) {
      return i;
    }
  }
  
  // 濡傛灉鎵€鏈夐鑹查兘琚娇鐢紝闅忔満閫夋嫨涓€涓紙铏界劧涓嶅簲璇ュ彂鐢燂紝鍥犱负鏈?涓鑹插拰鏈€澶?涓帺瀹讹級
  return Math.floor(Math.random() * colors.length);
}

// 浠庨鑹插瓧绗︿覆鑾峰彇棰滆壊绱㈠紩
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
            player.effects.push({ type: 'speed', duration: foodType.duration, speedMultiplier: foodType.speedMultiplier });
            recalculatePlayerSpeed(player);
            triggeredEffects.push('speed');
            recalculatePlayerSpeed(player);
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
        const expiredFoods: Food[] = [];
        room.foods = room.foods.filter(food => {
            const lifetime = food.customLifetime ?? food.type.lifetime;
            const expired = now - food.spawnTime >= lifetime;
            if (expired) expiredFoods.push(food);
            return !expired;
        });
        const expiredRegularCount = expiredFoods.filter(food => !food.isCorpse).length;
        if (expiredRegularCount > 0) {
            for (let i = 0; i < expiredRegularCount; i++) {
                const allSnakes = players.map(p => p.snake);
                room.foods.push(generateFood(room.foods, allSnakes, room.gridSize));
            }
        }

        // 2. Update player effects
        players.forEach(player => {
            player.effects = player.effects.filter(effect => {
                effect.duration -= GAME_SPEED;
                return effect.duration > 0;
            });
            recalculatePlayerSpeed(player);
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
                if (food.isCorpse) continue;
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
                    if (food.isCorpse) return;

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

            movingPlayers.forEach(player => {
                const currentHead = player.snake[0];
                const head = { ...currentHead };

                switch (player.direction) {
                    case "UP": head.y -= 1; break;
                    case "DOWN": head.y += 1; break;
                    case "LEFT": head.x -= 1; break;
                    case "RIGHT": head.x += 1; break;
                }

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

            playersToKill.forEach(({ killerId }, playerId) => {
                const player = room.players.get(playerId);
                if (!player) return;

                const killer = killerId ? room.players.get(killerId) : undefined;

                io.to(roomId).emit('playerDied', { playerId, killerId });

                if (killer && player) {
                    io.to(roomId).emit('killAnnouncement', {
                        killerId,
                        killerName: killer.name,
                        victimId: playerId,
                        victimName: player.name,
                        timestamp: Date.now(),
                    });
                }

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
                id: createFoodId(),
                ...segment,
                type: FOOD_TYPES.NORMAL,
                spawnTime: Date.now(),
                customLifetime: 2000,
                isCorpse: true,
                corpseColor: player.color
            }));
            room.foods.push(...bodyFood);
            player.snake = [];

                if (killer) {
                    killer.reviveCharges += 1;
                }
            });

            movingPlayers.forEach(player => {
                if (!player.isAlive) return;
                const nextPosition = nextPositions.get(player.id);
                if (!nextPosition) return;

                const { head, newSnake } = nextPosition;
                const foodIndex = room.foods.findIndex(f => !f.isCorpse && Math.round(f.x) === head.x && Math.round(f.y) === head.y);
                const ateByMagnet = playersAteViaMagnet.has(player.id);

                if (foodIndex !== -1) {
                    const eatenFood = room.foods.splice(foodIndex, 1)[0];
                    applyFoodEffect(player, eatenFood.type, room);
                    const allSnakes = Array.from(room.players.values()).map(p => p.snake);
                    room.foods.push(generateFood(room.foods, allSnakes, room.gridSize));
                } else if (ateByMagnet) {
                    playersAteViaMagnet.delete(player.id);
                } else {
                    newSnake.pop();
                }

                player.snake = newSnake;
            });
        }

        // 8. Check for game over: The game ends when no players are alive.
        const alivePlayers = players.filter(p => p.isAlive);
        if (alivePlayers.length === 0 && players.length > 0) {
            if (room.gameLoop) clearInterval(room.gameLoop);
            room.gameLoop = null;
            room.gameStarted = false;
            
            // The winner is the player with the highest score.
            const winner = [...currentPlayers].sort((a, b) => b.score - a.score)[0];
            io.to(roomId).emit('gameOver', winner);
            broadcastRoomList();
        }

        const delta = computeStateDelta(room);
        if (delta) {
            io.to(roomId).emit('stateDelta', delta);
        }
    }, GAME_SPEED);
}

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);
  socket.emit('roomList', getRoomSummaries());

  socket.on('createRoom', ({ playerName, gridSize }) => {
    const roomId = generateUniqueRoomId(); // 6浣嶆暟瀛楁埧闂村彿
    const playerId = socket.id;
    const resolvedGridSize = typeof gridSize === 'number' && gridSize > 0 ? gridSize : DEFAULT_GRID_SIZE;
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
      gridSize: resolvedGridSize,
      usedColors: new Set([0]), // First player uses color index 0
      stateVersion: 0,
      snapshot: {
        players: new Map(),
        foods: new Map(),
      },
    };
    room.snapshot.players.set(playerId, createPlayerSnapshot(newPlayer));
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
      room.snapshot.players.set(playerId, createPlayerSnapshot(newPlayer));
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
        player.dashAvailableAt = 0;
        player.lastDashDirection = undefined;
        player.lastDashInputAt = 0;
        existingPositions.push(randomPosition);
      });
      const allSnakes = Array.from(room.players.values()).map(p => p.snake);
      room.foods = [generateFood([], allSnakes, room.gridSize)];
      room.stateVersion = 0;
      room.snapshot.players.clear();
      room.snapshot.foods.clear();
      room.players.forEach(player => {
        room.snapshot.players.set(player.id, createPlayerSnapshot(player));
      });
      room.foods.forEach(food => {
        room.snapshot.foods.set(food.id, cloneFood(food));
      });
      
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
    room.snapshot.players.delete(socket.id);
    socket.leave(roomId);

    if (room.players.size === 0) {
      if (room.gameLoop) {
        clearInterval(room.gameLoop);
        room.gameLoop = null;
      }
      room.snapshot.players.clear();
      room.snapshot.foods.clear();
      room.stateVersion = 0;
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
    if (!room || !player || !player.isAlive) {
        return;
    }

    const currentDirection = player.direction;
    if (
        (direction === 'UP' && currentDirection === 'DOWN') ||
        (direction === 'DOWN' && currentDirection === 'UP') ||
        (direction === 'LEFT' && currentDirection === 'RIGHT') ||
        (direction === 'RIGHT' && currentDirection === 'LEFT')
    ) {
        return;
    }

    const now = Date.now();
    const sameDirectionTap = player.lastDashDirection === direction && (now - player.lastDashInputAt) <= DASH_INPUT_WINDOW_MS;
    const canDash =
        sameDirectionTap &&
        now >= player.dashAvailableAt &&
        !player.effects.some(e => e.type === 'freeze');

    if (canDash) {
        activateDash(player, room, roomId);
    }

    player.nextDirection = direction;
    player.lastDashDirection = direction;
    player.lastDashInputAt = now;
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
            p.effects = [];
            p.reviveCharges = 0;
        });
        room.stateVersion = 0;
        room.snapshot.players.clear();
        room.snapshot.foods.clear();
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
        room.snapshot.players.delete(socket.id);
        if (room.players.size === 0) {
          if (room.gameLoop) clearInterval(room.gameLoop);
          room.snapshot.players.clear();
          room.snapshot.foods.clear();
          room.stateVersion = 0;
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


