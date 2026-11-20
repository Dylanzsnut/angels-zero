angel-zero/index.html:2884 -> animate(); :841 -> advanceTimeScale(realDt); :847 -> triggerSlowMo(); :1958 -> updateMissileCamState(realDt); :1980 -> updateCameraAndVisuals(dt, now)
angel-zero/src/vfx.js:24 -> createVFX(THREE, env)
angel-zero/src/vfx.js:410 -> updateMachCone(dt, mach, isCockpit)
angel-zero/index.html:2120 -> nvg (global composer wrapper)
angel-zero/src/nvg.js:15 -> createNVG(THREE, renderer, post)
angel-zero/src/nvg.js:121 -> setSize(); :25 -> composer / renderPass / bloom (globals)
angel-zero/src/nvg.js:30 -> UnrealBloomPass(size, 0.48, 0.32, 0.92)
angel-zero/src/nvg.js:134 -> render(scene, camera, t, cockpit)

angel-zero/index.html:792 -> state (global: position, velocity, quaternion, speed, mach, throttle, afterburner)
angel-zero/index.html:1562 -> updatePhysics(dt); :1490 -> updateCarrierOp(dt)
angel-zero/index.html:1400 -> state.mach = speed / sos
angel-zero/index.html:1469 -> state.pitchRate += qDot * dt
angel-zero/index.html:1527 -> state.rollRate += (pCmd - state.rollRate) * dt; :1528 -> wakeRoll bump
angel-zero/index.html:1599 -> engineThrust(mach)
angel-zero/index.html:1605 -> SINGLE_ENGINE_K (global)
angel-zero/src/combat.js:2943 -> syncEngineFlags()
angel-zero/src/combat.js:2961 -> igniteEngine(reason, side)
angel-zero/src/combat.js:3044 -> updateDamage(dt, playerActive)

angel-zero/src/combat.js:477 -> enemies (global pool)
angel-zero/src/combat.js:815 -> updateEnemy(e, dt, playerActive)
angel-zero/src/combat.js:287 -> missiles (global pool)
angel-zero/src/combat.js:304 -> director (global)
angel-zero/src/combat.js:332 -> launch(fromPos, fromQuat, fromVel, target, enemy, quality, visual, guidance); :1231 -> destroyEnemy(e, byMissile, how)
angel-zero/src/combat.js:2774 -> buildAlliedCarrier(); :2793 -> updateAlly(dt); :671 -> spawnAceFlight(); :666 -> waveAlive(); :1826 -> updateWingmen(dt); :1820 -> setWingOrder(); :1811 -> updateMissiles(dt, playerActive)
angel-zero/src/combat.js:1884 -> fuse = m.enemy ? 22 : 18; :1899 -> flyby trigger (dist, k, side)
angel-zero/src/combat.js:2250 -> dispenseChaff(); :2268 -> updateChaff(dt)
angel-zero/src/combat.js:15 -> strike / EW constants; :2592 -> STRIKE_GEO (pooled); :2598 -> buildStrikeTgt(i); :2611 -> strikeAlive(); :2612 -> JAM_C; :2641 -> spawnSurface(); :2770 -> groundCandidates()
angel-zero/src/combat.js:2334 -> detonateBomb(); :2693 -> destroySurface(); :1734 -> updateLock(dt); :1868 -> updateRWR(); :3552 -> update(dt,now,opts) jamming block
angel-zero/src/combat.js:41 -> MSL_QAAM quality; :1620 -> QAAM constants; :1834 -> fireQAAM(); :2192 -> setWeapon(); :2207 -> toggleWeapon(); :2209 -> setSPW(id)
angel-zero/src/combat.js:2743 -> surfaceSAM(from, label)
angel-zero/src/combat.js:2682 -> updateFleet(dt)

angel-zero/index.html:832 -> blastShake / flyShake / wakeRoll (globals); :838 -> timeScale / slowMo / mcam (globals)
angel-zero/index.html:1012 -> setView(fp)
angel-zero/index.html:1390 -> Space -> setView(!firstPerson); :1403 / :1443 -> M / RMB -> mcam.held
angel-zero/index.html:1980 -> updateCameraAndVisuals(dt, now); :816 -> wingmen (global pool)
angel-zero/index.html:871 -> prevPlanePos (global)
angel-zero/index.html:1352 -> freeLook (global)
angel-zero/index.html:945 -> ?at=canyonlow spot; :2725 -> ?strikekillat hook; :2527 -> getStrikeTargets HUD env
angel-zero/src/loadout.js:5 -> SPW_KEY / LIVERY_KEY; :7 -> SPW; :13 -> SQUADRON; :26..29 -> load / save helpers
angel-zero/src/livery.js:12 -> createLivery(THREE, model, LIVERIES, wingMeshes); :128 -> paint(L); :157 -> applySquadron(id); :94 -> dice decal + mesh clones
angel-zero/index.html:273 -> loadoutChip; :348 -> spwRow; :1271 -> syncLoadoutUI(); :1278 -> renderHangar(); :2623 -> createLivery(..., wingmen.map(w=>w.mesh))
angel-zero/src/hud.js:1146 -> SPW stores row (drawBottomRight)

angel-zero/src/audio.js:12 -> createAudio()
angel-zero/src/audio.js:13 -> ctx / master / cockpitLP / N (globals)
angel-zero/src/audio.js:266 -> explosion(intensity, delay)
angel-zero/src/audio.js:309 -> flybyWhoosh(k, cockpit)
angel-zero/src/audio.js:586 -> masterCaution(); :643 -> cableScreech(); :660 -> catapult(); :673 -> aceWarning(); :677 -> slowMo()
angel-zero/index.html:495 -> PERF_DEBUG / renderer.info.autoReset (globals); :842 -> onFlyby({ dist, k, side }); :1391 -> Z chaff / J ECM / L gear / G orders; :2201 -> onWing(text, caption, tint); :2279 -> onSfx(type, pos, scale); :2710 -> acewingat / mcamat / slowmoat hooks
angel-zero/src/hud.js:102 -> alertState / alertOverride (globals)
angel-zero/src/hud.js:1222 -> drawBanner(ctx, cx, y, text, col, w, alpha)
angel-zero/src/hud.js:1278 -> drawJam(ctx); :1294 -> drawStrikeTargets(ctx); :1326 -> drawCenterBanners(ctx, g)
angel-zero/src/hud.js:1557 -> draw(); :1483 -> drawWingmen(ctx); :1743 -> drawAceFlightMark(ctx, e, p)
angel-zero/src/hud.js:1858 -> hudAlertState / setAlertState(s)
