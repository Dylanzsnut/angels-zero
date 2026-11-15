// Wave Director & Spawning Engine for Orbital Perimeter

class WaveDirector {
    constructor(gameMode ='siege') {
        this.mode = gameMode; //'siege'or'endless'
        this.elapsedTime = 0;
        this.spawnTimer = 0;
        this.spawnInterval = 2.5; // Accessible early pacing (was 1.0)
        this.miniBossesSpawned = new Set();
        this.finalBossSpawned = false;
        this.ambushTimer = 0;
        this.nextAmbushTime = 65 + Math.random() * 25; // First ambush delayed past 65s (was 22+16)
    }

    reset(mode ='siege') {
        this.mode = mode;
        this.elapsedTime = 0;
        this.spawnTimer = 0;
        this.spawnInterval = 2.5;
        this.miniBossesSpawned.clear();
        this.finalBossSpawned = false;
        this.ambushTimer = 0;
        this.nextAmbushTime = 65 + Math.random() * 25;
    }

    update(dt, player) {
        this.elapsedTime += dt;
        this.spawnTimer += dt;
        this.ambushTimer += dt;

        const minutes = Math.floor(this.elapsedTime / 60);

        // Ambush Director Schedule: Tactical surprise assaults
        if (this.ambushTimer >= this.nextAmbushTime) {
            this.ambushTimer = 0;
            this.nextAmbushTime = 50 + Math.random() * 30;
            this.triggerAmbushEvent(player);
        }

        // Adjust spawn interval based on time
        if (this.mode ==='siege') {
            // Gradually reduce spawn interval from 2.5s down to 0.40s at 15 minutes
            this.spawnInterval = Math.max(0.40, 2.5 - (this.elapsedTime / 900) * 2.1);
        } else {
            // Endless gauntlet escalates gradually
            this.spawnInterval = Math.max(0.20, 2.0 - (this.elapsedTime / 600) * 1.8);
        }

        // Check for Mini-Boss schedule (03:00, 06:00, 09:00, 12:00)
        const checkIntervals = [180, 360, 540, 720];
        for (const targetSec of checkIntervals) {
            if (this.elapsedTime >= targetSec && !this.miniBossesSpawned.has(targetSec)) {
                this.miniBossesSpawned.add(targetSec);
                this.spawnMiniBoss(player);
            }
        }

        // Check for Apex Broodmother final boss at 15:00 (900 seconds) in Siege Mode
        if (this.mode ==='siege'&& this.elapsedTime >= window.GAME_CONFIG.SIEGE_DURATION_SECONDS && !this.finalBossSpawned) {
            this.finalBossSpawned = true;
            this.spawnApexBoss(player);
        }

        // Regular Swarm Spawning loop
        if (this.spawnTimer >= this.spawnInterval) {
            this.spawnTimer = 0;
            this.spawnSwarmBatch(player);
        }
    }

    spawnSwarmBatch(player) {
        const t = this.elapsedTime;
        const minutes = t / 60;

        // Difficulty multiplier scales over time
        const difficulty = 1.0 + (t / 180) * 0.45;

        // Paced batch size curve: starts at 1, scaling gradually up to 16
        let batchSize = Math.max(1, Math.floor(1 + Math.pow(t / 120, 1.2) * 1.8));
        if (this.mode ==='endless') {
            batchSize += Math.floor(minutes * 0.6);
        }

        // Cap batch size to maintain 60 FPS while keeping swarm feel
        batchSize = Math.min(16, batchSize);

        for (let i = 0; i < batchSize; i++) {
            // Choose spawn position along a 360° ring around player on the infinite planet
            const angle = Math.random() * Math.PI * 2;
            const distance = 650 + Math.random() * 250;
            const spawnX = player.x + Math.cos(angle) * distance;
            const spawnY = player.y + Math.sin(angle) * distance;

            // Select enemy archetype based on paced schedule
            let type ='skitterer';

            if (t > 45 && Math.random() < 0.12) {
                // Pheromone Breach Scouts begin patrolling past 45s
                type ='pheromone_scout';
            }

            if (t > 60 && Math.random() < 0.20) {
                // Dune sand-stalkers begin burrowing under desert past 60s
                type ='sand_stalker';
            }

            if (t > 90 && Math.random() < 0.15) {
                // Aerial radar-jamming Shrieker-Mites arrive past 90s
                type ='shrieker_mite';
            }

            if (t > 150 && Math.random() < 0.25) {
                // Acid spitters appear after 2:30
                type ='acid_spitter';
            }

            if (t > 240 && Math.random() < 0.20) {
                // Siege-Beetles (Carapace Chargers) appear after 4:00
                type ='carapace_charger';
            }

            window.EnemyController.spawn(type, spawnX, spawnY, difficulty);
        }
    }

    triggerAmbushEvent(player) {
        if (!player) return;
        const t = this.elapsedTime;
        const difficulty = 1.0 + (t / 180) * 0.45;
        const r3d = window.gameInstance && window.gameInstance.renderer3d;
        const isSquall = r3d && r3d.squallIntensity > 0.65;

        // Choose between 3 tactical ambush patterns
        const choices = ['BURROW_CLUSTER','FLANK_PINCER'];
        if (isSquall || t > 60) choices.push('SQUALL_RUSH');
        const pattern = choices[Math.floor(Math.random() * choices.length)];

        switch (pattern) {
            case'BURROW_CLUSTER': {
                // 2 to 4 Sand-Stalkers buried in a forward arc ahead of the walker
                window.gameInstance.showBanner('SEISMIC ANOMALY: SUBTERRANEAN CONTACTS AHEAD','#eea832', 2400);
                if (window.soundManager && window.soundManager.speakComms) {
                    window.soundManager.speakComms('Seismic tremor ahead. Sand-stalkers beneath the surface.', {
                        speaker: 'AI', priority: 1, cooldownKey: 'wave_event', cooldownMs: 12000
                    });
                }
                if (window.soundManager && window.soundManager.playSubterraneanRumble) {
                    window.soundManager.playSubterraneanRumble();
                }
                const count = Math.min(4, 2 + Math.floor(t / 180));
                for (let i = 0; i < count; i++) {
                    const arcOffset = (Math.random() - 0.5) * 1.1; // Forward 63° cone
                    const ang = player.facingAngle + arcOffset;
                    const dist = 140 + Math.random() * 90;
                    const sx = player.x + Math.cos(ang) * dist;
                    const sy = player.y + Math.sin(ang) * dist;
                    window.EnemyController.spawn('sand_stalker', sx, sy, difficulty);
                }
                break;
            }

            case'FLANK_PINCER': {
                // Dual pincer ambush from blind-spot flanks perpendicular to torso heading
                window.gameInstance.showBanner('TACTICAL WARNING: CONVERGING FLANK PINCER','#ff3822', 2400);
                if (window.soundManager && window.soundManager.speakComms) {
                    window.soundManager.speakComms('Warning. Hostile flanking movement on both sides.', {
                        speaker: 'AI', priority: 1, cooldownKey: 'wave_event', cooldownMs: 12000
                    });
                }
                const flankAngles = [player.facingAngle + Math.PI / 2, player.facingAngle - Math.PI / 2];
                for (const fAng of flankAngles) {
                    const count = 2;
                    for (let i = 0; i < count; i++) {
                        const ang = fAng + (Math.random() - 0.5) * 0.35;
                        const dist = 280 + Math.random() * 60;
                        const sx = player.x + Math.cos(ang) * dist;
                        const sy = player.y + Math.sin(ang) * dist;
                        const type = (t > 140 && Math.random() < 0.45) ?'carapace_charger':'skitterer';
                        window.EnemyController.spawn(type, sx, sy, difficulty);
                    }
                }
                break;
            }

            case'SQUALL_RUSH': {
                // Swarm sprint emerging from blinding dust wall
                window.gameInstance.showBanner('PERIMETER BREACH: SQUALL RUSH DETECTED','#00ffff', 2400);
                if (window.soundManager && window.soundManager.speakComms) {
                    window.soundManager.speakComms('Perimeter breach. Fast movers incoming through the dust.', {
                        speaker: 'AI', priority: 1, cooldownKey: 'wave_event', cooldownMs: 12000
                    });
                }
                const count = Math.min(8, 4 + Math.floor(t / 90));
                for (let i = 0; i < count; i++) {
                    const ang = Math.random() * Math.PI * 2;
                    const dist = 210 + Math.random() * 60;
                    const sx = player.x + Math.cos(ang) * dist;
                    const sy = player.y + Math.sin(ang) * dist;
                    const type = Math.random() < 0.4 ?'sand_stalker':'skitterer';
                    window.EnemyController.spawn(type, sx, sy, difficulty);
                }
                break;
            }
        }
    }

    spawnMiniBoss(player) {
        window.soundManager.playBossWarning();
        window.gameInstance.showBanner('WARNING: BROOD-GUARD MINI-BOSS DETECTED!','#ff0055');
        if (window.soundManager && window.soundManager.speakComms) {
            window.soundManager.speakComms('Heavy bio-signature on scope. Brood-Guard inbound.', {
                speaker: 'COMMAND', priority: 2, cooldownKey: 'boss', cooldownMs: 10000
            });
        }

        const angle = Math.random() * Math.PI * 2;
        const spawnX = player.x + Math.cos(angle) * 700;
        const spawnY = player.y + Math.sin(angle) * 700;

        const diffMult = 1.0 + (this.elapsedTime / 180) * 0.5;
        window.EnemyController.spawn('brood_guard', spawnX, spawnY, diffMult);
    }

    spawnApexBoss(player) {
        window.soundManager.playBossWarning();
        window.gameInstance.showBanner('CRITICAL ALERT: APEX BROODMOTHER HAS SURFACED!','#9900ff', 6000);
        if (window.soundManager && window.soundManager.speakComms) {
            window.soundManager.speakComms('Critical threat. Apex Broodmother has surfaced. All weapons free, pilot.', {
                speaker: 'COMMAND', priority: 2, cooldownKey: 'apex', cooldownMs: 15000
            });
        }

        const angle = Math.random() * Math.PI * 2;
        const spawnX = player.x + Math.cos(angle) * 750;
        const spawnY = player.y + Math.sin(angle) * 750;

        window.EnemyController.spawn('apex_broodmother', spawnX, spawnY, 1.5);
    }
}

window.WaveDirector = WaveDirector;
