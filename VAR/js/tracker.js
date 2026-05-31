// tracker.js - Strike zone calculation, pitch simulation, and webcam tracking engine. (Light theme and Pitch-Only Optimized)

class BaseballTracker {
  constructor(canvasId, videoId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d');
    this.video = document.getElementById(videoId);
    
    // Core parameters
    this.batterHeightCm = 150; // Default height (145~160cm for school)
    this.pitchLogs = [];
    this.isTracking = false;
    this.targetColor = { r: 255, g: 255, b: 255 }; // Default track color (white paper ball)
    this.colorThreshold = 40;
    
    // Play states
    this.currentPlayType = 'pitch'; // Only pitch play is used now
    this.isPlayingSim = false;
    this.simFrame = 0;
    this.maxSimFrames = 60;
    this.simData = {};
    
    // Calibration parameters (px to cm)
    this.pxToCm = 0.5; // 1px = 0.5cm in front view
    
    // Strike zone dimensions (calculated dynamically)
    this.szTop = 0;
    this.szBottom = 0;
    this.szLeft = 0;
    this.szRight = 0;
    
    // Replay speed
    this.replaySpeed = 1.0; 
    this.replayFrames = [];
    this.isReplaying = false;
    this.replayFrameIndex = 0;
    
    this.initCanvasSize();
    this.recalculateStrikeZone();
    
    // Event listener for resize
    window.addEventListener('resize', () => this.initCanvasSize());
  }

  initCanvasSize() {
    // Maintain 16:9 ratio
    const width = this.canvas.parentElement.clientWidth;
    const height = width * (9 / 16);
    this.canvas.width = width;
    this.canvas.height = height;
    this.recalculateStrikeZone();
  }

  // ABS Rule: Top 55.75%, Bottom 27.04% of batter height
  recalculateStrikeZone() {
    const w = this.canvas.width;
    const h = this.canvas.height;
    
    const plateWidthPx = 120; // Simulated plate width
    const plateCenterX = w / 2;
    
    // KBO ABS extends left/right by 2cm on each side (47.18cm total width)
    const szWidthPx = plateWidthPx * (47.18 / 43.18);
    
    this.szLeft = plateCenterX - szWidthPx / 2;
    this.szRight = plateCenterX + szWidthPx / 2;
    
    // Ground level at 85% of canvas height
    const groundY = h * 0.85;
    const scaleFactor = (h * 0.65) / 160; // 160cm takes 65% of screen height
    
    const szTopCm = this.batterHeightCm * 0.5575;
    const szBottomCm = this.batterHeightCm * 0.2704;
    
    this.szTop = groundY - (szTopCm * scaleFactor);
    this.szBottom = groundY - (szBottomCm * scaleFactor);
  }

  setBatterHeight(heightCm) {
    this.batterHeightCm = heightCm;
    this.recalculateStrikeZone();
  }

  // Draw background elements: plate, strike zone, field. No human silhouettes.
  drawBackground() {
    const w = this.canvas.width;
    const h = this.canvas.height;
    
    // 1. Draw Gym Floor / Field (Light Gray slate for Light Theme)
    const groundY = h * 0.85;
    this.ctx.fillStyle = '#f1f5f9';
    this.ctx.fillRect(0, groundY, w, h - groundY);
    
    // Floor boundary line
    this.ctx.strokeStyle = '#cbd5e1';
    this.ctx.lineWidth = 2;
    this.ctx.beginPath();
    this.ctx.moveTo(0, groundY);
    this.ctx.lineTo(w, groundY);
    this.ctx.stroke();
    
    // 2. Draw Home Plate (2D flat perspective with dark outline)
    const plateCenterX = w / 2;
    
    this.ctx.fillStyle = '#ffffff';
    this.ctx.strokeStyle = '#2b2d42';
    this.ctx.lineWidth = 2;
    this.ctx.beginPath();
    this.ctx.moveTo(plateCenterX - 50, groundY);
    this.ctx.lineTo(plateCenterX + 50, groundY);
    this.ctx.lineTo(plateCenterX + 50, groundY + 12);
    this.ctx.lineTo(plateCenterX, groundY + 24);
    this.ctx.lineTo(plateCenterX - 50, groundY + 12);
    this.ctx.closePath();
    this.ctx.fill();
    this.ctx.stroke();
    
    // 3. Draw Strike Zone Box (Highly visible Red-themed neon overlay for Light theme)
    this.drawStrikeZoneBox();
  }

  drawStrikeZoneBox() {
    const left = this.szLeft;
    const right = this.szRight;
    const top = this.szTop;
    const bottom = this.szBottom;
    
    const width = right - left;
    const height = bottom - top;
    
    this.ctx.save();
    
    // Outer border glow: uses --color-main (#ef233c) for strike zone overlay contrast
    this.ctx.shadowColor = 'rgba(239, 35, 60, 0.3)';
    this.ctx.shadowBlur = 6;
    this.ctx.strokeStyle = '#ef233c';
    this.ctx.lineWidth = 2;
    this.ctx.strokeRect(left, top, width, height);
    
    // Inner Grid lines
    this.ctx.strokeStyle = 'rgba(239, 35, 60, 0.15)';
    this.ctx.lineWidth = 1;
    // Horizontal third lines
    this.ctx.beginPath();
    this.ctx.moveTo(left, top + height / 3);
    this.ctx.lineTo(right, top + height / 3);
    this.ctx.moveTo(left, top + (2 * height) / 3);
    this.ctx.lineTo(right, top + (2 * height) / 3);
    // Vertical third lines
    this.ctx.moveTo(left + width / 3, top);
    this.ctx.lineTo(left + width / 3, bottom);
    this.ctx.moveTo(left + (2 * width) / 3, top);
    this.ctx.lineTo(left + (2 * width) / 3, bottom);
    this.ctx.stroke();
    
    // Subtle red tint inside the zone
    this.ctx.fillStyle = 'rgba(239, 35, 60, 0.04)';
    this.ctx.fillRect(left, top, width, height);
    
    this.ctx.restore();
  }

  // Trigger simulated play (Pitch only)
  startSimulation(type, isStrike = true, isSwing = false, isTouchBat = false) {
    if (this.isPlayingSim) return;
    
    this.currentPlayType = 'pitch';
    this.isPlayingSim = true;
    this.simFrame = 0;
    this.replayFrames = [];
    this.isReplaying = false;
    
    const w = this.canvas.width;
    const h = this.canvas.height;
    
    const speedKmh = isStrike ? (20 + Math.random() * 14) : (12 + Math.random() * 18);
    const speedCategory = speedKmh >= 25 ? 'FAST' : 'SLOW';
    
    // Target coordinate inside or outside the strike zone box
    let targetX, targetY;
    if (isStrike) {
      targetX = this.szLeft + 20 + Math.random() * (this.szRight - this.szLeft - 40);
      targetY = this.szTop + 20 + Math.random() * (this.szBottom - this.szTop - 40);
    } else {
      const side = Math.random() > 0.5;
      if (side) {
        targetX = Math.random() > 0.5 ? this.szLeft - 35 - Math.random() * 20 : this.szRight + 35 + Math.random() * 20;
        targetY = this.szTop + Math.random() * (this.szBottom - this.szTop);
      } else {
        targetX = this.szLeft + Math.random() * (this.szRight - this.szLeft);
        targetY = Math.random() > 0.5 ? this.szTop - 40 - Math.random() * 15 : this.szBottom + 40 + Math.random() * 15;
      }
    }
    
    this.simData = {
      startX: w / 2 - 20 + Math.random() * 40,
      startY: h * 0.45,
      startRadius: 3,
      endX: targetX,
      endY: targetY,
      endRadius: 26,
      speedKmh: speedKmh,
      speedCategory: speedCategory,
      isStrike: isStrike,
      isSwing: isSwing,
      isTouchBat: isTouchBat,
      trajectory: []
    };
    
    // Pre-calculate trajectory frames
    for (let i = 0; i <= this.maxSimFrames; i++) {
      const t = i / this.maxSimFrames;
      const easeT = t * t; // Acceleration effect
      
      const x = this.simData.startX + (this.simData.endX - this.simData.startX) * easeT;
      const y = this.simData.startY + (this.simData.endY - this.simData.startY) * easeT;
      const radius = this.simData.startRadius + (this.simData.endRadius - this.simData.startRadius) * easeT;
      
      let frameX = x;
      let frameY = y;
      
      // Deflect ball if swinging & touching bat (no visible bat drawn, just the ball path deflection!)
      if (isSwing && isTouchBat && i >= 48) {
        const dt = (i - 48) / (this.maxSimFrames - 48);
        frameX = x + dt * 200;
        frameY = y - dt * 280;
      }
      
      this.simData.trajectory.push({ x: frameX, y: frameY, radius: radius, frame: i });
    }
  }

  update() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    
    // Draw background camera feed or default simulated stadium background
    if (this.video && this.video.srcObject && this.isTracking) {
      this.ctx.save();
      this.ctx.translate(this.canvas.width, 0);
      this.ctx.scale(-1, 1); // Mirror
      this.ctx.drawImage(this.video, 0, 0, this.canvas.width, this.canvas.height);
      this.ctx.restore();
      
      this.trackColorInFeed();
    } else {
      this.drawBackground();
    }
    
    if (this.isPlayingSim) {
      this.renderSimulation();
    } else if (this.isReplaying) {
      this.renderReplay();
    }
  }

  renderSimulation() {
    const w = this.canvas.width;
    const h = this.canvas.height;
    
    const traj = this.simData.trajectory;
    const currentPt = traj[this.simFrame];
    
    // Draw neon crimson path trail
    this.ctx.strokeStyle = 'rgba(239, 35, 60, 0.4)';
    this.ctx.lineWidth = 3;
    this.ctx.beginPath();
    this.ctx.moveTo(traj[0].x, traj[0].y);
    for (let i = 1; i <= this.simFrame; i++) {
      this.ctx.lineTo(traj[i].x, traj[i].y);
    }
    this.ctx.stroke();
    
    // Draw Paper Ball (No batter/danso silhouettes are drawn here)
    this.ctx.save();
    this.ctx.beginPath();
    this.ctx.arc(currentPt.x, currentPt.y, currentPt.radius, 0, Math.PI * 2);
    
    const grad = this.ctx.createRadialGradient(
      currentPt.x - currentPt.radius/3, currentPt.y - currentPt.radius/3, currentPt.radius/10,
      currentPt.x, currentPt.y, currentPt.radius
    );
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.7, '#f1f5f9');
    grad.addColorStop(1, '#cbd5e1');
    
    this.ctx.fillStyle = grad;
    this.ctx.shadowColor = 'rgba(239, 35, 60, 0.3)';
    this.ctx.shadowBlur = 8;
    this.ctx.fill();
    
    // Paper ball crinkle texture lines
    this.ctx.strokeStyle = 'rgba(43, 45, 66, 0.15)';
    this.ctx.lineWidth = 1;
    this.ctx.beginPath();
    this.ctx.moveTo(currentPt.x - currentPt.radius*0.5, currentPt.y - currentPt.radius*0.25);
    this.ctx.lineTo(currentPt.x + currentPt.radius*0.4, currentPt.y + currentPt.radius*0.35);
    this.ctx.moveTo(currentPt.x - currentPt.radius*0.2, currentPt.y + currentPt.radius*0.55);
    this.ctx.lineTo(currentPt.x + currentPt.radius*0.15, currentPt.y - currentPt.radius*0.45);
    this.ctx.stroke();
    this.ctx.restore();
    
    // Buffer current canvas state for slow-motion playback
    this.replayFrames.push(this.ctx.getImageData(0, 0, w, h));
    
    this.simFrame++;
    
    if (this.simFrame >= this.maxSimFrames) {
      this.isPlayingSim = false;
      this.finishPlayDecision();
    }
  }

  renderReplay() {
    if (this.replayFrames.length === 0) return;
    
    const imgData = this.replayFrames[Math.floor(this.replayFrameIndex)];
    this.ctx.putImageData(imgData, 0, 0);
    
    // Replay Info Overlay (Light Theme style)
    this.ctx.fillStyle = 'rgba(239, 35, 60, 0.08)';
    this.ctx.strokeStyle = '#ef233c';
    this.ctx.lineWidth = 1.5;
    this.ctx.fillRect(15, 15, 130, 24);
    this.ctx.strokeRect(15, 15, 130, 24);
    
    this.ctx.font = '700 11px Orbitron';
    this.ctx.fillStyle = '#ef233c';
    this.ctx.fillText(`VAR REPLAY ${Math.round((this.replayFrameIndex / this.replayFrames.length) * 100)}%`, 24, 31);
    
    this.replayFrameIndex += this.replaySpeed;
    if (this.replayFrameIndex >= this.replayFrames.length) {
      this.replayFrameIndex = 0; 
    }
  }

  finishPlayDecision() {
    let result = '';
    let description = '';
    
    const isStrike = this.simData.isStrike;
    const isSwing = this.simData.isSwing;
    const isTouch = this.simData.isTouchBat;
    
    if (isSwing) {
      if (isTouch) {
        result = 'foul';
        description = `배트 스치기 판독: 미세 터치 감지. 파울 (속도: ${this.simData.speedKmh.toFixed(1)} km/h - ${this.simData.speedCategory === 'FAST' ? '빠른공' : '느린공'})`;
      } else {
        result = 'strike';
        description = `헛스윙 판독: 배트 헛방. 스트라이크 (속도: ${this.simData.speedKmh.toFixed(1)} km/h - ${this.simData.speedCategory === 'FAST' ? '빠른공' : '느린공'})`;
      }
    } else {
      result = isStrike ? 'strike' : 'ball';
      description = `${isStrike ? '스트라이크' : '볼'} 판독: ABS 존 ${isStrike ? '통과' : '외곽 통과'} (속도: ${this.simData.speedKmh.toFixed(1)} km/h - ${this.simData.speedCategory === 'FAST' ? '빠른공' : '느린공'})`;
    }
    
    const event = new CustomEvent('playCompleted', {
      detail: {
        result: result,
        description: description,
        speed: this.simData.speedKmh,
        speedCategory: this.simData.speedCategory,
        playType: 'pitch',
        raw: this.simData
      }
    });
    window.dispatchEvent(event);
  }

  startReplay(speed = 0.25) {
    if (this.replayFrames.length === 0) return;
    this.isReplaying = true;
    this.replaySpeed = speed;
    this.replayFrameIndex = 0;
  }

  stopReplay() {
    this.isReplaying = false;
  }

  // WEBCAM TRACKING
  startWebcamTracking() {
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 360 } })
        .then(stream => {
          this.video.srcObject = stream;
          this.video.play();
          this.video.classList.add('visible');
          this.isTracking = true;
          this.replayFrames = [];
        })
        .catch(err => {
          console.error("Camera connection failed: ", err);
          alert("카메라 스트림을 획득할 수 없습니다. 시뮬레이터 탭에서 플레이를 가상으로 실행해보세요.");
        });
    }
  }

  stopWebcamTracking() {
    this.isTracking = false;
    if (this.video.srcObject) {
      const tracks = this.video.srcObject.getTracks();
      tracks.forEach(track => track.stop());
      this.video.srcObject = null;
      this.video.classList.remove('visible');
    }
  }

  setTargetColorFromCoordinates(canvasX, canvasY) {
    try {
      const imgData = this.ctx.getImageData(canvasX, canvasY, 1, 1);
      const data = imgData.data;
      this.targetColor = { r: data[0], g: data[1], b: data[2] };
      console.log("Selected Target color:", this.targetColor);
    } catch (e) {
      console.warn("Unable to fetch canvas pixel color. Local files might restrict pixel reading.");
    }
  }

  trackColorInFeed() {
    const w = this.canvas.width;
    const h = this.canvas.height;
    
    this.drawStrikeZoneBox();
    
    try {
      const frameData = this.ctx.getImageData(0, 0, w, h);
      const data = frameData.data;
      
      let sumX = 0;
      let sumY = 0;
      let count = 0;
      
      for (let y = 0; y < h; y += 4) {
        for (let x = 0; x < w; x += 4) {
          const index = (y * w + x) * 4;
          const r = data[index];
          const g = data[index+1];
          const b = data[index+2];
          
          const dist = Math.sqrt(
            Math.pow(r - this.targetColor.r, 2) +
            Math.pow(g - this.targetColor.g, 2) +
            Math.pow(b - this.targetColor.b, 2)
          );
          
          if (dist < this.colorThreshold) {
            sumX += x;
            sumY += y;
            count++;
          }
        }
      }
      
      if (count > 10) {
        const avgX = sumX / count;
        const avgY = sumY / count;
        
        // Draw blue/red targeting reticle
        this.ctx.strokeStyle = '#ef233c';
        this.ctx.lineWidth = 2.5;
        this.ctx.beginPath();
        this.ctx.arc(avgX, avgY, 12, 0, Math.PI*2);
        this.ctx.stroke();
        
        if (!this.webcamTrajectory) this.webcamTrajectory = [];
        const timeStamp = performance.now();
        this.webcamTrajectory.push({ x: avgX, y: avgY, time: timeStamp });
        
        if (this.webcamTrajectory.length > 30) this.webcamTrajectory.shift();
        
        this.ctx.strokeStyle = 'rgba(239, 35, 60, 0.6)';
        this.ctx.lineWidth = 3;
        this.ctx.beginPath();
        this.ctx.moveTo(this.webcamTrajectory[0].x, this.webcamTrajectory[0].y);
        for (let i = 1; i < this.webcamTrajectory.length; i++) {
          this.ctx.lineTo(this.webcamTrajectory[i].x, this.webcamTrajectory[i].y);
        }
        this.ctx.stroke();
        
        this.evaluateWebcamTrajectory(w, h);
      }
    } catch (e) {
      // Local canvas security fallback
    }
  }

  evaluateWebcamTrajectory(width, height) {
    if (!this.webcamTrajectory || this.webcamTrajectory.length < 5) return;
    
    const lastIdx = this.webcamTrajectory.length - 1;
    const currentPt = this.webcamTrajectory[lastIdx];
    const prevPt = this.webcamTrajectory[lastIdx - 4];
    
    const plateX = width / 2;
    const crossed = (prevPt.x <= plateX && currentPt.x >= plateX) || (prevPt.x >= plateX && currentPt.x <= plateX);
    
    if (crossed && !this.isPlayingSim) {
      const dx = Math.abs(currentPt.x - prevPt.x);
      const dy = Math.abs(currentPt.y - prevPt.y);
      const distPx = Math.sqrt(dx * dx + dy * dy);
      const dtMs = currentPt.time - prevPt.time;
      
      if (dtMs > 0) {
        const distCm = distPx * 0.5;
        const velocityCmMs = distCm / dtMs; 
        const velocityKmh = velocityCmMs * 3.6;
        
        const isStrike = currentPt.y >= this.szTop && currentPt.y <= this.szBottom;
        const speedCategory = velocityKmh >= 25 ? 'FAST' : 'SLOW';
        
        const result = isStrike ? 'strike' : 'ball';
        const description = `웹캠 센싱 완료: ABS 존 ${isStrike ? '통과' : '외곽 통과'} (속도: ${velocityKmh.toFixed(1)} km/h - ${speedCategory === 'FAST' ? '빠른공' : '느린공'})`;
        
        const event = new CustomEvent('playCompleted', {
          detail: {
            result: result,
            description: description,
            speed: velocityKmh,
            speedCategory: speedCategory,
            playType: 'pitch',
            raw: { isStrike: isStrike, isSwing: false, isTouchBat: false }
          }
        });
        window.dispatchEvent(event);
        
        this.webcamTrajectory = [];
      }
    }
  }
}
