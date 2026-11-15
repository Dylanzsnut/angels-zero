// Meta-Progression & 122-Item Hangar Customization System (Saved via localStorage)

class HangarSystem {
    constructor() {
        this.STORAGE_KEY = 'ORBITAL_PERIMETER_V1';
        this.data = {
            credits: 0,
            extraSlots: 0,
            upgrades: {
                hull_plating: 0,
                thruster_tuning: 0,
                scrap_magnet: 0,
                neural_tactics: 0,
                kinetic_accelerators: 0,
                heavy_barrel_kit: 0,
                plasma_cleaver_edge: 0,
                sidearm_mag_core: 0,
                shoulder_pod_rack: 0,
                reactive_shield_array: 0,
                cryo_heat_sinks: 0,
                servo_leg_actuators: 0,
                radar_sensor_array: 0,
                overdrive_reactor: 0,
                emp_shock_capacitors: 0,
                nanite_repair_core: 0
            },
            purchasedMods: {},
            equippedMods: {},
            purchasedBuilds: {
                standard_rotary: true,
                standard_37mm: true,
                standard_cleaver: true,
                standard_stomp: true
            },
            equippedBuilds: {
                rifle: 'standard_rotary',
                pistol: 'standard_37mm',
                melee: 'standard_cleaver',
                stomp: 'standard_stomp'
            },
            purchasedAttachments: {},
            equippedAttachments: {},
            unlockedCallsigns: { 'VANGUARD-01': true },
            cosmetics: {
                livery: 'olive',
                visor: 'cyan',
                callsign: 'VANGUARD-01'
            },
            stats: {
                gamesPlayed: 0,
                victories: 0,
                totalKills: 0,
                bestTime: 0
            }
        };

        this.load();
    }

    load() {
        try {
            const raw = localStorage.getItem(this.STORAGE_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                const defaultUpgrades = Object.assign({}, this.data.upgrades);
                const defaultCosmetics = Object.assign({}, this.data.cosmetics);
                const defaultStats = Object.assign({}, this.data.stats);
                const defaultBuilds = Object.assign({}, this.data.equippedBuilds);
                const defaultPurchasedBuilds = Object.assign({}, this.data.purchasedBuilds);
                this.data = Object.assign(this.data, parsed);
                this.data.extraSlots = parsed.extraSlots || 0;
                this.data.upgrades = Object.assign(defaultUpgrades, parsed.upgrades || {});
                this.data.cosmetics = Object.assign(defaultCosmetics, parsed.cosmetics || {});
                this.data.stats = Object.assign(defaultStats, parsed.stats || {});
                this.data.purchasedMods = parsed.purchasedMods || {};
                this.data.equippedMods = parsed.equippedMods || {};
                this.data.purchasedBuilds = Object.assign(defaultPurchasedBuilds, parsed.purchasedBuilds || {});
                this.data.equippedBuilds = Object.assign(defaultBuilds, parsed.equippedBuilds || {});
                this.data.purchasedAttachments = parsed.purchasedAttachments || {};
                this.data.equippedAttachments = parsed.equippedAttachments || {};
                this.data.unlockedCallsigns = Object.assign({ 'VANGUARD-01': true }, parsed.unlockedCallsigns || {});
            }
        } catch (e) {
            console.warn('Could not load hangar data from localStorage', e);
        }
    }

    save() {
        try {
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.data));
        } catch (e) {
            console.warn('Could not save hangar data', e);
        }
    }

    addCredits(amt) {
        this.data.credits += amt;
        this.save();
    }

    getOperatorRank() {
        const s = this.data.stats || {};
        let totalUpgradeRanks = 0;
        for (const r of Object.values(this.data.upgrades || {})) {
            totalUpgradeRanks += Math.max(0, r || 0);
        }
        const modCount = Object.values(this.data.purchasedMods || {}).filter(Boolean).length;
        const attCount = Object.values(this.data.purchasedAttachments || {}).filter(Boolean).length;
        return 1
            + (s.victories || 0) * 2
            + (s.gamesPlayed || 0)
            + Math.floor((s.totalKills || 0) / 50)
            + Math.floor((totalUpgradeRanks + modCount + attCount) / 2);
    }

    getMaxLoadoutSlots() {
        const cfg = window.GAME_CONFIG || {};
        const lcfg = cfg.LOADOUT_SLOTS || { BASE_SLOTS: 4, MAX_RANK_SLOTS: 4, MAX_EXTRA_SLOTS: 6 };
        const modsLen = (cfg.TACTICAL_MODS || []).length || 14;
        const rankBonus = Math.min(lcfg.MAX_RANK_SLOTS ?? 4, Math.floor((this.getOperatorRank() - 1) / 3));
        const bought = Math.min(lcfg.MAX_EXTRA_SLOTS ?? 6, this.data.extraSlots || 0);
        return Math.min(modsLen, lcfg.BASE_SLOTS + rankBonus + bought);
    }

    getUsedLoadoutSlots() {
        return Object.values(this.data.equippedMods || {}).filter(Boolean).length;
    }

    getNextSlotCost() {
        const lcfg = (window.GAME_CONFIG && window.GAME_CONFIG.LOADOUT_SLOTS) || { MAX_EXTRA_SLOTS: 6, BASE_SLOT_COST: 160, SLOT_COST_MULT: 1.6 };
        const cur = this.data.extraSlots || 0;
        if (cur >= lcfg.MAX_EXTRA_SLOTS) return null;
        return Math.round(lcfg.BASE_SLOT_COST * Math.pow(lcfg.SLOT_COST_MULT, cur));
    }

    buyLoadoutSlot() {
        const cost = this.getNextSlotCost();
        if (cost === null) return false;
        if (this.data.credits >= cost) {
            this.data.credits -= cost;
            this.data.extraSlots = (this.data.extraSlots || 0) + 1;
            this.save();
            return true;
        }
        return false;
    }

    getTotalCustomizationCount() {
        const cfg = window.GAME_CONFIG || {};
        const upg = Object.keys(cfg.META_UPGRADES || {}).length;
        const liv = (cfg.MECH_COSMETICS && cfg.MECH_COSMETICS.liveries ? cfg.MECH_COSMETICS.liveries.length : 0);
        const vis = (cfg.MECH_COSMETICS && cfg.MECH_COSMETICS.visors ? cfg.MECH_COSMETICS.visors.length : 0);
        const mods = (cfg.TACTICAL_MODS || []).length;
        const atts = (cfg.MECH_ATTACHMENTS || []).length;
        const calls = (cfg.CALLSIGNS || []).length;
        let builds = 0;
        if (cfg.WEAPON_BUILDS) {
            for (const list of Object.values(cfg.WEAPON_BUILDS)) builds += list.length;
        }
        return upg + liv + vis + mods + atts + calls + builds;
    }

    getUpgradeCost(upgradeId) {
        const cfg = window.GAME_CONFIG.META_UPGRADES[upgradeId];
        if (!cfg) return 0;
        const currentRank = this.data.upgrades[upgradeId] || 0;
        if (currentRank >= cfg.maxRank) return null;
        return Math.round(cfg.baseCost * Math.pow(cfg.costMult, currentRank));
    }

    purchaseUpgrade(upgradeId) {
        const cfg = window.GAME_CONFIG.META_UPGRADES[upgradeId];
        if (!cfg) return false;
        if (this.getOperatorRank() < (cfg.minRank || 1)) return false;
        const currentRank = this.data.upgrades[upgradeId] || 0;
        if (currentRank >= cfg.maxRank) return false;

        const cost = this.getUpgradeCost(upgradeId);
        if (this.data.credits >= cost) {
            this.data.credits -= cost;
            this.data.upgrades[upgradeId] = currentRank + 1;
            this.save();
            return true;
        }
        return false;
    }

    purchaseMod(modId) {
        const mods = (window.GAME_CONFIG && window.GAME_CONFIG.TACTICAL_MODS) || [];
        const cfg = mods.find(m => m.id === modId);
        if (!cfg) return false;
        if (this.getOperatorRank() < (cfg.minRank || 1)) return false;
        if (this.data.purchasedMods[modId]) return this.toggleModEquip(modId);
        if (this.data.credits >= cfg.cost) {
            this.data.credits -= cfg.cost;
            this.data.purchasedMods[modId] = true;
            if (this.getUsedLoadoutSlots() < this.getMaxLoadoutSlots()) {
                this.data.equippedMods[modId] = true;
            }
            this.save();
            return true;
        }
        return false;
    }

    toggleModEquip(modId) {
        if (!this.data.purchasedMods || !this.data.purchasedMods[modId]) return false;
        if (this.data.equippedMods[modId]) {
            this.data.equippedMods[modId] = false;
            this.save();
            return true;
        }
        if (this.getUsedLoadoutSlots() >= this.getMaxLoadoutSlots()) return false;
        this.data.equippedMods[modId] = true;
        this.save();
        return true;
    }

    purchaseOrEquipBuild(category, buildId) {
        const list = (window.GAME_CONFIG && window.GAME_CONFIG.WEAPON_BUILDS && window.GAME_CONFIG.WEAPON_BUILDS[category]) || [];
        const cfg = list.find(b => b.id === buildId);
        if (!cfg) return false;
        if (this.getOperatorRank() < (cfg.minRank || 1)) return false;
        if (!this.data.purchasedBuilds[buildId]) {
            if (this.data.credits < cfg.cost) return false;
            this.data.credits -= cfg.cost;
            this.data.purchasedBuilds[buildId] = true;
        }
        this.data.equippedBuilds[category] = buildId;
        this.save();
        return true;
    }

    purchaseOrToggleAttachment(attId) {
        const atts = (window.GAME_CONFIG && window.GAME_CONFIG.MECH_ATTACHMENTS) || [];
        const cfg = atts.find(a => a.id === attId);
        if (!cfg) return false;
        if (this.getOperatorRank() < (cfg.minRank || 1)) return false;
        if (this.data.purchasedAttachments[attId]) {
            this.data.equippedAttachments[attId] = !this.data.equippedAttachments[attId];
            this.save();
            return true;
        }
        if (this.data.credits >= cfg.cost) {
            this.data.credits -= cfg.cost;
            this.data.purchasedAttachments[attId] = true;
            this.data.equippedAttachments[attId] = true;
            this.save();
            return true;
        }
        return false;
    }

    purchaseOrEquipCallsign(callId) {
        const calls = (window.GAME_CONFIG && window.GAME_CONFIG.CALLSIGNS) || [];
        const cfg = calls.find(c => c.id === callId);
        if (!cfg) return false;
        if (this.getOperatorRank() < (cfg.minRank || 1)) return false;
        if (!this.data.unlockedCallsigns[callId]) {
            if (this.data.credits < cfg.cost) return false;
            this.data.credits -= cfg.cost;
            this.data.unlockedCallsigns[callId] = true;
        }
        this.setCosmetic('callsign', callId);
        return true;
    }

    setCosmetic(slot, value) {
        if (!this.data.cosmetics) this.data.cosmetics = { livery: 'olive', visor: 'cyan', callsign: 'VANGUARD-01' };
        this.data.cosmetics[slot] = value;
        this.save();
    }

    getTotalInvestedScrap() {
        let total = 0;
        const cfgRoot = window.GAME_CONFIG || {};
        const upgrades = cfgRoot.META_UPGRADES || {};
        for (const [key, rank] of Object.entries(this.data.upgrades || {})) {
            const cfg = upgrades[key];
            if (!cfg || !rank) continue;
            for (let r = 0; r < rank; r++) {
                total += Math.round(cfg.baseCost * Math.pow(cfg.costMult, r));
            }
        }
        for (const m of (cfgRoot.TACTICAL_MODS || [])) {
            if (this.data.purchasedMods && this.data.purchasedMods[m.id]) total += m.cost;
        }
        for (const list of Object.values(cfgRoot.WEAPON_BUILDS || {})) {
            for (const b of list) {
                if (b.cost > 0 && this.data.purchasedBuilds && this.data.purchasedBuilds[b.id]) total += b.cost;
            }
        }
        for (const a of (cfgRoot.MECH_ATTACHMENTS || [])) {
            if (this.data.purchasedAttachments && this.data.purchasedAttachments[a.id]) total += a.cost;
        }
        for (const c of (cfgRoot.CALLSIGNS || [])) {
            if (c.cost > 0 && this.data.unlockedCallsigns && this.data.unlockedCallsigns[c.id]) total += c.cost;
        }
        const lcfg = cfgRoot.LOADOUT_SLOTS || { BASE_SLOT_COST: 160, SLOT_COST_MULT: 1.6 };
        for (let s = 0; s < (this.data.extraSlots || 0); s++) {
            total += Math.round(lcfg.BASE_SLOT_COST * Math.pow(lcfg.SLOT_COST_MULT, s));
        }
        return total;
    }

    resetUpgradesHalfRefund() {
        const totalSpent = this.getTotalInvestedScrap();
        if (totalSpent <= 0) return { refunded: 0, totalSpent: 0 };
        const refunded = Math.floor(totalSpent * 0.5);
        this.data.credits += refunded;
        this.data.extraSlots = 0;
        for (const key of Object.keys(this.data.upgrades)) {
            this.data.upgrades[key] = 0;
        }
        this.data.purchasedMods = {};
        this.data.equippedMods = {};
        this.data.purchasedBuilds = {
            standard_rotary: true,
            standard_37mm: true,
            standard_cleaver: true,
            standard_stomp: true
        };
        this.data.equippedBuilds = {
            rifle: 'standard_rotary',
            pistol: 'standard_37mm',
            melee: 'standard_cleaver',
            stomp: 'standard_stomp'
        };
        this.data.purchasedAttachments = {};
        this.data.equippedAttachments = {};
        this.data.unlockedCallsigns = { 'VANGUARD-01': true };
        this.data.cosmetics.callsign = 'VANGUARD-01';
        this.save();
        return { refunded, totalSpent };
    }

    getExtractionScaling() {
        let totalRanks = 0;
        for (const rank of Object.values(this.data.upgrades || {})) {
            totalRanks += Math.max(0, rank || 0);
        }
        const modCount = this.getUsedLoadoutSlots();
        const nonDefaultBuilds = Object.values(this.data.equippedBuilds || {}).filter(
            id => id && !['standard_rotary', 'standard_37mm', 'standard_cleaver', 'standard_stomp'].includes(id)
        ).length;
        const gearPower = totalRanks + modCount + nonDefaultBuilds * 2;
        const totalSpent = this.getTotalInvestedScrap();
        const enemyScale = Number((1.0 + gearPower * 0.045).toFixed(3));
        const holdoutSeconds = 20;
        const spawnInterval = Number(Math.max(1.15, 2.4 - gearPower * 0.045).toFixed(2));
        const spawnCount = 2 + Math.floor(gearPower / 6);
        let threatLabel = 'STANDARD';
        if (gearPower >= 24) threatLabel = 'APEX';
        else if (gearPower >= 16) threatLabel = 'EXTREME';
        else if (gearPower >= 10) threatLabel = 'HIGH';
        else if (gearPower >= 4) threatLabel = 'ELEVATED';
        return { totalRanks: gearPower, upgradeRanks: totalRanks, modCount, totalSpent, enemyScale, holdoutSeconds, spawnInterval, spawnCount, threatLabel };
    }

    _mergeEffect(bonuses, eff, isModDelta = false) {
        if (!eff) return;
        const additiveKeys = [
            'maxHp', 'dashCooldownReduction', 'startingRerolls', 'cleaverRangeBonus',
            'maxShieldBonus', 'sonarDurationBonus', 'pistolAmmoBonus', 'stompAreaBonus', 'stompCooldownDelta'
        ];
        for (const [k, v] of Object.entries(eff)) {
            if (additiveKeys.includes(k)) {
                bonuses[k] = (bonuses[k] || 0) + v;
            } else if (k in bonuses) {
                bonuses[k] += isModDelta ? v : (v - 1);
            }
        }
    }

    getActiveBonuses() {
        const bonuses = {
            maxHp: 0,
            dashCooldownReduction: 0,
            magnetMult: 1.0,
            startingRerolls: 0,
            damageMult: 1.0,
            rifleDamageMult: 1.0,
            rifleCooldownMult: 1.0,
            cleaverDamageMult: 1.0,
            cleaverRangeBonus: 0,
            meleeCooldownMult: 1.0,
            pistolDamageMult: 1.0,
            pistolAmmoBonus: 0,
            pistolReloadMult: 1.0,
            missileDamageMult: 1.0,
            maxShieldBonus: 0,
            shieldRegenMult: 1.0,
            heatDissipationMult: 1.0,
            moveSpeedMult: 1.0,
            stompDamageMult: 1.0,
            stompAreaBonus: 0,
            stompCooldownDelta: 0,
            sonarDurationBonus: 0
        };

        for (const [key, rank] of Object.entries(this.data.upgrades)) {
            const cfg = window.GAME_CONFIG.META_UPGRADES[key];
            if (cfg && rank > 0) {
                this._mergeEffect(bonuses, cfg.effect(rank), false);
            }
        }

        const mods = (window.GAME_CONFIG && window.GAME_CONFIG.TACTICAL_MODS) || [];
        for (const mod of mods) {
            if (this.data.equippedMods && this.data.equippedMods[mod.id]) {
                this._mergeEffect(bonuses, mod.bonus, true);
            }
        }

        const builds = (window.GAME_CONFIG && window.GAME_CONFIG.WEAPON_BUILDS) || {};
        for (const [cat, buildId] of Object.entries(this.data.equippedBuilds || {})) {
            const cfg = (builds[cat] || []).find(b => b.id === buildId);
            if (cfg && cfg.bonus) {
                this._mergeEffect(bonuses, cfg.bonus, true);
            }
        }

        return bonuses;
    }

    getComputedMechStats() {
        const cfg = window.GAME_CONFIG || {};
        const pcfg = cfg.PLAYER || {};
        const b = this.getActiveBonuses();
        const scale = this.getExtractionScaling();
        const p37 = (cfg.SECONDARY_WEAPONS && cfg.SECONDARY_WEAPONS.pistol37) || {};
        const clv = (cfg.SECONDARY_WEAPONS && cfg.SECONDARY_WEAPONS.cleaver) || {};
        return {
            opRank: this.getOperatorRank(),
            slotsUsed: this.getUsedLoadoutSlots(),
            slotsMax: this.getMaxLoadoutSlots(),
            maxHp: Math.round((pcfg.BASE_HP || 120) + b.maxHp),
            maxShield: Math.round((pcfg.BASE_SHIELD || 100) + b.maxShieldBonus),
            shieldRegen: Number(((pcfg.SHIELD_REGEN_RATE || 12) * b.shieldRegenMult).toFixed(1)),
            moveSpeed: Math.round((pcfg.BASE_SPEED || 240) * b.moveSpeedMult),
            dashCooldown: Number(Math.max(1.0, (pcfg.DASH_COOLDOWN || 2.8) - b.dashCooldownReduction).toFixed(2)),
            rifleDmgMult: Number((b.damageMult * b.rifleDamageMult).toFixed(2)),
            rifleCooldownMult: Number(Math.max(0.55, b.rifleCooldownMult).toFixed(2)),
            heatDissipMult: Number(b.heatDissipationMult.toFixed(2)),
            pistolDmgMult: Number((b.damageMult * b.pistolDamageMult).toFixed(2)),
            pistolAmmo: Math.max(2, (p37.magSize || 6) + b.pistolAmmoBonus),
            meleeDmgMult: Number((b.damageMult * b.cleaverDamageMult).toFixed(2)),
            meleeReach: Math.round((clv.range || pcfg.CLAW_RANGE || 140) + b.cleaverRangeBonus),
            missileDmgMult: Number((b.damageMult * b.missileDamageMult).toFixed(2)),
            stompDmgMult: Number((b.damageMult * b.stompDamageMult).toFixed(2)),
            sonarDuration: Number((((pcfg.SONAR_DURATION) || 3.5) + b.sonarDurationBonus).toFixed(1)),
            magnetRadius: Math.round((pcfg.BASE_MAGNET || 105) * b.magnetMult),
            scale
        };
    }

    recordGameEnd(survivedSeconds, kills, isVictory) {
        this.data.stats.gamesPlayed++;
        this.data.stats.totalKills += kills;
        if (isVictory) this.data.stats.victories++;
        if (survivedSeconds > this.data.stats.bestTime) {
            this.data.stats.bestTime = Math.round(survivedSeconds);
        }
        this.save();
    }
}

window.hangarSystem = new HangarSystem();
