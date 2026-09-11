const WIDTH = 1200;
const HEIGHT = 1600;

export const PNL_SHARE_THEMES = Object.freeze([
  Object.freeze({
    id: 'obsidian',
    labelKey: 'pnlShare.themeObsidian',
    labelFallback: '曜石',
    swatchBackground: 'linear-gradient(156deg,#111214 34%,#303336 35%,#202225 63%,#101113 64%)',
  }),
  Object.freeze({
    id: 'aurora',
    labelKey: 'pnlShare.themeAurora',
    labelFallback: '雾墨',
    swatchBackground: 'radial-gradient(ellipse at 80% 100%,#3a4540 0%,#202925 40%,transparent 70%),linear-gradient(140deg,#111514,#1b211e)',
  }),
  Object.freeze({
    id: 'ember',
    labelKey: 'pnlShare.themeEmber',
    labelFallback: '暖灰',
    swatchBackground: 'radial-gradient(ellipse at 100% 135%,#211d19 34%,#4b4238 35%,#37312b 61%,transparent 62%),linear-gradient(140deg,#191715,#29241f)',
  }),
  Object.freeze({
    id: 'glacier',
    labelKey: 'pnlShare.themeGlacier',
    labelFallback: '银雾',
    swatchBackground: 'linear-gradient(112deg,#131517 25%,#222629 26%,#464b4e 58%,#292d30 59%,#171a1c 83%)',
  }),
]);

export function normalizePnlShareTheme(id) {
  return PNL_SHARE_THEMES.some(theme => theme.id === id) ? id : 'obsidian';
}

function gradient(context, coordinates, stops, radial = false) {
  const fill = radial
    ? context.createRadialGradient(...coordinates)
    : context.createLinearGradient(...coordinates);
  stops.forEach(([offset, color]) => fill.addColorStop(offset, color));
  return fill;
}

function wash(context, fill) {
  context.fillStyle = fill;
  context.fillRect(0, 0, WIDTH, HEIGHT);
}

function plane(context, points, fill) {
  context.beginPath();
  context.moveTo(...points[0]);
  points.slice(1).forEach(point => context.lineTo(...point));
  context.closePath();
  context.fillStyle = fill;
  context.fill();
}

function obsidian(context) {
  wash(context, gradient(context, [0, 0, 1000, 1600], [
    [0, '#141517'], [.56, '#0d0e10'], [1, '#202225'],
  ]));
  // Matte graphite planes, with a single quiet seam below the text area.
  plane(context, [[-120, 1330], [1300, 890], [1300, 1530], [-120, 1690]],
    gradient(context, [460, 960, 810, 1550], [
      [0, '#34373a'], [.32, '#25272a'], [.7, '#17191b'], [1, '#101113'],
    ]));
  plane(context, [[-120, 1510], [1300, 1160], [1300, 1710], [-120, 1710]],
    gradient(context, [590, 1210, 720, 1650], [[0, '#2a2d30'], [.55, '#1b1d20'], [1, '#121315']]));
  context.beginPath();
  context.moveTo(-120, 1330);
  context.lineTo(1300, 890);
  context.strokeStyle = gradient(context, [0, 1290, 1200, 950], [
    [0, 'rgba(175,179,183,0)'], [.7, 'rgba(175,179,183,.18)'], [1, 'rgba(175,179,183,0)'],
  ]);
  context.lineWidth = 1.2;
  context.stroke();
}

function aurora(context) {
  wash(context, gradient(context, [0, 0, 1200, 1600], [
    [0, '#141816'], [.52, '#101412'], [1, '#242d28'],
  ]));
  wash(context, gradient(context, [1100, 1280, 0, 1100, 1280, 730], [
    [0, 'rgba(99,116,105,.12)'], [.45, 'rgba(63,78,67,.06)'], [1, 'rgba(28,34,30,0)'],
  ], true));
  // Wide ink-like layers carry texture without suggesting a financial curve.
  context.beginPath();
  context.moveTo(-100, 1450);
  context.bezierCurveTo(260, 1180, 600, 1450, 850, 1150);
  context.bezierCurveTo(1040, 925, 1110, 990, 1320, 850);
  context.lineTo(1340, 1700);
  context.lineTo(-100, 1700);
  context.closePath();
  context.fillStyle = gradient(context, [410, 1030, 770, 1600], [
    [0, '#1a211d'], [.33, '#343f38'], [.62, '#252f29'], [1, '#141a16'],
  ]);
  context.fill();
  context.beginPath();
  context.moveTo(-100, 1580);
  context.bezierCurveTo(430, 1220, 780, 1590, 1280, 1030);
  context.lineTo(1320, 1710);
  context.lineTo(-100, 1710);
  context.closePath();
  context.fillStyle = gradient(context, [540, 1220, 730, 1660], [
    [0, 'rgba(110,128,115,.14)'], [.28, '#222c26'], [1, '#101612'],
  ]);
  context.fill();
}

function ember(context) {
  wash(context, gradient(context, [0, 0, 1200, 1600], [
    [0, '#1c1916'], [.5, '#141210'], [1, '#302a24'],
  ]));
  // Broad, cropped relief rings evoke warm stone rather than a glowing sun.
  context.beginPath();
  context.arc(1260, 1600, 660, 0, Math.PI * 2);
  context.fillStyle = gradient(context, [590, 970, 1290, 1600], [
    [0, '#4b4238'], [.28, '#3b342d'], [.62, '#28231f'], [1, '#1c1916'],
  ]);
  context.fill();
  context.beginPath();
  context.arc(1260, 1600, 485, 0, Math.PI * 2);
  context.fillStyle = gradient(context, [790, 1110, 1230, 1600], [
    [0, '#50463c'], [.08, '#2b2621'], [.42, '#1e1b18'], [1, '#171512'],
  ]);
  context.fill();
  context.beginPath();
  context.arc(1260, 1600, 660, 0, Math.PI * 2);
  context.strokeStyle = 'rgba(162,145,124,.13)';
  context.lineWidth = 1;
  context.stroke();
  wash(context, gradient(context, [0, 1110, 1200, 1490], [
    [0, 'rgba(20,18,16,.15)'], [.55, 'rgba(20,18,16,0)'], [1, 'rgba(20,18,16,.08)'],
  ]));
}

function glacier(context) {
  wash(context, gradient(context, [0, 0, 1200, 1600], [
    [0, '#17191b'], [.5, '#101214'], [1, '#292d30'],
  ]));
  // Frosted planes use soft neutral reflections instead of bright blue metal.
  plane(context, [[720, 900], [1320, 730], [1320, 1690], [320, 1690]],
    gradient(context, [400, 1200, 1280, 1430], [
      [0, '#171a1c'], [.47, '#32373b'], [.7, '#454a4e'], [1, '#272b2e'],
    ]));
  plane(context, [[1080, 1020], [1320, 980], [1320, 1720], [810, 1720]],
    gradient(context, [800, 1400, 1300, 1500], [
      [0, '#2a2e31'], [.2, '#3e4347'], [.36, '#262a2d'], [1, '#15181a'],
    ]));
  context.beginPath();
  context.moveTo(720, 900);
  context.lineTo(320, 1690);
  context.strokeStyle = gradient(context, [720, 900, 320, 1690], [
    [0, 'rgba(188,193,197,0)'], [.5, 'rgba(188,193,197,.19)'], [1, 'rgba(188,193,197,0)'],
  ]);
  context.lineWidth = 1.5;
  context.stroke();
}

function paperGrain(context) {
  // A bounded, deterministic texture keeps repeated previews and exports identical.
  for (let index = 0; index < 960; index += 1) {
    const x = (index * 673 + 37) % WIDTH;
    const y = (index * 977 + 91) % HEIGHT;
    context.fillStyle = index % 3 === 0 ? 'rgba(255,255,255,.035)' : 'rgba(0,0,0,.07)';
    context.fillRect(x, y, 1, index % 5 === 0 ? 3 : 1);
  }
}

/** Pure, local artwork: this function accepts a theme id, never account data or URLs. */
export function drawPnlShareBackground(context, themeId) {
  const id = normalizePnlShareTheme(themeId);
  context.save();
  wash(context, '#08090b');
  ({ obsidian, aurora, ember, glacier })[id](context);
  paperGrain(context);

  // Shared neutral veils keep the result and footer legible across all materials.
  context.fillStyle = gradient(context, [0, 0, 0, 1060], [
    [0, 'rgba(8,9,10,.08)'], [.56, 'rgba(8,9,10,.34)'], [.8, 'rgba(8,9,10,.2)'], [1, 'rgba(8,9,10,0)'],
  ]);
  context.fillRect(0, 0, WIDTH, 1060);
  context.fillStyle = gradient(context, [0, 1300, 0, 1600], [
    [0, 'rgba(8,9,10,0)'], [.58, 'rgba(8,9,10,.38)'], [1, 'rgba(8,9,10,.62)'],
  ]);
  context.fillRect(0, 1300, WIDTH, HEIGHT - 1300);
  context.restore();
  return id;
}
