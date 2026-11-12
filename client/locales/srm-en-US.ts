export default {
  notFound:
    'This record does not exist or has been deleted. Return to the list.',
  deniedHint: 'Ask an administrator to grant access before trying again.',
  signInAgain: 'Sign in again',
  ai: {
    inputScope:
      'Reviews submitted business text and attachment names only. Attachment contents are not sent; document authenticity is not assessed.',
    backgroundActions: 'Background actions',
    save: 'Save settings',
    title: 'AI review',
    actor: 'AI review',
    description:
      'Review submitted text for consistency. Human approval remains available at all times.',
    enabled: 'Enable AI review',
    enableHint:
      'Changes take effect after saving. Only an approval recommendation at or above the threshold passes automatically.',
    model: 'Model',
    models: 'Models',
    selectModel: 'Select a configured chat model',
    noModels: 'No chat models configured',
    noModelsHint:
      'Ask a model administrator to add an enabled model service. Human approval remains available.',
    threshold: 'Confidence threshold',
    thresholdHint:
      'Choose a value from 0 to 1 after calibration against labeled examples. There is no default threshold.',
    tokens: 'Maximum output tokens',
    invalidModel: 'Select an available chat model before enabling review.',
    invalidThreshold: 'Enter a calibrated threshold between 0 and 1.',
    invalidTokens: 'Enter a whole number between 128 and 4096.',
    saved: 'AI review settings saved',
    saving: 'Saving…',
    readOnly:
      'You can inspect these settings. Ask an administrator for permission to change them.',
    configure: 'Configure AI review',
    recommendation: 'Recommendation',
    confidence: 'Confidence / threshold',
    notRecorded: 'No AI review has been recorded for this application.',
    fallbackHint:
      'AI review could not complete this decision. The original human approval remains available.',
    outcomes: {
      automatic: 'Automatically approved',
      manual: 'Sent to human review',
      superseded: 'Already handled by another decision',
      disabled: 'AI review disabled',
    },
    recommendations: {
      approve: 'Approve',
      reject: 'Do not approve',
      uncertain: 'Uncertain',
    },
  },
  registrationComplete: 'Registration submitted',
  registrationNextStep:
    'Sign in to complete company details and submit qualifications. Registration does not mean admission.',
  continueToLogin: 'Continue to supplier sign in',

  registrationClosed:
    'Self-registration is currently closed. Contact procurement or an administrator for a supplier account.',
  registrationRecovery:
    'If your account was created but access is unavailable, sign in and contact an administrator to assign the Supplier applicant role. Do not register again.',
  supplierRole: 'Supplier applicant',
  supplierWorkspace: 'Supplier portal',
  staffWorkspace: 'Internal workspace',
  workspaceDescription:
    'Your available work is determined by your account permissions.',
  noWorkspace:
    'No business access has been assigned. Contact your administrator.',
  staffLogin: 'Employee sign in',
  supplierLogin: 'Supplier sign in',
  staffLoginDescription:
    'Use your administrator-provided account. Selecting this entry does not grant employee access.',
  supplierLoginDescription:
    'Sign in to prepare your application and track the review.',
  loginEntry: 'Sign-in entry',
  entryTitle: 'Supplier onboarding',
  entryDescription:
    'Create an applicant account, submit company qualifications and track admission.',
  entryMaterials: 'Prepare your materials',
  entryMaterialsDescription:
    'Company legal name, registration number, business license, supply categories and contact details. PDF, JPG and PNG files up to 10 MB are accepted.',
  entryStepAccount:
    'Register a supplier account. Registration does not mean admission.',
  entryStepSubmit:
    'Sign in, complete company details, upload qualifications and submit.',
  entryStepReview:
    'Track procurement review. Revise rejected applications; approved applications become supplier records.',
  registerAndApply: 'Register and apply',
  openWorkspace: 'Open my workspace',

  title: 'Supplier relationship management',
  description:
    'Supplier registration, admission review and trusted supplier records.',
  admission: 'My admission',
  admissionDescription:
    'Complete your company profile, submit qualifications and track the admission decision.',
  openAdmission: 'Open admission',
  applications: 'Admission applications',
  applicationsDescription:
    'Review submitted company profiles in submission order.',
  openApplications: 'Review applications',
  suppliers: 'Supplier directory',
  suppliersDescription:
    'Find admitted suppliers and their approved qualification records.',
  openSuppliers: 'Browse suppliers',
  profile: 'Company profile',
  categories: 'Supply categories',
  category: 'Supply category',
  categoriesDescription:
    'Maintain supply options; disabled options remain visible in history.',
  newCategory: 'New category',
  editCategory: 'Edit category',
  nameZh: 'Chinese name',
  nameEn: 'English name',
  active: 'Active',
  inactive: 'Disabled',
  save: 'Save draft',
  saving: 'Saving…',
  saved: 'Draft saved',
  submit: 'Submit application',
  submitted: 'Application submitted',
  cancel: 'Cancel',
  remove: 'Remove from draft',
  referrerHint:
    'If a salesperson introduced you to register, enter their name.',
  creditLocked:
    'The registered credit code is locked. Contact an administrator to correct it.',
  attachments: 'Qualification documents',
  license: 'Business license',
  fileHint:
    'PDF, JPG or PNG; up to 10 MB per file, 10 files total. A business license is required. Historical files remain available when removed from the draft.',
  otherMaterial: 'Supplementary qualification',
  materialName: 'Material name',
  upload: 'Upload qualification',
  uploading: 'Uploading…',
  declaration:
    'I confirm that all submitted information and documents are true and accurate.',
  unsaved: 'Your changes will be saved automatically when you submit.',
  confirmSubmit: 'Submit admission application',
  submitHint:
    'The submitted version will be locked while procurement reviews it.',
  approve: 'Approve',
  reject: 'Reject',
  approveHint:
    'Confirm admission. This creates a permanent supplier record from the reviewed version.',
  rejectHint:
    'Give a specific reason. The supplier may correct the profile and resubmit.',
  reason: 'Rejection reason',
  comment: 'Comment (optional)',
  supplierNo: 'Supplier number',
  admittedAt: 'Admitted at',
  submittedAt: 'Submitted at',
  status: 'Status',
  version: 'Submission version {{version}}',
  versionLabel: 'Submission version',
  applicationDetail: 'Admission details',
  progress: 'Approval progress',
  history: 'Submitted versions and history',
  noSubmissions: 'No application has been submitted.',
  procurement: 'Procurement manager',
  system: 'System',
  firstDecision:
    'The first authorized manager’s decision concludes the review.',
  loading: 'Loading',
  empty: 'No data yet',
  noResults: 'No results',
  failed:
    'The request failed. Your input is preserved; check the result before retrying.',
  denied: 'Access denied',
  expired: 'Session expired',
  retry: 'Retry',
  refresh: 'Refresh',
  clear: 'Clear filters',
  search: 'Search company name or credit code',
  searchButton: 'Search',
  allStatuses: 'All statuses',
  allCategories: 'All categories',
  workflows: 'Workflow management',
  definitions: 'Definitions',
  executions: 'Executions',
  execution: 'Execution',
  rule: 'Review policy',
  parameters: 'Parameters',
  fixedProcess:
    'This is a fixed single-stage process with no adjustable business parameters. Assign procurement managers through User management.',
  end: 'End',
  deliveryStatus: 'Notification delivery status',
  notification: 'Notification',
  attempts: 'Attempts',
  actions: 'Action',
  audit: 'Audit history',
  actor: 'Operator',
  company: 'Company',
  time: 'Time',
  registerTitle: 'Supplier registration',
  registerDescription:
    'Create an account with your email and password to start supplier admission.',
  registered:
    'If this email address was not registered before, sign in with the details you just entered. If it was, sign in with your existing account or contact an administrator.',
  referrerLabel: 'Referrer name (optional)',
  fields: {
    legalName: 'Legal company name',
    creditCode: 'Unified social credit code',
    address: 'Registered address',
    introduction: 'Company introduction (optional)',
    categories: 'Supply categories',
    products: 'Main products or services',
    contactName: 'Contact name',
    phone: 'Contact phone',
    contactEmail: 'Business contact email',
    referrerName: 'Referrer name (optional)',
  },
  errors: {
    AI_MODEL_UNAVAILABLE:
      'Select an available chat model in Models before enabling review.',
    INVALID_INPUT: 'Check the highlighted fields.',
    ACCESS_DENIED: 'You do not have permission for this action.',
    PROFILE_INCOMPLETE:
      'Complete the required fields, choose a category and attach a business license.',
    PROFILE_LOCKED: 'This profile is locked during review and after admission.',
    STATE_CHANGED:
      'The application changed. Refresh and review its latest status.',
    CONFLICT: 'Another manager has already handled this application.',
    CONTENT_CHANGED:
      'The reviewed content changed. Reload before making a decision.',
    CREDIT_CODE_LOCKED: 'The registered credit code cannot be changed.',
    COMPANY_ALREADY_REGISTERED:
      'This company is registered. Contact an administrator for verification.',
    EMAIL_VERIFICATION_REQUIRED:
      'Verify your email before completing admission.',
    CATEGORY_UNAVAILABLE:
      'A selected category is disabled. Choose an active category.',
    INVALID_ATTACHMENTS:
      'A qualification file is unavailable or does not belong to your company.',
    INVALID_FILE: 'Choose a valid file no larger than 10 MB.',
    INVALID_FILE_TYPE: 'Only valid PDF, JPG and PNG files are supported.',
    REJECTION_REASON_REQUIRED: 'Enter a rejection reason.',
    NO_ASSIGNEE:
      'No eligible procurement manager is assigned. Contact an administrator.',
    OPERATION_CONFLICT:
      'This operation has a pending result. Retry the original input.',
  },
  states: {
    draft: 'Draft',
    pending: 'Pending review',
    rejected: 'Rejected',
    approved: 'Admitted',
  },
  permissions: {
    configureAiReview: 'Configure AI review',
    applyAdmission: 'Apply for own company admission',
    readApplications: 'Read applications',
    approve: 'Approve admission',
    reject: 'Reject admission',
    readSuppliers: 'Read supplier directory',
    manageCategories: 'Manage supply categories',
    inspectWorkflow: 'Inspect admission workflow',
    retryNotifications: 'Retry notifications',
  },
  transitions: {
    saveDraft: 'Save draft',
    saveRejected: 'Revise returned profile',
    submit: 'Submit',
    resubmit: 'Resubmit',
    approved: 'Approve',
    rejected: 'Reject',
  },
  dateRange: 'Submission / admission dates',
  lastDays: 'Last {{days}} days',
  apply: 'Apply',
  validation: {
    required: 'This field is required.',
    creditCode:
      'Enter the 18-character unified social credit code from your business license. Use digits and uppercase letters, excluding I, O, S, V and Z.',
    phone:
      'Enter 7–30 characters using digits, spaces, parentheses or hyphens, with an optional leading +.',
    contactEmail: 'Enter a valid email address, such as name@example.com.',
    maxLength: 'Use no more than {{max}} characters.',
    categories: 'Select at least one supply category.',
    attachments: 'Upload a business license (PDF, JPG or PNG).',
  },
  invalidField: 'Check this field.',
  historyHint: 'Select a step to inspect recorded state.',
  step: 'Step',
  from: 'From',
  to: 'To',
  error: 'Error',
  stepNumber: 'Step {{step}}',
  created: 'Created',
  manualRetry: 'Operator retry from workflow management',
  categoryNotFound: 'This category does not exist.',
  effectStates: {
    queued: 'Queued',
    running: 'Running',
    succeeded: 'Succeeded',
    failed: 'Failed',
    dead: 'Retries exhausted',
    cancelled: 'Cancelled',
    pending: 'Pending',
    processing: 'Processing',
    retrying: 'Retrying',
    accepted: 'Delivered',
    unknown: 'Unknown result',
    completed: 'Completed',
    partial: 'Partially delivered',
  },
};
