// ANGELS ZERO — Ace Combat-style coastal archipelago.
//
// A deterministic, authored heightfield (20 x 20 km, centred on (0, -2500), 33 m grid):
//   MAIN     central-south airbase island: basalt escarpments on the north / east
//            coasts, jagged NE massif (~720 m) and NW ridge (~520 m), harbour bay +
//            industrial port (west), runway peninsula reaching south; both RWY 18/36
//            approach funnels are capped low and kept clear of rock.
//   CANYON   north-west canyon massif: 330-500 m plateau of ridged crests split by a
//            winding sea-level gorge (350-550 m sheer walls, 260-380 m water floor).
//   VOLCANO  north-east caldera + peak (~975 m rim), radial ridges, terraced flanks.
//   ATOLLS   east & west crescent reef islands: sea cliffs, lagoon shoals,
//            lighthouse + hilltop radar station.
//   Two headland spits per bridge leave ~1.3 km straits spanned by monumental
//   suspension bridges (240 m towers, 380 ft clearance); a reef bank carries a
//   wind farm; 3 oil platforms sit in the sea lanes; ~15 basalt sea stacks.
//
// The rendered mesh and every gameplay height query share one height grid:
// heightAt() interpolates the same two triangles per quad that the GPU draws,
// so crashes, missiles, bombs and props agree exactly with what is on screen.

export const WORLD = { SIZE: 20000, CX: 0, CZ: -2500, SEG: 600 };     // 33 m grid: sheer cliffs stay sheer
const FT = 0.3048;
export const RWY = { x: 900, z0: -1400, z1: 1600, width: 50, elev: 10 };       // runway 18/36, 3,000 m

export function createWorld(THREE, env) {
  const { scene, createNoise2D, fbm } = env;
  const clamp = THREE.MathUtils.clamp;
  // Smoothstep that also works with reversed edges (a > b): 1 at a .. 0 at b.
  const ss = (x, a, b) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const nCoast = createNoise2D(4242), nHill = createNoise2D(991), nDet = createNoise2D(7);
  const nRidge = createNoise2D(1337), nSea = createNoise2D(2718), nVeg = createNoise2D(31);

  /* -------------------------------------------------------- island shapes */
  // Shelf just outside a coast (d = 1): turquoise sandbar falling to deep water.
  const shelf = d => -2.5 - 20 * ss(d, 1.0, 1.2) - 150 * ss(d, 1.2, 1.65);
  // Domain-warped ellipse distance (1 = coastline): low-frequency warp makes
  // capes and coves, mid-frequency wobble roughens the shoreline.
  const warpX = (x, z, seed) => 520 * fbm(nCoast, x * 0.00021 + seed, z * 0.00021, 3);
  const warpZ = (x, z, seed) => 520 * fbm(nCoast, x * 0.00021 - 17.3, z * 0.00021 + seed, 3);
  function ellipseD(x, z, cx, cz, rx, rz, rot, wob, seed) {
    const qx = x + warpX(x, z, seed), qz = z + warpZ(x, z, seed);
    const dx = qx - cx, dz = qz - cz, c = Math.cos(rot), s = Math.sin(rot);
    const u = (dx * c + dz * s) / rx, v = (-dx * s + dz * c) / rz;
    const d = Math.sqrt(u * u + v * v);
    if (d > 1.9) return d;
    return d * (1 + wob * fbm(nCoast, x * 0.0009 + seed, z * 0.0009 - seed, 3));
  }
  const capsule = (x, z, ax, az, bx, bz) => {
    const px = x - ax, pz = z - az, ex = bx - ax, ez = bz - az;
    const t = clamp((px * ex + pz * ez) / (ex * ex + ez * ez), 0, 1);
    return Math.hypot(px - ex * t, pz - ez * t);
  };

  // Ridged multifractal (0..1, sharp creases at the noise zero-crossings) for jagged crests.
  const ridged = (x, z, f, oct) => { const n = 1 - Math.abs(fbm(nRidge, x * f, z * f, oct)); return n * n; };
  // Jagged mountain spine along a segment: core 1 on the line -> 0 at `r` m, crest height `top`.
  function spine(x, z, ax, az, bx, bz, r, top, seed) {
    const dd = capsule(x, z, ax, az, bx, bz);
    if (dd >= r) return 0;
    const core = Math.pow(ss(dd, r, 0), 1.25);
    const cr = ridged(x + seed, z - seed, 0.0016, 4), fine = ridged(x - seed, z + seed, 0.0042, 3);
    return core * top * (0.5 + 0.5 * cr) + 70 * fine * core;
  }
  function mainIsland(x, z) {
    const d = ellipseD(x, z, 0, -1200, 3400, 2300, 0.08, 0.16, 3.1);
    if (d >= 1) return shelf(d);
    const t = 1 - d;
    // Harbour bay on the west side.
    const bay = ss(Math.hypot(x + 2600 + 220 * fbm(nHill, x * 0.002, z * 0.002, 2), z + 900 + 220 * fbm(nHill, z * 0.002, x * 0.002, 2)), 950, 600);
    // North / east coasts face the straits: basalt escarpments straight out of the sea.
    const cliffK = Math.max(ss(z, -1500, -2700), ss(x, 1500, 2500)) * (1 - bay);
    let h = 2.5 + 38 * ss(t, 0.015, 0.16) + 85 * cliffK * ss(t, 0.006, 0.045);   // beach / escarpment -> plateau
    h += 95 * (fbm(nHill, x * 0.0006, z * 0.0006, 4) * 0.5 + 0.5) * ss(t, 0.08, 0.45);   // rolling hills
    // Jagged volcanic ranges clear of the runway, its approaches and the port town:
    // NE massif (to ~720 m) and NW ridge (to ~520 m).
    h += spine(x, z, 2150, -3050, 2950, -750, 700, 620, 3.3) * ss(t, 0.02, 0.2);
    h += spine(x, z, -2950, -2350, -950, -3150, 620, 430, 8.1) * ss(t, 0.02, 0.2);
    h = h * (1 - bay) + (-16) * bay;
    return h;
  }
  // Canyon centreline (gorge runs south -> north through the island) and floor half-width
  // (130-190 m: a 260-380 m navigable water floor between sheer walls).
  const canyonX = z => -5600 + 380 * Math.sin((z + 8200) * 0.0011) + 120 * Math.sin(z * 0.0031);
  const canyonHalf = z => 160 + 30 * Math.sin(z * 0.0019 + 1.3);
  function canyonIsland(x, z) {
    const d = ellipseD(x, z, -5600, -8200, 2700, 2400, -0.2, 0.14, 7.7);
    if (d >= 1) return shelf(d);
    const t = 1 - d;
    let h = 6 + 320 * ss(t, 0.012, 0.11);                                      // sheer sea cliffs -> high plateau
    h += 115 * ridged(x, z, 0.0011, 4) * ss(t, 0.05, 0.28);                    // jagged crest creases
    const dx = Math.abs(x - canyonX(z)), half = canyonHalf(z);
    h += 80 * Math.exp(-(((dx - half - 150) / 160) ** 2)) * ss(t, 0.03, 0.18);  // twin rim crests
    // Gorge: water floor, near-vertical walls rising 350-550 m over ~95 m.
    const wall = ss(dx, half, half + 95);
    const ledge = 0.1 * ss(dx, half + 40, half + 52) * (1 - ss(dx, half + 60, half + 72));   // striated basalt ledge
    return h * Math.min(1, wall + ledge) + (-16) * (1 - wall);
  }
  function volcano(x, z) {
    const d = ellipseD(x, z, 5600, -8300, 2700, 2600, 0.3, 0.12, 11.3);
    if (d >= 1) return shelf(d);
    const t = 1 - d, rr = d;
    let h = 4 + 70 * ss(t, 0.006, 0.05) + 800 * Math.pow(ss(rr, 1.0, 0.1), 1.45);   // sea escarpment + main cone
    h += 60 * ridged(x, z, 0.0021, 3) * ss(t, 0.05, 0.3);                     // lava-ridge creases
    const ang = Math.atan2(z + 8300, x - 5600);
    const ridges = 1 - Math.abs(fbm(nRidge, Math.cos(ang) * 2.2 + 40, Math.sin(ang) * 2.2 + rr * 3.0, 4));
    h += 150 * Math.pow(ridges, 2.2) * ss(t, 0.15, 0.7) * (1 - ss(rr, 0.25, 0.1));
    h -= 280 * ss(rr, 0.15, 0.05);                                             // caldera crater
    // Terraced basalt flanks (blend 60 % toward 55 m steps between 120 and 760 m).
    const q = h / 55, f = q - Math.floor(q);
    const terr = (Math.floor(q) + ss(f, 0.32, 0.68)) * 55;
    const band = ss(h, 120, 200) * (1 - ss(h, 700, 780));
    return h * (1 - 0.6 * band) + terr * 0.6 * band;
  }
  function atoll(x, z, cx, cz, R, openAng, seed) {
    const dx = x - cx, dz = z - cz;
    if (Math.hypot(dx, dz) > R * 1.9) return -200;
    const dist = Math.hypot(dx, dz) + 160 * fbm(nCoast, x * 0.0011 + seed, z * 0.0011 - seed, 3);
    const a = Math.atan2(dz, dx);
    const crescent = ss(Math.cos(a - openAng), 0.55, 0.05);                    // open on one side
    const w = 270 * (0.75 + 0.5 * (fbm(nCoast, x * 0.001 + seed, z * 0.001, 2) * 0.5 + 0.5));
    const rr = Math.abs(dist - R) / w;
    if (dist < R && rr > 1) return -3.5 - 2 * fbm(nSea, x * 0.003, z * 0.003, 2);   // lagoon shoal
    const d = rr / Math.max(crescent, 0.001);
    if (d >= 1) return dist < R ? -4 : shelf(1 + (d - 1) * 0.6);
    const t = 1 - d;
    const outer = dist > R ? 1 : 0.4;                                          // rugged cliffs seaward
    let h = 3 + 58 * ss(t, 0.02, 0.1 / outer) * crescent;
    const hillA = openAng + Math.PI, da = Math.atan2(Math.sin(a - hillA), Math.cos(a - hillA));
    h += 70 * Math.exp(-((da * R / 320) ** 2) - ((dist - R) / 160) ** 2);   // radar hill
    return h;
  }
  function spit(x, z, ax, az, bx, bz, top) {
    const d = capsule(x, z, ax, az, bx, bz) / (260 * (0.8 + 0.45 * (fbm(nCoast, x * 0.0016, z * 0.0016, 3) * 0.5 + 0.5)));
    if (d >= 1) return shelf(d);
    return top * ss(1 - d, 0.0, 0.35) + 2;
  }
  // Bridge abutments (end of each headland) — span runs between them.
  const BRIDGES = [
    { a: [-3400, -3200], b: [-3700, -4550], fromA: [-2300, -2150], fromB: [-4300, -6300] },
    { a: [3300, -3250], b: [3850, -4600], fromA: [2250, -2300], fromB: [4700, -6250] }
  ];
  // Monumental decks: road at 124 m, girder underside 116 m (380 ft) above the strait.
  const DECK_TOP = 124, DECK_UNDER = 116, TOWER_TOP = 240;
  const REEF = { a: [3900, 2700], b: [7500, 450] };
  // RWY 18/36 approach funnels: 3.6 km finals off both thresholds stay low and open.
  // Terrain inside is capped at RWY elev + 3 % of the distance out (~1.7 deg, half
  // of a 3 deg glide path), widening 12 % with distance and fading out over 350 m.
  function approachCap(x, z, h) {
    for (const [zt, dir] of [[RWY.z0, -1], [RWY.z1, 1]]) {
      const along = (z - zt) * dir;
      if (along < -250 || along > 3600) continue;
      const half = 260 + 0.12 * Math.max(0, along);
      const k = ss(Math.abs(x - RWY.x), half + 350, half) * ss(along, 3600, 3200);
      if (k > 0) h = h * (1 - k) + Math.min(h, RWY.elev + 0.03 * Math.max(0, along)) * k;
    }
    return h;
  }
  const inApproach = (x, z, m = 0) => Math.abs(x - RWY.x) < 700 + m && z > RWY.z0 - 3800 - m && z < RWY.z1 + 3800 + m;

  function analyticHeight(x, z) {
    let h = -150 - 55 * (fbm(nSea, x * 0.00025, z * 0.00025, 2) * 0.5 + 0.5);
    h = Math.max(h, mainIsland(x, z), canyonIsland(x, z), volcano(x, z),
      atoll(x, z, 8300, -1900, 1250, Math.PI, 5.5), atoll(x, z, -8300, -2600, 1150, 0, 9.1));
    for (const b of BRIDGES) h = Math.max(h, spit(x, z, b.fromA[0], b.fromA[1], b.a[0], b.a[1], DECK_TOP), spit(x, z, b.fromB[0], b.fromB[1], b.b[0], b.b[1], DECK_TOP));
    const reef = capsule(x, z, REEF.a[0], REEF.a[1], REEF.b[0], REEF.b[1]);
    const reefW = 1 + 0.6 * fbm(nSea, x * 0.0012, z * 0.0012, 3);
    h = Math.max(h, -6.5 - 40 * ss(reef / reefW, 230, 650));                  // shallow reef bank
    if (h > 3) h += 5 * fbm(nDet, x * 0.004, z * 0.004, 3) * ss(h, 3, 20);     // small-scale relief on land
    // Runway peninsula: flatten / raise a pad around runway, taxiway and apron.
    const px0 = RWY.x - 300, px1 = RWY.x + 470, pz0 = RWY.z0 - 140, pz1 = RWY.z1 + 160;
    const dxp = Math.max(px0 - x, 0, x - px1), dzp = Math.max(pz0 - z, 0, z - pz1);
    const pad = ss(Math.hypot(dxp, dzp), 160, 0);
    if (pad > 0) h = h * (1 - pad) + RWY.elev * pad;
    h = approachCap(x, z, h);
    // Fade to open ocean near the map edge.
    const edge = Math.max(Math.abs(x - WORLD.CX), Math.abs(z - WORLD.CZ)) / (WORLD.SIZE / 2);
    return h * (1 - ss(edge, 0.9, 1.0)) + (-180) * ss(edge, 0.9, 1.0);
  }

  /* ------------------------------------------------------ height grid */
  const N = WORLD.SEG, STEP = WORLD.SIZE / N, X0 = WORLD.CX - WORLD.SIZE / 2, Z0 = WORLD.CZ - WORLD.SIZE / 2;
  const grid = new Float32Array((N + 1) * (N + 1));
  for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) grid[j * (N + 1) + i] = analyticHeight(X0 + i * STEP, Z0 + j * STEP);
  // Same triangulation as THREE.PlaneGeometry rotated -90 deg about X: per quad
  // (a=(i,j) b=(i,j+1) c=(i+1,j+1) d=(i+1,j)) faces (a,b,d) and (b,c,d).
  function heightAt(x, z) {
    const fx = (x - X0) / STEP, fz = (z - Z0) / STEP;
    if (fx < 0 || fz < 0 || fx >= N || fz >= N) return -180;
    const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j;
    const r = N + 1, ha = grid[j * r + i], hb = grid[(j + 1) * r + i], hc = grid[(j + 1) * r + i + 1], hd = grid[j * r + i + 1];
    return u + v <= 1 ? ha + (hd - ha) * u + (hb - ha) * v : hc + (hb - hc) * (1 - u) + (hd - hc) * (1 - v);
  }

  /* -------------------------------------------------- terrain mesh */
  function detailTexture(size, seed) {
    const noise = createNoise2D(seed);
    const cv = document.createElement('canvas'); cv.width = cv.height = size;
    const ctx = cv.getContext('2d'), img = ctx.createImageData(size, size);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const n = fbm(noise, (x / size) * 8, (y / size) * 8, 5);                 // tileable enough at this scale
      const v = clamp((0.5 + n * 0.5) * 255, 0, 255);
      const k = (y * size + x) * 4; img.data[k] = img.data[k + 1] = img.data[k + 2] = v; img.data[k + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
  }
  // Desaturated cinematic rock palette (combat VFX pop against it): wet charcoal basalt
  // at the waterline, slate-grey cliff faces, muted olive-slate uplands / ridges, pale
  // weathered stone on the highest peaks. Lowland scrub is a muted green-olive.
  const COL = {
    deep: new THREE.Color(0x2f3f44), seabed: new THREE.Color(0x8f8770), basalt: new THREE.Color(0x252a2e),
    sand: new THREE.Color(0x8c8676), scrub: new THREE.Color(0x4b5a43), scrubDark: new THREE.Color(0x39463a),
    ridge: new THREE.Color(0x464e44), cliff: new THREE.Color(0x3c4349), peak: new THREE.Color(0x73787a),
    pad: new THREE.Color(0x6f7660)
  };
  const geo = new THREE.PlaneGeometry(WORLD.SIZE, WORLD.SIZE, N, N);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const gi = Math.round((pos.getX(i) + WORLD.SIZE / 2) / STEP), gj = Math.round((pos.getZ(i) + WORLD.SIZE / 2) / STEP);
    pos.setY(i, grid[gj * (N + 1) + gi]);
  }
  geo.computeVertexNormals();
  const nrm = geo.attributes.normal, colors = new Float32Array(pos.count * 3), c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const h = pos.getY(i), slope = 1 - nrm.getY(i);
    const wx = pos.getX(i) + WORLD.CX, wz = pos.getZ(i) + WORLD.CZ;
    const v = fbm(nVeg, wx * 0.0018, wz * 0.0018, 3) * 0.5 + 0.5;
    if (h < 0) c.copy(COL.seabed).lerp(COL.basalt, ss(slope, 0.3, 0.5)).lerp(COL.deep, ss(-h, 4, 60));
    else {
      // Waterline: wet charcoal basalt; gentle shores keep a narrow strip of grey sand.
      c.copy(COL.basalt).lerp(COL.sand, (1 - ss(slope, 0.08, 0.2)) * ss(h, 0.8, 3) * (1 - ss(h, 6, 9)));
      const scrub = COL.scrub.clone().lerp(COL.scrubDark, v);
      c.lerp(scrub, ss(h, 5, 12) * (1 - ss(slope, 0.18, 0.3)));               // muted scrub on gentle lowland
      c.lerp(COL.ridge, ss(h, 90, 220));                                       // olive-slate uplands / ridges
      c.lerp(COL.cliff, ss(slope, 0.3, 0.5) * ss(h, 2, 10));                   // sheer slate-grey cliff faces
      c.lerp(COL.basalt, ss(slope, 0.3, 0.5) * (1 - ss(h, 25, 70)));           // dark wet basalt at the cliff foot
      const weather = ss(fbm(nRidge, wx * 0.004, wz * 0.004, 3) + (h - 520) / 220, -0.2, 0.35);
      c.lerp(COL.peak, ss(h, 400, 560) * (1 - 0.6 * ss(slope, 0.45, 0.75)) * weather);   // pale weathered summits
      if (Math.abs(h - RWY.elev) < 0.6 && Math.abs(wx - RWY.x - 85) < 360 && wz > RWY.z0 - 140 && wz < RWY.z1 + 160) c.lerp(COL.pad, 0.6);
    }
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const detail = detailTexture(256, 777);
  const terrainMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.94, metalness: 0 });
  // World-space triplanar detail + horizontal rock strata on steep faces (no UV stretching on cliffs).
  terrainMat.onBeforeCompile = sh => {
    sh.uniforms.uDetail = { value: detail };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos; varying vec3 vWNrm;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWPos = (modelMatrix * vec4(position, 1.0)).xyz; vWNrm = normalize(mat3(modelMatrix) * normal);');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D uDetail; varying vec3 vWPos; varying vec3 vWNrm;')
      .replace('#include <map_fragment>', `#include <map_fragment>
        vec3 tw = pow(abs(vWNrm), vec3(4.0)); tw /= (tw.x + tw.y + tw.z);
        float d1 = texture2D(uDetail, vWPos.zy * 0.012).r * tw.x + texture2D(uDetail, vWPos.xz * 0.012).r * tw.y + texture2D(uDetail, vWPos.xy * 0.012).r * tw.z;
        float d2 = texture2D(uDetail, vWPos.zy * 0.0021).r * tw.x + texture2D(uDetail, vWPos.xz * 0.0021).r * tw.y + texture2D(uDetail, vWPos.xy * 0.0021).r * tw.z;
        float det = d1 * 0.6 + d2 * 0.4;
        float steep = smoothstep(0.32, 0.6, 1.0 - clamp(vWNrm.y, 0.0, 1.0));
        float strata = 0.82 + 0.18 * sin(vWPos.y * 0.62 + det * 7.0);
        diffuseColor.rgb *= (0.74 + 0.52 * det) * mix(1.0, strata, steep);`);
  };
  const terrain = new THREE.Mesh(geo, terrainMat);
  terrain.position.set(WORLD.CX, 0, WORLD.CZ);
  terrain.receiveShadow = false;
  scene.add(terrain);

  /* ---------------------------------------------------- props + lights */
  const props = new THREE.Group(); props.name = 'worldProps'; scene.add(props);
  const boxes = [];                                    // collision: { c, hx, hy, hz, yaw }
  function addBox(cx, cy, cz, hx, hy, hz, yaw = 0) { boxes.push({ c: new THREE.Vector3(cx, cy, cz), hx, hy, hz, yaw }); }
  const M = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0.1, ...extra });
  const mat = {
    concrete: M(0x9a9a94), steel: M(0x6f7780, { metalness: 0.5, roughness: 0.5 }), hangar: M(0x6d7768, { metalness: 0.35, roughness: 0.6 }),
    door: M(0x2a2f2c), white: M(0xe8e8e2), red: M(0xb3261e), glass: M(0x1c2a33, { metalness: 0.6, roughness: 0.2 }),
    tank: M(0xd8dad6, { metalness: 0.4, roughness: 0.45 }), yellow: M(0xd8a21c, { metalness: 0.3 }), bridge: M(0xb8432e, { metalness: 0.4, roughness: 0.55 }),
    deck: M(0x55585c), turbine: M(0xeef0f2, { roughness: 0.5 }), warehouse: M(0x8a8f96, { metalness: 0.3 }), dome: M(0xf2f2ee, { roughness: 0.4 })
  };
  const mesh = (g, m, x, y, z, ry = 0) => { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); o.rotation.y = ry; props.add(o); return o; };
  // Tapered vertical cylinders for collision (sea stacks, rig legs, tanks, radomes).
  const cyls = [];                                     // { x, z, y0, y1, r0, r1 }
  function addCyl(x, z, y0, y1, r0, r1 = r0) { cyls.push({ x, z, y0, y1, r0, r1 }); }

  // Instanced prop batches: every repeated box / cylinder / hangar arch in the world is
  // one InstancedMesh per shape (per-instance colour), not one draw call per part.
  const BATCH = { box: [], cyl: [], arch: [] };
  const _bm = new THREE.Matrix4(), _bq = new THREE.Quaternion(), _be = new THREE.Euler(0, 0, 0, 'YXZ');
  const _bp = new THREE.Vector3(), _bs = new THREE.Vector3(), _bc = new THREE.Color();
  // Box / cylinder of size (sx, sy, sz) centred at (x, y, z), yaw ry then pitch rx / roll rz.
  function inst(kind, x, y, z, sx, sy, sz, hex, ry = 0, rx = 0, rz = 0) { BATCH[kind].push([x, y, z, sx, sy, sz, hex, ry, rx, rz]); }
  // A beam between two points (lattice members, braces, booms, cables-as-struts).
  const _ba = new THREE.Vector3(), _bb = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
  function beam(ax, ay, az, bx, by, bz, w, hex) {
    _ba.set(ax, ay, az); _bb.set(bx, by, bz);
    const len = _ba.distanceTo(_bb);
    BATCH.box.push({ a: _ba.clone(), b: _bb.clone(), len, w, hex });
  }
  function flushBatches() {
    const geos = {
      box: new THREE.BoxGeometry(1, 1, 1),
      cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 14),
      // Hardened aircraft shelter: half-cylinder arch, axis along local z, base at y = 0.
      arch: (() => { const g = new THREE.CylinderGeometry(0.5, 0.5, 1, 16, 1, false, -Math.PI / 2, Math.PI); g.rotateX(Math.PI / 2); return g; })()
    };
    for (const kind of Object.keys(BATCH)) {
      const list = BATCH[kind];
      if (!list.length) continue;
      const im = new THREE.InstancedMesh(geos[kind], M(0xffffff, { metalness: kind === 'arch' ? 0.05 : 0.3, roughness: kind === 'arch' ? 0.9 : 0.62 }), list.length);
      list.forEach((it, k) => {
        if (Array.isArray(it)) {
          const [x, y, z, sx, sy, sz, hex, ry, rx, rz] = it;
          _bq.setFromEuler(_be.set(rx, ry, rz));
          _bm.compose(_bp.set(x, y, z), _bq, _bs.set(sx, sy, sz));
          im.setColorAt(k, _bc.set(hex));
        } else {                                       // beam: unit box stretched along a -> b
          _bp.copy(it.a).add(it.b).multiplyScalar(0.5);
          _bq.setFromUnitVectors(_up, _bs.copy(it.b).sub(it.a).normalize());
          _bm.compose(_bp, _bq, _bs.set(it.w, it.len, it.w));
          im.setColorAt(k, _bc.set(it.hex));
        }
        im.setMatrixAt(k, _bm);
      });
      im.instanceMatrix.needsUpdate = true; im.instanceColor.needsUpdate = true;
      im.computeBoundingSphere();
      props.add(im);
    }
  }

  // Light points: one instanced draw; per point colour, size, mode (0 steady, 1 approach
  // strobe sequence, 2 slow blink, 3 rotating beacon, 4 flicker) and phase.
  const LP = { pos: [], col: [], size: [], mode: [], phase: [] };
  function light(x, y, z, hex, size, mode = 0, phase = 0) {
    const cc = new THREE.Color(hex);
    LP.pos.push(x, y, z); LP.col.push(cc.r, cc.g, cc.b); LP.size.push(size); LP.mode.push(mode); LP.phase.push(phase);
  }

  const beams = [], radars = [];                       // rotating lighthouse beams / radar antennas ({ g, w })
  // ---- ARCHIPELAGO AFB ----------------------------------------------------
  const RL = RWY.z1 - RWY.z0, rwyMidZ = (RWY.z0 + RWY.z1) / 2, E = RWY.elev;
  {
    const cv = document.createElement('canvas'); cv.width = 128; cv.height = 4096;
    const x = cv.getContext('2d'), sx = 128 / RWY.width, sz = 4096 / RL;   // px per metre
    x.fillStyle = '#3d3f42'; x.fillRect(0, 0, 128, 4096);
    for (let i = 0; i < 2600; i++) { x.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '0,0,0'},0.05)`; x.fillRect(Math.random() * 128, Math.random() * 4096, 2, 6); }
    x.fillStyle = '#e8e8e2';
    x.fillRect(2 * sx, 0, 0.9 * sx, 4096); x.fillRect(128 - 2.9 * sx, 0, 0.9 * sx, 4096);   // edge stripes
    for (let zz = 120; zz < RL - 120; zz += 60) x.fillRect(64 - 0.45 * sx, zz * sz, 0.9 * sx, 30 * sz);   // centreline dashes
    for (const [z0, flip] of [[8, false], [RL - 8, true]]) {                // threshold piano keys + numbers
      for (let k = 0; k < 8; k++) {
        const kx = 6 * sx + k * 4.6 * sx + (k >= 4 ? 6 * sx : 0);
        x.fillRect(kx, flip ? (z0 - 30) * sz : z0 * sz, 1.8 * sx, 30 * sz);
      }
      x.save(); x.translate(64, (flip ? z0 - 62 : z0 + 62) * sz); if (!flip) x.rotate(Math.PI);
      x.font = `bold ${Math.round(26 * sz)}px Arial`; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.scale(1, 1.6); x.fillText(flip ? '36' : '18', 0, 0); x.restore();
      x.fillRect(10 * sx, (flip ? z0 - 140 : z0 + 120) * sz, 6 * sx, 20 * sz);   // touchdown zone bars
      x.fillRect(128 - 16 * sx, (flip ? z0 - 140 : z0 + 120) * sz, 6 * sx, 20 * sz);
    }
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
    const rw = new THREE.Mesh(new THREE.PlaneGeometry(RWY.width, RL), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.92,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
    rw.rotation.x = -Math.PI / 2; rw.position.set(RWY.x, E + 0.12, rwyMidZ); props.add(rw);
    const asph = new THREE.MeshStandardMaterial({ color: 0x45474a, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
    const twy = new THREE.Mesh(new THREE.PlaneGeometry(22, RL - 200), asph); twy.rotation.x = -Math.PI / 2; twy.position.set(RWY.x + 150, E + 0.1, rwyMidZ); props.add(twy);
    for (const zc of [RWY.z0 + 140, rwyMidZ, RWY.z1 - 140]) {
      const cn = new THREE.Mesh(new THREE.PlaneGeometry(150, 20), asph); cn.rotation.x = -Math.PI / 2; cn.position.set(RWY.x + 75, E + 0.1, zc); props.add(cn);
    }
    const apron = new THREE.Mesh(new THREE.PlaneGeometry(230, 700), new THREE.MeshStandardMaterial({ color: 0x8b8c88, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }));
    apron.rotation.x = -Math.PI / 2; apron.position.set(RWY.x + 280, E + 0.09, -450); props.add(apron);
    // Arched hangars.
    const hG = new THREE.CylinderGeometry(20, 20, 50, 24, 1, true, 0, Math.PI); hG.rotateZ(Math.PI / 2); hG.rotateY(Math.PI / 2);
    const capG = new THREE.CircleGeometry(20, 24, 0, Math.PI);
    for (let k = 0; k < 4; k++) {
      const hz = -730 + k * 130, hx = RWY.x + 330;
      const hg = mesh(hG, mat.hangar, hx, E, hz); hg.rotation.y = Math.PI / 2;
      const back = mesh(capG, mat.hangar, hx + 25, E, hz, Math.PI / 2); back.material = mat.hangar;
      const door = mesh(capG, mat.door, hx - 24.9, E, hz, -Math.PI / 2);
      addBox(hx, E + 10, hz, 26, 11, 21);
    }
    // Control tower with rotating beacon.
    const tx = RWY.x + 270, tz = -980;
    mesh(new THREE.BoxGeometry(16, 10, 16), mat.concrete, tx, E + 5, tz);
    mesh(new THREE.CylinderGeometry(3.4, 4.2, 34, 12), mat.concrete, tx, E + 27, tz);
    mesh(new THREE.CylinderGeometry(7.5, 6, 6, 8), mat.glass, tx, E + 47, tz);
    mesh(new THREE.CylinderGeometry(8, 8, 1.2, 8), mat.white, tx, E + 50.6, tz);
    addBox(tx, E + 26, tz, 8.5, 26, 8.5);
    light(tx, E + 53, tz, 0x52ff7a, 7, 3, 0); light(tx, E + 53, tz, 0xffffff, 7, 3, 0.5);
    // Tower-top surveillance radar: a slowly sweeping antenna bar on a short mast.
    mesh(new THREE.CylinderGeometry(0.5, 0.6, 4, 8), mat.steel, tx, E + 53.2, tz);
    const bar = new THREE.Group(); bar.position.set(tx, E + 55.6, tz); props.add(bar);
    bar.add(new THREE.Mesh(new THREE.BoxGeometry(15, 1.3, 1.1), mat.white));
    radars.push({ g: bar, w: 0.55 });
    // Hardened aircraft shelters (concrete arches, dark blast doors facing the taxiway).
    for (let k = 0; k < 5; k++) {
      const sz = 560 + k * 140, sx = RWY.x + 410;
      inst('arch', sx, E, sz, 26, 13, 34, 0x8d8e86, Math.PI / 2);
      inst('box', sx - 17.2, E + 5.2, sz, 0.8, 10.4, 22, 0x34383a);
      inst('box', sx + 17, E + 6.5, sz, 1.5, 13, 26, 0x7f807a);
      addBox(sx, E + 6.5, sz, 18, 7, 13.5);
      const stub = new THREE.Mesh(new THREE.PlaneGeometry(250, 26), asph); stub.rotation.x = -Math.PI / 2; stub.position.set(RWY.x + 270, E + 0.1, sz); props.add(stub);
    }
    // Two white geodesic radomes on drums at the north end of the field.
    const domeG = new THREE.IcosahedronGeometry(14, 2), domeM = M(0xf2f3ef, { roughness: 0.45, flatShading: true });
    for (const [dx, dz] of [[RWY.x + 420, -1180], [RWY.x + 420, -1290]]) {
      const gy = Math.max(E, heightAt(dx, dz));
      inst('cyl', dx, gy + 3, dz, 26, 6, 26, 0x9a9a94);
      mesh(domeG, domeM, dx, gy + 12, dz);
      addCyl(dx, dz, gy - 2, gy + 26, 14.5, 8);
      light(dx, gy + 26.5, dz, 0xff2020, 4, 2, dz * 0.001);
    }
    // Spherical fuel tanks.
    const sph = new THREE.SphereGeometry(9, 18, 12), leg = new THREE.CylinderGeometry(0.6, 0.6, 9, 6);
    for (let k = 0; k < 4; k++) {
      const fx = RWY.x + 330 + (k % 2) * 30, fz = 250 + Math.floor(k / 2) * 30;
      mesh(sph, mat.tank, fx, E + 12, fz);
      for (const [ox, oz] of [[6, 0], [-6, 0], [0, 6], [0, -6]]) mesh(leg, mat.steel, fx + ox, E + 4.5, fz + oz);
      addBox(fx, E + 10, fz, 9.5, 10.5, 9.5);
    }
    // Runway edge lights (white, every 60 m), threshold green / end red, approach strobes over the sea.
    // High-intensity runway lights (mode 5: bright by day in overcast, not just at night).
    for (let zz = RWY.z0; zz <= RWY.z1 + 0.1; zz += 60) for (const sx2 of [-1, 1]) light(RWY.x + sx2 * (RWY.width / 2 + 2), E + 0.8, zz, 0xfff4dc, 3.6, 5);
    // Threshold bars: green facing arrivals at both ends, red end-of-runway behind them.
    for (let k = -4; k <= 4; k++) for (const [zt, dz] of [[RWY.z1, 1], [RWY.z0, -1]]) {
      light(RWY.x + k * 5.5, E + 0.8, zt + dz * 3, 0x30ff60, 4, 5);
      light(RWY.x + k * 5.5, E + 0.9, zt + dz * 1, 0xff2a2a, 2.6, 0);
    }
    // ALSF approach lights off BOTH thresholds: sequenced strobes ("rabbit") on the
    // centreline running in toward the runway, white crossbars every 150 m.
    for (const [zt, dz] of [[RWY.z1, 1], [RWY.z0, -1]]) {
      for (let k = 1; k <= 30; k++) {
        const zz = zt + dz * (20 + k * 30), gy = Math.max(E, heightAt(RWY.x, zz), 0);
        light(RWY.x, gy + 1.5 + k * 0.15, zz, 0xffffff, 5.5, 1, 1 - k / 30);
        for (const sx2 of [-1, 1]) light(RWY.x + sx2 * 8, gy + 1.2, zz, 0xfff1c8, 2.8, 5);
        if (k % 5 === 0) for (let b = -3; b <= 3; b++) if (b) light(RWY.x + b * 6, gy + 1.2, zz, 0xfff1c8, 3, 5);
      }
    }
    for (let zz = RWY.z0 + 140; zz < RWY.z1 - 140; zz += 45) light(RWY.x + 150 + 12, E + 0.6, zz, 0x3a7dff, 2.2, 0);   // taxiway blue
  }

  // ---- SUSPENSION BRIDGES --------------------------------------------------
  // Two monumental strait crossings: 240 m twin-leg towers banded red / white for
  // aviation, blinking red obstruction beacons, concrete piers, main cables + hangers,
  // 34 m deck whose girder underside sits 116 m (380 ft) above the water. Collision is
  // per member (deck, each tower leg, each portal beam), so the portal gap between the
  // legs above the deck and the whole under-deck strait are open airspace. The BRIDGE
  // THREAD trigger (src/combat.js) reads the same a / b / under values.
  const bridgeInfo = [];
  for (const b of BRIDGES) {
    const A = new THREE.Vector3(b.a[0], DECK_TOP, b.a[1]), B = new THREE.Vector3(b.b[0], DECK_TOP, b.b[1]);
    const span = A.distanceTo(B), dir = B.clone().sub(A).normalize(), yaw = Math.atan2(dir.x, dir.z);
    const mid = A.clone().add(B).multiplyScalar(0.5);
    const DH = DECK_TOP - DECK_UNDER, deckY = (DECK_TOP + DECK_UNDER) / 2;
    mesh(new THREE.BoxGeometry(34, DH, span + 160), mat.deck, mid.x, deckY, mid.z, yaw);
    addBox(mid.x, deckY, mid.z, 17, DH / 2, span / 2 + 80, yaw);
    const side = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));                // deck-right in world
    for (const s of [-1, 1]) {                                                         // parapet / edge girders
      const e = mid.clone().addScaledVector(side, s * 16.5);
      inst('box', e.x, DECK_TOP + 1.2, e.z, 1.2, 2.4, span + 160, 0xb8432e, yaw);
    }
    const towers = [0.2, 0.8].map(f => A.clone().lerp(B, f));
    const LEG = 19, BANDS = 8, bandH = TOWER_TOP / BANDS;
    for (const T of towers) {
      for (const s of [-1, 1]) {
        const p = T.clone().addScaledVector(side, s * LEG);
        // Aviation banding: alternating red / white sections, red at the top.
        for (let k = 0; k < BANDS; k++) inst('box', p.x, (k + 0.5) * bandH, p.z, 8, bandH + 0.05, 8, (BANDS - 1 - k) % 2 ? 0xf1efe8 : 0xc0281f, yaw);
        addBox(p.x, TOWER_TOP / 2, p.z, 4.6, TOWER_TOP / 2, 4.6, yaw);
        light(p.x, TOWER_TOP + 1.5, p.z, 0xff2020, 10, 2, s > 0 ? 0 : 0.5);             // obstruction beacons
        light(p.x + side.x * s * 4.5, TOWER_TOP * 0.55, p.z + side.z * s * 4.5, 0xff2020, 6, 2, s > 0 ? 0.25 : 0.75);
      }
      // Portal beams (one under the deck carrying it, two above framing the gap).
      for (const yy of [DECK_UNDER - 5, 190, TOWER_TOP - 6]) {
        inst('box', T.x, yy, T.z, LEG * 2 + 8, 8, 8, 0xc0281f, yaw);
        addBox(T.x, yy, T.z, LEG + 4, 4.2, 4.2, yaw);
      }
      inst('box', T.x, -6, T.z, LEG * 2 + 26, 24, 22, 0x8f908a, yaw);                // concrete pier
      addBox(T.x, -6, T.z, LEG + 13, 12, 11, yaw);
    }
    // Main cables (back-stays from the abutments, catenary between towers) + hangers.
    const susp = [];
    for (const s of [-1, 1]) {
      const pts = [];
      const T0 = towers[0].clone().addScaledVector(side, s * LEG), T1 = towers[1].clone().addScaledVector(side, s * LEG);
      const A0 = A.clone().addScaledVector(side, s * LEG).setY(DECK_TOP + 2), B0 = B.clone().addScaledVector(side, s * LEG).setY(DECK_TOP + 2);
      for (let k = 0; k <= 8; k++) pts.push(A0.clone().lerp(T0, k / 8).setY(DECK_TOP + 2 + (TOWER_TOP - DECK_TOP - 2) * Math.pow(k / 8, 1.4)));
      for (let k = 1; k <= 40; k++) { const f = k / 40, p = T0.clone().lerp(T1, f); p.y = TOWER_TOP - (TOWER_TOP - DECK_TOP - 14) * (1 - (2 * f - 1) ** 2); pts.push(p); }
      for (let k = 1; k <= 8; k++) pts.push(T1.clone().lerp(B0, k / 8).setY(TOWER_TOP - (TOWER_TOP - DECK_TOP - 2) * (1 - Math.pow(1 - k / 8, 1.4))));
      const curve = new THREE.CatmullRomCurve3(pts);
      props.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 160, 1.3, 6, false), mat.bridge));
      for (let k = 1; k < 120; k++) { const p = curve.getPointAt(k / 120); if (p.y > DECK_TOP + 4) susp.push(p.x, p.y, p.z, p.x, DECK_TOP, p.z); }
    }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(susp, 3));
    props.add(new THREE.LineSegments(sg, new THREE.LineBasicMaterial({ color: 0x6a2a20 })));
    for (let k = 0; k <= 16; k++) { const p = A.clone().lerp(B, k / 16); for (const s of [-1, 1]) light(p.x + side.x * s * 15, DECK_TOP + 1.4, p.z + side.z * s * 15, 0xffd08a, 2.6, 0); }
    bridgeInfo.push({ a: A, b: B, towers, under: DECK_UNDER, top: TOWER_TOP });
  }

  // ---- HARBOUR, PORT TOWN, BREAKWATERS, CRANES -------------------------------
  {
    const qx = -1755;
    mesh(new THREE.BoxGeometry(60, 6, 1100), mat.concrete, qx, 0, -900);                    // quay
    addBox(qx, 0, -900, 30, 3, 550);
    for (let k = 0; k < 6; k++) {
      const wz = -1350 + k * 170, wx = -1650 + (k % 2) * 30, wy = Math.max(3, heightAt(wx, wz));
      mesh(new THREE.BoxGeometry(48, 16, 110), mat.warehouse, wx, wy + 8, wz);
      addBox(wx, wy + 8, wz, 24, 8, 55);
    }
    // Ship-to-shore container gantry cranes (instanced members): 62 m portal legs,
    // 105 m boom reaching out over the water, A-frame apex with fore / back stays.
    for (let k = 0; k < 5; k++) {
      const cz = -1350 + k * 220, cx = qx - 2, Y = 3, PH = 62, col = k % 2 ? 0xd8a21c : 0xc94a1e;
      for (const [ox, oz] of [[-13, -11], [13, -11], [-13, 11], [13, 11]]) inst('box', cx + ox, Y + PH / 2, cz + oz, 2.6, PH, 2.6, col);
      for (const oz of [-11, 11]) { inst('box', cx, Y + 14, cz + oz, 28, 2.2, 2.2, col); beam(cx - 13, Y + 2, cz + oz, cx + 13, Y + PH - 4, cz + oz, 1.4, col); }
      for (const ox of [-13, 13]) inst('box', cx + ox, Y + PH, cz, 3, 3, 24, col);
      for (const oz of [-9, 9]) inst('box', cx - 32, Y + PH + 2, cz + oz, 105, 3.2, 2.4, col);   // twin boom girders
      inst('box', cx + 8, Y + PH + 7, cz, 14, 8, 16, 0xe8e8e2);                                   // machinery house
      for (const oz of [-9, 9]) {
        beam(cx, Y + PH + 3, cz + oz, cx + 4, Y + PH + 30, cz + oz, 1.8, col);                     // A-frame
        beam(cx + 4, Y + PH + 30, cz + oz, cx - 80, Y + PH + 3, cz + oz, 0.7, 0x55585c);           // fore stay
        beam(cx + 4, Y + PH + 30, cz + oz, cx + 20, Y + PH + 3, cz + oz, 0.7, 0x55585c);           // back stay
      }
      addBox(cx, Y + PH / 2, cz, 15, PH / 2 + 2, 13);
      addBox(cx - 32, Y + PH + 12, cz, 54, 14, 11);
      light(cx - 84, Y + PH + 3, cz, 0xff2020, 5, 2, k * 0.3); light(cx + 4, Y + PH + 31, cz, 0xff2020, 6, 2, k * 0.3 + 0.5);
    }
    // White cylindrical fuel-storage tank farm on the flat ground behind the quay.
    const tanks = [];
    {
      const trnd = env.mulberry32(733);
      for (let k = 0; k < 400 && tanks.length < 10; k++) {
        const x = -1700 + trnd() * 700, z = -250 + trnd() * 520, r = 13 + trnd() * 7, y = heightAt(x, z);
        if (y < 3 || y > 60 || tanks.some(t => Math.hypot(t[0] - x, t[1] - z) < t[2] + r + 10)) continue;
        let flat = true;
        for (const [ox, oz] of [[r, 0], [-r, 0], [0, r], [0, -r]]) if (Math.abs(heightAt(x + ox, z + oz) - y) > 3) flat = false;
        if (!flat) continue;
        const h = 16 + trnd() * 9;
        tanks.push([x, z, r]);
        inst('cyl', x, y + h / 2 - 1, z, r * 2, h + 2, r * 2, 0xe9ebe7);
        inst('cyl', x, y + h + 0.6, z, r * 1.9, 1.2, r * 1.9, 0xb9bdbb);
        inst('box', x + r * 0.7, y + h / 2, z + r * 0.7, 0.8, h, 0.8, 0x6f7780, Math.PI / 4);      // stair stringer
        addCyl(x, z, y - 2, y + h + 1.5, r + 0.5);
      }
    }
    // Breakwaters across the bay mouth (west).
    mesh(new THREE.BoxGeometry(24, 8, 620), mat.concrete, -3420, 0, -1350, 0.5);
    mesh(new THREE.BoxGeometry(24, 8, 560), mat.concrete, -3380, 0, -420, -0.55);
    addBox(-3420, 0, -1350, 12, 4, 310, 0.5); addBox(-3380, 0, -420, 12, 4, 280, -0.55);
    light(-3270, 8, -1080, 0x30ff60, 5, 2, 0.2); light(-3250, 8, -650, 0xff2a2a, 5, 2, 0.7);
    // Waterfront town: instanced houses on gentle slopes above the quay.
    const rnd = env.mulberry32(5150), houses = [];
    for (let k = 0; k < 900 && houses.length < 170; k++) {
      const hx = -1650 + (rnd() - 0.2) * 1300, hz = -900 + (rnd() - 0.5) * 1700, hy = heightAt(hx, hz);
      if (hy < 4 || hy > 80 || Math.abs(heightAt(hx + 12, hz) - hy) > 5 || Math.abs(heightAt(hx, hz + 12) - hy) > 5) continue;
      if (hx > RWY.x - 400) continue;
      if (tanks.some(t => Math.hypot(t[0] - hx, t[1] - hz) < t[2] + 22)) continue;
      houses.push([hx, hy, hz, 8 + rnd() * 10, 6 + rnd() * 9, 8 + rnd() * 10, rnd() * Math.PI]);
    }
    const body = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), M(0xffffff, { roughness: 0.85 }), houses.length);
    const roofG = new THREE.ConeGeometry(0.75, 1, 4); roofG.rotateY(Math.PI / 4);
    const roof = new THREE.InstancedMesh(roofG, M(0xffffff, { roughness: 0.8 }), houses.length);
    const m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), wall = new THREE.Color(), rc = new THREE.Color();
    houses.forEach(([hx, hy, hz, w, h, d, r], k) => {
      q4.setFromAxisAngle(new THREE.Vector3(0, 1, 0), r);
      m4.compose(new THREE.Vector3(hx, hy + h / 2, hz), q4, new THREE.Vector3(w, h, d)); body.setMatrixAt(k, m4);
      m4.compose(new THREE.Vector3(hx, hy + h + 2.5, hz), q4, new THREE.Vector3(w * 1.05, 5, d * 1.05)); roof.setMatrixAt(k, m4);
      body.setColorAt(k, wall.setHSL(0.08 + rnd() * 0.08, 0.15 + rnd() * 0.2, 0.72 + rnd() * 0.18));
      roof.setColorAt(k, rc.setHSL(rnd() < 0.6 ? 0.02 : 0.58, 0.45, 0.32 + rnd() * 0.12));
      if (rnd() < 0.55) light(hx + (rnd() - 0.5) * w, hy + 2 + rnd() * h * 0.6, hz + (rnd() - 0.5) * d, 0xffc46a, 2.4 + rnd() * 1.5, 4, rnd());
    });
    props.add(body, roof);
  }

  // ---- LIGHTHOUSES (rotating beams) + RADAR STATIONS ------------------------
  const beamG = new THREE.CylinderGeometry(1.5, 34, 1100, 16, 1, true); beamG.translate(0, 550, 0); beamG.rotateZ(-Math.PI / 2);
  const beamMat = new THREE.MeshBasicMaterial({ color: 0xfff2c8, transparent: true, opacity: 0.15, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
  function lighthouse(x, z) {
    const y = Math.max(2, heightAt(x, z));
    for (let k = 0; k < 5; k++) mesh(new THREE.CylinderGeometry(3.6 - k * 0.25, 3.8 - k * 0.25, 6, 14), k % 2 ? mat.red : mat.white, x, y + 3 + k * 6, z);
    mesh(new THREE.CylinderGeometry(3.4, 3.4, 4, 10), mat.glass, x, y + 33, z);
    mesh(new THREE.ConeGeometry(3.8, 4, 10), mat.red, x, y + 37, z);
    addBox(x, y + 18, z, 4, 20, 4);
    const pivot = new THREE.Group(); pivot.position.set(x, y + 33, z); props.add(pivot);
    for (const r of [0, Math.PI]) { const bm = new THREE.Mesh(beamG, beamMat); bm.rotation.y = r; pivot.add(bm); }
    beams.push(pivot);
    light(x, y + 33, z, 0xfff6d0, 10, 0);
  }
  function radarStation(x, z) {
    const y = Math.max(2, heightAt(x, z));
    mesh(new THREE.BoxGeometry(16, 8, 12), mat.concrete, x, y + 4, z);
    mesh(new THREE.SphereGeometry(9, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2), mat.dome, x - 14, y + 2, z);
    const mast = mesh(new THREE.CylinderGeometry(0.8, 1.1, 14, 8), mat.steel, x + 8, y + 15, z);
    const ant = new THREE.Group(); ant.position.set(x + 8, y + 23, z); props.add(ant);
    const dish = new THREE.Mesh(new THREE.BoxGeometry(16, 3, 1), mat.steel); ant.add(dish);
    radars.push({ g: ant, w: 1.6 });
    addBox(x - 3, y + 10, z, 20, 12, 10);
    light(x + 8, y + 25, z, 0xff2020, 5, 2, 0.4);
  }
  const atollTip = (cx, cz, R, openAng, side) => [cx + Math.cos(openAng + side * 1.05) * R, cz + Math.sin(openAng + side * 1.05) * R];
  const atollHill = (cx, cz, R, openAng) => [cx + Math.cos(openAng + Math.PI) * R, cz + Math.sin(openAng + Math.PI) * R];
  lighthouse(...atollTip(8300, -1900, 1250, Math.PI, 1));
  lighthouse(...atollTip(-8300, -2600, 1150, 0, -1));
  lighthouse(-1150, 880);                                                                      // main island south cape
  radarStation(...atollHill(8300, -1900, 1250, Math.PI));
  radarStation(...atollHill(-8300, -2600, 1150, 0));

  // ---- OFFSHORE WIND FARM (reef bank) ----------------------------------------
  const rotors = [];
  {
    const towerG = new THREE.CylinderGeometry(1.8, 2.8, 88, 12), nacG = new THREE.BoxGeometry(4, 4, 11), hubG = new THREE.SphereGeometry(2.2, 10, 8);
    const bladeG = new THREE.BoxGeometry(2.4, 42, 0.5); bladeG.translate(0, 21, 0);
    const n = 9;
    for (let k = 0; k < n; k++) {
      const f = (k + 0.5) / n, x = REEF.a[0] + (REEF.b[0] - REEF.a[0]) * f, z = REEF.a[1] + (REEF.b[1] - REEF.a[1]) * f;
      mesh(new THREE.CylinderGeometry(4, 4.5, 14, 12), mat.yellow, x, 0, z);
      mesh(towerG, mat.turbine, x, 44, z);
      const nac = mesh(nacG, mat.turbine, x, 90, z - 2);
      const rotor = new THREE.Group(); rotor.position.set(x, 90, z - 8.6); props.add(rotor);
      rotor.add(new THREE.Mesh(hubG, mat.turbine));
      for (let b = 0; b < 3; b++) { const bl = new THREE.Mesh(bladeG, mat.turbine); bl.rotation.z = b * Math.PI * 2 / 3; rotor.add(bl); }
      rotor.rotation.z = k * 0.7;
      rotors.push({ g: rotor, w: 0.55 + (k % 3) * 0.06 });
      addBox(x, 45, z, 3, 46, 3);
      addBox(x, 90, z - 8.6, 44, 44, 3);                                                       // rotor disc
      light(x, 93, z - 2, 0xff2020, 6, 2, (k % 2) * 0.5);
    }
  }

  // ---- OFFSHORE OIL PLATFORMS ------------------------------------------------
  // Steel-lattice jackets in the open sea lanes: 4 legs + X-bracing, 90 m main deck,
  // process modules, lattice derrick, cantilevered helipad, crane, and a flare boom
  // with a flickering orange gas flame (mesh by day, flare light point at night).
  const RIGS = [[-6300, 4300, 0.4], [7700, 5600, -0.7], [-300, -11300, 1.2]];
  const flames = [];
  {
    const flameTex = (() => {
      const cv = document.createElement('canvas'); cv.width = 64; cv.height = 128;
      const g = cv.getContext('2d'), gr = g.createRadialGradient(32, 96, 2, 32, 80, 60);
      gr.addColorStop(0, 'rgba(255,250,210,1)'); gr.addColorStop(0.25, 'rgba(255,190,70,0.95)');
      gr.addColorStop(0.6, 'rgba(255,90,20,0.45)'); gr.addColorStop(1, 'rgba(255,60,10,0)');
      g.fillStyle = gr; g.beginPath(); g.ellipse(32, 72, 26, 56, 0, 0, Math.PI * 2); g.fill();
      return new THREE.CanvasTexture(cv);
    })();
    const flameMat = new THREE.SpriteMaterial({ map: flameTex, color: 0xffffff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false, fog: false });
    const rot = (ox, oz, c, s) => [ox * c - oz * s, ox * s + oz * c];
    for (const [rx, rz, ry] of RIGS) {
      const c = Math.cos(ry), s = Math.sin(ry), P = (ox, oz) => { const [a, b] = rot(ox, oz, c, s); return [rx + a, rz + b]; };
      const DECK = 38, L = 30, GREY = 0x7a8088, YEL = 0xd9a520;
      // Jacket legs (battered slightly inward) + bracing on all four faces.
      const legs = [[-L, -L], [L, -L], [L, L], [-L, L]].map(([ox, oz]) => P(ox, oz));
      for (const [lx, lz] of legs) { inst('cyl', lx, (DECK - 34) / 2, lz, 5, DECK + 34, 5, YEL); addCyl(lx, lz, -40, DECK, 3.4); }
      for (let i = 0; i < 4; i++) {
        const [ax, az] = legs[i], [bx, bz] = legs[(i + 1) % 4];
        for (const yy of [2, 18, 32]) beam(ax, yy, az, bx, yy, bz, 1.3, GREY);
        beam(ax, 2, az, bx, 18, bz, 1.1, GREY); beam(bx, 2, bz, ax, 18, az, 1.1, GREY);
        beam(ax, 18, az, bx, 32, bz, 1.1, GREY); beam(bx, 18, bz, ax, 32, az, 1.1, GREY);
      }
      // Decks + modules.
      inst('box', rx, DECK, rz, 90, 4, 90, 0x5c6168, -ry);
      inst('box', rx, DECK + 14, rz, 74, 3, 66, 0x5c6168, -ry);
      for (const [ox, oz, w, h, d, col] of [[-22, -20, 30, 12, 26, 0xe2e2dc], [16, -24, 26, 12, 20, 0xc9542a], [-24, 18, 26, 10, 30, 0x8c939a],
        [20, 22, 22, 9, 24, 0xe2e2dc], [0, 0, 18, 22, 18, 0x9aa1a8]]) { const [mx, mz] = P(ox, oz); inst('box', mx, DECK + 2 + h / 2, mz, w, h, d, col, -ry); }
      addBox(rx, DECK + 12, rz, 46, 14, 46, -ry);
      // Lattice derrick (4 tapered corner posts + rings + diagonals), 64 m.
      const [dx0, dz0] = P(-20, 14), DB = DECK + 16, DT = DB + 64;
      const corners = [[-6, -6], [6, -6], [6, 6], [-6, 6]];
      for (let i = 0; i < 4; i++) {
        const [ox, oz] = corners[i], [px2, pz2] = corners[(i + 1) % 4];
        beam(dx0 + ox, DB, dz0 + oz, dx0 + ox * 0.25, DT, dz0 + oz * 0.25, 1.1, 0xd8d8d0);
        for (let k = 0; k < 6; k++) {
          const f0 = k / 6, f1 = (k + 1) / 6, w0 = 1 - 0.75 * f0, w1 = 1 - 0.75 * f1;
          beam(dx0 + ox * w0, DB + 64 * f0, dz0 + oz * w0, dx0 + px2 * w1, DB + 64 * f1, dz0 + pz2 * w1, 0.5, 0xd8d8d0);
          beam(dx0 + ox * w1, DB + 64 * f1, dz0 + oz * w1, dx0 + px2 * w1, DB + 64 * f1, dz0 + pz2 * w1, 0.5, 0xd8d8d0);
        }
      }
      addBox(dx0, (DB + DT) / 2, dz0, 7, 32, 7, -ry);
      light(dx0, DT + 1, dz0, 0xff2020, 7, 2, rx * 0.001);
      // Cantilevered helipad (dark green with white ring + H) off one corner.
      const [hx, hz] = P(48, 34);
      inst('cyl', hx, DECK + 20, hz, 30, 1.4, 30, 0xf0f0ea);
      inst('cyl', hx, DECK + 20.5, hz, 27, 1.4, 27, 0x2f4a36);
      for (const [ox, oz, w, d] of [[-4, 0, 1.6, 11], [4, 0, 1.6, 11], [0, 0, 8, 1.6]]) { const [a, b] = rot(ox, oz, c, s); inst('box', hx + a, DECK + 21.3, hz + b, w, 0.3, d, 0xf0f0ea, -ry); }
      beam(...P(30, 30).flatMap((v, i) => (i ? [DECK + 14, v] : [v])), hx, DECK + 19, hz, 2, GREY);
      addCyl(hx, hz, DECK + 18, DECK + 22, 15);
      // Pedestal crane.
      const [cx2, cz2] = P(28, -10);
      inst('cyl', cx2, DECK + 22, cz2, 3, 16, 3, YEL);
      beam(cx2, DECK + 30, cz2, ...((v) => [v[0], DECK + 52, v[1]])(P(70, -30)), 1.4, YEL);
      // Flare boom: lattice arm angled up and out, flame sprite at the tip.
      const [fbx, fbz] = P(-45, -45), [ftx, ftz] = P(-105, -105), FT = DECK + 62;
      beam(fbx, DECK + 4, fbz, ftx, FT, ftz, 2.2, 0xb0b4b8);
      beam(fbx + 3, DECK + 4, fbz - 3, ftx, FT, ftz, 1.0, 0xb0b4b8);
      addCyl(ftx, ftz, FT - 6, FT + 30, 6);
      const fl = new THREE.Sprite(flameMat); fl.position.set(ftx, FT + 10, ftz); fl.scale.set(10, 22, 1); props.add(fl);
      flames.push({ s: fl, base: FT, ph: rx * 0.01 });
      light(ftx, FT + 6, ftz, 0xff8a2a, 16, 6, rz * 0.001);
      for (const [lx, lz] of legs) light(lx, DECK + 3, lz, 0xff2020, 4, 2, (lx + lz) * 0.001);
    }
  }

  // ---- BASALT SEA STACKS -----------------------------------------------------
  // 12-18 sheer columnar rock needles (120-380 m) in the straits and off the coasts:
  // high-speed parallax anchors. One InstancedMesh, tapered-cylinder collision each.
  // Kept clear of the runway approach funnels, bridge spans, canyon mouths, the wind
  // farm and the oil rigs.
  const stacks = [];
  {
    const g = new THREE.CylinderGeometry(0.5, 1, 1, 9, 10, false);
    g.translate(0, 0.5, 0);
    const gp = g.attributes.position, nz = createNoise2D(4711);
    for (let i = 0; i < gp.count; i++) {                                   // columnar jointing + jagged crown
      const x = gp.getX(i), y = gp.getY(i), z = gp.getZ(i), a = Math.atan2(z, x);
      const k = 1 + 0.16 * nz(Math.cos(a) * 1.7, y * 2.3) + 0.08 * Math.sign(Math.sin(a * 9));
      gp.setX(i, x * k); gp.setZ(i, z * k);
      if (y > 0.95) gp.setY(i, y + 0.12 * nz(x * 4, z * 4));
    }
    g.computeVertexNormals();
    const srnd = env.mulberry32(9157);
    const bridgeD = (x, z) => Math.min(...BRIDGES.map(b => capsule(x, z, b.a[0], b.a[1], b.b[0], b.b[1])));
    for (let k = 0; k < 6000 && stacks.length < 15; k++) {
      const x = X0 + 900 + srnd() * (WORLD.SIZE - 1800), z = Z0 + 900 + srnd() * (WORLD.SIZE - 1800);
      if (heightAt(x, z) > -12) continue;
      let nearLand = false;
      for (let a = 0; a < 8 && !nearLand; a++) for (const r of [350, 700, 1100]) if (heightAt(x + Math.cos(a * 0.785) * r, z + Math.sin(a * 0.785) * r) > 8) nearLand = true;
      if (!nearLand) continue;
      if (inApproach(x, z, 300) || bridgeD(x, z) < 750) continue;
      if (z > -11400 && z < -5000 && Math.abs(x - canyonX(z)) < 900) continue;      // canyon mouths
      if (capsule(x, z, REEF.a[0], REEF.a[1], REEF.b[0], REEF.b[1]) < 700) continue;
      if (RIGS.some(([rx, rz]) => Math.hypot(rx - x, rz - z) < 1200)) continue;
      if (stacks.some(st => Math.hypot(st.x - x, st.z - z) < 650)) continue;
      const h = 120 + srnd() * 260, r = 28 + h * 0.1 + srnd() * 18;
      stacks.push({ x, z, h, r, ry: srnd() * Math.PI * 2 });
    }
    const sm = new THREE.InstancedMesh(g, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.96, flatShading: true }), stacks.length);
    const sq = new THREE.Quaternion(), sc = new THREE.Color();
    stacks.forEach((st, k) => {
      sq.setFromAxisAngle(_up, st.ry);
      _bm.compose(_bp.set(st.x, -30, st.z), sq, _bs.set(st.r, st.h + 30, st.r)); sm.setMatrixAt(k, _bm);   // base radius r, crown ~r / 2
      sm.setColorAt(k, sc.set(0x4a5258).lerp(new THREE.Color(0x5e666c), srnd() * 0.7));   // lit basalt reads ~#3c4349 in shade
      addCyl(st.x, st.z, -30, st.h + 4, st.r * 1.2, st.r * 0.6);
    });
    sm.computeBoundingSphere();
    props.add(sm);
  }

  flushBatches();

  // ---- light-point renderer ---------------------------------------------------
  const lg = new THREE.BufferGeometry();
  lg.setAttribute('position', new THREE.Float32BufferAttribute(LP.pos, 3));
  lg.setAttribute('aColor', new THREE.Float32BufferAttribute(LP.col, 3));
  lg.setAttribute('aSize', new THREE.Float32BufferAttribute(LP.size, 1));
  lg.setAttribute('aMode', new THREE.Float32BufferAttribute(LP.mode, 1));
  lg.setAttribute('aPhase', new THREE.Float32BufferAttribute(LP.phase, 1));
  const lightMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uNight: { value: 0 }, uScale: { value: 600 } },
    vertexShader: `
      #include <common>
      #include <logdepthbuf_pars_vertex>
      attribute vec3 aColor; attribute float aSize; attribute float aMode; attribute float aPhase;
      uniform float uTime; uniform float uNight; uniform float uScale;
      varying vec3 vC; varying float vA;
      void main() {
        float on = 1.0;
        if (aMode > 0.5 && aMode < 1.5) on = step(fract(uTime * 0.5 - aPhase), 0.06);          // sequenced strobe
        else if (aMode > 1.5 && aMode < 2.5) on = step(fract(uTime * 0.65 + aPhase), 0.35);    // slow blink
        else if (aMode > 2.5 && aMode < 3.5) on = pow(max(0.0, cos((uTime * 0.8 + aPhase) * 6.2831853)), 6.0);   // rotating beacon
        else if (aMode > 3.5 && aMode < 4.5) on = 0.75 + 0.25 * sin(uTime * (1.0 + aPhase * 3.0) + aPhase * 50.0);  // window flicker
        else if (aMode > 5.5) on = 0.8 + 0.2 * sin(uTime * 23.0 + aPhase * 40.0) * sin(uTime * 9.0 + aPhase * 11.0);  // gas flare
        // Visibility: windows only at night; high-intensity runway / approach / flare lights
        // (modes 1, 5, 6) stay bright by day so the field reads through overcast from 10+ km.
        bool hi = (aMode > 0.5 && aMode < 1.5) || aMode > 4.5;
        float vis = (aMode > 3.5 && aMode < 4.5) ? smoothstep(0.35, 0.8, uNight) : mix(hi ? 0.7 : 0.18, 1.0, uNight);
        vC = aColor; vA = on * vis;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        // Distant lights never shrink below a few pixels so runways / towers read from miles out at night.
        float minPx = hi ? 3.2 + 2.0 * uNight : 2.2 + 2.6 * uNight;
        gl_PointSize = clamp(aSize * uScale / max(1.0, -mv.z), minPx, 56.0) * (hi ? 0.85 + 0.15 * uNight : 0.65 + 0.35 * uNight);
        gl_Position = projectionMatrix * mv;
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: `
      #include <logdepthbuf_pars_fragment>
      varying vec3 vC; varying float vA;
      void main() {
        #include <logdepthbuf_fragment>
        float r = length(gl_PointCoord - 0.5) * 2.0;
        float a = vA * (smoothstep(1.0, 0.0, r) * 0.55 + smoothstep(0.35, 0.0, r));
        if (a < 0.01) discard;
        gl_FragColor = vec4(vC * (1.0 + 2.0 * smoothstep(0.3, 0.0, r)), a);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false
  });
  const lightPts = new THREE.Points(lg, lightMat);
  lightPts.frustumCulled = false; lightPts.renderOrder = 7;
  scene.add(lightPts);

  /* --------------------------------------------------------------- frame */
  let night = 0;
  function update(dt, t, nightLevel, renderer, camera) {
    night = nightLevel;
    lightMat.uniforms.uTime.value = t;
    lightMat.uniforms.uNight.value = nightLevel;
    if (renderer && camera) lightMat.uniforms.uScale.value = renderer.domElement.height / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
    beamMat.opacity = 0.03 + 0.2 * nightLevel;
    for (const b of beams) b.rotation.y = t * 1.1;
    for (const r of radars) r.g.rotation.y = t * r.w;
    for (const r of rotors) r.g.rotation.z += r.w * dt;
    for (const f of flames) {                                  // gas flare: turbulent flicker + lick
      const k = 0.85 + 0.15 * Math.sin(t * 17 + f.ph) * Math.sin(t * 6.3 + f.ph * 3) + 0.06 * Math.sin(t * 41 + f.ph);
      f.s.scale.set(16 * (0.9 + 0.1 * Math.sin(t * 13 + f.ph)), 36 * k, 1);
      f.s.position.y = f.base + 16 * k;
    }
  }
  // Solid obstacles (bridges, towers, hangars, cranes, turbines ...).
  const _l = new THREE.Vector3();
  function collide(p, pad = 0) {
    for (const b of boxes) {
      _l.copy(p).sub(b.c);
      const c = Math.cos(-b.yaw), s = Math.sin(-b.yaw);
      const lx = _l.x * c + _l.z * s, lz = -_l.x * s + _l.z * c;
      if (Math.abs(lx) < b.hx + pad && Math.abs(_l.y) < b.hy + pad && Math.abs(lz) < b.hz + pad) return b;
    }
    for (const q of cyls) {                                    // tapered cylinders (stacks, rig legs, tanks, radomes)
      if (p.y < q.y0 - pad || p.y > q.y1 + pad) continue;
      const f = clamp((p.y - q.y0) / (q.y1 - q.y0), 0, 1), r = q.r0 + (q.r1 - q.r0) * f + pad;
      const dx = p.x - q.x, dz = p.z - q.z;
      if (dx * dx + dz * dz < r * r) return q;
    }
    return null;
  }

  return {
    terrain, props, heightAt, analyticHeight, collide, update,
    runway: RWY, bridges: bridgeInfo, obstacleCount: () => boxes.length + cyls.length,
    stacks, rigs: RIGS.map(([x, z]) => ({ x, z })), canyonHalf,
    // Radar overlay marks: runway + bridge spans (world x / z polylines).
    marks: [
      { kind: 'runway', pts: [[RWY.x, RWY.z0], [RWY.x, RWY.z1]] },
      ...bridgeInfo.map(b => ({ kind: 'bridge', pts: [[b.a.x, b.a.z], [b.b.x, b.b.z]] }))
    ],
    landmarks: {
      airbase: new THREE.Vector3(RWY.x, RWY.elev, rwyMidZ),
      canyonEntry: new THREE.Vector3(canyonX(-5600), 0, -5600),
      volcano: new THREE.Vector3(5600, 975, -8300),
      bridgeA: bridgeInfo[0].a.clone().lerp(bridgeInfo[0].b, 0.5),
      bridgeB: bridgeInfo[1].a.clone().lerp(bridgeInfo[1].b, 0.5),
      windFarm: new THREE.Vector3((REEF.a[0] + REEF.b[0]) / 2, 0, (REEF.a[1] + REEF.b[1]) / 2)
    },
    canyonX
  };
}
