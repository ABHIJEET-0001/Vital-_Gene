import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Dna, ShieldCheck, FileText, ChevronDown, Download, Copy, 
  ArrowRight, Search, Activity, Stethoscope, BrainCircuit, 
  Globe, CheckCircle2, Trash2, Plus, Zap, AlertTriangle, 
  FileCode, ExternalLink, Loader2, X, ChevronRight, BarChart3, 
  Pill, Microscope, HeartPulse, LogOut, ChevronUp, Info, 
  Settings2, Database, ShieldAlert, Sparkles, Github, LayoutDashboard,
  UploadCloud, Link as LinkIcon, User, Layers, FileJson, 
  GraduationCap, ClipboardCheck, History, TrendingUp, Filter, Calendar,
  Terminal, Server, Lock, BookOpen, Mail, Scale
} from 'lucide-react';
import { 
  analyzeVCF, getStats, getPatients, getPatientHistory, 
  clearAllHistory, checkBackendHealth, isOffline, DashboardStats, Patient 
} from './services/api';
import { PGxReport, SupportedDrug, RiskLabel, Phenotype } from './types';
import { SUPPORTED_DRUGS, SAMPLES, MEDICATION_METADATA } from './constants';
import RiskBadge from './components/RiskBadge';

const AnalysisSteps = [
  "Securing server pipeline...",
  "Parsing VCF stream in PostgreSQL...",
  "Cross-referencing variants with PharmGKB...",
  "Applying CPIC clinical algorithms...",
  "Synthesizing clinical rationale (Gemini)...",
  "Finalizing diagnostic records..."
];

interface Toast {
  id: string;
  message: string;
  type: 'error' | 'success' | 'info';
}

export default function App() {
  const [view, setView] = useState<'landing' | 'analyzer' | 'patients' | 'dashboard' | 'documentation' | 'privacy' | 'terms'>('landing');
  const [vcfFile, setVcfFile] = useState<File | null>(null);
  const [vcfContent, setVcfContent] = useState<string>('');
  const [selectedDrugs, setSelectedDrugs] = useState<string[]>([]);
  const [drugSearchTerm, setDrugSearchTerm] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [reports, setReports] = useState<PGxReport[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [activeReportIdx, setActiveReportIdx] = useState(0);
  const [showJsonModal, setShowJsonModal] = useState<PGxReport | null>(null);
  const [isVcfValid, setIsVcfValid] = useState<boolean | null>(null);
  
  // Backend & DB states
  const [isBackendOnline, setIsBackendOnline] = useState(false);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [patientSearch, setPatientSearch] = useState('');
  
  // Patient details state
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);
  const [patientReports, setPatientReports] = useState<PGxReport[]>([]);
  const [activePatientReportIdx, setActivePatientReportIdx] = useState(0);
  const [loadingPatientHistory, setLoadingPatientHistory] = useState(false);

  const [expandedSections, setExpandedSections] = useState({
    profile: true,
    recommendation: true,
    rationale: true
  });

  const dropdownRef = useRef<HTMLDivElement>(null);

  // Monitor backend health
  const checkHealth = useCallback(async () => {
    const online = await checkBackendHealth();
    setIsBackendOnline(online);
  }, []);

  useEffect(() => {
    checkHealth();
    const interval = setInterval(checkHealth, 8000);
    return () => clearInterval(interval);
  }, [checkHealth]);

  // Load stats and patients when views change
  useEffect(() => {
    if (view === 'dashboard') {
      loadDashboardStats();
    } else if (view === 'patients') {
      loadPatientsList();
    }
  }, [view, reports]);

  const loadDashboardStats = async () => {
    try {
      const data = await getStats();
      setStats(data);
    } catch (e) {
      addToast("Failed to fetch dashboard stats", "error");
    }
  };

  const loadPatientsList = async () => {
    try {
      const data = await getPatients();
      setPatients(data);
    } catch (e) {
      addToast("Failed to retrieve patients catalog", "error");
    }
  };

  const loadPatientDetail = async (pId: string) => {
    setLoadingPatientHistory(true);
    setSelectedPatientId(pId);
    try {
      const history = await getPatientHistory(pId);
      setPatientReports(history);
      setActivePatientReportIdx(0);
    } catch (e) {
      addToast("Failed to load patient diagnostics logs", "error");
    } finally {
      setLoadingPatientHistory(false);
    }
  };

  useEffect(() => {
    let interval: any;
    if (loading) {
      interval = setInterval(() => {
        setLoadingStep(prev => (prev < AnalysisSteps.length - 1 ? prev + 1 : prev));
      }, 1500);
    } else {
      setLoadingStep(0);
    }
    return () => clearInterval(interval);
  }, [loading]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const addToast = (message: string, type: 'error' | 'success' | 'info' = 'error') => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { 
      addToast("File size threshold exceeded (5MB max).", "error"); 
      return; 
    }
    if (!file.name.toLowerCase().endsWith('.vcf')) { 
      addToast("Unsupported file format. Please upload a standard VCF.", "error"); 
      return; 
    }

    setVcfFile(file);
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setVcfContent(content);
      const valid = content.toLowerCase().includes('fileformat=vcf') && content.includes('#CHROM');
      setIsVcfValid(valid);
      if (!valid) {
        addToast("The uploaded VCF file appears to have a malformed header.", "info");
      } else {
        addToast("VCF file loaded successfully", "success");
      }
    };
    reader.readAsText(file);
    setError(null);
  };

  const loadSample = (name: string) => {
    const sample = SAMPLES[name];
    setVcfContent(sample.vcf);
    setSelectedDrugs(sample.drugs.split(',').map(d => d.trim()));
    setVcfFile(new File([sample.vcf], `${name.toLowerCase().replace(/ /g, '_')}.vcf`, { type: 'text/plain' }));
    setIsVcfValid(true);
    setError(null);
    addToast(`Sample profile "${name}" loaded.`, "success");
  };

  const addDrug = (drug: string) => {
    if (!selectedDrugs.includes(drug)) {
      setSelectedDrugs([...selectedDrugs, drug]);
    }
    setDrugSearchTerm('');
    setIsDropdownOpen(false);
  };

  const removeDrug = (drug: string) => {
    setSelectedDrugs(selectedDrugs.filter(d => d !== drug));
  };

  const downloadJson = useCallback((report: PGxReport) => {
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `PGx_Report_${report.drug}_${report.patient_id}.json`;
    a.click();
    URL.revokeObjectURL(url);
    addToast("Diagnostic report exported successfully.", "success");
  }, []);

  const handleResetHistory = async () => {
    if (confirm("Are you sure you want to permanently clear the database history? This cannot be undone.")) {
      try {
        await clearAllHistory();
        addToast("Database history cleared successfully.", "success");
        if (view === 'dashboard') loadDashboardStats();
        if (view === 'patients') {
          setPatients([]);
          setSelectedPatientId(null);
        }
      } catch (e) {
        addToast("Failed to reset history.", "error");
      }
    }
  };

  const handleSubmit = async () => {
    if (!vcfContent) { 
      addToast("Please upload a genomic VCF file to proceed.", "error"); 
      return; 
    }
    if (selectedDrugs.length === 0) { 
      addToast("Define at least one target medication for risk analysis.", "error"); 
      return; 
    }

    setLoading(true);
    setReports([]);
    setError(null);
    try {
      const results = await analyzeVCF(vcfContent, selectedDrugs, vcfFile?.name || 'custom_upload.vcf');
      setReports(results);
      setActiveReportIdx(0);
      addToast("Pharmacogenomic analysis successfully saved to database.", "success");
    } catch (err: any) {
      setError(err.message || "A critical error occurred during VCF sequencing.");
      addToast("Analysis failed: " + (err.message || ""), "error");
    } finally {
      setLoading(false);
    }
  };

  const filteredSuggestions = SUPPORTED_DRUGS.filter(d => 
    d.toLowerCase().includes(drugSearchTerm.toLowerCase()) && !selectedDrugs.includes(d)
  );

  const filteredPatients = useMemo(() => {
    return patients.filter(p => p.id.toLowerCase().includes(patientSearch.toLowerCase()));
  }, [patients, patientSearch]);

  const renderNavbar = () => (
    <nav className="bg-white/80 backdrop-blur-md px-8 h-20 flex items-center justify-between sticky top-0 z-50 shadow-sm border-b border-slate-100">
      <div className="flex items-center gap-3 cursor-pointer" onClick={() => setView('landing')}>
        <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-md shadow-blue-500/20">
          <Dna size={22} className="animate-pulse" />
        </div>
        <div className="flex flex-col">
          <span className="text-xl font-extrabold tracking-tight text-slate-900">VITALGENE <span className="text-blue-600">AI</span></span>
          <div className="flex items-center gap-1.5">
            <span className={`w-1.5 h-1.5 rounded-full ${isBackendOnline ? 'bg-emerald-500 animate-ping' : 'bg-amber-400'}`}></span>
            <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">
              {isBackendOnline ? 'PostgreSQL Active' : 'Offline Sandbox'}
            </span>
          </div>
        </div>
      </div>
      
      <div className="hidden md:flex items-center gap-8">
        <button onClick={() => { setView('analyzer'); setSelectedPatientId(null); }} className={`text-[12px] font-bold uppercase tracking-widest transition-colors ${view === 'analyzer' ? 'text-blue-600' : 'text-slate-500 hover:text-blue-600'}`}>Genomic Analyzer</button>
        <button onClick={() => setView('patients')} className={`text-[12px] font-bold uppercase tracking-widest transition-colors ${view === 'patients' ? 'text-blue-600' : 'text-slate-500 hover:text-blue-600'}`}>Patients Records</button>
        <button onClick={() => setView('dashboard')} className={`text-[12px] font-bold uppercase tracking-widest transition-colors ${view === 'dashboard' ? 'text-blue-600' : 'text-slate-500 hover:text-blue-600'}`}>Clinical Dashboard</button>
        <button onClick={() => setView('documentation')} className={`text-[12px] font-bold uppercase tracking-widest transition-colors ${view === 'documentation' ? 'text-blue-600' : 'text-slate-500 hover:text-blue-600'}`}>Documentation</button>
      </div>

      <div className="flex items-center gap-3">
        <button onClick={() => setView('analyzer')} className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-full text-[11px] font-bold uppercase tracking-widest transition-all shadow-md shadow-blue-500/10 flex items-center gap-1.5">
          <Microscope size={14} /> Run VCF Pipeline
        </button>
      </div>
    </nav>
  );

  const renderFooter = () => (
    <footer className="bg-[#0b1329] py-16 px-8 text-white border-t border-white/5">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row justify-between items-start gap-16 mb-16">
          <div className="max-w-xs">
            <div className="flex items-center gap-3 mb-5">
              <Dna size={26} className="text-blue-400" />
              <span className="text-xl font-bold tracking-tight uppercase">VitalGene <span className="text-blue-400 font-extrabold">AI</span></span>
            </div>
            <p className="text-slate-400 text-xs leading-relaxed mb-6">
              Precision clinical decision support powered by generative intelligence. Connected to real-time PostgreSQL database storage for auditing and medical history records.
            </p>
            <div className="flex items-center gap-3">
              <span className="px-3 py-1 bg-white/5 border border-white/10 rounded-full text-[9px] font-bold text-blue-300 uppercase tracking-widest">v2.0.0 Enterprise</span>
              <span className="px-3 py-1 bg-white/5 border border-white/10 rounded-full text-[9px] font-bold text-emerald-400 uppercase tracking-widest">HIPAA Ready</span>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-12 flex-1">
            <div>
              <h4 className="text-[10px] font-bold uppercase tracking-[0.2em] text-blue-400 mb-5">Workspace Navigation</h4>
              <ul className="space-y-3.5 text-[11px] font-bold uppercase tracking-widest text-slate-400">
                <li><button onClick={() => setView('analyzer')} className="hover:text-blue-400 transition-colors">VCF Analyzer</button></li>
                <li><button onClick={() => setView('patients')} className="hover:text-blue-400 transition-colors">Patient Records</button></li>
                <li><button onClick={() => setView('dashboard')} className="hover:text-blue-400 transition-colors">Clinical Stats</button></li>
              </ul>
            </div>
            <div>
              <h4 className="text-[10px] font-bold uppercase tracking-[0.2em] text-blue-400 mb-5">Legal & Standards</h4>
              <ul className="space-y-3.5 text-[11px] font-bold uppercase tracking-widest text-slate-400">
                <li><a href="https://cpicpgx.org/" target="_blank" className="hover:text-blue-400 transition-colors flex items-center gap-1">CPIC Guidelines <ExternalLink size={10}/></a></li>
                <li><button onClick={() => setView('privacy')} className="hover:text-blue-400 transition-colors">Privacy Principles</button></li>
                <li><button onClick={() => setView('terms')} className="hover:text-blue-400 transition-colors">Usage Terms</button></li>
              </ul>
            </div>
            <div>
              <h4 className="text-[10px] font-bold uppercase tracking-[0.2em] text-blue-400 mb-5">Database Actions</h4>
              <button onClick={handleResetHistory} className="text-[10px] font-bold text-rose-400 hover:text-rose-300 transition-colors uppercase tracking-widest flex items-center gap-1.5">
                <Trash2 size={12}/> Clear SQL History
              </button>
            </div>
          </div>
        </div>

        <div className="pt-8 border-t border-white/5 flex flex-col md:flex-row justify-between items-center gap-6 text-slate-500 text-[10px] font-bold uppercase tracking-widest">
          <p>© 2026 VitalGene AI Platform. Aligned with pharmacogenomic clinical criteria.</p>
          <p className="flex items-center gap-2">
            <span>DATABASE MODE: {isBackendOnline ? 'POSTGRESQL (PERSISTENT)' : 'LOCAL STORAGE (SANDBOX)'}</span>
          </p>
        </div>
      </div>
    </footer>
  );

  const renderLanding = () => (
    <div className="flex flex-col bg-slate-50">
      {renderNavbar()}

      {/* Hero Section */}
      <section className="relative min-h-[85vh] flex flex-col items-center justify-center text-center px-6 overflow-hidden bg-gradient-to-br from-[#070e1e] via-[#0d1f44] to-[#0f172a] text-white py-20">
        <div className="absolute inset-0 opacity-5 pointer-events-none">
          <Dna className="absolute top-20 left-20 w-80 h-80 -rotate-12 animate-pulse" />
          <Dna className="absolute bottom-20 right-20 w-80 h-80 rotate-12 animate-pulse" />
        </div>
        
        <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8 }} className="relative z-10 max-w-5xl">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-blue-500/10 rounded-full border border-blue-400/20 mb-8">
            <Sparkles size={16} className="text-blue-400" />
            <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-blue-200">Enterprise PostgreSQL Backend Integration</span>
          </div>
          
          <h1 className="text-6xl md:text-8xl font-black mb-8 tracking-tighter leading-none">
            Precision Genomic <br/><span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-400">Decision Support.</span>
          </h1>
          
          <p className="text-base md:text-lg text-slate-300 mb-10 max-w-2xl mx-auto leading-relaxed">
            Translate raw genetic VCF data into actionable clinical insights. Connected to persistent database schemas for patient logging, risk mapping, and HIPAA audit trails.
          </p>
          
          <div className="flex flex-wrap items-center justify-center gap-4">
            <button onClick={() => setView('analyzer')} className="px-8 py-4 bg-blue-600 text-white rounded-full font-bold text-[12px] uppercase tracking-widest flex items-center gap-2 hover:bg-blue-500 transition-all hover:scale-105 shadow-xl shadow-blue-500/20">
              Start VCF Sequencing <ArrowRight size={16} />
            </button>
            <button onClick={() => setView('patients')} className="px-8 py-4 bg-white/5 text-white border border-white/10 rounded-full font-bold text-[12px] uppercase tracking-widest hover:bg-white/10 transition-all flex items-center gap-2">
              <ClipboardCheck size={16} /> Manage Patients
            </button>
          </div>
        </motion.div>
      </section>

      {/* System Health Check banner */}
      <section className="bg-white border-y border-slate-100 py-6 px-8">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Database className={isBackendOnline ? 'text-emerald-500' : 'text-amber-500'} size={24} />
            <div>
              <h4 className="font-bold text-slate-900 text-sm">System Database Connectivity</h4>
              <p className="text-xs text-slate-400">
                {isBackendOnline 
                  ? 'Connected to primary PostgreSQL database at localhost:5432' 
                  : 'Postgres service offline. Running in secure browser memory fallback mode.'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`px-3.5 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-full border ${isBackendOnline ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-amber-50 text-amber-700 border-amber-100'}`}>
              {isBackendOnline ? 'Active Server' : 'Sandbox Fallback'}
            </span>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="py-24 px-6 max-w-7xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm hover:shadow-md transition-all">
            <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center mb-6"><Database size={24}/></div>
            <h3 className="text-lg font-bold text-slate-900 mb-2">Relational Persistence</h3>
            <p className="text-xs text-slate-500 leading-relaxed font-medium">Auto-migrating PostgreSQL relational database tables store Patient profiles, parsed genotype variations, and diagnostic recommendations permanently.</p>
          </div>
          <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm hover:shadow-md transition-all">
            <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center mb-6"><ShieldCheck size={24}/></div>
            <h3 className="text-lg font-bold text-slate-900 mb-2">Clinical CPIC Mapping</h3>
            <p className="text-xs text-slate-500 leading-relaxed font-medium">Standardized diplotype-to-phenotype translation algorithms aligned with the CPIC guidelines, preventing adverse reactions for Codeine, Warfarin, and Statins.</p>
          </div>
          <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm hover:shadow-md transition-all">
            <div className="w-12 h-12 bg-purple-50 text-purple-600 rounded-xl flex items-center justify-center mb-6"><BrainCircuit size={24}/></div>
            <h3 className="text-lg font-bold text-slate-900 mb-2">Google Gemini Insights</h3>
            <p className="text-xs text-slate-500 leading-relaxed font-medium">Generative AI models running server-side to synthesize clinical dosing explanations and molecular mechanisms without risking client API leaks.</p>
          </div>
        </div>
      </section>

      {renderFooter()}
    </div>
  );

  const renderDocumentation = () => (
    <div className="min-h-screen flex flex-col bg-slate-50">
      {renderNavbar()}
      <main className="flex-1 max-w-4xl mx-auto w-full px-6 py-12">
        <div className="bg-white p-12 rounded-[2rem] border border-slate-200 shadow-sm">
          <header className="mb-8 border-b pb-6">
            <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight flex items-center gap-3">
              <BookOpen size={28} className="text-blue-600" /> Platform Architecture
            </h1>
            <p className="text-slate-500 text-sm mt-1">Technical specifications of the full-stack genomic mapping engine.</p>
          </header>

          <div className="space-y-8 text-sm text-slate-600 leading-relaxed">
            <section>
              <h3 className="text-lg font-bold text-slate-900 mb-3">1. PostgreSQL Schema</h3>
              <p className="mb-4">Upon backend initialization, the system connects to the database via standard environment configuration and verifies/creates the four key tables:</p>
              <div className="bg-slate-900 text-cyan-400 p-6 rounded-2xl font-mono text-xs overflow-x-auto">
                <pre>{`-- Patients Master Catalog
CREATE TABLE patients (
  id VARCHAR(255) PRIMARY KEY,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- PGx Diagnostic Reports Table
CREATE TABLE pgx_reports (
  id SERIAL PRIMARY KEY,
  patient_id VARCHAR(255) REFERENCES patients(id) ON DELETE CASCADE,
  drug VARCHAR(100) NOT NULL,
  risk_label VARCHAR(100) NOT NULL,
  severity VARCHAR(100) NOT NULL,
  primary_gene VARCHAR(100) NOT NULL,
  phenotype VARCHAR(100) NOT NULL,
  diplotype VARCHAR(100) NOT NULL,
  action VARCHAR(255) NOT NULL,
  dosing_guideline TEXT NOT NULL,
  quality_metrics JSONB NOT NULL
);`}</pre>
              </div>
            </section>

            <section>
              <h3 className="text-lg font-bold text-slate-900 mb-3">2. Core API Endpoints</h3>
              <ul className="space-y-2 list-disc pl-5">
                <li><code className="text-blue-600 font-bold">POST /api/analyze</code>: Submits a VCF record and targeted drugs list. Parses, executes CPIC mapping, requests Gemini summary, writes transaction to database, and outputs JSON diagnostics.</li>
                <li><code className="text-blue-600 font-bold">GET /api/stats</code>: Pulls database aggregate records to render live dashboard visualizations.</li>
                <li><code className="text-blue-600 font-bold">GET /api/patients</code>: Pulls distinct profiles listing the audit footprint and max risk profiles.</li>
                <li><code className="text-blue-600 font-bold">DELETE /api/history</code>: Wipes logs securely using Postgres cascade truncations.</li>
              </ul>
            </section>
          </div>
        </div>
      </main>
      {renderFooter()}
    </div>
  );

  const renderPrivacy = () => (
    <div className="min-h-screen flex flex-col bg-slate-50">
      {renderNavbar()}
      <main className="flex-1 max-w-3xl mx-auto w-full px-6 py-12">
        <div className="bg-white p-12 rounded-[2rem] border border-slate-200 shadow-sm">
          <h1 className="text-2xl font-extrabold text-slate-900 mb-6 flex items-center gap-2"><Lock className="text-blue-600"/> Data Sovereignty & Privacy</h1>
          <div className="text-slate-600 text-sm space-y-6 leading-relaxed">
            <p>VitalGene AI aligns with precision medical data principles. Raw genetic file records uploaded to the database are associated purely with a transient patient tag (rsIDs). We do not record user names, clinical identifiers, or identity parameters.</p>
            <p>Before forwarding parameters to Gemini to generate summaries, raw chromosomal sequences are stripped entirely, sending only isolated rsID tags and gene metabolizer phenotypes to keep processing completely anonymous.</p>
          </div>
        </div>
      </main>
      {renderFooter()}
    </div>
  );

  const renderTerms = () => (
    <div className="min-h-screen flex flex-col bg-slate-50">
      {renderNavbar()}
      <main className="flex-1 max-w-3xl mx-auto w-full px-6 py-12">
        <div className="bg-white p-12 rounded-[2rem] border border-slate-200 shadow-sm">
          <h1 className="text-2xl font-extrabold text-slate-900 mb-6 flex items-center gap-2"><Scale className="text-blue-600"/> Medical Disclaimer</h1>
          <div className="text-slate-600 text-sm space-y-6 leading-relaxed">
            <div className="p-4 bg-rose-50 border border-rose-100 rounded-xl text-rose-700 text-xs font-bold flex items-center gap-2.5">
              <AlertTriangle size={18} className="shrink-0"/> WARNING: Research and educational tool only. Not for diagnostics.
            </div>
            <p>All recommendations mapped via the system are calculated strictly from algorithmic evidence bases provided by CPIC. Dosing adjustments must be reviewed and ordered by licensed medical professionals.</p>
          </div>
        </div>
      </main>
      {renderFooter()}
    </div>
  );

  const renderDashboard = () => {
    // Generate risk distribution percentages for visual graph
    const riskData = stats?.riskDistribution || { Safe: 0, 'Adjust Dosage': 0, Toxic: 0, Ineffective: 0, Unknown: 0 };
    const totalCount = stats?.totalAnalyses || 0;
    
    return (
      <div className="min-h-screen flex flex-col bg-slate-50">
        {renderNavbar()}

        <main className="flex-1 max-w-[1400px] mx-auto w-full px-8 py-10">
          <header className="mb-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-blue-100 text-blue-600 rounded-xl flex items-center justify-center shadow-sm"><LayoutDashboard size={20}/></div>
                <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Clinical Stats & Metrics</h1>
              </div>
              <p className="text-slate-400 text-xs mt-1">Real-time stats compiled directly via SQL queries in PostgreSQL database.</p>
            </div>

            <button onClick={handleResetHistory} className="px-5 py-2 border border-rose-200 text-rose-600 hover:bg-rose-50 rounded-xl text-[11px] font-bold uppercase tracking-widest transition-all">
              Reset SQL Audit Log
            </button>
          </header>

          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
            {[
              { label: "Postgres Database Records", val: stats?.totalAnalyses ?? 0, icon: <Database size={22}/>, color: "text-blue-600", bg: "bg-blue-50" },
              { label: "High Risk Indicators", val: stats?.highRiskCount ?? 0, icon: <ShieldAlert size={22}/>, color: "text-rose-600", bg: "bg-rose-50" },
              { label: "Most Checked Drug", val: stats?.topDrug ?? 'N/A', icon: <Pill size={22}/>, color: "text-amber-600", bg: "bg-amber-50" },
              { label: "Last Diagnostic Executed", val: stats?.lastAnalysis ? new Date(stats.lastAnalysis).toLocaleDateString() : 'No activity', icon: <Calendar size={22}/>, color: "text-emerald-600", bg: "bg-emerald-50" }
            ].map((s, i) => (
              <div key={i} className="bg-white p-6 rounded-2xl border border-slate-200/60 shadow-sm flex items-center gap-5">
                <div className={`w-12 h-12 ${s.bg} ${s.color} rounded-xl flex items-center justify-center shrink-0`}>{s.icon}</div>
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-0.5">{s.label}</span>
                  <span className="text-2xl font-black text-slate-900">{s.val}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-stretch mb-10">
            {/* Risk Chart Card */}
            <div className="bg-white p-8 rounded-3xl border border-slate-200/60 shadow-sm flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-2.5 mb-6">
                  <TrendingUp size={18} className="text-blue-600"/>
                  <h2 className="text-sm font-bold text-slate-800 uppercase tracking-widest">Genomic Risk Proportions</h2>
                </div>

                {/* SVG Visual Chart */}
                <div className="flex items-center justify-center py-6">
                  {totalCount === 0 ? (
                    <div className="text-center text-slate-400 text-xs italic py-10">No genetic profile data mapped</div>
                  ) : (
                    <div className="relative w-44 h-44 flex items-center justify-center">
                      {/* Simple SVG circle rendering relative proportions */}
                      <svg width="100%" height="100%" viewBox="0 0 42 42" className="rotate-[-90deg]">
                        <circle cx="21" cy="21" r="15.915" fill="transparent" stroke="#f1f5f9" strokeWidth="4.2"></circle>
                        {(() => {
                          let accumulatedPercentage = 0;
                          return Object.entries(riskData).map(([label, count]) => {
                            const pct = ((count as number) / totalCount) * 100;
                            if (pct === 0) return null;
                            
                            const color = 
                              label === 'Safe' ? '#10b981' :
                              label === 'Adjust Dosage' ? '#f59e0b' :
                              label === 'Toxic' ? '#f43f5e' :
                              label === 'Ineffective' ? '#f97316' : '#94a3b8';

                            const strokeDashArray = `${pct} ${100 - pct}`;
                            const strokeDashOffset = 100 - accumulatedPercentage;
                            accumulatedPercentage += pct;

                            return (
                              <circle 
                                key={label}
                                cx="21" 
                                cy="21" 
                                r="15.915" 
                                fill="transparent" 
                                stroke={color} 
                                strokeWidth="4.2" 
                                strokeDasharray={strokeDashArray} 
                                strokeDashoffset={strokeDashOffset}
                              />
                            );
                          });
                        })()}
                      </svg>
                      <div className="absolute text-center">
                        <span className="text-3xl font-extrabold text-slate-800">{totalCount}</span>
                        <span className="block text-[8px] font-bold text-slate-400 uppercase tracking-widest">Total Reports</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Legend with counts */}
              <div className="grid grid-cols-2 gap-4 border-t pt-6 text-xs">
                {Object.entries(riskData).map(([label, count]) => {
                  const pct = totalCount ? Math.round(((count as number) / totalCount) * 100) : 0;
                  const dotColor = 
                    label === 'Safe' ? 'bg-emerald-500' :
                    label === 'Adjust Dosage' ? 'bg-amber-500' :
                    label === 'Toxic' ? 'bg-rose-500' :
                    label === 'Ineffective' ? 'bg-orange-500' : 'bg-slate-400';

                  return (
                    <div key={label} className="flex items-center gap-2">
                      <span className={`w-2.5 h-2.5 rounded-full ${dotColor} shrink-0`}></span>
                      <div className="min-w-0">
                        <span className="block font-bold text-slate-700 truncate leading-tight text-[11px]">{label}</span>
                        <span className="text-[9px] text-slate-400 font-medium">{count} ({pct}%)</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Recent Logs list */}
            <div className="lg:col-span-2 bg-white rounded-3xl border border-slate-200/60 shadow-sm overflow-hidden flex flex-col">
              <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <History size={18} className="text-blue-600"/>
                  <h2 className="text-sm font-bold text-slate-800 uppercase tracking-widest">Database Audit History</h2>
                </div>
                <span className="px-3 py-1 bg-blue-50 text-blue-600 text-[9px] font-bold rounded-lg uppercase tracking-wider">
                  PostgreSQL Active
                </span>
              </div>
              
              <div className="overflow-x-auto flex-1 custom-scrollbar">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-slate-50 border-b border-slate-100 sticky top-0">
                    <tr>
                      <th className="px-6 py-4 text-[9px] font-bold text-slate-400 uppercase tracking-widest">Patient</th>
                      <th className="px-6 py-4 text-[9px] font-bold text-slate-400 uppercase tracking-widest">Medication</th>
                      <th className="px-6 py-4 text-[9px] font-bold text-slate-400 uppercase tracking-widest">Genotype</th>
                      <th className="px-6 py-4 text-[9px] font-bold text-slate-400 uppercase tracking-widest">Risk Level</th>
                      <th className="px-6 py-4 text-[9px] font-bold text-slate-400 uppercase tracking-widest text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {!stats?.recentAnalyses || stats.recentAnalyses.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-6 py-12 text-center text-slate-400 text-xs italic font-medium">
                          No database records found. Analyze a VCF file to initiate SQL tracking logs.
                        </td>
                      </tr>
                    ) : (
                      stats.recentAnalyses.map((r, i) => (
                        <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-6 py-4">
                            <span className="text-[12px] font-bold text-slate-800 block">{r.patient_id}</span>
                            <span className="text-[9px] text-slate-400 font-medium block mt-0.5">{new Date(r.timestamp).toLocaleString()}</span>
                          </td>
                          <td className="px-6 py-4">
                            <span className="text-xs font-bold text-blue-600 flex items-center gap-1">
                              <Pill size={12}/> {r.drug}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block bg-slate-100 px-2 py-0.5 rounded w-max">
                              {r.pharmacogenomic_profile.primary_gene} {r.pharmacogenomic_profile.diplotype}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                             <RiskBadge label={r.risk_assessment.risk_label} />
                          </td>
                          <td className="px-6 py-4 text-right">
                            <div className="flex justify-end gap-1">
                              <button onClick={() => setShowJsonModal(r)} className="p-2 text-slate-400 hover:text-blue-600 hover:bg-slate-50 rounded-lg transition-all" title="Inspect Record Schema"><FileJson size={15}/></button>
                              <button onClick={() => downloadJson(r)} className="p-2 text-slate-400 hover:text-blue-600 hover:bg-slate-50 rounded-lg transition-all" title="Export JSON"><Download size={15}/></button>
                            </div>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </main>

        {renderFooter()}
      </div>
    );
  };

  const renderPatientsView = () => {
    return (
      <div className="min-h-screen flex flex-col bg-slate-50">
        {renderNavbar()}

        <main className="flex-1 max-w-[1400px] mx-auto w-full px-8 py-10">
          <header className="mb-10">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-blue-100 text-blue-600 rounded-xl flex items-center justify-center shadow-sm"><User size={20}/></div>
              <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Patients Clinical Records</h1>
            </div>
            <p className="text-slate-400 text-xs mt-1">Longitudinal audit logs, gene panels, and patient risk profiles saved in SQL tables.</p>
          </header>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
            {/* Patients Catalog sidebar */}
            <div className="bg-white rounded-3xl border border-slate-200/60 shadow-sm p-6 flex flex-col max-h-[70vh]">
              <div className="mb-4">
                <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-2">Search patient tags</label>
                <div className="relative">
                  <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input 
                    type="text" 
                    placeholder="Search by ID..."
                    value={patientSearch}
                    onChange={(e) => setPatientSearch(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-100 rounded-xl text-xs font-semibold focus:outline-none focus:border-blue-500 focus:bg-white transition-all"
                  />
                </div>
              </div>

              <div className="flex-1 overflow-y-auto custom-scrollbar space-y-2.5">
                {filteredPatients.length === 0 ? (
                  <div className="text-center text-slate-400 text-xs italic py-8 border border-dashed rounded-2xl">
                    No matching patient profiles found.
                  </div>
                ) : (
                  filteredPatients.map(p => {
                    const isSelected = selectedPatientId === p.id;
                    const alertColor = 
                      p.max_severity === 'critical' ? 'border-rose-400 bg-rose-50/20 text-rose-700' :
                      p.max_severity === 'high' ? 'border-orange-400 bg-orange-50/20 text-orange-700' :
                      p.max_severity === 'moderate' ? 'border-amber-400 bg-amber-50/20 text-amber-700' :
                      'border-slate-100 bg-slate-50/40 text-slate-500';

                    return (
                      <button 
                        key={p.id}
                        onClick={() => loadPatientDetail(p.id)}
                        className={`w-full text-left p-4 rounded-2xl border transition-all ${isSelected ? 'border-blue-500 bg-blue-50/30' : 'border-slate-100 hover:border-slate-300'}`}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="font-extrabold text-slate-800 text-xs leading-none">{p.id}</span>
                          <span className={`px-2 py-0.5 border text-[8px] font-bold rounded-md uppercase tracking-wider ${alertColor}`}>
                            {p.max_severity} RISK
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-[9px] text-slate-400 font-bold">
                          <span>{p.total_reports} analyses recorded</span>
                          <span>{new Date(p.created_at).toLocaleDateString()}</span>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            {/* Patient Clinical Audit timeline */}
            <div className="lg:col-span-2 space-y-6">
              {!selectedPatientId ? (
                <div className="bg-white p-12 rounded-3xl border border-slate-200/60 shadow-sm text-center text-slate-400 italic text-sm">
                  Select a patient profile from the sidebar to inspect clinical records and genomic history.
                </div>
              ) : loadingPatientHistory ? (
                <div className="bg-white p-12 rounded-3xl border border-slate-200/60 shadow-sm flex flex-col items-center justify-center gap-4">
                  <Loader2 className="animate-spin text-blue-600" size={32} />
                  <span className="text-xs font-semibold text-slate-500">Querying database transaction logs...</span>
                </div>
              ) : patientReports.length === 0 ? (
                <div className="bg-white p-12 rounded-3xl border border-slate-200/60 shadow-sm text-center text-slate-400 italic text-sm">
                  No genomic history logged for patient {selectedPatientId}.
                </div>
              ) : (
                <div className="flex flex-col gap-6">
                  {/* Patient header card */}
                  <div className="bg-white p-6 rounded-3xl border border-slate-200/60 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center shrink-0"><User size={24}/></div>
                      <div>
                        <h2 className="text-xl font-bold text-slate-800">{selectedPatientId}</h2>
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                          Registered: {new Date(patientReports[patientReports.length - 1].timestamp).toLocaleString()}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={() => {
                          // Open analyzer and load patient VCF contents if available
                          setView('analyzer');
                        }}
                        className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all"
                      >
                        Run New Analysis
                      </button>
                    </div>
                  </div>

                  {/* Reports selector toggles */}
                  <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                    {patientReports.map((r, i) => (
                      <button 
                        key={i} 
                        onClick={() => setActivePatientReportIdx(i)} 
                        className={`px-4 py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all whitespace-nowrap border ${activePatientReportIdx === i ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-400 border-slate-200/60 shadow-sm'}`}
                      >
                        {r.drug} ({new Date(r.timestamp).toLocaleDateString()})
                      </button>
                    ))}
                  </div>

                  {/* Selected report details */}
                  <div className="bg-white rounded-3xl border border-slate-200/60 shadow-sm overflow-hidden flex flex-col">
                    <header className="px-8 py-6 border-b border-slate-100 bg-slate-50/20 flex flex-col gap-4">
                      <div className="flex items-center justify-between text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                         <span>Analysis ID: PGX-{patientReports[activePatientReportIdx].pharmacogenomic_profile.primary_gene}-{patientReports[activePatientReportIdx].drug}</span>
                         <div className="flex gap-2">
                           <button onClick={() => setShowJsonModal(patientReports[activePatientReportIdx])} className="p-2 hover:bg-slate-100 rounded-lg text-slate-400 transition-colors" title="Copy JSON Object"><Copy size={16}/></button>
                           <button onClick={() => downloadJson(patientReports[activePatientReportIdx])} className="p-2 hover:bg-slate-100 rounded-lg text-slate-400 transition-colors" title="Export JSON"><Download size={16}/></button>
                         </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <LinkIcon className="text-blue-500" size={22}/>
                        <h3 className="text-2xl font-extrabold text-slate-900">{patientReports[activePatientReportIdx].drug}</h3>
                      </div>
                      <div className="p-4 bg-slate-50 border border-slate-100 rounded-2xl flex items-center justify-between">
                         <div className="flex items-center gap-4">
                            <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-amber-500 shadow-sm border border-slate-100"><AlertTriangle size={22}/></div>
                            <div>
                               <div className="flex items-center gap-2">
                                  <span className="text-lg font-bold text-slate-900">{patientReports[activePatientReportIdx].risk_assessment.risk_label}</span>
                                  <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-[8px] font-bold rounded uppercase">
                                    {patientReports[activePatientReportIdx].risk_assessment.severity} RISK
                                  </span>
                               </div>
                               <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Confidence Score: {Math.round(patientReports[activePatientReportIdx].risk_assessment.confidence_score * 100)}%</p>
                            </div>
                         </div>
                      </div>
                    </header>

                    <div className="p-8 space-y-6">
                      <div className="border border-slate-100 rounded-2xl overflow-hidden shadow-sm">
                        <button onClick={() => setExpandedSections(s => ({...s, profile: !s.profile}))} className="w-full px-6 py-4 flex items-center justify-between bg-slate-50/50 border-b border-slate-100">
                          <div className="flex items-center gap-3 text-blue-600 font-bold text-sm"><Dna size={18}/> Pharmacogenomic Profile</div>
                          <ChevronUp className={`transition-transform duration-300 ${!expandedSections.profile ? 'rotate-180' : ''}`} size={18}/>
                        </button>
                        <AnimatePresence>
                          {expandedSections.profile && (
                            <motion.div initial={{height:0}} animate={{height:'auto'}} exit={{height:0}} className="overflow-hidden bg-white">
                              <div className="p-6 space-y-6">
                                <div className="grid grid-cols-2 gap-4">
                                  <div className="p-4 bg-slate-50 rounded-xl">
                                    <span className="block text-[9px] font-bold text-slate-400 uppercase mb-1 tracking-widest">Primary Gene</span>
                                    <span className="text-xl font-bold text-slate-900">{patientReports[activePatientReportIdx].pharmacogenomic_profile.primary_gene}</span>
                                  </div>
                                  <div className="p-4 bg-slate-50 rounded-xl">
                                    <span className="block text-[9px] font-bold text-slate-400 uppercase mb-1 tracking-widest">Phenotype</span>
                                    <span className="text-xl font-bold text-slate-900">{patientReports[activePatientReportIdx].pharmacogenomic_profile.phenotype}</span>
                                  </div>
                                </div>
                                <div>
                                  <span className="block text-[9px] font-bold text-slate-400 uppercase mb-1.5 tracking-widest">Diplotype Translation</span>
                                  <span className="text-2xl font-black text-slate-900">{patientReports[activePatientReportIdx].pharmacogenomic_profile.diplotype}</span>
                                </div>
                                <div>
                                  <span className="block text-[9px] font-bold text-slate-400 uppercase mb-3 tracking-widest">Detected Variants Mapped</span>
                                  <div className="space-y-2">
                                    {patientReports[activePatientReportIdx].pharmacogenomic_profile.detected_variants.length === 0 ? (
                                      <div className="p-4 bg-slate-50 text-slate-400 text-xs italic rounded-xl">No variants detected. Standard wild-type dosing matches.</div>
                                    ) : (
                                      patientReports[activePatientReportIdx].pharmacogenomic_profile.detected_variants.map((v, idx) => (
                                        <div key={idx} className="px-4 py-3 bg-blue-50/50 border border-blue-100/50 rounded-xl flex items-center justify-between">
                                          <div className="flex items-center gap-3">
                                            <span className="text-[12px] font-bold text-blue-600">{v.rsid}</span>
                                            <span className="text-[11px] font-bold text-slate-800">{v.starAllele} <span className="font-normal text-slate-500">— {v.significance}</span></span>
                                          </div>
                                          <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-[8px] font-bold rounded uppercase">
                                            Genotype: {v.genotype}
                                          </span>
                                        </div>
                                      ))
                                    )}
                                  </div>
                                </div>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>

                      <div className="border border-slate-100 rounded-2xl overflow-hidden shadow-sm">
                        <button onClick={() => setExpandedSections(s => ({...s, recommendation: !s.recommendation}))} className="w-full px-6 py-4 flex items-center justify-between bg-slate-50/50 border-b border-slate-100">
                          <div className="flex items-center gap-3 text-emerald-600 font-bold text-sm"><ShieldCheck size={18}/> Dosing Recommendations</div>
                          <ChevronUp className={`transition-transform duration-300 ${!expandedSections.recommendation ? 'rotate-180' : ''}`} size={18}/>
                        </button>
                        <AnimatePresence>
                          {expandedSections.recommendation && (
                            <motion.div initial={{height:0}} animate={{height:'auto'}} exit={{height:0}} className="overflow-hidden bg-white">
                              <div className="p-6 bg-emerald-50/20 border-l-[6px] border-emerald-500">
                                <h4 className="text-lg font-bold text-slate-900 mb-2">{patientReports[activePatientReportIdx].clinical_recommendation.dosingGuideline}</h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6 pt-6 border-t border-emerald-100/50 text-xs">
                                  <div>
                                    <span className="block text-[9px] font-bold text-slate-400 uppercase mb-1">Primary Clinical Action</span>
                                    <span className="font-bold text-slate-800 uppercase bg-emerald-100/50 px-2 py-0.5 rounded">{patientReports[activePatientReportIdx].clinical_recommendation.action}</span>
                                  </div>
                                  <div>
                                    <span className="block text-[9px] font-bold text-slate-400 uppercase mb-1">Evidence Guideline (CPIC)</span>
                                    <p className="text-slate-600 font-medium leading-relaxed">{patientReports[activePatientReportIdx].clinical_recommendation.cpicGuideline}</p>
                                  </div>
                                </div>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>

                      {/* Gemini Rationale Renders */}
                      <div className="border border-slate-100 rounded-2xl overflow-hidden shadow-sm">
                        <button onClick={() => setExpandedSections(s => ({...s, rationale: !s.rationale}))} className="w-full px-6 py-4 flex items-center justify-between bg-slate-50/50 border-b border-slate-100">
                          <div className="flex items-center gap-3 text-purple-600 font-bold text-sm"><BrainCircuit size={18}/> AI Rationale (Google Gemini)</div>
                          <ChevronUp className={`transition-transform duration-300 ${!expandedSections.rationale ? 'rotate-180' : ''}`} size={18}/>
                        </button>
                        <AnimatePresence>
                          {expandedSections.rationale && (
                            <motion.div initial={{height:0}} animate={{height:'auto'}} exit={{height:0}} className="overflow-hidden bg-white">
                              <div className="p-6 space-y-5 text-xs">
                                <div className="p-4 bg-purple-50/20 border-l-[4px] border-purple-500 rounded-r-xl">
                                  <span className="block text-[9px] font-bold text-purple-600 uppercase mb-1.5 tracking-wider">Clinical Synthesis</span>
                                  <p className="text-slate-700 leading-relaxed font-semibold">{patientReports[activePatientReportIdx].llm_generated_explanation.summary}</p>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                                  <div className="p-4 bg-slate-50 rounded-xl">
                                    <span className="block text-[9px] font-bold text-slate-400 uppercase mb-1.5 tracking-wider">Molecular Mechanism</span>
                                    <p className="text-slate-600 leading-relaxed font-medium">{patientReports[activePatientReportIdx].llm_generated_explanation.mechanism}</p>
                                  </div>
                                  <div className="p-4 bg-slate-50 rounded-xl">
                                    <span className="block text-[9px] font-bold text-slate-400 uppercase mb-1.5 tracking-wider">Clinical Consequence</span>
                                    <p className="text-slate-600 leading-relaxed font-medium">{patientReports[activePatientReportIdx].llm_generated_explanation.clinicalImpact}</p>
                                  </div>
                                </div>
                                <div className="p-4 bg-slate-50 rounded-xl">
                                  <span className="block text-[9px] font-bold text-slate-400 uppercase mb-1.5 tracking-wider">Variant Specific Details</span>
                                  <p className="text-slate-600 leading-relaxed font-medium">{patientReports[activePatientReportIdx].llm_generated_explanation.variantDetails}</p>
                                </div>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </main>

        {renderFooter()}
      </div>
    );
  };

  const renderAnalyzer = () => (
    <div className="min-h-screen flex flex-col bg-slate-50">
      {renderNavbar()}

      <main className="flex-1 max-w-[1400px] mx-auto w-full px-8 py-10">
        <header className="text-center mb-12 max-w-2xl mx-auto">
          <p className="text-[10px] font-bold text-blue-600 uppercase tracking-[0.2em] mb-2">Precision Pharmacogenomic Pipeline</p>
          <h1 className="text-3xl font-extrabold text-slate-900 mb-4">Run Patient VCF Sequencing</h1>
          <p className="text-slate-500 leading-relaxed text-xs">Upload raw patient genomic files to trigger relational database mapping and CPIC decision diagnostics.</p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
          {/* Form parameters */}
          <section className="bg-white rounded-3xl border border-slate-200/60 shadow-sm p-8">
            <header className="flex items-center gap-3.5 mb-6">
              <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center shadow-sm"><Microscope size={20} /></div>
              <div>
                <h2 className="text-base font-bold text-slate-900">Analysis Inputs</h2>
                <p className="text-[11px] text-slate-400">Configure parameters for the database mapping pipeline</p>
              </div>
            </header>

            <div className="space-y-6">
              <section>
                <label className="block text-[9px] font-bold text-slate-400 mb-2.5 uppercase tracking-wider">VCF Genomic File</label>
                <label className={`group block rounded-2xl p-6 text-center cursor-pointer transition-all ${vcfFile ? 'bg-emerald-50/40 border border-emerald-200' : 'bg-slate-50/50 border border-slate-200 border-dashed hover:border-blue-400'}`}>
                  {vcfFile ? (
                    <div className="flex items-center gap-4 text-left">
                      <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-emerald-600 border border-emerald-100 shadow-sm"><FileCode size={20}/></div>
                      <div className="flex-1 overflow-hidden">
                        <span className="text-xs font-bold text-slate-700 block truncate">{vcfFile.name}</span>
                        <span className="text-[10px] text-emerald-600 font-bold block uppercase tracking-wider mt-0.5">File ready to submit</span>
                      </div>
                      <button onClick={(e) => { e.preventDefault(); setVcfFile(null); setVcfContent(''); setIsVcfValid(null); }} className="w-7 h-7 hover:bg-slate-200/50 rounded-full flex items-center justify-center shrink-0 transition-colors"><X size={14}/></button>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center py-2">
                      <UploadCloud size={30} className="text-slate-400 group-hover:text-blue-500 mb-3 transition-colors" />
                      <span className="text-xs font-bold text-slate-700 block mb-0.5">Drag VCF file here, or click to browse</span>
                      <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Supports v4.2 format up to 5MB</span>
                    </div>
                  )}
                  <input type="file" className="sr-only" onChange={handleFileUpload} accept=".vcf" />
                </label>
              </section>

              <section>
                <label className="block text-[9px] font-bold text-slate-400 mb-2.5 uppercase tracking-wider">Or select patient sample template</label>
                <div className="flex flex-wrap gap-2">
                  {Object.keys(SAMPLES).map(name => (
                    <button key={name} onClick={() => loadSample(name)} className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 text-[10px] font-bold uppercase tracking-wider rounded-xl transition-all border border-transparent">
                      {name}
                    </button>
                  ))}
                </div>
              </section>

              <section>
                <label className="block text-[9px] font-bold text-slate-400 mb-2 uppercase tracking-wider">Target Medications for Risk Audit</label>
                <div className="space-y-4">
                  <div className="relative" ref={dropdownRef}>
                    <button 
                      onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                      className="w-full px-4 py-2.5 bg-slate-50 hover:bg-slate-100/50 border border-slate-200/60 rounded-xl flex items-center justify-between text-xs font-bold text-slate-700 transition-all focus:outline-none"
                    >
                      <span>Search & add medications...</span>
                      <ChevronDown size={16} className={`text-slate-400 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} />
                    </button>
                    
                    <AnimatePresence>
                      {isDropdownOpen && (
                        <motion.div initial={{opacity:0, y:5}} animate={{opacity:1, y:0}} exit={{opacity:0, y:5}} className="absolute left-0 right-0 mt-2 bg-white border border-slate-200 rounded-2xl shadow-xl z-20 max-h-56 overflow-y-auto p-2.5 custom-scrollbar">
                          <input 
                            type="text"
                            placeholder="Type drug name..."
                            value={drugSearchTerm}
                            onChange={e => setDrugSearchTerm(e.target.value)}
                            className="w-full px-3 py-2 bg-slate-50 border border-slate-100 rounded-xl text-xs font-semibold focus:outline-none mb-2"
                            onClick={e => e.stopPropagation()}
                          />
                          <div className="space-y-1">
                            {filteredSuggestions.map(drug => (
                              <button 
                                key={drug}
                                onClick={() => addDrug(drug)}
                                className="w-full text-left px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-blue-50 hover:text-blue-600 rounded-xl transition-colors flex items-center justify-between"
                              >
                                <span>{drug}</span>
                                <span className="text-[9px] text-slate-400 uppercase font-bold">Gene: {DRUG_GENE_MAP[drug as SupportedDrug]}</span>
                              </button>
                            ))}
                            {filteredSuggestions.length === 0 && (
                              <div className="text-center py-4 text-slate-400 text-xs italic">No matching drug found</div>
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  {/* Selected drugs pills */}
                  <div className="flex flex-wrap gap-2">
                    {selectedDrugs.map(drug => (
                      <span key={drug} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 border border-blue-100 rounded-xl text-xs font-bold text-blue-700">
                        {drug}
                        <button onClick={() => removeDrug(drug)} className="p-0.5 hover:bg-blue-100 text-blue-500 hover:text-blue-700 rounded-full transition-colors"><X size={12}/></button>
                      </span>
                    ))}
                  </div>
                </div>
              </section>

              <button 
                onClick={handleSubmit} 
                disabled={loading || !vcfContent || selectedDrugs.length === 0}
                className="w-full py-4 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 text-white rounded-full font-bold text-xs uppercase tracking-widest transition-all shadow-lg shadow-blue-500/10 flex items-center justify-center gap-2 mt-4"
              >
                {loading ? <Loader2 className="animate-spin" size={16}/> : <Zap size={16}/>}
                Execute Database Sequencing Pipeline
              </button>

              {error && (
                <div className="p-4 bg-rose-50 border border-rose-100 rounded-2xl flex items-start gap-3 mt-4 text-rose-700 text-xs font-semibold">
                  <AlertTriangle className="shrink-0 text-rose-500" size={18}/>
                  <div className="flex-1">
                    <p className="font-bold">Execution Error</p>
                    <p className="text-rose-600/80 leading-normal mt-0.5 font-medium">{error}</p>
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* Results reports display */}
          <section className="min-h-[60vh] flex flex-col">
            <AnimatePresence mode="wait">
              {loading ? (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="bg-white rounded-3xl border border-slate-200/60 shadow-sm p-12 flex-1 flex flex-col items-center justify-center text-center">
                  <Loader2 size={40} className="text-blue-600 animate-spin mb-6" />
                  <h3 className="text-lg font-bold text-slate-800 mb-2">{AnalysisSteps[loadingStep]}</h3>
                  <div className="w-48 h-1.5 bg-slate-100 rounded-full overflow-hidden mb-1">
                    <motion.div 
                      className="h-full bg-blue-600 rounded-full" 
                      initial={{ width: '0%' }} 
                      animate={{ width: `${((loadingStep + 1) / AnalysisSteps.length) * 100}%` }}
                      transition={{ duration: 0.5 }}
                    />
                  </div>
                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">PostgreSQL transactional pipelines active</span>
                </motion.div>
              ) : reports.length === 0 ? (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="bg-white rounded-3xl border border-slate-200 border-dashed p-12 flex-1 flex flex-col items-center justify-center text-center text-slate-400 italic">
                  <Microscope size={44} className="text-slate-300 mb-4" />
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Waiting for sequencing trigger</h3>
                  <p className="text-[11px] leading-relaxed max-w-xs mx-auto">Upload genetic file and choose target drugs to initialize database diagnostics tracking logs.</p>
                </motion.div>
              ) : (
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="flex-1 flex flex-col gap-6">
                  {/* Tabs for drugs */}
                  <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                    {reports.map((r, i) => (
                      <button 
                        key={i} 
                        onClick={() => setActiveReportIdx(i)} 
                        className={`px-4 py-2.5 rounded-xl text-[10px] font-bold uppercase tracking-wider transition-all whitespace-nowrap border ${activeReportIdx === i ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-400 border-slate-200/60 shadow-sm'}`}
                      >
                        {r.drug}
                      </button>
                    ))}
                  </div>

                  <div className="bg-white rounded-3xl border border-slate-200/60 shadow-sm flex-1 flex flex-col overflow-hidden">
                    <header className="px-8 py-6 border-b border-slate-100 bg-slate-50/20 flex flex-col gap-4">
                      <div className="flex items-center justify-between text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                         <span>Patient ID: {reports[activeReportIdx].patient_id}</span>
                         <div className="flex gap-2">
                           <button onClick={() => setShowJsonModal(reports[activeReportIdx])} className="p-2 hover:bg-slate-100 rounded-lg text-slate-400 transition-colors" title="Copy JSON Object"><Copy size={16}/></button>
                           <button onClick={() => downloadJson(reports[activeReportIdx])} className="p-2 hover:bg-slate-100 rounded-lg text-slate-400 transition-colors" title="Export JSON"><Download size={16}/></button>
                         </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <LinkIcon className="text-blue-500" size={22}/>
                        <h3 className="text-2xl font-extrabold text-slate-900">{reports[activeReportIdx].drug}</h3>
                      </div>
                      <div className="p-4 bg-slate-50 border border-slate-100 rounded-2xl flex items-center justify-between">
                         <div className="flex items-center gap-4">
                            <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center text-amber-500 shadow-sm border border-slate-100"><AlertTriangle size={22}/></div>
                            <div>
                               <div className="flex items-center gap-2">
                                  <span className="text-lg font-bold text-slate-900">{reports[activeReportIdx].risk_assessment.risk_label}</span>
                                  <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-[8px] font-bold rounded uppercase">
                                    {reports[activeReportIdx].risk_assessment.severity} RISK
                                  </span>
                               </div>
                               <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Confidence Score: {Math.round(reports[activeReportIdx].risk_assessment.confidence_score * 100)}%</p>
                            </div>
                         </div>
                      </div>
                    </header>

                    <div className="p-8 space-y-6 overflow-y-auto custom-scrollbar flex-1 max-h-[50vh]">
                      <div className="border border-slate-100 rounded-2xl overflow-hidden shadow-sm">
                        <button onClick={() => setExpandedSections(s => ({...s, profile: !s.profile}))} className="w-full px-6 py-4 flex items-center justify-between bg-slate-50/50 border-b border-slate-100">
                          <div className="flex items-center gap-3 text-blue-600 font-bold text-sm"><Dna size={18}/> Pharmacogenomic Profile</div>
                          <ChevronUp className={`transition-transform duration-300 ${!expandedSections.profile ? 'rotate-180' : ''}`} size={18}/>
                        </button>
                        <AnimatePresence>
                          {expandedSections.profile && (
                            <motion.div initial={{height:0}} animate={{height:'auto'}} exit={{height:0}} className="overflow-hidden bg-white">
                              <div className="p-6 space-y-6">
                                <div className="grid grid-cols-2 gap-4">
                                  <div className="p-4 bg-slate-50 rounded-xl">
                                    <span className="block text-[9px] font-bold text-slate-400 uppercase mb-1 tracking-widest">Primary Gene</span>
                                    <span className="text-xl font-bold text-slate-900">{reports[activeReportIdx].pharmacogenomic_profile.primary_gene}</span>
                                  </div>
                                  <div className="p-4 bg-slate-50 rounded-xl">
                                    <span className="block text-[9px] font-bold text-slate-400 uppercase mb-1 tracking-widest">Phenotype</span>
                                    <span className="text-xl font-bold text-slate-900">{reports[activeReportIdx].pharmacogenomic_profile.phenotype}</span>
                                  </div>
                                </div>
                                <div>
                                  <span className="block text-[9px] font-bold text-slate-400 uppercase mb-1.5 tracking-widest">Diplotype Translation</span>
                                  <span className="text-2xl font-black text-slate-900">{reports[activeReportIdx].pharmacogenomic_profile.diplotype}</span>
                                </div>
                                <div>
                                  <span className="block text-[9px] font-bold text-slate-400 uppercase mb-3 tracking-widest">Detected Variants Mapped</span>
                                  <div className="space-y-2">
                                    {reports[activeReportIdx].pharmacogenomic_profile.detected_variants.length === 0 ? (
                                      <div className="p-4 bg-slate-50 text-slate-400 text-xs italic rounded-xl">No variants detected. Standard wild-type dosing matches.</div>
                                    ) : (
                                      reports[activeReportIdx].pharmacogenomic_profile.detected_variants.map((v, idx) => (
                                        <div key={idx} className="px-4 py-3 bg-blue-50/50 border border-blue-100/50 rounded-xl flex items-center justify-between">
                                          <div className="flex items-center gap-3">
                                            <span className="text-[12px] font-bold text-blue-600">{v.rsid}</span>
                                            <span className="text-[11px] font-bold text-slate-800">{v.starAllele} <span className="font-normal text-slate-500">— {v.significance}</span></span>
                                          </div>
                                          <span className="px-2 py-0.5 bg-blue-100 text-blue-700 text-[8px] font-bold rounded uppercase">
                                            Genotype: {v.genotype}
                                          </span>
                                        </div>
                                      ))
                                    )}
                                  </div>
                                </div>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>

                      <div className="border border-slate-100 rounded-2xl overflow-hidden shadow-sm">
                        <button onClick={() => setExpandedSections(s => ({...s, recommendation: !s.recommendation}))} className="w-full px-6 py-4 flex items-center justify-between bg-slate-50/50 border-b border-slate-100">
                          <div className="flex items-center gap-3 text-emerald-600 font-bold text-sm"><ShieldCheck size={18}/> Dosing Recommendations</div>
                          <ChevronUp className={`transition-transform duration-300 ${!expandedSections.recommendation ? 'rotate-180' : ''}`} size={18}/>
                        </button>
                        <AnimatePresence>
                          {expandedSections.recommendation && (
                            <motion.div initial={{height:0}} animate={{height:'auto'}} exit={{height:0}} className="overflow-hidden bg-white">
                              <div className="p-6 bg-emerald-50/20 border-l-[6px] border-emerald-500">
                                <h4 className="text-lg font-bold text-slate-900 mb-2">{reports[activeReportIdx].clinical_recommendation.dosingGuideline}</h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6 pt-6 border-t border-emerald-100/50 text-xs">
                                  <div>
                                    <span className="block text-[9px] font-bold text-slate-400 uppercase mb-1">Primary Clinical Action</span>
                                    <span className="font-bold text-slate-800 uppercase bg-emerald-100/50 px-2 py-0.5 rounded">{reports[activeReportIdx].clinical_recommendation.action}</span>
                                  </div>
                                  <div>
                                    <span className="block text-[9px] font-bold text-slate-400 uppercase mb-1">Evidence Guideline (CPIC)</span>
                                    <p className="text-slate-600 font-medium leading-relaxed">{reports[activeReportIdx].clinical_recommendation.cpicGuideline}</p>
                                  </div>
                                </div>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>

                      <div className="border border-slate-100 rounded-2xl overflow-hidden shadow-sm">
                        <button onClick={() => setExpandedSections(s => ({...s, rationale: !s.rationale}))} className="w-full px-6 py-4 flex items-center justify-between bg-slate-50/50 border-b border-slate-100">
                          <div className="flex items-center gap-3 text-purple-600 font-bold text-sm"><BrainCircuit size={18}/> AI Rationale (Google Gemini)</div>
                          <ChevronUp className={`transition-transform duration-300 ${!expandedSections.rationale ? 'rotate-180' : ''}`} size={18}/>
                        </button>
                        <AnimatePresence>
                          {expandedSections.rationale && (
                            <motion.div initial={{height:0}} animate={{height:'auto'}} exit={{height:0}} className="overflow-hidden bg-white">
                              <div className="p-6 space-y-5 text-xs">
                                <div className="p-4 bg-purple-50/20 border-l-[4px] border-purple-500 rounded-r-xl">
                                  <span className="block text-[9px] font-bold text-purple-600 uppercase mb-1.5 tracking-wider">Clinical Synthesis</span>
                                  <p className="text-slate-700 leading-relaxed font-semibold">{reports[activeReportIdx].llm_generated_explanation.summary}</p>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                                  <div className="p-4 bg-slate-50 rounded-xl">
                                    <span className="block text-[9px] font-bold text-slate-400 uppercase mb-1.5 tracking-wider">Molecular Mechanism</span>
                                    <p className="text-slate-600 leading-relaxed font-medium">{reports[activeReportIdx].llm_generated_explanation.mechanism}</p>
                                  </div>
                                  <div className="p-4 bg-slate-50 rounded-xl">
                                    <span className="block text-[9px] font-bold text-slate-400 uppercase mb-1.5 tracking-wider">Clinical Consequence</span>
                                    <p className="text-slate-600 leading-relaxed font-medium">{reports[activeReportIdx].llm_generated_explanation.clinicalImpact}</p>
                                  </div>
                                </div>
                                <div className="p-4 bg-slate-50 rounded-xl">
                                  <span className="block text-[9px] font-bold text-slate-400 uppercase mb-1.5 tracking-wider">Variant Specific Details</span>
                                  <p className="text-slate-600 leading-relaxed font-medium">{reports[activeReportIdx].llm_generated_explanation.variantDetails}</p>
                                </div>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </section>
        </div>
      </main>

      {renderFooter()}
    </div>
  );

  const renderContent = () => {
    switch (view) {
      case 'landing': return renderLanding();
      case 'analyzer': return renderAnalyzer();
      case 'patients': return renderPatientsView();
      case 'dashboard': return renderDashboard();
      case 'documentation': return renderDocumentation();
      case 'privacy': return renderPrivacy();
      case 'terms': return renderTerms();
      default: return renderLanding();
    }
  };

  return (
    <>
      <div className="relative">
        {renderContent()}
      </div>

      <AnimatePresence>
        {showJsonModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-sm">
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} className="bg-white w-full max-w-4xl h-[80vh] rounded-3xl overflow-hidden flex flex-col shadow-2xl">
              <div className="p-6 border-b flex justify-between items-center bg-slate-50">
                <div className="flex items-center gap-3 font-bold text-slate-800 uppercase tracking-widest text-xs"><FileJson size={20}/> Diagnostic SQL Record Object</div>
                <div className="flex gap-2">
                   <button onClick={() => { navigator.clipboard.writeText(JSON.stringify(showJsonModal, null, 2)); addToast("Copied to clipboard", "success"); }} className="px-4 py-2 bg-blue-600 text-white rounded-xl text-[10px] font-bold uppercase tracking-widest">Copy JSON</button>
                   <button onClick={() => setShowJsonModal(null)} className="p-2 hover:bg-slate-200 rounded-lg"><X size={20}/></button>
                </div>
              </div>
              <div className="flex-1 overflow-auto bg-[#0a1124] p-8 custom-scrollbar">
                <pre className="text-cyan-400/80 font-mono text-[11px] leading-relaxed whitespace-pre-wrap">{JSON.stringify(showJsonModal, null, 2)}</pre>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <div className="fixed top-20 right-6 z-[110] pointer-events-none flex flex-col gap-3">
        <AnimatePresence>
          {toasts.map(toast => (
            <motion.div key={toast.id} initial={{ opacity: 0, x: 50, scale: 0.9 }} animate={{ opacity: 1, x: 0, scale: 1 }} exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }} className={`pointer-events-auto min-w-[300px] max-w-md p-4 rounded-2xl shadow-xl border flex items-center gap-3 bg-white ${toast.type === 'error' ? 'border-rose-100 text-rose-700' : toast.type === 'success' ? 'border-emerald-100 text-emerald-700' : 'border-blue-100 text-blue-700'}`}>
              <div className={`p-2 rounded-xl ${toast.type === 'error' ? 'bg-rose-50 text-rose-500' : toast.type === 'success' ? 'bg-emerald-50 text-emerald-500' : 'bg-blue-50 text-blue-500'}`}>{toast.type === 'error' ? <AlertTriangle size={18}/> : toast.type === 'success' ? <CheckCircle2 size={18}/> : <Info size={18}/>}</div>
              <p className="text-[12px] font-semibold flex-1">{toast.message}</p>
              <button onClick={() => setToasts(prev => prev.filter(t => t.id !== toast.id))} className="p-1 hover:bg-slate-50 rounded-lg text-slate-400"><X size={14} /></button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </>
  );
}
