import { NextRequest, NextResponse } from 'next/server';
import { jsPDF } from 'jspdf';

const FS_TAGS = ['fs1', 'fs2', 'fs3', 'fs4', 'fs5'];
const FS_COLORS: [number, number, number][] = [
  [85, 209, 188],
  [121, 111, 251],
  [207, 247, 72],
  [39, 4, 40],
  [47, 156, 134],
];
const METRIC_COLORS = {
  impressions: [85, 209, 188] as [number, number, number],
  clicks: [121, 111, 251] as [number, number, number],
  ctr: [180, 170, 40] as [number, number, number],
  spend: [39, 4, 40] as [number, number, number],
};
const IMPRESSIONS_BAR_LIGHT: [number, number, number] = [204, 235, 229];
const PLUM: [number, number, number] = [39, 4, 40];
const GRAY: [number, number, number] = [110, 110, 110];
const LIGHT_GRAY: [number, number, number] = [235, 235, 235];
const STATUS_COLORS: Record<string, [number, number, number]> = {
  ACTIVE: [47, 156, 134],
  PAUSED: [201, 138, 31],
  COMPLETED: [107, 114, 128],
  DRAFT: [156, 163, 175],
  ARCHIVED: [75, 85, 99],
  CANCELED: [179, 65, 58],
};

function statusColor(status: string) {
  return STATUS_COLORS[status] || [107, 114, 128];
}

function fsTagLabel(tag: string) {
  return `Flagship Solution ${tag.slice(2)}`;
}

function fmtEuro(n: number) {
  return `€${n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtNum(n: number) {
  return n.toLocaleString('en-GB');
}

function compactNum(n: number) {
  if (Math.abs(n) >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
  return Math.round(n).toString();
}

function shortDate(dateStr: string) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

async function fetchJson(url: string) {
  return fetch(url).then((r) => r.json());
}

function drawLineChart(
  doc: jsPDF,
  {
    x,
    y,
    width,
    height,
    points,
    color,
    title,
    formatValue,
  }: {
    x: number;
    y: number;
    width: number;
    height: number;
    points: { date: string; value: number }[];
    color: [number, number, number];
    title: string;
    formatValue: (v: number) => string;
  }
) {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...PLUM);
  doc.text(title, x, y);

  const gutter = 30;
  const chartX = x + gutter;
  const chartY = y + 10;
  const chartW = width - gutter;
  const chartH = height - 24;

  doc.setDrawColor(...LIGHT_GRAY);
  doc.rect(chartX, chartY, chartW, chartH);

  if (!points || points.length === 0) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(...GRAY);
    doc.text('No data available', chartX + chartW / 2, chartY + chartH / 2, { align: 'center' });
    return;
  }

  const values = points.map((p) => p.value);
  const maxVal = Math.max(...values, 0);
  const minVal = Math.min(...values, 0);
  const range = maxVal - minVal || 1;

  const gridLines = 3;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(...GRAY);
  for (let i = 0; i <= gridLines; i++) {
    const gy = chartY + (chartH * i) / gridLines;
    doc.setDrawColor(245, 245, 245);
    if (i > 0 && i < gridLines) doc.line(chartX, gy, chartX + chartW, gy);
    const val = maxVal - (range * i) / gridLines;
    doc.text(formatValue(val), chartX - 3, gy + 2, { align: 'right' });
  }

  doc.setDrawColor(...color);
  doc.setLineWidth(1.1);
  if (points.length > 1) {
    for (let i = 0; i < points.length - 1; i++) {
      const x1 = chartX + (chartW * i) / (points.length - 1);
      const y1 = chartY + chartH - ((points[i].value - minVal) / range) * chartH;
      const x2 = chartX + (chartW * (i + 1)) / (points.length - 1);
      const y2 = chartY + chartH - ((points[i + 1].value - minVal) / range) * chartH;
      doc.line(x1, y1, x2, y2);
    }
  }
  doc.setLineWidth(0.5);

  doc.setFontSize(6.5);
  doc.setTextColor(...GRAY);
  doc.text(shortDate(points[0].date), chartX, chartY + chartH + 9);
  doc.text(shortDate(points[points.length - 1].date), chartX + chartW, chartY + chartH + 9, { align: 'right' });
}

export async function GET(request: NextRequest) {
  const origin = new URL(request.url).origin;

  const [campaignsRes, namesRes, overviewRes, logoRes] = await Promise.all([
    fetchJson(`${origin}/api/linkedin-campaigns`),
    fetchJson(`${origin}/api/company-names`),
    fetchJson(`${origin}/api/linkedin-campaign-overview`),
    fetch(`${origin}/ctrl-qs-logo.png`),
  ]);

  const campaigns = campaignsRes.campaigns || [];
  const companyNames: Record<string, string> = namesRes.names || {};
  const spendByCampaignId = overviewRes.spendByCampaignId || {};
  const logoBase64 = Buffer.from(await logoRes.arrayBuffer()).toString('base64');

  const liveTags = FS_TAGS.filter((tag) =>
    campaigns.some((c: any) => c.status === 'ACTIVE' && c.name.toLowerCase().includes(tag))
  );

  const fsData: Record<string, any> = {};
  for (const tag of liveTags) {
    const ids = campaigns.filter((c: any) => c.name.toLowerCase().includes(tag)).map((c: any) => c.id);
    const [analyticsRes, companiesRes] = await Promise.all([
      fetchJson(`${origin}/api/linkedin-analytics?range=week&campaignIds=${ids.join(',')}`),
      fetchJson(`${origin}/api/linkedin-companies?range=week&campaignIds=${ids.join(',')}`),
    ]);
    fsData[tag] = {
      trend: analyticsRes.trend || [],
      summary: analyticsRes.summary,
      companies: (companiesRes.companies || []).slice(0, 20),
      activeCount: campaigns.filter((c: any) => c.status === 'ACTIVE' && c.name.toLowerCase().includes(tag)).length,
    };
  }

  const fsCampaigns = campaigns
    .filter((c: any) => FS_TAGS.some((tag) => c.name.toLowerCase().includes(tag)))
    .map((c: any) => ({
      ...c,
      impressions: spendByCampaignId[c.id]?.impressions || 0,
      clicks: spendByCampaignId[c.id]?.clicks || 0,
      spend: spendByCampaignId[c.id]?.spend || 0,
    }));

  const overviewGroups = FS_TAGS.map((tag, i) => {
    const rows = fsCampaigns
      .filter((c: any) => c.name.toLowerCase().includes(tag))
      .sort((a: any, b: any) => b.spend - a.spend);
    return {
      tag,
      label: fsTagLabel(tag),
      color: FS_COLORS[i],
      rows,
      spend: rows.reduce((s: number, r: any) => s + r.spend, 0),
      impressions: rows.reduce((s: number, r: any) => s + r.impressions, 0),
      clicks: rows.reduce((s: number, r: any) => s + r.clicks, 0),
    };
  }).filter((g) => g.rows.length > 0);

  const grandSpend = fsCampaigns.reduce((s: number, r: any) => s + r.spend, 0);
  const grandImpressions = fsCampaigns.reduce((s: number, r: any) => s + r.impressions, 0);
  const grandClicks = fsCampaigns.reduce((s: number, r: any) => s + r.clicks, 0);

  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 44;
  const rightX = pageWidth - marginX;
  const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

  const logoProps = doc.getImageProperties(`data:image/png;base64,${logoBase64}`);
  const logoWidth = 80;
  const logoHeight = (logoProps.height / logoProps.width) * logoWidth;

  function drawMastheadTitle(y0: number) {
    doc.addImage(`data:image/png;base64,${logoBase64}`, 'PNG', marginX, y0, logoWidth, logoHeight);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(22);
    doc.setTextColor(...PLUM);
    doc.text('Flagship Solutions', marginX + logoWidth + 16, y0 + 12);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(...GRAY);
    doc.text('Weekly Report', marginX + logoWidth + 16, y0 + 26);
    doc.text(today, marginX + logoWidth + 16, y0 + 40);
    return y0 + Math.max(logoHeight, 44) + 16;
  }

  function drawContinuationHeader() {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...PLUM);
    doc.text('Flagship Solutions · Weekly Report', marginX, 40);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...GRAY);
    doc.text(today, rightX, 40, { align: 'right' });
    doc.setDrawColor(...LIGHT_GRAY);
    doc.line(marginX, 46, rightX, 46);
    return 66;
  }

  let y = drawMastheadTitle(48);
  doc.setDrawColor(...LIGHT_GRAY);
  doc.line(marginX, y, rightX, y);
  y += 26;

  liveTags.forEach((tag, idx) => {
    if (idx > 0) {
      doc.addPage();
      y = drawContinuationHeader();
    }

    const data = fsData[tag];
    const colorIdx = FS_TAGS.indexOf(tag);
    const color = FS_COLORS[colorIdx];

    doc.setFillColor(...color);
    doc.rect(marginX, y - 12, 4, 16, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.setTextColor(...PLUM);
    doc.text(`${fsTagLabel(tag)} (${tag.toUpperCase()})`, marginX + 12, y);

    const badgeText = 'LIVE';
    doc.setFontSize(7);
    const badgeWidth = doc.getTextWidth(badgeText) + 10;
    doc.setFillColor(...statusColor('ACTIVE'));
    doc.roundedRect(rightX - badgeWidth, y - 10, badgeWidth, 13, 6, 6, 'F');
    doc.setTextColor(255, 255, 255);
    doc.text(badgeText, rightX - badgeWidth / 2, y - 1, { align: 'center' });

    y += 16;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(...GRAY);
    doc.text(
      `${data.activeCount} active campaigns · ${fmtEuro(data.summary?.spend || 0)} invested in the last 7 days · ${fmtNum(data.summary?.impressions || 0)} impressions`,
      marginX + 12,
      y
    );
    y += 22;

    const gap = 18;
    const chartW = (rightX - marginX - gap) / 2;
    const chartH = 118;

    const metricPoints = {
      impressions: data.trend.map((t: any) => ({ date: t.date, value: t.impressions })),
      clicks: data.trend.map((t: any) => ({ date: t.date, value: t.clicks })),
      ctr: data.trend.map((t: any) => ({ date: t.date, value: t.ctr })),
      spend: data.trend.map((t: any) => ({ date: t.date, value: t.spend })),
    };

    drawLineChart(doc, {
      x: marginX,
      y,
      width: chartW,
      height: chartH,
      points: metricPoints.impressions,
      color: METRIC_COLORS.impressions,
      title: 'Impressions',
      formatValue: compactNum,
    });
    drawLineChart(doc, {
      x: marginX + chartW + gap,
      y,
      width: chartW,
      height: chartH,
      points: metricPoints.clicks,
      color: METRIC_COLORS.clicks,
      title: 'Clicks',
      formatValue: compactNum,
    });

    y += chartH + 20;

    drawLineChart(doc, {
      x: marginX,
      y,
      width: chartW,
      height: chartH,
      points: metricPoints.ctr,
      color: METRIC_COLORS.ctr,
      title: 'CTR',
      formatValue: (v) => `${v.toFixed(1)}%`,
    });
    drawLineChart(doc, {
      x: marginX + chartW + gap,
      y,
      width: chartW,
      height: chartH,
      points: metricPoints.spend,
      color: METRIC_COLORS.spend,
      title: 'Spend',
      formatValue: (v) => `€${v.toFixed(0)}`,
    });

    y += chartH + 30;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...PLUM);
    doc.text('Top Companies Viewing Content This Week', marginX, y);
    y += 16;

    const colCompany = marginX;
    const barX0 = rightX - 210;
    const barMaxWidth = 150;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(...GRAY);
    doc.text('COMPANY', colCompany, y);
    doc.text('IMPRESSIONS', rightX, y, { align: 'right' });
    y += 6;
    doc.setDrawColor(...LIGHT_GRAY);
    doc.line(marginX, y, rightX, y);
    y += 14;

    if (data.companies.length === 0) {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(...GRAY);
      doc.text('No company engagement recorded this week.', colCompany, y);
      y += 14;
    } else {
      const maxImpressions = Math.max(...data.companies.map((c: any) => c.impressions), 1);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      for (const c of data.companies) {
        const name = companyNames[c.orgId] || `Company (ID: ${c.orgId})`;
        doc.setTextColor(60, 60, 60);
        doc.text(name.length > 48 ? name.slice(0, 45) + '...' : name, colCompany, y);

        const barW = (c.impressions / maxImpressions) * barMaxWidth;
        doc.setFillColor(...IMPRESSIONS_BAR_LIGHT);
        doc.rect(barX0, y - 7, barW, 9, 'F');

        doc.setTextColor(60, 60, 60);
        doc.text(fmtNum(c.impressions), rightX, y, { align: 'right' });
        y += 13.5;
      }
    }
  });

  // Final page: full Campaign Overview table (all-time, not weekly)
  doc.addPage();
  y = drawContinuationHeader();
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(...PLUM);
  doc.text('Campaign Overview', marginX, y);
  y += 16;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...GRAY);
  doc.text('Investment to date by Flagship Solution, across every campaign regardless of status.', marginX, y);
  y += 24;

  const colName = marginX;
  const colStatus = marginX + 216;
  const colInvestment = rightX - 136;
  const colImpressions = rightX - 61;
  const colClicks = rightX;

  function drawColumnHeaders() {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...GRAY);
    doc.text('CAMPAIGN', colName, y);
    doc.text('STATUS', colStatus, y);
    doc.text('INVESTMENT', colInvestment, y, { align: 'right' });
    doc.text('IMPRESSIONS', colImpressions, y, { align: 'right' });
    doc.text('CLICKS', colClicks, y, { align: 'right' });
    y += 8;
    doc.setDrawColor(...LIGHT_GRAY);
    doc.line(marginX, y, rightX, y);
    y += 16;
  }

  function ensureSpace(rowsNeeded: number) {
    if (y + rowsNeeded > pageHeight - 50) {
      doc.addPage();
      y = drawContinuationHeader();
      drawColumnHeaders();
    }
  }

  drawColumnHeaders();

  for (const group of overviewGroups) {
    ensureSpace(24);
    doc.setFillColor(...group.color);
    doc.rect(marginX, y - 11, 4, 14, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(...PLUM);
    doc.text(group.label, marginX + 10, y);
    doc.text(fmtEuro(group.spend), colInvestment, y, { align: 'right' });
    doc.text(fmtNum(group.impressions), colImpressions, y, { align: 'right' });
    doc.text(fmtNum(group.clicks), colClicks, y, { align: 'right' });
    y += 18;

    doc.setFont('helvetica', 'normal');
    for (const c of group.rows) {
      ensureSpace(16);
      doc.setFontSize(9);
      doc.setTextColor(60, 60, 60);
      doc.text(c.name.length > 40 ? c.name.slice(0, 37) + '...' : c.name, colName + 14, y);

      const sc = statusColor(c.status);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);
      const badgeWidth = doc.getTextWidth(c.status) + 10;
      doc.setFillColor(...sc);
      doc.roundedRect(colStatus, y - 9, badgeWidth, 12, 6, 6, 'F');
      doc.setTextColor(255, 255, 255);
      doc.text(c.status, colStatus + badgeWidth / 2, y - 1, { align: 'center' });
      doc.setFont('helvetica', 'normal');

      doc.setFontSize(9);
      doc.setTextColor(60, 60, 60);
      doc.text(fmtEuro(c.spend), colInvestment, y, { align: 'right' });
      doc.text(fmtNum(c.impressions), colImpressions, y, { align: 'right' });
      doc.text(fmtNum(c.clicks), colClicks, y, { align: 'right' });
      y += 16;
    }
    y += 8;
    doc.setDrawColor(240, 240, 240);
    doc.line(marginX, y, rightX, y);
    y += 16;
  }

  if (y + 20 > pageHeight - 20) {
    doc.addPage();
    y = drawContinuationHeader();
    drawColumnHeaders();
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...PLUM);
  doc.text('Total', colName, y);
  doc.text(fmtEuro(grandSpend), colInvestment, y, { align: 'right' });
  doc.text(fmtNum(grandImpressions), colImpressions, y, { align: 'right' });
  doc.text(fmtNum(grandClicks), colClicks, y, { align: 'right' });

  const arrayBuffer = doc.output('arraybuffer');
  const dateSlug = new Date().toISOString().slice(0, 10);

  return new NextResponse(Buffer.from(arrayBuffer), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="flagship-solutions-weekly-report-${dateSlug}.pdf"`,
    },
  });
}
