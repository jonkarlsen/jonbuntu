const terminal = document.getElementById("terminal");
const inputArea = document.getElementById("input-area");

const introText = `I guard a gift wrapped not in paper, but in patience and thought.

Have you been paying attention?

Google is allowed, if you must.`;
const greetings = "Greetings, Maria!\n";
const riddles = [{
    type: "text",
    text: "How many dots does a six-sided die have?",
    answers: ["21", "twenty one"]
}, {
    type: "text",
    text: "Very good, but not very difficult.\n\nWhat about a hundred-sided die?",
    answers: ["5050"]
}, {
    type: "slider",
    text: `What was the average temperature in Sandnes in November this year? (+/- 0.5 degrees)`,
    min: -5,
    max: 20,
    step: 0.1,
    acceptMin: 5.6,
    acceptMax: 6.6
}, {
    type: "text",
    text: "You are doing well so far.\n\nAs you know, Norway qualified for the FIFA World Cup 2026.\nHow many times have Norway qualified for the FIFA World Cup?",
    answers: ["four", "4"]
}, {
    type: "text",
    text: "What about Finland?",
    answers: ["0", "zero", "none", "never"]
}, {
    type: "text",
    text: `How many people in this house are wearing glasses?
Take that number, and multiply by 2.
Add 6.
Divide by 2.
Subtract the original number.`,
    answers: ["3", "three"]
}];


function glitchText(text, intensity = 0.08) {
    return text.split('').map(char => {
        if (Math.random() < intensity && char !== ' ') {
            return String.fromCharCode(33 + Math.floor(Math.random() * 94));
        }
        return char;
    }).join('');
}

async function preAccessAnimation() {
    const messages = [
        "CHECKING SYSTEM",
        "VERIFYING SECRETS",
        "DECRYPTING PAYLOAD",
        "CALCULATING PATH"
    ];

    const cycles = 2; // number of loops
    terminal.textContent = "";

    for (let c = 0; c < cycles; c++) {
        for (let msg of messages) {
            for (let dots = 0; dots <= 3; dots++) {
                // Glitch letters
                terminal.textContent = glitchText(msg) + ".".repeat(dots);

                // Small random shake
                if (Math.random() < 0.15) {
                    terminal.classList.add("shake");
                }

                await sleep(200);

                terminal.classList.remove("shake");
            }

            // Slight pause between messages
            await sleep(200);
        }
    }

    terminal.textContent = "";
}


function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function typeText(text, speed = 75) {
    for (let char of text) {
        terminal.textContent += char;
        await sleep(speed);
    }
    terminal.textContent += "\n";
}

async function loadingAnimation() {
    for (let i = 0; i < 5; i++) {
        terminal.textContent = "Loading.";
        await sleep(500);
        terminal.textContent = "Loading..";
        await sleep(500);
        terminal.textContent = "Loading...";
        await sleep(500);
    }
    terminal.textContent = "";
}

async function showAccessGrantedScreen() {
    terminal.textContent = "";

    inputArea.innerHTML = '';
    const okButton = document.createElement('button');
    okButton.textContent = 'OK';
    okButton.disabled = true;
    okButton.onclick = () => startRiddles();
    inputArea.appendChild(okButton);
    inputArea.style.display = 'block';

    await typeText("ACCESS GRANTED\n", 75);
    await typeText(greetings, 75);
    await typeText(introText, 75);

    okButton.disabled = false;
}

let currentRiddle = 0;

async function startRiddles() {
    inputArea.style.display = 'none';
    terminal.textContent = '';
    currentRiddle = 0;
    await showRiddle();
}

function getStartIndex() {
    const params = new URLSearchParams(window.location.search);
    const q = parseInt(params.get("q"), 10);
    if (!isNaN(q) && q >= 0 && q < riddles.length) {
        return q;
    }

    return null;
}

async function showRiddle() {
    terminal.textContent = '';
    inputArea.innerHTML = '';
    inputArea.style.display = 'block';

    const riddle = riddles[currentRiddle];

    await typeText(riddle.text);

    if (riddle.type === "text") {
        inputArea.innerHTML = `
      <input id="answer" type="text" placeholder="> enter answer">
      <button id="submitBtn" disabled>submit</button>
    `;
    }

    if (riddle.type === "slider") {
        inputArea.innerHTML = `
      <input id="slider" type="range"
             min="${riddle.min}"
             max="${riddle.max}"
             step="${riddle.step}"
             value="${riddle.min}">
      <div id="sliderValue">Value: ${riddle.min}</div>
      <button id="submitBtn" disabled>submit</button>
    `;

        const slider = document.getElementById("slider");
        const sliderValue = document.getElementById("sliderValue");

        slider.addEventListener("input", () => {
            sliderValue.textContent = `Value: ${slider.value}`;
        });
    }

    const submitBtn = document.getElementById("submitBtn");
    submitBtn.onclick = submitAnswer;
    submitBtn.disabled = false;
}

async function submitAnswer() {
    const riddle = riddles[currentRiddle];
    let correct = false;

    if (riddle.type === "text") {
        const input = document.getElementById("answer");
        const value = input.value.trim().toLowerCase();
        input.value = '';

        correct = riddle.answers.includes(value);
    }

    if (riddle.type === "slider") {
        const slider = document.getElementById("slider");
        const value = parseFloat(slider.value);

        correct = value >= riddle.acceptMin && value <= riddle.acceptMax;
    }

    if (correct) {
        terminal.textContent += "\nCORRECT!\n";
        await sleep(1200);
        currentRiddle++;

        if (currentRiddle >= riddles.length) {
            terminal.textContent = "VERIFYING INTEGRITY...\n";
            await glitchTerminal(1700);

            await showProgressBar(3500);

            terminal.textContent += "\nCHECKSUM VALID\n";
            await sleep(1600);

            await runMatrixEffect(10000);
            await revealGift();
        } else {
            showRiddle();
        }
    } else {
        terminal.textContent += "\nINCORRECT. Try again.\n";
    }
}

async function revealGift() {
    inputArea.style.display = 'none';
    terminal.textContent = '';
    terminal.classList.remove("fade-in");

    await sleep(300);

    terminal.textContent = "ALL CHALLENGES COMPLETED.\n\nGift unlocked.";
    terminal.classList.add("fade-in");

    const giftButton = document.createElement('button');
    giftButton.textContent = 'Reveal gift';
    giftButton.onclick = async () => {
        await countdownAnimation(5); // 5→0 countdown
        const giftImage = document.createElement('img');
        giftImage.src = '/static/images/maria.png'; // path to gift image
        giftImage.alt = 'Your gift';
        giftImage.style.maxWidth = '100%';
        inputArea.innerHTML = '';
        inputArea.appendChild(giftImage);
    };

    inputArea.innerHTML = ''; // clear any previous content
    inputArea.appendChild(giftButton);
    inputArea.style.display = 'block';
}

async function start() {
    const forcedIndex = getStartIndex();

    if (forcedIndex !== null) {
        currentRiddle = forcedIndex;
        terminal.textContent = '';
        inputArea.style.display = 'none';
        showRiddle();
        return;
    }

    await loadingAnimation();
    await preAccessAnimation();
    await showAccessGrantedScreen();
}

async function glitchTerminal(duration = 800) {
    terminal.classList.add("glitch");
    await sleep(duration);
    terminal.classList.remove("glitch");
}

function runMatrixEffect(duration = 10000) {
    return new Promise(resolve => {
        const matrix = document.getElementById("matrix");
        const canvas = document.getElementById("matrixCanvas");
        const ctx = canvas.getContext("2d");
        const box = document.getElementById("box");

        matrix.style.display = "block";
        matrix.style.opacity = "1";

        const rect = box.getBoundingClientRect();
        canvas.width = rect.width;
        canvas.height = rect.height;

        const letters = "01ABCDEFGHIJKLMNOPQRSTUVWXYZ";
        const fontSize = 14;
        const columns = Math.floor(canvas.width / fontSize);
        const drops = Array(columns).fill(1);

        function draw() {
            ctx.fillStyle = "rgba(0, 0, 0, 0.15)";
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            ctx.fillStyle = "#00ff66";
            ctx.font = `${fontSize}px monospace`;

            for (let i = 0; i < drops.length; i++) {
                const text = letters[Math.floor(Math.random() * letters.length)];
                ctx.fillText(text, i * fontSize, drops[i] * fontSize);

                if (drops[i] * fontSize > canvas.height && Math.random() > 0.96) {
                    drops[i] = 0;
                }
                drops[i]++;
            }
        }

        const interval = setInterval(draw, 50);

        setTimeout(() => {
            clearInterval(interval);

            // fade out matrix
            matrix.style.transition = "opacity 1.2s ease";
            matrix.style.opacity = "0";

            setTimeout(() => {
                matrix.style.display = "none";
                resolve();
            }, 1200);
        }, duration);
    });
}

async function showProgressBar(duration = 4500) {
    terminal.textContent += "\nINITIALIZING SEQUENCE...\n";

    const container = document.createElement("div");
    container.id = "progress-container";

    const bar = document.createElement("div");
    bar.id = "progress-bar";

    container.appendChild(bar);
    inputArea.innerHTML = '';
    inputArea.appendChild(container);
    inputArea.style.display = 'block';

    const steps = 45;
    const stepTime = duration / steps;
    let progress = 0;

    // Pick a random fail step
    const failStep = Math.floor(steps * 0.3 + Math.random() * steps * 0.3);

    for (let i = 1; i <= steps; i++) {
        // Random micro-pause
        if (Math.random() < 0.07) {
            terminal.textContent += "...\n";
            await sleep(300 + Math.random() * 400);
        }

        // Tiny backward glitch
        if (Math.random() < 0.08 && progress > 5) {
            progress -= 2;
            bar.style.width = `${progress}%`;
            await sleep(120);
        }

        // Red flash on the chosen fail step
        if (i === failStep) {
            bar.style.background = "#ff0000"; // red flash
            terminal.textContent += "\nERROR DETECTED. RETRYING...\n";
            await sleep(1500); // dramatic pause
            bar.style.background = "#00ff66"; // restore green
        }

        progress = Math.min(100, progress + 100 / steps);
        bar.style.width = `${progress}%`;

        await sleep(stepTime);
    }

    bar.style.width = "100%";
    terminal.textContent += "LOCK ACQUIRED\n";

    await sleep(600);
    inputArea.innerHTML = '';
}

async function countdownAnimation(start = 5) {
    const countdownDiv = document.createElement("div");
    countdownDiv.id = "countdown";
    inputArea.innerHTML = '';
    inputArea.appendChild(countdownDiv);
    inputArea.style.display = 'block';

    for (let i = start; i >= 0; i--) {
        countdownDiv.textContent = i;

        // Slight glitch/flicker occasionally
        if (Math.random() < 2) {
            countdownDiv.classList.add("countdown-glitch");
        } else {
            countdownDiv.classList.remove("countdown-glitch");
        }

        await sleep(800); // duration of each number
    }

    // fade out countdown
    countdownDiv.style.transition = "opacity 1s ease";
    countdownDiv.style.opacity = "0";
    await sleep(1000);
    inputArea.innerHTML = ''; // clear countdown
}


start();