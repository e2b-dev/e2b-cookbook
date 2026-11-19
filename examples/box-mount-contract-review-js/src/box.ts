// Minimal Box REST client for the host side: setup checks, seeding and sync verification.
// The agent never uses it. Inside the sandbox, Box Mount does all Box traffic.
const API = "https://api.box.com/2.0";
const UPLOAD = "https://upload.box.com/api/2.0";

type BoxItem = { id: string; name: string; type: "file" | "folder" | "web_link" };

export class BoxError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

// Turns a caught value into a message, with a specific hint for an expired Box token.
export function describeFailure(error: Error | string): string {
  if (error instanceof BoxError && error.status === 401) {
    return "Box rejected the token. Developer tokens expire after 60 minutes: generate a new one and update BOX_ACCESS_TOKEN.";
  }
  return error instanceof Error ? error.message : error;
}

export class BoxClient {
  private readonly token: string;
  private readonly cancel: AbortSignal | undefined;

  // `cancel` aborts every request in flight, for example on Ctrl+C.
  constructor(token: string, cancel?: AbortSignal) {
    this.token = token;
    this.cancel = cancel;
  }

  private async json<T>(url: string, init: RequestInit = {}): Promise<T> {
    // SAFETY: callers pass T matching the documented Box API v2 response for that endpoint.
    return (await (await this.request(url, init)).json()) as T;
  }

  private async request(url: string, init: RequestInit = {}): Promise<Response> {
    const response = await fetch(url, {
      signal: AbortSignal.any([AbortSignal.timeout(30_000), ...(this.cancel ? [this.cancel] : [])]),
      ...init,
      headers: { authorization: `Bearer ${this.token}`, ...init.headers },
    });
    if (!response.ok) {
      throw new BoxError(`Box ${init.method ?? "GET"} ${url} failed (${response.status}): ${await response.text()}`, response.status);
    }
    return response;
  }

  async currentUser(): Promise<string> {
    const user = await this.json<{ name: string; login: string }>(`${API}/users/me?fields=name,login`);
    return `${user.name} (${user.login})`;
  }

  async folderName(folderId: string): Promise<string> {
    return (await this.json<{ name: string }>(`${API}/folders/${folderId}?fields=name`)).name;
  }

  async items(folderId: string): Promise<BoxItem[]> {
    return (await this.json<{ entries: BoxItem[] }>(`${API}/folders/${folderId}/items?fields=id,name,type&limit=1000`)).entries;
  }

  // Returns the ID of the subfolder `name`, creating it if needed.
  async ensureFolder(parentId: string, name: string): Promise<string> {
    const existing = (await this.items(parentId)).find((item) => item.name === name && item.type === "folder");
    if (existing) return existing.id;
    const created = await this.json<{ id: string }>(`${API}/folders`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, parent: { id: parentId } }),
    });
    return created.id;
  }

  // Resolve "Reviewed/memo.md" under the root folder to a file ID.
  async findFile(rootId: string, path: string): Promise<string | undefined> {
    const parts = path.split("/");
    let folderId = rootId;
    for (const [index, name] of parts.entries()) {
      const isLast = index === parts.length - 1;
      const match = (await this.items(folderId)).find((item) => item.name === name && item.type === (isLast ? "file" : "folder"));
      if (!match) return undefined;
      if (isLast) return match.id;
      folderId = match.id;
    }
    return undefined;
  }

  // Uploads a new file, or a new version when a file with that name already exists.
  async upload(folderId: string, name: string, content: Blob): Promise<string> {
    const existing = (await this.items(folderId)).find((item) => item.name === name && item.type === "file");
    if (existing) {
      await this.uploadVersion(existing.id, name, content);
      return existing.id;
    }
    const form = new FormData();
    form.append("attributes", JSON.stringify({ name, parent: { id: folderId } }));
    form.append("file", content, name);
    const created = (await this.json<{ entries: BoxItem[] }>(`${UPLOAD}/files/content`, { method: "POST", body: form })).entries[0];
    if (!created) throw new Error(`Box did not return the uploaded file "${name}".`);
    return created.id;
  }

  async uploadVersion(fileId: string, name: string, content: Blob): Promise<void> {
    const form = new FormData();
    form.append("attributes", JSON.stringify({ name }));
    form.append("file", content, name);
    await this.request(`${UPLOAD}/files/${fileId}/content`, { method: "POST", body: form });
  }

  async download(fileId: string): Promise<string> {
    return (await this.request(`${API}/files/${fileId}/content`)).text();
  }
}
