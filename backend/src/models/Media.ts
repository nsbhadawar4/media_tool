import { Schema, model, Types, type Document } from 'mongoose';
import { FILE_TYPES, type FileType } from '../config/constants';

export interface IMedia extends Document {
  _id: Types.ObjectId;
  folderId: Types.ObjectId | null; // null = "unfiled" root-level media
  originalName: string;
  storedName: string; // sanitized/unique name used on disk or in the bucket
  storageKey: string; // full key/path within the storage provider
  storageProvider: 'local' | 'r2' | 's3';
  url: string | null; // public URL when the provider serves one directly (else null -> stream via API)
  mimeType: string;
  fileType: FileType;
  size: number; // bytes
  width?: number | null;
  height?: number | null;
  duration?: number | null; // seconds, for video
  thumbnailKey?: string | null;
  uploadedBy?: Types.ObjectId | null;
  isDeleted: boolean;
  deletedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const mediaSchema = new Schema<IMedia>(
  {
    folderId: { type: Schema.Types.ObjectId, ref: 'Folder', default: null, index: true },
    originalName: { type: String, required: true, trim: true },
    storedName: { type: String, required: true },
    storageKey: { type: String, required: true },
    storageProvider: { type: String, enum: ['local', 'r2', 's3'], required: true },
    url: { type: String, default: null },
    mimeType: { type: String, required: true },
    fileType: { type: String, enum: FILE_TYPES, required: true, index: true },
    size: { type: Number, required: true },
    width: { type: Number, default: null },
    height: { type: Number, default: null },
    duration: { type: Number, default: null },
    thumbnailKey: { type: String, default: null },
    uploadedBy: { type: Schema.Types.ObjectId, ref: 'Admin' },
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

mediaSchema.index({ folderId: 1, isDeleted: 1, createdAt: -1 });
mediaSchema.index({ isDeleted: 1, fileType: 1, createdAt: -1 });
mediaSchema.index({ originalName: 'text' });

export const Media = model<IMedia>('Media', mediaSchema);
