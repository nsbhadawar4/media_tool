/**
 * Who a password-reset email is addressed to.
 *
 * The recipient must be exactly the address typed into the forgot-password form (after the
 * validator's trim + lowercase) — never the sender, the SMTP login, or the provider
 * account's own address. The service is exercised end to end over HTTP with the email
 * provider's `send` captured, then each real provider is checked to hand that recipient
 * on as `to` while keeping `from` separate.
 */
import './setupTestEnv';

import test, { before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import nodemailer from 'nodemailer';
import { MongoMemoryServer } from 'mongodb-memory-server';

import { createApp } from '../src/app';
import { User } from '../src/models/User';
import { ConsoleEmailProvider } from '../src/services/email/ConsoleEmailProvider';
import { ResendEmailProvider } from '../src/services/email/ResendEmailProvider';
import { SmtpEmailProvider } from '../src/services/email/SmtpEmailProvider';
import type { EmailMessage } from '../src/services/email';
import { flushBackgroundTasks } from '../src/services/backgroundTasks';

let mongo: MongoMemoryServer;
let server: Server;
let baseUrl: string;

const sent: EmailMessage[] = [];
const originalSend = ConsoleEmailProvider.prototype.send;

const RECIPIENTS = ['nsbhadawar@gmail.com', 'narayan@digimonk.in', 'harsh@gmail.com'];

async function forgot(email: string) {
  const response = await fetch(`${baseUrl}/api/auth/forgot-password`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  // The email is sent after the response (no timing signal); wait for it before asserting.
  await flushBackgroundTasks();
  return response.status;
}

before(async () => {
  // EMAIL_PROVIDER defaults to `console` in tests; capture what it is asked to send.
  ConsoleEmailProvider.prototype.send = async function (message: EmailMessage) {
    sent.push(message);
  };

  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  server = createApp().listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  ConsoleEmailProvider.prototype.send = originalSend;
  await new Promise((resolve) => server.close(resolve));
  await mongoose.disconnect();
  await mongo.stop();
});

beforeEach(async () => {
  sent.length = 0;
  await User.deleteMany({});
  for (const email of RECIPIENTS) {
    await User.create({
      name: 'Test User',
      email,
      passwordHash: await bcrypt.hash('some-password-1', 10),
    });
  }
});

for (const email of RECIPIENTS) {
  test(`the code for ${email} is addressed to ${email}, and only to it`, async () => {
    assert.equal(await forgot(email), 200);

    assert.equal(sent.length, 1, 'exactly one email must be sent');
    assert.equal(sent[0]!.to, email);
    assert.ok(/^\d{4}$/.test(/(\d{4})/.exec(sent[0]!.text)![1]!), 'the email carries the 4-digit code');
  });
}

test('the entry is trimmed and lowercased, and that normalized address is the recipient', async () => {
  assert.equal(await forgot('  Harsh@GMAIL.com '), 200);
  assert.equal(sent.length, 1);
  assert.equal(sent[0]!.to, 'harsh@gmail.com');
});

test('an address with no account sends nothing at all', async () => {
  // Answered exactly like a real address (200), but nothing is sent.
  assert.equal(await forgot('stranger@example.com'), 200);
  assert.equal(sent.length, 0);
});

test('the sender and provider settings are never the recipient', async () => {
  await forgot('narayan@digimonk.in');
  const { EMAIL_FROM, SMTP_USER } = process.env;
  for (const forbidden of [EMAIL_FROM, SMTP_USER].filter(Boolean)) {
    assert.ok(!sent[0]!.to.includes(forbidden!), 'to must not be EMAIL_FROM or SMTP_USER');
  }
  assert.equal(sent[0]!.to, 'narayan@digimonk.in');
});

/* -------------------------------------------------------------------------- */
/* The real providers pass `to` through untouched, separately from `from`      */
/* -------------------------------------------------------------------------- */

const SENDER = 'Media Tool <sender@sender.example>';

for (const email of RECIPIENTS) {
  test(`SmtpEmailProvider addresses ${email} as the recipient and keeps the sender as from`, async () => {
    const provider = new SmtpEmailProvider({
      host: 'smtp.invalid',
      port: 587,
      secure: false,
      user: 'login@sender.example',
      password: 'not-a-real-password',
      from: SENDER,
    });
    // Swap only the network leg: jsonTransport builds the message and returns it.
    (provider as unknown as { transporter: unknown }).transporter = nodemailer.createTransport({ jsonTransport: true });

    const result = (provider as unknown as {
      transporter: { sendMail: (m: object) => Promise<{ message: string }> };
    }).transporter;
    let captured: { to: { address: string }[]; from: { address: string } } | undefined;
    const realSendMail = result.sendMail.bind(result);
    result.sendMail = async (m: object) => {
      const info = await realSendMail(m);
      captured = JSON.parse(info.message);
      return info;
    };

    await provider.send({ to: email, subject: 's', text: 't', html: '<p>t</p>' });

    assert.deepEqual(
      captured!.to.map((a) => a.address),
      [email],
    );
    assert.equal(captured!.from.address, 'sender@sender.example');
  });

  test(`ResendEmailProvider addresses ${email} as the recipient and keeps the sender as from`, async () => {
    const provider = new ResendEmailProvider('re_test_not_a_real_key', SENDER);
    let captured: { to: string; from: string } | undefined;
    (provider as unknown as { client: unknown }).client = {
      emails: {
        send: async (args: { to: string; from: string }) => {
          captured = args;
          return { error: null };
        },
      },
    };

    await provider.send({ to: email, subject: 's', text: 't', html: '<p>t</p>' });

    assert.equal(captured!.to, email);
    assert.equal(captured!.from, SENDER);
  });
}
