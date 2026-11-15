// Procedural "Project Warlock" 2.5D Pixel-Art Generator for ORBITAL PERIMETER
// Generates crisp Nearest-Neighbor textures, thick black-outlined sprites,
// 2D first-person pixel minigun/gauntlet frames, and dynamic pilot portraits.

class PixelArtBank {
    constructor() {
        this.canvases = {};
        this.textures = {};
        this.spriteMats = {};
        this.initialized = false;
        this.prevHpSnapshot = null;
        this.hurtFlashTimer = 0;
    }

    init() {
        if (this.initialized) return;
        this.initialized = true;

        this.buildEnvironmentTextures();
        this.buildPropAndPickupSprites();
        this.buildEnemySprites();
        this.buildFxAndDecalSprites();
        this.buildFirstPersonHands();
    }

    createCanvas(w, h) {
        const c = document.createElement('canvas');
        c.width = w;
        c.height = h;
        const ctx = c.getContext('2d', { willReadFrequently: true });
        ctx.imageSmoothingEnabled = false;
        return { canvas: c, ctx };
    }

    // Stamps a crisp 8-neighbor thick black pixel border around opaque pixels
    applyOutline(ctx, w, h, outlineRgba = [8, 5, 6, 255]) {
        const img = ctx.getImageData(0, 0, w, h);
        const src = new Uint8ClampedArray(img.data);
        const dst = img.data;

        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const idx = (y * w + x) * 4;
                if (src[idx + 3] > 100) continue;

                let hasOpaqueNeighbor = false;
                for (let oy = -1; oy <= 1 && !hasOpaqueNeighbor; oy++) {
                    for (let ox = -1; ox <= 1; ox++) {
                        if (ox === 0 && oy === 0) continue;
                        const nx = x + ox;
                        const ny = y + oy;
                        if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
                            if (src[(ny * w + nx) * 4 + 3] > 100) {
                                hasOpaqueNeighbor = true;
                                break;
                            }
                        }
                    }
                }

                if (hasOpaqueNeighbor) {
                    dst[idx] = outlineRgba[0];
                    dst[idx + 1] = outlineRgba[1];
                    dst[idx + 2] = outlineRgba[2];
                    dst[idx + 3] = outlineRgba[3];
                }
            }
        }

        ctx.putImageData(img, 0, 0);
    }

    // Creates a pure silhouette variant (used for 0.05s white hit-flash & red thermal sonar)
    makeSilhouetteCanvas(sourceCanvas, fillHex) {
        const w = sourceCanvas.width;
        const h = sourceCanvas.height;
        const { canvas, ctx } = this.createCanvas(w, h);
        ctx.drawImage(sourceCanvas, 0, 0);

        const img = ctx.getImageData(0, 0, w, h);
        const data = img.data;
        const r = parseInt(fillHex.slice(1, 3), 16);
        const g = parseInt(fillHex.slice(3, 5), 16);
        const b = parseInt(fillHex.slice(5, 7), 16);

        for (let i = 0; i < data.length; i += 4) {
            if (data[i + 3] < 100) continue;
            // Preserve black outline pixels while recoloring interior
            const isOutline = data[i] < 24 && data[i + 1] < 24 && data[i + 2] < 24;
            if (!isOutline) {
                data[i] = r;
                data[i + 1] = g;
                data[i + 2] = b;
            }
        }
        ctx.putImageData(img, 0, 0);
        return canvas;
    }

    toTexture(canvas, repeatX = 1, repeatY = 1) {
        if (typeof THREE === 'undefined') return null;
        const tex = new THREE.CanvasTexture(canvas);
        tex.magFilter = THREE.NearestFilter;
        tex.minFilter = THREE.NearestFilter;
        tex.generateMipmaps = false;
        if (repeatX > 1 || repeatY > 1) {
            tex.wrapS = THREE.RepeatWrapping;
            tex.wrapT = THREE.RepeatWrapping;
            tex.repeat.set(repeatX, repeatY);
        }
        tex.needsUpdate = true;
        return tex;
    }

    toSpriteMaterial(canvas, extra = {}) {
        if (typeof THREE === 'undefined') return null;
        const tex = this.toTexture(canvas);
        return new THREE.SpriteMaterial({
            map: tex,
            alphaTest: 0.45,
            transparent: false,
            fog: true,
            ...extra
        });
    }

    // Helper for deterministic pseudo-random grit
    hash(x, y, seed = 1337) {
        const n = Math.sin(x * 127.1 + y * 311.7 + seed * 74.7) * 43758.5453;
        return n - Math.floor(n);
    }

    px(ctx, x, y, w, h, color) {
        ctx.fillStyle = color;
        ctx.fillRect(Math.floor(x), Math.floor(y), Math.floor(w), Math.floor(h));
    }

    buildEnvironmentTextures() {
        // 1) Cracked Sandstone Desert Floor Tile (64x64) matching Project Warlock tiles
        const { canvas: floorC, ctx: fCtx } = this.createCanvas(64, 64);
        const baseColors = ['#8c5424', '#9c602c', '#7a461c', '#a86a34', '#693c18'];
        for (let y = 0; y < 64; y += 2) {
            for (let x = 0; x < 64; x += 2) {
                const n = this.hash(x, y, 11);
                const col = n > 0.85 ? baseColors[3] : n > 0.55 ? baseColors[1] : n > 0.25 ? baseColors[0] : baseColors[2];
                this.px(fCtx, x, y, 2, 2, col);
            }
        }

        // Bold black pixel slab seams (2px wide) + warm edge bevel highlight
        const hSplits = [0, 32];
        for (const sy of hSplits) {
            this.px(fCtx, 0, sy, 64, 2, '#0b0604');
            this.px(fCtx, 0, sy + 2, 64, 1, '#c07c40');
        }
        // Offset vertical mortar seams for stone paver look
        this.px(fCtx, 14, 0, 2, 32, '#0b0604');
        this.px(fCtx, 16, 2, 1, 30, '#c07c40');
        this.px(fCtx, 46, 0, 2, 32, '#0b0604');
        this.px(fCtx, 48, 2, 1, 30, '#c07c40');

        this.px(fCtx, 30, 32, 2, 32, '#0b0604');
        this.px(fCtx, 32, 34, 1, 30, '#c07c40');
        this.px(fCtx, 62, 32, 2, 32, '#0b0604');

        // Jagged diagonal cracks across slabs
        const cracks = [
            [4, 8], [6, 10], [8, 12], [8, 14], [10, 16], [12, 16],
            [24, 18], [26, 20], [28, 20], [30, 22], [32, 24],
            [42, 42], [44, 44], [46, 46], [48, 46], [50, 48],
            [10, 48], [12, 50], [14, 52], [16, 52]
        ];
        for (const [cx, cy] of cracks) {
            this.px(fCtx, cx, cy, 2, 2, '#120a05');
            this.px(fCtx, cx + 2, cy, 1, 2, '#4d2b12');
        }
        // Subtle scattered desert dust speckles & dark pits
        for (let i = 0; i < 42; i++) {
            const sx = Math.floor(this.hash(i, 3, 99) * 62);
            const sy = Math.floor(this.hash(i, 7, 99) * 62);
            this.px(fCtx, sx, sy, 2, 2, i % 3 === 0 ? '#3a200e' : '#b8763a');
        }

        this.canvases.sandstoneFloor = floorC;
        this.textures.sandstoneFloor = this.toTexture(floorC, 90, 90);

        // 2) Fluted Pixel Sandstone Pillar Texture (64x64) with bold terracotta band
        const { canvas: pilC, ctx: pCtx } = this.createCanvas(64, 64);
        this.px(pCtx, 0, 0, 64, 64, '#928e84');
        // Fluted vertical stone ribs with black outlines
        for (let x = 0; x < 64; x += 8) {
            this.px(pCtx, x, 0, 2, 64, '#0c0908');
            this.px(pCtx, x + 2, 0, 2, 64, '#c4c0b4');
            this.px(pCtx, x + 4, 0, 2, 64, '#949086');
            this.px(pCtx, x + 6, 0, 2, 64, '#66625a');
        }
        // Horizontal stone ring bands + bold painted orange-red band in middle
        this.px(pCtx, 0, 0, 64, 6, '#7a766c');
        this.px(pCtx, 0, 6, 64, 2, '#0c0908');
        this.px(pCtx, 0, 56, 64, 2, '#0c0908');
        this.px(pCtx, 0, 58, 64, 6, '#625e56');

        // Terracotta War-Band with black borders
        this.px(pCtx, 0, 24, 64, 2, '#0c0908');
        this.px(pCtx, 0, 26, 64, 14, '#b84e24');
        for (let x = 0; x < 64; x += 8) {
            this.px(pCtx, x, 26, 2, 14, '#180c08');
            this.px(pCtx, x + 2, 26, 2, 14, '#d96934');
        }
        this.px(pCtx, 0, 40, 64, 2, '#0c0908');

        this.canvases.pillarTex = pilC;
        this.textures.pillarTex = this.toTexture(pilC, 1, 1);

        // 3) Ruined Sandstone Brick / Bunker Wall Texture (64x64)
        const { canvas: brkC, ctx: bCtx } = this.createCanvas(64, 64);
        this.px(bCtx, 0, 0, 64, 64, '#7d4d23');
        const rows = 4;
        const rowH = 16;
        for (let r = 0; r < rows; r++) {
            const y0 = r * rowH;
            const offset = (r % 2) * 16;
            for (let bx = -16; bx < 64; bx += 32) {
                const rx = (bx + offset + 64) % 64;
                // Brick fill with mottled sandstone pixels
                for (let py = y0 + 2; py < y0 + rowH - 1; py += 2) {
                    for (let px = bx + 2; px < bx + 31; px += 2) {
                        const wx = ((px % 64) + 64) % 64;
                        const h = this.hash(wx, py, r * 17 + 5);
                        const c = h > 0.72 ? '#b87638' : h > 0.3 ? '#945b28' : '#6b3d17';
                        this.px(bCtx, wx, py, 2, 2, c);
                    }
                }
                // Highlight top edge of brick
                for (let px = bx + 2; px < bx + 30; px += 2) {
                    const wx = ((px % 64) + 64) % 64;
                    this.px(bCtx, wx, y0 + 2, 2, 2, '#cc8b48');
                }
                // Vertical black mortar seam
                const seamX = ((bx + offset + 64) % 64);
                this.px(bCtx, seamX, y0, 2, rowH, '#0b0604');
                void rx;
            }
            // Horizontal black mortar seam
            this.px(bCtx, 0, y0, 64, 2, '#0b0604');
        }
        // Weathering cracks on random bricks
        this.px(bCtx, 10, 8, 2, 6, '#140a05');
        this.px(bCtx, 42, 24, 6, 2, '#140a05');
        this.px(bCtx, 22, 50, 2, 8, '#140a05');

        this.canvases.ruinBrick = brkC;
        this.textures.ruinBrick = this.toTexture(brkC, 1, 1);

        // 4) Ancient Rune Monolith Tablet (48x64)
        const { canvas: monoC, ctx: mCtx } = this.createCanvas(48, 64);
        this.px(mCtx, 0, 0, 48, 64, '#241838');
        this.px(mCtx, 2, 2, 44, 60, '#5a3a7a');
        this.px(mCtx, 4, 4, 40, 56, '#462a64');
        // Vertical glowing cyan/gold glyph runes & alien symbols
        this.px(mCtx, 22, 4, 4, 56, '#180c28');
        // Left rune
        this.px(mCtx, 10, 12, 8, 2, '#e6b8ff');
        this.px(mCtx, 10, 14, 2, 10, '#e6b8ff');
        this.px(mCtx, 16, 14, 2, 10, '#e6b8ff');
        this.px(mCtx, 10, 20, 8, 2, '#e6b8ff');
        this.px(mCtx, 12, 26, 4, 18, '#caa0ff');
        this.px(mCtx, 8, 44, 12, 2, '#caa0ff');
        // Right rune
        this.px(mCtx, 30, 14, 8, 10, '#ffe066');
        this.px(mCtx, 32, 16, 4, 6, '#462a64');
        this.px(mCtx, 33, 24, 2, 20, '#ffe066');
        this.px(mCtx, 28, 34, 12, 2, '#ffe066');
        this.px(mCtx, 30, 44, 8, 2, '#ffe066');
        // Thick black border frame
        this.px(mCtx, 0, 0, 48, 2, '#080508');
        this.px(mCtx, 0, 62, 48, 2, '#080508');
        this.px(mCtx, 0, 0, 2, 64, '#080508');
        this.px(mCtx, 46, 0, 2, 64, '#080508');

        this.canvases.monolithRune = monoC;
        this.textures.monolithRune = this.toTexture(monoC, 1, 1);

        // 5) Seamless Warm Wind-Rippled Desert Sand Texture (128x128, NearestFilter, zero harsh banding)
        const { canvas: sandC, ctx: sCtx } = this.createCanvas(128, 128);
        const sandPalette = ['#422b1c', '#573824', '#704830', '#8c5b3c', '#a86f4b', '#c4855b'];
        for (let y = 0; y < 128; y += 2) {
            for (let x = 0; x < 128; x += 2) {
                // Gentle continuous wind ripples with subtle organic wandering
                const warp = Math.sin(x * Math.PI / 64) * 4.5 + Math.cos((x * 2 + y) * Math.PI / 64) * 2.0;
                const wave = Math.sin((y + warp) * (Math.PI / 16));
                const micro = Math.sin((y * 2 + Math.cos(x * Math.PI / 32) * 2) * (Math.PI / 8)) * 0.18;
                const grain = (this.hash(x, y, 404) - 0.5) * 0.35;
                const val = wave * 0.55 + micro + grain;
                let col = sandPalette[2];
                if (val > 0.52) col = sandPalette[5];
                else if (val > 0.22) col = sandPalette[4];
                else if (val > -0.08) col = sandPalette[3];
                else if (val < -0.48) col = sandPalette[0];
                else col = sandPalette[1];
                this.px(sCtx, x, y, 2, 2, col);
            }
        }
        this.canvases.desertSand = sandC;
        this.textures.desertSand = this.toTexture(sandC, 1, 1);
        if (this.textures.desertSand) {
            this.textures.desertSand.wrapS = THREE.RepeatWrapping;
            this.textures.desertSand.wrapT = THREE.RepeatWrapping;
        }

        // 6) Stratified Canyon Sandstone & Sedimentary Ledge Texture (128x128)
        const { canvas: rockC, ctx: rCtx } = this.createCanvas(128, 128);
        const rockPalette = ['#160d08', '#2b1a11', '#42291b', '#5e3b27', '#7d4f34', '#9e6643', '#bd7f56'];
        for (let y = 0; y < 128; y += 2) {
            for (let x = 0; x < 128; x += 2) {
                // Periodic sedimentary strata bands + diagonal shear warps
                const warp = Math.sin(x * Math.PI / 64) * 5 + Math.cos(x * Math.PI / 32) * 2.5;
                const bandPhase = (y + warp) * (Math.PI / 16);
                const strata = Math.sin(bandPhase) * 0.65 + Math.sin(bandPhase * 3.0) * 0.32;
                const verticalCrack = Math.abs(Math.sin((x + y * 0.25) * (Math.PI / 32))) < 0.08 ? -0.55 : 0;
                const grit = (this.hash(x, y, 512) - 0.5) * 0.55;
                const v = strata + verticalCrack + grit;
                let col = rockPalette[2];
                if (v > 0.72) col = rockPalette[6];
                else if (v > 0.45) col = rockPalette[5];
                else if (v > 0.16) col = rockPalette[4];
                else if (v > -0.14) col = rockPalette[3];
                else if (v < -0.58) col = rockPalette[0];
                else if (v < -0.28) col = rockPalette[1];
                this.px(rCtx, x, y, 2, 2, col);
            }
        }
        // Deep horizontal sedimentary undercuts & vertical tectonic fissures
        for (let i = 0; i < 24; i++) {
            const rx = Math.floor(this.hash(i, 5, 610) * 56) * 2;
            const ry = Math.floor(this.hash(i, 9, 610) * 60) * 2;
            this.px(rCtx, rx, ry, 10, 2, '#160d08');
            if (ry + 2 < 128) this.px(rCtx, rx, ry + 2, 8, 2, '#bd7f56');
        }
        for (let i = 0; i < 14; i++) {
            const fx = Math.floor(this.hash(i, 17, 611) * 62) * 2;
            const fy = Math.floor(this.hash(i, 23, 611) * 52) * 2;
            this.px(rCtx, fx, fy, 2, 12, '#160d08');
        }
        this.canvases.desertRock = rockC;
        this.textures.desertRock = this.toTexture(rockC, 1, 1);
        if (this.textures.desertRock) {
            this.textures.desertRock.wrapS = THREE.RepeatWrapping;
            this.textures.desertRock.wrapT = THREE.RepeatWrapping;
        }

        // 7) Ribbed Fossil Carapace / Mega-Shell Texture (64x64)
        const { canvas: fosC, ctx: foCtx } = this.createCanvas(64, 64);
        for (let y = 0; y < 64; y += 2) {
            for (let x = 0; x < 64; x += 2) {
                const band = y % 16;
                const grit = this.hash(x, y, 808);
                let col = '#7d705c';
                if (band < 2) col = '#362f25';
                else if (band < 4) col = '#52483a';
                else if (band >= 6 && band < 10) col = grit > 0.45 ? '#998a72' : '#7d705c';
                else if (grit > 0.78) col = '#52483a';
                this.px(foCtx, x, y, 2, 2, col);
            }
        }
        // Vertical chitin segment seams
        for (let x = 0; x < 64; x += 16) {
            this.px(foCtx, x, 0, 2, 64, '#362f25');
            this.px(foCtx, x + 2, 0, 2, 64, '#998a72');
        }
        this.canvases.fossilShell = fosC;
        this.textures.fossilShell = this.toTexture(fosC, 1, 1);
        if (this.textures.fossilShell) {
            this.textures.fossilShell.wrapS = THREE.RepeatWrapping;
            this.textures.fossilShell.wrapT = THREE.RepeatWrapping;
        }
    }

    buildPropAndPickupSprites() {
        // 1) Bleached Alien Skull & Chitin Pile (48x32)
        {
            const { canvas, ctx } = this.createCanvas(48, 32);
            // Back bones & broken chitin shards
            this.px(ctx, 10, 20, 28, 8, '#7a756c');
            this.px(ctx, 14, 16, 20, 8, '#a8a296');
            // Center large skull
            this.px(ctx, 19, 8, 10, 9, '#d8d2c4');
            this.px(ctx, 21, 7, 6, 2, '#ede8dc');
            this.px(ctx, 21, 17, 6, 4, '#c4beb0');
            // Eye sockets + nose
            this.px(ctx, 20, 12, 3, 3, '#100c0a');
            this.px(ctx, 25, 12, 3, 3, '#100c0a');
            this.px(ctx, 23, 15, 2, 2, '#100c0a');
            // Left smaller skull
            this.px(ctx, 8, 17, 8, 7, '#c6c0b2');
            this.px(ctx, 9, 20, 2, 2, '#100c0a');
            this.px(ctx, 13, 20, 2, 2, '#100c0a');
            // Right skull + ribs
            this.px(ctx, 31, 16, 8, 7, '#ccc6b8');
            this.px(ctx, 32, 19, 2, 2, '#100c0a');
            this.px(ctx, 36, 19, 2, 2, '#100c0a');
            this.px(ctx, 6, 24, 36, 4, '#928c80');
            this.applyOutline(ctx, 48, 32);

            this.canvases.skullPile = canvas;
            this.textures.skullPile = this.toTexture(canvas);
            this.spriteMats.skullPile = this.toSpriteMaterial(canvas);
        }

        // 1b) Detailed Spiky Desert Yucca / Agave Rosette Scrub (48x48)
        {
            const { canvas, ctx } = this.createCanvas(48, 48);
            // Grounded sand shadow base
            this.px(ctx, 10, 41, 28, 5, '#1c120c');
            this.px(ctx, 14, 39, 20, 4, '#1c2619');

            // Radial agave sword-blades from center rosette outward
            const drawBlade = (x0, y0, x1, y1, width, baseCol, midCol, tipCol) => {
                const steps = 16;
                for (let s = 0; s <= steps; s++) {
                    const t = s / steps;
                    const bx = Math.round(x0 + (x1 - x0) * t);
                    const by = Math.round(y0 + (y1 - y0) * t);
                    const w = Math.max(1, Math.round(width * (1 - t * 0.72)));
                    const col = t > 0.78 ? tipCol : t > 0.38 ? midCol : baseCol;
                    this.px(ctx, bx - Math.floor(w / 2), by, w, Math.max(1, Math.floor(w * 0.85)), col);
                }
            };

            // Back/shadow fronds
            drawBlade(24, 41, 6, 24, 5, '#1c2619', '#2d3d28', '#688257');
            drawBlade(24, 41, 42, 23, 5, '#1c2619', '#2d3d28', '#8ca36c');
            drawBlade(24, 41, 11, 13, 5, '#1c2619', '#2d3d28', '#688257');
            drawBlade(24, 41, 37, 12, 5, '#2d3d28', '#41573b', '#b89458');
            // Upright central core spines
            drawBlade(24, 42, 18, 6, 5, '#2d3d28', '#41573b', '#8ca36c');
            drawBlade(24, 42, 30, 5, 5, '#2d3d28', '#688257', '#b89458');
            drawBlade(24, 42, 24, 3, 6, '#2d3d28', '#41573b', '#b89458');
            // Lower foreground outer spikes with warm sunset rim tips
            drawBlade(24, 42, 3, 35, 5, '#1c2619', '#2d3d28', '#8ca36c');
            drawBlade(24, 42, 45, 34, 5, '#1c2619', '#41573b', '#b89458');

            this.applyOutline(ctx, 48, 48, [12, 10, 8, 255]);
            this.canvases.desertScrub = canvas;
            this.textures.desertScrub = this.toTexture(canvas);
            this.spriteMats.desertScrub = this.toSpriteMaterial(canvas);
        }

        // 1c) Gnarled Wind-Blasted Desert Dry Tree / Joshua Silhouette (48x64)
        {
            const { canvas, ctx } = this.createCanvas(48, 64);
            // Exposed roots in sand
            this.px(ctx, 13, 58, 22, 4, '#1e130c');
            this.px(ctx, 17, 55, 14, 5, '#332015');

            const drawBranch = (x0, y0, x1, y1, r0, r1) => {
                const steps = 22;
                for (let s = 0; s <= steps; s++) {
                    const t = s / steps;
                    const curve = Math.sin(t * Math.PI) * (x1 > x0 ? -2.2 : 2.2);
                    const bx = Math.round(x0 + (x1 - x0) * t + curve);
                    const by = Math.round(y0 + (y1 - y0) * t);
                    const w = Math.max(1, Math.round(r0 + (r1 - r0) * t));
                    this.px(ctx, bx - Math.floor(w / 2), by, w, Math.max(2, Math.floor(w * 0.9)), '#1e130c');
                    if (w >= 3) {
                        this.px(ctx, bx - Math.floor(w / 4), by, Math.max(1, w - 2), Math.max(1, Math.floor(w * 0.6)), '#332015');
                    }
                    // Warm sunset-lit right-hand bark rim highlight
                    const rimCol = t > 0.55 ? '#a66c46' : '#7a4e32';
                    this.px(ctx, bx + Math.max(0, Math.floor(w / 2) - 1), by, 1, 2, rimCol);
                }
            };

            // Main twisted trunk leaning subtly left then right
            drawBranch(24, 59, 22, 32, 7, 5);
            drawBranch(22, 33, 25, 16, 5, 3);
            // Craggy dead branches reaching skyward
            drawBranch(23, 35, 9, 19, 4, 1);
            drawBranch(13, 24, 5, 12, 2, 1);
            drawBranch(24, 29, 39, 14, 4, 1);
            drawBranch(34, 19, 43, 8, 2, 1);
            drawBranch(24, 19, 17, 7, 3, 1);
            drawBranch(25, 17, 31, 4, 2, 1);
            // Bark crevices
            this.px(ctx, 21, 40, 2, 8, '#120b07');
            this.px(ctx, 23, 24, 2, 6, '#4d3120');

            this.applyOutline(ctx, 48, 64, [12, 10, 8, 255]);
            this.canvases.desertDryTree = canvas;
            this.textures.desertDryTree = this.toTexture(canvas);
            this.spriteMats.desertDryTree = this.toSpriteMaterial(canvas);
        }

        // 1d) Jagged Layered Sandstone Talus / Scree Boulder Cluster (48x32)
        {
            const { canvas, ctx } = this.createCanvas(48, 32);
            // Base scree shadow
            this.px(ctx, 5, 27, 38, 4, '#160d08');

            // Center angular monolith boulder
            const drawRockShard = (cx, baseY, w, h, leanPx) => {
                for (let row = 0; row < h; row++) {
                    const t = row / h;
                    const rowW = Math.max(2, Math.round(w * (1 - Math.pow(t, 1.35))));
                    const lx = Math.round(cx - rowW / 2 + leanPx * t);
                    const py = baseY - row;
                    const band = (row % 5 < 2) ? '#42291b' : '#2b1a11';
                    this.px(ctx, lx, py, rowW, 1, band);
                    if (rowW >= 4) {
                        this.px(ctx, lx + Math.floor(rowW * 0.45), py, Math.ceil(rowW * 0.4), 1, '#5e3b27');
                    }
                    // Warm sunset rim highlight on right-facing sloped facets
                    const rim = (row % 6 < 2) ? '#bd7f56' : '#9e6643';
                    this.px(ctx, lx + rowW - Math.min(2, rowW), py, Math.min(2, rowW), 1, rim);
                    if (rowW >= 6 && row % 4 === 0) {
                        this.px(ctx, lx + 1, py, Math.floor(rowW * 0.5), 1, '#160d08');
                    }
                }
            };

            drawRockShard(15, 28, 16, 15, -3);
            drawRockShard(27, 29, 20, 22, 4);
            drawRockShard(37, 28, 13, 12, 3);
            drawRockShard(8, 29, 10, 8, -2);

            this.applyOutline(ctx, 48, 32, [12, 10, 8, 255]);
            this.canvases.desertRockCluster = canvas;
            this.textures.desertRockCluster = this.toTexture(canvas);
            this.spriteMats.desertRockCluster = this.toSpriteMaterial(canvas);
        }

        // 2) Iron-Bound Supply Chest Overflowing with Gold/Relics (48x48)
        {
            const { canvas, ctx } = this.createCanvas(48, 48);
            // Open lid angled back
            this.px(ctx, 10, 12, 28, 10, '#5a3a22');
            this.px(ctx, 12, 13, 24, 3, '#7e5232');
            this.px(ctx, 10, 12, 4, 10, '#626c78');
            this.px(ctx, 34, 12, 4, 10, '#626c78');
            // Overflowing bright gold/amber cores
            this.px(ctx, 13, 18, 22, 7, '#ffaa00');
            this.px(ctx, 15, 16, 18, 6, '#ffe44d');
            this.px(ctx, 19, 15, 10, 4, '#ffffff');
            this.px(ctx, 22, 19, 4, 4, '#00ffcc'); // High-tech relic glint inside
            // Lower chest box
            this.px(ctx, 9, 23, 30, 16, '#6e4728');
            this.px(ctx, 11, 24, 26, 3, '#8f5e38');
            // Iron straps & lock plate
            this.px(ctx, 9, 23, 4, 16, '#768290');
            this.px(ctx, 35, 23, 4, 16, '#768290');
            this.px(ctx, 9, 36, 30, 3, '#525b66');
            this.px(ctx, 21, 24, 6, 7, '#ffcc22');
            this.px(ctx, 23, 26, 2, 3, '#1a120a');
            this.applyOutline(ctx, 48, 48);

            this.canvases.chest = canvas;
            this.textures.chest = this.toTexture(canvas);
            this.spriteMats.chest = this.toSpriteMaterial(canvas);
        }

        // 3) Glowing XP Relic Crystal (32x32)
        {
            const { canvas, ctx } = this.createCanvas(32, 32);
            this.px(ctx, 14, 5, 4, 4, '#b8ffff');
            this.px(ctx, 11, 9, 10, 6, '#00ffcc');
            this.px(ctx, 9, 15, 14, 7, '#00ccaa');
            this.px(ctx, 12, 22, 8, 5, '#008877');
            this.px(ctx, 14, 27, 4, 2, '#006655');
            // Facet shine
            this.px(ctx, 12, 10, 3, 10, '#e6ffff');
            this.applyOutline(ctx, 32, 32);

            this.canvases.xp = canvas;
            this.spriteMats.xp = this.toSpriteMaterial(canvas);
        }

        // 4) Golden Exosuit Scrap Cog/Relic (32x32)
        {
            const { canvas, ctx } = this.createCanvas(32, 32);
            this.px(ctx, 13, 6, 6, 20, '#ffaa11');
            this.px(ctx, 6, 13, 20, 6, '#ffaa11');
            this.px(ctx, 9, 9, 14, 14, '#ffcc33');
            this.px(ctx, 12, 12, 8, 8, '#302010');
            this.px(ctx, 10, 10, 3, 3, '#fff6a8');
            this.applyOutline(ctx, 32, 32);

            this.canvases.scrap = canvas;
            this.spriteMats.scrap = this.toSpriteMaterial(canvas);
        }

        // 5) Floating '+' Gold Pixel Sparkle (16x16)
        {
            const { canvas, ctx } = this.createCanvas(16, 16);
            this.px(ctx, 7, 3, 2, 10, '#ffe844');
            this.px(ctx, 3, 7, 10, 2, '#ffe844');
            this.px(ctx, 6, 6, 4, 4, '#ffffff');
            this.applyOutline(ctx, 16, 16);

            this.canvases.sparkle = canvas;
            this.spriteMats.sparkle = this.toSpriteMaterial(canvas);
        }
    }

    buildEnemySprites() {
        const makeFrames = (w, h, drawFn) => {
            const { canvas: c0, ctx: x0 } = this.createCanvas(w, h);
            drawFn(x0, 0);
            this.applyOutline(x0, w, h);

            const { canvas: c1, ctx: x1 } = this.createCanvas(w, h);
            drawFn(x1, 1);
            this.applyOutline(x1, w, h);

            const flashC = this.makeSilhouetteCanvas(c0, '#ffffff');
            const thermalC = this.makeSilhouetteCanvas(c0, '#ff3311');

            return {
                canvases: { f0: c0, f1: c1, flash: flashC, thermal: thermalC },
                mats: {
                    f0: this.toSpriteMaterial(c0),
                    f1: this.toSpriteMaterial(c1),
                    flash: this.toSpriteMaterial(flashC),
                    thermal: this.toSpriteMaterial(thermalC, { fog: false })
                }
            };
        };

        // 1) Skitterer (40x40): Fierce crimson arachnid swarmer
        this.spriteMats.skitterer = makeFrames(40, 40, (ctx, frame) => {
            const legShift = frame === 0 ? 0 : 3;
            // 6 Scuttling legs
            this.px(ctx, 4, 18 + legShift, 10, 3, '#5c140c');
            this.px(ctx, 4, 18 + legShift, 3, 12, '#3a0a06');
            this.px(ctx, 6, 25 - legShift, 8, 3, '#7a1c12');
            this.px(ctx, 6, 25 - legShift, 3, 10, '#440d08');

            this.px(ctx, 26, 18 - legShift, 10, 3, '#5c140c');
            this.px(ctx, 33, 18 - legShift, 3, 12, '#3a0a06');
            this.px(ctx, 26, 25 + legShift, 8, 3, '#7a1c12');
            this.px(ctx, 31, 25 + legShift, 3, 10, '#440d08');

            // Segmented crimson thorax & dorsal ridge
            this.px(ctx, 13, 11, 14, 16, '#aa1e12');
            this.px(ctx, 15, 9, 10, 5, '#d43322');
            this.px(ctx, 17, 13, 6, 11, '#ee4428');
            // Dorsal highlight
            this.px(ctx, 19, 14, 2, 7, '#ff7744');
            // Eyes + snapping white mandibles
            this.px(ctx, 15, 19, 3, 3, '#ffee22');
            this.px(ctx, 22, 19, 3, 3, '#ffee22');
            const mSpread = frame === 0 ? 0 : 2;
            this.px(ctx, 15 - mSpread, 26, 3, 6, '#e8dcc8');
            this.px(ctx, 22 + mSpread, 26, 3, 6, '#e8dcc8');
        }).mats;

        // 2) Acid Spitter (44x44): Bloated toxic venom sac bug
        this.spriteMats.acid_spitter = makeFrames(44, 44, (ctx, frame) => {
            const pulse = frame === 0 ? 0 : 2;
            // Legs
            this.px(ctx, 5, 22 + pulse, 10, 3, '#224418');
            this.px(ctx, 5, 22 + pulse, 3, 14, '#182e10');
            this.px(ctx, 29, 22 - pulse, 10, 3, '#224418');
            this.px(ctx, 36, 22 - pulse, 3, 14, '#182e10');

            // High glowing toxic green venom sac behind head
            this.px(ctx, 13 - pulse, 7, 18 + pulse * 2, 14, '#22aa33');
            this.px(ctx, 16, 9, 12, 10, '#44ff55');
            this.px(ctx, 19, 11, 6, 5, '#ccffaa');

            // Olive armored head
            this.px(ctx, 15, 18, 14, 14, '#2d5822');
            this.px(ctx, 18, 20, 8, 7, '#3f7630');
            // 3 Glowing neon green eyes
            this.px(ctx, 16, 22, 3, 3, '#aaff00');
            this.px(ctx, 25, 22, 3, 3, '#aaff00');
            this.px(ctx, 21, 19, 2, 3, '#aaff00');
            // Dripping acid mouth
            this.px(ctx, 18, 28, 8, 4 + pulse, '#55ff33');
            this.px(ctx, 20, 33 + pulse, 4, 3, '#99ff66');
        }).mats;

        // 3) Carapace Charger (48x48): Massive bronze/amber horned beetle
        this.spriteMats.carapace_charger = makeFrames(48, 48, (ctx, frame) => {
            const stomp = frame === 0 ? 0 : 2;
            // Heavy armored legs
            this.px(ctx, 5, 26 + stomp, 8, 14, '#542c10');
            this.px(ctx, 35, 26 - stomp, 8, 14, '#542c10');
            // Giant ivory/gold curving ram horns
            this.px(ctx, 7, 6 + stomp, 5, 16, '#ffbb33');
            this.px(ctx, 11, 16 + stomp, 6, 5, '#dd8811');
            this.px(ctx, 36, 6 + stomp, 5, 16, '#ffbb33');
            this.px(ctx, 31, 16 + stomp, 6, 5, '#dd8811');
            // Horn white speculars
            this.px(ctx, 8, 8 + stomp, 2, 8, '#fff2aa');
            this.px(ctx, 37, 8 + stomp, 2, 8, '#fff2aa');

            // Massive bronze carapace dome
            this.px(ctx, 12, 13, 24, 24, '#884414');
            this.px(ctx, 15, 11, 18, 8, '#aa5c22');
            this.px(ctx, 17, 15, 14, 15, '#c4722c');
            // Furnace chest vents + fierce red eyes
            this.px(ctx, 16, 23, 4, 4, '#ff3300');
            this.px(ctx, 28, 23, 4, 4, '#ff3300');
            this.px(ctx, 20, 29, 8, 4, '#ff7711');
        }).mats;

        // 4) Brood-Guard & Apex Broodmother Bosses (64x64)
        const buildBoss = (shellDark, shellMid, coreBright, hornCol) => makeFrames(64, 64, (ctx, frame) => {
            const step = frame === 0 ? 0 : 4;
            // 8 Towering scythe legs
            for (let i = 0; i < 3; i++) {
                const ly = 20 + i * 10;
                const d = (i % 2 === 0 ? step : -step);
                this.px(ctx, 4, ly + d, 14, 4, shellDark);
                this.px(ctx, 4, ly + d, 4, 15, shellMid);
                this.px(ctx, 46, ly - d, 14, 4, shellDark);
                this.px(ctx, 56, ly - d, 4, 15, shellMid);
            }
            // Crown spikes
            this.px(ctx, 16, 6, 5, 12, hornCol);
            this.px(ctx, 29, 4, 6, 13, hornCol);
            this.px(ctx, 43, 6, 5, 12, hornCol);
            // Massive torso shell
            this.px(ctx, 14, 15, 36, 36, shellDark);
            this.px(ctx, 18, 13, 28, 30, shellMid);
            // Glowing weak-point core
            this.px(ctx, 24, 24, 16, 14, coreBright);
            this.px(ctx, 28, 27, 8, 8, '#ffffff');
            // Quad glowing boss eyes
            this.px(ctx, 20, 20, 4, 4, '#ffff33');
            this.px(ctx, 40, 20, 4, 4, '#ffff33');
            this.px(ctx, 25, 22, 3, 3, '#ff4444');
            this.px(ctx, 36, 22, 3, 3, '#ff4444');
            // Huge fangs
            this.px(ctx, 22, 46, 5, 10, '#f2e8dc');
            this.px(ctx, 37, 46, 5, 10, '#f2e8dc');
        }).mats;

        this.spriteMats.brood_guard = buildBoss('#4a0826', '#8a1444', '#ff1166', '#ffaa22');
        this.spriteMats.apex_broodmother = buildBoss('#2a0846', '#5e168c', '#d522ff', '#00ffcc');
        this.spriteMats.siege_beetle = this.spriteMats.carapace_charger;

        // 5) Dune Sand-Stalker (42x42): Ochre subterranean ambusher with digging mandibles
        this.spriteMats.sand_stalker = makeFrames(42, 42, (ctx, frame) => {
            const shift = frame === 0 ? 0 : 2;
            this.px(ctx, 5, 22 + shift, 9, 4, '#6e4d20');
            this.px(ctx, 28, 22 - shift, 9, 4, '#6e4d20');
            this.px(ctx, 11, 12, 20, 18, '#a67a38');
            this.px(ctx, 14, 14, 14, 12, '#cfa258');
            this.px(ctx, 17, 16, 8, 6, '#ebd08a');
            this.px(ctx, 15, 22, 3, 3, '#ff9922');
            this.px(ctx, 24, 22, 3, 3, '#ff9922');
            this.px(ctx, 13 - shift, 28, 5, 7, '#e8dcc8');
            this.px(ctx, 24 + shift, 28, 5, 7, '#e8dcc8');
        }).mats;

        // 6) Shrieker-Mite (40x40): Aerial cyan-obsidian radar jammer
        this.spriteMats.shrieker_mite = makeFrames(40, 40, (ctx, frame) => {
            const flap = frame === 0 ? -3 : 3;
            // Translucent cyan membrane wings
            this.px(ctx, 3, 10 + flap, 13, 8, '#166e88');
            this.px(ctx, 5, 12 + flap, 9, 4, '#00e5ff');
            this.px(ctx, 24, 10 - flap, 13, 8, '#166e88');
            this.px(ctx, 26, 12 - flap, 9, 4, '#00e5ff');
            // Slender obsidian core & jamming antennae
            this.px(ctx, 16, 12, 8, 16, '#1c2430');
            this.px(ctx, 18, 14, 4, 10, '#36465c');
            this.px(ctx, 17, 6, 2, 6, '#00ffff');
            this.px(ctx, 21, 6, 2, 6, '#00ffff');
            this.px(ctx, 18, 22, 4, 3, '#ff3366');
        }).mats;

        // 7) Pheromone Scout (42x42): High-visibility orange flare sac scout
        this.spriteMats.pheromone_scout = makeFrames(42, 42, (ctx, frame) => {
            const pulse = frame === 0 ? 0 : 2;
            this.px(ctx, 6, 20 + pulse, 8, 3, '#4a260a');
            this.px(ctx, 28, 20 - pulse, 8, 3, '#4a260a');
            // Swollen orange dorsal flare sac
            this.px(ctx, 13 - pulse, 8, 16 + pulse * 2, 13, '#cc4400');
            this.px(ctx, 16, 10, 10, 9, '#ff7700');
            this.px(ctx, 19, 12, 4, 5, '#ffee66');
            // Armored head
            this.px(ctx, 14, 19, 14, 12, '#2d1c12');
            this.px(ctx, 16, 22, 3, 3, '#ffaa00');
            this.px(ctx, 23, 22, 3, 3, '#ffaa00');
        }).mats;
    }

    buildFxAndDecalSprites() {
        // 1) 3-Frame Pixel Explosion Flipbook (48x48)
        this.spriteMats.explosionFrames = [];
        for (let f = 0; f < 3; f++) {
            const { canvas, ctx } = this.createCanvas(48, 48);
            if (f === 0) {
                // Bright yellow-white jagged blast star
                this.px(ctx, 12, 12, 24, 24, '#ff6600');
                this.px(ctx, 18, 6, 12, 36, '#ffaa00');
                this.px(ctx, 6, 18, 36, 12, '#ffaa00');
                this.px(ctx, 16, 16, 16, 16, '#ffee55');
                this.px(ctx, 20, 20, 8, 8, '#ffffff');
            } else if (f === 1) {
                // Expanding orange fireball clouds
                this.px(ctx, 8, 10, 32, 28, '#dd3300');
                this.px(ctx, 12, 6, 24, 34, '#ff6611');
                this.px(ctx, 16, 14, 16, 16, '#ffcc22');
                this.px(ctx, 20, 18, 8, 6, '#ffffaa');
            } else {
                // Dissipating dark smoke + glowing embers
                this.px(ctx, 10, 10, 12, 12, '#44261a');
                this.px(ctx, 26, 8, 12, 12, '#5a301e');
                this.px(ctx, 14, 24, 18, 12, '#3a2218');
                this.px(ctx, 21, 17, 6, 6, '#ff7722');
            }
            this.applyOutline(ctx, 48, 48);
            this.spriteMats.explosionFrames.push(this.toSpriteMaterial(canvas, { fog: false }));
        }

        // 2) Dancing Pixel Thermite Flame Sprites (32x32, 2 frames)
        this.spriteMats.fireFrames = [];
        for (let f = 0; f < 2; f++) {
            const { canvas, ctx } = this.createCanvas(32, 32);
            const lean = f === 0 ? -2 : 2;
            this.px(ctx, 9, 18, 14, 10, '#cc2200');
            this.px(ctx, 11 + lean, 11, 10, 14, '#ff6600');
            this.px(ctx, 13 + lean, 6, 6, 10, '#ffaa00');
            this.px(ctx, 13, 18, 6, 8, '#ffee44');
            this.px(ctx, 15, 22, 2, 4, '#ffffff');
            this.applyOutline(ctx, 32, 32);
            this.spriteMats.fireFrames.push(this.toSpriteMaterial(canvas, { fog: true }));
        }

        // 3) Pixel Projectile Sprites (Acid & Rocket)
        {
            const { canvas, ctx } = this.createCanvas(24, 24);
            this.px(ctx, 7, 7, 10, 10, '#22cc33');
            this.px(ctx, 9, 9, 6, 6, '#88ff66');
            this.px(ctx, 10, 10, 3, 3, '#ffffff');
            this.applyOutline(ctx, 24, 24);
            this.spriteMats.acidProj = this.toSpriteMaterial(canvas);
        }
        {
            const { canvas, ctx } = this.createCanvas(24, 24);
            this.px(ctx, 7, 7, 10, 10, '#aa11ff');
            this.px(ctx, 9, 9, 6, 6, '#ff55ff');
            this.px(ctx, 10, 10, 3, 3, '#ffffff');
            this.applyOutline(ctx, 24, 24);
            this.spriteMats.bossAcidProj = this.toSpriteMaterial(canvas);
        }

        // 4) Persistent Ground Floor Splatters & Blast Scorch Decals (32x32)
        const makeDecalTex = (c1, c2, c3) => {
            const { canvas, ctx } = this.createCanvas(32, 32);
            this.px(ctx, 10, 10, 12, 12, c1);
            this.px(ctx, 7, 13, 18, 6, c1);
            this.px(ctx, 13, 7, 6, 18, c1);
            this.px(ctx, 12, 12, 8, 8, c2);
            this.px(ctx, 5, 8, 3, 3, c3);
            this.px(ctx, 24, 19, 3, 3, c3);
            this.px(ctx, 9, 25, 4, 2, c2);
            this.px(ctx, 21, 6, 3, 3, c3);
            this.applyOutline(ctx, 32, 32, [10, 6, 5, 220]);
            return this.toTexture(canvas);
        };
        this.textures.decalRed = makeDecalTex('#8a1610', '#bb2216', '#5a0e0a');
        this.textures.decalGreen = makeDecalTex('#1e8824', '#38cc40', '#125418');
        this.textures.decalPurple = makeDecalTex('#5a1478', '#9c22cc', '#380a4d');
        this.textures.decalScorch = makeDecalTex('#1c120d', '#0b0705', '#2e1d14');
    }

    buildFirstPersonHands() {
        // 1) Pixel-Art Exosuit Forearms & Gloved Hands on Dual Flight/Combat Joysticks (128x112)
        const buildJoystickArm = (isRight, isActive, isEvolved) => {
            const { canvas, ctx } = this.createCanvas(128, 112);

            // Mirror X helper so left & right arms stay crisp and symmetrical
            const drawR = (x, y, w, h, col) => {
                const dx = isRight ? (128 - x - w) : x;
                this.px(ctx, dx, y, w, h, col);
            };

            const armDark = '#1b1410';
            const armMid = isEvolved ? '#2a3d38' : '#4a3527';
            const armLight = isEvolved ? '#4f7a6e' : '#7a5841';
            const armRim = isEvolved ? '#86bba8' : '#a67a5c';
            const gloveDark = '#1c2026';
            const gloveMid = '#38404c';
            const gloveLight = '#5a6678';
            const stickDark = '#101216';
            const stickMid = '#262b34';
            const ledCol = isActive ? (isEvolved ? '#00ffcc' : '#ff4422') : (isRight ? '#b82218' : '#2a5a44');

            // Control stick column & base boot near upper-center-outer cockpit console
            drawR(74, 58, 22, 54, stickDark);
            drawR(78, 62, 12, 48, stickMid);
            drawR(66, 86, 38, 26, stickDark);
            drawR(70, 90, 28, 22, '#1d2028');
            // Stick grip head & red thumb trigger
            drawR(72, 16, 20, 22, stickDark);
            drawR(75, 18, 14, 16, stickMid);
            drawR(79, 13, 10, 6, ledCol);
            if (isActive) {
                drawR(81, 14, 6, 3, '#ffdd88');
            }
            drawR(74, 24, 6, 8, '#8a1e18');

            // Heavy Armored Forearm ascending diagonally from bottom corner toward stick grip
            for (let s = 0; s < 28; s++) {
                const bx = 4 + s * 2.2;
                const by = 92 - s * 2.1;
                const col = s % 6 === 0 ? armDark : (s % 2 === 0 ? armMid : armLight);
                drawR(bx, by, 30, 22, armDark);
                drawR(bx + 2, by + 2, 24, 16, col);
                drawR(bx + 4, by + 3, 16, 5, armRim);
            }

            // Segmented cuff collar & hydraulic cable along outer forearm
            for (let s = 0; s < 16; s++) {
                const cx = 14 + s * 2.2;
                const cy = 104 - s * 2.0;
                drawR(cx, cy, 4, 4, '#6e1812');
                if (s % 2 === 0) drawR(cx + 1, cy + 1, 2, 2, '#c83424');
            }
            drawR(22, 72, 18, 12, '#221a15');
            drawR(24, 74, 14, 4, '#5a6270');

            // Articulated Armored Glove Fingers wrapping stick grip
            drawR(60, 26, 22, 24, gloveDark);
            drawR(62, 28, 16, 18, gloveMid);
            drawR(64, 28, 12, 4, gloveLight);
            // Four finger knuckles wrapped onto stick
            for (let k = 0; k < 4; k++) {
                const ky = 26 + k * 5;
                drawR(76, ky, 14, 4, gloveDark);
                drawR(77, ky + 1, 11, 2, gloveLight);
            }
            // Thumb guard pressing top switch
            drawR(68, 18, 12, 10, gloveMid);
            drawR(70, 19, 8, 4, gloveLight);

            this.applyOutline(ctx, 128, 112, [6, 5, 5, 255]);
            return canvas;
        };

        this.canvases.leftJoystickArm = [
            buildJoystickArm(false, false, false),
            buildJoystickArm(false, true, false)
        ];
        this.canvases.rightJoystickArm = [
            buildJoystickArm(true, false, false),
            buildJoystickArm(true, true, false),
            buildJoystickArm(true, false, true),
            buildJoystickArm(true, true, true)
        ];

        // 2) Armored Exosuit Pilot Knees / Lower Chassis (160x64)
        {
            const { canvas, ctx } = this.createCanvas(160, 64);
            const drawKnee = (kx, dir) => {
                // Main dark thigh/knee armor block slanting slightly inward toward center
                for (let y = 0; y < 56; y += 2) {
                    const slant = Math.round(y * 0.14 * dir);
                    const w = 36 + Math.round(y * 0.22);
                    const x = kx + slant - Math.round(w * 0.5);
                    this.px(ctx, x, 8 + y, w, 4, '#14161b');
                    this.px(ctx, x + 3, 8 + y, w - 6, 3, y < 18 ? '#2c313b' : '#1f232b');
                    // Warm amber cockpit light rim along knee bevel
                    if (y < 22) {
                        this.px(ctx, dir > 0 ? x + w - 7 : x + 3, 8 + y, 4, 2, '#6e523a');
                    }
                }
                // Knee cap joint plate & rivets
                this.px(ctx, kx - 12, 12, 24, 14, '#363c48');
                this.px(ctx, kx - 9, 14, 18, 6, '#505868');
                this.px(ctx, kx - 8, 28, 16, 3, '#0b0c0e');
                this.px(ctx, kx - 10, 40, 20, 4, '#2b303a');
            };
            drawKnee(40, 1);
            drawKnee(120, -1);
            this.applyOutline(ctx, 160, 64, [6, 5, 5, 255]);
            this.canvases.pilotLegs = canvas;
        }

        // Legacy canvas aliases kept intact for compatibility
        this.canvases.leftGauntletIdle = this.canvases.leftJoystickArm[0];
        this.canvases.leftGauntletActive = this.canvases.leftJoystickArm[1];
        this.canvases.minigun = [
            this.canvases.rightJoystickArm[0],
            this.canvases.rightJoystickArm[1],
            this.canvases.rightJoystickArm[1]
        ];
        this.canvases.minigunEvolved = [
            this.canvases.rightJoystickArm[2],
            this.canvases.rightJoystickArm[3],
            this.canvases.rightJoystickArm[3]
        ];

        // 3) Jagged Pixel Muzzle Flash (64x64)
        {
            const { canvas, ctx } = this.createCanvas(64, 64);
            this.px(ctx, 20, 20, 24, 24, '#ff6600');
            this.px(ctx, 28, 4, 8, 56, '#ff9911');
            this.px(ctx, 4, 28, 56, 8, '#ff9911');
            this.px(ctx, 12, 12, 40, 40, '#ffbb22');
            this.px(ctx, 20, 20, 24, 24, '#ffee55');
            this.px(ctx, 26, 26, 12, 12, '#ffffff');
            // Diagonal spikes
            this.px(ctx, 10, 10, 10, 10, '#ff7711');
            this.px(ctx, 44, 10, 10, 10, '#ff7711');
            this.px(ctx, 10, 44, 10, 10, '#ff7711');
            this.px(ctx, 44, 44, 10, 10, '#ff7711');
            this.applyOutline(ctx, 64, 64);
            this.canvases.muzzleFlash = canvas;
        }

        // 4) Heavy Industrial Exterior Mechanical Claw Arm (180x150)
        const buildClawArm = (frameState, isEvolved) => {
            const { canvas, ctx } = this.createCanvas(180, 150);
            const armorBase = isEvolved ? '#24322d' : '#3c4535';
            const armorMid = isEvolved ? '#3d524a' : '#525e4a';
            const armorHi = isEvolved ? '#688a7c' : '#76876c';
            const chromeHi = '#e0e8f2';
            const chromeMid = '#94a0b0';
            const chromeDark = '#485260';
            const steelDark = '#181c22';
            const steelMid = '#2c3440';
            const steelHi = '#687890';
            const hoseCol = '#1a1816';
            const hazardGold = '#e6a822';
            const hazardBlack = '#141412';

            // Base forearm chassis extending from bottom-left corner
            for (let i = 0; i < 36; i++) {
                const ax = 2 + i * 2.8;
                const ay = 142 - i * 1.6;
                const w = 48;
                const h = 34;
                this.px(ctx, ax, ay, w, h, steelDark);
                this.px(ctx, ax + 2, ay + 2, w - 4, h - 4, armorBase);
                this.px(ctx, ax + 4, ay + 4, w - 8, h - 12, armorMid);
                this.px(ctx, ax + 6, ay + 4, w - 16, 4, armorHi);

                // Hazard chevron stripes on outer armor plate
                if (i >= 8 && i <= 24 && (i % 6 < 3)) {
                    this.px(ctx, ax + 6, ay + 12, 14, 6, hazardGold);
                } else if (i >= 8 && i <= 24) {
                    this.px(ctx, ax + 6, ay + 12, 14, 6, hazardBlack);
                }
            }

            // Hydraulic conduit hoses along underside
            for (let i = 0; i < 20; i++) {
                const hx = 6 + i * 4.2;
                const hy = 138 - i * 1.8;
                this.px(ctx, hx, hy, 6, 6, hoseCol);
                if (i % 2 === 0) this.px(ctx, hx + 1, hy + 1, 3, 3, '#c83424');
            }

            // Heavy Wrist Hub / Actuator Housing at (100, 75)
            const wx = 100, wy = 72;
            this.px(ctx, wx - 6, wy - 6, 40, 42, steelDark);
            this.px(ctx, wx - 3, wy - 3, 34, 36, steelMid);
            this.px(ctx, wx + 2, wy + 2, 24, 26, steelHi);
            // Central wrist pivot axle
            this.px(ctx, wx + 8, wy + 8, 12, 12, steelDark);
            this.px(ctx, wx + 10, wy + 10, 8, 8, chromeHi);

            // Hydraulic Piston Cylinders (extended or compressed based on frameState)
            // frameState 0 = neutral, 1 = clamp, 2 = lunge strike
            const ext = frameState === 2 ? 14 : (frameState === 1 ? -6 : 0);
            this.px(ctx, wx - 18, wy - 20, 28, 12, steelDark);
            this.px(ctx, wx - 16, wy - 18, 24, 8, steelMid);
            this.px(ctx, wx + 10, wy - 17, 24 + ext, 6, chromeMid);
            this.px(ctx, wx + 10, wy - 16, 24 + ext, 2, chromeHi);

            // Articulated Pincer Claws: Top Claw and Bottom Claw
            const topTipY = frameState === 1 ? (wy + 10) : (frameState === 2 ? (wy - 32) : (wy - 18));
            const botTipY = frameState === 1 ? (wy + 14) : (frameState === 2 ? (wy + 48) : (wy + 36));
            const tipX = frameState === 2 ? (wx + 70) : (frameState === 1 ? (wx + 56) : (wx + 62));

            const drawTine = (isTop) => {
                const pY = isTop ? (wy + 6) : (wy + 24);
                const tY = isTop ? topTipY : botTipY;
                for (let step = 0; step < 16; step++) {
                    const t = step / 15;
                    const cx = wx + 16 + t * (tipX - (wx + 16));
                    const arcOffset = isTop ? -Math.sin(t * Math.PI) * 14 : Math.sin(t * Math.PI) * 14;
                    const cy = pY * (1 - t) + tY * t + arcOffset;
                    const thick = Math.round(14 * (1 - t * 0.7));
                    this.px(ctx, cx, cy - thick * 0.5, thick, thick, steelDark);
                    this.px(ctx, cx + 1, cy - thick * 0.5 + 1, thick - 2, thick - 2, steelMid);
                    this.px(ctx, cx + 2, cy - thick * 0.5 + 2, Math.max(1, thick - 4), Math.max(1, thick - 4), steelHi);
                }
                this.px(ctx, tipX, tY - 3, 8, 6, chromeHi);
                this.px(ctx, tipX + 4, tY - 1, 4, 3, '#ffffff');
            };

            drawTine(true);  // Top Claw
            drawTine(false); // Bottom Claw

            if (frameState === 2) {
                this.px(ctx, wx + 6, wy + 6, 8, 8, '#00ffff');
                this.px(ctx, tipX + 2, topTipY - 2, 4, 4, '#ffdd44');
                this.px(ctx, tipX + 2, botTipY - 2, 4, 4, '#ffdd44');
            }

            this.applyOutline(ctx, 180, 150, [10, 8, 8, 255]);
            return canvas;
        };

        // 5) Heavy Multi-Barrel Rotary Minigun (180x150)
        const buildRotaryMinigun = (barrelRotIdx, isEvolved) => {
            const { canvas, ctx } = this.createCanvas(180, 150);
            const bodyDark = isEvolved ? '#10141a' : '#1c222a';
            const bodyMid = isEvolved ? '#202834' : '#323c4a';
            const bodyHi = isEvolved ? '#3c4a5e' : '#526276';
            const barrelDark = isEvolved ? '#0a0d12' : '#141820';
            const barrelMid = isEvolved ? '#283240' : '#485668';
            const barrelHi = isEvolved ? '#546680' : '#8898ac';
            const brassGold = isEvolved ? '#00e5a3' : '#cca036';
            const brassDark = isEvolved ? '#007a52' : '#6a4c10';

            // Flexible Segmented Ammo Feed Chute curling from bottom right to breech
            for (let i = 0; i < 22; i++) {
                const cx = 90 + i * 4.0;
                const cy = 110 + Math.sin(i * 0.28) * 12 + i * 0.8;
                this.px(ctx, cx, cy, 10, 16, bodyDark);
                this.px(ctx, cx + 2, cy + 2, 6, 12, bodyMid);
                this.px(ctx, cx + 3, cy + 5, 4, 6, brassGold);
                this.px(ctx, cx + 4, cy + 6, 2, 4, brassDark);
            }

            // Main Gun Receiver & Breech Housing
            for (let y = 36; y < 100; y++) {
                const w = 96;
                const x = 74;
                const col = y < 44 ? bodyHi : (y < 80 ? bodyMid : bodyDark);
                this.px(ctx, x, y, w, 1, col);
            }

            // Cooling vent louvers on breech side
            for (let v = 0; v < 6; v++) {
                const vx = 90 + v * 12;
                this.px(ctx, vx, 48, 6, 24, '#0a0c10');
                this.px(ctx, vx + 1, 50, 4, 20, bodyDark);
            }

            // Front Rotor Axis & Barrel Clamp Collar
            const rotorX = 66;
            const rotorY = 62;
            const collarW = 18;
            const collarH = 44;
            this.px(ctx, rotorX, rotorY - collarH * 0.5, collarW, collarH, bodyDark);
            this.px(ctx, rotorX + 2, rotorY - collarH * 0.5 + 2, collarW - 4, collarH - 4, bodyMid);
            this.px(ctx, rotorX + 4, rotorY - collarH * 0.5 + 4, 3, collarH - 8, bodyHi);

            // Front Muzzle Clamp Ring
            const muzzleX = 20;
            this.px(ctx, muzzleX, rotorY - 20, 10, 40, bodyDark);
            this.px(ctx, muzzleX + 2, rotorY - 18, 6, 36, bodyMid);

            // 6-Barrel Gatling Cluster Rotating around Rotor Center
            const numBarrels = 6;
            const clusterR = 15;
            const barrelR = 4;

            for (let i = 0; i < numBarrels; i++) {
                const ang = (barrelRotIdx * (Math.PI / 3)) + i * (Math.PI / 3);
                const by = rotorY + Math.sin(ang) * clusterR * 0.95;
                const sunFactor = -Math.sin(ang);
                const bCol = sunFactor > 0.25 ? barrelHi : (sunFactor > -0.25 ? barrelMid : barrelDark);

                const bLen = rotorX - muzzleX + 4;
                const bHeight = Math.round(barrelR * 2);
                this.px(ctx, muzzleX - 2, by - barrelR, bLen, bHeight, bodyDark);
                this.px(ctx, muzzleX - 2, by - barrelR + 1, bLen, bHeight - 2, bCol);
                if (sunFactor > 0.3) {
                    this.px(ctx, muzzleX - 2, by - barrelR + 1, bLen, 1, '#b0c4de');
                }

                this.px(ctx, muzzleX - 4, by - barrelR, 4, bHeight, bodyDark);
                this.px(ctx, muzzleX - 3, by - barrelR + 1, 2, bHeight - 2, '#06080a');
            }

            this.px(ctx, muzzleX - 2, rotorY - 3, 4, 6, bodyDark);
            this.px(ctx, muzzleX - 1, rotorY - 2, 2, 4, bodyMid);

            this.applyOutline(ctx, 180, 150, [10, 8, 8, 255]);
            return canvas;
        };

        this.canvases.mechClawArm = [
            buildClawArm(0, false), // Idle
            buildClawArm(1, false), // Clamping
            buildClawArm(2, false)  // Striking Lunge
        ];

        this.canvases.mechRotaryMinigun = [];
        this.canvases.mechRotaryMinigunEvolved = [];
        for (let r = 0; r < 6; r++) {
            this.canvases.mechRotaryMinigun.push(buildRotaryMinigun(r, false));
            this.canvases.mechRotaryMinigunEvolved.push(buildRotaryMinigun(r, true));
        }
    }

    // Renders animated Project Warlock style Operator Face into 64x64 #portraitCanvas
    drawPilotPortrait(ctx, player, timeSec) {
        if (!ctx || !player) return;
        ctx.imageSmoothingEnabled = false;

        // Track sudden HP drops for portrait grimace
        if (this.prevHpSnapshot !== null && player.hp < this.prevHpSnapshot - 0.5) {
            this.hurtFlashTimer = 0.45;
        }
        this.prevHpSnapshot = player.hp;
        if (this.hurtFlashTimer > 0) {
            this.hurtFlashTimer = Math.max(0, this.hurtFlashTimer - 0.016);
        }

        const hpRatio = player.hp / Math.max(1, player.maxHp);
        const isHurt = this.hurtFlashTimer > 0;
        const isThermal = player.sonarTimer > 0;
        const bobY = Math.round(Math.sin(timeSec * 3.2) * 1);

        // Dark metal background behind pilot
        ctx.fillStyle = isHurt ? '#4a0810' : (isThermal ? '#0a2234' : '#16141a');
        ctx.fillRect(0, 0, 64, 64);

        // Exosuit Armored Collar & Shoulders
        this.px(ctx, 6, 46, 52, 18, '#303440');
        this.px(ctx, 10, 44, 44, 6, '#565c6c');
        this.px(ctx, 18, 48, 28, 16, '#222630');

        // Helmet / Hair Hood framing face
        const hy = bobY;
        this.px(ctx, 14, 8 + hy, 36, 36, '#1c1824');
        this.px(ctx, 12, 12 + hy, 40, 26, '#282436');
        // Hair/Helmet crest highlights
        this.px(ctx, 18, 9 + hy, 28, 5, '#443e5a');
        this.px(ctx, 14, 16 + hy, 6, 16, '#363048');
        this.px(ctx, 44, 16 + hy, 6, 16, '#363048');

        // Face Skin (gritty pale-warm lighting matching reference portrait)
        const skinBase = hpRatio < 0.3 ? '#b0786c' : '#c89480';
        const skinDark = '#845448';
        const skinLight = '#eac0aa';
        this.px(ctx, 19, 16 + hy, 26, 26, skinBase);
        this.px(ctx, 21, 18 + hy, 22, 10, skinLight);
        this.px(ctx, 19, 34 + hy, 26, 8, skinDark); // Jaw shadow
        this.px(ctx, 23, 39 + hy, 18, 4, '#663c34'); // Chin outline

        // Heavy brow shadow
        this.px(ctx, 20, 22 + hy, 24, 3, '#381e1a');

        // Eyes (look left/right subtly or glow cyan on sonar ping)
        const lookShift = Math.floor(Math.sin(timeSec * 1.1) * 1.6);
        const eyeCol = isThermal ? '#00ffff' : (isHurt ? '#ff4422' : '#eef8ff');
        const pupilCol = isThermal ? '#ffffff' : '#162838';

        // Left & Right eye whites
        this.px(ctx, 22, 25 + hy, 7, 4, '#ffffff');
        this.px(ctx, 35, 25 + hy, 7, 4, '#ffffff');
        // Irises
        this.px(ctx, 24 + lookShift, 25 + hy, 3, 4, pupilCol);
        this.px(ctx, 37 + lookShift, 25 + hy, 3, 4, pupilCol);
        this.px(ctx, 25 + lookShift, 26 + hy, 2, 2, eyeCol);
        this.px(ctx, 38 + lookShift, 26 + hy, 2, 2, eyeCol);

        // Nose & Cheekbones
        this.px(ctx, 30, 25 + hy, 4, 8, skinDark);
        this.px(ctx, 29, 31 + hy, 6, 2, skinLight);

        // Battle scars / blood when injured (< 60% HP)
        if (hpRatio < 0.65 || isHurt) {
            this.px(ctx, 36, 19 + hy, 4, 12, '#aa1118'); // Cheek scratch
            this.px(ctx, 21, 32 + hy, 5, 3, '#8a1016');
        }

        // Mouth expression: fierce grit / grimace on hurt / smirk on high HP
        if (isHurt) {
            this.px(ctx, 25, 35 + hy, 14, 5, '#1a0808');
            this.px(ctx, 27, 36 + hy, 10, 2, '#eee8e0'); // Gritted teeth
        } else if (hpRatio < 0.35) {
            this.px(ctx, 26, 36 + hy, 12, 3, '#220c0c');
            this.px(ctx, 25, 37 + hy, 2, 2, '#220c0c');
            this.px(ctx, 37, 37 + hy, 2, 2, '#220c0c');
        } else {
            this.px(ctx, 26, 35 + hy, 12, 2, '#421c18');
            this.px(ctx, 35, 34 + hy, 4, 2, '#421c18');
        }

        // Cybernetic Headset Mic & Red/Cyan Status LED
        this.px(ctx, 13, 28 + hy, 6, 8, '#586272');
        this.px(ctx, 17, 34 + hy, 8, 3, '#38404c');
        this.px(ctx, 14, 30 + hy, 2, 3, isThermal ? '#00ffcc' : '#ff3322');

        // Crisp inner black frame
        ctx.strokeStyle = '#07080a';
        ctx.lineWidth = 2;
        ctx.strokeRect(1, 1, 62, 62);
    }
}

window.PixelArt = new PixelArtBank();
