import { useState, useEffect, useRef, useCallback } from 'react';
import {
  ensureUser, getPair, getPartnerId, createPair, joinPair,
  canSendTrace, sendTrace, getPendingTrace, discoverTrace,
  getArtwork, dissolvePair,
  subscribeToTraces, subscribeToEvents, subscribeToPair,
  getUnseenEvents, markEventSeen,
  getActiveProposal, proposeReunion, proposeReset, proposeReveal, respondToProposal, completeProposal, executeResetArtwork, subscribeToProposals,
  supabase
} from './lib/supabase.js';
import { detectMoment, persistMoment } from './lib/moments.js';
import { hapticTap, hapticLight, hapticMedium, hapticReveal, hapticMoment, hapticSend, hapticProximity } from './lib/haptics.js';
import { initAudio, soundFound, soundReveal, soundMoment, soundSend, soundIncoming, soundArtworkReveal } from './lib/audio.js';
import {
  TONES, TONE_KEYS, WHISPER_POOL, ECHO_POOL, GLIMPSE_TEXTS, FONT,
  lerp, dst, clamp, pick, pickN, hex2, makeNoise, analyzeGesture, drawGesturePath
} from './lib/constants.js';

// ══════════════════════════════════════
// WELCOME SCREEN
// ══════════════════════════════════════
function Welcome({ onStart }) {
  var _a = useState(0), al = _a[0], sa = _a[1];
  useEffect(function() { setTimeout(function() { sa(1); }, 300); }, []);
  return (
    <div style={{ position:"absolute",inset:0,zIndex:50,background:"#0A0A12",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",fontFamily:FONT,cursor:"pointer",opacity:al,transition:"opacity 1s ease" }} onClick={function() { initAudio(); if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission(); onStart(); }}>
      <div style={{ marginBottom:60 }}>
        <div style={{ fontSize:24,fontWeight:200,letterSpacing:"0.5em",color:"rgba(255,255,255,0.35)",marginBottom:16,textAlign:"center" }}>RESONANCE</div>
        <div style={{ fontSize:12,fontWeight:200,letterSpacing:"0.15em",color:"rgba(255,255,255,0.25)",textAlign:"center",lineHeight:1.8 }}>
          a private space<br/>for two people<br/>to feel each other<br/>without words
        </div>
      </div>
      <div style={{ padding:"14px 40px",borderRadius:28,border:"1px solid rgba(255,255,255,0.08)",background:"rgba(255,255,255,0.03)" }}>
        <span style={{ color:"rgba(255,255,255,0.4)",fontSize:12,letterSpacing:"0.2em",fontWeight:200 }}>BEGIN</span>
      </div>
    </div>
  );
}

// ══════════════════════════════════════
// ONBOARDING — brief explanation
// ══════════════════════════════════════
function Onboarding({ onDone }) {
  var _s = useState(0), step = _s[0], setStep = _s[1];
  var _a = useState(0), al = _a[0], setAl = _a[1];

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

  var advance = function() {
    setAl(0);
    setTimeout(function() {
      if (step < steps.length - 1) setStep(step + 1);
      else onDone();
    }, 300);
  };

  var s = steps[step];
  return (
    <div onClick={advance} style={{ position:"absolute",inset:0,zIndex:50,background:"#0A0A12",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",fontFamily:FONT,cursor:"pointer",opacity:al,transition:"opacity 0.4s ease" }}>
      <div style={{ width:2,height:2,borderRadius:"50%",background:"rgba(255,255,255,0.3)",marginBottom:40 }} />
      <div style={{ fontSize:14,fontWeight:200,letterSpacing:"0.2em",color:"rgba(255,255,255,0.5)",marginBottom:20,textAlign:"center" }}>{s.title}</div>
      <div style={{ fontSize:11,fontWeight:200,letterSpacing:"0.08em",color:"rgba(255,255,255,0.28)",textAlign:"center",lineHeight:2,whiteSpace:"pre-line" }}>{s.body}</div>
      <div style={{ position:"absolute",bottom:60,display:"flex",gap:8 }}>
        {steps.map(function(_, i) { return <div key={i} style={{ width:i===step?16:4,height:4,borderRadius:2,background:i===step?"rgba(255,255,255,0.25)":"rgba(255,255,255,0.08)",transition:"all 0.3s" }} />; })}
      </div>
      <div style={{ position:"absolute",bottom:30,color:"rgba(255,255,255,0.25)",fontSize:9,letterSpacing:"0.15em",fontWeight:200 }}>{step < steps.length - 1 ? "tap to continue" : "tap to start"}</div>
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
    if (code.length < 3) return;
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
        <div style={{ marginTop:20,color:"rgba(255,255,255,0.2)",fontSize:10,letterSpacing:"0.2em",fontWeight:200 }}>CONNECTING</div>
      </div>
    );
  }

  return (
    <div style={{ position:"absolute",inset:0,zIndex:50,background:"#0A0A12",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",fontFamily:FONT }}>
      <div style={{ fontSize:16,fontWeight:200,letterSpacing:"0.35em",color:"rgba(255,255,255,0.3)",marginBottom:50 }}>RESONANCE</div>
      {err ? <div style={{ color:"rgba(196,30,58,0.6)",fontSize:10,marginBottom:20,letterSpacing:"0.1em" }}>{err}</div> : null}
      {mode === "choose" ? (
        <div style={{ display:"flex",flexDirection:"column",gap:20,alignItems:"center" }}>
          <div style={{ color:"rgba(255,255,255,0.3)",fontSize:11,letterSpacing:"0.2em",fontWeight:200,marginBottom:10 }}>CONNECT WITH YOUR PERSON</div>
          <div onClick={handleCreate} style={{ padding:"14px 44px",borderRadius:24,border:"1px solid rgba(255,255,255,0.1)",background:"rgba(255,255,255,0.03)",cursor:"pointer",color:"rgba(255,255,255,0.5)",fontSize:13,letterSpacing:"0.18em",fontWeight:200 }}>CREATE INVITE</div>
          <div onClick={function() { setMode("join"); }} style={{ padding:"14px 44px",borderRadius:24,border:"1px solid rgba(255,255,255,0.1)",background:"rgba(255,255,255,0.03)",cursor:"pointer",color:"rgba(255,255,255,0.5)",fontSize:13,letterSpacing:"0.18em",fontWeight:200 }}>ENTER CODE</div>
        </div>
      ) : mode === "waiting" ? (
        <div style={{ display:"flex",flexDirection:"column",alignItems:"center",gap:20 }}>
          <div style={{ color:"rgba(255,255,255,0.25)",fontSize:10,letterSpacing:"0.2em",fontWeight:200 }}>SHARE THIS CODE</div>
          <div style={{ fontSize:32,fontWeight:300,letterSpacing:"0.4em",color:"rgba(255,255,255,0.6)",padding:"16px 32px",borderRadius:12,background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.08)" }}>{invite}</div>
          <div style={{ color:"rgba(255,255,255,0.28)",fontSize:9,letterSpacing:"0.15em",fontWeight:200 }}>waiting for your person to join{"\u2026"}</div>
          <div style={{ width:4,height:4,borderRadius:"50%",background:"rgba(255,255,255,0.2)",animation:"gentlePulse 2s ease infinite",marginTop:10 }}/>
        </div>
      ) : (
        <div style={{ display:"flex",flexDirection:"column",alignItems:"center",gap:20 }}>
          <div style={{ color:"rgba(255,255,255,0.25)",fontSize:10,letterSpacing:"0.2em",fontWeight:200 }}>ENTER INVITE CODE</div>
          <input value={code} onChange={function(ev) { setCode(ev.target.value.toUpperCase()); }} placeholder="______" maxLength={6}
            style={{ fontSize:28,fontWeight:300,letterSpacing:"0.4em",color:"rgba(255,255,255,0.6)",padding:"14px 28px",borderRadius:12,background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.1)",textAlign:"center",outline:"none",fontFamily:FONT,width:240 }}/>
          <div style={{ display:"flex",gap:16 }}>
            <div onClick={function() { setMode("choose"); setErr(null); }} style={{ padding:"10px 24px",borderRadius:20,border:"1px solid rgba(255,255,255,0.06)",cursor:"pointer",color:"rgba(255,255,255,0.25)",fontSize:10,letterSpacing:"0.15em",fontWeight:200 }}>BACK</div>
            <div onClick={handleJoin} style={{ padding:"10px 24px",borderRadius:20,border:"1px solid rgba(255,255,255,0.12)",background:code.length>=3?"rgba(255,255,255,0.08)":"transparent",cursor:code.length>=3?"pointer":"default",color:code.length>=3?"rgba(255,255,255,0.5)":"rgba(255,255,255,0.15)",fontSize:10,letterSpacing:"0.15em",fontWeight:200 }}>CONNECT</div>
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
        setInitError("Connection failed: " + (authErr.message || String(authErr)) + ". Make sure Anonymous Auth is enabled in Supabase and the SQL schema has been run.");
      }
    })();
  }, []);

  var handleStart = useCallback(function() { setAppPhase("onboarding"); }, []);
  var handleOnboardingDone = useCallback(function() { setAppPhase("pairing"); }, []);
  var handlePaired = useCallback(async function(pairId) {
    var p = await getPair(user.id);
    setPair(p);
    setAppPhase("space");
  }, [user]);
  var handleDissolve = useCallback(async function() {
    await dissolvePair();
    setPair(null);
    setAppPhase("welcome");
  }, []);

  if (appPhase === "loading") {
    return (
      <div style={{ width:"100%",height:"100vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",background:"#0A0A12",fontFamily:FONT,gap:20 }}>
        <div style={{ color:"rgba(255,255,255,0.1)",fontSize:12,letterSpacing:"0.3em",fontWeight:200 }}>RESONANCE</div>
        {initError ? (
          <div style={{ maxWidth:340,textAlign:"center",padding:"16px 20px",borderRadius:12,background:"rgba(196,30,58,0.08)",border:"1px solid rgba(196,30,58,0.15)" }}>
            <div style={{ color:"rgba(196,30,58,0.7)",fontSize:10,letterSpacing:"0.05em",fontWeight:300,lineHeight:1.6 }}>{initError}</div>
          </div>
        ) : (
          <div style={{ width:4,height:4,borderRadius:"50%",background:"rgba(255,255,255,0.2)",animation:"gentlePulse 2s ease infinite" }}/>
        )}
      </div>
    );
  }

  if (appPhase === "welcome") return <Welcome onStart={handleStart} />;
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
  var _re = useState(null), resEcho = _re[0], setResEcho = _re[1];
  var _idle = useState(0), idleT = _idle[0], setIdleT = _idle[1];
  var _set = useState(false), showSettings = _set[0], setShowSettings = _set[1];
  var _ob = useState(0), onbStep = _ob[0], setOnbStep = _ob[1];
  var _err = useState(null), appError = _err[0], setAppError = _err[1];

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

  var cvRef = useRef(null);
  var nf1 = useRef(makeNoise()), nf2 = useRef(makeNoise()), nf3 = useRef(makeNoise());
  var timeR = useRef(0), afR = useRef(null);
  var particles = useRef(Array.from({ length: 60 }, function() { return { x:Math.random(),y:Math.random(),vx:0,vy:0,size:1+Math.random()*2.5,ba:0.04+Math.random()*0.1 }; }));
  var holdRef = useRef(null), hpR = useRef(0);
  var phR = useRef("idle"), trR = useRef(null), tcR = useRef(null), rtR = useRef([]), reR = useRef(null), cbR = useRef([]);
  var revealTraceR = useRef(null), onbStepR = useRef(0);

  useEffect(function() { phR.current = phase; }, [phase]);
  useEffect(function() { trR.current = trace; }, [trace]);
  useEffect(function() { tcR.current = touch; }, [touch]);
  useEffect(function() { rtR.current = recTones; }, [recTones]);
  useEffect(function() { reR.current = resEcho; }, [resEcho]);
  useEffect(function() { cbR.current = contribs; }, [contribs]);
  useEffect(function() { onbStepR.current = onbStep; }, [onbStep]);

  // ── Clear errors after 5s ──
  useEffect(function() {
    if (!appError) return;
    var t = setTimeout(function() { setAppError(null); }, 5000);
    return function() { clearTimeout(t); };
  }, [appError]);

  // ── Initial load ──
  useEffect(function() {
    if (!pair) return;
    (async function() {
      try {
        var art = await getArtwork(pair.id);
        if (art.length > 0) {
          setContribs(art.map(function(a) { return { tone: a.tone, path: a.path_data.path }; }));
          setRecTones(art.slice(-5).map(function(a) { return a.tone; }).reverse());
          setOnbStep(4);
        }
        var pending = await getPendingTrace(user.id);
        if (pending) {
          setTrace(pending);
          setPhase("discovery");
        } else {
          var cs = await canSendTrace(user.id);
          setCanSend(cs);
        }

        // Check for unseen resonance events from partner
        var unseen = await getUnseenEvents(pair.id, user.id, pair);
        if (unseen.length > 0) {
          handleIncomingEvent(unseen[0]);
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
                if (!revSeen) { setReunion(rev); foundUI = "reveal"; }
              }
              if (!foundUI && rev.status === "pending" && rev.proposed_by !== user.id) {
                setReunion(rev); foundUI = "incoming_reveal";
              }
            }
          }
          // Reset (only if nothing higher-priority found)
          if (!foundUI) {
            var rst = await getActiveProposal(pair.id, 'reset');
            if (rst && rst.status === "pending" && rst.proposed_by !== user.id) {
              setReunion(rst); foundUI = "incoming_reset";
            }
          }
          if (foundUI) setReunionUI(foundUI);
        } catch (e) { /* table might not exist yet */ }
      } catch (e) {
        console.error("Init error:", e);
        setAppError("Failed to load. Pull down to retry.");
      }
    })();
  }, [pair, user]);

  // ── Handle incoming resonance event from partner ──
  var handleIncomingEvent = useCallback(function(event) {
    setIncomingMoment(event);
    // Mark as seen
    markEventSeen(event.id, user.id, pair).catch(function() {});
  }, [user, pair]);

  // ── Realtime: traces ──
  useEffect(function() {
    if (!user) return;
    var sub = subscribeToTraces(user.id, function(newTrace) {
      if (phR.current === "idle") {
        setTrace(newTrace);
        setPhase("discovery");
        soundIncoming();
        hapticMedium();
      }
      // Browser notification when in background
      if (document.visibilityState === 'hidden' && 'Notification' in window && Notification.permission === 'granted') {
        try { new Notification('Resonance', { body: 'someone left something for you', icon: '/icon-192.png', tag: 'trace' }); } catch (e) {}
      }
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
          // Partner accepted the reset — execute it
          executeResetArtwork(pair.id).then(function() {
            completeProposal(proposal.id).catch(function(){});
            setContribs([]);
            setRecTones([]);
            setReunion(null);
            setReunionUI(null);
          }).catch(function(e) { console.error("Reset failed:", e); });
        }
        if (proposal.status === "declined" || proposal.status === "completed") {
          setReunionUI(null);
          // If completed, clear artwork locally too
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
          if (pending) {
            setTrace(pending);
            setPhase("discovery");
          } else {
            var cs = await canSendTrace(user.id);
            setCanSend(cs);
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
      var r = canvas.getBoundingClientRect(), w = r.width, h = r.height;
      timeR.current += 0.007; var t = timeR.current;
      var hp = hpR.current, ph = phR.current, tr = trR.current, tc = tcR.current, rt = rtR.current, re = reR.current;

      ctx.fillStyle = "#0A0A12"; ctx.fillRect(0, 0, w, h);

      // 3-layer noise — smooth organic atmosphere
      var breath = Math.sin(t * 0.4) * 0.25 + 0.55, step = 5, rr = 10, rg = 10, rb = 18;
      if (rt.length > 0) {
        var t2 = 0, g2 = 0, b2 = 0;
        rt.forEach(function(tn) { if (TONES[tn]) { t2 += TONES[tn].rgb[0]; g2 += TONES[tn].rgb[1]; b2 += TONES[tn].rgb[2]; } });
        t2 /= rt.length; g2 /= rt.length; b2 /= rt.length;
        rr = lerp(rr, t2, 0.07); rg = lerp(rg, g2, 0.07); rb = lerp(rb, b2, 0.07);
      }
      var dT = 0, bB = 0;
      if (ph === "discovery" && tr && TONES[tr.emotional_tone]) {
        dT = 0.02;
        if (tc) { var dR = dst(tc.x, tc.y, tr.reveal_position.x, tr.reveal_position.y) / Math.sqrt(2); if (dR < 0.6) { var pf = 1 - dR / 0.6; dT += pf * 0.18; bB = pf * 0.05; } }
      }
      for (var x = 0; x < w; x += step) { for (var y = 0; y < h; y += step) {
        var nv = ((n1(x*0.002+t*0.08,y*0.002+t*0.06)*0.45 + n2(x*0.004+t*0.04+30,y*0.004-t*0.05+30)*0.35 + n3(x*0.008+t*0.12+60,y*0.008+t*0.09+60)*0.2)+1)/2*breath;
        var cr2 = rr, cg2 = rg, cb2 = rb;
        if (dT > 0 && tr) { var dr2 = TONES[tr.emotional_tone].rgb; cr2 = lerp(cr2,dr2[0],dT); cg2 = lerp(cg2,dr2[1],dT); cb2 = lerp(cb2,dr2[2],dT); }
        var lum = nv * (0.05 + bB);
        ctx.fillStyle = "rgb(" + Math.round(cr2+lum*32) + "," + Math.round(cg2+lum*26) + "," + Math.round(cb2+lum*40) + ")";
        ctx.fillRect(x, y, step, step);
      }}

      // Residue echo (last revealed trace as ghost)
      if (re && ph === "idle") {
        var eA = Math.max(0, 0.06 * (1 - (Date.now() - re.at) / 300000));
        if (eA > 0.003 && re.path && re.path.length > 1) {
          var eT = TONES[re.tone]; if (eT) {
            ctx.globalAlpha = eA; ctx.globalCompositeOperation = "screen";
            ctx.beginPath(); ctx.strokeStyle = eT.primary; ctx.lineWidth = 1; ctx.lineCap = "round";
            re.path.forEach(function(p2, i) { var px = (p2.x*0.3+0.35)*w, py = (p2.y*0.3+0.3)*h; i === 0 ? ctx.moveTo(px,py) : ctx.lineTo(px,py); });
            ctx.stroke(); ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";
          }
        }
      }

      // NOTE: Artwork underlay REMOVED — artwork only visible during Glimpse

      // Discovery rendering
      if (ph === "discovery" && tr) {
        var tone = tr.emotional_tone;
        var tx = tr.reveal_position.x * w, ty = tr.reveal_position.y * h;
        var td = TONES[tone];
        var cr3 = td ? td.rgb[0] : 180, cg3 = td ? td.rgb[1] : 180, cb3 = td ? td.rgb[2] : 220;
        var sig = tr.signal_type, sp = 0.5 + Math.sin(t*2) * 0.3;

        // Signal rendering
        if (sig === "shimmer") { for (var si = 0; si < 20; si++) { var sx = n1(si*7.3+t*0.3,t*0.2+si)*0.5+0.5, sy = n1(si*5.1+t*0.25,t*0.15+si+50)*0.5+0.5; ctx.fillStyle = "rgba("+cr3+","+cg3+","+cb3+","+(sp*(0.04+Math.sin(t*3+si*1.3)*0.03))+")"; ctx.beginPath(); ctx.arc(sx*w,sy*h,2.5,0,Math.PI*2); ctx.fill(); } }
        else if (sig === "pulse") { for (var ri = 0; ri < 3; ri++) { var pr2 = 20+Math.abs(Math.sin(t*0.9+ri*1.3))*Math.min(w,h)*0.25; ctx.strokeStyle = "rgba("+cr3+","+cg3+","+cb3+","+(0.04*(1-pr2/(Math.min(w,h)*0.25)))+")"; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(w/2,h/2,pr2,0,Math.PI*2); ctx.stroke(); } }
        else if (sig === "drift") { var dx2 = Math.sin(t*0.2)*w*0.3+w/2, dy2 = Math.cos(t*0.28)*h*0.3+h/2; var g3 = ctx.createRadialGradient(dx2,dy2,0,dx2,dy2,60); g3.addColorStop(0,"rgba("+cr3+","+cg3+","+cb3+","+(sp*0.05)+")"); g3.addColorStop(1,"transparent"); ctx.fillStyle = g3; ctx.beginPath(); ctx.arc(dx2,dy2,60,0,Math.PI*2); ctx.fill(); }
        else if (sig === "flicker") { for (var fi = 0; fi < 6; fi++) { if (Math.random() > 0.4) { ctx.fillStyle = "rgba("+cr3+","+cg3+","+cb3+","+(0.03+Math.random()*0.05)+")"; ctx.beginPath(); ctx.arc(Math.random()*w,Math.random()*h,1.5+Math.random()*2,0,Math.PI*2); ctx.fill(); } } }
        else if (sig === "density") { var nx = n1(t*0.15,0)*0.3+0.35, ny = n1(0,t*0.12)*0.3+0.35; for (var ddx = -55; ddx < 55; ddx += 8) { for (var ddy = -55; ddy < 55; ddy += 8) { var dd = dst(0,0,ddx,ddy); if (dd < 55) { var nv2 = n1((nx*w+ddx)*0.012+t,(ny*h+ddy)*0.012); ctx.fillStyle = "rgba("+cr3+","+cg3+","+cb3+","+(0.05*(1-dd/55)*(nv2+1)/2)+")"; ctx.fillRect(nx*w+ddx,ny*h+ddy,6,6); } } } }
        else { for (var wi = 0; wi < w; wi += 5) { var wy = h/2+Math.sin(wi*0.01+t*1.1)*25; ctx.fillStyle = "rgba("+cr3+","+cg3+","+cb3+",0.025)"; ctx.fillRect(wi,wy,4,2); } }

        // Proximity zones
        if (tc) {
          var dN2 = dst(tc.x, tc.y, tr.reveal_position.x, tr.reveal_position.y) / Math.sqrt(2);
          if (dN2 < 0.10) {
            var z4 = 1-dN2/0.10;
            var bl = ctx.createRadialGradient(tx,ty,0,tx,ty,25+z4*70); bl.addColorStop(0,"rgba("+cr3+","+cg3+","+cb3+","+(z4*0.45)+")"); bl.addColorStop(0.4,"rgba("+cr3+","+cg3+","+cb3+","+(z4*0.15)+")"); bl.addColorStop(1,"transparent"); ctx.fillStyle = bl; ctx.beginPath(); ctx.arc(tx,ty,25+z4*70,0,Math.PI*2); ctx.fill();
            ctx.strokeStyle = "rgba("+cr3+","+cg3+","+cb3+","+(z4*0.15)+")"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(tc.x*w,tc.y*h); ctx.lineTo(tx,ty); ctx.stroke();
            var gl4 = ctx.createRadialGradient(tc.x*w,tc.y*h,0,tc.x*w,tc.y*h,60); gl4.addColorStop(0,"rgba("+cr3+","+cg3+","+cb3+",0.4)"); gl4.addColorStop(1,"transparent"); ctx.fillStyle = gl4; ctx.beginPath(); ctx.arc(tc.x*w,tc.y*h,60,0,Math.PI*2); ctx.fill();
            pts.forEach(function(p2) { var px = p2.x*w, py = p2.y*h, pd = dst(px,py,tc.x*w,tc.y*h), inf = Math.max(0,1-pd/120); p2.vx += (tc.x*w-px)*inf*0.0015; p2.vy += (tc.y*h-py)*inf*0.0015; p2.vx *= 0.9; p2.vy *= 0.9; p2.x += p2.vx/w; p2.y += p2.vy/h; p2.x = ((p2.x%1)+1)%1; p2.y = ((p2.y%1)+1)%1; ctx.fillStyle = "rgba("+cr3+","+cg3+","+cb3+","+(p2.ba*5)+")"; ctx.beginPath(); ctx.arc(p2.x*w,p2.y*h,p2.size*2,0,Math.PI*2); ctx.fill(); });
          } else if (dN2 < 0.30) {
            var z3 = 1-(dN2-0.10)/0.20;
            var gl = ctx.createRadialGradient(tc.x*w,tc.y*h,0,tc.x*w,tc.y*h,40+z3*140); gl.addColorStop(0,"rgba("+cr3+","+cg3+","+cb3+","+(z3*0.35)+")"); gl.addColorStop(0.3,"rgba("+cr3+","+cg3+","+cb3+","+(z3*0.12)+")"); gl.addColorStop(1,"transparent"); ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(tc.x*w,tc.y*h,40+z3*140,0,Math.PI*2); ctx.fill();
            for (var oi = 0; oi < 8; oi++) { var oA = (oi/8)*Math.PI*2+t*2, oR = 25+z3*15+Math.sin(t*3+oi)*5; ctx.fillStyle = "rgba("+cr3+","+cg3+","+cb3+","+(z3*0.3)+")"; ctx.beginPath(); ctx.arc(tc.x*w+Math.cos(oA)*oR,tc.y*h+Math.sin(oA)*oR,2+z3,0,Math.PI*2); ctx.fill(); }
            pts.forEach(function(p2) { var px = p2.x*w, py = p2.y*h, pd = dst(px,py,tc.x*w,tc.y*h), inf = Math.max(0,1-pd/(80+z3*50)); p2.vx += (tc.x*w-px)*inf*0.001*z3; p2.vy += (tc.y*h-py)*inf*0.001*z3; p2.vx *= 0.92; p2.vy *= 0.92; p2.x += p2.vx/w; p2.y += p2.vy/h; p2.x = ((p2.x%1)+1)%1; p2.y = ((p2.y%1)+1)%1; ctx.fillStyle = "rgba("+cr3+","+cg3+","+cb3+","+(p2.ba*(1+z3*4))+")"; ctx.beginPath(); ctx.arc(p2.x*w,p2.y*h,p2.size*(1+z3),0,Math.PI*2); ctx.fill(); });
          } else if (dN2 < 0.60) {
            var z2 = 1-(dN2-0.30)/0.30;
            var hz = ctx.createRadialGradient(tc.x*w,tc.y*h,0,tc.x*w,tc.y*h,70+z2*50); hz.addColorStop(0,"rgba("+cr3+","+cg3+","+cb3+","+(z2*0.22)+")"); hz.addColorStop(1,"transparent"); ctx.fillStyle = hz; ctx.beginPath(); ctx.arc(tc.x*w,tc.y*h,70+z2*50,0,Math.PI*2); ctx.fill();
            pts.forEach(function(p2) { var px = p2.x*w, py = p2.y*h, pd = dst(px,py,tc.x*w,tc.y*h), inf = Math.max(0,1-pd/(150+z2*80)); p2.vx += (tc.x*w-px)*inf*0.0003*z2; p2.vy += (tc.y*h-py)*inf*0.0003*z2; p2.vx *= 0.93; p2.vy *= 0.93; p2.x += p2.vx/w; p2.y += p2.vy/h; p2.x = ((p2.x%1)+1)%1; p2.y = ((p2.y%1)+1)%1; ctx.fillStyle = "rgba("+cr3+","+cg3+","+cb3+","+(p2.ba*(1+z2*3))+")"; ctx.beginPath(); ctx.arc(p2.x*w,p2.y*h,p2.size*(1+z2*0.5),0,Math.PI*2); ctx.fill(); });
          } else {
            pts.forEach(function(p2) { p2.vx *= 0.88; p2.vy *= 0.88; p2.x += (Math.random()-0.5)*0.001; p2.y += (Math.random()-0.5)*0.001; });
          }
          if (hp > 0) {
            ctx.strokeStyle = "rgba("+cr3+","+cg3+","+cb3+","+(0.4+hp*0.6)+")"; ctx.lineWidth = 3;
            ctx.beginPath(); ctx.arc(tc.x*w,tc.y*h,26,-Math.PI/2,-Math.PI/2+hp*Math.PI*2); ctx.stroke();
            var ig = ctx.createRadialGradient(tc.x*w,tc.y*h,0,tc.x*w,tc.y*h,22); ig.addColorStop(0,"rgba("+cr3+","+cg3+","+cb3+","+(hp*0.5)+")"); ig.addColorStop(1,"transparent"); ctx.fillStyle = ig; ctx.beginPath(); ctx.arc(tc.x*w,tc.y*h,22,0,Math.PI*2); ctx.fill();
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
      afR.current = requestAnimationFrame(frame);
    }
    afR.current = requestAnimationFrame(frame);
    return function() { cancelAnimationFrame(afR.current); window.removeEventListener("resize", resize); };
  }, []);

  // ── Touch handlers ──
  var REVEAL_MS = 1500;
  var startHold = useCallback(function() {
    if (holdRef.current) return; hpR.current = 0; setHoldProg(0);
    soundFound(); hapticMedium();
    var s = Date.now();
    holdRef.current = setInterval(function() {
      var p2 = Math.min(1, (Date.now()-s)/REVEAL_MS); hpR.current = p2; setHoldProg(p2);
      if (p2 >= 1) { clearInterval(holdRef.current); holdRef.current = null; hapticReveal(); setPhase("revealing"); }
    }, 16);
  }, []);
  var stopHold = useCallback(function() { if (holdRef.current) { clearInterval(holdRef.current); holdRef.current = null; } hpR.current = 0; setHoldProg(0); }, []);

  var lastProxZone = useRef(-1);
  var onDown = useCallback(function(ev) {
    if (phase !== "discovery" || !trace) return;
    var r = ev.currentTarget.getBoundingClientRect(), x = (ev.clientX-r.left)/r.width, y = (ev.clientY-r.top)/r.height;
    setTouch({ x, y }); tcR.current = { x, y }; hapticTap();
    if (dst(x, y, trace.reveal_position.x, trace.reveal_position.y) / Math.sqrt(2) < (trace.search_radius || 0.08)) startHold();
  }, [phase, trace, startHold]);

  var onMove = useCallback(function(ev) {
    if (phase !== "discovery" || !trace) return;
    var r = ev.currentTarget.getBoundingClientRect(), x = (ev.clientX-r.left)/r.width, y = (ev.clientY-r.top)/r.height;
    setTouch({ x, y }); tcR.current = { x, y };
    var d = dst(x, y, trace.reveal_position.x, trace.reveal_position.y) / Math.sqrt(2);
    // Proximity feedback — trigger on zone changes, not every frame
    var zone = d < 0.08 ? 4 : d < 0.15 ? 3 : d < 0.30 ? 2 : d < 0.50 ? 1 : 0;
    if (zone > 0 && zone !== lastProxZone.current) { hapticProximity(zone / 4); }
    lastProxZone.current = zone;
    if (d < (trace.search_radius || 0.08)) { if (!holdRef.current) startHold(); } else stopHold();
  }, [phase, trace, startHold, stopHold]);

  var onUp = useCallback(function() { setTouch(null); tcR.current = null; stopHold(); }, [stopHold]);

  // ── Capture trace at reveal start ──
  useEffect(function() { if (phase === "revealing" && trace) revealTraceR.current = trace; }, [phase, trace]);

  // ── Reveal done → detect moment (singular!) → or go to glimpse ──
  var onRevealDone = useCallback(async function() {
    soundReveal();
    var tr = revealTraceR.current;
    if (!tr) { setPhase("idle"); var cs = await canSendTrace(user.id); setCanSend(cs); return; }

    try {
      await discoverTrace(tr.id);
    } catch (e) {
      console.error("Discover error:", e);
      setAppError("Failed to save. Check your connection.");
    }

    var path = tr.gesture_data.path;
    setResEcho({ tone: tr.emotional_tone, path: path, at: Date.now() });
    setContribs(function(prev) { return prev.concat([{ tone: tr.emotional_tone, path: path }]); });
    setRecTones(function(prev) { return [tr.emotional_tone].concat(prev).slice(0, 5); });
    setLastTone(tr.emotional_tone);
    setTrace(null);
    revealTraceR.current = null;
    if (onbStepR.current < 2) setOnbStep(2);

    // Detect at most ONE moment (with cooldown + priority)
    try {
      var moment = await detectMoment(pair.id, user.id, tr, tr.emotional_tone);
      if (moment) {
        setCurrentMoment(moment);
        setMTone(moment.tone);
        setMPhase(moment.type + "_intro");
      } else {
        setPhase("glimpse");
      }
    } catch (e) {
      console.warn("Moment detection failed:", e);
      setPhase("glimpse");
    }
    hpR.current = 0;
  }, [user, pair]);

  // ── Finish moment → persist to DB → go to glimpse ──
  var finishMoment = useCallback(async function(extraData) {
    if (currentMoment && pair) {
      // Persist with sender_id so partner's listener knows who sent it
      var extra = Object.assign({}, extraData || {}, { sender_id: user.id });
      await persistMoment(pair.id, currentMoment, extra);
    }
    setCurrentMoment(null);
    setMPhase(null);
    setMTone(null);
    setPhase("glimpse");
  }, [currentMoment, pair, user]);

  // ── Moment transitions ──
  var onIntroTwinDone = useCallback(function() { soundMoment(); hapticMoment(); setMPhase("whisper"); }, []);
  var onIntroAmpDone = useCallback(function() { soundMoment(); hapticMoment(); setMPhase("pulse"); }, []);
  var onIntroConvDone = useCallback(function() { soundMoment(); hapticMoment(); setMPhase("echo"); }, []);

  var onWhisperSelect = useCallback(function(w) {
    hapticLight();
    setMPhase("whisperShow"); setWhisper(w);
    finishMoment({ whisper_word: w });
  }, [finishMoment]);
  var onWhisperTimeout = useCallback(function() { finishMoment(null); }, [finishMoment]);
  var onWhisperDone = useCallback(function() { setWhisper(null); }, []);

  var onEchoSelect = useCallback(function(m) {
    hapticLight();
    setMPhase("echoShow"); setEchoM(m);
    finishMoment({ echo_mark: m.g, echo_name: m.n });
  }, [finishMoment]);
  var onEchoTimeout = useCallback(function() { finishMoment(null); }, [finishMoment]);
  var onEchoDone = useCallback(function() { setEchoM(null); }, []);

  var onPulseCapture = useCallback(function(p2) {
    if (p2) { setPendPulse(p2); hapticSend(); }
    finishMoment(p2 ? { pulse_path: p2 } : null);
  }, [finishMoment]);

  var onGlimpseDone = useCallback(async function() {
    setPhase("idle");
    try {
      var cs = await canSendTrace(user.id);
      setCanSend(cs);
    } catch (e) { setCanSend(false); }
    if (onbStepR.current < 4 && onbStepR.current >= 2) setOnbStep(2);
  }, [user]);

  // ── Send trace ──
  var onSendTrace = useCallback(async function(data) {
    setPhase("idle"); setCanSend(false); setSentTone(data.tone);
    soundSend(); hapticSend();
    if (onbStepR.current < 4) setOnbStep(4);
    try {
      await sendTrace(pair.id, user.id, partnerId, data.path, data.tone);
      setContribs(function(prev) { return prev.concat([{ tone: data.tone, path: data.path }]); });
      setRecTones(function(prev) { return [data.tone].concat(prev).slice(0, 5); });
      setLastTone(data.tone);
    } catch (err) {
      console.error("Send error:", err);
      setCanSend(true);
      setAppError("Failed to send trace. Try again.");
    }
  }, [pair, user, partnerId]);

  // ── Dismiss incoming partner moment ──
  var dismissIncoming = useCallback(function() { setIncomingMoment(null); }, []);

  // ── Export artwork as image ──
  var exportArtwork = useCallback(function() {
    if (contribs.length === 0) return;
    var c = document.createElement("canvas");
    var size = 1080; c.width = size; c.height = size;
    var ctx = c.getContext("2d");
    ctx.fillStyle = "#0A0A12"; ctx.fillRect(0, 0, size, size);
    contribs.forEach(function(ct) {
      if (!ct.path || ct.path.length < 2) return;
      drawGesturePath(ctx, ct.path, ct.tone, size, size, 0.7, 10);
    });
    // Add subtle text
    ctx.fillStyle = "rgba(255,255,255,0.08)"; ctx.font = "200 14px 'Outfit', sans-serif";
    ctx.textAlign = "center"; ctx.fillText("resonance", size / 2, size - 30);
    try {
      var link = document.createElement("a");
      link.download = "resonance-artwork.png";
      link.href = c.toDataURL("image/png");
      link.click();
    } catch (e) {
      // Fallback: try share API
      c.toBlob(function(blob) {
        if (navigator.share && blob) {
          navigator.share({ files: [new File([blob], "resonance-artwork.png", { type: "image/png" })] }).catch(function() {});
        }
      });
    }
  }, [contribs]);

  // ── Derived values ──
  var dNorm = 1, trRgb = "255,255,255";
  if (touch && trace) dNorm = dst(touch.x, touch.y, trace.reveal_position.x, trace.reveal_position.y) / Math.sqrt(2);
  if (trace && TONES[trace.emotional_tone]) trRgb = TONES[trace.emotional_tone].rgb.join(",");
  var pxL = dNorm < 0.03 ? "hold gently\u2026" : dNorm < 0.10 ? "right here\u2026" : dNorm < 0.25 ? "getting warmer\u2026" : dNorm < 0.50 ? "something faint\u2026" : null;
  var pxA = dNorm < 0.03 ? 0.8 : dNorm < 0.10 ? 0.6 : dNorm < 0.25 ? 0.4 : dNorm < 0.50 ? 0.22 : 0;
  var mRgb = mTone && TONES[mTone] ? TONES[mTone].rgb.join(",") : "255,255,255";
  var bottomColor = lastTone ? TONES[lastTone].primary : "rgba(255,255,255,0.2)";

  return (
    <div style={{ width:"100%",height:"100vh",position:"relative",overflow:"hidden",background:"#0A0A12",userSelect:"none",WebkitUserSelect:"none",paddingTop:"env(safe-area-inset-top)",paddingBottom:"env(safe-area-inset-bottom)" }}>
      <canvas ref={cvRef} style={{ position:"absolute",inset:0,width:"100%",height:"100%",touchAction:"none",cursor:phase==="discovery"?"crosshair":"default" }}
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={onUp} />

      {/* Error toast */}
      {appError ? <div style={{ position:"absolute",top:50,left:"50%",transform:"translateX(-50%)",zIndex:60,padding:"10px 20px",borderRadius:12,background:"rgba(196,30,58,0.12)",border:"1px solid rgba(196,30,58,0.2)",fontFamily:FONT,animation:"fadeIn 0.5s ease" }}>
        <span style={{ color:"rgba(196,30,58,0.7)",fontSize:10,letterSpacing:"0.05em",fontWeight:300 }}>{appError}</span>
      </div> : null}

      {/* Dissolved by partner overlay */}
      {dissolved ? <div style={{ position:"absolute",inset:0,zIndex:70,background:"rgba(6,6,12,0.97)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",fontFamily:FONT,animation:"fadeIn 1s ease" }}>
        <div style={{ width:3,height:3,borderRadius:"50%",background:"rgba(255,255,255,0.3)",marginBottom:24 }} />
        <div style={{ color:"rgba(255,255,255,0.25)",fontSize:11,letterSpacing:"0.2em",fontWeight:200,marginBottom:12 }}>CONNECTION DISSOLVED</div>
        <div style={{ color:"rgba(255,255,255,0.12)",fontSize:10,letterSpacing:"0.08em",fontWeight:200,lineHeight:1.8,textAlign:"center",marginBottom:40 }}>your person ended the connection</div>
        <div onClick={function() { window.location.reload(); }} style={{ padding:"14px 40px",borderRadius:24,border:"1px solid rgba(255,255,255,0.08)",background:"rgba(255,255,255,0.03)",cursor:"pointer",color:"rgba(255,255,255,0.4)",fontSize:12,letterSpacing:"0.18em",fontWeight:200 }}>START OVER</div>
      </div> : null}

      {/* PWA install prompt (only in browser, not standalone) */}
      <InstallPrompt />

      {/* Settings gear */}
      {phase === "idle" ? <div style={{ position:"absolute",top:18,left:0,right:0,zIndex:11,display:"flex",justifyContent:"space-between",alignItems:"center",padding:"0 18px",pointerEvents:"none" }}>
        <div style={{ display:"flex",alignItems:"center",gap:8,pointerEvents:"none" }}>
          {partnerHere ? <div style={{ display:"flex",alignItems:"center",gap:5 }}>
            <div style={{ width:4,height:4,borderRadius:"50%",background:"rgba(212,165,116,0.6)",animation:"gentlePulse 3s ease infinite" }} />
            <span style={{ color:"rgba(212,165,116,0.3)",fontSize:8,letterSpacing:"0.12em",fontWeight:200 }}>here</span>
          </div> : null}
          {dayCount > 1 && !partnerHere ? <span style={{ color:"rgba(255,255,255,0.08)",fontSize:8,letterSpacing:"0.1em",fontWeight:200 }}>day {dayCount}</span> : null}
        </div>
        <div onClick={function() { setShowSettings(true); }} style={{ cursor:"pointer",opacity:0.25,fontSize:18,color:"white",pointerEvents:"auto" }}>{"\u2699"}</div>
      </div> : null}
      {showSettings ? <div style={{ position:"absolute",inset:0,zIndex:48,display:"flex",alignItems:"flex-end",justifyContent:"center" }} onClick={function() { setShowSettings(false); }}>
        <div style={{ position:"absolute",inset:0,background:"rgba(0,0,0,0.5)" }} />
        <div onClick={function(ev) { ev.stopPropagation(); }} style={{ position:"relative",width:"100%",maxWidth:400,background:"#111118",borderRadius:"20px 20px 0 0",padding:"28px 24px 40px",fontFamily:FONT }}>
          <div style={{ width:32,height:3,borderRadius:2,background:"rgba(255,255,255,0.15)",margin:"0 auto 24px" }} />
          <div style={{ color:"rgba(255,255,255,0.4)",fontSize:9,letterSpacing:"0.25em",fontWeight:200,marginBottom:20 }}>SETTINGS</div>
          <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16 }}>
            <div style={{ color:"rgba(255,255,255,0.25)",fontSize:10,letterSpacing:"0.08em",fontWeight:200 }}>
              Connected{dayCount > 1 ? " \u00B7 day " + dayCount : ""}
            </div>
            {partnerHere ? <div style={{ display:"flex",alignItems:"center",gap:6 }}>
              <div style={{ width:5,height:5,borderRadius:"50%",background:"rgba(212,165,116,0.6)" }} />
              <span style={{ color:"rgba(212,165,116,0.5)",fontSize:9,fontWeight:200 }}>here now</span>
            </div> : null}
          </div>

          {/* Reunion */}
          <div style={{ padding:"16px 0",borderTop:"1px solid rgba(255,255,255,0.06)" }}>
            {reunion && reunion.type === "reunion" && reunion.status === "accepted" ? (
              <div style={{ color:"rgba(212,165,116,0.7)",fontSize:11,fontWeight:300,letterSpacing:"0.1em" }}>
                Reunion: {new Date(reunion.proposed_date + "T00:00:00").toLocaleDateString(undefined, { day:"numeric",month:"long" })}
              </div>
            ) : reunion && reunion.type === "reunion" && reunion.status === "pending" && reunion.proposed_by === user.id ? (
              <div style={{ color:"rgba(255,255,255,0.35)",fontSize:11,fontWeight:200,letterSpacing:"0.1em" }}>
                Waiting for your person to accept{"\u2026"}
              </div>
            ) : (
              <div onClick={function() { setShowSettings(false); setReunionUI("propose"); }} style={{ color:"rgba(212,165,116,0.7)",fontSize:11,fontWeight:300,letterSpacing:"0.1em",cursor:"pointer" }}>
                Plan a Reunion
              </div>
            )}
          </div>

          {/* Reveal Artwork */}
          {contribs.length > 0 ? <div style={{ padding:"16px 0",borderTop:"1px solid rgba(255,255,255,0.06)" }}>
            <div onClick={function() { setShowSettings(false); setReunionUI("confirm_reveal"); }} style={{ color:"rgba(212,165,116,0.7)",fontSize:11,fontWeight:300,letterSpacing:"0.1em",cursor:"pointer" }}>
              Reveal Artwork
            </div>
            <div style={{ color:"rgba(255,255,255,0.2)",fontSize:9,fontWeight:200,marginTop:6 }}>see what you created together</div>
          </div> : null}

          {/* Start Fresh */}
          {contribs.length > 0 ? <div style={{ padding:"16px 0",borderTop:"1px solid rgba(255,255,255,0.06)" }}>
            <div onClick={function() { setShowSettings(false); setReunionUI("confirm_reset"); }} style={{ color:"rgba(255,255,255,0.45)",fontSize:11,fontWeight:200,letterSpacing:"0.1em",cursor:"pointer" }}>
              Start Fresh
            </div>
            <div style={{ color:"rgba(255,255,255,0.2)",fontSize:9,fontWeight:200,marginTop:6 }}>both need to agree · artwork will be cleared</div>
          </div> : null}

          {/* Export Artwork */}
          {contribs.length > 0 ? <div style={{ padding:"16px 0",borderTop:"1px solid rgba(255,255,255,0.06)" }}>
            <div onClick={function() { setShowSettings(false); exportArtwork(); }} style={{ color:"rgba(255,255,255,0.45)",fontSize:11,fontWeight:200,letterSpacing:"0.1em",cursor:"pointer" }}>
              Save Artwork as Image
            </div>
          </div> : null}

          {/* Dissolve */}
          <div style={{ padding:"16px 0",borderTop:"1px solid rgba(255,255,255,0.06)" }}>
            <div onClick={function() { if (confirm("Dissolve this connection? This cannot be undone.")) { setShowSettings(false); onDissolve(); } }} style={{ color:"rgba(196,30,58,0.6)",fontSize:11,fontWeight:200,letterSpacing:"0.1em",cursor:"pointer" }}>Dissolve Connection</div>
          </div>
        </div>
      </div> : null}

      {/* Status */}
      <div style={{ position:"absolute",top:22,left:0,right:0,textAlign:"center",zIndex:10,pointerEvents:"none",fontFamily:FONT }}>
        {phase === "discovery" && trace ? <div style={{ animation:"fadeIn 1s ease" }}>
          <span style={{ color:"rgba("+trRgb+",0.65)",fontSize:12,letterSpacing:"0.28em",fontWeight:300,textShadow:"0 0 25px rgba("+trRgb+",0.2)" }}>SOMETHING IS HERE</span>
          {onbStep === 0 ? <div style={{ marginTop:6,color:"rgba(255,255,255,0.3)",fontSize:9,letterSpacing:"0.15em",fontWeight:200 }}>someone left something for you</div> : null}
        </div> : null}

        {/* Idle status indicator */}
        {phase === "idle" && !canSend && sentTone ? null /* "YOUR TRACE IS OUT THERE" shown at bottom */ : null}
        {phase === "idle" && !canSend && !sentTone && contribs.length === 0 ? <div style={{ animation:"fadeIn 2s ease",marginTop:8 }}>
          <span style={{ color:"rgba(255,255,255,0.25)",fontSize:10,letterSpacing:"0.2em",fontWeight:200 }}>waiting for your first trace</span>
        </div> : null}
      </div>

      {/* Passive reveal notice */}
      {passiveNotice ? <div style={{ position:"absolute",top:"40%",left:0,right:0,textAlign:"center",zIndex:15,pointerEvents:"none",fontFamily:FONT,animation:"fadeIn 0.8s ease" }}>
        <span style={{ color:"rgba(255,255,255,0.3)",fontSize:11,letterSpacing:"0.2em",fontWeight:200 }}>revealing itself{"\u2026"}</span>
      </div> : null}

      {/* Proximity label */}
      {phase === "discovery" && pxL && touch ? <div style={{ position:"absolute",left:(touch.x*100)+"%",top:Math.max(4,touch.y*100-5)+"%",transform:"translate(-50%,-100%)",zIndex:12,pointerEvents:"none",fontFamily:FONT,color:"rgba("+trRgb+","+pxA+")",fontSize:12,letterSpacing:"0.12em",fontWeight:200,fontStyle:"italic",textShadow:dNorm<0.1?"0 0 15px rgba("+trRgb+",0.3)":"none",transition:"color 0.3s" }}>{pxL}</div> : null}

      {/* Onboarding hints */}
      {phase === "discovery" && onbStep <= 1 ? <div style={{ position:"absolute",bottom:70,left:0,right:0,textAlign:"center",zIndex:10,pointerEvents:"none",fontFamily:FONT,animation:"fadeIn 2s ease" }}>
        <div style={{ display:"inline-block",padding:"10px 24px",borderRadius:20,background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.08)" }}>
          <span style={{ color:"rgba(255,255,255,0.4)",fontSize:11,letterSpacing:"0.14em",fontWeight:200 }}>touch the space {"\u00B7"} move slowly {"\u00B7"} find the trace</span></div></div> : null}
      {phase === "idle" && canSend && (onbStep === 2 || idleT >= 1) ? <div style={{ position:"absolute",bottom:55,left:0,right:0,textAlign:"center",zIndex:10,pointerEvents:"none",fontFamily:FONT,animation:"fadeIn 1.5s ease" }}>
        <div style={{ display:"inline-block",padding:"8px 20px",borderRadius:16,background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.08)" }}>
          <span style={{ color:"rgba(255,255,255,0.35)",fontSize:10,letterSpacing:"0.14em",fontWeight:200 }}>{"\u2191"} tap the light to send a trace</span></div></div> : null}

      {/* Reveal */}
      {phase === "revealing" && trace ? <RevealCanvas tone={trace.emotional_tone} path={trace.gesture_data.path} amplified={trace.gesture_data.path && analyzeGesture(trace.gesture_data.path).intensity > 0.5} pulseGesture={pendPulse} onDone={onRevealDone} /> : null}

      {/* Glimpse */}
      {phase === "glimpse" && contribs.length > 0 ? <GlimpseCanvas contribs={contribs} onDone={onGlimpseDone} /> : null}

      {/* Trace creation */}
      {phase === "creating" ? <TraceCreationUI onSend={onSendTrace} onCancel={function() { setPhase("idle"); }} guided={onbStep <= 3} /> : null}

      {/* Moment intros */}
      {mPhase === "twin_connection_intro" ? <MomentIntro rgb={mRgb} label="SOMETHING RARE HAPPENED" onDone={onIntroTwinDone} /> : null}
      {mPhase === "amplified_reveal_intro" ? <MomentIntro rgb={mRgb} label="THIS ONE FELT DIFFERENT" onDone={onIntroAmpDone} /> : null}
      {mPhase === "trace_convergence_intro" ? <MomentIntro rgb={mRgb} label="YOUR TRACES CONVERGED" onDone={onIntroConvDone} /> : null}

      {/* Moment pickers */}
      {mPhase === "whisper" ? <WhisperPickerUI rgb={mRgb} onSelect={onWhisperSelect} onTimeout={onWhisperTimeout} /> : null}
      {mPhase === "whisperShow" && whisper ? <WhisperDisplayUI word={whisper} rgb={mRgb} onDone={onWhisperDone} /> : null}
      {mPhase === "echo" ? <EchoMarkPickerUI rgb={mRgb} onSelect={onEchoSelect} onTimeout={onEchoTimeout} /> : null}
      {mPhase === "echoShow" && echoM ? <EchoMarkDisplayUI mark={echoM} rgb={mRgb} onDone={onEchoDone} /> : null}
      {mPhase === "pulse" ? <PulseCaptureUI tone={mTone} rgb={mRgb} onCapture={onPulseCapture} /> : null}

      {/* Incoming partner moment display */}
      {incomingMoment ? <IncomingMomentDisplay event={incomingMoment} pair={pair} onDismiss={dismissIncoming} /> : null}

      {/* Proposal overlays */}
      {reunionUI === "propose" ? <ReunionPropose pair={pair} user={user} onDone={function(reu) { if (reu) setReunion(reu); setReunionUI(null); }} /> : null}

      {/* Confirm: Reveal Artwork */}
      {reunionUI === "confirm_reveal" ? <ConfirmOverlay
        title="REVEAL ARTWORK" text={"see everything you\u2019ve created together\nyour person will need to agree too"}
        confirmLabel="SEND REQUEST" confirmColor="212,165,116"
        onConfirm={function() { proposeReveal(pair.id, user.id).then(function() { setReunionUI(null); }).catch(function(e) { console.error(e); setReunionUI(null); }); }}
        onCancel={function() { setReunionUI(null); }}
      /> : null}

      {/* Confirm: Start Fresh */}
      {reunionUI === "confirm_reset" ? <ConfirmOverlay
        title="START FRESH" text={"all traces and artwork will be cleared\nyou can build something new together\nyour person will need to agree too"}
        confirmLabel="SEND REQUEST" confirmColor="255,255,255"
        onConfirm={function() { proposeReset(pair.id, user.id).then(function() { setReunionUI(null); }).catch(function(e) { console.error(e); setReunionUI(null); }); }}
        onCancel={function() { setReunionUI(null); }}
      /> : null}

      {/* Incoming: Reunion */}
      {reunionUI === "incoming_reunion" && reunion ? <ReunionIncoming reunion={reunion} onRespond={function(accept) { respondToProposal(reunion.id, accept).then(function() { setReunionUI(null); if (accept) setReunion(Object.assign({}, reunion, { status: "accepted" })); }); }} /> : null}

      {/* Incoming: Reset */}
      {reunionUI === "incoming_reset" && reunion ? <ResetIncoming onRespond={function(accept) {
        respondToProposal(reunion.id, accept).then(function() {
          if (accept) {
            executeResetArtwork(pair.id).then(function() {
              completeProposal(reunion.id).catch(function(){});
              setContribs([]); setRecTones([]); setReunion(null); setReunionUI(null);
            }).catch(function(e) { console.error("Reset error:", e); setReunionUI(null); });
          } else { setReunionUI(null); }
        });
      }} /> : null}

      {/* Incoming: Reveal */}
      {reunionUI === "incoming_reveal" && reunion ? <ConfirmOverlay
        title="REVEAL ARTWORK" text={"your person wants to see\nwhat you\u2019ve created together"}
        confirmLabel="REVEAL" confirmColor="212,165,116" cancelLabel="NOT YET"
        onConfirm={function() { respondToProposal(reunion.id, true).then(function() { setReunion(Object.assign({}, reunion, { status: "accepted" })); setReunionUI("reveal"); }); }}
        onCancel={function() { respondToProposal(reunion.id, false).then(function() { setReunionUI(null); }); }}
      /> : null}

      {/* Artwork Reveal */}
      {reunionUI === "reveal" ? <ReunionReveal contribs={contribs} reunion={reunion} onDone={function() {
        // Don't completeProposal here — partner might still be watching
        // Mark as seen locally so it doesn't re-trigger on reload
        if (reunion) { try { sessionStorage.setItem("seen_reveal_" + reunion.id, "1"); } catch(e) {} }
        setReunionUI("post_reveal");
      }} /> : null}

      {/* Post-Reveal: Start fresh option */}
      {reunionUI === "post_reveal" ? <PostRevealPrompt onStartFresh={function() {
        proposeReset(pair.id, user.id).then(function() { setReunionUI(null); }).catch(function(e) { console.error(e); setReunionUI(null); });
      }} onKeep={function() { setReunion(null); setReunionUI(null); }} /> : null}

      {/* Bottom affordance */}
      {phase === "idle" || phase === "discovery" ? (
        <div style={{ position:"absolute",bottom:0,left:0,right:0,zIndex:10,fontFamily:FONT }}>
          {canSend ? <div onClick={function() { if (onbStep === 2) setOnbStep(3); setPhase("creating"); }} style={{ height:50,display:"flex",alignItems:"flex-end",justifyContent:"center",cursor:"pointer",paddingBottom:16 }}>
            <div style={{ width:"58%",height:3,borderRadius:2,background:"linear-gradient(90deg, transparent, "+bottomColor+", transparent)",animation:"breathe 5s ease-in-out infinite" }} /></div>
          : phase === "idle" && sentTone ? <div style={{ display:"flex",flexDirection:"column",alignItems:"center",paddingBottom:20,gap:6 }}>
            <div style={{ width:7,height:7,borderRadius:"50%",background:TONES[sentTone]?TONES[sentTone].primary:"#555",boxShadow:"0 0 16px "+(TONES[sentTone]?TONES[sentTone].primary:"#555")+"77",animation:"gentlePulse 3s ease-in-out infinite" }} />
            <span style={{ color:(TONES[sentTone]?TONES[sentTone].primary:"#888")+"BB",fontSize:9,letterSpacing:"0.16em",fontWeight:200 }}>YOUR TRACE IS OUT THERE</span></div>
          : null}
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
    var dur = extra.whisper_word ? 8000 : extra.echo_mark ? 10000 : 6000;
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
      <div style={{ marginBottom:12,color:"rgba(255,255,255,"+(al*0.18)+")",fontSize:8,letterSpacing:"0.3em",fontWeight:200 }}>A WHISPER FROM YOUR PERSON</div>
      <span style={{ fontSize:30,fontWeight:200,letterSpacing:"0.35em",color:"rgba("+rgb+","+(al*0.7)+")",textShadow:"0 0 35px rgba("+rgb+","+(al*0.25)+")" }}>{extra.whisper_word}</span>
    </div>;
  }

  // Echo mark from partner
  if (extra.echo_mark) {
    return <div style={{ position:"absolute",top:"30%",left:"50%",transform:"translate(-50%,-50%)",zIndex:9,pointerEvents:"none",fontFamily:FONT,textAlign:"center" }}>
      <div style={{ marginBottom:12,color:"rgba(255,255,255,"+(al*0.18)+")",fontSize:8,letterSpacing:"0.3em",fontWeight:200 }}>A MARK LEFT FOR YOU</div>
      <span style={{ fontSize:42,color:"rgba("+rgb+","+(al*0.5)+")",textShadow:"0 0 25px rgba("+rgb+","+(al*0.15)+")" }}>{extra.echo_mark}</span>
    </div>;
  }

  // Pulse gesture — subtle indicator
  return <div style={{ position:"absolute",top:22,left:0,right:0,textAlign:"center",zIndex:38,pointerEvents:"none",fontFamily:FONT }}>
    <span style={{ color:"rgba("+rgb+","+(al*0.4)+")",fontSize:10,letterSpacing:"0.2em",fontWeight:200 }}>something resonated</span>
  </div>;
}


// ══════════════════════════════════════
// PWA INSTALL PROMPT
// Shows a subtle banner when not installed as PWA
// ══════════════════════════════════════
function InstallPrompt() {
  var _s = useState(false), show = _s[0], setShow = _s[1];
  var _dip = useState(null), deferredPrompt = _dip[0], setDeferredPrompt = _dip[1];

  useEffect(function() {
    var isStandalone = window.matchMedia("(display-mode: standalone)").matches
      || window.navigator.standalone === true;
    if (isStandalone) return;
    try { if (sessionStorage.getItem("resonance_install_dismissed")) return; } catch(e) {}

    // Android: capture native install prompt
    var handler = function(e) { e.preventDefault(); setDeferredPrompt(e); };
    window.addEventListener("beforeinstallprompt", handler);

    var t = setTimeout(function() { setShow(true); }, 8000);
    return function() { clearTimeout(t); window.removeEventListener("beforeinstallprompt", handler); };
  }, []);

  var dismiss = useCallback(function() {
    setShow(false);
    try { sessionStorage.setItem("resonance_install_dismissed", "1"); } catch(e) {}
  }, []);

  var install = useCallback(function() {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then(function() { setShow(false); });
    }
  }, [deferredPrompt]);

  if (!show) return null;

  var isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent);
  var canNativeInstall = !!deferredPrompt;

  return <div style={{ position:"absolute",inset:0,zIndex:56,display:"flex",alignItems:"center",justifyContent:"center",pointerEvents:"none" }}>
    <div style={{ pointerEvents:"auto",maxWidth:300,padding:"24px 28px",borderRadius:20,background:"rgba(17,17,24,0.95)",border:"1px solid rgba(255,255,255,0.08)",fontFamily:FONT,textAlign:"center",animation:"fadeIn 0.8s ease",backdropFilter:"blur(12px)",WebkitBackdropFilter:"blur(12px)" }}>
      <div style={{ color:"rgba(255,255,255,0.45)",fontSize:11,letterSpacing:"0.15em",fontWeight:300,marginBottom:10 }}>Install Resonance</div>
      {canNativeInstall ? (
        <div>
          <div style={{ color:"rgba(255,255,255,0.25)",fontSize:10,fontWeight:200,marginBottom:18 }}>add to your home screen for the best experience</div>
          <div style={{ display:"flex",gap:12,justifyContent:"center" }}>
            <div onClick={dismiss} style={{ padding:"10px 20px",borderRadius:20,border:"1px solid rgba(255,255,255,0.06)",cursor:"pointer",color:"rgba(255,255,255,0.25)",fontSize:10,fontWeight:200 }}>Later</div>
            <div onClick={install} style={{ padding:"10px 20px",borderRadius:20,border:"1px solid rgba(212,165,116,0.2)",background:"rgba(212,165,116,0.06)",cursor:"pointer",color:"rgba(212,165,116,0.7)",fontSize:10,fontWeight:300 }}>Install</div>
          </div>
        </div>
      ) : isIOS ? (
        <div>
          <div style={{ color:"rgba(255,255,255,0.25)",fontSize:10,fontWeight:200,lineHeight:1.8,marginBottom:16 }}>
            tap <span style={{ fontSize:16,verticalAlign:"middle" }}>{"\u2191"}</span> at the bottom of Safari{"\n"}then choose <em>Add to Home Screen</em>
          </div>
          <div onClick={dismiss} style={{ padding:"10px 20px",borderRadius:20,border:"1px solid rgba(255,255,255,0.06)",cursor:"pointer",color:"rgba(255,255,255,0.3)",fontSize:10,fontWeight:200,display:"inline-block" }}>Got it</div>
        </div>
      ) : (
        <div>
          <div style={{ color:"rgba(255,255,255,0.25)",fontSize:10,fontWeight:200,marginBottom:16 }}>add to your home screen for the best experience</div>
          <div onClick={dismiss} style={{ padding:"10px 20px",borderRadius:20,border:"1px solid rgba(255,255,255,0.06)",cursor:"pointer",color:"rgba(255,255,255,0.3)",fontSize:10,fontWeight:200,display:"inline-block" }}>Got it</div>
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
    <div style={{ color:"rgba(255,255,255,0.35)",fontSize:9,letterSpacing:"0.3em",fontWeight:200,marginBottom:14 }}>{title}</div>
    <div style={{ color:"rgba(255,255,255,0.25)",fontSize:11,fontWeight:200,letterSpacing:"0.06em",lineHeight:1.9,textAlign:"center",whiteSpace:"pre-line",marginBottom:40 }}>{text}</div>
    <div style={{ display:"flex",gap:16 }}>
      <div onClick={onCancel} style={{ padding:"14px 28px",borderRadius:24,border:"1px solid rgba(255,255,255,0.06)",cursor:"pointer",color:"rgba(255,255,255,0.3)",fontSize:11,letterSpacing:"0.15em",fontWeight:200 }}>{cl}</div>
      <div onClick={onConfirm} style={{ padding:"14px 28px",borderRadius:24,border:"1px solid rgba("+cc+",0.2)",background:"rgba("+cc+",0.05)",cursor:"pointer",color:"rgba("+cc+",0.7)",fontSize:11,letterSpacing:"0.15em",fontWeight:300 }}>{confirmLabel}</div>
    </div>
  </div>;
}


// ══════════════════════════════════════
// SUB-COMPONENTS
// ══════════════════════════════════════

function MomentIntro({ rgb, label, onDone }) {
  var _a = useState(0), al = _a[0], sa = _a[1];
  useEffect(function() { var s = Date.now(); var iv = setInterval(function() { var pr = (Date.now()-s)/2200; if (pr >= 1) { clearInterval(iv); onDone(); } else sa(pr<0.3?pr/0.3:pr>0.7?1-(pr-0.7)/0.3:1); }, 20); return function() { clearInterval(iv); }; }, [onDone]);
  return <div style={{ position:"absolute",inset:0,zIndex:44,display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(6,6,12,"+(al*0.85)+")",fontFamily:FONT,pointerEvents:"none" }}><div style={{ textAlign:"center" }}><div style={{ width:3,height:3,borderRadius:"50%",background:"rgba("+rgb+","+(al*0.8)+")",boxShadow:"0 0 30px rgba("+rgb+","+(al*0.4)+")",margin:"0 auto 16px" }} /><div style={{ color:"rgba("+rgb+","+(al*0.5)+")",fontSize:10,letterSpacing:"0.3em",fontWeight:200 }}>{label}</div></div></div>;
}

function WhisperPickerUI({ rgb, onSelect, onTimeout }) {
  var _t = useState(15), tm = _t[0], st = _t[1];
  var words = useRef(pickN(WHISPER_POOL, 5));
  useEffect(function() { var iv = setInterval(function() { st(function(t) { if (t <= 1) { onTimeout(); return 0; } return t-1; }); }, 1000); return function() { clearInterval(iv); }; }, [onTimeout]);
  return <div style={{ position:"absolute",inset:0,zIndex:45,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",background:"rgba(6,6,12,0.93)",fontFamily:FONT,animation:"fadeIn 0.8s ease" }}>
    <div style={{ color:"rgba(255,255,255,0.22)",fontSize:9,letterSpacing:"0.3em",fontWeight:200,marginBottom:8 }}>TWIN CONNECTION</div>
    <div style={{ color:"rgba("+rgb+",0.6)",fontSize:12,letterSpacing:"0.2em",fontWeight:300,marginBottom:44 }}>choose a whisper for your person</div>
    <div style={{ display:"flex",flexDirection:"column",gap:16,alignItems:"center" }}>
      {words.current.map(function(w) { return <div key={w} onClick={function() { onSelect(w); }} style={{ padding:"14px 44px",cursor:"pointer",borderRadius:24,border:"1px solid rgba("+rgb+",0.15)",background:"rgba("+rgb+",0.04)",fontSize:17,fontWeight:200,letterSpacing:"0.25em",color:"rgba("+rgb+",0.6)",transition:"all 0.3s" }}>{w}</div>; })}
    </div>
    <div style={{ marginTop:32,color:"rgba(255,255,255,0.15)",fontSize:9,fontWeight:200 }}>{tm}s</div>
  </div>;
}

function WhisperDisplayUI({ word, rgb, onDone }) {
  var _a = useState(0), al = _a[0], sa = _a[1];
  useEffect(function() { var s = Date.now(); var iv = setInterval(function() { var pr = (Date.now()-s)/4000; if (pr >= 1) { clearInterval(iv); onDone(); } else sa(pr<0.15?pr/0.15:pr>0.7?1-(pr-0.7)/0.3:1); }, 30); return function() { clearInterval(iv); }; }, [onDone]);
  return <div style={{ position:"absolute",top:"38%",left:0,right:0,textAlign:"center",zIndex:38,pointerEvents:"none",fontFamily:FONT }}>
    <div style={{ marginBottom:10,color:"rgba(255,255,255,"+(al*0.15)+")",fontSize:8,letterSpacing:"0.25em",fontWeight:200 }}>YOUR WHISPER</div>
    <span style={{ fontSize:30,fontWeight:200,letterSpacing:"0.35em",color:"rgba("+rgb+","+(al*0.7)+")",textShadow:"0 0 35px rgba("+rgb+","+(al*0.25)+")" }}>{word}</span>
  </div>;
}

function EchoMarkPickerUI({ rgb, onSelect, onTimeout }) {
  var _t = useState(15), tm = _t[0], st = _t[1];
  var marks = useRef(pickN(ECHO_POOL, 5));
  useEffect(function() { var iv = setInterval(function() { st(function(t) { if (t <= 1) { onTimeout(); return 0; } return t-1; }); }, 1000); return function() { clearInterval(iv); }; }, [onTimeout]);
  return <div style={{ position:"absolute",inset:0,zIndex:45,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",background:"rgba(6,6,12,0.93)",fontFamily:FONT,animation:"fadeIn 0.8s ease" }}>
    <div style={{ color:"rgba(255,255,255,0.22)",fontSize:9,letterSpacing:"0.3em",fontWeight:200,marginBottom:8 }}>TRACES CONVERGED</div>
    <div style={{ color:"rgba("+rgb+",0.6)",fontSize:12,letterSpacing:"0.2em",fontWeight:300,marginBottom:44 }}>leave a mark for your person</div>
    <div style={{ display:"flex",gap:22 }}>{marks.current.map(function(m) { return <div key={m.n} onClick={function() { onSelect(m); }} style={{ width:64,height:64,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",borderRadius:"50%",border:"1px solid rgba("+rgb+",0.15)",background:"rgba("+rgb+",0.04)",fontSize:24,color:"rgba("+rgb+",0.6)",transition:"all 0.3s" }}>{m.g}</div>; })}</div>
    <div style={{ marginTop:32,color:"rgba(255,255,255,0.15)",fontSize:9,fontWeight:200 }}>{tm}s</div>
  </div>;
}

function EchoMarkDisplayUI({ mark, rgb, onDone }) {
  var _a = useState(0), al = _a[0], sa = _a[1];
  useEffect(function() { var s = Date.now(); var iv = setInterval(function() { var pr = (Date.now()-s)/4000; if (pr >= 1) { clearInterval(iv); onDone(); } else sa(pr<0.1?pr/0.1:1-(pr-0.1)/0.9); }, 100); return function() { clearInterval(iv); }; }, [onDone]);
  return <div style={{ position:"absolute",top:"28%",left:"50%",transform:"translate(-50%,-50%)",zIndex:9,pointerEvents:"none",fontFamily:FONT,textAlign:"center" }}>
    <div style={{ marginBottom:10,color:"rgba(255,255,255,"+(al*0.15)+")",fontSize:8,letterSpacing:"0.25em",fontWeight:200 }}>YOUR MARK</div>
    <span style={{ fontSize:42,color:"rgba("+rgb+","+(al*0.35)+")",textShadow:"0 0 25px rgba("+rgb+","+(al*0.12)+")" }}>{mark.g}</span>
  </div>;
}

function PulseCaptureUI({ tone, rgb, onCapture }) {
  var _t = useState(null), tm = _t[0], st = _t[1];
  var _pp = useState([]), pp = _pp[0], spp = _pp[1];
  var _d = useState(false), dr = _d[0], sdr = _d[1];
  var _dn = useState(false), dn = _dn[0], sdn = _dn[1];
  var pr = useRef([]), cv = useRef(null), started = useRef(false);

  useEffect(function() { if (tm === null) return; var iv = setInterval(function() { st(function(t) { if (t === null) return null; if (t <= 1) { if (!dn) { sdn(true); onCapture(pr.current.length > 3 ? pr.current : null); } return 0; } return t-1; }); }, 1000); return function() { clearInterval(iv); }; }, [tm, dn, onCapture]);

  var oD = useCallback(function(ev) { if (dn) return; if (!started.current) { started.current = true; st(4); } var r = ev.currentTarget.getBoundingClientRect(); pr.current = [{ x:(ev.clientX-r.left)/r.width, y:(ev.clientY-r.top)/r.height, t:Date.now() }]; spp(pr.current.slice()); sdr(true); }, [dn]);
  var oM = useCallback(function(ev) { if (!dr || dn) return; var r = ev.currentTarget.getBoundingClientRect(); if (Date.now()-pr.current[0].t > 2000) { sdr(false); return; } pr.current.push({ x:(ev.clientX-r.left)/r.width, y:(ev.clientY-r.top)/r.height, t:Date.now() }); spp(pr.current.slice()); }, [dr, dn]);
  var oU = useCallback(function() { if (!dr) return; sdr(false); if (pr.current.length > 5 && !dn) { sdn(true); onCapture(pr.current); } }, [dr, dn, onCapture]);

  useEffect(function() { var c = cv.current; if (!c) return; var ctx = c.getContext("2d"), dpr = window.devicePixelRatio || 1, r = c.getBoundingClientRect(); c.width = r.width*dpr; c.height = r.height*dpr; ctx.scale(dpr,dpr); var w = r.width, h = r.height; ctx.clearRect(0,0,w,h); if (pp.length < 2) return;
    var cols = TONES[tone] ? TONES[tone].colors : ["#888","#aaa"]; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.beginPath(); ctx.strokeStyle = cols[1]+"33"; ctx.lineWidth = 14; pp.forEach(function(pt,i) { i===0?ctx.moveTo(pt.x*w,pt.y*h):ctx.lineTo(pt.x*w,pt.y*h); }); ctx.stroke(); ctx.beginPath(); ctx.strokeStyle = cols[0]+"DD"; ctx.lineWidth = 3; pp.forEach(function(pt,i) { i===0?ctx.moveTo(pt.x*w,pt.y*h):ctx.lineTo(pt.x*w,pt.y*h); }); ctx.stroke(); }, [pp, tone]);

  return <div style={{ position:"absolute",inset:0,zIndex:45,display:"flex",flexDirection:"column",fontFamily:FONT,animation:"fadeIn 0.6s ease" }}>
    <div style={{ position:"absolute",inset:0,background:"rgba(6,6,12,0.9)",zIndex:-1 }} />
    <div style={{ textAlign:"center",padding:"30px 0 10px" }}>
      <div style={{ color:"rgba(255,255,255,0.22)",fontSize:9,letterSpacing:"0.3em",fontWeight:200,marginBottom:6 }}>AMPLIFIED REVEAL</div>
      <div style={{ color:"rgba("+rgb+",0.6)",fontSize:12,letterSpacing:"0.18em",fontWeight:300 }}>{pp.length>5?"reaction captured":tm===null?"touch to react":"drawing \u00B7 "+tm+"s"}</div>
    </div>
    <div style={{ flex:1,position:"relative",touchAction:"none",cursor:"crosshair" }} onPointerDown={oD} onPointerMove={oM} onPointerUp={oU}><canvas ref={cv} style={{ position:"absolute",inset:0,width:"100%",height:"100%" }} /></div>
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
      ctx.textAlign="center";ctx.fillStyle="rgba(255,255,255,"+(0.4*a)+")";ctx.font="italic 300 16px "+FONT;ctx.fillText(TONES[tone]?TONES[tone].name:"",w/2,h-42);
      if(amplified){ctx.fillStyle="rgba(255,255,255,"+(0.25*a)+")";ctx.font="200 9px "+FONT;ctx.fillText("A M P L I F I E D",w/2,h-24);}
      if(pr<1)af=requestAnimationFrame(draw);else setTimeout(onDone,300);
    }
    af=requestAnimationFrame(draw);return function(){cancelAnimationFrame(af);};
  }, [tone, path, amplified, pulseGesture, onDone]);
  return <canvas ref={ref} style={{ position:"absolute",inset:0,width:"100%",height:"100%",zIndex:30,pointerEvents:"none" }} />;
}

function GlimpseCanvas({ contribs, onDone }) {
  var ref = useRef(null), textRef = useRef(pick(GLIMPSE_TEXTS));
  useEffect(function() {
    var c = ref.current; if (!c) return;
    var ctx = c.getContext("2d"), dpr = window.devicePixelRatio || 1, rect = c.getBoundingClientRect();
    c.width = rect.width * dpr; c.height = rect.height * dpr; ctx.scale(dpr, dpr);
    var w = rect.width, h = rect.height, cx = w/2, cy = h/2, start = Date.now(), dur = 5000, af, gt = textRef.current;
    function draw() {
      var pr = Math.min(1,(Date.now()-start)/dur), fi = Math.min(1,pr*2.5), fo = pr>0.65?1-(pr-0.65)/0.35:1, a = fi*fo;
      ctx.clearRect(0,0,w,h); ctx.fillStyle = "rgba(6,6,12,"+(0.93*a)+")"; ctx.fillRect(0,0,w,h);
      var baseR = contribs.length<=2?0.25:contribs.length<=5?0.32:0.4;
      var vr = Math.min(w,h)*baseR*a;
      if(vr<2){if(pr>=1)setTimeout(onDone,200);else af=requestAnimationFrame(draw);return;}
      ctx.save();ctx.beginPath();ctx.arc(cx,cy,vr,0,Math.PI*2);ctx.clip();
      contribs.forEach(function(ct){if(!ct.path||ct.path.length<2)return;drawGesturePath(ctx,ct.path,ct.tone,w,h,a*0.6,8);});
      ctx.globalAlpha=1;ctx.globalCompositeOperation="source-over";ctx.restore();
      var eg=ctx.createRadialGradient(cx,cy,vr*0.6,cx,cy,vr*1.12);eg.addColorStop(0,"transparent");eg.addColorStop(1,"rgba(6,6,12,"+a+")");ctx.fillStyle=eg;ctx.fillRect(0,0,w,h);
      ctx.fillStyle="rgba(255,255,255,"+(0.18*a)+")";ctx.font="200 10px "+FONT;ctx.textAlign="center";ctx.fillText(gt,cx,cy+vr+26);
      if(pr<1)af=requestAnimationFrame(draw);else setTimeout(onDone,200);
    }
    af=requestAnimationFrame(draw);return function(){cancelAnimationFrame(af);};
  }, [contribs, onDone]);
  return <canvas ref={ref} style={{ position:"absolute",inset:0,width:"100%",height:"100%",zIndex:35,pointerEvents:"none" }} />;
}

function TraceCreationUI({ onSend, onCancel, guided }) {
  var _a = useState(null), tone = _a[0], setTone = _a[1];
  var _b = useState([]), path = _b[0], setPath = _b[1];
  var _c = useState(false), dr = _c[0], setDr = _c[1];
  var _d = useState(false), sent = _d[0], setSent = _d[1];
  var cv = useRef(null), pr = useRef([]);

  var oD = useCallback(function(ev) { if (!tone || sent) return; var r = ev.currentTarget.getBoundingClientRect(); pr.current = [{ x:(ev.clientX-r.left)/r.width, y:(ev.clientY-r.top)/r.height, t:Date.now() }]; setPath(pr.current.slice()); setDr(true); }, [tone, sent]);
  var oM = useCallback(function(ev) { if (!dr) return; var r = ev.currentTarget.getBoundingClientRect(); pr.current.push({ x:(ev.clientX-r.left)/r.width, y:(ev.clientY-r.top)/r.height, t:Date.now() }); setPath(pr.current.slice()); }, [dr]);
  var oU = useCallback(function() { if (!dr) return; setDr(false); if (pr.current.length > 5 && tone) { setSent(true); setTimeout(function() { onSend({ tone: tone, path: pr.current }); }, 1800); } }, [dr, tone, onSend]);

  useEffect(function() { var c = cv.current; if (!c || !tone) return; var ctx = c.getContext("2d"), dpr = window.devicePixelRatio || 1, r = c.getBoundingClientRect(); c.width = r.width*dpr; c.height = r.height*dpr; ctx.scale(dpr,dpr); var w = r.width, h = r.height; ctx.clearRect(0,0,w,h); if (path.length < 2) return;
    var cols = TONES[tone].colors, ch = TONES[tone].ch; ctx.lineCap = "round"; ctx.lineJoin = "round";
    for (var i = 1; i < path.length; i++) { var p0 = path[i-1], p1 = path[i], dt = p1.t-p0.t, dd = dst(p0.x,p0.y,p1.x,p1.y), speed = dt>0?dd/(dt/1000):0, lw = clamp(8-speed*9,1.5,12);
      if (ch==="sharp") lw = clamp(3-speed*5,0.8,5); if (ch==="round") lw = clamp(10-speed*6,3,14); if (ch==="bounce") lw = 3+Math.sin(i*0.8)*3;
      ctx.beginPath(); ctx.moveTo(p0.x*w,p0.y*h); ctx.lineTo(p1.x*w,p1.y*h); ctx.strokeStyle = cols[1]+hex2(ch==="sharp"?15:35); ctx.lineWidth = lw+(ch==="round"?18:14); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(p0.x*w,p0.y*h); ctx.lineTo(p1.x*w,p1.y*h); ctx.strokeStyle = cols[0]+hex2(215); ctx.lineWidth = lw; ctx.stroke(); }
    var last = path[path.length-1]; var glow = ctx.createRadialGradient(last.x*w,last.y*h,0,last.x*w,last.y*h,32); glow.addColorStop(0,cols[0]+"99"); glow.addColorStop(1,"transparent"); ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(last.x*w,last.y*h,32,0,Math.PI*2); ctx.fill(); }, [path, tone]);

  if (sent) { var sc2 = TONES[tone]?TONES[tone].primary:"#888"; return <div style={{ position:"absolute",inset:0,zIndex:20,background:"rgba(6,6,12,0.97)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",fontFamily:FONT }}><div style={{ width:40,height:40,borderRadius:"50%",background:sc2,opacity:0.6,boxShadow:"0 0 40px "+sc2+"88",animation:"sendPulse 1.5s ease infinite" }} /><p style={{ color:"rgba(255,255,255,0.35)",fontSize:12,letterSpacing:"0.2em",fontWeight:200,marginTop:20 }}>TRACE SENT</p></div>; }

  if (!tone) { return <div style={{ position:"absolute",inset:0,zIndex:20,background:"rgba(6,6,12,0.97)",display:"flex",flexDirection:"column",fontFamily:FONT }}>
    <button onClick={onCancel} style={{ position:"absolute",top:14,right:14,zIndex:25,background:"none",border:"none",color:"rgba(255,255,255,0.25)",fontSize:20,cursor:"pointer",padding:10 }}>{"\u2715"}</button>
    <div style={{ flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:36 }}>
      {guided ? <p style={{ color:"rgba(255,255,255,0.3)",fontSize:12,fontWeight:200,letterSpacing:"0.15em",lineHeight:1.8,textAlign:"center" }}>choose how your trace<br/>should feel</p> : null}
      <p style={{ color:"rgba(255,255,255,0.2)",fontSize:10,letterSpacing:"0.3em",fontWeight:200 }}>EMOTIONAL TONE</p>
      <div style={{ display:"flex",gap:24,flexWrap:"wrap",justifyContent:"center" }}>
        {TONE_KEYS.map(function(k) { return <div key={k} onClick={function() { setTone(k); }} style={{ display:"flex",flexDirection:"column",alignItems:"center",gap:10,cursor:"pointer" }}>
          <div style={{ width:50,height:50,borderRadius:"50%",background:"radial-gradient(circle at 36% 36%, "+TONES[k].colors[0]+", "+TONES[k].colors[1]+")",border:"1.5px solid rgba(255,255,255,0.06)",boxShadow:"0 0 28px "+TONES[k].primary+"55",transition:"transform 0.3s, box-shadow 0.3s" }} />
          <span style={{ color:TONES[k].primary,fontSize:9,letterSpacing:"0.1em",opacity:0.6,fontWeight:300 }}>{TONES[k].name}</span></div>; })}
      </div></div></div>; }

  return <div style={{ position:"absolute",inset:0,zIndex:20,background:"rgba(6,6,12,0.97)",display:"flex",flexDirection:"column",fontFamily:FONT }}>
    <button onClick={onCancel} style={{ position:"absolute",top:14,right:14,zIndex:25,background:"none",border:"none",color:"rgba(255,255,255,0.25)",fontSize:20,cursor:"pointer",padding:10 }}>{"\u2715"}</button>
    <div style={{ padding:"22px 0",textAlign:"center",display:"flex",alignItems:"center",justifyContent:"center",gap:10 }}>
      <div style={{ width:8,height:8,borderRadius:"50%",background:TONES[tone].primary,boxShadow:"0 0 14px "+TONES[tone].primary+"99" }} />
      <span style={{ color:"rgba(255,255,255,0.28)",fontSize:12,letterSpacing:"0.16em",fontWeight:200 }}>{path.length>5?"RELEASE TO SEND":guided?"now draw something":"DRAW YOUR TRACE"}</span>
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
  var submit = async function() {
    if (!dateVal || dateVal <= today) return;
    setSending(true);
    try {
      var reu = await proposeReunion(pair.id, user.id, dateVal);
      onDone(reu);
    } catch (e) {
      console.error("Reunion propose error:", e);
      setSending(false);
    }
  };

  return <div style={{ position:"absolute",inset:0,zIndex:50,background:"rgba(6,6,12,0.97)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",fontFamily:FONT,animation:"fadeIn 0.6s ease" }}>
    <button onClick={function() { onDone(null); }} style={{ position:"absolute",top:14,right:14,zIndex:25,background:"none",border:"none",color:"rgba(255,255,255,0.25)",fontSize:20,cursor:"pointer",padding:10 }}>{"\u2715"}</button>
    <div style={{ width:2,height:2,borderRadius:"50%",background:"rgba(212,165,116,0.4)",marginBottom:30 }} />
    <div style={{ color:"rgba(255,255,255,0.2)",fontSize:9,letterSpacing:"0.3em",fontWeight:200,marginBottom:10 }}>REUNION</div>
    <div style={{ color:"rgba(255,255,255,0.35)",fontSize:12,fontWeight:200,letterSpacing:"0.12em",lineHeight:1.8,textAlign:"center",marginBottom:36 }}>
      choose a day to see each other<br/>
      <span style={{ color:"rgba(255,255,255,0.15)",fontSize:10 }}>your shared artwork will be revealed</span>
    </div>
    <input type="date" value={dateVal} min={today} onChange={function(ev) { setDateVal(ev.target.value); }}
      style={{ fontSize:16,fontWeight:200,color:"rgba(255,255,255,0.5)",padding:"14px 24px",borderRadius:12,background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.1)",outline:"none",fontFamily:FONT,colorScheme:"dark",marginBottom:24 }} />
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
    <div style={{ color:"rgba(255,255,255,0.2)",fontSize:9,letterSpacing:"0.3em",fontWeight:200,marginBottom:10 }}>REUNION</div>
    <div style={{ color:"rgba(255,255,255,0.35)",fontSize:12,fontWeight:200,letterSpacing:"0.12em",lineHeight:1.8,textAlign:"center",marginBottom:12 }}>
      your person wants to see you
    </div>
    <div style={{ color:"rgba(212,165,116,0.6)",fontSize:18,fontWeight:200,letterSpacing:"0.15em",marginBottom:10 }}>{dateStr}</div>
    <div style={{ color:"rgba(255,255,255,0.15)",fontSize:10,fontWeight:200,marginBottom:40 }}>your shared artwork will be revealed</div>
    <div style={{ display:"flex",gap:16 }}>
      <div onClick={function() { onRespond(false); }} style={{ padding:"14px 32px",borderRadius:24,border:"1px solid rgba(255,255,255,0.06)",cursor:"pointer",color:"rgba(255,255,255,0.25)",fontSize:11,letterSpacing:"0.15em",fontWeight:200 }}>NOT YET</div>
      <div onClick={function() { onRespond(true); }} style={{ padding:"14px 32px",borderRadius:24,border:"1px solid rgba(212,165,116,0.2)",background:"rgba(212,165,116,0.06)",cursor:"pointer",color:"rgba(212,165,116,0.6)",fontSize:11,letterSpacing:"0.15em",fontWeight:200 }}>ACCEPT</div>
    </div>
  </div>;
}

// ══════════════════════════════════════
// REUNION — Full artwork reveal
// ══════════════════════════════════════
function ReunionReveal({ contribs, reunion, onDone }) {
  var cvRef = useRef(null);
  var _a = useState(0), al = _a[0], setAl = _a[1];

  useEffect(function() {
    soundArtworkReveal(); hapticReveal();
    var c = cvRef.current; if (!c) return;
    var ctx = c.getContext("2d"), dpr = window.devicePixelRatio || 1, rect = c.getBoundingClientRect();
    c.width = rect.width * dpr; c.height = rect.height * dpr; ctx.scale(dpr, dpr);
    var w = rect.width, h = rect.height, start = Date.now(), dur = 20000, af;

    function draw() {
      var pr = Math.min(1, (Date.now() - start) / dur);
      var fi = Math.min(1, pr * 1.5); // slow fade in
      var fo = pr > 0.8 ? 1 - (pr - 0.8) / 0.2 : 1; // fade out at end
      var a = fi * fo;
      setAl(a);

      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = "rgba(6,6,12," + (0.97 * a) + ")";
      ctx.fillRect(0, 0, w, h);

      // Reveal radius grows over time
      var maxR = Math.min(w, h) * 0.45;
      var vr = maxR * Math.min(1, pr * 2); // full size at 50%
      var cx = w / 2, cy = h / 2;

      if (vr > 2) {
        ctx.save();
        ctx.beginPath(); ctx.arc(cx, cy, vr, 0, Math.PI * 2); ctx.clip();
        contribs.forEach(function(ct) {
          if (!ct.path || ct.path.length < 2) return;
          drawGesturePath(ctx, ct.path, ct.tone, w, h, a * 0.8, 10);
        });
        ctx.globalAlpha = 1; ctx.globalCompositeOperation = "source-over";
        ctx.restore();

        // Soft edge vignette
        var eg = ctx.createRadialGradient(cx, cy, vr * 0.7, cx, cy, vr * 1.05);
        eg.addColorStop(0, "transparent");
        eg.addColorStop(1, "rgba(6,6,12," + a + ")");
        ctx.fillStyle = eg; ctx.fillRect(0, 0, w, h);
      }

      if (pr < 1) af = requestAnimationFrame(draw);
      else setTimeout(onDone, 500);
    }
    af = requestAnimationFrame(draw);
    return function() { cancelAnimationFrame(af); };
  }, [contribs, onDone]);

  var dateStr = reunion && reunion.proposed_date
    ? new Date(reunion.proposed_date + "T00:00:00").toLocaleDateString(undefined, { day:"numeric", month:"long", year:"numeric" })
    : "";

  return <div style={{ position:"absolute",inset:0,zIndex:55 }}>
    <canvas ref={cvRef} style={{ position:"absolute",inset:0,width:"100%",height:"100%" }} />
    <div style={{ position:"absolute",top:"8%",left:0,right:0,textAlign:"center",zIndex:1,pointerEvents:"none",fontFamily:FONT }}>
      <div style={{ color:"rgba(212,165,116,"+(al*0.3)+")",fontSize:9,letterSpacing:"0.3em",fontWeight:200,marginBottom:6 }}>REUNION</div>
      <div style={{ color:"rgba(255,255,255,"+(al*0.2)+")",fontSize:10,fontWeight:200 }}>{dateStr}</div>
    </div>
    <div style={{ position:"absolute",bottom:"8%",left:0,right:0,textAlign:"center",zIndex:1,pointerEvents:"none",fontFamily:FONT }}>
      <div style={{ color:"rgba(255,255,255,"+(al*0.15)+")",fontSize:10,letterSpacing:"0.1em",fontWeight:200 }}>everything you built together</div>
    </div>
  </div>;
}

// ══════════════════════════════════════
// RESET — Incoming proposal from partner
// ══════════════════════════════════════
function ResetIncoming({ onRespond }) {
  return <div style={{ position:"absolute",inset:0,zIndex:50,background:"rgba(6,6,12,0.97)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",fontFamily:FONT,animation:"fadeIn 0.8s ease" }}>
    <div style={{ width:2,height:2,borderRadius:"50%",background:"rgba(255,255,255,0.3)",marginBottom:30 }} />
    <div style={{ color:"rgba(255,255,255,0.2)",fontSize:9,letterSpacing:"0.3em",fontWeight:200,marginBottom:10 }}>START FRESH</div>
    <div style={{ color:"rgba(255,255,255,0.35)",fontSize:12,fontWeight:200,letterSpacing:"0.12em",lineHeight:1.8,textAlign:"center",marginBottom:12 }}>
      your person wants to start over
    </div>
    <div style={{ color:"rgba(255,255,255,0.15)",fontSize:10,fontWeight:200,marginBottom:40,textAlign:"center" }}>all traces and artwork will be cleared<br/>you can build something new together</div>
    <div style={{ display:"flex",gap:16 }}>
      <div onClick={function() { onRespond(false); }} style={{ padding:"14px 32px",borderRadius:24,border:"1px solid rgba(255,255,255,0.06)",cursor:"pointer",color:"rgba(255,255,255,0.25)",fontSize:11,letterSpacing:"0.15em",fontWeight:200 }}>KEEP</div>
      <div onClick={function() { onRespond(true); }} style={{ padding:"14px 32px",borderRadius:24,border:"1px solid rgba(255,255,255,0.15)",background:"rgba(255,255,255,0.04)",cursor:"pointer",color:"rgba(255,255,255,0.45)",fontSize:11,letterSpacing:"0.15em",fontWeight:200 }}>START FRESH</div>
    </div>
  </div>;
}

// ══════════════════════════════════════
// POST-REVEAL — After reunion artwork reveal, offer to start fresh
// ══════════════════════════════════════
function PostRevealPrompt({ onStartFresh, onKeep }) {
  return <div style={{ position:"absolute",inset:0,zIndex:55,background:"rgba(6,6,12,0.97)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",fontFamily:FONT,animation:"fadeIn 1s ease" }}>
    <div style={{ width:2,height:2,borderRadius:"50%",background:"rgba(212,165,116,0.4)",marginBottom:30 }} />
    <div style={{ color:"rgba(255,255,255,0.3)",fontSize:12,fontWeight:200,letterSpacing:"0.15em",lineHeight:1.8,textAlign:"center",marginBottom:40 }}>
      you saw what you built together
    </div>
    <div style={{ color:"rgba(255,255,255,0.15)",fontSize:10,fontWeight:200,marginBottom:40,textAlign:"center" }}>would you like to start a new chapter?</div>
    <div style={{ display:"flex",flexDirection:"column",gap:16,alignItems:"center" }}>
      <div onClick={onStartFresh} style={{ padding:"14px 44px",borderRadius:24,border:"1px solid rgba(212,165,116,0.15)",background:"rgba(212,165,116,0.04)",cursor:"pointer",color:"rgba(212,165,116,0.5)",fontSize:12,letterSpacing:"0.18em",fontWeight:200 }}>START FRESH</div>
      <div onClick={onKeep} style={{ padding:"14px 44px",borderRadius:24,border:"1px solid rgba(255,255,255,0.06)",cursor:"pointer",color:"rgba(255,255,255,0.2)",fontSize:11,letterSpacing:"0.15em",fontWeight:200 }}>keep everything</div>
    </div>
    <div style={{ position:"absolute",bottom:30,color:"rgba(255,255,255,0.08)",fontSize:9,fontWeight:200,textAlign:"center" }}>your person will need to agree too</div>
  </div>;
}
