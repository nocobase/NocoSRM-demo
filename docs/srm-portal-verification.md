# Supplier portal verification

Unified users now have separate supplier and employee login presentations. Public onboarding is `/supplier`, supplier login is `/login`, employee login is `/login?portal=staff`, and successful registration enters `/registration-complete`. These paths are relative to the application's base path. Durable decisions and the registration-refresh fix are recorded in [the SRM UI design](ui/pages/srm.md).

## Completed checks

Scoped SRM server tests and initialized-assignment safety checks pass. Coverage includes real native public registration, ignoring requested employee/root roles, explicit applicant grants, employee/root rejection without applicant access, supplier rejection from internal lists, role revocation including receipt replay and context reads, failed provisioning and administrator recovery, and dual-authorized self-review rejection. Existing draft, submission, rejection/resubmission, approval and transaction rollback regressions pass.

Scoped client tests pass for home visibility, routes, permission labels, both authentication languages, entry switching with return queries, closed-registration guidance, and registration completion. The completion test uses the real authentication provider and guest guard with a delayed session refresh, proving that the success page remains mounted. Failed registration retains input and supports retry.

Client, server and test TypeScript projects pass. Targeted ESLint and formatting checks pass. The client production build and server TypeScript emit pass; the client build reports existing large-chunk warnings. Documentation rule/link checks pass. No workspace-wide validation was run.

The new supplier-access seed is applied to the current development database. Read-only verification found four company owners and four corresponding supplier assignments. The seed preserves existing permission definitions and unrelated assignments. No business records were removed.

## Browser evidence and limitations

The current checkout owns the server on port 13000, with `/main` as the verified application base path. Public onboarding and both login entries passed Chromium checks at 1440px and 375px, with no page-script errors or horizontal overflow. The prominent segmented login selector was checked with both theme presets in light and dark. Registration failure/retry, completion and the login action were checked using intercepted registration responses, without creating browser test accounts; real native registration is covered by the server integration tests.

Screenshots are retained under `storage/ui-workflow/portal-access/screenshots/`. The completion screenshot is `registration-complete-375.png`; the employee login screenshot is `staff-login-375.png`. Authenticated browser journeys and Chinese IME remain unverified because no authenticated browser session was supplied. Automated server and component checks do not substitute for those browser checks.

## Review fixes

The independent review identified a revoked-supplier context-data leak; the endpoint now omits company data without applicant permission and a server regression passes. Registration provisioning failure has explicit administrator recovery. Both login entry links retain return queries, home context reloads on permission revision, and disabled registration explains how to obtain an account. The later user-reported loss of registration feedback was traced to native session refresh unmounting the guest page and fixed with a separate optional completion route.

To remove only the retained temporary browser artifacts after inspection:

```bash
rm -r storage/ui-workflow/portal-access
```
