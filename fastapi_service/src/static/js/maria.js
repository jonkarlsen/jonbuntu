const terminal = document.getElementById("terminal");
const inputArea = document.getElementById("input-area");

const introText = "I guard a gift wrapped not in paper, but in patience and thought.\n\nHave you been paying attention?";
const greetings = "Greetings, Maria!\n";
const riddles = [{
    text: "How many dots does a six-sided die have?",
    answers: ["twenty one", "21", "twenty one"]
}, {
    text: "Very good, but not very difficult.\n\nWhat about a hundred-sided die?",
    answers: ["5050"]
}];

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
    okButton.textContent = 'Yes';
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

async function showRiddle() {
    terminal.textContent = '';

    inputArea.innerHTML = '<input id="answer" type="text" placeholder="> enter answer"><button id="submitBtn" disabled>submit</button>';
    const submitBtn = document.getElementById('submitBtn');
    submitBtn.onclick = submitAnswer;
    inputArea.style.display = 'block';

    await typeText(riddles[currentRiddle].text);

    submitBtn.disabled = false;
}

async function submitAnswer() {
    const input = document.getElementById("answer");
    const value = input.value.trim().toLowerCase();
    input.value = '';

    if (riddles[currentRiddle].answers.includes(value)) {
        terminal.textContent += "\nCORRECT!\n";
        await sleep(1500); // pause so user can see the message
        currentRiddle++;
        if (currentRiddle >= riddles.length) {
            await revealGift();
        } else {
            await showRiddle();
        }
    } else {
        terminal.textContent += "\nINCORRECT. Try again.\n> ";
    }
}

async function revealGift() {
    inputArea.style.display = 'none';
    terminal.textContent = '';
    await typeText("ALL CHALLENGES COMPLETE.\n\nGift unlocked.");

    const giftButton = document.createElement('button');
    giftButton.textContent = 'Reveal gift';
    giftButton.onclick = () => {
        window.open('https://example.com/gift.jpg', '_blank');
    };
    inputArea.innerHTML = ''; // clear any previous content
    inputArea.appendChild(giftButton);
    inputArea.style.display = 'block';
}

async function start() {
    await loadingAnimation();
    await showAccessGrantedScreen();
}

start();
