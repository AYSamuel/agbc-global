/**
 * The one way bytes leave this browser (W3.1 slice 1b for audio, slice 5 for artwork).
 *
 * XHR rather than fetch, for one reason only: upload progress events. The PUT and the
 * headers mirror what supabase-js sends to a signed upload URL; the token is inside the
 * URL the server minted.
 *
 * Extracted from `AudioUploader` when the artwork picker arrived, rather than copied: two
 * uploaders sending bytes two slightly different ways is exactly the drift the shared
 * library rule exists to prevent.
 */
export function uploadViaXhr(
  signedUrl: string,
  file: File,
  contentType: string,
  onProgress: (sentBytes: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', signedUrl);
    xhr.setRequestHeader('content-type', contentType);
    xhr.setRequestHeader('x-upsert', 'false');
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`upload refused with ${String(xhr.status)}`));
    };
    xhr.onerror = () => {
      reject(new Error('the upload did not reach storage'));
    };
    xhr.send(file);
  });
}

/** The seam both uploaders inject in tests: jsdom has no real network. */
export type UploadFn = typeof uploadViaXhr;
