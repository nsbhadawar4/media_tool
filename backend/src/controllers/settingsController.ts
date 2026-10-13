import type { Request, Response } from 'express';
import { Types } from 'mongoose';
import { SiteSetting } from '../models/SiteSetting';
import { asyncHandler } from '../utils/asyncHandler';
import { sendSuccess } from '../utils/apiResponse';
import { logActivity } from '../services/activityService';
import { DEFAULT_APPEARANCE, getAppearance, invalidateAppearance } from '../services/settingsService';
import type { UpdateAppearanceInput } from '../validators/settingsValidators';

/** Public: the theme rules every page follows. Holds nothing private. */
export const getPublicAppearance = asyncHandler(async (_req: Request, res: Response) => {
  // Never cached by the browser: an administrator's change must apply on the very next page
  // load (the server keeps its own short in-memory copy, cleared on every save).
  res.setHeader('Cache-Control', 'no-store');
  sendSuccess(res, await getAppearance());
});

/** Admin: the setting with who changed it last. */
export const getAdminAppearance = asyncHandler(async (_req: Request, res: Response) => {
  const doc = await SiteSetting.findOne({ key: 'appearance' }).populate('updatedBy', 'name email').lean<{
    themeMode: string;
    defaultTheme: string;
    updatedAt: Date;
    updatedBy: { name?: string; email?: string } | null;
  } | null>();
  sendSuccess(res, {
    themeMode: doc?.themeMode ?? DEFAULT_APPEARANCE.themeMode,
    defaultTheme: doc?.defaultTheme ?? DEFAULT_APPEARANCE.defaultTheme,
    updatedAt: doc?.updatedAt ?? null,
    updatedBy: doc?.updatedBy ? { name: doc.updatedBy.name ?? null, email: doc.updatedBy.email ?? null } : null,
  });
});

const MODE_LABEL = { both: 'Light + Dark', light: 'Light only', dark: 'Dark only' } as const;

/** Admin: save the appearance setting (requireAuth + requireAdmin in adminRoutes); audited. */
export const updateAppearance = asyncHandler(async (req: Request, res: Response) => {
  const input = req.body as UpdateAppearanceInput;
  const before = await getAppearance();
  const next = { themeMode: input.themeMode ?? before.themeMode, defaultTheme: input.defaultTheme ?? before.defaultTheme };
  await SiteSetting.findOneAndUpdate(
    { key: 'appearance' },
    { $set: { ...next, updatedBy: new Types.ObjectId(req.user!.id) }, $setOnInsert: { key: 'appearance' } },
    { upsert: true, runValidators: true },
  );
  invalidateAppearance();
  const changed = (['themeMode', 'defaultTheme'] as const).filter((f) => before[f] !== next[f]);
  if (changed.length) {
    await logActivity(req, {
      action: 'settings_updated',
      targetType: 'settings',
      targetName: 'Appearance',
      message: `Changed appearance: ${changed
        .map((f) => (f === 'themeMode' ? `themes ${MODE_LABEL[before.themeMode]} → ${MODE_LABEL[next.themeMode]}` : `default theme ${before.defaultTheme} → ${next.defaultTheme}`))
        .join(', ')}`,
      metadata: { setting: 'appearance', previousThemeMode: before.themeMode, themeMode: next.themeMode, previousDefaultTheme: before.defaultTheme, defaultTheme: next.defaultTheme },
    });
  }
  sendSuccess(res, next, 200, undefined, changed.length ? 'Saved' : 'No changes');
});
