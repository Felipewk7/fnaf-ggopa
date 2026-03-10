// --- GAME CONSTANTS ---
const GAME_HOUR_MS = 10000; // 50s per hour (5 min total)
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
    "Erro": { name: "O Erro", emoji: '🦞', pos: 'hidden', ai: [0, 0, 0, 0, 1, 3] }
};

let attackInNextTick = { Coelho: false, Ave: false, Observador: false };

// --- DOM ELEMENTS ---
const screens = {
    menu: document.getElementById('main-menu'),
    office: document.getElementById('office'),
    "camera-system": document.getElementById('camera-system'),
    jumpscare: document.getElementById('jumpscare'),
    gameover: document.getElementById('game-over'),
    win: document.getElementById('win-screen'),
    victory: document.getElementById('victory-screen')
};

const hud = {
    time: document.getElementById('time'),
    night: document.getElementById('nightdisplay'),
    energy: document.getElementById('energy-val'),
    usage: document.getElementById('usage-bars')
};

console.log("FNAF-GGOPA: Script de áudio carregado!");

// --- SOUNDS ---
const sounds = {};
const soundFiles = {
    menu: 'menu.mp3.mp3',
    ambience: 'ambience.mp3.mp3',
    kitchen: 'kitchen.mp3.mp3',
    door: 'door.mp3.mp3',
    light: 'light.mp3.mp3',
    monitor: 'monitor.mp3.mp3',
    powerout: 'powerout.mp3.mp3',
    jumpscare: 'jumpscare.mp3.mp3',
    blip: 'blip.mp3.mp3',
    freddy_music: 'freddy.mp3.mp3',
    victory: 'victory.mp3.mp3'
};

// Inicializa os sons com tratamento de erro básico
for (let s in soundFiles) {
    sounds[s] = new Audio('./assets/sounds/' + soundFiles[s]);
    sounds[s].onerror = () => console.error("Falha ao carregar arquivo de áudio:", soundFiles[s]);
}

function showScreen(id) {
    // Esconde todas as telas removendo a classe active
    for (let k in screens) {
        if (screens[k]) {
            screens[k].classList.remove('active');
        }
    }
    // Mostra a tela atual adicionando active
    const target = (id === 'gameover') ? screens.gameover :
        (id === 'victory-screen') ? screens.victory : screens[id];

    if (target) {
        target.classList.add('active');
    }

    // Garante que HUD e Gatilho do Monitor sempre apareçam no escritório ou câmeras (se houver energia)
    const hudEl = document.getElementById('hud');
    const trigger = document.getElementById('monitor-toggle');
    const isWorking = (id === 'office' || id === 'camera-system') && !powerOut;

    if (isWorking) {
        if (hudEl) hudEl.style.display = 'block';
        if (trigger) trigger.style.display = 'flex';
    } else {
        if (hudEl) hudEl.style.display = 'none';
        if (trigger) trigger.style.display = 'none';
    }
}

const soundTimeouts = {};

function playSound(s, loop = false, vol = 1, duration = 0) {
    const audio = sounds[s];
    if (audio) {
        // Limpa timeout anterior se houver para este som (evita cortes prematuros)
        if (soundTimeouts[s]) {
            clearTimeout(soundTimeouts[s]);
            delete soundTimeouts[s];
        }

        audio.loop = loop;
        audio.volume = vol;
        if (!loop) audio.currentTime = 0;

        audio.play()
            .then(() => {
                if (duration > 0) {
                    soundTimeouts[s] = setTimeout(() => {
                        if (audio.loop) return;
                        audio.pause();
                        audio.currentTime = 0;
                    }, duration);
                }
            })
            .catch(e => console.warn("Áudio bloqueado:", s, e));
    }
}

function stopSound(s) {
    if (sounds[s]) {
        sounds[s].pause();
        sounds[s].currentTime = 0;
        if (soundTimeouts[s]) {
            clearTimeout(soundTimeouts[s]);
            delete soundTimeouts[s];
        }
    }
}

function stopAllSounds() {
    for (let s in sounds) stopSound(s);
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

    const backMenuBtn = document.getElementById('btn-back-menu');
    if (backMenuBtn) backMenuBtn.onclick = () => window.location.reload();

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

    // SOLUÇÃO PARA O BLOQUEIO DE ÁUDIO DO NAVEGADOR (AUTO-PLAY)
    const unlockOverlay = document.getElementById('audio-unlock-overlay');
    if (unlockOverlay) {
        unlockOverlay.onclick = () => {
            console.log("Desbloqueando áudios via interação...");
            for (let s in sounds) {
                let a = sounds[s];
                a.play().then(() => {
                    a.pause();
                    a.currentTime = 0;
                }).catch(e => { });
            }

            // Inicia a música do menu após o desbloqueio
            setTimeout(() => {
                if (sounds.menu.paused) playSound('menu', true, 0.4);
            }, 300);

            // Remove o overlay com um leve fade-out
            unlockOverlay.style.opacity = '0';
            setTimeout(() => unlockOverlay.remove(), 500);
        };
    }
}

function startGame(night) {
    currentNight = night;
    resetState();
    showScreen('office');
    stopSound('menu');
    playSound('ambience', true, 0.3);
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
    hud.usage.innerHTML = '';
    for (let i = 0; i < usage; i++) {
        const bar = document.createElement('div');
        bar.className = 'usage-block';
        if (usage <= 2) bar.style.backgroundColor = '#33cc33';
        else if (usage <= 4) bar.style.backgroundColor = '#ffcc00';
        else bar.style.backgroundColor = '#ff1a1a';
        hud.usage.appendChild(bar);
    }
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
    if (side === 'left') {
        isLeftLightOn = !isLeftLightOn;
        document.getElementById('hallway-left').classList.toggle('lit', isLeftLightOn);
        document.getElementById('btn-light-left').classList.toggle('active', isLeftLightOn);
    } else {
        isRightLightOn = !isRightLightOn;
        document.getElementById('hallway-right').classList.toggle('lit', isRightLightOn);
        document.getElementById('btn-light-right').classList.toggle('active', isRightLightOn);
    }

    // Gerencia som da luz em loop
    if (isLeftLightOn || isRightLightOn) playSound('light', true, 0.4);
    else stopSound('light');

    renderDoorVisual(side);
    updateUsage();
}

function toggleMonitor() {
    // Permite fechar (isMonitorOpen true) mesmo sem energia, mas não permite abrir
    if (powerOut && !isMonitorOpen) return;

    isMonitorOpen = !isMonitorOpen;
    if (isMonitorOpen) {
        playSound('monitor', false, 1, 1000); // Toca por 1s
        showScreen('camera-system');
        switchCamera(currentCam);
    } else {
        playSound('monitor', false, 1, 1000); // Toca por 1s
        showScreen('office');
        if (animatronics.Erro.pos === currentCam) triggerJumpscare('Erro');
    }
    updateUsage();
}

function switchCamera(id) {
    // Se o Erro estava na câmera anterior, ele some ao trocar
    if (animatronics.Erro.pos !== 'hidden') animatronics.Erro.pos = 'hidden';

    currentCam = id;
    playSound('blip', false, 0.5, 1000); // Toca blip por 1s max
    document.querySelectorAll('.cam-btn').forEach(b => b.classList.toggle('active', b.dataset.cam === id));
    const s = document.getElementById('static-overlay');
    s.classList.add('heavy');
    setTimeout(() => s.classList.remove('heavy'), 150);
    const names = {
        '1': 'PALCO PRINCIPAL',
        '2': 'COZINHA',
        '3': 'PIRATE COVE',
        '4a': 'CORREDOR OESTE',
        '4b': 'CANTO OESTE',
        '5a': 'CORREDOR LESTE',
        '5b': 'CANTO LESTE',
        '6': 'SUPRIMENTOS',
        '7': 'BANHEIROS',
        '8': 'SALÃO DE JANTAR'
    };
    document.getElementById('cam-name').innerText = `CAM ${id.toUpperCase()} - ${names[id] || ''}`;
    renderCamView(id);
}

function updateAI() {
    if (powerOut) return;
    moveAnim('Coelho');
    moveAnim('Ave');
    moveFoxy();
    moveFreddy();
    moveError();
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

function moveError() {
    let a = animatronics.Erro;
    let lvl = a.ai[currentNight];
    if (lvl === 0 || !isMonitorOpen) return;

    // Se ele já está visível, ele some se o jogador mudar de câmera (lógica no switchCamera)
    if (a.pos !== 'hidden') return;

    // Chance rara de aparecer na câmera atual (estilo Golden Freddy)
    if (Math.random() * 100 < lvl * 2) {
        a.pos = currentCam;
        console.log("⚠️ O ERRO APARECEU NA CAM " + currentCam);
        // Efeito de estática forte para avisar o jogador
        const s = document.getElementById('static-overlay');
        if (s) {
            s.classList.add('heavy');
            setTimeout(() => s.classList.remove('heavy'), 500);
        }
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
    const roomScenes = {
        '1': '<div class="scene stage"><div class="curtain"></div><div class="floor-checkered"></div></div>',
        '2': '<div class="scene kitchen"><div class="counter"></div><div class="wall-shelf"></div></div>',
        '3': '<div class="scene cove"><div class="cove-curtain left"></div><div class="cove-curtain right"></div><div class="cove-sign">SORRY!<br>OUT OF ORDER</div></div>',
        '4a': '<div class="scene hallway-west"><div class="hallway-perspective"></div></div>',
        '4b': '<div class="scene corner-west"><div class="wall-posters"></div><div class="creepy-poster"></div><div class="hanging-wires-cam"></div><div class="corner-trash"></div><div style="position:absolute; bottom:10px; left:10px; color:red; font-size:12px; opacity:0.5;">SINAL REFORÇADO v2</div></div>',
        '5a': '<div class="scene hallway-east"><div class="hallway-perspective"></div></div>',
        '5b': '<div class="scene corner-east"><div class="vent-detail"></div><div class="rules-poster"></div><div class="corner-wires"></div></div>',
        '6': '<div class="scene supply"><div class="storage-racks"></div><div class="cleaning-bucket"></div><div class="mop"></div></div>',
        '7': '<div class="scene bathrooms"><div class="tiled-walls"></div><div class="stall-doors"></div><div class="mirror-distorted"></div><div class="sinks-area"></div></div>',
        '8': '<div class="scene dining"><div class="dining-checkered-floor"></div><div class="party-tables"><div class="table-set"></div><div class="table-set"></div><div class="table-set"></div></div><div class="balloons"></div><div class="party-banners-dining"></div><div style="position:absolute; bottom:10px; left:10px; color:red; font-size:12px; opacity:0.5;">SINAL REFORÇADO v2</div></div>'
    };

    // Remove labels e foca na cena
    let html = `<div class="cam-scene-container" style="position:absolute; width:100%; height:100%; z-index:1;">${roomScenes[id] || ''}</div>`;

    // Áudio da Cozinha (CAM 2)
    if (id === '2') {
        let isSomeoneInKitchen = (animatronics.Ave.pos === '2' || animatronics.Observador.pos === '2');
        if (isSomeoneInKitchen) playSound('kitchen', true, 0.6);
        else stopSound('kitchen');

        html = '<div style="position:absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); font-size:40px; color:#555; text-align:center; width: 100%; font-family: monospace;">- SEM SINAL VISUAL -<br>🔊 <i>Cozinha</i></div>';
    } else {
        stopSound('kitchen'); // Para o som se mudar de câmera
        if (id === '3') {
            let s = animatronics.Corredor.state;
            let foxy = s === 0 ? '' : (s === 1 ? '<span style="font-size:100px; position:absolute; left: 50%; top: 60%; transform: translate(-50%, -50%); z-index:60;">🦊</span>' : (s === 2 ? '<span style="font-size:150px; position:absolute; left: 50%; top: 65%; transform: translate(-50%, -50%); z-index:60;">🦊</span>' : '<span style="font-size:180px; position:absolute; left: 50%; top: 70%; transform: translate(-50%, -50%); z-index:60;">🦊</span>'));
            html = `<div class="cove-scene-wrapper state-${s}" style="position:absolute; width:100%; height:100%; z-index:10;">${roomScenes[id] || ''}</div>`;
            html = `<div style="z-index:70; position:absolute; width:100%; height:100%; pointer-events:none;">${foxy}</div>` + html;
        } else {
            let anims = '';
            for (let k in animatronics) {
                if (animatronics[k].pos === id && k !== 'Corredor') anims += animatronics[k].emoji;
            }
            if (anims) {
                html = `<div style="z-index:10; position:absolute; top: 70%; left: 50%; transform: translate(-50%, -50%); font-size:150px; width:100%; text-align:center; pointer-events:none;">${anims}</div>` + html;
            }
        }
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
    stopAllSounds();
    playSound('powerout');
    document.body.classList.add('power-out');

    // Desliga luzes e fecha portas
    isLeftDoorClosed = isRightDoorClosed = isLeftLightOn = isRightLightOn = false;
    stopSound('light'); // Garante que o loop da luz pare

    // Fecha o monitor forçadamente
    isMonitorOpen = false;
    showScreen('office'); // Isso agora esconde o tablet-toggle pois isWorking será false

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

    // Inicia a música do Freddy após 3 segundos no escuro total
    setTimeout(() => {
        if (!screens.menu.classList.contains('active') && powerOut) {
            playSound('freddy_music', true, 0.5);

            // Freddy piscando na porta esquerda no escuro (Olhos Brilhando)
            const leftDoor = document.getElementById('hallway-left');
            if (leftDoor) {
                leftDoor.style.fontSize = "160px";
                leftDoor.style.textAlign = "center";
                leftDoor.style.color = "white";
                leftDoor.style.textShadow = "0 0 20px rgba(255,255,255,0.8), 0 0 40px rgba(255,255,255,0.4)";

                let freddyFlash = setInterval(() => {
                    if (!powerOut || screens.menu.classList.contains('active')) {
                        clearInterval(freddyFlash);
                        leftDoor.innerText = '';
                        leftDoor.style.color = "";
                        leftDoor.style.textShadow = "";
                        return;
                    }
                    leftDoor.innerText = leftDoor.innerText === '🐻' ? '' : '🐻';
                }, 600);
            }
        }
    }, 3000);

    // Ataque do Freddy após um tempo aleatório (entre 10 e 25 segundos)
    const randomAttackTime = Math.floor(Math.random() * 15000) + 10000;
    setTimeout(() => {
        if (!screens.menu.classList.contains('active') && powerOut) {
            triggerJumpscare('Observador');
        }
    }, randomAttackTime);
}

function triggerJumpscare(key) {
    if (gameTick) clearInterval(gameTick); if (energyTick) clearInterval(energyTick); if (aiTick) clearInterval(aiTick);
    stopAllSounds();
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

            // Se venceu a Noite 5, mostra tela final de parabéns
            if (currentNight === 5) {
                stopAllSounds();
                playSound('victory', false, 0.6);
                showScreen('victory-screen');
                saveProgress(5); // Mantém na 5 ou libera modo extra se quiser
            } else {
                showScreen('win');
                let nextN = currentNight + 1;
                if (nextN > 5) nextN = 5;
                saveProgress(nextN);
            }
        }, 3000);
    }, 2000);
}

function loadProgress() {
    let s = localStorage.getItem('nightfall_night');
    if (s) { currentNight = parseInt(s); document.getElementById('btn-continue').disabled = false; document.getElementById('save-night').innerText = currentNight; }
}

function saveProgress(n) { localStorage.setItem('nightfall_night', n > 5 ? 5 : n); }

init();
