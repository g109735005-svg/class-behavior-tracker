# Deployment & running instructions

This repo contains a minimal full-stack "Class Behavior Tracker" demo.

What I implemented for you:
- Backend: Node.js + Express, JWT auth, PostgreSQL (pg), seeds
- Frontend: simple HTML/JS app served by backend static files
- Docker Compose: ready-to-run postgres + app

Quick local run using Docker Compose (recommended):
1. Install Docker & Docker Compose
2. From repo root run:
   docker-compose up --build
3. The backend will be available at http://localhost:4000 and frontend at http://localhost:4000/

Default seeded accounts (from init script):
- admin@example.com / Passw0rd123 (role: admin)
- teacher@example.com / Passw0rd123 (role: teacher)

A seeded class (Class A) and 30 students (see students/example_students.csv) are created by the seed script when the DB is initialized.

If you prefer not to use Docker, run locally:
1) Start Postgres and create DB `cbt_db`.
2) Set env variable DATABASE_URL to your DB connection (e.g. postgres://postgres:postgres@localhost:5432/cbt_db)
3) In backend folder run:
   npm install
   node init_seed.js
   node server.js

Deploy to Render or Railway (high-level):
1) Create account on Render (https://render.com) or Railway (https://railway.app)
2) Create a new Postgres managed database
3) Create a Web Service and connect it to this GitHub repository (select this repo)
4) Set environment variables: DATABASE_URL, JWT_SECRET
5) Deploy. Run `node init_seed.js` once (you can do this via an init script or run manually in the service console) to populate seed data.

If you want, I can give step-by-step guidance to connect this repo to Render and finish deployment.
