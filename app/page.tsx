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
    NORMAL: { id: 1, color: '#ff0000', score: 10, length: 1, lifetime: 15000, name: "普通食物" },
    FREEZE: { id: 2, color: '#00aaff', score: 20, effect: 'freeze', duration: 3000, lifetime: 8000, name: "冰冻果实" },
    SPEED: { id: 3, color: '#ff5500', score: 30, effect: 'speed', duration: 5000, speedMultiplier: 2, lifetime: 8000, name: "加速辣椒" },
    SHRINK: { id: 4, color: '#aa00ff', score: 20, effect: 'shrink', value: 3, lifetime: 8000, name: "缩小蘑菇" },
    RAINBOW: { id: 5, color: 'rainbow', score: 50, effect: 'random', lifetime: 7000, name: "彩虹糖果" },
    TELEPORT: { id: 6, color: 'linear-gradient(45deg, #00ffaa, #00aaff)', score: 20, effect: 'teleport', lifetime: 7000, name: "传送门" },
    REVIVE: { id: 7, color: '#ffd700', score: 60, effect: 'revive', lifetime: 12000, name: "复活甲" },
    GHOST: { id: 8, color: '#00ff00', score: 40, effect: 'ghost', duration: 6000, lifetime: 8000, name: "穿墙能力" },
    INVINCIBLE: { id: 9, color: '#ffffff', score: 50, effect: 'invincible', duration: 5000, lifetime: 8000, name: "无敌状态" },
    MAGNET: { id: 10, color: '#ff00ff', score: 30, effect: 'magnet', duration: 8000, lifetime: 8000, name: "磁铁" }
} as const;

const FOOD_SOUNDS: Record<number, string> = {
  1: "https://actions.google.com/sounds/v1/cartoon/pop.ogg",
  2: "https://actions.google.com/sounds/v1/cartoon/clang_and_wobble.ogg",
  3: "https://actions.google.com/sounds/v1/cartoon/cowbell.ogg",
  4: "https://actions.google.com/sounds/v1/cartoon/wood_plank_flicks.ogg",
  5: "https://actions.google.com/sounds/v1/cartoon/magic_chime.ogg",
  6: "https://actions.google.com/sounds/v1/cartoon/ascending_whistle.ogg",
  7: "https://actions.google.com/sounds/v1/cartoon/fairy_dust_gliss.ogg",
  8: "https://actions.google.com/sounds/v1/cartoon/air_swirl.ogg",
  9: "https://actions.google.com/sounds/v1/cartoon/siren_whistle.ogg",
  10: "https://actions.google.com/sounds/v1/cartoon/suction_pop.ogg",
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
    type: typeof FOOD_TYPES[keyof typeof FOOD_TYPES];
    spawnTime: number;
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

export default function SnakeGame() {
  // Multiplayer state
  const [multiplayerMode, setMultiplayerMode] = useState(false);
  const [roomId, setRoomId] = useState("");
  const [playerId, setPlayerId] = useState("");
  const [isOwner, setIsOwner] = useState(false);
  const [players, setPlayers] = useState<Player[]>([]);
  const [joinRoomId, setJoinRoomId] = useState("");

  // Game state
  const [gridSize, setGridSize] = useState(17);
  const [cellSize, setCellSize] = useState(28);

  const [playerName, setPlayerName] = useState("");
  const [gameStarted, setGameStarted] = useState(false);
  const [foods, setFoods] = useState<Food[]>([]);
  const [gameOver, setGameOver] = useState(false);
  const [winner, setWinner] = useState<Player | null>(null);
  
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

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const computeCellSize = () => {
      const availableWidth = Math.min(window.innerWidth, 960);
      const candidate = Math.floor((availableWidth - 80) / gridSize);
      const nextSize = Math.min(32, Math.max(16, candidate));
      setCellSize(nextSize);
    };

    computeCellSize();
    window.addEventListener('resize', computeCellSize);
    return () => window.removeEventListener('resize', computeCellSize);
  }, [gridSize]);

  // Current player
  const currentPlayer = players.find(p => p.id === playerId);
  const canNavigateBack = multiplayerMode || roomId || gameStarted;
  const canvasPixelSize = gridSize * cellSize + 40;
  const canvasMaxWidth = Math.min(canvasPixelSize, 720);

  const foodAudioRefs = useRef<Record<number, HTMLAudioElement>>({});
  const winSoundRef = useRef<HTMLAudioElement>(null);
  const loseSoundRef = useRef<HTMLAudioElement>(null);
  const playerIdRef = useRef<string>("");

  useEffect(() => {
    playerIdRef.current = playerId;
  }, [playerId]);

  const playAudio = useCallback((audio?: HTMLAudioElement | null) => {
    if (!audio) return;
    try {
      audio.currentTime = 0;
      void audio.play();
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

  const playGameOverSound = useCallback((didWin: boolean) => {
    if (didWin) {
      playAudio(winSoundRef.current);
    } else {
      playAudio(loseSoundRef.current);
    }
  }, [playAudio]);

  const socketInitializer = useCallback(() => {
    // --- DEBUG LINE ---
    console.log("Attempting to connect to socket server at:", process.env.NEXT_PUBLIC_SOCKET_URL);
    // ------------------
    const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:3001";
    socket = io(socketUrl);

    socket.on("connect", () => console.log(`已连接到服务器: ${socketUrl}`));
    const handleFoodConsumed = ({ playerId: eaterId, foodTypeId }: { playerId: string; foodTypeId: number }) => {
      if (playerIdRef.current && eaterId === playerIdRef.current) {
        playFoodSound(foodTypeId);
      }
    };
    socket.on('roomCreated', ({ roomId, playerId, isOwner }) => {
      setRoomId(roomId);
      setPlayerId(playerId);
      setIsOwner(isOwner);
    });
    socket.on('joinedRoom', ({ roomId, playerId, isOwner }) => {
      setRoomId(roomId);
      setPlayerId(playerId);
      setIsOwner(isOwner);
    });
    socket.on('updatePlayers', (updatedPlayers: Player[]) => setPlayers(updatedPlayers));
    socket.on('gameStarted', (initialGameState) => {
      setGameOver(false);
      setWinner(null);
      setGameStarted(true);
      if (initialGameState.gridSize) setGridSize(initialGameState.gridSize);
      if (initialGameState.players) setPlayers(initialGameState.players);
      if (initialGameState.foods) setFoods(initialGameState.foods);
    });
    socket.on('gameState', ({ players, foods, gridSize }: { players: Player[], foods: Food[], gridSize: number }) => {
      setPlayers(players);
      setFoods(foods);
      if (gridSize) setGridSize(gridSize);
    });
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
    });
    socket.on('error', (message) => alert(message));
    socket.on('foodConsumed', handleFoodConsumed);
  }, [playFoodSound, playGameOverSound]);

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
    };
  }, [multiplayerMode, playerName, socketInitializer]);
  
  const resetGame = useCallback(() => {
    if (multiplayerMode && isOwner) {
      socket?.emit('resetGame', { roomId });
    }
  }, [multiplayerMode, isOwner, roomId]);

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
    setJoinRoomId("");
  }, []);

  const startSinglePlayer = () => {
    // 跳转到demo.html单人模式
    window.location.href = `/demo.html?playerName=${encodeURIComponent(playerName)}`;
  };

  const changeDirection = useCallback((newDirection: "UP" | "DOWN" | "LEFT" | "RIGHT") => {
    if (multiplayerMode) {
      if (socket && roomId) {
        socket.emit('changeDirection', { roomId, direction: newDirection });
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
  }, [multiplayerMode, roomId]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
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
  }, [roomId, multiplayerMode, changeDirection]);

  const createRoom = () => socket?.emit('createRoom', { playerName, gridSize });
  const joinRoom = () => {
    if (!joinRoomId.trim()) return;
    socket?.emit('joinRoom', { roomId: joinRoomId, playerName });
  };
  const readyUp = () => socket?.emit('playerReady', { roomId });
  const startGame = () => socket?.emit('startGame', { roomId });

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
      const elapsed = now - food.spawnTime;
      const remaining = food.type.lifetime - elapsed;
      const percent = Math.max(0, Math.min(100, remaining / food.type.lifetime * 100));

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
      if (!player.isAlive) return;

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
        if (index === 0) {
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
        const updatedFoods = [...prevFoods];

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

        return updatedFoods;
      });
    }, 100);

    return () => clearInterval(interval);
  }, [currentPlayer, gameStarted]);

  const PlayerList = ({ players, currentPlayerId }: { players: Player[], currentPlayerId: string }) => (
    <div className="players-panel">
      <h2>玩家列表</h2>
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

  const FoodInfoPanel = () => (
      <div className="foods-info">
          <h2>食物类型</h2>
          {Object.values(FOOD_TYPES).map(food => (
              <div className="food-item" key={food.id}>
                  <div className="food-icon" style={{ background: food.color, color: food.id === 9 ? 'black' : 'white' }}>
                      {food.id === 10 ? 'X' : food.id}
                  </div>
                  <span>{food.name}</span>
              </div>
          ))}
      </div>
  );


  // Touch event handlers
  useEffect(() => {
    const touchOverlay = touchOverlayRef.current;
    if (!touchOverlay) return;

    const handleTouchStart = (e: TouchEvent) => {
      e.preventDefault();
      touchStartXRef.current = e.touches[0].clientX;
      touchStartYRef.current = e.touches[0].clientY;
      touchHandledRef.current = false;
    };

    const handleTouchMove = (e: TouchEvent) => {
      e.preventDefault();
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
  }, [gameStarted, currentPlayer, changeDirection]);

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
      <audio ref={winSoundRef} src={WIN_SOUND_SRC} preload="auto"></audio>
      <audio ref={loseSoundRef} src={LOSE_SOUND_SRC} preload="auto"></audio>
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
        <div className="w-full flex flex-wrap items-center justify-between gap-4">
          <h1>贪吃蛇大作战</h1>
          {canNavigateBack && (
            <button onClick={navigateBackToMenu}>
              返回上一页
            </button>
          )}
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
        <div className="flex flex-col gap-4 items-center">
          <div className="flex gap-4">
            <button onClick={createRoom}>
              创建房间
            </button>
            <button onClick={navigateBackToMenu}>
              返回
            </button>
          </div>
          <div className="mt-4 text-center">或者</div>
          <div className="flex gap-2">
            <input
              type="text"
              value={joinRoomId}
              onChange={(e) => setJoinRoomId(e.target.value)}
              placeholder="输入房间号"
              className="px-4 py-2 border rounded"
            />
            <button onClick={joinRoom} disabled={!joinRoomId.trim()}>
              加入房间
            </button>
          </div>
        </div>
      ) : gameStarted && !multiplayerMode ? (
        // 不再显示React的单人模式，直接跳转到demo.html
        <div className="text-center">
          <p>正在加载单人模式游戏...</p>
          <p>如果页面没有自动跳转，请<a href="/demo.html" className="text-blue-500 underline">点击这里</a></p>
        </div>
      ) : (
        // Multiplayer Room View
        <div className="game-area">
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
            </div>
            <div className="sidebar">
                {gameStarted && <EffectsPanel effects={currentPlayer?.effects || []} />}
                
                <PlayerList players={players} currentPlayerId={playerId} />

                {!gameStarted && !gameOver && (
                    <div className="controls-stack flex flex-col items-center gap-4 mt-4">
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
                
                <FoodInfoPanel />
            </div>
        </div>
      )}
    </div>
  );
}
