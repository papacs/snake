"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const http_1 = require("http");
const socket_io_1 = require("socket.io");
// 生成6位随机数字的房间号
function generateRoomId() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}
// 生成唯一的6位数字房间号
function generateUniqueRoomId() {
    let roomId;
    do {
        roomId = generateRoomId();
    } while (rooms.has(roomId)); // 确保房间号唯一
    return roomId;
}
const httpServer = (0, http_1.createServer)();
const io = new socket_io_1.Server(httpServer, {
    cors: {
        origin: "*", // Allow all origins, will be configured in production
        methods: ["GET", "POST"]
    }
});
const rooms = new Map();
const GAME_SPEED = 300;
const colors = ["bg-green-500", "bg-blue-500", "bg-yellow-500", "bg-purple-500"];
function generateFood(currentFoods, allSnakes, gridSize) {
    let newFood;
    const flatSnakes = allSnakes.flat();
    do {
        newFood = {
            x: Math.floor(Math.random() * gridSize),
            y: Math.floor(Math.random() * gridSize),
        };
    } while (currentFoods.some(f => f.x === newFood.x && f.y === newFood.y) ||
        flatSnakes.some(s => s.x === newFood.x && s.y === newFood.y));
    return newFood;
}
function generateRandomPosition(gridSize, existingPositions, minDistance = 3) {
    let newPosition;
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
function startGameLoop(roomId) {
    const room = rooms.get(roomId);
    if (!room || room.gameLoop)
        return;
    room.gameLoop = setInterval(() => {
        const room = rooms.get(roomId);
        if (!room)
            return;
        let currentPlayers = Array.from(room.players.values());
        let currentFoods = [...room.foods];
        const nextHeads = {};
        // 1. Calculate next head position
        currentPlayers.forEach(player => {
            if (!player.isAlive)
                return;
            const head = Object.assign({}, player.snake[0]);
            switch (player.direction) {
                case "UP":
                    head.y -= 1;
                    break;
                case "DOWN":
                    head.y += 1;
                    break;
                case "LEFT":
                    head.x -= 1;
                    break;
                case "RIGHT":
                    head.x += 1;
                    break;
            }
            nextHeads[player.id] = head;
        });
        const playersToKill = new Set();
        const lengthToAdd = {};
        // 2. Detect collisions
        currentPlayers.forEach(player => {
            if (!player.isAlive)
                return;
            const head = nextHeads[player.id];
            if (head.x < 0 || head.x >= room.gridSize || head.y < 0 || head.y >= room.gridSize)
                playersToKill.add(player.id);
            if (player.snake.some(segment => segment.x === head.x && segment.y === head.y))
                playersToKill.add(player.id);
            currentPlayers.forEach(otherPlayer => {
                var _a, _b;
                if (!otherPlayer.isAlive)
                    return;
                if (otherPlayer.snake.some(segment => segment.x === head.x && segment.y === head.y))
                    playersToKill.add(player.id);
                if (player.id !== otherPlayer.id && head.x === ((_a = nextHeads[otherPlayer.id]) === null || _a === void 0 ? void 0 : _a.x) && head.y === ((_b = nextHeads[otherPlayer.id]) === null || _b === void 0 ? void 0 : _b.y)) {
                    if (player.snake.length > otherPlayer.snake.length) {
                        playersToKill.add(otherPlayer.id);
                        lengthToAdd[player.id] = (lengthToAdd[player.id] || 0) + otherPlayer.snake.length;
                    }
                    else if (player.snake.length < otherPlayer.snake.length) {
                        playersToKill.add(player.id);
                        lengthToAdd[otherPlayer.id] = (lengthToAdd[otherPlayer.id] || 0) + player.snake.length;
                    }
                    else {
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
            if (!player.isAlive)
                return;
            const head = nextHeads[player.id];
            let newSnake = [head, ...player.snake];
            let foodIndex = currentFoods.findIndex(f => f.x === head.x && f.y === head.y);
            if (foodIndex !== -1) {
                currentFoods.splice(foodIndex, 1);
                ateFood = true;
                player.score += 10;
            }
            else {
                newSnake.pop();
            }
            if (lengthToAdd[player.id]) {
                const tail = newSnake[newSnake.length - 1];
                for (let i = 0; i < lengthToAdd[player.id]; i++)
                    newSnake.push(Object.assign({}, tail));
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
            if (room.gameLoop)
                clearInterval(room.gameLoop);
            room.gameLoop = null;
            room.gameStarted = false; // Allow reset
            // Find the last player to die or the one with the highest score to declare a winner
            let winner = null;
            if (room.players.size === 1) {
                winner = Array.from(room.players.values())[0];
            }
            else if (room.players.size > 1) {
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
        const newPlayer = {
            id: playerId,
            name: playerName,
            isReady: false,
            snake: [],
            direction: 'RIGHT',
            color: colors[0],
            isAlive: false,
            score: 0,
        };
        const room = {
            id: roomId,
            players: new Map([[playerId, newPlayer]]),
            foods: [],
            gameStarted: false,
            gameLoop: null,
            ownerId: playerId,
            gridSize: gridSize || 17,
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
            const newPlayer = {
                id: playerId,
                name: playerName,
                isReady: false,
                snake: [],
                direction: 'RIGHT',
                color: colors[room.players.size % colors.length],
                isAlive: false,
                score: 0,
            };
            room.players.set(playerId, newPlayer);
            socket.join(roomId);
            socket.emit('joinedRoom', { roomId, playerId, isOwner: false });
            io.to(roomId).emit('updatePlayers', Array.from(room.players.values()));
        }
        else {
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
            const existingPositions = [];
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
        const player = room === null || room === void 0 ? void 0 : room.players.get(socket.id);
        if (player && player.isAlive) {
            const currentDirection = player.direction;
            if (direction === 'UP' && currentDirection !== 'DOWN')
                player.direction = direction;
            if (direction === 'DOWN' && currentDirection !== 'UP')
                player.direction = direction;
            if (direction === 'LEFT' && currentDirection !== 'RIGHT')
                player.direction = direction;
            if (direction === 'RIGHT' && currentDirection !== 'LEFT')
                player.direction = direction;
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
                room.players.delete(socket.id);
                if (room.players.size === 0) {
                    if (room.gameLoop)
                        clearInterval(room.gameLoop);
                    rooms.delete(roomId);
                }
                else {
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
