import * as THREE from 'three';

// Score
let score = 0;
const scoreDisplay = document.getElementById('scoreDisplay');

// Game Over State
let isGameOver = false;
const gameOverDisplay = document.getElementById('gameOverDisplay');

// Scene
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87CEEB); // Sky blue background

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
            const bullet = new THREE.Mesh(bulletGeometry, bulletMaterial);
            bullet.position.copy(playerAirplane.position);
            bullet.position.z += 0.6; // Start slightly in front of plane nose
            scene.add(bullet);
            bullets.push(bullet);
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
            if (!bullets[i]) continue; // Bullet might have been removed in a previous enemy collision
            const bullet = bullets[i];
            const bulletBoundingBox = new THREE.Box3().setFromObject(bullet);

            for (let j = enemies.length - 1; j >= 0; j--) {
                if (!enemies[j]) continue; // Enemy might have been removed
                const enemy = enemies[j];
                const enemyBoundingBox = new THREE.Box3().setFromObject(enemy);

                if (bulletBoundingBox.intersectsBox(enemyBoundingBox)) {
                    scene.remove(bullet);
                    bullets.splice(i, 1);
                    scene.remove(enemy);
                    enemies.splice(j, 1);
                    score += 10; 
                    scoreDisplay.innerText = "Score: " + score; 
                    break; 
                }
            }
        }

        // Collision detection: enemies vs player
        const playerBoundingBox = new THREE.Box3().setFromObject(playerAirplane);
        for (let i = enemies.length - 1; i >= 0; i--) {
            const enemy = enemies[i];
            const enemyBoundingBox = new THREE.Box3().setFromObject(enemy);

            if (playerBoundingBox.intersectsBox(enemyBoundingBox)) {
                console.log("Game Over - Player hit!");
                isGameOver = true;
                if(gameOverDisplay) gameOverDisplay.style.display = 'block';
                // scene.remove(playerAirplane); // Optional: remove player
                break; 
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
