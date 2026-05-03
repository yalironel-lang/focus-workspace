import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from './useAuth';

export function useFileUpload() {
  const { user } = useAuth();
  const [uploading, setUploading] = useState(false);

  const uploadFile = async (file: File, sectionId: string, groupId: string, itemId: string) => {
    if (!user) throw new Error('Not authenticated');

    setUploading(true);
    try {
     const filePath = `${user.id}/${sectionId}/${groupId}/${itemId}.pdf`;

      const { error: uploadError } = await supabase.storage
        .from('pdfs')
        .upload(filePath, file, {
          contentType: 'application/pdf',
          upsert: true,
        });

      if (uploadError) throw uploadError;

      return filePath;
    } finally {
      setUploading(false);
    }
  };

  const getSignedUrl = async (filePath: string) => {
    // Leading slashes cause a 400 from Supabase storage
    const path = filePath.replace(/^\/+/, '');

    const { data, error } = await supabase.storage
      .from('pdfs')
      .createSignedUrl(path, 3600); // 1 hour

    if (error) throw new Error(`Storage error (${path}): ${error.message}`);
    if (!data?.signedUrl) throw new Error('No signed URL returned');
    return data.signedUrl;
  };

  const deleteFile = async (filePath: string) => {
    const { error } = await supabase.storage.from('pdfs').remove([filePath]);
    if (error) throw error;
  };

  return { uploadFile, getSignedUrl, deleteFile, uploading };
}
