import { useState, useEffect, useRef, useCallback } from 'react';
import {
  ensureUser, isGuest, linkEmail, signInWithEmail,
  getPair, getPartnerId, createPair, joinPair,
  canSendTrace, sendTrace, getPendingTrace, discoverTrace,
  getArtwork, dissolvePair,
  subscribeToTraces, subscribeToEvents, subscribeToPair,
  getUnseenEvents, markEventSeen,
  getActiveProposal, proposeReunion, proposeReset, proposeReveal, respondToProposal, completeProposal, executeResetArtwork, subscribeToProposals,
  sendStillHere, getLastStillHere, sendNudge, getLastNudge, getLastSentTrace,
  getLastPairTrace, createCanvasChannel, sendCanvasBroadcast, saveSharedCanvas,
  getStreakData, savePushSubscription, sendPushToPartner,
  generateRecoveryToken, getRecoveryToken, recoverAccount,
  supabase
} from './lib/supabase.js';
import { detectMoment, persistMoment } from './lib/moments.js';
import { hapticTap, hapticLight, hapticMedium, hapticReveal, hapticMoment, hapticSend, hapticProximity, hapticWakePeak, hapticFollowPulse, hapticFollowComplete } from './lib/haptics.js';
import { initAudio, soundFound, soundReveal, soundMoment, soundSend, soundIncoming, soundArtworkReveal, soundStillHere, soundNudge, soundTonePreview, soundSharedCanvas } from './lib/audio.js';
import {
  TONES, TONE_KEYS, WHISPER_POOL, ECHO_POOL, GLIMPSE_TEXTS, FONT,
  lerp, dst, clamp, pick, pickN, hex2, makeNoise, analyzeGesture, drawGesturePath, drawArtwork,
  STILL_HERE_COOLDOWN_HOURS, NUDGE_DELAY_HOURS, TURN_REMINDER_DELAY_HOURS,
  EPOCH_THRESHOLDS, MILESTONES, TONE_DISCOVERY, RESIDUE_CONFIG, MAX_ECHOES,
  getEpochShift, getDiscoveryMod, getBleedPhase, RIPPLE_MAX_AGE_MS, RIPPLE_MAX_POINTS,
  WAKE_BREATH_CYCLE_MS, WAKE_THRESHOLD, FOLLOW_DURATION_MS,
  TONE_UNLOCK_THRESHOLDS, getAvailableTones
} from './lib/constants.js';

// ── VAPID helper: base64url → Uint8Array for push subscription ──
function urlBase64ToUint8Array(base64String) {
  var padding = '='.repeat((4 - base64String.length % 4) % 4);
  var base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  var rawData = window.atob(base64);
  var output = new Uint8Array(rawData.length);
  for (var i = 0; i < rawData.length; i++) output[i] = rawData.charCodeAt(i);
  return output;
}

// ══════════════════════════════════════
// WELCOME SCREEN — with subtle trace animation
// ══════════════════════════════════════
function Welcome({ onStart, onSignIn, onRecover }) {
  var _a = useState(0), al = _a[0], sa = _a[1];
  var cvRef = useRef(null);
  useEffect(function() { setTimeout(function() { sa(1); }, 300); }, []);

  // Subtle background animation: ghost traces slowly drawing themselves
  useEffect(function() {
    var c = cvRef.current; if (!c) return;
    var ctx = c.getContext("2d"), dpr = window.devicePixelRatio || 1;
    var rect = c.getBoundingClientRect();
    c.width = rect.width * dpr; c.height = rect.height * dpr; ctx.scale(dpr, dpr);
    var w = rect.width, h = rect.height, af;
    var tones = [
      { rgb: "212,165,116" }, { rgb: "107,82,196" }, { rgb: "224,122,95" }, { rgb: "0,180,216" }
    ];
    // Pre-generate some gentle curved paths
    var paths = [];
    for (var p = 0; p < 4; p++) {
      var pts = [], cx = 0.2 + Math.random() * 0.6, cy = 0.2 + Math.random() * 0.6;
      for (var i = 0; i < 40; i++) {
        var a = (i / 40) * Math.PI * 2 * (0.5 + Math.random() * 0.5);
        var r = 0.04 + i * 0.002 + Math.sin(i * 0.3) * 0.015;
        pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
      }
      paths.push({ pts: pts, tone: tones[p], delay: p * 4, speed: 0.008 + Math.random() * 0.004 });
    }

    var start = Date.now();
    function draw() {
      var t = (Date.now() - start) / 1000;
      ctx.clearRect(0, 0, w, h);
      paths.forEach(function(path) {
        var elapsed = t - path.delay;
        if (elapsed < 0) return;
        var cycle = elapsed * path.speed * 10;
        var progress = (cycle % 3) / 3; // 0-1 over 3 seconds, then repeats
        var fadeIn = Math.min(1, progress * 4);
        var fadeOut = progress > 0.6 ? 1 - (progress - 0.6) / 0.4 : 1;
        var alpha = fadeIn * fadeOut * 0.12;
        if (alpha < 0.005) return;
        var count = Math.floor(path.pts.length * Math.min(1, progress * 2));
        if (count < 2) return;
        ctx.globalAlpha = alpha;
        ctx.globalCompositeOperation = "screen";
        ctx.beginPath();
        ctx.strokeStyle = "rgba(" + path.tone.rgb + ",0.8)";
        ctx.lineWidth = 2;
        ctx.lineCap = "round"; ctx.lineJoin = "round";
        for (var i = 0; i < count; i++) {
          var pt = path.pts[i];
          i === 0 ? ctx.moveTo(pt.x * w, pt.y * h) : ctx.lineTo(pt.x * w, pt.y * h);
        }
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = "source-over";
      });
      af = requestAnimationFrame(draw);
    }
    af = requestAnimationFrame(draw);
    return function() { cancelAnimationFrame(af); };
  }, []);

  return (
    <div style={{ position:"absolute",inset:0,zIndex:50,background:"#0A0A12",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",fontFamily:FONT,opacity:al,transition:"opacity 1s ease" }}>
      <canvas ref={cvRef} style={{ position:"absolute",inset:0,width:"100%",height:"100%",pointerEvents:"none" }} />
      <div style={{ position:"relative",zIndex:1,marginBottom:60 }}>
        <div style={{ fontSize:24,fontWeight:200,letterSpacing:"0.5em",color:"rgba(255,255,255,0.6)",marginBottom:16,textAlign:"center" }}>RESONA</div>
        <div style={{ fontSize:12,fontWeight:200,letterSpacing:"0.15em",color:"rgba(255,255,255,0.58)",textAlign:"center",lineHeight:1.8 }}>
          a private space<br/>for two people<br/>to feel each other<br/>without words
        </div>
      </div>
      <div onClick={function() { initAudio(); if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission(); onStart(); }} style={{ position:"relative",zIndex:1,padding:"14px 40px",borderRadius:28,border:"1px solid rgba(255,255,255,0.08)",background:"rgba(255,255,255,0.03)",cursor:"pointer" }}>
        <span style={{ color:"rgba(255,255,255,0.58)",fontSize:12,letterSpacing:"0.2em",fontWeight:200 }}>BEGIN</span>
      </div>
      <div onClick={function(ev) { ev.stopPropagation(); onSignIn(); }} style={{ position:"relative",zIndex:1,marginTop:24,cursor:"pointer",padding:"8px 16px" }}>
        <span style={{ color:"rgba(255,255,255,0.52)",fontSize:12,letterSpacing:"0.1em",fontWeight:200 }}>already have an account?</span>
      </div>
      <div onClick={function(ev) { ev.stopPropagation(); onRecover(); }} style={{ position:"relative",zIndex:1,marginTop:8,cursor:"pointer",padding:"6px 16px" }}>
        <span style={{ color:"rgba(255,255,255,0.3)",fontSize:11,letterSpacing:"0.1em",fontWeight:200 }}>recover my space</span>
      </div>
    </div>
  );
}

// ══════════════════════════════════════
// ONBOARDING — animated visual explanation
// ══════════════════════════════════════
function OnboardingAnim({ step, w, h, ctx }) {
  // Step 0: "draw what you feel" — a trace being drawn with tone color
  if (step === 0) {
    return function(t) {
      var colors = [
        { r: 212, g: 165, b: 116 }, // nearness
        { r: 107, g: 82, b: 196 },  // longing
        { r: 0, g: 180, b: 216 },   // playfulness
      ];
      var col = colors[Math.floor(t * 0.15) % colors.length];
      var rgb = col.r + "," + col.g + "," + col.b;
      var cx = w / 2, cy = h * 0.35;
      // Animated trace path
      var progress = (t * 0.7) % 4; // 0-4 cycle
      var drawProg = Math.min(1, progress);
      var fadeProg = progress > 2.5 ? (progress - 2.5) / 1.5 : 0;
      var alpha = (1 - fadeProg) * 0.6;
      if (alpha < 0.01) return;
      var pts = [];
      for (var i = 0; i <= 40; i++) {
        var p = i / 40;
        if (p > drawProg) break;
        var angle = p * Math.PI * 1.8 - 0.3;
        var radius = 30 + p * 45 + Math.sin(p * 5) * 12;
        pts.push({ x: cx + Math.cos(angle) * radius, y: cy + Math.sin(angle) * radius * 0.7 });
      }
      if (pts.length < 2) return;
      // Glow
      ctx.globalAlpha = alpha * 0.3;
      ctx.globalCompositeOperation = "screen";
      ctx.beginPath(); ctx.strokeStyle = "rgba(" + rgb + ",0.5)"; ctx.lineWidth = 16; ctx.lineCap = "round"; ctx.lineJoin = "round";
      pts.forEach(function(pt, i) { i === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y); }); ctx.stroke();
      // Core
      ctx.beginPath(); ctx.strokeStyle = "rgba(" + rgb + ",0.8)"; ctx.lineWidth = 3;
      pts.forEach(function(pt, i) { i === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y); }); ctx.stroke();
      // Cursor dot at tip
      if (pts.length > 0 && drawProg < 1) {
        var tip = pts[pts.length - 1];
        var grd = ctx.createRadialGradient(tip.x, tip.y, 0, tip.x, tip.y, 20);
        grd.addColorStop(0, "rgba(" + rgb + "," + (alpha * 0.7) + ")"); grd.addColorStop(1, "transparent");
        ctx.fillStyle = grd; ctx.beginPath(); ctx.arc(tip.x, tip.y, 20, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";
      // Tone circles hint at bottom
      var toneColors = ["#D4A574", "#6B52C4", "#C41E3A", "#E07A5F", "#00B4D8"];
      toneColors.forEach(function(c, i) {
        var tx = w / 2 + (i - 2) * 28, ty = h * 0.58;
        ctx.globalAlpha = 0.15 + (Math.floor(t * 0.15) % 5 === i ? 0.2 : 0);
        ctx.fillStyle = c; ctx.beginPath(); ctx.arc(tx, ty, 8, 0, Math.PI * 2); ctx.fill();
      });
      ctx.globalAlpha = 1;
    };
  }
  // Step 1: "your person discovers it" — searching glow finding a hidden point
  if (step === 1) {
    return function(t) {
      var cycle = (t * 1.2) % 5;
      var targetX = w * 0.55, targetY = h * 0.32;
      // Searching finger position — spirals toward target
      var searchProgress = Math.min(1, cycle / 3);
      var sx = w * 0.3 + (targetX - w * 0.3) * searchProgress + Math.sin(t * 1.2) * (1 - searchProgress) * 60;
      var sy = h * 0.5 + (targetY - h * 0.5) * searchProgress + Math.cos(t * 0.9) * (1 - searchProgress) * 40;
      var dist = Math.sqrt((sx - targetX) * (sx - targetX) + (sy - targetY) * (sy - targetY));
      var maxDist = 150;
      var proximity = Math.max(0, 1 - dist / maxDist);
      // Background proximity glow
      if (proximity > 0.1) {
        ctx.globalAlpha = proximity * 0.25; ctx.globalCompositeOperation = "screen";
        var grd = ctx.createRadialGradient(sx, sy, 0, sx, sy, 50 + proximity * 80);
        grd.addColorStop(0, "rgba(212,165,116,0.6)"); grd.addColorStop(1, "transparent");
        ctx.fillStyle = grd; ctx.beginPath(); ctx.arc(sx, sy, 50 + proximity * 80, 0, Math.PI * 2); ctx.fill();
      }
      // Connection line when close
      if (proximity > 0.5) {
        ctx.globalAlpha = (proximity - 0.5) * 0.3; ctx.strokeStyle = "rgba(212,165,116,0.4)"; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(targetX, targetY); ctx.stroke();
      }
      // Hold ring when very close
      if (cycle > 3 && cycle < 4.5) {
        var holdProg = (cycle - 3) / 1.5;
        ctx.globalAlpha = 0.5; ctx.strokeStyle = "rgba(212,165,116,0.6)"; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(targetX, targetY, 24, -Math.PI / 2, -Math.PI / 2 + holdProg * Math.PI * 2); ctx.stroke();
        var ig = ctx.createRadialGradient(targetX, targetY, 0, targetX, targetY, 18);
        ig.addColorStop(0, "rgba(212,165,116," + (holdProg * 0.4) + ")"); ig.addColorStop(1, "transparent");
        ctx.fillStyle = ig; ctx.beginPath(); ctx.arc(targetX, targetY, 18, 0, Math.PI * 2); ctx.fill();
      }
      // Reveal flash
      if (cycle > 4.5) {
        var revealA = 1 - (cycle - 4.5) / 0.5;
        ctx.globalAlpha = revealA * 0.4; ctx.globalCompositeOperation = "screen";
        var rg = ctx.createRadialGradient(targetX, targetY, 0, targetX, targetY, 80);
        rg.addColorStop(0, "rgba(212,165,116,0.8)"); rg.addColorStop(1, "transparent");
        ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(targetX, targetY, 80, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";
    };
  }
  // Step 2: "something grows between you" — traces accumulating into artwork
  if (step === 2) {
    return function(t) {
      var tones = [
        { rgb: "212,165,116", cols: ["#D4A574", "#E8C99B"] },
        { rgb: "107,82,196", cols: ["#4A3198", "#6B52C4"] },
        { rgb: "224,122,95", cols: ["#E07A5F", "#F2CC8F"] },
        { rgb: "0,180,216", cols: ["#00B4D8", "#48D1E8"] },
        { rgb: "196,30,58", cols: ["#C41E3A", "#E03E5A"] },
      ];
      var cx = w / 2, cy = h * 0.35;
      var numTraces = Math.min(5, Math.floor(t * 0.5) + 1);
      var clipR = Math.min(w, h) * 0.22;
      // Vignette circle
      ctx.save();
      ctx.beginPath(); ctx.arc(cx, cy, clipR, 0, Math.PI * 2); ctx.clip();
      // Draw accumulated traces
      for (var i = 0; i < numTraces; i++) {
        var tone = tones[i % tones.length];
        var age = (numTraces - i) / numTraces;
        var alpha = 0.2 + age * 0.4;
        var offA = i * 1.3 + 0.5;
        ctx.globalAlpha = alpha; ctx.globalCompositeOperation = "screen";
        ctx.beginPath();
        ctx.strokeStyle = tone.cols[0]; ctx.lineWidth = 2; ctx.lineCap = "round"; ctx.lineJoin = "round";
        for (var j = 0; j <= 30; j++) {
          var p = j / 30;
          var angle = p * Math.PI * (1.2 + i * 0.4) + offA;
          var radius = 15 + p * (clipR * 0.7) + Math.sin(p * 4 + i) * 10;
          var px = cx + Math.cos(angle + i * 0.8) * radius * (0.6 + Math.sin(i * 1.1) * 0.3);
          var py = cy + Math.sin(angle + i * 0.8) * radius * 0.5;
          j === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
        }
        ctx.stroke();
        // Glow
        ctx.strokeStyle = tone.cols[1] + "33"; ctx.lineWidth = 12;
        ctx.stroke();
      }
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";
      ctx.restore();
      // Soft vignette edge
      var eg = ctx.createRadialGradient(cx, cy, clipR * 0.7, cx, cy, clipR * 1.15);
      eg.addColorStop(0, "transparent"); eg.addColorStop(1, "#0A0A12");
      ctx.fillStyle = eg; ctx.fillRect(0, 0, w, h);
    };
  }
  return function() {};
}

function Onboarding({ onDone }) {
  var _s = useState(0), step = _s[0], setStep = _s[1];
  var _a = useState(0), al = _a[0], setAl = _a[1];
  var cvRef = useRef(null);

  var steps = [
    { title: "draw what you feel", body: "choose an emotional tone\nand draw a gesture with your finger" },
    { title: "your person discovers it", body: "your trace appears in their space\nthey search for it and reveal it" },
    { title: "something grows between you", body: "every trace becomes part of\nan invisible shared artwork" },
  ];

  useEffect(function() {
    setAl(0);
    var t = setTimeout(function() { setAl(1); }, 50);
    return function() { clearTimeout(t); };
  }, [step]);

  // Canvas animation
  useEffect(function() {
    var c = cvRef.current; if (!c) return;
    var ctx = c.getContext("2d"), dpr = window.devicePixelRatio || 1;
    var rect = c.getBoundingClientRect();
    c.width = rect.width * dpr; c.height = rect.height * dpr; ctx.scale(dpr, dpr);
    var w = rect.width, h = rect.height;
    var drawFn = OnboardingAnim({ step: step, w: w, h: h, ctx: ctx });
    var start = Date.now(), af;
    function frame() {
      var t = (Date.now() - start) / 1000;
      ctx.clearRect(0, 0, w, h);
      drawFn(t);
      af = requestAnimationFrame(frame);
    }
    af = requestAnimationFrame(frame);
    return function() { cancelAnimationFrame(af); };
  }, [step]);

  var advance = function() {
    setAl(0);
    setTimeout(function() {
      setStep(function(s) {
        if (s < steps.length - 1) return s + 1;
        onDone();
        return s;
      });
    }, 300);
  };

  var s = steps[step];
  return (
    <div onClick={advance} style={{ position:"absolute",inset:0,zIndex:50,background:"#0A0A12",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"flex-end",fontFamily:FONT,cursor:"pointer",opacity:al,transition:"opacity 0.4s ease" }}>
      <canvas ref={cvRef} style={{ position:"absolute",inset:0,width:"100%",height:"100%",pointerEvents:"none" }} />
      <div style={{ position:"relative",zIndex:1,marginBottom:100,textAlign:"center",padding:"0 30px" }}>
        <div style={{ fontSize:17,fontWeight:200,letterSpacing:"0.2em",color:"rgba(255,255,255,0.6)",marginBottom:16 }}>{s.title}</div>
        <div style={{ fontSize:14,fontWeight:200,letterSpacing:"0.08em",color:"rgba(255,255,255,0.58)",lineHeight:2,whiteSpace:"pre-line" }}>{s.body}</div>
      </div>
      <div style={{ position:"absolute",bottom:60,display:"flex",gap:8 }}>
        {steps.map(function(_, i) { return <div key={i} style={{ width:i===step?16:4,height:4,borderRadius:2,background:i===step?"rgba(255,255,255,0.25)":"rgba(255,255,255,0.08)",transition:"all 0.3s" }} />; })}
      </div>
      <div style={{ position:"absolute",bottom:30,color:"rgba(255,255,255,0.58)",fontSize:13,letterSpacing:"0.15em",fontWeight:200 }}>{step < steps.length - 1 ? "tap to continue" : "tap to start"}</div>
    </div>
  );
}

// ══════════════════════════════════════
// PAIR SETUP
// ══════════════════════════════════════
function PairSetup({ onPaired, userId }) {
  var _m = useState("choose"), mode = _m[0], setMode = _m[1];
  var _c = useState(""), code = _c[0], setCode = _c[1];
  var _con = useState(false), connecting = _con[0], setCon = _con[1];
  var _inv = useState(null), invite = _inv[0], setInvite = _inv[1];
  var _err = useState(null), err = _err[0], setErr = _err[1];

  // Auto-fill code from URL parameter (?code=ABC123)
  useEffect(function() {
    try {
      var params = new URLSearchParams(window.location.search);
      var urlCode = params.get("code");
      if (urlCode && urlCode.length >= 6) {
        setCode(urlCode.toUpperCase());
        setMode("join");
        // Clean URL
        window.history.replaceState({}, '', window.location.pathname);
      }
    } catch (e) {}
  }, []);

  var handleCreate = async function() {
    setCon(true); setErr(null);
    try {
      var result = await createPair();
      setInvite(result.invite_code);
      setMode("waiting");
      setCon(false);
    } catch (e) { setErr(e.message); setCon(false); }
  };

  var handleJoin = async function() {
    if (code.length < 6) return;
    setCon(true); setErr(null);
    try {
      var result = await joinPair(code);
      if (result.error) { setErr(result.error); setCon(false); return; }
      onPaired(result.pair_id);
    } catch (e) { setErr(e.message); setCon(false); }
  };

  useEffect(function() {
    if (mode !== "waiting" || !invite) return;
    var iv = setInterval(async function() {
      try {
        var pair = await getPair(userId);
        if (pair && pair.status === "active") { clearInterval(iv); onPaired(pair.id); }
      } catch (e) { /* ignore polling errors */ }
    }, 3000);
    return function() { clearInterval(iv); };
  }, [mode, invite, userId, onPaired]);

  if (connecting) {
    return (
      <div style={{ position:"absolute",inset:0,zIndex:50,background:"#0A0A12",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",fontFamily:FONT }}>
        <div style={{ width:6,height:6,borderRadius:"50%",background:"rgba(255,255,255,0.3)",animation:"gentlePulse 1.5s ease infinite" }}/>
        <div style={{ marginTop:20,color:"rgba(255,255,255,0.57)",fontSize:12,letterSpacing:"0.2em",fontWeight:200 }}>CONNECTING</div>
      </div>
    );
  }

  return (
    <div style={{ position:"absolute",inset:0,zIndex:50,background:"#0A0A12",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",fontFamily:FONT }}>
      <div style={{ fontSize:16,fontWeight:200,letterSpacing:"0.35em",color:"rgba(255,255,255,0.63)",marginBottom:50 }}>RESONA</div>
      {err ? <div style={{ color:"rgba(196,30,58,0.6)",fontSize:12,marginBottom:20,letterSpacing:"0.1em" }}>{err}</div> : null}
      {mode === "choose" ? (
        <div style={{ display:"flex",flexDirection:"column",gap:20,alignItems:"center" }}>
          <div style={{ color:"rgba(255,255,255,0.63)",fontSize:13,letterSpacing:"0.2em",fontWeight:200,marginBottom:10 }}>CONNECT WITH YOUR PERSON</div>
          <div onClick={handleCreate} style={{ padding:"14px 44px",borderRadius:24,border:"1px solid rgba(255,255,255,0.1)",background:"rgba(255,255,255,0.03)",cursor:"pointer",color:"rgba(255,255,255,0.58)",fontSize:13,letterSpacing:"0.18em",fontWeight:200 }}>CREATE INVITE</div>
          <div onClick={function() { setMode("join"); }} style={{ padding:"14px 44px",borderRadius:24,border:"1px solid rgba(255,255,255,0.1)",background:"rgba(255,255,255,0.03)",cursor:"pointer",color:"rgba(255,255,255,0.58)",fontSize:13,letterSpacing:"0.18em",fontWeight:200 }}>ENTER CODE</div>
        </div>
      ) : mode === "waiting" ? (
        <div style={{ display:"flex",flexDirection:"column",alignItems:"center",gap:20 }}>
          <div style={{ color:"rgba(255,255,255,0.58)",fontSize:12,letterSpacing:"0.2em",fontWeight:200 }}>SHARE THIS CODE</div>
          <div onClick={function() { try { navigator.clipboard.writeText(invite); } catch(e) {} }} style={{ fontSize:32,fontWeight:300,letterSpacing:"0.4em",color:"rgba(255,255,255,0.6)",padding:"16px 32px",borderRadius:12,background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.08)",cursor:"pointer" }}>{invite}</div>
          <div style={{ color:"rgba(255,255,255,0.52)",fontSize:13,fontWeight:200 }}>tap code to copy</div>
          <div onClick={function() {
            var url = window.location.origin + "?code=" + invite;
            if (navigator.share) {
              navigator.share({ title: "Resona", text: "Join me on Resona", url: url }).catch(function(){});
            } else {
              try { navigator.clipboard.writeText(url); } catch(e) {}
            }
          }} style={{ padding:"14px 44px",borderRadius:24,border:"1px solid rgba(212,165,116,0.2)",background:"rgba(212,165,116,0.05)",cursor:"pointer",color:"rgba(212,165,116,0.7)",fontSize:13,letterSpacing:"0.15em",fontWeight:300 }}>
            INVITE YOUR PERSON
          </div>
          <div style={{ color:"rgba(255,255,255,0.63)",fontSize:13,letterSpacing:"0.15em",fontWeight:200 }}>waiting for your person to join{"\u2026"}</div>
          <div style={{ width:4,height:4,borderRadius:"50%",background:"rgba(255,255,255,0.2)",animation:"gentlePulse 2s ease infinite",marginTop:6 }}/>
        </div>
      ) : (
        <div style={{ display:"flex",flexDirection:"column",alignItems:"center",gap:20 }}>
          <div style={{ color:"rgba(255,255,255,0.58)",fontSize:12,letterSpacing:"0.2em",fontWeight:200 }}>ENTER INVITE CODE</div>
          <input value={code} onChange={function(ev) { setCode(ev.target.value.toUpperCase()); }} placeholder="________" maxLength={8}
            style={{ fontSize:24,fontWeight:300,letterSpacing:"0.3em",color:"rgba(255,255,255,0.6)",padding:"14px 28px",borderRadius:12,background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.1)",textAlign:"center",outline:"none",fontFamily:FONT,width:280 }}/>
          <div style={{ display:"flex",gap:16 }}>
            <div onClick={function() { setMode("choose"); setErr(null); }} style={{ padding:"10px 24px",borderRadius:20,border:"1px solid rgba(255,255,255,0.06)",cursor:"pointer",color:"rgba(255,255,255,0.58)",fontSize:12,letterSpacing:"0.15em",fontWeight:200 }}>BACK</div>
            <div onClick={handleJoin} style={{ padding:"10px 24px",borderRadius:20,border:"1px solid rgba(255,255,255,0.12)",background:code.length>=6?"rgba(255,255,255,0.08)":"transparent",cursor:code.length>=6?"pointer":"default",color:code.length>=6?"rgba(255,255,255,0.5)":"rgba(255,255,255,0.15)",fontSize:12,letterSpacing:"0.15em",fontWeight:200 }}>CONNECT</div>
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════
// MAIN APP
// ══════════════════════════════════════
export default function App() {
  var _ap = useState("loading"), appPhase = _ap[0], setAppPhase = _ap[1];
  var _u = useState(null), user = _u[0], setUser = _u[1];
  var _pr = useState(null), pair = _pr[0], setPair = _pr[1];
  var _er = useState(null), initError = _er[0], setInitError = _er[1];

  useEffect(function() {
    (async function() {
      try {
        var u = await ensureUser();
        setUser(u);
        try {
          var p = await getPair(u.id);
          if (p && p.status === "active") {
            setPair(p);
            setAppPhase("space");
          } else {
            setAppPhase("welcome");
          }
        } catch (dbErr) {
          console.error("DB error:", dbErr);
          setAppPhase("welcome");
        }
      } catch (authErr) {
        console.error("Auth error:", authErr);
        setInitError("Connection failed. Please try again later.");
      }
    })();
  }, []);

  var handleStart = useCallback(function() { setAppPhase("onboarding"); }, []);
  var handleSignIn = useCallback(function() { setAppPhase("signin"); }, []);
  var handleRecover = useCallback(function() { setAppPhase("recovery"); }, []);
  var handleSignInDone = useCallback(async function() {
    try {
      var u = await ensureUser();
      setUser(u);
      var p = await getPair(u.id);
      if (p && p.status === "active") {
        setPair(p);
        setAppPhase("space");
      } else {
        setAppPhase("pairing");
      }
    } catch (e) {
      console.error("Sign-in check error:", e);
      setAppPhase("welcome");
    }
  }, []);
  var handleRecoveryDone = useCallback(async function() {
    try {
      var u = await ensureUser();
      setUser(u);
      var p = await getPair(u.id);
      if (p && p.status === "active") {
        setPair(p);
        setAppPhase("space");
      } else {
        setAppPhase("welcome");
      }
    } catch (e) {
      console.error("Recovery done error:", e);
      setAppPhase("welcome");
    }
  }, []);
  var handleSignInBack = useCallback(function() { setAppPhase("welcome"); }, []);
  var handleOnboardingDone = useCallback(function() { setAppPhase("pairing"); }, []);
  var handlePaired = useCallback(async function(pairId) {
    var p = await getPair(user.id);
    setPair(p);
    setAppPhase("space");
  }, [user]);
  var handleDissolve = useCallback(async function() {
    try {
      await dissolvePair();
      setPair(null);
      setAppPhase("welcome");
    } catch (e) {
      console.error("Dissolve error:", e);
      setInitError("Failed to dissolve connection. Please try again.");
    }
  }, []);

  if (appPhase === "loading") {
    return (
      <div style={{ width:"100%",height:"100vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",background:"#0A0A12",fontFamily:FONT,gap:20 }}>
        <div style={{ color:"rgba(255,255,255,0.6)",fontSize:12,letterSpacing:"0.3em",fontWeight:200 }}>RESONA</div>
        {initError ? (
          <div style={{ maxWidth:340,textAlign:"center",padding:"16px 20px",borderRadius:12,background:"rgba(196,30,58,0.08)",border:"1px solid rgba(196,30,58,0.15)" }}>
            <div style={{ color:"rgba(196,30,58,0.7)",fontSize:12,letterSpacing:"0.05em",fontWeight:300,lineHeight:1.6 }}>{initError}</div>
          </div>
        ) : (
          <div style={{ width:4,height:4,borderRadius:"50%",background:"rgba(255,255,255,0.2)",animation:"gentlePulse 2s ease infinite" }}/>
        )}
      </div>
    );
  }

  if (appPhase === "welcome") return <Welcome onStart={handleStart} onSignIn={handleSignIn} onRecover={handleRecover} />;
  if (appPhase === "signin") return <SignInUI onDone={handleSignInDone} onBack={handleSignInBack} />;
  if (appPhase === "recovery") return <RecoveryUI user={user} onDone={handleRecoveryDone} onBack={function() { setAppPhase("welcome"); }} />;
  if (appPhase === "onboarding") return <Onboarding onDone={handleOnboardingDone} />;
  if (appPhase === "pairing") return <PairSetup onPaired={handlePaired} userId={user ? user.id : null} />;
  return <ResonanceSpace user={user} pair={pair} onDissolve={handleDissolve} />;
}


// ══════════════════════════════════════
// RESONANCE SPACE — the core experience
// ══════════════════════════════════════
function ResonanceSpace({ user, pair, onDissolve }) {
  var partnerId = getPartnerId(pair, user.id);

  // ── State ──
  var _p = useState("idle"), phase = _p[0], setPhase = _p[1];
  var _t = useState(null), trace = _t[0], setTrace = _t[1];
  var _tc = useState(null), touch = _tc[0], setTouch = _tc[1];
  var _hp = useState(0), holdProg = _hp[0], setHoldProg = _hp[1];
  var _cs = useState(false), canSend = _cs[0], setCanSend = _cs[1];
  var _lt = useState(null), lastTone = _lt[0], setLastTone = _lt[1];
  var _st = useState(null), sentTone = _st[0], setSentTone = _st[1];
  var _cb = useState([]), contribs = _cb[0], setContribs = _cb[1];
  var _rt = useState([]), recTones = _rt[0], setRecTones = _rt[1];
  var _re = useState([]), resEchoes = _re[0], setResEchoes = _re[1]; // Array of echoes
  var _idle = useState(0), idleT = _idle[0], setIdleT = _idle[1];
  var _set = useState(false), showSettings = _set[0], setShowSettings = _set[1];
  var _email = useState(false), showEmail = _email[0], setShowEmail = _email[1];
  var guest = isGuest(user);
  var _ob = useState(0), onbStep = _ob[0], setOnbStep = _ob[1];
  var _err = useState(null), appError = _err[0], setAppError = _err[1];
  var _recTok = useState(null), recoveryToken = _recTok[0], setRecoveryToken = _recTok[1];
  var _recTokGen = useState(false), generatingRecovToken = _recTokGen[0], setGeneratingRecovToken = _recTokGen[1];

  // ── Moment state (single moment, not queue) ──
  var _mp = useState(null), mPhase = _mp[0], setMPhase = _mp[1];
  var _mt = useState(null), mTone = _mt[0], setMTone = _mt[1];
  var _mm = useState(null), currentMoment = _mm[0], setCurrentMoment = _mm[1];
  var _ww = useState(null), whisper = _ww[0], setWhisper = _ww[1];
  var _em = useState(null), echoM = _em[0], setEchoM = _em[1];
  var _pg = useState(null), pendPulse = _pg[0], setPendPulse = _pg[1];

  // ── Incoming partner moment state ──
  var _im = useState(null), incomingMoment = _im[0], setIncomingMoment = _im[1];

  // ── Passive reveal notice ──
  var _prn = useState(false), passiveNotice = _prn[0], setPassiveNotice = _prn[1];

  // ── Dissolved by partner ──
  var _dis = useState(false), dissolved = _dis[0], setDissolved = _dis[1];

  // ── Reunion (artwork reveal date) ──
  var _reu = useState(null), reunion = _reu[0], setReunion = _reu[1];
  var _reuUI = useState(null), reunionUI = _reuUI[0], setReunionUI = _reuUI[1];

  // ── Presence + day counter ──
  var _pres = useState(false), partnerHere = _pres[0], setPartnerHere = _pres[1];
  var dayCount = pair ? Math.max(1, Math.ceil((Date.now() - new Date(pair.created_at).getTime()) / 86400000)) : 0;

  // ── Still-here gesture state ──
  var _shReady = useState(false), stillHereReady = _shReady[0], setStillHereReady = _shReady[1];
  var _shSent = useState(false), stillHereSent = _shSent[0], setStillHereSent = _shSent[1];
  var _shHold = useState(0), stillHereHold = _shHold[0], setStillHereHold = _shHold[1];
  var _shInc = useState(null), stillHereIncoming = _shInc[0], setStillHereIncoming = _shInc[1];
  var stillHereHoldRef = useRef(null);

  // ── Nudge state ──
  var _nudgeReady = useState(false), nudgeReady = _nudgeReady[0], setNudgeReady = _nudgeReady[1];
  var _nudgeSent = useState(false), nudgeSent = _nudgeSent[0], setNudgeSent = _nudgeSent[1];
  var _nudgeConfirm = useState(false), nudgeConfirm = _nudgeConfirm[0], setNudgeConfirm = _nudgeConfirm[1];
  var _nudgeInc = useState(null), nudgeIncoming = _nudgeInc[0], setNudgeIncoming = _nudgeInc[1];
  var _sentAt = useState(null), sentAt = _sentAt[0], setSentAt = _sentAt[1];

  // ── Streak state ──
  var _str = useState({ current: 0, totalDays: 0 }), streakData = _str[0], setStreakData = _str[1];

  // ── Tone awakening ──
  var _twa = useState(null), tonesAwakening = _twa[0], setTonesAwakening = _twa[1];

  // ── Milestone state ──
  var _mile = useState(null), milestone = _mile[0], setMilestone = _mile[1];

  // ── Turn reminder state ──
  var _turnWait = useState(false), turnWaiting = _turnWait[0], setTurnWaiting = _turnWait[1];
  var _turnSince = useState(null), turnSince = _turnSince[0], setTurnSince = _turnSince[1];
  var _turnNudgeReady = useState(false), turnNudgeReady = _turnNudgeReady[0], setTurnNudgeReady = _turnNudgeReady[1];
  var _turnNudgeSent = useState(false), turnNudgeSent = _turnNudgeSent[0], setTurnNudgeSent = _turnNudgeSent[1];
  var _turnNudgeConfirm = useState(false), turnNudgeConfirm = _turnNudgeConfirm[0], setTurnNudgeConfirm = _turnNudgeConfirm[1];

  // ── Idle touch ripples ──
  var idleTouchesR = useRef([]);

  // ── Artwork bleed cache ──
  var bleedCacheR = useRef(null);
  var bleedCacheTimeR = useRef(0);

  // ── Shared Canvas state ──
  var _sharedPhase = useState(null), sharedPhase = _sharedPhase[0], setSharedPhase = _sharedPhase[1]; // null|inviting|invited|drawing|saving
  var _sharedTimer = useState(30), sharedTimer = _sharedTimer[0], setSharedTimer = _sharedTimer[1];
  var _partnerStrokes = useState([]), partnerStrokes = _partnerStrokes[0], setPartnerStrokes = _partnerStrokes[1];
  var myStrokesR = useRef([]);
  var canvasChannelR = useRef(null);

  var sharedPhaseR = useRef(null);
  useEffect(function() { sharedPhaseR.current = sharedPhase; }, [sharedPhase]);

  var cvRef = useRef(null);
  var nf1 = useRef(makeNoise()), nf2 = useRef(makeNoise()), nf3 = useRef(makeNoise());
  var timeR = useRef(0), afR = useRef(null);
  var particles = useRef(Array.from({ length: 40 }, function() { return { x:Math.random(),y:Math.random(),vx:0,vy:0,size:1+Math.random()*2.5,ba:0.04+Math.random()*0.1 }; }));
  var holdRef = useRef(null), hpR = useRef(0);
  var phR = useRef("idle"), trR = useRef(null), tcR = useRef(null), rtR = useRef([]), reR = useRef([]), cbR = useRef([]);
  var revealTraceR = useRef(null), onbStepR = useRef(0);
  var partnerHereR = useRef(false), presenceBlendR = useRef(0);
  var epochShiftR = useRef({ hueShift: 0, satBoost: 0 });
  var effectiveRevealPosR = useRef(null);
  var breathAmpR = useRef(0);
  var followInProxR = useRef(false);

  useEffect(function() { phR.current = phase; }, [phase]);
  useEffect(function() { trR.current = trace; }, [trace]);
  useEffect(function() { tcR.current = touch; }, [touch]);
  useEffect(function() { rtR.current = recTones; }, [recTones]);
  useEffect(function() { reR.current = resEchoes; }, [resEchoes]);
  useEffect(function() { cbR.current = contribs; }, [contribs]);
  useEffect(function() { onbStepR.current = onbStep; }, [onbStep]);
  useEffect(function() { partnerHereR.current = partnerHere; }, [partnerHere]);
  useEffect(function() { epochShiftR.current = getEpochShift(contribs.length); }, [contribs]);

  // ── Clear errors after 5s ──
  useEffect(function() {
    if (!appError) return;
    var t = setTimeout(function() { setAppError(null); }, 5000);
    return function() { clearTimeout(t); };
  }, [appError]);

  // ── Load recovery token when settings opens (guests only) ──
  useEffect(function() {
    if (!showSettings || !guest || !user) return;
    if (recoveryToken !== null) return; // already loaded
    getRecoveryToken(user.id).then(function(tok) {
      setRecoveryToken(tok || "");
    }).catch(function() { setRecoveryToken(""); });
  }, [showSettings, guest, user]);

  // ── Initial load ──
  useEffect(function() {
    if (!pair) return;
    (async function() {
      try {
        var art = await getArtwork(pair.id);
        var artContribs = [];
        if (art.length > 0) {
          artContribs = art.filter(function(a) { return a.path_data && a.path_data.path; }).map(function(a) { return { tone: a.tone, path: a.path_data.path }; });
          setContribs(artContribs);
          setRecTones(art.slice(-20).map(function(a) { return a.tone; }).reverse());
          setOnbStep(4);
        }

        // Load ghost chapter (previous artwork echo after Start Fresh)
        try {
          var ghostKey = 'resona_ghost_' + pair.id;
          var ghostRaw = localStorage.getItem(ghostKey);
          if (ghostRaw) ghostChapterR.current = JSON.parse(ghostRaw);
        } catch(e) {}

        // Check for newly awakened tones
        try {
          var totalTraces = art.length;
          var prevTraceCount = parseInt(localStorage.getItem('resona_prev_trace_count') || '0');
          var nowAvailable = getAvailableTones(totalTraces);
          var prevAvailable = getAvailableTones(prevTraceCount);
          var newlyAwakened = nowAvailable.filter(function(k) { return prevAvailable.indexOf(k) === -1; });
          if (newlyAwakened.length > 0) setTonesAwakening(newlyAwakened);
          localStorage.setItem('resona_prev_trace_count', String(totalTraces));
        } catch(e) {}

        // Load streak data
        try {
          var sd = await getStreakData(user.id);
          setStreakData(sd);
        } catch(e) {}
        var pending = await getPendingTrace(user.id);
        var localCanSend = false;
        if (pending) {
          setTrace(pending);
          setPhase("discovery");
        } else {
          var cs = await canSendTrace(user.id);
          localCanSend = cs;
          setCanSend(cs);
          if (cs) { setSentTone(null); }
        }

        // Check for unseen resonance events from partner
        // Mark all seen to prevent re-showing on next reload, then display most recent
        var unseen = await getUnseenEvents(pair.id, user.id, pair);
        if (unseen.length > 0) {
          unseen.forEach(function(ev) { markEventSeen(ev.id, user.id, pair).catch(function() {}); });
          handleIncomingEvent(unseen[unseen.length - 1]);
        }

        // Check for active proposals (priority: reunion date > reveal > reset)
        try {
          var foundUI = null;
          // Reunion
          var reu = await getActiveProposal(pair.id, 'reunion');
          if (reu) {
            setReunion(reu);
            if (reu.status === "accepted") {
              var today = new Date().toISOString().slice(0, 10);
              var seen = false; try { seen = !!sessionStorage.getItem("seen_reveal_" + reu.id); } catch(e) {}
              if (reu.proposed_date <= today && !seen) {
                foundUI = "reveal";
              }
            }
            if (!foundUI && reu.status === "pending" && reu.proposed_by !== user.id) {
              foundUI = "incoming_reunion";
            }
          }
          // Manual reveal (only if nothing higher-priority found)
          if (!foundUI) {
            var rev = await getActiveProposal(pair.id, 'reveal');
            if (rev) {
              if (rev.status === "accepted") {
                var revSeen = false; try { revSeen = !!sessionStorage.getItem("seen_reveal_" + rev.id); } catch(e) {}
                if (!revSeen) {
                  // Only overwrite reunion state if no reunion proposal was already found
                  if (!reu) setReunion(rev);
                  foundUI = "reveal";
                }
              }
              if (!foundUI && rev.status === "pending" && rev.proposed_by !== user.id) {
                if (!reu) setReunion(rev);
                foundUI = "incoming_reveal";
              }
            }
          }
          // Reset (only if nothing higher-priority found)
          if (!foundUI) {
            var rst = await getActiveProposal(pair.id, 'reset');
            if (rst && rst.status === "pending" && rst.proposed_by !== user.id) {
              if (!reu) setReunion(rst);
              foundUI = "incoming_reset";
            }
          }
          if (foundUI) setReunionUI(foundUI);
        } catch (e) { /* table might not exist yet */ }

        // Check still-here cooldown
        try {
          var lastSH = await getLastStillHere(pair.id, user.id);
          if (!lastSH || (Date.now() - new Date(lastSH.triggered_at).getTime()) > STILL_HERE_COOLDOWN_HOURS * 3600000) {
            setStillHereReady(true);
          }
        } catch (e) { /* keep false — don't bypass cooldown on error */ }

        // Check nudge eligibility (only if we have a pending sent trace)
        var localSentTone = null;
        try {
          var lastSent = await getLastSentTrace(user.id);
          if (lastSent && !lastSent.discovered_at) {
            localSentTone = lastSent.emotional_tone || null;
            setSentAt(new Date(lastSent.created_at).getTime());
            if (lastSent.emotional_tone) setSentTone(lastSent.emotional_tone);
            var sentHoursAgo = (Date.now() - new Date(lastSent.created_at).getTime()) / 3600000;
            if (sentHoursAgo >= NUDGE_DELAY_HOURS) {
              var lastNdg = await getLastNudge(pair.id, user.id);
              if (!lastNdg || new Date(lastNdg.triggered_at).getTime() < new Date(lastSent.created_at).getTime()) {
                setNudgeReady(true);
              } else {
                // A nudge was already sent after this trace — don't show button again
                setNudgeReady(false);
                setNudgeSent(true);
              }
            }
          }
        } catch (e) { /* ignore */ }

        // Check turn-reminder eligibility (partner's turn to send)
        try {
          if (!localCanSend && !localSentTone) {
            var lastPairTr = await getLastPairTrace(pair.id);
            if (lastPairTr && lastPairTr.sender_id === user.id && lastPairTr.discovered_at) {
              setTurnWaiting(true);
              setTurnSince(new Date(lastPairTr.discovered_at).getTime());
              var turnHoursAgo = (Date.now() - new Date(lastPairTr.discovered_at).getTime()) / 3600000;
              if (turnHoursAgo >= TURN_REMINDER_DELAY_HOURS) {
                var lastTurnNdg = await getLastNudge(pair.id, user.id);
                if (!lastTurnNdg || new Date(lastTurnNdg.triggered_at).getTime() < new Date(lastPairTr.discovered_at).getTime()) {
                  setTurnNudgeReady(true);
                } else {
                  // Already sent a turn nudge — don't show again
                  setTurnNudgeReady(false);
                  setTurnNudgeSent(true);
                }
              }
            }
          }
        } catch (e) { /* ignore */ }
      } catch (e) {
        console.error("Init error:", e);
        setAppError("Failed to load. Pull down to retry.");
      }
    })();
  }, [pair, user]);

  // ── Handle incoming resonance event from partner ──
  var handleIncomingEvent = useCallback(function(event) {
    // Skip events we sent ourselves (can appear in unseen query on reload)
    if (event.extra_data && event.extra_data.sender_id === user.id) {
      markEventSeen(event.id, user.id, pair).catch(function() {});
      return;
    }
    // Route still_here and nudge to their own handlers
    if (event.type === 'still_here' && event.extra_data && event.extra_data.sender_id !== user.id) {
      setStillHereIncoming(event);
      markEventSeen(event.id, user.id, pair).catch(function() {});
      return;
    }
    if (event.type === 'nudge' && event.extra_data && event.extra_data.sender_id !== user.id) {
      setNudgeIncoming(event);
      markEventSeen(event.id, user.id, pair).catch(function() {});
      // Push notification handled server-side — no inline Notification() to avoid duplicates
      return;
    }
    setIncomingMoment(event);
    markEventSeen(event.id, user.id, pair).catch(function() {});
  }, [user, pair]);

  // ── Queued trace: received while in "creating" phase ──
  var pendingTraceRef = useRef(null);
  var sentCountR = useRef(0);
  var ghostChapterR = useRef(null); // faint echo of previous chapter after Start Fresh

  // ── Push subscription: register after permission granted ──
  useEffect(function() {
    if (!user) return;
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
    var vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY;
    if (!vapidKey || vapidKey === 'YOUR_VAPID_PUBLIC_KEY_HERE') return;

    function trySubscribe() {
      if (Notification.permission !== 'granted') return;
      navigator.serviceWorker.ready.then(function(reg) {
        reg.pushManager.getSubscription().then(function(existing) {
          if (existing) {
            savePushSubscription(user.id, JSON.stringify(existing)).catch(function() {});
            return;
          }
          var key = urlBase64ToUint8Array(vapidKey);
          reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key })
            .then(function(sub) { savePushSubscription(user.id, JSON.stringify(sub)).catch(function() {}); })
            .catch(function(e) { console.warn('Push subscribe failed:', e); });
        });
      });
    }

    trySubscribe();

    // Re-try if user grants permission after the Space mounts (permission dialog answered late)
    var permStatus = null;
    if (navigator.permissions) {
      navigator.permissions.query({ name: 'notifications' }).then(function(status) {
        permStatus = status;
        status.onchange = trySubscribe;
      }).catch(function() {});
    }

    return function() { if (permStatus) permStatus.onchange = null; };
  }, [user]);

  // ── Realtime: traces ──
  useEffect(function() {
    if (!user) return;
    var sub = subscribeToTraces(user.id, function(newTrace) {
      if (phR.current === "idle") {
        setTrace(newTrace);
        setPhase("discovery");
        setCanSend(false);
        setSentTone(null); setTurnWaiting(false); setTurnNudgeReady(false); setTurnNudgeSent(false);
        soundIncoming();
        hapticMedium();
      } else if (phR.current === "creating") {
        // Queue the trace — will be shown when creating phase ends
        pendingTraceRef.current = newTrace;
      }
      // Push notification handled server-side — no inline Notification() to avoid duplicates
    });
    return function() { sub.unsubscribe(); };
  }, [user]);

  // ── Realtime: resonance events from partner ──
  useEffect(function() {
    if (!pair) return;
    var sub = subscribeToEvents(pair.id, function(event) {
      // Only show if this is from the partner (not our own)
      if (event.extra_data && event.extra_data.sender_id !== user.id) {
        handleIncomingEvent(event);
      }
    });
    return function() { sub.unsubscribe(); };
  }, [pair, user, handleIncomingEvent]);

  // ── Realtime: detect if partner dissolved the connection ──
  useEffect(function() {
    if (!pair) return;
    var sub = subscribeToPair(pair.id, function(updatedPair) {
      if (updatedPair.status === "dissolved") {
        setDissolved(true);
      }
    });
    return function() { sub.unsubscribe(); };
  }, [pair]);

  // ── Realtime: reunion changes ──
  useEffect(function() {
    if (!pair) return;
    var sub = subscribeToProposals(pair.id, function(proposal) {
      if (!proposal) return;
      if (proposal.type === 'reunion') {
        setReunion(proposal);
        if (proposal.status === "pending" && proposal.proposed_by !== user.id) {
          setReunionUI("incoming_reunion");
        }
        if (proposal.status === "accepted") {
          var today = new Date().toISOString().slice(0, 10);
          if (proposal.proposed_date <= today) setReunionUI("reveal");
          else setReunionUI(null);
        }
        if (proposal.status === "declined" || proposal.status === "completed") {
          setReunionUI(null);
        }
      }
      if (proposal.type === 'reset') {
        if (proposal.status === "pending" && proposal.proposed_by !== user.id) {
          setReunion(proposal);
          setReunionUI("incoming_reset");
        }
        if (proposal.status === "accepted") {
          // Partner accepted — the accepter's UI handler already called executeResetArtwork.
          // Save ghost before clearing (proposer side)
          try {
            var ghostKeyP = 'resona_ghost_' + pair.id;
            var snapP = cbR.current.filter(function(c) { return c.path && c.path.length > 2; }).slice(-4);
            if (snapP.length > 0) { localStorage.setItem(ghostKeyP, JSON.stringify(snapP)); ghostChapterR.current = snapP; }
          } catch(e) {}
          setContribs([]);
          setRecTones([]);
          setReunion(null);
          setReunionUI(null);
        }
        if (proposal.status === "declined" || proposal.status === "completed") {
          setReunionUI(null);
          if (proposal.status === "completed") {
            setContribs([]);
            setRecTones([]);
          }
        }
      }
      if (proposal.type === 'reveal') {
        if (proposal.status === "pending" && proposal.proposed_by !== user.id) {
          setReunion(proposal);
          setReunionUI("incoming_reveal");
        }
        if (proposal.status === "accepted") {
          setReunion(proposal);
          setReunionUI("reveal");
        }
        if (proposal.status === "declined" || proposal.status === "completed") {
          setReunionUI(null);
        }
      }
    });
    return function() { sub.unsubscribe(); };
  }, [pair, user]);

  // ── Reconnection on visibility change ──
  useEffect(function() {
    if (!user || !pair) return;
    var onVisible = async function() {
      if (document.visibilityState !== "visible") return;
      try {
        // Re-check for pending traces
        if (phR.current === "idle") {
          var pending = await getPendingTrace(user.id);
          if (pending && phR.current === "idle") {
            setTrace(pending);
            setPhase("discovery");
            setSentTone(null);
          } else if (!pending && phR.current === "idle") {
            var cs = await canSendTrace(user.id);
            setCanSend(cs);
            if (cs) { setSentTone(null); }
          }
        }
        // Re-check for unseen events
        var unseen = await getUnseenEvents(pair.id, user.id, pair);
        if (unseen.length > 0 && !incomingMoment) {
          handleIncomingEvent(unseen[0]);
        }
      } catch (e) { console.warn("Reconnect check failed:", e); }
    };
    document.addEventListener("visibilitychange", onVisible);
    return function() { document.removeEventListener("visibilitychange", onVisible); };
  }, [user, pair, incomingMoment, handleIncomingEvent]);

  // ── Presence: track self + detect partner ──
  useEffect(function() {
    if (!pair || !user) return;
    var ch = supabase.channel('presence-' + pair.id, { config: { presence: { key: user.id } } });
    ch.on('presence', { event: 'sync' }, function() {
      var state = ch.presenceState();
      var keys = Object.keys(state);
      var partnerOnline = keys.some(function(k) { return k !== user.id; });
      setPartnerHere(partnerOnline);
    });
    ch.subscribe(function(status) {
      if (status === 'SUBSCRIBED') ch.track({ user_id: user.id, online_at: new Date().toISOString() });
    });
    return function() { supabase.removeChannel(ch); };
  }, [pair, user]);

  // ── Passive reveal timer (with notice) ──
  useEffect(function() {
    if (phase === "discovery" && trace && trace.passive_reveal) {
      var delay = 60000 + Math.random() * 30000;
      // Show notice 3s before auto-reveal
      var noticeT = setTimeout(function() {
        if (phR.current === "discovery") setPassiveNotice(true);
      }, delay - 3000);
      var revealT = setTimeout(function() {
        if (phR.current === "discovery") {
          setPassiveNotice(false);
          setPhase("revealing");
        }
      }, delay);
      return function() { clearTimeout(noticeT); clearTimeout(revealT); };
    }
  }, [phase, trace]);

  // ── Idle timer ──
  useEffect(function() {
    if (phase === "idle" && canSend) {
      var t = setTimeout(function() { setIdleT(function(v) { return v + 1; }); }, 5000);
      return function() { clearTimeout(t); };
    } else { setIdleT(0); }
  }, [phase, canSend]);

  // ═══ CANVAS RENDER LOOP ═══
  useEffect(function() {
    var canvas = cvRef.current; if (!canvas) return;
    var ctx = canvas.getContext("2d"), dpr = window.devicePixelRatio || 1;
    var n1 = nf1.current, n2 = nf2.current, n3 = nf3.current, pts = particles.current;
    function resize() { var r = canvas.getBoundingClientRect(); canvas.width = r.width * dpr; canvas.height = r.height * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); }
    resize(); window.addEventListener("resize", resize);

    function frame() {
      try {
      var r = canvas.getBoundingClientRect(), w = r.width, h = r.height;
      timeR.current += 0.007; var t = timeR.current;
      var hp = hpR.current, ph = phR.current, tr = trR.current, tc = tcR.current, rt = rtR.current, re = reR.current, cb = cbR.current;

      // ── Presence blend: smooth transition when partner is here ──
      var targetBlend = partnerHereR.current ? 1 : 0;
      presenceBlendR.current += (targetBlend - presenceBlendR.current) * 0.008;
      var pBlend = presenceBlendR.current;
      var epoch = epochShiftR.current;

      ctx.fillStyle = "#0A0A12"; ctx.fillRect(0, 0, w, h);

      // 3-layer noise — smooth organic atmosphere with presence + epoch influence
      var breath = Math.sin(t * 0.4) * 0.25 + 0.55;
      // Partner presence makes breathing deeper + adds second rhythm
      breath = breath * (1 + pBlend * 0.3) + Math.sin(t * 0.27 + 1.5) * 0.12 * pBlend;
      var step = 7, rr = 10, rg = 10, rb = 18;
      // Epoch shift: space gets warmer over time
      rr += epoch.hueShift * 45;
      rg += epoch.hueShift * 12;
      rb -= epoch.hueShift * 15;
      // Partner presence warms the space
      rr += pBlend * 12;
      rg += pBlend * 6;
      if (rt.length > 0) {
        // Weighted blend: more recent traces carry more weight
        var t2 = 0, g2 = 0, b2 = 0, wTotal = 0;
        rt.forEach(function(tn, i) {
          if (!TONES[tn]) return;
          var w = 1 / (i + 1);
          t2 += TONES[tn].rgb[0] * w; g2 += TONES[tn].rgb[1] * w; b2 += TONES[tn].rgb[2] * w;
          wTotal += w;
        });
        if (wTotal > 0) { t2 /= wTotal; g2 /= wTotal; b2 /= wTotal; }
        // Blend strength grows with relationship depth (more traces = stronger character)
        var depthBlend = clamp(0.08 + (cb.length / 300), 0.08, 0.22);
        rr = lerp(rr, t2, depthBlend); rg = lerp(rg, g2, depthBlend); rb = lerp(rb, b2, depthBlend);
      }
      var dT = 0, bB = 0;
      if (ph === "discovery" && tr && TONES[tr.emotional_tone]) {
        dT = 0.02;
        var epR = effectiveRevealPosR.current || tr.reveal_position;
        if (tc) { var dR = dst(tc.x, tc.y, epR.x, epR.y) / Math.sqrt(2); if (dR < 0.6) { var pf = 1 - dR / 0.6; dT += pf * 0.18; bB = pf * 0.05; } }
      }
      for (var x = 0; x < w; x += step) { for (var y = 0; y < h; y += step) {
        var nv = ((n1(x*0.002+t*0.08,y*0.002+t*0.06)*0.45 + n2(x*0.004+t*0.04+30,y*0.004-t*0.05+30)*0.35 + n3(x*0.008+t*0.12+60,y*0.008+t*0.09+60)*0.2)+1)/2*breath;
        var cr2 = rr, cg2 = rg, cb2 = rb;
        if (dT > 0 && tr) { var dr2 = TONES[tr.emotional_tone].rgb; cr2 = lerp(cr2,dr2[0],dT); cg2 = lerp(cg2,dr2[1],dT); cb2 = lerp(cb2,dr2[2],dT); }
        var lum = nv * (0.05 + bB);
        ctx.fillStyle = "rgb(" + Math.round(cr2+lum*32) + "," + Math.round(cg2+lum*26) + "," + Math.round(cb2+lum*40) + ")";
        ctx.fillRect(x, y, step, step);
      }}

      // ── Partner presence: subtle particle drift toward center when both online ──
      if (pBlend > 0.3) {
        var pcx = w * 0.5, pcy = h * 0.45;
        pts.forEach(function(p2) {
          var dirX = (pcx - p2.x * w) * 0.00003 * pBlend;
          var dirY = (pcy - p2.y * h) * 0.00003 * pBlend;
          p2.vx += dirX; p2.vy += dirY;
        });
      }

      // ── Residue echoes (array of recent traces as drifting ghosts) ──
      if (re.length > 0 && ph === "idle") {
        re.forEach(function(echo, ei) {
          if (!echo || !echo.path || echo.path.length < 2) return;
          var cfg = RESIDUE_CONFIG[ei];
          if (!cfg) return;
          var age = Date.now() - echo.at;
          if (age > cfg.maxAge) return;
          var eA = cfg.baseAlpha * (1 - age / cfg.maxAge);
          // Amplified echoes last longer and are brighter
          if (echo.amplified) { eA *= 2; }
          if (eA < 0.003) return;
          var eT = TONES[echo.tone]; if (!eT) return;
          // Drift: each ghost slowly moves
          var drift = (ei + 1) * 0.00008;
          var driftX = Math.sin(t * 0.3 + ei * 2.1) * drift;
          var driftY = Math.cos(t * 0.25 + ei * 1.7) * drift;
          ctx.globalAlpha = eA; ctx.globalCompositeOperation = "screen";
          ctx.beginPath(); ctx.strokeStyle = eT.primary; ctx.lineWidth = 1.5 - ei * 0.3; ctx.lineCap = "round";
          echo.path.forEach(function(p2, i) {
            var px = (p2.x * 0.3 + 0.35 + driftX) * w, py = (p2.y * 0.3 + 0.3 + driftY) * h;
            i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
          });
          ctx.stroke(); ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";
        });
      }

      // NOTE: Artwork underlay REMOVED — artwork only visible during Glimpse

      // ── Artwork bleed-through (Hebel 2) ──
      if (ph === "idle" && cb.length >= 5) {
        var bPhase = getBleedPhase(cb.length);
        if (bPhase) {
          var now = Date.now();
          // Rebuild cache every 5s or when stale
          if (!bleedCacheR.current || now - bleedCacheTimeR.current > 5000) {
            try {
              var oc = document.createElement("canvas"); oc.width = w * dpr; oc.height = h * dpr;
              var octx = oc.getContext("2d"); octx.setTransform(dpr, 0, 0, dpr, 0, 0);
              var subset = [];
              for (var bi = 0; bi < cb.length; bi++) {
                if (bi % Math.max(1, Math.floor(cb.length / bPhase.count)) === 0 && subset.length < bPhase.count) {
                  subset.push(cb[bi]);
                }
              }
              subset.forEach(function(ct) {
                if (!ct.path || ct.path.length < 2) return;
                drawGesturePath(octx, ct.path, ct.tone, w, h, 0.5, 6);
              });
              bleedCacheR.current = oc;
              bleedCacheTimeR.current = now;
            } catch(e) { /* OffscreenCanvas fallback if error */ }
          }
          if (bleedCacheR.current) {
            var bAlpha = bPhase.alpha;
            // Blinking phase: fade in/out
            if (bPhase.cycleMs > 0) {
              var bCycle = (now % bPhase.cycleMs) / bPhase.cycleMs;
              var bFade = bCycle < 0.1 ? bCycle / 0.1 : bCycle < 0.3 ? 1 : bCycle < 0.4 ? 1 - (bCycle - 0.3) / 0.1 : 0;
              bAlpha *= bFade;
            } else {
              // Continuous: subtle pulse
              bAlpha += Math.sin(t * 0.15) * 0.005;
            }
            if (bAlpha > 0.003) {
              var bDriftX = Math.sin(t * 0.02) * 3;
              var bDriftY = Math.cos(t * 0.017) * 2;
              ctx.globalAlpha = bAlpha; ctx.globalCompositeOperation = "screen";
              ctx.drawImage(bleedCacheR.current, bDriftX, bDriftY);
              ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";
            }
          }
        }
      }

      // ── Ghost chapter echo (previous artwork after Start Fresh) ──
      if (ph === "idle" && ghostChapterR.current && cb.length < 15) {
        var ghostFade = Math.max(0, 1 - cb.length / 15) * 0.018;
        ghostChapterR.current.forEach(function(gc, gi) {
          if (!gc.path || gc.path.length < 2 || !TONES[gc.tone]) return;
          var gt2 = TONES[gc.tone];
          var gdX = Math.sin(t * 0.04 + gi * 1.8) * 0.012 * w;
          var gdY = Math.cos(t * 0.033 + gi * 2.4) * 0.010 * h;
          ctx.globalAlpha = ghostFade / (gi + 1);
          ctx.globalCompositeOperation = "screen";
          ctx.beginPath(); ctx.strokeStyle = gt2.primary; ctx.lineWidth = 1; ctx.lineCap = "round";
          gc.path.forEach(function(pt, i) {
            var px = pt.x * w + gdX, py = pt.y * h + gdY;
            i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
          });
          ctx.stroke();
          ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";
        });
      }

      // ── Idle touch ripples (Hebel 5) ──
      if (ph === "idle") {
        var nowRipple = Date.now();
        var ripples = idleTouchesR.current;
        if (ripples.length > 0) {
          // Remove expired
          idleTouchesR.current = ripples = ripples.filter(function(rp) { return nowRipple - rp.t < RIPPLE_MAX_AGE_MS; });
          var rippleRgb = rt.length > 0 && TONES[rt[0]] ? TONES[rt[0]].rgb : [200, 200, 220];
          ctx.globalCompositeOperation = "screen";
          ripples.forEach(function(rp) {
            var age = (nowRipple - rp.t) / RIPPLE_MAX_AGE_MS;
            var rAlpha = (1 - age) * 0.35;
            var rRadius = 20 + age * 65;
            ctx.globalAlpha = rAlpha;
            var rGrd = ctx.createRadialGradient(rp.x * w, rp.y * h, 0, rp.x * w, rp.y * h, rRadius);
            rGrd.addColorStop(0, "rgba(" + rippleRgb[0] + "," + rippleRgb[1] + "," + rippleRgb[2] + ",0.9)");
            rGrd.addColorStop(0.4, "rgba(" + rippleRgb[0] + "," + rippleRgb[1] + "," + rippleRgb[2] + ",0.3)");
            rGrd.addColorStop(1, "transparent");
            ctx.fillStyle = rGrd; ctx.beginPath(); ctx.arc(rp.x * w, rp.y * h, rRadius, 0, Math.PI * 2); ctx.fill();
          });
          // Attract nearby particles
          ripples.forEach(function(rp) {
            if (nowRipple - rp.t > 1500) return;
            pts.forEach(function(p2) {
              var pd = dst(p2.x, p2.y, rp.x, rp.y);
              if (pd < 0.2) { var inf = (1 - pd / 0.2) * 0.002; p2.vx += (rp.x - p2.x) * inf; p2.vy += (rp.y - p2.y) * inf; }
            });
          });
          ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";
        }
      }

      // Discovery rendering
      if (ph === "discovery" && tr) {
        var tone = tr.emotional_tone;
        var dm = tr.discovery_mode || 'stillness';
        // ── Gesture Feel (Hebel 1) ──
        var dMod = getDiscoveryMod(tr.gesture_data);
        // ts: time scaled by noiseSpeed — calm traces → slow signals, intense → fast
        var ts = t * dMod.noiseSpeed;
        // Position drift — Follow: Lissajous requiring active tracking; others: legacy playfulness drift
        var baseX = tr.reveal_position.x, baseY = tr.reveal_position.y;
        var driftSpd = tr.reveal_position.drift_speed || 0;
        if (dm === 'follow') {
          baseX += Math.sin(t * 0.48) * 0.11 + Math.sin(t * 0.73) * 0.035;
          baseY += Math.cos(t * 0.31) * 0.09 + Math.cos(t * 0.87) * 0.025;
          baseX = clamp(baseX, 0.10, 0.90);
          baseY = clamp(baseY, 0.10, 0.85);
        } else if (driftSpd > 0) {
          baseX += Math.sin(t * driftSpd) * 0.04;
          baseY += Math.cos(t * driftSpd * 0.7) * 0.03;
          baseX = clamp(baseX, 0.08, 0.92);
          baseY = clamp(baseY, 0.08, 0.85);
        }
        var tx = baseX * w, ty = baseY * h;
        // Store effective position for touch handlers
        effectiveRevealPosR.current = { x: baseX, y: baseY };
        var td = TONES[tone];
        var cr3 = td ? td.rgb[0] : 180, cg3 = td ? td.rgb[1] : 180, cb3 = td ? td.rgb[2] : 220;
        var sig = tr.signal_type, sp = (0.5 + Math.sin(ts*2) * 0.3) * dMod.signalAlpha;

        // Signal rendering
        if (sig === "shimmer") { for (var si = 0; si < 20; si++) { var sx = n1(si*7.3+ts*0.3,ts*0.2+si)*0.5+0.5, sy = n1(si*5.1+ts*0.25,ts*0.15+si+50)*0.5+0.5; ctx.fillStyle = "rgba("+cr3+","+cg3+","+cb3+","+(sp*(0.04+Math.sin(ts*3+si*1.3)*0.03))+")"; ctx.beginPath(); ctx.arc(sx*w,sy*h,2.5,0,Math.PI*2); ctx.fill(); } }
        else if (sig === "pulse") { for (var ri = 0; ri < 3; ri++) { var pr2 = 20+Math.abs(Math.sin(ts*0.9+ri*1.3))*Math.min(w,h)*0.25; ctx.strokeStyle = "rgba("+cr3+","+cg3+","+cb3+","+(0.04*(1-pr2/(Math.min(w,h)*0.25)))+")"; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(w/2,h/2,pr2,0,Math.PI*2); ctx.stroke(); } }
        else if (sig === "drift") { var dx2 = Math.sin(ts*0.2)*w*0.3+w/2, dy2 = Math.cos(ts*0.28)*h*0.3+h/2; var g3 = ctx.createRadialGradient(dx2,dy2,0,dx2,dy2,60); g3.addColorStop(0,"rgba("+cr3+","+cg3+","+cb3+","+(sp*0.05)+")"); g3.addColorStop(1,"transparent"); ctx.fillStyle = g3; ctx.beginPath(); ctx.arc(dx2,dy2,60,0,Math.PI*2); ctx.fill(); }
        else if (sig === "flicker") { for (var fi = 0; fi < 6; fi++) { if (Math.random() > 0.4) { ctx.fillStyle = "rgba("+cr3+","+cg3+","+cb3+","+(0.03+Math.random()*0.05)+")"; ctx.beginPath(); ctx.arc(Math.random()*w,Math.random()*h,1.5+Math.random()*2,0,Math.PI*2); ctx.fill(); } } }
        else if (sig === "density") { var nx = n1(ts*0.15,0)*0.3+0.35, ny = n1(0,ts*0.12)*0.3+0.35; for (var ddx = -55; ddx < 55; ddx += 8) { for (var ddy = -55; ddy < 55; ddy += 8) { var dd = dst(0,0,ddx,ddy); if (dd < 55) { var nv2 = n1((nx*w+ddx)*0.012+ts,(ny*h+ddy)*0.012); ctx.fillStyle = "rgba("+cr3+","+cg3+","+cb3+","+(0.05*(1-dd/55)*(nv2+1)/2)+")"; ctx.fillRect(nx*w+ddx,ny*h+ddy,6,6); } } } }
        else { for (var wi = 0; wi < w; wi += 5) { var wy = h/2+Math.sin(wi*0.01+ts*1.1)*25; ctx.fillStyle = "rgba("+cr3+","+cg3+","+cb3+",0.025)"; ctx.fillRect(wi,wy,4,2); } }

        // Wake mode: breathing pulse at reveal position — always visible, informs timing
        if (dm === 'wake') {
          var bAmp = (Math.sin((Date.now() / WAKE_BREATH_CYCLE_MS) * Math.PI * 2 - Math.PI / 2) + 1) / 2;
          breathAmpR.current = bAmp;
          var bGlowR = (28 + bAmp * 75) * dMod.glowRadius;
          var bGrad = ctx.createRadialGradient(tx, ty, 0, tx, ty, bGlowR);
          bGrad.addColorStop(0, "rgba("+cr3+","+cg3+","+cb3+","+(0.05+bAmp*0.22)+")");
          bGrad.addColorStop(0.45, "rgba("+cr3+","+cg3+","+cb3+","+(0.02+bAmp*0.08)+")");
          bGrad.addColorStop(1, "transparent");
          ctx.fillStyle = bGrad; ctx.beginPath(); ctx.arc(tx, ty, bGlowR, 0, Math.PI*2); ctx.fill();
          if (bAmp > 0.82) {
            var peakFrac = (bAmp - 0.82) / 0.18;
            var peakGrad = ctx.createRadialGradient(tx, ty, 0, tx, ty, 18);
            peakGrad.addColorStop(0, "rgba("+cr3+","+cg3+","+cb3+","+(peakFrac*0.45)+")");
            peakGrad.addColorStop(1, "transparent");
            ctx.fillStyle = peakGrad; ctx.beginPath(); ctx.arc(tx, ty, 18, 0, Math.PI*2); ctx.fill();
          }
        }

        // Proximity zones
        if (tc) {
          var dN2 = dst(tc.x, tc.y, baseX, baseY) / Math.sqrt(2);
          if (dN2 < 0.14) {
            var z4 = 1-dN2/0.14;
            var z4r = (25+z4*70)*dMod.glowRadius; var bl = ctx.createRadialGradient(tx,ty,0,tx,ty,z4r); bl.addColorStop(0,"rgba("+cr3+","+cg3+","+cb3+","+(z4*0.45)+")"); bl.addColorStop(0.4,"rgba("+cr3+","+cg3+","+cb3+","+(z4*0.15)+")"); bl.addColorStop(1,"transparent"); ctx.fillStyle = bl; ctx.beginPath(); ctx.arc(tx,ty,z4r,0,Math.PI*2); ctx.fill();
            ctx.strokeStyle = "rgba("+cr3+","+cg3+","+cb3+","+(z4*0.15)+")"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(tc.x*w,tc.y*h); ctx.lineTo(tx,ty); ctx.stroke();
            var gl4r = 60*dMod.glowRadius; var gl4 = ctx.createRadialGradient(tc.x*w,tc.y*h,0,tc.x*w,tc.y*h,gl4r); gl4.addColorStop(0,"rgba("+cr3+","+cg3+","+cb3+",0.4)"); gl4.addColorStop(1,"transparent"); ctx.fillStyle = gl4; ctx.beginPath(); ctx.arc(tc.x*w,tc.y*h,gl4r,0,Math.PI*2); ctx.fill();
            pts.forEach(function(p2) { var px = p2.x*w, py = p2.y*h, pd = dst(px,py,tc.x*w,tc.y*h), inf = Math.max(0,1-pd/120); p2.vx += (tc.x*w-px)*inf*0.0015*dMod.particleSpeed; p2.vy += (tc.y*h-py)*inf*0.0015*dMod.particleSpeed; p2.vx *= dMod.particleDamping; p2.vy *= dMod.particleDamping; p2.x += p2.vx/w; p2.y += p2.vy/h; p2.x = ((p2.x%1)+1)%1; p2.y = ((p2.y%1)+1)%1; ctx.fillStyle = "rgba("+cr3+","+cg3+","+cb3+","+(p2.ba*5)+")"; ctx.beginPath(); ctx.arc(p2.x*w,p2.y*h,p2.size*2,0,Math.PI*2); ctx.fill(); });
          } else if (dN2 < 0.35) {
            var z3 = 1-(dN2-0.14)/0.21;
            var z3r = (40+z3*140)*dMod.glowRadius; var gl = ctx.createRadialGradient(tc.x*w,tc.y*h,0,tc.x*w,tc.y*h,z3r); gl.addColorStop(0,"rgba("+cr3+","+cg3+","+cb3+","+(z3*0.35)+")"); gl.addColorStop(0.3,"rgba("+cr3+","+cg3+","+cb3+","+(z3*0.12)+")"); gl.addColorStop(1,"transparent"); ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(tc.x*w,tc.y*h,z3r,0,Math.PI*2); ctx.fill();
            for (var oi = 0; oi < 8; oi++) { var oA = (oi/8)*Math.PI*2+ts*2, oR = 25+z3*15+Math.sin(ts*3+oi)*5; ctx.fillStyle = "rgba("+cr3+","+cg3+","+cb3+","+(z3*0.3)+")"; ctx.beginPath(); ctx.arc(tc.x*w+Math.cos(oA)*oR,tc.y*h+Math.sin(oA)*oR,2+z3,0,Math.PI*2); ctx.fill(); }
            pts.forEach(function(p2) { var px = p2.x*w, py = p2.y*h, pd = dst(px,py,tc.x*w,tc.y*h), inf = Math.max(0,1-pd/(80+z3*50)); p2.vx += (tc.x*w-px)*inf*0.001*z3*dMod.particleSpeed; p2.vy += (tc.y*h-py)*inf*0.001*z3*dMod.particleSpeed; p2.vx *= 0.92*(dMod.particleDamping/0.9); p2.vy *= 0.92*(dMod.particleDamping/0.9); p2.x += p2.vx/w; p2.y += p2.vy/h; p2.x = ((p2.x%1)+1)%1; p2.y = ((p2.y%1)+1)%1; ctx.fillStyle = "rgba("+cr3+","+cg3+","+cb3+","+(p2.ba*(1+z3*4))+")"; ctx.beginPath(); ctx.arc(p2.x*w,p2.y*h,p2.size*(1+z3),0,Math.PI*2); ctx.fill(); });
          } else if (dN2 < 0.60) {
            var z2 = 1-(dN2-0.35)/0.25;
            var z2r = (70+z2*50)*dMod.glowRadius; var hz = ctx.createRadialGradient(tc.x*w,tc.y*h,0,tc.x*w,tc.y*h,z2r); hz.addColorStop(0,"rgba("+cr3+","+cg3+","+cb3+","+(z2*0.22)+")"); hz.addColorStop(1,"transparent"); ctx.fillStyle = hz; ctx.beginPath(); ctx.arc(tc.x*w,tc.y*h,z2r,0,Math.PI*2); ctx.fill();
            pts.forEach(function(p2) { var px = p2.x*w, py = p2.y*h, pd = dst(px,py,tc.x*w,tc.y*h), inf = Math.max(0,1-pd/(150+z2*80)); p2.vx += (tc.x*w-px)*inf*0.0003*z2*dMod.particleSpeed; p2.vy += (tc.y*h-py)*inf*0.0003*z2*dMod.particleSpeed; p2.vx *= 0.93*(dMod.particleDamping/0.9); p2.vy *= 0.93*(dMod.particleDamping/0.9); p2.x += p2.vx/w; p2.y += p2.vy/h; p2.x = ((p2.x%1)+1)%1; p2.y = ((p2.y%1)+1)%1; ctx.fillStyle = "rgba("+cr3+","+cg3+","+cb3+","+(p2.ba*(1+z2*3))+")"; ctx.beginPath(); ctx.arc(p2.x*w,p2.y*h,p2.size*(1+z2*0.5),0,Math.PI*2); ctx.fill(); });
          } else {
            pts.forEach(function(p2) { p2.vx *= 0.88; p2.vy *= 0.88; p2.x += (Math.random()-0.5)*0.001; p2.y += (Math.random()-0.5)*0.001; });
          }
          if (hp > 0) {
            if (dm === 'follow') {
              // Progress arc at reveal position — visually tracks the moving target
              ctx.strokeStyle = "rgba("+cr3+","+cg3+","+cb3+","+(0.3+hp*0.5)+")"; ctx.lineWidth = 2.5;
              ctx.beginPath(); ctx.arc(tx,ty,30,-Math.PI/2,-Math.PI/2+hp*Math.PI*2); ctx.stroke();
              // Dashed connection line: finger → reveal position
              ctx.save(); ctx.setLineDash([3, 7]);
              ctx.strokeStyle = "rgba("+cr3+","+cg3+","+cb3+","+(hp*0.25)+")"; ctx.lineWidth = 1;
              ctx.beginPath(); ctx.moveTo(tc.x*w,tc.y*h); ctx.lineTo(tx,ty); ctx.stroke();
              ctx.restore();
            } else {
              ctx.strokeStyle = "rgba("+cr3+","+cg3+","+cb3+","+(0.4+hp*0.6)+")"; ctx.lineWidth = 3;
              ctx.beginPath(); ctx.arc(tc.x*w,tc.y*h,34,-Math.PI/2,-Math.PI/2+hp*Math.PI*2); ctx.stroke();
              var ig = ctx.createRadialGradient(tc.x*w,tc.y*h,0,tc.x*w,tc.y*h,28); ig.addColorStop(0,"rgba("+cr3+","+cg3+","+cb3+","+(hp*0.5)+")"); ig.addColorStop(1,"transparent"); ctx.fillStyle = ig; ctx.beginPath(); ctx.arc(tc.x*w,tc.y*h,28,0,Math.PI*2); ctx.fill();
            }
          }
        } else {
          pts.forEach(function(p2) { p2.vx *= 0.88; p2.vy *= 0.88; p2.x += (Math.random()-0.5)*0.001; p2.y += (Math.random()-0.5)*0.001; });
        }
      }

      // Idle residue tones
      if (ph === "idle" && rt.length > 0) {
        rt.forEach(function(tn, i) { var td2 = TONES[tn]; if (!td2) return;
          var ea = (0.04-(i/rt.length)*0.025) + Math.sin(t*0.3+i)*0.01; if (ea <= 0) return;
          var ang = i*1.2+t*0.04, ex = w*0.5+Math.cos(ang)*(25+i*18)*0.2, ey = h*0.43+Math.sin(ang)*(25+i*18)*0.15, er = 60+i*10+Math.sin(t*0.25+i)*10;
          var grd = ctx.createRadialGradient(ex,ey,0,ex,ey,er); grd.addColorStop(0,"rgba("+td2.rgb[0]+","+td2.rgb[1]+","+td2.rgb[2]+","+ea+")"); grd.addColorStop(0.5,"rgba("+td2.rgb[0]+","+td2.rgb[1]+","+td2.rgb[2]+","+(ea*0.3)+")"); grd.addColorStop(1,"transparent"); ctx.fillStyle = grd; ctx.beginPath(); ctx.arc(ex,ey,er,0,Math.PI*2); ctx.fill();
        });
      }
      } catch(e) { console.error("Frame error:", e); }
      afR.current = requestAnimationFrame(frame);
    }
    afR.current = requestAnimationFrame(frame);
    return function() { cancelAnimationFrame(afR.current); window.removeEventListener("resize", resize); };
  }, []);

  // ── Touch handlers ──
  var REVEAL_MS = 1500;
  var WAKE_REVEAL_MS = 800;
  var WAKE_DRAIN_RATE = 0.25;

  var startReveal = useCallback(function() {
    if (holdRef.current) return; hpR.current = 0; setHoldProg(0);
    var dm = (trR.current && trR.current.discovery_mode) || 'stillness';
    soundFound(); hapticMedium();
    if (dm === 'wake') {
      holdRef.current = setInterval(function() {
        var bAmp = (Math.sin((Date.now() / WAKE_BREATH_CYCLE_MS) * Math.PI * 2 - Math.PI / 2) + 1) / 2;
        var prev = hpR.current;
        var next = bAmp > WAKE_THRESHOLD
          ? Math.min(1, prev + 16 / WAKE_REVEAL_MS)
          : Math.max(0, prev - 16 / WAKE_REVEAL_MS * WAKE_DRAIN_RATE);
        if (bAmp > WAKE_THRESHOLD && prev < 0.15) hapticWakePeak();
        hpR.current = next; setHoldProg(next);
        if (next >= 1) { clearInterval(holdRef.current); holdRef.current = null; hapticReveal(); setPhase("revealing"); }
      }, 16);
    } else {
      var s = Date.now();
      holdRef.current = setInterval(function() {
        var p2 = Math.min(1, (Date.now()-s)/REVEAL_MS); hpR.current = p2; setHoldProg(p2);
        if (p2 >= 1) { clearInterval(holdRef.current); holdRef.current = null; hapticReveal(); setPhase("revealing"); }
      }, 16);
    }
  }, []);

  var startFollow = useCallback(function() {
    if (holdRef.current) return; hpR.current = 0; setHoldProg(0);
    holdRef.current = setInterval(function() {
      var inProx = followInProxR.current;
      var prev = hpR.current;
      var next = inProx
        ? Math.min(1, prev + 16 / FOLLOW_DURATION_MS)
        : Math.max(0, prev - 16 / (FOLLOW_DURATION_MS * 3));
      if (inProx && ((prev < 0.5 && next >= 0.5) || (prev < 0.75 && next >= 0.75) || (prev < 0.9 && next >= 0.9))) hapticFollowPulse();
      hpR.current = next; setHoldProg(next);
      if (next >= 1) { clearInterval(holdRef.current); holdRef.current = null; hapticFollowComplete(); setPhase("revealing"); }
      if (next <= 0 && !inProx) { clearInterval(holdRef.current); holdRef.current = null; }
    }, 16);
  }, []);

  var stopHold = useCallback(function() { if (holdRef.current) { clearInterval(holdRef.current); holdRef.current = null; } hpR.current = 0; setHoldProg(0); }, []);

  var lastProxZone = useRef(-1);
  var onDown = useCallback(function(ev) {
    var r = ev.currentTarget.getBoundingClientRect(), x = (ev.clientX-r.left)/r.width, y = (ev.clientY-r.top)/r.height;
    if (phase === "idle" && y < 0.7) { idleTouchesR.current.push({ x:x, y:y, t:Date.now() }); if (idleTouchesR.current.length > RIPPLE_MAX_POINTS) idleTouchesR.current.shift(); }
    if (phase !== "discovery" || !trace) return;
    setTouch({ x, y }); tcR.current = { x, y }; hapticTap();
    var ep = effectiveRevealPosR.current || trace.reveal_position;
    var dm = trace.discovery_mode || 'stillness';
    if (dm === 'follow') {
      var inP = dst(x, y, ep.x, ep.y) / Math.sqrt(2) < (trace.search_radius || 0.12);
      followInProxR.current = inP;
      if (inP && !holdRef.current) startFollow();
    } else {
      if (dst(x, y, ep.x, ep.y) / Math.sqrt(2) < (trace.search_radius || 0.08)) startReveal();
    }
  }, [phase, trace, startReveal, startFollow]);

  var onMove = useCallback(function(ev) {
    var r = ev.currentTarget.getBoundingClientRect(), x = (ev.clientX-r.left)/r.width, y = (ev.clientY-r.top)/r.height;
    if (phase === "idle" && y < 0.7 && ev.buttons > 0) { var lr = idleTouchesR.current[idleTouchesR.current.length-1]; if (!lr || dst(x,y,lr.x,lr.y) > 0.05) { idleTouchesR.current.push({ x:x, y:y, t:Date.now() }); if (idleTouchesR.current.length > RIPPLE_MAX_POINTS) idleTouchesR.current.shift(); } }
    if (phase !== "discovery" || !trace) return;
    setTouch({ x, y }); tcR.current = { x, y };
    var ep = effectiveRevealPosR.current || trace.reveal_position;
    var d = dst(x, y, ep.x, ep.y) / Math.sqrt(2);
    var dm = trace.discovery_mode || 'stillness';
    if (dm === 'follow') {
      var inP = d < (trace.search_radius || 0.12);
      followInProxR.current = inP;
      if (inP && !holdRef.current) startFollow();
      var fz = d < 0.10 ? 4 : d < 0.18 ? 3 : d < 0.35 ? 2 : 0;
      if (fz > 0 && fz !== lastProxZone.current) hapticProximity(fz / 4);
      lastProxZone.current = fz;
    } else {
      var zone = d < 0.10 ? 4 : d < 0.18 ? 3 : d < 0.35 ? 2 : d < 0.55 ? 1 : 0;
      if (zone > 0 && zone !== lastProxZone.current) { hapticProximity(zone / 4); }
      lastProxZone.current = zone;
      if (d < (trace.search_radius || 0.08)) { if (!holdRef.current) startReveal(); } else stopHold();
    }
  }, [phase, trace, startReveal, startFollow, stopHold]);

  var onUp = useCallback(function() {
    setTouch(null); tcR.current = null;
    var dm = (trR.current && trR.current.discovery_mode) || 'stillness';
    if (dm === 'follow') { followInProxR.current = false; } else { stopHold(); }
  }, [stopHold]);

  // ── Capture trace at reveal start ──
  useEffect(function() { if (phase === "revealing" && trace) revealTraceR.current = trace; }, [phase, trace]);

  // ── Reveal done → detect moment (singular!) → or go to glimpse ──
  var onRevealDone = useCallback(async function() {
    soundReveal();
    var tr = revealTraceR.current;
    if (!tr) { setPhase("idle"); var cs = await canSendTrace(user.id); setCanSend(cs); setTurnWaiting(false); setTurnSince(null); setTurnNudgeReady(false); setTurnNudgeSent(false); setTurnNudgeConfirm(false); return; }

    try {
      await discoverTrace(tr.id);
    } catch (e) {
      console.error("Discover error:", e);
      setAppError("Failed to save. Check your connection.");
      setPhase("discovery");
      return;
    }

    var path = tr.gesture_data.path;
    // Add to echoes array (max MAX_ECHOES)
    setResEchoes(function(prev) { return [{ tone: tr.emotional_tone, path: path, at: Date.now(), amplified: false }].concat(prev).slice(0, MAX_ECHOES); });
    var newContribs = cbR.current.concat([{ tone: tr.emotional_tone, path: path }]);
    setContribs(newContribs);
    setRecTones(function(prev) { return [tr.emotional_tone].concat(prev).slice(0, 20); });
    setLastTone(tr.emotional_tone);
    setTrace(null);
    revealTraceR.current = null;
    setTurnWaiting(false); setTurnSince(null); setTurnNudgeReady(false); setTurnNudgeSent(false); setTurnNudgeConfirm(false);
    if (onbStepR.current < 2) setOnbStep(2);

    // Milestone detection
    if (newContribs) {
      var count = newContribs.length;
      for (var mi = 0; mi < MILESTONES.length; mi++) {
        if (count === MILESTONES[mi].traces) {
          var key = "milestone_" + MILESTONES[mi].traces;
          try { if (!localStorage.getItem(key)) { localStorage.setItem(key, "1"); setMilestone(MILESTONES[mi].text); } } catch(e) {}
          break;
        }
      }
    }

    // Detect at most ONE moment (with cooldown + priority)
    try {
      var moment = await detectMoment(pair.id, user.id, tr, tr.emotional_tone, partnerId);
      if (moment) {
        // Amplified reveal is now automatic — no picker, just enhanced echo
        if (moment.automatic) {
          // Mark the newest echo as amplified (longer life, brighter)
          setResEchoes(function(prev) {
            if (prev.length > 0) {
              var updated = prev.slice();
              updated[0] = Object.assign({}, updated[0], { amplified: true });
              return updated;
            }
            return prev;
          });
          // Auto-persist and show intro then go to glimpse
          setCurrentMoment(moment);
          setMTone(moment.tone);
          setMPhase("amplified_reveal_intro");
        } else {
          setCurrentMoment(moment);
          setMTone(moment.tone);
          setMPhase(moment.type + "_intro");
        }
      } else {
        setPhase("glimpse");
      }
    } catch (e) {
      console.warn("Moment detection failed:", e);
      setPhase("glimpse");
    }
    hpR.current = 0;
  }, [user, pair]);

  // ── Glimpse safety: if contribs empty when phase=glimpse, skip straight through ──
  useEffect(function() {
    if (phase === "glimpse" && contribs.length === 0) {
      onGlimpseDone();
    }
  }, [phase, contribs.length, onGlimpseDone]);

  // ── Persist moment to DB without transitioning phase (for whisper/echo display) ──
  var finishMomentSilent = useCallback(async function(extraData) {
    if (currentMoment && pair) {
      var extra = Object.assign({}, extraData || {}, { sender_id: user.id });
      await persistMoment(pair.id, currentMoment, extra).catch(function(e) { console.error("Persist moment error:", e); });
      try { localStorage.setItem("last_moment_at", String(Date.now())); } catch(e) {}
    }
    setCurrentMoment(null);
    setMTone(null);
  }, [currentMoment, pair, user]);

  // ── Finish moment → persist to DB → go to glimpse ──
  var finishMoment = useCallback(async function(extraData) {
    if (currentMoment && pair) {
      // Persist with sender_id so partner's listener knows who sent it
      var extra = Object.assign({}, extraData || {}, { sender_id: user.id });
      await persistMoment(pair.id, currentMoment, extra).catch(function(e) { console.error("Persist moment error:", e); });
      try { localStorage.setItem("last_moment_at", String(Date.now())); } catch(e) {}
    }
    setCurrentMoment(null);
    setMPhase(null);
    setMTone(null);
    setPhase("glimpse");
  }, [currentMoment, pair, user]);

  // ── Moment transitions ──
  var onIntroTwinDone = useCallback(function() { soundMoment(); hapticMoment(); setMPhase("whisper"); }, []);
  // Amplified reveal: auto-persist after intro, then go to glimpse
  var onIntroAmpDone = useCallback(function() { soundMoment(); hapticMoment(); finishMoment({ amplified: true }); }, [finishMoment]);
  var onIntroConvDone = useCallback(function() { soundMoment(); hapticMoment(); setMPhase("echo"); }, []);
  var onIntroResDone = useCallback(function() { soundMoment(); hapticMoment(); finishMoment({ tone_resonance: true }); }, [finishMoment]);

  var onWhisperSelect = useCallback(function(w) {
    hapticLight();
    setWhisper(w);
    setMPhase("whisperShow");
    finishMomentSilent({ whisper_word: w });
  }, [finishMomentSilent]);
  var onWhisperTimeout = useCallback(function() { finishMoment(null); }, [finishMoment]);
  var onWhisperDone = useCallback(function() { setWhisper(null); setMPhase(null); setPhase("glimpse"); }, []);

  var onEchoSelect = useCallback(function(m) {
    hapticLight();
    setEchoM(m);
    setMPhase("echoShow");
    finishMomentSilent({ echo_mark: m.g, echo_name: m.n });
  }, [finishMomentSilent]);
  var onEchoTimeout = useCallback(function() { finishMoment(null); }, [finishMoment]);
  var onEchoDone = useCallback(function() { setEchoM(null); setMPhase(null); setPhase("glimpse"); }, []);

  var onPulseCapture = useCallback(function(p2) {
    if (p2) { setPendPulse(p2); hapticSend(); }
    finishMoment(p2 ? { pulse_path: p2 } : null);
  }, [finishMoment]);

  var onGlimpseDone = useCallback(async function() {
    // After discover→reveal→glimpse we know it's the user's turn — set immediately
    setPhase("idle");
    setCanSend(true);
    setSentTone(null); setNudgeReady(false); setNudgeSent(false); setSentAt(null);
    // Server check: may override to false if daily limit hit
    try {
      var cs = await canSendTrace(user.id);
      setCanSend(cs);
    } catch (e) { /* keep canSend(true) on server error */ }
    if (onbStepR.current < 4 && onbStepR.current >= 2) setOnbStep(2);
  }, [user]);

  // ── Send trace ──
  var onSendTrace = useCallback(async function(data) {
    // Check if a trace arrived while we were in "creating"
    if (pendingTraceRef.current) {
      var qt = pendingTraceRef.current; pendingTraceRef.current = null;
      setTrace(qt); setPhase("discovery"); setCanSend(false);
      setSentTone(null); setTurnWaiting(false); setTurnNudgeReady(false); setTurnNudgeSent(false);
      soundIncoming(); hapticMedium();
      return;
    }
    setPhase("idle"); setCanSend(false); setSentTone(data.tone);
    setSentAt(Date.now()); setNudgeReady(false); setNudgeSent(false);
    soundSend(); hapticSend();
    if (onbStepR.current < 4) setOnbStep(4);
    try {
      await sendTrace(pair.id, user.id, partnerId, data.path, data.tone, cbR.current.length === 0);
      sendPushToPartner('trace', pair.id).catch(function() {});
      sentCountR.current += 1;
      setContribs(function(prev) { return prev.concat([{ tone: data.tone, path: data.path }]); });
      setRecTones(function(prev) { return [data.tone].concat(prev).slice(0, 20); });
      setLastTone(data.tone);

      // Gesture memory: once after 20 own sends, show one-time subtle observation
      try {
        var shownKey = 'resona_gesture_memory_' + (pair ? pair.id : '');
        if (sentCountR.current === 20 && !localStorage.getItem(shownKey)) {
          localStorage.setItem(shownKey, '1');
          // Collect paths from all my sends (approximated from path data.path only available now)
          // Use the gesture data we have right now as representative sample
          var myPath = data.path;
          if (myPath && myPath.length > 2) {
            var totalLen = 0, totalDirChanges = 0;
            for (var gi = 1; gi < myPath.length; gi++) {
              totalLen += Math.sqrt((myPath[gi].x-myPath[gi-1].x)**2 + (myPath[gi].y-myPath[gi-1].y)**2);
              if (gi > 1) {
                var gcx = myPath[gi-1].x-myPath[gi-2].x, gcy = myPath[gi-1].y-myPath[gi-2].y;
                var gdx = myPath[gi].x-myPath[gi-1].x, gdy = myPath[gi].y-myPath[gi-1].y;
                if (Math.abs(gcx*gdy-gcy*gdx) > 0.0001) totalDirChanges++;
              }
            }
            var avgDir = totalDirChanges / Math.max(1, myPath.length);
            var obs = avgDir > 0.6 ? "your traces carry a lot of turns" :
                      totalLen < 0.3 ? "you tend to draw short" :
                      totalLen > 1.2 ? "your traces reach far" :
                      avgDir < 0.15 ? "your traces pull in one direction" : null;
            if (obs) setTimeout(function() { setMilestone(obs); setTimeout(function() { setMilestone(null); }, 5000); }, 3000);
          }
        }
      } catch(e) {}
    } catch (err) {
      console.error("Send error:", err);
      setCanSend(true);
      setSentTone(null);
      setAppError("Failed to send trace. Try again.");
    }
  }, [pair, user, partnerId]);

  // ── Nudge timer: check if trace has been out long enough ──
  useEffect(function() {
    if (!sentAt || canSend || nudgeSent || nudgeReady) return;
    var remaining = (sentAt + NUDGE_DELAY_HOURS * 3600000) - Date.now();
    if (remaining <= 0) { setNudgeReady(true); return; }
    var t = setTimeout(function() { setNudgeReady(true); }, remaining);
    return function() { clearTimeout(t); };
  }, [sentAt, canSend, nudgeSent, nudgeReady]);

  // ── Send nudge ──
  var doSendNudge = useCallback(async function() {
    setNudgeConfirm(false); setNudgeReady(false);
    soundNudge(); hapticLight();
    try {
      await sendNudge(pair.id, user.id);
      setNudgeSent(true);
      sendPushToPartner('nudge', pair.id).catch(function() {});
    } catch (e) { console.error("Nudge error:", e); setNudgeReady(true); }
  }, [pair, user]);

  // ── Turn-reminder timer ──
  useEffect(function() {
    if (!turnWaiting || !turnSince || turnNudgeSent || turnNudgeReady) return;
    var remaining = (turnSince + TURN_REMINDER_DELAY_HOURS * 3600000) - Date.now();
    if (remaining <= 0) { setTurnNudgeReady(true); return; }
    var t = setTimeout(function() { setTurnNudgeReady(true); }, remaining);
    return function() { clearTimeout(t); };
  }, [turnWaiting, turnSince, turnNudgeSent, turnNudgeReady]);

  // ── Send turn reminder ──
  var doSendTurnNudge = useCallback(async function() {
    setTurnNudgeConfirm(false); setTurnNudgeReady(false);
    soundNudge(); hapticLight();
    try {
      await sendNudge(pair.id, user.id);
      setTurnNudgeSent(true);
      sendPushToPartner('turn_reminder', pair.id).catch(function() {});
    } catch (e) { console.error("Turn nudge error:", e); setTurnNudgeReady(true); }
  }, [pair, user]);

  // ── Shared Canvas: broadcast channel ──
  useEffect(function() {
    if (!pair) return;
    var ch = createCanvasChannel(pair.id,
      function(data) { if (data.userId !== user.id) setPartnerStrokes(function(prev) { return prev.concat(data.points || []); }); },
      function(data) {
        // Partner triggered canvas_start — join automatically (use ref to avoid stale closure)
        if (data.userId !== user.id && !sharedPhaseR.current) {
          setSharedPhase("appearing");
          soundSharedCanvas(); hapticMoment();
          setTimeout(function() { setSharedPhase("drawing"); setSharedTimer(30); }, 3000);
        }
      },
      null, null
    );
    canvasChannelR.current = ch;
    return function() { supabase.removeChannel(ch); canvasChannelR.current = null; };
  }, [pair, user]);

  // ── Shared Canvas: automatic detection (both online + cooldown + no recent moment) ──
  useEffect(function() {
    if (!partnerHere || phase !== "idle" || sharedPhase) return;
    // Need at least 20 traces before the feature unlocks
    if (contribs.length < 20) return;
    // 7-day cooldown (was 24h — want this to be rare)
    var lastSession = 0;
    try { lastSession = parseInt(localStorage.getItem("last_shared_canvas") || "0"); } catch(e) {}
    if (Date.now() - lastSession < 7 * 24 * 3600000) return;
    // Check no recent Moment (5h cooldown shared with moments)
    var lastMoment = 0;
    try { lastMoment = parseInt(localStorage.getItem("last_moment_at") || "0"); } catch(e) {}
    if (Date.now() - lastMoment < 5 * 3600000) return;

    // Both online for 10 seconds — only the user with the lower ID sends the invite (deterministic)
    if (user && partnerId && user.id >= partnerId) return;
    var timer = setTimeout(function() {
      // Re-check conditions
      if (!canvasChannelR.current) return;
      setSharedPhase("appearing");
      soundSharedCanvas(); hapticMoment();
      sendCanvasBroadcast(canvasChannelR.current, "canvas_invite", { userId: user ? user.id : "" });
      setTimeout(function() { setSharedPhase("drawing"); setSharedTimer(30); }, 3000);
    }, 10000);
    return function() { clearTimeout(timer); };
  }, [partnerHere, phase, sharedPhase, contribs.length, user]);

  // ── Shared Canvas: timer ──
  useEffect(function() {
    if (sharedPhase !== "drawing") return;
    var iv = setInterval(function() {
      setSharedTimer(function(prev) {
        if (prev <= 1) {
          clearInterval(iv);
          // Save strokes
          var myStrokes = myStrokesR.current;
          if (myStrokes.length > 3 && pair && user) {
            var useTone = lastTone || "nearness";
            saveSharedCanvas(pair.id, user.id, myStrokes, useTone).catch(function(e) { console.error("Shared canvas save error:", e); });
            setContribs(function(p) { return p.concat([{ tone: useTone, path: myStrokes }]); });
          }
          try { localStorage.setItem("last_shared_canvas", String(Date.now())); } catch(e) {}
          setSharedPhase("done");
          // Auto-dismiss after 5 seconds
          setTimeout(function() {
            setSharedPhase(null); setPartnerStrokes([]); myStrokesR.current = [];
            setSharedTimer(30);
          }, 5000);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return function() { clearInterval(iv); };
  }, [sharedPhase]);

  // ── Still-here gesture handlers ──
  var startStillHereHold = useCallback(function() {
    if (stillHereHoldRef.current || !stillHereReady || phase !== "idle") return;
    var s = Date.now();
    stillHereHoldRef.current = setInterval(function() {
      if (phR.current !== "idle") {
        clearInterval(stillHereHoldRef.current); stillHereHoldRef.current = null;
        setStillHereHold(0); return;
      }
      var p2 = Math.min(1, (Date.now() - s) / 2000);
      setStillHereHold(p2);
      if (p2 >= 1) {
        clearInterval(stillHereHoldRef.current); stillHereHoldRef.current = null;
        setStillHereHold(0); setStillHereReady(false); setStillHereSent(true);
        soundStillHere(); hapticLight();
        sendStillHere(pair.id, user.id)
          .then(function() { sendPushToPartner('still_here', pair.id).catch(function() {}); })
          .catch(function(e) { console.error("Still-here error:", e); });
        // Reset sent indicator after 3s
        setTimeout(function() { setStillHereSent(false); }, 3000);
      }
    }, 16);
  }, [stillHereReady, phase, pair, user]);

  var stopStillHereHold = useCallback(function() {
    if (stillHereHoldRef.current) { clearInterval(stillHereHoldRef.current); stillHereHoldRef.current = null; }
    setStillHereHold(0);
  }, []);

  // ── Dismiss incoming partner moment ──
  var dismissIncoming = useCallback(function() { setIncomingMoment(null); }, []);

  // ── Dismiss still-here incoming ──
  useEffect(function() {
    if (!stillHereIncoming) return;
    var t = setTimeout(function() { setStillHereIncoming(null); }, 5000);
    return function() { clearTimeout(t); };
  }, [stillHereIncoming]);

  // ── Dismiss nudge incoming ──
  useEffect(function() {
    if (!nudgeIncoming) return;
    var t = setTimeout(function() { setNudgeIncoming(null); }, 8000);
    return function() { clearTimeout(t); };
  }, [nudgeIncoming]);

  // ── Milestone fade out ──
  useEffect(function() {
    if (!milestone) return;
    var t = setTimeout(function() { setMilestone(null); }, 6000);
    return function() { clearTimeout(t); };
  }, [milestone]);

  // ── Export artwork as image ──
  var exportArtwork = useCallback(function() {
    if (contribs.length === 0) return;
    var c = document.createElement("canvas");
    var size = 1080; c.width = size; c.height = size;
    var ctx = c.getContext("2d");
    ctx.fillStyle = "#0A0A12"; ctx.fillRect(0, 0, size, size);
    drawArtwork(ctx, contribs, size, size, 0.85);
    // Add subtle text
    ctx.fillStyle = "rgba(255,255,255,0.08)"; ctx.font = "200 14px 'Outfit', sans-serif";
    ctx.textAlign = "center"; ctx.fillText("resona", size / 2, size - 30);
    try {
      var link = document.createElement("a");
      link.download = "resona-artwork.png";
      link.href = c.toDataURL("image/png");
      link.click();
    } catch (e) {
      // Fallback: try share API
      c.toBlob(function(blob) {
        if (navigator.share && blob) {
          navigator.share({ files: [new File([blob], "resona-artwork.png", { type: "image/png" })] }).catch(function() {});
        }
      });
    }
  }, [contribs]);

  // ── Derived values ──
  var dNorm = 1, trRgb = "255,255,255";
  if (touch && trace) {
    var ep = effectiveRevealPosR.current || trace.reveal_position;
    dNorm = dst(touch.x, touch.y, ep.x, ep.y) / Math.sqrt(2);
  }
  if (trace && TONES[trace.emotional_tone]) trRgb = TONES[trace.emotional_tone].rgb.join(",");
  var pxL = null;
  if (trace && touch) {
    var _dm = trace.discovery_mode || 'stillness';
    if (_dm === 'wake') {
      pxL = dNorm < 0.08 ? "wait for it\u2026" : dNorm < 0.55 ? "something stirs\u2026" : null;
    } else if (_dm === 'follow') {
      pxL = dNorm < 0.08 ? "don\u2019t let go\u2026" : dNorm < 0.20 ? "stay close\u2026" : dNorm < 0.55 ? "it\u2019s moving\u2026" : null;
    } else {
      pxL = dNorm < 0.04 ? "hold gently\u2026" : dNorm < 0.14 ? "right here\u2026" : dNorm < 0.30 ? "getting warmer\u2026" : dNorm < 0.55 ? "something faint\u2026" : null;
    }
  }
  var pxA = dNorm < 0.04 ? 0.8 : dNorm < 0.14 ? 0.6 : dNorm < 0.30 ? 0.4 : dNorm < 0.55 ? 0.22 : 0;
  var mRgb = mTone && TONES[mTone] ? TONES[mTone].rgb.join(",") : "255,255,255";
  var bottomColor = lastTone ? TONES[lastTone].primary : "rgba(255,255,255,0.2)";

  return (
    <div style={{ width:"100%",height:"100vh",position:"relative",overflow:"hidden",background:"#0A0A12",userSelect:"none",WebkitUserSelect:"none",paddingTop:"env(safe-area-inset-top)",paddingBottom:"env(safe-area-inset-bottom)" }}>
      <canvas ref={cvRef} style={{ position:"absolute",inset:0,width:"100%",height:"100%",touchAction:"none",cursor:phase==="discovery"?"crosshair":"default" }}
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={onUp} />

      {/* Error toast */}
      {appError ? <div style={{ position:"absolute",top:50,left:"50%",transform:"translateX(-50%)",zIndex:60,padding:"10px 20px",borderRadius:12,background:"rgba(196,30,58,0.12)",border:"1px solid rgba(196,30,58,0.2)",fontFamily:FONT,animation:"fadeIn 0.5s ease" }}>
        <span style={{ color:"rgba(196,30,58,0.7)",fontSize:12,letterSpacing:"0.05em",fontWeight:300 }}>{appError}</span>
      </div> : null}

      {/* Dissolved by partner overlay */}
      {dissolved ? <div style={{ position:"absolute",inset:0,zIndex:70,background:"rgba(6,6,12,0.97)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",fontFamily:FONT,animation:"fadeIn 1s ease" }}>
        <div style={{ width:3,height:3,borderRadius:"50%",background:"rgba(255,255,255,0.3)",marginBottom:24 }} />
        <div style={{ color:"rgba(255,255,255,0.58)",fontSize:13,letterSpacing:"0.2em",fontWeight:200,marginBottom:12 }}>CONNECTION DISSOLVED</div>
        <div style={{ color:"rgba(255,255,255,0.6)",fontSize:12,letterSpacing:"0.08em",fontWeight:200,lineHeight:1.8,textAlign:"center",marginBottom:40 }}>your person ended the connection</div>
        <div onClick={function() { window.location.reload(); }} style={{ padding:"14px 40px",borderRadius:24,border:"1px solid rgba(255,255,255,0.08)",background:"rgba(255,255,255,0.03)",cursor:"pointer",color:"rgba(255,255,255,0.52)",fontSize:12,letterSpacing:"0.18em",fontWeight:200 }}>START OVER</div>
      </div> : null}

      {/* PWA install prompt (only after first trace, only once) */}
      <InstallPrompt traceCount={contribs.length} user={user} guest={guest} onOpenEmail={function() { setShowEmail(true); }} />

      {/* Email linking overlay */}
      {showEmail ? <EmailLinkUI onDone={function() { setShowEmail(false); }} /> : null}

      {/* Settings gear */}
      {phase === "idle" ? <div style={{ position:"absolute",top:18,left:0,right:0,zIndex:11,display:"flex",justifyContent:"space-between",alignItems:"center",padding:"0 18px",pointerEvents:"none" }}>
        <div style={{ display:"flex",alignItems:"center",gap:8,pointerEvents:"none" }}>
          {partnerHere ? <div style={{ display:"flex",alignItems:"center",gap:7,padding:"4px 12px 4px 8px",borderRadius:16,background:"rgba(212,165,116,0.06)",border:"1px solid rgba(212,165,116,0.1)" }}>
            <div style={{ width:7,height:7,borderRadius:"50%",background:"rgba(212,165,116,0.7)",boxShadow:"0 0 12px rgba(212,165,116,0.4)",animation:"gentlePulse 3s ease infinite" }} />
            <span style={{ color:"rgba(212,165,116,0.5)",fontSize:12,letterSpacing:"0.12em",fontWeight:200 }}>here</span>
          </div> : null}
          {dayCount > 1 && !partnerHere ? <span style={{ color:"rgba(255,255,255,0.6)",fontSize:13,letterSpacing:"0.1em",fontWeight:200 }}>day {dayCount}</span> : null}
        </div>
        <div onClick={function() { setShowSettings(true); }} style={{ cursor:"pointer",opacity:0.25,fontSize:18,color:"white",pointerEvents:"auto" }}>{"\u2699"}</div>
      </div> : null}
      {showSettings ? <div style={{ position:"absolute",inset:0,zIndex:48,display:"flex",alignItems:"flex-end",justifyContent:"center" }} onClick={function() { setShowSettings(false); }}>
        <div style={{ position:"absolute",inset:0,background:"rgba(0,0,0,0.5)" }} />
        <div onClick={function(ev) { ev.stopPropagation(); }} style={{ position:"relative",width:"100%",maxWidth:400,background:"#111118",borderRadius:"20px 20px 0 0",padding:"28px 24px 40px",fontFamily:FONT }}>
          <div style={{ width:32,height:3,borderRadius:2,background:"rgba(255,255,255,0.15)",margin:"0 auto 24px" }} />
          <div style={{ color:"rgba(255,255,255,0.52)",fontSize:13,letterSpacing:"0.25em",fontWeight:200,marginBottom:20 }}>SETTINGS</div>
          <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16 }}>
            <div style={{ color:"rgba(255,255,255,0.58)",fontSize:14,letterSpacing:"0.08em",fontWeight:200 }}>
              Connected{dayCount > 1 ? " \u00B7 day " + dayCount : ""}
              {streakData.current > 1 ? <span style={{ marginLeft:8,color:"rgba(212,165,116,0.6)",fontSize:12,fontWeight:200 }}>{"\u25CF"} {streakData.current}-day streak</span> : null}
            </div>
            {partnerHere ? <div style={{ display:"flex",alignItems:"center",gap:6 }}>
              <div style={{ width:5,height:5,borderRadius:"50%",background:"rgba(212,165,116,0.6)" }} />
              <span style={{ color:"rgba(212,165,116,0.5)",fontSize:13,fontWeight:200 }}>here now</span>
            </div> : null}
          </div>

          {/* Account */}
          <div style={{ padding:"16px 0",borderTop:"1px solid rgba(255,255,255,0.06)" }}>
            {guest ? (
              <div>
                <div style={{ display:"flex",alignItems:"center",gap:8,marginBottom:8 }}>
                  <div style={{ width:6,height:6,borderRadius:"50%",background:"rgba(224,122,95,0.5)" }} />
                  <span style={{ color:"rgba(224,122,95,0.6)",fontSize:14,fontWeight:300 }}>Guest Mode</span>
                </div>
                <div style={{ color:"rgba(255,255,255,0.52)",fontSize:13,fontWeight:200,lineHeight:1.6,marginBottom:12 }}>Your account is tied to this device. If you clear your browser data, you lose access.</div>
                <div onClick={function() { setShowSettings(false); setShowEmail(true); }} style={{ color:"rgba(212,165,116,0.7)",fontSize:14,fontWeight:300,letterSpacing:"0.08em",cursor:"pointer",marginBottom:16 }}>Secure with Email</div>
                {/* Recovery Code */}
                <div style={{ background:"rgba(255,255,255,0.03)",borderRadius:12,padding:"14px 16px",marginBottom:4 }}>
                  <div style={{ color:"rgba(255,255,255,0.45)",fontSize:12,letterSpacing:"0.1em",fontWeight:200,marginBottom:8 }}>RECOVERY CODE</div>
                  {recoveryToken === null ? (
                    <div style={{ color:"rgba(255,255,255,0.3)",fontSize:12,fontWeight:200 }}>loading…</div>
                  ) : recoveryToken ? (
                    <div>
                      <div style={{ display:"flex",alignItems:"center",gap:12,marginBottom:8 }}>
                        <span style={{ color:"rgba(212,165,116,0.8)",fontSize:22,fontWeight:300,letterSpacing:"0.35em" }}>{recoveryToken}</span>
                        <div onClick={function() { try { navigator.clipboard.writeText(recoveryToken); } catch(e) {} }} style={{ cursor:"pointer",padding:"4px 10px",borderRadius:8,border:"1px solid rgba(255,255,255,0.08)",color:"rgba(255,255,255,0.4)",fontSize:11,fontWeight:200 }}>copy</div>
                      </div>
                      <div style={{ color:"rgba(255,255,255,0.35)",fontSize:11,fontWeight:200,lineHeight:1.6 }}>Write this down. Use it on Welcome → "recover my space" if you ever lose access.</div>
                    </div>
                  ) : (
                    <div>
                      <div style={{ color:"rgba(255,255,255,0.4)",fontSize:12,fontWeight:200,lineHeight:1.6,marginBottom:10 }}>Generate a code to recover your space if you lose access to this device.</div>
                      <div onClick={async function() {
                        setGeneratingRecovToken(true);
                        try {
                          var tok = await generateRecoveryToken(user.id);
                          setRecoveryToken(tok);
                        } catch(e) { console.error("Recovery token error:", e); }
                        setGeneratingRecovToken(false);
                      }} style={{ cursor:"pointer",color:"rgba(212,165,116,0.7)",fontSize:13,fontWeight:300,letterSpacing:"0.08em" }}>
                        {generatingRecovToken ? "generating…" : "Generate Recovery Code"}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div style={{ display:"flex",alignItems:"center",gap:8 }}>
                <div style={{ width:6,height:6,borderRadius:"50%",background:"rgba(100,200,100,0.5)" }} />
                <span style={{ color:"rgba(255,255,255,0.57)",fontSize:14,fontWeight:200 }}>{user.email}</span>
              </div>
            )}
          </div>

          {/* Reunion */}
          <div style={{ padding:"16px 0",borderTop:"1px solid rgba(255,255,255,0.06)" }}>
            {reunion && reunion.type === "reunion" && reunion.status === "accepted" ? (
              <div>
                <div style={{ color:"rgba(212,165,116,0.7)",fontSize:14,fontWeight:300,letterSpacing:"0.1em",marginBottom:8 }}>
                  Reunion: {new Date(reunion.proposed_date + "T00:00:00").toLocaleDateString(undefined, { day:"numeric",month:"long" })}
                </div>
                <div onClick={function() { respondToProposal(reunion.id, false).then(function() { setReunion(null); setShowSettings(false); setReunionUI("propose"); }).catch(function(){}); }} style={{ color:"rgba(255,255,255,0.47)",fontSize:12,fontWeight:200,cursor:"pointer" }}>change date</div>
              </div>
            ) : reunion && reunion.type === "reunion" && reunion.status === "pending" && reunion.proposed_by === user.id ? (
              <div>
                <div style={{ color:"rgba(255,255,255,0.6)",fontSize:14,fontWeight:200,letterSpacing:"0.1em",marginBottom:8 }}>
                  Waiting for your person to accept{"\u2026"}
                </div>
                <div onClick={function() { respondToProposal(reunion.id, false).then(function() { setReunion(null); }).catch(function(){}); }} style={{ color:"rgba(255,255,255,0.47)",fontSize:12,fontWeight:200,cursor:"pointer" }}>cancel</div>
              </div>
            ) : (
              <div onClick={function() { setShowSettings(false); setReunionUI("propose"); }} style={{ color:"rgba(212,165,116,0.7)",fontSize:14,fontWeight:300,letterSpacing:"0.1em",cursor:"pointer" }}>
                Plan a Reunion
              </div>
            )}
          </div>

          {/* Reveal Artwork */}
          {contribs.length > 0 ? <div style={{ padding:"16px 0",borderTop:"1px solid rgba(255,255,255,0.06)" }}>
            <div onClick={function() { setShowSettings(false); setReunionUI("confirm_reveal"); }} style={{ color:"rgba(212,165,116,0.7)",fontSize:14,fontWeight:300,letterSpacing:"0.1em",cursor:"pointer" }}>
              Reveal Artwork
            </div>
            <div style={{ color:"rgba(255,255,255,0.57)",fontSize:12,fontWeight:200,marginTop:6 }}>see what you created together</div>
          </div> : null}

          {/* Start Fresh */}
          {contribs.length > 0 ? <div style={{ padding:"16px 0",borderTop:"1px solid rgba(255,255,255,0.06)" }}>
            <div onClick={function() { setShowSettings(false); setReunionUI("confirm_reset"); }} style={{ color:"rgba(255,255,255,0.57)",fontSize:14,fontWeight:200,letterSpacing:"0.1em",cursor:"pointer" }}>
              Start Fresh
            </div>
            <div style={{ color:"rgba(255,255,255,0.57)",fontSize:12,fontWeight:200,marginTop:6 }}>both need to agree · artwork will be cleared</div>
          </div> : null}

          {/* Dissolve */}
          <div style={{ padding:"16px 0",borderTop:"1px solid rgba(255,255,255,0.06)" }}>
            <div onClick={function() { if (confirm("Dissolve this connection? This cannot be undone.")) { setShowSettings(false); onDissolve(); } }} style={{ color:"rgba(196,30,58,0.6)",fontSize:14,fontWeight:200,letterSpacing:"0.1em",cursor:"pointer" }}>Dissolve Connection</div>
          </div>

          {/* Reload */}
          <div style={{ padding:"16px 0",borderTop:"1px solid rgba(255,255,255,0.06)" }}>
            <div onClick={function() { window.location.reload(); }} style={{ color:"rgba(255,255,255,0.3)",fontSize:13,fontWeight:200,letterSpacing:"0.1em",cursor:"pointer" }}>Reload App</div>
            <div style={{ color:"rgba(255,255,255,0.2)",fontSize:11,fontWeight:200,marginTop:4 }}>if something feels stuck</div>
          </div>
        </div>
      </div> : null}

      {/* Status */}
      <div style={{ position:"absolute",top:22,left:0,right:0,textAlign:"center",zIndex:10,pointerEvents:"none",fontFamily:FONT }}>
        {phase === "discovery" && trace ? <div style={{ animation:"fadeIn 1s ease" }}>
          <span style={{ color:"rgba("+trRgb+",0.65)",fontSize:15,letterSpacing:"0.28em",fontWeight:300,textShadow:"0 0 25px rgba("+trRgb+",0.2)" }}>{trace.discovery_mode === 'follow' ? "SOMETHING IS MOVING" : trace.discovery_mode === 'wake' ? "SOMETHING IS STIRRING" : "SOMETHING IS HERE"}</span>
          {onbStep === 0 ? <div style={{ marginTop:6,color:"rgba(255,255,255,0.63)",fontSize:13,letterSpacing:"0.15em",fontWeight:200 }}>someone left something for you</div> : null}
        </div> : null}

        {/* Idle status indicator */}
        {phase === "idle" && !canSend && sentTone ? null /* "YOUR TRACE IS OUT THERE" shown at bottom */ : null}
        {phase === "idle" && !canSend && !sentTone && contribs.length === 0 ? <div style={{ animation:"fadeIn 2s ease",marginTop:8 }}>
          <span style={{ color:"rgba(255,255,255,0.58)",fontSize:12,letterSpacing:"0.2em",fontWeight:200 }}>waiting for your first trace</span>
        </div> : null}
      </div>

      {/* Passive reveal notice */}
      {passiveNotice ? <div style={{ position:"absolute",top:"40%",left:0,right:0,textAlign:"center",zIndex:15,pointerEvents:"none",fontFamily:FONT,animation:"fadeIn 0.8s ease" }}>
        <span style={{ color:"rgba(255,255,255,0.63)",fontSize:13,letterSpacing:"0.2em",fontWeight:200 }}>revealing itself{"\u2026"}</span>
      </div> : null}

      {/* Proximity label */}
      {phase === "discovery" && pxL && touch ? <div style={{ position:"absolute",left:(touch.x*100)+"%",top:touch.y < 0.25 ? Math.min(96, touch.y*100+18)+"%" : Math.max(4, touch.y*100-18)+"%",transform:"translate(-50%,"+(touch.y < 0.25 ? "0" : "-100%")+")",zIndex:12,pointerEvents:"none",fontFamily:FONT,color:"rgba("+trRgb+","+pxA+")",fontSize:14,letterSpacing:"0.12em",fontWeight:200,fontStyle:"italic",textShadow:dNorm<0.1?"0 0 15px rgba("+trRgb+",0.3)":"none",transition:"color 0.3s, top 0.15s" }}>{pxL}</div> : null}

      {/* Onboarding hints */}
      {phase === "discovery" && onbStep <= 1 ? <div style={{ position:"absolute",bottom:70,left:0,right:0,textAlign:"center",zIndex:10,pointerEvents:"none",fontFamily:FONT,animation:"fadeIn 2s ease" }}>
        <div style={{ display:"inline-block",padding:"10px 24px",borderRadius:20,background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.08)" }}>
          <span style={{ color:"rgba(255,255,255,0.52)",fontSize:13,letterSpacing:"0.14em",fontWeight:200 }}>touch the space {"\u00B7"} move slowly {"\u00B7"} find the trace</span></div></div> : null}

      {/* Reveal */}
      {phase === "revealing" && trace ? <RevealCanvas tone={trace.emotional_tone} path={trace.gesture_data.path} amplified={trace.gesture_data.path && analyzeGesture(trace.gesture_data.path).intensity > 0.5} pulseGesture={pendPulse} onDone={onRevealDone} /> : null}

      {/* Glimpse — wrapper becomes tappable after 1s to avoid carry-over from reveal tap */}
      {phase === "glimpse" && contribs.length > 0 ? <GlimpseWrapper contribs={contribs} onDone={onGlimpseDone} /> : null}

      {/* Trace creation */}
      {phase === "creating" ? <TraceCreationUI onSend={onSendTrace} onCancel={function() {
        var qt = pendingTraceRef.current;
        if (qt) { pendingTraceRef.current = null; setTrace(qt); setPhase("discovery"); setCanSend(false); setSentTone(null); setTurnWaiting(false); setTurnNudgeReady(false); setTurnNudgeSent(false); soundIncoming(); hapticMedium(); }
        else { setPhase("idle"); }
      }} guided={onbStep <= 3} traceCount={contribs.length} /> : null}

      {/* Moment intros */}
      {mPhase === "twin_connection_intro" ? <MomentIntro rgb={mRgb} label="SOMETHING RARE HAPPENED" onDone={onIntroTwinDone} /> : null}
      {mPhase === "amplified_reveal_intro" ? <MomentIntro rgb={mRgb} label="THIS TRACE TOOK TIME" onDone={onIntroAmpDone} /> : null}
      {mPhase === "trace_convergence_intro" ? <MomentIntro rgb={mRgb} label="YOUR TRACES CONVERGED" onDone={onIntroConvDone} /> : null}
      {mPhase === "tone_resonance_intro" ? <ToneResonanceMoment rgb={mRgb} tone={mTone} onDone={onIntroResDone} /> : null}

      {/* Moment pickers */}
      {mPhase === "whisper" ? <WhisperPickerUI rgb={mRgb} onSelect={onWhisperSelect} onTimeout={onWhisperTimeout} /> : null}
      {mPhase === "whisperShow" && whisper ? <WhisperDisplayUI word={whisper} rgb={mRgb} onDone={onWhisperDone} /> : null}
      {mPhase === "echo" ? <EchoMarkPickerUI rgb={mRgb} onSelect={onEchoSelect} onTimeout={onEchoTimeout} /> : null}
      {mPhase === "echoShow" && echoM ? <EchoMarkDisplayUI mark={echoM} rgb={mRgb} onDone={onEchoDone} /> : null}
      {/* Note: PulseCaptureUI removed — amplified reveal is now automatic */}

      {/* Incoming partner moment display */}
      {incomingMoment ? <IncomingMomentDisplay event={incomingMoment} pair={pair} onDismiss={dismissIncoming} /> : null}

      {/* Milestone display */}
      {milestone ? <div style={{ position:"absolute",top:"42%",left:0,right:0,textAlign:"center",zIndex:16,pointerEvents:"none",fontFamily:FONT,animation:"fadeIn 1.5s ease" }}>
        <div style={{ color:"rgba(212,165,116,0.55)",fontSize:13,letterSpacing:"0.2em",fontWeight:200 }}>{milestone}</div>
      </div> : null}

      {/* Still-here incoming from partner */}
      {stillHereIncoming ? <div style={{ position:"absolute",top:"40%",left:0,right:0,textAlign:"center",zIndex:16,pointerEvents:"none",fontFamily:FONT,animation:"fadeIn 0.8s ease" }}>
        <div style={{ width:8,height:8,borderRadius:"50%",background:"rgba(212,165,116,0.5)",boxShadow:"0 0 40px rgba(212,165,116,0.3)",margin:"0 auto 14px",animation:"gentlePulse 2s ease infinite" }} />
        <div style={{ color:"rgba(212,165,116,0.6)",fontSize:12,letterSpacing:"0.2em",fontWeight:200 }}>your person is here</div>
      </div> : null}

      {/* Nudge incoming from partner */}
      {nudgeIncoming ? <div style={{ position:"absolute",top:"38%",left:0,right:0,textAlign:"center",zIndex:16,pointerEvents:"none",fontFamily:FONT,animation:"fadeIn 0.8s ease" }}>
        <div style={{ width:6,height:6,borderRadius:"50%",background:"rgba(255,255,255,0.4)",boxShadow:"0 0 30px rgba(255,255,255,0.2)",margin:"0 auto 14px",animation:"gentlePulse 2s ease infinite" }} />
        <div style={{ color:"rgba(255,255,255,0.57)",fontSize:12,letterSpacing:"0.2em",fontWeight:200 }}>your person is waiting</div>
      </div> : null}

      {/* Nudge confirmation overlay */}
      {nudgeConfirm ? <div style={{ position:"absolute",inset:0,zIndex:52,display:"flex",alignItems:"center",justifyContent:"center",pointerEvents:"none" }}>
        <div style={{ pointerEvents:"auto",maxWidth:300,padding:"24px 28px",borderRadius:20,background:"rgba(17,17,24,0.95)",border:"1px solid rgba(255,255,255,0.08)",fontFamily:FONT,textAlign:"center",animation:"fadeIn 0.5s ease",backdropFilter:"blur(12px)",WebkitBackdropFilter:"blur(12px)" }}>
          <div style={{ color:"rgba(255,255,255,0.57)",fontSize:12,letterSpacing:"0.2em",fontWeight:200,marginBottom:12 }}>GENTLE REMINDER</div>
          <div style={{ color:"rgba(255,255,255,0.58)",fontSize:13,fontWeight:200,lineHeight:1.7,marginBottom:20 }}>your person will be notified<br/>that you are waiting</div>
          <div style={{ display:"flex",gap:12,justifyContent:"center" }}>
            <div onClick={function() { setNudgeConfirm(false); }} style={{ padding:"10px 20px",borderRadius:20,border:"1px solid rgba(255,255,255,0.06)",cursor:"pointer",color:"rgba(255,255,255,0.58)",fontSize:12,fontWeight:200 }}>CANCEL</div>
            <div onClick={doSendNudge} style={{ padding:"10px 20px",borderRadius:20,border:"1px solid rgba(212,165,116,0.2)",background:"rgba(212,165,116,0.06)",cursor:"pointer",color:"rgba(212,165,116,0.7)",fontSize:12,fontWeight:300 }}>SEND</div>
          </div>
        </div>
      </div> : null}

      {/* Turn-reminder confirmation */}
      {turnNudgeConfirm ? <div style={{ position:"absolute",inset:0,zIndex:52,display:"flex",alignItems:"center",justifyContent:"center",pointerEvents:"none" }}>
        <div style={{ pointerEvents:"auto",maxWidth:300,padding:"24px 28px",borderRadius:20,background:"rgba(17,17,24,0.95)",border:"1px solid rgba(255,255,255,0.08)",fontFamily:FONT,textAlign:"center",animation:"fadeIn 0.5s ease",backdropFilter:"blur(12px)",WebkitBackdropFilter:"blur(12px)" }}>
          <div style={{ color:"rgba(255,255,255,0.57)",fontSize:12,letterSpacing:"0.2em",fontWeight:200,marginBottom:12 }}>GENTLE NUDGE</div>
          <div style={{ color:"rgba(255,255,255,0.58)",fontSize:13,fontWeight:200,lineHeight:1.7,marginBottom:20 }}>let your person know<br/>it's their turn</div>
          <div style={{ display:"flex",gap:12,justifyContent:"center" }}>
            <div onClick={function() { setTurnNudgeConfirm(false); }} style={{ padding:"10px 20px",borderRadius:20,border:"1px solid rgba(255,255,255,0.06)",cursor:"pointer",color:"rgba(255,255,255,0.58)",fontSize:12,fontWeight:200 }}>CANCEL</div>
            <div onClick={doSendTurnNudge} style={{ padding:"10px 20px",borderRadius:20,border:"1px solid rgba(212,165,116,0.2)",background:"rgba(212,165,116,0.06)",cursor:"pointer",color:"rgba(212,165,116,0.7)",fontSize:12,fontWeight:300 }}>SEND</div>
          </div>
        </div>
      </div> : null}

      {/* Shared Canvas: waiting for partner to join */}
      {sharedPhase === "inviting" ? <div style={{ position:"absolute",inset:0,zIndex:46,background:"rgba(6,6,12,0.95)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",fontFamily:FONT,animation:"fadeIn 0.6s ease" }}>
        <div style={{ width:6,height:6,borderRadius:"50%",background:"rgba(212,165,116,0.5)",animation:"gentlePulse 2s ease infinite",marginBottom:20 }} />
        <div style={{ color:"rgba(255,255,255,0.58)",fontSize:13,letterSpacing:"0.2em",fontWeight:200,marginBottom:12 }}>waiting for your person{String.fromCharCode(8230)}</div>
        <div onClick={function() { setSharedPhase(null); }} style={{ color:"rgba(255,255,255,0.45)",fontSize:12,fontWeight:200,cursor:"pointer",marginTop:16 }}>cancel</div>
      </div> : null}

      {/* Shared Canvas: partner invites you */}
      {/* Shared Canvas: drawing phase */}
      {(sharedPhase === "drawing" || sharedPhase === "done") ? <SharedCanvasUI myTone={lastTone || "nearness"} partnerTone={recTones.length > 0 ? recTones[0] : "warmth"} partnerStrokes={partnerStrokes} timer={sharedTimer} channelRef={canvasChannelR} userId={user.id} onStrokesUpdate={function(s) { myStrokesR.current = s; }} frozen={sharedPhase === "done"} /> : null}

      {/* Shared Canvas: done — show result */}
      {sharedPhase === "done" ? <div style={{ position:"absolute",inset:0,zIndex:46,background:"rgba(6,6,12,0.95)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",fontFamily:FONT,animation:"fadeIn 0.8s ease" }}>
        <div style={{ width:6,height:6,borderRadius:"50%",background:"rgba(212,165,116,0.6)",boxShadow:"0 0 24px rgba(212,165,116,0.3)",marginBottom:20 }} />
        <div style={{ color:"rgba(255,255,255,0.6)",fontSize:14,letterSpacing:"0.2em",fontWeight:200,marginBottom:10 }}>added to your artwork</div>
        <div style={{ color:"rgba(255,255,255,0.35)",fontSize:12,fontWeight:200 }}>a moment drawn together</div>
      </div> : null}

      {/* Proposal overlays */}
      {reunionUI === "propose" ? <ReunionPropose pair={pair} user={user} onDone={function(reu) { if (reu) setReunion(reu); setReunionUI(null); }} /> : null}

      {/* Confirm: Reveal Artwork */}
      {reunionUI === "confirm_reveal" ? <ConfirmOverlay
        title="REVEAL ARTWORK" text={"see everything you\u2019ve created together\nyour person will need to agree too"}
        confirmLabel="SEND REQUEST" confirmColor="212,165,116"
        onConfirm={function() { proposeReveal(pair.id, user.id).then(function() { setReunionUI(null); sendPushToPartner('proposal', pair.id).catch(function(){}); }).catch(function(e) { console.error("Reveal propose error:", e); setAppError(e.message || "Failed to send request."); setReunionUI(null); }); }}
        onCancel={function() { setReunionUI(null); }}
      /> : null}

      {/* Confirm: Start Fresh */}
      {reunionUI === "confirm_reset" ? <ConfirmOverlay
        title="START FRESH" text={"all traces and artwork will be cleared\nyou can build something new together\nyour person will need to agree too"}
        confirmLabel="SEND REQUEST" confirmColor="255,255,255"
        onConfirm={function() { proposeReset(pair.id, user.id).then(function() { setReunionUI(null); sendPushToPartner('proposal', pair.id).catch(function(){}); }).catch(function(e) { console.error("Reset propose error:", e); setAppError(e.message || "Failed to send request."); setReunionUI(null); }); }}
        onCancel={function() { setReunionUI(null); }}
      /> : null}

      {/* Incoming: Reunion */}
      {reunionUI === "incoming_reunion" && reunion ? <ReunionIncoming reunion={reunion} onRespond={function(accept) { respondToProposal(reunion.id, accept).then(function() { setReunionUI(null); if (accept) setReunion(Object.assign({}, reunion, { status: "accepted" })); }).catch(function(e) { console.error("Respond error:", e); setAppError(e.message || "Failed to respond."); setReunionUI(null); }); }} /> : null}

      {/* Incoming: Reset */}
      {reunionUI === "incoming_reset" && reunion ? <ResetIncoming onRespond={function(accept) {
        respondToProposal(reunion.id, accept).then(function() {
          if (accept) {
            executeResetArtwork(pair.id).then(function() {
              completeProposal(reunion.id).catch(function(){});
              // Save ghost snapshot before clearing
              try {
                var ghostKey = 'resona_ghost_' + pair.id;
                var snap = cbR.current.filter(function(c) { return c.path && c.path.length > 2; }).slice(-4);
                if (snap.length > 0) { localStorage.setItem(ghostKey, JSON.stringify(snap)); ghostChapterR.current = snap; }
              } catch(e) {}
              setContribs([]); setRecTones([]); setReunion(null); setReunionUI(null);
            }).catch(function(e) { console.error("Reset error:", e); setAppError(e.message || "Reset failed."); setReunionUI(null); });
          } else { setReunionUI(null); }
        }).catch(function(e) { console.error("Respond error:", e); setAppError(e.message || "Failed to respond."); setReunionUI(null); });
      }} /> : null}

      {/* Incoming: Reveal */}
      {reunionUI === "incoming_reveal" && reunion ? <ConfirmOverlay
        title="REVEAL ARTWORK" text={"your person wants to see\nwhat you\u2019ve created together"}
        confirmLabel="REVEAL" confirmColor="212,165,116" cancelLabel="NOT YET"
        onConfirm={function() { respondToProposal(reunion.id, true).then(function() { setReunion(Object.assign({}, reunion, { status: "accepted" })); setReunionUI("reveal"); }).catch(function(e) { console.error("Reveal respond error:", e); setAppError(e.message || "Failed to respond."); setReunionUI(null); }); }}
        onCancel={function() { respondToProposal(reunion.id, false).then(function() { setReunionUI(null); }).catch(function(e) { console.error("Decline error:", e); setReunionUI(null); }); }}
      /> : null}

      {/* Artwork Reveal */}
      {reunionUI === "reveal" ? <ReunionReveal contribs={contribs} reunion={reunion} onDone={function() {
        // Mark seen in sessionStorage (immediate) + complete in DB after short delay
        // so partner has time to also see it before it disappears from their reload
        if (reunion) {
          try { sessionStorage.setItem("seen_reveal_" + reunion.id, "1"); } catch(e) {}
          setTimeout(function() { completeProposal(reunion.id).catch(function(){}); }, 30000);
        }
        setReunionUI("post_reveal");
      }} /> : null}

      {/* Post-Reveal: Start fresh option */}
      {reunionUI === "post_reveal" ? <PostRevealPrompt onStartFresh={function() {
        proposeReset(pair.id, user.id).then(function() { setReunionUI(null); }).catch(function(e) { console.error(e); setReunionUI(null); });
      }} onKeep={function() { setReunion(null); setReunionUI(null); }} /> : null}

      {/* Tone awakening overlay */}
      {tonesAwakening && tonesAwakening.length > 0 ? <ToneAwakeningOverlay tones={tonesAwakening} onDone={function() { setTonesAwakening(null); }} /> : null}

      {/* Bottom affordance */}
      {phase === "idle" || phase === "discovery" ? (
        <div style={{ position:"absolute",bottom:0,left:0,right:0,zIndex:10,fontFamily:FONT,paddingBottom:"max(16px, env(safe-area-inset-bottom, 16px))" }}>
          {canSend ? <div onClick={function() { if (onbStep === 2) setOnbStep(3); setPhase("creating"); }} style={{ display:"flex",flexDirection:"column",alignItems:"center",cursor:"pointer",paddingBottom:4,gap:8 }}>
            <div style={{ width:44,height:44,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",border:"1px solid "+(lastTone?TONES[lastTone].primary+"44":"rgba(255,255,255,0.1)"),background:lastTone?"rgba("+TONES[lastTone].rgb.join(",")+",0.06)":"rgba(255,255,255,0.02)",boxShadow:"0 0 24px "+(lastTone?TONES[lastTone].primary+"33":"rgba(255,255,255,0.05)") }}>
              <div style={{ width:8,height:8,borderRadius:"50%",background:lastTone?TONES[lastTone].primary:"rgba(255,255,255,0.3)",boxShadow:"0 0 12px "+(lastTone?TONES[lastTone].primary+"66":"rgba(255,255,255,0.15)"),animation:"gentlePulse 4s ease-in-out infinite" }} />
            </div>
            <span style={{ color:"rgba(255,255,255,0.47)",fontSize:13,letterSpacing:"0.12em",fontWeight:200 }}>send a trace</span>
          </div>
          : phase === "idle" && sentTone ? <div style={{ display:"flex",flexDirection:"column",alignItems:"center",paddingBottom:20,gap:6 }}>
            <div style={{ width:7,height:7,borderRadius:"50%",background:TONES[sentTone]?TONES[sentTone].primary:"#555",boxShadow:"0 0 16px "+(TONES[sentTone]?TONES[sentTone].primary:"#555")+"77",animation:"gentlePulse 3s ease-in-out infinite" }} />
            <span style={{ color:(TONES[sentTone]?TONES[sentTone].primary:"#888")+"BB",fontSize:12,letterSpacing:"0.16em",fontWeight:200 }}>YOUR TRACE IS OUT THERE</span>
            {nudgeReady && !nudgeSent ? <div onClick={function() { setNudgeConfirm(true); }} style={{ marginTop:8,cursor:"pointer",padding:"8px 20px",borderRadius:16,border:"1px solid rgba(255,255,255,0.06)",background:"rgba(255,255,255,0.02)",animation:"fadeIn 1s ease" }}>
              <span style={{ color:"rgba(255,255,255,0.47)",fontSize:13,letterSpacing:"0.12em",fontWeight:200 }}>send a gentle reminder</span>
            </div> : null}
            {nudgeSent ? <div style={{ marginTop:8,animation:"fadeIn 0.5s ease" }}>
              <span style={{ color:"rgba(212,165,116,0.55)",fontSize:13,letterSpacing:"0.12em",fontWeight:200 }}>reminder sent</span>
            </div> : null}
          </div>
          : phase === "idle" && !canSend && contribs.length > 0 ? <div style={{ display:"flex",flexDirection:"column",alignItems:"center",paddingBottom:20,gap:6 }}>
            <span style={{ color:"rgba(255,255,255,0.4)",fontSize:12,letterSpacing:"0.14em",fontWeight:200 }}>waiting for your person</span>
            {turnNudgeReady && !turnNudgeSent ? <div onClick={function() { setTurnNudgeConfirm(true); }} style={{ marginTop:8,cursor:"pointer",padding:"8px 20px",borderRadius:16,border:"1px solid rgba(255,255,255,0.06)",background:"rgba(255,255,255,0.02)",animation:"fadeIn 1s ease" }}>
              <span style={{ color:"rgba(255,255,255,0.47)",fontSize:12,letterSpacing:"0.12em",fontWeight:200 }}>it's their turn · send a nudge</span>
            </div> : null}
            {turnNudgeSent ? <div style={{ marginTop:8,animation:"fadeIn 0.5s ease" }}>
              <span style={{ color:"rgba(212,165,116,0.55)",fontSize:12,letterSpacing:"0.12em",fontWeight:200 }}>nudge sent</span>
            </div> : null}
          </div>
          : phase === "idle" && !canSend ? <div style={{ display:"flex",flexDirection:"column",alignItems:"center",paddingBottom:20,gap:6 }}>
            <span style={{ color:"rgba(255,255,255,0.35)",fontSize:12,letterSpacing:"0.14em",fontWeight:200 }}>your trace is on its way</span>
          </div>
          : null}
          {/* Draw together button */}
          {/* Still-here hold area — idle with nothing to send */}
          {phase === "idle" && !canSend && !sentTone && stillHereReady && contribs.length > 0 ? <div style={{ display:"flex",flexDirection:"column",alignItems:"center",paddingBottom:20,gap:6,animation:"fadeIn 2s ease" }}>
            <div onPointerDown={startStillHereHold} onPointerUp={stopStillHereHold} onPointerLeave={stopStillHereHold}
              style={{ width:40,height:40,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",position:"relative" }}>
              {stillHereHold > 0 ? <svg width="40" height="40" style={{ position:"absolute",transform:"rotate(-90deg)" }}>
                <circle cx="20" cy="20" r="17" fill="none" stroke="rgba(212,165,116,0.3)" strokeWidth="2" strokeDasharray={Math.PI*34} strokeDashoffset={Math.PI*34*(1-stillHereHold)} strokeLinecap="round" />
              </svg> : null}
              <div style={{ width:6,height:6,borderRadius:"50%",background:"rgba(212,165,116,"+(0.2+stillHereHold*0.4)+")",boxShadow:"0 0 "+(8+stillHereHold*20)+"px rgba(212,165,116,"+(0.1+stillHereHold*0.3)+")" }} />
            </div>
            <span style={{ color:"rgba(255,255,255,0.4)",fontSize:13,letterSpacing:"0.12em",fontWeight:200 }}>hold to send your presence</span>
          </div> : null}
          {stillHereSent ? <div style={{ display:"flex",flexDirection:"column",alignItems:"center",paddingBottom:20,gap:6,animation:"fadeIn 0.5s ease" }}>
            <span style={{ color:"rgba(212,165,116,0.55)",fontSize:13,letterSpacing:"0.12em",fontWeight:200 }}>presence sent</span>
          </div> : null}
        </div>) : null}
    </div>
  );
}


// ══════════════════════════════════════
// INCOMING PARTNER MOMENT DISPLAY
// Shows whisper words, echo marks, or pulse gestures FROM the partner
// ══════════════════════════════════════
function IncomingMomentDisplay({ event, pair, onDismiss }) {
  var _a = useState(0), al = _a[0], sa = _a[1];
  var extra = event.extra_data || {};
  var rgb = event.tone && TONES[event.tone] ? TONES[event.tone].rgb.join(",") : "255,255,255";

  useEffect(function() {
    var s = Date.now();
    var dur = extra.whisper_word ? 8000 : extra.echo_mark ? 10000 : extra.amplified ? 10000 : extra.tone_resonance ? 4500 : 6000;
    var iv = setInterval(function() {
      var pr = (Date.now()-s)/dur;
      if (pr >= 1) { clearInterval(iv); onDismiss(); }
      else sa(pr<0.15?pr/0.15:pr>0.7?1-(pr-0.7)/0.3:1);
    }, 30);
    return function() { clearInterval(iv); };
  }, [onDismiss, extra]);

  // Whisper word from partner
  if (extra.whisper_word) {
    return <div style={{ position:"absolute",top:"38%",left:0,right:0,textAlign:"center",zIndex:38,pointerEvents:"none",fontFamily:FONT }}>
      <div style={{ marginBottom:12,color:"rgba(255,255,255,"+(al*0.18)+")",fontSize:13,letterSpacing:"0.3em",fontWeight:200 }}>A WHISPER FROM YOUR PERSON</div>
      <span style={{ fontSize:30,fontWeight:200,letterSpacing:"0.35em",color:"rgba("+rgb+","+(al*0.7)+")",textShadow:"0 0 35px rgba("+rgb+","+(al*0.25)+")" }}>{extra.whisper_word}</span>
    </div>;
  }

  // Tone resonance — silent visual pulse, no text
  if (extra.tone_resonance) {
    return <div style={{ position:"absolute",inset:0,zIndex:38,pointerEvents:"none",display:"flex",alignItems:"center",justifyContent:"center" }}>
      {[0,1,2].map(function(i) { return <div key={i} style={{ position:"absolute",width:(80+i*60)*al,height:(80+i*60)*al,borderRadius:"50%",background:"radial-gradient(circle, rgba("+rgb+","+(al*0.12/(i+1))+") 0%, transparent 70%)" }} />; })}
    </div>;
  }

  // Echo mark from partner
  if (extra.echo_mark) {
    return <div style={{ position:"absolute",top:"30%",left:"50%",transform:"translate(-50%,-50%)",zIndex:38,pointerEvents:"none",fontFamily:FONT,textAlign:"center" }}>
      <div style={{ marginBottom:12,color:"rgba(255,255,255,"+(al*0.18)+")",fontSize:13,letterSpacing:"0.3em",fontWeight:200 }}>A MARK LEFT FOR YOU</div>
      <span style={{ fontSize:42,color:"rgba("+rgb+","+(al*0.5)+")",textShadow:"0 0 25px rgba("+rgb+","+(al*0.15)+")" }}>{extra.echo_mark}</span>
    </div>;
  }

  // Amplified reveal — the sender finds out their trace had weight
  return <div style={{ position:"absolute",top:"38%",left:0,right:0,textAlign:"center",zIndex:38,pointerEvents:"none",fontFamily:FONT }}>
    <div style={{ width:5,height:5,borderRadius:"50%",background:"rgba("+rgb+","+(al*0.6)+")",boxShadow:"0 0 28px rgba("+rgb+","+(al*0.3)+")",margin:"0 auto 16px",animation:"gentlePulse 2s ease-in-out infinite" }} />
    <div style={{ color:"rgba(255,255,255,"+(al*0.18)+")",fontSize:11,letterSpacing:"0.35em",fontWeight:200,marginBottom:10 }}>YOUR TRACE REACHED THEM</div>
    <span style={{ color:"rgba("+rgb+","+(al*0.5)+")",fontSize:14,letterSpacing:"0.18em",fontWeight:200 }}>they stayed with yours</span>
  </div>;
}


// ══════════════════════════════════════
// PWA INSTALL PROMPT
// Shows once after first trace exchange — persisted in localStorage
// For iOS guests: shows recovery code step first
// beforeinstallprompt captured early in main.jsx (window.__deferredInstallPrompt)
// ══════════════════════════════════════
function InstallPrompt({ traceCount, user, guest, onOpenEmail }) {
  var _s = useState(false), show = _s[0], setShow = _s[1];
  var _dip = useState(null), deferredPrompt = _dip[0], setDeferredPrompt = _dip[1];
  // iOS guests see recovery step first, then install steps
  var _step = useState("check"), step = _step[0], setStep = _step[1]; // check | install
  var _recTok = useState(null), recTok = _recTok[0], setRecTok = _recTok[1];
  var _genning = useState(false), genning = _genning[0], setGenning = _genning[1];

  var isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);

  useEffect(function() {
    if (traceCount < 1) return;
    var isStandalone = window.matchMedia("(display-mode: standalone)").matches
      || window.navigator.standalone === true;
    if (isStandalone) return;
    try { if (localStorage.getItem("resona_install_dismissed")) return; } catch(e) {}

    if (window.__deferredInstallPrompt) setDeferredPrompt(window.__deferredInstallPrompt);
    var handler = function(e) { e.preventDefault(); setDeferredPrompt(e); window.__deferredInstallPrompt = e; };
    window.addEventListener("beforeinstallprompt", handler);

    // Load existing recovery token for the check step (iOS guests only)
    if (isIOS && guest && user) {
      getRecoveryToken(user.id).then(function(tok) { setRecTok(tok || ""); }).catch(function() { setRecTok(""); });
    }

    var t = setTimeout(function() { setShow(true); }, 3000);
    return function() { clearTimeout(t); window.removeEventListener("beforeinstallprompt", handler); };
  }, [traceCount]);

  var dismiss = useCallback(function() {
    setShow(false);
    try { localStorage.setItem("resona_install_dismissed", "1"); } catch(e) {}
  }, []);

  var install = useCallback(function() {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then(function() {
        setShow(false);
        try { localStorage.setItem("resona_install_dismissed", "1"); } catch(e) {}
      });
    }
  }, [deferredPrompt]);

  var canNativeInstall = !!deferredPrompt;

  if (!show) return null;

  // iOS guests: show recovery/email step before install instructions
  var needsRecoveryStep = isIOS && guest && step === "check";

  var cardStyle = { pointerEvents:"auto",maxWidth:320,padding:"28px 24px",borderRadius:20,background:"rgba(17,17,24,0.97)",border:"1px solid rgba(255,255,255,0.08)",fontFamily:FONT,textAlign:"center",animation:"fadeIn 0.8s ease",backdropFilter:"blur(12px)",WebkitBackdropFilter:"blur(12px)" };

  return <div style={{ position:"absolute",inset:0,zIndex:56,display:"flex",alignItems:"center",justifyContent:"center",pointerEvents:"none" }}>
    <div style={cardStyle}>

      {/* ── iOS guest: save account before installing ── */}
      {needsRecoveryStep ? (
        <div>
          <div style={{ width:4,height:4,borderRadius:"50%",background:"rgba(212,165,116,0.5)",margin:"0 auto 16px" }} />
          <div style={{ color:"rgba(255,255,255,0.58)",fontSize:13,letterSpacing:"0.15em",fontWeight:300,marginBottom:12 }}>Before you install</div>
          <div style={{ color:"rgba(255,255,255,0.5)",fontSize:12,fontWeight:200,lineHeight:1.8,marginBottom:20 }}>
            When you add Resona to your home screen, it opens as a separate app. Without a saved account, your space and pairing won't carry over.
          </div>
          {recTok === null ? (
            <div style={{ color:"rgba(255,255,255,0.3)",fontSize:12,marginBottom:20 }}>loading…</div>
          ) : recTok ? (
            <div style={{ background:"rgba(212,165,116,0.06)",border:"1px solid rgba(212,165,116,0.15)",borderRadius:12,padding:"12px 16px",marginBottom:20 }}>
              <div style={{ color:"rgba(255,255,255,0.4)",fontSize:11,letterSpacing:"0.1em",marginBottom:6 }}>YOUR RECOVERY CODE</div>
              <div style={{ color:"rgba(212,165,116,0.85)",fontSize:22,fontWeight:300,letterSpacing:"0.35em",marginBottom:8 }}>{recTok}</div>
              <div style={{ color:"rgba(255,255,255,0.35)",fontSize:11,fontWeight:200,lineHeight:1.6 }}>Write this down — you can use it to recover your space if you lose access.</div>
            </div>
          ) : (
            <div style={{ marginBottom:20 }}>
              <div style={{ color:"rgba(255,255,255,0.4)",fontSize:12,fontWeight:200,lineHeight:1.7,marginBottom:12 }}>Save a recovery code or link your email first.</div>
              <div onClick={async function() {
                if (!user) return;
                setGenning(true);
                try { var tok = await generateRecoveryToken(user.id); setRecTok(tok); } catch(e) {}
                setGenning(false);
              }} style={{ cursor:"pointer",color:"rgba(212,165,116,0.7)",fontSize:13,fontWeight:300,marginBottom:10,letterSpacing:"0.05em" }}>
                {genning ? "generating…" : "Generate Recovery Code"}
              </div>
              <div style={{ color:"rgba(255,255,255,0.25)",fontSize:11,fontWeight:200 }}>or</div>
              <div onClick={function() { dismiss(); if (onOpenEmail) onOpenEmail(); }} style={{ cursor:"pointer",color:"rgba(212,165,116,0.5)",fontSize:12,fontWeight:200,marginTop:6,letterSpacing:"0.05em" }}>Link Email Instead</div>
            </div>
          )}
          <div style={{ display:"flex",gap:12,justifyContent:"center" }}>
            <div onClick={dismiss} style={{ padding:"10px 18px",borderRadius:20,border:"1px solid rgba(255,255,255,0.06)",cursor:"pointer",color:"rgba(255,255,255,0.35)",fontSize:12,fontWeight:200 }}>later</div>
            <div onClick={function() { setStep("install"); }} style={{ padding:"10px 18px",borderRadius:20,border:"1px solid rgba(212,165,116,0.2)",background:"rgba(212,165,116,0.06)",cursor:"pointer",color:"rgba(212,165,116,0.7)",fontSize:12,fontWeight:300 }}>Continue →</div>
          </div>
        </div>

      /* ── Android: native install prompt ── */
      ) : canNativeInstall ? (
        <div>
          <div style={{ color:"rgba(255,255,255,0.57)",fontSize:13,letterSpacing:"0.15em",fontWeight:300,marginBottom:14 }}>Add to Home Screen</div>
          <div style={{ color:"rgba(255,255,255,0.5)",fontSize:12,fontWeight:200,lineHeight:1.8,marginBottom:20 }}>Add Resona to your home screen for full-screen mode and push notifications.</div>
          <div style={{ display:"flex",gap:12,justifyContent:"center" }}>
            <div onClick={dismiss} style={{ padding:"10px 20px",borderRadius:20,border:"1px solid rgba(255,255,255,0.06)",cursor:"pointer",color:"rgba(255,255,255,0.45)",fontSize:12,fontWeight:200 }}>not now</div>
            <div onClick={install} style={{ padding:"10px 20px",borderRadius:20,border:"1px solid rgba(212,165,116,0.2)",background:"rgba(212,165,116,0.06)",cursor:"pointer",color:"rgba(212,165,116,0.7)",fontSize:12,fontWeight:300 }}>Add</div>
          </div>
        </div>

      /* ── iOS: step-by-step instructions ── */
      ) : isIOS ? (
        <div>
          <div style={{ color:"rgba(255,255,255,0.57)",fontSize:13,letterSpacing:"0.15em",fontWeight:300,marginBottom:16 }}>Add to Home Screen</div>
          <div style={{ color:"rgba(196,30,58,0.65)",fontSize:12,fontWeight:300,lineHeight:1.7,marginBottom:16,background:"rgba(196,30,58,0.06)",border:"1px solid rgba(196,30,58,0.15)",borderRadius:10,padding:"10px 14px" }}>
            Push notifications on iPhone only work when the app is installed — not in the browser.
          </div>
          <div style={{ textAlign:"left",marginBottom:20 }}>
            <div style={{ display:"flex",gap:10,alignItems:"flex-start",marginBottom:10 }}>
              <span style={{ color:"rgba(212,165,116,0.6)",fontSize:12,fontWeight:300,minWidth:16 }}>1.</span>
              <span style={{ color:"rgba(255,255,255,0.5)",fontSize:12,fontWeight:200,lineHeight:1.7 }}>Open this page in <strong style={{ color:"rgba(255,255,255,0.6)",fontWeight:300 }}>Safari</strong> (not Chrome)</span>
            </div>
            <div style={{ display:"flex",gap:10,alignItems:"flex-start",marginBottom:10 }}>
              <span style={{ color:"rgba(212,165,116,0.6)",fontSize:12,fontWeight:300,minWidth:16 }}>2.</span>
              <span style={{ color:"rgba(255,255,255,0.5)",fontSize:12,fontWeight:200,lineHeight:1.7 }}>Tap the <strong style={{ color:"rgba(255,255,255,0.6)",fontWeight:300 }}>Share</strong> button <span style={{ fontSize:14,verticalAlign:"middle" }}>{"\u2B06\uFE0E"}</span> at the bottom of the screen</span>
            </div>
            <div style={{ display:"flex",gap:10,alignItems:"flex-start",marginBottom:10 }}>
              <span style={{ color:"rgba(212,165,116,0.6)",fontSize:12,fontWeight:300,minWidth:16 }}>3.</span>
              <span style={{ color:"rgba(255,255,255,0.5)",fontSize:12,fontWeight:200,lineHeight:1.7 }}>Scroll down and tap <strong style={{ color:"rgba(212,165,116,0.7)",fontWeight:300 }}>Add to Home Screen</strong></span>
            </div>
            <div style={{ display:"flex",gap:10,alignItems:"flex-start" }}>
              <span style={{ color:"rgba(212,165,116,0.6)",fontSize:12,fontWeight:300,minWidth:16 }}>4.</span>
              <span style={{ color:"rgba(255,255,255,0.5)",fontSize:12,fontWeight:200,lineHeight:1.7 }}>Tap <strong style={{ color:"rgba(255,255,255,0.6)",fontWeight:300 }}>Add</strong> — then open from your home screen</span>
            </div>
          </div>
          <div onClick={dismiss} style={{ padding:"10px 24px",borderRadius:20,border:"1px solid rgba(255,255,255,0.08)",cursor:"pointer",color:"rgba(255,255,255,0.5)",fontSize:12,fontWeight:200,display:"inline-block" }}>Got it</div>
        </div>

      /* ── Other browsers ── */
      ) : (
        <div>
          <div style={{ color:"rgba(255,255,255,0.57)",fontSize:13,letterSpacing:"0.15em",fontWeight:300,marginBottom:14 }}>Add to Home Screen</div>
          <div style={{ color:"rgba(255,255,255,0.5)",fontSize:12,fontWeight:200,lineHeight:1.8,marginBottom:20 }}>Add Resona to your home screen for full-screen mode and push notifications.</div>
          <div onClick={dismiss} style={{ padding:"10px 20px",borderRadius:20,border:"1px solid rgba(255,255,255,0.06)",cursor:"pointer",color:"rgba(255,255,255,0.5)",fontSize:12,fontWeight:200,display:"inline-block" }}>Got it</div>
        </div>
      )}

    </div>
  </div>;
}


// ══════════════════════════════════════
// CONFIRM OVERLAY — reusable confirmation dialog
// ══════════════════════════════════════
function ConfirmOverlay({ title, text, confirmLabel, cancelLabel, confirmColor, onConfirm, onCancel }) {
  var cc = confirmColor || "255,255,255";
  var cl = cancelLabel || "CANCEL";
  return <div style={{ position:"absolute",inset:0,zIndex:50,background:"rgba(6,6,12,0.97)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",fontFamily:FONT,animation:"fadeIn 0.6s ease" }}>
    <div style={{ width:2,height:2,borderRadius:"50%",background:"rgba("+cc+",0.4)",marginBottom:30 }} />
    <div style={{ color:"rgba(255,255,255,0.6)",fontSize:13,letterSpacing:"0.3em",fontWeight:200,marginBottom:14 }}>{title}</div>
    <div style={{ color:"rgba(255,255,255,0.58)",fontSize:13,fontWeight:200,letterSpacing:"0.06em",lineHeight:1.9,textAlign:"center",whiteSpace:"pre-line",marginBottom:40 }}>{text}</div>
    <div style={{ display:"flex",gap:16 }}>
      <div onClick={onCancel} style={{ padding:"14px 28px",borderRadius:24,border:"1px solid rgba(255,255,255,0.06)",cursor:"pointer",color:"rgba(255,255,255,0.63)",fontSize:13,letterSpacing:"0.15em",fontWeight:200 }}>{cl}</div>
      <div onClick={onConfirm} style={{ padding:"14px 28px",borderRadius:24,border:"1px solid rgba("+cc+",0.2)",background:"rgba("+cc+",0.05)",cursor:"pointer",color:"rgba("+cc+",0.7)",fontSize:13,letterSpacing:"0.15em",fontWeight:300 }}>{confirmLabel}</div>
    </div>
  </div>;
}


// ══════════════════════════════════════
// SUB-COMPONENTS
// ══════════════════════════════════════

function MomentIntro({ rgb, label, onDone }) {
  var _a = useState(0), al = _a[0], sa = _a[1];
  useEffect(function() { var s = Date.now(); var iv = setInterval(function() { var pr = (Date.now()-s)/2200; if (pr >= 1) { clearInterval(iv); onDone(); } else sa(pr<0.3?pr/0.3:pr>0.7?1-(pr-0.7)/0.3:1); }, 20); return function() { clearInterval(iv); }; }, [onDone]);
  return <div style={{ position:"absolute",inset:0,zIndex:44,display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(6,6,12,"+(al*0.85)+")",fontFamily:FONT,pointerEvents:"none" }}><div style={{ textAlign:"center" }}><div style={{ width:3,height:3,borderRadius:"50%",background:"rgba("+rgb+","+(al*0.8)+")",boxShadow:"0 0 30px rgba("+rgb+","+(al*0.4)+")",margin:"0 auto 16px" }} /><div style={{ color:"rgba("+rgb+","+(al*0.5)+")",fontSize:12,letterSpacing:"0.3em",fontWeight:200 }}>{label}</div></div></div>;
}

function ToneAwakeningOverlay({ tones, onDone }) {
  var _a = useState(0), al = _a[0], sa = _a[1];
  useEffect(function() {
    var start = Date.now(), dur = 4000, af;
    function tick() {
      var pr = (Date.now() - start) / dur;
      if (pr >= 1) { onDone(); return; }
      sa(pr < 0.2 ? pr / 0.2 : pr > 0.7 ? 1 - (pr - 0.7) / 0.3 : 1);
      af = requestAnimationFrame(tick);
    }
    af = requestAnimationFrame(tick);
    return function() { cancelAnimationFrame(af); };
  }, [onDone]);
  return <div style={{ position:"absolute",bottom:120,left:0,right:0,zIndex:12,pointerEvents:"none",display:"flex",flexDirection:"column",alignItems:"center",gap:8,fontFamily:FONT,opacity:al }}>
    <div style={{ display:"flex",gap:14 }}>
      {tones.map(function(k) { return <div key={k} style={{ width:36,height:36,borderRadius:"50%",background:"radial-gradient(circle at 36% 36%,"+TONES[k].colors[0]+","+TONES[k].colors[1]+")",boxShadow:"0 0 28px "+TONES[k].primary+"66" }} />; })}
    </div>
    {tones.map(function(k) { return <div key={k} style={{ color:TONES[k].primary,fontSize:12,letterSpacing:"0.2em",fontWeight:200,opacity:0.7 }}>{TONES[k].name}</div>; })}
  </div>;
}

function ToneResonanceMoment({ rgb, tone, onDone }) {
  var cvRef = useRef(null);
  useEffect(function() {
    var c = cvRef.current; if (!c) return;
    var ctx = c.getContext("2d"), dpr = window.devicePixelRatio || 1;
    var rect = c.getBoundingClientRect();
    c.width = rect.width * dpr; c.height = rect.height * dpr; ctx.scale(dpr, dpr);
    var w = rect.width, h = rect.height;
    var start = Date.now(), dur = 4500, af;
    function draw() {
      var pr = Math.min(1, (Date.now() - start) / dur);
      var a = pr < 0.2 ? pr / 0.2 : pr > 0.65 ? 1 - (pr - 0.65) / 0.35 : 1;
      ctx.clearRect(0, 0, w, h);
      var cx = w / 2, cy = h / 2;
      for (var i = 0; i < 3; i++) {
        var r = (80 + i * 60) * a;
        var ga = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
        ga.addColorStop(0, "rgba(" + rgb + "," + (a * 0.18 / (i + 1)) + ")");
        ga.addColorStop(1, "transparent");
        ctx.fillStyle = ga; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
      }
      if (pr < 1) af = requestAnimationFrame(draw); else onDone();
    }
    af = requestAnimationFrame(draw);
    return function() { cancelAnimationFrame(af); };
  }, [rgb, onDone]);
  return <div style={{ position:"absolute",inset:0,zIndex:44,pointerEvents:"none" }}>
    <canvas ref={cvRef} style={{ position:"absolute",inset:0,width:"100%",height:"100%" }} />
  </div>;
}

function WhisperPickerUI({ rgb, onSelect, onTimeout }) {
  var _t = useState(15), tm = _t[0], st = _t[1];
  var words = useRef(pickN(WHISPER_POOL, 5));
  useEffect(function() { var iv = setInterval(function() { st(function(t) { if (t <= 1) { onTimeout(); return 0; } return t-1; }); }, 1000); return function() { clearInterval(iv); }; }, [onTimeout]);
  return <div style={{ position:"absolute",inset:0,zIndex:45,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",background:"rgba(6,6,12,0.93)",fontFamily:FONT,animation:"fadeIn 0.8s ease" }}>
    <div style={{ color:"rgba(255,255,255,0.58)",fontSize:13,letterSpacing:"0.3em",fontWeight:200,marginBottom:8 }}>TWIN CONNECTION</div>
    <div style={{ color:"rgba("+rgb+",0.6)",fontSize:14,letterSpacing:"0.2em",fontWeight:300,marginBottom:36 }}>choose a whisper for your person</div>
    <div style={{ display:"flex",flexDirection:"column",gap:16,alignItems:"center" }}>
      {words.current.map(function(w) { return <div key={w} onClick={function() { onSelect(w); }} style={{ padding:"14px 44px",cursor:"pointer",borderRadius:24,border:"1px solid rgba("+rgb+",0.15)",background:"rgba("+rgb+",0.04)",fontSize:17,fontWeight:200,letterSpacing:"0.25em",color:"rgba("+rgb+",0.6)",transition:"all 0.3s" }}>{w}</div>; })}
    </div>
    <div style={{ marginTop:32,color:"rgba(255,255,255,0.52)",fontSize:13,fontWeight:200 }}>{tm}s</div>
  </div>;
}

function WhisperDisplayUI({ word, rgb, onDone }) {
  var _a = useState(0), al = _a[0], sa = _a[1];
  useEffect(function() { var s = Date.now(); var iv = setInterval(function() { var pr = (Date.now()-s)/4000; if (pr >= 1) { clearInterval(iv); onDone(); } else sa(pr<0.15?pr/0.15:pr>0.7?1-(pr-0.7)/0.3:1); }, 30); return function() { clearInterval(iv); }; }, [onDone]);
  return <div style={{ position:"absolute",top:"38%",left:0,right:0,textAlign:"center",zIndex:38,pointerEvents:"none",fontFamily:FONT }}>
    <div style={{ marginBottom:10,color:"rgba(255,255,255,"+(al*0.15)+")",fontSize:13,letterSpacing:"0.25em",fontWeight:200 }}>SENT TO YOUR PERSON</div>
    <span style={{ fontSize:30,fontWeight:200,letterSpacing:"0.35em",color:"rgba("+rgb+","+(al*0.7)+")",textShadow:"0 0 35px rgba("+rgb+","+(al*0.25)+")" }}>{word}</span>
  </div>;
}

function EchoMarkPickerUI({ rgb, onSelect, onTimeout }) {
  var _t = useState(15), tm = _t[0], st = _t[1];
  var marks = useRef(pickN(ECHO_POOL, 5));
  useEffect(function() { var iv = setInterval(function() { st(function(t) { if (t <= 1) { onTimeout(); return 0; } return t-1; }); }, 1000); return function() { clearInterval(iv); }; }, [onTimeout]);
  return <div style={{ position:"absolute",inset:0,zIndex:45,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",background:"rgba(6,6,12,0.93)",fontFamily:FONT,animation:"fadeIn 0.8s ease" }}>
    <div style={{ color:"rgba(255,255,255,0.58)",fontSize:13,letterSpacing:"0.3em",fontWeight:200,marginBottom:8 }}>TRACES CONVERGED</div>
    <div style={{ color:"rgba("+rgb+",0.6)",fontSize:14,letterSpacing:"0.2em",fontWeight:300,marginBottom:36 }}>leave a mark for your person</div>
    <div style={{ display:"flex",gap:22 }}>{marks.current.map(function(m) { return <div key={m.n} onClick={function() { onSelect(m); }} style={{ width:64,height:64,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",borderRadius:"50%",border:"1px solid rgba("+rgb+",0.15)",background:"rgba("+rgb+",0.04)",fontSize:24,color:"rgba("+rgb+",0.6)",transition:"all 0.3s" }}>{m.g}</div>; })}</div>
    <div style={{ marginTop:32,color:"rgba(255,255,255,0.52)",fontSize:13,fontWeight:200 }}>{tm}s</div>
  </div>;
}

function EchoMarkDisplayUI({ mark, rgb, onDone }) {
  var _a = useState(0), al = _a[0], sa = _a[1];
  useEffect(function() { var s = Date.now(); var iv = setInterval(function() { var pr = (Date.now()-s)/4000; if (pr >= 1) { clearInterval(iv); onDone(); } else sa(pr<0.1?pr/0.1:1-(pr-0.1)/0.9); }, 100); return function() { clearInterval(iv); }; }, [onDone]);
  return <div style={{ position:"absolute",top:"28%",left:"50%",transform:"translate(-50%,-50%)",zIndex:9,pointerEvents:"none",fontFamily:FONT,textAlign:"center" }}>
    <div style={{ marginBottom:10,color:"rgba(255,255,255,"+(al*0.15)+")",fontSize:13,letterSpacing:"0.25em",fontWeight:200 }}>YOUR MARK</div>
    <span style={{ fontSize:42,color:"rgba("+rgb+","+(al*0.35)+")",textShadow:"0 0 25px rgba("+rgb+","+(al*0.12)+")" }}>{mark.g}</span>
  </div>;
}

// ══════════════════════════════════════
// SHARED CANVAS — synchronous drawing for two
// ══════════════════════════════════════
function SharedCanvasUI({ myTone, partnerTone, partnerStrokes, timer, channelRef, userId, onStrokesUpdate, frozen }) {
  var cvRef = useRef(null);
  var drawing = useRef(false);
  var localPath = useRef([]);
  var allPartner = useRef([]);

  useEffect(function() { allPartner.current = partnerStrokes; }, [partnerStrokes]);

  // Send strokes batch every 50ms
  var sendBatchRef = useRef(null);
  var pendingBatch = useRef([]);
  useEffect(function() {
    sendBatchRef.current = setInterval(function() {
      if (pendingBatch.current.length > 0 && channelRef.current) {
        sendCanvasBroadcast(channelRef.current, "stroke", { userId: userId, points: pendingBatch.current });
        pendingBatch.current = [];
      }
    }, 50);
    return function() { clearInterval(sendBatchRef.current); };
  }, [userId, channelRef]);

  var oD = useCallback(function(ev) {
    if (frozen) return;
    var r = ev.currentTarget.getBoundingClientRect();
    var pt = { x: (ev.clientX-r.left)/r.width, y: (ev.clientY-r.top)/r.height, t: Date.now() };
    localPath.current.push(pt);
    pendingBatch.current.push(pt);
    onStrokesUpdate(localPath.current);
    drawing.current = true;
  }, [onStrokesUpdate]);

  var oM = useCallback(function(ev) {
    if (!drawing.current || frozen) return;
    var r = ev.currentTarget.getBoundingClientRect();
    var pt = { x: (ev.clientX-r.left)/r.width, y: (ev.clientY-r.top)/r.height, t: Date.now() };
    localPath.current.push(pt);
    pendingBatch.current.push(pt);
  }, []);

  var oU = useCallback(function() {
    drawing.current = false;
    onStrokesUpdate(localPath.current);
    // Break between strokes
    localPath.current.push(null);
    pendingBatch.current.push(null);
  }, [onStrokesUpdate]);

  // Render loop
  useEffect(function() {
    var c = cvRef.current; if (!c) return;
    var ctx = c.getContext("2d"), dpr = window.devicePixelRatio || 1;
    var rect = c.getBoundingClientRect();
    c.width = rect.width * dpr; c.height = rect.height * dpr; ctx.scale(dpr, dpr);
    var w = rect.width, h = rect.height, af;
    var myCol = TONES[myTone] || TONES.nearness;
    var partCol = TONES[partnerTone] || TONES.warmth;

    function drawPath(points, cols, alpha) {
      if (!points || points.length < 1) return;
      ctx.lineCap = "round"; ctx.lineJoin = "round";
      ctx.globalAlpha = alpha; ctx.globalCompositeOperation = "screen";
      var segment = [];
      for (var i = 0; i < points.length; i++) {
        if (points[i] === null) { segment = []; continue; }
        segment.push(points[i]);
        if (segment.length > 1) {
          var p0 = segment[segment.length-2], p1 = segment[segment.length-1];
          ctx.beginPath(); ctx.moveTo(p0.x*w, p0.y*h); ctx.lineTo(p1.x*w, p1.y*h);
          ctx.strokeStyle = cols.colors[1] + "44"; ctx.lineWidth = 12; ctx.stroke();
          ctx.beginPath(); ctx.moveTo(p0.x*w, p0.y*h); ctx.lineTo(p1.x*w, p1.y*h);
          ctx.strokeStyle = cols.colors[0]; ctx.lineWidth = 3; ctx.stroke();
        }
      }
      ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";
    }

    function frame() {
      ctx.fillStyle = "#0A0A12"; ctx.fillRect(0, 0, w, h);
      drawPath(localPath.current, myCol, 0.7);
      drawPath(allPartner.current, partCol, 0.6);
      af = requestAnimationFrame(frame);
    }
    af = requestAnimationFrame(frame);
    return function() { cancelAnimationFrame(af); };
  }, [myTone, partnerTone]);

  var timerColor = frozen ? "rgba(212,165,116,0.7)" : timer <= 5 ? "rgba(212,165,116,0.7)" : "rgba(255,255,255,0.4)";
  var timerGlow = timer <= 5 ? "0 0 20px rgba(212,165,116,0.3)" : "none";

  return <div style={{ position:"absolute",inset:0,zIndex:46,background:"#0A0A12",fontFamily:FONT }}>
    <div style={{ position:"absolute",top:20,left:0,right:0,textAlign:"center",zIndex:1,pointerEvents:"none" }}>
      <span style={{ color:timerColor,fontSize:20,fontWeight:200,letterSpacing:"0.15em",textShadow:timerGlow }}>{frozen ? "" : "0:" + (timer < 10 ? "0" + timer : timer)}</span>
    </div>
    <div style={{ position:"absolute",top:50,left:0,right:0,textAlign:"center",zIndex:1,pointerEvents:"none" }}>
      <span style={{ color:"rgba(255,255,255,0.4)",fontSize:12,letterSpacing:"0.2em",fontWeight:200 }}>drawing together</span>
    </div>
    <div style={{ position:"absolute",inset:0,touchAction:"none",cursor:"crosshair" }} onPointerDown={oD} onPointerMove={oM} onPointerUp={oU} onPointerLeave={oU}>
      <canvas ref={cvRef} style={{ width:"100%",height:"100%" }} />
    </div>
  </div>;
}



function RevealCanvas({ tone, path, amplified, pulseGesture, onDone }) {
  var ref = useRef(null);
  useEffect(function() {
    var c = ref.current; if (!c) return;
    var ctx = c.getContext("2d"), dpr = window.devicePixelRatio || 1, rect = c.getBoundingClientRect();
    c.width = rect.width * dpr; c.height = rect.height * dpr; ctx.scale(dpr, dpr);
    var w = rect.width, h = rect.height, cols = TONES[tone] ? TONES[tone].colors : ["#888","#aaa","#ccc"];
    var dur = amplified ? 9000 : 5500, sc = amplified ? 1.6 : 1, start = Date.now(), af;
    function draw() {
      var pr = Math.min(1,(Date.now()-start)/dur), fi = Math.min(1,pr*2.2), fo = pr>0.75?1-(pr-0.75)/0.25:1, a = fi*fo;
      ctx.clearRect(0,0,w,h); ctx.fillStyle = "rgba(6,6,12,"+(amplified?0.95:0.84)*a+")"; ctx.fillRect(0,0,w,h);
      if (path && path.length > 1) {
        var cnt = Math.floor(path.length * Math.min(1, pr*(amplified?1.0:1.5)));
        if (amplified) { ctx.beginPath(); ctx.lineWidth=35*a; ctx.lineCap="round"; ctx.lineJoin="round"; ctx.strokeStyle=cols[0]+hex2(a*20); for(var i=0;i<cnt;i++){var pt=path[i];i===0?ctx.moveTo(pt.x*w,pt.y*h):ctx.lineTo(pt.x*w,pt.y*h);}ctx.stroke(); }
        [[14*sc,28],[5.5*sc,175],[2.2,235]].forEach(function(l,li){ctx.beginPath();ctx.lineWidth=l[0]*a;ctx.lineCap="round";ctx.lineJoin="round";ctx.strokeStyle=cols[li]+hex2(a*l[1]);for(var i2=0;i2<cnt;i2++){var pt2=path[i2];i2===0?ctx.moveTo(pt2.x*w,pt2.y*h):ctx.lineTo(pt2.x*w,pt2.y*h);}ctx.stroke();});
        if(cnt>0){var hd=path[Math.min(cnt-1,path.length-1)];var grd=ctx.createRadialGradient(hd.x*w,hd.y*h,0,hd.x*w,hd.y*h,60*sc);grd.addColorStop(0,cols[0]+hex2(a*165));grd.addColorStop(1,"transparent");ctx.fillStyle=grd;ctx.beginPath();ctx.arc(hd.x*w,hd.y*h,60*sc,0,Math.PI*2);ctx.fill();}
        if(pr>0.3){var bp=(pr-0.3)/0.7,mid=path[Math.floor(path.length/2)],count=amplified?60:24;for(var i3=0;i3<count;i3++){var ang=(i3/count)*Math.PI*2+pr*2,rad=bp*120*sc*(1+Math.sin(i3*1.1)*0.3);ctx.fillStyle=cols[i3%3]+hex2(a*0.3*(1-bp*0.4)*255);ctx.beginPath();ctx.arc(mid.x*w+Math.cos(ang)*rad,mid.y*h+Math.sin(ang)*rad,amplified?3.5:2,0,Math.PI*2);ctx.fill();}}
        if(pulseGesture&&pulseGesture.length>1&&pr>0.3){ctx.globalAlpha=Math.min(1,(pr-0.3)/0.3)*fo*0.45;ctx.beginPath();ctx.strokeStyle="rgba(255,255,255,0.5)";ctx.lineWidth=2;ctx.lineCap="round";pulseGesture.forEach(function(pt,i){i===0?ctx.moveTo(pt.x*w,pt.y*h):ctx.lineTo(pt.x*w,pt.y*h);});ctx.stroke();ctx.globalAlpha=1;}
      }
      ctx.textAlign="center";ctx.fillStyle="rgba(255,255,255,"+(0.4*a)+")";ctx.font="italic 300 20px "+FONT;ctx.fillText(TONES[tone]?TONES[tone].name:"",w/2,h-42);
      if(amplified){ctx.fillStyle="rgba(255,255,255,"+(0.25*a)+")";ctx.font="200 9px "+FONT;ctx.fillText("A M P L I F I E D",w/2,h-24);}
      if(pr<1)af=requestAnimationFrame(draw);else setTimeout(onDone,300);
    }
    af=requestAnimationFrame(draw);return function(){cancelAnimationFrame(af);};
  }, [tone, path, amplified, pulseGesture, onDone]);
  return <canvas ref={ref} style={{ position:"absolute",inset:0,width:"100%",height:"100%",zIndex:30,pointerEvents:"none" }} />;
}

function GlimpseWrapper({ contribs, onDone }) {
  var _t = useState(false), tappable = _t[0], setTappable = _t[1];
  useEffect(function() {
    var t = setTimeout(function() { setTappable(true); }, 1000);
    return function() { clearTimeout(t); };
  }, []);
  return <div onClick={tappable ? onDone : undefined} style={{ position:"absolute",inset:0,zIndex:34,cursor:tappable?"pointer":"default" }}>
    <GlimpseCanvas contribs={contribs} onDone={onDone} />
  </div>;
}

function GlimpseCanvas({ contribs, onDone }) {
  var ref = useRef(null), textRef = useRef(pick(GLIMPSE_TEXTS));
  useEffect(function() {
    var c = ref.current; if (!c) return;
    var ctx = c.getContext("2d"), dpr = window.devicePixelRatio || 1, rect = c.getBoundingClientRect();
    c.width = rect.width * dpr; c.height = rect.height * dpr; ctx.scale(dpr, dpr);
    var w = rect.width, h = rect.height, cx = w/2, cy = h/2, start = Date.now(), af, gt = textRef.current;
    var n = contribs.length;
    var dur = n <= 10 ? 6000 : n <= 30 ? 8000 : n <= 60 ? 11000 : n <= 100 ? 14000 : 18000;
    function draw() {
      try {
      var pr = Math.min(1,(Date.now()-start)/dur), fi = Math.min(1,pr*3), fo = pr>0.75?1-(pr-0.75)/0.25:1, a = fi*fo;
      ctx.clearRect(0,0,w,h); ctx.fillStyle = "rgba(6,6,12,"+(0.93*a)+")"; ctx.fillRect(0,0,w,h);
      var baseR = n<=2?0.34:n<=10?0.42:n<=30?0.50:n<=60?0.56:0.62;
      var vr = Math.min(w,h)*baseR*a;
      if(vr<2){if(pr>=1)setTimeout(onDone,200);else af=requestAnimationFrame(draw);return;}
      ctx.save();ctx.beginPath();ctx.arc(cx,cy,vr,0,Math.PI*2);ctx.clip();
      drawArtwork(ctx, contribs, w, h, Math.min(1, a * 1.4));
      ctx.globalAlpha=1;ctx.globalCompositeOperation="source-over";ctx.restore();
      } catch(e) { console.error("GlimpseCanvas draw error:", e); }
      var eg=ctx.createRadialGradient(cx,cy,vr*0.6,cx,cy,vr*1.12);eg.addColorStop(0,"transparent");eg.addColorStop(1,"rgba(6,6,12,"+a+")");ctx.fillStyle=eg;ctx.fillRect(0,0,w,h);
      ctx.fillStyle="rgba(255,255,255,"+(0.35*a)+")";ctx.font="200 16px "+FONT;ctx.textAlign="center";ctx.fillText(gt,cx,cy+vr+30);
      if(pr<1)af=requestAnimationFrame(draw);else setTimeout(onDone,200);
    }
    af=requestAnimationFrame(draw);return function(){cancelAnimationFrame(af);};
  }, [contribs, onDone]);
  return <canvas ref={ref} style={{ position:"absolute",inset:0,width:"100%",height:"100%",zIndex:35,pointerEvents:"none" }} />;
}

function TraceCreationUI({ onSend, onCancel, guided, traceCount }) {
  var _a = useState(null), tone = _a[0], setTone = _a[1];
  var _b = useState([]), path = _b[0], setPath = _b[1];
  var _c = useState(false), dr = _c[0], setDr = _c[1];
  var _d = useState(false), sent = _d[0], setSent = _d[1];
  var _pv = useState(null), previewTone = _pv[0], setPreviewTone = _pv[1];
  var _pvA = useState(0), previewAlpha = _pvA[0], setPreviewAlpha = _pvA[1];
  var _pa = useState(false), paused = _pa[0], setPaused = _pa[1];
  var _lc = useState(0), liftCount = _lc[0], setLiftCount = _lc[1];
  var cv = useRef(null), pr = useRef([]), sendTimerR = useRef(null), liftCountR = useRef(0);

  var availableTones = getAvailableTones(traceCount || 0);
  var dormantTones = TONE_KEYS.filter(function(k) { return availableTones.indexOf(k) === -1; });

  useEffect(function() { return function() { if (sendTimerR.current) clearTimeout(sendTimerR.current); }; }, []);

  var selectTone = useCallback(function(k) {
    setPreviewTone(k);
    soundTonePreview(k);
    hapticLight();
    setPreviewAlpha(1);
    var start = Date.now();
    var iv = setInterval(function() {
      var elapsed = Date.now() - start;
      if (elapsed > 600) { clearInterval(iv); setPreviewAlpha(0); setTone(k); setPreviewTone(null); return; }
      setPreviewAlpha(1 - elapsed / 600);
    }, 20);
  }, []);

  var doSend = useCallback(function() {
    if (pr.current.length > 5 && tone) {
      setSent(true);
      sendTimerR.current = setTimeout(function() { sendTimerR.current = null; onSend({ tone: tone, path: pr.current }); }, 1800);
    }
  }, [tone, onSend]);

  var oD = useCallback(function(ev) {
    if (!tone || sent) return;
    if (liftCountR.current >= 2) return;
    var r = ev.currentTarget.getBoundingClientRect();
    var pt = { x:(ev.clientX-r.left)/r.width, y:(ev.clientY-r.top)/r.height, t:Date.now() };
    if (pr.current.length > 0 && liftCountR.current === 1) {
      pr.current.push({ x:pt.x, y:pt.y, t:pt.t, gap:true });
    } else {
      pr.current = [pt];
    }
    setPath(pr.current.slice());
    setDr(true);
    if (paused) setPaused(false);
  }, [tone, sent, paused]);

  var oM = useCallback(function(ev) {
    if (!dr) return;
    var r = ev.currentTarget.getBoundingClientRect();
    pr.current.push({ x:(ev.clientX-r.left)/r.width, y:(ev.clientY-r.top)/r.height, t:Date.now() });
    setPath(pr.current.slice());
  }, [dr]);

  var oU = useCallback(function() {
    if (!dr) return;
    setDr(false);
    liftCountR.current += 1;
    setLiftCount(liftCountR.current);
    if (liftCountR.current >= 2) {
      if (pr.current.length > 5) {
        doSend();
      } else {
        // Path too short on second lift — reset to first-lift state so user can retry
        liftCountR.current = 1;
        setLiftCount(1);
        setPaused(true);
      }
    } else if (pr.current.length > 5) {
      setPaused(true);
      hapticLight();
    }
  }, [dr, doSend]);

  useEffect(function() {
    var c = cv.current; if (!c || !tone) return;
    var ctx = c.getContext("2d"), dpr = window.devicePixelRatio || 1, r = c.getBoundingClientRect();
    c.width = r.width*dpr; c.height = r.height*dpr; ctx.scale(dpr,dpr);
    var w = r.width, h = r.height; ctx.clearRect(0,0,w,h); if (path.length < 2) return;
    var cols = TONES[tone].colors, ch = TONES[tone].ch; ctx.lineCap = "round"; ctx.lineJoin = "round";
    for (var i = 1; i < path.length; i++) {
      if (path[i].gap || path[i-1].gap) continue;
      var p0 = path[i-1], p1 = path[i], dt = p1.t-p0.t, dd = dst(p0.x,p0.y,p1.x,p1.y), speed = dt>0?dd/(dt/1000):0;
      var lw = clamp(8-speed*9,1.5,12);
      if (ch==="sharp") lw = clamp(3-speed*5,0.8,5);
      if (ch==="round") lw = clamp(10-speed*6,3,14);
      if (ch==="bounce") lw = 3+Math.sin(i*0.8)*3;
      if (ch==="still") lw = clamp(4-speed*3,1,6);
      if (ch==="heavy") lw = clamp(10-speed*4,3,16);
      if (ch==="vast") lw = clamp(6-speed*5,1,10);
      if (ch==="pull") lw = clamp(5-speed*6,0.8,8);
      if (ch==="surrender") lw = clamp(7-speed*5,2,12);
      ctx.beginPath(); ctx.moveTo(p0.x*w,p0.y*h); ctx.lineTo(p1.x*w,p1.y*h);
      ctx.strokeStyle = cols[1]+hex2(ch==="sharp"?15:35); ctx.lineWidth = lw+(ch==="round"||ch==="heavy"?18:14); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(p0.x*w,p0.y*h); ctx.lineTo(p1.x*w,p1.y*h);
      ctx.strokeStyle = cols[0]+hex2(215); ctx.lineWidth = lw; ctx.stroke();
    }
    var last = path[path.length-1];
    if (!last.gap) {
      var glow = ctx.createRadialGradient(last.x*w,last.y*h,0,last.x*w,last.y*h,32);
      glow.addColorStop(0,cols[0]+"99"); glow.addColorStop(1,"transparent");
      ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(last.x*w,last.y*h,32,0,Math.PI*2); ctx.fill();
    }
  }, [path, tone]);

  if (sent) {
    var sc2 = TONES[tone]?TONES[tone].primary:"#888";
    return <div style={{ position:"absolute",inset:0,zIndex:20,background:"rgba(6,6,12,0.97)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",fontFamily:FONT }}>
      <div style={{ width:40,height:40,borderRadius:"50%",background:sc2,opacity:0.6,boxShadow:"0 0 40px "+sc2+"88",animation:"sendPulse 1.5s ease infinite" }} />
      <p style={{ color:"rgba(255,255,255,0.6)",fontSize:12,letterSpacing:"0.2em",fontWeight:200,marginTop:20 }}>TRACE SENT</p>
    </div>;
  }

  if (!tone) {
    var pvRgb = previewTone && TONES[previewTone] ? TONES[previewTone].rgb : null;
    return <div style={{ position:"absolute",inset:0,zIndex:20,background:"rgba(6,6,12,0.97)",display:"flex",flexDirection:"column",fontFamily:FONT }}>
      {pvRgb && previewAlpha > 0 ? <div style={{ position:"absolute",inset:0,background:"rgba("+pvRgb[0]+","+pvRgb[1]+","+pvRgb[2]+","+(previewAlpha*0.08)+")",pointerEvents:"none",zIndex:0 }} /> : null}
      <button onClick={onCancel} style={{ position:"absolute",top:14,right:14,zIndex:25,background:"none",border:"none",color:"rgba(255,255,255,0.58)",fontSize:20,cursor:"pointer",padding:10 }}>{"\u2715"}</button>
      <div style={{ flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:36,position:"relative",zIndex:1,padding:"0 20px" }}>
        {guided ? <p style={{ color:"rgba(255,255,255,0.63)",fontSize:12,fontWeight:200,letterSpacing:"0.15em",lineHeight:1.8,textAlign:"center" }}>choose how your trace<br/>should feel</p> : null}
        <p style={{ color:"rgba(255,255,255,0.57)",fontSize:13,letterSpacing:"0.3em",fontWeight:200 }}>EMOTIONAL TONE</p>
        <div style={{ display:"flex",gap:20,flexWrap:"wrap",justifyContent:"center",maxWidth:340 }}>
          {availableTones.map(function(k) {
            var isPreview = previewTone === k;
            return <div key={k} onClick={function() { if (!previewTone) selectTone(k); }} style={{ display:"flex",flexDirection:"column",alignItems:"center",gap:10,cursor:previewTone?"default":"pointer",transition:"transform 0.3s, opacity 0.3s",transform:isPreview?"scale(1.15)":"scale(1)",opacity:previewTone&&!isPreview?0.3:1 }}>
              <div style={{ width:50,height:50,borderRadius:"50%",background:"radial-gradient(circle at 36% 36%, "+TONES[k].colors[0]+", "+TONES[k].colors[1]+")",border:"1.5px solid rgba(255,255,255,0.06)",boxShadow:isPreview?"0 0 40px "+TONES[k].primary+"88":"0 0 28px "+TONES[k].primary+"55",transition:"transform 0.3s, box-shadow 0.3s" }} />
              <span style={{ color:TONES[k].primary,fontSize:13,letterSpacing:"0.1em",opacity:0.7,fontWeight:300 }}>{TONES[k].name}</span>
            </div>;
          })}
          {dormantTones.map(function(k) {
            var th = TONE_UNLOCK_THRESHOLDS[k] || 0;
            return <div key={k} style={{ display:"flex",flexDirection:"column",alignItems:"center",gap:10,opacity:0.18 }}>
              <div style={{ width:50,height:50,borderRadius:"50%",background:"rgba(255,255,255,0.06)",border:"1px solid rgba(255,255,255,0.05)" }} />
              <span style={{ color:"rgba(255,255,255,0.3)",fontSize:11,letterSpacing:"0.05em",fontWeight:200 }}>{th}</span>
            </div>;
          })}
        </div>
      </div>
    </div>;
  }

  var hintText = paused
    ? "LIFT AGAIN TO SEND"
    : liftCount >= 1
      ? (path.length > 5 ? "LIFT TO SEND" : "DRAW MORE")
      : (path.length > 5 ? "LIFT TO PAUSE" : guided ? "draw something" : "DRAW YOUR TRACE");

  return <div style={{ position:"absolute",inset:0,zIndex:20,background:"rgba(6,6,12,0.97)",display:"flex",flexDirection:"column",fontFamily:FONT }}>
    <button onClick={onCancel} style={{ position:"absolute",top:14,right:14,zIndex:25,background:"none",border:"none",color:"rgba(255,255,255,0.58)",fontSize:20,cursor:"pointer",padding:10 }}>{"\u2715"}</button>
    <div style={{ padding:"22px 0",textAlign:"center",display:"flex",alignItems:"center",justifyContent:"center",gap:10 }}>
      <div style={{ width:8,height:8,borderRadius:"50%",background:TONES[tone].primary,boxShadow:"0 0 14px "+TONES[tone].primary+"99",animation:paused?"gentlePulse 1.5s ease infinite":"none" }} />
      <span style={{ color:"rgba(255,255,255,0.63)",fontSize:14,letterSpacing:"0.16em",fontWeight:200 }}>{hintText}</span>
    </div>
    <div style={{ flex:1,position:"relative",cursor:"crosshair",touchAction:"none" }} onPointerDown={oD} onPointerMove={oM} onPointerUp={oU}>
      <canvas ref={cv} style={{ position:"absolute",inset:0,width:"100%",height:"100%" }} />
    </div>
  </div>;
}


// ══════════════════════════════════════
// REUNION — Propose a date
// ══════════════════════════════════════
function ReunionPropose({ pair, user, onDone }) {
  var _d = useState(""), dateVal = _d[0], setDateVal = _d[1];
  var _s = useState(false), sending = _s[0], setSending = _s[1];

  var today = new Date().toISOString().slice(0, 10);
  var tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  var submit = async function() {
    if (!dateVal || dateVal <= today) return;
    setSending(true);
    try {
      var reu = await proposeReunion(pair.id, user.id, dateVal);
      sendPushToPartner('proposal', pair.id).catch(function() {});
      onDone(reu);
    } catch (e) {
      console.error("Reunion propose error:", e);
      setSending(false);
    }
  };

  return <div style={{ position:"absolute",inset:0,zIndex:50,background:"rgba(6,6,12,0.97)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",fontFamily:FONT,animation:"fadeIn 0.6s ease" }}>
    <button onClick={function() { onDone(null); }} style={{ position:"absolute",top:14,right:14,zIndex:25,background:"none",border:"none",color:"rgba(255,255,255,0.58)",fontSize:20,cursor:"pointer",padding:10 }}>{"\u2715"}</button>
    <div style={{ width:2,height:2,borderRadius:"50%",background:"rgba(212,165,116,0.4)",marginBottom:30 }} />
    <div style={{ color:"rgba(255,255,255,0.57)",fontSize:13,letterSpacing:"0.3em",fontWeight:200,marginBottom:10 }}>REUNION</div>
    <div style={{ color:"rgba(255,255,255,0.6)",fontSize:12,fontWeight:200,letterSpacing:"0.12em",lineHeight:1.8,textAlign:"center",marginBottom:36 }}>
      choose a day to see each other<br/>
      <span style={{ color:"rgba(255,255,255,0.52)",fontSize:12 }}>your shared artwork will be revealed</span>
    </div>
    <input type="date" value={dateVal} min={tomorrow} onChange={function(ev) { setDateVal(ev.target.value); }}
      style={{ fontSize:16,fontWeight:200,color:"rgba(255,255,255,0.58)",padding:"14px 24px",borderRadius:12,background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.1)",outline:"none",fontFamily:FONT,colorScheme:"dark",marginBottom:24 }} />
    <div onClick={dateVal && !sending ? submit : undefined}
      style={{ padding:"14px 44px",borderRadius:24,border:"1px solid "+(dateVal?"rgba(212,165,116,0.2)":"rgba(255,255,255,0.06)"),background:dateVal?"rgba(212,165,116,0.06)":"transparent",cursor:dateVal?"pointer":"default",color:dateVal?"rgba(212,165,116,0.6)":"rgba(255,255,255,0.15)",fontSize:12,letterSpacing:"0.18em",fontWeight:200 }}>
      {sending ? "SENDING\u2026" : "PROPOSE THIS DATE"}
    </div>
  </div>;
}

// ══════════════════════════════════════
// REUNION — Incoming proposal (partner accepts/declines)
// ══════════════════════════════════════
function ReunionIncoming({ reunion, onRespond }) {
  var dateStr = new Date(reunion.proposed_date + "T00:00:00").toLocaleDateString(undefined, { weekday:"long", day:"numeric", month:"long" });
  return <div style={{ position:"absolute",inset:0,zIndex:50,background:"rgba(6,6,12,0.97)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",fontFamily:FONT,animation:"fadeIn 0.8s ease" }}>
    <div style={{ width:2,height:2,borderRadius:"50%",background:"rgba(212,165,116,0.4)",marginBottom:30 }} />
    <div style={{ color:"rgba(255,255,255,0.57)",fontSize:13,letterSpacing:"0.3em",fontWeight:200,marginBottom:10 }}>REUNION</div>
    <div style={{ color:"rgba(255,255,255,0.6)",fontSize:12,fontWeight:200,letterSpacing:"0.12em",lineHeight:1.8,textAlign:"center",marginBottom:12 }}>
      your person wants to see you
    </div>
    <div style={{ color:"rgba(212,165,116,0.6)",fontSize:18,fontWeight:200,letterSpacing:"0.15em",marginBottom:10 }}>{dateStr}</div>
    <div style={{ color:"rgba(255,255,255,0.52)",fontSize:12,fontWeight:200,marginBottom:40 }}>your shared artwork will be revealed</div>
    <div style={{ display:"flex",gap:16 }}>
      <div onClick={function() { onRespond(false); }} style={{ padding:"14px 32px",borderRadius:24,border:"1px solid rgba(255,255,255,0.06)",cursor:"pointer",color:"rgba(255,255,255,0.58)",fontSize:13,letterSpacing:"0.15em",fontWeight:200 }}>NOT YET</div>
      <div onClick={function() { onRespond(true); }} style={{ padding:"14px 32px",borderRadius:24,border:"1px solid rgba(212,165,116,0.2)",background:"rgba(212,165,116,0.06)",cursor:"pointer",color:"rgba(212,165,116,0.6)",fontSize:13,letterSpacing:"0.15em",fontWeight:200 }}>ACCEPT</div>
    </div>
  </div>;
}

// ══════════════════════════════════════
// REUNION — Full artwork reveal
// ══════════════════════════════════════
function ReunionReveal({ contribs, reunion, onDone }) {
  var cvRef = useRef(null);
  var _a = useState(0), al = _a[0], setAl = _a[1];
  var _done = useState(false), animDone = _done[0], setAnimDone = _done[1];

  // Export artwork helper
  var saveArtwork = useCallback(function() {
    if (contribs.length === 0) return;
    var c = document.createElement("canvas");
    var size = 1080; c.width = size; c.height = size;
    var ctx = c.getContext("2d");
    ctx.fillStyle = "#0A0A12"; ctx.fillRect(0, 0, size, size);
    drawArtwork(ctx, contribs, size, size, 0.85);
    ctx.fillStyle = "rgba(255,255,255,0.08)"; ctx.font = "200 14px 'Outfit', sans-serif";
    ctx.textAlign = "center"; ctx.fillText("resona", size / 2, size - 30);
    try {
      var link = document.createElement("a");
      link.download = "resona-artwork.png";
      link.href = c.toDataURL("image/png");
      link.click();
    } catch (e) {
      c.toBlob(function(blob) {
        if (navigator.share && blob) {
          navigator.share({ files: [new File([blob], "resona-artwork.png", { type: "image/png" })] }).catch(function() {});
        }
      });
    }
  }, [contribs]);

  useEffect(function() {
    soundArtworkReveal(); hapticReveal();
    var c = cvRef.current; if (!c) return;
    var ctx = c.getContext("2d"), dpr = window.devicePixelRatio || 1, rect = c.getBoundingClientRect();
    c.width = rect.width * dpr; c.height = rect.height * dpr; ctx.scale(dpr, dpr);
    var w = rect.width, h = rect.height, start = Date.now(), dur = 12000, af;

    function draw() {
      var pr = Math.min(1, (Date.now() - start) / dur);
      var a = Math.min(1, pr * 1.5); // fade in, NO fade out
      setAl(a);

      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = "rgba(6,6,12,0.97)";
      ctx.fillRect(0, 0, w, h);

      var maxR = Math.min(w, h) * 0.45;
      var vr = maxR * Math.min(1, pr * 2);
      var cx = w / 2, cy = h / 2;

      if (vr > 2) {
        ctx.save();
        ctx.beginPath(); ctx.arc(cx, cy, vr, 0, Math.PI * 2); ctx.clip();
        drawArtwork(ctx, contribs, w, h, a * 0.85);
        ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";
        ctx.restore();

        var eg = ctx.createRadialGradient(cx, cy, vr * 0.7, cx, cy, vr * 1.05);
        eg.addColorStop(0, "transparent");
        eg.addColorStop(1, "rgba(6,6,12," + a + ")");
        ctx.fillStyle = eg; ctx.fillRect(0, 0, w, h);
      }

      if (pr < 1) af = requestAnimationFrame(draw);
      else setAnimDone(true); // animation done — show buttons, don't auto-dismiss
    }
    af = requestAnimationFrame(draw);
    return function() { cancelAnimationFrame(af); };
  }, [contribs]);

  var dateStr = reunion && reunion.proposed_date
    ? new Date(reunion.proposed_date + "T00:00:00").toLocaleDateString(undefined, { day:"numeric", month:"long", year:"numeric" })
    : "";

  return <div style={{ position:"absolute",inset:0,zIndex:55 }}>
    <canvas ref={cvRef} style={{ position:"absolute",inset:0,width:"100%",height:"100%" }} />
    <div style={{ position:"absolute",top:"8%",left:0,right:0,textAlign:"center",zIndex:1,pointerEvents:"none",fontFamily:FONT }}>
      <div style={{ color:"rgba(212,165,116,"+(al*0.3)+")",fontSize:13,letterSpacing:"0.3em",fontWeight:200,marginBottom:6 }}>REUNION</div>
      <div style={{ color:"rgba(255,255,255,"+(al*0.2)+")",fontSize:12,fontWeight:200 }}>{dateStr}</div>
    </div>
    {animDone ? <div style={{ position:"absolute",bottom:"8%",left:0,right:0,textAlign:"center",zIndex:1,fontFamily:FONT,animation:"fadeIn 1s ease",paddingBottom:"env(safe-area-inset-bottom, 0px)" }}>
      <div style={{ color:"rgba(255,255,255,0.35)",fontSize:12,letterSpacing:"0.1em",fontWeight:200,marginBottom:20 }}>everything you built together</div>
      <div style={{ display:"flex",gap:16,justifyContent:"center" }}>
        <div onClick={saveArtwork} style={{ padding:"12px 28px",borderRadius:24,border:"1px solid rgba(212,165,116,0.2)",background:"rgba(212,165,116,0.05)",cursor:"pointer",color:"rgba(212,165,116,0.6)",fontSize:13,letterSpacing:"0.15em",fontWeight:200 }}>SAVE</div>
        <div onClick={onDone} style={{ padding:"12px 28px",borderRadius:24,border:"1px solid rgba(255,255,255,0.08)",cursor:"pointer",color:"rgba(255,255,255,0.57)",fontSize:13,letterSpacing:"0.15em",fontWeight:200 }}>CONTINUE</div>
      </div>
    </div> : <div style={{ position:"absolute",bottom:"8%",left:0,right:0,textAlign:"center",zIndex:1,pointerEvents:"none",fontFamily:FONT }}>
      <div style={{ color:"rgba(255,255,255,"+(al*0.15)+")",fontSize:12,letterSpacing:"0.1em",fontWeight:200 }}>everything you built together</div>
    </div>}
  </div>;
}

// ══════════════════════════════════════
// RESET — Incoming proposal from partner
// ══════════════════════════════════════
function ResetIncoming({ onRespond }) {
  return <div style={{ position:"absolute",inset:0,zIndex:50,background:"rgba(6,6,12,0.97)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",fontFamily:FONT,animation:"fadeIn 0.8s ease" }}>
    <div style={{ width:2,height:2,borderRadius:"50%",background:"rgba(255,255,255,0.3)",marginBottom:30 }} />
    <div style={{ color:"rgba(255,255,255,0.57)",fontSize:13,letterSpacing:"0.3em",fontWeight:200,marginBottom:10 }}>START FRESH</div>
    <div style={{ color:"rgba(255,255,255,0.6)",fontSize:12,fontWeight:200,letterSpacing:"0.12em",lineHeight:1.8,textAlign:"center",marginBottom:12 }}>
      your person wants to start over
    </div>
    <div style={{ color:"rgba(255,255,255,0.52)",fontSize:12,fontWeight:200,marginBottom:40,textAlign:"center" }}>all traces and artwork will be cleared<br/>you can build something new together</div>
    <div style={{ display:"flex",gap:16 }}>
      <div onClick={function() { onRespond(false); }} style={{ padding:"14px 32px",borderRadius:24,border:"1px solid rgba(255,255,255,0.06)",cursor:"pointer",color:"rgba(255,255,255,0.58)",fontSize:13,letterSpacing:"0.15em",fontWeight:200 }}>KEEP</div>
      <div onClick={function() { onRespond(true); }} style={{ padding:"14px 32px",borderRadius:24,border:"1px solid rgba(255,255,255,0.15)",background:"rgba(255,255,255,0.04)",cursor:"pointer",color:"rgba(255,255,255,0.57)",fontSize:13,letterSpacing:"0.15em",fontWeight:200 }}>START FRESH</div>
    </div>
  </div>;
}

// ══════════════════════════════════════
// POST-REVEAL — After reunion artwork reveal, offer to start fresh
// ══════════════════════════════════════
function PostRevealPrompt({ onStartFresh, onKeep }) {
  return <div style={{ position:"absolute",inset:0,zIndex:55,background:"rgba(6,6,12,0.97)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",fontFamily:FONT,animation:"fadeIn 1s ease" }}>
    <div style={{ width:2,height:2,borderRadius:"50%",background:"rgba(212,165,116,0.4)",marginBottom:30 }} />
    <div style={{ color:"rgba(255,255,255,0.63)",fontSize:12,fontWeight:200,letterSpacing:"0.15em",lineHeight:1.8,textAlign:"center",marginBottom:40 }}>
      you saw what you built together
    </div>
    <div style={{ color:"rgba(255,255,255,0.52)",fontSize:12,fontWeight:200,marginBottom:40,textAlign:"center" }}>would you like to start a new chapter?</div>
    <div style={{ display:"flex",flexDirection:"column",gap:16,alignItems:"center" }}>
      <div onClick={onStartFresh} style={{ padding:"14px 44px",borderRadius:24,border:"1px solid rgba(212,165,116,0.15)",background:"rgba(212,165,116,0.04)",cursor:"pointer",color:"rgba(212,165,116,0.5)",fontSize:12,letterSpacing:"0.18em",fontWeight:200 }}>START FRESH</div>
      <div onClick={onKeep} style={{ padding:"14px 44px",borderRadius:24,border:"1px solid rgba(255,255,255,0.06)",cursor:"pointer",color:"rgba(255,255,255,0.57)",fontSize:13,letterSpacing:"0.15em",fontWeight:200 }}>keep everything</div>
    </div>
    <div style={{ position:"absolute",bottom:30,color:"rgba(255,255,255,0.6)",fontSize:13,fontWeight:200,textAlign:"center" }}>your person will need to agree too</div>
  </div>;
}

// ══════════════════════════════════════
// EMAIL LINK — Secure guest account with email
// ══════════════════════════════════════
function EmailLinkUI({ onDone }) {
  var _e = useState(""), email = _e[0], setEmail = _e[1];
  var _s = useState("input"), step = _s[0], setStep = _s[1]; // input | sending | sent | error
  var _err = useState(null), err = _err[0], setErr = _err[1];

  var submit = async function() {
    if (!email || !email.includes("@")) return;
    setStep("sending");
    try {
      await linkEmail(email);
      setStep("sent");
    } catch (e) {
      setErr(e.message || "Failed to send link");
      setStep("error");
    }
  };

  return <div style={{ position:"absolute",inset:0,zIndex:52,background:"rgba(6,6,12,0.97)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",fontFamily:FONT,animation:"fadeIn 0.6s ease" }}>
    <button onClick={onDone} style={{ position:"absolute",top:14,right:14,zIndex:25,background:"none",border:"none",color:"rgba(255,255,255,0.52)",fontSize:20,cursor:"pointer",padding:10 }}>{"\u2715"}</button>

    {step === "input" || step === "error" ? <div style={{ display:"flex",flexDirection:"column",alignItems:"center",gap:20,maxWidth:320 }}>
      <div style={{ width:2,height:2,borderRadius:"50%",background:"rgba(212,165,116,0.5)",marginBottom:10 }} />
      <div style={{ color:"rgba(255,255,255,0.58)",fontSize:13,letterSpacing:"0.3em",fontWeight:200 }}>SECURE YOUR ACCOUNT</div>
      <div style={{ color:"rgba(255,255,255,0.57)",fontSize:13,fontWeight:200,lineHeight:1.7,textAlign:"center" }}>
        Enter your email to receive a magic link.<br/>Your account will be safe even if you switch devices.
      </div>
      {err ? <div style={{ color:"rgba(196,30,58,0.6)",fontSize:12,fontWeight:200 }}>{err}</div> : null}
      <input type="email" value={email} onChange={function(ev) { setEmail(ev.target.value); }} placeholder="your@email.com"
        style={{ fontSize:14,fontWeight:200,color:"rgba(255,255,255,0.6)",padding:"14px 20px",borderRadius:12,background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.1)",outline:"none",fontFamily:FONT,width:"100%",textAlign:"center" }} />
      <div onClick={submit} style={{ padding:"14px 44px",borderRadius:24,border:"1px solid rgba(212,165,116,0.2)",background:email.includes("@")?"rgba(212,165,116,0.06)":"transparent",cursor:email.includes("@")?"pointer":"default",color:email.includes("@")?"rgba(212,165,116,0.7)":"rgba(255,255,255,0.2)",fontSize:13,letterSpacing:"0.15em",fontWeight:300 }}>SEND MAGIC LINK</div>
    </div> : null}

    {step === "sending" ? <div style={{ display:"flex",flexDirection:"column",alignItems:"center",gap:16 }}>
      <div style={{ width:6,height:6,borderRadius:"50%",background:"rgba(212,165,116,0.4)",animation:"gentlePulse 1.5s ease infinite" }} />
      <div style={{ color:"rgba(255,255,255,0.57)",fontSize:12,fontWeight:200 }}>sending…</div>
    </div> : null}

    {step === "sent" ? <div style={{ display:"flex",flexDirection:"column",alignItems:"center",gap:16,maxWidth:300 }}>
      <div style={{ width:6,height:6,borderRadius:"50%",background:"rgba(100,200,100,0.5)" }} />
      <div style={{ color:"rgba(255,255,255,0.58)",fontSize:12,letterSpacing:"0.2em",fontWeight:200 }}>CHECK YOUR EMAIL</div>
      <div style={{ color:"rgba(255,255,255,0.52)",fontSize:13,fontWeight:200,lineHeight:1.7,textAlign:"center" }}>
        We sent a confirmation link to <strong style={{ color:"rgba(255,255,255,0.6)" }}>{email}</strong>. Click it to secure your account.
      </div>
      <div onClick={onDone} style={{ marginTop:10,padding:"12px 32px",borderRadius:20,border:"1px solid rgba(255,255,255,0.08)",cursor:"pointer",color:"rgba(255,255,255,0.57)",fontSize:12,fontWeight:200 }}>DONE</div>
    </div> : null}
  </div>;
}


// ══════════════════════════════════════
// SIGN IN — Return user with existing email account
// ══════════════════════════════════════
function SignInUI({ onDone, onBack }) {
  var _e = useState(""), email = _e[0], setEmail = _e[1];
  var _s = useState("input"), step = _s[0], setStep = _s[1]; // input | sending | sent | error
  var _err = useState(null), err = _err[0], setErr = _err[1];
  var _checking = useState(false), checking = _checking[0], setChecking = _checking[1];

  var submit = async function() {
    if (!email || !email.includes("@")) return;
    setStep("sending"); setErr(null);
    try {
      await signInWithEmail(email);
      setStep("sent");
    } catch (e) {
      setErr(e.message || "Failed to send sign-in link");
      setStep("error");
    }
  };

  // Listen for auth state change (user clicked magic link and came back)
  useEffect(function() {
    var sub = supabase.auth.onAuthStateChange(function(event, session) {
      if (event === 'SIGNED_IN' && session && !session.user.is_anonymous) {
        setChecking(true);
        onDone();
      }
    });
    return function() { sub.data.subscription.unsubscribe(); };
  }, [onDone]);

  if (checking) {
    return <div style={{ position:"absolute",inset:0,zIndex:50,background:"#0A0A12",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",fontFamily:FONT }}>
      <div style={{ width:6,height:6,borderRadius:"50%",background:"rgba(212,165,116,0.4)",animation:"gentlePulse 1.5s ease infinite" }} />
      <div style={{ marginTop:20,color:"rgba(255,255,255,0.57)",fontSize:12,letterSpacing:"0.2em",fontWeight:200 }}>SIGNING IN…</div>
    </div>;
  }

  return <div style={{ position:"absolute",inset:0,zIndex:50,background:"#0A0A12",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",fontFamily:FONT }}>

    {step === "input" || step === "error" ? <div style={{ display:"flex",flexDirection:"column",alignItems:"center",gap:20,maxWidth:320 }}>
      <div style={{ width:2,height:2,borderRadius:"50%",background:"rgba(212,165,116,0.5)",marginBottom:10 }} />
      <div style={{ color:"rgba(255,255,255,0.58)",fontSize:13,letterSpacing:"0.3em",fontWeight:200 }}>WELCOME BACK</div>
      <div style={{ color:"rgba(255,255,255,0.57)",fontSize:13,fontWeight:200,lineHeight:1.7,textAlign:"center" }}>
        Enter the email you used to secure<br/>your account. We'll send a sign-in link.
      </div>
      {err ? <div style={{ color:"rgba(196,30,58,0.6)",fontSize:12,fontWeight:200 }}>{err}</div> : null}
      <input type="email" value={email} onChange={function(ev) { setEmail(ev.target.value); }} placeholder="your@email.com"
        style={{ fontSize:14,fontWeight:200,color:"rgba(255,255,255,0.6)",padding:"14px 20px",borderRadius:12,background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.1)",outline:"none",fontFamily:FONT,width:"100%",textAlign:"center" }} />
      <div onClick={submit} style={{ padding:"14px 44px",borderRadius:24,border:"1px solid rgba(212,165,116,0.2)",background:email.includes("@")?"rgba(212,165,116,0.06)":"transparent",cursor:email.includes("@")?"pointer":"default",color:email.includes("@")?"rgba(212,165,116,0.7)":"rgba(255,255,255,0.2)",fontSize:13,letterSpacing:"0.15em",fontWeight:300 }}>SEND SIGN-IN LINK</div>
      <div onClick={onBack} style={{ cursor:"pointer",padding:"8px 16px",marginTop:4 }}>
        <span style={{ color:"rgba(255,255,255,0.4)",fontSize:12,letterSpacing:"0.1em",fontWeight:200 }}>back</span>
      </div>
    </div> : null}

    {step === "sending" ? <div style={{ display:"flex",flexDirection:"column",alignItems:"center",gap:16 }}>
      <div style={{ width:6,height:6,borderRadius:"50%",background:"rgba(212,165,116,0.4)",animation:"gentlePulse 1.5s ease infinite" }} />
      <div style={{ color:"rgba(255,255,255,0.57)",fontSize:12,fontWeight:200 }}>sending…</div>
    </div> : null}

    {step === "sent" ? <div style={{ display:"flex",flexDirection:"column",alignItems:"center",gap:16,maxWidth:300 }}>
      <div style={{ width:6,height:6,borderRadius:"50%",background:"rgba(100,200,100,0.5)" }} />
      <div style={{ color:"rgba(255,255,255,0.58)",fontSize:12,letterSpacing:"0.2em",fontWeight:200 }}>CHECK YOUR EMAIL</div>
      <div style={{ color:"rgba(255,255,255,0.52)",fontSize:13,fontWeight:200,lineHeight:1.7,textAlign:"center" }}>
        We sent a sign-in link to <strong style={{ color:"rgba(255,255,255,0.6)" }}>{email}</strong>.<br/>Click it to sign in.
      </div>
      <div style={{ color:"rgba(255,255,255,0.45)",fontSize:13,fontWeight:200,lineHeight:1.6,textAlign:"center",marginTop:8 }}>
        After clicking the link, this page<br/>will automatically continue.
      </div>
      <div onClick={onBack} style={{ marginTop:16,padding:"12px 32px",borderRadius:20,border:"1px solid rgba(255,255,255,0.08)",cursor:"pointer",color:"rgba(255,255,255,0.57)",fontSize:12,fontWeight:200 }}>BACK</div>
    </div> : null}
  </div>;
}


// ══════════════════════════════════════
// RECOVERY UI — enter 6-char code to reclaim lost anonymous account
// ══════════════════════════════════════
function RecoveryUI({ user, onDone, onBack }) {
  var _t = useState(""), token = _t[0], setToken = _t[1];
  var _s = useState("input"), step = _s[0], setStep = _s[1]; // input | loading | error
  var _err = useState(null), err = _err[0], setErr = _err[1];

  var submit = async function() {
    var clean = token.toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (clean.length !== 6) return;
    setStep("loading"); setErr(null);
    try {
      var result = await recoverAccount(clean, user.id);
      if (result && result.error) {
        var msg = result.error === "invalid_token" ? "Code not recognized. Check for typos." :
                  result.error === "no_active_pair" ? "No active connection found for this code." :
                  "Something went wrong. Please try again.";
        setErr(msg); setStep("error");
        return;
      }
      onDone();
    } catch (e) {
      console.error("Recovery error:", e);
      setErr("Something went wrong. Please try again.");
      setStep("error");
    }
  };

  return <div style={{ position:"absolute",inset:0,zIndex:50,background:"#0A0A12",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",fontFamily:FONT }}>
    {step === "loading" ? (
      <div style={{ display:"flex",flexDirection:"column",alignItems:"center",gap:16 }}>
        <div style={{ width:6,height:6,borderRadius:"50%",background:"rgba(212,165,116,0.4)",animation:"gentlePulse 1.5s ease infinite" }} />
        <div style={{ color:"rgba(255,255,255,0.52)",fontSize:12,letterSpacing:"0.15em",fontWeight:200 }}>recovering…</div>
      </div>
    ) : (
      <div style={{ display:"flex",flexDirection:"column",alignItems:"center",gap:20,maxWidth:300,padding:"0 24px" }}>
        <div style={{ width:2,height:2,borderRadius:"50%",background:"rgba(212,165,116,0.4)",marginBottom:10 }} />
        <div style={{ color:"rgba(255,255,255,0.57)",fontSize:13,letterSpacing:"0.3em",fontWeight:200 }}>RECOVER MY SPACE</div>
        <div style={{ color:"rgba(255,255,255,0.52)",fontSize:13,fontWeight:200,lineHeight:1.8,textAlign:"center" }}>
          Enter your 6-character recovery code.<br/>
          <span style={{ color:"rgba(255,255,255,0.35)",fontSize:12 }}>You saved this in Settings before.</span>
        </div>
        {err ? <div style={{ color:"rgba(196,30,58,0.6)",fontSize:12,fontWeight:200,textAlign:"center" }}>{err}</div> : null}
        <input
          value={token}
          onChange={function(ev) { setToken(ev.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6)); }}
          placeholder="______"
          maxLength={6}
          style={{ fontSize:28,fontWeight:300,letterSpacing:"0.4em",color:"rgba(255,255,255,0.6)",padding:"16px 24px",borderRadius:12,background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.1)",textAlign:"center",outline:"none",fontFamily:FONT,width:"100%" }}
        />
        <div onClick={submit} style={{ padding:"14px 44px",borderRadius:24,border:"1px solid rgba(212,165,116,0.2)",background:token.length===6?"rgba(212,165,116,0.06)":"transparent",cursor:token.length===6?"pointer":"default",color:token.length===6?"rgba(212,165,116,0.7)":"rgba(255,255,255,0.2)",fontSize:13,letterSpacing:"0.15em",fontWeight:300 }}>RECOVER</div>
        <div onClick={onBack} style={{ cursor:"pointer",padding:"8px 16px",marginTop:4 }}>
          <span style={{ color:"rgba(255,255,255,0.35)",fontSize:12,letterSpacing:"0.1em",fontWeight:200 }}>back</span>
        </div>
      </div>
    )}
  </div>;
}
