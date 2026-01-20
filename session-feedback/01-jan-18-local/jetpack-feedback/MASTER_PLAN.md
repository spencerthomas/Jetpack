# JaroLoan LOS - Master Implementation Plan

## Overview

This plan implements a complete Mortgage Loan Origination System based on the North Star Functional and UX Brief. The UI is already built (43+ components). This plan focuses on the backend infrastructure.

## Architecture Summary

- **Frontend**: Next.js 16 with React 19, Tailwind CSS, shadcn/ui
- **Backend**: Next.js Server Actions and API Routes
- **Database**: PostgreSQL via Prisma ORM
- **Auth**: NextAuth.js v5 with Prisma Adapter
- **Real-time**: (Future) WebSockets or Server-Sent Events

---

## Epic 1: Foundation Layer

### E1-T1: Database Schema Foundation
**Priority**: Critical | **Skills**: database, prisma
**Files**: `prisma/schema.prisma`

Create the comprehensive Prisma schema for all LOS entities:
- User model with roles (loan_officer, processor, underwriter, closer, compliance, admin)
- Loan model with lifecycle stages
- Borrower model (URLA/1003 aligned)
- Property model with appraisal tracking
- All relationship definitions

**Acceptance Criteria**:
- [ ] Schema compiles with `npx prisma generate`
- [ ] All 25+ models defined with relationships
- [ ] Enums defined for stages, statuses, types

---

### E1-T2: Database Seed Data
**Priority**: High | **Skills**: database, typescript
**Files**: `prisma/seed.ts`
**Dependencies**: E1-T1

Create comprehensive test data:
- 6 users (one per role)
- 4 sample loans at different stages
- Conditions, disclosures, verifications
- Task templates

**Acceptance Criteria**:
- [ ] Seed runs successfully with `npm run db:seed`
- [ ] All loan stages represented

---

### E1-T3: Prisma Type Generation
**Priority**: Critical | **Skills**: typescript
**Files**: `lib/generated/prisma.ts`
**Dependencies**: E1-T1

Generate and export Prisma client types for use throughout the app.

**Acceptance Criteria**:
- [ ] Types generated and importable
- [ ] Re-export UserRole, LoanStage, etc. as TypeScript types

---

## Epic 2: Authentication & Authorization

### E2-T1: NextAuth Configuration
**Priority**: Critical | **Skills**: auth, nextjs
**Files**: `app/api/auth/[...nextauth]/route.ts`, `lib/auth/config.ts`
**Dependencies**: E1-T1

Configure NextAuth.js v5 with:
- Credentials provider for email/password
- Prisma adapter for user storage
- JWT sessions with role included
- Custom callbacks for session enrichment

**Acceptance Criteria**:
- [ ] Login/logout functional
- [ ] Session includes user role
- [ ] Prisma adapter stores sessions

---

### E2-T2: Permission System
**Priority**: Critical | **Skills**: typescript, auth
**Files**: `lib/auth/permissions.ts`
**Dependencies**: None (already exists, needs expansion)

Comprehensive permission matrix:
- All 60+ permissions defined
- Helper functions: hasPermission, hasAnyPermission, hasAllPermissions
- Role labels and descriptions

**Acceptance Criteria**:
- [ ] All permission keys documented
- [ ] Type-safe permission checking

---

### E2-T3: Session Utilities
**Priority**: High | **Skills**: auth, typescript
**Files**: `lib/auth/session.ts`
**Dependencies**: E2-T1

Server-side session utilities:
- `getServerSession()` - Get current session
- `requireAuth()` - Throw if not authenticated
- `requirePermission(perm)` - Throw if permission missing
- `requireRole(role)` - Throw if wrong role

**Acceptance Criteria**:
- [ ] All utilities work in Server Actions
- [ ] Proper error messages on denial

---

### E2-T4: Auth Components
**Priority**: Medium | **Skills**: react, auth
**Files**: `components/auth/login-form.tsx`, `components/auth/auth-provider.tsx`, `components/auth/role-gate.tsx`
**Dependencies**: E2-T1

Client-side auth components:
- LoginForm with validation
- AuthProvider for session context
- RoleGate for conditional rendering
- ProtectedRoute wrapper

**Acceptance Criteria**:
- [ ] Login form submits and redirects
- [ ] RoleGate hides unauthorized content

---

## Epic 3: Loan Management (Core CRUD)

### E3-T1: Loan Server Actions
**Priority**: Critical | **Skills**: api, prisma, typescript
**Files**: `lib/actions/loans.ts`
**Dependencies**: E1-T3, E2-T2

Complete loan CRUD operations:
- `createLoan(data)` - Create new loan
- `getLoan(id)` - Get with all relations
- `updateLoan(id, data)` - Update loan fields
- `deleteLoan(id)` - Soft delete
- `listLoans(filters)` - Paginated list
- `transitionStage(id, stage)` - Stage transitions with validation
- `getPipelineStats()` - Dashboard statistics

**Acceptance Criteria**:
- [ ] All CRUD operations work
- [ ] Stage transitions validate gates
- [ ] Audit log entries created

---

### E3-T2: Borrower Server Actions
**Priority**: High | **Skills**: api, prisma
**Files**: `lib/actions/borrowers.ts`
**Dependencies**: E1-T3

Borrower management:
- `createBorrower(loanId, data)` - Add borrower to loan
- `updateBorrower(id, data)` - Update borrower info
- `getBorrower(id)` - Get with sensitive field handling
- `inviteCoBorrower(loanId, email)` - Send co-borrower invite

**Acceptance Criteria**:
- [ ] URLA fields mapped correctly
- [ ] SSN masked for unauthorized users

---

### E3-T3: Property Server Actions
**Priority**: High | **Skills**: api, prisma
**Files**: `lib/actions/properties.ts`
**Dependencies**: E1-T3

Property management:
- `createProperty(loanId, data)` - Add property
- `updateProperty(id, data)` - Update property
- `orderAppraisal(id)` - Create appraisal order
- `receiveAppraisal(id, data)` - Record appraisal result

**Acceptance Criteria**:
- [ ] Property types handled correctly
- [ ] Appraisal workflow tracked

---

## Epic 4: Conditions & Task Management

### E4-T1: Condition Server Actions
**Priority**: Critical | **Skills**: api, prisma, workflow
**Files**: `lib/actions/conditions.ts`
**Dependencies**: E1-T3, E2-T2

Condition lifecycle:
- `createCondition(loanId, data)` - Issue condition
- `createFromTemplate(loanId, templateId)` - From template
- `receiveDocument(conditionId, docId)` - Link document
- `reviewCondition(conditionId)` - Mark reviewed
- `clearCondition(conditionId, notes)` - Clear condition
- `waiveCondition(conditionId, reason)` - Waive (UW only)
- `suggestConditions(loanId)` - AI suggestions

**Acceptance Criteria**:
- [ ] TRID condition types supported
- [ ] Owner/SLA tracking works
- [ ] Auto-match logic functional

---

### E4-T2: Condition Templates
**Priority**: High | **Skills**: prisma, typescript
**Files**: `lib/data/condition-templates.ts`
**Dependencies**: E1-T1

Standard condition templates:
- Income verification templates
- Asset verification templates
- Property-related templates
- Program-specific templates (FHA, VA, Conventional)

**Acceptance Criteria**:
- [ ] 30+ standard templates defined
- [ ] Templates categorized by type

---

### E4-T3: Task Server Actions
**Priority**: High | **Skills**: api, prisma
**Files**: `lib/actions/tasks.ts`
**Dependencies**: E1-T3, E2-T2

Task orchestration:
- `createTask(loanId, data)` - Create task
- `assignTask(taskId, userId)` - Assign to user
- `completeTask(taskId, result)` - Mark complete
- `getTaskQueue(userId)` - User's task queue
- `escalateTask(taskId)` - Escalate overdue

**Acceptance Criteria**:
- [ ] Priority and SLA tracking
- [ ] Role-based task routing

---

## Epic 5: Disclosures & Compliance

### E5-T1: Disclosure Server Actions
**Priority**: Critical | **Skills**: api, compliance, prisma
**Files**: `lib/actions/disclosures.ts`
**Dependencies**: E1-T3, E2-T2

TRID-compliant disclosure management:
- `createDisclosure(loanId, type)` - Generate disclosure
- `sendDisclosure(id, method)` - Send with tracking
- `recordDelivery(id, evidence)` - Proof of delivery
- `acknowledgeDisclosure(id)` - Borrower acknowledge
- `checkReDisclosureTriggers(loanId)` - Detect changes
- `getDisclosureTimeline(loanId)` - Timeline view

**Acceptance Criteria**:
- [ ] LE and CD types supported
- [ ] 3-day waiting period enforced
- [ ] Proof of delivery captured

---

### E5-T2: Disclosure Version Tracking
**Priority**: High | **Skills**: prisma, typescript
**Files**: `lib/actions/disclosure-versions.ts`
**Dependencies**: E5-T1

Version control for disclosures:
- `createVersion(disclosureId, data)` - Save version
- `getVersionDiff(v1, v2)` - Compare versions
- `getToleranceChanges(disclosureId)` - Tolerance tracking

**Acceptance Criteria**:
- [ ] Full version history maintained
- [ ] Diff view data generated

---

### E5-T3: HMDA Data Collection
**Priority**: Medium | **Skills**: compliance, prisma
**Files**: `lib/actions/hmda.ts`
**Dependencies**: E1-T3

HMDA reporting support:
- `collectHMDAData(loanId)` - Gather required fields
- `validateHMDAData(loanId)` - Run edit checks
- `exportLAR()` - Generate LAR export
- `getHMDAStats()` - Dashboard data

**Acceptance Criteria**:
- [ ] All HMDA fields captured
- [ ] Edit checks per FFIEC guide

---

## Epic 6: Documents & Verifications

### E6-T1: Document Server Actions
**Priority**: Critical | **Skills**: api, prisma, storage
**Files**: `lib/actions/documents.ts`
**Dependencies**: E1-T3, E2-T2

Document management:
- `uploadDocument(loanId, file, metadata)` - Upload with auto-classify
- `getDocument(id)` - Get with signed URL
- `updateDocument(id, data)` - Update metadata
- `deleteDocument(id)` - Soft delete
- `classifyDocument(id)` - AI classification
- `getDocumentsByType(loanId, type)` - Filter by type

**Acceptance Criteria**:
- [ ] File upload to storage
- [ ] Auto-classification working
- [ ] Signed URLs generated

---

### E6-T2: S3 Storage Service
**Priority**: Critical | **Skills**: aws, typescript
**Files**: `lib/services/storage.ts`
**Dependencies**: None

AWS S3 integration:
- `uploadFile(key, buffer, contentType)` - Upload to S3
- `getSignedUrl(key)` - Generate presigned URL
- `deleteFile(key)` - Delete from S3
- `listFiles(prefix)` - List by prefix

**Acceptance Criteria**:
- [ ] Uploads work to configured bucket
- [ ] Presigned URLs expire correctly

---

### E6-T3: Verification Server Actions
**Priority**: High | **Skills**: api, prisma
**Files**: `lib/actions/verifications.ts`
**Dependencies**: E1-T3

Verification hub:
- `orderVerification(loanId, type)` - Order verification
- `receiveVerification(id, result)` - Record result
- `refreshVerification(id)` - Refresh expired
- `getVerificationStatus(loanId)` - Summary view

**Acceptance Criteria**:
- [ ] All verification types supported
- [ ] Expiration tracking works

---

## Epic 7: Workflow Engine

### E7-T1: Stage Transition Logic
**Priority**: Critical | **Skills**: workflow, typescript
**Files**: `lib/workflow/stage-machine.ts`
**Dependencies**: E3-T1

State machine for loan stages:
- Stage transition guards
- Entry/exit actions
- Gate validation
- Rollback support

**Acceptance Criteria**:
- [ ] All 9 stages defined
- [ ] Guards prevent invalid transitions
- [ ] Actions trigger on transition

---

### E7-T2: SLA Management
**Priority**: High | **Skills**: workflow, typescript
**Files**: `lib/workflow/sla-engine.ts`
**Dependencies**: E4-T3

SLA tracking:
- SLA definitions by stage
- Timer calculations
- Escalation rules
- Warning thresholds

**Acceptance Criteria**:
- [ ] SLA breaches detected
- [ ] Escalations triggered

---

### E7-T3: Auto-Clear Engine
**Priority**: Medium | **Skills**: workflow, ai
**Files**: `lib/workflow/auto-clear.ts`
**Dependencies**: E4-T1, E6-T1

Automatic condition clearing:
- Document-condition matching rules
- Confidence thresholds
- Audit trail for auto-clears
- Override capability

**Acceptance Criteria**:
- [ ] Basic auto-match works
- [ ] All clears audited

---

## Epic 8: Audit & Logging

### E8-T1: Audit Log Service
**Priority**: Critical | **Skills**: prisma, typescript
**Files**: `lib/services/audit.ts`
**Dependencies**: E1-T3

Immutable audit trail:
- `logAction(category, action, details)` - Create log entry
- `getAuditLog(loanId)` - Get loan audit trail
- `searchAuditLog(filters)` - Search across logs
- `exportAuditLog(loanId)` - Export for compliance

**Acceptance Criteria**:
- [ ] All mutations logged
- [ ] User and timestamp captured
- [ ] Immutable storage

---

### E8-T2: Activity Feed Service
**Priority**: Medium | **Skills**: prisma, typescript
**Files**: `lib/services/activity.ts`
**Dependencies**: E8-T1

Real-time activity tracking:
- Format audit logs for display
- Filter by relevance
- Support pagination
- Group by time period

**Acceptance Criteria**:
- [ ] Activity feed populated
- [ ] Recent activity shown

---

## Epic 9: Reporting & Analytics

### E9-T1: Pipeline Analytics
**Priority**: High | **Skills**: prisma, analytics
**Files**: `lib/analytics/pipeline.ts`
**Dependencies**: E3-T1

Pipeline metrics:
- Volume by stage
- Conversion rates
- Cycle time analysis
- SLA breach rates

**Acceptance Criteria**:
- [ ] Dashboard data accurate
- [ ] Historical trends available

---

### E9-T2: Compliance Reports
**Priority**: Medium | **Skills**: compliance, prisma
**Files**: `lib/analytics/compliance.ts`
**Dependencies**: E5-T1, E8-T1

Compliance reporting:
- Disclosure timing analysis
- Re-disclosure rates
- Exception trends
- Audit summaries

**Acceptance Criteria**:
- [ ] TRID timing tracked
- [ ] Exception reports generated

---

## Epic 10: Integration Hub (Stubs)

### E10-T1: Integration Framework
**Priority**: Medium | **Skills**: api, typescript
**Files**: `lib/integrations/base.ts`
**Dependencies**: None

Base integration infrastructure:
- Integration configuration model
- Webhook handling
- Retry logic
- Error handling

**Acceptance Criteria**:
- [ ] Base classes defined
- [ ] Webhook endpoint works

---

### E10-T2: AUS Integration Stub
**Priority**: Low | **Skills**: api, integration
**Files**: `lib/integrations/aus.ts`
**Dependencies**: E10-T1

Stub for DU/LPA integration:
- Submit to AUS (mock)
- Receive findings (mock)
- Parse findings for display

**Acceptance Criteria**:
- [ ] Mock response returns
- [ ] Findings displayed

---

### E10-T3: Credit Integration Stub
**Priority**: Low | **Skills**: api, integration
**Files**: `lib/integrations/credit.ts`
**Dependencies**: E10-T1

Stub for credit bureau:
- Order credit (mock)
- Receive report (mock)
- Extract key metrics

**Acceptance Criteria**:
- [ ] Mock credit scores returned
- [ ] Report data available

---

## Dependency Graph

```
E1-T1 (Schema)
├── E1-T2 (Seed)
├── E1-T3 (Types)
│   ├── E3-T1 (Loans)
│   │   ├── E7-T1 (Stage Machine)
│   │   └── E9-T1 (Analytics)
│   ├── E3-T2 (Borrowers)
│   ├── E3-T3 (Properties)
│   ├── E4-T1 (Conditions)
│   │   └── E7-T3 (Auto-Clear)
│   ├── E4-T3 (Tasks)
│   │   └── E7-T2 (SLA)
│   ├── E5-T1 (Disclosures)
│   │   ├── E5-T2 (Versions)
│   │   └── E9-T2 (Compliance)
│   ├── E5-T3 (HMDA)
│   ├── E6-T1 (Documents)
│   │   └── E7-T3 (Auto-Clear)
│   ├── E6-T3 (Verifications)
│   └── E8-T1 (Audit)
│       └── E8-T2 (Activity)
│
E2-T1 (Auth Config)
├── E2-T3 (Session Utils)
└── E2-T4 (Auth Components)

E2-T2 (Permissions) - Independent
E4-T2 (Condition Templates) - Depends on E1-T1
E6-T2 (Storage) - Independent
E10-T1 (Integration Framework) - Independent
├── E10-T2 (AUS Stub)
└── E10-T3 (Credit Stub)
```

## Parallel Execution Batches

### Batch 1 (No Dependencies)
- E1-T1: Database Schema
- E2-T2: Permission System
- E6-T2: S3 Storage Service
- E10-T1: Integration Framework

### Batch 2 (After Schema)
- E1-T2: Database Seed
- E1-T3: Prisma Types
- E2-T1: NextAuth Config
- E4-T2: Condition Templates

### Batch 3 (After Types/Auth)
- E2-T3: Session Utilities
- E2-T4: Auth Components
- E3-T1: Loan Actions
- E3-T2: Borrower Actions
- E3-T3: Property Actions
- E4-T1: Condition Actions
- E4-T3: Task Actions
- E5-T1: Disclosure Actions
- E5-T3: HMDA Data
- E6-T1: Document Actions
- E6-T3: Verification Actions
- E8-T1: Audit Service

### Batch 4 (After Core Actions)
- E5-T2: Disclosure Versions
- E7-T1: Stage Machine
- E7-T2: SLA Engine
- E8-T2: Activity Feed
- E9-T1: Pipeline Analytics
- E10-T2: AUS Stub
- E10-T3: Credit Stub

### Batch 5 (Final)
- E7-T3: Auto-Clear Engine
- E9-T2: Compliance Reports

---

## File Ownership Matrix

To prevent file locking conflicts, each task owns specific files:

| Task | Primary Files | Shared Dependencies |
|------|--------------|---------------------|
| E1-T1 | prisma/schema.prisma | - |
| E1-T2 | prisma/seed.ts | E1-T1 |
| E1-T3 | lib/generated/prisma.ts | E1-T1 |
| E2-T1 | app/api/auth/*, lib/auth/config.ts | E1-T3 |
| E2-T2 | lib/auth/permissions.ts | - |
| E2-T3 | lib/auth/session.ts | E2-T1 |
| E2-T4 | components/auth/* | E2-T1 |
| E3-T1 | lib/actions/loans.ts | E1-T3, E2-T2, E8-T1 |
| E3-T2 | lib/actions/borrowers.ts | E1-T3 |
| E3-T3 | lib/actions/properties.ts | E1-T3 |
| E4-T1 | lib/actions/conditions.ts | E1-T3, E2-T2 |
| E4-T2 | lib/data/condition-templates.ts | E1-T1 |
| E4-T3 | lib/actions/tasks.ts | E1-T3, E2-T2 |
| E5-T1 | lib/actions/disclosures.ts | E1-T3, E2-T2 |
| E5-T2 | lib/actions/disclosure-versions.ts | E5-T1 |
| E5-T3 | lib/actions/hmda.ts | E1-T3 |
| E6-T1 | lib/actions/documents.ts | E1-T3, E6-T2 |
| E6-T2 | lib/services/storage.ts | - |
| E6-T3 | lib/actions/verifications.ts | E1-T3 |
| E7-T1 | lib/workflow/stage-machine.ts | E3-T1 |
| E7-T2 | lib/workflow/sla-engine.ts | E4-T3 |
| E7-T3 | lib/workflow/auto-clear.ts | E4-T1, E6-T1 |
| E8-T1 | lib/services/audit.ts | E1-T3 |
| E8-T2 | lib/services/activity.ts | E8-T1 |
| E9-T1 | lib/analytics/pipeline.ts | E3-T1 |
| E9-T2 | lib/analytics/compliance.ts | E5-T1 |
| E10-T1 | lib/integrations/base.ts | - |
| E10-T2 | lib/integrations/aus.ts | E10-T1 |
| E10-T3 | lib/integrations/credit.ts | E10-T1 |

---

## Success Metrics

1. **Build passes**: `npm run build` succeeds
2. **Tests pass**: `npm run test` passes
3. **Type safety**: No TypeScript errors
4. **Seed works**: Database seeds successfully
5. **Auth works**: Login/logout functional
6. **CRUD works**: All Server Actions functional
