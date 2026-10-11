// The other two dioramas, built like the dollhouse hub (hub3d.js): a fixed camera that only glides
// into a place and back out, with the same dusk and daytime looks.
//   kind 'childhood': a storybook yard. A treehouse (the toy box) and Grandma's little cottage (the recipe).
//   kind 'today':     a morning room. A table with the letter, and a desk with the journal.
import * as THREE from 'three';

const GLIDE_MS = 1700;
const TRIM = '#3c3326', WOOD = '#8a6440', CRAYON = '#d8a53a';
const ease = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
const v3 = (x, y, z) => new THREE.Vector3(x, y, z);

const SKY = {
  night: [[0, '#1b1f45'], [0.16, '#3b3873'], [0.3, '#7d5a8c'], [0.41, '#cf8a80'], [0.5, '#f0bb88'], [1, '#f0bb88']],
  day: [[0, '#4fa6ea'], [0.16, '#7cc0ee'], [0.3, '#a9d9f4'], [0.41, '#d8eef9'], [0.5, '#fdf1cf'], [1, '#fdf1cf']]
};

// what each diorama needs: where the camera rests, where it goes for each place, and the labels
const KINDS = {
  childhood: {
    home: v3(-1.4, 3.7, 19.5), homeT: v3(-1.4, 3.2, 0),
    views: {
      treehouse: { box: [-7.2, -3.6, 3.7, 5.8], z: 1.2, pos: v3(-5.4, 4.7, 6.8), look: v3(-5.4, 4.4, -0.2) },
      cottage: { box: [1.8, 6.6, 0.3, 2.9], z: 1.3, pos: v3(4.2, 1.7, 7.2), look: v3(4.2, 1.4, -0.3) }
    },
    labels: [
      { text: 'Toy box', room: 'treehouse', at: [-5.4, 4.5, 1.3] },
      { text: 'Grandma’s kitchen', room: 'cottage', at: [4.2, 2.6, 1.4] }
    ],
    names: { treehouse: 'the treehouse toy box', cottage: 'Grandma’s kitchen' }
  },
  today: {
    home: v3(0, 3.3, 17), homeT: v3(0, 2.4, 0),
    views: {
      letter: { box: [-4.4, 0, 0.3, 3.4], z: 1.2, pos: v3(-2.2, 1.9, 6.4), look: v3(-2.2, 1.3, -0.3) },
      desk: { box: [0, 4.4, 0.3, 3.4], z: 1.2, pos: v3(2.2, 1.9, 6.4), look: v3(2.2, 1.4, -0.3) }
    },
    labels: [
      { text: 'The letter', room: 'letter', at: [-2.2, 3.0, 1.4] },
      { text: 'Your day', room: 'desk', at: [2.2, 3.0, 1.4] }
    ],
    names: { letter: 'the letter', desk: 'your day' }
  }
};

export function createPlace({ kind, mount, onRoom }) {
  const cfg = KINDS[kind];
  const renderer = new THREE.WebGLRenderer({ antialias: true }); // throws without WebGL
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  mount.prepend(renderer.domElement);

  const scene = new THREE.Scene();
  const skyCv = document.createElement('canvas');
  skyCv.width = 4; skyCv.height = 512;
  const sg = skyCv.getContext('2d');
  const paintSky = (stops) => {
    const g = sg.createLinearGradient(0, 0, 0, 512);
    stops.forEach(([s, c]) => g.addColorStop(s, c));
    sg.fillStyle = g; sg.fillRect(0, 0, 4, 512);
  };
  paintSky(SKY.night);
  const skyTex = new THREE.CanvasTexture(skyCv);
  skyTex.colorSpace = THREE.SRGBColorSpace;
  scene.background = skyTex;
  const fog = (scene.fog = new THREE.Fog('#8a6288', 30, 80));
  const camera = new THREE.PerspectiveCamera(34, 1.6, 0.1, 200);

  const hemi = new THREE.HemisphereLight('#9a9ad0', '#34403f', 1.15);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight('#cfd4ff', 1.25);
  sun.position.set(7, 12, 10);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -13, right: 13, top: 11, bottom: -3, near: 1, far: 45 });
  sun.shadow.normalBias = 0.02;
  scene.add(sun);

  /* ---------- building blocks: every material knows its night and day colour ---------- */
  const world = new THREE.Group();
  scene.add(world);
  const tinted = [];
  const matCache = {};
  const col = (night, day = night) =>
    (matCache[night + day] ??= (() => {
      const m = new THREE.MeshStandardMaterial({ color: night, roughness: 0.9, flatShading: true });
      tinted.push([m, night, day]);
      return m;
    })());
  const put = (geo, c, x, y, z, parent = world) => {
    const m = new THREE.Mesh(geo, typeof c === 'string' ? col(c) : c);
    m.position.set(x, y, z);
    m.castShadow = m.receiveShadow = true;
    parent.add(m);
    return m;
  };
  const span = (x0, x1, y0, y1, z0, z1, c, parent) =>
    put(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), c, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, parent);
  const group = (x, y, z, parent = world) => {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    parent.add(g);
    return g;
  };
  const light = (color, intensity, dist, x, y, z, parent = world) => {
    const l = new THREE.PointLight(color, intensity, dist, 2);
    l.position.set(x, y, z);
    parent.add(l);
    return l;
  };
  const tri = (pts, c, parent = world) => {
    const geo = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(pts.flat(), 3));
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, typeof c === 'string' ? col(c) : c);
    m.castShadow = true;
    m.material.side = THREE.DoubleSide;
    parent.add(m);
    return m;
  };
  // a glowing window pane (a standard material, so its glow can be dimmed by day)
  const glass = (w, h, x, y, z, parent = world) => {
    const m = new THREE.MeshStandardMaterial({ color: '#2a2a50', emissive: '#ffd98a', emissiveIntensity: 0.6, roughness: 0.4 });
    const pane = put(new THREE.PlaneGeometry(w, h), m, x, y, z, parent);
    pane.castShadow = false;
    // dark frame
    const f = 0.07;
    span(x - w / 2 - f, x + w / 2 + f, y + h / 2, y + h / 2 + f, z - 0.01, z + 0.03, TRIM, parent);
    span(x - w / 2 - f, x + w / 2 + f, y - h / 2 - f, y - h / 2, z - 0.01, z + 0.03, TRIM, parent);
    span(x - w / 2 - f, x - w / 2, y - h / 2, y + h / 2, z - 0.01, z + 0.03, TRIM, parent);
    span(x + w / 2, x + w / 2 + f, y - h / 2, y + h / 2, z - 0.01, z + 0.03, TRIM, parent);
    span(x - 0.02, x + 0.02, y - h / 2, y + h / 2, z - 0.01, z + 0.04, TRIM, parent);
    span(x - w / 2, x + w / 2, y - 0.02, y + 0.02, z - 0.01, z + 0.04, TRIM, parent);
    return m;
  };
  // a prism roof over a box: two slanted slabs and a gable at the back
  const roof = (x0, x1, y, z0, z1, rise, c, gableC) => {
    const cx = (x0 + x1) / 2, half = (x1 - x0) / 2 + 0.35, slant = Math.hypot(half, rise), ang = Math.atan2(rise, half);
    const depth = z1 - z0 + 0.7, zc = (z0 + z1) / 2;
    const l = put(new THREE.BoxGeometry(slant, 0.14, depth), c, cx - half / 2, y + rise / 2, zc);
    l.rotation.z = ang;
    const r = put(new THREE.BoxGeometry(slant, 0.14, depth), c, cx + half / 2, y + rise / 2, zc);
    r.rotation.z = -ang;
    tri([[x0 - 0.05, y, z0 + 0.04], [x1 + 0.05, y, z0 + 0.04], [cx, y + rise - 0.05, z0 + 0.04]], gableC);
  };

  /* ---------- the garden every place shares ---------- */
  const groundMat = col('#3c5045', '#8c9a74');
  put(new THREE.CircleGeometry(60, 48), groundMat, 0, 0, 0).rotation.x = -Math.PI / 2;
  for (const [x, z, s, c] of [
    [-14, -26, [22, 5, 8], col('#5d5a8a', '#b9b597')],
    [16, -30, [26, 6, 9], col('#4d4c7d', '#a3a382')],
    [0, -40, [30, 7, 8], col('#5d5a8a', '#b9b597')]
  ]) {
    const hill = put(new THREE.SphereGeometry(1, 24, 12), c, x, 0, z);
    hill.scale.set(...s);
    hill.castShadow = false;
  }
  const orb = put(new THREE.SphereGeometry(1.5, 16, 12), new THREE.MeshBasicMaterial({ color: '#f6eed6', fog: false }), 16, 13, -30);
  orb.castShadow = false;
  const leaf1 = col('#3e594c', '#6f8160'), leaf2 = col('#4a6757', '#7d8d6e');
  const bush = (x, z, r) => put(new THREE.IcosahedronGeometry(r, 0), leaf1, x, r * 0.6, z);
  const flower = (x, z, c) => {
    put(new THREE.CylinderGeometry(0.02, 0.02, 0.35, 4), leaf2, x, 0.18, z);
    put(new THREE.IcosahedronGeometry(0.1, 0), c, x, 0.4, z);
  };

  /* ---------- per-diorama content ---------- */
  const lamps = {}; // room -> its warm light
  const panes = {}; // room -> its window glow
  let swing = null, envelope = null;

  if (kind === 'childhood') {
    // the big oak
    const trunkX = -8.4;
    put(new THREE.CylinderGeometry(0.62, 0.9, 6.6, 9), col('#5a4130'), trunkX, 3.3, -0.4);
    for (const [x, y, z, r, c] of [
      [-7.4, 8.2, -0.6, 3.1, leaf1], [-4.6, 8.0, -0.9, 2.6, leaf2], [-10.2, 7.6, -0.4, 2.4, leaf2],
      [-6.0, 9.6, -0.5, 2.2, leaf1], [-8.6, 9.8, -0.4, 2.0, leaf2]
    ]) put(new THREE.IcosahedronGeometry(r, 0), c, x, y, z);
    // the treehouse: a platform on posts, three walls and a peaked roof, open to the front
    const fl = 3.55, ceil = 5.7, x0 = -7.2, x1 = -3.6, zb = -1.2, zf = 1.2;
    span(x0 - 0.2, x1 + 0.2, fl - 0.22, fl, zb - 0.1, zf + 0.5, WOOD);
    for (const [px, pz] of [[x0 + 0.1, zf + 0.35], [x1 - 0.1, zf + 0.35], [x0 + 0.1, zb + 0.2], [x1 - 0.1, zb + 0.2]])
      put(new THREE.CylinderGeometry(0.1, 0.12, fl, 6), col('#5a4130'), px, fl / 2, pz);
    span(x0, x1, fl, ceil, zb - 0.12, zb, col('#a77d50', '#d9bd92'));                // back wall
    span(x0 - 0.12, x0, fl, ceil, zb, zf, col('#9a7048', '#caa878'));               // left wall
    span(x1, x1 + 0.12, fl, ceil, zb, zf, col('#9a7048', '#caa878'));               // right wall
    span(x0, x1, fl, fl + 0.02, zb, zf, col('#c49660', '#e2bf88'));                  // floor boards
    roof(x0 - 0.12, x1 + 0.12, ceil, zb - 0.12, zf, 1.25, col('#9c3b2e', '#c25a48'), col('#7a5a40', '#c49660'));
    panes.treehouse = glass(0.9, 0.8, (x0 + x1) / 2 + 0.9, fl + 1.4, zb + 0.01);
    // inside: a rug, the toy box with its lid up, a ball, a little bed, a lantern
    put(new THREE.CylinderGeometry(0.95, 0.95, 0.03, 20), col('#9c3b2e', '#c25a48'), -5.4, fl + 0.02, 0.1);
    const box = group(-5.9, fl, -0.45);
    span(-0.55, 0.55, 0, 0.62, -0.4, 0.4, col('#a77d50', '#c49660'), box);
    span(-0.56, 0.56, 0.3, 0.38, -0.41, 0.41, CRAYON, box);
    const lid = group(0, 0.62, -0.4, box);
    span(-0.57, 0.57, 0, 0.09, 0, 0.8, col('#8a6440', '#a77d50'), lid);
    lid.rotation.x = -1.65;
    put(new THREE.IcosahedronGeometry(0.2, 0), col('#9c3b2e', '#c25a48'), -0.15, 0.78, 0.02, box);
    put(new THREE.IcosahedronGeometry(0.17, 0), col('#d8a53a'), 0.25, 0.74, -0.1, box);
    span(-4.6, -3.75, fl, fl + 0.34, -1.0, 0.1, col('#c25a48', '#d98a7a'));
    span(-4.6, -4.2, fl + 0.34, fl + 0.5, -1.0, -0.4, '#efe6cf');
    const lantern = group(-4.2, ceil - 0.4, 0.6);
    put(new THREE.CylinderGeometry(0.007, 0.007, 0.5, 4), TRIM, 0, 0.2, 0, lantern);
    put(new THREE.SphereGeometry(0.1, 10, 8), new THREE.MeshBasicMaterial({ color: '#fff3d6' }), 0, -0.1, 0, lantern);
    lamps.treehouse = light('#ffcf87', 1.6, 6, -5.2, ceil - 0.8, 0.2);
    // a rope ladder down to the grass
    for (let i = 0; i < 8; i++) span(-3.45, -3.0, 0.35 + i * 0.4, 0.43 + i * 0.4, 1.55, 1.63, '#c49660');
    span(-3.47, -3.43, 0.3, fl, 1.55, 1.63, '#8a6440');
    span(-3.02, -2.98, 0.3, fl, 1.55, 1.63, '#8a6440');
    // a swing between two posts
    span(-1.8, -1.55, 0, 3.3, 0.2, 0.45, col('#8a6440'));
    span(0.55, 0.8, 0, 3.3, 0.2, 0.45, col('#8a6440'));
    span(-1.8, 0.8, 3.15, 3.4, 0.2, 0.45, col('#6e4e30'));
    swing = group(-0.5, 3.15, 0.32);
    put(new THREE.CylinderGeometry(0.012, 0.012, 2.3, 4), TRIM, -0.4, -1.15, 0, swing);
    put(new THREE.CylinderGeometry(0.012, 0.012, 2.3, 4), TRIM, 0.4, -1.15, 0, swing);
    span(-0.5, 0.5, -2.4, -2.3, -0.15, 0.15, CRAYON, swing);

    // Grandma's cottage, smaller than the dollhouse: a kitchen with the front wall left off
    const cx0 = 1.8, cx1 = 6.6, cb = -1.3, cf = 1.3, cfl = 0.3, cc = 2.85;
    span(cx0 - 0.2, cx1 + 0.2, 0, cfl, cb - 0.1, cf + 0.6, col('#6b6358', '#b3a898'));   // step and floor slab
    span(cx0, cx1, cfl, cc, cb - 0.14, cb, col('#c8a77a', '#f0d9a8'));                    // back wall
    span(cx0 - 0.14, cx0, cfl, cc, cb, cf, col('#b8946a', '#e6cc98'));
    span(cx1, cx1 + 0.14, cfl, cc, cb, cf, col('#b8946a', '#e6cc98'));
    span(cx0, cx1, cfl, cfl + 0.02, cb, cf, col('#a97c50', '#d4a86c'));
    roof(cx0 - 0.14, cx1 + 0.14, cc, cb - 0.14, cf, 1.7, col('#6e3a2a', '#a05a40'), col('#c8a77a', '#f0d9a8'));
    span(5.5, 5.95, cc + 0.9, cc + 2.2, cb + 0.2, cb + 0.65, col('#7a5638', '#b8896a'));  // chimney
    panes.cottage = glass(1.2, 0.95, 5.4, 1.75, cb + 0.01);
    // inside: counter with a stove, a table and chairs, shelf, hanging pots, a pendant lamp
    span(cx0 + 0.15, 4.0, cfl, 1.15, cb + 0.05, cb + 0.7, col('#8a6440', '#b8896a'));
    span(cx0 + 0.15, 4.0, 1.15, 1.22, cb + 0.05, cb + 0.78, col('#d9bd92', '#f3e3c0'));
    span(2.0, 2.65, 1.22, 1.5, cb + 0.1, cb + 0.5, col('#3f5a7a'));                         // stove pot
    put(new THREE.CylinderGeometry(0.22, 0.2, 0.3, 10), col('#b0b8c4', '#c9d1db'), 3.3, 1.38, cb + 0.4);
    span(cx1 - 0.7, cx1 - 0.1, 1.9, 1.96, cb + 0.1, cb + 0.5, WOOD);                        // shelf
    for (const [x, c] of [[cx1 - 0.6, '#9c3b2e'], [cx1 - 0.4, '#d8a53a'], [cx1 - 0.22, '#697a5c']])
      put(new THREE.CylinderGeometry(0.07, 0.07, 0.2, 8), col(c), x, 2.06, cb + 0.3);
    span(2.2, 4.3, 2.3, 2.34, cb + 0.1, cb + 0.14, TRIM);
    for (const x of [2.5, 3.2, 3.9]) put(new THREE.CylinderGeometry(0.13, 0.1, 0.16, 10), col('#b0b8c4', '#c9d1db'), x, 2.15, cb + 0.25);
    const table = group(4.4, cfl, 0.15);
    put(new THREE.CylinderGeometry(0.85, 0.85, 0.08, 20), col('#b98c5b', '#d9ad78'), 0, 0.78, 0);
    put(new THREE.CylinderGeometry(0.1, 0.14, 0.78, 8), col('#6e4e30'), 0, 0.39, 0);
    put(new THREE.CylinderGeometry(0.3, 0.26, 0.2, 14), col('#efe6cf'), 0, 0.92, 0, table);
    put(new THREE.IcosahedronGeometry(0.12, 0), col('#b8392b', '#cf4a38'), 0.06, 1.08, 0.04, table);
    for (const [x, z] of [[-1.15, 0.2], [1.15, 0.2]]) {
      span(x - 0.25, x + 0.25, 0.46, 0.52, z - 0.25, z + 0.25, col('#c25a48', '#d98a7a'), table);
      span(x - 0.22, x - 0.18, 0, 0.46, z - 0.22, z - 0.18, '#6e4e30', table);
      span(x + 0.18, x + 0.22, 0, 0.46, z + 0.18, z + 0.22, '#6e4e30', table);
    }
    put(new THREE.CylinderGeometry(0.008, 0.008, 0.7, 4), TRIM, 4.4, cc - 0.35, 0.15);
    put(new THREE.ConeGeometry(0.28, 0.2, 14, 1, true), col('#9c3b2e', '#c25a48'), 4.4, cc - 0.82, 0.15).material.side = THREE.DoubleSide;
    put(new THREE.SphereGeometry(0.06, 10, 8), new THREE.MeshBasicMaterial({ color: '#fff3d6' }), 4.4, cc - 0.9, 0.15);
    lamps.cottage = light('#ffcf87', 1.8, 6, 4.4, cc - 1.1, 0.2);
    // yard: a picket fence, flowers, a bike, hopscotch, bushes, a path
    for (let i = 0; i < 15; i++) span(-2.9 + i * 0.28, -2.82 + i * 0.28, 0, 0.78, 2.5, 2.56, '#efe6cf');
    span(-2.95, 1.35, 0.18, 0.28, 2.46, 2.52, '#d9ceb4');
    span(-2.95, 1.35, 0.5, 0.6, 2.46, 2.52, '#d9ceb4');
    for (const [x, z, c] of [[-2.6, 2.1, '#9c3b2e'], [-2.2, 2.3, '#d8a53a'], [0.9, 2.0, '#efe6cf'], [1.2, 2.3, '#9c3b2e'], [5.0, 2.4, '#d8a53a'], [5.4, 2.1, '#9c3b2e'], [6.0, 2.4, '#efe6cf']])
      flower(x, z, col(c));
    for (const x of [-0.6, 0.55]) {
      const w = put(new THREE.TorusGeometry(0.34, 0.035, 6, 18), col('#3c3326'), x, 0.36, 3.5);
      w.rotation.y = Math.PI / 2;
    }
    span(-0.62, 0.55, 0.36, 0.4, 3.45, 3.55, col('#9c3b2e', '#c25a48'));
    span(-0.05, 0.0, 0.4, 0.78, 3.45, 3.55, '#9c3b2e');
    for (let i = 0; i < 4; i++) {
      const sq = put(new THREE.PlaneGeometry(0.55, 0.55), col(i % 2 ? '#d8a53a' : '#efe6cf'), 2.8 + i * 0.6, 0.02, 4.4);
      sq.rotation.x = -Math.PI / 2;
    }
    const path = put(new THREE.PlaneGeometry(1.4, 8), col('#8a7c78', '#cdbf9f'), 4.2, 0.02, 6.4);
    path.rotation.x = -Math.PI / 2;
    bush(1.0, 1.7, 0.5); bush(6.9, 1.6, 0.55); bush(-2.2, -2.0, 0.7); bush(9.4, -1.2, 1.0);
    put(new THREE.IcosahedronGeometry(1.2, 0), leaf2, 9.6, 1.6, -1.8);
    put(new THREE.CylinderGeometry(0.14, 0.2, 1.4, 6), col('#5a4130'), 9.6, 0.7, -1.8);
  } else {
    // a morning room: one wide room, the front wall left off, with a small gabled roof
    const x0 = -4.4, x1 = 4.4, zb = -1.4, zf = 1.3, fl = 0.3, ceil = 3.7;
    span(x0 - 0.25, x1 + 0.25, 0, fl, zb - 0.1, zf + 0.7, col('#6b6358', '#b3a898'));
    span(x0, x1, fl, ceil, zb - 0.14, zb, col('#c9ab88', '#f3dcb0'));                    // back wall
    span(x0 - 0.14, x0, fl, ceil, zb, zf, col('#b8946a', '#e6cc98'));
    span(x1, x1 + 0.14, fl, ceil, zb, zf, col('#b8946a', '#e6cc98'));
    span(x0, x1, fl, fl + 0.02, zb, zf, col('#a97c50', '#d4a86c'));
    span(x0 - 0.2, x1 + 0.2, ceil, ceil + 0.18, zb - 0.2, zf + 0.4, col('#7a5638', '#b8896a'));  // ceiling slab
    roof(x0 - 0.2, x1 + 0.2, ceil + 0.18, zb - 0.2, zf + 0.4, 1.5, col('#6e3a2a', '#a05a40'), col('#c9ab88', '#f3dcb0'));
    span(2.7, 3.2, ceil + 0.9, ceil + 2.3, zb + 0.2, zb + 0.7, col('#7a5638', '#b8896a'));  // chimney
    panes.letter = glass(1.7, 1.3, -2.3, 2.1, zb + 0.01);
    panes.desk = glass(1.7, 1.3, 2.3, 2.1, zb + 0.01);
    // the clock above the window, set to the real time, and a calendar page above the desk
    const clockCv = document.createElement('canvas'); clockCv.width = clockCv.height = 128;
    const c = clockCv.getContext('2d');
    c.fillStyle = '#efe6cf'; c.beginPath(); c.arc(64, 64, 60, 0, 7); c.fill();
    c.strokeStyle = '#3c3326'; c.lineWidth = 6; c.stroke();
    c.lineWidth = 4;
    for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6; c.beginPath(); c.moveTo(64 + Math.sin(a) * 50, 64 - Math.cos(a) * 50); c.lineTo(64 + Math.sin(a) * 56, 64 - Math.cos(a) * 56); c.stroke(); }
    const now = new Date();
    const hAng = ((now.getHours() % 12) + now.getMinutes() / 60) * Math.PI / 6, mAng = now.getMinutes() * Math.PI / 30;
    c.lineCap = 'round'; c.strokeStyle = '#3c3326'; c.lineWidth = 7;
    c.beginPath(); c.moveTo(64, 64); c.lineTo(64 + Math.sin(hAng) * 30, 64 - Math.cos(hAng) * 30); c.stroke();
    c.lineWidth = 5; c.beginPath(); c.moveTo(64, 64); c.lineTo(64 + Math.sin(mAng) * 46, 64 - Math.cos(mAng) * 46); c.stroke();
    c.fillStyle = '#9c3b2e'; c.beginPath(); c.arc(64, 64, 6, 0, 7); c.fill();
    const clockTex = new THREE.CanvasTexture(clockCv); clockTex.colorSpace = THREE.SRGBColorSpace;
    put(new THREE.CircleGeometry(0.36, 24), new THREE.MeshBasicMaterial({ map: clockTex }), 0, 3.2, zb + 0.04);
    const calCv = document.createElement('canvas'); calCv.width = 128; calCv.height = 160;
    const k = calCv.getContext('2d');
    k.fillStyle = '#fff7e2'; k.fillRect(0, 0, 128, 160);
    k.fillStyle = '#9c3b2e'; k.fillRect(0, 0, 128, 40);
    k.fillStyle = '#fff'; k.font = 'bold 26px Georgia, serif'; k.textAlign = 'center';
    k.fillText(now.toLocaleDateString('en-US', { month: 'short' }).toUpperCase(), 64, 29);
    k.fillStyle = '#2b2350'; k.font = 'bold 72px Georgia, serif'; k.fillText(String(now.getDate()), 64, 112);
    k.font = '22px Georgia, serif'; k.fillText(now.toLocaleDateString('en-US', { weekday: 'long' }), 64, 146);
    const calTex = new THREE.CanvasTexture(calCv); calTex.colorSpace = THREE.SRGBColorSpace;
    put(new THREE.PlaneGeometry(0.62, 0.78), new THREE.MeshBasicMaterial({ map: calTex }), 3.9, 2.3, zb + 0.04);
    // left: an armchair, a round table with tea and the letter
    const arm = group(-3.5, fl, -0.5);
    span(-0.45, 0.45, 0, 0.45, -0.4, 0.4, col('#697a5c', '#7d8d6e'), arm);
    span(-0.45, 0.45, 0.45, 1.15, -0.4, -0.2, col('#697a5c', '#7d8d6e'), arm);
    for (const x of [-0.45, 0.3]) span(x, x + 0.15, 0.45, 0.7, -0.4, 0.4, col('#56664a', '#6a7a5c'), arm);
    span(-0.3, 0.3, 0.45, 0.52, -0.2, 0.38, col('#8c9c7c', '#9fae8e'), arm);
    const tbl = group(-1.7, fl, 0.1);
    put(new THREE.CylinderGeometry(0.6, 0.6, 0.07, 18), col('#b98c5b', '#d9ad78'), 0, 0.72, 0, tbl);
    put(new THREE.CylinderGeometry(0.07, 0.12, 0.72, 8), col('#6e4e30'), 0, 0.36, 0, tbl);
    put(new THREE.CylinderGeometry(0.12, 0.09, 0.12, 12), col('#efe6cf'), -0.28, 0.82, 0.1, tbl);
    envelope = group(0.18, 0.78, 0, tbl);
    span(-0.3, 0.3, 0, 0.04, -0.2, 0.2, '#fffaf0', envelope);
    tri([[-0.3, 0.04, -0.2], [0.3, 0.04, -0.2], [0, 0.045, 0.02]], col('#efe6cf', '#e6dcc4'), envelope);
    put(new THREE.CylinderGeometry(0.06, 0.06, 0.02, 10), col('#9c3b2e'), 0, 0.055, 0.02, envelope);
    span(-4.1, -4.0, fl, 2.3, -1.1, -1.0, TRIM);
    put(new THREE.ConeGeometry(0.28, 0.4, 14, 1, true), col('#d8a53a'), -4.05, 2.3, -1.05).material.side = THREE.DoubleSide;
    // right: a writing desk with an open journal, a pencil and a lamp
    const desk = group(2.4, fl, -0.55);
    span(-1.0, 1.0, 0.7, 0.78, -0.45, 0.45, col('#8a6440', '#b98c5b'), desk);
    for (const [x, z] of [[-0.92, -0.38], [0.92, -0.38], [-0.92, 0.38], [0.92, 0.38]]) span(x - 0.04, x + 0.04, 0, 0.7, z - 0.04, z + 0.04, '#5a4130', desk);
    span(-0.55, -0.02, 0.78, 0.8, -0.28, 0.24, '#fffaf0', desk);
    span(0.02, 0.55, 0.78, 0.8, -0.28, 0.24, '#fffaf0', desk);
    span(-0.6, 0.6, 0.76, 0.78, -0.32, 0.28, col('#9c3b2e'), desk);
    for (let i = 0; i < 4; i++) span(-0.45, -0.1, 0.805, 0.81, -0.18 + i * 0.1, -0.16 + i * 0.1, '#bdb29a', desk);
    const pencil = put(new THREE.CylinderGeometry(0.018, 0.018, 0.4, 6), col('#d8a53a'), 0.3, 0.83, 0.1, desk);
    pencil.rotation.z = Math.PI / 2; pencil.rotation.y = 0.5;
    span(0.65, 0.75, 0.78, 1.2, -0.3, -0.2, TRIM, desk);
    put(new THREE.ConeGeometry(0.22, 0.28, 14, 1, true), col('#3f5a7a'), 0.7, 1.28, -0.25, desk).material.side = THREE.DoubleSide;
    const chair = group(2.4, fl, 0.55);
    span(-0.3, 0.3, 0.42, 0.48, -0.3, 0.3, col('#c25a48', '#d98a7a'), chair);
    span(-0.3, 0.3, 0.48, 1.05, 0.26, 0.3, col('#8a6440', '#b98c5b'), chair);
    for (const [x, z] of [[-0.26, -0.26], [0.26, -0.26], [-0.26, 0.26], [0.26, 0.26]]) span(x - 0.03, x + 0.03, 0, 0.42, z - 0.03, z + 0.03, '#5a4130', chair);
    // rug and warm lights
    put(new THREE.CylinderGeometry(1.5, 1.5, 0.03, 24), col('#9c3b2e', '#c25a48'), 0, fl + 0.02, 0.5);
    lamps.letter = light('#ffcf87', 1.8, 6.5, -2.2, 2.7, 0.2);
    lamps.desk = light('#ffcf87', 1.8, 6.5, 2.4, 2.7, 0.1);
    // outside: a mailbox on a post, flower beds, a path, a tree
    const mail = group(-6.4, 0, 2.6);
    span(-0.06, 0.06, 0, 1.3, -0.06, 0.06, '#5a4130', mail);
    span(-0.35, 0.35, 1.3, 1.6, -0.2, 0.2, col('#3f5a7a'), mail);
    span(0.35, 0.37, 1.3, 1.9, -0.05, 0.05, '#9c3b2e', mail);
    for (const [x, z, cc] of [[-4.0, 2.7, '#9c3b2e'], [-3.5, 2.9, '#d8a53a'], [-3.0, 2.7, '#efe6cf'], [3.4, 2.8, '#d8a53a'], [3.9, 2.6, '#9c3b2e'], [4.5, 2.9, '#efe6cf']]) flower(x, z, col(cc));
    const path = put(new THREE.PlaneGeometry(1.5, 8), col('#8a7c78', '#cdbf9f'), 0, 0.02, 6.4);
    path.rotation.x = -Math.PI / 2;
    bush(-5.6, 1.4, 0.6); bush(5.8, 1.5, 0.55); bush(-9, -2, 1.0);
    put(new THREE.CylinderGeometry(0.16, 0.22, 2.0, 6), col('#5a4130'), 8.2, 1.0, -1.2);
    put(new THREE.IcosahedronGeometry(1.5, 0), leaf1, 8.2, 2.7, -1.2);
    put(new THREE.IcosahedronGeometry(1.0, 0), leaf2, 8.8, 3.5, -1.0);
  }

  /* ---------- labels and tap areas, placed from the camera each frame ---------- */
  const labels = cfg.labels.map((l) => {
    const el = document.createElement('div');
    el.className = 'roomlbl';
    el.textContent = l.text;
    mount.appendChild(el);
    return { el, room: l.room, at: new THREE.Vector3(...l.at) };
  });
  let hoverRoom = null;
  const rooms = Object.keys(cfg.views);
  const btns = rooms.map((name) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'roombtn';
    b.setAttribute('aria-label', 'Go into ' + cfg.names[name]);
    b.addEventListener('click', () => onRoom && onRoom(name));
    mount.appendChild(b);
    b.addEventListener('pointerenter', () => { hoverRoom = name; });
    b.addEventListener('focus', () => { hoverRoom = name; });
    const off = () => { if (hoverRoom === name) hoverRoom = null; };
    b.addEventListener('pointerleave', off);
    b.addEventListener('blur', off);
    const { box: [x0, x1, y0, y1], z } = cfg.views[name];
    return { b, corners: [x0, x1].flatMap((x) => [y0, y1].map((y) => new THREE.Vector3(x, y, z))) };
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
      Object.assign(b.style, { left: (x0 + 1) * 50 + '%', width: (x1 - x0) * 50 + '%', top: (1 - y1) * 50 + '%', height: (y1 - y0) * 50 + '%' });
    }
  }

  /* ---------- the camera: rests at home, glides into a place and back ---------- */
  let active = true, mode = 'home', glide = null, room = rooms[0], last = 0, night = true;
  const par = { x: 0, y: 0, tx: 0, ty: 0 };
  const tmpP = new THREE.Vector3(), tmpT = new THREE.Vector3();
  function placeCamera(u) {
    const view = cfg.views[room];
    tmpP.lerpVectors(cfg.home, view.pos, u);
    tmpT.lerpVectors(cfg.homeT, view.look, u);
    camera.position.copy(tmpP);
    camera.lookAt(tmpT);
  }
  function go(dir, name) {
    if (name) room = name;
    if (dir > 0) mode = 'gliding'; else mode = 'gliding';
    mount.classList.add('away');
    return new Promise((res) => {
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
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(mount);
  resize();
  placeCamera(0);

  const lit = {};
  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!active) return;
    const t = now / 1000;
    if (mode === 'gliding') {
      const k = Math.min(1, Math.max(0, (now - glide.t0) / GLIDE_MS)), e = ease(k);
      placeCamera(glide.dir > 0 ? e : 1 - e);
      if (k >= 1) { const g = glide; glide = null; finishGlide(g.dir); g.res(); }
    } else {
      par.x += (par.tx - par.x) * 0.05; par.y += (par.ty - par.y) * 0.05;
      if (mode === 'home') {
        camera.position.set(cfg.home.x - par.x * 0.6, cfg.home.y + par.y * 0.3, cfg.home.z);
        camera.lookAt(cfg.homeT);
        place2d();
      } else {
        const view = cfg.views[room];
        camera.position.set(view.pos.x - par.x * 0.3, view.pos.y + par.y * 0.15, view.pos.z);
        camera.lookAt(view.look);
      }
    }
    for (const name of rooms) {
      const goal = mode !== 'home' && room === name ? 1.7 : hoverRoom === name ? 3.4 : night ? 1.4 : 0.35;
      if (lamps[name]) lamps[name].intensity += (goal - lamps[name].intensity) * Math.min(1, dt * 6);
      if (panes[name]) panes[name].emissiveIntensity = lit[name] ? 1.5 : hoverRoom === name ? (night ? 1.1 : 0.5) : night ? 0.7 : 0.1;
    }
    if (swing) swing.rotation.z = Math.sin(t * 1.3) * 0.12;
    if (envelope) {
      envelope.position.y = 0.78 + (lit.letter ? 0 : 0.03 + Math.sin(t * 2.2) * 0.03);
      envelope.rotation.y = 0.2;
    }
    renderer.render(scene, camera);
  }
  requestAnimationFrame(frame);

  /* ---------- the day / night switch ---------- */
  function setTime(m) {
    night = m !== 'day';
    paintSky(night ? SKY.night : SKY.day);
    skyTex.needsUpdate = true;
    fog.color.set(night ? '#8a6288' : '#e9f0e4');
    hemi.color.set(night ? '#9a9ad0' : '#fff4e0'); hemi.groundColor.set(night ? '#34403f' : '#8c9a74'); hemi.intensity = night ? 1.15 : 1.6;
    sun.color.set(night ? '#cfd4ff' : '#ffe9c4'); sun.intensity = night ? 1.25 : 2.2;
    for (const [m2, nHex, dHex] of tinted) m2.color.set(night ? nHex : dHex);
    orb.material.color.set(night ? '#f6eed6' : '#ffd95e');
  }
  window.addEventListener('homeagain:time', (e) => setTime(e.detail));
  setTime(window.HomeAgainTime ? window.HomeAgainTime.get() : 'night');

  return {
    setActive(on) { active = on; },
    reset() { glide = null; finishGlide(-1); },
    glideIn: (name) => go(1, name),
    glideOut: () => go(-1),
    setLit(name, on) { lit[name] = !!on; },
    pointer(dx, dy) { par.tx = dx; par.ty = dy; },
    setTime
  };
}
