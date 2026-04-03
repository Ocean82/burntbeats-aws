#!/usr/bin/env python3
from stem_service.server import app

print(f"App routes: {len(app.routes)}")
print("Import successful!")
