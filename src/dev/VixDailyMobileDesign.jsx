import React from 'react';
import { ArrowLeft, ArrowRight, Download, Loader2 } from 'lucide-react';
import { VIX_MONTHLY_PREVIEW_REPORTS } from './vixMonthlyPreviewData.js';
import * as mobileShare from './vixDailyMobileShare.js';
import './VixDailyMobileDesign.css';

// Local layout study: captured historical reports, no provider or account reads.
export default function VixDailyMobileDesign({ ctx = {} }) {
  const query = new URLSearchParams(window.location.search);
  const [month, setMonth] = React.useState(query.get('month') || '2025-04');
  const [shareType, setShareType] = React.useState(query.get('shareType') === 'overview' ? 'overview' : 'daily');
  const [attempt, setAttempt] = React.useState(0);
  const [image, setImage] = React.useState(null);
  const [error, setError] = React.useState('');
  const report = VIX_MONTHLY_PREVIEW_REPORTS.find(item => item.month === month) || VIX_MONTHLY_PREVIEW_REPORTS[0];
  const reportIndex = VIX_MONTHLY_PREVIEW_REPORTS.indexOf(report);
  const signature = `${report.month}:${shareType}:${ctx.marketColorMode}:${attempt}`;
  const currentImage = image?.signature === signature ? image : null;

  React.useEffect(() => {
    let active = true;
    let url;
    setError('');
    const draw = async () => {
      try {
        await document.fonts.ready;
        const render = shareType === 'overview' ? mobileShare.renderVixOverviewMobileShare : mobileShare.renderVixDailyMobileShare;
        const blob = await render(report, { marketColorMode: ctx.marketColorMode });
        if (!active) return;
        url = URL.createObjectURL(blob);
        setImage({ signature, url, filename: `Quote_${report.month}_${shareType}_mobile.png` });
      } catch {
        if (active) setError('图片暂时无法生成，请重试。');
      }
    };
    draw();
    return () => { active = false; if (url) URL.revokeObjectURL(url); };
  }, [report, shareType, ctx.marketColorMode, signature]);

  const moveMonth = offset => {
    const next = VIX_MONTHLY_PREVIEW_REPORTS[reportIndex + offset];
    if (next) setMonth(next.month);
  };

  return <main className="vix-mobile-design" data-vix-mobile-share-design="true">
    <header className="vix-mobile-design-header">
      <a href={`/?devPreview=1&tab=vix-monthly-report&month=${report.month}`} aria-label="返回市场月报"><ArrowLeft size={20} /></a>
      <h1>长图预览</h1>
      {currentImage ? <a className="vix-mobile-design-save" href={currentImage.url} download={currentImage.filename}><Download size={16}/>保存图片</a> : <button className="vix-mobile-design-save" disabled>生成中</button>}
    </header>
    <section className="vix-mobile-design-controls" aria-label="分享图设置">
      <div className="vix-mobile-design-month">
        <button onClick={() => moveMonth(-1)} disabled={reportIndex === 0} aria-label="上个月"><ArrowLeft size={17} /></button>
        <span>{report.monthLabel}</span>
        <button onClick={() => moveMonth(1)} disabled={reportIndex === VIX_MONTHLY_PREVIEW_REPORTS.length - 1} aria-label="下个月"><ArrowRight size={17} /></button>
      </div>
      <div className="vix-mobile-design-types" role="group" aria-label="分享内容">
        {[['overview', '市场总览'], ['daily', '每日明细']].map(([value, label]) => <button key={value} aria-pressed={shareType === value} onClick={() => setShareType(value)}>{label}</button>)}
      </div>
      <p className="vix-mobile-design-hint">本地设计 · 历史收盘快照 · 整月一张，上下滑动查看</p>
    </section>
    <section className="vix-mobile-design-stage" data-mobile-share-stage aria-label="生成的分享图片" aria-busy={!currentImage && !error}>
      {currentImage ? <img src={currentImage.url} alt={`${report.monthLabel}${shareType === 'overview' ? '市场总览' : '每日明细'}，完整月份长图`} />
        : <div className="vix-mobile-design-feedback"><p role={error ? 'alert' : 'status'}>{error || <><Loader2 size={20} className="vix-mobile-design-spin" /> 正在生成图片…</>}</p>{error && <button onClick={() => setAttempt(value => value + 1)}>重试</button>}</div>}
    </section>
  </main>;
}
