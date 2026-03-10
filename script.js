// --- GAME CONSTANTS ---
const GAME_HOUR_MS = 50000; // 50s per hour (5 min total)
const MAX_ENERGY = 100;

// --- STATE VARIABLES ---
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
let currentCam = '1';

// Intervals
let gameTick = null;
let energyTick = null;
let aiTick = null;

// Animatronics Config
const animatronics = {
    // Níveis de IA para [Noite 1, 2, 3, 4, 5, Custom(6)]
    "Coelho": { name: "O Coelho", emoji: '🐰', pos: '1', ai: [0, 1, 3, 6, 12, 18], route: ['1', '8', '6', '4a', '4b', 'office'] },
    "Ave": { name: "A Ave", emoji: '🐥', pos: '1', ai: [0, 1, 2, 5, 10, 15], route: ['1', '8', '7', '2', '5a', '5b', 'office'] },
    "Corredor": { name: "O Corredor", emoji: '🦊', pos: '3', ai: [0, 0, 1, 3, 6, 10], state: 0 },
    "Observador": { name: "O Observador", emoji: '🐻', pos: '1', ai: [0, 0, 0, 2, 5, 10], route: ['1', '8', '7', '2', '5a', '5b', 'office'] },
    "Erro": { name: "O Erro", emoji: '🟨', pos: 'hidden', ai: [0, 0, 0, 0, 1, 3] }
};

let attackInNextTick = { Coelho: false, Ave: false, Observador: false };

// --- DOM ELEMENTS ---
const screens = {
    menu: document.getElementById('main-menu'),
    office: document.getElementById('office'),
    cams: document.getElementById('camera-system'),
    jumpscare: document.getElementById('jumpscare'),
    gameover: document.getElementById('game-over'),
    win: document.getElementById('win-screen')
};

const hud = {
    time: document.getElementById('time'),
    night: document.getElementById('nightdisplay'),
    energy: document.getElementById('energy-val'),
    usage: document.getElementById('usage-bars')
};

// --- SOUNDS ---
const sounds = {
    door: new Audio('https://www.soundjay.com/nature/sounds/iron-gate-close-1.mp3'),
    light: new Audio('https://www.soundjay.com/buttons/sounds/button-20.mp3'),
    monitor: new Audio('https://www.soundjay.com/buttons/sounds/button-29.mp3'),
    jumpscare: new Audio('https://www.soundjay.com/creatures/sounds/zombie-growl-3.mp3'),
    powerout: new Audio('https://www.soundjay.com/mechanical/sounds/power-off-1.mp3')
};

function playSound(s) {
    if (sounds[s]) {
        sounds[s].currentTime = 0;
        sounds[s].play().catch(() => { });
    }
}

// --- INIT ---
function init() {
    loadProgress();

    document.getElementById('btn-new-game').onclick = () => { localStorage.removeItem('nightfall_night'); startGame(1); };
    document.getElementById('btn-continue').onclick = () => startGame(currentNight);
    document.getElementById('btn-next-night').onclick = () => {
        // Pega a noite salva e inicia a próxima
        let saved = parseInt(localStorage.getItem('nightfall_night')) || 1;
        startGame(saved);
    };

    const retryBtn = document.getElementById('btn-retry');
    if (retryBtn) retryBtn.onclick = () => window.location.reload();

    document.getElementById('btn-door-left').onclick = (e) => toggleDoor('left');
    document.getElementById('btn-light-left').onclick = (e) => toggleLight('left');
    document.getElementById('btn-door-right').onclick = (e) => toggleDoor('right');
    document.getElementById('btn-light-right').onclick = (e) => toggleLight('right');

    let monitorCooldown = false;
    const monitorToggle = document.getElementById('monitor-toggle');
    if (monitorToggle) {
        monitorToggle.onmouseenter = () => {
            if (!monitorCooldown) {
                toggleMonitor();
                monitorCooldown = true;
                setTimeout(() => monitorCooldown = false, 500);
            }
        };
    }

    document.getElementById('office').onmousemove = (e) => {
        if (isMonitorOpen) return;
        const panner = document.getElementById('office-panner');
        const rect = screens.office.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const percent = mouseX / 1024;
        panner.style.left = -(1600 - 1024) * percent + 'px';
    };

    document.querySelectorAll('.cam-btn').forEach(btn => {
        btn.onclick = () => switchCamera(btn.dataset.cam);
    });

    showScreen('menu');
}

function startGame(night) {
    currentNight = night;
    resetState();
    showScreen('office');
    gameTick = setInterval(updateTime, GAME_HOUR_MS);
    energyTick = setInterval(updateEnergy, 1000);
    aiTick = setInterval(updateAI, 5000);
}

function resetState() {
    if (gameTick) clearInterval(gameTick);
    if (energyTick) clearInterval(energyTick);
    if (aiTick) clearInterval(aiTick);

    timeHour = 0;
    energy = MAX_ENERGY;
    powerOut = false;
    isMonitorOpen = false;
    isLeftDoorClosed = false;
    isRightDoorClosed = false;
    isLeftLightOn = false;
    isRightLightOn = false;
    currentCam = '1';

    attackInNextTick = { Coelho: false, Ave: false, Observador: false };

    hud.time.innerText = '12:00 AM';
    hud.energy.innerText = '100';
    hud.night.innerText = `Noite ${currentNight}`;

    document.getElementById('door-left').classList.remove('closed');
    document.getElementById('door-right').classList.remove('closed');
    document.getElementById('btn-door-left').classList.remove('active');
    document.getElementById('btn-door-right').classList.remove('active');
    document.getElementById('btn-light-left').classList.remove('active');
    document.getElementById('btn-light-right').classList.remove('active');
    document.getElementById('hallway-left').classList.remove('lit');
    document.getElementById('hallway-right').classList.remove('lit');
    document.body.classList.remove('power-out');
    document.getElementById('office-panner').style.left = '-288px';

    animatronics.Coelho.pos = '1';
    animatronics.Ave.pos = '1';
    animatronics.Corredor.pos = '3';
    animatronics.Corredor.state = 0;
    animatronics.Observador.pos = '1';
    animatronics.Erro.pos = 'hidden';

    updateUsage();
}

function showScreen(id) {
    Object.values(screens).forEach(s => s.classList.remove('active'));
    screens[id].classList.add('active');

    // HUD e Botão do Monitor só aparecem durante a gameplay (escritório ou câmeras)
    const isGameplay = (id === 'office' || id === 'cams');
    document.getElementById('hud').style.display = isGameplay ? 'block' : 'none';
    document.getElementById('monitor-toggle').style.display = isGameplay ? 'flex' : 'none';
}

function updateTime() {
    timeHour++;
    if (timeHour === 6) winGame();
    else hud.time.innerText = `0${timeHour}:00 AM`;
}

function updateEnergy() {
    if (powerOut) return;
    let d = usage;
    if (currentNight >= 4) d += 0.5;
    energy -= (d * 0.1);
    if (energy <= 0) { energy = 0; triggerPowerOut(); }
    hud.energy.innerText = Math.ceil(energy);
}

function updateUsage() {
    usage = 1;
    if (isLeftDoorClosed) usage++;
    if (isRightDoorClosed) usage++;
    if (isLeftLightOn) usage++;
    if (isRightLightOn) usage++;
    if (isMonitorOpen) usage++;
    let b = '|';
    for (let i = 1; i < usage; i++) b += '|';
    hud.usage.innerText = b;
}

function toggleDoor(side) {
    if (powerOut) return;
    playSound('door');
    if (side === 'left') {
        isLeftDoorClosed = !isLeftDoorClosed;
        document.getElementById('door-left').classList.toggle('closed', isLeftDoorClosed);
        document.getElementById('btn-door-left').classList.toggle('active', isLeftDoorClosed);
    } else {
        isRightDoorClosed = !isRightDoorClosed;
        document.getElementById('door-right').classList.toggle('closed', isRightDoorClosed);
        document.getElementById('btn-door-right').classList.toggle('active', isRightDoorClosed);
    }
    updateUsage();
}

function toggleLight(side) {
    if (powerOut) return;
    playSound('light');
    if (side === 'left') {
        isLeftLightOn = !isLeftLightOn;
        document.getElementById('hallway-left').classList.toggle('lit', isLeftLightOn);
        document.getElementById('btn-light-left').classList.toggle('active', isLeftLightOn);
    } else {
        isRightLightOn = !isRightLightOn;
        document.getElementById('hallway-right').classList.toggle('lit', isRightLightOn);
        document.getElementById('btn-light-right').classList.toggle('active', isRightLightOn);
    }
    renderDoorVisual(side);
    updateUsage();
}

function toggleMonitor() {
    if (powerOut) return;
    playSound('monitor');
    isMonitorOpen = !isMonitorOpen;
    if (isMonitorOpen) {
        screens.cams.classList.add('active');
        switchCamera(currentCam);
    } else {
        screens.cams.classList.remove('active');
        if (animatronics.Erro.pos === currentCam) triggerJumpscare('Erro');
    }
    updateUsage();
}

function switchCamera(id) {
    currentCam = id;
    document.querySelectorAll('.cam-btn').forEach(b => b.classList.toggle('active', b.dataset.cam === id));
    const s = document.getElementById('static-overlay');
    s.classList.add('heavy');
    setTimeout(() => s.classList.remove('heavy'), 150);
    const names = {
        '1': 'PALCO',
        '2': 'COZINHA',
        '3': 'COVA',
        '4a': 'CORREDOR ESQ',
        '4b': 'CANTO ESQ',
        '5a': 'CORREDOR DIR',
        '5b': 'CANTO DIR',
        '6': 'ÁREA DE SERVIÇO',
        '7': 'BANHEIROS',
        '8': 'SALÃO DE FESTAS'
    };
    document.getElementById('cam-name').innerText = `CAM ${id.toUpperCase()} - ${names[id] || '???'}`;
    renderCamView(id);
}

function updateAI() {
    if (powerOut) return;
    moveAnim('Coelho');
    moveAnim('Ave');
    moveFoxy();
    moveFreddy();
    if (isMonitorOpen) renderCamView(currentCam);
    renderDoorVisual('left');
    renderDoorVisual('right');
    checkAttacks();
}

function moveAnim(key) {
    let a = animatronics[key];
    let lvl = a.ai[currentNight];
    if (lvl === 0) return;
    if (Math.random() * 20 < lvl) {
        let idx = a.route.indexOf(a.pos);
        if (idx < a.route.length - 1) a.pos = a.route[idx + 1];
    }
}

function moveFoxy() {
    let a = animatronics.Corredor;
    let lvl = a.ai[currentNight];
    if (lvl === 0 || (isMonitorOpen && currentCam === '3')) return;
    if (Math.random() * 20 < lvl) {
        if (a.state < 3) a.state++;
        else {
            a.pos = 'office';
            setTimeout(() => {
                if (isLeftDoorClosed) { a.pos = '3'; a.state = 0; energy -= 8; }
                else triggerJumpscare('Corredor');
            }, 3000);
        }
    }
}

function moveFreddy() {
    let a = animatronics.Observador;
    let lvl = a.ai[currentNight];
    if (lvl === 0 || isMonitorOpen) return;
    if (Math.random() * 20 < lvl) {
        let idx = a.route.indexOf(a.pos);
        if (idx < a.route.length - 1) a.pos = a.route[idx + 1];
    }
}

function checkAttacks() {
    const retreat = (key) => {
        let route = animatronics[key].route;
        // Volta para qualquer lugar da rota (exceto o escritório e as salas de ataque imediato)
        let safeRooms = route.filter(r => r !== 'office' && r !== '4b' && r !== '5b');
        animatronics[key].pos = safeRooms[Math.floor(Math.random() * safeRooms.length)];
        attackInNextTick[key] = false;
    };

    // Coelho
    if (animatronics.Coelho.pos === 'office') {
        if (isLeftDoorClosed) retreat('Coelho');
        else {
            if (attackInNextTick.Coelho) triggerJumpscare('Coelho');
            else attackInNextTick.Coelho = true;
        }
    } else attackInNextTick.Coelho = false;

    // Ave
    if (animatronics.Ave.pos === 'office') {
        if (isRightDoorClosed) retreat('Ave');
        else {
            if (attackInNextTick.Ave) triggerJumpscare('Ave');
            else attackInNextTick.Ave = true;
        }
    } else attackInNextTick.Ave = false;

    // Freddy
    if (animatronics.Observador.pos === 'office') {
        if (isRightDoorClosed) retreat('Observador');
        else {
            if (attackInNextTick.Observador) triggerJumpscare('Observador');
            else attackInNextTick.Observador = true;
        }
    } else attackInNextTick.Observador = false;
}

function renderCamView(id) {
    const roomBackgrounds = {
        '1': '   .==================.\n  ||                  ||\n  ||    [SHOWTIME]    ||\n  ||                  ||\n  \'====================\'',
        '2': '',
        '3': '      ____________\n     /|          |\\\n    / |  PIRATE  | \\\n   /__|   COVE   |__\\\n  |___|__________|___|',
        '4a': ' |\\        /|\n | \\      / |\n |  \\    /  |\n |   |  |   |\n |   |  |   |',
        '4b': ' |\\         |\n | \\        |\n |  \\       |\n |   \\      |\n |____\\     |',
        '5a': ' |\\        /|\n | \\      / |\n |  \\    /  |\n |   |  |   |\n |   |  |   |',
        '5b': ' |         /|\n |        / |\n |       /  |\n |      /   |\n |     /____|',
        '6': '   ____ \n  [____]\n  [____]\n  [____]\n  [____]',
        '7': '  ___    ___\n |   |  |   |\n |   |  |   |\n |___|  |___|',
        '8': '    _ \n   / \\ \n  |___| \n   | |  \n __|_|__'
    };

    let html = `<pre class="room-bg ascii-art" style="position:absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); opacity:0.6; z-index:1; font-size:45px; line-height:1.0; color:#fff; margin:0; text-align:center;">${roomBackgrounds[id] || ''}</pre>`;

    if (id === '2') {
        html = '<div style="position:absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); font-size:40px; color:#555; text-align:center; width: 100%;">- SEM SINAL VISUAL -<br>🔊 <i>Ruídos de Panelas</i></div>';
    } else if (id === '3') {
        let s = animatronics.Corredor.state;
        let foxy = s === 0 ? '' : (s === 1 ? '<span style="font-size:80px; position:absolute; left: 0; top: 0; transform: translate(-180%, -40%);">🦊</span>' : '<span style="font-size:150px; position:absolute; left: 0; top: 0; transform: translate(-120%, -30%);">🦊</span>');
        html = `<div style="z-index:2; position:absolute; top: 55%; left: 50%; transform: translate(-50%, -50%);">${foxy}</div>` + html;
    } else {
        let anims = '';
        for (let k in animatronics) {
            if (animatronics[k].pos === id && k !== 'Corredor') anims += animatronics[k].emoji;
        }
        // Centraliza os emojis um pouco abaixo do meio para nao bater no nome da camera
        html = `<div style="z-index:2; position:absolute; top: 55%; left: 50%; transform: translate(-50%, -50%); font-size:150px; width:100%; text-align:center;">${anims}</div>` + html;
    }
    document.getElementById('animatronics-view').innerHTML = html;
}

function renderDoorVisual(side) {
    const el = document.getElementById(side === 'left' ? 'hallway-left' : 'hallway-right');
    const isLit = side === 'left' ? isLeftLightOn : isRightLightOn;
    let found = '';
    if (isLit) {
        if (side === 'left' && animatronics.Coelho.pos === '4b') found = animatronics.Coelho.emoji;
        if (side === 'right' && (animatronics.Ave.pos === '5b' || animatronics.Observador.pos === '5b')) {
            found = animatronics.Ave.pos === '5b' ? animatronics.Ave.emoji : animatronics.Observador.emoji;
        }
    }
    el.innerText = found;
}

function triggerPowerOut() {
    powerOut = true;
    playSound('powerout');
    document.body.classList.add('power-out');
    isLeftDoorClosed = isRightDoorClosed = isLeftLightOn = isRightLightOn = false;
    if (isMonitorOpen) toggleMonitor();
    document.getElementById('door-left').classList.remove('closed');
    document.getElementById('door-right').classList.remove('closed');
    document.getElementById('btn-door-left').classList.remove('active');
    document.getElementById('btn-door-right').classList.remove('active');
    document.getElementById('btn-light-left').classList.remove('active');
    document.getElementById('btn-light-right').classList.remove('active');
    document.getElementById('hallway-left').classList.remove('lit');
    document.getElementById('hallway-right').classList.remove('lit');
    updateUsage();
    if (gameTick) clearInterval(gameTick);
    if (aiTick) clearInterval(aiTick);
    setTimeout(() => { if (!screens.menu.classList.contains('active')) triggerJumpscare('Observador'); }, 30000);
}

function triggerJumpscare(key) {
    if (gameTick) clearInterval(gameTick); if (energyTick) clearInterval(energyTick); if (aiTick) clearInterval(aiTick);
    playSound('jumpscare');
    showScreen('jumpscare');
    document.getElementById('jumpscare-img').innerText = animatronics[key].emoji;
    setTimeout(() => { showScreen('gameover'); }, 2000);
}

function winGame() {
    if (gameTick) clearInterval(gameTick); if (energyTick) clearInterval(energyTick); if (aiTick) clearInterval(aiTick);

    // Mini-animação das 6AM
    const timeDisplay = hud.time;
    timeDisplay.innerText = "05:00 AM";

    let flash = true;
    const interval = setInterval(() => {
        timeDisplay.innerText = flash ? "06:00 AM" : "";
        flash = !flash;
    }, 200);

    setTimeout(() => {
        clearInterval(interval);
        timeDisplay.innerText = "06:00 AM";
        timeDisplay.classList.add('win-animation');

        setTimeout(() => {
            timeDisplay.classList.remove('win-animation');
            showScreen('win');
            let nextN = currentNight + 1;
            if (nextN > 5) nextN = 5; // Limite de 5 noites (mais Noite 6 oculta se desejar)
            saveProgress(nextN);
        }, 3000);
    }, 2000);
}

function loadProgress() {
    let s = localStorage.getItem('nightfall_night');
    if (s) { currentNight = parseInt(s); document.getElementById('btn-continue').disabled = false; document.getElementById('save-night').innerText = currentNight; }
}

function saveProgress(n) { localStorage.setItem('nightfall_night', n > 5 ? 5 : n); }

init();
