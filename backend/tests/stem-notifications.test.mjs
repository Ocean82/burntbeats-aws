import test from "node:test";
import assert from "node:assert/strict";

process.env.NODE_ENV = "test";
process.env.EMAIL_NOTIFICATIONS_ENABLED = "true";

const { sendStemCompletionEmail } = await import("../email/stemNotifications.js");

function completedJob() {
  return {
    job_id: "job-1",
    status: "completed",
    clerk_user_id: "user-1",
    original_filename: "song.wav",
    email_notified_at: null,
  };
}

test("sendStemCompletionEmail leaves completed jobs retryable after soft send failure", async () => {
  const marked = [];
  let sendAttempts = 0;

  await sendStemCompletionEmail("job-1", {
    getJobById: async () => completedJob(),
    markJobEmailNotified: async (...args) => marked.push(args),
    getClerkClient: () => ({
      users: {
        getUser: async () => ({
          emailAddresses: [{ emailAddress: "producer@example.com" }],
        }),
      },
    }),
    sendSongReadyEmail: async () => {
      sendAttempts += 1;
      return { success: false, reason: "smtp_rate_limited" };
    },
  });

  assert.equal(sendAttempts, 1);
  assert.deepEqual(marked, []);
});

test("sendStemCompletionEmail marks completed jobs after successful send", async () => {
  const marked = [];

  await sendStemCompletionEmail("job-1", {
    getJobById: async () => completedJob(),
    markJobEmailNotified: async (...args) => marked.push(args),
    getClerkClient: () => ({
      users: {
        getUser: async () => ({
          emailAddresses: [{ emailAddress: "producer@example.com" }],
        }),
      },
    }),
    sendSongReadyEmail: async () => ({ success: true, messageId: "msg-1" }),
  });

  assert.deepEqual(marked, [["job-1"]]);
});
