// Talks to GitHub with the user's token. Every save is a single commit,
// so an article and all of its images go live together.

const API = "https://api.github.com";
const TOKEN_KEY = "sveltia-cms.user"; // shared with the classic editor at /admin/cms/

export function readToken() {
  try {
    const raw = localStorage.getItem(TOKEN_KEY);
    if (!raw) return "";
    const data = JSON.parse(raw);
    return data && data.token ? data.token : "";
  } catch { return ""; }
}

export function saveToken(token) {
  let data = {};
  try { data = JSON.parse(localStorage.getItem(TOKEN_KEY) || "{}") || {}; } catch {}
  data.backendName = "github";
  data.token = token;
  localStorage.setItem(TOKEN_KEY, JSON.stringify(data));
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

export function utf8ToBase64(text) {
  return bytesToBase64(new TextEncoder().encode(text));
}

export function bytesToBase64(bytes) {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  return btoa(bin);
}

export function base64ToUtf8(b64) {
  const bin = atob(b64.replace(/\s/g, ""));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

export class GitHub {
  constructor({ token, repo, branch }) {
    this.token = token;
    this.repo = repo;
    this.branch = branch;
  }

  async req(path, { method = "GET", body } = {}) {
    const res = await fetch(API + path, {
      method,
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
    });
    if (!res.ok) {
      let msg = res.statusText;
      try { msg = (await res.json()).message || msg; } catch {}
      const err = new Error(friendlyError(res.status, msg));
      err.status = res.status;
      throw err;
    }
    return res.status === 204 ? null : res.json();
  }

  async checkAccess() {
    const repo = await this.req(`/repos/${this.repo}`);
    return repo;
  }

  async listDir(dir) {
    try {
      const items = await this.req(`/repos/${this.repo}/contents/${encodePath(dir)}?ref=${encodeURIComponent(this.branch)}`);
      return Array.isArray(items) ? items : [];
    } catch (e) {
      if (e.status === 404) return [];
      throw e;
    }
  }

  async getFile(path) {
    const f = await this.req(`/repos/${this.repo}/contents/${encodePath(path)}?ref=${encodeURIComponent(this.branch)}`);
    return { text: base64ToUtf8(f.content || ""), sha: f.sha, path: f.path };
  }

  async fileSha(path) {
    try {
      const f = await this.req(`/repos/${this.repo}/contents/${encodePath(path)}?ref=${encodeURIComponent(this.branch)}`);
      return f.sha;
    } catch (e) {
      if (e.status === 404) return null;
      throw e;
    }
  }

  // files: [{ path, base64 }] ; deletes: [path]
  async commit({ files = [], deletes = [], message, onProgress }) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const ref = await this.req(`/repos/${this.repo}/git/ref/heads/${encodeURIComponent(this.branch)}`);
        const parentSha = ref.object.sha;
        const parent = await this.req(`/repos/${this.repo}/git/commits/${parentSha}`);
        const tree = [];
        let i = 0;
        for (const f of files) {
          i++;
          if (onProgress) onProgress(`Uploading ${i} of ${files.length}…`);
          const blob = await this.req(`/repos/${this.repo}/git/blobs`, { method: "POST", body: { content: f.base64, encoding: "base64" } });
          tree.push({ path: f.path, mode: "100644", type: "blob", sha: blob.sha });
        }
        for (const p of deletes) tree.push({ path: p, mode: "100644", type: "blob", sha: null });
        if (onProgress) onProgress("Publishing…");
        const newTree = await this.req(`/repos/${this.repo}/git/trees`, { method: "POST", body: { base_tree: parent.tree.sha, tree } });
        const commit = await this.req(`/repos/${this.repo}/git/commits`, { method: "POST", body: { message, tree: newTree.sha, parents: [parentSha] } });
        await this.req(`/repos/${this.repo}/git/refs/heads/${encodeURIComponent(this.branch)}`, { method: "PATCH", body: { sha: commit.sha } });
        return commit;
      } catch (e) {
        // Someone else saved at the same moment: try once more on top of their change.
        if (attempt === 0 && (e.status === 422 || e.status === 409)) continue;
        throw e;
      }
    }
  }
}

function encodePath(p) {
  return p.split("/").map(encodeURIComponent).join("/");
}

function friendlyError(status, msg) {
  if (status === 401) return "GitHub didn't accept your access token. It may have been deleted or regenerated. Sign out and sign in with a new token.";
  if (status === 403 && /rate limit/i.test(msg)) return "GitHub's rate limit was reached. Please wait a few minutes and try again.";
  if (status === 403) return "Your access token can't change this repository. Make sure it has \"Contents: Read and write\" for this repository.";
  if (status === 404) return "The repository or file couldn't be found. Check that your token has access to this repository.";
  if (status === 413 || /too large/i.test(msg)) return "A file is too large for GitHub. Use images and documents under 25 MB.";
  return `GitHub error (${status}): ${msg}`;
}
