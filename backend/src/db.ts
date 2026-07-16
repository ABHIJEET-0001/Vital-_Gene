import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:postgrespassword@localhost:5432/vitalgene';

export const pool = new Pool({
  connectionString,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
});

export async function initDb() {
  const client = await pool.connect();
  try {
    console.log('Connecting to PostgreSQL and running table initializations...');

    // 1. Patients table
    await client.query(`
      CREATE TABLE IF NOT EXISTS patients (
        id VARCHAR(255) PRIMARY KEY,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 2. VCF Files table
    await client.query(`
      CREATE TABLE IF NOT EXISTS vcf_files (
        id SERIAL PRIMARY KEY,
        patient_id VARCHAR(255) REFERENCES patients(id) ON DELETE CASCADE,
        filename VARCHAR(255),
        content TEXT,
        uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // 3. PGx Reports table
    await client.query(`
      CREATE TABLE IF NOT EXISTS pgx_reports (
        id SERIAL PRIMARY KEY,
        patient_id VARCHAR(255) REFERENCES patients(id) ON DELETE CASCADE,
        drug VARCHAR(100) NOT NULL,
        timestamp TIMESTAMP NOT NULL,
        risk_label VARCHAR(100) NOT NULL,
        severity VARCHAR(100) NOT NULL,
        confidence_score NUMERIC NOT NULL,
        primary_gene VARCHAR(100) NOT NULL,
        phenotype VARCHAR(100) NOT NULL,
        diplotype VARCHAR(100) NOT NULL,
        action VARCHAR(255) NOT NULL,
        dosing_guideline TEXT NOT NULL,
        monitoring_advice TEXT,
        alternative_drugs JSONB DEFAULT '[]'::jsonb,
        cpic_guideline TEXT,
        evidence_level VARCHAR(50),
        llm_summary TEXT,
        llm_mechanism TEXT,
        llm_clinical_impact TEXT,
        llm_variant_details TEXT,
        llm_references JSONB DEFAULT '[]'::jsonb,
        quality_metrics JSONB NOT NULL
      );
    `);

    // 4. Detected Variants table
    await client.query(`
      CREATE TABLE IF NOT EXISTS detected_variants (
        id SERIAL PRIMARY KEY,
        report_id INTEGER REFERENCES pgx_reports(id) ON DELETE CASCADE,
        rsid VARCHAR(100) NOT NULL,
        gene VARCHAR(100) NOT NULL,
        position INTEGER NOT NULL,
        ref_allele VARCHAR(50) NOT NULL,
        alt_allele VARCHAR(50) NOT NULL,
        star_allele VARCHAR(50) NOT NULL,
        significance VARCHAR(255) NOT NULL,
        genotype VARCHAR(50) NOT NULL,
        chromosome VARCHAR(50) NOT NULL
      );
    `);

    console.log('Database tables successfully verified/created.');
  } catch (error) {
    console.error('Error initializing PostgreSQL tables:', error);
    throw error;
  } finally {
    client.release();
  }
}
