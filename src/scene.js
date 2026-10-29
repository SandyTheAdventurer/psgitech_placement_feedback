import {
  Scene, PerspectiveCamera, WebGLRenderer, Group, Mesh, BoxGeometry, MeshStandardMaterial,
  CanvasTexture, SRGBColorSpace, IcosahedronGeometry, TorusGeometry, SphereGeometry,
  BufferGeometry, Float32BufferAttribute, Points, PointsMaterial, AmbientLight, DirectionalLight,
  PointLight, EdgesGeometry, LineSegments, LineBasicMaterial, AdditiveBlending, MathUtils,
  MeshBasicMaterial,
} from 'three';

const PAGE_COLORS = ['#2255e0', '#e11d48', '#0f2f86', '#ff5a6a', '#4c8dff', '#be123c', '#2255e0'];

function pageTexture(accent, seed) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 340;
  const g = c.getContext('2d');
  g.fillStyle = '#f7f9fd'; g.fillRect(0, 0, 256, 340);
  g.fillStyle = accent; g.fillRect(0, 0, 256, 54);
  g.fillStyle = 'rgba(255,255,255,.92)'; g.fillRect(18, 22, 96, 10);
  g.beginPath(); g.arc(226, 27, 12, 0, Math.PI * 2); g.fillStyle = 'rgba(255,255,255,.85)'; g.fill();
  let s = seed * 9301 + 49297;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  g.fillStyle = '#0a1f5c'; g.fillRect(18, 76, 140 + rnd() * 60, 12);
  for (let y = 106; y < 318; y += 16) {
    const w = 150 + rnd() * 88;
    g.fillStyle = y % 5 === 0 ? '#c9d3e6' : '#dde4f1';
    g.fillRect(18, y, Math.min(w, 220), 7);
    if (rnd() > 0.78) { g.fillStyle = accent; g.fillRect(18, y, 6, 7); }
  }
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export function mountScene(canvas, { variant = 'hero' } = {}) {
  let renderer;
  try {
    renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  } catch { return null; }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setClearColor(0x000000, 0);

  const scene = new Scene();
    const camera = new PerspectiveCamera(38, 1, 0.1, 100);
  camera.position.set(0, 0.4, 10.5);

  scene.add(new AmbientLight(0xffffff, 0.9));
  const key = new DirectionalLight(0xffffff, 2.1); key.position.set(4, 6, 6); scene.add(key);
  const gold = new PointLight(0xff3b52, 60, 18); gold.position.set(0, 0, 0); scene.add(gold);
  const blue = new PointLight(0x4f7dff, 55, 20); blue.position.set(-5, -2, 4); scene.add(blue);

  const root = new Group();
  scene.add(root);
  const tilt = new Group();
  root.add(tilt);

  // ring of document pages (the "guides")
  const pages = [];
  const N = 7;
  const geo = new BoxGeometry(1.5, 2.0, 0.05);
  const edge = new MeshStandardMaterial({ color: '#0f2f86', roughness: 0.5, metalness: 0.2 });
  for (let i = 0; i < N; i++) {
    const tex = pageTexture(PAGE_COLORS[i % PAGE_COLORS.length], i + 1);
    const face = new MeshStandardMaterial({ map: tex, roughness: 0.55, metalness: 0.05 });
    const m = new Mesh(geo, [edge, edge, edge, edge, face, face]);
    const a = (i / N) * Math.PI * 2;
    m.userData = { a, r: 2.9, phase: i * 1.3 };
    m.position.set(Math.sin(a) * 2.9, 0, Math.cos(a) * 2.9);
    m.rotation.y = a;
    pages.push(m);
    tilt.add(m);
  }

  // glowing core
  const core = new Mesh(new IcosahedronGeometry(0.95, 1), new MeshStandardMaterial({
    color: '#e11d48', emissive: '#ff2a48', emissiveIntensity: 0.85, roughness: 0.25, metalness: 0.6, flatShading: true,
  }));
  tilt.add(core);
  const wire = new LineSegments(new EdgesGeometry(new IcosahedronGeometry(1.45, 1)),
    new LineBasicMaterial({ color: '#9bb9ff', transparent: true, opacity: 0.6 }));
  tilt.add(wire);

  // orbit rings with satellites
  const ringMat = new MeshBasicMaterial({ color: '#ff5a6a', transparent: true, opacity: 0.6 });
  const ring1 = new Mesh(new TorusGeometry(4.0, 0.012, 8, 160), ringMat);
  ring1.rotation.x = Math.PI / 2.35;
  const ring2 = new Mesh(new TorusGeometry(4.6, 0.01, 8, 160), new MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.35 }));
  ring2.rotation.set(Math.PI / 2.9, 0.5, 0);
  tilt.add(ring1, ring2);
  const sats = [];
  for (let i = 0; i < 4; i++) {
    const s = new Mesh(new SphereGeometry(0.09 + (i % 2) * 0.04, 16, 16), new MeshBasicMaterial({ color: i % 2 ? '#ffffff' : '#ff5a6a' }));
    s.userData = { ring: i % 2 ? ring2 : ring1, r: i % 2 ? 4.6 : 4.0, t: i * 1.7, speed: 0.25 + i * 0.07 };
    tilt.add(s); sats.push(s);
  }

  // dust
  const COUNT = 520;
  const pos = new Float32Array(COUNT * 3);
  for (let i = 0; i < COUNT; i++) {
    const r = 5 + Math.random() * 9, th = Math.random() * Math.PI * 2, ph = Math.acos(2 * Math.random() - 1);
    pos[i * 3] = r * Math.sin(ph) * Math.cos(th);
    pos[i * 3 + 1] = r * Math.sin(ph) * Math.sin(th) * 0.7;
    pos[i * 3 + 2] = r * Math.cos(ph) - 2;
  }
  const dg = new BufferGeometry();
  dg.setAttribute('position', new Float32BufferAttribute(pos, 3));
  const dust = new Points(dg, new PointsMaterial({
    color: '#dbe6ff', size: 0.045, transparent: true, opacity: 0.75, blending: AdditiveBlending, depthWrite: false,
  }));
  scene.add(dust);

  // layout per variant / viewport
  function layout() {
    const w = canvas.clientWidth || 1, h = canvas.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    if (variant === 'login') {
      const wide = w > 900;
      root.position.set(wide ? -3.6 : 0, wide ? -2.1 : 3.2, 0);
      root.scale.setScalar(wide ? 0.95 : 0.7);
      camera.position.z = 11.5;
    } else {
      const narrow = w < 560;
      root.position.set(0, 0, 0);
      root.scale.setScalar(narrow ? 0.62 : 0.86);
      camera.position.z = narrow ? 11 : 10.5;
    }
    camera.updateProjectionMatrix();
  }
  layout();
  const ro = new ResizeObserver(layout);
  ro.observe(canvas);

  // pointer parallax
  const target = { x: 0, y: 0 }, cur = { x: 0, y: 0 };
  const onMove = (e) => {
    target.x = (e.clientX / window.innerWidth - 0.5) * 2;
    target.y = (e.clientY / window.innerHeight - 0.5) * 2;
  };
  window.addEventListener('pointermove', onMove, { passive: true });

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let visible = true, raf = 0, last = performance.now(), t = 0, disposed = false;
  const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; }, { threshold: 0 });
  io.observe(canvas);

  const tmpAxis = { x: 0, y: 0, z: 0 };
  function frame(now) {
    if (disposed) return;
    raf = requestAnimationFrame(frame);
    if (!visible || document.hidden) { last = now; return; }
    const dt = Math.min((now - last) / 1000, 0.05); last = now;
    t += dt;

    cur.x += (target.x - cur.x) * 0.045;
    cur.y += (target.y - cur.y) * 0.045;
    tilt.rotation.y += dt * 0.22;
    tilt.rotation.x = 0.22 + cur.y * 0.22;
    root.rotation.y = cur.x * 0.35;
    root.rotation.z = -cur.x * 0.05;

    core.rotation.x += dt * 0.5; core.rotation.y += dt * 0.7;
    core.scale.setScalar(1 + Math.sin(t * 1.6) * 0.04);
    wire.rotation.x -= dt * 0.18; wire.rotation.y += dt * 0.25;
    gold.intensity = 55 + Math.sin(t * 2) * 8;

    for (const p of pages) {
      p.position.y = Math.sin(t * 0.9 + p.userData.phase) * 0.22;
      p.rotation.z = Math.sin(t * 0.6 + p.userData.phase) * 0.05;
    }
    ring1.rotation.z += dt * 0.08; ring2.rotation.z -= dt * 0.06;
    for (const s of sats) {
      s.userData.t += dt * s.userData.speed;
      const a = s.userData.t, r = s.userData.r;
      const ringRef = s.userData.ring;
      tmpAxis.x = Math.cos(a) * r; tmpAxis.y = Math.sin(a) * r; tmpAxis.z = 0;
      s.position.set(tmpAxis.x, tmpAxis.y, 0).applyEuler(ringRef.rotation);
    }
    dust.rotation.y += dt * 0.012;
    renderer.render(scene, camera);
  }
  if (reduce) { tilt.rotation.set(0.22, 0.6, 0); renderer.render(scene, camera); }
  else raf = requestAnimationFrame(frame);

  return {
    dispose() {
      disposed = true;
      cancelAnimationFrame(raf);
      ro.disconnect(); io.disconnect();
      window.removeEventListener('pointermove', onMove);
      scene.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
        mats.forEach((m) => { if (m.map) m.map.dispose(); m.dispose(); });
      });
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
export { MathUtils };
