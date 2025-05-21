const WebSocket = require('ws');

const wss = new WebSocket.Server({ port: 8080 });

let players = new Map(); // Stores playerId -> { ws, playerName, state: { position, rotation } }
let nextPlayerId = 1;

// Enemy related variables
let enemies = new Map(); // Stores enemyId -> { type, position, velocity, etc. }
let nextEnemyId = 1;
const enemySpawnInterval = 2000; // ms - spawn an enemy every 2 seconds
let lastEnemySpawnTime = Date.now();

console.log('WebSocket server started on port 8080');

wss.on('connection', (ws) => {
    const playerId = "player" + nextPlayerId++;
    players.set(playerId, { 
        ws: ws, 
        playerName: null, 
        state: {},
        score: 0,
        lives: 1, // Initialize lives
        isDefeated: false // Initialize defeat status
    });

    ws.send(JSON.stringify({ 
        type: 'assign_player_id', 
        payload: { playerId: playerId } 
    }));
    console.log(`Client ${playerId} connected.`);

    ws.on('message', (message) => {
        try {
            const parsedMessage = JSON.parse(message);
            // console.log(`Received from ${playerId}: `, parsedMessage);

            switch (parsedMessage.type) {
                case 'player_join':
                    const player = players.get(playerId);
                    if (player) {
                        player.playerName = parsedMessage.payload.playerName;
                        player.state = parsedMessage.payload.initialState || {}; // Store initial state if provided
                        
                        // Notify other players about the new player
                        broadcast({
                            type: 'player_joined',
                            payload: {
                                playerId: playerId,
                                playerName: player.playerName,
                            initialState: player.state,
                            score: player.score,
                            lives: player.lives, // Include lives
                            isDefeated: player.isDefeated // Include defeat status
                            }
                        }, playerId); // Exclude self

                        // Notify the new player about existing players
                        players.forEach((existingPlayer, existingPlayerId) => {
                            if (existingPlayerId !== playerId && existingPlayer.playerName) {
                                ws.send(JSON.stringify({
                                    type: 'player_joined',
                                    payload: {
                                        playerId: existingPlayerId,
                                        playerName: existingPlayer.playerName,
                                    initialState: existingPlayer.state,
                                    score: existingPlayer.score,
                                    lives: existingPlayer.lives, // Include lives
                                    isDefeated: existingPlayer.isDefeated // Include defeat status
                                    }
                                }));
                            }
                        });
                         // Notify new player about existing enemies
                        enemies.forEach((enemy, enemyId) => {
                            ws.send(JSON.stringify({
                                type: 'enemy_spawn',
                                payload: { ...enemy, enemyId: enemyId }
                            }));
                        });
                    }
                    break;

                case 'player_update':
                    const playerToUpdate = players.get(playerId);
                    if (playerToUpdate) {
                        playerToUpdate.state = { // Store the latest state
                            position: parsedMessage.payload.position,
                            rotation: parsedMessage.payload.rotation
                        };
                    }
                    // Broadcast update to other players
                    broadcast({
                        type: 'player_updated',
                        payload: { playerId: playerId, ...parsedMessage.payload }
                    }, playerId);
                    break;

                case 'player_shoot':
                    // Broadcast shoot event to other players
                    // Add a unique bulletId on the server side if needed for tracking later
                    broadcast({
                        type: 'player_shot',
                        payload: { playerId: playerId, ...parsedMessage.payload }
                    }, playerId);
                    break;
                
                case 'enemy_hit_by_player':
                    const { enemyId, playerId: hittingPlayerId } = parsedMessage.payload;
                    if (enemies.has(enemyId)) {
                        const hittingPlayer = players.get(hittingPlayerId);
                        let newScore = 0;
                        if (hittingPlayer) {
                            if (hittingPlayer.score === undefined) hittingPlayer.score = 0; 
                            hittingPlayer.score += 10;
                            newScore = hittingPlayer.score;
                            console.log(`Player ${hittingPlayerId} destroyed enemy ${enemyId}. New score: ${newScore}`);
                        } else {
                            console.log(`Enemy ${enemyId} destroyed by unknown player ${hittingPlayerId}`);
                        }

                        enemies.delete(enemyId); // Remove enemy from server

                        broadcast({
                            type: 'enemy_destroyed',
                            payload: {
                                enemyId: enemyId,
                                destroyedByPlayerId: hittingPlayerId,
                                playerScore: newScore, 
                            }
                        }, null); // Broadcast to all
                    } else {
                        console.log(`enemy_hit_by_player: Enemy ${enemyId} not found or already destroyed.`);
                    }
                    break;
            
                case 'player_hit_by_enemy':
                    const { playerId: hitPlayerId, enemyId: attackingEnemyId } = parsedMessage.payload;
                    const player = players.get(hitPlayerId);

                    if (player && !player.isDefeated && enemies.has(attackingEnemyId)) {
                        player.lives--; 
                        console.log(`Player ${hitPlayerId} was hit by enemy ${attackingEnemyId}. Lives left: ${player.lives}`);

                        enemies.delete(attackingEnemyId);
                        broadcast({
                            type: 'enemy_destroyed',
                            payload: { enemyId: attackingEnemyId, destroyedByPlayerId: null } 
                        }, null);

                        if (player.lives <= 0) {
                            player.isDefeated = true; 
                            broadcast({
                                type: 'player_game_over',
                                payload: { playerId: hitPlayerId }
                            }, null);
                            console.log(`Player ${hitPlayerId} is game over.`);

                            let allPlayersDefeated = true;
                            players.forEach(p => {
                                if (p.playerName && !p.isDefeated) { // Check playerName to ensure fully joined
                                    allPlayersDefeated = false;
                                }
                            });
                            if (allPlayersDefeated && players.size > 0) {
                                console.log('All players have been defeated.');
                                broadcast({
                                    type: 'game_over_all',
                                    payload: { reason: 'All players defeated!' }
                                }, null);
                            }
                        }
                        // Optional: Broadcast player_health_update
                        // else {
                        //     broadcast({ type: 'player_health_update', payload: { playerId: hitPlayerId, lives: player.lives }}, null);
                        // }
                    } else {
                        if (!player) console.log(`player_hit_by_enemy: Player ${hitPlayerId} not found.`);
                        else if (player && player.isDefeated) console.log(`player_hit_by_enemy: Player ${hitPlayerId} already defeated.`);
                        else if (!enemies.has(attackingEnemyId)) console.log(`player_hit_by_enemy: Enemy ${attackingEnemyId} not found.`);
                    }
                    break;
            }
        } catch (error) {
            console.error(`Failed to process message from ${playerId}: ${message}`, error);
        }
    });

    ws.on('close', () => {
        console.log(`Client ${playerId} disconnected.`);
        players.delete(playerId);
        broadcast({
            type: 'player_left',
            payload: { playerId: playerId }
        }, null); // Broadcast to all
    });

    ws.on('error', (error) => {
        console.error(`Error for client ${playerId}: `, error);
        // Connection might be closed already or will be soon after an error
    });
});

function broadcast(message, excludePlayerId) {
    players.forEach((player, playerId) => {
        if (playerId !== excludePlayerId && player.ws.readyState === WebSocket.OPEN) {
            player.ws.send(JSON.stringify(message));
        }
    });
}

function gameLoop() {
    const now = Date.now();

    // Spawn enemies
    if (now - lastEnemySpawnTime > enemySpawnInterval) {
        const enemyId = "enemy" + nextEnemyId++;
        const enemyType = "default_cube"; // Matches client's placeholder
        const newEnemy = {
            enemyId: enemyId,
            type: enemyType,
            position: {
                x: (Math.random() - 0.5) * 8, // Random X
                y: Math.random() * 2,        // Random Y
                z: 30                        // Start far away
            },
            // Server could also assign velocity if enemies have different movement patterns
            // velocity: { x: 0, y: 0, z: -enemySpeed } // (enemySpeed would need to be defined)
        };
        enemies.set(enemyId, newEnemy);
        
        broadcast({
            type: 'enemy_spawn',
            payload: newEnemy
        }, null); // Broadcast to all players

        lastEnemySpawnTime = now;
        // console.log(`Spawned enemy ${enemyId}`);
    }

    // Basic enemy movement (server authoritative for position) - OPTIONAL for this step, client handles movement for now
    // If server were to manage enemy positions:
    // enemies.forEach((enemy, enemyId) => {
    //    enemy.position.z -= 0.05; // Example movement
    //    if (enemy.position.z < -10) {
    //        enemies.delete(enemyId);
    //        broadcast({ type: 'enemy_destroyed', payload: { enemyId: enemyId, destroyedByPlayerId: null } }, null);
    //    } else {
    //        // Periodically send enemy_update if positions are server-managed
    //        // broadcast({ type: 'enemy_update', payload: { enemyId: enemyId, position: enemy.position }}, null);
    //    }
    // });


    // For now, enemy movement is client-side after spawn. Server just spawns.
    // Later, server might handle enemy state more authoritatively.

    setTimeout(gameLoop, 50); // Adjust game loop interval as needed (e.g. 50ms = 20 FPS for server updates)
}

gameLoop(); // Start the server-side game loop

console.log('Server.js script fully parsed and wss event handlers set up.');
