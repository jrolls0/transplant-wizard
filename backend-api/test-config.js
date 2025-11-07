#!/usr/bin/env node

/**
 * Configuration Test Script
 * Tests all environment variables and AWS connectivity
 */

require('dotenv').config();
const { Pool } = require('pg');
const AWS = require('aws-sdk');

// ANSI color codes for console output
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m',
  bold: '\x1b[1m'
};

function log(message, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

function logSuccess(message) {
  log(`✅ ${message}`, colors.green);
}

function logError(message) {
  log(`❌ ${message}`, colors.red);
}

function logWarning(message) {
  log(`⚠️  ${message}`, colors.yellow);
}

function logInfo(message) {
  log(`ℹ️  ${message}`, colors.blue);
}

async function testEnvironmentVariables() {
  log('\n=== ENVIRONMENT VARIABLES TEST ===', colors.bold);
  
  const requiredVars = [
    'NODE_ENV',
    'PORT',
    'DB_HOST',
    'DB_PORT',
    'DB_NAME',
    'DB_USER',
    'DB_PASSWORD',
    'AWS_REGION',
    'AWS_ACCESS_KEY_ID',
    'AWS_SECRET_ACCESS_KEY',
    'COGNITO_USER_POOL_ID',
    'COGNITO_WEB_CLIENT_ID',
    'COGNITO_MOBILE_CLIENT_ID',
    'S3_BUCKET',
    'JWT_SECRET',
    'SESSION_SECRET'
  ];

  let missingVars = [];
  let setVars = [];

  requiredVars.forEach(varName => {
    if (process.env[varName]) {
      setVars.push(varName);
      logSuccess(`${varName}: Set`);
    } else {
      missingVars.push(varName);
      logError(`${varName}: Missing`);
    }
  });

  if (missingVars.length === 0) {
    logSuccess('All required environment variables are set');
  } else {
    logError(`Missing ${missingVars.length} required variables: ${missingVars.join(', ')}`);
  }

  return missingVars.length === 0;
}

async function testAWSCredentials() {
  log('\n=== AWS CREDENTIALS TEST ===', colors.bold);
  
  try {
    // Configure AWS
    AWS.config.update({
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      region: process.env.AWS_REGION
    });

    // Test AWS STS (Security Token Service) to verify credentials
    const sts = new AWS.STS();
    const identity = await sts.getCallerIdentity().promise();
    
    logSuccess(`AWS Credentials Valid`);
    logInfo(`Account ID: ${identity.Account}`);
    logInfo(`User ARN: ${identity.Arn}`);
    logInfo(`User ID: ${identity.UserId}`);
    
    return true;
  } catch (error) {
    logError(`AWS Credentials Invalid: ${error.message}`);
    return false;
  }
}

async function testCognitoConnection() {
  log('\n=== COGNITO CONNECTION TEST ===', colors.bold);
  
  try {
    const cognito = new AWS.CognitoIdentityServiceProvider({
      region: process.env.COGNITO_REGION
    });

    // Test by describing the user pool
    const userPool = await cognito.describeUserPool({
      UserPoolId: process.env.COGNITO_USER_POOL_ID
    }).promise();

    logSuccess(`Cognito User Pool Connected`);
    logInfo(`Pool Name: ${userPool.UserPool.Name}`);
    logInfo(`Pool Status: ${userPool.UserPool.Status}`);
    logInfo(`Creation Date: ${userPool.UserPool.CreationDate}`);

    // Test web client
    try {
      const webClient = await cognito.describeUserPoolClient({
        UserPoolId: process.env.COGNITO_USER_POOL_ID,
        ClientId: process.env.COGNITO_WEB_CLIENT_ID
      }).promise();
      logSuccess(`Web Client Connected: ${webClient.UserPoolClient.ClientName}`);
    } catch (error) {
      logError(`Web Client Invalid: ${error.message}`);
    }

    // Test mobile client
    try {
      const mobileClient = await cognito.describeUserPoolClient({
        UserPoolId: process.env.COGNITO_USER_POOL_ID,
        ClientId: process.env.COGNITO_MOBILE_CLIENT_ID
      }).promise();
      logSuccess(`Mobile Client Connected: ${mobileClient.UserPoolClient.ClientName}`);
    } catch (error) {
      logError(`Mobile Client Invalid: ${error.message}`);
    }

    return true;
  } catch (error) {
    logError(`Cognito Connection Failed: ${error.message}`);
    return false;
  }
}

async function testS3Connection() {
  log('\n=== S3 CONNECTION TEST ===', colors.bold);
  
  try {
    const s3 = new AWS.S3({
      region: process.env.S3_REGION
    });

    // Test bucket access
    const bucketLocation = await s3.getBucketLocation({
      Bucket: process.env.S3_BUCKET
    }).promise();

    logSuccess(`S3 Bucket Accessible`);
    logInfo(`Bucket: ${process.env.S3_BUCKET}`);
    logInfo(`Region: ${bucketLocation.LocationConstraint || 'us-east-1'}`);

    // Test bucket permissions by attempting to list objects (limited)
    try {
      const objects = await s3.listObjectsV2({
        Bucket: process.env.S3_BUCKET,
        MaxKeys: 1
      }).promise();
      logSuccess(`S3 List Permission: Available`);
    } catch (error) {
      logWarning(`S3 List Permission: Limited (${error.code})`);
    }

    return true;
  } catch (error) {
    logError(`S3 Connection Failed: ${error.message}`);
    return false;
  }
}

async function testDatabaseConnection() {
  log('\n=== DATABASE CONNECTION TEST ===', colors.bold);
  
  const pool = new Pool({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
    connectionTimeoutMillis: 10000
  });

  try {
    const client = await pool.connect();
    
    // Test basic connectivity
    const result = await client.query('SELECT NOW() as current_time, version() as db_version');
    const { current_time, db_version } = result.rows[0];
    
    logSuccess(`Database Connected`);
    logInfo(`Current Time: ${current_time}`);
    logInfo(`Version: ${db_version.split(' ').slice(0, 2).join(' ')}`);

    // Test if our schema exists
    const schemaCheck = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('users', 'patients', 'social_workers', 'transplant_centers')
      ORDER BY table_name
    `);

    if (schemaCheck.rows.length > 0) {
      logSuccess(`Schema Tables Found: ${schemaCheck.rows.map(r => r.table_name).join(', ')}`);
    } else {
      logWarning('Schema tables not found - run database setup first');
    }

    client.release();
    await pool.end();
    return true;
  } catch (error) {
    logError(`Database Connection Failed: ${error.message}`);
    await pool.end();
    return false;
  }
}

async function testJWTSecret() {
  log('\n=== JWT SECRET TEST ===', colors.bold);
  
  const jwtSecret = process.env.JWT_SECRET;
  
  if (!jwtSecret) {
    logError('JWT_SECRET not set');
    return false;
  }
  
  if (jwtSecret.length < 32) {
    logWarning('JWT_SECRET should be at least 32 characters for security');
  } else {
    logSuccess('JWT_SECRET length is secure');
  }

  if (jwtSecret.includes('change-this') || jwtSecret.includes('your-')) {
    logError('JWT_SECRET appears to be a default/placeholder value');
    return false;
  }

  logSuccess('JWT_SECRET appears to be properly configured');
  return true;
}

async function runAllTests() {
  log(`${colors.bold}${colors.blue}🧪 TRANSPLANT PLATFORM - CONFIGURATION TEST${colors.reset}\n`);
  
  const results = {
    envVars: await testEnvironmentVariables(),
    awsCreds: await testAWSCredentials(),
    cognito: await testCognitoConnection(),
    s3: await testS3Connection(),
    database: await testDatabaseConnection(),
    jwt: await testJWTSecret()
  };

  // Summary
  log('\n=== TEST SUMMARY ===', colors.bold);
  
  const passed = Object.values(results).filter(Boolean).length;
  const total = Object.keys(results).length;
  
  Object.entries(results).forEach(([test, passed]) => {
    if (passed) {
      logSuccess(`${test.toUpperCase()}: PASSED`);
    } else {
      logError(`${test.toUpperCase()}: FAILED`);
    }
  });

  log(`\n${colors.bold}Overall: ${passed}/${total} tests passed${colors.reset}`);
  
  if (passed === total) {
    logSuccess('🎉 All configuration tests passed! Backend is ready to run.');
  } else {
    logError('⚠️  Some tests failed. Please check configuration before proceeding.');
  }

  return passed === total;
}

// Manual AWS verification instructions
function printManualVerificationInstructions() {
  log('\n=== MANUAL AWS VERIFICATION ===', colors.bold);
  logInfo('To manually verify your AWS credentials, run these commands:');
  log('');
  log('1. Install AWS CLI: https://aws.amazon.com/cli/', colors.yellow);
  log('2. Configure credentials:', colors.yellow);
  log('   aws configure', colors.green);
  log('   (Enter your Access Key ID and Secret Access Key)');
  log('');
  log('3. Test credentials:', colors.yellow);
  log('   aws sts get-caller-identity', colors.green);
  log('');
  log('4. Test Cognito access:', colors.yellow);
  log(`   aws cognito-idp describe-user-pool --user-pool-id ${process.env.COGNITO_USER_POOL_ID}`, colors.green);
  log('');
  log('5. Test S3 access:', colors.yellow);
  log(`   aws s3 ls s3://${process.env.S3_BUCKET}`, colors.green);
}

// Run the tests
if (require.main === module) {
  runAllTests()
    .then(() => {
      printManualVerificationInstructions();
      process.exit(0);
    })
    .catch(error => {
      logError(`Test execution failed: ${error.message}`);
      process.exit(1);
    });
}

module.exports = { runAllTests };