import test from "node:test";
import assert from "node:assert/strict";
import { runGithubDeviceLogin } from "../src/github-auth.js";

test("runGithubDeviceLogin handles pending, slow_down, and success", async () => {
  const calls = [];
  const sleeps = [];
  const userCodes = [];
  const fetchImpl = makeFetch([
    {
      device_code: "device-1",
      user_code: "ABCD-EFGH",
      verification_uri: "https://github.com/login/device",
      expires_in: 120,
      interval: 5,
    },
    { error: "authorization_pending" },
    { error: "slow_down" },
    { access_token: "gho_token", scope: "read:user", token_type: "bearer" },
    { login: "Jaemani", id: 39300288 },
  ], calls);

  const login = await runGithubDeviceLogin({
    clientId: "client-1",
    fetchImpl,
    sleep(ms) {
      sleeps.push(ms);
      return Promise.resolve();
    },
    now: () => 0,
    onUserCode(code) {
      userCodes.push(code);
    },
  });

  assert.deepEqual(userCodes, [
    {
      verificationUri: "https://github.com/login/device",
      userCode: "ABCD-EFGH",
    },
  ]);
  assert.deepEqual(sleeps, [5000, 5000, 10000]);
  assert.equal(login.accessToken, "gho_token");
  assert.equal(login.user.login, "Jaemani");
  assert.equal(calls[0].url, "https://github.com/login/device/code");
  assert.equal(calls[0].body.get("client_id"), "client-1");
  assert.equal(calls[0].body.get("scope"), "read:user user:email");
  assert.equal(calls[3].body.get("device_code"), "device-1");
  assert.equal(calls[4].url, "https://api.github.com/user");
  assert.equal(calls[4].headers.Authorization, "Bearer gho_token");
});

test("runGithubDeviceLogin reports OAuth errors", async () => {
  const fetchImpl = makeFetch([
    {
      device_code: "device-1",
      user_code: "ABCD-EFGH",
      verification_uri: "https://github.com/login/device",
      expires_in: 120,
      interval: 5,
    },
    { error: "access_denied", error_description: "The user denied access" },
  ]);

  await assert.rejects(
    runGithubDeviceLogin({
      clientId: "client-1",
      fetchImpl,
      sleep: () => Promise.resolve(),
      now: () => 0,
    }),
    /access_denied: The user denied access/,
  );
});

test("runGithubDeviceLogin expires without polling after deadline", async () => {
  const calls = [];
  const fetchImpl = makeFetch([
    {
      device_code: "device-1",
      user_code: "ABCD-EFGH",
      verification_uri: "https://github.com/login/device",
      expires_in: 1,
      interval: 5,
    },
  ], calls);
  const timestamps = [0, 2000];

  await assert.rejects(
    runGithubDeviceLogin({
      clientId: "client-1",
      fetchImpl,
      sleep: () => Promise.resolve(),
      now: () => timestamps.shift() ?? 2000,
    }),
    /GitHub device login expired/,
  );
  assert.equal(calls.length, 1);
});

function makeFetch(responses, calls = []) {
  return async function fetchImpl(url, options = {}) {
    const body = options.body instanceof URLSearchParams ? options.body : undefined;
    calls.push({
      url,
      method: options.method || "GET",
      headers: options.headers || {},
      body,
    });
    const response = responses.shift();
    if (!response) throw new Error(`Unexpected fetch call to ${url}`);
    return jsonResponse(response);
  };
}

function jsonResponse(body, { ok = true, status = 200, statusText = "OK" } = {}) {
  return {
    ok,
    status,
    statusText,
    async text() {
      return JSON.stringify(body);
    },
  };
}
