/**
 * Tiny shared Shelf PDF signed-URL helper (same bucket/TTL as useFileUpload.getSignedUrl).
 * Does not mount a viewer — callers own PDFViewerModal state.
 */

import { supabase } from '../supabase';

export async function getShelfPdfSignedUrl(filePath: string): Promise<string> {
  const path = filePath.replace(/^\/+/, '');
  const { data, error } = await supabase.storage.from('pdfs').createSignedUrl(path, 3600);
  if (error) throw new Error(`Storage error (${path}): ${error.message}`);
  if (!data?.signedUrl) throw new Error('No signed URL returned');
  return data.signedUrl;
}
