const typewriterEl = document.getElementById("typewriter");
const fireworkBtn = document.getElementById("fireworkBtn");
const sparklesRoot = document.getElementById("sparkles");

const message = "Спасибо, что всегда веришь в меня, поддерживаешь и даришь столько тепла. Пусть этот год будет для тебя самым счастливым.";

function runTypewriter(text, speed = 32) {
    let index = 0;
    const timer = setInterval(() => {
        typewriterEl.textContent = text.slice(0, index + 1);
        index += 1;

        if (index >= text.length) {
            clearInterval(timer);
        }
    }, speed);
}

function createSparkles(count = 26) {
    for (let i = 0; i < count; i += 1) {
        const spark = document.createElement("span");
        spark.className = "spark";
        spark.style.left = `${Math.random() * 100}%`;
        spark.style.top = `${25 + Math.random() * 75}%`;
        spark.style.animationDuration = `${3 + Math.random() * 4}s`;
        spark.style.animationDelay = `${Math.random() * 4}s`;
        sparklesRoot.appendChild(spark);
    }
}

function setupConfetti() {
    const canvas = document.getElementById("confetti-canvas");
    const ctx = canvas.getContext("2d");
    let particles = [];
    let rafId = null;

    function resize() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }

    function spawnBurst(x, y) {
        const colors = ["#ff6b6b", "#f59e0b", "#f97316", "#ffd166", "#ff8fa3"];

        for (let i = 0; i < 160; i += 1) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 2 + Math.random() * 5;
            particles.push({
                x,
                y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed - 2,
                color: colors[(Math.random() * colors.length) | 0],
                life: 60 + Math.random() * 35,
                size: 3 + Math.random() * 4,
                gravity: 0.05 + Math.random() * 0.09
            });
        }

        if (!rafId) {
            animate();
        }
    }

    function animate() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        particles = particles.filter((p) => p.life > 0);

        for (const p of particles) {
            p.x += p.vx;
            p.y += p.vy;
            p.vy += p.gravity;
            p.vx *= 0.995;
            p.life -= 1;

            ctx.globalAlpha = Math.max(0, p.life / 95);
            ctx.fillStyle = p.color;

            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fill();
        }

        ctx.globalAlpha = 1;

        if (particles.length > 0) {
            rafId = requestAnimationFrame(animate);
        } else {
            cancelAnimationFrame(rafId);
            rafId = null;
        }
    }

    window.addEventListener("resize", resize);
    resize();

    fireworkBtn.addEventListener("click", () => {
        const x = canvas.width * (0.2 + Math.random() * 0.6);
        const y = canvas.height * (0.15 + Math.random() * 0.4);
        spawnBurst(x, y);

        setTimeout(() => spawnBurst(canvas.width * 0.35, canvas.height * 0.3), 180);
        setTimeout(() => spawnBurst(canvas.width * 0.65, canvas.height * 0.28), 330);
    });
}

function setupHeartGame() {
    const startGameBtn = document.getElementById("startGameBtn");
    const gameField = document.getElementById("gameField");
    const heartTarget = document.getElementById("heartTarget");
    const gameOverlay = document.getElementById("gameOverlay");
    const scoreValue = document.getElementById("scoreValue");
    const timeValue = document.getElementById("timeValue");
    const bestValue = document.getElementById("bestValue");

    if (!startGameBtn || !gameField || !heartTarget || !gameOverlay || !scoreValue || !timeValue || !bestValue) {
        return;
    }

    const gameDuration = 30;
    const bestKey = "birthday_mama_best_score";

    let score = 0;
    let timeLeft = gameDuration;
    let bestScore = 0;
    let isPlaying = false;
    let timerId = null;
    let moveId = null;

    function readBestScore() {
        try {
            const raw = Number(localStorage.getItem(bestKey));
            return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 0;
        } catch {
            return 0;
        }
    }

    function saveBestScore(value) {
        try {
            localStorage.setItem(bestKey, String(value));
        } catch {
            // localStorage can be disabled in some browser modes.
        }
    }

    function setOverlay(text, hidden) {
        gameOverlay.textContent = text;
        gameOverlay.classList.toggle("hidden", hidden);
    }

    function updatePanel() {
        scoreValue.textContent = String(score);
        timeValue.textContent = String(timeLeft);
        bestValue.textContent = String(bestScore);
    }

    function moveHeart() {
        const fieldWidth = gameField.clientWidth;
        const fieldHeight = gameField.clientHeight;
        const targetSize = heartTarget.offsetWidth || 62;
        const margin = 6;

        const maxX = Math.max(margin, fieldWidth - targetSize - margin);
        const maxY = Math.max(margin, fieldHeight - targetSize - margin);
        const x = margin + Math.random() * (maxX - margin);
        const y = margin + Math.random() * (maxY - margin);

        heartTarget.style.transform = `translate(${x}px, ${y}px)`;
    }

    function stopGame() {
        isPlaying = false;
        heartTarget.disabled = true;
        heartTarget.classList.remove("active");
        startGameBtn.textContent = "Сыграть еще";

        clearInterval(timerId);
        clearInterval(moveId);

        let message = `Время вышло! Результат: ${score}`;

        if (score > bestScore) {
            bestScore = score;
            saveBestScore(bestScore);
            message = `Время вышло! Результат: ${score}. Новый рекорд!`;
        }

        updatePanel();
        setOverlay(message, false);
    }

    function startGame() {
        score = 0;
        timeLeft = gameDuration;
        isPlaying = true;

        heartTarget.disabled = false;
        heartTarget.classList.add("active");
        startGameBtn.textContent = "Игра идет...";

        setOverlay("", true);
        updatePanel();
        moveHeart();

        clearInterval(timerId);
        clearInterval(moveId);

        moveId = setInterval(moveHeart, 630);
        timerId = setInterval(() => {
            timeLeft -= 1;

            if (timeLeft <= 0) {
                timeLeft = 0;
                stopGame();
                return;
            }

            updatePanel();
        }, 1000);
    }

    bestScore = readBestScore();
    updatePanel();

    startGameBtn.addEventListener("click", () => {
        if (isPlaying) {
            return;
        }

        startGame();
    });

    heartTarget.addEventListener("click", () => {
        if (!isPlaying) {
            return;
        }

        score += 1;
        updatePanel();

        heartTarget.classList.remove("pop");
        void heartTarget.offsetWidth;
        heartTarget.classList.add("pop");

        moveHeart();
    });

    heartTarget.addEventListener("animationend", () => {
        heartTarget.classList.remove("pop");
    });

    window.addEventListener("resize", () => {
        if (isPlaying) {
            moveHeart();
        }
    });
}

createSparkles();
runTypewriter(message);
setupConfetti();
setupHeartGame();
