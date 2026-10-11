// 3D dollhouse hub (three.js). Same rules as the flat hub: the camera is fixed and
// only ever glides along one path into a room and back out. The player never steers.
import * as THREE from 'three';

const W = 4, D = 1.7;                 // half width, half depth of the house
const F0 = .3, C0 = 2.6;              // ground floor: floor top, ceiling
const F1 = 2.82, C1 = 5.15;           // upper floor
const SHELL = '#6e5238', TRIM = '#3c3326', WOOD = '#8a6440', CRAYON = '#d8a53a';
const HOME = new THREE.Vector3(0, 4.2, 18), HOME_T = new THREE.Vector3(0, 3.4, 0);
const GLIDE_MS = 1800, FLY_MS = 1100;
const BIRD_REST = new THREE.Vector3(4.8, 7.6, 3), BIRD_PERCH = new THREE.Vector3(-.8, 2.05, 2.4);
const ease = k => k < .5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
const wob = (s, f, d) => s > 6 ? 0 : Math.sin(s * f) * Math.exp(-s * d); // a tap's dying wobble
const v3 = (x, y, z) => new THREE.Vector3(x, y, z);

// where the camera settles in each room; box is the room's open front (x0, x1, y0, y1)
const VIEWS = {
  kitchen: { box: [-W, 0, F0, C0], pos: v3(-2, 1.6, 3.9), look: v3(-2, 1.15, -.6) },
  porch: { box: [0, W, F0, C0], pos: v3(2, 1.65, 4.6), look: v3(2, 1.15, -.6) },
  radio: { box: [-W, 0, F1, C1], pos: v3(-2, 4.2, 4.6), look: v3(-2, 3.7, -.6) },
  hall: { box: [0, W, F1, C1], pos: v3(2, 4.2, 4.6), look: v3(2, 3.7, -.6) },
  attic: { box: [-2.8, 2.8, C1 + .15, 6.9], pos: v3(0, 6.35, 4.8), look: v3(0, 6, -.8) }
};
const NAMES = { kitchen: 'Sunday kitchen', porch: 'garden', radio: 'Tuesday car', hall: 'Wednesday walk', attic: 'photographs' };
const ENTER = ['kitchen', 'porch', 'radio', 'hall', 'attic'];

const LABELS = [
  { text: 'Photos', room: 'attic', at: [0, 6.1, 1.6] },
  { text: 'Tuesday', room: 'radio', at: [-2, 4.7, 1.6] },
  { text: 'Wednesday', room: 'hall', at: [2, 4.7, 1.6] },
  { text: 'Sunday', room: 'kitchen', at: [-2, 2.15, 1.6], here: true },
  { text: 'Garden', room: 'porch', at: [2, 2.15, 1.6] }
];

export function createHub({ mount, kitchenBtn, onRoom, onProp, calm = false, shift = 0 }) {  // shift: slide the picture right by this fraction of the width
  const renderer = new THREE.WebGLRenderer({ antialias: true }); // throws without WebGL
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  mount.prepend(renderer.domElement);

  const scene = new THREE.Scene();
  // dusk: a painted indigo-to-peach sky behind everything, so white labels read
  const sky = document.createElement('canvas'); sky.width = 4; sky.height = 512;
  const sg = sky.getContext('2d');
  const SKY = {
    night: [[0, '#1b1f45'], [.16, '#3b3873'], [.3, '#7d5a8c'], [.41, '#cf8a80'], [.5, '#f0bb88'], [1, '#f0bb88']],
    day: [[0, '#4fa6ea'], [.16, '#7cc0ee'], [.3, '#a9d9f4'], [.41, '#d8eef9'], [.5, '#fdf1cf'], [1, '#fdf1cf']]
  };
  function paintSky(stops) {
    const g = sg.createLinearGradient(0, 0, 0, 512);
    stops.forEach(([s, c]) => g.addColorStop(s, c));
    sg.fillStyle = g; sg.fillRect(0, 0, 4, 512);
  }
  paintSky(SKY.night);
  const skyTex = new THREE.CanvasTexture(sky); skyTex.colorSpace = THREE.SRGBColorSpace;
  scene.background = skyTex;
  const fog = scene.fog = new THREE.Fog('#8a6288', 30, 80);
  const camera = new THREE.PerspectiveCamera(34, 1.6, .1, 200);

  const hemi = new THREE.HemisphereLight('#9a9ad0', '#34403f', 1.15);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight('#cfd4ff', 1.25);
  sun.position.set(7, 12, 10);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -9, right: 9, top: 9, bottom: -3, near: 1, far: 40 });
  sun.shadow.normalBias = .02;
  scene.add(sun);

  /* ---------- building blocks ---------- */
  const house = new THREE.Group();
  scene.add(house);
  const mats = {};
  const mat = c => mats[c] ??= new THREE.MeshStandardMaterial({ color: c, roughness: .9, flatShading: true });
  function put(geo, color, x, y, z, parent = house) {
    const m = new THREE.Mesh(geo, typeof color === 'string' ? mat(color) : color);
    m.position.set(x, y, z);
    m.castShadow = m.receiveShadow = true;
    parent.add(m);
    return m;
  }
  const span = (x0, x1, y0, y1, z0, z1, color, parent) =>
    put(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), color, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, parent);
  function group(x, y, z, parent = house) {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    parent.add(g);
    return g;
  }
  function light(color, intensity, dist, x, y, z, parent = house) {
    const l = new THREE.PointLight(color, intensity, dist, 2);
    l.position.set(x, y, z);
    parent.add(l);
    return l;
  }

  const windows = {};
  function pane(name, cx, cy, w, h, z, round = false) {
    const m = new THREE.MeshStandardMaterial({ color: '#8e8371', emissive: CRAYON, emissiveIntensity: 0, roughness: .4 });
    put(round ? new THREE.CircleGeometry(w / 2, 24) : new THREE.PlaneGeometry(w, h), m, cx, cy, z).castShadow = false;
    windows[name] = m;
  }
  function backWall(x0, x1, y0, y1, color, win) {
    const z0 = -D - .15, z1 = -D;
    if (!win) return span(x0, x1, y0, y1, z0, z1, color);
    const { name, cx, cy, w = 1, h = .8 } = win;
    const l = cx - w / 2, r = cx + w / 2, b = cy - h / 2, t = cy + h / 2;
    span(x0, l, y0, y1, z0, z1, color); span(r, x1, y0, y1, z0, z1, color);
    span(l, r, y0, b, z0, z1, color); span(l, r, t, y1, z0, z1, color);
    pane(name, cx, cy, w, h, -D - .08);
    span(cx - .025, cx + .025, b, t, -D - .07, -D - .03, TRIM);
    span(l, r, cy - .025, cy + .025, -D - .07, -D - .03, TRIM);
    span(l - .08, r + .08, b - .06, b, -D - .1, -D + .1, SHELL);
  }

  /* ---------- things to tap once you're inside a room ---------- */
  const props = [];
  // update(p, s, t): s = seconds since the last tap, t = clock. p.v eases toward p.on for toggles.
  function prop(room, name, obj, { update, toggle = false, on = false, tap } = {}) {
    const p = { room, name, obj, update, toggle, tap, on, v: on ? 1 : 0, t0: -1e6, hot: 0, glow: [] };
    const shared = new Set(Object.values(mats));
    obj.traverse(m => {
      if (!m.isMesh) return;
      m.userData.prop = p;
      if (m.userData.own || !m.material.emissive) return;
      if (shared.has(m.material)) m.material = m.material.clone();
      m.material.emissive.set(CRAYON);
      p.glow.push(m.material);
    });
    props.push(p);
    return p;
  }

  /* ---------- the house: front wall removed ---------- */
  const ROOMS = [
    { name: 'kitchen', x0: -W, x1: 0, f: F0, c: C0, wall: '#e3d3ae', floor: '#b39468', win: { cx: -2, cy: F0 + 1.35 } },
    { name: 'porch', x0: 0, x1: W, f: F0, c: C0, wall: '#cbc6a6', floor: '#a59a74', win: { cx: 2.9, cy: F0 + 1.35, w: .9 } },
    { name: 'radio', x0: -W, x1: 0, f: F1, c: C1, wall: '#c9b48c', floor: '#a88660', win: { cx: -2.5, cy: F1 + 1.3 } },
    { name: 'hall', x0: 0, x1: W, f: F1, c: C1, wall: '#d6c3a0', floor: '#a88660' }
  ];
  for (const r of ROOMS) {
    span(r.x0, r.x1, r.f - .08, r.f, -D, D, r.floor);
    backWall(r.x0, r.x1, r.f, r.c, r.wall, r.win && { name: r.name, ...r.win });
    const [o0, o1] = r.x0 === -W ? [-W - .15, -W] : [W, W + .15];
    span(o0, o1, r.f - .08, r.c, -D - .15, D, r.wall);
  }
  span(-.06, .06, F0, C0, -D, D, '#d9c9a5');
  span(-.06, .06, F1, C1, -D, D, '#d9c9a5');
  span(-W - .3, W + .3, 0, .22, -D - .3, D + .15, SHELL);              // foundation
  span(-W - .15, W + .15, C0, F1 - .08, -D - .15, D, SHELL);           // between floors
  span(-W - .15, W + .15, C1, C1 + .15, -D - .15, D, SHELL);           // attic floor
  for (const [a, b] of [[-W - .2, -W + .05], [-.1, .1], [W - .05, W + .2]]) span(a, b, .22, C1 + .15, D, D + .12, SHELL);
  span(-W - .2, W + .2, C0, F1, D, D + .12, SHELL);
  span(-W - .2, W + .2, C1, C1 + .15, D, D + .12, SHELL);

  // attic gable, round window, roof
  const gable = new THREE.Shape([new THREE.Vector2(-W, C1 + .15), new THREE.Vector2(W, C1 + .15), new THREE.Vector2(0, 7.2)]);
  put(new THREE.ExtrudeGeometry(gable, { depth: .15, bevelEnabled: false }), '#e0d1ae', 0, 0, -D - .15);
  pane('attic', 0, 6.2, .6, .6, -D + .005, true);
  put(new THREE.TorusGeometry(.3, .035, 8, 24), TRIM, 0, 6.2, -D + .01);
  const roofLen = Math.hypot(4.6, 2.3), roofTilt = Math.atan2(2.3, 4.6);
  for (const s of [-1, 1]) {
    const roof = put(new THREE.BoxGeometry(roofLen + .1, .18, 4.1), '#9c5a3c', s * 2.3, 6.3, -.05);
    roof.rotation.z = -s * roofTilt;
  }
  span(-.15, .15, 7.35, 7.55, -2.1, 2, '#7d4630');
  span(2.2, 2.7, 6.2, 7.6, -1.1, -.6, '#8a5a44');

  // each room's own warm light: brightens when hovered from outside, and while you're in it
  const roomLights = {
    porch: light('#ffcf87', 0, 5, 2.3, C0 - .5, .1),
    radio: light('#ffcf87', 0, 5, -2, C1 - .5, .4),
    hall: light('#ffcf87', 0, 5, 2, C1 - .6, .2),
    attic: light('#ffcf87', 0, 5, 0, 6.5, .8)
  };

  /* ---------- kitchen: the table waiting for Sunday dinner ---------- */
  const tx = -2, tz = .3, top = F0 + .75;
  span(tx - .85, tx + .85, top - .04, top + .03, tz - .47, tz + .47, WOOD);
  for (const [dx, dz] of [[-.75, -.38], [.75, -.38], [-.75, .38], [.75, .38]]) span(tx + dx - .035, tx + dx + .035, F0, top - .04, tz + dz - .035, tz + dz + .035, '#5a4130');
  for (const dx of [-.5, 0, .5]) {
    put(new THREE.CylinderGeometry(.14, .12, .02, 20), '#f4eee0', tx + dx, top + .04, tz - .15);
    chair(tx + dx, tz - .65, 0, WOOD);
  }
  chair(tx - 1.1, tz, Math.PI / 2, WOOD, '#697a5c');                    // the player's chair, sage cushion
  put(new THREE.CylinderGeometry(.06, .05, .16, 12), '#bf7a72', tx + .1, top + .11, tz + .18);
  put(new THREE.IcosahedronGeometry(.09, 0), '#d8a53a', tx + .1, top + .23, tz + .18);
  span(-3.9, -2.9, F0, F0 + .85, -D, -D + .5, '#c9b48c');                  // counter
  span(-3.95, -2.85, F0 + .85, F0 + .9, -D, -D + .55, WOOD);
  for (const [x, c] of [[-3.7, '#9c3b2e'], [-3.45, '#697a5c'], [-3.2, '#d8a53a']]) put(new THREE.CylinderGeometry(.07, .07, .2, 12), c, x, F0 + 1, -D + .25);
  span(-1.2, -.3, F0 + 1.55, F0 + 1.6, -D, -D + .25, WOOD);                // shelf
  put(new THREE.CylinderGeometry(.008, .008, .5, 6), TRIM, tx, C0 - .25, tz);
  put(new THREE.ConeGeometry(.24, .2, 20, 1, true), mat(CRAYON).clone(), tx, C0 - .55, tz).material.side = THREE.DoubleSide;
  put(new THREE.SphereGeometry(.06, 12, 8), new THREE.MeshBasicMaterial({ color: '#fff3d6' }), tx, C0 - .63, tz);
  const lamp = light('#ffcf87', 3, 5, tx, C0 - .7, tz);
  const windowGlow = light('#ffc46b', 0, 4, -2, F0 + 1.3, -1.1);

  function chair(x, z, rot, color, cushion) {
    const g = new THREE.Group();
    g.position.set(x, 0, z); g.rotation.y = rot;
    house.add(g);
    span(-.2, .2, F0 + .42, F0 + .47, -.2, .2, color, g);
    span(-.2, .2, F0 + .47, F0 + 1, -.22, -.18, color, g);
    for (const [dx, dz] of [[-.17, -.17], [.17, -.17], [-.17, .17], [.17, .17]]) span(dx - .025, dx + .025, F0, F0 + .42, dz - .025, dz + .025, color, g);
    if (cushion) span(-.17, .17, F0 + .47, F0 + .52, -.17, .17, cushion, g);
  }

  /* ---------- porch: back door, rocking chair, wind chime, plant ---------- */
  put(new THREE.PlaneGeometry(.8, 1.75), new THREE.MeshBasicMaterial({ color: '#f4e7c0' }), 1.4, F0 + .875, -D + .004).castShadow = false; // daylight behind the door
  const door = group(1, 0, -D + .05);
  span(0, .8, F0, F0 + 1.75, -.05, 0, '#9c6a50', door);
  span(.1, .7, F0 + 1, F0 + 1.6, 0, .015, '#8a5c44', door);
  span(.1, .7, F0 + .15, F0 + .85, 0, .015, '#8a5c44', door);
  put(new THREE.SphereGeometry(.04, 8, 6), CRAYON, .68, F0 + .9, .03, door);
  const daylight = light('#ffe2a8', 0, 3.5, 1.4, F0 + 1, -1.1);
  prop('porch', 'door', door, { toggle: true, update: p => { door.rotation.y = -p.v * 1.35; daylight.intensity = p.v * 3; } });

  span(2.3, 3.5, F0 + .42, F0 + .5, -1.45, -1.05, '#9c6a50');               // bench
  for (const x of [2.4, 3.4]) span(x - .04, x + .04, F0, F0 + .42, -1.4, -1.1, TRIM);
  span(1.6, 2.6, F0, F0 + .01, .6, 1.3, '#9c3b2e');                          // doormat

  const rocker = group(.75, F0, .45);
  rocker.rotation.order = 'YXZ'; rocker.rotation.y = .6;
  for (const x of [-.2, .2]) {
    span(x - .025, x + .025, 0, .05, -.36, .36, '#5a4130', rocker);
    for (const z of [-.17, .17]) span(x - .022, x + .022, .05, .4, z - .022, z + .022, '#7a5a3c', rocker);
    span(x - .03, x + .03, .64, .68, -.2, .22, '#7a5a3c', rocker);
    span(x - .02, x + .02, .45, .64, .17, .21, '#7a5a3c', rocker);
  }
  span(-.22, .22, .4, .45, -.2, .22, '#7a5a3c', rocker);
  span(-.22, .22, .45, 1.08, -.24, -.19, '#7a5a3c', rocker);
  span(-.18, .18, .45, .5, -.17, .19, '#9c3b2e', rocker);
  prop('porch', 'rocker', rocker, { update: (p, s) => { rocker.rotation.x = wob(s, 3.2, .45) * .2; } });

  const chimes = group(.5, C0, -1);
  put(new THREE.CylinderGeometry(.006, .006, .3, 4), TRIM, 0, -.15, 0, chimes);
  put(new THREE.CylinderGeometry(.09, .09, .025, 12), WOOD, 0, -.3, 0, chimes);
  const rods = [0, 1, 2, 3, 4].map(i => {
    const a = i / 5 * Math.PI * 2, l = .2 + i * .04;
    const r = group(Math.cos(a) * .065, -.31, Math.sin(a) * .065, chimes);
    put(new THREE.CylinderGeometry(.012, .012, l, 6), '#c9b07a', 0, -l / 2, 0, r);
    return r;
  });
  prop('porch', 'chime', chimes, { update: (p, s) => {
    chimes.rotation.z = wob(s, 4, .7) * .25;
    rods.forEach((r, i) => { r.rotation.x = wob(s, 6 + i, 1) * .25; });
  } });

  const plant = group(3.4, F0, .9);
  put(new THREE.CylinderGeometry(.2, .15, .35, 12), '#9c5a3c', 0, .175, 0, plant);
  put(new THREE.IcosahedronGeometry(.32, 0), '#697a5c', 0, .55, 0, plant);
  put(new THREE.IcosahedronGeometry(.2, 0), '#4a6757', .12, .8, .05, plant);
  prop('porch', 'plant', plant, { update: (p, s) => { const k = wob(s, 14, 3.5) * .14; plant.scale.set(1 - k * .5, 1 + k, 1 - k * .5); } });

  const lantern = group(2.4, C0, .1);                                       // porch lantern
  put(new THREE.CylinderGeometry(.006, .006, .3, 4), TRIM, 0, -.15, 0, lantern);
  span(-.08, .08, -.5, -.3, -.08, .08, TRIM, lantern).material = new THREE.MeshStandardMaterial({ color: '#3c3326', transparent: true, opacity: .35 });
  put(new THREE.SphereGeometry(.05, 10, 8), new THREE.MeshBasicMaterial({ color: '#ffe3a6' }), 0, -.4, 0, lantern);

  /* ---------- radio room: radio, reading lamp, bookshelf, armchair ---------- */
  put(new THREE.CylinderGeometry(.95, .95, .01, 32), '#b07a5c', -2, F1 + .005, .1);
  span(-1.5, -.7, F1, F1 + .55, -1.55, -1.15, WOOD);                          // side table

  const radio = group(-1.1, F1 + .55, -1.35);
  span(-.3, .3, 0, .38, -.15, .15, '#b89a6d', radio);
  span(-.31, .31, .38, .42, -.16, .16, WOOD, radio);
  span(-.25, .02, .06, .32, .15, .16, '#6b5236', radio);                       // speaker cloth
  const dial = group(.15, .18, .15, radio);
  put(new THREE.CylinderGeometry(.08, .08, .03, 16), '#efe6cf', 0, 0, .015, dial).rotation.x = Math.PI / 2;
  span(-.008, .008, 0, .07, .03, .036, TRIM, dial);
  const radioLight = new THREE.MeshStandardMaterial({ color: '#7a5a2c', emissive: CRAYON, emissiveIntensity: 0 });
  put(new THREE.SphereGeometry(.022, 8, 6), radioLight, .15, .32, .15, radio).userData.own = true;
  prop('radio', 'radio', radio, { toggle: true, update: (p, s, t) => {
    dial.rotation.z = -p.v * 2.4;
    radioLight.emissiveIntensity = p.v * 2.5;
    radio.scale.y = 1 + (p.on && !calm ? Math.abs(Math.sin(t * 6)) * .03 : 0);   // bobs along to the music
  } });

  const floorLamp = group(-.4, F1, -1.1);
  put(new THREE.CylinderGeometry(.14, .16, .03, 16), TRIM, 0, .015, 0, floorLamp);
  put(new THREE.CylinderGeometry(.015, .015, 1.4, 6), TRIM, 0, .72, 0, floorLamp);
  const shadeMat = new THREE.MeshStandardMaterial({ color: '#e8d3a0', emissive: '#ffcf87', emissiveIntensity: .8, side: THREE.DoubleSide, flatShading: true });
  put(new THREE.CylinderGeometry(.13, .22, .25, 16, 1, true), shadeMat, 0, 1.45, 0, floorLamp).userData.own = true;
  const readLight = light('#ffcf87', 2, 3.5, -.4, F1 + 1.3, -1.1);
  prop('radio', 'lamp', floorLamp, { toggle: true, on: true, update: p => { shadeMat.emissiveIntensity = .05 + p.v * .8; readLight.intensity = p.v * 2.2; } });

  const shelf = group(-3.7, F1, -D);
  span(-.26, .26, 0, 1.7, 0, .03, '#6b4a30', shelf);
  for (const x of [-.26, .22]) span(x, x + .04, 0, 1.7, 0, .32, '#6b4a30', shelf);
  for (const y of [0, .55, 1.1, 1.66]) span(-.22, .22, y, y + .04, 0, .32, '#6b4a30', shelf);
  const BOOKS = ['#9c3b2e', '#697a5c', '#d8a53a', '#3f5a7a', '#b07a5c', '#efe6cf', '#5a4130'];
  const books = [];
  [.04, .59, 1.14].forEach((y, row) => {
    for (let x = -.2, i = row * 3; x < .17; i++) {
      const w = .05 + (i * 7 % 4) * .01, h = .3 + (i * 5 % 4) * .04;
      const b = span(x, x + w, y, y + h, .04, .28, BOOKS[i % BOOKS.length], shelf);
      b.userData.z = b.position.z;
      books.push(b);
      x += w + .005;
    }
  });
  prop('radio', 'books', shelf, {
    tap: p => { p.book = Math.floor(Math.random() * books.length); },
    update: (p, s) => books.forEach((b, i) => { b.position.z = b.userData.z + (i === p.book && s < 1.6 ? Math.sin(s / 1.6 * Math.PI) * .16 : 0); })
  });

  const armchair = group(-3, F1, -.75);
  span(-.4, .4, 0, .4, -.35, .35, '#4a6757', armchair);
  span(-.4, .4, .4, 1.05, -.35, -.17, '#4a6757', armchair);
  for (const x of [-.4, .25]) span(x, x + .15, .4, .62, -.35, .35, '#6b7a5c', armchair);
  span(-.25, .25, .4, .48, -.17, .33, '#8c9c7c', armchair);
  prop('radio', 'armchair', armchair, { update: (p, s) => { const k = wob(s, 10, 3) * .08; armchair.scale.set(1 + k * .5, 1 - k, 1 + k * .5); } });

  /* ---------- hall: family photos, grandfather clock, coat rack, vase ---------- */
  span(.6, 3.4, F1, F1 + .01, -.1, .45, '#9c3b2e');                            // hall runner
  span(1.2, 2.8, F1 + .76, F1 + .82, -D, -D + .35, WOOD);                      // console
  for (const x of [1.25, 2.75]) span(x - .03, x + .03, F1, F1 + .76, -D + .25, -D + .31, TRIM);
  const photos = [1.1, 2, 2.9].map((x, i) => {
    const g = group(x, F1 + 1.75, -D);                                         // hangs from its nail
    g.rotation.z = [-.03, .02, -.015][i];
    put(new THREE.SphereGeometry(.015, 6, 4), TRIM, 0, 0, .01, g);
    span(-.31, .31, -.56, -.04, 0, .05, '#6b5236', g);
    put(new THREE.PlaneGeometry(.54, .44), '#faf5e8', 0, -.3, .052, g);
    const m = new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: .8 });
    put(new THREE.PlaneGeometry(.48, .36), m, 0, -.28, .054, g);
    const rest = g.rotation.z;
    prop('hall', 'photo', g, { update: (p, s) => { g.rotation.z = rest + wob(s, 5, 1.1) * .14; } });
    return { g, m };
  });

  const clock = group(3.55, F1, -D);
  span(-.25, .25, 0, 1.95, 0, .32, '#6b4a30', clock);
  span(-.28, .28, 1.95, 2.05, -.01, .35, '#5a3d28', clock);
  span(-.15, .15, .35, 1.3, .32, .325, '#3c3326', clock);
  put(new THREE.CylinderGeometry(.17, .17, .02, 24), '#f4eee0', 0, 1.62, .33, clock).rotation.x = Math.PI / 2;
  const hourHand = group(0, 1.62, .345, clock), minuteHand = group(0, 1.62, .35, clock);
  span(-.01, .01, 0, .09, 0, .006, TRIM, hourHand);
  span(-.007, .007, 0, .14, 0, .006, TRIM, minuteHand);
  hourHand.rotation.z = -2.1;
  const pendulum = group(0, 1.3, .33, clock);
  span(-.008, .008, -.75, 0, 0, .01, '#c9b07a', pendulum);
  put(new THREE.CylinderGeometry(.07, .07, .015, 16), CRAYON, 0, -.75, .01, pendulum).rotation.x = Math.PI / 2;
  prop('hall', 'clock', clock, { update: (p, s, t) => {
    pendulum.rotation.z = calm ? 0 : Math.sin(t * 2.2) * .16;
    minuteHand.rotation.z = -.5 - ease(Math.min(1, s / 2)) * Math.PI * 2;      // a tap winds it round once
  } });

  const rack = group(.45, F1, -1.1);
  put(new THREE.CylinderGeometry(.16, .18, .04, 12), TRIM, 0, .02, 0, rack);
  put(new THREE.CylinderGeometry(.025, .025, 1.72, 6), '#5a4130', 0, .88, 0, rack);
  for (const a of [0, 2.1, 4.2]) span(-.01, .01, 1.52, 1.6, 0, .13, '#5a4130', group(0, 0, 0, rack)).parent.rotation.y = a;
  span(.08, .14, .95, 1.55, .02, .05, CRAYON, rack);                          // scarf on a hook
  const hat = group(0, 1.76, 0, rack);
  put(new THREE.CylinderGeometry(.17, .17, .02, 16), '#5a4130', 0, 0, 0, hat);
  put(new THREE.CylinderGeometry(.09, .1, .13, 16), '#5a4130', 0, .07, 0, hat);
  put(new THREE.CylinderGeometry(.101, .101, .03, 16), '#9c3b2e', 0, .03, 0, hat);
  prop('hall', 'hat', rack, { update: (p, s) => {
    hat.position.y = 1.76 + (s < 1 ? Math.sin(s * Math.PI) * .25 : 0);
    hat.rotation.y = ease(Math.min(1, s)) * Math.PI * 2;
  } });

  const vase = group(2.45, F1 + .82, -D + .18);
  put(new THREE.CylinderGeometry(.05, .07, .22, 10), '#3f5a7a', 0, .11, 0, vase);
  for (const [dx, h, c] of [[-.03, .4, '#9c3b2e'], [.02, .46, '#d8a53a'], [.04, .36, '#efe6cf']]) {
    const stem = put(new THREE.CylinderGeometry(.005, .005, h - .2, 4), '#697a5c', dx, .2 + (h - .2) / 2, 0, vase);
    stem.rotation.z = -dx * 4;
    put(new THREE.IcosahedronGeometry(.04, 0), c, dx * 2, h, 0, vase);
  }
  prop('hall', 'vase', vase, { update: (p, s) => { vase.rotation.z = wob(s, 11, 2.2) * .12; } });

  put(new THREE.CylinderGeometry(.006, .006, .4, 4), TRIM, 2, C1 - .2, .2);   // hall pendant
  put(new THREE.ConeGeometry(.16, .14, 16, 1, true), '#3f5a7a', 2, C1 - .43, .2).material.side = THREE.DoubleSide;
  put(new THREE.SphereGeometry(.045, 10, 8), new THREE.MeshBasicMaterial({ color: '#fff3d6' }), 2, C1 - .5, .2);

  /* ---------- attic: the old trunk, rocking horse, bare bulb ---------- */
  span(-2.1, -1.5, C1 + .15, C1 + .6, -1.3, -.8, '#a77d50');
  span(-3, -2.5, C1 + .15, C1 + .5, -1.2, -.7, '#c4a477');                    // a box of something

  const trunk = group(1.6, C1 + .15, -1.05);
  span(-.45, .45, 0, .36, -.25, .25, '#b48a5a', trunk);
  for (const x of [-.27, .27]) span(x - .03, x + .03, 0, .365, -.255, .255, '#6b4a30', trunk);
  put(new THREE.PlaneGeometry(.84, .44), new THREE.MeshBasicMaterial({ color: '#f3d48a' }), 0, .362, 0, trunk).rotation.x = -Math.PI / 2;
  const lid = group(0, .37, -.25, trunk);
  span(-.46, .46, 0, .13, 0, .51, '#a77d50', lid);
  span(-.04, .04, -.06, .06, .5, .525, CRAYON, lid);
  const trunkGlow = light('#ffd98a', 0, 2.5, 1.6, C1 + .8, -.9);
  prop('attic', 'trunk', trunk, { toggle: true, update: p => { lid.rotation.x = -p.v * 1.75; trunkGlow.intensity = p.v * 3; } });

  const horse = group(-.7, C1 + .15, -.3);
  horse.rotation.order = 'YXZ'; horse.rotation.y = .35;
  for (const z of [-.12, .12]) {
    const arc = put(new THREE.TorusGeometry(.6, .022, 6, 16, 1.2), '#9c3b2e', 0, .6, z, horse);
    arc.rotation.z = -Math.PI / 2 - .6;
    for (const x of [-.22, .22]) span(x - .02, x + .02, .04, .36, z * .8 - .02, z * .8 + .02, '#efe6cf', horse);
  }
  span(-.3, .25, .34, .54, -.1, .1, '#efe6cf', horse);
  span(.17, .31, .5, .84, -.07, .07, '#efe6cf', horse);
  span(.22, .48, .74, .88, -.07, .07, '#efe6cf', horse);
  span(.13, .2, .55, .9, -.03, .03, '#9c3b2e', horse);
  span(-.38, -.3, .38, .55, -.03, .03, '#9c3b2e', horse);
  span(-.1, .1, .54, .57, -.11, .11, '#9c3b2e', horse);
  for (const z of [-.071, .071]) put(new THREE.SphereGeometry(.015, 6, 4), TRIM, .4, .83, z, horse);
  prop('attic', 'horse', horse, { update: (p, s) => { horse.rotation.z = wob(s, 3.5, .5) * .2; } });

  const bulb = group(0, 7.25, .2);
  put(new THREE.CylinderGeometry(.005, .005, .45, 4), TRIM, 0, -.225, 0, bulb);
  put(new THREE.CylinderGeometry(.025, .025, .05, 8), TRIM, 0, -.46, 0, bulb);
  const bulbMat = new THREE.MeshBasicMaterial({ color: '#fff3d6' });
  put(new THREE.SphereGeometry(.055, 12, 8), bulbMat, 0, -.52, 0, bulb);
  const bulbLight = light('#ffcf87', 2.5, 5, 0, -.6, 0, bulb);
  prop('attic', 'bulb', bulb, { toggle: true, on: true, update: (p, s) => {
    bulb.rotation.z = wob(s, 3, .6) * .25;
    bulbMat.color.set(p.v > .5 ? '#fff3d6' : '#8e8371');
    bulbLight.intensity = p.v * 2.5;
  } });

  /* ---------- garden ---------- */
  put(new THREE.CircleGeometry(60, 48), '#3c5045', 0, 0, 0).rotation.x = -Math.PI / 2;
  put(new THREE.PlaneGeometry(1.2, 9), '#8a7c78', 2, .01, 6.2).rotation.x = -Math.PI / 2;
  for (const [x, z, s, c] of [[-14, -26, [22, 5, 8], '#5d5a8a'], [16, -30, [26, 6, 9], '#4d4c7d'], [0, -40, [30, 7, 8], '#5d5a8a']]) {
    const hill = put(new THREE.SphereGeometry(1, 24, 12), c, x, 0, z);
    hill.scale.set(...s); hill.castShadow = false;
  }
  const orb = put(new THREE.SphereGeometry(1.5, 16, 12), new THREE.MeshBasicMaterial({ color: '#f6eed6', fog: false }), 16, 13, -30);
  for (const [x, z, s] of [[-7, -1.5, 1.2], [7.6, -2.6, 1.4], [-9.5, -6, 1.1]]) {
    put(new THREE.CylinderGeometry(.12 * s, .16 * s, 1.5 * s, 6), SHELL, x, .75 * s, z);
    put(new THREE.IcosahedronGeometry(1.1 * s, 0), '#3e594c', x, 2 * s, z);
    put(new THREE.IcosahedronGeometry(.75 * s, 0), '#4a6757', x + .3 * s, 2.8 * s, z + .2);
  }
  for (const [x, z, r] of [[-5, 2.2, .5], [-5.6, 1.4, .4], [5.3, 2, .5], [5.9, 1.2, .4], [.8, 2.8, .3]]) put(new THREE.IcosahedronGeometry(r, 0), '#3e594c', x, r * .6, z);

  /* ---------- the paper bird ---------- */
  const bird = new THREE.Group(), tilt = new THREE.Group(), body = new THREE.Group();
  bird.add(tilt); tilt.add(body);
  body.rotation.y = -Math.PI / 2;  // modelled facing +x; lookAt points +z
  bird.scale.setScalar(.55);
  scene.add(bird);
  const paper = new THREE.MeshStandardMaterial({ color: '#f7f2e4', emissive: CRAYON, emissiveIntensity: 0, side: THREE.DoubleSide, flatShading: true });
  const wingPaper = paper.clone(); wingPaper.color.set('#e4dbc6');
  const crease = new THREE.LineBasicMaterial({ color: '#6b6151' });
  function tri(pts, m, parent) {
    const geo = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(pts.flat(), 3));
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, m); mesh.castShadow = true;
    parent.add(mesh, new THREE.LineSegments(new THREE.EdgesGeometry(geo), crease));
  }
  tri([[-.5, 0, 0], [.5, .05, 0], [0, -.18, 0]], paper, body);
  tri([[.5, .05, 0], [.38, .22, 0], [.32, .02, 0]], paper, body);
  tri([[-.5, 0, 0], [-.68, .24, 0], [-.36, .02, 0]], paper, body);
  const wings = [-1, 1].map(s => {
    const w = new THREE.Group(); body.add(w);
    tri([[-.18, 0, 0], [.22, 0, 0], [-.02, 0, s * .6]], wingPaper, w);
    return w;
  });
  const flight = new THREE.QuadraticBezierCurve3(BIRD_REST, new THREE.Vector3(2, 6.8, 6.5), BIRD_PERCH);

  /* ---------- labels, room hit areas ---------- */
  const labels = LABELS.map(l => {
    const el = document.createElement('div');
    el.className = 'roomlbl' + (l.here ? ' here' : '');
    el.textContent = l.text;
    mount.appendChild(el);
    return { el, room: l.room, at: new THREE.Vector3(...l.at) };
  });
  let hoverRoom = null;
  const btns = ENTER.map(name => {
    let b = kitchenBtn;
    if (name !== 'kitchen') {
      b = document.createElement('button');
      b.className = 'roombtn';
      b.setAttribute('aria-label', `Go into the ${NAMES[name]}`);
    }
    b.addEventListener('click', () => onRoom?.(name));
    mount.appendChild(b);
    const on = () => { hoverRoom = name; }, off = () => { if (hoverRoom === name) hoverRoom = null; };
    b.addEventListener('pointerenter', on); b.addEventListener('focus', on);
    b.addEventListener('pointerleave', off); b.addEventListener('blur', off);
    const [x0, x1, y0, y1] = VIEWS[name].box;
    return { b, corners: [x0, x1].flatMap(x => [y0, y1].map(y => new THREE.Vector3(x, y, D))) };
  });

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
  }

  /* ---------- tapping things inside a room ---------- */
  const cvs = renderer.domElement, ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  let hoverProp = null;
  function pick(e) {
    if (mode !== 'inside' || room === 'kitchen') return null;
    const r = cvs.getBoundingClientRect();
    ndc.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const p = ray.intersectObjects(house.children, true)[0]?.object.userData.prop;  // nearest hit, so walls still block
    return p?.room === room ? p : null;
  }
  function setHoverProp(p) { hoverProp = p; cvs.style.cursor = p ? 'pointer' : ''; }
  cvs.addEventListener('pointermove', e => setHoverProp(pick(e)));
  cvs.addEventListener('pointerleave', () => setHoverProp(null));
  cvs.addEventListener('click', e => {
    const p = pick(e);
    if (!p) return;
    p.t0 = performance.now();
    if (p.toggle) p.on = !p.on;
    p.tap?.(p);
    onProp?.(p.name, p.on);
  });

  /* ---------- state ---------- */
  let night = true;
  let active = true, mode = 'home', glide = null, room = 'kitchen', last = 0;
  let birdMode = 'rest', birdT0 = 0, listening = false, kitchenLit = false, peopleKey = '';
  const lit = { kitchen: false, porch: false, radio: false, attic: false, hall: false };
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
    // start the glide from wherever the parallax left the camera, so it never jumps
    path.points[dir > 0 ? 0 : 2].copy(camera.position);
    path.points[dir > 0 ? 2 : 0].copy(dir > 0 ? VIEWS[room].pos : HOME);
    mount.classList.toggle('away', true);
    hoverRoom = null; setHoverProp(null);
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
  aim('kitchen');
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
        // inside a room: the same slight lean, much smaller
        const view = VIEWS[room];
        camera.position.set(view.pos.x - par.x * .3, view.pos.y + par.y * .15, view.pos.z);
        camera.lookAt(view.look);
      }
    }

    // kitchen window: pulses until the piece is found, then glows steady
    const pulse = calm ? .5 : .5 + .5 * Math.sin(t * 2.6);
    windows.kitchen.emissiveIntensity = (kitchenLit || lit.kitchen) ? 1.5 : .25 + .55 * pulse;
    windowGlow.intensity = (kitchenLit || lit.kitchen) ? 2.5 : 0;
    ['porch', 'radio', 'attic', 'hall'].forEach((name) => {
      if (windows[name]) windows[name].emissiveIntensity = lit[name] ? 1.6 : hoverRoom === name ? (night ? 1.2 : .55) : (night ? 0.7 : 0.08);
    });
    lamp.intensity = hoverRoom === 'kitchen' ? 6 : 3;
    for (const [name, l] of Object.entries(roomLights)) {
      const goal = mode !== 'home' && room === name ? 1.6 : hoverRoom === name ? 3.6 : (night ? 1.5 : .3);
      l.intensity = calm ? goal : l.intensity + (goal - l.intensity) * Math.min(1, dt * 6);
    }

    for (const p of props) {
      p.v = calm ? +p.on : p.v + (+p.on - p.v) * Math.min(1, dt * 4);
      p.hot += ((hoverProp === p ? 1 : 0) - p.hot) * Math.min(1, dt * 10);
      for (const m of p.glow) m.emissiveIntensity = p.hot * .3;
      p.update?.(p, calm ? 99 : (now - p.t0) / 1000, t);
    }

    // bird
    if (birdMode === 'flying') {
      const k = Math.min(1, Math.max(0, (now - birdT0) / FLY_MS)), e = ease(k);
      flight.getPoint(e, bird.position);
      bird.lookAt(flight.getPoint(Math.min(1, e + .02)));
      if (k >= 1) birdMode = 'perched';
    } else if (birdMode === 'perched') {
      bird.position.copy(BIRD_PERCH);
      if (!calm) bird.position.y += Math.sin(t * 1.6) * .06;
      bird.lookAt(BIRD_PERCH.x - 1, BIRD_PERCH.y, BIRD_PERCH.z + 1.2);
    } else {
      bird.position.copy(BIRD_REST);
      if (!calm) bird.position.y += Math.sin(t * 1.6) * .12;
      bird.lookAt(BIRD_REST.x - 1, BIRD_REST.y, BIRD_REST.z + .4);
    }
    // hovers at the kitchen with slow wingbeats; flaps fast while flying
    const flap = calm ? .2 : Math.sin(t * (birdMode === 'flying' ? 16 : 6)) * .7;
    wings[0].rotation.x = flap; wings[1].rotation.x = -flap;
    tilt.rotation.z = listening && !calm ? Math.sin(t * 2.4) * .25 : 0;
    paper.emissiveIntensity = wingPaper.emissiveIntensity = listening ? .35 + .25 * pulse : 0;

    renderer.render(scene, camera);
  }
  requestAnimationFrame(frame);

  // day palette = the original sunny colours; night palette = the dusk ones used by default
  const DAY_TINT = { '#3c5045': '#8c9a74', '#8a7c78': '#cdbf9f', '#5d5a8a': '#b9b597', '#4d4c7d': '#a3a382', '#3e594c': '#6f8160', '#4a6757': '#7d8d6e' };
  function setTime(m) {
    night = m !== 'day';
    paintSky(night ? SKY.night : SKY.day);
    skyTex.needsUpdate = true;
    fog.color.set(night ? '#8a6288' : '#e9f0e4');
    hemi.color.set(night ? '#9a9ad0' : '#fff4e0'); hemi.groundColor.set(night ? '#34403f' : '#8c9a74'); hemi.intensity = night ? 1.15 : 1.6;
    sun.color.set(night ? '#cfd4ff' : '#ffe9c4'); sun.intensity = night ? 1.25 : 2.2;
    for (const [nightHex, dayHex] of Object.entries(DAY_TINT)) if (mats[nightHex]) mats[nightHex].color.set(night ? nightHex : dayHex);
    orb.material.color.set(night ? '#f6eed6' : '#ffd95e');
  }
  window.addEventListener('homeagain:time', e => setTime(e.detail));

  const api = {
    setTime,
    setActive(on) { active = on; },
    reset() { glide = null; finishGlide(-1); },
    glideIn: (name = 'kitchen') => go(1, name),
    glideOut: () => go(-1),
    birdReset() { birdMode = 'rest'; },
    birdToKitchen() { birdMode = calm ? 'perched' : 'flying'; birdT0 = performance.now(); },
    setListening(on) { listening = on; },
    setKitchenLit(on) { kitchenLit = on; lit.kitchen = on; },
    setLit(name, on) {
      lit[name] = !!on;
      if (name === 'kitchen') kitchenLit = !!on;
    },
    pointer(dx, dy) { par.tx = dx; par.ty = dy; },
    setPeople(people) {
      const key = JSON.stringify(people.map(p => [p.name, p.photo, p.look]));
      if (key === peopleKey) return;
      peopleKey = key;
      photos.forEach((ph, i) => {
        const p = people[i];
        ph.g.visible = !!p;
        if (!p) return;
        ph.m.map = portraitTexture(p);
        ph.m.needsUpdate = true;
        if (p.photo) new THREE.TextureLoader().load(p.photo, tex => {
          if (peopleKey !== key) return;
          tex.colorSpace = THREE.SRGBColorSpace;
          cover(tex, .48 / .36);
          ph.m.map = tex;
          ph.m.needsUpdate = true;
        }, undefined, () => {});
      });
    }
  };
  setTime(window.HomeAgainTime ? window.HomeAgainTime.get() : 'night');
  return api;
}

// crop a photo texture to fill the frame, like object-fit: cover
function cover(tex, aspect) {
  const a = tex.image.width / tex.image.height;
  if (a > aspect) { tex.repeat.set(aspect / a, 1); tex.offset.set((1 - aspect / a) / 2, 0); }
  else { tex.repeat.set(1, a / aspect); tex.offset.set(0, (1 - a / aspect) / 2); }
}

// the same drawn stand-in portrait as the 2D pages, for families without photos yet
function portraitTexture(p) {
  const l = p.look || {}, c = document.createElement('canvas');
  c.width = 400; c.height = 320;
  const g = c.getContext('2d');
  g.scale(4, 4);
  g.fillStyle = l.bg || '#d5ccb8'; g.fillRect(0, 0, 100, 80);
  g.fillStyle = l.cloth || '#6f6480'; g.fill(new Path2D('M12 80c2-19 16-27 38-27s36 8 38 27z'));
  g.fillStyle = l.skin || '#d9b394'; g.beginPath(); g.arc(50, 32, 16, 0, Math.PI * 2); g.fill();
  g.fillStyle = l.hair || '#3b3240'; g.fill(new Path2D('M34 31c0-13 9-19 17-19 9 0 16 7 15 19-4-7-9-10-16-10-6 0-11 3-16 10z'));
  if (l.beard) g.fill(new Path2D('M36 34c1 12 27 12 28 0 0 9-6 14-14 14s-14-5-14-14z'));
  if (l.glasses) {
    g.strokeStyle = '#2b2620'; g.lineWidth = 2;
    g.beginPath(); g.arc(43.5, 33, 5, 0, Math.PI * 2); g.moveTo(61.5, 33); g.arc(56.5, 33, 5, 0, Math.PI * 2); g.moveTo(48.5, 33); g.lineTo(51.5, 33); g.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
