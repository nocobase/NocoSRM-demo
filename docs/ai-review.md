# AI review for supplier admission

AI review is disabled by default. Procurement can always approve or reject while a review is running. Only an `approve` recommendation with confidence greater than or equal to the configured threshold can automatically answer the original procurement task. Rejection recommendations, uncertainty, invalid output, unavailable services and a 30-second timeout leave that task available to its existing reviewers.

## Configuration

An administrator opens **System settings → Models**, creates an enabled chat model service and enters its API key there. The recommended initial model is DeepSeek's `deepseek-flash`; the review settings can select any enabled chat model from the native catalog. Model keys are encrypted by the native secrets service and never appear in the SRM settings or approval evidence. Production must retain its configured secrets keys.

In **Workflow management → Definitions**, use the AI review card or the configuration button on the procurement node. Select the model, set an output limit, and enter a confidence threshold between 0 and 1 after calibrating against procurement-labeled examples. No numeric threshold is supplied by the application. Enabling review requires both a model and a threshold. Save applies the settings to new submissions and resubmissions; an in-flight review retains the values recorded for its submission.

Viewing the workflow and its settings requires `srm.business/inspectWorkflow`; saving additionally requires `configureAiReview`. Native Models uses the separate `agents.services` read/manage permissions. Administrators assign these through Roles and permissions; no wildcard business assignment is added. The AI identity is a code-owned system actor, not a user account or a procurement-manager impersonation. There is no HTTP or CLI endpoint for automatic approval.

## Review data and evidence

The model receives company name, credit code, address, introduction, products, selected category names and attachment type/name metadata from the submitted snapshot. Contact name, phone, email, referrer and attachment contents are excluded. The review covers text consistency, not license authenticity or external company verification. Missing evidence or questions that require external verification belong to human review.

Authorized application readers can inspect the recommendation, confidence, actual threshold, reasons, model, submission version and outcome on the application detail. Successful automatic decisions also retain the original native `approve` action, task, AI actor, and evidence in the approval transaction. Applicants receive their original process history without internal model evidence. Provider error text and model keys are not returned in the review record.

## Installation and deployment

The new migration creates one settings row collection and does not rewrite existing applications. Review results reuse lifecycle effects and SRM audit storage. Each submission snapshots the current settings and queues one review effect; a disabled review finishes without a model call. Enabled reviews invoke the native model gateway, whose SDK may internally retry. Effect execution uses the existing lifecycle jobs dispatcher rather than holding the submission request open.

Two versioned pnpm patches ship in `patches/`, selected by `patchedDependencies` in `pnpm-workspace.yaml`. Approval gains a server-only `approveAutomatically({ taskId, requestId, evidence })` guarded by its definition's explicit authorization callback. Normal system `perform` calls remain refused. The App CLI patch carries these runtime patches into the independent production dependency installation; omitting that patch would leave production without the new method. Use `pnpm patch` / `pnpm patch-commit` for maintenance, never edit installed hard-linked dependencies.

Validation includes authenticated and unauthorized settings requests, calibration boundaries, malformed responses, failure and timeout, original human decisions, human/AI competition, request replay and old results after resubmission. After changing either patch, verify a fresh `pnpm install --frozen-lockfile`, build the archive and execute an automatic native decision from its extracted `dist`, in addition to the targeted tests. Real-provider quality and latency require the administrator's configured model and labeled examples; automated verification uses controlled model responses.
