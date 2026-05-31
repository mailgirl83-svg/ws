// app.js - Main Application controller for UI orchestration, scoring logic, and settings management. (Pitch-Only, Webcam-Default, Light-Theme Version)

document.addEventListener('DOMContentLoaded', () => {
  // Initialize Core Engines
  const tracker = new BaseballTracker('overlay-canvas', 'camera-video');
  const aiReferee = new GeminiReferee();
  
  // Game State variables
  let gameState = {
    teamAName: localStorage.getItem('team_a_name') || '홈런 키즈',
    teamBName: localStorage.getItem('team_b_name') || '단소 타이거즈',
    teamAColor: localStorage.getItem('team_a_color') || '#2563eb',
    teamBColor: localStorage.getItem('team_b_color') || '#ef233c',
    teamAScore: parseInt(localStorage.getItem('team_a_score')) || 0,
    teamBScore: parseInt(localStorage.getItem('team_b_score')) || 0,
    inning: parseInt(localStorage.getItem('game_inning')) || 1,
    isTop: localStorage.getItem('game_is_top') === 'false' ? false : true, // true = 초 (top), false = 말 (bottom)
    strikes: 0,
    balls: 0,
    outs: 0,
    logs: JSON.parse(localStorage.getItem('var_pitch_logs')) || []
  };

  // DOM Elements
  const elTeamAName = document.getElementById('team-a-name');
  const elTeamBName = document.getElementById('team-b-name');
  const elTeamAScore = document.getElementById('team-a-score');
  const elTeamBScore = document.getElementById('team-b-score');
  const elInningVal = document.getElementById('inning-val');
  
  const elStrikeDots = document.querySelectorAll('#strike-row .count-dot');
  const elBallDots = document.querySelectorAll('#ball-row .count-dot');
  const elOutDots = document.querySelectorAll('#out-row .count-dot');
  
  const elHeightSlider = document.getElementById('height-slider');
  const elHeightValue = document.getElementById('height-value');
  
  const elPitchLogList = document.getElementById('pitch-log-list');
  const elLogCount = document.getElementById('log-count');
  
  const elGeminiComment = document.getElementById('gemini-comment');
  const elDecisionBanner = document.getElementById('decision-banner');
  const elSpeedOverlay = document.getElementById('speed-overlay');
  
  // Settings Modal Elements
  const btnSettings = document.getElementById('btn-settings');
  const modalSettings = document.getElementById('modal-settings');
  const btnCloseModal = document.getElementById('btn-close-modal');
  const formSettings = document.getElementById('form-settings');
  
  // Set default form values
  document.getElementById('input-team-a').value = gameState.teamAName;
  document.getElementById('input-team-b').value = gameState.teamBName;
  document.getElementById('input-color-a').value = gameState.teamAColor;
  document.getElementById('input-color-b').value = gameState.teamBColor;
  document.getElementById('input-api-key').value = aiReferee.apiKey;

  // Apply CSS Custom Variables dynamically
  function applyTeamColors() {
    document.documentElement.style.setProperty('--team-a-color', gameState.teamAColor);
    document.documentElement.style.setProperty('--team-a-glow', gameState.teamAColor + '33'); // 20% alpha
    document.documentElement.style.setProperty('--team-b-color', gameState.teamBColor);
    document.documentElement.style.setProperty('--team-b-glow', gameState.teamBColor + '33');
  }

  // Update score board text
  function updateScoreboardUI() {
    elTeamAName.textContent = gameState.teamAName;
    elTeamBName.textContent = gameState.teamBName;
    elTeamAScore.textContent = gameState.teamAScore;
    elTeamBScore.textContent = gameState.teamBScore;
    
    const inningHalf = gameState.isTop ? '초' : '말';
    elInningVal.textContent = `${gameState.inning}회 ${inningHalf}`;
    
    // Update counter dots
    updateDots(elStrikeDots, gameState.strikes);
    updateDots(elBallDots, gameState.balls);
    updateDots(elOutDots, gameState.outs);
    
    applyTeamColors();
  }

  function updateDots(dotsList, count) {
    dotsList.forEach((dot, index) => {
      if (index < count) {
        dot.classList.add('active');
      } else {
        dot.classList.remove('active');
      }
    });
  }

  // Save state to local storage
  function saveState() {
    localStorage.setItem('team_a_name', gameState.teamAName);
    localStorage.setItem('team_b_name', gameState.teamBName);
    localStorage.setItem('team_a_color', gameState.teamAColor);
    localStorage.setItem('team_b_color', gameState.teamBColor);
    localStorage.setItem('team_a_score', gameState.teamAScore);
    localStorage.setItem('team_b_score', gameState.teamBScore);
    localStorage.setItem('game_inning', gameState.inning);
    localStorage.setItem('game_is_top', gameState.isTop);
    localStorage.setItem('var_pitch_logs', JSON.stringify(gameState.logs));
  }

  // Double Click to Edit Team Names on Scoreboard
  function makeEditable(element, stateKey) {
    element.addEventListener('dblclick', () => {
      const currentText = element.textContent;
      const input = document.createElement('input');
      input.type = 'text';
      input.value = currentText;
      input.className = 'team-name-input';
      
      element.replaceWith(input);
      input.focus();
      
      const finishEdit = () => {
        const newValue = input.value.trim() || currentText;
        gameState[stateKey] = newValue;
        saveState();
        
        const originalSpan = document.createElement('span');
        originalSpan.id = element.id;
        originalSpan.className = element.className;
        originalSpan.textContent = newValue;
        input.replaceWith(originalSpan);
        
        makeEditable(originalSpan, stateKey);
        updateScoreboardUI();
      };
      
      input.addEventListener('blur', finishEdit);
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') finishEdit();
      });
    });
  }

  makeEditable(elTeamAName, 'teamAName');
  makeEditable(elTeamBName, 'teamBName');

  // Interactive Score Clicking (Left click to increase, right click to decrease)
  elTeamAScore.addEventListener('click', (e) => {
    e.preventDefault();
    gameState.teamAScore++;
    saveState();
    updateScoreboardUI();
  });
  elTeamAScore.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (gameState.teamAScore > 0) gameState.teamAScore--;
    saveState();
    updateScoreboardUI();
  });

  elTeamBScore.addEventListener('click', (e) => {
    e.preventDefault();
    gameState.teamBScore++;
    saveState();
    updateScoreboardUI();
  });
  elTeamBScore.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    if (gameState.teamBScore > 0) gameState.teamBScore--;
    saveState();
    updateScoreboardUI();
  });

  // Manual Inning Click
  elInningVal.addEventListener('click', () => {
    if (gameState.isTop) {
      gameState.isTop = false;
    } else {
      gameState.isTop = true;
      gameState.inning++;
      if (gameState.inning > 9) {
        gameState.inning = 1;
      }
    }
    saveState();
    updateScoreboardUI();
  });

  // Height Slider update
  elHeightSlider.addEventListener('input', (e) => {
    const height = parseInt(e.target.value);
    elHeightValue.textContent = `${height}cm`;
    tracker.setBatterHeight(height);
  });

  // Modal Open/Close
  btnSettings.addEventListener('click', () => modalSettings.classList.add('open'));
  btnCloseModal.addEventListener('click', () => modalSettings.classList.remove('open'));
  modalSettings.addEventListener('click', (e) => {
    if (e.target === modalSettings) modalSettings.classList.remove('open');
  });

  // Modal Submit settings
  formSettings.addEventListener('submit', (e) => {
    e.preventDefault();
    gameState.teamAName = document.getElementById('input-team-a').value.trim() || '홈런 키즈';
    gameState.teamBName = document.getElementById('input-team-b').value.trim() || '단소 타이거즈';
    gameState.teamAColor = document.getElementById('input-color-a').value;
    gameState.teamBColor = document.getElementById('input-color-b').value;
    
    const key = document.getElementById('input-api-key').value.trim();
    aiReferee.setApiKey(key);
    
    saveState();
    updateScoreboardUI();
    modalSettings.classList.remove('open');
    showBannerAlert('설정 저장 완료', 'strike');
  });

  // Reset Game button
  document.getElementById('btn-reset-game').addEventListener('click', () => {
    if (confirm("정말로 경기 스코어와 아웃카운트를 초기화하시겠습니까?")) {
      gameState.teamAScore = 0;
      gameState.teamBScore = 0;
      gameState.inning = 1;
      gameState.isTop = true;
      gameState.strikes = 0;
      gameState.balls = 0;
      gameState.outs = 0;
      saveState();
      updateScoreboardUI();
      modalSettings.classList.remove('open');
      showBannerAlert('초기화 완료', 'strike');
    }
  });

  // Mode Selection: Webcam is default
  const tabSim = document.getElementById('tab-sim');
  const tabCam = document.getElementById('tab-cam');
  const cameraControls = document.getElementById('camera-controls');
  const simControls = document.getElementById('sim-controls');
  
  tabSim.addEventListener('click', () => {
    tabSim.classList.add('active');
    tabCam.classList.remove('active');
    cameraControls.style.display = 'none';
    simControls.style.display = 'flex';
    tracker.stopWebcamTracking();
    // User requested: Remove big banner alerts when swapping modes. Silently change.
  });

  tabCam.addEventListener('click', () => {
    tabCam.classList.add('active');
    tabSim.classList.remove('active');
    simControls.style.display = 'none';
    cameraControls.style.display = 'flex';
    tracker.startWebcamTracking();
    // User requested: Remove big banner alerts when swapping modes. Silently change.
  });

  // Canvas Click for color selection in Webcam Mode
  tracker.canvas.addEventListener('click', (e) => {
    if (!tracker.isTracking) return;
    const rect = tracker.canvas.getBoundingClientRect();
    const scaleX = tracker.canvas.width / rect.width;
    const scaleY = tracker.canvas.height / rect.height;
    
    const canvasX = Math.round((e.clientX - rect.left) * scaleX);
    const canvasY = Math.round((e.clientY - rect.top) * scaleY);
    
    tracker.setTargetColorFromCoordinates(canvasX, canvasY);
    showBannerAlert('트래킹 색상 지정', 'strike'); // Small banner flash
  });

  // Simulation Controls (Pitch only)
  document.getElementById('btn-sim-strike').addEventListener('click', () => {
    tracker.startSimulation('pitch', true, false, false);
  });
  document.getElementById('btn-sim-ball').addEventListener('click', () => {
    tracker.startSimulation('pitch', false, false, false);
  });
  document.getElementById('btn-sim-swing-miss').addEventListener('click', () => {
    tracker.startSimulation('pitch', true, true, false); 
  });
  document.getElementById('btn-sim-swing-foul').addEventListener('click', () => {
    tracker.startSimulation('pitch', true, true, true); 
  });

  // Replay Control triggers
  document.getElementById('btn-replay-slow').addEventListener('click', () => {
    tracker.startReplay(0.15); 
  });
  document.getElementById('btn-replay-norm').addEventListener('click', () => {
    tracker.startReplay(0.4); 
  });
  document.getElementById('btn-replay-stop').addEventListener('click', () => {
    tracker.stopReplay();
  });

  // Clear Logs
  document.getElementById('btn-clear-logs').addEventListener('click', () => {
    if (confirm("모든 투구 판독 로그를 삭제하시겠습니까?")) {
      gameState.logs = [];
      saveState();
      renderLogHistory();
    }
  });

  // Render Log History list
  function renderLogHistory() {
    elPitchLogList.innerHTML = '';
    elLogCount.textContent = gameState.logs.length;
    
    if (gameState.logs.length === 0) {
      elPitchLogList.innerHTML = `
        <div style="text-align: center; color: var(--color-sub); padding: 2rem 0; font-style: italic; font-size: 0.85rem;">
          기록된 플레이가 없습니다. 웹캠을 켜거나 시뮬레이터를 사용해보세요.
        </div>
      `;
      return;
    }
    
    const reversedLogs = [...gameState.logs].reverse();
    reversedLogs.forEach((log, index) => {
      const actualIdx = gameState.logs.length - index;
      const item = document.createElement('div');
      item.className = 'pitch-log-item';
      
      const speedTxt = log.speed ? `${log.speed.toFixed(1)} km/h` : 'N/A';
      const speedCategoryTxt = log.speedCategory ? `[${log.speedCategory === 'FAST' ? '빠른공' : '느린공'}]` : '';
      
      item.innerHTML = `
        <div class="pitch-log-left">
          <div class="pitch-index">#${actualIdx}</div>
          <div class="pitch-type-badge ${log.result}">${log.result.toUpperCase()}</div>
          <div class="pitch-details">
            <div class="pitch-desc">${log.description}</div>
            <div class="pitch-speed">${speedTxt} ${speedCategoryTxt}</div>
          </div>
        </div>
        <div class="pitch-log-right">
          <button class="btn-replay" title="슬로모션 재생">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"/>
            </svg>
          </button>
        </div>
      `;
      
      item.addEventListener('click', (e) => {
        showBannerAlert(`${log.result.toUpperCase()}`, log.result);
        if (log.geminiComment) {
          elGeminiComment.textContent = log.geminiComment;
          elGeminiComment.classList.remove('placeholder');
        }
      });
      
      item.querySelector('.btn-replay').addEventListener('click', (e) => {
        e.stopPropagation();
        if (log.playType === 'pitch') {
          const raw = log.raw;
          tracker.startSimulation('pitch', raw.isStrike, raw.isSwing, raw.isTouchBat);
        }
      });
      
      elPitchLogList.appendChild(item);
    });
  }

  // Banner Alerts on Canvas Overlay
  function showBannerAlert(text, resultClass) {
    elDecisionBanner.className = `decision-banner ${resultClass} visible`;
    elDecisionBanner.textContent = text;
    
    setTimeout(() => {
      elDecisionBanner.classList.remove('visible');
    }, 2800);
  }

  // Handle speed panel overlay
  function showSpeedMeter(speed, category) {
    elSpeedOverlay.querySelector('.speed-value').textContent = speed.toFixed(1);
    
    const tag = elSpeedOverlay.querySelector('.speed-tag');
    tag.textContent = category === 'FAST' ? '빠른공' : '느린공';
    tag.className = `speed-tag ${category.toLowerCase()}`;
    
    elSpeedOverlay.classList.add('visible');
    
    setTimeout(() => {
      elSpeedOverlay.classList.remove('visible');
    }, 4500);
  }

  // Automated Scoreboard Count Updater
  function updateScoreboardCounts(result) {
    if (result === 'strike') {
      gameState.strikes++;
      if (gameState.strikes >= 3) {
        gameState.strikes = 0;
        gameState.balls = 0;
        gameState.outs++;
        showBannerAlert('삼진 아웃', 'foul'); // using foul style purple/dark for out alerts
      }
    } else if (result === 'ball') {
      gameState.balls++;
      if (gameState.balls >= 4) {
        gameState.strikes = 0;
        gameState.balls = 0;
        showBannerAlert('볼넷 출루', 'strike'); 
      }
    } else if (result === 'foul') {
      if (gameState.strikes < 2) {
        gameState.strikes++;
      }
    }
    
    // 3 Outs = Inning change!
    if (gameState.outs >= 3) {
      gameState.outs = 0;
      gameState.strikes = 0;
      gameState.balls = 0;
      
      if (gameState.isTop) {
        gameState.isTop = false;
        showBannerAlert('공수 교대 (말)', 'foul');
      } else {
        gameState.isTop = true;
        gameState.inning++;
        showBannerAlert(`공수 교대 (${gameState.inning}회 초)`, 'foul');
      }
    }
    
    saveState();
    updateScoreboardUI();
  }

  // Listen to tracker play completion
  window.addEventListener('playCompleted', async (e) => {
    const detail = e.detail;
    const { result, description, speed, speedCategory, playType, raw } = detail;
    
    if (speed) {
      showSpeedMeter(speed, speedCategory);
    }
    
    showBannerAlert(result.toUpperCase(), result);
    updateScoreboardCounts(result);
    
    elGeminiComment.textContent = "AI 판독실 분석 중...";
    elGeminiComment.classList.add('placeholder');
    
    const playPayload = {
      playType: 'pitch',
      speed: speed,
      speedCategory: speedCategory,
      isStrike: raw.isStrike || (result === 'strike'),
      isSwing: raw.isSwing || false,
      isTouchBat: raw.isTouchBat || false,
      batterHeight: tracker.batterHeightCm,
      teamA: gameState.teamAName,
      teamB: gameState.teamBName
    };
    
    const verdict = await aiReferee.analyzePlay(playPayload);
    
    elGeminiComment.textContent = verdict;
    elGeminiComment.classList.remove('placeholder');
    
    const logEntry = {
      playType: 'pitch',
      result: result,
      description: description,
      speed: speed,
      speedCategory: speedCategory,
      geminiComment: verdict,
      raw: raw,
      timestamp: new Date().toLocaleTimeString()
    };
    
    gameState.logs.push(logEntry);
    saveState();
    renderLogHistory();
  });

  // Start visual loop for canvas animation
  function animationLoop() {
    tracker.update();
    requestAnimationFrame(animationLoop);
  }
  
  // Start the UI & loop
  updateScoreboardUI();
  renderLogHistory();
  requestAnimationFrame(animationLoop);

  // Default to Webcam Tracker on Startup
  // Call webcam tracking automatically
  tracker.startWebcamTracking();
  
  console.log("Baseball VAR engine (Webcam Default, Pitch-Only) active.");
});
