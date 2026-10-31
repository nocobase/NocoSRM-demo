# SRM MVP testing

The application uses native NocoBase authentication, authorization, File Repository, private Drive, Approval, lifecycle and in-app notifications. Email verification and email password recovery are deferred by request. Registration accepts email/password directly. Procurement authority is assigned explicitly through System settings → User management; system administration alone does not permit approval.

## Optional samples

Run `pnpm nocobase db sample` in development after verification. The optional generator creates three supply categories, five fictional accounts, sample PDFs and companies in draft, pending, rejected and approved states. It uses the real account, file and approval services, preserves unrelated data, and does not duplicate existing sample companies on a repeated run. The shared sample password is `12345678`.

| Account             | Purpose                                                     |
| ------------------- | ----------------------------------------------------------- |
| `manager@srm.test`  | Procurement manager                                         |
| `draft@srm.test`    | Incomplete editable draft                                   |
| `pending@srm.test`  | Submitted application awaiting review                       |
| `rejected@srm.test` | Returned application with a reason; may revise and resubmit |
| `approved@srm.test` | Admitted supplier with a read-only profile                  |

All data is fictional and intended for this local development instance. No email is sent. Sample files remain private. There is no bulk-delete command: do not reset or delete unrelated application data to remove the samples. Use a separate development database when a clean UI test run is needed.

## UI walkthrough

1. Sign in as the manager. Inspect the pending company, license, referrer and submitted version, then approve or reject. An empty rejection reason is refused.
2. Sign in as the rejected supplier. Read the reason, change the profile or referrer, save, confirm truthfulness and resubmit. Old snapshots, opinions and attachments remain available; procurement sees only submitted versions.
3. Sign in as the admitted supplier. Check the unique number and read-only profile. The internal directory and other companies' files must remain inaccessible.
4. As the administrator, manage users, explicit roles and categories. Open Workflow management to inspect the fixed definition and actual executions, transitions, notification effects and delivery attempts. An already-selected disabled category can be removed from a returned draft.
5. Check each account's inbox, read/unread state and business links. Removing a procurement manager's role prevents further direct approval calls.

## Verification

Automated tests cover migration up/down and uniqueness, native registration without mail, private upload/download, incomplete drafts, snapshot immutability, rejection/resubmission, first-answer concurrency, role revocation, transaction rollback, notification failure/retry and repeatable sample generation. Component tests cover save behavior, frozen profiles, manager visibility and disabled category removal. Route tests pin page grants and translated permission labels. Local evidence and screenshots are in `storage/ui-workflow/srm/`. Authenticated visual acceptance remains the user's UI test.
