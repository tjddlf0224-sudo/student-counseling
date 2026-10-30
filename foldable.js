/* ============================================================
 *  foldable.js — 접는 폰(iPhone Duo·갤럭시 폴드·플립) 맞춤 화면 (2026-10-27, 공용)
 *  전산회계 오락실이 처음 만들고 ~/개발팀/공용/foldable/ 에 복사해 다른 앱이 같이 쓴다.
 *
 *  무엇을. 접힘 상태를 알아내 <html> 에 클래스 하나와 CSS 변수를 붙이고 'foldchange' 이벤트를 쏜다.
 *    html.fold-tabletop — 반쯤 접고 접힌 선이 가로(아래 절반을 책상에 눕힘, DS 모드): 위 = 보는 칸, 아래 = 누르는 칸
 *    html.fold-book     — 반쯤 접고 접힌 선이 세로(책처럼): 왼쪽 칸 | 오른쪽 칸
 *    html.fold-wide     — 접는 폰을 활짝 편 넓은 안쪽 화면
 *    (클래스 없음)       — 접힘 정보가 없거나 일반 폰·아이패드·맥 — **지금 화면 그대로**
 *    --fold-a : 위(가로 선) 또는 왼쪽(세로 선) 칸의 크기(px, 웹 화면 기준)
 *    --hinge  : 접힌 선 두께(px) — 이 띠 위에는 버튼·글자를 두지 않는다
 *
 *  어떻게(먼저 있는 것부터).
 *    1) 네이티브가 보내는 'nativefold' 이벤트(window.__nativeFold 에도 남김)
 *       둘 다 {source, status:'half'|'flat'|'closed'|'none', orient:'h'|'v', x,y,w,h(웹뷰 기준 CSS px)} 를 보낸다
 *       · 안드로이드: Jetpack WindowManager FoldingFeature bounds (+ sep: isSeparating, occ: occlusionType)
 *       · iOS 27.1+: UIHingeInteraction 상태 + UIView.reservedRegions(.division) frame(손가락 여백 포함)
 *         (애플 Tech Talk 111464: 상태·각도는 효과용, 배치는 reserved region 으로)
 *         선 위치를 못 받았을 때만 가운데로 보고 화면의 긴 쪽을 반으로 나눈다(가로로 들면 책, 세로로 들면 DS)
 *       · 선이 창 밖이면(분할 화면) 네이티브가 선을 안 실어 접힘 배치를 하지 않는다
 *       · 여닫는 도중에도 잠깐 'half'(예: 165°)가 온다 — 마지막 상태로 다시 맞춰지니 그대로 둔다
 *    2) 웹 표준(viewport segments) — 있으면(안드 WebView·iOS 에서 되는지는 아직 모름)
 *    3) 위가 다 없으면 아무것도 안 함. 화면 너비만으로 'wide' 를 짐작하지 않는다(태블릿·아이패드·맥 오인 방지).
 *  네이티브는 페이지가 바뀔 때마다 마지막 상태를 다시 보낸다(안드 MainActivity·iOS SceneDelegate FoldBridge).
 * ============================================================ */
(function (global) {
  'use strict';
  if (global.Foldable) return;
  var html = document.documentElement;
  var MODES = ['tabletop', 'book', 'wide'];
  var IOS_HINGE = 24;          // iOS 가 선 위치를 못 줄 때만 쓰는 가운데 띠 두께
  var cur = { mode: '', a: 0, hinge: 0, source: '' };

  function isPadOrMac() {
    var ua = navigator.userAgent || '';
    if (/iPad/.test(ua)) return true;
    if (/Macintosh/.test(ua)) return true;                     // 아이패드 데스크톱 UA·맥(Designed for iPad)
    return html.classList.contains('on-mac');
  }

  function apply(mode, a, hinge, source) {
    if (mode && isPadOrMac()) mode = '';
    a = Math.max(0, Math.round(a || 0)); hinge = Math.max(0, Math.round(hinge || 0));
    var changed = mode !== cur.mode || a !== cur.a || hinge !== cur.hinge;
    MODES.forEach(function (m) { html.classList.toggle('fold-' + m, m === mode); });
    if (mode) {
      html.style.setProperty('--fold-a', a + 'px');
      html.style.setProperty('--hinge', hinge + 'px');
    } else {
      html.style.removeProperty('--fold-a');
      html.style.removeProperty('--hinge');
    }
    var modeChanged = mode !== cur.mode;
    cur = { mode: mode, a: a, hinge: hinge, source: source || '' };
    if (changed) {
      try { global.dispatchEvent(new CustomEvent('foldchange', { detail: { mode: mode, a: a, hinge: hinge, source: cur.source, modeChanged: modeChanged } })); } catch (e) {}
    }
  }

  // 활짝 폈을 때 '넓은 화면'으로 볼지 — 플립처럼 펴도 폰 너비면 지금 화면 그대로
  var WIDE_MIN = 560;
  // 폭마다 본 가장 큰 높이 — 키보드가 웹뷰 높이를 줄여도(안드 adjustResize 등) 배치가 뒤집히지 않게
  // (예: iOS 반쯤 접힘에서 높이만 줄면 W > H 가 되어 DS → 책으로 바뀌어 버림. 2026-10-27 상담일지 입력칸)
  var fullH = {};
  function fullHeight(W, H) { var k = Math.round(W); if (!(fullH[k] >= H)) fullH[k] = H; return fullH[k]; }
  function fromNative(n) {
    var W = global.innerWidth, H = fullHeight(W, global.innerHeight), wide = Math.min(W, H) >= WIDE_MIN;
    if (!n || !n.status || n.status === 'none' || n.status === 'closed' || n.status === 'unknown') return false;
    var src = n.source || 'native';
    var hasLine = n.orient === 'h' || n.orient === 'v';
    // 두 칸으로 나눌 때: 반쯤 접힘, 또는 펴져 있어도 선이 창을 나누거나(sep) 화면을 가리는(occ) 기기(안드 두 화면 기기)
    var split = n.status === 'half' || (hasLine && (n.sep === true || n.occ === 'full'));
    if (split && hasLine) {
      // 안드(FoldingFeature bounds)·iOS(reservedRegions .division frame) 모두 웹뷰 기준 선 위치를 준다
      if (n.orient === 'h') { apply('tabletop', n.y, Math.max(n.h || 0, 12), src); return true; }
      apply('book', n.x, Math.max(n.w || 0, 12), src); return true;
    }
    if (split && src === 'ios' && n.status === 'half') {
      // 선 위치를 못 받았을 때만(옛 시스템 등) — 가운데로 보고 화면의 긴 쪽을 반으로 나눈다(Device Hub 로 확인, 10/27):
      // 펼친 안쪽 화면을 가로로 들면(951×669) 선이 세로 = 책, 세로로 들면(669×951) 선이 가로 = DS
      if (W > H) { apply('book', (W - IOS_HINGE) / 2, IOS_HINGE, src); return true; }
      apply('tabletop', (H - IOS_HINGE) / 2, IOS_HINGE, src); return true;
    }
    if (n.status === 'flat' && wide) { apply('wide', hasLine && n.orient === 'v' ? n.x : W / 2, 0, src); return true; }
    return false;
  }

  function fromWebStandard() {
    var vp = global.viewport, segs = (vp && vp.segments) || (global.visualViewport && global.visualViewport.segments);
    if (!segs || segs.length !== 2) return false;
    var s0 = segs[0], s1 = segs[1];
    if (s1.top >= s0.bottom - 1) { apply('tabletop', s0.height, Math.max(0, s1.top - s0.bottom), 'web'); return true; }
    if (s1.left >= s0.right - 1) { apply('book', s0.width, Math.max(0, s1.left - s0.right), 'web'); return true; }
    return false;
  }

  function compute() {
    if (fromNative(global.__nativeFold)) return;
    if (fromWebStandard()) return;
    apply('', 0, 0, '');
  }

  global.addEventListener('nativefold', function (e) { if (e && e.detail) global.__nativeFold = e.detail; compute(); });
  global.addEventListener('resize', compute);
  try { if (navigator.devicePosture && navigator.devicePosture.addEventListener) navigator.devicePosture.addEventListener('change', compute); } catch (e) {}

  global.Foldable = {
    get mode() { return cur.mode; },
    get state() { return { mode: cur.mode, a: cur.a, hinge: cur.hinge, source: cur.source }; },
    refresh: compute,
  };
  compute();
})(window);
