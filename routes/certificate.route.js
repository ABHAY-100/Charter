import express from 'express';

import { isAdmin } from '../middlewares/auth.middleware.js';
import { processCertificates } from '../controllers/process.controller.js';

const router = express.Router();

router.post('/generate', isAdmin, async (req, res) => {
  try {
    const { eventId, cName } = req.body;
    if (!eventId) {
      return res.status(400).json({ success: false, error: 'Event ID is required' });
    }

    const token = req.user.accessToken;
    if (!token) {
      return res.status(500).json({ success: false, error: 'API token not configured' });
    }

    const result = await processCertificates(eventId, token, cName);

    res.json({
      success: true,
      message: `Successfully processed ${result.sentCount} certificates with ${result.failedCount} failed.`,
      data: result
    });
  } catch (error) {
    console.error('Error: ', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to generate certificates'
    });
  }
});

export default router;
