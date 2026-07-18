'use client';
import { useEffect, useRef, useState } from 'react';
import { createClient } from '../../lib/supabase/client';
import { useRouter } from 'next/navigation';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface Summary {
  impressions: number;
  clicks: number;
  ctr: number;
  cpc: number;
  spend: number;
}

interface TrendPoint {
  date: string;
  impressions: number;
  clicks: number;
  ctr: number;
  spend: number;
}

type MetricKey = 'impressions' | 'clicks' | 'ctr' | 'spend';

const metricConfig: Record<MetricKey, { label: string; color: string; formatValue: (v: number) => string }> = {
  impressions: { label: 'Impressions', color: '#55d1bc', formatValue: (v) => v.toLocaleString() },
  clicks: { label: 'Clicks', color: '#796ffb', formatValue: (v) => v.toLocaleString() },
  ctr: { label: 'CTR', color: '#cff748', formatValue: (v) => `${v.toFixed(2)}%` },
  spend: { label: 'Spend', color: '#270428', formatValue: (v) => `€${v.toFixed(2)}` },
};

interface Campaign {
  id: number;
  name: string;
  status: string;
}

interface Company {
  orgId: string;
  impressions: number;
  clicks: number;
  profileUrl: string;
}

interface JobTitle {
  titleId: string;
  name: string;
  impressions: number;
  clicks: number;
}

interface CampaignOverviewRow {
  id: number;
  name: string;
  status: string;
  impressions: number;
  clicks: number;
  spend: number;
}

interface FunnelThresholds {
  awarenessReachPct: number;
  awarenessFreq: number;
  considerationEngagePct: number;
  conversionLeadPct: number;
}

interface FunnelStageBase {
  campaignCount: number;
  activeCount: number;
  progress: number | null;
  status: 'not_started' | 'no_data' | 'in_progress' | 'complete';
}

interface FunnelFs {
  tag: string;
  label: string;
  stages: {
    awareness: FunnelStageBase & {
      impressions: number;
      reach: number;
      audience: number;
      penetration: number | null;
      frequency: number;
    };
    consideration: FunnelStageBase & {
      clicks: number;
      targetClicks: number | null;
      awarePool: number;
    };
    conversion: FunnelStageBase & {
      leads: number;
      targetLeads: number | null;
      engagedPool: number;
    };
  };
}

const stageStatusConfig: Record<string, { label: string; color: string }> = {
  not_started: { label: 'Not started', color: '#9ca3af' },
  no_data: { label: 'No reach data', color: '#c98a1f' },
  in_progress: { label: 'In progress', color: '#796ffb' },
  complete: { label: 'Complete', color: '#2f9c86' },
};

function formatDateLabel(dateStr: string) {
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  const monthName = date.toLocaleString('en-US', { month: 'short' });
  const dayNum = date.getDate();
  return `${monthName} ${dayNum}, ${year}`;
}

const rangeLabels: Record<string, string> = {
  day: 'Last 24 hours',
  week: 'Last 7 days',
  last30: 'Last 30 days',
  all: 'Since beginning',
};

const compareColors = ['#55d1bc', '#796ffb', '#cff748', '#270428', '#2f9c86', '#a89cff'];

const FS_TAGS = ['fs1', 'fs2', 'fs3', 'fs4', 'fs5'];

function fsTagLabel(tag: string) {
  return `Flagship Solution ${tag.slice(2)}`;
}

function isFsCampaign(name: string) {
  const lower = name.toLowerCase();
  return FS_TAGS.some((tag) => lower.includes(tag));
}

function campaignIdsForTag(campaigns: Campaign[], tag: string) {
  return campaigns.filter((c) => c.name.toLowerCase().includes(tag)).map((c) => c.id);
}

const statusColors: Record<string, string> = {
  ACTIVE: '#2f9c86',
  PAUSED: '#c98a1f',
  COMPLETED: '#6b7280',
  DRAFT: '#9ca3af',
  ARCHIVED: '#4b5563',
  CANCELED: '#b3413a',
};

function statusColor(status: string) {
  return statusColors[status] || '#6b7280';
}

type SortField = 'impressions' | 'clicks';
type SortDirection = 'asc' | 'desc';

export default function DashboardPage() {
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [range, setRange] = useState('week');
  const [selectedMetric, setSelectedMetric] = useState<MetricKey>('impressions');
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selectedFsTag, setSelectedFsTag] = useState('');
  const [selectedCampaign, setSelectedCampaign] = useState('');
  const [drillSearch, setDrillSearch] = useState('');
  const [drillDropdownOpen, setDrillDropdownOpen] = useState(false);
  const [compareMode, setCompareMode] = useState(false);
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [compareTrend, setCompareTrend] = useState<any[]>([]);
  const [compareSearch, setCompareSearch] = useState('');
  const [compareDropdownOpen, setCompareDropdownOpen] = useState(false);
  const [overviewMode, setOverviewMode] = useState(false);
  const [campaignOverview, setCampaignOverview] = useState<CampaignOverviewRow[]>([]);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [overviewLoading, setOverviewLoading] = useState(false);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [sortField, setSortField] = useState<SortField>('impressions');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [companyPage, setCompanyPage] = useState(0);
  const [companyNames, setCompanyNames] = useState<Record<string, string>>({});
  const [jobTitles, setJobTitles] = useState<JobTitle[]>([]);
  const [jobTitleSortField, setJobTitleSortField] = useState<SortField>('impressions');
  const [jobTitleSortDirection, setJobTitleSortDirection] = useState<SortDirection>('desc');
  const [jobTitlePage, setJobTitlePage] = useState(0);
  const [editingOrgId, setEditingOrgId] = useState<string | null>(null);
  const [nameInput, setNameInput] = useState('');
  const [funnel, setFunnel] = useState<FunnelFs[]>([]);
  const [funnelThresholds, setFunnelThresholds] = useState<Record<string, FunnelThresholds>>({});
  const [funnelLoading, setFunnelLoading] = useState(false);
  const [showFunnelInfo, setShowFunnelInfo] = useState(false);
  const [editingThresholdTag, setEditingThresholdTag] = useState<string | null>(null);
  const [thresholdInputs, setThresholdInputs] = useState({ reachPct: '', freq: '', engagePct: '', leadPct: '' });
  const [thresholdSaving, setThresholdSaving] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [weeklyReportLoading, setWeeklyReportLoading] = useState(false);
  const reportRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    const supabase = createClient();

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        router.push('/login');
      } else {
        setUserEmail(session.user.email ?? null);
        setLoading(false);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        router.push('/login');
      } else {
        setUserEmail(session.user.email ?? null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, [router]);

  useEffect(() => {
    fetch('/api/linkedin-campaigns')
      .then((res) => res.json())
      .then((data) => setCampaigns(data.campaigns || []))
      .catch(() => setCampaigns([]));
  }, []);

  useEffect(() => {
    fetch('/api/company-names')
      .then((res) => res.json())
      .then((data) => setCompanyNames(data.names || {}))
      .catch(() => setCompanyNames({}));
  }, []);

  useEffect(() => {
    if (!overviewMode) return;
    setFunnelLoading(true);
    fetch('/api/funnel-progress')
      .then((res) => res.json())
      .then((data) => {
        setFunnel(data.funnel || []);
        setFunnelThresholds(data.thresholds || {});
        setFunnelLoading(false);
      })
      .catch(() => {
        setFunnel([]);
        setFunnelLoading(false);
      });
  }, [overviewMode]);

  useEffect(() => {
    if (compareMode || overviewMode) return;
    setDataLoading(true);
    const campaignParam = selectedCampaign
      ? `&campaignId=${selectedCampaign}`
      : selectedFsTag
      ? `&campaignIds=${campaignIdsForTag(campaigns, selectedFsTag).join(',')}`
      : '';
    fetch(`/api/linkedin-analytics?range=${range}${campaignParam}`)
      .then((res) => res.json())
      .then((data) => {
        setSummary(data.summary);
        setTrend(data.trend || []);
        setDataLoading(false);
      })
      .catch(() => setDataLoading(false));
  }, [range, selectedCampaign, selectedFsTag, campaigns, compareMode, overviewMode]);

  useEffect(() => {
    if (!compareMode || compareIds.length < 2) return;
    setDataLoading(true);
    fetch(`/api/linkedin-compare?range=${range}&campaignIds=${compareIds.join(',')}`)
      .then((res) => res.json())
      .then((data) => {
        setCompareTrend(data.trend || []);
        setDataLoading(false);
      })
      .catch(() => setDataLoading(false));
  }, [range, compareIds, compareMode]);

  useEffect(() => {
    if (compareMode || overviewMode) {
      setCompanies([]);
      return;
    }
    const campaignParam = selectedCampaign
      ? `&campaignId=${selectedCampaign}`
      : selectedFsTag
      ? `&campaignIds=${campaignIdsForTag(campaigns, selectedFsTag).join(',')}`
      : '';
    fetch(`/api/linkedin-companies?range=${range}${campaignParam}`)
      .then((res) => res.json())
      .then((data) => {
        setCompanies(data.companies || []);
        setCompanyPage(0);
      })
      .catch(() => setCompanies([]));
  }, [selectedCampaign, selectedFsTag, campaigns, range, compareMode, overviewMode]);

  useEffect(() => {
    setCompanyPage(0);
  }, [sortField, sortDirection]);

  useEffect(() => {
    if (compareMode || overviewMode) {
      setJobTitles([]);
      return;
    }
    const campaignParam = selectedCampaign
      ? `&campaignId=${selectedCampaign}`
      : selectedFsTag
      ? `&campaignIds=${campaignIdsForTag(campaigns, selectedFsTag).join(',')}`
      : '';
    fetch(`/api/linkedin-job-titles?range=${range}${campaignParam}`)
      .then((res) => res.json())
      .then((data) => {
        setJobTitles(data.jobTitles || []);
        setJobTitlePage(0);
      })
      .catch(() => setJobTitles([]));
  }, [selectedCampaign, selectedFsTag, campaigns, range, compareMode, overviewMode]);

  useEffect(() => {
    setJobTitlePage(0);
  }, [jobTitleSortField, jobTitleSortDirection]);

  useEffect(() => {
    if (!overviewMode || campaigns.length === 0) return;
    setDataLoading(true);
    setOverviewLoading(true);
    fetch('/api/linkedin-campaign-overview')
      .then((res) => res.json())
      .then((data) => {
        const spendByCampaignId = data.spendByCampaignId || {};
        const rows: CampaignOverviewRow[] = campaigns
          .filter((c) => isFsCampaign(c.name))
          .map((c) => ({
            id: c.id,
            name: c.name,
            status: c.status,
            impressions: spendByCampaignId[c.id]?.impressions || 0,
            clicks: spendByCampaignId[c.id]?.clicks || 0,
            spend: spendByCampaignId[c.id]?.spend || 0,
          }))
          .sort((a, b) => b.spend - a.spend);
        setCampaignOverview(rows);
        setOverviewLoading(false);
        setDataLoading(false);
      })
      .catch(() => {
        setOverviewLoading(false);
        setDataLoading(false);
      });
  }, [overviewMode, campaigns]);

  const toggleCompareId = (id: string) => {
    setCompareIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const toggleGroupExpanded = (tag: string) => {
    setExpandedGroups((prev) => ({ ...prev, [tag]: !prev[tag] }));
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'desc' ? 'asc' : 'desc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const handleJobTitleSort = (field: SortField) => {
    if (jobTitleSortField === field) {
      setJobTitleSortDirection(jobTitleSortDirection === 'desc' ? 'asc' : 'desc');
    } else {
      setJobTitleSortField(field);
      setJobTitleSortDirection('desc');
    }
  };

  const saveCompanyName = async (orgId: string) => {
    if (!nameInput.trim()) return;
    const res = await fetch('/api/company-names', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orgId, companyName: nameInput.trim() }),
    });
    if (res.ok) {
      setCompanyNames((prev) => ({ ...prev, [orgId]: nameInput.trim() }));
      setEditingOrgId(null);
      setNameInput('');
    }
  };

  const startEditingThresholds = (tag: string) => {
    const t = funnelThresholds[tag];
    setThresholdInputs({
      reachPct: t ? String(t.awarenessReachPct) : '65',
      freq: t ? String(t.awarenessFreq) : '5',
      engagePct: t ? String(t.considerationEngagePct) : '5',
      leadPct: t ? String(t.conversionLeadPct) : '12',
    });
    setEditingThresholdTag(tag);
  };

  const saveThresholds = async (tag: string) => {
    setThresholdSaving(true);
    const res = await fetch('/api/fs-goals', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fsTag: tag,
        awarenessReachPct: thresholdInputs.reachPct ? Number(thresholdInputs.reachPct) : null,
        awarenessFreq: thresholdInputs.freq ? Number(thresholdInputs.freq) : null,
        considerationEngagePct: thresholdInputs.engagePct ? Number(thresholdInputs.engagePct) : null,
        conversionLeadPct: thresholdInputs.leadPct ? Number(thresholdInputs.leadPct) : null,
      }),
    });
    if (res.ok) {
      // Re-fetch so progress is recomputed server-side against the new thresholds.
      const data = await fetch('/api/funnel-progress').then((r) => r.json());
      setFunnel(data.funnel || []);
      setFunnelThresholds(data.thresholds || {});
      setEditingThresholdTag(null);
    }
    setThresholdSaving(false);
  };

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
  };

  const handleDownloadPdf = async () => {
    if (!reportRef.current) return;
    setPdfLoading(true);
    try {
      const [{ domToCanvas }, { default: jsPDF }] = await Promise.all([
        import('modern-screenshot'),
        import('jspdf'),
      ]);

      const canvas = await domToCanvas(reportRef.current, {
        scale: 2,
        backgroundColor: '#FAFAF7',
      });

      const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const imgWidth = pageWidth;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      const imgData = canvas.toDataURL('image/png');
      let heightLeft = imgHeight;
      let position = 0;

      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;

      while (heightLeft > 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }

      const scopeSlug = (compareMode ? 'fs-comparison' : selectedCampaignName)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');

      pdf.save(`ctrl-qs-report-${scopeSlug}-${range}.pdf`);
    } finally {
      setPdfLoading(false);
    }
  };

  const handleWeeklyReport = async () => {
    setWeeklyReportLoading(true);
    try {
      const res = await fetch('/api/weekly-report');
      if (!res.ok) throw new Error('Failed to generate weekly report');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `flagship-solutions-weekly-report-${new Date().toISOString().slice(0, 10)}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      alert('Could not generate the weekly report. Please try again.');
    } finally {
      setWeeklyReportLoading(false);
    }
  };

  if (loading) return <div className="p-10">Authenticating...</div>;

  const selectedCampaignName = selectedCampaign
    ? campaigns.find((c) => String(c.id) === selectedCampaign)?.name || 'Selected campaign'
    : selectedFsTag
    ? `${fsTagLabel(selectedFsTag)} combined`
    : 'All Flagship Solutions combined';

  const fsCampaigns = campaigns.filter((c) => isFsCampaign(c.name));

  const filteredCampaigns = fsCampaigns.filter((c) =>
    c.name.toLowerCase().includes(compareSearch.toLowerCase())
  );

  const selectedTagCampaigns = selectedFsTag
    ? campaigns.filter((c) => c.name.toLowerCase().includes(selectedFsTag))
    : [];

  const filteredDrillCampaigns = selectedTagCampaigns.filter((c) =>
    c.name.toLowerCase().includes(drillSearch.toLowerCase())
  );

  const overviewGroups = FS_TAGS.map((tag) => {
    const rows = campaignOverview.filter((c) => c.name.toLowerCase().includes(tag));
    return {
      tag,
      label: fsTagLabel(tag),
      rows,
      spend: rows.reduce((sum, r) => sum + r.spend, 0),
      impressions: rows.reduce((sum, r) => sum + r.impressions, 0),
      clicks: rows.reduce((sum, r) => sum + r.clicks, 0),
    };
  }).filter((g) => g.rows.length > 0);

  const sortedCompanies = [...companies].sort((a, b) => {
    const diff = a[sortField] - b[sortField];
    return sortDirection === 'desc' ? -diff : diff;
  });

  const COMPANIES_PER_PAGE = 20;
  const totalCompanyPages = Math.max(1, Math.ceil(sortedCompanies.length / COMPANIES_PER_PAGE));
  const pagedCompanies = sortedCompanies.slice(
    companyPage * COMPANIES_PER_PAGE,
    companyPage * COMPANIES_PER_PAGE + COMPANIES_PER_PAGE
  );

  const maxCompanyImpressions = Math.max(1, ...companies.map((c) => c.impressions));
  const maxCompanyClicks = Math.max(1, ...companies.map((c) => c.clicks));

  const sortArrow = (field: SortField) => {
    if (sortField !== field) return '';
    return sortDirection === 'desc' ? ' ↓' : ' ↑';
  };

  const sortedJobTitles = [...jobTitles].sort((a, b) => {
    const diff = a[jobTitleSortField] - b[jobTitleSortField];
    return jobTitleSortDirection === 'desc' ? -diff : diff;
  });

  const JOB_TITLES_PER_PAGE = 20;
  const totalJobTitlePages = Math.max(1, Math.ceil(sortedJobTitles.length / JOB_TITLES_PER_PAGE));
  const pagedJobTitles = sortedJobTitles.slice(
    jobTitlePage * JOB_TITLES_PER_PAGE,
    jobTitlePage * JOB_TITLES_PER_PAGE + JOB_TITLES_PER_PAGE
  );

  const maxJobTitleImpressions = Math.max(1, ...jobTitles.map((t) => t.impressions));
  const maxJobTitleClicks = Math.max(1, ...jobTitles.map((t) => t.clicks));

  const jobTitleSortArrow = (field: SortField) => {
    if (jobTitleSortField !== field) return '';
    return jobTitleSortDirection === 'desc' ? ' ↓' : ' ↑';
  };

  return (
    <div className="relative min-h-screen overflow-hidden" style={{ backgroundColor: '#FAFAF7' }}>
      <img
        src="/ctrl-qs-circles.png"
        alt=""
        aria-hidden="true"
        className="absolute pointer-events-none select-none"
        style={{ top: -40, right: -40, width: 220, opacity: 0.14 }}
      />
      <img
        src="/ctrl-qs-circles.png"
        alt=""
        aria-hidden="true"
        className="absolute pointer-events-none select-none"
        style={{ bottom: -30, left: -30, width: 170, opacity: 0.1, transform: 'rotate(180deg)' }}
      />
      <div className="relative p-10">
      <div className="flex justify-between items-center mb-8">
        <img src="/ctrl-qs-logo.png" alt="ctrl QS" className="h-9" />
        <button
          onClick={handleSignOut}
          className="text-white px-4 py-2 rounded font-medium"
          style={{ backgroundColor: '#270428' }}
        >
          Sign Out
        </button>
      </div>

      <div className="flex flex-wrap justify-between items-center gap-4 mb-4">
        <p className="text-gray-500">
          {overviewMode
            ? 'All Flagship Solution campaigns'
            : compareMode
            ? 'Comparing Flagship Solutions'
            : `${rangeLabels[range]} · ${selectedCampaignName}`}
        </p>
        <div className="flex gap-3 items-center">
          <button
            onClick={() => {
              setOverviewMode(!overviewMode);
              setCompareMode(false);
            }}
            className={`px-3 py-2 rounded border text-sm font-medium ${
              overviewMode ? 'text-white' : 'bg-white text-gray-700'
            }`}
            style={overviewMode ? { backgroundColor: '#270428' } : undefined}
          >
            {overviewMode ? '← Back to Dashboard' : 'Campaign Overview'}
          </button>
          <button
            onClick={() => {
              setCompareMode(!compareMode);
              setOverviewMode(false);
            }}
            className={`px-3 py-2 rounded border text-sm font-medium ${
              compareMode ? 'text-white' : 'bg-white text-gray-700'
            }`}
            style={compareMode ? { backgroundColor: '#270428' } : undefined}
          >
            {compareMode ? '← Back to Dashboard' : 'Compare Flagship Solutions'}
          </button>
          {!compareMode && !overviewMode && (
            <div className="relative">
              <span className="absolute -top-5 left-0 text-xs text-gray-400 font-medium uppercase tracking-wide">
                Flagship Solution
              </span>
              <select
                className="p-2 border rounded bg-white w-56"
                value={selectedFsTag}
                onChange={(e) => {
                  setSelectedFsTag(e.target.value);
                  setSelectedCampaign('');
                  setDrillSearch('');
                }}
              >
                <option value="">All Flagship Solutions</option>
                {FS_TAGS.map((tag) => (
                  <option key={tag} value={tag}>
                    {fsTagLabel(tag)}
                  </option>
                ))}
              </select>
            </div>
          )}
          {!compareMode && !overviewMode && selectedFsTag && (
            <div
              className="relative w-64"
              tabIndex={-1}
              onBlur={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                  setDrillDropdownOpen(false);
                }
              }}
            >
              <span className="absolute -top-5 left-0 text-xs text-gray-400 font-medium uppercase tracking-wide">
                Drill into a campaign (optional)
              </span>
              <input
                type="text"
                placeholder={
                  selectedCampaign
                    ? campaigns.find((c) => String(c.id) === selectedCampaign)?.name || 'Selected campaign'
                    : `All ${fsTagLabel(selectedFsTag)} campaigns`
                }
                className="w-full p-2 border rounded bg-white"
                value={drillSearch}
                onChange={(e) => setDrillSearch(e.target.value)}
                onFocus={() => setDrillDropdownOpen(true)}
              />
              {drillDropdownOpen && (
                <div className="absolute z-10 mt-1 w-full bg-white border rounded shadow-lg max-h-[190px] overflow-y-auto">
                  <label className="w-full flex items-center gap-2 p-2 text-sm hover:bg-gray-100 font-medium cursor-pointer">
                    <input
                      type="radio"
                      name="drill-campaign"
                      checked={selectedCampaign === ''}
                      onChange={() => {
                        setSelectedCampaign('');
                        setDrillSearch('');
                        setDrillDropdownOpen(false);
                      }}
                    />
                    All {fsTagLabel(selectedFsTag)} campaigns
                  </label>
                  {filteredDrillCampaigns.length === 0 ? (
                    <p className="p-2 text-sm text-gray-400">No matching campaigns</p>
                  ) : (
                    filteredDrillCampaigns.map((c) => (
                      <label
                        key={c.id}
                        className="w-full flex items-center gap-2 p-2 text-sm hover:bg-gray-100 cursor-pointer"
                      >
                        <input
                          type="radio"
                          name="drill-campaign"
                          checked={selectedCampaign === String(c.id)}
                          onChange={() => {
                            setSelectedCampaign(String(c.id));
                            setDrillSearch('');
                            setDrillDropdownOpen(false);
                          }}
                        />
                        <span>
                          {c.name}{' '}
                          <span className="text-xs text-gray-400">({c.status})</span>
                        </span>
                      </label>
                    ))
                  )}
                </div>
              )}
            </div>
          )}
          {!overviewMode && (
            <select
              className="p-2 border rounded bg-white"
              value={range}
              onChange={(e) => setRange(e.target.value)}
            >
              <option value="day">Last 24 Hours</option>
              <option value="week">Last 7 Days</option>
              <option value="last30">Last 30 Days</option>
              <option value="all">Since Beginning</option>
            </select>
          )}
          <button
            onClick={handleDownloadPdf}
            disabled={
              pdfLoading ||
              dataLoading ||
              (overviewMode ? campaignOverview.length === 0 : !summary && compareTrend.length === 0)
            }
            className="px-3 py-2 rounded border text-sm font-medium bg-white text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {pdfLoading ? 'Preparing PDF…' : 'Download PDF'}
          </button>
          <button
            onClick={handleWeeklyReport}
            disabled={weeklyReportLoading}
            className="px-3 py-2 rounded border text-sm font-medium bg-white text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {weeklyReportLoading ? 'Preparing…' : 'Weekly Report'}
          </button>
        </div>
      </div>

      {compareMode && (
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 mb-6">
          <p className="text-sm text-gray-500 mb-2">Select 2 or more Flagship Solutions to compare:</p>

          {compareIds.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-3">
              {compareIds.map((id) => {
                const c = campaigns.find((camp) => String(camp.id) === id);
                return (
                  <span
                    key={id}
                    className="flex items-center gap-1 bg-gray-800 text-white text-sm px-3 py-1 rounded-full"
                  >
                    {c?.name || id}
                    <button
                      onClick={() => toggleCompareId(id)}
                      className="ml-1 text-gray-300 hover:text-white"
                    >
                      ×
                    </button>
                  </span>
                );
              })}
            </div>
          )}

          <div
            className="relative"
            tabIndex={-1}
            onBlur={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                setCompareDropdownOpen(false);
              }
            }}
          >
            <input
              type="text"
              placeholder="Type to search Flagship Solutions..."
              className="w-full p-2 border rounded"
              value={compareSearch}
              onChange={(e) => setCompareSearch(e.target.value)}
              onFocus={() => setCompareDropdownOpen(true)}
            />
            {compareDropdownOpen && (
              <div className="absolute z-10 mt-1 w-full bg-white border rounded shadow-lg max-h-[190px] overflow-y-auto">
                {filteredCampaigns.length === 0 ? (
                  <p className="p-2 text-sm text-gray-400">No matching Flagship Solutions</p>
                ) : (
                  filteredCampaigns.map((c) => (
                    <label
                      key={c.id}
                      className="w-full flex items-center gap-2 p-2 text-sm hover:bg-gray-100 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={compareIds.includes(String(c.id))}
                        onChange={() => toggleCompareId(String(c.id))}
                      />
                      {c.name}
                    </label>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      )}

      <div ref={reportRef}>
      {dataLoading ? (
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 mb-8">
          Loading live campaign data...
        </div>
      ) : overviewMode ? (
        campaignOverview.length === 0 ? (
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
            No Flagship Solution campaigns found.
          </div>
        ) : (
          <>
          <div className="flex items-center gap-2 mb-3">
            <h3 className="font-bold">Funnel Progress</h3>
            <button
              onClick={() => setShowFunnelInfo(true)}
              aria-label="How is funnel progress calculated?"
              className="w-5 h-5 rounded-full border border-gray-300 text-gray-400 text-xs hover:text-gray-700 hover:border-gray-500 leading-none font-medium"
            >
              i
            </button>
          </div>
          {showFunnelInfo && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center p-6"
              style={{ backgroundColor: 'rgba(39, 4, 40, 0.45)' }}
              onClick={() => setShowFunnelInfo(false)}
            >
              <div
                className="bg-white rounded-xl shadow-lg max-w-lg w-full p-6 max-h-[80vh] overflow-y-auto"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex justify-between items-start mb-3">
                  <h3 className="font-bold" style={{ color: '#270428' }}>
                    How Funnel Progress is measured
                  </h3>
                  <button
                    onClick={() => setShowFunnelInfo(false)}
                    className="text-gray-400 hover:text-gray-700 text-lg leading-none"
                  >
                    ×
                  </button>
                </div>
                <div className="text-sm text-gray-600 flex flex-col gap-3">
                  <p>
                    Each campaign is classified by its LinkedIn objective: Brand Awareness campaigns make up
                    the <strong>Awareness</strong> stage, Website Visit / Engagement campaigns are{' '}
                    <strong>Consideration</strong>, and Lead Generation / Website Conversion campaigns are{' '}
                    <strong>Conversion</strong>.
                  </p>
                  <p>
                    <strong>Awareness</strong> isn't judged on clicks. In B2B, roughly 95% of your audience
                    isn't in-market at any given moment (LinkedIn's "95-5 rule"), so this stage is about
                    being remembered later. It's complete when enough of the target audience has seen the
                    ads often enough: by default, 65% of the audience reached at an average frequency of 5
                    (advertising research puts effective recall at 5–9 exposures). Progress is the weaker of
                    the two requirements — you're only as done as whichever is furthest behind.
                  </p>
                  <p>
                    <strong>Consideration</strong> is complete when clicks reach 5% (default) of the people
                    the awareness stage actually reached. Each stage's target chains off the real output of
                    the stage above it, not a fixed number.
                  </p>
                  <p>
                    <strong>Conversion</strong> is complete when leads (lead-gen form fills plus website
                    conversions) reach 12% (default) of consideration clicks, in line with LinkedIn
                    lead-form completion benchmarks.
                  </p>
                  <p className="text-xs text-gray-400">
                    Audience sizes and reach are LinkedIn approximations, and frequency is an average across
                    reached members rather than a per-person guarantee. All thresholds are editable per
                    Flagship Solution via "Edit thresholds" — treat the defaults as research-grounded
                    starting points to calibrate with real results.
                  </p>
                </div>
              </div>
            </div>
          )}
          {funnelLoading ? (
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 mb-6">
              Calculating funnel progress from live reach data...
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4 mb-6">
              {funnel.map((fs) => {
                const isEditing = editingThresholdTag === fs.tag;
                const t = funnelThresholds[fs.tag];
                const aw = fs.stages.awareness;
                const co = fs.stages.consideration;
                const cv = fs.stages.conversion;

                const stageBlock = (name: string, stage: FunnelStageBase, detail: string) => {
                  const cfg = stageStatusConfig[stage.status];
                  const pct = stage.progress != null ? Math.round(stage.progress * 100) : null;
                  return (
                    <div className="mb-3" key={name}>
                      <div className="flex justify-between items-center text-xs mb-1">
                        <span className="font-medium text-gray-700">{name}</span>
                        <span className="flex items-center gap-2">
                          <span
                            className="text-white px-2 py-0.5 rounded-full font-medium"
                            style={{ backgroundColor: cfg.color, fontSize: 10 }}
                          >
                            {cfg.label}
                          </span>
                          <span className="text-gray-500 w-9 text-right">{pct != null ? `${pct}%` : '—'}</span>
                        </span>
                      </div>
                      <div className="w-full bg-gray-100 rounded-full h-2 mb-1">
                        <div
                          className="h-2 rounded-full"
                          style={{ width: `${pct ?? 0}%`, backgroundColor: cfg.color }}
                        />
                      </div>
                      <p className="text-xs text-gray-400">{detail}</p>
                    </div>
                  );
                };

                const awDetail =
                  aw.campaignCount === 0
                    ? 'No awareness campaigns.'
                    : aw.penetration == null
                    ? 'Reach data unavailable for this period.'
                    : `Reach ${Math.round(aw.penetration * 100)}% of ${t?.awarenessReachPct ?? 65}% target · Frequency ${aw.frequency.toFixed(1)} of ${t?.awarenessFreq ?? 5}`;

                const coDetail =
                  co.campaignCount === 0
                    ? 'No campaigns yet — typically retargeting the aware audience.'
                    : co.targetClicks == null
                    ? 'Awaiting awareness reach data to set the target.'
                    : `${co.clicks.toLocaleString()} of ${co.targetClicks.toLocaleString()} target clicks (${t?.considerationEngagePct ?? 5}% of ${co.awarePool.toLocaleString()} aware members)`;

                const cvDetail =
                  cv.campaignCount === 0
                    ? 'No campaigns yet.'
                    : cv.targetLeads == null
                    ? 'Awaiting consideration clicks to set the target.'
                    : `${cv.leads.toLocaleString()} of ${cv.targetLeads.toLocaleString()} target leads (${t?.conversionLeadPct ?? 12}% of ${cv.engagedPool.toLocaleString()} engaged members)`;

                return (
                  <div key={fs.tag} className="bg-white p-4 rounded-xl shadow-sm border border-gray-100">
                    <div className="flex justify-between items-center mb-3">
                      <span className="font-bold text-sm">{fs.label}</span>
                      <button
                        onClick={() =>
                          isEditing ? setEditingThresholdTag(null) : startEditingThresholds(fs.tag)
                        }
                        className="text-xs text-gray-400 hover:text-gray-700 underline"
                      >
                        {isEditing ? 'Cancel' : 'Edit thresholds'}
                      </button>
                    </div>

                    {isEditing ? (
                      <div className="flex flex-col gap-2">
                        <label className="text-xs text-gray-400">
                          Awareness: % of audience to reach
                          <input
                            type="number"
                            className="w-full p-1.5 border rounded text-sm mt-0.5"
                            value={thresholdInputs.reachPct}
                            onChange={(e) => setThresholdInputs((p) => ({ ...p, reachPct: e.target.value }))}
                          />
                        </label>
                        <label className="text-xs text-gray-400">
                          Awareness: target average frequency
                          <input
                            type="number"
                            className="w-full p-1.5 border rounded text-sm mt-0.5"
                            value={thresholdInputs.freq}
                            onChange={(e) => setThresholdInputs((p) => ({ ...p, freq: e.target.value }))}
                          />
                        </label>
                        <label className="text-xs text-gray-400">
                          Consideration: % of aware pool clicking
                          <input
                            type="number"
                            className="w-full p-1.5 border rounded text-sm mt-0.5"
                            value={thresholdInputs.engagePct}
                            onChange={(e) => setThresholdInputs((p) => ({ ...p, engagePct: e.target.value }))}
                          />
                        </label>
                        <label className="text-xs text-gray-400">
                          Conversion: % of clicks becoming leads
                          <input
                            type="number"
                            className="w-full p-1.5 border rounded text-sm mt-0.5"
                            value={thresholdInputs.leadPct}
                            onChange={(e) => setThresholdInputs((p) => ({ ...p, leadPct: e.target.value }))}
                          />
                        </label>
                        <button
                          onClick={() => saveThresholds(fs.tag)}
                          disabled={thresholdSaving}
                          className="text-xs text-white px-2 py-1.5 rounded font-medium disabled:opacity-50"
                          style={{ backgroundColor: '#270428' }}
                        >
                          {thresholdSaving ? 'Saving…' : 'Save thresholds'}
                        </button>
                      </div>
                    ) : (
                      <div>
                        {stageBlock('Awareness', aw, awDetail)}
                        {stageBlock('Consideration', co, coDetail)}
                        {stageBlock('Conversion', cv, cvDetail)}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
            <h3 className="font-bold mb-1">Campaign Overview</h3>
            <p className="text-sm text-gray-400 mb-4">
              Investment to date by Flagship Solution, across every campaign regardless of status.
            </p>
            <table className="min-w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="p-3 text-left text-sm text-gray-500">Campaign</th>
                  <th className="p-3 text-left text-sm text-gray-500">Status</th>
                  <th className="p-3 text-left text-sm text-gray-500">Investment to Date</th>
                  <th className="p-3 text-left text-sm text-gray-500">Impressions</th>
                  <th className="p-3 text-left text-sm text-gray-500">Clicks</th>
                </tr>
              </thead>
              {overviewGroups.map((group) => {
                const isExpanded = !!expandedGroups[group.tag];
                return (
                  <tbody key={group.tag}>
                    <tr
                      className="border-t bg-gray-50 font-bold cursor-pointer select-none hover:bg-gray-100"
                      onClick={() => toggleGroupExpanded(group.tag)}
                    >
                      <td className="p-3">
                        <span className="inline-flex items-center gap-2">
                          <span
                            className="inline-block text-gray-400 transition-transform"
                            style={{ transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}
                          >
                            ▶
                          </span>
                          {group.label}
                        </span>
                      </td>
                      <td className="p-3 text-xs font-normal text-gray-400">{group.rows.length} campaigns</td>
                      <td className="p-3">€{group.spend.toFixed(2)}</td>
                      <td className="p-3">{group.impressions.toLocaleString()}</td>
                      <td className="p-3">{group.clicks.toLocaleString()}</td>
                    </tr>
                    {isExpanded &&
                      group.rows.map((c) => (
                        <tr key={c.id} className="border-t text-sm text-gray-600">
                          <td className="p-3 pl-8">{c.name}</td>
                          <td className="p-3">
                            <span
                              className="text-xs font-medium px-2 py-1 rounded-full text-white"
                              style={{ backgroundColor: statusColor(c.status) }}
                            >
                              {c.status}
                            </span>
                          </td>
                          <td className="p-3">€{c.spend.toFixed(2)}</td>
                          <td className="p-3">{c.impressions.toLocaleString()}</td>
                          <td className="p-3">{c.clicks.toLocaleString()}</td>
                        </tr>
                      ))}
                  </tbody>
                );
              })}
              <tbody>
                <tr className="border-t font-bold bg-gray-50">
                  <td className="p-3" colSpan={2}>Total</td>
                  <td className="p-3">
                    €{campaignOverview.reduce((sum, c) => sum + c.spend, 0).toFixed(2)}
                  </td>
                  <td className="p-3">
                    {campaignOverview.reduce((sum, c) => sum + c.impressions, 0).toLocaleString()}
                  </td>
                  <td className="p-3">
                    {campaignOverview.reduce((sum, c) => sum + c.clicks, 0).toLocaleString()}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          </>
        )
      ) : compareMode ? (
        compareIds.length < 2 ? (
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
            Select at least 2 campaigns above to see a comparison.
          </div>
        ) : (
          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 h-80">
            <h3 className="font-bold mb-4">Impressions Comparison</h3>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={compareTrend}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tickFormatter={formatDateLabel} />
                <YAxis />
                <Tooltip labelFormatter={(label) => formatDateLabel(String(label))} />
                <Legend />
                {compareIds.map((id, i) => (
                  <Line
                    key={id}
                    type="monotone"
                    dataKey={id}
                    name={campaigns.find((c) => String(c.id) === id)?.name || id}
                    stroke={compareColors[i % compareColors.length]}
                    strokeWidth={2}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )
      ) : summary ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="h-1" style={{ backgroundColor: '#55d1bc' }} />
              <div className="p-6">
                <p className="text-gray-500 text-sm font-medium uppercase tracking-wider">Impressions</p>
                <p className="text-3xl font-bold mt-2">{summary.impressions.toLocaleString()}</p>
              </div>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="h-1" style={{ backgroundColor: '#796ffb' }} />
              <div className="p-6">
                <p className="text-gray-500 text-sm font-medium uppercase tracking-wider">Clicks</p>
                <p className="text-3xl font-bold mt-2">{summary.clicks.toLocaleString()}</p>
              </div>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="h-1" style={{ backgroundColor: '#cff748' }} />
              <div className="p-6">
                <p className="text-gray-500 text-sm font-medium uppercase tracking-wider">CTR</p>
                <p className="text-3xl font-bold mt-2">{summary.ctr.toFixed(2)}%</p>
              </div>
            </div>
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="h-1" style={{ backgroundColor: '#270428' }} />
              <div className="p-6">
                <p className="text-gray-500 text-sm font-medium uppercase tracking-wider">Cost per Click</p>
                <p className="text-3xl font-bold mt-2">€{summary.cpc.toFixed(2)}</p>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 h-80">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-bold">{metricConfig[selectedMetric].label} Trend</h3>
              <select
                className="p-2 border rounded bg-white text-sm"
                value={selectedMetric}
                onChange={(e) => setSelectedMetric(e.target.value as MetricKey)}
              >
                <option value="impressions">Impressions</option>
                <option value="clicks">Clicks</option>
                <option value="ctr">CTR</option>
                <option value="spend">Spend</option>
              </select>
            </div>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trend}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tickFormatter={formatDateLabel} />
                <YAxis tickFormatter={(v) => metricConfig[selectedMetric].formatValue(v)} />
                <Tooltip
                  labelFormatter={(label) => formatDateLabel(String(label))}
                  formatter={(value) => [metricConfig[selectedMetric].formatValue(Number(value)), metricConfig[selectedMetric].label]}
                />
                <Line
                  type="monotone"
                  dataKey={selectedMetric}
                  stroke={metricConfig[selectedMetric].color}
                  strokeWidth={2}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-8">
          {companies.length > 0 && (
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
              <h3 className="font-bold mb-1">
                {selectedCampaign
                  ? `Companies Viewing ${selectedCampaignName}`
                  : selectedFsTag
                  ? `Companies Viewing ${fsTagLabel(selectedFsTag)}`
                  : 'Companies Viewing Content Across All Flagship Solutions'}
              </h3>
              <p className="text-sm text-gray-400 mb-4">
                Tag companies with real names as you identify them — it'll remember them everywhere.
              </p>
              <table className="min-w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="p-3 text-left text-sm text-gray-500">Company</th>
                    <th
                      className="p-3 text-left text-sm text-gray-500 cursor-pointer select-none hover:text-gray-700"
                      onClick={() => handleSort('impressions')}
                    >
                      Impressions{sortArrow('impressions')}
                    </th>
                    <th
                      className="p-3 text-left text-sm text-gray-500 cursor-pointer select-none hover:text-gray-700"
                      onClick={() => handleSort('clicks')}
                    >
                      Clicks{sortArrow('clicks')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {pagedCompanies.map((c) => (
                    <tr key={c.orgId} className="border-t">
                      <td className="p-3">
                        {companyNames[c.orgId] ? (
                          <a
                            href={c.profileUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:underline font-medium"
                          >
                            {companyNames[c.orgId]}
                          </a>
                        ) : editingOrgId === c.orgId ? (
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              autoFocus
                              placeholder="Company name"
                              className="border rounded p-1 text-sm"
                              value={nameInput}
                              onChange={(e) => setNameInput(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') saveCompanyName(c.orgId);
                              }}
                            />
                            <button
                              onClick={() => saveCompanyName(c.orgId)}
                              className="text-xs bg-gray-800 text-white px-2 py-1 rounded"
                            >
                              Save
                            </button>
                            <button
                              onClick={() => setEditingOrgId(null)}
                              className="text-xs text-gray-400"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <a
                              href={c.profileUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:underline"
                            >
                              View company (ID: {c.orgId})
                            </a>
                            <button
                              onClick={() => {
                                setEditingOrgId(c.orgId);
                                setNameInput('');
                              }}
                              className="text-xs text-gray-400 hover:text-gray-700 underline"
                            >
                              + Add name
                            </button>
                          </div>
                        )}
                      </td>
                      <td className="p-3 relative">
                        <div
                          className="absolute inset-y-1 left-0 rounded"
                          style={{
                            width: `${(c.impressions / maxCompanyImpressions) * 100}%`,
                            backgroundColor: '#55d1bc',
                            opacity: 0.4,
                          }}
                        />
                        <span className="relative">{c.impressions.toLocaleString()}</span>
                      </td>
                      <td className="p-3 relative">
                        <div
                          className="absolute inset-y-1 left-0 rounded"
                          style={{
                            width: `${(c.clicks / maxCompanyClicks) * 100}%`,
                            backgroundColor: '#796ffb',
                            opacity: 0.4,
                          }}
                        />
                        <span className="relative">{c.clicks.toLocaleString()}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {totalCompanyPages > 1 && (
                <div className="flex justify-between items-center mt-4 text-sm text-gray-500">
                  <button
                    onClick={() => setCompanyPage((p) => Math.max(0, p - 1))}
                    disabled={companyPage === 0}
                    className="px-3 py-1 rounded border bg-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50"
                  >
                    ← Previous
                  </button>
                  <span>
                    Page {companyPage + 1} of {totalCompanyPages}
                  </span>
                  <button
                    onClick={() => setCompanyPage((p) => Math.min(totalCompanyPages - 1, p + 1))}
                    disabled={companyPage >= totalCompanyPages - 1}
                    className="px-3 py-1 rounded border bg-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50"
                  >
                    Next →
                  </button>
                </div>
              )}
            </div>
          )}

          {jobTitles.length > 0 && (
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
              <h3 className="font-bold mb-1">
                {selectedCampaign
                  ? `Job Titles Viewing ${selectedCampaignName}`
                  : selectedFsTag
                  ? `Job Titles Viewing ${fsTagLabel(selectedFsTag)}`
                  : 'Job Titles Viewing Across All Flagship Solutions'}
              </h3>
              <p className="text-sm text-gray-400 mb-4">
                Pair this with the companies list to narrow down outreach targets.
              </p>
              <table className="min-w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="p-3 text-left text-sm text-gray-500">Job Title</th>
                    <th
                      className="p-3 text-left text-sm text-gray-500 cursor-pointer select-none hover:text-gray-700"
                      onClick={() => handleJobTitleSort('impressions')}
                    >
                      Impressions{jobTitleSortArrow('impressions')}
                    </th>
                    <th
                      className="p-3 text-left text-sm text-gray-500 cursor-pointer select-none hover:text-gray-700"
                      onClick={() => handleJobTitleSort('clicks')}
                    >
                      Clicks{jobTitleSortArrow('clicks')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {pagedJobTitles.map((t) => (
                    <tr key={t.titleId} className="border-t">
                      <td className="p-3">{t.name}</td>
                      <td className="p-3 relative">
                        <div
                          className="absolute inset-y-1 left-0 rounded"
                          style={{
                            width: `${(t.impressions / maxJobTitleImpressions) * 100}%`,
                            backgroundColor: '#55d1bc',
                            opacity: 0.4,
                          }}
                        />
                        <span className="relative">{t.impressions.toLocaleString()}</span>
                      </td>
                      <td className="p-3 relative">
                        <div
                          className="absolute inset-y-1 left-0 rounded"
                          style={{
                            width: `${(t.clicks / maxJobTitleClicks) * 100}%`,
                            backgroundColor: '#796ffb',
                            opacity: 0.4,
                          }}
                        />
                        <span className="relative">{t.clicks.toLocaleString()}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {totalJobTitlePages > 1 && (
                <div className="flex justify-between items-center mt-4 text-sm text-gray-500">
                  <button
                    onClick={() => setJobTitlePage((p) => Math.max(0, p - 1))}
                    disabled={jobTitlePage === 0}
                    className="px-3 py-1 rounded border bg-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50"
                  >
                    ← Previous
                  </button>
                  <span>
                    Page {jobTitlePage + 1} of {totalJobTitlePages}
                  </span>
                  <button
                    onClick={() => setJobTitlePage((p) => Math.min(totalJobTitlePages - 1, p + 1))}
                    disabled={jobTitlePage >= totalJobTitlePages - 1}
                    className="px-3 py-1 rounded border bg-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-gray-50"
                  >
                    Next →
                  </button>
                </div>
              )}
            </div>
          )}
          </div>
        </>
      ) : (
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          Couldn't load campaign data. Please try again shortly.
        </div>
      )}
      </div>
      </div>
    </div>
  );
}
