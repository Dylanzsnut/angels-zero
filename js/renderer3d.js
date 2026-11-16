// Three.js 2.5D Infinite Foggy Sand-Dune Desert Engine for ORBITAL PERIMETER

class Renderer3D {
    constructor(canvas) {
        this.canvas = canvas;
        this.SCALE = 0.1; // 10 2D simulation units = 1 3D meter

        // Ensure pixel art & procedural desert textures are generated
        if (window.PixelArt) {
            window.PixelArt.init();
        }

        // Core Three.js scene with high-contrast sunlit ochre/amber canyon storm haze
        this.scene = new THREE.Scene();
        this.baseFogColor = new THREE.Color(0x5c3a21);
        this.thermalFogColor = new THREE.Color(0x0c1622);
        this.baseFogDensity = 0.026;
        this.scene.background = this.baseFogColor.clone();
        this.scene.fog = new THREE.FogExp2(this.baseFogColor.getHex(), this.baseFogDensity);

        this.camera = new THREE.PerspectiveCamera(
            75,
            window.innerWidth / window.innerHeight,
            0.1,
            240
        );

        // Crisp retro pixel-edge WebGL output
        this.renderer = new THREE.WebGLRenderer({
            canvas: this.canvas,
            antialias: false,
            powerPreference: 'high-performance'
        });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
        if (THREE.ACESFilmicToneMapping !== undefined) {
            this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
            this.renderer.toneMappingExposure = 1.15;
        }

        // Streaming Desert Chunk State & Dynamic Obstacles
        this.CHUNK_SIZE = 60; // 60m x 60m streaming chunks
        this.activeChunks = new Map();
        this.lastChunkX = null;
        this.lastChunkZ = null;
        this.obstacles = [];
        this.obstacleGroup = new THREE.Group();
        this.scene.add(this.obstacleGroup);

        // Shared Geometries & Materials (reused across streamed chunks with zero leak)
        this.initSharedAssets();

        // Sky Dome, Sunlight, Rolling Infinite Dune Mesh & Blowing Sandstorm Dust
        this.initLighting();
        this.initSkyDome();
        this.initTerrain();
        this.initDust();
        this.buildCanyonCorridor3D();
        this.initBugGibsPool();

        // 3D First-Person Mech Arms attached to camera
        this.cockpitGroup = new THREE.Group();
        this.cockpitGroup.visible = false;
        this.camera.add(this.cockpitGroup);
        this.buildCockpitArms3D();
        this.loadCockpitGLB();
        this.thirdPersonMode = true;
        this.weaponSwitchBlend = 0;
        this.playerMechGroup = null;
        this.playerMechRig = null;
        this.buildPlayerMech3D();
        this.loadChassisGLB();

        // Muzzle PointLight attached to camera so firing flares warmly in the fog
        this.muzzleLight = new THREE.PointLight(0xffaa44, 0, 26, 1.4);
        this.muzzleLight.position.set(0.35, -0.2, -1.6);
        this.camera.add(this.muzzleLight);
        this.scene.add(this.camera);

        // Object-to-Mesh Maps / Pools
        this.enemyMeshes = new Map();
        this.projMeshes = new Map();
        this.dropMeshes = new Map();
        this.zoneMeshes = new Map();
        this.decalMeshes = new Map();
        this.missionGroup = new THREE.Group();
        this.scene.add(this.missionGroup);
        this.outpostMeshes = new Map();
        this.shellMeshes = new Map();
        this.hellbombMeshes = new Map();
        this.podMeshes = new Map();
        this.hazardMeshes = new Map();
        this.breachEffects = [];
        this.warzoneStreaks = [];
        this._warzoneTimer = 1.5;
        this.dropshipMesh = null;
        this.extractionPadGroup = null;
        this.hqGroup = null;

        // Dynamic FX groups
        this.orbitalBeamMeshes = [];
        this.orbitalMarkerMeshes = [];
        this.teslaLines = [];
        this.hitscanTracerLines = [];
        this.sonarRings = [];
        this.explosionSprites = [];

        // InstancedMesh for chunky pixel gibs & sparks (1 draw call)
        this.maxParticles = 600;
        this.particleDummy = new THREE.Object3D();
        this.particleColor = new THREE.Color();
        const pGeo = new THREE.OctahedronGeometry(0.18, 0);
        const pMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
        this.particleInstanced = new THREE.InstancedMesh(pGeo, pMat, this.maxParticles);
        this.particleInstanced.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.particleInstanced.setColorAt(0, new THREE.Color(0xffffff));
        this.particleInstanced.count = 0;
        this.particleInstanced.frustumCulled = false;
        this.scene.add(this.particleInstanced);

        // Dynamic Light Pool for explosions, beams, thermite, blind-fire impacts
        this.dynamicLights = [];
        for (let i = 0; i < 10; i++) {
            const light = new THREE.PointLight(0xff7722, 0, 32, 1.5);
            light.position.set(0, -50, 0);
            this.scene.add(light);
            this.dynamicLights.push({ light, life: 0, maxLife: 0.2 });
        }

        // 6-DOF Cockpit Suspension & Stride Cadence
        this.walkBobPhase = 0;
        this.stepJoltY = 0;
        this.stepRoll = 0;
        this.stepLegLeft = true;
        this.cockpitSwayX = 0;
        this.cockpitSwayY = 0;

        // Decoupled Conn-Pod Suspension Spring-Mass State (2D frame independent from 3D camera)
        this.cockpitOffsetX = 0;
        this.cockpitOffsetY = 0;
        this.cockpitRoll = 0;
        this.cockpitVelX = 0;
        this.cockpitVelY = 0;
        this.cockpitRollVel = 0;

        // Dynamic 3D Camera Spring-Damper Recoil
        this.recoilPitch = 0;
        this.recoilPitchVel = 0;
        this.recoilYaw = 0;
        this.recoilRoll = 0;
        this.recoilPunchZ = 0;
        this.recoilPunchZVel = 0;

        // Dynamic Sandstorm Weather Cycle & Wind
        this.stormTimer = 0;
        this.squallIntensity = 0;
        this.WIND_HEADING = -0.42;

        this.muzzleFlashTimer = 0;
        this.recoilOffset = 0;
        this.podPulseTimer = 0;
        this.thermalActive = false;
        this.crashSiteGroup = null;
        this.crashBeaconMesh = null;
        this.crashBeaconLight = null;
        this.hqGroup = null;
        this.crashObstacles = [];
        this.canyonObstacles = [];
        this.terrainSeed = 1337;
        this.randomizeTerrainSeed(1337);

        // 3D Physical Spent Brass Shell Casings & Muzzle Smoke Pools
        this.initShellCasings();
        this.initMuzzleSmoke();
        this.initTracerAssets();

        // Prime initial spawn desert sector (180m, 180m) & stranded drop-pod site
        this.resetScene();
    }

    initSharedAssets() {
        const pa = window.PixelArt;

        this.geometries = {
            bullet: new THREE.ConeGeometry(0.09, 0.9, 5),
            missile: new THREE.CylinderGeometry(0.09, 0.16, 0.95, 6),
            decalPlane: new THREE.PlaneGeometry(1, 1),
            zoneDisc: new THREE.CircleGeometry(1, 12),
            zoneRing: new THREE.RingGeometry(0.88, 1.0, 16),
            orbitalBeam: new THREE.CylinderGeometry(1, 1, 90, 8, 1, true),
            sonarRing: new THREE.RingGeometry(0.92, 1.0, 24),

            // Shared Desert Canyon Monument, Arch, Mesa & Crash-Site Geometries
            rockSpire: new THREE.CylinderGeometry(0.42, 0.95, 1.0, 5),
            canyonButtress: new THREE.CylinderGeometry(0.65, 1.15, 1.0, 6),
            mesaSlab: new THREE.CylinderGeometry(0.86, 1.08, 1.0, 6),
            archSpan: new THREE.CylinderGeometry(0.78, 0.92, 1.0, 6),
            podHull: new THREE.CylinderGeometry(0.95, 1.45, 4.2, 6),
            beaconLamp: new THREE.OctahedronGeometry(0.22, 0)
        };

        this.geometries.bullet.rotateX(Math.PI / 2);
        this.geometries.missile.rotateX(Math.PI / 2);

        this.geometries.decalPlane.rotateX(-Math.PI / 2);
        this.geometries.zoneDisc.rotateX(-Math.PI / 2);
        this.geometries.zoneRing.rotateX(-Math.PI / 2);
        this.geometries.sonarRing.rotateX(-Math.PI / 2);

        // Procedural 64x64 three-toed weathered mech footprint decal texture
        const fpCanvas = document.createElement('canvas');
        fpCanvas.width = 64;
        fpCanvas.height = 64;
        const fctx = fpCanvas.getContext('2d');
        fctx.clearRect(0, 0, 64, 64);
        // Three heavy articulated front toes pointing North (-Y / top) + rear heel pad
        fctx.fillStyle = 'rgba(18, 12, 8, 0.88)';
        // Left toe
        fctx.fillRect(10, 8, 10, 22);
        fctx.fillRect(12, 4, 6, 6);
        // Center toe
        fctx.fillRect(26, 4, 12, 26);
        fctx.fillRect(28, 1, 8, 5);
        // Right toe
        fctx.fillRect(44, 8, 10, 22);
        fctx.fillRect(46, 4, 6, 6);
        // Main midfoot & heel tread block
        fctx.fillRect(16, 30, 32, 16);
        fctx.fillRect(20, 46, 24, 12);
        // Darker compressed inner tread grooves
        fctx.fillStyle = 'rgba(8, 5, 3, 0.92)';
        fctx.fillRect(20, 34, 24, 4);
        fctx.fillRect(22, 42, 20, 4);
        fctx.fillRect(24, 50, 16, 4);
        this.footprintTexture = new THREE.CanvasTexture(fpCanvas);
        this.footprintTexture.magFilter = THREE.NearestFilter;
        this.footprintTexture.minFilter = THREE.NearestFilter;

        this.materials = {
            bullet: new THREE.MeshBasicMaterial({ color: 0xffdd55 }),
            bulletEvolved: new THREE.MeshBasicMaterial({ color: 0x00ffff }),
            missile: new THREE.MeshBasicMaterial({ color: 0x33ff88 }),

            decalFootprint: new THREE.MeshBasicMaterial({
                map: this.footprintTexture,
                transparent: true,
                opacity: 0.75,
                depthWrite: false
            }),

            decalRed: new THREE.MeshBasicMaterial({
                map: pa ? pa.textures.decalRed : null,
                alphaTest: 0.4,
                transparent: false,
                depthWrite: false
            }),
            decalGreen: new THREE.MeshBasicMaterial({
                map: pa ? pa.textures.decalGreen : null,
                alphaTest: 0.4,
                transparent: false,
                depthWrite: false
            }),
            decalPurple: new THREE.MeshBasicMaterial({
                map: pa ? pa.textures.decalPurple : null,
                alphaTest: 0.4,
                transparent: false,
                depthWrite: false
            }),
            decalScorch: new THREE.MeshBasicMaterial({
                map: pa ? pa.textures.decalScorch : null,
                alphaTest: 0.4,
                transparent: false,
                depthWrite: false
            }),

            // Flat-Shaded Stratified Canyon & Sunset-Lit Sandstone Rim Materials
            desertRock: new THREE.MeshLambertMaterial({
                map: pa ? pa.textures.desertRock : null,
                color: 0xffffff,
                flatShading: true
            }),
            desertRockRim: new THREE.MeshLambertMaterial({
                map: pa ? pa.textures.desertRock : null,
                color: 0xffcfa3,
                flatShading: true
            }),
            fossilShell: new THREE.MeshLambertMaterial({
                map: pa ? pa.textures.fossilShell : null,
                color: 0xffffff
            }),
            wreckMetal: new THREE.MeshLambertMaterial({
                color: 0x3f3c2d
            }),
            wreckWindshield: new THREE.MeshLambertMaterial({
                color: 0xc2b294
            }),
            wreckWheel: new THREE.MeshLambertMaterial({
                color: 0x24201b
            }),
            beaconGlow: new THREE.MeshBasicMaterial({
                color: 0xff3311
            })
        };
    }

    initLighting() {
        // High-contrast sunlit ochre sky hemisphere + dark canyon floor
        const hemi = new THREE.HemisphereLight(0x9c6b42, 0x24160c, 0.58);
        this.scene.add(hemi);

        // Warm directional sunlight shafts slicing across canyon walls & silhouettes
        const sun = new THREE.DirectionalLight(0xf0b26d, 0.96);
        sun.position.set(85, 65, -75);
        this.scene.add(sun);

        // Cool atmospheric rim/fill light for crisp 3D metallic & cliff silhouettes
        const rim = new THREE.DirectionalLight(0x6b8fb3, 0.42);
        rim.position.set(-70, 40, 85);
        this.scene.add(rim);

        // Subtle cockpit interior fill
        this.playerTorch = new THREE.PointLight(0xe09458, 0.25, 12, 1.5);
        this.playerTorch.position.set(0, 0.4, 0);
        this.camera.add(this.playerTorch);

        // High-contrast penetrating Exosuit Visor Headlamp cutting through sandstorm
        this.headlamp = new THREE.SpotLight(0xffecd0, 2.2, 54, Math.PI / 4.0, 0.45, 1.25);
        this.headlamp.position.set(0, 0.25, 0);
        this.headlampTarget = new THREE.Object3D();
        this.headlampTarget.position.set(0, -0.35, -22);
        this.camera.add(this.headlamp);
        this.camera.add(this.headlampTarget);
        this.headlamp.target = this.headlampTarget;
    }

    initSkyDome() {
        // High-definition 1024x512 equirectangular twilight canyon panorama (North -Z is u=0.75, x=768)
        const W = 1024;
        const H = 512;
        const skyCanvas = document.createElement('canvas');
        skyCanvas.width = W;
        skyCanvas.height = H;
        const ctx = skyCanvas.getContext('2d');

        // 1) Deep twilight indigo-umber zenith transitioning to blazing sunset amber horizon
        const grad = ctx.createLinearGradient(0, 0, 0, 260);
        grad.addColorStop(0.0, '#141218');
        grad.addColorStop(0.26, '#241a1c');
        grad.addColorStop(0.52, '#3b251e');
        grad.addColorStop(0.72, '#593624');
        grad.addColorStop(0.84, '#7d4b2b');
        grad.addColorStop(0.93, '#a66538');
        grad.addColorStop(0.985, '#c98249');
        grad.addColorStop(1.0, '#6e4a30');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, W, 260);

        ctx.fillStyle = '#6e4a30';
        ctx.fillRect(0, 260, W, H - 260);

        // 2) Crisp pixel starfield (~112 stars) + faint diagonal galactic dust band
        for (let i = 0; i < 112; i++) {
            const sx = Math.floor(this.chunkHash(i, 13, 81) * W);
            const sy = Math.floor(14 + this.chunkHash(i, 29, 81) * 165);
            const sz = (i % 7 === 0) ? 2 : 1;
            const alpha = (0.45 + this.chunkHash(i, 41, 81) * 0.5) * Math.max(0.1, 1 - sy / 185);
            ctx.fillStyle = (i % 5 === 0)
                ? `rgba(255, 224, 186, ${alpha.toFixed(2)})`
                : `rgba(205, 194, 178, ${alpha.toFixed(2)})`;
            ctx.fillRect(sx, sy, sz, sz);
        }
        for (let i = 0; i < 160; i++) {
            const bandX = (i / 160) * W;
            const jitterX = (this.chunkHash(i, 3, 97) - 0.5) * 70;
            const bandY = 72 + Math.sin((bandX / W) * Math.PI * 2 + 1.1) * 34 + (this.chunkHash(i, 7, 97) - 0.5) * 28;
            ctx.fillStyle = 'rgba(218, 178, 140, 0.13)';
            ctx.fillRect(Math.floor((bandX + jitterX + W) % W), Math.floor(bandY), 2, 2);
        }

        // 3) Blazing low-horizon sunset glow & diagonal crepuscular God-ray shafts (652, 246)
        const sunX = 652;
        const sunY = 246;
        const sunGrad = ctx.createRadialGradient(sunX, sunY, 8, sunX, sunY, 215);
        sunGrad.addColorStop(0.0, 'rgba(255, 244, 210, 0.94)');
        sunGrad.addColorStop(0.24, 'rgba(248, 182, 108, 0.68)');
        sunGrad.addColorStop(0.58, 'rgba(182, 106, 54, 0.28)');
        sunGrad.addColorStop(1.0, 'rgba(110, 74, 48, 0.0)');
        ctx.fillStyle = sunGrad;
        ctx.fillRect(0, 40, W, 230);

        const rays = [
            [-145, -165, 36, 'rgba(255, 212, 146, 0.09)'],
            [-75, -175, 28, 'rgba(255, 196, 118, 0.07)'],
            [42, -168, 44, 'rgba(255, 206, 134, 0.10)'],
            [128, -152, 52, 'rgba(242, 174, 98, 0.08)']
        ];
        for (const [dx, dy, spread, col] of rays) {
            ctx.fillStyle = col;
            ctx.beginPath();
            ctx.moveTo(sunX - 6, sunY + 4);
            ctx.lineTo(sunX + dx - spread, sunY + dy);
            ctx.lineTo(sunX + dx + spread, sunY + dy);
            ctx.lineTo(sunX + 6, sunY + 4);
            ctx.closePath();
            ctx.fill();
        }

        // 4) Stepped pixel-dusk atmospheric cloud streaks wrapping seamlessly
        for (let i = 0; i < 48; i++) {
            const cx = Math.floor(this.chunkHash(i, 3, 19) * W);
            const cy = Math.floor(42 + this.chunkHash(i, 7, 19) * 144);
            const cw = Math.floor(44 + this.chunkHash(i, 11, 19) * 130);
            const ch = Math.floor(4 + this.chunkHash(i, 13, 19) * 10);
            ctx.fillStyle = (i % 3 === 0)
                ? 'rgba(218, 144, 86, 0.16)'
                : (i % 2 === 0 ? 'rgba(38, 26, 22, 0.30)' : 'rgba(128, 82, 54, 0.18)');
            ctx.fillRect(cx, cy, cw, ch);
            if (cx + cw > W) ctx.fillRect(cx - W, cy, cw, ch);
        }

        // 5) Elegant Slender Twin Crescent Moons positioned inside upper-right canopy visor
        const drawPixelMoon = (mx, my, rad, shadowOx, shadowOy, salt) => {
            const halo = ctx.createRadialGradient(mx, my, rad * 0.5, mx, my, rad * 2.8);
            halo.addColorStop(0.0, 'rgba(245, 230, 205, 0.35)');
            halo.addColorStop(0.4, 'rgba(210, 160, 110, 0.14)');
            halo.addColorStop(1.0, 'rgba(110, 74, 48, 0.0)');
            ctx.fillStyle = halo;
            ctx.fillRect(mx - rad * 3, my - rad * 3, rad * 6, rad * 6);

            // Very faint, transparent earthshine for the unlit disk (never pitch black)
            ctx.fillStyle = 'rgba(38, 26, 20, 0.22)';
            ctx.beginPath();
            ctx.arc(mx, my, rad, 0, Math.PI * 2);
            ctx.fill();

            // Glowing crescent sliver facing the sunset
            for (let dy = -rad; dy <= rad; dy++) {
                for (let dx = -rad; dx <= rad; dx++) {
                    const distSq = dx * dx + dy * dy;
                    if (distSq <= rad * rad) {
                        const sx = dx - shadowOx;
                        const sy = dy - shadowOy;
                        const inShadow = (sx * sx + sy * sy) <= (rad * 0.88) * (rad * 0.88);
                        if (!inShadow) {
                            const edgeDist = Math.sqrt(distSq);
                            const rim = edgeDist > rad * 0.82;
                            ctx.fillStyle = rim ? '#fff2dc' : '#ebd5b6';
                            ctx.fillRect(mx + dx, my + dy, 1, 1);
                        }
                    }
                }
            }
        };
        drawPixelMoon(714, 214, 11, -3.5, -1.8, 301);
        drawPixelMoon(678, 204, 7, -2.4, -1.2, 409);

        // 6) Majestic Stratified Canyon Mountain Silhouettes around 360° horizon
        const getNorthNotchAttenuation = (x) => {
            const distFromNorth = Math.min(Math.abs(x - 768), W - Math.abs(x - 768));
            return 0.35 + 0.65 * Math.min(1, Math.pow(distFromNorth / 110, 1.4));
        };

        const drawMountainLayer = (baseY, pointsFn, fillCol, rimCol) => {
            const ys = [];
            for (let x = 0; x <= W; x += 2) {
                ys.push(pointsFn(x));
            }
            ctx.fillStyle = fillCol;
            ctx.beginPath();
            ctx.moveTo(0, 276);
            for (let i = 0; i < ys.length; i++) {
                ctx.lineTo(i * 2, ys[i]);
            }
            ctx.lineTo(W, 276);
            ctx.closePath();
            ctx.fill();

            if (rimCol) {
                ctx.strokeStyle = rimCol;
                ctx.lineWidth = 1.2;
                ctx.beginPath();
                ctx.moveTo(0, ys[0]);
                for (let i = 1; i < ys.length; i++) {
                    ctx.lineTo(i * 2, ys[i]);
                }
                ctx.stroke();
            }
        };

        // 5.5) Twin Alien Crescent Moons & Faint Orbital Perimeter Defense Ring
        const drawCrescentMoon = (mx, my, mr, baseCol, glowCol) => {
            ctx.save();
            const mg = ctx.createRadialGradient(mx, my, mr * 0.4, mx, my, mr * 2.2);
            mg.addColorStop(0, glowCol);
            mg.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = mg;
            ctx.beginPath();
            ctx.arc(mx, my, mr * 2.2, 0, Math.PI * 2);
            ctx.fill();

            ctx.beginPath();
            ctx.arc(mx, my, mr, 0, Math.PI * 2);
            ctx.clip();
            ctx.fillStyle = baseCol;
            ctx.fillRect(mx - mr, my - mr, mr * 2, mr * 2);
            // Atmospheric shadow crescent
            ctx.fillStyle = 'rgba(20, 12, 10, 0.78)';
            ctx.beginPath();
            ctx.arc(mx + mr * 0.42, my - mr * 0.16, mr * 0.94, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        };
        drawCrescentMoon(W * 0.66, 98, 22, 'rgba(240, 210, 170, 0.78)', 'rgba(240, 180, 120, 0.18)');
        drawCrescentMoon(W * 0.73, 124, 10, 'rgba(180, 225, 235, 0.62)', 'rgba(130, 210, 230, 0.14)');

        ctx.save();
        ctx.strokeStyle = 'rgba(230, 175, 130, 0.14)';
        ctx.lineWidth = 2.0;
        ctx.beginPath();
        ctx.ellipse(W * 0.52, 230, W * 0.46, 135, -0.18, Math.PI * 1.08, Math.PI * 1.92);
        ctx.stroke();
        ctx.restore();

        // Layer 1: Distant hazy mesa plateaus & spires
        drawMountainLayer(238, (x) => {
            const a = (x / W) * Math.PI * 2;
            const mesa = Math.sin(a * 4 + 0.8) * 14 + Math.cos(a * 9 - 1.2) * 8;
            const h = Math.max(0, mesa) * (0.5 + 0.5 * getNorthNotchAttenuation(x));
            return 238 - h;
        }, '#352118', null);

        // Layer 2: Mid-distance sandstone canyon walls with sunset rim light
        drawMountainLayer(250, (x) => {
            const a = (x / W) * Math.PI * 2;
            const crag = Math.sin(a * 5 + 0.2) * 16 + Math.abs(Math.cos(a * 11 + 1.4)) * 12;
            const notch = getNorthNotchAttenuation(x);
            return 250 - Math.max(2, crag * notch);
        }, '#26160f', 'rgba(215, 140, 82, 0.7)');

        // Layer 3: Foreground canyon buttress silhouettes framing the horizon
        drawMountainLayer(264, (x) => {
            const a = (x / W) * Math.PI * 2;
            const rampart = Math.abs(Math.sin(a * 3 + 1.1)) * 18 + Math.cos(a * 7 - 0.5) * 8;
            const notch = getNorthNotchAttenuation(x);
            return 264 - Math.max(1, rampart * Math.pow(notch, 1.4));
        }, '#1b0e09', 'rgba(175, 108, 64, 0.5)');

        // 7) Seamless horizon mist transition into baseFogColor (#6e4a30)
        const mistGrad = ctx.createLinearGradient(0, 246, 0, 276);
        mistGrad.addColorStop(0.0, 'rgba(110, 74, 48, 0.0)');
        mistGrad.addColorStop(0.55, 'rgba(110, 74, 48, 0.62)');
        mistGrad.addColorStop(1.0, 'rgba(110, 74, 48, 1.0)');
        ctx.fillStyle = mistGrad;
        ctx.fillRect(0, 246, W, 30);

        const skyTex = new THREE.CanvasTexture(skyCanvas);
        skyTex.wrapS = THREE.RepeatWrapping;
        skyTex.magFilter = THREE.LinearFilter;
        skyTex.minFilter = THREE.LinearFilter;
        skyTex.needsUpdate = true;

        const skyGeo = new THREE.SphereGeometry(195, 40, 24);
        const skyMat = new THREE.MeshBasicMaterial({
            map: skyTex,
            side: THREE.BackSide,
            fog: false,
            depthWrite: false
        });
        this.skyDome = new THREE.Mesh(skyGeo, skyMat);
        this.skyDome.renderOrder = -10;
        this.skyDome.frustumCulled = false;
        this.scene.add(this.skyDome);
    }

    // Deterministic asymmetric barchan dune ridges, meandering dry wadi channels & rocky benches
    randomizeTerrainSeed(seed) {
        const cfgCanyon = window.GAME_CONFIG && window.GAME_CONFIG.CANYON;
        if (cfgCanyon && cfgCanyon.randomizeSeed) {
            this.terrainSeed = cfgCanyon.randomizeSeed(seed);
        } else {
            this.terrainSeed = (seed !== undefined && seed !== null)
                ? (Math.floor(seed) || 1337)
                : (Math.floor(Math.random() * 899999) + 100000);
        }
        const s = this.terrainSeed;
        const h = (salt) => {
            const v = Math.sin(s * 0.0137 + salt * 78.233) * 43758.5453;
            return v - Math.floor(v);
        };
        this.terrainParams = {
            f1x: 0.028 + h(1) * 0.016,
            f1z: 0.014 + h(2) * 0.012,
            p1: h(3) * Math.PI * 2,
            amp1: 1.75 + h(4) * 0.95,
            f2x: 0.016 + h(5) * 0.014,
            f2z: 0.028 + h(6) * 0.018,
            p2: h(7) * Math.PI * 2,
            amp2: 1.15 + h(8) * 0.75,
            wadiFreqX: 0.029 + h(9) * 0.016,
            wadiFreqZ: 0.018 + h(10) * 0.012,
            wadiPhase: h(11) * Math.PI * 2,
            benchScale: 1.25 + h(12) * 0.85
        };
        return this.terrainSeed;
    }

    getTerrainHeight(wx, wz) {
        const tp = this.terrainParams || {
            f1x: 0.036, f1z: 0.019, p1: 0, amp1: 2.15,
            f2x: 0.021, f2z: 0.038, p2: 0, amp2: 1.45,
            wadiFreqX: 0.038, wadiFreqZ: 0.024, wadiPhase: 0, benchScale: 1.65
        };
        const phase1 = wx * tp.f1x + wz * tp.f1z + tp.p1 + Math.sin(wz * 0.014 + tp.p2) * 1.1;
        const raw1 = Math.sin(phase1);
        const dune1 = (raw1 > 0 ? Math.pow(raw1, 0.75) : -Math.pow(-raw1, 1.35)) * tp.amp1;

        const phase2 = wx * tp.f2x - wz * tp.f2z + tp.p2 + Math.cos(wx * 0.015 + tp.p1) * 1.2;
        const dune2 = Math.cos(phase2) * tp.amp2;

        const ripple = Math.sin(wx * 0.085 + wz * 0.072 + tp.p1) * 0.35;

        const cfgCanyon = window.GAME_CONFIG && window.GAME_CONFIG.CANYON;
        const hqWx = ((cfgCanyon && cfgCanyon.START_X) || 1700) * this.SCALE;
        const hqWz = ((cfgCanyon && cfgCanyon.START_Y) || 7050) * this.SCALE;

        // Winding canyon wadi wash corridors anchored nicely through HQ launch valley
        const wadiWave = Math.sin((wx - hqWx) * tp.wadiFreqX + tp.wadiPhase + Math.sin((wz - hqWz) * tp.wadiFreqZ) * 1.15);
        const inWash = Math.max(0, 1.0 - Math.abs(wadiWave) * 1.55);

        // Stepped rocky canyon benches bordering the washes
        const benchRaw = Math.max(0, Math.abs(wadiWave) - 0.52) / 0.48;
        const terraceStep = Math.floor(benchRaw * 3.0) * 0.35 + benchRaw * tp.benchScale;

        let hVal = (dune1 + dune2 + ripple) * (1.0 - inWash * 0.58) - inWash * 0.85 + terraceStep;

        // Smoothly flatten immediate HQ launch pad so dropship & gantry sit level
        const dHq = Math.hypot(wx - hqWx, wz - hqWz);
        if (dHq < 22) {
            const blend = Math.max(0, Math.min(1, (dHq - 8) / 14));
            hVal *= blend * blend * (3 - 2 * blend);
        }
        return hVal;
    }

    initTerrain() {
        this.terrainSize = 280;
        this.terrainSegs = 112;
        this.terrainStep = this.terrainSize / this.terrainSegs; // 2.5m vertex spacing
        this.lastTerrainSnapX = null;
        this.lastTerrainSnapZ = null;

        this.terrainGeo = new THREE.PlaneGeometry(
            this.terrainSize,
            this.terrainSize,
            this.terrainSegs,
            this.terrainSegs
        );
        this.terrainGeo.rotateX(-Math.PI / 2);

        const count = this.terrainGeo.attributes.position.count;
        const colors = new Float32Array(count * 3);
        this.terrainGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

        const sandTex = window.PixelArt && window.PixelArt.textures.desertSand;
        const terrainMat = new THREE.MeshLambertMaterial({
            map: sandTex || null,
            color: 0xffffff,
            vertexColors: true
        });

        this.terrainMesh = new THREE.Mesh(this.terrainGeo, terrainMat);
        this.terrainMesh.frustumCulled = false;
        this.scene.add(this.terrainMesh);
    }

    updateInfiniteTerrain(pWx, pWz) {
        const step = this.terrainStep;
        const snapX = Math.round(pWx / step) * step;
        const snapZ = Math.round(pWz / step) * step;

        if (snapX === this.lastTerrainSnapX && snapZ === this.lastTerrainSnapZ) return;
        this.lastTerrainSnapX = snapX;
        this.lastTerrainSnapZ = snapZ;

        this.terrainMesh.position.set(snapX, 0, snapZ);

        const pos = this.terrainGeo.attributes.position;
        const uv = this.terrainGeo.attributes.uv;
        const col = this.terrainGeo.attributes.color;
        const count = pos.count;

        for (let i = 0; i < count; i++) {
            const wx = snapX + pos.getX(i);
            const wz = snapZ + pos.getZ(i);
            const h = this.getTerrainHeight(wx, wz);
            pos.setY(i, h);
            uv.setXY(i, wx * 0.16, wz * 0.16);

            // Height & wind-slope biome tint: dark umber wadis -> warm sienna -> sunlit gold dune crests
            const t = Math.max(0, Math.min(1, (h + 1.8) / 5.8));
            let r, g, b;
            if (t < 0.35) {
                const k = t / 0.35;
                r = 0.68 + (0.95 - 0.68) * k;
                g = 0.56 + (0.85 - 0.56) * k;
                b = 0.48 + (0.76 - 0.48) * k;
            } else {
                const k = (t - 0.35) / 0.65;
                r = 0.95 + (1.18 - 0.95) * k;
                g = 0.85 + (1.04 - 0.85) * k;
                b = 0.76 + (0.88 - 0.76) * k;
            }
            col.setXYZ(i, r, g, b);
        }

        pos.needsUpdate = true;
        uv.needsUpdate = true;
        col.needsUpdate = true;
        this.terrainGeo.computeVertexNormals();
    }

    initDust() {
        // Layer 1: High-speed directional storm gale particles (1400 grains)
        this.dustCount = 1400;
        this.dustPosArray = new Float32Array(this.dustCount * 3);
        for (let i = 0; i < this.dustCount; i++) {
            this.dustPosArray[i * 3] = (Math.random() - 0.5) * 80;
            this.dustPosArray[i * 3 + 1] = 0.2 + Math.random() * 8.5;
            this.dustPosArray[i * 3 + 2] = (Math.random() - 0.5) * 80;
        }
        const dustGeo = new THREE.BufferGeometry();
        dustGeo.setAttribute('position', new THREE.BufferAttribute(this.dustPosArray, 3));
        const dustMat = new THREE.PointsMaterial({
            color: 0x9c7a56,
            size: 0.22,
            sizeAttenuation: true,
            transparent: true,
            opacity: 0.82
        });
        this.dustPoints = new THREE.Points(dustGeo, dustMat);
        this.scene.add(this.dustPoints);

        // Layer 2: High drifting ash motes & embers
        const emberCount = 220;
        const emberPos = new Float32Array(emberCount * 3);
        for (let i = 0; i < emberCount; i++) {
            emberPos[i * 3] = (Math.random() - 0.5) * 85;
            emberPos[i * 3 + 1] = 1.0 + Math.random() * 14.0;
            emberPos[i * 3 + 2] = (Math.random() - 0.5) * 85;
        }
        const emberGeo = new THREE.BufferGeometry();
        emberGeo.setAttribute('position', new THREE.BufferAttribute(emberPos, 3));
        const emberMat = new THREE.PointsMaterial({
            color: 0xff8833,
            size: 0.25,
            sizeAttenuation: true,
            transparent: true,
            opacity: 0.65
        });
        this.emberPoints = new THREE.Points(emberGeo, emberMat);
        this.scene.add(this.emberPoints);
    }

    // 3D Spent Brass Shell Casing Physics Pool
    initShellCasings() {
        this.shellCasingPool = [];
        this.maxCasings = 40;
        const casingGeo = new THREE.CylinderGeometry(0.038, 0.038, 0.16, 6);
        casingGeo.rotateZ(Math.PI / 2);
        const casingMat = new THREE.MeshStandardMaterial({
            color: 0xcc9933,
            metalness: 0.85,
            roughness: 0.25
        });

        for (let i = 0; i < this.maxCasings; i++) {
            const mesh = new THREE.Mesh(casingGeo, casingMat);
            mesh.visible = false;
            this.scene.add(mesh);
            this.shellCasingPool.push({
                mesh,
                active: false,
                x: 0, y: 0, z: 0,
                vx: 0, vy: 0, vz: 0,
                rotVelX: 0, rotVelY: 0, rotVelZ: 0,
                life: 0,
                bounces: 0
            });
        }
    }

    spawnShellCasing(player, facingAngle, pitch, casingType) {
        let casing = this.shellCasingPool.find(c => !c.active);
        if (!casing) {
            casing = this.shellCasingPool[0];
        }

        const pWx = player.x * this.SCALE;
        const pWz = player.y * this.SCALE;
        const eyeY = this.getTerrainHeight(pWx, pWz) + 1.85;

        const rightX = -Math.sin(facingAngle);
        const rightZ = Math.cos(facingAngle);
        const fwdX = Math.cos(facingAngle);
        const fwdZ = Math.sin(facingAngle);

        casing.x = pWx + rightX * 0.45 + fwdX * 0.25;
        casing.y = eyeY - 0.35;
        casing.z = pWz + rightZ * 0.45 + fwdZ * 0.25;

        // Violent ejection to the right with vertical loft and slight rearward drag
        casing.vx = rightX * (3.5 + Math.random() * 0.8) - fwdX * 0.6;
        casing.vy = 2.4 + Math.random() * 0.8;
        casing.vz = rightZ * (3.5 + Math.random() * 0.8) - fwdZ * 0.6;

        casing.rotVelX = (Math.random() - 0.5) * 35;
        casing.rotVelY = (Math.random() - 0.5) * 35;
        casing.rotVelZ = (Math.random() - 0.5) * 35;

        casing.life = 3.2;
        casing.bounces = 0;
        casing.active = true;
        casing.mesh.visible = true;
        casing.mesh.position.set(casing.x, casing.y, casing.z);
    }

    updateShellCasings(dt) {
        const gravity = 18.0;
        for (let i = 0; i < this.shellCasingPool.length; i++) {
            const c = this.shellCasingPool[i];
            if (!c.active) continue;
            c.life -= dt;
            if (c.life <= 0) {
                c.active = false;
                c.mesh.visible = false;
                continue;
            }

            c.vy -= gravity * dt;
            c.x += c.vx * dt;
            c.y += c.vy * dt;
            c.z += c.vz * dt;

            c.mesh.rotation.x += c.rotVelX * dt;
            c.mesh.rotation.y += c.rotVelY * dt;
            c.mesh.rotation.z += c.rotVelZ * dt;

            const groundY = this.getTerrainHeight(c.x, c.z) + 0.05;
            if (c.y <= groundY) {
                c.y = groundY;
                if (c.bounces < 3 && Math.abs(c.vy) > 0.8) {
                    c.vy = -c.vy * 0.36; // restitution bounce
                    c.vx *= 0.65;
                    c.vz *= 0.65;
                    c.bounces++;
                    if (window.soundManager && window.soundManager.playCasingImpact && c.bounces === 1) {
                        window.soundManager.playCasingImpact();
                    }
                } else {
                    c.vy = 0;
                    c.vx *= 0.1;
                    c.vz *= 0.1;
                    c.rotVelX = 0;
                    c.rotVelY = 0;
                    c.rotVelZ = 0;
                }
            }

            c.mesh.position.set(c.x, c.y, c.z);
        }
    }

    triggerMuzzleLight3D(hexColor = 0xffaa44, intensity = 4.5) {
        if (!this.muzzleLight) return;
        this.muzzleLight.color.setHex(hexColor);
        this.muzzleLight.intensity = intensity;
    }

    initBugGibsPool() {
        this.bugGibsPool = [];
        const gibGeo = new THREE.OctahedronGeometry(0.18, 0);
        for (let i = 0; i < 48; i++) {
            const mat = new THREE.MeshLambertMaterial({ color: 0x66aa44, flatShading: true });
            const mesh = new THREE.Mesh(gibGeo, mat);
            mesh.visible = false;
            this.scene.add(mesh);
            this.bugGibsPool.push({
                active: false, mesh,
                x: 0, y: 0, z: 0,
                vx: 0, vy: 0, vz: 0,
                rx: 0, ry: 0, rz: 0,
                life: 0, bounces: 0
            });
        }
    }

    spawnBugGibs3D(wx2d, wy2d, colorHex = '#66aa44', radius = 16) {
        if (!this.bugGibsPool) return;
        const wx = wx2d * this.SCALE;
        const wz = wy2d * this.SCALE;
        const baseY = this.getTerrainHeight(wx, wz) + 0.6;
        const count = Math.min(6, Math.max(3, Math.round(radius / 5)));
        let spawned = 0;
        for (let i = 0; i < this.bugGibsPool.length && spawned < count; i++) {
            const g = this.bugGibsPool[i];
            if (g.active) continue;
            g.active = true;
            g.life = 2.6 + Math.random() * 1.0;
            g.bounces = 0;
            g.x = wx + (Math.random() - 0.5) * 0.6;
            g.y = baseY + Math.random() * 0.5;
            g.z = wz + (Math.random() - 0.5) * 0.6;
            const ang = Math.random() * Math.PI * 2;
            const spd = 2.8 + Math.random() * 4.5;
            g.vx = Math.cos(ang) * spd;
            g.vz = Math.sin(ang) * spd;
            g.vy = 4.0 + Math.random() * 4.5;
            g.rx = (Math.random() - 0.5) * 18;
            g.ry = (Math.random() - 0.5) * 18;
            g.rz = (Math.random() - 0.5) * 18;
            g.mesh.material.color.set(colorHex);
            const s = 0.7 + Math.random() * 0.85;
            g.mesh.scale.set(s, s * 0.8, s * 1.2);
            g.mesh.position.set(g.x, g.y, g.z);
            g.mesh.visible = true;
            spawned++;
        }
    }

    updateBugGibs(dt) {
        if (!this.bugGibsPool) return;
        const gravity = 20.0;
        for (let i = 0; i < this.bugGibsPool.length; i++) {
            const g = this.bugGibsPool[i];
            if (!g.active) continue;
            g.life -= dt;
            if (g.life <= 0) {
                g.active = false;
                g.mesh.visible = false;
                continue;
            }
            g.vy -= gravity * dt;
            g.x += g.vx * dt;
            g.y += g.vy * dt;
            g.z += g.vz * dt;
            g.mesh.rotation.x += g.rx * dt;
            g.mesh.rotation.y += g.ry * dt;
            g.mesh.rotation.z += g.rz * dt;
            const groundY = this.getTerrainHeight(g.x, g.z) + 0.1;
            if (g.y <= groundY) {
                g.y = groundY;
                if (g.bounces < 2 && Math.abs(g.vy) > 1.2) {
                    g.vy = -g.vy * 0.38;
                    g.vx *= 0.6;
                    g.vz *= 0.6;
                    g.bounces++;
                } else {
                    g.vy = 0;
                    g.vx *= 0.7;
                    g.vz *= 0.7;
                    g.rx = g.ry = g.rz = 0;
                }
            }
            g.mesh.position.set(g.x, g.y, g.z);
        }
    }

    buildCanyonCorridor3D() {
        const canyon = (typeof window !== 'undefined' && window.GAME_CONFIG && window.GAME_CONFIG.CANYON) || null;
        if (!canyon || !canyon.getBoundsAtY) return;
        if (this.canyonGroup) {
            this.scene.remove(this.canyonGroup);
        }
        this.canyonGroup = new THREE.Group();
        this.canyonObstacles = [];
        if (typeof window !== 'undefined' && window.gameInstance && window.gameInstance.currentMode === 'endless') {
            this.scene.add(this.canyonGroup);
            return;
        }
        const worldH = (window.GAME_CONFIG && window.GAME_CONFIG.WORLD_HEIGHT) || 7600;

        const makeTex = (w, h, drawFn, rx = 1, ry = 1) => {
            const c = document.createElement('canvas');
            c.width = w; c.height = h;
            const ctx = c.getContext('2d');
            ctx.imageSmoothingEnabled = false;
            drawFn(ctx, w, h);
            const t = new THREE.CanvasTexture(c);
            t.magFilter = THREE.NearestFilter;
            t.minFilter = THREE.NearestFilter;
            t.wrapS = THREE.RepeatWrapping;
            t.wrapT = THREE.RepeatWrapping;
            t.repeat.set(rx, ry);
            t.needsUpdate = true;
            return t;
        };

        // 1) Stratified Sandstone Cliff Texture (warm ochre strata + dark cracks)
        const texCliff = makeTex(64, 64, (ctx, w, h) => {
            const bands = ['#7e4d2b', '#6c3f22', '#8c5832', '#5b331b', '#744626', '#945f38'];
            for (let y = 0; y < h; y += 4) {
                ctx.fillStyle = bands[(y >> 2) % bands.length];
                ctx.fillRect(0, y, w, 4);
                ctx.fillStyle = 'rgba(20, 10, 4, 0.28)';
                ctx.fillRect(0, y + 3, w, 1);
            }
            for (let i = 0; i < 42; i++) {
                const x = (i * 19) % w;
                const y = (i * 11) % h;
                ctx.fillStyle = (i % 3 === 0) ? '#3c2010' : '#a87044';
                ctx.fillRect(x, y, 2, 6 + (i % 5));
            }
        }, 2, 3);

        // 2) Alien Frontier Convoy Trail Texture (compacted red regolith + dual crawler tread ruts + steel grate ribs)
        const texRoad = makeTex(64, 64, (ctx, w, h) => {
            ctx.fillStyle = '#5e351e';
            ctx.fillRect(0, 0, w, h);
            // Sand-blown organic dust & gravel scatter
            for (let i = 0; i < 110; i++) {
                ctx.fillStyle = (i % 3 === 0) ? '#462514' : (i % 3 === 1 ? '#784427' : '#3a2216');
                ctx.fillRect((i * 17) % w, (i * 29) % h, 2, 2);
            }
            // Twin darkened heavy mech / crawler tread ruts
            ctx.fillStyle = '#3d2215';
            ctx.fillRect(10, 0, 12, h);
            ctx.fillRect(w - 22, 0, 12, h);
            // Embedded weathered steel Marston-mat / grate traction plates
            ctx.fillStyle = '#474a4f';
            ctx.fillRect(12, 4, 8, 2);
            ctx.fillRect(12, 20, 8, 2);
            ctx.fillRect(12, 36, 8, 2);
            ctx.fillRect(12, 52, 8, 2);
            ctx.fillRect(w - 20, 12, 8, 2);
            ctx.fillRect(w - 20, 28, 8, 2);
            ctx.fillRect(w - 20, 44, 8, 2);
            ctx.fillRect(w - 20, 60, 8, 2);
            // Soft Martian dust blend on outer edges
            ctx.fillStyle = '#734124';
            ctx.fillRect(0, 0, 5, h);
            ctx.fillRect(w - 5, 0, 5, h);
        }, 1, 2);

        // 3) Weathered Concrete & Wrecked Tank Armor Textures
        const texConcrete = makeTex(32, 32, (ctx, w, h) => {
            ctx.fillStyle = '#585b60';
            ctx.fillRect(0, 0, w, h);
            ctx.fillStyle = '#3c3f44';
            ctx.fillRect(0, 0, w, 1);
            ctx.fillRect(0, h / 2, w, 1);
            ctx.fillStyle = '#73777d';
            ctx.fillRect(1, 1, w - 2, 1);
            for (let i = 0; i < 24; i++) {
                ctx.fillStyle = (i % 2 === 0) ? '#44474d' : '#6c7078';
                ctx.fillRect((i * 7) % w, (i * 13) % h, 1, 2);
            }
        });

        const texTank = makeTex(32, 32, (ctx, w, h) => {
            ctx.fillStyle = '#3b4231';
            ctx.fillRect(0, 0, w, h);
            ctx.fillStyle = '#23281d';
            ctx.strokeRect(0.5, 0.5, w - 1, h - 1);
            ctx.fillStyle = '#535c45';
            ctx.fillRect(2, 2, w - 4, 2);
            // Scorch / rust streaks
            ctx.fillStyle = '#6e3a1e';
            ctx.fillRect(6, 10, 8, 12);
        });

        const texHazardBar = makeTex(32, 16, (ctx, w, h) => {
            ctx.fillStyle = '#60646b';
            ctx.fillRect(0, 0, w, h);
            ctx.fillStyle = '#c89228';
            ctx.fillRect(0, h - 5, w, 5);
            ctx.fillStyle = '#181818';
            for (let x = 0; x < w; x += 8) {
                ctx.fillRect(x, h - 5, 4, 5);
            }
        });

        const wallMat = new THREE.MeshLambertMaterial({ map: texCliff, flatShading: true });
        const talusMat = new THREE.MeshLambertMaterial({ map: texCliff, color: 0xd9a87e, flatShading: true });
        const mesaCapMat = new THREE.MeshLambertMaterial({ map: texCliff, color: 0x8f6b54, flatShading: true });
        const roadMat = new THREE.MeshLambertMaterial({ map: texRoad, flatShading: true });
        const pillarMat = new THREE.MeshLambertMaterial({ map: texConcrete, flatShading: true });
        const tankMat = new THREE.MeshLambertMaterial({ map: texTank, flatShading: true });
        const steelMat = new THREE.MeshLambertMaterial({ color: 0x32363d, flatShading: true });
        const barrierMat = new THREE.MeshLambertMaterial({ map: texHazardBar, flatShading: true });
        const amberGlowMat = new THREE.MeshBasicMaterial({ color: 0xffaa33 });
        const emberGlowMat = new THREE.MeshBasicMaterial({ color: 0xff4411 });

        const boxGeo = new THREE.BoxGeometry(1, 1, 1);

        // Helper: sample minimum terrain height across a prop's footprint so nothing ever floats
        const sampleMinGround = (px, pz, rad = 2.0) => {
            return Math.min(
                this.getTerrainHeight(px, pz),
                this.getTerrainHeight(px - rad, pz - rad),
                this.getTerrainHeight(px + rad, pz - rad),
                this.getTerrainHeight(px - rad, pz + rad),
                this.getTerrainHeight(px + rad, pz + rad)
            );
        };

        // A) Continuous Skirted Terrain-Hugging Convoy Trail (100% grounded, 5-across cross-section with buried shoulders)
        const roadPositions = [];
        const roadUvs = [];
        const roadIndices = [];
        const roadHalfW = 8.4;
        const skirtOutW = 10.4;
        let vIdx = 0;
        const roadEndY = worldH - 180;
        for (let y = 320; y <= roadEndY; y += 12) {
            const b = canyon.getBoundsAtY(y);
            const wz = y * this.SCALE;
            const cx = b.centerX * this.SCALE;
            const bNext = canyon.getBoundsAtY(y + 12);
            const dx = (bNext.centerX - b.centerX) * this.SCALE;
            const dz = 12 * this.SCALE;
            const len = Math.max(0.01, Math.hypot(dx, dz));
            // Perpendicular right vector to trail tangent
            const rx = dz / len;
            const rz = -dx / len;

            const slx = cx - rx * skirtOutW, slz = wz - rz * skirtOutW;
            const lx  = cx - rx * roadHalfW, lz  = wz - rz * roadHalfW;
            const rrx = cx + rx * roadHalfW, rrz = wz + rz * roadHalfW;
            const srx = cx + rx * skirtOutW, srz = wz + rz * skirtOutW;

            const sly = this.getTerrainHeight(slx, slz) - 0.75;
            const ly  = this.getTerrainHeight(lx, lz) + 0.08;
            const cy  = this.getTerrainHeight(cx, wz) + 0.10;
            const ry  = this.getTerrainHeight(rrx, rrz) + 0.08;
            const sry = this.getTerrainHeight(srx, srz) - 0.75;

            roadPositions.push(
                slx, sly, slz,
                lx,  ly,  lz,
                cx,  cy,  wz,
                rrx, ry,  rrz,
                srx, sry, srz
            );
            const vCoord = (y - 320) * 0.015;
            roadUvs.push(
                0.0, vCoord,
                0.08, vCoord,
                0.5, vCoord,
                0.92, vCoord,
                1.0, vCoord
            );

            if (vIdx > 0) {
                const prev = (vIdx - 1) * 5;
                const curr = vIdx * 5;
                for (let s = 0; s < 4; s++) {
                    const i0 = prev + s;
                    const i1 = i0 + 1;
                    const i2 = curr + s;
                    const i3 = i2 + 1;
                    roadIndices.push(i0, i2, i1, i1, i2, i3);
                }
            }
            vIdx++;
        }
        const roadGeo = new THREE.BufferGeometry();
        roadGeo.setAttribute('position', new THREE.Float32BufferAttribute(roadPositions, 3));
        roadGeo.setAttribute('uv', new THREE.Float32BufferAttribute(roadUvs, 2));
        roadGeo.setIndex(roadIndices);
        roadGeo.computeVertexNormals();
        const roadMesh = new THREE.Mesh(roadGeo, roadMat);
        this.canyonGroup.add(roadMesh);

        // B) 3-Tier Stepped Stratified Sandstone Cliffs + Grounded Roadside Barriers & Poles
        const cliffEndY = worldH - 120;
        for (let y = 200; y <= cliffEndY; y += 100) {
            const b = canyon.getBoundsAtY(y);
            const wz = y * this.SCALE;
            const cx = b.centerX * this.SCALE;

            for (const side of [-1, 1]) {
                const edgeX = (side < 0 ? b.minX : b.maxX) * this.SCALE;
                const jitter = Math.sin(y * 0.019 + side * 1.7);
                const groundY = sampleMinGround(edgeX + side * 6, wz, 5.0) - 2.2;

                // Tier 1: Lower jagged rock talus / shelf (sunk deep into ground)
                const talusW = 6.0 + Math.abs(jitter) * 3.5;
                const talusH = 9.0 + Math.abs(Math.cos(y * 0.023 + side)) * 4.5;
                const talus = new THREE.Mesh(boxGeo, talusMat);
                talus.scale.set(talusW, talusH, 11.4);
                talus.position.set(edgeX + side * (talusW * 0.42), groundY + talusH * 0.5, wz);
                talus.rotation.y = jitter * 0.14;
                talus.rotation.z = side * -0.08;
                this.canyonGroup.add(talus);

                // Tier 2: Main towering stratified cliff wall
                const wallW = 16.0 + Math.abs(Math.cos(y * 0.015 + side)) * 6.0;
                const wallH = 24.0 + Math.abs(Math.sin(y * 0.011 + side * 2)) * 12.0;
                const wall = new THREE.Mesh(boxGeo, wallMat);
                wall.scale.set(wallW, wallH, 11.8);
                wall.position.set(edgeX + side * (wallW * 0.55 + 2.2), groundY + wallH * 0.5, wz);
                wall.rotation.y = jitter * 0.06;
                this.canyonGroup.add(wall);

                // Tier 3: Upper dark ironstone mesa cap overhang
                if (y % 200 === 0) {
                    const cap = new THREE.Mesh(boxGeo, mesaCapMat);
                    cap.scale.set(wallW + 4.0, 3.4, 13.8);
                    cap.position.set(edgeX + side * (wallW * 0.48 + 1.6), groundY + wallH - 0.8, wz);
                    this.canyonGroup.add(cap);
                }

                // Frontier armored blast barricades & perimeter beacon bollards (grounded & solid)
                if (y % 400 === 0 && y >= 600 && y <= worldH - 500) {
                    const bx = cx + side * 11.2;
                    const bgy = sampleMinGround(bx, wz, 2.2);
                    const barrier = new THREE.Mesh(boxGeo, steelMat);
                    barrier.scale.set(1.1, 1.8, 4.2);
                    barrier.position.set(bx, bgy + 0.3, wz);
                    barrier.rotation.y = side * 0.08;
                    const capPlate = new THREE.Mesh(boxGeo, barrierMat);
                    capPlate.scale.set(1.25, 0.35, 4.3);
                    capPlate.position.set(bx, bgy + 1.25, wz);
                    capPlate.rotation.y = side * 0.08;
                    this.canyonGroup.add(barrier, capPlate);
                    this.canyonObstacles.push({ x: bx / this.SCALE, y: wz / this.SCALE, radius: 22, type: 'barrier' });

                    if ((y % 800 === 0) && side === 1) {
                        const bollardBaseY = bgy - 0.6;
                        const plinth = new THREE.Mesh(boxGeo, pillarMat);
                        plinth.scale.set(1.2, 1.4, 1.2);
                        plinth.position.set(bx + 1.4, bollardBaseY + 0.7, wz);
                        const mast = new THREE.Mesh(boxGeo, steelMat);
                        mast.scale.set(0.42, 4.2, 0.42);
                        mast.position.set(bx + 1.4, bollardBaseY + 3.2, wz);
                        const beacon = new THREE.Mesh(boxGeo, amberGlowMat);
                        beacon.scale.set(0.55, 0.45, 0.55);
                        beacon.position.set(bx + 1.4, bollardBaseY + 5.4, wz);
                        this.canyonGroup.add(plinth, mast, beacon);
                        this.canyonObstacles.push({ x: (bx + 1.4) / this.SCALE, y: wz / this.SCALE, radius: 12, type: 'bollard' });
                    }
                }

                // Alien-planet volcanic crystal spire outcrops along cliff bases (solid)
                if (y % 500 === 0 && y >= 500 && y <= worldH - 400) {
                    const crysX = edgeX - side * (4.5 + Math.abs(jitter) * 4.0);
                    const crysY = sampleMinGround(crysX, wz, 1.6) - 0.5;
                    const crysMat = ((y / 500) % 2 === 0)
                        ? new THREE.MeshLambertMaterial({ color: 0x3b2845, emissive: 0x551866, emissiveIntensity: 0.45, flatShading: true })
                        : new THREE.MeshLambertMaterial({ color: 0x45261c, emissive: 0x883311, emissiveIntensity: 0.4, flatShading: true });
                    for (let c = 0; c < 3; c++) {
                        const spire = new THREE.Mesh(this.geometries.rockSpire, crysMat);
                        const h = 3.2 + ((c * 1.7 + Math.abs(jitter) * 3.0) % 4.2);
                        spire.scale.set(0.85, h, 0.85);
                        spire.position.set(crysX + (c - 1) * 1.1, crysY + h * 0.45, wz + (c - 1) * 0.9);
                        spire.rotation.z = side * (0.18 + c * 0.12);
                        spire.rotation.x = (c - 1) * 0.14;
                        this.canyonGroup.add(spire);
                    }
                    this.canyonObstacles.push({ x: crysX / this.SCALE, y: wz / this.SCALE, radius: 24, type: 'rock' });
                }
            }
        }

        // C) Grounded Industrial Frontier Ore-Conduit & Sensor Arches (Sector 2 & Sector 4 bottlenecks)
        for (const archY of [4950, 2350]) {
            const b = canyon.getBoundsAtY(archY);
            const wz = archY * this.SCALE;
            const spanW = (b.maxX - b.minX) * this.SCALE;
            const cx = b.centerX * this.SCALE;
            const gy = sampleMinGround(cx, wz, 6.0);
            const beam = new THREE.Mesh(boxGeo, steelMat);
            beam.scale.set(spanW + 10, 2.0, 3.2);
            beam.position.set(cx, gy + 15.5, wz);
            beam.rotation.z = (archY === 4950) ? 0.04 : -0.05;
            const pipeConduit = new THREE.Mesh(boxGeo, pillarMat);
            pipeConduit.scale.set(spanW + 8, 1.2, 1.4);
            pipeConduit.position.set(cx, gy + 17.2, wz);
            pipeConduit.rotation.z = beam.rotation.z;
            const beaconPod = new THREE.Mesh(boxGeo, emberGlowMat);
            beaconPod.scale.set(1.8, 0.9, 0.8);
            beaconPod.position.set(cx, gy + 14.3, wz + 1.6);
            // Grounded vertical support piers on both sides of the arch (solid)
            for (const side of [-1, 1]) {
                const pierX = cx + side * (spanW * 0.42);
                const pierY = sampleMinGround(pierX, wz, 2.0) - 2.0;
                const pier = new THREE.Mesh(boxGeo, pillarMat);
                pier.scale.set(3.2, 18.5, 3.4);
                pier.position.set(pierX, pierY + 9.25, wz);
                this.canyonGroup.add(pier);
                this.canyonObstacles.push({ x: pierX / this.SCALE, y: wz / this.SCALE, radius: 26, type: 'pillar' });
            }
            this.canyonGroup.add(beam, pipeConduit, beaconPod);
        }

        // D) Logical Structured-Random Solid Cover Props (HQ perimeter, convoy roadblocks, sector compounds, flank rocks)
        let prngState = (this.terrainSeed || 1337) ^ 0x5f3759df;
        const nextRand = () => {
            prngState = (Math.imul(prngState, 1664525) + 1013904223) >>> 0;
            return prngState / 4294967296;
        };
        const randRange = (lo, hi) => lo + nextRand() * (hi - lo);
        const hqSimX = canyon.START_X || 1700;
        const hqSimY = canyon.START_Y || 7050;
        const sectors = Array.isArray(canyon.SECTORS) ? canyon.SECTORS : [];
        const canPlaceProp = (sx, sy, radius) => {
            if (Math.hypot(sx - hqSimX, sy - hqSimY) < 270) return false;
            const b = canyon.getBoundsAtY(sy);
            if (sx < b.minX + 55 || sx > b.maxX - 55) return false;
            for (const sec of sectors) {
                if (Math.hypot(sx - b.centerX, sy - sec.y) < 140) return false;
            }
            for (let k = 0; k < this.canyonObstacles.length; k++) {
                const o = this.canyonObstacles[k];
                if (Math.hypot(sx - o.x, sy - o.y) < (radius + o.radius + 45)) return false;
            }
            return true;
        };
        const spawnSolidProp = (prop) => {
            const px = prop.x * this.SCALE;
            const pz = prop.y * this.SCALE;
            const gy = sampleMinGround(px, pz, 3.4) - 0.8;
            if (prop.type === 'pillar') {
                const base = new THREE.Mesh(boxGeo, pillarMat);
                base.scale.set(4.2, 2.2, 4.2);
                base.position.set(px, gy + 1.1, pz);
                const col = new THREE.Mesh(boxGeo, pillarMat);
                col.scale.set(2.8, 9.6, 2.8);
                col.position.set(px, gy + 5.8, pz);
                const cap = new THREE.Mesh(boxGeo, barrierMat);
                cap.scale.set(6.2, 1.5, 4.0);
                cap.position.set(px, gy + 10.6, pz);
                cap.rotation.z = 0.09;
                const rebar1 = new THREE.Mesh(boxGeo, steelMat);
                rebar1.scale.set(0.14, 2.2, 0.14);
                rebar1.position.set(px - 1.2, gy + 11.8, pz + 0.5);
                rebar1.rotation.z = 0.25;
                const rubble = new THREE.Mesh(boxGeo, pillarMat);
                rubble.scale.set(1.8, 1.6, 1.5);
                rubble.position.set(px + 2.4, gy + 0.8, pz - 1.6);
                rubble.rotation.y = 0.6;
                this.canyonGroup.add(base, col, cap, rebar1, rubble);
                this.canyonObstacles.push({ x: prop.x, y: prop.y, radius: prop.r || 28, type: 'pillar' });
            } else if (prop.type === 'tank') {
                const yaw = prop.yaw !== undefined ? prop.yaw : (nextRand() * 0.9 - 0.45);
                const tankGrp = new THREE.Group();
                tankGrp.position.set(px, gy + 0.4, pz);
                tankGrp.rotation.y = yaw;
                const hull = new THREE.Mesh(boxGeo, tankMat);
                hull.scale.set(3.8, 1.7, 6.4);
                hull.position.set(0, 0.9, 0);
                const trackL = new THREE.Mesh(boxGeo, steelMat);
                trackL.scale.set(0.85, 1.45, 6.8);
                trackL.position.set(-2.1, 0.65, 0);
                const trackR = new THREE.Mesh(boxGeo, steelMat);
                trackR.scale.set(0.85, 1.45, 6.8);
                trackR.position.set(2.1, 0.65, 0);
                const turret = new THREE.Mesh(boxGeo, tankMat);
                turret.scale.set(2.6, 1.05, 3.2);
                turret.position.set(0, 2.1, -0.2);
                turret.rotation.y = 0.45;
                const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.20, 4.4, 6), steelMat);
                barrel.rotation.x = Math.PI * 0.5;
                barrel.position.set(0.95, 2.1, -2.5);
                barrel.rotation.z = -0.45;
                const ember = new THREE.Mesh(boxGeo, emberGlowMat);
                ember.scale.set(1.6, 0.2, 1.2);
                ember.position.set(0, 1.78, 2.0);
                tankGrp.add(hull, trackL, trackR, turret, barrel, ember);
                this.canyonGroup.add(tankGrp);
                this.canyonObstacles.push({ x: prop.x, y: prop.y, radius: prop.r || 38, type: 'tank' });
            } else {
                // Armored supply crate / tactical bunker cover
                const crate = new THREE.Mesh(boxGeo, steelMat);
                crate.scale.set(3.4, 2.4, 2.4);
                crate.position.set(px, gy + 1.2, pz);
                crate.rotation.y = prop.yaw || 0;
                const trim = new THREE.Mesh(boxGeo, barrierMat);
                trim.scale.set(3.5, 0.4, 2.5);
                trim.position.set(px, gy + 2.5, pz);
                trim.rotation.y = prop.yaw || 0;
                this.canyonGroup.add(crate, trim);
                this.canyonObstacles.push({ x: prop.x, y: prop.y, radius: prop.r || 24, type: 'crate' });
            }
        };

        // 1) Baseline structured cover props
        if (canyon.COVER_PROPS) {
            for (let i = 0; i < canyon.COVER_PROPS.length; i++) {
                const prop = canyon.COVER_PROPS[i];
                if (canPlaceProp(prop.x, prop.y, prop.r || 34)) {
                    spawnSolidProp(prop);
                }
            }
        }

        // 2) Randomized Convoy Roadblocks flanking the main trail (10..17 logical placements)
        const convoyCount = 10 + Math.floor(nextRand() * 8);
        for (let i = 0; i < convoyCount; i++) {
            const sy = randRange(700, hqSimY - 460);
            const b = canyon.getBoundsAtY(sy);
            const side = (i % 2 === 0) ? 1 : -1;
            const sx = b.centerX + side * randRange(135, Math.min(380, b.halfW * 0.55));
            const type = nextRand() < 0.55 ? 'tank' : 'crate';
            const r = type === 'tank' ? 38 : 24;
            if (canPlaceProp(sx, sy, r)) {
                spawnSolidProp({ x: sx, y: sy, r, type, yaw: randRange(-0.7, 0.7) });
            }
        }

        // 3) Randomized Tactical Perimeter Cover around each of the 5 Sectors (3..5 per sector)
        for (const sec of sectors) {
            const secCoverCount = 3 + Math.floor(nextRand() * 3);
            const b = canyon.getBoundsAtY(sec.y);
            for (let k = 0; k < secCoverCount; k++) {
                const ang = (k / secCoverCount) * Math.PI * 2 + randRange(-0.35, 0.35);
                const dist = randRange(195, 340);
                const sx = b.centerX + Math.cos(ang) * dist;
                const sy = sec.y + Math.sin(ang) * dist;
                const type = (k % 2 === 0) ? 'crate' : 'pillar';
                const r = type === 'pillar' ? 28 : 24;
                if (canPlaceProp(sx, sy, r)) {
                    spawnSolidProp({ x: sx, y: sy, r, type, yaw: ang + Math.PI * 0.5 });
                }
            }
        }

        // 4) Randomized Outer Flank Rock/Pillar Formations along canyon margins (14..24)
        const flankCount = 14 + Math.floor(nextRand() * 11);
        for (let i = 0; i < flankCount; i++) {
            const sy = randRange(500, hqSimY - 380);
            const b = canyon.getBoundsAtY(sy);
            const side = nextRand() < 0.5 ? -1 : 1;
            const sx = b.centerX + side * randRange(b.halfW * 0.48, b.halfW * 0.84);
            if (canPlaceProp(sx, sy, 30)) {
                spawnSolidProp({ x: sx, y: sy, r: 30, type: 'pillar' });
            }
        }

        this.scene.add(this.canyonGroup);
    }

    // 3D Volumetric Muzzle Smoke Pool
    initMuzzleSmoke() {
        this.smokePool = [];
        this.maxSmoke = 30;
        const smokeGeo = new THREE.PlaneGeometry(0.35, 0.35);
        const smokeMat = new THREE.MeshBasicMaterial({
            color: 0x5a483a,
            transparent: true,
            opacity: 0.65,
            depthWrite: false
        });

        for (let i = 0; i < this.maxSmoke; i++) {
            const mesh = new THREE.Mesh(smokeGeo, smokeMat.clone());
            mesh.visible = false;
            this.scene.add(mesh);
            this.smokePool.push({
                mesh,
                active: false,
                x: 0, y: 0, z: 0,
                vx: 0, vy: 0, vz: 0,
                scale: 0.35,
                life: 0,
                maxLife: 0.6
            });
        }
    }

    spawnMuzzleSmoke(player, facingAngle, pitch) {
        let s = this.smokePool.find(sm => !sm.active);
        if (!s) s = this.smokePool[0];

        const pWx = player.x * this.SCALE;
        const pWz = player.y * this.SCALE;
        const eyeY = this.getTerrainHeight(pWx, pWz) + 1.85;

        const fwdX = Math.cos(facingAngle);
        const fwdZ = Math.sin(facingAngle);

        s.x = pWx + fwdX * 1.5;
        s.y = eyeY - 0.2 + Math.sin(pitch || 0) * 1.5;
        s.z = pWz + fwdZ * 1.5;

        const windSpd = 12.0;
        s.vx = fwdX * 2.2 + Math.cos(this.WIND_HEADING) * windSpd * 0.3;
        s.vy = 0.8 + Math.random() * 0.5;
        s.vz = fwdZ * 2.2 + Math.sin(this.WIND_HEADING) * windSpd * 0.3;

        s.scale = 0.35;
        s.life = 0.6;
        s.maxLife = 0.6;
        s.active = true;
        s.mesh.visible = true;
        s.mesh.position.set(s.x, s.y, s.z);
        s.mesh.scale.set(s.scale, s.scale, s.scale);
        s.mesh.material.opacity = 0.65;
    }

    updateMuzzleSmoke(dt) {
        for (let i = 0; i < this.smokePool.length; i++) {
            const s = this.smokePool[i];
            if (!s.active) continue;
            s.life -= dt;
            if (s.life <= 0) {
                s.active = false;
                s.mesh.visible = false;
                continue;
            }

            s.x += s.vx * dt;
            s.y += s.vy * dt;
            s.z += s.vz * dt;

            const progress = 1 - (s.life / s.maxLife);
            const curScale = 0.35 + progress * 1.6;
            s.mesh.scale.set(curScale, curScale, curScale);
            s.mesh.material.opacity = (1 - progress) * 0.65;
            s.mesh.position.set(s.x, s.y, s.z);
            s.mesh.quaternion.copy(this.camera.quaternion);
        }
    }

    // Hyper-Velocity 3D Dual-Cylinder Incandescent Tracers
    initTracerAssets() {
        const coreGeo = new THREE.CylinderGeometry(0.045, 0.045, 2.6, 6);
        coreGeo.rotateX(Math.PI / 2);
        const sheathGeo = new THREE.CylinderGeometry(0.12, 0.12, 3.2, 6);
        sheathGeo.rotateX(Math.PI / 2);

        this.tracerCoreGeo = coreGeo;
        this.tracerSheathGeo = sheathGeo;

        this.tracerCoreMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
        this.tracerSheathMat = new THREE.MeshBasicMaterial({ color: 0xffaa22, transparent: true, opacity: 0.85 });
        this.tracerSheathEvolvedMat = new THREE.MeshBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.85 });
    }

    // Decoupled Conn-Pod Suspension Impulse (drives 2D cockpit frame independently from 3D camera)
    applyCockpitSuspensionImpulse(vx = 0, vy = 120, vRoll = 0) {
        this.cockpitVelX = (this.cockpitVelX || 0) + vx;
        this.cockpitVelY = (this.cockpitVelY || 0) + vy;
        this.cockpitRollVel = (this.cockpitRollVel || 0) + vRoll;
    }

    // Chassis mass scales how heavily the cockpit heaves and slams with each stride.
    getChassisCockpitScale() {
        const hs = (typeof window !== 'undefined') ? window.hangarSystem : null;
        let id = (hs && typeof hs.getSelectedChassis === 'function') ? hs.getSelectedChassis() : null;
        if (!id && hs && typeof hs.getActiveBonuses === 'function') {
            id = (hs.getActiveBonuses() || {}).chassisId;
        }
        if (id === 'heavy') return 1.35;
        if (id === 'light') return 0.75;
        return 1.0;
    }

    // Beat 2 Gravity Slam Impact: drops 3D camera onto shock absorbers, lurches Conn-Pod & stamps 12s footprint
    triggerFootstepSlam(isLeftFoot, player) {
        const pcfg = (typeof window !== 'undefined' && window.GAME_CONFIG && window.GAME_CONFIG.PLAYER) || {};
        const feel = this.getChassisCockpitScale();
        this.stepLegLeft = !!isLeftFoot;
        this.stepJoltY = (pcfg.STRIDE_SLAM_DROP || 0.24) * feel;
        this.stepRoll = (isLeftFoot ? -1 : 1) * (pcfg.STRIDE_ROLL_RAD || 0.032) * feel;
        this.applyCockpitSuspensionImpulse((isLeftFoot ? -1 : 1) * 38 * feel, 155 * feel, (isLeftFoot ? -1 : 1) * 0.35 * feel);

        if (player && typeof window !== 'undefined' && window.poolManager) {
            const legAng = player.chassisAngle !== undefined ? player.chassisAngle : player.facingAngle;
            const latSign = isLeftFoot ? -1 : 1;
            const footX = player.x + (-Math.sin(legAng)) * (latSign * 11);
            const footY = player.y + (Math.cos(legAng)) * (latSign * 11);

            if (window.poolManager.spawnDecal) {
                const fadeTime = pcfg.FOOTPRINT_FADE_TIME || 12.0;
                const dec = window.poolManager.spawnDecal(footX, footY, 18, 'rgba(20, 14, 10, 0.85)', 'footprint', fadeTime);
                if (dec) dec.angle = legAng;
            }
            if (window.poolManager.spawnSparks) {
                window.poolManager.spawnSparks(footX, footY, 10, '#cfa258', 110, 0.45);
            }
        }
    }

    // 3D Spring-Damper Camera Recoil
    applyWeaponRecoil(kickPitch, punchZ, yawJitter, isEvolved) {
        const scale = isEvolved ? 0.65 : 1.0;
        this.recoilPitchVel += (kickPitch || 0.048) * scale;
        this.recoilPunchZVel += (punchZ || 0.16) * scale;
        this.recoilYaw += (Math.random() - 0.5) * (yawJitter || 0.012) * scale;
        this.recoilRoll += (Math.random() - 0.5) * (yawJitter || 0.012) * 0.8 * scale;
        if (this.applyCockpitSuspensionImpulse) {
            this.applyCockpitSuspensionImpulse((Math.random() - 0.5) * 8 * scale, 10 * scale, (Math.random() - 0.5) * 0.005 * scale);
        }
        this.triggerMuzzleFlash();
    }

    updateRecoilPhysics(dt) {
        if (dt > 0.033) {
            // Sub-step ODE integration during frame drops to ensure numerical spring-damper stability
            const steps = Math.min(4, Math.ceil(dt / 0.02));
            const subDt = dt / steps;
            for (let s = 0; s < steps; s++) {
                this._stepRecoilPhysics(subDt);
            }
        } else {
            this._stepRecoilPhysics(dt);
        }
    }

    _stepRecoilPhysics(dt) {
        // 2nd-order damped harmonic oscillator: F = -k*x - c*v
        const springK = 95.0;
        const damping = 16.0;

        // Pitch recovery
        const pitchAcc = -springK * this.recoilPitch - damping * this.recoilPitchVel;
        this.recoilPitchVel += pitchAcc * dt;
        this.recoilPitch += this.recoilPitchVel * dt;

        // Punch Z recovery (backward translational punch)
        const punchAcc = -springK * this.recoilPunchZ - damping * this.recoilPunchZVel;
        this.recoilPunchZVel += punchAcc * dt;
        this.recoilPunchZ += this.recoilPunchZVel * dt;

        // Yaw and Roll smooth exponential decay
        this.recoilYaw *= Math.pow(0.005, dt);
        this.recoilRoll *= Math.pow(0.005, dt);

        // Footstep shock recovery
        this.stepJoltY *= Math.pow(0.008, dt);
        this.stepRoll *= Math.pow(0.01, dt);

        // Decoupled Conn-Pod 2D suspension spring-mass integration (also safe if called on minimal mock objects)
        if (this.cockpitOffsetX === undefined) {
            this.cockpitOffsetX = 0;
            this.cockpitOffsetY = 0;
            this.cockpitRoll = 0;
            this.cockpitVelX = 0;
            this.cockpitVelY = 0;
            this.cockpitRollVel = 0;
        }
        const pcfg = (typeof window !== 'undefined' && window.GAME_CONFIG && window.GAME_CONFIG.PLAYER) || {};
        const podK = pcfg.SUSPENSION_STIFFNESS || 68.0;
        const podC = pcfg.SUSPENSION_DAMPING || 11.5;

        const accPodX = -podK * this.cockpitOffsetX - podC * this.cockpitVelX;
        this.cockpitVelX += accPodX * dt;
        this.cockpitOffsetX = Math.max(-45, Math.min(45, this.cockpitOffsetX + this.cockpitVelX * dt));

        const accPodY = -podK * this.cockpitOffsetY - podC * this.cockpitVelY;
        this.cockpitVelY += accPodY * dt;
        this.cockpitOffsetY = Math.max(-55, Math.min(65, this.cockpitOffsetY + this.cockpitVelY * dt));

        const accPodRoll = -podK * this.cockpitRoll - podC * this.cockpitRollVel;
        this.cockpitRollVel += accPodRoll * dt;
        this.cockpitRoll = Math.max(-0.08, Math.min(0.08, this.cockpitRoll + this.cockpitRollVel * dt));

        // Compute cockpit HUD sway pixel offsets (passed to 2D visor & canopy frame)
        this.cockpitSwayX = (this.recoilYaw * 280) + (this.stepRoll * 220);
        this.cockpitSwayY = (-this.recoilPitch * 240) + (this.stepJoltY * 180) + (this.recoilPunchZ * 120);
    }

    // Deterministic pseudo-random [0, 1) hash for infinite chunk generation
    chunkHash(a, b, salt = 0) {
        const n = Math.sin(a * 127.1 + b * 311.7 + salt * 74.7) * 43758.5453123;
        return n - Math.floor(n);
    }

    // Helper to ground a prop sprite cleanly on dune terrain
    spawnGroundedSprite(mat, wx, wz, wScale, hScale = wScale) {
        const spr = new THREE.Sprite(mat);
        spr.center.set(0.5, 0);
        spr.scale.set(wScale, hScale, 1);
        spr.position.set(wx, this.getTerrainHeight(wx, wz) - 0.04, wz);
        return spr;
    }

    // Registers passable left/right pillar obstacles for a sandstone arch (leaving center span walkable)
    addArchPillarObstacles(list, wx, wz, yaw, scaleMult) {
        const span = 4.6 * scaleMult;
        const cos = Math.cos(yaw);
        const sin = Math.sin(yaw);
        const rSim = Math.round(24 * scaleMult);
        list.push({ x: (wx - span * cos) / this.SCALE, y: (wz + span * sin) / this.SCALE, radius: rSim, type: 'rock' });
        list.push({ x: (wx + span * cos) / this.SCALE, y: (wz - span * sin) / this.SCALE, radius: rSim, type: 'rock' });
    }

    // 1) Jagged Tilted Hogback Crag Outcrop with Stepped Ledges, Scree & Desert Flora
    buildCragCluster(wx, wz, seed, scaleMult = 1.0) {
        const pa = window.PixelArt;
        const gy = this.getTerrainHeight(wx, wz);
        const yaw = this.chunkHash(seed, 5, 11) * Math.PI * 2;
        const heightScale = (7.2 + this.chunkHash(seed, 7, 13) * 6.4) * scaleMult;
        const leanDir = this.chunkHash(seed, 8, 17) < 0.5 ? -1 : 1;
        const lean = leanDir * (0.34 + this.chunkHash(seed, 9, 19) * 0.14);

        const cragGrp = new THREE.Group();
        cragGrp.position.set(wx, gy - 0.6, wz);
        cragGrp.rotation.y = yaw;

        // Basal stepped sedimentary terrace slab anchoring spires into the dune
        const baseLedge = new THREE.Mesh(this.geometries.mesaSlab, this.materials.desertRock);
        baseLedge.scale.set(5.4 * scaleMult, 1.8 * scaleMult, 4.2 * scaleMult);
        baseLedge.position.set(0, 0.7 * scaleMult, 0);
        cragGrp.add(baseLedge);

        const capLedge = new THREE.Mesh(this.geometries.mesaSlab, this.materials.desertRockRim);
        capLedge.scale.set(3.8 * scaleMult, 1.0 * scaleMult, 3.1 * scaleMult);
        capLedge.position.set(leanDir * 0.5 * scaleMult, 1.85 * scaleMult, 0.25 * scaleMult);
        capLedge.rotation.y = 0.22;
        cragGrp.add(capLedge);

        // Main jagged leaning razorback monolith
        const peak = new THREE.Mesh(this.geometries.rockSpire, this.materials.desertRock);
        peak.scale.set(2.7 * scaleMult, heightScale, 2.3 * scaleMult);
        peak.position.set(0, heightScale * 0.38, 0);
        peak.rotation.z = lean;
        cragGrp.add(peak);

        // Sunlit flanking buttress shoulder catching sunset rim light
        const shoulder = new THREE.Mesh(this.geometries.canyonButtress, this.materials.desertRockRim);
        shoulder.scale.set(1.95 * scaleMult, heightScale * 0.72, 1.85 * scaleMult);
        shoulder.position.set(-leanDir * 1.45 * scaleMult, heightScale * 0.28, 1.1 * scaleMult);
        shoulder.rotation.z = lean * 0.78;
        cragGrp.add(shoulder);

        // Sharp crowning needle tooth
        const ridge = new THREE.Mesh(this.geometries.rockSpire, this.materials.desertRockRim);
        ridge.scale.set(1.25 * scaleMult, heightScale * 0.56, 1.15 * scaleMult);
        ridge.position.set(-Math.sin(lean) * heightScale * 0.44, heightScale * 0.68, -0.4 * scaleMult);
        ridge.rotation.z = lean * 1.16;
        cragGrp.add(ridge);

        // Counter-leaning talus tooth
        const talus = new THREE.Mesh(this.geometries.rockSpire, this.materials.desertRock);
        talus.scale.set(1.75 * scaleMult, heightScale * 0.42, 1.55 * scaleMult);
        talus.position.set(leanDir * 1.85 * scaleMult, heightScale * 0.16, 0.9 * scaleMult);
        talus.rotation.z = -lean * 0.58;
        cragGrp.add(talus);

        // Perimeter scree boulders, yucca scrub & occasional gnarled desert dry tree in world space
        const propGrp = new THREE.Group();
        propGrp.add(cragGrp);
        if (pa) {
            if (pa.spriteMats.desertRockCluster) {
                for (let s = 0; s < 2; s++) {
                    const ang = yaw + s * 2.4 + 0.6;
                    const dist = (3.4 + this.chunkHash(seed, s, 41) * 2.2) * scaleMult;
                    const px = wx + Math.cos(ang) * dist;
                    const pz = wz + Math.sin(ang) * dist;
                    const sc = (2.2 + this.chunkHash(seed, s, 42) * 1.2) * scaleMult;
                    propGrp.add(this.spawnGroundedSprite(pa.spriteMats.desertRockCluster, px, pz, sc * 1.45, sc));
                }
            }
            if (pa.spriteMats.desertScrub) {
                const ang = yaw + 1.3;
                const dist = 3.8 * scaleMult;
                const sc = 2.1 + this.chunkHash(seed, 3, 43) * 0.9;
                propGrp.add(this.spawnGroundedSprite(pa.spriteMats.desertScrub, wx + Math.cos(ang) * dist, wz + Math.sin(ang) * dist, sc));
            }
            if (pa.spriteMats.desertDryTree && this.chunkHash(seed, 9, 44) > 0.52) {
                const ang = yaw - 1.15;
                const dist = 4.2 * scaleMult;
                const sc = 3.6 + this.chunkHash(seed, 4, 45) * 1.4;
                propGrp.add(this.spawnGroundedSprite(pa.spriteMats.desertDryTree, wx + Math.cos(ang) * dist, wz + Math.sin(ang) * dist, sc * 0.85, sc * 1.15));
            }
        }
        return propGrp;
    }

    // 2) Multi-Tiered Flat-Topped Sandstone Mesa & Cliff Buttress (12m-22m Monument)
    buildMesaFormation(wx, wz, seed, scaleMult = 1.0) {
        const pa = window.PixelArt;
        const gy = this.getTerrainHeight(wx, wz);
        const yaw = this.chunkHash(seed, 2, 71) * Math.PI * 2;
        const totalH = (12.5 + this.chunkHash(seed, 4, 73) * 8.5) * scaleMult;
        const baseW = (9.5 + this.chunkHash(seed, 6, 79) * 3.5) * scaleMult;
        const baseD = (7.2 + this.chunkHash(seed, 8, 83) * 2.8) * scaleMult;

        const rootGrp = new THREE.Group();
        const mesaGrp = new THREE.Group();
        mesaGrp.position.set(wx, gy - 0.85, wz);
        mesaGrp.rotation.y = yaw;

        // Broad hexagonal talus pedestal apron
        const apron = new THREE.Mesh(this.geometries.canyonButtress, this.materials.desertRock);
        apron.scale.set(baseW * 0.62, totalH * 0.34, baseD * 0.62);
        apron.position.set(0, totalH * 0.16, 0);
        mesaGrp.add(apron);

        // 3 Stacked stratified sedimentary sandstone terrace tiers + overhanging sunset caprock
        const tiers = [
            { y: 0.24, w: 0.96, h: 0.28, d: 0.94, rot: 0.0, ox: 0.0, mat: this.materials.desertRock },
            { y: 0.50, w: 0.78, h: 0.24, d: 0.76, rot: 0.12, ox: 0.45, mat: this.materials.desertRockRim },
            { y: 0.72, w: 0.62, h: 0.22, d: 0.60, rot: -0.08, ox: -0.25, mat: this.materials.desertRock },
            { y: 0.89, w: 0.68, h: 0.14, d: 0.66, rot: 0.05, ox: 0.15, mat: this.materials.desertRockRim }
        ];
        for (const t of tiers) {
            const slab = new THREE.Mesh(this.geometries.mesaSlab, t.mat);
            slab.scale.set(baseW * t.w, totalH * t.h, baseD * t.d);
            slab.position.set(t.ox * scaleMult, totalH * t.y, 0);
            slab.rotation.y = t.rot;
            mesaGrp.add(slab);
        }

        // Flanking eroded hogback pinnacle needles clinging to cliff flanks
        for (let f = -1; f <= 1; f += 2) {
            const needle = new THREE.Mesh(this.geometries.rockSpire, f > 0 ? this.materials.desertRockRim : this.materials.desertRock);
            const nh = totalH * (0.64 + 0.14 * f);
            needle.scale.set(2.2 * scaleMult, nh, 2.0 * scaleMult);
            needle.position.set(f * (baseW * 0.52), nh * 0.38, (f > 0 ? 1.2 : -1.4) * scaleMult);
            needle.rotation.z = -f * 0.18;
            mesaGrp.add(needle);
        }

        rootGrp.add(mesaGrp);

        // Perimeter dry desert ironwood & sandstone scree around mesa base
        if (pa) {
            if (pa.spriteMats.desertRockCluster) {
                for (let i = 0; i < 3; i++) {
                    const ang = yaw + i * 2.1 + 0.4;
                    const dist = (baseW * 0.55) + 1.8 * scaleMult;
                    const sc = (2.6 + this.chunkHash(seed, i, 87) * 1.1) * scaleMult;
                    rootGrp.add(this.spawnGroundedSprite(pa.spriteMats.desertRockCluster, wx + Math.cos(ang) * dist, wz + Math.sin(ang) * dist, sc * 1.5, sc));
                }
            }
            if (pa.spriteMats.desertDryTree) {
                const ang = yaw + 0.85;
                const dist = (baseW * 0.58) + 2.2 * scaleMult;
                const sc = 4.2 + this.chunkHash(seed, 5, 89) * 1.5;
                rootGrp.add(this.spawnGroundedSprite(pa.spriteMats.desertDryTree, wx + Math.cos(ang) * dist, wz + Math.sin(ang) * dist, sc * 0.9, sc * 1.25));
            }
        }
        return rootGrp;
    }

    // 3) Natural Eroded Sandstone Arch / Canyon Bridge spanning open desert air
    buildRockArch(wx, wz, seed, scaleMult = 1.0, yawOverride = null) {
        const pa = window.PixelArt;
        const gy = this.getTerrainHeight(wx, wz);
        const yaw = yawOverride !== null ? yawOverride : (this.chunkHash(seed, 3, 53) * Math.PI);
        const archH = (9.5 + this.chunkHash(seed, 6, 59) * 3.8) * scaleMult;
        const span = 4.6 * scaleMult;

        const rootGrp = new THREE.Group();
        const archGrp = new THREE.Group();
        archGrp.position.set(wx, gy - 0.7, wz);
        archGrp.rotation.y = yaw;

        // Twin inward-leaning canyon buttress legs
        for (let side = -1; side <= 1; side += 2) {
            const leg = new THREE.Mesh(
                this.geometries.canyonButtress,
                side > 0 ? this.materials.desertRockRim : this.materials.desertRock
            );
            leg.scale.set(2.3 * scaleMult, archH * 1.08, 2.5 * scaleMult);
            leg.position.set(side * span, archH * 0.48, 0);
            leg.rotation.z = side * 0.24;
            archGrp.add(leg);

            const shoulderSpire = new THREE.Mesh(this.geometries.rockSpire, this.materials.desertRock);
            shoulderSpire.scale.set(1.7 * scaleMult, archH * 0.62, 1.7 * scaleMult);
            shoulderSpire.position.set(side * (span + 1.45 * scaleMult), archH * 0.25, 0.5 * scaleMult);
            shoulderSpire.rotation.z = side * -0.14;
            archGrp.add(shoulderSpire);
        }

        // Weathered sandstone lintel bridge + irregular cap keystone blocks overhead
        const lintel = new THREE.Mesh(this.geometries.archSpan, this.materials.desertRockRim);
        lintel.scale.set(span * 2.15, 2.35 * scaleMult, 2.85 * scaleMult);
        lintel.position.set(0, archH * 0.94, 0);
        archGrp.add(lintel);

        const keystone = new THREE.Mesh(this.geometries.mesaSlab, this.materials.desertRock);
        keystone.scale.set(span * 1.15, 1.55 * scaleMult, 3.25 * scaleMult);
        keystone.position.set(-0.4 * scaleMult, archH * 1.04, 0);
        keystone.rotation.z = -0.05;
        archGrp.add(keystone);

        const capCrown = new THREE.Mesh(this.geometries.mesaSlab, this.materials.desertRockRim);
        capCrown.scale.set(span * 1.55, 1.15 * scaleMult, 2.4 * scaleMult);
        capCrown.position.set(0.55 * scaleMult, archH * 1.10, 0.1 * scaleMult);
        capCrown.rotation.y = 0.08;
        archGrp.add(capCrown);

        rootGrp.add(archGrp);

        // Grounded sandstone talus clusters around both arch footings
        if (pa && pa.spriteMats.desertRockCluster) {
            const cos = Math.cos(yaw);
            const sin = Math.sin(yaw);
            for (let side = -1; side <= 1; side += 2) {
                const fx = wx + side * (span + 1.1 * scaleMult) * cos;
                const fz = wz - side * (span + 1.1 * scaleMult) * sin;
                rootGrp.add(this.spawnGroundedSprite(pa.spriteMats.desertRockCluster, fx, fz, 3.4 * scaleMult, 2.3 * scaleMult));
            }
        }
        return rootGrp;
    }

    buildDesertChunk(cx, cz) {
        const group = new THREE.Group();
        const chunkObstacles = [];
        const pa = window.PixelArt;
        const size = this.CHUNK_SIZE;
        const baseX = cx * size;
        const baseZ = cz * size;

        // Protect HQ drop zone, main canyon corridor center, and all active mission objectives from chunk props
        const cfgCanyon = window.GAME_CONFIG && window.GAME_CONFIG.CANYON;
        const hqWx = ((cfgCanyon && cfgCanyon.START_X) || 1700) * this.SCALE;
        const hqWz = ((cfgCanyon && cfgCanyon.START_Y) || 7050) * this.SCALE;
        const isEndless = typeof window !== 'undefined' && window.gameInstance && window.gameInstance.currentMode === 'endless';
        const isVistaClear = (wx, wz, isLargeStructure = false) => {
            if (Math.hypot(wx - hqWx, wz - hqWz) < 28) return true;
            const simX = wx / this.SCALE;
            const simY = wz / this.SCALE;
            if (!isEndless && cfgCanyon && cfgCanyon.getBoundsAtY) {
                const b = cfgCanyon.getBoundsAtY(simY);
                if (isLargeStructure && Math.abs(simX - b.centerX) < b.halfW * 0.72) return true;
                if (!isLargeStructure && Math.abs(simX - b.centerX) < 120) return true;
            }
            const g = window.gameInstance;
            if (g) {
                if (g.extractionState && Math.hypot(simX - g.extractionState.beaconX, simY - g.extractionState.beaconY) < 220) return true;
                if (Array.isArray(g.outposts)) {
                    for (const op of g.outposts) {
                        if (Math.hypot(simX - op.x, simY - op.y) < (isLargeStructure ? 280 : 185)) return true;
                        if (Array.isArray(op.relays)) {
                            for (const rel of op.relays) {
                                if (Math.hypot(simX - rel.x, simY - rel.y) < 85) return true;
                            }
                        }
                    }
                }
                if (Array.isArray(g.artilleryShells)) {
                    for (const sh of g.artilleryShells) {
                        if (Math.hypot(simX - sh.x, simY - sh.y) < 80) return true;
                    }
                }
            }
            return false;
        };

        // 1) Towering Multi-Tiered Sandstone Mesa (~38% of chunks, outer canyon rims only)
        if (this.chunkHash(cx, cz, 11) < 0.38) {
            const wx = baseX + (0.22 + this.chunkHash(cx, cz, 12) * 0.56) * size;
            const wz = baseZ + (0.22 + this.chunkHash(cx, cz, 13) * 0.56) * size;
            if (!isVistaClear(wx, wz, true)) {
                const scaleMult = 0.85 + this.chunkHash(cx, cz, 14) * 0.45;
                group.add(this.buildMesaFormation(wx, wz, cx * 73 + cz * 19 + 7, scaleMult));
                chunkObstacles.push({
                    x: wx / this.SCALE,
                    y: wz / this.SCALE,
                    radius: Math.round(52 * scaleMult),
                    type: 'rock'
                });
            }
        }

        // 2) Natural Eroded Sandstone Arch / Canyon Bridge (~24% of chunks, outer flanks only)
        if (this.chunkHash(cx, cz, 21) < 0.24) {
            const wx = baseX + (0.20 + this.chunkHash(cx, cz, 22) * 0.60) * size;
            const wz = baseZ + (0.20 + this.chunkHash(cx, cz, 23) * 0.60) * size;
            if (!isVistaClear(wx, wz, true) && !chunkObstacles.some(o => Math.hypot(o.x * this.SCALE - wx, o.y * this.SCALE - wz) < 14)) {
                const seed = cx * 97 + cz * 41 + 19;
                const scaleMult = 0.88 + this.chunkHash(cx, cz, 24) * 0.38;
                const yaw = this.chunkHash(seed, 3, 53) * Math.PI;
                group.add(this.buildRockArch(wx, wz, seed, scaleMult, yaw));
                this.addArchPillarObstacles(chunkObstacles, wx, wz, yaw, scaleMult);
            }
        }

        // 3) 1 to 2 Jagged Tilted Hogback Crag Clusters (~78% of chunks)
        if (this.chunkHash(cx, cz, 1) < 0.78) {
            const count = this.chunkHash(cx, cz, 2) < 0.52 ? 2 : 1;
            for (let i = 0; i < count; i++) {
                const salt = (i + 1) * 31;
                const wx = baseX + (0.14 + this.chunkHash(cx, cz, salt + 3) * 0.72) * size;
                const wz = baseZ + (0.14 + this.chunkHash(cx, cz, salt + 4) * 0.72) * size;
                if (isVistaClear(wx, wz)) continue;
                if (chunkObstacles.some(o => Math.hypot(o.x * this.SCALE - wx, o.y * this.SCALE - wz) < 10.5)) continue;

                const seed = cx * 131 + cz * 59 + salt;
                const scaleMult = 0.82 + this.chunkHash(cx, cz, salt + 7) * 0.45;
                group.add(this.buildCragCluster(wx, wz, seed, scaleMult));
                chunkObstacles.push({
                    x: wx / this.SCALE,
                    y: wz / this.SCALE,
                    radius: Math.round(28 * scaleMult),
                    type: 'rock'
                });
            }
        }

        // 4) Scatter Desert Yucca Scrub, Solid Gnarled Dry Trees & Solid Layered Scree Boulders
        if (pa) {
            const propCount = 3 + Math.floor(this.chunkHash(cx, cz, 90) * 4);
            for (let b = 0; b < propCount; b++) {
                const sx = baseX + (0.10 + this.chunkHash(cx, cz, 92 + b * 7) * 0.80) * size;
                const sz = baseZ + (0.10 + this.chunkHash(cx, cz, 93 + b * 7) * 0.80) * size;
                if (Math.hypot(sx - 180, sz - 180) < 14 || isVistaClear(sx, sz)) continue;
                if (chunkObstacles.some(o => Math.hypot(o.x * this.SCALE - sx, o.y * this.SCALE - sz) < 5.0)) continue;

                const roll = this.chunkHash(cx, cz, 99 + b * 11);
                if (roll < 0.28 && pa.spriteMats.desertDryTree) {
                    const sc = 3.4 + this.chunkHash(cx, cz, 95 + b * 7) * 1.4;
                    group.add(this.spawnGroundedSprite(pa.spriteMats.desertDryTree, sx, sz, sc * 0.85, sc * 1.15));
                    chunkObstacles.push({ x: sx / this.SCALE, y: sz / this.SCALE, radius: 16, type: 'tree' });
                } else if (roll < 0.62 && pa.spriteMats.desertRockCluster) {
                    const sc = 2.0 + this.chunkHash(cx, cz, 95 + b * 7) * 1.1;
                    group.add(this.spawnGroundedSprite(pa.spriteMats.desertRockCluster, sx, sz, sc * 1.45, sc));
                    chunkObstacles.push({ x: sx / this.SCALE, y: sz / this.SCALE, radius: 22, type: 'rock' });
                } else if (pa.spriteMats.desertScrub) {
                    const sc = 2.1 + this.chunkHash(cx, cz, 95 + b * 7) * 1.0;
                    group.add(this.spawnGroundedSprite(pa.spriteMats.desertScrub, sx, sz, sc));
                }
            }
        }

        this.obstacleGroup.add(group);
        return { group, obstacles: chunkObstacles };
    }

    buildCrashSite() {
        const group = new THREE.Group();
        const pa = window.PixelArt;
        this.crashObstacles = [];
        this.crashBeaconMesh = null;
        this.crashBeaconLight = null;

        const cfgCanyon = window.GAME_CONFIG && window.GAME_CONFIG.CANYON;
        const hqWx = ((cfgCanyon && cfgCanyon.START_X) || 1700) * this.SCALE;
        const hqWz = ((cfgCanyon && cfgCanyon.START_Y) || 7050) * this.SCALE;

        // Framing Yucca Agave Scrub & Dry Trees flanking Sector 1 Drop Zone
        if (pa) {
            if (pa.spriteMats.desertScrub) {
                group.add(this.spawnGroundedSprite(pa.spriteMats.desertScrub, hqWx - 18, hqWz - 16, 3.0));
                group.add(this.spawnGroundedSprite(pa.spriteMats.desertScrub, hqWx + 18, hqWz - 17, 2.9));
            }
            if (pa.spriteMats.desertDryTree) {
                group.add(this.spawnGroundedSprite(pa.spriteMats.desertDryTree, hqWx - 24, hqWz - 22, 4.2, 5.4));
                group.add(this.spawnGroundedSprite(pa.spriteMats.desertDryTree, hqWx + 24, hqWz - 21, 3.9, 5.0));
            }
        }

        // Fortified Orbital Drop-Gantry (HQ) at Sector 1 Drop Pad with CIWS Roof Turrets & Cyan Refit Pad Ring
        const hqGy = this.getTerrainHeight(hqWx, hqWz);
        const hqGrp = new THREE.Group();
        hqGrp.position.set(hqWx, hqGy, hqWz + 11);
        const gantrySteelMat = new THREE.MeshLambertMaterial({ color: 0x262e38 });
        const gantryTrimMat = new THREE.MeshLambertMaterial({ color: 0x455264 });

        const pillarGeo = new THREE.BoxGeometry(1.4, 9.5, 1.4);
        const pilL = new THREE.Mesh(pillarGeo, gantrySteelMat);
        pilL.position.set(-6.5, 4.75, 0);
        const pilR = new THREE.Mesh(pillarGeo, gantrySteelMat);
        pilR.position.set(6.5, 4.75, 0);
        const archBeam = new THREE.Mesh(new THREE.BoxGeometry(15.0, 1.4, 2.2), gantryTrimMat);
        archBeam.position.set(0, 9.5, 0);

        const ciwsGeo = new THREE.BoxGeometry(1.3, 0.9, 1.8);
        const ciwsL = new THREE.Mesh(ciwsGeo, gantryTrimMat);
        ciwsL.position.set(-4.8, 10.65, 0);
        const ciwsR = new THREE.Mesh(ciwsGeo, gantryTrimMat);
        ciwsR.position.set(4.8, 10.65, 0);

        const padRing = new THREE.Mesh(
            new THREE.RingGeometry(12.2, 13.0, 36),
            new THREE.MeshBasicMaterial({ color: 0x38f2ff, transparent: true, opacity: 0.72, side: THREE.DoubleSide })
        );
        padRing.rotation.x = -Math.PI / 2;
        padRing.position.set(0, 0.18, 0);

        const guideBeam = new THREE.Mesh(
            new THREE.CylinderGeometry(0.45, 0.45, 160, 12),
            new THREE.MeshBasicMaterial({
                color: 0x38f2ff,
                transparent: true,
                opacity: 0.28,
                fog: false,
                depthWrite: false,
                blending: THREE.AdditiveBlending
            })
        );
        guideBeam.position.set(0, 80, 0);

        hqGrp.add(pilL, pilR, archBeam, ciwsL, ciwsR, padRing, guideBeam);
        hqGrp.userData = { ciwsL, ciwsR, padRing, guideBeam };
        this.hqGroup = hqGrp;
        group.add(hqGrp);

        this.crashSiteGroup = group;

        // 5) Orbital Drop-Bay Enclosure & Animated Blast Doors at Sector 1 Spawn
        const bayGroup = new THREE.Group();
        const bayGy = this.getTerrainHeight(hqWx, hqWz + 5);
        bayGroup.position.set(hqWx, bayGy, hqWz + 5);

        const hullDarkMat = new THREE.MeshLambertMaterial({ color: 0x1d2126 });
        const hullTrimMat = new THREE.MeshLambertMaterial({ color: 0x384048 });
        const hazardMat = new THREE.MeshBasicMaterial({ color: 0xc99a2e });
        const lampRedMat = new THREE.MeshBasicMaterial({ color: 0xff3b1f });

        // Left & Right armored drop-bay bulkheads
        const wallGeo = new THREE.BoxGeometry(0.6, 4.6, 7.2);
        const wallL = new THREE.Mesh(wallGeo, hullDarkMat);
        wallL.position.set(-4.0, 2.1, 0);
        const wallR = new THREE.Mesh(wallGeo, hullDarkMat);
        wallR.position.set(4.0, 2.1, 0);
        bayGroup.add(wallL, wallR);

        // Rear bulkhead & ribbed steel ceiling overhead
        const rearWall = new THREE.Mesh(new THREE.BoxGeometry(8.6, 4.6, 0.6), hullDarkMat);
        rearWall.position.set(0, 2.1, 3.6);
        const ceiling = new THREE.Mesh(new THREE.BoxGeometry(8.6, 0.5, 7.4), hullDarkMat);
        ceiling.position.set(0, 4.45, 0);
        const lintelBeam = new THREE.Mesh(new THREE.BoxGeometry(8.6, 0.85, 0.7), hullTrimMat);
        lintelBeam.position.set(0, 4.0, -3.2);
        bayGroup.add(rearWall, ceiling, lintelBeam);

        // Metal deck floor + sloped boarding ramp extending cleanly onto the desert sand
        const bayFloor = new THREE.Mesh(new THREE.BoxGeometry(7.8, 0.4, 5.2), hullTrimMat);
        bayFloor.position.set(0, 0.08, 1.0);
        const rampMesh = new THREE.Mesh(new THREE.BoxGeometry(7.2, 0.3, 6.4), hullTrimMat);
        rampMesh.position.set(0, -0.25, -4.4);
        rampMesh.rotation.x = 0.14;
        bayGroup.add(bayFloor, rampMesh);

        // Twin sliding front blast doors at z = -3.2m (3.2m ahead of spawn)
        const doorGeo = new THREE.BoxGeometry(3.9, 4.1, 0.45);
        this.blastDoorLeft = new THREE.Mesh(doorGeo, hullTrimMat);
        this.blastDoorLeft.position.set(-1.95, 2.0, -3.2);
        const stripeL = new THREE.Mesh(new THREE.BoxGeometry(3.5, 0.28, 0.48), hazardMat);
        stripeL.position.set(0, -1.1, 0);
        const seamLampL = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.8, 0.48), lampRedMat);
        seamLampL.position.set(1.78, 0.4, 0);
        this.blastDoorLeft.add(stripeL, seamLampL);

        this.blastDoorRight = new THREE.Mesh(doorGeo, hullTrimMat);
        this.blastDoorRight.position.set(1.95, 2.0, -3.2);
        const stripeR = new THREE.Mesh(new THREE.BoxGeometry(3.5, 0.28, 0.48), hazardMat);
        stripeR.position.set(0, -1.1, 0);
        const seamLampR = new THREE.Mesh(new THREE.BoxGeometry(0.14, 1.8, 0.48), lampRedMat);
        seamLampR.position.set(-1.78, 0.4, 0);
        this.blastDoorRight.add(stripeR, seamLampR);

        this.dropBayLight = new THREE.PointLight(0xff6622, 2.4, 16, 1.5);
        this.dropBayLight.position.set(0, 3.6, -0.8);
        bayGroup.add(this.blastDoorLeft, this.blastDoorRight, this.dropBayLight);

        this.dropBayGroup = bayGroup;
        this.dropBayGroup.visible = false; // Open sky for orbital Titanfall drop
        this.crashSiteGroup.add(this.dropBayGroup);

        this.scene.add(this.crashSiteGroup);
    }

    // Drives animated Drop-Bay blast door sliding during the 3.5s Cold-Open Intro
    updateDropBayIntro(introActive, introTimer) {
        if (!this.blastDoorLeft || !this.blastDoorRight) return;
        let openRatio = 1.0;
        if (introActive) {
            if (introTimer < 0.9) {
                openRatio = 0.0;
            } else if (introTimer < 2.2) {
                const t = (introTimer - 0.9) / 1.3;
                openRatio = t * t * (3 - 2 * t); // smoothstep
            } else {
                openRatio = 1.0;
            }
        }
        this.blastDoorLeft.position.x = -1.95 - openRatio * 3.6;
        this.blastDoorRight.position.x = 1.95 + openRatio * 3.6;
        if (this.dropBayLight) {
            this.dropBayLight.intensity = introActive ? (1.8 + Math.sin(introTimer * 8) * 0.6) : 0.7;
        }
    }

    updateCrashBeacon(timeSec) {
        const sos = (Math.sin(timeSec * 14) > 0.15 && Math.sin(timeSec * 3.2) > -0.2) ? 1 : 0.08;
        if (this.crashBeaconLight) {
            this.crashBeaconLight.intensity = 2.4 * sos;
        }
        if (this.materials.beaconGlow) {
            this.materials.beaconGlow.color.setHex(sos > 0.5 ? 0xff3311 : 0x3b0d06);
        }
    }

    updateInfiniteChunks(pWx, pWz) {
        const cx = Math.floor(pWx / this.CHUNK_SIZE);
        const cz = Math.floor(pWz / this.CHUNK_SIZE);

        if (cx === this.lastChunkX && cz === this.lastChunkZ) return;
        this.lastChunkX = cx;
        this.lastChunkZ = cz;

        // 5x5 chunk streaming grid around the player (300m x 300m active zone)
        const neededKeys = new Set();
        for (let dz = -2; dz <= 2; dz++) {
            for (let dx = -2; dx <= 2; dx++) {
                neededKeys.add(`${cx + dx},${cz + dz}`);
            }
        }

        // Unload chunks out of range
        for (const [key, chunk] of this.activeChunks.entries()) {
            if (!neededKeys.has(key)) {
                this.obstacleGroup.remove(chunk.group);
                this.activeChunks.delete(key);
            }
        }

        // Load missing chunks in range
        for (let dz = -2; dz <= 2; dz++) {
            for (let dx = -2; dx <= 2; dx++) {
                const ncx = cx + dx;
                const ncz = cz + dz;
                const key = `${ncx},${ncz}`;
                if (!this.activeChunks.has(key)) {
                    this.activeChunks.set(key, this.buildDesertChunk(ncx, ncz));
                }
            }
        }

        // Refresh collision & radar obstacle list from active chunks + canyon props & crashed pod
        const merged = [];
        for (let i = 0; i < this.crashObstacles.length; i++) {
            merged.push(this.crashObstacles[i]);
        }
        if (Array.isArray(this.canyonObstacles)) {
            for (let i = 0; i < this.canyonObstacles.length; i++) {
                merged.push(this.canyonObstacles[i]);
            }
        }
        for (const chunk of this.activeChunks.values()) {
            for (let i = 0; i < chunk.obstacles.length; i++) {
                merged.push(chunk.obstacles[i]);
            }
        }
        this.obstacles = merged;
    }

    resetScene() {
        for (const m of this.enemyMeshes.values()) this.scene.remove(m);
        this.enemyMeshes.clear();

        for (const m of this.projMeshes.values()) this.scene.remove(m);
        this.projMeshes.clear();

        for (const m of this.dropMeshes.values()) this.scene.remove(m);
        this.dropMeshes.clear();

        for (const m of this.zoneMeshes.values()) this.scene.remove(m);
        this.zoneMeshes.clear();

        for (const m of this.decalMeshes.values()) this.scene.remove(m);
        this.decalMeshes.clear();

        for (const b of this.orbitalBeamMeshes) this.scene.remove(b.mesh);
        this.orbitalBeamMeshes = [];

        for (const mk of this.orbitalMarkerMeshes) this.scene.remove(mk.mesh);
        this.orbitalMarkerMeshes = [];

        for (const ln of this.teslaLines) this.scene.remove(ln.line);
        this.teslaLines = [];

        for (const ht of this.hitscanTracerLines) {
            this.scene.remove(ht.line);
            if (ht.line.geometry) ht.line.geometry.dispose();
            if (ht.line.material) ht.line.material.dispose();
        }
        this.hitscanTracerLines = [];

        for (const sr of this.sonarRings) this.scene.remove(sr.mesh);
        this.sonarRings = [];

        for (const ex of this.explosionSprites) this.scene.remove(ex.sprite);
        this.explosionSprites = [];

        // Rebuild framing canyon crags, crashed drop-pod & clear previously streamed chunks
        if (this.crashSiteGroup) {
            this.scene.remove(this.crashSiteGroup);
            this.crashSiteGroup = null;
        }
        this.crashBeaconMesh = null;
        this.crashBeaconLight = null;
        this.hqGroup = null;
        this.crashObstacles = [];
        this.canyonObstacles = [];
        this.terrainSeed = 1337;
        this.randomizeTerrainSeed(1337);
        if (this.missionGroup) {
            while (this.missionGroup.children.length > 0) {
                this.missionGroup.remove(this.missionGroup.children[0]);
            }
        }
        if (this.outpostMeshes) this.outpostMeshes.clear();
        if (this.shellMeshes) this.shellMeshes.clear();
        if (this.hellbombMeshes) this.hellbombMeshes.clear();
        if (this.podMeshes) this.podMeshes.clear();
        if (this.hazardMeshes) this.hazardMeshes.clear();
        if (this.breachEffects) {
            for (const b of this.breachEffects) this.scene.remove(b.grp);
            this.breachEffects.length = 0;
        }
        if (this.warzoneStreaks) {
            for (const ws of this.warzoneStreaks) this.scene.remove(ws.mesh);
            this.warzoneStreaks.length = 0;
        }
        this.dropshipMesh = null;
        this.extractionPadGroup = null;

        for (const chunk of this.activeChunks.values()) {
            this.obstacleGroup.remove(chunk.group);
        }
        this.activeChunks.clear();
        this.obstacles = [];
        this.canyonObstacles = [];
        this.randomizeTerrainSeed();
        this.buildCanyonCorridor3D();
        this.lastChunkX = null;
        this.lastChunkZ = null;
        this.lastTerrainSnapX = null;
        this.lastTerrainSnapZ = null;

        // Restore base twilight dusk fog & canyon sky on scene reset
        this.thermalActive = false;
        this.scene.fog.color.copy(this.baseFogColor);
        this.scene.background.copy(this.baseFogColor);
        this.scene.fog.density = this.baseFogDensity;
        if (this.skyDome) this.skyDome.visible = true;

        // Build dunes, framing dusk crags, drop-pod site & chunks around spawn (180m, 180m)
        const startWx = (window.GAME_CONFIG.WORLD_WIDTH / 2) * this.SCALE;
        const startWz = (window.GAME_CONFIG.WORLD_HEIGHT / 2) * this.SCALE;
        this.buildCrashSite();
        this.updateInfiniteTerrain(startWx, startWz);
        this.updateInfiniteChunks(startWx, startWz);
    }

    triggerMuzzleFlash() {
        this.muzzleFlashTimer = 0.06;
        this.recoilOffset = 1.0;
        this.muzzleLight.intensity = 3.2;
    }

    triggerPodPulse() {
        this.podPulseTimer = 0.24;
    }

    spawnDynamicLight(simX, simY, colorHex, intensity = 3.5, duration = 0.25) {
        let slot = this.dynamicLights.find(l => l.life <= 0) || this.dynamicLights[0];
        const wx = simX * this.SCALE;
        const wz = simY * this.SCALE;
        slot.light.color.setHex(colorHex);
        slot.light.intensity = intensity;
        slot.light.position.set(wx, this.getTerrainHeight(wx, wz) + 2.2, wz);
        slot.life = duration;
        slot.maxLife = duration;
        slot.baseIntensity = intensity;
    }

    spawnBlindFireImpactLight(simX, simY, isEvolved) {
        const pcfg = (typeof window !== 'undefined' && window.GAME_CONFIG && window.GAME_CONFIG.PLAYER) ? window.GAME_CONFIG.PLAYER : null;
        const intensity = (pcfg && pcfg.BLIND_FIRE_LIGHT_INTENSITY) || 4.5;
        const duration = (pcfg && pcfg.BLIND_FIRE_LIGHT_DURATION) || 0.14;
        this.spawnDynamicLight(simX, simY, isEvolved ? 0xffdd55 : 0xff9933, intensity, duration);
    }

    spawnExplosionFlipbook3D(simX, simY, radiusSim = 45) {
        if (this.explosionSprites.length >= 36) return;
        const pa = window.PixelArt;
        if (!pa || !pa.spriteMats.explosionFrames || !pa.spriteMats.explosionFrames.length) return;
        const spr = new THREE.Sprite(pa.spriteMats.explosionFrames[0]);
        spr.center.set(0.5, 0.2);
        const size = Math.max(2.6, radiusSim * this.SCALE * 1.45);
        spr.scale.set(size, size, 1);
        const wx = simX * this.SCALE;
        const wz = simY * this.SCALE;
        spr.position.set(wx, this.getTerrainHeight(wx, wz) + 0.35, wz);
        this.scene.add(spr);
        this.explosionSprites.push({ sprite: spr, life: 0.36, maxLife: 0.36 });
    }

    spawnOrbitalBeam3D(simX, simY, radiusSim, isEvolved) {
        const r = Math.max(2.0, radiusSim * this.SCALE);
        const mat = new THREE.MeshBasicMaterial({
            color: isEvolved ? 0xff00aa : 0xff44ee,
            transparent: true,
            opacity: 0.78,
            side: THREE.DoubleSide
        });
        const wx = simX * this.SCALE;
        const wz = simY * this.SCALE;
        const gy = this.getTerrainHeight(wx, wz);
        const mesh = new THREE.Mesh(this.geometries.orbitalBeam, mat);
        mesh.scale.set(r * 0.45, 1, r * 0.45);
        mesh.position.set(wx, gy + 45, wz);
        this.scene.add(mesh);

        this.orbitalBeamMeshes.push({ mesh, life: 0.45, maxLife: 0.45 });
        this.spawnExplosionFlipbook3D(simX, simY, radiusSim);
        this.spawnDynamicLight(simX, simY, isEvolved ? 0xff00aa : 0xff44ee, 6.0, 0.5);
    }

    spawnTesla3D(points, colorStr) {
        if (this.teslaLines.length >= 16) return;
        if (!points || points.length < 2) return;
        const verts = [];
        for (let i = 0; i < points.length - 1; i++) {
            const a = points[i];
            const b = points[i + 1];
            const steps = 4;
            for (let s = 0; s < steps; s++) {
                const t = s / steps;
                const wx = (a.x + (b.x - a.x) * t) * this.SCALE;
                const wz = (a.y + (b.y - a.y) * t) * this.SCALE;
                const gy = this.getTerrainHeight(wx, wz);
                const jx = s === 0 ? 0 : (Math.random() - 0.5) * 1.1;
                const jy = s === 0 ? 0 : (Math.random() - 0.5) * 0.85;
                const jz = s === 0 ? 0 : (Math.random() - 0.5) * 1.1;
                verts.push(new THREE.Vector3(wx + jx, gy + 1.35 + jy, wz + jz));
            }
        }
        const last = points[points.length - 1];
        const lwx = last.x * this.SCALE;
        const lwz = last.y * this.SCALE;
        verts.push(new THREE.Vector3(lwx, this.getTerrainHeight(lwx, lwz) + 1.35, lwz));

        const geo = new THREE.BufferGeometry().setFromPoints(verts);
        const mat = new THREE.LineBasicMaterial({
            color: colorStr === '#00ffff' ? 0x66ffff : 0x33d4ff,
            transparent: true,
            opacity: 1
        });
        const line = new THREE.Line(geo, mat);
        this.scene.add(line);
        this.teslaLines.push({ line, life: 0.18, maxLife: 0.18 });
        this.spawnDynamicLight(last.x, last.y, 0x00ffff, 3.5, 0.2);
    }

    spawnHitscanTracer3D(x1, y1, x2, y2, isEvolved) {
        if (!this.scene || typeof THREE === 'undefined' || this.hitscanTracerLines.length >= 24) return;
        const wx1 = x1 * this.SCALE;
        const wz1 = y1 * this.SCALE;
        const wy1 = this.getTerrainHeight(wx1, wz1) + 1.65;
        const wx2 = x2 * this.SCALE;
        const wz2 = y2 * this.SCALE;
        const wy2 = this.getTerrainHeight(wx2, wz2) + 1.15;

        const geo = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(wx1, wy1, wz1),
            new THREE.Vector3(wx2, wy2, wz2)
        ]);
        const mat = new THREE.LineBasicMaterial({
            color: isEvolved ? 0xffee55 : 0xfff4cc,
            transparent: true,
            opacity: 0.95,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });
        const line = new THREE.Line(geo, mat);
        this.scene.add(line);
        const dur = (window.GAME_CONFIG && window.GAME_CONFIG.PLAYER && window.GAME_CONFIG.PLAYER.TRACER_DURATION) || 0.03;
        this.hitscanTracerLines.push({ line, life: dur, maxLife: dur });
    }

    spawnSonarRing3D(simX, simY) {
        const wx = simX * this.SCALE;
        const wz = simY * this.SCALE;
        const terrainY = this.getTerrainHeight(wx, wz) + 0.35;

        // Primary high-contrast orange thermal wave across desert terrain
        const primaryMat = new THREE.MeshBasicMaterial({
            color: 0xff6600,
            transparent: true,
            opacity: 0.90,
            side: THREE.DoubleSide
        });
        const primaryMesh = new THREE.Mesh(this.geometries.sonarRing, primaryMat);
        primaryMesh.position.set(wx, terrainY, wz);
        this.scene.add(primaryMesh);
        this.sonarRings.push({ mesh: primaryMesh, radius: 1, maxRadius: 112, life: 1.45, maxLife: 1.45 });

        // Secondary trailing amber thermal harmonic ring
        const echoMat = new THREE.MeshBasicMaterial({
            color: 0xffaa22,
            transparent: true,
            opacity: 0.72,
            side: THREE.DoubleSide
        });
        const echoMesh = new THREE.Mesh(this.geometries.sonarRing, echoMat);
        echoMesh.position.set(wx, terrainY + 0.12, wz);
        this.scene.add(echoMesh);
        this.sonarRings.push({ mesh: echoMesh, radius: 0.5, maxRadius: 96, life: 1.85, maxLife: 1.85 });
    }

    spawnBugBreach3D(simX, simY) {
        const wx = simX * this.SCALE;
        const wz = simY * this.SCALE;
        const gy = this.getTerrainHeight(wx, wz);
        const grp = new THREE.Group();
        grp.position.set(wx, gy + 0.08, wz);

        const craterMat = new THREE.MeshBasicMaterial({ color: 0xff5511, transparent: true, opacity: 0.85, side: THREE.DoubleSide });
        const crater = new THREE.Mesh(new THREE.RingGeometry(0.6, 2.4, 14), craterMat);
        crater.rotation.x = -Math.PI / 2;

        const plumeMat = new THREE.MeshBasicMaterial({ color: 0xd9732b, transparent: true, opacity: 0.55, side: THREE.DoubleSide });
        const plume = new THREE.Mesh(new THREE.CylinderGeometry(1.8, 0.7, 5.5, 8, 1, true), plumeMat);
        plume.position.y = 2.6;

        grp.add(crater, plume);
        this.scene.add(grp);
        this.breachEffects.push({ grp, craterMat, plumeMat, plume, life: 2.4, maxLife: 2.4 });
    }

    updateBugBreaches(dt) {
        if (!this.breachEffects) return;
        for (let i = this.breachEffects.length - 1; i >= 0; i--) {
            const b = this.breachEffects[i];
            b.life -= dt;
            if (b.life <= 0) {
                this.scene.remove(b.grp);
                this.breachEffects.splice(i, 1);
                continue;
            }
            const t = b.life / b.maxLife;
            b.craterMat.opacity = t * 0.85;
            b.plumeMat.opacity = t * 0.55;
            const s = 1.0 + (1 - t) * 0.65;
            b.plume.scale.set(s, 1.0 + (1 - t) * 0.8, s);
        }
    }

    updateWarzoneSky(dt, pWx, pWz) {
        this._warzoneTimer = (this._warzoneTimer || 0) - dt;
        if (this._warzoneTimer <= 0 && this.warzoneStreaks.length < 8) {
            this._warzoneTimer = 1.6 + Math.random() * 2.2;
            const isPod = Math.random() < 0.4;
            const col = isPod ? 0xff8833 : 0x66ddff;
            const geo = new THREE.BoxGeometry(isPod ? 0.45 : 0.18, isPod ? 4.8 : 2.8, isPod ? 0.45 : 0.18);
            const mat = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.85, fog: false });
            const mesh = new THREE.Mesh(geo, mat);
            const sx = pWx + (Math.random() - 0.5) * 90;
            const sz = pWz - 35 - Math.random() * 65;
            const sy = 42 + Math.random() * 24;
            mesh.position.set(sx, sy, sz);
            const vx = (Math.random() - 0.5) * (isPod ? 8 : 34);
            const vy = isPod ? -28 : (Math.random() * 14 + 6);
            const vz = isPod ? 4 : -18;
            mesh.rotation.z = Math.atan2(-vx, vy);
            this.scene.add(mesh);
            this.warzoneStreaks.push({ mesh, mat, vx, vy, vz, life: 1.8 });
        }
        for (let i = this.warzoneStreaks.length - 1; i >= 0; i--) {
            const ws = this.warzoneStreaks[i];
            ws.life -= dt;
            ws.mesh.position.x += ws.vx * dt;
            ws.mesh.position.y += ws.vy * dt;
            ws.mesh.position.z += ws.vz * dt;
            ws.mat.opacity = Math.max(0, Math.min(0.85, ws.life));
            if (ws.life <= 0 || ws.mesh.position.y < 0) {
                this.scene.remove(ws.mesh);
                this.warzoneStreaks.splice(i, 1);
            }
        }
    }

    getEnemySpriteScale(enemy) {
        switch (enemy.type) {
            case 'sand_stalker': return 2.8;
            case 'skitterer': return 2.4;
            case 'acid_spitter': return 2.9;
            case 'carapace_charger':
            case 'siege_beetle': return 3.6;
            case 'shrieker_mite': return 2.6;
            case 'pheromone_scout': return 2.5;
            case 'brood_guard': return 6.2;
            case 'apex_broodmother': return 9.2;
            default: return 2.6;
        }
    }

    initEnemyAssets() {
        if (this.enemyGeos) return;

        // Low-poly pixel-art textures (NearestFilter, crisp 1px borders & retro shading)
        const makeEnemyTex = (size, drawFn) => {
            const c = document.createElement('canvas');
            c.width = size;
            c.height = size;
            const ctx = c.getContext('2d');
            ctx.imageSmoothingEnabled = false;
            drawFn(ctx, size);
            const tex = new THREE.CanvasTexture(c);
            tex.magFilter = THREE.NearestFilter;
            tex.minFilter = THREE.NearestFilter;
            tex.generateMipmaps = false;
            tex.needsUpdate = true;
            return tex;
        };

        const texChitin = makeEnemyTex(16, (ctx, s) => {
            ctx.fillStyle = '#c8c4be';
            ctx.fillRect(0, 0, s, s);
            // Pixel segment stripes & soft dithering
            ctx.fillStyle = '#a49e96';
            for (let y = 4; y < s; y += 5) ctx.fillRect(1, y, s - 2, 1);
            ctx.fillStyle = '#eae6e0';
            ctx.fillRect(2, 2, s - 4, 2);
            for (let y = 3; y < s - 2; y += 3) {
                for (let x = 3; x < s - 2; x += 4) {
                    ctx.fillStyle = ((x + y) % 2 === 0) ? '#b0aaa2' : '#dedad4';
                    ctx.fillRect(x, y, 1, 1);
                }
            }
            // 1px dark pixel outline
            ctx.fillStyle = '#241c18';
            ctx.fillRect(0, 0, s, 1);
            ctx.fillRect(0, s - 1, s, 1);
            ctx.fillRect(0, 0, 1, s);
            ctx.fillRect(s - 1, 0, 1, s);
        });

        const texArmorPlate = makeEnemyTex(16, (ctx, s) => {
            ctx.fillStyle = '#7c6572';
            ctx.fillRect(0, 0, s, s);
            ctx.fillStyle = '#a38998';
            ctx.fillRect(1, 1, s - 2, 2);
            ctx.fillStyle = '#d4a23a';
            ctx.fillRect(2, 7, s - 4, 2);
            ctx.fillStyle = '#241c18';
            ctx.fillRect(0, 0, s, 1);
            ctx.fillRect(0, s - 1, s, 1);
            ctx.fillRect(0, 0, 1, s);
            ctx.fillRect(s - 1, 0, 1, s);
        });

        const texBile = makeEnemyTex(16, (ctx, s) => {
            ctx.fillStyle = '#4de85c';
            ctx.fillRect(0, 0, s, s);
            ctx.fillStyle = '#aaff99';
            ctx.fillRect(3, 3, 4, 4);
            ctx.fillRect(9, 8, 3, 3);
            ctx.fillStyle = '#259e34';
            ctx.fillRect(0, 0, s, 1);
            ctx.fillRect(0, s - 1, s, 1);
            ctx.fillRect(0, 0, 1, s);
            ctx.fillRect(s - 1, 0, 1, s);
        });

        const texEye = makeEnemyTex(8, (ctx, s) => {
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, s, s);
            ctx.fillStyle = '#181414';
            ctx.fillRect(0, 0, s, 1);
            ctx.fillRect(0, s - 1, s, 1);
            ctx.fillRect(0, 0, 1, s);
            ctx.fillRect(s - 1, 0, 1, s);
            // Cute cartoon pixel eye highlight
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(2, 2, 2, 2);
        });

        // Chunkier, friendlier retro low-poly silhouettes
        this.enemyGeos = {
            thorax: new THREE.BoxGeometry(0.86, 0.56, 0.92),
            abdomen: new THREE.DodecahedronGeometry(0.48, 0),
            head: new THREE.BoxGeometry(0.62, 0.44, 0.52),
            leg: new THREE.BoxGeometry(0.18, 0.68, 0.18),
            horn: new THREE.CylinderGeometry(0.06, 0.12, 0.42, 4),
            wing: new THREE.BoxGeometry(0.42, 0.95, 0.10),
            shield: new THREE.CylinderGeometry(0.60, 0.68, 0.30, 6),
            eye: new THREE.BoxGeometry(0.18, 0.18, 0.12)
        };
        this.enemyGeos.leg.translate(0, -0.32, 0);
        this.enemyGeos.horn.rotateX(Math.PI / 2);
        this.enemyGeos.shield.rotateX(Math.PI / 2);

        const chitinColors = {
            skitterer: 0xb86f48,
            acid_spitter: 0x5ca34e,
            sand_stalker: 0xd9a86c,
            carapace_charger: 0x7a5468,
            siege_beetle: 0x7a5468,
            shrieker_mite: 0x9b66ad,
            pheromone_scout: 0xd97a38,
            brood_guard: 0xa83b54,
            apex_broodmother: 0x8a2852
        };

        this.enemyMats = {
            silhouette: new THREE.MeshBasicMaterial({ color: 0x1a1412 }),
            flash: new THREE.MeshBasicMaterial({ color: 0xffffff }),
            thermal: new THREE.MeshBasicMaterial({ color: 0xff7718, fog: false }),
            blindLit: new THREE.MeshLambertMaterial({ map: texChitin, color: 0xffddaa, emissive: 0x553311, flatShading: true }),
            eyeRed: new THREE.MeshBasicMaterial({ map: texEye, color: 0xff6655, fog: false }),
            eyeGreen: new THREE.MeshBasicMaterial({ map: texEye, color: 0x66ff88, fog: false }),
            eyeAmber: new THREE.MeshBasicMaterial({ map: texEye, color: 0xffcc44, fog: false }),
            bileSac: new THREE.MeshBasicMaterial({ map: texBile, color: 0xffffff, fog: false }),
            flareSac: new THREE.MeshBasicMaterial({ map: texBile, color: 0xff9933, fog: false }),
            armorPlate: new THREE.MeshLambertMaterial({ map: texArmorPlate, flatShading: true }),
            chitin: {}
        };
        for (const [k, col] of Object.entries(chitinColors)) {
            this.enemyMats.chitin[k] = new THREE.MeshLambertMaterial({ map: texChitin, color: col, flatShading: true });
        }
    }

    createEnemySprite(enemy) {
        this.initEnemyAssets();
        const eg = this.enemyGeos;
        const em = this.enemyMats;
        const type = enemy.type || 'skitterer';
        const bodyMat = em.chitin[type] || em.chitin.skitterer;
        const eyeMat = (type === 'acid_spitter') ? em.eyeGreen : ((type === 'sand_stalker' || type === 'pheromone_scout') ? em.eyeAmber : em.eyeRed);

        const grp = new THREE.Group();
        const s = this.getEnemySpriteScale(enemy) * 0.48;
        grp.scale.set(s, s, s);

        const bodyMeshes = [];
        const addBody = (geo, px, py, pz, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0, mat = bodyMat) => {
            const m = new THREE.Mesh(geo, mat);
            m.position.set(px, py, pz);
            m.scale.set(sx, sy, sz);
            m.rotation.set(rx, ry, rz);
            grp.add(m);
            if (mat === bodyMat) bodyMeshes.push(m);
            return m;
        };

        // Main segmented thorax + head
        addBody(eg.thorax, 0, 0.62, 0.05, 1.0, 0.72, 1.25);
        addBody(eg.head, 0, 0.56, 0.62, 0.9, 0.75, 1.0);

        // Twin glowing predator eyes
        const eL = new THREE.Mesh(eg.eye, eyeMat);
        eL.position.set(-0.16, 0.65, 0.85);
        const eR = new THREE.Mesh(eg.eye, eyeMat);
        eR.position.set(0.16, 0.65, 0.85);
        grp.add(eL, eR);

        // Type-specific 3D silhouette & organs
        let bileMesh = null;
        let flareMesh = null;
        let armorShield = null;
        let coreMesh = null;
        let sandMound = null;
        let ecmMesh = null;
        let wingL = null;
        let wingR = null;

        if (type === 'acid_spitter') {
            bileMesh = new THREE.Mesh(eg.abdomen, em.bileSac);
            bileMesh.position.set(0, 0.78, -0.58);
            bileMesh.scale.set(1.15, 0.95, 1.25);
            grp.add(bileMesh);
        } else if (type === 'pheromone_scout' || enemy.isPheromoneScout) {
            addBody(eg.abdomen, 0, 0.58, -0.50, 0.8, 0.65, 0.95);
            flareMesh = new THREE.Mesh(eg.abdomen, em.flareSac);
            flareMesh.position.set(0, 0.96, -0.35);
            flareMesh.scale.set(0.55, 0.55, 0.55);
            grp.add(flareMesh);
        } else if (type === 'siege_beetle' || type === 'carapace_charger') {
            addBody(eg.abdomen, 0, 0.74, -0.52, 1.25, 0.95, 1.2);
            armorShield = addBody(eg.shield, 0, 0.68, 0.62, 1.15, 1.05, 1.0, -0.25, 0, 0, em.armorPlate);
            coreMesh = new THREE.Mesh(eg.abdomen, new THREE.MeshBasicMaterial({ color: 0xff6611, fog: false }));
            coreMesh.position.set(0, 0.66, 0.45);
            coreMesh.scale.set(0.75, 0.65, 0.65);
            coreMesh.visible = false;
            grp.add(coreMesh);
            addBody(eg.horn, -0.25, 0.55, 0.95, 1, 1, 1.2, -0.2, 0.15, 0);
            addBody(eg.horn, 0.25, 0.55, 0.95, 1, 1, 1.2, -0.2, -0.15, 0);
        } else if (type === 'shrieker_mite') {
            addBody(eg.abdomen, 0, 0.55, -0.55, 0.7, 0.6, 1.1);
            ecmMesh = new THREE.Mesh(eg.abdomen, new THREE.MeshBasicMaterial({ color: 0x38f2ff, fog: false }));
            ecmMesh.position.set(0, 0.92, -0.08);
            ecmMesh.scale.set(0.45, 0.45, 0.45);
            grp.add(ecmMesh);
            wingL = addBody(eg.wing, -0.45, 0.78, 0.05, 0.35, 1.1, 1.0, 0, 0, 1.35);
            wingR = addBody(eg.wing, 0.45, 0.78, 0.05, 0.35, 1.1, 1.0, 0, 0, -1.35);
        } else if (type === 'sand_stalker') {
            addBody(eg.abdomen, 0, 0.58, -0.52, 0.9, 0.7, 1.15);
            addBody(eg.horn, -0.22, 0.52, 0.9, 0.9, 0.9, 1.1, -0.1, 0.25, 0);
            addBody(eg.horn, 0.22, 0.52, 0.9, 0.9, 0.9, 1.1, -0.1, -0.25, 0);
            sandMound = new THREE.Mesh(
                new THREE.DodecahedronGeometry(0.95, 0),
                new THREE.MeshLambertMaterial({ color: 0x9c5b32, flatShading: true })
            );
            sandMound.scale.set(1.2, 0.42, 1.45);
            sandMound.position.set(0, 0.16, 0);
            sandMound.visible = false;
            grp.add(sandMound);
        } else if (type === 'brood_guard' || type === 'apex_broodmother') {
            addBody(eg.abdomen, 0, 0.85, -0.68, 1.35, 1.05, 1.45);
            addBody(eg.horn, -0.36, 0.88, 0.65, 1.3, 1.3, 1.5, -0.35, 0.25, 0);
            addBody(eg.horn, 0.36, 0.88, 0.65, 1.3, 1.3, 1.5, -0.35, -0.25, 0);
            addBody(eg.horn, 0, 1.15, 0.25, 1.1, 1.5, 1.2, -0.75, 0, 0);
        } else {
            addBody(eg.abdomen, 0, 0.56, -0.48, 0.85, 0.68, 1.05);
            addBody(eg.horn, -0.18, 0.48, 0.85, 0.7, 0.7, 0.85, 0, 0.2, 0);
            addBody(eg.horn, 0.18, 0.48, 0.85, 0.7, 0.7, 0.85, 0, -0.2, 0);
        }

        // Articulated scuttling legs (6 legs on skitterer, siege_beetle & bosses; 4 legs on others)
        const legPairs = (type === 'skitterer' || type === 'brood_guard' || type === 'apex_broodmother' || type === 'siege_beetle') ? 3 : 2;
        const legs = [];
        for (let pIdx = 0; pIdx < legPairs; pIdx++) {
            const zOff = 0.28 - pIdx * 0.42;
            const lL = addBody(eg.leg, -0.42, 0.55, zOff, 1, 1, 1, 0, 0, -0.68);
            const lR = addBody(eg.leg, 0.42, 0.55, zOff, 1, 1, 1, 0, 0, 0.68);
            legs.push({ lL, lR, idx: pIdx });
        }

        grp.userData = {
            type,
            phaseOffset: Math.random() * 5,
            baseScale: s,
            normalMat: bodyMat,
            bodyMeshes,
            legs,
            wingL,
            wingR,
            bileMesh,
            flareMesh,
            armorShield,
            coreMesh,
            sandMound,
            ecmMesh
        };

        this.scene.add(grp);
        return grp;
    }

    syncFrame(game, dt) {
        const p = game.player;
        if (!p) return;
        const pa = window.PixelArt;

        const pWx = p.x * this.SCALE;
        const pWz = p.y * this.SCALE;

        // Stream infinite 3D sand dunes & desert landmarks around player
        this.updateInfiniteTerrain(pWx, pWz);
        this.updateInfiniteChunks(pWx, pWz);

        // 1) Update Recoil, Conn-Pod Suspension, Shell Casings, Bug Gibs & Smoke
        this.updateRecoilPhysics(dt);
        this.updateShellCasings(dt);
        this.updateBugGibs(dt);
        this.updateMuzzleSmoke(dt);
        this.updateBugBreaches(dt);
        this.updateWarzoneSky(dt, pWx, pWz);
        this.updateDropBayIntro(!!game.introActive, game.introTimer || 0);

        // Smooth Camera FOV Optical Zoom (75 deg hip-fire -> 44 deg Rifle ADS / 54 deg Pistol ADS, +8 deg Dash)
        const pcfg = (window.GAME_CONFIG && window.GAME_CONFIG.PLAYER) || {};
        const adsBlend = p.adsBlend || 0;
        const adsTargetFov = (p.activeHandheld === 'pistol37') ? (pcfg.ADS_FOV_PISTOL || 54) : (pcfg.ADS_FOV_RIFLE || 44);
        const desiredFov = (75 - adsBlend * (75 - adsTargetFov)) + (p.isDashing ? 8.0 : 0);

        const isMoving = Math.hypot(p.vx, p.vy) > 20;
        // Keep renderer stride phase synchronized with Player.update()'s Two-Beat stride physics
        this.walkBobPhase = p.gaitPhase !== undefined ? p.gaitPhase : this.walkBobPhase;

        const cockpitFeel = this.getChassisCockpitScale();
        const bobY = isMoving && !p.isDashing ? Math.sin(this.walkBobPhase * 2) * 0.12 * cockpitFeel : 0;
        const bobX = isMoving && !p.isDashing ? Math.cos(this.walkBobPhase) * 0.07 * cockpitFeel : 0;

        let shakeX = 0;
        let shakeY = 0;
        let shakeZ = 0;
        if (game.shakeIntensity > 0) {
            shakeX = (Math.random() - 0.5) * game.shakeIntensity * 0.04;
            shakeY = (Math.random() - 0.5) * game.shakeIntensity * 0.04;
            shakeZ = (Math.random() - 0.5) * game.shakeIntensity * 0.04;
        }

        const yaw = -p.facingAngle - Math.PI / 2;
        const pitch = p.pitch || 0;
        const camForward = new THREE.Vector3(
            -Math.sin(yaw) * Math.cos(pitch),
            Math.sin(pitch),
            -Math.cos(yaw) * Math.cos(pitch)
        );

        const playerGroundY = this.getTerrainHeight(pWx, pWz);
        let dropHeightOffset = 0;
        let dropPitchOffset = 0;
        let targetFov = desiredFov;
        if (game.introActive) {
            const it = game.introTimer || 0;
            if (it < 1.35) {
                // Accelerating terminal-velocity plunge (220m -> 22m)
                const fallP = it / 1.35;
                dropHeightOffset = 22 + 198 * (1 - fallP * fallP * fallP);
                dropPitchOffset = -0.36 * (1 - fallP * 0.25);
                targetFov = 75 + fallP * 19;
                shakeX += (Math.random() - 0.5) * 0.08;
                shakeY += (Math.random() - 0.5) * 0.08;
            } else if (it < 1.65) {
                // Violent 0.30s last-second retro-thruster braking burn (22m -> 0m)
                const burnP = (it - 1.35) / 0.30;
                const inv = 1 - burnP;
                dropHeightOffset = 22 * inv * inv;
                dropPitchOffset = -0.27 * inv;
                targetFov = 94 - burnP * 22;
                shakeX += (Math.random() - 0.5) * 0.22;
                shakeY += (Math.random() - 0.5) * 0.22;
            } else if (it < 2.10) {
                // Heavy 50-ton knee-compression slam & hydraulic rebound
                const landP = (it - 1.65) / 0.45;
                dropHeightOffset = -Math.sin(landP * Math.PI) * 1.15 * (1 - landP * 0.45);
                dropPitchOffset = Math.sin(landP * Math.PI) * 0.09;
                targetFov = 72 + landP * 3;
            }
        }
        if (Math.abs(this.camera.fov - targetFov) > 0.05) {
            this.camera.fov += (targetFov - this.camera.fov) * Math.min(1, dt * 16);
            this.camera.updateProjectionMatrix();
        }
        const finalPitch = pitch + dropPitchOffset + this.recoilPitch + (p.strideCameraPitch || 0) * cockpitFeel;
        const finalYaw = yaw + this.recoilYaw;
        const finalRoll = this.recoilRoll + this.stepRoll + (p.strideCameraRoll || 0) * cockpitFeel;

        if (this.playerMechGroup) {
            this.playerMechGroup.visible = !!this.thirdPersonMode;
            this.playerMechGroup.position.set(pWx, playerGroundY + dropHeightOffset, pWz);
            this.playerMechGroup.rotation.set(0, yaw, 0, 'YXZ');
            this.updatePlayerMechAnimation(p, dt, performance.now() * 0.001, yaw, pitch, isMoving);
        }

        if (this.thirdPersonMode) {
            const camRight = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
            const backDist = p.adsActive ? 4.8 : 6.6;
            const rightShift = p.adsActive ? 2.1 : 2.55;
            const camHeight = p.adsActive ? 4.85 : 5.35;
            this.camera.position.set(
                pWx - camForward.x * (backDist + this.recoilPunchZ * 0.45) + camRight.x * rightShift + shakeX,
                playerGroundY + camHeight + dropHeightOffset + bobY * 0.28 + shakeY - this.stepJoltY * 0.3,
                pWz - camForward.z * (backDist + this.recoilPunchZ * 0.45) + camRight.z * rightShift + shakeZ
            );
            this.camera.rotation.set(finalPitch - 0.11, finalYaw, finalRoll * 0.25, 'YXZ');
        } else {
            // Exosuit pilot eye height: grounded 2.05m clearance + orbital drop altitude
            this.camera.position.set(
                pWx + bobX + shakeX - camForward.x * this.recoilPunchZ,
                playerGroundY + 2.05 + dropHeightOffset + bobY + shakeY - camForward.y * this.recoilPunchZ - this.stepJoltY,
                pWz + shakeZ - camForward.z * this.recoilPunchZ
            );
            this.camera.rotation.set(finalPitch, finalYaw, finalRoll, 'YXZ');
        }

        // Dynamic Sandstorm Fog Squalls & 1400 Wind Particle Streaming
        this.stormTimer += dt;
        const stormCycle = 28.0;
        const squallDur = 8.0;
        const modTime = this.stormTimer % stormCycle;
        if (modTime < squallDur) {
            this.squallIntensity = Math.sin((modTime / squallDur) * Math.PI);
        } else {
            this.squallIntensity = 0;
        }

        const curFogDensity = 0.022 + this.squallIntensity * 0.016; // 0.022 to 0.038

        // Wind particle translation streaming
        const windSpeed = 26.0 + this.squallIntensity * 42.0; // 26 to 68 m/s
        const windDx = Math.cos(this.WIND_HEADING) * windSpeed * dt;
        const windDz = Math.sin(this.WIND_HEADING) * windSpeed * dt;

        if (this.dustPoints && this.dustPosArray) {
            for (let i = 0; i < this.dustCount; i++) {
                this.dustPosArray[i * 3] += windDx;
                this.dustPosArray[i * 3 + 2] += windDz;

                const rx = this.dustPosArray[i * 3] - this.camera.position.x;
                const rz = this.dustPosArray[i * 3 + 2] - this.camera.position.z;
                if (rx > 40) this.dustPosArray[i * 3] -= 80;
                else if (rx < -40) this.dustPosArray[i * 3] += 80;
                if (rz > 40) this.dustPosArray[i * 3 + 2] -= 80;
                else if (rz < -40) this.dustPosArray[i * 3 + 2] += 80;
            }
            this.dustPoints.geometry.attributes.position.needsUpdate = true;
        }

        // Keep sky dome & embers centered around camera
        if (this.skyDome) {
            this.skyDome.position.copy(this.camera.position);
            if (this.skyDome.material) {
                this.skyDome.material.opacity = Math.max(0.15, 1.0 - this.squallIntensity * 0.85);
            }
        }
        if (this.emberPoints) {
            this.emberPoints.position.set(this.camera.position.x, playerGroundY - 0.5, this.camera.position.z);
            this.emberPoints.rotation.y -= dt * 0.08;
        }

        // 2) Update Gun Flash timers
        if (this.muzzleFlashTimer > 0) {
            this.muzzleFlashTimer -= dt;
            if (this.muzzleFlashTimer <= 0) {
                this.muzzleLight.intensity = 0;
            }
        }
        this.recoilOffset *= Math.pow(0.002, dt);
        if (this.recoilOffset < 0.01) this.recoilOffset = 0;
        if (this.podPulseTimer > 0) {
            this.podPulseTimer = Math.max(0, this.podPulseTimer - dt);
        }

        const timeSec = performance.now() * 0.001;
        this.updateCrashBeacon(timeSec);

        // 3) Thermal / Sonar Vision Fog & Sky Toggle
        const isThermal = p.sonarTimer > 0;
        if (isThermal !== this.thermalActive) {
            this.thermalActive = isThermal;
            if (this.skyDome) this.skyDome.visible = !isThermal;
            if (isThermal) {
                this.scene.fog.color.copy(this.thermalFogColor);
                this.scene.background.copy(this.thermalFogColor);
                this.scene.fog.density = 0.009;
            } else {
                this.scene.fog.color.copy(this.baseFogColor);
                this.scene.background.copy(this.baseFogColor);
                this.scene.fog.density = curFogDensity;
            }
        } else if (!isThermal) {
            this.scene.fog.density = curFogDensity;
        }

        // 4) Sync Active 2D Billboarded Pixel-Art Enemies with Silhouette Pop-in
        if (pa && pa.spriteMats) {
            if (!pa.spriteMats.sand_stalker && pa.spriteMats.skitterer) {
                pa.spriteMats.sand_stalker = pa.spriteMats.skitterer;
            }
            for (const eType in pa.spriteMats) {
                const entry = pa.spriteMats[eType];
                if (entry && entry.mats && !entry.mats.silhouette) {
                    entry.mats.silhouette = new THREE.SpriteMaterial({ color: 0x0a0705, fog: true });
                }
            }
        }

        const activeEnemies = new Set(window.poolManager.enemies.active);
        for (const [enemy, spr] of this.enemyMeshes.entries()) {
            if (!activeEnemies.has(enemy) || !enemy.active || spr.userData.type !== enemy.type) {
                this.scene.remove(spr);
                this.enemyMeshes.delete(enemy);
            }
        }

        const cutoffDist = isThermal ? 80 : (42.0 - this.squallIntensity * 14.0);
        const silThreshold = isThermal ? 999 : 18.0;

        for (const enemy of activeEnemies) {
            let grp = this.enemyMeshes.get(enemy);
            if (!grp) {
                grp = this.createEnemySprite(enemy);
                this.enemyMeshes.set(enemy, grp);
            }

            const ex = enemy.x * this.SCALE;
            const ez = enemy.y * this.SCALE;
            const ud = grp.userData;
            const phase = ud.phaseOffset || 0;
            const bobY = (enemy.type === 'shrieker_mite') ? Math.sin(timeSec * 9 + phase) * 0.16 : Math.abs(Math.sin(timeSec * 14 + phase)) * 0.08;
            grp.position.set(ex, this.getTerrainHeight(ex, ez) + 0.02 + (enemy.altitudeOffset || 0) + bobY, ez);

            // Face movement/player direction in 3D
            const spdSq = (enemy.vx || 0) * (enemy.vx || 0) + (enemy.vy || 0) * (enemy.vy || 0);
            const lookDx = spdSq > 16 ? enemy.vx : (pWx - ex);
            const lookDz = spdSq > 16 ? enemy.vy : (pWz - ez);
            grp.rotation.y = Math.atan2(lookDx, lookDz);

            const distM = Math.hypot(ex - pWx, ez - pWz);
            const isBlindLit = (enemy.blindLitTimer || 0) > 0;
            const effCutoff = isBlindLit ? cutoffDist * 1.45 : cutoffDist;

            // Animate articulated 3D legs, wings & organs
            if (ud.legs) {
                for (let li = 0; li < ud.legs.length; li++) {
                    const pair = ud.legs[li];
                    const swing = Math.sin(timeSec * 16 + phase + pair.idx * 2.1) * 0.34;
                    pair.lL.rotation.x = swing;
                    pair.lR.rotation.x = -swing;
                }
            }
            if (ud.wingL && ud.wingR) {
                const flap = Math.sin(timeSec * 22 + phase) * 0.42;
                ud.wingL.rotation.z = 1.35 + flap;
                ud.wingR.rotation.z = -1.35 - flap;
            }
            if (ud.bileMesh) {
                const sacPulse = 1.0 + Math.sin(timeSec * 8 + phase) * 0.14;
                ud.bileMesh.scale.set(1.15 * sacPulse, 0.95 * sacPulse, 1.25 * sacPulse);
                ud.bileMesh.visible = !(enemy.isBurrowed && enemy.burrowState === 'BURROWED');
            }
            if (ud.flareMesh) {
                ud.flareMesh.visible = !!enemy.scoutSpotted;
                if (enemy.scoutSpotted) {
                    const fp = 0.55 + Math.sin(timeSec * 16) * 0.18;
                    ud.flareMesh.scale.set(fp, fp, fp);
                }
            }
            if (ud.armorShield) {
                ud.armorShield.visible = !enemy.armorShattered;
            }
            if (ud.coreMesh) {
                ud.coreMesh.visible = !!enemy.armorShattered;
            }
            if (ud.ecmMesh) {
                const ep = 0.42 + Math.sin(timeSec * 14 + phase) * 0.10;
                ud.ecmMesh.scale.set(ep, ep, ep);
            }

            // Physical 3D hit-stagger & shrieker banking
            grp.rotation.x = (enemy.hitFlash > 0) ? -0.26 * Math.min(1, enemy.hitFlash / 0.1) : (enemy.burrowState === 'LUNGING' ? 0.24 : 0);
            grp.rotation.z = (enemy.type === 'shrieker_mite') ? Math.sin(timeSec * 4.5 + phase) * 0.22 : 0;

            if (distM > effCutoff) {
                grp.visible = false; // Obscured by blinding sandstorm haze
            } else {
                grp.visible = true;
                const isSandBurrowed = !!(enemy.isBurrowed && enemy.burrowState === 'BURROWED');
                if (ud.sandMound) {
                    ud.sandMound.visible = isSandBurrowed;
                }
                let targetMat = ud.normalMat;
                if (isSandBurrowed) {
                    if (isThermal) {
                        targetMat = this.enemyMats.thermal;
                    } else if (ud.sandMound) {
                        // Show traveling 3D sand-mound wake while hiding bug body below sand
                        if (ud.bodyMeshes) {
                            for (let bi = 0; bi < ud.bodyMeshes.length; bi++) {
                                ud.bodyMeshes[bi].visible = false;
                            }
                        }
                    } else {
                        grp.visible = false; // Underground
                    }
                } else {
                    if (ud.bodyMeshes) {
                        for (let bi = 0; bi < ud.bodyMeshes.length; bi++) {
                            ud.bodyMeshes[bi].visible = true;
                        }
                    }
                    if (enemy.hitFlash > 0) {
                        targetMat = this.enemyMats.flash;
                    } else if (isThermal) {
                        targetMat = this.enemyMats.thermal;
                    } else if (isBlindLit) {
                        targetMat = this.enemyMats.blindLit;
                    } else if (distM > silThreshold) {
                        targetMat = this.enemyMats.silhouette;
                    }
                }

                if (grp.visible && ud.bodyMeshes) {
                    for (let bi = 0; bi < ud.bodyMeshes.length; bi++) {
                        ud.bodyMeshes[bi].material = targetMat;
                    }
                }
            }

            const baseS = ud.baseScale || (this.getEnemySpriteScale(enemy) * 0.48);
            if (enemy.isCharging || enemy.burrowState === 'LUNGING') {
                const pulse = 1.0 + Math.sin(timeSec * 25) * 0.12;
                grp.scale.set(baseS * pulse, baseS * 0.92, baseS * pulse);
            } else {
                grp.scale.set(baseS, baseS, baseS);
            }
        }

        // 5) Sync Projectiles following dune contour & Hyper-Velocity 3D Tracers
        const activeProjs = new Set(window.poolManager.projectiles.active);
        for (const [proj, mesh] of this.projMeshes.entries()) {
            if (!activeProjs.has(proj) || !proj.active || mesh.userData.type !== proj.type) {
                this.scene.remove(mesh);
                this.projMeshes.delete(proj);
            }
        }

        for (const proj of activeProjs) {
            let mesh = this.projMeshes.get(proj);
            if (!mesh) {
                if (proj.type === 'bullet') {
                    const isEvolved = proj.extra && proj.extra.isEvolved;
                    const grp = new THREE.Group();
                    const core = new THREE.Mesh(this.tracerCoreGeo, this.tracerCoreMat);
                    const sheath = new THREE.Mesh(this.tracerSheathGeo, isEvolved ? this.tracerSheathEvolvedMat : this.tracerSheathMat);
                    grp.add(core);
                    grp.add(sheath);
                    mesh = grp;
                } else if (proj.type === 'missile') {
                    mesh = new THREE.Mesh(this.geometries.missile, this.materials.missile);
                } else {
                    const isBossAcid = proj.color === '#aa00ff';
                    const sprMat = pa
                        ? (isBossAcid ? pa.spriteMats.bossAcidProj : pa.spriteMats.acidProj)
                        : new THREE.SpriteMaterial({ color: 0x44ff44 });
                    mesh = new THREE.Sprite(sprMat);
                    mesh.scale.set(1.1, 1.1, 1);
                }
                mesh.userData.type = proj.type;
                this.scene.add(mesh);
                this.projMeshes.set(proj, mesh);
            }

            const px = proj.x * this.SCALE;
            const pz = proj.y * this.SCALE;
            const h = proj.type === 'bullet' ? 1.85 : (proj.type === 'missile' ? 2.0 : 1.5);
            mesh.position.set(px, this.getTerrainHeight(px, pz) + h, pz);
            if (proj.type === 'bullet' || proj.type === 'missile') {
                mesh.rotation.y = Math.atan2(proj.vx, proj.vy);
                if (proj.type === 'bullet') {
                    mesh.rotation.x = (p.pitch || 0);
                }
            }
        }

        // 6) Sync Pixel Drops (XP Crystals, Scrap Cogs, Supply Chests) + Floating '+' Sparkles
        const activeDrops = new Set(window.poolManager.drops.active);
        for (const [drop, grp] of this.dropMeshes.entries()) {
            if (!activeDrops.has(drop) || !drop.active || grp.userData.type !== drop.type) {
                this.scene.remove(grp);
                this.dropMeshes.delete(drop);
            }
        }

        for (const drop of activeDrops) {
            let grp = this.dropMeshes.get(drop);
            if (!grp) {
                grp = new THREE.Group();
                grp.userData = { type: drop.type, sparkles: [] };

                if (pa) {
                    if (drop.type === 'chest') {
                        const chestSpr = new THREE.Sprite(pa.spriteMats.chest);
                        chestSpr.center.set(0.5, 0);
                        chestSpr.scale.set(2.4, 2.4, 1);
                        grp.add(chestSpr);

                        for (let s = 0; s < 4; s++) {
                            const sp = new THREE.Sprite(pa.spriteMats.sparkle);
                            sp.scale.set(0.55, 0.55, 1);
                            grp.add(sp);
                            grp.userData.sparkles.push({ spr: sp, offset: s * 0.25, radius: 0.95 });
                        }
                    } else {
                        const mat = drop.type === 'xp' ? pa.spriteMats.xp : pa.spriteMats.scrap;
                        const itemSpr = new THREE.Sprite(mat);
                        itemSpr.center.set(0.5, 0);
                        const s = drop.type === 'xp' ? 1.15 : 1.3;
                        itemSpr.scale.set(s, s, 1);
                        grp.add(itemSpr);
                        grp.userData.mainSpr = itemSpr;

                        if (drop.type === 'xp' || drop.type === 'scrap') {
                            const sp = new THREE.Sprite(pa.spriteMats.sparkle);
                            sp.scale.set(0.38, 0.38, 1);
                            grp.add(sp);
                            grp.userData.sparkles.push({ spr: sp, offset: Math.random(), radius: 0.45 });
                        }
                    }
                }

                this.scene.add(grp);
                this.dropMeshes.set(drop, grp);
            }

            const dx = drop.x * this.SCALE;
            const dz = drop.y * this.SCALE;
            grp.position.set(dx, this.getTerrainHeight(dx, dz) + 0.02, dz);
            if (grp.userData.mainSpr) {
                grp.userData.mainSpr.position.y = 0.22 + Math.sin(timeSec * 4.5 + drop.x) * 0.14;
            }
            for (let i = 0; i < grp.userData.sparkles.length; i++) {
                const spInfo = grp.userData.sparkles[i];
                const cycle = (timeSec * 1.1 + spInfo.offset) % 1;
                const ang = (i / Math.max(1, grp.userData.sparkles.length)) * Math.PI * 2 + timeSec * 1.6;
                spInfo.spr.position.set(
                    Math.cos(ang) * spInfo.radius,
                    0.55 + cycle * (drop.type === 'chest' ? 1.7 : 1.0),
                    Math.sin(ang) * spInfo.radius
                );
            }
        }

        // 7) Sync Ground Zones (Thermite Fire / Hammer Radiation)
        const activeZones = new Set(window.poolManager.groundZones.active);
        for (const [zone, mesh] of this.zoneMeshes.entries()) {
            if (!activeZones.has(zone) || !zone.active) {
                this.scene.remove(mesh);
                this.zoneMeshes.delete(zone);
            }
        }

        const fireIdxGlobal = (pa && pa.spriteMats.fireFrames)
            ? Math.floor(timeSec * 9) % pa.spriteMats.fireFrames.length
            : 0;

        for (const zone of activeZones) {
            let mesh = this.zoneMeshes.get(zone);
            const zx = zone.x * this.SCALE;
            const zz = zone.y * this.SCALE;
            if (!mesh) {
                const col = zone.isAcidPuddle ? 0x33ff44 : (zone.isRadiation ? 0xff00aa : 0xff5500);
                const grp = new THREE.Group();
                const disc = new THREE.Mesh(
                    this.geometries.zoneDisc,
                    new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: zone.isAcidPuddle ? 0.34 : 0.24, depthWrite: false })
                );
                const ring = new THREE.Mesh(
                    this.geometries.zoneRing,
                    new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.85, side: THREE.DoubleSide })
                );
                const radMeters = zone.radius * this.SCALE;
                disc.scale.set(radMeters, 1, radMeters);
                ring.scale.set(radMeters, 1, radMeters);
                grp.add(disc, ring);

                const flames = [];
                if (pa && pa.spriteMats.fireFrames && !zone.isRadiation && !zone.isAcidPuddle) {
                    const flameCount = 8;
                    for (let f = 0; f < flameCount; f++) {
                        const a = (f / flameCount) * Math.PI * 2;
                        const fs = new THREE.Sprite(pa.spriteMats.fireFrames[0]);
                        fs.center.set(0.5, 0);
                        fs.scale.set(1.9, 2.2, 1);
                        const fx = Math.cos(a) * radMeters * 0.72;
                        const fz = Math.sin(a) * radMeters * 0.72;
                        const localDy = this.getTerrainHeight(zx + fx, zz + fz) - this.getTerrainHeight(zx, zz);
                        fs.position.set(fx, localDy + 0.02, fz);
                        grp.add(fs);
                        flames.push({ spr: fs, phase: f });
                    }
                }
                grp.userData = { flames };
                grp.position.set(zx, this.getTerrainHeight(zx, zz) + 0.25, zz);
                this.scene.add(grp);
                this.zoneMeshes.set(zone, grp);
                mesh = grp;
            }

            if (mesh.userData.flames && pa && pa.spriteMats.fireFrames) {
                for (let i = 0; i < mesh.userData.flames.length; i++) {
                    const fl = mesh.userData.flames[i];
                    const idx = (fireIdxGlobal + fl.phase) % pa.spriteMats.fireFrames.length;
                    fl.spr.material = pa.spriteMats.fireFrames[idx];
                }
            }
        }

        // 8) Sync Ground Floor Pixel Splatters, Blast Scorches & 12s Mech Footprints
        const activeDecals = new Set(window.poolManager.decals.active);
        for (const [dec, mesh] of this.decalMeshes.entries()) {
            if (!activeDecals.has(dec) || !dec.active) {
                this.scene.remove(mesh);
                this.decalMeshes.delete(dec);
            }
        }

        for (const dec of activeDecals) {
            let mesh = this.decalMeshes.get(dec);
            if (!mesh) {
                let mat = this.materials.decalRed;
                if (dec.type === 'footprint') {
                    mat = this.materials.decalFootprint.clone();
                } else if (dec.type === 'scorch') {
                    mat = this.materials.decalScorch;
                } else if (dec.color && dec.color.includes('255, 80')) {
                    mat = this.materials.decalGreen;
                } else if (dec.color && dec.color.includes('180, 0')) {
                    mat = this.materials.decalPurple;
                }
                const dx = dec.x * this.SCALE;
                const dz = dec.y * this.SCALE;
                mesh = new THREE.Mesh(this.geometries.decalPlane, mat);
                if (dec.type === 'footprint') {
                    mesh.scale.set(2.2, 1, 2.2);
                    mesh.rotation.y = -(dec.angle || 0) - Math.PI / 2;
                    mesh.position.set(dx, this.getTerrainHeight(dx, dz) + 0.08, dz);
                } else {
                    const s = Math.max(1.4, dec.radius * this.SCALE * 2.2);
                    mesh.scale.set(s, 1, s);
                    mesh.rotation.y = Math.random() * Math.PI * 2;
                    mesh.position.set(dx, this.getTerrainHeight(dx, dz) + 0.14, dz);
                }
                this.scene.add(mesh);
                this.decalMeshes.set(dec, mesh);
            } else if (dec.type === 'footprint') {
                mesh.material.opacity = Math.max(0, (dec.life / Math.max(0.01, dec.maxLife))) * 0.75;
            }
        }

        // 9) Sync Orbital Markers
        while (this.orbitalMarkerMeshes.length < p.weapons.orbitalMarkers.length) {
            const grp = new THREE.Group();
            const ring = new THREE.Mesh(
                this.geometries.zoneRing,
                new THREE.MeshBasicMaterial({ color: 0xff22ee, transparent: true, opacity: 0.9, side: THREE.DoubleSide })
            );
            grp.add(ring);
            this.scene.add(grp);
            this.orbitalMarkerMeshes.push({ mesh: grp });
        }
        for (let i = 0; i < this.orbitalMarkerMeshes.length; i++) {
            const mk = this.orbitalMarkerMeshes[i];
            if (i < p.weapons.orbitalMarkers.length) {
                const data = p.weapons.orbitalMarkers[i];
                const radMeters = data.radius * this.SCALE;
                const mx = data.x * this.SCALE;
                const mz = data.y * this.SCALE;
                mk.mesh.visible = true;
                mk.mesh.position.set(mx, this.getTerrainHeight(mx, mz) + 0.28, mz);
                mk.mesh.scale.set(radMeters, 1, radMeters);
                mk.mesh.rotation.y += dt * 4;
            } else {
                mk.mesh.visible = false;
            }
        }

        // 10) Update Orbital Beams, Tesla Lines, Sonar Rings, Pixel Flipbook Explosions & Dynamic Lights
        for (let i = this.orbitalBeamMeshes.length - 1; i >= 0; i--) {
            const b = this.orbitalBeamMeshes[i];
            b.life -= dt;
            if (b.life <= 0) {
                this.scene.remove(b.mesh);
                this.orbitalBeamMeshes.splice(i, 1);
            } else {
                b.mesh.material.opacity = (b.life / b.maxLife) * 0.85;
            }
        }

        for (let i = this.explosionSprites.length - 1; i >= 0; i--) {
            const ex = this.explosionSprites[i];
            ex.life -= dt;
            if (ex.life <= 0) {
                this.scene.remove(ex.sprite);
                this.explosionSprites.splice(i, 1);
            } else if (pa && pa.spriteMats.explosionFrames) {
                const prog = 1 - (ex.life / ex.maxLife);
                const frameIdx = Math.min(
                    pa.spriteMats.explosionFrames.length - 1,
                    Math.floor(prog * pa.spriteMats.explosionFrames.length)
                );
                ex.sprite.material = pa.spriteMats.explosionFrames[frameIdx];
            }
        }

        for (let i = this.teslaLines.length - 1; i >= 0; i--) {
            const t = this.teslaLines[i];
            t.life -= dt;
            if (t.life <= 0) {
                this.scene.remove(t.line);
                this.teslaLines.splice(i, 1);
            } else {
                t.line.material.opacity = t.life / t.maxLife;
            }
        }

        for (let i = this.hitscanTracerLines.length - 1; i >= 0; i--) {
            const ht = this.hitscanTracerLines[i];
            ht.life -= dt;
            if (ht.life <= 0) {
                this.scene.remove(ht.line);
                if (ht.line.geometry) ht.line.geometry.dispose();
                if (ht.line.material) ht.line.material.dispose();
                this.hitscanTracerLines.splice(i, 1);
            } else {
                ht.line.material.opacity = Math.max(0, ht.life / ht.maxLife);
            }
        }

        for (let i = this.sonarRings.length - 1; i >= 0; i--) {
            const s = this.sonarRings[i];
            s.life -= dt;
            if (s.life <= 0) {
                this.scene.remove(s.mesh);
                this.sonarRings.splice(i, 1);
            } else {
                const prog = 1 - (s.life / s.maxLife);
                const r = 1 + prog * s.maxRadius;
                s.mesh.scale.set(r, 1, r);
                s.mesh.material.opacity = (1 - prog) * 0.85;
            }
        }

        for (const dl of this.dynamicLights) {
            if (dl.life > 0) {
                dl.life -= dt;
                const peak = dl.baseIntensity || 4.5;
                dl.light.intensity = Math.max(0, (dl.life / dl.maxLife) * peak);
            }
        }

        // 11) Sync Blocky Pixel Chitin Gibs & Sparks following dune height
        const activeParts = window.poolManager.particles.active;
        const count = Math.min(activeParts.length, this.maxParticles);
        this.particleInstanced.count = count;

        for (let i = 0; i < count; i++) {
            const part = activeParts[i];
            const ratio = Math.max(0.08, part.life / part.maxLife);
            const ptx = part.x * this.SCALE;
            const ptz = part.y * this.SCALE;
            this.particleDummy.position.set(
                ptx,
                this.getTerrainHeight(ptx, ptz) + 0.75 + (1 - ratio) * 1.4,
                ptz
            );
            this.particleDummy.rotation.set(part.x * 0.1 + ratio * 4, part.y * 0.1, ratio * 3);
            const s = (part.radius * 0.16) * ratio;
            this.particleDummy.scale.set(s, s, s);
            this.particleDummy.updateMatrix();
            this.particleInstanced.setMatrixAt(i, this.particleDummy.matrix);
            this.particleColor.set(part.color);
            this.particleInstanced.setColorAt(i, this.particleColor);
        }
        this.particleInstanced.instanceMatrix.needsUpdate = true;
        if (this.particleInstanced.instanceColor) {
            this.particleInstanced.instanceColor.needsUpdate = true;
        }

        this.syncMissionObjects3D(game, timeSec);
        this.updateCockpitArms3D(game, dt, timeSec);
        this.renderer.render(this.scene, this.camera);
    }

    buildCockpitArms3D() {
        // Low-poly pixel-art texture generator (SamGrady / PS1 retro aesthetic)
        const makePixelTex = (size, drawFn, wrapRepeat = false) => {
            const c = document.createElement('canvas');
            c.width = size;
            c.height = size;
            const ctx = c.getContext('2d');
            ctx.imageSmoothingEnabled = false;
            drawFn(ctx, size);
            const tex = new THREE.CanvasTexture(c);
            tex.magFilter = THREE.NearestFilter;
            tex.minFilter = THREE.NearestFilter;
            tex.generateMipmaps = false;
            if (wrapRepeat) {
                tex.wrapS = THREE.RepeatWrapping;
                tex.wrapT = THREE.RepeatWrapping;
            }
            tex.needsUpdate = true;
            return tex;
        };

        const drawBevelPanel = (ctx, s, base, hi, lo, seam, rivet) => {
            ctx.fillStyle = base;
            ctx.fillRect(0, 0, s, s);
            // Subtle pixel dithering / weathering
            for (let y = 2; y < s - 2; y += 2) {
                for (let x = 2; x < s - 2; x += 2) {
                    if (((x * 7 + y * 13) % 11) === 0) {
                        ctx.fillStyle = lo;
                        ctx.fillRect(x, y, 1, 1);
                    } else if (((x * 5 + y * 3) % 17) === 0) {
                        ctx.fillStyle = hi;
                        ctx.fillRect(x, y, 1, 1);
                    }
                }
            }
            // 1px dark ink outline + pixel bevel
            ctx.fillStyle = '#12100e';
            ctx.fillRect(0, 0, s, 1);
            ctx.fillRect(0, s - 1, s, 1);
            ctx.fillRect(0, 0, 1, s);
            ctx.fillRect(s - 1, 0, 1, s);
            ctx.fillStyle = hi;
            ctx.fillRect(1, 1, s - 2, 1);
            ctx.fillRect(1, 1, 1, s - 2);
            ctx.fillStyle = lo;
            ctx.fillRect(1, s - 2, s - 2, 1);
            ctx.fillRect(s - 2, 1, 1, s - 2);
            // Center seam & corner rivets
            ctx.fillStyle = seam;
            ctx.fillRect(2, Math.floor(s * 0.5), s - 4, 1);
            ctx.fillStyle = rivet;
            const rPos = [3, s - 4];
            for (const rx of rPos) {
                for (const ry of rPos) {
                    ctx.fillRect(rx, ry, 1, 1);
                }
            }
        };

        const texArmorOlive = makePixelTex(32, (ctx, s) => {
            drawBevelPanel(ctx, s, '#4d553d', '#6e7858', '#2f3424', '#22261a', '#86916d');
            // Recessed vent slits
            ctx.fillStyle = '#181b14';
            for (let i = 0; i < 3; i++) {
                ctx.fillRect(8, 6 + i * 3, 16, 1);
            }
        });

        const texArmorDark = makePixelTex(32, (ctx, s) => {
            drawBevelPanel(ctx, s, '#252930', '#3d434f', '#17191e', '#101216', '#5a6270');
        });

        const texGunmetal = makePixelTex(32, (ctx, s) => {
            drawBevelPanel(ctx, s, '#454d58', '#6a7585', '#282d34', '#1b1f24', '#8590a0');
        });

        const texSteelBarrel = makePixelTex(16, (ctx, s) => {
            ctx.fillStyle = '#505864';
            ctx.fillRect(0, 0, s, s);
            ctx.fillStyle = '#8b96a8';
            ctx.fillRect(3, 0, 2, s);
            ctx.fillStyle = '#20242b';
            ctx.fillRect(0, 0, 1, s);
            ctx.fillRect(s - 1, 0, 1, s);
            for (let y = 2; y < s; y += 4) {
                ctx.fillStyle = '#2a2e36';
                ctx.fillRect(0, y, s, 1);
            }
        });

        const texHazard = makePixelTex(16, (ctx, s) => {
            ctx.fillStyle = '#c89228';
            ctx.fillRect(0, 0, s, s);
            ctx.fillStyle = '#191714';
            for (let y = 0; y < s; y++) {
                for (let x = 0; x < s; x++) {
                    if (((x + y) % 8) < 4) ctx.fillRect(x, y, 1, 1);
                }
            }
            ctx.fillStyle = '#12100e';
            ctx.strokeRect(0.5, 0.5, s - 1, s - 1);
        });

        const texBrassAmmo = makePixelTex(16, (ctx, s) => {
            ctx.fillStyle = '#1a1815';
            ctx.fillRect(0, 0, s, s);
            for (let y = 0; y < s; y += 4) {
                ctx.fillStyle = '#8f6a1e';
                ctx.fillRect(2, y, 12, 3);
                ctx.fillStyle = '#d4a63c';
                ctx.fillRect(4, y, 8, 2);
                ctx.fillStyle = '#f2d06b';
                ctx.fillRect(6, y, 3, 1);
                ctx.fillStyle = '#b54a28';
                ctx.fillRect(12, y, 2, 2);
            }
        }, true);

        const texClawSteel = makePixelTex(32, (ctx, s) => {
            drawBevelPanel(ctx, s, '#636b78', '#98a1b0', '#383d45', '#23262b', '#b8c0cc');
        });

        const texShell155 = makePixelTex(16, (ctx, s) => {
            ctx.fillStyle = '#4e5438';
            ctx.fillRect(0, 0, s, s);
            ctx.fillStyle = '#d49b2a';
            ctx.fillRect(0, 4, s, 3);
            ctx.fillStyle = '#c0392b';
            ctx.fillRect(0, 0, s, 3);
            ctx.fillStyle = '#141210';
            ctx.fillRect(0, 0, 1, s);
            ctx.fillRect(s - 1, 0, 1, s);
        });

        const makeMat = (map, color = 0xffffff, emissive = 0x000000, emissiveIntensity = 0) =>
            new THREE.MeshLambertMaterial({
                map,
                color,
                emissive,
                emissiveIntensity,
                flatShading: true,
                fog: false
            });

        const matArmorOlive = makeMat(texArmorOlive);
        const matArmorDark = makeMat(texArmorDark);
        const matGunmetal = makeMat(texGunmetal);
        const matSteel = makeMat(texClawSteel);
        const matHazard = makeMat(texHazard);
        const matBrassAmmo = makeMat(texBrassAmmo);
        const matChrome = makeMat(texSteelBarrel, 0xd8dde6);
        const matShell = makeMat(texShell155);
        const matVentGlow = new THREE.MeshBasicMaterial({ color: 0xff4422, fog: false });
        const matOpticGlow = new THREE.MeshBasicMaterial({ color: 0x33ffcc, fog: false });

        // Key + fill lighting for crisp low-poly faceted shading on cockpit arms
        const cockpitFill = new THREE.PointLight(0xffe2be, 1.05, 5.5, 1.2);
        cockpitFill.position.set(0, 0.55, -0.25);
        this.cockpitGroup.add(cockpitFill);

        // 3D Industrial Cockpit Canopy Rig (A-pillars, upper roll-bar, lower dashboard console with emissive CRT gauges)
        const canopyGroup = new THREE.Group();
        const pillarL = new THREE.Mesh(new THREE.BoxGeometry(0.085, 1.55, 0.10), matArmorDark);
        pillarL.position.set(-1.12, 0.06, -0.78);
        pillarL.rotation.set(0.06, 0.14, -0.14);
        const pillarR = new THREE.Mesh(new THREE.BoxGeometry(0.085, 1.55, 0.10), matArmorDark);
        pillarR.position.set(1.12, 0.06, -0.78);
        pillarR.rotation.set(0.06, -0.14, 0.14);
        const topRollBar = new THREE.Mesh(new THREE.BoxGeometry(2.10, 0.09, 0.12), matArmorOlive);
        topRollBar.position.set(0, 0.78, -0.78);
        const dashBezel = new THREE.Mesh(new THREE.BoxGeometry(1.45, 0.22, 0.28), matArmorDark);
        dashBezel.position.set(0, -0.70, -0.82);
        dashBezel.rotation.x = -0.35;
        const crtLeft = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.08, 0.02), new THREE.MeshBasicMaterial({ color: 0x18e066, fog: false }));
        crtLeft.position.set(-0.34, -0.64, -0.68);
        crtLeft.rotation.x = -0.35;
        const crtRight = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.08, 0.02), new THREE.MeshBasicMaterial({ color: 0x38f2ff, fog: false }));
        crtRight.position.set(0.34, -0.64, -0.68);
        crtRight.rotation.x = -0.35;
        canopyGroup.add(pillarL, pillarR, topRollBar, dashBezel, crtLeft, crtRight);
        this.cockpitGroup.add(canopyGroup);

        // Helper: 5-fingered articulated mech gauntlet with curled finger tips
        const buildGauntletHand = (isRight) => {
            const hand = new THREE.Group();
            const palm = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.11, 0.14), matArmorDark);
            hand.add(palm);
            const backPlate = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.04, 0.12), matArmorOlive);
            backPlate.position.set(0, 0.06, 0.0);
            hand.add(backPlate);
            const fingerSign = isRight ? -1 : 1;
            for (let f = 0; f < 4; f++) {
                const knuckle = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.038, 0.075), matGunmetal);
                knuckle.position.set(fingerSign * 0.055, 0.032 - f * 0.025, -0.04);
                knuckle.rotation.z = fingerSign * 0.42;
                hand.add(knuckle);
                const tip = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.032, 0.055), matSteel);
                tip.position.set(fingerSign * 0.072, 0.015 - f * 0.025, -0.06);
                tip.rotation.z = fingerSign * 1.05;
                hand.add(tip);
            }
            const thumb = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.042, 0.085), matGunmetal);
            thumb.position.set(fingerSign * 0.025, 0.068, -0.03);
            thumb.rotation.x = 0.35;
            hand.add(thumb);
            return hand;
        };

        // ================= LEFT ARM: TWO-HANDED FOREGRIP + COMBAT KNIFE / 37MM PISTOL =================
        const leftArm = new THREE.Group();
        leftArm.position.set(-0.32, -0.56, -0.88);
        leftArm.rotation.set(0.10, -0.74, 0.08);
        this.cockpitGroup.add(leftArm);

        const lShoulder = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.24, 0.34), matArmorOlive);
        lShoulder.position.set(-0.10, 0.06, 0.16);
        leftArm.add(lShoulder);

        const leftForearm = new THREE.Group();
        leftForearm.position.set(0.04, 0.02, -0.32);
        leftArm.add(leftForearm);

        const lForeBody = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 0.46), matArmorOlive);
        lForeBody.position.set(0, 0, -0.16);
        leftForearm.add(lForeBody);

        const lForeCuff = new THREE.Mesh(new THREE.BoxGeometry(0.20, 0.14, 0.22), matGunmetal);
        lForeCuff.position.set(0, 0.03, -0.26);
        leftForearm.add(lForeCuff);

        const lPiston = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.40, 6), matChrome);
        lPiston.rotation.x = Math.PI * 0.5;
        lPiston.position.set(0.10, 0.06, -0.16);
        leftForearm.add(lPiston);

        const lTier2Plate = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.16, 0.30), matGunmetal);
        lTier2Plate.position.set(-0.11, 0.03, -0.16);
        leftForearm.add(lTier2Plate);

        const lTier4Piston = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.36, 6), matChrome);
        lTier4Piston.rotation.x = Math.PI * 0.5;
        lTier4Piston.position.set(-0.10, -0.07, -0.18);
        leftForearm.add(lTier4Piston);

        const lWrist = new THREE.Group();
        lWrist.position.set(0, 0, -0.44);
        leftForearm.add(lWrist);

        const lHand = buildGauntletHand(false);
        lWrist.add(lHand);

        // Mode 1: Tactical Combat Knife (heated tanto vibro-blade, drawn on RMB slash)
        const cleaverGroup = new THREE.Group();
        cleaverGroup.position.set(0.02, 0.04, -0.10);
        const knifeGrip = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.16, 0.07), matArmorDark);
        const knifeGuard = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.035, 0.13), matGunmetal);
        knifeGuard.position.set(0, 0.085, -0.02);
        const knifeSpine = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.42, 0.065), matGunmetal);
        knifeSpine.position.set(0, 0.31, -0.01);
        const cleaverEdgeMat = makeMat(texClawSteel, 0xff7733, 0xff3b00, 1.15);
        const knifeEdge = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.40, 0.038), cleaverEdgeMat);
        knifeEdge.position.set(0, 0.31, -0.055);
        const knifeTip = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.10, 0.055), cleaverEdgeMat);
        knifeTip.position.set(0, 0.53, -0.025);
        knifeTip.rotation.x = 0.42;
        cleaverGroup.add(knifeGrip, knifeGuard, knifeSpine, knifeEdge, knifeTip);
        cleaverGroup.visible = false;
        lWrist.add(cleaverGroup);

        // Mode 2: 37mm Tactical Pistol (matching slab-sided gunmetal + glowing vents)
        const pistol37Group = new THREE.Group();
        pistol37Group.position.set(0.02, 0.04, -0.12);
        const pLower = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.08, 0.34), matArmorOlive);
        pLower.position.set(0, 0.01, -0.16);
        const pSlide = new THREE.Mesh(new THREE.BoxGeometry(0.096, 0.095, 0.44), matGunmetal);
        pSlide.position.set(0, 0.085, -0.22);
        const pGrip = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.15, 0.09), matArmorDark);
        pGrip.position.set(0, -0.06, -0.02);
        pGrip.rotation.x = 0.22;
        const pistolCylinder = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.052, 0.12, 6), matSteel);
        pistolCylinder.rotation.x = Math.PI * 0.5;
        pistolCylinder.position.set(0, 0.06, -0.12);
        const pLaser = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.045, 0.16), matArmorDark);
        pLaser.position.set(0, -0.03, -0.32);
        pistol37Group.add(pLower, pSlide, pGrip, pistolCylinder, pLaser);
        for (let v = 0; v < 2; v++) {
            const pVentR = new THREE.Mesh(new THREE.BoxGeometry(0.102, 0.016, 0.026), matVentGlow);
            pVentR.position.set(0, 0.085, -0.30 - v * 0.05);
            pistol37Group.add(pVentR);
        }
        const pMuzzleFlash = new THREE.Mesh(
            new THREE.OctahedronGeometry(0.15, 0),
            new THREE.MeshBasicMaterial({ color: 0xffaa44, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, fog: false })
        );
        pMuzzleFlash.name = 'PistolMuzzleFlash';
        pMuzzleFlash.position.set(0, 0.085, -0.52);
        pMuzzleFlash.visible = false;
        pistol37Group.add(pMuzzleFlash);
        pistol37Group.visible = false;
        lWrist.add(pistol37Group);

        // Detachable magazine used by the pistol reload animation.
        const dropMag = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.38, 0.15), matHazard);
        dropMag.visible = false;
        lWrist.add(dropMag);

        // Held 155mm Artillery Shell (visible when carryingPayload)
        const payloadGroup = new THREE.Group();
        payloadGroup.position.set(0.02, 0.04, -0.22);
        payloadGroup.rotation.z = Math.PI * 0.5;
        payloadGroup.rotation.y = 0.2;
        const shellBody = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, 0.34, 8), matShell);
        const shellNose = new THREE.Mesh(new THREE.ConeGeometry(0.085, 0.14, 8), makeMat(texHazard, 0xcc4433));
        shellNose.position.y = 0.24;
        payloadGroup.add(shellBody, shellNose);
        payloadGroup.visible = false;
        lWrist.add(payloadGroup);

        // ================= RIGHT ARM: GAUNTLET + SLEEK 120MM HEAVY RAIL-ASSAULT RIFLE =================
        const rightArm = new THREE.Group();
        rightArm.position.set(0.76, -0.58, -0.70);
        rightArm.rotation.set(0.08, 0.34, -0.04);
        this.cockpitGroup.add(rightArm);

        const rShoulder = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.24, 0.34), matArmorOlive);
        rShoulder.position.set(0.10, 0.06, 0.16);
        rightArm.add(rShoulder);

        const rForearm = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 0.46), matArmorOlive);
        rForearm.position.set(0, 0, -0.20);
        rightArm.add(rForearm);

        const rForeCuff = new THREE.Mesh(new THREE.BoxGeometry(0.20, 0.14, 0.22), matGunmetal);
        rForeCuff.position.set(0, 0.03, -0.28);
        rightArm.add(rForeCuff);

        const rPiston = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.38, 6), matChrome);
        rPiston.rotation.x = Math.PI * 0.5;
        rPiston.position.set(-0.10, 0.06, -0.20);
        rightArm.add(rPiston);

        const rWrist = new THREE.Group();
        rWrist.position.set(-0.04, 0.04, -0.42);
        rightArm.add(rWrist);

        const rHand = buildGauntletHand(true);
        rWrist.add(rHand);

        // STRIDER-LX off-hand sidearm and BASTION-IX rotary minigun visuals.
        const rightPistol37Group = pistol37Group.clone(true);
        rightPistol37Group.name = 'RightPistol37';
        rightPistol37Group.position.set(-0.02, 0.04, -0.12);
        rightPistol37Group.visible = false;
        const rightMuzzleFlash = rightPistol37Group.getObjectByName('PistolMuzzleFlash');
        rWrist.add(rightPistol37Group);

        const minigunGroup = new THREE.Group();
        minigunGroup.position.set(-0.02, 0.06, -0.12);
        for (let i = 0; i < 6; i++) {
            const a = (i / 6) * Math.PI * 2;
            const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.34, 6), matGunmetal);
            barrel.rotation.x = Math.PI * 0.5;
            barrel.position.set(Math.cos(a) * 0.045, 0.05, -0.2 + Math.sin(a) * 0.045);
            minigunGroup.add(barrel);
        }
        minigunGroup.visible = false;
        lWrist.add(minigunGroup);

        // 120mm Heavy Rail-Assault Rifle Assembly (sleek slab-sided gunmetal + olive receiver + red vents)
        const rifleGroup = new THREE.Group();
        rifleGroup.position.set(-0.02, 0.06, -0.08);
        rWrist.add(rifleGroup);

        // Lower olive/charcoal receiver + angled pistol grip
        const rifleReceiver = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.13, 0.54), matArmorOlive);
        rifleReceiver.position.set(0, 0.02, -0.20);
        const rGrip = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.15, 0.10), matArmorDark);
        rGrip.position.set(0, -0.07, -0.02);
        rGrip.rotation.x = 0.26;
        rifleGroup.add(rifleReceiver, rGrip);

        // Heavy slab-sided gunmetal upper shroud + stepped top rail
        const upperShroud = new THREE.Mesh(new THREE.BoxGeometry(0.145, 0.13, 0.88), matGunmetal);
        upperShroud.position.set(0, 0.10, -0.52);
        const topRail = new THREE.Mesh(new THREE.BoxGeometry(0.095, 0.04, 0.82), matArmorDark);
        topRail.position.set(0, 0.18, -0.50);
        const opticBody = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.065, 0.14), matArmorDark);
        opticBody.position.set(0, 0.225, -0.22);
        const opticLens = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.035, 0.02), matOpticGlow);
        opticLens.position.set(0, 0.225, -0.148);
        rifleGroup.add(upperShroud, topRail, opticBody, opticLens);

        // 3 Glowing Red Cooling Vent Slits on forward shroud sides
        for (let v = 0; v < 3; v++) {
            const vent = new THREE.Mesh(new THREE.BoxGeometry(0.152, 0.018, 0.028), matVentGlow);
            vent.position.set(0, 0.10, -0.72 - v * 0.055);
            rifleGroup.add(vent);
        }

        // Exposed external gas/hydraulic tube running along both sides
        for (const side of [-1, 1]) {
            const gasTube = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.56, 6), matChrome);
            gasTube.rotation.x = Math.PI * 0.5;
            gasTube.position.set(side * 0.078, 0.04, -0.44);
            rifleGroup.add(gasTube);
        }

        // Recessed heavy muzzle block + heated inner barrel
        const muzzleFrame = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.14, 0.12), matArmorDark);
        muzzleFrame.position.set(0, 0.095, -0.96);
        const muzzleBore = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.075, 0.06), new THREE.MeshBasicMaterial({ color: 0x090a0c, fog: false }));
        muzzleBore.position.set(0, 0.095, -1.00);
        const rifleBarrelMat = makeMat(texSteelBarrel, 0xffffff, 0xff4400, 0);
        const rifleBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.034, 0.28, 8), rifleBarrelMat);
        rifleBarrel.rotation.x = Math.PI * 0.5;
        rifleBarrel.position.set(0, 0.095, -0.88);
        rifleGroup.add(muzzleFrame, muzzleBore, rifleBarrel);

        // Underbarrel tactical foregrip (where the left hand holds the rifle)
        const underForegrip = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.11, 0.16), matArmorDark);
        underForegrip.position.set(0, -0.02, -0.62);
        rifleGroup.add(underForegrip);

        // Removable 32/64-Round Angled Box Magazine (animates on R reload)
        const rifleMag = new THREE.Mesh(new THREE.BoxGeometry(0.088, 0.22, 0.125), matArmorDark);
        rifleMag.rotation.x = -0.18;
        rifleMag.position.set(0, -0.13, -0.32);
        rifleGroup.add(rifleMag);

        // Physical reciprocating bolt handle (kicks back on each shot)
        const rifleBolt = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.035, 0.12), matChrome);
        rifleBolt.position.set(0.075, 0.09, -0.22);
        rifleGroup.add(rifleBolt);

        // Tier upgrade hardware (Sleek side rail-plates & glowing DU accelerator strips)
        const rTier3Shroud = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.06, 0.42), matSteel);
        rTier3Shroud.position.set(0, 0.09, -0.66);
        rifleGroup.add(rTier3Shroud);

        const rEvolvedCoilMat = makeMat(texArmorDark, 0xffffff, 0x44ff88, 0.8);
        const rTier5Coils = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.035, 0.46), rEvolvedCoilMat);
        rTier5Coils.position.set(0, 0.13, -0.68);
        rifleGroup.add(rTier5Coils);

        // 3D Muzzle Flash Star at recessed muzzle
        const muzzleFlashGroup = new THREE.Group();
        muzzleFlashGroup.position.set(0, 0.095, -1.10);
        const flashMat = new THREE.MeshBasicMaterial({
            color: 0xffcc55,
            transparent: true,
            opacity: 0.9,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            fog: false
        });
        const flashStar1 = new THREE.Mesh(new THREE.OctahedronGeometry(0.20, 0), flashMat);
        flashStar1.scale.set(1.3, 0.45, 1.9);
        const flashStar2 = new THREE.Mesh(new THREE.OctahedronGeometry(0.18, 0), flashMat);
        flashStar2.scale.set(0.45, 1.3, 1.9);
        muzzleFlashGroup.add(flashStar1, flashStar2);
        muzzleFlashGroup.visible = false;
        rifleGroup.add(muzzleFlashGroup);

        // Secondary inertia physics state
        this.armInertiaYaw = 0;
        this.armInertiaPitch = 0;
        this.armSlamBounceY = 0;
        this.prevFacingAngle = null;

        this.cockpitArms3D = {
            leftArm,
            leftForearm,
            lWrist,
            cleaverGroup,
            cleaverEdgeMat,
            pistol37Group,
            pSlide,
            dropMag,
            rightPistol37Group,
            minigunGroup,
            pistolCylinder,
            pMuzzleFlash,
            rightMuzzleFlash,
            lTier2Plate,
            lTier4Piston,
            payloadGroup,
            rightArm,
            rWrist,
            rifleGroup,
            rifleMag,
            rifleBolt,
            rifleBarrelMat,
            rTier3Shroud,
            rTier5Coils,
            rEvolvedCoilMat,
            muzzleFlashGroup,
            flashMat
        };
    }

    updateCockpitArms3D(game, dt, timeSec) {
        if (!this.cockpitGroup) return;
        const p = game && game.player;
        const active = !!(p && (game.state === 'PLAYING' || game.state === 'LEVELUP'));
        this.cockpitGroup.visible = active && !this.thirdPersonMode;
        if (this.canopyGroup) this.canopyGroup.visible = active && !this.thirdPersonMode;
        if (!active || this.thirdPersonMode || !this.cockpitArms3D) return;

        const a = this.cockpitArms3D;
        // Chassis loadout visibility: Strider = dual pistols, Vanguard = rifle/pistol,
        // Bastion = autocannon + rotary minigun (no knife).
        if (a.rifleGroup) a.rifleGroup.visible = !!p.hasPrimary;
        if (a.rightPistol37Group) a.rightPistol37Group.visible = !!p.dualPistols && !p.carryingPayload;
        if (a.minigunGroup) a.minigunGroup.visible = !!p.hasMinigun;

        // Pistol reload choreography: magazine drops, fresh mag rises, slide racks back.
        const reloadPhase = p.pistolReloading
            ? Math.max(0, Math.min(1, 1 - (p.pistolReloadTimer || 0) / 1.0))
            : 0;
        if (a.dropMag) {
            const dropping = reloadPhase < 0.45;
            const rising = reloadPhase >= 0.55 && reloadPhase < 0.92;
            a.dropMag.visible = !!p.pistolReloading && !p.carryingPayload && (dropping || rising);
            if (a.dropMag.visible) {
                const t = dropping ? reloadPhase / 0.45 : (reloadPhase - 0.55) / 0.37;
                a.dropMag.position.set(0, dropping ? -0.10 - t * 0.55 : -0.65 + t * 0.55, -0.12 + (dropping ? t * 0.18 : 0));
                a.dropMag.rotation.z = dropping ? t * 1.3 : (1 - t) * 1.3;
            }
        }
        if (a.pSlide) {
            const rack = p.pistolReloading ? Math.sin(reloadPhase * Math.PI) : 0;
            a.pSlide.position.z = -0.22 - rack * 0.11;
        }
        const isMoving = Math.hypot(p.vx || 0, p.vy || 0) > 25;
        const bob = isMoving ? Math.sin(this.walkBobPhase || 0) : 0;
        const bobX = (isMoving ? Math.cos(this.walkBobPhase || 0) : 0) * 0.018;
        const bobY = Math.abs(bob) * 0.025;
        const swayX = (this.cockpitSwayX || 0) * 0.0022;
        const swayY = (this.cockpitSwayY || 0) * 0.0022;
        const stompDip = (this.stompDip || 0) * 0.003;

        // Secondary Wrist/Arm Inertia Physics (lags torso turns & bounces on footstep slams)
        if (this.prevFacingAngle === null) this.prevFacingAngle = p.facingAngle || 0;
        const angDelta = Math.atan2(
            Math.sin((p.facingAngle || 0) - this.prevFacingAngle),
            Math.cos((p.facingAngle || 0) - this.prevFacingAngle)
        );
        this.prevFacingAngle = p.facingAngle || 0;
        const safeDt = Math.min(0.05, dt || 0.016);
        const targetYaw = Math.max(-0.18, Math.min(0.18, -angDelta * 1.4));
        this.armInertiaYaw += (targetYaw - this.armInertiaYaw) * Math.min(1, safeDt * 12);
        const slamImp = (this.stepJoltY || 0) * 0.14;
        this.armSlamBounceY += (slamImp - this.armSlamBounceY) * Math.min(1, safeDt * 14);

        // ---- Right Arm (120mm Heavy Rail-Assault Rifle + Magazine Reload) ----
        const weapon = p.weapons && (p.weapons.getWeapon('depleted_uranium_rotary') || p.weapons.getWeapon('autocannon'));
        const heat = weapon ? Math.max(0, Math.min(1, weapon.heat || 0)) : 0;
        const isEvolved = !!(p.weapons && p.weapons.hasWeapon('depleted_uranium_rotary'));
        const rTier = (p.hardpoints && p.hardpoints.rightArm) ? (p.hardpoints.rightArm.visualTier || 1) : (isEvolved ? 6 : 1);
        const isReloading = !!(weapon && weapon.isReloading);
        const reloadProg = isReloading ? (1 - Math.max(0, weapon.reloadTimer || 0) / Math.max(0.1, weapon.reloadDuration || 1.35)) : 0;
        const firingNow = !isReloading && !!game.isPrimaryFiring && weapon && !weapon.isVenting && (weapon.timeSinceLastShot || 99) < 0.12;
        const recoil = (this.recoilOffset || 0) * 0.016;

        const adsBlend = p.adsBlend || 0;
        const secMode = p.secondaryMode || 'cleaver';
        const isPistolActive = (p.activeHandheld === 'pistol37');
        const pistolDrawn = !p.carryingPayload && (isPistolActive || secMode === 'pistol37' || (p.pistolFireAnim || 0) > 0 || !!p.pistolReloading);
        const reloadTiltZ = isReloading ? Math.sin(reloadProg * Math.PI) * 0.36 : 0;
        const reloadLiftY = isReloading ? Math.sin(reloadProg * Math.PI) * 0.06 : 0;

        // Smoothly brace the 120mm rifle toward lower-center viewport as adsBlend -> 1.0
        const rBaseX = pistolDrawn ? 0.92 : (0.76 - adsBlend * 0.36);
        const rBaseY = pistolDrawn ? -0.88 : (-0.58 + adsBlend * 0.14);
        const rBaseZ = pistolDrawn ? -0.80 : (-0.70 + adsBlend * 0.08);
        const rBaseRotY = pistolDrawn ? 0.24 : (0.34 - adsBlend * 0.20);
        const swayScale = 1 - adsBlend * 0.55;
        a.rightArm.position.set(
            rBaseX + (bobX + swayX) * swayScale + this.armInertiaYaw * 0.25 * swayScale,
            rBaseY - (bobY + stompDip) * swayScale - this.armSlamBounceY * swayScale + swayY * swayScale + reloadLiftY,
            rBaseZ + recoil * 0.75
        );
        a.rightArm.rotation.set(
            0.08 + recoil * 0.20 + (isReloading ? 0.16 : 0) - adsBlend * 0.04,
            rBaseRotY + this.armInertiaYaw * 0.65 * swayScale,
            -0.04 + reloadTiltZ
        );

        // Box magazine eject & slam-in animation during R reload
        if (isReloading) {
            if (reloadProg < 0.45) {
                const dropP = reloadProg / 0.45;
                a.rifleMag.position.y = -0.13 - dropP * 0.45;
                a.rifleMag.visible = dropP < 0.85;
            } else {
                const insertP = Math.min(1, (reloadProg - 0.45) / 0.45);
                a.rifleMag.visible = true;
                a.rifleMag.position.y = -0.52 + insertP * 0.39;
            }
        } else {
            a.rifleMag.visible = true;
            a.rifleMag.position.y = -0.13;
        }

        if (heat > 0.08) {
            a.rifleBarrelMat.emissive.setRGB(1.0, 0.28 + heat * 0.35, heat * 0.12);
            a.rifleBarrelMat.emissiveIntensity = heat * (weapon && weapon.isVenting ? 2.0 : 1.1);
        } else {
            a.rifleBarrelMat.emissiveIntensity = 0;
        }

        a.rTier3Shroud.visible = rTier >= 3;
        a.rTier5Coils.visible = rTier >= 5 || isEvolved;
        a.rEvolvedCoilMat.emissive.setHex(isEvolved ? 0x44ff88 : 0xffaa22);
        a.rEvolvedCoilMat.emissiveIntensity = isEvolved ? 1.1 : 0.45;

        if (firingNow && (weapon.timeSinceLastShot || 99) < 0.055) {
            a.muzzleFlashGroup.visible = true;
            const s = 0.8 + Math.random() * 0.55;
            a.muzzleFlashGroup.scale.set(s, s, s * 1.2);
            a.muzzleFlashGroup.rotation.z = Math.random() * Math.PI * 2;
            a.flashMat.color.setHex(isEvolved ? 0x88ffaa : 0xffcc55);
        } else {
            a.muzzleFlashGroup.visible = false;
        }
        if (a.rifleBolt) {
            const boltKick = (weapon && (weapon.timeSinceLastShot || 99) < 0.08) ? (1 - weapon.timeSinceLastShot / 0.08) * 0.14 : 0;
            a.rifleBolt.position.z = -0.22 + boltKick;
        }
        if (this.muzzleLight && this.muzzleLight.intensity > 0.01) {
            this.muzzleLight.intensity = Math.max(0, this.muzzleLight.intensity - safeDt * 34.0);
        }

        // ---- Left Arm (Two-Handed Rifle Foregrip / Combat Knife / 37mm Pistol / Payload) ----
        const slashT = (p.cleaverSlashAnim || 0) > 0 ? (1 - p.cleaverSlashAnim / 0.35) : 0;
        const slashSwing = (p.cleaverSlashAnim || 0) > 0 ? Math.sin(slashT * Math.PI) : 0;
        const pFire = (p.pistolFireAnim || 0) > 0 ? (p.pistolFireAnim / 0.25) : 0;

        const isSlashing = !p.carryingPayload && slashSwing > 0.02;
        a.cleaverGroup.visible = isSlashing;
        a.pistol37Group.visible = pistolDrawn && !isSlashing;
        a.payloadGroup.visible = !!p.carryingPayload;

        if (isSlashing) {
            // Whip out Tactical Combat Knife in a fast diagonal slash
            a.leftArm.position.set(
                -0.62 + slashSwing * 0.85 + bobX + swayX,
                -0.54 + slashSwing * 0.26 - bobY - this.armSlamBounceY + swayY,
                -0.80 - slashSwing * 0.38
            );
            a.leftArm.rotation.set(
                0.15 - slashSwing * 0.48,
                -0.22 + slashSwing * 1.05,
                0.22 - slashSwing * 1.30
            );
            a.cleaverEdgeMat.emissiveIntensity = 1.9;
        } else if (pistolDrawn) {
            // Mode 2: 37mm Tactical Pistol centered & braced in ADS
            const pReloadDip = p.pistolReloading ? Math.sin((1 - (p.pistolReloadTimer || 0)) * Math.PI) * 0.35 : 0;
            a.leftArm.position.set(
                (-0.42 + adsBlend * 0.38) + (bobX + swayX) * swayScale + this.armInertiaYaw * 0.22 * swayScale,
                (-0.50 + adsBlend * 0.13) - (bobY + this.armSlamBounceY) * swayScale + swayY * swayScale - pReloadDip,
                (-0.84 + adsBlend * 0.06) + pFire * 0.14
            );
            a.leftArm.rotation.set(
                0.06 + pFire * 0.32 - pReloadDip - adsBlend * 0.04,
                (-0.14 + adsBlend * 0.14) + this.armInertiaYaw * 0.55 * swayScale,
                0.04
            );
            a.pistolCylinder.rotation.z = (p.pistolAmmo || 0) * (Math.PI / 3);
            const rightShot = p.lastPistolHand === 'right';
            a.pMuzzleFlash.visible = pFire > 0.72 && !rightShot;
            if (a.rightMuzzleFlash) a.rightMuzzleFlash.visible = pFire > 0.72 && rightShot;
        } else if (p.carryingPayload) {
            // Carrying 155mm artillery shell
            a.leftArm.position.set(
                -0.90 + bobX + swayX + this.armInertiaYaw * 0.25,
                -0.62 - bobY - stompDip - this.armSlamBounceY + swayY,
                -0.78
            );
            a.leftArm.rotation.set(0.14, -0.24 + this.armInertiaYaw * 0.55, 0.06);
        } else {
            // Default Two-Handed Rifle Stance: Left gauntlet clasps forward barrel shroud in ADS
            const reloadPull = isReloading ? Math.sin(reloadProg * Math.PI) * 0.12 : 0;
            a.leftArm.position.set(
                (-0.32 + adsBlend * 0.16) + (bobX + swayX) * swayScale + this.armInertiaYaw * 0.25 * swayScale - reloadPull * 0.5,
                (-0.56 + adsBlend * 0.12) - (bobY + stompDip + this.armSlamBounceY) * swayScale + swayY * swayScale - reloadPull * 0.3,
                (-0.88 + adsBlend * 0.06) + recoil * 0.65 + reloadPull * 0.4
            );
            a.leftArm.rotation.set(
                0.10 + recoil * 0.18 + (isReloading ? 0.12 : 0) - adsBlend * 0.03,
                (-0.74 + adsBlend * 0.22) + this.armInertiaYaw * 0.60 * swayScale + reloadPull * 0.4,
                0.08
            );
        }

        const lTier = (p.hardpoints && p.hardpoints.leftArm) ? (p.hardpoints.leftArm.visualTier || 1) : 1;
        a.lTier2Plate.visible = lTier >= 2;
        a.lTier4Piston.visible = lTier >= 4;
    }

    syncMissionObjects3D(game, timeSec) {
        if (!this.missionGroup || !game) return;

        // 1) Animate HQ CIWS Roof Turrets & Beacon Ring
        if (this.hqGroup && this.hqGroup.userData) {
            const { ciwsL, ciwsR, guideBeam } = this.hqGroup.userData;
            if (ciwsL) ciwsL.rotation.y = Math.sin(timeSec * 0.9) * 0.7;
            if (ciwsR) ciwsR.rotation.y = -Math.sin(timeSec * 0.9) * 0.7;
            if (guideBeam && guideBeam.material) {
                guideBeam.material.opacity = 0.22 + Math.sin(timeSec * 2.5) * 0.06;
            }
        }

        // 2) Sync 3 Forward Outposts (bunker, rotatable dish, refit ring & fog-piercing guide-beam)
        if (Array.isArray(game.outposts)) {
            for (const op of game.outposts) {
                let entry = this.outpostMeshes.get(op.id);
                const wx = op.x * this.SCALE;
                const wz = op.y * this.SCALE;
                if (!entry) {
                    const grp = new THREE.Group();
                    const gy = this.getTerrainHeight(wx, wz);
                    grp.position.set(wx, gy, wz);
                    if (Array.isArray(this.canyonObstacles)) {
                        this.canyonObstacles.push({ x: op.x, y: op.y, radius: 34, type: 'bunker' });
                    }

                    const matBase = new THREE.MeshLambertMaterial({ color: 0x3b4048, flatShading: true });
                    const matDark = new THREE.MeshLambertMaterial({ color: 0x1e2229, flatShading: true });
                    const matTrim = new THREE.MeshLambertMaterial({ color: 0x626b75, flatShading: true });

                    // Grounded foundation plinth (sunk -0.8m into terrain so edges never float)
                    const plinth = new THREE.Mesh(new THREE.BoxGeometry(6.8, 1.6, 6.8), matDark);
                    plinth.position.set(0, 0.0, 0);

                    // Main reinforced command bunker + sloped roof cap
                    const bunker = new THREE.Mesh(new THREE.BoxGeometry(4.8, 2.8, 4.8), matBase);
                    bunker.position.set(0, 1.8, 0);
                    const roofCap = new THREE.Mesh(new THREE.BoxGeometry(5.4, 0.55, 5.4), matTrim);
                    roofCap.position.set(0, 3.35, 0);

                    // 4 Corner armor buttresses
                    for (const sx of [-1, 1]) {
                        for (const sz of [-1, 1]) {
                            const buttress = new THREE.Mesh(new THREE.BoxGeometry(1.1, 2.6, 1.1), matDark);
                            buttress.position.set(sx * 2.35, 1.7, sz * 2.35);
                            grp.add(buttress);
                        }
                    }

                    // Glowing terminal console slit on front & back
                    const termMat = new THREE.MeshBasicMaterial({ color: 0xffaa33 });
                    const termSlit = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.45, 5.05), termMat);
                    termSlit.position.set(0, 1.85, 0);

                    // Detailed Rotating Phased-Array Radar / Uplink Dish
                    const dishGroup = new THREE.Group();
                    dishGroup.position.set(0, 3.65, 0);
                    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.48, 1.8, 6), matTrim);
                    mast.position.set(0, 0.8, 0);
                    const dishFrame = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.9, 0.35), matBase);
                    dishFrame.position.set(0, 1.85, 0);
                    dishFrame.rotation.x = -0.25;
                    const dish = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.35, 0.42), new THREE.MeshBasicMaterial({ color: 0xffaa33 }));
                    dish.position.set(0, 1.85, 0);
                    dish.rotation.x = -0.25;
                    dishGroup.add(mast, dishFrame, dish);

                    // Capture perimeter ring + 4 corner beacon pylons
                    const ringMat = new THREE.MeshBasicMaterial({ color: 0xffaa33, transparent: true, opacity: 0.72, side: THREE.DoubleSide });
                    const ring = new THREE.Mesh(new THREE.RingGeometry(12.0, 13.0, 36), ringMat);
                    ring.rotation.x = -Math.PI / 2;
                    ring.position.set(0, 0.25, 0);

                    const pylonTips = [];
                    for (let k = 0; k < 4; k++) {
                        const ang = (k / 4) * Math.PI * 2 + Math.PI / 4;
                        const px = Math.cos(ang) * 12.5;
                        const pz = Math.sin(ang) * 12.5;
                        const pyLocal = this.getTerrainHeight(wx + px, wz + pz) - gy;
                        const pBase = new THREE.Mesh(new THREE.BoxGeometry(0.65, 2.2, 0.65), matDark);
                        pBase.position.set(px, pyLocal + 0.6, pz);
                        const pTip = new THREE.Mesh(new THREE.OctahedronGeometry(0.42, 0), new THREE.MeshBasicMaterial({ color: 0xffaa33 }));
                        pTip.position.set(px, pyLocal + 2.0, pz);
                        grp.add(pBase, pTip);
                        pylonTips.push(pTip);
                    }

                    // Fog-piercing orbital guide beam + rising pulse halo
                    const beamMat = new THREE.MeshBasicMaterial({
                        color: 0xffaa33,
                        transparent: true,
                        opacity: 0.28,
                        fog: false,
                        depthWrite: false,
                        blending: THREE.AdditiveBlending
                    });
                    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.55, 140, 10), beamMat);
                    beam.position.set(0, 70, 0);

                    const haloMat = new THREE.MeshBasicMaterial({
                        color: 0xffaa33,
                        transparent: true,
                        opacity: 0.65,
                        fog: false,
                        side: THREE.DoubleSide,
                        blending: THREE.AdditiveBlending
                    });
                    const beaconHalo = new THREE.Mesh(new THREE.RingGeometry(1.4, 2.0, 20), haloMat);
                    beaconHalo.rotation.x = -Math.PI / 2;
                    beaconHalo.position.set(0, 5.0, 0);

                    const relayMeshes = [];
                    if (Array.isArray(op.relays) && op.relays.length > 0) {
                        for (const rel of op.relays) {
                            const rGrp = new THREE.Group();
                            const rx = (rel.x - op.x) * this.SCALE;
                            const rz = (rel.y - op.y) * this.SCALE;
                            const ryLocal = this.getTerrainHeight(rel.x * this.SCALE, rel.y * this.SCALE) - gy;
                            rGrp.position.set(rx, ryLocal, rz);
                            const rCol = new THREE.Mesh(new THREE.BoxGeometry(1.1, 3.6, 1.1), matDark);
                            rCol.position.set(0, 1.8, 0);
                            const rCore = new THREE.Mesh(new THREE.OctahedronGeometry(0.95, 0), new THREE.MeshBasicMaterial({ color: 0xd966ff }));
                            rCore.position.set(0, 4.3, 0);
                            rGrp.add(rCol, rCore);
                            grp.add(rGrp);
                            relayMeshes.push({ rel, rGrp, rCore });
                        }
                    }

                    grp.add(plinth, bunker, roofCap, termSlit, dishGroup, ring, beam, beaconHalo);
                    this.missionGroup.add(grp);
                    entry = { grp, dishGroup, dish, termMat, ringMat, beamMat, haloMat, beaconHalo, pylonTips, relayMeshes };
                    this.outpostMeshes.set(op.id, entry);
                }

                if (Array.isArray(entry.relayMeshes)) {
                    for (const rm of entry.relayMeshes) {
                        rm.rGrp.visible = !rm.rel.destroyed;
                        if (rm.rCore) rm.rCore.rotation.y = timeSec * 2.4;
                    }
                }

                const stateCol = op.liberated ? 0x48ee58 : (op.codeUnlocked ? 0x38f2ff : 0xffaa33);
                entry.ringMat.color.setHex(stateCol);
                entry.beamMat.color.setHex(stateCol);
                entry.haloMat.color.setHex(stateCol);
                entry.termMat.color.setHex(stateCol);
                entry.dish.material.color.setHex(stateCol);
                if (entry.pylonTips) {
                    for (const pt of entry.pylonTips) pt.material.color.setHex(stateCol);
                }
                if (entry.beaconHalo) {
                    const pulseT = (timeSec * 0.85) % 1;
                    entry.beaconHalo.position.y = 4.5 + pulseT * 26;
                    const s = 1 + pulseT * 1.4;
                    entry.beaconHalo.scale.set(s, s, 1);
                    entry.haloMat.opacity = (1 - pulseT) * 0.65;
                }
                entry.dishGroup.rotation.y = -(op.currentDishAngle || 0);
            }
        }

        // 3) Sync Uncollected 155mm Artillery Shells
        if (Array.isArray(game.artilleryShells)) {
            for (const sh of game.artilleryShells) {
                let mesh = this.shellMeshes.get(sh.id);
                if (!mesh) {
                    const grp = new THREE.Group();
                    const casing = new THREE.Mesh(
                        new THREE.CylinderGeometry(0.28, 0.32, 1.5, 8),
                        new THREE.MeshBasicMaterial({ color: 0xffaa22 })
                    );
                    casing.rotation.z = Math.PI / 2.6;
                    casing.position.y = 0.6;
                    const ring = new THREE.Mesh(
                        new THREE.RingGeometry(1.4, 1.8, 16),
                        new THREE.MeshBasicMaterial({ color: 0xffdd55, transparent: true, opacity: 0.75, side: THREE.DoubleSide })
                    );
                    ring.rotation.x = -Math.PI / 2;
                    ring.position.y = 0.16;
                    grp.add(casing, ring);
                    this.missionGroup.add(grp);
                    mesh = grp;
                    this.shellMeshes.set(sh.id, mesh);
                }
                mesh.visible = !sh.collected && !sh.loaded;
                if (mesh.visible) {
                    const sx = sh.x * this.SCALE;
                    const sz = sh.y * this.SCALE;
                    mesh.position.set(sx, this.getTerrainHeight(sx, sz), sz);
                    mesh.rotation.y = timeSec * 1.4;
                }
            }
        }

        // 4) Sync Sub-Surface Nest Hellbombs (with 40m blast radius ring)
        if (Array.isArray(game.hellbombNests)) {
            for (const hb of game.hellbombNests) {
                let entry = this.hellbombMeshes.get(hb.id);
                if (!entry) {
                    const grp = new THREE.Group();
                    const body = new THREE.Mesh(
                        new THREE.CylinderGeometry(0.6, 0.85, 2.2, 8),
                        new THREE.MeshLambertMaterial({ color: 0x353b42 })
                    );
                    body.position.y = 1.1;
                    const lamp = new THREE.Mesh(
                        new THREE.BoxGeometry(0.45, 0.45, 0.45),
                        new THREE.MeshBasicMaterial({ color: 0xff4422 })
                    );
                    lamp.position.y = 2.4;
                    const blastRing = new THREE.Mesh(
                        new THREE.RingGeometry(39.0, 40.0, 48),
                        new THREE.MeshBasicMaterial({ color: 0xff3822, transparent: true, opacity: 0.55, side: THREE.DoubleSide })
                    );
                    blastRing.rotation.x = -Math.PI / 2;
                    blastRing.position.y = 0.2;
                    grp.add(body, lamp, blastRing);
                    this.missionGroup.add(grp);
                    entry = { grp, lamp, blastRing };
                    this.hellbombMeshes.set(hb.id, entry);
                }
                entry.grp.visible = !hb.detonated;
                if (!hb.detonated) {
                    const hx = hb.x * this.SCALE;
                    const hz = hb.y * this.SCALE;
                    entry.grp.position.set(hx, this.getTerrainHeight(hx, hz), hz);
                    entry.blastRing.visible = !!hb.armed;
                    if (hb.armed) {
                        const pulse = 0.5 + 0.5 * Math.sin(timeSec * 14);
                        entry.lamp.material.color.setHex(pulse > 0.5 ? 0xff2200 : 0xffff66);
                        entry.blastRing.material.opacity = 0.35 + pulse * 0.45;
                    }
                }
            }
        }

        // 5) Sync Crashed Salvage Pods
        if (Array.isArray(game.salvagePods)) {
            for (const pod of game.salvagePods) {
                let mesh = this.podMeshes.get(pod.id);
                if (!mesh) {
                    const grp = new THREE.Group();
                    const hull = new THREE.Mesh(
                        new THREE.BoxGeometry(1.8, 2.6, 1.8),
                        new THREE.MeshLambertMaterial({ color: 0x3b444f })
                    );
                    hull.position.y = 1.2;
                    hull.rotation.set(0.25, 0.4, -0.2);
                    const beacon = new THREE.Mesh(
                        new THREE.BoxGeometry(0.4, 0.4, 0.4),
                        new THREE.MeshBasicMaterial({ color: 0xffdd44 })
                    );
                    beacon.position.y = 2.8;
                    grp.add(hull, beacon);
                    this.missionGroup.add(grp);
                    mesh = grp;
                    this.podMeshes.set(pod.id, mesh);
                }
                mesh.visible = !pod.breached;
                if (mesh.visible) {
                    const px = pod.x * this.SCALE;
                    const pz = pod.y * this.SCALE;
                    mesh.position.set(px, this.getTerrainHeight(px, pz), pz);
                }
            }
        }

        // 6) Sync Extraction Pad, Sky Beacon, Dropship & Boarding Ramp at North LZ
        const ext = game.extractionState;
        if (ext && (ext.phase === 'BEACON_READY' || ext.phase === 'HOLDOUT' || ext.phase === 'BOARDING')) {
            const bx = (ext.beaconX || 1700) * this.SCALE;
            const bz = (ext.beaconY || 420) * this.SCALE;
            const bgy = this.getTerrainHeight(bx, bz);
            if (!this.extractionPadGroup) {
                const padGrp = new THREE.Group();
                const padBase = new THREE.Mesh(
                    new THREE.CylinderGeometry(11.5, 12.2, 0.45, 24),
                    new THREE.MeshLambertMaterial({ color: 0x1e2833 })
                );
                padBase.position.y = 0.2;
                const padRing = new THREE.Mesh(
                    new THREE.RingGeometry(11.8, 13.2, 36),
                    new THREE.MeshBasicMaterial({ color: 0x00ffcc, transparent: true, opacity: 0.82, side: THREE.DoubleSide })
                );
                padRing.rotation.x = -Math.PI / 2;
                padRing.position.y = 0.48;
                const skyBeam = new THREE.Mesh(
                    new THREE.CylinderGeometry(0.65, 1.05, 180, 12),
                    new THREE.MeshBasicMaterial({ color: 0x00ffcc, transparent: true, opacity: 0.34, fog: false, depthWrite: false, blending: THREE.AdditiveBlending })
                );
                skyBeam.position.y = 90;
                padGrp.add(padBase, padRing, skyBeam);
                padGrp.userData = { padRing, skyBeam };
                this.missionGroup.add(padGrp);
                this.extractionPadGroup = padGrp;
            }
            this.extractionPadGroup.visible = true;
            this.extractionPadGroup.position.set(bx, bgy, bz);
            if (this.extractionPadGroup.userData.padRing) {
                const pulse = 1 + Math.sin(timeSec * 5) * 0.05;
                this.extractionPadGroup.userData.padRing.scale.set(pulse, pulse, 1);
            }

            if (!this.dropshipMesh) {
                const ship = new THREE.Group();
                const hull = new THREE.Mesh(
                    new THREE.BoxGeometry(8.5, 4.2, 13.5),
                    new THREE.MeshLambertMaterial({ color: 0x262d36 })
                );
                hull.position.y = 2.6;
                const ramp = new THREE.Mesh(
                    new THREE.BoxGeometry(5.2, 0.4, 7.2),
                    new THREE.MeshBasicMaterial({ color: 0x38f2ff, transparent: true, opacity: 0.75 })
                );
                ramp.position.set(0, 0.25, 8.2);
                const beam = new THREE.Mesh(
                    new THREE.CylinderGeometry(0.5, 0.5, 160, 12),
                    new THREE.MeshBasicMaterial({ color: 0x48ee58, transparent: true, opacity: 0.30, fog: false, depthWrite: false })
                );
                beam.position.set(0, 80, 7.0);
                ship.add(hull, ramp, beam);
                ship.userData = { ramp };
                this.missionGroup.add(ship);
                this.dropshipMesh = ship;
            }
            const sx = (ext.shipX || bx / this.SCALE) * this.SCALE;
            const sz = (ext.shipY || bz / this.SCALE) * this.SCALE;
            const gy = this.getTerrainHeight(sx, sz);
            if (ext.phase === 'HOLDOUT') {
                const holdMax = Math.max(1, (window.GAME_CONFIG.PLAYER && window.GAME_CONFIG.PLAYER.EXTRACTION_HOLDOUT_SECONDS) || 20);
                const prog = 1 - Math.max(0, Math.min(1, (ext.holdoutTimer || holdMax) / holdMax));
                this.dropshipMesh.visible = true;
                this.dropshipMesh.position.set(sx, gy + 38 * (1 - prog) + 4, sz);
                if (this.dropshipMesh.userData.ramp) this.dropshipMesh.userData.ramp.visible = false;
            } else if (ext.phase === 'BOARDING') {
                this.dropshipMesh.visible = true;
                this.dropshipMesh.position.set(sx, gy + 0.2, sz);
                if (this.dropshipMesh.userData.ramp) {
                    this.dropshipMesh.userData.ramp.visible = true;
                }
            } else {
                this.dropshipMesh.visible = false;
            }
        } else {
            if (this.dropshipMesh) this.dropshipMesh.visible = false;
            if (this.extractionPadGroup) this.extractionPadGroup.visible = false;
        }

        // 7) Sync Shootable Volatile Fuel Drums & Pressurized Coolant Tanks
        if (Array.isArray(game.hazards)) {
            for (const hz of game.hazards) {
                let hm = this.hazardMeshes.get(hz.id);
                if (!hm) {
                    const grp = new THREE.Group();
                    const isCoolant = hz.type === 'coolant_tank';
                    const bodyMat = new THREE.MeshLambertMaterial({ color: isCoolant ? 0x227799 : 0xaa2218, flatShading: true });
                    const bandMat = new THREE.MeshBasicMaterial({ color: isCoolant ? 0x38f2ff : 0xffaa22 });
                    const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.65, 0.65, 1.7, 10), bodyMat);
                    drum.position.y = 0.85;
                    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.68, 0.68, 0.25, 10), bandMat);
                    band.position.y = 1.15;
                    const hx = hz.x * this.SCALE;
                    const hzPos = hz.y * this.SCALE;
                    grp.position.set(hx, this.getTerrainHeight(hx, hzPos) - 0.1, hzPos);
                    grp.add(drum, band);
                    this.missionGroup.add(grp);
                    hm = grp;
                    this.hazardMeshes.set(hz.id, hm);
                }
                hm.visible = !hz.detonated;
            }
        }
    }

    renderMenu(timeSec) {
        // Infinite flyover gliding over rolling grimdark ash dunes & monoliths
        const wx = 180 + timeSec * 7.5;
        const wz = 180 + Math.sin(timeSec * 0.15) * 45;

        this.updateInfiniteTerrain(wx, wz);
        this.updateInfiniteChunks(wx, wz);
        this.updateCrashBeacon(timeSec);

        const gy = this.getTerrainHeight(wx, wz);
        this.camera.position.set(wx, gy + 5.2, wz);
        const lookWx = wx + 24;
        const lookWz = wz + Math.cos(timeSec * 0.15) * 8;
        this.camera.lookAt(lookWx, this.getTerrainHeight(lookWx, lookWz) + 1.8, lookWz);

        if (this.thermalActive) {
            this.thermalActive = false;
            this.scene.fog.color.copy(this.baseFogColor);
            this.scene.background.copy(this.baseFogColor);
            this.scene.fog.density = this.baseFogDensity;
        }
        if (this.skyDome) {
            this.skyDome.visible = true;
            this.skyDome.position.copy(this.camera.position);
        }
        if (this.dustPoints) {
            this.dustPoints.position.set(this.camera.position.x, gy - 0.8, this.camera.position.z);
            this.dustPoints.rotation.y = timeSec * 0.22;
        }
        if (this.emberPoints) {
            this.emberPoints.position.set(this.camera.position.x, gy - 0.5, this.camera.position.z);
            this.emberPoints.rotation.y = -timeSec * 0.08;
        }
        this.renderer.render(this.scene, this.camera);
    }

    // Reusable offscreen-canvas PBR maps: recessed seams, rivets, louvers, wear,
    // plus hazard chevrons and stencil decals for armor and weapon housings.
    createMechSurfaceTextures() {
        if (this._mechSurfaceTextures) return this._mechSurfaceTextures;
        const make = (draw) => {
            const c = document.createElement('canvas');
            c.width = 256; c.height = 256;
            const g = c.getContext('2d');
            draw(g, 256);
            const t = new THREE.CanvasTexture(c);
            t.wrapS = THREE.RepeatWrapping;
            t.wrapT = THREE.RepeatWrapping;
            t.anisotropy = 2;
            return t;
        };
        const bump = make((g, s) => {
            g.fillStyle = '#8c8c8c';
            g.fillRect(0, 0, s, s);
            g.strokeStyle = '#333333';
            g.lineWidth = 4;
            g.strokeRect(6, 6, s - 12, s - 12);
            g.lineWidth = 3;
            g.strokeRect(16, 16, s * 0.46, s * 0.42);
            g.strokeRect(s * 0.54, 16, s * 0.32, s * 0.42);
            g.strokeRect(16, s * 0.62, s - 32, s * 0.26);
            g.fillStyle = '#e6e6e6';
            for (const x of [10, s - 14]) {
                for (const y of [10, 54, 150, s - 14]) {
                    g.beginPath(); g.arc(x, y, 2.6, 0, Math.PI * 2); g.fill();
                }
            }
            g.fillStyle = '#4a4a4a';
            for (let i = 0; i < 9; i++) g.fillRect(24 + i * 22, s * 0.68, 14, 5);
            g.strokeStyle = 'rgba(240,240,240,0.75)';
            g.lineWidth = 1;
            for (let i = 0; i < 26; i++) {
                const x = (i * 97) % s, y = (i * 61) % s;
                g.beginPath(); g.moveTo(x, y); g.lineTo(x + 9 + (i % 5), y + 1); g.stroke();
            }
        });
        const roughness = make((g, s) => {
            g.fillStyle = '#a8a8a8';
            g.fillRect(0, 0, s, s);
            g.fillStyle = '#5a5a5a';
            g.fillRect(0, s * 0.62, s, s * 0.28);
            g.fillStyle = '#d0d0d0';
            for (let i = 0; i < 9; i++) g.fillRect(24 + i * 22, s * 0.68, 14, 5);
            g.strokeStyle = '#606060'; g.lineWidth = 3;
            g.strokeRect(16, 16, s * 0.46, s * 0.42);
            g.strokeRect(s * 0.54, 16, s * 0.32, s * 0.42);
            for (let i = 0; i < 320; i++) {
                const x = (i * 73) % s, y = (i * 41) % s;
                g.fillStyle = i % 2 ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.14)';
                g.fillRect(x, y, 3, 2);
            }
        });
        const hazard = make((g, s) => {
            g.fillStyle = '#141618';
            g.fillRect(0, 0, s, s);
            g.fillStyle = '#d8a12a';
            for (let x = -s; x < s * 2; x += 42) {
                g.beginPath();
                g.moveTo(x, 0); g.lineTo(x + 20, 0);
                g.lineTo(x + 20 + s, s); g.lineTo(x + s, s);
                g.closePath(); g.fill();
            }
            g.fillStyle = 'rgba(8,10,12,0.78)';
            g.fillRect(8, s * 0.42, s - 16, 58);
            g.font = 'bold 24px monospace';
            g.fillStyle = '#e8f4ff';
            g.fillText('DANGER // EXHAUST', 14, s * 0.42 + 26);
            g.font = 'bold 18px monospace';
            g.fillText('01  UNSC-OP', 14, s * 0.42 + 50);
        });
        this._mechSurfaceTextures = { bump, roughness, hazard };
        return this._mechSurfaceTextures;
    }

    // Resolve the active chassis profile for procedural mech construction.
    getChassisProfile() {
        const cfg = (window.GAME_CONFIG && window.GAME_CONFIG.CHASSIS) || {};
        const hs = window.hangarSystem;
        const id = (hs && typeof hs.getSelectedChassis === 'function') ? hs.getSelectedChassis() : 'medium';
        return Object.assign({ id }, cfg[id] || cfg.medium || {});
    }

    // Loads the detailed STRIDER-LX GLB once; the procedural rig remains the fallback.
    loadChassisGLB() {
        if (this.chassisGLBLoadStarted || !window.THREE || !THREE.GLTFLoader) return;
        this.chassisGLBLoadStarted = true;
        const loader = new THREE.GLTFLoader();
        loader.load(
            'models/strider_lx.glb',
            (gltf) => {
                this.chassisGLB = gltf.scene;
                this.chassisGLAnimations = gltf.animations || [];
                if (this.getChassisProfile().id === 'light') {
                    if (this.playerMechGroup) this.rebuildChassisMechs();
                    else this.buildPlayerMech3D();
                }
            },
            undefined,
            (err) => { console.warn('Mech GLB unavailable, keeping procedural rig', err); }
        );
    }

    // Loads the detailed first-person cockpit HUD (arms, pistols, dashboard).
    loadCockpitGLB() {
        if (this.cockpitGLBLoadStarted || !window.THREE || !THREE.GLTFLoader) return;
        this.cockpitGLBLoadStarted = true;
        new THREE.GLTFLoader().load(
            'models/strider_cockpit_hud.glb',
            (gltf) => {
                this.cockpitGLB = gltf.scene;
                const arms = this._createGLTFCockpitArms();
                if (arms) this.cockpitArms3D = arms;
            },
            undefined,
            (err) => { console.warn('Cockpit HUD GLB unavailable, keeping procedural arms', err); }
        );
    }

    _createGLTFCockpitArms() {
        if (!this.cockpitGLB || !this.cockpitGroup) return null;
        const scene = this.cockpitGLB.clone(true);
        while (this.cockpitGroup.children.length) {
            const child = this.cockpitGroup.children[0];
            this.cockpitGroup.remove(child);
            this._disposeObject3D(child);
        }
        this.cockpitGroup.add(scene);
        const find = (name) => scene.getObjectByName(name) || new THREE.Group();
        const dummyMat = () => new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x000000, emissiveIntensity: 1 });
        return {
            isGLTF: true,
            leftArm: find('leftArm'), leftForearm: new THREE.Group(), lWrist: find('lWrist'),
            cleaverGroup: find('cleaverGroup'), cleaverEdgeMat: dummyMat(),
            pistol37Group: find('pistol37Group'), pSlide: find('pSlide'), dropMag: find('dropMag'),
            rightPistol37Group: find('rightPistol37Group'), minigunGroup: new THREE.Group(),
            pistolCylinder: new THREE.Group(),
            pMuzzleFlash: find('pMuzzleFlash'), rightMuzzleFlash: find('rightMuzzleFlash'),
            lTier2Plate: new THREE.Group(), lTier4Piston: new THREE.Group(),
            payloadGroup: new THREE.Group(),
            rightArm: find('rightArm'), rWrist: find('rWrist'),
            rifleGroup: new THREE.Group(), rifleMag: new THREE.Group(), rifleBolt: new THREE.Group(),
            rifleBarrelMat: dummyMat(), rTier3Shroud: new THREE.Group(),
            rTier5Coils: new THREE.Group(), rEvolvedCoilMat: dummyMat(),
            muzzleFlashGroup: new THREE.Group(), flashMat: dummyMat()
        };
    }

    _applyGLTFUpgradeVisibility(rig) {
        if (!rig || !rig.root || !rig.isGLTF) return;
        const hs = window.hangarSystem;
        const data = (hs && hs.data) || {};
        const upgrades = data.upgrades || {};
        const mods = data.equippedMods || {};
        const attachments = data.equippedAttachments || {};
        const builds = Object.values(data.equippedBuilds || {});
        rig.root.traverse((obj) => {
            const n = obj.name || '';
            if (n.startsWith('UPG_')) obj.visible = (upgrades[n.slice(4)] || 0) > 0;
            else if (n.startsWith('MOD_')) obj.visible = !!mods[n.slice(4)];
            else if (n.startsWith('ATT_')) obj.visible = !!attachments[n.slice(4)];
            else if (n.startsWith('BUILD_')) obj.visible = builds.includes(n.slice(6));
        });
    }

    _createGLTFMechRig() {
        if (!this.chassisGLB) return null;
        const scene = this.chassisGLB.clone(true);
        const find = (name) => scene.getObjectByName(name);
        const rig = {
            root: scene,
            chassisId: 'light',
            isGLTF: true,
            upperBody: find('upperBody'),
            headGroup: find('headGroup'),
            legs: {
                L: { hip: find('legs.L.hip'), shin: find('legs.L.shin'), foot: find('legs.L.foot') },
                R: { hip: find('legs.R.hip'), shin: find('legs.R.shin'), foot: find('legs.R.foot') }
            },
            rArm: find('rArm'),
            lArm: find('lArm'),
            rifleGroup: find('rifleGroup') || new THREE.Group(),
            dashFlames: { visible: false },
            thrusterCores: [], thrusterFlames: [], reactorCore: null, mechThrusterLight: null,
            hydraulics: null,
            parts: {},
            materials: { mOlive: null, mVisor: null },
            mixer: new THREE.AnimationMixer(scene)
        };
        const stubKeys = [
            'railBarrel', 'magnumComp', 'plasmaCleaver', 'shoulderPods', 'hullArmor', 'thrusters',
            'shieldEmitters', 'cryoVents', 'legHydraulics', 'sensorMast',
            'att_spotlight', 'att_antenna', 'att_kneeguards', 'att_ammodrum', 'att_exhaust',
            'att_reactor', 'att_buckler', 'att_bayonets', 'att_halo', 'att_crown'
        ];
        stubKeys.forEach((key) => {
            const stub = new THREE.Group();
            stub.visible = false;
            scene.add(stub);
            rig.parts[key] = stub;
        });
        const tracks = [];
        (this.chassisGLAnimations || []).forEach((clip) => {
            (clip.tracks || []).forEach((track) => tracks.push(track));
        });
        if (tracks.length) {
            const walk = new THREE.AnimationClip('LX_Walk_Cycle', -1, tracks);
            rig.walkAction = rig.mixer.clipAction(walk);
            rig.walkAction.play();
        }
        this._applyGLTFUpgradeVisibility(rig);
        return rig;
    }

    _chassisBuildParams(profile) {
        if (profile.id === 'light') {
            return { torsoWidth: 0.82, legSpread: 0.50, limbScale: 0.80, pauldronScale: 0.72, headWidth: 0.78, hipBase: -0.18, shinBase: -0.42, footBase: 0.22 };
        }
        if (profile.id === 'heavy') {
            return { torsoWidth: 1.35, legSpread: 0.73, limbScale: 1.28, pauldronScale: 1.42, headWidth: 1.12, hipBase: 0, shinBase: 0.10, footBase: -0.06 };
        }
        return { torsoWidth: 1.0, legSpread: 0.60, limbScale: 1.0, pauldronScale: 1.0, headWidth: 1.0, hipBase: 0, shinBase: 0, footBase: 0 };
    }

    _disposeObject3D(root) {
        if (!root) return;
        root.traverse((obj) => {
            if (obj.geometry && obj.geometry.dispose) obj.geometry.dispose();
            const mats = obj.material ? (Array.isArray(obj.material) ? obj.material : [obj.material]) : [];
            mats.forEach((m) => { if (m && m.dispose) m.dispose(); });
        });
    }

    // Adds high-detail, chassis-specific armor, optics, actuators and reactor geometry.
    _addChassisDetails(mech, upperBody, profile, dims, mats, legs, arms, outline) {
        const mOlive = mats.mOlive;
        const mSteel = mats.mSteel;
        const mDark = mats.mDark;
        const mAccent = mats.mAccent;
        const mHydraulic = mats.mHydraulic;
        const mPanel = mats.mPanel;
        const mHazard = mats.mHazard;
        const uy = -2.2; // upperBody local space

        // Hazard chevrons and stencil decals on pauldrons, knee shields and reactor hatches.
        for (const arm of [arms.rArm, arms.lArm]) {
            const pauldronDecal = new THREE.Mesh(new THREE.PlaneGeometry(0.48, 0.16), mHazard);
            pauldronDecal.position.set(0, 0.08, 0.43);
            arm.add(pauldronDecal);
        }
        for (const side of ['L', 'R']) {
            const kneeDecal = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.12), mHazard);
            kneeDecal.position.set(0, 0.08, 0.39);
            legs[side].shin.add(kneeDecal);
        }
        const reactorHatch = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.3), mHazard);
        reactorHatch.position.set(0, 0.72, -0.52);
        upperBody.add(reactorHatch);

        // Shared recessed panel-line trim and glowing reactor vents on every frame.
        for (const sx of [-1, 1]) {
            const seam = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.92, 0.06), mPanel);
            seam.position.set(sx * 0.62 * dims.torsoWidth, 2.95 + uy, 0.76);
            upperBody.add(seam);
            const vent = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.1, 0.05), mAccent);
            vent.position.set(sx * 0.46 * dims.torsoWidth, 2.66 + uy, 0.9);
            upperBody.add(vent);
        }

        if (profile.id === 'light') {
            // Sloped sensor-head cowling, panoramic optic strip and swept comm antennas.
            const cowling = outline(new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.36, 0.62, 6), mSteel));
            cowling.rotation.x = Math.PI / 2;
            cowling.rotation.z = 0.1;
            cowling.position.set(0, 3.5 + uy, 0.52);
            const optic = new THREE.Mesh(new THREE.BoxGeometry(1.12, 0.1, 0.1), mAccent);
            optic.position.set(0, 3.42 + uy, 0.84);
            upperBody.add(cowling, optic);
            for (const sx of [-1, 1]) {
                const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.025, 0.86, 6), mSteel);
                ant.position.set(sx * 0.46, 3.92 + uy, -0.18);
                ant.rotation.set(-0.62, 0, sx * 0.18);
                upperBody.add(ant);
                // Exposed reverse-joint hydraulic dampers.
                const piston = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.72, 8), mHydraulic);
                piston.position.set(sx * 0.06, -0.42, 0.14);
                piston.rotation.x = 0.28;
                (sx < 0 ? legs.L.hip : legs.R.hip).add(piston);
            }
        } else if (profile.id === 'heavy') {
            // Slab-sided siege hull, sloped glacis, fortress pauldrons and reactor stacks.
            for (const sx of [-1, 1]) {
                const slab = outline(new THREE.Mesh(new THREE.BoxGeometry(0.38, 1.34, 1.42), mOlive));
                slab.position.set(sx * 0.98, 2.94 + uy, -0.04);
                upperBody.add(slab);
                const stack = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.24, 1.02, 10), mDark);
                stack.position.set(sx * 0.72, 3.78 + uy, -0.78);
                const core = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.86, 8), mAccent);
                core.position.set(sx * 0.72, 3.86 + uy, -0.78);
                upperBody.add(stack, core);
                const brow = outline(new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.52, 0.34), mSteel));
                brow.position.set(sx * 1.1, 3.42 + uy, 0.26);
                upperBody.add(brow);
                const greave = outline(new THREE.Mesh(new THREE.BoxGeometry(0.62, 1.0, 0.68), mOlive));
                greave.position.set(0, -0.44, 0.08);
                (sx < 0 ? legs.L.shin : legs.R.shin).add(greave);
                const shoulderPlate = outline(new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.74, 0.92), mOlive));
                shoulderPlate.position.set(0, 0.12, -0.04);
                (sx < 0 ? arms.lArm : arms.rArm).add(shoulderPlate);
            }
            const glacis = outline(new THREE.Mesh(new THREE.BoxGeometry(1.94, 0.42, 0.72), mPanel));
            glacis.position.set(0, 2.5 + uy, 0.76);
            glacis.rotation.x = -0.42;
            upperBody.add(glacis);
            const cyclops = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.12, 0.1), mAccent);
            cyclops.position.set(0, 3.36 + uy, 0.98);
            upperBody.add(cyclops);
        } else {
            // Balanced brawler: layered reactive plates, hazard-stripe pauldron trim, CRT hood.
            for (let i = 0; i < 3; i++) {
                const plate = outline(new THREE.Mesh(new THREE.BoxGeometry(1.42 - i * 0.12, 0.2, 0.14), i === 1 ? mSteel : mOlive));
                plate.position.set(0, 2.82 + uy - i * 0.24, 0.7 + i * 0.03);
                plate.rotation.x = -0.12 + i * 0.07;
                upperBody.add(plate);
            }
            for (const arm of [arms.lArm, arms.rArm]) {
                const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.1, 0.06), mAccent);
                stripe.position.set(0, 0.16, 0.42);
                arm.add(stripe);
            }
            const hood = outline(new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.18, 0.28), mDark));
            hood.position.set(0, 3.44 + uy, 0.7);
            upperBody.add(hood);
        }
    }

    _buildCanopyFrame(profile) {
        const frame = new THREE.Group();
        const steel = new THREE.MeshStandardMaterial({ color: 0x343a40, metalness: 0.78, roughness: 0.3 });
        const accent = new THREE.MeshBasicMaterial({ color: new THREE.Color(profile.cockpitAccent || '#ffaa33') });
        const pillar = (x, width, tilt) => {
            const m = new THREE.Mesh(new THREE.BoxGeometry(width, 1.2, 0.06), steel);
            m.position.set(x, -0.05, -1.25);
            m.rotation.z = tilt;
            return m;
        };
        if (profile.id === 'light') {
            frame.add(pillar(-0.72, 0.035, 0.13), pillar(0.72, 0.035, -0.13));
            const trim = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.025, 0.05), accent);
            trim.position.set(0, 0.55, -1.25);
            frame.add(trim);
        } else if (profile.id === 'heavy') {
            frame.add(pillar(-0.78, 0.15, 0.2), pillar(0.78, 0.15, -0.2));
            const brow = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.24, 0.16), steel);
            brow.position.set(0, 0.64, -1.24);
            const status = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.04, 0.05), accent);
            status.position.set(0, 0.52, -1.18);
            frame.add(brow, status);
        } else {
            frame.add(pillar(-0.7, 0.08, 0.16), pillar(0.7, 0.08, -0.16));
            const hood = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.16, 0.14), steel);
            hood.position.set(0, 0.44, -1.18);
            frame.add(hood);
        }
        frame.visible = false;
        return frame;
    }

    // Rebuilds both 3D mech rigs and the first-person canopy after a chassis switch.
    rebuildChassisMechs() {
        const profile = this.getChassisProfile();
        const id = profile.id;
        this._positionHangarCamera(profile);
        if (this.hangarScene && this.hangarMechGroup) {
            this.hangarScene.remove(this.hangarMechGroup);
            this._disposeObject3D(this.hangarMechGroup);
            const rig = this._createProceduralMechRig();
            this.hangarScene.add(rig.root);
            this.hangarMechGroup = rig.root;
            this.hangarProceduralMech = rig.root;
            this.hangarHardpointsGroup = rig.hardpointsGroup;
            this.hangarMaterials = rig.materials;
            this.hangarParts = rig.parts;
        }
        if (this.scene && this.playerMechGroup) {
            const wasVisible = this.playerMechGroup.visible;
            this.scene.remove(this.playerMechGroup);
            this._disposeObject3D(this.playerMechGroup);
            const useGLB = (this.getChassisProfile().id === 'light' && this.chassisGLB);
            const rig = useGLB ? this._createGLTFMechRig() : this._createProceduralMechRig();
            rig.root.scale.setScalar(useGLB ? 1.0 : 1.18);
            rig.root.rotation.y = useGLB ? 0 : Math.PI;
            const wrapper = new THREE.Group();
            wrapper.add(rig.root);
            wrapper.visible = wasVisible;
            this.scene.add(wrapper);
            this.playerMechGroup = wrapper;
            this.playerMechRig = rig;
            this.mechAnimState = {
                walkBlend: 0, dashBlend: 0, meleeBlend: 0,
                hipL: 0, hipR: 0, shinL: 0, shinR: 0,
                torsoX: 0, torsoY: 0, torsoZ: 0,
                rArmX: 0, rArmY: 0, lArmX: 0, lArmY: 0
            };
        }
        if (this.camera) {
            if (this.canopyGroup) {
                this.camera.remove(this.canopyGroup);
                this._disposeObject3D(this.canopyGroup);
            }
            this.canopyGroup = this._buildCanopyFrame(profile);
            this.camera.add(this.canopyGroup);
        }
        this.currentRigChassisId = id;
        this.syncHangarMechUpgrades();
    }

    _makeContactShadowTexture() {
        const c = document.createElement('canvas');
        c.width = c.height = 128;
        const g = c.getContext('2d');
        const grad = g.createRadialGradient(64, 64, 6, 64, 64, 62);
        grad.addColorStop(0, 'rgba(0,0,0,0.88)');
        grad.addColorStop(0.55, 'rgba(0,0,0,0.45)');
        grad.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = grad;
        g.fillRect(0, 0, 128, 128);
        return new THREE.CanvasTexture(c);
    }

    _positionHangarCamera(profile) {
        if (!this.hangarCamera) return;
        // Wider siege frames need more standoff so the full mech stays on the turntable.
        const distance = profile.id === 'heavy' ? 8.7 : profile.id === 'light' ? 6.2 : 6.85;
        const height = profile.id === 'heavy' ? 2.75 : 2.35;
        this.hangarCamera.position.set(1.15, height, distance);
        this.hangarCamera.lookAt(1.05, 1.9, 0);
        if (this.hangarContactShadow) {
            const s = profile.id === 'heavy' ? 4.2 : profile.id === 'light' ? 2.6 : 3.3;
            this.hangarContactShadow.scale.set(s / 3.2, s / 3.2, 1);
        }
    }

    buildHangarMech3D() {
        if (this.hangarScene) return;
        this.hangarScene = new THREE.Scene();
        this.hangarScene.background = new THREE.Color(0x0b1118);
        this.hangarScene.fog = new THREE.FogExp2(0x0b1118, 0.045);

        this.hangarCamera = new THREE.PerspectiveCamera(46, window.innerWidth / window.innerHeight, 0.1, 100);
        // Offset camera right so the mech sits cleanly in the center gap between Telemetry & Hangar UI
        this._positionHangarCamera(this.getChassisProfile());

        // Three-point cinematic rig: cool overhead key, warm rear rim, cyan back rim + floor bounce.
        const hemi = new THREE.HemisphereLight(0x93b4d8, 0x111820, 0.55);
        const keyLight = new THREE.DirectionalLight(0xbcd8ff, 1.75);
        keyLight.position.set(4.5, 8.5, 5.5);
        const rimLight = new THREE.DirectionalLight(0xff9838, 2.15);
        rimLight.position.set(-4.5, 5, -6);
        const backRim = new THREE.DirectionalLight(0x38f2ff, 1.35);
        backRim.position.set(5, 3.5, -5.5);
        const floorBounce = new THREE.PointLight(0x00e5ff, 1.4, 10);
        floorBounce.position.set(0, 0.25, 0.6);
        this.hangarScene.add(hemi, keyLight, rimLight, backRim, floorBounce);

        // Turntable Orbital Bay Platform
        const pad = new THREE.Mesh(
            new THREE.CylinderGeometry(2.35, 2.7, 0.32, 32),
            new THREE.MeshStandardMaterial({ color: 0x161d26, metalness: 0.75, roughness: 0.35 })
        );
        pad.position.set(0, -0.16, 0);
        const padRing = new THREE.Mesh(
            new THREE.RingGeometry(2.08, 2.22, 48),
            new THREE.MeshBasicMaterial({ color: 0x38f2ff, side: THREE.DoubleSide })
        );
        padRing.rotation.x = -Math.PI / 2;
        padRing.position.set(0, 0.02, 0);
        const padInnerRing = new THREE.Mesh(
            new THREE.RingGeometry(1.35, 1.42, 36),
            new THREE.MeshBasicMaterial({ color: 0x0ea5e9, side: THREE.DoubleSide, transparent: true, opacity: 0.55 })
        );
        padInnerRing.rotation.x = -Math.PI / 2;
        padInnerRing.position.set(0, 0.02, 0);
        this.hangarScene.add(pad, padRing, padInnerRing);

        // Soft grounded contact shadow beneath the mech's feet.
        const contactShadow = new THREE.Mesh(
            new THREE.PlaneGeometry(3.2, 3.2),
            new THREE.MeshBasicMaterial({ map: this._makeContactShadowTexture(), transparent: true, opacity: 0.82, depthWrite: false })
        );
        contactShadow.rotation.x = -Math.PI / 2;
        contactShadow.position.set(0, 0.035, 0);
        this.hangarScene.add(contactShadow);
        this.hangarContactShadow = contactShadow;

        // Slowly rising hangar steam / dust motes for depth and weight.
        const motePositions = new Float32Array(70 * 3);
        for (let i = 0; i < 70; i++) {
            const a = Math.random() * Math.PI * 2;
            const r = 0.5 + Math.random() * 2.6;
            motePositions[i * 3] = Math.cos(a) * r;
            motePositions[i * 3 + 1] = Math.random() * 4.2;
            motePositions[i * 3 + 2] = Math.sin(a) * r;
        }
        const moteGeo = new THREE.BufferGeometry();
        moteGeo.setAttribute('position', new THREE.BufferAttribute(motePositions, 3));
        this.hangarMotes = new THREE.Points(moteGeo, new THREE.PointsMaterial({
            color: 0xa8dcff, size: 0.045, transparent: true, opacity: 0.42, depthWrite: false
        }));
        this.hangarScene.add(this.hangarMotes);
        this._lastHangarTime = 0;

        const rig = this._createProceduralMechRig();
        this.hangarScene.add(rig.root);
        this.hangarMechGroup = rig.root;
        this.hangarProceduralMech = rig.root;
        this.hangarHardpointsGroup = rig.hardpointsGroup;
        this.hangarMaterials = rig.materials;
        this.hangarParts = rig.parts;
        this.currentRigChassisId = rig.chassisId;
        this.syncHangarMechUpgrades();
    }

    _createProceduralMechRig() {
        const mech = new THREE.Group();
        const profile = this.getChassisProfile();
        const dims = this._chassisBuildParams(profile);

        // Procedural weathered olive-khaki industrial armor texture (grit, seams, hazard trim)
        const makeArmorTex = (baseHex, withHazard) => {
            const c = document.createElement('canvas');
            c.width = 128; c.height = 128;
            const g = c.getContext('2d');
            g.fillStyle = baseHex;
            g.fillRect(0, 0, 128, 128);
            for (let i = 0; i < 480; i++) {
                const x = (i * 73) % 128;
                const y = (i * 41) % 128;
                g.fillStyle = i % 2 === 0 ? 'rgba(255,245,220,0.06)' : 'rgba(25,20,12,0.14)';
                g.fillRect(x, y, 3, 2);
            }
            g.strokeStyle = 'rgba(18,18,16,0.5)';
            g.lineWidth = 2;
            g.strokeRect(3, 3, 122, 122);
            g.strokeRect(10, 10, 108, 52);
            g.fillStyle = 'rgba(220,210,185,0.28)';
            for (let r = 14; r <= 114; r += 20) {
                g.fillRect(r, 12, 2, 2);
                g.fillRect(r, 58, 2, 2);
                g.fillRect(r, 114, 2, 2);
            }
            if (withHazard) {
                g.save();
                g.beginPath();
                g.rect(4, 108, 120, 16);
                g.clip();
                g.fillStyle = '#c89224';
                g.fillRect(4, 108, 120, 16);
                g.fillStyle = '#181a1d';
                for (let sx = -20; sx < 140; sx += 16) {
                    g.beginPath();
                    g.moveTo(sx, 124); g.lineTo(sx + 8, 124);
                    g.lineTo(sx + 18, 108); g.lineTo(sx + 10, 108);
                    g.closePath();
                    g.fill();
                }
                g.restore();
            }
            const t = new THREE.CanvasTexture(c);
            t.magFilter = THREE.NearestFilter;
            return t;
        };
        const armorTex = makeArmorTex('#848064', true);
        const steelTex = makeArmorTex('#5a5e5c', false);

        // Layered industrial PBR: polished armor over dark gunmetal joints and hydraulics.
        const tex = this.createMechSurfaceTextures();
        const mOlive = new THREE.MeshStandardMaterial({ color: 0x7c785c, map: armorTex, bumpMap: tex.bump, bumpScale: 0.028, roughnessMap: tex.roughness, metalness: 0.72, roughness: 0.34 });
        const mSteel = new THREE.MeshStandardMaterial({ color: 0x4c5256, map: steelTex, bumpMap: tex.bump, bumpScale: 0.022, roughnessMap: tex.roughness, metalness: 0.78, roughness: 0.30 });
        const mDark = new THREE.MeshStandardMaterial({ color: 0x1b1d1f, metalness: 0.68, roughness: 0.38 });
        const mPanel = new THREE.MeshStandardMaterial({ color: 0x2e343a, bumpMap: tex.bump, bumpScale: 0.02, roughnessMap: tex.roughness, metalness: 0.74, roughness: 0.36 });
        const mHydraulic = new THREE.MeshStandardMaterial({ color: 0x121518, metalness: 0.8, roughness: 0.28 });
        const mFrame = new THREE.MeshStandardMaterial({ color: 0x20262b, metalness: 0.85, roughness: 0.35 });
        const mChrome = new THREE.MeshStandardMaterial({ color: 0xc8d4dd, metalness: 0.92, roughness: 0.15 });
        const mHazard = new THREE.MeshStandardMaterial({ map: tex.hazard, bumpMap: tex.bump, bumpScale: 0.02, metalness: 0.7, roughness: 0.36 });
        const mOptic = new THREE.MeshBasicMaterial({ color: 0x66f7ff });
        const mEdgeGlow = new THREE.MeshBasicMaterial({ color: 0xff5a18 });
        const mAccent = new THREE.MeshBasicMaterial({ color: new THREE.Color(profile.cockpitAccent || '#ffaa33') });
        const mVisor = new THREE.MeshBasicMaterial({ color: 0x00f5ff });
        const mGlass = new THREE.MeshStandardMaterial({ color: 0x12161c, emissive: 0x1c2833, emissiveIntensity: 0.35, metalness: 0.9, roughness: 0.14 });
        const mGold = new THREE.MeshStandardMaterial({ color: 0xb88635, metalness: 0.78, roughness: 0.32 });
        const mMolten = new THREE.MeshBasicMaterial({ color: 0xff5511 });
        const mCoil = new THREE.MeshBasicMaterial({ color: 0x48ee58 });
        const edgeMat = new THREE.LineBasicMaterial({ color: 0x111214, transparent: true, opacity: 0.75 });

        const outline = (mesh) => {
            if (mesh.geometry) {
                mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry, 28), edgeMat));
            }
            return mesh;
        };

        // Articulated Legs with Hip & Knee/Shin Pivots for Walk, Dash & Stomp
        const legs = {};
        for (const sx of [-1, 1]) {
            const hip = new THREE.Group();
            hip.position.set(sx * dims.legSpread, 1.94, 0);
            hip.rotation.x = dims.hipBase;

            const hipJoint = outline(new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.36, 10), mDark));
            hipJoint.rotation.z = Math.PI / 2;
            hipJoint.position.set(-sx * 0.14, 0, 0);

            const thigh = outline(new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.84, 0.62), mOlive));
            thigh.position.set(0, -0.32, 0.02);
            thigh.rotation.x = 0.16;
            thigh.scale.set(dims.limbScale, 1, dims.limbScale);

            const shinPivot = new THREE.Group();
            shinPivot.position.set(sx * 0.02, -0.76, -0.04);

            const kneeDrum = outline(new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.54, 12), mDark));
            kneeDrum.rotation.z = Math.PI / 2;
            const kneeCap = outline(new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.34, 0.22), mOlive));
            kneeCap.position.set(0, 0.06, 0.24);
            kneeCap.rotation.x = 0.2;

            const shin = outline(new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.92, 0.5), mOlive));
            shin.position.set(0, -0.46, -0.02);
            shin.rotation.x = -0.16;
            shin.scale.set(dims.limbScale, 1, dims.limbScale);
            const shinFront = outline(new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.66, 0.18), mSteel));
            shinFront.position.set(0, -0.44, 0.22);
            shinFront.rotation.x = -0.16;
            shinFront.scale.set(dims.limbScale, 1, 1);

            const footPivot = new THREE.Group();
            footPivot.position.set(0, -0.92, 0.04);

            const ankle = outline(new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.24, 10), mSteel));
            const sole = outline(new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.18, 0.76), mDark));
            sole.position.set(0, -0.17, 0.04);
            for (const tx of [-0.21, 0, 0.21]) {
                const toeLen = tx === 0 ? 0.44 : 0.34;
                const toe = outline(new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.16, toeLen), tx === 0 ? mOlive : mSteel));
                toe.position.set(tx, -0.18, 0.44 + (tx === 0 ? 0.04 : 0));
                toe.rotation.x = 0.08;
                footPivot.add(toe);
            }
            const heel = outline(new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.2, 0.32), mDark));
            heel.position.set(0, -0.16, -0.38);
            footPivot.add(ankle, sole, heel);

            shinPivot.add(kneeDrum, kneeCap, shin, shinFront, footPivot);
            hip.add(hipJoint, thigh, shinPivot);
            mech.add(hip);
            if (sx < 0) legs.L = { hip, shin: shinPivot, foot: footPivot };
            else legs.R = { hip, shin: shinPivot, foot: footPivot };
        }

        // Exposed gunmetal inner-skeleton joints and chrome actuator rods.
        const hydraulics = {};
        for (const sx of [-1, 1]) {
            const hipBall = new THREE.Mesh(new THREE.SphereGeometry(0.19, 10, 8), mFrame);
            hipBall.position.set(sx * dims.legSpread, 1.94, 0);
            const thighBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.48, 8), mFrame);
            thighBarrel.position.set(sx * 0.08, 1.55, -0.12);
            thighBarrel.rotation.x = 0.18;
            const thighRod = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.042, 0.44, 8), mChrome);
            thighRod.position.set(sx * 0.08, 1.24, -0.06);
            thighRod.rotation.x = 0.18;
            const kneeBall = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 8), mFrame);
            kneeBall.position.set(sx * dims.legSpread, 1.18, 0);
            const shinBarrel = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.4, 8), mFrame);
            shinBarrel.position.set(sx * dims.legSpread, 0.86, 0.16);
            const shinRod = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.038, 0.4, 8), mChrome);
            shinRod.position.set(sx * dims.legSpread, 0.56, 0.13);
            const ankleBall = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), mFrame);
            ankleBall.position.set(sx * dims.legSpread, 0.34, 0);
            mech.add(hipBall, thighBarrel, thighRod, kneeBall, shinBarrel, shinRod, ankleBall);
            if (sx < 0) hydraulics.L = { thighRod, shinRod };
            else hydraulics.R = { thighRod, shinRod };
        }

        // Waist-Pivoted Pelvis & Faceted Wrap-Around Windshield Cockpit Hull
        const pelvisBase = outline(new THREE.Mesh(new THREE.BoxGeometry(1.14, 0.42, 0.84), mSteel));
        pelvisBase.position.set(0, 1.96, 0.02);
        const groinSkirt = outline(new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.42, 0.26), mOlive));
        groinSkirt.position.set(0, 1.92, 0.44);
        const waistRing = outline(new THREE.Mesh(new THREE.CylinderGeometry(0.54, 0.62, 0.22, 10), mDark));
        waistRing.position.set(0, 2.22, 0);
        mech.add(pelvisBase, groinSkirt, waistRing);

        const upperBody = new THREE.Group();
        upperBody.position.set(0, 2.2, 0);
        upperBody.scale.x = dims.torsoWidth;
        const uy = -2.2;

        // Main faceted octagonal cockpit hull
        const hullBody = outline(new THREE.Mesh(new THREE.BoxGeometry(1.66, 1.28, 1.32), mOlive));
        hullBody.position.set(0, 2.94 + uy, -0.02);
        const hullRoof = outline(new THREE.Mesh(new THREE.BoxGeometry(1.38, 0.32, 0.92), mOlive));
        hullRoof.position.set(0, 3.64 + uy, 0.06);
        hullRoof.rotation.x = 0.22;
        const hullChin = outline(new THREE.Mesh(new THREE.BoxGeometry(1.42, 0.48, 0.46), mOlive));
        hullChin.position.set(0, 2.52 + uy, 0.68);
        hullChin.rotation.x = -0.18;

        // Large Wrap-Around Dark Armored Windshield (Center + Angled Side Panes)
        const windFrame = outline(new THREE.Mesh(new THREE.BoxGeometry(1.24, 0.68, 0.32), mSteel));
        windFrame.position.set(0, 3.16 + uy, 0.68);
        windFrame.rotation.x = -0.22;
        const windCenter = outline(new THREE.Mesh(new THREE.BoxGeometry(0.84, 0.54, 0.14), mGlass));
        windCenter.position.set(0, 3.16 + uy, 0.8);
        windCenter.rotation.x = -0.22;
        for (const sx of [-1, 1]) {
            const sidePane = outline(new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.46, 0.14), mGlass));
            sidePane.position.set(sx * 0.66, 3.16 + uy, 0.66);
            sidePane.rotation.set(-0.18, sx * 0.62, 0);
            upperBody.add(sidePane);
        }

        // Chest recessed vent blocks
        for (const sx of [-0.42, 0.42]) {
            const vent = outline(new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.22, 0.14), mSteel));
            vent.position.set(sx, 2.6 + uy, 0.88);
            const ventCore = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.1, 0.06), mDark);
            ventCore.position.set(sx, 2.6 + uy, 0.94);
            upperBody.add(vent, ventCore);
        }

        // Twin Dorsal Roof Sensor / Intake Pods
        for (const sx of [-0.46, 0.46]) {
            const pod = outline(new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.32, 0.44), mSteel));
            pod.position.set(sx, 3.88 + uy, -0.02);
            const podFace = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.18, 0.08), mDark);
            podFace.position.set(sx, 3.88 + uy, 0.18);
            upperBody.add(pod, podFace);
        }

        // Rear Reactor Backpack + Dash Thruster Flare
        const backpack = outline(new THREE.Mesh(new THREE.BoxGeometry(1.18, 1.06, 0.56), mSteel));
        backpack.position.set(0, 2.92 + uy, -0.82);
        const dashFlames = new THREE.Group();
        dashFlames.visible = false;
        const mFlame = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
        for (const sx of [-0.36, 0.36]) {
            const cone = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.9, 8), mFlame);
            cone.rotation.x = -Math.PI / 2;
            cone.position.set(sx, 2.75 + uy, -1.48);
            dashFlames.add(cone);
        }

        // Keep headGroup / visor anchor for cosmetic visor tinting
        const headGroup = new THREE.Group();
        headGroup.position.set(0, 3.56 + uy, 0.08);
        headGroup.scale.x = dims.headWidth;
        const visor = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.07, 0.08), mVisor);
        visor.position.set(0, -0.18, 0.78);
        headGroup.add(visor);

        upperBody.add(
            hullBody, hullRoof, hullChin, windFrame, windCenter,
            backpack, dashFlames, headGroup
        );
        mech.add(upperBody);

        // Pulsing reactor chest core plus recessed calf thruster bells, emissive cores and dash flames.
        const reactorCore = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.07, 14), mAccent);
        reactorCore.rotation.x = Math.PI / 2;
        reactorCore.position.set(0, 0.74, 0.84);
        upperBody.add(reactorCore);
        const thrusterCores = [];
        const thrusterFlames = [];
        for (const sx of [-1, 1]) {
            const bell = outline(new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.2, 0.3, 10), mFrame));
            bell.rotation.x = Math.PI / 2;
            bell.position.set(sx * 0.46, 0.95, -0.52);
            const core = new THREE.Mesh(new THREE.CircleGeometry(0.11, 12), mAccent);
            core.position.set(sx * 0.46, 0.95, -0.68);
            core.rotation.y = Math.PI;
            const flame = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.62, 8), mAccent);
            flame.rotation.x = Math.PI / 2;
            flame.position.set(sx * 0.46, 0.95, -1.0);
            flame.visible = false;
            mech.add(bell, core, flame);
            thrusterCores.push(core);
            thrusterFlames.push(flame);
        }
        const mechThrusterLight = new THREE.PointLight(0x38f2ff, 0, 5);
        mechThrusterLight.position.set(0, 0.95, -0.9);
        mech.add(mechThrusterLight);

        // Helper for curved hydraulic hoses
        const addHydraulicCable = (parent, p0, p1, p2) => {
            const curve = new THREE.QuadraticBezierCurve3(p0, p1, p2);
            parent.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 8, 0.032, 6, false), mDark));
        };

        // Helper for 3-finger pincer hand gripping the rifle
        const addGripHand = (parent, x, y, z) => {
            const wrist = outline(new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.16, 0.16, 8), mDark));
            wrist.rotation.x = Math.PI / 2;
            wrist.position.set(x, y, z);
            parent.add(wrist);
            for (const [ox, oy] of [[-0.08, 0.1], [0.08, 0.1], [0, -0.11]]) {
                const finger = outline(new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.09, 0.24), mSteel));
                finger.position.set(x + ox, y + oy, z + 0.14);
                parent.add(finger);
            }
        };

        // Right Arm angled inward to hold the rifle receiver (pivoted on upperBody)
        const rArm = new THREE.Group();
        rArm.position.set(1.12, 0.86, 0.08);
        const rPauldron = outline(new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.58, 0.82), mOlive));
        rPauldron.rotation.z = -0.18;
        rPauldron.scale.set(dims.pauldronScale, dims.pauldronScale, 1);
        const rUpperArm = outline(new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.56, 0.3), mSteel));
        rUpperArm.position.set(0.06, -0.34, 0.06);
        rUpperArm.rotation.set(0.22, 0, -0.12);
        const rElbow = outline(new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.34, 10), mDark));
        rElbow.rotation.z = Math.PI / 2;
        rElbow.position.set(0.08, -0.62, 0.16);
        const rForearm = outline(new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.36, 0.72), mOlive));
        rForearm.position.set(-0.18, -0.64, 0.54);
        rForearm.rotation.y = -0.58;
        addGripHand(rArm, -0.44, -0.64, 0.84);
        addHydraulicCable(rArm, new THREE.Vector3(0.16, -0.18, -0.08), new THREE.Vector3(0.28, -0.54, 0.06), new THREE.Vector3(-0.04, -0.64, 0.34));
        rArm.add(rPauldron, rUpperArm, rElbow, rForearm);

        // Two-Handed 6-Barrel 120mm Rotary Autocannon Held Across Chest (matches HUD/1st-Person weapon)
        const rifleGroup = new THREE.Group();
        rifleGroup.position.set(-0.72, -0.58, 0.96);
        rifleGroup.rotation.y = -1.18;
        const rifleReceiver = outline(new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.34, 1.24), mOlive));
        const rifleTopRail = outline(new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.16, 0.92), mDark));
        rifleTopRail.position.set(0, 0.24, -0.04);
        const rifleDrum = outline(new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.3, 12), mGold));
        rifleDrum.rotation.z = Math.PI / 2;
        rifleDrum.position.set(0.06, -0.32, 0.12);
        const rotaryBarrels = new THREE.Group();
        rotaryBarrels.position.set(0, 0.04, 1.18);
        for (let bi = 0; bi < 6; bi++) {
            const ang = (bi / 6) * Math.PI * 2;
            const brl = outline(new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, 1.12, 6), mSteel));
            brl.rotation.x = Math.PI / 2;
            brl.position.set(Math.cos(ang) * 0.085, Math.sin(ang) * 0.085, 0);
            rotaryBarrels.add(brl);
        }
        const barrelClamp = outline(new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.14, 12), mDark));
        barrelClamp.rotation.x = Math.PI / 2;
        barrelClamp.position.set(0, 0, 0.38);
        const barrelRearClamp = outline(new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.14, 12), mSteel));
        barrelRearClamp.rotation.x = Math.PI / 2;
        barrelRearClamp.position.set(0, 0, -0.44);
        rotaryBarrels.add(barrelClamp, barrelRearClamp);
        const rifleFlash = new THREE.Mesh(
            new THREE.SphereGeometry(0.26, 6, 5),
            new THREE.MeshBasicMaterial({ color: 0xffbb33 })
        );
        rifleFlash.scale.set(1, 1, 1.8);
        rifleFlash.position.set(0, 0.04, 1.94);
        rifleFlash.visible = false;
        rifleGroup.add(rifleReceiver, rifleTopRail, rifleDrum, rotaryBarrels, rifleFlash);
        rArm.add(rifleGroup);

        // Upgradeable: Extended 120mm Rail-Barrel + Coils
        const railBarrel = new THREE.Group();
        const extShroud = outline(new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 0.82), mSteel));
        extShroud.position.set(0, 0.04, 1.56);
        const railGlow = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.07, 0.68), mCoil);
        railGlow.position.set(0, 0.04, 1.56);
        railBarrel.add(extShroud, railGlow);
        rifleGroup.add(railBarrel);

        // Left Arm angled inward to support the rifle forend (pivoted on upperBody)
        const lArm = new THREE.Group();
        lArm.position.set(-1.12, 0.86, 0.08);
        const lPauldron = outline(new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.58, 0.82), mOlive));
        lPauldron.rotation.z = 0.18;
        lPauldron.scale.set(dims.pauldronScale, dims.pauldronScale, 1);
        const lUpperArm = outline(new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.56, 0.3), mSteel));
        lUpperArm.position.set(-0.06, -0.34, 0.06);
        lUpperArm.rotation.set(0.22, 0, 0.12);
        const lElbow = outline(new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.34, 10), mDark));
        lElbow.rotation.z = Math.PI / 2;
        lElbow.position.set(-0.08, -0.62, 0.16);
        const lForearm = outline(new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.36, 0.72), mOlive));
        lForearm.position.set(0.14, -0.64, 0.56);
        lForearm.rotation.y = 0.48;
        addGripHand(lArm, 0.36, -0.64, 0.86);
        addHydraulicCable(lArm, new THREE.Vector3(-0.16, -0.18, -0.08), new THREE.Vector3(-0.28, -0.54, 0.06), new THREE.Vector3(0.04, -0.64, 0.34));
        const cleaverBase = outline(new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.2, 0.84), mSteel));
        cleaverBase.position.set(-0.06, -0.64, 0.58);
        cleaverBase.rotation.y = 0.48;
        lArm.add(lPauldron, lUpperArm, lElbow, lForearm, cleaverBase);

        // Upgradeable: 37mm Magnum Compensator
        const magnumComp = outline(new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.22, 0.38), mGold));
        magnumComp.position.set(0.52, -0.62, 1.02);
        magnumComp.rotation.y = 0.48;
        lArm.add(magnumComp);

        // Upgradeable: Superheated Molten Cleaver Edge
        const plasmaCleaver = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.32, 1.24), mMolten);
        plasmaCleaver.position.set(0.02, -0.64, 0.72);
        plasmaCleaver.rotation.y = 0.48;
        lArm.add(plasmaCleaver);

        // Glowing optic, perforated heat shroud, ammo feed chute and molten blade edge.
        const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.26, 10), mFrame);
        scope.rotation.x = Math.PI / 2;
        scope.position.set(0, 0.34, 0.14);
        const scopeLens = new THREE.Mesh(new THREE.CircleGeometry(0.052, 12), mOptic);
        scopeLens.position.set(0, 0.34, 0.28);
        rifleGroup.add(scope, scopeLens);
        const heatShroudHoles = new THREE.Group();
        for (let i = 0; i < 12; i++) {
            const a = (i / 12) * Math.PI * 2;
            const hole = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.14, 6), mFrame);
            hole.rotation.z = Math.PI / 2;
            hole.position.set(Math.cos(a) * 0.17, Math.sin(a) * 0.17, 0.86);
            heatShroudHoles.add(hole);
        }
        rifleGroup.add(heatShroudHoles);
        const feedCurve = new THREE.CatmullRomCurve3([
            new THREE.Vector3(0.1, -0.32, 0.14),
            new THREE.Vector3(0.18, -0.2, 0.42),
            new THREE.Vector3(0.1, -0.08, 0.58)
        ]);
        rifleGroup.add(new THREE.Mesh(new THREE.TubeGeometry(feedCurve, 10, 0.045, 6, false), mFrame));
        const cleaverGlow = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.06, 0.82), mEdgeGlow);
        cleaverGlow.position.set(0.06, -0.64, 0.6);
        cleaverGlow.rotation.y = 0.48;
        lArm.add(cleaverGlow);

        // Gunmetal shoulder / elbow inner-frame joints with chrome pins.
        for (const arm of [rArm, lArm]) {
            const shoulderBall = new THREE.Mesh(new THREE.SphereGeometry(0.23, 10, 8), mFrame);
            const shoulderPin = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.5, 8), mChrome);
            shoulderPin.rotation.z = Math.PI / 2;
            const elbowBall = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8), mFrame);
            elbowBall.position.set(arm === rArm ? 0.08 : -0.08, -0.62, 0.16);
            arm.add(shoulderBall, shoulderPin, elbowBall);
        }

        // Upgradeable: Layered Hull Armor Plates
        const hullArmor = new THREE.Group();
        const chestPlate = new THREE.Mesh(new THREE.BoxGeometry(1.78, 0.85, 1.32), mSteel);
        chestPlate.position.set(0, 2.82, 0.05);
        hullArmor.add(chestPlate);

        // Upgradeable: Twin Rear Thruster Nacelles
        const thrusters = new THREE.Group();
        for (const sx of [-1, 1]) {
            const pod = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.72, 0.52), mDark);
            pod.position.set(sx * 0.48, 2.8, -0.78);
            const flame = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.04, 0.45, 8), mVisor);
            flame.position.set(sx * 0.48, 2.35, -0.82);
            thrusters.add(pod, flame);
        }

        // Upgradeable: Twin Shoulder Micro-Missile Pods
        const shoulderPods = new THREE.Group();
        for (const sx of [-1, 1]) {
            const sPod = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.45, 0.65), mGold);
            sPod.position.set(sx * 1.05, 3.52, -0.05);
            const tips = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.28, 0.08), mMolten);
            tips.position.set(sx * 1.05, 3.52, 0.29);
            shoulderPods.add(sPod, tips);
        }

        // Upgradeable: Reactive Shield Array (Dorsal Emitters)
        const shieldEmitters = new THREE.Group();
        for (const sx of [-1, 1]) {
            const pylon = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.65, 0.26), mSteel);
            pylon.position.set(sx * 0.56, 3.58, -0.45);
            const core = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.42, 0.14), mVisor);
            core.position.set(sx * 0.56, 3.68, -0.42);
            shieldEmitters.add(pylon, core);
        }

        // Upgradeable: Cryo-Vented Heat Sinks (Torso Side Radiator Fins)
        const cryoVents = new THREE.Group();
        for (const sx of [-1, 1]) {
            for (let f = 0; f < 3; f++) {
                const fin = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.62), mCoil);
                fin.position.set(sx * 0.9, 2.55 + f * 0.22, -0.22);
                cryoVents.add(fin);
            }
        }

        // Upgradeable: Hydraulic Leg Actuators
        const legHydraulics = new THREE.Group();
        for (const sx of [-1, 1]) {
            const piston = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.95, 8), mGold);
            piston.position.set(sx * 0.82, 1.05, 0.05);
            const brace = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.28, 0.64), mSteel);
            brace.position.set(sx * 0.58, 0.72, 0.12);
            legHydraulics.add(piston, brace);
        }

        // Upgradeable: Orbital Sensor Mast
        const sensorMast = new THREE.Group();
        const mastRod = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.06, 0.95, 6), mSteel);
        mastRod.position.set(-0.42, 4.05, -0.25);
        const dish = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.18, 0.08), mVisor);
        dish.position.set(-0.42, 4.48, -0.22);
        sensorMast.add(mastRod, dish);

        // 10 Cosmetic/Tactical 3D Mech Attachments
        const att_spotlight = new THREE.Group();
        const spotHousing = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.24, 0.34), mDark);
        spotHousing.position.set(-1.12, 3.38, 0.22);
        const spotLens = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.16, 0.06), mVisor);
        spotLens.position.set(-1.12, 3.38, 0.4);
        att_spotlight.add(spotHousing, spotLens);

        const att_antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.03, 1.35, 6), mSteel);
        att_antenna.position.set(0.55, 4.2, -0.35);

        const att_kneeguards = new THREE.Group();
        for (const sx of [-1, 1]) {
            const kg = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.36, 0.22), mOlive);
            kg.position.set(sx * 0.58, 1.15, 0.28);
            att_kneeguards.add(kg);
        }

        const att_ammodrum = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.56, 12), mGold);
        att_ammodrum.rotation.z = Math.PI / 2;
        att_ammodrum.position.set(0, 2.35, -0.72);

        const att_exhaust = new THREE.Group();
        for (const sx of [-1, 1]) {
            const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.11, 1.15, 8), mSteel);
            pipe.position.set(sx * 0.62, 3.35, -0.68);
            att_exhaust.add(pipe);
        }

        const att_reactor = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.14, 12), mVisor);
        att_reactor.rotation.x = Math.PI / 2;
        att_reactor.position.set(0, 2.82, 0.68);

        const att_buckler = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.68, 0.82), mSteel);
        att_buckler.position.set(-1.42, 2.52, 0.42);

        const att_bayonets = new THREE.Group();
        for (const sx of [-0.08, 0.08]) {
            const blade = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.12, 0.72), mSteel);
            blade.position.set(1.08 + sx, 2.32, 1.65);
            att_bayonets.add(blade);
        }

        const att_halo = new THREE.Mesh(new THREE.TorusGeometry(0.52, 0.05, 8, 18), mVisor);
        att_halo.rotation.x = Math.PI / 2;
        att_halo.position.set(0, 4.15, -0.18);

        const att_crown = new THREE.Group();
        for (const sx of [-1, 1]) {
            const fin = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.42, 0.22), mGold);
            fin.position.set(sx * 0.24, 3.92, 0.18);
            fin.rotation.z = -sx * 0.42;
            att_crown.add(fin);
        }

        // 37mm Sidearm Handcannon (shown when switching to secondary pistol mode)
        const pistolGroup = new THREE.Group();
        pistolGroup.position.set(0.36, -0.58, 0.94);
        pistolGroup.rotation.y = 0.48;
        pistolGroup.visible = false;
        const pBody = outline(new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.2, 0.72), mDark));
        const pCyl = outline(new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.22, 10), mGold));
        pCyl.rotation.x = Math.PI / 2;
        pCyl.position.set(0, 0, -0.08);
        const pFlash = new THREE.Mesh(
            new THREE.SphereGeometry(0.2, 6, 5),
            new THREE.MeshBasicMaterial({ color: 0xffcc44 })
        );
        pFlash.scale.set(1, 1, 1.6);
        pFlash.position.set(0, 0.02, 0.48);
        pFlash.visible = false;
        pistolGroup.add(pBody, pCyl, pFlash);
        lArm.add(pistolGroup);

        const hardpointsGroup = new THREE.Group();
        hardpointsGroup.position.set(0, -2.2, 0);
        hardpointsGroup.add(
            hullArmor, thrusters, shoulderPods, shieldEmitters, cryoVents, legHydraulics, sensorMast,
            att_spotlight, att_antenna, att_kneeguards, att_ammodrum, att_exhaust,
            att_reactor, att_buckler, att_bayonets, att_halo, att_crown
        );
        upperBody.add(rArm, lArm, hardpointsGroup);

        // Chassis-specific high-detail geometry is constructed fresh on every rebuild.
        this._addChassisDetails(
            mech, upperBody, profile, dims,
            { mOlive, mSteel, mDark, mAccent, mHydraulic, mPanel, mHazard },
            legs, { rArm, lArm }, outline
        );

        return {
            root: mech,
            chassisId: profile.id,
            legBaseHipRot: dims.hipBase,
            legBaseShinRot: dims.shinBase,
            legBaseFootRot: dims.footBase,
            upperBody,
            headGroup,
            legs,
            rArm,
            lArm,
            rifleGroup,
            rotaryBarrels,
            pistolGroup,
            rifleFlash,
            pistolFlash: pFlash,
            dashFlames,
            hydraulics,
            thrusterCores,
            thrusterFlames,
            reactorCore,
            mechThrusterLight,
            hardpointsGroup,
            materials: { mOlive, mVisor },
            parts: {
                railBarrel, magnumComp, plasmaCleaver, hullArmor, thrusters, shoulderPods,
                shieldEmitters, cryoVents, legHydraulics, sensorMast,
                att_spotlight, att_antenna, att_kneeguards, att_ammodrum, att_exhaust,
                att_reactor, att_buckler, att_bayonets, att_halo, att_crown
            }
        };
    }

    buildPlayerMech3D() {
        if (!this.scene || this.playerMechGroup) return;
        const useGLB = (this.getChassisProfile().id === 'light' && this.chassisGLB);
        const rig = useGLB ? this._createGLTFMechRig() : this._createProceduralMechRig();
        rig.root.scale.setScalar(useGLB ? 1.0 : 1.18); // GLB is authored at real meter scale
        rig.root.rotation.y = useGLB ? 0 : Math.PI; // glTF forward is -Z; procedural faces +Z
        const wrapper = new THREE.Group();
        wrapper.add(rig.root);
        wrapper.visible = !!this.thirdPersonMode;
        this.scene.add(wrapper);
        this.playerMechGroup = wrapper;
        this.playerMechRig = rig;
        this.currentRigChassisId = rig.chassisId;
        this.mechAnimState = {
            walkBlend: 0, dashBlend: 0, meleeBlend: 0,
            hipL: 0, hipR: 0, shinL: 0, shinR: 0,
            torsoX: 0, torsoY: 0, torsoZ: 0,
            rArmX: 0, rArmY: 0, lArmX: 0, lArmY: 0
        };
        if (this.camera && !this.canopyGroup) {
            this.canopyGroup = this._buildCanopyFrame(this.getChassisProfile());
            this.camera.add(this.canopyGroup);
        }
        this.syncHangarMechUpgrades();
    }

    updatePlayerMechAnimation(p, dt, timeSec, yaw, pitch, isMoving) {
        const rig = this.playerMechRig;
        if (!rig || !p) return;

        // Imported GLB rig: play the Blender-authored walk clip and layer reload motion.
        if (rig.isGLTF) {
            if (rig.mixer) {
                const speed = Math.hypot(p.vx || 0, p.vy || 0);
                if (rig.walkAction) rig.walkAction.timeScale = 0.35 + Math.min(1.7, speed / 110);
                rig.mixer.update(dt * (speed > 20 ? 1 : 0.3));
            }
            let reloadBlend = 0;
            if (p.pistolReloading) {
                const prog = 1 - Math.max(0, Math.min(1, (p.pistolReloadTimer || 0) / 1.0));
                reloadBlend = Math.sin(prog * Math.PI);
            }
            if (rig.rArm) rig.rArm.rotation.x = (rig.rArm.rotation.x || 0) - reloadBlend * 0.35;
            if (rig.lArm) rig.lArm.rotation.x = (rig.lArm.rotation.x || 0) - reloadBlend * 0.55;
            return;
        }

        const st = this.mechAnimState || (this.mechAnimState = {
            walkBlend: 0, dashBlend: 0, meleeBlend: 0,
            hipL: 0, hipR: 0, shinL: 0, shinR: 0,
            torsoX: 0, torsoY: 0, torsoZ: 0,
            rArmX: 0, rArmY: 0, lArmX: 0, lArmY: 0
        });
        const smooth = (cur, tgt, rate) => cur + (tgt - cur) * Math.max(0, Math.min(1, dt * rate));

        // 1) Smooth Walk / Dash / Melee / Stomp Blends (eliminates stop-motion snapping)
        const targetWalk = isMoving && !p.isDashing ? 1.0 : 0.0;
        st.walkBlend = smooth(st.walkBlend, targetWalk, 9.5);
        st.dashBlend = smooth(st.dashBlend, p.isDashing ? 1.0 : 0.0, 14.0);
        const w = st.walkBlend;
        const d = st.dashBlend;
        const aimPitch = pitch || 0; // camera pitch drives the gun-arm elevation

        const phase = this.walkBobPhase || 0;
        const strideSin = Math.sin(phase);
        const strideCos = Math.cos(phase);

        // Heavy mech gait: distinct lift -> swing -> heel-strike -> flat planted stance
        const swingLiftL = Math.max(0, strideCos); // >0 while left leg lifts & swings forward
        const swingLiftR = Math.max(0, -strideCos); // >0 while right leg lifts & swings forward
        const rawHipL = strideSin * 0.46 * w;
        const rawHipR = -strideSin * 0.46 * w;
        const rawShinL = (swingLiftL * 0.74 + Math.max(0, -strideSin) * 0.12) * w;
        const rawShinR = (swingLiftR * 0.74 + Math.max(0, strideSin) * 0.12) * w;

        // Stomp animation (right leg raises & slams down)
        const stompAmt = Math.min(1, (this.stompDip || 0) / 14);
        const stompHip = stompAmt > 0.04 ? -Math.sin(stompAmt * Math.PI) * 0.85 : 0;
        const stompKnee = stompAmt > 0.04 ? Math.sin(stompAmt * Math.PI) * 0.95 : 0;

        // Blend idle, walk, dash, and stomp smoothly
        const tgtHipL = rawHipL * (1 - d) + 0.34 * d;
        const tgtShinL = rawShinL * (1 - d) + 0.28 * d;
        const tgtHipR = rawHipR * (1 - d) - 0.22 * d + stompHip;
        const tgtShinR = rawShinR * (1 - d) + 0.46 * d + stompKnee;

        st.hipL = smooth(st.hipL, tgtHipL, 16);
        st.shinL = smooth(st.shinL, tgtShinL, 16);
        st.hipR = smooth(st.hipR, tgtHipR, 16);
        st.shinR = smooth(st.shinR, tgtShinR, 16);

        const baseHip = rig.legBaseHipRot || 0;
        const baseShin = rig.legBaseShinRot || 0;
        rig.legs.L.hip.rotation.x = baseHip + st.hipL;
        rig.legs.L.shin.rotation.x = baseShin + st.shinL;
        rig.legs.R.hip.rotation.x = baseHip + st.hipR;
        rig.legs.R.shin.rotation.x = baseShin + st.shinR;

        // Chrome actuator rods stroke and compress with the two-beat stride.
        if (rig.hydraulics) {
            for (const side of ['L', 'R']) {
                const h = rig.hydraulics[side];
                const knee = side === 'L' ? st.shinL : st.shinR;
                const hip = side === 'L' ? st.hipL : st.hipR;
                const stroke = Math.max(0.65, Math.min(1.5, 1 + Math.abs(knee) * 0.45 + Math.abs(hip) * 0.2));
                h.thighRod.scale.y = stroke;
                h.shinRod.scale.y = Math.max(0.65, 2 - stroke);
            }
        }

        // Hip vertical lift so swinging foot clearly lifts off the ground before planting
        rig.legs.L.hip.position.y = 1.94 + swingLiftL * 0.2 * w * (1 - d);
        rig.legs.R.hip.position.y = 1.94 + swingLiftR * 0.2 * w * (1 - d) + (stompAmt > 0.04 ? Math.sin(stompAmt * Math.PI) * 0.28 : 0);

        // Ankle articulation: toe-down push-off -> level clearance -> heel-strike -> flat planted sole
        if (rig.legs.L.foot && rig.legs.R.foot) {
            const baseFoot = rig.legBaseFootRot || 0;
            const flatL = -(st.hipL + st.shinL) + baseFoot;
            const flatR = -(st.hipR + st.shinR) + baseFoot;
            const ankleSwingL = (strideSin < 0 ? 0.32 : -0.22) * swingLiftL * w;
            const ankleSwingR = (strideSin > 0 ? 0.32 : -0.22) * swingLiftR * w;
            rig.legs.L.foot.rotation.x = flatL + ankleSwingL + d * 0.35;
            rig.legs.R.foot.rotation.x = flatR + ankleSwingR + d * 0.35;
        }

        // Dash thruster flare
        rig.dashFlames.visible = d > 0.15;
        if (rig.dashFlames.visible) {
            const flicker = (0.85 + Math.sin(timeSec * 45) * 0.25) * d;
            rig.dashFlames.scale.set(1, 1, flicker);
        }

        // Thruster cores flare with movement, erupt into flame cones on dash, and pulse a point light.
        const moveGlow = Math.min(1, Math.hypot(p.vx || 0, p.vy || 0) / 160);
        if (rig.thrusterCores) {
            const pulse = 0.85 + moveGlow * 0.4 + d * 0.55 + Math.sin(timeSec * 7) * 0.06;
            for (const core of rig.thrusterCores) core.scale.setScalar(pulse);
        }
        if (rig.thrusterFlames) {
            for (const flame of rig.thrusterFlames) {
                flame.visible = d > 0.35;
                if (flame.visible) {
                    flame.scale.set(1, 0.6 + d * 0.9 + Math.sin(timeSec * 42) * 0.12, 1);
                }
            }
        }
        if (rig.reactorCore) {
            const reactorPulse = 1 + Math.sin(timeSec * 3.2) * 0.1;
            rig.reactorCore.scale.set(reactorPulse, 1, reactorPulse);
        }
        if (rig.mechThrusterLight) {
            rig.mechThrusterLight.intensity = moveGlow * 0.8 + d * 3.2;
        }

        // Heavy hydraulic stride bounce + idle gyro-stabilized breathing
        const idleBreath = Math.sin(timeSec * 2.1) * 0.025 * (1 - w);
        const strideBob = Math.abs(strideSin) * 0.16 * w;
        rig.root.position.y = strideBob + idleBreath - (this.stompDip || 0) * 0.015;

        // 2) Weight-Shifting Torso Roll, Waist Twist & Aim Pitch
        let waistDiff = (p.facingAngle || 0) - (p.chassisAngle || 0);
        while (waistDiff > Math.PI) waistDiff -= Math.PI * 2;
        while (waistDiff < -Math.PI) waistDiff += Math.PI * 2;
        waistDiff = Math.max(-0.55, Math.min(0.55, waistDiff));

        const meleeT = p.cleaverSlashAnim > 0 ? (1 - p.cleaverSlashAnim / 0.35) : 0;
        const meleeTorsoTwist = p.cleaverSlashAnim > 0 ? Math.sin(meleeT * Math.PI) * -0.58 : 0;

        const tgtTorsoY = waistDiff * 0.45 + meleeTorsoTwist + strideSin * 0.08 * w;
        const tgtTorsoX = d * 0.34 - pitch * 0.28 - (this.recoilPitch || 0) * 0.45 + stompAmt * 0.14 + Math.sin(timeSec * 2.1) * 0.015 * (1 - w);
        const tgtTorsoZ = -strideCos * 0.055 * w; // Shift weight over planted leg

        st.torsoY = smooth(st.torsoY, tgtTorsoY, 15);
        st.torsoX = smooth(st.torsoX, tgtTorsoX, 15);
        st.torsoZ = smooth(st.torsoZ, tgtTorsoZ, 12);

        rig.upperBody.rotation.y = st.torsoY;
        rig.upperBody.rotation.x = st.torsoX;
        rig.upperBody.rotation.z = st.torsoZ;

        // 3) Weapon Switching Blend (0 = 120mm Rifle, 1 = 37mm Pistol)
        const targetSwitch = p.secondaryMode === 'pistol37' ? 1 : 0;
        this.weaponSwitchBlend += (targetSwitch - this.weaponSwitchBlend) * Math.min(1, dt * 11);
        const sw = this.weaponSwitchBlend;
        const switchDip = Math.sin(sw * Math.PI) * 0.35;
        rig.rifleGroup.visible = (sw < 0.55) && p.hasPrimary !== false;
        rig.pistolGroup.visible = sw >= 0.45;

        // 4) Shooting Recoil & Muzzle Flash
        const recoilKick = (this.recoilPunchZ || 0) * 0.45;
        const firing = (this.muzzleFlashTimer || 0) > 0;
        rig.rifleFlash.visible = firing && rig.rifleGroup.visible;
        rig.pistolFlash.visible = firing && rig.pistolGroup.visible;
        if (firing) {
            const fScale = 0.8 + Math.random() * 0.65;
            rig.rifleFlash.scale.set(fScale, fScale, fScale * 1.8);
            rig.pistolFlash.scale.set(fScale, fScale, fScale * 1.6);
        }
        if (rig.rotaryBarrels && rig.rifleGroup.visible && (firing || (this.recoilPunchZ || 0) > 0.015)) {
            rig.rotaryBarrels.rotation.z += dt * 24;
        }

        // 5) Smoothly Damped Right & Left Arm Poses (Rifle vs Pistol vs Melee Slash)
        const meleeSwingX = p.cleaverSlashAnim > 0 ? (-0.95 + meleeT * 1.65) : 0;
        const meleeSwingY = p.cleaverSlashAnim > 0 ? (0.7 - meleeT * 1.75) : 0;

        const tgtRArmX = -aimPitch * 0.72 + sw * 0.55 + switchDip - recoilKick * 0.35 + strideCos * 0.08 * w;
        const tgtRArmY = -sw * 0.25;
        const tgtLArmX = (p.cleaverSlashAnim > 0 ? meleeSwingX : (-aimPitch * 0.72 - sw * 0.72 + switchDip - recoilKick * sw * 0.45)) - strideCos * 0.08 * w;
        const tgtLArmY = p.cleaverSlashAnim > 0 ? meleeSwingY : (-sw * 0.42);

        st.rArmX = smooth(st.rArmX, tgtRArmX, 18);
        st.rArmY = smooth(st.rArmY, tgtRArmY, 16);
        st.lArmX = smooth(st.lArmX, tgtLArmX, p.cleaverSlashAnim > 0 ? 28 : 18);
        st.lArmY = smooth(st.lArmY, tgtLArmY, p.cleaverSlashAnim > 0 ? 28 : 16);

        rig.rArm.rotation.x = st.rArmX;
        rig.rArm.rotation.y = st.rArmY;
        rig.rArm.position.z = 0.08 - recoilKick * (1 - sw) * 0.28;

        rig.lArm.rotation.x = st.lArmX;
        rig.lArm.rotation.y = st.lArmY;
        rig.lArm.position.z = 0.08 - recoilKick * sw * 0.28;
    }

    _applyUpgradesToRig(parts, materials) {
        if (!parts) return;
        const hs = window.hangarSystem;
        const upg = (hs && hs.data && hs.data.upgrades) || {};
        const eqAtt = (hs && hs.data && hs.data.equippedAttachments) || {};
        parts.railBarrel.visible = (upg.heavy_barrel_kit || 0) > 0;
        parts.plasmaCleaver.visible = (upg.plasma_cleaver_edge || 0) > 0;
        parts.magnumComp.visible = (upg.sidearm_mag_core || 0) > 0;
        parts.shoulderPods.visible = (upg.shoulder_pod_rack || 0) > 0;
        parts.hullArmor.visible = (upg.hull_plating || 0) > 0;
        parts.thrusters.visible = (upg.thruster_tuning || 0) > 0;
        parts.shieldEmitters.visible = (upg.reactive_shield_array || 0) > 0;
        parts.cryoVents.visible = (upg.cryo_heat_sinks || 0) > 0;
        parts.legHydraulics.visible = (upg.servo_leg_actuators || 0) > 0;
        parts.sensorMast.visible = (upg.radar_sensor_array || 0) > 0;

        for (const attKey of ['att_spotlight', 'att_antenna', 'att_kneeguards', 'att_ammodrum', 'att_exhaust', 'att_reactor', 'att_buckler', 'att_bayonets', 'att_halo', 'att_crown']) {
            if (parts[attKey]) {
                parts[attKey].visible = !!eqAtt[attKey];
            }
        }

        if (window.GAME_CONFIG && window.GAME_CONFIG.MECH_COSMETICS) {
            const cos = (window.hangarSystem && window.hangarSystem.data && window.hangarSystem.data.cosmetics) || {};
            const liv = window.GAME_CONFIG.MECH_COSMETICS.liveries.find(l => l.id === (cos.livery || 'olive'));
            const vis = window.GAME_CONFIG.MECH_COSMETICS.visors.find(v => v.id === (cos.visor || 'cyan'));
            if (liv && materials && materials.mOlive) {
                materials.mOlive.color.setHex(liv.hex);
            }
            if (vis && materials && materials.mVisor) {
                materials.mVisor.color.setHex(vis.hex);
            }
        }
    }

    syncHangarMechUpgrades() {
        const activeId = this.getChassisProfile().id;
        if (this.currentRigChassisId && this.currentRigChassisId !== activeId &&
            (this.playerMechGroup || this.hangarMechGroup)) {
            this.rebuildChassisMechs();
            return;
        }
        this.currentRigChassisId = activeId;
        this._applyUpgradesToRig(this.hangarParts, this.hangarMaterials);
        if (this.playerMechRig) {
            this._applyUpgradesToRig(this.playerMechRig.parts, this.playerMechRig.materials);
            this._applyGLTFUpgradeVisibility(this.playerMechRig);
        }
    }

    renderHangar(timeSec) {
        if (!this.hangarScene) this.buildHangarMech3D();
        if (this.hangarMechGroup) {
            this.hangarMechGroup.rotation.y = timeSec * 0.45;
        }
        if (this.hangarMotes) {
            const dt = Math.max(0, Math.min(0.05, timeSec - (this._lastHangarTime || timeSec)));
            this._lastHangarTime = timeSec;
            const pos = this.hangarMotes.geometry.attributes.position;
            for (let i = 0; i < pos.count; i++) {
                let y = pos.getY(i) + dt * 0.22;
                if (y > 4.2) y = 0.05;
                pos.setY(i, y);
            }
            pos.needsUpdate = true;
        }
        this.renderer.render(this.hangarScene, this.hangarCamera);
    }

    resize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        if (this.hangarCamera) {
            this.hangarCamera.aspect = window.innerWidth / window.innerHeight;
            this.hangarCamera.updateProjectionMatrix();
        }
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }
}

window.Renderer3D = Renderer3D;
