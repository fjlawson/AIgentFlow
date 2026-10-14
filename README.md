# AIgentFlow
CIT 485 Capstone project.

## Running it locally
The site and the backend both run through Vercel, with the backend under `/api`.

1. Install the Vercel CLI (`npm i -g vercel`) and run `vercel link` to connect to the `aigentflow` project.
2. Run `vercel dev` and open http://localhost:3000.

`vercel dev` pulls the Supabase settings from the Vercel project, so no `.env` file is needed. It also needs `uv` installed for the Python backend.

To run only the backend, `pip install -r requirements.txt`, copy `backend/.env.example` to `backend/.env` and fill it in, then from `backend/` run `uvicorn main:app --reload`.

## Deploying
Pushing to `main` deploys to production. Supabase keys live in the Vercel project's environment variables, not in the repo.
