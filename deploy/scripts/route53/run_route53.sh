#!/bin/bash
# Activate your virtual environment
source /opt/route53/.venv/bin/activate

# Set AWS profile
export AWS_PROFILE=route53

# Run the script with Python
python /opt/route53/route53.py

