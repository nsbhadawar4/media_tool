import { Schema, model, Types, type Document } from 'mongoose';

export interface IFolder extends Document {
  _id: Types.ObjectId;
  name: string;
  slug: string;
  description?: string;
  parentFolder: Types.ObjectId | null;
  path: Types.ObjectId[]; // ancestor chain, root-first — enables fast subtree queries
  coverImage?: Types.ObjectId | null; // ref Media
  itemCount: number; // direct, non-deleted media count (denormalized)
  createdBy?: Types.ObjectId | null;
  isDeleted: boolean;
  deletedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const folderSchema = new Schema<IFolder>(
  {
    name: { type: String, required: true, trim: true, maxlength: 255 },
    slug: { type: String, required: true, trim: true, lowercase: true },
    description: { type: String, trim: true, maxlength: 2000 },
    parentFolder: { type: Schema.Types.ObjectId, ref: 'Folder', default: null, index: true },
    path: [{ type: Schema.Types.ObjectId, ref: 'Folder' }],
    coverImage: { type: Schema.Types.ObjectId, ref: 'Media', default: null },
    itemCount: { type: Number, default: 0 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'Admin' },
    isDeleted: { type: Boolean, default: false, index: true },
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

// Siblings can't share a name (case-insensitive via lowercase slug), among non-deleted folders.
folderSchema.index({ parentFolder: 1, slug: 1 }, { unique: true, partialFilterExpression: { isDeleted: false } });
folderSchema.index({ isDeleted: 1, createdAt: -1 });
folderSchema.index({ name: 'text' });

export const Folder = model<IFolder>('Folder', folderSchema);
