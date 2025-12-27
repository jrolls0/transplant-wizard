/**
 * Transplant Wizard - Document Processor Lambda
 * 
 * Smart Extraction Pipeline for processing uploaded patient documents.
 * Triggered by S3 ObjectCreated events on the patient documents bucket.
 * 
 * Workflow:
 * 1. Receive S3 event with uploaded document
 * 2. Extract document metadata (type, patient ID) from S3 object metadata
 * 3. For "current_labs" documents: Run AWS Textract Queries to extract lab values
 * 4. For all other documents: Skip extraction
 * 5. Save to document_staging table with status PENDING_REVIEW
 */

const { TextractClient, AnalyzeDocumentCommand } = require('@aws-sdk/client-textract');
const { S3Client, GetObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');
const { Pool } = require('pg');

// Initialize clients (let for test injection)
let textractClient = new TextractClient({ region: process.env.AWS_REGION || 'us-east-1' });
let s3Client = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });

// Database connection pool
let pool;
const getPool = () => {
    if (!pool) {
        pool = new Pool({
            host: process.env.DB_HOST,
            database: process.env.DB_NAME,
            user: process.env.DB_USER,
            password: process.env.DB_PASSWORD,
            port: parseInt(process.env.DB_PORT || '5432'),
            ssl: { rejectUnauthorized: false },
            max: 5,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 10000
        });
    }
    return pool;
};

// Confidence thresholds
const CONFIDENCE_LOW = parseFloat(process.env.CONFIDENCE_THRESHOLD_LOW || '50');
const CONFIDENCE_MEDIUM = parseFloat(process.env.CONFIDENCE_THRESHOLD_MEDIUM || '70');

// Document types that support extraction
const EXTRACTABLE_DOCUMENT_TYPES = ['current_labs'];

// Lab metrics to extract with their Textract queries
const LAB_QUERIES = [
    { key: 'potassium', query: 'What is the Potassium?' },
    { key: 'bun', query: 'What is the Blood Urea Nitrogen or BUN?' },
    { key: 'phosphorus', query: 'What is the Phosphorus?' },
    { key: 'hemoglobin', query: 'What is the Hemoglobin or Hb?' },
    { key: 'platelets', query: 'What is the Platelets or PLT?' },
    { key: 'pt', query: 'What is the Prothrombin Time or PT?' },
    { key: 'inr', query: 'What is the International Normalized Ratio or INR?' },
    { key: 'ptt', query: 'What is the Partial Thromboplastin Time or PTT?' },
    { key: 'pth', query: 'What is the Parathyroid Hormone or PTH?' },
    { key: 'a1c', query: 'What is the Hemoglobin A1c or A1c?' },
    { key: 'albumin', query: 'What is the Albumin?' },
    { key: 'total_bilirubin', query: 'What is the Total Bilirubin?' },
    { key: 'total_cholesterol', query: 'What is the Total Cholesterol?' },
    { key: 'urine_protein', query: 'What is the Urine Protein?' },
    { key: 'urine_rbc', query: 'What is the Urine Red Cell Count?' },
    { key: 'urine_wbc', query: 'What is the Urine White Cell Count?' },
    { key: 'urine_hemoglobin', query: 'What is the Urine Hemoglobin?' },
    { key: 'lab_date', query: 'What is the date of the lab work or collection date?' }
];

/**
 * Main Lambda handler
 */
exports.handler = async (event) => {
    console.log('📄 Document Processor Lambda invoked');
    console.log('Event:', JSON.stringify(event, null, 2));
    
    const results = [];
    
    for (const record of event.Records) {
        try {
            const result = await processS3Record(record);
            results.push(result);
        } catch (error) {
            console.error('❌ Error processing record:', error);
            results.push({
                success: false,
                error: error.message,
                s3Key: record.s3?.object?.key
            });
        }
    }
    
    console.log('✅ Processing complete:', JSON.stringify(results, null, 2));
    return { statusCode: 200, body: JSON.stringify(results) };
};

/**
 * Process a single S3 record
 */
async function processS3Record(record) {
    const bucket = record.s3.bucket.name;
    const key = decodeURIComponent(record.s3.object.key.replace(/\+/g, ' '));
    
    console.log(`📁 Processing: s3://${bucket}/${key}`);
    
    // Get object metadata
    const metadata = await getS3ObjectMetadata(bucket, key);
    console.log('📋 Metadata:', JSON.stringify(metadata, null, 2));
    
    // Extract patient ID and document type from key path or metadata
    // Expected path: patients/{patientId}/documents/{documentType}/{groupId}/{filename}
    const pathParts = key.split('/');
    const patientId = metadata['patient-id'] || pathParts[1];
    const documentType = metadata['document-type'] || pathParts[3];
    
    if (!patientId || !documentType) {
        throw new Error(`Missing required metadata: patientId=${patientId}, documentType=${documentType}`);
    }
    
    console.log(`👤 Patient: ${patientId}, 📄 Type: ${documentType}`);
    
    // Determine if we should extract data
    let extractedData = null;
    let labDate = null;
    let extractionError = null;
    
    if (EXTRACTABLE_DOCUMENT_TYPES.includes(documentType)) {
        console.log('🔬 Running Textract extraction for Labs document...');
        try {
            const extraction = await extractLabData(bucket, key);
            extractedData = extraction.data;
            labDate = extraction.labDate;
            console.log('✅ Extraction complete:', JSON.stringify(extractedData, null, 2));
        } catch (error) {
            console.error('⚠️ Extraction failed:', error.message);
            extractionError = error.message;
            // Continue - document will be flagged for manual entry
        }
    } else {
        console.log(`⏭️ Skipping extraction for document type: ${documentType}`);
    }
    
    // Get patient_document_id if it exists
    const patientDocumentId = await findPatientDocumentId(patientId, key);
    
    // Save to document_staging table
    const stagingId = await saveToStaging({
        patientId,
        patientDocumentId,
        documentType,
        s3Bucket: bucket,
        s3Key: key,
        extractedData,
        labDate,
        extractionError
    });
    
    return {
        success: true,
        stagingId,
        patientId,
        documentType,
        hasExtractedData: extractedData !== null,
        extractionError
    };
}

/**
 * Get S3 object metadata
 */
async function getS3ObjectMetadata(bucket, key) {
    const command = new HeadObjectCommand({ Bucket: bucket, Key: key });
    const response = await s3Client.send(command);
    return response.Metadata || {};
}

/**
 * Get S3 object as bytes for Textract
 */
async function getS3ObjectBytes(bucket, key) {
    const command = new GetObjectCommand({ Bucket: bucket, Key: key });
    const response = await s3Client.send(command);
    const chunks = [];
    for await (const chunk of response.Body) {
        chunks.push(chunk);
    }
    return Buffer.concat(chunks);
}

/**
 * Extract lab data using AWS Textract Queries
 */
async function extractLabData(bucket, key) {
    // Get document bytes
    const documentBytes = await getS3ObjectBytes(bucket, key);
    
    // Build Textract queries
    const queries = LAB_QUERIES.map(q => ({
        Text: q.query,
        Alias: q.key
    }));
    
    // Call Textract AnalyzeDocument with Queries
    const command = new AnalyzeDocumentCommand({
        Document: {
            Bytes: documentBytes
        },
        FeatureTypes: ['QUERIES'],
        QueriesConfig: {
            Queries: queries
        }
    });
    
    console.log('🔍 Calling Textract AnalyzeDocument...');
    const response = await textractClient.send(command);
    
    // Parse Textract response
    return parseTextractResponse(response);
}

/**
 * Parse Textract response and extract values with confidence
 */
function parseTextractResponse(response) {
    const extractedData = {};
    let labDate = null;
    
    // Build a map of block IDs to blocks for relationship lookup
    const blockMap = {};
    for (const block of response.Blocks || []) {
        blockMap[block.Id] = block;
    }
    
    // Find QUERY and QUERY_RESULT blocks
    for (const block of response.Blocks || []) {
        if (block.BlockType === 'QUERY') {
            const alias = block.Query?.Alias;
            if (!alias) continue;
            
            // Find the answer block through relationships
            let answerText = null;
            let confidence = 0;
            
            if (block.Relationships) {
                for (const rel of block.Relationships) {
                    if (rel.Type === 'ANSWER') {
                        for (const answerId of rel.Ids || []) {
                            const answerBlock = blockMap[answerId];
                            if (answerBlock && answerBlock.BlockType === 'QUERY_RESULT') {
                                answerText = answerBlock.Text;
                                confidence = answerBlock.Confidence || 0;
                            }
                        }
                    }
                }
            }
            
            // Apply confidence threshold
            if (answerText && confidence >= CONFIDENCE_LOW) {
                // Special handling for lab_date
                if (alias === 'lab_date') {
                    labDate = parseLabDate(answerText);
                } else {
                    // Extract numeric value if present
                    const numericValue = extractNumericValue(answerText);
                    extractedData[alias] = {
                        value: numericValue || answerText,
                        rawText: answerText,
                        confidence: Math.round(confidence * 10) / 10
                    };
                }
            } else {
                // Below threshold or not found - set to null for manual entry
                if (alias !== 'lab_date') {
                    extractedData[alias] = null;
                }
            }
        }
    }
    
    return { data: extractedData, labDate };
}

/**
 * Extract numeric value from text (handles units)
 */
function extractNumericValue(text) {
    if (!text) return null;
    
    // Match numbers (including decimals) at start or after common patterns
    const match = text.match(/(\d+\.?\d*)/);
    return match ? match[1] : text;
}

/**
 * Parse lab date from various formats
 */
function parseLabDate(text) {
    if (!text) return null;
    
    try {
        // Try various date formats
        const date = new Date(text);
        if (!isNaN(date.getTime())) {
            return date.toISOString().split('T')[0]; // YYYY-MM-DD format
        }
    } catch (e) {
        console.warn('Could not parse date:', text);
    }
    
    return null;
}

/**
 * Find patient_document_id by S3 key
 */
async function findPatientDocumentId(patientId, s3Key) {
    const db = getPool();
    try {
        const result = await db.query(
            'SELECT id FROM patient_documents WHERE patient_id = $1 AND s3_key = $2 LIMIT 1',
            [patientId, s3Key]
        );
        return result.rows[0]?.id || null;
    } catch (error) {
        console.warn('Could not find patient_document_id:', error.message);
        return null;
    }
}

/**
 * Save document to staging table
 */
async function saveToStaging({
    patientId,
    patientDocumentId,
    documentType,
    s3Bucket,
    s3Key,
    extractedData,
    labDate,
    extractionError
}) {
    const db = getPool();
    
    const query = `
        INSERT INTO document_staging (
            patient_id,
            patient_document_id,
            document_type,
            s3_bucket,
            s3_key,
            status,
            extracted_data,
            lab_date,
            extraction_error,
            created_at,
            updated_at
        ) VALUES ($1, $2, $3, $4, $5, 'PENDING_REVIEW', $6, $7, $8, NOW(), NOW())
        RETURNING id
    `;
    
    const values = [
        patientId,
        patientDocumentId,
        documentType,
        s3Bucket,
        s3Key,
        extractedData ? JSON.stringify(extractedData) : null,
        labDate,
        extractionError
    ];
    
    console.log('💾 Saving to document_staging...');
    const result = await db.query(query, values);
    const stagingId = result.rows[0].id;
    console.log(`✅ Saved with staging ID: ${stagingId}`);
    
    return stagingId;
}

// Export for testing
module.exports = {
    handler: exports.handler,
    processS3Record,
    extractLabData,
    getS3ObjectMetadata,
    EXTRACTABLE_DOCUMENT_TYPES,
    LAB_QUERIES,
    // For dependency injection in tests
    _setClients: (s3, textract, dbPool) => {
        if (s3) s3Client = s3;
        if (textract) textractClient = textract;
        if (dbPool) pool = dbPool;
    }
};
