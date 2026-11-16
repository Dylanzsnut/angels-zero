# ORBITAL PERIMETER

**First-Person 3D Mech Horde-Survival & Extraction Shooter**

**Play Live in Browser:** https://orbital-perimeter.pages.dev/

Drop into a sandstorm-choked desert perimeter inside an armored **Orbital Drop Exosuit**. Fight through subterranean arachnid swarms, liberate forward outposts, shatter hive nests with Hellbombs, and hold the extraction zone long enough to bank your scrap haul.

Built with **Three.js (WebGL)** and a **procedural Web Audio API sound engine**, with no external JS libraries, bundlers, or asset CDNs. The only remote request is an optional Google Fonts stylesheet for the HUD typeface; the game falls back to system fonts and remains fully playable offline.

---

## Key Features

### Tactical First-Person Mech Combat
- **Full Cockpit Immersion**: 360-degree mouse look, optical ADS fire-control bracing (`Right-Click`), two-beat hydraulic stride physics, independent torso/chassis waist twist, and reactive armor plating.
- **Thermal & Ballistic Mastery**: Manage `120mm Rotary` barrel heat with disciplined bursts or trigger an emergency coolant purge (`R`). Swap between the `120mm Autocannon` and `37mm Armor-Piercing Sidearm` with `1` / `2` or the mouse wheel, and swing the `Thermal Cleaver` with `V`, `Shift`, or `Mouse4`.
- **Mobility & Ordnance**: Execute invulnerability-frame **Thruster Dashes** (`Space`), lock and unleash **Shoulder Micro-Missile Salvos** (hold and release `Q`), and clear crowds with the 360-degree **Seismic Stomp** (`F`).

### Two Distinct Deployment Modes
- **Canyon Extraction**: Advance north across 5 hostile sectors (`3400 x 7600`). Clear Outposts via directional uplink sequences, breach crashed Salvage Pods, detonate Sub-Surface Hive Nests, and hold the **Extraction LZ** for **20 seconds** under siege to secure your haul.
- **Endless Frontier**: Roam an open desert frontier with repeatable tactical bounties and escalating waves. Push deeper for higher scrap yields, then deploy your **Evac Flare** (`X`) at any moment to call in extraction before the swarm overwhelms your chassis.

### Sensory Warfare & Desert Atmosphere
- **360-Degree Motion Tracker**: Real-time cockpit radar tracking terrain obstacles, hostile contacts, bosses, objectives, and salvage crates.
- **Active Thermal Sonar (`E`)**: Emit a terrain-penetrating scan pulse that cuts through dense sandstorm fog and illuminates buried and distant targets.
- **Visor IFF Telemetry**: Automatic target-lock brackets with predictive lead diamonds — expandable by liberating Outposts.
- **Dynamic Procedural Audio**: Synthesized multi-layered rotary cannon fire, hydraulic footsteps, interior cockpit resonance, desert thunder tails, and adaptive dark synth-industrial combat music.

### Hangar Meta-Progression
Successfully extracting banks your **Scrap Haul** into your permanent Hangar stash. Reinvest credits between deployments into:
- **Chassis & Reactor Upgrades**: Hull plating, reactive shield arrays, cryo heat sinks, thruster tuning, and sensor masts.
- **Weapon Builds & Tactical Mods**: Specialized 120mm barrels, 37mm magnum bores, superheated cleavers, and slotted combat chips.
- **Visual Customization**: Unlockable mech attachments, armor liveries, visor optics, and pilot callsigns.

---

## Arsenal & Weapon Evolutions

Level a Starter Weapon to **Level 5** alongside its **Paired Passive Module** to unlock its **Level 6 Evolved Form** at Refit Terminals or Boss Supply Crates:

| Starter Weapon | Class | Paired Passive | Evolved Form (Lv. 6) | Combat Effect |
| :--- | :--- | :--- | :--- | :--- |
| **20mm Autocannon** | Ballistic | High-Capacity Feed | **Depleted-Uranium Rotary** | Continuous high-velocity piercing stream of cyan tracer rounds |
| **Arc-Tesla Coil** | Arc | Overcharged Capacitor | **Storm-Grid Pylon** | 3D chain-lightning web arcing across up to 12 targets |
| **Thermite Vent** | Thermal | Coolant Injector | **Plasma Nova Core** | Pulsating molten aura with fog illumination and explosive knockback |
| **Orbital Rail-Strike** | Ordnance | Targeting Telemetry | **Hammer of Dawn Barrage** | Four towering orbital laser beams leaving lingering radiation zones |
| **Seeker Micro-Pods** | Ordnance | Propellant Thrusters | **Swarm-Breaker Salvo** | Fourteen homing cluster rockets tracking targets through the dust |

---

## Quick Launch (PC & Laptop)

Clone or download the repository, then launch locally using any of the options below.

### Windows
Double-click **`launch.bat`** in the project folder. It automatically starts the local server and opens the game in your default browser.

### macOS / Linux
Run **`./launch.sh`** from a terminal in the project folder:
```bash
chmod +x launch.sh
./launch.sh
```

### Manual Launch (Python 3)
```bash
python server.py
```
The server binds to `http://127.0.0.1:8090/` (or automatically selects the next available port if `8090` is busy) and opens your browser.

---

## Controls Reference

| Input | Action |
| :--- | :--- |
| **Click Viewport** | Lock cursor for 360-degree mouse look (`ESC` to release) |
| **W / A / S / D** (or Arrows) | Move Forward / Strafe / Reverse |
| **Left-Click (Hold)** | Fire active weapon — **STRIDER-LX: alternating pistols** |
| **Right-Click (Hold)** | Optical ADS / **STRIDER-LX: both pistols together** |
| **Mouse Wheel** | Swap `120mm Autocannon` / `37mm Sidearm` |
| **1 / 2** | Equip `120mm Autocannon` / `37mm Sidearm` |
| **V / Shift / Mouse4** | Knife melee slash |
| **R** | Manual Coolant Purge / Sidearm Reload |
| **Space** | Thruster Dash (with invulnerability frames) |
| **E** | Interact / Active Thermal Sonar Ping |
| **Q (Hold & Release)** | Lock and fire Shoulder Micro-Missile Salvo |
| **F** | Interact with Outposts & Terminals / Seismic Stomp |
| **B** | Open Refit Terminal (on HQ or liberated Outpost pad) |
| **C** | Toggle 1st-person cockpit / 3rd-person mech camera |
| **X** | Deploy Evac Flare (Endless Frontier mode) |
| **P / Esc** | Tactical Pause |
