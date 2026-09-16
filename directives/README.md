# Directives (Layer 1: What to do)

This directory stores Standard Operating Procedures (SOPs) written in Markdown.

## Structure of a Directive
Each directive should clearly define:
1. **Goal**: What outcome needs to be achieved.
2. **Inputs**: Parameters, files, credentials, or context required.
3. **Tools / Scripts**: Python scripts in `execution/` to invoke.
4. **Outputs & Deliverables**: Expected intermediate artifacts in `.tmp/` or deliverables (e.g. Google Sheets, Slides, database records).
5. **Edge Cases & Error Handling**: Rate limits, retry logic, error mitigations.

Directives are living documents: update them as constraints, learnings, or API changes are discovered.
