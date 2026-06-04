// @ts-check
import test from "node:test";
import assert from "node:assert/strict";
import { getBaseUrl } from "./baseUrl.js";

/** @returns {import("express").Request} */
function mockReq(headers = {}, protocol = "http") {
  return {
    protocol,
    get(name) {
      const key = name.toLowerCase();
      if (key === "host") return headers.host ?? "burntbeats.com";
      if (key === "x-forwarded-proto") return headers["x-forwarded-proto"];
      return undefined;
    },
  };
}

test("getBaseUrl uses PUBLIC_BASE_URL when set", () => {
  const prev = process.env.PUBLIC_BASE_URL;
  process.env.PUBLIC_BASE_URL = "https://burntbeats.com";
  try {
    assert.equal(getBaseUrl(mockReq()), "https://burntbeats.com");
  } finally {
    if (prev === undefined) delete process.env.PUBLIC_BASE_URL;
    else process.env.PUBLIC_BASE_URL = prev;
  }
});

test("getBaseUrl prefers x-forwarded-proto over req.protocol", () => {
  const prev = process.env.PUBLIC_BASE_URL;
  delete process.env.PUBLIC_BASE_URL;
  try {
    const url = getBaseUrl(
      mockReq({ host: "api.example.com", "x-forwarded-proto": "https" }),
    );
    assert.equal(url, "https://api.example.com");
  } finally {
    if (prev !== undefined) process.env.PUBLIC_BASE_URL = prev;
  }
});

test("getBaseUrl falls back to req.protocol", () => {
  const prev = process.env.PUBLIC_BASE_URL;
  delete process.env.PUBLIC_BASE_URL;
  try {
    const url = getBaseUrl(mockReq({ host: "localhost:8000" }, "http"));
    assert.equal(url, "http://localhost:8000");
  } finally {
    if (prev !== undefined) process.env.PUBLIC_BASE_URL = prev;
  }
});
