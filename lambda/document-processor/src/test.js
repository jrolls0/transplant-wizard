/**
 * Unit Tests for Document Processor Lambda
 * 
 * Tests:
 * 1. Social Work Summary - Textract should NOT be called
 * 2. Labs (current_labs) - Textract SHOULD be called with correct query parameters
 */

const assert = require('assert');

// Track if Textract was called
let textractCalled = false;
let textractParams = null;

// Mock S3 Client
const mockS3Client = {
    send: async (command) => {
        if (command.constructor.name === 'HeadObjectCommand') {
            // Return mock metadata based on the key
            const key = command.input.Key;
            if (key.includes('social_work_summary')) {
                return {
                    Metadata: {
                        'patient-id': 'test-patient-123',
                        'document-type': 'social_work_summary'
                    }
                };
            } else if (key.includes('current_labs')) {
                return {
                    Metadata: {
                        'patient-id': 'test-patient-456',
                        'document-type': 'current_labs'
                    }
                };
            }
        }
        if (command.constructor.name === 'GetObjectCommand') {
            // Return mock document bytes
            return {
                Body: {
                    async *[Symbol.asyncIterator]() {
                        yield Buffer.from('mock-document-bytes');
                    }
                }
            };
        }
        return {};
    }
};

// Mock Textract Client
const mockTextractClient = {
    send: async (command) => {
        textractCalled = true;
        textractParams = command.input;
        
        // Return mock Textract response
        return {
            Blocks: [
                {
                    BlockType: 'QUERY',
                    Id: 'query-1',
                    Query: { Text: 'What is the Potassium?', Alias: 'potassium' },
                    Relationships: [{ Type: 'ANSWER', Ids: ['answer-1'] }]
                },
                {
                    BlockType: 'QUERY_RESULT',
                    Id: 'answer-1',
                    Text: '4.5',
                    Confidence: 95.5
                }
            ]
        };
    }
};

// Mock Database Pool
const mockDbPool = {
    query: async (query, values) => {
        return {
            rows: [{ id: 'mock-staging-id-123' }]
        };
    }
};

// Helper to create S3 event
function createS3Event(bucket, key) {
    return {
        Records: [{
            eventVersion: '2.1',
            eventSource: 'aws:s3',
            awsRegion: 'us-east-1',
            eventName: 'ObjectCreated:Put',
            s3: {
                bucket: { name: bucket },
                object: { key: key }
            }
        }]
    };
}

// Reset mocks before each test
function resetMocks() {
    textractCalled = false;
    textractParams = null;
}

// Import the module (after setting up mocks)
async function runTests() {
    console.log('🧪 Starting Document Processor Unit Tests\n');
    
    // Import and inject mocks
    const documentProcessor = require('./index');
    documentProcessor._setClients(mockS3Client, mockTextractClient, mockDbPool);
    
    let passed = 0;
    let failed = 0;
    
    // ═══════════════════════════════════════════════════════════════
    // TEST 1: Social Work Summary - Textract should NOT be called
    // ═══════════════════════════════════════════════════════════════
    console.log('📋 TEST 1: Social Work Summary (Group B) - Textract NOT called');
    console.log('─'.repeat(60));
    
    try {
        resetMocks();
        
        const event = createS3Event(
            'transplant-wizard-patient-documents',
            'patients/test-patient-123/documents/social_work_summary/group-id/document.pdf'
        );
        
        const result = await documentProcessor.handler(event);
        const parsedBody = JSON.parse(result.body);
        
        // Assert Textract was NOT called
        assert.strictEqual(textractCalled, false, 'Textract should NOT be called for Social Work Summary');
        
        // Assert extracted data is null
        assert.strictEqual(parsedBody[0].hasExtractedData, false, 'extractedData should be null for Social Work Summary');
        
        // Assert document type is correct
        assert.strictEqual(parsedBody[0].documentType, 'social_work_summary', 'Document type should be social_work_summary');
        
        console.log('   ✅ Textract was NOT called (correct)');
        console.log('   ✅ extractedData is null (correct)');
        console.log('   ✅ Document type: social_work_summary');
        console.log('   ✅ TEST 1 PASSED\n');
        passed++;
        
    } catch (error) {
        console.log(`   ❌ TEST 1 FAILED: ${error.message}\n`);
        failed++;
    }
    
    // ═══════════════════════════════════════════════════════════════
    // TEST 2: Labs (current_labs) - Textract SHOULD be called
    // ═══════════════════════════════════════════════════════════════
    console.log('📋 TEST 2: Labs (current_labs) - Textract IS called with correct queries');
    console.log('─'.repeat(60));
    
    try {
        resetMocks();
        
        const event = createS3Event(
            'transplant-wizard-patient-documents',
            'patients/test-patient-456/documents/current_labs/group-id/lab-results.pdf'
        );
        
        const result = await documentProcessor.handler(event);
        const parsedBody = JSON.parse(result.body);
        
        // Assert Textract WAS called
        assert.strictEqual(textractCalled, true, 'Textract SHOULD be called for Labs');
        
        // Assert QueriesConfig was used
        assert.ok(textractParams.QueriesConfig, 'QueriesConfig should be present in Textract call');
        assert.ok(textractParams.QueriesConfig.Queries, 'Queries array should be present');
        
        // Assert correct number of queries (17 lab metrics + 1 lab_date = 18)
        const expectedQueryCount = documentProcessor.LAB_QUERIES.length;
        assert.strictEqual(
            textractParams.QueriesConfig.Queries.length, 
            expectedQueryCount, 
            `Should have ${expectedQueryCount} queries`
        );
        
        // Assert specific queries are present
        const queryTexts = textractParams.QueriesConfig.Queries.map(q => q.Text);
        assert.ok(
            queryTexts.some(q => q.includes('Potassium')),
            'Should include Potassium query'
        );
        assert.ok(
            queryTexts.some(q => q.includes('Blood Urea Nitrogen') || q.includes('BUN')),
            'Should include BUN query'
        );
        assert.ok(
            queryTexts.some(q => q.includes('Hemoglobin A1c') || q.includes('A1c')),
            'Should include A1c query'
        );
        
        // Assert FeatureTypes includes QUERIES
        assert.ok(
            textractParams.FeatureTypes.includes('QUERIES'),
            'FeatureTypes should include QUERIES'
        );
        
        // Assert extracted data is present
        assert.strictEqual(parsedBody[0].hasExtractedData, true, 'extractedData should be present for Labs');
        
        console.log('   ✅ Textract WAS called (correct)');
        console.log('   ✅ QueriesConfig adapter was used');
        console.log(`   ✅ ${expectedQueryCount} queries sent to Textract`);
        console.log('   ✅ FeatureTypes includes QUERIES');
        console.log('   ✅ Potassium, BUN, A1c queries verified');
        console.log('   ✅ extractedData is present');
        console.log('   ✅ TEST 2 PASSED\n');
        passed++;
        
    } catch (error) {
        console.log(`   ❌ TEST 2 FAILED: ${error.message}\n`);
        failed++;
    }
    
    // ═══════════════════════════════════════════════════════════════
    // TEST 3: Verify LAB_QUERIES contains all required metrics
    // ═══════════════════════════════════════════════════════════════
    console.log('📋 TEST 3: Verify LAB_QUERIES contains all required metrics');
    console.log('─'.repeat(60));
    
    try {
        const requiredMetrics = [
            'potassium', 'bun', 'phosphorus', 'hemoglobin', 'platelets',
            'pt', 'inr', 'ptt', 'pth', 'a1c', 'albumin', 'total_bilirubin',
            'total_cholesterol', 'urine_protein', 'urine_rbc', 'urine_wbc',
            'urine_hemoglobin', 'lab_date'
        ];
        
        const queryKeys = documentProcessor.LAB_QUERIES.map(q => q.key);
        
        for (const metric of requiredMetrics) {
            assert.ok(
                queryKeys.includes(metric),
                `LAB_QUERIES should include ${metric}`
            );
        }
        
        console.log(`   ✅ All ${requiredMetrics.length} required metrics present in LAB_QUERIES`);
        console.log('   ✅ TEST 3 PASSED\n');
        passed++;
        
    } catch (error) {
        console.log(`   ❌ TEST 3 FAILED: ${error.message}\n`);
        failed++;
    }
    
    // ═══════════════════════════════════════════════════════════════
    // TEST SUMMARY
    // ═══════════════════════════════════════════════════════════════
    console.log('═'.repeat(60));
    console.log('📊 TEST SUMMARY');
    console.log('═'.repeat(60));
    console.log(`   Total:  ${passed + failed}`);
    console.log(`   Passed: ${passed} ✅`);
    console.log(`   Failed: ${failed} ${failed > 0 ? '❌' : ''}`);
    console.log('═'.repeat(60));
    
    if (failed > 0) {
        process.exit(1);
    }
    
    console.log('\n🎉 All tests passed!\n');
}

// Run tests
runTests().catch(error => {
    console.error('Test execution failed:', error);
    process.exit(1);
});
