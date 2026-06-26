const DEVICE_CODE_URL = "https://github.com/login/device/code";
const TOKEN_URL = "https://github.com/login/oauth/access_token";
const USER_URL = "https://api.github.com/user";

export async function runGithubDeviceLogin({
  clientId,
  onUserCode,
  fetchImpl = fetch,
  sleep = defaultSleep,
  now = () => Date.now(),
  scope = "read:user user:email",
}) {
  const device = await postForm(fetchImpl, DEVICE_CODE_URL, {
    client_id: clientId,
    scope,
  });

  onUserCode?.({
    verificationUri: device.verification_uri,
    userCode: device.user_code,
  });

  const started = now();
  const expiresInMs = Number(device.expires_in) * 1000;
  let intervalMs = Number(device.interval || 5) * 1000;

  while (now() - started < expiresInMs) {
    await sleep(intervalMs);
    const token = await postForm(fetchImpl, TOKEN_URL, {
      client_id: clientId,
      device_code: device.device_code,
      grant_type: "urn:ietf:params:oauth:grant-type:device_code",
    });

    if (token.error === "authorization_pending") continue;
    if (token.error === "slow_down") {
      intervalMs += 5000;
      continue;
    }
    if (token.error) {
      throw new Error(`${token.error}: ${token.error_description || "GitHub OAuth failed"}`);
    }

    const user = await fetchJson(fetchImpl, USER_URL, {
      headers: {
        Authorization: `Bearer ${token.access_token}`,
        "User-Agent": "hovvi-cli",
      },
    });
    return {
      accessToken: token.access_token,
      scope: token.scope,
      tokenType: token.token_type,
      user,
    };
  }

  throw new Error("GitHub device login expired.");
}

async function postForm(fetchImpl, url, values) {
  return fetchJson(fetchImpl, url, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "hovvi-cli",
    },
    body: new URLSearchParams(values),
  });
}

async function fetchJson(fetchImpl, url, options) {
  const response = await fetchImpl(url, options);
  const text = await response.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`Expected JSON from ${url}, got: ${text.slice(0, 200)}`);
  }
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}: ${JSON.stringify(json)}`);
  }
  return json;
}

function defaultSleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
