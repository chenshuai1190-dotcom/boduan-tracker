import React from 'react';
import { ArrowLeft, Download, Loader2, Share2, X } from 'lucide-react';
import { buildVixMonthlyReport, listVixMonthlyReports } from '../lib/vixMonthlyReport.js';
import { renderVixMonthlyShare } from '../lib/vixMonthlyShare.js';
import VixMonthlyReportView from './VixMonthlyReportView.jsx';
import './VixMonthlyReportPage.css';

function MonthlyReportSession({ data, expectedAsOfDate, loading = false, error, onBack, onRefresh, marketColorMode }) {
  const months = React.useMemo(() => listVixMonthlyReports(data, { expectedAsOfDate }), [data, expectedAsOfDate]);
  const [chosenMonth, setChosenMonth] = React.useState(null);
  const month = months.some(item => item.month === chosenMonth) ? chosenMonth : months.at(-1)?.month;
  const [result, setResult] = React.useState(null);
  const reportCache = React.useRef({ data: null, expectedAsOfDate: null, reports: new Map() });
  const buildRequestRef = React.useRef(0);
  const [shareState, setShare] = React.useState(null);
  const [shareError, setShareError] = React.useState('');
  const [sending, setSending] = React.useState(false);
  const shareRequestRef = React.useRef(0);
  const objectUrlRef = React.useRef(null);
  const dialogRef = React.useRef(null);
  const busyRef = React.useRef(false);
  const sessionActiveRef = React.useRef(true);
  const inputRef = React.useRef({ data, expectedAsOfDate, marketColorMode });
  inputRef.current = { data, expectedAsOfDate, marketColorMode };
  // Hide an obsolete image during render, before effects revoke its object URL.
  const share = data && shareState?.data === data
    && shareState?.expectedAsOfDate === expectedAsOfDate && shareState?.marketColorMode === marketColorMode ? shareState : null;

  React.useEffect(() => {
    const requestId = ++buildRequestRef.current;
    if (!data) {
      reportCache.current = { data: null, expectedAsOfDate: null, reports: new Map() };
      setResult(null);
      return undefined;
    }
    if (!month) return undefined;
    if (reportCache.current.data !== data || reportCache.current.expectedAsOfDate !== expectedAsOfDate) {
      reportCache.current = { data, expectedAsOfDate, reports: new Map() };
    }
    const cached = reportCache.current.reports.get(month);
    if (cached) {
      setResult({ data, month, expectedAsOfDate, report: cached });
      return undefined;
    }
    // Paint the selected month and loading state before its historical replay.
    // Only this month is replayed; the cache is scoped to this provider payload.
    let timer;
    const frame = requestAnimationFrame(() => {
      timer = setTimeout(() => {
        if (requestId !== buildRequestRef.current) return;
        try {
          const report = buildVixMonthlyReport(data, { month, expectedAsOfDate });
          if (requestId !== buildRequestRef.current) return;
          reportCache.current.reports.set(month, report);
          setResult({ data, month, expectedAsOfDate, report });
        } catch {
          if (requestId === buildRequestRef.current) setResult({ data, month, expectedAsOfDate, report: null, failed: true });
        }
      }, 0);
    });
    return () => {
      buildRequestRef.current += 1;
      cancelAnimationFrame(frame);
      clearTimeout(timer);
    };
  }, [data, month, expectedAsOfDate]);

  const currentResult = result?.data === data && result?.month === month
    && result?.expectedAsOfDate === expectedAsOfDate ? result : null;
  const report = currentResult?.report;
  const computing = Boolean(month && !currentResult);
  const stale = Boolean(data?.stale || data?.termStructure?.stale);
  const notice = currentResult?.failed ? '这个月的历史数据暂时无法整理，请刷新后重试。'
    : error ? '刷新失败，保留已读取的历史数据；完整性以各月覆盖情况为准。'
      : stale ? '当前使用已保存的收盘历史，尚未确认新的数据；完整性以各月覆盖情况为准。'
        : computing ? '正在整理这个月的收盘数据…' : null;

  const closeShare = React.useCallback(() => {
    shareRequestRef.current += 1;
    busyRef.current = false;
    setShare(null);
    setShareError('');
    setSending(false);
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    objectUrlRef.current = null;
  }, []);

  React.useEffect(() => { closeShare(); }, [data, expectedAsOfDate, marketColorMode, closeShare]);
  React.useEffect(() => {
    sessionActiveRef.current = true;
    return () => {
      sessionActiveRef.current = false;
      buildRequestRef.current += 1;
      shareRequestRef.current += 1;
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    };
  }, []);
  const shareOpen = Boolean(share);
  React.useEffect(() => {
    if (!shareOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    if (dialogRef.current && !dialogRef.current.open) dialogRef.current.showModal();
    return () => { document.body.style.overflow = previousOverflow; };
  }, [shareOpen]);

  const generateShare = async (type, selectedReport) => {
    if (busyRef.current || !selectedReport || !data || !sessionActiveRef.current) return;
    busyRef.current = true;
    const sourceData = data;
    const sourceExpected = expectedAsOfDate;
    const sourceColorMode = marketColorMode;
    const requestId = ++shareRequestRef.current;
    const isCurrent = () => sessionActiveRef.current && requestId === shareRequestRef.current
      && inputRef.current.data === sourceData && inputRef.current.expectedAsOfDate === sourceExpected
      && inputRef.current.marketColorMode === sourceColorMode;
    const shareIdentity = { data: sourceData, expectedAsOfDate: sourceExpected, marketColorMode: sourceColorMode };
    setShareError('');
    setShare({ ...shareIdentity, type, month: selectedReport.month, loading: true });
    try {
      await new Promise(resolve => requestAnimationFrame(resolve));
      if (!isCurrent()) return;
      const blob = await renderVixMonthlyShare(selectedReport, type, { marketColorMode: sourceColorMode });
      if (!isCurrent()) return;
      if (!(blob instanceof Blob) || blob.type !== 'image/png') throw new Error('invalid_image');
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
      const url = URL.createObjectURL(blob);
      objectUrlRef.current = url;
      setShare({ ...shareIdentity, type, month: selectedReport.month, loading: false, blob, url,
        filename: `Quote_${selectedReport.month}_${type}.png` });
    } catch {
      if (isCurrent()) {
        setShare({ ...shareIdentity, type, month: selectedReport.month, loading: false });
        setShareError('图片生成失败，请关闭后重试。');
      }
    } finally {
      if (requestId === shareRequestRef.current) busyRef.current = false;
    }
  };

  const sendImage = async () => {
    if (!share?.blob || sending) return;
    const requestId = shareRequestRef.current;
    const file = new File([share.blob], share.filename, { type: 'image/png' });
    if (!navigator.canShare?.({ files: [file] }) || !navigator.share) {
      setShareError('当前浏览器不支持直接分享文件，可以保存图片后发送。');
      return;
    }
    setSending(true);
    setShareError('');
    try { await navigator.share({ files: [file], title: `${share.month} 市场月报` }); }
    catch (shareFailure) {
      if (shareFailure?.name !== 'AbortError' && requestId === shareRequestRef.current) setShareError('分享未完成，可以保存图片后发送。');
    } finally {
      if (requestId === shareRequestRef.current) setSending(false);
    }
  };

  return <div className="vmp-page" data-vix-monthly-page="true">
    <VixMonthlyReportView report={report} month={month || null} onMonthChange={setChosenMonth}
      availableMonths={months} marketColorMode={marketColorMode} loading={loading || computing} notice={notice} onRefresh={onRefresh}
      onBack={() => { closeShare(); onBack?.(); }} onShare={generateShare} />
    {share && <dialog ref={dialogRef} className="vmp-share-dialog" aria-label="月报分享图片" onCancel={event => { event.preventDefault(); closeShare(); }}>
      <header><button type="button" onClick={closeShare} aria-label="关闭分享图片"><ArrowLeft size={20}/></button><strong>{share.month} · {share.type === 'daily' ? '每日明细' : '走势总览'}</strong><button type="button" onClick={closeShare} aria-label="关闭"><X size={19}/></button></header>
      <div className="vmp-share-preview">
        {share.loading ? <p role="status"><Loader2 className="vmr-spin" size={20}/>正在生成高清图片…</p>
          : share.url ? <img src={share.url} alt={`${share.month} 市场月报${share.type === 'daily' ? '每日明细' : '走势总览'}分享图`} /> : null}
      </div>
      {shareError && <p role="alert" className="vmp-share-error">{shareError}</p>}
      <footer>{share.url && <><a href={share.url} download={share.filename}><Download size={17}/>保存图片</a><button type="button" disabled={sending} onClick={sendImage}><Share2 size={17}/>{sending ? '分享中…' : '系统分享'}</button></>}</footer>
    </dialog>}
  </div>;
}

// Identity changes remount only this read-only session, cancelling old builders
// and image requests before another user's provider payload is displayed.
export default function VixMonthlyReportPage({ userId, ...props }) {
  return <MonthlyReportSession key={userId || 'anonymous'} {...props} />;
}
