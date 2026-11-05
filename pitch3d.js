/* ========== 3D PITCH VIEW (NEW) ========== */
function renderPitch3D(container, planning) {
  if (!state.players.length) {
    container.innerHTML = '<div class="empty"><span class="emoji">🎲</span>Sync to load your 3D pitch</div>';
    return;
  }
  container.innerHTML = `
    <div class="pitch-3d-wrap">
      <canvas id="pitch-3d-canvas"></canvas>
      <div class="pitch-3d-hint">🖱️ Drag to orbit · Scroll / pinch to zoom</div>
    </div>
  `;
  
  // Wait a tiny bit longer (200ms) to ensure the CSS has fully sized the canvas before Three.js takes over
  setTimeout(() => {
    const players = planning && plannedTeam
      ? plannedTeam.starters.map(id => state.players.find(p => p.id === id)).filter(Boolean)
      : state.players.filter(p => !p.bench);
      
    if (typeof window.renderSquad3D === 'function') {
      window.renderSquad3D('pitch-3d-canvas', players, '');
    } else {
      container.innerHTML = '<div class="empty"><span class="emoji">⚠️</span>3D Engine failed to load. Check console.</div>';
    }
  }, 200);
}
