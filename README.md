# ORBITAL PERIMETER 3D

A 60 FPS **First-Person 3D Exosuit Horde-Survival & Extraction Shooter** built with **Three.js (WebGL)** and **Web Audio API**, featuring zero external CDN dependencies, desert sandstorm fog, dynamic lighting, thermal sonar pings, and a rotating 360-degree cockpit motion tracker radar.

---

## Quick Launch (PC / Laptop)

### Windows
Double-click **`launch.bat`** in the project folder. It automatically starts the local server and opens the game in your default browser.

### macOS / Linux
Run **`./launch.sh`** from a terminal in the project folder:
```bash
chmod +x launch.sh
./launch.sh
```

### Manual Launch
Start the bundled Python server (requires Python 3):
```bash
python server.py
```
If port `8090` is busy, `server.py` automatically selects the next available port and opens your browser.

---

## Controls (First-Person Exosuit)
- **Click Viewport**: Engage Pointer Lock (360-degree mouse look). Press `ESC` to release cursor.
- **W / A / S / D**: Move Forward, Backward, and Strafe.
- **Left-Click (Hold)**: Fire primary `120mm Autocannon` / `Depleted-Uranium Rotary`.
- **Right-Click**: Optical ADS zoom / fire-control bracing.
- **1 / 2 / 3**: Switch active weapon (`120mm Rotary`, `37mm Sidearm`, `Thermal Cleaver`).
- **R**: Manual Coolant Purge / Reload.
- **SPACE**: **Thruster Dash** (high-speed burst with invulnerability frames).
- **E**: **Active Thermal / Sonar Ping** — Highlights hidden insectoids through the sandstorm.
- **Q**: **Shoulder Micro-Missile Salvo**.
- **F**: **180-Degree Quick Turn** / **Interact** with Outposts, Supply Pods, and Extraction Terminals.
- **X**: **Deploy Evac Flare** (Endless Frontier mode — extract with your scrap haul at any time).
- **P**: Tactical Pause.

---

## Game Modes
- **Canyon Extraction**: Advance through 5 desert sectors, liberate Outposts, destroy Hive Nests, and hold the North Extraction LZ for 20s to bank your scrap haul.
- **Endless Frontier**: Open-field desert patrol with repeatable bounties, scaling swarms, and on-demand `[X]` Evac Flare extraction.

---

## Weapons & Evolution Matrix

Max out a Starter Weapon to **Level 5** while carrying its **Paired Passive Module** to unlock its **Level 6 Evolved Form** via Refit Terminals or Boss Supply Crates.

| Starter Weapon | Tag | Paired Passive Module | Evolved Weapon (Lv. 6) | Special Effect |
| :--- | :--- | :--- | :--- | :--- |
| **20mm Autocannon** | Ballistic | **High-Capacity Feed** (+Fire Rate) | **Depleted-Uranium Rotary** | Continuous hyper-speed piercing stream of cyan tracer rounds. |
| **Arc-Tesla Coil** | Arc | **Overcharged Capacitor** (+Area/Range) | **Storm-Grid Pylon** | 3D chain-lightning web arcing between up to 12 targets. |
| **Thermite Vent** | Thermal | **Coolant Injector** (-Cooldown) | **Plasma Nova Core** | Pulsating molten aura illuminating the fog + explosive knockback. |
| **Orbital Rail-Strike** | Ordnance | **Targeting Telemetry** (+Crit/Damage) | **Hammer of Dawn Barrage** | 4 towering orbital laser beams from the sky leaving lingering radiation. |
| **Seeker Micro-Pods** | Ordnance | **Propellant Thrusters** (+Speed) | **Swarm-Breaker Salvo** | 14 homing cluster rockets seeking targets through the sandstorm. |
