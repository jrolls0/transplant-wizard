# DUSW Referral System - Quick Test Commands Reference

## 🚀 Quick Start - Copy & Paste Commands

Use these commands to quickly verify each stage of the system.

---

## Stage 1: API Health Check (30 seconds)

```bash
# Test API is running
curl -s https://api.transplantwizard.com/health | jq .

# Expected: status = "healthy", database = "connected"
```

---

## Stage 2: Database Verification (2 minutes)

```bash
# Connect to database
PGPASSWORD='$ball9Base' psql \
  -h transplant-platform-db.c90ca0kcwjsh.us-east-1.rds.amazonaws.com \
  -p 5432 \
  -U transplant_admin \
  -d transplant_platform

# Then run these SQL commands:
```

```sql
-- Check nephrologist column
\d patients
-- Look for: nephrologist | character varying(255)

-- Check referral table
\d patient_referral_invitations
-- Should show all columns

-- Exit
\q
```

---

## Stage 3-4: DUSW Dashboard & Email (5 minutes)

### Manual Steps:
1. Open `https://dusw.transplantwizard.com`
2. Log in
3. Click "Refer New Patient" button
4. Fill form:
   - Title: Mr
   - First Name: John
   - Last Name: Doe
   - Email: **jrolls@umich.edu** (IMPORTANT - must be in whitelist)
   - Nephrologist: Dr. Jane Smith
5. Click "Send Referral"
6. Check inbox for email at `jrolls@umich.edu`

### Backend Verification:
```bash
# Check backend logs for email confirmation
ssh -i /Users/jeremy/.ssh/transplant-wizard-key.pem ec2-user@3.215.185.174 \
  "tail -50 /var/log/backend.log | grep -E '(✅|❌|Email|email)'"

# Expected output:
# ✅ Email sent to jrolls@umich.edu: <MessageId>
```

---

## Stage 5: Extract Deep Link from Email

```bash
# In the email from jrolls@umich.edu, find the button link
# It will look like:
# app://register?referralToken=<UUID>&firstName=John&lastName=Doe&...

# Copy the full URL (including all parameters)
# You'll need this for the next test
```

---

## Stage 5-6: Test Deep Link on Simulator (3 minutes)

### Using xcrun (Automated):
```bash
# Replace <FULL_LINK> with the link from email
# Note: URL must be properly encoded (spaces as %20, etc.)

xcrun simctl openurl booted "app://register?referralToken=<UUID>&firstName=John&lastName=Doe&email=jrolls%40umich.edu&title=Mr&nephrologist=Dr.%20Jane%20Smith&dialysisClinic=Metro%20Health%20Dialysis&dusw=Jane%20Nurse,%20MSW"

# OR

# Open Safari in simulator, paste link directly
```

### Check Console Logs:
```bash
# In Xcode, open Console and look for:
🔗 Deep link received: app://register?...
📋 Parsed parameter: referralToken = ...
✅ Deep link processed successfully
✅ Referral data fetched successfully
```

**Pass Criteria**: App opens, navigates to registration, form is pre-filled

---

## Stage 7: Complete Registration (2 minutes)

### Steps in App:
1. Verify form is pre-filled:
   - Title: Mr
   - First Name: John
   - Last Name: Doe
   - Email: jrolls@umich.edu
   - Nephrologist: Dr. Jane Smith

2. Fill remaining fields:
   - Password: `SecurePassword123!`
   - Phone: +1-555-123-4567
   - DOB: 01/15/1980
   - Address: 123 Main St
   - PCP: Dr. Michael Smith
   - Insurance: Blue Cross

3. Click Register
4. Verify auto-login and dashboard appears

### Database Verification:
```bash
PGPASSWORD='$ball9Base' psql \
  -h transplant-platform-db.c90ca0kcwjsh.us-east-1.rds.amazonaws.com \
  -p 5432 \
  -U transplant_admin \
  -d transplant_platform

# Find the patient record
SELECT id, email, first_name, last_name, nephrologist
FROM patients
JOIN users ON patients.user_id = users.id
WHERE email = 'jrolls@umich.edu';
```

**Pass Criteria**: Patient record exists with all fields populated

---

## Stage 8: Verify Referral Redemption (2 minutes)

```bash
PGPASSWORD='$ball9Base' psql \
  -h transplant-platform-db.c90ca0kcwjsh.us-east-1.rds.amazonaws.com \
  -p 5432 \
  -U transplant_admin \
  -d transplant_platform

# Check referral is marked as redeemed
SELECT
  id,
  referral_token,
  redeemed,
  redeemed_at,
  expires_at
FROM patient_referral_invitations
WHERE patient_email = 'jrolls@umich.edu'
ORDER BY created_at DESC
LIMIT 1;

# Expected: redeemed = true, redeemed_at = recent timestamp

# Check audit logs
SELECT action, success, created_at
FROM audit_logs
WHERE email = 'jrolls@umich.edu'
ORDER BY created_at DESC
LIMIT 10;

# Exit
\q
```

**Pass Criteria**:
- Referral redeemed = true
- Redeemed timestamp is recent
- Audit logs show all actions

---

## Stage 9: Test Error Cases (5 minutes)

### Test 9.1: Email to Non-Whitelisted Recipient

```bash
# From DUSW dashboard, create another referral
# Use email: test@example.com (NOT in whitelist)
# Expected: Error message "Email blocked - recipient not verified in sandbox mode"

# Verify in backend logs:
ssh -i /Users/jeremy/.ssh/transplant-wizard-key.pem ec2-user@3.215.185.174 \
  "tail -20 /var/log/backend.log | grep blocked"
```

### Test 9.2: Invalid Referral Token

```bash
# Try to fetch invalid token
curl -s "https://api.transplantwizard.com/api/v1/patient/referral/00000000-0000-0000-0000-000000000000" | jq .

# Expected:
# {
#   "success": false,
#   "error": "Referral not found or has expired..."
# }
```

### Test 9.3: Try to Reuse Referral Token

```bash
# Extract referral token from database
PGPASSWORD='$ball9Base' psql \
  -h transplant-platform-db.c90ca0kcwjsh.us-east-1.rds.amazonaws.com \
  -p 5432 \
  -U transplant_admin \
  -d transplant_platform \
  -c "SELECT referral_token FROM patient_referral_invitations WHERE patient_email = 'jrolls@umich.edu' LIMIT 1;"

# Try to register again with same token
curl -X POST https://api.transplantwizard.com/api/v1/auth/register/patient \
  -H "Content-Type: application/json" \
  -d '{
    "firstName": "Jane",
    "lastName": "Doe",
    "email": "jane.doe@example.com",
    "referralToken": "<TOKEN-FROM-ABOVE>",
    "password": "SecurePassword123!"
  }' | jq .

# Expected: error about token already redeemed
```

---

## 📊 Quick Status Check (1 minute)

```bash
# Check everything is running
echo "=== API Health ==="
curl -s https://api.transplantwizard.com/health | jq '.status, .database'

echo "=== Backend Process ==="
ssh -i /Users/jeremy/.ssh/transplant-wizard-key.pem ec2-user@3.215.185.174 \
  "ps aux | grep 'node.*simple-auth-server' | grep -v grep"

echo "=== Recent Errors ==="
ssh -i /Users/jeremy/.ssh/transplant-wizard-key.pem ec2-user@3.215.185.174 \
  "tail -5 /var/log/backend.log | grep -E '(ERROR|❌)' || echo 'No recent errors'"

echo "=== SES Configuration ==="
ssh -i /Users/jeremy/.ssh/transplant-wizard-key.pem ec2-user@3.215.185.174 \
  "grep 'SES_' /home/ec2-user/transplant-wizard/backend-api/.env"
```

---

## 🔧 Troubleshooting Quick Fixes

### Backend Not Running
```bash
ssh -i /Users/jeremy/.ssh/transplant-wizard-key.pem ec2-user@3.215.185.174 \
  "pkill -f 'node.*simple-auth-server' && sleep 2 && cd /home/ec2-user/transplant-wizard/backend-api && AWS_PROFILE=Jeremy node src/simple-auth-server.js > /var/log/backend.log 2>&1 &"
```

### View Recent Backend Errors
```bash
ssh -i /Users/jeremy/.ssh/transplant-wizard-key.pem ec2-user@3.215.185.174 \
  "tail -100 /var/log/backend.log"
```

### Check EC2 Instance Status
```bash
aws ec2 describe-instances \
  --instance-ids i-01ccb106fd09c4e58 \
  --region us-east-1 \
  --profile transplant-platform-admin \
  --query 'Reservations[0].Instances[0].[State.Name, PublicIpAddress, PrivateIpAddress]'
```

### Verify SES Configuration
```bash
ssh -i /Users/jeremy/.ssh/transplant-wizard-key.pem ec2-user@3.215.185.174 \
  "cat /home/ec2-user/transplant-wizard/backend-api/.env | grep -i ses"
```

### Restart and View Logs
```bash
ssh -i /Users/jeremy/.ssh/transplant-wizard-key.pem ec2-user@3.215.185.174 << 'EOF'
pkill -f 'node.*simple-auth-server'
sleep 2
cd /home/ec2-user/transplant-wizard/backend-api
AWS_PROFILE=Jeremy node src/simple-auth-server.js > /var/log/backend.log 2>&1 &
sleep 3
tail -30 /var/log/backend.log
EOF
```

---

## ✅ Test Success Checklist

Print and use this checklist:

```
DUSW REFERRAL SYSTEM - TEST SUCCESS CHECKLIST
Date: ____________  Tester: ____________

Stage 1: API Health
☐ API responds with 200
☐ Database shows "connected"
☐ Response time < 1 second

Stage 2: Database Schema
☐ nephrologist column exists
☐ patient_referral_invitations table exists
☐ All columns have correct types

Stage 3-4: DUSW Dashboard & Email
☐ Referral button visible
☐ Form submits successfully
☐ Email received at jrolls@umich.edu
☐ Email is from noreply@transplantwizard.com
☐ Email subject contains referral header
☐ Email has professional HTML template
☐ Email includes deep link with parameters

Stage 5-6: Deep Linking
☐ Deep link opens app
☐ App navigates to registration
☐ Form fields are pre-filled:
  ☐ First Name: John
  ☐ Last Name: Doe
  ☐ Email: jrolls@umich.edu
  ☐ Title: Mr
  ☐ Nephrologist: Dr. Jane Smith
☐ Console shows "Deep link processed successfully"
☐ Console shows "Referral data fetched successfully"

Stage 7: Registration
☐ Form validation works for required fields
☐ Password requirements enforced
☐ Registration API call succeeds
☐ User auto-logged in
☐ Dashboard appears after registration

Stage 8: Verification
☐ Patient record created in database
☐ All fields saved correctly
☐ Referral token marked as redeemed
☐ Redeemed timestamp populated
☐ Audit logs recorded for all actions

Stage 9: Error Handling
☐ Non-whitelisted email blocked
☐ Invalid token returns proper error
☐ Expired token handled gracefully
☐ Cannot reuse same referral token
☐ No app crashes in error cases
☐ Error messages are helpful

OVERALL RESULT:  ☐ PASS  ☐ FAIL  ☐ PARTIAL

Issues Found:
1. _________________________________
2. _________________________________
3. _________________________________

Sign-off: ____________  Date: __________
```

---

## 📱 Specific Tests by Role

### For QA/Testers
Focus on: Stages 3, 4, 5, 6, 7, 9
Time: 20-25 minutes
Goal: Verify user workflows

### For DevOps/Backend
Focus on: Stages 1, 2, 4, 8
Time: 10-15 minutes
Goal: Verify infrastructure and data

### For Mobile Dev
Focus on: Stages 5, 6, 7, 9
Time: 15-20 minutes
Goal: Verify app functionality

### For Database Admin
Focus on: Stage 2, 8
Time: 5-10 minutes
Goal: Verify schema and data integrity

---

**Last Updated**: December 12, 2025
**Estimated Total Testing Time**: 30-45 minutes
**Success Criteria**: All stages pass with no critical issues
