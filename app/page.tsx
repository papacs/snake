"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { io, Socket } from "socket.io-client";

let socket: Socket | null = null;

type Position = {
  x: number;
  y: number;
};

// Mirroring server types
const FOOD_TYPES = {
    NORMAL: { id: 1, color: '#ff0000', score: 10, length: 1, lifetime: 15000, name: "普通食物", description: "增加体型并获得基础积分" },
    FREEZE: { id: 2, color: '#00aaff', score: 20, effect: 'freeze', duration: 3000, lifetime: 8000, name: "冰冻果实", description: "束缚目标 3 秒，需提前规划走位" },
    SPEED: { id: 3, color: '#ff5500', score: 30, effect: 'speed', duration: 5000, speedMultiplier: 2, lifetime: 8000, name: "加速辣椒", description: "5 秒疾速冲刺，追击或逃生首选" },
    SHRINK: { id: 4, color: '#aa00ff', score: 20, effect: 'shrink', value: 3, lifetime: 8000, name: "缩小蘑菇", description: "瞬间瘦身 3 节，穿缝绕行更灵活" },
    RAINBOW: { id: 5, color: 'rainbow', score: 50, effect: 'random', lifetime: 7000, name: "彩虹糖果", description: "随机触发增益或减益，考验手气的神秘糖" },
    TELEPORT: { id: 6, color: 'linear-gradient(45deg, #00ffaa, #00aaff)', score: 20, effect: 'teleport', lifetime: 7000, name: "传送门", description: "瞬移至安全随机点，脱困反偷" },
    REVIVE: { id: 7, color: '#ffd700', score: 60, effect: 'revive', lifetime: 12000, name: "复活甲", description: "死亡后原地满血复活并获得 3 秒无敌穿墙" },
    GHOST: { id: 8, color: '#00ff00', score: 40, effect: 'ghost', duration: 6000, lifetime: 8000, name: "穿墙能力", description: "6 秒无视墙体，穿梭追击无压力" },
    INVINCIBLE: { id: 9, color: '#ffffff', score: 50, effect: 'invincible', duration: 5000, lifetime: 8000, name: "无敌状态", description: "5 秒碰撞免疫，正面硬刚" },
    MAGNET: { id: 10, color: '#ff00ff', score: 30, effect: 'magnet', duration: 8000, lifetime: 8000, name: "磁铁", description: "8 秒吸附周边食物，靠近即可收入囊中" }
} as const;

const MAGIC_CHIME = "https://actions.google.com/sounds/v1/cartoon/magic_chime.ogg";

const BASE_GRID_SIZE = 17;
const DEFAULT_GRID_SIZE = BASE_GRID_SIZE * 2;
const MIN_CELL_SIZE = 14;
const MAX_CELL_SIZE = 28;
const FOOD_SOUNDS: Record<number, string> = {
  1: "https://actions.google.com/sounds/v1/cartoon/pop.ogg",
  2: "https://actions.google.com/sounds/v1/cartoon/clang_and_wobble.ogg",
  3: "https://actions.google.com/sounds/v1/cartoon/cowbell.ogg",
  4: "https://actions.google.com/sounds/v1/cartoon/wood_plank_flicks.ogg",
  5: MAGIC_CHIME,
  6: MAGIC_CHIME,
  7: MAGIC_CHIME,
  8: MAGIC_CHIME,
  9: "https://actions.google.com/sounds/v1/cartoon/siren_whistle.ogg",
  10: MAGIC_CHIME,
};
const EFFECT_SOUNDS: Record<string, string> = {
  freeze: "https://actions.google.com/sounds/v1/cartoon/metal_twang.ogg",
  speed: "https://actions.google.com/sounds/v1/cartoon/slide_whistle_up.ogg",
  shrink: "https://actions.google.com/sounds/v1/cartoon/slide_whistle_down.ogg",
  grow: "https://actions.google.com/sounds/v1/cartoon/descending_whistle.ogg",
  ghost: "https://actions.google.com/sounds/v1/cartoon/air_swirl.ogg",
  invincible: "https://actions.google.com/sounds/v1/cartoon/siren_whistle.ogg",
  magnet: "https://actions.google.com/sounds/v1/cartoon/suction_pop.ogg",
  revive: "https://actions.google.com/sounds/v1/cartoon/fairy_dust_gliss.ogg",
  teleport: "https://actions.google.com/sounds/v1/cartoon/ascending_whistle.ogg",
  death: "https://actions.google.com/sounds/v1/cartoon/anvil_fall_and_hit.ogg",
};

const WIN_SOUND_SRC = "https://actions.google.com/sounds/v1/cartoon/ta_da.ogg";
const LOSE_SOUND_SRC = "https://actions.google.com/sounds/v1/cartoon/sad_trombone.ogg";

type Effect = {
    type: 'freeze' | 'speed' | 'ghost' | 'invincible' | 'magnet' | 'shrink' | 'grow' | 'teleport' | 'revive';
    duration: number;
    [key: string]: unknown; 
};

const EFFECT_LABELS: Record<Effect['type'], string> = {
    freeze: "冰冻",
    speed: "加速",
    ghost: "穿墙",
    invincible: "无敌",
    magnet: "磁铁",
    shrink: "缩小",
    grow: "变长",
    teleport: "传送",
    revive: "复活甲",
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
  direction: "UP" | "DOWN" | "LEFT" | "RIGHT";
  color: string;
  isAlive: boolean;
  score: number;
  effects: Effect[];
  reviveCharges: number;
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

type KillEvent = {
  id: string;
  killerId: string;
  killerName: string;
  victimId: string;
  victimName: string;
  timestamp: number;
};

const clonePosition = (position: Position): Position => ({ x: position.x, y: position.y });
const cloneSnake = (snake: Position[]): Position[] => snake.map(clonePosition);
const cloneEffects = (effects: Effect[]): Effect[] => effects.map(effect => ({ ...effect }));
const clonePlayerState = (player: Player): Player => ({
  ...player,
  snake: cloneSnake(player.snake),
  effects: cloneEffects(player.effects),
});
const cloneFoodState = (food: Food): Food => ({
  ...food,
});

type RoomSummary = {
  roomId: string;
  playerCount: number;
  capacity: number;
  isJoinable: boolean;
};

export default function SnakeGame() {
  // Multiplayer state
  const [multiplayerMode, setMultiplayerMode] = useState(false);
  const [roomId, setRoomId] = useState("");
  const [playerId, setPlayerId] = useState("");
  const [isOwner, setIsOwner] = useState(false);
  const [players, setPlayers] = useState<Player[]>([]);
  const [roomsSummary, setRoomsSummary] = useState<RoomSummary[]>([]);
  const [roomError, setRoomError] = useState("");
  const [foodPanelOpen, setFoodPanelOpen] = useState(false);
  const [playerListOpen, setPlayerListOpen] = useState(true);

  // Game state
  const [gridSize, setGridSize] = useState(DEFAULT_GRID_SIZE);
  const [cellSize, setCellSize] = useState(MIN_CELL_SIZE);

  const [playerName, setPlayerName] = useState("");
  const [gameStarted, setGameStarted] = useState(false);
  const [foods, setFoods] = useState<Food[]>([]);
  const [gameOver, setGameOver] = useState(false);
  const [winner, setWinner] = useState<Player | null>(null);
  const [killFeed, setKillFeed] = useState<KillEvent[]>([]);
  
  // Canvas ref
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationFrameRef = useRef<number | undefined>(undefined);
  const lastUpdateTimeRef = useRef<number>(0);
  const frameCountRef = useRef<number>(0);
  
  // Touch control refs
  const touchOverlayRef = useRef<HTMLDivElement>(null);
  const touchStartXRef = useRef<number>(0);
  const touchStartYRef = useRef<number>(0);
  const touchHandledRef = useRef<boolean>(false);
  const playersRef = useRef<Map<string, Player>>(new Map());
  const foodsRef = useRef<Map<string, Food>>(new Map());
  const latestServerTickRef = useRef(0);
  const gridSizeRef = useRef(gridSize);
  const killTimeoutsRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const computeCellSize = () => {
      const hasRoomForSidebar = window.innerWidth > 900;
      const sidebarAllowance = hasRoomForSidebar ? 340 : 0;
      const paddingAllowance = hasRoomForSidebar ? 120 : 60;
      const rawAvailable = window.innerWidth - sidebarAllowance - paddingAllowance;
      const availableWidth = Math.max(320, Math.min(rawAvailable, 1024));

      const baseCandidate = Math.floor(availableWidth / BASE_GRID_SIZE);
      const clampedBase = Math.min(MAX_CELL_SIZE, Math.max(MIN_CELL_SIZE, baseCandidate));

      const safeGridSize = gridSize > 0 ? gridSize : DEFAULT_GRID_SIZE;
      const scale = BASE_GRID_SIZE / safeGridSize;
      const scaled = Math.max(MIN_CELL_SIZE, Math.floor(clampedBase * scale));

      setCellSize(scaled);
    };

    computeCellSize();
    window.addEventListener('resize', computeCellSize);
    return () => window.removeEventListener('resize', computeCellSize);
  }, [gridSize]);

  useEffect(() => {
    gridSizeRef.current = gridSize;
  }, [gridSize]);

  // Current player
  const currentPlayer = players.find(p => p.id === playerId);
  const canNavigateBack = multiplayerMode || roomId || gameStarted;
  const canvasPixelSize = gridSize * cellSize + 40;
  const canvasMaxWidth = Math.min(canvasPixelSize, 820);

  const foodAudioRefs = useRef<Record<number, HTMLAudioElement>>({});
  const winSoundRef = useRef<HTMLAudioElement>(null);
  const loseSoundRef = useRef<HTMLAudioElement>(null);
  const effectAudioRefs = useRef<Record<string, HTMLAudioElement>>({});
  const playerIdRef = useRef<string>("");
  const audioUnlockedRef = useRef(false);

  useEffect(() => {
    playerIdRef.current = playerId;
  }, [playerId]);

  const playAudio = useCallback((audio?: HTMLAudioElement | null) => {
    if (!audio) return;
    try {
      audio.currentTime = 0;
      const playback = audio.play();
      if (playback && typeof playback.catch === 'function') {
        playback.catch(err => {
          console.warn("音效播放失败", err);
        });
      }
    } catch (err) {
      console.warn("音效播放失败", err);
    }
  }, []);

  const playFoodSound = useCallback((foodTypeId: number) => {
    const audio = foodAudioRefs.current[foodTypeId];
    if (audio) {
      playAudio(audio);
      return;
    }

    const fallbackSrc = FOOD_SOUNDS[foodTypeId];
    if (fallbackSrc) {
      const fallback = new Audio(fallbackSrc);
      fallback.preload = "auto";
      playAudio(fallback);
    }
  }, [playAudio]);

  const playEffectSound = useCallback((effectType: string) => {
    const audio = effectAudioRefs.current[effectType];
    if (audio) {
      playAudio(audio);
      return;
    }

    const fallbackSrc = EFFECT_SOUNDS[effectType];
    if (fallbackSrc) {
      const fallback = new Audio(fallbackSrc);
      fallback.preload = "auto";
      playAudio(fallback);
    }
  }, [playAudio]);

  const unlockAudio = useCallback(() => {
    if (audioUnlockedRef.current) return;
    const queued = [
      ...Object.values(foodAudioRefs.current),
      ...Object.values(effectAudioRefs.current),
      winSoundRef.current,
      loseSoundRef.current,
    ].filter((audio): audio is HTMLAudioElement => Boolean(audio));

    queued.forEach(audio => {
      try {
        audio.muted = true;
        const playPromise = audio.play();
        if (playPromise) {
          playPromise.then(() => {
            audio.pause();
            audio.currentTime = 0;
            audio.muted = false;
          }).catch((err) => {
            console.warn('音频预加载失败', err);
            audio.muted = false;
          });
        }
      } catch (error) {
        console.warn('音频预加载失败', error);
        audio.muted = false;
      }
    });

    audioUnlockedRef.current = true;
  }, []);

  const playGameOverSound = useCallback((didWin: boolean) => {
    if (didWin) {
      playAudio(winSoundRef.current);
    } else {
      playAudio(loseSoundRef.current);
    }
  }, [playAudio]);

  const applyStateDelta = useCallback((delta: StateDelta) => {
    if (!delta || !delta.tick) return;
    if (delta.tick <= latestServerTickRef.current) {
      return;
    }
    latestServerTickRef.current = delta.tick;

    const playersMap = new Map(playersRef.current);
    const foodsMap = new Map(foodsRef.current);

    delta.players?.forEach(playerDelta => {
      const base = playersMap.get(playerDelta.id) ?? playersRef.current.get(playerDelta.id);
      if (!base) {
        if (playerDelta.fullSnake) {
          const fallback: Player = {
            id: playerDelta.id,
            name: '',
            isReady: false,
            snake: cloneSnake(playerDelta.fullSnake),
            direction: playerDelta.direction ?? 'RIGHT',
            color: playerDelta.color ?? '#ffffff',
            isAlive: playerDelta.isAlive ?? true,
            score: playerDelta.score ?? 0,
            effects: playerDelta.effects ? cloneEffects(playerDelta.effects) : [],
            reviveCharges: playerDelta.reviveCharges ?? 0,
          };
          playersMap.set(playerDelta.id, fallback);
        }
        return;
      }

      const nextPlayer = clonePlayerState(base);

      if (playerDelta.fullSnake) {
        nextPlayer.snake = cloneSnake(playerDelta.fullSnake);
      } else if (playerDelta.movement) {
        const newSnake = [clonePosition(playerDelta.movement.head), ...nextPlayer.snake.map(clonePosition)];
        for (let i = 0; i < playerDelta.movement.removedTail && newSnake.length > 0; i += 1) {
          newSnake.pop();
        }
        nextPlayer.snake = newSnake;
      }

      if (playerDelta.direction) {
        nextPlayer.direction = playerDelta.direction;
      }

      if (playerDelta.isAlive !== undefined) {
        nextPlayer.isAlive = playerDelta.isAlive;
        if (!playerDelta.isAlive && !playerDelta.fullSnake) {
          nextPlayer.snake = [];
        }
      }

      if (playerDelta.score !== undefined) {
        nextPlayer.score = playerDelta.score;
      }

      if (playerDelta.effects) {
        nextPlayer.effects = cloneEffects(playerDelta.effects);
      }

      if (playerDelta.reviveCharges !== undefined) {
        nextPlayer.reviveCharges = playerDelta.reviveCharges;
      }

      if (playerDelta.color) {
        nextPlayer.color = playerDelta.color;
      }

      playersMap.set(playerDelta.id, nextPlayer);
    });

    delta.removedPlayers?.forEach(id => {
      playersMap.delete(id);
    });

    if (delta.foods) {
      delta.foods.added?.forEach(food => {
        foodsMap.set(food.id, cloneFoodState(food));
      });
      delta.foods.updated?.forEach(update => {
        const existing = foodsMap.get(update.id);
        if (!existing) return;
        foodsMap.set(update.id, {
          ...existing,
          ...update,
        });
      });
      delta.foods.removed?.forEach(id => {
        foodsMap.delete(id);
      });
    }

    playersRef.current = playersMap;
    foodsRef.current = foodsMap;

    setPlayers(Array.from(playersMap.values()));
    setFoods(Array.from(foodsMap.values()));
  }, [setPlayers, setFoods]);

  const applyLocalPrediction = useCallback((newDirection: Player['direction']) => {
    const localPlayerId = playerIdRef.current;
    if (!localPlayerId) return;
    const base = playersRef.current.get(localPlayerId);
    if (!base || !base.isAlive || base.snake.length === 0) return;

    const predicted = clonePlayerState(base);
    predicted.direction = newDirection;

    const head = clonePosition(predicted.snake[0]);
    switch (newDirection) {
      case 'UP': head.y -= 1; break;
      case 'DOWN': head.y += 1; break;
      case 'LEFT': head.x -= 1; break;
      case 'RIGHT': head.x += 1; break;
    }

    const grid = gridSizeRef.current;
    head.x = Math.max(0, Math.min(grid - 1, head.x));
    head.y = Math.max(0, Math.min(grid - 1, head.y));

    const newSnake = [head, ...predicted.snake.map(clonePosition)];
    const willEat = Array.from(foodsRef.current.values()).some(food => !food.isCorpse && Math.round(food.x) === head.x && Math.round(food.y) === head.y);
    if (!willEat) {
      newSnake.pop();
    }
    predicted.snake = newSnake;

    const playersMap = new Map(playersRef.current);
    playersMap.set(localPlayerId, predicted);
    playersRef.current = playersMap;
    setPlayers(Array.from(playersMap.values()));
  }, [setPlayers]);

  const enqueueKillAnnouncement = useCallback((payload: { killerId: string; killerName: string; victimId: string; victimName: string; timestamp: number; }) => {
    const id = `${payload.timestamp}-${payload.killerId}-${payload.victimId}`;
    setKillFeed(prev => {
      const withoutDuplicate = prev.filter(event => event.id !== id);
      const next = [...withoutDuplicate, { ...payload, id }];
      return next.slice(-4);
    });
    const existingTimeout = killTimeoutsRef.current.get(id);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }
    const timeoutId = window.setTimeout(() => {
      setKillFeed(prev => prev.filter(event => event.id !== id));
      killTimeoutsRef.current.delete(id);
    }, 4000);
    killTimeoutsRef.current.set(id, timeoutId);
  }, [setKillFeed]);

  const clearKillFeed = useCallback(() => {
    killTimeoutsRef.current.forEach(timeoutId => clearTimeout(timeoutId));
    killTimeoutsRef.current.clear();
    setKillFeed([]);
  }, [setKillFeed]);

  const socketInitializer = useCallback(() => {
    // --- DEBUG LINE ---
    console.log("Attempting to connect to socket server at:", process.env.NEXT_PUBLIC_SOCKET_URL);
    // ------------------
    const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:3001";
    socket = io(socketUrl);

    socket.on("connect", () => {
      console.log(`已连接到服务器: ${socketUrl}`);
      unlockAudio();
    });
    const handleFoodConsumed = ({ playerId: eaterId, foodTypeId }: { playerId: string; foodTypeId: number }) => {
      if (playerIdRef.current && eaterId === playerIdRef.current) {
        playFoodSound(foodTypeId);
      }
    };
    const handleEffectTriggered = ({ playerId: effectPlayerId, effects }: { playerId: string; effects: string[] }) => {
      if (playerIdRef.current && effectPlayerId === playerIdRef.current) {
        effects.forEach(playEffectSound);
      }
    };
    const handlePlayerDied = ({ playerId: deadPlayerId }: { playerId: string; killerId?: string }) => {
      if (playerIdRef.current && deadPlayerId === playerIdRef.current) {
        playEffectSound('death');
      }
    };
    socket.on('roomCreated', ({ roomId, playerId, isOwner }) => {
      setRoomId(roomId);
      setPlayerId(playerId);
      setIsOwner(isOwner);
      setRoomError('');
    });
    socket.on('joinedRoom', ({ roomId, playerId, isOwner }) => {
      setRoomId(roomId);
      setPlayerId(playerId);
      setIsOwner(isOwner);
      setRoomError('');
      socket?.emit('requestRoomList');
    });
    socket.on('updatePlayers', (updatedPlayers: Player[]) => {
      setPlayers(updatedPlayers);
      playersRef.current = new Map(updatedPlayers.map(player => [player.id, clonePlayerState(player)]));
    });
    socket.on('gameStarted', (initialGameState) => {
      setGameOver(false);
      setWinner(null);
      setGameStarted(true);
      setRoomError('');
      latestServerTickRef.current = 0;
      clearKillFeed();
      if (initialGameState.gridSize) setGridSize(initialGameState.gridSize);

      if (Array.isArray(initialGameState.players)) {
        setPlayers(initialGameState.players);
        playersRef.current = new Map(initialGameState.players.map(player => [player.id, clonePlayerState(player)]));
      } else {
        playersRef.current.clear();
      }

      if (Array.isArray(initialGameState.foods)) {
        setFoods(initialGameState.foods);
        foodsRef.current = new Map(initialGameState.foods.map(food => [food.id, cloneFoodState(food)]));
      } else {
        foodsRef.current.clear();
        setFoods([]);
      }
    });
    socket.on('stateDelta', applyStateDelta);
    socket.on('killAnnouncement', enqueueKillAnnouncement);
    socket.on('gameOver', (winner) => {
      if (playerIdRef.current) {
        const didWin = Boolean(winner && winner.id === playerIdRef.current);
        playGameOverSound(didWin);
      }
      setGameStarted(false);
      setGameOver(true);
      setWinner(winner);
    });
    socket.on('gameReset', () => {
      setGameStarted(false);
      setGameOver(false);
      setWinner(null);
      latestServerTickRef.current = 0;
      foodsRef.current.clear();
      setFoods([]);
      clearKillFeed();
    });
    socket.on('roomList', (list: RoomSummary[]) => setRoomsSummary(list));
    socket.on('leftRoom', () => {
      setRoomId('');
      setIsOwner(false);
      setPlayers([]);
      setGameStarted(false);
      setGameOver(false);
      setWinner(null);
      setFoods([]);
      setRoomError('');
      latestServerTickRef.current = 0;
      playersRef.current.clear();
      foodsRef.current.clear();
      clearKillFeed();
      socket?.emit('requestRoomList');
    });
    socket.on('error', (message) => {
      const text = typeof message === 'string' ? message : '发生错误';
      setRoomError(text);
    });
    socket.on('foodConsumed', handleFoodConsumed);
    socket.on('effectTriggered', handleEffectTriggered);
    socket.on('playerDied', handlePlayerDied);
    socket?.emit('requestRoomList');
  }, [applyStateDelta, clearKillFeed, enqueueKillAnnouncement, playFoodSound, playGameOverSound, playEffectSound, unlockAudio]);

  useEffect(() => {
    if (multiplayerMode && playerName) {
      socketInitializer();
    }
    return () => {
      if (socket) {
        socket.removeAllListeners();
        socket.disconnect();
        socket = null;
      }
      clearKillFeed();
    };
  }, [clearKillFeed, multiplayerMode, playerName, socketInitializer]);

  useEffect(() => {
    const pointerUnlock = () => unlockAudio();
    window.addEventListener('pointerdown', pointerUnlock, { once: true });
    return () => {
      window.removeEventListener('pointerdown', pointerUnlock);
    };
  }, [unlockAudio]);

  const resetGame = useCallback(() => {
    if (multiplayerMode && isOwner) {
      unlockAudio();
      socket?.emit('resetGame', { roomId });
    }
  }, [multiplayerMode, isOwner, roomId, unlockAudio]);

  const navigateBackToMenu = useCallback(() => {
    if (socket) {
      socket.removeAllListeners();
      socket.disconnect();
      socket = null;
    }
    setGameStarted(false);
    setGameOver(false);
    setWinner(null);
    setMultiplayerMode(false);
    setRoomId("");
    setPlayerId("");
    setIsOwner(false);
    setPlayers([]);
    setFoods([]);
    setRoomsSummary([]);
    setRoomError('');
    playersRef.current.clear();
    foodsRef.current.clear();
    latestServerTickRef.current = 0;
    clearKillFeed();
  }, [clearKillFeed]);

  const startSinglePlayer = () => {
    // 跳转到单人模式页面
    unlockAudio();
    window.location.href = `/single-player.html?playerName=${encodeURIComponent(playerName)}`;
  };

  const changeDirection = useCallback((newDirection: "UP" | "DOWN" | "LEFT" | "RIGHT") => {
    if (multiplayerMode) {
      if (socket && roomId) {
        socket.emit('changeDirection', { roomId, direction: newDirection });
        applyLocalPrediction(newDirection);
      }
    } else {
      setPlayers(prevPlayers => {
        const player = prevPlayers[0];
        if (!player) return prevPlayers;
        const currentDirection = player.direction;
        if (newDirection === 'UP' && currentDirection !== 'DOWN') return [{...player, direction: newDirection}];
        if (newDirection === 'DOWN' && currentDirection !== 'UP') return [{...player, direction: newDirection}];
        if (newDirection === 'LEFT' && currentDirection !== 'RIGHT') return [{...player, direction: newDirection}];
        if (newDirection === 'RIGHT' && currentDirection !== 'LEFT') return [{...player, direction: newDirection}];
        return prevPlayers;
      });
    }
  }, [applyLocalPrediction, multiplayerMode, roomId]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      unlockAudio();
      let newDirection: "UP" | "DOWN" | "LEFT" | "RIGHT" | null = null;
      switch (e.key) {
        case "ArrowUp": newDirection = "UP"; break;
        case "ArrowDown": newDirection = "DOWN"; break;
        case "ArrowLeft": newDirection = "LEFT"; break;
        case "ArrowRight": newDirection = "RIGHT"; break;
      }
      if (newDirection) {
        changeDirection(newDirection);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [roomId, multiplayerMode, changeDirection, unlockAudio]);

  const createRoom = () => {
    if (!playerName.trim()) {
      setRoomError('请输入昵称后再创建房间');
      return;
    }
    setRoomError('');
    unlockAudio();
    socket?.emit('createRoom', { playerName, gridSize });
  };
  const joinRoomFromList = useCallback((targetRoomId: string, isJoinable: boolean) => {
    if (!isJoinable) return;
    if (!playerName.trim()) {
      setRoomError('请输入昵称后再加入房间');
      return;
    }
    setRoomError('');
    unlockAudio();
    socket?.emit('joinRoom', { roomId: targetRoomId, playerName });
  }, [playerName, unlockAudio]);
  const leaveRoom = useCallback(() => {
    if (!roomId) return;
    unlockAudio();
    socket?.emit('leaveRoom', { roomId });
  }, [roomId, unlockAudio]);
  const readyUp = () => {
    if (!roomId) return;
    unlockAudio();
    socket?.emit('playerReady', { roomId });
  };
  const startGame = () => {
    if (!roomId) return;
    unlockAudio();
    socket?.emit('startGame', { roomId });
  };

  // Canvas drawing functions
  const drawGame = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !gameStarted) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const cellSize = Math.min(width / gridSize, height / gridSize);
    const offsetX = (width - cellSize * gridSize) / 2;
    const offsetY = (height - cellSize * gridSize) / 2;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Draw background
    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.fillRect(offsetX, offsetY, cellSize * gridSize, cellSize * gridSize);

    // Draw grid
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 0.5;
    for (let x = 0; x <= gridSize; x++) {
      ctx.beginPath();
      ctx.moveTo(offsetX + x * cellSize, offsetY);
      ctx.lineTo(offsetX + x * cellSize, offsetY + cellSize * gridSize);
      ctx.stroke();
    }
    for (let y = 0; y <= gridSize; y++) {
      ctx.beginPath();
      ctx.moveTo(offsetX, offsetY + y * cellSize);
      ctx.lineTo(offsetX + cellSize * gridSize, offsetY + y * cellSize);
      ctx.stroke();
    }

    // Draw foods with effects
    const now = Date.now();
    foods.forEach(food => {
      const lifetime = food.customLifetime ?? food.type.lifetime;
      const elapsed = now - food.spawnTime;
      const remaining = lifetime - elapsed;
      const percent = lifetime > 0 ? Math.max(0, Math.min(100, remaining / lifetime * 100)) : 0;

      if (food.isCorpse && elapsed >= lifetime) {
        return;
      }

      if (food.isCorpse) {
        const flickerVisible = Math.floor(elapsed / 120) % 2 === 0;
        if (!flickerVisible) {
          return;
        }

        const corpseColor = (() => {
          const raw = food.corpseColor ?? '#ffffff';
          if (raw.startsWith('bg-')) {
            return raw.replace('bg-', '').replace('-500', '');
          }
          return raw;
        })();

        const cellX = offsetX + food.x * cellSize;
        const cellY = offsetY + food.y * cellSize;

        ctx.save();
        ctx.globalAlpha = 0.6;
        ctx.fillStyle = corpseColor;
        ctx.fillRect(cellX + 1, cellY + 1, cellSize - 2, cellSize - 2);
        ctx.strokeStyle = '#ffffffaa';
        ctx.lineWidth = 1;
        ctx.strokeRect(cellX + 0.5, cellY + 0.5, cellSize - 1, cellSize - 1);
        ctx.restore();
        return;
      }

      let fillStyle: string | CanvasGradient = food.type.color;
      if (food.type.color === 'rainbow') {
        const gradient = ctx.createRadialGradient(
          offsetX + food.x * cellSize + cellSize/2,
          offsetY + food.y * cellSize + cellSize/2,
          0,
          offsetX + food.x * cellSize + cellSize/2,
          offsetY + food.y * cellSize + cellSize/2,
          cellSize/2
        );
        gradient.addColorStop(0, 'red');
        gradient.addColorStop(0.2, 'orange');
        gradient.addColorStop(0.4, 'yellow');
        gradient.addColorStop(0.6, 'green');
        gradient.addColorStop(0.8, 'blue');
        gradient.addColorStop(1, 'purple');
        fillStyle = gradient;
      } else if (food.type.color.startsWith('linear-gradient')) {
        const gradient = ctx.createLinearGradient(
          offsetX + food.x * cellSize,
          offsetY + food.y * cellSize,
          offsetX + food.x * cellSize + cellSize,
          offsetY + food.y * cellSize + cellSize
        );
        gradient.addColorStop(0, '#00ffaa');
        gradient.addColorStop(1, '#00aaff');
        fillStyle = gradient;
      }

      // Blink effect when food is about to expire
      if (percent < 20 && Math.floor(now / 200) % 2 === 0) {
        fillStyle = '#ffffff';
      }

      ctx.fillStyle = fillStyle;
      ctx.beginPath();
      ctx.arc(
        offsetX + food.x * cellSize + cellSize/2,
        offsetY + food.y * cellSize + cellSize/2,
        cellSize/2 - 2,
        0,
        Math.PI * 2
      );
      ctx.fill();

      // Border
      ctx.strokeStyle = 'white';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Food ID
      ctx.fillStyle = 'white';
      ctx.font = 'bold 10px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(
        food.type.id === 10 ? 'X' : food.type.id.toString(),
        offsetX + food.x * cellSize + cellSize/2,
        offsetY + food.y * cellSize + cellSize/2
      );

      // Timer bar
      ctx.fillStyle = `hsl(${percent * 1.2}, 100%, 50%)`;
      ctx.fillRect(
        offsetX + food.x * cellSize,
        offsetY + food.y * cellSize + cellSize - 3,
        cellSize * (percent / 100),
        2
      );
    });

    // Draw players
    players.forEach(player => {
      const shouldRender = player.isAlive || (!player.isAlive && player.snake.length > 0);
      if (!shouldRender) return;

      if (!player.isAlive) {
        ctx.globalAlpha = 0.6;
      }

      const invincibleEffect = player.effects.find(effect => effect.type === 'invincible');
      
      player.snake.forEach((segment, index) => {
        // Head vs body color
        if (index === 0) {
          ctx.fillStyle = player.color.replace('bg-', '').replace('-500', '') + 'cc'; // Add transparency
          ctx.shadowColor = player.color.replace('bg-', '').replace('-500', '');
          ctx.shadowBlur = 15;
        } else {
          ctx.fillStyle = player.color.replace('bg-', '').replace('-500', '');
          ctx.shadowColor = player.color.replace('bg-', '').replace('-500', '');
          ctx.shadowBlur = 5;
        }

        // Invincible blink effect
        if (invincibleEffect && frameCountRef.current % 10 < 5) {
          ctx.fillStyle = '#ffffff';
          ctx.shadowColor = '#ffffff';
        }

        ctx.beginPath();
        ctx.arc(
          offsetX + segment.x * cellSize + cellSize/2,
          offsetY + segment.y * cellSize + cellSize/2,
          cellSize/2 - 1,
          0,
          Math.PI * 2
        );
        ctx.fill();

        // Border
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 1;
        ctx.stroke();

        // Draw head direction
        if (index === 0 && player.isAlive) {
          ctx.fillStyle = invincibleEffect ? '#000000' : 'white';
          let eyeOffsetX = 0;
          let eyeOffsetY = 0;

          switch (player.direction) {
            case 'UP':
              eyeOffsetX = -3;
              eyeOffsetY = -3;
              break;
            case 'DOWN':
              eyeOffsetX = -3;
              eyeOffsetY = 3;
              break;
            case 'LEFT':
              eyeOffsetX = -3;
              eyeOffsetY = -3;
              break;
            case 'RIGHT':
              eyeOffsetX = 3;
              eyeOffsetY = -3;
              break;
          }

          ctx.fillRect(
            offsetX + segment.x * cellSize + cellSize/2 + eyeOffsetX - 1,
            offsetY + segment.y * cellSize + cellSize/2 + eyeOffsetY - 1,
            2, 2
          );
          ctx.fillRect(
            offsetX + segment.x * cellSize + cellSize/2 - eyeOffsetX - 1,
            offsetY + segment.y * cellSize + cellSize/2 + eyeOffsetY - 1,
            2, 2
          );

          // Player name
          ctx.fillStyle = 'white';
          ctx.font = 'bold 12px Arial';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(
            player.name,
            offsetX + segment.x * cellSize + cellSize/2,
            offsetY + segment.y * cellSize + cellSize/2 + 15
          );
        }
      });
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;
    });

    frameCountRef.current = (frameCountRef.current || 0) + 1;
  }, [foods, gameStarted, gridSize, players]);

  // Animation loop
  useEffect(() => {
    if (!gameStarted) {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = undefined;
      }
      return;
    }

    const animate = (timestamp: number) => {
      if (!lastUpdateTimeRef.current) {
        lastUpdateTimeRef.current = timestamp;
      }

      drawGame();
      animationFrameRef.current = requestAnimationFrame(animate);
    };

    animationFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [drawGame, gameStarted]);

  // Magnet effect - attract nearby foods
  useEffect(() => {
    if (!gameStarted || !currentPlayer) return;

    const magnetEffect = currentPlayer.effects.find(effect => effect.type === 'magnet');
    if (!magnetEffect) return;

    const interval = setInterval(() => {
      setFoods(prevFoods => {
        const head = currentPlayer.snake[0];
        const magnetRadius = 5;
        const updatedFoods = prevFoods.map(food => ({ ...food }));

        updatedFoods.forEach(food => {
          const dx = food.x - head.x;
          const dy = food.y - head.y;
          const distance = Math.sqrt(dx * dx + dy * dy);

          if (distance < magnetRadius && distance > 0.5) {
            food.x -= Math.sign(dx) * 0.5;
            food.y -= Math.sign(dy) * 0.5;

            if (Math.abs(food.x - head.x) < 0.5) food.x = head.x;
            if (Math.abs(food.y - head.y) < 0.5) food.y = head.y;
          }
        });

        foodsRef.current = new Map(updatedFoods.map(food => [food.id, { ...food }]));
        return updatedFoods;
      });
    }, 100);

    return () => clearInterval(interval);
  }, [currentPlayer, gameStarted]);

  const PlayerList = ({
    players,
    currentPlayerId,
    open,
    onToggle
  }: {
    players: Player[];
    currentPlayerId: string;
    open: boolean;
    onToggle: () => void;
  }) => (
    <div className={`players-panel collapsible-panel${open ? ' open' : ' closed'}`}>
      <div
        className="panel-header"
        onClick={onToggle}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onToggle();
          }
        }}
        role="button"
        tabIndex={0}
        aria-expanded={open}
      >
        <h2>玩家列表</h2>
        <span className="panel-toggle-indicator">{open ? '-' : '+'}</span>
      </div>
      {open && (
        <div id="players-list">
          {players.map((player) => (
            <div key={player.id} className={`player ${player.isAlive ? 'player-alive' : 'player-dead'}`}>
              <div className="player-color" style={{ backgroundColor: player.color.replace('bg-', '').replace('-500', '') }}></div>
              <span>{player.name}{player.id === currentPlayerId && ' (你)'}</span>
              <span style={{ marginLeft: 'auto' }}>分数: {player.score}</span>
              <span style={{ marginLeft: '12px' }}>复活甲: {player.reviveCharges ?? 0}</span>
               {!player.isAlive && gameStarted && ' ☠️'}
               {!gameStarted && (player.isReady ? ' ✅' : ' ❌')}
            </div>
          ))}
        </div>
      )}
    </div>
  );

  const EffectsPanel = ({ effects }: { effects: Effect[] }) => (
    <div className="effects-panel">
        <h2>当前效果</h2>
        <div id="current-effects">
            {effects.length > 0 ? effects.map((effect, index) => {
                const effectLabel = EFFECT_LABELS[effect.type] ?? effect.type;
                return (
                    <div key={index}>{effectLabel} - {Math.ceil(effect.duration / 1000)}秒</div>
                );
            }) : '无'}
        </div>
    </div>
  );

  const FoodInfoPanel = ({ open, onToggle }: { open: boolean; onToggle: () => void }) => (
      <div className={`foods-info collapsible-panel${open ? ' open' : ' closed'}`}>
          <div
            className="panel-header foods-info-header"
            onClick={onToggle}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onToggle();
              }
            }}
            role="button"
            tabIndex={0}
            aria-expanded={open}
          >
            <h2>食物类型</h2>
            <span className="panel-toggle-indicator">{open ? '-' : '+'}</span>
          </div>
          {open && (
            <div className="foods-info-body">
              {Object.values(FOOD_TYPES).map(food => (
                <div className="food-item" key={food.id}>
                    <div className="food-icon" style={{ background: food.color, color: food.id === 9 ? 'black' : 'white' }}>
                        {food.id === 10 ? 'X' : food.id}
                    </div>
                    <div className="food-text">
                      <span>{food.name}</span>
                      {food.description && <small>{food.description}</small>}
                    </div>
                </div>
              ))}
            </div>
          )}
      </div>
  );


  // Touch event handlers
  useEffect(() => {
    const touchOverlay = touchOverlayRef.current;
    if (!touchOverlay) return;

    const handleTouchStart = (e: TouchEvent) => {
      e.preventDefault();
      unlockAudio();
      touchStartXRef.current = e.touches[0].clientX;
      touchStartYRef.current = e.touches[0].clientY;
      touchHandledRef.current = false;
    };

    const handleTouchMove = (e: TouchEvent) => {
      e.preventDefault();
      unlockAudio();
      if (!gameStarted || touchHandledRef.current) return;

      const touchEndX = e.touches[0].clientX;
      const touchEndY = e.touches[0].clientY;

      const dx = touchEndX - touchStartXRef.current;
      const dy = touchEndY - touchStartYRef.current;

      if (Math.abs(dx) > 20 || Math.abs(dy) > 20) {
        if (!currentPlayer?.isAlive) return;

        const freezeEffect = currentPlayer.effects.find(effect => effect.type === 'freeze');
        if (freezeEffect) return;

        let newDirection: "UP" | "DOWN" | "LEFT" | "RIGHT" | null = null;

        if (Math.abs(dx) > Math.abs(dy)) {
          // Horizontal swipe
          if (dx > 0) newDirection = "RIGHT";
          else if (dx < 0) newDirection = "LEFT";
        } else {
          // Vertical swipe
          if (dy > 0) newDirection = "DOWN";
          else if (dy < 0) newDirection = "UP";
        }

        if (newDirection) {
          changeDirection(newDirection);
          touchHandledRef.current = true;
        }
      }
    };

    touchOverlay.addEventListener('touchstart', handleTouchStart, { passive: false });
    touchOverlay.addEventListener('touchmove', handleTouchMove, { passive: false });

    return () => {
      touchOverlay.removeEventListener('touchstart', handleTouchStart);
      touchOverlay.removeEventListener('touchmove', handleTouchMove);
    };
  }, [gameStarted, currentPlayer, changeDirection, unlockAudio]);

  // Prevent scrolling during gameplay
  useEffect(() => {
    if (gameStarted) {
      document.body.style.overflow = 'hidden';
      if (touchOverlayRef.current) {
        touchOverlayRef.current.style.display = 'block';
      }
    } else {
      document.body.style.overflow = '';
      if (touchOverlayRef.current) {
        touchOverlayRef.current.style.display = 'none';
      }
    }

    return () => {
      document.body.style.overflow = '';
    };
  }, [gameStarted]);

  return (
    <div className="container">
      {Object.entries(FOOD_SOUNDS).map(([id, src]) => (
        <audio
          key={id}
          ref={(element) => {
            const numericId = Number(id);
            if (element) {
              foodAudioRefs.current[numericId] = element;
            } else {
              delete foodAudioRefs.current[numericId];
            }
          }}
          src={src}
          preload="auto"
        ></audio>
      ))}
      {Object.entries(EFFECT_SOUNDS).map(([effectType, src]) => (
        <audio
          key={effectType}
          ref={(element) => {
            if (element) {
              effectAudioRefs.current[effectType] = element;
            } else {
              delete effectAudioRefs.current[effectType];
            }
          }}
          src={src}
          preload="auto"
        ></audio>
      ))}
      <audio ref={winSoundRef} src={WIN_SOUND_SRC} preload="auto"></audio>
      <audio ref={loseSoundRef} src={LOSE_SOUND_SRC} preload="auto"></audio>
      {killFeed.length > 0 && (
        <div className="kill-feed">
          {killFeed.map((event) => (
            <div key={event.id} className="kill-feed-item">
              <span className="kill-feed-killer">{event.killerName}</span>
              <span className="kill-feed-verb"> 终结了 </span>
              <span className="kill-feed-victim">{event.victimName}</span>
            </div>
          ))}
        </div>
      )}
      <div 
        ref={touchOverlayRef}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          zIndex: 10,
          display: 'none'
        }}
      />
      <header>
        <div className="header-bar">
          <h1>贪吃蛇大作战</h1>
          <div className="header-actions">
            {canNavigateBack && (
              <button onClick={navigateBackToMenu}>
                返回上一页
              </button>
            )}
            {roomId && (
              <button onClick={leaveRoom}>
                退出房间
              </button>
            )}
          </div>
        </div>
        {roomId && <div className="status">房间号: {roomId}</div>}
      </header>
      
      {!multiplayerMode && !gameStarted ? (
        <div>
          <div className="flex flex-col items-center gap-4">
            <input
              type="text"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              placeholder="输入你的名字"
              className="px-4 py-2 border rounded"
            />
            <div className="flex gap-4">
              <button onClick={startSinglePlayer} disabled={!playerName.trim()}>
                单人模式
              </button>
              <button onClick={() => setMultiplayerMode(true)} disabled={!playerName.trim()}>
                多人模式
              </button>
            </div>
          </div>
        </div>
      ) : !roomId && multiplayerMode ? (
        <div className="flex flex-col gap-4 items-center w-full">
          <div className="flex gap-4">
            <button onClick={createRoom} disabled={!playerName.trim()}>
              创建房间
            </button>
            <button onClick={navigateBackToMenu}>
              返回
            </button>
          </div>
          {!playerName.trim() && (
            <div className="hint-text">请输入昵称后才能加入房间</div>
          )}
          {roomError && <div className="error-text">{roomError}</div>}
          <div className="room-list">
            {roomsSummary.length === 0 ? (
              <div className="room-empty">暂无房间，快来创建第一个吧！</div>
            ) : (
              roomsSummary.map((summary) => {
                const disabled = !summary.isJoinable || !playerName.trim();
                return (
                  <button
                    key={summary.roomId}
                    className={`room-card${disabled ? ' disabled' : ''}`}
                    onClick={() => joinRoomFromList(summary.roomId, summary.isJoinable)}
                    disabled={disabled}
                  >
                    <span>房间 {summary.roomId}</span>
                    <span>{summary.playerCount}/{summary.capacity}</span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      ) : gameStarted && !multiplayerMode ? (
        // 不再显示React的单人模式，直接跳转到单人页面
        <div className="text-center">
          <p>正在加载单人模式游戏...</p>
          <p>如果页面没有自动跳转，请<a href="/single-player.html" className="text-blue-500 underline">点击这里</a></p>
        </div>
      ) : (
        // Multiplayer Room View
        <div className="game-area">
            <div className="canvas-wrapper">
              <div className="relative">
                {gameOver && (
                    <div className="absolute inset-0 bg-black bg-opacity-50 flex flex-col items-center justify-center z-10">
                        <div className="text-white text-3xl font-bold">游戏结束!</div>
                        {winner && <div className="text-yellow-400 text-2xl mt-2">获胜者是 {winner.name}</div>}
                        {isOwner && <button onClick={resetGame} className="mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600">再玩一局</button>}
                    </div>
                )}
                <canvas
                  ref={canvasRef}
                  id="game-board"
                  width={canvasPixelSize}
                  height={canvasPixelSize}
                  className="border border-white rounded"
                  style={{
                    backgroundColor: 'rgba(0, 0, 0, 0.8)',
                    width: '100%',
                    maxWidth: `${canvasMaxWidth}px`,
                    height: 'auto'
                  }}
                />
                {!gameStarted && !gameOver && (
                  <div className="canvas-controls">
                    <button onClick={readyUp}>
                      {players.find(p => p.id === playerId)?.isReady ? '取消准备' : '准备'}
                    </button>
                    {isOwner && (
                      <button onClick={startGame} disabled={!players.every(p => p.isReady)}>
                        开始游戏
                      </button>
                    )}
                  </div>
                )}
                <div className="mobile-only">
                  <PlayerList
                    players={players}
                    currentPlayerId={playerId}
                    open={playerListOpen}
                    onToggle={() => setPlayerListOpen(prev => !prev)}
                  />
                </div>
              </div>
            </div>
            <div className="sidebar">
                {gameStarted && <EffectsPanel effects={currentPlayer?.effects || []} />}
                <div className="desktop-only">
                  <PlayerList
                    players={players}
                    currentPlayerId={playerId}
                    open={playerListOpen}
                    onToggle={() => setPlayerListOpen(prev => !prev)}
                  />
                </div>

                <FoodInfoPanel
                  open={foodPanelOpen}
                  onToggle={() => setFoodPanelOpen(prev => !prev)}
                />
            </div>
        </div>
      )}
    </div>
  );
}
