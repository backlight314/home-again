// 3D office hub for the Work album. Same camera rules as the house: one path in, one path out.
import * as THREE from 'three';

const W = 4, D = 1.7;
const F0 = .3, C0 = 2.6;
const F1 = 2.82, C1 = 5.15;
const SHELL = '#5a6574', TRIM = '#2c3340', METAL = '#8a96a4', LIGHT = '#9ec9e0';
const HOME = new THREE.Vector3(0, 4.2, 18), HOME_T = new THREE.Vector3(0, 3.4, 0);
const GLIDE_MS = 1800;
const ease = k => k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
const v3 = (x, y, z) => new THREE.Vector3(x, y, z);

const VIEWS = {
  desk: { box: [-W, 0, F0, C0], pos: v3(-2, 1.6, 3.9), look: v3(-2, 1.15, -.6) },
  break: { box: [0, W, F0, C0], pos: v3(2, 1.65, 4.6), look: v3(2, 1.15, -.6) },
  phone: { box: [-W, 0, F1, C1], pos: v3(-2, 4.2, 4.6), look: v3(-2, 3.7, -.6) },
  files: { box: [0, W, F1, C1], pos: v3(2, 4.2, 4.6), look: v3(2, 3.7, -.6) }
};
const NAMES = { desk: 'your desk', break: 'break room', phone: 'the phone', files: 'the files' };
const ENTER = ['desk', 'break', 'phone', 'files'];
const LABELS = [
  { text: 'Phone', room: 'phone', at: [-2, 4.7, 1.6] },
  { text: 'Files', room: 'files', at: [2, 4.7, 1.6] },
  { text: 'Desk', room: 'desk', at: [-2, 2.15, 1.6], here: true },
  { text: 'Break', room: 'break', at: [2, 2.15, 1.6] }
];

export function createOffice({ mount, deskBtn, onRoom, onAlbum, calm = false, shift = 0 }) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  mount.prepend(renderer.domElement);

  const scene = new THREE.Scene();
  const sky = document.createElement('canvas'); sky.width = 4; sky.height = 512;
  const sg = sky.getContext('2d');
  const SKY = {
    night: [[0, '#1a2744'], [.2, '#2c3d5c'], [.45, '#6a7d96'], [.7, '#c4b39a'], [1, '#c4b39a']],
    day: [[0, '#5aa0d4'], [.25, '#8ec4e6'], [.5, '#d7eaf6'], [1, '#d7eaf6']]
  };
  function paintSky(stops) {
    const g = sg.createLinearGradient(0, 0, 0, 512);
    stops.forEach(([s, c]) => g.addColorStop(s, c));
    sg.fillStyle = g; sg.fillRect(0, 0, 4, 512);
  }
  paintSky(SKY.night);
  const skyTex = new THREE.CanvasTexture(sky); skyTex.colorSpace = THREE.SRGBColorSpace;
  scene.background = skyTex;
  const fog = scene.fog = new THREE.Fog('#6a7d96', 30, 80);
  const camera = new THREE.PerspectiveCamera(34, 1.6, .1, 200);

  const hemi = new THREE.HemisphereLight('#a8b8d0', '#3a4048', 1.2);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight('#d0d8ea', 1.2);
  sun.position.set(7, 12, 10);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -16, right: 16, top: 14, bottom: -6, near: 1, far: 50 });
  scene.add(sun);

  const office = new THREE.Group();
  scene.add(office);
  const mats = {};
  const mat = c => mats[c] ??= new THREE.MeshStandardMaterial({ color: c, roughness: .88, flatShading: true });
  function put(geo, color, x, y, z, parent = office) {
    const m = new THREE.Mesh(geo, typeof color === 'string' ? mat(color) : color);
    m.position.set(x, y, z);
    m.castShadow = m.receiveShadow = true;
    parent.add(m);
    return m;
  }
  const span = (x0, x1, y0, y1, z0, z1, color, parent) =>
    put(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), color, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, parent);
  function light(color, intensity, dist, x, y, z, parent = office) {
    const l = new THREE.PointLight(color, intensity, dist, 2);
    l.position.set(x, y, z);
    parent.add(l);
    return l;
  }

  const windows = {};
  function pane(name, cx, cy, w, h, z) {
    const m = new THREE.MeshStandardMaterial({ color: '#6d7c8c', emissive: LIGHT, emissiveIntensity: 0, roughness: .35 });
    put(new THREE.PlaneGeometry(w, h), m, cx, cy, z).castShadow = false;
    windows[name] = m;
  }
  function backWall(x0, x1, y0, y1, color, win) {
    const z0 = -D - .15, z1 = -D;
    if (!win) return span(x0, x1, y0, y1, z0, z1, color);
    const { name, cx, cy, w = 1.1, h = .75 } = win;
    const l = cx - w / 2, r = cx + w / 2, b = cy - h / 2, t = cy + h / 2;
    span(x0, l, y0, y1, z0, z1, color); span(r, x1, y0, y1, z0, z1, color);
    span(l, r, y0, b, z0, z1, color); span(l, r, t, y1, z0, z1, color);
    pane(name, cx, cy, w, h, -D - .08);
    span(l - .06, r + .06, b - .05, b, -D - .1, -D + .08, TRIM);
  }

  const ROOMS = [
    { name: 'desk', x0: -W, x1: 0, f: F0, c: C0, wall: '#d5dbe3', floor: '#8b93a0', win: { cx: -2, cy: F0 + 1.35 } },
    { name: 'break', x0: 0, x1: W, f: F0, c: C0, wall: '#cfd8c8', floor: '#8b93a0', win: { cx: 2.2, cy: F0 + 1.35 } },
    { name: 'phone', x0: -W, x1: 0, f: F1, c: C1, wall: '#d2d0dc', floor: '#7e8794', win: { cx: -2.2, cy: F1 + 1.3 } },
    { name: 'files', x0: 0, x1: W, f: F1, c: C1, wall: '#d8d3c8', floor: '#7e8794', win: { cx: 2.2, cy: F1 + 1.3 } }
  ];
  for (const r of ROOMS) {
    span(r.x0, r.x1, r.f - .08, r.f, -D, D, r.floor);
    backWall(r.x0, r.x1, r.f, r.c, r.wall, r.win && { name: r.name, ...r.win });
    const [o0, o1] = r.x0 === -W ? [-W - .15, -W] : [W, W + .15];
    span(o0, o1, r.f - .08, r.c, -D - .15, D, r.wall);
  }
  span(-.06, .06, F0, C0, -D, D, '#c5ccd6');
  span(-.06, .06, F1, C1, -D, D, '#c5ccd6');
  span(-W - .25, W + .25, 0, .22, -D - .25, D + .12, SHELL);
  span(-W - .15, W + .15, C0, F1 - .08, -D - .15, D, SHELL);
  span(-W - .2, W + .2, C1, C1 + .22, -D - .2, D + .12, SHELL);
  span(-W - .35, W + .35, C1 + .22, C1 + .38, -D - .3, D + .2, '#4d5664');
  put(new THREE.BoxGeometry(.7, .35, .5), '#6a7382', -1.4, C1 + .55, -.4);
  put(new THREE.BoxGeometry(.55, .28, .4), '#6a7382', 1.6, C1 + .5, -.2);
  span(-1.1, 1.1, C1 + .38, C1 + .55, D - .05, D + .12, '#3d4654');

  const roomLights = {
    desk: light('#cfe4f4', 0, 5, -2, C0 - .5, .2),
    break: light('#e8f0c8', 0, 5, 2, C0 - .5, .2),
    phone: light('#cfe4f4', 0, 5, -2, C1 - .5, .3),
    files: light('#f0e4c8', 0, 5, 2, C1 - .5, .3)
  };

  span(-3.4, -.7, F0 + .72, F0 + .78, -.2, .55, METAL);
  for (const x of [-3.2, -.9]) span(x, x + .08, F0, F0 + .72, .4, .48, '#5c6572');
  put(new THREE.BoxGeometry(.5, .28, .4), '#4a5564', -2, F0 + .95, .1);
  put(new THREE.BoxGeometry(.18, .35, .02), '#c5d0dc', -1.4, F0 + 1.15, -.9);
  const deskLamp = light('#ffe9b8', 2, 4, -2, C0 - .4, .1);

  span(1.1, 2.9, F0 + .7, F0 + .76, -.15, .45, '#c4b49a');
  put(new THREE.CylinderGeometry(.16, .18, .28, 12), '#6b5340', 2, F0 + .9, .1);
  put(new THREE.CylinderGeometry(.12, .1, .08, 12), '#efe6cf', 2, F0 + 1.08, .1);
  put(new THREE.BoxGeometry(.35, .5, .35), '#8a9a7a', 3.2, F0 + .55, -.8);

  span(-3.3, -.8, F1 + .72, F1 + .78, -.15, .5, METAL);
  put(new THREE.BoxGeometry(.55, .12, .35), '#3c3326', -2, F1 + .9, .05);
  put(new THREE.BoxGeometry(.18, .08, .28), '#2a241c', -1.7, F1 + .98, .05);

  for (const x of [1.3, 2.15, 3]) {
    span(x, x + .7, F1, F1 + 1.35, -.95, -.45, '#7a5a3a');
    span(x + .04, x + .66, F1 + .15, F1 + .45, -.44, -.4, '#c4a777');
    span(x + .04, x + .66, F1 + .55, F1 + .85, -.44, -.4, '#c4a777');
    span(x + .04, x + .66, F1 + .95, F1 + 1.25, -.44, -.4, '#c4a777');
  }

  /* ---------- ground and campus ---------- */
  const lawn = put(new THREE.CircleGeometry(70, 48), '#3c5045', 0, 0, 0);
  lawn.rotation.x = -Math.PI / 2;
  lawn.receiveShadow = true;
  lawn.castShadow = false;
  const plaza = put(new THREE.PlaneGeometry(10, 8.5), '#8a8680', 0, .012, 5.4);
  plaza.rotation.x = -Math.PI / 2;
  plaza.castShadow = false;
  const walk = put(new THREE.PlaneGeometry(2.2, 12), '#9a948c', 0, .014, 8.2);
  walk.rotation.x = -Math.PI / 2;
  walk.castShadow = false;
  span(-5.1, 5.1, 0, .08, 1.55, 1.85, '#6d6a66');
  span(-.55, .55, 0, .06, 1.7, 6.4, '#7a7670');

  for (const [x, z, s, c] of [[-16, -28, [24, 5.5, 9], '#5a5d78'], [18, -32, [28, 6.5, 10], '#4a4e6c'], [2, -42, [34, 7, 9], '#535677']]) {
    const hill = put(new THREE.SphereGeometry(1, 24, 12), c, x, 0, z);
    hill.scale.set(...s);
    hill.castShadow = false;
  }
  const skyline = [
    [-12, -18, 2.2, 4.2, 1.6, '#5a6274'],
    [-8.4, -20, 1.6, 6.2, 1.4, '#4d5568'],
    [-5.2, -19, 1.8, 3.4, 1.5, '#636b7c'],
    [6.4, -20, 1.7, 5.4, 1.4, '#4d5568'],
    [9.8, -18, 2.4, 3.8, 1.7, '#5a6274'],
    [13.2, -21, 1.5, 7, 1.3, '#454c5e']
  ];
  for (const [x, z, w, h, d, c] of skyline) {
    const b = span(x - w / 2, x + w / 2, 0, h, z - d / 2, z + d / 2, c);
    b.castShadow = false;
  }
  const orb = put(new THREE.SphereGeometry(1.5, 16, 12), new THREE.MeshBasicMaterial({ color: '#f6eed6', fog: false }), 16, 13, -30);

  function tree(x, z, s = 1) {
    put(new THREE.CylinderGeometry(.12 * s, .16 * s, 1.5 * s, 6), '#4a3a2c', x, .75 * s, z);
    put(new THREE.IcosahedronGeometry(1.1 * s, 0), '#3e594c', x, 2 * s, z);
    return put(new THREE.IcosahedronGeometry(.75 * s, 0), '#4a6757', x + .3 * s, 2.8 * s, z + .2);
  }
  const trees = [
    tree(-7.2, -1.4, 1.2),
    tree(7.6, -2.4, 1.35),
    tree(-9.4, -6.2, 1.05),
    tree(9.8, -7, 1.15),
    tree(-6.6, 4.6, .85),
    tree(6.8, 5.1, .9)
  ];
  for (const [x, z, r] of [[-5.2, 2.4, .5], [-5.8, 1.5, .38], [5.4, 2.2, .5], [6, 1.3, .4], [-4.6, 5.6, .32], [4.8, 5.8, .34], [.9, 7.4, .28]]) {
    put(new THREE.IcosahedronGeometry(r, 0), '#3e594c', x, r * .6, z);
  }

  function lamp(x, z) {
    put(new THREE.CylinderGeometry(.08, .1, .06, 10), '#3d4654', x, .04, z);
    put(new THREE.CylinderGeometry(.035, .035, 1.7, 8), '#3d4654', x, .9, z);
    put(new THREE.BoxGeometry(.28, .08, .18), '#2c3340', x, 1.78, z);
    const glow = light('#ffe9b8', 1.1, 5, x, 1.7, z);
    glow.castShadow = false;
    return glow;
  }
  const lamps = [lamp(-3.4, 4.2), lamp(3.4, 4.2)];

  span(-5.6, -3.4, 0, .12, 6.4, 8.6, '#6a6864');
  span(-5.35, -3.65, .12, .55, 6.65, 8.35, '#4a5564');
  span(-5.1, -3.9, .55, .72, 6.85, 8.15, '#3d4654');
  span(-4.55, -4.35, .18, .42, 8.3, 8.55, '#2c3340');
  span(-4.55, -4.35, .18, .42, 6.45, 6.7, '#2c3340');

  span(3.3, 4.7, .32, .38, 6.5, 7.1, '#6b5340');
  for (const x of [3.45, 4.45]) span(x, x + .1, 0, .32, 6.58, 6.68, '#5c4130');
  span(3.45, 4.55, .38, .52, 6.58, 7.02, '#c4b49a');

  put(new THREE.CylinderGeometry(.1, .14, .85, 8), '#5c4130', -5.4, .42, 4.2);
  span(-5.75, -5.05, .84, .9, 3.9, 4.5, '#8a6440');
  put(new THREE.BoxGeometry(.72, .14, .52), '#44607d', -5.4, 1.02, 4.2);
  put(new THREE.BoxGeometry(.7, .12, .03), '#fff6ea', -5.4, 1.02, 4.45);
  const albumLbl = document.createElement('div');
  albumLbl.className = 'roomlbl here';
  albumLbl.textContent = 'Album';
  mount.appendChild(albumLbl);
  const albumAt = new THREE.Vector3(-5.4, 1.55, 4.2);
  const albumBtn = document.createElement('button');
  albumBtn.className = 'roombtn albumhit';
  albumBtn.setAttribute('aria-label', 'Open the work album');
  albumBtn.addEventListener('click', () => onAlbum?.());
  const albumCorners = [
    new THREE.Vector3(-5.85, .65, 4.55),
    new THREE.Vector3(-4.95, .65, 4.55),
    new THREE.Vector3(-5.85, 1.55, 3.85),
    new THREE.Vector3(-4.95, 1.55, 3.85)
  ];

  const labels = LABELS.map(l => {
    const el = document.createElement('div');
    el.className = 'roomlbl' + (l.here ? ' here' : '');
    el.textContent = l.text;
    mount.appendChild(el);
    return { el, room: l.room, at: new THREE.Vector3(...l.at) };
  });
  let hoverRoom = null;
  const btns = ENTER.map(name => {
    let b = deskBtn;
    if (name !== 'desk') {
      b = document.createElement('button');
      b.className = 'roombtn';
      b.setAttribute('aria-label', 'Go into ' + NAMES[name]);
    }
    b.addEventListener('click', () => onRoom?.(name));
    mount.appendChild(b);
    const on = () => { hoverRoom = name; }, off = () => { if (hoverRoom === name) hoverRoom = null; };
    b.addEventListener('pointerenter', on); b.addEventListener('focus', on);
    b.addEventListener('pointerleave', off); b.addEventListener('blur', off);
    const [x0, x1, y0, y1] = VIEWS[name].box;
    return { b, corners: [x0, x1].flatMap(x => [y0, y1].map(y => new THREE.Vector3(x, y, D))) };
  });
  mount.appendChild(albumBtn);

  const v = new THREE.Vector3();
  function place2d() {
    for (const l of labels) {
      v.copy(l.at).project(camera);
      l.el.style.left = (v.x + 1) * 50 + '%';
      l.el.style.top = (1 - v.y) * 50 + '%';
      l.el.classList.toggle('hot', l.room === hoverRoom);
    }
    for (const { b, corners } of btns) {
      let x0 = 1, x1 = -1, y0 = 1, y1 = -1;
      for (const c of corners) {
        v.copy(c).project(camera);
        x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y);
      }
      Object.assign(b.style, {
        left: (x0 + 1) * 50 + '%', width: (x1 - x0) * 50 + '%',
        top: (1 - y1) * 50 + '%', height: (y1 - y0) * 50 + '%'
      });
    }
    v.copy(albumAt).project(camera);
    albumLbl.style.left = (v.x + 1) * 50 + '%';
    albumLbl.style.top = (1 - v.y) * 50 + '%';
    let ax0 = 1, ax1 = -1, ay0 = 1, ay1 = -1;
    for (const c of albumCorners) {
      v.copy(c).project(camera);
      ax0 = Math.min(ax0, v.x); ax1 = Math.max(ax1, v.x); ay0 = Math.min(ay0, v.y); ay1 = Math.max(ay1, v.y);
    }
    Object.assign(albumBtn.style, {
      left: (ax0 + 1) * 50 + '%', width: (ax1 - ax0) * 50 + '%',
      top: (1 - ay1) * 50 + '%', height: (ay1 - ay0) * 50 + '%'
    });
  }

  let night = true, active = true, mode = 'home', glide = null, room = 'desk', last = 0;
  const lit = { desk: false, break: false, phone: false, files: false };
  const par = { x: 0, y: 0, tx: 0, ty: 0 };
  let path = null;
  const target = new THREE.Vector3();

  function aim(name) {
    room = name;
    const p = VIEWS[name].pos;
    path = new THREE.CatmullRomCurve3([HOME.clone(), new THREE.Vector3(p.x * .7, (HOME.y + p.y) / 2, 10), p.clone()]);
  }
  function placeCamera(u) {
    path.getPoint(u, camera.position);
    target.lerpVectors(HOME_T, VIEWS[room].look, u);
    camera.lookAt(target);
  }
  function go(dir, name) {
    if (dir > 0) aim(name);
    path.points[dir > 0 ? 0 : 2].copy(camera.position);
    path.points[dir > 0 ? 2 : 0].copy(dir > 0 ? VIEWS[room].pos : HOME);
    mount.classList.toggle('away', true);
    hoverRoom = null;
    par.x = par.y = par.tx = par.ty = 0;
    return new Promise(res => {
      if (calm) { finishGlide(dir); return res(); }
      mode = 'gliding';
      glide = { dir, t0: performance.now(), res };
    });
  }
  function finishGlide(dir) {
    mode = dir > 0 ? 'inside' : 'home';
    placeCamera(dir > 0 ? 1 : 0);
    mount.classList.toggle('away', mode !== 'home');
  }

  function resize() {
    const { width, height } = mount.getBoundingClientRect();
    if (!width || !height) return;
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    if (shift) camera.setViewOffset(width, height, -shift * width, 0, width, height);
    else camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(mount);
  resize();
  aim('desk');
  placeCamera(0);

  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(.05, (now - last) / 1000);
    last = now;
    if (!active) return;
    const t = now / 1000;
    if (mode === 'gliding') {
      const k = Math.min(1, Math.max(0, (now - glide.t0) / GLIDE_MS)), e = ease(k);
      placeCamera(glide.dir > 0 ? e : 1 - e);
      if (k >= 1) { const g = glide; glide = null; finishGlide(g.dir); g.res(); }
    } else {
      par.x += (par.tx - par.x) * .05; par.y += (par.ty - par.y) * .05;
      if (mode === 'home') {
        camera.position.set(HOME.x - par.x * .6, HOME.y + par.y * .3, HOME.z);
        camera.lookAt(HOME_T);
        place2d();
      } else {
        const view = VIEWS[room];
        camera.position.set(view.pos.x - par.x * .3, view.pos.y + par.y * .15, view.pos.z);
        camera.lookAt(view.look);
      }
    }
    const pulse = calm ? .5 : .5 + .5 * Math.sin(t * 2.4);
    ENTER.forEach((name) => {
      if (!windows[name]) return;
      windows[name].emissiveIntensity = lit[name] ? 1.6 : hoverRoom === name ? (night ? 1.15 : .5) : (night ? 0.55 : 0.08);
    });
    if (windows.desk) windows.desk.emissiveIntensity = lit.desk ? 1.5 : .2 + .5 * pulse;
    deskLamp.intensity = hoverRoom === 'desk' ? 5 : 2;
    for (const [name, l] of Object.entries(roomLights)) {
      const goal = mode !== 'home' && room === name ? 1.6 : hoverRoom === name ? 3.4 : (night ? 1.3 : .25);
      l.intensity = calm ? goal : l.intensity + (goal - l.intensity) * Math.min(1, dt * 6);
    }
    trees.forEach((canopy, i) => { canopy.rotation.y = Math.sin(t * .3 + i) * .04; });
    lamps.forEach((l) => { l.intensity = night ? 1.4 : 0.15; });
    orb.position.y = night ? 13 : 16;
    orb.material.color.set(night ? '#f6eed6' : '#ffe9a8');
    renderer.render(scene, camera);
  }
  requestAnimationFrame(frame);

  function setTime(m) {
    night = m !== 'day';
    paintSky(night ? SKY.night : SKY.day);
    skyTex.needsUpdate = true;
    fog.color.set(night ? '#6a7d96' : '#d5e6f2');
    hemi.color.set(night ? '#a8b8d0' : '#fff4e0');
    hemi.groundColor.set(night ? '#3a4048' : '#8c9a74');
    sun.color.set(night ? '#d0d8ea' : '#ffe9c4');
  }
  window.addEventListener('homeagain:time', e => setTime(e.detail));

  const api = {
    setTime,
    setActive(on) { active = on; },
    reset() { glide = null; finishGlide(-1); },
    glideIn: (name = 'desk') => go(1, name),
    glideOut: () => go(-1),
    setLit(name, on) { lit[name] = !!on; },
    pointer(dx, dy) { par.tx = dx; par.ty = dy; }
  };
  setTime(window.HomeAgainTime ? window.HomeAgainTime.get() : 'night');
  return api;
}
