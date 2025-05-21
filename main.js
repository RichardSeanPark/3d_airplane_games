import * as THREE from 'three';

// Score
let score = 0;
const scoreDisplay = document.getElementById('scoreDisplay');

// Game Over State
let isGameOver = false;
const gameOverDisplay = document.getElementById('gameOverDisplay');

// WebSocket Player State Sync
let lastPlayerStateSendTime = 0;
const playerStateSendInterval = 100; // Send state every 100ms (10 times/sec)

// Scene
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87CEEB); // Sky blue background

// WebSocket connection
const socket = new WebSocket('ws://localhost:8080');
let myPlayerId = null; // To store the ID assigned by the server
const remotePlayers = new Map(); // To store other players' data and meshes

socket.onopen = () => {
    console.log('Connected to WebSocket server.');
    const joinMessage = {
        type: 'player_join',
        payload: {
            playerName: 'Player' + Math.floor(Math.random() * 1000), // Simple unique-ish name
            // Assuming playerAirplane is defined by this point
            // initialState: { 
            //    position: playerAirplane.position.clone(),
            //    rotation: playerAirplane.quaternion.clone() 
            // }
        }
    };
    socket.send(JSON.stringify(joinMessage));
};

socket.onmessage = (event) => {
    const message = JSON.parse(event.data);
    console.log('Message from server:', message);

    switch (message.type) {
        case 'assign_player_id':
            myPlayerId = message.payload.playerId;
            console.log('Assigned player ID:', myPlayerId);
            break;
        case 'player_joined':
            if (message.payload.playerId !== myPlayerId) {
                console.log('Remote player joined:', message.payload.playerId, message.payload.playerName);
                const remotePlayerGeometry = playerGeometry.clone(); // Use the same geometry as local player
                const remotePlayerMaterial = new THREE.MeshStandardMaterial({ color: 0x0000ff }); // Blue
                const remotePlayerMesh = new THREE.Mesh(remotePlayerGeometry, remotePlayerMaterial);
                
                // Use optional chaining for safer access to initialState properties
                remotePlayerMesh.position.copy(message.payload.initialState?.position || {x:0,y:0,z:0});
                remotePlayerMesh.quaternion.copy(message.payload.initialState?.rotation || {x:0,y:0,z:0,w:1});

                scene.add(remotePlayerMesh);
                remotePlayers.set(message.payload.playerId, { 
                    mesh: remotePlayerMesh, 
                    playerName: message.payload.playerName,
                    score: message.payload.score || 0 // Store score from server
                });
            }
            break;
        case 'player_left':
            console.log('Remote player left:', message.payload.playerId);
            if (remotePlayers.has(message.payload.playerId)) {
                const remotePlayer = remotePlayers.get(message.payload.playerId);
                scene.remove(remotePlayer.mesh);
                // Optional: Dispose geometry/material if they are unique per player
                // remotePlayer.mesh.geometry.dispose(); 
                // remotePlayer.mesh.material.dispose();
                remotePlayers.delete(message.payload.playerId);
            }
            break;
        case 'player_updated':
            if (message.payload.playerId !== myPlayerId && remotePlayers.has(message.payload.playerId)) {
                const remotePlayer = remotePlayers.get(message.payload.playerId);
                if (message.payload.position) {
                    remotePlayer.mesh.position.copy(message.payload.position);
                }
                if (message.payload.rotation) {
                    remotePlayer.mesh.quaternion.copy(message.payload.rotation);
                }
            }
            break;
        case 'player_shot':
            if (message.payload.playerId !== myPlayerId && remotePlayers.has(message.payload.playerId)) {
                // console.log('Remote player shot:', message.payload.playerId);
                const bulletMesh = new THREE.Mesh(bulletGeometry.clone(), remoteBulletMaterial.clone());
                bulletMesh.position.copy(message.payload.bulletInitialPosition);
                const velocity = new THREE.Vector3().copy(message.payload.bulletVelocity);
                
                remoteBullets.push({ mesh: bulletMesh, velocity: velocity });
                scene.add(bulletMesh);
            }
            break;
        // This is a new case, ensure it's added correctly within the switch
        case 'enemy_spawn': 
            const enemyMesh = new THREE.Mesh(enemyGeometry.clone(), enemyMaterial.clone());
            enemyMesh.userData = { id: message.payload.enemyId }; // Store server-assigned ID
            enemyMesh.position.copy(message.payload.position);
            // if (message.payload.rotation) enemyMesh.quaternion.copy(message.payload.rotation);
            scene.add(enemyMesh);
            enemies.push(enemyMesh); 
            // console.log(`Spawned enemy ${message.payload.enemyId} from server at Z: ${enemyMesh.position.z}`);
            break;
        case 'player_game_over':
            const defeatedPlayerId = message.payload.playerId;
            console.log(`Player ${defeatedPlayerId} is game over.`);
            if (defeatedPlayerId === myPlayerId) {
                isGameOver = true; // Local client's game is over
                gameOverDisplay.innerText = "You were defeated!";
                gameOverDisplay.style.display = 'block';
                // Optional: make local player visually distinct or remove
                // playerAirplane.visible = false; 
            } else if (remotePlayers.has(defeatedPlayerId)) {
                const remotePlayer = remotePlayers.get(defeatedPlayerId);
                remotePlayer.isDefeated = true;
                // Optional: Change remote player's appearance
                if (remotePlayer.mesh) {
                     remotePlayer.mesh.material.color.setHex(0x808080); // Grey out
                }
            }
            break;
        
        case 'game_over_all': // Example of a global game over
            console.log('Game over for all players:', message.payload.reason);
            isGameOver = true; // Stop local game logic
            gameOverDisplay.innerText = message.payload.reason || "Game Over For All!";
            gameOverDisplay.style.display = 'block';
            // Potentially hide all player models or show a summary screen
            break;
    }
};

socket.onerror = (error) => {
    console.error('WebSocket Error:', error);
};

socket.onclose = () => {
    console.log('Disconnected from WebSocket server.');
    // Optionally, handle reconnection logic or update UI
    if (gameOverDisplay && !isGameOver) { // Avoid overwriting "Game Over"
        gameOverDisplay.innerText = "Disconnected";
        gameOverDisplay.style.display = 'block';
        isGameOver = true; // Stop game logic
    }
};

// Camera
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.z = 5; // Position the camera

// Renderer
const renderer = new THREE.WebGLRenderer();
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

// Lighting
const ambientLight = new THREE.AmbientLight(0xffffff, 0.6); // Soft white light
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 1); // White directional light
directionalLight.position.set(5, 10, 7.5);
scene.add(directionalLight);

// Player Airplane
const playerGeometry = new THREE.ConeGeometry(0.5, 1, 8); // Radius, height, radial segments
playerGeometry.rotateX(Math.PI / 2); // Orient it to point forward
const playerMaterial = new THREE.MeshStandardMaterial({ color: 0xff0000 }); // Red color
const playerAirplane = new THREE.Mesh(playerGeometry, playerMaterial);
playerAirplane.position.y = -2; // Start a bit lower
scene.add(playerAirplane);

// Bullets
const bulletGeometry = new THREE.SphereGeometry(0.1, 8, 8); // Radius, widthSegments, heightSegments
const bulletMaterial = new THREE.MeshStandardMaterial({ color: 0xffff00 }); // Yellow
const bullets = [];
const bulletSpeed = 0.3;
const remoteBulletMaterial = new THREE.MeshStandardMaterial({ color: 0xffa500 }); // Orange for remote
const remoteBullets = [];

// Enemies
const enemyGeometry = new THREE.BoxGeometry(0.8, 0.8, 0.8); // Example: a cube
const enemyMaterial = new THREE.MeshStandardMaterial({ color: 0x00ff00 }); // Green
const enemies = [];
const enemySpeed = 0.05;
let spawnTimer = 0;
const spawnInterval = 120; // Spawn an enemy every 120 frames (approx 2 seconds at 60fps)

// Player movement
const playerSpeed = 0.1;
const playerMove = { left: false, right: false, up: false, down: false };

window.addEventListener('keydown', (event) => {
    if (isGameOver) return; // Ignore input if game is over

    switch(event.code) {
        case 'ArrowLeft': playerMove.left = true; break;
        case 'ArrowRight': playerMove.right = true; break;
        case 'ArrowUp': playerMove.up = true; break;
        case 'ArrowDown': playerMove.down = true; break;
        case 'Space':
            const localBulletId = 'bullet_' + Date.now() + '_' + Math.random();
            const bullet = new THREE.Mesh(bulletGeometry, bulletMaterial);
            bullet.userData = { id: localBulletId, hitConfirmed: false }; // Add ID and hitConfirmed flag
            bullet.position.copy(playerAirplane.position);
            bullet.position.z += 0.6; // Start slightly in front of plane nose
            scene.add(bullet);
            bullets.push(bullet);

            if (socket.readyState === WebSocket.OPEN && myPlayerId) {
                const shootMessage = {
                    type: 'player_shoot',
                    payload: {
                        timestamp: Date.now(),
                        bulletInitialPosition: bullet.position.clone(), 
                        bulletVelocity: new THREE.Vector3(0, 0, bulletSpeed).applyQuaternion(playerAirplane.quaternion) 
                    }
                };
                socket.send(JSON.stringify(shootMessage));
            }
            break;
    }
});

window.addEventListener('keyup', (event) => {
    // Keyup should generally not be gated by isGameOver for movement keys
    // as the movement logic itself within animate() will be gated.
    // This ensures that if a key is released after game over, its state is updated.
    switch(event.code) {
        case 'ArrowLeft': playerMove.left = false; break;
        case 'ArrowRight': playerMove.right = false; break;
        case 'ArrowUp': playerMove.up = false; break;
        case 'ArrowDown': playerMove.down = false; break;
    }
});

// Game Loop
function animate() {
    requestAnimationFrame(animate);

    if (!isGameOver) {
        // Update player airplane position
        if (playerMove.left) playerAirplane.position.x -= playerSpeed;
        if (playerMove.right) playerAirplane.position.x += playerSpeed;
        if (playerMove.up) playerAirplane.position.y += playerSpeed;
        if (playerMove.down) playerAirplane.position.y -= playerSpeed;

        // Boundary checks for player airplane
        playerAirplane.position.x = Math.max(-4, Math.min(4, playerAirplane.position.x));
        playerAirplane.position.y = Math.max(-3, Math.min(3, playerAirplane.position.y));

        // Update bullets
        for (let i = bullets.length - 1; i >= 0; i--) {
            const bullet = bullets[i];
            bullet.position.z += bulletSpeed; 

            if (bullet.position.z > 50) {
                scene.remove(bullet);
                bullets.splice(i, 1);
            }
        }

        // Spawn enemies
        spawnTimer++;
        if (spawnTimer > spawnInterval) {
            spawnTimer = 0;
            const enemy = new THREE.Mesh(enemyGeometry, enemyMaterial);
            enemy.position.x = (Math.random() - 0.5) * 8; 
            enemy.position.y = Math.random() * 2; 
            enemy.position.z = 30; 
            scene.add(enemy);
            enemies.push(enemy);
        }

        // Update enemies
        for (let i = enemies.length - 1; i >= 0; i--) {
            const enemy = enemies[i];
            enemy.position.z -= enemySpeed; 

            if (enemy.position.z < -5) { 
                scene.remove(enemy);
                enemies.splice(i, 1);
            }
        }

        // Collision detection: bullets vs enemies
        for (let i = bullets.length - 1; i >= 0; i--) {
            const bullet = bullets[i];
            // Skip if bullet already hit something and is pending server confirmation
            if (bullet.userData.hitConfirmed) continue; 

            const bulletBoundingBox = new THREE.Box3().setFromObject(bullet);

            for (let j = enemies.length - 1; j >= 0; j--) {
                const enemy = enemies[j];
                if (!enemy.userData || !enemy.userData.id) continue; // Skip if enemy has no ID yet or is already marked

                const enemyBoundingBox = new THREE.Box3().setFromObject(enemy);

                if (bulletBoundingBox.intersectsBox(enemyBoundingBox)) {
                    if (socket.readyState === WebSocket.OPEN && myPlayerId) {
                        const hitMessage = {
                            type: 'enemy_hit_by_player',
                            payload: {
                                enemyId: enemy.userData.id,
                                bulletId: bullet.userData.id, 
                                playerId: myPlayerId 
                            }
                        };
                        socket.send(JSON.stringify(hitMessage));
                        
                        // Locally remove bullet immediately. Server will confirm enemy destruction.
                        scene.remove(bullet);
                        if(bullet.geometry) bullet.geometry.dispose();
                        if(bullet.material) bullet.material.dispose();
                        bullets.splice(i, 1); 
                        
                        console.log(`Sent enemy_hit_by_player for enemy ${enemy.userData.id}`);
                    }
                    break; // Bullet is consumed
                }
            }
        }

        // Collision detection: enemies vs player
        if (!isGameOver) { // Check only if local game is not already over for this client
            const playerBoundingBox = new THREE.Box3().setFromObject(playerAirplane);
            for (let i = enemies.length - 1; i >= 0; i--) {
                const enemy = enemies[i];
                if (!enemy.userData || !enemy.userData.id) continue; // Skip if enemy has no ID

                const enemyBoundingBox = new THREE.Box3().setFromObject(enemy);

                if (playerBoundingBox.intersectsBox(enemyBoundingBox)) {
                    if (socket.readyState === WebSocket.OPEN && myPlayerId) {
                        console.log(`Local player hit by enemy ${enemy.userData.id}`);
                        const hitMessage = {
                            type: 'player_hit_by_enemy',
                            payload: {
                                enemyId: enemy.userData.id,
                                playerId: myPlayerId 
                            }
                        };
                        socket.send(JSON.stringify(hitMessage));

                        // Remove enemy locally to prevent sending multiple hit events for same enemy
                        scene.remove(enemy);
                        if(enemy.geometry) enemy.geometry.dispose();
                        if(enemy.material) enemy.material.dispose();
                        enemies.splice(i, 1); 
                    }
                    break; // Player can only collide with one enemy per frame check
                }
            }
        }

        // Send player state update
        const now = Date.now();
        if (socket.readyState === WebSocket.OPEN && myPlayerId && (now - lastPlayerStateSendTime > playerStateSendInterval)) {
            const updateMessage = {
                type: 'player_update',
                payload: {
                    timestamp: now,
                    position: playerAirplane.position.clone(),
                    rotation: playerAirplane.quaternion.clone()
                }
            };
            socket.send(JSON.stringify(updateMessage));
            lastPlayerStateSendTime = now;
        }

        // Update remote bullets
        for (let i = remoteBullets.length - 1; i >= 0; i--) {
            const rBullet = remoteBullets[i];
            rBullet.mesh.position.add(rBullet.velocity); // Apply velocity directly

            // Remove remote bullet if it goes off screen (adjust threshold as needed)
            // This threshold should be consistent with local bullets
            if (rBullet.mesh.position.z > 50 || rBullet.mesh.position.z < -10 || Math.abs(rBullet.mesh.position.x) > 10 || Math.abs(rBullet.mesh.position.y) > 10) {
                scene.remove(rBullet.mesh);
                if (rBullet.mesh.geometry) rBullet.mesh.geometry.dispose(); // If cloned geometry
                if (rBullet.mesh.material) rBullet.mesh.material.dispose(); // If cloned material
                remoteBullets.splice(i, 1);
            }
        }
    }
    
    renderer.render(scene, camera);
}

animate();

// Handle window resize
window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}, false);
