import { Hono } from 'hono';
import type { Env } from '../store-context';
import { createDb } from '../db';
import { authMiddleware, getAuthInfo } from '../middleware/auth';
import { generateId } from '../utils/crypto';
import type { UploadResponse, MessageFile } from '@chatwithme/shared';

const file = new Hono<{ Bindings: Env }>();

// All file routes require authentication
file.use('/*', authMiddleware);

// Upload a file
file.post('/upload', async (c) => {
  const { userId } = getAuthInfo(c);

  try {
    const formData = await c.req.formData();
    const uploadedFile = formData.get('file');

    if (!uploadedFile || !(uploadedFile instanceof File)) {
      return c.json({ success: false, error: 'No file provided' }, 400);
    }

    // Check file size (max 10MB)
    if (uploadedFile.size > 10 * 1024 * 1024) {
      return c.json({ success: false, error: 'File size exceeds 10MB limit' }, 400);
    }

    // Generate unique key
    const ext = uploadedFile.name.split('.').pop() || '';
    const key = `uploads/${userId}/${generateId()}.${ext}`;

    // Upload to R2
    await c.env.BUCKET.put(key, await uploadedFile.arrayBuffer(), {
      httpMetadata: {
        contentType: uploadedFile.type,
      },
    });

    // Generate public URL (assuming R2 public bucket or custom domain)
    const url = `${c.req.url.split('/api/')[0]}/api/file/download/${key}`;

    const fileInfo: MessageFile = {
      url,
      fileName: uploadedFile.name,
      mimeType: uploadedFile.type,
      size: uploadedFile.size,
    };

    const response: UploadResponse = { file: fileInfo };

    return c.json({ success: true, data: response });
  } catch (error) {
    console.error('Upload error:', error);
    return c.json({ success: false, error: 'Upload failed' }, 500);
  }
});

// Download/serve a file
file.get('/download/:key{.+}', async (c) => {
  const key = c.req.param('key');

  try {
    const object = await c.env.BUCKET.get(key);

    if (!object) {
      return c.json({ success: false, error: 'File not found' }, 404);
    }

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set('etag', object.httpEtag);

    return new Response(object.body, { headers });
  } catch (error) {
    console.error('Download error:', error);
    return c.json({ success: false, error: 'Download failed' }, 500);
  }
});

// Delete a file
file.delete('/delete/:key{.+}', async (c) => {
  const { userId } = getAuthInfo(c);
  const key = c.req.param('key');

  // Verify the file belongs to the user
  if (!key.startsWith(`uploads/${userId}/`)) {
    return c.json({ success: false, error: 'Unauthorized' }, 403);
  }

  try {
    await c.env.BUCKET.delete(key);
    return c.json({ success: true, data: { message: 'File deleted' } });
  } catch (error) {
    console.error('Delete error:', error);
    return c.json({ success: false, error: 'Delete failed' }, 500);
  }
});

export default file;
