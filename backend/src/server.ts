import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { pool, initDb } from './db.js';
import { processPGx } from './pgxEngine.js';

dotenv.config();

const app = express();
const port = process.env.PORT || 5000;

app.use(cors({
  origin: '*', // For development, allow any origin. Can narrow down in production.
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS']
}));

app.use(express.json({ limit: '10mb' })); // Allow large VCF payloads

// DB Sanity check / Health endpoint
app.get('/api/health', async (req, res) => {
  try {
    const dbCheck = await pool.query('SELECT NOW()');
    res.json({
      status: 'healthy',
      database: 'connected',
      timestamp: dbCheck.rows[0].now,
      serverTime: new Date()
    });
  } catch (error: any) {
    res.status(500).json({
      status: 'unhealthy',
      database: 'disconnected',
      error: error.message
    });
  }
});

// Run analysis endpoint
app.post('/api/analyze', async (req, res) => {
  const { vcfContent, drugs, filename } = req.body;

  if (!vcfContent) {
    return res.status(400).json({ error: 'Missing vcfContent in request body' });
  }
  if (!drugs) {
    return res.status(400).json({ error: 'Missing drugs list in request body' });
  }

  const client = await pool.connect();
  try {
    // Process the genomic data using the CPIC engine and Gemini
    const reports = await processPGx(vcfContent, drugs);

    if (reports.length === 0) {
      return res.status(400).json({ error: 'No reports generated. Please check selected drugs or VCF contents.' });
    }

    const patientId = reports[0].patient_id || 'PATIENT_PROFILED';

    // Start Transaction
    await client.query('BEGIN');

    // 1. Insert patient if not exists
    await client.query(
      `INSERT INTO patients (id) VALUES ($1) ON CONFLICT (id) DO NOTHING`,
      [patientId]
    );

    // 2. Save VCF file content
    await client.query(
      `INSERT INTO vcf_files (patient_id, filename, content) VALUES ($1, $2, $3)`,
      [patientId, filename || 'uploaded_sample.vcf', vcfContent]
    );

    // 3. Save each report and its variants
    for (const report of reports) {
      const reportRes = await client.query(
        `INSERT INTO pgx_reports (
          patient_id, drug, timestamp, risk_label, severity, confidence_score,
          primary_gene, phenotype, diplotype, action, dosing_guideline,
          monitoring_advice, alternative_drugs, cpic_guideline, evidence_level,
          llm_summary, llm_mechanism, llm_clinical_impact, llm_variant_details,
          llm_references, quality_metrics
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
        RETURNING id`,
        [
          patientId,
          report.drug,
          report.timestamp,
          report.risk_assessment.risk_label,
          report.risk_assessment.severity,
          report.risk_assessment.confidence_score,
          report.pharmacogenomic_profile.primary_gene,
          report.pharmacogenomic_profile.phenotype,
          report.pharmacogenomic_profile.diplotype,
          report.clinical_recommendation.action,
          report.clinical_recommendation.dosingGuideline,
          report.clinical_recommendation.monitoringAdvice,
          JSON.stringify(report.clinical_recommendation.alternativeDrugs),
          report.clinical_recommendation.cpicGuideline,
          report.clinical_recommendation.evidenceLevel,
          report.llm_generated_explanation.summary,
          report.llm_generated_explanation.mechanism,
          report.llm_generated_explanation.clinicalImpact,
          report.llm_generated_explanation.variantDetails,
          JSON.stringify(report.llm_generated_explanation.references || []),
          JSON.stringify(report.quality_metrics)
        ]
      );

      const reportDbId = reportRes.rows[0].id;

      // 4. Save detected variants
      for (const variant of report.pharmacogenomic_profile.detected_variants) {
        await client.query(
          `INSERT INTO detected_variants (
            report_id, rsid, gene, position, ref_allele, alt_allele,
            star_allele, significance, genotype, chromosome
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [
            reportDbId,
            variant.rsid,
            variant.gene,
            variant.position,
            variant.ref,
            variant.alt,
            variant.starAllele,
            variant.significance,
            variant.genotype || '0/0',
            variant.chromosome || 'unknown'
          ]
        );
      }
    }

    await client.query('COMMIT');
    res.json(reports);
  } catch (error: any) {
    await client.query('ROLLBACK');
    console.error('Error during analysis API execution:', error);
    res.status(500).json({ error: error.message || 'An error occurred during VCF sequencing.' });
  } finally {
    client.release();
  }
});

// Get stats for system dashboard
app.get('/api/stats', async (req, res) => {
  try {
    const totalRes = await pool.query('SELECT COUNT(*) FROM pgx_reports');
    const highRiskRes = await pool.query(
      `SELECT COUNT(*) FROM pgx_reports WHERE severity IN ('high', 'critical')`
    );
    const topDrugRes = await pool.query(
      `SELECT drug, COUNT(*) as qty FROM pgx_reports GROUP BY drug ORDER BY qty DESC LIMIT 1`
    );
    const riskDistRes = await pool.query(
      `SELECT risk_label, COUNT(*) as count FROM pgx_reports GROUP BY risk_label`
    );
    
    // Fetch last 10 reports with details
    const recentRes = await pool.query(
      `SELECT r.*, 
       COALESCE((
         SELECT json_agg(v.*) 
         FROM detected_variants v 
         WHERE v.report_id = r.id
       ), '[]'::json) as detected_variants
       FROM pgx_reports r 
       ORDER BY r.timestamp DESC LIMIT 10`
    );

    const totalAnalyses = parseInt(totalRes.rows[0].count);
    const highRiskCount = parseInt(highRiskRes.rows[0].count);
    const topDrug = topDrugRes.rows.length > 0 ? topDrugRes.rows[0].drug : 'N/A';

    const riskDistribution: Record<string, number> = {
      Safe: 0,
      'Adjust Dosage': 0,
      Toxic: 0,
      Ineffective: 0,
      Unknown: 0
    };

    riskDistRes.rows.forEach(row => {
      if (row.risk_label in riskDistribution) {
        riskDistribution[row.risk_label] = parseInt(row.count);
      }
    });

    const recentAnalyses = recentRes.rows.map(row => ({
      patient_id: row.patient_id,
      drug: row.drug,
      timestamp: row.timestamp,
      risk_assessment: {
        risk_label: row.risk_label,
        severity: row.severity,
        confidence_score: parseFloat(row.confidence_score)
      },
      pharmacogenomic_profile: {
        primary_gene: row.primary_gene,
        phenotype: row.phenotype,
        diplotype: row.diplotype,
        detected_variants: row.detected_variants.map((v: any) => ({
          rsid: v.rsid,
          gene: v.gene,
          position: v.position,
          ref: v.ref_allele,
          alt: v.alt_allele,
          starAllele: v.star_allele,
          significance: v.significance,
          genotype: v.genotype,
          chromosome: v.chromosome
        }))
      },
      clinical_recommendation: {
        action: row.action,
        dosingGuideline: row.dosing_guideline,
        monitoringAdvice: row.monitoring_advice,
        alternativeDrugs: row.alternative_drugs,
        cpicGuideline: row.cpic_guideline,
        evidenceLevel: row.evidence_level
      },
      llm_generated_explanation: {
        summary: row.llm_summary,
        mechanism: row.llm_mechanism,
        clinicalImpact: row.llm_clinical_impact,
        variantDetails: row.llm_variant_details,
        references: row.llm_references
      },
      quality_metrics: row.quality_metrics
    }));

    const lastAnalysis = recentAnalyses.length > 0 ? recentAnalyses[0].timestamp : null;

    res.json({
      totalAnalyses,
      highRiskCount,
      topDrug,
      lastAnalysis,
      riskDistribution,
      recentAnalyses
    });
  } catch (error: any) {
    console.error('Error fetching dashboard statistics:', error);
    res.status(500).json({ error: error.message });
  }
});

// List all patients with report summaries
app.get('/api/patients', async (req, res) => {
  try {
    const query = `
      SELECT p.id, p.created_at, 
      COUNT(r.id) as total_reports,
      COALESCE(MAX(CASE 
        WHEN r.severity = 'critical' THEN 4
        WHEN r.severity = 'high' THEN 3
        WHEN r.severity = 'moderate' THEN 2
        WHEN r.severity = 'low' THEN 1
        ELSE 0
      END), 0) as max_severity_num
      FROM patients p
      LEFT JOIN pgx_reports r ON p.id = r.patient_id
      GROUP BY p.id, p.created_at
      ORDER BY p.created_at DESC
    `;
    const result = await pool.query(query);

    const severityMap = ['none', 'low', 'moderate', 'high', 'critical'];

    const patients = result.rows.map(row => ({
      id: row.id,
      created_at: row.created_at,
      total_reports: parseInt(row.total_reports),
      max_severity: severityMap[row.max_severity_num]
    }));

    res.json(patients);
  } catch (error: any) {
    console.error('Error listing patients:', error);
    res.status(500).json({ error: error.message });
  }
});

// Get patient analysis history
app.get('/api/patients/:id/history', async (req, res) => {
  const patientId = req.params.id;
  try {
    const query = `
      SELECT r.*, 
      COALESCE((
        SELECT json_agg(v.*) 
        FROM detected_variants v 
        WHERE v.report_id = r.id
      ), '[]'::json) as detected_variants
      FROM pgx_reports r
      WHERE r.patient_id = $1
      ORDER BY r.timestamp DESC
    `;
    const result = await pool.query(query, [patientId]);

    const reports = result.rows.map(row => ({
      patient_id: row.patient_id,
      drug: row.drug,
      timestamp: row.timestamp,
      risk_assessment: {
        risk_label: row.risk_label,
        severity: row.severity,
        confidence_score: parseFloat(row.confidence_score)
      },
      pharmacogenomic_profile: {
        primary_gene: row.primary_gene,
        phenotype: row.phenotype,
        diplotype: row.diplotype,
        detected_variants: row.detected_variants.map((v: any) => ({
          rsid: v.rsid,
          gene: v.gene,
          position: v.position,
          ref: v.ref_allele,
          alt: v.alt_allele,
          starAllele: v.star_allele,
          significance: v.significance,
          genotype: v.genotype,
          chromosome: v.chromosome
        }))
      },
      clinical_recommendation: {
        action: row.action,
        dosingGuideline: row.dosing_guideline,
        monitoringAdvice: row.monitoring_advice,
        alternativeDrugs: row.alternative_drugs,
        cpicGuideline: row.cpic_guideline,
        evidenceLevel: row.evidence_level
      },
      llm_generated_explanation: {
        summary: row.llm_summary,
        mechanism: row.llm_mechanism,
        clinicalImpact: row.llm_clinical_impact,
        variantDetails: row.llm_variant_details,
        references: row.llm_references
      },
      quality_metrics: row.quality_metrics
    }));

    res.json(reports);
  } catch (error: any) {
    console.error(`Error loading history for patient ${patientId}:`, error);
    res.status(500).json({ error: error.message });
  }
});

// Add patient profile manually
app.post('/api/patients/add', async (req, res) => {
  const { patientId } = req.body;
  if (!patientId) {
    return res.status(400).json({ error: 'Patient ID is required' });
  }

  try {
    const check = await pool.query('SELECT * FROM patients WHERE id = $1', [patientId]);
    if (check.rows.length > 0) {
      return res.status(409).json({ error: 'Patient already exists' });
    }
    await pool.query('INSERT INTO patients (id) VALUES ($1)', [patientId]);
    res.status(201).json({ id: patientId, created_at: new Date() });
  } catch (error: any) {
    console.error('Error adding patient profile manually:', error);
    res.status(500).json({ error: error.message });
  }
});

// Reset logs / clear history
app.delete('/api/history', async (req, res) => {
  try {
    // Cascade triggers automatic wipe of child rows
    await pool.query('TRUNCATE TABLE patients CASCADE');
    res.json({ message: 'Database database and patient history successfully truncated.' });
  } catch (error: any) {
    console.error('Failed to clear database history:', error);
    res.status(500).json({ error: error.message });
  }
});

// Start Express server and verify DB connection
app.listen(port, async () => {
  console.log(`VitalGene AI Backend listening at http://localhost:${port}`);
  try {
    await initDb();
  } catch (err) {
    console.error('CRITICAL ERROR: Unable to boot database connection. Ensure PostgreSQL is active.', err);
  }
});
