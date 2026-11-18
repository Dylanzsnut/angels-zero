// ANGELS ZERO — articulated F-15C control surfaces + F100 variable nozzles.
//
// assets/angels_zero_jet.glb carries Ctrl_* nodes whose origin sits on the
// hinge line, with the hinge axis in glTF extras (userData.hinge_axis) and
// the surface type in userData.hinge_kind. Each frame every surface springs
// (dt * 12) toward a deflection derived from the live flight commands:
//   stabilators  all-moving slabs: pitch +/- roll differential, clamp +/-24 deg
//   ailerons     opposing roll, +/-20 deg
//   flaps        auto droop 0 -> 26 deg below ~260 kt / at high AoA
//   rudders      yaw (manual A/D + turn coordination), +/-22 deg
//   speedbrake   dorsal panel 0 -> 46 deg up while braking (S) or overspeed
//   intake ramps Intake_Ramp_L/R: flush below M0.7, nodding down to -11 deg by M2.0
// Supersonic aileron lockout: across M0.95 -> M1.05 the ailerons fair flush to
// 0 deg and the stabilator roll differential grows from +/-9 to +/-20 deg so the
// tails carry 100 % of the roll authority (as on the real F-15).
// Sign conventions (model axes: x right, y up, z aft): a positive rotation
// about +X moves an aft trailing edge DOWN; about +Y moves it to the RIGHT.
// Nozzle_L / Nozzle_R scale radially (x / y about the nozzle centre): relaxed
// open at idle, constricted to 0.84x at military power, flared to 1.16x in
// afterburner, with an inner turbine / afterburner glow ring.

const D2R = Math.PI / 180;

export function createSurfaces(THREE, model) {
  const clamp = THREE.MathUtils.clamp;
  const smooth = THREE.MathUtils.smoothstep;
  const surfaces = {}, nozzles = [];
  model.traverse(o => {
    const kind = o.userData && o.userData.hinge_kind;
    if (!kind) return;
    if (kind === 'nozzle') { nozzles.push(makeNozzle(o)); return; }
    const ax = o.userData.hinge_axis || [1, 0, 0];
    surfaces[o.name] = { o, kind, base: o.quaternion.clone(), axis: new THREE.Vector3(ax[0], ax[1], ax[2]).normalize(), angle: 0, target: 0 };
  });

  // Inner turbine / afterburner glow ring, parented to the nozzle (dilates with it).
  function makeNozzle(o) {
    let r = 0.5, zAft = 0.5;
    const box = new THREE.Box3().setFromObject(o, true);
    if (!box.isEmpty()) {
      const inv = new THREE.Matrix4().copy(o.matrixWorld).invert();
      const lb = box.clone().applyMatrix4(inv);
      r = Math.min(lb.max.x - lb.min.x, lb.max.y - lb.min.y) * 0.5;
      zAft = lb.max.z;
    }
    const mat = new THREE.MeshBasicMaterial({ color: 0xff9a3c, transparent: true, opacity: 0, blending: THREE.AdditiveBlending,
      depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
    const ring = new THREE.Mesh(new THREE.RingGeometry(r * 0.18, r * 0.62, 32), mat);
    ring.position.set(0, 0, zAft * 0.25);                   // recessed inside the exhaust can, facing aft
    ring.renderOrder = 6;
    o.add(ring);
    const core = new THREE.Mesh(new THREE.CircleGeometry(r * 0.2, 24), mat.clone());
    core.position.set(0, 0, zAft * 0.25 - 0.02);
    core.material.color.set(0xfff0c0);
    o.add(core);
    return { o, ring, core, radius: 1, baseScale: o.scale.clone() };
  }

  const _q = new THREE.Quaternion();
  const out = {};
  // c: { pitch, roll, yaw } normalised rate commands (-1..1, pitch +nose up,
  //      roll +left, yaw +nose left), kts, mach, alpha (rad), throttle,
  //      afterburner, airbrake (0..1), active (bool)
  function update(dt, c) {
    const k = Math.min(1, dt * 12);
    const rollRight = -c.roll;
    const stabPitch = -c.pitch * 20;                          // nose-up -> trailing edges up
    const lock = smooth(c.mach || 0, 0.95, 1.05);             // supersonic aileron lockout
    const diff = 9 + 11 * lock;                               // stabilator roll differential takes over
    const ramp = -11 * smooth(c.mach || 0, 0.7, 2.0);         // variable intake ramps
    const t = {
      Ctrl_Stabilator_L: clamp(stabPitch + rollRight * diff, -24, 24),
      Ctrl_Stabilator_R: clamp(stabPitch - rollRight * diff, -24, 24),
      Ctrl_Aileron_L: clamp(rollRight * 20 * (1 - lock), -20, 20),
      Ctrl_Aileron_R: clamp(-rollRight * 20 * (1 - lock), -20, 20),
      Intake_Ramp_L: ramp, Intake_Ramp_R: ramp,
      Ctrl_Rudder_L: clamp(-c.yaw * 22, -22, 22),
      Ctrl_Rudder_R: clamp(-c.yaw * 22, -22, 22),
      Ctrl_Speedbrake: -46 * clamp(c.airbrake, 0, 1)
    };
    // Auto flaps: droop at low speed / high AoA, flush at high speed.
    const droop = Math.max(smooth(-c.kts, -260, -170), smooth(c.alpha, 0.12, 0.24));
    t.Ctrl_Flap_L = t.Ctrl_Flap_R = 26 * droop;
    for (const name in surfaces) {
      const s = surfaces[name];
      s.target = c.active ? (t[name] ?? 0) : 0;
      s.angle += (s.target - s.angle) * k;
      s.o.quaternion.copy(s.base).multiply(_q.setFromAxisAngle(s.axis, s.angle * D2R));
      out[name] = s.angle;
    }
    // F100 convergent-divergent nozzles.
    const thr = clamp(c.throttle, 0, 1), ab = clamp(c.afterburner, 0, 1);
    const dry = 1.06 + (0.84 - 1.06) * smooth(thr, 0.15, 0.75);   // relaxed open at idle -> tight at MIL
    const target = c.active ? dry + (1.16 - dry) * ab : 1.06;
    const glow = c.active ? clamp(0.15 + 0.55 * thr + 0.9 * ab, 0, 1.4) : 0;
    for (const n of nozzles) {
      n.radius += (target - n.radius) * Math.min(1, dt * 6);
      n.o.scale.set(n.baseScale.x * n.radius, n.baseScale.y * n.radius, n.baseScale.z);
      n.ring.material.opacity = 0.55 * glow;
      n.ring.material.color.setRGB(1.0, 0.55 + 0.25 * ab, 0.18 + 0.3 * ab);
      n.core.material.opacity = 0.65 * glow * (0.4 + 0.6 * ab);
    }
    out.aileronLock = +lock.toFixed(2);
    out.nozzle = nozzles.length ? +nozzles[0].radius.toFixed(3) : null;
    out.glow = +glow.toFixed(2);
    return out;
  }

  return {
    update,
    get names() { return Object.keys(surfaces).concat(nozzles.map(n => n.o.name)); },
    get angles() { return out; }
  };
}
