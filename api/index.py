from backend.app.main import app

# Vercel routes requests under /api/* to this function. The FastAPI
# application keeps the /api prefix on its route declarations so the paths
# match the incoming request exactly.
