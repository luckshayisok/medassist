import { Router } from 'express';
import type { AppConfig } from '../../config/env.js';
import { forbidden, notFound } from '../../lib/errors.js';
import { KEY_PATTERN, verifyFileSignature, type Storage } from '../../lib/storage.js';

/** Serves private files only with a valid, unexpired signature. No auth header needed (works with <Image>). */
export function filesRoutes(storage: Storage, config: AppConfig) {
  const router = Router();

  router.get('/:key', async (req, res) => {
    const { key } = req.params;
    const { exp, sig } = req.query;
    if (!KEY_PATTERN.test(key)) throw notFound();
    if (typeof exp !== 'string' || typeof sig !== 'string' || !verifyFileSignature(config.jwtAccessSecret, key, exp, sig)) {
      throw forbidden('This link has expired');
    }
    const data = await storage.get(key);
    if (!data) throw notFound();
    res.set({
      'Content-Type': 'image/jpeg',
      'Cache-Control': 'private, max-age=3600',
      // The signed, expiring URL is the access check; let the web app show it as an <img>.
      'Cross-Origin-Resource-Policy': 'cross-origin',
    });
    res.send(data);
  });

  return router;
}
