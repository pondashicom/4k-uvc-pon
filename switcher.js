// トリミング枠ドラッグ・リサイズ状態を保持する変数
let draggingShotIndex = -1;
let dragOffsetX = 0;
let dragOffsetY = 0;
let isDraggingEditorShot = false;
let editorSelectedShotIndex = 0;
let editorDragMode = "";
let resizeHandlePosition = "";
let resizeAnchorX = 0;
let resizeAnchorY = 0;

// トリミング枠操作定数
const SHOT_ASPECT_RATIO = 16 / 9;
const EDITOR_HANDLE_SIZE = 14;
const EDITOR_EDGE_HIT_WIDTH = 14;

// UVC映像入力とダミー描画を管理する変数
const sourceVideo = document.getElementById("source-video");
const stbyCanvas = document.getElementById("stby-canvas");
const pgmCanvas = document.getElementById("pgm-canvas");
const editorCanvas = document.getElementById("editor-canvas");
const shotCanvases = [
    document.getElementById("shot-canvas-0"),
    document.getElementById("shot-canvas-1"),
    document.getElementById("shot-canvas-2"),
    document.getElementById("shot-canvas-3")
];

// ショット選択UIを保持する変数
const shotHeaderElements = [
    document.getElementById("shot-header-0"),
    document.getElementById("shot-header-1"),
    document.getElementById("shot-header-2"),
    document.getElementById("shot-header-3")
];
const shotSelectButtons = Array.from(document.querySelectorAll(".shot-select-button"));
const stbyHeaderElement = document.querySelector(".stby-header");
const pgmHeaderElement = document.querySelector(".pgm-header");

// 操作UIを保持する変数
const cutButton = document.getElementById("cut-button");
const autoButton = document.getElementById("auto-button");
const tbarSlider = document.getElementById("tbar-slider");

// 映像入力情報を保持する変数
let sourceStream = null;
let usingDummySource = true;
let animationFrameId = null;

// PGM外部出力ウィンドウを保持する変数
let pgmOutputWindow = null;
let pgmOutputCanvas = null;
let pgmOutputContext = null;

// 解像度表示UIを保持する変数
let inputResolutionElement = null;

// 入力映像サイズを管理する変数
let sourceWidth = 1920;
let sourceHeight = 1080;

// ショット状態を保持する配列
let shots = [];

// STBY/PGM状態を保持する変数
let stbyShotIndex = 0;
let pgmShotIndex = 1;

// AUTOトランジション状態を保持する変数
let isAutoTransitionRunning = false;
let autoTransitionStartTime = 0;
let autoTransitionDuration = 500;
let autoTransitionFromIndex = -1;
let autoTransitionToIndex = -1;

// Tバー状態を保持する変数
let isTbarTransitionActive = false;
let tbarTransitionFromIndex = -1;
let tbarTransitionToIndex = -1;
let tbarTransitionProgress = 0;
let tbarRestValue = 0;

// 全体フィット対象を保持する変数
const appFitRoot = document.getElementById("app-fit-root");
const appShell = document.querySelector(".app-shell");

// 基準レイアウトサイズを保持する定数
const DESIGN_WIDTH = 1600;
const DESIGN_HEIGHT = 900;

// アプリ全体をviewportへ収める関数
function fitAppToViewport() {
    if (!appShell) {
        return;
    }

    if (!appFitRoot) {
        appShell.style.transform = "";
        return;
    }

    const rootWidth = appFitRoot.clientWidth;
    const rootHeight = appFitRoot.clientHeight;

    if (rootWidth <= 0 || rootHeight <= 0) {
        return;
    }

    const scaleX = rootWidth / DESIGN_WIDTH;
    const scaleY = rootHeight / DESIGN_HEIGHT;
    const scale = Math.min(scaleX, scaleY);

    const scaledWidth = DESIGN_WIDTH * scale;
    const scaledHeight = DESIGN_HEIGHT * scale;

    const offsetX = (rootWidth - scaledWidth) / 2;
    const offsetY = (rootHeight - scaledHeight) / 2;

    appShell.style.transformOrigin = "top left";
    appShell.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;
}

async function initSwitcher() {
    fitAppToViewport();
    setupCanvasContexts();
    setupKeyboardHandlers();
    setupButtonHandlers();
    setupEditorMouseHandlers();
    ensureInputResolutionDisplay();

    await startVideoInput();
    initializeShots();
    updateShotSelectionUI();
    updateInputResolutionDisplay();
    startRenderLoop();

    window.addEventListener("resize", () => {
        fitAppToViewport();
        syncAllCanvasSizes();
        syncPgmOutputWindowSize();
    });

    window.addEventListener("beforeunload", () => {
        closePgmOutputWindow();
    });
}

// canvas設定を初期化する関数
function setupCanvasContexts() {
    syncAllCanvasSizes();
}
// 全canvasの内部解像度を用途別に同期する関数
function syncAllCanvasSizes() {
    syncCanvasResolution(stbyCanvas, 640, 360);
    syncCanvasResolution(pgmCanvas, 640, 360);

    shotCanvases.forEach((canvas) => {
        syncCanvasResolution(canvas, 320, 180);
    });

    const editorPreviewWidth = Math.min(sourceWidth, 960);
    const editorPreviewHeight = Math.max(1, Math.round(editorPreviewWidth * (sourceHeight / sourceWidth)));
    syncCanvasResolution(editorCanvas, editorPreviewWidth, editorPreviewHeight);
}

// canvasの内部解像度を同期する関数
function syncCanvasResolution(canvas, width, height) {
    const targetWidth = Math.max(1, Math.round(width));
    const targetHeight = Math.max(1, Math.round(height));

    if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
        canvas.width = targetWidth;
        canvas.height = targetHeight;
    }

    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
}

// 入力解像度表示UIを生成する関数
function ensureInputResolutionDisplay() {
    if (inputResolutionElement) {
        return;
    }

    inputResolutionElement = document.createElement("div");
    inputResolutionElement.style.position = "fixed";
    inputResolutionElement.style.top = "12px";
    inputResolutionElement.style.right = "12px";
    inputResolutionElement.style.zIndex = "9999";
    inputResolutionElement.style.padding = "6px 10px";
    inputResolutionElement.style.borderRadius = "6px";
    inputResolutionElement.style.background = "rgba(0, 0, 0, 0.75)";
    inputResolutionElement.style.color = "#ffffff";
    inputResolutionElement.style.fontSize = "12px";
    inputResolutionElement.style.fontWeight = "bold";
    inputResolutionElement.style.fontFamily = "sans-serif";
    inputResolutionElement.style.letterSpacing = "0.04em";
    inputResolutionElement.style.pointerEvents = "none";
    inputResolutionElement.textContent = "INPUT -";

    document.body.appendChild(inputResolutionElement);
}

// 入力解像度表示UIを更新する関数
function updateInputResolutionDisplay() {
    if (!inputResolutionElement) {
        return;
    }

    if (usingDummySource) {
        inputResolutionElement.textContent = `INPUT DUMMY ${sourceWidth} x ${sourceHeight}`;
        return;
    }

    inputResolutionElement.textContent = `INPUT ${sourceWidth} x ${sourceHeight}`;
}

// UVC映像を開始する関数
async function startVideoInput() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        usingDummySource = true;
        sourceWidth = 1920;
        sourceHeight = 1080;
        updateInputResolutionDisplay();
        return;
    }

    try {
        sourceStream = await navigator.mediaDevices.getUserMedia({
            video: {
                width: { ideal: 3840 },
                height: { ideal: 2160 },
                frameRate: { ideal: 30 }
            },
            audio: false
        });

        sourceVideo.srcObject = sourceStream;
        await sourceVideo.play();

        await waitForVideoReady();

        sourceWidth = sourceVideo.videoWidth || 1920;
        sourceHeight = sourceVideo.videoHeight || 1080;
        usingDummySource = false;
        updateInputResolutionDisplay();
    } catch (error) {
        console.warn("[switcher.js] UVC映像取得に失敗したためダミー描画へ切替:", error);
        usingDummySource = true;
        sourceWidth = 1920;
        sourceHeight = 1080;
        updateInputResolutionDisplay();
    }
}

// 動画の準備完了を待つ関数
function waitForVideoReady() {
    return new Promise((resolve) => {
        if (sourceVideo.readyState >= 2 && sourceVideo.videoWidth > 0 && sourceVideo.videoHeight > 0) {
            resolve();
            return;
        }

        const onLoaded = () => {
            sourceVideo.removeEventListener("loadedmetadata", onLoaded);
            sourceVideo.removeEventListener("canplay", onLoaded);
            resolve();
        };

        sourceVideo.addEventListener("loadedmetadata", onLoaded);
        sourceVideo.addEventListener("canplay", onLoaded);
    });
}

// 入力解像度に応じて初期ショットを生成する関数
function initializeShots() {
    const shotWidth = Math.floor(sourceWidth / 2);
    const shotHeight = Math.floor(sourceHeight / 2);

    shots = [
        {
            id: 1,
            name: "Shot 1",
            x: 0,
            y: 0,
            width: shotWidth,
            height: shotHeight,
            color: "#FFD400"
        },
        {
            id: 2,
            name: "Shot 2",
            x: sourceWidth - shotWidth,
            y: 0,
            width: shotWidth,
            height: shotHeight,
            color: "#00AEEF"
        },
        {
            id: 3,
            name: "Shot 3",
            x: 0,
            y: sourceHeight - shotHeight,
            width: shotWidth,
            height: shotHeight,
            color: "#F37021"
        },
        {
            id: 4,
            name: "Shot 4",
            x: sourceWidth - shotWidth,
            y: sourceHeight - shotHeight,
            width: shotWidth,
            height: shotHeight,
            color: "#C86DD7"
        }
    ];
}

// 描画ループを開始する関数
function startRenderLoop() {
    const loop = () => {
        syncAllCanvasSizes();
        updateAutoTransition();
        renderAll();
        animationFrameId = requestAnimationFrame(loop);
    };

    if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
    }

    loop();
}

// 全画面を再描画する関数
function renderAll() {
    renderStby();
    renderPgm();
    renderShotPreviews();
    renderEditorView();
}

// STBY画面を描画する関数
function renderStby() {
    const shot = shots[stbyShotIndex];
    renderShotToCanvas(sourceVideo, shot, stbyCanvas);
}

// PGM画面を描画する関数
function renderPgm() {
    renderCurrentPgmToCanvas(pgmCanvas);
    updatePgmOutputWindow();
}

// 現在のPGM状態を任意のcanvasへ描画する関数
function renderCurrentPgmToCanvas(canvas) {
    if (
        isAutoTransitionRunning &&
        autoTransitionFromIndex >= 0 &&
        autoTransitionToIndex >= 0
    ) {
        renderAutoTransitionToCanvas(canvas);
        return;
    }

    if (
        isTbarTransitionActive &&
        tbarTransitionFromIndex >= 0 &&
        tbarTransitionToIndex >= 0
    ) {
        renderTbarTransitionToCanvas(canvas);
        return;
    }

    const shot = shots[pgmShotIndex];
    renderShotToCanvas(sourceVideo, shot, canvas);
}

// Shot一覧を描画する関数
function renderShotPreviews() {
    shots.forEach((shot, index) => {
        renderShotToCanvas(sourceVideo, shot, shotCanvases[index]);
        drawShotStatusOverlay(shotCanvases[index], index);
    });
}

// トリミング編集ビューを描画する関数
function renderEditorView() {
    const ctx = editorCanvas.getContext("2d");
    const canvasWidth = editorCanvas.width;
    const canvasHeight = editorCanvas.height;

    ctx.clearRect(0, 0, canvasWidth, canvasHeight);

    if (usingDummySource || !isVideoReady()) {
        drawDummySource(ctx, canvasWidth, canvasHeight);
    } else {
        ctx.drawImage(sourceVideo, 0, 0, canvasWidth, canvasHeight);
    }

    const scaleX = canvasWidth / sourceWidth;
    const scaleY = canvasHeight / sourceHeight;

    const orderedShotIndexes = shots.map((_, index) => index)
        .filter((index) => index !== editorSelectedShotIndex);

    if (editorSelectedShotIndex >= 0 && editorSelectedShotIndex < shots.length) {
        orderedShotIndexes.push(editorSelectedShotIndex);
    }

    orderedShotIndexes.forEach((index) => {
        const shot = shots[index];
        const drawX = shot.x * scaleX;
        const drawY = shot.y * scaleY;
        const drawWidth = shot.width * scaleX;
        const drawHeight = shot.height * scaleY;
        const isSelected = index === editorSelectedShotIndex;

        ctx.save();
        ctx.strokeStyle = shot.color;
        ctx.lineWidth = isSelected ? 4 : 3;
        ctx.strokeRect(drawX, drawY, drawWidth, drawHeight);

        if (isSelected) {
            drawEditorResizeHandles(ctx, drawX, drawY, drawWidth, drawHeight, shot.color);
        }

        const labelScale = Math.min(scaleX, scaleY);
        const labelHeight = Math.max(16, Math.round(24 * labelScale));
        const labelWidth = Math.max(56, Math.round(96 * labelScale));
        const labelPaddingX = Math.max(5, Math.round(8 * labelScale));
        const labelFontSize = Math.max(9, Math.round(13 * labelScale));

        ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
        ctx.fillRect(drawX, drawY + drawHeight - labelHeight, labelWidth, labelHeight);

        ctx.fillStyle = "#ffffff";
        ctx.font = `${labelFontSize}px sans-serif`;
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillText(shot.name, drawX + labelPaddingX, drawY + drawHeight - (labelHeight / 2));

        ctx.restore();
    });
}

// 1つのショットをcanvasへ描画する関数
function renderShotToCanvas(videoElement, shot, canvas) {
    const ctx = canvas.getContext("2d");
    const canvasWidth = canvas.width;
    const canvasHeight = canvas.height;

    ctx.clearRect(0, 0, canvasWidth, canvasHeight);

    if (!shot) {
        return;
    }

    if (usingDummySource || !isVideoReady()) {
        drawDummyShot(ctx, canvasWidth, canvasHeight, shot);
        return;
    }

    ctx.drawImage(
        videoElement,
        shot.x,
        shot.y,
        shot.width,
        shot.height,
        0,
        0,
        canvasWidth,
        canvasHeight
    );
}

// 動画が描画可能か判定する関数
function isVideoReady() {
    return !!sourceVideo && sourceVideo.readyState >= 2 && sourceVideo.videoWidth > 0 && sourceVideo.videoHeight > 0;
}

// Shot状態をプレビューへ重ね描きする関数
function drawShotStatusOverlay(canvas, index) {
    const ctx = canvas.getContext("2d");
    const width = canvas.width;
    const height = canvas.height;
    const isStby = index === stbyShotIndex;
    const isPgm = index === pgmShotIndex;

    if (isPgm) {
        ctx.save();
        ctx.strokeStyle = "#ff3b3b";
        ctx.lineWidth = 2;
        ctx.strokeRect(1, 1, width - 2, height - 2);
        ctx.restore();
    }

    if (isStby && isPgm) {
        ctx.save();
        ctx.strokeStyle = "#39c956";
        ctx.lineWidth = 2;
        ctx.strokeRect(4, 4, width - 8, height - 8);
        ctx.restore();
        return;
    }

    if (isStby) {
        ctx.save();
        ctx.strokeStyle = "#39c956";
        ctx.lineWidth = 2;
        ctx.strokeRect(1, 1, width - 2, height - 2);
        ctx.restore();
    }
}

// ダミーソース全景を描画する関数
function drawDummySource(ctx, width, height) {
    ctx.fillStyle = "#20242b";
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = "#2f3640";
    ctx.fillRect(0, 0, width / 2, height / 2);

    ctx.fillStyle = "#3a4757";
    ctx.fillRect(width / 2, 0, width / 2, height / 2);

    ctx.fillStyle = "#445366";
    ctx.fillRect(0, height / 2, width / 2, height / 2);

    ctx.fillStyle = "#526377";
    ctx.fillRect(width / 2, height / 2, width / 2, height / 2);

    const now = new Date();
    const timeText = now.toLocaleTimeString("ja-JP");

    ctx.fillStyle = "#ffffff";
    ctx.font = "28px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("DUMMY SOURCE", width / 2, height / 2 - 20);
    ctx.fillText(timeText, width / 2, height / 2 + 20);
}

// ダミーショットを描画する関数
function drawDummyShot(ctx, width, height, shot) {
    drawDummySource(ctx, width, height);

    ctx.save();
    ctx.strokeStyle = shot.color;
    ctx.lineWidth = 8;
    ctx.strokeRect(8, 8, width - 16, height - 16);

    ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
    ctx.fillRect(0, height - 34, width, 34);

    ctx.fillStyle = "#ffffff";
    ctx.font = "18px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(shot.name, width / 2, height - 17);
    ctx.restore();
}

// Shot選択UIを更新する関数
function updateShotSelectionUI() {
    shots.forEach((shot, index) => {
        const headerElement = shotHeaderElements[index];
        const buttonElement = shotSelectButtons[index];

        headerElement.innerHTML = `<span style="color: ${shot.color};">■</span>&nbsp;${shot.name}`;

        if (index === pgmShotIndex) {
            headerElement.style.background = "#f11212";
        } else if (index === stbyShotIndex) {
            headerElement.style.background = "#39c956";
        } else {
            headerElement.style.background = "#2b2f36";
        }

        headerElement.style.color = "#ffffff";

        buttonElement.classList.remove("active");
        buttonElement.style.background = "#d9d9d9";
        buttonElement.style.color = "#111111";
        buttonElement.style.outline = "none";

        if (index === pgmShotIndex) {
            buttonElement.style.background = "#f11212";
            buttonElement.style.color = "#ffffff";
            buttonElement.style.outline = "3px solid #f11212";
            buttonElement.style.outlineOffset = "-3px";
        } else if (index === stbyShotIndex) {
            buttonElement.style.background = "#39c956";
            buttonElement.style.color = "#ffffff";
            buttonElement.style.outline = "3px solid #39c956";
            buttonElement.style.outlineOffset = "-3px";
        }
    });

    if (stbyHeaderElement && shots[stbyShotIndex]) {
        stbyHeaderElement.innerHTML = `<span style="color: ${shots[stbyShotIndex].color};">■</span>&nbsp;STANDBY`;
    }

    if (pgmHeaderElement && shots[pgmShotIndex]) {
        pgmHeaderElement.innerHTML = `<span style="color: ${shots[pgmShotIndex].color};">■</span>&nbsp;PROGRAM`;
    }
}

// STBYショットを切り替える関数
function setStbyShot(index) {
    if (index < 0 || index >= shots.length) {
        return;
    }

    if (isTbarTransitionActive) {
        return;
    }

    stbyShotIndex = index;
    updateShotSelectionUI();
}

// CUTを実行する関数
function cutSwitch() {
    if (isAutoTransitionRunning || isTbarTransitionActive) {
        return;
    }

    const oldPgm = pgmShotIndex;
    pgmShotIndex = stbyShotIndex;
    stbyShotIndex = oldPgm;
    updateShotSelectionUI();
}

// キー操作を登録する関数
function setupKeyboardHandlers() {
    window.addEventListener("keydown", (event) => {
        if (event.repeat) {
            return;
        }

        if (event.key === "1") {
            setStbyShot(0);
        } else if (event.key === "2") {
            setStbyShot(1);
        } else if (event.key === "3") {
            setStbyShot(2);
        } else if (event.key === "4") {
            setStbyShot(3);
        } else if (event.key === "Enter") {
            cutSwitch();
        } else if (event.key === " ") {
            event.preventDefault();
            startAutoTransition();
        }
    });
}

// ボタン操作を登録する関数
function setupButtonHandlers() {
    shotSelectButtons.forEach((buttonElement) => {
        buttonElement.addEventListener("click", () => {
            const shotIndex = Number(buttonElement.dataset.shotIndex);
            setStbyShot(shotIndex);
        });
    });

    shotCanvases.forEach((canvasElement, index) => {
        canvasElement.addEventListener("click", () => {
            setStbyShot(index);
        });
    });

    shotHeaderElements.forEach((headerElement, index) => {
        headerElement.addEventListener("click", () => {
            setStbyShot(index);
        });
    });

    cutButton.addEventListener("click", () => {
        cutSwitch();
    });

    autoButton.addEventListener("click", () => {
        startAutoTransition();
    });

    tbarSlider.addEventListener("input", () => {
        updateTbarTransitionFromSlider();
    });

    tbarSlider.addEventListener("change", () => {
        finalizeTbarTransitionFromSlider();
    });

    pgmCanvas.addEventListener("dblclick", () => {
        togglePgmOutputWindow();
    });
}

// AUTOトランジションを開始する関数
function startAutoTransition() {
    if (isAutoTransitionRunning || isTbarTransitionActive) {
        return;
    }

    if (stbyShotIndex === pgmShotIndex) {
        return;
    }

    autoTransitionFromIndex = pgmShotIndex;
    autoTransitionToIndex = stbyShotIndex;
    autoTransitionStartTime = performance.now();
    isAutoTransitionRunning = true;
}

// AUTOトランジション進行を更新する関数
function updateAutoTransition() {
    if (!isAutoTransitionRunning) {
        return;
    }

    const elapsed = performance.now() - autoTransitionStartTime;
    const progress = elapsed / autoTransitionDuration;

    if (progress < 1) {
        return;
    }

    const oldPgm = autoTransitionFromIndex;
    pgmShotIndex = autoTransitionToIndex;
    stbyShotIndex = oldPgm;

    isAutoTransitionRunning = false;
    autoTransitionFromIndex = -1;
    autoTransitionToIndex = -1;

    updateShotSelectionUI();
}

// AUTOトランジション中のPGMを描画する関数
function renderAutoTransitionToCanvas(canvas) {
    const elapsed = performance.now() - autoTransitionStartTime;
    const progress = clamp(elapsed / autoTransitionDuration, 0, 1);

    renderMixedTransitionToCanvas(
        canvas,
        autoTransitionFromIndex,
        autoTransitionToIndex,
        progress
    );
}

// Tバートランジション中のPGMを描画する関数
function renderTbarTransitionToCanvas(canvas) {
    renderMixedTransitionToCanvas(
        canvas,
        tbarTransitionFromIndex,
        tbarTransitionToIndex,
        tbarTransitionProgress
    );
}

// 2つのショットを混合してcanvasへ描画する関数
function renderMixedTransitionToCanvas(canvas, fromIndex, toIndex, progress) {
    const fromShot = shots[fromIndex];
    const toShot = shots[toIndex];

    if (!fromShot || !toShot) {
        return;
    }

    const ctx = canvas.getContext("2d");
    const canvasWidth = canvas.width;
    const canvasHeight = canvas.height;

    ctx.clearRect(0, 0, canvasWidth, canvasHeight);
    ctx.save();
    ctx.globalAlpha = 1;
    drawShotImageToContext(ctx, sourceVideo, fromShot, canvasWidth, canvasHeight);

    ctx.globalAlpha = clamp(progress, 0, 1);
    drawShotImageToContext(ctx, sourceVideo, toShot, canvasWidth, canvasHeight);
    ctx.restore();
}

// Tバー遷移元を初期化する関数
function beginTbarTransitionIfNeeded() {
    if (isAutoTransitionRunning) {
        return false;
    }

    if (stbyShotIndex === pgmShotIndex) {
        return false;
    }

    if (!isTbarTransitionActive) {
        tbarTransitionFromIndex = pgmShotIndex;
        tbarTransitionToIndex = stbyShotIndex;
        tbarTransitionProgress = 0;
        isTbarTransitionActive = true;
    }

    return true;
}

// Tバーのスライダー値から進行を更新する関数
function updateTbarTransitionFromSlider() {
    const sliderValue = Number(tbarSlider.value);
    const progress = tbarRestValue === 0
        ? clamp(sliderValue / 100, 0, 1)
        : clamp((100 - sliderValue) / 100, 0, 1);

    if (sliderValue === tbarRestValue) {
        cancelTbarTransition();
        return;
    }

    if (!beginTbarTransitionIfNeeded()) {
        tbarSlider.value = String(tbarRestValue);
        return;
    }

    tbarTransitionProgress = progress;
}

// Tバー操作完了時の状態を確定する関数
function finalizeTbarTransitionFromSlider() {
    const sliderValue = Number(tbarSlider.value);

    if (tbarRestValue === 0 && sliderValue >= 100) {
        commitTbarTransition();
        return;
    }

    if (tbarRestValue === 100 && sliderValue <= 0) {
        commitTbarTransition();
        return;
    }

    cancelTbarTransition();
}

// Tバー遷移を確定する関数
function commitTbarTransition() {
    if (!isTbarTransitionActive) {
        tbarSlider.value = String(tbarRestValue);
        return;
    }

    const oldPgm = tbarTransitionFromIndex;
    pgmShotIndex = tbarTransitionToIndex;
    stbyShotIndex = oldPgm;

    isTbarTransitionActive = false;
    tbarTransitionFromIndex = -1;
    tbarTransitionToIndex = -1;
    tbarTransitionProgress = 0;
    tbarRestValue = tbarRestValue === 0 ? 100 : 0;
    tbarSlider.value = String(tbarRestValue);

    updateShotSelectionUI();
}

// Tバー遷移を取り消す関数
function cancelTbarTransition() {
    isTbarTransitionActive = false;
    tbarTransitionFromIndex = -1;
    tbarTransitionToIndex = -1;
    tbarTransitionProgress = 0;
    tbarSlider.value = String(tbarRestValue);
}

// コンテキストへショット映像を描画する関数
function drawShotImageToContext(ctx, videoElement, shot, canvasWidth, canvasHeight) {
    if (usingDummySource || !isVideoReady()) {
        drawDummyShot(ctx, canvasWidth, canvasHeight, shot);
        return;
    }

    ctx.drawImage(
        videoElement,
        shot.x,
        shot.y,
        shot.width,
        shot.height,
        0,
        0,
        canvasWidth,
        canvasHeight
    );
}

// PGM外部出力ウィンドウを開閉する関数
function togglePgmOutputWindow() {
    if (pgmOutputWindow && !pgmOutputWindow.closed) {
        closePgmOutputWindow();
        return;
    }

    openPgmOutputWindow();
}

// PGM外部出力ウィンドウを開く関数
function openPgmOutputWindow() {
    pgmOutputWindow = window.open("", "pgm-output-window", "width=1280,height=720");

    if (!pgmOutputWindow) {
        console.warn("[switcher.js] PGM外部出力ウィンドウを開けませんでした。ポップアップブロックを確認してください。");
        return;
    }

    pgmOutputWindow.document.open();
    pgmOutputWindow.document.write(`
<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <title>PGM Output</title>
    <style>
        html, body {
            margin: 0;
            padding: 0;
            width: 100%;
            height: 100%;
            background: #000000;
            overflow: hidden;
        }

        body {
            display: flex;
            align-items: center;
            justify-content: center;
        }

        #pgm-output-canvas {
            display: block;
            background: #000000;
        }
    </style>
</head>
<body>
    <canvas id="pgm-output-canvas"></canvas>
</body>
</html>
    `);
    pgmOutputWindow.document.close();

    pgmOutputCanvas = pgmOutputWindow.document.getElementById("pgm-output-canvas");
    if (!pgmOutputCanvas) {
        closePgmOutputWindow();
        return;
    }

    pgmOutputContext = pgmOutputCanvas.getContext("2d");
    syncPgmOutputWindowSize();

    pgmOutputWindow.addEventListener("resize", () => {
        syncPgmOutputWindowSize();
    });

    pgmOutputWindow.addEventListener("beforeunload", () => {
        pgmOutputWindow = null;
        pgmOutputCanvas = null;
        pgmOutputContext = null;
    });

    updatePgmOutputWindow();
}

// PGM外部出力ウィンドウを閉じる関数
function closePgmOutputWindow() {
    if (pgmOutputWindow && !pgmOutputWindow.closed) {
        pgmOutputWindow.close();
    }

    pgmOutputWindow = null;
    pgmOutputCanvas = null;
    pgmOutputContext = null;
}

// PGM外部出力ウィンドウのサイズを同期する関数
function syncPgmOutputWindowSize() {
    if (!pgmOutputWindow || pgmOutputWindow.closed || !pgmOutputCanvas) {
        return;
    }

    const outputWidth = Math.max(1, pgmOutputWindow.innerWidth);
    const outputHeight = Math.max(1, pgmOutputWindow.innerHeight);
    const outputDevicePixelRatio = Math.max(1, pgmOutputWindow.devicePixelRatio || window.devicePixelRatio || 1);

    const targetAspect = 16 / 9;
    let drawWidth = outputWidth;
    let drawHeight = Math.round(drawWidth / targetAspect);

    if (drawHeight > outputHeight) {
        drawHeight = outputHeight;
        drawWidth = Math.round(drawHeight * targetAspect);
    }

    pgmOutputCanvas.width = Math.max(1, Math.round(drawWidth * outputDevicePixelRatio));
    pgmOutputCanvas.height = Math.max(1, Math.round(drawHeight * outputDevicePixelRatio));
    pgmOutputCanvas.style.width = `${drawWidth}px`;
    pgmOutputCanvas.style.height = `${drawHeight}px`;

    if (pgmOutputContext) {
        pgmOutputContext.imageSmoothingEnabled = true;
        pgmOutputContext.imageSmoothingQuality = "high";
    }
}

// PGM外部出力ウィンドウへ高品質な現在PGMを描画する関数
function updatePgmOutputWindow() {
    if (!pgmOutputWindow || pgmOutputWindow.closed || !pgmOutputCanvas || !pgmOutputContext) {
        return;
    }

    if (pgmOutputCanvas.width <= 0 || pgmOutputCanvas.height <= 0) {
        syncPgmOutputWindowSize();
    }

    renderCurrentPgmToCanvas(pgmOutputCanvas);
}

// トリミング編集ビューのマウス操作を登録する関数
function setupEditorMouseHandlers() {
    editorCanvas.addEventListener("mousedown", onEditorMouseDown);
    window.addEventListener("mousemove", onEditorMouseMove);
    window.addEventListener("mouseup", onEditorMouseUp);
    editorCanvas.addEventListener("mouseleave", onEditorMouseLeave);
}

// トリミング編集ビュー上のマウス押下を処理する関数
function onEditorMouseDown(event) {
    if (!shots || shots.length === 0) {
        return;
    }

    const pointer = getEditorPointerPosition(event);
    const hitResult = findShotAtEditorPosition(pointer.x, pointer.y);

    if (hitResult.index === -1) {
        editorCanvas.style.cursor = "default";
        return;
    }

    editorSelectedShotIndex = hitResult.index;
    draggingShotIndex = hitResult.index;
    isDraggingEditorShot = true;

    const shot = shots[hitResult.index];
    const scaleX = editorCanvas.width / sourceWidth;
    const scaleY = editorCanvas.height / sourceHeight;

    const drawX = shot.x * scaleX;
    const drawY = shot.y * scaleY;
    const drawWidth = shot.width * scaleX;
    const drawHeight = shot.height * scaleY;

    if (hitResult.handle) {
        editorDragMode = "resize";
        resizeHandlePosition = hitResult.handle;

        if (hitResult.handle === "nw") {
            resizeAnchorX = drawX + drawWidth;
            resizeAnchorY = drawY + drawHeight;
        } else if (hitResult.handle === "ne") {
            resizeAnchorX = drawX;
            resizeAnchorY = drawY + drawHeight;
        } else if (hitResult.handle === "sw") {
            resizeAnchorX = drawX + drawWidth;
            resizeAnchorY = drawY;
        } else {
            resizeAnchorX = drawX;
            resizeAnchorY = drawY;
        }

        editorCanvas.style.cursor = getCursorForHandle(hitResult.handle);
        return;
    }

    if (hitResult.edge) {
        editorDragMode = "move";
        dragOffsetX = pointer.x - drawX;
        dragOffsetY = pointer.y - drawY;
        editorCanvas.style.cursor = "grabbing";
        return;
    }

    isDraggingEditorShot = false;
    draggingShotIndex = -1;
    editorDragMode = "";
    editorCanvas.style.cursor = "default";
}

// トリミング編集ビュー上のマウス移動を処理する関数
function onEditorMouseMove(event) {
    if (!shots || shots.length === 0) {
        return;
    }

    const pointer = getEditorPointerPosition(event);

    if (isDraggingEditorShot && draggingShotIndex !== -1) {
        const shot = shots[draggingShotIndex];
        const scaleX = editorCanvas.width / sourceWidth;
        const scaleY = editorCanvas.height / sourceHeight;

        if (editorDragMode === "move") {
            const nextDrawX = pointer.x - dragOffsetX;
            const nextDrawY = pointer.y - dragOffsetY;

            const nextSourceX = nextDrawX / scaleX;
            const nextSourceY = nextDrawY / scaleY;

            shot.x = clamp(nextSourceX, 0, sourceWidth - shot.width);
            shot.y = clamp(nextSourceY, 0, sourceHeight - shot.height);
            editorCanvas.style.cursor = "grabbing";
            return;
        }

        if (editorDragMode === "resize") {
            resizeShotFromHandle(
                shot,
                resizeHandlePosition,
                pointer.x,
                pointer.y,
                scaleX,
                scaleY
            );
            editorCanvas.style.cursor = getCursorForHandle(resizeHandlePosition);
            return;
        }
    }

    const hitResult = findShotAtEditorPosition(pointer.x, pointer.y);

    if (hitResult.handle) {
        editorCanvas.style.cursor = getCursorForHandle(hitResult.handle);
        return;
    }

    if (hitResult.edge) {
        editorCanvas.style.cursor = "grab";
        return;
    }

    editorCanvas.style.cursor = "default";
}

// トリミング編集ビュー上のマウス解放を処理する関数
function onEditorMouseUp(event) {
    isDraggingEditorShot = false;
    draggingShotIndex = -1;
    editorDragMode = "";
    resizeHandlePosition = "";

    if (!event) {
        editorCanvas.style.cursor = "default";
        return;
    }

    const pointer = getEditorPointerPosition(event);
    const hitResult = findShotAtEditorPosition(pointer.x, pointer.y);

    if (hitResult.handle) {
        editorCanvas.style.cursor = getCursorForHandle(hitResult.handle);
    } else if (hitResult.edge) {
        editorCanvas.style.cursor = "grab";
    } else {
        editorCanvas.style.cursor = "default";
    }
}

// トリミング編集ビューからマウスが外れた時の処理を行う関数
function onEditorMouseLeave() {
    if (!isDraggingEditorShot) {
        editorCanvas.style.cursor = "default";
    }
}

// トリミング編集ビュー上のポインタ座標を取得する関数
function getEditorPointerPosition(event) {
    const rect = editorCanvas.getBoundingClientRect();
    const scaleX = editorCanvas.width / rect.width;
    const scaleY = editorCanvas.height / rect.height;

    return {
        x: (event.clientX - rect.left) * scaleX,
        y: (event.clientY - rect.top) * scaleY
    };
}

// トリミング編集ビュー上でヒットしたショット情報を返す関数
function findShotAtEditorPosition(canvasX, canvasY) {
    const scaleX = editorCanvas.width / sourceWidth;
    const scaleY = editorCanvas.height / sourceHeight;

    if (editorSelectedShotIndex >= 0 && editorSelectedShotIndex < shots.length) {
        const selectedShot = shots[editorSelectedShotIndex];
        const selectedDrawX = selectedShot.x * scaleX;
        const selectedDrawY = selectedShot.y * scaleY;
        const selectedDrawWidth = selectedShot.width * scaleX;
        const selectedDrawHeight = selectedShot.height * scaleY;

        const selectedHandle = getResizeHandleAtPosition(
            canvasX,
            canvasY,
            selectedDrawX,
            selectedDrawY,
            selectedDrawWidth,
            selectedDrawHeight
        );

        if (selectedHandle) {
            return {
                index: editorSelectedShotIndex,
                handle: selectedHandle,
                edge: false
            };
        }

        if (
            isPointOnShotEdge(
                canvasX,
                canvasY,
                selectedDrawX,
                selectedDrawY,
                selectedDrawWidth,
                selectedDrawHeight
            )
        ) {
            return {
                index: editorSelectedShotIndex,
                handle: "",
                edge: true
            };
        }
    }

    for (let i = shots.length - 1; i >= 0; i -= 1) {
        if (i === editorSelectedShotIndex) {
            continue;
        }

        const shot = shots[i];
        const drawX = shot.x * scaleX;
        const drawY = shot.y * scaleY;
        const drawWidth = shot.width * scaleX;
        const drawHeight = shot.height * scaleY;

        if (
            isPointOnShotEdge(
                canvasX,
                canvasY,
                drawX,
                drawY,
                drawWidth,
                drawHeight
            )
        ) {
            return {
                index: i,
                handle: "",
                edge: true
            };
        }
    }

    return {
        index: -1,
        handle: "",
        edge: false
    };
}

// トリミング枠のリサイズハンドルを描画する関数
function drawEditorResizeHandles(ctx, drawX, drawY, drawWidth, drawHeight, strokeColor) {
    const handleSize = EDITOR_HANDLE_SIZE;
    const half = handleSize / 2;
    const handlePositions = [
        { x: drawX, y: drawY },
        { x: drawX + drawWidth, y: drawY },
        { x: drawX, y: drawY + drawHeight },
        { x: drawX + drawWidth, y: drawY + drawHeight }
    ];

    handlePositions.forEach((position) => {
        ctx.fillStyle = "#ffffff";
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = 2;
        ctx.fillRect(position.x - half, position.y - half, handleSize, handleSize);
        ctx.strokeRect(position.x - half, position.y - half, handleSize, handleSize);
    });
}

// トリミング枠のハンドルヒット位置を返す関数
function getResizeHandleAtPosition(canvasX, canvasY, drawX, drawY, drawWidth, drawHeight) {
    const half = EDITOR_HANDLE_SIZE / 2;
    const handles = [
        { name: "nw", x: drawX, y: drawY },
        { name: "ne", x: drawX + drawWidth, y: drawY },
        { name: "sw", x: drawX, y: drawY + drawHeight },
        { name: "se", x: drawX + drawWidth, y: drawY + drawHeight }
    ];

    for (const handle of handles) {
        if (
            canvasX >= handle.x - half &&
            canvasX <= handle.x + half &&
            canvasY >= handle.y - half &&
            canvasY <= handle.y + half
        ) {
            return handle.name;
        }
    }

    return "";
}

// トリミング枠の辺ヒットを判定する関数
function isPointOnShotEdge(canvasX, canvasY, drawX, drawY, drawWidth, drawHeight) {
    const hitWidth = EDITOR_EDGE_HIT_WIDTH;
    const outerLeft = drawX - hitWidth / 2;
    const outerTop = drawY - hitWidth / 2;
    const outerRight = drawX + drawWidth + hitWidth / 2;
    const outerBottom = drawY + drawHeight + hitWidth / 2;

    const innerLeft = drawX + hitWidth / 2;
    const innerTop = drawY + hitWidth / 2;
    const innerRight = drawX + drawWidth - hitWidth / 2;
    const innerBottom = drawY + drawHeight - hitWidth / 2;

    const isInsideOuter =
        canvasX >= outerLeft &&
        canvasX <= outerRight &&
        canvasY >= outerTop &&
        canvasY <= outerBottom;

    const isInsideInner =
        canvasX >= innerLeft &&
        canvasX <= innerRight &&
        canvasY >= innerTop &&
        canvasY <= innerBottom;

    return isInsideOuter && !isInsideInner;
}

// トリミング枠リサイズ時のカーソルを返す関数
function getCursorForHandle(handle) {
    if (handle === "nw" || handle === "se") {
        return "nwse-resize";
    }

    if (handle === "ne" || handle === "sw") {
        return "nesw-resize";
    }

    return "default";
}

// トリミング枠の最小幅を返す関数
function getMinimumShotWidth() {
    return Math.max(160, Math.round(sourceWidth * 0.12));
}

// トリミング枠の最小高さを返す関数
function getMinimumShotHeight() {
    return Math.round(getMinimumShotWidth() / SHOT_ASPECT_RATIO);
}

// リサイズハンドル操作でトリミング枠を更新する関数
function resizeShotFromHandle(shot, handle, pointerCanvasX, pointerCanvasY, scaleX, scaleY) {
    const minWidth = getMinimumShotWidth();
    const minHeight = getMinimumShotHeight();

    const anchorSourceX = resizeAnchorX / scaleX;
    const anchorSourceY = resizeAnchorY / scaleY;
    const pointerSourceX = pointerCanvasX / scaleX;
    const pointerSourceY = pointerCanvasY / scaleY;

    let nextWidth = Math.abs(anchorSourceX - pointerSourceX);
    let nextHeight = nextWidth / SHOT_ASPECT_RATIO;

    if (nextWidth < minWidth) {
        nextWidth = minWidth;
        nextHeight = minHeight;
    }

    if (handle === "nw") {
        shot.width = nextWidth;
        shot.height = nextHeight;
        shot.x = anchorSourceX - shot.width;
        shot.y = anchorSourceY - shot.height;
    } else if (handle === "ne") {
        shot.width = nextWidth;
        shot.height = nextHeight;
        shot.x = anchorSourceX;
        shot.y = anchorSourceY - shot.height;
    } else if (handle === "sw") {
        shot.width = nextWidth;
        shot.height = nextHeight;
        shot.x = anchorSourceX - shot.width;
        shot.y = anchorSourceY;
    } else if (handle === "se") {
        shot.width = nextWidth;
        shot.height = nextHeight;
        shot.x = anchorSourceX;
        shot.y = anchorSourceY;
    }

    constrainShotToSourceBounds(shot);
}

// トリミング枠を入力映像範囲内へ収める関数
function constrainShotToSourceBounds(shot) {
    const minWidth = getMinimumShotWidth();
    const maxWidth = sourceWidth;
    let width = clamp(shot.width, minWidth, maxWidth);
    let height = width / SHOT_ASPECT_RATIO;

    if (height > sourceHeight) {
        height = sourceHeight;
        width = height * SHOT_ASPECT_RATIO;
    }

    shot.width = width;
    shot.height = height;
    shot.x = clamp(shot.x, 0, sourceWidth - shot.width);
    shot.y = clamp(shot.y, 0, sourceHeight - shot.height);
}

// 値を範囲内に収める関数
function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

// 初期化を実行する関数
window.addEventListener("DOMContentLoaded", () => {
    initSwitcher();
});