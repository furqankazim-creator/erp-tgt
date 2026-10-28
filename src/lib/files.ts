import { getAuthToken, API_URL } from "@/lib/mock-auth";

export const MAX_UPLOAD_MB = 25;

export type UploadedFile = { id: string; name: string; size: number; content_type: string };

/** Sends the raw bytes to the server's GridFS store (POST /api/files). The
 * body goes as octet-stream so the server's JSON parser never touches it;
 * the real name and type travel in the query string. */
export async function uploadFile(file: File, projectId?: string | null): Promise<UploadedFile> {
  if (file.size > MAX_UPLOAD_MB * 1024 * 1024) {
    throw new Error(`File is larger than ${MAX_UPLOAD_MB} MB.`);
  }
  const params = new URLSearchParams({
    name: file.name,
    type: file.type || "application/octet-stream",
  });
  if (projectId) params.set("project_id", projectId);
  const headers = new Headers({ "Content-Type": "application/octet-stream" });
  const token = getAuthToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const res = await fetch(`${API_URL}/files?${params.toString()}`, {
    method: "POST",
    headers,
    body: file,
  });
  const body = (await res.json().catch(() => ({}))) as UploadedFile & { error?: string };
  if (!res.ok) throw new Error(body.error || `Upload failed (${res.status})`);
  return body;
}

/** Opens a stored file in a new tab. The download needs the auth header, so
 * it's fetched here and handed to the tab as a blob URL. The tab is opened
 * before the fetch so the browser still treats it as a click, not a popup. */
export async function openStoredFile(fileId: string, fileName: string) {
  const tab = window.open("", "_blank");
  try {
    const headers = new Headers();
    const token = getAuthToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);
    const res = await fetch(`${API_URL}/files/${fileId}`, { headers });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(body.error || `Couldn't open file (${res.status})`);
    }
    const url = URL.createObjectURL(await res.blob());
    if (tab) {
      tab.location.href = url;
    } else {
      // Popup blocked — fall back to a plain download.
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      a.click();
    }
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (err) {
    tab?.close();
    throw err;
  }
}

/** "report.final.PDF" → "pdf" */
export function fileExtension(name: string) {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  return ext && ext !== name.toLowerCase() ? ext.slice(0, 10) : "";
}
