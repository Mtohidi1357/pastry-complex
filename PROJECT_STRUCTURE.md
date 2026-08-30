# Next.js Project Structure

```text
pastry-complex/
├── prisma
│   ├── migrations
│   │   ├── 20260804073135_init
│   │   │   └── migration.sql
│   │   ├── 20260804110803_adding_branch_to_daily_request
│   │   │   └── migration.sql
│   │   └── migration_lock.toml
│   ├── seed
│   │   ├── branches.ts
│   │   ├── index.ts
│   │   ├── productCategories.ts
│   │   ├── products.ts
│   │   ├── roles.ts
│   │   └── users.ts
│   ├── schema.prisma
│   └── seed.ts
├── public
│   ├── file.svg
│   ├── globe.svg
│   ├── next.svg
│   ├── vercel.svg
│   └── window.svg
├── src
│   ├── app
│   │   ├── (auth)
│   │   │   ├── login
│   │   │   │   └── page.tsx
│   │   │   └── layout.tsx
│   │   ├── dashboard
│   │   │   ├── login
│   │   │   ├── admin
│   │   │   ├── inbox
│   │   │   │   └── page.tsx
│   │   │   ├── inventory
│   │   │   ├── orders
│   │   │   ├── reports
│   │   │   ├── workshop
│   │   │   ├── page.tsx
│   │   │   └── layout.tsx      
│   │   ├── api
│   │   │   ├── auth
│   │   │   │   └── login
│   │   │   │       └── route.ts
│   │   │   ├── daily-requests
│   │   │   │   ├── [id]
│   │   │   │   │   ├── history
│   │   │   │   │   │   └── route.ts
│   │   │   │   │   ├── lines
│   │   │   │   │   │   ├── [lineId]
│   │   │   │   │   │   │   └── route.ts
│   │   │   │   │   │   └── route.ts
│   │   │   │   │   ├── transition
│   │   │   │   │   │   └── route.ts
│   │   │   │   │   └── route.ts
│   │   │   │   └── route.ts
│   │   │   └── dashboard
│   │   │       ├── branch-performance
│   │   │       │   └── route.ts
│   │   │       ├── recent-activity
│   │   │       │   └── route.ts
│   │   │       ├── request-status-distribution
│   │   │       │   └── route.ts
│   │   │       ├── request-trend
│   │   │       │   └── route.ts
│   │   │       ├── work-queue
│   │   │       │   └── route.ts
│   │   │       ├── workshop
│   │   │       │   └── route.ts
│   │   │       └── route.ts
│   │   ├── favicon.ico
│   │   ├── globals.css
│   │   ├── layout.tsx
│   │   ├── loading.tsx
│   │   ├── not-found.tsx
│   │   └── page.tsx
│   ├── components
│   │   ├── cases
│   │   │   ├── CaseCard.tsx
│   │   │   ├── CaseStatusFlow.tsx
│   │   │   ├── CaseTimeLine.tsx
│   │   │   └── DelegationForm.tsx
│   │   ├── common
│   │   │   ├── ConfirmDialog.tsx
│   │   │   ├── DataTable.tsx
│   │   │   ├── LoadingSpinner.tsx
│   │   │   ├── Modal.tsx
│   │   │   └── StatusBadge.tsx
│   │   ├── layout
│   │   │   ├── AppShell.tsx
│   │   │   ├── Breadcrumbs.tsx
│   │   │   ├── Navbar.tsx
│   │   │   └── Sidebar.tsx
│   │   └── workspace
│   │       ├── PriorityBadge.tsx
│   │       └── TaskCard.tsx
│   ├── context
│   │   ├── AppContext.tsx
│   │   ├── AuthContext.tsx
│   │   └── WorkspaceContext.tsx
│   ├── errors
│   │   ├── AppError.ts
│   │   ├── AuthenticationError.ts
│   │   ├── BusinessError.ts
│   │   ├── DuplicateDailyRequestError.ts
│   │   ├── index.ts
│   │   ├── InvalidTransitionError.ts
│   │   ├── NotFoundError.ts
│   │   ├── PermissionDeniedError.ts
│   │   ├── RequestNotFoundError.ts
│   │   └── ValidationError.ts
│   ├── features
│   │   ├── admin
│   │   │   ├── auditService.ts
│   │   │   └── userService.ts
│   │   ├── auth
│   │   │   ├── authMiddleware.ts
│   │   │   ├── authRepository.ts
│   │   │   ├── authSchema.ts
│   │   │   ├── authService.ts
│   │   │   ├── authTypes.ts
│   │   │   ├── jwt.ts
│   │   │   ├── login.ts
│   │   │   ├── password.ts
│   │   │   ├── roles.ts
│   │   │   └── session.ts
│   │   ├── branches
│   │   │   ├── branchRepo.ts
│   │   │   ├── branchService.ts
│   │   │   └── branchTypes.ts
│   │   ├── dailyRequest
│   │   │   ├── dailyRequestService.ts
│   │   │   └── requestPolicy.ts
│   │   ├── dailyRequestLine
│   │   │   ├── dailyRequestLineRepository.ts
│   │   │   ├── dailyRequestLineSchemas.ts
│   │   │   └── dailyRequestLineService.ts
│   │   ├── dashboard
│   │   │   ├── dashboardMapper.ts
│   │   │   ├── dashboardRepository.ts
│   │   │   ├── dashboardService.ts
│   │   │   ├── dashboardTypes.ts
│   │   │   ├── workshopDashboardRepository
│   │   │   └── workshopDashboardService.ts
│   │   ├── inventory
│   │   │   ├── orderTypes.ts
│   │   │   └── stockService.ts
│   │   ├── orders
│   │   │   ├── orderService.ts
│   │   │   └── orderTypes.ts
│   │   ├── products
│   │   │   ├── productService.ts
│   │   │   ├── productTypes.ts
│   │   │   └── productValidation.ts
│   │   ├── reports
│   │   │   └── reportService.ts
│   │   ├── requestPolicy
│   │   │   └── requestCapabilities.ts
│   │   ├── workflow
│   │   │   ├── caseService.ts
│   │   │   ├── caseTypes.ts
│   │   │   ├── delegationService.ts
│   │   │   ├── permissionService.ts
│   │   │   ├── transitionEffects.ts
│   │   │   ├── transitionRequirements.ts
│   │   │   ├── transitionService.ts
│   │   │   ├── transitionValidator.ts
│   │   │   ├── types.ts
│   │   │   ├── validationService.ts
│   │   │   ├── workflowService.ts
│   │   │   └── wrokFlowDefinition.ts
│   │   └── workshop
│   │       ├── batchService.ts
│   │       └── transferService.ts
│   ├── generated
│   │   └── prisma
│   │       ├── internal
│   │       │   ├── class.ts
│   │       │   ├── prismaNamespace.ts
│   │       │   └── prismaNamespaceBrowser.ts
│   │       ├── models
│   │       │   ├── Branch.ts
│   │       │   ├── DailyRequest.ts
│   │       │   ├── DailyRequestLine.ts
│   │       │   ├── Product.ts
│   │       │   ├── ProductCategory.ts
│   │       │   ├── Role.ts
│   │       │   ├── User.ts
│   │       │   └── WorkflowHistory.ts
│   │       ├── browser.ts
│   │       ├── client.ts
│   │       ├── commonInputTypes.ts
│   │       ├── enums.ts
│   │       └── models.ts
│   ├── hooks
│   │   ├── useAuth.ts
│   │   ├── useBranchData.ts
│   │   ├── useCases.ts
│   │   ├── useProducts.ts
│   │   └── useWorkspace.ts
│   ├── lib
│   │   ├── constants
│   │   │   ├── roles.ts
│   │   │   └── users.ts
│   │   ├── query
│   │   │   ├── buildOrder.ts
│   │   │   ├── buildWhere.ts
│   │   │   └── pagination.ts
│   │   ├── auth.ts
│   │   ├── centralResponse.ts
│   │   └── prisma.ts
│   ├── permissions
│   ├── repositories
│   │   ├── caseRepo.ts
│   │   ├── dailyRequestRepository.ts
│   │   ├── inventoryRepo.ts
│   │   ├── orderRepo.ts
│   │   ├── productRepository.ts
│   │   ├── types.ts
│   │   ├── userRepo.ts
│   │   └── workflowHistoryRepository.ts
│   ├── services
│   ├── styles
│   │   └── globals.css
│   ├── tests
│   │   ├── passwordTest.ts
│   │   └── workflowTest.ts
│   ├── types
│   │   ├── api.ts
│   │   ├── branch.ts
│   │   ├── business.ts
│   │   ├── case.ts
│   │   ├── inventory.ts
│   │   ├── order.ts
│   │   ├── product.ts
│   │   ├── user.ts
│   │   └── workflow.ts
│   ├── utils
│   │   ├── formatters.ts
│   │   ├── permissions.ts
│   │   └── validators.ts
│   └── validation
│       ├── authSchema.ts
│       ├── dailyRequestQuerySchema.ts
│       ├── dailyRequestSchema.ts
│       ├── index.ts
│       ├── querySchema.ts
│       ├── userSchema.ts
│       └── workflowSchema.ts
├── .env
├── .gitignore
├── AGENTS.md
├── CLAUDE.md
├── eslint.config.mjs
├── next.config.ts
├── next-env.d.ts
├── package.json
├── package-lock.json
├── postcss.config.mjs
├── prisma.config.ts
├── PROJECT_STRUCTURE.md
├── README.md
├── tsconfig.json
└── tsconfig.tsbuildinfo
```
