// Triggers the production-extraction GitHub Actions workflow (see
// .github/workflows/production-extraction.yml). Vercel serverless functions
// can't run poppler/tesseract themselves, so PDF OCR happens in a GH Actions
// job instead — this just kicks it off and returns immediately; the workflow
// updates the production_report_uploads row directly in Neon when it finishes.
//
// Requires a GITHUB_ACTIONS_TOKEN env var: a GitHub personal access token
// (fine-grained, scoped to this repo, with "Actions: read and write" permission).

const GITHUB_REPO_OWNER = process.env.GITHUB_REPO_OWNER ?? 'tridgesupport';
const GITHUB_REPO_NAME = process.env.GITHUB_REPO_NAME ?? 'demosha-erp';
const GITHUB_REPO_REF = process.env.GITHUB_REPO_REF ?? 'main';

export async function triggerProductionExtraction(uploadId: string): Promise<void> {
  const token = process.env.GITHUB_ACTIONS_TOKEN;
  if (!token) {
    throw new Error('GITHUB_ACTIONS_TOKEN is not configured — cannot trigger extraction.');
  }

  const url = `https://api.github.com/repos/${GITHUB_REPO_OWNER}/${GITHUB_REPO_NAME}/actions/workflows/production-extraction.yml/dispatches`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ ref: GITHUB_REPO_REF, inputs: { upload_id: uploadId } }),
  });

  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw new Error(`GitHub workflow_dispatch failed (${resp.status}): ${body}`);
  }
}
