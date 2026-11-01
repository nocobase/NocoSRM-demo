# Supplier admission UI and process design

Reference: `docs/srm-mvp-plan.md` V1.0, structural requirements. There is no external visual reference. Preserve the application shell, theme tokens, shared DataTable and standard lifecycle diagram.

## Process sheet

One supplier account owns one company. The company lifecycle has draft, pending, rejected and approved states. Procurement managers form one first-answer pool in the Approval plugin. Approve creates the supplier master atomically; rejection returns to editable rejected state, and resubmission creates fresh tasks and a new immutable version. No delegation, withdrawal, countersigning or self-approval is offered. Empty reviewer selection refuses submission. Current permission checks apply to every decision and download.

| Stage   | Strategy                                    | People source                                     | Actions                                                                | Outcomes                                 |
| ------- | ------------------------------------------- | ------------------------------------------------- | ---------------------------------------------------------------------- | ---------------------------------------- |
| pending | One non-claimable pool; first decision wins | Explicit active users with procurement permission | Approve (optional comment), reject (required reason, 2,000 characters) | Approved → approved; rejected → rejected |

| Step                       | Atomic business writes                                                                                        | External effect                              |
| -------------------------- | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| Register and first profile | Bind authenticated verified user to one company                                                               | Verification uses native authentication mail |
| Save                       | Editable company draft; preserve status and prior submissions                                                 | None                                         |
| Submit/resubmit            | Validate full profile and files, reserve unique credit code, increment submission version and insert snapshot | Durable notification to procurement managers |
| Approve                    | Approval conclusion, supplier number, admission time and audit                                                | Durable notification to applicant            |
| Reject                     | Approval conclusion, comment and audit                                                                        | Durable notification to applicant            |

## Pages and API contracts

Supplier home links to admission form, version history and read-only admitted profile. Procurement navigation contains Applications and Suppliers. System management includes existing Users and Roles, categories, admission workflow and delivery diagnostics. Multi-section detail and form use covering child pages; small category edits use route dialogs. Lists use DataTable, search, state/category/date filters, pagination and links preserving query context. Fields follow the requirement document. Each state has localized feedback; failed writes preserve input; conflicts refresh authoritative state. Unsaved form changes require a close guard.

The API namespace is `srm`: context, own profile, categories, applications, suppliers, detail, save, submit, decisions, workflow and notification retries. All successful responses use `{ data }`; lists include pagination metadata. Authentication, explicit business actions and company ownership are checked server-side. Writes use submission keys and database transactions. File upload/download uses the registered File plugin with protected content paths and owner metadata, validates PDF/JPEG/PNG bytes, 10 MB and ten files, and preserves historical links. Public registration uses Better Auth with email verification, rate limits and native password reset.

## Components and acceptance

Reuse PageContainer, PageHeader, Input, Label, Textarea, Checkbox, Select, Card, StatusBadge, RecordLink, DataTable, AlertDialog, RouteChildPage, LifecycleDiagram and workflow-management sources. Add missing primitives with shadcn. All copy is application-owned English/Chinese locale keys. Responsive forms stack at narrow widths; lists scroll horizontally. Standard neutral and semantic status tokens support light/dark and both density presets.

Acceptance follows AC-01 through AC-20 in the source plan, plus explicit manager-role revocation, native approval tasks and new runs on resubmission. Capture real execution evidence, distinguishing environment-dependent SMTP delivery and manual UI review from automated checks.

## Scope adjustment confirmed by the user

The admission definition and execution diagrams follow the NocoBase UI Library workflow-management demo as a style reference (`ui-library/website/demo/lifecycle/workflow-management/index.tsx` in the source workspace). Use `LifecycleDiagram` with `presentation='process'`: compact boundary pills, the pending state's approval card, a negative rejected state, and the successful admitted state. Preserve native automatic layout, controls, return-path notes and execution highlighting.

Email integration is deferred. The MVP uses native email/password registration and login without email verification. Email verification, password recovery delivery and external mailbox delivery acceptance are excluded from this iteration; in-app business notifications remain required. No SMTP credentials are needed for UI testing.

## Supplier and employee access

The unified account system has separate entry presentations: public `/supplier` explains materials and application steps, `/login` offers supplier sign-in and registration when enabled, and `/login?portal=staff` offers employee sign-in without self-registration. Entry links preserve the existing return query. Existing AuthPage and SRM cards are structure and style references; no external visual reference or theme replacement applies. Registering creates an applicant, not an admitted supplier. Employees are provisioned by administrators through Users.

The `srm-supplier` permission set grants the existing `srmAdmission` page and explicit `applyAdmission` action. Root alone is not an applicant. The authenticated home displays only authorized work, and the sidebar adds an explicit supplier capability filter. Existing company owners retain access through a one-time seed; no global authenticated supplier grant is introduced. Administrators can revoke or restore the supplier role. A roleless account sees an administrator-contact message. A dual-authorized person sees both work entries but cannot review their own application. Native sign-out switches accounts; no client-selectable role can elevate access.

Acceptance: public entry works without a session; employee presentation omits registration; public registration ignores requested employee/root roles; root and ordinary staff cannot submit supplier data without supplier access; suppliers cannot use internal review APIs; revocation also denies receipt replays and owned-file access. Registration provisioning failure returns an error after account creation and provides localized guidance to recover through User management. Client tests cover both languages and permission-aware home behavior; runtime browser verification is reported separately from automated API tests.

The login-type selector uses two full-width icon links composed from the shared Button inside a muted bordered segment. The active entry uses the primary variant and aria-current; the inactive entry uses the ghost variant. The public onboarding information link sits separately below the form so it does not compete with identity selection. This visual emphasis follows the user’s explicit request for a more obvious switch.

Supplier registration completion lives at `/registration-complete`, outside the guest-only route group. The native registration action refreshes the authentication provider before returning, and that provider temporarily unmounts guest pages; a local success flag on `/register` is therefore lost. The application page calls native `client.signUp.email` with the public authentication error resolver, navigates to the completion route on success, and only then refreshes the session. The completion page survives pending refresh, offers login or the authenticated workspace, and hides the submitted form. Failed registration retains inputs and allows retry. No credentials are persisted in router state. Direct visits without completion state return to public onboarding.
