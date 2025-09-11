"use client";
import { useState, useEffect, useCallback, useRef } from "react";
import { io, Socket } from "socket.io-client";
import { v4 as uuidv4 } from "uuid";

let socket: Socket;

type Position = {
  x: number;
  y: number;
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
  const [gridSize, setGridSize] = useState(20);
  const CELL_SIZE = 20;

  const [playerName, setPlayerName] = useState("");
  const [gameStarted, setGameStarted] = useState(false);
  const [foods, setFoods] = useState<Position[]>([]);
  const [gameOver, setGameOver] = useState(false);
  const [winner, setWinner] = useState<Player | null>(null);
  const [isMobile, setIsMobile] = useState(false);
  
  // Sound effect ref
  const eatSoundRef = useRef<HTMLAudioElement>(null);
  const prevScores = useRef<Map<string, number>>(new Map());

  const socketInitializer = useCallback(() => {
    socket = io("http://localhost:3001");

    socket.on("connect", () => console.log("已连接到服务器"));
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
    socket.on('gameState', ({ players, foods, gridSize }) => {
      setPlayers(players);
      setFoods(foods);
      if (gridSize) setGridSize(gridSize);
    });
    socket.on('gameOver', (winner) => {
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
  }, []);

  useEffect(() => {
    if (multiplayerMode && playerName) {
      socketInitializer();
    }
    return () => {
      if (socket) socket.disconnect();
    };
  }, [multiplayerMode, playerName, socketInitializer]);

  useEffect(() => {
    const isMobileDevice = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    setIsMobile(isMobileDevice);
  }, []);

  // Sound effect trigger
  useEffect(() => {
    if (!gameStarted) {
        prevScores.current.clear();
        return;
    };
    
    players.forEach(player => {
        const oldScore = prevScores.current.get(player.id) ?? 0;
        if (player.score > oldScore) {
            eatSoundRef.current?.play().catch(err => console.error("音效播放失败:", err));
        }
        prevScores.current.set(player.id, player.score);
    });
  }, [players, gameStarted]);
  
  const resetGame = useCallback(() => {
    if (multiplayerMode && isOwner) {
      socket.emit('resetGame', { roomId });
    }
  }, [multiplayerMode, isOwner, roomId]);

  const startSinglePlayer = () => {
    const newPlayerId = uuidv4();
    setPlayerId(newPlayerId);
    setPlayers([{
      id: newPlayerId, name: playerName, isReady: true,
      snake: [{ x: 10, y: 10 }], direction: "RIGHT",
      color: "bg-green-500", isAlive: true, score: 0,
    }]);
    setFoods([{ x: 5, y: 5 }]);
    setGameOver(false);
    setGameStarted(true);
    setWinner(null);
    setMultiplayerMode(false);
  };

  const changeDirection = (newDirection: "UP" | "DOWN" | "LEFT" | "RIGHT") => {
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
  };

  // Single Player Game Loop
  useEffect(() => {
    if (!gameStarted || multiplayerMode) return;

    const moveSnake = () => {
      setPlayers(prevPlayers => {
        const player = prevPlayers[0];
        if (!player || !player.isAlive) return prevPlayers;

        const newSnake = [...player.snake];
        const head = { ...newSnake[0] };

        switch (player.direction) {
          case "UP": head.y -= 1; break;
          case "DOWN": head.y += 1; break;
          case "LEFT": head.x -= 1; break;
          case "RIGHT": head.x += 1; break;
        }

        // Wall collision
        if (head.x < 0 || head.x >= gridSize || head.y < 0 || head.y >= gridSize) {
          setGameOver(true);
          return [{ ...player, isAlive: false }];
        }

        // Self collision
        if (newSnake.some(segment => segment.x === head.x && segment.y === head.y)) {
          setGameOver(true);
          return [{ ...player, isAlive: false }];
        }

        newSnake.unshift(head);

        // Food eating
        const foodIndex = foods.findIndex(f => f.x === head.x && f.y === head.y);
        if (foodIndex !== -1) {
          const newFoods = [...foods];
          newFoods.splice(foodIndex, 1);
          // Generate new food
          let newFood: Position;
          do {
            newFood = { x: Math.floor(Math.random() * gridSize), y: Math.floor(Math.random() * gridSize) };
          } while (newSnake.some(s => s.x === newFood.x && s.y === newFood.y));
          setFoods([...newFoods, newFood]);
          // Don't pop tail to grow
        } else {
          newSnake.pop();
        }
        
        return [{ ...player, snake: newSnake, score: player.score + (foodIndex !== -1 ? 10 : 0) }];
      });
    };

    const gameLoop = setInterval(moveSnake, 200);
    return () => clearInterval(gameLoop);
  }, [gameStarted, multiplayerMode, foods]);


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
  }, [roomId, multiplayerMode]);

  const createRoom = () => socket.emit('createRoom', { playerName, gridSize });
  const joinRoom = () => {
    if (!joinRoomId.trim()) return;
    socket.emit('joinRoom', { roomId: joinRoomId, playerName });
  };
  const readyUp = () => socket.emit('playerReady', { roomId });
  const startGame = () => socket.emit('startGame', { roomId });

  const currentPlayer = players.find(p => p.id === playerId);
  const score = currentPlayer ? currentPlayer.score : 0;

  const DirectionalControls = () => (
    <div className="mt-4 grid grid-cols-3 gap-2 w-48">
      <div />
      <button onTouchStart={(e) => { e.preventDefault(); changeDirection("UP"); }} onMouseDown={() => changeDirection("UP")} className="col-start-2 bg-gray-300 p-4 rounded text-2xl active:bg-gray-400">↑</button>
      <div />
      <button onTouchStart={(e) => { e.preventDefault(); changeDirection("LEFT"); }} onMouseDown={() => changeDirection("LEFT")} className="bg-gray-300 p-4 rounded text-2xl active:bg-gray-400">←</button>
      <button onTouchStart={(e) => { e.preventDefault(); changeDirection("DOWN"); }} onMouseDown={() => changeDirection("DOWN")} className="bg-gray-300 p-4 rounded text-2xl active:bg-gray-400">↓</button>
      <button onTouchStart={(e) => { e.preventDefault(); changeDirection("RIGHT"); }} onMouseDown={() => changeDirection("RIGHT")} className="bg-gray-300 p-4 rounded text-2xl active:bg-gray-400">→</button>
    </div>
  );

  const PlayerList = ({ players, currentPlayerId }: { players: Player[], currentPlayerId: string }) => (
    <div className="mt-2">
      <h3 className="font-medium">玩家列表:</h3>
      <ul className="list-disc pl-5">
        {players.map((player) => (
          <li key={player.id} className={`flex items-center gap-2 ${player.id === currentPlayerId ? 'font-bold' : ''} ${!player.isAlive && gameStarted ? 'text-gray-500' : ''}`}>
            <div className={`w-4 h-4 ${player.color}`} />
            <span>
              {player.name}
              {player.id === currentPlayerId && ' (你)'}
              {!player.isAlive && gameStarted && ' ☠️'}
              {gameStarted ? ` - 分数: ${player.score}` : (player.isReady ? ' ✅' : ' ❌')}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100">
      <audio ref={eatSoundRef} src="https://actions.google.com/sounds/v1/cartoon/pop.ogg" preload="auto"></audio>
      <h1 className="text-3xl font-bold mb-4">贪吃蛇大作战</h1>
      
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
              <button onClick={startSinglePlayer} disabled={!playerName.trim()} className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-400">
                单人模式
              </button>
              <button onClick={() => setMultiplayerMode(true)} disabled={!playerName.trim()} className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 disabled:bg-gray-400">
                多人模式
              </button>
            </div>
          </div>
        </div>
      ) : !roomId && multiplayerMode ? (
        <div className="flex flex-col gap-4 items-center">
          <div className="flex gap-4">
            <button onClick={createRoom} className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600">
              创建房间
            </button>
            <button onClick={() => { setGameStarted(false); setMultiplayerMode(false); }} className="px-4 py-2 bg-gray-500 text-white rounded hover:bg-gray-600">
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
            <button onClick={joinRoom} disabled={!joinRoomId.trim()} className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 disabled:bg-gray-400">
              加入房间
            </button>
          </div>
        </div>
      ) : gameStarted && !multiplayerMode ? (
        // Single Player Game View
        <div>
          <div className="mb-4">
            <h3>你的分数: {score}</h3>
          </div>
          {gameOver && (
            <div className="text-red-500 text-xl mb-4">
              游戏结束!
            </div>
          )}
          <div className="relative">
            <div
              className="grid bg-white border border-gray-300"
              style={{ gridTemplateColumns: `repeat(${gridSize}, ${CELL_SIZE}px)`, gridTemplateRows: `repeat(${gridSize}, ${CELL_SIZE}px)` }}
            >
              {Array.from({ length: gridSize * gridSize }).map((_, index) => {
                const x = index % gridSize;
                const y = Math.floor(index / gridSize);
                const isFood = foods.some(f => f.x === x && f.y === y);
                let cellColor = "";
                if (players[0] && players[0].isAlive) {
                  if (players[0].snake.some(segment => segment.x === x && segment.y === y)) {
                    cellColor = players[0].color;
                  }
                }
                if (isFood) cellColor = "bg-red-500";
                return <div key={index} className={`w-full h-full border border-gray-100 ${cellColor}`} />;
              })}
            </div>
          </div>
          <button onClick={startSinglePlayer} className="mt-4 px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600">
            再玩一局
          </button>
          {gameStarted && <DirectionalControls />}
        </div>
      ) : (
        // Multiplayer Room View
        <div>
          <div className="mb-4">
            <h2 className="text-xl font-semibold">房间号: {roomId}</h2>
            <h3>你的分数: {score}</h3>
          </div>
          {gameOver && (
            <div className="text-red-500 text-xl mb-4">
              游戏结束!
              {winner && ` 获胜者是 ${winner.name}`}
            </div>
          )}
          <div className="relative">
            <div
              className="grid bg-white border border-gray-300"
              style={{ gridTemplateColumns: `repeat(${gridSize}, ${CELL_SIZE}px)`, gridTemplateRows: `repeat(${gridSize}, ${CELL_SIZE}px)` }}
            >
              {Array.from({ length: gridSize * gridSize }).map((_, index) => {
                const x = index % gridSize;
                const y = Math.floor(index / gridSize);
                const isFood = foods.some(f => f.x === x && f.y === y);
                let cellColor = "";
                for (const player of players) {
                  if (player.isAlive && player.snake.some(segment => segment.x === x && segment.y === y)) {
                    cellColor = player.color;
                    break;
                  }
                }
                if (isFood) cellColor = "bg-red-500";
                return <div key={index} className={`w-full h-full border border-gray-100 ${cellColor}`} />;
              })}
            </div>
          </div>
          {gameStarted && <DirectionalControls />}
          <div className="mt-4 w-full flex flex-col items-center">
            {gameOver ? (
              isOwner && <button onClick={resetGame} className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600">
                再玩一局
              </button>
            ) : gameStarted ? (
              <PlayerList players={players} currentPlayerId={playerId} />
            ) : (
              <div className="flex flex-col items-center gap-4 mt-4">
                <PlayerList players={players} currentPlayerId={playerId} />
                {isOwner && (
                  <div className="my-2">
                    <label htmlFor="gridSizeInput" className="mr-2">画布尺寸:</label>
                    <input
                      id="gridSizeInput"
                      type="number"
                      value={gridSize}
                      onChange={(e) => setGridSize(parseInt(e.target.value, 10) || 20)}
                      className="px-2 py-1 border rounded w-20"
                      min="10"
                      max="50"
                    />
                  </div>
                )}
                <button onClick={readyUp} className="px-4 py-2 bg-yellow-500 text-white rounded hover:bg-yellow-600">
                  {players.find(p => p.id === playerId)?.isReady ? '取消准备' : '准备'}
                </button>
                {isOwner && (
                  <button onClick={startGame} disabled={!players.every(p => p.isReady)} className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 disabled:bg-gray-400">
                    开始游戏
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
