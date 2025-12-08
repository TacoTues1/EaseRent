```mermaid
flowchart TB
	subgraph Frontend[Client - Next.js + TailwindCSS]
		A[Visitor lands on marketing page] --> B[Sign Up / Sign In]
		B --> C{Role Selection}
		C -->|Tenant| D[Dashboard (Tenant view)]
		C -->|Landlord| E[Dashboard (Landlord view)]
		D & E --> F[Supabase Auth (JWT + Session)]
		F --> G[Supabase Realtime + Postgres]
		G --> H((profiles))
		G --> I((properties))
		G --> J((applications))
		G --> K((maintenance_requests))
		G --> L((payments))
		G --> M((notifications))
		G --> N((applications + payments + schedule data))
		subgraph TenantFlows[Tenant Experience]
			D --> O[Browse & filter properties]
			O --> P[View property details]
			P --> Q[Submit application]
			Q --> R[Schedule viewing via available slots]
			R --> S[Receive booking status & chat]
			D --> T[Maintenance requests]
			D --> U[View payments / bills]
			S --> V[Messages realtime]
			U --> W[Payment history]
		end
		subgraph LandlordFlows[Landlord Experience]
			E --> X[Add/edit properties]
			E --> Y[Review incoming applications]
			Y --> Z[Approve bookings -> Schedule slots]
			Z --> AA[Record payments / send bills]
			E --> AB[Manage maintenance requests]
			E --> AC[View analytics & notifications]
			E --> AD[Messages realtime]
		end
		O -->|New data| G
		X -->|Property CRUD| G
		Q -->|Application record| G
		T -->|Insert request| G
		U -->|Payment record| G
		AA -->|Payment request| G
		V -->|Realtime sync| G
		AD -->|Realtime sync| G
	end
```
