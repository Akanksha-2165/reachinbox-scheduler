\# Software Development Intern Assignment



\## \*\*Context:\*\*



ReachInbox.ai is a product of Outbox Labs focused on transforming cold email outreach with AI-driven workflows. Our all-in-one solution empowers businesses to effortlessly find, enrich, and engage high-intent leads through cold email. With just a single prompt, ReachInbox springs into action, prospecting and verifying leads, crafting personalized email sequences, and notifying businesses of positive leads. ReachInbox is more than a tool; it's your growth partner.



We are looking for passionate and innovative individuals to join our team and help us continue to redefine the future of lead generation and business growth.



\# 🚀 ReachInbox Hiring Assignment – Full-stack Email Job Scheduler



\## 🎯 Problem Statement



At ReachInbox, a huge part of our system is \*\*reliable scheduling and sending of emails at scale\*\*.



Your task is to build a \*\*production-grade email scheduler service + dashboard\*\* that:



\- Accepts \*\*email send requests\*\* via APIs

\- Schedules them to be sent at a \*\*specific time\*\*

\- Uses \*\*BullMQ + Redis\*\* as a persistent job scheduler (\*\*no cron jobs\*\*)

\- Sends emails using fake SMTP via \*\*Ethereal Email\*\*

\- Survives \*\*server restarts\*\* without restarting from scratch or losing jobs

\- Exposes a \*\*frontend dashboard\*\* to:

&#x20;   - Schedule new emails

&#x20;   - View scheduled emails

&#x20;   - View sent emails



Think of it as a tiny slice of what ReachInbox does under the hood.



\---



\## 🧪 Tech Requirements



You \*\*must\*\* use:



\### Backend



\- Language: \*\*TypeScript\*\*

\- Framework: \*\*Express.js\*\*

\- Queue: \*\*BullMQ\*\* (backed by \*\*Redis\*\*)

\- Database: \*\*MySQL or PostgreSQL\*\* (ORM or query builder is your choice)

\- SMTP: \*\*Ethereal Email\*\* (fake SMTP for testing)



\### Frontend



\- \*\*React.js or Next.js\*\*

\- \*\*Tailwind CSS\*\* (or any modern CSS library)

\- \*\*TypeScript\*\* strongly preferred



\### Infra



\- Redis and DB can be run via \*\*Docker\*\* (recommended but not mandatory)



We care about how you \*\*structure a real backend\*\*, \*\*wire queues correctly\*\*, and \*\*build a clean frontend\*\*.



\---



\## 🖥 Backend Requirements



\### 1️⃣ Core Scheduler Behavior



Your backend must:



\- Accept email scheduling requests via API

\- Store them in a \*\*relational DB\*\* (MySQL/Postgres)

\- Schedule them using \*\*BullMQ delayed jobs\*\* (or a custom Redis/DB-based scheduler) – \*\*no cron\*\*

\- Send emails from multiple senders via \*\*Ethereal Email (SMTP)\*\*

\- Must have sent/scheduled emails \*\*searchable via Elasticsearch (\*\*Implement indexing to \*\*make emails searchable)\*\*

\- Must Expose a \*\*live BullMQ dashboard\*\* for real-time queue visibility

\- Persist state so that:

&#x20;   - If the server restarts, \*\*future emails are still sent at the correct time\*\*

&#x20;   - Emails are \*\*not duplicated\*\* or restarted from scratch



\### 2️⃣ Throughput, Rate Limiting \& Concurrency (Required)



Your scheduler should behave like a \*\*real-world email system under load\*\*.



You \*\*must\*\* support:



\### ✅ Worker Concurrency



\- Configure your BullMQ worker(s) with a \*\*configurable concurrency\*\* level .

\- Implementation must be safe when multiple jobs run in parallel:



\### ✅ Delay Between Each Email



\- There must be a \*\*minimum delay between individual email sends\*\* (to mimic provider throttling).

\- You can:

&#x20;   - Use \*\*BullMQ’s limiter\*\* options, \*\*or\*\*

&#x20;   - Add a custom delay in the worker logic.

\- Document in the README what delay you chose (e.g. “min 2 seconds between sends”).



\### ✅ Emails Per Hour (Rate Limiting)



\- Implement a \*\*rate limit\*\* on the number of emails sent per hour:

&#x20;   - Either \*\*global\*\* (e.g. `MAX\_EMAILS\_PER\_HOUR=200`), or

&#x20;   - \*\*Per-sender / per-tenant\*\* (e.g. `MAX\_EMAILS\_PER\_HOUR\_PER\_SENDER`), you will have to support multiple senders.

\- The \*\*limit values must be configurable\*\* via env/config (no hardcoding).

\- Rate-limiting logic must be \*\*safe across multiple workers / instances\*\*:

&#x20;   - Use \*\*Redis or DB\*\* backed counters (e.g. keyed by `hour\_window + sender`),

&#x20;   - Do \*\*not\*\* rely only on in-memory counts.

\- When the hourly limit is reached:

&#x20;   - \*\*Do not drop\*\* or permanently fail jobs.

&#x20;   - Jobs should be \*\*delayed / rescheduled\*\* into the \*\*next available hour window\*\* while preserving order as much as possible.

\- Explain in the README how you enforce this:

&#x20;   - e.g. BullMQ limiter, Redis counters, custom logic, trade-offs, etc.



\*\*✅ Slack Notification on Rate Limit Hit (Required)\*\*

&#x20;



\- User clicks "Connect Slack" in the dashboard → real OAuth authorize flow → backend stores the token/webhook per user/tenant.

\- \*\*You must actually send a message to their Slack\*\* the moment a sender's hourly limit is reached — this has to be a live, verifiable call in your demo, not a log line.

\- Handle disconnect/reconnect: if the user hasn't connected Slack, rate-limit hits should simply not notify (no crash); if they later connect, notifications should start working without a redeploy.



\### ✅ Behavior Under Load



Your design should clearly define behavior when:



\- \*\*1000+ emails\*\* are scheduled for roughly the same time.

\- The \*\*rate limit\*\* would be exceeded.



You don’t need to actually send thousands via Ethereal, but your logic should handle it.



\### 3️⃣ Hard Constraints (Important)



These are \*\*non-negotiable\*\*:



\- ❌ \*\*Do NOT use cron jobs\*\*

&#x20;   - No OS-level cron (`crontab`, etc.)

&#x20;   - No Node cron libraries (`node-cron`, `agenda`, etc.)

\- ✅ Scheduling must be done using:

&#x20;   - \*\*BullMQ delayed jobs\*\*, or

&#x20;   - A \*\*custom scheduler\*\* that uses Redis/DB to track next run times — but still \*\*not cron\*\*.

\- ✅ The system \*\*must be persistent\*\*:

&#x20;   - After a restart:

&#x20;       - Future scheduled emails \*\*still send at the right time\*\*

&#x20;       - Emails are \*\*not re-sent\*\* or restarted from Day 1

\- ❌ Same email queues should not be sent more than once. Maintain idempotency.



\---



\## 🎨 Frontend Requirements



You will build a \*\*frontend that matches the provided Figma\*\* as closely as possible and talks to your backend APIs. 



\### \*\*Figma Link\*\*



\### 1️⃣ Google Login (Required)



\- Implement \*\*real Google OAuth login\*\* (no mock).

\- After login, redirect the user to the \*\*dashboard\*\*.

\- Show in the top header:

&#x20;   - User’s \*\*name\*\*

&#x20;   - \*\*Email\*\*

&#x20;   - \*\*Avatar\*\*

\- Provide a simple \*\*Logout\*\* option.



\### 2️⃣ Main Dashboard



After login, show the main UI with:



\- \*\*Top header\*\* (user info + logout).

\- Tabs/sections:

&#x20;   - \*\*Scheduled Emails\*\*

&#x20;   - \*\*Sent Emails\*\*

\- A primary \*\*“Compose New Email”\*\* button.



Layout and styling should closely follow the \*\*Figma design\*\*.



\### 3️⃣ Compose New Email



User must be able to:



\- Enter:

&#x20;   - \*\*Subject\*\*

&#x20;   - \*\*Body\*\*

\- \*\*Upload\*\* a CSV/text file of email leads.

&#x20;   - Parse and show the \*\*number of email addresses\*\* detected.

\- Set:

&#x20;   - \*\*Start time\*\* (when scheduling begins)

&#x20;   - \*\*Delay between emails\*\*

&#x20;   - \*\*Hourly limit\*\*

\- Click \*\*Schedule\*\* to send data to the \*\*backend schedule API\*\*.



This can be a \*\*modal\*\* or \*\*separate page\*\*, depending on the Figma.



\### 4️⃣ Scheduled Emails



Show a clean table/list with:



\- \*\*Email\*\*

\- \*\*Subject\*\*

\- \*\*Scheduled time\*\*

\- \*\*Status\*\*



Include:



\- \*\*Loading states\*\*

\- \*\*Empty state\*\* when there are no scheduled emails



\### 5️⃣ Sent Emails



Show a table/list with:



\- \*\*Email\*\*

\- \*\*Subject\*\*

\- \*\*Sent time\*\*

\- \*\*Status\*\* (`sent` / `failed`)



Include:



\- \*\*Loading states\*\*

\- \*\*Empty state\*\* when there are no sent emails



\### 6️⃣ Frontend Code Quality



We expect:



\- Clean \*\*folder structure\*\*

\- Reusable \*\*UI components\*\* (buttons, inputs, tables, modals, etc.)

\- \*\*DRY\*\* code (avoid duplication)

\- Proper \*\*TypeScript\*\* usage:

&#x20;   - Types/interfaces for API responses \& props

\- Good UX:

&#x20;   - Loading indicators

&#x20;   - Empty states

&#x20;   - Error handling (basic messages/toasts)



\---



\## 📦 Submission Guidelines



1\. \*\*Create a private GitHub repository\*\* (monorepo or separate folders for backend \& frontend is fine).

2\. \*\*Grant access\*\* to user: `Mitrajit and Yadav036` 

3\. Add a \*\*README\*\* that includes:

&#x20;   - How to run \*\*backend\*\* (Express, Redis, DB, BullMQ worker)

&#x20;   - How to run \*\*frontend\*\*

&#x20;   - How to set up \*\*Ethereal Email\*\* and env variables

&#x20;   - Architecture overview:

&#x20;       - How scheduling works

&#x20;       - How persistence on restart is handled

&#x20;       - How rate limiting \& concurrency are implemented

&#x20;   - List of \*\*features implemented\*\*, mapped to:

&#x20;       - Backend: scheduler, persistence, rate limiting, concurrency

&#x20;       - Frontend: login, dashboard, compose, tables, etc.

4\. Add a \*\*short demo video (max 5 minutes)\*\*:

&#x20;   - Show creating scheduled emails (from frontend or Postman)

&#x20;   - Show the dashboard with \*\*Scheduled\*\* and \*\*Sent\*\* emails

&#x20;   - Show a \*\*restart scenario\*\*:

&#x20;       - Stop server → start again → future emails still send

&#x20;   - (Bonus) Briefly demonstrate how \*\*rate limiting / delay\*\* behaves under load

5\. Note any \*\*assumptions, shortcuts, or trade-offs\*\* you made.



<aside>

💡 \*\*Fill this form with relevant links and details - Assignment Submission -\*\*  https://forms.clickup.com/9005062261/f/8cbwp3n-8876/6NNNJ92DV93PQTAYST



</aside>



\### \*\*Deadline for Task Completion:\*\*



You have a maximum of 48 hours to complete the task. Receiving this assignment means you're already ahead of many candidates. Good luck!



\*\*Note\*\*: Do not submit a plagiarized assignment. All GitHub code will be thoroughly reviewed, and any evidence of plagiarism will result in the assignment being rejected.



Thank you!

# Software Development Engineer- Internship



\## \*\*About us\*\*



At Outbox, we go beyond building products - we’re transforming real challenges into powerful SaaS solutions that make a difference. Our superpower? A team of relentless problem solvers building SaaS products that simplify growth, eliminate guesswork, and help businesses scale with confidence.



Our goal is simple - to build tools that simplify, streamline, and accelerate business growth.



We're on the lookout for folks who love speed, have immense curiosity and love building and scaling SaaS products.



\### \*\*Our Products\*\*



\*\*ReachInbox.ai:\*\* An AI-powered cold outreach platform designed for high deliverability, helping teams find, enrich, and engage high-intent leads at scale.



\*\*Zapmail.ai:\*\* The global leader in email infrastructure for cold outreach. Create, manage, and scale mailboxes with industry-leading deliverability, trusted by top agencies worldwide.



\*\*Mailverify.ai:\*\* A powerful solution that quickly verifies emails with precision, preventing bounces and protecting your domain’s reputation.



\*\*ReferralStack.ai:\*\* An AI-enabled referral and affiliate management platform that helps businesses launch, track, and scale referral programs without manual ops or chaos.



\### \*\*Culture at Outbox\*\*



At Outbox, we believe great work happens when talented people are trusted to think boldly, act with intention, and take ownership from day one. If you love solving meaningful problems, learning fast, and building products that thousands of businesses rely on, you will feel at home here.



\### \*\*Our Team\*\*



We’re a small but mighty team that achieved $25 Mil ARR in less than 24 months by solving real market gaps with innovative, scalable SaaS products. Here, resilience, creativity, and rapid growth fuel everything we do.



\## About the Role



| \*\*CORE FUNCTION\*\* | Full Stack Development | \*\*STIPEND RANGE\*\* | INR 30, 000 - INR 40, 000 |

| --- | --- | --- | --- |

| \*\*TYPE OF ROLE\*\* | Internship with PPO | \*\*DURATION\*\* | 6 months - 1 year |

| \*\*LOCATION\*\* | Remote/ HSR Layout  Bangalore | \*\*START DATE\*\* | Immediately - 15 days |

| \*\*MUST HAVE SKILLS\*\* | NodeJS, MySQL, Typescript, Java Script Git, Demonstrable Portfolio, API Design and Documentation, React.js or Next.js, Tailwind CSS | \*\*GOOD TO HAVE\*\* | Experience with cloud platforms like AWS, MS Azure, Docker, Kubernetes, database optimization, microservices-based applications |



\## Job Description



We are seeking \*\*SDE Interns,\*\* talented individuals with strong knowledge of NodeJS, Typescript, Git and MySQL to join our dynamic team. You'll have the opportunity to work on cutting-edge technologies and contribute to the development of our innovative outbound marketing system.



If you are excited about leveraging cutting-edge technology to drive business success, we want to hear from you.



\## What You'll Do:



\- Design, develop, and maintain scalable server-side architecture.

\- Implement and optimize database structures for data integrity, security, and performance.

\- Collaborate with frontend developers to integrate user-facing elements using server-side logic.

\- Update reports, project related trackers, performance evaluation forms.

\- Optimize web performance by identifying and resolving bottlenecks, reducing load times, and applying performance best practices (e.g., lazy loading, code splitting).

\- Implement and manage third-party libraries and APIs to extend backend capabilities and support new features.

\- Maintain a clean and scalable codebase, adhering to best practices in version control (Git), component reusability, and code documentation.

\- Write unit and integration tests to ensure code stability and reduce regressions.

\- Stay current with emerging technologies and backend trends, proactively suggesting improvements to the team.

\- Participate in code reviews, contributing constructive feedback and learning from peers.

\- Take ownership of assigned tasks, demonstrating initiative in troubleshooting, debugging, and solving issues.

\- Contribute to internal documentation, helping to create a knowledge base for onboarding and ongoing learning.



\## Candidate Profile



\- \*\*Demonstrable Portfolio:\*\* We require candidates to showcase a portfolio of live and hosted projects, providing the hiring manager with an opportunity to review their backend and frontend development work.

\- \*\*Internship Experience:\*\* Candidates must have completed at least one internship and possess experience in building backend and Frontend systems from scratch. They should understand the importance of designing scalable and efficient server-side architecture.

\- \*\*Start-up Friendly Attitude:\*\* We seek individuals who thrive in high-paced environments and are eager to take ownership of their tasks to ensure successful outcomes. Adaptability and a proactive approach are essential qualities we value in potential backend engineers.



If you are passionate about software development and eager to gain hands-on experience in a fast-paced startup environment, Join us and be part of a team that’s changing the game. Apply Now!



\## Screening Process



We value transparency and open communication as essential principles in our company culture, fostering trust and collaboration among our team members. Along with technical knowledge and skill, we also look for learning ability and attitude towards embracing challenges, as these qualities contribute to a dynamic and innovative work environment. The screening process is thus designed to evaluate candidates holistically 



1\. Submission of Resume with links to live and hosted projects.

2\. Role specific assignment 

3\. Assignment review and code analysis

4\. Interview - Initial Screening

5\. Interview - Final technical screening 



\## Leadership



\*\*Alan D’Souza - Founder \& CEO\*\*



A serial tech entrepreneur who transformed multiple startups from ground zero to over $5M+ ARR in diverse sectors like Adtech, Gaming, and the Creator Economy. Notable Ventures include:



\- Listed.fans - Capital for Content Creators – Raised $1.6 M USD

\- OpeninApp - SaaS tools for creators - Used by over 1.5M Creators

\- Autograph.ly - Personalised Video Messages from Celebrities

\- Teen Patti Gold Rush - 1.1Mn Monthly Paying Subscribers

\- FreePaisa - App discovery platform - Scaled to $5M ARR in a year

\- txtBrowser - ChatGPT on SMS - Answered 1.1Bn Paid Queries



\## Contact



While we are committed to keeping all candidates aware of their progress, it is an extensive recruitment process and sometimes may require patience and understanding from the candidates as we diligently assess each candidate's qualifications and fit for the position. We appreciate their cooperation throughout the process.



Reach out to your POC for all queries related to your application and candidature.



Thank you for considering Outbox Labs as your potential next career destination. We appreciate your interest in bringing your talent to our team.



\## Next Steps



To apply for the internship, fill out the form provided at the end of this document. Please find the guidelines to be followed before filling out the form:



\- Please ensure you have your latest CV and photograph ready to be uploaded.

\- While mentioning the details of your previous internships, please provide a link to the official website of the company you interned at.

\- You must mention the relevant projects you have worked on and provide a link to the live and hosted projects for the hiring team to experience the kind of Backend Development you have accomplished.

\- As a Full Stack Engineer, you must have a portfolio that reflects your current skill set as well as contains live and hosted projects for the technical team to review. Your portfolio is a reflection of you, make sure it reflects your attention to detail.



<aside>

💡



\- \*\*Review in detail - Software Development Intern Assignment\*\*

</aside>



<aside>

💡



\- Submissions are directly linked to the assignment - please complete the assignment and submit your resume along with the assignment here - https://forms.clickup.com/9005062261/f/8cbwp3n-8876/6NNNJ92DV93PQTAYST

</aside>



\## Thank you!

Stack: Node + Express + TypeScript, BullMQ + Redis (AOF), MySQL + Prisma,

Nodemailer + Ethereal, Elasticsearch, @bull-board/express, zod,

Vite + React + TS + Tailwind + React Query.

OAuth (Google + Slack) backend mein, JWT httpOnly cookie.



Rules: NO cron anywhere. jobId = DB row id (idempotency).

Per-sender hourly limit via Redis atomic INCR+EXPIRE (not BullMQ limiter).

Limit hit => reschedule to next hour window, never drop/fail.

All limits/concurrency/delay from env.

