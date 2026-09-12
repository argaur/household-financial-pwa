/**
 * Save text to the user's disk.
 *
 * Revoking the object URL is not housekeeping here: the blob holds a
 * household's fully decrypted data, and an un-revoked blob: URL stays fetchable
 * for the life of the document. Leaving one behind would undo, in the export
 * path, the guarantee the rest of D-014 buys.
 */
export function triggerTextDownload(
  filename: string,
  contents: string,
  mimeType = 'application/json',
): void {
  triggerBlobDownload(filename, new Blob([contents], { type: mimeType }))
}

/**
 * The same anchor dance for bytes rather than text, so a binary file (D-025's
 * `.xlsx` template and rejects workbooks) gets the identical revoke
 * discipline instead of a second, subtly different copy of it. The blob is
 * built by the caller, because only the caller knows the media type.
 */
export function triggerBlobDownload(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  try {
    anchor.click()
  } finally {
    // finally, so a click that throws cannot leak the URL or strand the node.
    anchor.remove()
    URL.revokeObjectURL(url)
  }
}
