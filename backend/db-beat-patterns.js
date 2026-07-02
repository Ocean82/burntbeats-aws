// @ts-check
/**
 * PostgreSQL helpers for user beat pattern cloud sync.
 */
import { query } from "./db.js";

/**
 * @typedef {object} BeatPatternRow
 * @property {string} id
 * @property {string} clerk_user_id
 * @property {string} name
 * @property {unknown} preset
 * @property {string[]} tags
 * @property {string} created_at
 * @property {string} updated_at
 */

/**
 * @param {string} userId
 * @returns {Promise<BeatPatternRow[]>}
 */
export async function listBeatPatterns(userId) {
  const res = await query(
    `SELECT id, clerk_user_id, name, preset, tags, created_at, updated_at
     FROM user_beat_patterns
     WHERE clerk_user_id = $1
     ORDER BY updated_at DESC`,
    [userId],
  );
  return /** @type {BeatPatternRow[]} */ (res.rows);
}

/**
 * @param {string} userId
 * @param {{ name: string, preset: unknown, tags?: string[] }} payload
 * @returns {Promise<BeatPatternRow>}
 */
export async function createBeatPattern(userId, payload) {
  const res = await query(
    `INSERT INTO user_beat_patterns (clerk_user_id, name, preset, tags)
     VALUES ($1, $2, $3::jsonb, $4)
     RETURNING id, clerk_user_id, name, preset, tags, created_at, updated_at`,
    [userId, payload.name, JSON.stringify(payload.preset), payload.tags ?? []],
  );
  return /** @type {BeatPatternRow} */ (res.rows[0]);
}

/**
 * @param {string} userId
 * @param {string} id
 * @param {{ name?: string, preset?: unknown, tags?: string[] }} payload
 * @returns {Promise<BeatPatternRow | null>}
 */
export async function updateBeatPattern(userId, id, payload) {
  const res = await query(
    `UPDATE user_beat_patterns
     SET
       name = COALESCE($3, name),
       preset = COALESCE($4::jsonb, preset),
       tags = COALESCE($5, tags),
       updated_at = now()
     WHERE id = $1 AND clerk_user_id = $2
     RETURNING id, clerk_user_id, name, preset, tags, created_at, updated_at`,
    [
      id,
      userId,
      payload.name ?? null,
      payload.preset != null ? JSON.stringify(payload.preset) : null,
      payload.tags ?? null,
    ],
  );
  return res.rows[0] ? /** @type {BeatPatternRow} */ (res.rows[0]) : null;
}

/**
 * @param {string} userId
 * @param {string} id
 * @returns {Promise<boolean>}
 */
export async function deleteBeatPattern(userId, id) {
  const res = await query(
    `DELETE FROM user_beat_patterns WHERE id = $1 AND clerk_user_id = $2`,
    [id, userId],
  );
  return (res.rowCount ?? 0) > 0;
}
