# ORBITAL PERIMETER 3D 🛰️💥

A 60 FPS **First-Person 3D (Doom-Style) Exosuit Horde-Survival Roguelike** built with **Three.js (WebGL)** and **Web Audio API**, featuring zero external asset dependencies, dense exponential desert sandstorm fog, dynamic fog lighting, thermal sonar pings, and a rotating 360° cockpit motion tracker radar.

---

## 🎮 Game Concept & Atmosphere
You pilot an armored **Orbital Drop Exosuit** stranded in the middle of a foggy, sandstorm-swept desert perimeter littered with jagged rock pillars, rusted industrial containers, and crashed drop-pods. Visibility in the dust is strictly limited — rely on your **360° Cockpit Motion Tracker**, your **Active Thermal Sonar Ping (`E`)**, muzzle flashes, and rear proximity alerts to survive the relentless subterranean arachnid swarms until extraction at **15:00**.

---

## 🕹️ Controls (First-Person Exosuit)
- **Click Viewport**: Engage Pointer Lock (360° mouse look). Press `ESC` to release cursor.
- **W / A / S / D** (or Arrow Keys): Move Forward, Backward, and Strafe relative to your facing angle.
- **Left-Click (Hold)**: Fire primary `20mm Autocannon` / `Depleted-Uranium Rotary` straight along your center reticle.
- **TAB**: Toggle between **Manual FPS Aim [LMB]** and **Smart-Visor Auto-Fire** (secondary roguelike modules always auto-fire 360°).
- **SPACE / Right-Click**: **Thruster Dash** (high-speed burst with 0.25s invulnerability frames).
- **E**: **Active Thermal / Sonar Ping** — Sends a 3D scan wave across the desert that cuts fog and highlights all hidden insectoids in neon thermal red/orange for 4.0s (8s cooldown).
- **Q / F**: **Quick 180° Thruster Turn** — Rapidly whips your exosuit 180° around when rear proximity alarms trigger.
- **P**: Tactical Pause.

---

## 🔫 Weapons & Evolution Matrix

Max out a Starter Weapon to **Level 5** while carrying its **Paired Passive Module** to unlock its devastating **Level 6 Evolved Form** via Level-Up or Boss Supply Crates!

| Starter Weapon | Tag | Paired Passive Module | Evolved Weapon (Lv. 6) | Special Effect |
| :--- | :--- | :--- | :--- | :--- |
| **20mm Autocannon** | Ballistic | **High-Capacity Feed** (+Fire Rate) | **Depleted-Uranium Rotary** | Continuous hyper-speed piercing stream of cyan tracer rounds. |
| **Arc-Tesla Coil** | Arc | **Overcharged Capacitor** (+Area/Range) | **Storm-Grid Pylon** | 3D chain-lightning web arcing between up to 12 targets. |
| **Thermite Vent** | Thermal | **Coolant Injector** (-Cooldown) | **Plasma Nova Core** | Pulsating molten aura illuminating the fog + explosive knockback. |
| **Orbital Rail-Strike** | Ordnance | **Targeting Telemetry** (+Crit/Damage) | **Hammer of Dawn Barrage** | 4 towering orbital laser beams from the sky leaving lingering radiation. |
| **Seeker Micro-Pods** | Ordnance | **Propellant Thrusters** (+Speed) | **Swarm-Breaker Salvo** | 14 homing cluster rockets seeking targets through the sandstorm. |

---

## 📡 Sensory & Radar Systems
1. **360° Rotating Motion Tracker**: Centered on your exosuit with a `75°` forward FOV cone pointing UP. Obstacles (brown), Skitterers (red), Acid Spitters (green), Chargers (orange), Bosses (magenta), and Supply Chests (gold) all appear in real time.
2. **Dynamic Fog Lighting**: Weapon muzzle flashes, explosions, Tesla arcs, burning thermite pools, and orbital beams physically light up the surrounding sandstorm fog.
3. **Rear Proximity Alarm**: When bugs close within `24m` behind your blind spot, a cockpit alert flashes and beeps — tap `Q` for an instant 180° whip-turn.

---

## 🚀 How to Run & Deploy
Start the bundled local server (or any static web server):
```powershell
cd c:\Users\nguye\Downloads\orbital-perimeter
python server.py
```
Then visit `http://127.0.0.1:8090/`. All libraries (`three.min.js`) are bundled locally under `js/lib/` with zero external CDN runtime requirements.
