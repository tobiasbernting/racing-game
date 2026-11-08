// The race HUD in plain HTML over the 3D view: position, lap and times, the standings, a minimap with
// dots, a speedometer with revs and gear, the start lights and big friendly messages. The race also has
// the damage bar, nitro charges, the drift meter and style points, name tags over the other cars, the
// result table and a little touch button for the camera.
import type { Track } from './track.ts';
import { clamp, fmtTime } from './util.ts';
import { settings } from '../settings.ts';

const CSS = `
.rl-hud { position: absolute; inset: 0; pointer-events: none; color: #fff; z-index: 1; --s: 1;
  font-family: var(--body, system-ui), system-ui, sans-serif; }
.rl-hud * { box-sizing: border-box; }
.rl-panel { background: rgba(16, 20, 34, 0.5); border-radius: calc(14px * var(--s)); padding: calc(6px * var(--s)) calc(12px * var(--s));
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.22); }
.rl-tl { position: absolute; left: max(calc(12px * var(--s)), env(safe-area-inset-left)); top: max(calc(10px * var(--s)), env(safe-area-inset-top));
  display: flex; flex-direction: column; gap: calc(6px * var(--s)); align-items: flex-start; }
.rl-pos { display: flex; align-items: baseline; gap: calc(4px * var(--s)); font-weight: 900; line-height: 1; }
.rl-pos b { font-family: var(--display, Impact, system-ui); font-weight: 400; font-style: italic; font-size: calc(52px * var(--s)); text-shadow: 0 3px 0 rgba(0,0,0,0.35); }
.rl-pos i { font-style: normal; font-size: calc(22px * var(--s)); }
.rl-pos small { font-size: calc(16px * var(--s)); opacity: 0.85; margin-left: calc(4px * var(--s)); font-weight: 700; }
.rl-pos.first b { color: #ffd23f; }
.rl-lap { font-size: calc(19px * var(--s)); font-weight: 800; }
.rl-lap.last { color: #ffd23f; }
.rl-times { font-size: calc(14px * var(--s)); font-variant-numeric: tabular-nums; line-height: 1.45; }
.rl-times span { display: inline-block; width: calc(42px * var(--s)); opacity: 0.8; }
.rl-times b { font-weight: 800; }
.rl-board { list-style: none; margin: 0; padding: calc(5px * var(--s)) calc(10px * var(--s)); font-size: calc(13px * var(--s)); line-height: 1.5; }
.rl-board li { display: flex; align-items: center; gap: calc(6px * var(--s)); white-space: nowrap; }
.rl-nm { overflow: hidden; text-overflow: ellipsis; max-width: calc(150px * var(--s)); }
.rl-board.compact { padding: calc(3px * var(--s)) calc(8px * var(--s)); font-size: calc(12px * var(--s)); line-height: 1.35; }
.rl-board.compact li:nth-child(n+4):not(.me) { display: none; }
.rl-board li.me { font-weight: 900; color: #ffe27a; }
.rl-board li.done { opacity: 0.75; }
.rl-dot { width: calc(10px * var(--s)); height: calc(10px * var(--s)); border-radius: 50%; border: 1.5px solid rgba(255,255,255,0.8); flex: none; }
.rl-map { transition: transform 0.45s; }
.rl-map.flipped { transform: rotate(180deg); }
.rl-map { position: absolute; right: max(calc(12px * var(--s)), env(safe-area-inset-right)); top: max(calc(62px * var(--s)), 54px);
  width: calc(156px * var(--s)); height: calc(156px * var(--s)); }
.rl-speedo { position: absolute; right: max(calc(16px * var(--s)), env(safe-area-inset-right)); bottom: max(calc(12px * var(--s)), env(safe-area-inset-bottom));
  width: calc(190px * var(--s)); height: calc(128px * var(--s)); }
.rl-hud.touch .rl-speedo { right: auto; left: 50%; transform: translateX(-50%); bottom: max(calc(4px * var(--s)), env(safe-area-inset-bottom)); }
.rl-msg { position: absolute; left: 50%; top: 27%; transform: translate(-50%, -50%); text-align: center; white-space: nowrap;
  font-size: calc(78px * var(--s)); font-weight: 900; letter-spacing: 1px; opacity: 0;
  text-shadow: 0 0 calc(18px * var(--s)) rgba(255, 140, 40, 0.6), 0 calc(5px * var(--s)) 0 rgba(0, 0, 0, 0.45); }
.rl-msg.show { animation: rl-pop 0.45s cubic-bezier(0.2, 1.6, 0.4, 1) both; }
.rl-msg.go { color: #5dff7a; }
.rl-msg.gold { color: #ffd23f; }
.rl-msg.small { font-size: calc(46px * var(--s)); }
.rl-msg.out { animation: rl-out 0.35s ease-in both; }
@keyframes rl-pop { from { transform: translate(-50%, -50%) scale(0.3); opacity: 0; } to { transform: translate(-50%, -50%) scale(1); opacity: 1; } }
@keyframes rl-out { from { opacity: 1; transform: translate(-50%, -50%) scale(1); } to { opacity: 0; transform: translate(-50%, -50%) scale(1.25); } }
.rl-sub { position: absolute; left: 50%; top: 37%; transform: translateX(-50%); text-align: center; max-width: 92%;
  font-size: calc(22px * var(--s)); font-weight: 800; text-shadow: 0 2px 0 rgba(0,0,0,0.5); opacity: 0; transition: opacity 0.3s; }
.rl-sub.show { opacity: 1; }
.rl-lights { position: absolute; left: 50%; top: calc(14px * var(--s)); transform: translateX(-50%); display: flex; gap: calc(12px * var(--s));
  padding: calc(10px * var(--s)) calc(16px * var(--s)); border-radius: calc(18px * var(--s)); background: rgba(14, 16, 22, 0.8);
  border: 2px solid rgba(255,255,255,0.25); opacity: 0; transition: opacity 0.3s; }
.rl-lights.show { opacity: 1; }
.rl-light { width: calc(40px * var(--s)); height: calc(40px * var(--s)); border-radius: 50%; background: #2c2c30; box-shadow: inset 0 3px 6px rgba(0,0,0,0.6); }
.rl-light.red { background: radial-gradient(circle at 40% 35%, #ff9a8a, #ff2a1a 55%, #a3100a); box-shadow: 0 0 calc(20px * var(--s)) #ff3020; }
.rl-light.green { background: radial-gradient(circle at 40% 35%, #b6ffc4, #2bff5c 55%, #0e9a2a); box-shadow: 0 0 calc(22px * var(--s)) #30ff60; }
.rl-wrong { position: absolute; left: 50%; top: 22%; transform: translateX(-50%); padding: calc(8px * var(--s)) calc(20px * var(--s));
  border-radius: calc(16px * var(--s)); background: rgba(220, 40, 30, 0.85); font-size: calc(30px * var(--s)); font-weight: 900; display: none;
  animation: rl-blink 0.8s steps(2) infinite; }
.rl-wrong.show { display: block; }
@keyframes rl-blink { 50% { opacity: 0.55; } }
.rl-top { position: relative; }
.rl-feed { position: absolute; left: calc(100% + 8px * var(--s)); top: calc(2px * var(--s)); display: flex; flex-direction: column; gap: calc(4px * var(--s)); align-items: flex-start; z-index: 3; pointer-events: none; width: max-content; max-width: calc(240px * var(--s)); }
.rl-line { padding: calc(3px * var(--s)) calc(10px * var(--s)); border-radius: calc(10px * var(--s)); background: rgba(16, 20, 34, 0.55); font-size: calc(13px * var(--s)); font-weight: 800; line-height: 1.25; animation: rl-line 3.2s ease-out forwards; }
.rl-line.taunt { border-left: calc(3px * var(--s)) solid #ff3d7f; font-style: italic; }
@keyframes rl-line { 0% { opacity: 0; transform: translateX(-8px); } 8% { opacity: 1; transform: none; } 80% { opacity: 0.9; } 100% { opacity: 0; } }
.rl-veil { position: absolute; inset: 0; background: radial-gradient(ellipse at 50% 55%, rgba(0,0,0,0) 55%, rgba(20,8,0,0.35) 100%); }
.rl-loading { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px;
  background: linear-gradient(180deg, #f3c58e 0%, #e9a56b 40%, #6f9a4a 41%, #4f7d36 100%); font-size: calc(26px * var(--s)); font-weight: 900;
  text-shadow: 0 3px 0 rgba(0,0,0,0.35); transition: opacity 0.5s; }
.rl-loading .car { font-size: calc(64px * var(--s)); animation: rl-drive 0.6s ease-in-out infinite alternate; }
@keyframes rl-drive { from { transform: translateX(-30px) rotate(-3deg); } to { transform: translateX(30px) rotate(2deg); } }
.rl-loading .bar { width: min(60vw, 320px); height: 12px; border-radius: 6px; background: rgba(0,0,0,0.25); overflow: hidden; }
.rl-loading .bar i { display: block; height: 100%; width: 0; background: #ffd23f; transition: width 0.2s; }
.rl-br { position: absolute; right: max(calc(16px * var(--s)), env(safe-area-inset-right)); bottom: calc(146px * var(--s));
  display: flex; flex-direction: column; align-items: flex-end; gap: calc(6px * var(--s)); }
.rl-hud.touch .rl-br { right: auto; left: 50%; transform: translateX(-50%); bottom: calc(132px * var(--s)); align-items: center; }
.rl-chip { display: none; align-items: center; gap: calc(6px * var(--s)); font-weight: 900; font-size: calc(17px * var(--s)); }
.rl-chip.show { display: flex; }
.rl-meter { width: calc(110px * var(--s)); height: calc(12px * var(--s)); border-radius: 999px; background: rgba(255,255,255,0.18); overflow: hidden; }
.rl-meter i { display: block; height: 100%; width: 0; border-radius: 999px; background: #5fdc6a; }
.rl-nitro span { filter: grayscale(1) opacity(0.35); }
.rl-nitro span.on { filter: none; }
.rl-nitro span.burn { filter: drop-shadow(0 0 6px #ffb040); animation: rl-blink 0.3s steps(2) infinite; }
.rl-abil { gap: calc(8px * var(--s)); }
.rl-abil .rl-ai { font-size: calc(20px * var(--s)); }
.rl-abil kbd { font: inherit; font-size: calc(12px * var(--s)); padding: 0 calc(6px * var(--s)); border-radius: calc(5px * var(--s)); background: rgba(255,255,255,0.22); }
.rl-abil .rl-meter i { background: #b78cff; transition: width 0.12s linear; }
.rl-abil.ready .rl-meter i { background: #ffd23f; animation: rl-blink 0.6s steps(2) infinite; }
.rl-abil .rl-an { font-size: calc(13px * var(--s)); opacity: 0.9; }
.rl-hud.touch .rl-abil { display: none !important; }
.rl-style b { color: #ffd23f; font-variant-numeric: tabular-nums; }
.rl-drift .rl-meter i { transition: background 0.2s; }
.rl-pop { position: absolute; left: 50%; top: 58%; transform: translateX(-50%); font-size: calc(30px * var(--s)); font-weight: 900; white-space: nowrap;
  color: #ffd23f; text-shadow: 0 3px 0 rgba(0,0,0,0.45); animation: rl-rise 1.4s ease-out both; }
.rl-pop.coin { color: #ffe27a; }
.rl-pop.blue { color: #7fd6ff; }
.rl-pop.abil { color: #d6b8ff; }
@keyframes rl-rise { from { opacity: 0; transform: translate(-50%, 10px) scale(0.6); } 15% { opacity: 1; transform: translate(-50%, 0) scale(1.1); }
  to { opacity: 0; transform: translate(-50%, -70px) scale(1); } }
.rl-pops { position: absolute; left: 50%; bottom: 62%; transform: translateX(-50%); display: flex; flex-direction: column-reverse; align-items: center; gap: calc(2px * var(--s)); pointer-events: none; z-index: 2; }
.rl-bigpop { display: flex; align-items: center; gap: calc(8px * var(--s)); white-space: nowrap; font-weight: 900; text-transform: uppercase; letter-spacing: 0.04em; color: #fff2b0;
  font-size: calc(28px * var(--s)); line-height: 1.05; -webkit-text-stroke: calc(5px * var(--s)) rgba(10, 8, 24, 0.78); paint-order: stroke fill;
  text-shadow: 0 calc(3px * var(--s)) calc(10px * var(--s)) rgba(0, 0, 0, 0.55); animation: rl-bigpop 0.85s cubic-bezier(0.2, 1.5, 0.4, 1) both; }
.rl-bigpop i { font-style: normal; font-size: calc(44px * var(--s)); -webkit-text-stroke: 0; filter: drop-shadow(0 calc(2px * var(--s)) calc(3px * var(--s)) rgba(0, 0, 0, 0.7)); }
.rl-bigpop.abil { color: #e4d0ff; }
.rl-bigpop.boost { color: #ffb347; }
.rl-bigpop.hit { color: #ff9aa8; }
@keyframes rl-bigpop { 0% { opacity: 0; transform: scale(0.4) translateY(10px); } 20% { opacity: 1; transform: scale(1.15) translateY(0); } 34% { transform: scale(1); } 68% { opacity: 1; } 100% { opacity: 0; transform: scale(1) translateY(-14px); } }
@media (max-height: 520px) { .rl-bigpop { font-size: calc(22px * var(--s)); } .rl-bigpop i { font-size: calc(32px * var(--s)); } .rl-pops { bottom: 60%; } }
@media (prefers-reduced-motion: reduce) { .rl-bigpop { animation-duration: 0.01s; animation-delay: 0.6s; } }
.rl-tags { position: absolute; inset: 0; overflow: hidden; }
.rl-tag { position: absolute; left: 0; top: 0; padding: calc(2px * var(--s)) calc(8px * var(--s)); border-radius: 999px; white-space: nowrap;
  background: rgba(16, 20, 34, 0.6); font-size: calc(13px * var(--s)); font-weight: 800; transform: translate(-50%, -100%); display: none; }
.rl-tag i { display: inline-block; width: calc(8px * var(--s)); height: calc(8px * var(--s)); border-radius: 50%; margin-right: calc(4px * var(--s)); }
.rl-speed { position: absolute; inset: 0; opacity: 0; transition: opacity 0.25s;
  background: repeating-conic-gradient(from 0deg at 50% 50%, rgba(255,255,255,0.0) 0deg 7deg, rgba(255,255,255,0.22) 7.4deg 8deg);
  -webkit-mask: radial-gradient(circle at 50% 50%, transparent 38%, #000 75%); mask: radial-gradient(circle at 50% 50%, transparent 38%, #000 75%); }
.rl-result { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); min-width: min(92%, calc(420px * var(--s)));
  background: rgba(16, 20, 34, 0.82); border-radius: calc(18px * var(--s)); padding: calc(14px * var(--s)) calc(18px * var(--s)); display: none; }
.rl-result.show { display: block; animation: rl-pop 0.45s cubic-bezier(0.2, 1.6, 0.4, 1) both; }
.rl-result h3 { margin: 0 0 calc(8px * var(--s)); text-align: center; font-size: calc(24px * var(--s)); color: #ffd23f; }
.rl-result table { width: 100%; border-collapse: collapse; font-size: calc(16px * var(--s)); font-variant-numeric: tabular-nums; }
.rl-result td { padding: calc(3px * var(--s)) calc(6px * var(--s)); white-space: nowrap; }
.rl-result tr.me td { color: #ffe27a; font-weight: 900; }
.rl-result td.r { text-align: right; }
.rl-btns { position: absolute; right: max(calc(12px * var(--s)), env(safe-area-inset-right)); top: calc(max(calc(62px * var(--s)), 54px) + calc(166px * var(--s))); display: flex; flex-direction: column; align-items: flex-end; gap: calc(8px * var(--s)); }
.rl-btn { pointer-events: auto; border: 2px solid rgba(255,255,255,0.5); background: rgba(16, 20, 34, 0.6); color: #fff; border-radius: 999px;
  font: 800 calc(16px * var(--s)) var(--body, system-ui), system-ui, sans-serif; padding: calc(6px * var(--s)) calc(12px * var(--s)); display: none; cursor: pointer; }
.rl-btn.show { display: block; }
.rl-hud.camtop .rl-btns { top: max(8px, env(safe-area-inset-top)); right: calc(max(8px, env(safe-area-inset-right)) + 56px); }
.rl-hud.camtop .rl-btn { width: 44px; height: 44px; padding: 0; font-size: 20px; line-height: 1; }
.rl-hud.camtop .rl-trinkets { right: max(calc(76px * var(--s) + 56px), calc(env(safe-area-inset-right) + 120px)); }
.rl-trinkets { position: absolute; right: max(calc(76px * var(--s)), calc(env(safe-area-inset-right) + 64px)); top: max(calc(8px * var(--s)), env(safe-area-inset-top)); display: flex; flex-wrap: nowrap; justify-content: flex-end;
  gap: calc(3px * var(--s)); max-width: 34%; }
.rl-tr.more { font-size: calc(13px * var(--s)); font-weight: 900; display: flex; align-items: center; }
.rl-tr { position: relative; font-size: calc(21px * var(--s)); line-height: 1; padding: calc(3px * var(--s)) calc(5px * var(--s)); border-radius: calc(10px * var(--s));
  background: rgba(16, 20, 34, 0.5); }
.rl-tr b { position: absolute; right: -2px; bottom: -3px; font-size: calc(11px * var(--s)); background: #ffd23f; color: #2a1b00; border-radius: 999px; padding: 0 calc(4px * var(--s)); }
.rl-tr.combo { box-shadow: 0 0 0 2px #ffd23f inset, 0 0 calc(10px * var(--s)) rgba(255, 210, 63, 0.55); }
.rl-tr.pulse { animation: rl-tr 0.8s ease-out; }
@keyframes rl-tr { 0% { transform: scale(1); } 20% { transform: scale(1.4) rotate(-6deg); background: #ffd23f; box-shadow: 0 0 calc(14px * var(--s)) #ffd23f; } 100% { transform: scale(1); } }
.rl-trl { position: absolute; left: 50%; top: calc(100% + 3px * var(--s)); transform: translateX(-50%); white-space: nowrap; font-size: calc(11px * var(--s)); font-weight: 800; padding: 0 calc(6px * var(--s)); border-radius: 999px; background: rgba(16, 20, 34, 0.45); opacity: 0; pointer-events: none; z-index: 2; }
.rl-trl.show { animation: rl-trl 1.3s ease-out forwards; }
@keyframes rl-trl { 0% { opacity: 0; } 15% { opacity: 0.85; } 70% { opacity: 0.7; } 100% { opacity: 0; } }
.rl-line.td { border-left: calc(3px * var(--s)) solid #ff3d7f; background: rgba(60, 10, 30, 0.7); font-size: calc(14px * var(--s)); letter-spacing: 0.5px; text-transform: uppercase; }
.rl-line.td b { color: #ffd23f; }
.rl-line.dead { border-left: calc(3px * var(--s)) solid #8a8fa6; font-style: italic; }
.rl-score { font-size: calc(14px * var(--s)); font-weight: 900; display: none; gap: calc(8px * var(--s)); }
.rl-score.show { display: flex; }
.rl-score b { color: #ffd23f; font-variant-numeric: tabular-nums; }
.rl-hp i.wreck { background: #ff3a24; }
.rl-hp span.wr { font-weight: 900; color: #ff8a70; font-size: calc(15px * var(--s)); animation: rl-blink 0.6s steps(2) infinite; }
.rl-bars { position: absolute; inset: 0; overflow: hidden; }
.rl-bar { position: absolute; left: 0; top: 0; width: calc(46px * var(--s)); height: calc(6px * var(--s)); border-radius: 999px; background: rgba(10, 12, 22, 0.7);
  border: 1px solid rgba(255,255,255,0.45); transform: translate(-50%, -100%); display: none; overflow: hidden; }
.rl-bar i { display: block; height: 100%; width: 100%; background: #ff5a3a; }
.rl-bar.out { opacity: 0.35; }
.rl-fg { position: absolute; left: 0; top: 0; padding: 0 calc(7px * var(--s)); border-radius: 999px; background: #d62d20; color: #fff; font-weight: 900; font-size: calc(12px * var(--s)); letter-spacing: 0.05em;
  white-space: nowrap; display: none; border: 1px solid #fff; animation: rl-blink 0.5s steps(2) infinite; }
.rl-float { position: absolute; left: 0; top: 0; font-weight: 900; font-size: calc(22px * var(--s)); color: #ffe05a; pointer-events: none; white-space: nowrap;
  -webkit-text-stroke: calc(4px * var(--s)) rgba(10, 8, 24, 0.8); paint-order: stroke fill; animation: rl-flt 0.95s ease-out both; }
.rl-float.big { font-size: calc(32px * var(--s)); color: #ffb21f; }
.rl-float.taken { color: #ff8a8a; font-size: calc(18px * var(--s)); }
@keyframes rl-flt { from { opacity: 1; margin-top: 0; } 70% { opacity: 1; } to { opacity: 0; margin-top: calc(-52px * var(--s)); } }
.rl-fegisme { position: absolute; left: 50%; top: calc(max(calc(10px * var(--s)), env(safe-area-inset-top)) + calc(46px * var(--s))); transform: translateX(-50%); display: none; padding: calc(5px * var(--s)) calc(16px * var(--s));
  border-radius: calc(14px * var(--s)); background: rgba(190, 28, 18, 0.9); border: 2px solid #fff; color: #fff; font-weight: 900; font-size: calc(17px * var(--s)); white-space: nowrap; z-index: 3; animation: rl-blink 0.7s steps(2) infinite; }
.rl-fegisme.show { display: block; }
@media (prefers-reduced-motion: reduce) { .rl-float { animation-duration: 0.01s; animation-delay: 0.9s; } }
.rl-board li small { margin-left: auto; padding-left: calc(8px * var(--s)); opacity: 0.85; font-weight: 800; font-variant-numeric: tabular-nums; }
.rl-disco { position: absolute; inset: 0; opacity: 0; mix-blend-mode: screen; transition: opacity 0.5s;
  background: conic-gradient(from 0deg at 50% -10%, rgba(255, 0, 150, 0.4), rgba(0, 200, 255, 0.4), rgba(255, 230, 0, 0.4), rgba(120, 0, 255, 0.4), rgba(255, 0, 150, 0.4));
  animation: rl-disco 2.4s linear infinite; }
.rl-disco.on { opacity: 0.55; }
@keyframes rl-disco { from { filter: hue-rotate(0deg); } to { filter: hue-rotate(360deg); } }
.rl-derby { position: absolute; left: 50%; top: max(calc(10px * var(--s)), env(safe-area-inset-top)); transform: translateX(-50%); display: none; align-items: center; gap: calc(14px * var(--s));
  padding: calc(5px * var(--s)) calc(16px * var(--s)); border-radius: calc(14px * var(--s)); background: rgba(16, 20, 34, 0.62); box-shadow: 0 2px 12px rgba(0,0,0,0.3);
  font-weight: 900; font-size: calc(17px * var(--s)); white-space: nowrap; font-variant-numeric: tabular-nums; border: 2px solid rgba(255, 138, 31, 0.55); }
.rl-derby.show { display: flex; }
.rl-derby b { font-family: var(--display, Impact, system-ui); font-weight: 400; font-style: italic; font-size: calc(27px * var(--s)); color: #ffd23f; margin-right: calc(2px * var(--s)); }
.rl-derby .low b { color: #ff7a5a; }
.rl-derby .t.low { color: #ff7a5a; animation: rl-blink 0.7s steps(2) infinite; }
.rl-hint { position: absolute; left: 50%; bottom: max(calc(14px * var(--s)), env(safe-area-inset-bottom)); transform: translateX(-50%); font-size: calc(14px * var(--s));
  font-weight: 800; opacity: 0.8; text-shadow: 0 1px 0 rgba(0,0,0,0.5); display: none; }
.rl-hint.show { display: block; }
.rl-hud.touch .rl-hint { display: none; }
`;

/** One line of the result table. */
export interface ResultRow {
  name: string;
  me: boolean;
  time: number | null;
  place: number;
  prize?: number;
  medal?: 'gold' | 'silver' | 'bronze' | null;
}

const MEDAL: Record<string, string> = { gold: '🥇', silver: '🥈', bronze: '🥉' };

export interface Racer {
  name: string;
  color: string;
  me: boolean;
  done: boolean;
  x: number;
  z: number;
  /** Blodbad: points if the race ended now, and whether the car is wrecked. */
  pts?: number;
  out?: boolean;
  /** Derby: the small text on the right of the name (health left, or "ute"). */
  tag?: string;
}

function el(tag: string, cls: string, parent: HTMLElement): HTMLElement {
  const e = document.createElement(tag);
  e.className = cls;
  parent.append(e);
  return e;
}

export class Hud {
  readonly root: HTMLElement;
  private style: HTMLStyleElement;
  private pos: HTMLElement;
  private lap: HTMLElement;
  private times: HTMLElement;
  private board: HTMLElement;
  private boardKey = '';
  map: HTMLCanvasElement;
  private mapBase: HTMLCanvasElement | null = null;
  /** Half the floor's width when the race is a derby in an arena (0 = a road). */
  private arenaHw = 0;
  private derbyEl: HTMLElement;
  private speedo: HTMLCanvasElement;
  private msgEl: HTMLElement;
  private sub: HTMLElement;
  private lightsEl: HTMLElement;
  private lightEls: HTMLElement[] = [];
  private wrong: HTMLElement;
  private feed: HTMLElement;
  private loading: HTMLElement | null;
  private loadBar: HTMLElement;
  private msgTimer: ReturnType<typeof setTimeout> | null = null;
  private scale = 1;
  private ro: ResizeObserver;
  private mapScale = 1;
  private mapOx = 0;
  private mapOz = 0;
  private br: HTMLElement;
  private dmgChip: HTMLElement;
  private dmgBar: HTMLElement;
  private nitroChip: HTMLElement;
  private abilChip: HTMLElement;
  private abilBar: HTMLElement;
  private abilName: HTMLElement;
  private nitroKey = '';
  private driftChip: HTMLElement;
  private driftBar: HTMLElement;
  private styleChip: HTMLElement;
  private hpChip: HTMLElement;
  private hpBar: HTMLElement;
  private hpTxt: HTMLElement;
  private scoreEl: HTMLElement;
  private barsEl: HTMLElement;
  private barEls = new Map<string, HTMLElement>();
  private fgEls = new Map<string, HTMLElement>();
  private fegisMe!: HTMLElement;
  private tagsEl: HTMLElement;
  private trinketRow: HTMLElement;
  private trinketEls = new Map<string, HTMLElement>();
  /** What each owned talisman looks like, for the pop-up in the middle of the screen. */
  private trinketInfo = new Map<string, { emoji: string; name: string }>();
  private popsEl: HTMLElement;
  private popAt = new Map<string, number>();
  private discoEl: HTMLElement;
  private coinChip: HTMLElement;
  private tagEls = new Map<string, HTMLElement>();
  /** The tags shown this frame (reused). */
  private tagSeen = new Set<string>();
  private speedEl: HTMLElement;
  private resultEl: HTMLElement;
  private hintEl: HTMLElement;
  private btns: HTMLElement;
  /** Touch buttons of the HUD's own: the camera. */
  readonly camBtn: HTMLButtonElement;
  /** The last values shown, so a frame with no change touches no DOM. */
  private last: Record<string, string> = {};

  constructor(
    parent: HTMLElement,
    private track: Track,
    private dpr: number,
    touch: boolean,
  ) {
    this.style = document.createElement('style');
    this.style.textContent = CSS;
    parent.append(this.style);
    this.root = el('div', `rl-hud${touch ? ' touch' : ''}`, parent);
    el('div', 'rl-veil', this.root);
    const tl = el('div', 'rl-tl', this.root);
    const top = el('div', 'rl-panel rl-top', tl);
    this.feed = el('div', 'rl-feed', top);
    this.popsEl = el('div', 'rl-pops', this.root);
    this.pos = el('div', 'rl-pos', top);
    this.lap = el('div', 'rl-lap', top);
    this.scoreEl = el('div', 'rl-score', top);
    this.times = el('div', 'rl-panel rl-times', tl);
    this.board = el('ul', 'rl-panel rl-board', tl);
    this.derbyEl = el('div', 'rl-derby', this.root);
    this.map = el('canvas', 'rl-map', this.root) as HTMLCanvasElement;
    this.speedo = el('canvas', 'rl-speedo', this.root) as HTMLCanvasElement;
    this.lightsEl = el('div', 'rl-lights', this.root);
    for (let k = 0; k < 4; k++) this.lightEls.push(el('div', 'rl-light', this.lightsEl));
    this.wrong = el('div', 'rl-wrong', this.root);
    this.wrong.textContent = '↺ Fel håll, geniet! Vänd!';
    this.msgEl = el('div', 'rl-msg', this.root);
    this.sub = el('div', 'rl-sub', this.root);
    this.discoEl = el('div', 'rl-disco', this.root);
    this.trinketRow = el('div', 'rl-trinkets', this.root);
    this.speedEl = el('div', 'rl-speed', this.root);
    this.tagsEl = el('div', 'rl-tags', this.root);
    this.barsEl = el('div', 'rl-bars', this.root);
    this.fegisMe = el('div', 'rl-fegisme', this.root);
    this.br = el('div', 'rl-br', this.root);
    this.styleChip = el('div', 'rl-panel rl-chip rl-style', this.br);
    this.coinChip = el('div', 'rl-panel rl-chip rl-style', this.br);
    this.driftChip = el('div', 'rl-panel rl-chip rl-drift', this.br);
    el('span', '', this.driftChip).textContent = '🌀';
    this.driftBar = el('i', '', el('div', 'rl-meter', this.driftChip));
    this.nitroChip = el('div', 'rl-panel rl-chip rl-nitro', this.br);
    this.abilChip = el('div', 'rl-panel rl-chip rl-abil', this.br);
    this.abilName = el('span', 'rl-an', this.abilChip);
    this.abilBar = el('i', '', el('div', 'rl-meter', this.abilChip));
    el('kbd', '', this.abilChip).textContent = 'F';
    this.hpChip = el('div', 'rl-panel rl-chip rl-hp', this.br);
    el('span', '', this.hpChip).textContent = '❤️';
    this.hpBar = el('i', '', el('div', 'rl-meter', this.hpChip));
    this.hpTxt = el('span', '', this.hpChip);
    this.dmgChip = el('div', 'rl-panel rl-chip', this.br);
    el('span', '', this.dmgChip).textContent = '🔧';
    this.dmgBar = el('i', '', el('div', 'rl-meter', this.dmgChip));
    this.resultEl = el('div', 'rl-result', this.root);
    this.hintEl = el('div', 'rl-hint', this.root);
    this.btns = el('div', 'rl-btns', this.root);
    this.camBtn = el('button', 'rl-btn', this.btns) as HTMLButtonElement;
    this.camBtn.textContent = '🎥';
    if (touch) this.camBtn.classList.add('show');
    this.camBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.loading = el('div', 'rl-loading', this.root);
    el('div', 'car', this.loading).textContent = '🏎️';
    el('div', '', this.loading).textContent = 'Slänger ihop en bana…';
    this.loadBar = el('i', '', el('div', 'bar', this.loading));
    this.hideRace(true);
    this.ro = new ResizeObserver(() => this.fit());
    this.ro.observe(parent);
    this.fit();
  }

  /** Blodbad and the derby keep a small points board even on a phone (the top three and you); the other races only show one when there is room. */
  private pointsOn = false;
  private fitBoard(): void {
    const r = this.root.getBoundingClientRect();
    const roomy = r.height > 520 && r.width > 700;
    this.board.style.display = roomy || this.pointsOn ? '' : 'none';
    this.board.classList.toggle('compact', !roomy);
  }

  private fit(): void {
    const r = this.root.getBoundingClientRect();
    const s = clamp(Math.min(r.width / 980, r.height / 620), 0.58, 1.25);
    this.scale = s;
    this.root.style.setProperty('--s', s.toFixed(3));
    this.fitBoard();
    const mw = Math.round(156 * s * this.dpr);
    this.map.width = mw;
    this.map.height = mw;
    this.mapBase = null;
    this.speedo.width = Math.round(190 * s * this.dpr);
    this.speedo.height = Math.round(128 * s * this.dpr);
  }

  progress(f: number): void {
    this.loadBar.style.width = `${Math.round(f * 100)}%`;
  }

  ready(): void {
    const l = this.loading;
    if (!l) return;
    l.style.opacity = '0';
    setTimeout(() => l.remove(), 600);
    this.loading = null;
  }

  hideRace(hide: boolean): void {
    for (const e of [this.pos.parentElement!, this.times, this.board, this.map, this.speedo, this.br]) e.style.visibility = hide ? 'hidden' : 'visible';
  }

  hint(text: string): void {
    this.hintEl.textContent = text;
    this.hintEl.classList.toggle('show', !!text);
  }

  /** Blodbad: the player's health (0..1, null hides it) and, while wrecked, the seconds left out. */
  setHealth(frac: number | null, hp: number, wreckLeft: number): void {
    const key = frac === null ? '-' : `${Math.round(frac * 100)}/${Math.ceil(wreckLeft * 5)}`;
    if (this.same('hp', key)) return;
    this.hpChip.classList.toggle('show', frac !== null);
    if (frac === null) return;
    const out = wreckLeft > 0;
    this.hpBar.style.width = `${Math.round(clamp(frac, 0, 1) * 100)}%`;
    this.hpBar.style.background = out ? '#ff3a24' : frac > 0.55 ? '#5fdc6a' : frac > 0.25 ? '#ffd23f' : '#ff5a3a';
    this.hpTxt.className = out ? 'wr' : '';
    this.hpTxt.textContent = out ? `VRAKAD ${wreckLeft.toFixed(1).replace('.', ',')}` : String(Math.max(0, Math.round(hp)));
  }

  /** Blodbad and the derby: the player's takedowns, damage dealt and points under the position (null hides it). */
  setScore(points: number | null, takedowns: number, dealt = 0): void {
    if (this.same('score', points === null ? '-' : `${points}/${takedowns}/${Math.round(dealt)}`)) return;
    this.scoreEl.classList.toggle('show', points !== null);
    if (this.pointsOn !== (points !== null)) {
      this.pointsOn = points !== null;
      this.fitBoard();
    }
    if (points !== null) this.scoreEl.innerHTML = `<span>💥 <b>${takedowns}</b></span><span>🔨 <b>${Math.round(dealt)}</b></span><span><b>${points}</b> p</span>`;
  }

  /** A number that rises from a screen position and fades ("+12" over a car you hit). */
  floater(text: string, x: number, y: number, cls = ''): void {
    const e = el('div', `rl-float ${cls}`, this.barsEl);
    e.textContent = text;
    e.style.transform = `translate(${(x + (Math.random() - 0.5) * 24).toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, -100%)`;
    setTimeout(() => e.remove(), 1000);
  }

  /** The big warning on the player's own screen while it is FEGIS (null hides it). */
  setFegis(on: boolean): void {
    if (this.same('fegisme', on ? 1 : 0)) return;
    this.fegisMe.classList.toggle('show', on);
    this.fegisMe.textContent = on ? '🐔 FEGIS! Träffa någon, annars tappar du hälsa' : '';
  }

  /** Small health bars over the rivals' heads, at screen positions (CSS px); the ones not listed are hidden. */
  bars(list: { id: string; x: number; y: number; hp: number; out: boolean; color: string; fegis?: boolean }[]): void {
    const seen = new Set<string>();
    for (const b of list) {
      seen.add(b.id);
      let e = this.barEls.get(b.id);
      if (!e) {
        e = el('div', 'rl-bar', this.barsEl);
        el('i', '', e);
        this.barEls.set(b.id, e);
      }
      e.style.display = 'block';
      e.style.transform = `translate(${b.x.toFixed(1)}px, ${b.y.toFixed(1)}px) translate(-50%, -100%)`;
      e.classList.toggle('out', b.out);
      const i = e.firstElementChild as HTMLElement;
      i.style.width = `${Math.round(clamp(b.hp, 0, 1) * 100)}%`;
      i.style.background = b.hp > 0.55 ? '#5fdc6a' : b.hp > 0.25 ? '#ffd23f' : '#ff5a3a';
      let f = this.fgEls.get(b.id);
      if (!f) {
        f = el('div', 'rl-fg', this.barsEl);
        f.textContent = 'FEGIS!';
        this.fgEls.set(b.id, f);
      }
      f.style.display = b.fegis && !b.out ? 'block' : 'none';
      f.style.transform = `translate(${b.x.toFixed(1)}px, ${(b.y - 10).toFixed(1)}px) translate(-50%, -100%)`;
    }
    for (const [id, f] of this.fgEls) if (!seen.has(id)) f.style.display = 'none';
    for (const [id, e] of this.barEls) if (!seen.has(id)) e.style.display = 'none';
  }

  /** This race is a derby in an arena `hw` metres half-wide: the minimap draws the floor, not a road. */
  setArena(hw: number): void {
    this.arenaHw = hw;
    this.mapBase = null;
    // no lap times in a derby: the clock is in the derby panel
    this.times.style.display = 'none';
  }

  /** The derby panel: cars still running, the clock and the player's takedowns (null hides it). */
  setDerby(info: { alive: number; total: number; left: number; takedowns: number } | null): void {
    const key = info ? `${info.alive}/${info.total}/${Math.ceil(info.left)}/${info.takedowns}` : '-';
    if (this.same('derby', key)) return;
    this.derbyEl.classList.toggle('show', !!info);
    if (!info) return;
    const m = Math.floor(info.left / 60);
    const sec = Math.ceil(info.left % 60) % 60;
    const clock = `${m}:${String(info.left > 0 && sec === 0 && info.left % 60 > 0 ? 59 : sec).padStart(2, '0')}`;
    this.derbyEl.innerHTML = `<span class="${info.alive <= 2 ? 'low' : ''}">🚗 <b>${info.alive}</b>/${info.total} kvar</span><span class="t${info.left <= 15 ? ' low' : ''}">⏱️ ${clock}</span><span>💥 <b>${info.takedowns}</b></span>`;
  }

  /** The damage bar (null hides it). */
  setDamage(d: number | null): void {
    if (this.same('dmg', d === null ? '-' : Math.round(d))) return;
    this.dmgChip.classList.toggle('show', d !== null);
    if (d === null) return;
    this.dmgBar.style.width = `${Math.round(clamp(d, 0, 100))}%`;
    this.dmgBar.style.background = d < 35 ? '#5fdc6a' : d < 70 ? '#ffd23f' : '#ff5a3a';
  }

  /** Nitro charges left and whether one is burning (total 0 hides it). */
  setNitro(left: number, total: number, burning: boolean): void {
    const key = `${left}/${total}/${burning}`;
    if (key === this.nitroKey) return;
    this.nitroKey = key;
    this.nitroChip.classList.toggle('show', total > 0);
    let html = '';
    for (let k = 0; k < total; k++) html += `<span class="${k < left ? 'on' : burning && k === left ? 'burn' : ''}">🔥</span>`;
    this.nitroChip.innerHTML = html;
  }

  /** The vehicle's ability: its icon and name, how charged it is (0..1) and whether it can be used now. */
  setAbility(emoji: string, name: string, charge: number, ready: boolean): void {
    this.abilChip.classList.add('show');
    this.abilChip.classList.toggle('ready', ready);
    this.abilName.textContent = `${emoji} ${name}`;
    this.abilBar.style.width = `${Math.round(clamp(charge, 0, 1) * 100)}%`;
  }

  /** The drift meter: 0..1 charge and the tier colour (0 hides it). */
  setDrift(k: number, tier: number): void {
    if (this.same('drift', `${Math.round(k * 50)}/${tier}`)) return;
    this.driftChip.classList.toggle('show', k > 0);
    this.driftBar.style.width = `${Math.round(clamp(k, 0, 1) * 100)}%`;
    this.driftBar.style.background = ['#9aa0b0', '#4fb3ff', '#ff9a2a', '#c070ff'][tier] ?? '#9aa0b0';
  }

  setStyle(points: number): void {
    this.styleChip.classList.toggle('show', points > 0);
    const html = `✨ <b>${points}</b>`;
    if (this.styleChip.innerHTML !== html) this.styleChip.innerHTML = html;
  }

  /** A floating "+120" that rises and fades. */
  /** The trinket icons along the top (once, at the start). */
  setTrinkets(items: { id: string; emoji: string; name: string; n: number }[]): void {
    this.trinketRow.replaceChildren();
    this.trinketEls.clear();
    this.trinketInfo.clear();
    for (const it of items) this.trinketInfo.set(it.id, { emoji: it.emoji, name: it.name });
    const shown = items.length > 10 ? items.slice(0, 9) : items;
    if (shown.length < items.length) {
      const more = el('div', 'rl-tr more', this.trinketRow);
      more.textContent = `+${items.length - shown.length}`;
    }
    for (const it of shown) {
      const e = el('div', it.id.startsWith('combo.') ? 'rl-tr combo' : 'rl-tr', this.trinketRow);
      e.textContent = it.emoji;
      e.title = it.name;
      if (it.n > 1) el('b', '', e).textContent = `×${it.n}`;
      el('span', 'rl-trl', e);
      this.trinketEls.set(it.id, e);
    }
  }

  /**
   * A brief pop-up for something that just happened (a talisman, the ability, a passive, a boost): a big emoji and a short word
   * in the upper middle of the screen, above the car, that scales in and fades within a second. `key` is the source: the same
   * source pops at most every 2.5 s. The setting "Pop-ups" picks the middle (default), the corner (a small line under the
   * position box) or nothing.
   */
  pop(key: string, emoji: string, text: string, cls = ''): void {
    const mode = settings.popups;
    if (mode === 'off') return;
    const now = performance.now();
    if (now - (this.popAt.get(key) ?? -1e9) < 2500) return;
    this.popAt.set(key, now);
    if (mode === 'corner') return this.toast(`${emoji} ${text}`);
    const e = document.createElement('div');
    e.className = `rl-bigpop ${cls}`.trim();
    const pic = document.createElement('i');
    pic.textContent = emoji;
    e.append(pic, document.createTextNode(text));
    // the newest is nearest the horizon, older ones sit above it; never more than three
    this.popsEl.prepend(e);
    while (this.popsEl.childElementCount > 3) this.popsEl.lastElementChild?.remove();
    setTimeout(() => e.remove(), 900);
  }

  /** A talisman did something: the pop-up with its picture and `text` (its name when there is none). */
  popFor(id: string, text?: string): void {
    const info = this.trinketInfo.get(id);
    if (info) this.pop(`t:${id}`, info.emoji, text ?? info.name);
  }

  /** A trinket just did something: its icon pulses, and `text` (if any) pops up. */
  trinketSay(id: string, text: string | null): void {
    const e = this.trinketEls.get(id);
    if (e) {
      e.classList.remove('pulse');
      void e.offsetWidth;
      e.classList.add('pulse');
    }
    const l = e?.querySelector<HTMLElement>('.rl-trl');
    if (text === null || !l) return;
    l.textContent = text;
    l.classList.remove('show');
    void l.offsetWidth;
    l.classList.add('show');
  }

  disco(on: boolean): void {
    this.discoEl.classList.toggle('on', on);
  }

  /** Coins picked up in this race, in kr (hidden at 0). */
  setCoins(kr: number, show: boolean): void {
    if (!show) return;
    const t = `🪙 <b>${kr}</b> kr`;
    if (this.last.coin === t) return;
    this.last.coin = t;
    this.coinChip.innerHTML = t;
    this.coinChip.classList.add('show');
  }

  popup(text: string, cls = ''): void {
    const e = el('div', `rl-pop ${cls}`, this.root);
    e.textContent = text;
    setTimeout(() => e.remove(), 1500);
  }

  /** Speed lines round the edge (nitro): 0..1. */
  speedLines(k: number): void {
    if (this.same('speed', k.toFixed(2))) return;
    this.speedEl.style.opacity = k.toFixed(2);
  }

  /** Name tags at screen positions (CSS pixels); the ones not listed are hidden. */
  tags(list: { id: string; name: string; color: string; x: number; y: number; alpha: number }[]): void {
    const seen = this.tagSeen;
    seen.clear();
    for (const t of list) {
      seen.add(t.id);
      let e = this.tagEls.get(t.id);
      if (!e) {
        e = el('div', 'rl-tag', this.tagsEl);
        e.innerHTML = `<i style="background:${t.color}"></i>${escape(t.name)}`;
        this.tagEls.set(t.id, e);
      }
      e.style.display = 'block';
      e.style.transform = `translate(${t.x.toFixed(1)}px, ${t.y.toFixed(1)}px) translate(-50%, -100%)`;
      e.style.opacity = t.alpha.toFixed(2);
    }
    for (const [id, e] of this.tagEls) if (!seen.has(id)) e.style.display = 'none';
  }

  /** The final placings (null hides the table). */
  results(title: string, rows: ResultRow[] | null): void {
    this.resultEl.classList.toggle('show', !!rows);
    if (!rows) return;
    const line = (r: ResultRow): string =>
      `<tr class="${r.me ? 'me' : ''}"><td>${r.place > 0 ? r.place + '.' : '–'}</td><td>${escape(r.name)}</td><td class="r">${r.time !== null ? fmtTime(r.time / 1000) : 'Ingen mål'}</td><td class="r">${r.prize !== undefined ? `+${r.prize} kr` : ''}</td><td>${r.medal ? MEDAL[r.medal] : ''}</td></tr>`;
    this.resultEl.innerHTML = `<h3>${escape(title)}</h3><table>${rows.map(line).join('')}</table>`;
  }

  setPosition(place: number, of: number, lap: number, laps: number): void {
    const suf = place === 1 || place === 2 ? 'a' : 'e';
    const html = `<b>${place}</b><i>:${suf}</i><small>av ${of}</small>`;
    if (this.pos.innerHTML !== html) this.pos.innerHTML = html;
    this.pos.classList.toggle('first', place === 1);
    const lt = lap <= 0 ? '' : lap > laps ? 'I mål!' : `Varv ${lap}/${laps}`;
    if (this.lap.textContent !== lt) this.lap.textContent = lt;
    this.lap.style.display = lap <= 0 ? 'none' : '';
    this.lap.classList.toggle('last', lap === laps);
  }

  setTimes(total: number, lap: number, best: number): void {
    this.times.innerHTML = `<div><span>Tid</span><b>${fmtTime(total)}</b></div><div><span>Varv</span><b>${fmtTime(lap)}</b></div><div><span>Bäst</span><b>${best < Infinity ? fmtTime(best) : '–'}</b></div>`;
  }

  setBoard(order: Racer[]): void {
    const key = order.map((r) => r.name + (r.done ? '!' : '') + (r.pts ?? '') + (r.tag ?? '') + (r.out ? 'x' : '')).join('|');
    if (key === this.boardKey) return;
    this.boardKey = key;
    this.board.innerHTML = order
      .map((r, i) => `<li class="${r.me ? 'me' : ''} ${r.done ? 'done' : ''}"><span>${i + 1}.</span><span class="rl-dot" style="background:${r.color}"></span><span class="rl-nm">${escape(r.name)}</span>${r.done ? ' 🏁' : ''}${r.out ? ' 💥' : ''}${r.tag !== undefined ? `<small>${escape(r.tag)}</small>` : r.pts !== undefined ? `<small>${r.pts} p</small>` : ''}</li>`)
      .join('');
  }

  /** Draw the minimap with a dot per car. */
  drawMap(racers: Racer[], time: number): void {
    const c = this.map;
    const g = c.getContext('2d')!;
    const W = c.width;
    if (!this.mapBase) this.mapBase = this.buildMap(W);
    g.clearRect(0, 0, W, W);
    g.drawImage(this.mapBase, 0, 0);
    const k = this.mapScale;
    for (const pass of [0, 1])
      for (const r of racers) {
        if ((pass === 1) !== r.me) continue;
        const x = (r.x - this.mapOx) * k;
        const y = (r.z - this.mapOz) * k;
        const rad = (r.me ? 6.5 + Math.sin(time * 6) * 0.8 : 4.6) * this.scale * this.dpr;
        g.beginPath();
        g.arc(x, y, rad, 0, Math.PI * 2);
        g.fillStyle = r.color;
        g.fill();
        g.lineWidth = (r.me ? 2.6 : 1.6) * this.dpr;
        g.strokeStyle = r.me ? '#ffffff' : 'rgba(0,0,0,0.7)';
        g.stroke();
      }
  }

  private buildMap(W: number): HTMLCanvasElement {
    const t = this.track;
    const cv = document.createElement('canvas');
    cv.width = W;
    cv.height = W;
    const g = cv.getContext('2d')!;
    const pad = W * 0.1;
    const span = Math.max(t.maxX - t.minX, t.maxZ - t.minZ) + (this.arenaHw > 0 ? this.arenaHw * 2 + 6 : 0);
    const k = (W - pad * 2) / span;
    this.mapScale = k;
    this.mapOx = (t.minX + t.maxX) / 2 - W / 2 / k;
    this.mapOz = (t.minZ + t.maxZ) / 2 - W / 2 / k;
    g.fillStyle = 'rgba(16, 20, 34, 0.45)';
    const r = W * 0.12;
    g.beginPath();
    g.roundRect(0, 0, W, W, r);
    g.fill();
    const path = (from: number, to: number): void => {
      g.beginPath();
      for (let i = from; i <= to; i++) {
        const j = i % t.n;
        const x = (t.px[j]! - this.mapOx) * k;
        const y = (t.pz[j]! - this.mapOz) * k;
        if (i === from) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
    };
    g.lineJoin = 'round';
    g.lineCap = 'round';
    if (this.arenaHw > 0) {
      // an arena: the floor is the wide ring, with the island as the dark hole in the middle
      path(0, t.n);
      g.closePath();
      g.strokeStyle = 'rgba(0,0,0,0.6)';
      g.lineWidth = this.arenaHw * 2 * k + W * 0.025;
      g.stroke();
      g.strokeStyle = '#8f7c5c';
      g.lineWidth = this.arenaHw * 2 * k;
      g.stroke();
      return cv;
    }
    path(0, t.n);
    g.strokeStyle = 'rgba(0,0,0,0.55)';
    g.lineWidth = W * 0.06;
    g.stroke();
    g.strokeStyle = '#e9e6dd';
    g.lineWidth = W * 0.035;
    g.stroke();
    // gravel, snow, sand and ice stretches in their own colours
    const SURF_COL = ['', '#d8b878', '#ffffff', '#f2d98a', '#9ad6f5'];
    for (let surf = 1; surf < SURF_COL.length; surf++) {
      let a = -1;
      for (let i = 0; i <= t.n; i++) {
        const on = t.surf[i % t.n] === surf;
        if (on && a < 0) a = i;
        if ((!on || i === t.n) && a >= 0) {
          path(a, i);
          g.strokeStyle = SURF_COL[surf]!;
          g.stroke();
          a = -1;
        }
      }
    }
    // the start line
    const sx = (t.px[0]! - this.mapOx) * k;
    const sy = (t.pz[0]! - this.mapOz) * k;
    g.save();
    g.translate(sx, sy);
    g.rotate(Math.atan2(t.tz[0]!, t.tx[0]!));
    g.fillStyle = '#111';
    g.fillRect(-W * 0.012, -W * 0.04, W * 0.024, W * 0.08);
    g.fillStyle = '#fff';
    g.fillRect(-W * 0.012, -W * 0.04, W * 0.012, W * 0.02);
    g.fillRect(0, -W * 0.02, W * 0.012, W * 0.02);
    g.fillRect(-W * 0.012, 0, W * 0.012, W * 0.02);
    g.fillRect(0, W * 0.02, W * 0.012, W * 0.02);
    g.restore();
    return cv;
  }

  /** The speedometer: a rev arc, km/h and the gear. */
  drawSpeedo(kmh: number, rpm: number, gear: number, maxRpm: number, info: { manual: boolean; light: number; gears: number; limiter: boolean; bog: boolean } = { manual: false, light: 0, gears: 6, limiter: false, bog: false }): void {
    const c = this.speedo;
    const g = c.getContext('2d')!;
    const W = c.width;
    const H = c.height;
    g.clearRect(0, 0, W, H);
    const cx = W / 2;
    const cy = H * 0.86;
    const R = Math.min(W * 0.46, H * 0.8);
    const a0 = Math.PI * 1.08;
    const a1 = Math.PI * 1.92;
    g.lineCap = 'round';
    // backing
    g.beginPath();
    g.arc(cx, cy, R * 1.08, Math.PI, 0);
    g.closePath();
    g.fillStyle = 'rgba(16, 20, 34, 0.5)';
    g.fill();
    // rev arc
    g.lineWidth = R * 0.13;
    g.strokeStyle = 'rgba(255,255,255,0.15)';
    g.beginPath();
    g.arc(cx, cy, R * 0.88, a0, a1);
    g.stroke();
    const f = clamp(rpm / (maxRpm + 500), 0, 1);
    const red = clamp((maxRpm - 900) / (maxRpm + 500), 0, 1);
    g.strokeStyle = f > red ? '#ff4433' : f > red * 0.85 ? '#ffd23f' : '#ffffff';
    g.beginPath();
    g.arc(cx, cy, R * 0.88, a0, a0 + (a1 - a0) * f);
    g.stroke();
    // red zone ticks
    g.lineWidth = R * 0.04;
    g.strokeStyle = '#ff4433';
    g.beginPath();
    g.arc(cx, cy, R * 1.0, a0 + (a1 - a0) * red, a1);
    g.stroke();
    // numbers
    g.fillStyle = '#fff';
    g.textAlign = 'center';
    g.textBaseline = 'alphabetic';
    g.font = `900 ${Math.round(R * 0.62)}px Nunito, 'Trebuchet MS', system-ui, sans-serif`;
    g.shadowColor = 'rgba(0,0,0,0.5)';
    g.shadowOffsetY = 2 * this.dpr;
    g.fillText(String(Math.round(kmh)), cx - R * 0.08, cy - R * 0.12);
    g.shadowColor = 'transparent';
    g.font = `800 ${Math.round(R * 0.17)}px Nunito, 'Trebuchet MS', system-ui, sans-serif`;
    g.globalAlpha = 0.85;
    g.fillText('km/h', cx - R * 0.08, cy + R * 0.06);
    g.globalAlpha = 1;
    // gear bubble
    const gx = cx + R * 0.62;
    const gy = cy - R * 0.3;
    g.beginPath();
    g.arc(gx, gy, R * 0.2, 0, Math.PI * 2);
    g.fillStyle = gear < 0 ? '#ff7a2a' : '#ffd23f';
    g.fill();
    g.fillStyle = '#16141f';
    g.font = `900 ${Math.round(R * 0.26)}px Nunito, 'Trebuchet MS', system-ui, sans-serif`;
    g.textBaseline = 'middle';
    g.fillText(gear < 0 ? 'R' : String(gear), gx, gy + R * 0.01);
    // manual box: a tag, a row of shift lights on top, and a hint arrow while it is time to shift up
    const now = performance.now();
    const flash = Math.max(0, 1 - (now - this.flashAt) / 380);
    if (info.manual) {
      g.font = `900 ${Math.round(R * 0.13)}px Nunito, 'Trebuchet MS', system-ui, sans-serif`;
      g.fillStyle = 'rgba(255,255,255,0.85)';
      g.fillText('MAN', gx, gy + R * 0.36);
      const f = clamp(rpm / maxRpm, 0, 1.05);
      const n = 7;
      const step = R * 0.19;
      const ly = Math.max(R * 0.06, 5 * this.dpr);
      const blink = info.light === 3 && Math.floor(now / 90) % 2 === 0;
      for (let i = 0; i < n; i++) {
        const lit = f >= 0.55 + i * 0.066;
        const hue = i < 3 ? '#4ddf6a' : i < 5 ? '#ffd23f' : '#ff4433';
        g.beginPath();
        g.arc(cx + (i - (n - 1) / 2) * step, ly, R * 0.065, 0, Math.PI * 2);
        g.fillStyle = flash > 0.05 ? `rgba(120,230,255,${0.35 + 0.65 * flash})` : lit && (info.light < 3 || blink || i < 5) ? hue : 'rgba(255,255,255,0.14)';
        g.fill();
      }
      if (info.light === 3 && gear > 0 && gear < info.gears) {
        g.fillStyle = blink ? '#ff4433' : '#ffd23f';
        g.font = `900 ${Math.round(R * 0.26)}px Nunito, 'Trebuchet MS', system-ui, sans-serif`;
        g.fillText('▲', gx, gy - R * 0.34);
      }
    }
    if (info.limiter || info.bog) {
      g.font = `900 ${Math.round(R * 0.16)}px Nunito, 'Trebuchet MS', system-ui, sans-serif`;
      g.fillStyle = info.limiter ? '#ff4433' : '#ff9a3c';
      g.fillText(info.limiter ? 'MAX!' : 'SEGT', cx - R * 0.08, cy + R * 0.3);
    }
  }

  private flashAt = -1e9;

  /** The camera button moves up beside the pause button (the pedal schemes need the corner of the screen for the right thumb). */
  setCamTop(on: boolean): void {
    this.root.classList.toggle('camtop', on);
  }

  /** The cue for a perfect shift: the shift lights flash blue for a moment. */
  shiftFlash(): void {
    this.flashAt = performance.now();
  }

  lights(n: number, green: boolean, show: boolean): void {
    this.lightsEl.classList.toggle('show', show);
    this.lightEls.forEach((l, i) => {
      l.className = `rl-light${green ? ' green' : i < n ? ' red' : ''}`;
    });
  }

  /** A big message for `ms` milliseconds (0 = until replaced). */
  msg(text: string, ms = 1400, cls = ''): void {
    if (this.msgTimer) clearTimeout(this.msgTimer);
    const e = this.msgEl;
    e.textContent = text;
    e.className = 'rl-msg';
    void e.offsetWidth;
    e.className = `rl-msg show ${cls}`;
    if (ms > 0)
      this.msgTimer = setTimeout(() => {
        e.className = `rl-msg out ${cls}`;
      }, ms);
  }

  subtitle(text: string): void {
    if (text) this.sub.textContent = text;
    this.sub.classList.toggle('show', !!text);
  }

  wrongWay(on: boolean): void {
    this.wrong.classList.toggle('show', on);
  }

  /** The minimap turns upside down for a few seconds (the co-driver's map held the wrong way up). */
  flipMap(sec: number): void {
    this.map.classList.add('flipped');
    window.clearTimeout(this.flipTimer);
    this.flipTimer = window.setTimeout(() => this.map.classList.remove('flipped'), sec * 1000);
  }
  private flipTimer = 0;

  /** A small line under the position box that fades by itself (never in the middle of the screen). */
  toast(text: string, cls = ''): void {
    const l = el('div', `rl-line ${cls}`.trim(), this.feed);
    l.textContent = text;
    while (this.feed.childElementCount > 2) this.feed.firstElementChild?.remove();
    setTimeout(() => l.remove(), 3300);
  }

  /** A rival's trash talk, same place, a little louder. */
  taunt(text: string): void {
    this.toast(text, 'taunt');
  }

  private same(key: string, v: string | number): boolean {
    const t = String(v);
    if (this.last[key] === t) return true;
    this.last[key] = t;
    return false;
  }

  /** Where the minimap is drawn (for a racer list that changes size). */
  resetBoard(): void {
    this.boardKey = '';
  }

  destroy(): void {
    if (this.msgTimer) clearTimeout(this.msgTimer);
    this.ro.disconnect();
    this.root.remove();
    this.style.remove();
  }
}

function escape(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}
