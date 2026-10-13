import { z } from 'zod';
import { THEME_MODES, THEMES } from '../config/constants';

/** Strict: only these two fields, and at least one of them. */
export const updateAppearanceSchema = z
  .object({
    themeMode: z.enum(THEME_MODES).optional(),
    defaultTheme: z.enum(THEMES).optional(),
  })
  .strict()
  .refine((v) => v.themeMode !== undefined || v.defaultTheme !== undefined, { message: 'Nothing to update' });
export type UpdateAppearanceInput = z.infer<typeof updateAppearanceSchema>;
