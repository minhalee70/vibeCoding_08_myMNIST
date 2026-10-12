/**
 * 손글씨 AI 인식기 (QuickScribe AI)
 * 마우스 필기 인식 및 28x28 MNIST 전처리 엔진
 */

// ==========================================================================
// 1. 상태 관리 (State)
// ==========================================================================
const state = {
  isModelReady: false,
  model: null,
  isDrawing: false,
  tool: 'pen', // 'pen' | 'eraser'
  brushSize: 22,
  hasContent: false,
  undoStack: [],
  maxUndo: 15,
  history: []
};

// ==========================================================================
// 2. DOM 요소 참조
// ==========================================================================
const canvasBox = document.getElementById('canvasBox');
const canvas = document.getElementById('paintCanvas');
const ctx = canvas.getContext('2d', { willReadFrequently: true });
const emptyHint = document.getElementById('canvasEmptyHint');
const brushCursor = document.getElementById('brushCursor');

const modelStatus = document.getElementById('modelStatus');
const modelStatusText = document.getElementById('modelStatusText');
const themeToggleBtn = document.getElementById('themeToggleBtn');
const themeIcon = document.getElementById('themeIcon');

const penToolBtn = document.getElementById('penToolBtn');
const eraserToolBtn = document.getElementById('eraserToolBtn');
const strokeBtns = document.querySelectorAll('.stroke-btn');
const undoBtn = document.getElementById('undoBtn');
const clearBtn = document.getElementById('clearBtn');
const predictBtn = document.getElementById('predictBtn');
const predictBtnText = document.getElementById('predictBtnText');

const resultPlaceholder = document.getElementById('resultPlaceholder');
const resultDisplay = document.getElementById('resultDisplay');
const predictedDigit = document.getElementById('predictedDigit');
const confidencePercent = document.getElementById('confidencePercent');
const confidenceTag = document.getElementById('confidenceTag');
const assessmentText = document.getElementById('assessmentText');
const copyResultBtn = document.getElementById('copyResultBtn');
const copyBtnText = document.getElementById('copyBtnText');

const visionCanvas = document.getElementById('visionCanvas');
const chartBars = document.getElementById('chartBars');
const historyChips = document.getElementById('historyChips');
const clearHistoryBtn = document.getElementById('clearHistoryBtn');
const toastEl = document.getElementById('toast');

// ==========================================================================
// 3. 초기화 & 캔버스 설정
// ==========================================================================
function initCanvas() {
  // 캔버스 기본 배경을 흰색으로 초기화
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  saveCanvasState();
  initProbabilityBars();
}

// 0부터 9까지의 빈 차트 막대 미리 생성
function initProbabilityBars() {
  chartBars.innerHTML = '';
  for (let i = 0; i <= 9; i++) {
    const row = document.createElement('div');
    row.className = 'bar-row';
    row.id = `bar-row-${i}`;
    row.innerHTML = `
      <span class="bar-label">${i}</span>
      <div class="bar-track">
        <div class="bar-fill" id="bar-fill-${i}"></div>
      </div>
      <span class="bar-percent" id="bar-val-${i}">0.0%</span>
    `;
    chartBars.appendChild(row);
  }
}

// ==========================================================================
// 4. AI 모델 로드 (TensorFlow.js)
// ==========================================================================
async function loadAIModel() {
  try {
    modelStatusText.textContent = 'AI 엔진 불러오는 중...';
    
    // 로컬 model/model.json 로드
    state.model = await tf.loadLayersModel('model/model.json');
    
    // 워밍업 (더미 예측 실행으로 첫 추론 렉 방지)
    const dummy = tf.zeros([1, 28, 28, 1]);
    const warmupResult = state.model.predict(dummy);
    warmupResult.dispose();
    dummy.dispose();

    state.isModelReady = true;
    modelStatus.className = 'status-badge ready';
    modelStatusText.textContent = 'AI 준비 완료 (CNN)';
    updatePredictButtonState();
    showToast('AI 모델이 성공적으로 준비되었습니다!');
  } catch (err) {
    console.error('모델 로드 실패:', err);
    modelStatus.className = 'status-badge error';
    modelStatusText.textContent = '모델 로드 실패';
    showToast('AI 모델 로드에 실패했습니다. 페이지를 새로고침 해주세요.');
  }
}

// ==========================================================================
// 5. 마우스 그리기 인터랙션
// ==========================================================================
let lastX = 0;
let lastY = 0;

function getMousePos(e) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = canvas.width / rect.width;
  const scaleY = canvas.height / rect.height;
  return {
    x: (e.clientX - rect.left) * scaleX,
    y: (e.clientY - rect.top) * scaleY,
    clientX: e.clientX - rect.left,
    clientY: e.clientY - rect.top
  };
}

function startDrawing(e) {
  state.isDrawing = true;
  canvasBox.classList.add('drawing');
  const pos = getMousePos(e);
  lastX = pos.x;
  lastY = pos.y;

  // 단일 점 클릭 시에도 점 그리기
  drawSegment(pos.x, pos.y);
  setHasContent(true);
}

function drawSegment(x, y) {
  ctx.beginPath();
  ctx.moveTo(lastX, lastY);
  ctx.lineTo(x, y);

  if (state.tool === 'pen') {
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = state.brushSize;
  } else {
    // 지우개는 흰색으로 덮어씀
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = state.brushSize * 1.5;
  }

  ctx.stroke();
  lastX = x;
  lastY = y;
}

function draw(e) {
  const pos = getMousePos(e);
  updateBrushCursor(pos.clientX, pos.clientY);

  if (!state.isDrawing) return;
  drawSegment(pos.x, pos.y);
  setHasContent(true);
}

function stopDrawing() {
  if (state.isDrawing) {
    state.isDrawing = false;
    canvasBox.classList.remove('drawing');
    saveCanvasState();
  }
}

// 커서 가이드 업데이트
function updateBrushCursor(x, y) {
  brushCursor.style.display = 'block';
  brushCursor.style.left = `${x}px`;
  brushCursor.style.top = `${y}px`;
  const size = state.tool === 'pen' ? state.brushSize : state.brushSize * 1.5;
  brushCursor.style.width = `${size}px`;
  brushCursor.style.height = `${size}px`;
}

canvasBox.addEventListener('mouseenter', () => {
  brushCursor.style.display = 'block';
});

canvasBox.addEventListener('mouseleave', () => {
  brushCursor.style.display = 'none';
  stopDrawing();
});

// 마우스 이벤트 연결
canvas.addEventListener('mousedown', startDrawing);
canvas.addEventListener('mousemove', draw);
window.addEventListener('mouseup', stopDrawing);

// 모바일/태블릿 터치 지원 (호환성)
canvas.addEventListener('touchstart', (e) => {
  if (e.touches.length === 1) {
    e.preventDefault();
    const touch = e.touches[0];
    startDrawing(touch);
  }
}, { passive: false });

canvas.addEventListener('touchmove', (e) => {
  if (e.touches.length === 1) {
    e.preventDefault();
    const touch = e.touches[0];
    draw(touch);
  }
}, { passive: false });

window.addEventListener('touchend', stopDrawing);

// ==========================================================================
// 6. 스케치북 도구 및 제어 (지우기, 취소, 굵기)
// ==========================================================================
function setHasContent(val) {
  state.hasContent = val;
  if (val) {
    emptyHint.classList.add('hidden');
  } else {
    emptyHint.classList.remove('hidden');
  }
  updatePredictButtonState();
}

function updatePredictButtonState() {
  predictBtn.disabled = !state.isModelReady || !state.hasContent;
}

function saveCanvasState() {
  if (state.undoStack.length >= state.maxUndo) {
    state.undoStack.shift();
  }
  state.undoStack.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
}

function undo() {
  if (state.undoStack.length > 1) {
    state.undoStack.pop(); // 현재 상태 제거
    const prev = state.undoStack[state.undoStack.length - 1];
    ctx.putImageData(prev, 0, 0);
    checkIfCanvasIsEmpty();
    showToast('마지막 획을 취소했습니다.');
  }
}

function checkIfCanvasIsEmpty() {
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  let hasDark = false;
  for (let i = 0; i < data.length; i += 16) {
    if (data[i] < 230) {
      hasDark = true;
      break;
    }
  }
  setHasContent(hasDark);
}

function clearCanvas() {
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  setHasContent(false);
  saveCanvasState();
  
  // 결과 패널 초기화
  resultPlaceholder.classList.remove('hidden');
  resultDisplay.classList.add('hidden');
  initProbabilityBars();

  // 28x28 시선 캔버스 초기화
  const vCtx = visionCanvas.getContext('2d');
  vCtx.fillStyle = '#000000';
  vCtx.fillRect(0, 0, 28, 28);
}

// 툴바 버튼 이벤트 연결
penToolBtn.addEventListener('click', () => {
  state.tool = 'pen';
  penToolBtn.classList.add('active');
  eraserToolBtn.classList.remove('active');
});

eraserToolBtn.addEventListener('click', () => {
  state.tool = 'eraser';
  eraserToolBtn.classList.add('active');
  penToolBtn.classList.remove('active');
});

strokeBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    strokeBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    state.brushSize = parseInt(btn.dataset.size, 10);
  });
});

undoBtn.addEventListener('click', undo);
clearBtn.addEventListener('click', clearCanvas);

// ==========================================================================
// 7. 핵심 AI 전처리 파이프라인 (MNIST 질량 중심 정렬)
// ==========================================================================
function preprocessCanvas() {
  const imgData = ctx.getImageData(0, 0, 280, 280);
  const data = imgData.data;

  // 1. 손글씨가 그려진 영역의 외곽 경계(Bounding Box) 탐색
  let minX = 280, minY = 280, maxX = 0, maxY = 0;
  let foundPixel = false;

  for (let y = 0; y < 280; y++) {
    for (let x = 0; x < 280; x++) {
      const idx = (y * 280 + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const brightness = (r + g + b) / 3;

      // 흰색(255)이 아닌 어두운 선 픽셀 감지
      if (brightness < 220) {
        foundPixel = true;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (!foundPixel) return null;

  // 약간의 여백(Padding) 추가
  const pad = 12;
  minX = Math.max(0, minX - pad);
  minY = Math.max(0, minY - pad);
  maxX = Math.min(279, maxX + pad);
  maxY = Math.min(279, maxY + pad);

  const boxW = maxX - minX + 1;
  const boxH = maxY - minY + 1;

  // 2. 글자 영역 크롭(잘라내기)
  const cropCanvas = document.createElement('canvas');
  cropCanvas.width = boxW;
  cropCanvas.height = boxH;
  const cropCtx = cropCanvas.getContext('2d');
  cropCtx.drawImage(canvas, minX, minY, boxW, boxH, 0, 0, boxW, boxH);

  // 3. 종횡비를 유지하며 20x20 크기 안에 맞게 축소
  let targetW, targetH;
  if (boxW > boxH) {
    targetW = 20;
    targetH = Math.max(1, Math.round((boxH / boxW) * 20));
  } else {
    targetH = 20;
    targetW = Math.max(1, Math.round((boxW / boxH) * 20));
  }

  const scaleCanvas = document.createElement('canvas');
  scaleCanvas.width = targetW;
  scaleCanvas.height = targetH;
  const scaleCtx = scaleCanvas.getContext('2d');
  scaleCtx.imageSmoothingEnabled = true;
  scaleCtx.imageSmoothingQuality = 'high';
  scaleCtx.drawImage(cropCanvas, 0, 0, targetW, targetH);

  // 4. 색상 반전 (흰 바탕/검은 펜 -> 검은 바탕/흰 펜 MNIST 규격)
  const sData = scaleCtx.getImageData(0, 0, targetW, targetH).data;
  const digitImg = scaleCtx.createImageData(targetW, targetH);
  for (let i = 0; i < targetW * targetH; i++) {
    const avg = (sData[i * 4] + sData[i * 4 + 1] + sData[i * 4 + 2]) / 3;
    const inverted = 255 - avg; // 반전 밝기
    digitImg.data[i * 4] = inverted;
    digitImg.data[i * 4 + 1] = inverted;
    digitImg.data[i * 4 + 2] = inverted;
    digitImg.data[i * 4 + 3] = 255;
  }

  // 5. 28x28 캔버스 중앙에 임시 배치
  const temp28 = document.createElement('canvas');
  temp28.width = 28;
  temp28.height = 28;
  const tCtx = temp28.getContext('2d');
  tCtx.fillStyle = '#000000';
  tCtx.fillRect(0, 0, 28, 28);

  const startX = Math.floor((28 - targetW) / 2);
  const startY = Math.floor((28 - targetH) / 2);
  tCtx.putImageData(digitImg, startX, startY);

  // 6. 픽셀 질량 중심(Center of Mass) 계산
  const tData = tCtx.getImageData(0, 0, 28, 28).data;
  let totalMass = 0, sumX = 0, sumY = 0;
  for (let y = 0; y < 28; y++) {
    for (let x = 0; x < 28; x++) {
      const val = tData[(y * 28 + x) * 4];
      if (val > 15) {
        totalMass += val;
        sumX += x * val;
        sumY += y * val;
      }
    }
  }

  // 질량 중심을 (13.5, 13.5)에 맞추기 위한 이동 벡터
  let shiftX = 0, shiftY = 0;
  if (totalMass > 0) {
    const cX = sumX / totalMass;
    const cY = sumY / totalMass;
    shiftX = Math.round(13.5 - cX);
    shiftY = Math.round(13.5 - cY);
    // 오차가 너무 크면 캔버스 밖으로 나가지 않도록 완화
    shiftX = Math.max(-3, Math.min(3, shiftX));
    shiftY = Math.max(-3, Math.min(3, shiftY));
  }

  // 7. 최종 28x28 시선 캔버스에 그리기
  const vCtx = visionCanvas.getContext('2d');
  vCtx.fillStyle = '#000000';
  vCtx.fillRect(0, 0, 28, 28);
  vCtx.drawImage(temp28, shiftX, shiftY);

  // 8. 0.0 ~ 1.0 정규화된 1차원 배열 반환
  const finalData = vCtx.getImageData(0, 0, 28, 28).data;
  const floatArr = new Float32Array(28 * 28);
  for (let i = 0; i < 28 * 28; i++) {
    floatArr[i] = finalData[i * 4] / 255.0;
  }

  return floatArr;
}

// ==========================================================================
// 8. 숫자 인식 추론 (Predict)
// ==========================================================================
async function recognizeDigit() {
  if (!state.isModelReady || !state.hasContent) return;

  predictBtn.disabled = true;
  predictBtnText.textContent = '분석하는 중...';

  try {
    // 1. 전처리 실행
    const inputData = preprocessCanvas();
    if (!inputData) {
      showToast('인식할 손글씨를 찾을 수 없습니다.');
      predictBtn.disabled = false;
      predictBtnText.textContent = '숫자 인식하기';
      return;
    }

    // 2. TensorFlow 텐서 생성 [1, 28, 28, 1]
    const tensor = tf.tensor4d(inputData, [1, 28, 28, 1]);
    
    // 3. AI 모델 예측
    const prediction = state.model.predict(tensor);
    const probabilities = await prediction.data();
    tensor.dispose();
    prediction.dispose();

    // 4. 최고 확률 숫자 및 결과 분석
    let bestIndex = 0;
    let maxProb = probabilities[0];

    for (let i = 1; i < probabilities.length; i++) {
      if (probabilities[i] > maxProb) {
        maxProb = probabilities[i];
        bestIndex = i;
      }
    }

    // 5. 화면 결과 렌더링
    renderPredictionResults(bestIndex, maxProb, probabilities);

    // 6. 히스토리에 기록
    addHistoryRecord(bestIndex, maxProb);

  } catch (err) {
    console.error('추론 에러:', err);
    showToast('인식 처리 중 오류가 발생했습니다.');
  } finally {
    predictBtn.disabled = false;
    predictBtnText.textContent = '숫자 인식하기';
  }
}

function renderPredictionResults(bestDigit, maxProb, probabilities) {
  // 결과 표시 영역 노출
  resultPlaceholder.classList.add('hidden');
  resultDisplay.classList.remove('hidden');

  // 메인 숫자 및 확률
  predictedDigit.textContent = bestDigit;
  const percentText = (maxProb * 100).toFixed(1) + '%';
  confidencePercent.textContent = percentText;

  // 신뢰도에 따른 스타일 및 문구
  if (maxProb >= 0.90) {
    confidenceTag.className = 'confidence-tag';
    assessmentText.textContent = '매우 높은 신뢰도 🎯';
  } else if (maxProb >= 0.70) {
    confidenceTag.className = 'confidence-tag';
    assessmentText.textContent = '꽤 유력한 예측 👍';
  } else if (maxProb >= 0.50) {
    confidenceTag.className = 'confidence-tag medium';
    assessmentText.textContent = '조금 헷갈려요 🤔';
  } else {
    confidenceTag.className = 'confidence-tag low';
    assessmentText.textContent = '글씨를 다시 써보세요 ✍️';
  }

  // 0 ~ 9 확률 분포 막대 업데이트
  for (let i = 0; i <= 9; i++) {
    const prob = probabilities[i];
    const fill = document.getElementById(`bar-fill-${i}`);
    const val = document.getElementById(`bar-val-${i}`);
    const row = document.getElementById(`bar-row-${i}`);

    const percent = (prob * 100).toFixed(1);
    fill.style.width = `${Math.min(100, Math.max(1, percent))}%`;
    val.textContent = `${percent}%`;

    if (i === bestDigit) {
      row.classList.add('top');
    } else {
      row.classList.remove('top');
    }
  }
}

// ==========================================================================
// 9. 최근 기록 (History) 및 복사 기능
// ==========================================================================
function addHistoryRecord(digit, prob) {
  const item = {
    digit,
    percent: (prob * 100).toFixed(1),
    time: new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  };

  state.history.unshift(item);
  if (state.history.length > 8) state.history.pop();
  renderHistoryChips();
}

function renderHistoryChips() {
  if (state.history.length === 0) {
    historyChips.innerHTML = '<span class="history-empty">아직 인식된 기록이 없습니다.</span>';
    return;
  }

  historyChips.innerHTML = '';
  state.history.forEach((item) => {
    const chip = document.createElement('div');
    chip.className = 'hist-chip';
    chip.title = `${item.time} 인식 결과`;
    chip.innerHTML = `
      <span class="hist-digit">${item.digit}</span>
      <span class="hist-score">${item.percent}%</span>
    `;
    historyChips.appendChild(chip);
  });
}

clearHistoryBtn.addEventListener('click', () => {
  state.history = [];
  renderHistoryChips();
  showToast('인식 기록을 비웠습니다.');
});

// 복사 버튼
copyResultBtn.addEventListener('click', async () => {
  const digit = predictedDigit.textContent;
  try {
    await navigator.clipboard.writeText(digit);
    copyBtnText.textContent = '복사 완료!';
    showToast(`숫자 '${digit}'이(가) 클립보드에 복사되었습니다.`);
    setTimeout(() => {
      copyBtnText.textContent = '숫자 복사';
    }, 2000);
  } catch (err) {
    showToast('복사에 실패했습니다.');
  }
});

// ==========================================================================
// 10. 샘플 숫자 그리기 (원클릭 테스트)
// ==========================================================================
const sampleGlyphs = {
  0: [[140, 50], [80, 100], [70, 160], [100, 220], [140, 230], [180, 220], [210, 160], [200, 100], [140, 50]],
  1: [[115, 80], [140, 50], [140, 230], [110, 230], [170, 230]],
  2: [[85, 90], [115, 55], [165, 55], [195, 90], [190, 130], [140, 180], [85, 230], [200, 230]],
  3: [[85, 70], [185, 70], [135, 125], [185, 160], [185, 205], [140, 230], [85, 215]],
  4: [[170, 50], [90, 160], [205, 160], [170, 110], [170, 230]],
  5: [[185, 60], [105, 60], [100, 125], [150, 120], [190, 150], [185, 205], [135, 230], [85, 215]],
  7: [[80, 60], [200, 60], [145, 150], [120, 230]],
  8: [[140, 60], [110, 85], [110, 120], [140, 140], [170, 165], [170, 205], [140, 230], [105, 205], [105, 165], [140, 140], [170, 120], [170, 85], [140, 60]]
};

document.querySelectorAll('.chip').forEach(chip => {
  chip.addEventListener('click', () => {
    const num = chip.dataset.sample;
    drawSampleDigit(num);
  });
});

function drawSampleDigit(num) {
  clearCanvas();
  const path = sampleGlyphs[num];
  if (!path) return;

  ctx.lineWidth = 22;
  ctx.strokeStyle = '#000000';
  ctx.beginPath();
  ctx.moveTo(path[0][0], path[0][1]);

  for (let i = 1; i < path.length; i++) {
    ctx.lineTo(path[i][0], path[i][1]);
  }
  ctx.stroke();

  setHasContent(true);
  saveCanvasState();
  showToast(`예시 숫자 '${num}'을(를) 그렸습니다.`);
}

// ==========================================================================
// 11. 단축키 & 테마 & 토스트
// ==========================================================================
predictBtn.addEventListener('click', recognizeDigit);

window.addEventListener('keydown', (e) => {
  // 모달이나 인풋이 아닐 때만 동작
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

  if (e.key === 'Enter') {
    e.preventDefault();
    recognizeDigit();
  } else if (e.key === 'c' || e.key === 'C') {
    e.preventDefault();
    clearCanvas();
    showToast('스케치북을 모두 지웠습니다.');
  } else if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) {
    e.preventDefault();
    undo();
  }
});

// 테마 토글 (라이트 / 다크)
themeToggleBtn.addEventListener('click', () => {
  const current = document.body.getAttribute('data-theme') || 'light';
  const next = current === 'light' ? 'dark' : 'light';
  document.body.setAttribute('data-theme', next);

  if (next === 'dark') {
    themeIcon.innerHTML = `
      <circle cx="12" cy="12" r="5"></circle>
      <line x1="12" y1="1" x2="12" y2="3"></line>
      <line x1="12" y1="21" x2="12" y2="23"></line>
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
      <line x1="1" y1="12" x2="3" y2="12"></line>
      <line x1="21" y1="12" x2="23" y2="12"></line>
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
    `;
    showToast('다크 모드로 전환되었습니다.');
  } else {
    themeIcon.innerHTML = `
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
    `;
    showToast('라이트 모드로 전환되었습니다.');
  }
});

let toastTimer = null;
function showToast(msg) {
  if (toastTimer) clearTimeout(toastTimer);
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  toastTimer = setTimeout(() => {
    toastEl.classList.remove('show');
  }, 2200);
}

// 실행 시작
initCanvas();
loadAIModel();
