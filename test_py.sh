#!/bin/bash
cd /mnt/d/burntbeats-aws
.venv/bin/python -c 'from stem_service.config import STEM_BACKEND; print(STEM_BACKEND)'
