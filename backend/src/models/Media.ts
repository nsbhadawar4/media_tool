import { Schema, model, Types, type Document } from 'mongoose';
import { FILE_TYPES, type FileType } from '../config/constants';

export interface IMedia extends Document {
  _id: Types.ObjectId;
  /** The account this file belongs to. Every query is scoped by it. */
  ownerId: Types.ObjectId;
  folderId: Types.ObjectId | null; // null = "unfiled" root-level media
  originalName: string;
  storedName: string; // sanitized/unique name used on disk or in the bucket
  storageKey: string; // full key/path within the storage provider
  storageProvider: 'local' | 'r2' | 's3' | 'gridfs';
  url: string | null; // public URL when the provider serves one directly (else null -> stream via API)
  mimeType: string;
  fileType: FileType;
  size: number; // bytes
  /**
   * SHA-256 of the bytes as they were validated, before they were stored.
   *
   * Written by the upload pipeline after storage has been read back and matched against
   * it, so its presence is a record that the stored object was verified rather than
   * merely written. Optional because media predating this has none, and absence must read
   * as "not checked", never as "checked and wrong".
   */
  checksum?: string | null;
  width?: number | null;
  height?: number | null;
  duration?: number | null; // seconds, for video
  thumbnailKey?: string | null;
  uploadedBy?: Types.ObjectId | null;
  isDeleted: boolean;
  deletedAt?: Date | null;
  /**
   * Which folder's deletion put this file in the trash, or null when an admin trashed the
   * file itself. See the matching field on Folder — this is what makes a folder restore
   * recover its contents without also undoing unrelated, deliberate deletions.
   */
  deletedCascadeRoot?: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const mediaSchema = new Schema<IMedia>(
  {
    ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    folderId: { type: Schema.Types.ObjectId, ref: 'Folder', default: null, index: true },
    originalName: { type: String, required: true, trim: true },
    storedName: { type: String, required: true },
    storageKey: { type: String, required: true },
    storageProvider: { type: String, enum: ['local', 'r2', 's3', 'gridfs'], required: true },
    url: { type: String, default: null },
    mimeType: { type: String, required: true },
    fileType: { type: String, enum: FILE_TYPES, required: true, index: true },
    size: { type: Number, required: true },
    checksum: { type: String, default: null },
    width: { type: Number, default: null },
    height: { type: Number, default: null },
    duration: { type: Number, default: null },
    thumbnailKey: { type: String, default: null },
    uploadedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date, default: null },
    deletedCascadeRoot: { type: Schema.Types.ObjectId, ref: 'Folder', default: null, index: true },
  },
  { timestamps: true },
);

mediaSchema.index({ ownerId: 1, folderId: 1, isDeleted: 1, createdAt: -1 });
mediaSchema.index({ ownerId: 1, isDeleted: 1, fileType: 1, createdAt: -1 });
mediaSchema.index({ ownerId: 1, createdAt: -1 });
mediaSchema.index({ originalName: 'text' });

export const Media = model<IMedia>('Media', mediaSchema);
