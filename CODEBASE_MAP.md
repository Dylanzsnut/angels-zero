angel-zero/index.html:2842 -> animate(); :841 -> advanceTimeScale(realDt); :847 -> triggerSlowMo(); :1920 -> updateMissileCamState(realDt); :1942 -> updateCameraAndVisuals(dt, now)
angel-zero/src/vfx.js:24 -> createVFX(THREE, env)
angel-zero/src/vfx.js:410 -> updateMachCone(dt, mach, isCockpit)
angel-zero/index.html:2120 -> nvg (global composer wrapper)
angel-zero/src/nvg.js:15 -> createNVG(THREE, renderer, post)
angel-zero/src/nvg.js:121 -> setSize(); :25 -> composer / renderPass / bloom (globals)
angel-zero/src/nvg.js:30 -> UnrealBloomPass(size, 0.48, 0.32, 0.92)
angel-zero/src/nvg.js:134 -> render(scene, camera, t, cockpit)

angel-zero/index.html:792 -> state (global: position, velocity, quaternion, speed, mach, throttle, afterburner)
angel-zero/index.html:1524 -> updatePhysics(dt); :1452 -> updateCarrierOp(dt)
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
angel-zero/src/combat.js:15 -> strike / EW constants; :2553 -> STRIKE_GEO (pooled); :2559 -> buildStrikeTgt(i); :2572 -> strikeAlive(); :2573 -> JAM_C; :2602 -> spawnSurface(); :2731 -> groundCandidates()
angel-zero/src/combat.js:2304 -> detonateBomb(); :2663 -> destroySurface(); :1729 -> updateLock(dt); :1848 -> updateRWR(); :3513 -> update(dt,now,opts) jamming block
angel-zero/src/combat.js:2743 -> surfaceSAM(from, label)
angel-zero/src/combat.js:2682 -> updateFleet(dt)

angel-zero/index.html:832 -> blastShake / flyShake / wakeRoll (globals); :838 -> timeScale / slowMo / mcam (globals)
angel-zero/index.html:974 -> setView(fp)
angel-zero/index.html:1352 -> Space -> setView(!firstPerson); :1365 / :1405 -> M / RMB -> mcam.held
angel-zero/index.html:1942 -> updateCameraAndVisuals(dt, now); :816 -> wingmen (global pool)
angel-zero/index.html:871 -> prevPlanePos (global)
angel-zero/index.html:1314 -> freeLook (global)
angel-zero/index.html:907 -> ?at=canyonlow spot; :2687 -> ?strikekillat hook; :2479 -> getStrikeTargets HUD env

angel-zero/src/audio.js:12 -> createAudio()
angel-zero/src/audio.js:13 -> ctx / master / cockpitLP / N (globals)
angel-zero/src/audio.js:266 -> explosion(intensity, delay)
angel-zero/src/audio.js:309 -> flybyWhoosh(k, cockpit)
angel-zero/src/audio.js:586 -> masterCaution(); :643 -> cableScreech(); :660 -> catapult(); :673 -> aceWarning(); :677 -> slowMo()
angel-zero/index.html:485 -> PERF_DEBUG / renderer.info.autoReset (globals); :842 -> onFlyby({ dist, k, side }); :1353 -> Z chaff / J ECM / L gear / G orders; :2163 -> onWing(text, caption, tint); :2241 -> onSfx(type, pos, scale); :2671 -> acewingat / mcamat / slowmoat hooks
angel-zero/src/hud.js:102 -> alertState / alertOverride (globals)
angel-zero/src/hud.js:1222 -> drawBanner(ctx, cx, y, text, col, w, alpha)
angel-zero/src/hud.js:1276 -> drawJam(ctx); :1292 -> drawStrikeTargets(ctx); :1324 -> drawCenterBanners(ctx, g)
angel-zero/src/hud.js:1555 -> draw(); :1481 -> drawWingmen(ctx); :1741 -> drawAceFlightMark(ctx, e, p)
angel-zero/src/hud.js:1858 -> hudAlertState / setAlertState(s)
