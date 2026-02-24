import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import type { AppBindings } from '../store-context';
import { authMiddleware, getAuthInfo } from '../middleware/auth';
import { ERROR_CODES } from '../constants/error-codes';
import { generateId } from '../utils/crypto';
import { errorResponse, validationErrorHook } from '../utils/response';
import type { MessageFile, UploadResponse } from '../types';

const file = new Hono<AppBindings>();

const fileUploadSchema = z.object({
  file: z.custom<File>((value) => value instanceof File, {
    message: 'No file provided',
  }),
});

const fileKeyParamSchema = z.object({
  key: z.string().min(1),
});

file.use('/*', authMiddleware);

file.post('/upload', zValidator('form', fileUploadSchema, validationErrorHook), async (c) => {
  const { userId } = getAuthInfo(c);

  try {
    const { file: uploadedFile } = c.req.valid('form');

    if (uploadedFile.size > 10 * 1024 * 1024) {
      return errorResponse(c, 400, ERROR_CODES.FILE_TOO_LARGE, 'File size exceeds 10MB limit');
    }

    const ext = uploadedFile.name.split('.').pop() || '';
    const key = `uploads/${userId}/${generateId()}.${ext}`;

    await c.env.BUCKET.put(key, await uploadedFile.arrayBuffer(), {
      httpMetadata: {
        contentType: uploadedFile.type,
      },
    });

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
    return errorResponse(c, 500, ERROR_CODES.UPLOAD_FAILED, 'Upload failed');
  }
});

file.get('/download/:key{.+}', zValidator('param', fileKeyParamSchema, validationErrorHook), async (c) => {
  const { key } = c.req.valid('param');

  try {
    const object = await c.env.BUCKET.get(key);
    if (!object) {
      return errorResponse(c, 404, ERROR_CODES.FILE_NOT_FOUND, 'File not found');
    }

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set('etag', object.httpEtag);

    return new Response(object.body, { headers });
  } catch (error) {
    console.error('Download error:', error);
    return errorResponse(c, 500, ERROR_CODES.DOWNLOAD_FAILED, 'Download failed');
  }
});

file.delete('/delete/:key{.+}', zValidator('param', fileKeyParamSchema, validationErrorHook), async (c) => {
  const { userId } = getAuthInfo(c);
  const { key } = c.req.valid('param');

  if (!key.startsWith(`uploads/${userId}/`)) {
    return errorResponse(c, 403, ERROR_CODES.FORBIDDEN, 'Unauthorized');
  }

  try {
    await c.env.BUCKET.delete(key);
    return c.json({ success: true, data: { message: 'File deleted' } });
  } catch (error) {
    console.error('Delete error:', error);
    return errorResponse(c, 500, ERROR_CODES.DELETE_FAILED, 'Delete failed');
  }
});

export default file;
