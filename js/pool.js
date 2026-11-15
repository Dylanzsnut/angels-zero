// High-Performance Object Pooling for 60 FPS Swarm Simulation

class ObjectPool {
    constructor(createFn, resetFn, initialSize = 100, maxActive = Infinity) {
        this.createFn = createFn;
        this.resetFn = resetFn;
        this.maxActive = maxActive;
        this.pool = [];
        this.active = [];

        for (let i = 0; i < initialSize; i++) {
            this.pool.push(this.createFn());
        }
    }

    get() {
        let obj;
        if (this.active.length >= this.maxActive && this.active.length > 0) {
            obj = this.active.shift();
            if (this.resetFn) {
                this.resetFn(obj);
            }
            obj.active = true;
            this.active.push(obj);
            return obj;
        }
        if (this.pool.length > 0) {
            obj = this.pool.pop();
        } else {
            obj = this.createFn();
        }
        obj.active = true;
        this.active.push(obj);
        return obj;
    }

    release(obj) {
        obj.active = false;
        const idx = this.active.indexOf(obj);
        if (idx !== -1) {
            this.active.splice(idx, 1);
        }
        if (this.resetFn) {
            this.resetFn(obj);
        }
        this.pool.push(obj);
    }

    clear() {
        while (this.active.length > 0) {
            const obj = this.active.pop();
            obj.active = false;
            if (this.resetFn) this.resetFn(obj);
            this.pool.push(obj);
        }
    }

    forEachActive(fn) {
        const snapshot = this.active.slice();
        for (let i = snapshot.length - 1; i >= 0; i--) {
            const item = snapshot[i];
            if (item && item.active !== false) {
                fn(item, i);
            }
        }
    }
}

class PoolManager {
    constructor() {
        // Projectiles pool
        this.projectiles = new ObjectPool(
            () => ({
                active: false,
                type: 'bullet', // bullet, missile, acid, orbital, flamer
                x: 0, y: 0,
                vx: 0, vy: 0,
                damage: 0,
                radius: 4,
                color: '#fff',
                life: 1,
                maxLife: 1,
                pierce: 1,
                hitList: new Set(),
                target: null,
                trail: [],
                extra: {}
            }),
            (p) => {
                p.isEnemyBullet = false;
                p.hitList.clear();
                p.trail.length = 0;
                p.target = null;
                p.extra = {};
            },
            300,
            350
        );

        // Enemies pool
        this.enemies = new ObjectPool(
            () => ({
                active: false,
                id: 0,
                type: 'skitterer',
                name: '',
                x: 0, y: 0,
                vx: 0, vy: 0,
                hp: 10,
                maxHp: 10,
                speed: 100,
                radius: 12,
                color: '#f00',
                xpValue: 1,
                scrapValue: 1,
                hitFlash: 0,
                shootTimer: 0,
                chargeTimer: 0,
                isCharging: false,
                chargeTargetX: 0,
                chargeTargetY: 0,
                isBoss: false,
                isFinalBoss: false,
                bossPhase: 1,
                bossAttackTimer: 0,
                dropsChest: false,
                angle: 0
            }),
            (e) => {
                e.hitFlash = 0;
                e.shootTimer = 0;
                e.chargeTimer = 0;
                e.isCharging = false;
                e.bossAttackTimer = 0;
                e.bossPhase = 1;
            },
            400
        );

        // Drops (XP gems and Scrap crates)
        this.drops = new ObjectPool(
            () => ({
                active: false,
                type: 'xp', // 'xp' or 'scrap' or 'chest'
                x: 0, y: 0,
                value: 1,
                radius: 6,
                color: '#00ffcc',
                collected: false
            }),
            (d) => {
                d.collected = false;
            },
            300,
            320
        );

        // Floating Damage Numbers
        this.damageNumbers = new ObjectPool(
            () => ({
                active: false,
                x: 0, y: 0,
                text: '',
                color: '#ffffff',
                size: 14,
                life: 0.8,
                maxLife: 0.8,
                vy: -35
            }),
            null,
            150,
            120
        );

        // Particles (sparks, explosions, thruster exhausts)
        this.particles = new ObjectPool(
            () => ({
                active: false,
                x: 0, y: 0,
                vx: 0, vy: 0,
                radius: 3,
                color: '#fff',
                life: 0.4,
                maxLife: 0.4,
                fade: true
            }),
            null,
            500,
            550
        );

        // Persistent ground zones (Thermite fire pools, Hammer of Dawn radiation)
        this.groundZones = new ObjectPool(
            () => ({
                active: false,
                x: 0, y: 0,
                radius: 50,
                damage: 5,
                tickInterval: 0.25,
                tickTimer: 0,
                duration: 2.0,
                color: 'rgba(255, 100, 0, 0.4)',
                strokeColor: '#ff6600',
                isRadiation: false
            }),
            null,
            50,
            60
        );

        // Persistent Battlefield Decals (scorch marks, alien ichor splatters)
        this.decals = new ObjectPool(
            () => ({
                active: false,
                x: 0, y: 0,
                radius: 14,
                color: 'rgba(40, 200, 60, 0.35)',
                life: 10.0,
                maxLife: 10.0,
                type: 'splatter'
            }),
            null,
            250,
            180
        );
    }

    spawnDecal(x, y, radius = 16, color = 'rgba(40, 200, 60, 0.35)', type = 'splatter', duration = 12.0) {
        const d = this.decals.get();
        d.x = x;
        d.y = y;
        d.radius = radius;
        d.color = color;
        d.life = duration;
        d.maxLife = duration;
        d.type = type;
        return d;
    }

    spawnDamageNumber(x, y, text, color = '#fff', size = 14) {
        const d = this.damageNumbers.get();
        d.x = x + (Math.random() - 0.5) * 16;
        d.y = y - 10 + (Math.random() - 0.5) * 10;
        d.text = text;
        d.color = color;
        d.size = size;
        d.life = 0.75;
        d.maxLife = 0.75;
        d.vy = -45;
    }

    spawnSparks(x, y, count = 5, color = '#ffcc00', speed = 120, life = 0.3) {
        for (let i = 0; i < count; i++) {
            const p = this.particles.get();
            const angle = Math.random() * Math.PI * 2;
            const spd = (Math.random() * 0.7 + 0.3) * speed;
            p.x = x;
            p.y = y;
            p.vx = Math.cos(angle) * spd;
            p.vy = Math.sin(angle) * spd;
            p.radius = Math.random() * 2.5 + 1.5;
            p.color = color;
            p.life = life * (Math.random() * 0.4 + 0.8);
            p.maxLife = p.life;
        }
    }

    spawnExplosion(x, y, radius = 40, color = '#ff4400', heavy = false) {
        if (heavy || radius >= 35) {
            this.spawnDecal(x, y, radius * 0.85, 'rgba(10, 15, 20, 0.65)', 'scorch', 18.0);
        }
        const count = heavy ? 35 : 18;
        for (let i = 0; i < count; i++) {
            const p = this.particles.get();
            const angle = Math.random() * Math.PI * 2;
            const spd = Math.random() * radius * 4 + 30;
            p.x = x;
            p.y = y;
            p.vx = Math.cos(angle) * spd;
            p.vy = Math.sin(angle) * spd;
            p.radius = Math.random() * 4 + 2;
            p.color = Math.random() > 0.4 ? color : '#ffcc00';
            p.life = Math.random() * 0.35 + 0.2;
            p.maxLife = p.life;
        }
    }

    spawnGroundZone(x, y, radius, damage, duration, color, strokeColor, isRadiation = false) {
        const z = this.groundZones.get();
        z.x = x;
        z.y = y;
        z.radius = radius;
        z.damage = damage;
        z.duration = duration;
        z.tickInterval = 0.2;
        z.tickTimer = 0;
        z.color = color;
        z.strokeColor = strokeColor;
        z.isRadiation = isRadiation;
        return z;
    }

    clearAll() {
        this.projectiles.clear();
        this.enemies.clear();
        this.drops.clear();
        this.damageNumbers.clear();
        this.particles.clear();
        this.groundZones.clear();
        this.decals.clear();
    }
}

window.poolManager = new PoolManager();
