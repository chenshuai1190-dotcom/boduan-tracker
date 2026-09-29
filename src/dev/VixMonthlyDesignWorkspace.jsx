import React from 'react';
import { ArrowLeft, Download, Loader2, Share2, X } from 'lucide-react';
import VixRiskDesignPreview from './VixRiskDesignPreview.jsx';
import VixMonthlyReportPreview from './VixMonthlyReportPreview.jsx';
import { VIX_MONTHLY_PREVIEW_REPORTS } from './vixMonthlyPreviewData.js';
import { renderVixMonthlySharePreview } from './vixMonthlySharePreview.js';
import './VixMonthlyDesignWorkspace.css';

// This entire workspace is loaded only by the existing DEV visual entry.
export default function VixMonthlyDesignWorkspace({ ctx = {}, initialView = 'report' }) {
  const params = new URLSearchParams(window.location.search);
  const marketColorMode = ctx.marketColorMode;
  const [view, setView] = React.useState(initialView);
  const [visitedVix, setVisitedVix] = React.useState(initialView === 'vix');
  const [share, setShare] = React.useState(null);
  const [shareError, setShareError] = React.useState('');
  const [sending, setSending] = React.useState(false);
  const scrollRef = React.useRef({ vix: 0, report: 0 });
  const requestRef = React.useRef(0);
  const objectUrlRef = React.useRef(null);
  const dialogRef = React.useRef(null);
  const busyRef = React.useRef(false);

  const navigate = (target) => {
    scrollRef.current[view] = window.scrollY;
    if (target === 'vix') setVisitedVix(true);
    setView(target);
    requestAnimationFrame(() => window.scrollTo(0, scrollRef.current[target]));
  };
  const closeShare = () => {
    requestRef.current += 1;
    busyRef.current = false;
    setShare(null);
    setShareError('');
    setSending(false);
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    objectUrlRef.current = null;
  };
  React.useEffect(() => { closeShare(); }, [marketColorMode]);
  React.useEffect(() => () => {
    requestRef.current += 1;
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
  }, []);
  React.useEffect(() => {
    if (!share) return undefined;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    if (dialogRef.current && !dialogRef.current.open) dialogRef.current.showModal();
    return () => { document.body.style.overflow = previous; };
  }, [Boolean(share)]);

  const generateShare = async (type, report) => {
    if (busyRef.current) return;
    busyRef.current = true;
    const requestId = ++requestRef.current;
    setShareError('');
    setShare({ type, month: report.month, loading: true });
    try {
      await new Promise(resolve => requestAnimationFrame(resolve));
      const blob = await renderVixMonthlySharePreview(report, type, { marketColorMode });
      if (requestId !== requestRef.current) return;
      if (!(blob instanceof Blob) || blob.type !== 'image/png') throw new Error('invalid_image');
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
      const url = URL.createObjectURL(blob);
      objectUrlRef.current = url;
      setShare({ type, month: report.month, loading: false, blob, url,
        filename: `Quote_${report.month}_${type}.png` });
    } catch {
      if (requestId === requestRef.current) {
        setShare({ type, month: report.month, loading: false });
        setShareError('图片生成失败，请关闭后重试。');
      }
    } finally {
      if (requestId === requestRef.current) busyRef.current = false;
    }
  };
  const sendImage = async () => {
    if (!share?.blob || sending) return;
    const requestId = requestRef.current;
    const file = new File([share.blob], share.filename, { type: 'image/png' });
    if (!navigator.canShare?.({ files: [file] })) {
      setShareError('当前浏览器不支持直接分享文件，可以保存图片后发送。');
      return;
    }
    setSending(true);
    setShareError('');
    try { await navigator.share({ files: [file], title: `${share.month} 市场月报` }); }
    catch (error) { if (error?.name !== 'AbortError' && requestId === requestRef.current) setShareError('分享未完成，可以保存图片后发送。'); }
    finally { if (requestId === requestRef.current) setSending(false); }
  };

  return <div className="vmd-workspace" data-vix-monthly-active={view === 'report' ? 'true' : 'false'}>
    <div hidden={view !== 'vix'} className="vmd-vix-page">
      {visitedVix && <VixRiskDesignPreview ctx={{ ...ctx, openVixMonthlyReport: () => navigate('report') }} />}
    </div>
    <div hidden={view !== 'report'}>
      <VixMonthlyReportPreview reports={VIX_MONTHLY_PREVIEW_REPORTS} marketColorMode={marketColorMode}
        initialMonth={params.get('month') || '2025-04'} onBack={() => navigate('vix')} onShare={generateShare} />
      <p className="vmd-preview-note">本地设计 · 已核验历史收盘快照</p>
    </div>
    {share && <dialog ref={dialogRef} className="vmd-share-dialog" onCancel={event => { event.preventDefault(); closeShare(); }}>
      <header><button type="button" onClick={closeShare} aria-label="关闭分享图片"><ArrowLeft size={20}/></button><strong>{share.month} · {share.type === 'daily' ? '每日明细' : '走势总览'}</strong><button type="button" onClick={closeShare} aria-label="关闭"><X size={19}/></button></header>
      <div className="vmd-share-preview">
        {share.loading ? <p role="status"><Loader2 className="animate-spin" size={20}/>正在生成高清图片…</p>
          : share.url ? <img src={share.url} alt={`${share.month} 市场月报${share.type === 'daily' ? '每日明细' : '走势总览'}分享图`} /> : null}
      </div>
      {shareError && <p role="alert" className="vmd-share-error">{shareError}</p>}
      <footer>{share.url && <><a href={share.url} download={share.filename}><Download size={17}/>保存图片</a><button type="button" disabled={sending} onClick={sendImage}><Share2 size={17}/>{sending ? '分享中…' : '系统分享'}</button></>}</footer>
    </dialog>}
  </div>;
}
