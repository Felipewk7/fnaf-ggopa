// --- GAME STATE ---
const GAME_HOUR_MS = 90000; // 1 hour = 90s (from GDO)
const MAX_ENERGY = 100;

let currentNight = 1;
let timeHour = 0;
let energy = MAX_ENERGY;
let usage = 1;

let isMonitorOpen = false;
let isLeftDoorClosed = false;
let isRightDoorClosed = false;
let isLeftLightOn = false;
let isRightLightOn = false;

let powerOut = false;
let gameLoopInterval = null;
let aiLoopInterval = null;
let energyLoopInterval = null;

let currentCam = '1';

// --- ANIMATRONICS ---
/*
    Locations:
    1: Palco (Stage)
    2: Cozinha (Kitchen)
    3: Cova (Pirate Cove)
    4a: Corredor Esquerdo (Left Hall)
    4b: Esquerdo Perto (Left Door)
    5a: Corredor Direito (Right Hall)
    5b: Direito Perto (Right Door)
    office: Atacando (Attacking)
*/
const animatronics = {
    "Coelho": { emoji: '🐰', pos: '1', aiInfo: [0, 2, 4, 6, 8, 12], route: ['1', '4a', '4b', 'office'] },
    "Ave": { emoji: '🐥', pos: '1', aiInfo: [0, 1, 3, 5, 7, 10], route: ['1', '2', '5a', '5b', 'office'] },
    "Corredor": { emoji: '🦊', pos: '3', aiInfo: [0, 0, 1, 3, 5, 8], state: 0, statesMax: 3 }, // 0: hidden, 1: peeking, 2: ready, 3: running
    "Observador": { emoji: '🐻', pos: '1', aiInfo: [0, 0, 0, 1, 3, 6], route: ['1', '2', '5a', '5b', 'office'] },
    "Erro": { emoji: '🟨', pos: 'hidden', aiInfo: [0, 0, 0, 0, 1, 2] } // Golden
};

// --- DOM ELEMENTS ---
const elMainMenu = document.getElementById('main-menu');
const elOffice = document.getElementById('office');
const elCamSystem = document.getElementById('camera-system');
const elGameOver = document.getElementById('game-over');
const elWinScreen = document.getElementById('win-screen');
const elJumpscare = document.getElementById('jumpscare');

const elTime = document.getElementById('time');
const elNightDisplay = document.getElementById('nightdisplay');
const elEnergyVal = document.getElementById('energy-val');
const elUsageBars = document.getElementById('usage-bars');

const elLeftDoor = document.getElementById('door-left');
const elRightDoor = document.getElementById('door-right');
const elHallwayLeft = document.getElementById('hallway-left');
const elHallwayRight = document.getElementById('hallway-right');

const elBtnDoorLeft = document.getElementById('btn-door-left');
const elBtnLightLeft = document.getElementById('btn-light-left');
const elBtnDoorRight = document.getElementById('btn-door-right');
const elBtnLightRight = document.getElementById('btn-light-right');

const elStatic = document.getElementById('static-overlay');
const elCamName = document.getElementById('cam-name');
const elAnimatronicsView = document.getElementById('animatronics-view');

const sfxHover = new Audio('data:audio/mp3;base64,'); // placeholder
// To keep it simple, we won't require actual audio files, but mechanics will work

// --- INIT ---
function init() {
    loadProgress();
    document.getElementById('btn-new-game').addEventListener('click', () => startGame(1));
    document.getElementById('btn-continue').addEventListener('click', () => startGame(currentNight));
    document.getElementById('btn-next-night').addEventListener('click', () => {
        elWinScreen.classList.remove('active');
        startGame(currentNight);
    });

    document.getElementById('monitor-toggle').addEventListener('mouseenter', toggleMonitor);
    document.getElementById('monitor-toggle-down').addEventListener('mouseenter', toggleMonitor);

    elBtnDoorLeft.addEventListener('click', () => toggleDoor('left'));
    elBtnLightLeft.addEventListener('click', () => toggleLight('left'));
    elBtnDoorRight.addEventListener('click', () => toggleDoor('right'));
    elBtnLightRight.addEventListener('click', () => toggleLight('right'));

    document.querySelectorAll('.cam-btn').forEach(btn => {
        btn.addEventListener('click', (e) => switchCamera(e.target.dataset.cam));
    });

    // Ensure clean start
    elOffice.classList.remove('active');
    elWinScreen.classList.remove('active');
    elGameOver.classList.remove('active');
    elMainMenu.classList.add('active');
}

function loadProgress() {
    const saved = localStorage.getItem('project_nightfall_save');
    if (saved) {
        currentNight = parseInt(saved);
        document.getElementById('btn-continue').disabled = false;
        document.getElementById('save-night').innerText = currentNight;
    }
}

function saveProgress(night) {
    if (night > 5) night = 5;
    localStorage.setItem('project_nightfall_save', night);
    currentNight = night;
    document.getElementById('btn-continue').disabled = false;
    document.getElementById('save-night').innerText = currentNight;
}

// --- GAMEPLAY ---
function startGame(night) {
    currentNight = night;
    resetState();

    elMainMenu.classList.remove('active');
    elOffice.classList.add('active');

    elNightDisplay.innerText = `Noite ${currentNight}`;

    gameLoopInterval = setInterval(updateTime, GAME_HOUR_MS);
    energyLoopInterval = setInterval(updateEnergy, 1000); // 1 tick per sec
    aiLoopInterval = setInterval(updateAI, 5000); // AI tick every 5s
}

function resetState() {
    // Clear any existing intervals
    if (gameLoopInterval) clearInterval(gameLoopInterval);
    if (aiLoopInterval) clearInterval(aiLoopInterval);
    if (energyLoopInterval) clearInterval(energyLoopInterval);

    timeHour = 0;
    energy = MAX_ENERGY;
    powerOut = false;
    isMonitorOpen = false;
    currentCam = '1';

    elTime.innerText = '12:00 AM';
    elEnergyVal.innerText = energy;

    isLeftDoorClosed = false;
    isRightDoorClosed = false;
    isLeftLightOn = false;
    isRightLightOn = false;

    // Cleanup DOM classes
    elOffice.classList.remove('active');
    elCamSystem.classList.remove('active');
    elGameOver.classList.remove('active');
    elWinScreen.classList.remove('active');
    elJumpscare.classList.remove('active');

    elLeftDoor.classList.remove('closed');
    elRightDoor.classList.remove('closed');
    elHallwayLeft.classList.remove('lit');
    elHallwayRight.classList.remove('lit');

    elBtnDoorLeft.classList.remove('active');
    elBtnDoorRight.classList.remove('active');
    elBtnLightLeft.classList.remove('active');
    elBtnLightRight.classList.remove('active');

    document.body.classList.remove('power-out');

    // Reset AI
    animatronics['Coelho'].pos = '1';
    animatronics['Ave'].pos = '1';
    animatronics['Corredor'].pos = '3';
    animatronics['Corredor'].state = 0;
    animatronics['Observador'].pos = '1';
    animatronics['Erro'].pos = 'hidden';

    clearHallways();
    updateUsage();
}

function updateTime() {
    timeHour++;
    if (timeHour === 6) {
        winGame();
    } else {
        elTime.innerText = `0${timeHour}:00 AM`;
    }
}

function updateEnergy() {
    if (powerOut) return;

    let drainRate = usage; // 1 to 5
    if (currentNight >= 4) drainRate += 0.5; // harder drain

    energy -= (drainRate * 0.1);
    if (energy <= 0) {
        energy = 0;
        triggerPowerOut();
    }
    elEnergyVal.innerText = Math.ceil(energy);
}

function updateUsage() {
    usage = 1;
    if (isLeftDoorClosed) usage++;
    if (isRightDoorClosed) usage++;
    if (isLeftLightOn) usage++;
    if (isRightLightOn) usage++;
    if (isMonitorOpen) usage++;

    let bars = '|';
    for (let i = 1; i < usage; i++) bars += '|';
    elUsageBars.innerText = bars;
}

// --- CONTROLS ---
function toggleDoor(side) {
    if (powerOut) return;
    if (side === 'left') {
        isLeftDoorClosed = !isLeftDoorClosed;
        elLeftDoor.classList.toggle('closed', isLeftDoorClosed);
        elBtnDoorLeft.classList.toggle('active', isLeftDoorClosed);
    } else {
        isRightDoorClosed = !isRightDoorClosed;
        elRightDoor.classList.toggle('closed', isRightDoorClosed);
        elBtnDoorRight.classList.toggle('active', isRightDoorClosed);
    }
    updateUsage();
}

function toggleLight(side) {
    if (powerOut) return;
    if (side === 'left') {
        isLeftLightOn = !isLeftLightOn;
        elHallwayLeft.classList.toggle('lit', isLeftLightOn);
        elBtnLightLeft.classList.toggle('active', isLeftLightOn);
        if (isLeftLightOn) checkDoorAnimatronic('left');
    } else {
        isRightLightOn = !isRightLightOn;
        elHallwayRight.classList.toggle('lit', isRightLightOn);
        elBtnLightRight.classList.toggle('active', isRightLightOn);
        if (isRightLightOn) checkDoorAnimatronic('right');
    }
    updateUsage();
}

function toggleMonitor() {
    if (powerOut) return;
    isMonitorOpen = !isMonitorOpen;

    if (isMonitorOpen) {
        elCamSystem.classList.add('active');
        renderCamera(currentCam);
    } else {
        elCamSystem.classList.remove('active');

        // Random chance for "O Erro" to crash the game if he was on the monitor
        if (animatronics['Erro'].pos === currentCam) {
            triggerJumpscare('Erro');
        }
    }
    updateUsage();
}

function switchCamera(camId) {
    if (!isMonitorOpen || powerOut) return;

    // static effect
    elStatic.classList.add('heavy');
    setTimeout(() => elStatic.classList.remove('heavy'), 200);

    document.querySelectorAll('.cam-btn').forEach(b => b.classList.remove('active'));
    document.querySelector(`.cam-btn[data-cam="${camId}"]`).classList.add('active');

    currentCam = camId;

    let names = {
        '1': 'Palco Principal', '2': 'Cozinha (Apenas áudio)', '3': 'Cova do Pirata',
        '4a': 'Corredor Esquerdo', '4b': 'Canto Esquerdo', '5a': 'Corredor Direito', '5b': 'Canto Direito'
    };
    elCamName.innerText = `CAM ${camId.toUpperCase()} - ${names[camId]}`;

    renderCamera(camId);
}

// --- AI LOGIC ---
function updateAI() {
    if (powerOut) {
        // Observador (Freddy) will attack if power out
        let aiLvl = animatronics['Observador'].aiInfo[currentNight];
        let rand = Math.floor(Math.random() * 20) + 1;
        if (rand <= (aiLvl > 0 ? aiLvl : 5)) {
            triggerJumpscare('Observador');
        }
        return;
    }

    // Move logic for everyone
    moveStandardAI('Coelho');
    moveStandardAI('Ave');
    moveFoxy();
    moveFreddy();
    moveGolden();

    if (isMonitorOpen) renderCamera(currentCam);

    // Resolve Attacks
    checkAttacks();
}

function moveStandardAI(name) {
    let anim = animatronics[name];
    let aiLvl = anim.aiInfo[currentNight];
    if (aiLvl === 0) return;

    let rand = Math.floor(Math.random() * 20) + 1;
    if (rand <= aiLvl) {
        // Move forward
        let currIdx = anim.route.indexOf(anim.pos);
        if (currIdx < anim.route.length - 1) {
            // Check if they are at the door and trying to enter
            if (anim.route[currIdx] === '4b' || anim.route[currIdx] === '5b') {
                anim.pos = 'office'; // Try to enter next checkAttacks tick
            } else {
                anim.pos = anim.route[currIdx + 1];
            }
        } else if (anim.pos === 'office') {
            // Already in office
        } else {
            // reset
            anim.pos = '1';
        }
    }
}

function moveFoxy() {
    let anim = animatronics['Corredor'];
    let aiLvl = anim.aiInfo[currentNight];
    if (aiLvl === 0) return;

    if (isMonitorOpen && currentCam === '3') return; // Camera stall

    let rand = Math.floor(Math.random() * 20) + 1;
    if (rand <= aiLvl) {
        if (anim.state < 3) {
            anim.state++;
        } else if (anim.state === 3) {
            anim.pos = '4a'; // running down left hall
            setTimeout(() => {
                if (isLeftDoorClosed) {
                    // blocked
                    anim.state = 0;
                    anim.pos = '3';
                    energy -= 5; // knock drain
                    if (energy < 0) energy = 0;
                } else {
                    anim.pos = 'office';
                }
            }, 3000); // 3 seconds to close door
        }
    }
}

function moveFreddy() {
    let anim = animatronics['Observador'];
    let aiLvl = anim.aiInfo[currentNight];
    if (aiLvl === 0) return;

    if (isMonitorOpen) return; // Stalled by monitor being up at all (simplified mechanic)

    let rand = Math.floor(Math.random() * 20) + 1;
    if (rand <= aiLvl) {
        let currIdx = anim.route.indexOf(anim.pos);
        if (currIdx < anim.route.length - 1) {
            anim.pos = anim.route[currIdx + 1];
        } else {
            anim.pos = 'office';
        }
    }
}

function moveGolden() {
    let anim = animatronics['Erro'];
    let aiLvl = anim.aiInfo[currentNight];
    if (aiLvl === 0) return;

    if (isMonitorOpen) {
        let rand = Math.floor(Math.random() * 100);
        if (rand < aiLvl && currentCam === '2') { // appears randomly on cam 2
            anim.pos = '2';
        } else {
            anim.pos = 'hidden';
        }
    }
}

function checkAttacks() {
    // Coelho (Left)
    if (animatronics['Coelho'].pos === 'office') {
        if (!isMonitorOpen) {
            if (isLeftDoorClosed) {
                animatronics['Coelho'].pos = '1'; // reset
            } else {
                triggerJumpscare('Coelho');
            }
        }
    }

    // Ave (Right)
    if (animatronics['Ave'].pos === 'office') {
        if (!isMonitorOpen) {
            if (isRightDoorClosed) {
                animatronics['Ave'].pos = '1';
            } else {
                triggerJumpscare('Ave');
            }
        }
    }

    // Foxy check done in timeout
    if (animatronics['Corredor'].pos === 'office') {
        triggerJumpscare('Corredor');
    }

    // Freddy
    if (animatronics['Observador'].pos === 'office' && !isMonitorOpen && !isRightDoorClosed) {
        triggerJumpscare('Observador');
    }

    // Update Hallway views if light is on
    if (isLeftLightOn) checkDoorAnimatronic('left');
    else elHallwayLeft.innerText = '';

    if (isRightLightOn) checkDoorAnimatronic('right');
    else elHallwayRight.innerText = '';
}

function checkDoorAnimatronic(side) {
    if (side === 'left') {
        if (animatronics['Coelho'].pos === '4b') elHallwayLeft.innerText = animatronics['Coelho'].emoji;
        else elHallwayLeft.innerText = '';
    } else {
        if (animatronics['Ave'].pos === '5b') elHallwayRight.innerText = animatronics['Ave'].emoji;
        else elHallwayRight.innerText = '';
    }
}

// --- RENDERING ---
function renderCamera(camId) {
    if (camId === '2') {
        // Kitchen - Dark, audio only usually, but let's just make it static
        elAnimatronicsView.innerHTML = '<span style="font-size: 20px; color: #fff;">- SINAL DE VÍDEO PERDIDO -<br>Apenas Áudio</span>';

        if (animatronics['Erro'].pos === '2') {
            elAnimatronicsView.innerHTML += `<span class="animatronic-emoji" style="position:absolute">${animatronics['Erro'].emoji}</span>`;
        }
        return;
    }

    let contents = '';

    if (camId === '3') {
        let f = animatronics['Corredor'].state;
        let visual = f === 0 ? '🏕️' : (f === 1 ? '🏕️🦊' : (f === 2 ? '🦊' : ''));
        contents += `<span class="animatronic-emoji">${visual}</span>`;
    }

    for (const [name, data] of Object.entries(animatronics)) {
        if (data.pos === camId && name !== 'Corredor' && name !== 'Erro') {
            // Don't show Freddy easily unless camera is static/flashing, but keep simple for now
            contents += `<span class="animatronic-emoji">${data.emoji}</span>`;
        }
    }

    elAnimatronicsView.innerHTML = contents;
}

function clearHallways() {
    elHallwayLeft.innerText = '';
    elHallwayRight.innerText = '';
}

// --- ENDGAME ---
function triggerPowerOut() {
    powerOut = true;
    document.body.classList.add('power-out');

    if (isMonitorOpen) toggleMonitor();

    isLeftDoorClosed = false;
    isRightDoorClosed = false;
    isLeftLightOn = false;
    isRightLightOn = false;

    elLeftDoor.classList.remove('closed');
    elRightDoor.classList.remove('closed');
    elBtnDoorLeft.classList.remove('active');
    elBtnDoorRight.classList.remove('active');
    elBtnLightLeft.classList.remove('active');
    elBtnLightRight.classList.remove('active');
    elHallwayLeft.classList.remove('lit');
    elHallwayRight.classList.remove('lit');
    clearHallways();
    updateUsage();
}

function triggerJumpscare(animatronicName) {
    clearInterval(gameLoopInterval);
    clearInterval(energyLoopInterval);
    clearInterval(aiLoopInterval);

    elJumpscare.classList.add('active');

    // Quick flashy effect
    let toggle = true;
    let flash = setInterval(() => {
        elJumpscare.style.backgroundColor = toggle ? '#fff' : '#000';
        toggle = !toggle;
    }, 50);

    document.getElementById('jumpscare-img').innerText = animatronics[animatronicName].emoji;

    setTimeout(() => {
        clearInterval(flash);
        elJumpscare.classList.remove('active');
        elOffice.classList.remove('active');
        elGameOver.classList.add('active');
    }, 2000);
}

function winGame() {
    clearInterval(gameLoopInterval);
    clearInterval(energyLoopInterval);
    clearInterval(aiLoopInterval);

    elOffice.classList.remove('active');
    elWinScreen.classList.add('active');

    let toggle = true;
    let flash = setInterval(() => {
        if (elWinScreen.classList.contains('active')) {
            elWinScreen.style.color = toggle ? '#fff' : '#888';
            toggle = !toggle;
        } else {
            clearInterval(flash);
        }
    }, 500);

    saveProgress(currentNight + 1);
}

// Startup
init();
