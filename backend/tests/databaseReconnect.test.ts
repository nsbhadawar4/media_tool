/**
 * That the app reconnects to MongoDB after the connection goes away.
 *
 * This is a serverless-only failure and it is invisible everywhere else. A long-running
 * server connects once and keeps that socket; a Vercel Function keeps its module scope but
 * is frozen between invocations, and the socket does not survive that. `connectDatabaseOnce`
 * cached the *promise* of the first successful connection, so once it had settled it
 * reported success forever — handing every later request a connection that was no longer
 * there.
 *
 * Mongoose hid it for most of the app, because it buffers model queries through a
 * reconnect. GridFS does not: it talks to the driver directly, so reading a stored file
 * fails outright. That is why a PDF opened perfectly in development and reported itself
 * unavailable in production, on whichever instance had been sitting idle.
 */
import './setupTestEnv';

import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

/**
 * Imported dynamically, after MONGODB_URI is pointed at the throwaway server below.
 *
 * Every other suite sidesteps this by calling `mongoose.connect()` itself and never
 * touching the app's connection code. This suite *is* that code, and it reads
 * `env.MONGODB_URI` — which `src/config/env` fixes the moment it is first imported. A
 * static import here would therefore freeze the placeholder from setupTestEnv, and the
 * whole suite would be testing a connection to a server that does not exist.
 */
type DatabaseModule = typeof import('../src/config/database');
let database: DatabaseModule;
let mongo: MongoMemoryServer;

before(async () => {
  mongo = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongo.getUri('media_tool_reconnect_tests');
  database = await import('../src/config/database');
});

after(async () => {
  await database.disconnectDatabase().catch(() => undefined);
  await mongo.stop();
});

test('the first call establishes the connection', async () => {
  await database.connectDatabaseOnce();
  assert.equal(mongoose.connection.readyState, 1);
});

test('a second call on a live connection is a no-op', async () => {
  // The common case by far, and it has to stay cheap: this runs on every request.
  await database.connectDatabaseOnce();
  assert.equal(mongoose.connection.readyState, 1);
});

test('a connection that has gone away is re-established, not reported as fine', async () => {
  /**
   * The regression. Closing the connection is what a frozen instance's socket dying looks
   * like from inside the process: readyState drops to 0 while the cached promise stays
   * fulfilled. Before the fix this call returned that fulfilled promise untouched and the
   * connection stayed dead for the life of the instance.
   */
  await mongoose.connection.close();
  assert.equal(mongoose.connection.readyState, 0, 'the connection should be down for this test');

  await database.connectDatabaseOnce();

  assert.equal(mongoose.connection.readyState, 1, 'the connection must be re-established');
});

test('GridFS can read again after a reconnect', async () => {
  /**
   * The check that actually matters, and the one a readyState assertion cannot make for
   * it: model queries are buffered through a reconnect whether or not this works, so only
   * a real file operation shows whether storage came back with the connection.
   */
  const { GridFsStorageProvider } = await import('../src/services/storage/GridFsStorageProvider');
  const provider = new GridFsStorageProvider();

  const before = await provider.exists('photos/unfiled/nothing-here.jpg');
  assert.equal(before, false, 'reading a missing key should answer, not throw');

  await mongoose.connection.close();
  await database.connectDatabaseOnce();

  const after = await provider.exists('photos/unfiled/nothing-here.jpg');
  assert.equal(after, false, 'storage must be usable again once the connection is back');
});
