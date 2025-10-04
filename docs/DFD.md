## Data Flow Diagram (DFD) for phpdmadmin

This document describes the data flows in the phpdmadmin application (context + level-1).

### Context Diagram (Level 0)

```mermaid
flowchart TB
  Browser["User Browser (Svelte UI)"]
  Firebase["Firebase (Firestore, Auth)"]
  Server["SvelteKit Server (Endpoints)"]
  SMTP["Email Service (Gmail via nodemailer)"]

  Browser -->|Realtime reads/writes (appointments, patients, prescriptions)| Firebase
  Browser -->|Auth (onAuthStateChanged, sign-in/out)| Firebase
  Browser -->|POST /appointment/sendEmail (send email request)| Server
  Server -->|calls sendAppointmentNotification (nodemailer)| SMTP
  Server -->|returns status (200/400/500)| Browser

  style Browser fill:#f8f9fa,stroke:#333
  style Firebase fill:#fef3c7,stroke:#333
  style Server fill:#e6f4ff,stroke:#333
  style SMTP fill:#f0e6ff,stroke:#333
```

### Level-1 DFD (Appointments & Email Notification)

```mermaid
flowchart LR
  subgraph UI [Browser / Svelte App]
    A1[Appointments Page]
    A2[Appointment Actions (Accept / Decline / Complete / Reschedule)]
  end

  subgraph FS [Firebase]
    D1[(Firestore: appointments collection)]
    D2[(Firestore: patientProfiles collection)]
    Auth[(Firebase Auth)]
  end

  subgraph Srv [Server - SvelteKit]
    P1[/appointment/sendEmail POST endpoint/]
    LibEmail[lib/emailTemplate.js (sendAppointmentNotification)]
  end

  subgraph Mail [SMTP]
    M[(Gmail SMTP via nodemailer)]
  end

  A1 -->|onSnapshot/listen| D1
  A1 -->|fetch patient profiles (getDocs)| D2
  A2 -->|updateDoc appointments/{id} (status, reason, cancellationStatus)| D1
  D1 -->|trigger UI update (onSnapshot)| A1

  A2 -->|if patientEmail exists -> POST /appointment/sendEmail {patientEmail, patientName, status, appointmentDetails}| P1
  P1 -->|validates payload -> calls| LibEmail
  LibEmail -->|transports email ->| M
  M -->|SMTP response| LibEmail
  LibEmail -->|returns success/failure| P1
  P1 -->|JSON {success: boolean, message}| A1

  A1 -->|auth state| Auth
  Auth -->|provides currentUser| A1

  click P1 "./src/routes/(app)/appointment/sendEmail/+server.ts" "Open endpoint source"
  click LibEmail "./src/lib/emailTemplate.ts" "Open email library"

  style A1 fill:#fff,stroke:#333
  style A2 fill:#fff,stroke:#333
  style D1 fill:#fffbe6,stroke:#b58900
  style D2 fill:#fffbe6,stroke:#b58900
  style Auth fill:#fffbe6,stroke:#b58900
  style P1 fill:#e6f4ff,stroke:#0b5fff
  style LibEmail fill:#e6f4ff,stroke:#0b5fff
  style M fill:#f0e6ff,stroke:#7b3fe4
```

### Data elements and flows (summary)

- Browser (Svelte UI)
  - Reads: appointments (realtime), patientProfiles, medicines, prescriptions
  - Writes: appointment updates (status, reason, cancellationStatus), new prescriptions, new appointments (follow-ups)
  - Calls: POST /appointment/sendEmail to request notification

- Firebase (Firestore)
  - Collections used: appointments, patientProfiles, medicines, prescriptions, dailySchedules
  - Realtime: onSnapshot listener on appointments keeps UI in sync

- Server (SvelteKit endpoint)
  - POST /appointment/sendEmail receives JSON: { patientEmail, patientName, status, appointmentDetails }
  - Validates payload and calls lib/emailTemplate.sendAppointmentNotification
  - Returns JSON success/failure to the UI

- Email Service (nodemailer)
  - sendAppointmentNotification builds HTML email and sends via Gmail SMTP
  - Logs and throws on error; endpoint surfaces error details in response

### Security & Edge cases noted

- Email credentials are in source (lib/emailTemplate.ts) — this is sensitive and should be moved to environment variables.
- The UI only attempts to send email if appointment.patientEmail exists; if missing, it warns the user.
- The endpoint validates required fields and returns 400 when missing.
- Firestore onSnapshot keeps a live connection; consider rules for auth/permissions.

### How to render

- If your editor or Git host supports Mermaid (GitHub, VS Code Mermaid plugin), open this file to view the diagrams.

### Files referenced

- src/lib/firebaseConfig.js — Firebase project initialization
- src/lib/emailTemplate.ts — nodemailer email builder + transporter
- src/routes/(app)/appointment/sendEmail/+server.ts — endpoint that triggers email sending
- src/routes/(app)/appointment/+page.svelte — UI that updates appointments and calls the endpoint

---

If you'd like, I can also:
- produce a PNG or SVG export of these diagrams and place it in docs/
- expand the DFD into multiple level-1 diagrams (e.g., prescriptions, scheduling, medicines inventory)
- create a simple diagram file (Mermaid .mmd) or add it to README.md
