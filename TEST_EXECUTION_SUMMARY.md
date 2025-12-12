# DUSW Referral System - Test Execution Summary

## 📋 Quick Overview

This document provides a comprehensive summary of how to test the entire DUSW Patient Referral System from end-to-end.

---

## 🎯 Testing Objectives

Verify that:
1. ✅ DUSW can create patient referrals
2. ✅ Referral emails are sent via AWS SES
3. ✅ Patients receive personalized emails with deep links
4. ✅ Deep links open the app and navigate correctly
5. ✅ Registration form is pre-filled with referral data
6. ✅ Patients can complete registration with referral token
7. ✅ Database correctly tracks referral redemption
8. ✅ All audit logs are recorded for compliance
9. ✅ Error cases are handled gracefully

---

## 📚 Test Documentation Files

Three comprehensive guides are available:

### 1. **TESTING_GUIDE.md** (Detailed - 50+ tests)
**Best for**: Complete QA, UAT, comprehensive verification

**Contents**:
- 9 detailed stages with multiple tests per stage
- Step-by-step procedures with expected outcomes
- Console log examples
- Database query templates
- Screenshots of expected behavior
- Troubleshooting guide
- Test report template

**Read time**: 20-30 minutes planning
**Execution time**: 30-45 minutes testing

### 2. **QUICK_TEST_COMMANDS.md** (Reference - Copy & Paste)
**Best for**: Quick verification, specific tests, scripting

**Contents**:
- One-liner commands with copy-paste ready
- Each stage with concise steps
- Expected output examples
- Troubleshooting quick fixes
- Role-specific testing paths
- Success checklist

**Read time**: 5 minutes
**Execution time**: 15-30 minutes testing (flexible)

### 3. **TEST_EXECUTION_SUMMARY.md** (This File)
**Best for**: Overview, navigation, quick decisions

**Contents**:
- This summary you're reading
- Quick decision tree
- Test selection guide
- Timeline recommendations

---

## 🚀 Quick Decision Guide

### "I want to test EVERYTHING" ⏱️ 45 minutes
**Follow**: TESTING_GUIDE.md, all 9 stages
**Resources**: Tester + DevOps + optional Product PM
**Output**: Full test report with comprehensive coverage

### "I just want to verify it works" ⏱️ 20 minutes
**Follow**: QUICK_TEST_COMMANDS.md, key stages
**Resources**: One QA engineer
**Output**: Quick checklist pass/fail

### "I'm in a hurry" ⏱️ 5 minutes
**Follow**: "Quick Status Check" section in QUICK_TEST_COMMANDS.md
**Resources**: Just you + terminal
**Output**: Healthy/Not Healthy status

### "I only care about [specific area]"
**Choose by role**:

| Role | Focus | Time | Doc |
|------|-------|------|-----|
| **QA/Tester** | Stages 3-7 | 20m | TESTING_GUIDE.md |
| **Mobile Dev** | Stages 5-7, 9 | 15m | TESTING_GUIDE.md Stage 5-9 |
| **Backend Dev** | Stages 1-2, 4, 8 | 15m | TESTING_GUIDE.md Stage 1,2,4,8 |
| **DevOps** | Stages 1-2, Health | 10m | QUICK_TEST_COMMANDS.md |
| **Product** | Stages 3-7 | 25m | TESTING_GUIDE.md Stage 3-7 |

---

## 📊 Test Stages Overview

```
┌────────────────────────────────────────────────────────────────┐
│ STAGE 1: Backend API Health [1 min]                           │
│ ✓ API responds  ✓ Database connected                          │
└────────────────────────────────────────────────────────────────┘
                              ↓
┌────────────────────────────────────────────────────────────────┐
│ STAGE 2: Database Schema [2 min]                              │
│ ✓ Tables exist  ✓ Columns correct  ✓ Constraints set         │
└────────────────────────────────────────────────────────────────┘
                              ↓
┌────────────────────────────────────────────────────────────────┐
│ STAGE 3: DUSW Dashboard [3 min]                               │
│ ✓ Button visible  ✓ Form opens  ✓ Validation works           │
└────────────────────────────────────────────────────────────────┘
                              ↓
┌────────────────────────────────────────────────────────────────┐
│ STAGE 4: Email Sending [5 min]                                │
│ ✓ Email sent  ✓ Content correct  ✓ Sandbox enforced          │
└────────────────────────────────────────────────────────────────┘
                              ↓
┌────────────────────────────────────────────────────────────────┐
│ STAGE 5: Deep Linking [3 min]                                 │
│ ✓ Link extracted  ✓ App opens  ✓ Parameters parsed            │
└────────────────────────────────────────────────────────────────┘
                              ↓
┌────────────────────────────────────────────────────────────────┐
│ STAGE 6: Form Pre-Fill [3 min]                                │
│ ✓ Fields pre-filled  ✓ Data correct  ✓ API called             │
└────────────────────────────────────────────────────────────────┘
                              ↓
┌────────────────────────────────────────────────────────────────┐
│ STAGE 7: Registration [5 min]                                 │
│ ✓ Validation works  ✓ API succeeds  ✓ Auto-login works        │
└────────────────────────────────────────────────────────────────┘
                              ↓
┌────────────────────────────────────────────────────────────────┐
│ STAGE 8: Verification [3 min]                                 │
│ ✓ Data saved  ✓ Token redeemed  ✓ Audit logs recorded        │
└────────────────────────────────────────────────────────────────┘
                              ↓
┌────────────────────────────────────────────────────────────────┐
│ STAGE 9: Error Handling [5 min]                               │
│ ✓ Non-whitelist blocked  ✓ Invalid tokens handled ✓ No crash │
└────────────────────────────────────────────────────────────────┘

Total: 9 Stages | 30-45 minutes | 50+ individual tests
```

---

## 🎬 Running the Tests

### Option 1: Full Comprehensive Test (45 min)
```
1. Read: TESTING_GUIDE.md (20 min planning)
2. Execute: All 9 stages with detailed steps
3. Document: Complete test report with findings
4. Verify: All checkboxes marked
5. Report: Pass/Fail/Issues
```

### Option 2: Quick Verification (20 min)
```
1. Read: QUICK_TEST_COMMANDS.md (5 min)
2. Execute: Key commands from each stage
3. Verify: Success criteria checklist
4. Report: Quick pass/fail summary
```

### Option 3: Specific Component (10-15 min)
```
1. Select: Relevant stages from TESTING_GUIDE.md
2. Execute: Only those stages
3. Report: Component status
```

### Option 4: Automated Quick Check (1 min)
```
bash /path/to/quick_check.sh
# (See QUICK_TEST_COMMANDS.md section "Quick Status Check")
```

---

## 💻 Prerequisites Checklist

Before starting tests, verify you have:

### Access & Credentials
- [ ] EC2 SSH access: `ssh -i /Users/jeremy/.ssh/transplant-wizard-key.pem ec2-user@3.215.185.174`
- [ ] Database password: `$ball9Base`
- [ ] DUSW dashboard login credentials
- [ ] Email access to: `jrolls@umich.edu` (sandbox recipient)

### Systems & Tools
- [ ] curl installed (for API calls)
- [ ] psql installed (for database queries)
- [ ] jq installed (for JSON parsing)
- [ ] Xcode installed (for simulator testing)
- [ ] iOS simulator available or physical device

### App & Infrastructure
- [ ] Backend API running: https://api.transplantwizard.com/health
- [ ] Database accessible and connected
- [ ] DUSW dashboard accessible: https://dusw.transplantwizard.com
- [ ] iOS app installed on simulator or device
- [ ] Deep linking configured in Info.plist

### Email
- [ ] Access to jrolls@umich.edu inbox
- [ ] Email client refreshing properly
- [ ] Know how to check spam/junk folders

---

## 🎯 Success Criteria

### Minimal Success (Critical Path)
✅ Email sent to sandbox recipient
✅ Deep link opens app
✅ Registration with referral token succeeds
✅ Patient auto-logged in

### Full Success (Complete System)
✅ All 9 stages pass
✅ All 50+ tests pass
✅ Zero errors in logs
✅ Zero crashes
✅ Database integrity maintained
✅ Audit logs complete

### Excellence (Production Ready)
✅ All tests pass
✅ Performance acceptable
✅ Error handling graceful
✅ Documentation complete
✅ Scaling verified
✅ Security validated

---

## 🐛 Common Issues & Quick Fixes

### "API not responding"
```bash
# Quick fix: Restart backend
ssh -i /Users/jeremy/.ssh/transplant-wizard-key.pem ec2-user@3.215.185.174 \
  "pkill -f 'node.*simple-auth-server' && \
   cd /home/ec2-user/transplant-wizard/backend-api && \
   AWS_PROFILE=Jeremy node src/simple-auth-server.js > /var/log/backend.log 2>&1 &"
```

### "Email not received"
- Check jrolls@umich.edu spam folder
- Verify backend logs: `tail -50 /var/log/backend.log | grep email`
- Verify email is to `jrolls@umich.edu` exactly (sandbox whitelist)

### "Deep link not opening app"
- Verify app is installed on device/simulator
- Try URL scheme from Safari first
- Check console for "Deep link received" message

### "Form pre-fill not working"
- Verify referral token is valid (not expired)
- Check API response: `curl https://api.transplantwizard.com/api/v1/patient/referral/<TOKEN>`
- Check console for "Referral data fetched" message

### "Registration fails"
- Verify all required fields are filled
- Check password meets requirements (8+ chars, upper, lower, number, symbol)
- Check email isn't already registered
- Check referral token is valid/not redeemed

---

## 📈 Testing Timeline Recommendations

### Sprint Testing (1 day)
- Morning: Quick verification (20 min)
- Afternoon: Focused component testing (1 hour)
- EOD: Bug fixes and re-test

### Release Testing (1 week)
- Day 1: Setup and prerequisites verification (30 min)
- Day 2-3: Comprehensive testing all stages (3 hours)
- Day 4-5: Edge case and error testing (2 hours)
- Day 6: Final verification and regression (1 hour)
- Day 7: Documentation and sign-off (30 min)

### UAT Testing (2 weeks)
- Week 1: QA comprehensive testing (3 hours)
- Week 1: Product owner verification (1 hour)
- Week 2: End users testing real workflows (flexible)
- Week 2: Bug fixes and final verification (2 hours)

---

## 📊 Test Report Template

Use this template to document your findings:

```markdown
# Test Report - DUSW Referral System

**Date**: ___________
**Tester**: _________
**Duration**: _______
**System Version**: _

## Executive Summary
Pass/Fail: ___
Critical Issues: ___
High Priority Issues: ___
Medium Priority Issues: ___

## Test Execution
Total Tests: 50+
Tests Passed: ___
Tests Failed: ___
Pass Rate: ___%

## Stage Results
- Stage 1 (API Health): ☐ PASS ☐ FAIL
- Stage 2 (Database): ☐ PASS ☐ FAIL
- Stage 3 (Dashboard): ☐ PASS ☐ FAIL
- Stage 4 (Email): ☐ PASS ☐ FAIL
- Stage 5 (Deep Link): ☐ PASS ☐ FAIL
- Stage 6 (Pre-Fill): ☐ PASS ☐ FAIL
- Stage 7 (Registration): ☐ PASS ☐ FAIL
- Stage 8 (Verification): ☐ PASS ☐ FAIL
- Stage 9 (Error Handling): ☐ PASS ☐ FAIL

## Issues Found
### Critical
1. [Description]
   - Impact: [What breaks]
   - Fix: [How to fix]
   - Status: Open/Fixed

### High
1. [Description]
   - Impact: [What's affected]
   - Fix: [How to fix]

### Medium/Low
1. [Description]
   - Impact: [Minor issue]
   - Fix: [How to fix]

## Performance Metrics
- API Response Time: ___ ms
- Email Send Time: ___ seconds
- Registration Time: ___ seconds
- Deep Link to App Open: ___ seconds

## Sign-Off
- Tester: ________
- Date: __________
- Overall Recommendation: ☐ Ready ☐ Not Ready

## Notes
[Any additional observations, environment notes, etc.]
```

---

## 🚀 Next Steps After Testing

### If ALL Tests Pass ✅
1. Deploy to production
2. Monitor backend logs for errors
3. Track email delivery rates
4. Monitor deep link success rates
5. Gather user feedback

### If SOME Tests Fail ⚠️
1. Document all failures
2. Prioritize by severity
3. Fix critical issues first
4. Re-test after each fix
5. Verify no regression

### If ALL Tests Fail ❌
1. Check prerequisites first
2. Verify infrastructure is running
3. Check network connectivity
4. Review deployment logs
5. Consider full rollback

---

## 📞 Support & Questions

### For Test Execution Issues
See QUICK_TEST_COMMANDS.md "Troubleshooting" section

### For Detailed Test Procedures
See TESTING_GUIDE.md full documentation

### For Quick Reference
See QUICK_TEST_COMMANDS.md copy-paste commands

### For System Architecture
See PROJECT_REFERENCE.md project structure

### For Implementation Details
See DUSW_REFERRAL_FINAL_DEPLOYMENT.md technical guide

---

## 📋 Final Checklist

Before declaring "Testing Complete":

- [ ] All prerequisite checks passed
- [ ] All 9 stages executed
- [ ] All critical issues resolved
- [ ] Test report completed
- [ ] Results documented in Jira/tickets
- [ ] Team briefed on results
- [ ] Known issues logged
- [ ] Next steps identified
- [ ] Sign-off obtained

---

**Estimated Total Time**: 30-45 minutes (comprehensive)
**Success Criteria**: All stages pass, zero critical issues
**Ready for**: QA, UAT, Production deployment

---

**Generated**: December 12, 2025
**Status**: ✅ System Ready for Testing
**Documents**:
- TESTING_GUIDE.md (Detailed procedures)
- QUICK_TEST_COMMANDS.md (Quick reference)
- TEST_EXECUTION_SUMMARY.md (This file - Navigation)
