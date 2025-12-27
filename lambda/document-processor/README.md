# Document Processor Lambda

Smart Extraction Pipeline for processing uploaded patient documents using AWS Textract.

## Overview

This Lambda function is triggered by S3 ObjectCreated events when a patient or DUSW uploads a document. It:

1. **Receives** the S3 event with document location
2. **Extracts** document metadata (patient ID, document type) from S3 object metadata
3. **Processes** the document:
   - For "current_labs" documents: Runs AWS Textract Queries to extract lab values
   - For all other documents: Skips extraction (sets extracted_data to null)
4. **Saves** to `document_staging` table with status `PENDING_REVIEW`

## Document Types

### Group A (Extractable - MVP: Labs only)
- `current_labs` - One week of current labs ✅ **AI Extraction Enabled**
- `medicare_2728` - Medicare 2728 form (future)
- `medication_list` - Medication list (future)
- `immunization_record` - Immunization record (future)

### Group B (Read-Only / Narrative)
- `social_work_summary`
- `dietitian_summary`
- `care_plan_notes`
- `dialysis_shift`

## Lab Metrics Extracted

For `current_labs` documents, the following "Golden List" metrics are extracted:

| Metric | Textract Query |
|--------|----------------|
| Potassium | "What is the Potassium?" |
| BUN | "What is the Blood Urea Nitrogen or BUN?" |
| Phosphorus | "What is the Phosphorus?" |
| Hemoglobin | "What is the Hemoglobin or Hb?" |
| Platelets | "What is the Platelets or PLT?" |
| PT | "What is the Prothrombin Time or PT?" |
| INR | "What is the International Normalized Ratio or INR?" |
| PTT | "What is the Partial Thromboplastin Time or PTT?" |
| PTH | "What is the Parathyroid Hormone or PTH?" |
| A1c | "What is the Hemoglobin A1c or A1c?" |
| Albumin | "What is the Albumin?" |
| Total Bilirubin | "What is the Total Bilirubin?" |
| Total Cholesterol | "What is the Total Cholesterol?" |
| Urine Protein | "What is the Urine Protein?" |
| Urine RBC | "What is the Urine Red Cell Count?" |
| Urine WBC | "What is the Urine White Cell Count?" |
| Urine Hemoglobin | "What is the Urine Hemoglobin?" |
| Lab Date | "What is the date of the lab work or collection date?" |

## Confidence Scoring

Extracted values include confidence scores for UI highlighting:

```json
{
  "potassium": {
    "value": "4.5",
    "rawText": "4.5 mEq/L",
    "confidence": 92.5
  }
}
```

### Confidence Thresholds
- **≥90%**: Show normally (green)
- **70-90%**: Show with yellow "Check me" warning
- **<50%**: Set to `null` - forces manual entry

## Deployment

### Prerequisites
- AWS SAM CLI installed
- AWS credentials configured
- VPC with private subnets configured for RDS access

### Deploy

```bash
cd lambda/document-processor

# Build
sam build

# Deploy (first time - guided)
sam deploy --guided

# Deploy (subsequent)
sam deploy
```

### Required Parameters

| Parameter | Description |
|-----------|-------------|
| DatabaseHost | RDS PostgreSQL endpoint |
| DatabaseName | Database name (default: postgres) |
| DatabaseUsername | Database user |
| DatabasePassword | Database password |
| VpcId | VPC ID where RDS is deployed |
| SubnetIds | Private subnet IDs for Lambda |
| SecurityGroupId | Security group allowing RDS access |

## Database Tables

### document_staging
Staging table for documents pending TC Admin review.

### patient_lab_results  
Finalized, TC Admin-verified lab results with typed columns.

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| ENVIRONMENT | Deployment environment | production |
| S3_BUCKET | S3 bucket name | transplant-wizard-patient-documents |
| DB_HOST | RDS host endpoint | - |
| DB_NAME | Database name | postgres |
| DB_USER | Database username | transplant_admin |
| DB_PASSWORD | Database password | - |
| DB_PORT | Database port | 5432 |
| CONFIDENCE_THRESHOLD_LOW | Min confidence to include | 50 |
| CONFIDENCE_THRESHOLD_MEDIUM | Medium confidence threshold | 70 |
| CONFIDENCE_THRESHOLD_HIGH | High confidence threshold | 90 |

## Testing

```bash
# Local invoke with sample event
sam local invoke DocumentProcessorFunction -e events/test-event.json

# View logs
sam logs -n DocumentProcessorFunction --tail
```

## HIPAA Compliance

- ✅ Lambda runs in VPC (same as RDS)
- ✅ S3 bucket has encryption at rest
- ✅ Data encrypted in transit (TLS)
- ✅ CloudWatch logs for audit trail
- ✅ No PHI in Lambda environment variables
