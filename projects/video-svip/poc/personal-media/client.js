// Isolated PoC evidence observer; not OpenDesk Side Panel production UI.
(() => {
  'use strict';
  const byId = id => document.getElementById(id);
  const loginForm = byId('login');
  const codeField = byId('code');
  const loginResult = byId('login-result');
  const loginPanel = byId('login-panel');
  const playPanel = byId('play-panel');
  const playResult = byId('play-result');
  const player = byId('player');
  const evidence = byId('evidence');

  const events = [];
  let firstFrame = false;
  let uninterruptedSince = null;
  let baselineTime = 0;
  let playbackVerified = false;
  let frameCallbackGeneration = 0;

  function mark(event, extra = {}) {
    const entry = { at: new Date().toISOString(), event, mediaTime: Number(player.currentTime.toFixed(2)), ...extra };
    events.push(entry);
    if (events.length > 120) events.shift();
    evidence.textContent = JSON.stringify(events.slice(-10), null, 2);
  }
  function resetWindow(reason) {
    uninterruptedSince = null;
    if (!playbackVerified) mark('PLAY_WINDOW_RESET', { reason });
  }
  function updateProgress() {
    if (playbackVerified || uninterruptedSince === null || !firstFrame ||
        player.paused || player.seeking || player.readyState < 2) return;
    const wallSeconds = (performance.now() - uninterruptedSince) / 1000;
    const mediaSeconds = player.currentTime - baselineTime;
    if (wallSeconds >= 15 && mediaSeconds >= 12) {
      playbackVerified = true;
      mark('PLAYING_15S_OBSERVED', { wallSeconds: Number(wallSeconds.toFixed(1)),
        mediaSeconds: Number(mediaSeconds.toFixed(1)), frameObserved: true });
      playResult.textContent = '浏览器已观测首帧和连续 15 秒播放；仍需本机独立验收。';
    }
  }
  function watchFirstFrame() {
    const generation = ++frameCallbackGeneration;
    if (typeof player.requestVideoFrameCallback !== 'function') {
      mark('FIRST_FRAME_UNVERIFIED', { reason: 'REQUEST_VIDEO_FRAME_CALLBACK_NOT_SUPPORTED' });
      return;
    }
    player.requestVideoFrameCallback((t, metadata) => {
      if (generation !== frameCallbackGeneration || !player.isConnected || !player.currentSrc) return;
      if (!firstFrame) {
        firstFrame = true;
        mark('FIRST_FRAME_OBSERVED', {
          presentedFrames: metadata.presentedFrames,
          mediaTime: Number(metadata.mediaTime.toFixed(2))
        });
        playResult.textContent = '已观测第一帧，正在验证连续播放…';
      }
      updateProgress();
    });
  }
  function stopPlayback(reason) {
    frameCallbackGeneration++;
    player.pause();
    player.removeAttribute('src');
    player.load();
    firstFrame = false;
    playbackVerified = false;
    uninterruptedSince = null;
    playResult.textContent = '已停止播放';
    mark(reason);
  }
  async function refreshStatus() {
    try {
      const response = await fetch('/status', { cache: 'no-store' });
      if (!response.ok) throw new Error('SESSION_EXPIRED_OR_DENIED');
      const data = await response.json();
      mark('SERVER_STATUS', {
        bytesStreamedApprox: data.bytesStreamedApprox,
        remainingBudgetApprox: data.uploadBudget - data.bytesStreamedApprox - data.bytesReserved,
        activeStreams: data.activeStreams
      });
    } catch {
      mark('SERVER_STATUS_FAILED');
      playResult.textContent = '会话可能失效，请重新配对。';
    }
  }
  loginForm.addEventListener('submit', async event => {
    event.preventDefault();
    const code = codeField.value;
    codeField.value = '';
    loginResult.textContent = '正在进行授权…';
    try {
      const response = await fetch('/session', {
        method: 'POST', credentials: 'same-origin', cache: 'no-store',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code })
      });
      if (!response.ok) {
        loginResult.textContent = '配对失败（HTTP ' + response.status + '），检查设备 A 的当前配对码。';
        return;
      }
      loginPanel.hidden = true;
      playPanel.hidden = false;
      mark('SESSION_CREATED');
      await refreshStatus();
    } catch {
      loginResult.textContent = '网络异常或权限被阻止，请查看连接状态。';
    }
  });
  byId('start').addEventListener('click', () => {
    if (player.currentSrc) stopPlayback('RESTART');
    firstFrame = false;
    playbackVerified = false;
    uninterruptedSince = null;
    mark('PLAY_REQUESTED');
    player.src = '/media';
    watchFirstFrame();
    player.play().catch(error => {
      mark('PLAY_REJECTED', { error: error.name });
      playResult.textContent = '播放失败：' + error.name + '（不能当作成功）。';
    });
  });
  byId('stop').addEventListener('click', () => stopPlayback('USER_STOP'));
  byId('stats').addEventListener('click', refreshStatus);
  byId('copy').addEventListener('click', async () => {
    const report = {
      experiment: 'video-svip-personal-media-poc',
      observedAt: new Date().toISOString(),
      rights: 'USER_DECLARED_NOT_INDEPENDENTLY_VERIFIED',
      transportPath: 'NOT_VERIFIED_CHECK_TAILSCALE_SEPARATELY',
      playbackVerifiedInBrowser: playbackVerified,
      events
    };
    try {
      await navigator.clipboard.writeText(JSON.stringify(report, null, 2));
      playResult.textContent = '已复制脱敏证据。请单独补充网络路径、许可与真实设备信息。';
    } catch {
      playResult.textContent = '复制被浏览器拒绝，请从下方证据区域读取。';
    }
  });
  byId('revoke').addEventListener('click', async () => {
    stopPlayback('USER_REVOKE_REQUESTED');
    try {
      const response = await fetch('/revoke', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' }, body: '{}'
      });
      if (!response.ok) throw new Error('REVOKE_FAILED');
      mark('ACCESS_REVOKED');
      loginPanel.hidden = false;
      playPanel.hidden = true;
      loginResult.textContent = '访问已撤销。必须从设备 A 获取轮换后的新配对码。';
    } catch {
      mark('REVOKE_FAILED');
      playResult.textContent = '撤权请求失败，不能假称访问已撤销；请立即在设备 A 停止服务。';
    }
  });

  player.addEventListener('playing', () => {
    uninterruptedSince = performance.now();
    baselineTime = player.currentTime;
    mark('PLAYING_EVENT');
    updateProgress();
  });
  player.addEventListener('timeupdate', updateProgress);
  for (const type of ['waiting', 'stalled', 'seeking', 'pause', 'ended', 'error']) {
    player.addEventListener(type, () => {
      if (type === 'error') {
        mark('MEDIA_ERROR', { code: player.error?.code || 0 });
        playResult.textContent = '媒体读取或解码错误，请检查网络/编码/权限。';
      }
      resetWindow(type);
    });
  }
})();
