import { Schema, model, Types, type Document } from 'mongoose';
import { THEME_MODES, THEMES, type Theme, type ThemeMode } from '../config/constants';

/**
 * Site-wide settings an administrator controls, one document per group (`key`). Today only
 * "appearance": which themes visitors and users may use, and the default for those who haven't
 * chosen. A single small collection rather than a field per setting on some unrelated model.
 */
export interface ISiteSetting extends Document {
  _id: Types.ObjectId;
  key: 'appearance';
  /** both: visitors may switch; light / dark: that theme only, and no switch is shown. */
  themeMode: ThemeMode;
  /** The theme for anyone without a saved choice of their own (when both are allowed). */
  defaultTheme: Theme;
  updatedBy: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const siteSettingSchema = new Schema<ISiteSetting>(
  {
    key: { type: String, enum: ['appearance'], required: true, unique: true },
    themeMode: { type: String, enum: THEME_MODES, default: 'both' },
    defaultTheme: { type: String, enum: THEMES, default: 'dark' },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  { timestamps: true },
);

export const SiteSetting = model<ISiteSetting>('SiteSetting', siteSettingSchema);
