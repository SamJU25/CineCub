# Execution (Layer 3: Doing the work)

This directory stores deterministic Python scripts that handle:
- API calls
- Data processing
- File operations
- Database & cloud service interactions

## Principles
- **Deterministic**: Given the same input/state, scripts should behave predictably.
- **Self-contained & Commented**: Clear arguments, well-documented inputs/outputs, and robust error handling.
- **Environment**: Secrets and tokens are loaded from `.env`.
- **Intermediates**: All temporary output files must be written to `.tmp/`.
