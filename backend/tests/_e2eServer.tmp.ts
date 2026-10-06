// Throwaway backend for browser tests: real app, in-memory MongoDB, one test user. Deleted after use.
import './setupTestEnv';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createApp } from '../src/app';
import { User } from '../src/models/User';
import { signSessionToken } from '../src/services/tokenService';

(async () => {
  const mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  const user = await User.create({ email: 'kid@example.com', name: 'Test Kid', passwordHash: 'unused', role: 'user' });
  const token = signSessionToken({ sub: user._id.toString(), role: 'user', email: user.email, name: user.name });
  createApp().listen(5100, () => console.log(`READY ${token}`));
})();
