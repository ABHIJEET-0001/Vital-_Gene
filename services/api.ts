import { PGxReport } from '../types';
import { processPGx as localProcessPGx } from './pgxEngine';

const API_BASE = 'http://localhost:5000/api';

export interface DashboardStats {
  totalAnalyses: number;
  highRiskCount: number;
  topDrug: string;
  lastAnalysis: string | null;
  riskDistribution: {
    Safe: number;
    'Adjust Dosage': number;
    Toxic: number;
    Ineffective: number;
    Unknown: number;
  };
  recentAnalyses: PGxReport[];
}

export interface Patient {
  id: string;
  created_at: string;
  total_reports: number;
  max_severity: 'none' | 'low' | 'moderate' | 'high' | 'critical';
}

// Track backend online state
let isBackendOnline = false;
let healthCheckPromise: Promise<boolean> | null = null;

export async function checkBackendHealth(): Promise<boolean> {
  if (healthCheckPromise) return healthCheckPromise;

  healthCheckPromise = (async () => {
    try {
      const res = await fetch(`${API_BASE}/health`, { signal: AbortSignal.timeout(1500) });
      if (res.ok) {
        const data = await res.json();
        isBackendOnline = data.status === 'healthy';
        return isBackendOnline;
      }
    } catch (e) {
      // Backend offline
    }
    isBackendOnline = false;
    return false;
  })();

  // Reset health check promise after 10 seconds to allow retry
  setTimeout(() => {
    healthCheckPromise = null;
  }, 10000);

  return healthCheckPromise;
}

export function isOffline() {
  return !isBackendOnline;
}

export async function analyzeVCF(
  vcfContent: string,
  drugs: string[],
  filename?: string
): Promise<PGxReport[]> {
  const online = await checkBackendHealth();
  
  if (online) {
    try {
      const res = await fetch(`${API_BASE}/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vcfContent, drugs: drugs.join(','), filename })
      });
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Server processing error');
      }
      return await res.json();
    } catch (error) {
      console.error('Backend analysis failed, falling back to local processing:', error);
    }
  }

  // Fallback to local processing in browser
  console.log('Using local client-side pharmacogenomics engine (Offline Mode)');
  return await localProcessPGx(vcfContent, drugs.join(','));
}

export async function getStats(): Promise<DashboardStats> {
  const online = await checkBackendHealth();

  if (online) {
    try {
      const res = await fetch(`${API_BASE}/stats`);
      if (res.ok) return await res.json();
    } catch (e) {
      console.error('Failed to fetch backend stats:', e);
    }
  }

  // Fallback to LocalStorage stats
  const localHistory = getLocalHistory();
  const highRiskCount = localHistory.filter(r => 
    r.risk_assessment.severity === 'high' || r.risk_assessment.severity === 'critical'
  ).length;

  const drugFreq: Record<string, number> = {};
  localHistory.forEach(r => {
    drugFreq[r.drug] = (drugFreq[r.drug] || 0) + 1;
  });
  const topDrug = Object.entries(drugFreq).sort((a, b) => b[1] - a[1])[0]?.[0] || 'N/A';

  return {
    totalAnalyses: localHistory.length,
    highRiskCount,
    topDrug,
    lastAnalysis: localHistory[0]?.timestamp || null,
    riskDistribution: {
      Safe: localHistory.filter(r => r.risk_assessment.risk_label === 'Safe').length,
      'Adjust Dosage': localHistory.filter(r => r.risk_assessment.risk_label === 'Adjust Dosage').length,
      Toxic: localHistory.filter(r => r.risk_assessment.risk_label === 'Toxic').length,
      Ineffective: localHistory.filter(r => r.risk_assessment.risk_label === 'Ineffective').length,
      Unknown: localHistory.filter(r => r.risk_assessment.risk_label === 'Unknown').length,
    },
    recentAnalyses: localHistory.slice(0, 10)
  };
}

export async function getPatients(): Promise<Patient[]> {
  const online = await checkBackendHealth();

  if (online) {
    try {
      const res = await fetch(`${API_BASE}/patients`);
      if (res.ok) return await res.json();
    } catch (e) {
      console.error('Failed to fetch backend patients:', e);
    }
  }

  // Local mode patient mapping from history
  const localHistory = getLocalHistory();
  const patientsMap: Record<string, { id: string, created_at: string, count: number, maxSeverity: string }> = {};

  localHistory.forEach(r => {
    const pId = r.patient_id || 'PATIENT_PROFILED';
    if (!patientsMap[pId]) {
      patientsMap[pId] = {
        id: pId,
        created_at: r.timestamp,
        count: 0,
        maxSeverity: 'none'
      };
    }
    patientsMap[pId].count++;
    
    // update max severity
    const severities = ['none', 'low', 'moderate', 'high', 'critical'];
    const currentMaxIdx = severities.indexOf(patientsMap[pId].maxSeverity);
    const newIdx = severities.indexOf(r.risk_assessment.severity || 'none');
    if (newIdx > currentMaxIdx) {
      patientsMap[pId].maxSeverity = r.risk_assessment.severity;
    }
  });

  return Object.values(patientsMap).map(p => ({
    id: p.id,
    created_at: p.created_at,
    total_reports: p.count,
    max_severity: p.maxSeverity as any
  }));
}

export async function getPatientHistory(patientId: string): Promise<PGxReport[]> {
  const online = await checkBackendHealth();

  if (online) {
    try {
      const res = await fetch(`${API_BASE}/patients/${encodeURIComponent(patientId)}/history`);
      if (res.ok) return await res.json();
    } catch (e) {
      console.error(`Failed to fetch history for patient ${patientId}:`, e);
    }
  }

  // Filter local history
  const localHistory = getLocalHistory();
  return localHistory.filter(r => (r.patient_id || 'PATIENT_PROFILED') === patientId);
}

export async function addPatient(patientId: string): Promise<any> {
  const online = await checkBackendHealth();

  if (online) {
    try {
      const res = await fetch(`${API_BASE}/patients/add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ patientId })
      });
      if (res.ok) return await res.json();
    } catch (e) {
      console.error('Failed to add manual patient to backend:', e);
    }
  }

  // Local fallback: add a mock report or handle in-state
  return { id: patientId, created_at: new Date().toISOString() };
}

export async function clearAllHistory(): Promise<any> {
  const online = await checkBackendHealth();

  if (online) {
    try {
      const res = await fetch(`${API_BASE}/history`, { method: 'DELETE' });
      if (res.ok) return await res.json();
    } catch (e) {
      console.error('Failed to clear backend database:', e);
    }
  }

  // Clear local storage
  localStorage.removeItem('pharma_guard_analysis_history');
  return { message: 'Local storage wiped' };
}

function getLocalHistory(): PGxReport[] {
  try {
    const data = localStorage.getItem('pharma_guard_analysis_history');
    return data ? JSON.parse(data) : [];
  } catch (e) {
    return [];
  }
}
