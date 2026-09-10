const WIDTH = 1200;
const HEIGHT = 1600;

export const PNL_SHARE_THEMES = Object.freeze([
  Object.freeze({
    id: 'obsidian',
    labelKey: 'pnlShare.themeObsidian',
    labelFallback: '曜石',
    swatchBackground: 'linear-gradient(145deg,#0b0d10 22%,#292e36 48%,#8c929a 55%,#242931 62%,#0b0d10 86%)',
  }),
  Object.freeze({
    id: 'aurora',
    labelKey: 'pnlShare.themeAurora',
    labelFallback: '极光',
    swatchBackground: 'radial-gradient(ellipse at 80% 75%,#46b9bc 0%,transparent 50%),linear-gradient(145deg,#080c17 20%,#5738a3 63%,#152d43)',
  }),
  Object.freeze({
    id: 'ember',
    labelKey: 'pnlShare.themeEmber',
    labelFallback: '暮光',
    swatchBackground: 'radial-gradient(circle at 72% 82%,#ffb879 0%,#be603c 26%,#54212c 47%,#180d15 76%)',
  }),
  Object.freeze({
    id: 'glacier',
    labelKey: 'pnlShare.themeGlacier',
    labelFallback: '冰川',
    swatchBackground: 'linear-gradient(135deg,#071119 22%,#153b55 48%,#a8d9e7 55%,#326a85 64%,#0b1b28 90%)',
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

function obsidian(context) {
  wash(context, gradient(context, [0, 0, 1200, 1600], [
    [0, '#15181e'], [.52, '#090b0f'], [1, '#1c222a'],
  ]));
  wash(context, gradient(context, [1110, 1170, 0, 1110, 1170, 740], [
    [0, 'rgba(162,178,193,.24)'], [1, 'rgba(20,26,34,0)'],
  ], true));

  // Broad folded surfaces, without an axis, time series, or data-shaped marks.
  context.beginPath();
  context.moveTo(-160, 1530);
  context.bezierCurveTo(330, 1040, 720, 1490, 1330, 770);
  context.lineTo(1340, 1230);
  context.bezierCurveTo(780, 1640, 360, 1320, -160, 1750);
  context.closePath();
  context.fillStyle = gradient(context, [300, 980, 1080, 1500], [
    [0, '#12171e'], [.34, '#505b67'], [.48, '#a9afb5'], [.56, '#4f5a67'], [.76, '#161d26'], [1, '#0b1016'],
  ]);
  context.fill();

  context.beginPath();
  context.moveTo(-100, 1610);
  context.bezierCurveTo(540, 1160, 790, 1470, 1290, 1030);
  context.lineTo(1330, 1180);
  context.bezierCurveTo(770, 1660, 380, 1330, -100, 1750);
  context.closePath();
  context.fillStyle = gradient(context, [380, 1080, 1000, 1570], [
    [0, '#18202a'], [.4, '#6f7c89'], [.47, '#c0c5ca'], [.55, '#303b47'], [1, '#0b1016'],
  ]);
  context.fill();

  context.beginPath();
  context.moveTo(1250, 830);
  context.bezierCurveTo(1070, 1160, 860, 1190, 860, 1610);
  context.lineTo(1310, 1610);
  context.closePath();
  context.fillStyle = gradient(context, [860, 1120, 1260, 1370], [
    [0, 'rgba(195,203,211,.05)'], [.32, 'rgba(170,183,195,.35)'], [.4, 'rgba(230,236,241,.58)'], [.52, '#25303b'], [1, '#111820'],
  ]);
  context.fill();
}

function aurora(context) {
  wash(context, gradient(context, [0, 0, 1150, 1600], [
    [0, '#111122'], [.5, '#090c16'], [1, '#17162f'],
  ]));
  wash(context, gradient(context, [1010, 1160, 0, 1010, 1160, 720], [
    [0, 'rgba(125,68,229,.48)'], [.5, 'rgba(76,44,155,.23)'], [1, 'rgba(25,16,63,0)'],
  ], true));
  wash(context, gradient(context, [1130, 1490, 0, 1130, 1490, 630], [
    [0, 'rgba(42,191,193,.38)'], [1, 'rgba(14,64,74,0)'],
  ], true));

  context.beginPath();
  context.moveTo(-120, 1510);
  context.bezierCurveTo(220, 1430, 380, 940, 780, 1120);
  context.bezierCurveTo(980, 1210, 1050, 830, 1300, 730);
  context.lineTo(1320, 1150);
  context.bezierCurveTo(1100, 1460, 870, 1510, 660, 1310);
  context.bezierCurveTo(460, 1120, 190, 1650, -120, 1650);
  context.closePath();
  context.fillStyle = gradient(context, [300, 1500, 1160, 900], [
    [0, 'rgba(78,63,138,.04)'], [.3, 'rgba(163,105,243,.22)'], [.5, 'rgba(172,127,251,.76)'], [.66, 'rgba(103,115,226,.35)'], [.87, 'rgba(91,209,199,.66)'], [1, 'rgba(26,68,88,.03)'],
  ]);
  context.fill();

  context.beginPath();
  context.moveTo(280, 1670);
  context.bezierCurveTo(550, 1250, 690, 1520, 970, 1190);
  context.bezierCurveTo(1140, 985, 1180, 850, 1330, 840);
  context.lineTo(1360, 1110);
  context.bezierCurveTo(1070, 1090, 1040, 1560, 710, 1450);
  context.bezierCurveTo(550, 1390, 530, 1600, 450, 1700);
  context.closePath();
  context.fillStyle = gradient(context, [590, 1640, 1250, 940], [
    [0, 'rgba(103,68,191,0)'], [.3, 'rgba(161,128,235,.32)'], [.6, 'rgba(91,221,210,.56)'], [.78, 'rgba(162,238,223,.8)'], [1, 'rgba(42,112,139,0)'],
  ]);
  context.fill();
}

function ember(context) {
  wash(context, gradient(context, [100, 0, 1100, 1600], [
    [0, '#1b101a'], [.44, '#160c15'], [1, '#3d1725'],
  ]));
  wash(context, gradient(context, [920, 1230, 80, 920, 1230, 680], [
    [0, 'rgba(235,119,64,.55)'], [.48, 'rgba(169,60,51,.32)'], [1, 'rgba(55,18,39,0)'],
  ], true));

  // A setting sun and a horizon are decorative scenery, independent of metrics.
  context.beginPath();
  context.arc(920, 1250, 330, 0, Math.PI * 2);
  context.fillStyle = gradient(context, [750, 950, 1040, 1570], [
    [0, '#d99166'], [.26, '#a65346'], [.61, '#522338'], [1, '#261423'],
  ]);
  context.fill();

  context.beginPath();
  context.arc(920, 1250, 330, 0, Math.PI * 2);
  context.lineWidth = 5;
  context.strokeStyle = gradient(context, [590, 920, 1250, 1440], [
    [0, 'rgba(255,224,185,.8)'], [.48, 'rgba(247,147,99,.66)'], [1, 'rgba(184,62,53,.08)'],
  ]);
  context.stroke();

  context.fillStyle = gradient(context, [0, 1270, 0, 1600], [
    [0, '#351621'], [.12, '#24111c'], [1, '#100c14'],
  ]);
  context.fillRect(0, 1282, WIDTH, HEIGHT - 1282);
  context.fillStyle = gradient(context, [180, 1280, 1200, 1280], [
    [0, 'rgba(253,153,105,0)'], [.72, 'rgba(253,153,105,.65)'], [1, 'rgba(253,153,105,.08)'],
  ]);
  context.fillRect(0, 1281, WIDTH, 2);
  wash(context, gradient(context, [970, 1330, 0, 970, 1330, 420], [
    [0, 'rgba(225,105,69,.16)'], [1, 'rgba(44,19,31,0)'],
  ], true));
}

function glacier(context) {
  wash(context, gradient(context, [80, 0, 1200, 1600], [
    [0, '#101b25'], [.45, '#071018'], [1, '#16354a'],
  ]));
  wash(context, gradient(context, [1130, 1240, 0, 1130, 1240, 740], [
    [0, 'rgba(83,163,199,.38)'], [1, 'rgba(12,42,65,0)'],
  ], true));

  context.beginPath();
  context.moveTo(320, 1700);
  context.bezierCurveTo(180, 1330, 550, 1130, 960, 1020);
  context.bezierCurveTo(1160, 960, 1110, 780, 1320, 710);
  context.lineTo(1360, 1430);
  context.bezierCurveTo(1030, 1640, 730, 1390, 610, 1690);
  context.closePath();
  context.fillStyle = gradient(context, [410, 1010, 1190, 1600], [
    [0, '#142e40'], [.22, '#2b5b74'], [.37, '#9ac9d9'], [.43, '#d0e8ec'], [.47, '#507f97'], [.65, '#183b54'], [1, '#0a1929'],
  ]);
  context.fill();

  context.beginPath();
  context.moveTo(630, 1720);
  context.bezierCurveTo(480, 1430, 690, 1250, 1070, 1190);
  context.bezierCurveTo(1220, 1160, 1160, 1070, 1320, 970);
  context.lineTo(1350, 1200);
  context.bezierCurveTo(1190, 1320, 1100, 1330, 940, 1390);
  context.bezierCurveTo(780, 1450, 740, 1560, 760, 1740);
  context.closePath();
  context.fillStyle = gradient(context, [640, 1220, 1210, 1590], [
    [0, 'rgba(188,225,237,.64)'], [.18, 'rgba(91,164,193,.38)'], [.25, 'rgba(218,243,249,.8)'], [.32, 'rgba(62,128,158,.58)'], [1, '#112c42'],
  ]);
  context.fill();
}

/** Pure, local artwork: this function accepts a theme id, never account data or URLs. */
export function drawPnlShareBackground(context, themeId) {
  const id = normalizePnlShareTheme(themeId);
  context.save();
  wash(context, '#08090b');
  ({ obsidian, aurora, ember, glacier })[id](context);

  // Dark veils keep the fixed title/number and footer areas legible in every theme.
  context.fillStyle = gradient(context, [0, 0, 0, 1110], [
    [0, 'rgba(6,8,12,.24)'], [.57, 'rgba(6,8,12,.7)'], [.81, 'rgba(6,8,12,.38)'], [1, 'rgba(6,8,12,0)'],
  ]);
  context.fillRect(0, 0, WIDTH, 1110);
  context.fillStyle = gradient(context, [0, 1240, 0, 1600], [
    [0, 'rgba(5,7,11,0)'], [.6, 'rgba(5,7,11,.62)'], [1, 'rgba(5,7,11,.9)'],
  ]);
  context.fillRect(0, 1240, WIDTH, HEIGHT - 1240);
  context.restore();
  return id;
}
