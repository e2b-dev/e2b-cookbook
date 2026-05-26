# Bilig WorkPaper Formula Readback

Run a spreadsheet-style formula workbook inside an E2B sandbox and verify that an agent-style cell edit really recalculates dependent formulas.

This example installs [`@bilig/workpaper`](https://github.com/proompteng/bilig) inside the sandbox, creates a small WorkPaper model, changes one input cell, and checks three things before returning JSON:

- formula cells stayed formulas after the edit;
- dependent calculated values changed;
- exported WorkPaper JSON restores to the same calculated result.

Use this shape when an agent needs spreadsheet logic but should not drive Excel, LibreOffice, or a browser UI.

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy environment variables:

   ```bash
   cp env.template .env
   ```

3. Set your E2B key:

   ```bash
   E2B_API_KEY=your_e2b_api_key
   ```

4. Run the example:

   ```bash
   npm run start
   ```

## What it does

- Creates a fresh E2B sandbox.
- Uploads a small WorkPaper verification script into `/tmp`.
- Installs `@bilig/workpaper@0.107.8` in the sandbox at runtime.
- Builds a workbook with input and formula sheets.
- Edits `Assumptions!B3` from `0.25` to `0.4`.
- Reads calculated output before and after the edit.
- Serializes and restores the WorkPaper JSON to prove the computed result survives persistence.

A successful run prints a JSON proof object with `verified: true`.
